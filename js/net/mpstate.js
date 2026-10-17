// KØS SEJL — js/net/mpstate.js
// Multiplayer state: clock sampling, state pack/unpack, and a jitter-aware state buffer.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  const TAU = 2 * Math.PI;

  // Wrap an angle (radians) into (-PI, PI].
  function wrapAngle(h) {
    let w = (h + Math.PI) % TAU;
    if (w < 0) w += TAU;
    w -= Math.PI; // now in [-PI, PI)
    if (w <= -Math.PI) w += TAU; // map -PI to PI
    return w;
  }

  // Non-finite numbers become 0.
  function num(v) {
    return Number.isFinite(v) ? v : 0;
  }

  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;

  // c0 client send time ms, c1 client receive time ms, s server time ms.
  function clockSample(c0, c1, s) {
    return { rtt: c1 - c0, offset: s + (c1 - c0) / 2 - c1 };
  }

  // Median of a list of numbers (mean of the middle two for even length).
  function median(values) {
    const s = values.slice().sort((a, b) => a - b);
    const n = s.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // samples = array of {rtt, offset}. Uses the last 8, the 3 lowest rtt, median of their offsets.
  function pickOffset(samples) {
    if (!Array.isArray(samples) || samples.length === 0) return null;
    const last = samples.slice(-8).sort((a, b) => a.rtt - b.rtt); // slice(-8) is already a copy
    const top = last.slice(0, 3);
    return { offset: median(top.map(e => e.offset)), rtt: last[0].rtt };
  }

  // boat: numbers x, y, heading, speed, heel; optional booleans spinnaker, capsized, penalty, hiking;
  // optional rc { finT (finite number = finished), ocs (bool), leg (int) }.
  // Returns [id, seq, x, y, hd, sp, hl, fl, lg].
  function packState(boat, id, seq) {
    const b = boat || {};
    const rc = b.rc || {};
    let fl = 0;
    if (b.spinnaker) fl |= 1;
    if (b.capsized) fl |= 2;
    if (b.penalty) fl |= 4;
    if (Number.isFinite(rc.finT)) fl |= 8;
    if (rc.ocs) fl |= 16;
    if (b.hiking) fl |= 32;
    const lg = Number.isFinite(rc.leg) ? Math.round(rc.leg) : 0;
    return [
      id,
      seq,
      r2(num(b.x)),
      r2(num(b.y)),
      r3(wrapAngle(num(b.heading))),
      r2(num(b.speed)),
      r2(num(b.heel)),
      fl,
      lg
    ];
  }

  // Inverse of packState. null unless arr is an Array of 9 finite numbers.
  function unpackState(arr) {
    if (!Array.isArray(arr) || arr.length !== 9) return null;
    for (let i = 0; i < 9; i++) {
      if (!Number.isFinite(arr[i])) return null;
    }
    const fl = arr[7];
    return {
      id: arr[0],
      seq: arr[1],
      x: arr[2],
      y: arr[3],
      hd: arr[4],
      sp: arr[5],
      hl: arr[6],
      fl: fl,
      lg: arr[8],
      spinnaker: !!(fl & 1),
      capsized: !!(fl & 2),
      penalty: !!(fl & 4),
      finished: !!(fl & 8),
      ocs: !!(fl & 16),
      hiking: !!(fl & 32)
    };
  }

  // Build a plain result object with the unpacked-state field names plus extrapolated/frozen.
  function resultOf(s, extrapolated, frozen) {
    return {
      id: s.id,
      seq: s.seq,
      x: s.x,
      y: s.y,
      hd: s.hd,
      sp: s.sp,
      hl: s.hl,
      fl: s.fl,
      lg: s.lg,
      spinnaker: s.spinnaker,
      capsized: s.capsized,
      penalty: s.penalty,
      finished: s.finished,
      ocs: s.ocs,
      hiking: s.hiking,
      extrapolated: extrapolated,
      frozen: frozen
    };
  }

  class StateBuffer {
    constructor({ size = 8 } = {}) {
      this.size = size;
      this.items = []; // of {t, s}
      this.jitter = 50;
      this.lastRecv = 0;
      this.lastSeq = -1;
    }

    // Accept a state if its seq is newer than the last accepted one.
    add(state, recvMs) {
      if (state.seq <= this.lastSeq) return false;
      const hadPrev = this.lastSeq !== -1; // a previous add was accepted
      const prevRecv = this.lastRecv;
      this.items.push({ t: recvMs, s: state });
      if (this.items.length > this.size) this.items.splice(0, this.items.length - this.size);
      if (hadPrev) {
        const dev = Math.abs((recvMs - prevRecv) - 100);
        this.jitter += 0.1 * (dev - this.jitter);
      }
      this.lastRecv = recvMs;
      this.lastSeq = state.seq;
      return true;
    }

    // Render delay in ms, clamped to [100, 150].
    delay() {
      return Math.min(150, Math.max(100, 100 + 1.5 * this.jitter));
    }

    // Sample the buffered states at renderMs: hold, interpolate, or extrapolate.
    sample(renderMs) {
      const items = this.items;
      if (items.length === 0) return null;
      const first = items[0];
      if (renderMs <= first.t) return resultOf(first.s, false, false);
      const last = items[items.length - 1];
      if (renderMs > last.t) {
        const n = last.s;
        const dtMs = renderMs - last.t;
        const dt = Math.min(dtMs, 250) / 1000;
        const out = resultOf(n, true, dtMs > 250);
        out.x = n.x + Math.cos(n.hd) * n.sp * dt;
        out.y = n.y + Math.sin(n.hd) * n.sp * dt;
        return out;
      }
      let a = null;
      let b = null;
      for (let i = 0; i < items.length - 1; i++) {
        if (items[i].t <= renderMs && renderMs <= items[i + 1].t) {
          a = items[i];
          b = items[i + 1];
          break;
        }
      }
      if (!a || !b) return resultOf(last.s, false, false);
      const span = b.t - a.t;
      const f = span > 0 ? (renderMs - a.t) / span : 0;
      const out = resultOf(a.s, false, false);
      out.x = a.s.x + (b.s.x - a.s.x) * f;
      out.y = a.s.y + (b.s.y - a.s.y) * f;
      out.sp = a.s.sp + (b.s.sp - a.s.sp) * f;
      out.hl = a.s.hl + (b.s.hl - a.s.hl) * f;
      out.hd = a.s.hd + wrapAngle(b.s.hd - a.s.hd) * f;
      return out;
    }

    // True if the buffer is empty or the newest state is older than 3000 ms.
    isLost(nowMs) {
      if (this.items.length === 0) return true;
      return nowMs - this.lastRecv > 3000;
    }
  }

  KOS.MPState = { clockSample, pickOffset, packState, unpackState, Buffer: StateBuffer };
  if (typeof module !== 'undefined' && module.exports) module.exports = KOS.MPState;
})(typeof window !== 'undefined' ? window : globalThis);
