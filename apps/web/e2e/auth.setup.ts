import { test as setup } from '@playwright/test';
import { ADMIN, ADMIN_STATE, VIEWER, VIEWER_STATE, login } from './helpers';

// Sign in once per role and reuse the session, instead of hitting the
// (rate-limited) login endpoint from every test.
setup('sign in as admin', async ({ page }) => {
  await login(page, ADMIN);
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('sign in as viewer', async ({ page }) => {
  await login(page, VIEWER);
  await page.context().storageState({ path: VIEWER_STATE });
});
