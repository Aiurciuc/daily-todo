import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly database: DatabaseService) {}

  async ready(): Promise<{ api: 'ok'; database: 'ok' }> {
    try {
      await this.database.$queryRaw`SELECT 1`;
      return { api: 'ok', database: 'ok' };
    } catch {
      this.logger.warn('Database readiness probe failed');
      throw new ServiceUnavailableException({ api: 'ok', database: 'unavailable' });
    }
  }
}
