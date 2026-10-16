import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { databaseConfig } from '../config/app.config';

@Injectable()
export class DatabaseService extends PrismaClient implements OnApplicationShutdown {
  constructor(@Inject(databaseConfig.KEY) settings: ConfigType<typeof databaseConfig>) {
    const pool = new Pool({
      ...settings,
      max: 5,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 10000,
      statement_timeout: 2000,
      application_name: 'local-todo-api',
    });
    const logger = new Logger(DatabaseService.name);
    pool.on('error', () => logger.warn('An idle database connection encountered an error'));
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
