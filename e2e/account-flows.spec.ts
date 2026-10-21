import { expect, test } from '@playwright/test';

// Creates an account; use only a disposable database.
test('creates an account, restores its session, signs out and signs back in', async ({ page }) => {
  const email = `browser-auth-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = 'Browser-auth-password-2026!';
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Browser Auth User');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
});
