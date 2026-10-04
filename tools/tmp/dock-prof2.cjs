const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(() => {
    KOS.Storage.saveSettings({ assist: 'normal', sound: false, unlockAll: true });
    KOS.App.play('dock.opti.jetty', { force: true });
    const inst = KOS.App.run.inst; inst.skipIntro(); inst.setAutopilot(true); window.__inst = inst;
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  const r = await page.evaluate(() => { const inst = window.__inst; const out = []; for (let s = 0; s < 30; s++) { const t0 = performance.now(); for (let i = 0; i < 60; i++) inst.update(KOS.DT); const ms = Math.round(performance.now() - t0); out.push(ms + ":" + inst.state.phase + ":" + (inst.state.rope ? inst.state.rope.state : "") + (inst.state.pull ? "P" : "")); if (ms > 3000) break; } return out; });
  const { profile } = await cdp.send('Profiler.stop');
  console.log('ms per sim second', r);
  const self = {}; const dt = {}; 
  const byId = {}; profile.nodes.forEach(n => byId[n.id] = n);
  const counts = {}; profile.samples.forEach(s => counts[s] = (counts[s] || 0) + 1);
  for (const id in counts) { const n = byId[id]; const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber; self[k] = (self[k] || 0) + counts[id]; }
  console.log(Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15));
  await browser.close();
})();
