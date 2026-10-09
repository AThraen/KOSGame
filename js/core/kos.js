// KØS SEJL — js/core/kos.js
// The KOS namespace root: math helpers (KOS.U), the fixed sim step (KOS.DT) and a tiny event bus (KOS.Events).
// Pure logic: no DOM, no Math.random, no wall clock. Loads in Node via tools/harness.js.
//
// Conventions (see SPEC.md): meters, x east, y SOUTH. Headings in radians, 0 = north, clockwise.
//   KOS.U.vec(h) = {x: sin h, y: -cos h}.  KOS.U.heading(dx, dy) is the inverse (direction of a vector).
//   KOS.U.angDiff(a, b) = wrapPi(b - a): the signed turn that takes heading a to heading b (+ = turn right).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const PI = Math.PI;
  const TAU = PI * 2;
  const KN = 0.514444; // m/s per knot

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapPi(a) {
    if (!isFinite(a)) return 0;
    a = a % TAU;
    if (a <= -PI) a += TAU;
    else if (a > PI) a -= TAU;
    return a;
  }
  function wrap2Pi(a) { a = a % TAU; return a < 0 ? a + TAU : a; }
  function angDiff(a, b) { return wrapPi(b - a); }
  function angLerp(a, b, t) { return wrapPi(a + wrapPi(b - a) * t); }
  function rad(d) { return d * PI / 180; }
  function deg(r) { return r * 180 / PI; }
  function vec(h, len) { const l = len === undefined ? 1 : len; return { x: Math.sin(h) * l, y: -Math.cos(h) * l }; }
  function heading(dx, dy) { return Math.atan2(dx, -dy); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function px(p) { return Array.isArray(p) ? p[0] : p.x; }
  function py(p) { return Array.isArray(p) ? p[1] : p.y; }
  function dist(a, b) { return len(px(a) - px(b), py(a) - py(b)); }
  function bearing(a, b) { return heading(px(b) - px(a), py(b) - py(a)); }
  function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function smoothstep(e0, e1, x) {
    if (e0 === e1) return x < e0 ? 0 : 1;
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  /** Exponential approach factor for a time constant tau (s) over dt: v += (target - v) * approach(dt, tau). */
  function approach(dt, tau) { return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau); }
  function kn(ms) { return ms / KN; }
  function ms(k) { return k * KN; }

  // Wind speed DISPLAY unit (internal wind speeds are always knots). 'ms' (default) | 'kn'; set from the settings by KOS.App.
  let windUnit_ = 'ms';
  function setWindUnit(u) { windUnit_ = u === 'kn' ? 'kn' : 'ms'; return windUnit_; }
  function windUnit() { return windUnit_; }
  /** Wind speed given in knots -> number in the chosen display unit, rounded to dec decimals (default 0). */
  /** Unit label only: "m/s" or "kn". */
  function windUnitLabel() { return windUnit_ === 'kn' ? 'kn' : 'm/s'; }
  function windVal(k, dec) {
    const v = windUnit_ === 'kn' ? k : k * KN, f = Math.pow(10, dec || 0);
    return Math.round((+v || 0) * f) / f;
  }
  /** Wind speed given in knots -> text with unit, e.g. "5 m/s" or "10 kn". long = spell the unit out in knots ("10 knob"/"10 knots"). */
  function windTxt(k, long, dec) {
    const v = windVal(k, dec);
    if (windUnit_ !== 'kn') return v + ' m/s';
    return v + ' ' + (long && KOS.t ? KOS.t('common.knots') : 'kn');
  }

  /** String/number -> 32-bit unsigned seed. */
  function hash(s) {
    if (typeof s === 'number' && isFinite(s)) s = String(s);
    s = String(s === undefined || s === null ? 'kos' : s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /** mulberry32 seeded PRNG -> function returning [0,1). Extra helpers on the function: .range(a,b), .int(n), .pick(arr), .sign(). */
  function rng(seed) {
    let a = (typeof seed === 'number' && isFinite(seed) ? seed >>> 0 : hash(seed)) || 0x9e3779b9;
    const f = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = n => Math.floor(f() * n);
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  }
  /** Integer lattice hash in [0,1). */
  function hash01(seed, i) {
    let h = (Math.imul((seed >>> 0) ^ 0x27d4eb2d, 0x165667b1) + Math.imul(i | 0, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /** Smooth 1D value noise in [-1, 1]. Deterministic for (seed, t). */
  function noise1(seed, t) {
    const s = typeof seed === 'number' ? seed >>> 0 : hash(seed);
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash01(s, i), hash01(s, i + 1), u) * 2 - 1;
  }
  /** Smooth 2D value noise in [-1, 1]. */
  function noise2(seed, x, y) {
    const s = typeof seed === 'number' ? seed >>> 0 : hash(seed);
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash01(s, a * 73856093 ^ b * 19349663);
    const a = lerp(h(ix, iy), h(ix + 1, iy), ux);
    const b = lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux);
    return lerp(a, b, uy) * 2 - 1;
  }

  // ---- polygons: arrays of [x, y] (objects {x, y} also accepted) ----
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = px(poly[i]), yi = py(poly[i]), xj = px(poly[j]), yj = py(poly[j]);
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
    }
    return inside;
  }
  /** Nearest point on segment AB to P -> {x, y, d, t}. */
  function segNearest(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
    const nx = ax + dx * t, ny = ay + dy * t;
    return { x: nx, y: ny, d: len(x - nx, y - ny), t };
  }
  /** Distance from P to segment AB. segDistance(px, py, ax, ay, bx, by) or segDistance(p, a, b). */
  function segDistance(x, y, ax, ay, bx, by) {
    if (typeof x === 'object') { const p = x, a = y, b = ax; return segNearest(px(p), py(p), px(a), py(a), px(b), py(b)).d; }
    return segNearest(x, y, ax, ay, bx, by).d;
  }
  /** Closest points between segments P1P2 and Q1Q2 -> {d, ax, ay, bx, by, s, t}. */
  function segSeg(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
    const d1x = p2x - p1x, d1y = p2y - p1y, d2x = q2x - q1x, d2y = q2y - q1y;
    const rx = p1x - q1x, ry = p1y - q1y;
    const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
    let s, t;
    if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
    else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
    else {
      const c = d1x * rx + d1y * ry;
      if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
      else {
        const b = d1x * d2x + d1y * d2y;
        const den = a * e - b * b;
        s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    const ax = p1x + d1x * s, ay = p1y + d1y * s, bx = q1x + d2x * t, by = q1y + d2y * t;
    return { d: len(ax - bx, ay - by), ax, ay, bx, by, s, t };
  }
  /** Nearest point on a polygon's outline -> {x, y, d, i (edge index)}. */
  function polyNearest(x, y, poly, open) {
    let best = { x: x, y: y, d: Infinity, i: -1 };
    const n = poly.length;
    const m = open ? n - 1 : n;
    for (let i = 0; i < m; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const r = segNearest(x, y, px(a), py(a), px(b), py(b));
      if (r.d < best.d) best = { x: r.x, y: r.y, d: r.d, i };
    }
    return best;
  }
  function polyBounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { const x = px(p), y = py(p); if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x0, y0, x1, y1 };
  }
  function polyArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (px(poly[j]) + px(poly[i])) * (py(poly[j]) - py(poly[i]));
    return Math.abs(a / 2);
  }
  function polyCentroid(poly) {
    let x = 0, y = 0;
    for (const p of poly) { x += px(p); y += py(p); }
    return { x: x / (poly.length || 1), y: y / (poly.length || 1) };
  }
  /** Which side of the directed line A->B is P? +1 = right (screen), -1 = left. */
  function side(ax, ay, bx, by, x, y) { return sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); }
  /** Did the move P0->P1 cross segment AB? */
  function segCross(p0x, p0y, p1x, p1y, ax, ay, bx, by) {
    const d = (p1x - p0x) * (by - ay) - (p1y - p0y) * (bx - ax);
    if (Math.abs(d) < 1e-12) return false;
    const u = ((ax - p0x) * (by - ay) - (ay - p0y) * (bx - ax)) / d;
    const v = ((ax - p0x) * (p1y - p0y) - (ay - p0y) * (p1x - p0x)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  KOS.U = {
    PI, TAU, KN,
    clamp, lerp, wrapPi, wrap2Pi, angDiff, angLerp, rad, deg, vec, heading, len, dist, bearing, rot, sign,
    smoothstep, approach, kn, ms, setWindUnit, windUnit, windUnitLabel, windVal, windTxt, hash, rng, noise1, noise2,
    pointInPoly, segNearest, segDistance, segSeg, polyNearest, polyBounds, polyArea, polyCentroid, side, segCross,
    px, py,
  };

  KOS.DT = 1 / 60;

  // ---- tiny event bus ----
  const handlers = {};
  KOS.Events = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return fn; },
    once(name, fn) { const w = p => { KOS.Events.off(name, w); fn(p); }; return KOS.Events.on(name, w); },
    off(name, fn) {
      if (!handlers[name]) return;
      if (!fn) { handlers[name] = []; return; }
      handlers[name] = handlers[name].filter(h => h !== fn);
    },
    emit(name, payload) {
      const list = handlers[name];
      if (!list || !list.length) return;
      for (const h of list.slice()) {
        try { h(payload, name); } catch (e) { if (typeof console !== 'undefined') console.error('[KOS.Events]', name, e); }
      }
    },
    clear() { for (const k in handlers) delete handlers[k]; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
