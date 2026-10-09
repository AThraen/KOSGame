// Play one activity to the end, headless and fast-forwarded, and print the result (stars, time, stats).
// Use it to tune star thresholds and to prove a level can be finished. NEVER opens a visible window.
//
//   node tools/autoplay.js <activityId> [boat] [assist] [--max=900] [--shot] [--idle]
//     boat    player's chosen boat for activities without a fixed boat (default opti)
//     assist  easy | normal | pro (default easy)
//     --max   give up after this many simulated seconds (default 900)
//     --shot  save shot-auto-<id>.png of the results screen
//     --idle  do not call setAutopilot: the player does nothing (e.g. soslag.duel1: the idle player must lose)
//
// The mode instance may expose two optional test hooks (see js/modes/sail.js):
//   inst.setAutopilot(true)  let KOS.AI (or your own bot) drive the player's boat
//   inst.skipIntro()         skip countdowns / camera fly-ins
// Without setAutopilot the sim still runs (the player just does nothing), which is a useful "idle player" test.
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const opt = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
  const [id, boat = 'opti', assist = 'easy'] = args;
  if (!id) { console.log('usage: node tools/autoplay.js <activityId> [boat] [assist] [--max=900] [--shot]'); process.exit(2); }
  const max = +opt('max', 900), idle = process.argv.includes('--idle');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  const r = await page.evaluate(([id, boat, assist, max, idle]) => {
    KOS.Storage.saveProfile({ name: 'Auto', sailNo: '1' });
    KOS.Storage.set('boat', boat);
    KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true });
    if (!KOS.App.play(id, { force: true })) return { err: 'App.play refused ' + id };
    const inst = KOS.App.run.inst;
    let res = null;
    const onFin = e => { res = e && e.result; };
    KOS.Events.on('play:finish', onFin);
    if (inst.setAutopilot && !idle) inst.setAutopilot(true);
    if (inst.skipIntro) inst.skipIntro();
    const t0 = performance.now();
    let steps = 0;
    for (; steps < 60 * max && !res; steps++) inst.update(KOS.DT);
    KOS.Events.off('play:finish', onFin);
    return { res, simS: steps / 60, wallMs: Math.round(performance.now() - t0), autopilot: !!inst.setAutopilot && !idle };
  }, [id, boat, assist, max, idle]);
  await page.waitForTimeout(1500);
  if (r.err) console.log(r.err);
  else {
    console.log(id + ' (' + boat + ', ' + assist + ')' + (r.autopilot ? '' : ' [no autopilot hook: idle player]'));
    console.log('  simulated ' + r.simS.toFixed(0) + ' s in ' + r.wallMs + ' ms → ' + (r.res ? 'finished' : 'NOT finished'));
    if (r.res) console.log('  ' + JSON.stringify(r.res));
    console.log('  screen now: ' + await page.evaluate(() => KOS.App.cur));
  }
  console.log(errs.join('\n') || '  no console errors');
  if (process.argv.includes('--shot')) await page.screenshot({ path: 'shot-auto-' + id + '.png' });
  await browser.close();
  process.exit(errs.length || (r.res ? 0 : 1));
})();
