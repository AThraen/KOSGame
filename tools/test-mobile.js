// Headless check of the phone controls (two-thumb tiller layout, Normal-assist sheet nudge, the ⋯ menu, the goals chip).
// Real touch events through CDP, on the real game. NEVER opens a visible window.   node tools/test-mobile.js
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');
const INDEX = url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

async function open(browser, w, h, settings, act, touch = true) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(INDEX);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(s => {
    KOS.Storage.saveProfile({ name: 'Ida', age: '10-12', sailNo: '1', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings(Object.assign({ unlockAll: true }, s));
  }, settings);
  await page.evaluate(id => KOS.App.play(id, { force: true }), act);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const i = KOS.App.run.inst; if (i && i.skipIntro) i.skipIntro(); });
  await page.waitForTimeout(500);
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  const touchEv = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id == null ? i : p.id })) });
  return { ctx, page, errs, touchEv };
}
const box = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('no ' + sel); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
const state = page => page.evaluate(() => { const i = KOS.App.run.inst; return { st: JSON.parse(JSON.stringify(i.ctrl.state)), hdg: i.boat.heading, sheet: i.boat.sheet, c: JSON.parse(JSON.stringify(i.controls)), paused: KOS.App.run.paused }; });
const dHdg = (a, b) => ((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

async function phone(browser, w, h) {
  console.log('phone ' + w + 'x' + h + ' (Normal assist)');
  const { ctx, page, errs, touchEv } = await open(browser, w, h, { assist: 'normal', tilt: 'off' }, 'sail.free.opti');
  ok(await page.evaluate(() => document.body.classList.contains('phone-ui')), 'body.phone-ui');
  ok(await page.evaluate(() => !!document.querySelector('.kc.kc-tillermode .kc-tiller') && !document.querySelector('.kc-steer-l, .kc-steer-r')), 'auto resolves to the tiller layout, no split steer pads');
  // every control inside the screen, nothing overlapping
  const rects = await page.evaluate(() => [...document.querySelectorAll('.kc-tiller,.kc-sheet,.kc-hike,.kc-extra,.hud,.dots-btn,.pc-chip')].map(e => { const r = e.getBoundingClientRect(); return { c: String(e.className).split(' ')[0], x: r.left, y: r.top, r: r.right, b: r.bottom }; }));
  ok(rects.every(r => r.x >= -1 && r.y >= -1 && r.r <= w + 1 && r.b <= h + 1), 'controls inside the viewport');
  const over = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.x < b.r - 2 && b.x < a.r - 2 && a.y < b.b - 2 && b.y < a.b - 2) over.push(a.c + '/' + b.c); }
  ok(!over.length, 'no overlaps between controls, HUD, chip and the menu button ' + over.join(','));
  // --- tiller: drag right -> steer right, drag left -> steer left, release -> centre
  const T = await box(page, '.kc-tiller');
  const s0 = await state(page);
  await touchEv('touchStart', [{ x: T.x, y: T.y }]);
  for (let k = 1; k <= 6; k++) { await touchEv('touchMove', [{ x: T.x + k * 18, y: T.y }]); await page.waitForTimeout(30); }
  await page.waitForTimeout(1100);
  const s1 = await state(page);
  ok(s1.st.steer > 0.9, 'drag right -> steer ' + s1.st.steer.toFixed(2));
  ok(s1.c.rudder > 0.5, 'rudder follows (' + s1.c.rudder.toFixed(2) + ')');
  await touchEv('touchEnd', []);
  await page.waitForTimeout(500);
  const s2 = await state(page);
  ok(s2.st.steer === 0 && Math.abs(s2.c.rudder) < 0.2, 'release -> tiller centres (steer ' + s2.st.steer + ')');
  const hdgR = dHdg(s0.hdg, s1.hdg);
  await touchEv('touchStart', [{ x: T.x, y: T.y }]);
  for (let k = 1; k <= 3; k++) { await touchEv('touchMove', [{ x: T.x - k * 12, y: T.y }]); await page.waitForTimeout(30); }
  await page.waitForTimeout(1200);
  const s3 = await state(page);
  ok(s3.st.steer < -0.3 && s3.st.steer > -0.95, 'a half drag left gives proportional steer ' + s3.st.steer.toFixed(2));
  await touchEv('touchEnd', []);
  await page.waitForTimeout(300);
  const hdgL = dHdg(s2.hdg, s3.hdg);
  ok(hdgR > 0.05 && hdgL < -0.05, 'boat heading changes both ways (right ' + hdgR.toFixed(2) + ' rad, left ' + hdgL.toFixed(2) + ' rad)');
  // --- Normal assist: the sheet slider nudges auto-trim
  const b0 = await state(page);
  ok(b0.st.autoTrim === true && b0.c.autoTrim === true, 'Normal starts with auto-trim on');
  ok((await page.textContent('.kc-sheet .kc-auto')).trim() === 'AUTO', 'badge reads AUTO');
  const th = await box(page, '.kc-sheet .kc-thumb'), tr = await box(page, '.kc-sheet .kc-track');
  await touchEv('touchStart', [{ x: th.x, y: th.y }]);
  for (let k = 1; k <= 5; k++) { await touchEv('touchMove', [{ x: th.x, y: th.y + k * 9 }]); await page.waitForTimeout(40); }
  await page.waitForTimeout(500);
  const n1 = await state(page);
  ok(n1.st.autoTrim === true && n1.c.autoTrim === true, 'dragging does not switch auto-trim off');
  ok(n1.st.trimBias > 0.1 && Math.abs(n1.c.trimBias - n1.st.trimBias) < 1e-6, 'drag down eases: trimBias ' + n1.st.trimBias.toFixed(2) + ' reaches the physics controls');
  ok(n1.sheet > b0.sheet + 0.05, 'boat sheet follows (' + b0.sheet.toFixed(2) + ' -> ' + n1.sheet.toFixed(2) + ')');
  ok((await page.textContent('.kc-sheet .kc-auto')).includes('▼'), 'badge shows the nudge direction');
  await touchEv('touchEnd', []);
  await page.waitForTimeout(6500);
  const n2 = await state(page);
  ok(n2.st.trimBias < n1.st.trimBias * 0.6 && n2.st.trimBias > 0, 'released: springs back slowly (' + n1.st.trimBias.toFixed(2) + ' -> ' + n2.st.trimBias.toFixed(2) + ')');
  const mid = tr.y;
  await touchEv('touchStart', [{ x: th.x, y: mid }]);
  for (let k = 1; k <= 4; k++) { await touchEv('touchMove', [{ x: th.x, y: mid - k * 12 }]); await page.waitForTimeout(40); }
  await page.waitForTimeout(300);
  const n3 = await state(page);
  ok(n3.st.trimBias < -0.03, 'drag up tightens: trimBias ' + n3.st.trimBias.toFixed(2));
  await touchEv('touchEnd', []);
  // AUTO badge -> manual: the slider is the sheet again
  const ab = await box(page, '.kc-sheet .kc-auto');
  await touchEv('touchStart', [{ x: ab.x, y: ab.y }]); await touchEv('touchEnd', []);
  await page.waitForTimeout(200);
  const m1 = await state(page);
  ok(m1.st.autoTrim === false && m1.c.trimBias === 0 && (await page.textContent('.kc-sheet .kc-auto')).trim() === 'MANUEL', 'tap AUTO -> MANUEL, no bias');
  await touchEv('touchStart', [{ x: th.x, y: tr.b.y + 20 }]); await page.waitForTimeout(150);
  const m2 = await state(page);
  ok(m2.st.sheet < 0.15 && m2.c.sheet < 0.15, 'manual: touching the top sets the sheet absolutely (' + m2.c.sheet.toFixed(2) + ')');
  await touchEv('touchEnd', []);
  await page.tap('.kc-sheet .kc-auto'); // back to auto for the rest
  // --- the menu button
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.dots-btn')).display !== 'none' && ['.pause-btn', '.view-btn', '.tilt-btn'].every(s => getComputedStyle(document.querySelector(s)).display === 'none')), 'only the ⋯ button is visible in the chrome');
  await page.tap('.dots-btn');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !!document.querySelector('.play-menu') && KOS.App.run.paused && !document.querySelector('.pause-overlay')), 'menu open: game paused, no pause card');
  const rowsTxt = await page.evaluate(() => document.querySelector('.play-menu').innerText);
  ok(/Pause/.test(rowsTxt) && /Overblik/.test(rowsTxt) && /Skrå visning/.test(rowsTxt), 'menu has Pause / Overblik / Skrå visning (' + rowsTxt.replace(/\s+/g, ' ').trim() + ')');
  await page.tap('.play-menu-scrim', { position: { x: w - 30, y: h / 2 } });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.querySelector('.play-menu') && !KOS.App.run.paused), 'tap outside closes it and the game runs again');
  await page.tap('.dots-btn'); await page.waitForTimeout(200);
  await page.tap('.play-menu [data-tilt="on"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => KOS.Storage.settings().tilt === 'on' && KOS.SailScene.view.tilt === true), 'Skrå visning Til is stored in the settings and applied');
  ok(await page.evaluate(() => !document.querySelector('.play-menu') && !KOS.App.run.paused), 'menu closes on a choice');
  await page.tap('.dots-btn'); await page.waitForTimeout(200);
  await page.tap('.play-menu [data-pm="overview"]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => KOS.SailScene.view.overview === true && !KOS.App.run.paused), 'Overblik toggles the overview');
  await page.tap('.dots-btn'); await page.waitForTimeout(200);
  await page.tap('.play-menu [data-pm="overview"]'); await page.waitForTimeout(250); // and back to the normal view
  await page.tap('.dots-btn'); await page.waitForTimeout(200);
  await page.tap('.play-menu [data-pm="pause"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector('.pause-overlay') && KOS.App.run.paused), 'Pause row shows the pause card');
  await page.evaluate(() => KOS.App.setPaused(false));
  // --- goals chip: the card collapses after a few seconds, tap the chip to expand
  await page.waitForTimeout(5200);
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
  ok((await vis('.pc-chip')) && !(await vis('.sail-goals')), 'goals card collapsed to the chip');
  await page.tap('.pc-chip'); await page.waitForTimeout(250);
  ok(await vis('.sail-goals'), 'tap the chip -> the goals card expands');
  await page.tap('.pc-chip'); await page.waitForTimeout(250);
  ok(!(await vis('.sail-goals')), 'tap again -> collapses');
  ok(!errs.length, 'no console errors ' + errs.join(' | '));
  await ctx.close();
}

async function pro(browser) {
  console.log('phone 852x393 (Pro assist: fully manual)');
  const { ctx, page, errs, touchEv } = await open(browser, 852, 393, { assist: 'pro', tilt: 'off' }, 'sail.free.opti');
  const b0 = await state(page);
  ok(b0.st.autoTrim === false && (await page.textContent('.kc-sheet .kc-auto')).trim() === 'MANUEL', 'Pro: manual, badge MANUEL');
  const tr = await box(page, '.kc-sheet .kc-track');
  await touchEv('touchStart', [{ x: tr.x, y: tr.b.y + tr.b.height - 10 }]); await page.waitForTimeout(200);
  const s = await state(page);
  ok(s.st.sheet > 0.85 && s.st.trimBias === 0 && s.c.trimBias === 0, 'Pro: the slider is the sheet (' + s.st.sheet.toFixed(2) + '), no nudge');
  await touchEv('touchEnd', []);
  ok(!errs.length, 'no console errors ' + errs.join(' | '));
  await ctx.close();
}

async function bigScreens(browser) {
  for (const [w, h, touch, label] of [[1440, 900, false, 'desktop'], [1024, 1366, true, 'tablet']]) {
    console.log(label + ' ' + w + 'x' + h + ' (unchanged layout)');
    const { ctx, page, errs } = await open(browser, w, h, { assist: 'normal', tilt: 'off' }, 'sail.free.opti', touch);
    ok(await page.evaluate(() => !document.body.classList.contains('phone-ui') && !document.querySelector('.kc-tiller') && !!document.querySelector('.kc-steer-l') && !!document.querySelector('.kc-steer-r')), 'split steer pads, no tiller');
    ok(await page.evaluate(() => ['.pause-btn', '.view-btn', '.tilt-btn'].every(s => getComputedStyle(document.querySelector(s)).display !== 'none') && getComputedStyle(document.querySelector('.dots-btn')).display === 'none'), 'pause / overview / tilt buttons, no ⋯');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.sail-goals')).display !== 'none' && getComputedStyle(document.querySelector('.pc-chip')).display === 'none'), 'goals card stays open, no chip');
    // keyboard still works: arrow keys steer and nudge
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400);
    ok((await state(page)).st.steer === 1, 'keyboard: right arrow steers');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(600);
    const k1 = await state(page);
    ok(k1.st.autoTrim === true && k1.st.trimBias > 0.05, 'keyboard: down arrow eases the sheet as a nudge on Normal (bias ' + k1.st.trimBias.toFixed(2) + ')');
    await page.keyboard.up('ArrowDown');
    await page.keyboard.press('KeyM');
    ok(await page.evaluate(() => KOS.SailScene.view.overview === true), 'key M still toggles the overview');
    await page.keyboard.press('KeyV');
    await page.keyboard.press('KeyP'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => KOS.App.run.paused && !!document.querySelector('.pause-overlay')), 'key P pauses');
    ok(!errs.length, 'no console errors ' + errs.join(' | '));
    await ctx.close();
  }
}

async function settingsScreen(browser) {
  console.log('settings screen');
  const { ctx, page } = await open(browser, 393, 852, { assist: 'normal' }, 'sail.free.opti');
  for (const [lang, txt] of [['da', 'Rorpind + skøde'], ['en', 'Tiller + sheet']]) {
    await page.evaluate(l => { KOS.Storage.saveSettings({ lang: l }); KOS.I18n.setLang && KOS.I18n.setLang(l); KOS.App.show('settings'); }, lang);
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => document.querySelector('#screen-settings').innerText)).includes(txt), lang + ': settings shows "' + txt + '"');
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    await phone(browser, 852, 393);
    await phone(browser, 393, 852);
    await pro(browser);
    await bigScreens(browser);
    await settingsScreen(browser);
  } finally { await browser.close(); }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
  process.exit(fails ? 1 : 0);
})();
