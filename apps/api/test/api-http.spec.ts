import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module';
import { databaseConfig } from '../src/config/app.config';
import { DatabaseService } from '../src/database/database.service';
import { TasksRepository } from '../src/tasks/tasks.repository';
import { taskDetails } from './fixtures/task.fixture';

const ownerId = 1;
const task = {
  ownerId,
  id: 1,
  title: 'First',
  date: new Date('0001-01-01T00:00:00.000Z'),
  completed: false,
  position: 5,
  ...taskDetails,
};
const publicTask = { id: 1, title: 'First', date: '0001-01-01', completed: false, ...taskDetails };

describe('API HTTP contracts', () => {
  let app: INestApplication;
  let server: Server;
  let cookie: string[];
  type UserRow = { id: number; name: string; email: string; passwordHash: string };
  type SessionRow = { tokenHash: string; userId: number; expiresAt: Date };
  const users = new Map<number, UserRow>();
  const sessions = new Map<string, SessionRow>();
  const database = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  };
  const credentials = {
    name: 'Task owner',
    email: 'owner@example.com',
    password: 'Strong-password-123!',
  };
  const publicUser = { id: ownerId, name: credentials.name, email: credentials.email };

  function authenticatedRequest() {
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
  const repository = {
    findByDay: vi.fn(),
    findByRange: vi.fn(),
    create: vi.fn(),
    reorder: vi.fn(),
    setCompleted: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(databaseConfig.KEY)
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(TasksRepository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer() as Server;
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    users.clear();
    sessions.clear();
    database.$transaction.mockImplementation(async (work: (transaction: typeof database) => Promise<unknown>) => work(database));
    database.user.findUnique.mockImplementation(
      async ({ where }: { where: { id?: number; email?: string } }) =>
        [...users.values()].find((user) =>
          where.id !== undefined ? user.id === where.id : user.email === where.email,
        ) ?? null,
    );
    database.user.create.mockImplementation(async ({ data }: { data: Omit<UserRow, 'id'> }) => {
      const user = { ...data, id: users.size + 1 };
      users.set(user.id, user);
      return user;
    });
    database.session.create.mockImplementation(async ({ data }: { data: SessionRow }) => {
      sessions.set(data.tokenHash, data);
      return data;
    });
    database.session.findUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) => {
        const session = sessions.get(where.tokenHash);
        return session ? { ...session, user: users.get(session.userId) } : null;
      },
    );
    database.session.deleteMany.mockImplementation(
      async ({ where }: { where: { tokenHash?: string; userId?: number } }) => {
        let count = 0;
        for (const [hash, session] of sessions) {
          if (
            (where.tokenHash === undefined || where.tokenHash === hash) &&
            (where.userId === undefined || where.userId === session.userId)
          ) {
            sessions.delete(hash);
            count++;
          }
        }
        return { count };
      },
    );
    database.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    repository.findByDay.mockResolvedValue([task]);
    repository.findByRange.mockResolvedValue([task]);
    repository.create.mockResolvedValue(task);
    repository.reorder.mockResolvedValue([task]);
    repository.setCompleted.mockResolvedValue({ ...task, completed: true });
    const registered = await request(server)
      .post('/api/auth/register')
      .set('Host', 'localhost')
      .set('Origin', 'http://localhost')
      .send(credentials)
      .expect(201, publicUser);
    expect(registered.headers['set-cookie']).toBeDefined();
    cookie = (registered.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0]);
  });
  afterEach(async () => {
    await app?.close();
  });

  it('registers, logs in, returns only the public user and revokes the session on logout', async () => {
    await authenticatedRequest().get('/api/auth/me').expect(200, publicUser);
    const loggedIn = await request(server)
      .post('/api/auth/login')
      .set('Host', 'localhost')
      .set('Origin', 'http://localhost')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200, publicUser);
    expect(loggedIn.headers['set-cookie']).toBeDefined();
    cookie = (loggedIn.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0]);
    await authenticatedRequest().get('/api/auth/me').expect(200, publicUser);
    await authenticatedRequest()
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(204);
    await authenticatedRequest().get('/api/auth/me').expect(401);
    await authenticatedRequest().get('/api/tasks?date=0001-01-01').expect(401);
    expect(repository.findByDay).not.toHaveBeenCalled();
  });

  it('requires a session and rejects cross-origin task writes without querying tasks', async () => {
    await request(server).get('/api/tasks?date=0001-01-01').set('Host', 'localhost').expect(401);
    await authenticatedRequest()
      .post('/api/tasks')
      .set('Origin', 'http://foreign.example')
      .send({ title: 'First', date: '0001-01-01' })
      .expect(403);
    expect(repository.findByDay).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates calendar details without exposing internal fields', async () => {
    const details = {
      startMinute: 570,
      durationMinutes: 90,
      visibility: 'SHARED',
      notes: 'Review the new layouts',
      sharedWith: 'Design Team',
    };
    repository.create.mockResolvedValue({
      ...task,
      ...details,
    });
    await authenticatedRequest()
      .post('/api/tasks')
      .send({ title: ' First ', date: '0001-01-01', ...details })
      .expect(201, { ...publicTask, ...details });
    expect(repository.create).toHaveBeenCalledWith(ownerId, 'First', task.date, details);
  });

  it('replaces editable details and deletes tasks without changing the completion endpoint', async () => {
    repository.update.mockResolvedValue({ ...task, title: 'Edited', completed: true });
    await authenticatedRequest()
      .put('/api/tasks/1')
      .send({ title: ' Edited ', date: '0001-01-01' })
      .expect(200, { ...publicTask, title: 'Edited', completed: true });
    expect(repository.update).toHaveBeenCalledWith(ownerId, 1, 'Edited', task.date, taskDetails);
    await authenticatedRequest().delete('/api/tasks/1').expect(204);
    expect(repository.remove).toHaveBeenCalledWith(ownerId, 1);
    for (const body of [
      { title: 'Invalid', date: '2024-02-30' },
      { title: 'Invalid', date: '2024-01-01', startMinute: 1439, durationMinutes: 2 },
      { title: 'Invalid', date: '2024-01-01', project: 'Removed' },
      { title: 'Invalid', date: '2024-01-01', completed: true },
    ])
      await authenticatedRequest().put('/api/tasks/1').send(body).expect(400);
    await authenticatedRequest().delete('/api/tasks/abc').expect(400);
    repository.remove.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '6.16.3',
      }),
    );
    await authenticatedRequest().delete('/api/tasks/999').expect(404);
  });

  it('supports half-open calendar ranges, visibility and strict completion filters', async () => {
    await authenticatedRequest()
      .get('/api/tasks?from=2024-10-20&to=2024-10-27&visibility=SHARED&completed=false')
      .expect(200, [publicTask]);
    expect(repository.findByRange).toHaveBeenCalledWith(
      ownerId,
      new Date('2024-10-20T00:00:00.000Z'),
      new Date('2024-10-27T00:00:00.000Z'),
      { visibility: 'SHARED', completed: false },
    );
    await authenticatedRequest()
      .get('/api/tasks?date=0001-01-01&visibility=PRIVATE&completed=true')
      .expect(200, [publicTask]);
    expect(repository.findByDay).toHaveBeenCalledWith(ownerId, task.date, {
      visibility: 'PRIVATE',
      completed: true,
    });
    await authenticatedRequest().get('/api/tasks?from=2024-01-01&to=2025-01-01').expect(200);
  });

  it('rejects incomplete, ambiguous, excessive and invalid ranges or filters before querying', async () => {
    for (const query of [
      'from=2024-10-20',
      'to=2024-10-27',
      'date=2024-10-20&from=2024-10-20&to=2024-10-27',
      'date=2024-10-20&from=2024-10-20',
      'from=2024-10-20&to=2024-10-20',
      'from=2024-10-27&to=2024-10-20',
      'from=2024-01-01&to=2025-01-02',
      'from=2024-02-30&to=2024-03-02',
      'from=2024-10-20&from=2024-10-21&to=2024-10-27',
      'date=2024-10-20&visibility=public',
      'date=2024-10-20&completed=1',
      'date=2024-10-20&completed=true&completed=false',
    ]) {
      await authenticatedRequest().get(`/api/tasks?${query}`).expect(400);
    }
    expect(repository.findByDay).not.toHaveBeenCalled();
    expect(repository.findByRange).not.toHaveBeenCalled();
  });

  it('validates calendar scheduling and metadata without coercing body types', async () => {
    for (const details of [
      { startMinute: 540 },
      { durationMinutes: 60 },
      { startMinute: null, durationMinutes: 60 },
      { startMinute: -1, durationMinutes: 60 },
      { startMinute: 1440, durationMinutes: 1 },
      { startMinute: 1439, durationMinutes: 2 },
      { startMinute: 540.5, durationMinutes: 60 },
      { startMinute: '540', durationMinutes: 60 },
      { startMinute: 540, durationMinutes: 0 },
      { startMinute: 0, durationMinutes: 1441 },
      { visibility: null },
      { visibility: 'public' },
      { notes: 123 },
      { notes: 'x'.repeat(10001) },
      { project: 'Website Redesign' },
      { sharedWith: false },
      { callUrl: 'https://meet.example.com/design' },
      { attendees: [] },
      { attendees: [{ name: 'Alex' }] },
    ]) {
      await authenticatedRequest()
        .post('/api/tasks')
        .send({ title: 'First', date: '0001-01-01', ...details })
        .expect(400);
    }
    expect(repository.create).not.toHaveBeenCalled();
    for (const schedule of [
      { startMinute: 1439, durationMinutes: 1 },
      { startMinute: 0, durationMinutes: 1440 },
      { startMinute: null, durationMinutes: null },
    ]) {
      await authenticatedRequest()
        .post('/api/tasks')
        .send({ title: 'First', date: '0001-01-01', ...schedule })
        .expect(201);
      expect(repository.create).toHaveBeenLastCalledWith(ownerId, 'First', task.date, {
        ...taskDetails,
        ...schedule,
      });
    }
  });

  it('keeps the health status codes and bodies without exposing driver errors', async () => {
    await request(server).get('/api/health/live').expect(200, { api: 'ok' });
    expect(database.$queryRaw).not.toHaveBeenCalled();
    await request(server).get('/api/health/ready').expect(200, { api: 'ok', database: 'ok' });
    database.$queryRaw.mockRejectedValue(new Error('sensitive credentials'));
    await request(server)
      .get('/api/health/ready')
      .expect(503, { api: 'ok', database: 'unavailable' });
  });

  it('serializes dates, trims titles and never exposes internal position', async () => {
    await authenticatedRequest().get('/api/tasks?date=0001-01-01').expect(200, [publicTask]);
    await authenticatedRequest()
      .post('/api/tasks')
      .send({ title: ' First ', date: '0001-01-01' })
      .expect(201, publicTask);
    expect(repository.create).toHaveBeenCalledWith(ownerId, 'First', task.date, taskDetails);
    await authenticatedRequest()
      .patch('/api/tasks/order')
      .send({ date: '0001-01-01', ids: [1] })
      .expect(200, [publicTask]);
    await authenticatedRequest()
      .patch('/api/tasks/1')
      .send({ completed: true })
      .expect(200, { ...publicTask, completed: true });
    expect(repository.reorder).toHaveBeenCalledWith(ownerId, task.date, [1]);
    expect(repository.setCompleted).toHaveBeenCalledWith(ownerId, 1, true);
  });

  it('rejects invalid or extra query parameters', async () => {
    for (const query of [
      '',
      '?date=2023-02-29',
      '?date=0000-01-01',
      '?date=2024-01-01&extra=x',
      '?date=2024-01-01&date=2024-01-02',
    ]) {
      await authenticatedRequest().get(`/api/tasks${query}`).expect(400);
    }
    expect(repository.findByDay).not.toHaveBeenCalled();
  });

  it('rejects missing, wrong-type and unknown body fields before calling the service', async () => {
    for (const body of [
      {},
      { title: ' ', date: '2024-01-01' },
      { title: 'x'.repeat(201), date: '2024-01-01' },
      { title: 1, date: '2024-01-01' },
      { title: 'x', date: '2024-01-01', position: 1 },
      { title: 'x', date: '2023-02-29' },
    ]) {
      await authenticatedRequest().post('/api/tasks').send(body).expect(400);
    }
    for (const ids of [[1, 1], [0], ['1'], [1.5], [2147483648], null]) {
      await authenticatedRequest()
        .patch('/api/tasks/order')
        .send({ date: '2024-01-01', ids })
        .expect(400);
    }
    for (const completed of ['true', 1, null]) {
      await authenticatedRequest().patch('/api/tasks/1').send({ completed }).expect(400);
    }
    for (const id of ['0', '-1', '2147483648', '1.5', 'abc', '1e2']) {
      await authenticatedRequest().patch(`/api/tasks/${id}`).send({ completed: true }).expect(400);
    }
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.reorder).not.toHaveBeenCalled();
    expect(repository.setCompleted).not.toHaveBeenCalled();
  });

  it('allows an empty order for an empty day and preserves domain conflicts', async () => {
    repository.reorder.mockResolvedValue([]);
    await authenticatedRequest()
      .patch('/api/tasks/order')
      .send({ date: '2024-01-01', ids: [] })
      .expect(200, []);
    repository.reorder.mockRejectedValue(
      new ConflictException('Tasks changed. Reload and try again.'),
    );
    await authenticatedRequest()
      .patch('/api/tasks/order')
      .send({ date: '2024-01-01', ids: [1] })
      .expect(409);
  });

  it('maps Prisma errors centrally without returning driver details', async () => {
    for (const [code, status] of [
      ['P2025', 404],
      ['P2034', 409],
      ['P1001', 503],
    ] as const) {
      repository.setCompleted.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('sensitive credentials', {
          code,
          clientVersion: '6.16.3',
        }),
      );
      const response = await authenticatedRequest()
        .patch('/api/tasks/1')
        .send({ completed: true })
        .expect(status);
      expect(JSON.stringify(response.body)).not.toContain('sensitive credentials');
    }
  });
});
