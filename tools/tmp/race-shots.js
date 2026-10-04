// scratch: play race.opti.1 to completion headless (autopilot) and screenshot key moments
const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [W = 390, H = 844, id = 'race.opti.1', assist = 'normal', tag = ''] = process.argv.slice(2);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: +W, height: +H }, hasTouch: +W < 800, deviceScaleFactor: 1 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(([id, assist]) => {
    KOS.Storage.saveProfile({ name: 'Maja', sailNo: '42', createdAt: 1 }); KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true });
    KOS.App.play(id, { force: true }); window.__res = null;
    KOS.Events.on('play:finish', e => { window.__res = e && e.result; });
  }, [id, assist]);
  const pre = 'C:/Projects/KOSGame/shot-race-' + W + 'x' + H + tag + '-';
  const shot = async n => { await page.waitForTimeout(450); await page.screenshot({ path: pre + n + '.png' }); console.log('shot ' + n); };
  await page.waitForTimeout(1200); await shot('1-intro');
  const run = (cond, maxS) => page.evaluate(([cond, maxS]) => {
    const inst = KOS.App.run.inst; const f = new Function('inst', 'S', 'me', 'return ' + cond);
    for (let s = 0; s < maxS * 60 && !window.__res; s++) { inst.update(KOS.DT); if (f(inst, inst.state, inst.boat)) return true; } return false;
  }, [cond, maxS]);
  await page.evaluate(() => { const i = KOS.App.run.inst; i.setAutopilot(true); i.skipIntro(); });
  await run('S.clock > -50', 60); await page.evaluate(() => { const i = KOS.App.run.inst; i.state.ff = false; }); await shot('2-prep');
  await run('S.clock > -8', 80); await shot('3-countdown');
  await run('S.clock > 1.5', 20); await shot('4-gun');
  await run('S.clock > 25', 40); await page.evaluate(() => KOS.App.run.inst.debug.foul('R10')); await page.waitForTimeout(300); await shot('5-beat-foul');
  await run('me.rc.leg >= 2', 400); await shot('6-rounded');
  await run('S.phase === "finish"', 400); await run('false', 2); await shot('7-finish');
  await run('false', 60); await page.waitForTimeout(2500); await shot('8-results');
  console.log('result', JSON.stringify(await page.evaluate(() => window.__res && { stars: window.__res.stars, place: window.__res.stats.place })));
  console.log(errs.join('\n') || 'no errors');
  await browser.close();
})();
