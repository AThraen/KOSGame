const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const id = process.argv[2] || 'knots.eight';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  const t0 = Date.now();
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  console.log('load', Date.now() - t0);
  const r = await page.evaluate((id) => {
    KOS.Storage.saveSettings({ assist: 'easy', sound: false, unlockAll: true });
    const a = performance.now();
    KOS.App.play(id, { force: true });
    const b = performance.now();
    const inst = KOS.App.run.inst; inst.setAutopilot(true); inst.skipIntro();
    const times = [];
    let fin=false; KOS.Events.on("play:finish",()=>fin=true); for (let i = 0; i < 400 && !fin && inst.debug.S.phase!=="done"; i++) { const c = performance.now(); inst.update(KOS.DT); const d=Math.round(performance.now() - c); if(d>5) times.push(i+":"+d+":"+inst.debug.S.phase); }
    const s=inst.debug.S; return { play: b - a, times, phase: s.phase, finishT: s.finishT };
  }, id);
  console.log(JSON.stringify(r));
  await browser.close();
})();
