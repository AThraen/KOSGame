'use strict';

// Self-test for server/lib/limits.js and server/lib/status.js
// Run: node tools/test-live-lib-a.js   (prints 'ok' lines; exits 1 on failure)

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createBucket, createConnCounter, createDropTracker } = require('../server/lib/limits.js');
const { parseStatus, createStatus } = require('../server/lib/status.js');

let pass = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
  pass++;
  console.log('ok ' + msg);
}

// ---------------------------------------------------------------- bucket (fake clock)
{
  let t = 0;
  const b = createBucket({ rate: 10, burst: 3, now: () => t });
  ok(b.take() === true, 'bucket: take 1 of burst 3');
  ok(b.take() === true, 'bucket: take 2 of burst 3');
  ok(b.take() === true, 'bucket: take 3 of burst 3');
  ok(b.take() === false, 'bucket: 4th take fails (empty)');
  t += 500; // 0.5s * 10/s = 5 tokens, capped at burst 3
  ok(b.take(3) === true, 'bucket: refills to cap after 0.5s');
  ok(b.take() === false, 'bucket: empty again after taking 3');
  t += 100; // 1 token
  ok(b.take(1) === true, 'bucket: 1 token after 100ms');
  ok(b.take(1) === false, 'bucket: empty after that');
  t += 100000; // huge jump still capped at burst
  ok(b.take(3) === true && b.take() === false, 'bucket: refill capped at burst');
}

// ---------------------------------------------------------------- conn counter
{
  const cc = createConnCounter({ maxTotal: 3, maxPerIp: 2 });
  ok(cc.add('a') === true, 'conn: add a1');
  ok(cc.add('a') === true, 'conn: add a2');
  ok(cc.add('a') === false, 'conn: per-ip limit blocks a3');
  ok(cc.add('b') === true, 'conn: add b (total now 3)');
  ok(cc.add('c') === false, 'conn: total limit blocks c');
  ok(cc.add('d') === false, 'conn: total limit blocks d');
  ok(cc.total() === 3, 'conn: total is 3');
  ok(cc.perIp('a') === 2, 'conn: perIp(a) is 2');
  cc.remove('a');
  ok(cc.perIp('a') === 1 && cc.total() === 2, 'conn: remove decrements');
  cc.remove('a');
  cc.remove('a'); // extra removes must not go below 0
  ok(cc.perIp('a') === 0, 'conn: perIp never below 0');
  ok(cc.total() === 1, 'conn: total never below 0');
  ok(cc.add('c') === true, 'conn: freed slot accepted');
  ok(cc.total() === 2, 'conn: total after re-add');
}

// ---------------------------------------------------------------- drop tracker
{
  let t = 0;
  const dt = createDropTracker({ limit: 3, windowMs: 1000, now: () => t });
  ok(dt.drop() === false, 'drop: 1 < limit');
  ok(dt.drop() === false, 'drop: 2 < limit');
  ok(dt.drop() === true, 'drop: 3 >= limit');
  t += 500;
  ok(dt.drop() === true, 'drop: 4th within window');
  t += 600; // t=1100; drops at 0,0,0,500,1100 -> only 500 and 1100 inside window
  ok(dt.drop() === false, 'drop: old drops fall out of window');
}

// ---------------------------------------------------------------- parseStatus
{
  const h = parseStatus(null);
  ok(h.mode === 'hidden' && h.message === '' && h.maxRooms === null && h.maxPlayers === null, 'parse: null => hidden');
  ok(parseStatus(undefined).mode === 'hidden', 'parse: undefined => hidden');
  ok(parseStatus('').mode === 'hidden', 'parse: empty => hidden');
  ok(parseStatus('   ').mode === 'hidden', 'parse: whitespace => hidden');
  ok(parseStatus('not json at all').mode === 'hidden', 'parse: invalid JSON => hidden');
  ok(parseStatus('["on"]').mode === 'hidden', 'parse: array => hidden');
  ok(parseStatus('42').mode === 'hidden', 'parse: non-object JSON => hidden');
  ok(parseStatus('{"mode":"weird"}').mode === 'hidden', 'parse: unknown mode => hidden');
  ok(parseStatus('{"mode":"ON"}').mode === 'hidden', 'parse: mode is case-sensitive');

  const on = parseStatus('{"mode":"on","message":"hello","maxRooms":40,"maxPlayers":24}');
  ok(on.mode === 'on' && on.message === 'hello' && on.maxRooms === 40 && on.maxPlayers === 24, 'parse: valid on');
  const closed = parseStatus('{"mode":"closed","message":"bye"}');
  ok(closed.mode === 'closed' && closed.message === 'bye' && closed.maxRooms === null && closed.maxPlayers === null, 'parse: valid closed, missing ints => null');
  ok(parseStatus('{"mode":"hidden"}').mode === 'hidden', 'parse: explicit hidden');

  const long = parseStatus('{"mode":"on","message":"' + 'x'.repeat(300) + '"}');
  ok(long.message.length === 200, 'parse: message capped to 200');
  const ctrl = parseStatus('{"mode":"on","message":"a\\n\\u0000\\tb"}');
  ok(ctrl.message === 'ab', 'parse: control chars removed');
  const ints = parseStatus('{"mode":"on","maxRooms":4.7,"maxPlayers":"24","maxRooms2":null}');
  ok(ints.maxRooms === 4, 'parse: maxRooms floored');
  ok(ints.maxPlayers === null, 'parse: non-numeric maxPlayers => null');
  ok(parseStatus('{"mode":"on","maxRooms":-5}').maxRooms === null, 'parse: negative => null');
  ok(parseStatus('{"mode":"on","maxRooms":0}').maxRooms === null, 'parse: zero => null');
}

// ---------------------------------------------------------------- createStatus (temp file)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-live-status-'));
  const file = path.join(dir, 'status.json');
  fs.writeFileSync(file, JSON.stringify({ mode: 'on', message: 'live', maxRooms: 40, maxPlayers: 24 }));

  let calls = 0;
  let last = null;
  const st = createStatus({ file, pollMs: 60000, onChange: s => { calls++; last = s; } });
  st.start();
  ok(st.current().mode === 'on', 'status: start reads on');
  ok(st.current().maxRooms === 40 && st.current().maxPlayers === 24, 'status: start reads ints');
  ok(calls === 0, 'status: no onChange on start');

  fs.writeFileSync(file, JSON.stringify({ mode: 'closed', message: 'bye' }));
  st.reload();
  ok(calls === 1, 'status: onChange fired once after rewrite');
  ok(last && last.mode === 'closed' && last.message === 'bye', 'status: onChange got new status');
  ok(st.current().mode === 'closed', 'status: current is closed');

  st.reload();
  ok(calls === 1, 'status: no onChange when unchanged');

  fs.unlinkSync(file);
  st.reload();
  ok(st.current().mode === 'hidden', 'status: deleted file => hidden');
  ok(calls === 2, 'status: onChange fired for hidden');

  st.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- createStatus (falsy file)
{
  let calls = 0;
  const st = createStatus({ file: null, pollMs: 60000, onChange: () => calls++ });
  st.start();
  ok(st.current().mode === 'hidden', 'status: falsy file stays hidden');
  st.reload();
  ok(calls === 0, 'status: falsy file never fires onChange');
  st.stop();
}

console.log('all ' + pass + ' checks passed');
