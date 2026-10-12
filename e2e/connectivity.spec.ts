import { expect, test } from '@playwright/test';

test('shows that the frontend reached both API and database', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Service connectivity' })).toBeVisible();
  await expect(page.getByText('All services connected')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Web → API')).toBeVisible();
  await expect(page.getByText('API → Database')).toBeVisible();
});
