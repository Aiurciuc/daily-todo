import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { TaskDetails, TaskFilters } from './task.types';

@Injectable()
export class TasksRepository {
  constructor(private readonly database: DatabaseService) {}

  findByDay(date: Date, filters: TaskFilters = {}): Promise<Task[]> {
    return this.database.task.findMany({
      where: { date, ...filters },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  findByRange(from: Date, to: Date, filters: TaskFilters): Promise<Task[]> {
    return this.database.task.findMany({
      where: { date: { gte: from, lt: to }, ...filters },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
  }

  create(title: string, date: Date, details?: TaskDetails): Promise<Task> {
    return this.database.$transaction(
      async (transaction) => {
        const last = await transaction.task.aggregate({
          where: { date },
          _max: { position: true },
        });
        return transaction.task.create({
          data: {
            title,
            date,
            position: (last._max.position ?? -1) + 1,
            ...details,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  reorder(date: Date, ids: number[]): Promise<Task[]> {
    return this.database.$transaction(
      async (transaction) => {
        const tasks = await transaction.task.findMany({ where: { date } });
        const byId = new Map(tasks.map((task) => [task.id, task]));
        if (
          tasks.length !== ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !byId.has(id))
        ) {
          throw new ConflictException('Tasks changed. Reload and try again.');
        }
        for (const [position, id] of ids.entries()) {
          await transaction.task.update({ where: { id }, data: { position } });
        }
        return ids.map((id, position) => ({ ...byId.get(id)!, position }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  update(id: number, title: string, date: Date, details: TaskDetails): Promise<Task> {
    return this.database.$transaction(
      async (transaction) => {
        const current = await transaction.task.findUniqueOrThrow({ where: { id } });
        let position = current.position;
        if (current.date.getTime() !== date.getTime()) {
          const last = await transaction.task.aggregate({
            where: { date },
            _max: { position: true },
          });
          position = (last._max.position ?? -1) + 1;
        }
        return transaction.task.update({
          where: { id },
          data: { title, date, position, ...details },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  remove(id: number): Promise<Task> {
    return this.database.task.delete({ where: { id } });
  }

  setCompleted(id: number, completed: boolean): Promise<Task> {
    return this.database.task.update({
      where: { id },
      data: { completed },
    });
  }
}
