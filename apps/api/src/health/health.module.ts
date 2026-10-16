import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
