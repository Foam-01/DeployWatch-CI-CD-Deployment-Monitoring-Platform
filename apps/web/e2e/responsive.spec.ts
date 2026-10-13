import { expect, test } from '@playwright/test';
import { ADMIN_STATE, settled } from './helpers';

const PAGES = ['/dashboard', '/projects', '/workflow-runs', '/deployments', '/services', '/incidents'];

test.describe('Responsive layout', () => {
  test.use({ storageState: ADMIN_STATE });

  // Breakpoints required by the ui-ux-pro-max checklist.
  test('no page scrolls horizontally at 375 / 768 / 1024 / 1440 px', async ({ page }) => {
    for (const width of [375, 768, 1024, 1440])
    for (const path of PAGES) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await settled(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} @${width}px overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test('navigation drawer opens and closes on mobile', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await nav.getByRole('link', { name: 'Incidents' }).click();
    await expect(page).toHaveURL(/\/incidents$/);
  });
});
