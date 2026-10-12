import { Controller, Get, HttpStatus, Inject, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get('live')
  live() {
    return { api: 'ok' };
  }

  @Get('ready')
  async ready(@Res() response: Response): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      response.status(HttpStatus.OK).json({ api: 'ok', database: 'ok' });
    } catch {
      this.logger.warn('Database readiness probe failed');
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ api: 'ok', database: 'unavailable' });
    }
  }
}
