// Julekalender end-to-end test (headless Chrome, never a window): docs/superpowers/specs/2026-10-29-christmas-calendar-design.md section 9.
//   - 5 Dec 2026 (God mode) at 390x844 and 1280x800: title snow + greeting, hub pin + tree + elf chip, doors 1-5 ready / 6-24 locked
//   - door 1 -> card -> play -> God win -> gold bauble; find elf 1 at its spot -> 1/24 -> gallery shows it
//   - 1 Dec first visit: toast, then (once it has gone) the hatted coach, clear of the pin at 390x844 and 844x390; a tap
//     on it opens the calendar. A ready door swings open (motion on). Calendar fit at 844x390 (no scroll) and 320x568
//   - 13 Dec: the Julekalender pin clear of every other pin (badge, label, NY, "Start her") at 320x568 .. 1280x800, da and en
//   - teaser: no elf chip; "Alle steder" lists the Julekalender first, Halloween after the areas
//   - 28 Oct (Halloween) unchanged; the 'event' area lists no xmas activities
//   - 29 Nov 2026 (teaser) and 7 Jan 2027 (after): pin text / no pin, no decorations, no xmas.* activities
//   - all 24 door activities launch (start, wait 1.5 s, quit) without page errors
//   - zero pageerror / console errors throughout. Screenshots: tools/tmp/xmas/e2e-*.png
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');
const fs = require('fs');

const INDEX = url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const OUT = path.resolve(__dirname, 'tmp', 'xmas');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'e2e-' + name + '.png') });

let fails = 0, errs = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('FAIL ' + msg); } else console.log('ok   ' + msg); };
const tap = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.click(); }, sel);
const cur = p => p.evaluate(() => KOS.App.cur);
const clean = p => p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; KOS.UI.coachClose && KOS.UI.coachClose(); let d; while ((d = KOS.UI.topDialog())) d.close(); });

async function open(browser, hash, w, h, motion) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errs++; console.error('PAGEERR', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errs++; console.error('CONSOLE', m.text()); } });
  await page.goto('about:blank');
  await page.goto(INDEX + hash);
  await page.waitForFunction(() => document.documentElement.classList.contains('booted') && window.KOS && KOS.Xmas, null, { timeout: 20000 });
  await page.evaluate(m => {
    KOS.Storage.saveProfile({ name: 'Nisse', age: '10-12', sailNo: '7', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings({ sound: false, music: false, lang: 'da', reducedMotion: !m });
    KOS.Storage.set('hubSwipeTip', true);
    KOS.Xmas.reset();
  }, !!motion);
  return { ctx, page };
}
const show = async (page, s) => { await page.evaluate(s => KOS.App.show(s), s); await page.waitForTimeout(500); };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  // ---------------------------------------------------------------- 5 Dec, both viewports: look + calendar state
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const tag = w + 'x' + h;
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-05', w, h, true); // motion on: snow is left out with reduced motion
    await show(page, 'title');
    await page.waitForTimeout(1200);
    ok(await page.$('#screen-title .xs-snow i') !== null, tag + ' title has snow');
    ok(/God jul fra KØS/.test(await page.textContent('#screen-title')), tag + ' title greets');
    await shot(page, 'title-' + tag);
    await show(page, 'hub');
    await page.waitForTimeout(1500);
    await clean(page);
    ok(await page.$('.hub-pin-ev-xmas') !== null, tag + ' hub has the Julekalender pin');
    ok(await page.$('.hub-xdeco .hx-bigtree .xa-tree') !== null, tag + ' hub has the tree');
    ok(await page.$('.hub-xmas .xc-chip') !== null, tag + ' hub has the elf chip');
    await shot(page, 'hub-' + tag);
    await show(page, 'xmas');
    const n = await page.evaluate(() => ({ ready: document.querySelectorAll('.xc-door.is-ready').length, locked: document.querySelectorAll('.xc-door.is-locked').length }));
    ok(n.ready === 5 && n.locked === 19, tag + ' doors 1-5 ready, 6-24 locked: ' + JSON.stringify(n));
    await shot(page, 'calendar-' + tag);
    await ctx.close();
  }

  // ---------------------------------------------------------------- the pin is clear of every other pin (badge, label,
  // "NY" tag, Sejlerskolen's "Start her" ring) in both languages, down to 320x568 (a fresh player: "Start her" shows)
  for (const [w, h] of [[320, 568], [390, 844], [1280, 800]]) for (const lang of ['da', 'en']) {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-13', w, h);
    await page.evaluate(l => { KOS.Storage.saveSettings({ lang: l }); KOS.App.applySettings(); }, lang);
    await show(page, 'hub');
    await page.waitForTimeout(1000);
    await clean(page);
    const hits = await page.evaluate(() => {
      const R = e => e.getBoundingClientRect(), pin = document.querySelector('.hub-pin-ev-xmas');
      const mine = [pin.querySelector('.hub-pin-badge'), pin.querySelector('.hub-pin-label')];
      const others = [...document.querySelectorAll('.hub-pin:not(.hub-pin-ev-xmas), .hub-pin:not(.hub-pin-ev-xmas) *')].filter(e => R(e).width);
      const out = [];
      for (const m of mine) for (const o of others) {
        const a = R(m), c = R(o), ix = Math.min(a.right, c.right) - Math.max(a.left, c.left), iy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ix > 0 && iy > 0) out.push(String(m.className).slice(8) + ' x ' + String(o.className).slice(0, 30) + ' ' + Math.round(ix) + 'x' + Math.round(iy));
      }
      return [...new Set(out)];
    });
    ok(hits.length === 0, w + 'x' + h + ' ' + lang + ' the Julekalender pin is clear of the other pins ' + JSON.stringify(hits));
    await ctx.close();
  }

  // ---------------------------------------------------------------- door 1 -> play -> win -> gold; elf 1 -> gallery
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-05', 390, 844);
    await show(page, 'xmas');
    await tap(page, '.xc-door[data-door="1"]');
    await page.waitForTimeout(300);
    ok(await page.$('.xc-card-dlg') !== null, 'door 1 shows the card');
    await shot(page, 'card');
    await tap(page, '.xc-card-dlg .btn-primary');
    await page.waitForTimeout(1500);
    ok(await cur(page) === 'play' && await page.evaluate(() => KOS.App.run.act.id) === 'xmas.presents', 'Spil launches xmas.presents');
    await tap(page, '.pause-btn'); await page.waitForTimeout(250);
    await tap(page, '[data-p="win3"]'); await page.waitForTimeout(1300);
    ok(await cur(page) === 'results', 'God win -> results');
    ok(await page.evaluate(() => KOS.Xmas.isGold(1)), 'door 1 bauble is gold');
    await shot(page, 'results');
    await tap(page, '#screen-results [data-act="map"]'); await page.waitForTimeout(400);
    ok(await cur(page) === 'xmas' && await page.$('.xc-door.is-gold[data-door="1"]') !== null, 'back on the calendar, door 1 gold');
    await shot(page, 'calendar-gold');
    // elf 1 at its spot (the hub): found, counter, gallery
    await show(page, 'hub'); await page.waitForTimeout(1200); await clean(page);
    ok(await page.$('[data-xmas-elf="1"]') !== null, 'elf 1 is at its spot on the hub');
    await tap(page, '[data-xmas-elf="1"]'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => KOS.Xmas.isFound(1)), 'elf 1 found');
    ok(/1\/24/.test(await page.textContent('.hub-xmas .xc-chip')), 'chip counts 1/24');
    await show(page, 'xmas');
    await tap(page, '#screen-xmas .xc-chip'); await page.waitForTimeout(300);
    ok(await page.$('.xc-gslot.has[data-elf="1"]') !== null, 'gallery shows elf 1');
    await shot(page, 'gallery');
    await ctx.close();
  }

  // ---------------------------------------------------------------- first visit on 1 Dec (fresh profile): toast, then the hatted coach
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const tag = w + 'x' + h;
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-01', w, h, true);
    await show(page, 'hub'); await page.waitForTimeout(2300);
    ok(await page.$('#toasts .toast') !== null && await page.$('.coach') === null, tag + ' 1 Dec first visit: the toast shows, the coach waits');
    await page.waitForTimeout(5600);
    const co = await page.evaluate(() => {
      const c = document.querySelector('.coach'), p = document.querySelector('.hub-pin-ev-xmas');
      if (!c || !p) return { text: c ? c.textContent : '' };
      const r = e => e.getBoundingClientRect(), cr = [r(c.querySelector('.coach-avatar')), r(c.querySelector('.coach-bubble'))], pr = [r(p.querySelector('.hub-pin-badge')), r(p.querySelector('.hub-pin-label'))];
      return { text: c.textContent, toast: !!document.querySelector('#toasts .toast.in'), over: cr.some(a => pr.some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)),
        inView: pr.every(b => b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight) };
    });
    ok(/Låge 1 er klar/.test(co.text) && await page.$('.coach .xa-santahat, .coach svg') !== null && !co.toast, tag + ' then the coach says "Låge 1 er klar!" (' + String(co.text).slice(0, 40) + ')');
    ok(co.over === false && co.inView, tag + ' the coach keeps clear of the Julekalender pin ' + JSON.stringify(co));
    await shot(page, 'first-visit-1dec-' + tag);
    await page.evaluate(() => { const c = document.querySelector('.coach'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); c.click(); });
    await page.waitForTimeout(500);
    ok(await cur(page) === 'xmas', tag + ' a tap on the coach opens the calendar');
    // the ready door swings open (motion on): the opening class lands on the live button
    await page.evaluate(() => document.querySelector('.xc-door[data-door="1"]').click());
    await page.waitForTimeout(50);
    ok(await page.$('.xc-door.is-opening[data-door="1"]') !== null, tag + ' door 1 swings open (.is-opening in the DOM)');
    await page.waitForTimeout(700);
    ok(await page.$('.xc-card-dlg') !== null && await page.$('.xc-door.is-open[data-door="1"]') !== null, tag + ' then the card shows, door 1 open');
    await ctx.close();
  }

  // ---------------------------------------------------------------- calendar fit: 844x390 no scroll, 320x568 scrolls to every door
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-13', 844, 390);
    await show(page, 'xmas'); await page.waitForTimeout(300);
    const f = await page.evaluate(() => { const b = document.querySelector('.xc-body'), r = Array.from(document.querySelectorAll('.xc-door')).map(d => d.getBoundingClientRect()); return { scroll: b.classList.contains('is-scroll'), bottom: Math.max(...r.map(q => q.bottom)), right: Math.max(...r.map(q => q.right)) }; });
    ok(!f.scroll && f.bottom <= 390 && f.right <= 844, '844x390: all 24 doors fit without scrolling ' + JSON.stringify(f));
    await shot(page, 'calendar-844x390');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-13', 320, 568);
    await show(page, 'xmas'); await page.waitForTimeout(300);
    const f = await page.evaluate(() => {
      const ds = Array.from(document.querySelectorAll('.xc-door'));
      return ds.every(d => { d.scrollIntoView({ block: 'nearest' }); const q = d.getBoundingClientRect(); return q.top >= 0 && q.bottom <= innerHeight + 1 && q.width >= 44; });
    });
    ok(f, '320x568: every door can be scrolled into view and is >= 44 px wide');
    const h = await page.evaluate(() => { const e = document.querySelector('#screen-xmas .head-title h1'); return e.scrollWidth <= e.clientWidth; });
    ok(h, '320x568: the header title is not cut off');
    await ctx.close();
  }
  // 24 Dec, English, 12+ elves found (a two-digit chip): title + status still fit at 320 px; with all 24 found, no elf name
  // in the gallery is wider than its slot (Redningsvest-Ronja, Julestjerne-Nisse) at 320, 390 and 1280
  for (const [w, h] of [[320, 568], [390, 844], [1280, 800]]) for (const lang of ['en', 'da']) {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-24', w, h);
    await page.evaluate(l => { KOS.Storage.saveSettings(Object.assign(KOS.Storage.settings(), { lang: l })); KOS.I18n.setLang(l); for (let i = 1; i <= 24; i++) KOS.Xmas.openDoor(i); for (let i = 1; i <= 12; i++) KOS.Xmas.findElf(i); }, lang);
    await show(page, 'xmas'); await page.waitForTimeout(300);
    const tag = w + 'x' + h + ' ' + lang;
    const fit = await page.evaluate(() => ['#screen-xmas .head-title h1', '#screen-xmas .xc-status', '#screen-xmas .head-sub'].map(s => { const e = document.querySelector(s); return { s, ok: !!e && e.scrollWidth <= e.clientWidth + 1 && (s.indexOf('h1') >= 0 || e.scrollHeight <= e.clientHeight + 1) }; }));
    ok(fit.every(f => f.ok), tag + ', 24 Dec, 12/24 elves: header title and status are not cut off ' + JSON.stringify(fit.filter(f => !f.ok)));
    await page.evaluate(() => { for (let i = 13; i <= 24; i++) KOS.Xmas.findElf(i); });
    await clean(page);
    await tap(page, '#screen-xmas .xc-chip'); await page.waitForTimeout(300);
    const bad = await page.evaluate(() => Array.from(document.querySelectorAll('.xc-gname')).filter(n => {
      const s = n.closest('.xc-gslot').getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(n);
      return Array.from(r.getClientRects()).some(q => q.left < s.left - .5 || q.right > s.right + .5);
    }).map(n => n.textContent));
    const n = await page.evaluate(() => ({ has: document.querySelectorAll('.xc-gslot.has').length }));
    ok(n.has === 24 && bad.length === 0, tag + ': all 24 elf names fit their gallery slots ' + JSON.stringify({ n, bad }));
    if (w === 390) await shot(page, 'gallery-24-' + lang);
    await ctx.close();
  }

  // ---------------------------------------------------------------- Halloween still looks like Halloween (the event-pin code is shared)
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-10-28', 390, 844);
    await show(page, 'hub'); await page.waitForTimeout(500);
    ok(await page.$('.hub-pin-ev-halloween') !== null, '28 Oct: the Halloween pin is there');
    await tap(page, '[data-act="places"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.hub-places .hub-place')); return b.length > 1 && b[b.length - 1].classList.contains('hub-place-ev-halloween'); }), '28 Oct: "Alle steder" lists Halloween after the areas');
    ok(await page.$('.hub-pin-ev-xmas') === null && await page.$('.hub-xmas .xc-chip') === null && await page.$('.hub-xdeco') === null && await page.$('.hub-elves [data-xmas-elf]') === null, '28 Oct: no xmas pin, chip, decorations or elves');
    await ctx.close();
  }

  // ---------------------------------------------------------------- the door activities stay out of the 'event' area list
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-13', 390, 844);
    await page.evaluate(() => KOS.App.show('area', { area: 'event' })); await page.waitForTimeout(400);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#screen-area [data-id], #screen-area [data-act-id]')).map(e => e.getAttribute('data-id') || e.getAttribute('data-act-id')));
    const txt = await page.textContent('#screen-area');
    ok(!ids.some(id => /xmas/.test(id)) && !/Julequiz|Luciasejlads|Gavejagt/.test(txt), 'area "event" lists no Julekalender activities');
    await ctx.close();
  }

  // ---------------------------------------------------------------- teaser (29 Nov)
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-11-29', 390, 844);
    await show(page, 'hub'); await page.waitForTimeout(500);
    ok((await page.textContent('.hub-pin-ev-xmas .hub-pin-sub')).trim() === 'Åbner 1. dec', 'teaser pin says "Åbner 1. dec"');
    ok(await page.$('.hub-xmas .xc-chip') === null, 'teaser: no elf chip on the hub');
    await tap(page, '[data-act="places"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelector('.hub-places .hub-place').classList.contains('hub-place-ev-xmas')), 'teaser: "Alle steder" lists the Julekalender first');
    await clean(page); await page.evaluate(() => document.querySelector('[data-act="places-close"]').click());
    ok(await page.$('.hub-xdeco') !== null, 'teaser: decorations are on');
    await shot(page, 'teaser-hub');
    await show(page, 'xmas');
    ok(await page.evaluate(() => document.querySelectorAll('.xc-door.is-locked').length) === 24, 'teaser: all 24 doors locked');
    ok(await page.$('#screen-xmas .xc-chip') === null && await page.$('#screen-xmas .screen-head .xc-testdate') !== null, 'teaser: no elf chip; the test date sits in the header');
    ok((await page.textContent('#screen-xmas .xc-status')).trim() === 'Låge 1 åbner om 2 dage', 'teaser: the header counts down to door 1');
    await shot(page, 'teaser-calendar');
    await ctx.close();
  }

  // ---------------------------------------------------------------- after (7 Jan 2027)
  {
    const { ctx, page } = await open(browser, '#god=1&date=2027-01-07', 390, 844);
    await show(page, 'title'); await page.waitForTimeout(800);
    ok(await page.$('#screen-title .xs-snow') === null, 'after: no title snow');
    await show(page, 'hub'); await page.waitForTimeout(500);
    ok(await page.$('.hub-pin-ev-xmas') === null && await page.$('.hub-xmas .xc-chip') === null, 'after: no pin, no chip');
    ok(await page.$('.hub-xdeco') === null && await page.$('.hub-elves [data-xmas-elf]') === null, 'after: no decorations, no elves');
    ok(await page.evaluate(() => !KOS.Activities.list().some(a => /^xmas\./.test(a.id)) && !KOS.Activities.get('quiz.xmas1')), 'after: no xmas.* activities');
    await shot(page, 'after-hub');
    await ctx.close();
  }

  // ---------------------------------------------------------------- all 24 door activities launch, run 1.5 s, quit
  {
    const { ctx, page } = await open(browser, '#god=1&date=2026-12-24', 390, 844);
    const acts = await page.evaluate(() => KOS.Xmas.DOORS.map(d => d.act));
    ok(acts.length === 24, '24 door activities listed');
    for (const id of acts) {
      const e0 = errs;
      const r = await page.evaluate(id => !!KOS.App.play(id, { force: true, from: 'xmas' }) || true, id).catch(() => false);
      await page.waitForTimeout(1500);
      const c = await cur(page);
      const quit = await page.evaluate(() => {
        const pb = document.querySelector('.pause-btn'); if (pb) pb.click();
        return new Promise(res => setTimeout(() => { const q = document.querySelector('[data-p="quit"]'); if (q) q.click(); res(!!q); }, 250));
      });
      await page.waitForTimeout(350);
      if (id === acts[acts.length - 1]) await shot(page, 'door-activity-last');
      ok(r && c === 'play' && errs === e0, 'door activity ' + id + ' runs (screen ' + c + (quit ? ', quit' : ', no quit btn') + ')');
      if (await cur(page) === 'play') await page.evaluate(() => KOS.App.show('xmas'));
      await page.waitForTimeout(100);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(fails + ' failed, page/console errors ' + errs);
  process.exit(fails || errs ? 1 : 0);
})();
