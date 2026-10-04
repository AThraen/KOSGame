// KØS SEJL — js/ui/audio.js
// KOS.Audio: every sound is synthesised with Web Audio (noise buffers, filtered envelopes, FM, additive partials).
// No audio files. Everything is a safe no-op when there is no AudioContext (Node, old browsers, before unlock).
//
//   KOS.Audio.unlock()                         call from a user gesture (auto-installed on first pointer/key)
//   KOS.Audio.play(name, {vol, pitch, pan})    one-shot; names in KOS.Audio.names
//   KOS.Audio.ambient({wind /*kn*/, waves /*0..1*/, harbor /*0..1*/} | null)
//   KOS.Audio.engine(throttle /*-1..1*/ | null) RIB outboard loop (gear clunk on shifting)
//   KOS.Audio.music('menu'|'race'|'calm'|null) gentle generative loops
//   KOS.Audio.setVolume(v), mute(bool), applySettings(settings), setMusic(bool), setSound(bool)
//   KOS.Audio.render(name, opts) → Promise<{peak, rms, dur}> (offline render, for tests)
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  const W = typeof window !== 'undefined' ? window : null;
  const AC = W && (W.AudioContext || W.webkitAudioContext);
  const OAC = W && (W.OfflineAudioContext || W.webkitOfflineAudioContext);
  const rnd = Math.random; // ui layer: Math.random is fine here (core must not use it)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------------------------------------------------------------- state
  let ctx = null, master = null, comp = null, sfxBus = null, ambBus = null, engBus = null, musBus = null;
  let volume = 0.8, muted = false, soundOn = true, musicOn = true;
  let lastPlay = {}, voices = 0;
  const MAX_VOICES = 28;
  let wantAmbient = null, wantEngine = null, wantMusic = null;

  // ---------------------------------------------------------------- tiny helpers (work on any BaseAudioContext)
  const noiseCache = new WeakMap();
  function noiseBuf(c) {
    let b = noiseCache.get(c);
    if (!b) {
      const len = Math.floor(c.sampleRate * 2);
      b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
      noiseCache.set(c, b);
    }
    return b;
  }
  function noise(c, t, dur, dest, rate) {
    const s = c.createBufferSource();
    s.buffer = noiseBuf(c); s.loop = true; s.playbackRate.value = rate || 1;
    s.connect(dest); s.start(t, rnd() * 1.5);
    if (dur != null) s.stop(t + dur + 0.05);
    return s;
  }
  function gain(c, v, dest) { const g = c.createGain(); g.gain.value = v == null ? 1 : v; if (dest) g.connect(dest); return g; }
  function filt(c, type, f, q, dest) {
    const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q;
    if (dest) n.connect(dest); return n;
  }
  function osc(c, type, f, t, dur, dest) {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (dest) o.connect(dest); o.start(t); if (dur != null) o.stop(t + dur + 0.05); return o;
  }
  // attack → hold → exponential release
  function env(g, t, a, peak, hold, rel) {
    const p = g.gain; p.cancelScheduledValues(t); p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    p.setValueAtTime(Math.max(peak, 0.0002), t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    return t + a + hold + rel;
  }
  function eg(c, dest, t, a, peak, hold, rel) { const g = gain(c, 0, dest); env(g, t, a, peak, hold, rel); return g; }
  function sweep(param, t, from, to, dur, lin) {
    param.setValueAtTime(from, t);
    if (lin) param.linearRampToValueAtTime(to, t + dur); else param.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  }
  function panner(c, pan, dest) {
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); p.connect(dest); return p; }
    return dest;
  }

  // ---------------------------------------------------------------- building blocks
  function knock(c, out, t, p, k, f) { // short wooden knock
    const g = eg(c, out, t, 0.001, 0.7 * k, 0, 0.11);
    const bp = filt(c, 'bandpass', (f || 380) * p, 3, g); noise(c, t, 0.15, bp);
  }
  function thump(c, out, t, p, k, f0, f1, len) { // low sine drop
    const g = eg(c, out, t, 0.002, 0.9 * k, 0, len || 0.25);
    const o = osc(c, 'sine', f0 * p, t, (len || 0.25) + 0.05, g);
    o.frequency.exponentialRampToValueAtTime(f1 * p, t + (len || 0.25) * 0.6);
  }
  function boomClunk(c, out, t, p, k) {
    thump(c, out, t, p, k, 150, 52, 0.26);
    knock(c, out, t, p, k, 420);
    const g = eg(c, out, t + 0.004, 0.001, 0.12 * k, 0, 0.09); osc(c, 'triangle', 1150 * p, t, 0.12, g); // shackle rattle
    const g2 = eg(c, out, t + 0.05, 0.001, 0.07 * k, 0, 0.06); osc(c, 'triangle', 1530 * p, t + 0.05, 0.1, g2);
  }
  function flapBurst(c, out, t, p, n, k) {
    let tt = t;
    for (let i = 0; i < n; i++) {
      const g = eg(c, out, tt, 0.004, k * (1 - (i / n) * 0.6), 0.01, 0.05 + rnd() * 0.05);
      const bp = filt(c, 'bandpass', (650 + rnd() * 800) * p, 0.9, g); noise(c, tt, 0.14, bp);
      const lp = eg(c, out, tt, 0.003, k * 0.5, 0, 0.05); const l = filt(c, 'lowpass', 260 * p, 1, lp); noise(c, tt, 0.1, l);
      tt += 0.065 + rnd() * 0.055;
    }
    return tt;
  }
  function whooshAt(c, out, t, p, k, len, panFrom, panTo) {
    const pn = c.createStereoPanner ? c.createStereoPanner() : null;
    const dest = pn || out; if (pn) { pn.connect(out); sweep(pn.pan, t, panFrom || -0.6, panTo || 0.6, len, true); }
    const g = gain(c, 0, dest); env(g, t, len * 0.35, 0.6 * k, 0, len * 0.65);
    const bp = filt(c, 'bandpass', 300 * p, 1.3, g);
    bp.frequency.setValueAtTime(300 * p, t);
    bp.frequency.exponentialRampToValueAtTime(1900 * p, t + len * 0.38);
    bp.frequency.exponentialRampToValueAtTime(450 * p, t + len);
    noise(c, t, len + 0.1, bp);
  }
  function ping(c, out, t, f, amp, dec, type) {
    const g = eg(c, out, t, 0.002, amp, 0, dec); osc(c, type || 'sine', f, t, dec + 0.05, g);
  }
  function bellTone(c, out, t, f, amp, decay) {
    const R = [1, 2.0, 2.42, 3.0, 4.53, 5.38, 6.8], A = [1, 0.55, 0.42, 0.3, 0.2, 0.14, 0.08], D = [1, 0.75, 0.6, 0.5, 0.3, 0.22, 0.15];
    for (let i = 0; i < R.length; i++) ping(c, out, t, f * R[i] * (1 + (rnd() - 0.5) * 0.003), amp * A[i], decay * D[i]);
  }
  function note(c, out, t, f, amp, dec, type, cutoff) { // plucky voice with filter decay
    const g = eg(c, out, t, 0.004, amp, 0, dec);
    const lp = filt(c, 'lowpass', cutoff || 2400, 1.2, g);
    lp.frequency.setValueAtTime(cutoff || 2400, t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + dec);
    osc(c, type || 'triangle', f, t, dec + 0.05, lp);
  }
  function marimba(c, out, t, f, amp, dec) {
    ping(c, out, t, f, amp, dec || 0.55, 'sine');
    ping(c, out, t, f * 3.93, amp * 0.22, (dec || 0.55) * 0.18, 'sine');
    ping(c, out, t, f * 10.2, amp * 0.05, 0.03, 'sine');
  }
  function uke(c, out, t, f, amp) {
    const g = eg(c, out, t, 0.003, amp, 0, 0.55);
    const lp = filt(c, 'lowpass', 3200, 2, g);
    lp.frequency.setValueAtTime(3600, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.3);
    osc(c, 'sawtooth', f, t, 0.6, lp);
    const g2 = eg(c, out, t, 0.002, amp * 0.6, 0, 0.7); osc(c, 'triangle', f, t, 0.75, g2);
  }

  // ---------------------------------------------------------------- one-shot sound library: fn(c, out, t, pitch) → duration
  const S = {
    click(c, o, t, p) {
      const g = eg(c, o, t, 0.002, 0.45, 0, 0.05); const x = osc(c, 'triangle', 1800 * p, t, 0.06, g);
      x.frequency.exponentialRampToValueAtTime(900 * p, t + 0.03);
      const n = eg(c, o, t, 0.001, 0.15, 0, 0.012); noise(c, t, 0.03, filt(c, 'highpass', 4000, 0.7, n));
      return 0.08;
    },
    tap(c, o, t, p) {
      const g = eg(c, o, t, 0.003, 0.45, 0, 0.07); const x = osc(c, 'sine', 720 * p, t, 0.09, g);
      x.frequency.exponentialRampToValueAtTime(480 * p, t + 0.06); return 0.1;
    },
    pop(c, o, t, p) {
      const g = eg(c, o, t, 0.002, 0.55, 0.01, 0.06); const x = osc(c, 'sine', 380 * p, t, 0.1, g);
      x.frequency.exponentialRampToValueAtTime(1500 * p, t + 0.05);
      const n = eg(c, o, t, 0.001, 0.2, 0, 0.015); noise(c, t, 0.03, filt(c, 'bandpass', 2500, 1, n));
      return 0.12;
    },
    whoosh(c, o, t, p) { whooshAt(c, o, t, p, 1, 0.6); return 0.7; },
    tack(c, o, t, p) {
      whooshAt(c, o, t, p, 0.8, 0.55, 0.5, -0.5);
      flapBurst(c, o, t + 0.12, p, 5, 0.35);
      boomClunk(c, o, t + 0.42, p, 0.55);
      return 1.0;
    },
    gybe(c, o, t, p) {
      whooshAt(c, o, t, p * 0.9, 1.1, 0.38, -0.7, 0.7);
      boomClunk(c, o, t + 0.26, p * 0.9, 1.25);
      knock(c, o, t + 0.27, p, 0.8, 900);
      flapBurst(c, o, t + 0.3, p, 3, 0.35);
      return 0.9;
    },
    flap(c, o, t, p) { flapBurst(c, o, t, p, 6, 0.55); return 0.7; },
    luff(c, o, t, p) {
      const e = eg(c, o, t, 0.06, 0.9, 0.5, 0.35);
      const g = gain(c, 0.3, e);
      const bp = filt(c, 'bandpass', 950 * p, 0.7, g); noise(c, t, 1.0, bp);
      const lfo = osc(c, 'square', 12 * p, t, 1.0); sweep(lfo.frequency, t, 11 * p, 16 * p, 0.9);
      const d = gain(c, 0.3); lfo.connect(d); d.connect(g.gain);
      const lp = eg(c, o, t, 0.05, 0.25, 0.5, 0.3); noise(c, t, 1.0, filt(c, 'lowpass', 220, 1, lp));
      return 1.0;
    },
    splash(c, o, t, p) {
      const g = eg(c, o, t, 0.01, 0.8, 0.02, 0.55);
      const lp = filt(c, 'lowpass', 4000, 1, g); sweep(lp.frequency, t, 4500 * p, 450 * p, 0.55); noise(c, t, 0.7, lp);
      for (let i = 0; i < 6; i++) {
        const tt = t + 0.05 + rnd() * 0.4, f = (1400 + rnd() * 2200) * p;
        const d = eg(c, o, tt, 0.002, 0.12, 0, 0.06); const x = osc(c, 'sine', f, tt, 0.08, d);
        x.frequency.exponentialRampToValueAtTime(f * 1.5, tt + 0.05);
      }
      return 0.8;
    },
    spray(c, o, t, p) {
      const g = eg(c, o, t, 0.04, 0.45, 0.06, 0.3);
      const hp = filt(c, 'highpass', 2400 * p, 0.7, g); noise(c, t, 0.5, hp); return 0.45;
    },
    bump(c, o, t, p) {
      thump(c, o, t, p, 1, 115, 45, 0.2);
      const n = eg(c, o, t, 0.002, 0.45, 0, 0.1); noise(c, t, 0.15, filt(c, 'lowpass', 600 * p, 1, n));
      const f = eg(c, o, t, 0.004, 0.25, 0, 0.09); const x = osc(c, 'triangle', 230 * p, t, 0.12, f);
      x.frequency.exponentialRampToValueAtTime(150 * p, t + 0.08); // rubbery fender squeak
      return 0.3;
    },
    crash(c, o, t, p) {
      thump(c, o, t, p, 1.1, 85, 32, 0.5);
      const n = eg(c, o, t, 0.002, 0.8, 0.02, 0.45); noise(c, t, 0.6, filt(c, 'lowpass', 1300 * p, 1, n));
      knock(c, o, t + 0.01, p, 0.9, 1800); knock(c, o, t + 0.075, p, 0.6, 1300); knock(c, o, t + 0.16, p, 0.35, 2200);
      const cr = eg(c, o, t + 0.05, 0.05, 0.12, 0.15, 0.3);
      const x = osc(c, 'sawtooth', 165 * p, t + 0.05, 0.6, filt(c, 'bandpass', 620, 4, cr));
      x.frequency.linearRampToValueAtTime(105 * p, t + 0.5);
      return 0.9;
    },
    horn(c, o, t, p) { return hornAt(c, o, t, p, 0.8); },
    hornShort(c, o, t, p) { return hornAt(c, o, t, p, 0.32); },
    hornLong(c, o, t, p) { return hornAt(c, o, t, p, 1.6); },
    whistle(c, o, t, p) {
      const g = eg(c, o, t, 0.02, 0.32, 0.36, 0.07);
      const am = gain(c, 0.7, g);
      const x = osc(c, 'sine', 2550 * p, t, 0.5, am);
      const fm = osc(c, 'sine', 27, t, 0.5); const fd = gain(c, 170 * p); fm.connect(fd); fd.connect(x.frequency);
      const ad = gain(c, 0.3); fm.connect(ad); ad.connect(am.gain);
      const b = eg(c, o, t, 0.02, 0.06, 0.36, 0.07); noise(c, t, 0.5, filt(c, 'bandpass', 2600 * p, 3, b));
      return 0.5;
    },
    bell(c, o, t, p) { // bell buoy: two clapper strokes as the buoy rolls
      const f = 470 * p;
      [[0, 0.32], [0.62 + rnd() * 0.15, 0.22]].forEach(([dt, a]) => {
        bellTone(c, o, t + dt, f, a, 2.4);
        const n = eg(c, o, t + dt, 0.001, a * 0.4, 0, 0.02); noise(c, t + dt, 0.04, filt(c, 'bandpass', 3200, 1.5, n));
      });
      return 3.2;
    },
    gull(c, o, t, p) {
      const calls = [[0, 1, 0.3], [0.32, 0.96, 0.24], [0.56, 0.93, 0.2]];
      calls.forEach(([dt, k, a]) => {
        const tt = t + dt, base = (850 + rnd() * 120) * p * k;
        const g = eg(c, o, tt, 0.015, a, 0.08, 0.14);
        const bp = filt(c, 'bandpass', 1900 * p, 2.2, g);
        const x = osc(c, 'sawtooth', base, tt, 0.3, bp);
        x.frequency.setValueAtTime(base, tt);
        x.frequency.exponentialRampToValueAtTime(base * 2.35, tt + 0.06);
        x.frequency.exponentialRampToValueAtTime(base * 1.6, tt + 0.24);
        const v = osc(c, 'sine', 32, tt, 0.3); const vd = gain(c, base * 0.05); v.connect(vd); vd.connect(x.frequency);
      });
      return 0.95;
    },
    countdown(c, o, t, p) {
      const g = eg(c, o, t, 0.005, 0.42, 0.08, 0.1); osc(c, 'sine', 880 * p, t, 0.22, g);
      const h = eg(c, o, t, 0.005, 0.08, 0.05, 0.08); osc(c, 'triangle', 1760 * p, t, 0.2, h);
      return 0.25;
    },
    go(c, o, t, p) {
      [1046.5, 1318.5, 1568].forEach((f, i) => {
        const g = eg(c, o, t, 0.01, 0.2, 0.28, 0.35); osc(c, i ? 'sine' : 'triangle', f * p, t, 0.7, g);
      });
      const s = eg(c, o, t, 0.01, 0.08, 0.1, 0.3); noise(c, t, 0.5, filt(c, 'highpass', 6000, 0.7, s));
      return 0.75;
    },
    win(c, o, t, p) {
      const N = [72, 76, 79, 84];
      N.forEach((m, i) => {
        const tt = t + i * 0.11, last = i === N.length - 1;
        note(c, o, tt, mtof(m) * p, 0.28, last ? 0.9 : 0.22, 'square', 3000);
        ping(c, o, tt, mtof(m + 12) * p, 0.1, last ? 0.8 : 0.2);
      });
      [60, 64, 67].forEach(m => note(c, o, t + 0.33, mtof(m) * p, 0.14, 1.0, 'triangle', 1800));
      for (let i = 0; i < 6; i++) ping(c, o, t + 0.4 + i * 0.07, mtof(96 + [0, 4, 7, 12, 7, 12][i]) * p, 0.05, 0.25);
      return 1.5;
    },
    lose(c, o, t, p) {
      [67, 66, 65, 64].forEach((m, i) => {
        const tt = t + i * 0.3, len = i === 3 ? 0.8 : 0.26;
        const g = eg(c, o, tt, 0.02, 0.22, len - 0.08, 0.12);
        const lp = filt(c, 'lowpass', 500, 4, g);
        lp.frequency.setValueAtTime(400, tt); lp.frequency.linearRampToValueAtTime(1500, tt + 0.12); lp.frequency.linearRampToValueAtTime(600, tt + len);
        const x = osc(c, 'sawtooth', mtof(m - 12) * p, tt, len + 0.15, lp);
        if (i === 3) { const v = osc(c, 'sine', 6, tt, len + 0.15); const vd = gain(c, 5); v.connect(vd); vd.connect(x.frequency); }
      });
      return 1.9;
    },
    star(c, o, t, p) {
      [1318.5, 1760, 2637].forEach((f, i) => { bellTone(c, o, t + i * 0.06, f * p, 0.13, 0.5); });
      const s = eg(c, o, t, 0.02, 0.06, 0.1, 0.3); noise(c, t, 0.5, filt(c, 'highpass', 7000, 0.7, s));
      return 0.7;
    },
    coin(c, o, t, p) {
      const g = eg(c, o, t, 0.002, 0.25, 0.05, 0.01); osc(c, 'square', 988 * p, t, 0.08, filt(c, 'lowpass', 4000, 0.7, g));
      const h = eg(c, o, t + 0.07, 0.002, 0.25, 0.08, 0.25); osc(c, 'square', 1319 * p, t + 0.07, 0.4, filt(c, 'lowpass', 4000, 0.7, h));
      ping(c, o, t + 0.07, 2638 * p, 0.06, 0.3);
      return 0.45;
    },
    rigClick(c, o, t, p) {
      const n = eg(c, o, t, 0.001, 0.6, 0, 0.022); noise(c, t, 0.04, filt(c, 'highpass', 3000 * p, 0.8, n));
      const g = eg(c, o, t, 0.001, 0.18, 0, 0.03); const x = osc(c, 'sine', 2700 * p, t, 0.05, g);
      x.frequency.exponentialRampToValueAtTime(2100 * p, t + 0.03);
      return 0.06;
    },
    rope(c, o, t, p) { // rope running through a block: rasp with jittery friction
      const g = gain(c, 0, o);
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0, tt = t; tt < t + 0.45; i++, tt += 0.012 + rnd() * 0.012) g.gain.setValueAtTime(0.15 + rnd() * 0.35 * (1 - (tt - t) / 0.5), tt);
      g.gain.setValueAtTime(0.0001, t + 0.47);
      noise(c, t, 0.5, filt(c, 'bandpass', 1400 * p, 1.4, g));
      const cr = eg(c, o, t, 0.05, 0.05, 0.25, 0.1); osc(c, 'sawtooth', 95 * p, t, 0.45, filt(c, 'bandpass', 500, 5, cr));
      return 0.5;
    },
    zip(c, o, t, p) {
      const g = eg(c, o, t, 0.01, 0.55, 0.15, 0.05);
      const am = gain(c, 0.5, g);
      const bp = filt(c, 'bandpass', 800, 2, am); sweep(bp.frequency, t, 800 * p, 3800 * p, 0.22); noise(c, t, 0.3, bp);
      const l = osc(c, 'square', 70, t, 0.3); sweep(l.frequency, t, 70, 120, 0.22);
      const ld = gain(c, 0.5); l.connect(ld); ld.connect(am.gain);
      return 0.3;
    },
    knot(c, o, t, p) { // creak as it tightens, then a snug snap
      const g = eg(c, o, t, 0.15, 0.22, 0.1, 0.1);
      const x = osc(c, 'sawtooth', 110 * p, t, 0.4, filt(c, 'bandpass', 720, 6, g));
      x.frequency.linearRampToValueAtTime(155 * p, t + 0.33);
      const j = osc(c, 'square', 31, t, 0.4); const jd = gain(c, 14); j.connect(jd); jd.connect(x.frequency);
      const n = eg(c, o, t + 0.36, 0.001, 0.55, 0, 0.04); noise(c, t + 0.36, 0.06, filt(c, 'bandpass', 2100 * p, 1, n));
      thump(c, o, t + 0.36, p, 0.4, 300, 120, 0.1);
      return 0.6;
    },
    cheer(c, o, t, p) {
      for (let i = 0; i < 7; i++) {
        const g = eg(c, o, t + rnd() * 0.15, 0.18, 0.06 + rnd() * 0.05, 1.0, 0.6);
        const bp = filt(c, 'bandpass', (500 + rnd() * 900) * p, 3.5, g);
        const l = osc(c, 'sine', 2 + rnd() * 3, t, 2.0); const ld = gain(c, 180); l.connect(ld); ld.connect(bp.frequency);
        noise(c, t, 2.0, bp);
      }
      for (let i = 0; i < 3; i++) { // "woo!"
        const tt = t + 0.1 + rnd() * 0.4, f = (420 + rnd() * 250) * p;
        const g = eg(c, o, tt, 0.08, 0.04, 0.4, 0.3);
        const x = osc(c, 'triangle', f, tt, 0.85, filt(c, 'lowpass', 1800, 1, g));
        x.frequency.exponentialRampToValueAtTime(f * 1.7, tt + 0.3);
        x.frequency.exponentialRampToValueAtTime(f * 1.3, tt + 0.75);
      }
      for (let i = 0; i < 30; i++) { // claps
        const tt = t + 0.05 + rnd() * 1.7, g = eg(c, o, tt, 0.001, 0.12 + rnd() * 0.12, 0, 0.04);
        noise(c, tt, 0.06, filt(c, 'bandpass', 1200 + rnd() * 900, 1.2, g));
      }
      return 2.3;
    },
    gear(c, o, t, p) { // outboard gear clunk
      thump(c, o, t, p, 0.7, 190, 80, 0.12);
      knock(c, o, t, p, 0.6, 700);
      const g = eg(c, o, t + 0.01, 0.001, 0.08, 0, 0.08); osc(c, 'triangle', 980 * p, t, 0.1, g);
      return 0.2;
    },
  };
  function hornAt(c, o, t, p, len) {
    const g = eg(c, o, t, 0.05, 0.42, len, 0.16);
    const sh = c.createWaveShaper ? c.createWaveShaper() : null;
    const lp = filt(c, 'lowpass', 1700, 1, g);
    const into = sh || lp;
    if (sh) { const k = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; k[i] = Math.tanh(x * 2.2); } sh.curve = k; sh.connect(lp); }
    const fm = filt(c, 'bandpass', 880, 3, g); // honky formant
    [[233, 0.35], [235.2, 0.35], [116.6, 0.3]].forEach(([f, a]) => {
      const x = osc(c, 'sawtooth', f * p * 0.96, t, len + 0.25); x.frequency.linearRampToValueAtTime(f * p, t + 0.07);
      const gg = gain(c, a); x.connect(gg); gg.connect(into); gg.connect(fm);
    });
    return len + 0.3;
  }
  // public alias names accepted too
  S.hornshort = S.hornShort; S.hornlong = S.hornLong;

  const NAMES = ['click', 'tap', 'whoosh', 'tack', 'gybe', 'flap', 'luff', 'splash', 'spray', 'crash', 'bump', 'horn',
    'hornShort', 'hornLong', 'whistle', 'bell', 'gull', 'countdown', 'go', 'win', 'lose', 'star', 'coin', 'pop',
    'rigClick', 'rope', 'zip', 'knot', 'cheer', 'gear'];
  // per-sound base levels so the mix is balanced
  const LEVEL = { click: 0.7, tap: 0.7, pop: 0.8, horn: 0.9, hornShort: 0.9, hornLong: 0.9, whistle: 0.7, bell: 0.7, gull: 0.6,
    crash: 1, bump: 0.9, cheer: 0.8, star: 0.9, coin: 0.7, win: 0.8, lose: 0.8, luff: 0.6, flap: 0.8 };

  // ---------------------------------------------------------------- context / buses
  function readSettings() {
    try { return (KOS.Storage && KOS.Storage.settings && KOS.Storage.settings()) || null; } catch (e) { return null; }
  }
  function applyGains() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : volume * 0.9, t, 0.03);
    const s = soundOn ? 1 : 0;
    sfxBus.gain.setTargetAtTime(s, t, 0.03); ambBus.gain.setTargetAtTime(s * 0.8, t, 0.1); engBus.gain.setTargetAtTime(s * 0.8, t, 0.05);
    musBus.gain.setTargetAtTime(musicOn ? 0.32 : 0, t, 0.2);
  }
  function build() {
    if (ctx || !AC) return ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return null; } }
    master = ctx.createGain();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = gain(ctx, 1, master); ambBus = gain(ctx, 0.8, master); engBus = gain(ctx, 0.8, master);
    musBus = gain(ctx, 0.32, master);
    // light echo on the music bus (a harbor-y space)
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.36;
    const fb = gain(ctx, 0.28), wet = gain(ctx, 0.22), dlp = filt(ctx, 'lowpass', 2200, 0.7);
    musBus.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(wet); wet.connect(master);
    const s = readSettings(); if (s) applySettings(s, true);
    applyGains();
    return ctx;
  }
  let unlocked = false;
  function unlock() {
    if (!AC) return false;
    build(); if (!ctx) return false;
    try { if (ctx.state === 'suspended' && !hiddenSuspended) ctx.resume(); } catch (e) {}
    if (!unlocked) {
      unlocked = true;
      // silent tick to fully unlock iOS
      try { const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {}
      if (wantAmbient) ambient(wantAmbient);
      if (wantEngine != null) engine(wantEngine);
      if (wantMusic) music(wantMusic);
    }
    return true;
  }
  function ready() { return !!(ctx && unlocked); }

  function play(name, opts) {
    if (!ready()) return false;
    const fn = S[name]; if (!fn) return false;
    const o = opts || {};
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.03) return false; // de-dupe same-frame spam
    if (voices >= MAX_VOICES) return false;
    lastPlay[name] = now;
    try {
      const out = gain(ctx, clamp((o.vol == null ? 1 : o.vol) * (LEVEL[name] || 1), 0, 2));
      out.connect(panner(ctx, o.pan || 0, sfxBus));
      const p = clamp(o.pitch || 1, 0.25, 4);
      const dur = fn(ctx, out, now + 0.005 + (o.delay || 0), p) || 1;
      voices++;
      setTimeout(() => { voices--; try { out.disconnect(); } catch (e) {} }, (dur + (o.delay || 0) + 0.4) * 1000);
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- ambient: wind + lapping waves + harbor rigging tinkle
  let amb = null;
  function ambient(p) {
    wantAmbient = p ? Object.assign({ wind: 8, waves: 0.5, harbor: 0 }, p) : null;
    if (!ready()) return;
    const t = ctx.currentTime;
    if (!wantAmbient) {
      if (amb) {
        const a = amb; amb = null; clearInterval(a.timer);
        a.out.gain.setTargetAtTime(0, t, 0.4);
        setTimeout(() => { a.srcs.forEach(s => { try { s.stop(); } catch (e) {} }); try { a.out.disconnect(); } catch (e) {} }, 2000);
      }
      return;
    }
    if (!amb) {
      const out = gain(ctx, 0, ambBus); out.gain.setTargetAtTime(1, t, 0.6);
      const windG = gain(ctx, 0, out), windBP = filt(ctx, 'bandpass', 400, 0.8, windG);
      const windLP = filt(ctx, 'lowpass', 1200, 0.5, windBP);
      const whisG = gain(ctx, 0, out), whisBP = filt(ctx, 'bandpass', 900, 9, whisG);
      const washG = gain(ctx, 0, out), washLP = filt(ctx, 'lowpass', 420, 0.6, washG);
      const s1 = noise(ctx, t, null, windLP, 1), s2 = noise(ctx, t, null, whisBP, 0.9), s3 = noise(ctx, t, null, washLP, 0.7);
      amb = { out, windG, windBP, whisG, whisBP, washG, srcs: [s1, s2, s3], p: wantAmbient, nextLap: t + 0.3, ph: rnd() * 100 };
      amb.timer = setInterval(ambTick, 120);
    }
    amb.p = wantAmbient;
    ambTick();
  }
  function ambTick() {
    if (!amb || !ctx) return;
    const t = ctx.currentTime, p = amb.p;
    const w = clamp(p.wind || 0, 0, 35), wav = clamp(p.waves == null ? 0.5 : p.waves, 0, 1), hb = clamp(p.harbor || 0, 0, 1);
    amb.ph += 0.12;
    const gust = 0.78 + 0.22 * Math.sin(amb.ph * 0.7) + 0.12 * Math.sin(amb.ph * 1.9 + 1.3) + (rnd() - 0.5) * 0.08;
    const wl = Math.pow(w / 25, 0.85) * 0.42 * gust;
    amb.windG.gain.setTargetAtTime(wl, t, 0.25);
    amb.windBP.frequency.setTargetAtTime((240 + w * 28) * (0.85 + 0.3 * gust), t, 0.3);
    amb.whisG.gain.setTargetAtTime(clamp((w - 10) / 16, 0, 1) * 0.1 * gust * gust, t, 0.3);
    amb.whisBP.frequency.setTargetAtTime(650 + w * 30 + 160 * Math.sin(amb.ph * 0.5), t, 0.4);
    amb.washG.gain.setTargetAtTime(wav * 0.18, t, 0.5);
    // lapping waves on the hull/pier: soft lowpassed swells
    if (wav > 0.02 && t >= amb.nextLap) {
      const len = 0.45 + rnd() * 0.6, tt = t + 0.05;
      const g = gain(ctx, 0, amb.out); env(g, tt, len * 0.4, (0.08 + rnd() * 0.12) * wav, 0, len * 0.6);
      const lp = filt(ctx, 'lowpass', 300, 1.5, g); lp.frequency.setValueAtTime(260, tt); lp.frequency.linearRampToValueAtTime(700 + rnd() * 500, tt + len * 0.4); lp.frequency.linearRampToValueAtTime(250, tt + len);
      noise(ctx, tt, len + 0.1, panner(ctx, (rnd() - 0.5) * 1.2, lp));
      if (rnd() < 0.4) ping(ctx, amb.out, tt + len * 0.35, 500 + rnd() * 700, 0.015 * wav, 0.07); // little "plop"
      amb.nextLap = t + (0.35 + rnd() * 1.1) / (0.5 + wav);
    }
    // harbor: halyards tinkling against aluminium masts, the odd distant clank
    if (hb > 0.01 && rnd() < hb * (0.12 + w / 80)) {
      const pn = panner(ctx, (rnd() - 0.5) * 1.6, amb.out), f = 1700 + rnd() * 1700, tt = t + rnd() * 0.1;
      ping(ctx, pn, tt, f, 0.03 * hb, 0.35); ping(ctx, pn, tt, f * 2.76, 0.012 * hb, 0.18);
      if (rnd() < 0.4) { ping(ctx, pn, tt + 0.09, f * 1.02, 0.02 * hb, 0.25); }
    }
    if (hb > 0.01 && rnd() < hb * 0.012) {
      const pn = panner(ctx, (rnd() - 0.5) * 1.6, amb.out); bellTone(ctx, pn, t + 0.05, 600 + rnd() * 300, 0.025 * hb, 0.9);
    }
    if (hb > 0.25 && rnd() < hb * 0.006) {
      const out = gain(ctx, 0.25 * hb); out.connect(panner(ctx, (rnd() - 0.5) * 1.8, amb.out)); S.gull(ctx, out, t + 0.05, 0.9 + rnd() * 0.25);
    }
  }

  // ---------------------------------------------------------------- RIB outboard
  let eng = null, engSign = 0;
  function engine(thr) {
    wantEngine = thr == null ? null : clamp(+thr || 0, -1, 1);
    if (!ready()) return;
    const t = ctx.currentTime;
    if (wantEngine == null) {
      if (eng) {
        const e = eng; eng = null;
        e.out.gain.setTargetAtTime(0, t, 0.15);
        e.o1.frequency.setTargetAtTime(20, t, 0.3);
        setTimeout(() => { e.srcs.forEach(s => { try { s.stop(); } catch (er) {} }); try { e.out.disconnect(); } catch (er) {} }, 1200);
      }
      engSign = 0; return;
    }
    if (!eng) {
      const out = gain(ctx, 0, engBus); out.gain.setTargetAtTime(1, t, 0.25);
      const body = gain(ctx, 0.2, out);
      const lp = filt(ctx, 'lowpass', 350, 2, body);
      const o1 = osc(ctx, 'sawtooth', 42, t, null, lp);
      const o2 = osc(ctx, 'square', 21, t, null); const o2g = gain(ctx, 0.35, lp); o2.connect(o2g);
      const sub = osc(ctx, 'sine', 42, t, null); const subg = gain(ctx, 0.5, body); sub.connect(subg);
      const chug = osc(ctx, 'sine', 10.5, t, null); const chugD = gain(ctx, 0.08); chug.connect(chugD); chugD.connect(body.gain);
      const waterG = gain(ctx, 0, out); const wbp = filt(ctx, 'bandpass', 900, 0.8, waterG);
      const wn = noise(ctx, t, null, wbp, 1);
      // start-up: a pull and a catch
      play('gear', { vol: 0.6, pitch: 0.8 });
      eng = { out, body, lp, o1, o2, sub, chug, chugD, waterG, wbp, srcs: [o1, o2, sub, chug, wn] };
      // "vroom" from cold
      o1.frequency.setValueAtTime(18, t); o1.frequency.setTargetAtTime(48, t, 0.12);
    }
    const a = Math.abs(wantEngine), rev = wantEngine < -0.04;
    const f = 42 + a * (rev ? 60 : 92);
    const tc = 0.18;
    eng.o1.frequency.setTargetAtTime(f, t, tc);
    eng.o2.frequency.setTargetAtTime(f * 0.5, t, tc);
    eng.sub.frequency.setTargetAtTime(f * 0.5, t, tc);
    eng.chug.frequency.setTargetAtTime(f / 4, t, tc);
    eng.chugD.gain.setTargetAtTime(0.09 * (1 - a * 0.7), t, tc);
    eng.lp.frequency.setTargetAtTime(320 + a * 1900, t, tc);
    eng.body.gain.setTargetAtTime(0.16 + a * 0.22, t, tc);
    eng.waterG.gain.setTargetAtTime(a * 0.22, t, 0.3);
    eng.wbp.frequency.setTargetAtTime(600 + a * 1400, t, 0.3);
    const sign = wantEngine > 0.04 ? 1 : rev ? -1 : 0;
    if (sign !== engSign) { play('gear', { vol: 0.8 }); engSign = sign; }
  }

  // ---------------------------------------------------------------- generative music
  const SONGS = {
    // 6/8 sea-shanty: ukulele strums, marimba tune, soft bass and shaker. D major.
    menu: {
      step: 60 / 68 / 3, steps: 6,
      chords: [[50, 'M'], [55, 'M'], [50, 'M'], [57, 'M'], [50, 'M'], [55, 'M'], [57, 'M'], [50, 'M'],
        [59, 'm'], [55, 'M'], [50, 'M'], [57, 'M'], [59, 'm'], [55, 'M'], [57, 'M'], [50, 'M']],
      scale: [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81],
      rhythms: [[1, 0, 1, 1, 0, 1], [1, 0, 0, 1, 1, 1], [1, 1, 1, 1, 0, 0], [1, 0, 1, 1, 0, 0], [1, 0, 0, 1, 0, 0]],
      play(c, out, t, s, bar, st) {
        const [r, q] = this.chords[bar % this.chords.length], ch = triad(r, q);
        if (s === 0) note(c, out, t, mtof(r - 12), 0.32, 0.9, 'triangle', 600);
        if (s === 3) note(c, out, t, mtof(r - 5), 0.22, 0.6, 'triangle', 600);
        if (s === 0 || s === 3) ch.concat([ch[0] + 12]).forEach((m, i) => uke(c, out, t + i * 0.014, mtof(m + 12), s === 0 ? 0.07 : 0.05));
        if (s === 5 && bar % 2 === 1) ch.forEach((m, i) => uke(c, out, t + i * 0.01, mtof(m + 12), 0.03));
        const sh = eg(c, out, t, 0.004, s % 3 === 0 ? 0.05 : 0.025, 0, 0.05); noise(c, t, 0.08, filt(c, 'highpass', 6500, 0.7, sh));
        if (s === 0) st.rhythm = this.rhythms[Math.floor(st.rng() * this.rhythms.length)];
        if (bar % 8 === 7 && s > 3) return;
        if (st.rhythm[s]) {
          const m = walk(st, this.scale, ch, s === 0);
          marimba(c, out, t, mtof(m), 0.2, s === 0 ? 0.7 : 0.45);
        }
      },
    },
    // upbeat 4/4: kick, claps, hats, pumping bass, marimba arpeggios, pluck hook. C major I-V-vi-IV.
    race: {
      step: 60 / 128 / 4, steps: 16,
      chords: [[48, 'M'], [55, 'M'], [57, 'm'], [53, 'M']],
      scale: [72, 74, 76, 79, 81, 84, 86, 88],
      play(c, out, t, s, bar, st) {
        const [r, q] = this.chords[bar % 4], ch = triad(r, q);
        if (s % 4 === 0) thump(c, out, t, 1, 0.55, 120, 42, 0.16);
        if (s === 4 || s === 12) {
          const g = eg(c, out, t, 0.001, 0.16, 0.01, 0.12); noise(c, t, 0.16, filt(c, 'bandpass', 1700, 0.9, g));
          const g2 = eg(c, out, t + 0.012, 0.001, 0.1, 0, 0.08); noise(c, t + 0.012, 0.1, filt(c, 'bandpass', 1300, 1.2, g2));
        }
        if (s % 4 === 2) { const g = eg(c, out, t, 0.001, 0.06, 0, 0.04); noise(c, t, 0.06, filt(c, 'highpass', 8000, 0.7, g)); }
        else { const g = eg(c, out, t, 0.001, 0.018, 0, 0.025); noise(c, t, 0.04, filt(c, 'highpass', 9000, 0.7, g)); }
        if (s % 2 === 0) note(c, out, t, mtof(r - 12 + (s === 6 || s === 14 ? 12 : 0)), 0.2, 0.18, 'sawtooth', 700);
        if (s % 2 === 0) { const arp = [0, 1, 2, 1, 0, 2, 1, 2]; marimba(c, out, t, mtof(ch[arp[(s / 2) % 8]] + 12), 0.09, 0.25); }
        if (bar % 2 === 0 && s === 0) st.hook = [0, 3, 6, 10, 12].filter(() => st.rng() < 0.75);
        if (bar % 2 === 0 && st.hook && st.hook.indexOf(s) >= 0) note(c, out, t, mtof(walk(st, this.scale, ch, s === 0)), 0.1, 0.3, 'square', 2600);
      },
    },
    // slow and dreamy: soft pads, sparse bell-marimba notes, pentatonic.
    calm: {
      step: 60 / 70 / 2, steps: 8,
      chords: [[48, 'M7'], [57, 'm7'], [53, 'M7'], [55, 'M']],
      scale: [72, 74, 76, 79, 81, 84, 86, 88, 91],
      play(c, out, t, s, bar, st) {
        const [r, q] = this.chords[bar % 4], ch = triad(r, q);
        if (s === 0) {
          const len = this.step * this.steps;
          ch.forEach(m => [0, 7].forEach(cents => {
            const g = gain(c, 0, out); env(g, t, 0.9, 0.035, len - 1.2, 1.4);
            const x = osc(c, 'triangle', mtof(m) * Math.pow(2, cents / 1200), t, len + 1.5, filt(c, 'lowpass', 900, 0.6, g));
            x.detune.value = (rnd() - 0.5) * 6;
          }));
          note(c, out, t, mtof(r - 12), 0.18, 2.4, 'sine', 400);
        }
        if (st.rng() < (s % 2 === 0 ? 0.38 : 0.16)) marimba(c, out, t, mtof(walk(st, this.scale, ch, false)), 0.13, 1.1);
      },
    },
  };
  function triad(r, q) {
    if (q === 'm') return [r, r + 3, r + 7];
    if (q === 'm7') return [r, r + 3, r + 7, r + 10];
    if (q === 'M7') return [r, r + 4, r + 7, r + 11];
    return [r, r + 4, r + 7];
  }
  // melodic random walk on the scale, landing on chord tones on strong beats
  function walk(st, scale, chord, strong) {
    let i = st.mi == null ? Math.floor(scale.length / 2) : st.mi;
    const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(st.rng() * 7)];
    i = clamp(i + step, 0, scale.length - 1);
    if (strong) {
      let best = i, bd = 99;
      for (let k = 0; k < scale.length; k++) {
        if (chord.some(m => (scale[k] - m) % 12 === 0) && Math.abs(k - i) < bd) { bd = Math.abs(k - i); best = k; }
      }
      i = best;
    }
    if (i <= 0 || i >= scale.length - 1) i = clamp(i + (i <= 0 ? 2 : -2), 0, scale.length - 1);
    st.mi = i; return scale[i];
  }
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  let song = null; // {name, out, next, step, bar, st, timer}
  function music(name) {
    wantMusic = name && SONGS[name] ? name : null;
    if (!ready()) return;
    if (song && (!wantMusic || !musicOn || song.name !== wantMusic)) {
      const old = song; song = null; clearInterval(old.timer);
      old.out.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      setTimeout(() => { try { old.out.disconnect(); } catch (e) {} }, 2500);
    }
    if (!wantMusic || !musicOn || song) return;
    const def = SONGS[wantMusic];
    const out = gain(ctx, 0, musBus); out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    song = { name: wantMusic, def, out, next: ctx.currentTime + 0.15, step: 0, bar: 0, st: { rng: seeded(Date.now() & 0xffff), mi: null } };
    song.timer = setInterval(musicTick, 40);
    musicTick();
  }
  function musicTick() {
    if (!song || !ctx) return;
    const ahead = ctx.currentTime + 0.25;
    if (song.next < ctx.currentTime - 0.5) song.next = ctx.currentTime + 0.05; // resumed after a long pause
    while (song.next < ahead) {
      try { song.def.play(ctx, song.out, song.next, song.step, song.bar, song.st); } catch (e) {}
      song.next += song.def.step * (song.def.steps === 6 && (song.step % 3 === 0) ? 1.04 : 1); // a touch of swing on the shanty
      song.step++;
      if (song.step >= song.def.steps) { song.step = 0; song.bar++; }
    }
  }

  // ---------------------------------------------------------------- settings / volume
  function setVolume(v) { volume = clamp(+v || 0, 0, 1); applyGains(); }
  function mute(b) { muted = b == null ? !muted : !!b; applyGains(); return muted; }
  function setSound(b) { soundOn = !!b; applyGains(); }
  function setMusic(b) { musicOn = !!b; applyGains(); if (ready()) music(wantMusic); }
  function applySettings(s, quiet) {
    if (!s) return;
    if (s.volume != null) volume = clamp(+s.volume, 0, 1);
    if (s.sound != null) soundOn = !!s.sound;
    if (s.music != null) musicOn = !!s.music;
    if (!quiet) { applyGains(); if (ready()) music(wantMusic); }
  }
  function stopAll() { ambient(null); engine(null); music(null); }

  // pause audio when the tab is hidden
  let hiddenSuspended = false;
  if (W && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      try {
        if (document.hidden) { hiddenSuspended = true; ctx.suspend(); }
        else { hiddenSuspended = false; if (unlocked) ctx.resume(); }
      } catch (e) {}
    });
    const gesture = () => { if (unlock() && ctx && ctx.state === 'running') ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(ev => W.removeEventListener(ev, gesture, true)); };
    ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(ev => W.addEventListener(ev, gesture, true));
  }

  // offline render of a one-shot (test hook): resolves {peak, rms, dur}
  function render(name, opts) {
    const fn = S[name];
    if (!OAC || !fn) return Promise.resolve(null);
    const sr = 22050, dur = (opts && opts.seconds) || 3.5;
    const c = new OAC(1, Math.floor(sr * dur), sr);
    const out = c.createGain(); out.connect(c.destination);
    const len = fn(c, out, 0.01, (opts && opts.pitch) || 1);
    return c.startRendering().then(buf => {
      const d = buf.getChannelData(0); let pk = 0, sum = 0, n = Math.min(d.length, Math.floor(((len || 1) + 0.05) * sr));
      for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += v * v; }
      return { peak: +pk.toFixed(3), rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(4), dur: len };
    });
  }

  KOS.Audio = {
    names: NAMES,
    supported: !!AC,
    unlock, play, ambient, engine, music, setVolume, mute, setSound, setMusic, applySettings, stopAll, render,
    get ctx() { return ctx; },
    get unlocked() { return ready(); },
    get volume() { return volume; },
    get muted() { return muted; },
    state() {
      return { supported: !!AC, unlocked: ready(), ctxState: ctx ? ctx.state : 'none', volume, muted, soundOn, musicOn,
        music: song ? song.name : null, ambient: !!amb, engine: !!eng, voices };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
