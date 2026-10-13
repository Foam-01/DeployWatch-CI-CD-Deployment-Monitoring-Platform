import { expect, test } from '@playwright/test';
import { ADMIN_STATE, settled } from './helpers';

const PAGES = ['/dashboard', '/projects', '/workflow-runs', '/deployments', '/services', '/incidents'];

test.describe('Responsive layout', () => {
  test.use({ storageState: ADMIN_STATE });

  test('no page scrolls horizontally on a phone', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await settled(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
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
