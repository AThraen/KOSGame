// KØS SEJL — js/modes/soslag.js
// The 'soslag' mode: Søslag i bugten (GitHub issue #11, docs/specs/soslag.md). Two H-boats duel in Svanemøllebugten with
// water guns; the wind carries the jet, so the windward position is the good one. A real KØS summer exercise: friendly, never war.
//
// Build step 1 (this file): the playable skeleton WITHOUT guns. Intro card, 3-2-1 countdown, 180 s clock, an AI H-boat that
// sails to the windward station (4 Hz {target} plan), the arena ring, an off-screen opponent arrow and a placeholder result.
// Later steps add the jet core (js/core/soslag.js), gun/tank/wet meters, penalties and the real AI duellist, the badge.
//
// Activity params: venue, windDeg, windKn, gust, shift, seed, durationS (round length, sim s), arenaR (arena radius, m), opp.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;
  const SOSLAG_STARS = 30; // stars needed to open the level (not BOAT_STARS.hboat: that gates the player's own garage choice)
  const COUNT_S = 3;       // 3-2-1 before the horn
  const LEAD_S = 3;        // the AI aims this many seconds ahead of the player
  const START_GAP = 45;    // m between the boats at the start, on a line across the wind

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    soslag: {
      trainer: 'Træner Nicolas', opp: 'Træner Anton', fun: 'Det er en leg - alle bliver våde!',
      intro: {
        kicker: 'Søslag', title: 'Søslag i bugten',
        l1: 'To H-både, to vandpistoler! Gør den anden besætning våd, men husk vigereglerne.',
        l2: 'Vinden bærer vandstrålen: sejl op i luv og skyd ned mod vinden.',
        l3: 'Luv-båden skal holde sig fri. Vig, når det er dig, der skal.',
        l4: 'Er du i læ, så slå væk fra ham, eller sejl helt tæt på.',
        wind: 'Vind i dag: {wind}.',
      },
      hud: { m: '{n} m', luv: 'Luv', lae: 'Læ', out: 'Tilbage til banen!', time: 'Tid' },
      count: { go: 'Af sted!' },
      card: { end: 'Slut!', endSub: 'Tiden er gået' },
      tip: { windward: 'Kom op i luv af ham! Vinden bærer vandet langt ned mod vinden - men husk: luv-båden viger.', out: 'Tilbage til banen! Hold dig inde i den stiplede ring.', last: 'Sidste chance!' },
      msg: { draw: 'Uafgjort - flot kamp!' },
    },
  });
  KOS.I18n.add('en', {
    soslag: {
      trainer: 'Trainer Nicolas', opp: 'Trainer Anton', fun: 'It is a game - everybody gets wet!',
      intro: {
        kicker: 'Water fight', title: 'Water fight in the bay',
        l1: 'Two H-boats, two water guns! Soak the other crew, but remember the right-of-way rules.',
        l2: 'The wind carries the jet: sail to windward and shoot downwind.',
        l3: 'The windward boat must keep clear. Give way when it is you.',
        l4: 'If you are to leeward, tack away from him, or close in right next to him.',
        wind: 'Wind today: {wind}.',
      },
      hud: { m: '{n} m', luv: 'Windward', lae: 'Leeward', out: 'Back to the arena!', time: 'Time' },
      count: { go: 'Go!' },
      card: { end: 'Time!', endSub: 'The clock ran out' },
      tip: { windward: 'Get to windward of him! The wind carries the water far downwind - but remember, the windward boat gives way.', out: 'Back to the arena! Stay inside the dashed ring.', last: 'Last chance!' },
      msg: { draw: 'A draw - great match!' },
    },
  });

  // ======================================================================== 2. activity
  KOS.Activities.add({
    id: 'soslag.duel1', mode: 'soslag', area: 'bay', boat: 'hboat', order: 60, icon: 'drop', minutes: 3, difficulty: 3,
    unlock: { stars: SOSLAG_STARS },
    title: { da: 'Søslag i bugten', en: 'Water fight in the bay' },
    desc: {
      da: 'To H-både, to vandpistoler. Gør modstanderens besætning våd, men husk vigereglerne! {wind} vind.',
      en: 'Two H-boats, two water guns. Soak the other crew, but remember the right-of-way rules! {wind} of wind.',
    },
    params: { venue: 'bay', windDeg: 240, windKn: 9, gust: 0.4, shift: 0.25, seed: 11, durationS: 180, arenaR: 110, opp: 'anton' },
  });

  // ======================================================================== helpers (pure)
  // approximate downwind reach of the jet (m) at a true wind speed in knots; the real table comes with js/core/soslag.js (step 2)
  const downRange = tws => 10.7 + 0.88 * tws;
  const DEFAULT_AREA = { x: -290, y: -640, r: 260 };

  // The arena: a circle of radius r around O, all water (8-point margin ring, no swim zone). Probe the venue's course area at
  // 110 m, then 90, then 75 (spec section 3). Returns {x, y, r, fallback}; `fallback` is true only if nothing passed (never for the bay).
  function findArena(venue, draft, seed, want) {
    const rand = U.rng((seed || 1) * 7919 + 3);
    const area = venue.courseArea || (venue.id === 'bay' ? DEFAULT_AREA : { x: venue.spawn.x, y: venue.spawn.y, r: 400 });
    const ok = (x, y, m) => {
      if (KOS.World.isSolid(venue, x, y) || KOS.World.depthAt(venue, x, y) < draft + 0.6 || KOS.World.inZone(venue, x, y, 'swim')) return false;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, px = x + Math.cos(a) * m, py = y + Math.sin(a) * m;
        if (KOS.World.isSolid(venue, px, py) || KOS.World.inZone(venue, px, py, 'swim') || KOS.World.depthAt(venue, px, py) < draft + 0.3) return false;
      }
      return true;
    };
    for (const r of [want, 90, 75].filter((r, i, a) => r <= want && a.indexOf(r) === i)) {
      for (let k = 0; k < 260; k++) {
        const rr = k === 0 ? 0 : area.r * Math.sqrt(rand()), a = rand() * TAU;
        const x = area.x + Math.cos(a) * rr, y = area.y + Math.sin(a) * rr;
        if (ok(x, y, r)) return { x, y, r, fallback: false };
      }
    }
    return { x: area.x, y: area.y, r: 75, fallback: true };
  }

  // ======================================================================== 3. the mode
  KOS.SoslagArena = { find: findArena }; // exposed for the sweep test
  KOS.Modes.register('soslag', { kind: 'sea', create(host, activity) { return createSoslag(host, activity); } });

  function createSoslag(host, activity) {
    const P = Object.assign({ venue: 'bay', windDeg: 240, windKn: 9, gust: 0.4, shift: 0.25, seed: 11, durationS: 180, arenaR: 110, opp: 'anton' }, activity.params || {});
    const assist = host.assist || 'easy';
    const venue = KOS.World.get(P.venue || 'bay');
    const clsId = 'hboat';
    const cls = KOS.Boats.get(clsId);
    const L = cls.length;
    const profile = host.profile || {};
    const wd = U.rad(P.windDeg);
    const up = U.vec(wd), right = U.vec(wd + Math.PI / 2);
    const arena = findArena(venue, cls.draft || 1, P.seed, P.arenaR);
    const O = { x: arena.x, y: arena.y }, AR = arena.r;
    const S = {
      phase: 'intro', clock: 0, cdT: COUNT_S, cdN: 0, hudT: 0, ambT: 0, tips: {}, tipT: -99, planN: 0, side: 1, jit: 0,
      out: false, outT: 0, endT: -1, result: null, done: false, goTipT: -1, lastTip: false, fxCount: 0,
    };

    // ---------------------------------------------------------------- wind
    const wind = KOS.Wind.create({ dir: wd, speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: O.x - 300, y0: O.y - 300, x1: O.x + 300, y1: O.y + 300 } });
    for (let i = 0; i < 240; i++) wind.update(0.5);
    const env = { wind, venue, assist, t: 0 };

    // ---------------------------------------------------------------- boats: a line across the wind, 45 m apart, both on a beam reach
    const at = (u, r) => ({ x: O.x + up.x * u + right.x * r, y: O.y + up.y * u + right.y * r });
    const startSpeed = 2.5;
    const hd = U.wrapPi(wd - Math.PI / 2);
    const pMe = at(0, START_GAP / 2), pAi = at(0, -START_GAP / 2);
    const me = KOS.Physics.createBoat(clsId, { x: pMe.x, y: pMe.y, heading: hd, speed: startSpeed, isPlayer: true,
      sailNo: 'DEN ' + (profile.sailNo || 1), name: profile.name || t('race.hud.you'), colors: profile.boatColor ? { hull: profile.boatColor } : undefined });
    me.noTag = true;
    const fs = KOS.AI.fleetSkill(profile, assist, KOS.Storage && KOS.Storage.totalStars ? KOS.Storage.totalStars() : 0);
    const skill = U.clamp(U.lerp(fs.lo, fs.hi, 0.5) + 0.04, 0.05, 0.98);
    const opp = KOS.Physics.createBoat(clsId, { x: pAi.x, y: pAi.y, heading: hd, speed: startSpeed, sailNo: 'KØS 2', name: t('soslag.opp'),
      colors: { hull: '#ffffff', trim: '#1a7fd4' } });
    opp.short = t('soslag.opp');
    opp.helm = KOS.AI.createHelm(opp, { skill, aggression: 0.5, seed: P.seed * 31 + 1 });
    opp.pace = KOS.AI.paceFor(skill, fs);
    opp.plan = { target: { x: pAi.x, y: pAi.y, r: 0.5 }, mode: 'race' };
    opp.tag = opp.short;
    const boats = [me, opp];
    let controls = KOS.Physics.controls();
    controls.autoTrim = assist !== 'pro';
    controls.autoHike = assist === 'easy';

    // ---------------------------------------------------------------- scene, input, HUD
    const scene = new KOS.SailScene(host.canvas, { venue, wind, boats, follow: me, marks: [], lines: [], showWindArrow: true, showNoGo: false, showLaylines: false });
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawOppArrow, { screen: true });
    function applyZoom() { // follow mode: about 70 m of water across (race uses 44 + 5.5 L)
      const small = Math.min(scene.w, scene.h) < 600;
      const span = (36 + 4 * L) * (small ? 0.85 : 1);
      scene.setZoom(1);
      const base = scene.baseZoom() / (1 + U.clamp(Math.abs(me.speed) / 25, 0, 0.35));
      scene.setZoom(Math.sqrt(scene.w * scene.h) * (small ? 1.3 : 1) / span / base);
    }
    applyZoom();
    const fitArena = () => { scene.resize(); if (scene.w > 160 && scene.h > 160) scene.fit({ x0: O.x - AR - 10, y0: O.y - AR - 10, x1: O.x + AR + 10, y1: O.y + AR + 10 }, Math.min(40, scene.w * 0.08)); };
    const followMe = () => { scene.fixedZoom = null; scene.follow(me); applyZoom(); };

    const ctrl = KOS.Input.attach(host.layer, Object.assign({
      layout: 'sail', spinnaker: false, hike: !cls.keel && assist !== 'easy', autoTrim: controls.autoTrim, pauseButton: false, extraButtons: [],
    }, KOS.SailAids.inputOpts(cls, assist)));
    const aids = KOS.SailAids.create({ ctrl, boat: me, assist, coach: txt => say(txt) });
    host.layer.classList.add('soslag-layer');

    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', 'timer']);
    const panel = document.createElement('div');
    panel.className = 'soslag-panel glass';
    host.layer.appendChild(panel);
    const card = document.createElement('div');
    card.className = 'race-card';
    host.layer.appendChild(card);
    const count = document.createElement('div');
    count.className = 'soslag-count';
    host.layer.appendChild(count);
    let cardTimer = null, coachH = null, countTimer = null;

    const handlers = {
      'boat:tack': e => { if (e.boat === me) sfx('tack'); },
      'boat:gybe': e => { if (e.boat === me) { sfx('gybe'); scene.shake(0.2); } },
      'boat:collide': e => { if (e.a === me || e.b === me) sfx('bump', { vol: Math.min(1, 0.3 + (e.speed || 0) / 3) }); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);

    // ==================================================================== small helpers
    let destroyed = false;
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function tip(key, force) {
      if (S.tips[key] && !force) return;
      if (env.t - S.tipT < 8 && !force) return;
      S.tips[key] = true; S.tipT = env.t;
      say(t('soslag.tip.' + key), 5600);
    }
    function say(text, ms, mood) { S.tipT = env.t; coachH = KOS.UI.coach(text, { ms: ms || 5600, mood, coach: 'nicolas', name: t('soslag.trainer') }); }
    function hideCoach() { try { if (coachH && coachH.close) coachH.close(true); } catch (e) { /* optional */ } }
    function showCard(kind, title, sub) {
      card.className = 'race-card show ' + kind;
      card.innerHTML = '<div class="rc-ico">' + KOS.UI.iconSvg(kind === 'good' ? 'check' : kind === 'warn' ? 'info' : 'penalty') + '</div><div class="rc-txt"><b>' + KOS.UI.esc(title) + '</b>' +
        (sub ? '<span>' + KOS.UI.esc(sub) + '</span>' : '') + '</div>';
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => { if (!destroyed) card.className = 'race-card'; }, 4000);
    }
    function ambient() {
      try { KOS.Audio.ambient({ wind: me.tws || P.windKn, waves: U.clamp(0.3 + (me.tws || P.windKn) / 20 + Math.abs(me.speed) / 12, 0, 1), harbor: 0.25 }); } catch (e) { /* optional */ }
    }
    const remaining = () => Math.max(0, P.durationS - S.clock);
    const fmtClock = s => { s = Math.ceil(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

    // ==================================================================== AI: sail to the windward station (4 Hz plan)
    // station = opponent + upwind * d + crosswind * side * 6, d = 0.7 x downwind range (about 13 m at 9 kn, clamped 9..14), kept inside 0.85 x arena
    function planAI() {
      const tws = (wind.at(opp.x, opp.y) || {}).speed || P.windKn;
      const d = U.clamp(0.7 * downRange(tws), 9, 14);
      const sd = (opp.x - me.x) * right.x + (opp.y - me.y) * right.y; // which side of the player he is on (crosswind): keep it (hysteresis, no flip-flop)
      if (Math.abs(sd) > 4) S.side = sd > 0 ? 1 : -1;
      S.jit = -S.jit || 1.5; // re-offset every update so a steady station never counts as "reached" (a reached target makes the helm idle)
      const lx = me.x + (me.vx || 0) * LEAD_S, ly = me.y + (me.vy || 0) * LEAD_S; // aim at where he will be (a moving opponent), not where he is
      let x = lx + up.x * d + right.x * (S.side * 6 + S.jit), y = ly + up.y * d + right.y * (S.side * 6 + S.jit);
      const dx = x - O.x, dy = y - O.y, m = Math.hypot(dx, dy), lim = 0.85 * AR;
      if (m > lim) { x = O.x + dx / m * lim; y = O.y + dy / m * lim; }
      opp.plan = { target: { x, y, r: 0.5 }, mode: 'race' }; // a fresh object every time
      return opp.plan;
    }
    // the player's autopilot (test hook): a loop of four spots inside the arena
    let autopilot = null, apIdx = 0;
    function autoPlan() {
      const k = 0.5 * AR, pts = [at(0, -k), at(k, 0), at(0, k), at(-k, 0)];
      if (U.dist(me, pts[apIdx]) < 14) apIdx = (apIdx + 1) % 4;
      const p = pts[apIdx];
      return { target: { x: p.x, y: p.y, r: 4 }, mode: 'race' };
    }

    // ==================================================================== phases
    let introCard = null, coachIntro = null;
    function closeIntroCard() {
      if (!introCard) return;
      const el = introCard; introCard = null;
      host.layer.classList.remove('has-intro-card');
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    }
    function beginCount() {
      if (S.phase !== 'intro') return;
      closeIntroCard();
      S.phase = 'count'; S.cdT = COUNT_S; S.cdN = 0;
      followMe();
      sfx('whistle', { vol: 0.5 });
    }
    function startDuel() {
      S.phase = 'duel'; S.clock = 0; S.goTipT = 4;
      host.layer.classList.add('soslag-go');
      sfx('horn', { vol: 1 });
      showCount(t('soslag.count.go'), true);
    }
    function showCount(txt, go) {
      count.textContent = txt; count.className = 'soslag-count show' + (go ? ' go' : '');
      clearTimeout(countTimer);
      countTimer = setTimeout(() => { if (!destroyed) count.className = 'soslag-count'; }, go ? 900 : 700);
    }
    // end of the round (the clock; later also a 100 % wet crew). The result is a placeholder in step 1: 1 star for finishing.
    function finishRound(why) {
      if (S.done) return;
      S.done = true; S.phase = 'end'; S.endT = 1.2;
      hideCoach();
      host.layer.classList.remove('soslag-go');
      sfx('hornLong');
      showCard('good', t('soslag.card.end'), t('soslag.card.endSub'));
      S.result = {
        stars: 1, success: true, timeMs: Math.round(Math.min(S.clock, P.durationS) * 1000), score: 100,
        stats: { tacks: me.tacks },
        msgKey: 'soslag.msg.draw',
        soslag: { myWet: 0, oppWet: 0, myHits: 0, oppHits: 0, why },
      };
    }

    // ==================================================================== sim
    function simStep(dt) {
      env.t += dt;
      wind.update(dt);
      if ((S.windT = (S.windT || 0) + dt) > 2) { S.windT = 0; wind.recenter(me.x, me.y); }
      if (S.phase === 'count') {
        S.cdT -= dt;
        const n = Math.ceil(S.cdT);
        if (n !== S.cdN && n >= 1) { S.cdN = n; showCount(String(n)); sfx('countdown', { pitch: 1 + (COUNT_S - n) * 0.05 }); }
        if (S.cdT <= 0) startDuel();
      } else if (S.phase === 'duel') {
        S.clock += dt;
        if (S.goTipT > 0 && (S.goTipT -= dt) <= 0) tip('windward');
        if (!S.lastTip && remaining() <= 15) { S.lastTip = true; tip('last', true); }
        if (remaining() <= 0) finishRound('time');
      }
      const live = boats;
      controls = KOS.Input.toControls(ctrl.state, me, controls, dt);
      if (assist === 'easy') controls.autoHike = true;
      aids.apply(controls);
      if (autopilot) Object.assign(controls, autopilot.think(env, autoPlan(), live));
      KOS.Physics.step(me, controls, env, dt);
      // the AI re-plans at 4 Hz (every 15 steps), and at once if its helm ever thinks it has arrived
      if (S.planN++ % 15 === 0 || opp.helm.finished) planAI();
      KOS.Physics.step(opp, opp.helm.think(env, opp.plan, live), env, dt);
      KOS.Physics.collide(live, venue, []);
      // outside the arena: a hint (the gun lock comes with step 3)
      S.out = U.dist(me, O) > AR;
      if (S.out && S.phase === 'duel' && env.t - S.outT > 10) { S.outT = env.t; tip('out', true); }
    }

    function update(dt) {
      if (destroyed) return;
      if (introCard) return; // the sim waits for the "Sejl!" button
      simStep(dt);
      if (controls.autoTrim) ctrl.setSheet(me.sheet);
      aids.tick(dt, S.phase === 'duel');
      if (assist === 'easy') scene.showNoGo = Math.abs(me.twa) < cls.noGo + 0.12 || me.inIrons;
      if (S.endT > 0) { S.endT -= dt; if (S.endT <= 0 && S.result) host.finish(S.result); }
      hudTick(dt);
    }

    function isWindward() { // is the opponent windward of the player? (+/-60 degrees of the wind line)
      return Math.abs(U.wrapPi(U.bearing(me, opp) - wd)) < U.rad(60);
    }
    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        hud.update({ wind: { dir: me.windDir || wind.dir, speed: me.tws || wind.speed }, speed: U.kn(Math.abs(me.speed)), timer: (S.phase === 'duel' || S.phase === 'end' ? remaining() : P.durationS) * 1000 });
        paintPanel();
      }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    // the HUD panel: the opponent, the distance, and who is windward (the wet bars and the tank come with step 3)
    function paintPanel() {
      const esc = KOS.UI.esc, d = Math.round(U.dist(me, opp)), w = isWindward();
      const html = '<div class="sp-head">' + KOS.UI.iconSvg('drop') + '<span>' + esc(t('soslag.opp')) + '</span></div>' +
        '<div class="sp-row"><b>' + esc(t('soslag.hud.m', { n: d })) + '</b><em class="' + (w ? 'luv' : 'lae') + '">' + esc(t(w ? 'soslag.hud.luv' : 'soslag.hud.lae')) + '</em></div>' +
        (S.out ? '<div class="sp-out">' + esc(t('soslag.hud.out')) + '</div>' : '');
      if (html !== paintPanel.last) { panel.innerHTML = html; paintPanel.last = html; }
    }

    // ==================================================================== drawing
    function drawWorld(ctx, sc) { // the arena ring (world space)
      const mpp = sc.mpp;
      ctx.save();
      ctx.lineWidth = Math.max(0.3, 2.5 * mpp); ctx.strokeStyle = S.out ? 'rgba(255,154,61,0.9)' : 'rgba(255,255,255,0.55)';
      ctx.setLineDash([10 * mpp, 8 * mpp]);
      if (!KOS.UI.reduced()) ctx.lineDashOffset = -(sc.t * 6 * mpp);
      ctx.beginPath(); ctx.arc(O.x, O.y, AR, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    function drawOppArrow(ctx, sc) { // off-screen opponent arrow with name and distance (adapted from race's drawTargetArrow)
      if (S.phase === 'intro' || S.phase === 'end') return;
      const p = sc.worldToScreen(opp.x, opp.y), W = sc.w, H = sc.h;
      const hb = hud.el.getBoundingClientRect(), land = H < 500;
      const m = { l: land ? 150 : 34, r: land ? 150 : 34, t: Math.max(60, hb.bottom + 34), b: land ? 60 : W < 700 ? 190 : 130 };
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < H - m.b) return;
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? H - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx), col = '#49c6f2';
      const pulse = KOS.UI.reduced() ? 1 : 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText('KØS', ax, ay);
      ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(t('soslag.hud.m', { n: Math.round(U.dist(me, opp)) }), ax, ay + 32);
    }

    // ==================================================================== instance
    function buildIntroCard() {
      const el = document.createElement('div');
      const esc = KOS.UI.esc;
      el.className = 'school-card race-intro-card soslag-intro-card';
      el.innerHTML = '<div class="sc-in">' +
        '<div class="sc-kicker">' + KOS.UI.iconSvg('drop') + '<span>' + esc(t('soslag.intro.kicker')) + '</span></div>' +
        '<h2 class="sc-title">' + esc(t('soslag.intro.title')) + '</h2>' +
        '<p class="sc-intro soslag-trainer"><b>' + esc(t('soslag.trainer')) + '</b></p>' +
        '<ul class="soslag-lines">' + ['l1', 'l2', 'l3', 'l4'].map(k => '<li>' + esc(t('soslag.intro.' + k)) + '</li>').join('') + '</ul>' +
        '<p class="sc-intro" style="opacity:.85;font-size:.9em">' + esc(t('soslag.intro.wind', { wind: U.windTxt(P.windKn, true) })) + ' ' + esc(t('soslag.fun')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-big sc-go">' + KOS.UI.iconSvg('play') + '<span>' + esc(t('race.card.go')) + '</span></button>' +
        '</div>';
      host.layer.appendChild(el);
      host.layer.classList.add('has-intro-card');
      el.querySelector('.sc-go').addEventListener('click', e => { e.stopPropagation(); beginCount(); });
      el.addEventListener('pointerdown', e => e.stopPropagation());
      return el;
    }
    function start() {
      introCard = buildIntroCard();
      fitArena();
      if (host.settings && host.settings.music) { try { KOS.Audio.music('race'); } catch (e) { /* optional */ } }
      ambient();
      paintPanel();
    }
    function render(alpha) { scene.render(alpha); }
    function destroy() { // safe in any phase: intro card open, countdown, duel, end
      destroyed = true;
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      clearTimeout(cardTimer); clearTimeout(countTimer);
      host.layer.classList.remove('soslag-layer', 'soslag-go', 'has-intro-card');
      if (introCard) { introCard.remove(); introCard = null; }
      hideCoach();
      ctrl.detach(); hud.destroy(); panel.remove(); card.remove(); count.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); } catch (e) { /* optional */ }
    }
    function pause() { hideCoach(); try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); }
    function onResize() { scene.resize(); if (S.phase === 'intro') fitArena(); else applyZoom(); }

    // ---- test hooks: autopilot (KOS.AI sails the player's boat around the arena), skipIntro, debug
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(me, { skill: 0.97, aggression: 0.6, seed: 5 }) : null; }
    function skipIntro() { if (S.phase === 'intro') beginCount(); }
    const debug = {
      O, arenaR: AR, arena, get opp() { return opp; }, get plan() { return opp.plan; }, isWindward,
      jump(sec) { const n = Math.round(sec / KOS.DT); for (let i = 0; i < n && !S.done; i++) simStep(KOS.DT); },
      end() { finishRound('debug'); },
    };

    return { start, update, render, destroy, pause, resume, onResize, boat: me, boats, scene, state: S, ctrl, setAutopilot, skipIntro, debug, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
