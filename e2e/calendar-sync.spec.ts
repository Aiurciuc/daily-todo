import { expect, test } from '@playwright/test';

test('10-second polling synchronizes shared tasks without resetting the calendar (mock API)', async ({
  page,
}) => {
  await page.clock.install();
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const shared = {
    id: 10,
    title: 'Shared by owner',
    date,
    startMinute: null,
    durationMinutes: null,
    completed: false,
    visibility: 'SHARED',
    notes: 'Original notes',
    sharedWith: 'reader@example.test',
    canEdit: false,
  };
  let tasks: (typeof shared)[] = [];
  let reads = 0;
  let fail = false;
  let expired = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      await route.fulfill({ json: { id: 2, name: 'Reader', email: 'reader@example.test' } });
    } else if (path === '/api/tasks') {
      reads++;
      await route.fulfill(
        expired
          ? { status: 401, json: { message: 'Unauthorized' } }
          : fail
            ? { status: 503, json: { message: 'Unavailable' } }
            : { json: tasks },
      );
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });
  await page.goto('/');
  await expect(page.locator('.calendar-scroll')).toBeVisible();
  await expect.poll(() => reads).toBe(1);
  const grid = await page.locator('.calendar-scroll').elementHandle();
  await page.locator('.calendar-scroll').evaluate((element) => {
    element.scrollTop = 900;
  });

  tasks = [shared]; // The owner shared an existing task with this reader.
  await page.clock.runFor(10_000);
  const block = page.locator('terra-task-block').filter({ hasText: shared.title });
  await expect(block).toBeVisible();
  await block.click();
  await expect(page.locator('app-task-details')).toContainText('Original notes');
  await expect(
    page.locator('app-task-details').getByRole('button', { name: /Edit|Delete|Complete/ }),
  ).toHaveCount(0);
  await expect(page.getByText('Loading tasks…', { exact: true })).toHaveCount(0);
  expect(
    await grid!.evaluate((element) => element === document.querySelector('.calendar-scroll')),
  ).toBe(true);
  expect(await page.locator('.calendar-scroll').evaluate((element) => element.scrollTop)).toBe(900);

  tasks = [{ ...shared, title: 'Updated by owner', notes: 'Updated remotely', completed: true }];
  await page.clock.runFor(10_000);
  await expect(page.locator('app-task-details')).toContainText('Updated remotely');
  await expect(
    page.locator('terra-task-block').filter({ hasText: 'Updated by owner' }),
  ).toBeVisible();

  fail = true;
  await page.clock.runFor(10_000);
  await expect(page.locator('app-task-details')).toContainText('Updated remotely');
  await expect(page.getByText('Unable to load tasks.', { exact: false })).toHaveCount(0);
  fail = false;
  tasks = []; // Owner deleted it, unshared it, or moved it out of this range.
  await page.clock.runFor(10_000);
  await expect(page.locator('terra-task-block')).toHaveCount(0);
  await expect(page.locator('app-task-details')).toHaveCount(0);

  expired = true;
  await page.clock.runFor(10_000);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('app-calendar-preview')).toHaveCount(0);
  const afterLogout = reads;
  await page.clock.runFor(20_000);
  expect(reads).toBe(afterLogout);
});
