import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { authConfig, authSettings } from '../src/auth/auth.config';
import { verifyPassword } from '../src/auth/password';
import { databaseConfig } from '../src/config/app.config';
import { DatabaseService } from '../src/database/database.service';

type UserRow = { id: number; name: string; email: string; passwordHash: string };
type SessionRow = { tokenHash: string; userId: number; expiresAt: Date };
const credentials = { name: 'Alex', email: 'alex@example.com', password: 'Strong-password-123!' };
const publicUser = { id: 1, name: credentials.name, email: credentials.email };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

function sessionCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  expect(cookies).toHaveLength(1);
  return cookies[0];
}

const taskWrites = [
  { method: 'post', path: '/api/tasks', body: { title: 'Task', date: '2024-01-01' } },
  { method: 'put', path: '/api/tasks/1', body: { title: 'Changed', date: '2024-01-01' } },
  { method: 'patch', path: '/api/tasks/1', body: { completed: true } },
  { method: 'patch', path: '/api/tasks/order', body: { date: '2024-01-01', ids: [1] } },
  { method: 'delete', path: '/api/tasks/1', body: {} },
] as const;

describe('auth HTTP (real AppModule and repositories, in-memory database boundary)', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let config: ReturnType<typeof authSettings>;
  let users: Map<number, UserRow>;
  let sessions: Map<string, SessionRow>;

  const database = {
    user: { create: vi.fn(), findUnique: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    task: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  function write(path: string) {
    return request(server).post(path).set('Host', 'localhost').set('Origin', 'http://localhost');
  }

  async function register() {
    const response = await write('/api/auth/register').send(credentials).expect(201, publicUser);
    return sessionCookie(response).split(';')[0];
  }

  function expectNoTaskAccess() {
    for (const operation of Object.values(database.task)) expect(operation).not.toHaveBeenCalled();

  }

  beforeEach(async () => {
    vi.resetAllMocks();
    users = new Map();
    sessions = new Map();
    config = authSettings({
      AUTH_ORIGIN: 'http://localhost',
      AUTH_COOKIE_SECURE: 'false',
      AUTH_SESSION_TTL_SECONDS: '60',
    });
    database.$transaction.mockImplementation(async (work: (transaction: typeof database) => Promise<unknown>) => work(database));
    database.user.create.mockImplementation(async ({ data }: { data: Omit<UserRow, 'id'> }) => {
      if ([...users.values()].some((user) => user.email === data.email)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique email constraint', {
          code: 'P2002',
          clientVersion: '6.16.3',
          meta: { target: ['email'] },
        });
      }
      const user = { ...data, id: users.size + 1 };
      users.set(user.id, user);
      return user;
    });
    database.user.findUnique.mockImplementation(
      async ({ where }: { where: { email: string } }) =>
        [...users.values()].find((user) => user.email === where.email) ?? null,
    );
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
      async ({ where }: { where: { tokenHash: string } }) => ({
        count: Number(sessions.delete(where.tokenHash)),
      }),
    );

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(databaseConfig.KEY)
      .useValue({})
      .overrideProvider(authConfig.KEY)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  it('normalizes registration, hashes secrets at rest and exposes only the public user', async () => {
    const response = await write('/api/auth/register')
      .send({ ...credentials, name: '  Alex  ', email: '  ALEX@Example.COM  ' })
      .expect(201, publicUser);
    const stored = users.get(1)!;
    expect(stored).toMatchObject({ name: 'Alex', email: 'alex@example.com' });
    expect(stored.passwordHash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(await verifyPassword(credentials.password, stored.passwordHash)).toBe(true);
    expect(stored.passwordHash).not.toContain(credentials.password);
    const cookie = sessionCookie(response);
    const pair = cookie.split(';')[0];
    const token = pair.split('=')[1];
    expect(pair).toMatch(/^daily_todo_session=[a-f0-9]{64}$/);
    expect(cookie).toContain('Path=/api');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=60');
    expect(cookie).toContain('Expires=');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Domain=');
    expect(sessions.size).toBe(1);
    expect(sessions.get(digest(token))).toMatchObject({ userId: 1 });
    expect(sessions.has(token)).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain(token);
    await request(server).get('/api/auth/me').set('Cookie', pair).expect(200, publicUser);
    expect(database.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: digest(token) },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  });

  it('uses secure cookies when configured', async () => {
    config.secureCookie = true;
    const response = await write('/api/auth/register').send(credentials).expect(201);
    expect(sessionCookie(response)).toContain('; Secure');
  });

  it('normalizes login and rotates/revokes the supplied previous session', async () => {
    const previous = await register();
    const response = await write('/api/auth/login')
      .set('Cookie', previous)
      .send({ email: '  ALEX@Example.COM ', password: credentials.password })
      .expect(200, publicUser);
    const current = sessionCookie(response).split(';')[0];
    expect(current).not.toBe(previous);
    expect(sessions.size).toBe(1);
    await request(server).get('/api/auth/me').set('Cookie', previous).expect(401);
    await request(server).get('/api/auth/me').set('Cookie', current).expect(200, publicUser);
  });

  it.each(['unknown@example.com', credentials.email])(
    'rejects incorrect credentials for %s identically',
    async (email) => {
      await register();
      const response = await write('/api/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
      expect(response.body).toMatchObject({
        message: 'Invalid email or password',
        statusCode: 401,
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(sessions.size).toBe(1);
    },
  );

  it('maps duplicate normalized emails to conflict without creating another session', async () => {
    await register();
    const response = await write('/api/auth/register')
      .send({ ...credentials, email: ' ALEX@EXAMPLE.COM ' })
      .expect(409);
    expect(response.body).toMatchObject({ message: 'Email already registered' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(users.size).toBe(1);
    expect(sessions.size).toBe(1);
  });

  it.each([
    {},
    { email: 'invalid' },
    { email: 42 },
    { email: 'x'.repeat(255) + '@example.com' },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { password: 12345678 },
    { password: null },
    { name: '   ' },
    { name: 'x'.repeat(121) },
    { name: 42 },
    { admin: true },
  ])('validates registration input %j before persistence', async (invalid) => {
    const body = Object.keys(invalid).length ? { ...credentials, ...invalid } : {};
    await write('/api/auth/register').send(body).expect(400);
    expect(database.user.create).not.toHaveBeenCalled();
    expect(database.session.create).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { email: credentials.email },
    { email: 1, password: credentials.password },
    { email: credentials.email, password: 'short' },
    { ...credentials },
  ])('validates login input %j before persistence', async (body) => {
    await write('/api/auth/login').send(body).expect(400);
    expect(database.user.findUnique).not.toHaveBeenCalled();
    expect(database.session.create).not.toHaveBeenCalled();
  });

  it('requires authentication for me and every task route before any task persistence', async () => {
    await request(server).get('/api/auth/me').expect(401);
    await request(server).get('/api/tasks?date=2024-01-01').expect(401);
    await request(server).get('/api/tasks?from=2024-01-01&to=2024-01-02').expect(401);
    for (const { method, path, body } of taskWrites) {
      await request(server)
        [method](path)
        .set('Host', 'localhost')
        .set('Origin', 'http://localhost')
        .send(body)
        .expect(401);
    }
    expectNoTaskAccess();
  });

  it.each([
    'daily_todo_session=invalid',
    `daily_todo_session=${'a'.repeat(64)}`,
    `daily_todo_session=${'a'.repeat(64)}; daily_todo_session=${'b'.repeat(64)}`,
  ])('rejects malformed, unknown or ambiguous session cookies: %s', async (cookie) => {
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('expires sessions at the exact TTL boundary and deletes the stored hash', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cookie = await register();
    const hash = digest(cookie.split('=')[1]);
    expect(sessions.get(hash)?.expiresAt.getTime()).toBe(now + 60000);
    clock.mockReturnValue(now + 59999);
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200, publicUser);
    clock.mockReturnValue(now + 60000);
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(sessions.has(hash)).toBe(false);
    expect(database.session.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: hash } });
  });

  it('revokes logout cookies, clears matching cookie flags and is idempotent', async () => {
    const cookie = await register();
    const response = await write('/api/auth/logout').set('Cookie', cookie).send({}).expect(204);
    const cleared = sessionCookie(response);
    expect(cleared).toContain('daily_todo_session=;');
    expect(cleared).toContain('Path=/api');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('SameSite=Lax');
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(sessions.size).toBe(0);
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await write('/api/auth/logout').set('Cookie', cookie).send({}).expect(204);
    await write('/api/auth/logout').send({}).expect(204);
  });

  it.each([undefined, 'http://foreign.example', 'null'])(
    'rejects missing/foreign/opaque Origin %s on every write',
    async (origin) => {
      const cookie = await register();
      for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/logout']) {
        const pending = request(server).post(path).set('Host', 'localhost').set('Cookie', cookie);
        if (origin !== undefined) pending.set('Origin', origin);
        await pending.send(credentials).expect(403);
      }
      for (const { method, path, body } of taskWrites) {
        const pending = request(server)
          [method](path)
          .set('Host', 'localhost')
          .set('Cookie', cookie);
        if (origin !== undefined) pending.set('Origin', origin);
        await pending.send(body).expect(403);
      }
      expect(users.size).toBe(1);
      expect(sessions.size).toBe(1);
      expectNoTaskAccess();
    },
  );

  it.each(['/api/auth/register', '/api/auth/login', '/api/auth/logout'])(
    'requires JSON on %s',
    async (path) => {
      await write(path)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(credentials))
        .expect(415);
      await write(path).type('form').send(credentials).expect(415);
      await write(path).expect(415);
      expect(database.user.create).not.toHaveBeenCalled();
      expect(database.user.findUnique).not.toHaveBeenCalled();
      expect(database.session.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('uses the configured public origin rather than Host or spoofed forwarding headers', async () => {
    await write('/api/auth/register')
      .set('Host', 'internal:3000')
      .set('X-Forwarded-Host', 'foreign.example')
      .set('X-Forwarded-Proto', 'https')
      .send(credentials)
      .expect(201, publicUser);
    await write('/api/auth/login')
      .set('Origin', 'https://foreign.example')
      .set('X-Forwarded-Host', 'foreign.example')
      .set('X-Forwarded-Proto', 'https')
      .send(credentials)
      .expect(403);
  });

  it('separates rate limits only for explicitly trusted edge peers with a single valid client IP', async () => {
    config.trustedProxyIps = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];
    for (let attempt = 0; attempt < 10; attempt++) {
      await write('/api/auth/login').set('X-Forwarded-For', '192.0.2.1').send({}).expect(400);
    }
    await write('/api/auth/login').set('X-Forwarded-For', '192.0.2.1').send({}).expect(429);
    await write('/api/auth/login').set('X-Forwarded-For', '192.0.2.2').send({}).expect(400);
    // Appended/spoofed chains and invalid addresses fall back to the socket peer.
    for (let attempt = 0; attempt < 10; attempt++) {
      await write('/api/auth/login').set('X-Forwarded-For', '192.0.2.3, 192.0.2.4').send({}).expect(400);
    }
    await write('/api/auth/login').set('X-Forwarded-For', 'invalid').send({}).expect(429);
  });

  it('ignores forwarding headers when deriving the fallback origin from the socket request', async () => {
    config.origin = undefined;
    await write('/api/auth/register')
      .set('X-Forwarded-Host', 'foreign.example')
      .set('X-Forwarded-Proto', 'https')
      .send(credentials)
      .expect(201, publicUser);
    await write('/api/auth/login')
      .set('Origin', 'https://foreign.example')
      .set('X-Forwarded-Host', 'foreign.example')
      .set('X-Forwarded-Proto', 'https')
      .send(credentials)
      .expect(403);
  });

  it('allows only 10 combined register/login attempts per socket per minute, ignoring spoofed IPs', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await register(); // Successful attempts count too.
    for (let attempt = 1; attempt < 10; attempt++) {
      const path = attempt % 2 ? '/api/auth/login' : '/api/auth/register';
      await write(path).set('X-Forwarded-For', `192.0.2.${attempt}`).send({}).expect(400); // Invalid attempts count before validation.
    }
    for (const path of ['/api/auth/login', '/api/auth/register']) {
      const response = await write(path)
        .set('X-Forwarded-For', '198.51.100.1')
        .send(credentials)
        .expect(429);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    clock.mockReturnValue(now + 59999);
    await write('/api/auth/login').send(credentials).expect(429);
    expect(database.user.findUnique).not.toHaveBeenCalled();
    expect(database.user.create).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 60000);
    await write('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200, publicUser);
  });
});
