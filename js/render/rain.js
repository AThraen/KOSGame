// KØS SEJL — js/render/rain.js
// KOS.Rain: screen-space rain overlay — a dark tint, a top fog gradient, and wind-slanted streaks
// drawn in one pass. Deterministic (seeded mulberry32), budgeted by level/perf, reduced-motion aware.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  // mulberry32: deterministic 32-bit PRNG -> function returning [0,1)
  function mulberry32(seed) {
    let a = (typeof seed === 'number' && isFinite(seed) ? seed : 1) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BASE = [0, 110, 230]; // none / light / heavy
  const PERF = [0, 0.2, 0.5, 1]; // perf tier 0..3 multiplier

  // integer particle count for a level/perf/reduced combination
  function budget(level, perfLevel, reduced) {
    if (reduced) return 0;
    const base = BASE[level] || 0;
    let p = (typeof perfLevel === 'number' && isFinite(perfLevel)) ? perfLevel : 3;
    p = Math.min(3, Math.max(0, p));
    return Math.round(base * PERF[Math.round(p)]);
  }

  // {dark, fog} tint strengths per level
  function tone(level) {
    if (level === 2) return { dark: 0.28, fog: 0.18 };
    if (level === 1) return { dark: 0.16, fog: 0.1 };
    return { dark: 0, fog: 0 };
  }

  // a single rain streak in normalised screen coords (x, y in 0..1)
  function makeParticle(rng) {
    return {
      x: rng(),
      y: rng(),
      speed: 0.9 + rng() * 0.6, // 0.9..1.5 screens / s
      length: 0.012 + rng() * 0.018 // 0.012..0.03 of height
    };
  }

  function create(opts) {
    opts = opts || {};
    const level = opts.level != null ? opts.level : 0;
    const seed = opts.seed != null ? opts.seed : 1;
    const windDeg = opts.windDeg != null ? opts.windDeg : 0;
    const rng = mulberry32(seed);
    const pool = [];
    const state = {
      level: level,
      _count: 0,
      _lastT: null,
      setLevel: function (n) { state.level = n; },
      count: function () { return state._count; },
      overlay: function (ctx, scene) {
        if (state.level === 0) return; // no rain: skip entirely
        const w = scene.w, h = scene.h;

        // dt since the previous overlay call (first call = 0), clamped to 0..0.1 s
        const now = performance.now();
        let dt = state._lastT == null ? 0 : (now - state._lastT) / 1000;
        state._lastT = now;
        dt = Math.min(0.1, Math.max(0, dt));

        const perfLevel = (KOS.Perf && KOS.Perf.level != null) ? KOS.Perf.level : 3;
        let reduced = false;
        try {
          if (KOS.UI && typeof KOS.UI.reducedMotion === 'function') reduced = !!KOS.UI.reducedMotion();
          else reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) { reduced = false; }

        const tn = tone(state.level);

        // dark tint over the whole screen (drawn even when the budget is 0)
        ctx.fillStyle = 'rgba(18,34,52,' + tn.dark + ')';
        ctx.fillRect(0, 0, w, h);
        // soft fog gradient from the top, fading out at 60% height
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
        g.addColorStop(0, 'rgba(190,200,210,' + tn.fog + ')');
        g.addColorStop(1, 'rgba(190,200,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h * 0.6);

        // resize the pool lazily to the current budget
        const n = budget(state.level, perfLevel, reduced);
        state._count = n;
        while (pool.length < n) pool.push(makeParticle(rng));
        if (pool.length > n) pool.length = n;

        if (n > 0) {
          const slant = Math.sin(windDeg * Math.PI / 180) * 0.25;
          ctx.strokeStyle = 'rgba(210,225,240,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < pool.length; i++) {
            const p = pool[i];
            const px = p.x * w, py = p.y * h, len = p.length * h, dx = slant * len;
            ctx.moveTo(px, py);
            ctx.lineTo(px + dx, py - len);
            p.y += p.speed * dt;
            if (p.y > 1) { p.y -= 1; p.x = rng(); } // wrap to the top with a fresh x
          }
          ctx.stroke();
        }
      }
    };
    return state;
  }

  KOS.Rain = { budget, tone, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = KOS.Rain;
})(typeof window !== 'undefined' ? window : globalThis);
