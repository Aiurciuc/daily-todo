import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE_POOL = Symbol('DATABASE_POOL');
const logger = new Logger('Database');

class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool => {
        const port = Number(process.env.DB_PORT ?? 5432);
        const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
        const missing = required.filter((key) => !process.env[key]);
        if (missing.length > 0) throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid TCP port');
        const pool = new Pool({
          host: process.env.DB_HOST,
          port,
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          max: 5,
          connectionTimeoutMillis: 1500,
          idleTimeoutMillis: 10000,
          statement_timeout: 2000,
          application_name: 'local-todo-api',
        });
        pool.on('error', () => logger.warn('An idle database connection encountered an error'));
        return pool;
      },
    },
    DatabaseShutdown,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
