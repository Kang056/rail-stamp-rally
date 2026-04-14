const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('collect console and network logs and take screenshots', async ({ page }) => {
  const logs = [];

  page.on('console', msg => {
    try {
      const args = msg.args ? msg.args().map(a => a.toString()) : [];
      logs.push({ type: 'console', text: msg.text(), args, location: msg.location ? msg.location() : null });
    } catch (e) {
      logs.push({ type: 'console', text: msg.text() });
    }
  });

  page.on('pageerror', err => logs.push({ type: 'pageerror', message: err.message, stack: err.stack }));
  page.on('request', req => logs.push({ type: 'request', url: req.url(), method: req.method(), resourceType: req.resourceType() }));
  page.on('response', res => logs.push({ type: 'response', url: res.url(), status: res.status() }));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const outDir = path.join(process.cwd(), 'playwright-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(outDir, 'home-debug-logs.json'), JSON.stringify(logs, null, 2));
    const html = await page.content();
    fs.writeFileSync(path.join(outDir, 'home-debug.html'), html);
    await page.screenshot({ path: path.join(outDir, 'home-debug.png'), fullPage: true });
  } catch (err) {
    // ignore write errors
  }
});
