// Start an activity (or open a screen) headless, optionally press keys, then save a screenshot to look at.
// NEVER opens a visible window.
//
//   node tools/playshot.js <activityId | screen:<name>[:<area>]> [WxH] [waitMs] [keys] [out.png]
//     WxH     viewport, default 1440x900 (sizes under 900 wide or 500 high get touch + mobile emulation)
//     waitMs  total time before the screenshot, default 5000 (keys are spread over it)
//     keys    comma list of Key:holdMs, e.g. "ArrowLeft:600,Space:400,ArrowUp:300"
//     SHOT_CLICK_GO=1 (env) clicks the intro card's .sc-go once after the start
//     out     default shot-play-<id>-<WxH>.png (shot*.png is gitignored scratch)
//   env KOS_TILT=on|off  on forces the tilted view (KOS.Tilt.force); off sets the Skrå visning setting to off; unset = auto
// Examples:
//   node tools/playshot.js sail.rings 390x844 7000 "ArrowRight:500"
//   node tools/playshot.js screen:area:bay 844x390 1500
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

(async () => {
  const [id, size = '1440x900', wait = '5000', keys = '', out] = process.argv.slice(2);
  if (!id) { console.log('usage: node tools/playshot.js <activityId|screen:name[:area]> [WxH] [waitMs] [keys] [out.png]'); process.exit(2); }
  const [w, h] = size.split('x').map(Number);
  const mobile = w < 900 || h < 500;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror ' + e.message));
  if (process.env.SHOT_SETTINGS) await page.addInitScript(s => { window.__shotSettings = JSON.parse(s); }, process.env.SHOT_SETTINGS); // e.g. SHOT_SETTINGS='{"windUnit":"kn"}'
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  await page.evaluate(() => {
    KOS.Storage.saveProfile({ name: 'Ida', age: '10-12', sailNo: '123', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings(Object.assign({ unlockAll: true }, window.__shotSettings || {}));
    KOS.U.setWindUnit(KOS.Storage.settings().windUnit);
  });
  // KOS_TILT=off sets the 'Skrå visning' setting to off; =on forces the tilted view (KOS.Tilt.force, the dev flag); unset = auto
  const tilt = process.env.KOS_TILT;
  if (tilt === 'off') await page.evaluate(() => KOS.Storage.saveSettings({ tilt: 'off' }));
  if (tilt === 'on') await page.evaluate(() => { if (KOS.Tilt) KOS.Tilt.force = true; });
  if (id.startsWith('screen:')) await page.evaluate(s => KOS.App.show(s.split(':')[1], { area: s.split(':')[2] || 'bay' }), id);
  else {
    const ok = await page.evaluate(id => KOS.App.play(id, { force: true }), id);
    if (!ok) { console.log('could not start ' + id); await browser.close(); process.exit(1); }
  }
  if (process.env.SHOT_CLICK_GO) { try { await page.click('.sc-go', { timeout: 4000 }); } catch (e) { logs.push('warning no .sc-go to click'); } } // SHOT_CLICK_GO=1: dismiss the intro card
  const steps = keys ? keys.split(',') : [];
  const per = +wait / (steps.length + 1);
  await page.waitForTimeout(per);
  for (const s of steps) {
    const [k, ms] = s.split(':');
    await page.keyboard.down(k); await page.waitForTimeout(+ms || 300); await page.keyboard.up(k);
    await page.waitForTimeout(Math.max(0, per - (+ms || 300)));
  }
  const info = await page.evaluate(() => {
    const i = KOS.App.run.inst, b = i && i.boat;
    if (KOS.App.cur !== 'play' || !b) return { screen: KOS.App.cur };
    return { screen: KOS.App.cur, x: Math.round(b.x), y: Math.round(b.y), kn: +KOS.U.kn(Math.abs(b.speed)).toFixed(1), pos: b.pos, paused: KOS.App.run.paused };
  });
  console.log(JSON.stringify(info));
  const file = out || ('shot-play-' + id.replace(/[^\w.-]/g, '_') + '-' + size + '.png');
  await page.screenshot({ path: file });
  console.log('saved ' + file);
  console.log(logs.join('\n') || 'no console errors');
  await browser.close();
  process.exit(logs.some(l => l.startsWith('pageerror') || l.startsWith('error')) ? 1 : 0);
})();
