// KØS SEJL — js/modes/soslag.js
// The 'soslag' mode: Søslag i bugten (GitHub issue #11, docs/specs/soslag.md). Two H-boats duel in Svanemøllebugten with
// water guns; the wind carries the jet, so the windward position is the good one. A real KØS summer exercise: friendly, never war.
//
// Build step 4 (this file): rules + the AI duellist on top of step 3's gun. Right-of-way fouls (KOS.Rules.monitor, contact only) give the give-way
// boat a 360 degree penalty turn (720 after a hard collision; copied and adapted from race.js), the gun is locked while a turn is owed, and the
// AI is a real duellist: SEEK the windward station / SHOOT in bursts / CONTEST a windward player / ESCAPE / REFILL (luff and dip the bucket).
// Step 3: the player's gun. Intro card, 3-2-1 countdown, 180 s clock, an AI H-boat that sails to the windward
// station (4 Hz {target} plan, still passive: it does not shoot), the arena ring, the off-screen opponent arrow, and now: hold-to-fire
// SKYD with auto-aim (KOS.Soslag), a jet pool stepped in simStep, tank + dipping, gun locks, wet meters, the screen-space jet overlay,
// the duel camera (follow / fit with hysteresis), time-up and 100 % end, real results with injected wet bars, trainer tips.
// Step 5 adds the badge and polish.
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
  const STANDOFF_S = 3.5;    // the AI closes in when it has not shot for this long (and is not within 12 m)
  const AP_D = 12, AP_S = 4, AP_RANGE = 12, AP_SKILL = 0.65; // the test autopilot ("a competent player", a little better than the AI): station 12 m upwind + 4 m across, fires within 12 m
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
      pen: { auto: 'Båden tager strafrunden for dig, og skyderen er låst imens - husk reglen næste gang!', locked: 'Skyderen er låst, mens strafrunden tages', hard: 'Hård kollision - to strafrunder (720°)' },
      count: { go: 'Af sted!' },
      card: { end: 'Slut!', endSub: 'Tiden er gået', first: 'Venligt skud!', soaked: 'Gennemblødt!', soakedMe: 'Du er gennemblødt!' },
      tip: { giveway: 'Du er luv-båd lige nu - hold dig fri af ham!', windward: 'Kom op i luv af ham! Vinden bærer vandet langt ned mod vinden - men husk: luv-båden viger.', out: 'Tilbage til banen! Hold dig inde i den stiplede ring.', last: 'Sidste chance!',
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
      pen: { auto: 'The boat takes the penalty turn for you, and the gun is locked meanwhile - remember the rule next time!', locked: 'The gun is locked while the turn is taken', hard: 'Hard collision - two penalty turns (720°)' },
      count: { go: 'Go!' },
      card: { end: 'Time!', endSub: 'The clock ran out', first: 'Nice shot!', soaked: 'Soaked!', soakedMe: 'You are soaked!' },
      tip: { giveway: 'You are the windward boat now - keep clear of him!', windward: 'Get to windward of him! The wind carries the water far downwind - but remember, the windward boat gives way.', out: 'Back to the arena! Stay inside the dashed ring.', last: 'Last chance!',
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
  // downwind reach of the jet (m) at a true wind speed in knots (the memoised table of js/core/soslag.js, rounded to half knots)
  const downRange = tws => SL.downwindRange(Math.round(tws * 2) / 2);
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
    const randAi = U.rng((P.seed || 1) * 17 + 5); // the AI's own stream: its spread and burst timing
    const S = {
      phase: 'intro', clock: 0, cdT: COUNT_S, cdN: 0, hudT: 0, ambT: 0, tips: {}, tipT: -99, planN: 0, side: 1, jit: 0,
      out: false, outT: 0, endT: -1, result: null, done: false, goTipT: -1, lastTip: false, fxCount: 0,
      // gun, jets and meters (step 3)
      pool: SL.createPool(), fired: 0, hits: 0, oppHits: 0, fouls: 0, held: false, firing: false, locked: true, lockPrev: null, dip: false,
      aim: null, land: null, aimN: 0, sprayT: -9, hitSndT: -9, fxT: -9, dripT: 0, gainAcc: 0, gainT: 0, firstHit: false,
      dipHintT: -99, dipUntil: 0, farT: 0, cam: 'follow', camT: -9, fr: null,
      // rules (step 4): the player's penalty (b.pen), turns served, per-pair / player cooldowns on the SIM clock, the last boat-boat hits (closing speed)
      pen: null, penServed: 0, cool: {}, myFoulT: 0, closeT: 0, lastHit: {}, oppFouls: 0, giveT: 0, sprayAiT: -9,
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
    for (const b of [me, opp]) { b.tank = C.TANK_MAX; b.wet = 0; b.gunLock = 0; b.acc = 0; b.dry = false; b.pen = null; } // per-boat plain fields, like b.rc in race
    // the AI duellist (spec section 9): b.ai.mode = SEEK | SHOOT | CONTEST | ESCAPE | REFILL; aimSigma (deg) and the burst timing come from its skill
    const aiSigma = U.lerp(10, 5, skill), aiPace = 0.9 + 0.65 * skill, aiReact = U.lerp(0.4, 0.1, skill); // pace: burst length x, pause / x (shorter pauses at higher skill)
    opp.ai = { mode: 'SEEK', t0: 0, along0: 0, cd: 0, refillCd: 0, luff: false, burst: 0, pause: 0, react: aiReact, needFill: false, aim: null, aimN: 0, zeroT: 0, maxZeroT: 0, fired: 0, lastFire: 0, close: false, winT: 0, modeT: { SEEK: 0, SHOOT: 0, CONTEST: 0, ESCAPE: 0, REFILL: 0 } };
    const monitor = KOS.Rules.monitor({ mode: 'race', cooldown: 1 });
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
    ctrl.on('turn', () => { if (S.pen) { S.pen.auto = true; sfx('tap'); } }); // the boat takes the turn for you (on easy it already does: a harmless no-op)
    const aids = KOS.SailAids.create({ ctrl, boat: me, assist, coach: txt => say(txt) });
    host.layer.classList.add('soslag-layer');

    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', 'timer']);
    const panel = document.createElement('div');
    panel.className = 'soslag-panel glass';
    panel.innerHTML = '<div class="sl-bar me"><span class="sl-n"></span><b class="sl-p"></b><div class="sl-track"><i></i></div></div>' +
      '<div class="sl-bar op"><span class="sl-n"></span><b class="sl-p"></b><div class="sl-track"><i></i></div></div>' +
      '<div class="sl-tank"><span class="sl-ico">' + KOS.UI.iconSvg('drop') + '</span><span class="sl-n"></span><div class="sl-track"><i></i></div></div>' +
      '<div class="sl-row"><b></b><em></em></div><div class="sl-hint"></div><div class="sl-pen"></div>';
    host.layer.appendChild(panel);
    const pq = s => panel.querySelector(s);
    const pe = { meN: pq('.sl-bar.me .sl-n'), meP: pq('.sl-bar.me .sl-p'), meF: pq('.sl-bar.me i'), meB: pq('.sl-bar.me'),
      opN: pq('.sl-bar.op .sl-n'), opP: pq('.sl-bar.op .sl-p'), opF: pq('.sl-bar.op i'), opB: pq('.sl-bar.op'),
      tk: pq('.sl-tank'), tkN: pq('.sl-tank .sl-n'), tkF: pq('.sl-tank i'), d: pq('.sl-row b'), w: pq('.sl-row em'), hint: pq('.sl-hint'), pen: pq('.sl-pen') };
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

    // ==================================================================== rules: fouls and penalty turns (copied and adapted from race.js, per-boat b.pen, sim clock env.t)
    // ONE rule at every assist level and for both boats: the give-way boat that touches owes one 360 degree turn (two after a hard collision, closing speed >= 1.4 m/s),
    // its gun is locked while the turn is owed and 1.5 s after (3 s more after a hard hit). Assist only changes the help: on easy the boat steers the turn itself.
    function floatText(str, color, x, y, size) { fx(f => f.text(x != null ? x : me.x, y != null ? y : me.y - 2, str, { color: color || '#fff', size: size || 22 })); }
    function onFoul(f) {
      const now = env.t;
      if (S.phase !== 'duel') return;
      const a = f.offender, v = f.victim;
      if (!a || !v || a.pen) return;
      if (v.pen) return; // RRS 22.2: a boat taking a penalty keeps clear and has no right of way (no chain of penalties round a spinning boat)
      const gap = KOS.Rules.hullGap ? KOS.Rules.hullGap(a, v) : 0;
      if (!f.contact) { // close call, no contact: the trainer warns the player once in a while, no penalty
        if (a === me && gap < 0.4 * L && now > S.closeT) { S.closeT = now + 25; say(t(f.reasonKey, f.reasonVars || {}), 5000, 'oops'); sfx('whistle', { vol: 0.4 }); }
        return;
      }
      const rel = Math.hypot(a.vx - v.vx, a.vy - v.vy);
      if (rel < 0.35) return; // a gentle rub is not worth a penalty
      if (a === me && now < S.myFoulT) return;
      const key = a.id + '|' + v.id;
      if (S.cool[key] > now) return;
      S.cool[key] = now + 12;
      if (a === me) S.myFoulT = now + 15;
      const lh = S.lastHit[a.id + '|' + v.id] || S.lastHit[v.id + '|' + a.id]; // collision escalation: the closing speed of the boat-boat hit just now
      penalize(a, f.rule, f, !!lh && now - lh.t <= 0.5 && lh.speed >= 1.4);
    }
    function penalize(b, rule, f, hard) {
      addPen(b, hard ? 2 : 1, hard); // RRS rule 44: one turn for a Part 2 foul; two after a hard collision
      if (b === me) {
        S.fouls++;
        sfx('whistle');
        const title = KOS.Rules.ruleName(rule), why = t(f.reasonKey, f.reasonVars || {});
        if (assist === 'easy') { // easy: the same price, but the boat steers the turn (no pulsing button)
          S.pen.auto = true;
          showCard('warn', t('race.pen.warn') + ' · ' + title, hard ? t('soslag.pen.hard') : t('soslag.pen.locked'));
          say(why + ' ' + t('soslag.pen.auto'), 8000, 'oops');
          return;
        }
        showCard('bad', title, hard ? t('soslag.pen.hard') : t('race.pen.title360'));
        say(why + ' ' + t('race.pen.do360'), 8500, 'oops');
        ctrl.highlight('turn', true);
        return;
      }
      S.oppFouls++; // the AI broke a rule
      if (f && f.victim === me) {
        showCard('good', t('race.pen.rightTitle'), KOS.Rules.ruleName(rule));
        say(t('race.pen.right', { offender: b.short || b.name }), 5000);
      }
      if (U.dist(b, me) < 120) floatText(t('race.pen.ai'), '#ff9a3d', b.x, b.y - 3, 16);
    }
    function addPen(b, turns, hard) {
      if (!b.pen) b.pen = { need: 0, acc: 0, prevH: b.heading, auto: false, dir: 0, T: 0, lock: 0 };
      b.pen.need += turns * TAU; if (hard) b.pen.lock = 3;
      b.gunLock = 1.5 + b.pen.lock; // pre-armed: it counts down only once the turn is served (the gun is locked while b.pen anyway)
      SL.resetFire(b);
      if (b === me) { S.pen = b.pen; host.layer.classList.add('soslag-pen'); ctrl.setEnabled('turn', true); }
    }
    function penStep(b, dt) {
      const p = b.pen; if (!p) return;
      p.T += dt;
      const dh = U.wrapPi(b.heading - p.prevH); p.prevH = b.heading;
      if (!p.dir && Math.abs(p.acc + dh) > 0.4) p.dir = Math.sign(p.acc + dh);
      p.acc += dh;
      if (Math.abs(p.acc) >= p.need - 0.05) {
        b.pen = null;
        if (b === me) {
          S.pen = null; S.penServed += Math.round(p.need / TAU);
          host.layer.classList.remove('soslag-pen'); ctrl.highlight('turn', false); ctrl.setEnabled('turn', false);
          sfx('coin', { pitch: 1.2 }); floatText(t('race.pen.done'), '#3ee08f');
          fx(f => f.stars(me.x, me.y, 10));
        }
      }
    }
    // steer a penalty turn: keep turning one way, but build speed on a close reach first if the boat would stall head to wind
    function penControls(b, c) {
      const p = b.pen;
      if (!p) return c;
      const twa = U.wrapPi(wind.dir - b.heading), sg = twa >= 0 ? 1 : -1;
      if (!p.dir) p.dir = -sg; // first bear away
      const back = b.speed < -0.05 && assist !== 'easy' ? -1 : 1;
      if (p.build) {
        p.buildT += KOS.DT;
        const H = U.wrapPi(wind.dir - sg * (cls.noGo + 0.45));
        c.rudder = U.clamp(U.angDiff(b.heading, H) * 2.5, -1, 1) * back;
        if (b.speed > 0.85 * cls.uRef || p.buildT > 10) p.build = false;
      } else {
        const a = Math.abs(twa), into = sg === p.dir; // turning towards the wind (a tack is coming)
        c.rudder = p.dir * (into && a < cls.noGo + 0.25 ? 1 : 0.8) * back;
        if (into && a > cls.noGo + 0.1 && a < cls.noGo + 0.6 && b.speed < 0.7 * cls.uRef) { p.build = true; p.buildT = 0; }
      }
      c.spinnaker = false; c.autoTrim = true; c.trimBias = 0;
      return c;
    }

    // ==================================================================== AI duellist (spec section 9)
    // States (opp.ai.mode): SEEK the windward station / SHOOT (SEEK while a burst is on) / CONTEST (the player is windward of me: close in alongside him, where upwind jets reach, and win the place back) /
    // ESCAPE (dodge across the wind, 10 s at most) / REFILL (sail crosswind of the player, luff and dip the bucket). The 4 Hz plan switches states and picks the target;
    // aiFire() (every step) shoots in bursts when solveAim says it hits. A reached target makes the helm "finish" and idle, so every target is a fresh object with a
    // small re-offset and r = 0.5.
    function aiMode(m) { const ai = opp.ai; if (ai.mode !== m) { ai.mode = m; ai.t0 = env.t; if (m !== 'REFILL') { ai.rp = null; ai.luff = false; } } }
    function clampArena(x, y) { const dx = x - O.x, dy = y - O.y, m = Math.hypot(dx, dy), lim = 0.85 * AR; return m > lim ? { x: O.x + dx / m * lim, y: O.y + dy / m * lim } : { x, y }; }
    function planAI() {
      const ai = opp.ai, now = env.t;
      const tws = (wind.at(opp.x, opp.y) || {}).speed || P.windKn, DR = downRange(tws), dist = U.dist(opp, me);
      const meWind = Math.abs(U.wrapPi(U.bearing(opp, me) - wd)) < U.rad(60); // the player is on the AI's windward side (+/-60 degrees)
      const aiWind = Math.abs(U.wrapPi(U.bearing(me, opp) - wd)) < U.rad(60); // the AI is on the player's windward side
      const along = (opp.x - me.x) * up.x + (opp.y - me.y) * up.y;           // metres the AI is upwind of the player (negative: to leeward)
      const sd = (opp.x - me.x) * right.x + (opp.y - me.y) * right.y;         // which side of the player he is on (crosswind): keep it (hysteresis, no flip-flop)
      if (Math.abs(sd) > 4) S.side = sd > 0 ? 1 : -1;
      const m = ai.mode;
      if (m === 'REFILL') { if (opp.tank >= 60 || dist < 12 || now - ai.t0 > 25) { ai.refillCd = now + (dist < 12 || now - ai.t0 > 25 ? 8 : 0); aiMode('SEEK'); } }
      else if (m === 'ESCAPE') { if (now - ai.t0 > 10 || (dist > 0.9 * DR && !meWind)) { ai.cd = now + 6; aiMode('SEEK'); } }
      else if (m === 'CONTEST') {
        if (ai.close) { if (now - ai.lastFire < 2 || dist < 5 || now - ai.t0 > 14) { ai.close = false; ai.cd = now + 4; aiMode('SEEK'); } } // closing in after a standoff: until it has shot (or reached him)
        else if (!(meWind && dist < 0.95 * DR)) aiMode('SEEK');
        else if (now - ai.t0 > 12 && along < ai.along0 + 3) aiMode('ESCAPE');
      }
      if (ai.mode === 'SEEK' || ai.mode === 'SHOOT') {
        if (opp.tank < 12 && dist > 12 && now > ai.refillCd) aiMode('REFILL');
        else if (meWind && dist < 0.95 * DR && now > ai.cd) { ai.along0 = along; aiMode('CONTEST'); }
        else if (now > ai.cd && now > 10 && now - ai.lastFire > STANDOFF_S && dist > 12 && !(aiWind && dist < 0.95 * DR)) { ai.close = true; aiMode('CONTEST'); } // a standoff (nobody shoots): close in alongside him, where jets reach either way
      }
      S.jit = -S.jit || 1.5; // re-offset every update so a steady station never counts as "reached"
      const lx = me.x + (me.vx || 0) * LEAD_S, ly = me.y + (me.vy || 0) * LEAD_S; // aim at where he will be (a moving opponent), not where he is
      let x, y;
      if (ai.mode === 'REFILL') { // a fixed point 1.2 x downwind range crosswind of the player (re-picked only if he comes near it); luff there and dip
        if (!ai.rp || U.dist(me, ai.rp) < 0.8 * DR) ai.rp = clampArena(me.x + right.x * S.side * 1.2 * DR, me.y + right.y * S.side * 1.2 * DR);
        x = ai.rp.x + S.jit * 0.3; y = ai.rp.y;
        ai.luff = U.dist(opp, ai.rp) < (ai.luff ? 16 : 7);
      } else if (ai.mode === 'CONTEST') { // back to windward of him: aim just upwind of where he will be (the helm beats / luffs and keeps clear by rule)
        x = lx + up.x * 3 + right.x * (S.side * 6 + S.jit); y = ly + up.y * 3 + right.y * (S.side * 6 + S.jit);
      } else if (ai.mode === 'ESCAPE') { // across the wind and away: the side he is already on, 35 m
        const sg = sd >= 0 ? 1 : -1, ux = (opp.x - me.x) / Math.max(dist, 1), uy = (opp.y - me.y) / Math.max(dist, 1);
        x = opp.x + right.x * sg * 35 + ux * 10 + S.jit; y = opp.y + right.y * sg * 35 + uy * 10;
      } else { // SEEK / SHOOT: station = opponent + upwind * d + crosswind * side * 6, d = 0.7 x downwind range (clamped 9..14)
        const d = U.clamp(0.7 * DR, 9, 14);
        x = lx + up.x * d + right.x * (S.side * 6 + S.jit); y = ly + up.y * d + right.y * (S.side * 6 + S.jit);
      }
      const c = clampArena(x, y);
      opp.plan = { target: { x: c.x, y: c.y, r: 0.5 }, mode: 'race' }; // a fresh object every time
      return opp.plan;
    }
    const jitAi = s => (randAi() + randAi() + randAi() - 1.5) * 2 * s * D2R;
    function aiFire(dt) {
      const ai = opp.ai, duel = S.phase === 'duel';
      ai.modeT[ai.mode] += dt;
      if (duel && Math.abs(U.wrapPi(U.bearing(me, opp) - wd)) < U.rad(60)) ai.winT += dt; // test stat: time the AI is windward of the player
      if (opp.tank < 1.5) { ai.zeroT += dt; if (ai.zeroT > ai.maxZeroT) ai.maxZeroT = ai.zeroT; } else ai.zeroT = 0; // test: never stuck at 0 for long
      if (!duel) return;
      SL.tankStep(opp, dt);
      if (!SL.gunReady(opp)) ai.needFill = true; else if (ai.needFill && opp.tank >= 25) ai.needFill = false; // after running empty it waits for 25
      const dist = U.dist(opp, me);
      const can = !opp.pen && opp.gunLock <= 0 && !ai.needFill && U.dist(me, O) <= AR && U.dist(opp, O) <= AR; // never at a boat outside the arena
      if (can && dist < 32) { if (ai.aimN++ % 5 === 0 || !ai.aim) ai.aim = SL.solveAim(opp, me, wind); } else ai.aim = null; // 12 Hz, cached in between
      const ok = !!(can && ai.aim && ai.aim.ok);
      if (ai.pause > 0) ai.pause -= dt;
      if (!ok) { ai.react = aiReact; if (ai.burst > 0) { ai.burst = 0; ai.pause = (0.4 + randAi() * 0.5) * aiPace; } }
      else if (ai.burst > 0) {
        const rm = (assist === 'easy' && S.clock < 30 ? 0.5 : 1) * (me.wet >= 85 ? 0.5 : 1); // kindness: easy starts slowly; a crew >= 85 % wet gets half the fire
        for (let n = SL.accTake(opp, dt * rm); n > 0 && SL.gunReady(opp); n--) {
          const a = ai.aim, az = a.az + jitAi(aiSigma), el = U.clamp(a.el + jitAi(3), 0.05, 1.3);
          SL.launch(S.pool, opp, az, el, opp); SL.spend(opp, 1); ai.fired++; ai.lastFire = env.t;
          if (env.t - S.sprayAiT >= 0.4 && dist < 50) { S.sprayAiT = env.t; sfx('spray', { vol: 0.12, pitch: 0.8 + randAi() * 0.16 }); }
        }
        if ((ai.burst -= dt) <= 0) { ai.burst = 0; ai.pause = (0.4 + randAi() * 0.5) * aiPace; SL.resetFire(opp); }
      } else if (ai.pause <= 0) {
        if (ai.react > 0) ai.react -= dt;
        else { ai.burst = (0.8 + randAi() * 0.8) / aiPace; opp.acc = C.RATE_DT; }
      }
      if (ai.mode === 'SEEK' || ai.mode === 'SHOOT') ai.mode = ai.burst > 0 ? 'SHOOT' : 'SEEK'; // SHOOT is SEEK while a burst is on
    }
    // REFILL at its point: luff head to wind with the sheet eased so the boat stops (below 1.2 m/s the bucket fills at 14/s)
    function aiLuff(c) {
      const wdir = (wind.at(opp.x, opp.y) || { dir: wd }).dir, e = U.angDiff(opp.heading, wdir);
      c.rudder = U.clamp(e * 2.5 - opp.yawRate * 0.9, -1, 1) * (opp.speed < -0.05 && assist !== 'easy' ? -1 : 1);
      c.autoTrim = false; c.sheet = 1; c.trimBias = 0;
      return c;
    }
    // the player's autopilot (test hook, "a competent player"): sails to just windward of the opponent and fires whenever the aim says it hits
    let autopilot = null;
    function autoPlan() {
      const sd = (me.x - opp.x) * right.x + (me.y - opp.y) * right.y; if (Math.abs(sd) > 2) S.apSide = sd > 0 ? 1 : -1;
      let x = opp.x + (opp.vx || 0) * 2 + up.x * AP_D + right.x * AP_S * (S.apSide || 1), y = opp.y + (opp.vy || 0) * 2 + up.y * AP_D + right.y * AP_S * (S.apSide || 1);
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
      if (S.fired < C.MIN_JETS && e.outcome === 'draw') e = { outcome: 'lose', why: e.why, diff: e.diff }; // a crew that hardly shot does not draw: an idle player loses
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
        soslag: { myWet, oppWet, myHits: S.hits, oppHits: S.oppHits, fired: S.fired, outcome: e.outcome, why: e.why, fouls: S.fouls, oppFouls: S.oppFouls, oppFired: opp.ai.fired },
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
      S.dip = false;
      if (duel) S.dip = SL.tankStep(me, dt);
      const locked = !duel || S.out || !!me.pen || !SL.gunReady(me) || me.gunLock > 0; // a turn owed (+1.5 s after) locks the gun
      const held = duel && !!ctrl.state.buttons.fire, ap = duel && !!autopilot;
      if (ap && !held && U.dist(me, opp) > 26) S.aim = S.land = null; // the autopilot only aims when the opponent is anywhere near
      else if ((held || ap) && (S.aimN++ % 3 === 0 || (held && !S.held) || !S.aim)) aimUpdate(); // solveAim every 6th step (10 Hz, spec: at most every 4th); the cached aim is reused in between
      const want = held || (ap && S.aim && S.aim.ok && U.dist(me, opp) < AP_RANGE); // a competent player shoots from close in
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
        // the windward boat gives way (R11): remind the player once when the best shooting place is the place where he must keep clear
        if (!S.tips.giveway && S.clock > 15 && U.dist(me, opp) < 3 * L && Math.abs(U.wrapPi(U.bearing(opp, me) - wd)) < U.rad(60)) tip('giveway');
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
      if (S.pen && (S.pen.auto || autopilot)) penControls(me, controls); // a turn owed is steered by the boat on easy / on the button / by the autopilot
      KOS.Physics.step(me, controls, env, dt);
      // the AI re-plans at 4 Hz (every 15 steps), and at once if its helm ever thinks it has arrived
      if (S.planN++ % 15 === 0 || opp.helm.finished) planAI();
      let oc = opp.helm.think(env, opp.plan, live);
      if (opp.ai.mode === 'REFILL' && opp.ai.luff && !opp.pen) oc = aiLuff(oc);
      if (opp.pen) oc = penControls(opp, oc);
      KOS.Physics.step(opp, oc, env, dt);
      for (const h of KOS.Physics.collide(live, venue, []) || []) if (h.type === 'boat') S.lastHit[h.a.id + '|' + h.b.id] = { speed: h.speed, t: env.t }; // closing speed, for the hard-collision escalation
      for (const b of boats) { if (b.pen) penStep(b, dt); else if (b.gunLock > 0) b.gunLock = Math.max(0, b.gunLock - dt); } // the lock after a turn counts down once it is served
      if (S.phase === 'duel') for (const f of monitor.update(live, wind, [], dt) || []) onFoul(f); // fouls by contact only; no marks, so R18 / R31 are inactive
      // outside the arena: the gun is locked and the trainer says so
      S.out = U.dist(me, O) > AR;
      if (S.out && S.phase === 'duel' && env.t - S.outT > 10) { S.outT = env.t; tip('out', true); }
      // order inside one step: move, jets and hits, wet clamp, the 100 % check, then the clock
      gunStep(dt);
      aiFire(dt);
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
        opp.tag = opp.short + ' ' + Math.round(opp.wet) + ' %' + (opp.pen ? ' ↻' : ''); // "Træner Anton 12 %", a turn symbol while he pays a penalty
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
      // the penalty turn: a progress bar while one is owed (no animated width with reduced motion)
      const pn = S.pen ? Math.round(U.clamp(Math.abs(S.pen.acc) / S.pen.need, 0, 1) * 100) : -1;
      if (pv.pn !== pn) { pv.pn = pn; pe.pen.innerHTML = pn < 0 ? '' : '<div class="rp-pen"><span>' + KOS.UI.esc(t('race.pen.progress')) + ' ' + Math.round(Math.abs(S.pen.acc) * 180 / Math.PI) + '°/' + Math.round(S.pen.need * 180 / Math.PI) + '°</span><i><b style="width:' + pn + '%' + (red ? ';transition:none' : '') + '"></b></i></div>'; }
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
      for (const b of boats) if (b.pen) { // penalty turn ring round the boat that owes it
        const fr = U.clamp(Math.abs(b.pen.acc) / b.pen.need, 0, 1), r = L * 0.9 + 3;
        ctx.lineWidth = Math.max(0.25, 3 * mpp); ctx.strokeStyle = 'rgba(255,77,94,0.35)';
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ff9a3d'; ctx.beginPath(); ctx.arc(b.x, b.y, r, -Math.PI / 2, -Math.PI / 2 + fr * TAU); ctx.stroke();
      }
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
      ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(t('soslag.hud.m', { n: Math.round(U.dist(me, opp)) }) + ' · ' + Math.round(opp.wet) + ' %' + (opp.pen ? ' ↻' : ''), ax, ay + 32);
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
      host.layer.classList.remove('soslag-layer', 'soslag-go', 'soslag-pen', 'has-intro-card');
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
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(me, { skill: AP_SKILL, aggression: 0.6, seed: 5 }) : null; }
    function skipIntro() { if (S.phase === 'intro') beginCount(); }
    const debug = {
      O, arenaR: AR, arena, get opp() { return opp; }, get plan() { return opp.plan; }, get ai() { return opp.ai; }, isWindward, foul(off, vic, hard) { // test hook: a contact foul by off (me or opp) on vic, as the monitor would report it
        if (hard) S.lastHit[off.id + '|' + vic.id] = { speed: 2, t: env.t };
        onFoul({ offender: off, victim: vic, rule: 'R10', contact: true, reasonKey: 'rules.reason.R10', reasonVars: {} }); },
      jump(sec) { const n = Math.round(sec / KOS.DT); for (let i = 0; i < n && !S.done; i++) simStep(KOS.DT); },
      end() { finishRound(SL.endCheck(me.wet, opp.wet, true)); },
    };

    return { start, update, render, destroy, pause, resume, onResize, boat: me, boats, scene, state: S, ctrl, setAutopilot, skipIntro, debug, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
