// KØS SEJL — js/modes/soslag.js
// The 'soslag' mode: Søslag i bugten (GitHub issue #11, docs/specs/soslag.md). Two H-boats duel in Svanemøllebugten with
// water guns; the wind carries the jet, so the windward position is the good one. A real KØS summer exercise: friendly, never war.
//
// Build step 3 (this file): the player's gun. Intro card, 3-2-1 countdown, 180 s clock, an AI H-boat that sails to the windward
// station (4 Hz {target} plan, still passive: it does not shoot), the arena ring, the off-screen opponent arrow, and now: hold-to-fire
// SKYD with auto-aim (KOS.Soslag), a jet pool stepped in simStep, tank + dipping, gun locks, wet meters, the screen-space jet overlay,
// the duel camera (follow / fit with hysteresis), time-up and 100 % end, real results with injected wet bars, trainer tips.
// Later steps add penalties / the right-of-way rules (step 4) and the real AI duellist, the badge (step 5).
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
  const SL = KOS.Soslag, C = SL.CFG, D2R = Math.PI / 180;
  const SIGMA = { easy: 3.5, normal: 5, pro: 6.5 }; // azimuth spread of the auto-aim (degrees); elevation spread is 3 degrees at every level

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
      hud: { m: '{n} m', luv: 'Luv', lae: 'Læ', out: 'Tilbage til banen!', time: 'Tid', you: 'Du', tank: 'Vand', dip: 'Luf op og sænk farten for at fylde', far: 'For langt!' },
      count: { go: 'Af sted!' },
      card: { end: 'Slut!', endSub: 'Tiden er gået', first: 'Venligt skud!', soaked: 'Gennemblødt!', soakedMe: 'Du er gennemblødt!' },
      tip: { windward: 'Kom op i luv af ham! Vinden bærer vandet langt ned mod vinden - men husk: luv-båden viger.', out: 'Tilbage til banen! Hold dig inde i den stiplede ring.', last: 'Sidste chance!',
        shoot: 'Hold SKYD, når du er tæt nok på.', tank: 'Vandet er ved at slippe op.', dip: 'Luf op mod vinden og sænk farten, så fylder du spanden.',
        short: 'Strålen når ikke - skyd ned mod vinden eller kom tættere på.', win: 'Flot skudt! Prøv at komme endnu hurtigere op i luv næste gang.', lose: 'Næste gang: kom op i luv af ham og skyd ned mod vinden.' },
      msg: { win: 'Du vandt søslaget!', lose: 'Han var våddere end dig denne gang.', draw: 'Uafgjort - flot kamp!', soaked: 'Du gennemblødte hele holdet!', soakedMe: 'Du blev gennemblødt - godt kæmpet!', idle: 'Du skød næsten ikke - prøv igen!' },
      stat: { wetOpp: 'Modstander våd', wetMe: 'Du er våd', hits: 'Træffere', acc: 'Præcision', fouls: 'Vigefejl' },
      res: { wet: 'Hvem blev våddest?' },
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
      hud: { m: '{n} m', luv: 'Windward', lae: 'Leeward', out: 'Back to the arena!', time: 'Time', you: 'You', tank: 'Water', dip: 'Luff up and slow down to refill', far: 'Too far!' },
      count: { go: 'Go!' },
      card: { end: 'Time!', endSub: 'The clock ran out', first: 'Nice shot!', soaked: 'Soaked!', soakedMe: 'You are soaked!' },
      tip: { windward: 'Get to windward of him! The wind carries the water far downwind - but remember, the windward boat gives way.', out: 'Back to the arena! Stay inside the dashed ring.', last: 'Last chance!',
        shoot: 'Hold SQUIRT when you are close enough.', tank: 'The water is running low.', dip: 'Luff up into the wind and slow down to fill the bucket.',
        short: 'The jet does not reach - shoot downwind or get closer.', win: 'Well shot! Try to get to windward even faster next time.', lose: 'Next time: get to windward of him and shoot downwind.' },
      msg: { win: 'You won the water fight!', lose: 'He got you wetter this time.', draw: 'A draw - great match!', soaked: 'You soaked the whole crew!', soakedMe: 'You got soaked - well fought!', idle: 'You hardly fired - try again!' },
      stat: { wetOpp: 'Opponent wet', wetMe: 'You wet', hits: 'Hits', acc: 'Accuracy', fouls: 'Fouls' },
      res: { wet: 'Who got wetter?' },
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

  // ======================================================================== results: the wet bars on the app's results screen
  // (module level: the instance is gone by then; result.soslag reaches us through KOS.App.run.lastResult, like race's raceTable)
  function injectBars(screen) {
    if (screen !== 'results') return;
    const lr = KOS.App && KOS.App.run && KOS.App.run.lastResult;
    const sl = lr && lr.result && lr.result.soslag;
    if (!sl || !lr.activity || lr.activity.mode !== 'soslag') return;
    const card = document.querySelector('#screen-results .results-card');
    if (!card || card.querySelector('.soslag-rbars')) return;
    const esc = KOS.UI.esc, pc = v => Math.round(U.clamp(v, 0, 100));
    const row = (cls, name, v) => '<div class="srb-row ' + cls + '"><span>' + esc(name) + '</span><div class="srb-track"><i style="width:' + pc(v) + '%"></i></div><b>' + pc(v) + ' %</b></div>';
    const wrap = document.createElement('div');
    wrap.className = 'soslag-rbars';
    wrap.innerHTML = '<div class="srb-head">' + KOS.UI.iconSvg('drop') + '<span>' + esc(t('soslag.res.wet')) + '</span></div>' +
      row('me', t('soslag.hud.you'), sl.myWet) + row('op', t('soslag.opp'), sl.oppWet);
    const stats = card.querySelector('.results-stats');
    if (stats) card.insertBefore(wrap, stats); else card.appendChild(wrap);
  }
  if (KOS.Events && KOS.Events.on) KOS.Events.on('screen', injectBars);

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
    const rand = U.rng((P.seed || 1) * 13 + 7); // the auto-aim spread (seeded: same seed, same duel)
    const S = {
      phase: 'intro', clock: 0, cdT: COUNT_S, cdN: 0, hudT: 0, ambT: 0, tips: {}, tipT: -99, planN: 0, side: 1, jit: 0,
      out: false, outT: 0, endT: -1, result: null, done: false, goTipT: -1, lastTip: false, fxCount: 0,
      // gun, jets and meters (step 3)
      pool: SL.createPool(), fired: 0, hits: 0, oppHits: 0, fouls: 0, held: false, firing: false, locked: true, lockPrev: null, dip: false,
      aim: null, land: null, aimN: 0, sprayT: -9, hitSndT: -9, fxT: -9, dripT: 0, gainAcc: 0, gainT: 0, firstHit: false,
      dipHintT: -99, dipUntil: 0, farT: 0, cam: 'follow', camT: -9, fr: null,
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
    for (const b of [me, opp]) { b.tank = C.TANK_MAX; b.wet = 0; b.gunLock = 0; b.acc = 0; b.dry = false; } // per-boat plain fields, like b.rc in race
    const boats = [me, opp];
    let controls = KOS.Physics.controls();
    controls.autoTrim = assist !== 'pro';
    controls.autoHike = assist === 'easy';

    // ---------------------------------------------------------------- scene, input, HUD
    const scene = new KOS.SailScene(host.canvas, { venue, wind, boats, follow: me, marks: [], lines: [], showWindArrow: true, showNoGo: false, showLaylines: false });
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawJets, { screen: true });
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

    // the gun button (hold, K / 1) and the penalty-turn button (T / 2: wired up with the rules in step 4, greyed out until then)
    const extra = [{ id: 'fire', icon: 'drop', labelKey: 'input.fire', key: 'K' }, { id: 'turn', icon: 'turn', labelKey: 'input.turn', key: 'T' }];
    const ctrl = KOS.Input.attach(host.layer, Object.assign({
      layout: 'sail', spinnaker: false, hike: !cls.keel && assist !== 'easy', autoTrim: controls.autoTrim, pauseButton: false, extraButtons: extra,
    }, KOS.SailAids.inputOpts(cls, assist)));
    ctrl.setEnabled('fire', false); ctrl.setEnabled('turn', false);
    const aids = KOS.SailAids.create({ ctrl, boat: me, assist, coach: txt => say(txt) });
    host.layer.classList.add('soslag-layer');

    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', 'timer']);
    const panel = document.createElement('div');
    panel.className = 'soslag-panel glass';
    panel.innerHTML = '<div class="sl-bar me"><span class="sl-n"></span><b class="sl-p"></b><div class="sl-track"><i></i></div></div>' +
      '<div class="sl-bar op"><span class="sl-n"></span><b class="sl-p"></b><div class="sl-track"><i></i></div></div>' +
      '<div class="sl-tank"><span class="sl-ico">' + KOS.UI.iconSvg('drop') + '</span><span class="sl-n"></span><div class="sl-track"><i></i></div></div>' +
      '<div class="sl-row"><b></b><em></em></div><div class="sl-hint"></div>';
    host.layer.appendChild(panel);
    const pq = s => panel.querySelector(s);
    const pe = { meN: pq('.sl-bar.me .sl-n'), meP: pq('.sl-bar.me .sl-p'), meF: pq('.sl-bar.me i'), meB: pq('.sl-bar.me'),
      opN: pq('.sl-bar.op .sl-n'), opP: pq('.sl-bar.op .sl-p'), opF: pq('.sl-bar.op i'), opB: pq('.sl-bar.op'),
      tk: pq('.sl-tank'), tkN: pq('.sl-tank .sl-n'), tkF: pq('.sl-tank i'), d: pq('.sl-row b'), w: pq('.sl-row em'), hint: pq('.sl-hint') };
    const pv = {}; // last painted values (touch the DOM only when something changed)
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
    // cosmetic particles / floating text only at full quality and without reduced motion (gameplay never depends on them); S.fxCount counts what was spawned
    const cosmetic = () => !KOS.UI.reduced() && (!KOS.Perf || KOS.Perf.level >= 2) && !!scene.effects;
    function fx(fn) { if (!cosmetic()) return; S.fxCount++; fn(scene.effects); }
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
    // the player's autopilot (test hook, "a competent player"): sails to just windward of the opponent and fires whenever the aim says it hits
    let autopilot = null;
    function autoPlan() {
      let x = opp.x + (opp.vx || 0) * 2 + up.x * 6, y = opp.y + (opp.vy || 0) * 2 + up.y * 6;
      const dx = x - O.x, dy = y - O.y, m = Math.hypot(dx, dy), lim = 0.85 * AR;
      if (m > lim) { x = O.x + dx / m * lim; y = O.y + dy / m * lim; }
      return { target: { x, y, r: 3 }, mode: 'race' };
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
      S.cam = 'follow'; S.camT = env.t - 9;
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
    // end of the round: the clock, a 100 % wet crew, or debug.end(). `e` = KOS.Soslag.endCheck(...) {outcome, why, diff}
    function finishRound(e) {
      if (S.done) return;
      e = e || SL.endCheck(me.wet, opp.wet, true);
      S.done = true; S.phase = 'end'; S.endT = 1.2;
      releaseFire();
      hideCoach();
      host.layer.classList.remove('soslag-go');
      const stars = SL.stars({ fired: S.fired, outcome: e.outcome, diff: e.diff, fouls: S.fouls });
      const myWet = Math.round(me.wet * 10) / 10, oppWet = Math.round(opp.wet * 10) / 10, acc = S.fired ? Math.round(100 * S.hits / S.fired) : 0;
      const msgKey = stars === 0 ? 'soslag.msg.idle' : e.outcome === 'draw' ? 'soslag.msg.draw' : e.why === 'soaked' ? 'soslag.msg.soaked' : e.why === 'soakedMe' ? 'soslag.msg.soakedMe' : 'soslag.msg.' + e.outcome;
      if (e.why === 'soaked' || e.why === 'soakedMe') { sfx('bell'); sfx('hornLong'); showCard(e.why === 'soaked' ? 'good' : 'warn', t('soslag.card.' + e.why)); }
      else { sfx('hornLong'); showCard('good', t('soslag.card.end'), t('soslag.card.endSub')); }
      if (e.outcome === 'win') { sfx('cheer', { vol: 0.6 }); fx(f => f.confetti(me.x, me.y, 60)); }
      say(t('soslag.tip.' + (e.outcome === 'win' ? 'win' : 'lose')), 5000);
      S.result = {
        stars, success: stars > 0, timeMs: Math.round(Math.min(S.clock, P.durationS) * 1000), score: SL.score(opp.wet, me.wet, S.fouls),
        stats: { 'soslag.stat.wetOpp': Math.round(opp.wet) + ' %', 'soslag.stat.wetMe': Math.round(me.wet) + ' %', 'soslag.stat.hits': S.hits, 'soslag.stat.acc': acc + ' %', 'soslag.stat.fouls': S.fouls, tacks: me.tacks },
        msgKey,
        soslag: { myWet, oppWet, myHits: S.hits, oppHits: S.oppHits, fired: S.fired, outcome: e.outcome, why: e.why },
      };
    }

    // ==================================================================== gun: aim, fire, jets, hits
    // held fire never latches: the flag is read from ctrl.state.buttons.fire each step; pause / round end clear it (a finger still on SKYD must lift and press again)
    function releaseFire() {
      ctrl.state.buttons.fire = false; S.held = false; S.firing = false; SL.resetFire(me);
      const b = host.layer.querySelector('[data-btn="fire"]'); if (b) b.classList.remove('kc-on');
    }
    // where will the jet land (ground point)? used for the aim line when the opponent is out of reach
    function landing(az, el) {
      const j = SL.launch(null, me, az, el); let r = 0;
      for (let i = 0; i < 150 && !r; i++) r = SL.stepJet(j, wind, 1 / 30);
      const u = j.pz / Math.max(j.pz - j.z, 1e-9);
      return { x: j.px + (j.x - j.px) * u, y: j.py + (j.y - j.py) * u };
    }
    function aimUpdate() {
      const a = S.aim = SL.solveAim(me, opp, wind);
      if (a.ok) { const c = SL.crewCenter(opp); S.land = { x: c.x + (opp.vx || 0) * a.T, y: c.y + (opp.vy || 0) * a.T, hit: true }; }
      else { S.land = landing(a.az, a.el); S.land.hit = false; }
    }
    const jit = s => (rand() + rand() + rand() - 1.5) * 2 * s * D2R;
    function shoot() {
      const a = S.aim, az = a.az + jit(SIGMA[assist] || 5), el = U.clamp(a.el + jit(3), 0.05, 1.3);
      SL.launch(S.pool, me, az, el, me);
      SL.spend(me, 1); S.fired++;
      if (env.t - S.sprayT >= 0.25) { S.sprayT = env.t; sfx('spray', { vol: 0.25, pitch: 0.92 + rand() * 0.16 }); } // limited on SIM time, never the wall clock
      if (env.t - S.fxT >= 0.12) { const g = SL.gunPos(me); fx(f => f.spray(g.x, g.y, az, 0.15)); } // muzzle puff
    }
    function gunStep(dt) {
      const duel = S.phase === 'duel';
      if (me.gunLock > 0) me.gunLock = Math.max(0, me.gunLock - dt);
      S.dip = false;
      if (duel) S.dip = SL.tankStep(me, dt);
      const locked = !duel || S.out || !SL.gunReady(me) || me.gunLock > 0;
      const held = duel && !!ctrl.state.buttons.fire, ap = duel && !!autopilot;
      if (ap && !held && U.dist(me, opp) > 26) S.aim = S.land = null; // the autopilot only aims when the opponent is anywhere near
      else if ((held || ap) && (S.aimN++ % 6 === 0 || (held && !S.held) || !S.aim)) aimUpdate(); // solveAim every 6th step (10 Hz, spec: at most every 4th); the cached aim is reused in between
      const want = held || (ap && S.aim && S.aim.ok);
      if (want && !locked) {
        if (!S.firing) me.acc = C.RATE_DT; // the first jet leaves at once on press
        S.firing = true;
        for (let n = SL.accTake(me, dt); n > 0 && SL.gunReady(me); n--) shoot();
      } else { S.firing = false; SL.resetFire(me); }
      S.held = held; S.locked = locked;
      if (S.lockPrev !== locked) { S.lockPrev = locked; ctrl.setEnabled('fire', !locked); } // the button greys out while the gun is locked
      // hints and tips
      if (duel) {
        if (me.tank < 25 && Math.abs(me.speed) >= C.DIP_SPEED && env.t - S.dipHintT > 20) { S.dipHintT = env.t; S.dipUntil = env.t + 5; tip('dip'); }
        if (me.tank < 25) tip('tank');
        if (S.fired === 0 && S.clock > 10 && U.dist(me, opp) < 30) tip('shoot');
        S.farT = (S.firing && S.aim && !S.aim.ok) ? S.farT + dt : 0;
        if (S.farT > 1.5) tip('short');
      }
    }
    function onCrewHit(j, tgt) {
      tgt.wet = SL.wetGain(tgt.wet, 1);
      const mine = j.owner === me;
      if (mine) S.hits++; else S.oppHits++;
      if (mine && !S.firstHit) { S.firstHit = true; showCard('good', t('soslag.card.first')); }
      if (env.t - S.hitSndT >= 0.15) { S.hitSndT = env.t; sfx('splash', { vol: 0.4, pitch: mine ? 1.25 : 0.8 }); }
      if (env.t - S.fxT >= 0.2) { S.fxT = env.t; fx(f => f.splash(j.x, j.y, 0.6)); }
      S.gainAcc += C.WET_GAIN * (mine ? 1 : 0); // a floating "+n" per 0.6 s of hits, not one per jet
      if (S.gainAcc > 0 && env.t - S.gainT >= 0.6) { const g = S.gainAcc; S.gainAcc = 0; S.gainT = env.t; fx(f => f.text(tgt.x, tgt.y - 2, '+' + (Math.round(g * 10) / 10), { color: '#bfe6ff', size: 16 })); }
    }
    function jetsStep(dt) {
      const pool = S.pool, duel = S.phase === 'duel';
      for (let i = 0; i < pool.n;) {
        const j = pool.jets[i], r = SL.stepJet(j, wind, dt), tgt = j.owner === me ? opp : me;
        const h = duel ? SL.hitTest(j, tgt) : null;
        if (!h && !r) { i++; continue; }
        if (h === 'crew') onCrewHit(j, tgt);
        else if (env.t - S.fxT >= 0.12) { // a hull / sail hit or a miss: a tiny splash or a ripple, no points
          S.fxT = env.t;
          if (h === 'hull') fx(f => f.splash(j.x, j.y, 0.15)); else fx(f => f.ripple(j.x, j.y, 1.2, 0.9));
        }
        j.live = false;
        const last = pool.jets[--pool.n]; pool.jets[pool.n] = j; pool.jets[i] = last; // swap-remove: dense pool, no allocation
      }
    }
    // wet crews drip (cosmetic)
    function dripStep(dt) {
      if ((S.dripT -= dt) > 0) return;
      S.dripT = 0.6;
      for (const b of boats) if (b.wet > 40) { const c = SL.crewCenter(b); fx(f => f.spray(c.x, c.y, b.heading + Math.PI, 0.1)); }
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
      // outside the arena: the gun is locked and the trainer says so
      S.out = U.dist(me, O) > AR;
      if (S.out && S.phase === 'duel' && env.t - S.outT > 10) { S.outT = env.t; tip('out', true); }
      // order inside one step: move, jets and hits, wet clamp, the 100 % check, then the clock
      gunStep(dt);
      jetsStep(dt);
      dripStep(dt);
      if (S.phase === 'duel') {
        me.wet = Math.min(100, me.wet); opp.wet = Math.min(100, opp.wet);
        const e = SL.endCheck(me.wet, opp.wet, S.clock >= P.durationS - 1e-9);
        if (e) finishRound(e);
      }
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
    // the HUD panel: two wet bars, the tank gauge, the distance and who is windward, and one hint line. The DOM is built once; only changed values are written.
    function setTxt(el, key, v) { if (pv[key] !== v) { pv[key] = v; el.textContent = v; } }
    function setCls(el, key, v) { if (pv[key] !== v) { pv[key] = v; el.className = v; } }
    function setW(el, key, v) { if (pv[key] !== v) { pv[key] = v; el.style.width = v + '%'; } }
    function paintPanel() {
      const w = isWindward(), red = KOS.UI.reduced();
      const mw = Math.round(me.wet), ow = Math.round(opp.wet), tk = Math.round(me.tank);
      setTxt(pe.meN, 'meN', t('soslag.hud.you')); setTxt(pe.opN, 'opN', t('soslag.opp')); setTxt(pe.tkN, 'tkN', t('soslag.hud.tank'));
      setTxt(pe.meP, 'meP', mw + ' %'); setTxt(pe.opP, 'opP', ow + ' %');
      setW(pe.meF, 'meW', mw); setW(pe.opF, 'opW', ow); setW(pe.tkF, 'tkW', tk);
      setCls(pe.meB, 'meC', 'sl-bar me' + (mw >= 70 ? ' hot' : '')); setCls(pe.opB, 'opC', 'sl-bar op' + (ow >= 70 ? ' hot' : ''));
      setCls(pe.tk, 'tkC', 'sl-tank' + (tk < 25 ? ' low' : '') + (S.dip ? ' dip' : '') + (!red && tk < 25 && S.phase === 'duel' ? ' pulse' : ''));
      setTxt(pe.d, 'd', t('soslag.hud.m', { n: Math.round(U.dist(me, opp)) }));
      setTxt(pe.w, 'w', t(w ? 'soslag.hud.luv' : 'soslag.hud.lae')); setCls(pe.w, 'wC', w ? 'luv' : 'lae');
      const hk = S.out ? 'out' : (S.firing && S.aim && !S.aim.ok) ? 'far' : env.t < S.dipUntil ? 'dip' : '';
      setTxt(pe.hint, 'hint', hk ? t('soslag.hud.' + hk) : ''); setCls(pe.hint, 'hintC', 'sl-hint' + (hk ? ' on ' + hk : '') + (hk === 'dip' && !red ? ' pulse' : ''));
    }

    // ==================================================================== camera: follow, or fit both boats when they are close (50 m in, 60 m out: a hysteresis band, at least 1.5 s between switches)
    function camUpdate() {
      if (S.phase === 'intro') return;
      const d = U.dist(me, opp);
      if (S.cam === 'follow' && d < 50 && env.t - S.camT >= 1.5) {
        S.cam = 'fit'; S.camT = env.t; S.fr = scene.view ? { x0: scene.view.x0, y0: scene.view.y0, x1: scene.view.x1, y1: scene.view.y1 } : null;
      } else if (S.cam === 'fit' && d > 60 && env.t - S.camT >= 1.5) { S.cam = 'follow'; S.camT = env.t; followMe(); }
      if (S.cam !== 'fit') return;
      let x0 = Math.min(me.x, opp.x), x1 = Math.max(me.x, opp.x), y0 = Math.min(me.y, opp.y), y1 = Math.max(me.y, opp.y);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (x1 - x0 < 60) { x0 = cx - 30; x1 = cx + 30; } if (y1 - y0 < 60) { y0 = cy - 30; y1 = cy + 30; } // at least 60 m on each axis
      const f = S.fr || (S.fr = { x0, y0, x1, y1 });
      f.x0 += (x0 - f.x0) * 0.15; f.x1 += (x1 - f.x1) * 0.15; f.y0 += (y0 - f.y0) * 0.15; f.y1 += (y1 - f.y1) * 0.15; // low-pass: the view glides
      if (scene.w > 160 && scene.h > 160) scene.fit(f, U.clamp(18 * scene.camera.zoom, 40, 0.15 * Math.min(scene.w, scene.h)));
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
    // proj(x, y, z): world metres + height -> screen px. scene.project (tilt camera) when it exists, else the flat view with a lift of z * 0.45 px per px/m.
    // Everything of the gun is drawn through this one function in a screen-space overlay, so a tilted camera needs no change here. Writes into PJ (no allocation per jet).
    const PJ = { x: 0, y: 0 };
    let pcs = 1, psn = 0, pzm = 1, pw = 0, ph = 0, pcx = 0, pcy = 0, pby = 0;
    function projBegin(sc) { const c = sc.camera; pcs = Math.cos(-c.rot); psn = Math.sin(-c.rot); pzm = c.zoom; pw = sc.w / 2; ph = sc.h / 2 + (sc.biasY || 0); pcx = c.x; pcy = c.y; }
    function proj(sc, x, y, z) {
      if (sc.project) { const p = sc.project(x, y, z); PJ.x = p.x; PJ.y = p.y; return PJ; }
      const dx = x - pcx, dy = y - pcy;
      PJ.x = pw + (dx * pcs - dy * psn) * pzm; PJ.y = ph + (dx * psn + dy * pcs) * pzm - z * pzm * 0.45;
      return PJ;
    }
    function drawJets(ctx, sc) {
      if (S.phase === 'intro') return;
      projBegin(sc);
      const zm = sc.camera.zoom, red = KOS.UI.reduced();
      // wet crews: the crew disc tinted blue (alpha grows with the wet value; it breathes a little unless reduced motion)
      for (const b of boats) {
        if (b.wet < 0.5) continue;
        const c = SL.crewCenter(b), p = proj(sc, c.x, c.y, 0.5);
        const a = b.wet / 100 * 0.45 * (red ? 1 : 1 + 0.12 * Math.sin(sc.t * 4));
        ctx.fillStyle = 'rgba(40,140,255,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, C.CREW_R * zm, 0, TAU); ctx.fill();
      }
      // the aim line (while SKYD is held): gun -> where the jet lands. green = it hits the crew, orange = falls short, grey = gun locked
      if (S.held && S.aim && S.land && S.phase === 'duel') {
        const g = SL.gunPos(me), p0 = proj(sc, g.x, g.y, C.Z0), x0 = p0.x, y0 = p0.y, p1 = proj(sc, S.land.x, S.land.y, S.land.hit ? 1.2 : 0);
        ctx.save();
        ctx.strokeStyle = S.locked ? 'rgba(190,200,215,0.7)' : S.aim.ok ? 'rgba(80,235,150,0.95)' : 'rgba(255,154,61,0.95)';
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.setLineDash([1, 7]);
        if (!red) ctx.lineDashOffset = -(sc.t * 22);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.restore();
      }
      // jets: a short 3-point trail (head, then back along the velocity) in white-blue, plus a faint ground shadow dot; all jets in two paths, no allocation
      const pool = S.pool, n = pool.n;
      if (!n) return;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const j = pool.jets[i];
        let p = proj(sc, j.x - j.vx * 0.08, j.y - j.vy * 0.08, j.z - j.vz * 0.08); ctx.moveTo(p.x, p.y);
        p = proj(sc, j.x - j.vx * 0.04, j.y - j.vy * 0.04, j.z - j.vz * 0.04); ctx.lineTo(p.x, p.y);
        p = proj(sc, j.x, j.y, j.z); ctx.lineTo(p.x, p.y);
      }
      const lw = Math.max(1.2, 0.14 * zm);
      ctx.lineWidth = lw + 2; ctx.strokeStyle = 'rgba(15,60,120,0.35)'; ctx.stroke(); // a dark halo so the white jet reads on light water
      ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(235,248,255,0.98)'; ctx.stroke();
      ctx.fillStyle = 'rgba(10,40,80,0.18)';
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const j = pool.jets[i], p = proj(sc, j.x, j.y, 0); ctx.moveTo(p.x + 1.4, p.y); ctx.arc(p.x, p.y, 1.4, 0, TAU); }
      ctx.fill();
      ctx.restore();
    }
    function drawOppArrow(ctx, sc) { // off-screen opponent arrow with name, distance and wet % (adapted from race's drawTargetArrow)
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
      ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(t('soslag.hud.m', { n: Math.round(U.dist(me, opp)) }) + ' · ' + Math.round(opp.wet) + ' %', ax, ay + 32);
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
    function render(alpha) { camUpdate(); scene.render(alpha); }
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
    // the app owns the pause button and stops the sim (a hidden tab pauses the same way); jets live in S.pool so they freeze with update() and go on from the same place.
    function pause() { hideCoach(); releaseFire(); try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } }
    function resume() { releaseFire(); ambient(); }
    function onResize() { scene.resize(); if (S.phase === 'intro') fitArena(); else if (S.cam !== 'fit') applyZoom(); }

    // ---- test hooks: autopilot (a competent player: KOS.AI sails the boat and the gun fires when the aim hits), skipIntro, debug
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(me, { skill: 0.97, aggression: 0.6, seed: 5 }) : null; }
    function skipIntro() { if (S.phase === 'intro') beginCount(); }
    const debug = {
      O, arenaR: AR, arena, get opp() { return opp; }, get plan() { return opp.plan; }, isWindward,
      jump(sec) { const n = Math.round(sec / KOS.DT); for (let i = 0; i < n && !S.done; i++) simStep(KOS.DT); },
      end() { finishRound(SL.endCheck(me.wet, opp.wet, true)); },
    };

    return { start, update, render, destroy, pause, resume, onResize, boat: me, boats, scene, state: S, ctrl, setAutopilot, skipIntro, debug, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
