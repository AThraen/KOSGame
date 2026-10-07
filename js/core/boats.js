// KØS SEJL — js/core/boats.js
// KOS.Boats: the club's boat ladder with believable polars and handling characters.
//   KOS.Boats.list            ordered ladder (opti, tera, feva, zest, ilca, 29er, hboat, j70, rib)
//   KOS.Boats.get(id)         boat definition (falls back to opti)
//   def.polar(twaAbs, twsKn)  target boat speed in knots WITHOUT spinnaker (multiply by def.spiFactor(twaAbs) for kite)
//   def.spiFactor(twaAbs)     spinnaker/gennaker multiplier (1 when not useful, < 1 when it collapses too high)
//   KOS.Boats.optimal(def, tws, 'up'|'down', spi) -> {twa, speed, vmg}  best VMG angle from the polar
// Pure data + math. Speeds in knots here; physics converts to m/s.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const R = d => d * Math.PI / 180;

  // Each class: speeds at 10 kn true wind (knots) for close-hauled (up), beam reach, broad reach (135°), run (180°).
  // kUp / kDown: how much extra speed per +10 kn of wind above 10 kn (fraction), upwind and downwind.
  // lightExp: how quickly the boat dies in light air (higher = slower in light wind).
  const DEFS = [
    {
      id: 'opti', name: 'Optimist', crew: 1, length: 2.31, beam: 1.13, mass: 75, sailArea: 3.3, maxKn: 6.2,
      noGoDeg: 45, up: 3.5, reach: 4.5, broad: 4.3, run: 3.4, kUp: 0.08, kDown: 0.22, lightExp: 0.7,
      tackTime: 2.2, turnRate: 1.0, uRef: 1.0, accelT: 2.2, decelT: 3.0,
      hasSpinnaker: 'none', spinnakerBoost: 1, canCapsize: true, capsizeHeel: R(55), keel: false, plane: 0,
      heelAt10: 24, hikeRight: 22, optHeel: 6, leeway: 0.07, draft: 0.8, boomMax: 85, recoverTime: 4, trapeze: false,
      colors: { hull: '#ffffff', deck: '#e9eef3', sail: '#fdfdfd', trim: '#ff7a3d' },
      desc: {
        da: 'Klubbens første båd. Lille, stabil og tilgivende – her lærer du at styre, skøde og krydse.',
        en: 'The club\'s first boat. Small, stable and forgiving – learn to steer, trim and beat upwind.',
      },
      ageHint: { da: '7–15 år', en: 'Age 7–15' },
    },
    {
      id: 'tera', name: 'Tera', crew: 1, length: 2.87, beam: 1.22, mass: 84, sailArea: 3.7, maxKn: 7.5,
      noGoDeg: 45, up: 3.6, reach: 5.0, broad: 4.8, run: 3.9, kUp: 0.1, kDown: 0.3, lightExp: 0.75,
      tackTime: 2.0, turnRate: 1.1, uRef: 1.0, accelT: 1.8, decelT: 2.6,
      hasSpinnaker: 'none', spinnakerBoost: 1, canCapsize: true, capsizeHeel: R(52), keel: false, plane: 0,
      heelAt10: 26, hikeRight: 22, optHeel: 5, leeway: 0.07, draft: 0.7, boomMax: 85, recoverTime: 3, trapeze: false,
      colors: { hull: '#ffd23f', deck: '#fff2b0', sail: '#ffffff', trim: '#1f6fb2' },
      desc: {
        da: 'Lille, kvik og sjov i pust – en stabil båd mellem Opti og jolle.',
        en: 'Small, quick and fun in gusts – a stable step up from the Opti.',
      },
      ageHint: { da: '8–16 år', en: 'Age 8–16' },
    },
    {
      id: 'feva', name: 'RS Feva', crew: 2, length: 3.64, beam: 1.42, mass: 153, sailArea: 8.0, maxKn: 12,
      noGoDeg: 43, up: 4.3, reach: 6.0, broad: 5.6, run: 4.5, kUp: 0.12, kDown: 0.45, lightExp: 0.75,
      tackTime: 2.8, turnRate: 0.9, uRef: 1.1, accelT: 2.4, decelT: 3.4,
      hasSpinnaker: 'asym', spinnakerBoost: 1.25, canCapsize: true, capsizeHeel: R(50), keel: false, plane: 8,
      heelAt10: 24, hikeRight: 25, optHeel: 6, leeway: 0.065, draft: 0.9, boomMax: 85, recoverTime: 5, trapeze: false,
      colors: { hull: '#e8323c', deck: '#ffd9d6', sail: '#ffffff', spi: '#ff7a3d', trim: '#1b2a41' },
      desc: {
        da: 'To-mandsjolle med gennaker. Rorsmand og gast samarbejder – og på læns flyver den!',
        en: 'Two-person dinghy with a gennaker. Helm and crew work together – and downwind it flies!',
      },
      ageHint: { da: '10–18 år', en: 'Age 10–18' },
    },
    {
      id: 'zest', name: 'RS Zest', crew: 2, length: 3.5, beam: 1.42, mass: 118, sailArea: 5.8, maxKn: 8.5,
      noGoDeg: 44, up: 4.0, reach: 5.2, broad: 5.0, run: 4.2, kUp: 0.1, kDown: 0.3, lightExp: 0.72,
      tackTime: 2.6, turnRate: 0.85, uRef: 1.1, accelT: 2.8, decelT: 3.8,
      hasSpinnaker: 'none', spinnakerBoost: 1, canCapsize: true, capsizeHeel: R(52), keel: false, plane: 0,
      heelAt10: 20, hikeRight: 19, optHeel: 7, leeway: 0.065, draft: 0.9, boomMax: 85, recoverTime: 4, trapeze: false,
      colors: { hull: '#2b6cb0', deck: '#d6e9fb', sail: '#ffffff', trim: '#ffd25e' },
      desc: {
        da: 'Bred og stabil skolejolle. Masser af plads, svær at vælte – perfekt til at øve nye manøvrer.',
        en: 'Wide, stable trainer. Lots of room, hard to tip over – perfect for practising new manoeuvres.',
      },
      ageHint: { da: '9–99 år', en: 'Age 9–99' },
    },
    {
      id: 'ilca', name: 'ILCA', crew: 1, length: 4.23, beam: 1.39, mass: 134, sailArea: 7.06, maxKn: 12,
      noGoDeg: 42, up: 4.8, reach: 6.3, broad: 6.2, run: 5.0, kUp: 0.12, kDown: 0.5, lightExp: 0.8,
      tackTime: 3.0, turnRate: 0.85, uRef: 1.2, accelT: 2.4, decelT: 3.8,
      hasSpinnaker: 'none', spinnakerBoost: 1, canCapsize: true, capsizeHeel: R(48), keel: false, plane: 8,
      heelAt10: 32, hikeRight: 36, optHeel: 5, leeway: 0.06, draft: 0.8, boomMax: 88, recoverTime: 5, trapeze: false,
      colors: { hull: '#f4f6f8', deck: '#ffffff', sail: '#f7f7f2', trim: '#e8323c' },
      desc: {
        da: 'Olympisk enmandsjolle. Hurtig og fysisk – du skal hænge ud for at holde den flad!',
        en: 'Olympic single-hander. Fast and physical – you have to hike hard to keep it flat!',
      },
      ageHint: { da: '14+ år', en: 'Age 14+' },
    },
    {
      id: '29er', name: '29er', crew: 2, length: 4.45, beam: 1.77, mass: 190, sailArea: 12.5, maxKn: 22,
      noGoDeg: 40, up: 6.2, reach: 10.5, broad: 9.6, run: 6.6, kUp: 0.15, kDown: 0.75, lightExp: 0.85,
      tackTime: 3.4, turnRate: 0.95, uRef: 1.4, accelT: 1.8, decelT: 3.0,
      hasSpinnaker: 'asym', spinnakerBoost: 1.32, canCapsize: true, capsizeHeel: R(42), keel: false, plane: 9,
      heelAt10: 38, hikeRight: 46, optHeel: 4, leeway: 0.055, draft: 1.0, boomMax: 85, recoverTime: 6, trapeze: true,
      colors: { hull: '#1b2a41', deck: '#ff7a3d', sail: '#f2f6ff', spi: '#ffd25e', trim: '#49c6f2' },
      desc: {
        da: 'Lynhurtig skiff med trapez og gennaker. Planer på læns – men den kæntrer, hvis du blinker!',
        en: 'Lightning-fast skiff with trapeze and gennaker. Planes downwind – but capsizes if you blink!',
      },
      ageHint: { da: '13–21 år', en: 'Age 13–21' },
    },
    {
      id: 'hboat', name: 'H-båd', crew: 3, length: 8.28, beam: 2.18, mass: 1720, sailArea: 30, maxKn: 6.8,
      noGoDeg: 40, up: 5.3, reach: 6.2, broad: 6.0, run: 4.6, kUp: 0.06, kDown: 0.14, lightExp: 0.6,
      tackTime: 4.5, turnRate: 0.42, uRef: 1.8, accelT: 7.0, decelT: 12.0,
      hasSpinnaker: 'sym', spinnakerBoost: 1.12, canCapsize: false, capsizeHeel: R(90), keel: true, plane: 0,
      heelAt10: 18, hikeRight: 6, optHeel: 18, maxHeel: 38, leeway: 0.05, draft: 1.3, boomMax: 80, recoverTime: 0, trapeze: false,
      colors: { hull: '#c8262e', deck: '#f4f1ea', sail: '#ffffff', spi: '#2b6cb0', trim: '#f4f1ea' }, // KØS H-boats: red topsides, white deck
      desc: {
        da: 'Klassisk nordisk kølbåd. Tung, rolig og sikker – den kan ikke kæntre. Hele besætningen hjælper.',
        en: 'Classic Nordic keelboat. Heavy, calm and safe – it cannot capsize. The whole crew helps.',
      },
      ageHint: { da: '12+ år (hold)', en: 'Age 12+ (team)' },
    },
    {
      id: 'j70', name: 'J/70', crew: 4, length: 6.93, beam: 2.25, mass: 1100, sailArea: 33, maxKn: 19,
      noGoDeg: 40, up: 5.6, reach: 7.0, broad: 7.3, run: 5.2, kUp: 0.08, kDown: 0.6, lightExp: 0.65,
      tackTime: 4.0, turnRate: 0.5, uRef: 1.6, accelT: 5.0, decelT: 9.0,
      hasSpinnaker: 'asym', spinnakerBoost: 1.3, canCapsize: false, capsizeHeel: R(90), keel: true, plane: 10,
      heelAt10: 16, hikeRight: 7, optHeel: 16, maxHeel: 34, leeway: 0.045, draft: 1.45, boomMax: 80, recoverTime: 0, trapeze: false,
      colors: { hull: '#ffffff', deck: '#d9dee5', sail: '#e9eaee', spi: '#e8323c', trim: '#ff7a3d' },
      desc: {
        da: 'Sporty kølbåd med stor gennaker. Planer på læns i frisk vind – kapsejlads for hele holdet!',
        en: 'Sporty keelboat with a huge gennaker. Planes downwind in a breeze – racing for the whole team!',
      },
      ageHint: { da: '14+ år (hold)', en: 'Age 14+ (team)' },
    },
    {
      id: 'rib', name: 'RIB', crew: 1, length: 4.8, beam: 2.1, mass: 650, sailArea: 0, maxKn: 28,
      noGoDeg: 0, up: 0, reach: 0, broad: 0, run: 0, kUp: 0, kDown: 0, lightExp: 1,
      tackTime: 0, turnRate: 1.1, uRef: 1.5, accelT: 2.5, decelT: 3.5,
      hasSpinnaker: 'none', spinnakerBoost: 1, canCapsize: false, capsizeHeel: R(90), keel: false, plane: 12,
      heelAt10: 0, hikeRight: 0, optHeel: 0, leeway: 0, draft: 0.45, boomMax: 0, recoverTime: 0, trapeze: false,
      motor: { maxKn: 28, accel: 3.0, reverseKn: 6, planeKn: 12 },
      colors: { hull: '#ff7a1a', deck: '#2a2a2a', sail: '#ff7a1a', tube: '#ff7a1a', strake: '#141414', trim: '#141414' },
      desc: {
        da: 'Klubbens orange følgebåd. Hurtig, kvik og stærk – til trænere, slæb og redning.',
        en: 'The club\'s orange coach boat. Fast, nimble and strong – for coaching, towing and rescue.',
      },
      ageHint: { da: '12+ år (med træner)', en: 'Age 12+ (with a coach)' },
    },
  ];

  function interp(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        const t = (x - a[0]) / (b[0] - a[0]);
        const s = t * t * (3 - 2 * t); // smooth between table points
        return a[1] + (b[1] - a[1]) * (0.35 * t + 0.65 * s);
      }
    }
    return pts[pts.length - 1][1];
  }

  function build(d) {
    const def = Object.assign({}, d);
    def.noGo = R(d.noGoDeg);
    def.isMotor = !!d.motor;
    if (!def.motor) {
      const ng = d.noGoDeg;
      // Shape table at 10 kn (degrees -> knots).
      const table = [
        [0, 0], [ng * 0.3, 0], [ng * 0.75, d.up * (d.keel ? 1.0 : 0.6)], [ng, d.up * 0.72], [ng + 6, d.up], [ng + 14, d.up + (d.reach - d.up) * 0.3],
        [90, d.reach], [105, d.reach * 1.01], [135, d.broad], [160, (d.broad + d.run) / 2 * 0.98], [180, d.run],
      ];
      def._table = table;
      def.polar = function (twaAbs, tws) {
        const a = Math.abs(U.wrapPi(twaAbs)) * 180 / Math.PI;
        if (!(tws > 0)) return 0;
        const base = interp(table, a);
        let f;
        if (tws <= 10) f = Math.pow(tws / 10, d.lightExp);
        else {
          // Upwind gains little above 10 kn (depowered, hull speed); downwind planing boats gain a lot.
          const downness = U.smoothstep(70, 140, a);
          const k = U.lerp(d.kUp, d.kDown, downness);
          f = 1 + k * Math.min(tws - 10, 18) / 10 - (tws > 24 ? (tws - 24) * 0.015 : 0);
        }
        return Math.min(def.maxKn, base * f);
      };
      def.spiFactor = function (twaAbs) {
        if (def.hasSpinnaker === 'none') return 1;
        const a = Math.abs(U.wrapPi(twaAbs)) * 180 / Math.PI;
        const asym = def.hasSpinnaker === 'asym';
        const lo = asym ? 80 : 95; // below this the kite collapses
        if (a < lo) return a < lo - 25 ? 0.82 : 0.88;
        const on = U.smoothstep(lo, lo + 22, a);
        const off = asym ? 1 - U.smoothstep(145, 175, a) * 0.6 : 1; // asym gennakers hate dead runs
        return 1 + (def.spinnakerBoost - 1) * on * off;
      };
      def.spiCollapsedAt = function (twaAbs) {
        if (def.hasSpinnaker === 'none') return false;
        const a = Math.abs(U.wrapPi(twaAbs)) * 180 / Math.PI;
        return a < (def.hasSpinnaker === 'asym' ? 80 : 95);
      };
    } else {
      def.polar = function () { return 0; };
      def.spiFactor = function () { return 1; };
      def.spiCollapsedAt = function () { return false; };
    }
    return def;
  }

  const list = DEFS.map(build);
  const byId = {};
  for (const b of list) byId[b.id] = b;

  /** Best VMG angle for a class at a wind speed. dir 'up' | 'down'. */
  const optCache = {};
  function optimal(def, tws, dir, spi) {
    if (typeof def === 'string') def = byId[def] || list[0];
    if (def.isMotor) return { twa: 0, speed: 0, vmg: 0 };
    const tq = Math.round(tws * 4) / 4; // cached per 0.25 kn
    const key = def.id + (dir === 'down' ? 'd' : 'u') + (spi ? 's' : '') + tq;
    const hit = optCache[key];
    if (hit) return { twa: hit.twa, speed: hit.speed * hit.k(tws), vmg: hit.vmg * hit.k(tws) };
    const r = optimalRaw(def, tq, dir, spi);
    const base = r.speed;
    r.k = t => (base > 0 ? def.polar(r.twa, t) * (spi && dir === 'down' ? def.spiFactor(r.twa) : 1) / base : 0);
    optCache[key] = r;
    return { twa: r.twa, speed: r.speed * r.k(tws), vmg: r.vmg * r.k(tws) };
  }
  function optimalRaw(def, tws, dir, spi) {
    const up = dir !== 'down';
    let best = { twa: up ? def.noGo + R(6) : Math.PI, speed: 0, vmg: -Infinity };
    const from = up ? def.noGoDeg * 0.9 : 95;
    const to = up ? 85 : (spi && def.hasSpinnaker === 'asym' ? 175 : 180);
    for (let a = from; a <= to; a += 0.5) {
      const r = R(a);
      let s = def.polar(r, tws);
      if (spi && !up) s *= def.spiFactor(r);
      const v = s * (up ? Math.cos(r) : -Math.cos(r));
      if (v > best.vmg) best = { twa: r, speed: s, vmg: v };
    }
    return best;
  }

  KOS.Boats = {
    list,
    ids: list.map(b => b.id),
    get(id) { return byId[id] || list[0]; },
    has(id) { return !!byId[id]; },
    optimal,
    /** Unlock thresholds (total stars) from SPEC "Sejlerpas". */
    unlockStars: { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90, rib: 20 },
  };
})(typeof window !== 'undefined' ? window : globalThis);
