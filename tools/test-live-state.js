// KØS SEJL — live race client state maths tests (suite 'livestate'). Node only.
'use strict';

const M = require('../js/net/mpstate.js');

let fails = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) {
    fails++;
    console.log('  FAIL ' + msg);
  } else {
    console.log('  ok   ' + msg);
  }
}

// (1) clockSample
{
  const cs = M.clockSample(1000, 1100, 5050);
  ok(cs.rtt === 100, 'clockSample rtt is 100');
  ok(cs.offset === 4000, 'clockSample offset is 4000');

  // Asymmetric delay: request 20 ms, reply 80 ms. True offset 4000, so the
  // server receives at real server time 5020 (client clock 1020); client
  // sends at 1000 and receives at 1100.
  const cs2 = M.clockSample(1000, 1100, 5020);
  const error = 4000 - cs2.offset;
  ok(Math.abs(error - 30) < 1e-9, 'asymmetric delay error is 30 (half of 80-20)');
}

// (2) pickOffset
{
  ok(M.pickOffset([]) === null, 'pickOffset([]) is null');
  ok(M.pickOffset(null) === null, 'pickOffset(null) is null');
  ok(M.pickOffset(5) === null, 'pickOffset(5) is null');

  const samples = [90, 80, 70, 60, 50, 40, 30, 20, 10, 5].map(rtt => ({ rtt: rtt, offset: 1000 + rtt }));
  const p = M.pickOffset(samples);
  ok(p !== null, 'pickOffset returns an object for 10 samples');
  ok(p.offset === 1010, 'pickOffset offset is 1010 (median of 3 lowest rtt of last 8)');
  ok(p.rtt === 5, 'pickOffset rtt is 5');
}

// (3) packState / unpackState
{
  const boat = {
    x: 12.3456,
    y: -7.891,
    heading: 4,
    speed: 3.14159,
    heel: 0.123,
    spinnaker: true,
    rc: { finT: 12, leg: 3 }
  };
  const u = M.unpackState(M.packState(boat, 5, 9));
  ok(u !== null, 'round trip unpacks');
  ok(u.id === 5 && u.seq === 9, 'round trip id 5, seq 9');
  ok(u.x === 12.35, 'round trip x is 12.35');
  ok(u.y === -7.89, 'round trip y is -7.89');
  ok(Math.abs(u.hd - (4 - 2 * Math.PI)) < 0.001, 'round trip hd within 0.001 of 4-2*PI');
  ok(u.sp === 3.14, 'round trip sp is 3.14');
  ok(u.hl === 0.12, 'round trip hl is 0.12');
  ok(u.lg === 3, 'round trip lg is 3');
  ok(u.spinnaker === true, 'round trip spinnaker true');
  ok(u.finished === true, 'round trip finished true');
  ok(u.capsized === false, 'round trip capsized false');

  ok(M.unpackState(M.packState({ spinnaker: true }, 1, 1)).fl === 1, 'flag bit spinnaker is 1');
  ok(M.unpackState(M.packState({ capsized: true }, 1, 1)).fl === 2, 'flag bit capsized is 2');
  ok(M.unpackState(M.packState({ penalty: true }, 1, 1)).fl === 4, 'flag bit penalty is 4');
  ok(M.unpackState(M.packState({ rc: { finT: 12 } }, 1, 1)).fl === 8, 'flag bit finished is 8');
  ok(M.unpackState(M.packState({ rc: { ocs: true } }, 1, 1)).fl === 16, 'flag bit ocs is 16');
  ok(M.unpackState(M.packState({ hiking: true }, 1, 1)).fl === 32, 'flag bit hiking is 32');

  ok(M.unpackState(M.packState({ x: NaN }, 1, 1)).x === 0, 'non-finite x becomes 0');
  ok(M.unpackState(M.packState({ x: Infinity }, 1, 1)).x === 0, 'infinite x becomes 0');

  ok(M.unpackState([1, 2, 3, 4, 5, 6, 7, 8]) === null, 'unpackState null for length 8');
  ok(M.unpackState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) === null, 'unpackState null for length 10');
  ok(M.unpackState([1, 2, 3, 4, 5, 6, 7, 8, NaN]) === null, 'unpackState null for NaN entry');
  ok(M.unpackState([1, 2, 3, 4, 5, 6, 7, 8, '9']) === null, 'unpackState null for string entry');
  ok(M.unpackState(null) === null, 'unpackState null for null');
  ok(M.unpackState({}) === null, 'unpackState null for object');
  ok(M.unpackState(undefined) === null, 'unpackState null for undefined');
}

// (4) StateBuffer
{
  const mk = (id, seq, x, y, hd, sp, hl, fl, lg) => M.unpackState([id, seq, x, y, hd, sp, hl, fl, lg]);

  const empty = new M.Buffer();
  ok(empty.sample(0) === null, 'empty buffer sample is null');
  ok(empty.isLost(0) === true, 'empty buffer isLost true');
  ok(empty.delay() >= 100 && empty.delay() <= 150, 'fresh buffer delay within [100,150]');

  const buf = new M.Buffer();
  ok(buf.add(mk(1, 1, 0, 0, 0, 2, 0, 0, 0), 0) === true, 'first add accepted');
  ok(buf.add(mk(1, 1, 0, 0, 0, 2, 0, 0, 0), 100) === false, 'duplicate seq rejected');
  ok(buf.add(mk(1, 0, 0, 0, 0, 2, 0, 0, 0), 200) === false, 'older seq rejected');
  ok(buf.add(mk(1, 2, 10, 0, 0, 2, 0, 0, 0), 100) === true, 'newer seq accepted');

  const s = buf.sample(50);
  ok(Math.abs(s.x - 5) < 1e-9, 'interpolated x is 5 at t=50');
  ok(s.extrapolated === false && s.frozen === false, 'interpolated sample not extrapolated/frozen');

  const hbuf = new M.Buffer();
  hbuf.add(mk(1, 1, 0, 0, 3.1, 0, 0, 0, 0), 0);
  hbuf.add(mk(1, 2, 0, 0, -3.1, 0, 0, 0, 0), 100);
  const hs = hbuf.sample(50);
  ok(Math.abs(Math.abs(hs.hd) - Math.PI) < 0.05, 'heading wrap midpoint within 0.05 of PI');

  const ebuf = new M.Buffer();
  ebuf.add(mk(1, 1, 10, 0, Math.PI / 2, 4, 0, 0, 0), 100);
  const e1 = ebuf.sample(200);
  ok(e1.extrapolated === true && e1.frozen === false, 'sample(200) extrapolated, not frozen');
  ok(Math.abs(e1.x - 10.4) < 1e-6, 'sample(200) x within 1e-6 of 10.4');
  const e2 = ebuf.sample(400);
  ok(e2.frozen === true, 'sample(400) frozen');
  ok(Math.abs(e2.x - 11) < 1e-6, 'sample(400) x within 1e-6 of 11 (250 ms cap)');
  const e3 = ebuf.sample(0);
  ok(e3.x === 10 && e3.extrapolated === false && e3.frozen === false, 'sample before first entry returns first state');

  ok(ebuf.isLost(2000) === false, 'isLost(2000) false after add at t=100');
  ok(ebuf.isLost(3200) === true, 'isLost(3200) true after add at t=100');

  const cbuf = new M.Buffer();
  for (let i = 1; i <= 12; i++) cbuf.add(mk(1, i, 0, 0, 0, 1, 0, 0, 0), i * 100);
  ok(cbuf.items.length === 8, 'size cap 8 after adding 12 states');

  const dbuf = new M.Buffer();
  const times = [0, 5000, 100, 9000, 200, 12000, 300, 1500, 400, 20000, 500, 2500];
  let delayOk = true;
  for (let i = 0; i < times.length; i++) {
    dbuf.add(mk(1, i + 1, 0, 0, 0, 1, 0, 0, 0), times[i]);
    const d = dbuf.delay();
    if (d < 100 || d > 150) delayOk = false;
  }
  ok(delayOk, 'delay within [100,150] after wildly varying receive times');
}

// (5) stamped states: the sender's server-time stamp (seq) keys the buffer, so receive jitter / bunching do not move the boat
{
  const st = M.stamp(1.7e12 + 0.4, 0); ok(st === 1700000000000 && M.stamp(5, st) === st + 1, 'stamp() is server ms and strictly increasing');
  ok(M.unpackState(M.packState({ x: 1, y: 2, heading: 0, speed: 1, heel: 0 }, 3, st)).ts === st, 'a stamped seq unpacks as ts');
  ok(M.unpackState(M.packState({ x: 1, y: 2, heading: 0, speed: 1, heel: 0 }, 3, 41)).ts === 0, 'an old client counter has no ts');
  // sender: 5 m/s, turning at 0.3 rad/s from t=0; truth(t) by integration. Viewer receives each state with lag 20-250 ms (bursts of bunched
  // deliveries on top) and draws buf.view(now) at 60 Hz; the drawn boat must stay within about a boat length (4.2 m) of the truth.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function run(lagMin, lagMax, bunch) {
    const T = 1.7e12, truth = []; let x = 0, y = 0, hd = 0;
    for (let i = 0; i <= 60 * 60; i++) { truth.push({ x, y, hd }); hd += 0.3 / 60 * (Math.floor(i / 600) % 2 ? -1 : 1); x += Math.sin(hd) * 5 / 60; y -= Math.cos(hd) * 5 / 60; }
    const inbox = []; let pos = 0; const b = new M.Buffer(); let seq = 0, errs = [], hold = 0;
    for (let i = 0; i < truth.length; i++) {
      const t = i * 1000 / 60;
      if (i % 6 === 0) { const q = truth[i]; const s = M.unpackState(M.packState({ x: q.x, y: q.y, heading: q.hd, speed: 5, heel: 0 }, 1, seq = M.stamp(T + t, seq))); inbox.push({ at: t + lagMin + rnd() * (lagMax - lagMin), s }); }
      if (bunch && i % 600 === 0) hold = t + 700; // a stall: everything queued is delivered together afterwards
      inbox.sort((p, q) => p.at - q.at);
      while (inbox.length && inbox[0].at <= Math.max(t, 0) && !(hold > t && bunch)) { const m = inbox.shift(); b.add(m.s, T + Math.max(t, hold)); }
      const v = b.view(T + t);
      if (v && i > 120) errs.push(Math.hypot(v.x - truth[i].x, v.y - truth[i].y));
    }
    errs.sort((p, q) => p - q);
    return { mean: errs.reduce((p, q) => p + q, 0) / errs.length, p95: errs[Math.floor(errs.length * 0.95)], max: errs[errs.length - 1] };
  }
  const r0 = run(10, 30, false), r1 = run(20, 140, false), r2 = run(125 - 60, 125 + 60, true);
  ok(r0.mean < 0.8 && r0.max < 2, 'stamped, fast network: mean ' + r0.mean.toFixed(2) + ' m, max ' + r0.max.toFixed(2) + ' m');
  ok(r1.mean < 1.5 && r1.max < 4.2, 'stamped, 20-140 ms: mean ' + r1.mean.toFixed(2) + ' m, max ' + r1.max.toFixed(2) + ' m (< 1 boat length)');
  ok(r2.mean < 3 && r2.max < 8.4, 'stamped, 250 ms RTT jitter + 0.7 s stalls: mean ' + r2.mean.toFixed(2) + ' m, max ' + r2.max.toFixed(2) + ' m (< 2 boat lengths)');
}

// (6) clock sync against a fake socket: skewed local clock, a lucky early low rtt followed by a slower link and a drifting clock
async function clockTests() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const real = () => Date.now();
  let skew = 2000, serverOff = 0, rtt = 2; // local performance.now = real + skew; server clock = real + serverOff
  Object.defineProperty(globalThis, 'performance', { value: { now: () => real() + skew }, configurable: true });
  const sockets = [];
  globalThis.WebSocket = class {
    constructor() { this.readyState = 0; sockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 1); }
    send(d) {
      const m = JSON.parse(d); const half = () => Math.max(0, rtt / 2 + (Math.random() - 0.5) * 6);
      if (m.t === 'hello') setTimeout(() => this.onmessage({ data: JSON.stringify({ t: 'welcome', v: 1, id: 0, now: real() + serverOff, mode: 'on' }) }), half());
      if (m.t === 'ping') setTimeout(() => { const s = real() + serverOff; setTimeout(() => this.readyState === 1 && this.onmessage({ data: JSON.stringify({ t: 'pong', c: m.c, s }) }), half()); }, half());
    }
    close() { this.readyState = 3; }
  };
  const MP = require('../js/net/mp.js');
  const sess = await MP.connect({ url: 'ws://x', name: 'T' });
  await sleep(2200); // 8 fast pings
  const e1 = Math.abs(sess.serverNow() - (real() + serverOff));
  ok(e1 < 15, 'clock sync: a +2 s skewed local clock is corrected (error ' + e1.toFixed(1) + ' ms)');
  rtt = 30; serverOff += 120; // the link got slower AND the clocks drifted apart: the old 1.5 x bestRtt gate would never accept these samples again
  await sleep(10500);
  const e2 = Math.abs(sess.serverNow() - (real() + serverOff));
  ok(e2 < 20, 'clock sync: re-syncs after a drift behind a slower link (error ' + e2.toFixed(1) + ' ms)');
  serverOff += 5000; // the device slept: the estimate is 5 s off
  await sleep(7500);
  const e3 = Math.abs(sess.serverNow() - (real() + serverOff));
  ok(e3 < 20, 'clock sync: a 5 s step is taken over (error ' + e3.toFixed(1) + ' ms)');
  sess.close();
}
clockTests().then(() => {
  console.log('livestate: ' + checks + ' checks, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
});

