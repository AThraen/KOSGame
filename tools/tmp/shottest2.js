const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('about:blank'); 
  let t0 = Date.now();
  try { await p.screenshot({ path: 'shot-t.png', timeout: 15000 }); console.log('blank ok', Date.now() - t0); } catch (e) { console.log('blank fail'); }
  await p.goto('file:///C:/Projects/KOSGame/index.html'); await p.waitForTimeout(1500);
  t0 = Date.now();
  try { await p.screenshot({ path: 'shot-t.png', timeout: 15000 }); console.log('game ok', Date.now() - t0); } catch (e) { console.log('game fail'); }
  await b.close();
})();
