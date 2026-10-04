// KØS SEJL — js/core/ai.js
// KOS.AI: computer helmsmen.
//   const helm = KOS.AI.createHelm(boat, {skill /*0..1*/, aggression /*0..1*/, seed})
//   helm.think(env, plan, others) -> physics controls (call once per physics step, before KOS.Physics.step)
//     env  = {wind, venue, assist, t}
//     plan = {target: {x, y}} | {course: [{x, y, round: 'port'|'starboard'} | {line: [p1, p2]}], leg}
//            optional plan.start = {line: [p1, p2], t0}   (holds back behind the line, hits it at the gun)
//            optional plan.marks (for R18), plan.mode ('race'|'colreg')
//   helm state for HUD/debug: helm.leg, helm.finished, helm.finishT, helm.state ('prestart'|'beat'|'reach'|'run'|
//     'avoid'|'irons'|'finished'|'motor'), helm.target {x, y}, helm.wantTack, helm.ocs
// Sailing logic: beats on VMG-optimal angles and tacks on laylines / when the other tack pays (hysteresis by skill),
// gybes downwind on the optimal VMG angle, rounds marks on the correct side (entry -> apex -> exit), hoists the
// kite on broad angles, keeps clear as the give-way boat (KOS.Rules) using closest-point-of-approach prediction.
// Skill changes pinching/footing, steering wobble, tack hysteresis, trim errors, reaction time and start timing.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const R = d => d * Math.PI / 180;

  function createHelm(boat, opts) {
    opts = opts || {};
    const skill = U.clamp(opts.skill === undefined ? 0.7 : opts.skill, 0, 1);
    const aggression = U.clamp(opts.aggression === undefined ? 0.5 : opts.aggression, 0, 1);
    const seedStr = 'helm:' + (opts.seed === undefined ? boat.id : opts.seed);
    const rnd = U.rng(seedStr);
    const nseed = U.hash(seedStr);
    const helm = {
      boat, skill, aggression,
      leg: 0, sub: 0, finished: false, finishT: null, state: 'sail', target: null,
      wantTack: null, tackCd: 0, ironsT: 0, spi: false, ocs: false, avoiding: null,
      startFrac: rnd.range(0.2, 0.8),
      angleBias: (rnd() - 0.5) * R(7) * (1 - skill), // pinches (-) or foots (+) a little
      trimErr: (rnd() - 0.5) * 0.18 * (1 - skill),
      lateMargin: 0.4 + (1 - skill) * rnd.range(1.5, 6),
      _lastT: null, _planLeg: undefined, _course: null, _px: boat.x, _py: boat.y,
    };

    function nowOf(env) { return env && env.t !== undefined ? env.t : env && env.wind && env.wind.t !== undefined ? env.wind.t : boat.t; }

    // ---------------------------------------------------------------- course bookkeeping
    function buildRoute(plan) {
      const course = plan.course || (plan.target ? [plan.target] : []);
      const L = boat.cls.length;
      const route = [];
      for (let i = 0; i < course.length; i++) {
        const m = course[i];
        if (m.line) {
          const a = m.line[0], b = m.line[1];
          route.push({ kind: 'line', leg: i, a: { x: U.px(a), y: U.py(a) }, b: { x: U.px(b), y: U.py(b) }, x: (U.px(a) + U.px(b)) / 2, y: (U.py(a) + U.py(b)) / 2 });
          continue;
        }
        if (!m.round) { route.push({ kind: 'point', leg: i, x: m.x, y: m.y, r: m.r || Math.max(3 * L, 10) }); continue; }
        const prev = i > 0 ? course[i - 1] : null;
        const next = course[i + 1] || null;
        const from = prev ? (prev.line ? { x: (U.px(prev.line[0]) + U.px(prev.line[1])) / 2, y: (U.py(prev.line[0]) + U.py(prev.line[1])) / 2 } : prev) : { x: boat.x, y: boat.y };
        const to = next ? (next.line ? { x: (U.px(next.line[0]) + U.px(next.line[1])) / 2, y: (U.py(next.line[0]) + U.py(next.line[1])) / 2 } : next) : null;
        const dirIn = U.bearing(from, m);
        const dirOut = to ? U.bearing(m, to) : dirIn;
        const sg = m.round === 'port' ? 1 : -1;
        const c = Math.max(2.2 * L, 8) * (1.2 - 0.2 * skill);
        const rin = U.vec(dirIn + Math.PI / 2, c * sg), fin = U.vec(dirIn, c);
        const rout = U.vec(dirOut + Math.PI / 2, c * sg), fout = U.vec(dirOut, c);
        route.push({ kind: 'entry', leg: i, mark: m, dirIn, sg, c, x: m.x + rin.x - fin.x * 0.6, y: m.y + rin.y - fin.y * 0.6 });
        const turn = Math.abs(U.angDiff(dirIn, dirOut));
        if (turn > R(60)) {
          const vi = U.vec(dirIn), vo = U.vec(dirOut);
          let ax = vi.x - vo.x, ay = vi.y - vo.y;
          const l = Math.hypot(ax, ay) || 1;
          ax /= l; ay /= l;
          // blend towards the rounding side so the apex is never on the wrong side of the mark
          route.push({ kind: 'apex', leg: i, mark: m, c, sg, dirIn, dirOut, x: m.x + ax * c, y: m.y + ay * c });
        }
        route.push({ kind: 'exit', leg: i, mark: m, dirOut, sg, c, x: m.x + rout.x + fout.x * 0.7, y: m.y + rout.y + fout.y * 0.7 });
      }
      return route;
    }

    function routeSig(plan) {
      const course = plan.course || (plan.target ? [plan.target] : []);
      let s = '';
      for (const m of course) {
        if (m.line) s += 'L' + U.px(m.line[0]) + ',' + U.py(m.line[0]) + ',' + U.px(m.line[1]) + ',' + U.py(m.line[1]) + ';';
        else s += m.x + ',' + m.y + ',' + (m.round || '') + ',' + (m.r || '') + ';';
      }
      return s;
    }

    function reached(wp, plan) {
      const b = boat;
      const d = U.dist(b, wp);
      const L = b.cls.length;
      switch (wp.kind) {
        case 'point': return d < wp.r;
        case 'line': return U.segCross(helm._px, helm._py, b.x, b.y, wp.a.x, wp.a.y, wp.b.x, wp.b.y) || (d < Math.max(2 * L, 6));
        case 'entry': {
          if (d < wp.c * 0.6) return true;
          const f = U.vec(wp.dirIn), r = U.vec(wp.dirIn + Math.PI / 2);
          const along = (b.x - wp.mark.x) * f.x + (b.y - wp.mark.y) * f.y;
          const lat = ((b.x - wp.mark.x) * r.x + (b.y - wp.mark.y) * r.y) * wp.sg;
          return along > -wp.c * 0.7 && lat > wp.c * 0.35;
        }
        case 'apex': {
          if (d < wp.c * 0.7) return true;
          const f = U.vec(wp.dirIn), r = U.vec(wp.dirOut + Math.PI / 2);
          const along = (b.x - wp.mark.x) * f.x + (b.y - wp.mark.y) * f.y;
          const lat = ((b.x - wp.mark.x) * r.x + (b.y - wp.mark.y) * r.y) * wp.sg;
          return along > wp.c * 0.3 && lat > wp.c * 0.2; // already round the top, on the exit side
        }
        case 'exit': {
          if (d < wp.c * 0.8) return true;
          const f = U.vec(wp.dirOut), r = U.vec(wp.dirOut + Math.PI / 2);
          const along = (b.x - wp.mark.x) * f.x + (b.y - wp.mark.y) * f.y;
          const lat = ((b.x - wp.mark.x) * r.x + (b.y - wp.mark.y) * r.y) * wp.sg;
          return along > wp.c * 0.4 && lat > wp.c * 0.35;
        }
      }
      return false;
    }

    // ---------------------------------------------------------------- navigation
    function polarAngles(tws) {
      const cls = boat.cls;
      const spiOk = cls.hasSpinnaker !== 'none';
      const up = KOS.Boats.optimal(cls, Math.max(tws, 2), 'up');
      const dn = KOS.Boats.optimal(cls, Math.max(tws, 2), 'down', spiOk);
      return { up: Math.max(cls.noGo + R(2), up.twa + helm.angleBias), dn: U.clamp(dn.twa - helm.angleBias, R(120), R(178)) };
    }

    function navTo(P, wd, tws, dt) {
      const b = bearing(P);
      const twaB = U.wrapPi(wd - b);
      const a = Math.abs(twaB);
      const ang = polarAngles(tws);
      if (!helm.wantTack) helm.wantTack = boat.tack;
      const dist = U.dist(boat, P);
      const L = boat.cls.length;
      const cone = R(13 + 12 * (1 - aggression) + 6 * (1 - skill)); // how far off the wind axis before tacking over
      const over = R(1 + 7 * (1 - skill)); // layline overstand
      const lane = Math.max(3 * L, 12);
      const lateral = Math.abs(dist * Math.sin(U.angDiff(wd, b)));
      const legalCd = helm.tackCd <= 0 && lateral > lane;
      let mode;
      if (a < ang.up) {
        mode = 'beat';
        const Hs = U.wrapPi(wd - ang.up), Hp = U.wrapPi(wd + ang.up);
        const off = U.angDiff(wd, b); // + = target to the right of the wind axis
        if (legalCd) {
          if (helm.wantTack === 'starboard' && off > cone) { helm.wantTack = 'port'; helm.tackCd = 8 + 8 * (1 - skill); }
          else if (helm.wantTack === 'port' && off < -cone) { helm.wantTack = 'starboard'; helm.tackCd = 8 + 8 * (1 - skill); }
        }
        // laylines: tack when the other tack fetches (with a skill-based overstand)
        if (helm.wantTack === 'starboard' && twaB < -ang.up - over) { helm.wantTack = 'port'; helm.tackCd = 6; }
        if (helm.wantTack === 'port' && twaB > ang.up + over) { helm.wantTack = 'starboard'; helm.tackCd = 6; }
        return { H: helm.wantTack === 'starboard' ? Hs : Hp, mode };
      }
      if (a > ang.dn) {
        mode = 'run';
        const Hs = U.wrapPi(wd - ang.dn), Hp = U.wrapPi(wd + ang.dn);
        const off = U.angDiff(U.wrapPi(wd + Math.PI), b); // + = target to the right of the downwind axis
        if (legalCd) {
          if (helm.wantTack === 'starboard' && off < -cone) { helm.wantTack = 'port'; helm.tackCd = 8 + 8 * (1 - skill); }
          else if (helm.wantTack === 'port' && off > cone) { helm.wantTack = 'starboard'; helm.tackCd = 8 + 8 * (1 - skill); }
        }
        if (helm.wantTack === 'starboard' && twaB < 0 && twaB > -(ang.dn - over)) { helm.wantTack = 'port'; helm.tackCd = 6; }
        if (helm.wantTack === 'port' && twaB > 0 && twaB < ang.dn - over) { helm.wantTack = 'starboard'; helm.tackCd = 6; }
        return { H: helm.wantTack === 'starboard' ? Hs : Hp, mode };
      }
      helm.wantTack = twaB >= 0 ? 'starboard' : 'port';
      return { H: b, mode: 'reach' };
    }

    function bearing(P) { return U.bearing(boat, P); }

    // clamp a heading out of the no-go zone (keeping the side of the wanted tack)
    function legalHeading(H, wd, side) {
      const ng = boat.cls.noGo + R(3);
      const twa = U.wrapPi(wd - H);
      if (Math.abs(twa) >= ng) return H;
      const s = side === 'port' ? -1 : side === 'starboard' ? 1 : twa >= 0 ? 1 : -1;
      return U.wrapPi(wd - s * ng);
    }

    // ---------------------------------------------------------------- keep clear
    function keepClear(H, wd, env, plan, others) {
      helm.avoiding = null;
      if (!others || !others.length || !KOS.Rules) return H;
      const me = boat;
      const horizon = 4 + 5 * skill;
      let best = null;
      for (const o of others) {
        if (o === me || o.capsized) continue;
        const Lm = Math.max(me.cls.length, o.cls ? o.cls.length : o.length || 4);
        const px = o.x - me.x, py = o.y - me.y;
        const d = Math.hypot(px, py);
        if (d > 8 * Lm + 30) continue;
        const vx = (o.vx || 0) - me.vx, vy = (o.vy || 0) - me.vy;
        const v2 = vx * vx + vy * vy;
        const tc = v2 > 1e-4 ? U.clamp(-(px * vx + py * vy) / v2, 0, 30) : 0;
        if (tc > horizon) continue;
        const dc = Math.hypot(px + vx * tc, py + vy * tc);
        if (dc > 1.7 * Lm + 2) continue;
        const row = KOS.Rules.rightOfWay(me, o, { wind: wd, marks: plan.marks, mode: plan.mode });
        if (row.giveWay !== me && !row.both) continue;
        if (!best || tc < best.tc) best = { o, tc, row, Lm };
      }
      if (!best) return H;
      const o = best.o;
      helm.avoiding = best.row.rule;
      let Hav;
      const rule = best.row.rule;
      if (rule === 'C-headon') Hav = U.wrapPi(me.heading + R(35));
      else if (rule === 'R11') {
        const s = me.tack === 'starboard' ? 1 : -1;
        Hav = U.wrapPi(H + s * R(18)); // windward boat heads up, away from the leeward boat
      } else {
        // pass astern of the other boat
        const fo = U.vec(o.heading || 0, (o.cls ? o.cls.length : 4) * 1.6 + 2);
        const aim = { x: o.x - fo.x, y: o.y - fo.y };
        Hav = U.bearing(me, aim);
        if (rule === 'R12' || rule === 'C-overtaking') {
          const away = U.bearing(o, me);
          const l = U.wrapPi(U.bearing(me, o) - R(45)), r = U.wrapPi(U.bearing(me, o) + R(45));
          Hav = Math.abs(U.angDiff(H, l)) < Math.abs(U.angDiff(H, r)) ? l : r;
          void away;
        }
      }
      const urgency = U.clamp(1.4 - best.tc / horizon, 0.3, 1);
      return legalHeading(U.angLerp(H, Hav, urgency), wd, me.tack);
    }

    // ---------------------------------------------------------------- start
    function startLogic(env, plan, wd, tws, now) {
      const st = plan.start;
      const p1 = { x: U.px(st.line[0]), y: U.py(st.line[0]) }, p2 = { x: U.px(st.line[1]), y: U.py(st.line[1]) };
      const L = boat.cls.length;
      const lineDir = U.bearing(p1, p2);
      let n = U.vec(lineDir + Math.PI / 2);
      const w = U.vec(wd);
      if (n.x * w.x + n.y * w.y < 0) n = { x: -n.x, y: -n.y }; // n points to the course (windward) side
      const spot = { x: U.lerp(p1.x, p2.x, helm.startFrac), y: U.lerp(p1.y, p2.y, helm.startFrac) };
      const s = (boat.x - spot.x) * n.x + (boat.y - spot.y) * n.y; // > 0 = on the course side
      const T = st.t0 - now;
      const ang = polarAngles(tws);
      const vmgUp = U.ms(KOS.Boats.optimal(boat.cls, Math.max(2, tws), 'up').vmg) * 0.9;
      let sheetBias = 0;
      let H;
      if (s > -0.15 * L) {
        // over the line (or touching it) before the gun: dip back below
        const back = { x: spot.x - n.x * 4 * L, y: spot.y - n.y * 4 * L };
        H = navTo(back, wd, tws).H;
        return { H, sheetBias: 0, mode: 'prestart' };
      }
      const D = vmgUp * 0.8 * Math.max(0, T - helm.lateMargin); // where we want to be (distance below the line)
      const behind = -s; // distance below the line
      const lineLen = U.dist(p1, p2);
      const along = ((boat.x - p1.x) * (p2.x - p1.x) + (boat.y - p1.y) * (p2.y - p1.y)) / Math.max(1, lineLen);
      const crossFrac = h => {
        const v = U.vec(h);
        const vn = v.x * n.x + v.y * n.y;
        if (vn <= 0.05) return -1;
        const k = behind / vn;
        const cx = boat.x + v.x * k, cy = boat.y + v.y * k;
        return ((cx - p1.x) * (p2.x - p1.x) + (cy - p1.y) * (p2.y - p1.y)) / (lineLen * lineLen);
      };
      const sNow = boat.tack === 'starboard' ? 1 : -1;
      const Hcur = U.wrapPi(wd - sNow * ang.up), Hoth = U.wrapPi(wd + sNow * ang.up);
      const fc = crossFrac(Hcur), fo = crossFrac(Hoth);
      if (along < -2 * L || along > lineLen + 2 * L || behind > D + 12 * L) {
        H = navTo(T > 1 ? hold : spot, wd, tws).H; // get into position first
      } else {
        // final approach: sail the current tack to any point on the line (prefer starboard), tack if it misses
        H = Hcur;
        if (fc < 0.05 || fc > 0.95) { if (fo >= 0.05 && fo <= 0.95) H = Hoth; }
        else if (boat.tack === 'port' && T > 12 && fo >= 0.1 && fo <= 0.9) H = Hoth;
        const vn = boat.vx * n.x + boat.vy * n.y; // speed towards the line
        const early = T - behind / Math.max(0.3, vn);
        const trigger = T < boat.cls.accelT * (0.7 + 0.5 * skill) && behind > 0.4 * L + boat.speed * T * 0.6; // sheet in and go
        if (!trigger && (behind < D - Math.max(0.5 * L, 3) || (vn > 0.3 && early > 1.2 + (1 - skill) * 2 + 0.9 / boat.cls.turnRate) || (behind < 0.8 * L && T > 1))) {
          // ahead of schedule: luff to burn time, or reach away when far too early
          sheetBias = U.clamp(Math.max((D - behind) / (6 * L), early / 8), 0.3, 0.9);
          if (T > 25 && behind < 3 * L) { H = U.wrapPi(wd - sNow * R(100)); sheetBias = 0; }
          else {
            // run parallel to the line with sheets eased (heavy boats coast too far if they luff towards it)
            const l1 = lineDir, l2 = U.wrapPi(lineDir + Math.PI);
            let Hp = Math.abs(U.angDiff(boat.heading, l1)) < Math.abs(U.angDiff(boat.heading, l2)) ? l1 : l2;
            const fp = ((boat.x + U.vec(Hp).x * 3 * L - p1.x) * (p2.x - p1.x) + (boat.y + U.vec(Hp).y * 3 * L - p1.y) * (p2.y - p1.y)) / (lineLen * lineLen);
            if (fp < 0.05 || fp > 0.95) Hp = Hp === l1 ? l2 : l1; // turn back before the line end
            H = legalHeading(behind < 2 * L ? Hp : U.angLerp(Hp, U.wrapPi(wd - sNow * (ang.up + R(10))), 0.4), wd, boat.tack);
          }
        }
      }
      return { H, sheetBias, mode: 'prestart' };
    }

    // ---------------------------------------------------------------- controls
    function steer(H, dt) {
      const b = boat;
      const wob = (1 - skill) * R(7) * U.noise1(nseed, b.t / 6) + (1 - skill) * R(3) * U.noise1(nseed ^ 99, b.t / 1.7);
      const e = U.angDiff(b.heading, U.wrapPi(H + wob));
      const kp = 2.6 * (0.7 + 0.3 * skill), kd = 0.9;
      let r = U.clamp(e * kp - b.yawRate * kd, -1, 1);
      if (b.speed < -0.05) r = -r;
      return r;
    }

    function think(env, plan, others) {
      env = env || {};
      plan = plan || {};
      const b = boat;
      const now = nowOf(env);
      const dt = helm._lastT === null ? KOS.DT : U.clamp(now - helm._lastT, 0, 0.5) || KOS.DT;
      helm._lastT = now;
      helm.tackCd = Math.max(0, helm.tackCd - dt);
      const c = KOS.Physics.controls();
      const wind = env.wind;
      const w = wind && wind.at ? wind.at(b.x, b.y) : { dir: 0, speed: 0 };
      const wd = w.dir, tws = w.speed;

      // route bookkeeping (rebuild when the course object changes)
      const subFor = leg => { const i = helm._route.findIndex(r => r.leg >= leg); return i < 0 ? helm._route.length : i; };
      const sig = routeSig(plan);
      if (sig !== helm._sig) {
        helm._sig = sig;
        helm._route = buildRoute(plan);
        helm.sub = subFor(helm.leg);
      }
      if (typeof plan.leg === 'number' && plan.leg !== helm._planLeg) {
        helm._planLeg = plan.leg; helm.leg = plan.leg; helm.sub = subFor(plan.leg);
        if (helm.sub < helm._route.length) { helm.finished = false; helm.finishT = null; }
      }
      const route = helm._route;

      if (b.cls.isMotor) {
        const out = motorThink(env, plan, others, route, now);
        helm._px = b.x; helm._py = b.y;
        return out;
      }

      if (b.capsized) { helm.state = 'capsized'; helm._px = b.x; helm._py = b.y; return c; }

      let H, mode, sheetBias = 0;
      const prestart = plan.start && now < plan.start.t0;
      if (prestart) {
        const r = startLogic(env, plan, wd, tws, now);
        H = r.H; mode = r.mode; sheetBias = r.sheetBias;
        helm.target = null;
      } else {
        // OCS at the gun -> must return below the line
        if (plan.start && helm._gunChecked !== plan.start.t0) {
          helm._gunChecked = plan.start.t0;
          const p1 = plan.start.line[0], p2 = plan.start.line[1];
          let n = U.vec(U.bearing({ x: U.px(p1), y: U.py(p1) }, { x: U.px(p2), y: U.py(p2) }) + Math.PI / 2);
          const wv = U.vec(wd);
          if (n.x * wv.x + n.y * wv.y < 0) n = { x: -n.x, y: -n.y };
          const s = (b.x - U.px(p1)) * n.x + (b.y - U.py(p1)) * n.y;
          helm.ocs = s > 0.3 && plan.start.recall !== false;
          helm._ocsN = n;
        }
        if (helm.ocs) {
          const p1 = plan.start.line[0], p2 = plan.start.line[1];
          const mid = { x: (U.px(p1) + U.px(p2)) / 2, y: (U.py(p1) + U.py(p2)) / 2 };
          const s = (b.x - mid.x) * helm._ocsN.x + (b.y - mid.y) * helm._ocsN.y;
          if (s < -0.5 * b.cls.length) helm.ocs = false;
          else {
            const back = { x: mid.x - helm._ocsN.x * 3 * b.cls.length, y: mid.y - helm._ocsN.y * 3 * b.cls.length };
            const r = navTo(back, wd, tws, dt);
            H = r.H; mode = 'ocs';
          }
        }
        if (H === undefined) {
          while (helm.sub < route.length && reached(route[helm.sub], plan)) {
            helm.sub++;
            const nx = route[helm.sub];
            helm.leg = nx ? nx.leg : route.length ? route[route.length - 1].leg + 1 : 0;
            if (nx && nx.leg !== (route[helm.sub - 1] || {}).leg) helm.tackCd = Math.min(helm.tackCd, 2);
          }
          if (helm.sub >= route.length) {
            if (!helm.finished) { helm.finished = true; helm.finishT = now; }
            helm.state = 'finished';
            // cruise slowly on a close reach after finishing
            const s = b.tack === 'starboard' ? 1 : -1;
            H = U.wrapPi(wd - s * (b.cls.noGo + R(25)));
            mode = 'finished';
            sheetBias = 0.45;
          } else {
            const wp = route[helm.sub];
            helm.target = wp;
            const r = navTo(wp, wd, tws, dt);
            H = r.H; mode = r.mode;
          }
        }
      }

      // keep clear of right-of-way boats
      const H2 = keepClear(H, wd, env, plan, others);
      if (helm.avoiding) mode = 'avoid';
      H = H2;

      // don't try to tack without enough boat speed: build speed on the current tack first
      const twaH = U.wrapPi(wd - H), twaNow = U.wrapPi(wd - b.heading);
      const wantsTack = !b.inIrons && Math.abs(twaH) < Math.PI / 2 && Math.sign(twaH) !== Math.sign(twaNow) && Math.abs(twaNow) < Math.PI / 2;
      const vRef = U.ms(b.cls.polar(b.cls.noGo + R(8), tws));
      if (!wantsTack) helm.building = false;
      else if (!helm.building && Math.abs(twaNow) > b.cls.noGo && b.speed < vRef * (0.55 + 0.15 * (1 - skill))) { helm.building = true; helm.buildT = 0; } // never abort a tack under way
      else if (helm.building) {
        helm.buildT += dt;
        if (b.speed > Math.min(vRef * 0.85, U.ms(b.targetKn) * 0.88) || helm.buildT > 10) helm.building = false;
      }
      if (wantsTack && helm.building) {
        const sNow = twaNow >= 0 ? 1 : -1;
        H = U.wrapPi(wd - sNow * (b.cls.noGo + R(14)));
        mode = 'build';
        sheetBias = 0;
      }
      // in irons: fall off on the side the bow is already pointing, then sail
      if (b.inIrons) helm.ironsT += dt; else helm.ironsT = 0;
      if (b.inIrons && helm.ironsT > 1.2) { // give a slow tack a moment before bailing out
        mode = 'irons';
        const sNow = twaNow >= 0 ? 1 : -1;
        H = U.wrapPi(wd - sNow * (b.cls.noGo + R(30)));
        helm.wantTack = sNow > 0 ? 'starboard' : 'port';
        helm.tackCd = Math.max(helm.tackCd, 4);
      }

      helm.state = mode;
      c.rudder = steer(H, dt);
      c.autoTrim = true;
      c.trimBias = helm.trimErr + sheetBias + (1 - skill) * 0.05 * U.noise1(nseed ^ 7, b.t / 4);
      c.autoHike = false;
      c.hike = U.clamp(KOS.Physics.neededHike(b) * (0.72 + 0.28 * skill) + (b.maneuverT > 0 ? 0 : 0.02), 0, 1);

      // spinnaker / gennaker
      if (b.cls.hasSpinnaker !== 'none') {
        const twaH = Math.abs(U.wrapPi(wd - H));
        const lo = b.cls.hasSpinnaker === 'asym' ? R(100) : R(110);
        const nearMark = helm.target && U.dist(b, helm.target) < 3 * b.cls.length && helm.target.kind !== 'point';
        if (!helm.spi && twaH > lo + R(5) && !prestart && !nearMark && Math.abs(U.wrapPi(wd - b.heading)) > lo) helm.spi = true;
        else if (helm.spi && (twaH < lo - R(8) || nearMark && helm.target.kind === 'entry')) helm.spi = false;
        c.spinnaker = helm.spi;
      }
      helm._px = b.x; helm._py = b.y;
      return c;
    }

    // ---------------------------------------------------------------- RIB
    function motorThink(env, plan, others, route, now) {
      const b = boat;
      const c = KOS.Physics.controls();
      while (helm.sub < route.length && reached(route[helm.sub], plan)) helm.sub++;
      if (helm.sub >= route.length) {
        if (!helm.finished) { helm.finished = true; helm.finishT = now; }
        helm.state = 'finished';
        c.throttle = 0; c.rudder = 0;
        return c;
      }
      const wp = route[helm.sub];
      helm.target = wp;
      helm.leg = wp.leg;
      let H = U.bearing(b, wp);
      const wd = env.wind && env.wind.at ? env.wind.at(b.x, b.y).dir : 0;
      H = keepClearMotor(H, wd, plan, others);
      const e = U.angDiff(b.heading, H);
      const d = U.dist(b, wp);
      const last = helm.sub === route.length - 1;
      let thr = U.clamp(d / 40, 0.3, 1) * (0.85 + 0.15 * skill);
      thr *= 1 - 0.6 * U.clamp(Math.abs(e) / Math.PI, 0, 1);
      if (last) thr = Math.min(thr, U.clamp(d / 25, 0.15, 1));
      c.throttle = thr;
      c.rudder = U.clamp(e * 2.2 - b.yawRate * 0.6, -1, 1);
      helm.state = helm.avoiding ? 'avoid' : 'motor';
      return c;
    }

    function keepClearMotor(H, wd, plan, others) {
      helm.avoiding = null;
      if (!others || !KOS.Rules) return H;
      for (const o of others) {
        if (o === boat) continue;
        const d = U.dist(boat, o);
        if (d > 40) continue;
        const px = o.x - boat.x, py = o.y - boat.y;
        const vx = (o.vx || 0) - boat.vx, vy = (o.vy || 0) - boat.vy;
        const v2 = vx * vx + vy * vy;
        const tc = v2 > 1e-4 ? U.clamp(-(px * vx + py * vy) / v2, 0, 20) : 0;
        if (tc > 6) continue;
        const dc = Math.hypot(px + vx * tc, py + vy * tc);
        if (dc > 12) continue;
        const row = KOS.Rules.rightOfWay(boat, o, { wind: wd, mode: 'colreg' });
        if (row.giveWay !== boat && !row.both) continue;
        helm.avoiding = row.rule;
        return U.wrapPi(H + R(45)); // alter course to starboard, pass astern
      }
      return H;
    }

    helm.think = think;
    helm.reset = function () { helm.leg = 0; helm.sub = 0; helm.finished = false; helm.finishT = null; helm._sig = null; helm._planLeg = undefined; helm.ocs = false; helm._gunChecked = undefined; };
    return helm;
  }

  KOS.AI = { createHelm };
})(typeof window !== 'undefined' ? window : globalThis);
