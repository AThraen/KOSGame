// Headless sprite sheet: renders every boat class (several sailing states), buoys, marks, committee boat,
// side-view boat cards and avatars into shot-sprites.png for visual review. NEVER opens a visible window.
// Usage: node tools/sprite-sheet.js [out.png]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const out = path.resolve(ROOT, process.argv[2] || 'shot-sprites.png');

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0d1321;color:#fff;font:600 13px ui-rounded,'Segoe UI',system-ui,sans-serif;width:1600px}
h2{margin:14px 16px 6px;font-size:16px;color:#ffc65c}
.cards,.avs{display:flex;flex-wrap:wrap;gap:10px;padding:0 16px}
.card{width:200px;background:linear-gradient(#ffe8c2,#bfe6ff);border-radius:16px;overflow:hidden;color:#0d1321;text-align:center}
.card svg{width:200px;height:150px;display:block}
.avs svg{width:84px;height:84px}
.svgrow{display:flex;gap:8px;padding:0 16px;align-items:flex-end}
.svgrow svg{height:90px;width:auto;background:#7fc4f0;border-radius:8px}
</style></head><body>
<h2>Top-down boats (close-hauled · reach · run+spinnaker · luffing · hiking hard · capsized)</h2>
<canvas id="c" width="1600" height="1180"></canvas>
<h2>Buoys & marks (canvas, bobbing + lights)</h2>
<canvas id="b" width="1600" height="190"></canvas>
<h2>Boat cards (side view SVG)</h2><div class="cards" id="cards"></div>
<h2>Hull SVG strings / buoy SVG strings</h2><div class="svgrow" id="svgs"></div>
<h2>Avatars & icons</h2><div class="avs" id="avs"></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const logs = [];
  p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await p.setContent(page);
  for (const f of ['js/core/kos.js', 'js/core/i18n.js', 'js/core/boats.js', 'js/render/sprites.js']) {
    await p.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }
  await p.evaluate(() => {
    const S = KOS.Sprites;
    const c = document.getElementById('c'), ctx = c.getContext('2d');
    // water bg
    const g = ctx.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#5fb3e8'); g.addColorStop(1, '#3f8fd0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    const ids = S.CLASS_IDS;
    const warm = document.createElement('canvas').getContext('2d');
    const states = [
      { name: 'kryds', boom: -0.12, twa: 0.75, trim: 1, hike: 0.6, heel: 0.18, awa: 0.55 },
      { name: 'halvvind', boom: -0.75, twa: 1.57, trim: 0.9, hike: 0.4, heel: 0.12, awa: 1.2 },
      { name: 'læns+spi', boom: -1.3, twa: 2.8, trim: 0.9, hike: 0.0, heel: 0.03, spinnaker: true, awa: 2.6 },
      { name: 'leverer', boom: 0.5, twa: -1.2, trim: 0.2, hike: 0.1, heel: 0.0, luffing: true, awa: -1.1 },
      { name: 'hænger ud', boom: 0.2, twa: -0.8, trim: 1, hike: 1.0, heel: -0.25, awa: -0.6 },
      { name: 'kæntret', capsized: true, heel: 1.5, twa: 1 },
    ];
    const colW = 1600 / states.length;
    ids.forEach((id, r) => {
      const geo = S.geo(id);
      const rowH = 130, scale = Math.min(26, 100 / Math.max(geo.L + (geo.bowsprit || 0), 3.4));
      states.forEach((st, k) => {
        if (id === 'rib' && k > 2) return;
        const boat = Object.assign({ id: id + k, cls: id, x: 0, y: 0, heading: -0.35 + k * 0.05, sailNo: 'DEN ' + (100 + r * 7 + k), tack: st.twa >= 0 ? 'starboard' : 'port' }, st);
        if (id === 'rib') { boat.rudder = [0, 0.6, -0.6][k]; }
        ctx.save();
        ctx.translate(colW * k + colW / 2, 70 + r * rowH);
        ctx.scale(scale, scale);
        // warm up the spinnaker spring
        for (let i = 0; i < 90; i++) S.drawBoat(warm, boat, { t: i / 60, ppm: scale });
        S.drawBoat(ctx, boat, { t: 1.6, ppm: scale, highlight: k === 0 && r === 0 });
        ctx.restore();
        if (r === 0) { ctx.fillStyle = '#0d1321'; ctx.font = '700 13px system-ui'; ctx.fillText(st.name, colW * k + 10, 14); }
      });
      ctx.fillStyle = '#0d1321'; ctx.font = '800 14px system-ui'; ctx.fillText(id, 8, 70 + r * rowH + 4);
    });
    // buoys
    const b = document.getElementById('b'), bx = b.getContext('2d');
    bx.fillStyle = '#4f9fdc'; bx.fillRect(0, 0, b.width, b.height);
    const kinds = ['port', 'stbd', 'cardN', 'cardE', 'cardS', 'cardW', 'special', 'swim', 'isolated', 'safe', 'mark-orange', 'mark-yellow', 'pin', 'finish'];
    const lights = { port: 'Fl R 3s', stbd: 'Fl G 3s', cardN: 'Q', cardE: 'Q(3) 10s', isolated: 'Fl(2) W 5s', safe: 'Iso W 2s', special: 'Fl Y 3s' };
    kinds.forEach((k, i) => {
      bx.save(); bx.translate(55 + i * 100, 150); bx.scale(24, 24);
      S.drawBuoy(bx, k, 0, 0, { t: 0.1, ppm: 24, scale: 1.4, light: lights[k], night: 0 });
      bx.restore();
      bx.fillStyle = '#fff'; bx.font = '700 11px system-ui'; bx.fillText(k, 25 + i * 100, 182);
    });
    bx.save(); bx.translate(1480, 110); bx.scale(9, 9); S.drawCommittee(bx, 0, 0, 0.3, { t: 1, windDir: 0.3 }); bx.restore();
    // cards
    const cards = document.getElementById('cards');
    ids.forEach((id, i) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = S.boatCard(id, { sailNo: 'DEN ' + (21 + i) }) + '<div>' + id + '</div>'; cards.appendChild(d); });
    const svgs = document.getElementById('svgs');
    ids.forEach((id) => { const d = document.createElement('div'); d.innerHTML = S.boat(id, { sailNo: 7 }); svgs.appendChild(d); });
    kinds.forEach((k) => { const d = document.createElement('div'); d.innerHTML = S.buoy(k); svgs.appendChild(d); });
    ['main', 'jib', 'spi'].forEach((k) => { const d = document.createElement('div'); d.innerHTML = S.sail('29er', k); svgs.appendChild(d); });
    const avs = document.getElementById('avs');
    for (let i = 0; i < 12; i++) { const d = document.createElement('div'); d.innerHTML = S.avatar({ avatar: { skin: i % 6, hair: (i * 3) % 7, jacket: i % 7, hairStyle: i % 4 } }); avs.appendChild(d); }
    ['wind', 'compass', 'anchor', 'buoy', 'boat', 'flag', 'star', 'trophy', 'rope', 'rib'].forEach((n) => { const d = document.createElement('div'); d.style.color = '#fff'; d.innerHTML = S.icon(n, { size: 40 }); avs.appendChild(d); });
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: out, fullPage: true });
  console.log(logs.join('\n') || '(no console output)');
  console.log('saved', out);
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
