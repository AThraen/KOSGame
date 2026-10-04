// KØS SEJL — js/modes/capsize.js
// The 'capsize' mode (kind 'dom', hub area 'club'): capsize recovery seen from astern.
// The boat lies flat on the water (or upside down – "turtle" – for the 29er). Swim round the stern, climb onto the
// daggerboard at the right moment (timing meter), lean back (hold) and LET GO in time, scramble in and bail out.
// Boat-specific steps: ILCA releases the mainsheet first, Feva/29er scoop the crew in, Opti bails with the bailer,
// the others open their self-bailers and sail the water out. Timed, with silly splashes.
// Test hooks: inst.setAutopilot(on) plays perfectly, inst.skipIntro(), inst.debug.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const esc = s => (KOS.UI && KOS.UI.esc ? KOS.UI.esc(s) : String(s));

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    capsize: {
      title: 'Kæntring: {boat}', turtle: 'Turtle!',
      step: {
        capsize: 'Pust! Båden kæntrer …', capsizeTurtle: 'Pust! Båden kæntrer – og vender helt rundt!',
        swim: 'Hold fast i båden og svøm rundt om agterenden hen til sværdet. Tryk for hvert svømmetag!',
        sheet: 'Slip storskødet fra klampen – ellers sejler båden fra dig, når den kommer op.',
        crew: 'Sig til din gast: læg dig ind i båden! Så bliver gasten øset op sammen med båden.',
        climb: 'Klatr op på sværdet! Tryk, når viseren er i det grønne felt.',
        climbHull: 'Kravl op på bunden af båden. Tryk igen og igen!',
        unturtle: 'Grib sværdet og læn dig tilbage. Hold knappen – masten sidder fast i vandet!',
        lean: 'Hold for at læne dig tilbage – og SLIP, når masten er halvvejs oppe (det grønne felt).',
        scramble: 'Båden er oppe! Kravl hurtigt ind over siden. Tryk løs!',
        bail: 'Øs vandet ud med øsekarret. Tryk for hver øsning!',
        drain: 'Selvlænseren er åben. Hold knappen for at sejle – så suger den vandet ud!',
        done: 'Klar igen – flot rejst!',
      },
      btn: { swim: 'Svøm!', sheet: 'Slip skødet', crew: 'Ind i båden!', climb: 'Klatr!', climbHull: 'Kravl!', unturtle: 'Hold: læn tilbage', lean: 'Hold: læn tilbage', scramble: 'Kravl ind!', bail: 'Øs!', drain: 'Hold: sejl!', wait: '…' },
      fx: { splash: 'PLASK!', slip: 'Glip!', perfect: 'Perfekt timing!', early: 'For tidligt!', over: 'Væltede ind over dig!', up: 'Op igen!', flat: 'Den ligger fladt!', free: 'Skødet er fri!', scoop: 'Gasten er inde!', dry: 'Tør!', good: 'Godt!' },
      coach: {
        intro: 'Alle kæntrer – det er en del af at sejle! Bliv altid ved båden.',
        turtle: 'En 29er vender let rundt. Kravl op på bunden, og brug sværdet som håndtag.',
        early: 'Du slap for tidligt. Hold lidt længere, til masten er halvvejs oppe.',
        over: 'Hov! Du hang på for længe, så båden væltede ind over dig. Slip, når masten er halvvejs oppe.',
        climb: 'Vent på, at viseren er i det grønne felt – så hjælper bølgen dig op.',
        sheet: 'Godt tænkt: et frit skøde betyder, at båden bliver liggende, når den kommer op.',
      },
      gauge: { mast: 'Mast', release: 'SLIP her', water: 'Vand' },
      hud: { time: 'Tid', mistakes: 'Fejl' },
      res: { msg: '{boat} rejst på {time} med {m} fejl.' },
      stat: { mistakes: 'Fejl', strokes: 'Svømmetag' },
    },
  });
  KOS.I18n.add('en', {
    capsize: {
      title: 'Capsize: {boat}', turtle: 'Turtle!',
      step: {
        capsize: 'Gust! The boat capsizes …', capsizeTurtle: 'Gust! The boat capsizes – and turns right over!',
        swim: 'Hold on to the boat and swim round the stern to the daggerboard. Tap for every stroke!',
        sheet: 'Uncleat the mainsheet – otherwise the boat sails off without you when it comes up.',
        crew: 'Tell your crew: lie down in the boat! Then the crew is scooped up with the boat.',
        climb: 'Climb onto the daggerboard! Tap when the needle is in the green zone.',
        climbHull: 'Climb onto the bottom of the boat. Tap again and again!',
        unturtle: 'Grab the daggerboard and lean back. Hold the button – the mast is stuck in the water!',
        lean: 'Hold to lean back – and LET GO when the mast is halfway up (the green zone).',
        scramble: 'The boat is up! Scramble in over the side. Tap fast!',
        bail: 'Bail the water out with the bailer. Tap for every scoop!',
        drain: 'The self-bailer is open. Hold the button to sail – that sucks the water out!',
        done: 'Ready again – nicely done!',
      },
      btn: { swim: 'Swim!', sheet: 'Free the sheet', crew: 'Get in!', climb: 'Climb!', climbHull: 'Climb!', unturtle: 'Hold: lean back', lean: 'Hold: lean back', scramble: 'Scramble in!', bail: 'Bail!', drain: 'Hold: sail!', wait: '…' },
      fx: { splash: 'SPLASH!', slip: 'Slipped!', perfect: 'Perfect timing!', early: 'Too early!', over: 'It fell on top of you!', up: 'Up again!', flat: 'It’s lying flat!', free: 'Sheet free!', scoop: 'Crew is in!', dry: 'Dry!', good: 'Good!' },
      coach: {
        intro: 'Everyone capsizes – it’s part of sailing! Always stay with the boat.',
        turtle: 'A 29er turns over easily. Climb onto the hull and use the daggerboard as a handle.',
        early: 'You let go too early. Hold a bit longer, until the mast is halfway up.',
        over: 'Oops! You held on too long, so the boat came over on top of you. Let go when the mast is halfway up.',
        climb: 'Wait for the needle to be in the green zone – then the wave helps you up.',
        sheet: 'Smart: a free sheet means the boat stays put when it comes up.',
      },
      gauge: { mast: 'Mast', release: 'LET GO here', water: 'Water' },
      hud: { time: 'Time', mistakes: 'Mistakes' },
      res: { msg: '{boat} righted in {time} with {m} mistakes.' },
      stat: { mistakes: 'Mistakes', strokes: 'Strokes' },
    },
  });

  // ======================================================================== 2. activities
  const SCEN = {
    opti: { phases: ['capsize', 'swim', 'climb', 'lean', 'scramble', 'bail'], hw: 34, top: -16, bottom: 8, mast: 128, board: 48, sailW: 30, box: true, power: 120, crew: 1 },
    feva: { phases: ['capsize', 'swim', 'crew', 'climb', 'lean', 'scramble', 'drain'], hw: 37, top: -15, bottom: 11, mast: 150, board: 56, sailW: 32, power: 112, crew: 2 },
    ilca: { phases: ['capsize', 'swim', 'sheet', 'climb', 'lean', 'scramble', 'drain'], hw: 34, top: -12, bottom: 10, mast: 156, board: 54, sailW: 34, power: 104, crew: 1 },
    '29er': { phases: ['capsizeTurtle', 'climbHull', 'unturtle', 'climb', 'crew', 'lean', 'scramble', 'drain'], hw: 40, top: -12, bottom: 8, mast: 166, board: 62, sailW: 34, wings: true, power: 128, crew: 2, light: true },
  };
  KOS.Activities.add([
    { id: 'capsize.opti', boat: 'opti', order: 40, difficulty: 1, unlock: null,
      title: { da: 'Kæntring i Optimist', en: 'Capsize in an Optimist' }, desc: { da: 'Rejs Opti’en, og øs den tom.', en: 'Right the Opti and bail it dry.' } },
    { id: 'capsize.feva', boat: 'feva', order: 41, difficulty: 2, unlock: { after: 'capsize.opti' },
      title: { da: 'Kæntring i Feva', en: 'Capsize in a Feva' }, desc: { da: 'To om bord: øs gasten op med båden.', en: 'Two aboard: scoop your crew up with the boat.' } },
    { id: 'capsize.ilca', boat: 'ilca', order: 42, difficulty: 3, unlock: { after: 'capsize.feva' },
      title: { da: 'Kæntring i ILCA', en: 'Capsize in an ILCA' }, desc: { da: 'Slip skødet, og rejs den alene.', en: 'Free the sheet and right it on your own.' } },
    { id: 'capsize.29er', boat: '29er', order: 43, difficulty: 4, unlock: { after: 'capsize.ilca' },
      title: { da: '29er på hovedet (turtle)', en: '29er upside down (turtle)' }, desc: { da: 'Båden er vendt helt rundt. Få den op igen!', en: 'The boat has turned right over. Get it back up!' } },
  ].map(a => Object.assign({ mode: 'capsize', area: 'club', icon: 'life', minutes: 2, params: { boat: a.boat } }, a)));

  KOS.Modes.register('capsize', { kind: 'dom', create(host, activity) { return createCapsize(host, activity); } });

  // ======================================================================== 3. helpers
  function sfx(name, o) { try { if (KOS.Audio) KOS.Audio.play(name, o); } catch (e) { /* optional */ } }
  const f1 = v => Math.round(v * 10) / 10;
  const D2R = Math.PI / 180;
  const Y = 200; // waterline in scene units

  function createCapsize(host, activity) {
    const boatId = (activity.params && activity.params.boat) || activity.boat || 'opti';
    const C = SCEN[boatId] || SCEN.opti;
    const cls = (KOS.Boats && KOS.Boats.get(boatId)) || { name: boatId, colors: { hull: '#ffffff', deck: '#eeeeee', sail: '#ffffff' } };
    const colors = Object.assign({ hull: '#ffffff', deck: '#f0f0f0', sail: '#ffffff' }, cls.colors || {});
    const assist = host.assist || 'easy';
    const easy = assist === 'easy', pro = assist === 'pro';
    const prof = host.profile || {};
    const av = Object.assign({ skin: '#f6c39f', hair: '#5a3720', jacket: '#ff7a3d' }, prof.avatar || {});
    const rng = U.rng(4242 + boatId.length * 17);
    const N = { swim: easy ? 5 : pro ? 9 : 7, climbHull: easy ? 4 : pro ? 7 : 5, scramble: easy ? 3 : pro ? 6 : 4, bail: easy ? 6 : pro ? 10 : 8 };
    const zoneW = easy ? 0.34 : pro ? 0.14 : 0.22;
    const period = easy ? 1.9 : pro ? 1.15 : 1.5;

    const S = {
      pi: -1, phase: '', pt: 0, time: 0, running: false, mistakes: 0, strokes: 0,
      a: 0, w: 0, L: 0, hold: false, prog: 0, water: 0, sheetFree: boatId !== 'ilca', crewIn: false, crewK: 0,
      needle: 0, phi: 0, climbK: -1, sailor: { x: -60, y: Y + 4 }, pose: 'sit', swimK: 0, released: false, releaseA: null,
      t: 0, done: false, finishT: -1, result: null, auto: false, autoT: 0, overT: -1, fallT: -1, sailX: 0, tips: {}, flashT: 0,
      drops: [], rings: [], fish: null, duck: { x: -260, t: 0 }, gull: null, panelKey: '',
    };

    // ---- DOM
    const root_ = document.createElement('div');
    root_.className = 'capsize-root';
    root_.innerHTML =
      '<svg class="capsize-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">' +
        '<defs>' +
          '<linearGradient id="cpSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4e5f9e"/><stop offset=".45" stop-color="#a98bbf"/><stop offset=".8" stop-color="#f4b08e"/><stop offset="1" stop-color="#ffd3a0"/></linearGradient>' +
          '<linearGradient id="cpSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d86ad"/><stop offset=".12" stop-color="#4a6f9c"/><stop offset="1" stop-color="#1d3f6e"/></linearGradient>' +
          '<linearGradient id="cpFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d8cc0" stop-opacity=".55"/><stop offset="1" stop-color="#1d3f6e" stop-opacity=".85"/></linearGradient>' +
          '<radialGradient id="cpSun"><stop offset="0" stop-color="#fff3d0"/><stop offset=".4" stop-color="#ffd59a" stop-opacity=".8"/><stop offset="1" stop-color="#ffb07a" stop-opacity="0"/></radialGradient>' +
        '</defs>' +
        '<rect x="-3000" y="-3000" width="6400" height="' + (3000 + Y) + '" fill="url(#cpSky)"/>' +
        '<circle cx="290" cy="' + (Y - 40) + '" r="70" fill="url(#cpSun)"/>' +
        '<g class="cp-sky"></g>' +
        '<rect x="-3000" y="' + (Y - 2) + '" width="6400" height="3000" fill="url(#cpSea)"/>' +
        '<g class="cp-back"></g>' +
        '<g class="cp-boat"></g>' +
        '<g class="cp-sailor"></g>' +
        '<path class="cp-front" fill="url(#cpFront)"/>' +
        '<path class="cp-crest" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>' +
        '<g class="cp-fx"></g>' +
      '</svg>' +
      '<div class="capsize-top">' +
        '<div class="capsize-title"><span class="capsize-ico">' + KOS.UI.iconSvg('life') + '</span><div><b>' + esc(t('capsize.title', { boat: cls.name })) + '</b><div class="capsize-steps"></div></div></div>' +
        '<div class="capsize-stats"><div class="capsize-stat"><span>' + esc(t('capsize.hud.time')) + '</span><b class="cp-time">0:00.0</b></div>' +
        '<div class="capsize-stat cp-stat-m"><span>' + esc(t('capsize.hud.mistakes')) + '</span><b class="cp-m">0</b></div></div>' +
      '</div>' +
      '<div class="capsize-floats"></div>' +
      '<div class="capsize-panel">' +
        '<p class="capsize-text"></p>' +
        '<div class="capsize-meter"></div>' +
        '<button type="button" class="capsize-btn btn btn-primary"><span class="cp-btn-ico"></span><span class="cp-btn-txt"></span></button>' +
      '</div>';
    host.layer.appendChild(root_);
    const svg = root_.querySelector('.capsize-svg');
    const G = { sky: svg.querySelector('.cp-sky'), back: svg.querySelector('.cp-back'), boat: svg.querySelector('.cp-boat'), sailor: svg.querySelector('.cp-sailor'),
      front: svg.querySelector('.cp-front'), crest: svg.querySelector('.cp-crest'), fx: svg.querySelector('.cp-fx') };
    const elText = root_.querySelector('.capsize-text'), elMeter = root_.querySelector('.capsize-meter');
    const btn = root_.querySelector('.capsize-btn'), elBtnTxt = root_.querySelector('.cp-btn-txt'), elBtnIco = root_.querySelector('.cp-btn-ico');
    const elTime = root_.querySelector('.cp-time'), elM = root_.querySelector('.cp-m'), elSteps = root_.querySelector('.capsize-steps');
    const floats = root_.querySelector('.capsize-floats');
    const panel = root_.querySelector('.capsize-panel'), top_ = root_.querySelector('.capsize-top');
    let vb = { x: 0, y: 0, w: 400, h: 300, s: 1 };

    // skyline + far boats (static)
    G.sky.innerHTML = skyline();
    function skyline() {
      let h = '<g fill="#7d76a6" opacity=".75">';
      const r = U.rng(99);
      for (let x = -700; x < 1100; x += 18 + r() * 26) { const w = 14 + r() * 26, hh = 12 + r() * (x > 60 && x < 330 ? 46 : 22); h += '<rect x="' + f1(x) + '" y="' + f1(Y - 2 - hh) + '" width="' + f1(w) + '" height="' + f1(hh + 2) + '"/>'; }
      h += '</g><g fill="#8f86b4" opacity=".6"><rect x="120" y="' + (Y - 70) + '" width="10" height="68"/><rect x="134" y="' + (Y - 64) + '" width="10" height="62"/></g>'; // power station chimneys
      h += '<g fill="#f6efe6" opacity=".7"><path d="M-120 ' + (Y - 3) + ' l8 -22 l1 22z"/><path d="M520 ' + (Y - 3) + ' l7 -18 l1 18z"/></g>';
      return h;
    }

    // ---- boat geometry
    function toWorld(lx, ly, a, ox, oy) { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [ox + lx * c - ly * s, oy + lx * s + ly * c]; }
    function boatOrigin() { return [200 + S.sailX, Y - 6 + bob()]; }
    function bob() { return 2.4 * Math.sin(S.t * 1.8) + (S.phase === 'climb' ? (S.needle - 0.5) * 7 : 0); }
    function hullPath() {
      const hw = C.hw, tp = C.top, bt = C.bottom;
      if (C.box) return 'M' + (-hw) + ' ' + tp + ' L' + (-hw + 3) + ' ' + (bt - 2) + ' Q' + (-hw + 4) + ' ' + bt + ' ' + (-hw + 8) + ' ' + bt + ' L' + (hw - 8) + ' ' + bt + ' Q' + (hw - 4) + ' ' + bt + ' ' + (hw - 3) + ' ' + (bt - 2) + ' L' + hw + ' ' + tp + 'Z';
      return 'M' + (-hw) + ' ' + tp + ' Q' + (-hw + 2) + ' ' + (bt - 2) + ' ' + (-hw * 0.45) + ' ' + bt + ' L' + (hw * 0.45) + ' ' + bt + ' Q' + (hw - 2) + ' ' + (bt - 2) + ' ' + hw + ' ' + tp + 'Z';
    }
    function boatSvg() {
      const hw = C.hw, tp = C.top, bt = C.bottom, mt = tp - C.mast;
      const sheetLoose = S.sheetFree;
      const boomEnd = sheetLoose ? C.sailW + 10 : C.sailW;
      let h = '';
      // daggerboard (through the hull, sticks out of the bottom)
      h += '<rect x="-4.5" y="' + (bt - 4) + '" width="9" height="' + (C.board + 4) + '" rx="3.5" fill="#f2f2ee" stroke="#1d2433" stroke-width="1.6"/>' +
        '<rect x="-1.5" y="' + (bt + 4) + '" width="3" height="' + (C.board - 10) + '" rx="1.5" fill="rgba(0,0,0,.08)"/>';
      // rig
      if (!C.box) h += '<path d="M0 ' + f1(tp - C.mast * 0.72) + ' L' + (-hw + 2) + ' ' + tp + ' M0 ' + f1(tp - C.mast * 0.72) + ' L' + (hw - 2) + ' ' + tp + '" stroke="rgba(30,36,51,.55)" stroke-width="1"/>';
      h += '<path d="M1.5 ' + (mt + 6) + ' L1.5 ' + (tp - 7) + ' L' + boomEnd + ' ' + (tp - 9) + ' Z" fill="' + colors.sail + '" stroke="rgba(20,30,50,.5)" stroke-width="1.2"/>' +
        '<path d="M2 ' + f1(mt + C.mast * 0.3) + ' L' + f1(boomEnd * 0.42) + ' ' + f1(mt + C.mast * 0.33) + ' M2 ' + f1(mt + C.mast * 0.55) + ' L' + f1(boomEnd * 0.68) + ' ' + f1(mt + C.mast * 0.57) + '" stroke="rgba(20,30,50,.25)" stroke-width="1.2"/>';
      if (C.box) h += '<path d="M2 ' + (tp - 9) + ' L' + (C.sailW - 2) + ' ' + f1(mt + 10) + '" stroke="#c9ced8" stroke-width="2"/>'; // Opti sprit
      h += '<rect x="-2.4" y="' + mt + '" width="4.8" height="' + (C.mast + 2) + '" rx="2" fill="#dfe4ee" stroke="#5c6478" stroke-width="1"/>' +
        '<path d="M0 ' + mt + ' l10 3 l-10 3z" fill="#ff4d5e"/>' +
        '<path d="M0 ' + (tp - 8) + ' L' + boomEnd + ' ' + (tp - 10) + '" stroke="#9aa3b5" stroke-width="3.2" stroke-linecap="round"/>';
      // hull
      if (C.wings) h += '<path d="M' + (-hw - 16) + ' ' + (tp + 2) + ' H' + (hw + 16) + '" stroke="#5c6478" stroke-width="4" stroke-linecap="round"/>';
      h += '<path d="' + hullPath() + '" fill="' + colors.hull + '" stroke="#1d2433" stroke-width="2"/>' +
        '<path d="M' + (-hw + 5) + ' ' + (tp + 3) + ' H' + (hw - 5) + '" stroke="' + colors.deck + '" stroke-width="5" stroke-linecap="round" opacity=".9"/>' +
        '<path d="M' + (-hw + 2) + ' ' + (tp + 1) + ' H' + (hw - 2) + '" stroke="rgba(0,0,0,.35)" stroke-width="2"/>' +
        '<rect x="-3" y="' + (tp - 4) + '" width="6" height="8" rx="1.5" fill="#1d2433"/>'; // rudder stock on the transom
      // water inside the cockpit (upright only)
      if (S.water > 0.01 && Math.abs(S.a) < 30) {
        const lvl = bt - 3 - (bt - tp - 6) * S.water;
        const sw = 1.6 * Math.sin(S.t * 3);
        h += '<path d="M' + (-hw + 6) + ' ' + f1(lvl - sw) + ' Q0 ' + f1(lvl + sw * 2) + ' ' + (hw - 6) + ' ' + f1(lvl + sw) + ' L' + (hw * 0.45) + ' ' + (bt - 2) + ' L' + (-hw * 0.45) + ' ' + (bt - 2) + 'Z" fill="rgba(73,150,230,.7)"/>';
      }
      // crew scooped in (lying in the boat)
      if (S.crewIn && C.crew > 1) h += crewLying(tp);
      // sheet tail + cleat highlight for the ILCA step
      if (boatId === 'ilca') h += '<circle cx="' + (hw * 0.4) + '" cy="' + (tp + 2) + '" r="' + (S.phase === 'sheet' ? 6 + Math.sin(S.t * 8) * 1.5 : 3) + '" fill="' + (sheetLoose ? '#3ee08f' : '#ffd25e') + '" stroke="#1d2433" stroke-width="1.2"/>';
      return h;
    }
    function crewLying(tp) {
      const j = '#ffd25e';
      return '<g transform="translate(0 ' + (tp + 2) + ')"><ellipse cx="-6" cy="0" rx="14" ry="5" fill="' + j + '" stroke="#1d2433" stroke-width="1.2"/>' +
        '<circle cx="12" cy="-1" r="5.5" fill="#e0a37a" stroke="#1d2433" stroke-width="1"/><path d="M8 -4 Q12 -9 17 -3" fill="#2b1d14"/></g>';
    }

    // ---- sailor drawing (world coordinates)
    function sailorSvg() {
      const sk = av.skin, jk = av.jacket, hair = av.hair, vest = '#ff4d2e';
      const head = (x, y, r) => '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + r + '" fill="' + sk + '" stroke="#1d2433" stroke-width="1.4"/>' +
        '<path d="M' + f1(x - r) + ' ' + f1(y - 1) + ' Q' + f1(x) + ' ' + f1(y - r * 1.9) + ' ' + f1(x + r) + ' ' + f1(y - 1) + ' Q' + f1(x) + ' ' + f1(y - r * 0.8) + ' ' + f1(x - r) + ' ' + f1(y - 1) + 'Z" fill="' + hair + '"/>' +
        '<circle cx="' + f1(x - 2.6) + '" cy="' + f1(y + 0.5) + '" r="1.2" fill="#1b2335"/><circle cx="' + f1(x + 2.6) + '" cy="' + f1(y + 0.5) + '" r="1.2" fill="#1b2335"/>';
      const limb = (a, b, w, col) => '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
      const o = boatOrigin();
      const pose = S.pose;
      if (pose === 'swim' || pose === 'float') {
        const x = S.sailor.x, y = S.sailor.y;
        const k = Math.sin(S.t * (pose === 'swim' ? 7 : 3));
        return limb([x - 6, y + 2], [x - 15, y - 3 - k * 5], 4.5, jk) + limb([x + 6, y + 2], [x + 15, y - 3 + k * 5], 4.5, jk) +
          '<ellipse cx="' + f1(x) + '" cy="' + f1(y + 4) + '" rx="10" ry="6" fill="' + vest + '" stroke="#1d2433" stroke-width="1.4"/>' + head(x, y - 6, 7.5) +
          '<ellipse cx="' + f1(x) + '" cy="' + f1(y + 7) + '" rx="16" ry="3" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>';
      }
      if (pose === 'board' || pose === 'lean' || pose === 'hull' || pose === 'climbing') {
        // feet on the board (or the hull edge), hands on the gunwale (or the board when turtled)
        let F, Hn, out;
        if (pose === 'hull') {
          F = toWorld(C.hw - 4, C.bottom - 2, S.a, o[0], o[1]);
          Hn = toWorld(0, C.bottom + C.board * 0.75, S.a, o[0], o[1]);
          out = [1, 0];
        } else {
          F = toWorld(0, C.bottom + 16, S.a, o[0], o[1]);
          Hn = toWorld(C.hw * 0.85, C.top, S.a, o[0], o[1]);
          const tip = toWorld(0, C.bottom + 40, S.a, o[0], o[1]);
          out = [tip[0] - F[0], tip[1] - F[1]]; const l = Math.hypot(out[0], out[1]) || 1; out = [out[0] / l, out[1] / l];
        }
        if (pose === 'climbing') { const k = U.clamp(S.climbK, 0, 1); F = [U.lerp(S.sailor.x, F[0], k), U.lerp(S.sailor.y + 8, F[1], k)]; }
        const L = pose === 'board' || pose === 'climbing' ? 0.1 : S.L;
        const sx = out[0] >= 0 ? 1 : -1, lean = [sx * 0.8, -0.6]; // leaning back = up and away from the hull
        let d = [U.lerp(0, lean[0], 0.25 + L * 0.75), U.lerp(-1, lean[1], 0.25 + L * 0.75)];
        const dl = Math.hypot(d[0], d[1]) || 1; d = [d[0] / dl, d[1] / dl];
        const hip = [F[0] + d[0] * 16, F[1] + d[1] * 16], sh = [F[0] + d[0] * 33, F[1] + d[1] * 33], hd = [F[0] + d[0] * 42, F[1] + d[1] * 42];
        const knee = [F[0] + d[0] * 8 + d[1] * 4, F[1] + d[1] * 8 - d[0] * 4];
        const toHand = [Hn[0] - sh[0], Hn[1] - sh[1]], hl = Math.hypot(toHand[0], toHand[1]) || 1;
        const hand = [sh[0] + toHand[0] / hl * Math.min(hl, 22), sh[1] + toHand[1] / hl * Math.min(hl, 22)];
        return '<path d="M' + f1(hand[0]) + ' ' + f1(hand[1]) + 'L' + f1(Hn[0]) + ' ' + f1(Hn[1]) + '" stroke="#e8d9b0" stroke-width="2" stroke-dasharray="3 2"/>' + // righting line
          limb(F, knee, 6, '#1d2433') + limb(knee, hip, 6, '#1d2433') +
          limb(hip, sh, 12, jk) + '<path d="M' + f1(hip[0]) + ' ' + f1(hip[1]) + 'L' + f1(sh[0]) + ' ' + f1(sh[1]) + '" stroke="' + vest + '" stroke-width="9" stroke-linecap="round" opacity=".95"/>' +
          limb(sh, hand, 4.5, jk) + head(hd[0], hd[1], 7.5);
      }
      if (pose === 'hang' || pose === 'scramble') {
        const g = toWorld(C.hw - 2, C.top, S.a, o[0], o[1]);
        const k = pose === 'scramble' ? S.prog : 0;
        const inside = toWorld(C.hw * 0.25, C.top - 4, S.a, o[0], o[1]);
        const sh = [U.lerp(g[0] + 8, inside[0], k), U.lerp(g[1] + 12, inside[1] - 6, k)];
        const hip = [U.lerp(g[0] + 14, g[0] - 2, k), U.lerp(g[1] + 32, g[1] - 4, k)];
        const foot = [hip[0] + 6 + k * 10, hip[1] + 16 - k * 20];
        return limb(hip, foot, 6, '#1d2433') + limb(hip, sh, 12, jk) + '<path d="M' + f1(hip[0]) + ' ' + f1(hip[1]) + 'L' + f1(sh[0]) + ' ' + f1(sh[1]) + '" stroke="' + vest + '" stroke-width="9" stroke-linecap="round"/>' +
          limb(sh, [g[0] - 4, g[1] - 2], 4.5, jk) + head(sh[0] + (k > 0.5 ? -2 : 4), sh[1] - 9, 7.5);
      }
      // sitting in the boat (bail / drain / done)
      const seat = toWorld(C.hw * 0.55, C.top - 2, S.a, o[0], o[1]);
      const sh = [seat[0] - 2, seat[1] - 18];
      const bailing = S.phase === 'bail';
      const arm = bailing ? [sh[0] - 10 + Math.sin(S.pt * 9) * 8, sh[1] + 10 - Math.abs(Math.cos(S.pt * 9)) * 14] : [sh[0] - 12, sh[1] + 10];
      let h = limb(seat, [seat[0] + 10, seat[1] + 6], 6, '#1d2433') + limb(seat, sh, 12, jk) +
        '<path d="M' + f1(seat[0]) + ' ' + f1(seat[1]) + 'L' + f1(sh[0]) + ' ' + f1(sh[1]) + '" stroke="' + vest + '" stroke-width="9" stroke-linecap="round"/>' +
        limb(sh, arm, 4.5, jk) + head(sh[0], sh[1] - 9, 7.5);
      if (bailing) h += '<path d="M' + f1(arm[0] - 6) + ' ' + f1(arm[1] - 2) + ' h12 l-2 7 h-8z" fill="#ffb547" stroke="#1d2433" stroke-width="1.2"/>';
      if (S.phase === 'done' || S.done) h += limb(sh, [sh[0] + 10, sh[1] - 16 - Math.abs(Math.sin(S.t * 6)) * 4], 4.5, jk); // waving
      return h;
    }

    // ---- particles
    function splash(x, y, n, power) {
      n = n || 12; power = power || 1;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 2.2;
        const v = (60 + rng() * 120) * power;
        S.drops.push({ x: x + (rng() - 0.5) * 10, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.5 + rng() * 3, life: 0.6 + rng() * 0.5 });
      }
      S.rings.push({ x, y: Y + 2, r: 4, life: 1 });
    }
    function stepParticles(dt) {
      for (const d of S.drops) { d.vy += 380 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; if (d.y > Y + 4 && d.vy > 0) d.life = 0; }
      S.drops = S.drops.filter(d => d.life > 0);
      for (const r of S.rings) { r.r += 30 * dt; r.life -= dt * 0.9; }
      S.rings = S.rings.filter(r => r.life > 0);
      if (S.fish) { const f = S.fish; f.t += dt; if (f.t > 1.1) { splash(f.x + 60, Y, 6, 0.5); S.fish = null; } }
      S.duck.x += dt * 9; if (S.duck.x > 700) S.duck.x = -300;
      if (S.gull) { S.gull.x += dt * 120; if (S.gull.x > vb.x + vb.w + 60) S.gull = null; }
    }
    function fxSvg() {
      let h = '';
      for (const r of S.rings) h += '<ellipse cx="' + f1(r.x) + '" cy="' + f1(r.y) + '" rx="' + f1(r.r * 1.6) + '" ry="' + f1(r.r * 0.35) + '" fill="none" stroke="rgba(255,255,255,' + (r.life * 0.6).toFixed(2) + ')" stroke-width="1.6"/>';
      for (const d of S.drops) h += '<circle cx="' + f1(d.x) + '" cy="' + f1(d.y) + '" r="' + f1(d.r) + '" fill="#d8f1ff" opacity="' + Math.min(1, d.life * 2).toFixed(2) + '"/>';
      if (S.fish) {
        const f = S.fish, k = f.t / 1.1, x = f.x + k * 60, y = Y - Math.sin(k * Math.PI) * 46, rot = -60 + k * 120;
        h += '<g transform="translate(' + f1(x) + ' ' + f1(y) + ') rotate(' + f1(rot) + ')"><ellipse rx="9" ry="4" fill="#9fb8c9" stroke="#3b5368"/><path d="M-8 0 l-6 -5 v10z" fill="#9fb8c9" stroke="#3b5368"/><circle cx="5" cy="-1" r="1" fill="#1b2335"/></g>';
      }
      const dx = S.duck.x, dy = Y + 30 + Math.sin(S.t * 2) * 2;
      h += '<g transform="translate(' + f1(dx) + ' ' + f1(dy) + ')"><ellipse cx="0" cy="0" rx="9" ry="6" fill="#ffd25e" stroke="#7a5a10" stroke-width="1"/><circle cx="6" cy="-6" r="4.5" fill="#ffd25e" stroke="#7a5a10" stroke-width="1"/><path d="M10 -6 l5 1 l-5 2z" fill="#ff7a3d"/><circle cx="7" cy="-7" r=".9" fill="#1b2335"/></g>';
      if (S.gull) h += '<path transform="translate(' + f1(S.gull.x) + ' ' + f1(S.gull.y + Math.sin(S.t * 5) * 4) + ')" d="M-14 0 Q-7 -' + f1(6 + Math.sin(S.t * 12) * 4) + ' 0 0 Q7 -' + f1(6 + Math.sin(S.t * 12) * 4) + ' 14 0" fill="none" stroke="#f4f6fb" stroke-width="2.6" stroke-linecap="round"/>';
      return h;
    }
    function wavePath(fill) {
      const x0 = vb.x - 20, x1 = vb.x + vb.w + 20, st = Math.max(8, (x1 - x0) / 60);
      let d = '';
      for (let x = x0; x <= x1 + st; x += st) {
        const y = Y + 3 + 2.6 * Math.sin(x * 0.045 + S.t * 2.1) + 1.6 * Math.sin(x * 0.11 - S.t * 1.4);
        d += (d ? 'L' : 'M') + f1(x) + ' ' + f1(y);
      }
      return fill ? d + 'L' + f1(x1 + st) + ' ' + f1(vb.y + vb.h + 50) + 'L' + f1(x0) + ' ' + f1(vb.y + vb.h + 50) + 'Z' : d;
    }
    function floatText(wx, wy, text, kind) {
      const m = svg.getScreenCTM(); const lr = floats.getBoundingClientRect(); if (!m) return;
      const n = document.createElement('div');
      n.className = 'capsize-float capsize-float-' + (kind || 'good');
      n.textContent = text;
      n.style.left = (m.a * wx + m.c * wy + m.e - lr.left) + 'px';
      n.style.top = (m.b * wx + m.d * wy + m.f - lr.top) + 'px';
      floats.appendChild(n);
      n.addEventListener('animationend', () => n.remove());
    }
    function mistake(key, coachKey) {
      S.mistakes++; elM.textContent = S.mistakes;
      const st = root_.querySelector('.cp-stat-m'); st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump');
      if (key) floatText(S.sailor.x, S.sailor.y - 30, t('capsize.fx.' + key), 'bad');
      if (coachKey) tip(coachKey);
      if (!S.gull) { S.gull = { x: vb.x - 40, y: vb.y + vb.h * 0.18 }; sfx('gull', { vol: 0.5 }); }
    }
    function tip(key) { if (S.tips[key]) return; S.tips[key] = true; KOS.UI.coach(t('capsize.coach.' + key), { ms: 4200, pos: 'top' }); }

    // ---- phases
    function setPhase(i) {
      S.pi = i; S.phase = C.phases[i] || 'done'; S.pt = 0; S.prog = 0; S.hold = false;
      const p = S.phase;
      if (p === 'swim') { S.pose = 'swim'; S.swimK = 0; }
      if (p === 'climb') { S.pose = 'float'; S.phi = 0; S.climbK = -1; const o = boatOrigin(); S.sailor = { x: o[0] + C.bottom + 34, y: Y + 6 }; }
      if (p === 'climbHull') { S.pose = 'swim'; const o = boatOrigin(); S.sailor = { x: o[0] + C.hw + 26, y: Y + 6 }; }
      if (p === 'unturtle') { S.pose = 'hull'; S.L = 0; S.w = 0; }
      if (p === 'lean') { S.pose = 'lean'; S.L = 0; S.w = 0; S.released = false; S.releaseA = null; }
      if (p === 'scramble') { S.pose = 'hang'; }
      if (p === 'bail' || p === 'drain') { S.pose = 'sit'; S.water = Math.max(S.water, 0.85); }
      if (p === 'done') finishAll();
      renderSteps(); renderPanel();
    }
    function nextPhase() { setPhase(S.pi + 1); }
    const PHASE_ICON = { swim: 'life', sheet: 'hand', crew: 'user', climb: 'timer', climbHull: 'hand', unturtle: 'hand', lean: 'hand', scramble: 'hand', bail: 'trash', drain: 'sail' };
    function renderSteps() {
      elSteps.innerHTML = C.phases.filter(p => p.indexOf('capsize') !== 0).map((p, i) => {
        const idx = C.phases.indexOf(p);
        return '<i class="' + (idx < S.pi ? 'done' : idx === S.pi ? 'cur' : '') + '">' + (idx < S.pi ? '✓' : i + 1) + '</i>';
      }).join('');
    }
    function renderPanel() {
      const p = S.phase;
      elText.textContent = t('capsize.step.' + p);
      elText.classList.remove('pop'); void elText.offsetWidth; elText.classList.add('pop');
      const waiting = p.indexOf('capsize') === 0 || p === 'done';
      btn.disabled = waiting;
      elBtnTxt.textContent = waiting ? t('capsize.btn.wait') : t('capsize.btn.' + p);
      elBtnIco.innerHTML = KOS.UI.iconSvg(PHASE_ICON[p] || 'life');
      btn.classList.toggle('is-hold', p === 'lean' || p === 'unturtle' || p === 'drain');
      let m = '';
      if (p === 'swim' || p === 'climbHull' || p === 'scramble' || p === 'bail') {
        const n = N[p];
        m = '<div class="cp-mash">' + Array.from({ length: n }, (_, i) => '<i data-i="' + i + '"></i>').join('') + '</div>';
      } else if (p === 'climb') {
        m = '<div class="cp-timing"><div class="cp-zone" style="left:' + ((0.5 - zoneW / 2) * 100).toFixed(1) + '%;width:' + (zoneW * 100).toFixed(1) + '%"></div><i class="cp-needle"></i></div>';
      } else if (p === 'lean' || p === 'unturtle') {
        m = '<div class="cp-lean"><svg viewBox="0 0 120 66" class="cp-gauge"><path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="10"/>' +
          (p === 'lean' ? '<path class="cp-gzone" fill="none" stroke="#3ee08f" stroke-width="10"/>' : '') +
          '<line class="cp-gneedle" x1="60" y1="60" x2="60" y2="14" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="60" cy="60" r="5" fill="#fff"/>' +
          '<text x="60" y="66" font-size="7" text-anchor="middle" fill="rgba(255,255,255,.7)" font-weight="800">' + esc(t('capsize.gauge.mast')) + '</text></svg>' +
          '<div class="cp-leanbar"><i></i></div></div>';
      } else if (p === 'drain') {
        m = '<div class="cp-water"><span>' + esc(t('capsize.gauge.water')) + '</span><div><i></i></div></div>';
      }
      elMeter.innerHTML = m;
      if (p === 'lean') {
        // release zone on the gauge: mast elevation 40°..72° from horizontal ↔ boat angle -50..-18
        const z = elMeter.querySelector('.cp-gzone');
        const lo = relZone()[0], hi = relZone()[1];
        const ang = a => Math.PI - (90 + a) / 90 * (Math.PI / 2); // a=-90 → π (left), a=0 → π/2 (up)
        const pt = a => [60 + 50 * Math.cos(ang(a)), 60 - 50 * Math.sin(ang(a))];
        const p1 = pt(lo), p2 = pt(hi);
        if (z) z.setAttribute('d', 'M' + f1(p1[0]) + ' ' + f1(p1[1]) + ' A50 50 0 0 1 ' + f1(p2[0]) + ' ' + f1(p2[1]));
      }
    }
    function relZone() { return easy ? [-50, -10] : pro ? [-36, -18] : [-42, -14]; }

    // ---- input
    function press() {
      if (!S.running || S.done) return;
      const p = S.phase;
      S.hold = true;
      btn.classList.add('pressed');
      if (p === 'swim') {
        S.strokes++; S.prog = Math.min(1, S.prog + 1 / N.swim); sfx('splash', { vol: 0.35, pitch: 1.2 + rng() * 0.3 });
        splash(S.sailor.x + 12, Y + 2, 6, 0.6); markMash(S.prog * N.swim);
        if (rng() < 0.18 && !S.fish) S.fish = { x: S.sailor.x - 120 + rng() * 60, t: 0 };
        if (S.prog >= 0.999) { floatText(S.sailor.x, S.sailor.y - 30, t('capsize.fx.good'), 'good'); nextPhase(); }
      } else if (p === 'climbHull' || p === 'scramble' || p === 'bail') {
        S.prog = Math.min(1, S.prog + 1 / N[p]); markMash(S.prog * N[p]);
        if (p === 'bail') { S.water = Math.max(0, 0.85 * (1 - S.prog)); sfx('splash', { vol: 0.3, pitch: 1.5 }); const o = boatOrigin(); splash(o[0] - C.hw - 4, o[1] - 20, 8, 0.7); }
        else { sfx('rigClick', { pitch: 0.8 + S.prog * 0.5 }); S.a += p === 'scramble' ? 4 : 0; }
        if (S.prog >= 0.999) {
          if (p === 'climbHull') { S.pose = 'hull'; floatText(S.sailor.x, S.sailor.y - 40, t('capsize.fx.good'), 'good'); }
          if (p === 'scramble') { S.pose = 'sit'; sfx('cheer', { vol: 0.3 }); }
          if (p === 'bail') { const o = boatOrigin(); floatText(o[0], o[1] - 40, t('capsize.fx.dry'), 'good'); }
          nextPhase();
        }
      } else if (p === 'sheet') {
        S.sheetFree = true; sfx('zip'); const o = boatOrigin(); floatText(o[0], o[1] - 60, t('capsize.fx.free'), 'good'); tip('sheet'); nextPhase();
      } else if (p === 'crew') {
        S.crewIn = true; sfx('pop', { pitch: 0.9 }); const o = boatOrigin(); splash(o[0] - 20, Y, 8, 0.6); floatText(o[0], o[1] - 50, t('capsize.fx.scoop'), 'good'); nextPhase();
      } else if (p === 'climb') {
        if (S.climbK >= 0) return;
        if (Math.abs(S.needle - 0.5) <= zoneW / 2) {
          S.climbK = 0; S.pose = 'climbing'; sfx('rigClick', { pitch: 1.2 }); floatText(S.sailor.x, S.sailor.y - 30, t('capsize.fx.good'), 'good');
        } else {
          sfx('splash', { vol: 0.7 }); splash(S.sailor.x, Y, 18, 1.2); floatText(S.sailor.x + 10, S.sailor.y - 40, t('capsize.fx.splash'), 'splash');
          mistake('slip', 'climb');
        }
      }
    }
    function release() {
      S.hold = false; btn.classList.remove('pressed');
      if (S.phase === 'lean' && S.L > 0.3 && !S.released) {
        const z = relZone();
        if (S.a >= z[0] && S.a <= z[1]) { S.released = true; S.releaseA = S.a; const o = boatOrigin(); floatText(o[0], o[1] - 90, t('capsize.fx.perfect'), 'perfect'); sfx('coin', { pitch: 1.3 }); }
      }
    }
    function markMash(n) { elMeter.querySelectorAll('.cp-mash i').forEach((e, i) => e.classList.toggle('on', i < Math.round(n))); }

    const onBtnDown = e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } press(); };
    const onBtnUp = e => { e.preventDefault(); release(); };
    btn.addEventListener('pointerdown', onBtnDown);
    btn.addEventListener('pointerup', onBtnUp);
    btn.addEventListener('pointercancel', onBtnUp);
    btn.addEventListener('lostpointercapture', onBtnUp);
    btn.addEventListener('click', e => e.preventDefault());
    const onSvgDown = e => { e.preventDefault(); press(); };
    const onSvgUp = () => release();
    svg.addEventListener('pointerdown', onSvgDown);
    svg.addEventListener('pointerup', onSvgUp);
    svg.addEventListener('pointercancel', onSvgUp);
    const KEYS = { ' ': 1, Enter: 1, ArrowUp: 1, w: 1, W: 1, f: 1, F: 1 };
    const onKey = e => {
      if (!KEYS[e.key]) return;
      e.preventDefault();
      if (e.type === 'keydown') { if (!e.repeat) press(); } else release();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // ---- physics of the righting moment (degrees; a = 0 upright, -90 flat, -180 turtle)
    function leanPhysics(dt) {
      const holding = S.hold && !(easy && S.a > -26); // easy: auto let go
      if (easy && S.hold && S.a > -26 && !S.released) { S.released = true; S.releaseA = S.a; }
      S.L = holding ? Math.min(1, S.L + dt * 2.6) : Math.max(0, S.L - dt * 3.2);
      const e = 90 + S.a; // mast elevation above the water
      const suction = S.a < -72 ? 3.2 : 1.4;
      let acc = S.L * C.power * (S.crewIn ? 0.92 : 1);
      acc += -58 * Math.cos(Math.max(0, e) * D2R) * (S.a < -86 ? 0.25 : 1); // rig weight pulls it back down
      if (S.a > -30 && S.a <= 0) acc += 110 * (30 + S.a) / 30;              // form stability: it pops up
      if (S.a > -16 && holding) acc += S.L * C.power * (C.light ? 1.6 : 1.2);  // hanging on as it comes up…
      if (S.a > 0) acc -= (S.crewIn ? 16 : 10) * S.a + (holding ? 0 : 8 * S.a);
      acc -= suction * S.w;
      S.w += acc * dt; S.a += S.w * dt;
      if (S.a < -92) { S.a = -92; S.w = Math.max(0, S.w); }
      if (easy && S.a > 6) { S.a = 6; S.w = Math.min(S.w, 0); }
      // fell back down after letting go too early
      if (!holding && S.L < 0.05 && S.a < -60 && S.w < -5 && S.pt > 0.8 && S.fallT < 0) { S.fallT = 0; floatText(boatOrigin()[0], Y - 80, t('capsize.fx.early'), 'bad'); tip('early'); S.released = false; }
      if (S.a < -80) S.fallT = -1;
      // came over on top of you (normal/pro)
      if (S.a > 32) {
        S.a = -88; S.w = 0; S.L = 0; S.released = false; S.hold = false;
        sfx('crash', { vol: 0.6 }); sfx('splash'); splash(boatOrigin()[0] + 40, Y, 22, 1.4);
        floatText(boatOrigin()[0], Y - 70, t('capsize.fx.over'), 'splash');
        mistake('', 'over');
        setPhase(C.phases.indexOf('climb'));
        return;
      }
      if (Math.abs(S.a) < 6 && Math.abs(S.w) < 26 && S.L < 0.2 && S.pt > 0.6) {
        S.a = 0; S.w = 0;
        sfx('whoosh', { vol: 0.6 }); sfx('splash', { vol: 0.5 });
        const o = boatOrigin(); splash(o[0] - 60, Y, 16, 1); floatText(o[0], o[1] - 120, t('capsize.fx.up'), 'perfect');
        S.water = 0.85;
        nextPhase();
      }
    }
    function unturtlePhysics(dt) {
      S.L = S.hold ? Math.min(1, S.L + dt * 2.2) : Math.max(0, S.L - dt * 3);
      let acc = S.L * 95 - (S.a > -170 ? 12 : 0);
      acc -= (S.a < -135 ? 4.2 : 2.2) * S.w;
      S.w += acc * dt; S.a += S.w * dt;
      if (S.a < -180) { S.a = -180; S.w = Math.max(0, S.w); }
      if (S.a > -92) {
        S.a = -90; S.w = 0; S.L = 0;
        sfx('splash', { vol: 0.6 }); const o = boatOrigin(); splash(o[0] - 80, Y, 12, 0.8); floatText(o[0], o[1] - 60, t('capsize.fx.flat'), 'good');
        nextPhase();
      }
    }

    // ---- results
    function refTime() {
      let r = 0;
      C.phases.forEach(p => {
        r += { capsize: 2.2, capsizeTurtle: 3.2, swim: N.swim * 0.35, climbHull: N.climbHull * 0.35, sheet: 1.2, crew: 1.2, climb: period * 1.2, unturtle: 3.5, lean: 3, scramble: N.scramble * 0.3, bail: N.bail * 0.3, drain: 3 }[p] || 1;
      });
      return r;
    }
    function finishAll() {
      S.done = true; S.pose = 'sit';
      const ref = refTime() * (easy ? 2.0 : pro ? 1.35 : 1.6);
      const m = S.mistakes;
      let stars = m === 0 && S.time <= ref ? 3 : m <= (easy ? 4 : 2) ? 2 : 1;
      if (pro && S.time > ref * 2) stars = Math.min(stars, 1);
      S.result = {
        stars, score: Math.max(100, Math.round(2000 - m * 150 - S.time * 12)), timeMs: Math.round(S.time * 1000), success: true,
        stats: { 'capsize.stat.mistakes': m, 'capsize.stat.strokes': S.strokes },
        msgKey: 'capsize.res.msg', msgVars: { boat: cls.name, time: KOS.UI.fmtTime(S.time * 1000), m },
      };
      try { KOS.Storage.award('capsize-recovery'); } catch (e) { /* optional */ }
      if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* ignore */ } sfx('win'); } else sfx('cheer', { vol: 0.5 });
      S.finishT = 2.2;
      elMeter.innerHTML = KOS.UI.stars(stars);
      btn.disabled = true;
    }

    // ---- view box: fit the action into the area between the top bar and the panel
    function fit() {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const topIn = top_.getBoundingClientRect().bottom - r.top + 6;
      const pr = panel.getBoundingClientRect();
      const side = pr.left > r.left + r.width * 0.4; // landscape phones: the panel sits on the right
      const botIn = side ? 6 : r.bottom - pr.top + 6;
      const rightIn = side ? r.right - pr.left + 6 : 0;
      const avail = Math.max(120, r.height - topIn - botIn), availW = r.width - rightIn;
      // the action box: mast lying flat to the left, board + swimmer to the right, mast tip above when upright
      const bx0 = 200 - C.mast - 34, bx1 = 200 + C.bottom + C.board + 44;
      const boxW = bx1 - bx0, boxH = C.mast + 110;
      const s = Math.min(availW / boxW, avail / boxH, 3.2);
      const w = r.width / s, h = r.height / s;
      const cy0 = Y - C.mast - 50; // top of the box
      const spare = avail / s - boxH; // extra height (portrait phones): keep the waterline a bit above the middle
      vb = { x: (bx0 + bx1) / 2 - (availW / 2) / s, y: cy0 - topIn / s - spare * 0.42, w, h, s, pw: r.width, ph: r.height };
      svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map(f1).join(' '));
    }

    // ---- instance
    let resizeT = 0;
    return {
      start() {
        fit();
        setPhase(0);
        S.running = true;
        KOS.UI.coach(t(boatId === '29er' ? 'capsize.coach.turtle' : 'capsize.coach.intro'), { ms: 4500, pos: 'top' });
      },
      update(dt) {
        S.t += dt; S.pt += dt;
        if (!S.done) S.time += dt;
        stepParticles(dt);
        const p = S.phase;
        const o = boatOrigin();
        if (p === 'capsize' || p === 'capsizeTurtle') {
          const T = p === 'capsize' ? 2.2 : 3.2, target = p === 'capsize' ? -90 : -180;
          const k = U.clamp(S.pt / (T * 0.75), 0, 1);
          const ease = k < 1 ? k * k * (3 - 2 * k) : 1;
          S.a = target * (k < 0.25 ? k * k * 4 * 0.12 : 0.03 + 0.97 * ease);
          // sailor tumbles out of the boat into the water
          if (S.pt < 0.9) { S.pose = 'sit'; }
          else {
            if (S.pose !== 'swim') { S.pose = 'swim'; sfx('splash'); splash(o[0] - 60, Y, 24, 1.4); floatText(o[0] - 50, Y - 50, t('capsize.fx.splash'), 'splash'); S.sailor = { x: o[0] - 62, y: Y + 6 }; }
            if (p === 'capsizeTurtle' && S.pt > 2.2 && !S.tips.tt) { S.tips.tt = true; floatText(o[0], Y - 70, t('capsize.turtle'), 'splash'); sfx('whistle', { vol: 0.5 }); }
          }
          if (S.pt >= T) nextPhase();
        } else if (p === 'swim') {
          if (pro && S.prog > 0) S.prog = Math.max(0, S.prog - dt * 0.03);
          S.swimK = U.lerp(S.swimK, S.prog, 1 - Math.exp(-dt * 8));
          // around the stern: from the deck side (left) to the board side (right), closer to the viewer
          const k = S.swimK;
          S.sailor = { x: o[0] - 62 + k * (C.bottom + 34 + 62), y: Y + 6 + Math.sin(k * Math.PI) * 26 };
          if (S.auto && (S.autoT += dt) > 0.12) { S.autoT = 0; press(); release(); }
        } else if (p === 'climb') {
          S.phi += dt * Math.PI * 2 / period;
          S.needle = (Math.sin(S.phi) + 1) / 2;
          if (S.climbK >= 0) { S.climbK += dt / 0.45; if (S.climbK >= 1) { S.pose = 'board'; S.climbK = -1; nextPhase(); } }
          if (S.auto && S.climbK < 0 && Math.abs(S.needle - 0.5) < zoneW * 0.3) press(), release();
        } else if (p === 'lean') {
          if (S.auto) { if (S.a < -30 && !S.released) S.hold = true; else if (S.hold) release(); }
          leanPhysics(dt);
        } else if (p === 'unturtle') {
          if (S.auto) S.hold = true;
          unturtlePhysics(dt);
        } else if (p === 'scramble' || p === 'climbHull' || p === 'bail' || p === 'sheet' || p === 'crew') {
          if (p === 'scramble' && S.a > 0.5) S.a -= dt * 20;
          if (S.auto && (S.autoT += dt) > 0.15) { S.autoT = 0; press(); release(); }
        }
        if ((p === 'bail' || p === 'drain' || p === 'done') && Math.abs(S.a) > 0.05) S.a *= Math.exp(-dt * 4);
        if (p === 'drain') {
          if (S.auto) S.hold = true;
          if (S.hold) { S.water = Math.max(0, S.water - dt * (easy ? 0.5 : 0.36)); S.sailX += dt * 26; if ((S.autoT += dt) > 0.25) { S.autoT = 0; splash(o[0] - C.hw - 6, Y, 3, 0.4); } }
          if (S.water <= 0.001) { floatText(o[0], o[1] - 60, t('capsize.fx.dry'), 'good'); sfx('coin'); nextPhase(); }
        } else if (p === 'done') {
          S.sailX += dt * 30;
        }
        if (S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      },
      render() {
        if ((resizeT -= 1) <= 0) { resizeT = 30; const r = svg.getBoundingClientRect(); if (Math.abs(r.width - (vb.pw || 0)) > 1 || Math.abs(r.height - (vb.ph || 0)) > 1) fit(); }
        const o = boatOrigin();
        G.boat.setAttribute('transform', 'translate(' + f1(o[0]) + ' ' + f1(o[1]) + ') rotate(' + f1(S.a) + ')');
        G.boat.innerHTML = boatSvg();
        G.sailor.innerHTML = sailorSvg();
        G.front.setAttribute('d', wavePath(true));
        G.crest.setAttribute('d', wavePath(false));
        G.fx.innerHTML = fxSvg();
        // meters
        if (S.phase === 'climb') { const n = elMeter.querySelector('.cp-needle'); if (n) n.style.left = (S.needle * 100).toFixed(1) + '%'; }
        if (S.phase === 'lean' || S.phase === 'unturtle') {
          const n = elMeter.querySelector('.cp-gneedle');
          const ang = S.phase === 'lean' ? Math.PI - (90 + S.a) / 90 * (Math.PI / 2) : Math.PI - (180 + S.a) / 90 * (Math.PI / 2);
          if (n) { n.setAttribute('x2', f1(60 + 46 * Math.cos(ang))); n.setAttribute('y2', f1(60 - 46 * Math.sin(ang))); }
          const b = elMeter.querySelector('.cp-leanbar i'); if (b) b.style.transform = 'scaleX(' + S.L.toFixed(3) + ')';
          const z = relZone();
          elMeter.classList.toggle('in-zone', S.phase === 'lean' && S.a >= z[0] && S.a <= z[1]);
        }
        if (S.phase === 'drain') { const b = elMeter.querySelector('.cp-water i'); if (b) b.style.transform = 'scaleX(' + (S.water / 0.85).toFixed(3) + ')'; }
        const tt = KOS.UI.fmtTime(S.time * 1000); if (elTime.textContent !== tt) elTime.textContent = tt;
      },
      destroy() {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        root_.remove();
      },
      pause() { S.hold = false; btn.classList.remove('pressed'); },
      resume() {},
      onResize() { fit(); },
      setAutopilot(on) { S.auto = !!on; },
      skipIntro() { if (S.phase.indexOf('capsize') === 0) { S.pt = 9; } },
      debug: { S, C, press, release },
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
