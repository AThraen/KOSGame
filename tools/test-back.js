// Back-button test (headless Chrome, never a window): KOS.Nav (js/ui/history.js) maps the browser / Android / iOS back
// gesture to the app's own back action. Uses page.goBack() (a real browser back, like the hardware button):
//   - title -> hub -> back -> title, and back at the title leaves the site (no extra entries left behind)
//   - a dialog: back closes it, the screen stays; a dialog closed by its own button + back goes to the previous screen
//   - the hub's place list: back closes it
//   - a header back button keeps history in step (then back goes on to the title)
//   - a run: back opens the pause card, back again resumes; never leaves the run. A live race: the leave card, no quit
//   - round trips do not grow history.length; a reload on a deep entry walks back to the page's own entry
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('FAIL ' + msg); } else console.log('ok   ' + msg); };
const INDEX = url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.error('PAGEERR', e.message); });
  await page.goto('about:blank');
  await page.goto(INDEX);
  await page.waitForFunction(() => document.documentElement.classList.contains('booted') && window.KOS && KOS.Nav, null, { timeout: 20000 });
  await page.evaluate(() => {
    KOS.Storage.saveProfile({ name: 'Back', age: '10-12', sailNo: '7', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings({ unlockAll: true, sound: false, music: false, lang: 'da', reducedMotion: true });
    KOS.I18n.setLang('da');
    KOS.App.show('title');
  });
  await settle(page);
  return { ctx, page };
}
// wait until KOS.Nav has caught up (no history.go in flight, entries == app depth)
async function settle(page) {
  await page.waitForTimeout(120);
  await page.waitForFunction(() => !window.KOS || !KOS.Nav.busy && KOS.Nav.pos === KOS.Nav.depth() && history.state && history.state.kosNav === KOS.Nav.pos, null, { timeout: 5000 })
    .catch(async () => { const s = await page.evaluate(() => window.KOS && ({ busy: KOS.Nav.busy, pos: KOS.Nav.pos, depth: KOS.Nav.depth(), st: history.state, cur: KOS.App.cur })); console.error('     nav not settled', JSON.stringify(s)); });
}
async function back(page) { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(80); await settle(page); }
const cur = page => page.evaluate(() => (location.protocol === 'file:' && window.KOS && KOS.App ? KOS.App.cur : location.href));
async function click(page, sel) { await page.click(sel); await page.waitForTimeout(80); await settle(page); }

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let { ctx, page } = await fresh(browser);
  const len0 = await page.evaluate(() => history.length);

  // title -> hub -> back -> title
  await click(page, '#screen-title [data-act="play"]');
  ok(await cur(page) === 'hub', 'Spil opens the hub');
  await back(page);
  ok(await cur(page) === 'title', 'back on the hub returns to the title');

  // round trips do not inflate history
  for (let i = 0; i < 4; i++) { await click(page, '#screen-title [data-act="play"]'); await back(page); }
  const len1 = await page.evaluate(() => history.length);
  ok(len1 <= len0 + 1 && await cur(page) === 'title', 'four hub round trips keep history.length flat (' + len0 + ' -> ' + len1 + ')');

  // a dialog on the title: back closes it, the title stays
  await click(page, '#screen-title [data-act="club"]');
  ok(await page.evaluate(() => !!KOS.UI.topDialog()), 'club popup open');
  await back(page);
  ok(await page.evaluate(() => !KOS.UI.topDialog() && KOS.App.cur === 'title'), 'back closes the club popup and stays on the title');

  // hub -> area -> header back -> hub; back -> title
  await click(page, '#screen-title [data-act="play"]');
  await page.evaluate(() => KOS.App.show('area', { area: 'bay' })); await settle(page);
  ok(await cur(page) === 'area' && await page.evaluate(() => KOS.Nav.pos) === 2, 'area is two levels deep');
  await click(page, '#screen-area .screen-head [data-act="back"]');
  ok(await cur(page) === 'hub' && await page.evaluate(() => KOS.Nav.pos) === 1, 'the header back button goes to the hub and consumes the entry');
  // a dialog closed by its own button, then back: the previous screen (not a no-op)
  await page.evaluate(() => KOS.UI.dialog({ title: 'Test', bodyKey: 'common.ok' })); await settle(page);
  ok(await page.evaluate(() => KOS.Nav.pos) === 2, 'a dialog on the hub adds one level');
  await click(page, '#dialogs .dialog .btn');
  ok(await page.evaluate(() => !KOS.UI.topDialog() && KOS.Nav.pos === 1), 'closing the dialog by its button consumes its entry');
  // the hub place list: back closes it
  await click(page, '#screen-hub [data-act="places"]');
  ok(await page.evaluate(() => !!document.querySelector('#screen-hub .hub-places') && KOS.Nav.pos === 2), 'the place list opens one level');
  await back(page);
  ok(await page.evaluate(() => !document.querySelector('#screen-hub .hub-places') && KOS.App.cur === 'hub'), 'back closes the place list, the hub stays');
  await back(page);
  ok(await cur(page) === 'title', 'then back goes to the title (dialog closed by its button did not leave a dead entry)');

  // a run: back pauses, back again resumes, never leaves
  await click(page, '#screen-title [data-act="quick"]');
  await page.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.running, null, { timeout: 8000 });
  await settle(page);
  await back(page);
  ok(await page.evaluate(() => KOS.App.cur === 'play' && KOS.App.run.paused && !!document.querySelector('.pause-overlay')), 'back in a run opens the pause card');
  await back(page);
  ok(await page.evaluate(() => KOS.App.cur === 'play' && !KOS.App.run.paused && !document.querySelector('.pause-overlay')), 'back again resumes the run');
  await back(page);
  await back(page);
  ok(await page.evaluate(() => KOS.App.cur === 'play' && KOS.App.run.running && !KOS.App.run.paused), 'back twice more: still sailing (pause + resume)');
  // a live race (faked facade): back shows the leave card, the race keeps running, back again hides it
  await page.evaluate(() => { KOS.App.run.live = { fake: true }; });
  await back(page);
  ok(await page.evaluate(() => KOS.App.cur === 'play' && KOS.App.run.running && !KOS.App.run.paused && !!document.querySelector('.pause-overlay')), 'live race: back opens the leave card, the race keeps running');
  await back(page);
  ok(await page.evaluate(() => KOS.App.cur === 'play' && KOS.App.run.running && !document.querySelector('.pause-overlay')), 'live race: back again closes the leave card, still racing');
  await page.evaluate(() => { KOS.App.run.live = null; });
  // quit from the pause card, then back to the title and out
  await page.evaluate(() => KOS.App.setPaused(true));
  await click(page, '.pause-overlay [data-p="quit"]');
  ok(await cur(page) === 'area', 'quit from the pause card goes to the place');
  await back(page);
  ok(await cur(page) === 'title', 'back from there goes to the title');
  await back(page);
  ok(page.url() === 'about:blank', 'back at the title leaves the site (' + page.url() + ')');
  await ctx.close();

  // reload on a deep entry: normalised back to the page's own entry, then back leaves
  ({ ctx, page } = await fresh(browser));
  await click(page, '#screen-title [data-act="play"]');
  await page.evaluate(() => KOS.App.show('area', { area: 'bay' })); await settle(page);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains('booted') && window.KOS && KOS.Nav, null, { timeout: 20000 });
  await settle(page);
  ok(await page.evaluate(() => KOS.App.cur === 'title' && KOS.Nav.pos === 0 && history.state.kosNav === 0), 'after a reload the stale deep entry is walked back to the bottom');
  await click(page, '#screen-title [data-act="play"]');
  await back(page);
  ok(await cur(page) === 'title', 'after the reload: hub -> back -> title');
  await back(page);
  ok(page.url() === 'about:blank', 'after the reload: back at the title leaves');
  // the hash survives (dev flags / join links are read from it)
  await page.goto(INDEX + '#halloween=0');
  await page.waitForFunction(() => document.documentElement.classList.contains('booted') && window.KOS && KOS.Nav, null, { timeout: 20000 });
  await click(page, '#screen-title [data-act="play"]');
  ok(await page.evaluate(() => location.hash === '#halloween=0'), 'pushed entries keep the hash');
  await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' failure(s)' : 'back-button: all good');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
