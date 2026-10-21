import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Task } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { authConfig, authSettings } from '../src/auth/auth.config';
import { databaseConfig } from '../src/config/app.config';
import { DatabaseService } from '../src/database/database.service';
import { taskDetails } from './fixtures/task.fixture';

type UserRow = { id: number; name: string; email: string; passwordHash: string };
type SessionRow = { tokenHash: string; userId: number; expiresAt: Date };
type TaskWhere = {
  id?: number | { in: number[] };
  ownerId?: number | null;
  date?: Date | { gte: Date; lt: Date };
  visibility?: Task['visibility'];
  completed?: boolean;
};
type TaskQuery = {
  where: TaskWhere;
  orderBy?: Partial<Record<keyof Task, 'asc' | 'desc'>>[];
};
type TaskData = Pick<Task, 'title' | 'date' | 'position' | 'ownerId'> & Partial<Task>;
const day = '2024-01-15';
const nextDay = '2024-01-16';
const end = '2024-01-17';
const dateOf = (date: string) => new Date(`${date}T00:00:00.000Z`);

// Deliberately honor only the supplied predicates: an omitted owner predicate must leak
// rows, not be silently repaired by the fake, so these tests exercise the real repository.
function matches(task: Task, where: TaskWhere): boolean {
  if (where.ownerId !== undefined && task.ownerId !== where.ownerId) return false;
  if (where.id !== undefined) {
    if (typeof where.id === 'number' ? task.id !== where.id : !where.id.in.includes(task.id)) {
      return false;
    }
  }
  if (where.visibility !== undefined && task.visibility !== where.visibility) return false;
  if (where.completed !== undefined && task.completed !== where.completed) return false;
  if (where.date instanceof Date) return task.date.getTime() === where.date.getTime();
  return !where.date || (task.date >= where.date.gte && task.date < where.date.lt);
}

function missingTask(): never {
  throw new Prisma.PrismaClientKnownRequestError('Task not found', {
    code: 'P2025',
    clientVersion: '6.16.3',
  });
}

describe('task ownership HTTP (real AppModule, repositories, services and guards)', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let users: Map<number, UserRow>;
  let sessions: Map<string, SessionRow>;
  let tasks: Map<number, Task>;
  const database = {
    user: { create: vi.fn(), findUnique: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    task: {
      findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn(),
      findUniqueOrThrow: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  function http(cookie: string) {
    const client = request(server);
    const headers = { Host: 'localhost', Origin: 'http://localhost', Cookie: cookie };
    return {
      get: (path: string) => client.get(path).set(headers),
      post: (path: string) => client.post(path).set(headers),
      put: (path: string) => client.put(path).set(headers),
      patch: (path: string) => client.patch(path).set(headers),
      delete: (path: string) => client.delete(path).set(headers),
    };
  }

  async function register(name: string) {
    const response = await http('').post('/api/auth/register').send({
      name, email: `${name}@example.com`, password: 'Strong-password-123!',
    }).expect(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^daily_todo_session=/);
    return { id: (response.body as { id: number }).id, cookie: cookies[0].split(';')[0] };
  }

  function seed(ownerId: number | null, overrides: Partial<Task> = {}): Task {
    const task: Task = {
      id: tasks.size + 1, ownerId, title: 'Fixture', date: dateOf(day),
      completed: false, position: 0, ...taskDetails, ...overrides,
    };
    tasks.set(task.id, task);
    return task;
  }

  function snapshot() {
    return structuredClone([...tasks.values()]);
  }

  function expectNoWrites() {
    expect(database.task.create).not.toHaveBeenCalled();
    expect(database.task.update).not.toHaveBeenCalled();
    expect(database.task.delete).not.toHaveBeenCalled();
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    users = new Map();
    sessions = new Map();
    tasks = new Map();
    // Execute real repository transaction callbacks; clone maps to model rollback.
    database.$transaction.mockImplementation(async (work: (tx: typeof database) => Promise<unknown>) => {
      const before = structuredClone({ users, sessions, tasks });
      try {
        return await work(database);
      } catch (error) {
        ({ users, sessions, tasks } = before);
        throw error;
      }
    });
    database.user.create.mockImplementation(async ({ data }: { data: Omit<UserRow, 'id'> }) => {
      const user = { ...data, id: users.size + 1 };
      users.set(user.id, user);
      return user;
    });
    database.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
      [...users.values()].find((user) => user.email === where.email) ?? null,
    );
    database.session.create.mockImplementation(async ({ data }: { data: SessionRow }) => {
      sessions.set(data.tokenHash, data);
      return data;
    });
    database.session.findUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => {
      const session = sessions.get(where.tokenHash);
      return session ? { ...session, user: users.get(session.userId) } : null;
    });
    database.session.deleteMany.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
      ({ count: Number(sessions.delete(where.tokenHash)) }),
    );
    database.task.findMany.mockImplementation(async ({ where, orderBy = [] }: TaskQuery) =>
      [...tasks.values()].filter((task) => matches(task, where)).sort((left, right) => {
        for (const order of orderBy) {
          for (const [key, direction] of Object.entries(order)) {
            const a = left[key as keyof Task];
            const b = right[key as keyof Task];
            const comparison = a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;
            if (comparison) return direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      }),
    );
    database.task.aggregate.mockImplementation(async ({ where }: TaskQuery) => {
      const positions = [...tasks.values()].filter((task) => matches(task, where)).map((task) => task.position);
      return { _max: { position: positions.length ? Math.max(...positions) : null } };
    });
    database.task.create.mockImplementation(async ({ data }: { data: TaskData }) => seed(data.ownerId, data));
    database.task.findUniqueOrThrow.mockImplementation(async ({ where }: TaskQuery) =>
      [...tasks.values()].find((task) => matches(task, where)) ?? missingTask(),
    );
    database.task.update.mockImplementation(async ({ where, data }: TaskQuery & { data: Partial<Task> }) => {
      const current = [...tasks.values()].find((task) => matches(task, where)) ?? missingTask();
      const updated = { ...current, ...data };
      tasks.set(current.id, updated);
      return updated;
    });
    database.task.delete.mockImplementation(async ({ where }: TaskQuery) => {
      const current = [...tasks.values()].find((task) => matches(task, where)) ?? missingTask();
      tasks.delete(current.id);
      return current;
    });

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(databaseConfig.KEY).useValue({})
      .overrideProvider(authConfig.KEY).useValue(authSettings({
        AUTH_ORIGIN: 'http://localhost', AUTH_COOKIE_SECURE: 'false',
      }))
      .overrideProvider(DatabaseService).useValue(database)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('lists only each actor’s PRIVATE and SHARED tasks for days, ranges and filters', async () => {
    seed(null, { visibility: 'SHARED' });
    const actors = [await register('alice'), await register('bob')];
    for (const actor of actors) {
      for (const date of [day, nextDay, end]) {
        for (const visibility of ['PRIVATE', 'SHARED'] as const) {
          for (const completed of [false, true]) {
            seed(actor.id, { date: dateOf(date), visibility, completed, sharedWith: 'Other user' });
          }
        }
      }
    }
    for (const actor of actors) {
      for (const query of [`date=${day}`, `from=${day}&to=${end}`]) {
        for (const filters of ['', '&visibility=PRIVATE', '&visibility=SHARED', '&completed=true', '&completed=false', '&visibility=SHARED&completed=true']) {
          const response = await http(actor.cookie).get(`/api/tasks?${query}${filters}`).expect(200);
          const parameters = new URLSearchParams(query + filters);
          const expected = [...tasks.values()].filter((task) =>
            task.ownerId === actor.id &&
            (parameters.has('date') ? task.date.getTime() === dateOf(day).getTime() : task.date >= dateOf(day) && task.date < dateOf(end)) &&
            (!parameters.has('visibility') || task.visibility === parameters.get('visibility')) &&
            (!parameters.has('completed') || task.completed === (parameters.get('completed') === 'true')),
          );
          const rows = response.body as { id: number; ownerId?: number; position?: number }[];
          expect(rows.map((task) => task.id).sort((a, b) => a - b)).toEqual(expected.map((task) => task.id));
          for (const row of rows) {
            expect(row).not.toHaveProperty('ownerId');
            expect(row).not.toHaveProperty('position');
          }
        }
      }
    }
  });

  it('never claims legacy null-owner tasks on first or later registration', async () => {
    const legacy = seed(null, { position: 90, visibility: 'SHARED' });
    const before = snapshot();
    const first = await register('alice');
    expect(snapshot()).toEqual(before);
    const second = await register('bob');
    for (const actor of [first, second]) {
      await http(actor.cookie).get(`/api/tasks?date=${day}`).expect(200, []);
      await http(actor.cookie).get(`/api/tasks?from=${day}&to=${end}`).expect(200, []);
      await http(actor.cookie).put(`/api/tasks/${legacy.id}`).send({ title: 'Claim', date: day }).expect(404);
      await http(actor.cookie).patch(`/api/tasks/${legacy.id}`).send({ completed: true }).expect(404);
      await http(actor.cookie).delete(`/api/tasks/${legacy.id}`).expect(404);
      await http(actor.cookie).patch('/api/tasks/order').send({ date: day, ids: [legacy.id] }).expect(409);
      expect(snapshot()).toEqual(before);
    }
    expect(database.task.update).toHaveBeenCalledTimes(2); // Failed PATCH attempts only; reorder never writes.
  });

  it('rejects ownerId in bodies and queries and never accepts a client position', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const own = seed(alice.id);
    const before = snapshot();
    for (const ownerId of [alice.id, bob.id, null]) {
      await http(alice.cookie).post('/api/tasks').send({ title: 'Injected', date: day, ownerId }).expect(400);
      await http(alice.cookie).put(`/api/tasks/${own.id}`).send({ title: 'Injected', date: day, ownerId }).expect(400);
      await http(alice.cookie).patch(`/api/tasks/${own.id}`).send({ completed: true, ownerId }).expect(400);
      await http(alice.cookie).patch('/api/tasks/order').send({ date: day, ids: [own.id], ownerId }).expect(400);
    }
    for (const query of [`date=${day}`, `from=${day}&to=${end}`]) {
      await http(alice.cookie).get(`/api/tasks?${query}&ownerId=${bob.id}`).expect(400);
    }
    await http(alice.cookie).post('/api/tasks').send({ title: 'Injected', date: day, position: 100 }).expect(400);
    expect(snapshot()).toEqual(before);
    expectNoWrites();
  });

  it('assigns the session actor and independent same-day positions without ownership input', async () => {
    seed(null, { position: 100 });
    const alice = await register('alice');
    const bob = await register('bob');
    const created: Task[] = [];
    for (const actor of [alice, bob, alice, bob]) {
      const response = await http(actor.cookie).post('/api/tasks').send({ title: 'New', date: day }).expect(201);
      const row = tasks.get((response.body as { id: number }).id)!;
      expect(row.ownerId).toBe(actor.id);
      expect(row.position).toBe(created.filter((task) => task.ownerId === actor.id).length);
      expect(response.body).not.toHaveProperty('ownerId');
      expect(response.body).not.toHaveProperty('position');
      created.push(row);
    }
    expect(tasks.get(1)).toMatchObject({ ownerId: null, position: 100 });
  });

  it('returns 404 without mutation for cross-user PUT, PATCH and DELETE in both directions', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const aliceTask = seed(alice.id);
    const bobTask = seed(bob.id, { visibility: 'SHARED' });
    const before = snapshot();
    for (const [actor, foreign] of [[alice, bobTask], [bob, aliceTask]] as const) {
      await http(actor.cookie).put(`/api/tasks/${foreign.id}`).send({ title: 'Stolen', date: nextDay }).expect(404);
      expect(snapshot()).toEqual(before);
      await http(actor.cookie).patch(`/api/tasks/${foreign.id}`).send({ completed: true }).expect(404);
      expect(snapshot()).toEqual(before);
      await http(actor.cookie).delete(`/api/tasks/${foreign.id}`).expect(404);
      expect(snapshot()).toEqual(before);
    }
    // Positive controls: the same routes work for an owner through the same guards.
    await http(alice.cookie).put(`/api/tasks/${aliceTask.id}`).send({ title: 'Mine', date: nextDay }).expect(200);
    await http(alice.cookie).patch(`/api/tasks/${aliceTask.id}`).send({ completed: true }).expect(200);
    expect(tasks.get(aliceTask.id)).toMatchObject({ ownerId: alice.id, title: 'Mine', completed: true, date: dateOf(nextDay) });
    await http(alice.cookie).delete(`/api/tasks/${aliceTask.id}`).expect(204);
    expect(tasks.has(aliceTask.id)).toBe(false);
    expect(tasks.get(bobTask.id)).toEqual(bobTask);
  });

  it('validates all reorder IDs before writing and never includes foreign or legacy rows', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const own = [seed(alice.id, { position: 5 }), seed(alice.id, { position: 8 })];
    const foreign = [seed(bob.id, { position: 20 }), seed(bob.id, { position: 30, visibility: 'SHARED' })];
    const legacy = seed(null, { position: 40 });
    const before = snapshot();
    for (const ids of [foreign.map((task) => task.id), [own[0].id, foreign[0].id], [own[0].id, own[1].id, foreign[0].id], [own[0].id, legacy.id]]) {
      await http(alice.cookie).patch('/api/tasks/order').send({ date: day, ids }).expect(409);
      expect(snapshot()).toEqual(before);
      expectNoWrites(); // Rollback alone must not hide a partial reorder write.
    }
    const ids = [own[1].id, own[0].id];
    const response = await http(alice.cookie).patch('/api/tasks/order').send({ date: day, ids }).expect(200);
    expect((response.body as { id: number }[]).map((task) => task.id)).toEqual(ids);
    expect(ids.map((id) => tasks.get(id)?.position)).toEqual([0, 1]);
    for (const task of [...foreign, legacy]) expect(tasks.get(task.id)).toEqual(task);
    expect(database.task.update).toHaveBeenCalledTimes(2);
    // No tasks of Alice's on nextDay, despite Bob having tasks there.
    const onlyForeign = seed(bob.id, { date: dateOf(nextDay), position: 60 });
    database.task.update.mockClear();
    await http(alice.cookie).patch('/api/tasks/order').send({ date: nextDay, ids: [] }).expect(200, []);
    expectNoWrites();
    expect(tasks.get(onlyForeign.id)).toEqual(onlyForeign);
  });

  it('keeps the real session and CSRF guards active ahead of persistence', async () => {
    const alice = await register('alice');
    await http('').get(`/api/tasks?date=${day}`).expect(401);
    await http('').post('/api/tasks').send({ title: 'No session', date: day }).expect(401);
    await http(alice.cookie).post('/api/tasks').set('Origin', 'http://foreign.example')
      .send({ title: 'CSRF', date: day }).expect(403);
    expectNoWrites();
  });
});
