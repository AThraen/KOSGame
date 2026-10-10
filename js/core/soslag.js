// KØS SEJL — js/core/soslag.js
// KOS.Soslag: the pure core of the water-gun duel "Søslag i bugten" (docs/specs/soslag.md sections 4-9). No DOM, no globals but KOS.
//
// Units: metres, seconds, m/s. A jet ("packet") is 2.5D: ground position (x, y), height z, ground velocity (vx, vy), vertical speed vz.
// Wind: wind.at(x, y) -> {dir, speed}; dir is where the wind comes FROM (radians), speed in KNOTS. The jet is carried towards dir + PI.
//
//   CFG                       the constants (spec section 5)
//   windMs(wind, x, y)        air velocity felt by a jet {x, y} in m/s (wind speed x KW), `wind` = Wind object or {dir, speed}
//   createPool(max)           preallocated jet pool {jets, n, max, tick}; launch() recycles the OLDEST jet when it is full
//   launch(pool, boat, az, el, owner) -> jet     (pool may be null: returns a free jet)
//   stepJet(j, wind, dt) -> 0 live | 1 splash (z <= 0) | 2 too old (> 3 s); keeps the previous position in j.px/py/pz
//   stepPool(pool, wind, dt, onEnd) steps every live jet, calls onEnd(jet, why) and removes the finished ones
//   crewCenter(boat) -> {x, y}   the cockpit disc centre; hitTest(j, target) -> 'crew' | 'hull' | null (swept, against the CURRENT target)
//   solveAim(shooter, target, wind, opts) -> {az, el, ok, miss, T, zHit, descent}   (opts.sigma / opts.rand: radians, seeded rng)
//   accTake(b, dt) -> n jets due this step (0.12 s accumulator that carries the remainder); b.acc resets with resetFire(b)
//   gunReady(b) / spend(b, n) / tankStep(b, dt) / canFire(b): the tank (100, 1.8 per jet, 7/s passive when not firing, 20/s dipping below 1.2 m/s)
//   wetGain(wet, hits) -> new wet (0..100); endCheck / stars / score: the round rules (draw, knock-out, stars table)
//   downwindRange(tws) / upwindRange(tws) / station(opp, windFrom, tws, side, leadS): range table and the AI's windward station
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const PI = Math.PI, D2R = PI / 180;

  const CFG = {
    V0: 16, Z0: 1.2, G: 9.8, K: 1.0, KW: 1.3, EL_MIN: 8, EL_MAX: 40,
    HULL_Z: 0.9, CREW_R: 1.4, CREW_Z0: 0.1, CREW_Z1: 2.8, AIM_Z: 1.2,
    RATE_DT: 0.12, MAX_JETS: 64, MAX_AGE: 3,
    GUN_FWD: 0.15, CREW_BACK: 0.12,                     // gun and crew positions as a fraction of the boat length (forward / aft of centre)
    TANK_MAX: 100, SHOT_COST: 1.8, PASSIVE: 7, DIP: 20, DIP_SPEED: 1.2, REFILL_MIN: 10,
    WET_GAIN: 0.7, DRAW_DIFF: 5, STAR_MARGIN: 15, MIN_JETS: 20,
  };

  // ---------------------------------------------------------------- wind
  function windAt(wind, x, y) { return wind && wind.at ? wind.at(x, y) : wind; }
  function windMs(wind, x, y) {
    const w = windAt(wind, x, y) || { dir: 0, speed: 0 };
    const v = U.vec(w.dir + PI, U.ms(w.speed) * CFG.KW); // blows TOWARDS dir + PI
    return v;
  }

  // ---------------------------------------------------------------- jets
  function newJet() { return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, age: 0, owner: null, seq: 0, live: false }; }
  function createPool(max) {
    const n = max || CFG.MAX_JETS, jets = [];
    for (let i = 0; i < n; i++) jets.push(newJet());
    return { jets, n: 0, max: n, seq: 0 };
  }
  function gunPos(boat) { const f = U.vec(boat.heading, CFG.GUN_FWD * boat.cls.length); return { x: boat.x + f.x, y: boat.y + f.y }; }
  /** Fire one jet from `boat` at azimuth az (heading-style, rad) and elevation el (rad). The boat's own velocity is inherited. */
  function launch(pool, boat, az, el, owner) {
    let j;
    if (!pool) j = newJet();
    else if (pool.n < pool.max) j = pool.jets[pool.n++];
    else { // full: recycle the oldest jet (never skip the new shot, never allocate)
      let k = 0;
      for (let i = 1; i < pool.max; i++) if (pool.jets[i].seq < pool.jets[k].seq) k = i;
      j = pool.jets[k];
    }
    const g = gunPos(boat), h = CFG.V0 * Math.cos(el), d = U.vec(az);
    j.x = j.px = g.x; j.y = j.py = g.y; j.z = j.pz = CFG.Z0;
    j.vx = d.x * h + (boat.vx || 0); j.vy = d.y * h + (boat.vy || 0); j.vz = CFG.V0 * Math.sin(el);
    j.age = 0; j.owner = owner === undefined ? boat : owner; j.live = true; j.seq = pool ? ++pool.seq : 0;
    return j;
  }
  function stepJet(j, wind, dt) {
    const a = windMs(wind, j.x, j.y);
    j.px = j.x; j.py = j.y; j.pz = j.z;
    j.vx += (a.x - j.vx) * CFG.K * dt; j.vy += (a.y - j.vy) * CFG.K * dt; j.vz -= CFG.G * dt;
    j.x += j.vx * dt; j.y += j.vy * dt; j.z += j.vz * dt; j.age += dt;
    if (j.z <= 0) return 1;
    return j.age > CFG.MAX_AGE ? 2 : 0;
  }
  function stepPool(pool, wind, dt, onEnd) {
    for (let i = 0; i < pool.n;) {
      const j = pool.jets[i], r = stepJet(j, wind, dt);
      if (r) {
        if (onEnd) onEnd(j, r);
        j.live = false;
        const last = pool.jets[--pool.n]; pool.jets[pool.n] = j; pool.jets[i] = last; // swap-remove keeps the pool dense, no allocation
      } else i++;
    }
  }

  // ---------------------------------------------------------------- hit test
  function crewCenter(boat) { const f = U.vec(boat.heading + PI, CFG.CREW_BACK * boat.cls.length); return { x: boat.x + f.x, y: boat.y + f.y }; }
  /** Swept test of the jet's last step against the target's current state: 'crew' (inside the cylinder), 'hull' (the hull but not a person) or null. */
  function hitTest(j, target) {
    const c = crewCenter(target);
    const sn = U.segNearest(c.x, c.y, j.px, j.py, j.x, j.y);
    if (sn.d <= CFG.CREW_R) {
      const z = j.pz + (j.z - j.pz) * sn.t;
      if (z >= CFG.CREW_Z0 && z <= CFG.CREW_Z1) return 'crew';
    }
    const cap = KOS.Physics.capsule(target);
    if (U.segSeg(j.px, j.py, j.x, j.y, cap.ax, cap.ay, cap.bx, cap.by).d <= cap.r) {
      const z = Math.max(j.z, 0);
      if (z <= CFG.HULL_Z) return 'hull'; // reaches the deck / hull of the target (not the air above it): no points
    }
    return null;
  }

  // ---------------------------------------------------------------- aiming
  const DT = 1 / 60;
  // Fly an aimed jet at fixed dt until it falls through AIM_Z (descending): returns where and when. `target` = predicted crew path (or null).
  function fly(shooter, az, el, wind, dt) {
    const j = launch(null, shooter, az, el);
    let prevZ = j.z, t = 0;
    for (let i = 0; i < 400; i++) {
      const r = stepJet(j, wind, dt); t += dt;
      if (j.vz < 0 && j.z <= CFG.AIM_Z && prevZ > CFG.AIM_Z) {
        const u = (prevZ - CFG.AIM_Z) / (prevZ - j.z);
        return { x: j.px + (j.x - j.px) * u, y: j.py + (j.y - j.py) * u, T: t - dt + dt * u, vx: j.vx, vy: j.vy, vz: j.vz, ok: true };
      }
      prevZ = j.z;
      if (r) break;
    }
    return { x: j.x, y: j.y, T: t, vx: j.vx, vy: j.vy, vz: j.vz, ok: false };
  }
  function solveAim(shooter, target, wind, opts) {
    opts = opts || {};
    const g = gunPos(shooter), c0 = crewCenter(target), tvx = target.vx || 0, tvy = target.vy || 0;
    let az = U.bearing(g, c0), el = 20 * D2R, T = U.dist(g, c0) / 12, last = null;
    const E0 = CFG.EL_MIN * D2R, E1 = CFG.EL_MAX * D2R, STEP = 1 * D2R;
    for (let it = 0; it < 4; it++) {
      const px = c0.x + tvx * T, py = c0.y + tvy * T;           // predicted crew centre (constant velocity)
      az = U.bearing(g, { x: px, y: py });
      const dir = U.vec(az), lat = U.vec(az + PI / 2), dd = U.dist(g, { x: px, y: py });
      const err = e => { const f = fly(shooter, az, e, wind, 1 / 30); return { f, par: (f.x - px) * dir.x + (f.y - py) * dir.y, lat: (f.x - px) * lat.x + (f.y - py) * lat.y }; };
      // scan the elevations upwards: the first sign change of the along-line error is the flattest solution (shortest flight)
      let prev = err(E0), lo = null, hi = null, best = { e: E0, a: Math.abs(prev.par), r: prev };
      for (let e = E0 + STEP; e <= E1 + 1e-9; e += STEP) {
        const cur = err(Math.min(e, E1));
        if (Math.abs(cur.par) < best.a) best = { e: Math.min(e, E1), a: Math.abs(cur.par), r: cur };
        if (prev.par < 0 && cur.par >= 0 && !lo) { lo = e - STEP; hi = Math.min(e, E1); break; }
        prev = cur;
      }
      let r = best.r;
      if (lo !== null) { // bisect inside the bracket
        for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2, em = err(m); if (em.par < 0) lo = m; else hi = m; }
        el = (lo + hi) / 2; r = err(el);
      } else el = best.e;
      T = r.f.T;
      az -= r.lat / Math.max(dd, 1);                              // correct the azimuth by the lateral miss (wind drift)
      last = r;
      if (lo !== null && Math.abs(r.lat) < 0.03) break;
    }
    // sigma (seeded) on top, as the player's / AI's spread
    if (opts.sigma && opts.rand) { az += (opts.rand() + opts.rand() + opts.rand() - 1.5) * 2 * opts.sigma; el += (opts.rand() + opts.rand() + opts.rand() - 1.5) * 2 * (opts.sigmaEl || opts.sigma * 0.6); }
    // verify: forward-simulate the aimed jet at the real step, the target moving at constant velocity, same swept test as the game
    const j = launch(null, shooter, az, el), tg = { x: target.x, y: target.y, heading: target.heading, cls: target.cls };
    let t = 0, miss = Infinity, zHit = j.z, okHit = false, descent = 0, tz = null;
    for (let i = 0; i < 400; i++) {
      const r = stepJet(j, wind, DT); t += DT;
      tg.x = target.x + tvx * t; tg.y = target.y + tvy * t;
      const cc = crewCenter(tg), sn = U.segNearest(cc.x, cc.y, j.px, j.py, j.x, j.y), z = j.pz + (j.z - j.pz) * sn.t;
      if (j.vz < 0 && j.pz > CFG.AIM_Z && j.z <= CFG.AIM_Z) { descent = Math.atan2(-j.vz, Math.hypot(j.vx, j.vy)) / D2R; tz = t; }
      if (sn.d < miss) { miss = sn.d; zHit = z; }
      if (sn.d <= CFG.CREW_R && z >= CFG.CREW_Z0 && z <= CFG.CREW_Z1) { okHit = true; break; }
      if (r) break;
    }
    return { az, el, ok: okHit, miss, T: tz === null ? T : tz, zHit, descent: descent || (last ? Math.atan2(-last.f.vz, Math.hypot(last.f.vx, last.f.vy)) / D2R : 0) };
  }

  // ---------------------------------------------------------------- range table (memoised)
  const reachMemo = {};
  /** Max ground range (m) of a still boat shooting `rel` radians off the downwind direction (0 = downwind, PI = upwind), best elevation in the allowed range. */
  function reach(tws, rel, elMax) {
    const key = tws.toFixed(1) + '|' + rel.toFixed(2) + '|' + (elMax || 0);
    if (reachMemo[key] !== undefined) return reachMemo[key];
    const w = { dir: 0, speed: tws }, boat = { x: 0, y: 0, heading: 0, vx: 0, vy: 0, cls: { length: 0 } }; // wind from north (dir 0) blows towards south = PI
    const az = PI + rel; let best = 0, bestEl = 0;
    for (let e = CFG.EL_MIN; e <= (elMax || CFG.EL_MAX) + 1e-9; e += 0.5) {
      const j = launch(null, boat, az, e * D2R);
      let r = 0;
      for (let i = 0; i < 600 && !r; i++) r = stepJet(j, w, DT);
      const u = /* interpolate the splash point: the last step ends just below the surface */ j.pz / Math.max(j.pz - j.z, 1e-9), dx = j.px + (j.x - j.px) * u, dy = j.py + (j.y - j.py) * u, dd = Math.hypot(dx, dy);
      if (dd > best) { best = dd; bestEl = e; }
    }
    reachMemo[key] = best; reachMemo[key + 'e'] = bestEl;
    return best;
  }
  const downwindRange = tws => reach(tws, 0);
  const upwindRange = tws => reach(tws, PI);
  /** The best elevation (degrees) for the max range upwind (the table of the spec says el 15.5 at 9 kn). */
  function bestElevation(tws, rel) { reach(tws, rel); return reachMemo[tws.toFixed(1) + '|' + rel.toFixed(2) + '|0e']; }
  /** AI windward station: windFrom = where the wind comes from; the opponent's windward point, 0.7 x downwind range (9..14 m), `side` (+-1) metres offset crosswind. */
  function station(opp, windFrom, tws, side, leadS) {
    const d = U.clamp(0.7 * downwindRange(tws), 9, 14), u = U.vec(windFrom), r = U.vec(windFrom + PI / 2), l = leadS || 0;
    const x = opp.x + (opp.vx || 0) * l, y = opp.y + (opp.vy || 0) * l; // leadS: aim where a moving opponent will be
    return { x: x + u.x * d + r.x * (side || 1) * 6, y: y + u.y * d + r.y * (side || 1) * 6, d };
  }

  // ---------------------------------------------------------------- fire accumulator, tank, wet meter
  /** Jets due this step: the accumulator carries the remainder (0.12 s is 7.2 steps at 60 Hz, a step count would drift). */
  function accTake(b, dt) {
    b.acc = (b.acc || 0) + dt;
    let n = 0;
    while (b.acc >= CFG.RATE_DT - 1e-9) { b.acc -= CFG.RATE_DT; n++; }
    if (b.acc < 0) b.acc = 0;
    return n;
  }
  function resetFire(b) { b.acc = 0; }
  /** Hysteresis: running dry (< one shot) greys the gun until the tank has 8 units again. */
  function gunReady(b) {
    if (b.tank === undefined) b.tank = CFG.TANK_MAX;
    if (b.tank < CFG.SHOT_COST) b.dry = true; else if (b.dry && b.tank >= CFG.REFILL_MIN) b.dry = false;
    return !b.dry;
  }
  const canFire = gunReady;
  function spend(b, n) { b.tank = Math.max(0, (b.tank === undefined ? CFG.TANK_MAX : b.tank) - CFG.SHOT_COST * (n === undefined ? 1 : n)); }
  /** Refill: 20/s while dipping (speed < 1.2 m/s and not in a penalty), else the passive 7/s; nothing flows back in while the gun is firing (`firing`): a full tank lasts 100 / (1.8 x 8.3) = 6.7 s of fire. */
  function tankStep(b, dt, firing) {
    const dip = Math.abs(b.speed || 0) < CFG.DIP_SPEED && !b.pen;
    b.tank = Math.min(CFG.TANK_MAX, (b.tank === undefined ? CFG.TANK_MAX : b.tank) + (firing ? 0 : (dip ? CFG.DIP : CFG.PASSIVE)) * dt);
    return dip;
  }
  function wetGain(wet, hits) { return Math.min(100, wet + CFG.WET_GAIN * (hits === undefined ? 1 : hits)); }

  // ---------------------------------------------------------------- round rules
  /** Order inside a sim step: ... wet clamp, THIS check (100 % first), then the clock. Returns null while the duel goes on, else
   *  {outcome: 'win'|'lose'|'draw', why: 'soaked'|'soakedMe'|'clock', diff}. A difference under 5 points is a draw; both at 100 in one step is a draw. */
  function endCheck(myWet, oppWet, clockUp) {
    const my = myWet >= 100, op = oppWet >= 100;
    if (my && op) return { outcome: 'draw', why: 'soaked', diff: 0 };
    if (op) return { outcome: 'win', why: 'soaked', diff: oppWet - myWet };
    if (my) return { outcome: 'lose', why: 'soakedMe', diff: oppWet - myWet };
    if (!clockUp) return null;
    const diff = Math.round((oppWet - myWet) * 100) / 100;
    if (Math.abs(diff) < CFG.DRAW_DIFF) return { outcome: 'draw', why: 'clock', diff };
    return { outcome: diff > 0 ? 'win' : 'lose', why: 'clock', diff };
  }
  /** 0 idle (< 20 jets fired), 1 lost/drew but fought, 2 won, 3 won by >= 15 points with at most 1 foul. */
  function stars(r) {
    if ((r.fired || 0) < CFG.MIN_JETS) return 0;
    if (r.outcome !== 'win') return 1;
    return (r.diff >= CFG.STAR_MARGIN - 1e-9 && (r.fouls || 0) <= 1) ? 3 : 2;
  }
  function score(oppWet, myWet, fouls) { return Math.max(0, Math.round(oppWet * 10 + Math.max(0, 100 - myWet) * 3 - (fouls || 0) * 50)); }

  KOS.Soslag = { CFG, windMs, createPool, launch, stepJet, stepPool, gunPos, crewCenter, hitTest, solveAim, accTake, resetFire, gunReady, canFire, spend, tankStep,
    wetGain, endCheck, stars, score, downwindRange, upwindRange, bestElevation, reach, station };
})(typeof globalThis !== 'undefined' ? globalThis : this);
