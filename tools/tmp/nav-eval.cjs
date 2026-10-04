// run arbitrary eval file in page after loading the game
const { chromium } = require('playwright'); const path = require('path'); const url = require('url'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('ERR', e.message)); page.on('console', m => console.log('LOG', m.text()));
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  const r = await page.evaluate(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
  await browser.close();
})();
