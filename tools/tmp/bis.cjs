const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  for (const code of ["document.createElement('canvas').getContext('2d') && 1", "(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;document.body.appendChild(c);c.getContext('2d').fillRect(0,0,9,9);return 1})()", "(()=>{const c=document.createElement('canvas');c.className='confetti-canvas';c.width=1200;c.height=800;document.body.appendChild(c);c.getContext('2d').fillRect(0,0,9,9);return 1})()", "(KOS.UI.confetti(), 1)"]) {
    const t = Date.now();
    try { await Promise.race([page.evaluate(code), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); console.log(code, Date.now() - t); }
    catch (e) { console.log(code, 'FAIL', e.message); break; }
  }
  await browser.close();
})();
