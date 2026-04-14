const { test, expect } = require('@playwright/test');

test('home page loads and screenshot', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'playwright-screenshots/home.png', fullPage: true });
  const content = await page.content();
  console.log(`PAGE_CONTENT_LENGTH: ${content.length}`);
  expect(content.length).toBeGreaterThan(100);
});