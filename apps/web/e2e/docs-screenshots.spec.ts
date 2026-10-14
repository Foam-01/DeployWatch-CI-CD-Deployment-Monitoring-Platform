import { expect, Page, test } from '@playwright/test';
import * as path from 'path';
import { ADMIN, ADMIN_STATE, VIEWER_STATE, settled } from './helpers';

/**
 * Regenerates the README screenshots in docs/images from the running app and the
 * large demo dataset. Not part of the normal E2E run:
 *
 *   npm run test:db:up
 *   npm run docs:screenshots -w apps/web
 */
test.skip(!process.env.DOCS_SCREENSHOTS, 'run with DOCS_SCREENSHOTS=1 (npm run docs:screenshots)');
test.describe.configure({ mode: 'serial' });

const OUT = path.resolve(__dirname, '../../../docs/images');
const DESKTOP = { width: 1440, height: 900 };

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  await settled(page);
  // Let charts and fonts finish painting.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.fullPage ?? false });
}

test.describe('public pages', () => {
  test.use({ viewport: DESKTOP });

  test('login and register', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await shot(page, '01-login');

    await page.goto('/register');
    await page.getByLabel('Name').fill('New Teammate');
    await page.getByLabel('Email').fill('teammate@example.com');
    await page.getByLabel('Password').fill('short');
    await shot(page, '02-register-validation');
  });
});

test.describe('signed in as owner', () => {
  test.use({ storageState: ADMIN_STATE, viewport: DESKTOP });

  test('dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Delivery trends')).toBeVisible();
    await shot(page, '03-dashboard', { fullPage: true });

    await page.locator('button.bell').click();
    await expect(page.getByRole('dialog', { name: 'Notifications' }).getByRole('button').nth(2)).toBeVisible();
    await shot(page, '04-notification-panel');
  });

  test('projects', async ({ page }) => {
    await page.goto('/projects');
    await shot(page, '05-projects');

    await page.getByRole('link', { name: 'Storefront Web', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Storefront Web' })).toBeVisible();
    await shot(page, '06-project-detail', { fullPage: true });

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible();
    await shot(page, '07-project-settings', { fullPage: true });

    const checks = page.locator('section', { has: page.getByRole('heading', { name: 'Health checks' }) });
    await checks.getByRole('button', { name: 'Add service' }).click();
    await checks.getByLabel('Name').fill('Checkout API');
    await checks.getByLabel('Health URL').fill('http://169.254.169.254/latest/meta-data/');
    await checks.getByRole('button', { name: 'Add service' }).last().click();
    await expect(checks.locator('.form-error')).toBeVisible();
    await checks.scrollIntoViewIfNeeded();
    await shot(page, '08-service-form-ssrf-blocked');

    await page.goto('/projects/new');
    await page.getByLabel('Name').fill('Search Service');
    await page.getByLabel(/Description/).fill('Typesense cluster and indexing jobs.');
    await shot(page, '09-new-project');
  });

  test('archive confirmation dialog', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('link', { name: 'Internal Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '10-confirm-dialog');
    await page.keyboard.press('Escape');
  });

  test('workflow runs', async ({ page }) => {
    await page.goto('/workflow-runs');
    await shot(page, '11-workflow-runs');

    await page.goto('/workflow-runs?conclusion=FAILURE');
    await shot(page, '12-workflow-runs-filtered');

    await page.locator('table a[href^="/workflow-runs/"]').first().click();
    await expect(page.getByRole('link', { name: /Open on GitHub/ })).toBeVisible();
    await shot(page, '13-workflow-run-detail', { fullPage: true });
  });

  test('deployments and comparison', async ({ page }) => {
    await page.goto('/deployments');
    await shot(page, '14-deployments', { fullPage: true });
  });

  test('services and incidents', async ({ page }) => {
    await page.goto('/services');
    await shot(page, '15-services');

    await page.getByRole('link', { name: 'Card Authorization Webhook API' }).click();
    await expect(page.getByRole('heading', { name: 'Latency' })).toBeVisible();
    await shot(page, '16-service-detail', { fullPage: true });

    await page.goto('/incidents');
    await shot(page, '17-incidents');

    await page.locator('table a[href^="/incidents/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await shot(page, '18-incident-detail', { fullPage: true });

    await page.goto('/incidents?status=RESOLVED');
    await page.locator('table a[href^="/incidents/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await shot(page, '19-incident-resolved-timeline', { fullPage: true });
  });

  test('notifications', async ({ page }) => {
    await page.goto('/notifications');
    await shot(page, '20-notifications');

    await page.goto('/settings/notifications');
    await expect(page.getByRole('heading', { name: 'Delivery history' })).toBeVisible();
    await shot(page, '21-notification-channels', { fullPage: true });
  });

  test('organization settings', async ({ page }) => {
    await page.goto('/settings/members');
    await shot(page, '22-members', { fullPage: true });

    await page.goto('/settings/integrations');
    await shot(page, '23-integrations', { fullPage: true });

    await page.goto('/settings/audit-logs');
    await shot(page, '24-audit-log');
  });

  test('API documentation', async ({ page }) => {
    const apiPort = process.env.E2E_API_PORT ?? '4100';
    await page.goto(`http://localhost:${apiPort}/api/docs`);
    await expect(page.getByText('DeployWatch API').first()).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '25-swagger.png') });
  });
});

test.describe('signed in as viewer', () => {
  test.use({ storageState: VIEWER_STATE, viewport: DESKTOP });

  test('read-only views', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('link', { name: 'Payments Engine', exact: true }).click();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('You have read-only access.')).toBeVisible();
    await shot(page, '26-viewer-read-only');
  });
});

test.describe('mobile', () => {
  test.use({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('dashboard and navigation drawer', async ({ page }) => {
    await page.goto('/dashboard');
    await shot(page, '27-mobile-dashboard');

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.waitForTimeout(300);
    await shot(page, '28-mobile-navigation');
  });
});
