const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: process.env.ARGS ? process.env.ARGS.split(' ') : [] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent('<html><body>hi</body></html>');
  console.log(await page.evaluate(() => { const c = document.createElement('canvas'); document.body.appendChild(c); c.width=1200; c.height=800; c.getContext('2d').fillRect(0,0,5,5); return 'a'; }).catch(e => e.message));
  console.log(await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r('raf')))).catch(e => e.message));
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await p2.goto('file:///C:/Projects/KOSGame/index.html'); await p2.waitForTimeout(1500);
  console.log(await p2.evaluate(() => 'loaded ' + !!window.KOS).catch(e => e.message));
  console.log(await p2.evaluate(() => { const c = document.createElement('canvas'); document.body.appendChild(c); return 'b'; }).catch(e => e.message));
  console.log(await p2.evaluate(() => { const c = document.createElement('canvas'); c.style.position='fixed'; c.style.inset='0'; c.style.width='100vw'; c.style.height='100vh'; document.body.appendChild(c); return 'c'; }).catch(e => e.message));
  console.log(await p2.evaluate(() => new Promise(r => requestAnimationFrame(() => r('raf')))).catch(e => e.message));
  process.exit(0);
})();
