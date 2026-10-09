// KØS SEJL — js/render/scene.js
// KOS.SailScene: the top-down sailing renderer used by every 'sea' mode.
//   const scene = new KOS.SailScene(canvas, {venue, wind, boats, marks, lines, follow, zoom, showWindArrow,
//                                            showLaylines, showNoGo, night, showTags, showLanes});
//   scene.render(alpha)  once per animation frame (keeps its own render clock for animation)
// Camera: smooth follow with look-ahead in the direction of travel, auto zoom by device size and boat length
// (opts.zoom is a multiplier), shake(k). Land is cached in DPR-aware tiles per zoom bucket; water, gusts,
// waves, wakes, boats and buoys are drawn live with culling. Mode overlays draw in world meters via
// addOverlay(fn(ctx, scene)). Screen helpers: worldToScreen, screenToWorld, scene.mpp (meters per css px).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapPi = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const FONT = 'ui-rounded,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif';
  const LAND = '#fff1b3', SAND = '#f6df9c', SAND_EDGE = '#d9b25f', GRASS = '#cfe6a4';
  function makeCanvas(w, h) { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } return new OffscreenCanvas(w, h); }
  function hash2(x, y) { let h = (Math.round(x * 13) * 374761393 + Math.round(y * 7) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pointInPoly(x, y, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
  function bbox(poly) { if (poly._bb) return poly._bb; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } const b = { x0, y0, x1, y1 }; try { Object.defineProperty(poly, '_bb', { value: b, enumerable: false }); } catch (e) {} return b; }
  const hit = (b, r, pad) => !(b.x1 < r.x0 - pad || b.x0 > r.x1 + pad || b.y1 < r.y0 - pad || b.y0 > r.y1 + pad);
  function polyPath(ctx, poly) { ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); }
  const P = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  const tt = (v) => (v && typeof v === 'object' ? (KOS.tt ? KOS.tt(v) : v.da || v.en) : v);
  function shade(c, k) { return KOS.Sprites && KOS.Sprites.shade ? KOS.Sprites.shade(c, k) : c; }
  function rrect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function SailScene(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.venue = opts.venue || null;
    this.wind = opts.wind || null;
    this.boats = opts.boats || [];
    this.marks = opts.marks || [];
    this.lines = opts.lines || [];
    this.showWindArrow = opts.showWindArrow !== false;
    this.showLaylines = !!opts.showLaylines;
    this.showNoGo = !!opts.showNoGo;
    this.showTags = opts.showTags !== false;
    this.showLanes = !!opts.showLanes;
    this.showLabels = opts.showLabels !== false;
    this.night = opts.night || 0;
    this.laylineTarget = opts.laylineTarget || null;
    this.zoomMul = typeof opts.zoom === 'number' ? opts.zoom : 1;
    this.camera = { x: 0, y: 0, zoom: 20, rot: opts.rot || 0, pitch: 0 }; // pitch: radians from top-down (tilted view)
    this.target = null;
    this._look = { x: 0, y: 0 };
    this._snap = true;
    SailScene.current = this; SailScene.view.overview = false; // a new activity starts in the normal view
    this.overlays = [];
    this.screenOverlays = [];
    this.effects = KOS.Effects ? new KOS.Effects() : null;
    this.water = KOS.Water ? KOS.Water.create(this.venue) : null;
    this.t = 0; this._last = null;
    this._shake = 0;
    this.tiles = new Map(); this.bucket = 0;
    this.view = { x0: 0, y0: 0, x1: 1, y1: 1 };
    this.mpp = 0.05;
    this.dpr = 1; this.w = 1; this.h = 1;
    this._spiPrev = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    this.sound = opts.sound !== false;
    // Skrå visning (tilted camera, docs/specs/tilt-camera.md): T eases toward _tiltWant; _tilt is the per-frame
    // projection cache, null whenever the effective pitch < PITCH_MIN (then every draw takes the untouched flat path)
    const TL = KOS.Tilt;
    this._tiltWant = TL && TL.force != null ? (TL.force ? 1 : 0) : opts.tilt ? 1 : 0;
    this._tiltT = this._tiltWant; this._tilt = null; this._tiltBuf = {};
    this.props = []; // depth-sorted extras from modes: { x, y, draw(ctx, scene, tilt) }; iterated only under tilt (§4.6)
    this._tiltAuto = !!opts.tiltAuto; this._tiltDrop = false; this._reduced = !!(KOS.UI && KOS.UI.reduced && KOS.UI.reduced()); this._rot0 = opts.rot || 0; // auto-sourced tilt (perf drop rule, §7.2); cached reduced motion, refreshed on 'settings'
    this.kY = 1; this.viewItems = this.view; this.chase = !!(TL && TL.chase);
    if (opts.follow) this.follow(opts.follow);
    else if (this.venue && this.venue.spawn) { this.camera.x = this.venue.spawn.x; this.camera.y = this.venue.spawn.y; }
    this._bindEvents();
    this.resize();
  }
  const S = SailScene.prototype;

  S._bindEvents = function () {
    const E = KOS.Events; if (!E || !E.on) return;
    const self = this, fx = () => self.effects;
    this._handlers = {
      'settings': () => { self._reduced = !!(KOS.UI && KOS.UI.reduced && KOS.UI.reduced()); },
      'boat:ground': (e) => { if (!fx() || !e) return; const b = e.boat || e; fx().splash(e.x != null ? e.x : b.x, e.y != null ? e.y : b.y, clamp((e.speed || 1) / 2, 0.4, 1.5)); if (b && (b === self.target || b.isPlayer)) self.shake(clamp((e.speed || 1) / 2, 0.3, 1)); },
      'boat:collide': (e) => { if (!fx() || !e) return; fx().splash(e.x, e.y, clamp((e.speed || 1) / 2, 0.3, 1.2)); if (e.a === self.target || e.b === self.target) self.shake(0.6); },
      'boat:capsize': (e) => { const b = e && (e.boat || e); if (fx() && b) { fx().splash(b.x, b.y, 1.5); if (b === self.target) self.shake(0.8); } },
      'boat:righted': (e) => { const b = e && (e.boat || e); if (fx() && b) fx().splash(b.x, b.y, 0.8); },
      'boat:tack': (e) => { const b = e && (e.boat || e); if (fx() && b) fx().ripple(b.x, b.y, 3, 1.2); },
      'boat:gybe': (e) => { const b = e && (e.boat || e); if (fx() && b) { fx().ripple(b.x, b.y, 3.5, 1.2); fx().spray(b.x, b.y, b.heading || 0, 0.4); } },
    };
    for (const k in this._handlers) E.on(k, this._handlers[k]);
  };
  S.destroy = function () { const E = KOS.Events; if (E && E.off && this._handlers) for (const k in this._handlers) E.off(k, this._handlers[k]); this._handlers = null; this.tiles.clear(); };

  S.setVenue = function (v) { this.venue = v; this.water = KOS.Water ? KOS.Water.create(v) : null; this.tiles.clear(); this._decor = null; };
  S.follow = function (b) { this.target = b || null; this._snap = true; return this; };
  S.setZoom = function (mul) { this.zoomMul = mul; };
  S.shake = function (k) { this._shake = Math.max(this._shake, clamp(k == null ? 0.5 : k, 0, 1.5)); };
  S.addOverlay = function (fn, o) { (o && o.screen ? this.screenOverlays : this.overlays).push(fn); return fn; };
  S.removeOverlay = function (fn) { this.overlays = this.overlays.filter((f) => f !== fn); this.screenOverlays = this.screenOverlays.filter((f) => f !== fn); };

  S.resize = function () {
    const c = this.canvas;
    let w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) { w = (typeof window !== 'undefined' && window.innerWidth) || 800; h = (typeof window !== 'undefined' && window.innerHeight) || 600; }
    const small = Math.min(w, h) < 600;
    // KOS.Perf.level (set by the app's frame-time governor): 2 = full, 1 = lighter, 0 = slow device → fewer pixels
    const lvl = KOS.Perf ? KOS.Perf.level : 2;
    const cap = lvl >= 2 ? (small ? 2 : 2.5) : lvl === 1 ? 1.6 : 1.15;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
    this._perfLvl = lvl;
    this.w = w; this.h = h; this.dpr = dpr;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  };

  S.baseZoom = function () {
    const tgt = this.target;
    const L = tgt ? boatLen(tgt) : 5;
    const sp = tgt ? Math.abs(tgt.speed || 0) : 0;
    let span = (18 + 4 * L) * (1 + clamp(sp / 25, 0, 0.35));
    const small = Math.min(this.w, this.h) < 600;
    let z = Math.sqrt(this.w * this.h) / span * (small ? 1.3 : 1);
    if (this._tiltT > 0 && KOS.Tilt) z *= 1 + (KOS.Tilt.ZOOM_MUL - 1) * this._tiltT; // closer under tilt (flat path untouched)
    return z * this.zoomMul;
  };
  // masthead height in metres for the tilted tag anchor (RIB / motor boats: console height)
  function boatMastH(b) { const g = KOS.Sprites && KOS.Sprites.geo ? KOS.Sprites.geo(b.cls || 'opti') : null; return g && g.mastH ? g.mastH : 1.4; }
  function boatLen(b) { if (b.cls && typeof b.cls === 'object' && b.cls.length) return b.cls.length; const g = KOS.Sprites && KOS.Sprites.geo ? KOS.Sprites.geo(b.cls || 'opti') : null; return g ? g.L : 4; }

  // zoom that fits the whole venue on screen (the "overview")
  S.fitZoom = function () {
    const b = this.venue && this.venue.bounds;
    if (!b || !this.w || !this.h) return 0;
    return Math.min(this.w / (b.x1 - b.x0), this.h / (b.y1 - b.y0)) * 0.98;
  };
  S.updateCamera = function (dt) {
    const cam = this.camera, V = SailScene.view, zFit = this.fitZoom();
    const over = V.overview && zFit > 0;
    let zt = this.fixedZoom || this.baseZoom();
    if (over) zt = zFit; else { zt *= V.mul; if (zFit) zt = Math.max(zt, zFit); }
    const tgt = over ? null : this.target;
    if (over) { const b = this.venue.bounds, k = 1 - Math.exp(-dt * 3.2); cam.x += ((b.x0 + b.x1) / 2 - cam.x) * k; cam.y += ((b.y0 + b.y1) / 2 - cam.y) * k; }
    if (tgt) {
      const vx = tgt.vx != null ? tgt.vx : Math.sin(tgt.heading || 0) * (tgt.speed || 0);
      const vy = tgt.vy != null ? tgt.vy : -Math.cos(tgt.heading || 0) * (tgt.speed || 0);
      const maxLook = Math.min(this.w, this.h) / cam.zoom * 0.22;
      let lx = vx * 2.4, ly = vy * 2.4; const ll = Math.hypot(lx, ly); if (ll > maxLook) { lx *= maxLook / ll; ly *= maxLook / ll; }
      const kl = 1 - Math.exp(-dt * 1.2);
      this._look.x += (lx - this._look.x) * kl; this._look.y += (ly - this._look.y) * kl;
      const tx = tgt.x + this._look.x, ty = tgt.y + this._look.y;
      if (this._snap) { cam.x = tgt.x; cam.y = tgt.y; cam.zoom = zt; this._snap = false; this._look.x = this._look.y = 0; }
      else { const k = 1 - Math.exp(-dt * 3.2); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; }
    } else if (this._snap) { cam.zoom = zt; this._snap = false; }
    cam.zoom += (zt - cam.zoom) * (1 - Math.exp(-dt * 2));
    if (this.chase) { // dev flag #chase=1 (§3.6): the camera turns with the target; off (rot back to start) when reduced motion or the tilt is off
      if (!this._reduced && this._tiltT > 0 && tgt) cam.rot += KOS.U.angDiff(cam.rot, tgt.heading || 0) * (1 - Math.exp(-dt * 1.5));
      else cam.rot = this._rot0;
    }
    this._shake = Math.max(0, this._shake - dt * 1.8);
  };
  // frame the given world rect (e.g. a whole race course)
  // Tilted (_tiltWant, set in the constructor): the Y span shrinks by k, so use kWant = cos(P0) (conservative: the real pitch is P0*zf <= P0), spec §5.
  S.fit = function (r, pad) {
    pad = pad == null ? 40 : pad; this.camera.x = (r.x0 + r.x1) / 2; this.camera.y = (r.y0 + r.y1) / 2;
    if (this._tiltWant) this.fixedZoom = Math.min((this.w - pad * 2) / (r.x1 - r.x0), (this.h - pad * 2) / ((r.y1 - r.y0) * Math.cos(KOS.Tilt.basePitch(this.w, this.h))));
    else this.fixedZoom = Math.min((this.w - pad * 2) / (r.x1 - r.x0), (this.h - pad * 2) / (r.y1 - r.y0));
    this.camera.zoom = this.fixedZoom; this.target = null;
  };
  S.unfit = function () { this.fixedZoom = null; };
  // world (x, y, height z) → screen CSS px (no shake). Flat: z is ignored (= worldToScreen).
  S.project = function (x, y, z) { return this._tilt ? KOS.Tilt.project(this._tilt, x, y, z || 0, {}) : this.worldToScreen(x, y); };
  // screen-aligned, unsquashed CSS-px transform at the projected point (caller wraps in save/restore)
  S.upright = function (ctx, x, y, z) {
    const p = this.project(x, y, z), d = this.dpr;
    ctx.setTransform(d, 0, 0, d, d * (p.x + (this._shx || 0)), d * (p.y + (this._shy || 0)));
  };
  // per-frame tilt: ease T toward the target, then rebuild the projection cache (null below PITCH_MIN → flat path)
  S._updateTilt = function (dt) {
    const TL = KOS.Tilt, V = SailScene.view, c = this.camera;
    // _tiltWant precedence (§7.2): overview → 0; else the quick-toggle override; else the dev force or the resolved setting; then the auto perf-drop rule
    let want = TL.force != null ? +!!TL.force : this.opts.tilt ? 1 : 0;
    if (V.tilt != null) want = +!!V.tilt;
    else if (this._tiltAuto && TL.force == null) { if (KOS.Perf && KOS.Perf.level === 0) this._tiltDrop = true; if (this._tiltDrop) want = 0; } // governor hit level 0: ease out, never back this run
    if (V.overview) want = 0;
    this._tiltWant = want;
    if (this._tiltT !== want) this._tiltT = TL.ease(this._tiltT, want, dt, this._reduced); // reduced motion snaps
    if (this.chase) this.biasY = this.target && !this.fixedZoom && !this._reduced ? this._tiltT * TL.zoomFade(c.zoom) * TL.BIAS * this.h : 0; // only with the chase cam (§3.3)
    this._tilt = this._tiltT ? KOS.Tilt.makeTilt({ T: this._tiltT, cam: c, w: this.w, h: this.h, biasY: this.biasY || 0, dpr: this.dpr, shx: this._shx, shy: this._shy, perf: KOS.Perf ? KOS.Perf.level : 2 }, this._tiltBuf) : null;
    c.pitch = this._tilt ? this._tilt.pitch : 0;
    this.kY = this._tilt ? this._tilt.k : 1;
  };

  S.worldToScreen = function (x, y) {
    if (typeof x === 'object') { y = x.y; x = x.x; }
    const c = this.camera, cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
    if (this._tilt) return KOS.Tilt.project(this._tilt, x, y, 0, {});
    const dx = x - c.x, dy = y - c.y;
    return { x: this.w / 2 + (dx * cs - dy * sn) * c.zoom, y: this.h / 2 + (this.biasY || 0) + (dx * sn + dy * cs) * c.zoom };
  };
  S.screenToWorld = function (sx, sy) {
    if (typeof sx === 'object') { sy = sx.y; sx = sx.x; }
    if (this._tilt) return KOS.Tilt.unproject(this._tilt, sx, sy, 0, {});
    const c = this.camera, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const dx = (sx - this.w / 2) / c.zoom, dy = (sy - this.h / 2 - (this.biasY || 0)) / c.zoom;
    return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
  };
  S.applyWorld = function (ctx) {
    const c = this.camera, sh = this._shake;
    const sx = sh ? (Math.random() - 0.5) * sh * 14 : 0, sy = sh ? (Math.random() - 0.5) * sh * 14 : 0;
    this._shx = sx; this._shy = sy; // kept for upright draws under tilt (not read when flat)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.w / 2 + sx, this.h / 2 + (this.biasY || 0) + sy); // biasY: px the camera centre sits below the screen centre (more room ahead of the boat)
    if (this._tilt) { const T = this._tilt; ctx.scale(1, T.k); T.shx = sx; T.shy = sy; T.ox = T.cx + sx; T.oy = T.cy + sy; } // squash screen-Y, before rotate (§3.4)
    if (c.rot) ctx.rotate(-c.rot);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);
  };

  // ------------------------------------------------------------------------------------------
  S.render = function (alpha) {
    const t1 = now(); const dt = this._last == null ? 1 / 60 : clamp(t1 - this._last, 0, 0.1); this._last = t1;
    this.t += dt;
    const t = this.t, ctx = this.ctx;
    if (this.canvas.clientWidth && (Math.round(this.canvas.clientWidth * this.dpr) !== this.canvas.width || Math.round(this.canvas.clientHeight * this.dpr) !== this.canvas.height || (KOS.Perf && KOS.Perf.level !== this._perfLvl))) this.resize();
    this.updateCamera(dt);
    if (KOS.Tilt) this._updateTilt(dt);
    const fx = this.effects;
    if (fx) { fx.update(dt); for (const b of this.boats) if (b && !b.hidden) fx.trackBoat(b, dt); }
    this._soundHooks();
    // view rect
    if (this._tilt) { // ground AABB, plus a taller one for upright items, both into reused objects (§3.5)
      this.view = KOS.Tilt.viewAABB(this._tilt, this.w, this.h, this._viewT || (this._viewT = {}));
      this.viewItems = KOS.Tilt.viewItemsAABB(this._tilt, this.w, this.h, this._viewI || (this._viewI = {}));
    } else {
    const corners = [this.screenToWorld(0, 0), this.screenToWorld(this.w, 0), this.screenToWorld(0, this.h), this.screenToWorld(this.w, this.h)];
    this.view = { x0: Math.min(...corners.map((p) => p.x)), y0: Math.min(...corners.map((p) => p.y)), x1: Math.max(...corners.map((p) => p.x)), y1: Math.max(...corners.map((p) => p.y)) };
    this.viewItems = this.view;
    }
    this.mpp = 1 / this.camera.zoom;
    const ppm = this.camera.zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.applyWorld(ctx);
    const wind = this.wind || { dir: 0, speed: 8, gusts: [] };
    if (this.water) this.water.render(ctx, this, wind, t);
    this.drawZones(ctx);
    if (fx) fx.render(ctx, this, 'under');
    if (this.water) this.water.renderShore(ctx, this, t);
    this.drawLandTiles(ctx);
    this.drawLandLive(ctx, t);
    if (this.showLabels) this.drawLabels(ctx);
    this.drawLines(ctx, t);
    if (this.showLaylines) this.drawLaylines(ctx);
    if (this.showNoGo && this.target) this.drawNoGo(ctx, this.target, t);
    // upright things & boats, back to front
    const items = [];
    if (this._tilt) { // tilted: cull by the taller viewItems box, sort key = camera depth v (kept in .y)
      const v = this.viewItems, TL = this._tilt, dep = KOS.Tilt.depth;
      if (this.venue && this.venue.buoys) for (const b of this.venue.buoys) if (b.x > v.x0 - 10 && b.x < v.x1 + 10 && b.y > v.y0 - 10 && b.y < v.y1 + 10) items.push({ y: dep(TL, b.x, b.y), k: 0, o: b });
      for (const m of this.marks) if (m && m.x > v.x0 - 20 && m.x < v.x1 + 20 && m.y > v.y0 - 20 && m.y < v.y1 + 20) items.push({ y: dep(TL, m.x, m.y), k: 1, o: m });
      for (const b of this.boats) if (b && !b.hidden && b.x > v.x0 - 30 && b.x < v.x1 + 30 && b.y > v.y0 - 30 && b.y < v.y1 + 30) items.push({ y: dep(TL, b.x, b.y), k: 2, o: b });
      for (const p of this.props) if (p && p.x > v.x0 - 30 && p.x < v.x1 + 30 && p.y > v.y0 - 30 && p.y < v.y1 + 30) items.push({ y: dep(TL, p.x, p.y), k: 3, o: p });
    } else {
    const v = this.view;
    if (this.venue && this.venue.buoys) for (const b of this.venue.buoys) if (b.x > v.x0 - 10 && b.x < v.x1 + 10 && b.y > v.y0 - 10 && b.y < v.y1 + 10) items.push({ y: b.y, k: 0, o: b });
    for (const m of this.marks) if (m && m.x > v.x0 - 20 && m.x < v.x1 + 20 && m.y > v.y0 - 20 && m.y < v.y1 + 20) items.push({ y: m.y, k: 1, o: m });
    for (const b of this.boats) if (b && !b.hidden && b.x > v.x0 - 30 && b.x < v.x1 + 30 && b.y > v.y0 - 30 && b.y < v.y1 + 30) items.push({ y: b.y, k: 2, o: b });
    }
    items.sort((a, b) => a.y - b.y);
    this._items = items; // (debug handle: last frame's depth-sorted list)
    const S2 = KOS.Sprites, wd = wind.dir || 0, rot = this.camera.rot;
    for (const it of items) {
      if (!S2) break;
      if (it.k === 3) { ctx.save(); try { it.o.draw(ctx, this, this._tilt); } catch (e) { if (!this._ovErr) { this._ovErr = 1; console.error(e); } } ctx.restore(); }
      else if (it.k === 0) S2.drawBuoy(ctx, it.o.kind, it.o.x, it.o.y, this._tilt ? { t, ppm, light: it.o.light, night: this.night, rot, scale: 1.5, windDir: wd, tilt: this._tilt } : { t, ppm, light: it.o.light, night: this.night, rot, scale: 1.5 });
      else if (it.k === 1) { S2.drawMark(ctx, it.o, this._tilt ? { t, ppm, windDir: wd, rot, scale: it.o.scale || 1.6, night: this.night, tilt: this._tilt } : { t, ppm, windDir: wd, rot, scale: it.o.scale || 1.6, night: this.night }); this.drawMarkExtras(ctx, it.o, t); }
      else {
        const b = it.o, isT = b === this.target;
        if (this._tilt) S2.drawBoat(ctx, b, { t, ppm, highlight: isT && this.opts.highlightPlayer !== false, alpha: b.ghost ? 0.45 : undefined, tilt: this._tilt, target: isT });
        else S2.drawBoat(ctx, b, { t, ppm, highlight: isT && this.opts.highlightPlayer !== false, alpha: b.ghost ? 0.45 : undefined });
      }
    }
    if (fx) fx.render(ctx, this, 'over');
    for (const fn of this.overlays) { try { ctx.save(); fn(ctx, this); ctx.restore(); } catch (e) { if (!this._ovErr) { this._ovErr = 1; console.error(e); } } }
    if (this.showTags) this.drawTags(ctx);
    if (this.night > 0) this.drawNight(ctx, t);
    if (this.showWindArrow && this.target) this.drawWindArrow(ctx, t);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this._tilt) this.drawHaze(ctx); // under the HUD / target arrows, over the world
    for (const fn of this.screenOverlays) { try { ctx.save(); fn(ctx, this); ctx.restore(); } catch (e) {} }
    // soft vignette
    if (!this._vig || this._vig.w !== this.w || this._vig.h !== this.h) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.62);
      g.addColorStop(0, 'rgba(5,15,35,0)'); g.addColorStop(1, 'rgba(5,15,35,0.28)'); this._vig = { w: this.w, h: this.h, g };
    }
    ctx.fillStyle = this._vig.g; ctx.fillRect(0, 0, this.w, this.h);
  };

  // Tilted view: sky haze at the top of the screen for depth (§3.5): a vertical gradient over the top 22% plus a 2 px glint at
  // y=0, strength T*zoomFade (0 at the venue overview). Gradient cached per (h, alpha step, night).
  S.drawHaze = function (ctx) {
    const T = this._tilt, a = T.T * T.zf; if (a < 0.02) return;
    const q = Math.round(a * 20), nt = this.night > 0.3 ? 1 : 0, h = this.h, key = h + ':' + q + ':' + nt;
    let hz = this._haze;
    if (!hz || hz.key !== key) {
      const n = nt ? '20,30,60' : '200,225,245', aa = q / 20, g = ctx.createLinearGradient(0, 0, 0, h * 0.22);
      g.addColorStop(0, 'rgba(' + n + ',' + 0.55 * aa + ')'); g.addColorStop(1, 'rgba(' + n + ',0)');
      hz = this._haze = { key, g, glint: 'rgba(255,255,255,' + 0.1 * aa + ')' };
    }
    ctx.fillStyle = hz.g; ctx.fillRect(0, 0, this.w, h * 0.22);
    ctx.fillStyle = hz.glint; ctx.fillRect(0, 0, this.w, 2);
  };

  S._soundHooks = function () {
    if (!this.sound || !KOS.Audio || !KOS.Audio.play || !this._spiPrev) return;
    for (const b of this.boats) {
      if (!b || !(b.isPlayer || b === this.target)) continue;
      const prev = this._spiPrev.get(b), on = !!b.spinnaker;
      if (prev === false && on) { try { KOS.Audio.play('pop', { vol: 0.6 }); } catch (e) {} if (this.effects) this.effects.ripple(b.x, b.y, 4, 0.8); }
      this._spiPrev.set(b, on);
    }
  };

  // ------------------------------------------------------------------------------------------
  // Land: static content rendered into tiles (zoom-bucketed, DPR-aware)
  const TILE = 256;
  S.drawLandTiles = function (ctx) {
    const v = this.venue; if (!v) return;
    const ppm = this.camera.zoom * this.dpr;
    // bucket with hysteresis
    let b = this.bucket;
    if (!b || ppm / b > 1.45 || ppm / b < 0.7) { b = Math.pow(2, Math.round(Math.log2(clamp(ppm, 0.125, 48)))); if (b !== this.bucket) { this.bucket = b; } }
    const tw = TILE / b;
    const vw = this.view;
    const tx0 = Math.floor(vw.x0 / tw), tx1 = Math.floor(vw.x1 / tw), ty0 = Math.floor(vw.y0 / tw), ty1 = Math.floor(vw.y1 / tw);
    let budget = this._firstTiles ? 6 : 400; this._firstTiles = true;
    ctx.imageSmoothingEnabled = true;
    const ov = tw / TILE * 0.6;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const key = b + ':' + tx + ':' + ty;
      let tile = this.tiles.get(key);
      if (tile === undefined) {
        if (budget <= 0) { // draw directly this frame, cache later
          ctx.save(); ctx.beginPath(); ctx.rect(tx * tw, ty * tw, tw, tw); ctx.clip(); this.drawStatic(ctx, { x0: tx * tw, y0: ty * tw, x1: (tx + 1) * tw, y1: (ty + 1) * tw }, ppm); ctx.restore();
          continue;
        }
        budget--;
        tile = this.renderTile(tx, ty, tw, b);
        this.tiles.set(key, tile);
        if (this.tiles.size > 160) { for (const k of this.tiles.keys()) { if (!k.startsWith(b + ':')) { this.tiles.delete(k); if (this.tiles.size < 120) break; } } if (this.tiles.size > 160) this.tiles.delete(this.tiles.keys().next().value); }
      } else { this.tiles.delete(key); this.tiles.set(key, tile); } // LRU touch
      if (tile) ctx.drawImage(tile, tx * tw - ov, ty * tw - ov, tw + ov * 2, tw + ov * 2);
    }
  };
  S.renderTile = function (tx, ty, tw, b) {
    const r = { x0: tx * tw, y0: ty * tw, x1: (tx + 1) * tw, y1: (ty + 1) * tw };
    if (!this.staticHits(r)) return null;
    const c = makeCanvas(TILE, TILE), ctx = c.getContext('2d');
    ctx.setTransform(b, 0, 0, b, -r.x0 * b, -r.y0 * b);
    this.drawStatic(ctx, r, b);
    return c;
  };
  S.staticHits = function (r) {
    const v = this.venue, pad = 30;
    for (const k of ['land', 'piers', 'breakwaters']) for (const p of v[k] || []) if (p && p.length > 2 && hit(bbox(p), r, pad)) return true;
    for (const l of v.landmarks || []) if (Math.abs(l.x - (r.x0 + r.x1) / 2) < (r.x1 - r.x0) / 2 + 160 && Math.abs(l.y - (r.y0 + r.y1) / 2) < (r.y1 - r.y0) / 2 + 160) return true;
    return false;
  };

  // all static land drawing (tile rect r in world meters, ppm = device px per meter)
  S.drawStatic = function (ctx, r, ppm) {
    const v = this.venue, lw = (px) => px / ppm;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // land
    for (const p of v.land || []) {
      if (!p || p.length < 3 || !hit(bbox(p), r, 20)) continue;
      ctx.beginPath(); polyPath(ctx, p); ctx.fillStyle = LAND; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = SAND; ctx.lineWidth = 18; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = SAND_EDGE; ctx.lineWidth = Math.max(0.6, lw(1.5)); ctx.stroke();
      // subtle land texture: speckles
      if (ppm > 1.5) {
        const step = Math.max(6, 18 / ppm * 4);
        ctx.fillStyle = 'rgba(190,160,80,0.12)';
        for (let x = Math.floor(r.x0 / step) * step; x < r.x1; x += step) for (let y = Math.floor(r.y0 / step) * step; y < r.y1; y += step) { const h = hash2(x, y); if (h < 0.5) { ctx.beginPath(); ctx.arc(x + h * step, y + hash2(y, x) * step, Math.max(0.4, lw(1.5)), 0, TAU); ctx.fill(); } }
      }
      ctx.restore();
    }
    const L = v.landmarks || [];
    const near = (l, pad) => l.poly ? hit(bbox(l.poly), r, pad) : l.x > r.x0 - pad && l.x < r.x1 + pad && l.y > r.y0 - pad && l.y < r.y1 + pad;
    // ground covers
    for (const l of L) {
      if (!l.poly || !near(l, 10)) continue;
      if (l.kind === 'park') { ctx.beginPath(); polyPath(ctx, l.poly); ctx.fillStyle = GRASS; ctx.fill(); ctx.strokeStyle = 'rgba(120,170,80,0.5)'; ctx.lineWidth = Math.max(0.5, lw(1.5)); ctx.stroke(); this.grassTexture(ctx, l.poly, r, ppm); }
      else if (l.kind === 'beach') { ctx.beginPath(); polyPath(ctx, l.poly); ctx.fillStyle = '#f9e6a8'; ctx.fill(); if (ppm > 1) this.sandTexture(ctx, l.poly, r, ppm); }
      else if (l.kind === 'slipway') { ctx.beginPath(); polyPath(ctx, l.poly); ctx.fillStyle = '#c9c6bf'; ctx.fill(); ctx.strokeStyle = '#9a968e'; ctx.lineWidth = lw(1.5); ctx.stroke(); }
      else if (l.kind === 'gangway') { ctx.beginPath(); polyPath(ctx, l.poly); ctx.fillStyle = '#a7adb5'; ctx.fill(); }
    }
    // breakwaters (riprap)
    for (const p of v.breakwaters || []) if (p && p.length > 2 && hit(bbox(p), r, 6)) this.drawRiprap(ctx, p, r, ppm);
    // piers
    for (const p of v.piers || []) if (p && p.length > 2 && hit(bbox(p), r, 6)) this.drawPier(ctx, p, ppm);
    // marina boats
    for (const l of L) if (l.kind === 'marina' && l.poly && near(l, 20)) this.drawMarina(ctx, l, r, ppm);
    // structures: shadows first, then bodies (sorted by height so towers overlap)
    const solids = L.filter((l) => !l.poly && near(l, (l.w || 30) + 60) && l.kind !== 'flagpole' && l.kind !== 'lighthouse');
    for (const l of solids) this.drawStructure(ctx, l, ppm, true);
    for (const l of solids.sort((a, b) => (a.floors || 1) - (b.floors || 1))) this.drawStructure(ctx, l, ppm, false);
    for (const l of L) if (l.kind === 'lighthouse' && near(l, 10)) { ctx.fillStyle = 'rgba(40,40,30,0.25)'; ctx.beginPath(); ctx.arc(l.x + 3, l.y + 3, 3.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(l.x, l.y, 3, 0, TAU); ctx.fill(); ctx.fillStyle = l.color === 'R' ? '#e8323c' : l.color === 'G' ? '#18a957' : '#e8323c'; ctx.beginPath(); ctx.arc(l.x, l.y, 1.7, 0, TAU); ctx.fill(); }
  };

  S.grassTexture = function (ctx, poly, r, ppm) {
    if (ppm < 1) return;
    ctx.save(); ctx.beginPath(); polyPath(ctx, poly); ctx.clip();
    const step = 7; ctx.fillStyle = 'rgba(100,160,70,0.25)';
    for (let x = Math.floor(r.x0 / step) * step; x < r.x1; x += step) for (let y = Math.floor(r.y0 / step) * step; y < r.y1; y += step) { const h = hash2(x + 1, y); if (h < 0.4) { ctx.beginPath(); ctx.ellipse(x + h * 9, y + hash2(y, x + 2) * 7, 2.2, 1.1, h * 3, 0, TAU); ctx.fill(); } }
    ctx.restore();
  };
  S.sandTexture = function (ctx, poly, r, ppm) {
    ctx.save(); ctx.beginPath(); polyPath(ctx, poly); ctx.clip();
    const step = 4; ctx.fillStyle = 'rgba(200,160,80,0.28)';
    for (let x = Math.floor(r.x0 / step) * step; x < r.x1; x += step) for (let y = Math.floor(r.y0 / step) * step; y < r.y1; y += step) { const h = hash2(x, y + 5); if (h < 0.45) ctx.fillRect(x + h * 7, y + hash2(y + 1, x) * 4, Math.max(0.3, 1.2 / ppm), Math.max(0.3, 1.2 / ppm)); }
    ctx.restore();
  };

  S.drawRiprap = function (ctx, poly, r, ppm) {
    ctx.beginPath(); polyPath(ctx, poly);
    ctx.fillStyle = '#7d8086'; ctx.fill();
    ctx.strokeStyle = 'rgba(40,44,52,0.6)'; ctx.lineWidth = Math.max(0.3, 1.2 / ppm); ctx.stroke();
    if (ppm < 1.2) return;
    ctx.save(); ctx.beginPath(); polyPath(ctx, poly); ctx.clip();
    const b = bbox(poly), step = 1.3;
    const xa = Math.max(b.x0, r.x0 - 2), xb = Math.min(b.x1, r.x1 + 2), ya = Math.max(b.y0, r.y0 - 2), yb = Math.min(b.y1, r.y1 + 2);
    const greys = ['#9a9da3', '#b3b5b9', '#8a8d93', '#c4c4c2', '#a7a39b', '#94989f'];
    for (let x = Math.floor(xa / step) * step; x < xb; x += step) for (let y = Math.floor(ya / step) * step; y < yb; y += step) {
      const h = hash2(x, y), h2 = hash2(y, x);
      const cx = x + (h - 0.5) * step * 0.7, cy = y + (h2 - 0.5) * step * 0.7;
      if (!pointInPoly(cx, cy, poly)) continue;
      const rx = 0.58 + h * 0.34, ry = 0.46 + h2 * 0.3, rot = h * 3;
      ctx.fillStyle = 'rgba(30,32,38,0.45)'; ctx.beginPath(); ctx.ellipse(cx + 0.14, cy + 0.17, rx, ry, rot, 0, TAU); ctx.fill();
      ctx.fillStyle = greys[Math.floor(h * 97) % greys.length]; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU); ctx.fill();
      if (ppm > 4) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(cx - rx * 0.25, cy - ry * 0.3, rx * 0.45, ry * 0.35, rot, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  };

  S.drawPier = function (ctx, poly, ppm) {
    const kind = poly.kind || 'jetty';
    // long axis
    let best = 0, ax = 1, ay = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ax = (b[0] - a[0]) / l; ay = (b[1] - a[1]) / l; } }
    const b = bbox(poly);
    ctx.save();
    ctx.beginPath(); polyPath(ctx, poly);
    ctx.fillStyle = 'rgba(0,25,60,0.25)'; ctx.translate(0.5, 0.7); ctx.fill(); ctx.translate(-0.5, -0.7);
    const col = kind === 'pontoon' ? '#c3c8cf' : kind === 'gangway' ? '#a7adb5' : kind === 'quay' ? '#cfc9bb' : '#c8995f';
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = shade(col, -0.4); ctx.lineWidth = Math.max(0.15, 1.2 / ppm); ctx.stroke();
    if (ppm > 2.5 && kind !== 'quay') {
      ctx.clip();
      // planks across the long axis
      const step = kind === 'pontoon' ? 1.2 : 0.55;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 1;
      ctx.strokeStyle = kind === 'pontoon' ? 'rgba(80,90,105,0.35)' : 'rgba(90,55,25,0.45)'; ctx.lineWidth = Math.max(0.04, 0.8 / ppm);
      ctx.beginPath();
      for (let s = -R; s <= R; s += step) { const px = cx + ax * s, py = cy + ay * s; ctx.moveTo(px - ay * R, py + ax * R); ctx.lineTo(px + ay * R, py - ax * R); }
      ctx.stroke();
    }
    ctx.restore();
    if (ppm > 3 && kind === 'jetty') { // posts along the edges
      ctx.fillStyle = '#5a3d22';
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l < best * 0.9) continue;
        const n = Math.max(1, Math.round(l / 4));
        for (let k = 0; k <= n; k++) { ctx.beginPath(); ctx.arc(lerp(a[0], c[0], k / n), lerp(a[1], c[1], k / n), 0.22, 0, TAU); ctx.fill(); }
      }
    }
  };

  S.drawMarina = function (ctx, l, r, ppm) {
    // moored yachts alongside the marina jetties (a forest of masts seen from above)
    const v = this.venue, piers = (v.piers || []).filter((p) => /^M/.test(p.id || '') || pointInPoly((bbox(p).x0 + bbox(p).x1) / 2, (bbox(p).y0 + bbox(p).y1) / 2, l.poly));
    const colors = ['#ffffff', '#f4f6f8', '#e9eef3', '#ffffff', '#dfe8f0', '#ffffff', '#1d3557', '#ffffff', '#f7f3ea', '#b22234'];
    for (const p of piers) {
      if (p.kind === 'gangway') continue;
      let best = 0, a0 = null, ax = 1, ay = 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], ll = Math.hypot(b[0] - a[0], b[1] - a[1]); if (ll > best) { best = ll; a0 = a; ax = (b[0] - a[0]) / ll; ay = (b[1] - a[1]) / ll; } }
      if (best < 20) continue;
      const bb = bbox(p), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      for (let side = -1; side <= 1; side += 2) {
        for (let s = 4; s < best - 3; s += 4.3) {
          const h = hash2(p[0][0] + s, side * 7 + p[0][1]); if (h < 0.12) continue;
          const len = 7 + h * 5, beam = len * 0.33;
          const bx = a0[0] + ax * s + (-ay) * side * (len / 2 + 1.6), by = a0[1] + ay * s + ax * side * (len / 2 + 1.6);
          if (bx < r.x0 - 10 || bx > r.x1 + 10 || by < r.y0 - 10 || by > r.y1 + 10) continue;
          ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.atan2(ay * side, ax * side));
          ctx.fillStyle = 'rgba(0,25,60,0.22)'; ctx.beginPath(); ctx.ellipse(0.4, 0.5, beam / 2, len / 2, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = colors[Math.floor(h * 80) % colors.length];
          ctx.beginPath(); ctx.moveTo(0, -len / 2); ctx.quadraticCurveTo(beam / 2, -len * 0.2, beam * 0.45, len / 2); ctx.lineTo(-beam * 0.45, len / 2); ctx.quadraticCurveTo(-beam / 2, -len * 0.2, 0, -len / 2); ctx.fill();
          ctx.strokeStyle = 'rgba(40,50,60,0.4)'; ctx.lineWidth = Math.max(0.05, 0.8 / ppm); ctx.stroke();
          if (ppm > 2) { ctx.fillStyle = '#e1d2b5'; ctx.fillRect(-beam * 0.25, -len * 0.05, beam * 0.5, len * 0.32); ctx.fillStyle = '#5b6470'; ctx.beginPath(); ctx.arc(0, -len * 0.12, Math.max(0.12, 0.9 / ppm), 0, TAU); ctx.fill(); }
          ctx.restore();
        }
      }
    }
  };

  S.drawStructure = function (ctx, l, ppm, shadowPass) {
    const k = l.kind, rot = ((l.rot || 0) * PI) / 180;
    if (k === 'tree') {
      const rr = l.r || 5, h = hash2(l.x, l.y);
      if (shadowPass) { ctx.fillStyle = 'rgba(50,60,20,0.25)'; ctx.beginPath(); ctx.arc(l.x + rr * 0.45, l.y + rr * 0.55, rr, 0, TAU); ctx.fill(); return; }
      const greens = ['#4f9a43', '#5aa84a', '#3f8a3c', '#6cb356'];
      ctx.fillStyle = greens[Math.floor(h * 40) % greens.length];
      ctx.beginPath(); ctx.arc(l.x, l.y, rr, 0, TAU);
      for (let i = 0; i < 5; i++) { const a = h * 9 + i * 1.3; ctx.moveTo(l.x + Math.cos(a) * rr * 0.55 + rr * 0.5, l.y + Math.sin(a) * rr * 0.55); ctx.arc(l.x + Math.cos(a) * rr * 0.55, l.y + Math.sin(a) * rr * 0.55, rr * 0.5, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,220,0.22)'; ctx.beginPath(); ctx.arc(l.x - rr * 0.3, l.y - rr * 0.3, rr * 0.5, 0, TAU); ctx.fill();
      return;
    }
    if (k === 'crane') {
      const a = rot;
      if (shadowPass) { ctx.strokeStyle = 'rgba(40,40,30,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(l.x + 8, l.y + 10); ctx.lineTo(l.x + 8 + Math.cos(a) * 40, l.y + 10 + Math.sin(a) * 40); ctx.stroke(); return; }
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(a);
      ctx.fillStyle = '#3b4250'; ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#f2b51d'; ctx.fillRect(-10, -1.4, 50, 2.8); ctx.strokeStyle = '#8a6400'; ctx.lineWidth = 0.4;
      ctx.beginPath(); for (let s = -10; s < 40; s += 2.8) { ctx.moveTo(s, -1.4); ctx.lineTo(s + 1.4, 1.4); ctx.lineTo(s + 2.8, -1.4); } ctx.stroke();
      ctx.restore(); return;
    }
    const w = l.w || 12, h = l.h || 8;
    const floors = l.floors || (k === 'tower' ? 8 : k === 'powerstation' ? 6 : k === 'silo' ? 17 : k === 'clubhouse' ? 1.5 : k === 'container' ? 1 : k === 'boatpark' ? 0 : 2);
    const height = floors * 3;
    const sx = height * 0.35, sy = height * 0.45; // shadow offset (sun from NW)
    ctx.save(); ctx.translate(l.x, l.y);
    if (shadowPass) {
      if (height <= 0) { ctx.restore(); return; }
      // shadow polygon = rectangle swept by (sx, sy)
      ctx.fillStyle = 'rgba(60,55,30,0.22)';
      const c = Math.cos(rot), s = Math.sin(rot), pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]);
      ctx.beginPath(); for (const p of pts) { ctx.moveTo(p[0], p[1]); } // noop to init
      ctx.beginPath();
      const all = pts.concat(pts.map((p) => [p[0] + sx, p[1] + sy]));
      // convex hull of the 8 points
      const hull = convexHull(all); ctx.moveTo(hull[0][0], hull[0][1]); for (const p of hull) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    ctx.rotate(rot);
    if (k === 'boatpark') {
      ctx.fillStyle = '#d6d2c8'; rrect(ctx, -w / 2, -h / 2, w, h, 1.5); ctx.fill(); ctx.strokeStyle = '#b3ad9f'; ctx.lineWidth = 0.3; ctx.stroke();
      // rows of dinghies (optis & teras) on trolleys
      const cols = ['#ffffff', '#39b8f2', '#ffffff', '#ffd23f', '#ffffff', '#e8323c'];
      let i = 0;
      for (let y = -h / 2 + 2.2; y < h / 2 - 1; y += 3.4) for (let x = -w / 2 + 1.6; x < w / 2 - 1; x += 1.9) {
        ctx.fillStyle = cols[i++ % cols.length]; rrect(ctx, x - 0.6, y - 1.2, 1.2, 2.4, 0.45); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.08; ctx.stroke();
      }
      ctx.restore(); return;
    }
    let roof = l.color || '#cfc8ba';
    if (k === 'clubhouse') roof = '#ff7a3d';
    if (k === 'powerstation') roof = '#a54a32';
    if (k === 'silo') roof = l.color || '#c9b79a';
    if (k === 'container') roof = l.color || '#e8762b';
    // walls hint (south/east faces) then roof
    ctx.fillStyle = shade(roof, -0.35); rrect(ctx, -w / 2 + 0.4, -h / 2 + 0.6, w, h, 0.6); ctx.fill();
    ctx.fillStyle = roof; rrect(ctx, -w / 2, -h / 2, w, h, 0.6); ctx.fill();
    if (k === 'clubhouse') {
      // gable roof with ridge, KØS letters
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#ffa15c'); g.addColorStop(0.5, '#ff8a3d'); g.addColorStop(0.5, '#e8662a'); g.addColorStop(1, '#d4581f');
      ctx.fillStyle = g; rrect(ctx, -w / 2, -h / 2, w, h, 0.6); ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,0,0.5)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 ' + (h * 0.42).toFixed(1) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.name || 'KØS', 0, -h * 0.22);
      // terrace
      ctx.fillStyle = '#c8995f'; ctx.fillRect(-w / 2, h / 2 + 0.3, w * 0.6, 3);
    } else if (k === 'tower' || k === 'silo') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.25);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.35; ctx.beginPath();
      for (let x = -w / 2 + 3; x < w / 2; x += 3) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(60,70,80,0.35)'; ctx.fillRect(-w * 0.15, -h * 0.15, w * 0.3, h * 0.3);
    } else if (k === 'powerstation') {
      ctx.strokeStyle = 'rgba(60,20,10,0.3)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let x = -w / 2 + 4; x < w / 2; x += 4) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); } ctx.stroke();
      ctx.fillStyle = '#c9c3b6'; ctx.fillRect(-w * 0.45, -h * 0.4, w * 0.25, h * 0.8);
      ctx.rotate(-rot); for (let i = 0; i < 3; i++) { const cx = (-0.05 + i * 0.2) * w, cy = 0; ctx.strokeStyle = 'rgba(60,55,30,0.28)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 22, cy + 28); ctx.stroke(); ctx.fillStyle = '#9c4430'; ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(cx, cy, 3.6, -0.3, 0.3); ctx.arc(cx, cy, 2.6, 0.3, -0.3, true); ctx.fill(); ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, TAU); ctx.fill(); } ctx.rotate(rot);
    } else if (k === 'container') {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.15; ctx.beginPath(); for (let x = -w / 2 + 0.6; x < w / 2; x += 0.6) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); } ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; rrect(ctx, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 0.5); ctx.fill();
      ctx.fillStyle = 'rgba(80,90,100,0.25)'; ctx.fillRect(-w * 0.3, -h * 0.2, Math.min(3, w * 0.15), Math.min(3, h * 0.25));
    }
    if (l.name && k !== 'clubhouse' && ppm > 1.2 && k !== 'tower' && k !== 'powerstation') {
      ctx.fillStyle = 'rgba(70,55,25,0.75)'; ctx.font = '700 ' + Math.max(2.5, Math.min(6, h * 0.22)).toFixed(1) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.name, 0, 0);
    }
    ctx.restore();
  };
  function convexHull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  }

  // live land bits: waving flags, lighthouse beams
  S.drawLandLive = function (ctx, t) {
    const v = this.venue; if (!v) return;
    const vw = this.view, wd = (this.wind && this.wind.dir) || 0;
    for (const l of v.landmarks || []) {
      if (l.x < vw.x0 - 20 || l.x > vw.x1 + 20 || l.y < vw.y0 - 20 || l.y > vw.y1 + 20) continue;
      if (l.kind === 'flagpole') {
        if (this._tilt && KOS.Sprites) { KOS.Sprites.drawFlagpoleTilted(ctx, l, wd, t, this._tilt); continue; } // post to z=8, flag upright
        ctx.fillStyle = 'rgba(40,40,30,0.3)'; ctx.beginPath(); ctx.arc(l.x + 1.2, l.y + 1.5, 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(l.x, l.y, 0.45, 0, TAU); ctx.fill();
        if (KOS.Sprites) this.drawDannebrog(ctx, l.x, l.y, wd + PI, t);
      }
    }
  };
  S.drawDannebrog = function (ctx, x, y, dir, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir + PI);
    const len = 4.2, w = 3, N = 10;
    const pt = (s, side) => [side * w / 2 + Math.sin(s * 5 - t * 8) * 0.35 * s, -s * len];
    ctx.beginPath(); for (let i = 0; i <= N; i++) { const p = pt(i / N, -1); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } for (let i = N; i >= 0; i--) { const p = pt(i / N, 1); ctx.lineTo(p[0], p[1]); } ctx.closePath();
    ctx.fillStyle = '#c8102e'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.5;
    ctx.beginPath(); for (let i = 0; i <= N; i++) { const s = i / N, p = pt(s, 0); i ? ctx.lineTo(p[0] - 0.05, p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke();
    ctx.beginPath(); const p0 = pt(0.36, -1), p1 = pt(0.36, 1); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    ctx.restore();
  };

  S.drawLabels = function (ctx) {
    const v = this.venue; if (!v || !v.labels) return;
    const z = this.camera.zoom, vw = this.view;
    for (const lb of v.labels) {
      const txt = tt(lb.text); if (!txt) continue;
      const size = lb.size || 14;
      let px = size * z;
      if (this._tilt) px *= this._tilt.k; // squashed lettering: size gate on the projected height
      if (px < 9) continue;
      const scale = px > 64 ? 64 / px : 1;
      const halfW = (txt.length * size * 0.32 * scale) + size;
      if (lb.x + halfW < vw.x0 || lb.x - halfW > vw.x1 || lb.y + size < vw.y0 || lb.y - size > vw.y1) continue;
      ctx.save(); ctx.translate(lb.x, lb.y);
      if (lb.rot) ctx.rotate((lb.rot * PI) / 180);
      ctx.scale(size * scale / 50, size * scale / 50);
      const kind = lb.kind || 'water';
      const style = kind === 'water' ? ['italic 700', 'rgba(255,255,255,0.55)', 'rgba(20,70,130,0.35)'] : kind === 'depth' ? ['italic 600', 'rgba(25,70,120,0.45)', null] : kind === 'club' ? ['900', '#ff7a3d', 'rgba(255,255,255,0.9)'] : ['800', 'rgba(90,70,30,0.85)', 'rgba(255,248,220,0.8)'];
      ctx.font = style[0] + ' 50px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (kind === 'water') { try { ctx.letterSpacing = '6px'; } catch (e) {} }
      if (style[2]) { ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = style[2]; ctx.strokeText(txt, 0, 0); }
      ctx.fillStyle = style[1]; ctx.fillText(txt, 0, 0);
      ctx.restore();
    }
  };

  S.drawZones = function (ctx) {
    const v = this.venue; if (!v) return;
    const mpp = this.mpp;
    for (const z of v.zones || []) {
      if (z.kind === 'swim' && z.poly) {
        if (!hit(bbox(z.poly), this.view, 10)) continue;
        ctx.save(); ctx.beginPath(); polyPath(ctx, z.poly);
        ctx.fillStyle = 'rgba(255,214,60,0.08)'; ctx.fill();
        ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(255,214,60,0.75)'; ctx.lineWidth = Math.max(0.6, 2 * mpp); ctx.stroke(); ctx.restore();
      } else if (z.kind === 'nowake' && z.poly && this.showLanes) {
        ctx.save(); ctx.beginPath(); polyPath(ctx, z.poly); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(0.4, 1.5 * mpp); ctx.stroke(); ctx.restore();
      }
    }
    if (this.showLanes) for (const ln of v.lanes || []) {
      if (!ln.points || ln.points.length < 2) continue;
      ctx.save(); ctx.strokeStyle = ln.kind === 'ferry' ? 'rgba(230,60,140,0.35)' : 'rgba(230,60,140,0.5)'; ctx.lineWidth = Math.max(0.8, 2 * mpp); ctx.setLineDash([10, 8]);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i < ln.points.length; i++) {
          const p = ln.points[i], q = ln.points[Math.min(ln.points.length - 1, i + 1)], o = ln.points[Math.max(0, i - 1)];
          const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
          const x = p[0] + (-dy / l) * side * ln.width / 2, y = p[1] + (dx / l) * side * ln.width / 2;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // ------------------------------------------------------------------------------------------
  S.drawLines = function (ctx, t) {
    const mpp = this.mpp;
    for (const ln of this.lines || []) {
      if (!ln || !ln.a || !ln.b) continue;
      const a = P(ln.a), b = P(ln.b);
      ctx.save(); ctx.lineCap = 'round';
      if (ln.kind === 'start' || ln.kind === 'finish') {
        const w = Math.max(0.35, 3 * mpp);
        ctx.strokeStyle = 'rgba(0,20,50,0.25)'; ctx.lineWidth = w * 2.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (ln.kind === 'finish') { ctx.setLineDash([w * 2.5, w * 2.5]); ctx.strokeStyle = '#1a7fd4'; ctx.lineWidth = w * 1.4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineDashOffset = w * 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
        else { const pulse = 0.65 + 0.35 * Math.sin(t * 4); ctx.setLineDash([w * 3, w * 2]); ctx.lineDashOffset = -t * w * 4; ctx.strokeStyle = ln.color || 'rgba(255,255,255,' + pulse + ')'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      } else if (ln.kind === 'layline') {
        ctx.setLineDash([8 * mpp, 6 * mpp]); ctx.strokeStyle = ln.color || 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(0.15, 1.5 * mpp); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else { // path
        ctx.setLineDash([0.1, 9 * mpp]); ctx.lineDashOffset = -t * 20 * mpp; ctx.strokeStyle = ln.color || 'rgba(255,214,94,0.85)'; ctx.lineWidth = Math.max(0.3, 4 * mpp); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }
  };

  S.drawMarkExtras = function (ctx, m, t) {
    const mpp = this.mpp, rot = this.camera.rot;
    if (m.round === 'port' || m.round === 'starboard') {
      const ccw = m.round === 'port', R = Math.max(4.5, 26 * mpp);
      const dir = ccw ? -1 : 1; // canvas angles grow clockwise on screen
      const a0 = (dir * t * 0.8) % TAU, col = ccw ? 'rgba(232,50,60,0.85)' : 'rgba(24,169,87,0.9)'; // spin the way the arrow points
      ctx.save(); ctx.translate(m.x, m.y); ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.3, 2.6 * mpp); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, R, a0, a0 + dir * 4.2, ccw); ctx.stroke();
      const ae = a0 + dir * 4.2, hx = Math.cos(ae) * R, hy = Math.sin(ae) * R, tx = -Math.sin(ae) * dir, ty = Math.cos(ae) * dir, hs = Math.max(0.8, 7 * mpp);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(hx + tx * hs, hy + ty * hs); ctx.lineTo(hx - ty * hs * 0.6, hy + tx * hs * 0.6); ctx.lineTo(hx + ty * hs * 0.6, hy - tx * hs * 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (m.label) this.pill(ctx, m.x, m.y, tt(m.label), { dy: this._tilt ? -(this.markTopPx(m) + 14) : -44, bg: 'rgba(13,19,33,0.72)' }); // tilted: just above the sprite top
  };
  // css-px height of a mark's upright sprite (tilted pill anchor)
  S.markTopPx = function (m) { const TL = KOS.Tilt; return (KOS.Sprites && KOS.Sprites.markTop ? KOS.Sprites.markTop(m, m.scale || 1.6) : 2) * this.camera.zoom * (TL.BUOY_SCALE || 1); };
  // screen-aligned pill label anchored at a world point (dy in css px)
  S.pill = function (ctx, x, y, text, o) {
    o = o || {}; const mpp = this.mpp;
    ctx.save();
    if (this._tilt) { this.upright(ctx, x, y, o.z || 0); ctx.translate(0, o.dy || -30); } // tilted: screen-aligned CSS px at the projected anchor (dy in px, size as flat)
    else { ctx.translate(x, y); if (this.camera.rot) ctx.rotate(-this.camera.rot); ctx.scale(mpp, mpp); ctx.translate(0, o.dy || -30); }
    ctx.font = '800 ' + (o.size || 12) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14, h = (o.size || 12) + 9;
    ctx.fillStyle = o.bg || 'rgba(13,19,33,0.7)'; rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
    if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.fillStyle = o.color || '#fff'; ctx.fillText(text, 0, 1);
    ctx.restore();
  };

  S.drawTags = function (ctx) {
    const z = this.camera.zoom;
    for (const b of this.boats) {
      if (!b || b.hidden || b === this.target || b.noTag) continue;
      const v = this._tilt ? this.viewItems : this.view; if (b.x < v.x0 || b.x > v.x1 || b.y < v.y0 || b.y > v.y1) continue;
      const label = b.tag || b.name || b.sailNo; if (!label) continue;
      const L = boatLen(b), T = this._tilt;
      // tilted: above the projected mast top (mastH*Z*s) plus a bit of the hull's projected length (spec §5)
      this.pill(ctx, b.x, b.y, String(label), { dy: T ? -(boatMastH(b) * z * T.s + L * z * T.k * 0.3 + 18) : -(L * z * 0.6 + 26), size: 11, bg: b.tagColor || 'rgba(13,19,33,0.55)' });
    }
  };

  S.windAt = function (x, y) {
    const w = this.wind; if (!w) return { dir: 0, speed: 8 };
    if (w.at) { try { return w.at(x, y); } catch (e) {} }
    return { dir: w.dir || 0, speed: w.speed || 8 };
  };

  S.drawNoGo = function (ctx, b, t) {
    const w = this.windAt(b.x, b.y), cls = b.cls && typeof b.cls === 'object' ? b.cls : null;
    const half = cls && cls.noGo ? cls.noGo : (45 * PI) / 180;
    const R = Math.max(boatLen(b) * 2.8, 90 * this.mpp);
    const a0 = w.dir - half - PI / 2, a1 = w.dir + half - PI / 2; // canvas angles (0 = east); heading h → canvas angle h - PI/2
    ctx.save(); ctx.translate(b.x, b.y);
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    g.addColorStop(0, 'rgba(255,77,94,0.0)'); g.addColorStop(0.35, 'rgba(255,77,94,0.22)'); g.addColorStop(1, 'rgba(255,77,94,0.0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,77,94,0.6)'; ctx.lineWidth = Math.max(0.12, 1.5 * this.mpp); ctx.setLineDash([6 * this.mpp, 5 * this.mpp]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); ctx.stroke();
    // close-hauled "best angle" ticks (green)
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(62,224,143,0.8)'; ctx.lineWidth = Math.max(0.2, 3 * this.mpp);
    for (const a of [a0 - 0.08, a1 + 0.08]) { ctx.beginPath(); ctx.arc(0, 0, R * 0.92, a - 0.06, a + 0.06); ctx.stroke(); }
    ctx.restore();
  };

  S.drawLaylines = function (ctx) {
    const m = this.laylineTarget || (this.marks || []).find((k) => k && k.upwind);
    if (!m) return;
    const b = this.target, cls = b && b.cls && typeof b.cls === 'object' ? b.cls : null;
    const ang = (cls && cls.noGo ? cls.noGo : (45 * PI) / 180) + (4 * PI) / 180;
    const w = this.windAt(m.x, m.y), len = 600;
    ctx.save(); ctx.setLineDash([10 * this.mpp, 8 * this.mpp]); ctx.lineWidth = Math.max(0.2, 2 * this.mpp);
    for (const s of [-1, 1]) {
      const h = w.dir + s * ang; // heading of a boat on that layline
      const ex = m.x - Math.sin(h) * len, ey = m.y + Math.cos(h) * len;
      ctx.strokeStyle = s > 0 ? 'rgba(24,169,87,0.7)' : 'rgba(232,50,60,0.7)';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
  };

  S.drawWindArrow = function (ctx, t) {
    const b = this.target, w = this.windAt(b.x, b.y), mpp = this.mpp;
    const dist = Math.min(this.w, this.h) * 0.3 * mpp;
    const ux = Math.sin(w.dir), uy = -Math.cos(w.dir); // towards where the wind comes from
    const bob = Math.sin(t * 3) * 4 * mpp;
    const cx = b.x + ux * (dist + bob), cy = b.y + uy * (dist + bob);
    const L = 54 * mpp, hw = 11 * mpp;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(w.dir + PI); // arrow points downwind (local -y = forward)
    ctx.beginPath();
    ctx.moveTo(0, -L / 2); ctx.lineTo(hw * 1.4, -L / 2 + hw * 1.9); ctx.lineTo(hw * 0.45, -L / 2 + hw * 1.6); ctx.lineTo(hw * 0.45, L / 2);
    ctx.lineTo(-hw * 0.45, L / 2); ctx.lineTo(-hw * 0.45, -L / 2 + hw * 1.6); ctx.lineTo(-hw * 1.4, -L / 2 + hw * 1.9); ctx.closePath();
    ctx.fillStyle = 'rgba(13,19,33,0.35)'; ctx.save(); ctx.translate(2 * mpp, 3 * mpp); ctx.fill(); ctx.restore();
    const g = ctx.createLinearGradient(0, L / 2, 0, -L / 2); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(13,19,33,0.6)'; ctx.lineWidth = 1.5 * mpp; ctx.stroke();
    // streaks flowing along the arrow
    ctx.strokeStyle = 'rgba(73,198,242,0.9)'; ctx.lineWidth = 2 * mpp; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) { const p = ((t * 0.9 + i * 0.5) % 1); const y = L / 2 - p * L * 0.9; ctx.globalAlpha = Math.sin(p * PI); ctx.beginPath(); ctx.moveTo(-hw * 1.6, y); ctx.lineTo(-hw * 1.6, y - 10 * mpp); ctx.moveTo(hw * 1.6, y + 6 * mpp); ctx.lineTo(hw * 1.6, y - 4 * mpp); ctx.stroke(); }
    ctx.restore();
    const vind = KOS.t ? String(KOS.t('ui.hud.wind')).toUpperCase() : 'WIND';
    this.pill(ctx, cx + ux * L * 0.95, cy + uy * L * 0.95, vind + ' ' + Math.round(w.speed) + ' kn', { dy: 0, size: 11, bg: 'rgba(13,19,33,0.6)' });
  };

  // night: darken and re-light buoys, lighthouses and boats' navigation lights
  S.drawNight = function (ctx, t) {
    const k = clamp(this.night, 0, 1), vw = this.view;
    const TL = this._tilt; // tilted: darken in screen space, glows sit at light height (§5)
    ctx.save(); ctx.fillStyle = 'rgba(6,12,38,' + 0.72 * k + ')';
    if (TL) { ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillRect(0, 0, this.w, this.h); }
    else ctx.fillRect(vw.x0 - 5, vw.y0 - 5, vw.x1 - vw.x0 + 10, vw.y1 - vw.y0 + 10);
    ctx.globalCompositeOperation = 'lighter';
    const S2 = KOS.Sprites; if (!S2) { ctx.restore(); return; }
    const glow = (x, y, col, r, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, S2.rgba(col, a)); g.addColorStop(0.2, S2.rgba(col, a * 0.5)); g.addColorStop(1, S2.rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    const COL = { R: '#ff3b3b', G: '#33ff7a', W: '#fffbe0', Y: '#ffd400' };
    const lightsAt = [];
    const v = this.venue;
    if (v) { for (const b of v.buoys || []) if (b.light) lightsAt.push(b); for (const l of v.lights || []) lightsAt.push(l); for (const l of v.landmarks || []) if (l.kind === 'lighthouse') lightsAt.push(l); }
    const R = 40 * this.mpp, lz = (L) => (L.kind === 'lighthouse' ? 12 : S2.buoyTop && L.kind && L.light ? S2.buoyTop(L.kind) * 1.5 : 3); // light height under tilt: lighthouse 12 m, buoy sprite top, else 3 m
    for (const L of lightsAt) {
      if (L.x < vw.x0 - 30 || L.x > vw.x1 + 30 || L.y < vw.y0 - 30 || L.y > vw.y1 + 30) continue;
      const pl = S2.parseLight(L.light); if (!pl) continue;
      const on = S2.lightLevel(pl, t + ((L.x * 0.37 + L.y * 0.71) % 6.28) % 1.3);
      if (on) {
        if (TL) { const q = this.project(L.x, L.y, lz(L)); glow(q.x + TL.shx, q.y + TL.shy, COL[L.color] || COL[pl.col] || COL.W, Math.max(6 * TL.Z, 40), 0.9 * k); }
        else glow(L.x, L.y - 3, COL[L.color] || COL[pl.col] || COL.W, Math.max(6, R), 0.9 * k);
      }
    }
    for (const b of this.boats) {
      if (!b || b.hidden || b.x < vw.x0 - 20 || b.x > vw.x1 + 20 || b.y < vw.y0 - 20 || b.y > vw.y1 + 20) continue;
      const L = boatLen(b), h = b.heading || 0, fx = Math.sin(h), fy = -Math.cos(h), rx = Math.cos(h), ry = Math.sin(h);
      if (TL) { // nav lights at ~0.8 m, glow radius in px
        const r = Math.max(2.5 * TL.Z, 14), gl = (x, y, col, a) => { const q = this.project(x, y, 0.8); glow(q.x + TL.shx, q.y + TL.shy, col, r, a); };
        gl(b.x + fx * L * 0.4 - rx * 0.4, b.y + fy * L * 0.4 - ry * 0.4, COL.R, 0.9 * k); gl(b.x + fx * L * 0.4 + rx * 0.4, b.y + fy * L * 0.4 + ry * 0.4, COL.G, 0.9 * k); gl(b.x - fx * L * 0.5, b.y - fy * L * 0.5, COL.W, 0.8 * k);
        continue;
      }
      const r = Math.max(2.5, 14 * this.mpp);
      glow(b.x + fx * L * 0.4 - rx * 0.4, b.y + fy * L * 0.4 - ry * 0.4, COL.R, r, 0.9 * k);
      glow(b.x + fx * L * 0.4 + rx * 0.4, b.y + fy * L * 0.4 + ry * 0.4, COL.G, r, 0.9 * k);
      glow(b.x - fx * L * 0.5, b.y - fy * L * 0.5, COL.W, r, 0.8 * k);
    }
    ctx.restore();
  };

  // Viewer zoom shared by every sea mode: mul = pinch / wheel multiplier on the mode's own zoom (never further out than
  // the whole venue), overview = show the whole venue. Driven by the play screen (app.js).
  SailScene.view = { mul: 1, overview: false, tilt: null }; // tilt: null = follow the setting, true/false = the quick toggle (V) for this run
  SailScene.current = null;
  KOS.SailScene = SailScene;
})(typeof window !== 'undefined' ? window : globalThis);
