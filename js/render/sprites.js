// KØS SEJL — js/render/sprites.js
// KOS.Sprites: top-down boats (procedural hull, sails that swing/fill/luff, crew that hikes/trapezes,
// spinnaker pop), IALA-A buoys, race marks, committee boat, side-view boat cards, avatars, icons.
// Geometry is authored in meters (bow = -y, starboard = +x) as SVG path strings, so the same data
// renders to SVG strings (menus) and synchronously to canvas via Path2D (game), cached per zoom bucket.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const f3 = (n) => (Math.round(n * 1000) / 1000).toString();
  const hashStr = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  const P2D = typeof Path2D !== 'undefined';
  const pathCache = new Map();
  function path2d(d) { let p = pathCache.get(d); if (!p) { p = new Path2D(d); if (pathCache.size > 4000) pathCache.clear(); pathCache.set(d, p); } return p; }
  function shade(hex, k) { // k<0 darker, k>0 lighter
    let c = String(hex || '#ffffff').replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    if (isNaN(r)) return hex;
    const t = k < 0 ? 0 : 255, p = Math.abs(k);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function rgba(hex, a) { let c = String(hex).replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); return 'rgba(' + parseInt(c.slice(0, 2), 16) + ',' + parseInt(c.slice(2, 4), 16) + ',' + parseInt(c.slice(4, 6), 16) + ',' + a + ')'; }
  const tt = (v) => (v && typeof v === 'object' ? (KOS.tt ? KOS.tt(v) : v.da || v.en) : v);

  // ------------------------------------------------------------------------------------------
  // Class geometry. L/B meters, hull plan-shape params, rig, crew seats (s = 0 bow .. 1 stern).
  const GEO = {
    opti: { L: 2.31, B: 1.13, bowW: 0.58, pb: 0.5, maxAt: 0.55, sternW: 0.86, bowArc: 0.05, sternArc: 0.04,
      mast: 0.2, mastH: 4.7, boom: 2.0, sprit: true, jib: 0, spi: 'none', cockpit: [0.12, 0.93, 0.12, 0.86], board: 0.44,
      crew: [{ s: 0.68, role: 'helm' }], colors: { hull: '#ffffff', deck: '#f4efe4', sail: '#ffffff', trim: '#b8865a', floor: '#e8e4dc' }, mastCol: '#8a8f99', boomCol: '#a9763f', bags: true },
    tera: { L: 2.87, B: 1.2, bowW: 0.12, pb: 0.45, maxAt: 0.58, sternW: 0.84, bowArc: 0.06, sternArc: 0.03,
      mast: 0.3, mastH: 4.6, boom: 1.95, jib: 0, spi: 'none', cockpit: [0.45, 0.95, 0.14, 0.78], board: 0.5,
      crew: [{ s: 0.66, role: 'helm' }], colors: { hull: '#39b8f2', deck: '#f6f8fb', sail: '#ffffff', trim: '#1b6aa8', floor: '#dfe7ef' } },
    feva: { L: 3.64, B: 1.42, bowW: 0.06, pb: 0.5, maxAt: 0.6, sternW: 0.82, bowArc: 0.04, sternArc: 0.03,
      mast: 0.33, mastH: 5.6, boom: 2.15, jib: 0.04, jibLen: 1.0, spi: 'asym', bowsprit: 1.0, retractSprit: true,
      spiColors: ['#ffd23f', '#f2c200', '#fff3a8'], cockpit: [0.4, 0.96, 0.12, 0.8], board: 0.48,
      crew: [{ s: 0.47, role: 'crew' }, { s: 0.72, role: 'helm' }], colors: { hull: '#ffffff', deck: '#eef2f6', sail: '#ffffff', trim: '#e8323c', floor: '#d8dee6' } },
    zest: { L: 3.9, B: 1.6, bowW: 0.1, pb: 0.42, maxAt: 0.58, sternW: 0.86, bowArc: 0.05, sternArc: 0.03,
      mast: 0.33, mastH: 5.5, boom: 2.3, jib: 0.04, jibLen: 1.0, spi: 'none', cockpit: [0.4, 0.96, 0.1, 0.8], board: 0.48,
      crew: [{ s: 0.5, role: 'crew' }, { s: 0.73, role: 'helm' }], colors: { hull: '#ffffff', deck: '#e9f3fb', sail: '#ffffff', trim: '#1a7fd4', floor: '#cfe2f2' } },
    ilca: { L: 4.23, B: 1.37, bowW: 0.0, pb: 0.62, maxAt: 0.62, sternW: 0.8, bowArc: 0.02, sternArc: 0.02,
      mast: 0.25, mastH: 6.4, boom: 2.75, jib: 0, spi: 'none', cockpit: [0.55, 0.9, 0.2, 0.62], board: 0.45,
      crew: [{ s: 0.7, role: 'helm' }], colors: { hull: '#ffffff', deck: '#f2f4f7', sail: '#ffffff', trim: '#8a96a8', floor: '#dde3ea' }, battens: 3 },
    '29er': { L: 4.45, B: 1.12, wings: 1.77, wingS: [0.5, 0.86], bowW: 0.0, pb: 0.7, maxAt: 0.68, sternW: 0.9, bowArc: 0.01, sternArc: 0.01,
      mast: 0.38, mastH: 6.25, boom: 2.3, jib: 0.04, jibLen: 1.0, spi: 'asym', bowsprit: 1.4,
      spiColors: ['#7b3fb0', '#5a2b8c', '#a57bd6'], cockpit: [0.42, 0.97, 0.18, 0.7], board: 0.47,
      crew: [{ s: 0.55, role: 'trap' }, { s: 0.74, role: 'helm' }], colors: { hull: '#ffffff', deck: '#3b4250', sail: '#e9edf2', trim: '#ff4fa0', floor: '#5a6272' }, battens: 4, mylar: true },
    hboat: { L: 8.28, B: 2.18, bowW: 0.0, pb: 0.6, maxAt: 0.55, sternW: 0.55, bowArc: 0.02, sternArc: 0.05,
      mast: 0.4, mastH: 10.5, boom: 3.5, jib: 0.03, jibLen: 1.18, spi: 'sym', keel: true, cabin: [0.2, 0.5, 0.62],
      spiColors: ['#1e5fbf', '#ffd23f', '#e8323c'], cockpit: [0.55, 0.92, 0.2, 0.62], board: 0,
      crew: [{ s: 0.58, role: 'rail' }, { s: 0.68, role: 'rail' }, { s: 0.8, role: 'helm' }], colors: { hull: '#f7f7f2', deck: '#d9b98c', sail: '#fbfaf5', trim: '#1c3f7a', floor: '#c9a676' }, wood: true },
    j70: { L: 6.93, B: 2.25, bowW: 0.0, pb: 0.55, maxAt: 0.6, sternW: 0.82, bowArc: 0.02, sternArc: 0.02,
      mast: 0.42, mastH: 9.5, boom: 3.0, jib: 0.03, jibLen: 1.02, spi: 'asym', bowsprit: 1.5, keel: true, cabin: [0.24, 0.52, 0.56],
      spiColors: ['#ff7a3d', '#ffffff', '#1a7fd4'], cockpit: [0.55, 0.98, 0.16, 0.72], board: 0,
      crew: [{ s: 0.55, role: 'rail' }, { s: 0.63, role: 'rail' }, { s: 0.71, role: 'rail' }, { s: 0.82, role: 'helm' }], colors: { hull: '#ffffff', deck: '#e8ebef', sail: '#f1f2f4', trim: '#222831', floor: '#c7ccd3' }, battens: 4 },
    rib: { L: 5.8, B: 2.4, bowW: 0.0, pb: 0.5, maxAt: 0.5, sternW: 0.96, bowArc: 0.03, sternArc: 0.0,
      motor: true, crew: [{ s: 0.58, role: 'driver' }], colors: { hull: '#ff6a1a', deck: '#3d4148', sail: '#ffffff', trim: '#111111', floor: '#3d4148' } },
  };
  const CLASS_IDS = ['opti', 'tera', 'feva', 'zest', 'ilca', '29er', 'hboat', 'j70', 'rib'];
  const JACKETS = ['#ff7a3d', '#ffd23f', '#e8323c', '#3ab0ff', '#18a957', '#a35cff', '#ff4fa0'];
  const HAIR = ['#2b1d14', '#5a3825', '#a0522d', '#d9a441', '#f1d27a', '#c0392b', '#1b1b1b'];
  const SKIN = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
  const HELMETS = ['#ffffff', '#ffd23f', '#e8323c', '#1a7fd4', '#222831'];

  function geo(cls) {
    const id = typeof cls === 'string' ? cls : (cls && cls.id) || 'opti';
    return GEO[id] || GEO.opti;
  }
  function clsIdOf(boat) { const c = boat && (boat.cls || boat.clsId || boat.classId); return typeof c === 'string' ? c : (c && c.id) || 'opti'; }
  function colorsOf(clsId, colors) { const g = geo(clsId); const def = (KOS.Boats && KOS.Boats.get && safe(() => KOS.Boats.get(clsId).colors)) || {}; return Object.assign({}, g.colors, def, colors || {}); }
  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  // half width (m) at s (0 bow..1 stern)
  function halfW(g, s) {
    s = clamp(s, 0, 1);
    let w;
    if (s <= g.maxAt) { const u = s / g.maxAt; w = g.bowW + (1 - g.bowW) * Math.pow(Math.sin((u * PI) / 2), g.pb); }
    else { const v = (s - g.maxAt) / (1 - g.maxAt); w = 1 - (1 - g.sternW) * v * v; }
    return (w * g.B) / 2;
  }
  const yAt = (g, s) => -g.L / 2 + s * g.L;
  function outlineD(g, inset) {
    inset = inset || 0;
    const N = 26, st = [], L = g.L;
    for (let i = 0; i <= N; i++) {
      const s = Math.pow(i / N, 1.25);
      const y = lerp(-L / 2 + inset, L / 2 - inset, s);
      st.push([Math.max(0.001, halfW(g, s) - inset), y]);
    }
    const y0 = st[0][1], yN = st[N][1];
    let d = 'M' + f3(st[0][0]) + ' ' + f3(y0);
    for (let i = 1; i <= N; i++) d += 'L' + f3(st[i][0]) + ' ' + f3(st[i][1]);
    d += 'Q0 ' + f3(yN + g.sternArc * L) + ' ' + f3(-st[N][0]) + ' ' + f3(yN);
    for (let i = N - 1; i >= 0; i--) d += 'L' + f3(-st[i][0]) + ' ' + f3(st[i][1]);
    d += 'Q0 ' + f3(y0 - g.bowArc * L) + ' ' + f3(st[0][0]) + ' ' + f3(y0) + 'Z';
    return d;
  }
  function bandD(g, s0, s1, margin, k) { // a region (cockpit) between s0..s1
    const N = 12, pts = [];
    for (let i = 0; i <= N; i++) { const s = lerp(s0, s1, i / N); pts.push([Math.max(0.02, (halfW(g, s) - margin) * k), yAt(g, s)]); }
    let d = 'M' + f3(pts[0][0]) + ' ' + f3(pts[0][1]);
    for (let i = 1; i <= N; i++) d += 'L' + f3(pts[i][0]) + ' ' + f3(pts[i][1]);
    for (let i = N; i >= 0; i--) d += 'L' + f3(-pts[i][0]) + ' ' + f3(pts[i][1]);
    return d + 'Z';
  }
  const rr = (x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); return 'M' + f3(x + r) + ' ' + f3(y) + 'H' + f3(x + w - r) + 'Q' + f3(x + w) + ' ' + f3(y) + ' ' + f3(x + w) + ' ' + f3(y + r) + 'V' + f3(y + h - r) + 'Q' + f3(x + w) + ' ' + f3(y + h) + ' ' + f3(x + w - r) + ' ' + f3(y + h) + 'H' + f3(x + r) + 'Q' + f3(x) + ' ' + f3(y + h) + ' ' + f3(x) + ' ' + f3(y + h - r) + 'V' + f3(y + r) + 'Q' + f3(x) + ' ' + f3(y) + ' ' + f3(x + r) + ' ' + f3(y) + 'Z'; };
  const ell = (cx, cy, rx, ry) => 'M' + f3(cx - rx) + ' ' + f3(cy) + 'A' + f3(rx) + ' ' + f3(ry) + ' 0 1 0 ' + f3(cx + rx) + ' ' + f3(cy) + 'A' + f3(rx) + ' ' + f3(ry) + ' 0 1 0 ' + f3(cx - rx) + ' ' + f3(cy) + 'Z';
  const circ = (cx, cy, r) => ell(cx, cy, r, r);
  const polyD = (pts, close) => pts.map((p, i) => (i ? 'L' : 'M') + f3(p[0]) + ' ' + f3(p[1])).join('') + (close === false ? '' : 'Z');

  // ------------------------------------------------------------------------------------------
  // Shape lists: [{d, fill, stroke, lw, op, shade, dash, text}] → SVG string or canvas paint.
  // fill may be {lin:[x1,y1,x2,y2], stops:[[o,c],...]} or {rad:[cx,cy,r], stops}
  let gradId = 0;
  function svgPaint(p, defs) {
    if (!p || typeof p === 'string') return p || 'none';
    const id = 'kg' + (++gradId);
    const stops = p.stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('');
    if (p.lin) defs.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + p.lin[0] + '" y1="' + p.lin[1] + '" x2="' + p.lin[2] + '" y2="' + p.lin[3] + '">' + stops + '</linearGradient>');
    else defs.push('<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + p.rad[0] + '" cy="' + p.rad[1] + '" r="' + p.rad[2] + '">' + stops + '</radialGradient>');
    return 'url(#' + id + ')';
  }
  function shapesToSvg(shapes, vb, attrs) {
    const defs = [], body = [];
    for (const s of shapes) {
      if (s.text != null) {
        body.push('<text x="' + f3(s.x) + '" y="' + f3(s.y) + '" font-size="' + f3(s.size) + '" font-weight="' + (s.weight || 800) + '" font-family="ui-rounded,\'Segoe UI Variable Display\',\'Segoe UI\',system-ui,sans-serif" text-anchor="middle" dominant-baseline="central" fill="' + (s.fill || '#000') + '"' + (s.rot ? ' transform="rotate(' + s.rot + ' ' + f3(s.x) + ' ' + f3(s.y) + ')"' : '') + '>' + esc(s.text) + '</text>');
        continue;
      }
      let a = '<path d="' + s.d + '" fill="' + svgPaint(s.fill, defs) + '"';
      if (s.stroke) a += ' stroke="' + s.stroke + '" stroke-width="' + f3(s.lw || 0.05) + '" stroke-linejoin="round" stroke-linecap="round"';
      if (s.dash) a += ' stroke-dasharray="' + s.dash.join(' ') + '"';
      if (s.op != null) a += ' opacity="' + s.op + '"';
      body.push(a + '/>');
      if (s.shade) body.push('<path d="' + s.d + '" fill="' + svgPaint({ lin: [-s.shade, 0, s.shade, 0], stops: [[0, '#ffffff', 0.05], [0.28, '#ffffff', 0.45], [0.55, '#ffffff', 0], [1, '#000000', 0.32]] }, defs) + '"/>');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '"' + (attrs || '') + '>' + (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') + body.join('') + '</svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function canvasPaint(ctx, p) {
    if (!p || typeof p === 'string') return p;
    let g;
    if (p.lin) g = ctx.createLinearGradient(p.lin[0], p.lin[1], p.lin[2], p.lin[3]);
    else g = ctx.createRadialGradient(p.rad[0], p.rad[1], 0, p.rad[0], p.rad[1], p.rad[2]);
    for (const s of p.stops) g.addColorStop(s[0], s[2] != null ? rgba(s[1], s[2]) : s[1]);
    return g;
  }
  function paintShapes(ctx, shapes) {
    for (const s of shapes) {
      if (s.text != null) {
        ctx.save(); ctx.translate(s.x, s.y); if (s.rot) ctx.rotate((s.rot * PI) / 180);
        const px = 100; ctx.scale(s.size / px, s.size / px);
        ctx.font = (s.weight || 800) + ' ' + px + 'px ui-rounded,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = s.fill || '#000'; ctx.fillText(s.text, 0, 4);
        ctx.restore(); continue;
      }
      const p = path2d(s.d);
      ctx.globalAlpha = s.op != null ? s.op : 1;
      if (s.fill && s.fill !== 'none') { ctx.fillStyle = canvasPaint(ctx, s.fill); ctx.fill(p); }
      if (s.shade) { ctx.fillStyle = canvasPaint(ctx, { lin: [-s.shade, 0, s.shade, 0], stops: [[0, '#ffffff', 0.05], [0.28, '#ffffff', 0.45], [0.55, '#ffffff', 0], [1, '#000000', 0.32]] }); ctx.fill(p); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.lw || 0.05; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (s.dash) ctx.setLineDash(s.dash); ctx.stroke(p); if (s.dash) ctx.setLineDash([]); }
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Hull (top view) shapes — static parts only (no sails/crew/tiller), meters, bow up.
  function hullShapes(clsId, colors, sailNo) {
    const g = geo(clsId), c = colorsOf(clsId, colors), L = g.L, B = g.B, out = [];
    const hullCol = c.hull, deckCol = c.deck;
    if (g.motor) return ribShapes(c);
    // 29er racks under the hull outline
    if (g.wings) {
      const wy0 = yAt(g, g.wingS[0]), wy1 = yAt(g, g.wingS[1]), wx = g.wings / 2;
      const rack = 'M' + f3(halfW(g, g.wingS[0]) - 0.05) + ' ' + f3(wy0) + 'L' + f3(wx) + ' ' + f3(wy0 + 0.25) + 'L' + f3(wx) + ' ' + f3(wy1 - 0.1) + 'L' + f3(halfW(g, g.wingS[1]) - 0.05) + ' ' + f3(wy1) + 'Z';
      const rackL = 'M' + f3(-halfW(g, g.wingS[0]) + 0.05) + ' ' + f3(wy0) + 'L' + f3(-wx) + ' ' + f3(wy0 + 0.25) + 'L' + f3(-wx) + ' ' + f3(wy1 - 0.1) + 'L' + f3(-halfW(g, g.wingS[1]) + 0.05) + ' ' + f3(wy1) + 'Z';
      out.push({ d: rack + rackL, fill: 'rgba(40,46,58,0.55)', stroke: '#2a2f3a', lw: 0.07 });
      for (let i = 1; i < 5; i++) { const y = lerp(wy0 + 0.2, wy1 - 0.1, i / 5); out.push({ d: 'M' + f3(-wx) + ' ' + f3(y) + 'L' + f3(-halfW(g, 0.6)) + ' ' + f3(y) + 'M' + f3(halfW(g, 0.6)) + ' ' + f3(y) + 'L' + f3(wx) + ' ' + f3(y), stroke: 'rgba(30,34,44,0.5)', lw: 0.025 }); }
    }
    // bowsprit (fixed)
    if (g.bowsprit && !g.retractSprit) out.push({ d: 'M0 ' + f3(-L / 2 + 0.2) + 'L0 ' + f3(-L / 2 - g.bowsprit), stroke: '#2a2f3a', lw: 0.07 });
    const hullD = outlineD(g, 0), deckD = outlineD(g, Math.max(0.035, B * 0.035));
    out.push({ d: hullD, fill: hullCol, stroke: shade(hullCol, -0.45), lw: 0.03 });
    out.push({ d: deckD, fill: { lin: [-B / 2, 0, B / 2, 0], stops: [[0, shade(deckCol, -0.1)], [0.35, shade(deckCol, 0.12)], [0.65, deckCol], [1, shade(deckCol, -0.14)]] } });
    if (g.wood) for (let i = -4; i <= 4; i++) out.push({ d: 'M' + f3(i * B * 0.09) + ' ' + f3(-L * 0.42) + 'L' + f3(i * B * 0.09) + ' ' + f3(L * 0.46), stroke: 'rgba(110,70,30,0.22)', lw: 0.02 });
    // gunwale trim
    out.push({ d: outlineD(g, B * 0.02), stroke: c.trim || shade(hullCol, -0.3), lw: g.L > 6 ? 0.06 : 0.04, fill: 'none' });
    // cockpit
    const cp = g.cockpit;
    if (cp) {
      const cd = bandD(g, cp[0], cp[1], cp[2], cp[3]);
      out.push({ d: cd, fill: { lin: [0, yAt(g, cp[0]), 0, yAt(g, cp[1])], stops: [[0, shade(c.floor, -0.12)], [1, c.floor]] }, stroke: shade(c.floor, -0.3), lw: 0.025 });
    }
    if (clsId === 'opti') {
      // pram: wooden gunwales, thwart, mast thwart, buoyancy bags, daggerboard case
      out.push({ d: outlineD(g, 0.05), stroke: '#b8865a', lw: 0.07, fill: 'none' });
      out.push({ d: rr(-halfW(g, 0.5) + 0.06, yAt(g, 0.47), halfW(g, 0.5) * 2 - 0.12, 0.13, 0.03), fill: '#c99560', stroke: '#8d6237', lw: 0.02 });
      out.push({ d: rr(-halfW(g, 0.2) + 0.06, yAt(g, 0.17), halfW(g, 0.2) * 2 - 0.12, 0.12, 0.03), fill: '#c99560', stroke: '#8d6237', lw: 0.02 });
      out.push({ d: ell(-0.33, yAt(g, 0.66), 0.13, 0.32) + ell(0.33, yAt(g, 0.66), 0.13, 0.32), fill: '#e8f1fb', stroke: '#9cb3cc', lw: 0.02 });
      out.push({ d: ell(0, yAt(g, 0.08), 0.28, 0.1), fill: '#e8f1fb', stroke: '#9cb3cc', lw: 0.02 });
      out.push({ d: rr(-0.04, yAt(g, 0.36), 0.08, 0.36, 0.02), fill: '#6b4a2c' });
      out.push({ d: 'M0 ' + f3(yAt(g, 0.72)) + 'L0 ' + f3(yAt(g, 0.95)), stroke: '#c49a6c', lw: 0.03 });
    } else if (g.cabin) {
      const cb = g.cabin, y0 = yAt(g, cb[0]), y1 = yAt(g, cb[1]), w0 = halfW(g, cb[0]) * cb[2], w1 = halfW(g, cb[1]) * cb[2];
      const cabinD = 'M' + f3(-w0) + ' ' + f3(y0 + 0.25) + 'Q0 ' + f3(y0 - 0.25) + ' ' + f3(w0) + ' ' + f3(y0 + 0.25) + 'L' + f3(w1) + ' ' + f3(y1) + 'L' + f3(-w1) + ' ' + f3(y1) + 'Z';
      out.push({ d: cabinD, fill: { lin: [-w1, 0, w1, 0], stops: [[0, '#d7dbe0'], [0.4, '#ffffff'], [1, '#c3c8cf']] }, stroke: '#9aa1ab', lw: 0.03 });
      out.push({ d: rr(-w1 * 0.95, y0 + (y1 - y0) * 0.35, 0.12, (y1 - y0) * 0.45, 0.05) + rr(w1 * 0.95 - 0.12, y0 + (y1 - y0) * 0.35, 0.12, (y1 - y0) * 0.45, 0.05), fill: '#2a3442' });
      out.push({ d: rr(-0.28, y0 + (y1 - y0) * 0.55, 0.56, 0.5, 0.06), fill: 'rgba(80,120,160,0.45)', stroke: '#7d8794', lw: 0.025 });
      // pulpit + lifelines
      out.push({ d: outlineD(g, 0.12), stroke: 'rgba(170,178,190,0.9)', lw: 0.025, fill: 'none', dash: [0.6, 0.06] });
      // cockpit benches
      const bw = 0.32;
      out.push({ d: bandD(g, cp[0] + 0.02, cp[1] - 0.04, cp[2] + 0.02, cp[3]) , fill: 'none', stroke: 'rgba(0,0,0,0.12)', lw: bw * 0.15 });
      out.push({ d: 'M0 ' + f3(yAt(g, 0.97)) + 'L0 ' + f3(yAt(g, cp[0] + 0.12)), stroke: '#5b6470', lw: 0.03, dash: [0.12, 0.08] });
    } else {
      // dinghy fittings
      out.push({ d: rr(-0.045, yAt(g, g.board - 0.06), 0.09, g.L * 0.11, 0.03), fill: '#3a3f48' });
      out.push({ d: 'M' + f3(-halfW(g, cp[0] + 0.15) * 0.5) + ' ' + f3(yAt(g, cp[0] + 0.15)) + 'L' + f3(-halfW(g, 0.86) * 0.5) + ' ' + f3(yAt(g, 0.86)) + 'M' + f3(halfW(g, cp[0] + 0.15) * 0.5) + ' ' + f3(yAt(g, cp[0] + 0.15)) + 'L' + f3(halfW(g, 0.86) * 0.5) + ' ' + f3(yAt(g, 0.86)), stroke: '#1d3557', lw: 0.04 });
      out.push({ d: 'M' + f3(-halfW(g, 0.97) * 0.8) + ' ' + f3(yAt(g, 0.965)) + 'L' + f3(halfW(g, 0.97) * 0.8) + ' ' + f3(yAt(g, 0.965)), stroke: '#606875', lw: 0.025 });
      if (g.L > 3.5) out.push({ d: 'M' + f3(-0.06) + ' ' + f3(yAt(g, 0.12)) + 'L0 ' + f3(yAt(g, 0.04)) + 'L0.06 ' + f3(yAt(g, 0.12)), stroke: '#8f98a5', lw: 0.02, fill: 'none' });
    }
    // class colour stripe on foredeck
    if (!g.cabin && clsId !== 'opti') out.push({ d: 'M' + f3(-halfW(g, 0.12) * 0.7) + ' ' + f3(yAt(g, 0.12)) + 'L' + f3(halfW(g, 0.12) * 0.7) + ' ' + f3(yAt(g, 0.12)), stroke: c.trim, lw: 0.05 });
    // mast step
    if (g.mast) out.push({ d: circ(0, yAt(g, g.mast), 0.06), fill: '#5b6470' });
    return out;
  }
  function ribShapes(c) {
    const g = GEO.rib, L = g.L, B = g.B, out = [];
    const tube = outlineD(g, 0), inner = outlineD(g, 0.42);
    out.push({ d: tube, fill: { lin: [-B / 2, 0, B / 2, 0], stops: [[0, '#d94f0c'], [0.12, '#ff7a26'], [0.3, '#ff9a4d'], [0.5, '#ff7a26'], [0.7, '#ff9a4d'], [0.88, '#ff7a26'], [1, '#d94f0c']] }, stroke: '#a83a05', lw: 0.04 });
    out.push({ d: outlineD(g, 0.04), stroke: '#111', lw: 0.1, fill: 'none' }); // black rubbing strake
    out.push({ d: outlineD(g, 0.24), stroke: 'rgba(20,20,20,0.75)', lw: 0.025, fill: 'none', dash: [0.28, 0.1] }); // grab-line
    out.push({ d: inner, fill: { lin: [0, -L / 2, 0, L / 2], stops: [[0, '#4a4f57'], [1, '#33373d']] }, stroke: '#1f2226', lw: 0.03 });
    for (let i = 0; i < 14; i++) { const y = lerp(-L * 0.2, L * 0.44, i / 13); out.push({ d: 'M' + f3(-halfW(g, (y + L / 2) / L) + 0.55) + ' ' + f3(y) + 'L' + f3(halfW(g, (y + L / 2) / L) - 0.55) + ' ' + f3(y), stroke: 'rgba(255,255,255,0.05)', lw: 0.05 }); }
    // stern transom board
    out.push({ d: rr(-0.75, L / 2 - 0.3, 1.5, 0.22, 0.05), fill: '#25282d' });
    // centre console on the centreline: windscreen forward, black dash on the aft side, wheel on the AFT face
    // (seen from above as a thin rim facing the stern), helm standing behind it, jockey seat aft of the helm
    const cy = yAt(g, 0.47);
    out.push({ d: rr(-0.42, cy - 0.35, 0.84, 0.75, 0.14), fill: { lin: [-0.42, 0, 0.42, 0], stops: [[0, '#e55c10'], [0.4, '#ff8a3d'], [1, '#d4520c']] }, stroke: '#8f3304', lw: 0.03 });
    out.push({ d: 'M-0.42 ' + f3(cy - 0.2) + 'Q0 ' + f3(cy - 0.62) + ' 0.42 ' + f3(cy - 0.2) + 'L0.36 ' + f3(cy - 0.08) + 'Q0 ' + f3(cy - 0.42) + ' -0.36 ' + f3(cy - 0.08) + 'Z', fill: 'rgba(170,215,240,0.85)', stroke: '#c9d3dc', lw: 0.03 });
    out.push({ d: rr(-0.34, cy + 0.08, 0.68, 0.26, 0.06), fill: '#1d1f23', stroke: '#000', lw: 0.02 }); // black dash panel
    out.push({ d: 'M-0.5 ' + f3(cy + 0.32) + 'V' + f3(cy - 0.25) + 'Q-0.5 ' + f3(cy - 0.45) + ' -0.3 ' + f3(cy - 0.45) + 'H0.3Q0.5 ' + f3(cy - 0.45) + ' 0.5 ' + f3(cy - 0.25) + 'V' + f3(cy + 0.32), fill: 'none', stroke: '#d0d5db', lw: 0.035 }); // stainless rail (open aft for the helm)
    out.push({ d: 'M0 ' + f3(cy + 0.3) + 'L0 ' + f3(cy + 0.44), stroke: '#2a2d33', lw: 0.05 }); // wheel shaft out of the aft face
    out.push({ d: ell(0, cy + 0.46, 0.17, 0.05), fill: 'none', stroke: '#111', lw: 0.05 }); // wheel rim, edge-on from above
    out.push({ d: rr(-0.4, cy + 0.98, 0.8, 0.34, 0.12), fill: '#1d1f23', stroke: '#000', lw: 0.02 }); // jockey seat
    // bow locker + KØS box
    out.push({ d: rr(-0.36, -L / 2 + 0.95, 0.72, 0.62, 0.15), fill: '#2b2e33' });
    out.push({ d: rr(-0.42, -L / 2 + 0.28, 0.84, 0.42, 0.14), fill: '#111', stroke: '#000', lw: 0.02 });
    out.push({ text: 'KØS', x: 0, y: -L / 2 + 0.49, size: 0.3, fill: '#ffffff', weight: 900 });
    return out;
  }

  // ------------------------------------------------------------------------------------------
  // Cached hull canvases
  const hullCache = new Map();
  function hullBounds(g) {
    const W = Math.max(g.B, g.wings || 0) + 0.3;
    const top = -g.L / 2 - (g.bowsprit || 0) - 0.3, bot = g.L / 2 + 0.3;
    return { x0: -W / 2, y0: top, w: W, h: bot - top };
  }
  function hullSprite(clsId, colors, sailNo, ppm) {
    if (!P2D) return null;
    const g = geo(clsId);
    let b = Math.pow(2, Math.ceil(Math.log2(Math.max(4, ppm))));
    const bd = hullBounds(g);
    while (b > 4 && bd.h * b > 900) b /= 2;
    const key = clsId + '|' + JSON.stringify(colors || '') + '|' + (sailNo || '') + '|' + b;
    let s = hullCache.get(key);
    if (s) return s;
    const cv = makeCanvas(bd.w * b, bd.h * b);
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    ctx.setTransform(b, 0, 0, b, -bd.x0 * b, -bd.y0 * b);
    paintShapes(ctx, hullShapes(clsId, colors, sailNo));
    // sail number on aft deck/transom
    if (sailNo != null && sailNo !== '' && !g.motor) {
      const sz = clamp(g.B * 0.17, 0.14, 0.32);
      if (sz * b >= 6) {
        const y = g.cabin ? yAt(g, 0.12) : clsId === 'opti' ? yAt(g, 0.89) : yAt(g, Math.min(0.2, g.mast - 0.06));
        ctx.save(); ctx.translate(0, y); ctx.scale(sz / 50, sz / 50);
        ctx.font = '900 50px ui-rounded,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(20,30,50,0.82)'; ctx.fillText(String(sailNo).slice(0, 6), 0, 2);
        ctx.restore();
      }
    }
    s = { canvas: cv, x0: bd.x0, y0: bd.y0, w: bd.w, h: bd.h, ppm: b };
    if (hullCache.size > 120) hullCache.delete(hullCache.keys().next().value);
    hullCache.set(key, s);
    return s;
  }

  // ------------------------------------------------------------------------------------------
  // Per-boat animation state (spinnaker spring, crew side, luff phase)
  const states = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function stateOf(boat) {
    let st = states && states.get(boat);
    if (!st) { st = { t: null, spi: 0, spiV: 0, side: 0, crewSide: null, phase: (hashStr(boat.id || boat.sailNo || Math.random()) % 1000) / 160, popped: false }; states && states.set(boat, st); }
    return st;
  }

  // Draw one sail as a filled crescent. M = luff point (mast/tack), ang = chord angle rel. to centerline
  // (0 = pointing aft, + to starboard), side = leeward side (+1 stbd), depth = draft ratio.
  function drawSailShape(ctx, M, ang, chord, depth, side, o) {
    const dx = Math.sin(ang), dy = Math.cos(ang), nx = side * Math.cos(ang), ny = -side * Math.sin(ang);
    const N = 14, foot = [], head = [];
    const flut = o.flutter || 0, t = o.t || 0;
    const tw = o.twist || 0.25, up = o.upper || 0.55;
    const hx = o.headX || 0, hy = o.headY || 0;
    const ang2 = ang + side * tw, dx2 = Math.sin(ang2), dy2 = Math.cos(ang2), nx2 = side * Math.cos(ang2), ny2 = -side * Math.sin(ang2);
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      let b = depth * chord * (0.5 * 4 * s * (1 - s) + 0.5 * 6.75 * s * (1 - s) * (1 - s));
      if (flut) b = depth * chord * 0.35 * 4 * s * (1 - s) + flut * chord * Math.sin(s * 10 - t * 26 + o.phase) * Math.sin(s * PI) * (0.6 + s);
      foot.push([M[0] + dx * chord * s + nx * b, M[1] + dy * chord * s + ny * b]);
      let b2 = b * 0.8;
      if (flut) b2 = depth * chord * 0.25 * 4 * s * (1 - s) + flut * chord * Math.sin(s * 9 - t * 24 + o.phase + 1.7) * Math.sin(s * PI) * (0.6 + s);
      head.push([M[0] + hx + dx2 * chord * up * s + nx2 * b2 * up, M[1] + hy + dy2 * chord * up * s + ny2 * b2 * up]);
    }
    ctx.beginPath();
    ctx.moveTo(foot[0][0], foot[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(foot[i][0], foot[i][1]);
    // leech up to the head (slightly hollow)
    const c = foot[N], h = head[N];
    ctx.quadraticCurveTo((c[0] + h[0]) / 2 - nx * chord * 0.04, (c[1] + h[1]) / 2 - ny * chord * 0.04, h[0], h[1]);
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(head[i][0], head[i][1]);
    ctx.closePath();
    if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fill(); return; }
    const g = ctx.createLinearGradient(M[0], M[1], c[0], c[1]);
    const col = o.color || '#ffffff';
    g.addColorStop(0, shade(col, -0.06)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, flut ? -0.18 : -0.1));
    ctx.fillStyle = g; ctx.globalAlpha = o.alpha != null ? o.alpha : 0.95; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = Math.max(o.lw || 0, 0.045); ctx.stroke(); // a clear outline so white sails read on pale water
    if (o.mylar) { ctx.globalAlpha = 0.18; ctx.fillStyle = '#7f8da3'; ctx.fill(); ctx.globalAlpha = 1; }
    // battens / draft stripe
    const nb = o.battens || 0;
    if (nb && !flut) {
      ctx.strokeStyle = 'rgba(40,50,70,0.35)'; ctx.lineWidth = 0.025; ctx.beginPath();
      for (let k = 1; k <= nb; k++) {
        const f = k / (nb + 1), i = N, a = foot[i], bb = head[i];
        const px = lerp(a[0], bb[0], f), py = lerp(a[1], bb[1], f);
        const mx = lerp(foot[N - 3][0], head[N - 3][0], f), my = lerp(foot[N - 3][1], head[N - 3][1], f);
        ctx.moveTo(px, py); ctx.lineTo(mx, my);
      }
      ctx.stroke();
    }
    // draft line (curvature hint)
    ctx.strokeStyle = 'rgba(30,50,80,' + (flut ? 0.1 : 0.16) + ')'; ctx.lineWidth = 0.03; ctx.beginPath();
    for (let i = 0; i <= N; i++) { const x = lerp(foot[i][0], head[i][0], 0.45), y = lerp(foot[i][1], head[i][1], 0.45); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    if (o.stripe) { ctx.strokeStyle = o.stripe; ctx.lineWidth = 0.05; ctx.beginPath(); for (let i = 0; i <= N; i++) { const x = lerp(foot[i][0], head[i][0], 0.82), y = lerp(foot[i][1], head[i][1], 0.82); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  }

  function drawSpinnaker(ctx, g, boat, st, side, ang, o) {
    const k = st.spi; if (k < 0.02) return;
    const L = g.L, sym = g.spi === 'sym', mastY = yAt(g, g.mast);
    const open = clamp(Math.abs(ang) / 1.4, 0, 1); // 0 = tight reach, 1 = dead run
    const kk = Math.min(1.25, k), grow = Math.min(1, k);
    let tack, clew;
    if (sym) {
      const span = L * (0.32 + 0.12 * open) * grow;
      tack = [-side * span * (0.35 + 0.65 * open), -L / 2 + L * 0.08 - L * 0.06 * open];
      clew = [side * (g.B / 2 + span * 0.85), mastY - L * 0.08 + L * 0.1 * (1 - open)];
    } else {
      tack = [0, -L / 2 - (g.bowsprit || 0.3) * (g.retractSprit ? grow : 1)];
      const spread = L * (0.16 + 0.26 * open) * grow;
      clew = [side * (g.B / 2 + spread), mastY - L * 0.05 + L * 0.12 * (1 - open) * grow];
    }
    const ex = clew[0] - tack[0], ey = clew[1] - tack[1], el = Math.hypot(ex, ey) || 1;
    let nx = ey / el, ny = -ex / el; if (ny > 0) { nx = -nx; ny = -ny; } // bulge forward
    const wob = Math.sin(o.t * 6 + st.phase) * (boat.luffing ? 0.12 : 0.025);
    const belly = el * (0.42 + 0.1 * open) * kk * (1 + wob);
    const c1 = [tack[0] + ex * 0.08 + nx * belly, tack[1] + ey * 0.08 + ny * belly];
    const c2 = [tack[0] + ex * 0.92 + nx * belly * 0.95 + side * el * 0.12, tack[1] + ey * 0.92 + ny * belly * 0.95];
    const cols = g.spiColors || ['#ff7a3d', '#ffd23f', '#ffffff'];
    ctx.save();
    if (o.shadowOff) ctx.translate(o.shadowOff[0] * 1.2, o.shadowOff[1] * 1.2);
    const spiPath = () => { ctx.beginPath(); ctx.moveTo(tack[0], tack[1]); ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], clew[0], clew[1]); ctx.quadraticCurveTo(tack[0] + ex * 0.5 + nx * el * 0.12, tack[1] + ey * 0.5 + ny * el * 0.12, tack[0], tack[1]); ctx.closePath(); };
    spiPath();
    if (o.shadowOff) { ctx.fillStyle = 'rgba(0,25,60,0.15)'; ctx.fill(); ctx.restore(); return; }
    ctx.save(); ctx.clip();
    ctx.fillStyle = cols[0]; ctx.fillRect(-L * 2, -L * 2, L * 4, L * 4);
    // curved colour bands parallel to the foot
    const band = (f0, f1, col) => { const ux = ex / el, uy = ey / el; ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(tack[0] - ux * L + nx * belly * f0, tack[1] - uy * L + ny * belly * f0); ctx.lineTo(clew[0] + ux * L + nx * belly * f0, clew[1] + uy * L + ny * belly * f0);
      ctx.lineTo(clew[0] + ux * L + nx * belly * f1, clew[1] + uy * L + ny * belly * f1); ctx.lineTo(tack[0] - ux * L + nx * belly * f1, tack[1] - uy * L + ny * belly * f1); ctx.closePath(); ctx.fill(); };
    band(0.42, 0.52, cols[2] || '#fff'); band(0.52, 2, cols[1]);
    const hx = tack[0] + ex * 0.5 + nx * belly * 0.6, hy = tack[1] + ey * 0.5 + ny * belly * 0.6;
    const hg = ctx.createRadialGradient(hx - nx * el * 0.1, hy - ny * el * 0.1, 0, hx, hy, el * 0.85);
    hg.addColorStop(0, 'rgba(255,255,255,0.45)'); hg.addColorStop(0.55, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(0,20,60,0.28)');
    ctx.fillStyle = hg; ctx.fillRect(-L * 2, -L * 2, L * 4, L * 4);
    ctx.restore();
    spiPath(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(30,30,30,0.55)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(clew[0], clew[1]); ctx.lineTo(side * halfW(g, 0.82), yAt(g, 0.82)); ctx.stroke();
    if (sym) { ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(0, mastY); ctx.lineTo(tack[0], tack[1]); ctx.stroke(); ctx.strokeStyle = 'rgba(30,30,30,0.55)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(tack[0], tack[1]); ctx.lineTo(-side * halfW(g, 0.82), yAt(g, 0.82)); ctx.stroke(); }
    ctx.restore();
  }

  // top-down sailor in a life jacket. (x,y) = hips on the gunwale, out = outward unit x (+1/-1),
  // hike 0..1, mode: 'sit' | 'hike' | 'trap' | 'stand' | 'swim'
  function drawSailor(ctx, x, y, out, ext, mode, look) {
    const jacket = look.jacket, helmet = look.helmet, skin = look.skin;
    ctx.save(); ctx.translate(x, y);
    ctx.lineCap = 'round';
    const s = look.scale || 1;
    ctx.scale(s, s);
    if (mode === 'trap') {
      // standing horizontal on the trapeze: feet at gunwale, body extended outward
      ctx.strokeStyle = '#1d2a44'; ctx.lineWidth = 0.15;
      ctx.beginPath(); ctx.moveTo(0, -0.09); ctx.lineTo(out * 0.55, -0.05); ctx.moveTo(0, 0.09); ctx.lineTo(out * 0.55, 0.05); ctx.stroke();
      ctx.fillStyle = jacket; ctx.beginPath(); ctx.ellipse(out * 0.82, 0, 0.3, 0.2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = shade(jacket, -0.35); ctx.lineWidth = 0.03; ctx.stroke();
      ctx.fillStyle = helmet || skin; ctx.beginPath(); ctx.arc(out * 1.18, 0, 0.12, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
      ctx.strokeStyle = skin; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(out * 0.85, -0.16); ctx.lineTo(out * 0.55, -0.32); ctx.stroke();
    } else if (mode === 'swim') {
      ctx.fillStyle = jacket; ctx.beginPath(); ctx.ellipse(0, 0, 0.24, 0.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = helmet || skin; ctx.beginPath(); ctx.arc(0, -0.05, 0.11, 0, TAU); ctx.fill();
      ctx.strokeStyle = skin; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(-0.2, -0.05); ctx.lineTo(-0.38, -0.25); ctx.moveTo(0.2, -0.05); ctx.lineTo(0.38, -0.25); ctx.stroke();
    } else {
      const lean = mode === 'hike' ? ext : mode === 'stand' ? 0 : -0.25; // torso offset outward
      // legs (inboard, towards the centre, feet under the hiking straps)
      const legIn = mode === 'stand' ? 0.1 : 0.42;
      ctx.strokeStyle = look.pants || '#2c3e66'; ctx.lineWidth = 0.11;
      ctx.beginPath(); ctx.moveTo(out * 0.04, -0.07); ctx.lineTo(-out * legIn, -0.1); ctx.moveTo(out * 0.04, 0.07); ctx.lineTo(-out * legIn, 0.06); ctx.stroke();
      ctx.fillStyle = '#1b1f27'; ctx.beginPath(); ctx.arc(-out * legIn, -0.1, 0.055, 0, TAU); ctx.arc(-out * legIn, 0.06, 0.055, 0, TAU); ctx.fill();
      const tx = out * (0.1 + lean * 0.5);
      ctx.fillStyle = 'rgba(0,20,40,0.18)'; ctx.beginPath(); ctx.ellipse(tx + out * 0.06 + 0.04, 0.06, 0.24, 0.22, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = jacket; ctx.beginPath(); ctx.ellipse(tx, 0, 0.17 + Math.max(0, lean) * 0.1, 0.23, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = shade(jacket, -0.35); ctx.lineWidth = 0.03; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(tx - 0.12, 0); ctx.lineTo(tx + 0.12, 0); ctx.stroke();
      const hx = out * (0.18 + lean * 0.75);
      ctx.fillStyle = helmet || skin; ctx.beginPath(); ctx.arc(hx, 0, 0.115, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.02; ctx.stroke();
      if (look.arm != null) { ctx.strokeStyle = skin; ctx.lineWidth = 0.065; ctx.beginPath(); ctx.moveTo(tx, look.armY || 0.12); ctx.lineTo(look.arm, look.armY2 != null ? look.armY2 : 0.3); ctx.stroke(); }
    }
    ctx.restore();
  }

  function crewLook(boat, i) {
    const h = hashStr((boat.id || boat.sailNo || 'b') + ':' + i);
    return { jacket: (boat.crewColors && boat.crewColors[i]) || JACKETS[(h >> 3) % JACKETS.length], helmet: i % 2 === 0 ? HAIR[(h >> 7) % HAIR.length] : HELMETS[(h >> 9) % HELMETS.length], skin: SKIN[(h >> 11) % 4] };
  }

  // ------------------------------------------------------------------------------------------
  // drawBoat — ctx must be in world meters. opts: {t, ppm (device px per m), alpha, highlight, shadow, rudder}
  function drawBoat(ctx, boat, opts) {
    opts = opts || {};
    if (!boat || !isFinite(boat.x) || !isFinite(boat.y)) return;
    const clsId = clsIdOf(boat), g = geo(clsId), L = g.L;
    const t = opts.t != null ? opts.t : boat.t || 0;
    const st = stateOf(boat);
    const dt = st.t == null ? 0 : clamp(t - st.t, 0, 0.1); st.t = t;
    const colors = colorsOf(clsId, boat.colors);
    const ppm = opts.ppm || 20;
    const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const heading = fin(boat.heading, 0);
    const heel = clamp(fin(boat.heel, 0), -1.4, 1.4);
    const twa = boat.twa != null ? boat.twa : boat.tack === 'port' ? -1 : 1;
    const windSide = twa >= 0 ? 1 : -1; // windward side in boat coords (+1 = starboard)
    // crew side follows the windward side smoothly (crosses the boat on a tack)
    if (st.crewSide == null) st.crewSide = windSide;
    st.crewSide += clamp(windSide - st.crewSide, -dt * 2.8, dt * 2.8);
    // spinnaker spring: pops open with overshoot
    const spiOn = !!boat.spinnaker && g.spi && g.spi !== 'none';
    const target = spiOn ? 1 : 0;
    st.spiV += ((target - st.spi) * 70 - st.spiV * (spiOn ? 7 : 12)) * dt; st.spi = Math.max(0, st.spi + st.spiV * dt);
    if (!spiOn && st.spi < 0.02) { st.spi = 0; st.spiV = 0; }
    const shadowOn = opts.shadow !== false;
    // world-space light offset turned into boat space
    const ch = Math.cos(-heading), sh = Math.sin(-heading);
    const toLocal = (wx, wy) => [wx * ch - wy * sh, wx * sh + wy * ch];

    ctx.save();
    ctx.translate(boat.x, boat.y);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.highlight) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.strokeStyle = 'rgba(255,214,94,' + (0.35 + 0.35 * pulse) + ')'; ctx.lineWidth = Math.max(0.12, 2.5 / ppm);
      ctx.beginPath(); ctx.arc(0, 0, L * 0.75 + pulse * 0.2, 0, TAU); ctx.stroke();
    }
    ctx.rotate(heading);
    if (boat.capsized) { drawCapsized(ctx, boat, g, colors, t, st, toLocal, opts); ctx.restore(); return; }
    const hs = hullSprite(clsId, boat.colors, boat.sailNo, ppm);
    const hullD = path2d(outlineD(g, 0));
    // shadow on the water
    if (shadowOn) {
      const so = toLocal(0.18 + L * 0.02, 0.28 + L * 0.03);
      ctx.save(); ctx.translate(so[0] + heel * 0.25, so[1]); ctx.fillStyle = 'rgba(0,25,60,0.22)'; ctx.fill(hullD); ctx.restore();
    }
    // heel: show the hull bottom on the high side, shade low side
    const hx = -Math.sin(heel) * g.B * 0.22;
    if (Math.abs(heel) > 0.03) {
      ctx.save(); ctx.translate(hx, 0); ctx.fillStyle = g.keel ? '#26364d' : shade(colors.hull, -0.25); ctx.fill(hullD); ctx.restore();
    }
    if (hs) ctx.drawImage(hs.canvas, hs.x0, hs.y0, hs.w, hs.h);
    else { ctx.fillStyle = colors.hull; ctx.fill(hullD); }
    if (Math.abs(heel) > 0.03) {
      const gr = ctx.createLinearGradient(-g.B / 2, 0, g.B / 2, 0);
      const a = clamp(Math.abs(heel) * 0.55, 0, 0.35);
      if (heel > 0) { gr.addColorStop(0, 'rgba(255,255,255,' + a * 0.5 + ')'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,20,50,' + a + ')'); }
      else { gr.addColorStop(0, 'rgba(0,20,50,' + a + ')'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,255,255,' + a * 0.5 + ')'); }
      ctx.fillStyle = gr; ctx.fill(hullD);
    }
    const rudder = clamp(opts.rudder != null ? opts.rudder : boat.rudder != null ? boat.rudder : (boat.controls && boat.controls.rudder) || clamp((boat.yawRate || 0) * 1.5, -1, 1), -1, 1);
    if (g.motor) { drawRibLive(ctx, boat, g, colors, t, rudder, st); ctx.restore(); return; }
    // rudder + tiller
    const sternY = L / 2;
    // rudder +1 = turning to starboard: the blade's trailing edge swings to starboard (+x), the tiller to port
    const ra = rudder * 0.55;
    ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, sternY); ctx.lineTo(Math.sin(ra) * 0.35, sternY + Math.cos(ra) * 0.35); ctx.stroke();
    if (!g.keel || clsId === 'hboat') {
      const tl = Math.min(1.25, L * 0.27);
      ctx.strokeStyle = clsId === 'opti' || clsId === 'hboat' ? '#a87443' : '#3a3f48'; ctx.lineWidth = 0.055;
      ctx.beginPath(); ctx.moveTo(0, sternY); ctx.lineTo(-Math.sin(ra) * tl, sternY - Math.cos(ra) * tl); ctx.stroke();
    } else { // wheel-less J70 still has a tiller, a long one
      ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0, sternY - 0.1); ctx.lineTo(-Math.sin(ra) * 1.4, sternY - 0.1 - Math.cos(ra) * 1.4); ctx.stroke();
    }
    // ---- rig
    const mastY = yAt(g, g.mast);
    const rigK = Math.sin(heel) * 0.28; // mast top shift to leeward per m of mast
    const headX = rigK * g.mastH * 0.55;
    const boom = clamp(fin(boat.boom, -windSide * 0.4), -1.6, 1.6);
    const lee = boom > 0.02 ? 1 : boom < -0.02 ? -1 : -windSide;
    const luff = !!boat.luffing || !!boat.inIrons;
    const trim = boat.trim != null ? boat.trim : 0.8;
    const depth = luff ? 0.1 : 0.1 + 0.1 * clamp(trim, 0, 1) * (boat.stalled ? 0.75 : 1);
    const flutter = luff ? 0.05 + (boat.inIrons ? 0.03 : 0) : 0;
    const so = toLocal(0.35 + g.mastH * 0.06, 0.5 + g.mastH * 0.08);
    const sOpt = { t, phase: st.phase, flutter, twist: 0.42, upper: g.sprit ? 0.92 : 0.72, headX, headY: 0 };
    const jibAng = clamp(boom * 0.72, -1.05, 1.05) || lee * 0.15;
    const jibTack = [0, -L / 2 + L * (g.jib || 0)];
    const jibChord = (mastY - jibTack[1]) * (g.jibLen || 1) * 1.02;
    // shadows of sails
    if (shadowOn) {
      ctx.save(); ctx.translate(so[0], so[1]);
      drawSailShape(ctx, [0, mastY], boom, g.boom, depth, lee, Object.assign({}, sOpt, { shadow: 'rgba(0,25,60,0.13)' }));
      if (g.jib) drawSailShape(ctx, jibTack, jibAng, jibChord, depth * 0.9, lee, Object.assign({}, sOpt, { upper: 0.25, shadow: 'rgba(0,25,60,0.12)', headX: headX * 0.6 }));
      ctx.restore();
      if (st.spi > 0.02) drawSpinnaker(ctx, g, boat, st, lee, boom, { t, shadowOff: so });
    }
    // crew
    const nCrew = g.crew.length;
    const hike = clamp(fin(boat.hike, 0.3), 0, 1);
    const side = st.crewSide;
    const sideSign = side >= 0 ? 1 : -1;
    for (let i = 0; i < nCrew; i++) {
      const seat = g.crew[i], look = crewLook(boat, i);
      const w = halfW(g, seat.s), y = yAt(g, seat.s);
      const crossing = Math.abs(side) < 0.9;
      let x, mode, ext = 0;
      if (seat.role === 'trap' && hike > 0.45 && !crossing) { x = sideSign * (g.wings ? g.wings / 2 : w); mode = 'trap'; }
      else if (seat.role === 'rail') { x = side * (w - 0.18); mode = hike > 0.3 && !crossing ? 'hike' : 'sit'; ext = 0.15 + hike * 0.25; }
      else {
        const edge = g.wings && seat.s > g.wingS[0] && seat.s < g.wingS[1] ? g.wings / 2 : w;
        const sitIn = lerp(w * 0.55, edge - 0.05, clamp(hike * 2, 0, 1));
        x = side * (crossing ? Math.abs(side) * sitIn : sitIn);
        mode = hike > 0.2 && !crossing ? 'hike' : 'sit'; ext = clamp((hike - 0.2) * 1.4, 0, 1) * 0.9;
      }
      look.scale = g.L > 6 ? 1.12 : clsId === 'opti' ? 0.92 : 1.02;
      if (seat.role === 'helm') { look.arm = 0; look.armY = 0.1; look.armY2 = 0.25; }
      drawSailor(ctx, x + hx * 0.5, y, sideSign, ext, mode, look);
      if (mode === 'trap') { // trapeze wire
        ctx.strokeStyle = 'rgba(40,40,40,0.6)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(sideSign * ((g.wings || g.B) / 2 + 0.8), y); ctx.lineTo(headX * 0.7, mastY); ctx.stroke();
      }
    }
    // mainsheet line
    ctx.strokeStyle = 'rgba(30,30,40,0.45)'; ctx.lineWidth = 0.02;
    const clewX = Math.sin(boom) * g.boom, clewY = mastY + Math.cos(boom) * g.boom;
    ctx.beginPath(); ctx.moveTo(clewX * 0.85, mastY + (clewY - mastY) * 0.85); ctx.lineTo(0, Math.min(L / 2 - 0.1, yAt(g, 0.88))); ctx.stroke();
    // jib
    if (g.jib) {
      drawSailShape(ctx, jibTack, jibAng, jibChord, depth * 0.95, lee, Object.assign({}, sOpt, { upper: 0.22, twist: 0.2, headX: headX * 0.75, color: colors.sail, mylar: g.mylar, lw: 0.02 }));
      ctx.strokeStyle = 'rgba(160,170,185,0.8)'; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.moveTo(jibTack[0], jibTack[1]); ctx.lineTo(headX * 0.75, mastY); ctx.stroke();
    }
    // mainsail
    drawSailShape(ctx, [0, mastY], boom, g.boom * (g.sprit ? 0.98 : 1), depth, lee, Object.assign({}, sOpt, { color: colors.sail, battens: g.battens, mylar: g.mylar, stripe: clsId === 'opti' ? null : null }));
    // boom (and opti sprit)
    ctx.strokeStyle = g.boomCol || '#4a515c'; ctx.lineWidth = L > 6 ? 0.11 : 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, mastY); ctx.lineTo(clewX, clewY); ctx.stroke();
    if (g.sprit) { const ba = boom + lee * 0.16; ctx.strokeStyle = '#c08a55'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(headX * 0.2, mastY + 0.12); ctx.lineTo(headX + Math.sin(ba) * g.boom * 0.9, mastY + Math.cos(ba) * g.boom * 0.9); ctx.stroke(); }
    // mast (projected with heel)
    ctx.strokeStyle = g.mastCol || '#6b7380'; ctx.lineWidth = L > 6 ? 0.13 : 0.09;
    ctx.beginPath(); ctx.moveTo(0, mastY); ctx.lineTo(headX, mastY); ctx.stroke();
    ctx.fillStyle = shade(g.mastCol || '#6b7380', -0.2); ctx.beginPath(); ctx.arc(headX, mastY, L > 6 ? 0.1 : 0.065, 0, TAU); ctx.fill();
    // retractable pole (feva) appears with the gennaker
    if (g.retractSprit && st.spi > 0.02) { ctx.strokeStyle = '#2a2f3a'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0, -L / 2 + 0.25); ctx.lineTo(0, -L / 2 - g.bowsprit * Math.min(1, st.spi)); ctx.stroke(); }
    // spinnaker on top
    if (st.spi > 0.02) drawSpinnaker(ctx, g, boat, st, lee, boom, { t });
    // windex at mast head pointing downwind (apparent)
    if (ppm > 14 && boat.awa != null) {
      const a = PI + boat.awa; // direction the vane points (towards where wind goes)
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(headX, mastY); ctx.lineTo(headX + Math.sin(a) * 0.35, mastY - Math.cos(a) * 0.35); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRibLive(ctx, boat, g, colors, t, rudder, st) {
    const L = g.L;
    // outboard (turns with steering)
    ctx.save(); ctx.translate(0, L / 2 - 0.1); ctx.rotate(-rudder * 0.5);
    ctx.fillStyle = '#121418'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-0.28, 0.0, 0.56, 0.78, 0.18) : ctx.rect(-0.28, 0, 0.56, 0.78); ctx.fill();
    ctx.fillStyle = '#2d3138'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-0.2, 0.1, 0.4, 0.45, 0.12) : ctx.rect(-0.2, 0.1, 0.4, 0.45); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-0.18, 0.12, 0.08, 0.4);
    ctx.restore();
    // driver standing at the console
    const look = crewLook(boat, 0); look.jacket = boat.crewColors ? boat.crewColors[0] : '#ffd23f'; look.helmet = HAIR[hashStr(boat.id || 'r') % HAIR.length];
    // on the centreline behind the wheel, facing the bow (the sailor's 'out' axis turned to point forward)
    const dy = yAt(g, 0.47) + 0.87, wy = yAt(g, 0.47) + 0.46;
    ctx.save(); ctx.translate(0, dy); ctx.rotate(-PI / 2);
    drawSailor(ctx, 0, 0, 1, 0, 'stand', Object.assign(look, { scale: 1.05 }));
    ctx.restore();
    ctx.strokeStyle = look.skin || SKIN[0]; ctx.lineWidth = 0.065; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.15, dy - 0.12); ctx.lineTo(-0.13, wy + 0.02); ctx.moveTo(0.15, dy - 0.12); ctx.lineTo(0.13, wy + 0.02); ctx.stroke();
    // passengers / crew
    if (boat.crewNames && boat.crewNames.length > 1) drawSailor(ctx, 0.55, yAt(g, 0.72), 1, 0, 'sit', Object.assign(crewLook(boat, 1), { scale: 1 }));
  }

  function drawCapsized(ctx, boat, g, colors, t, st, toLocal, opts) {
    const L = g.L, side = boat.capsizeSide || (boat.heel >= 0 ? 1 : -1); // fell to starboard → rig lies to starboard
    const bob = Math.sin(t * 2 + st.phase) * 0.03;
    // sail lying flat on the water
    ctx.save(); ctx.globalAlpha *= 0.8;
    const mastY = yAt(g, g.mast || 0.3);
    ctx.fillStyle = 'rgba(240,248,255,0.75)';
    ctx.beginPath(); ctx.moveTo(side * 0.3, mastY); ctx.lineTo(side * (g.mastH * 0.95), mastY + 0.3); ctx.lineTo(side * 0.5, mastY + g.boom); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7d8794'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0, mastY); ctx.lineTo(side * g.mastH, mastY); ctx.stroke();
    ctx.restore();
    // hull on its side: narrower, showing bottom
    ctx.save(); ctx.translate(-side * 0.1, bob); ctx.scale(0.62, 1);
    ctx.fillStyle = 'rgba(0,25,60,0.2)'; ctx.translate(0.15, 0.2); ctx.fill(path2d(outlineD(g, 0))); ctx.translate(-0.15, -0.2);
    const gr = ctx.createLinearGradient(-g.B / 2, 0, g.B / 2, 0); gr.addColorStop(0, shade(colors.hull, -0.2)); gr.addColorStop(0.5, colors.hull); gr.addColorStop(1, shade(colors.hull, -0.3));
    ctx.fillStyle = gr; ctx.fill(path2d(outlineD(g, 0))); ctx.strokeStyle = shade(colors.hull, -0.5); ctx.lineWidth = 0.04; ctx.stroke(path2d(outlineD(g, 0)));
    ctx.restore();
    // centreboard sticking out to windward (lying flat), sailors swimming by it
    if (g.board || g.keel) { // centreboard / keel lying flat, pointing to windward
      const by = yAt(g, g.board || 0.5), len = g.keel ? 1.4 : 0.9, x0 = -side * 0.25;
      ctx.fillStyle = g.keel ? '#26364d' : '#ffffff'; ctx.strokeStyle = '#5b6470'; ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.rect(Math.min(x0, x0 - side * len), by - 0.14, len, 0.28); ctx.fill(); ctx.stroke();
    }
    for (let i = 0; i < g.crew.length; i++) drawSailor(ctx, -side * (1.2 + i * 0.5), yAt(g, g.board || 0.5) + 0.3 + i * 0.5 + Math.sin(t * 3 + i) * 0.05, -side, 0, 'swim', crewLook(boat, i));
  }

  // ------------------------------------------------------------------------------------------
  // Buoys (pseudo-3D upright sprites; meters, origin at waterline, y up negative)
  function cyl(w, y0, y1, fill, ry) { ry = ry || w * 0.32; return 'M' + f3(-w) + ' ' + f3(y0) + 'L' + f3(-w) + ' ' + f3(y1) + 'A' + f3(w) + ' ' + f3(ry) + ' 0 0 0 ' + f3(w) + ' ' + f3(y1) + 'L' + f3(w) + ' ' + f3(y0) + 'A' + f3(w) + ' ' + f3(ry) + ' 0 0 1 ' + f3(-w) + ' ' + f3(y0) + 'Z'; }
  function band(wa, ya, wb, yb) { return 'M' + f3(-wa) + ' ' + f3(ya) + 'L' + f3(-wb) + ' ' + f3(yb) + 'A' + f3(wb) + ' ' + f3(wb * 0.3) + ' 0 0 0 ' + f3(wb) + ' ' + f3(yb) + 'L' + f3(wa) + ' ' + f3(ya) + 'A' + f3(wa) + ' ' + f3(wa * 0.3) + ' 0 0 1 ' + f3(-wa) + ' ' + f3(ya) + 'Z'; }
  const coneUp = (y, r) => 'M' + f3(-r) + ' ' + f3(y) + 'L' + f3(r) + ' ' + f3(y) + 'L0 ' + f3(y - r * 1.7) + 'Z';
  const coneDn = (y, r) => 'M' + f3(-r) + ' ' + f3(y - r * 1.7) + 'L' + f3(r) + ' ' + f3(y - r * 1.7) + 'L0 ' + f3(y) + 'Z';
  const BLK = '#1e2128', YEL = '#ffd21f', RED = '#e8323c', GRN = '#18a957', WHT = '#ffffff';
  function pillar(bands, out, topY) { // bands: colours bottom→top
    const n = bands.length, y0 = -0.15, y1 = topY, w0 = 0.6, w1 = 0.32;
    for (let i = 0; i < n; i++) {
      const ya = lerp(y0, y1, i / n), yb = lerp(y0, y1, (i + 1) / n);
      out.push({ d: band(lerp(w0, w1, (i + 1) / n), yb, lerp(w0, w1, i / n), ya), fill: bands[i], shade: w0 });
    }
    out.push({ d: ell(0, y1, w1, w1 * 0.3), fill: shade(bands[n - 1], 0.2) });
  }
  const BUOYS = {
    port: () => { const o = [{ d: cyl(0.55, -1.45, -0.1), fill: RED, shade: 0.55 }, { d: ell(0, -1.45, 0.55, 0.17), fill: shade(RED, 0.2) }, { d: 'M0 -1.45L0 -1.85', stroke: '#444', lw: 0.06 }, { d: cyl(0.2, -2.15, -1.85, RED, 0.06), fill: RED, shade: 0.2 }, { d: ell(0, -2.15, 0.2, 0.06), fill: shade(RED, 0.25) }]; return { shapes: o, top: -2.2, w: 1.2 }; },
    stbd: () => { const o = [{ d: 'M-0.6 -0.1A0.6 0.18 0 0 0 0.6 -0.1L0.1 -1.55Q0 -1.65 -0.1 -1.55Z', fill: GRN, shade: 0.6 }, { d: 'M0 -1.58L0 -1.85', stroke: '#444', lw: 0.06 }, { d: coneUp(-1.85, 0.2), fill: GRN }]; return { shapes: o, top: -2.2, w: 1.2 }; },
    cardN: () => { const o = []; pillar([YEL, BLK], o, -1.9); o.push({ d: 'M0 -1.9L0 -2.15', stroke: '#333', lw: 0.05 }, { d: coneUp(-2.15, 0.18) + coneUp(-2.55, 0.18), fill: BLK, stroke: '#ffffff', lw: 0.07 }); return { shapes: o, top: -2.9, w: 1.3 }; },
    cardS: () => { const o = []; pillar([BLK, YEL], o, -1.9); o.push({ d: 'M0 -1.9L0 -2.15', stroke: '#333', lw: 0.05 }, { d: coneDn(-2.15, 0.18) + coneDn(-2.6, 0.18), fill: BLK, stroke: '#ffffff', lw: 0.07 }); return { shapes: o, top: -2.9, w: 1.3 }; },
    cardE: () => { const o = []; pillar([BLK, YEL, BLK], o, -1.9); o.push({ d: 'M0 -1.9L0 -2.15', stroke: '#333', lw: 0.05 }, { d: coneDn(-2.15, 0.18) + coneUp(-2.5, 0.18), fill: BLK, stroke: '#ffffff', lw: 0.07 }); return { shapes: o, top: -3.0, w: 1.3 }; },
    cardW: () => { const o = []; pillar([YEL, BLK, YEL], o, -1.9); o.push({ d: 'M0 -1.9L0 -2.15', stroke: '#333', lw: 0.05 }, { d: coneUp(-2.15, 0.18) + coneDn(-2.45, 0.18) + 'M0 -2.45', fill: BLK, stroke: '#ffffff', lw: 0.07 }); return { shapes: o, top: -3.0, w: 1.3 }; },
    special: () => { const o = [{ d: cyl(0.5, -1.3, -0.1), fill: YEL, shade: 0.5 }, { d: ell(0, -1.3, 0.5, 0.15), fill: shade(YEL, 0.3) }, { d: 'M0 -1.3L0 -1.7', stroke: '#444', lw: 0.06 }, { d: 'M-0.2 -1.7L0.2 -2.1M0.2 -1.7L-0.2 -2.1', stroke: YEL, lw: 0.11 }, { d: 'M-0.2 -1.7L0.2 -2.1M0.2 -1.7L-0.2 -2.1', stroke: 'rgba(0,0,0,0.25)', lw: 0.02 }]; return { shapes: o, top: -2.2, w: 1.1 }; },
    swim: () => { const o = [{ d: circ(0, -0.35, 0.38), fill: { rad: [-0.12, -0.5, 0.5], stops: [[0, '#fff3a0'], [0.5, YEL], [1, '#c99a00']] } }, { d: 'M-0.3 -0.32A0.38 0.12 0 0 0 0.3 -0.32', stroke: 'rgba(0,0,0,0.25)', lw: 0.03, fill: 'none' }]; return { shapes: o, top: -0.75, w: 0.8 }; },
    isolated: () => { const o = []; pillar([BLK, RED, BLK], o, -1.9); o.push({ d: 'M0 -1.9L0 -2.15', stroke: '#333', lw: 0.05 }, { d: circ(0, -2.3, 0.15) + circ(0, -2.65, 0.15), fill: BLK }); return { shapes: o, top: -2.9, w: 1.3 }; },
    safe: () => { const o = [{ d: 'M-0.6 -0.2A0.6 0.5 0 0 1 0.6 -0.2A0.6 0.18 0 0 1 -0.6 -0.2Z', fill: WHT, shade: 0.6 }];
      o.push({ d: 'M-0.6 -0.2A0.6 0.5 0 0 1 -0.25 -0.62L-0.2 -0.07A0.6 0.18 0 0 1 -0.6 -0.2Z', fill: RED }, { d: 'M0.15 -0.69A0.6 0.5 0 0 1 0.45 -0.55L0.45 -0.1A0.6 0.18 0 0 1 0.15 -0.03Z', fill: RED });
      o.push({ d: 'M0 -0.7L0 -1.1', stroke: '#444', lw: 0.06 }, { d: circ(0, -1.25, 0.17), fill: RED }); return { shapes: o, top: -1.5, w: 1.2 }; },
    'mark-orange': () => { const o = [{ d: cyl(0.65, -1.7, -0.1, null, 0.22), fill: '#ff7a1a', shade: 0.65 }, { d: ell(0, -1.7, 0.65, 0.22), fill: '#ffa45c' }, { d: band(0.66, -0.7, 0.66, -0.5), fill: 'rgba(255,255,255,0.85)' }]; return { shapes: o, top: -1.9, w: 1.4 }; },
    'mark-yellow': () => { const o = [{ d: 'M-0.95 -0.05L0.15 0.32L0 -2.0Z', fill: '#ffd21f' }, { d: 'M0.15 0.32L0.95 -0.08L0 -2.0Z', fill: '#d9a800' }, { d: 'M-0.95 -0.05L0.15 0.32L0.95 -0.08', stroke: 'rgba(0,0,0,0.2)', lw: 0.04, fill: 'none' }, { d: 'M-0.6 -0.65L0.12 -0.42L0.62 -0.68', stroke: 'rgba(255,255,255,0.8)', lw: 0.12, fill: 'none' }]; return { shapes: o, top: -2.1, w: 1.9 }; },
    pin: () => { const o = [{ d: circ(0, -0.32, 0.36), fill: { rad: [-0.12, -0.45, 0.5], stops: [[0, '#ffc08a'], [0.5, '#ff7a1a'], [1, '#c24d00']] } }, { d: 'M0 -0.6L0 -2.4', stroke: '#3a3f48', lw: 0.06 }]; return { shapes: o, top: -2.4, w: 0.8, flag: '#ff7a1a' }; },
  };
  BUOYS.orange = BUOYS['mark-orange']; BUOYS.yellow = BUOYS['mark-yellow']; BUOYS.gate = BUOYS['mark-orange'];
  BUOYS.finish = () => { const b = BUOYS.pin(); b.shapes[0].fill = { rad: [-0.12, -0.45, 0.5], stops: [[0, '#9bd3ff'], [0.5, '#1a7fd4'], [1, '#0d4a80']] }; b.flag = '#1a7fd4'; return b; };
  const buoyDefCache = {};
  function buoyDef(kind) { if (!buoyDefCache[kind]) buoyDefCache[kind] = (BUOYS[kind] || BUOYS.special)(); return buoyDefCache[kind]; }

  const buoySpriteCache = new Map();
  function buoySprite(kind, ppm) {
    if (!P2D) return null;
    let b = Math.pow(2, Math.ceil(Math.log2(Math.max(8, ppm)))); b = Math.min(b, 128);
    const key = kind + '|' + b; let s = buoySpriteCache.get(key); if (s) return s;
    const def = buoyDef(kind), x0 = -1.2, y0 = def.top - 0.3, w = 2.4, h = -y0 + 0.5;
    const cv = makeCanvas(w * b, h * b), ctx = cv.getContext('2d');
    ctx.setTransform(b, 0, 0, b, -x0 * b, -y0 * b);
    paintShapes(ctx, def.shapes);
    s = { canvas: cv, x0, y0, w, h };
    buoySpriteCache.set(key, s); return s;
  }

  // light characters: "Fl G 3s", "Fl(2) R 6s", "Q", "VQ(3) 5s", "Iso R 2s", "Oc", "F", "LFl"
  function parseLight(str) {
    if (!str) return null;
    if (typeof str === 'object') return str;
    const s = String(str);
    const col = (s.match(/\b(R|G|W|Y)\b/) || [])[1] || 'W';
    const per = parseFloat((s.match(/([\d.]+)\s*s/) || [])[1]) || 0;
    const grp = parseInt((s.match(/\((\d+)\)/) || [])[1], 10) || 1;
    let kind = 'Fl';
    if (/VQ/.test(s)) kind = 'VQ'; else if (/\bQ/.test(s)) kind = 'Q'; else if (/Iso/.test(s)) kind = 'Iso'; else if (/Oc/.test(s)) kind = 'Oc'; else if (/LFl/.test(s)) kind = 'LFl'; else if (/^F\b|\bF\b/.test(s) && !/Fl/.test(s)) kind = 'F';
    return { col, per: per || (kind === 'Q' ? 1 : kind === 'VQ' ? 0.5 : 3), grp: /\(/.test(s) ? grp : 1, kind, cont: kind === 'Q' || kind === 'VQ' ? !/\(/.test(s) : false, str: s };
  }
  const LIGHT_COL = { R: '#ff3b3b', G: '#33ff7a', W: '#fffbe0', Y: '#ffd400' };
  function lightLevel(L, t) {
    if (!L) return 0;
    const P = L.per;
    if (L.kind === 'F') return 1;
    if (L.kind === 'Iso') return (t % P) < P / 2 ? 1 : 0;
    if (L.kind === 'Oc') return (t % P) < P * 0.75 ? 1 : 0;
    if ((L.kind === 'Q' || L.kind === 'VQ') && L.cont) { const q = L.kind === 'Q' ? 1 : 0.5; return (t % q) < q * 0.35 ? 1 : 0; }
    const ph = t % P, q = L.kind === 'Q' ? 1 : L.kind === 'VQ' ? 0.5 : 0.9, on = L.kind === 'LFl' ? 2 : L.kind === 'Fl' ? 0.35 : q * 0.35;
    for (let i = 0; i < L.grp; i++) { const s = i * q; if (ph >= s && ph < s + on) return 1; }
    return 0;
  }

  // drawBuoy: ctx in world meters; draws upright (counter-rotates camera rot).
  function drawBuoy(ctx, kind, x, y, opts) {
    opts = opts || {};
    const t = opts.t || 0, ppm = opts.ppm || 20, sc = opts.scale || 1.5;
    const def = buoyDef(kind);
    const ph = (x * 0.37 + y * 0.71) % 6.28;
    const bob = Math.sin(t * 1.9 + ph) * 0.06, tilt = Math.sin(t * 1.3 + ph * 1.7) * 0.07;
    ctx.save(); ctx.translate(x, y); if (opts.rot) ctx.rotate(-opts.rot); ctx.scale(sc, sc);
    // water ring + shadow
    ctx.fillStyle = 'rgba(0,25,60,0.22)'; ctx.beginPath(); ctx.ellipse(0.35, 0.18, def.w * 0.55, def.w * 0.22, 0, 0, TAU); ctx.fill();
    const fr = 0.5 + 0.5 * Math.sin(t * 2.4 + ph);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.3 * fr) + ')'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.ellipse(0, 0, def.w * (0.55 + 0.08 * fr), def.w * (0.2 + 0.03 * fr), 0, 0, TAU); ctx.stroke();
    ctx.translate(0, bob); ctx.rotate(tilt);
    const s = buoySprite(kind, ppm * sc);
    if (s) ctx.drawImage(s.canvas, s.x0, s.y0, s.w, s.h); else paintShapes(ctx, def.shapes);
    if (def.flag) { // side-view flag streaming downwind
      const dir = opts.windDir != null ? (Math.sin(opts.windDir + PI - (opts.rot || 0)) >= 0 ? 1 : -1) : 1;
      ctx.beginPath(); ctx.moveTo(0, -2.4);
      for (let i = 1; i <= 6; i++) { const u = i / 6; ctx.lineTo(dir * u * 0.95, -2.4 + Math.sin(u * 5 - t * 8) * 0.07 * u + u * 0.04); }
      for (let i = 6; i >= 0; i--) { const u = i / 6; ctx.lineTo(dir * u * 0.95, -1.95 + Math.sin(u * 5 - t * 8 + 0.4) * 0.07 * u - u * 0.04); }
      ctx.closePath(); ctx.fillStyle = def.flag; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.03; ctx.stroke();
    }
    const L = parseLight(opts.light);
    if (L) {
      const lv = lightLevel(L, t + (ph % 1.3));
      if (lv > 0) {
        const night = opts.night || 0, r = 0.6 + night * 2.4;
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(0, def.top, 0, 0, def.top, r);
        const c = LIGHT_COL[L.col] || LIGHT_COL.W;
        gr.addColorStop(0, rgba(c, 0.95)); gr.addColorStop(0.25, rgba(c, 0.55 + night * 0.3)); gr.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, def.top, r, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, def.top, 0.09, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // race marks: {x, y, kind: 'orange'|'yellow'|'pin'|'committee'|'gate'|'finish'}
  function drawMark(ctx, m, opts) {
    opts = opts || {};
    if (m.kind === 'committee') return drawCommittee(ctx, m.x, m.y, m.heading != null ? m.heading : opts.windDir || 0, opts);
    const kind = { orange: 'mark-orange', yellow: 'mark-yellow', gate: 'mark-orange', pin: 'pin', finish: 'finish' }[m.kind] || m.kind || 'mark-orange';
    drawBuoy(ctx, kind, m.x, m.y, Object.assign({}, opts, { scale: (opts.scale || 1.5) * (kind === 'pin' || kind === 'finish' ? 1 : 1.1) }));
  }

  // committee boat (top view, anchored head to wind), with flags streaming downwind
  function drawCommittee(ctx, x, y, heading, opts) {
    const t = opts.t || 0, L = 9, B = 3.1;
    const g = { L, B, bowW: 0, pb: 0.55, maxAt: 0.55, sternW: 0.85, bowArc: 0.02, sternArc: 0.02 };
    const yaw = Math.sin(t * 0.3 + x) * 0.06;
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading + yaw);
    const hull = path2d(outlineD(g, 0));
    ctx.save(); ctx.translate(0.4, 0.6); ctx.fillStyle = 'rgba(0,25,60,0.22)'; ctx.fill(hull); ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.fill(hull); ctx.strokeStyle = '#1c3f7a'; ctx.lineWidth = 0.18; ctx.stroke(path2d(outlineD(g, 0.08)));
    ctx.fillStyle = '#eef1f5'; ctx.fill(path2d(outlineD(g, 0.3)));
    ctx.fillStyle = '#d5dbe3'; ctx.strokeStyle = '#9aa3ae'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-1.0, -1.6, 2.0, 3.2, 0.5) : ctx.rect(-1, -1.6, 2, 3.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(60,100,140,0.6)'; ctx.fillRect(-0.85, -1.45, 1.7, 0.5);
    // anchor line forward
    ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 0.05; ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.moveTo(0, -L / 2); ctx.lineTo(0, -L / 2 - 4); ctx.stroke(); ctx.setLineDash([]);
    // flag mast at stern
    const mx = 0, my = 2.6;
    ctx.fillStyle = '#5b6470'; ctx.beginPath(); ctx.arc(mx, my, 0.14, 0, TAU); ctx.fill();
    ctx.restore();
    // flags in world space streaming downwind
    const wd = (opts.windDir || 0) + PI;
    const mxw = x + Math.cos(heading) * mx - Math.sin(heading) * my, myw = y + Math.sin(heading) * mx + Math.cos(heading) * my;
    const flags = opts.flags || ['#ff7a1a', '#1a7fd4'];
    flags.forEach((col, i) => drawFlag(ctx, mxw + i * 0.15, myw + i * 0.15, wd + (i - 0.5) * 0.25, col, t + i * 0.7, 1.6, i === 1 ? 'P' : null));
  }
  function drawFlag(ctx, x, y, dir, col, t, len, pattern) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir); // flag extends along +y (dir = heading convention: 0 north)
    // rotate so flag extends towards dir: dir heading → vector (sin, -cos); our local +y should map to that → rotate(dir+PI)
    ctx.rotate(PI);
    const N = 8, w = len * 0.65;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const s = i / N, wave = Math.sin(s * 6 - t * 9) * 0.12 * s; i ? ctx.lineTo(-w / 2 + wave, -s * len) : ctx.moveTo(-w / 2 + wave, 0); }
    for (let i = N; i >= 0; i--) { const s = i / N, wave = Math.sin(s * 6 - t * 9) * 0.12 * s; ctx.lineTo(w / 2 + wave, -s * len); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.04; ctx.stroke();
    if (pattern === 'P') { ctx.fillStyle = '#fff'; ctx.fillRect(-w * 0.22, -len * 0.7, w * 0.44, len * 0.4); }
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------
  // SVG strings for DOM use
  function boatSvg(clsId, o) {
    o = o || {}; const g = geo(clsId), bd = hullBounds(g);
    return shapesToSvg(hullShapes(clsId, o.colors, o.sailNo), [f3(bd.x0), f3(bd.y0), f3(bd.w), f3(bd.h)], o.attrs || '');
  }
  function buoySvg(kind, o) { const def = buoyDef(kind); const sh = def.flag ? def.shapes.concat([{ d: 'M0 -2.4L0.95 -2.17L0 -1.95Z', fill: def.flag, stroke: 'rgba(0,0,0,.3)', lw: 0.03 }]) : def.shapes; return shapesToSvg(sh, [-1.2, f3(def.top - 0.3), 2.4, f3(-def.top + 0.8)], (o && o.attrs) || ''); }
  function markSvg(kind, o) { return buoySvg({ orange: 'mark-orange', yellow: 'mark-yellow', gate: 'mark-orange' }[kind] || kind, o); }
  function ribSvg(o) { return boatSvg('rib', o); }

  // Side-view boat card
  function boatCard(clsId, o) {
    o = o || {}; clsId = typeof clsId === 'string' ? clsId : (clsId && clsId.id) || 'opti';
    const g = geo(clsId), c = colorsOf(clsId, o.colors), W = 320, H = 240, wl = 188;
    gradId += 1; const P = 'bc' + gradId + '_';
    const L = g.L;
    const s = g.motor ? 200 / L : Math.min((120 + 14 * L) / L, 190 / g.mastH);
    const len = L * s, x0 = W / 2 - len / 2 + (g.motor ? 0 : 6), x1 = x0 + len;
    const fb = (g.keel ? 0.55 : g.motor ? 0.55 : 0.32) * s * (g.motor ? 1 : Math.min(1, 2.5 / L) + 0.25); // freeboard px
    const fbh = clsId === 'hboat' ? clamp(fb, 19, 36) : clamp(fb, 10, 36); // H-boat: room for 'KØS Sejlsport' on the side
    const deckY = wl - fbh;
    const parts = [], defs = [];
    defs.push('<linearGradient id="' + P + 'sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ec8f2"/><stop offset="1" stop-color="#1f6fb2"/></linearGradient>');
    defs.push('<linearGradient id="' + P + 'hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + shade(c.hull, 0.15) + '"/><stop offset="1" stop-color="' + shade(c.hull, -0.18) + '"/></linearGradient>');
    defs.push('<linearGradient id="' + P + 'sail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + shade(c.sail, -0.08) + '"/><stop offset="0.5" stop-color="' + c.sail + '"/><stop offset="1" stop-color="' + shade(c.sail, -0.14) + '"/></linearGradient>');
    const spc = g.spiColors || ['#ff7a3d', '#ffd23f', '#fff'];
    defs.push('<linearGradient id="' + P + 'spi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + spc[0] + '"/><stop offset="0.45" stop-color="' + spc[0] + '"/><stop offset="0.46" stop-color="' + spc[2] + '"/><stop offset="0.56" stop-color="' + spc[2] + '"/><stop offset="0.57" stop-color="' + spc[1] + '"/><stop offset="1" stop-color="' + shade(spc[1], -0.15) + '"/></linearGradient>');
    // underwater appendages (drawn first; water overlays them)
    const ap = [];
    if (g.keel) {
      if (clsId === 'hboat') ap.push('<path d="M' + f3(x0 + len * 0.3) + ' ' + wl + 'Q' + f3(x0 + len * 0.42) + ' ' + f3(wl + 46) + ' ' + f3(x0 + len * 0.62) + ' ' + f3(wl + 44) + 'L' + f3(x0 + len * 0.7) + ' ' + wl + 'Z" fill="#26364d"/>');
      else ap.push('<path d="M' + f3(x0 + len * 0.44) + ' ' + wl + 'L' + f3(x0 + len * 0.47) + ' ' + f3(wl + 40) + 'L' + f3(x0 + len * 0.53) + ' ' + f3(wl + 40) + 'L' + f3(x0 + len * 0.54) + ' ' + wl + 'Z" fill="#2b2f36"/><ellipse cx="' + f3(x0 + len * 0.5) + '" cy="' + f3(wl + 41) + '" rx="' + f3(len * 0.09) + '" ry="5" fill="#2b2f36"/>');
    } else if (!g.motor) ap.push('<path d="M' + f3(x0 + len * g.board) + ' ' + wl + 'l3 ' + f3(28 * Math.min(1, len / 150)) + 'h9l1 -' + f3(28 * Math.min(1, len / 150)) + 'z" fill="#f4f4f4" stroke="#8a929e"/>');
    if (!g.motor) ap.push('<path d="M' + f3(x1 - 4) + ' ' + f3(wl - 8) + 'l2 ' + f3(30 * Math.min(1, len / 140)) + 'h7l-2 -' + f3(30 * Math.min(1, len / 140)) + 'z" fill="#f4f4f4" stroke="#8a929e"/>');
    else ap.push('<path d="M' + f3(x1 - 2) + ' ' + f3(deckY - 16) + 'h16a6 6 0 0 1 6 6v14h-7v24h-6v-24h-9z" fill="#141619"/><rect x="' + f3(x1 + 2) + '" y="' + f3(deckY - 12) + '" width="6" height="10" rx="2" fill="#3a3f48"/>');
    // hull side profile
    let hullP;
    const bowRake = g.bowW > 0.3 ? len * 0.1 : len * 0.04;
    if (g.motor) {
      hullP = 'M' + f3(x0 + 10) + ' ' + f3(deckY + 6) + 'Q' + f3(x0 + len * 0.15) + ' ' + f3(wl + 10) + ' ' + f3(x0 + len * 0.4) + ' ' + f3(wl + 10) + 'L' + f3(x1) + ' ' + f3(wl + 6) + 'L' + f3(x1) + ' ' + f3(deckY + 8) + 'Z';
    } else {
      const bottomY = wl + (g.keel ? 10 : 6);
      hullP = 'M' + f3(x0) + ' ' + f3(deckY) + 'L' + f3(x1) + ' ' + f3(deckY + 2) + 'L' + f3(x1 - 3) + ' ' + f3(wl + 3) + 'Q' + f3(x0 + len * 0.5) + ' ' + f3(bottomY + 4) + ' ' + f3(x0 + bowRake) + ' ' + f3(wl - 2) + 'Z';
    }
    const rig = [];
    const mx = x0 + len * (g.mast || 0.3), mastTop = deckY - g.mastH * s * 0.95;
    if (!g.motor) {
      const boomY = deckY - Math.max(10, 0.75 * s), boomX = mx + g.boom * s;
      // spinnaker / gennaker flying
      if (g.spi && g.spi !== 'none') {
        const tackX = g.spi === 'sym' ? x0 - len * 0.12 : x0 - (g.bowsprit || 0.4) * s, tackY = g.spi === 'sym' ? deckY - 30 : deckY - 2;
        const headY = mastTop + (g.spi === 'sym' ? 4 : 12), clewX = mx + len * 0.08, clewY = deckY - 8;
        rig.push('<path d="M' + f3(mx - 2) + ' ' + f3(headY) + 'C' + f3(tackX - len * 0.55) + ' ' + f3(headY + 20) + ' ' + f3(tackX - len * 0.25) + ' ' + f3(tackY) + ' ' + f3(tackX) + ' ' + f3(tackY) + 'Q' + f3((tackX + clewX) / 2) + ' ' + f3(tackY - 18) + ' ' + f3(clewX) + ' ' + f3(clewY) + 'Q' + f3(mx - len * 0.12) + ' ' + f3((headY + clewY) / 2) + ' ' + f3(mx - 2) + ' ' + f3(headY) + 'Z" fill="url(#' + P + 'spi)" stroke="rgba(0,0,0,.25)"/>');
        if (g.bowsprit) rig.push('<line x1="' + f3(x0 + 4) + '" y1="' + f3(deckY + 1) + '" x2="' + f3(tackX) + '" y2="' + f3(tackY) + '" stroke="#2a2f3a" stroke-width="3" stroke-linecap="round"/>');
      }
      // main
      if (g.sprit) {
        const peakX = mx + g.boom * s * 0.95, peakY = mastTop + 6;
        rig.push('<path d="M' + f3(mx + 2) + ' ' + f3(boomY) + 'L' + f3(mx + 2) + ' ' + f3(mastTop + 2) + 'L' + f3(peakX) + ' ' + f3(peakY) + 'Q' + f3(boomX + 8) + ' ' + f3((peakY + boomY) / 2) + ' ' + f3(boomX) + ' ' + f3(boomY) + 'Z" fill="url(#' + P + 'sail)" stroke="' + shade(c.sail, -0.35) + '" stroke-width="1.2"/>');
        rig.push('<line x1="' + f3(mx + 2) + '" y1="' + f3(boomY - 6) + '" x2="' + f3(peakX) + '" y2="' + f3(peakY) + '" stroke="#b9824c" stroke-width="2.4" stroke-linecap="round"/>');
      } else {
        rig.push('<path d="M' + f3(mx + 2) + ' ' + f3(boomY) + 'L' + f3(mx + 2) + ' ' + f3(mastTop + 2) + (g.battens ? 'L' + f3(mx + 2 + g.boom * s * 0.25) + ' ' + f3(mastTop + 3) : '') + 'Q' + f3(boomX + g.boom * s * 0.18) + ' ' + f3((mastTop + boomY) / 2) + ' ' + f3(boomX) + ' ' + f3(boomY) + 'Z" fill="url(#' + P + 'sail)" stroke="' + shade(c.sail, -0.35) + '" stroke-width="1.2"' + (g.mylar ? ' fill-opacity=".92"' : '') + '/>');
        for (let i = 1; i <= (g.battens || 0); i++) { const f = i / ((g.battens || 0) + 1), yy = lerp(mastTop, boomY, f), xx = lerp(mx + 2 + g.boom * s * 0.25, boomX, f) + Math.sin(f * PI) * g.boom * s * 0.09; rig.push('<line x1="' + f3(xx - g.boom * s * 0.35 * (0.4 + f * 0.6)) + '" y1="' + f3(yy + 1) + '" x2="' + f3(xx) + '" y2="' + f3(yy) + '" stroke="rgba(40,50,70,.3)" stroke-width="1.2"/>'); }
      }
      // class insignia + sail number on main
      const sx = mx + g.boom * s * 0.38, sy = lerp(mastTop, boomY, 0.62), fs = clamp(g.boom * s * 0.2, 9, 20);
      if (clsId === 'j70' && !g.sprit) { // the club's J70 mains: red head panel with a big white X
        const hx0 = mx + 2, hy0 = mastTop + 2, hy1 = lerp(mastTop, boomY, 0.36), hx1 = lerp(mx + 2 + g.boom * s * 0.25, boomX, 0.36) + g.boom * s * 0.05;
        rig.push('<path d="M' + f3(hx0) + ' ' + f3(hy0) + 'L' + f3(mx + 2 + g.boom * s * 0.25) + ' ' + f3(mastTop + 3) + 'L' + f3(hx1) + ' ' + f3(hy1) + 'L' + f3(hx0) + ' ' + f3(hy1) + 'Z" fill="#e3262e"/>');
        rig.push('<path d="M' + f3(hx0 + 2) + ' ' + f3(hy0 + 3) + 'L' + f3(hx1 - 2) + ' ' + f3(hy1 - 2) + 'M' + f3(hx1 - 4) + ' ' + f3(hy0 + 6) + 'L' + f3(hx0 + 2) + ' ' + f3(hy1 - 2) + '" stroke="#fff" stroke-width="3"/>');
      }
      if (clsId === 'ilca') rig.push('<path d="M' + f3(boomX) + ' ' + f3(boomY) + 'l-' + f3(g.boom * s * 0.16) + ' 0l' + f3(g.boom * s * 0.1) + ' -' + f3(g.boom * s * 0.12) + 'z" fill="#1f5fbf"/>');
      const ins = { opti: '⛵', tera: 'T', feva: 'RS Feva', zest: 'Z', ilca: 'ILCA', '29er': '29er', hboat: 'H', j70: '' }[clsId] || '';
      const insCol = { feva: '#ff3d8b', '29er': '#e8402a', ilca: '#d8323c', hboat: '#d8323c' }[clsId] || c.trim;
      const noCol = { opti: '#1f5fbf', ilca: '#d8323c' }[clsId] || '#1d2a44';
      if (ins) rig.push('<text x="' + f3(sx) + '" y="' + f3(lerp(mastTop, boomY, 0.3)) + '" font-size="' + f3(fs * (ins.length > 4 ? 0.55 : ins.length > 2 ? 0.75 : 1)) + '" font-weight="900" text-anchor="middle" fill="' + insCol + '" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">' + ins + '</text>');
      if (o.sailNo != null) rig.push('<text x="' + f3(sx) + '" y="' + f3(sy) + '" font-size="' + f3(fs * 0.85) + '" font-weight="900" text-anchor="middle" fill="' + noCol + '" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">' + esc(String(o.sailNo).slice(0, 8)) + '</text>');
      // jib
      if (g.jib) {
        const tackX = x0 + len * g.jib + 2, headY = deckY - g.mastH * s * (g.L > 6 ? 0.8 : 0.72), clewX = tackX + (mx - tackX) * (g.jibLen || 1) * 1.05;
        rig.push('<path d="M' + f3(tackX) + ' ' + f3(deckY - 2) + 'L' + f3(mx - 1) + ' ' + f3(headY) + 'Q' + f3(clewX + 6) + ' ' + f3((headY + deckY) / 2) + ' ' + f3(clewX) + ' ' + f3(deckY - 5) + 'Z" fill="url(#' + P + 'sail)" stroke="' + shade(c.sail, -0.35) + '" stroke-width="1.1"/>');
      }
      rig.push('<line x1="' + f3(mx) + '" y1="' + f3(deckY) + '" x2="' + f3(mx) + '" y2="' + f3(mastTop) + '" stroke="' + (g.mastCol || '#5b6470') + '" stroke-width="' + (g.L > 6 ? 3.4 : 2.6) + '" stroke-linecap="round"/>');
      rig.push('<line x1="' + f3(mx) + '" y1="' + f3(boomY) + '" x2="' + f3(boomX) + '" y2="' + f3(boomY) + '" stroke="' + (g.boomCol || '#4a515c') + '" stroke-width="' + (g.L > 6 ? 3.4 : 2.6) + '" stroke-linecap="round"/>');
      if (g.L > 6) rig.push('<line x1="' + f3(x0 + len * 0.03) + '" y1="' + f3(deckY) + '" x2="' + f3(mx) + '" y2="' + f3(deckY - g.mastH * s * 0.82) + '" stroke="rgba(120,130,145,.8)" stroke-width="0.8"/><line x1="' + f3(x1 - 2) + '" y1="' + f3(deckY + 1) + '" x2="' + f3(mx) + '" y2="' + f3(mastTop) + '" stroke="rgba(120,130,145,.6)" stroke-width="0.8"/>');
    }
    // hull + details
    const hd = [];
    hd.push('<path d="' + hullP + '" fill="url(#' + P + 'hull)" stroke="' + shade(c.hull, -0.45) + '" stroke-width="1.2" stroke-linejoin="round"/>');
    // the club's H-boats: red topsides with 'KØS Sejlsport' along the side
    if (clsId === 'hboat') hd.push('<text x="' + f3(x0 + len * 0.5) + '" y="' + f3(deckY + fbh * 0.55) + '" font-size="' + f3(Math.max(8, fbh * 0.42)) + '" font-weight="900" text-anchor="middle" fill="#fff" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">KØS Sejlsport</text>');
    if (g.motor) {
      // orange tube with black strake, KØS box, console, rail
      const ty = deckY - 2, tr = 11;
      hd.push('<path d="M' + f3(x0 + tr) + ' ' + f3(ty - tr) + 'H' + f3(x1 - 2) + 'a' + tr + ' ' + tr + ' 0 0 1 0 ' + 2 * tr + 'H' + f3(x0 + tr) + 'a' + tr + ' ' + tr + ' 0 0 1 0 -' + 2 * tr + 'z" fill="#ff7a26" stroke="#b44406" stroke-width="1.2"/>');
      hd.push('<path d="M' + f3(x0 + tr) + ' ' + f3(ty - tr + 3) + 'H' + f3(x1 - 4) + '" stroke="#3a3d42" stroke-width="5" stroke-linecap="round"/>');
      hd.push('<path d="M' + f3(x0 + 4) + ' ' + f3(ty + 4) + 'H' + f3(x1) + '" stroke="#111" stroke-width="4.5" stroke-linecap="round"/>');
      for (let i = 0; i < 9; i++) { const xx = lerp(x0 + 24, x1 - 14, i / 8); hd.push('<path d="M' + f3(xx) + ' ' + f3(ty - 5) + 'q7 5 14 0" stroke="#1b1b1b" stroke-width="1" fill="none"/>'); }
      hd.push('<rect x="' + f3(x0 + 18) + '" y="' + f3(ty - 8) + '" width="34" height="15" rx="6" fill="#111"/><text x="' + f3(x0 + 35) + '" y="' + f3(ty + 3.5) + '" font-size="11" font-weight="900" text-anchor="middle" fill="#fff" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">KØS</text>');
      // centre console (bow is left, stern right): sloped forward face, windscreen raked aft, black dash on the
      // aft side, wheel on the AFT face seen edge-on (its rim faces the stern), helm standing behind it
      const cx = x0 + len * 0.47, cb = ty - tr, ct = cb - 24;
      hd.push('<path d="M' + f3(cx + 27) + ' ' + f3(cb) + 'v-16h12v16z" fill="#1d1f23"/>'); // jockey seat behind the helm
      hd.push('<path d="M' + f3(cx - 26) + ' ' + f3(cb) + 'v-20a6 6 0 0 1 6 -6h7" stroke="#d0d5db" stroke-width="2" fill="none"/>'); // stainless rail round the front
      hd.push('<path d="M' + f3(cx - 20) + ' ' + f3(cb) + 'L' + f3(cx - 12) + ' ' + f3(ct) + 'H' + f3(cx + 10) + 'V' + f3(cb) + 'z" fill="#ff8a3d" stroke="#a83a05"/>');
      hd.push('<path d="M' + f3(cx - 11) + ' ' + f3(ct) + 'L' + f3(cx - 6) + ' ' + f3(ct - 9) + 'H' + f3(cx + 2) + 'L' + f3(cx + 2) + ' ' + f3(ct) + 'z" fill="rgba(170,215,240,.85)" stroke="#c9d3dc"/>'); // windscreen
      hd.push('<path d="M' + f3(cx + 2) + ' ' + f3(ct) + 'L' + f3(cx + 10) + ' ' + f3(ct + 6) + 'V' + f3(ct) + 'z" fill="#1d1f23"/>'); // dash
      hd.push('<path d="M' + f3(cx + 10) + ' ' + f3(ct + 9) + 'l6 -3" stroke="#2a2d33" stroke-width="2.4" stroke-linecap="round"/>'); // wheel shaft
      hd.push('<ellipse cx="' + f3(cx + 16) + '" cy="' + f3(ct + 6) + '" rx="2" ry="8" transform="rotate(-25 ' + f3(cx + 16) + ' ' + f3(ct + 6) + ')" fill="none" stroke="#111" stroke-width="2.2"/>'); // wheel, edge-on
      // driver standing behind the wheel, hands on it
      hd.push(personSide(cx + 27, cb, '#ffd23f', SKIN[1], HAIR[0], true));
      hd.push('<path d="M' + f3(cx + 24) + ' ' + f3(cb - 18) + 'L' + f3(cx + 17) + ' ' + f3(ct + 4) + '" stroke="' + SKIN[1] + '" stroke-width="2.4" stroke-linecap="round"/>');
    } else {
      hd.push('<path d="M' + f3(x0 + 1) + ' ' + f3(deckY + 3) + 'L' + f3(x1 - 1) + ' ' + f3(deckY + 5) + '" stroke="' + c.trim + '" stroke-width="3" stroke-linecap="round"/>');
      if (g.cabin) { const cx0 = x0 + len * g.cabin[0], cx1 = x0 + len * g.cabin[1]; hd.push('<path d="M' + f3(cx0) + ' ' + f3(deckY) + 'L' + f3(cx0 + 10) + ' ' + f3(deckY - 9) + 'H' + f3(cx1) + 'V' + f3(deckY) + 'Z" fill="#eef1f4" stroke="#9aa1ab"/><rect x="' + f3(cx0 + 14) + '" y="' + f3(deckY - 7) + '" width="' + f3((cx1 - cx0) * 0.5) + '" height="3.5" rx="1.5" fill="#2a3442"/>'); hd.push('<path d="M' + f3(x0 + 4) + ' ' + f3(deckY - 7) + 'L' + f3(x1 - 4) + ' ' + f3(deckY - 6) + '" stroke="rgba(140,150,165,.8)" stroke-width="0.9"/>'); }
      if (g.wings) hd.push('<rect x="' + f3(x0 + len * g.wingS[0]) + '" y="' + f3(deckY - 3) + '" width="' + f3(len * (g.wingS[1] - g.wingS[0])) + '" height="4" rx="2" fill="#3b4250"/>');
      // crew heads
      g.crew.forEach((seat, i) => { const look = crewLook({ id: clsId }, i); hd.push(personSide(x0 + len * seat.s, deckY, look.jacket, SKIN[(i + 1) % 4], look.helmet, false, seat.role === 'trap')); });
    }
    const sea = '<path d="M0 ' + wl + ' Q 20 ' + (wl - 5) + ' 40 ' + wl + ' T 80 ' + wl + ' T 120 ' + wl + ' T 160 ' + wl + ' T 200 ' + wl + ' T 240 ' + wl + ' T 280 ' + wl + ' T 320 ' + wl + ' V ' + H + ' H 0 Z" fill="url(#' + P + 'sea)" opacity="0.88"/>' +
      '<path d="M' + f3(x0 - 12) + ' ' + f3(wl + 2) + 'q' + f3(len * 0.2) + ' -6 ' + f3(len * 0.4) + ' 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M30 ' + (wl + 22) + 'q10 -4 20 0M240 ' + (wl + 30) + 'q10 -4 20 0M150 ' + (wl + 40) + 'q8 -3 16 0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5" stroke-linecap="round"/>';
    const shadowEl = '<ellipse cx="' + f3(W / 2) + '" cy="' + f3(wl + 4) + '" rx="' + f3(len * 0.55) + '" ry="5" fill="rgba(0,30,70,.25)"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"' + (o.attrs || ' class="boat-card-svg"') + '><defs>' + defs.join('') + '</defs>' + ap.join('') + rig.join('') + shadowEl + hd.join('') + sea + '</svg>';
  }
  function personSide(x, deckY, jacket, skin, hair, standing, trap) {
    const by = deckY - (standing ? 22 : 8);
    return '<g>' + (trap ? '<line x1="' + f3(x) + '" y1="' + f3(by - 30) + '" x2="' + f3(x - 6) + '" y2="' + f3(by + 2) + '" stroke="#555" stroke-width=".8"/>' : '') +
      '<rect x="' + f3(x - 5) + '" y="' + f3(by) + '" width="10" height="' + (standing ? 16 : 10) + '" rx="4" fill="' + jacket + '" stroke="' + shade(jacket, -0.35) + '" stroke-width=".8"/>' +
      '<circle cx="' + f3(x) + '" cy="' + f3(by - 5) + '" r="5" fill="' + skin + '"/><path d="M' + f3(x - 5.2) + ' ' + f3(by - 5.5) + 'a5.2 5.2 0 0 1 10.4 0z" fill="' + hair + '"/></g>';
  }

  function sail(clsId, kind) { // side view of one sail as SVG (for rigging/menus)
    const g = geo(clsId); kind = kind || 'main';
    const c = colorsOf(clsId), cols = g.spiColors || ['#ff7a3d', '#ffd23f', '#fff'];
    gradId++; const id = 'sl' + gradId;
    let d;
    if (kind === 'spi') d = 'M50 8C10 30 8 90 20 150Q55 135 92 150Q100 70 50 8Z';
    else if (kind === 'jib') d = 'M20 150L60 10Q70 90 95 148Z';
    else if (g.sprit) d = 'M15 150L15 20L90 10Q85 80 95 150Z';
    else d = 'M20 150L20 6L34 8Q98 70 92 150Z';
    const fill = kind === 'spi' ? '<linearGradient id="' + id + '" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="' + cols[0] + '"/><stop offset=".5" stop-color="' + cols[0] + '"/><stop offset=".51" stop-color="' + cols[1] + '"/><stop offset="1" stop-color="' + cols[1] + '"/></linearGradient>' : '<linearGradient id="' + id + '" x1="0" x2="1"><stop offset="0" stop-color="' + shade(c.sail, -0.06) + '"/><stop offset="1" stop-color="' + shade(c.sail, -0.16) + '"/></linearGradient>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 160"><defs>' + fill + '</defs><path d="' + d + '" fill="url(#' + id + ')" stroke="#5b6470" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }

  // Avatar portrait. profile.avatar {skin, hair, jacket, hairStyle?} — indices or '#colors'
  function avatar(profile, o) {
    o = o || {};
    const a = (profile && (profile.avatar || profile)) || {};
    const pick = (v, pal, def) => (typeof v === 'string' && v[0] === '#' ? v : pal[(+v || 0) % pal.length] || def);
    const skin = pick(a.skin, SKIN, SKIN[0]), hair = pick(a.hair, HAIR, HAIR[1]), jacket = pick(a.jacket, JACKETS, JACKETS[0]);
    const NAMED = { short: 0, long: 1, bun: 2, curly: 3, cap: 4 };
    const style = a.style != null && NAMED[a.style] != null ? NAMED[a.style] : a.hairStyle != null ? +a.hairStyle : (typeof a.hair === 'number' ? a.hair : hashStr(hair)) % 4;
    gradId++; const P = 'av' + gradId;
    const hairBack = [
      '<path d="M30 58Q28 22 64 20Q100 22 98 58Q96 40 64 38Q32 40 30 58Z" fill="' + hair + '"/>',
      '<path d="M28 62Q24 18 64 18Q104 18 100 62L100 92Q92 70 92 52Q64 44 36 52Q36 70 28 92Z" fill="' + hair + '"/>',
      '<path d="M30 58Q28 22 64 20Q100 22 98 58Q96 40 64 38Q32 40 30 58Z" fill="' + hair + '"/><circle cx="64" cy="16" r="10" fill="' + hair + '"/>',
      '<path d="M30 60Q26 20 64 19Q102 20 98 60Q92 36 70 36Q72 46 56 44Q40 42 30 60Z" fill="' + hair + '"/><path d="M96 50Q112 62 104 84" stroke="' + hair + '" stroke-width="9" fill="none" stroke-linecap="round"/>',
      '<path d="M30 60Q26 22 64 20Q102 22 98 60Q96 46 92 44H36Q32 46 30 60Z" fill="' + hair + '"/><path d="M32 46Q32 18 64 17Q96 18 96 46Z" fill="#ff7a3d" stroke="#c2541c" stroke-width="2"/><path d="M60 44Q88 40 110 50Q92 56 62 52Z" fill="#e8662a"/><text x="64" y="38" font-size="11" font-weight="900" text-anchor="middle" fill="#fff" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">KØS</text>',
    ][style % 5];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"' + (o.attrs || ' class="avatar-svg"') + '><defs><radialGradient id="' + P + 'bg" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#7fd3ff"/><stop offset="1" stop-color="#2b6cb0"/></radialGradient><clipPath id="' + P + 'c"><circle cx="64" cy="64" r="62"/></clipPath></defs>' +
      '<g clip-path="url(#' + P + 'c)"><rect width="128" height="128" fill="url(#' + P + 'bg)"/>' +
      '<path d="M0 104Q16 98 32 104T64 104T96 104T128 104V128H0Z" fill="rgba(255,255,255,.18)"/>' +
      '<path d="M22 128Q24 92 64 90Q104 92 106 128Z" fill="' + jacket + '" stroke="' + shade(jacket, -0.35) + '" stroke-width="2"/>' +
      '<path d="M50 92L52 128M78 92L76 128" stroke="' + shade(jacket, -0.25) + '" stroke-width="3"/><rect x="44" y="108" width="40" height="7" rx="3" fill="#1d2a44"/><rect x="59" y="106" width="10" height="11" rx="2" fill="#c9d3dc"/>' +
      '<path d="M54 84h20v10q-10 6 -20 0z" fill="' + shade(skin, -0.12) + '"/>' +
      '<circle cx="64" cy="58" r="30" fill="' + skin + '"/>' + hairBack +
      '<circle cx="53" cy="60" r="3.6" fill="#1d2433"/><circle cx="75" cy="60" r="3.6" fill="#1d2433"/><circle cx="54.3" cy="58.7" r="1.2" fill="#fff"/><circle cx="76.3" cy="58.7" r="1.2" fill="#fff"/>' +
      '<circle cx="46" cy="69" r="5" fill="#ff8a8a" opacity=".45"/><circle cx="82" cy="69" r="5" fill="#ff8a8a" opacity=".45"/>' +
      '<path d="M55 72Q64 80 73 72" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
      '<circle cx="64" cy="64" r="62" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="3"/></svg>';
  }

  const ICONS = {
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    compass: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5l3 7h-6z" fill="#e8323c"/><path d="M12 19l-3-7h6z" fill="currentColor"/>',
    anchor: '<circle cx="12" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v13M7 11h10M4 13a8 8 0 0 0 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    buoy: '<path d="M8 20h8l-1-9H9z" fill="#e8323c"/><path d="M12 11V6" stroke="currentColor" stroke-width="2"/><rect x="9.5" y="3" width="5" height="4" fill="#e8323c"/><path d="M4 21q4-2 8 0t8 0" stroke="currentColor" fill="none" stroke-width="1.5"/>',
    boat: '<path d="M12 2v14M12 3l7 12h-7zM11 5L5 15h6z" fill="currentColor"/><path d="M3 17h18l-3 4H6z" fill="currentColor"/>',
    flag: '<path d="M5 21V3M5 4h12l-3 4 3 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    star: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" fill="#ffd25e" stroke="#c98a00"/>',
    trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0zM7 5H3q0 5 4 5M17 5h4q0 5-4 5M12 13v4M8 21h8l-1-4H9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    rope: '<path d="M4 18c4-8 12 4 16-6M6 6c3 0 5 3 3 6s-6 1-4-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    rib: '<path d="M2 15h16a4 4 0 0 0 4-4H6z" fill="#ff7a26"/><path d="M2 15h16" stroke="#111" stroke-width="2"/><rect x="11" y="7" width="4" height="4" fill="currentColor"/>',
  };
  function icon(name, o) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + ((o && o.size) || 24) + '" height="' + ((o && o.size) || 24) + '">' + (ICONS[name] || ICONS.boat) + '</svg>'; }

  KOS.Sprites = {
    GEO, CLASS_IDS, geo, halfW, colorsOf, outlineD,
    boat: boatSvg, rib: ribSvg, buoy: buoySvg, mark: markSvg, sail, boatCard, avatar, icon,
    drawBoat, drawBuoy, drawMark, drawCommittee, drawFlag, drawSailor,
    hullSprite, buoySprite, parseLight, lightLevel, buoyKinds: Object.keys(BUOYS),
    shapesToSvg, paintShapes, shade, rgba, palettes: { JACKETS, HAIR, SKIN, HELMETS },
    clearCache() { hullCache.clear(); buoySpriteCache.clear(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
