// KØS SEJL — js/core/physics.js
// KOS.Physics: a fun but sail-correct boat model (and a RIB motor model).
//   KOS.Physics.createBoat(classId, {x, y, heading, speed, sailNo, name, colors, isPlayer, crewNames, id})
//   KOS.Physics.controls() -> {rudder, sheet, hike, spinnaker, throttle, autoTrim, autoHike, trimBias}
//   KOS.Physics.step(boat, controls, env, dt)   env = {wind, venue, assist: 'easy'|'normal'|'pro', t, autoRecover}
//   KOS.Physics.collide(boats, venue, marks)    -> [{type:'boat'|'shore'|'mark'|'pier', a, b, speed, x, y}]
//   helpers: idealSheet(boat), idealBoom(cls, awaAbs), vmg(boat, dirOrPoint), laylines(mark, windDir, cls, tws, opts),
//            optimal(cls, tws, 'up'|'down', spi), neededHike(boat), pointOfSail(twaAbs, cls), right(boat, windDir),
//            capsize(boat, side), tow(a, b, len, dt), velocityAt(boat), bow(boat), stern(boat),
//            idealBoard(cls, twaAbs), boardFactor(board, twaAbs), idealJib(boat)
//   controls also carry board (0..1 target, 1 = down) / autoBoard, and jib (0..1 sheet) / autoJib (default true = crew trims it)
// Events (KOS.Events): boat:tack, boat:gybe {boat, from, to, power}, boat:capsize, boat:righted, boat:irons,
//   boat:plane, boat:spiCollapse, boat:heelWarn, boat:ground {boat, type, speed}, boat:collide {a, b, type, speed}
// Model summary:
//   apparent wind -> boom angle limited by the sheet -> trim quality (luffing when eased, stall when over-sheeted)
//   target speed = polar(twa, local tws) x spinnaker factor x trim x heel factor x manoeuvre factor
//   heel = wind pressure x sail power - hiking (dinghies can capsize past capsizeHeel in normal/pro; keelboats never)
//   speed approaches target with class time constants (heavy boats keep way), rudder authority scales with speed
//   and reverses with sternway; in the no-go zone the boat stops, drifts back and gets blown off (in irons).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const R = d => d * Math.PI / 180;
  const MIN_BOOM = R(4);
  const BY_THE_LEE = R(9);

  function emit(name, payload) { if (KOS.Events) KOS.Events.emit(name, payload); }

  function controls() {
    return { rudder: 0, sheet: 0.5, hike: 0, spinnaker: false, throttle: 0, autoTrim: true, autoHike: false, trimBias: 0,
      board: 1, autoBoard: false, jib: 0.5, autoJib: true };
  }

  // ---- daggerboard / centreboard (cls.hasBoard): boat.board 0..1, 1 = fully down (= the classic model, unchanged).
  // Less board = less lateral resistance (more leeway, less drive upwind) but also less wetted area (less drag off the
  // wind). boardNeed(twa) is the least board that still grips at that angle; below it the boat slides and loses drive.
  const BOARD_RATE = 1.4; // board travel per second (Ned -> Op in ~0.6 s)
  function boardNeed(aTwa) {
    const a = U.deg(aTwa);
    if (a <= 55) return 1;
    if (a <= 100) return 1 - 0.45 * U.smoothstep(55, 100, a);
    return 0.55 - 0.3 * U.smoothstep(100, 145, a);
  }
  /** Speed multiplier for a board position at a true wind angle (exactly 1 with the board fully down). */
  function boardFactor(b, aTwa) {
    if (b >= 1) return 1;
    const def = Math.max(0, boardNeed(aTwa) - b);
    const gain = 0.07 * Math.min(1, (1 - b) / 0.7) * U.smoothstep(R(50), R(120), aTwa); // less wetted area
    const wobble = b < 0.3 ? 0.015 * (0.3 - b) / 0.15 * U.smoothstep(R(130), R(165), aTwa) : 0; // board right up: rolls downwind
    return 1 - 0.55 * def * def + gain - wobble;
  }
  const boardCache = {};
  /** Best board position for a true wind angle (1 on boats without a board): down upwind, ~0.6 on a beam reach, ~0.3 on a run. */
  function idealBoard(cls, twaAbs) {
    if (cls && cls.cls) cls = cls.cls;
    if (typeof cls === 'string') cls = KOS.Boats.get(cls);
    if (!cls || !cls.hasBoard) return 1;
    const deg = Math.round(U.deg(Math.abs(U.wrapPi(twaAbs))));
    if (boardCache[deg] !== undefined) return boardCache[deg];
    let best = 1, bf = 1;
    for (let b = 0.95; b >= 0.149; b -= 0.05) { const f = boardFactor(b, R(deg)); if (f > bf + 1e-9) { bf = f; best = Math.round(b * 100) / 100; } }
    return (boardCache[deg] = best);
  }
  /** Ideal jib sheet (0 = hard in, 1 = eased) for the boat's apparent wind: the same scale as the main sheet. */
  function idealJib(boat) { return idealSheet(boat); }

  let nextId = 1;
  function createBoat(classId, o) {
    o = o || {};
    const cls = KOS.Boats.get(classId);
    const b = {
      id: o.id || 'b' + nextId++,
      cls, classId: cls.id,
      x: o.x || 0, y: o.y || 0, heading: o.heading || 0,
      vx: 0, vy: 0, speed: o.speed || 0, slip: 0, yawRate: 0,
      heel: 0, twa: 0, tws: 0, awa: 0, aws: 0, windDir: 0,
      tack: 'starboard', pos: 'beamreach',
      boom: 0, sheet: 0.5, trim: 1, luffing: false, stalled: false, inIrons: false, hike: 0,
      spinnaker: false, spiCollapsed: false, capsized: false, capsizeT: 0, capsizeSide: 0, planing: false,
      wake: [], distanceSailed: 0, tacks: 0, gybes: 0, t: 0,
      sailNo: o.sailNo !== undefined ? o.sailNo : '', name: o.name || cls.name,
      colors: Object.assign({}, cls.colors, o.colors || {}),
      isPlayer: !!o.isPlayer, crewNames: o.crewNames || [],
      rudder: 0, throttle: 0, power: 0, targetKn: 0,
      grounded: false, groundT: 0, r13: false, maneuverT: 0, wakeSize: 0, skid: 0, depower: 0,
      board: 1, jib: 0.5, jibAng: 0, jibManual: false, jibTrim: 1, jibLuffing: false, jibStalled: false,
      _init: false, _wakeT: 0, _warnT: 0, _groundCd: 0,
    };
    if (b.speed) { const f = U.vec(b.heading); b.vx = f.x * b.speed; b.vy = f.y * b.speed; }
    return b;
  }

  function idealBoom(cls, awaAbs) {
    const a = U.deg(Math.abs(awaAbs));
    const maxB = R(cls.boomMax || 85);
    return U.clamp(R(4 + (a - 18) * 0.62), MIN_BOOM, maxB);
  }
  function sheetForBoom(cls, boom) {
    const maxB = R(cls.boomMax || 85);
    return U.clamp((boom - MIN_BOOM) / (maxB - MIN_BOOM), 0, 1);
  }
  function idealSheet(boat) { return sheetForBoom(boat.cls, idealBoom(boat.cls, boat.awa)); }

  function pointOfSail(twaAbs, cls) {
    const a = Math.abs(twaAbs);
    const ng = cls && cls.noGo ? cls.noGo : R(42);
    if (a < ng) return 'irons';
    if (a < ng + R(15)) return 'closehauled';
    if (a < R(75)) return 'closereach';
    if (a < R(105)) return 'beamreach';
    if (a < R(150)) return 'broadreach';
    return 'run';
  }

  function sideSign(boat) { return boat.tack === 'starboard' ? 1 : -1; }

  function capsize(boat, side) {
    if (boat.capsized) return;
    boat.capsized = true;
    boat.capsizeT = 0;
    boat.capsizeSide = side || (boat.heel >= 0 ? 1 : -1);
    boat.spinnaker = false;
    boat.planing = false;
    emit('boat:capsize', { boat });
  }

  function right(boat, windDir) {
    if (!boat.capsized) return;
    boat.capsized = false;
    boat.capsizeT = 0;
    boat.heel = 0;
    boat.speed = 0; boat.slip = 0; boat.yawRate = 0;
    if (windDir !== undefined) {
      // a righted dinghy ends up lying close to the wind, ready to sail off on a close reach
      const s = boat.tack === 'port' ? -1 : 1;
      boat.heading = U.wrapPi(windDir - s * (boat.cls.noGo + R(18)));
    }
    emit('boat:righted', { boat });
  }

  function velocityAt(boat) { return { x: boat.vx, y: boat.vy }; }
  function bow(boat) { const f = U.vec(boat.heading, boat.cls.length / 2); return { x: boat.x + f.x, y: boat.y + f.y }; }
  function stern(boat) { const f = U.vec(boat.heading, boat.cls.length / 2); return { x: boat.x - f.x, y: boat.y - f.y }; }

  function syncLocal(boat) {
    const f = U.vec(boat.heading), r = U.vec(boat.heading + Math.PI / 2);
    boat.speed = boat.vx * f.x + boat.vy * f.y;
    boat.slip = boat.vx * r.x + boat.vy * r.y;
  }

  // ------------------------------------------------------------------ sailing boats
  function stepSail(boat, c, env, dt) {
    const cls = boat.cls;
    const assist = env.assist || 'normal';
    const w = env.wind && env.wind.at ? env.wind.at(boat.x, boat.y) : { dir: env.wind && env.wind.dir || 0, speed: env.wind && env.wind.speed || 0 };
    const tws = Math.max(0, w.speed);
    const twsMs = U.ms(tws);
    boat.tws = tws;
    boat.windDir = w.dir;
    const twa = U.wrapPi(w.dir - boat.heading);
    boat.twa = twa;
    const aTwa = Math.abs(twa);

    if (!boat._init) {
      boat._init = true;
      boat.tack = twa >= 0 ? 'starboard' : 'port';
      const ib = idealBoom(cls, twa);
      boat.boom = -sideSign(boat) * ib;
      boat.sheet = sheetForBoom(cls, ib);
    }

    // ---- tack / gybe detection (with a little by-the-lee tolerance on runs)
    if (tws > 0.3 && !boat.capsized) {
      let flip = false;
      if (boat.tack === 'port' && twa > 0 && twa < Math.PI - BY_THE_LEE) flip = true;
      else if (boat.tack === 'starboard' && twa < 0 && twa > -(Math.PI - BY_THE_LEE)) flip = true;
      if (flip) {
        const from = boat.tack;
        boat.tack = from === 'port' ? 'starboard' : 'port';
        if (aTwa < Math.PI / 2) {
          boat.tacks++;
          boat.maneuverT = cls.tackTime;
          boat.r13 = true;
          emit('boat:tack', { boat, from, to: boat.tack });
        } else {
          boat.gybes++;
          boat.maneuverT = cls.tackTime * 0.6;
          const boomOut = Math.abs(boat.boom) / R(cls.boomMax || 85);
          const power = U.clamp(tws / 12, 0, 2) * (0.4 + 0.6 * boomOut);
          const kickK = assist === 'pro' ? 1 : assist === 'normal' ? 0.7 : 0.45;
          const kick = R(13) * power * power * kickK * (cls.keel ? 0.3 : 1);
          boat.heel += -sideSign(boat) * kick; // the boom slams over: lurch to the new leeward side
          emit('boat:gybe', { boat, from, to: boat.tack, power });
        }
      }
    }
    if (boat.r13 && aTwa >= cls.noGo) boat.r13 = false;
    const s = sideSign(boat);

    // ---- apparent wind
    const fx = Math.sin(w.dir) * twsMs + boat.vx;
    const fy = -Math.cos(w.dir) * twsMs + boat.vy;
    const awsMs = Math.hypot(fx, fy);
    boat.aws = U.kn(awsMs);
    boat.awa = awsMs > 0.05 ? U.wrapPi(U.heading(fx, fy) - boat.heading) : twa;
    let aAwa = Math.abs(boat.awa);
    if (boat.tack === 'starboard' && boat.awa < 0 && aAwa > Math.PI / 2) aAwa = Math.PI; // by the lee
    if (boat.tack === 'port' && boat.awa > 0 && aAwa > Math.PI / 2) aAwa = Math.PI;

    // ---- sheet & boom
    const maxB = R(cls.boomMax || 85);
    const ideal = sheetForBoom(cls, idealBoom(cls, aAwa));
    let sheetT;
    if (c.autoTrim) {
      const tackEase = boat.maneuverT > 0 && tws > 12 && !cls.keel ? 0.12 : 0; // ease through tacks in a breeze
      sheetT = U.clamp(ideal + (c.trimBias || 0) + boat.depower + tackEase, 0, 1);
      boat.sheet += (sheetT - boat.sheet) * U.approach(dt, 0.35);
    } else {
      sheetT = U.clamp(c.sheet === undefined ? 0.5 : c.sheet, 0, 1);
      boat.sheet += (sheetT - boat.sheet) * U.approach(dt, 0.12);
    }
    const sheetLimit = MIN_BOOM + boat.sheet * (maxB - MIN_BOOM);
    const boomMag = Math.min(sheetLimit, aAwa);
    const boomTarget = boat.capsized ? boat.boom : -s * boomMag;
    const maxSwing = 4.5 * dt;
    boat.boom += U.clamp((boomTarget - boat.boom) * U.approach(dt, 0.1), -maxSwing, maxSwing);

    // ---- trim quality
    const idealB = idealBoom(cls, aAwa);
    let luffFrac = 0, overFrac = 0;
    if (boomMag > idealB) luffFrac = U.clamp((boomMag - idealB) / Math.max(aAwa - idealB, R(6)), 0, 1);
    else overFrac = U.clamp((idealB - boomMag) / Math.max(idealB - MIN_BOOM, R(10)), 0, 1);
    let eff = (1 - Math.pow(luffFrac, 1.5)) * (1 - 0.55 * Math.pow(overFrac, 1.3));
    const swinging = Math.sign(boat.boom) !== Math.sign(boomTarget) && Math.abs(boat.boom) > R(8);
    if (swinging) eff *= 0.4;
    boat.trim = U.clamp(eff, 0, 1);
    boat.luffing = !boat.capsized && tws > 1 && (luffFrac > 0.28 || aTwa < cls.noGo * 0.95);
    boat.stalled = !boat.capsized && overFrac > 0.45 && aAwa > R(50);

    // ---- daggerboard: moves smoothly towards the wanted position (autoBoard = the ideal for this angle)
    if (cls.hasBoard) {
      const want = U.clamp(c.autoBoard ? idealBoard(cls, aTwa) : (c.board === undefined || c.board === null ? 1 : +c.board), 0, 1);
      const step = BOARD_RATE * dt;
      boat.board += U.clamp(want - boat.board, -step, step);
    } else boat.board = 1;
    const board = boat.board;

    // ---- jib (forsejl): autoJib (default) = trimmed with the main by the crew, exactly the classic model.
    // Trimmed by hand: telltales streaming = a little faster and higher upwind; eased too far = it flaps; too hard = stalls.
    let jibF = 1, jibGood = 0;
    if (cls.hasJib) {
      const manual = c.autoJib === false;
      boat.jibManual = manual;
      if (manual) boat.jib += (U.clamp(c.jib === undefined ? 0.5 : +c.jib, 0, 1) - boat.jib) * U.approach(dt, 0.12);
      else boat.jib += (ideal - boat.jib) * U.approach(dt, 0.35);
      const jl = MIN_BOOM + boat.jib * (maxB - MIN_BOOM);
      const jibT = boat.capsized ? boat.jibAng : -s * Math.min(jl, aAwa) * 0.72;
      boat.jibAng += U.clamp((jibT - boat.jibAng) * U.approach(dt, 0.1), -maxSwing, maxSwing);
      if (manual && !boat.capsized) {
        const dev = boat.jib - ideal;
        const luffJ = U.clamp((dev - 0.05) / 0.25, 0, 1), overJ = U.clamp((-dev - 0.05) / 0.3, 0, 1);
        jibGood = 1 - U.smoothstep(0.02, 0.08, Math.abs(dev));
        const w = (cls.jibShare || 0.3) * (1 - 0.5 * U.smoothstep(R(90), R(150), aAwa));
        const upness = 1 - U.smoothstep(R(60), R(100), aTwa);
        jibF = 1 - w * Math.pow(luffJ, 1.2) * 0.9 - w * 0.6 * Math.pow(overJ, 1.3) + 0.025 * jibGood * upness;
        jibGood *= upness;
        boat.jibTrim = U.clamp(1 - Math.pow(luffJ, 1.2) * 0.9 - 0.6 * Math.pow(overJ, 1.3), 0, 1);
        boat.jibLuffing = tws > 1 && luffJ > 0.2 && aTwa > cls.noGo;
        boat.jibStalled = overJ > 0.4 && aAwa > R(40);
      } else { boat.jibTrim = 1; boat.jibLuffing = false; boat.jibStalled = false; }
    }

    // ---- spinnaker / gennaker
    const wantSpi = !!c.spinnaker && cls.hasSpinnaker !== 'none' && !boat.capsized;
    boat.spinnaker = wantSpi;
    const collapsed = wantSpi && cls.spiCollapsedAt(aTwa);
    if (collapsed && !boat.spiCollapsed) emit('boat:spiCollapse', { boat });
    boat.spiCollapsed = collapsed;

    // ---- heel
    // Sail power saturates: crews flatten the rig (cunningham, outhaul, vang, depowered main) as the breeze builds.
    const qr = Math.pow(boat.aws / 13.5, 1.6);
    const q = qr <= 1.3 ? qr : 1.3 + 0.45 * (qr - 1.3);
    const lift = (1 - Math.pow(luffFrac, 1.5)) * U.smoothstep(R(8), R(28), aAwa);
    let P = q * lift * Math.cos(Math.min(boomMag, R(89)));
    if (boat.spinnaker && !collapsed) P += q * 0.9 * (cls.spinnakerBoost - 1) * Math.max(0, Math.sin(aAwa));
    if (collapsed) P *= 1.08;
    boat.power = P;
    const rawDeg = cls.heelAt10 * P;
    let hikeT;
    if (c.autoHike) hikeT = cls.hikeRight > 0 ? U.clamp((rawDeg - cls.optHeel) / cls.hikeRight, 0, 1) : 0;
    else hikeT = U.clamp(c.hike || 0, 0, 1);
    if (boat.maneuverT > 0) { // crew crossing the boat in the first half of the manoeuvre, back out in the second half
      const ph = boat.maneuverT / Math.max(0.5, cls.tackTime);
      hikeT *= ph > 0.5 ? 0.3 : 1 - 1.4 * ph;
    }
    if (boat.capsized) hikeT = 0;
    boat.hike += (hikeT - boat.hike) * U.approach(dt, 0.3);
    let netDeg = rawDeg - cls.hikeRight * boat.hike;
    const capDeg = U.deg(cls.capsizeHeel);
    if (cls.keel) netDeg = cls.maxHeel * Math.tanh(netDeg / cls.maxHeel);
    else if (netDeg > 0.6 * capDeg) netDeg *= 1 + 0.35 * (netDeg / capDeg - 0.6); // dinghy stability fades
    let heelT = -s * R(netDeg);
    if (board < 0.3) heelT += R(5) * (0.3 - board) / 0.15 * U.smoothstep(R(130), R(165), aTwa) * Math.sin(boat.t * 2.3); // board right up on a run: she rolls
    if (boat.capsized) heelT = boat.capsizeSide * R(88);
    boat.heel += (heelT - boat.heel) * U.approach(dt, boat.capsized ? 0.6 : cls.keel ? 1.1 : 0.42);

    // auto-trim's safety valve: ease a little when the boat is about to go over
    const danger = cls.canCapsize ? Math.abs(boat.heel) / cls.capsizeHeel : Math.abs(boat.heel) / R(cls.maxHeel || 90);
    if (c.autoTrim) boat.depower = U.clamp(boat.depower + dt * (danger > 0.72 ? 0.9 : -0.35), 0, 0.45);
    else boat.depower = 0;

    if (cls.canCapsize && !boat.capsized) {
      if (assist === 'easy') boat.heel = U.clamp(boat.heel, -cls.capsizeHeel * 0.9, cls.capsizeHeel * 0.9);
      else if (Math.abs(boat.heel) > cls.capsizeHeel) capsize(boat, boat.heel >= 0 ? 1 : -1);
      boat._warnT -= dt;
      if (!boat.capsized && Math.abs(boat.heel) > cls.capsizeHeel * 0.8 && boat._warnT <= 0) {
        boat._warnT = 2;
        emit('boat:heelWarn', { boat, k: Math.abs(boat.heel) / cls.capsizeHeel });
      }
    }

    // ---- target speed
    let tKn = cls.polar(aTwa, tws);
    if (boat.spinnaker) tKn *= cls.spiFactor(aTwa);
    tKn = Math.min(tKn, cls.maxKn * (cls.hasSpinnaker !== 'none' ? 1.05 : 1)); // the kite never lifts a boat beyond its class ceiling
    tKn *= boat.trim;
    if (board < 1) tKn *= boardFactor(board, aTwa);
    if (jibF !== 1) tKn *= jibF;
    const leeHeel = boat.heel * -s; // + when heeling to leeward
    const opt = R(cls.optHeel);
    const excess = leeHeel >= 0 ? Math.max(0, leeHeel - opt) : -leeHeel * 1.6;
    const span = cls.keel ? R(24) : Math.max(R(15), cls.capsizeHeel - opt);
    const heelF = 1 - 0.35 * Math.pow(U.clamp(excess / span, 0, 1), 1.4);
    tKn *= heelF;
    if (boat.maneuverT > 0) tKn *= 0.92;
    if (boat.pace) tKn *= boat.pace; // AI helms of lower skill are a little slower overall (KOS.AI.paceFor); players and default boats: 1
    if (boat.capsized) tKn = 0;
    boat.targetKn = tKn;
    let tMs = U.ms(tKn);
    const ironsZone = cls.noGo * 0.75;
    if (!boat.capsized && aTwa < ironsZone && boat.speed < 0.3) tMs = -0.2 * U.clamp(tws / 10, 0, 1.6) * (1 - aTwa / ironsZone); // sternway
    let tau = tMs > boat.speed ? cls.accelT / (0.6 + 0.4 * U.clamp(tws / 10, 0.3, 2)) : cls.decelT;
    if (aTwa < cls.noGo && tMs <= boat.speed) tau *= cls.keel ? 1.0 : 0.8; // flogging sails brake the boat
    if (boat.planing && tMs < boat.speed) tau *= 0.8;
    if (boat.capsized) tau = 0.8;
    boat.speed += (tMs - boat.speed) * U.approach(dt, tau);
    boat.speed -= boat.speed * Math.abs(c.rudder || 0) * (cls.keel ? 0.1 : 0.15) * dt * U.clamp(Math.abs(boat.speed) / cls.uRef, 0, 1); // rudder drag

    // ---- planing
    if (cls.plane > 0) {
      const k = U.kn(boat.speed);
      if (!boat.planing && k >= cls.plane && !boat.capsized) { boat.planing = true; emit('boat:plane', { boat }); }
      else if (boat.planing && (k < cls.plane - 0.8 || boat.capsized)) boat.planing = false;
    }

    // ---- steering
    const rud = U.clamp(c.rudder || 0, -1, 1);
    const auth = Math.pow(U.clamp(Math.abs(boat.speed) / cls.uRef, 0, 1), 0.75);
    const floor = assist === 'easy' ? 0.3 : assist === 'normal' ? 0.08 : 0;
    const dirS = boat.speed < -0.05 && assist !== 'easy' ? -1 : 1; // easy: no confusing reversed steering
    let yawT = rud * cls.turnRate * Math.max(auth, floor) * dirS;
    if (leeHeel > opt && !boat.capsized) yawT += s * U.clamp((leeHeel - opt) / R(30), 0, 1) * 0.22 * cls.turnRate * auth; // weather helm (needs flow)
    if (!boat.capsized && aTwa < cls.noGo && Math.abs(boat.speed) < cls.uRef && tws > 1) {
      const fall = twa !== 0 ? -Math.sign(twa) : (boat.yawRate >= 0 ? 1 : -1);
      yawT += fall * 0.12 * U.clamp(tws / 10, 0.3, 1.5) * (1 - Math.abs(boat.speed) / cls.uRef); // bow blown off
    }
    if (boat.capsized) yawT = 0;
    boat.yawRate += (yawT - boat.yawRate) * U.approach(dt, cls.keel ? 0.5 : 0.22);
    boat.heading = U.wrapPi(boat.heading + boat.yawRate * dt);

    // ---- leeway & drift
    let leeAng = U.clamp(cls.leeway * (0.4 + 0.6 * Math.min(P, 1.5)) * (1 + 1.5 * Math.max(0, 1 - Math.abs(boat.speed) / cls.uRef)), 0, 0.3);
    if (board < 1) { // less board, less grip: she slides sideways (most when the sail pulls hard, i.e. upwind)
      const grip = Math.pow(0.1 + 0.9 * board, 1.4);
      leeAng = U.clamp(leeAng * (1 + (1 / grip - 1) * U.clamp(1.5 * P, 0.3, 1)), 0, 0.3 + 0.4 * (1 - board));
    }
    if (jibGood > 0) leeAng *= 1 - 0.15 * jibGood; // telltales streaming: points a little higher
    const slipT = -s * Math.abs(boat.speed) * Math.tan(leeAng);
    boat.slip += (slipT - boat.slip) * U.approach(dt, 0.8);
    const dmag = twsMs * (boat.capsized ? 0.035 : 0.022) * (1 - U.clamp(Math.abs(boat.speed) / cls.uRef, 0, 1));
    const dw = U.vec(w.dir + Math.PI);
    const f = U.vec(boat.heading), r = U.vec(boat.heading + Math.PI / 2);
    boat.vx = f.x * boat.speed + r.x * boat.slip + dw.x * dmag;
    boat.vy = f.y * boat.speed + r.y * boat.slip + dw.y * dmag;

    // ---- states
    boat.pos = pointOfSail(aTwa, cls);
    const irons = !boat.capsized && aTwa < cls.noGo && boat.speed < Math.max(0.15, U.ms(cls.polar(cls.noGo + R(6), tws)) * 0.3);
    if (irons && !boat.inIrons) emit('boat:irons', { boat });
    boat.inIrons = irons;
    if (boat.maneuverT > 0) boat.maneuverT = Math.max(0, boat.maneuverT - dt);

    if (boat.capsized) {
      boat.capsizeT += dt;
      const need = (cls.recoverTime || 4) * (assist === 'pro' ? 1.5 : 1);
      if (env.autoRecover !== false && boat.capsizeT >= need) right(boat, w.dir);
    }
  }

  // ------------------------------------------------------------------ RIB / motor boats
  function stepMotor(boat, c, env, dt) {
    const cls = boat.cls, m = cls.motor;
    const w = env.wind && env.wind.at ? env.wind.at(boat.x, boat.y) : { dir: 0, speed: 0 };
    boat.tws = w.speed; boat.windDir = w.dir;
    boat.twa = U.wrapPi(w.dir - boat.heading);
    boat.awa = boat.twa; boat.aws = w.speed;
    boat.tack = boat.twa >= 0 ? 'starboard' : 'port';
    boat.pos = pointOfSail(Math.abs(boat.twa), { noGo: R(42) });
    boat.inIrons = false; boat.luffing = false; boat.stalled = false; boat.trim = 1;

    const thr = U.clamp(c.throttle || 0, -1, 1);
    boat.throttle += (thr - boat.throttle) * U.approach(dt, 0.25);
    const T = boat.throttle;
    const maxF = U.ms(m.maxKn), maxR = U.ms(m.reverseKn);
    let u = boat.speed, v = boat.slip;
    const target = T >= 0 ? T * maxF : T * maxR;
    if ((target > u && u >= -0.1 && T > 0.02) || (target < u && u <= 0.1 && T < -0.02)) {
      // engine pushing: thrust tapers near top speed, with a "hump" before the hull gets on the plane
      const k = U.kn(Math.abs(u));
      const hump = k > 5 && k < m.planeKn ? 0.6 : 1;
      const a = m.accel * hump * (1 - 0.65 * Math.pow(Math.abs(u) / (T >= 0 ? maxF : maxR), 2));
      u += U.clamp(target - u, -a * dt, a * dt);
    } else {
      // coasting / braking against the prop: water drag (strong at high speed)
      const brake = Math.abs(T) > 0.02 ? 2.2 : 1;
      const drag = (0.25 + 0.05 * Math.abs(u)) * brake;
      const du = U.clamp(target - u, -drag * dt * Math.max(1, Math.abs(u)), drag * dt * Math.max(1, Math.abs(u)));
      u += du;
    }
    const k = U.kn(u);
    if (!boat.planing && k >= m.planeKn) { boat.planing = true; emit('boat:plane', { boat }); }
    else if (boat.planing && k < m.planeKn - 1.5) boat.planing = false;

    // steering: outboard thrust vectoring works even at low speed, reversed when going astern
    const rud = U.clamp(c.rudder || 0, -1, 1);
    const authority = Math.min(1.15, U.clamp(Math.abs(u) / cls.uRef, 0, 1) * 0.8 + 0.5 * Math.abs(T));
    const rev = u < -0.2 || (Math.abs(u) <= 0.2 && T < -0.02);
    const rate = cls.turnRate * (boat.planing ? 0.82 : 1);
    const yawT = rud * rate * authority * (rev ? -1 : 1);
    boat.yawRate += (yawT - boat.yawRate) * U.approach(dt, 0.28);
    // skid: keep the old velocity vector while the hull rotates, then grip pulls it in line
    const dh = boat.yawRate * dt;
    const cu = Math.cos(dh), su = Math.sin(dh);
    const nu = u * cu + v * su;
    const nv = -u * su + v * cu;
    u = nu; v = nv;
    const grip = boat.planing ? 1.8 : 4.5;
    v *= Math.exp(-grip * dt);
    u -= Math.sign(u) * Math.abs(v) * 0.25 * dt;
    boat.heading = U.wrapPi(boat.heading + dh);
    boat.speed = u; boat.slip = v;
    boat.skid = Math.abs(v);
    const heelT = U.clamp(boat.yawRate * u * 0.09, -R(14), R(14));
    boat.heel += (heelT - boat.heel) * U.approach(dt, 0.3);
    const kk = Math.abs(k);
    boat.wakeSize = U.clamp((Math.exp(-Math.pow((kk - 9) / 4, 2)) + (boat.planing ? 0.3 : 0)) * Math.min(1, kk / 3), 0, 1);
    boat.targetKn = U.kn(target);

    const dw = U.vec(w.dir + Math.PI);
    const dm = U.ms(w.speed) * 0.02 * (1 - U.clamp(Math.abs(u) / 2, 0, 1));
    const f = U.vec(boat.heading), r = U.vec(boat.heading + Math.PI / 2);
    boat.vx = f.x * u + r.x * v + dw.x * dm;
    boat.vy = f.y * u + r.y * v + dw.y * dm;
  }

  // ------------------------------------------------------------------ world contact
  function worldHit(venue, x, y, r, draft) {
    const W = KOS.World;
    if (!venue || !W) return null;
    let h = null;
    if (typeof W.hit === 'function') {
      try { h = W.hit(venue, x, y, r, draft); } catch (e) { h = null; }
      if (h && h.type === 'shallow' && h.depth !== undefined && h.depth >= draft) h = null;
      if (h && !h.type) h.type = 'shore';
    }
    if (!h && typeof W.depthAt === 'function') {
      let d;
      try { d = W.depthAt(venue, x, y); } catch (e) { d = undefined; }
      if (typeof d === 'number' && d < draft) {
        // estimate the normal from the depth gradient (towards deeper water)
        const e = 3;
        const g = (xx, yy) => { const v = W.depthAt(venue, xx, yy); return typeof v === 'number' ? v : d; };
        let nx = g(x + e, y) - g(x - e, y), ny = g(x, y + e) - g(x, y - e);
        const l = Math.hypot(nx, ny);
        if (l > 1e-6) { nx /= l; ny /= l; } else { nx = 0; ny = 0; }
        h = { type: d <= 0 ? 'shore' : 'shallow', nx, ny, depth: d };
      }
    }
    return h;
  }

  function handleGround(boat, env, px0, py0) {
    const cls = boat.cls;
    const b = bow(boat);
    const h = worldHit(env.venue, b.x, b.y, cls.beam * 0.35, cls.draft) || worldHit(env.venue, boat.x, boat.y, cls.beam * 0.5, cls.draft);
    boat._groundCd = Math.max(0, boat._groundCd - (env._dt || KOS.DT));
    if (!h) { if (boat.groundT > 0) boat.groundT -= env._dt || KOS.DT; boat.grounded = boat.groundT > 0; return; }
    let nx = h.nx, ny = h.ny;
    if (!(Math.abs(nx) + Math.abs(ny) > 1e-6)) { const f = U.vec(boat.heading); nx = -f.x; ny = -f.y; }
    const vn = boat.vx * nx + boat.vy * ny;
    const impact = Math.max(0, -vn);
    const push = 0.08 + (h.type !== 'shallow' && h.pen > 0 ? Math.min(h.pen, 1.5) * 0.5 : 0);
    boat.x = px0 + nx * push; boat.y = py0 + ny * push;
    if (vn < 0) { boat.vx -= vn * nx * 1.25; boat.vy -= vn * ny * 1.25; }
    const keep = h.type === 'shallow' ? 0.5 : 0.25;
    boat.vx *= keep; boat.vy *= keep;
    syncLocal(boat);
    boat.grounded = true;
    boat.groundT = 0.6;
    if (boat._groundCd <= 0 && (impact > 0.05 || Math.abs(boat.speed) > 0.3)) {
      boat._groundCd = 0.8;
      emit('boat:ground', { boat, type: h.type, speed: impact, x: boat.x, y: boat.y, depth: h.depth });
    }
  }

  function updateWake(boat, dt) {
    boat._wakeT += dt;
    const sp = Math.abs(boat.speed);
    if (boat._wakeT >= 0.1) {
      boat._wakeT = 0;
      if (sp > 0.3 && !boat.capsized) {
        const st = stern(boat);
        boat.wake.push({ x: st.x, y: st.y, t: boat.t, s: sp, h: boat.heading, w: boat.cls.beam * (0.5 + Math.min(1.5, sp / 4)) });
      }
    }
    while (boat.wake.length && (boat.t - boat.wake[0].t > 5 || boat.wake.length > 60)) boat.wake.shift();
  }

  function step(boat, c, env, dt) {
    dt = dt || KOS.DT;
    env = env || {};
    c = c || controls();
    boat.t += dt;
    boat.rudder = U.clamp(c.rudder || 0, -1, 1);
    const px0 = boat.x, py0 = boat.y;
    if (boat.cls.isMotor) stepMotor(boat, c, env, dt);
    else stepSail(boat, c, env, dt);
    boat.x += boat.vx * dt;
    boat.y += boat.vy * dt;
    boat.distanceSailed += Math.hypot(boat.x - px0, boat.y - py0);
    if (env.venue) { env._dt = dt; handleGround(boat, env, px0, py0); }
    updateWake(boat, dt);
    return boat;
  }

  // ------------------------------------------------------------------ collisions
  function capsule(boat) {
    const r = boat.cls.beam * 0.45;
    const h = Math.max(0, boat.cls.length / 2 - r);
    const f = U.vec(boat.heading, h);
    return { ax: boat.x + f.x, ay: boat.y + f.y, bx: boat.x - f.x, by: boat.y - f.y, r };
  }

  const pairCd = {};
  function collide(boats, venue, marks) {
    const out = [];
    const n = boats.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = boats[i], b = boats[j];
        const ca = capsule(a), cb = capsule(b);
        const reach = a.cls.length / 2 + b.cls.length / 2 + 1;
        if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) continue;
        const res = U.segSeg(ca.ax, ca.ay, ca.bx, ca.by, cb.ax, cb.ay, cb.bx, cb.by);
        const minD = ca.r + cb.r;
        if (res.d >= minD) continue;
        let nx = res.ax - res.bx, ny = res.ay - res.by;
        let d = res.d;
        if (d < 1e-6) { nx = a.x - b.x; ny = a.y - b.y; d = Math.hypot(nx, ny) || 1; if (d === 1 && nx === 0 && ny === 0) nx = 1; }
        nx /= d; ny /= d;
        const ima = 1 / a.cls.mass, imb = 1 / b.cls.mass;
        const overlap = minD - res.d;
        a.x += nx * overlap * ima / (ima + imb); a.y += ny * overlap * ima / (ima + imb);
        b.x -= nx * overlap * imb / (ima + imb); b.y -= ny * overlap * imb / (ima + imb);
        const vr = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        let impact = 0;
        if (vr < 0) {
          impact = -vr;
          const jimp = -(1 + 0.2) * vr / (ima + imb);
          a.vx += jimp * ima * nx; a.vy += jimp * ima * ny;
          b.vx -= jimp * imb * nx; b.vy -= jimp * imb * ny;
          syncLocal(a); syncLocal(b);
        }
        const ev = { type: 'boat', a, b, speed: impact, x: (res.ax + res.bx) / 2, y: (res.ay + res.by) / 2 };
        out.push(ev);
        const key = a.id + '|' + b.id;
        const t = Math.max(a.t, b.t);
        if (!(pairCd[key] > t)) { pairCd[key] = t + 0.6; emit('boat:collide', ev); }
      }
    }
    // marks & buoys
    const buoys = [];
    if (venue && venue.buoys) for (const m of venue.buoys) buoys.push({ m, r: m.r || 0.8 });
    if (marks) for (const m of marks) buoys.push({ m, r: m.r || 1.2 });
    for (const boat of boats) {
      if (buoys.length) {
        const c = capsule(boat);
        for (const bo of buoys) {
          const near = U.segNearest(bo.m.x, bo.m.y, c.ax, c.ay, c.bx, c.by);
          const minD = c.r + bo.r;
          if (near.d >= minD) continue;
          let nx = near.x - bo.m.x, ny = near.y - bo.m.y;
          const d = Math.hypot(nx, ny) || 1;
          nx /= d; ny /= d;
          boat.x += nx * (minD - near.d); boat.y += ny * (minD - near.d);
          const vn = boat.vx * nx + boat.vy * ny;
          if (vn < 0) { boat.vx -= vn * nx * 1.3; boat.vy -= vn * ny * 1.3; boat.vx *= 0.85; boat.vy *= 0.85; syncLocal(boat); }
          const ev = { type: 'mark', a: boat, b: bo.m, speed: Math.max(0, -vn), x: bo.m.x, y: bo.m.y };
          out.push(ev);
          const key = boat.id + '|m|' + (bo.m.id || bo.m.x + ',' + bo.m.y);
          if (!(pairCd[key] > boat.t)) { pairCd[key] = boat.t + 1.5; emit('boat:collide', ev); }
        }
      }
      // piers / shore along the hull (the bow is handled in step())
      if (venue && KOS.World) {
        const st = stern(boat);
        const h = worldHit(venue, st.x, st.y, boat.cls.beam * 0.4, boat.cls.draft);
        if (h && h.type !== 'shallow') {
          let nx = h.nx || 0, ny = h.ny || 0;
          if (Math.abs(nx) + Math.abs(ny) < 1e-6) { const f = U.vec(boat.heading); nx = f.x; ny = f.y; }
          boat.x += nx * 0.15; boat.y += ny * 0.15;
          const vn = boat.vx * nx + boat.vy * ny;
          if (vn < 0) { boat.vx -= vn * nx * 1.2; boat.vy -= vn * ny * 1.2; syncLocal(boat); }
          out.push({ type: h.type === 'pier' ? 'pier' : 'shore', a: boat, b: null, speed: Math.max(0, -vn), x: st.x, y: st.y });
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ helpers
  function vmg(boat, target) {
    const dir = typeof target === 'number' ? target : U.bearing(boat, target);
    const f = U.vec(dir);
    return boat.vx * f.x + boat.vy * f.y;
  }

  function optimal(cls, tws, dir, spi) {
    if (typeof cls === 'string') cls = KOS.Boats.get(cls);
    if (cls && cls.cls) cls = cls.cls;
    return KOS.Boats.optimal(cls, tws, dir, spi);
  }

  /** Laylines to a mark. windDir in radians (FROM). Returns headings for each tack and line segments for drawing. */
  function laylines(mark, windDir, cls, tws, opts) {
    opts = opts || {};
    if (cls && cls.cls) cls = cls.cls;
    if (typeof cls === 'string') cls = KOS.Boats.get(cls);
    if (windDir && typeof windDir === 'object') windDir = windDir.dir;
    const down = !!opts.down;
    const L = opts.length || 400;
    const o = optimal(cls, tws || 10, down ? 'down' : 'up', !!opts.spi);
    const twa = o.twa;
    // starboard tack: wind on the starboard side -> heading = windDir - twa ; port: windDir + twa
    const stbd = U.wrapPi(windDir - twa), port = U.wrapPi(windDir + twa);
    const back = h => { const v = U.vec(h + Math.PI, L); return { x: mark.x + v.x, y: mark.y + v.y }; };
    return {
      twa, speedKn: o.speed, vmgKn: o.vmg,
      headings: { starboard: stbd, port },
      starboard: { a: { x: mark.x, y: mark.y }, b: back(stbd) },
      port: { a: { x: mark.x, y: mark.y }, b: back(port) },
    };
  }

  function neededHike(boat) {
    const cls = boat.cls;
    if (!cls.hikeRight) return 0;
    return U.clamp((cls.heelAt10 * boat.power - cls.optHeel) / cls.hikeRight, 0, 1);
  }

  /** Towing line from a's stern to b's bow (RIB towing dinghies). Returns rope tension 0..1. */
  function tow(a, b, len, dt) {
    dt = dt || KOS.DT;
    const A = stern(a), B = bow(b);
    const dx = A.x - B.x, dy = A.y - B.y;
    const d = Math.hypot(dx, dy);
    if (d <= len || d < 1e-6) return 0;
    const nx = dx / d, ny = dy / d;
    const ex = d - len;
    const wa = b.cls.mass / (a.cls.mass + b.cls.mass);
    b.x += nx * ex * (1 - wa * 0.5); b.y += ny * ex * (1 - wa * 0.5);
    a.x -= nx * ex * wa * 0.5; a.y -= ny * ex * wa * 0.5;
    const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vrel < 0) {
      b.vx -= vrel * nx * (1 - wa * 0.5); b.vy -= vrel * ny * (1 - wa * 0.5);
      a.vx += vrel * nx * wa * 0.5; a.vy += vrel * ny * wa * 0.5;
    }
    const want = U.heading(nx, ny);
    b.heading = U.angLerp(b.heading, want, U.approach(dt, 0.6));
    syncLocal(a); syncLocal(b);
    return U.clamp(ex / 2, 0, 1);
  }

  KOS.Physics = {
    controls, createBoat, step, collide,
    idealSheet, idealBoom, sheetForBoom, vmg, laylines, optimal, neededHike, pointOfSail,
    right, capsize, tow, velocityAt, bow, stern, capsule, syncLocal,
    idealBoard, boardFactor, idealJib,
  };
})(typeof window !== 'undefined' ? window : globalThis);
