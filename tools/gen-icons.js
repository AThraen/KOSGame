// Renders assets/icons/app/icon.svg into PNG app icons (192, 512, maskable 512) with headless Chrome.
// Usage: node tools/gen-icons.js      (NEVER opens a visible window)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'assets', 'icons', 'app');
const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');

// maskable: full-bleed square background, artwork shrunk into the 80 % safe zone
function maskable(src) {
  return src
    .replace('<rect width="512" height="512" fill="url(#bg)"/>', '')
    .replace('<g clip-path="url(#clip)">', '<rect width="512" height="512" fill="url(#bg)"/><rect y="400" width="512" height="112" fill="#2b8fd0"/><g transform="translate(51.2 51.2) scale(.8)">');
}

async function render(page, svgText, size, out) {
  const html = '<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:' + size + 'px;height:' + size + 'px}</style></head><body>' + svgText + '</body></html>';
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(DIR, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', out);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();
  await render(page, svg, 192, 'icon-192.png');
  await render(page, svg, 512, 'icon-512.png');
  await render(page, maskable(svg), 512, 'icon-maskable-512.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
