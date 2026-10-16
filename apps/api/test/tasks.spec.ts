import { describe, expect, it, vi } from 'vitest';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import { TasksRepository } from '../src/tasks/tasks.repository';
import { TasksService } from '../src/tasks/tasks.service';
import { parseDay } from '../src/tasks/task-date';
import { taskDetails } from './fixtures/task.fixture';

const task = {
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
      update: vi.fn().mockResolvedValue({ ...task, completed: true }),
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
  it('orders reads and appends new tasks inside a serializable transaction', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    expect(await repository.findByDay(task.date)).toEqual([task]);
    expect(database.task.findMany).toHaveBeenCalledWith({
      where: { date: task.date },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    await repository.create(task.title, task.date);
    expect(database.task.create).toHaveBeenLastCalledWith({
      data: { title: task.title, date: task.date, position: 0 },
    });
    database.task.aggregate.mockResolvedValue({ _max: { position: 4 } });
    await repository.create(task.title, task.date);
    expect(database.task.create).toHaveBeenLastCalledWith({
      data: { title: task.title, date: task.date, position: 5 },
    });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('loads calendar ranges with stable chronological order and creates schedule metadata', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const to = parseDay('0001-01-08');
    await repository.findByRange(task.date, to, { completed: false });
    expect(database.task.findMany).toHaveBeenCalledWith({
      where: { date: { gte: task.date, lt: to }, completed: false },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
    const details = {
      ...taskDetails,
      startMinute: 540,
      durationMinutes: 60,
    };
    await repository.create(task.title, task.date, details);
    expect(database.task.create).toHaveBeenCalledWith({
      data: {
        title: task.title,
        date: task.date,
        position: 0,
        ...details,
      },
    });
  });

  it('updates positions atomically and rejects missing, duplicate or foreign task IDs before writing', async () => {
    const second = { ...task, id: 2, title: 'Second', position: 1 };
    const database = databaseMock();
    database.task.findMany.mockResolvedValue([task, second]);
    const repository = new TasksRepository(database as unknown as DatabaseService);
    expect(await repository.reorder(task.date, [2, 1])).toEqual([
      { ...second, position: 0 },
      { ...task, position: 1 },
    ]);
    expect(database.task.update).toHaveBeenNthCalledWith(1, {
      where: { id: 2 },
      data: { position: 0 },
    });
    expect(database.task.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1 },
      data: { position: 1 },
    });
    database.task.update.mockClear();
    for (const ids of [[1], [1, 1], [1, 3]]) {
      await expect(repository.reorder(task.date, ids)).rejects.toThrow(ConflictException);
    }
    expect(database.task.update).not.toHaveBeenCalled();
  });

  it('persists explicit completion and propagates failures to the exception filter', async () => {
    const database = databaseMock();
    const repository = new TasksRepository(database as unknown as DatabaseService);
    expect(await repository.setCompleted(1, true)).toMatchObject({ completed: true });
    expect(database.task.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { completed: true },
    });
    const error = new Error('database failure');
    database.task.update.mockRejectedValue(error);
    await expect(repository.setCompleted(1, true)).rejects.toBe(error);
  });
});

describe('TasksService', () => {
  it('resolves repository injection and maps database models to public response DTOs', async () => {
    const repository = {
      findByDay: vi.fn().mockResolvedValue([task]),
      create: vi.fn().mockResolvedValue(task),
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
      expect(await service.list(task.date)).toEqual([expected]);
      expect(await service.create(task.title, task.date)).toEqual(expected);
      expect(await service.reorder(task.date, [1])).toEqual([expected]);
      expect(await service.setCompleted(1, true)).toEqual({ ...expected, completed: true });
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
