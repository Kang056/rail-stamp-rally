const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('collect map layout metrics', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForSelector('.leaflet-tile', { timeout: 10000 });

  const metrics = await page.evaluate(() => {
    const doc = document;
    const getRect = (sel) => {
      const el = doc.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        selector: sel,
        width: r.width,
        height: r.height,
        top: r.top,
        left: r.left,
        position: style.position,
        transform: style.transform,
        overflow: style.overflow,
        display: style.display,
      };
    };

    const tileEls = Array.from(doc.querySelectorAll('.leaflet-tile'));
    const tileSamples = tileEls.slice(0, 50).map((t) => ({ src: t.src, width: t.width, height: t.height, transform: window.getComputedStyle(t).transform }));

    return {
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      htmlRect: getRect('html'),
      bodyRect: getRect('body'),
      mainRect: getRect('main'),
      mapSectionRect: getRect('section[aria-label="Interactive railway map"]'),
      leafletContainerRect: getRect('.leaflet-container'),
      tilePaneRect: getRect('.leaflet-tile-pane'),
      tileContainerRect: getRect('.leaflet-tile-container'),
      tileContainerTransform: (function(){ const el = doc.querySelector('.leaflet-tile-container'); return el ? window.getComputedStyle(el).transform : null })(),
      tileCount: tileEls.length,
      tileSamples,
      hasNaNTransforms: tileEls.some(t => /NaN|NaNpx/.test(window.getComputedStyle(t).transform || '')),
      parentTransforms: (function(){ const el = doc.querySelector('.leaflet-container'); const parents = []; let p = el ? el.parentElement : null; while(p && p.tagName && p.tagName.toLowerCase() !== 'html') { parents.push({ tag: p.tagName.toLowerCase(), transform: window.getComputedStyle(p).transform }); p = p.parentElement; } return parents; })(),
      computedBodyStyle: window.getComputedStyle(document.body).cssText,
    };
  });

  const outDir = path.join(process.cwd(), 'playwright-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'map-metrics.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: path.join(outDir, 'map-metrics.png'), fullPage: true });
  console.log('METRICS_WRITTEN');
});
