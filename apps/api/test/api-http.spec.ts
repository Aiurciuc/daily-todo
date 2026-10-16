import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const task = {
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
  const database = { $queryRaw: vi.fn() };
  const repository = {
    findByDay: vi.fn(),
    findByRange: vi.fn(),
    create: vi.fn(),
    reorder: vi.fn(),
    setCompleted: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
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
  beforeEach(() => {
    vi.resetAllMocks();
    database.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    repository.findByDay.mockResolvedValue([task]);
    repository.findByRange.mockResolvedValue([task]);
    repository.create.mockResolvedValue(task);
    repository.reorder.mockResolvedValue([task]);
    repository.setCompleted.mockResolvedValue({ ...task, completed: true });
  });
  afterAll(async () => {
    await app?.close();
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
    await request(server)
      .post('/api/tasks')
      .send({ title: ' First ', date: '0001-01-01', ...details })
      .expect(201, { ...publicTask, ...details });
    expect(repository.create).toHaveBeenCalledWith('First', task.date, details);
  });

  it('replaces editable details and deletes tasks without changing the completion endpoint', async () => {
    repository.update.mockResolvedValue({ ...task, title: 'Edited', completed: true });
    await request(server).put('/api/tasks/1').send({ title: ' Edited ', date: '0001-01-01' })
      .expect(200, { ...publicTask, title: 'Edited', completed: true });
    expect(repository.update).toHaveBeenCalledWith(1, 'Edited', task.date, taskDetails);
    await request(server).delete('/api/tasks/1').expect(204);
    expect(repository.remove).toHaveBeenCalledWith(1);
    for (const body of [
      { title: 'Invalid', date: '2024-02-30' },
      { title: 'Invalid', date: '2024-01-01', startMinute: 1439, durationMinutes: 2 },
      { title: 'Invalid', date: '2024-01-01', project: 'Removed' },
      { title: 'Invalid', date: '2024-01-01', completed: true },
    ]) await request(server).put('/api/tasks/1').send(body).expect(400);
    await request(server).delete('/api/tasks/abc').expect(400);
    repository.remove.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6.16.3' }));
    await request(server).delete('/api/tasks/999').expect(404);
  });

  it('supports half-open calendar ranges, visibility and strict completion filters', async () => {
    await request(server)
      .get('/api/tasks?from=2024-10-20&to=2024-10-27&visibility=SHARED&completed=false')
      .expect(200, [publicTask]);
    expect(repository.findByRange).toHaveBeenCalledWith(
      new Date('2024-10-20T00:00:00.000Z'),
      new Date('2024-10-27T00:00:00.000Z'),
      { visibility: 'SHARED', completed: false },
    );
    await request(server)
      .get('/api/tasks?date=0001-01-01&visibility=PRIVATE&completed=true')
      .expect(200, [publicTask]);
    expect(repository.findByDay).toHaveBeenCalledWith(task.date, {
      visibility: 'PRIVATE',
      completed: true,
    });
    await request(server).get('/api/tasks?from=2024-01-01&to=2025-01-01').expect(200);
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
      await request(server).get(`/api/tasks?${query}`).expect(400);
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
      await request(server)
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
      await request(server)
        .post('/api/tasks')
        .send({ title: 'First', date: '0001-01-01', ...schedule })
        .expect(201);
      expect(repository.create).toHaveBeenLastCalledWith('First', task.date, {
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
    await request(server).get('/api/tasks?date=0001-01-01').expect(200, [publicTask]);
    await request(server)
      .post('/api/tasks')
      .send({ title: ' First ', date: '0001-01-01' })
      .expect(201, publicTask);
    expect(repository.create).toHaveBeenCalledWith('First', task.date, taskDetails);
    await request(server)
      .patch('/api/tasks/order')
      .send({ date: '0001-01-01', ids: [1] })
      .expect(200, [publicTask]);
    await request(server)
      .patch('/api/tasks/1')
      .send({ completed: true })
      .expect(200, { ...publicTask, completed: true });
  });

  it('rejects invalid or extra query parameters', async () => {
    for (const query of [
      '',
      '?date=2023-02-29',
      '?date=0000-01-01',
      '?date=2024-01-01&extra=x',
      '?date=2024-01-01&date=2024-01-02',
    ]) {
      await request(server).get(`/api/tasks${query}`).expect(400);
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
      await request(server).post('/api/tasks').send(body).expect(400);
    }
    for (const ids of [[1, 1], [0], ['1'], [1.5], [2147483648], null]) {
      await request(server).patch('/api/tasks/order').send({ date: '2024-01-01', ids }).expect(400);
    }
    for (const completed of ['true', 1, null]) {
      await request(server).patch('/api/tasks/1').send({ completed }).expect(400);
    }
    for (const id of ['0', '-1', '2147483648', '1.5', 'abc', '1e2']) {
      await request(server).patch(`/api/tasks/${id}`).send({ completed: true }).expect(400);
    }
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.reorder).not.toHaveBeenCalled();
    expect(repository.setCompleted).not.toHaveBeenCalled();
  });

  it('allows an empty order for an empty day and preserves domain conflicts', async () => {
    repository.reorder.mockResolvedValue([]);
    await request(server)
      .patch('/api/tasks/order')
      .send({ date: '2024-01-01', ids: [] })
      .expect(200, []);
    repository.reorder.mockRejectedValue(
      new ConflictException('Tasks changed. Reload and try again.'),
    );
    await request(server)
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
      const response = await request(server)
        .patch('/api/tasks/1')
        .send({ completed: true })
        .expect(status);
      expect(JSON.stringify(response.body)).not.toContain('sensitive credentials');
    }
  });
});
