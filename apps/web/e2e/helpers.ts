import { expect, Page } from '@playwright/test';
import * as path from 'path';

export const ADMIN = { email: 'admin@deploywatch.dev', password: 'password123' };
export const VIEWER = { email: 'viewer@deploywatch.dev', password: 'password123' };

export const ADMIN_STATE = path.join(__dirname, '.auth', 'admin.json');
export const VIEWER_STATE = path.join(__dirname, '.auth', 'viewer.json');

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

/** Waits until the page has finished its data fetches. */
export async function settled(page: Page) {
  await expect(page.getByText(/Loading…|Checking your session…/)).toHaveCount(0);
}
