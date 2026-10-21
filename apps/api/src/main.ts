import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { apiConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Daily Todo API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addCookieAuth('daily_todo_session', { type: 'apiKey' }, 'daily_todo_session')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, openApiDocument);

  const { port, host } = app.get<ConfigType<typeof apiConfig>>(apiConfig.KEY);
  await app.listen(port, host);
  logger.log(`API listening on ${host}:${port}`);
}

void bootstrap().catch(() => {
  // Do not log raw startup errors, which may contain database credentials.
  new Logger('Bootstrap').error('API startup failed. Check application configuration.');
  process.exitCode = 1;
});
