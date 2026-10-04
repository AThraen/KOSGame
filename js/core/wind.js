// KØS SEJL — js/core/wind.js
// KOS.Wind: a deterministic wind field with oscillating shifts and moving gust patches.
//   const wind = KOS.Wind.create({dir /*rad, FROM*/, speed /*kn*/, gust /*0..1*/, shift /*0..1*/, seed, bounds})
//     (dirDeg is accepted instead of dir for authoring)
//   wind.update(dt)            advance time (gusts drift downwind, shifts oscillate)
//   wind.at(x, y) -> {dir, speed}  local wind (radians FROM, knots) including gusts/lulls and small spatial bend
//   wind.base -> {dir, speed}  configured mean wind;  wind.dir / wind.speed: current course-wide wind (no gusts)
//   wind.gusts -> [{x, y, r, k, vx, vy, kMax, life}]  moving patches (k = current speed multiplier at the core;
//                 k < 1 is a lull). Renderer draws darker water for k > 1.
//   wind.setBase(dir, speed)   change the mean wind (e.g. a front coming through)
//   wind.toVec(x, y) -> {x, y} m/s vector the air moves TOWARDS (for particles/flags)
// Same seed + same update() calls => identical wind everywhere.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;

  function create(opts) {
    const o = opts || {};
    const seedStr = o.seed === undefined ? 'wind' : o.seed;
    const seed = U.hash('wind:' + seedStr);
    const rnd = U.rng(seed);
    const dir0 = o.dir !== undefined ? o.dir : o.dirDeg !== undefined ? U.rad(o.dirDeg) : U.rad(225);
    const gustK = U.clamp(o.gust === undefined ? 0.3 : o.gust, 0, 1);
    const shiftK = U.clamp(o.shift === undefined ? 0.3 : o.shift, 0, 1);
    const b = o.bounds || { x0: -600, y0: -600, x1: 600, y1: 600 };
    const bounds = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
    const span = Math.max(200, Math.hypot(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0));

    // Shift oscillation: two sines with seeded periods plus slow noise.
    const per1 = rnd.range(110, 190), per2 = rnd.range(37, 61);
    const ph1 = rnd.range(0, U.TAU), ph2 = rnd.range(0, U.TAU);
    const amp = U.rad(15) * shiftK;
    const bendAmp = U.rad(3) * shiftK; // the wind bends a little across the course

    const wind = {
      t: 0,
      base: { dir: dir0, speed: Math.max(0, o.speed === undefined ? 10 : o.speed) },
      gustiness: gustK,
      shiftiness: shiftK,
      bounds,
      seed,
      dir: dir0,
      speed: o.speed === undefined ? 10 : o.speed,
      gusts: [],
    };

    function shiftAt(t) {
      return amp * (0.62 * Math.sin((U.TAU * t) / per1 + ph1) + 0.23 * Math.sin((U.TAU * t) / per2 + ph2) +
        0.15 * U.noise1(seed ^ 0x51ed, t / 23));
    }
    const wob = o.steady ? 0 : 1;
    function speedWobble(t) { return 1 + wob * (0.06 * U.noise1(seed ^ 0xbeef, t / 9) + 0.04 * U.noise1(seed ^ 0xf00d, t / 31)); }

    function downwind() { return U.vec(wind.dir + Math.PI); }

    function spawnGust(g, initial) {
      // Place upwind of the area (or anywhere on first spawn), sized and powered by gustiness.
      const dw = downwind();
      const across = { x: -dw.y, y: dw.x };
      const lat = rnd.range(-0.55, 0.55) * span;
      let along;
      if (initial) along = rnd.range(-0.55, 0.55) * span;
      else along = -0.55 * span - rnd.range(0, 0.25) * span;
      g.x = cx + dw.x * along + across.x * lat;
      g.y = cy + dw.y * along + across.y * lat;
      const lull = rnd() < 0.22;
      g.r = rnd.range(35, 70) + 90 * gustK * rnd();
      g.kMax = lull ? 1 - rnd.range(0.12, 0.3) * (0.4 + gustK) : 1 + gustK * rnd.range(0.3, 0.6);
      g.kMax = Math.min(1.6, g.kMax);
      g.dirOff = rnd.range(-1, 1) * U.rad(4 + 6 * gustK); // gusts often come with a small shift
      g.life = 0;
      g.dur = rnd.range(50, 110);
      g.speedFac = rnd.range(0.45, 0.75);
      g.k = 1;
      g.vx = 0; g.vy = 0;
      g.lull = lull;
      return g;
    }

    const nG = gustK > 0 ? Math.round(3 + gustK * 9) : 0;
    for (let i = 0; i < nG; i++) wind.gusts.push(spawnGust({}, true));
    // start some gusts mid-life so the water isn't empty at t=0
    for (const g of wind.gusts) g.life = rnd.range(0, g.dur * 0.7);

    function gustEnvelope(g) {
      const a = U.smoothstep(0, 8, g.life);
      const z = 1 - U.smoothstep(g.dur - 10, g.dur, g.life);
      return a * z;
    }

    function refreshGust(g) {
      const e = gustEnvelope(g);
      g.k = 1 + (g.kMax - 1) * e;
      const dw = downwind();
      const v = U.ms(wind.speed) * g.speedFac;
      g.vx = dw.x * v; g.vy = dw.y * v;
    }
    for (const g of wind.gusts) refreshGust(g);

    wind.update = function (dt) {
      if (!(dt > 0)) return wind;
      wind.t += dt;
      wind.dir = U.wrapPi(wind.base.dir + shiftAt(wind.t));
      wind.speed = wind.base.speed * speedWobble(wind.t);
      for (const g of wind.gusts) {
        g.life += dt;
        refreshGust(g);
        g.x += g.vx * dt; g.y += g.vy * dt;
        // respawn when faded out or blown far downwind
        const dw = downwind();
        const along = (g.x - cx) * dw.x + (g.y - cy) * dw.y;
        if (g.life >= g.dur || along > 0.7 * span) spawnGust(g, false), refreshGust(g);
      }
      return wind;
    };

    wind.at = function (x, y) {
      let k = 1, kLull = 1, dOff = 0, wsum = 0;
      for (const g of wind.gusts) {
        const d = Math.hypot(x - g.x, y - g.y);
        if (d >= g.r) continue;
        const w = 1 - U.smoothstep(0, g.r, d);
        const kk = 1 + (g.k - 1) * w;
        if (kk >= 1) k = Math.max(k, kk); else kLull = Math.min(kLull, kk);
        dOff += g.dirOff * w * Math.abs(g.k - 1) * 3; wsum += w;
      }
      const bend = bendAmp * U.noise2(seed ^ 0x1234, (x - cx) / 400, (y - cy) / 400 + wind.t / 300);
      return {
        dir: U.wrapPi(wind.dir + bend + U.clamp(dOff, -U.rad(8), U.rad(8))),
        speed: Math.max(0, wind.speed * k * kLull),
      };
    };

    wind.toVec = function (x, y) {
      const w = x === undefined ? { dir: wind.dir, speed: wind.speed } : wind.at(x, y);
      return U.vec(w.dir + Math.PI, U.ms(w.speed));
    };

    wind.setBase = function (dir, speed) {
      if (dir !== undefined && dir !== null) wind.base.dir = dir;
      if (speed !== undefined && speed !== null) wind.base.speed = Math.max(0, speed);
      wind.dir = U.wrapPi(wind.base.dir + shiftAt(wind.t));
      wind.speed = wind.base.speed * speedWobble(wind.t);
    };

    // initialise current values for t = 0
    wind.dir = U.wrapPi(wind.base.dir + shiftAt(0));
    wind.speed = wind.base.speed * speedWobble(0);
    return wind;
  }

  /** A constant wind object with the same interface (handy for lessons and tests). */
  function steady(dir, speed) {
    return create({ dir, speed, gust: 0, shift: 0, seed: 'steady', steady: true });
  }

  KOS.Wind = { create, steady };
})(typeof window !== 'undefined' ? window : globalThis);
