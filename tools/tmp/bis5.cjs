const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent('<body></body>');
  for (const code of ["1+1", "(()=>{const c=document.createElement('canvas');c.getContext('2d').fillRect(0,0,9,9);return 1})()", "(()=>{const c=document.createElement('canvas');document.body.appendChild(c);return 1})()", "(()=>{const d=document.createElement('div');d.textContent='x';document.body.appendChild(d);return 1})()"]) {
    const t = Date.now();
    try { await Promise.race([page.evaluate(code), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 6000))]); console.log('ok', code.slice(0,60), Date.now() - t); } catch (e) { console.log('FAIL', code.slice(0,60)); break; }
  }
  await browser.close();
})();
