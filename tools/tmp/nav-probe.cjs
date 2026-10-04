// headless probe for nav mode: run autopilot and report state periodically
const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [id = 'nav.buoys', boat = 'opti', assist = 'easy', max = '300', every = '10'] = process.argv.slice(2);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  const r = await page.evaluate(([id, boat, assist, max, every]) => {
    KOS.Storage.saveProfile({ name: 'Auto', sailNo: '1' }); KOS.Storage.set('boat', boat);
    KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true });
    KOS.App.play(id, { force: true }); const inst = KOS.App.run.inst; let res = null;
    KOS.Events.on('play:finish', e => { res = e && e.result; });
    inst.setAutopilot(true); inst.skipIntro();
    const log = []; const t0 = performance.now(); let tw = performance.now();
    for (let s = 0; s < 60 * max && !res; s++) { inst.update(KOS.DT); if (s % (60 * every) === 0) { const S = inst.state, b = inst.boat, c = inst.controls; const now = performance.now(); log.push([s / 60, S.phase, 'step' + S.stepI, 'err' + S.errors, b.x.toFixed(0), b.y.toFixed(0), 'h' + (b.heading * 57.3).toFixed(0), 'v' + b.speed.toFixed(2), b.pos, 'rud' + (c.rudder || 0).toFixed(2), 'tws' + (b.tws || 0).toFixed(1), b.inIrons ? 'IRONS' : '', b.grounded ? 'GROUND' : '', ((now - tw) / (60 * every)).toFixed(1) + 'ms/step'].join(' ')); tw = now; } }
    return { res, log, ms: performance.now() - t0 };
  }, [id, boat, assist, +max, +every]);
  console.log(r.log.join('\n')); console.log('wall', Math.round(r.ms), 'res', JSON.stringify(r.res)); console.log(errs.join('\n'));
  await browser.close();
})();
