// KØS SEJL — js/render/effects.js
// KOS.Effects: world-space particles and trails: boat wakes, bow spray, splashes, ripples, in-world confetti,
// floating text. Render-only (may use Math.random). Drawn by KOS.SailScene in two passes:
//   render(ctx, scene, 'under')  wakes, foam, ripples (below boats)
//   render(ctx, scene, 'over')   spray, splash droplets, confetti, floating text (above boats)
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const CONFETTI = ['#ffb547', '#ff7a3d', '#49c6f2', '#3ee08f', '#ffd25e', '#ff4d5e', '#ffffff', '#a35cff'];
  const MAXP = 900;

  function Effects() {
    this.p = [];          // particles
    this.trails = new Map(); // boat → [{x, y, t, w, s}]
    this.t = 0;
    this.texts = [];
  }
  const E = Effects.prototype;

  // on slow devices (KOS.Perf.level < 2, set by the app's frame-time governor) cosmetic spray is thinned out
  const COSMETIC = { drop: 1, ripple: 1, foam: 1 };
  E.add = function (o) {
    const lvl = KOS.Perf ? KOS.Perf.level : 2;
    if (lvl < 2 && COSMETIC[o.type] && Math.random() < (lvl === 1 ? 0.4 : 0.75)) return o;
    const max = lvl >= 2 ? MAXP : lvl === 1 ? 500 : 250;
    while (this.p.length >= max) this.p.shift();
    this.p.push(o); return o;
  };
  E.clear = function () { this.p.length = 0; this.trails.clear(); this.texts.length = 0; };

  // --- spawners -------------------------------------------------------------------------------
  E.spray = function (x, y, dir, k, opts) {
    k = k == null ? 1 : k; const n = Math.ceil(2 + 5 * k);
    for (let i = 0; i < n; i++) {
      const a = dir + rnd(-0.6, 0.6), sp = rnd(1.5, 4.5) * (0.5 + k);
      this.add({ type: 'drop', x: x + rnd(-0.2, 0.2), y: y + rnd(-0.2, 0.2), z: rnd(0, 0.3), vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp, vz: rnd(1.5, 4) * (0.6 + k * 0.6), life: 0, max: rnd(0.5, 0.9), size: rnd(0.05, 0.12) * (0.8 + k * 0.5) });
    }
  };
  E.splash = function (x, y, k) {
    k = k == null ? 1 : k;
    for (let i = 0; i < 10 + 18 * k; i++) {
      const a = Math.random() * TAU, sp = rnd(0.8, 3.5) * (0.6 + k * 0.6);
      this.add({ type: 'drop', x, y, z: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(2, 5) * (0.6 + k * 0.5), life: 0, max: rnd(0.6, 1.1), size: rnd(0.07, 0.16) * (0.8 + k * 0.4) });
    }
    this.ripple(x, y, 1.5 + 2.5 * k, 1.2);
    this.ripple(x, y, 0.8 + 1.5 * k, 0.9, 0.25);
    this.add({ type: 'foam', x, y, r: 0.6 + k, life: 0, max: 1.4 });
  };
  E.ripple = function (x, y, r, max, delay) { this.add({ type: 'ripple', x, y, r: r || 2, life: -(delay || 0), max: max || 1.4 }); };
  E.foam = function (x, y, r, max) { this.add({ type: 'foam', x, y, r: r || 0.6, life: 0, max: max || 1.5 }); };
  E.confetti = function (x, y, n, opts) {
    n = n || 80; const spread = (opts && opts.spread) || 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(1, 6);
      this.add({ type: 'confetti', x: x + rnd(-spread, spread) * 0.3, y: y + rnd(-spread, spread) * 0.3, z: rnd(0.5, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(4, 10), life: 0, max: rnd(2.2, 3.6), size: rnd(0.18, 0.34), col: CONFETTI[i % CONFETTI.length], rot: Math.random() * TAU, vr: rnd(-12, 12) });
    }
  };
  E.stars = function (x, y, n) {
    for (let i = 0; i < (n || 8); i++) { const a = (i / (n || 8)) * TAU; this.add({ type: 'star', x, y, z: 0.5, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 3, life: 0, max: 1.2, size: 0.45 }); }
  };
  // floating text: world position, constant screen size (px), rises and fades
  E.text = function (x, y, str, opts) {
    opts = opts || {};
    this.add({ type: 'text', x, y, z: 0, vz: opts.rise != null ? opts.rise : 1.6, life: 0, max: opts.ms ? opts.ms / 1000 : 1.6, str: String(str), col: opts.color || '#ffffff', px: opts.size || 22, stroke: opts.stroke || 'rgba(13,19,33,0.85)', pop: 0 });
  };

  // per-frame boat tracking: wake trail + bow spray (called by the scene for every boat)
  E.trackBoat = function (boat, dt) {
    if (!boat) return;
    const sp = Math.abs(boat.speed != null ? boat.speed : Math.hypot(boat.vx || 0, boat.vy || 0));
    let tr = this.trails.get(boat);
    if (!tr) { tr = { pts: [], acc: 0, sprayAcc: 0 }; this.trails.set(boat, tr); }
    const cls = boat.cls && typeof boat.cls === 'object' ? boat.cls : null;
    const g = KOS.Sprites && KOS.Sprites.geo ? KOS.Sprites.geo(boat.cls && boat.cls.id ? boat.cls.id : boat.cls) : { L: 4, B: 1.4 };
    const L = (cls && cls.length) || g.L, B = (cls && cls.beam) || g.B;
    const h = boat.heading || 0, sx = Math.sin(h), sy = -Math.cos(h);
    tr.acc += dt;
    if (tr.acc >= 0.07) {
      tr.acc = 0;
      if (sp > 0.25 && !boat.capsized) tr.pts.push({ x: boat.x - sx * L * 0.48, y: boat.y - sy * L * 0.48, t: this.t, w: B * (0.45 + Math.min(1.4, sp / 4)), s: sp, motor: !!(g.motor && Math.abs(boat.throttle || 0) > 0.05) });
    }
    while (tr.pts.length && (this.t - tr.pts[0].t > 4.5 || tr.pts.length > 70)) tr.pts.shift();
    // bow spray when fast / planing / powering through chop
    const k = clamp((sp - 2.2) / 4, 0, 1.4) + (boat.planing ? 0.4 : 0);
    if (k > 0 && !boat.capsized) {
      tr.sprayAcc += dt * (4 + 18 * k);
      while (tr.sprayAcc > 1) {
        tr.sprayAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1, bx = boat.x + sx * L * 0.38, by = boat.y + sy * L * 0.38;
        const a = h + side * rnd(1.1, 1.9);
        this.spray(bx + Math.cos(h) * side * B * 0.3, by + Math.sin(h) * side * B * 0.3, a, k * 0.5);
      }
    }
    // occasional foam puffs at the stern of a RIB under power
    if (g.motor && Math.abs(boat.throttle || 0) > 0.3 && Math.random() < dt * 20) this.foam(boat.x - sx * L * 0.55 + rnd(-0.3, 0.3), boat.y - sy * L * 0.55 + rnd(-0.3, 0.3), rnd(0.3, 0.7), 1.2);
  };
  E.forget = function (boat) { this.trails.delete(boat); };

  // --- update -----------------------------------------------------------------------------------
  E.update = function (dt) {
    this.t += dt;
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) {
      const o = p[i];
      o.life += dt;
      if (o.life >= o.max) { p.splice(i, 1); continue; }
      if (o.life < 0) continue;
      if (o.type === 'drop' || o.type === 'star') {
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.vz -= 9.8 * dt;
        if (o.z < 0) { if (o.type === 'drop' && o.vz < -1 && Math.random() < 0.25) this.add({ type: 'ripple', x: o.x, y: o.y, r: 0.35, life: 0, max: 0.5 }); p.splice(i, 1); continue; }
      } else if (o.type === 'confetti') {
        o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 1 - dt * 1.2; o.vy *= 1 - dt * 1.2;
        o.z += o.vz * dt; o.vz = Math.max(o.vz - 9 * dt, -1.6); o.rot += o.vr * dt;
        if (o.z < 0) { o.z = 0; o.vx *= 0.9; o.vy *= 0.9; }
      } else if (o.type === 'text') {
        o.z += o.vz * dt; o.vz *= 1 - dt * 1.5; o.pop = Math.min(1, o.pop + dt * 6);
      }
    }
  };

  // --- render -----------------------------------------------------------------------------------
  E.render = function (ctx, scene, layer) {
    const mpp = scene && scene.mpp ? scene.mpp : 0.05; // meters per css pixel
    if (layer !== 'over') this.renderWakes(ctx, scene, mpp);
    const view = scene && scene.view;
    for (const o of this.p) {
      if (o.life < 0) continue;
      if (view && (o.x < view.x0 - 10 || o.x > view.x1 + 10 || o.y < view.y0 - 10 || o.y > view.y1 + 10)) continue;
      const f = o.life / o.max;
      if (layer !== 'over') {
        if (o.type === 'ripple') {
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - f)) + ')'; ctx.lineWidth = Math.max(0.05, 1.5 * mpp) * (1.4 - f);
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (0.3 + f), 0, TAU); ctx.stroke();
        } else if (o.type === 'foam') {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - f)) + ')'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (0.6 + f * 0.8), 0, TAU); ctx.fill();
        }
      } else {
        if (o.type === 'drop') {
          ctx.fillStyle = 'rgba(0,30,60,0.12)'; ctx.beginPath(); ctx.arc(o.x + o.z * 0.3, o.y + o.z * 0.4, o.size, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - f * 0.6)) + ')'; ctx.beginPath(); ctx.arc(o.x, o.y - o.z * 0.4, o.size * (1 + o.z * 0.15), 0, TAU); ctx.fill();
        } else if (o.type === 'confetti') {
          const a = f > 0.8 ? (1 - f) / 0.2 : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x, o.y - o.z * 0.5); ctx.rotate(o.rot);
          ctx.scale(1, Math.abs(Math.cos(o.rot * 1.7)) * 0.8 + 0.2);
          const cs = Math.max(o.size, 7 * mpp * (o.size / 0.26)); ctx.fillStyle = o.col; ctx.fillRect(-cs / 2, -cs * 0.3, cs, cs * 0.6); ctx.restore();
        } else if (o.type === 'star') {
          drawStar(ctx, o.x, o.y - o.z * 0.5, Math.max(o.size, 12 * mpp) * (1 - f * 0.5), '#ffd25e', 1 - f);
        } else if (o.type === 'text') {
          const s = mpp * o.px * (0.6 + 0.4 * easeBack(o.pop));
          const a = f > 0.7 ? (1 - f) / 0.3 : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x, o.y - o.z);
          if (scene && scene.camera && scene.camera.rot) ctx.rotate(-scene.camera.rot);
          ctx.scale(s / 20, s / 20);
          ctx.font = '900 20px ui-rounded,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          ctx.lineWidth = 5; ctx.strokeStyle = o.stroke; ctx.strokeText(o.str, 0, 0);
          ctx.fillStyle = o.col; ctx.fillText(o.str, 0, 0);
          ctx.restore();
        }
      }
    }
  };
  function easeBack(t) { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function drawStar(ctx, x, y, r, col, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, an = (i / 10) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // V-shaped wakes: two arms spreading out with age + a turbulent centre foam band.
  E.renderWakes = function (ctx, scene, mpp) {
    const now = this.t;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [boat, tr] of this.trails) {
      const pts = tr.pts; if (pts.length < 2) continue;
      if (scene && scene.view) { const v = scene.view, q = pts[pts.length - 1]; if (q.x < v.x0 - 60 || q.x > v.x1 + 60 || q.y < v.y0 - 60 || q.y > v.y1 + 60) continue; }
      // live point at the stern so the wake attaches to the boat
      const list = pts;
      // centre foam: one tapered ribbon, fading with age (gradient from the stern backwards)
      {
        const n = list.length, first = list[0], last = list[n - 1];
        const Lft = [], Rgt = [];
        for (let i = 0; i < n; i++) {
          const q = list[i], m = list[Math.max(0, i - 1)], o = list[Math.min(n - 1, i + 1)];
          let dx = o.x - m.x, dy = o.y - m.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const age = now - q.t, hw = q.w * (0.22 + Math.min(1.2, age * 0.35)) * (q.motor ? 1.3 : 1);
          Lft.push([q.x - dy * hw, q.y + dx * hw]); Rgt.push([q.x + dy * hw, q.y - dx * hw]);
        }
        ctx.beginPath(); ctx.moveTo(Lft[0][0], Lft[0][1]);
        for (let i = 1; i < n; i++) ctx.lineTo(Lft[i][0], Lft[i][1]);
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rgt[i][0], Rgt[i][1]);
        ctx.closePath();
        const k = clamp(last.s / 3, 0.3, 1) * (last.motor ? 1.3 : 1), ageL = now - first.t, fadeAt = clamp(3.2 / Math.max(0.1, ageL), 0, 1);
        const g = ctx.createLinearGradient(last.x, last.y, first.x, first.y);
        g.addColorStop(0, 'rgba(255,255,255,' + clamp(0.5 * k, 0, 0.7) + ')'); g.addColorStop(Math.min(1, fadeAt * 0.35), 'rgba(255,255,255,' + 0.22 * k + ')'); g.addColorStop(Math.min(1, fadeAt), 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fill();
      }
      // V arms
      for (let side = -1; side <= 1; side += 2) {
        for (let bkt = 0; bkt < 4; bkt++) {
          ctx.beginPath(); let any = false, prev = null;
          for (let i = 0; i < list.length; i++) {
            const q = list[i], age = now - q.t, fb = Math.min(3, Math.floor(age / 1.0));
            let dx = 0, dy = 0;
            const n = list[Math.min(list.length - 1, i + 1)], m = list[Math.max(0, i - 1)];
            dx = n.x - m.x; dy = n.y - m.y; const l = Math.hypot(dx, dy) || 1;
            const off = q.w * 0.5 + age * (0.55 + q.s * 0.18);
            const px = q.x + (-dy / l) * off * side, py = q.y + (dx / l) * off * side;
            if (fb === bkt && prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(px, py); any = true; }
            prev = [px, py];
          }
          if (!any) continue;
          const s = list[list.length - 1].s;
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.34 - bkt * 0.08) * clamp(s / 2.5, 0.2, 1) + ')';
          ctx.lineWidth = Math.max(0.08, 1.6 * mpp) * (1.6 - bkt * 0.25); ctx.stroke();
        }
      }
    }
  };

  KOS.Effects = Effects;
  KOS.Effects.create = function () { return new Effects(); };
})(typeof window !== 'undefined' ? window : globalThis);
