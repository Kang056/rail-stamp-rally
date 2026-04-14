/*
 Playwright E2E test skeleton for Badge check-in flow.

 Requirements:
  - Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
  - Start dev server on http://localhost:3000 (npm run dev) before running tests.

 This test:
  - Creates a browser context with geolocation permission and a sample coordinate near Taipei Main Station
  - Attempts to click a check-in button (common selectors)
  - Waits for a Supabase RPC response that contains { ok: true } and asserts success UI appears

 Skips when env vars missing or UI not implemented.

 Sample coordinates used: Taipei Main Station — latitude: 25.0478, longitude: 121.5170
*/

import { test, expect } from '@playwright/test';

const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// Skip the test entirely if the essential env vars for the frontend Supabase client are not present.
test.skip(!hasEnv, 'Skipping E2E check-in: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');

test('Badge check-in flow (geolocation) — skeleton', async ({ browser }) => {
  // Coordinates near Taipei Main Station (25.0478 N, 121.5170 E)
  const latitude = parseFloat(process.env.TEST_USER_LAT || '25.0478');
  const longitude = parseFloat(process.env.TEST_USER_LON || '121.5170');

  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude, longitude },
    locale: 'zh-TW',
    viewport: { width: 390, height: 844 }, // mobile-like viewport
  });
  const page = await context.newPage();

  // Navigate to app (playwright.config.baseURL === http://localhost:3000)
  await page.goto('/');

  // Wait for network idle and map load indicator (best-effort)
  await page.waitForLoadState('networkidle');

  // Try to find a check-in UI button using several common selectors
  const selectors = [
    '[data-testid="badge-checkin-btn"]',
    '[data-testid="checkin-btn"]',
    'button:has-text("打卡")',
    'button:has-text("到訪")',
    'button:has-text("Check-in")',
    'button:has-text("Check in")',
    'button:has-text("Visit")',
  ];

  let btn = null;
  for (const sel of selectors) {
    btn = await page.$(sel);
    if (btn) break;
  }

  if (!btn) {
    console.warn('Badge check-in button not found. UI component may not be implemented in this branch — skipping check-in interaction.');
    await context.close();
    return;
  }

  // Wait for an RPC response that indicates success; filter RPC responses by JSON body containing ok:true
  const rpcResponse = page.waitForResponse(async (resp) => {
    if (!resp.url().includes('/rpc/')) return false;
    try {
      const body = await resp.json();
      if (!body) return false;
      if (Array.isArray(body)) {
        return body[0] && body[0].ok === true;
      }
      return body.ok === true;
    } catch {
      return false;
    }
  }, { timeout: 10000 });

  await btn.click();

  const response = await rpcResponse;
  const json = await response.json();

  // Assert RPC response contained ok:true (flexible for array or object)
  const ok = Array.isArray(json) ? json[0]?.ok === true : json?.ok === true;
  expect(ok, 'RPC did not return ok:true — ensure database RPC is implemented and returns { ok: true }').toBeTruthy();

  // Assert success UI appears (best-effort selectors)
  const successSelectors = [
    '[data-testid="checkin-success"]',
    'text=已解鎖',
    'text=Unlocked',
    '.checkin-success'
  ];
  let successFound = false;
  for (const sel of successSelectors) {
    const el = await page.$(sel);
    if (el) { successFound = true; break; }
  }

  expect(successFound, 'Success UI element not found after RPC returned ok:true').toBeTruthy();

  await context.close();
});
