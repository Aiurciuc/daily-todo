import { expect, test } from '@playwright/test';

// UI-only checks: the API is mocked; backend enforcement has separate tests.
test.beforeEach(async ({ page }) => {
  let signedIn = false;
  const user = { id: 1, name: 'Taylor', email: 'taylor@example.test' };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      await route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? user : { message: 'Unauthorized' } });
    } else if (path === '/api/auth/register' || path === '/api/auth/login') {
      if (route.request().postDataJSON().password === 'wrong-password') {
        await route.fulfill({ status: 401, json: { message: 'Invalid email or password' } });
      } else {
        signedIn = true;
        await route.fulfill({ json: user });
      }
    } else if (path === '/api/auth/logout') {
      signedIn = false;
      await route.fulfill({ status: 204 });
    } else if (path === '/api/tasks') {
      await route.fulfill({ json: [] });
    } else {
      await route.fulfill({ json: { status: 'ok' } });
    }
  });
});

test('signup, restored calendar session, signout and login (mock API)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Taylor');
  await page.getByLabel('Email address', { exact: true }).fill('taylor@example.test');
  await page.getByLabel('Password', { exact: true }).fill('eight123');
  await page.getByLabel('Confirm password', { exact: true }).fill('eight123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email address', { exact: true }).fill('taylor@example.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await page.getByLabel('Password', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
});

test('mobile signup validation and password visibility (mock API)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('Your name', { exact: true }).fill('Taylor');
  await page.getByLabel('Email address', { exact: true }).fill('taylor@example.test');
  await page.getByLabel('Password', { exact: true }).fill('correct-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Passwords must match.')).toBeVisible();
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAttribute('type', 'text');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/auth-mobile.png', fullPage: true });
});
