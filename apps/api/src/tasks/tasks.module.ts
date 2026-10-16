import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TasksRepository } from './tasks.repository';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
