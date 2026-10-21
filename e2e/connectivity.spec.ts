import { expect, test } from '@playwright/test';

test('keeps independent health endpoints', async ({ request }) => {
  const live = await request.get('/api/health/live');
  expect(live.ok()).toBeTruthy();
  expect(await live.json()).toEqual({ api: 'ok' });
  const ready = await request.get('/api/health/ready');
  expect(ready.ok()).toBeTruthy();
  expect(await ready.json()).toEqual({ api: 'ok', database: 'ok' });
});

test('persists calendar creation, edits, completion, date moves and deletion', async ({ page, baseURL }) => {
  // The page context shares the HttpOnly session cookie with its request client.
  const request = page.request;
  const registration = await request.post('/api/auth/register', {
    headers: { Origin: new URL(baseURL!).origin },
    data: { name: 'Calendar browser test', email: `calendar-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, password: 'Browser-test-password-2026!' },
  });
  expect(registration.status()).toBe(201);
  const title = `Browser calendar ${Date.now()}`;
  const updatedTitle = `${title} updated`;
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let id: number | undefined;
  try {
    await page.goto('/');
    await expect(page.getByText('Loading tasks…')).toBeHidden();
    await page.getByRole('button', { name: 'New Task', exact: false }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Task name').fill(title);
    await dialog.getByLabel('Date', { exact: true }).fill(date);
    await dialog.getByLabel('Start time').fill('09:37');
    await dialog.getByLabel('Duration (minutes)').fill('47');
    await dialog.getByLabel('Notes').fill('Persisted browser notes');
    await dialog.getByLabel('Team label (optional)').fill('Design');
    await dialog.getByRole('radio', { name: /Shared/ }).check();
    const creation = page.waitForResponse((response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    const created = await creation;
    expect(created.status()).toBe(201);
    id = (await created.json()).id;
    const details = page.locator('.details');
    await expect(details.getByRole('heading', { name: title })).toBeVisible();
    await expect(details).toContainText('09:37');
    await expect(details).toContainText('Persisted browser notes');
    await page.reload();
    const block = page.locator('terra-task-block button').filter({ hasText: title });
    await block.click();
    await expect(details.getByRole('heading', { name: title })).toBeVisible();
    await details.getByRole('button', { name: /Mark Completed/ }).click();
    await expect(details.getByRole('button', { name: /Reopen task/ })).toBeVisible();
    await page.reload();
    await block.click();
    await expect(details.getByRole('button', { name: /Reopen task/ })).toBeVisible();
    await details.getByRole('button', { name: /Reopen task/ }).click();
    await expect(details.getByRole('button', { name: /Mark Completed/ })).toBeVisible();

    await details.getByRole('button', { name: 'Edit task', exact: true }).click();
    await dialog.getByLabel('Task name').fill(updatedTitle);
    await dialog.getByLabel('No scheduled time').check();
    await dialog.getByRole('radio', { name: /Private/ }).check();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(details.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await expect(page.locator('.unscheduled-tasks')).toContainText(updatedTitle);
    await page.locator('.filters').getByRole('button', { name: /Shared/ }).click();
    await expect(page.locator('.unscheduled-tasks')).not.toContainText(updatedTitle);
    await page.locator('.filters').getByRole('button', { name: /Private/ }).click();
    await expect(page.locator('.unscheduled-tasks')).toContainText(updatedTitle);

    await details.getByRole('button', { name: 'Edit task', exact: true }).click();
    // Moving dates uses a full replacement; completion and metadata survive.
    const moved = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const movedDate = `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
    await dialog.getByLabel('Date', { exact: true }).fill(movedDate);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(details.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await page.reload();
    // Reload starts at today; a copied task link opens its actual date.
    await page.goto(`/?date=${movedDate}&task=${id}`);
    await expect(details.getByRole('heading', { name: updatedTitle })).toBeVisible();
    const saved = await request.get(`/api/tasks?date=${movedDate}`);
    expect((await saved.json()).find((task: { id: number }) => task.id === id)).toMatchObject({
      title: updatedTitle, completed: false, notes: 'Persisted browser notes', startMinute: null, durationMinutes: null,
    });
    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByRole('button', { name: 'Delete task', exact: true }).click();
    await expect(details).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.unscheduled-tasks')).not.toContainText(updatedTitle);
    const remaining = await request.get(`/api/tasks?date=${movedDate}`);
    expect((await remaining.json()).some((task: { id: number }) => task.id === id)).toBe(false);
  } finally {
    if (id) await request.delete(`/api/tasks/${id}`, { headers: { Origin: new URL(baseURL!).origin } });
  }
});
