const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const t00 = Date.now();
  page.on('console', m => console.log(((Date.now() - t00) / 1000).toFixed(1), m.text()));
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(() => {
    KOS.Storage.saveSettings({ assist: 'normal', sound: false, unlockAll: true });
    KOS.App.play('dock.opti.jetty', { force: true });
    const inst = KOS.App.run.inst; inst.skipIntro(); inst.setAutopilot(true); window.__inst = inst;
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  page.evaluate(() => { const inst = window.__inst; for (let i = 0; i < 60 * 30; i++) { const t0 = performance.now(); inst.update(KOS.DT); const ms = performance.now() - t0; if (ms > 20 || i % 120 == 0 || inst.state.pull || inst.state.phase != "go") console.log(i, ms.toFixed(0), inst.state.phase, inst.state.rope && inst.state.rope.state, !!inst.state.pull, inst.state.lineQ); if (ms > 300) break; } return 1; }).catch(e => console.log(e.message));
  await new Promise(r => setTimeout(r, 25000));
  const { profile } = await cdp.send('Profiler.stop').catch(e => ({ profile: null }));
  if (profile) {
    const byId = {}; profile.nodes.forEach(n => byId[n.id] = n);
    const counts = {}; profile.samples.forEach(s => counts[s] = (counts[s] || 0) + 1); const self = {};
    for (const id in counts) { const n = byId[id]; const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber; self[k] = (self[k] || 0) + counts[id]; }
    console.log(Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15));
  }
  process.exit(0);
})();
