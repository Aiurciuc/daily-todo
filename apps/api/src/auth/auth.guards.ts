import {
  CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus,
  Inject, Injectable, UnsupportedMediaTypeException, createParamDecorator,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { authConfig } from './auth.config';
import { AuthService } from './auth.service';
import { UserResponseDto } from './auth.dto';

export const SESSION_COOKIE = 'daily_todo_session';
type AuthenticatedRequest = Request & { user: UserResponseDto };

export function readSession(request: Request): string | undefined {
  const cookies = (request.headers.cookie ?? '').split(';').map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(SESSION_COOKIE + '='));
  if (matches.length !== 1) return undefined;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

@Injectable()
export class RequestSecurityGuard implements CanActivate {
  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    this.check(context.switchToHttp().getRequest<Request>(), true);
    return true;
  }

  check(request: Request, authWrite = false): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    // Never trust X-Forwarded-* from arbitrary clients. Deployments behind a
    // reverse proxy must configure the exact public AUTH_ORIGIN.
    const expected = this.config.origin ?? `${request.protocol}://${request.get('host')}`;
    if (request.headers.origin !== expected) throw new ForbiddenException('Invalid request origin');
    if (authWrite && !request.is('application/json')) {
      throw new UnsupportedMediaTypeException('Auth writes require application/json');
    }
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly security: RequestSecurityGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.auth.authenticate(readSession(request));
    this.security.check(request);
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserResponseDto =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  // Per-process limiter; use a shared edge limiter when deploying multiple API replicas.
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    for (const [key, bucket] of this.attempts) {
      if (bucket.resetAt <= now) this.attempts.delete(key);
    }
    // Only explicitly trusted edge peers may supply a single validated client IP.
    // The edge MUST overwrite X-Forwarded-For, not append an untrusted chain.
    const peer = request.socket.remoteAddress ?? 'unknown';
    const forwarded = request.headers['x-forwarded-for'];
    const key = this.config.trustedProxyIps.includes(peer) && typeof forwarded === 'string' && isIP(forwarded)
      ? forwarded : peer;
    let bucket = this.attempts.get(key);
    if (!bucket) {
      if (this.attempts.size >= 10000) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      bucket = { count: 0, resetAt: now + 60000 };
      this.attempts.set(key, bucket);
    }
    if (++bucket.count > 10) {
      throw new HttpException('Too many authentication attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
