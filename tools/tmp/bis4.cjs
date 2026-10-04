const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent('<body></body>');
  const t = Date.now();
  try { await Promise.race([page.evaluate("(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;document.body.appendChild(c);c.getContext('2d').fillRect(0,0,9,9);return 1})()"), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); console.log('ok', Date.now() - t); } catch (e) { console.log('FAIL'); }
  await browser.close();
})();
