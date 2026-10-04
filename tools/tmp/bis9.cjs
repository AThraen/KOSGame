const { chromium } = require('playwright');
(async () => {
  const browser = await require('playwright').firefox.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent('<body style="background:red"><svg width=100 height=100><circle cx=50 cy=50 r=40 fill=blue /></svg></body>');
  const t = Date.now();
  try { await page.screenshot({ path: 'shot-test.png', timeout: 15000 }); console.log('shot ok', Date.now() - t); } catch (e) { console.log('shot FAIL', e.message.slice(0, 100)); }
  await browser.close();
})();
