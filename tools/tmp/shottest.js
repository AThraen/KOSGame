const { chromium } = require('playwright');
(async () => {
  for (const args of [['--disable-gpu'], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], []]) {
    const b = await chromium.launch({ headless: true, channel: 'chrome', args });
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto('file:///C:/Projects/KOSGame/index.html'); await p.waitForTimeout(1500);
    const t0 = Date.now();
    try { await p.screenshot({ path: 'shot-t.png', timeout: 15000 }); console.log(args, 'ok', Date.now() - t0); }
    catch (e) { console.log(args, 'fail'); try { const c = await p.context().newCDPSession(p); const r = await c.send('Page.captureScreenshot'); console.log(' cdp ok', r.data.length); } catch (e2) { console.log(' cdp fail', e2.message.slice(0, 80)); } }
    await b.close();
  }
})();
