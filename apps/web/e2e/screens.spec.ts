import { test } from '@playwright/test';
import { ADMIN_STATE, settled } from './helpers';

// Visual capture for design review; run with SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'screenshots only on demand');
test.use({ storageState: ADMIN_STATE });

for (const path of ['/dashboard', '/workflow-runs', '/incidents']) {
  test(`capture ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await settled(page);
    await page.screenshot({ path: `test-results/screens/${info.project.name}${path.replace(/\//g, '_')}.png`, fullPage: true });
  });
}
