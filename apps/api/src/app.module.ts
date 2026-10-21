import { resolve } from 'node:path';
import { ClassSerializerInterceptor, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { apiConfig } from './config/app.config';
import { DatabaseExceptionFilter } from './database/database-exception.filter';
import { HealthModule } from './health/health.module';
import { TasksModule } from './tasks/tasks.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [resolve(__dirname, '../../../.env'), resolve(process.cwd(), '.env')],
      load: [apiConfig],
    }),
    HealthModule,
    AuthModule,
    TasksModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
          // Never coerce body booleans or IDs into valid values.
          transformOptions: { enableImplicitConversion: false },
        }),
    },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_FILTER, useClass: DatabaseExceptionFilter },
  ],
})
export class AppModule {}
