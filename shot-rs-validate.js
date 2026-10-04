const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  const boats = (process.argv[2] || 'opti,zest,29er').split(','), assists = (process.argv[3] || 'easy,normal,pro').split(',');
  for (const boat of boats) for (const assist of assists) {
    const out = await page.evaluate(([boat, assist]) => {
      KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true }); KOS.Storage.set('boat', boat);
      KOS.App.play('rowschool.r10', { force: true });
      const r = KOS.App.run.inst.validate(); KOS.App.show('hub'); return r;
    }, [boat, assist]);
    const bad = out.filter(o => o.mismatch || o.dry || !o.auto.ok || (SCHOLD(o)));
    function SCHOLD(o) { return false; }
    console.log(`== ${boat} ${assist}`);
    for (const o of out) {
      const flag = (o.mismatch ? ' MISMATCH' : '') + (o.dry ? ' DRY:' + o.dry : '') + (!o.auto.ok ? ' AUTOFAIL:' + o.auto.fail : '');
      console.log(`  ${o.id.padEnd(5)} ${String(o.rule).padEnd(13)} ans=${o.ans}/${o.want} auto=${o.auto.ok ? 'ok' : o.auto.fail}@${o.auto.t} gap=${o.auto.minGap} hold=${o.hold.ok ? 'ok' : o.hold.fail}@${o.hold.t} vp=${o.vp}${flag}`);
    }
  }
  console.log(errs.join('\n') || 'no errors'); await browser.close();
})();
