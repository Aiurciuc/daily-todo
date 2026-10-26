import { expect, test } from '@playwright/test';

test('untimed tasks stay above the timeline in their day columns while scrolling (mock API)', async ({ page }) => {
  const monday = new Date();
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const date = (day: number) => {
    const value = new Date(monday);
    value.setDate(value.getDate() + day);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };
  const base = { completed: false, visibility: 'PRIVATE', notes: null, sharedWith: null };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === '/api/auth/me'
      ? { id: 1, name: 'Taylor', email: 'taylor@example.test' }
      : path === '/api/tasks'
        ? [
          { ...base, id: 1, title: 'Monday anytime', date: date(0), startMinute: null, durationMinutes: null },
          { ...base, id: 2, title: 'Wednesday anytime', date: date(2), startMinute: null, durationMinutes: null },
          { ...base, id: 3, title: 'Midnight scheduled', date: date(0), startMinute: 0, durationMinutes: 60 },
        ]
        : { status: 'ok' } });
  });
  await page.goto('/');
  const cells = page.locator('.untimed-day');
  await expect(cells).toHaveCount(7);
  await expect(cells.nth(0)).toContainText('Monday anytime');
  await expect(cells.nth(1).locator('terra-task-block')).toHaveCount(0);
  await expect(cells.nth(2)).toContainText('Wednesday anytime');
  await expect(page.locator('.calendar-body terra-task-block')).toHaveCount(1);
  await expect(page.locator('.calendar-body')).toContainText('Midnight scheduled');
  const cellBox = await cells.nth(2).boundingBox();
  const dayBox = await page.locator('.day-column').nth(2).boundingBox();
  expect(Math.abs(cellBox!.x - dayBox!.x)).toBeLessThan(1);
  expect(Math.abs(cellBox!.width - dayBox!.width)).toBeLessThan(1);
  const top = (await page.locator('.calendar-top').boundingBox())!.y;
  await page.locator('.calendar-scroll').evaluate((element) => { element.scrollTop = 900; });
  await expect.poll(async () => (await page.locator('.calendar-top').boundingBox())!.y).toBeCloseTo(top, 0);
  await expect(cells.nth(2).getByRole('button')).toBeInViewport();
  await cells.nth(2).getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Wednesday anytime' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.calendar-scroll').evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const narrowCell = await cells.nth(2).boundingBox();
  const narrowDay = await page.locator('.day-column').nth(2).boundingBox();
  expect(Math.abs(narrowCell!.x - narrowDay!.x)).toBeLessThan(1);
});
