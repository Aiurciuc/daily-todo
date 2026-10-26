import { expect, test } from '@playwright/test';

// Registers users and creates tasks: run only against a disposable, migrated database.
test('shares a task by email into another account calendar and revokes access', async ({
  browser,
  baseURL,
}) => {
  // The real API permits ten authentication attempts per minute per client IP.
  test.setTimeout(90_000);
  const owner = await browser.newContext({ baseURL });
  const recipient = await browser.newContext({ baseURL });
  const stranger = await browser.newContext({ baseURL });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const recipientEmail = `recipient-${suffix}@example.test`;
  const origin = new URL(baseURL!).origin;
  const headers = { Origin: origin };
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const title = `Shared review ${suffix}`;
  let id: number | undefined;
  try {
    for (const [context, name, email] of [
      [owner, 'Task owner', `owner-${suffix}@example.test`],
      [recipient, 'Task recipient', recipientEmail],
      [stranger, 'Unrelated user', `stranger-${suffix}@example.test`],
    ] as const) {
      const register = () =>
        context.request.post('/api/auth/register', {
          headers,
          data: { name, email, password: 'Sharing-browser-password-2026!' },
        });
      let result = await register();
      if (result.status() === 429) {
        // Other real-server tests share this IP; do not weaken production throttling.
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        result = await register();
      }
      expect(result.status()).toBe(201);
    }
    const ownerPage = await owner.newPage();
    await ownerPage.goto('/');
    await ownerPage.getByRole('button', { name: 'New Task', exact: true }).click();
    const dialog = ownerPage.getByRole('dialog');
    await dialog.getByLabel('Task name', { exact: true }).fill(title);
    await dialog.getByLabel('Date', { exact: true }).fill(date);
    await dialog.getByLabel('No scheduled time', { exact: true }).check();
    await dialog.getByLabel('Notes', { exact: true }).fill('Visible in both calendars.');
    await dialog.locator('input[name="visibility"][value="SHARED"]').check();
    await dialog
      .getByLabel('Recipient email', { exact: true })
      .fill(`missing-${suffix}@example.test`);
    const rejection = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    expect((await rejection).status()).toBe(400);
    await expect(dialog.getByRole('alert')).toContainText('registered user');
    await expect(dialog.getByLabel('Task name', { exact: true })).toHaveValue(title);
    await dialog.getByLabel('Recipient email', { exact: true }).fill(recipientEmail.toUpperCase());
    const creation = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    const response = await creation;
    expect(response.status()).toBe(201);
    const created = await response.json();
    id = created.id;
    expect(created).toMatchObject({ canEdit: true, sharedWith: recipientEmail });
    await expect(dialog).not.toBeVisible();

    const recipientPage = await recipient.newPage();
    await recipientPage.goto(`/?task=${id}&date=${date}`);
    const details = recipientPage.getByRole('region', { name: 'Selected task' });
    await expect(details.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(details).toContainText('Visible in both calendars.');
    await expect(details.getByRole('button', { name: 'Edit task', exact: true })).toHaveCount(0);
    await expect(details.getByRole('button', { name: 'Delete task', exact: true })).toHaveCount(0);
    await expect(details.getByRole('button', { name: 'Mark Completed', exact: true })).toHaveCount(
      0,
    );
    const received = await recipient.request.get(`/api/tasks?date=${date}`);
    expect(await received.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, canEdit: false })]),
    );
    const unrelated = await stranger.request.get(`/api/tasks?date=${date}`);
    expect((await unrelated.json()).some((task: { id: number }) => task.id === id)).toBe(false);

    for (const context of [recipient, stranger]) {
      expect(
        (
          await context.request.patch(`/api/tasks/${id}`, { headers, data: { completed: true } })
        ).status(),
      ).toBe(404);
      expect(
        (
          await context.request.put(`/api/tasks/${id}`, {
            headers,
            data: { title: 'Stolen', date },
          })
        ).status(),
      ).toBe(404);
      expect((await context.request.delete(`/api/tasks/${id}`, { headers })).status()).toBe(404);
    }
    await ownerPage.getByRole('button', { name: 'Edit task', exact: true }).click();
    await dialog.getByLabel('Task name', { exact: true }).fill(`${title} updated`);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await recipientPage.reload();
    await expect(
      details.getByRole('heading', { name: `${title} updated`, exact: true }),
    ).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Edit task', exact: true }).click();
    await dialog.locator('input[name="visibility"][value="PRIVATE"]').check();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await recipientPage.reload();
    await expect(
      recipientPage.getByRole('heading', { name: `${title} updated`, exact: true }),
    ).toHaveCount(0);
    const revoked = await recipient.request.get(`/api/tasks?date=${date}`);
    expect((await revoked.json()).some((task: { id: number }) => task.id === id)).toBe(false);
  } finally {
    if (id !== undefined) await owner.request.delete(`/api/tasks/${id}`, { headers });
    await Promise.all([owner.close(), recipient.close(), stranger.close()]);
  }
});
