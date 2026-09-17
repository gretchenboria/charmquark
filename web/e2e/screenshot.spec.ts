import { test, expect } from '@playwright/test';

test('take screenshot of landing page', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/landing.png', fullPage: true });
});
