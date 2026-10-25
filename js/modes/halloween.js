// KØS SEJL — js/modes/halloween.js
// Temporary Halloween event: "Græskarjagt i mørket" / "Pumpkin hunt in the dark" (activity 'halloween.hunt').
// Only exists while KOS.Season.active('halloween') (24 Oct - 9 Nov 2026, local time; js/ui/season.js): the activity
// carries `season: 'halloween'`, so KOS.Activities hides it (lists, get, deep links) outside the window.
// Area 'event' is not a hub area: the hub reaches it through its own pumpkin promo pin and the "Alle steder" list
// (js/ui/hub.js), not through an area screen.
//
// Night sailing in Svanemøllebugten off the club (venue 'bay') in an Optimist with a steady moderate breeze. Glowing
// jack-o'-lanterns float about: sail through them to collect them. Ghost boats drift on fixed looping routes; touching
// one costs 10 seconds (a purple "BUUH!" flash). A lantern-light circle around the boat; drifting fog. Night drawing is
// the same technique as nav.js drawNight (a screen overlay that darkens everything except a radial hole round the boat).
// Ends when every pumpkin is collected or after 6 minutes of sailing. Test hooks: setAutopilot(on), skipIntro(), state, boat.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    area: { event: { name: 'Halloween', desc: 'Græskarjagt i mørket – kun til 9. nov.' } },
    halloween: {
      title: 'Græskarjagt i mørket',
      promo: 'Græskarjagt i mørket – kun til 9. nov.',
      pinName: 'Græskarjagt i mørket', pinSub: 'Kun til 9. nov.',
      toast: 'Halloween i havnen! Prøv Græskarjagt i mørket – kun til 9. nov.',
      hud: { pumpkins: 'Græskar', ghosts: 'Spøgelser' },
      stat: { pumpkins: 'Græskar samlet', ghosts: 'Spøgelsesbåde ramt', penalty: 'Strafsekunder' },
      intro: 'Det er Halloween-aften i havnen! Sejl gennem de lysende græskar og saml dem alle. Pas på spøgelsesbådene – rører du én, koster det 10 sekunder. Buuh!',
      keys: 'Styr med ← →.',
      fx: { got: 'Græskar!', boo: 'BUUH!', all: 'Alle græskar!' },
      tip: {
        boo: 'Uha! Spøgelsesbådene koster 10 sekunder. Sejl udenom dem!',
        arrow: 'Pilen viser vej til det nærmeste græskar.',
        half: 'Halvvejs! Bliv ved – græskarrene lyser i mørket.',
        minute: 'Et minut tilbage – skynd dig!',
      },
      res: {
        all: 'Du fandt alle {n} græskar på {time}! Spøgelsesbåde ramt: {g}.',
        some: 'Du fandt {got} af {n} græskar. Spøgelsesbåde ramt: {g}.',
        none: 'Græskarrene gemte sig i mørket. Prøv igen!',
      },
    },
  });
  KOS.I18n.add('en', {
    area: { event: { name: 'Halloween', desc: 'Pumpkin hunt in the dark – until 9 Nov.' } },
    halloween: {
      title: 'Pumpkin hunt in the dark',
      promo: 'Pumpkin hunt in the dark – until 9 Nov',
      pinName: 'Pumpkin hunt in the dark', pinSub: 'Until 9 Nov',
      toast: 'Halloween in the harbour! Try the Pumpkin hunt in the dark – until 9 Nov.',
      hud: { pumpkins: 'Pumpkins', ghosts: 'Ghosts' },
      stat: { pumpkins: 'Pumpkins collected', ghosts: 'Ghost boats hit', penalty: 'Penalty seconds' },
      intro: 'It is Halloween night in the harbour! Sail through the glowing pumpkins and collect them all. Watch out for the ghost boats – touch one and it costs 10 seconds. Boo!',
      keys: 'Steer with ← →.',
      fx: { got: 'Pumpkin!', boo: 'BOO!', all: 'All pumpkins!' },
      tip: {
        boo: 'Eek! Ghost boats cost 10 seconds. Sail around them!',
        arrow: 'The arrow points to the nearest pumpkin.',
        half: 'Halfway! Keep going – the pumpkins glow in the dark.',
        minute: 'One minute left – hurry!',
      },
      res: {
        all: 'You found all {n} pumpkins in {time}! Ghost boats hit: {g}.',
        some: 'You found {got} of {n} pumpkins. Ghost boats hit: {g}.',
        none: 'The pumpkins hid in the dark. Try again!',
      },
    },
  });

  // ======================================================================== 2. activity (seasonal)
  KOS.Activities.add({
    id: 'halloween.hunt', mode: 'halloween', area: 'event', season: 'halloween', boat: 'opti', order: 10,
    icon: 'pumpkin', minutes: 4, difficulty: 1, unlock: null,
    title: { da: 'Græskarjagt i mørket', en: 'Pumpkin hunt in the dark' },
    desc: { da: 'Halloween-nat i bugten: saml de lysende græskar og undgå spøgelsesbådene.', en: 'Halloween night in the bay: collect the glowing pumpkins and dodge the ghost boats.' },
    params: { venue: 'bay', windDeg: 225, windKn: 9, gust: 0.08, shift: 0.05, seed: 3110, limit: 360, penalty: 10 },
  });

  // pumpkins, relative to the venue spawn (m, x east, y south): a ring stretched across the SW wind, so most legs are
  // reaches (easy for a beginner Optimist) and only the two ends go a little up/downwind. Checked against land on start.
  const PUMPKINS = [[53, 53], [58, 28], [37, -4], [6, -40], [-30, -55], [-55, -50], [-58, -28], [-37, 4], [-6, 40], [28, 58]];
  // ghost loops: centre (rel. to spawn), radii, angular speed (rad/s, sign = direction), start phase.
  // One circles the middle, one each end of the ring, three more guard pumpkins on the ring. When you come close they
  // hunt you (GHOST_CHASE), but always slower than an Optimist, tethered to their loop, and they give up after a while.
  const GHOSTS = [
    { cx: 0, cy: 0, rx: 22, ry: 22, w: 0.05, ph: Math.PI / 2 },
    { cx: 76, cy: 76, rx: 20, ry: 20, w: -0.06, ph: Math.PI },
    { cx: -76, cy: -76, rx: 20, ry: 20, w: 0.06, ph: 0 },
    { cx: 48, cy: -26, rx: 16, ry: 12, w: 0.07, ph: 1 },
    { cx: -48, cy: 26, rx: 16, ry: 12, w: -0.07, ph: 2.5 },
    { cx: -30, cy: -78, rx: 14, ry: 18, w: 0.06, ph: 4 },
  ];
  // per help level: notice range (m), hunting speed (m/s), tether from the loop (m), seconds before giving up
  const GHOST_CHASE = { easy: { r: 26, v: 0.8, tether: 25, give: 6 }, normal: { r: 34, v: 1.25, tether: 35, give: 9 }, pro: { r: 44, v: 1.7, tether: 45, give: 12 } };

  KOS.Modes.register('halloween', { kind: 'sea', create(host, activity) { return createHunt(host, activity); } });

  function createHunt(host, activity) {
    const P = Object.assign({ venue: 'bay', windDeg: 225, windKn: 9, gust: 0.08, shift: 0.05, seed: 3110, limit: 360, penalty: 10 }, activity.params || {});
    const assist = host.assist || 'easy';
    const easy = assist === 'easy', pro = assist === 'pro';
    const clsId = 'opti';
    const cls = KOS.Boats.get(clsId);
    const profile = host.profile || {};
    const venue = KOS.World.get(P.venue) || KOS.World.get('bay');
    const sp = venue.spawn;
    const reduce = !!(KOS.UI && KOS.UI.reduced && KOS.UI.reduced());

    const S = {
      phase: 'intro', time: 0, penalty: 0, hits: 0, got: 0, tips: {}, tipT: -99, hudT: 0, ambT: 0, booT: 0, finishT: -1, result: null, warned: false,
      pumpkins: [], ghosts: [], fog: [],
    };
    for (const p of PUMPKINS) {
      let x = sp.x + p[0], y = sp.y + p[1];
      for (let i = 0; i < 8 && KOS.World.hit(venue, x, y, 6); i++) { x += (sp.x - x) * 0.2; y += (sp.y - y) * 0.2; } // nudge towards open water
      S.pumpkins.push({ x, y, taken: false, ph: (x * 0.31 + y * 0.17) % TAU, pop: 0 });
    }
    S.ghosts = GHOSTS.map(g => ({ cx: sp.x + g.cx, cy: sp.y + g.cy, rx: g.rx, ry: g.ry, w: g.w, a: g.ph, x: 0, y: 0, h: 0, cool: 0, ox: 0, oy: 0, hunt: 0, rest: 0 }));
    const CH = GHOST_CHASE[assist] || GHOST_CHASE.normal;
    const rnd = U.rng(P.seed);
    for (let i = 0; i < 9; i++) S.fog.push({ x: sp.x + (rnd() - 0.5) * 360, y: sp.y + (rnd() - 0.5) * 360, r: 45 + rnd() * 50, a: 0.1 + rnd() * 0.08 });
    placeGhosts(0);

    // ---- wind, boat
    const wind = KOS.Wind.create({ dir: U.rad(P.windDeg), speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: sp.x - 300, y0: sp.y - 300, x1: sp.x + 300, y1: sp.y + 300 } });
    for (let i = 0; i < 100; i++) wind.update(0.5);
    const env = { wind, venue, assist, t: 0 };
    const boat = KOS.Physics.createBoat(clsId, {
      x: sp.x, y: sp.y, heading: U.rad(P.windDeg) + Math.PI / 2, speed: 0.6, isPlayer: true,
      sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : 'DEN 1', name: profile.name || '',
      colors: profile.boatColor ? { hull: profile.boatColor } : undefined,
    });
    let controls = KOS.Physics.controls();
    controls.autoTrim = !pro;
    controls.autoHike = easy;

    // ---- scene
    const scene = new KOS.SailScene(host.canvas, { tilt: host.tilt, tiltAuto: host.tiltAuto,
      venue, wind, boats: [boat], follow: boat, marks: [], lines: [], showWindArrow: true, windArrowOnTop: true, showNoGo: false, night: 0 });
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawScreen, { screen: true });
    let userZoom = 1;
    function applyZoom() {
      const small = Math.min(scene.w, scene.h) < 600;
      const span = (40 + 5 * cls.length) * 1.2 * (small ? 0.85 : 1);
      scene.setZoom(1);
      scene.setZoom(Math.sqrt(scene.w * scene.h) * (small ? 1.3 : 1) / span / scene.baseZoom() * userZoom);
    }
    applyZoom();
    const onWheel = e => { e.preventDefault(); userZoom = U.clamp(userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2); applyZoom(); };
    host.layer.addEventListener('wheel', onWheel, { passive: false });

    // ---- controls + HUD
    const ctrl = KOS.Input.attach(host.layer, Object.assign({
      layout: 'sail', spinnaker: false, hike: !easy, hikeKeel: false, autoTrim: controls.autoTrim, pauseButton: false,
    }, KOS.SailAids.inputOpts(cls, assist)));
    const aids = KOS.SailAids.create({ ctrl, boat, assist, coach: txt => { S.tipT = S.time; KOS.UI.coach(txt, { ms: 5600 }); } });
    const hud = KOS.UI.hud(host.layer, ['speed', 'timer',
      { id: 'pk', icon: 'pumpkin', labelKey: 'halloween.hud.pumpkins' }, { id: 'gh', icon: 'ghost', labelKey: 'halloween.hud.ghosts' }]);
    const booEl = document.createElement('div'); booEl.className = 'hw-boo'; host.layer.appendChild(booEl);

    const handlers = {
      'boat:tack': e => { if (e.boat === boat) sfx('tack'); },
      'boat:gybe': e => { if (e.boat === boat) sfx('gybe'); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);

    // ==================================================================== helpers
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function floatText(str, color, x, y, size) { if (scene.effects) scene.effects.text(x, y, str, { color, size: size || 24 }); }
    function tip(key, force) {
      if (S.tips[key] && !force) return;
      if (S.time - S.tipT < 5 && !force) return;
      S.tips[key] = true; S.tipT = S.time;
      KOS.UI.coach(t('halloween.tip.' + key), { ms: 5000, mood: key === 'boo' ? 'oops' : undefined });
    }
    function nearest() {
      let best = null, bd = Infinity;
      for (const p of S.pumpkins) { if (p.taken) continue; const d = Math.hypot(p.x - boat.x, p.y - boat.y); if (d < bd) { bd = d; best = p; } }
      return best;
    }
    function placeGhosts(dt) {
      for (const g of S.ghosts) {
        g.a += g.w * dt;
        const lx = g.cx + Math.cos(g.a) * g.rx, ly = g.cy + Math.sin(g.a) * g.ry;
        // hunting: drift the offset from the loop towards the boat; after `give` s (or a hit) rest and float home
        if (dt && S.phase === 'go' && S.time > 3) {
          const dx = boat.x - (lx + g.ox), dy = boat.y - (ly + g.oy), d = Math.hypot(dx, dy);
          if (g.rest > 0) g.rest -= dt;
          const chase = g.rest <= 0 && g.cool <= 0 && d < CH.r && d > 0.5;
          g.hunt = chase ? g.hunt + dt : 0;
          if (chase && g.hunt > CH.give) { g.rest = 5; g.hunt = 0; }
          if (chase) { g.ox += dx / d * CH.v * dt; g.oy += dy / d * CH.v * dt; }
          else { const o = Math.hypot(g.ox, g.oy); if (o > 0.01) { const k = Math.max(0, o - 1.0 * dt) / o; g.ox *= k; g.oy *= k; } }
          const o = Math.hypot(g.ox, g.oy);
          if (o > CH.tether) { g.ox *= CH.tether / o; g.oy *= CH.tether / o; }
        }
        const nx = lx + g.ox, ny = ly + g.oy;
        if (dt) g.h = U.heading(nx - g.x, ny - g.y);
        g.x = nx; g.y = ny;
        if (g.cool > 0) g.cool -= dt;
      }
    }

    // ==================================================================== rules
    function collect() {
      const R = 4.2 + cls.length * 0.5;
      for (const p of S.pumpkins) {
        if (p.taken || Math.hypot(p.x - boat.x, p.y - boat.y) > R) continue;
        p.taken = true; p.pop = 0.001; S.got++;
        sfx('coin', { pitch: 1 + 0.06 * S.got }); sfx('pop', { vol: 0.5 });
        if (scene.effects) { scene.effects.stars(p.x, p.y, 12); scene.effects.ripple(p.x, p.y, 4, 0.8); }
        floatText(t('halloween.fx.got'), '#ffb547', p.x, p.y - 2);
        if (KOS.Input.haptic) KOS.Input.haptic(20);
        if (S.got === Math.ceil(S.pumpkins.length / 2)) tip('half');
        if (S.got >= S.pumpkins.length) { floatText(t('halloween.fx.all'), '#ffd25e', boat.x, boat.y - 5, 30); complete(); }
      }
    }
    function ghosts() {
      if (S.time < 3) return;
      const R = 4.5 + cls.length * 0.5;
      for (const g of S.ghosts) {
        if (g.cool > 0 || Math.hypot(g.x - boat.x, g.y - boat.y) > R) continue;
        g.cool = 6; g.rest = 6; g.hunt = 0; S.hits++; S.penalty += P.penalty;
        sfx('whoosh', { pitch: 0.55, vol: 0.9 }); sfx('bump', { vol: 0.5 });
        if (!reduce) scene.shake(0.35);
        booEl.className = 'hw-boo'; void booEl.offsetWidth; booEl.className = 'hw-boo on';
        S.booT = 0.9;
        floatText(t('halloween.fx.boo'), '#d9b8ff', g.x, g.y - 3, 34);
        floatText('+' + P.penalty + ' s', '#ff6b78', boat.x, boat.y + 3, 22);
        if (KOS.Input.haptic) KOS.Input.haptic([30, 40, 30]);
        tip('boo', !S.tips.boo);
      }
    }
    function complete() {
      if (S.phase !== 'go') return;
      S.phase = 'done'; S.finishT = 2.0;
      const N = S.pumpkins.length, time = S.time + S.penalty, frac = S.got / N;
      const ref = easy ? 330 : pro ? 260 : 300;
      let stars;
      if (S.got >= N) stars = time <= ref && S.hits <= 2 ? 3 : 2;
      else if (frac >= 0.85) stars = S.hits <= 1 ? 2 : 1;
      else if (frac >= 0.3) stars = 1;
      else stars = 0;
      const success = stars > 0;
      sfx(success ? 'win' : 'lose', { vol: 0.6 }); if (stars === 3) sfx('cheer', { vol: 0.5 });
      if (success && scene.effects) { scene.effects.confetti(boat.x, boat.y, 120); scene.effects.text(boat.x, boat.y - 4, '★'.repeat(stars), { color: '#ffd25e', size: 36 }); }
      const stats = { 'halloween.stat.pumpkins': S.got + '/' + N, 'halloween.stat.ghosts': S.hits };
      if (S.penalty) stats['halloween.stat.penalty'] = S.penalty;
      S.result = {
        stars, success, timeMs: Math.round(time * 1000),
        score: Math.max(0, Math.round(S.got * 100 + (S.got >= N ? Math.max(0, P.limit - time) * 3 : 0) - S.hits * 50)),
        stats,
        msgKey: S.got >= N ? 'halloween.res.all' : S.got ? 'halloween.res.some' : 'halloween.res.none',
        msgVars: { n: N, got: S.got, g: S.hits, time: KOS.UI.fmtTime(time * 1000) },
      };
    }

    // ==================================================================== drawing
    function drawWorld(ctx, sc) {
      // pumpkins (world space, upright): the glow is added on top of the darkness in drawScreen
      const mpp = sc.mpp, tm = sc.t, r = Math.max(1.5, 13 * mpp);
      for (const p of S.pumpkins) {
        if (p.taken && !(p.pop > 0 && p.pop < 0.5)) continue;
        ctx.save(); ctx.translate(p.x, p.y); if (sc.camera.rot) ctx.rotate(-sc.camera.rot);
        if (p.pop > 0) { const a = p.pop / 0.5; ctx.globalAlpha = 1 - a; ctx.scale(1 + a, 1 + a); }
        ctx.fillStyle = 'rgba(0,10,30,.25)'; ctx.beginPath(); ctx.ellipse(0.3 * r, 0.9 * r, r * 1.05, r * 0.35, 0, 0, TAU); ctx.fill();
        KOS.Spooky.drawPumpkin(ctx, 0, 0, r, reduce ? 0 : tm + p.ph);
        ctx.restore();
      }
    }
    function drawScreen(ctx, sc) {
      const W = sc.w, H = sc.h, bp = sc.worldToScreen(boat.x, boat.y), tm = reduce ? 0 : sc.t;
      // fog: soft lilac banks drifting downwind (static with reduced motion)
      const wv = U.vec(U.rad(P.windDeg) + Math.PI), drift = tm * 0.9;
      for (const f of S.fog) {
        let fx = f.x + wv.x * drift, fy = f.y + wv.y * drift;
        fx = boat.x + ((((fx - boat.x) + 180) % 360) + 360) % 360 - 180; fy = boat.y + ((((fy - boat.y) + 180) % 360) + 360) % 360 - 180;
        const p = sc.worldToScreen(fx, fy), rr = f.r / sc.mpp;
        if (p.x < -rr || p.x > W + rr || p.y < -rr || p.y > H + rr) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        g.addColorStop(0, 'rgba(205,195,255,' + f.a + ')'); g.addColorStop(1, 'rgba(205,195,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
      }
      // darkness with a lantern circle round the boat
      const R = Math.max(90, Math.min(16 / sc.mpp, 0.26 * Math.max(W, H)));
      const g = ctx.createRadialGradient(bp.x, bp.y, R * 0.25, bp.x, bp.y, R * 1.8);
      g.addColorStop(0, 'rgba(10,6,30,0.1)'); g.addColorStop(0.55, 'rgba(10,6,30,0.58)'); g.addColorStop(1, 'rgba(8,4,24,0.88)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      KOS.Spooky.glow(ctx, bp.x, bp.y, R * 0.7, 0.16, '255,170,70'); // the lantern
      // pumpkins glow through the dark (the near ones are also drawn crisp again on top)
      const pr = Math.max(10, 1.5 / sc.mpp);
      const vis = [];
      for (const p of S.pumpkins) {
        if (p.taken) continue;
        const q = sc.worldToScreen(p.x, p.y);
        if (q.x < -60 || q.x > W + 60 || q.y < -60 || q.y > H + 60) continue;
        const fl = reduce ? 1 : 0.85 + 0.15 * Math.sin(sc.t * 5 + p.ph * 3);
        KOS.Spooky.glow(ctx, q.x, q.y, pr * 3.2, 0.55 * fl);
        vis.push(q);
      }
      // ghost boats: faint blue glow (always), the sprite brighter inside the lantern light
      for (const gh of S.ghosts) {
        const q = sc.worldToScreen(gh.x, gh.y);
        if (q.x < -80 || q.x > W + 80 || q.y < -80 || q.y > H + 80) continue;
        KOS.Spooky.glow(ctx, q.x, q.y, Math.max(30, 7 / sc.mpp), gh.cool > 0 ? 0.12 : 0.3, '150,190,255');
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const q of vis) KOS.Spooky.drawPumpkin(ctx, q.x, q.y, pr, 0, { still: true });
      for (const gh of S.ghosts) {
        const q = sc.worldToScreen(gh.x, gh.y);
        if (q.x < -80 || q.x > W + 80 || q.y < -80 || q.y > H + 80) continue;
        const d = Math.hypot(q.x - bp.x, q.y - bp.y), near = U.clamp(1 - (d - R) / R, 0, 1);
        const wob = reduce ? 0 : Math.sin(sc.t * 2 + gh.cx) * 0.08;
        const a = (gh.cool > 0 ? 0.3 : 0.45 + 0.4 * near) * (reduce ? 1 : 0.9 + 0.1 * Math.sin(sc.t * 3 + gh.cy));
        KOS.Spooky.drawGhost(ctx, q.x, q.y, Math.max(44, 9 / sc.mpp), gh.h - (sc.camera.rot || 0), a, wob);
      }
      drawArrow(ctx, sc);
    }
    function drawArrow(ctx, sc) {
      if (S.phase !== 'go' || pro) return;
      const tg = nearest(); if (!tg) return;
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, H = sc.h;
      const hb = hud.el.getBoundingClientRect(), land = H < 500;
      const m = { l: land ? 150 : 34, r: land ? KOS.Input.sideR(ctrl) : 34, t: Math.max(60, hb.bottom + 34), b: land ? 60 : W < 700 ? 190 : 130 };
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < H - m.b) return; // on screen: it glows by itself
      if (!S.tips.arrow && S.time > 4) tip('arrow');
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? H - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx), pulse = reduce ? 1 : 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(20,10,40,0.78)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(Math.round(Math.hypot(tg.x - boat.x, tg.y - boat.y)) + ' m', ax, ay);
    }

    // ==================================================================== instance
    let introCd = null, coachIntro = null;
    function start() {
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      ambient();
      coachIntro = KOS.UI.coach(t('halloween.intro') + (touch ? '' : '  ' + t('halloween.keys') + aids.keys()), { ms: 8500 });
      S.phase = 'intro';
      introCd = KOS.UI.countdown(host.layer, 3, () => { introCd = null; if (S.phase === 'intro') { S.phase = 'go'; sfx('horn'); } });
    }
    function update(dt) {
      env.t += dt;
      wind.update(dt);
      if ((S.windT = (S.windT || 0) + dt) > 2) { S.windT = 0; wind.recenter(boat.x, boat.y); }
      placeGhosts(dt);
      for (const p of S.pumpkins) if (p.pop > 0 && p.pop < 0.5) p.pop += dt;
      if (S.booT > 0) { S.booT -= dt; if (S.booT <= 0) booEl.className = 'hw-boo'; }
      if (S.phase === 'intro') {
        const hold = { x: boat.x, y: boat.y, heading: boat.heading, distanceSailed: boat.distanceSailed };
        controls = KOS.Input.toControls(ctrl.state, boat, controls, dt); controls.rudder = 0;
        KOS.Physics.step(boat, controls, env, dt);
        Object.assign(boat, hold);
        hudTick(dt);
        return;
      }
      controls = KOS.Input.toControls(ctrl.state, boat, controls, dt);
      if (easy) controls.autoHike = true;
      aids.apply(controls);
      if (autopilot && S.phase === 'go') {
        const tg = nearest();
        const key = tg ? S.pumpkins.indexOf(tg) : -1;
        if (key !== autoKey) { autoKey = key; autopilot.reset(); }
        if (tg) controls = Object.assign(controls, autopilot.think(env, { target: { x: tg.x, y: tg.y, r: 1 } }, [boat]));
      }
      KOS.Physics.step(boat, controls, env, dt);
      KOS.Physics.collide([boat], venue, []);
      if (controls.autoTrim) ctrl.setSheet(boat.sheet);
      aids.tick(dt, S.phase === 'go');
      if (S.phase === 'go') {
        S.time += dt;
        collect();
        ghosts();
        if (!S.warned && S.time > P.limit - 60) { S.warned = true; tip('minute', true); }
        if (S.time >= P.limit) complete();
      }
      if (S.phase === 'done' && S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      hudTick(dt);
    }
    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        hud.update({ speed: U.kn(Math.abs(boat.speed)), timer: (S.time + S.penalty) * 1000,
          custom: { pk: S.got + '<small>/' + S.pumpkins.length + '</small>', gh: String(S.hits) } });
        if (!controls.autoTrim) ctrl.setIdealSheet(boat.inIrons ? null : KOS.Physics.idealSheet(boat), 0.07);
      }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() {
      try { KOS.Audio.ambient({ wind: boat.tws || P.windKn, waves: U.clamp(0.2 + (boat.tws || P.windKn) / 24, 0, 1), harbor: 0.3 }); } catch (e) { /* optional */ }
    }
    function render(alpha) { scene.render(alpha); }
    function destroy() {
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      host.layer.removeEventListener('wheel', onWheel);
      if (introCd) introCd.cancel();
      if (coachIntro) coachIntro.close(true);
      ctrl.detach(); hud.destroy(); booEl.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); } catch (e) { /* optional */ }
    }
    function pause() { try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); }
    function onResize() { scene.resize(); applyZoom(); }

    // ---- test hooks
    let autopilot = null, autoKey = -2;
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(boat, { skill: 0.95, seed: 5 }) : null; }
    function skipIntro() {
      if (introCd) { introCd.cancel(); introCd = null; }
      if (S.phase === 'intro') S.phase = 'go';
    }

    return { start, update, render, destroy, pause, resume, onResize, boat, scene, state: S, ctrl, setAutopilot, skipIntro, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
