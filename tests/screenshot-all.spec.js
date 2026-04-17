const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('capture all routes', async ({ page }) => {
  const root = path.resolve(__dirname, '..');
  const appDir = path.join(root, 'app');
  const screenshotsDir = path.join(root, 'playwright-screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
  const files = [];
  function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) walk(full);
      else {
        if (/^page\.(js|jsx|ts|tsx)$/.test(f.name)) files.push(full);
      }
    }
  }
  if (!fs.existsSync(appDir)) {
    console.log('app/ directory not found; no routes discovered.');
    return;
  }
  walk(appDir);
  const mapping = { id: '1', slug: 'example' };
  const routes = [];
  for (const file of files) {
    let rel = path.relative(appDir, path.dirname(file));
    let parts = rel === '' ? [] : rel.split(path.sep);
    let skip = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.startsWith('(')) { skip = true; break; }
      const m = p.match(/^\[(.+)\]$/);
      if (m) {
        const name = m[1];
        if (mapping[name]) parts[i] = mapping[name];
        else { skip = true; break; }
      }
    }
    if (skip) { console.log(`Skipping route for ${file}`); continue; }
    const route = '/' + parts.filter(Boolean).join('/');
    routes.push(route === '/' ? '/' : route.replace(/\/+/g, '/'));
  }
  const uniq = [...new Set(routes)];
  let base = 'http://localhost:3000';
  try {
    const cfgPath = path.join(root, 'playwright.config.js');
    if (fs.existsSync(cfgPath)) {
      try {
        const cfg = require(cfgPath);
        if (cfg && cfg.use && cfg.use.baseURL) base = cfg.use.baseURL;
      } catch (e) {
        console.log('Could not require playwright.config.js, using default base URL');
      }
    }
  } catch (e) {}

  for (const r of uniq) {
    const target = new URL(r, base).toString();
    console.log('Navigating to', target);
    await page.goto(target, { waitUntil: 'networkidle' });
    const safe = (r === '/') ? 'index' : r.replace(/^\//, '').replace(/\//g, '-').replace(/[^\w\-]/g, '');
    const out = path.join(screenshotsDir, `${safe}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log('Saved', out);
  }
});
