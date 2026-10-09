// KØS SEJL — js/render/water.js
// KOS.Water: stylised top-down water. Layered depth shading (chart-like: shallow = light turquoise,
// deep = deep blue) from venue.depth polygons, cached once per venue as a soft low-res canvas;
// animated wave crests (two scrolling pattern layers aligned to the wind), dark gust patches with
// cat's-paws (from wind.gusts), wind streaks, sparkles and lapping shore foam.
// Usage (by KOS.SailScene): const w = KOS.Water.create(venue); w.render(ctx, scene, wind, t); w.renderShore(ctx, scene, t)
// ctx must be in world-meter transform; scene supplies {view:{x0,y0,x1,y1}, mpp, dpr, camera}.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  // depth → colour ramp (meters)
  const RAMP = [[0, [172, 233, 240]], [0.8, [150, 222, 240]], [1.6, [124, 206, 240]], [2.2, [106, 192, 236]], [3, [90, 175, 228]], [4, [76, 157, 218]], [6.5, [60, 135, 204]], [9, [54, 122, 192]], [13, [45, 105, 176]], [30, [36, 88, 156]]];
  function depthRGB(d) {
    if (d <= RAMP[0][0]) return RAMP[0][1];
    for (let i = 1; i < RAMP.length; i++) if (d <= RAMP[i][0]) { const a = RAMP[i - 1], b = RAMP[i], t = (d - a[0]) / (b[0] - a[0]); return [0, 1, 2].map((k) => Math.round(lerp(a[1][k], b[1][k], t))); }
    return RAMP[RAMP.length - 1][1];
  }
  function depthColor(d, a) { const c = depthRGB(d); return a != null ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')' : 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  function polyPath(ctx, poly) { ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); }
  function bbox(poly) { if (poly._bb) return poly._bb; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return { x0, y0, x1, y1 }; }

  // wave tile: little white crest "smiles", seamless
  let waveTile = null, capTile = null;
  function buildTiles() {
    if (waveTile) return;
    const S = 256;
    const mk = (n, seed, alpha, lw, len, curve) => {
      const c = makeCanvas(S, S); if (!c) return null; const x = c.getContext('2d');
      let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      x.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const cx = r() * S, cy = r() * S, l = len * (0.6 + r() * 0.8), a = alpha * (0.5 + r() * 0.5);
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const X = cx + ox, Y = cy + oy; if (X < -l || X > S + l || Y < -l || Y > S + l) continue;
          x.fillStyle = 'rgba(255,255,255,' + a + ')';
          x.beginPath(); x.moveTo(X - l / 2, Y); x.quadraticCurveTo(X, Y - l * curve, X + l / 2, Y); x.quadraticCurveTo(X, Y - l * curve + lw * 2.2, X - l / 2, Y); x.fill();
          x.fillStyle = 'rgba(20,70,140,' + a * 0.22 + ')';
          x.beginPath(); x.moveTo(X - l * 0.42, Y + lw * 0.6); x.quadraticCurveTo(X, Y - l * curve * 0.8 + lw * 2.6, X + l * 0.42, Y + lw * 0.6); x.quadraticCurveTo(X, Y - l * curve * 0.8 + lw * 4, X - l * 0.42, Y + lw * 0.6); x.fill();
        }
      }
      return c;
    };
    waveTile = mk(18, 7, 0.75, 2.2, 26, 0.28);
    capTile = mk(9, 99, 0.95, 3.2, 20, 0.36);
  }

  function Water(venue, opts) {
    this.venue = venue || null;
    this.opts = opts || {};
    this.cache = null;
    this.streaks = [];
    this.pawSeeds = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    this.def = venue && venue.defaultDepth != null ? venue.defaultDepth : 6;
    this._seed = 1;
  }
  const W = Water.prototype;

  W.buildCache = function () {
    const v = this.venue; if (!v || !v.bounds) return null;
    const pad = 400, b = v.bounds;
    const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
    const res = clamp(2048 / Math.max(w, h), 0.15, 1.5);
    const c = makeCanvas(w * res, h * res); if (!c) return null;
    const ctx = c.getContext('2d');
    ctx.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    ctx.fillStyle = depthColor(this.def); ctx.fillRect(x0, y0, w, h);
    const blur = 'filter' in ctx;
    if (blur) ctx.filter = 'blur(' + Math.max(2, Math.round(10 * res)) + 'px)';
    for (const z of v.depth || []) {
      if (!z.poly || z.poly.length < 3) continue;
      ctx.beginPath(); polyPath(ctx, z.poly); ctx.fillStyle = depthColor(z.d); ctx.fill();
      if (!blur) { ctx.strokeStyle = depthColor(z.d, 0.5); ctx.lineWidth = 14; ctx.stroke(); }
    }
    // turquoise shallows hugging the shore
    ctx.lineJoin = 'round';
    for (const set of [v.land || [], v.breakwaters || []]) for (const p of set) {
      if (!p || p.length < 3) continue;
      ctx.beginPath(); polyPath(ctx, p);
      ctx.strokeStyle = depthColor(0.6, 0.55); ctx.lineWidth = set === v.land ? 34 : 16; ctx.stroke();
      ctx.strokeStyle = depthColor(0.2, 0.7); ctx.lineWidth = set === v.land ? 14 : 7; ctx.stroke();
    }
    if (blur) ctx.filter = 'none';
    this.cache = { canvas: c, x0, y0, w, h };
    return this.cache;
  };

  W.render = function (ctx, scene, wind, t) {
    const view = scene.view, mpp = scene.mpp || 0.05;
    wind = wind || { dir: 0, speed: 8, gusts: [] };
    const wdir = wind.dir != null ? wind.dir : (wind.base && wind.base.dir) || 0;
    const wspd = wind.speed != null ? wind.speed : (wind.base && wind.base.speed) || 8;
    // 1. base depth colours
    ctx.fillStyle = depthColor(this.def);
    ctx.fillRect(view.x0 - 2, view.y0 - 2, view.x1 - view.x0 + 4, view.y1 - view.y0 + 4);
    if (this.venue && !this.cache) this.buildCache();
    if (this.cache) { const c = this.cache; ctx.imageSmoothingEnabled = true; ctx.drawImage(c.canvas, c.x0, c.y0, c.w, c.h); }
    // subtle large-scale light variation (sky reflection)
    // 2. gusts (dark patches) under the crests
    this.renderGusts(ctx, scene, wind, t, wdir);
    // 3. wave crest layers drifting downwind
    buildTiles();
    if (waveTile && typeof DOMMatrix !== 'undefined') {
      const dx = -Math.sin(wdir), dy = Math.cos(wdir); // downwind unit vector
      const layers = [
        { tile: waveTile, m: 30, sp: 1.0 + wspd * 0.06, a: clamp(0.1 + wspd / 50, 0.1, 0.42), off: 0 },
        { tile: waveTile, m: 64, sp: 1.6 + wspd * 0.09, a: clamp(0.05 + wspd / 80, 0.05, 0.25), off: 97 },
      ];
      const tier = KOS.Perf ? KOS.Perf.level : 3; // quality tier: 2 loses the whitecap layer, 1 the second wave layer, 0 keeps one layer
      if (tier <= 1) layers.splice(1, 1);
      if (wspd > 13 && tier >= 3) layers.push({ tile: capTile, m: 55, sp: 2 + wspd * 0.1, a: clamp((wspd - 13) / 12, 0, 0.6), off: 31 });
      const deg = (wdir * 180) / Math.PI, zf = clamp(((1 / mpp) - 1.5) / 5, 0, 1);
      for (const L of layers) {
        const pat = ctx.createPattern(L.tile, 'repeat'); if (!pat || !pat.setTransform) continue;
        const s = L.m / 256, d = t * L.sp;
        // wobble perpendicular so crests seem to roll
        const wob = Math.sin(t * 0.7 + L.off) * 1.2;
        pat.setTransform(new DOMMatrix().translate(dx * d + dy * wob + L.off, dy * d - dx * wob + L.off).rotate(deg).scale(s));
        if (L.a * zf < 0.01) continue; ctx.globalAlpha = L.a * zf; ctx.fillStyle = pat;
        ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      }
      ctx.globalAlpha = 1;
    }
    // 4. wind streaks + sparkle
    this.renderStreaks(ctx, scene, t, wdir, wspd);
    if (!KOS.Perf || KOS.Perf.level >= 3) this.renderSparkle(ctx, scene, t); // decorative glints: top tier only
  };

  W.renderGusts = function (ctx, scene, wind, t, wdir) {
    const gusts = wind.gusts || [], view = scene.view, mpp = scene.mpp || 0.05;
    const px = Math.cos(wdir), py = Math.sin(wdir); // perpendicular to wind (crosswind)
    for (let gi = 0; gi < gusts.length; gi++) {
      const g = gusts[gi]; if (!g || g.r == null) continue;
      if (g.x + g.r < view.x0 || g.x - g.r > view.x1 || g.y + g.r < view.y0 || g.y - g.r > view.y1) continue;
      const k = g.k != null ? g.k : 1.3;
      const dark = k >= 1;
      const a = dark ? clamp((k - 1) * 1.9, 0, 0.45) : clamp((1 - k) * 0.9, 0, 0.22);
      if (a < 0.01) continue;
      // elongated downwind
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(wdir); ctx.scale(1, 1.35);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
      const col = dark ? '14,44,100' : '220,240,255';
      gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(0.55, 'rgba(' + col + ',' + a * 0.7 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, g.r, 0, TAU); ctx.fill();
      ctx.restore();
      if (!dark) continue;
      // cat's-paws: short dark ripples scattered through the gust on a grid that moves with the gust (spacing ≈ 13 px on screen,
      // quantised to powers of two so they stay put while the camera zooms), denser and darker towards the core
      const sp = Math.pow(2, Math.round(Math.log2(Math.max(0.5, 13 * mpp))));
      const ex = g.r, ey = g.r * 1.35, ext = Math.max(ex, ey);
      const xa = Math.max(view.x0, g.x - ext), xb = Math.min(view.x1, g.x + ext), ya = Math.max(view.y0, g.y - ext), yb = Math.min(view.y1, g.y + ext);
      const cw = Math.cos(wdir), sw = Math.sin(wdir);
      ctx.strokeStyle = 'rgba(8,30,75,' + clamp(a * 0.95, 0, 0.34) + ')'; ctx.lineWidth = Math.max(0.12, 1.9 * mpp); ctx.lineCap = 'round';
      ctx.beginPath();
      let cnt = 0;
      for (let i = Math.floor((xa - g.x) / sp); g.x + i * sp < xb && cnt < 1400; i++) for (let j = Math.floor((ya - g.y) / sp); g.y + j * sp < yb && cnt < 1400; j++) {
        const h1 = hash2(i + gi * 7919, j), h2 = hash2(j - gi * 104729, i), h3 = hash2(i * 31 + j, j * 17 - i + gi);
        const cx = g.x + (i + h1) * sp, cy = g.y + (j + h2) * sp;   // the ripples ride along with the gust
        const dx = cx - g.x, dy = cy - g.y;
        const lx = dx * cw + dy * sw, ly = -dx * sw + dy * cw;      // gust frame (elongated downwind)
        const d = Math.hypot(lx / ex, ly / ey);
        if (d >= 1 || h3 < d * d * 0.95) continue;
        const flick = Math.sin(t * 2.6 + h3 * 40);
        if (flick < -0.35) continue;
        cnt++;
        const l = Math.max(0.15, (2 + 2.6 * h1) * mpp) * (0.7 + 0.3 * flick);
        ctx.moveTo(cx - px * l, cy - py * l); ctx.quadraticCurveTo(cx - sw * l * 0.35, cy + cw * l * 0.35, cx + px * l, cy + py * l);
      }
      ctx.stroke();
    }
  };

  W.renderStreaks = function (ctx, scene, t, wdir, wspd) {
    const view = scene.view, mpp = scene.mpp || 0.05, dt = clamp(t - (this._lt == null ? t : this._lt), 0, 0.1); this._lt = t;
    const want = Math.round((KOS.Perf && KOS.Perf.level <= 1 ? 0.5 : 1) * clamp(wspd / 2, 2, 14) * clamp(((view.x1 - view.x0) * (view.y1 - view.y0)) / (mpp * mpp) / 900000, 0.5, 2));
    const dx = -Math.sin(wdir), dy = Math.cos(wdir), v = wspd * 0.5144 * 1.1;
    const S = this.streaks;
    while (S.length < want) S.push({ x: lerp(view.x0, view.x1, Math.random()), y: lerp(view.y0, view.y1, Math.random()), life: 0, max: 1.8 + Math.random() * 1.6, l: 26 + Math.random() * 40, w: 0.7 + Math.random() });
    ctx.lineCap = 'round';
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i]; s.life += dt; s.x += dx * v * dt; s.y += dy * v * dt;
      if (s.life > s.max || s.x < view.x0 - 50 || s.x > view.x1 + 50 || s.y < view.y0 - 50 || s.y > view.y1 + 50) { S.splice(i, 1); continue; }
      const f = s.life / s.max, a = Math.sin(f * Math.PI) * 0.28 * clamp(wspd / 10, 0.4, 1.2);
      const L = s.l * mpp, wob = Math.sin(t * 2 + i) * L * 0.08;
      ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = s.w * 1.4 * mpp;
      ctx.beginPath(); ctx.moveTo(s.x - dx * L, s.y - dy * L); ctx.quadraticCurveTo(s.x - dx * L * 0.5 + dy * wob, s.y - dy * L * 0.5 - dx * wob, s.x, s.y); ctx.stroke();
    }
  };

  W.renderSparkle = function (ctx, scene, t) {
    const view = scene.view, mpp = scene.mpp || 0.05, cell = 80 * mpp;
    const ix0 = Math.floor(view.x0 / cell), ix1 = Math.ceil(view.x1 / cell), iy0 = Math.floor(view.y0 / cell), iy1 = Math.ceil(view.y1 / cell);
    if ((ix1 - ix0) * (iy1 - iy0) > 2500) return;
    ctx.fillStyle = '#ffffff';
    for (let ix = ix0; ix < ix1; ix++) for (let iy = iy0; iy < iy1; iy++) {
      const h = hash2(ix, iy), sp = 0.6 + h * 1.4;
      const b = Math.pow(Math.max(0, Math.sin(t * sp + h * 40)), 30);
      if (b < 0.08) continue;
      const x = (ix + hash2(iy, ix + 9)) * cell, y = (iy + hash2(ix + 3, iy)) * cell, r = (1.5 + 3.5 * b) * mpp;
      ctx.globalAlpha = 0.85 * b;
      ctx.beginPath(); ctx.moveTo(x - r * 2, y); ctx.lineTo(x, y - r * 0.35); ctx.lineTo(x + r * 2, y); ctx.lineTo(x, y + r * 0.35); ctx.closePath();
      ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x + r * 0.3, y); ctx.lineTo(x, y + r * 1.4); ctx.lineTo(x - r * 0.3, y); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // lapping white foam along shores and breakwaters (drawn just before the land layer covers half of it)
  W.renderShore = function (ctx, scene, t) {
    const v = this.venue; if (!v) return;
    const view = scene.view, mpp = scene.mpp || 0.05;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const sets = [[v.land || [], 1], [v.breakwaters || [], 1.3], [v.piers || [], 0.5]];
    for (const [set, k] of sets) for (const p of set) {
      if (!p || p.length < 3) continue;
      const b = bbox(p); if (b.x1 < view.x0 - 10 || b.x0 > view.x1 + 10 || b.y1 < view.y0 - 10 || b.y0 > view.y1 + 10) continue;
      ctx.beginPath(); polyPath(ctx, p);
      const still = KOS.Perf && KOS.Perf.level < 3; // tier < 3: the shore foam stops lapping
      const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.3);
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.18 * k + ')'; ctx.lineWidth = Math.max(2.5 * k + pulse * 1.5 * k, 8 * mpp); ctx.stroke();
      ctx.setLineDash([2.2 * k + 1, 1.6 * k + 0.6]); ctx.lineDashOffset = still ? 0 : -t * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 + 0.2 * pulse) * Math.min(1, k) + ')'; ctx.lineWidth = Math.max(0.9 * k + pulse * 0.6, 3 * mpp); ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  KOS.Water = { create: (venue, opts) => new Water(venue, opts), Water, depthColor, depthRGB };
})(typeof window !== 'undefined' ? window : globalThis);
