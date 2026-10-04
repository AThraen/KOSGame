// scratch: node tools/_shotplay.js <activityId> <w>x<h> <waitMs> [keys] [out]   (temporary helper, deleted before commit)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [id, size = '1440x900', wait = '5000', keys = '', out] = process.argv.slice(2);
  const [w, h] = size.split('x').map(Number);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const mobile = w < 900 || h < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto(require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await page.waitForTimeout(500);
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'Ida', age: '10-12', sailNo: '123', boatColor: '#ff7a3d' }); KOS.Storage.saveSettings({ unlockAll: true }); });
  if (id.startsWith('screen:')) await page.evaluate(s => KOS.App.show(s.split(':')[1], { area: s.split(':')[2] || 'bay' }), id);
  else await page.evaluate(id => KOS.App.play(id, { force: true }), id);
  const steps = keys ? keys.split(',') : [];
  const per = steps.length ? +wait / (steps.length + 1) : +wait;
  await page.waitForTimeout(per);
  for (const s of steps) {
    const [k, ms] = s.split(':');
    if (k === 'eval') { console.log(await page.evaluate(ms)); continue; }
    await page.keyboard.down(k); await page.waitForTimeout(+ms || 300); await page.keyboard.up(k);
    await page.waitForTimeout(Math.max(0, per - (+ms || 300)));
  }
  const info = await page.evaluate(() => { const i = KOS.App.run.inst; if (!i || !i.boat) return KOS.App.cur; const b = i.boat; return { cur: KOS.App.cur, x: b.x | 0, y: b.y | 0, kn: KOS.U.kn(b.speed).toFixed(1), pos: b.pos, phase: i.state.phase, items: i.state.items.length, got: i.state.collected, t: i.state.time.toFixed(1), leg: i.state.leg }; });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: out || ('shot-play-' + id.replace(/[^\w.-]/g, '_') + '-' + size + '.png') });
  console.log(logs.join('\n') || 'no console errors');
  await browser.close();
})();
