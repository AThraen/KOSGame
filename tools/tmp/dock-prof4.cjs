const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('console', m => console.log(m.text()));
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(() => {
    KOS.Storage.saveSettings({ assist: 'normal', sound: false, unlockAll: true });
    KOS.App.play('dock.opti.jetty', { force: true });
    const inst = KOS.App.run.inst; inst.skipIntro(); inst.setAutopilot(true);
    for (let i = 0; i < 1500; i++) inst.update(KOS.DT);
    const w = (o, k, n) => { const f = o[k]; o[k] = function () { console.log('enter ' + n); const r = f.apply(this, arguments); console.log('leave ' + n); return r; }; };
    w(KOS.UI, 'confetti', 'ui.confetti'); w(KOS.Storage, 'award', 'award'); w(KOS.UI, 'fmtTime', 'fmtTime'); w(inst.scene.effects, 'confetti', 'fx.confetti'); w(inst.scene.effects, 'text', 'fx.text'); w(inst.scene, 'shake', 'shake'); w(KOS.Audio, 'play', 'audio'); w(KOS, 't', 't');
    for (let i = 0; i < 30; i++) { console.log('step ' + i); inst.update(KOS.DT); }
  }).catch(e => console.log(e.message));
  process.exit(0);
})();
