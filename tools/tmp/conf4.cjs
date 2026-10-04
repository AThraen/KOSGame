const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.CH || 'chrome' });
  const page = await browser.newPage();
  await page.setContent('<html><body>hi</body></html>');
  console.log(await page.evaluate(() => 1 + 1).catch(e => e.message));
  console.log(await page.evaluate(() => { const c = document.createElement('div'); document.body.appendChild(c); return 'div'; }).catch(e => e.message));
  console.log(await page.evaluate(() => { const c = document.createElement('canvas'); return 'canvas-el'; }).catch(e => e.message));
  console.log(await page.evaluate(() => { const c = document.createElement('canvas'); c.getContext('2d'); return 'ctx'; }).catch(e => e.message));
  process.exit(0);
})();
