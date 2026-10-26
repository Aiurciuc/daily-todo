import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskVisibility } from '@prisma/client';
import { CreateTaskDto, TaskListQueryDto } from './dto/task-request.dto';
import { parseDay } from './task-date';
import { TaskDetails, TaskFilters } from './task.types';
import { TaskResponseDto } from './dto/task-response.dto';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(private readonly tasks: TasksRepository) {}

  async list(ownerId: number, date: Date, filters: TaskFilters = {}): Promise<TaskResponseDto[]> {
    return (await this.tasks.findByDay(ownerId, date, filters)).map((task) => new TaskResponseDto(task, ownerId));
  }

  async listCalendar(ownerId: number, query: TaskListQueryDto): Promise<TaskResponseDto[]> {
    const filters: TaskFilters = {};
    if (query.visibility !== undefined) filters.visibility = query.visibility;
    if (query.completed !== undefined) filters.completed = query.completed;
    if (query.date !== undefined && query.from === undefined && query.to === undefined) {
      return this.list(ownerId, parseDay(query.date), filters);
    }
    if (query.date !== undefined || query.from === undefined || query.to === undefined) {
      throw new BadRequestException('Provide either date, or both from and to (not both modes)');
    }
    const from = parseDay(query.from);
    const to = parseDay(query.to);
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days < 1 || days > 366) {
      throw new BadRequestException('Range must span 1 to 366 days; to is exclusive');
    }
    return (await this.tasks.findByRange(ownerId, from, to, filters)).map(
      (task) => new TaskResponseDto(task, ownerId),
    );
  }

  async create(
    ownerId: number,
    title: string,
    date: Date,
    input: Partial<CreateTaskDto> = {},
  ): Promise<TaskResponseDto> {
    return new TaskResponseDto(await this.tasks.create(ownerId, title, date, this.details(input)), ownerId);
  }

  async update(ownerId: number, id: number, input: CreateTaskDto): Promise<TaskResponseDto> {
    return new TaskResponseDto(
      await this.tasks.update(ownerId, id, input.title, parseDay(input.date), this.details(input)),
      ownerId,
    );
  }

  async remove(ownerId: number, id: number): Promise<void> {
    await this.tasks.remove(ownerId, id);
  }

  private details(input: Partial<CreateTaskDto>): TaskDetails {
    const startMinute = input.startMinute ?? null;
    const durationMinutes = input.durationMinutes ?? null;
    if ((startMinute === null) !== (durationMinutes === null)) {
      throw new BadRequestException(
        'startMinute and durationMinutes must both be set or both be null',
      );
    }
    if (startMinute !== null && durationMinutes !== null && startMinute + durationMinutes > 1440) {
      throw new BadRequestException('Scheduled tasks must end within their calendar date');
    }
    const details: TaskDetails = {
      startMinute,
      durationMinutes,
      visibility: input.visibility ?? TaskVisibility.PRIVATE,
      notes: input.notes ?? null,
      sharedWith: input.sharedWith ?? null,
    };
    return details;
  }

  async reorder(ownerId: number, date: Date, ids: number[]): Promise<TaskResponseDto[]> {
    return (await this.tasks.reorder(ownerId, date, ids)).map((task) => new TaskResponseDto(task, ownerId));
  }

  async setCompleted(ownerId: number, id: number, completed: boolean): Promise<TaskResponseDto> {
    return new TaskResponseDto(await this.tasks.setCompleted(ownerId, id, completed), ownerId);
  }
}
