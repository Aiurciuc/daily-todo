import { expect, test } from '@playwright/test';

// Run only against a disposable test database: these tests create accounts.
test('authenticates accounts and isolates every task operation', async ({ playwright, baseURL }) => {
  const options = { baseURL, extraHTTPHeaders: { Origin: new URL(baseURL!).origin, 'Content-Type': 'application/json' } };
  const first = await playwright.request.newContext(options);
  const second = await playwright.request.newContext(options);
  const anonymous = await playwright.request.newContext(options);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const credentials = { email: `owner-${suffix}@example.test`, password: 'Owner-password-2026!' };
  let id: number | undefined;
  try {
    expect((await anonymous.get('/api/tasks?date=2026-10-22')).status()).toBe(401);
    expect((await first.post('/api/auth/register', { data: { ...credentials, name: 'Owner' } })).status()).toBe(201);
    expect((await second.post('/api/auth/register', { data: { name: 'Other account', email: `other-${suffix}@example.test`, password: 'Other-password-2026!' } })).status()).toBe(201);
    const task = { title: `Private task ${suffix}`, date: '2026-10-22' };
    const created = await first.post('/api/tasks', { data: task });
    expect(created.status()).toBe(201);
    id = (await created.json()).id;
    const otherList = await second.get('/api/tasks?date=2026-10-22');
    expect(await otherList.json()).toEqual([]);
    expect(await (await second.get('/api/tasks?from=2026-10-22&to=2026-10-23')).json()).toEqual([]);
    expect((await second.put(`/api/tasks/${id}`, { data: task })).status()).toBe(404);
    expect((await second.patch(`/api/tasks/${id}`, { data: { completed: true } })).status()).toBe(404);
    expect((await second.delete(`/api/tasks/${id}`)).status()).toBe(404);
    expect((await second.patch('/api/tasks/order', { data: { date: task.date, ids: [id] } })).status()).toBe(409);
    expect((await first.post('/api/auth/logout')).status()).toBe(204);
    expect((await first.get('/api/auth/me')).status()).toBe(401);
    expect((await first.post('/api/auth/login', { data: { ...credentials, password: 'Wrong-password-2026!' } })).status()).toBe(401);
    expect((await first.post('/api/auth/login', { data: credentials })).ok()).toBeTruthy();
    const ownList = await first.get('/api/tasks?date=2026-10-22');
    expect(await ownList.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id, title: task.title })]));
  } finally {
    if (id) {
      await first.post('/api/auth/login', { data: credentials });
      await first.delete(`/api/tasks/${id}`);
    }
    await first.dispose();
    await second.dispose();
    await anonymous.dispose();
  }
});
