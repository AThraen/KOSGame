const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('file:///C:/Projects/KOSGame/index.html');
  console.log(await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 30) requestAnimationFrame(f); else r(n + ' frames in ' + Math.round(performance.now() - t0)); }; requestAnimationFrame(f); setTimeout(() => r('raf stuck at ' + n), 4000); })));
  await b.close();
})();
