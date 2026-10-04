// scratch: play an activity to the end with the autopilot at high speed
const { chromium } = require('playwright');
(async () => {
  const [id, boat = 'opti', assist = 'easy'] = process.argv.slice(2);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href);
  await page.waitForTimeout(400);
  const r = await page.evaluate(async ([id, boat, assist]) => {
    KOS.Storage.saveProfile({ name: 'Ida', sailNo: '1' }); KOS.Storage.set('boat', boat); KOS.Storage.saveSettings({ assist, sound: false });
    KOS.App.play(id, { force: true });
    const inst = KOS.App.run.inst; inst.setAutopilot(true);
    let res = null; KOS.Events.on('play:finish', e => { res = e.result; });
    // fast-forward: step the sim directly (skip the 3 s countdown)
    inst.state.phase = 'go';
    const log = [];
    for (let i = 0; i < 60 * 900 && !res; i++) { inst.update(KOS.DT); if (i % 1800 === 0) log.push([Math.round(inst.state.time), inst.boat.x | 0, inst.boat.y | 0, inst.state.collected, inst.state.leg, inst.boat.pos].join(' ')); }
    return { res, log, t: inst.state.time, ref: inst.state.ref, got: inst.state.collected, leg: inst.state.leg };
  }, [id, boat, assist]);
  await page.waitForTimeout(1500);
  console.log(JSON.stringify({ t: r.t.toFixed(0), ref: r.ref && r.ref.toFixed(0), got: r.got, leg: r.leg, stars: r.res && r.res.stars, cur: await page.evaluate(() => KOS.App.cur) }));
  console.log(r.log.join('\n'));
  if (r.res) console.log(JSON.stringify(r.res));
  console.log(errs.join('\n') || 'no errors');
  await page.screenshot({ path: 'shot-auto-' + id + '.png' });
  await browser.close();
})();
