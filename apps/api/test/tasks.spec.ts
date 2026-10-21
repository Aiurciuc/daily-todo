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
  id: 1,
  title: 'First',
  date: new Date('0001-01-01T00:00:00.000Z'),
  completed: false,
  position: 0,
  ...taskDetails,
};

function databaseMock() {
  const client = {
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
      where: { ownerId, date: task.date },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    await repository.create(ownerId, task.title, task.date);
    expect(database.task.create).toHaveBeenLastCalledWith({
      data: { title: task.title, date: task.date, position: 0, ownerId },
    });
    database.task.aggregate.mockResolvedValue({ _max: { position: 4 } });
    await repository.create(ownerId, task.title, task.date);
    expect(database.task.create).toHaveBeenLastCalledWith({
      data: { title: task.title, date: task.date, position: 5, ownerId },
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
      where: { ownerId, date: { gte: task.date, lt: to }, completed: false },
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
      data: { title: 'Edited', date, position: 0, ...taskDetails },
    });
    expect(await repository.remove(ownerId, task.id)).toEqual(task);
    expect(database.task.delete).toHaveBeenCalledWith({ where: { id: task.id, ownerId } });
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
