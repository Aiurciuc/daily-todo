import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request, Response, CookieOptions } from 'express';
import { authConfig } from './auth.config';
import { LoginDto, RegisterDto, UserResponseDto } from './auth.dto';
import { AuthRateLimitGuard, CurrentUser, readSession, RequestSecurityGuard, SESSION_COOKIE, SessionGuard } from './auth.guards';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
@ApiBadRequestResponse({ description: 'Invalid input' })
@ApiForbiddenResponse({ description: 'Missing or cross-origin Origin header on a write' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.secureCookie, path: '/api' };
  }

  private async setSession(
    session: Awaited<ReturnType<AuthService['login']>>,
    request: Request,
    response: Response,
  ): Promise<UserResponseDto> {
    // Replace any previous browser session rather than leaving it reusable.
    await this.auth.logout(readSession(request));
    response.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(), expires: session.expiresAt,
      maxAge: this.config.sessionTtlSeconds * 1000,
    });
    return session.user;
  }

  @Post('register')
  @UseGuards(RequestSecurityGuard, AuthRateLimitGuard)
  @ApiOperation({ summary: 'Register and start an opaque cookie session' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Authentication rate limit exceeded' })
  @ApiResponse({ status: 415, description: 'application/json required' })
  async register(@Body() input: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<UserResponseDto> {
    return this.setSession(await this.auth.register(input), request, response);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RequestSecurityGuard, AuthRateLimitGuard)
  @ApiOperation({ summary: 'Log in and start an opaque cookie session' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Authentication rate limit exceeded' })
  @ApiResponse({ status: 415, description: 'application/json required' })
  async login(@Body() input: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<UserResponseDto> {
    return this.setSession(await this.auth.login(input), request, response);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth('daily_todo_session')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing, expired or invalid session' })
  me(@CurrentUser() user: UserResponseDto): UserResponseDto {
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(RequestSecurityGuard)
  @ApiCookieAuth('daily_todo_session')
  @ApiNoContentResponse({ description: 'Session revoked and cookie cleared (idempotent)' })
  @ApiResponse({ status: 415, description: 'application/json required' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(readSession(request));
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }
}
