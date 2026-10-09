// Play one activity to the end, headless and fast-forwarded, and print the result (stars, time, stats).
// Use it to tune star thresholds and to prove a level can be finished. NEVER opens a visible window.
//
//   node tools/autoplay.js <activityId> [boat] [assist] [--max=900] [--shot] [--idle] [--seed=<n>] [--seeds=<k>]
//     boat    player's chosen boat for activities without a fixed boat (default opti)
//     assist  easy | normal | pro (default easy)
//     --max   give up after this many simulated seconds (default 900)
//     --shot  save shot-auto-<id>.png of the results screen
//     --seed  set the activity params.seed (e.g. soslag.duel1: the wind and the duel are seeded) before the run
//     --seeds run seeds 1..k in one page, one line per seed and a summary line (soslag: WIN w/k STARS1 a STARS2 b STARS3 c meanOppWet x meanAcc y)
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
  const seedList = opt('seeds', null) ? Array.from({ length: +opt('seeds') }, (_, i) => i + 1) : [opt('seed', null) === null ? null : +opt('seed')];
  const runs = [];
  for (const seed of seedList) {
    const r = await page.evaluate(([id, boat, assist, max, idle, seed]) => {
      KOS.Storage.saveProfile({ name: 'Auto', sailNo: '1' });
      KOS.Storage.set('boat', boat);
      KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true });
      if (seed !== null) { const act = KOS.Activities.get(id); if (act && act.params) act.params.seed = seed; }
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
      const ai = inst.debug && inst.debug.ai;
      return { res, simS: steps / 60, wallMs: Math.round(performance.now() - t0), autopilot: !!inst.setAutopilot && !idle,
        ai: ai ? { fired: ai.fired, winT: Math.round(ai.winT), maxZeroT: Math.round(ai.maxZeroT * 10) / 10, modeT: ai.modeT } : null };
    }, [id, boat, assist, max, idle, seed]);
    runs.push({ seed, r });
    if (r.err || seedList.length === 1) break;
    if (seed !== null && seedList.length > 1) { // one line per seed
      const sl = r.res && r.res.soslag;
      console.log('  seed ' + String(seed).padStart(2) + ': ' + (r.res ? 'stars ' + r.res.stars + (sl ? '  ' + sl.outcome + '/' + sl.why + '  oppWet ' + sl.oppWet + '  myWet ' + sl.myWet + '  hits ' + sl.myHits + '/' + sl.fired + '  fouls ' + sl.fouls + '/' + sl.oppFouls : '  score ' + r.res.score) + (r.ai && sl ? '  aiHits ' + sl.oppHits + '/' + r.ai.fired + ' aiZero ' + r.ai.maxZeroT + 's  aiWind ' + r.ai.winT + 's  modes ' + Object.keys(r.ai.modeT).map(k => k[0] + k[1] + Math.round(r.ai.modeT[k])).join(' ') : '') : 'NOT finished'));
    }
  }
  const r = runs[runs.length - 1].r;
  await page.waitForTimeout(1500);
  if (seedList.length > 1) {
    const ok = runs.map(x => x.r.res).filter(Boolean), n = runs.length, sl = ok.map(x => x.soslag).filter(Boolean);
    const cnt = k => ok.filter(x => x.stars === k).length, mean = (f) => sl.length ? Math.round(sl.reduce((a, x) => a + f(x), 0) / sl.length * 10) / 10 : 'n/a';
    console.log(id + ' (' + boat + ', ' + assist + ')' + (idle ? ' [idle]' : '') + ' seeds 1..' + n + ((n - ok.length) ? '  UNFINISHED ' + (n - ok.length) : ''));
    console.log('WIN ' + ok.filter(x => x.stars >= 2).length + '/' + n + '  STARS1 ' + cnt(1) + '  STARS2 ' + cnt(2) + '  STARS3 ' + cnt(3) + '  meanOppWet ' + mean(x => x.oppWet) + '  meanAcc ' + mean(x => x.fired ? 100 * x.myHits / x.fired : 0));
    console.log('  screen now: ' + await page.evaluate(() => KOS.App.cur));
  } else if (r.err) console.log(r.err);
  else {
    console.log(id + ' (' + boat + ', ' + assist + ')' + (r.autopilot ? '' : ' [no autopilot hook: idle player]'));
    console.log('  simulated ' + r.simS.toFixed(0) + ' s in ' + r.wallMs + ' ms → ' + (r.res ? 'finished' : 'NOT finished'));
    if (r.res) console.log('  ' + JSON.stringify(r.res));
    console.log('  screen now: ' + await page.evaluate(() => KOS.App.cur));
  }
  console.log(errs.join('\n') || '  no console errors');
  if (process.argv.includes('--shot')) await page.screenshot({ path: 'shot-auto-' + id + '.png' });
  await browser.close();
  process.exit(errs.length || (seedList.length > 1 ? (runs.every(x => x.r.res) ? 0 : 1) : r.res ? 0 : 1));
})();
