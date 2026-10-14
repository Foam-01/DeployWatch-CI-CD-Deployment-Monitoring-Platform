import { test } from '@playwright/test';
import { ADMIN_STATE, settled } from './helpers';

// Visual capture for design review; run with SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'screenshots only on demand');
test.use({ storageState: ADMIN_STATE });

for (const path of ['/dashboard', '/workflow-runs', '/incidents', '/settings/members', '/settings/audit-logs']) {
  test(`capture ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await settled(page);
    await page.screenshot({ path: `test-results/screens/${info.project.name}${path.replace(/\//g, '_')}.png`, fullPage: true });
  });
}

test('capture notification panel', async ({ page }, info) => {
  await page.goto('/dashboard');
  await settled(page);
  await page.locator('button.bell').click();
  await page.getByRole('dialog', { name: 'Notifications' }).getByRole('button').nth(1).waitFor();
  await page.screenshot({ path: `test-results/screens/${info.project.name}_bell-panel.png` });
});
