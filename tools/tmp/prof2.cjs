const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const id = process.argv[2] || 'knots.eight', assist = process.argv[3] || 'easy';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  await page.evaluate(([id, assist]) => { KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true });
    KOS.App.play(id, { force: true }); window.__i = KOS.App.run.inst; __i.setAutopilot(true); __i.skipIntro();
    window.__fin = null; KOS.Events.on('play:finish', e => __fin = e.result); }, [id, assist]);
  for (let k = 0; k < 200; k++) {
    const r = await page.evaluate(() => { const S = __i.debug.S; const out = []; for (let i = 0; i < 1 && !__fin; i++) { const c = performance.now(); __i.update(KOS.DT); out.push(Math.round(performance.now() - c)); } return { ph: S.phase, prog: S.prog, step: S.step, fin: __fin, out }; });
    console.log(k, JSON.stringify(r));
    if (r.fin) break;
  }
  await browser.close();
})();
