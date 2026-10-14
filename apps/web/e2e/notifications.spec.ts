import { expect, test } from '@playwright/test';
import { ADMIN_STATE, VIEWER_STATE, settled } from './helpers';

test.describe('In-app notifications', () => {
  // Viewer has the seeded unread notifications to itself in this spec (read state is per user).
  test.use({ storageState: VIEWER_STATE });

  test('bell opens a panel in place; opening an item marks it read and follows its link', async ({ page }) => {
    await page.goto('/dashboard');
    const bell = page.locator('button.bell');
    await expect(bell).toHaveAttribute('aria-label', /^Notifications, \d+ unread$/);
    const before = Number((await bell.getAttribute('aria-label'))!.match(/(\d+) unread/)![1]);

    // Opens over the current page instead of navigating.
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(bell).toHaveAttribute('aria-expanded', 'true');

    // Escape closes it (native popover light dismiss).
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    await bell.click();
    await panel.getByRole('button', { name: /CI \/ Jest & Playwright #143 failed/ }).click();
    await expect(page).toHaveURL(/\/workflow-runs\/[0-9a-f-]{36}$/);
    await expect(panel).toBeHidden();
    await expect(bell).toHaveAttribute('aria-label', before - 1 > 0 ? `Notifications, ${before - 1} unread` : 'Notifications');
  });

  test('panel links to the full notifications page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('button.bell').click();
    await page.getByRole('dialog', { name: 'Notifications' }).getByRole('link', { name: 'View all notifications' }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  });

  test('unread filter and mark all as read', async ({ page }) => {
    await page.goto('/notifications?show=unread');
    await settled(page);
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByText('You are all caught up')).toBeVisible();
    await expect(page.locator('button.bell')).toHaveAttribute('aria-label', 'Notifications');

    await page.getByRole('tab', { name: 'All' }).click();
    await expect(page.getByRole('button', { name: /Payment Authorization API/ })).toBeVisible();
  });

  test('viewers cannot manage channels', async ({ page }) => {
    await page.goto('/settings/notifications');
    await expect(page.getByText('Only owners and admins can manage notification channels.')).toBeVisible();
  });
});

test.describe('Notification channels (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('add a Slack channel: URL is validated, stored masked, and can be deleted', async ({ page }) => {
    await page.goto('/settings/notifications');
    await settled(page);
    await expect(page.locator('li', { hasText: '#devops-deployments (demo, disabled)' })).toBeVisible();

    const form = page.locator('form.channel-form');
    await form.getByLabel('Name').fill('#e2e-alerts');
    await form.getByLabel('URL').fill('https://evil.example/hooks.slack.com/services/x');
    await form.getByRole('button', { name: 'Add channel' }).click();
    await expect(form.locator('.form-error')).toContainText('hooks.slack.com');

    await form.getByLabel('URL').fill('https://hooks.slack.com/services/T0/B0/e2e-secret-abcd');
    await form.getByLabel('Service down').check();
    await form.getByRole('button', { name: 'Add channel' }).click();

    const row = page.locator('li', { hasText: '#e2e-alerts' });
    await expect(row).toBeVisible();
    await expect(row.getByText('https://hooks.slack.com/…abcd')).toBeVisible();
    await expect(row.getByText('Service down', { exact: true })).toBeVisible();
    await expect(page.getByText('e2e-secret')).toHaveCount(0);

    await row.getByRole('button', { name: 'Disable' }).click();
    await expect(row.getByRole('button', { name: 'Enable' })).toBeVisible();

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete channel' }).click();
    await expect(page.locator('li', { hasText: '#e2e-alerts' })).toHaveCount(0);
  });

  test('delivery history renders with filters', async ({ page }) => {
    await page.goto('/settings/notifications?status=FAILED');
    await settled(page);
    await expect(page.getByRole('heading', { name: 'Delivery history' })).toBeVisible();
    await expect(page.getByLabel('Status')).toHaveValue('FAILED');
  });
});
