const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('console', m => console.log(m.text()));
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  console.log(await page.evaluate(() => { KOS.UI.confetti(); return 'ok1'; }).catch(e => e.message));
  console.log(await page.evaluate(() => { KOS.App.play('dock.opti.jetty', { force: true }); KOS.UI.confetti(); return 'ok2 ' + innerWidth + 'x' + innerHeight; }).catch(e => e.message));
  console.log(await page.evaluate(() => { const r = KOS.App.run.inst; KOS.UI.confetti(); return 'ok3'; }).catch(e => e.message));
  process.exit(0);
})();
