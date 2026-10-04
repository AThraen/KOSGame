const { chromium } = require('playwright');
(async () => {
  for (const o of [{ channel: 'chrome', args: ['--headless=old'] }, { channel: 'chrome', args: ['--disable-gpu-compositing', '--disable-gpu'] }, { channel: 'msedge' }]) {
    let b; try { b = await chromium.launch(Object.assign({ headless: true }, o)); } catch (e) { console.log(JSON.stringify(o), 'launch fail'); continue; }
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const t0 = Date.now();
    try { await p.screenshot({ path: 'shot-t.png', timeout: 10000 }); console.log(JSON.stringify(o), 'ok', Date.now() - t0); } catch (e) { console.log(JSON.stringify(o), 'fail'); }
    await b.close();
  }
})();
