import { registerAs } from '@nestjs/config';
import { isIP } from 'node:net';

export function authSettings(environment: NodeJS.ProcessEnv = process.env) {
  const sessionTtlSeconds = Number(environment.AUTH_SESSION_TTL_SECONDS ?? 604800);
  if (!Number.isSafeInteger(sessionTtlSeconds) || sessionTtlSeconds < 60 || sessionTtlSeconds > 2592000) {
    throw new Error('AUTH_SESSION_TTL_SECONDS must be between 60 and 2592000');
  }
  const secure = environment.AUTH_COOKIE_SECURE;
  if (secure !== undefined && secure !== 'true' && secure !== 'false') {
    throw new Error('AUTH_COOKIE_SECURE must be true or false');
  }
  let origin: string | undefined;
  if (environment.AUTH_ORIGIN !== undefined) {
    const url = new URL(environment.AUTH_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== environment.AUTH_ORIGIN) {
      throw new Error('AUTH_ORIGIN must be an exact HTTP(S) origin without a trailing slash');
    }
    origin = url.origin;
  }
  const trustedProxyIps = environment.AUTH_TRUSTED_PROXY_IPS?.split(',').map((ip) => ip.trim()) ?? [];
  if (trustedProxyIps.some((ip) => !isIP(ip))) {
    throw new Error('AUTH_TRUSTED_PROXY_IPS must contain only exact IP addresses');
  }
  return {
    trustedProxyIps,
    sessionTtlSeconds,
    secureCookie: secure === undefined ? environment.NODE_ENV === 'production' : secure === 'true',
    origin,
  };
}

export const authConfig = registerAs('auth', () => authSettings());
