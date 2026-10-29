// KØS SEJL — js/render/xmasart.js
// KOS.XmasArt: the Christmas calendar's inline SVG kit (issue #6, docs/superpowers/specs/2026-10-29-christmas-calendar-design.md).
// Used by the calendar screen (js/ui/xmas.js), the hub pin/decorations (js/ui/hub.js) and the coach portraits (Santa hat).
// Everything returns a static SVG string: no SMIL, no filters, no gradient ids (the hub map must stay cheap, and the
// same sprite can appear many times on one page without id clashes). Animation, if any, is the caller's CSS.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const OUT = '#1b2540';                                   // the soft navy outline shared by all sprites

  // ---- elves. 24 nisser, one per door; variant = door - 1. Pose cycles peek/wave/sit, cap shade and jacket cycle
  // on other periods, and each has one accessory, so no two neighbours look alike. Girls (by name) get braids instead
  // of a beard: 1 Frida, 3 Rikke, 5 Sofie, 7 Julie, 9 Vera, 11 Klara, 12 Lucia-Lea, 14 Vilma, 16 Kamma, 18 Signe, 21 Ronja.
  const POSES = ['peek', 'wave', 'sit'];
  const CAPS = ['#d9302c', '#c41f35', '#e5492c', '#b8203f'];
  const JACKETS = ['#24396b', '#1f5c45', '#3a2f6b'];
  const VESTS = ['#ff7a1a', '#ffc21a'];
  const HAIR = ['#e8c46a', '#b9773d', '#d99a4a', '#8a5532'];
  const GIRLS = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 11: 1, 12: 1, 14: 1, 16: 1, 18: 1, 21: 1 };
  const ACC = ['rope', 'scarf', 'rope', 'holly', 'none', 'flag', 'scarf', 'bell', 'none', 'scarf', 'holly', 'bell',
    'candles', 'flag', 'scarf', 'holly', 'rope', 'none', 'flag', 'rope', 'bell', 'scarf', 'holly', 'star'];

  // p = palette. The grey silhouette reuses the same shapes with every colour set to one grey.
  function palette(v) {
    return { cap: CAPS[v % 4], trim: '#fbfbf7', skin: '#f6c9a6', cheek: '#ff8f84', beard: '#fbfbf7', eye: '#2a1c18', nose: '#e88d78',
      jacket: JACKETS[v % 3], vest: VESTS[(v >> 2) % 2], strap: '#2a2f3d', leg: '#3a4152', boot: '#5a3420', mitt: v % 2 ? '#2f9a54' : '#e0392e',
      hair: HAIR[v % 4], wood: '#b07a45', woodD: '#7a4f28', snow: '#eef4fb', line: OUT, sil: false };
  }
  function silPalette() {
    const g = '#58627a', o = '#3c455a', p = {};
    ['cap', 'trim', 'skin', 'cheek', 'beard', 'eye', 'nose', 'jacket', 'vest', 'strap', 'leg', 'boot', 'mitt', 'hair', 'wood', 'woodD', 'snow'].forEach(k => (p[k] = g));
    p.line = o; p.sil = true; return p;
  }

  // the cap: a floppy point bending to the right, white fur trim, pompom (or a bell / star on the tip)
  function cap(p, acc) {
    if (acc === 'candles') {                               // Lucia: green wreath crown with three lit candles
      return '<path d="M-10-5q10-5 20 0l-1 3q-9-4-18 0z" fill="' + (p.sil ? p.cap : '#2f8a45') + '" stroke="' + p.line + '" stroke-width="1"/>' +
        [-6, 0, 6].map(x => '<rect x="' + (x - 1.4) + '" y="' + (x ? -13 : -15) + '" width="2.8" height="' + (x ? 8 : 10) + '" rx=".8" fill="' + p.trim + '" stroke="' + p.line + '" stroke-width=".8"/>' +
          (p.sil ? '' : '<path d="M' + x + ' ' + (x ? -18 : -20) + 'q2 2.6 0 4.4q-2-1.8 0-4.4z" fill="#ffc63a"/>')).join('') +
        (p.sil ? '' : '<circle cx="-8" cy="-5" r="1.2" fill="#e0392e"/><circle cx="8" cy="-5" r="1.2" fill="#e0392e"/>');
    }
    let tip = '<circle cx="14" cy="-21" r="3.4" fill="' + p.trim + '" stroke="' + p.line + '" stroke-width="1"/>';
    if (acc === 'bell') tip = '<path d="M11.4-19.5q.2-4.6 2.6-4.6t2.6 4.6l1 .9h-7.2z" fill="' + (p.sil ? p.trim : '#f4c542') + '" stroke="' + p.line + '" stroke-width="1"/><circle cx="14" cy="-18" r="1" fill="' + p.line + '"/>';
    if (acc === 'star') tip = star(14, -21, 5.2, 2.2, p.sil ? p.trim : '#ffd23f', p.line);
    return '<path d="M-10-4q0-13 9-19q9-6 15 2q-5-1-7 3q-1 6 3 14z" fill="' + p.cap + '" stroke="' + p.line + '" stroke-width="1.2" stroke-linejoin="round"/>' +
      (p.sil ? '' : '<path d="M-6-10q2-8 8-11" stroke="rgba(255,255,255,.25)" stroke-width="1.6" fill="none" stroke-linecap="round"/>') +
      '<rect x="-11.5" y="-7" width="23.5" height="5.6" rx="2.8" fill="' + p.trim + '" stroke="' + p.line + '" stroke-width="1.1"/>' + tip +
      (acc === 'holly' && !p.sil ? '<path d="M-7-6.5q-4-3-6 0q3 0 2 2.6q3-.4 4-2.6zM-7-6.5q2-4.6 5.4-3q-2.4 1-1 3.4q-2.2-1.4-4.4-.4z" fill="#2f8a45" stroke="#1d5a2c" stroke-width=".5"/><circle cx="-6.6" cy="-5.4" r="1.2" fill="#e0392e"/>' : '');
  }

  // head: face, braids or beard, eyes, cheeks, nose. Centre (0,1), radius 8.
  function head(p, v, acc) {
    const girl = GIRLS[v];
    let s = '';
    if (girl) s += '<path d="M-8.5 0q-3.5 6-1.5 13M8.5 0q3.5 6 1.5 13" stroke="' + p.line + '" stroke-width="5.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M-8.5 0q-3.5 6-1.5 13M8.5 0q3.5 6 1.5 13" stroke="' + p.hair + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      (p.sil ? '' : '<circle cx="-10" cy="12.6" r="1.4" fill="' + p.cap + '"/><circle cx="10" cy="12.6" r="1.4" fill="' + p.cap + '"/>');
    s += '<circle cx="0" cy="1" r="8" fill="' + p.skin + '" stroke="' + p.line + '" stroke-width="1.2"/>';
    if (girl) s += '<path d="M-7.6-1q3 2.4 7.6 0q4.6 2.4 7.6 0v-2h-15.2z" fill="' + p.hair + '"/>';
    if (acc === 'scarf') s += '<path d="M-7.5 7.5q7.5 4 15 0l.6 3.4q-8 4-16.2 0z" fill="' + (p.sil ? p.cap : '#e0392e') + '" stroke="' + p.line + '" stroke-width="1"/>' +
      (p.sil ? '' : '<path d="M-4 9.6v2.6M0 10.4v2.6M4 9.6v2.6" stroke="#fff" stroke-width="1.3"/>');
    if (p.sil) return s;
    s += '<circle cx="-3.1" cy="1.2" r="1.35" fill="' + p.eye + '"/><circle cx="3.1" cy="1.2" r="1.35" fill="' + p.eye + '"/>' +
      '<circle cx="-2.7" cy=".7" r=".45" fill="#fff"/><circle cx="3.5" cy=".7" r=".45" fill="#fff"/>' +
      '<ellipse cx="-5.2" cy="4.2" rx="1.9" ry="1.2" fill="' + p.cheek + '" opacity=".6"/><ellipse cx="5.2" cy="4.2" rx="1.9" ry="1.2" fill="' + p.cheek + '" opacity=".6"/>';
    if (!girl) s += '<path d="M-7.2 3.6q-1 9 7.2 10.6q8.2-1.6 7.2-10.6q-3.4 2.6-7.2 1.8q-3.8.8-7.2-1.8z" fill="' + p.beard + '" stroke="' + p.line + '" stroke-width="1"/>' +
      '<path d="M-2.4 6.6q2.4 1.4 4.8 0" stroke="#c9ccd4" stroke-width=".9" fill="none" stroke-linecap="round"/>';
    else s += '<path d="M-2.2 5.6q2.2 2 4.4 0" stroke="#7a2d22" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
    s += '<circle cx="0" cy="3.6" r="1.7" fill="' + p.nose + '"/>';
    return s;
  }

  // jacket + life vest torso, shoulders at y 9
  function torso(p, y) {
    return '<path d="M-8 ' + (y + 13) + 'v-7q0-6 8-6t8 6v7z" fill="' + p.jacket + '" stroke="' + p.line + '" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M-6.4 ' + (y + 2) + 'q2.4-1.6 4.6-1.4v11.6h-4.6zM6.4 ' + (y + 2) + 'q-2.4-1.6-4.6-1.4v11.6h4.6z" fill="' + p.vest + '" stroke="' + p.line + '" stroke-width=".9"/>' +
      '<path d="M-6.4 ' + (y + 8) + 'h12.8" stroke="' + p.strap + '" stroke-width="1.3"/>';
  }
  const mitt = (p, x, y) => '<circle cx="' + x + '" cy="' + y + '" r="2.5" fill="' + p.mitt + '" stroke="' + p.line + '" stroke-width="1"/>';
  const arm = (p, d) => '<path d="' + d + '" stroke="' + p.line + '" stroke-width="4.6" fill="none" stroke-linecap="round"/><path d="' + d + '" stroke="' + p.jacket + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>';

  // things held in the free hand (wave/sit only)
  function held(p, acc, x, y) {
    if (p.sil) return '';
    if (acc === 'flag') return '<path d="M' + x + ' ' + (y + 2) + 'v-15" stroke="#7a4f28" stroke-width="1.2"/><path d="M' + x + ' ' + (y - 13) + 'l9 2.6-9 2.6z" fill="#e0392e" stroke="' + p.line + '" stroke-width=".8"/>';
    if (acc === 'rope') return '<ellipse cx="' + x + '" cy="' + (y + 3.4) + '" rx="4" ry="3" fill="none" stroke="#d6b06a" stroke-width="1.8"/><ellipse cx="' + x + '" cy="' + (y + 3.4) + '" rx="2.2" ry="1.6" fill="none" stroke="#b88d48" stroke-width="1.2"/>';
    return '';
  }

  function elfBody(v, p) {
    const pose = POSES[v % 3], acc = ACC[v] || 'none';
    let s = '';
    if (pose === 'peek') {
      // just the head and two mittens over the edge of a snowy plank (it reads as "hiding" anywhere in a harbour)
      s += cap(p, acc) + head(p, v, acc) +
        '<rect x="-15" y="11" width="30" height="7" rx="2" fill="' + p.wood + '" stroke="' + p.line + '" stroke-width="1.2"/>' +
        '<path d="M-12 14.5h7M2 14.5h9" stroke="' + p.woodD + '" stroke-width="1" stroke-linecap="round"/>' +
        '<path d="M-15 12.4q3-3.4 7-1.4q4-2.2 8 0q4-2.2 8 0q4-2 7 1.4v-.6q0-1.8-2-1.8h-26q-2 0-2 1.8z" fill="' + p.snow + '"/>' +
        mitt(p, -8.6, 10.6) + mitt(p, 8.6, 10.6);
    } else if (pose === 'wave') {
      s += '<path d="M-4 21v5M4 21v5" stroke="' + p.line + '" stroke-width="5" stroke-linecap="round"/><path d="M-4 21v5M4 21v5" stroke="' + p.leg + '" stroke-width="3.2" stroke-linecap="round"/>' +
        '<ellipse cx="-4.6" cy="27" rx="3.4" ry="2" fill="' + p.boot + '" stroke="' + p.line + '" stroke-width="1"/><ellipse cx="4.6" cy="27" rx="3.4" ry="2" fill="' + p.boot + '" stroke="' + p.line + '" stroke-width="1"/>' +
        torso(p, 9) + arm(p, 'M-6.5 12q-4 3-5 7.5') + held(p, acc, -11.5, 20) + mitt(p, -11.5, 20) +
        arm(p, 'M6.5 12q5-1 7.5-6.5') + mitt(p, 14.4, 4.8) +
        (p.sil ? '' : '<path d="M17.4 1.4q1.6 1.6 1.4 3.8M18.6-1q2.6 2.6 2.2 6.2" stroke="#fff" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>') +
        cap(p, acc) + head(p, v, acc);
    } else {
      // sitting, legs forward, boots towards us, hands on the knees (one holds the accessory)
      s += torso(p, 11) +
        '<path d="M-5 23q-3 2-6 5M5 23q3 2 6 5" stroke="' + p.line + '" stroke-width="5.4" stroke-linecap="round" fill="none"/><path d="M-5 23q-3 2-6 5M5 23q3 2 6 5" stroke="' + p.leg + '" stroke-width="3.6" stroke-linecap="round" fill="none"/>' +
        '<ellipse cx="-12" cy="28.6" rx="3" ry="3.2" fill="' + p.boot + '" stroke="' + p.line + '" stroke-width="1"/><ellipse cx="12" cy="28.6" rx="3" ry="3.2" fill="' + p.boot + '" stroke="' + p.line + '" stroke-width="1"/>' +
        arm(p, 'M-6.5 14q-3 4-3.4 8') + arm(p, 'M6.5 14q3 4 3.4 8') + held(p, acc, 10, 21.5) + mitt(p, -9.8, 22.4) + mitt(p, 9.8, 22.4) +
        '<g transform="translate(0 2)">' + cap(p, acc) + head(p, v, acc) + '</g>';
    }
    return s;
  }

  function elf(variant, opts) {
    const v = ((variant | 0) % 24 + 24) % 24;
    return '<svg class="xa-elf' + (opts && opts.cls ? ' ' + opts.cls : '') + '" viewBox="-18 -27 38 58" aria-hidden="true">' + elfBody(v, palette(v)) + '</svg>';
  }
  // a grey "?" elf for the gallery's unfound slots (the wave pose, no face, no accessories)
  function elfSilhouette() {
    return '<svg class="xa-elf xa-elf-sil" viewBox="-18 -27 38 58" aria-hidden="true">' + elfBody(1, silPalette()) + '</svg>';
  }

  // ---- small helpers
  function star(cx, cy, R, r, fill, stroke) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * k).toFixed(2) + ' ' + (cy + Math.sin(a) * k).toFixed(2);
    }
    return '<path d="' + d + 'z" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="1" stroke-linejoin="round"' : '') + '/>';
  }
  function bauble(x, y, r, st) {
    if (!st) return '<circle cx="' + x + '" cy="' + y + '" r="' + (r - .4) + '" fill="rgba(10,40,24,.35)" stroke="rgba(220,255,230,.35)" stroke-width=".8" stroke-dasharray="1.6 1.4"/>';
    const gold = st === 2;
    return '<path d="M' + x + ' ' + (y - r - 1.6) + 'v1.6" stroke="#c9ccd4" stroke-width=".8"/>' +
      '<rect x="' + (x - 1.2) + '" y="' + (y - r - .9) + '" width="2.4" height="1.4" rx=".4" fill="' + (gold ? '#b58613' : '#8f9bab') + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (gold ? '#f5c63c' : '#dbe3ec') + '" stroke="' + (gold ? '#9a6d0c' : '#6f7c8f') + '" stroke-width=".9"/>' +
      '<circle cx="' + (x - r * .35) + '" cy="' + (y - r * .35) + '" r="' + (r * .32) + '" fill="#fff" opacity=".85"/>';
  }

  // ---- the tree. 24 fixed bauble slots in six rows (2,3,4,5,5,5 from the top); door N's bauble always hangs in
  // slot N, and the slots are spread so that the first doors already decorate the whole tree. Star once door 24 is open.
  const ROWS = [[30, [45, 55]], [41, [38.5, 50, 61.5]], [53, [35, 45, 55, 65]], [64, [29.5, 39.7, 50, 60.3, 70.5]], [77, [29, 39.5, 50, 60.5, 71]], [88.5, [24, 37, 50, 63, 76]]];
  const ROW_SLOTS = []; ROWS.forEach(r => r[1].forEach(x => ROW_SLOTS.push([x, r[0]])));
  // door -> slot index (row-major order above), a fixed shuffle
  const ORDER = [12, 3, 19, 7, 22, 0, 15, 9, 17, 5, 21, 11, 2, 18, 8, 14, 23, 6, 16, 1, 10, 20, 13, 4];
  const SLOTS = ORDER.map(i => ROW_SLOTS[i]);

  function tree(baubles, opts) {
    const b = baubles || [];
    let s = '<svg class="xa-tree' + (opts && opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 100 122" aria-hidden="true">' +
      // tub + trunk
      '<rect x="45" y="90" width="10" height="14" fill="#6b4224"/>' +
      '<path d="M35 101h30l-3 17h-24z" fill="#b5452f" stroke="' + OUT + '" stroke-width="1.4" stroke-linejoin="round"/><path d="M36.2 106h27.6M37.2 112h25.6" stroke="#8a3020" stroke-width="1.2"/>' +
      '<rect x="33" y="99" width="34" height="4.6" rx="1.6" fill="#d45a3e" stroke="' + OUT + '" stroke-width="1.2"/>' +
      // three tiers, bottom first, each with a scalloped hem and a snow lip
      tier(50, 49, 38, 95) + tier(50, 28, 30, 69) + tier(50, 12, 21, 46);
    SLOTS.forEach((q, i) => (s += bauble(q[0], q[1], 3.3, b[i] | 0)));
    s += b[23] > 0
      ? '<circle cx="50" cy="10" r="10" fill="#ffd23f" opacity=".28"/>' + star(50, 10, 9, 3.8, '#ffd23f', '#a8740a')
      : star(50, 10, 7, 3, 'rgba(255,255,255,.08)', 'rgba(255,255,255,.35)');
    return s + '</svg>';
  }
  function tier(cx, top, hw, base) {
    const L = cx - hw, R = cx + hw, n = 4, w = (R - L) / n;
    let hem = '';
    for (let i = n - 1; i >= 0; i--) hem += 'Q' + (L + w * (i + .5)).toFixed(1) + ' ' + (base + 4) + ' ' + (L + w * i).toFixed(1) + ' ' + base;
    let snow = '';
    for (let i = 0; i < n; i++) snow += 'Q' + (L + w * (i + .5)).toFixed(1) + ' ' + (base + 1.4) + ' ' + (L + w * (i + 1)).toFixed(1) + ' ' + (base - 2.2);
    return '<path d="M' + cx + ' ' + top + 'L' + R + ' ' + base + hem + 'z" fill="#2a8a4a" stroke="' + OUT + '" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M' + cx + ' ' + top + 'L' + (L + 2) + ' ' + (base - 1) + 'L' + (cx - 3) + ' ' + (base - 1) + 'z" fill="#2f9a54"/>' +
      '<path d="M' + (L + 1.5) + ' ' + (base - 2.2) + snow.replace(/^Q/, 'Q') + '" stroke="#eef6ff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>';
  }

  // ---- presents. color: 'red' | 'green' | 'gold' | 'blue' or any css colour; ribbon is gold on red/green/blue, red on gold
  const BOX = { red: ['#d9302c', '#a81f1f', '#ffd23f'], green: ['#2f9a54', '#1f6b39', '#ffd23f'], gold: ['#f5c63c', '#b8860b', '#d9302c'], blue: ['#3b7fd9', '#24539c', '#f4f6fa'] };
  function present(color) {
    const c = BOX[color] || [color || BOX.red[0], 'rgba(0,0,0,.25)', '#ffd23f'];
    return '<svg class="xa-present" viewBox="-16 -18 32 34" aria-hidden="true">' +
      '<rect x="-12" y="-4" width="24" height="18" rx="2" fill="' + c[0] + '" stroke="' + OUT + '" stroke-width="1.3"/>' +
      '<path d="M0-4h10q2 0 2 2v14q0 2-2 2h-10z" fill="' + c[1] + '" opacity=".35"/>' +
      '<rect x="-13.5" y="-8.5" width="27" height="6" rx="1.6" fill="' + c[0] + '" stroke="' + OUT + '" stroke-width="1.3"/>' +
      '<path d="M0-8.5v22.5" stroke="' + c[2] + '" stroke-width="4"/><path d="M-13.5-5.5h27" stroke="' + c[2] + '" stroke-width="2.6"/>' +
      '<path d="M0-8.5q-9-8-9-3t9 3zM0-8.5q9-8 9-3t-9 3z" fill="' + c[2] + '" stroke="' + OUT + '" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-8.5" r="1.8" fill="' + c[2] + '" stroke="' + OUT + '" stroke-width="1"/></svg>';
  }

  // a small snowy fir for the hub map
  function fir() {
    return '<svg class="xa-fir" viewBox="-14 -26 28 36" aria-hidden="true"><rect x="-2" y="4" width="4" height="5" fill="#6b4224"/>' +
      '<path d="M0-24l8 11h-3l7 9h-3l6 8h-30l6-8h-3l7-9h-3z" fill="#2a8a4a" stroke="' + OUT + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M0-24l4 5.5q-2 1.6-4 .2q-2 1.4-4-.2zM-5-13q5 2.4 10 0M-9-4q9 3 18 0M-12 4q12 2.6 24 0" stroke="#eef6ff" stroke-width="1.8" fill="#eef6ff" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function snowman() {
    return '<svg class="xa-snowman" viewBox="-16 -30 32 44" aria-hidden="true">' +
      '<ellipse cx="0" cy="12" rx="13" ry="2.4" fill="rgba(0,0,0,.18)"/>' +
      '<circle cx="0" cy="3" r="10" fill="#f4f8fd" stroke="' + OUT + '" stroke-width="1.3"/><circle cx="0" cy="-12" r="7.5" fill="#f4f8fd" stroke="' + OUT + '" stroke-width="1.3"/>' +
      '<path d="M-7 3q7 6 14 0" stroke="#c9d6e6" stroke-width="1.2" fill="none"/>' +
      '<path d="M-8-4q8 3.6 16 0l-.4 2.8q-7.6 3.2-15.2 0z" fill="#e0392e" stroke="' + OUT + '" stroke-width="1"/><path d="M4-3.4l1.6 8.4h3l-1.6-8.6z" fill="#e0392e" stroke="' + OUT + '" stroke-width="1"/>' +
      '<rect x="-6.5" y="-27" width="13" height="8" rx="1" fill="#2a2f3d"/><rect x="-9" y="-20" width="18" height="2.4" rx="1" fill="#2a2f3d"/><rect x="-6.5" y="-23" width="13" height="2" fill="#e0392e"/>' +
      '<circle cx="-2.6" cy="-13.4" r="1.1" fill="#1b2540"/><circle cx="2.6" cy="-13.4" r="1.1" fill="#1b2540"/><path d="M0-11.4l6 1.4-6 1.2z" fill="#f08a24"/>' +
      '<circle cx="0" cy="1" r="1" fill="#1b2540"/><circle cx="0" cy="5" r="1" fill="#1b2540"/>' +
      '<path d="M-9 0l-6-5M-13-3.4l-1.6-3M9 0l6-5M13-3.4l2-2.4" stroke="#6b4224" stroke-width="1.3" stroke-linecap="round"/></svg>';
  }

  // ---- Santa hat. In the coach portrait's 0..100 viewBox (head ellipse cx 50 cy 52, top ~y 30), brim across the
  // forehead, tip flopping to the right. dy lifts it over big hair.
  function hatPath(dy) {
    return '<g class="xa-hat" transform="translate(0 ' + (dy || 0) + ') rotate(-6 50 32)">' +
      '<path d="M30 33q2-20 22-22q16-2 26 8q4 5 6 12q-5-4-9-5q-2 4 1 9z" fill="#d9302c" stroke="' + OUT + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M38 26q6-10 18-11" stroke="rgba(255,255,255,.28)" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<rect x="26" y="29" width="50" height="10" rx="5" fill="#fbfbf7" stroke="' + OUT + '" stroke-width="1.6"/>' +
      '<path d="M32 32.5q2 2 4 0M42 35q2 2 4 0M53 32.5q2 2 4 0M64 35q2 2 4 0" stroke="#d9dde5" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="85" cy="33" r="6" fill="#fbfbf7" stroke="' + OUT + '" stroke-width="1.6"/></g>';
  }
  function santaHat() { return '<svg class="xa-santahat" viewBox="20 6 76 40" aria-hidden="true">' + hatPath(0) + '</svg>'; }
  // how far each coach's hat sits above the default (hair height; see COACHES in js/ui/ui.js)
  const HAT_DY = { anton: 0, storm: -6, marius: -4, ida: -1, maria: -5, nicolas: -3, peter: -9, jesper: 1 };
  // wrap: coachSvg(...) string -> the same portrait with a Santa hat on top
  function hatCoach(svgStr, id) {
    if (typeof svgStr !== 'string') return svgStr;
    const i = svgStr.lastIndexOf('</svg>'); if (i < 0) return svgStr;
    const dy = HAT_DY[id] != null ? HAT_DY[id] : -3;
    return svgStr.slice(0, i) + hatPath(dy) + svgStr.slice(i);
  }

  // ---- shed-wall door. state: 'locked' (frosted), 'ready' (warm, glowing; pulse it with CSS), 'open' | 'gold'
  // (swung open; silver or gold bauble hanging inside). inner: optional SVG markup drawn in the opening (the door's
  // icon), in the door's 60x72 space, roughly the box x 14..46, y 18..58.
  function door(n, state, inner) {
    let s = '<svg class="xa-door xa-door-' + (state || 'locked') + '" viewBox="0 0 60 72" aria-hidden="true">';
    const num = (x, y, size, fill, stroke) => '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="' + size + '" font-weight="900" fill="' + fill + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="2.4" paint-order="stroke"' : '') + '>' + (n | 0) + '</text>';
    if (state === 'open' || state === 'gold') {
      const gold = state === 'gold';
      s += '<rect x="4" y="4" width="52" height="64" rx="5" fill="' + (gold ? '#c9952a' : '#7a4f28') + '" stroke="' + OUT + '" stroke-width="2"/>' +
        '<rect x="10" y="10" width="40" height="52" rx="3" fill="#3a2614"/><rect x="10" y="10" width="40" height="52" rx="3" fill="#ffcf6a" opacity=".16"/>' +
        '<circle cx="30" cy="36" r="20" fill="#ffcf6a" opacity=".12"/><rect x="10" y="55" width="40" height="7" fill="#6b4224"/><path d="M10 55h40" stroke="#9c6634" stroke-width="1.4"/>' +
        (inner || '') +
        '<path d="M10 10l-6-4v64l6-8z" fill="#9c6634" stroke="' + OUT + '" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<circle cx="6.6" cy="38" r="1.2" fill="#f0c74a"/>' +
        bauble(43, 19, 4.4, gold ? 2 : 1) +
        '<rect x="20" y="0" width="20" height="11" rx="5.5" fill="' + (gold ? '#f5c63c' : '#eef4fb') + '" stroke="' + OUT + '" stroke-width="1.4"/>' +
        num(30, 8.8, 9, gold ? '#5a3a06' : '#1b2540');
    } else if (state === 'ready') {
      s += '<rect x="1.5" y="1.5" width="57" height="69" rx="7" fill="none" stroke="#ffe9a8" stroke-width="2.4" opacity=".35"/>' +
        '<rect x="4" y="4" width="52" height="64" rx="5" fill="#c8402e" stroke="#ffd36a" stroke-width="2.2"/>' +
        '<path d="M17 6v60M30 6v60M43 6v60" stroke="#a8301f" stroke-width="1.2"/>' +
        '<rect x="9" y="9" width="42" height="54" rx="3" fill="none" stroke="#f0c74a" stroke-width="1.2" opacity=".75"/>' +
        // holly wreath
        '<circle cx="30" cy="27" r="11" fill="none" stroke="#2a8a4a" stroke-width="5"/><circle cx="30" cy="27" r="11" fill="none" stroke="#3fb064" stroke-width="2" stroke-dasharray="3 4"/>' +
        '<circle cx="24" cy="36" r="1.6" fill="#ffd23f"/><circle cx="36" cy="36" r="1.6" fill="#ffd23f"/><path d="M27 38l3-3 3 3-3 2z" fill="#e0392e"/>' +
        num(30, 31.5, 13, '#fff7e0', '#7a2416') +
        '<circle cx="48" cy="44" r="1.8" fill="#f0c74a" stroke="' + OUT + '" stroke-width=".8"/>' +
        '<path d="M6 66q24-5 48 0v2h-48z" fill="#eef4fb"/>';
    } else {
      s += '<rect x="4" y="4" width="52" height="64" rx="5" fill="#6f87a3" stroke="' + OUT + '" stroke-width="2"/>' +
        '<path d="M17 6v60M30 6v60M43 6v60" stroke="#5a7090" stroke-width="1.2"/>' +
        // frost creeping in from the corners, a snow cap on top
        '<path d="M5 18q6-1 8-8q1-4 0-5h-6q-2 0-2 2zM55 54q-7 1-9 8q-1 4 0 5h7q2 0 2-2z" fill="#dce9f7" opacity=".7"/>' +
        '<path d="M4 9q2-6 9-5q5-3 10 0q6-3 12 0q6-3 11 0q7-1 10 5v-2q0-3-3-3h-46q-3 0-3 3z" fill="#f4f8fd"/>' +
        '<g stroke="#eaf3ff" stroke-width="1.4" stroke-linecap="round" opacity=".55"><path d="M30 40v14M23.9 43.5l12.2 7M23.9 50.5l12.2-7"/></g>' +
        num(30, 33, 15, '#eef4fb', '#3c5170') +
        '<circle cx="48" cy="44" r="1.8" fill="#aab8c8" stroke="' + OUT + '" stroke-width=".8"/>';
    }
    return s + '</svg>';
  }

  // ---- icons
  const svg = {
    bell: '<svg class="xa-bell" viewBox="-14 -16 28 30" aria-hidden="true"><path d="M-2-13q2-2 4 0" stroke="#b8860b" stroke-width="2" fill="none"/>' +
      '<path d="M-9 6q0-4 1-9q1-9 8-9t8 9q1 5 1 9l3 3h-24z" fill="#f5c63c" stroke="' + OUT + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M-5-3q1-6 4-7" stroke="#fff3c0" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="0" cy="11" r="2.6" fill="#b8860b" stroke="' + OUT + '" stroke-width="1"/>' +
      '<path d="M-6-11q-5-3-7 1q4 0 3 3zM6-11q5-3 7 1q-4 0-3 3z" fill="#2f9a54" stroke="#1d5a2c" stroke-width=".8"/><circle cx="-2" cy="-12" r="1.6" fill="#e0392e"/><circle cx="2" cy="-12" r="1.6" fill="#e0392e"/></svg>',
    // the hub pin badge: a present with a sprig, chunky enough for 24px
    gift: '<svg class="xa-gift" viewBox="-12 -13 24 25" aria-hidden="true"><rect x="-9" y="-3" width="18" height="13" rx="2" fill="#d9302c" stroke="' + OUT + '" stroke-width="1.3"/>' +
      '<rect x="-10.5" y="-6.5" width="21" height="5" rx="1.4" fill="#e5492c" stroke="' + OUT + '" stroke-width="1.3"/><path d="M0-6.5v16.5" stroke="#ffd23f" stroke-width="3.6"/>' +
      '<path d="M0-6.5q-7-6.5-7-2t7 2zM0-6.5q7-6.5 7-2t-7 2z" fill="#ffd23f" stroke="' + OUT + '" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    snowflake: '<svg class="xa-flake" viewBox="-10 -10 20 20" aria-hidden="true"><g stroke="#eef6ff" stroke-width="1.6" stroke-linecap="round"><path d="M0-8v16M-6.9-4l13.8 8M-6.9 4l13.8-8"/><path d="M-2-6l2 2 2-2M-2 6l2-2 2 2M-6.2-1l1.8-.9-.2-2.1M6.2 1l-1.8.9.2 2.1M6.2-1l-1.8-.9.2-2.1M-6.2 1l1.8.9-.2 2.1" fill="none"/></g></svg>',
    star: '<svg class="xa-star" viewBox="-12 -12 24 24" aria-hidden="true">' + star(0, 0, 10.5, 4.4, '#ffd23f', '#a8740a') + '</svg>',
  };

  KOS.XmasArt = { elf, elfSilhouette, tree, present, fir, snowman, santaHat, hatCoach, door, bell: () => svg.bell, gift: () => svg.gift, svg,
    SLOTS, POSES, ACC, deco() { return !!(KOS.Season && KOS.Season.on && KOS.Season.on['xmas-deco']); } };
})(typeof window !== 'undefined' ? window : globalThis);
