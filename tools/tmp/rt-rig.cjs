// Rigging playtest: every activity, desktop keyboard + phone touch. Headless only.
// node rt.js [filter] [--shots]
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');
const ROOT = 'C:/Projects/KOSGame';
const filter = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const SHOTS = process.argv.includes('--shots');
const ONLY = (process.argv.find(a => a.startsWith('--dev=')) || '').split('=')[1];

async function run(dev, id, assist) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const ctx = await browser.newContext(dev === 'phone'
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await page.goto(url.pathToFileURL(path.join(ROOT, 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  await page.evaluate(([id, assist]) => {
    KOS.Storage.saveProfile({ name: 'Test', sailNo: '42', avatar: {} });
    KOS.Storage.saveSettings({ assist, sound: true, unlockAll: true });
    KOS.App.play(id, { force: true });
  }, [id, assist]);
  await page.waitForTimeout(900);
  const tag = dev + '-' + id.replace(/\./g, '_') + '-' + assist;
  if (SHOTS) await page.screenshot({ path: ROOT + '/shot-rt-' + tag + '-a.png' });
  const log = [];
  // layout checks
  const lay = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const cards = [...document.querySelectorAll('.rigging-card')].map(c => c.getBoundingClientRect());
    const small = cards.filter(r => r.width < 44 || r.height < 44).length;
    const pause = document.querySelector('.pause-btn').getBoundingClientRect();
    const hud = document.querySelector('.rigging-hud').getBoundingClientRect();
    const scene = document.querySelector('.rigging-scene').getBoundingClientRect();
    const overlapHudPause = !(hud.right < pause.left || hud.left > pause.right || hud.bottom < pause.top || hud.top > pause.bottom);
    return { vw, vh, nCards: cards.length, small, scene: [Math.round(scene.top), Math.round(scene.height)], hud: [Math.round(hud.left), Math.round(hud.right), Math.round(hud.bottom)], overlapHudPause, hscroll: document.documentElement.scrollWidth > vw };
  });
  log.push('layout ' + JSON.stringify(lay));
  let wrongDone = false;
  let guard = 0;
  while (guard++ < 60) {
    const st = await page.evaluate(() => {
      const inst = KOS.App.run.inst; if (!inst) return { gone: true };
      const S = inst.state;
      const av = inst.steps.filter(s => !s.done && !inst.steps.some(o => !o.done && o.g < s.g));
      const blocked = inst.steps.filter(s => !s.done && av.indexOf(s) < 0);
      return { phase: S.phase, next: av.length ? av[0].i : -1, wrong: blocked.length ? blocked[blocked.length - 1].i : -1, decoy: inst.decoys.length ? inst.decoys[0].i : -1 };
    });
    if (st.gone || st.phase !== 'play') break;
    let target = st.next;
    if (!wrongDone && st.wrong >= 0 && guard > 2) { target = st.wrong; wrongDone = true; }
    if (dev === 'desktop') {
      // keyboard: arrows until the target card is selected, then Enter
      let k = 0;
      while (k++ < 40) {
        const sel = await page.evaluate(() => { const s = KOS.App.run.inst.state.sel; return s ? s.i : -2; });
        if (sel === target) break;
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(30);
      }
      await page.keyboard.press('Enter');
    } else {
      // touch: tap the card, then tap the Sæt på button
      const card = page.locator('.rigging-card[data-i="' + target + '"]');
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const bb = await card.boundingBox();
      if (!bb) { log.push('no card box ' + target); break; }
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(200);
      const btn = await page.locator('.rigging-do').boundingBox();
      if (!btn) { log.push('no do button'); break; }
      if (btn.y + btn.height > lay.vh || btn.y < 0) log.push('do button offscreen ' + JSON.stringify(btn));
      await page.touchscreen.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
    }
    await page.waitForTimeout(260);
    if (SHOTS && guard === 4) await page.screenshot({ path: ROOT + '/shot-rt-' + tag + '-b.png' });
  }
  if (SHOTS) { await page.waitForTimeout(1600); await page.screenshot({ path: ROOT + '/shot-rt-' + tag + '-c.png' }); }
  await page.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 15000 }).catch(() => log.push('NO RESULTS SCREEN, cur=' ));
  const res = await page.evaluate(() => ({ cur: KOS.App.cur, txt: (document.querySelector('#screen-results') || document.body).innerText.slice(0, 300).replace(/\s+/g, ' ') }));
  if (SHOTS) await page.screenshot({ path: ROOT + '/shot-rt-' + tag + '-d.png' });
  log.push('result: ' + res.cur + ' | ' + res.txt);
  await browser.close();
  return { tag, log, errs };
}

(async () => {
  const ids = ['rigging.opti', 'rigging.tera', 'rigging.feva', 'rigging.zest', 'rigging.ilca', 'rigging.29er', 'rigging.hboat', 'rigging.j70',
    'rigging.unrig.opti', 'rigging.unrig.feva', 'rigging.unrig.ilca', 'rigging.unrig.j70'].filter(i => i.includes(filter));
  for (const id of ids) {
    for (const [dev, assist] of [['desktop', 'normal'], ['phone', 'easy']]) {
      if (ONLY && ONLY !== dev) continue;
      const r = await run(dev, id, assist);
      console.log('== ' + r.tag); r.log.forEach(l => console.log('  ' + l)); r.errs.forEach(e => console.log('  ERR ' + e));
    }
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
