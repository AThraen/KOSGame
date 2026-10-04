// Mouse drag & drop + landscape phone + pro assist check for rigging. Headless.
const { chromium } = require('playwright');
const path = require('path'), url = require('url');
const ROOT = 'C:/Projects/KOSGame';
async function go(vp, id, assist, touch, tag) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const ctx = await browser.newContext(touch ? { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: vp });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.join(ROOT, 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(([id, assist]) => { KOS.Storage.saveProfile({ name: 'T', sailNo: '7', avatar: {} }); KOS.Storage.saveSettings({ assist, sound: true, unlockAll: true }); KOS.App.play(id, { force: true }); }, [id, assist]);
  await page.waitForTimeout(900);
  let n = 0, shot = false;
  while (n++ < 40) {
    const st = await page.evaluate(() => { const i = KOS.App.run.inst; if (!i || i.state.phase !== 'play') return null; const s = i.steps.find(s => !s.done && !i.steps.some(o => !o.done && o.g < s.g)); return s.i; });
    if (st == null) break;
    const card = page.locator('.rigging-card[data-i="' + st + '"]');
    await card.evaluate(e => e.scrollIntoView({ block: 'nearest', inline: 'center' }));
    await page.waitForTimeout(350);
    const bb = await card.boundingBox();
    const z = await page.evaluate(i => { const inst = KOS.App.run.inst; const zs = document.querySelectorAll('.rig-zone')[i]; const r = zs.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, st);
    const sx = bb.x + bb.width / 2, sy = bb.y + bb.height / 2;
    if (touch) {
      // synthesize pointer events via CDP touch
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
      for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (z.x - sx) * k / 12, y: sy + (z.y - sy) * k / 12 }] }); await page.waitForTimeout(16); }
      /* no shot mid-touch */
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(sx, sy); await page.mouse.down();
      for (let k = 1; k <= 12; k++) { await page.mouse.move(sx + (z.x - sx) * k / 12, sy + (z.y - sy) * k / 12); await page.waitForTimeout(16); }
      if (!shot) { await page.screenshot({ path: ROOT + '/shot-rtd-' + tag + '-drag.png' }); shot = true; }
      await page.mouse.up();
    }
    await page.waitForTimeout(300);
  }
  const s = await page.evaluate(() => { const i = KOS.App.run.inst; return i ? { phase: i.state.phase, done: i.steps.filter(s => s.done).length, n: i.steps.length, oops: i.state.mistakes } : { cur: KOS.App.cur }; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: ROOT + '/shot-rtd-' + tag + '-end.png' });
  console.log(tag, JSON.stringify(s), errs.length ? 'ERR ' + errs.join(' | ') : 'ok');
  await browser.close();
}
(async () => {
  await go({ width: 1440, height: 900 }, 'rigging.opti', 'normal', false, 'mouse-opti');
  await go({ width: 390, height: 844 }, 'rigging.ilca', 'pro', true, 'touch-ilca-pro');
  await go({ width: 844, height: 390 }, 'rigging.feva', 'normal', true, 'land-feva');
})();
