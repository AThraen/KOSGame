// KØS SEJL — js/modes/sail.js
// The 'sail' mode: free sailing and bay challenges in Svanemøllebugten (venue 'bay', hub area 'bay').
//
// THIS IS THE REFERENCE MODE. Other sea modes copy its shape (see docs/MODE-AUTHORING.md):
//   1. strings     KOS.I18n.add('da'|'en', {sail: {...}})          (all user text goes through KOS.t)
//   2. activities  KOS.Activities.add([...])                         (what the area screen lists)
//   3. mode        KOS.Modes.register('sail', {kind: 'sea', create(host, activity) → instance})
//   instance = {start, update(dt) /*fixed KOS.DT*/, render(alpha) /*per frame*/, destroy, pause, resume, onResize}
// Wiring shown here: KOS.World venue → KOS.Wind → KOS.Physics boat → KOS.SailScene (camera, wakes, gusts, overlays)
// → KOS.Input (touch/keyboard) → KOS.UI HUD/coach/countdown → KOS.Audio (ambient, engine, sfx) → host.finish(result).
//
// Activity params (activity.params):
//   kind: 'free' | 'rings' | 'cleanup' | 'timetrial'
//   windDeg, windKn, gust (0..1), shift (0..1), seed
//   count (rings / trash pieces), course: {up, wing} (time trial leg lengths in m)
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    sail: {
      hud: { rings: 'Ringe', trash: 'Skrald', mark: 'Mærke', goals: 'Mål', start: 'Start', finish: 'Mål' },
      goal: {
        dist: 'Sejl {n} m', distRib: 'Kør {n} m', tacks: 'Lav {n} vendinger', gybes: 'Lav {n} bomninger',
        plane: 'Kom i planing i {n} sek', circles: 'Kør {n} hele cirkler', done: 'Klaret!',
      },
      btn: { done: 'Afslut tur' },
      intro: {
        free: 'Velkommen på vandet! Sejl rundt og klar de tre mål. Tryk ✓, når du vil i land.',
        freeRib: 'Gas op med håndtaget og styr med rattet. Klar de tre mål – og pas på bølgerne fra din egen RIB!',
        rings: 'Saml alle {n} ringe! Pilen viser vej til den nærmeste. Husk: du kan ikke sejle direkte op mod vinden.',
        cleanup: 'Hjælp med at holde bugten ren! Saml {n} stykker skrald op. Badezonen ved stranden (gule bøjer) er forbudt område.',
        timetrial: 'Over startlinjen, op til mærke 1 og rundt om bagbord (mærket på din venstre side). Så mærke 2 og hjem i mål!',
      },
      keys: 'Tastatur: ←/→ styr · ↑/↓ skøde · Mellemrum hæng ud',
      keysRib: 'Tastatur: ←/→ styr · ↑/↓ gas frem/bak',
      tip: {
        irons: 'Du står i vindøjet! Læg roret til den ene side og vent – så falder båden af, og sejlet fylder igen.',
        luff: 'Sejlet blafrer – hal skødet ind, til det holder op med at blafre.',
        stall: 'Skødet er for stramt. Fier lidt ud, så kører båden hurtigere.',
        heel: 'Båden krænger meget! Hæng ud – hold MELLEMRUM eller knappen HÆNG UD.',
        rail: 'Ud på kanten! Når det blæser op, skal mandskabet sidde på rælingen – så krænger båden mindre og sejler hurtigere. Hold MELLEMRUM eller knappen UD PÅ KANTEN.',
        gust: 'Et vindpust! Den mørke krusning på vandet er mere vind. Hæng ud eller fier lidt.',
        ground: 'Av, grundt vand! Styr ud mod det mørkeblå vand – der er dybere.',
        swim: 'Badezone! Her må der ikke sejles – ud igen, folk bader.',
        capsize: 'Kæntret! Bare rolig – båden bliver rejst igen om lidt.',
        plane: 'Planing! Nu glider båden oven på vandet. Wiii!',
        allGoals: 'Alle mål klaret – flot sejlet! Tryk ✓ for at afslutte, eller sejl videre.',
        wrongSide: 'Hov – mærket skal rundes om bagbord, altså med mærket på din venstre side.',
        lastMark: 'Sidste mærke rundet – nu hjem over mållinjen!',
      },
      fx: { tack: 'Vending!', gybe: 'Bomning!', gust: 'Pust!', ring: '+1 ring', combo: 'Combo x{n}!', mark: 'Mærke {n}!',
        swim: '+5 sek', plane: 'Planing!', bottle: 'Flaske!', can: 'Dåse!', bag: 'Plastikpose!', ball: 'Bold!', crate: 'Fiskekasse!', duck: 'Badeand!',
        goal: 'Mål klaret!' },
      res: {
        free: 'Du sejlede {dist} m og klarede {goals} af 3 mål.',
        rings: 'Alle {n} ringe på {time}!',
        cleanup: 'Bugten er ren! {n} stykker skrald samlet på {time}.',
        timetrial: 'Banen sejlet på {time}.',
        quit: 'Du nåede ikke alle mål denne gang – prøv igen!',
      },
      stat: { rings: 'Ringe', trash: 'Skrald samlet', top: 'Topfart (knob)', swims: 'Badezone-straf' },
    },
  });
  KOS.I18n.add('en', {
    sail: {
      hud: { rings: 'Rings', trash: 'Rubbish', mark: 'Mark', goals: 'Goals', start: 'Start', finish: 'Finish' },
      goal: {
        dist: 'Sail {n} m', distRib: 'Drive {n} m', tacks: 'Do {n} tacks', gybes: 'Do {n} gybes',
        plane: 'Plane for {n} sec', circles: 'Drive {n} full circles', done: 'Done!',
      },
      btn: { done: 'End trip' },
      intro: {
        free: 'Welcome on the water! Sail around and complete the three goals. Tap ✓ when you want to go ashore.',
        freeRib: 'Throttle up with the lever and steer with the wheel. Complete the three goals – and mind your own wake!',
        rings: 'Collect all {n} rings! The arrow points to the nearest one. Remember: you can\'t sail straight into the wind.',
        cleanup: 'Help keep the bay clean! Pick up {n} pieces of rubbish. The swim zone by the beach (yellow buoys) is off limits.',
        timetrial: 'Cross the start line, beat up to mark 1 and round it to port (mark on your left). Then mark 2 and home to the finish!',
      },
      keys: 'Keyboard: ←/→ steer · ↑/↓ sheet · Space hike',
      keysRib: 'Keyboard: ←/→ steer · ↑/↓ throttle ahead/astern',
      tip: {
        irons: 'You are in irons! Put the tiller to one side and wait – the bow falls off and the sail fills again.',
        luff: 'The sail is flapping – sheet in until it stops.',
        stall: 'The sheet is too tight. Ease a little and the boat goes faster.',
        heel: 'The boat is heeling a lot! Hike out – hold SPACE or the HIKE button.',
        rail: 'Hike out! When the breeze builds, the crew sits on the rail – the boat heels less and sails faster. Hold SPACE or the HIKE OUT button.',
        gust: 'A gust! The dark ripples on the water mean more wind. Hike out or ease a little.',
        ground: 'Ouch, shallow water! Steer towards the dark blue water – it is deeper.',
        swim: 'Swim zone! No sailing here – get out, people are swimming.',
        capsize: 'Capsized! Don\'t worry – the boat will be righted in a moment.',
        plane: 'Planing! The boat is skimming on top of the water. Wheee!',
        allGoals: 'All goals done – well sailed! Tap ✓ to finish, or keep sailing.',
        wrongSide: 'Oops – leave the mark to port, that is with the mark on your left.',
        lastMark: 'Last mark rounded – now home across the finish line!',
      },
      fx: { tack: 'Tack!', gybe: 'Gybe!', gust: 'Gust!', ring: '+1 ring', combo: 'Combo x{n}!', mark: 'Mark {n}!',
        swim: '+5 sec', plane: 'Planing!', bottle: 'Bottle!', can: 'Can!', bag: 'Plastic bag!', ball: 'Ball!', crate: 'Fish box!', duck: 'Rubber duck!',
        goal: 'Goal done!' },
      res: {
        free: 'You sailed {dist} m and completed {goals} of 3 goals.',
        rings: 'All {n} rings in {time}!',
        cleanup: 'The bay is clean! {n} pieces of rubbish in {time}.',
        timetrial: 'Course sailed in {time}.',
        quit: 'You didn\'t reach every goal this time – try again!',
      },
      stat: { rings: 'Rings', trash: 'Rubbish collected', top: 'Top speed (kn)', swims: 'Swim-zone penalties' },
    },
  });

  // ======================================================================== 2. activities
  // Boats unlock in the Sejlerpas by total stars (SPEC "Progression"); unlockAll is handled by KOS.Activities.
  const BOAT_STARS = (KOS.App && KOS.App.BOAT_STARS) || { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90, rib: 20 };
  const LADDER = ['opti', 'tera', 'feva', 'zest', 'ilca', '29er', 'hboat', 'j70', 'rib'];
  const boatName = id => { const b = KOS.Boats && KOS.Boats.get(id); return b ? b.name : id; };

  // Activity text is inline {da, en} (KOS.tt picks the language). order = position in the area list.
  const acts = [
    { id: 'sail.free.opti', order: 10, boat: 'opti', icon: 'sail', minutes: 4, difficulty: 1,
      pick: { group: 'free', key: 'sail.free' }, pickTitle: { da: 'Fri sejlads', en: 'Free sail' },
      pickDesc: { da: 'Sejl frit i bugten med den båd, du vælger, og klar tre små mål.', en: 'Sail freely in the bay in the boat you choose and complete three small goals.' },
      title: { da: 'Fri sejlads · Optimist', en: 'Free sail · Optimist' },
      desc: { da: 'Sejl frit i bugten og klar tre små mål undervejs.', en: 'Sail freely in the bay and complete three small goals.' },
      params: { kind: 'free', windDeg: 240, windKn: 8, gust: 0.45, shift: 0.3, seed: 11 } },
    { id: 'sail.rings', pick: { group: 'challenge' }, order: 20, icon: 'star', minutes: 4, difficulty: 2, unlock: null,
      title: { da: 'Ringjagt', en: 'Ring hunt' },
      desc: { da: 'Saml alle de gyldne ringe så hurtigt du kan. Brug vinden smart!', en: 'Collect all the golden rings as fast as you can. Use the wind smartly!' },
      params: { kind: 'rings', windDeg: 230, windKn: 9, gust: 0.5, shift: 0.3, seed: 21, count: 8 } },
    { id: 'sail.cleanup', pick: { group: 'challenge' }, order: 30, icon: 'trash', minutes: 5, difficulty: 2, unlock: { after: 'sail.rings' },
      title: { da: 'Ryd op i bugten', en: 'Clean up the bay' },
      desc: { da: 'Der flyder skrald i vandet. Saml det op – men hold dig ude af badezonen.', en: 'Rubbish is floating in the water. Pick it up – but keep out of the swim zone.' },
      params: { kind: 'cleanup', windDeg: 265, windKn: 7, gust: 0.4, shift: 0.4, seed: 31, count: 7 } },
    { id: 'sail.timetrial', pick: { group: 'challenge' }, order: 40, icon: 'timer', minutes: 5, difficulty: 3, unlock: { after: 'sail.cleanup' },
      title: { da: 'Tidsløb om mærkerne', en: 'Time trial round the marks' },
      desc: { da: 'Kryds op til mærke 1, videre til mærke 2 og hjem over mållinjen. Rund om bagbord!', en: 'Beat up to mark 1, on to mark 2 and home across the line. Leave the marks to port!' },
      params: { kind: 'timetrial', windDeg: 250, windKn: 10, gust: 0.55, shift: 0.35, seed: 41, course: { up: 100, wing: 85 } } },
  ];
  // one "Fri sejlads" per boat in the ladder, locked by Sejlerpas stars
  LADDER.slice(1).forEach((id, i) => {
    const rib = id === 'rib', n = boatName(id);
    acts.push({
      id: 'sail.free.' + id, order: 50 + i, boat: id, icon: rib ? 'rib' : 'boat', minutes: 4, difficulty: Math.min(5, 1 + Math.ceil(i / 2)),
      unlock: { stars: BOAT_STARS[id] || 0 }, pick: { group: 'free', key: 'sail.free' }, pickHidden: true,
      title: rib ? { da: 'Fri tur · RIB', en: 'Free ride · RIB' } : { da: 'Fri sejlads · ' + n, en: 'Free sail · ' + n },
      desc: rib ? { da: 'Kør klubbens orange RIB rundt i bugten og klar tre mål.', en: 'Drive the club\'s orange RIB around the bay and complete three goals.' }
        : { da: 'Sejl frit i bugten med ' + n + ' og klar tre små mål.', en: 'Sail freely in the bay in the ' + n + ' and complete three small goals.' },
      params: { kind: 'free', windDeg: 240, windKn: id === '29er' || id === 'j70' ? 12 : 9, gust: 0.55, shift: 0.3, seed: 60 + i },
    });
  });
  KOS.Activities.add(acts.map(a => Object.assign({ mode: 'sail', area: 'bay' }, a)));

  // ======================================================================== helpers (pure)
  const BAY_AREA = { x0: -560, y0: -960, x1: 420, y1: 60 };   // where items and courses may go

  // speed (m/s) a boat makes good along a leg whose direction is `a` rad off the wind (0 = dead upwind)
  function legSpeed(cls, tws, a) {
    if (cls.motor) return U.ms(cls.motor.maxKn * 0.55);
    const up = KOS.Boats.optimal(cls, tws, 'up', false);
    const dn = KOS.Boats.optimal(cls, tws, 'down', cls.hasSpinnaker !== 'none');
    if (a < up.twa) return U.ms(up.vmg) / Math.max(0.25, Math.cos(a));
    if (a > dn.twa) return U.ms(dn.vmg) / Math.max(0.25, Math.cos(Math.PI - a));
    return U.ms(cls.polar(a, tws));
  }
  // a "good" time (s) for a route of points, used to set star thresholds for every boat class
  function routeTime(cls, tws, windDir, pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, d = Math.hypot(dx, dy);
      const a = Math.abs(U.wrapPi(U.heading(dx, dy) - windDir));
      s += d / Math.max(0.3, legSpeed(cls, tws, a)) + 3; // +3 s per turn/pick-up
    }
    return s / 0.85;
  }
  function starsFor(ratio, assist) {
    const th = assist === 'easy' ? [1.35, 1.9] : assist === 'pro' ? [1.0, 1.4] : [1.15, 1.6];
    return ratio <= th[0] ? 3 : ratio <= th[1] ? 2 : 1;
  }

  // ======================================================================== 3. the mode
  KOS.Modes.register('sail', {
    kind: 'sea',
    create(host, activity) { return createSail(host, activity); },
  });

  function createSail(host, activity) {
    const P = Object.assign({ kind: 'free', windDeg: 240, windKn: 9, gust: 0.5, shift: 0.3, seed: 1, count: 8 }, activity.params || {});
    const assist = host.assist || 'easy';
    const venue = KOS.World.get(P.venue || 'bay');
    const rand = U.rng((P.seed || 1) * 7919 + 13);
    const clsId = (KOS.Boats.get(host.boat) ? host.boat : 'opti');
    const cls = KOS.Boats.get(clsId);
    const isRib = !!cls.motor;
    const profile = host.profile || {};
    const S = {                       // all run state lives here (sim time, never wall clock)
      phase: 'intro', time: 0, introT: 0, finishT: -1, result: null,
      items: [], pops: [], collected: 0, combo: 0, lastPick: -99,
      marks: [], leg: 0, sweep: 0, penalty: 0, swims: 0, inSwim: false,
      goals: [], topKn: 0, planeT: 0, turn: 0, lastHeading: 0, hudT: 0, ambT: 0, luffT: 0, gustOn: false,
      tips: {}, tipT: -99,
    };

    // ---- world: wind. The gust area is kept small (600 m) and follows the boat (wind.recenter in update), so dark
    // gust patches keep rolling in across the water wherever the player sails.
    // free sail and the collecting games start just off the KØS jetties (club in view); the time trial uses the venue spawn
    const spawn = Object.assign({}, P.kind === 'timetrial' || P.venue ? venue.spawn : { x: -46, y: -64, heading: U.rad(300) });
    const wind = KOS.Wind.create({
      dir: U.rad(P.windDeg), speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: spawn.x - 300, y0: spawn.y - 300, x1: spawn.x + 300, y1: spawn.y + 300 },
    });
    for (let i = 0; i < 240; i++) wind.update(0.5); // let gust patches spread out before the start
    const env = { wind, venue, assist, t: 0 };

    // ---- the player's boat (colour + sail number from the profile)
    const startSpeed = isRib ? 0 : U.ms(cls.polar(Math.PI / 2, P.windKn)) * 0.55;
    const startHeading = spawn.heading; // the time trial moves the boat onto its start line in buildCourse()
    const boat = KOS.Physics.createBoat(clsId, {
      x: spawn.x, y: spawn.y, heading: startHeading, speed: startSpeed, isPlayer: true,
      sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : (isRib ? 'KØS 1' : 'DEN 1'), name: profile.name || '',
      colors: profile.boatColor && !isRib ? { hull: profile.boatColor } : undefined,
    });
    let controls = KOS.Physics.controls();
    controls.autoTrim = assist !== 'pro';
    controls.autoHike = assist === 'easy';

    // ---- content per activity kind
    if (P.kind === 'rings') buildRings(P.count || 8);
    else if (P.kind === 'cleanup') buildTrash(P.count || 9);
    else if (P.kind === 'timetrial') buildCourse(P.course || {});
    else buildFree();

    // ---- scene (renderer). Overlays draw our items, the target arrow and the course hints.
    const scene = new KOS.SailScene(host.canvas, { tilt: host.tilt, tiltAuto: host.tiltAuto,
      venue, wind, boats: [boat], follow: boat, marks: S.marks.filter(m => m.show !== false),
      lines: S.lines || [], showNoGo: false, showWindArrow: true,
    });
    scene.addOverlay(drawItems);
    scene.addOverlay(drawTargetArrow, { screen: true });
    // Gameplay zoom: the scene's auto zoom frames the boat for detail; a game wants to see further ahead.
    // We set it so √(w·h) of screen spans about (34–40 + 5 × boat length) m (a bit closer on phones), × wheel zoom:
    // the boat reads clearly (~60 px for an Opti on desktop) and the target arrow points at anything off screen.
    let userZoom = 1;
    function applyZoom() {
      const L = cls.length, small = Math.min(scene.w, scene.h) < 600;
      const span = ((P.kind === 'free' ? 34 : 40) + 5 * L) * (small ? 0.82 : 1);
      scene.setZoom(1);
      const base = scene.baseZoom() / (1 + U.clamp(Math.abs(boat.speed) / 25, 0, 0.35)) * 1; // scene zoom at multiplier 1, boat at rest
      scene.setZoom(Math.sqrt(scene.w * scene.h) * (small ? 1.3 : 1) / span / base * userZoom);
    }
    applyZoom();
    scene.fixedZoom = scene.baseZoom() * 0.3; // start zoomed out; eases in when the intro ends

    // ---- controls (pause is App's own button top-left, so Input's is off)
    const aidOpts = isRib ? {} : KOS.SailAids.inputOpts(cls, assist); // daggerboard button + jib slider on Normal/Pro
    const ctrl = KOS.Input.attach(host.layer, Object.assign({
      layout: isRib ? 'rib' : 'sail',
      spinnaker: cls.hasSpinnaker !== 'none', spinnakerKind: cls.hasSpinnaker === 'asym' ? 'gennaker' : 'spi',
      hike: !isRib && assist !== 'easy', hikeKeel: !!cls.keel, // keelboats: "Ud på kanten" (crew on the rail)
      autoTrim: controls.autoTrim, pauseButton: false,
      extraButtons: P.kind === 'free' ? [{ id: 'done', icon: 'check', labelKey: 'sail.btn.done' }] : [],
    }, aidOpts));
    ctrl.on('done', () => endFree());
    const aids = isRib ? null : KOS.SailAids.create({ ctrl, boat, assist, coach: txt => { S.tipT = S.time; KOS.UI.coach(txt, { ms: 5600 }); } });

    // ---- HUD
    const hudItems = ['wind', 'speed'];
    if (P.kind === 'free' && !isRib) hudItems.push('pos');   // points of sail mean nothing in a motor boat
    else hudItems.push('timer');
    if (P.kind === 'rings') hudItems.push({ id: 'count', icon: 'star', labelKey: 'sail.hud.rings' });
    if (P.kind === 'cleanup') hudItems.push({ id: 'count', icon: 'trash', labelKey: 'sail.hud.trash' });
    if (P.kind === 'timetrial') hudItems.push({ id: 'count', icon: 'flag', labelKey: 'sail.hud.mark' });
    if (!isRib && assist !== 'easy' && !cls.keel && P.kind === 'free') hudItems.push('heel');
    const hud = KOS.UI.hud(host.layer, hudItems);
    let goalsChip = null;
    const goalsEl = P.kind === 'free' ? buildGoalsPanel() : null;

    // ---- events from physics (filtered to our boat; removed again in destroy)
    const handlers = {
      'boat:tack': e => { if (e.boat !== boat) return; sfx('tack'); floatText(t('sail.fx.tack'), '#9fe7ff'); },
      'boat:gybe': e => { if (e.boat !== boat) return; sfx('gybe'); floatText(t('sail.fx.gybe'), '#ffd25e'); scene.shake(0.25); },
      'boat:irons': e => { if (e.boat === boat && S.phase === 'go') tip('irons'); },
      'boat:heelWarn': e => { if (e.boat !== boat || S.phase !== 'go') return; if (!controls.autoHike) { tip('heel'); ctrl.highlight('hike', true); setTimeout(() => ctrl.highlight('hike', false), 2500); } },
      'boat:plane': e => { if (e.boat !== boat) return; sfx('whoosh', { vol: 0.7 }); floatText(t('sail.fx.plane'), '#3ee08f'); tip('plane'); },
      'boat:ground': e => { if (e.boat !== boat) return; sfx(e.speed > 1.5 ? 'crash' : 'bump', { vol: Math.min(1, 0.4 + e.speed / 3) }); tip('ground'); },
      'boat:capsize': e => { if (e.boat !== boat) return; sfx('splash'); tip('capsize', true); },
      'boat:righted': e => { if (e.boat === boat) sfx('splash', { vol: 0.5 }); },
      'boat:collide': e => { if ((e.a === boat || e.b === boat) && e.type === 'mark') sfx('bump', { vol: 0.6 }); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);

    // ---- desktop wheel zoom (touch players get the auto zoom)
    const onWheel = e => { if (e.target.closest && e.target.closest('.kc')) return; e.preventDefault(); userZoom = U.clamp(userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.5); applyZoom(); };
    host.layer.addEventListener('wheel', onWheel, { passive: false });

    // ==================================================================== content builders
    function okSpot(x, y, margin) {
      if (KOS.World.isSolid(venue, x, y)) return false;
      if (KOS.World.depthAt(venue, x, y) < (cls.draft || 0.8) + 0.3) return false;
      if (KOS.World.inZone(venue, x, y, 'swim')) return false;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, px = x + Math.cos(a) * margin, py = y + Math.sin(a) * margin;
        if (KOS.World.isSolid(venue, px, py) || KOS.World.inZone(venue, px, py, 'swim')) return false;
      }
      return x > BAY_AREA.x0 && x < BAY_AREA.x1 && y > BAY_AREA.y0 && y < BAY_AREA.y1;
    }
    function farFromItems(x, y, d) { return S.items.every(it => Math.hypot(it.x - x, it.y - y) >= d) && Math.hypot(x - spawn.x, y - spawn.y) > 35; }

    // A wandering chain from the start (each item 'min'–'max' m from the previous), so the next one is always near.
    function chain(n, min, max, spread, margin, sep, kindOf) {
      let px = spawn.x, py = spawn.y, dir = spawn.heading;
      for (let i = 0; i < n; i++) {
        let placed = false;
        for (let k = 0; k < 400 && !placed; k++) {
          const d = min + rand() * (max - min), a = dir + (rand() - 0.5) * (k < 150 ? spread : TAU);
          const x = px + Math.sin(a) * d, y = py - Math.cos(a) * d;
          if (okSpot(x, y, margin) && farFromItems(x, y, sep)) { S.items.push(item(kindOf(i), x, y)); px = x; py = y; dir = a; placed = true; }
        }
        if (!placed) for (let k = 0; k < 600 && !placed; k++) { // fallback: anywhere in the bay
          const x = U.lerp(BAY_AREA.x0, BAY_AREA.x1, rand()), y = U.lerp(-700, BAY_AREA.y1, rand());
          if (okSpot(x, y, margin) && farFromItems(x, y, sep)) { S.items.push(item(kindOf(i), x, y)); placed = true; }
        }
      }
      S.ref = routeTime(cls, P.windKn, U.rad(P.windDeg), nnRoute());
    }
    function buildRings(n) { chain(n, 30, 52, 1.8, 22, 26, () => 'ring'); }
    function buildTrash(n) {
      const kinds = ['bottle', 'can', 'bag', 'ball', 'crate', 'duck'];
      chain(n, 38, 62, 2.6, 16, 34, i => kinds[(i + (P.seed || 0)) % kinds.length]);
      S.items.forEach(it => { it.rot = rand() * TAU; it.vr = (rand() - 0.5) * 0.4; });
    }
    function item(kind, x, y) { return { kind, x, y, r: kind === 'ring' ? 1.6 : 1.1, ph: rand() * TAU, taken: false }; }
    function nnRoute() { // nearest-neighbour tour from the start: a fair estimate of a good route
      const left = S.items.slice(), pts = [{ x: spawn.x, y: spawn.y }];
      while (left.length) {
        const p = pts[pts.length - 1];
        let bi = 0; left.forEach((it, i) => { if (Math.hypot(it.x - p.x, it.y - p.y) < Math.hypot(left[bi].x - p.x, left[bi].y - p.y)) bi = i; });
        pts.push(left.splice(bi, 1)[0]);
      }
      return pts;
    }

    function buildCourse(c) {
      const wd = U.rad(P.windDeg), up = U.vec(wd), right = U.vec(wd + Math.PI / 2);
      const S0 = { x: spawn.x, y: spawn.y };
      const at = (u, r) => ({ x: S0.x + up.x * u + right.x * r, y: S0.y + up.y * u + right.y * r });
      const upL = c.up || 100, wingL = c.wing || 85;
      let side = 1;
      if (!okSpot(at(upL * 0.45, wingL).x, at(upL * 0.45, wingL).y, 25)) side = -1;
      const m1 = Object.assign(at(upL, 0), { kind: 'orange', round: 'port', label: '1', r: 1.2 });
      const m2 = Object.assign(at(upL * 0.45, side * wingL), { kind: 'orange', round: 'port', label: '2', r: 1.2 });
      const pin = Object.assign(at(0, -22), { kind: 'pin', r: 1 });
      const com = Object.assign(at(0, 22), { kind: 'committee', heading: wd, r: 3 });
      S.marks = [m1, m2, pin, com];
      S.course = [{ type: 'line' }, { type: 'mark', m: m1 }, { type: 'mark', m: m2 }, { type: 'line', finish: true }];
      S.line = { a: pin, b: com };
      S.lines = [{ a: pin, b: com, kind: 'start' }];
      if (assist === 'easy') { S.pathLine = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, kind: 'path' }; S.lines.push(S.pathLine); }
      // start a few lengths below the line on starboard tack, close-hauled
      const st = at(-18, -6);
      boat.x = st.x; boat.y = st.y; boat.heading = U.wrapPi(wd - cls.noGo - 0.25);
      const f = U.vec(boat.heading); boat.vx = f.x * boat.speed; boat.vy = f.y * boat.speed;
      S.ref = routeTime(cls, P.windKn, wd, [st, m1, m2, at(0, 0)]) + 6;
    }

    function buildFree() {
      const beamMs = isRib ? U.ms(cls.motor.maxKn * 0.6) : U.ms(cls.polar(Math.PI / 2, P.windKn));
      const dist = Math.round(beamMs * 110 / 50) * 50;
      S.goals = isRib
        ? [{ id: 'dist', key: 'sail.goal.distRib', n: dist }, { id: 'plane', key: 'sail.goal.plane', n: 5 }, { id: 'circles', key: 'sail.goal.circles', n: 2 }]
        : [{ id: 'dist', key: 'sail.goal.dist', n: dist }, { id: 'tacks', key: 'sail.goal.tacks', n: 3 }, { id: 'gybes', key: 'sail.goal.gybes', n: 2 }];
      S.goals.forEach(g => { g.done = false; g.v = 0; });
      // a few bonus rings for score
      for (let i = 0; i < 6; i++) {
        for (let k = 0; k < 300; k++) {
          const a = rand() * TAU, d = 70 + rand() * 220, x = spawn.x + Math.sin(a) * d, y = spawn.y - Math.cos(a) * d;
          if (okSpot(x, y, 20) && farFromItems(x, y, 60)) { S.items.push(item('ring', x, y)); break; }
        }
      }
    }

    function buildGoalsPanel() {
      const el = document.createElement('div');
      el.className = 'sail-goals glass';
      host.layer.appendChild(el);
      goalsChip = KOS.UI.panelChip(host.layer, el, { icon: 'flag' });
      goalsChip.expand(4500); // phones: the card shows for a few seconds, then collapses to a chip
      return el;
    }
    function paintGoals() {
      if (!goalsEl) return;
      const html = '<div class="sg-head">' + KOS.UI.iconSvg('flag') + '<span>' + KOS.UI.esc(t('sail.hud.goals')) + '</span></div>' +
        S.goals.map(g => {
          const frac = Math.min(1, g.v / g.n);
          return '<div class="sg-row' + (g.done ? ' done' : '') + '"><span class="sg-check">' + KOS.UI.iconSvg(g.done ? 'check' : 'starOutline') + '</span>' +
            '<span class="sg-txt">' + KOS.UI.esc(t(g.key, { n: g.n })) + '<i class="sg-bar"><b style="width:' + Math.round(frac * 100) + '%"></b></i></span></div>';
        }).join('');
      if (html !== paintGoals.last) { goalsEl.innerHTML = html; paintGoals.last = html; }
      if (goalsChip) { const nd = S.goals.filter(g => g.done).length; if (paintGoals.nd != null && nd !== paintGoals.nd) goalsChip.expand(3500); paintGoals.nd = nd; goalsChip.set({ text: t('sail.hud.goals') + ' ' + nd + '/' + S.goals.length, frac: S.goals.reduce((a, g) => a + Math.min(1, g.v / g.n), 0) / Math.max(1, S.goals.length), done: nd === S.goals.length }); }
    }

    // ==================================================================== small helpers
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function floatText(str, color, x, y) { if (scene.effects) scene.effects.text(x != null ? x : boat.x, y != null ? y : boat.y - 2, str, { color: color || '#fff', size: 22 }); }
    function tip(key, force) {  // each coach tip once per run, not too often
      if (S.tips[key] && !force) return;
      if (S.time - S.tipT < 6 && !force) return;
      S.tips[key] = true; S.tipT = S.time;
      KOS.UI.coach(t('sail.tip.' + key), { ms: 5200 });
    }
    function nearestItem() {
      let best = null, bd = Infinity;
      for (const it of S.items) if (!it.taken) { const d = Math.hypot(it.x - boat.x, it.y - boat.y); if (d < bd) { bd = d; best = it; } }
      return best;
    }
    function currentTarget() {
      if (P.kind === 'timetrial') {
        const c = S.course[S.leg]; if (!c) return null;
        if (c.type === 'line') return { x: (S.line.a.x + S.line.b.x) / 2, y: (S.line.a.y + S.line.b.y) / 2, color: '#ffffff', label: t(c.finish ? 'sail.hud.finish' : 'sail.hud.start') };
        return { x: c.m.x, y: c.m.y, color: '#ff9a3d', label: c.m.label };
      }
      if (P.kind === 'free') return null;
      const it = nearestItem();
      return it ? { x: it.x, y: it.y, color: it.kind === 'ring' ? '#ffd25e' : '#7dffb5' } : null;
    }

    // ==================================================================== game rules per frame
    function pickups() {
      const reach = cls.length * 0.55 + (assist === 'easy' ? 3 : 2);
      for (const it of S.items) {
        if (it.taken || Math.hypot(it.x - boat.x, it.y - boat.y) > reach + it.r) continue;
        it.taken = true; S.collected++;
        S.combo = S.time - S.lastPick < 9 ? S.combo + 1 : 1; S.lastPick = S.time;
        S.pops.push({ kind: it.kind, x: it.x, y: it.y, t: 0, rot: it.rot || 0 });
        const fx = scene.effects;
        if (fx) { fx.stars(it.x, it.y, 10); fx.ripple(it.x, it.y, 3, 0.9); fx.splash(it.x, it.y, 0.4); }
        sfx(it.kind === 'ring' ? 'coin' : 'pop', { pitch: 1 + Math.min(0.6, (S.combo - 1) * 0.08) });
        if (it.kind === 'ring') {
          floatText(S.combo > 1 ? t('sail.fx.combo', { n: S.combo }) : t('sail.fx.ring'), '#ffd25e', it.x, it.y);
        } else {
          floatText(t('sail.fx.' + it.kind), '#7dffb5', it.x, it.y);
        }
        KOS.Input.haptic && KOS.Input.haptic(18);
        if (P.kind !== 'free' && S.items.every(x => x.taken)) complete();
      }
    }

    function courseProgress(px, py) {
      const c = S.course[S.leg]; if (!c) return;
      if (c.type === 'line') {
        const L = S.line;
        if (U.segCross(px, py, boat.x, boat.y, L.a.x, L.a.y, L.b.x, L.b.y)) {
          if (c.finish) { sfx('hornLong'); complete(); return; }
          sfx('hornShort'); S.leg++; S.sweep = 0;
          scene.lines[0].kind = 'start';
        }
        return;
      }
      // a mark: sweep the bearing mark→boat while close; port rounding = bearing turns anticlockwise (negative)
      const m = c.m, d = Math.hypot(boat.x - m.x, boat.y - m.y);
      if (d < 45) {
        const b0 = U.heading(px - m.x, py - m.y), b1 = U.heading(boat.x - m.x, boat.y - m.y);
        S.sweep += U.wrapPi(b1 - b0);
        if (S.sweep > 2.2 && !S.tips.wrongSide) tip('wrongSide');
        if (S.sweep < -2.0) {
          S.leg++; S.sweep = 0; sfx('bell');
          floatText(t('sail.fx.mark', { n: m.label }), '#ffb547', m.x, m.y);
          if (scene.effects) scene.effects.stars(m.x, m.y, 12);
          m.round = null; m.done = true;
          if (S.course[S.leg] && S.course[S.leg].finish) { scene.lines[0].kind = 'finish'; tip('lastMark', true); }
        }
      } else S.sweep = 0;
    }

    function freeGoals(dt) {
      let changed = false;
      for (const g of S.goals) {
        if (g.done) continue;
        const v = g.id === 'dist' ? boat.distanceSailed : g.id === 'tacks' ? boat.tacks : g.id === 'gybes' ? boat.gybes
          : g.id === 'plane' ? S.planeT : g.id === 'circles' ? Math.abs(S.turn) / TAU : 0;
        const nv = Math.min(g.n, Math.floor(v * 10) / 10);
        if (nv !== g.v) { g.v = nv; changed = true; }
        if (v >= g.n) {
          g.done = true; changed = true; sfx('star', { pitch: 1.1 });
          floatText(t('sail.fx.goal'), '#ffd25e');
          if (scene.effects) scene.effects.stars(boat.x, boat.y, 14);
          if (S.goals.every(x => x.done)) { tip('allGoals', true); sfx('cheer', { vol: 0.5 }); if (scene.effects) scene.effects.confetti(boat.x, boat.y, 90); ctrl.highlight('done', true); }
        }
      }
      if (changed || dt === 0) paintGoals();
    }

    function swimZone() {
      const z = KOS.World.inZone(venue, boat.x, boat.y, 'swim');
      if (z && !S.inSwim) {
        S.inSwim = true; tip('swim', true); sfx('whistle');
        if (P.kind === 'cleanup' || P.kind === 'rings' || P.kind === 'timetrial') { S.penalty += 5; S.swims++; floatText(t('sail.fx.swim'), '#ff4d5e'); }
      } else if (!z) S.inSwim = false;
    }

    function complete() {
      if (S.phase !== 'go') return;
      S.phase = 'done'; S.finishT = 1.6;
      const time = S.time + S.penalty;
      const ratio = time / Math.max(20, S.ref || 60);
      const stars = starsFor(ratio, assist);
      const timeStr = KOS.UI.fmtTime(time * 1000);
      sfx('win', { vol: 0.5 });
      if (scene.effects) { scene.effects.confetti(boat.x, boat.y, 140); scene.effects.text(boat.x, boat.y - 4, '★'.repeat(stars), { color: '#ffd25e', size: 34 }); }
      scene.shake(0.3);
      const stats = { distance: Math.round(boat.distanceSailed) + ' m', tacks: boat.tacks, gybes: boat.gybes, top: +S.topKn.toFixed(1) };
      if (P.kind === 'rings') stats.rings = S.collected;
      if (P.kind === 'cleanup') stats.trash = S.collected;
      if (S.swims) stats.swims = S.swims;
      S.result = {
        stars, success: true, timeMs: Math.round(time * 1000),
        score: Math.round(1000 * Math.min(3, (S.ref || 60) / time) + S.collected * 100),
        stats: prefixStats(stats),
        msgKey: 'sail.res.' + P.kind, msgVars: { n: P.kind === 'timetrial' ? 0 : S.items.length, time: timeStr },
      };
    }
    function endFree() {
      if (S.phase === 'done') return;
      const n = S.goals.filter(g => g.done).length;
      S.phase = 'done'; S.finishT = n ? 0.9 : 0.2;
      if (n) sfx('hornShort');
      S.result = {
        stars: n, success: n > 0, timeMs: Math.round(S.time * 1000),
        score: Math.round(boat.distanceSailed + S.collected * 100 + n * 250),
        stats: prefixStats({ distance: Math.round(boat.distanceSailed) + ' m', tacks: boat.tacks, gybes: boat.gybes, top: +S.topKn.toFixed(1), rings: S.collected }),
        msgKey: n ? 'sail.res.free' : 'sail.res.quit', msgVars: { dist: Math.round(boat.distanceSailed), goals: n },
      };
    }
    // stat labels: UI.results looks up 'ui.stat.<k>' first, then the key itself → our own keys are 'sail.stat.<k>'
    function prefixStats(o) {
      const out = {};
      for (const k in o) out[KOS.I18n.has('ui.stat.' + k) ? k : 'sail.stat.' + k] = o[k];
      return out;
    }

    // ==================================================================== drawing (world-space overlay)
    function drawItems(ctx, sc) {
      const mpp = sc.mpp, tm = sc.t, v = sc.view;
      for (const it of S.items) {
        if (it.taken || it.x < v.x0 - 10 || it.x > v.x1 + 10 || it.y < v.y0 - 10 || it.y > v.y1 + 10) continue;
        const k = Math.max(1, 13 * mpp / it.r);       // never smaller than ~13 px
        const bob = 1 + 0.06 * Math.sin(tm * 2.4 + it.ph);
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(it.r * k * bob, it.r * k * bob);
        // soft ripple ring + glow so items read on any water
        const rp = (tm * 0.6 + it.ph) % 1;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * (1 - rp)) + ')'; ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.arc(0, 0, 1.2 + rp * 1.4, 0, TAU); ctx.stroke();
        if (it.kind === 'ring') drawRing(ctx, tm, it.ph); else drawTrash(ctx, it.kind, (it.rot || 0) + Math.sin(tm * 0.7 + it.ph) * 0.3);
        ctx.restore();
      }
      // pick-up pops: grow, lift and fade
      for (let i = S.pops.length - 1; i >= 0; i--) {
        const p = S.pops[i]; const a = p.t / 0.5;
        if (a >= 1) { S.pops.splice(i, 1); continue; }
        const k = Math.max(1, 13 * mpp / 1.4) * 1.4 * (1 + a * 0.9);
        ctx.save(); ctx.globalAlpha = 1 - a; ctx.translate(p.x, p.y - a * 3); ctx.scale(k, k);
        if (p.kind === 'ring') drawRing(ctx, tm, 0); else drawTrash(ctx, p.kind, p.rot);
        ctx.restore();
      }
      // time-trial: pulsing ring on the next mark
      if (P.kind === 'timetrial') {
        const tg = S.course[S.leg];
        if (tg && tg.type === 'mark') {
          const r = Math.max(5, 30 * mpp) * (1 + 0.15 * Math.sin(tm * 5));
          ctx.strokeStyle = 'rgba(255,181,71,0.9)'; ctx.lineWidth = Math.max(0.25, 3 * mpp);
          ctx.setLineDash([6 * mpp, 5 * mpp]); ctx.beginPath(); ctx.arc(tg.m.x, tg.m.y, r, 0, TAU); ctx.stroke();
        }
      }
    }
    function drawRing(ctx, tm, ph) {   // a floating golden life ring
      const g = ctx.createRadialGradient(0, 0, 0.4, 0, 0, 2.1);
      g.addColorStop(0, 'rgba(255,214,94,0.55)'); g.addColorStop(1, 'rgba(255,214,94,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 2.1, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,30,60,0.25)'; ctx.beginPath(); ctx.arc(0.15, 0.2, 1.05, 0, TAU); ctx.arc(0.15, 0.2, 0.5, 0, TAU, true); ctx.fill('evenodd');
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ffb21e';
        ctx.beginPath(); ctx.arc(0, 0, 1, i / 8 * TAU + tm * 0.4, (i + 1) / 8 * TAU + tm * 0.4); ctx.arc(0, 0, 0.52, (i + 1) / 8 * TAU + tm * 0.4, i / 8 * TAU + tm * 0.4, true); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(120,60,0,0.6)'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 0.52, 0, TAU); ctx.stroke();
      const s = 0.5 + 0.5 * Math.sin(tm * 3 + ph);   // sparkle
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * s) + ')';
      ctx.beginPath(); ctx.ellipse(-0.45, -0.6, 0.22, 0.09, -0.6, 0, TAU); ctx.fill();
    }
    function drawTrash(ctx, kind, rot) {
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(0,30,60,0.28)'; ctx.beginPath(); ctx.ellipse(0.12, 0.15, 1.05, 0.7, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 0.07; ctx.strokeStyle = 'rgba(20,30,40,0.55)';
      if (kind === 'bottle') {
        ctx.fillStyle = '#3fae6a'; rr(ctx, -0.9, -0.32, 1.35, 0.64, 0.25); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2f8a52'; rr(ctx, 0.4, -0.16, 0.5, 0.32, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-0.55, -0.32, 0.45, 0.64);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-0.8, -0.22, 1.1, 0.08);
      } else if (kind === 'can') {
        ctx.fillStyle = '#e8323c'; rr(ctx, -0.65, -0.4, 1.3, 0.8, 0.2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d7dce3'; ctx.fillRect(-0.65, -0.4, 0.18, 0.8); ctx.fillRect(0.47, -0.4, 0.18, 0.8);
        ctx.fillStyle = '#fff'; ctx.fillRect(-0.25, -0.12, 0.5, 0.24);
      } else if (kind === 'bag') {
        ctx.fillStyle = 'rgba(245,250,255,0.85)'; ctx.beginPath();
        ctx.moveTo(-0.9, -0.2); ctx.quadraticCurveTo(-0.6, -0.9, 0, -0.6); ctx.quadraticCurveTo(0.7, -0.95, 0.9, -0.1);
        ctx.quadraticCurveTo(1, 0.7, 0.1, 0.65); ctx.quadraticCurveTo(-0.9, 0.8, -0.9, -0.2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(73,198,242,0.8)'; ctx.beginPath(); ctx.moveTo(-0.4, 0.1); ctx.lineTo(0.4, 0.1); ctx.stroke();
      } else if (kind === 'ball') {
        const cols = ['#ff4d5e', '#ffffff', '#49c6f2', '#ffd25e', '#ffffff', '#3ee08f'];
        for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 0.75, i / 6 * TAU, (i + 1) / 6 * TAU); ctx.fill(); }
        ctx.beginPath(); ctx.arc(0, 0, 0.75, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, TAU); ctx.fill();
      } else if (kind === 'crate') {
        ctx.fillStyle = '#5fb7e8'; rr(ctx, -0.85, -0.6, 1.7, 1.2, 0.12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3a8fc0'; ctx.fillRect(-0.7, -0.45, 1.4, 0.9);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(-0.7, i * 0.25); ctx.lineTo(0.7, i * 0.25); } ctx.stroke();
      } else { // rubber duck
        ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(-0.1, 0.05, 0.75, 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0.45, -0.15, 0.36, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.moveTo(0.75, -0.2); ctx.lineTo(1.05, -0.1); ctx.lineTo(0.75, 0); ctx.fill();
        ctx.fillStyle = '#1d2433'; ctx.beginPath(); ctx.arc(0.52, -0.25, 0.06, 0, TAU); ctx.fill();
      }
    }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    // screen-space: arrow at the screen edge towards the target, or a bouncing chevron over it when visible
    function drawTargetArrow(ctx, sc) {
      if (S.phase === 'intro') return;
      const tg = currentTarget(); if (!tg) return;
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, H = sc.h;
      // keep clear of the HUD (top) and the touch controls (bottom / sides in landscape)
      const hb = hud.el.getBoundingClientRect(), land = H < 500;
      const m = { l: land ? 150 : 34, r: land ? KOS.Input.sideR(ctrl) : 34, t: Math.max(60, hb.bottom + 34), b: land ? 60 : W < 700 ? 190 : 130 };
      const dist = Math.round(Math.hypot(tg.x - boat.x, tg.y - boat.y));
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < H - m.b) {
        const by = p.y - 30 - Math.abs(Math.sin(sc.t * 4)) * 8;
        ctx.fillStyle = tg.color; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 10, by - 8); ctx.lineTo(p.x + 10, by - 8); ctx.lineTo(p.x, by + 4); ctx.closePath(); ctx.stroke(); ctx.fill();
        return;
      }
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? H - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx);
      const pulse = 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = tg.color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = tg.color;
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillText(tg.label && dist < 999 ? tg.label : dist + ' m', ax, ay);
      if (tg.label) { ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(dist + ' m', ax, ay + 32); }
    }

    // ==================================================================== instance
    let introCd = null, coachIntro = null;
    function start() {
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      const intro = t('sail.intro.' + (P.kind === 'free' && isRib ? 'freeRib' : P.kind), { n: S.items.length }) +
        (touch ? '' : '  ' + t(isRib ? 'sail.keysRib' : 'sail.keys') + (aids ? aids.keys() : ''));
      coachIntro = KOS.UI.coach(intro, { ms: P.kind === 'free' ? 9000 : 7000 });
      paintGoals();
      ambient();
      if (isRib) { try { KOS.Audio.engine(0); } catch (e) { /* optional */ } }
      if (P.kind === 'free') { S.phase = 'go'; scene.fixedZoom = null; return; }
      // challenges: short camera fly-in, then 3-2-1-Sejl! while the boat waits at the start
      S.phase = 'intro';
      setTimeout(() => { if (S.phase === 'intro') scene.fixedZoom = null; }, 600);
      introCd = KOS.UI.countdown(host.layer, 3, () => { introCd = null; if (S.phase === 'intro') { S.phase = 'go'; sfx('horn'); } });
    }

    function update(dt) {
      env.t += dt;
      wind.update(dt);
      if ((S.windT = (S.windT || 0) + dt) > 2) { S.windT = 0; wind.recenter(boat.x, boat.y); }
      const st = ctrl.state;
      if (S.phase === 'intro') { // hold the boat on its start spot, but let sails, heel and speed come alive
        S.introT += dt;
        const hold = { x: boat.x, y: boat.y, heading: boat.heading, distanceSailed: boat.distanceSailed };
        controls = KOS.Input.toControls(st, boat, controls, dt);
        controls.rudder = 0;
        KOS.Physics.step(boat, controls, env, dt);
        Object.assign(boat, hold);
        hudTick(dt);
        return;
      }
      const px = boat.x, py = boat.y, ph = boat.heading;
      controls = KOS.Input.toControls(st, boat, controls, dt);
      if (assist === 'easy') controls.autoHike = true;
      if (aids) aids.apply(controls);
      if (autopilot) controls = Object.assign(controls, autopilot.think(env, autoPlan(), [boat]));
      KOS.Physics.step(boat, controls, env, dt);
      KOS.Physics.collide([boat], venue, S.marks);
      if (controls.autoTrim && !isRib) ctrl.setSheet(boat.sheet);
      if (aids) aids.tick(dt, S.phase === 'go');
      // easy assist: the red no-go wedge appears only when the bow points close to the wind (a hint, not clutter)
      if (assist === 'easy' && !isRib) scene.showNoGo = Math.abs(boat.twa) < cls.noGo + 0.12 || boat.inIrons;

      if (S.phase === 'go') {
        S.time += dt;
        const kn = U.kn(Math.abs(boat.speed));
        if (kn > S.topKn) S.topKn = kn;
        if (boat.planing) S.planeT += dt;
        S.turn += U.wrapPi(boat.heading - ph);
        if ((S.driftT = (S.driftT || 0) + dt) > 1) {   // trash drifts slowly downwind (checked once a second)
          S.driftT = 0;
          const w = U.vec(wind.dir + Math.PI);
          for (const it of S.items) if (!it.taken && it.vr != null) {
            const nx = it.x + w.x * 0.06, ny = it.y + w.y * 0.06;
            if (okSpot(nx, ny, 8)) { it.x = nx; it.y = ny; }
          }
        }
        for (const it of S.items) if (it.vr != null) it.rot += it.vr * dt;
        pickups();
        if (P.kind === 'timetrial') courseProgress(px, py);
        if (P.kind === 'free') freeGoals(dt);
        swimZone();
        sailFeedback(dt);
      }
      if (S.phase === 'done' && S.finishT > 0) {
        S.finishT -= dt;
        if (S.finishT <= 0) host.finish(S.result);
      }
      for (const p of S.pops) p.t += dt;
      hudTick(dt);
    }

    // sail-handling feedback: luff flutter sound, gust puffs, trim tips
    function sailFeedback(dt) {
      if (isRib) return;
      S.luffT -= dt;
      if (boat.luffing && !boat.inIrons && S.luffT <= 0) { sfx('luff', { vol: 0.35 }); S.luffT = 0.9; if (!controls.autoTrim || ctrl.state.trimBias > 0.12) tip('luff'); }
      if (boat.stalled && (!controls.autoTrim || ctrl.state.trimBias < -0.12) && Math.abs(boat.speed) > 0.3) tip('stall');
      if (cls.keel && !controls.autoHike && boat.tws > 10 && Math.abs(boat.heel) > U.rad(cls.optHeel + 3) && boat.hike < 0.3) tip('rail');
      const base = wind.base ? wind.base.speed : P.windKn;
      const gusty = boat.tws > base * 1.18;
      if (gusty && !S.gustOn) { S.gustOn = true; sfx('whoosh', { vol: 0.4 }); floatText(t('sail.fx.gust'), '#9fe7ff'); if (S.time > 8) tip('gust'); }
      else if (!gusty && boat.tws < base * 1.08) S.gustOn = false;
    }

    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        const d = { wind: { dir: boat.windDir || wind.dir, speed: boat.tws || wind.speed }, speed: U.kn(Math.abs(boat.speed)), pos: boat.pos, heel: boat.heel, heelMax: cls.capsizeHeel || 0.8 };
        if (P.kind !== 'free') d.timer = (S.time + S.penalty) * 1000;
        if (P.kind === 'rings' || P.kind === 'cleanup') d.custom = { count: S.collected + '<small>/' + S.items.length + '</small>' };
        if (P.kind === 'timetrial') { const c = S.course[S.leg]; d.custom = { count: !c ? '✓' : c.type === 'mark' ? c.m.label + '<small>/2</small>' : KOS.UI.esc(t(c.finish ? 'sail.hud.finish' : 'sail.hud.start')) }; }
        hud.update(d);
        if (S.pathLine) { const tg = currentTarget(); if (tg) { S.pathLine.a.x = boat.x; S.pathLine.a.y = boat.y; S.pathLine.b.x = tg.x; S.pathLine.b.y = tg.y; } }
        if (isRib) { try { KOS.Audio.engine(boat.throttle); } catch (e) { /* optional */ } }
        // manual trim (pro, or AUTO switched off): the green zone on the sheet slider shows the ideal sheet
        else ctrl.setIdealSheet(controls.autoTrim || boat.inIrons ? null : KOS.Physics.idealSheet(boat), 0.07);
      }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() {
      const club = Math.hypot(boat.x - 60, boat.y + 20);
      try { KOS.Audio.ambient({ wind: boat.tws || P.windKn, waves: U.clamp(0.25 + (boat.tws || P.windKn) / 22 + Math.abs(boat.speed) / 12, 0, 1), harbor: U.clamp(1 - club / 350, 0, 0.8) }); } catch (e) { /* optional */ }
    }

    function render(alpha) { scene.render(alpha); }

    function destroy() {
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      host.layer.removeEventListener('wheel', onWheel);
      if (introCd) introCd.cancel();
      if (coachIntro) coachIntro.close(true);
      ctrl.detach();
      hud.destroy();
      if (goalsChip) goalsChip.destroy();
      if (goalsEl) goalsEl.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function pause() { try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); if (isRib) { try { KOS.Audio.engine(boat.throttle); } catch (e) { /* optional */ } } }
    function onResize() { scene.resize(); applyZoom(); }

    // ---- test hook: let KOS.AI sail the player's boat (used by tools to play a level to the end headless)
    let autopilot = null;
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(boat, { skill: 0.95, seed: 5 }) : null; S.autoCourse = null; }
    function autoPlan() {
      if (P.kind === 'timetrial') {
        if (!S.autoCourse) S.autoCourse = { course: S.course.map(c => c.type === 'line' ? { line: [S.line.a, S.line.b] } : { x: c.m.x, y: c.m.y, round: 'port' }) };
        if (S.autoCourse.legSet !== S.leg) { S.autoCourse.leg = S.leg; S.autoCourse.legSet = S.leg; } else delete S.autoCourse.leg;
        return S.autoCourse;
      }
      const tg = nearestItem() || { x: spawn.x, y: spawn.y };
      return { target: { x: tg.x, y: tg.y, r: 2 } };
    }

    function skipIntro() { if (introCd) { introCd.cancel(); introCd = null; } if (S.phase === 'intro') S.phase = 'go'; scene.fixedZoom = null; }

    // exposed for tests / tools: tools/autoplay.js uses setAutopilot + skipIntro to play a level to the end headless
    return { start, update, render, destroy, pause, resume, onResize, boat, scene, state: S, ctrl, setAutopilot, skipIntro, get controls() { return controls; } };
  }

  KOS.SailMode = { legSpeed, routeTime, starsFor }; // shared helpers other modes may reuse
})(typeof window !== 'undefined' ? window : globalThis);
