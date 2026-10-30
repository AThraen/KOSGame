// KØS SEJL — two phones judge the same contact (suite 'livefoul'). Node only, no server, no browser.
// docs/superpowers/specs/2026-10-30-live-rules-and-race-list-design.md A8 + A10 (ports tools/tmp/rowreview/phones.js D/E).
// Each simulated phone runs what race.js runs: its own boat is the truth, the other boat comes from a KOS.MPState.Buffer (10 Hz states
// with latency, dead-reckoned, rules position without the visual easing, the sender's tack / R13 flags), KOS.Rules.monitor judges
// [me, remote], onFoul's filters (contact, not excused, closing speed >= 0.35 m/s, pair cool-down) decide, and KOS.MPState.FoulLog turns
// the verdict into "take the penalty" or "send {t:'foul'}"; the foul message reaches the other phone with the same latency.
//   1. clear fouls (port/starboard T-bone, windward boat sliding onto a long-overlapped leeward boat): exactly one boat turns, every time
//   2. the review incident D (clear astern, leeward, the boat ahead slows hard): never both, never neither (counts are printed)
//   3. FoulLog: dedupe within 2 s, the lower id decides when both phones blamed the other
//   4. E: a slow T-bone (0.5 m/s) is penalised in live and AI races (closing speed measured before the bump)
//   5. T: a port boat tacks too close under a starboard boat (RRS 13/15): the same boat turns at 0, 150 and 300 ms latency
//   6. a foul message about a boat this phone never saw close by (50 m away) gives no penalty; an excused contact vetoes it
'use strict';

const KOS = require('./harness').load();
const MPS = require('../js/net/mpstate.js');
const U = KOS.U, Ru = KOS.Rules, R = d => d * Math.PI / 180;

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); }

const DT = 1 / 60, T0 = 2e12, LEN = 2.31, BEAM = 1.13;
const boat = (rid, x, y, hd, vx, vy, tack) => ({ id: rid, rid, name: 'B' + rid, x, y, heading: hd, vx, vy, speed: Math.hypot(vx, vy), length: LEN, beam: BEAM, tack, r13: false, _init: true, rc: { leg: 1, pen: null } });

// One phone: what race.js simStep + onFoul + onFoulMsg / applyFoulMsg do for this pair.
function phone(me, otherRid, wind) {
  const P = { me, buf: new MPS.Buffer(), mon: Ru.monitor({ mode: 'race', cooldown: 1, splitContact: true }), flog: new MPS.FoulLog(me.rid, 2000),
    remote: null, cool: {}, myFoulT: 0, pen: 0, out: [], contactT: null, t: 0, near: null, q: [], seen: null };
  P.step = (nowMs, t) => {
    P.t = t;
    const s = P.buf.view(nowMs); if (!s) return;
    const r = P.remote || (P.remote = boat(otherRid, 0, 0, 0, 0, 0, 'port'));
    r.x = s.rx; r.y = s.ry; r.heading = s.hd; r.vx = s.vx; r.vy = s.vy; r.speed = s.sp; r.tack = s.port ? 'port' : 'starboard'; r.r13 = s.r13;
    r.rc.pen = s.penalty ? {} : null; // the sender's penalty flag: a boat taking a penalty keeps clear (R22) and has no right of way
    if (P.buf.isLost(nowMs, 2000)) return;
    for (const f of P.mon.update([me, r], wind, [], DT) || []) {
      if (f.type !== 'foul') continue;
      P.near = t; // onFoul: any close call or contact with the other boat
      if (!f.contact) continue;
      if (P.seen === null) P.seen = (f.excused ? 'ex-' : '') + f.rule + ':' + f.offender.rid;
      if (f.victim.rc.pen) continue;
      if (f.excused) { P.flog.excuse(otherRid, nowMs); continue; }
      if (P.contactT === null) P.contactT = t;
      const a = f.offender, v = f.victim;
      if (Math.hypot(a.vx - v.vx, a.vy - v.vy) < 0.35) continue;
      if (a === me && t < P.myFoulT) continue;
      const key = a.id + '|' + v.id;
      if (P.cool[key] > t) continue;
      const act = P.flog.own((a === me ? v : a).rid, a === me, nowMs);
      if (!act) continue;
      if (act === 'send') P.out.push({ o: a.rid, r: f.rule });
      P.cool[key] = t + 12;
      if (a === me) { P.myFoulT = t + 15; P.pen++; me.rc.pen = {}; }
    }
    while (P.q.length && P.q[0].at <= t) P.apply(P.q.shift().from, nowMs); // applyFoulMsg, TOLD_HOLD after it arrived
  };
  P.recv = (from, nowMs) => { P.q.push({ from, at: P.t + 0.3 }); }; // onFoulMsg: held so our own verdict (an excuse) comes first
  P.apply = (from, nowMs) => {
    const near = (P.near !== null && P.t - P.near <= 2) || (P.remote && Ru.hullGap(me, P.remote) < 0.5 * LEN);
    if (!near) { P.farDropped = (P.farDropped || 0) + 1; return; }
    if (P.remote && P.remote.rc.pen) return;
    if (P.t < P.myFoulT) return;
    if (!P.flog.recv(from, nowMs)) return;
    P.cool[me.id + '|' + from] = P.t + 12; P.myFoulT = P.t + 15; P.pen++; me.rc.pen = {};
  };
  return P;
}

// Two phones, 10 Hz states and foul messages with one-way latency lat ms. move(A, B, t) advances the true boats one step.
function incident(A, B, wind, lat, move, secs) {
  const pa = phone(A, B.rid, wind), pb = phone(B, A.rid, wind);
  const fly = [];
  let acc = 0, sq = 0, end = null;
  for (let i = 0; i * DT < (secs || 5); i++) {
    const t = i * DT, now = T0 + t * 1000;
    move(A, B, t);
    if ((acc += DT) >= 0.1 - 1e-6) {
      acc = 0; sq = MPS.stamp(now, sq);
      for (const [b, to] of [[A, pb], [B, pa]]) fly.push({ at: now + lat, to, st: MPS.packState({ x: b.x, y: b.y, heading: b.heading, speed: b.speed, heel: 0, tack: b.tack, r13: b.r13, penalty: !!b.rc.pen, rc: {} }, b.rid, sq) });
    }
    for (let k = 0; k < fly.length; k++) {
      const m = fly[k]; if (m.at > now) continue;
      if (m.st) m.to.buf.add(MPS.unpackState(m.st), now); else m.to.recv(m.from, now);
      fly.splice(k--, 1);
    }
    pa.step(now, t); pb.step(now, t);
    for (const [p, q] of [[pa, pb], [pb, pa]]) while (p.out.length) { const o = p.out.shift(); fly.push({ at: now + 2 * lat, to: q, from: p.me.rid, r: o.r }); } // phone -> server -> phone
    if (end === null && (pa.seen !== null || pb.seen !== null)) end = t + 1.0; // the bump (not simulated here: the boats would sail through each other) ends the incident; the foul messages land well inside 1 s
    if (end !== null && t > end) break;
  }
  return { contact: pa.contactT !== null || pb.contactT !== null, penA: pa.pen, penB: pb.pen, seenA: pa.seen, seenB: pb.seen, pa, pb };
}
const kin = (A, B) => { for (const b of [A, B]) { b.x += b.vx * DT; b.y += b.vy * DT; b.speed = Math.hypot(b.vx, b.vy); } };
function tallyOf(list) {
  const t = { n: 0, one: 0, both: 0, neither: 0, twice: 0, ex: null };
  for (const r of list) {
    if (!r.contact) continue;
    t.n++;
    const a = r.penA > 0, b = r.penB > 0;
    if (r.penA > 1 || r.penB > 1) t.twice++;
    if (a && b) t.both++; else if (!a && !b) t.neither++; else t.one++;
    if ((a === b) && !t.ex) t.ex = r.label;
  }
  return t;
}

// ---- 1. clear fouls: exactly one boat turns
{
  // wind from the north. A on starboard heading WNW, B on port heading ENE; B's bow hits A's side (R10).
  const runs = [];
  let wrong = 0;
  for (let lat = 60; lat <= 260; lat += 20) for (let off = -0.6; off <= 0.6; off += 0.1) for (const v of [1.0, 1.6, 2.2]) {
    const ha = R(-70), hb = R(70);
    const va = U.vec(ha, v), vb = U.vec(hb, v);
    // both reach the crossing point (0,0) at t = 3 s; off shifts B along its course (its bow hits A's hull ahead / behind the middle)
    const A = boat(1, -va.x * 3, -va.y * 3, ha, va.x, va.y, 'starboard');
    const B = boat(2, -vb.x * (3 + off / v), -vb.y * (3 + off / v), hb, vb.x, vb.y, 'port');
    const r = incident(A, B, 0, lat, kin, 6);
    r.label = 'port/starboard lat ' + lat + ' off ' + off.toFixed(1) + ' v ' + v;
    if (r.contact && !(r.penB === 1 && r.penA === 0)) wrong++;
    runs.push(r);
  }
  const t = tallyOf(runs);
  console.log('  port/starboard: ' + t.n + ' contacts, one boat ' + t.one + ', both ' + t.both + ', neither ' + t.neither + (t.ex ? ' (e.g. ' + t.ex + ')' : ''));
  ok(t.n > 100, 'port/starboard: the sweep produces contacts (' + t.n + ')');
  ok(t.both === 0 && t.neither === 0, 'port/starboard: never both, never neither');
  ok(wrong === 0 && t.twice === 0, 'port/starboard: always the port boat, exactly once');
}
{
  // both on starboard (wind from the north, heading -50), overlapped for 10 s; B to windward slides down onto A (R11)
  const runs = [];
  let wrong = 0;
  for (let lat = 60; lat <= 260; lat += 20) for (const along of [-1.2, -0.6, 0, 0.6, 1.2]) for (const side of [0.4, 0.6, 0.9]) {
    // starboard tack: the wind comes over the right side, so windward is to the right of the heading, leeward to the left
    const h = R(-50), f = U.vec(h, 2.0), toLee = U.vec(h - Math.PI / 2, 1), fw = U.vec(h, 1);
    const A = boat(1, 0, 0, h, f.x, f.y, 'starboard'); // leeward
    const gap = BEAM + 2.5;
    const B = boat(2, -toLee.x * gap + fw.x * along, -toLee.y * gap + fw.y * along, h, f.x + toLee.x * side, f.y + toLee.y * side, 'starboard');
    const r = incident(A, B, 0, lat, kin, 8);
    r.label = 'windward lat ' + lat + ' along ' + along + ' side ' + side;
    if (r.contact && !(r.penB === 1 && r.penA === 0)) wrong++;
    runs.push(r);
  }
  const t = tallyOf(runs);
  console.log('  windward/leeward: ' + t.n + ' contacts, one boat ' + t.one + ', both ' + t.both + ', neither ' + t.neither + (t.ex ? ' (e.g. ' + t.ex + ')' : ''));
  ok(t.n > 100, 'windward/leeward: the sweep produces contacts (' + t.n + ')');
  ok(t.both === 0 && t.neither === 0, 'windward/leeward: never both, never neither');
  ok(wrong === 0 && t.twice === 0, 'windward/leeward: always the windward boat, exactly once');
}

// ---- 2. review incident D: A ahead/windward slows hard; B clear astern/leeward, faster, closing sideways (both port tack, wind -40)
{
  const runs = [];
  for (let lat = 80; lat <= 250; lat += 10) for (let slowAt = 0.3; slowAt <= 1.5; slowAt += 0.05) for (const dx of [0.4, 0.6, 0.8, 1.0, 1.15, 1.25]) {
    const A = boat(1, 0, 0, 0, 0, -2.0, 'port'), B = boat(2, dx, LEN + 0.6, 0, -0.3, -2.5, 'port');
    const move = (a, b, t) => { if (t > slowAt) a.vy = Math.min(-1.0, a.vy + 3.3 * DT); kin(a, b); };
    const r = incident(A, B, R(-40), lat, move, 5);
    r.label = 'D lat ' + lat + ' slowAt ' + slowAt.toFixed(2) + ' dx ' + dx;
    runs.push(r);
  }
  const t = tallyOf(runs);
  console.log('  incident D: ' + t.n + ' contacts, one boat ' + t.one + ', both ' + t.both + ', neither ' + t.neither + ', a boat penalised twice ' + t.twice + (t.ex ? ' (e.g. ' + t.ex + ')' : ''));
  ok(t.n > 1000, 'incident D: the sweep produces contacts (' + t.n + ')');
  ok(t.both === 0, 'incident D: never both boats penalised');
  ok(t.twice === 0, 'incident D: never a second penalty for the same incident');
  ok(t.neither === 0, 'incident D: never neither (without the foul message ~8 % of these contacts went unpunished)');
}

// ---- 3. FoulLog
{
  const a = new MPS.FoulLog(1, 2000), b = new MPS.FoulLog(2, 2000);
  ok(a.own(2, true, 1000) === 'pen' && a.own(2, true, 1500) === null, 'FoulLog: one own penalty per pair within 2 s');
  ok(a.recv(2, 1800) === false, 'FoulLog: a received verdict for the same incident is not a second penalty');
  ok(a.own(2, true, 3100) === 'pen', 'FoulLog: a new incident after 2 s counts again');
  ok(b.own(1, false, 1000) === 'send' && b.own(1, false, 1200) === null, 'FoulLog: the stand-on phone sends once per incident');
  const c = new MPS.FoulLog(3, 2000);
  ok(c.recv(5, 1000) === true && c.own(5, true, 1300) === null && c.own(5, false, 1400) === null, 'FoulLog: penalised by the other phone first: our own later verdict adds nothing and sends nothing');
  const lo = new MPS.FoulLog(1, 2000), hi = new MPS.FoulLog(2, 2000); // both blamed the other
  lo.own(2, false, 1000); hi.own(1, false, 1050);
  ok(lo.recv(2, 1200) === false && hi.recv(1, 1250) === true, 'FoulLog: both blamed the other: the lower id decides on both phones');
}

// ---- 4. E: slow contacts are penalised; the closing speed is taken before the bump
{
  const env = { wind: { dir: 0, speed: 8 }, t: 0 };
  for (const v of [0.5, 0.8, 1.5]) {
    for (const live of [true, false]) {
      const me = KOS.Physics.createBoat('opti', { x: -(0.64 + 1.017 - v / 60), y: 0, heading: R(90), speed: v }); me.vx = v; me.vy = 0;
      const r = KOS.Physics.createBoat('opti', { x: 0, y: 0, heading: 0, speed: 0 }); r.vx = 0; r.vy = 0;
      const sv = { x: r.x, y: r.y, vx: r.vx, vy: r.vy, speed: r.speed, slip: r.slip };
      for (const b of [me, r]) { b.cvx = b.vx; b.cvy = b.vy; } // race.js simStep, before collide
      KOS.Physics.collide([me, r], null, null);
      if (live) Object.assign(r, sv); // bumpRemotes puts the remote copy back
      const after = Math.hypot(me.vx - r.vx, me.vy - r.vy), before = Math.hypot(me.cvx - r.cvx, me.cvy - r.cvy);
      ok(Ru.hullGap(me, r) <= 0.05 && before >= 0.35, (live ? 'live' : 'AI') + ' T-bone at ' + v + ' m/s: penalised (closing ' + before.toFixed(2) + ' m/s before the bump, ' + after.toFixed(2) + ' after)');
    }
  }
}

// ---- 5. T: tack too close (review round 1, tools/tmp/rowreview/phones2.js T). A (rid 1) on starboard sails NW; B (rid 2) on port tacks onto
// starboard near A's bow (0.8 s tack) and they touch. RRS 13/15: B keeps clear while tacking and must give room after it: B turns, at any latency.
{
  const outcome = {}; // geometry -> [penalised boats at 0, 150, 300 ms]
  let both = 0, neither = 0, aPen = 0;
  for (const lat of [0, 150, 300]) for (let px = -1.0; px <= 2.0; px += 0.2) for (let py = 0.5; py <= 3.5; py += 0.2) {
    const hA = R(-45), A = boat(1, 3, 3, hA, 0, 0, 'starboard'), Bb = boat(2, px, py, R(45), 0, 0, 'port');
    if (Ru.hullGap(A, Bb) < 0.3) continue;
    const move = (a, b, t) => {
      if (t >= 0.2 && t < 1.0) { b.r13 = true; b.tack = 'starboard'; b.heading = R(45 - 90 * (t - 0.2) / 0.8); }
      if (t >= 1.0) { b.r13 = false; b.heading = R(-45); }
      for (const [x, v] of [[a, 1.8], [b, t >= 0.2 ? 0.9 : 1.6]]) { const f = U.vec(x.heading, v); x.vx = f.x; x.vy = f.y; }
      kin(a, b);
    };
    const r = incident(A, Bb, 0, lat, move, 5);
    if (!r.contact) continue;
    const who = (r.penA ? 'A' : '') + (r.penB ? 'B' : '') || 'nobody';
    if (who === 'AB') both++; else if (who === 'nobody') neither++; else if (who === 'A') aPen++;
    const k = px.toFixed(1) + ',' + py.toFixed(1);
    (outcome[k] || (outcome[k] = {}))[lat] = who;
  }
  let n = 0, differs = 0, ex = null;
  for (const k in outcome) {
    const o = outcome[k];
    if (!o[0] || !o[150] || !o[300]) continue; // a contact at every latency (dead reckoning can turn a near miss into a touch)
    n++;
    if (o[0] !== o[150] || o[0] !== o[300]) { differs++; if (!ex) ex = k + ' ' + JSON.stringify(o); }
  }
  console.log('  tack too close: ' + n + ' geometries with a contact at 0/150/300 ms, outcome differs in ' + differs + (ex ? ' (e.g. B at ' + ex + ')' : '') + '; both ' + both + ', neither ' + neither + ', A ' + aPen);
  ok(n > 100, 'tack too close: the sweep produces contacts at every latency (' + n + ')');
  ok(differs === 0, 'tack too close: the same boat turns at 0, 150 and 300 ms');
  ok(both === 0 && neither === 0 && aPen === 0, 'tack too close: always the tacking boat, never both, never neither');
}

// ---- 6. a "you fouled me" from a boat this phone never saw close by is dropped; an excused contact vetoes it
{
  const A = boat(1, 0, 0, R(-45), 0, 0, 'starboard'), Bb = boat(2, 50, 0, R(45), 0, 0, 'port');
  const pa = phone(A, 2, 0);
  pa.buf.add(MPS.unpackState(MPS.packState({ x: Bb.x, y: Bb.y, heading: Bb.heading, speed: 0, heel: 0, tack: 'port', rc: {} }, 2, T0)), T0);
  for (let i = 0; i < 6; i++) pa.step(T0 + i * 100, i * 0.1);
  pa.recv(2, T0 + 600);
  for (let i = 6; i < 20; i++) pa.step(T0 + i * 100, i * 0.1);
  ok(pa.pen === 0 && pa.farDropped === 1, 'a foul message about a boat 50 m away gives no penalty');
  const f = new MPS.FoulLog(1, 2000);
  f.excuse(2, 1000);
  ok(f.recv(2, 1500) === false && f.recv(2, 3200) === true, 'FoulLog: our own excuse vetoes the other phone\'s verdict for 2 s');
}

console.log('livefoul: ' + checks + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
