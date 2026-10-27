import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`header shows navigation and views with shared and private tasks together at ${width}px (mock API)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let reads = 0;
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') {
        await route.fulfill({ json: { id: 1, name: 'Taylor', email: 'taylor@example.test' } });
      } else {
        reads++;
        const base = {
          date: url.searchParams.get('from'), startMinute: null, durationMinutes: null,
          completed: false, notes: null, canEdit: true,
        };
        await route.fulfill({ json: [
          { ...base, id: 1, title: 'Private work', visibility: 'PRIVATE', sharedWith: null },
          { ...base, id: 2, title: 'Shared work', visibility: 'SHARED', sharedWith: 'reader@example.test' },
        ] });
      }
    });
    await page.goto('/');
    const header = page.locator('app-calendar-header');
    await expect(page.locator('app-calendar-toolbar')).toHaveCount(0);
    await expect(header.getByRole('group', { name: 'Task visibility', exact: true })).toHaveCount(0);
    await expect(header.locator('terra-segmented-filter')).toHaveCount(1);
    await expect(page.locator('.untimed-task')).toHaveCount(2);
    await expect(page.locator('.unscheduled-tasks')).toContainText('Private work');
    await expect(page.locator('.unscheduled-tasks')).toContainText('Shared work');
    const initialReads = reads;
    await header.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect.poll(() => reads).toBeGreaterThan(initialReads);
    await header.getByRole('button', { name: /^Today/ }).click();
    await header.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(page.locator('app-calendar-month-view')).toBeVisible();
    await header.getByRole('button', { name: 'Day', exact: true }).click();
    await expect(page.locator('.day-column')).toHaveCount(1);
    await header.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('.day-column')).toHaveCount(7);
    await expect(header.locator('.topbar-range')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await header.getByRole('button', { name: 'New Task', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}
