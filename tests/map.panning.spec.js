const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

function writeOut(name, page) {
  const outDir = path.join(process.cwd(), 'playwright-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

test('pan and zoom without broken tiles', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForSelector('.leaflet-tile', { timeout: 10000 });

  const countBefore = await page.$$eval('.leaflet-tile', els => els.length);
  console.log('TILES_INITIAL:', countBefore);
  await writeOut('pan-zoom-before.png', page);

  // Pan right-down
  const map = await page.$('.leaflet-container');
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width/2 + 200, box.y + box.height/2 + 100, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.waitForSelector('.leaflet-tile', { timeout: 10000 });
  const countAfterPan1 = await page.$$eval('.leaflet-tile', els => els.length);
  console.log('TILES_AFTER_PAN1:', countAfterPan1);
  await writeOut('pan-after-1.png', page);

  // Zoom in and pan left-up
  await page.click('.leaflet-control-zoom-in');
  await page.waitForTimeout(600);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width/2 - 250, box.y + box.height/2 - 150, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const countAfterZoom = await page.$$eval('.leaflet-tile', els => els.length);
  console.log('TILES_AFTER_ZOOM:', countAfterZoom);
  await writeOut('pan-after-zoom.png', page);

  // Validate no NaN transforms and adequate tile count
  const bad = await page.$$eval('.leaflet-tile', els => els.some(e => /NaN|NaNpx/.test(window.getComputedStyle(e).transform || '')));
  console.log('HAS_NAN:', bad);

  expect(countBefore).toBeGreaterThan(3);
  expect(countAfterPan1).toBeGreaterThan(3);
  expect(countAfterZoom).toBeGreaterThan(3);
  expect(bad).toBe(false);
});