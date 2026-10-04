// Node tests for the simulation core: node tools/test-core.js
// Covers KOS.U, KOS.Events, KOS.Boats, KOS.Wind, KOS.Physics, KOS.Rules, KOS.AI (and KOS.World helpers if present).
const KOS = require('./harness').load();
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
  const wind = KOS.Wind.steady(0, 22);
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
test('AI: RIB motors to waypoints and keeps clear of sail', () => {
  const r = raceCourse('rib', 0.7, 8);
  ok(r.helm.finished && r.helm.state === 'finished');
});

// ====================================================================== summary
console.log('\n');
if (failures.length) console.log('FAILURES:\n  ' + failures.join('\n  '));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
