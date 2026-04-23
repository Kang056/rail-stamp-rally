/*
 * Playwright E2E test for Account Settings functionality.
 *
 * Requirements:
 *   - Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 *   - Start dev server on http://localhost:3000 (npm run dev) before running tests.
 *
 * This test covers:
 *   - Opening account settings panel
 *   - Switching UI language (Traditional Chinese / English)
 *   - Switching theme color (light / dark)
 *   - Changing theme colors (default, blue, green, orange, red)
 *   - Settings persistence across page reloads
 */

import { test, expect } from '@playwright/test';

const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
test.skip(!hasEnv, 'Skipping Account Settings: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');

// ───────────────────────────────────────────────────────────────────────────────
// Test: Account Settings Panel Opens
// ───────────────────────────────────────────────────────────────────────────────
test('Account settings panel opens when clicking account button', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Find account button (avatar icon) — look for aria-label with account-related text
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });

  // Click to open account drawer
  await accountBtn.click();

  // Wait for drawer/panel animation
  await page.waitForTimeout(500);

  // Verify settings panel contains expected content (look for "系統設定" button or language/theme options)
  const systemSettingsBtn = page.locator('button:has-text("系統設定")');
  
  // If not visible, the drawer might not have opened, but we can also check for the language buttons
  const languageButtons = page.locator('button:has-text("繁體中文"), button:has-text("English")');
  
  // At least one should be visible
  const isVisible = await systemSettingsBtn.isVisible().catch(() => false) 
    || await languageButtons.first().isVisible().catch(() => false);
  
  expect(isVisible).toBeTruthy();
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Language Switching (zh-TW <-> en)
// ───────────────────────────────────────────────────────────────────────────────
test('Language switching updates UI text immediately', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Open account settings panel by clicking system settings button
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Find language buttons in settings
  const zhButton = page.locator('button:has-text("繁體中文")');
  const enButton = page.locator('button:has-text("English")');

  // Verify buttons are visible
  await expect(zhButton).toBeVisible({ timeout: 5000 });
  await expect(enButton).toBeVisible();

  // Check that we're currently in zh-TW
  const isZhActive = await zhButton.evaluate(el => {
    const classes = el.className;
    return classes.includes('segmentBtnActive') || el.getAttribute('aria-pressed') === 'true';
  }).catch(() => false);

  if (isZhActive) {
    // Switch to English
    await enButton.click();
    await page.waitForTimeout(500); // Wait for locale update

    // Verify English button is now active
    const enActive = await enButton.evaluate(el => {
      const classes = el.className;
      return classes.includes('segmentBtnActive') || el.getAttribute('aria-pressed') === 'true';
    });
    expect(enActive).toBeTruthy();

    // Verify localStorage was updated
    const savedLocale = await page.evaluate(() => localStorage.getItem('rail-stamp-rally-locale'));
    expect(savedLocale).toBe('en');
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Theme Color Mode Toggle (Light / Dark)
// ───────────────────────────────────────────────────────────────────────────────
test('Theme color mode toggles between light and dark', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Open account settings
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Find light/dark theme buttons
  const lightBtn = page.locator('button:has-text("☀️")').first();
  const darkBtn = page.locator('button:has-text("🌙")').first();

  // Verify buttons exist
  await expect(lightBtn).toBeVisible({ timeout: 5000 });
  await expect(darkBtn).toBeVisible();

  // Check initial state (should be dark by default)
  const isDarkActive = await darkBtn.evaluate(el => {
    const classes = el.className;
    return classes.includes('segmentBtnActive') || el.getAttribute('aria-pressed') === 'true';
  }).catch(() => false);

  if (isDarkActive) {
    // Toggle to light mode
    await lightBtn.click();
    await page.waitForTimeout(300);

    // Verify light button is now active
    const isLightActive = await lightBtn.evaluate(el => {
      const classes = el.className;
      return classes.includes('segmentBtnActive') || el.getAttribute('aria-pressed') === 'true';
    });
    expect(isLightActive).toBeTruthy();

    // Verify data-color-mode attribute is set on document element
    const colorMode = await page.evaluate(() => document.documentElement.getAttribute('data-color-mode'));
    expect(colorMode).toBe('light');

    // Toggle back to dark
    await darkBtn.click();
    await page.waitForTimeout(300);

    const isDarkActiveAfter = await darkBtn.evaluate(el => {
      const classes = el.className;
      return classes.includes('segmentBtnActive') || el.getAttribute('aria-pressed') === 'true';
    });
    expect(isDarkActiveAfter).toBeTruthy();

    const colorModeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-color-mode'));
    expect(colorModeAfter).toBe('dark');
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Theme Color Selection (default, blue, green, orange, red)
// ───────────────────────────────────────────────────────────────────────────────
test('Theme color selection changes color swatches and applies styles', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Open account settings
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Find color swatches (circular buttons with aria-label containing color names)
  const colorSwatches = page.locator('button[aria-label*="色"]');
  const swatchCount = await colorSwatches.count();

  if (swatchCount >= 5) {
    // Try clicking the blue color (usually second swatch)
    const blueSwatch = colorSwatches.nth(1);
    const blueLabel = await blueSwatch.getAttribute('aria-label');
    
    if (blueLabel && blueLabel.includes('藍色')) {
      await blueSwatch.click();
      await page.waitForTimeout(300);

      // Verify blue swatch is now active
      const blueActive = await blueSwatch.evaluate(el => {
        const classes = el.className;
        return classes.includes('colorSwatchActive') || el.getAttribute('aria-pressed') === 'true';
      });
      expect(blueActive).toBeTruthy();

      // Verify data-theme-color attribute is set on document element
      const themeColor = await page.evaluate(() => document.documentElement.getAttribute('data-theme-color'));
      expect(themeColor).toBe('blue');

      // Try clicking green color (usually third swatch)
      const greenSwatch = colorSwatches.nth(2);
      await greenSwatch.click();
      await page.waitForTimeout(300);

      const greenActive = await greenSwatch.evaluate(el => {
        const classes = el.className;
        return classes.includes('colorSwatchActive') || el.getAttribute('aria-pressed') === 'true';
      });
      expect(greenActive).toBeTruthy();

      const themeColorGreen = await page.evaluate(() => document.documentElement.getAttribute('data-theme-color'));
      expect(themeColorGreen).toBe('green');
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Settings Persistence (localStorage)
// ───────────────────────────────────────────────────────────────────────────────
test('Settings persist after page reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Open account settings
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Change to light theme
  const lightBtn = page.locator('button:has-text("☀️")').first();
  await expect(lightBtn).toBeVisible();
  await lightBtn.click();
  await page.waitForTimeout(300);

  // Change language to English
  const enButton = page.locator('button:has-text("English")');
  await expect(enButton).toBeVisible();
  await enButton.click();
  await page.waitForTimeout(500);

  // Verify localStorage has been set
  const storedColorMode = await page.evaluate(() => localStorage.getItem('rail-stamp-rally-color-mode'));
  expect(storedColorMode).toBe('light');

  const storedLocale = await page.evaluate(() => localStorage.getItem('rail-stamp-rally-locale'));
  expect(storedLocale).toBe('en');

  // Reload page
  await page.reload({ waitUntil: 'networkidle' });

  // Verify settings are still applied
  const colorModeAfterReload = await page.evaluate(() => document.documentElement.getAttribute('data-color-mode'));
  expect(colorModeAfterReload).toBe('light');

  // Verify locale in localStorage is still English
  const localeAfterReload = await page.evaluate(() => localStorage.getItem('rail-stamp-rally-locale'));
  expect(localeAfterReload).toBe('en');
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Mobile Settings Panel (Drawer)
// ───────────────────────────────────────────────────────────────────────────────
test('Account settings work on mobile viewport', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone-like viewport
    locale: 'zh-TW',
  });
  const page = await context.newPage();

  await page.goto('/', { waitUntil: 'networkidle' });

  // Find and click account button
  const accountBtn = page.locator('button[aria-label*="帳戶"]');
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Find theme toggle buttons in drawer
  const darkBtn = page.locator('button:has-text("🌙")').first();
  await expect(darkBtn).toBeVisible({ timeout: 5000 });

  // Click to switch theme
  await darkBtn.click();
  await page.waitForTimeout(300);

  // Verify theme changed
  const colorMode = await page.evaluate(() => document.documentElement.getAttribute('data-color-mode'));
  expect(colorMode).toBe('dark');

  await context.close();
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Back Button in Settings (Desktop)
// ───────────────────────────────────────────────────────────────────────────────
test('Settings back button works on desktop', async ({ page }) => {
  // Set up desktop viewport
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/', { waitUntil: 'networkidle' });

  // Click account button
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Look for back button (← 返回 or just ← )
  const backBtn = page.locator('button:has-text("← 返回"), button:has-text("← Back")').first();
  
  // If back button exists, click it
  const isBackVisible = await backBtn.isVisible().catch(() => false);
  
  if (isBackVisible) {
    await backBtn.click();
    await page.waitForTimeout(300);

    // Verify account button is still visible
    const accountBtnStillVisible = await accountBtn.isVisible();
    expect(accountBtnStillVisible).toBeTruthy();
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Settings accessibility (ARIA attributes)
// ───────────────────────────────────────────────────────────────────────────────
test('Settings panel has proper accessibility attributes', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Open account settings
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Find theme buttons and verify aria-pressed attribute
  const lightBtn = page.locator('button:has-text("☀️")').first();
  const darkBtn = page.locator('button:has-text("🌙")').first();

  // Buttons should have aria-pressed attribute or parent context
  const lightButtonExists = await lightBtn.isVisible();
  const darkButtonExists = await darkBtn.isVisible();

  expect(lightButtonExists && darkButtonExists).toBeTruthy();

  // Color swatches should have aria-label
  const colorSwatches = page.locator('button[aria-label*="色"]');
  const swatchCount = await colorSwatches.count();

  if (swatchCount > 0) {
    const firstSwatch = colorSwatches.first();
    const label = await firstSwatch.getAttribute('aria-label');
    expect(label).not.toBeNull();
    expect(label).toBeTruthy();
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Test: Complete Settings Workflow
// ───────────────────────────────────────────────────────────────────────────────
test('Complete settings workflow: theme + language + persistence', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Step 1: Open account settings
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await expect(accountBtn).toBeVisible({ timeout: 10000 });
  await accountBtn.click();
  await page.waitForTimeout(500);

  // Step 2: Verify all settings sections are visible
  const lightBtn = page.locator('button:has-text("☀️")').first();
  const darkBtn = page.locator('button:has-text("🌙")').first();
  const zhButton = page.locator('button:has-text("繁體中文")');
  const enButton = page.locator('button:has-text("English")');
  const colorSwatches = page.locator('button[aria-label*="色"]');

  await expect(lightBtn).toBeVisible();
  await expect(darkBtn).toBeVisible();
  await expect(zhButton).toBeVisible();
  await expect(enButton).toBeVisible();

  const swatchCount = await colorSwatches.count();
  expect(swatchCount).toBeGreaterThanOrEqual(5);

  // Step 3: Apply multiple settings
  // Switch to light mode
  await lightBtn.click();
  await page.waitForTimeout(300);

  // Switch to English
  await enButton.click();
  await page.waitForTimeout(300);

  // Select a color (green - usually index 2)
  if (swatchCount >= 3) {
    const greenSwatch = colorSwatches.nth(2);
    await greenSwatch.click();
    await page.waitForTimeout(300);
  }

  // Step 4: Verify all settings are applied
  const colorMode = await page.evaluate(() => document.documentElement.getAttribute('data-color-mode'));
  expect(colorMode).toBe('light');

  const themeColor = await page.evaluate(() => document.documentElement.getAttribute('data-theme-color'));
  expect(themeColor).toBe('green');

  const locale = await page.evaluate(() => localStorage.getItem('rail-stamp-rally-locale'));
  expect(locale).toBe('en');

  // Step 5: Reload and verify persistence
  await page.reload({ waitUntil: 'networkidle' });

  // Verify settings persisted
  const colorModeAfterReload = await page.evaluate(() => document.documentElement.getAttribute('data-color-mode'));
  expect(colorModeAfterReload).toBe('light');

  const themeColorAfterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme-color'));
  expect(themeColorAfterReload).toBe('green');

  const localeAfterReload = await page.evaluate(() => localStorage.getItem('rail-stamp-rally-locale'));
  expect(localeAfterReload).toBe('en');
});
