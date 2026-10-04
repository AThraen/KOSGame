const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  const r = await page.evaluate(() => {
    KOS.Storage.saveSettings({ assist: 'normal', sound: false, unlockAll: true });
    KOS.App.play('dock.opti.jetty', { force: true });
    const inst = KOS.App.run.inst; inst.skipIntro();
    const T = {}; const wrap = (o, k, n) => { const f = o[k]; o[k] = function () { const t0 = performance.now(); const r = f.apply(this, arguments); T[n] = (T[n] || 0) + performance.now() - t0; return r; }; };
    wrap(KOS.Physics, 'step', 'step'); wrap(KOS.Physics, 'collide', 'collide'); wrap(inst.state.__proto__ ? KOS.World : KOS.World, 'hit', 'hit');
    inst.setAutopilot(true); const tot = []; for (let s = 0; s < 30; s++) { const t0 = performance.now(); for (let i = 0; i < 60; i++) inst.update(KOS.DT); tot.push(Math.round(performance.now() - t0) + ":" + inst.state.phase); }
    return { tot, T };
  });
  console.log(JSON.stringify(r)); await browser.close();
})();
