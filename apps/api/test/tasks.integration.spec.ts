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
  let ownerId: number;
  let otherOwnerId: number;
  let recipientEmail: string;

  beforeAll(async () => {
    await database.$connect();
    const suffix = `${Date.now()}-${Math.random()}`;
    const owner = await database.user.create({
      data: { name: 'Task owner', email: `owner-${suffix}@example.com`, passwordHash: 'unused' },
    });
    ownerId = owner.id;
    const other = await database.user.create({
      data: { name: 'Other owner', email: `other-${suffix}@example.com`, passwordHash: 'unused' },
    });
    otherOwnerId = other.id;
    recipientEmail = other.email;
  });
  afterAll(async () => {
    try {
      const userIds = [ownerId, otherOwnerId].filter((id) => id !== undefined);
      await database.task.deleteMany({ where: { ownerId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await database.$disconnect();
    }
  });

  it('persists calendar metadata, range boundaries, filters and reorders', async () => {
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const date = new Date('2024-10-20T00:00:00.000Z');
    const end = new Date('2024-10-27T00:00:00.000Z');
    const title = `calendar-integration-${Date.now()}`;
    const ids: number[] = [];
    try {
      const shared = await repository.create(ownerId, title, date, {
        ...taskDetails,
        startMinute: 570,
        durationMinutes: 90,
        visibility: TaskVisibility.SHARED,
        notes: 'Review layouts',
        sharedWith: recipientEmail,
      });
      ids.push(shared.id);
      expect(shared).toMatchObject({ sharedWith: recipientEmail, recipientId: otherOwnerId });
      expect(await repository.findByDay(otherOwnerId, date)).toContainEqual(shared);
      expect(await repository.findByRange(otherOwnerId, date, end, { visibility: TaskVisibility.SHARED })).toContainEqual(shared);
      await expect(repository.update(otherOwnerId, shared.id, 'Stolen', date, taskDetails)).rejects.toMatchObject({ code: 'P2025' });
      await expect(repository.setCompleted(otherOwnerId, shared.id, true)).rejects.toMatchObject({ code: 'P2025' });
      await expect(repository.remove(otherOwnerId, shared.id)).rejects.toMatchObject({ code: 'P2025' });
      const privateTask = await repository.create(ownerId, title, date);
      ids.push(privateTask.id);
      const boundary = await repository.create(ownerId, title, end);
      ids.push(boundary.id);
      const found = (
        await repository.findByRange(ownerId, date, end, { visibility: TaskVisibility.SHARED })
      ).filter((task) => ids.includes(task.id));
      expect(found).toEqual([shared]);
      expect(await repository.setCompleted(ownerId, shared.id, true)).toMatchObject({
        completed: true,
        startMinute: 570,
        notes: 'Review layouts',
      });
      const incomplete = await repository.findByRange(ownerId, date, end, { completed: false });
      expect(incomplete.map((task) => task.id)).not.toContain(shared.id);
      expect(incomplete.map((task) => task.id)).not.toContain(boundary.id);
      expect(incomplete.map((task) => task.id)).toContain(privateTask.id);
      expect((await repository.findByRange(otherOwnerId, date, end, { completed: true })).map((task) => task.id)).toContain(shared.id);
      expect((await repository.findByDay(otherOwnerId, date, { completed: false })).map((task) => task.id)).not.toContain(shared.id);
      // Reorder only this user’s tasks on the date.
      const day = await repository.findByDay(ownerId, date);
      const reordered = await repository.reorder(ownerId, date, day.map((task) => task.id).reverse());
      expect(reordered.find((task) => task.id === shared.id)).toMatchObject({
        startMinute: 570,
        durationMinutes: 90,
        notes: 'Review layouts',
        completed: true,
      });
      const unshared = await repository.update(ownerId, shared.id, title, date, taskDetails);
      expect(unshared).toMatchObject({ recipientId: null, sharedWith: null });
      expect((await repository.findByDay(otherOwnerId, date)).map((task) => task.id)).not.toContain(shared.id);
    } finally {
      await database.task.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('updates details, moves days in order, preserves completion and deletes', async () => {
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const originalDate = new Date('2031-02-03T00:00:00.000Z');
    const targetDate = new Date('2031-03-04T00:00:00.000Z');
    const created = await repository.create(ownerId, 'Before edit', originalDate);
    const existing = await repository.create(ownerId, 'Existing target task', targetDate);
    try {
      await repository.setCompleted(ownerId, created.id, true);
      const updated = await repository.update(ownerId, created.id, 'After edit', targetDate, {
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
        (await repository.findByDay(ownerId, originalDate)).some((task) => task.id === created.id),
      ).toBe(false);
      await repository.update(ownerId, created.id, 'No schedule', targetDate, taskDetails);
      expect(await repository.remove(ownerId, created.id)).toMatchObject({
        startMinute: null,
        durationMinutes: null,
        completed: true,
      });
      await expect(repository.remove(ownerId, created.id)).rejects.toMatchObject({ code: 'P2025' });
    } finally {
      await database.task.deleteMany({ where: { id: { in: [created.id, existing.id] } } });
    }
  });

  it('isolates reads, ordering and mutations between task owners', async () => {
    const repository = new TasksRepository(database as unknown as DatabaseService);
    const date = new Date('2032-01-01T00:00:00.000Z');
    const end = new Date('2032-01-02T00:00:00.000Z');
    const own = await repository.create(ownerId, 'Own task', date);
    const foreign = await repository.create(otherOwnerId, 'Other user task', date);
    try {
      expect(own).toMatchObject({ ownerId, position: 0 });
      expect(foreign).toMatchObject({ ownerId: otherOwnerId, position: 0 });
      expect(await repository.findByDay(ownerId, date)).toEqual([own]);
      expect(await repository.findByRange(ownerId, date, end, {})).toEqual([own]);
      await expect(repository.setCompleted(ownerId, foreign.id, true)).rejects.toMatchObject({ code: 'P2025' });
      await expect(repository.update(ownerId, foreign.id, 'Stolen', date, taskDetails)).rejects.toMatchObject({ code: 'P2025' });
      await expect(repository.remove(ownerId, foreign.id)).rejects.toMatchObject({ code: 'P2025' });
      await expect(repository.reorder(ownerId, date, [foreign.id])).rejects.toThrow();
      expect(await repository.reorder(ownerId, date, [own.id])).toEqual([own]);
      expect(await repository.findByDay(otherOwnerId, date)).toEqual([foreign]);
    } finally {
      await database.task.deleteMany({ where: { id: { in: [own.id, foreign.id] } } });
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
          database.task.create({ data: { title, date, ...schedule, ownerId } }),
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
    const created = await database.task.create({ data: { title, date: day, ownerId } });
    try {
      expect(created.date.toISOString().slice(0, 10)).toBe('0001-01-01');
      expect(created).toMatchObject({
        ownerId,
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
