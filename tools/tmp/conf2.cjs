const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('console', m => console.log(m.text()));
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  console.log(await page.evaluate(() => { const c = document.createElement('canvas'); c.className='confetti-canvas'; document.body.appendChild(c); c.width=1200; c.height=800; const x=c.getContext('2d'); x.scale(1,1); return 'a'; }).catch(e => e.message));
  console.log(await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r('raf')))).catch(e => e.message));
  console.log(await page.evaluate(() => { const x=document.querySelector('.confetti-canvas').getContext('2d'); x.save(); x.translate(5,5); x.rotate(1); x.globalAlpha=1; x.fillStyle='#fff'; x.fillRect(0,0,9,4); x.restore(); return 'b'; }).catch(e => e.message));
  console.log(await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r('raf2')))).catch(e => e.message));
  process.exit(0);
})();
