import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { authConfig } from './auth.config';
import { AuthRepository } from './auth.repository';
import { LoginDto, RegisterDto, UserResponseDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';

// Constant valid dummy hash makes unknown-account attempts perform the same KDF work.
const dummyHash = 'scrypt$' + '0'.repeat(32) + '$' + '0'.repeat(128);
export const sessionHash = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async register(input: RegisterDto) {
    const passwordHash = await hashPassword(input.password);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000);
    try {
      const user = await this.repository.createUserWithSession(
        input.name, input.email, passwordHash, sessionHash(token), expiresAt,
      );
      return { user: new UserResponseDto(user), token, expiresAt };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const user = await this.repository.findUser(input.email);
    const valid = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    return this.issueSession(user);
  }

  private async issueSession(user: { id: number; name: string; email: string }) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000);
    await this.repository.createSession(sessionHash(token), user.id, expiresAt);
    return { user: new UserResponseDto(user), token, expiresAt };
  }

  async authenticate(token: string | undefined): Promise<UserResponseDto> {
    if (!token) throw new UnauthorizedException();
    const session = await this.repository.findSession(sessionHash(token));
    if (!session) throw new UnauthorizedException();
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.repository.deleteSession(sessionHash(token));
      throw new UnauthorizedException();
    }
    return new UserResponseDto(session.user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.repository.deleteSession(sessionHash(token));
  }
}
