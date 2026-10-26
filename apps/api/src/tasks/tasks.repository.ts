import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, Task, TaskVisibility } from '@prisma/client';
import { isEmail } from 'class-validator';
import { DatabaseService } from '../database/database.service';
import { TaskDetails, TaskFilters } from './task.types';

@Injectable()
export class TasksRepository {
  constructor(private readonly database: DatabaseService) {}

  private requireOwner(ownerId: number): void {
    // Prisma ignores undefined filters; fail closed even for accidental internal misuse.
    if (!Number.isSafeInteger(ownerId) || ownerId < 1) throw new UnauthorizedException();
  }

  // Resolve grants inside the write transaction, never from a client-supplied ID.
  private async sharing(
    transaction: Prisma.TransactionClient,
    ownerId: number,
    details?: TaskDetails,
  ): Promise<{ sharedWith: string | null; recipientId: number | null }> {
    if (details?.visibility !== TaskVisibility.SHARED) {
      return { sharedWith: null, recipientId: null };
    }
    const email = typeof details.sharedWith === 'string' ? details.sharedWith.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !isEmail(email)) {
      throw new BadRequestException('SHARED tasks require a valid recipient email (maximum 254 characters)');
    }
    const recipient = await transaction.user.findUnique({ where: { email }, select: { id: true } });
    if (!recipient) throw new BadRequestException('Recipient email must belong to a registered user');
    if (recipient.id === ownerId) throw new BadRequestException('Cannot share a task with yourself');
    return { sharedWith: email, recipientId: recipient.id };
  }

  private metadata(details?: TaskDetails): Partial<TaskDetails> {
    if (!details) return {};
    // Explicitly pick writable metadata; even internal callers cannot inject ownership/grants.
    return {
      startMinute: details.startMinute,
      durationMinutes: details.durationMinutes,
      visibility: details.visibility,
      notes: details.notes,
    };
  }

  findByDay(ownerId: number, date: Date, filters: TaskFilters = {}): Promise<Task[]> {
    this.requireOwner(ownerId);
    return this.database.task.findMany({
      where: { date, ...filters, OR: [{ ownerId }, { visibility: TaskVisibility.SHARED, recipientId: ownerId }] },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  findByRange(ownerId: number, from: Date, to: Date, filters: TaskFilters): Promise<Task[]> {
    this.requireOwner(ownerId);
    return this.database.task.findMany({
      where: { date: { gte: from, lt: to }, ...filters, OR: [{ ownerId }, { visibility: TaskVisibility.SHARED, recipientId: ownerId }] },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
  }

  create(ownerId: number, title: string, date: Date, details?: TaskDetails): Promise<Task> {
    this.requireOwner(ownerId);
    return this.database.$transaction(
      async (transaction) => {
        const sharing = await this.sharing(transaction, ownerId, details);
        const last = await transaction.task.aggregate({
          where: { date, ownerId },
          _max: { position: true },
        });
        return transaction.task.create({
          data: {
            title,
            date,
            position: (last._max.position ?? -1) + 1,
            ...this.metadata(details),
            ...sharing,
            ownerId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  reorder(ownerId: number, date: Date, ids: number[]): Promise<Task[]> {
    this.requireOwner(ownerId);
    return this.database.$transaction(
      async (transaction) => {
        const tasks = await transaction.task.findMany({ where: { date, ownerId } });
        const byId = new Map(tasks.map((task) => [task.id, task]));
        if (
          tasks.length !== ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !byId.has(id))
        ) {
          throw new ConflictException('Tasks changed. Reload and try again.');
        }
        for (const [position, id] of ids.entries()) {
          await transaction.task.update({ where: { id, ownerId }, data: { position } });
        }
        return ids.map((id, position) => ({ ...byId.get(id)!, position }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  update(ownerId: number, id: number, title: string, date: Date, details: TaskDetails): Promise<Task> {
    this.requireOwner(ownerId);
    return this.database.$transaction(
      async (transaction) => {
        const current = await transaction.task.findUniqueOrThrow({ where: { id, ownerId } });
        const sharing = await this.sharing(transaction, ownerId, details);
        let position = current.position;
        if (current.date.getTime() !== date.getTime()) {
          const last = await transaction.task.aggregate({
            where: { date, ownerId },
            _max: { position: true },
          });
          position = (last._max.position ?? -1) + 1;
        }
        return transaction.task.update({
          where: { id, ownerId },
          data: { title, date, position, ...this.metadata(details), ...sharing },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  remove(ownerId: number, id: number): Promise<Task> {
    this.requireOwner(ownerId);
    return this.database.task.delete({ where: { id, ownerId } });
  }

  setCompleted(ownerId: number, id: number, completed: boolean): Promise<Task> {
    this.requireOwner(ownerId);
    return this.database.task.update({
      where: { id, ownerId },
      data: { completed },
    });
  }
}
