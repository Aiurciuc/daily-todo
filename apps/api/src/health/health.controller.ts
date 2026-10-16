import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { api: 'ok' } {
    return { api: 'ok' };
  }

  @Get('ready')
  ready(): Promise<{ api: 'ok'; database: 'ok' }> {
    return this.health.ready();
  }
}
