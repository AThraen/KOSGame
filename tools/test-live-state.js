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

console.log('livestate: ' + checks + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
