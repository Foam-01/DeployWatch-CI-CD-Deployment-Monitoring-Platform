import { expect, test } from '@playwright/test';
import { ADMIN_STATE, VIEWER_STATE, settled } from './helpers';

/** Creates a fresh project and opens its settings page. */
async function newProjectSettings(page: import('@playwright/test').Page) {
  const name = `Settings ${Date.now()}`;
  await page.goto('/projects/new');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible();
  return name;
}

test.describe('Project settings (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('rename the project', async ({ page }) => {
    const name = await newProjectSettings(page);
    const general = page.locator('section', { has: page.getByRole('heading', { name: 'General' }) });
    await expect(general.getByRole('button', { name: 'Save' })).toBeDisabled();
    await general.getByLabel('Name').fill(`${name} renamed`);
    await general.getByRole('button', { name: 'Save' }).click();
    await expect(general.getByText('Saved.')).toBeVisible();
  });

  test('configure a project-wide failure threshold override', async ({ page }) => {
    await newProjectSettings(page);
    const rules = page.locator('section', { has: page.getByRole('heading', { name: 'Alert rules' }) });
    const enabled = rules.getByLabel('Override all service thresholds');
    const threshold = rules.getByLabel('Consecutive failures before incident');
    await expect(enabled).not.toBeChecked();
    await expect(threshold).toHaveValue('3');

    await threshold.fill('5');
    await enabled.check();
    await rules.getByRole('button', { name: 'Save alert rule' }).click();
    await expect(rules.getByText('Alert rule saved.')).toBeVisible();

    await page.reload();
    const reloadedRules = page.locator('section', { has: page.getByRole('heading', { name: 'Alert rules' }) });
    await expect(reloadedRules.getByLabel('Override all service thresholds')).toBeChecked();
    await expect(reloadedRules.getByLabel('Consecutive failures before incident')).toHaveValue('5');

    await reloadedRules.getByLabel('Override all service thresholds').uncheck();
    await reloadedRules.getByRole('button', { name: 'Save alert rule' }).click();
    await expect(reloadedRules.getByText('Alert rule saved.')).toBeVisible();
    await page.reload();
    const disabledRules = page.locator('section', { has: page.getByRole('heading', { name: 'Alert rules' }) });
    await expect(disabledRules.getByLabel('Override all service thresholds')).not.toBeChecked();
    await expect(disabledRules.getByLabel('Consecutive failures before incident')).toHaveValue('5');
  });

  test('add an environment, then a health check that uses it', async ({ page }) => {
    await newProjectSettings(page);

    // New projects start with Development, Staging and Production.
    const envs = page.locator('section', { has: page.getByRole('heading', { name: 'Environments' }) });
    await expect(envs.getByText('Staging', { exact: true })).toBeVisible();
    await envs.getByLabel('New environment').fill('QA EU');
    await envs.getByRole('button', { name: 'Add environment' }).click();
    await expect(envs.getByText('QA EU', { exact: true })).toBeVisible();

    // Duplicates are rejected with a clear message.
    await envs.getByLabel('New environment').fill('QA EU');
    await envs.getByRole('button', { name: 'Add environment' }).click();
    await expect(envs.locator('.form-error')).toContainText('already exists');

    const checks = page.locator('section', { has: page.getByRole('heading', { name: 'Health checks' }) });
    await checks.getByRole('button', { name: 'Add service' }).click();
    await checks.getByLabel('Name').fill('Public API');
    await checks.getByLabel('Environment').selectOption({ label: 'QA EU' });

    // Client-side validation before anything is sent.
    await checks.getByLabel('Timeout (ms)').fill('120000');
    await checks.getByRole('button', { name: 'Add service' }).last().click();
    await expect(checks.getByText('Whole number between 1000 and 30000.')).toBeVisible();
    await checks.getByLabel('Timeout (ms)').fill('5000');

    // The API refuses internal destinations (SSRF) and the form shows why.
    await checks.getByLabel('Health URL').fill('http://169.254.169.254/latest/meta-data/');
    await checks.getByRole('button', { name: 'Add service' }).last().click();
    await expect(checks.locator('.form-error')).toContainText('healthUrl is not allowed');

    await checks.getByLabel('Health URL').fill('https://example.com/health');
    await checks.getByRole('button', { name: 'Add service' }).last().click();
    await expect(checks.getByRole('link', { name: 'Public API' })).toBeVisible();
    await expect(checks.getByText('https://example.com/health')).toBeVisible();

    // Edit it inline.
    await checks.getByRole('button', { name: 'Edit' }).click();
    await checks.getByLabel('Interval (seconds)').fill('120');
    await checks.getByRole('button', { name: 'Save changes' }).click();
    await expect(checks.getByText(/every 120s/)).toBeVisible();
  });
});

test.describe('Organization settings (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('change a member role and see it in the audit log', async ({ page }) => {
    await page.goto('/settings/members');
    await settled(page);
    const role = page.getByLabel('Role for Read Only');
    await expect(role).toHaveValue('VIEWER');

    await role.selectOption('MEMBER');
    await expect(role).toHaveValue('MEMBER');
    await role.selectOption('VIEWER'); // restore for other tests
    await expect(role).toHaveValue('VIEWER');

    await page.getByRole('link', { name: 'Audit log' }).click();
    await settled(page);
    await expect(page.getByText('MEMBER → VIEWER')).toBeVisible();
    await expect(page.getByText('VIEWER → MEMBER')).toBeVisible();
  });

  test('adding an unknown email explains what to do', async ({ page }) => {
    await page.goto('/settings/members');
    await page.getByLabel('Add a member by email').fill('nobody-here@example.test');
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.locator('.form-error')).toContainText('Ask them to register first');
  });

  test('integrations lists linked repositories with their webhook URL', async ({ page }) => {
    await page.goto('/settings/integrations');
    await expect(page.getByRole('cell', { name: 'acme-cloud/storefront-web' })).toBeVisible();
    await expect(page.getByText(/\/webhooks\/github\/[0-9a-f-]{36}/).first()).toBeVisible();
  });
});

test.describe('Settings as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });

  test('members are read-only and the audit log is hidden', async ({ page }) => {
    await page.goto('/settings/members');
    await settled(page);
    await expect(page.getByRole('cell', { name: /Read Only/ })).toBeVisible();
    await expect(page.getByLabel('Add a member by email')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);

    await page.goto('/settings/audit-logs');
    await expect(page.getByText('Only owners and admins can view the audit log.')).toBeVisible();
  });

  test('project settings are read-only', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('link', { name: 'Storefront Web', exact: true }).click();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('You have read-only access.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add service' })).toHaveCount(0);
    const rules = page.locator('section', { has: page.getByRole('heading', { name: 'Alert rules' }) });
    await expect(rules.getByLabel('Override all service thresholds')).toBeDisabled();
  });
});
