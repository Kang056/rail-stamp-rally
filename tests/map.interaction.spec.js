const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('map tiles load and zoom interaction', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForSelector('.leaflet-tile', { timeout: 10000 });

  const tilesBefore = await page.$$eval('.leaflet-tile', els => els.map(e => ({ src: e.src, style: e.style.transform })));
  console.log('TILES_BEFORE_COUNT:', tilesBefore.length);
  const badBefore = tilesBefore.some(t => /NaN|NaNpx/.test(t.style) || /scale\(0/.test(t.style));
  console.log('BAD_BEFORE:', badBefore);

  const outDir = path.join(process.cwd(), 'playwright-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, 'map-before-zoom.png'), fullPage: true });

  // Zoom in twice
  await page.click('.leaflet-control-zoom-in');
  await page.waitForTimeout(600);
  await page.click('.leaflet-control-zoom-in');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const tilesAfter = await page.$$eval('.leaflet-tile', els => els.map(e => ({ src: e.src, style: e.style.transform })));
  console.log('TILES_AFTER_COUNT:', tilesAfter.length);
  const badAfter = tilesAfter.some(t => /NaN|NaNpx/.test(t.style) || /scale\(0/.test(t.style));
  console.log('BAD_AFTER:', badAfter);
  await page.screenshot({ path: path.join(outDir, 'map-after-zoom.png'), fullPage: true });

  expect(tilesBefore.length).toBeGreaterThan(4);
  expect(tilesAfter.length).toBeGreaterThan(4);
  expect(badBefore).toBe(false);
  expect(badAfter).toBe(false);
});