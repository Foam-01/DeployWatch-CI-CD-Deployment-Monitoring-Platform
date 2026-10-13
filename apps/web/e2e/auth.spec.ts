import { expect, test } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Authentication', () => {
  test('wrong password shows an error and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected pages redirect to login and return after signing in', async ({ page }) => {
    await page.goto('/workflow-runs');
    await expect(page).toHaveURL(/\/login\?next=%2Fworkflow-runs/);

    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/workflow-runs$/);
  });

  test('session survives a reload (HttpOnly refresh cookie) and is not in localStorage', async ({ page }) => {
    await login(page, ADMIN);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(stored).not.toMatch(/eyJ/); // no JWT persisted in web storage
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'dw_refresh')?.httpOnly).toBe(true);
  });

  test('sign out ends the session', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a new user can register and lands on an empty workspace', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill('E2E User');
    await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.test`);
    await page.getByLabel('Password').fill('short');
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();

    await page.getByLabel('Password').fill('a-long-enough-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page.getByText('No projects yet')).toBeVisible();
  });
});
