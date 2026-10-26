import { describe, expect, it, vi } from 'vitest';
import { ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import { TasksRepository } from '../src/tasks/tasks.repository';
import { TasksService } from '../src/tasks/tasks.service';
import { parseDay } from '../src/tasks/task-date';
import { taskDetails } from './fixtures/task.fixture';

const ownerId = 7;
const task = {
  ownerId,
  recipientId: null,
  id: 1,
  title: 'First',
  date: new Date('0001-01-01T00:00:00.000Z'),
  completed: false,
  position: 0,
  ...taskDetails,
};

function databaseMock() {
  const client = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 8 }) },
    task: {
      findMany: vi.fn().mockResolvedValue([task]),
      aggregate: vi.fn().mockResolvedValue({ _max: { position: null } }),
      create: vi.fn().mockResolvedValue(task),
      findUniqueOrThrow: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue({ ...task, completed: true }),
      delete: vi.fn().mockResolvedValue(task),
    },
  };
  return {
    ...client,
    $transaction: vi.fn(async (work: (transaction: typeof client) => Promise<unknown>) =>
      work(client),
    ),
  };
}

describe('TasksRepository', () => {
  it('fails closed before Prisma when an internal caller supplies an invalid owner', () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    for (const invalid of [undefined, null, 0, -1, 1.5, NaN]) {
      const owner = invalid as unknown as number;
      for (const operation of [
        () => repository.findByDay(owner, task.date),
        () => repository.findByRange(owner, task.date, task.date, {}),
        () => repository.create(owner, task.title, task.date),
        () => repository.update(owner, task.id, task.title, task.date, taskDetails),
        () => repository.remove(owner, task.id),
        () => repository.setCompleted(owner, task.id, true),
        () => repository.reorder(owner, task.date, []),
      ]) expect(operation).toThrow(UnauthorizedException);
    }
    expect(database.$transaction).not.toHaveBeenCalled();
    for (const operation of Object.values(database.task)) expect(operation).not.toHaveBeenCalled();
  });

  it('orders reads and appends new tasks inside a serializable transaction', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    expect(await repository.findByDay(ownerId, task.date)).toEqual([task]);
    expect(database.task.findMany).toHaveBeenCalledWith({
      where: { OR: [{ ownerId }, { visibility: 'SHARED', recipientId: ownerId }], date: task.date },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    await repository.create(ownerId, task.title, task.date);
    expect(database.task.create).toHaveBeenLastCalledWith({
      data: { title: task.title, date: task.date, position: 0, ownerId, sharedWith: null, recipientId: null },
    });
    database.task.aggregate.mockResolvedValue({ _max: { position: 4 } });
    await repository.create(ownerId, task.title, task.date);
    expect(database.task.create).toHaveBeenLastCalledWith({
      data: { title: task.title, date: task.date, position: 5, ownerId, sharedWith: null, recipientId: null },
    });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(database.task.aggregate).toHaveBeenCalledWith({
      where: { ownerId, date: task.date },
      _max: { position: true },
    });
  });

  it('loads calendar ranges with stable chronological order and creates schedule metadata', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const to = parseDay('0001-01-08');
    await repository.findByRange(ownerId, task.date, to, { completed: false });
    expect(database.task.findMany).toHaveBeenCalledWith({
      where: { OR: [{ ownerId }, { visibility: 'SHARED', recipientId: ownerId }], date: { gte: task.date, lt: to }, completed: false },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
    const details = {
      ...taskDetails,
      startMinute: 540,
      durationMinutes: 60,
    };
    await repository.create(ownerId, task.title, task.date, details);
    expect(database.task.create).toHaveBeenCalledWith({
      data: {
        title: task.title,
        date: task.date,
        position: 0,
        ...details,
        recipientId: null,
        ownerId,
      },
    });
  });

  it('updates positions atomically and rejects missing, duplicate or foreign task IDs before writing', async () => {
    const second = { ...task, id: 2, title: 'Second', position: 1 };
    const database = databaseMock();
    database.task.findMany.mockResolvedValue([task, second]);
    const repository = new TasksRepository(database as unknown as DatabaseService);
    expect(await repository.reorder(ownerId, task.date, [2, 1])).toEqual([
      { ...second, position: 0 },
      { ...task, position: 1 },
    ]);
    expect(database.task.findMany).toHaveBeenCalledWith({ where: { ownerId, date: task.date } });
    expect(database.task.update).toHaveBeenNthCalledWith(1, {
      where: { id: 2, ownerId },
      data: { position: 0 },
    });
    expect(database.task.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1, ownerId },
      data: { position: 1 },
    });
    database.task.update.mockClear();
    for (const ids of [[1], [1, 1], [1, 3]]) {
      await expect(repository.reorder(ownerId, task.date, ids)).rejects.toThrow(ConflictException);
    }
    expect(database.task.update).not.toHaveBeenCalled();
  });

  it('scopes editing, destination ordering and deletion to the owner', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const date = parseDay('0001-01-02');
    await repository.update(ownerId, task.id, 'Edited', date, taskDetails);
    expect(database.task.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: task.id, ownerId },
    });
    expect(database.task.aggregate).toHaveBeenCalledWith({
      where: { ownerId, date },
      _max: { position: true },
    });
    expect(database.task.update).toHaveBeenCalledWith({
      where: { id: task.id, ownerId },
      data: { title: 'Edited', date, position: 0, ...taskDetails, recipientId: null },
    });
    expect(await repository.remove(ownerId, task.id)).toEqual(task);
    expect(database.task.delete).toHaveBeenCalledWith({ where: { id: task.id, ownerId } });
  });

  it('resolves normalized emails inside create/update transactions and ignores injected grants', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const details = {
      ...taskDetails, visibility: 'SHARED' as const, sharedWith: '  BOB@Example.COM  ',
      recipientId: 99, ownerId: 99,
    };
    await repository.create(ownerId, task.title, task.date, details);
    expect(database.user.findUnique).toHaveBeenCalledWith({ where: { email: 'bob@example.com' }, select: { id: true } });
    expect(database.task.create).toHaveBeenCalledWith({ data: {
      ...taskDetails, title: task.title, date: task.date, position: 0, ownerId,
      visibility: 'SHARED', sharedWith: 'bob@example.com', recipientId: 8,
    } });
    database.user.findUnique.mockResolvedValue({ id: 9 });
    await repository.update(ownerId, task.id, 'Updated', task.date, { ...details, sharedWith: ' CAROL@example.com ' });
    expect(database.task.update).toHaveBeenCalledWith({ where: { id: task.id, ownerId }, data: {
      ...taskDetails, title: 'Updated', date: task.date, position: 0,
      visibility: 'SHARED', sharedWith: 'carol@example.com', recipientId: 9,
    } });
    expect(database.$transaction).toHaveBeenCalledTimes(2);
    expect(database.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('rejects invalid, missing, unregistered and self recipients before any write', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const invalidEmails = [null, '', ' ', 'Design Team', 'bob@', `${'x'.repeat(243)}@example.com`];
    for (const sharedWith of invalidEmails) {
      const details = { ...taskDetails, visibility: 'SHARED' as const, sharedWith };
      await expect(repository.create(ownerId, task.title, task.date, details)).rejects.toThrow(BadRequestException);
      await expect(repository.update(ownerId, task.id, task.title, task.date, details)).rejects.toThrow(BadRequestException);
    }
    expect(database.user.findUnique).not.toHaveBeenCalled();
    const details = { ...taskDetails, visibility: 'SHARED' as const, sharedWith: 'bob@example.com' };
    database.user.findUnique.mockResolvedValue(null as unknown as { id: number });
    await expect(repository.create(ownerId, task.title, task.date, details)).rejects.toThrow('registered user');
    await expect(repository.update(ownerId, task.id, task.title, task.date, details)).rejects.toThrow('registered user');
    database.user.findUnique.mockResolvedValue({ id: ownerId });
    await expect(repository.create(ownerId, task.title, task.date, details)).rejects.toThrow('yourself');
    await expect(repository.update(ownerId, task.id, task.title, task.date, details)).rejects.toThrow('yourself');
    expect(database.task.create).not.toHaveBeenCalled();
    expect(database.task.update).not.toHaveBeenCalled();
  });

  it('accepts a valid 254-character email after trimming and lowercasing', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
    expect(email).toHaveLength(254);
    await repository.create(ownerId, task.title, task.date, {
      ...taskDetails, visibility: 'SHARED', sharedWith: `  ${email.toUpperCase()}  `,
    });
    expect(database.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sharedWith: email, recipientId: 8 }),
    });
  });

  it('clears email and recipient on PRIVATE writes, even with injected grant fields', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const details = { ...taskDetails, sharedWith: 'bob@example.com', recipientId: 8 };
    await repository.create(ownerId, task.title, task.date, details);
    await repository.update(ownerId, task.id, task.title, task.date, details);
    expect(database.task.create).toHaveBeenCalledWith({ data: {
      ...taskDetails, title: task.title, date: task.date, position: 0, ownerId, recipientId: null,
    } });
    expect(database.task.update).toHaveBeenCalledWith({ where: { id: task.id, ownerId }, data: {
      ...taskDetails, title: task.title, date: task.date, position: 0, recipientId: null,
    } });
    expect(database.user.findUnique).not.toHaveBeenCalled();
  });

  it('persists explicit completion and propagates failures to the exception filter', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    expect(await repository.setCompleted(ownerId, 1, true)).toMatchObject({ completed: true });
    expect(database.task.update).toHaveBeenCalledWith({
      where: { id: 1, ownerId },
      data: { completed: true },
    });
    const error = new Error('database failure');
    database.task.update.mockRejectedValue(error);
    await expect(repository.setCompleted(ownerId, 1, true)).rejects.toBe(error);
  });
});

describe('TasksService', () => {
  it('computes read-only DTOs from the actor, without leaking ownership or grant IDs', async () => {
    const shared = { ...task, recipientId: 8, visibility: 'SHARED', sharedWith: 'bob@example.com' };
    const repository = {
      findByDay: vi.fn().mockResolvedValue([shared]),
      findByRange: vi.fn().mockResolvedValue([shared]),
    };
    const service = new TasksService(repository as unknown as TasksRepository);
    for (const rows of [
      await service.list(8, task.date),
      await service.listCalendar(8, { from: '0001-01-01', to: '0001-01-08' }),
    ]) {
      expect(rows[0]).toMatchObject({ id: task.id, canEdit: false });
      expect(rows[0]).not.toHaveProperty('ownerId');
      expect(rows[0]).not.toHaveProperty('recipientId');
    }
    expect((await service.list(ownerId, task.date))[0].canEdit).toBe(true);
  });

  it('resolves repository injection and maps database models to public response DTOs', async () => {
    const repository = {
      findByDay: vi.fn().mockResolvedValue([task]),
      findByRange: vi.fn().mockResolvedValue([task]),
      create: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue(task),
      remove: vi.fn().mockResolvedValue(task),
      reorder: vi.fn().mockResolvedValue([task]),
      setCompleted: vi.fn().mockResolvedValue({ ...task, completed: true }),
    };
    const module = await Test.createTestingModule({
      providers: [TasksService, { provide: TasksRepository, useValue: repository }],
    }).compile();
    try {
      const service = module.get(TasksService);
      const expected = {
        id: 1,
        title: 'First',
        date: '0001-01-01',
        completed: false,
        canEdit: true,
        ...taskDetails,
      };
      expect(await service.list(ownerId, task.date)).toEqual([expected]);
      expect(await service.create(ownerId, task.title, task.date)).toEqual(expected);
      expect(await service.reorder(ownerId, task.date, [1])).toEqual([expected]);
      expect(await service.setCompleted(ownerId, 1, true)).toEqual({ ...expected, completed: true });
      expect(repository.findByDay).toHaveBeenCalledWith(ownerId, task.date, {});
      expect(repository.create).toHaveBeenCalledWith(ownerId, task.title, task.date, taskDetails);
      expect(repository.reorder).toHaveBeenCalledWith(ownerId, task.date, [1]);
      expect(repository.setCompleted).toHaveBeenCalledWith(ownerId, 1, true);
      expect(await service.listCalendar(ownerId, { date: '0001-01-01' })).toEqual([expected]);
      expect(await service.listCalendar(ownerId, { from: '0001-01-01', to: '0001-01-08' })).toEqual([expected]);
      expect(repository.findByRange).toHaveBeenCalledWith(ownerId, task.date, parseDay('0001-01-08'), {});
      expect(await service.update(ownerId, task.id, { title: task.title, date: '0001-01-01' })).toEqual(expected);
      expect(repository.update).toHaveBeenCalledWith(ownerId, task.id, task.title, task.date, taskDetails);
      expect(await service.remove(ownerId, task.id)).toBeUndefined();
      expect(repository.remove).toHaveBeenCalledWith(ownerId, task.id);
    } finally {
      await module.close();
    }
  });
});

describe('calendar day parsing', () => {
  it('accepts leap days and ancient years but rejects impossible dates', () => {
    expect(parseDay('0001-01-01').toISOString()).toBe('0001-01-01T00:00:00.000Z');
    expect(parseDay('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
    for (const day of ['0000-01-01', '2023-02-29', '2024-13-01', '2024-01-32', 'tomorrow']) {
      expect(() => parseDay(day)).toThrow(BadRequestException);
    }
  });
});
