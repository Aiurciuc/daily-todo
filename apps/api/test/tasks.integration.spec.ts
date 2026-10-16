import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { databaseSettings, loadDatabaseEnvironment } from '../src/database/config';
import { DatabaseService } from '../src/database/database.service';
import { TasksRepository } from '../src/tasks/tasks.repository';
import { TaskVisibility } from '@prisma/client';
import { taskDetails } from './fixtures/task.fixture';

loadDatabaseEnvironment();
const settings = databaseSettings();
const testName = process.env.TEST_DB_NAME;
if (!testName || testName === settings.database || !/test/i.test(testName)) {
  throw new Error(
    'Set TEST_DB_NAME to a separate migrated disposable test database (name must contain "test")',
  );
}
const database = new PrismaClient({
  adapter: new PrismaPg(new Pool({ ...settings, database: testName }), {
    disposeExternalPool: true,
  }),
});

describe('real PostgreSQL task persistence (disposable test database only)', () => {
  beforeAll(async () => {
    await database.$connect();
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it('persists calendar metadata, range boundaries, filters and reorders', async () => {
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const date = new Date('2024-10-20T00:00:00.000Z');
    const end = new Date('2024-10-27T00:00:00.000Z');
    const title = `calendar-integration-${Date.now()}`;
    const ids: number[] = [];
    try {
      const shared = await repository.create(title, date, {
        ...taskDetails,
        startMinute: 570,
        durationMinutes: 90,
        visibility: TaskVisibility.SHARED,
        notes: 'Review layouts',
        sharedWith: 'Design Team',
      });
      ids.push(shared.id);
      const privateTask = await repository.create(title, date);
      ids.push(privateTask.id);
      const boundary = await repository.create(title, end);
      ids.push(boundary.id);
      const found = (
        await repository.findByRange(date, end, { visibility: TaskVisibility.SHARED })
      ).filter((task) => ids.includes(task.id));
      expect(found).toEqual([shared]);
      expect(await repository.setCompleted(shared.id, true)).toMatchObject({
        completed: true,
        startMinute: 570,
        notes: 'Review layouts',
      });
      const incomplete = await repository.findByRange(date, end, { completed: false });
      expect(incomplete.map((task) => task.id)).not.toContain(shared.id);
      expect(incomplete.map((task) => task.id)).not.toContain(boundary.id);
      expect(incomplete.map((task) => task.id)).toContain(privateTask.id);
      // Include every task on the date, even if another integration run left rows.
      const day = await repository.findByDay(date);
      const reordered = await repository.reorder(date, day.map((task) => task.id).reverse());
      expect(reordered.find((task) => task.id === shared.id)).toMatchObject({
        startMinute: 570,
        durationMinutes: 90,
        notes: 'Review layouts',
        completed: true,
      });
    } finally {
      await database.task.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('updates details, moves days in order, preserves completion and deletes', async () => {
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const originalDate = new Date('2031-02-03T00:00:00.000Z');
    const targetDate = new Date('2031-03-04T00:00:00.000Z');
    const created = await repository.create('Before edit', originalDate);
    const existing = await repository.create('Existing target task', targetDate);
    try {
      await repository.setCompleted(created.id, true);
      const updated = await repository.update(created.id, 'After edit', targetDate, {
        ...taskDetails,
        startMinute: 1439,
        durationMinutes: 1,
        notes: 'Saved edit',
      });
      expect(updated).toMatchObject({
        title: 'After edit',
        completed: true,
        date: targetDate,
        startMinute: 1439,
        durationMinutes: 1,
        notes: 'Saved edit',
      });
      expect(updated.position).toBeGreaterThan(existing.position);
      expect(
        (await repository.findByDay(originalDate)).some((task) => task.id === created.id),
      ).toBe(false);
      await repository.update(created.id, 'No schedule', targetDate, taskDetails);
      expect(await repository.remove(created.id)).toMatchObject({
        startMinute: null,
        durationMinutes: null,
        completed: true,
      });
      await expect(repository.remove(created.id)).rejects.toMatchObject({ code: 'P2025' });
    } finally {
      await database.task.deleteMany({ where: { id: { in: [created.id, existing.id] } } });
    }
  });

  it('enforces scheduling invariants in PostgreSQL even for direct database writes', async () => {
    const title = `invalid-calendar-integration-${Date.now()}`;
    const date = new Date('2024-10-21T00:00:00.000Z');
    try {
      for (const schedule of [
        { startMinute: 540, durationMinutes: null },
        { startMinute: null, durationMinutes: 60 },
        { startMinute: -1, durationMinutes: 60 },
        { startMinute: 1440, durationMinutes: 1 },
        { startMinute: 1439, durationMinutes: 2 },
        { startMinute: 540, durationMinutes: 0 },
      ]) {
        await expect(
          database.task.create({ data: { title, date, ...schedule } }),
        ).rejects.toThrow();
      }
      expect(await database.task.count({ where: { title } })).toBe(0);
    } finally {
      await database.task.deleteMany({ where: { title } });
    }
  });

  it('stores date-only tasks and persists an explicit completion state', async () => {
    const title = `integration-${Date.now()}`;
    const day = new Date('0001-01-01T00:00:00.000Z');
    const created = await database.task.create({ data: { title, date: day } });
    try {
      expect(created.date.toISOString().slice(0, 10)).toBe('0001-01-01');
      expect(created).toMatchObject({
        startMinute: null,
        durationMinutes: null,
        visibility: 'PRIVATE',
        notes: null,
      });
      const updated = await database.task.update({
        where: { id: created.id },
        data: { completed: true },
      });
      expect(updated.completed).toBe(true);
      const found = await database.task.findMany({ where: { date: day, id: created.id } });
      expect(found).toHaveLength(1);
      expect(found[0].completed).toBe(true);
    } finally {
      await database.task.delete({ where: { id: created.id } });
    }
  });
});
