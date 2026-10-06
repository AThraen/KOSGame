// KØS SEJL — js/core/world.js
// KOS.World: the geography of Svanemøllebugten, Svaneknoppen, Kalkbrænderiløbet and the Øresund off Stubben.
//
// All venues share ONE global frame so they are consistent with each other:
//   units = meters, x grows east, y grows SOUTH, north is up.
//   Origin (0, 0) = the root of KØS's main jetty at Svaneknoppen (the club corner of the 1.6 m basin).
// A venue is a window (bounds) into that shared world plus venue-specific spawn/details.
// Traced loosely (stylised) from docs/reference/chart-overview.webp and chart-svaneknoppen-pier.webp.
//
// Venue shape (SPEC.md):
//   {id, name:{da,en}, bounds:{x0,y0,x1,y1}, land:[poly], piers:[poly], breakwaters:[poly],
//    depth:[{poly, d}]  (painter's order: the LAST polygon containing a point wins; else defaultDepth),
//    defaultDepth, buoys:[{id, kind, x, y, light, name?}], labels:[{x, y, text, size /*m*/, rot? /*deg*/, kind?}],
//    berths:[{id, name:{da,en}, jetty, x, y, heading, len, beam, side}], slip:{x, y, heading}, spawn:{x, y, heading},
//    landmarks:[{kind, x, y, ...}],
//    // extras:
//    lights:[{id, x, y, light, color, name}], lanes:[{id, kind:'channel'|'ferry'|'fairway', width, points:[[x,y]..]}],
//    zones:[{id, kind:'swim'|'course'|'nowake', poly? | x,y,r}], courseArea?:{x, y, r}}
// Polygons are arrays of [x, y]. Pier/breakwater polygons carry optional non-enumerable-ish props
// (`poly.id`, `poly.kind`, `poly.name`) – they are still plain arrays for renderers.
//
// Landmark kinds (for the renderer): clubhouse {w,h,rot,name}, flagpole, building {w,h,rot,color,floors},
// tower {w,h,rot,floors,color} (Nordhavn apartment towers), silo {w,h}, powerstation {w,h,rot},
// tree {r}, beach {poly}, park {poly}, boatpark {w,h,rot}, slipway {poly, heading}, marina {poly},
// container {w,h,rot}, lighthouse {light, color}, crane {rot}, gangway {poly}.
//
// Helpers: isLand(v,x,y), depthAt(v,x,y), hit(v,x,y,r[,draft]) → {type,nx,ny,depth,d}|null, get(id),
//          nearestShore(v,x,y), inZone(v,x,y,kind), project helpers for maps.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  // ------------------------------------------------------------------ local math (self-contained)
  const D2R = Math.PI / 180;
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function nearestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + dx * t, ay + dy * t];
  }
  function polyNearest(x, y, poly) {
    let best = null, bd = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const q = nearestOnSeg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
      const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y);
      if (d < bd) { bd = d; best = q; }
    }
    return { x: best[0], y: best[1], d: Math.sqrt(bd) };
  }
  function bboxOf(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return { x0, y0, x1, y1 };
  }
  function tag(poly, props) {
    for (const k in props) Object.defineProperty(poly, k, { value: props[k], enumerable: false, writable: true, configurable: true });
    return poly;
  }
  // polygon around a polyline, `w` wide, centred on it, with flat-ish rounded caps
  function strip(pts, w, cap) {
    const h = w / 2, L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      L.push([+(p[0] + dy * h).toFixed(1), +(p[1] - dx * h).toFixed(1)]);
      R.push([+(p[0] - dy * h).toFixed(1), +(p[1] + dx * h).toFixed(1)]);
    }
    const out = L.slice();
    if (cap) {
      const p = pts[pts.length - 1], q = pts[pts.length - 2];
      const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      out.push([+(p[0] + (p[0] - q[0]) / l * h).toFixed(1), +(p[1] + (p[1] - q[1]) / l * h).toFixed(1)]);
    }
    for (let i = R.length - 1; i >= 0; i--) out.push(R[i]);
    if (cap) {
      const p = pts[0], q = pts[1];
      const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      out.push([+(p[0] + (p[0] - q[0]) / l * h).toFixed(1), +(p[1] + (p[1] - q[1]) / l * h).toFixed(1)]);
    }
    return out;
  }
  // rectangle from a root point, heading in degrees (0 = north, clockwise), length along heading, width across
  function rectFrom(x, y, hdg, len, wid) {
    const h = hdg * D2R, dx = Math.sin(h), dy = -Math.cos(h), nx = Math.cos(h), ny = Math.sin(h), w = wid / 2;
    const r = (v) => +v.toFixed(2);
    return [[r(x - nx * w), r(y - ny * w)], [r(x - nx * w + dx * len), r(y - ny * w + dy * len)],
      [r(x + nx * w + dx * len), r(y + ny * w + dy * len)], [r(x + nx * w), r(y + ny * w)]];
  }
  function rectAt(cx, cy, w, h, rotDeg) {
    const a = (rotDeg || 0) * D2R, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(p => [+(cx + p[0] * c - p[1] * s).toFixed(1), +(cy + p[0] * s + p[1] * c).toFixed(1)]);
  }
  function ellipse(cx, cy, rx, ry, rotDeg, n) {
    n = n || 28;
    const a = (rotDeg || 0) * D2R, c = Math.cos(a), s = Math.sin(a), out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      // slightly wobbly so shoals look natural
      const k = 1 + 0.08 * Math.sin(t * 3 + cx * 0.01) + 0.05 * Math.cos(t * 5 + cy * 0.01);
      const ex = Math.cos(t) * rx * k, ey = Math.sin(t) * ry * k;
      out.push([+(cx + ex * c - ey * s).toFixed(1), +(cy + ex * s + ey * c).toFixed(1)]);
    }
    return out;
  }
  // organic edges for depth contours: densify, then nudge each point with smooth sines (deterministic)
  function wobble(poly, amp, step, seed) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s < k; s++) {
        const x = a[0] + (b[0] - a[0]) * s / k, y = a[1] + (b[1] - a[1]) * s / k;
        out.push([
          +(x + amp * Math.sin(y * 0.0031 + seed) + amp * 0.5 * Math.sin(y * 0.0093 + x * 0.002 + seed * 2)).toFixed(1),
          +(y + amp * Math.cos(x * 0.0027 + seed) + amp * 0.5 * Math.cos(x * 0.011 - y * 0.002 + seed)).toFixed(1),
        ]);
      }
    }
    return out;
  }
  // tiny deterministic rng for scattering trees/buildings (core: no Math.random)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ shared geography
  // Kalkbrænderiløbet axis: runs from Svaneknoppen NNE (~20°) out to sea.
  const chanX = (y) => 610 - 0.36 * y; // centreline x at a given y (for y <= 110)

  // The mainland: ONE coast polygon (Hellerup → Tuborg Havn → beach → club basin → Svaneknoppen →
  // Svanemøllehavnen (inlet) → Kalkbrænderiløbet (inlet) → Nordhavn → Færgehavn Nord (inlet) → Nordhavn north coast).
  const COAST = [
    [-3200, -4600], [-700, -4600], [-690, -2600], [-660, -1760],
    // Tuborg Havn block
    [-420, -1790], [-80, -1770], [80, -1720], [130, -1560], [110, -1420], [30, -1320], [-160, -1180], [-380, -1090], [-520, -1060],
    // Svanemøllestranden (the beach)
    [-548, -980], [-566, -860], [-578, -720], [-576, -580], [-568, -450], [-562, -350],
    // basin west wall (rock revetment), south of the beach mole
    [-560, -250], [-558, -100], [-556, 40], [-548, 120], [-526, 152], [-490, 165],
    // basin south shore
    [-380, 166], [-250, 162], [-130, 152],
    // diagonal shore up to the club corner (slipway here)
    [-80, 100], [-40, 55], [-8, 18],
    // Svaneknoppen north shore (club frontage, then rock revetment to the point)
    [40, -6], [110, -34], [170, -56], [250, -80], [330, -98], [420, -115], [470, -110], [505, -82], [522, -35], [525, 30], [522, 78],
    // Svanemøllehavnen marina (inlet from the east)
    [470, 92], [300, 96], [160, 104], [150, 200], [146, 350], [150, 480], [300, 490], [470, 486], [478, 300], [480, 150], [526, 138],
    // Kalkbrænderiløbet inner channel, west bank going south
    [552, 160], [565, 300], [578, 500], [585, 800], [590, 1300],
    // across the channel's southern end and up the Nordhavn side (east bank)
    [712, 1300], [712, 800], [706, 400], [702, 160], [706, 40],
    [chanX(-100) + 100, -100], [chanX(-190) + 100, -190],
    // Færgehavn Nord (inlet)
    [900, -186], [1060, -176], [1122, -206], [1132, -318], [1064, -352], [900, -350], [chanX(-330) + 100, -330],
    // Nordhavn west coast up to the tongue
    [chanX(-500) + 100, -500], [chanX(-800) + 100, -800], [chanX(-1000) + 100, -1000], [chanX(-1110) + 100, -1110],
    [1150, -1182], [1196, -1198], [1236, -1176],
    // Nordhavn north coast → Københavns Nord Vinkelfyr → east coast
    [1300, -1122], [1420, -1060], [1600, -962], [1800, -842], [2000, -724], [2200, -622], [2350, -566], [2500, -600],
    [2800, -752], [3100, -902], [3400, -1042], [3620, -1142], [3720, -1122], [3900, -962], [4200, -700], [4600, -380],
    [5400, 120], [5400, 3200], [-3200, 3200],
  ].map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]);
  tag(COAST, { id: 'coast', kind: 'coast' });

  // Badestrandens mole (rock mole with the Fl W 3s light at its head)
  const MOLE_LINE = [[-564, -352], [-480, -383], [-390, -408], [-300, -424], [-286, -424]];
  // The curved island breakwater NE of the jetties (banana bulging north)
  const ISLAND_LINE = [[-34, -92], [6, -112], [56, -129], [106, -140], [150, -142]];

  const BREAKWATERS = [
    tag(strip(MOLE_LINE, 11, true), { id: 'mole', kind: 'mole', name: 'Badestrandens mole' }),
    tag(strip(ISLAND_LINE, 16, true), { id: 'island', kind: 'island', name: 'Øbølgebryder' }),
    // rock revetments ("Obstn") along the basin and Svaneknoppen
    tag(strip([[-562, -340], [-560, -250], [-558, -100], [-556, 40], [-548, 120], [-526, 152], [-490, 165]], 9), { id: 'rev-w', kind: 'revetment' }),
    tag(strip([[-490, 165], [-380, 166], [-250, 162], [-130, 152], [-92, 113]], 9), { id: 'rev-s', kind: 'revetment' }),
    tag(strip([[44, -8], [110, -34], [170, -56], [250, -80], [330, -98], [420, -115], [470, -110], [505, -82], [522, -35], [525, 30], [522, 76]], 8), { id: 'rev-n', kind: 'revetment' }),
    // Svanemøllehavnen moles, Nordhavn tongue head
    tag(strip([[480, 300], [480, 150], [530, 136]], 8), { id: 'marina-s', kind: 'mole' }),
    tag(strip([[1110, -1120], [1150, -1182], [1196, -1198], [1236, -1176]], 10), { id: 'tongue', kind: 'mole' }),
  ];

  // --- club jetties (heading in deg, 0 = north). Roots on the club corner.
  const JETTIES = [
    { id: 'A', name: { da: 'Optibroen', en: 'Opti jetty' }, x: -30, y: 44, hdg: -40, len: 40, wid: 2.4, kind: 'jetty' },
    { id: 'B', name: { da: 'Langbroen', en: 'Long jetty' }, x: 8, y: 10, hdg: -25, len: 60, wid: 2.6, kind: 'jetty' },
    { id: 'C', name: { da: 'RIB-pontonen', en: 'RIB pontoon' }, x: 62, y: -10, hdg: -15, len: 32, wid: 4, kind: 'pontoon', gap: 6 },
  ];
  const PIERS = [];
  for (const j of JETTIES) {
    const h = j.hdg * D2R;
    const sx = j.x + Math.sin(h) * (j.gap || 0), sy = j.y - Math.cos(h) * (j.gap || 0);
    PIERS.push(tag(rectFrom(sx, sy, j.hdg, j.len, j.wid), { id: j.id, kind: j.kind, name: j.name }));
    if (j.gap) PIERS.push(tag(rectFrom(j.x - Math.sin(h) * 4, j.y + Math.cos(h) * 4, j.hdg, j.gap + 4.5, 1.4), { id: j.id + '-gangway', kind: 'gangway' }));
  }
  // T-head on the Opti jetty
  {
    const j = JETTIES[0], h = j.hdg * D2R;
    const tx = j.x + Math.sin(h) * j.len, ty = j.y - Math.cos(h) * j.len;
    PIERS.push(tag(rectAt(tx, ty, 14, 2.4, j.hdg), { id: 'A-head', kind: 'jetty' }));
  }
  // Marina pontoons in Svanemøllehavnen (decorative + collidable)
  for (let i = 0; i < 5; i++) {
    const y = 150 + i * 70;
    PIERS.push(tag(rectFrom(160, y, 90, 250, 2.2), { id: 'M' + (i + 1), kind: 'jetty' }));
  }
  // Færgehavn Nord quay
  PIERS.push(tag(rectFrom(900, -340, 90, 190, 6), { id: 'ferry-quay', kind: 'quay' }));

  // Berths: alongside the jetties, bow pointing out from the shore. side = boat side that faces the jetty.
  const BERTH_DEF = [
    ['A', 13, 'R', { da: 'Måge', en: 'Gull' }, 3.4, 1.6], ['A', 13, 'L', { da: 'Terne', en: 'Tern' }, 3.4, 1.6],
    ['A', 27, 'R', { da: 'Ælling', en: 'Duckling' }, 3.4, 1.6], ['A', 27, 'L', { da: 'Krabbe', en: 'Crab' }, 3.4, 1.6],
    ['B', 18, 'R', { da: 'Skarv', en: 'Cormorant' }, 6, 2.2], ['B', 18, 'L', { da: 'Hejre', en: 'Heron' }, 6, 2.2],
    ['B', 40, 'R', { da: 'Svane', en: 'Swan' }, 8, 2.8], ['B', 40, 'L', { da: 'Ederfugl', en: 'Eider' }, 8, 2.8],
    ['C', 16, 'R', { da: 'Sæl', en: 'Seal' }, 5.5, 2.4], ['C', 16, 'L', { da: 'Marsvin', en: 'Porpoise' }, 5.5, 2.4],
  ];
  const BERTHS = BERTH_DEF.map((b, i) => {
    const j = JETTIES.find(q => q.id === b[0]);
    const h = j.hdg * D2R, dx = Math.sin(h), dy = -Math.cos(h), nx = Math.cos(h), ny = Math.sin(h);
    const sgn = b[2] === 'R' ? 1 : -1;
    const off = j.wid / 2 + b[5] / 2 + 0.25;
    const along = (j.gap || 0) + b[1];
    return {
      id: b[0] + (Math.floor(i % 4 / 2) + 1) + b[2], name: b[3], jetty: j.id,
      x: +(j.x + dx * along + nx * off * sgn).toFixed(2), y: +(j.y + dy * along + ny * off * sgn).toFixed(2),
      heading: +h.toFixed(4), len: b[4], beam: b[5], side: sgn > 0 ? 'port' : 'starboard',
    };
  });
  // nicer ids: A1, A2 ... per jetty
  { const count = {}; for (const b of BERTHS) { count[b.jetty] = (count[b.jetty] || 0) + 1; b.id = b.jetty + count[b.jetty]; } }

  const SLIP = { x: -64, y: 74, heading: +(-40 * D2R).toFixed(4) };
  const SLIP_POLY = rectFrom(-44, 98, -40, 34, 7);

  // --- depth: painter's order, last containing polygon wins
  const DEPTH_DEFAULT = 3.5;
  const DEPTH = [
    // the open Sound, getting deeper to the north-east
    { id: 'sound5', d: 5.2, poly: wobble([[200, -4800], [6000, -4800], [6000, 0], [4400, -450], [3700, -1000], [2400, -480], [1300, -1050], [950, -1300], [500, -1700], [200, -2400]], 90, 160, 1) },
    { id: 'sound7', d: 7, poly: wobble([[1500, -4800], [6000, -4800], [6000, -300], [3800, -1350], [3000, -1150], [2000, -1100], [1600, -1600], [1300, -2600]], 120, 160, 2) },
    { id: 'sound9', d: 9.5, poly: wobble([[2400, -4800], [6000, -4800], [6000, -600], [3900, -1700], [3200, -1700], [2700, -2000]], 140, 160, 3) },
    { id: 'sound12', d: 12, poly: wobble([[3300, -4800], [6000, -4800], [6000, -1000], [4200, -2200], [3600, -2600]], 140, 160, 4) },
    { id: 'sound13', d: 13, poly: wobble([[4000, -4800], [6000, -4800], [6000, -1500], [4400, -3000]], 140, 160, 5) },
    // Stubben shoals
    { id: 'stubbenS', d: 4.6, poly: ellipse(2350, -1500, 430, 250, -15) },
    { id: 'stubbenS2', d: 3.7, poly: ellipse(2360, -1500, 240, 130, -15) },
    { id: 'stubbenN', d: 5.0, poly: ellipse(2450, -2850, 520, 320, -30) },
    { id: 'stubbenN2', d: 4.3, poly: ellipse(2460, -2850, 290, 170, -30) },
    { id: 'wreck', d: 2.4, poly: ellipse(1760, -2450, 18, 10, 30, 10) },
    // Svanemøllebugten: 3.5 m in the east, shoaling towards the beach and the club basin
    { id: 'bay30', d: 3.0, poly: wobble([[-700, -1150], [200, -1250], [250, -800], [380, -450], [420, -200], [470, -120], [470, 400], [-700, 400]], 30, 60, 6) },
    { id: 'bay26', d: 2.6, poly: wobble([[-700, -1100], [-120, -1100], [-40, -700], [40, -420], [150, -200], [300, -140], [300, 0], [300, 400], [-700, 400]], 22, 50, 7) },
    { id: 'bay22', d: 2.2, poly: wobble([[-700, -1080], [-300, -1080], [-260, -700], [-150, -450], [-100, -300], [0, -160], [80, -120], [80, 40], [80, 400], [-700, 400]], 16, 40, 8) },
    { id: 'bay20', d: 2.0, poly: [[-700, -470], [-130, -470], [-120, -300], [-80, -150], [-20, -70], [60, -50], [60, 40], [60, 400], [-700, 400]] },
    { id: 'basin', d: 1.6, poly: [[-700, -436], [-186, -436], [-182, -320], [-150, -155], [-85, -55], [-12, 14], [20, 400], [-700, 400]] },
    { id: 'beach16', d: 1.6, poly: [[-700, -1070], [-400, -1062], [-410, -440], [-700, -440]] },
    { id: 'beach10', d: 1.0, poly: [[-700, -1060], [-500, -1044], [-512, -440], [-700, -440]] },
    { id: 'beach06', d: 0.6, poly: [[-700, -1040], [-534, -1030], [-546, -440], [-700, -440]] },
    { id: 'stone', d: 0.7, poly: ellipse(290, -700, 14, 10, 20, 12) },
    // dredged channels and harbours
    { id: 'kalk', d: 6.5, poly: strip([[chanX(110), 110], [chanX(-1460), -1460]], 120) },
    { id: 'kalkInner', d: 6.5, poly: [[590, 1300], [712, 1300], [712, 60], [585, 60]] },
    { id: 'skude', d: 6.5, poly: strip([[1096, -1440], [1350, -2100], [1700, -3300], [1760, -3800]], 150) },
    { id: 'faerge', d: 6.4, poly: [[770, -360], [1140, -360], [1140, -170], [770, -170]] },
    { id: 'marina', d: 2.6, poly: [[140, 86], [534, 86], [534, 500], [140, 500]] },
  ];

  // --- buoys / marks (IALA A, Denmark; direction of buoyage = inbound, i.e. southward into Copenhagen:
  // going IN you keep red to port (east side here) and green to starboard (west side here)).
  const BUOYS = [];
  // yellow swim-zone marks along Svanemøllestranden
  for (let i = 0; i < 7; i++) BUOYS.push({ id: 'Y' + (i + 1), kind: 'swim', x: -455 + (i % 2) * 4, y: -1000 + i * 92, light: null });
  BUOYS.push({ id: 'Y8', kind: 'swim', x: -380, y: -436, light: null });
  // Kalkbrænderiløbet laterals, numbered from seaward
  [-1400, -1000, -650, -300, 24].forEach((y, i) => {
    const c = chanX(y);
    BUOYS.push({ id: 'G' + (i * 2 + 1), kind: 'stbd', x: +(c - 58).toFixed(1), y, light: 'Fl G 3s', name: 'Kalkbrænderiløbet' });
    BUOYS.push({ id: 'R' + (i * 2 + 2), kind: 'port', x: +(c + 58).toFixed(1), y, light: 'Fl R 3s', name: 'Kalkbrænderiløbet' });
  });
  // Skudeløbet laterals (numbered from seaward = the north end)
  [[1650, -3130, 0.28, -0.96], [1480, -2550, 0.28, -0.96], [1250, -1850, 0.364, -0.931]].forEach((p, i) => {
    const nx = -p[3], ny = p[2]; // right-hand normal of the outbound direction = east side
    BUOYS.push({ id: 'SG' + (i * 2 + 1), kind: 'stbd', x: +(p[0] - nx * 78).toFixed(1), y: +(p[1] - ny * 78).toFixed(1), light: 'Fl G 4s', name: 'Skudeløbet' });
    BUOYS.push({ id: 'SR' + (i * 2 + 2), kind: 'port', x: +(p[0] + nx * 78).toFixed(1), y: +(p[1] + ny * 78).toFixed(1), light: 'Fl R 4s', name: 'Skudeløbet' });
  });
  BUOYS.push(
    { id: 'E-stenen', kind: 'cardE', x: 312, y: -700, light: 'Q(3) 10s', name: 'Stenen' },
    { id: 'N-tongue', kind: 'cardN', x: 1206, y: -1272, light: 'Q', name: 'Nordhavn Nord' },
    { id: 'SAFE', kind: 'safe', x: 1010, y: -1560, light: 'LFl 10s', name: 'Kalkbrænderiløbet' },
    { id: 'W-stubben', kind: 'cardW', x: 1880, y: -1530, light: 'Q(9) 15s', name: 'Stubben' },
    { id: 'E-stubben', kind: 'cardE', x: 2830, y: -1420, light: 'Q(3) 10s', name: 'Stubben' },
    { id: 'S-stubbenN', kind: 'cardS', x: 2560, y: -2470, light: 'Q(6)+LFl 15s', name: 'Stubben Nord' },
    { id: 'N-stubbenN', kind: 'cardN', x: 2420, y: -3250, light: 'Q', name: 'Stubben Nord' },
    { id: 'WRECK', kind: 'isolated', x: 1760, y: -2450, light: 'Fl(2) 5s', name: 'Vraget' },
    { id: 'SP1', kind: 'special', x: -210, y: -458, light: 'Fl Y 5s', name: 'Kapsejladsmærke' },
    { id: 'SP2', kind: 'special', x: 300, y: -330, light: 'Fl Y 5s', name: 'Kapsejladsmærke' },
  );

  const LIGHTS = [
    { id: 'mole', x: -288, y: -424, light: 'Fl W 3s', color: 'W', name: 'Badestrandens mole' },
    { id: 'marinaN', x: 522, y: 78, light: 'Fl G 3s', color: 'G', name: 'Svanemøllehavnen' },
    { id: 'marinaS', x: 528, y: 138, light: 'Fl R 3s', color: 'R', name: 'Svanemøllehavnen' },
    { id: 'forfyr', x: 712, y: 46, light: 'Iso R 2s', color: 'R', name: 'Kalkbrænderihavnen Forfyr' },
    { id: 'tongue', x: 1236, y: -1176, light: 'Fl R 4s', color: 'R', name: 'Færgehavn Nord' },
    { id: 'vinkel', x: 3640, y: -1150, light: 'Iso WRG 4s', color: 'W', name: 'Københavns Nord Vinkelfyr' },
  ];

  const LANES = [
    { id: 'kalk', kind: 'channel', width: 120, points: [[640, 900], [chanX(100), 100], [chanX(-1460), -1460]], name: 'Kalkbrænderiløbet' },
    { id: 'skude', kind: 'channel', width: 150, points: [[1096, -1440], [1350, -2100], [1700, -3300]], name: 'Skudeløbet' },
    { id: 'ferry', kind: 'ferry', width: 140, points: [[1000, -262], [770, -262], [chanX(-650), -650], [chanX(-1300), -1300], [1250, -1600], [2000, -2150], [3000, -2350], [3200, -3700]], name: 'Færgerute' },
  ];

  const ZONES = [
    { id: 'swim', kind: 'swim', poly: [[-575, -1030], [-450, -1030], [-450, -436], [-562, -360]] },
    { id: 'nowake', kind: 'nowake', poly: [[-140, -160], [200, -160], [200, 60], [-140, 160]] },
    { id: 'course', kind: 'course', x: 3750, y: -2000, r: 650 },
  ];

  // --- landmarks for the renderer
  const LANDMARKS = [];
  const add = (o) => (LANDMARKS.push(o), o);
  // the club
  add({ kind: 'clubhouse', x: 96, y: 22, w: 34, h: 14, rot: -22, name: 'KØS' });
  add({ kind: 'flagpole', x: 34, y: 16, flag: 'dk' });
  add({ kind: 'boatpark', x: -6, y: 64, w: 30, h: 18, rot: -40 });
  add({ kind: 'container', x: 140, y: 6, w: 12, h: 5, rot: -22, color: '#e8762b' });
  add({ kind: 'container', x: 150, y: 14, w: 12, h: 5, rot: -22, color: '#3a7bd5' });
  add({ kind: 'building', x: 60, y: 60, w: 26, h: 12, rot: -22, color: '#c9c3b6', floors: 1, name: 'Bådhal' });
  add({ kind: 'slipway', poly: SLIP_POLY, heading: SLIP.heading, x: SLIP.x, y: SLIP.y });
  add({ kind: 'gangway', poly: PIERS.find(p => p.id === 'C-gangway') || null, x: 62, y: -10 });
  add({ kind: 'lighthouse', x: -288, y: -424, light: 'Fl W 3s', color: 'W' });
  add({ kind: 'lighthouse', x: 3640, y: -1150, light: 'Iso WRG 4s', color: 'W' });
  add({ kind: 'lighthouse', x: 1236, y: -1176, light: 'Fl R 4s', color: 'R' });
  // the beach + park behind it
  add({ kind: 'beach', x: -585, y: -680, poly: [[-548, -980], [-566, -860], [-578, -720], [-576, -580], [-568, -450], [-562, -360], [-602, -360], [-610, -450], [-618, -580], [-620, -720], [-608, -860], [-590, -985]] });
  add({ kind: 'park', x: -660, y: -680, poly: [[-602, -1040], [-590, -985], [-608, -860], [-620, -720], [-618, -580], [-610, -450], [-604, -360], [-760, -340], [-780, -1040]] });
  add({ kind: 'park', x: 300, y: 30, poly: [[180, -40], [420, -100], [470, -95], [500, -60], [505, 40], [180, 60]] });
  add({ kind: 'marina', x: 310, y: 290, poly: [[150, 104], [470, 92], [478, 486], [150, 480]] });
  add({ kind: 'powerstation', x: 40, y: 320, w: 90, h: 50, rot: 0, name: 'Svanemølleværket' });
  // Nordhavn: apartment towers, the silo, warehouses, cranes
  const towers = [[900, -470, 40, 22, 9], [930, -620, 30, 30, 12], [990, -800, 44, 20, 10], [1060, -960, 26, 26, 14], [1120, -520, 50, 24, 8],
    [1250, -1000, 34, 22, 11], [1400, -900, 46, 24, 9], [1580, -820, 30, 30, 13], [1760, -720, 44, 22, 10], [1000, -120, 40, 26, 7], [880, 20, 36, 24, 8]];
  towers.forEach((t, i) => add({ kind: 'tower', x: t[0], y: t[1], w: t[2], h: t[3], floors: t[4], rot: -20, color: ['#d9d4cc', '#b9c6d4', '#e2c9a6', '#c5ccd6'][i % 4] }));
  add({ kind: 'silo', x: 1180, y: -760, w: 28, h: 22, floors: 17, name: 'The Silo' });
  add({ kind: 'crane', x: 1130, y: -380, rot: 30 });
  add({ kind: 'crane', x: 1160, y: -160, rot: -40 });
  {
    const r = rng(7);
    // city blocks: Østerbro behind the beach & marina, Nordhavn warehouses
    const areas = [[-1100, -1700, -760, 300, 26], [-250, 180, 120, 700, 10], [740, 120, 1400, 900, 14], [1250, -600, 2200, -300, 12], [2500, -500, 3500, 300, 16], [-560, -1700, 40, -1300, 10]];
    for (const a of areas) {
      for (let i = 0; i < a[4]; i++) {
        const x = a[0] + r() * (a[2] - a[0]), y = a[1] + r() * (a[3] - a[1]);
        if (!pointInPoly(x, y, COAST)) continue;
        add({ kind: 'building', x: +x.toFixed(0), y: +y.toFixed(0), w: +(24 + r() * 50).toFixed(0), h: +(14 + r() * 30).toFixed(0), rot: [-20, 0, -20, 25][i % 4], floors: 1 + Math.floor(r() * 5), color: ['#cfc7b8', '#b8b2a6', '#c9a18a', '#a9b4bd'][i % 4] });
      }
    }
    // trees: Svanemølle park behind the beach, Svaneknoppen, along the club
    const treeAreas = [[-760, -1040, -612, -360, 46], [180, -30, 500, 70, 22], [-120, 120, 120, 180, 12], [-60, 40, 30, 120, 6], [1400, -560, 2300, -460, 14]];
    for (const a of treeAreas) {
      for (let i = 0; i < a[4]; i++) {
        const x = a[0] + r() * (a[2] - a[0]), y = a[1] + r() * (a[3] - a[1]);
        if (!pointInPoly(x, y, COAST)) continue;
        // keep trees off the beach sand and the club buildings
        if (x > -612 && x < -540 && y < -350) continue;
        if (pointInPoly(x, y, SLIP_POLY) || LANDMARKS.some(l => l.w && Math.hypot(l.x - x, l.y - y) < Math.max(l.w, l.h) * 0.6 + 8)) continue;
        if (Math.hypot(x + 50, y - 90) < 30) continue; // slipway approach
        add({ kind: 'tree', x: +x.toFixed(0), y: +y.toFixed(0), r: +(4 + r() * 6).toFixed(1) });
      }
    }
  }

  const LABELS = [
    { x: -120, y: -930, text: 'Svanemøllebugten', size: 34, kind: 'water' },
    { x: -660, y: -720, text: 'Svanemøllestranden', size: 18, rot: -88, kind: 'land' },
    { x: -420, y: -460, text: 'Badestrandens mole', size: 11, rot: -14, kind: 'land' },
    { x: 290, y: -40, text: 'Svaneknoppen', size: 18, rot: -12, kind: 'land' },
    { x: 96, y: 44, text: 'KØS', size: 12, kind: 'club' },
    { x: -320, y: -120, text: '1,6', size: 14, kind: 'depth' },
    { x: 150, y: -260, text: '2,4', size: 14, kind: 'depth' },
    { x: 360, y: -460, text: '3,4', size: 14, kind: 'depth' },
    { x: 310, y: 300, text: 'Svanemøllehavnen', size: 20, kind: 'water' },
    { x: 820, y: -760, text: 'Kalkbrænderiløbet', size: 18, rot: 70, kind: 'water' },
    { x: 960, y: -268, text: 'Færgehavn Nord', size: 14, kind: 'water' },
    { x: 1600, y: -560, text: 'Nordhavn', size: 44, kind: 'land' },
    { x: -260, y: -1500, text: 'Tuborg Havn', size: 22, kind: 'land' },
    { x: -1000, y: -900, text: 'Hellerup', size: 30, kind: 'land' },
    { x: 2360, y: -1500, text: 'Stubben', size: 24, kind: 'water' },
    { x: 2450, y: -2860, text: 'Stubben', size: 26, kind: 'water' },
    { x: 1380, y: -2500, text: 'Skudeløbet', size: 22, rot: -74, kind: 'water' },
    { x: 3300, y: -3100, text: 'Øresund', size: 80, kind: 'water' },
    { x: 3640, y: -1210, text: 'Vinkelfyr', size: 16, kind: 'land' },
  ];

  // ------------------------------------------------------------------ venues
  function intersects(b, bb, pad) {
    return !(bb.x1 < b.x0 - pad || bb.x0 > b.x1 + pad || bb.y1 < b.y0 - pad || bb.y0 > b.y1 + pad);
  }
  function inBounds(b, x, y, pad) { return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad; }

  function makeVenue(def) {
    const b = def.bounds, pad = def.pad || 250;
    const keep = (poly) => intersects(b, bboxOf(poly), pad);
    const v = {
      id: def.id, name: def.name, bounds: b, defaultDepth: DEPTH_DEFAULT,
      land: [COAST],
      piers: PIERS.filter(keep),
      breakwaters: BREAKWATERS.filter(keep),
      depth: DEPTH.filter(z => keep(z.poly)).map(z => ({ id: z.id, d: z.d, poly: z.poly })),
      buoys: BUOYS.filter(o => inBounds(b, o.x, o.y, 40)).map(o => Object.assign({}, o)),
      lights: LIGHTS.filter(o => inBounds(b, o.x, o.y, 40)),
      labels: LABELS.filter(o => inBounds(b, o.x, o.y, 0) && (!def.labelMax || o.size <= def.labelMax) && (!def.labelMin || o.size >= def.labelMin || o.kind === 'club')),
      berths: BERTHS.filter(o => inBounds(b, o.x, o.y, 0)),
      slip: inBounds(b, SLIP.x, SLIP.y, 0) ? Object.assign({}, SLIP) : null,
      spawn: def.spawn,
      landmarks: LANDMARKS.filter(o => inBounds(b, o.x, o.y, 120)),
      lanes: LANES.filter(l => keep(l.points)),
      zones: ZONES.filter(z => (z.poly ? keep(z.poly) : inBounds(b, z.x, z.y, z.r))),
      courseArea: def.courseArea || null,
      info: def.info || null,
    };
    for (const k of ['land', 'piers', 'breakwaters']) for (const p of v[k]) if (!p._bb) Object.defineProperty(p, '_bb', { value: bboxOf(p), enumerable: false });
    for (const z of v.depth) Object.defineProperty(z, '_bb', { value: bboxOf(z.poly), enumerable: false });
    return v;
  }

  const venues = {
    bay: makeVenue({
      id: 'bay', name: { da: 'Svanemøllebugten', en: 'Svanemølle Bay' },
      bounds: { x0: -620, y0: -1060, x1: 560, y1: 220 },
      spawn: { x: -150, y: -230, heading: +(35 * D2R).toFixed(4) },
      labelMin: 11,
      info: { da: 'Lavt, beskyttet vand (1,6–3,5 m) mellem stranden og Svaneknoppen. Hold dig ude af badezonen!', en: 'Shallow, sheltered water (1.6–3.5 m) between the beach and Svaneknoppen. Keep out of the swim zone!' },
    }),
    pier: makeVenue({
      id: 'pier', name: { da: 'Klubbens bro', en: 'The club pier' },
      bounds: { x0: -260, y0: -200, x1: 220, y1: 140 }, pad: 150,
      spawn: { x: -70, y: -70, heading: +(140 * D2R).toFixed(4) },
      labelMax: 20,
      info: { da: 'Bassinet ved KØS: 1,6 m dybt, lukket af stenmoler og øbølgebryderen.', en: 'The KØS basin: 1.6 m deep, closed by rock breakwaters and the island breakwater.' },
    }),
    harbor: makeVenue({
      id: 'harbor', name: { da: 'Kalkbrænderiløbet', en: 'Kalkbrænderiløbet channel' },
      bounds: { x0: 120, y0: -1640, x1: 1500, y1: 560 },
      spawn: { x: 560, y: 110, heading: +(80 * D2R).toFixed(4) },
      labelMin: 12,
      info: { da: 'Sejlrenden ind til Svanemøllehavnen. Rød om bagbord, grøn om styrbord, når du sejler IND.', en: 'The channel into Svanemøllehavnen. Red to port, green to starboard when sailing IN.' },
    }),
    sound: makeVenue({
      id: 'sound', name: { da: 'Øresund ved Stubben', en: 'The Øresund off Stubben' },
      bounds: { x0: 1100, y0: -3700, x1: 4400, y1: -600 },
      spawn: { x: 3750, y: -1600, heading: 0 },
      courseArea: { x: 3750, y: -2000, r: 650 },
      labelMin: 16,
      info: { da: 'Åbent vand, 5–13 m dybt. Pas på Stubbens grunde og færgeruten.', en: 'Open water, 5–13 m deep. Watch out for the Stubben shallows and the ferry route.' },
    }),
  };

  // ------------------------------------------------------------------ helpers
  function getV(v) { return typeof v === 'string' ? venues[v] : v; }
  function inBB(bb, x, y, r) { return x >= bb.x0 - r && x <= bb.x1 + r && y >= bb.y0 - r && y <= bb.y1 + r; }

  function isLand(v, x, y) {
    v = getV(v); if (!v) return false;
    for (const p of v.land) if (inBB(p._bb || bboxOf(p), x, y, 0) && pointInPoly(x, y, p)) return true;
    return false;
  }
  function isSolid(v, x, y) {
    v = getV(v); if (!v) return false;
    if (isLand(v, x, y)) return true;
    for (const k of ['breakwaters', 'piers']) for (const p of v[k]) if (inBB(p._bb || bboxOf(p), x, y, 0) && pointInPoly(x, y, p)) return true;
    return false;
  }
  // depth lookups are hot (physics, AI and rendering ask every step for every boat): memoise per venue on a 0.25 m grid
  function depthAt(v, x, y) {
    v = getV(v); if (!v) return DEPTH_DEFAULT;
    const kx = Math.round(x * 4), ky = Math.round(y * 4);
    if (kx > -2e6 && kx < 2e6 && ky > -2e6 && ky < 2e6) {
      let c = v._dcache;
      if (!c || c.size > 250000) { c = new Map(); Object.defineProperty(v, '_dcache', { value: c, enumerable: false, writable: true, configurable: true }); }
      const key = kx * 4000003 + ky;
      let d = c.get(key);
      if (d === undefined) { d = depthRaw(v, kx / 4, ky / 4); c.set(key, d); }
      return d;
    }
    return depthRaw(v, x, y);
  }
  function depthRaw(v, x, y) {
    if (isLand(v, x, y)) return 0;
    let d = v.defaultDepth;
    for (const z of v.depth) if (inBB(z._bb || bboxOf(z.poly), x, y, 0) && pointInPoly(x, y, z.poly)) d = z.d;
    return d;
  }
  // smooth depth (bilinear blend of samples) for nicer shading / gentle grounding
  function depthSmooth(v, x, y, s) {
    s = s || 12;
    return (depthAt(v, x - s, y - s) + depthAt(v, x + s, y - s) + depthAt(v, x - s, y + s) + depthAt(v, x + s, y + s) + 2 * depthAt(v, x, y)) / 6;
  }
  function nearestIn(list, x, y, r, type, best) {
    for (const p of list) {
      if (!inBB(p._bb || bboxOf(p), x, y, r)) continue;
      const inside = pointInPoly(x, y, p);
      const q = polyNearest(x, y, p);
      if (!inside && q.d >= r) continue;
      const pen = inside ? r + q.d : r - q.d;
      if (!best || pen > best.pen) {
        let nx = x - q.x, ny = y - q.y;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        if (inside) { nx = -nx; ny = -ny; }
        best = { type, nx, ny, pen, d: inside ? -q.d : q.d, px: q.x, py: q.y, id: p.id || null, kind: p.kind || type };
      }
    }
    return best;
  }
  // hit(v, x, y, r[, draft[, {buoys}]]) → null or {type: 'land'|'breakwater'|'pier'|'buoy'|'shallow', nx, ny (push-out normal), depth, pen, d}
  function hit(v, x, y, r, draft, opts) {
    v = getV(v); if (!v) return null;
    r = r || 1;
    let best = null;
    best = nearestIn(v.land, x, y, r, 'land', best);
    best = nearestIn(v.breakwaters, x, y, r, 'breakwater', best);
    best = nearestIn(v.piers, x, y, r, 'pier', best);
    // buoys are NOT solid here (KOS.Physics.collide handles marks); pass opts.buoys = true to include them
    if (!best && opts && opts.buoys) {
      for (const bu of v.buoys) {
        const dx = x - bu.x, dy = y - bu.y, d = Math.hypot(dx, dy), rr = r + 0.8;
        if (d < rr) { best = { type: 'buoy', nx: dx / (d || 1), ny: dy / (d || 1), pen: rr - d, d, id: bu.id, kind: bu.kind }; break; }
      }
    }
    const depth = depthAt(v, x, y);
    if (best) { best.depth = depth; return best; }
    if (draft && depth < draft) {
      // normal = towards deeper water (sampled gradient)
      const s = 6;
      let gx = depthAt(v, x + s, y) - depthAt(v, x - s, y), gy = depthAt(v, x, y + s) - depthAt(v, x, y - s);
      if (!gx && !gy) { const q = nearestShore(v, x, y); gx = x - q.x; gy = y - q.y; }
      const l = Math.hypot(gx, gy) || 1;
      return { type: 'shallow', nx: gx / l, ny: gy / l, depth, pen: draft - depth, d: 0 };
    }
    return null;
  }
  function nearestShore(v, x, y) {
    v = getV(v);
    let best = { x, y, d: Infinity };
    for (const p of v.land) { const q = polyNearest(x, y, p); if (q.d < best.d) best = q; }
    return best;
  }
  function inZone(v, x, y, kind) {
    v = getV(v);
    for (const z of v.zones) {
      if (kind && z.kind !== kind) continue;
      if (z.poly ? pointInPoly(x, y, z.poly) : Math.hypot(x - z.x, y - z.y) < z.r) return z;
    }
    return null;
  }
  // is a straight path clear of land/breakwaters/piers (sampled)?
  function clearPath(v, a, b, step) {
    v = getV(v); step = step || 5;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let i = 0; i <= n; i++) { const t = i / n; if (isSolid(v, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
    return true;
  }

  KOS.World = {
    venues,
    ids: Object.keys(venues),
    get(id) { return venues[id] || null; },
    isLand, isSolid, depthAt, depthSmooth, hit, nearestShore, inZone, clearPath,
    // the whole shared world (for the hub map and previews)
    global: { coast: COAST, breakwaters: BREAKWATERS, piers: PIERS, depth: DEPTH, defaultDepth: DEPTH_DEFAULT, buoys: BUOYS, lights: LIGHTS, lanes: LANES, zones: ZONES, landmarks: LANDMARKS, labels: LABELS, berths: BERTHS, slip: SLIP, jetties: JETTIES },
    // points of interest in world meters (used by the hub map pins and by modes for camera intros)
    poi: {
      club: { x: 96, y: 22 }, pier: { x: 10, y: -30 }, rib: { x: 56, y: -40 }, school: { x: -300, y: -150 },
      bay: { x: -290, y: -640 }, rules: { x: 200, y: -560 }, nav: { x: chanX(-700), y: -700 }, race: { x: 3750, y: -2000 },
      mole: { x: -288, y: -424 }, marina: { x: 310, y: 290 }, ferry: { x: 960, y: -262 }, stubben: { x: 2350, y: -1500 },
    },
    chanX,
    util: { pointInPoly, polyNearest, bboxOf, strip, rectFrom, rectAt, ellipse },
  };
})(typeof window !== 'undefined' ? window : globalThis);
