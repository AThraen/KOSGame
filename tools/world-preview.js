// Renders every KOS.World venue (polygons, depth, buoys, berths, landmarks) to shot-world-<id>.png for checking.
// Headless only. Usage: node tools/world-preview.js [venueId ...] [--global]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const KOS = require('./harness').load();
const W = KOS.World;

const depthColor = (d) => {
  const stops = [[0.6, '#d3f1f7'], [1.0, '#b6e6f4'], [1.6, '#97d8f0'], [2.2, '#7fcbec'], [2.6, '#6dbde6'], [3.0, '#5eb0e0'], [3.5, '#52a3da'], [5, '#3f8ccf'], [7, '#3276bf'], [9.5, '#2a63ab'], [13, '#1f4c8f']];
  for (const s of stops) if (d <= s[0]) return s[1];
  return stops[stops.length - 1][1];
};
const buoyColor = { port: '#e8323c', stbd: '#18a957', swim: '#ffd400', special: '#ffd400', cardN: '#222', cardE: '#222', cardS: '#222', cardW: '#222', isolated: '#c00', safe: '#e33' };

function svgFor(v, opts) {
  const b = opts.bounds || v.bounds;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const px = opts.px || 1100;
  const sc = px / Math.max(w, h);
  const s = (n) => (n * 1).toFixed(1);
  const pts = (p) => p.map(q => s(q[0]) + ',' + s(q[1])).join(' ');
  const out = [];
  const u = 1 / sc; // one screen pixel in meters
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * sc)}" height="${Math.round(h * sc)}" viewBox="${b.x0} ${b.y0} ${w} ${h}">`);
  out.push(`<rect x="${b.x0}" y="${b.y0}" width="${w}" height="${h}" fill="${depthColor(v.defaultDepth)}"/>`);
  for (const z of v.depth) out.push(`<polygon points="${pts(z.poly)}" fill="${depthColor(z.d)}"/>`);
  for (const l of v.lanes) out.push(`<polyline points="${pts(l.points)}" fill="none" stroke="${l.kind === 'ferry' ? '#d0408a' : '#ffffff'}" stroke-opacity=".7" stroke-width="${3 * u}" stroke-dasharray="${12 * u} ${8 * u}"/>`);
  for (const z of v.zones) if (z.poly) out.push(`<polygon points="${pts(z.poly)}" fill="${z.kind === 'swim' ? 'rgba(255,220,0,.18)' : 'rgba(255,255,255,.08)'}" stroke="#ffcc00" stroke-width="${1.5 * u}" stroke-dasharray="${6 * u} ${4 * u}"/>`);
    else out.push(`<circle cx="${z.x}" cy="${z.y}" r="${z.r}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="${2 * u}" stroke-dasharray="${10 * u} ${6 * u}"/>`);
  for (const p of v.land) out.push(`<polygon points="${pts(p)}" fill="#fff4b8" stroke="#6b6b4a" stroke-width="${1.2 * u}"/>`);
  for (const l of v.landmarks) {
    if (l.poly && l.kind === 'beach') out.push(`<polygon points="${pts(l.poly)}" fill="#ffe9a3"/>`);
    else if (l.poly && l.kind === 'park') out.push(`<polygon points="${pts(l.poly)}" fill="#cfe6a6" opacity=".8"/>`);
    else if (l.poly && l.kind === 'marina') out.push(`<polygon points="${pts(l.poly)}" fill="none" stroke="#999" stroke-width="${u}" stroke-dasharray="${2 * u}"/>`);
    else if (l.poly && l.kind === 'slipway') out.push(`<polygon points="${pts(l.poly)}" fill="#bbb" stroke="#777" stroke-width="${u}"/>`);
  }
  for (const l of v.landmarks) {
    if (l.kind === 'tree') out.push(`<circle cx="${l.x}" cy="${l.y}" r="${l.r}" fill="#6aa84f"/>`);
    else if (l.w && l.h) {
      const fill = l.kind === 'clubhouse' ? '#ff7a3d' : l.kind === 'tower' ? '#8f9bb0' : l.kind === 'powerstation' ? '#a0442c' : l.color || '#999';
      out.push(`<rect x="${l.x - l.w / 2}" y="${l.y - l.h / 2}" width="${l.w}" height="${l.h}" fill="${fill}" stroke="#444" stroke-width="${0.6 * u}" transform="rotate(${l.rot || 0} ${l.x} ${l.y})"/>`);
    } else if (l.kind === 'flagpole') out.push(`<circle cx="${l.x}" cy="${l.y}" r="${2.5 * u}" fill="#c00"/>`);
    else if (l.kind === 'lighthouse') out.push(`<circle cx="${l.x}" cy="${l.y}" r="${5 * u}" fill="#ffe94d" stroke="#000" stroke-width="${u}"/>`);
    else if (l.kind === 'crane') out.push(`<line x1="${l.x}" y1="${l.y}" x2="${l.x + 40}" y2="${l.y}" stroke="#c33" stroke-width="${3 * u}" transform="rotate(${l.rot} ${l.x} ${l.y})"/>`);
  }
  for (const p of v.breakwaters) out.push(`<polygon points="${pts(p)}" fill="#8a8578" stroke="#4d4a42" stroke-width="${u}"/>`);
  for (const p of v.piers) out.push(`<polygon points="${pts(p)}" fill="${p.kind === 'pontoon' ? '#d9d9d9' : '#b98a5a'}" stroke="#5a3d22" stroke-width="${0.6 * u}"/>`);
  for (const be of v.berths) {
    const c = Math.cos(be.heading), sn = Math.sin(be.heading);
    const deg = be.heading * 180 / Math.PI;
    out.push(`<rect x="${be.x - be.beam / 2}" y="${be.y - be.len / 2}" width="${be.beam}" height="${be.len}" fill="rgba(255,255,255,.5)" stroke="${be.side === 'port' ? '#e8323c' : '#18a957'}" stroke-width="${0.8 * u}" transform="rotate(${deg} ${be.x} ${be.y})"/>`);
    out.push(`<text x="${be.x + c * 6 * u}" y="${be.y + sn * 6 * u}" font-size="${10 * u}" font-family="sans-serif" fill="#111">${be.id} ${be.name.da}</text>`);
  }
  if (v.slip) out.push(`<circle cx="${v.slip.x}" cy="${v.slip.y}" r="${4 * u}" fill="none" stroke="#f0f" stroke-width="${1.5 * u}"/>`);
  if (v.spawn) {
    const dx = Math.sin(v.spawn.heading) * 20 * u, dy = -Math.cos(v.spawn.heading) * 20 * u;
    out.push(`<line x1="${v.spawn.x}" y1="${v.spawn.y}" x2="${v.spawn.x + dx}" y2="${v.spawn.y + dy}" stroke="#ff7a3d" stroke-width="${3 * u}"/><circle cx="${v.spawn.x}" cy="${v.spawn.y}" r="${5 * u}" fill="#ff7a3d"/>`);
  }
  for (const bu of v.buoys) {
    out.push(`<circle cx="${bu.x}" cy="${bu.y}" r="${4.5 * u}" fill="${buoyColor[bu.kind] || '#f80'}" stroke="#000" stroke-width="${u}"/>`);
    out.push(`<text x="${bu.x + 6 * u}" y="${bu.y - 4 * u}" font-size="${10 * u}" font-family="sans-serif" fill="#111">${bu.id}</text>`);
  }
  for (const lb of v.labels) {
    out.push(`<text x="${lb.x}" y="${lb.y}" font-size="${Math.max(lb.size, 11 * u)}" text-anchor="middle" font-family="sans-serif" font-style="${lb.kind === 'water' ? 'italic' : 'normal'}" fill="${lb.kind === 'water' ? '#1e4f8a' : lb.kind === 'depth' ? '#555' : '#333'}" transform="rotate(${lb.rot || 0} ${lb.x} ${lb.y})">${lb.text}</text>`);
  }
  // grid every 100 m
  const g = Math.max(w, h) > 2000 ? 500 : 100;
  for (let x = Math.ceil(b.x0 / g) * g; x < b.x1; x += g) out.push(`<line x1="${x}" y1="${b.y0}" x2="${x}" y2="${b.y1}" stroke="#000" stroke-opacity=".08" stroke-width="${u}"/>`);
  for (let y = Math.ceil(b.y0 / g) * g; y < b.y1; y += g) out.push(`<line x1="${b.x0}" y1="${y}" x2="${b.x1}" y2="${y}" stroke="#000" stroke-opacity=".08" stroke-width="${u}"/>`);
  out.push(`<text x="${b.x0 + 10 * u}" y="${b.y0 + 22 * u}" font-size="${18 * u}" font-family="sans-serif" font-weight="bold" fill="#000">${v.id} — ${v.name.da} (${w}×${h} m, grid ${g} m)</text>`);
  out.push('</svg>');
  return { svg: out.join('\n'), width: Math.round(w * sc), height: Math.round(h * sc) };
}

(async () => {
  const args = process.argv.slice(2);
  const ids = args.filter(a => !a.startsWith('--'));
  const list = ids.length ? ids : W.ids;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const jobs = list.map(id => ({ id, v: W.get(id), opts: {} }));
  if (args.includes('--global')) {
    const g = W.global;
    jobs.push({ id: 'global', v: { id: 'global', name: { da: 'hele verden' }, bounds: { x0: -1200, y0: -3800, x1: 4500, y1: 1000 }, defaultDepth: g.defaultDepth, land: [g.coast], piers: g.piers, breakwaters: g.breakwaters, depth: g.depth, buoys: g.buoys, labels: g.labels, berths: [], landmarks: g.landmarks, lanes: g.lanes, zones: g.zones }, opts: { px: 1400 } });
  }
  for (const j of jobs) {
    const { svg, width, height } = svgFor(j.v, j.opts);
    await page.setViewportSize({ width, height });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const out = path.join(__dirname, '..', `shot-world-${j.id}.png`);
    await page.screenshot({ path: out });
    console.log('saved', out, width + 'x' + height,
      j.v.buoys ? `buoys=${j.v.buoys.length}` : '', j.v.berths ? `berths=${j.v.berths.length}` : '', j.v.landmarks ? `landmarks=${j.v.landmarks.length}` : '');
  }
  // quick sanity checks of the helpers
  const bay = W.get('bay');
  const checks = [
    ['club basin is water', !W.isLand(bay, -200, -100)],
    ['clubhouse is land', W.isLand(bay, 60, 60)],
    ['basin depth 1.6', W.depthAt(bay, -300, -100) === 1.6],
    ['east bay depth ≥ 3', W.depthAt(bay, 400, -600) >= 3],
    ['channel 6.5', W.depthAt('harbor', W.chanX(-500), -500) === 6.5],
    ['sound deep', W.depthAt('sound', 3750, -2000) >= 7],
    ['stubben shallow', W.depthAt('sound', 2360, -1500) < 4],
    ['spawns in water', W.ids.every(id => { const v = W.get(id); return !W.isSolid(v, v.spawn.x, v.spawn.y); })],
    ['berths in water', W.global.berths.every(b => !W.isSolid('pier', b.x, b.y))],
    ['buoys in water', W.global.buoys.every(b => !W.isSolid('sound', b.x, b.y) && !W.isSolid('bay', b.x, b.y))],
    ['hit shore', !!W.hit(bay, 60, 60, 2)],
    ['hit pier', (W.hit('pier', W.global.berths[0].x, W.global.berths[0].y, 2) || {}).type === 'pier'],
    ['shallow hit', (W.hit(bay, -560, -700, 0.5, 1.0) || {}).type === 'shallow'],
  ];
  for (const c of checks) console.log(c[1] ? 'ok  ' : 'FAIL', c[0]);
  await browser.close();
  if (checks.some(c => !c[1])) process.exitCode = 1;
})().catch(e => { console.error('ERR', e); process.exit(1); });
