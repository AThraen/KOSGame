// Node tests for the simulation core: node tools/test-core.js
// Covers KOS.U, KOS.Events, KOS.Boats, KOS.Wind, KOS.Physics, KOS.Rules, KOS.AI (and KOS.World helpers if present),
// plus the mobile controls maths in js/ui/input.js (tests named 'mobile:'), the tilted-camera math in js/render/tilt.js (tests named 'tilt:', run alone with: node tools/test-core.js tilt).
const KOS = require('./harness').load(['js/render/tilt.js', 'js/ui/input.js']);
const U = KOS.U, P = KOS.Physics;
const R = d => d * Math.PI / 180;

let pass = 0, fail = 0;
const failures = [];
const only = process.argv[2];
function test(name, fn) {
  if (only && !name.includes(only)) return;
  try { fn(); pass++; process.stdout.write('.'); }
  catch (e) { fail++; failures.push(name + '\n    ' + (e && e.message || e)); process.stdout.write('F'); }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg) { if (!(Math.abs(a - b) <= eps)) throw new Error((msg || 'near') + `: ${a} vs ${b} (±${eps})`); }
function between(v, lo, hi, msg) { if (!(v >= lo && v <= hi)) throw new Error((msg || 'between') + `: ${v} not in [${lo}, ${hi}]`); }

function listen(name) {
  const got = [];
  const fn = p => got.push(p);
  KOS.Events.on(name, fn);
  got.stop = () => KOS.Events.off(name, fn);
  return got;
}

/** Hold a boat on a fixed true wind angle (heading pinned) and return the settled boat. */
function settle(cls, twaDeg, tws, opts) {
  opts = opts || {};
  const wind = KOS.Wind.steady(0, tws);
  const b = P.createBoat(cls, { heading: R(-twaDeg) }); // wind from north; heading -twa => starboard tack
  const c = Object.assign(P.controls(), { autoHike: true }, opts.controls || {});
  const secs = opts.secs || 40;
  for (let i = 0; i < secs * 60; i++) {
    b.heading = R(-twaDeg); b.yawRate = 0;
    P.step(b, c, { wind, assist: opts.assist || 'normal' }, KOS.DT);
  }
  return b;
}
function sim(b, ctrlFn, wind, secs, env) {
  env = Object.assign({ wind, assist: 'normal' }, env || {});
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    const c = typeof ctrlFn === 'function' ? ctrlFn(b, i * KOS.DT) : ctrlFn;
    P.step(b, c, env, KOS.DT);
    if (wind && wind.update) wind.update(KOS.DT);
  }
  return b;
}
const kn = U.kn;

// ====================================================================== KOS.U
test('U.wrapPi / angDiff / rad / deg', () => {
  near(U.wrapPi(3 * Math.PI), Math.PI, 1e-9);
  near(U.wrapPi(-Math.PI), Math.PI, 1e-9, 'range (-pi, pi]');
  near(U.angDiff(R(350), R(10)), R(20), 1e-9, 'shortest turn right');
  near(U.angDiff(R(10), R(350)), R(-20), 1e-9, 'shortest turn left');
  near(U.deg(U.rad(123)), 123, 1e-9);
});
test('U.vec / heading are inverse; north = up (y negative)', () => {
  const v = U.vec(0); near(v.x, 0, 1e-9); near(v.y, -1, 1e-9);
  const e = U.vec(Math.PI / 2); near(e.x, 1, 1e-9); near(e.y, 0, 1e-9);
  for (const h of [-2, -0.5, 0.3, 1.7, 3]) { const w = U.vec(h); near(U.heading(w.x, w.y), h, 1e-9); }
});
test('U.rng is deterministic, in [0,1), different per seed', () => {
  const a = U.rng(42), b = U.rng(42), c = U.rng(43);
  let same = true, diff = false;
  for (let i = 0; i < 100; i++) { const x = a(), y = b(), z = c(); if (x !== y) same = false; if (x !== z) diff = true; ok(x >= 0 && x < 1); }
  ok(same && diff);
  ok(U.rng('abc')() === U.rng('abc')(), 'string seeds');
});
test('U.windVal / windTxt / setWindUnit (m/s default, knots option)', () => {
  U.setWindUnit('ms');
  ok(U.windUnit() === 'ms', 'default unit is ms');
  ok(U.windUnitLabel() === 'm/s', 'label is m/s');
  near(U.windVal(10), Math.round(10 * 0.514444), 1e-9, 'windVal(10) = 5 m/s');
  ok(U.windVal(0) === 0, 'windVal(0) is 0');
  ok(U.windTxt(10).includes('m/s'), 'windTxt(10) contains m/s');
  U.setWindUnit('kn');
  ok(U.windUnit() === 'kn', 'unit is kn');
  ok(U.windUnitLabel() === 'kn', 'label is kn');
  near(U.windVal(10), 10, 1e-9, 'windVal(10) = 10 kn');
  ok(U.windTxt(10).includes('kn'), 'windTxt(10) contains kn');
  U.setWindUnit('bogus');
  ok(U.windUnit() === 'ms', 'bogus falls back to ms');
  U.setWindUnit('ms'); // reset so other tests are unaffected
});
test('U.noise1 smooth in [-1,1], deterministic', () => {
  let prev = U.noise1(5, 0);
  for (let t = 0; t < 50; t += 0.05) {
    const v = U.noise1(5, t);
    between(v, -1, 1); ok(Math.abs(v - prev) < 0.2, 'smooth'); prev = v;
    ok(v === U.noise1(5, t));
  }
});
test('U polygons: pointInPoly, polyNearest, segDistance, segSeg, segCross', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  ok(U.pointInPoly(5, 5, sq) && !U.pointInPoly(15, 5, sq));
  const n = U.polyNearest(5, -3, sq); near(n.d, 3, 1e-9); near(n.x, 5, 1e-9); near(n.y, 0, 1e-9);
  near(U.segDistance(5, 5, 0, 0, 10, 0), 5, 1e-9);
  near(U.segSeg(0, 0, 10, 0, 5, 3, 5, 10).d, 3, 1e-9);
  ok(U.segCross(0, -1, 0, 1, -5, 0, 5, 0) && !U.segCross(0, 1, 0, 2, -5, 0, 5, 0));
  near(U.kn(U.ms(7)), 7, 1e-9);
  near(KOS.DT, 1 / 60, 1e-12);
});
test('KOS.Events on/off/emit/once', () => {
  let n = 0; const f = () => n++;
  KOS.Events.on('t:x', f); KOS.Events.emit('t:x'); KOS.Events.off('t:x', f); KOS.Events.emit('t:x');
  KOS.Events.once('t:y', f); KOS.Events.emit('t:y'); KOS.Events.emit('t:y');
  ok(n === 2);
});

// ====================================================================== KOS.Boats
test('Boats: ladder order and complete definitions', () => {
  ok(KOS.Boats.list.map(b => b.id).join(' ') === 'opti tera feva zest ilca 29er hboat j70 rib');
  for (const b of KOS.Boats.list) {
    for (const k of ['id', 'name', 'crew', 'length', 'beam', 'mass', 'sailArea', 'maxKn', 'polar', 'noGo', 'tackTime', 'turnRate',
      'hasSpinnaker', 'spinnakerBoost', 'canCapsize', 'capsizeHeel', 'keel', 'plane', 'colors', 'desc', 'ageHint']) {
      ok(b[k] !== undefined, b.id + ' missing ' + k);
    }
    ok(b.desc.da && b.desc.en && b.ageHint.da && b.colors.hull, b.id + ' texts/colors');
    ok(typeof b.polar(R(90), 10) === 'number');
  }
  ok(KOS.Boats.get('rib').motor && KOS.Boats.get('rib').motor.maxKn > 20);
  ok(!KOS.Boats.get('hboat').canCapsize && !KOS.Boats.get('j70').canCapsize && !KOS.Boats.get('rib').canCapsize);
  ok(KOS.Boats.get('hboat').keel && KOS.Boats.get('j70').keel);
  ok(KOS.Boats.get('feva').hasSpinnaker === 'asym' && KOS.Boats.get('29er').hasSpinnaker === 'asym' && KOS.Boats.get('hboat').hasSpinnaker === 'sym');
  ok(KOS.Boats.get('nope').id === 'opti', 'fallback');
});
test('Boats: polar shape (no-go ~0, reach fastest without kite, more wind = faster)', () => {
  for (const b of KOS.Boats.list) {
    if (b.motor) continue;
    ok(b.polar(R(10), 10) === 0, b.id + ' dead upwind = 0');
    ok(b.polar(b.noGo + R(6), 10) < b.polar(R(90), 10), b.id + ' close-hauled < beam reach');
    ok(b.polar(R(180), 10) < b.polar(R(120), 10), b.id + ' run < broad');
    ok(b.polar(R(90), 4) < b.polar(R(90), 10) && b.polar(R(90), 10) <= b.polar(R(90), 16), b.id + ' wind scaling');
    ok(b.polar(R(135), 40) <= b.maxKn + 1e-9, b.id + ' maxKn cap');
  }
  near(KOS.Boats.get('opti').polar(R(51), 10), 3.5, 0.25, 'opti upwind ~3.5 kn');
  near(KOS.Boats.get('opti').polar(R(90), 10), 4.5, 0.2, 'opti reach ~4.5 kn');
});

// ====================================================================== speeds per point of sail (simulated)
const POINTS = { closehauled: null, closereach: 65, beamreach: 90, broadreach: 135, run: 178 };
test('Physics: settled speeds per point of sail per class (10 kn)', () => {
  for (const cls of KOS.Boats.list) {
    if (cls.motor) continue;
    const up = KOS.Boats.optimal(cls, 10, 'up');
    const speeds = {};
    for (const k in POINTS) {
      const twa = POINTS[k] === null ? U.deg(up.twa) : POINTS[k];
      const b = settle(cls.id, twa, 10);
      speeds[k] = kn(b.speed);
      ok(!b.capsized, cls.id + ' capsized at ' + k);
      ok(b.pos === k || (k === 'closehauled' && b.pos === 'closehauled'), cls.id + ' pos ' + b.pos + ' for ' + k);
      const pol = cls.polar(R(twa), 10);
      between(speeds[k], pol * 0.75, pol * 1.06, cls.id + ' ' + k + ' vs polar');
    }
    ok(speeds.closehauled < speeds.beamreach, cls.id + ' upwind slower than reach');
    ok(speeds.run < speeds.beamreach, cls.id + ' run slower than reach');
  }
});
test('Physics: class characters (opti slow, 29er/j70 plane with kite, hboat steady)', () => {
  const optiUp = settle('opti', 50, 10), optiReach = settle('opti', 90, 10);
  between(kn(optiUp.speed), 3.0, 3.9, 'opti upwind'); between(kn(optiReach.speed), 4.1, 4.9, 'opti reach');
  const e = listen('boat:plane');
  const skiff = settle('29er', 135, 12, { controls: { spinnaker: true } });
  e.stop();
  ok(kn(skiff.speed) >= 12 && skiff.planing, '29er planes with gennaker ' + kn(skiff.speed).toFixed(1));
  ok(e.some(p => p.boat === skiff), 'plane event');
  const j = settle('j70', 135, 15, { controls: { spinnaker: true } });
  ok(j.planing && kn(j.speed) > 10, 'j70 planes downwind ' + kn(j.speed).toFixed(1));
  const jNo = settle('j70', 135, 15);
  ok(jNo.speed < j.speed * 0.85, 'gennaker is a big boost');
  const h = settle('hboat', 50, 16);
  ok(!h.capsized && Math.abs(h.heel) < R(40), 'hboat heels but stays up');
  ok(settle('ilca', 50, 10).speed > optiUp.speed && settle('29er', 50, 10).speed > settle('ilca', 50, 10).speed, 'ladder gets faster');
});

// ====================================================================== irons, steering, momentum
test('Physics: in irons — stops, drifts back, emits boat:irons, rudder reverses in sternway', () => {
  const wind = KOS.Wind.steady(0, 10);
  const b = P.createBoat('opti', { heading: R(2), speed: U.ms(3) });
  const ev = listen('boat:irons');
  let minSpeed = 9;
  sim(b, () => Object.assign(P.controls(), { rudder: 0 }), wind, 1, { assist: 'pro' });
  for (let i = 0; i < 60 * 12; i++) { b.heading = R(2); b.yawRate = 0; P.step(b, P.controls(), { wind, assist: 'pro' }, KOS.DT); minSpeed = Math.min(minSpeed, b.speed); }
  ev.stop();
  ok(b.inIrons, 'inIrons'); ok(b.pos === 'irons'); ok(b.luffing, 'sails luff in irons');
  ok(ev.length >= 1, 'irons event');
  ok(minSpeed < -0.05, 'sternway ' + minSpeed);
  // with sternway, rudder right swings the bow LEFT
  const h0 = b.heading;
  for (let i = 0; i < 30; i++) P.step(b, Object.assign(P.controls(), { rudder: 1 }), { wind, assist: 'pro' }, KOS.DT);
  ok(U.angDiff(h0, b.heading) < 0, 'reversed steering going backwards');
});
test('Physics: getting out of irons (reverse the tiller in sternway; easy assist just steer)', () => {
  const wind = KOS.Wind.steady(0, 10);
  for (const assist of ['normal', 'pro']) {
    const b = P.createBoat('opti', { heading: R(5) });
    sim(b, bb => Object.assign(P.controls(), { rudder: bb.speed < -0.05 ? -1 : 1 }), wind, 12, { assist });
    sim(b, bb => Object.assign(P.controls(), { rudder: U.clamp(U.angDiff(bb.heading, R(60)) * 2, -1, 1) }), wind, 8, { assist });
    ok(Math.abs(U.wrapPi(0 - b.heading)) > b.cls.noGo && !b.inIrons, assist + ' out of the no-go zone');
    ok(b.speed > 0.8, assist + ' sailing again ' + b.speed.toFixed(2));
  }
  const e = P.createBoat('opti', { heading: R(5) });
  sim(e, Object.assign(P.controls(), { rudder: 1 }), wind, 6, { assist: 'easy' });
  ok(Math.abs(U.wrapPi(0 - e.heading)) > e.cls.noGo, 'easy: holding right steers out');
  const free = P.createBoat('opti', { heading: R(60), speed: 1.5 });
  sim(free, P.controls(), wind, 30, { assist: 'normal' });
  ok(Math.abs(U.wrapPi(0 - free.heading)) < R(60), 'let go of the tiller => rounds up towards the wind (safety)');
});
test('Physics: rudder authority scales with speed', () => {
  const wind = KOS.Wind.steady(0, 0.01);
  const slow = P.createBoat('ilca', { heading: R(90), speed: 0 });
  const fast = P.createBoat('ilca', { heading: R(90), speed: U.ms(5) });
  const c = Object.assign(P.controls(), { rudder: 1 });
  sim(slow, c, wind, 1, { assist: 'pro' }); sim(fast, c, wind, 1, { assist: 'pro' });
  ok(Math.abs(slow.heading - R(90)) < R(2), 'no steerage without speed (pro)');
  ok(U.angDiff(R(90), fast.heading) > R(25), 'turns right at speed');
  const easy = P.createBoat('ilca', { heading: R(90), speed: 0 });
  sim(easy, c, wind, 1, { assist: 'easy' });
  ok(U.angDiff(R(90), easy.heading) > R(5), 'easy assist keeps some steerage');
});
test('Physics: momentum — heavy keelboat coasts much further than an Opti', () => {
  const coast = id => {
    const wind = KOS.Wind.steady(0, 10);
    const b = settle(id, 90, 10, { secs: 30 });
    wind.setBase(0, 0);
    const x0 = b.x, y0 = b.y;
    for (let i = 0; i < 60 * 30; i++) P.step(b, P.controls(), { wind, assist: 'normal' }, KOS.DT);
    return Math.hypot(b.x - x0, b.y - y0) / Math.max(0.1, U.ms(b.cls.polar(R(90), 10)));
  };
  ok(coast('hboat') > 2 * coast('opti'), 'hboat keeps way');
});

// ====================================================================== tacking & gybing
function tackRun(id) {
  const wind = KOS.Wind.steady(0, 10);
  const up = KOS.Boats.optimal(id, 10, 'up').twa;
  const b = settle(id, U.deg(up), 10, { secs: 40 });
  const v0 = b.speed;
  const ev = listen('boat:tack');
  let t = 0, vmin = v0, settledT = null;
  const target = U.wrapPi(0 + up); // port tack close-hauled
  while (t < 30) {
    const e = U.angDiff(b.heading, target);
    const c = Object.assign(P.controls(), { rudder: U.clamp(e * 3 - b.yawRate, -1, 1), autoHike: true });
    P.step(b, c, { wind, assist: 'normal' }, KOS.DT);
    t += KOS.DT;
    vmin = Math.min(vmin, b.speed);
    if (settledT === null && b.tack === 'port' && Math.abs(U.angDiff(b.heading, target)) < R(4)) settledT = t;
  }
  ev.stop();
  return { b, v0, vmin, settledT, ev };
}
test('Physics: tacking takes time, loses speed, counts and emits boat:tack (all sail classes)', () => {
  const keep = {};
  for (const cls of KOS.Boats.list) {
    if (cls.motor) continue;
    const r = tackRun(cls.id);
    ok(r.b.tacks === 1 && r.ev.length === 1 && r.ev[0].from === 'starboard' && r.ev[0].to === 'port', cls.id + ' tack counted');
    ok(r.settledT > 1.2, cls.id + ' tack takes time ' + r.settledT);
    ok(r.vmin < r.v0 * 0.9, cls.id + ' loses speed ' + (r.vmin / r.v0).toFixed(2));
    ok(r.b.speed > r.v0 * 0.7, cls.id + ' accelerates again');
    keep[cls.id] = r.vmin / r.v0;
  }
  ok(keep.hboat > keep.opti, 'heavy boat carries more speed through the tack');
});
test('Physics: R13 flag during tack until close-hauled', () => {
  const wind = KOS.Wind.steady(0, 10);
  const b = settle('opti', 50, 10, { secs: 20 });
  let sawR13 = false;
  for (let i = 0; i < 60 * 6; i++) {
    P.step(b, Object.assign(P.controls(), { rudder: U.clamp(U.angDiff(b.heading, R(50)) * 3, -1, 1) }), { wind }, KOS.DT);
    if (b.r13) sawR13 = true;
  }
  ok(sawR13 && !b.r13);
});
test('Physics: gybing counts, emits boat:gybe with power, boom crosses', () => {
  const wind = KOS.Wind.steady(0, 12);
  const b = settle('ilca', 160, 12, { secs: 15 });
  const boom0 = b.boom;
  const ev = listen('boat:gybe');
  const target = U.wrapPi(Math.PI - R(20)); // twa -160 => port tack
  for (let i = 0; i < 60 * 8; i++) {
    P.step(b, Object.assign(P.controls(), { rudder: U.clamp(U.angDiff(b.heading, target) * 3, -1, 1), autoHike: true }), { wind, assist: 'easy' }, KOS.DT);
  }
  ev.stop();
  ok(b.gybes === 1 && ev.length === 1 && ev[0].power > 0, 'gybe event');
  ok(Math.sign(b.boom) !== Math.sign(boom0) && Math.abs(b.boom) > R(40), 'boom swung across');
  ok(b.tack === 'port' && b.tacks === 0);
});

// ====================================================================== trim
test('Physics: trim — luffing when eased, stall when over-sheeted, autoTrim best', () => {
  const auto = settle('zest', 90, 10);
  const eased = settle('zest', 90, 10, { controls: { autoTrim: false, sheet: 1 } });
  const hard = settle('zest', 120, 10, { controls: { autoTrim: false, sheet: 0 } });
  const auto120 = settle('zest', 120, 10);
  ok(eased.luffing && !auto.luffing, 'luffs when eased');
  ok(eased.speed < auto.speed * 0.6, 'eased is slow');
  ok(hard.stalled && !auto120.stalled, 'stalls when over-sheeted');
  ok(hard.speed < auto120.speed * 0.8, 'over-sheeted is slow');
  between(auto.trim, 0.95, 1.0001, 'auto trim quality');
  near(auto.sheet, P.idealSheet(auto), 0.05, 'autoTrim sets ideal sheet');
  ok(Math.abs(auto.boom) > R(25) && auto.boom > 0 === false, 'starboard tack boom out to port (negative)');
  ok(P.idealSheet({ cls: auto.cls, awa: R(30) }) < P.idealSheet({ cls: auto.cls, awa: R(150) }), 'ease as you bear away');
});
test('Physics: apparent wind moves forward when sailing', () => {
  const b = settle('29er', 90, 10);
  ok(Math.abs(b.awa) < Math.abs(b.twa) - R(15) && b.aws > b.tws, 'awa forward, aws up');
});
test('Physics: hiking flattens the boat and matters most for ILCA/29er', () => {
  const gain = id => {
    const no = settle(id, 50, 12, { controls: { autoHike: false, hike: 0 } });
    const yes = settle(id, 50, 12, { controls: { autoHike: false, hike: 1 } });
    ok(Math.abs(yes.heel) < Math.abs(no.heel), id + ' flatter when hiking');
    return yes.speed / Math.max(0.01, no.speed);
  };
  const gIlca = gain('ilca'), g29 = gain('29er'), gOpti = gain('opti'), gH = gain('hboat');
  ok(gIlca > gOpti && g29 > gOpti, 'hiking pays more on ilca/29er');
  ok(gH < 1.08, 'keelboat barely cares');
  ok(gIlca > 1.1, 'ilca hiking gain ' + gIlca.toFixed(2));
});
test('Physics: heel sign — starboard tack heels to port (negative)', () => {
  const b = settle('ilca', 50, 12, { controls: { autoHike: false, hike: 0 } });
  ok(b.tack === 'starboard' && b.heel < -R(10));
});

// ====================================================================== capsize
function blast(id, assist, secs, extra) {
  const wind = KOS.Wind.steady(0, 30);
  const b = P.createBoat(id, { heading: R(-60), speed: U.ms(3) });
  const c = Object.assign(P.controls(), { autoTrim: false, sheet: 0, hike: 0 }, extra || {});
  const env = { wind, assist };
  if (extra && extra.autoRecover !== undefined) env.autoRecover = extra.autoRecover;
  let ever = false;
  for (let i = 0; i < (secs || 10) * 60; i++) { b.heading = R(-60); b.yawRate = 0; P.step(b, c, env, KOS.DT); if (b.capsized) ever = true; }
  b.ever = ever;
  return b;
}
test('Physics: capsize in normal/pro for dinghies, never in easy, never keelboats or RIB', () => {
  const ev = listen('boat:capsize');
  for (const id of ['opti', 'tera', 'feva', 'zest', 'ilca', '29er']) {
    ok(blast(id, 'normal').ever, id + ' capsizes (normal)');
    ok(blast(id, 'pro').ever, id + ' capsizes (pro)');
    const e = blast(id, 'easy');
    ok(!e.ever && Math.abs(e.heel) < e.cls.capsizeHeel, id + ' safe in easy');
  }
  for (const id of ['hboat', 'j70', 'rib']) ok(!blast(id, 'pro').ever, id + ' never capsizes');
  ev.stop();
  ok(ev.length >= 12, 'capsize events');
});
test('Physics: capsized boats stop, lie at ~90°, auto-recover (unless disabled)', () => {
  const b = blast('29er', 'normal', 2.5, { autoRecover: false });
  ok(b.capsized, 'capsized');
  const wind = KOS.Wind.steady(0, 10);
  for (let i = 0; i < 60 * 20; i++) P.step(b, P.controls(), { wind, assist: 'normal', autoRecover: false }, KOS.DT);
  ok(b.capsized && b.capsizeT > 15, 'stays down with autoRecover:false');
  ok(Math.abs(b.heel) > R(70) && Math.abs(b.speed) < 0.2, 'lying flat, stopped');
  const ev = listen('boat:righted');
  for (let i = 0; i < 60 * 12; i++) P.step(b, P.controls(), { wind, assist: 'normal' }, KOS.DT);
  ev.stop();
  ok(!b.capsized && ev.length === 1, 'auto recovered');
  P.capsize(b); ok(b.capsized); P.right(b, 0); ok(!b.capsized && Math.abs(U.wrapPi(0 - b.heading)) > b.cls.noGo, 'manual right()');
});
test('Physics: ILCA capsizes in a gust without hiking but survives when hiking + easing', () => {
  const w = { at: () => ({ dir: 0, speed: 16 }), update() {} };
  const run = ctrl => { const b = P.createBoat('ilca', { heading: R(-50), speed: U.ms(4) }); let ever = false; for (let i = 0; i < 600; i++) { b.heading = R(-50); b.yawRate = 0; P.step(b, Object.assign(P.controls(), ctrl), { wind: w, assist: 'normal' }, KOS.DT); ever = ever || b.capsized; } return ever; };
  ok(run({ autoTrim: false, sheet: 0, hike: 0 }), 'goes over');
  ok(!run({ autoTrim: true, autoHike: true }), 'stays up with hiking + auto trim');
});

// ====================================================================== spinnaker
test('Physics: spinnaker boost only on broad angles, collapses when too high', () => {
  const broad = settle('feva', 135, 10, { controls: { spinnaker: true } }), broadNo = settle('feva', 135, 10);
  ok(broad.speed > broadNo.speed * 1.12 && !broad.spiCollapsed, 'feva gennaker boost');
  const ev = listen('boat:spiCollapse');
  const high = settle('feva', 60, 10, { controls: { spinnaker: true } }), highNo = settle('feva', 60, 10);
  ev.stop();
  ok(high.spiCollapsed && high.speed < highNo.speed && ev.length >= 1, 'collapses on a close reach');
  const opti = settle('opti', 135, 10, { controls: { spinnaker: true } });
  ok(!opti.spinnaker, 'no kite on an opti');
});

// ====================================================================== RIB
function settleStats(cls, twaDeg, tws, ctl) {
  const wind = KOS.Wind.steady(0, tws);
  const b = P.createBoat(cls, { heading: R(-twaDeg) });
  const c = Object.assign(P.controls(), { autoHike: true }, ctl || {});
  let sp = 0, lee = 0, vmg = 0, n = 0;
  for (let i = 0; i < 40 * 60; i++) {
    b.heading = R(-twaDeg); b.yawRate = 0;
    if (ctl && ctl.jibOff !== undefined) c.jib = U.clamp(P.idealJib(b) + ctl.jibOff, 0, 1);
    P.step(b, c, { wind, assist: 'normal' }, KOS.DT);
    if (i >= 30 * 60) { sp += b.speed; lee += Math.atan2(Math.abs(b.slip), b.speed); vmg += -b.vy; n++; }
  }
  return { b, kn: kn(sp / n), lee: U.deg(lee / n), vmg: kn(vmg / n) };
}
test('Physics: daggerboard — board 1 = classic model; up upwind slides sideways; half up on a run is faster', () => {
  for (const id of ['opti', 'ilca', '29er']) {
    const ng = KOS.Boats.get(id).noGoDeg;
    // board fully down (explicit) reproduces the default controls exactly
    const a = settleStats(id, ng + 6, 10), a1 = settleStats(id, ng + 6, 10, { board: 1 });
    ok(a.b.x === a1.b.x && a.b.y === a1.b.y && a.b.speed === a1.b.speed, id + ' board 1 identical');
    const up = settleStats(id, ng + 6, 10, { board: 0.15 }), half = settleStats(id, ng + 6, 10, { board: 0.5 });
    ok(up.lee > a.lee * 3, `${id} board up upwind: leeway ${up.lee.toFixed(1)}° vs ${a.lee.toFixed(1)}°`);
    ok(up.vmg < a.vmg * 0.5, `${id} board up upwind: VMG ${up.vmg.toFixed(2)} vs ${a.vmg.toFixed(2)} kn`);
    ok(half.vmg < a.vmg * 0.9 && half.vmg > up.vmg, `${id} half board upwind in between: ${half.vmg.toFixed(2)}`);
    const run = settleStats(id, 170, 10), runHalf = settleStats(id, 170, 10, { board: 0.4 });
    between(runHalf.kn / run.kn, 1.03, 1.09, id + ' half board on a run: a few % faster');
    const reach = settleStats(id, 90, 10), reachHalf = settleStats(id, 90, 10, { board: 0.55 });
    ok(reachHalf.kn >= reach.kn * 0.99, id + ' board ~half on a beam reach is fine');
  }
});
test('Physics: daggerboard moves smoothly, auto board follows the ideal, keelboats have none', () => {
  const wind = KOS.Wind.steady(0, 10);
  const b = P.createBoat('opti', { heading: R(-170) });
  const c = Object.assign(P.controls(), { board: 0.15 });
  sim(b, c, wind, 0.25);
  between(b.board, 0.3, 0.9, 'half way after 0.25 s: ' + b.board.toFixed(2));
  sim(b, c, wind, 0.6);
  near(b.board, 0.15, 1e-9, 'up after ~0.6 s');
  const a = P.createBoat('ilca', { heading: R(-170) });
  sim(a, Object.assign(P.controls(), { autoBoard: true }), wind, 3);
  near(a.board, P.idealBoard('ilca', R(170)), 1e-9, 'auto board = ideal');
  near(P.idealBoard('opti', R(48)), 1, 1e-9, 'down upwind');
  between(P.idealBoard('opti', R(90)), 0.45, 0.7, 'about half on a beam reach');
  between(P.idealBoard('opti', R(175)), 0.2, 0.4, 'mostly up on a run');
  near(P.idealBoard('j70', R(175)), 1, 1e-9, 'keelboat: no board');
  const k = P.createBoat('hboat', { heading: R(-170) });
  sim(k, Object.assign(P.controls(), { board: 0.15 }), wind, 2);
  ok(k.board === 1, 'keelboat ignores the board control');
});
test('Physics: jib — auto = classic; hand-trimmed right is a bit faster/higher; flapping or over-sheeted is slower', () => {
  for (const id of ['feva', 'j70']) {
    const ng = KOS.Boats.get(id).noGoDeg;
    const auto = settleStats(id, ng + 6, 10), auto2 = settleStats(id, ng + 6, 10, { autoJib: true, jib: 0.9 });
    ok(auto.b.x === auto2.b.x && auto.b.speed === auto2.b.speed, id + ' auto jib ignores the jib sheet');
    const good = settleStats(id, ng + 6, 10, { autoJib: false, jibOff: 0 });
    between(good.kn / auto.kn, 1.005, 1.05, id + ' well-trimmed jib: modest bonus');
    ok(good.lee < auto.lee, id + ' and points a little higher');
    const flap = settleStats(id, ng + 6, 10, { autoJib: false, jibOff: 0.3 });
    ok(flap.kn < auto.kn * 0.9 && flap.b.jibLuffing, id + ' eased jib flaps: ' + flap.kn.toFixed(2));
    const stall = settleStats(id, 95, 10, { autoJib: false, jibOff: -0.3 }), reach = settleStats(id, 95, 10);
    ok(stall.kn < reach.kn * 0.95 && stall.b.jibStalled, id + ' over-sheeted jib on a reach stalls');
  }
  const o = settleStats('opti', 60, 10), o2 = settleStats('opti', 60, 10, { autoJib: false, jib: 1 });
  ok(o.b.speed === o2.b.speed, 'no jib on an Opti');
});
test('AI: sets its daggerboard to about the ideal and trims the jib near ideal on Normal', () => {
  const wind = KOS.Wind.steady(0, 10);
  const b = P.createBoat('feva', { x: 0, y: 0, heading: R(175), speed: 2 });
  const h = KOS.AI.createHelm(b, { skill: 0.8, seed: 2 });
  let c;
  for (let i = 0; i < 60 * 8; i++) { c = h.think({ wind, t: i * KOS.DT, assist: 'normal' }, { target: { x: 0, y: 400 } }, [b]); P.step(b, c, { wind, assist: 'normal' }, KOS.DT); }
  between(c.board, 0.15, 0.55, 'board half up on the run: ' + c.board);
  ok(c.autoJib === false && Math.abs(c.jib - P.idealJib(b)) < 0.05, 'jib trimmed near ideal');
  const e = h.think({ wind, t: 9, assist: 'easy' }, { target: { x: 0, y: 400 } }, [b]);
  ok(e.autoJib !== false, 'easy: auto jib');
});
test('RIB: throttle, planing, reverse, prop-wash steering, skidding turns, wake size', () => {
  const wind = KOS.Wind.steady(0, 8);
  const b = P.createBoat('rib', { heading: R(90) });
  sim(b, Object.assign(P.controls(), { throttle: 1 }), wind, 20);
  ok(kn(b.speed) > 24 && b.planing, 'fast & planing ' + kn(b.speed).toFixed(1));
  const wsFast = b.wakeSize;
  sim(b, Object.assign(P.controls(), { throttle: 1, rudder: 1 }), wind, 1.5);
  ok(b.skid > 0.5, 'skids in a hard turn ' + b.skid.toFixed(2));
  sim(b, Object.assign(P.controls(), { throttle: -1 }), wind, 15);
  ok(b.speed < -1 && kn(b.speed) > -7, 'reverse ' + kn(b.speed).toFixed(1));
  const s = P.createBoat('rib', { heading: 0 });
  sim(s, Object.assign(P.controls(), { throttle: 0.3, rudder: 1 }), wind, 1);
  ok(U.angDiff(0, s.heading) > R(20), 'turns at low speed with prop wash');
  const mid = P.createBoat('rib', { heading: 0 });
  sim(mid, Object.assign(P.controls(), { throttle: 0.33 }), wind, 15);
  ok(mid.wakeSize > 0.5 && wsFast < mid.wakeSize, 'biggest wake at displacement-hump speed (' + mid.wakeSize.toFixed(2) + ' vs ' + wsFast.toFixed(2) + ')');
  ok(mid.wake.length > 10, 'wake points');
});

// ====================================================================== wind
test('Wind: deterministic by seed, gusts move downwind, shift amplitude bounded', () => {
  const mk = seed => KOS.Wind.create({ dir: R(225), speed: 10, gust: 0.6, shift: 0.5, seed, bounds: { x0: -500, y0: -500, x1: 500, y1: 500 } });
  const a = mk(7), b = mk(7), c = mk(8);
  let maxShift = 0, maxK = 0, minK = 9, diff = false, maxCore = 0;
  const g0 = { x: a.gusts[0].x, y: a.gusts[0].y };
  for (let i = 0; i < 60 * 120; i++) {
    a.update(KOS.DT); b.update(KOS.DT); c.update(KOS.DT);
    if (i % 30 === 0) {
      for (let k = 0; k < 5; k++) {
        const x = (k - 2) * 180, y = (2 - k) * 150;
        const wa = a.at(x, y), wb = b.at(x, y), wc = c.at(x, y);
        ok(wa.dir === wb.dir && wa.speed === wb.speed, 'same seed same wind');
        if (wa.speed !== wc.speed) diff = true;
        maxShift = Math.max(maxShift, Math.abs(U.angDiff(R(225), wa.dir)));
        maxK = Math.max(maxK, wa.speed / a.base.speed); minK = Math.min(minK, wa.speed / a.base.speed);
      }
    }
    for (const g of a.gusts) if (g.k > 1) maxCore = Math.max(maxCore, a.at(g.x, g.y).speed / a.speed);
    if (i === 60) {
      const g = a.gusts[0];
      const moved = { x: g.x - g0.x, y: g.y - g0.y };
      const dw = U.vec(a.dir + Math.PI);
      ok(moved.x * dw.x + moved.y * dw.y > 0, 'gusts drift downwind');
    }
  }
  ok(diff, 'different seed differs');
  ok(maxShift <= R(0.5 * 15 + 3 + 8) + 1e-9 && maxShift > R(2), 'shift range ' + U.deg(maxShift).toFixed(1));
  ok(maxK <= 1.6 * 1.1 + 1e-9, 'gusts at most +60% (' + maxK.toFixed(2) + ')');
  ok(maxCore > 1.25 && maxCore <= 1.6 + 1e-9, 'gust cores reach up to +60% (' + maxCore.toFixed(2) + ')');
  ok(minK < 0.97, 'lulls exist');
  ok(a.gusts.length >= 3 && a.gusts.every(g => g.r > 0 && g.k > 0 && 'vx' in g), 'gust shape');
  const s = KOS.Wind.steady(R(90), 12); s.update(5);
  ok(s.at(100, 100).speed === 12 && s.at(0, 0).dir === R(90), 'steady wind');
});
test('Physics: whole simulation is deterministic for a seed', () => {
  const run = () => {
    const wind = KOS.Wind.create({ dir: 0, speed: 11, gust: 0.5, shift: 0.5, seed: 'det' });
    const b = P.createBoat('29er', { heading: R(-50) });
    const h = KOS.AI.createHelm(b, { skill: 0.6, seed: 9 });
    const plan = { course: [{ x: 0, y: -200, round: 'port' }, { x: 0, y: 0 }] };
    for (let i = 0; i < 60 * 90; i++) { const c = h.think({ wind, t: i * KOS.DT }, plan, [b]); P.step(b, c, { wind, assist: 'normal' }, KOS.DT); wind.update(KOS.DT); }
    return [b.x, b.y, b.heading, b.speed, b.tacks].join(',');
  };
  ok(run() === run());
});

// ====================================================================== collisions & world
test('Physics.collide: capsule separation + impulse + event; marks', () => {
  const a = P.createBoat('opti', { x: 0, y: 0, heading: R(90), speed: 1.5 });
  const b = P.createBoat('opti', { x: 2.2, y: 0.3, heading: R(-90), speed: 1.5 });
  const ev = listen('boat:collide');
  const res = P.collide([a, b]);
  ev.stop();
  ok(res.length === 1 && res[0].type === 'boat' && res[0].speed > 2, 'boat contact');
  ok(ev.length === 1);
  ok(KOS.Rules.hullGap(a, b) > -0.05, 'separated');
  ok(a.vx < 1.5 && b.vx > -1.5, 'impulse');
  const m = P.createBoat('ilca', { x: 0, y: 0, heading: 0, speed: 2 });
  const r2 = P.collide([m], null, [{ x: 0, y: -2, id: 'top' }]);
  ok(r2.length === 1 && r2[0].type === 'mark', 'mark contact');
  ok(P.collide([P.createBoat('opti', { x: 0 }), P.createBoat('opti', { x: 30 })]).length === 0, 'no contact far apart');
});
test('Physics: grounding via KOS.World (mock venue) — bounce, stop, boat:ground', () => {
  const real = KOS.World;
  KOS.World = { depthAt: (v, x) => (x > 50 ? 0.4 : 4), hit: () => null };
  try {
    const wind = KOS.Wind.steady(0, 10);
    const b = P.createBoat('j70', { x: 0, y: 0, heading: R(90), speed: U.ms(6) });
    const ev = listen('boat:ground');
    sim(b, P.controls(), wind, 20, { venue: { id: 'mock' } });
    ev.stop();
    ok(ev.length >= 1 && ev[0].type === 'shallow', 'ground event');
    ok(b.x < 52 && b.x > 30, 'did not sail through the shallows ' + b.x.toFixed(1));
    const dinghy = P.createBoat('opti', { x: 0, y: 0, heading: R(90), speed: U.ms(3) });
    KOS.World = { depthAt: (v, x) => (x > 50 ? 0.4 : 4), hit: () => null };
    sim(dinghy, P.controls(), wind, 25, { venue: { id: 'mock' } });
    ok(dinghy.x < 52, 'opti draft 0.8 also stops');
    const free = P.createBoat('opti', { x: 0, y: 0, heading: R(90), speed: U.ms(3) });
    sim(free, bb => Object.assign(P.controls(), { rudder: U.clamp(U.angDiff(bb.heading, R(90)) * 3, -1, 1) }), wind, 30); // no venue => no world checks
    ok(free.x > 55, 'no venue => open water');
  } finally { KOS.World = real; }
});
test('World (if loaded): sailing into the real bay shore grounds and never ends up on land', () => {
  if (!KOS.World || !KOS.World.get || !KOS.World.get('bay')) return;
  const v = KOS.World.get('bay');
  ok(typeof KOS.World.depthAt(v, v.spawn.x, v.spawn.y) === 'number' && KOS.World.depthAt(v, v.spawn.x, v.spawn.y) > 0.8, 'spawn in water');
  const q = KOS.World.nearestShore(v, v.spawn.x, v.spawn.y);
  for (const id of ['opti', 'j70', 'rib']) {
    const b = P.createBoat(id, { x: v.spawn.x, y: v.spawn.y, heading: U.bearing(v.spawn, q) });
    const wind = KOS.Wind.steady(U.bearing(v.spawn, q) + Math.PI / 2, 10);
    const ev = listen('boat:ground');
    let onLand = false;
    for (let i = 0; i < 60 * 300; i++) {
      const e = U.angDiff(b.heading, U.bearing(b, q));
      P.step(b, Object.assign(P.controls(), { rudder: U.clamp(e * 2, -1, 1), throttle: 0.4 }), { wind, venue: v, assist: 'normal' }, KOS.DT);
      if (KOS.World.isLand(v, b.x, b.y)) onLand = true;
    }
    ev.stop();
    ok(ev.some(p => p.boat === b), id + ' grounding event');
    ok(!onLand, id + ' never on land');
  }
});
// ====================================================================== rules
function sb(o) { // scenario boat
  const b = P.createBoat(o.cls || 'opti', { x: o.x, y: o.y, heading: R(o.h), speed: o.speed || U.ms(3), name: o.name || 'B' });
  b.tack = U.wrapPi(0 - b.heading) >= 0 ? 'starboard' : 'port';
  b._init = true;
  if (o.r13) b.r13 = true;
  return b;
}
test('Rules: R10 port gives way to starboard', () => {
  const s = sb({ x: 0, y: 0, h: -45, name: 'S' }); // wind from N: heading NW => starboard
  const p = sb({ x: 20, y: 0, h: 45, name: 'P' });
  const r = KOS.Rules.rightOfWay(p, s, { wind: 0 });
  ok(r.rule === 'R10' && r.giveWay === p && r.standOn === s);
  ok(KOS.Rules.rightOfWay(s, p, { wind: 0 }).giveWay === p, 'symmetric');
  ok(KOS.Rules.tackOf(s) === 'starboard' && KOS.Rules.tackOf(p) === 'port');
  KOS.I18n && KOS.I18n.setLang && KOS.I18n.setLang('da');
  const txt = KOS.Rules.explain(r);
  ok(/Styrbord|styrbord/.test(txt) && txt.includes('P') && txt.includes('S'), 'danish reason: ' + txt);
  if (KOS.I18n && KOS.I18n.setLang) { KOS.I18n.setLang('en'); ok(/Starboard/.test(KOS.Rules.explain(r))); KOS.I18n.setLang('da'); }
  ok(KOS.Rules.ruleName('R10').length > 3);
});
test('Rules: R11 windward keeps clear (overlapped, same tack)', () => {
  const lee = sb({ x: 0, y: 0, h: -45 });
  const wwd = sb({ x: 2.2, y: -2.2, h: -45 }); // abeam on the starboard (windward) side
  ok(KOS.Rules.overlapped(lee, wwd));
  ok(KOS.Rules.isWindward(wwd, lee, 0));
  const r = KOS.Rules.rightOfWay(lee, wwd, { wind: 0 });
  ok(r.rule === 'R11' && r.giveWay === wwd);
});
test('Rules: R12 clear astern keeps clear', () => {
  const ahead = sb({ x: 0, y: 0, h: 90 });
  const astern = sb({ x: -10, y: 0, h: 90 });
  ok(KOS.Rules.clearAstern(astern, ahead) && !KOS.Rules.overlapped(astern, ahead));
  const r = KOS.Rules.rightOfWay(ahead, astern, { wind: 0 });
  ok(r.rule === 'R12' && r.giveWay === astern);
});
test('Rules: R13 tacking boat keeps clear (even if it will be on starboard)', () => {
  const tacking = sb({ x: 0, y: 0, h: -10, r13: true });
  const other = sb({ x: 15, y: 5, h: 45 }); // port tack
  const r = KOS.Rules.rightOfWay(other, tacking, { wind: 0 });
  ok(r.rule === 'R13' && r.giveWay === tacking);
});
test('Rules: R18 mark-room inside the 3-length zone; not on opposite tacks upwind', () => {
  const mark = { x: 0, y: 0 };
  // running down to a leeward mark, both on starboard, overlapped; inside boat nearer the mark
  const inside = sb({ x: 1.5, y: -4, h: 180 - 20 });
  const outside = sb({ x: 4.5, y: -4.5, h: 180 - 20 });
  inside.tack = outside.tack = 'starboard';
  let r = KOS.Rules.rightOfWay(outside, inside, { wind: 0, marks: [mark] });
  ok(r.rule === 'R18' && r.giveWay === outside && r.standOn === inside, 'inside gets room: ' + r.rule);
  // outside the zone -> normal rules (R11: the windward boat keeps clear)
  const far1 = sb({ x: 2, y: -60, h: 160 }), far2 = sb({ x: 5.5, y: -60.5, h: 160 });
  far1.tack = far2.tack = 'starboard';
  ok(KOS.Rules.rightOfWay(far1, far2, { wind: 0, marks: [mark] }).rule !== 'R18', 'no R18 outside zone');
  // clear ahead at the zone
  const ah = sb({ x: 1, y: -3, h: 160 }), as = sb({ x: 2, y: -6.5, h: 160 });
  ah.tack = as.tack = 'starboard';
  r = KOS.Rules.rightOfWay(as, ah, { wind: 0, marks: [mark] });
  ok(r.rule === 'R18' && r.giveWay === as && r.reasonKey === 'rules.reason.R18-astern', 'clear ahead gets room');
  // opposite tacks on a beat at a windward mark -> R10
  const s = sb({ x: 3, y: 4, h: -45 }), p = sb({ x: -3, y: 4, h: 45 });
  r = KOS.Rules.rightOfWay(s, p, { wind: 0, marks: [mark] });
  ok(r.rule === 'R10' && r.giveWay === p, 'R18 off between opposite tacks beating');
});
test('Rules: COLREG power vs sail, overtaking, head-on, crossing', () => {
  const rib = sb({ cls: 'rib', x: 0, y: 0, h: 90 });
  const sail = sb({ x: 30, y: 10, h: -45 });
  let r = KOS.Rules.rightOfWay(rib, sail, {});
  ok(r.rule === 'C-power-sail' && r.giveWay === rib);
  // sailing boat overtaking a RIB still keeps clear
  const slowRib = sb({ cls: 'rib', x: 0, y: 0, h: 90, speed: 0.5 });
  const fastSail = sb({ x: -12, y: 1, h: 90, speed: 3 });
  r = KOS.Rules.rightOfWay(slowRib, fastSail, {});
  ok(r.rule === 'C-overtaking' && r.giveWay === fastSail, 'overtaking first: ' + r.rule);
  // head-on
  const r1 = sb({ cls: 'rib', x: 0, y: 0, h: 0 }), r2 = sb({ cls: 'rib', x: 0, y: -50, h: 180 });
  r = KOS.Rules.rightOfWay(r1, r2, {});
  ok(r.rule === 'C-headon' && r.both, 'head-on');
  // crossing: r3 heading north, r4 coming from its starboard side heading west -> r3 gives way
  const r3 = sb({ cls: 'rib', x: 0, y: 0, h: 0 }), r4 = sb({ cls: 'rib', x: 40, y: -40, h: -90 });
  r = KOS.Rules.rightOfWay(r4, r3, {});
  ok(r.rule === 'C-crossing' && r.giveWay === r3 && r.standOn === r4, 'crossing');
  // power overtaking power
  const r5 = sb({ cls: 'rib', x: 0, y: 0, h: 0, speed: 2 }), r6 = sb({ cls: 'rib', x: 1, y: 15, h: 0, speed: 6 });
  r = KOS.Rules.rightOfWay(r5, r6, {});
  ok(r.rule === 'C-overtaking' && r.giveWay === r6);
  ok(KOS.Rules.isPower(rib) && !KOS.Rules.isPower(sail));
});
test('Rules: every rule has Danish + English strings', () => {
  const S = KOS.Rules.strings;
  for (const rule of ['R10', 'R11', 'R12', 'R13', 'R18', 'C-power-sail', 'C-overtaking', 'C-headon', 'C-crossing']) {
    ok(S.da['rules.reason.' + rule] && S.en['rules.reason.' + rule] && S.da['rules.name.' + rule], rule);
    if (KOS.I18n && KOS.I18n.has) ok(KOS.I18n.has('rules.reason.' + rule, 'da'), 'registered ' + rule);
  }
});
test('Rules.monitor: flags give-way boat closing within a length; contact; quiet otherwise', () => {
  const mon = KOS.Rules.monitor();
  const s = sb({ x: 0, y: 0, h: -45, name: 'S' });
  const p = sb({ x: -3.0, y: 0.8, h: 45, name: 'P' }); // port tack, crossing towards S
  const f = mon.update([s, p], 0, null, KOS.DT);
  ok(f.length === 1 && f[0].offender === p && f[0].victim === s && f[0].rule === 'R10', 'foul');
  ok(mon.update([s, p], 0, null, KOS.DT).length === 0, 'cooldown');
  const mon2 = KOS.Rules.monitor();
  const a = sb({ x: 0, y: 0, h: -45 }), b = sb({ x: 40, y: 0, h: 45 });
  ok(mon2.update([a, b], 0, null, KOS.DT).length === 0, 'no foul far apart');
  const mon3 = KOS.Rules.monitor();
  const t = sb({ x: 0, y: 0, h: 0 });
  const mk = mon3.update([t], 0, [{ x: 0.5, y: -1, id: 'm' }], KOS.DT);
  ok(mk.length === 1 && mk[0].type === 'mark', 'mark touch');
});

// ====================================================================== AI
function raceCourse(cls, skill, tws, opts) {
  opts = opts || {};
  const d = opts.d || 300;
  const wind = KOS.Wind.create({ dir: 0, speed: tws, gust: 0.3, shift: 0.3, seed: opts.seed || 3 });
  const b = P.createBoat(cls, { x: 0, y: 0, heading: R(-50) });
  const helm = KOS.AI.createHelm(b, { skill, seed: opts.helmSeed || 1 });
  const plan = { course: [{ x: 0, y: -d, round: opts.round || 'port' }, { x: 0, y: 0, round: 'port' }, { line: [{ x: -25, y: -40 }, { x: 25, y: -40 }] }] };
  let t = 0, sweep = 0, prevA = null, minGap = Infinity;
  const mark = plan.course[0];
  while (t < 1500 && !helm.finished) {
    const c = helm.think({ wind, t, assist: 'normal' }, plan, [b]);
    P.step(b, c, { wind, assist: 'normal', t }, KOS.DT);
    wind.update(KOS.DT); t += KOS.DT;
    if (helm.leg === 0 || (helm.leg === 1 && U.dist(b, mark) < 40)) {
      if (U.dist(b, mark) < 40) {
        const a = U.bearing(mark, b);
        if (prevA !== null) sweep += U.angDiff(prevA, a);
        prevA = a;
        minGap = Math.min(minGap, U.dist(b, mark));
      } else prevA = null;
    }
  }
  return { b, helm, t, sweep, minGap, d };
}
test('AI: completes a windward-leeward course in reasonable time for each class', () => {
  for (const cls of KOS.Boats.list) {
    const r = raceCourse(cls.id, 0.8, 10);
    ok(r.helm.finished, cls.id + ' finished (state ' + r.helm.state + ', leg ' + r.helm.leg + ')');
    ok(!r.b.capsized, cls.id + ' upright');
    if (cls.motor) { ok(r.t < 120, 'rib quick ' + r.t.toFixed(0)); continue; }
    const up = KOS.Boats.optimal(cls, 10, 'up'), dn = KOS.Boats.optimal(cls, 10, 'down', cls.hasSpinnaker !== 'none');
    const ideal = r.d / U.ms(up.vmg) + r.d / U.ms(dn.vmg) + 40 / U.ms(up.vmg);
    ok(r.t < ideal * 1.45 + 30, `${cls.id} time ${r.t.toFixed(0)}s vs ideal ${ideal.toFixed(0)}s`);
    ok(r.t > ideal * 0.8, `${cls.id} not impossibly fast ${r.t.toFixed(0)} vs ${ideal.toFixed(0)}`);
    ok(r.b.tacks >= 2 && r.b.tacks <= 24, cls.id + ' sensible tack count ' + r.b.tacks);
  }
});
test('AI: rounds marks on the correct side', () => {
  const p = raceCourse('ilca', 0.9, 10, { round: 'port' });
  ok(p.sweep < -R(90), 'port rounding sweeps counter-clockwise: ' + U.deg(p.sweep).toFixed(0));
  ok(p.minGap > 2, 'did not hit the mark');
  const s = raceCourse('ilca', 0.9, 10, { round: 'starboard' });
  ok(s.sweep > R(90), 'starboard rounding sweeps clockwise: ' + U.deg(s.sweep).toFixed(0));
});
test('AI: skill makes a realistic difference', () => {
  let good = 0, bad = 0;
  for (const id of ['opti', 'ilca', 'j70']) { good += raceCourse(id, 0.95, 10).t; bad += raceCourse(id, 0.1, 10).t; }
  ok(good < bad, `good ${good.toFixed(0)} < bad ${bad.toFixed(0)}`);
  ok(bad < good * 1.5, 'but beginners still finish not absurdly slower');
});
test('AI: deterministic per seed', () => {
  const a = raceCourse('feva', 0.5, 9, { helmSeed: 4 }), b = raceCourse('feva', 0.5, 9, { helmSeed: 4 });
  ok(a.t === b.t && a.b.x === b.b.x);
});
test('AI: start sequence — behind the line before the gun, near it and moving at the gun', () => {
  let goodCount = 0;
  for (const [i, id] of ['opti', 'ilca', '29er', 'hboat', 'j70'].entries()) {
    const wind = KOS.Wind.create({ dir: 0, speed: 10, gust: 0.2, shift: 0.2, seed: 11 + i });
    const b = P.createBoat(id, { x: 20, y: 70, heading: R(90) });
    const helm = KOS.AI.createHelm(b, { skill: 0.9, seed: i });
    const plan = { start: { line: [{ x: -60, y: 0 }, { x: 60, y: 0 }], t0: 60 }, course: [{ x: 0, y: -300, round: 'port' }] };
    let t = 0, over = false;
    while (t < 60) {
      const c = helm.think({ wind, t }, plan, [b]);
      P.step(b, c, { wind, assist: 'normal' }, KOS.DT); wind.update(KOS.DT); t += KOS.DT;
      if (b.y < -0.5 && t < 59.5) over = true;
    }
    ok(!over, id + ' never early over the line');
    const dist = b.y;
    if (dist < 40 && b.speed > U.ms(b.cls.up) * 0.5) goodCount++;
    // after the gun it races
    for (let k = 0; k < 60 * 20; k++) { const c = helm.think({ wind, t }, plan, [b]); P.step(b, c, { wind }, KOS.DT); wind.update(KOS.DT); t += KOS.DT; }
    ok(b.y < 0, id + ' crossed the line after the start');
  }
  ok(goodCount >= 4, 'good starts ' + goodCount + '/5');
});
test('AI: give-way boat keeps clear (port/starboard crossing)', () => {
  const wind = KOS.Wind.steady(0, 10);
  // starboard boat sailing NW from the east, port boat sailing NE from the west: they would collide
  const S = P.createBoat('ilca', { x: 60, y: 0, heading: R(-47), speed: U.ms(4.5), name: 'S' });
  const Pt = P.createBoat('ilca', { x: -60, y: 0, heading: R(47), speed: U.ms(4.5), name: 'P' });
  const hs = KOS.AI.createHelm(S, { skill: 0.8, seed: 1 }), hp = KOS.AI.createHelm(Pt, { skill: 0.8, seed: 2 });
  const planS = { target: { x: 60 - 300 * Math.sin(R(47)), y: -300 * Math.cos(R(47)) } };
  const planP = { target: { x: -60 + 300 * Math.sin(R(47)), y: -300 * Math.cos(R(47)) } };
  let minGap = Infinity, avoided = false;
  const mon = KOS.Rules.monitor();
  let fouls = 0;
  for (let i = 0; i < 60 * 40; i++) {
    const cs = hs.think({ wind, t: i * KOS.DT }, planS, [S, Pt]);
    const cp = hp.think({ wind, t: i * KOS.DT }, planP, [S, Pt]);
    P.step(S, cs, { wind }, KOS.DT); P.step(Pt, cp, { wind }, KOS.DT);
    P.collide([S, Pt]);
    if (hp.avoiding === 'R10') avoided = true;
    minGap = Math.min(minGap, KOS.Rules.hullGap(S, Pt));
    fouls += mon.update([S, Pt], wind, null, KOS.DT).length;
  }
  ok(avoided, 'port boat recognised R10');
  ok(!hs.avoiding || hs.avoiding !== 'R10', 'stand-on boat holds course');
  ok(minGap > 0.5, 'no contact, min gap ' + minGap.toFixed(1));
  ok(fouls === 0, 'no fouls');
});
// A fleet race like js/modes/race.js 'race.ilca.2' (triangle, 12 kn, shifts and gusts, 9 boats of mixed skill), without
// the DOM. Regression for "AI boats turned round to the opposite direction mid race": ducks / dodges / roundings may
// turn the boat, but no ≥150° turnarounds away from the marks, few collisions, and every boat gets round the course.
function fleetRace(cls, seed, opts) {
  opts = opts || {};
  const wind = KOS.Wind.create({ dir: 0, speed: opts.kn || 12, gust: 0.55, shift: 0.4, seed });
  const L = KOS.Boats.get(cls).length, n = opts.n || 9, B = opts.B || 160, half = (1.9 * L * (n + 1) + 14) / 2;
  const at = (u, r) => ({ x: r, y: -u }); // wind from north: u = upwind, r = to the right
  const pin = at(0, -half), com = at(0, half);
  const m1 = Object.assign(at(B, 0), { r: 1.2, id: 'm1' }), m2 = Object.assign(at(0.5 * B, -0.75 * B), { r: 1.2, id: 'm2' });
  const m3 = Object.assign(at(0.1 * B, -half - Math.max(10, 3 * L) - 0.08 * B), { r: 1.2, id: 'm3' });
  const marks = [m1, m2, m3], T0 = 40;
  const boats = [];
  for (let i = 0; i < n; i++) {
    const b = P.createBoat(cls, { x: U.lerp(-half * 1.1, half * 1.1, (i + 0.5) / n), y: Math.max(22, 7 * L) + (i % 2) * 8, heading: R(i % 2 ? 110 : -110), speed: 1, name: 'b' + i });
    const sk = opts.fs ? U.lerp(opts.fs.lo, opts.fs.hi, i / (n - 1)) : U.lerp(0.4, 0.85, i / (n - 1));
    b.helm = KOS.AI.createHelm(b, { skill: sk, aggression: 0.3 + 0.5 * ((i * 0.37) % 1), seed: seed * 31 + i });
    if (opts.fs) b.pace = KOS.AI.paceFor(sk, opts.fs);
    const f = 0.2 + 0.6 * ((i * 0.618 + 0.3) % 1), lp = g => ({ x: U.lerp(pin.x, com.x, g), y: U.lerp(pin.y, com.y, g) });
    b.plan = { course: [{ line: [pin, com] }, { x: m1.x, y: m1.y, round: 'port' }, { x: m2.x, y: m2.y, round: 'port' }, { x: m3.x, y: m3.y, round: 'port' },
      { line: [lp(f - 0.12), lp(f + 0.12)] }], start: { line: [pin, com], t0: T0 }, marks, mode: 'race' };
    b.tr = { prevH: b.heading, uh: 0, hist: [], turns: 0 };
    boats.push(b);
  }
  const mon = KOS.Rules.monitor({ mode: 'race', cooldown: 8 });
  let t = 0, contacts = 0;
  const end = T0 + (opts.secs || 420);
  for (let k = 0; t < end && !boats.every(b => b.helm.finished); k++) {
    const env = { wind, t, assist: 'normal' };
    for (const b of boats) P.step(b, b.helm.think(env, b.plan, boats), env, KOS.DT);
    P.collide(boats, null, marks);
    // collisions that would cost a penalty turn in race.js (a gentle rub alongside does not)
    for (const f of mon.update(boats, wind, null, KOS.DT)) if (f.contact && t > T0 && Math.hypot(f.offender.vx - f.victim.vx, f.offender.vy - f.victim.vy) > 0.35) contacts++;
    wind.update(KOS.DT); t += KOS.DT;
    if (k % 15) continue; // 4 Hz turnaround check: ≥150° net heading change within 12 s that leaves the boat sailing
    // away from where it is going (a tack plus a dodge is fine), away from the marks and the start
    for (const b of boats) {
      const tr = b.tr;
      tr.uh += U.wrapPi(b.heading - tr.prevH); tr.prevH = b.heading;
      const nearMark = marks.some(m => U.dist(b, m) < Math.max(30, 7 * L)) || b.helm.finished || t < T0 + 15 || b.capsized;
      tr.hist.push({ t, uh: tr.uh, ok: nearMark });
      while (tr.hist.length && tr.hist[0].t < t - 12) tr.hist.shift();
      if (tr.hist.some(h => h.ok)) continue;
      const tg = b.helm.target, away = tg && Math.abs(U.angDiff(b.heading, U.bearing(b, tg))) > R(100);
      if (away && tr.hist.some(h => Math.abs(tr.uh - h.uh) >= R(150))) { tr.turns++; tr.hist.length = 0; }
    }
  }
  return { boats, contacts, t: t - T0 };
}
test('AI: fleet race — no mid-race turnarounds, few collisions, all boats get round (ILCA triangle)', () => {
  let turns = 0, contacts = 0, boatRaces = 0;
  for (const seed of [1, 2, 3]) {
    const r = fleetRace('ilca', seed);
    for (const b of r.boats) {
      boatRaces++; turns += b.tr.turns;
      ok(b.helm.leg >= 3, `seed ${seed} ${b.name} (skill ${b.helm.skill.toFixed(2)}) got round marks 1 and 2 (leg ${b.helm.leg}, state ${b.helm.state})`);
    }
    ok(r.boats.filter(b => b.helm.finished).length >= r.boats.length - 1, `seed ${seed}: the fleet finishes (${r.boats.filter(b => b.helm.finished).length}/${r.boats.length})`);
    contacts += r.contacts;
  }
  ok(turns / boatRaces <= 0.05, `turnarounds per boat per race ${(turns / boatRaces).toFixed(2)} (${turns}/${boatRaces})`);
  ok(contacts / boatRaces <= 0.6, `boat-boat contacts per boat per race ${(contacts / boatRaces).toFixed(2)} (${contacts}/${boatRaces})`);
});
test('AI: fleetSkill follows the player level (monotonic) and a weak fleet still sails properly', () => {
  const F = KOS.AI.fleetSkill, ages = ['8-10', '11-13', '14-17', '18+'], assists = ['easy', 'normal', 'pro'];
  for (const as of assists) for (let i = 1; i < ages.length; i++) ok(F({ age: ages[i - 1] }, as).offset < F({ age: ages[i] }, as).offset, `older is stronger (${ages[i - 1]} < ${ages[i]}, ${as})`);
  for (const ag of ages) for (let i = 1; i < assists.length; i++) ok(F({ age: ag }, assists[i - 1]).offset < F({ age: ag }, assists[i]).offset, `Pro > Normal > Let (${ag})`);
  ok(F({}, 'normal', 0).offset === 0 && F(null, 'normal').offset === 0 && F({ age: '' }, 'normal').offset === 0, 'unknown profile + Normal = base range');
  ok(F({}, 'normal', 60).offset > F({}, 'normal', 0).offset, 'more stars = a little stronger');
  const weak = F({ age: '8-10' }, 'easy'), strong = F({ age: '18+' }, 'pro', 60);
  ok(weak.lo < strong.lo && weak.hi < strong.hi && weak.lo >= 0.05 && strong.hi <= 0.98, 'range ordered and inside 0.05..0.98');
  ok(KOS.AI.paceFor(weak.lo, weak) < KOS.AI.paceFor(strong.hi, strong), 'weak fleet slower than strong fleet');
  ok(KOS.AI.paceFor(0.4, weak) < KOS.AI.paceFor(0.8, weak), 'a better helm is a little faster inside a fleet');
  for (const [cls, fs] of [['ilca', weak], ['ilca', strong]]) {
    let turns = 0, boatRaces = 0;
    for (const seed of [1, 2, 3]) {
      const r = fleetRace(cls, seed, { fs });
      for (const b of r.boats) { boatRaces++; turns += b.tr.turns; ok(b.helm.leg >= 3, `seed ${seed} ${b.name} (skill ${b.helm.skill.toFixed(2)}) got round the marks`); }
    }
    ok(turns / boatRaces <= 0.05, `${fs === weak ? 'weak' : 'strong'} fleet: turnarounds per boat per race ${(turns / boatRaces).toFixed(2)}`);
  }
});
test('AI: fleet race in other classes stays sane too (29er in a breeze, J/70)', () => {
  for (const [cls, kn] of [['29er', 16], ['j70', 13]]) {
    const r = fleetRace(cls, 4, { kn, n: 8 });
    const turns = r.boats.reduce((s, b) => s + b.tr.turns, 0);
    ok(turns <= 1, `${cls}: turnarounds ${turns}`);
    ok(r.boats.every(b => b.helm.leg >= 3), `${cls}: all got round marks 1 and 2`);
  }
});
test('AI: RIB motors to waypoints and keeps clear of sail', () => {
  const r = raceCourse('rib', 0.7, 8);
  ok(r.helm.finished && r.helm.state === 'finished');
});

// ====================================================================== tilt (js/render/tilt.js, docs/specs/tilt-camera.md §9.1)
{
  const TL = KOS.Tilt;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // a tilt-like object for any pitch (makeTilt returns null below PITCH_MIN, so the tests build it directly)
  const mk = (o) => {
    const c = o.cam, p = o.pitch || 0;
    return { T: 1, pitch: p, k: Math.cos(p), s: Math.sin(p), cr: Math.cos(-c.rot), sr: Math.sin(-c.rot), Z: c.zoom, camX: c.x, camY: c.y,
      w: o.w, h: o.h, cx: o.w / 2, cy: o.h / 2 + (o.biasY || 0), shx: 0, shy: 0, ox: o.w / 2, oy: o.h / 2 + (o.biasY || 0), dpr: 1, perf: 2 };
  };
  // the legacy SailScene.worldToScreen formula (scene.js at 847860f), verbatim
  const legacy = (cam, w, h, biasY, x, y) => { const cs = Math.cos(-cam.rot), sn = Math.sin(-cam.rot), dx = x - cam.x, dy = y - cam.y; return { x: w / 2 + (dx * cs - dy * sn) * cam.zoom, y: h / 2 + (biasY || 0) + (dx * sn + dy * cs) * cam.zoom }; };
  const chain = (b, x, y, z) => { // heel -> heading, step by step (§3.4)
    const H = b.heading, hx = x * Math.cos(b.heel) + z * Math.sin(b.heel), hz = -x * Math.sin(b.heel) + z * Math.cos(b.heel), hy = y;
    return { wx: b.x + hx * Math.cos(H) - hy * Math.sin(H), wy: b.y + hx * Math.sin(H) + hy * Math.cos(H), wz: hz };
  };
  const inBox = (p, v) => p.x >= v.x0 - 1e-9 && p.x <= v.x1 + 1e-9 && p.y >= v.y0 - 1e-9 && p.y <= v.y1 + 1e-9;
  test('tilt: pitch 0 project equals legacy worldToScreen exactly', () => {
    for (let i = 0; i < 200; i++) {
      const cam = { x: (rnd() - 0.5) * 400, y: (rnd() - 0.5) * 400, zoom: 1 + rnd() * 40, rot: i % 3 ? (rnd() - 0.5) * 6 : 0 };
      const biasY = i % 2 ? 0 : 37, t = mk({ cam, w: 390, h: 844, biasY, pitch: 0 });
      const x = cam.x + (rnd() - 0.5) * 100, y = cam.y + (rnd() - 0.5) * 100, a = TL.project(t, x, y, 0), b = legacy(cam, 390, 844, biasY, x, y);
      ok(a.x === b.x && a.y === b.y, 'mismatch ' + JSON.stringify([a, b]));
    }
  });
  test('tilt: unproject(project(p)) round trip', () => {
    for (const pd of [20, 32, 38, 45, 55]) for (const rot of [0, 0.7, -2.1]) for (const zoom of [2, 20]) for (const biasY of [0, 84]) {
      const cam = { x: 120, y: -40, zoom, rot }, t = mk({ cam, w: 844, h: 390, biasY, pitch: pd * Math.PI / 180 });
      for (let i = 0; i < 10; i++) { const x = cam.x + (rnd() - 0.5) * 80, y = cam.y + (rnd() - 0.5) * 80, s = TL.project(t, x, y, 0), u = TL.unproject(t, s.x, s.y); near(u.x, x, 1e-9, 'x'); near(u.y, y, 1e-9, 'y'); }
    }
  });
  test('tilt: unproject with height z inverts project at z', () => {
    const t = mk({ cam: { x: 5, y: 9, zoom: 14, rot: 0.9 }, w: 390, h: 844, biasY: 20, pitch: 0.6 });
    for (let i = 0; i < 20; i++) { const x = rnd() * 50, y = rnd() * 50, z = rnd() * 10, s = TL.project(t, x, y, z), u = TL.unproject(t, s.x, s.y, z); near(u.x, x, 1e-9); near(u.y, y, 1e-9); }
  });
  test('tilt: height lifts straight up on screen', () => {
    const t = mk({ cam: { x: 0, y: 0, zoom: 17, rot: -1.3 }, w: 390, h: 844, pitch: 0.66 });
    for (let i = 0; i < 20; i++) { const x = rnd() * 40 - 20, y = rnd() * 40 - 20, z = rnd() * 9, a = TL.project(t, x, y, 0), b = TL.project(t, x, y, z); ok(a.x === b.x, 'x moved'); near(b.y - a.y, -z * t.Z * t.s, 1e-9, 'dY'); }
  });
  test('tilt: boatMatrix matches heel -> heading -> project; mast leans to the heeled side', () => {
    const t = mk({ cam: { x: 3, y: -4, zoom: 22, rot: 0.3 }, w: 390, h: 844, biasY: 10, pitch: 0.62 });
    const b = { x: 7, y: 2, heading: 1.1, heel: 0.4 }, M = TL.boatMatrix(null, t, b, b.heel);
    for (let i = 0; i < 20; i++) {
      const bx = rnd() * 2 - 1, by = rnd() * 4 - 2, bz = rnd() * 6, w = chain(b, bx, by, bz), p = TL.project(t, w.wx, w.wy, w.wz), q = TL.apply(M, bx, by, bz);
      near(q.x, p.x, 1e-9, 'X'); near(q.y, p.y, 1e-9, 'Y');
    }
    const t0 = mk({ cam: { x: 0, y: 0, zoom: 20, rot: 0 }, w: 390, h: 844, pitch: 0.6 });
    for (const h of [0.3, -0.3]) {
      const M0 = TL.boatMatrix(null, t0, { x: 0, y: 0, heading: 0 }, h), top = TL.apply(M0, 0, -0.5, 5.5), foot = TL.apply(M0, 0, -0.5, 0.3);
      ok(h > 0 ? top.x - foot.x > 0 : top.x - foot.x < 0, 'mast lean sign for heel ' + h);
    }
  });
  test('tilt: shadowMatrix = project(world + wz*SUN, 0) with heel and heading; mast foot shadow attached', () => {
    const t = mk({ cam: { x: -2, y: 6, zoom: 18, rot: 0.3 }, w: 844, h: 390, pitch: 0.55 });
    const b = { x: 4, y: 1, heading: 1.1, heel: 0.4 }, Sm = TL.shadowMatrix(null, t, b, b.heel), M = TL.boatMatrix(null, t, b, b.heel);
    for (let i = 0; i < 20; i++) {
      const bx = rnd() * 2 - 1, by = rnd() * 4 - 2, bz = rnd() * 6, w = chain(b, bx, by, bz);
      const p = TL.project(t, w.wx + w.wz * TL.SUN.x, w.wy + w.wz * TL.SUN.y, 0), q = TL.apply(Sm, bx, by, bz);
      near(q.x, p.x, 1e-9, 'X'); near(q.y, p.y, 1e-9, 'Y');
    }
    const a = TL.apply(Sm, 0, -0.4, 0), m = TL.apply(M, 0, -0.4, 0); near(a.x, m.x, 1e-9, 'foot X'); near(a.y, m.y, 1e-9, 'foot Y');
  });
  test('tilt: viewAABB holds the screen footprint, viewItemsAABB also the ground point of a tall item below', () => {
    const t = mk({ cam: { x: 50, y: 50, zoom: 12, rot: 0.8 }, w: 390, h: 844, pitch: 0.66 });
    const v = TL.viewAABB(t, 390, 844), vi = TL.viewItemsAABB(t, 390, 844);
    for (const [X, Y] of [[0, 0], [390, 0], [0, 844], [390, 844], [195, 422]]) ok(inBox(TL.unproject(t, X, Y), v), 'corner ' + X + ',' + Y);
    ok(vi.x0 <= v.x0 && vi.y0 <= v.y0 && vi.x1 >= v.x1 && vi.y1 >= v.y1, 'items box contains view');
    for (const X of [0, 195, 390]) { const g = TL.unproject(t, X, 844, TL.HMAX); ok(inBox(g, vi), 'HMAX top on the bottom edge at X ' + X); } // project(g, HMAX) lands on the bottom edge
  });
  test('tilt: depth v orders like y at rot 0 and like the rotated axis at rot pi/2', () => {
    const t0 = mk({ cam: { x: 0, y: 0, zoom: 10, rot: 0 }, w: 390, h: 844, pitch: 0.6 });
    const pts = [[1, -5], [3, 2], [-4, 7], [0, 0.5]], ord = (t) => pts.slice().sort((a, b) => TL.depth(t, a[0], a[1]) - TL.depth(t, b[0], b[1]));
    ok(JSON.stringify(pts.slice().sort((a, b) => a[1] - b[1])) === JSON.stringify(ord(t0)), 'rot 0');
    const t1 = mk({ cam: { x: 0, y: 0, zoom: 10, rot: Math.PI / 2 }, w: 390, h: 844, pitch: 0.6 }); // v = dx*sin(-rot) + dy*cos(-rot) = -x
    ok(JSON.stringify(pts.slice().sort((a, b) => b[0] - a[0])) === JSON.stringify(ord(t1)), 'rot pi/2');
    for (const p of pts) { const s = TL.project(t1, p[0], p[1], 0); near(s.y, t1.cy + TL.depth(t1, p[0], p[1]) * t1.Z * t1.k, 1e-9, 'v is screen-down'); }
  });
  test('tilt: ease snaps by direction only', () => {
    let T = 0; for (let i = 0; i < 50; i++) { const n = TL.ease(T, 1, 1e-4); ok(n > T, 'T rises from 0 with a tiny dt (step ' + i + ')'); T = n; }
    ok(TL.ease(0.0019, 0, 1e-4) === 0, 'want 0 snaps to exactly 0 below 0.002');
    ok(TL.ease(0.0019, 1, 1e-4) > 0.0019, 'want 1 never snaps a small T to 0');
    ok(TL.ease(0.9985, 1, 1e-4) === 1, 'want 1 snaps to exactly 1 above 0.998');
    const d = TL.ease(0.9985, 0, 1e-4); ok(d < 0.9985 && d > 0.9, 'want 0 eases down from near 1, no snap to 1');
    let U = 1; for (let i = 0; i < 400; i++) U = TL.ease(U, 0, 1 / 60); ok(U === 0, 'reaches exactly 0');
    let V = 0; for (let i = 0; i < 400; i++) V = TL.ease(V, 1, 1 / 60); ok(V === 1, 'reaches exactly 1');
    ok(TL.ease(0.3, 1, 0.016, true) === 1, 'snap flag');
  });
  test('tilt: resolve table (setting x activity x perf level)', () => {
    const R = TL.resolve, on = ['race.opti.1', 'sail.free.zest', 'sail.rings', 'rib.learn'], off = ['rowschool.r10', 'nav.buoys', 'dock.zest.jetty', 'school.steer', 'quiz.basics', 'knots.eight'];
    for (const id of on) { ok(R('auto', id, 2) === true && R('auto', { mode: id.split('.')[0] }, 1) === true, 'auto on ' + id); ok(R('auto', id, 0) === false, 'auto level 0 off ' + id); }
    for (const id of off) ok(R('auto', id, 2) === false, 'auto off ' + id);
    for (const id of on.concat(off)) { ok(R('on', id, 0) === true && R('on', id, 2) === true, 'on ' + id); ok(R('off', id, 2) === false, 'off ' + id); }
    ok(R('bogus', 'race.opti.1', 2) === false && R('auto', null, 2) === false, 'unknown setting / activity is off');
  });
  test('tilt: makeTilt is null below PITCH_MIN and built at or above it', () => {
    const base = { cam: { x: 0, y: 0, zoom: 20, rot: 0 }, w: 390, h: 844 }, P0 = TL.basePitch(390, 844);
    ok(TL.makeTilt(Object.assign({ T: 0 }, base)) === null, 'T 0');
    ok(TL.makeTilt(Object.assign({ T: TL.PITCH_MIN / P0 * 0.999 }, base)) === null, 'just under 2 deg');
    const t = TL.makeTilt(Object.assign({ T: TL.PITCH_MIN / P0 * 1.0001 }, base)); ok(t && t.pitch >= TL.PITCH_MIN, 'at 2 deg');
    const f = TL.makeTilt(Object.assign({ T: 1 }, base)); near(f.pitch, 42 * Math.PI / 180, 1e-12, 'portrait P0'); ok(f.k === Math.cos(f.pitch), 'k');
    ok(TL.makeTilt({ T: 1, cam: { x: 0, y: 0, zoom: 1.2, rot: 0 }, w: 390, h: 844 }) === null, 'overview zoom fades to flat');
    near(TL.basePitch(844, 390), 45 * Math.PI / 180, 1e-12, 'landscape phone'); near(TL.basePitch(1440, 900), 50 * Math.PI / 180, 1e-12, 'desktop');
  });
}
test('Physics: keelboats "Ud på kanten" - rail weight (hike=1) cuts heel and adds speed in a breeze, ~nothing in light air', () => {
  for (const cls of ['j70', 'hboat']) {
    const noRail = settle(cls, 45, 16, { controls: { autoHike: false, hike: 0 } });
    const rail = settle(cls, 45, 16, { controls: { autoHike: false, hike: 1 } });
    ok(Math.abs(rail.heel) < Math.abs(noRail.heel) - R(3), cls + ': rail weight reduces heel');
    ok(rail.speed > noRail.speed * 1.02, cls + ': rail weight is faster at 16 kn upwind');
    ok(rail.speed < noRail.speed * 1.10, cls + ': ... but only modestly');
    const l0 = settle(cls, 45, 4, { controls: { autoHike: false, hike: 0 } });
    const l1 = settle(cls, 45, 4, { controls: { autoHike: false, hike: 1 } });
    near(l1.speed / l0.speed, 1, 0.04, cls + ': negligible difference at 4 kn');
    const auto = settle(cls, 45, 16, { controls: { autoHike: true } }); // Let: crew handle it
    ok(auto.speed > noRail.speed * 1.02 && auto.hike > 0.3, cls + ': autoHike works for keelboats');
  }
});


// ---- mobile controls: phone detection, the controls setting -> layout, the Normal-assist sheet nudge
test('mobile: isPhone - touch devices with a short side under 500 px, or a landscape screen under 900 px', () => {
  const I = KOS.Input, ph = (w, h, touch = true) => I.isPhone({ w, h, touch });
  for (const [w, h] of [[393, 852], [852, 393], [667, 375], [852, 300], [320, 568], [568, 320], [932, 430], [430, 932], [360, 640]]) ok(ph(w, h), w + 'x' + h + ' is a phone');
  for (const [w, h] of [[768, 1024], [1024, 768], [1024, 1366], [1366, 1024], [820, 1180], [1440, 900], [1280, 720]]) ok(!ph(w, h), w + 'x' + h + ' (tablet / laptop) is not');
  ok(!ph(393, 852, false) && !ph(852, 393, false), 'no touch = never a phone (desktop browser in a small window)');
});
test('mobile: resolveControls - auto = tiller on phones, buttons elsewhere; explicit choices are kept', () => {
  const I = KOS.Input, phone = { w: 393, h: 852, touch: true }, tablet = { w: 1024, h: 1366, touch: true }, desk = { w: 1440, h: 900, touch: false };
  ok(I.resolveControls('auto', phone) === 'tiller' && I.resolveControls(undefined, phone) === 'tiller', 'phone auto');
  ok(I.resolveControls('auto', tablet) === 'buttons' && I.resolveControls('auto', desk) === 'buttons', 'tablet / desktop auto keep the buttons');
  for (const c of ['tiller', 'buttons', 'joystick']) ok(I.resolveControls(c, phone) === c && I.resolveControls(c, desk) === c, c + ' explicit');
  ok(I.resolveControls('nonsense', phone) === 'tiller', 'unknown value falls back to auto');
});
test('mobile: nudge mapping - relative drag, clamped, springs back slowly after release', () => {
  const I = KOS.Input;
  near(I.nudgeBias(0, 0.5, 0.5), 0, 1e-9, 'no movement = no nudge');
  near(I.nudgeBias(0, 0.5, 0.65), 0.15, 1e-9, 'drag down 0.15 = ease out 0.15'); near(I.nudgeBias(0, 0.5, 0.3), -0.2, 1e-9, 'drag up = pull in');
  near(I.nudgeBias(0.2, 0.5, 0.6), 0.3, 1e-9, 'adds to the bias already there'); near(I.nudgeBias(0, 0, 1), I.NUDGE_MAX, 1e-9, 'clamped'); near(I.nudgeBias(0, 1, 0), -I.NUDGE_MAX, 1e-9, 'clamped (in)');
  let b = 0.4, t = 0; while (b && t < 60) { b = I.nudgeDecay(b, 1 / 60); t += 1 / 60; }
  between(t, 8, 30, 'springs back to auto in several seconds (slowly)');
  ok(I.nudgeDecay(0.2, 1) < 0.2 && I.nudgeDecay(0.2, 1) > 0.1, 'one second only eases a little'); ok(I.nudgeDecay(-0.2, 1) > -0.2, 'negative too');
});
test('mobile: toControls hands the nudge to physics as trimBias only while auto-trim is on', () => {
  const I = KOS.Input, st = { steer: 0, sheet: 0.5, hike: 0, spinnaker: false, throttle: 0, autoTrim: true, trimBias: 0.25 };
  let c = I.toControls(st, null, null, 1 / 60);
  ok(c.autoTrim === true && Math.abs(c.trimBias - 0.25) < 1e-9, 'auto + nudge -> trimBias 0.25');
  c = I.toControls(Object.assign({}, st, { autoTrim: false }), null, c, 1 / 60);
  ok(c.autoTrim === false && c.trimBias === 0, 'manual (Pro) -> trimBias 0, the slider is the sheet');
  c = I.toControls(Object.assign({}, st, { trimBias: 3 }), null, c, 1 / 60);
  near(c.trimBias, I.NUDGE_MAX, 1e-9, 'clamped to the nudge range');
});
test('mobile: physics - trimBias eases (+) or tightens (-) the auto-trimmed sheet relative to the ideal one', () => {
  const base = settle('opti', 70, 10, { secs: 20, controls: { autoTrim: true, trimBias: 0 } });
  const out = settle('opti', 70, 10, { secs: 20, controls: { autoTrim: true, trimBias: 0.3 } });
  const tight = settle('opti', 70, 10, { secs: 20, controls: { autoTrim: true, trimBias: -0.3 } });
  ok(out.sheet > base.sheet + 0.15, 'eased out: ' + out.sheet.toFixed(2) + ' vs ' + base.sheet.toFixed(2));
  ok(tight.sheet < base.sheet - 0.1, 'pulled in: ' + tight.sheet.toFixed(2) + ' vs ' + base.sheet.toFixed(2));
  ok(base.speed > tight.speed * 1.02, 'the auto trim is faster than being sheeted in hard (so the stall tip in nudge mode is warranted)');
});

// ====================================================================== Soslag (pure jet core, docs/specs/soslag.md sections 5-9)
const SL = KOS.Soslag, DT = KOS.DT;
function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + `: ${a} !== ${b}`); }
function fakeBoat(o) { return Object.assign({ x: 0, y: 0, heading: 0, vx: 0, vy: 0, speed: 0, cls: KOS.Boats.get('hboat') }, o); }
function jetFlight(boat, az, el, wind) { // fly one jet to the splash, interpolated landing {x, y}
  const j = SL.launch(null, boat, az, el); let t = 0, r = 0;
  while (!r && t < 6) { r = SL.stepJet(j, wind, DT); t += DT; }
  const u = j.pz / Math.max(j.pz - j.z, 1e-9);
  return { x: j.px + (j.x - j.px) * u, y: j.py + (j.y - j.py) * u, t, j };
}
function bestRange(tws, azRel) { // wind from north (dir 0) blows towards south (heading PI); azRel 0 = downwind
  let best = 0;
  for (let e = 8; e <= 40; e += 0.5) { const f = jetFlight(fakeBoat({ cls: { length: 0 } }), Math.PI + azRel, R(e), { dir: 0, speed: tws }); best = Math.max(best, Math.hypot(f.x, f.y)); }
  return best;
}
test('Soslag: range table at 6/9/12 kn (downwind, still, upwind) within +-1 m of the spec', () => {
  const tab = { 6: [16, 11, 8.5], 9: [18.7, 11, 7.5], 12: [21.3, 11, 6.7] };
  for (const k of [6, 9, 12]) {
    const [dn, zero, upw] = tab[k];
    near(bestRange(k, 0), dn, 1, k + ' kn downwind'); near(bestRange(k, Math.PI), upw, 1, k + ' kn upwind');
    near(bestRange(0, 0), zero, 1, 'still air'); near(SL.downwindRange(k), dn, 1, 'downwindRange ' + k); near(SL.upwindRange(k), upw, 1, 'upwindRange ' + k);
  }
  const d = bestRange(9, 0), u = bestRange(9, Math.PI);
  ok(d / u >= 2.4, 'downwind/upwind ' + (d / u).toFixed(2)); ok(u >= 7.0, 'upwind ' + u.toFixed(2));
});
test('Soslag: crosswind drift of a 20 degree shot (+-1 m of 2.3 / 3.5 / 4.6), towards dir + PI', () => {
  for (const [k, want] of [[6, 2.3], [9, 3.5], [12, 4.6]]) {
    const f = jetFlight(fakeBoat({ cls: { length: 0 } }), Math.PI / 2, R(20), { dir: 0, speed: k }); // shooting east, wind from the north: drifts south (y +)
    near(f.y, want, 1, k + ' kn drift');
  }
  for (const d of [0, 90, 180, 270]) {
    const w = SL.windMs({ dir: R(d), speed: 10 }, 0, 0), to = U.vec(R(d) + Math.PI);
    ok(w.x * to.x + w.y * to.y > 0.99 * U.ms(10) * SL.CFG.KW, 'wind dir ' + d);
  }
});
test('Soslag: the boat velocity is inherited by the jet', () => {
  const b = fakeBoat({ heading: 0, vx: 0, vy: -3, speed: 3 }), still = fakeBoat({ heading: 0 });
  const a = SL.launch(null, b, 0, R(20), b), c = SL.launch(null, still, 0, R(20), still);
  near(a.vy - c.vy, -3, 1e-9, 'vy inherited'); near(a.vz, c.vz, 1e-12);
});
test('Soslag: hit test (crew disc yes, hull outside the disc no points, too high no, passing by no)', () => {
  const tg = fakeBoat({ heading: 0 }), cc = SL.crewCenter(tg), mk = (x, y, z, px, py, pz) => ({ x, y, z, px, py, pz });
  ok(cc.y > tg.y, 'crew sits aft of the centre (heading north, so aft is south, y grows)');
  eq(SL.hitTest(mk(cc.x + 0.2, cc.y, 1.2, cc.x - 0.2, cc.y, 1.3), tg), 'crew', 'through the crew disc');
  eq(SL.hitTest(mk(tg.x + 0.2, tg.y - 3.2, 0.5, tg.x - 0.2, tg.y - 3.0, 0.6), tg), 'hull', 'bow of the hull, outside the disc');
  eq(SL.hitTest(mk(cc.x + 0.2, cc.y, 3.4, cc.x - 0.2, cc.y, 3.4), tg), null, 'too high above hull and crew');
  eq(SL.hitTest(mk(cc.x + 9.2, cc.y, 1, cc.x + 8.8, cc.y, 1), tg), null, 'passes beside');
  const low = SL.hitTest(mk(cc.x + 0.2, cc.y, 0.03, cc.x - 0.2, cc.y, 0.05), tg); ok(low !== 'crew', 'too low is no crew hit');
});
// zero-sigma replay of solveAim against a constant-velocity target with the same swept test the game uses
function replay(sh, tg, wind, a) {
  const j = SL.launch(null, sh, a.az, a.el), c = Object.assign({}, tg); let t = 0, r = 0;
  while (!r && t < 6) { r = SL.stepJet(j, wind, DT); t += DT; c.x = tg.x + (tg.vx || 0) * t; c.y = tg.y + (tg.vy || 0) * t; if (SL.hitTest(j, c) === 'crew') return true; }
  return false;
}
test('Soslag: solveAim ok implies a zero-sigma crew hit (z in band) at wind 0/90/180/270, still and 3 m/s crossing targets', () => {
  let oks = 0, total = 0;
  for (const wd of [0, 90, 180, 270]) {
    const wind = { dir: R(wd), speed: 9 };
    for (const rel of [0, 90, 180, 270]) for (const dist of [4, 6, 10, 14]) for (const cross of [0, 3]) {
      const brg = R(wd + rel), sh = fakeBoat({ x: 5, y: -7, heading: R(wd + 90) });
      const g = SL.gunPos(sh), v = U.vec(brg, dist), th = brg + Math.PI / 2, tv = U.vec(th, cross);
      const tg = fakeBoat({ x: g.x + v.x, y: g.y + v.y, heading: th, vx: tv.x, vy: tv.y, speed: cross });
      const a = SL.solveAim(sh, tg, wind); total++;
      if (a.ok) { oks++; ok(replay(sh, tg, wind, a), `ok but no hit: wind ${wd} rel ${rel} dist ${dist} cross ${cross}`); between(a.zHit, SL.CFG.CREW_Z0, SL.CFG.CREW_Z1, 'zHit'); }
      else if (rel === 180 || dist === 6 || (dist === 10 && rel !== 0 && !cross)) throw new Error(`expected ok: wind ${wd} rel ${rel} (target bearing from the wind-from line, 0 = upwind) dist ${dist} cross ${cross} miss ${a.miss.toFixed(2)}`);
    }
  }
  ok(oks / total > 0.6, 'most shots solvable: ' + oks + '/' + total);
});
test('Soslag: solveAim hits stationary targets at 6/10/14 m downwind and 4 m upwind, 25 m upwind is out of reach, and it leads a 3 m/s crosser', () => {
  const wind = { dir: 0, speed: 9 }; // from the north: downwind = south = heading PI
  for (const [d, rel] of [[6, Math.PI], [10, Math.PI], [14, Math.PI], [4, 0]]) {
    const sh = fakeBoat({ heading: 0 }), g = SL.gunPos(sh), v = U.vec(rel, d), tg = fakeBoat({ x: g.x + v.x, y: g.y + v.y });
    const a = SL.solveAim(sh, tg, wind); ok(a.ok && replay(sh, tg, wind, a), `${d} m heading ${rel.toFixed(1)}: miss ${a.miss.toFixed(2)}`);
  }
  const sh = fakeBoat({ heading: 0 }), g = SL.gunPos(sh), far = fakeBoat({ x: g.x, y: g.y - 25 });
  eq(SL.solveAim(sh, far, wind).ok, false, '25 m upwind');
  const tg = fakeBoat({ x: g.x + 10, y: g.y + 8, heading: 0, vx: 0, vy: -3, speed: 3 }), a = SL.solveAim(sh, tg, wind);
  ok(a.ok && replay(sh, tg, wind, a), 'crossing target hit');
  const lead = SL.solveAim(sh, Object.assign({}, tg, { vy: 0 }), wind);
  ok(Math.abs(U.angDiff(a.az, lead.az)) > R(1.5), 'aimed ahead of a moving target (az differs by ' + U.deg(U.angDiff(a.az, lead.az)).toFixed(1) + ' deg)');
});
test('Soslag: a 0.5 m aim offset still hits at 27 and 54 degrees of descent', () => {
  const wind = { dir: 0, speed: 9 }; // wind from the north; targets downwind (south): short shots come down at ~27 degrees, near-maximum lobs at ~54
  for (const [lo, hi] of [[25, 29], [52, 58]]) {
    let found = null;
    for (let d = 7; d <= 17 && !found; d += 0.25) { // first distance whose solution has the wanted descent angle
      const sh = fakeBoat({ heading: 0 }), g = SL.gunPos(sh), tg = fakeBoat({ x: g.x, y: g.y + d + 1 }), a = SL.solveAim(sh, tg, wind);
      if (a.ok && a.descent >= lo && a.descent <= hi) found = { sh, tg, descent: a.descent };
    }
    ok(found, 'a solution with ' + lo + '-' + hi + ' degrees of descent exists');
    for (const [ox, oy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) { // aim 0.5 m beside the crew centre
      const a = SL.solveAim(found.sh, fakeBoat({ x: found.tg.x + ox, y: found.tg.y + oy, heading: 0 }), wind);
      ok(replay(found.sh, found.tg, wind, a), `offset ${ox},${oy} at ${found.descent.toFixed(0)} deg missed`);
    }
  }
});
test('Soslag: the fire accumulator gives 500 +- 1 jets in 60 s and carries the remainder', () => {
  const b = {}; let n = 0; for (let i = 0; i < 3600; i++) n += SL.accTake(b, DT);
  between(n, 499, 501, 'jets in 60 s');
  const c = {}; let m = 0; for (let i = 0; i < 120; i++) m += SL.accTake(c, DT); between(m, 16, 17, '2 s held');
  // 0.05 s taps (3 steps) each followed by a release that does NOT drop the remainder: 10 taps = 0.5 s lose no shot when carried
  const d = {}; let q = 0; for (let k = 0; k < 10; k++) for (let i = 0; i < 3; i++) q += SL.accTake(d, DT); between(q, 4, 5, '1.5 s of held steps');
});
test('Soslag: the pool never exceeds 64 in 60 s of two-boat fire, and recycles the oldest jet when forced to 8', () => {
  const wind = { dir: 0, speed: 9 }, pool = SL.createPool(), a = fakeBoat({ heading: 0 }), b = fakeBoat({ x: 3, y: 5, heading: Math.PI }); let maxLive = 0;
  for (let i = 0; i < 3600; i++) {
    for (const [sh, az] of [[a, Math.PI], [b, 0]]) for (let k = SL.accTake(sh, DT); k > 0; k--) SL.launch(pool, sh, az, R(30), sh);
    SL.stepPool(pool, wind, DT); maxLive = Math.max(maxLive, pool.n);
  }
  ok(maxLive <= SL.CFG.MAX_JETS && maxLive > 20, 'peak live jets ' + maxLive);
  const p8 = SL.createPool(8), sh = fakeBoat({ heading: 0 });
  for (let i = 0; i < 20; i++) { const j = SL.launch(p8, sh, 0, R(30), sh); eq(j.seq, i + 1); }
  eq(p8.n, 8, 'pool stays at 8'); eq(Math.min(...p8.jets.map(j => j.seq)), 13, 'the oldest were recycled (seq 13..20 left)'); eq(p8.jets.length, 8, 'never allocated');
});
test('Soslag: one gun, one stream per boat (a single nozzle spot, a gap-free train of jets, at most one nozzle-connected stream, a tail after the release)', () => {
  const wind = { dir: 0, speed: 9 }, pool = SL.createPool(), a = fakeBoat({ heading: 0 }), b = fakeBoat({ x: 3, y: 12, heading: Math.PI });
  const buf = [], spots = new Set();
  let maxA = 0, maxB = 0, maxRunsA = 0, tailSeen = false;
  const check = (t) => {
    maxA = Math.max(maxA, SL.activeStreams(pool, a, buf)); maxB = Math.max(maxB, SL.activeStreams(pool, b, buf));
    const n = SL.streamJets(pool, a, buf); let runs = 0; for (let i = 0; i < n; i = SL.streamRunEnd(buf, n, i)) runs++;
    maxRunsA = Math.max(maxRunsA, runs);
    for (let i = 1; i < n; i++) if (buf[i].age < buf[i - 1].age) throw new Error('streamJets not sorted newest first');
    return n;
  };
  for (let i = 0; i < 300; i++) { // 5 s: a fires continuously, b fires the first 2 s only
    for (let k = SL.accTake(a, DT); k > 0; k--) { const j = SL.launch(pool, a, Math.PI, R(25), a); spots.add(j.px.toFixed(3) + ',' + j.py.toFixed(3)); }
    if (i < 120) for (let k = SL.accTake(b, DT); k > 0; k--) SL.launch(pool, b, 0, R(25), b);
    SL.stepPool(pool, wind, DT); check();
  }
  eq(spots.size, 1, 'all jets of boat a leave the one gun spot (the boat is still)');
  eq(maxA, 1, 'a never has more than one connected stream'); eq(maxB, 1, 'b never has more than one connected stream');
  eq(maxRunsA, 1, 'a held burst is ONE gap-free train of jets (no parallel streams)');
  // after b stopped firing (2 s), its water falls as a spent tail: not connected to the nozzle any more, nothing new is launched
  for (let i = 0; i < 20; i++) { SL.stepPool(pool, wind, DT); }
  const nb = SL.streamJets(pool, b, buf); eq(SL.activeStreams(pool, b, buf), 0, 'b: a released gun has no connected stream');
  ok(nb === 0 || !SL.streamLive(buf, nb), 'b: the rest is a falling tail');
  // two bursts with a pause in between: the old water is a separate run (tail), the new burst is the single connected stream
  const pool2 = SL.createPool(), c = fakeBoat({ heading: 0 }); let runs2 = 0;
  for (let i = 0; i < 90; i++) { if (i < 30 || i >= 60) for (let k = SL.accTake(c, DT); k > 0; k--) SL.launch(pool2, c, Math.PI, R(25), c); else SL.resetFire(c); SL.stepPool(pool2, wind, DT); }
  const nc = SL.streamJets(pool2, c, buf); for (let i = 0; i < nc; i = SL.streamRunEnd(buf, nc, i)) runs2++;
  eq(SL.activeStreams(pool2, c, buf), 1, 'second burst: one connected stream'); eq(runs2, 2, 'old burst is a separate falling tail');
  eq(c.gunAz, Math.PI, 'the barrel remembers the last azimuth');
});
test('Soslag: tank maths (cost 1.8, passive 7/s, dip 20/s only below 1.2 m/s and not in a penalty, nothing while firing, hysteresis at 10)', () => {
  const b = { tank: 100, speed: 3 }; SL.spend(b, 10); near(b.tank, 82, 1e-9, 'cost');
  b.tank = 50; for (let i = 0; i < 60; i++) SL.tankStep(b, DT); near(b.tank, 57, 0.01, 'passive 7/s'); b.tank = 50; for (let i = 0; i < 60; i++) SL.tankStep(b, DT, true); near(b.tank, 50, 0.01, 'no refill while firing');
  b.tank = 50; b.speed = 1.1; for (let i = 0; i < 60; i++) SL.tankStep(b, DT); near(b.tank, 70, 0.01, 'dip 20/s');
  b.tank = 50; b.speed = 1.3; for (let i = 0; i < 60; i++) SL.tankStep(b, DT); near(b.tank, 57, 0.01, 'above 1.2 m/s no dip');
  b.tank = 50; b.speed = 0.5; b.pen = { turns: 1 }; for (let i = 0; i < 60; i++) SL.tankStep(b, DT); near(b.tank, 57, 0.01, 'no dip in a penalty');
  const h = { tank: 3 }; ok(SL.gunReady(h), '3 units: ready'); SL.spend(h, 2); ok(!SL.gunReady(h), 'empty: grey'); h.tank = 9.9; ok(!SL.gunReady(h), '9.9: still grey'); h.tank = 10; ok(SL.gunReady(h), '10: ready again');
  const f = { tank: 0, speed: 3 }; let t = 0; while (f.tank < 100) { SL.tankStep(f, DT); t += DT; } between(t, 14.1, 14.5, 'from empty 14.3 s passively');
  const g = { tank: 100, speed: 3 }; let n = 0; while (SL.gunReady(g)) { g.tank -= 0; SL.spend(g, 1); n++; } between(n * SL.CFG.RATE_DT, 6, 8, 'a full tank lasts 6-8 s of continuous fire');
});
test('Soslag: wet gain (CFG.WET_GAIN) per hit, clamped at 100', () => {
  near(SL.wetGain(10, 1), 10 + SL.CFG.WET_GAIN, 1e-9); eq(SL.wetGain(99.9, 1), 100); let w = 0; for (let i = 0; i < 400; i++) w = SL.wetGain(w, 1); eq(w, 100);
});
test('Soslag: draw / knock-out / clock edge cases and the 5-point rule', () => {
  eq(SL.endCheck(100, 100, false).outcome, 'draw', 'both 100 in one step'); eq(SL.endCheck(100, 100, true).outcome, 'draw');
  let r = SL.endCheck(40, 100, true); eq(r.outcome, 'win', '100 on the clock step: the 100 % rule decides'); eq(r.why, 'soaked');
  r = SL.endCheck(100, 90, true); eq(r.outcome, 'lose'); eq(r.why, 'soakedMe');
  eq(SL.endCheck(50, 60, false), null, 'duel goes on');
  eq(SL.endCheck(50, 54.9, true).outcome, 'draw', '4.9 apart'); eq(SL.endCheck(50, 55, true).outcome, 'win', '5.0 apart'); eq(SL.endCheck(55, 50, true).outcome, 'lose');
  eq(SL.endCheck(50, 45, true).outcome, 'lose'); eq(SL.endCheck(50.1, 45.2, true).outcome, 'draw');
});
test('Soslag: stars table (idle 0, lost 1, draw 1, win 2, win by 15 with 1 foul 3, win by 20 with 2 fouls 2) and score', () => {
  const st = (fired, w, fouls) => SL.stars({ fired, outcome: w.outcome, diff: w.diff, fouls });
  const win = d => ({ outcome: 'win', diff: d });
  eq(st(19, win(30), 0), 0, 'idle'); eq(st(20, { outcome: 'lose', diff: -10 }, 0), 1); eq(st(60, { outcome: 'draw', diff: 2 }, 0), 1);
  eq(st(60, win(6), 0), 2); eq(st(60, win(15), 1), 3); eq(st(60, win(14.9), 0), 2); eq(st(60, win(20), 2), 2);
  eq(SL.score(60, 30, 1), Math.round(600 + 210 - 50)); eq(SL.score(0, 100, 20), 0);
});
test('Soslag: station() is to windward of the opponent, 9..16 m, on the requested side', () => {
  for (const wd of [0, 90, 200, 240]) for (const side of [1, -1]) {
    const opp = { x: 30, y: -10 }, s = SL.station(opp, R(wd), 9, side);
    ok(Math.abs(U.wrapPi(U.bearing(opp, s) - R(wd))) < R(60), 'within the windward sector'); between(U.dist(opp, s), 9, 16, 'distance');
  }
  const a = SL.station({ x: 0, y: 0 }, 0, 9, 1), b = SL.station({ x: 0, y: 0 }, 0, 9, -1); ok(a.x > 0 && b.x < 0, 'sides');
});
test('Soslag: deterministic (the same seed gives the same hit count)', () => {
  const run = seed => {
    const rand = U.rng(seed), wind = { dir: R(240), speed: 9 }, sh = fakeBoat({ heading: R(90) }), tg = fakeBoat({ x: 8, y: 6, heading: R(90) }); let hits = 0;
    for (let n = 0; n < 150; n++) {
      const a = SL.solveAim(sh, tg, wind, { sigma: R(5), sigmaEl: R(3), rand }), j = SL.launch(null, sh, a.az, a.el); let r = 0;
      while (!r) { r = SL.stepJet(j, wind, DT); if (SL.hitTest(j, tg) === 'crew') { hits++; break; } }
    }
    return hits;
  };
  eq(run(7), run(7)); ok(run(7) > 0 && run(7) < 150, 'some hit, some miss: ' + run(7));
});
// Headless duel: the player boat holds a fixed course, the AI is the only helm and sails to the windward station (4 Hz {target} plan, as the mode does).
function holdCourse(b, hd, c) { // a fixed-course "player": steer to a fixed heading, auto sheet
  c.autoTrim = true; c.autoHike = true; c.rudder = U.clamp(U.angDiff(b.heading, hd) * 2.5 - (b.yawRate || 0) * 1.2, -1, 1); return c;
}
test('Soslag: duel sim, 20 seeds: AI within 25 m from 30 s (>= 95 %), windward in >= 60 % of samples, never idles', () => {
  const wd = R(240), right = U.vec(wd + Math.PI / 2);
  let minWind = 1, sumWind = 0, minNear = 1; const dists = [];
  for (let seed = 1; seed <= 20; seed++) {
    const wind = KOS.Wind.create({ dir: wd, speed: 9, gust: 0.4, shift: 0.25, seed }), rnd = U.rng(seed * 13);
    for (let i = 0; i < 240; i++) wind.update(0.5);
    const hd = U.wrapPi([wd - Math.PI / 2, wd + Math.PI / 2, wd - R(110), wd + R(110)][seed % 4]); // a fixed course: beam or broad reach, either tack
    const me = P.createBoat('hboat', { x: 0, y: 0, heading: hd, speed: 2.5, isPlayer: true });
    const ab = U.vec(hd, 45), opp = P.createBoat('hboat', { x: ab.x, y: ab.y, heading: hd, speed: 2.5 }); // 45 m ahead on the same course (the mode's start: a line across the wind, both heading along it)
    const fsk = KOS.AI.fleetSkill({}, 'normal', 0), skill = U.clamp(U.lerp(fsk.lo, fsk.hi, 0.5) + 0.04 + 0.04 * (rnd() - 0.5), 0.05, 0.98); // as the mode: mid fleet skill + 0.04
    opp.helm = KOS.AI.createHelm(opp, { skill, aggression: 0.5, seed: seed * 31 + 1 }); opp.pace = KOS.AI.paceFor(skill, fsk);
    const env = { wind, t: 0, assist: 'normal' }, mc = P.controls(); let side = 1, jit = 1.5, samples = 0, near25 = 0, wnd = 0, idle = 0;
    for (let k = 0; k < 60 * 120; k++) {
      env.t += DT; wind.update(DT);
      P.step(me, holdCourse(me, hd, mc), env, DT);
      if (k % 15 === 0 || opp.helm.finished) {
        const sd = (opp.x - me.x) * right.x + (opp.y - me.y) * right.y; if (Math.abs(sd) > 4) side = sd > 0 ? 1 : -1; jit = -jit || 1.5;
        const s = SL.station(me, wd, 9, side, 5); // the windward station aimed 5 s ahead of the moving opponent (the mode's LEAD_S 3 is too short for a runaway reach: 3 -> 58 % within 25 m)
        opp.plan = { target: { x: s.x + right.x * jit, y: s.y + right.y * jit, r: 0.5 }, mode: 'race' };
      }
      const oc = opp.helm.think(env, opp.plan, [me, opp]); if (opp.helm.finished) idle++; // still finished after the replan: it would idle
      P.step(opp, oc, env, DT);
      P.collide([me, opp], null, []);
      if (k % 60 === 0 && env.t >= 30) {
        samples++; const d = U.dist(me, opp); dists.push(d); if (d <= 25) near25++;
        if (Math.abs(U.wrapPi(U.bearing(me, opp) - wd)) < R(60)) wnd++;
      }
    }
    minWind = Math.min(minWind, wnd / samples); sumWind += wnd / samples; minNear = Math.min(minNear, near25 / samples);
    if (idle || near25 / samples < 0.95 || wnd / samples < 0.6) throw new Error(`seed ${seed}: idle steps ${idle}, within 25 m ${(near25 / samples * 100).toFixed(0)} %, windward ${(wnd / samples * 100).toFixed(0)} %`);
  }
  dists.sort((a, b) => a - b);
  if (only) console.log(`\n  soslag windward% min/mean ${(minWind * 100).toFixed(0)}/${(sumWind / 20 * 100).toFixed(0)}  within25 min ${(minNear * 100).toFixed(0)}  dist p95 ${dists[Math.floor(dists.length * 0.95)].toFixed(1)}`);
});

// ====================================================================== summary
console.log('\n');
if (failures.length) console.log('FAILURES:\n  ' + failures.join('\n  '));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
