// Headless check of KOS.Input (touch + keyboard) and KOS.Audio (offline renders). NEVER opens a visible window.
// Usage: node tools/test-input.js [--shots]   (screenshots go to ./shot-input-*.png, gitignored)
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');
const SHOTS = process.argv.includes('--shots');
const demo = q => url.pathToFileURL(path.resolve(__dirname, 'input-demo.html')).href + q;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error('no element ' + sel);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}
const st = page => page.evaluate(() => JSON.parse(JSON.stringify(window.ctrl.state)));

async function touchSuite(browser, w, h) {
  const tag = w + 'x' + h;
  console.log('touch ' + tag);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(demo('?layout=sail&spi=1'));
  await page.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id == null ? i : p.id })) });

  ok(await page.evaluate(() => document.querySelector('.kc').classList.contains(innerWidth > innerHeight ? 'kc-landscape' : 'kc-portrait')), 'orientation class');
  ok(await page.evaluate(() => document.querySelector('.kc').classList.contains('kc-touch')), 'touch mode detected');
  // every control inside the viewport and >= 44 px
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.kc-pad,.kc-btn,.kc-slider,.kc-wheel,.kc-joy')].map(e => { const r = e.getBoundingClientRect(); return { c: e.className, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
  ok(boxes.every(b => b.x >= 0 && b.y >= 0 && b.r <= innerW(w) && b.b <= h), 'controls inside viewport');
  ok(boxes.every(b => b.w >= 44 && b.h >= 44), 'touch targets >= 44px');
  ok(!overlaps(boxes), 'no overlapping controls ' + (overlaps(boxes) || ''));

  const L = await center(page, '.kc-steer-l'), R = await center(page, '.kc-steer-r'), H = await center(page, '.kc-hike');
  await touch('touchStart', [L]);
  await page.waitForTimeout(80);
  ok((await st(page)).steer === -1, 'left pad -> steer -1');
  if (SHOTS) await page.screenshot({ path: 'shot-input-' + tag + '-press.png' });
  // multi-touch: keep steering, add hike
  await touch('touchStart', [L, H]);
  await page.waitForTimeout(400);
  let s = await st(page);
  ok(s.steer === -1 && s.hike > 0.9, 'multi-touch steer + hike (' + s.steer + ', ' + s.hike.toFixed(2) + ')');
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  s = await st(page);
  ok(s.steer === 0 && s.hike < 0.3, 'release -> steer 0, hike decays');
  await touch('touchStart', [R]); await page.waitForTimeout(60);
  ok((await st(page)).steer === 1, 'right pad -> steer 1');
  await touch('touchStart', [R, L]); await page.waitForTimeout(60);
  ok((await st(page)).steer === 0, 'both pads -> 0');
  await touch('touchEnd', []);
  const rud = await page.evaluate(() => window.controls.rudder);
  ok(Math.abs(rud) < 1, 'rudder smoothed (' + rud.toFixed(2) + ')');
  // sheet drag
  const T = await center(page, '.kc-sheet .kc-track');
  await touch('touchStart', [{ x: T.x, y: T.b.y + 22 }]);
  await page.waitForTimeout(30);
  const top = (await st(page)).sheet;
  await touch('touchMove', [{ x: T.x, y: T.b.y + T.b.height - 22 }]);
  await page.waitForTimeout(30);
  const bot = (await st(page)).sheet;
  await touch('touchEnd', []);
  ok(top < 0.05 && bot > 0.95, 'sheet slider top=' + top.toFixed(2) + ' bottom=' + bot.toFixed(2));
  // spinnaker toggle
  const S = await center(page, '.kc-spi');
  await touch('touchStart', [S]); await touch('touchEnd', []);
  await page.waitForTimeout(50);
  ok((await st(page)).spinnaker === true, 'SPI toggles on');
  // extra button
  const X = await center(page, '[data-btn="action"]');
  await touch('touchStart', [X]); await touch('touchEnd', []);
  await page.waitForTimeout(50);
  ok((await page.evaluate(() => events)).includes('action'), 'extra action button fires');
  await page.evaluate(() => ctrl.setIdealSheet(0.45, 0.1));
  await page.evaluate(() => ctrl.setSheet(0.45));
  await page.waitForTimeout(250);
  if (SHOTS) await page.screenshot({ path: 'shot-input-' + tag + '-sail.png' });

  // RIB
  await page.goto(demo('?layout=rib')); await page.waitForTimeout(300);
  const boxesR = await page.evaluate(() => [...document.querySelectorAll('.kc-pad,.kc-btn,.kc-slider,.kc-wheel,.kc-joy')].map(e => { const r = e.getBoundingClientRect(); return { c: e.className, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
  ok(!overlaps(boxesR) && boxesR.every(b => b.x >= 0 && b.b <= h), 'rib controls placed ' + (overlaps(boxesR) || ''));
  const cdp2 = await ctx.newCDPSession(page);
  const touch2 = (type, pts) => cdp2.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const TT = await center(page, '.kc-throttle .kc-track');
  const Wc = await center(page, '.kc-wheel');
  // throttle to full ahead + turn the wheel clockwise with a second finger
  await touch2('touchStart', [{ x: TT.x, y: TT.y }]);
  await touch2('touchMove', [{ x: TT.x, y: TT.b.y + 10 }]);
  await touch2('touchStart', [{ x: TT.x, y: TT.b.y + 10 }, { x: Wc.x, y: Wc.b.y + 10 }]);
  for (let i = 1; i <= 6; i++) {
    const a = i * 0.2;
    await touch2('touchMove', [{ x: TT.x, y: TT.b.y + 10 }, { x: Wc.x + Math.sin(a) * (Wc.b.width / 2 - 10), y: Wc.y - Math.cos(a) * (Wc.b.height / 2 - 10) }]);
  }
  await page.waitForTimeout(50);
  s = await st(page);
  ok(s.throttle > 0.95 && s.steer > 0.3, 'rib throttle ahead + wheel (thr ' + s.throttle.toFixed(2) + ', steer ' + s.steer.toFixed(2) + ')');
  if (SHOTS) await page.screenshot({ path: 'shot-input-' + tag + '-rib.png' });
  await touch2('touchEnd', []);
  await page.waitForTimeout(600);
  s = await st(page);
  ok(Math.abs(s.steer) < 0.1 && s.throttle > 0.95, 'wheel springs back, throttle stays');
  ok((await page.evaluate(() => events)).some(e => e.indexOf('gear') === 0), 'gear event on shifting');

  // joystick
  await page.goto(demo('?layout=sail&joy=1')); await page.waitForTimeout(300);
  const cdp3 = await ctx.newCDPSession(page);
  const J = await center(page, '.kc-joy');
  await cdp3.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: J.x, y: J.y, id: 0 }] });
  await cdp3.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: J.x - 80, y: J.y, id: 0 }] });
  await page.waitForTimeout(50);
  ok((await st(page)).steer < -0.9, 'joystick left');
  if (SHOTS) await page.screenshot({ path: 'shot-input-' + tag + '-joy.png' });
  await cdp3.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await ctx.close();
}
function innerW(w) { return w; }
function overlaps(bs) {
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) return a.c + ' / ' + b.c;
  }
  return '';
}

async function keyboardSuite(browser) {
  console.log('keyboard desktop 1440x900');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(demo('?layout=sail&spi=1&kind=sym'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.kc').classList.contains('kc-fine')), 'fine-pointer mode on desktop');
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(100);
  ok((await st(page)).steer === -1, 'ArrowLeft steers -1');
  await page.waitForTimeout(400);
  const rud = await page.evaluate(() => controls.rudder);
  ok(rud < -0.9, 'rudder reaches lock (' + rud.toFixed(2) + ')');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(60);
  ok((await st(page)).steer === 1, 'D steers +1');
  await page.keyboard.up('KeyD');
  const s0 = (await st(page)).sheet;
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(400);
  const s1 = (await st(page)).sheet;
  ok(s1 < s0 - 0.1, 'ArrowUp sheets in (' + s0.toFixed(2) + ' -> ' + s1.toFixed(2) + ')');
  ok((await st(page)).sheetDelta === -1, 'sheetDelta -1 while held');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('KeyS'); await page.waitForTimeout(400); await page.keyboard.up('KeyS');
  ok((await st(page)).sheet > s1 + 0.1, 'S eases out');
  await page.keyboard.down('Space'); await page.waitForTimeout(350);
  ok((await st(page)).hike > 0.9, 'Space hikes');
  if (SHOTS) await page.screenshot({ path: 'shot-input-desktop.png' });
  await page.keyboard.up('Space');
  await page.keyboard.press('KeyE');
  ok((await st(page)).spinnaker === true, 'E toggles spinnaker');
  await page.keyboard.press('Enter'); await page.keyboard.press('KeyP'); await page.keyboard.press('Escape'); await page.keyboard.press('Digit1');
  const ev = await page.evaluate(() => events);
  ok(ev.includes('action') && ev.filter(e => e === 'pause').length === 2 && ev.includes('horn'), 'Enter/P/Esc/1 events: ' + ev.join(','));
  // mouse on a pad
  const L = await center(page, '.kc-steer-l');
  await page.mouse.move(L.x, L.y); await page.mouse.down(); await page.waitForTimeout(60);
  ok((await st(page)).steer === -1, 'mouse press on pad steers');
  await page.mouse.up();
  // detach cleans up
  const left = await page.evaluate(() => { ctrl.detach(); return document.querySelectorAll('.kc').length; });
  ok(left === 0, 'detach removes DOM');
  // RIB keyboard throttle with neutral detent
  await page.goto(demo('?layout=rib')); await page.waitForTimeout(200);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
  const t1 = (await st(page)).throttle;
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowDown');
  const t2 = (await st(page)).throttle;
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(400); await page.keyboard.up('ArrowDown');
  const t3 = (await st(page)).throttle;
  ok(t1 > 0.4 && t2 === 0 && t3 < -0.2, 'rib throttle keys with neutral detent (' + [t1, t2, t3].map(v => v.toFixed(2)) + ')');
  if (SHOTS) await page.screenshot({ path: 'shot-input-desktop-rib.png' });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await ctx.close();
}

async function audioSuite(browser) {
  console.log('audio');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(demo('?layout=none'));
  const res = await page.evaluate(async () => {
    const out = {};
    for (const n of KOS.Audio.names) out[n] = await KOS.Audio.render(n);
    return out;
  });
  const bad = Object.entries(res).filter(([, r]) => !r || !(r.peak > 0.01) || !isFinite(r.rms));
  ok(bad.length === 0, 'all ' + Object.keys(res).length + ' one-shots render audible: ' + (bad.map(b => b[0]).join(',') || 'yes'));
  const loud = Object.entries(res).filter(([, r]) => r && r.peak > 1.6);
  ok(loud.length === 0, 'no wildly clipping one-shots ' + loud.map(l => l[0] + '=' + l[1].peak).join(','));
  console.log('    ' + Object.entries(res).map(([n, r]) => n + ':' + (r && r.peak)).join(' '));
  await page.mouse.click(5, 5); // user gesture → unlock
  const live = await page.evaluate(async () => {
    KOS.Audio.unlock(); KOS.Audio.setMusic(true);
    KOS.Audio.names.forEach((n, i) => setTimeout(() => KOS.Audio.play(n, { vol: 0.5, pan: (i % 3) - 1 }), i * 30));
    KOS.Audio.ambient({ wind: 14, waves: 0.6, harbor: 0.8 });
    KOS.Audio.engine(0.2); setTimeout(() => KOS.Audio.engine(-0.5), 400);
    KOS.Audio.music('menu'); setTimeout(() => KOS.Audio.music('race'), 600); setTimeout(() => KOS.Audio.music('calm'), 1200);
    await new Promise(r => setTimeout(r, 1700));
    const s1 = KOS.Audio.state();
    KOS.Audio.mute(true); KOS.Audio.setVolume(0.3); KOS.Audio.stopAll();
    await new Promise(r => setTimeout(r, 200));
    return { s1, s2: KOS.Audio.state() };
  });
  ok(live.s1.unlocked && live.s1.ambient && live.s1.engine && live.s1.music === 'calm', 'live audio graph runs: ' + JSON.stringify(live.s1));
  ok(live.s2.muted && !live.s2.ambient && !live.s2.engine && !live.s2.music, 'mute + stopAll');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    await touchSuite(browser, 390, 844);
    await touchSuite(browser, 844, 390);
    await keyboardSuite(browser);
    await audioSuite(browser);
  } finally { await browser.close(); }
  console.log(fails ? fails + ' FAILED' : 'all input/audio checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
