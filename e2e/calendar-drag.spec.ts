import { expect, test, type Locator, type Page } from '@playwright/test';

test('drags calendar tasks across days and times, persists moves and keeps received tasks read-only (mock API)', async ({
  page,
}) => {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const date = (day: number) => {
    const value = new Date(monday);
    value.setDate(value.getDate() + day);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };
  const base = {
    completed: true,
    visibility: 'PRIVATE',
    notes: 'Keep my notes',
    sharedWith: null,
    canEdit: true,
  };
  let tasks = [
    {
      ...base,
      id: 1,
      title: 'Move me',
      date: date(0),
      startMinute: 540 as number | null,
      durationMinutes: 60 as number | null,
    },
    {
      ...base,
      id: 2,
      title: 'Received read-only',
      date: date(2),
      startMinute: 660 as number | null,
      durationMinutes: 60 as number | null,
      visibility: 'SHARED',
      sharedWith: 'viewer@example.test' as string | null,
      canEdit: false,
    },
    {
      ...base,
      id: 3,
      title: 'Anytime task',
      date: date(0),
      startMinute: null as number | null,
      durationMinutes: null as number | null,
    },
  ];
  const updates: unknown[] = [];
  let rejectUpdate = false;
  let reads = 0;
  let confirmFirstMove!: () => void;
  const firstMoveResponse = new Promise<void>((resolve) => {
    confirmFirstMove = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') {
      await route.fulfill({
        json: { id: 1, name: 'Calendar owner', email: 'viewer@example.test' },
      });
    } else if (request.method() === 'PUT') {
      updates.push(request.postDataJSON());
      if (rejectUpdate) {
        await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        return;
      }
      if (updates.length === 1) await firstMoveResponse;
      const id = Number(path.split('/').pop());
      tasks = tasks.map((task) => (task.id === id ? { ...task, ...request.postDataJSON() } : task));
      await route.fulfill({ json: tasks.find((task) => task.id === id) });
    } else {
      reads++;
      await route.fulfill({ json: tasks });
    }
  });
  await page.goto('/');
  const moving = page.locator('terra-task-block').filter({ hasText: 'Move me' });
  const columns = page.locator('.day-column');
  await expect(moving).toBeVisible();
  const originalGrid = await page.locator('.calendar-scroll').elementHandle();
  await dragToTime(page, moving, columns.nth(1), 10);
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0]).toEqual({
    title: 'Move me',
    date: date(1),
    startMinute: 600,
    durationMinutes: 60,
    visibility: 'PRIVATE',
    notes: 'Keep my notes',
    sharedWith: null,
  });
  await expect(columns.nth(1)).toContainText('Move me');
  await expect(moving).toContainText('10:00');
  expect(reads).toBe(1);
  await expect(page.getByText('Loading tasks…', { exact: true })).not.toBeVisible();
  expect(
    await originalGrid!.evaluate(
      (element) => element === document.querySelector('.calendar-scroll'),
    ),
  ).toBe(true);
  const scrollTop = await page.locator('.calendar-scroll').evaluate((element) => element.scrollTop);
  confirmFirstMove();
  await expect(page.locator('.notice')).toContainText('Task moved.');
  expect(reads).toBe(1);
  expect(await page.locator('.calendar-scroll').evaluate((element) => element.scrollTop)).toBe(
    scrollTop,
  );
  await page.reload();
  await expect(columns.nth(1)).toContainText('Move me');
  await expect(moving.locator('button')).toHaveClass(/completed/);

  rejectUpdate = true;
  await dragToTime(page, moving, columns.nth(2), 10.5);
  await expect.poll(() => updates.length).toBe(2);
  await expect(page.locator('.notice-error[role="alert"]')).toContainText('Could not move task.');
  await expect(page.locator('.notice-error')).toHaveCSS('background-color', 'rgb(255, 240, 239)');
  expect(reads).toBe(2);
  await expect(columns.nth(1)).toContainText('Move me');
  await expect(moving).toHaveCSS('transform', 'none');
  rejectUpdate = false;

  const readonly = page.locator('terra-task-block').filter({ hasText: 'Received read-only' });
  await dragToTime(page, readonly, columns.nth(3), 11);
  expect(updates).toHaveLength(2);
  await expect(columns.nth(2)).toContainText('Received read-only');

  const untimed = page.locator('.untimed-day').nth(3);
  await dragToPoint(page, moving, untimed, 16);
  await expect.poll(() => updates.length).toBe(3);
  expect(updates[2]).toMatchObject({ date: date(3), startMinute: null, durationMinutes: null });
  await expect(untimed).toContainText('Move me');
  await dragToTime(page, moving, columns.nth(4), 11);
  await expect.poll(() => updates.length).toBe(4);
  expect(updates[3]).toMatchObject({ date: date(4), startMinute: 660, durationMinutes: 60 });
  await expect(columns.nth(4)).toContainText('Move me');
  await dragToTime(page, moving, columns.nth(4), 11);
  expect(updates).toHaveLength(4);
  await expect(moving).toBeInViewport();
  await page.locator('terra-calendar-day-header').nth(4).getByRole('button').click();
  await page
    .getByRole('group', { name: 'Calendar view', exact: true })
    .getByRole('button', { name: 'Day', exact: true })
    .click();
  await expect(columns).toHaveCount(1);
  await dragToTime(page, moving, columns.first(), 12);
  await expect.poll(() => updates.length).toBe(5);
  expect(updates[4]).toMatchObject({ date: date(4), startMinute: 720, durationMinutes: 60 });
  await expect(moving).toContainText('12:00');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

async function dragToTime(page: Page, source: Locator, target: Locator, hour: number) {
  await dragToPoint(page, source, target, hour * 64 + 8);
}

async function dragToPoint(page: Page, source: Locator, target: Locator, offsetY: number) {
  const start = await source.boundingBox();
  const end = await target.boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + 8);
  await page.mouse.down();
  // Cross the drag threshold vertically too: saved time must retain the original pickup offset.
  await page.mouse.move(start!.x + start!.width / 2 + 8, start!.y + 32, { steps: 4 });
  await page.mouse.move(end!.x + end!.width / 2, end!.y + offsetY, { steps: 20 });
  await page.mouse.up();
}
