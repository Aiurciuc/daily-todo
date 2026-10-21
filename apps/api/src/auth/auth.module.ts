import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { authConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthRateLimitGuard, RequestSecurityGuard, SessionGuard } from './auth.guards';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(authConfig)],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, RequestSecurityGuard, SessionGuard, AuthRateLimitGuard],
  exports: [SessionGuard, RequestSecurityGuard, AuthService],
})
export class AuthModule {}
