import { expect, test } from '@playwright/test';
import { ADMIN_STATE, VIEWER_STATE, settled } from './helpers';

test.describe('Monitoring flows (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('dashboard → project → workflow run detail shows commit and source link', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Active projects')).toBeVisible();

    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await page.getByRole('link', { name: 'Storefront Web', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Storefront Web', exact: true })).toBeVisible();
    await expect(page.getByText('acme-cloud/storefront-web')).toBeVisible();

    await page.getByRole('link', { name: /Deploy Production #142/ }).click();
    await expect(page.getByRole('heading', { name: 'Deploy Production #142' })).toBeVisible();
    const details = page.locator('dl');
    await expect(details.getByText(/^d9e4a8b/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Open on GitHub/ })).toHaveAttribute('href', /github\.com/);
  });

  test('workflow run filters live in the URL and narrow the results', async ({ page }) => {
    await page.goto('/workflow-runs');
    await settled(page);
    await expect(page.getByRole('row')).toHaveCount(4); // header + 3 seeded runs

    await page.getByLabel('Conclusion').selectOption('FAILURE');
    await expect(page).toHaveURL(/conclusion=FAILURE/);
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('link', { name: /CI \/ Jest & Playwright #143/ })).toBeVisible();

    // A shared or bookmarked URL restores the same filtered view.
    await page.reload();
    await expect(page.getByLabel('Conclusion')).toHaveValue('FAILURE');
    await expect(page.getByRole('row')).toHaveCount(2);
  });

  test('admin creates a project and sees it in the list', async ({ page }) => {
    await page.goto('/projects/new');
    const name = `E2E Project ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();

    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page.getByRole('link', { name })).toBeVisible();
  });

  test('incident detail shows the timeline', async ({ page }) => {
    await page.goto('/incidents');
    await page.getByRole('link', { name: /Payment Authorization API/ }).click();
    const timeline = page.locator('section', { has: page.getByRole('heading', { name: 'Timeline' }) });
    await expect(timeline.getByText('OPENED')).toBeVisible();
    await expect(timeline.getByText(/auto-detected outage/)).toBeVisible();
  });

  test('unknown IDs show a not-found state instead of crashing', async ({ page }) => {
    await page.goto('/workflow-runs/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('Not found')).toBeVisible();
  });
});

test.describe('Monitoring flows (viewer)', () => {
  test.use({ storageState: VIEWER_STATE });

  test('viewer sees data but no mutation controls', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: 'Storefront Web', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New project' })).toHaveCount(0);

    await page.goto('/incidents');
    await page.getByRole('link', { name: /Payment Authorization API/ }).click();
    await expect(page.getByText('Viewers cannot change incident status.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve incident' })).toHaveCount(0);
  });
});
