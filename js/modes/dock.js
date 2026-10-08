// KØS SEJL — js/modes/dock.js
// The 'dock' mode: docking and undocking at the club pier (venue 'pier', hub area 'pier', "Molen").
// Sail (Optimist, Zest, H-boat) and the club RIB. Shape copied from js/modes/sail.js (see docs/MODE-AUTHORING.md).
//
// An activity is a list of STAGES (activity.params.stages), played one after the other:
//   {kind: 'dock',  at: {face, s, bow, gap}, neighbors: [...]}      alongside a jetty face (luff up, line ashore)
//   {kind: 'box',   at: {face, s}, neighbors: [...]}                bow first into a box berth between two poles
//   {kind: 'stern', at: {face, s}, neighbors: [...]}                RIB: reverse stern first into a slot
//   {kind: 'buoy',  buoy: {x, y}}                                   pick up a mooring buoy (bow to the buoy, head to wind)
//   {kind: 'slip'}                                                  RIB: bow to the slipway, the coach wades aboard
//   {kind: 'leave', at: {face, s, bow}, gate: {u, v}, neighbors}    undock: cast off, push off, back the sail, sail out
// Faces are the sides of the club jetties (KOS.World.global.jetties): 'A-R', 'A-L', 'A-T' (T-head), 'B-R', 'B-L', 'C-R', 'C-L'.
// `s` = metres along the face from the jetty root, `bow` = +1 bow pointing out along the jetty, −1 bow towards the shore.
// Wind: params.windRel (deg, relative to the first stage's target heading; 0 = head to wind in the berth) or windDeg.
// Scoring per stage: gentle touch (bump speed), alignment, time vs a polar-based reference, line timing bonus.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    dock: {
      you: 'DIG',
      hud: { dist: 'Afstand', stage: 'Opgave', line: 'Tov' },
      meter: { speed: 'Fart', dist: 'Afstand', slow: 'Fint tempo', fast: 'Lidt hurtigt', tooFast: 'For stærkt!', approach: 'Sejl derhen' },
      btn: {
        line: 'Kast tovet', hook: 'Tag bøjen', coach: 'Hop om bord!', now: 'NU!', castoff: 'Kast los', push: 'Skub fra!',
        back: 'Bak sejlet', backHold: 'Hold for at bakke', wait: 'Vent…',
      },
      wind: { n: 'nord', ne: 'nordøst', e: 'øst', se: 'sydøst', s: 'syd', sw: 'sydvest', w: 'vest', nw: 'nordvest' },
      intro: {
        dock: 'Vinden kommer fra {from}. Sejl ind på en skarp halvvind, og luf op mod vinden til sidst, så båden stopper lige ved broen. Kast så tovet i land!',
        dockRib: 'Kør stille og roligt ind langs pontonen. Brems med et lille nøk i bak, og kast tovet, når du ligger helt stille.',
        box: 'Ind i båsen mellem de to pæle! Kom ind med næsen først og meget lidt fart – stævnen må ikke banke ind i broen.',
        stern: 'Bak ind på pladsen mellem de to RIB\'er. Sæt gashåndtaget i bak, og husk: roret virker omvendt, når du bakker!',
        buoy: 'Sejl op til fortøjningsbøjen med næsen mod vinden. Stop med stævnen lige ved bøjen, og tag den med bådshagen.',
        slip: 'Træneren venter på slæbestedet! Kør næsen helt stille ind til hende, så hun kan vade om bord.',
        leave: 'Læg fra broen! Først kaster du los, så skubber du fra – og pas på bådene ved siden af.',
        leaveHead: 'Vinden kommer lige forfra. Kast los, skub fra, og bak sejlet, så stævnen drejer væk fra broen. Sejl så ud gennem porten.',
      },
      next: { dock: 'Godt! Sejl nu træneren ud til enden af Optibroen, og læg til langs siden.', any: 'Næste opgave!' },
      keys: 'Tastatur: ←/→ styr · ↑/↓ skøde · Enter eller Mellemrum = kast tovet',
      keysRib: 'Tastatur: ←/→ rat · ↑/↓ gas frem/bak · Enter eller Mellemrum = kast tovet',
      keysLeave: 'Tastatur: ←/→ styr · ↑/↓ skøde · Enter eller Mellemrum = næste trin (hold for at bakke)',
      tip: {
        tooFast: 'For stærkt! Luf op mod vinden, eller fier skødet, så bremser båden.',
        tooFastRib: 'For stærkt! Træk gashåndtaget tilbage – og giv et lille nøk i bak for at bremse.',
        tooFastHeavy: 'En H-båd er tung og glider længe. Begynd at bremse i god tid – luf op og fier skødet!',
        miss: 'Plask! Tovet nåede ikke i land. Kom tættere på, før du kaster.',
        missFast: 'Båden sejlede for stærkt – tovet blev revet ud af hånden. Stop først, kast så.',
        missAngle: 'Båden ligger skævt. Ret op, så den ligger pænt langs broen, før du kaster.',
        bump: 'Bump! Fenderne kan kun tage et lille stød. Kom ind langsommere.',
        crash: 'BONK! Det var hårdt. Prøv at bremse i god tid næste gang.',
        neighbor: 'Hov, pas på nabobåden! Den har ikke bedt om et kys.',
        ready: 'Nu ligger du godt – kast tovet!',
        irons: 'Båden er stoppet i vindøjet og driver baglæns. Kast tovet, mens du stadig er tæt på!',
        far: 'Du er kommet langt væk. Vend om, og prøv en ny indsejling.',
        reverse: 'Når du bakker, drejer båden den modsatte vej af roret. Små bevægelser!',
        castoff: 'Tryk "Kast los" for at tage tovet om bord.',
        push: 'Skub båden fri af broen – tryk "Skub fra!".',
        back: 'Vinden er lige forfra. Hold "Bak sejlet" nede: bommen skubbes ud mod vinden, og båden bakker, mens stævnen drejer væk.',
        sail: 'Nu fylder sejlet! Hal skødet ind, og sejl ud gennem porten.',
        gate: 'Sejl ud gennem porten mellem de orange flag.',
        perfect: 'Perfekt timing! Lige i det øjeblik båden stod stille.',
      },
      fx: {
        perfect: 'PERFEKT!', good: 'Fanget!', miss: 'Plask!', gentle: 'Blidt!', bump: 'Bump!', crash: 'BONK!|Ups!|Av av!|Klonk!|Hovsa!',
        tooFast: 'For stærkt!', castoff: 'Kast los!', push: 'Skub!', gate: 'Fri af havnen!', aboard: 'Velkommen om bord!', stage: 'Opgave klaret!',
      },
      res: {
        ok: 'Fortøjet! Hårdeste stød: {bump}. Tid: {time}.',
        leave: 'Fri af broen på {time} – {touch}.',
        noTouch: 'uden at røre noget', touches: '{n} berøringer',
      },
      stat: { bump: 'Hårdeste stød', align: 'Placering', perfect: 'Perfekte kast', misses: 'Kast i vandet', touches: 'Berøringer', stages: 'Opgaver' },
    },
  });
  KOS.I18n.add('en', {
    dock: {
      you: 'YOU',
      hud: { dist: 'Distance', stage: 'Task', line: 'Line' },
      meter: { speed: 'Speed', dist: 'Distance', slow: 'Nice and slow', fast: 'A bit fast', tooFast: 'Too fast!', approach: 'Head over there' },
      btn: {
        line: 'Throw the line', hook: 'Hook the buoy', coach: 'Hop aboard!', now: 'NOW!', castoff: 'Cast off', push: 'Push off!',
        back: 'Back the sail', backHold: 'Hold to go astern', wait: 'Wait…',
      },
      wind: { n: 'the north', ne: 'the north-east', e: 'the east', se: 'the south-east', s: 'the south', sw: 'the south-west', w: 'the west', nw: 'the north-west' },
      intro: {
        dock: 'The wind comes from {from}. Come in on a close reach and luff up into the wind at the end, so the boat stops right at the jetty. Then throw the line ashore!',
        dockRib: 'Drive in slowly alongside the pontoon. Brake with a little touch astern, and throw the line when you are lying still.',
        box: 'Into the box berth between the two poles! Come in bow first with very little speed – the bow must not bang into the jetty.',
        stern: 'Reverse into the slot between the two RIBs. Put the throttle astern and remember: steering works the other way round going backwards!',
        buoy: 'Sail up to the mooring buoy with the bow into the wind. Stop with the bow right at the buoy and grab it with the boat hook.',
        slip: 'The coach is waiting at the slipway! Bring the bow in really slowly so she can wade aboard.',
        leave: 'Leave the jetty! First cast off, then push off – and mind the boats next to you.',
        leaveHead: 'The wind is straight ahead. Cast off, push off and back the sail so the bow swings away from the jetty. Then sail out through the gate.',
      },
      next: { dock: 'Great! Now take the coach out to the end of the Opti jetty and come alongside.', any: 'Next task!' },
      keys: 'Keyboard: ←/→ steer · ↑/↓ sheet · Enter or Space = throw the line',
      keysRib: 'Keyboard: ←/→ wheel · ↑/↓ throttle ahead/astern · Enter or Space = throw the line',
      keysLeave: 'Keyboard: ←/→ steer · ↑/↓ sheet · Enter or Space = next step (hold to back)',
      tip: {
        tooFast: 'Too fast! Luff up into the wind or ease the sheet to slow down.',
        tooFastRib: 'Too fast! Pull the throttle back – and give a little touch astern to brake.',
        tooFastHeavy: 'An H-boat is heavy and carries its way for a long time. Start braking early – luff up and ease the sheet!',
        miss: 'Splash! The line did not reach the shore. Get closer before you throw.',
        missFast: 'The boat was going too fast – the line was ripped out of your hand. Stop first, then throw.',
        missAngle: 'The boat is lying crooked. Straighten up alongside the jetty before you throw.',
        bump: 'Bump! The fenders can only take a small knock. Come in slower.',
        crash: 'BONK! That was hard. Try braking earlier next time.',
        neighbor: 'Oops, mind the boat next door! It did not ask for a kiss.',
        ready: 'You are lying nicely – throw the line!',
        irons: 'The boat has stopped head to wind and is drifting backwards. Throw the line while you are still close!',
        far: 'You are a long way off. Turn round and try a new approach.',
        reverse: 'Going astern, the boat turns the opposite way to the helm. Small movements!',
        castoff: 'Tap "Cast off" to bring the line aboard.',
        push: 'Push the boat clear of the jetty – tap "Push off!".',
        back: 'The wind is straight ahead. Hold "Back the sail": the boom is pushed out against the wind and the boat goes astern while the bow swings away.',
        sail: 'The sail is filling! Sheet in and sail out through the gate.',
        gate: 'Sail out through the gate between the orange flags.',
        perfect: 'Perfect timing! Right at the moment the boat stood still.',
      },
      fx: {
        perfect: 'PERFECT!', good: 'Got it!', miss: 'Splash!', gentle: 'Gentle!', bump: 'Bump!', crash: 'BONK!|Oops!|Ouch!|Clonk!|Whoops!',
        tooFast: 'Too fast!', castoff: 'Cast off!', push: 'Push!', gate: 'Clear of the harbour!', aboard: 'Welcome aboard!', stage: 'Task done!',
      },
      res: {
        ok: 'Moored! Hardest knock: {bump}. Time: {time}.',
        leave: 'Clear of the jetty in {time} – {touch}.',
        noTouch: 'without touching anything', touches: '{n} touches',
      },
      stat: { bump: 'Hardest knock', align: 'Position', perfect: 'Perfect throws', misses: 'Throws in the water', touches: 'Touches', stages: 'Tasks' },
    },
  });

  // ======================================================================== 2. activities
  const BOAT_STARS = (KOS.App && KOS.App.BOAT_STARS) || { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90, rib: 20 };
  const acts = [
    { id: 'dock.opti.jetty', order: 10, boat: 'opti', icon: 'anchor', minutes: 3, difficulty: 1, unlock: null,
      title: { da: 'Læg til ved broen · Optimist', en: 'Dock at the jetty · Optimist' },
      desc: { da: 'Sejl ind på en skarp halvvind, luf op og stop blidt ved Optibroens ende. Kast tovet i land på det rigtige tidspunkt!', en: 'Come in on a close reach, luff up and stop gently at the end of the Opti jetty. Throw the line ashore at just the right moment!' },
      params: { windRel: 0, windKn: 6, gust: 0.15, seed: 3, stages: [{ kind: 'dock', at: { face: 'A-T', s: 4, bow: -1 } }] } },
    { id: 'dock.opti.leave', order: 20, boat: 'opti', icon: 'sail', minutes: 3, difficulty: 2, unlock: { after: 'dock.opti.jetty' },
      title: { da: 'Læg fra broen · Optimist', en: 'Leave the jetty · Optimist' },
      desc: { da: 'Kast los, skub fra og sejl ud mellem de to flag – uden at ramme Optierne ved siden af.', en: 'Cast off, push off and sail out between the two flags – without hitting the Optis next to you.' },
      params: { windRel: 70, windKn: 6, gust: 0.15, seed: 4,
        stages: [{ kind: 'leave', at: { face: 'B-L', s: 30, bow: 1 }, gate: { u: 10, v: 26 }, neighbors: [{ cls: 'opti', ds: 3.6 }, { cls: 'opti', ds: -3.6 }] }] } },
    { id: 'dock.opti.buoy', order: 30, boat: 'opti', icon: 'buoy', minutes: 3, difficulty: 2, unlock: { after: 'dock.opti.leave' },
      title: { da: 'Tag fortøjningsbøjen · Optimist', en: 'Pick up the mooring buoy · Optimist' },
      desc: { da: 'Sejl op til bøjen med næsen mod vinden og stop lige ved den. Grib den med bådshagen!', en: 'Sail up to the buoy with the bow into the wind and stop right next to it. Grab it with the boat hook!' },
      params: { windDeg: 270, windKn: 6, gust: 0.2, seed: 5, stages: [{ kind: 'buoy', buoy: { x: -30, y: -50 } }] } },
    { id: 'dock.zest.jetty', order: 40, boat: 'zest', icon: 'anchor', minutes: 3, difficulty: 2, unlock: { stars: BOAT_STARS.zest },
      title: { da: 'Langs Langbroen · Zest', en: 'Alongside the long jetty · Zest' },
      desc: { da: 'Læg Zesten til langs Langbroen mellem to andre både. Vinden kommer lidt skråt – find den rigtige vinkel.', en: 'Bring the Zest alongside the long jetty between two other boats. The wind is a little on the angle – find the right line.' },
      params: { windRel: 20, windKn: 8, gust: 0.25, seed: 6,
        stages: [{ kind: 'dock', at: { face: 'B-L', s: 32, bow: 1 }, neighbors: [{ cls: 'zest', ds: 6.2 }, { cls: 'feva', ds: -6.4 }] }] } },
    { id: 'dock.zest.box', order: 50, boat: 'zest', icon: 'anchor', minutes: 3, difficulty: 3, unlock: { after: 'dock.zest.jetty' },
      title: { da: 'Ind i båsen · Zest', en: 'Into the box berth · Zest' },
      desc: { da: 'Sejl næsen først ind mellem to pæle og stop, før stævnen rammer broen. Kast så tovet i land.', en: 'Sail bow first in between two poles and stop before the bow hits the jetty. Then throw the line ashore.' },
      params: { windRel: 55, windKn: 7, gust: 0.2, seed: 7,
        stages: [{ kind: 'box', at: { face: 'B-L', s: 50 }, neighbors: [{ cls: 'zest', ds: 2.6 }, { cls: 'zest', ds: -2.6 }] }] } },
    { id: 'dock.zest.leave', order: 55, boat: 'zest', icon: 'sail', minutes: 3, difficulty: 3, unlock: { after: 'dock.zest.box' },
      title: { da: 'Bak sejlet · Zest', en: 'Back the sail · Zest' },
      desc: { da: 'Vinden kommer lige forfra. Skub fra, bak sejlet, så stævnen drejer væk fra broen, og sejl ud gennem porten.', en: 'The wind is straight ahead. Push off, back the sail so the bow swings away from the jetty, and sail out through the gate.' },
      params: { windRel: 0, windKn: 7, gust: 0.15, seed: 8,
        stages: [{ kind: 'leave', at: { face: 'B-L', s: 32, bow: 1 }, gate: { u: 8, v: 24 }, neighbors: [{ cls: 'zest', ds: 4.6 }, { cls: 'feva', ds: -4.8 }] }] } },
    { id: 'dock.hboat.jetty', order: 60, boat: 'hboat', icon: 'anchor', minutes: 4, difficulty: 4, unlock: { stars: BOAT_STARS.hboat },
      title: { da: 'Tung båd til broen · H-båd', en: 'Heavy boat alongside · H-boat' },
      desc: { da: 'En H-båd vejer næsten 2 tons og glider langt. Begynd at bremse tidligt, og læg den blidt til ved Langbroen.', en: 'An H-boat weighs almost 2 tonnes and carries its way. Start braking early and bring her gently alongside the long jetty.' },
      params: { windRel: -15, windKn: 9, gust: 0.25, seed: 9,
        stages: [{ kind: 'dock', at: { face: 'B-L', s: 44, bow: 1 }, neighbors: [{ cls: 'hboat', ds: 10.4 }] }] } },
    { id: 'dock.hboat.buoy', order: 65, boat: 'hboat', icon: 'buoy', minutes: 4, difficulty: 4, unlock: { after: 'dock.hboat.jetty' },
      title: { da: 'Bøjen med H-båden', en: 'Mooring buoy · H-boat' },
      desc: { da: 'Tag fortøjningsbøjen med en tung kølbåd. Luf op i god tid – den stopper ikke af sig selv!', en: 'Pick up the mooring buoy in a heavy keelboat. Luff up in good time – she will not stop by herself!' },
      params: { windDeg: 30, windKn: 9, gust: 0.25, seed: 10, stages: [{ kind: 'buoy', buoy: { x: -60, y: -40 } }] } },
    { id: 'dock.rib.pontoon', order: 70, boat: 'rib', icon: 'rib', minutes: 3, difficulty: 2, unlock: { stars: BOAT_STARS.rib },
      title: { da: 'Til pontonen · RIB', en: 'To the pontoon · RIB' },
      desc: { da: 'Læg klubbens orange RIB til langs RIB-pontonen mellem de andre følgebåde. Brems med bak!', en: 'Bring the club\'s orange RIB alongside the RIB pontoon between the other coach boats. Brake with reverse!' },
      params: { windDeg: 250, windKn: 8, gust: 0.2, seed: 11,
        stages: [{ kind: 'dock', at: { face: 'C-L', s: 22, bow: -1 }, neighbors: [{ cls: 'rib', ds: 7.4 }, { cls: 'rib', ds: -7.4 }] }] } },
    { id: 'dock.rib.reverse', order: 80, boat: 'rib', icon: 'rib', minutes: 3, difficulty: 3, unlock: { after: 'dock.rib.pontoon' },
      title: { da: 'Bak ind på pladsen · RIB', en: 'Reverse into the slot · RIB' },
      desc: { da: 'Bak RIB\'en ind mellem to andre både med agterenden mod pontonen. Roret virker omvendt, når du bakker!', en: 'Reverse the RIB in between two other boats, stern to the pontoon. The steering works the other way round going astern!' },
      params: { windDeg: 220, windKn: 7, gust: 0.15, seed: 12,
        stages: [{ kind: 'stern', at: { face: 'C-L', s: 22 }, neighbors: [{ cls: 'rib', ds: 3.4 }, { cls: 'rib', ds: -3.4 }] }] } },
    { id: 'dock.rib.coach', order: 90, boat: 'rib', icon: 'rib', minutes: 4, difficulty: 3, unlock: { after: 'dock.rib.reverse' },
      title: { da: 'Hent træneren · RIB', en: 'Pick up the coach · RIB' },
      desc: { da: 'Træneren venter på slæbestedet. Sæt næsen blidt ind til hende, og sejl hende så ud til Optibroen, hvor Optimisterne venter.', en: 'The coach is waiting at the slipway. Nose in gently to pick her up, then take her out to the Opti jetty where the Optimists are waiting.' },
      params: { windDeg: 290, windKn: 8, gust: 0.2, seed: 13,
        stages: [{ kind: 'slip' }, { kind: 'dock', at: { face: 'A-T', s: 10, bow: 1 }, neighbors: [] }] } },
  ];
  KOS.Activities.add(acts.map(a => Object.assign({ mode: 'dock', area: 'pier' }, a)));

  // ======================================================================== helpers (pure)
  const HULLS = ['#ffffff', '#e8323c', '#2b6cb0', '#ffd25e', '#18a957', '#f2f2f2', '#7a4fd0'];
  function vec(h, k) { k = k == null ? 1 : k; return { x: Math.sin(h) * k, y: -Math.cos(h) * k }; }
  function add(p, v, k) { k = k == null ? 1 : k; return { x: p.x + v.x * k, y: p.y + v.y * k }; }
  function windWord(dir) {
    const keys = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    let d = (dir / D2R) % 360; if (d < 0) d += 360;
    return t('dock.wind.' + keys[Math.round(d / 45) % 8]);
  }
  function easeOut(x) { return 1 - Math.pow(1 - U.clamp(x, 0, 1), 3); }

  // jetty faces from the shared world geometry: {p0, dir, n, len, hdg}
  function faceOf(id) {
    const J = (KOS.World.global && KOS.World.global.jetties) || [];
    const [jid, side] = id.split('-');
    const j = J.find(q => q.id === jid);
    if (!j) return null;
    const h = j.hdg * D2R, d = vec(h), nR = { x: Math.cos(h), y: Math.sin(h) };
    const root0 = { x: j.x, y: j.y };
    if (side === 'T') { // T-head outer face (Opti jetty)
      const c = add(root0, d, j.len);
      return { p0: add(add(c, d, 1.2), nR, -7), dir: nR, n: d, len: 14, hdg: h + Math.PI / 2, wid: 2.4 };
    }
    const sg = side === 'R' ? 1 : -1;
    return { p0: add(root0, nR, sg * j.wid / 2), dir: d, n: { x: nR.x * sg, y: nR.y * sg }, len: j.len + (j.gap || 0), hdg: h, wid: j.wid };
  }
  const facePt = (f, s, off) => ({ x: f.p0.x + f.dir.x * s + f.n.x * off, y: f.p0.y + f.dir.y * s + f.n.y * off });

  // ======================================================================== 3. the mode
  KOS.Modes.register('dock', { kind: 'sea', create(host, activity) { return createDock(host, activity); } });

  function createDock(host, activity) {
    const P = Object.assign({ windKn: 7, gust: 0.2, seed: 1, stages: [{ kind: 'dock', at: { face: 'A-T', s: 4, bow: -1 } }] }, activity.params || {});
    const assist = host.assist || 'easy';
    const venue = KOS.World.get('pier');
    const clsId = KOS.Boats.get(host.boat) ? host.boat : 'opti';
    const cls = KOS.Boats.get(clsId);
    const isRib = !!cls.motor;
    const L = cls.length, B = cls.beam;
    const heavy = cls.mass > 800 && !isRib;
    const profile = host.profile || {};
    const rand = U.rng((P.seed || 1) * 7919 + 17);
    const AK = assist === 'easy' ? 1.5 : assist === 'pro' ? 0.75 : 1;   // tolerance multiplier
    const VK = assist === 'easy' ? 1.35 : assist === 'pro' ? 0.85 : 1;  // speed-limit multiplier
    const vPerfect = (heavy ? 0.28 : isRib ? 0.3 : 0.33) * VK;
    const vOk = (heavy ? 0.5 : isRib ? 0.55 : 0.6) * VK;

    const S = {
      phase: 'intro', time: 0, stageT: 0, si: 0, finishT: -1, result: null, hudT: 0, ambT: 0,
      tips: {}, tipT: -99, maxBump: 0, bumps: 0, crashes: 0, touches: 0, perfects: 0, misses: 0,
      scores: [], aligns: [], rope: null, pull: null, push: null, backing: false, step: '',
      warnT: 0, fastT: 0, lastBumpT: -9, fenderHit: 0, gulls: [], coach: null, splats: [],
    };

    // ---- stages: resolve geometry now so the wind can be set relative to the first target
    const stages = P.stages.map(buildStage);
    const st0 = stages[0];
    const windDir = P.windDeg != null ? U.rad(P.windDeg) : U.wrapPi(st0.target.heading + U.rad(P.windRel || 0));
    const wind = KOS.Wind.create({ dir: windDir, speed: P.windKn, gust: P.gust, shift: 0.08, seed: P.seed,
      bounds: { x0: -320, y0: -340, x1: 280, y1: 260 } });
    for (let i = 0; i < 120; i++) wind.update(0.5);
    const env = { wind, venue, assist, t: 0 };
    stages.forEach(placeStart);

    // ---- the player's boat
    const boat = KOS.Physics.createBoat(clsId, {
      x: st0.start.x, y: st0.start.y, heading: st0.start.heading, speed: st0.start.speed, isPlayer: true,
      sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : (isRib ? 'KØS 2' : 'DEN 1'), name: profile.name || '',
      colors: profile.boatColor && !isRib ? { hull: profile.boatColor } : undefined,
    });
    let controls = KOS.Physics.controls();
    controls.autoTrim = assist !== 'pro';
    controls.autoHike = true;

    // ---- scene + camera proxy (frames boat and target together)
    const cam = { x: boat.x, y: boat.y, vx: 0, vy: 0, speed: 0, heading: 0, cls };
    const scene = new KOS.SailScene(host.canvas, { venue, wind, boats: [boat], marks: [], lines: [], showNoGo: false, showWindArrow: true, showTags: false, highlightPlayer: false });
    scene.follow(cam);
    scene.addOverlay(drawUnder);
    scene.addOverlay(drawScreen, { screen: true });
    let moored = [], poles = [];

    // ---- controls: sail or RIB layout. Our own big action button sits bottom-centre.
    const ctrl = KOS.Input.attach(host.layer, { layout: isRib ? 'rib' : 'sail', spinnaker: false, hike: false, autoTrim: controls.autoTrim, pauseButton: false, letFly: !isRib });
    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', 'timer'].concat(P.stages.length > 1 ? [{ id: 'stage', icon: 'anchor', labelKey: 'dock.hud.stage' }] : []));
    const ui = buildUi();

    const handlers = {
      'boat:ground': e => { if (e.boat === boat) onBump(e.speed || 0, e.x, e.y, e.type === 'shallow' ? 'shallow' : 'pier', null); },
      'boat:collide': e => {
        if (e.a !== boat && e.b !== boat) return;
        const other = e.a === boat ? e.b : e.a;
        onBump(e.speed || 0, e.x, e.y, e.type === 'boat' ? 'boat' : 'pole', other);
      },
      'boat:irons': e => { if (e.boat === boat && S.phase === 'go' && stage().kind !== 'leave' && distToTarget() < 3 * L + 4) tip('irons'); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);
    const offAction = ctrl.on('action', () => onAction(true));
    const onKey = e => {
      if (e.code !== 'Space' || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      e.preventDefault();
      if (host.isPaused && host.isPaused()) { S.keyHeld = false; return; }
      if (e.type === 'keydown') { if (!e.repeat) { S.keyHeld = true; onAction(true); } } else S.keyHeld = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // ==================================================================== stage geometry
    function buildStage(def) {
      const sg = Object.assign({ neighbors: [] }, def);
      const at = def.at || {};
      const f = at.face ? faceOf(at.face) : null;
      sg.face = f;
      const gap = 0.32;                               // fender gap between hull and jetty
      if (def.kind === 'dock' || def.kind === 'leave') {
        const bowS = at.bow == null ? 1 : at.bow;
        const h = U.wrapPi(f.hdg + (bowS < 0 ? Math.PI : 0));
        const c = facePt(f, at.s, B / 2 + gap);
        // which side of the boat faces the jetty: +1 = starboard
        const right = vec(h + Math.PI / 2);
        const side = (right.x * -f.n.x + right.y * -f.n.y) > 0 ? 1 : -1;
        sg.target = { x: c.x, y: c.y, heading: h, side, type: 'alongside' };
        sg.bowS = bowS;
        const cs = at.s + bowS * L * 0.28;           // bow-line cleat near the bow
        sg.cleat = facePt(f, cs, -0.45);
        sg.linePt = { lx: side * B * 0.42, ly: -L * 0.28 };
        sg.cleat2 = facePt(f, at.s - bowS * L * 0.3, -0.45);
        sg.linePt2 = { lx: side * B * 0.42, ly: L * 0.32 };
      } else if (def.kind === 'box' || def.kind === 'stern') {
        const stern = def.kind === 'stern';
        const h = U.wrapPi(Math.atan2(f.n.x, -f.n.y) + (stern ? 0 : Math.PI)); // box: bow to the jetty; stern: bow out
        const c = facePt(f, at.s, stern ? L / 2 + B * 0.4 + 0.15 : L / 2 + 0.55);
        sg.target = { x: c.x, y: c.y, heading: h, side: 0, type: stern ? 'stern' : 'box' };
        sg.cleat = facePt(f, at.s, -0.45);
        sg.linePt = { lx: 0, ly: stern ? L / 2 - 0.1 : -L / 2 + 0.1 };
        if (!stern) {
          const half = B / 2 + 0.5;
          sg.poles = [facePt(f, at.s - half, L + 0.9), facePt(f, at.s + half, L + 0.9)];
        }
      } else if (def.kind === 'buoy') {
        sg.buoy = { x: def.buoy.x, y: def.buoy.y, r: 0.38, id: 'mooring' };
        sg.target = { x: def.buoy.x, y: def.buoy.y, heading: 0, side: 0, type: 'buoy' }; // heading set from the wind later
      } else if (def.kind === 'slip') {
        const sl = venue.slip || { x: -64, y: 74, heading: -40 * D2R };
        const bowPt = add(sl, vec(sl.heading), 3.2);   // just off the end of the slipway ramp
        const h = U.wrapPi(sl.heading + Math.PI);
        const c = add(bowPt, vec(h), -L / 2);
        sg.target = { x: c.x, y: c.y, heading: h, side: 0, type: 'bow' };
        sg.bowPt = bowPt;
        sg.coachAt = add(sl, vec(sl.heading), 1.6);    // the coach waits at the very end of the ramp
      }
      // moored neighbours along the same face
      sg.moor = (def.neighbors || []).map((nb, i) => {
        const ncls = KOS.Boats.get(nb.cls) || cls;
        let pose;
        if (def.kind === 'box' || def.kind === 'stern') {
          const c = facePt(f, at.s + nb.ds * (def.kind === 'stern' ? 1 : 1), ncls.length / 2 + 0.55);
          pose = { x: c.x, y: c.y, heading: sg.target.heading };
        } else {
          const c = facePt(f, at.s + nb.ds * 1, ncls.beam / 2 + gap);
          pose = { x: c.x, y: c.y, heading: sg.target.heading };
        }
        return { cls: ncls.id, pose, color: HULLS[(i + (P.seed || 0)) % HULLS.length], i };
      });
      return sg;
    }

    // starting pose: on a close reach towards the berth from the open-water side (sail), or straight in (RIB)
    function placeStart(sg, idx) {
      const tg = sg.target, w = windDir;
      if (sg.kind === 'buoy') { tg.heading = w; const c = add(sg.buoy, vec(w), -(L / 2 + 0.45)); tg.x = c.x; tg.y = c.y; }
      if (sg.kind === 'leave') {
        sg.start = { x: tg.x, y: tg.y, heading: tg.heading, speed: 0 };
        const f = sg.face, g = sg.gate || { u: 10, v: 24 };
        const gc = add(add(tg, f.dir, g.u), f.n, g.v);
        const gh = Math.atan2(gc.x - tg.x, -(gc.y - tg.y));
        const across = vec(gh + Math.PI / 2), gw = 5 + L * 0.6;
        sg.gateLine = { c: gc, a: add(gc, across, -gw), b: add(gc, across, gw), w: gw };
        sg.ref = Math.hypot(gc.x - tg.x, gc.y - tg.y) / approachSpeed() + 16;
        return;
      }
      const D = (isRib ? 30 : 24) + 3.2 * L;
      const cands = [];
      const angs = isRib ? [0, 20, -20, 40, -40, 60, -60] : [62, -62, 75, -75, 90, -90, 50, -50];
      angs.forEach((a, ai) => {
        // RIB: come in along the berth heading (stern berth: drive past then reverse); sail: close reach off the wind
        const along = sg.face ? Math.atan2(sg.face.dir.x, -sg.face.dir.y) : 0;
        const H = tg.type === 'stern' ? U.wrapPi(along + (a >= 0 ? Math.PI : 0) + (Math.abs(a) > 30 ? Math.sign(a) * 0.3 : 0)) // drive past along the pontoon
          : isRib ? U.wrapPi(tg.heading + a * D2R) : U.wrapPi(w + a * D2R);
        const lead = tg.type === 'stern' ? add(tg, vec(tg.heading), L * 1.6) : tg;
        const sp = add(lead, vec(H), -D);
        let score = ai * 0.1;
        if (!okWater(sp, 4)) score += 100;
        if (!KOS.World.clearPath(venue, sp, add(lead, vec(H), -L * 0.8), 2)) score += 50;
        if (sg.face) { // start on the berth's side of the jetty
          const rel = (sp.x - tg.x) * sg.face.n.x + (sp.y - tg.y) * sg.face.n.y;
          if (rel < 2 && sg.kind !== 'slip') score += 30;
        }
        cands.push({ sp, H, score });
      });
      cands.sort((a, b) => a.score - b.score);
      const c = cands[0];
      sg.start = { x: c.sp.x, y: c.sp.y, heading: c.H, speed: isRib ? 0 : U.ms(cls.polar(Math.abs(U.wrapPi(w - c.H)), P.windKn)) * 0.45 };
      sg.approach = c.H;
      const prev = idx > 0 ? stages[idx - 1].target : null;
      const dist = prev ? Math.hypot(tg.x - prev.x, tg.y - prev.y) * 1.35 : D;
      sg.ref = dist / approachSpeed() + (tg.type === 'stern' ? 22 : 12) + (heavy ? 8 : 0);
      if (idx > 0) sg.start = null; // later stages continue from wherever the boat is
    }
    function approachSpeed() { return isRib ? U.ms(4.5) : U.ms(cls.polar(65 * D2R, P.windKn)) * 0.6; }
    function okWater(p, m) {
      if (KOS.World.isSolid(venue, p.x, p.y) || KOS.World.depthAt(venue, p.x, p.y) < (cls.draft || 0.8) + 0.3) return false;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; if (KOS.World.isSolid(venue, p.x + Math.cos(a) * m, p.y + Math.sin(a) * m)) return false; }
      return true;
    }

    function stage() { return stages[S.si]; }

    function setupStage(i, first) {
      S.si = i; S.stageT = 0; S.step = ''; S.rope = null; S.pull = null; S.push = null; S.backing = false; S.ready = false;
      S.stMaxBump = 0; S.stMisses = 0; S.stPerfect = false; S.lineQ = 0; S.stTouches = 0; S.inWarn = false; S.far = false;
      const sg = stages[i];
      // moored boats + poles for this stage (heavy so the player can't shove them)
      moored = sg.moor.map(m => {
        const b = KOS.Physics.createBoat(m.cls, { x: m.pose.x, y: m.pose.y, heading: m.pose.heading, sailNo: m.cls === 'rib' ? 'KØS ' + (m.i + 3) : 'DEN ' + (120 + m.i * 37 + (P.seed || 0)) });
        b.cls = Object.assign({}, b.cls, { mass: 1e6 });
        if (m.cls !== 'rib') b.colors = Object.assign({}, b.colors, { hull: m.color });
        b.twa = U.wrapPi(windDir - b.heading); b.tack = b.twa >= 0 ? 'starboard' : 'port';
        b.boom = -Math.sign(b.twa || 1) * 0.06; b.luffing = true; b.trim = 0.2; b.hike = 0; b.moored = true; b.pose = m.pose;
        return b;
      });
      poles = (sg.poles || []).map((p, k) => ({ x: p.x, y: p.y, r: 0.2, id: 'pole' + k }));
      scene.boats = [boat].concat(moored);
      if (first && sg.start) {
        boat.x = sg.start.x; boat.y = sg.start.y; boat.heading = sg.start.heading; boat.speed = sg.start.speed;
        const f = vec(boat.heading); boat.vx = f.x * boat.speed; boat.vy = f.y * boat.speed; boat.yawRate = 0;
      }
      if (sg.kind === 'leave') { S.step = 'castoff'; S.rope = { state: 'made', a: sg.linePt, b: sg.cleat, t: 1 }; S.rope2 = { state: 'made', a: sg.linePt2, b: sg.cleat2, t: 1 }; }
      else S.rope2 = null;
      if (sg.kind === 'slip') S.coach = { state: 'wait', x: sg.coachAt.x, y: sg.coachAt.y, t: 0 };
      paintAction(true);
    }

    // ==================================================================== ui (DOM)
    function buildUi() {
      const meter = document.createElement('div');
      meter.className = 'dock-meter';
      meter.innerHTML = '<div class="dm-head">' + KOS.UI.iconSvg('gauge') + '<span>' + KOS.UI.esc(t('dock.meter.speed')) + '</span><b class="dm-kn">0.0</b><small>' + KOS.UI.esc(t('common.kn')) + '</small></div>' +
        '<div class="dm-bar"><i class="dm-zone"></i><i class="dm-needle"></i></div>' +
        '<div class="dm-row"><span class="dm-state"></span><span class="dm-dist"></span></div>';
      host.layer.appendChild(meter);
      const warn = document.createElement('div');
      warn.className = 'dock-warn';
      warn.textContent = t('dock.meter.tooFast');
      host.layer.appendChild(warn);
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'dock-act is-far';
      act.innerHTML = '<svg class="da-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" class="da-track"/><circle cx="50" cy="50" r="45" class="da-prog"/></svg>' +
        '<span class="da-ico">' + ropeIcon() + '</span><b class="da-lbl"></b><small class="da-key">Enter</small>';
      host.layer.appendChild(act);
      const down = e => { e.preventDefault(); e.stopPropagation(); S.btnHeld = true; act.classList.add('is-down'); onAction(false); };
      const up = () => { S.btnHeld = false; act.classList.remove('is-down'); };
      act.addEventListener('pointerdown', down);
      act.addEventListener('pointerup', up);
      act.addEventListener('pointercancel', up);
      act.addEventListener('pointerleave', up);
      act.addEventListener('contextmenu', e => e.preventDefault());
      return { meter, warn, act, kn: meter.querySelector('.dm-kn'), needle: meter.querySelector('.dm-needle'), zone: meter.querySelector('.dm-zone'),
        state: meter.querySelector('.dm-state'), dist: meter.querySelector('.dm-dist'), lbl: act.querySelector('.da-lbl'), prog: act.querySelector('.da-prog') };
    }
    function ropeIcon() {
      return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><circle cx="18" cy="26" r="10"/><circle cx="18" cy="26" r="4.5"/><path d="M27 21c6-6 10-9 15-11"/><path d="M38 6l5 4-4 5"/></svg>';
    }
    function paintAction(force) {
      const sg = stage(); if (!sg) return;
      let key, cls2 = 'is-far', prog = 0;
      if (S.phase === 'done') { key = null; cls2 = 'is-hidden'; }
      else if (S.phase !== 'go' || S.pull || (S.rope && S.rope.state === 'fly')) { key = 'dock.btn.wait'; cls2 = 'is-wait'; }
      else if (sg.kind === 'leave') {
        if (S.step === 'castoff') { key = 'dock.btn.castoff'; cls2 = 'is-ready'; }
        else if (S.step === 'push') { key = 'dock.btn.push'; cls2 = 'is-ready'; }
        else if (S.step === 'back') { key = S.backing ? 'dock.btn.back' : 'dock.btn.backHold'; cls2 = S.backing ? 'is-perfect' : 'is-near'; }
        else { key = null; cls2 = 'is-hidden'; }
      } else {
        key = sg.kind === 'buoy' ? 'dock.btn.hook' : sg.kind === 'slip' ? 'dock.btn.coach' : 'dock.btn.line';
        const q = S.lineQ;
        cls2 = q >= 2 ? 'is-perfect' : q >= 1 ? 'is-ready' : S.near ? 'is-near' : 'is-far';
        if (q >= 2) key = 'dock.btn.now';
        prog = S.readyK || 0;
      }
      const sig = key + cls2 + Math.round(prog * 20);
      if (!force && sig === S.actSig) return;
      S.actSig = sig;
      ui.act.className = 'dock-act ' + cls2 + (isRib ? ' dock-act-rib' : '');
      ui.lbl.textContent = key ? t(key) : '';
      ui.act.querySelector('.da-ico').innerHTML = sg.kind === 'leave' && S.step === 'push' ? KOS.UI.iconSvg('hand') : sg.kind === 'leave' && S.step === 'back' ? KOS.UI.iconSvg('sail') : sg.kind === 'slip' ? KOS.UI.iconSvg('user') : ropeIcon();
      ui.prog.style.strokeDashoffset = String(283 * (1 - prog));
    }

    // ==================================================================== helpers
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function floatText(str, color, x, y, size) { if (scene.effects) scene.effects.text(x != null ? x : boat.x, y != null ? y : boat.y - 1.5, str, { color: color || '#fff', size: size || 22 }); }
    function tip(key, force) {
      if (S.tips[key] && !force) return;
      if (S.time - S.tipT < 4.5 && !force) return;
      S.tips[key] = true; S.tipT = S.time;
      KOS.UI.coach(t('dock.tip.' + key), { ms: 5200 });
    }
    function local(lx, ly, b) { b = b || boat; const f = vec(b.heading), r = vec(b.heading + Math.PI / 2); return { x: b.x + r.x * lx + f.x * ly * -1, y: b.y + r.y * lx + f.y * ly * -1 }; }
    function bowPt() { return local(0, -L / 2); }
    function sog() { return Math.hypot(boat.vx, boat.vy); }

    // errors relative to the stage target: {pos (m, weighted), ang (rad), d (centre distance)}
    function errors() {
      const sg = stage(), tg = sg.target;
      if (sg.kind === 'buoy') {
        const bp = bowPt(), d = Math.hypot(bp.x - sg.buoy.x, bp.y - sg.buoy.y);
        return { pos: Math.max(0, d - (B * 0.45 + sg.buoy.r + 0.15)), real: Math.max(0, d - sg.buoy.r), ang: 0, d: Math.hypot(boat.x - tg.x, boat.y - tg.y) };
      }
      if (sg.kind === 'slip') {
        const bp = bowPt(), d = Math.hypot(bp.x - sg.bowPt.x, bp.y - sg.bowPt.y);
        return { pos: d, ang: Math.abs(U.wrapPi(boat.heading - tg.heading)), d: Math.hypot(boat.x - tg.x, boat.y - tg.y) };
      }
      const dx = boat.x - tg.x, dy = boat.y - tg.y, f = vec(tg.heading), r = vec(tg.heading + Math.PI / 2);
      const lon = dx * f.x + dy * f.y, lat = dx * r.x + dy * r.y;
      const ang = Math.abs(U.wrapPi(boat.heading - tg.heading));
      if (sg.kind === 'dock' || sg.kind === 'leave') {
        // alongside: lengthwise spot matters; sideways only "close enough to throw" (you can't get closer than the fenders)
        const out = -tg.side * lat, tolGap = (0.55 + L * 0.04) * AK;
        return { pos: Math.max(Math.abs(lon), Math.max(0, out - 0.1) * tolPos() / tolGap), real: Math.hypot(lon, Math.max(0, out)), ang, d: Math.hypot(dx, dy), lon, lat };
      }
      return { pos: Math.hypot(lon, lat * 1.2), ang, d: Math.hypot(dx, dy), lon, lat };
    }
    function tolPos() { const k = stage().kind; return (k === 'buoy' ? 0.7 : k === 'slip' ? 0.9 : k === 'dock' ? 0.4 + L * 0.3 : 0.4 + L * 0.06) * AK; }
    function tolAng() { const k = stage().kind; return (k === 'slip' ? 22 : k === 'box' || k === 'stern' ? 9 : 13) * D2R * AK; }
    function distToTarget() {
      const sg = stage(); if (!sg) return 0;
      if (sg.kind === 'leave') return Math.hypot(boat.x - sg.gateLine.c.x, boat.y - sg.gateLine.c.y);
      return errors().d;
    }

    // ==================================================================== bumps
    function onBump(speed, x, y, what, other) {
      if (S.phase !== 'go' && S.phase !== 'moor') return;
      if (S.pull) return;
      const sp = Math.max(0, speed);
      const gentleK = assist === 'easy' ? 1.3 : assist === 'pro' ? 0.85 : 1;
      if (sp < 0.12 && what !== 'boat') return;     // resting against a fender is not a bump
      const repeat = S.time - S.lastBumpT < 1.0;    // grinding along the same thing counts once
      S.lastBumpT = S.time; S.fenderHit = 1;
      if (repeat && sp < 0.95) { S.maxBump = Math.max(S.maxBump, Math.min(sp, 0.38)); return; }
      S.maxBump = Math.max(S.maxBump, sp); S.stMaxBump = Math.max(S.stMaxBump, sp);
      const bx = x != null ? x : boat.x, by = y != null ? y : boat.y;
      if ((what === 'boat' || what === 'pole') && sp >= 0.12) { S.touches++; S.stTouches++; }
      if (sp > 0.95 / gentleK) {
        S.crashes++;
        sfx('crash', { vol: 0.9 }); sfx('splash', { vol: 0.7, pitch: 0.9 });
        scene.shake(0.8);
        if (scene.effects) { scene.effects.splash(bx, by, 1.6); scene.effects.ripple(bx, by, 3, 1.4); }
        const list = String(t('dock.fx.crash')).split('|');
        const word = list[Math.floor(rand() * list.length)];
        floatText(word, '#ff4d5e', bx, by - 1, 30);
        spawnGull(bx, by);
        S.splats.push({ x: bx, y: by, t: 0 });
        tip(what === 'boat' ? 'neighbor' : 'crash', !S.tips.crash && !S.tips.neighbor);
        KOS.Input.haptic && KOS.Input.haptic([30, 40, 30]);
      } else if (sp > 0.38 / gentleK) {
        S.bumps++;
        sfx('bump', { vol: 0.8 }); scene.shake(0.3);
        if (scene.effects) scene.effects.splash(bx, by, 0.6);
        floatText(t('dock.fx.bump'), '#ffb547', bx, by - 1);
        tip(what === 'boat' ? 'neighbor' : 'bump');
        KOS.Input.haptic && KOS.Input.haptic(25);
      } else {
        sfx('bump', { vol: 0.35, pitch: 1.4 });
        if (scene.effects) scene.effects.ripple(bx, by, 1, 0.8);
        if (what === 'boat') tip('neighbor');
      }
    }
    function spawnGull(x, y) {
      sfx('gull', { vol: 0.7, pitch: 1 + rand() * 0.3 });
      const a = rand() * TAU;
      S.gulls.push({ x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7 - 2, t: 0 });
    }

    // ==================================================================== action button / key
    function onAction(fromKey) {
      if (S.phase !== 'go') return;
      const sg = stage();
      if (sg.kind === 'leave') return leaveAction();
      if (S.pull || (S.rope && S.rope.state !== 'miss')) return;
      if (S.rope && S.rope.state === 'miss' && S.rope.t < 0.9) return;
      throwLine();
    }

    function throwLine() {
      const sg = stage(), e = errors(), v = sog();
      const tp = tolPos(), ta = tolAng();
      const perfect = e.pos <= tp && e.ang <= ta && v <= vPerfect;
      const ok = e.pos <= tp * 2 && e.ang <= ta * 2 && v <= vOk;
      const from = sg.linePt ? sg.linePt : { lx: 0, ly: -L / 2 };
      const to = sg.kind === 'buoy' ? sg.buoy : sg.kind === 'slip' ? sg.bowPt : sg.cleat;
      if (sg.kind === 'slip') {
        if (perfect || ok) return lineMade(perfect, e);
        sfx('whistle', { vol: 0.5 }); S.misses++; S.stMisses++;
        floatText(t('dock.fx.miss'), '#9fe7ff', sg.coachAt.x, sg.coachAt.y - 1.5);
        tip(v > vOk ? 'missFast' : 'miss', true);
        return;
      }
      sfx('rope', { vol: 0.8 }); sfx('whoosh', { vol: 0.35, pitch: 1.4 });
      if (perfect || ok) {
        S.rope = { state: 'fly', a: from, b: to, t: 0, perfect, e };
      } else {
        // the line falls short / is ripped away
        const pa = local(from.lx, from.ly);
        const dx = to.x - pa.x, dy = to.y - pa.y, d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(d * 0.85, 2.2 + L * 0.15);
        S.rope = { state: 'miss', a: from, b: { x: pa.x + dx / d * reach, y: pa.y + dy / d * reach }, t: 0 };
        S.misses++; S.stMisses++;
        tip(v > vOk ? 'missFast' : e.ang > ta * 2 ? 'missAngle' : 'miss', true);
      }
      paintAction(true);
    }

    function lineMade(perfect, e) {
      const sg = stage();
      S.stPerfect = perfect; if (perfect) S.perfects++;
      S.lineErr = e;
      sfx(perfect ? 'coin' : 'pop', { pitch: perfect ? 1.25 : 1 });
      if (perfect) { sfx('star', { vol: 0.7, pitch: 1.2 }); tip('perfect'); }
      const tg = sg.target;
      floatText(t(perfect ? 'dock.fx.perfect' : 'dock.fx.good'), perfect ? '#ffd25e' : '#7dffb5', tg.x, tg.y - 2, perfect ? 30 : 24);
      if (scene.effects) { scene.effects.stars(boat.x, boat.y, perfect ? 16 : 8); scene.effects.ripple(boat.x, boat.y, 2, 1); }
      KOS.Input.haptic && KOS.Input.haptic(perfect ? [15, 30, 15] : 18);
      S.pull = { t: 0, dur: sg.kind === 'slip' ? 2.2 : 1.3, x0: boat.x, y0: boat.y, h0: boat.heading };
      if (sg.kind === 'slip' && S.coach) { S.coach.state = 'walk'; S.coach.t = 0; S.coach.x0 = S.coach.x; S.coach.y0 = S.coach.y; }
      boat.vx = boat.vy = 0; boat.speed = 0; boat.slip = 0; boat.yawRate = 0;
      ctrl.setThrottle && isRib && ctrl.setThrottle(0);
      paintAction(true);
    }

    function leaveAction() {
      const sg = stage();
      if (S.step === 'castoff') {
        S.step = 'push';
        S.rope = { state: 'retract', a: sg.linePt, b: sg.cleat, t: 0 };
        if (S.rope2) S.rope2 = { state: 'retract', a: sg.linePt2, b: sg.cleat2, t: 0 };
        sfx('rope', { vol: 0.8 }); floatText(t('dock.fx.castoff'), '#ffd25e');
        S.pushTipT = 0.6; // sim-time, not setTimeout (pauses with the game)
      } else if (S.step === 'push') {
        S.step = needBack() ? 'back' : 'free';
        const n = sg.face.n;
        S.push = { vx: n.x * 1.0, vy: n.y * 1.0, yaw: -sg.target.side * 0.12, t: 0 };
        sfx('whoosh', { vol: 0.6 }); sfx('bump', { vol: 0.3, pitch: 1.5 });
        floatText(t('dock.fx.push'), '#9fe7ff');
        if (scene.effects) scene.effects.ripple(boat.x, boat.y, 2, 1);
        if (S.step === 'back') tip('back', true); else tip('sail', true);
      }
      paintAction(true);
    }
    function needBack() { return !isRib && Math.abs(U.wrapPi(windDir - boat.heading)) < cls.noGo + 15 * D2R; }

    // ==================================================================== per-step game logic
    function stepDock(dt) {
      const sg = stage();
      const e = errors(), v = sog();
      const tp = tolPos(), ta = tolAng();
      S.near = e.pos < tp * 4 + 1.5;
      const q = e.pos <= tp && e.ang <= ta && v <= vPerfect ? 2 : e.pos <= tp * 2 && e.ang <= ta * 2 && v <= vOk ? 1 : 0;
      if (q > 0 && S.lineQ === 0 && !S.ready) { S.ready = true; sfx('tap', { vol: 0.5, pitch: 1.6 }); if (assist !== 'pro') tip('ready'); }
      if (q === 0 && e.pos > tp * 4) S.ready = false;
      S.lineQ = q;
      S.readyK = q === 2 ? 1 : q === 1 ? 0.55 : U.clamp(1 - e.pos / (tp * 5 + 2), 0, 0.45);
      // easy: hold the perfect window a moment and the crew throws by themselves
      if (assist === 'easy' && q === 2 && !S.rope && !S.pull) { S.autoT = (S.autoT || 0) + dt; if (S.autoT > 1.6) { S.autoT = 0; throwLine(); } } else S.autoT = 0;
      // too fast near the berth
      const close = e.d < 2.5 * L + 7;
      const fast = close && v > vOk * 1.7 && sg.kind !== 'leave';
      if (fast) { S.fastT += dt; if (S.fastT > 0.35 && !S.inWarn) { S.inWarn = true; sfx('whistle', { vol: 0.45, pitch: 1.3 }); floatText(t('dock.fx.tooFast'), '#ff4d5e'); tip(isRib ? 'tooFastRib' : heavy ? 'tooFastHeavy' : 'tooFast'); } }
      else { S.fastT = 0; if (v < vOk * 1.3) S.inWarn = false; }
      if (isRib && v > 0.4 && boat.speed < -0.3 && sg.kind === 'stern' && e.d < 4 * L) tip('reverse');
      if (e.d > 75 && !S.far) { S.far = true; tip('far'); } else if (e.d < 50) S.far = false;
      // easy/normal assist: luffing head to wind near the berth brakes a bit harder (the crew pushes the boom out)
      const brake = assist === 'easy' ? 0.55 : assist === 'normal' ? 0.22 : 0;
      if (brake && !isRib && Math.abs(boat.twa) < cls.noGo + 0.15 && e.d < 3 * L + 8 && boat.speed > 0) { boat.speed *= 1 - brake * dt; syncV(); }
    }
    function syncV() { const f = vec(boat.heading), r = vec(boat.heading + Math.PI / 2); boat.vx = f.x * boat.speed + r.x * (boat.slip || 0); boat.vy = f.y * boat.speed + r.y * (boat.slip || 0); }

    function stepLeave(dt) {
      const sg = stage(), tg = sg.target;
      if (S.step === 'castoff' || S.step === 'push') holdPose(tg); // still tied up / about to push
      if (S.pushTipT > 0 && (S.pushTipT -= dt) <= 0 && S.step === 'push') tip('push');
      if (S.push) {
        S.push.t += dt;
        const k = Math.exp(-S.push.t * 1.4);
        boat.x += S.push.vx * k * dt; boat.y += S.push.vy * k * dt; boat.heading = U.wrapPi(boat.heading + S.push.yaw * k * dt);
        if (S.push.t > 4) S.push = null;
      }
      // back the sail: hold the action — sternway, and the bow swings away from the jetty
      const held = !!(S.btnHeld || S.keyHeld || ctrl.state.action);
      const near = Math.hypot(boat.x - tg.x, boat.y - tg.y) < 3 * L + 6;
      if (S.step === 'back' || S.step === 'free') {
        const can = needBack() && near;
        S.step = can ? 'back' : 'free';
        S.backing = can && held;
        if (S.backing) {
          boat.speed += (-0.55 - boat.speed) * Math.min(1, dt * 1.6);
          const away = -tg.side;                       // bow turns away from the jetty side
          boat.heading = U.wrapPi(boat.heading + away * 0.42 * dt);
          boat.yawRate = away * 0.42;
          syncV();
          boat.boom = U.clamp(-away * 1.15, -1.3, 1.3); boat.luffing = false; boat.trim = 0.9;
          if ((S.backSfx = (S.backSfx || 0) - dt) <= 0) { S.backSfx = 0.9; sfx('flap', { vol: 0.35 }); }
        }
        if (S.step === 'free' && !S.tips.sail && !near) tip('gate');
      }
      // through the gate?
      const gl = sg.gateLine;
      if (S.step === 'free' || S.step === 'back') {
        const d = Math.hypot(boat.x - gl.c.x, boat.y - gl.c.y);
        if (d < gl.w + 1) stageDone(null);
      }
    }
    function holdPose(p) {
      const bob = Math.sin(S.time * 1.7) * 0.03;
      boat.x = p.x + vec(p.heading + Math.PI / 2).x * bob; boat.y = p.y + vec(p.heading + Math.PI / 2).y * bob;
      boat.heading = p.heading; boat.speed = 0; boat.slip = 0; boat.vx = boat.vy = 0; boat.yawRate = 0;
    }

    function stepPull(dt) {
      const sg = stage(), tg = sg.target, p = S.pull;
      p.t += dt;
      const k = easeOut(p.t / (p.dur * 0.7));
      boat.x = U.lerp(p.x0, tg.x, k); boat.y = U.lerp(p.y0, tg.y, k);
      boat.heading = U.wrapPi(p.h0 + U.wrapPi(tg.heading - p.h0) * k);
      boat.vx = boat.vy = 0; boat.speed = 0;
      if (S.coach && S.coach.state === 'walk') {
        S.coach.t += dt;
        const ck = U.clamp(S.coach.t / 1.4, 0, 1);
        const bp = bowPt();
        S.coach.x = U.lerp(S.coach.x0, bp.x, ck); S.coach.y = U.lerp(S.coach.y0, bp.y, ck);
        if (ck >= 1) { S.coach.state = 'aboard'; sfx('pop', { pitch: 1.3 }); sfx('cheer', { vol: 0.35 }); floatText(t('dock.fx.aboard'), '#ffd25e', boat.x, boat.y - 1); }
      }
      if (p.t >= p.dur) { S.pull = null; stageDone(S.lineErr); }
    }

    function stageDone(e) {
      const sg = stage();
      const time = S.stageT;
      const gk = assist === 'easy' ? 1.35 : assist === 'pro' ? 0.85 : 1;
      const bumpPts = 40 * U.clamp(1 - (S.stMaxBump / gk - 0.25) / 1.0, 0, 1) - Math.min(15, S.stTouches * 4);
      const ratio = time / Math.max(12, sg.ref || 30);
      const timePts = 20 * U.clamp((2.3 - ratio) / 1.3, 0, 1);
      let score;
      if (sg.kind === 'leave') {
        score = U.clamp(bumpPts * 1.25 + timePts * 1.5 + (S.stTouches ? 0 : 20), 0, 100);
      } else {
        const tp = tolPos(), ta = tolAng();
        const alignPts = 30 * (1 - 0.5 * U.clamp(e.pos / (tp * 2), 0, 1) - 0.5 * U.clamp(e.ang / (ta * 2), 0, 1));
        const linePts = (S.stPerfect ? 10 : 5) - Math.min(10, S.stMisses * 3);
        score = U.clamp(bumpPts + alignPts + timePts + linePts, 0, 100);
        S.aligns.push(e);
      }
      S.scores.push(score);
      if (S.si + 1 < stages.length) {
        sfx('bell'); floatText(t('dock.fx.stage'), '#7dffb5', boat.x, boat.y + L * 0.6 + 2, 26);
        if (scene.effects) scene.effects.stars(boat.x, boat.y, 12);
        const next = S.si + 1;
        S.phase = 'between'; S.betweenT = 1.6; S.nextStage = next;
        return;
      }
      complete();
    }

    function complete() {
      S.phase = 'done'; S.finishT = 2.4;
      const avg = S.scores.reduce((a, b) => a + b, 0) / Math.max(1, S.scores.length);
      const th = assist === 'easy' ? [70, 45] : assist === 'pro' ? [86, 62] : [78, 55];
      const stars = avg >= th[0] ? 3 : avg >= th[1] ? 2 : 1;
      const timeStr = KOS.UI.fmtTime(S.time * 1000);
      const leave = stages.every(s => s.kind === 'leave');
      sfx(stars === 3 ? 'cheer' : 'win', { vol: 0.6 });
      if (scene.effects) { scene.effects.confetti(boat.x, boat.y, stars === 3 ? 160 : 70); scene.effects.text(boat.x, boat.y - 3, '★'.repeat(stars), { color: '#ffd25e', size: 36 }); }
      if (stars === 3) { try { KOS.UI.confetti(); } catch (e) { /* optional */ } }
      scene.shake(0.2);
      const bumpStr = S.maxBump < 0.12 ? '0' : S.maxBump.toFixed(1).replace('.', KOS.I18n.lang === 'da' ? ',' : '.') + ' m/s';
      const stats = {};
      stats['dock.stat.bump'] = S.maxBump < 0.12 ? (KOS.I18n.lang === 'da' ? 'Ingen' : 'None') : bumpStr;
      if (!leave) {
        const a = S.aligns[S.aligns.length - 1] || { pos: 0, ang: 0 };
        stats['dock.stat.align'] = Math.round((a.real != null ? a.real : a.pos) * 100) + ' cm · ' + Math.round(a.ang / D2R) + '°';
        stats['dock.stat.perfect'] = S.perfects + '/' + S.aligns.length;
        if (S.misses) stats['dock.stat.misses'] = S.misses;
      }
      stats['dock.stat.touches'] = S.touches + S.bumps + S.crashes;
      if (stages.length > 1) stats['dock.stat.stages'] = stages.length;
      const touches = S.touches + S.bumps + S.crashes;
      S.result = {
        stars, success: true, timeMs: Math.round(S.time * 1000), score: Math.round(avg * 10 + S.perfects * 150),
        stats, msgKey: leave ? 'dock.res.leave' : 'dock.res.ok',
        msgVars: { bump: S.maxBump < 0.12 ? (KOS.I18n.lang === 'da' ? 'ingen' : 'none') : bumpStr, time: timeStr,
          touch: touches ? t('dock.res.touches', { n: touches }) : t('dock.res.noTouch') },
      };
      if (stars === 3 && S.crashes === 0 && S.bumps === 0) { try { KOS.Storage && KOS.Storage.award && KOS.Storage.award('perfect-docking'); } catch (e) { /* optional */ } }
      paintAction(true);
    }

    // ==================================================================== drawing (world space)
    function drawUnder(ctx, sc) {
      const mpp = sc.mpp, tm = sc.t, sg = stage(); if (!sg) return;
      const lw = Math.max(0.05, 1.6 * mpp);
      // moored boats: lines + fenders
      for (const b of moored) {
        const nb = sg.moor[moored.indexOf(b)];
        if (sg.kind === 'dock' || sg.kind === 'leave') {
          const s0 = (nb.pose.x - sg.face.p0.x) * sg.face.dir.x + (nb.pose.y - sg.face.p0.y) * sg.face.dir.y;
          const side = sg.target.side, bl = b.cls.length;
          rope(ctx, local(side * b.cls.beam * 0.42, -bl * 0.3, b), facePt(sg.face, s0 + sg.bowS * bl * 0.45, -0.45), 0.3, mpp);
          rope(ctx, local(side * b.cls.beam * 0.42, bl * 0.32, b), facePt(sg.face, s0 - sg.bowS * bl * 0.45, -0.45), 0.3, mpp);
          if (b.classId !== 'rib') fenders(ctx, b, side, 0, mpp);
        } else {
          const s0 = (nb.pose.x - sg.face.p0.x) * sg.face.dir.x + (nb.pose.y - sg.face.p0.y) * sg.face.dir.y;
          const end = sg.kind === 'stern' ? b.cls.length / 2 : -b.cls.length / 2;
          rope(ctx, local(0, end, b), facePt(sg.face, s0, -0.45), 0.2, mpp);
        }
      }
      // cleats on the jetty
      if (sg.cleat && sg.kind !== 'leave') cleat(ctx, sg.cleat, S.lineQ, tm, mpp);
      if (sg.kind === 'leave') { cleat(ctx, sg.cleat, 0, tm, mpp); cleat(ctx, sg.cleat2, 0, tm, mpp); }
      // poles of the box berth
      for (const p of poles) pole(ctx, p, mpp);
      // the target outline + tolerance zones
      if (S.phase !== 'done' && S.phase !== 'between' && !S.pull && sg.kind !== 'leave') drawTarget(ctx, sg, tm, mpp, lw);
      if (sg.kind === 'buoy') mooringBuoy(ctx, sg.buoy, tm, mpp);
      if (sg.kind === 'leave') drawGate(ctx, sg.gateLine, tm, mpp, lw);
      if (sg.kind === 'slip' || (S.coach && S.coach.state !== 'aboard')) { if (S.coach) coachFig(ctx, S.coach, tm, mpp); }
      if (S.coach && S.coach.state === 'aboard') { const p = local(0, L * 0.05); coachFig(ctx, { x: p.x, y: p.y, state: 'aboard' }, tm, mpp); }
      // easy: ghost path showing the approach (come in, then turn up)
      if (assist === 'easy' && S.phase === 'go' && !S.pull && sg.kind !== 'leave' && sg.kind !== 'stern') ghostPath(ctx, sg, mpp, tm);
      if (assist === 'easy' && S.phase === 'go' && sg.kind === 'stern') ghostPath(ctx, sg, mpp, tm);
      // player's fenders and lines
      if (!isRib && (sg.kind === 'dock' || sg.kind === 'leave')) fenders(ctx, boat, sg.target.side, S.fenderHit, mpp);
      if (!isRib && sg.kind === 'box') fenders(ctx, boat, 0, S.fenderHit, mpp);
      if (S.rope) drawRope(ctx, S.rope, mpp);
      if (S.rope2) drawRope(ctx, S.rope2, mpp);
      // crash gulls + splats
      for (const g of S.gulls) gull(ctx, g, mpp);
    }

    function rope(ctx, a, b, sag, mpp) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(40,30,10,0.45)'; ctx.lineWidth = Math.max(0.07, 3 * mpp);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#f2e3b8'; ctx.lineWidth = Math.max(0.045, 1.8 * mpp);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
    }
    function drawRope(ctx, r, mpp) {
      const a = local(r.a.lx, r.a.ly);
      if (r.state === 'made') { rope(ctx, a, r.b, 0.25, mpp); return; }
      if (r.state === 'retract') {
        const k = easeOut(r.t / 0.6);
        const tip2 = { x: U.lerp(r.b.x, a.x, k), y: U.lerp(r.b.y, a.y, k) };
        if (k < 1) rope(ctx, a, tip2, 0.4 * (1 - k), mpp);
        return;
      }
      const dur = r.state === 'fly' ? 0.45 : 0.4;
      const k = U.clamp(r.t / dur, 0, 1);
      const tip2 = { x: U.lerp(a.x, r.b.x, easeOut(k)), y: U.lerp(a.y, r.b.y, easeOut(k)) };
      const hgt = Math.sin(k * Math.PI) * 1.4;
      if (r.state === 'miss' && k >= 1) { // floating in the water, then hauled back
        const back = U.clamp((r.t - 0.9) / 0.6, 0, 1);
        const fl = { x: U.lerp(r.b.x, a.x, back), y: U.lerp(r.b.y, a.y, back) };
        ctx.globalAlpha = 1 - back * 0.3;
        rope(ctx, a, fl, 0.5, mpp);
        coil(ctx, fl, mpp, 0.7);
        ctx.globalAlpha = 1;
        return;
      }
      ctx.save();
      rope(ctx, a, { x: tip2.x, y: tip2.y - hgt }, -hgt * 0.4, mpp);
      coil(ctx, { x: tip2.x, y: tip2.y - hgt }, mpp, 1);
      // shadow of the coil on the water
      ctx.fillStyle = 'rgba(0,30,60,0.25)'; ctx.beginPath(); ctx.ellipse(tip2.x, tip2.y, 0.3, 0.18, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    function coil(ctx, p, mpp, k) {
      const r = Math.max(0.22, 5 * mpp) * k;
      ctx.strokeStyle = '#f2e3b8'; ctx.lineWidth = Math.max(0.05, 2 * mpp);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55, 0, TAU); ctx.stroke();
    }
    function cleat(ctx, p, q, tm, mpp) {
      const s = Math.max(0.25, 5 * mpp);
      if (q > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(tm * 9);
        ctx.fillStyle = q >= 2 ? 'rgba(62,224,143,' + (0.25 + 0.25 * pulse) + ')' : 'rgba(255,210,94,' + (0.2 + 0.2 * pulse) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, s * (2.6 + pulse * 0.6), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#2a2f38'; ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 1.3, s * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a929c'; ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, 0, TAU); ctx.fill();
    }
    function pole(ctx, p, mpp) {
      const r = Math.max(p.r * 1.3, 4 * mpp);
      ctx.fillStyle = 'rgba(0,25,60,0.3)'; ctx.beginPath(); ctx.arc(p.x + r * 0.5, p.y + r * 0.6, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a5532'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4a3220'; ctx.lineWidth = Math.max(0.03, 1 * mpp); ctx.stroke();
      ctx.fillStyle = '#a77c4e'; ctx.beginPath(); ctx.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.22, 0, TAU); ctx.fill(); // white cap = visible pole top
    }
    function fenders(ctx, b, side, hit, mpp) {
      const bl = b.cls.length, bb = b.cls.beam;
      const pts = side ? [[side * (bb / 2 + 0.06), -bl * 0.18], [side * (bb / 2 + 0.06), bl * 0.12]] : [[0, -bl / 2 - 0.1]];
      const sq = 1 + 0.5 * hit;
      for (const p of pts) {
        const c = local(p[0], p[1], b);
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(b.heading);
        const w = Math.max(0.2, 3.4 * mpp) * sq, h = Math.max(0.42, 7 * mpp) / sq;
        ctx.fillStyle = 'rgba(0,25,60,0.28)'; rr(ctx, -w / 2 + 0.05, -h / 2 + 0.07, w, h, w / 2); ctx.fill();
        ctx.fillStyle = hit > 0.2 ? '#ffd25e' : '#f4f7fb'; rr(ctx, -w / 2, -h / 2, w, h, w / 2); ctx.fill();
        ctx.fillStyle = '#2b6cb0'; ctx.fillRect(-w / 2, -h * 0.08, w, h * 0.16);
        ctx.restore();
      }
    }
    function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    function drawTarget(ctx, sg, tm, mpp, lw) {
      const tg = sg.target, q = S.lineQ, pulse = 0.5 + 0.5 * Math.sin(tm * 4);
      const col = q >= 2 ? '62,224,143' : q >= 1 ? '255,210,94' : '255,255,255';
      if (sg.kind === 'buoy') {
        const tp = tolPos();
        const r0 = B * 0.45 + sg.buoy.r + 0.15;
        ctx.fillStyle = 'rgba(' + col + ',' + (0.1 + 0.08 * pulse) + ')';
        ctx.beginPath(); ctx.arc(sg.buoy.x, sg.buoy.y, r0 + tp * 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = lw; ctx.setLineDash([lw * 3, lw * 2.5]);
        ctx.beginPath(); ctx.arc(sg.buoy.x, sg.buoy.y, r0 + tp, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        // arrow from downwind showing "come in head to wind"
        const a = add(sg.buoy, vec(windDir), -(L + 4)), b = add(sg.buoy, vec(windDir), -(r0 + tp + 0.6));
        arrow(ctx, a, b, 'rgba(255,255,255,' + (0.4 + 0.3 * pulse) + ')', lw * 1.2, mpp);
        return;
      }
      ctx.save(); ctx.translate(tg.x, tg.y); ctx.rotate(tg.heading);
      const tp = tolPos(), ta = tolAng();
      // tolerance zone: a soft box the hull centre should be inside
      ctx.fillStyle = 'rgba(' + col + ',' + (0.1 + 0.07 * pulse) + ')';
      rr(ctx, -B / 2 - tp * 0.5, -L / 2 - tp, B + tp, L + tp * 2, Math.min(B, 1)); ctx.fill();
      // the berth outline (hull shape)
      ctx.strokeStyle = 'rgba(' + col + ',' + (0.7 + 0.3 * pulse) + ')'; ctx.lineWidth = lw * 1.2; ctx.setLineDash([lw * 3, lw * 2.2]);
      hullPath(ctx, L, B); ctx.stroke(); ctx.setLineDash([]);
      // angle tolerance wedge at the bow
      const fwd = tg.type === 'stern' ? 1 : -1;
      ctx.fillStyle = 'rgba(' + col + ',0.18)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L * 0.7, -Math.PI / 2 - ta + (fwd > 0 ? Math.PI : 0), -Math.PI / 2 + ta + (fwd > 0 ? Math.PI : 0)); ctx.closePath(); ctx.fill();
      // chevron showing which way the bow points
      ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = lw * 1.5; ctx.lineJoin = 'round';
      const cy = -L * 0.12 - pulse * 0.2;
      ctx.beginPath(); ctx.moveTo(-B * 0.22, cy + B * 0.18); ctx.lineTo(0, cy - B * 0.06); ctx.lineTo(B * 0.22, cy + B * 0.18); ctx.stroke();
      if (tg.type === 'stern') { // reverse arrows
        ctx.beginPath(); ctx.moveTo(-B * 0.22, L * 0.22 - B * 0.12); ctx.lineTo(0, L * 0.22 + B * 0.12); ctx.lineTo(B * 0.22, L * 0.22 - B * 0.12); ctx.stroke();
      }
      ctx.restore();
    }
    function hullPath(ctx, l, b) {
      ctx.beginPath();
      ctx.moveTo(0, -l / 2);
      ctx.bezierCurveTo(b * 0.45, -l * 0.38, b / 2, -l * 0.1, b * 0.47, l * 0.42);
      ctx.lineTo(b * 0.4, l / 2); ctx.lineTo(-b * 0.4, l / 2); ctx.lineTo(-b * 0.47, l * 0.42);
      ctx.bezierCurveTo(-b / 2, -l * 0.1, -b * 0.45, -l * 0.38, 0, -l / 2);
      ctx.closePath();
    }
    function arrow(ctx, a, b, col, lw, mpp) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.setLineDash([lw * 2, lw * 2]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      const h = Math.atan2(b.y - a.y, b.x - a.x), s = Math.max(0.5, 9 * mpp);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(h - 0.45) * s, b.y - Math.sin(h - 0.45) * s); ctx.lineTo(b.x - Math.cos(h + 0.45) * s, b.y - Math.sin(h + 0.45) * s); ctx.closePath(); ctx.fill();
    }
    function ghostPath(ctx, sg, mpp, tm) {
      const tg = sg.target;
      let end = tg, ctrlP;
      if (tg.type === 'stern') { // drive past, then reverse in
        const out = add(tg, vec(tg.heading), L * 1.8);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(0.06, 2 * mpp); ctx.setLineDash([0.4, 0.6]);
        ctx.lineDashOffset = -tm * 1.2;
        ctx.beginPath(); ctx.moveTo(boat.x, boat.y); ctx.quadraticCurveTo(out.x + (boat.x - out.x) * 0.2, out.y + (boat.y - out.y) * 0.2, out.x, out.y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      const backK = sg.kind === 'buoy' || sg.kind === 'slip' ? 1.2 : 1.6;
      ctrlP = add(end, vec(tg.heading), -(L * backK + 3));
      const e = errors(); if (e.d < L * 0.6) return;
      if (!KOS.World.clearPath(venue, { x: boat.x, y: boat.y }, ctrlP, 1.2)) return;   // no hint through a jetty
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = Math.max(0.06, 2 * mpp); ctx.setLineDash([0.4, 0.6]);
      ctx.lineDashOffset = -tm * 1.2;
      ctx.beginPath(); ctx.moveTo(boat.x, boat.y); ctx.quadraticCurveTo(ctrlP.x, ctrlP.y, end.x, end.y); ctx.stroke(); ctx.setLineDash([]);
    }
    function mooringBuoy(ctx, b, tm, mpp) {
      const bob = 1 + 0.05 * Math.sin(tm * 2.2), r = Math.max(b.r, 6 * mpp) * bob;
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(b.x, b.y, r * (1.6 + 0.3 * Math.sin(tm * 2)), 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,25,60,0.3)'; ctx.beginPath(); ctx.arc(b.x + r * 0.3, b.y + r * 0.35, r, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9dee6');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = r * 0.28; ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.72, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.22, 0, TAU); ctx.stroke(); // ring on top
    }
    function drawGate(ctx, gl, tm, mpp, lw) {
      const pulse = 0.5 + 0.5 * Math.sin(tm * 4);
      ctx.strokeStyle = 'rgba(255,181,71,' + (0.5 + 0.4 * pulse) + ')'; ctx.lineWidth = lw * 1.3; ctx.setLineDash([lw * 3, lw * 2.5]);
      ctx.beginPath(); ctx.moveTo(gl.a.x, gl.a.y); ctx.lineTo(gl.b.x, gl.b.y); ctx.stroke(); ctx.setLineDash([]);
      for (const p of [gl.a, gl.b]) {
        const r = Math.max(0.4, 7 * mpp);
        ctx.fillStyle = 'rgba(0,25,60,0.3)'; ctx.beginPath(); ctx.arc(p.x + r * 0.3, p.y + r * 0.35, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd25e'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + r * 1.6, p.y - r * 0.9 + Math.sin(tm * 6) * r * 0.2); ctx.lineTo(p.x, p.y - r * 1.4); ctx.closePath(); ctx.fill();
      }
    }
    function coachFig(ctx, c, tm, mpp) {
      const s = Math.max(1.5, 26 * mpp / 0.55);
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(s, s);
      const wave = c.state === 'wait' ? Math.sin(tm * 7) * 0.5 : 0;
      ctx.fillStyle = 'rgba(0,25,60,0.25)'; ctx.beginPath(); ctx.ellipse(0.06, 0.08, 0.3, 0.22, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.ellipse(0, 0, 0.28, 0.2, 0, 0, TAU); ctx.fill();          // orange jacket
      ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0.22, -0.02); ctx.lineTo(0.42, -0.28 - wave * 0.15); ctx.stroke();           // waving arm
      ctx.fillStyle = '#f2c79a'; ctx.beginPath(); ctx.arc(0, -0.02, 0.13, 0, TAU); ctx.fill();                 // head
      ctx.fillStyle = '#6b3d1f'; ctx.beginPath(); ctx.arc(0, -0.05, 0.11, Math.PI, TAU); ctx.fill();          // hair
      if (c.state === 'wait') { // pulsing "here I am" ring
        const k = (tm * 0.8) % 1;
        ctx.strokeStyle = 'rgba(255,210,94,' + (0.9 * (1 - k)) + ')'; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.arc(0, 0, 0.35 + k * 0.6, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    function gull(ctx, g, mpp) {
      const s = Math.max(0.6, 10 * mpp), fl = Math.sin(g.t * 18) * 0.6;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.atan2(g.vy, g.vx) + Math.PI / 2);
      ctx.globalAlpha = U.clamp(2.2 - g.t, 0, 1);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s * 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s, fl * s * 0.5); ctx.quadraticCurveTo(-s * 0.4, -s * 0.4, 0, 0); ctx.quadraticCurveTo(s * 0.4, -s * 0.4, s, fl * s * 0.5); ctx.stroke();
      ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.12, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // screen overlay: edge arrow to the target when it is off screen
    function drawScreen(ctx, sc) {
      if (S.phase === 'done') return;
      const sg = stage(); if (!sg) return;
      if (S.phase === 'intro' || (S.phase === 'go' && S.time < 3)) youMarker(ctx, sc);
      const tg = sg.kind === 'leave' ? sg.gateLine.c : sg.target;
      if (!tg) return;
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, H = sc.h;
      const land = W > H && H < 560, phone = Math.min(W, H) < 600;
      const mL = land ? 160 : 40, mT = land ? 70 : phone ? 230 : 170, mB = land ? 60 : phone ? 250 : 170;
      if (p.x > mL && p.x < W - mL && p.y > mT && p.y < H - mB) return;
      const cx = W / 2, cy = (mT + H - mB) / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((W / 2 - mL) / (dx || 1e-6)), Math.abs((dy > 0 ? H - mB - cy : cy - mT) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx), pulse = 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = '#ffb547';
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.font = '900 12px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(Math.round(Math.hypot(tg.x - boat.x, tg.y - boat.y)) + ' m', ax, ay);
    }

    // "this is you": a bouncing chevron over the player's boat at the start
    function youMarker(ctx, sc) {
      const p = sc.worldToScreen(boat.x, boat.y), r = L * 0.5 / sc.mpp + 18, by = p.y - r - Math.abs(Math.sin(sc.t * 5)) * 8;
      ctx.fillStyle = '#ffd25e'; ctx.strokeStyle = 'rgba(13,19,33,0.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - 11, by - 10); ctx.lineTo(p.x + 11, by - 10); ctx.lineTo(p.x, by + 3); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.strokeText(t('dock.you'), p.x, by - 13); ctx.fillStyle = '#fff'; ctx.fillText(t('dock.you'), p.x, by - 13);
    }

    // ==================================================================== camera: frame boat + target, keep clear of HUD/controls
    function camera(snap) {
      const sg = stage(); if (!sg) return;
      const tg = sg.kind === 'leave' ? sg.gateLine.c : sg.target;
      const W = scene.w, H = scene.h, land = W > H && H < 560, phone = Math.min(W, H) < 600;
      const bubble = S.phase === 'intro' || S.time < 5.5;   // the coach's speech bubble covers part of the screen at first
      const padT = land ? (bubble ? 138 : 64) : phone ? 236 : 84, padB = land ? 30 : phone ? (bubble ? 300 : 230) : 150, padX = land ? 170 : phone ? 20 : 150;
      const aw = Math.max(120, W - padX * 2), ah = Math.max(120, H - padT - padB);
      const minSpan = (isRib ? 16 : 12) + 2.6 * L;
      const d = Math.hypot(tg.x - boat.x, tg.y - boat.y);
      const intro = S.phase === 'intro';
      const need = intro ? d + L * 3 + 8 : d * 1.25 + L * 2 + 4;
      const zFit = Math.min(aw, ah) / Math.max(need, minSpan);
      // never let the boat get tiny: at least ~60 px long on desktop (a bit less on phones), more for big boats
      const zMin = ((phone ? 46 : 60) + 4 * L) / L;
      const z = intro ? Math.min(zFit, Math.min(aw, ah) / minSpan) : Math.max(zFit, zMin);
      const span = Math.min(aw, ah) / z;
      // focus: midpoint while both fit, otherwise lean from the boat towards the target (the edge arrow shows it)
      let k = 0.5;
      if (need > span) k = U.clamp((span * 0.36) / Math.max(1, d), 0, 0.5);
      const fx = U.lerp(boat.x, tg.x, k), fy = U.lerp(boat.y, tg.y, k);
      cam.x = fx; cam.y = fy + ((padB - padT) / 2) / z;
      scene.fixedZoom = z;
      if (snap) { scene.camera.x = cam.x; scene.camera.y = cam.y; scene.camera.zoom = z; }
    }

    // ==================================================================== HUD + meter
    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      S.fenderHit = Math.max(0, S.fenderHit - dt * 3);
      if (S.hudT > 0) return;
      S.hudT = 0.1;
      const v = sog(), kn = U.kn(v);
      hud.update({ wind: { dir: boat.windDir || windDir, speed: boat.tws || P.windKn }, speed: kn, timer: S.time * 1000,
        custom: { stage: (Math.min(S.si + 1, stages.length)) + '<small>/' + stages.length + '</small>' } });
      // speed meter: green up to the "ok" limit, yellow to 1.7×, red beyond
      const vmax = vOk * 3;
      const f = U.clamp(v / vmax, 0, 1);
      ui.kn.textContent = kn.toFixed(1);
      ui.needle.style.left = (f * 100).toFixed(1) + '%';
      ui.zone.style.setProperty('--g', (vOk / vmax * 100).toFixed(1) + '%');
      ui.zone.style.setProperty('--y', (vOk * 1.7 / vmax * 100).toFixed(1) + '%');
      const sg = stage();
      const close = sg && sg.kind !== 'leave' && errors().d < 2.5 * L + 7;
      const state = v <= vOk ? 'slow' : v <= vOk * 1.7 ? 'fast' : 'tooFast';
      ui.meter.className = 'dock-meter is-' + state + (close ? ' is-close' : ' is-far');
      ui.state.textContent = t(close || (sg && sg.kind === 'leave') ? 'dock.meter.' + state : 'dock.meter.approach');
      ui.dist.textContent = (sg ? Math.round(distToTarget()) : 0) + ' m';
      ui.warn.classList.toggle('on', !!(S.inWarn && close && S.phase === 'go'));
      paintAction(false);
      if (isRib) { try { KOS.Audio.engine(boat.throttle); } catch (e) { /* optional */ } }
      else ctrl.setIdealSheet(controls.autoTrim || boat.inIrons ? null : KOS.Physics.idealSheet(boat), 0.07);
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() { try { KOS.Audio.ambient({ wind: boat.tws || P.windKn, waves: 0.2 + P.windKn / 30, harbor: 0.75 }); } catch (e) { /* optional */ } }

    // ==================================================================== instance
    let introCd = null, coachIntro = null;
    function start() {
      setupStage(0, true);
      camera(true);
      const sg = stage();
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      let key = sg.kind === 'dock' ? (isRib ? 'dockRib' : 'dock') : sg.kind;
      if (sg.kind === 'leave' && needBack()) key = 'leaveHead';
      const keysKey = isRib ? 'dock.keysRib' : sg.kind === 'leave' ? 'dock.keysLeave' : 'dock.keys';
      coachIntro = KOS.UI.coach(t('dock.intro.' + key, { from: windWord(windDir) }) + (touch ? '' : '  ' + t(keysKey)), { ms: 9000 });
      ambient();
      if (isRib) { try { KOS.Audio.engine(0); } catch (e) { /* optional */ } }
      S.phase = 'intro';
      introCd = KOS.UI.countdown(host.layer, 3, () => { introCd = null; if (S.phase === 'intro') { S.phase = 'go'; sfx('hornShort'); paintAction(true); } });
    }

    function update(dt) {
      env.t += dt;
      wind.update(dt);
      const sg = stage();
      if (S.phase === 'intro') {
        S.introT = (S.introT || 0) + dt;
        const hold = { x: boat.x, y: boat.y, heading: boat.heading };
        controls = KOS.Input.toControls(ctrl.state, boat, controls, dt); controls.rudder = 0; controls.throttle = 0;
        KOS.Physics.step(boat, controls, env, dt);
        Object.assign(boat, hold);
        if (sg.kind === 'leave') holdPose(sg.target);
        keepMoored();
        camera(false);
        hudTick(dt);
        return;
      }
      if (S.phase === 'go' || S.phase === 'between') {
        if (S.phase === 'go') { S.time += dt; S.stageT += dt; }
        controls = KOS.Input.toControls(ctrl.state, boat, controls, dt);
        if (S.pull) stepPull(dt);
        else if (autopilot && S.phase === 'go') autoDrive(dt);
        else {
          KOS.Physics.step(boat, controls, env, dt);
          if (sg.kind === 'leave' && S.phase === 'go') stepLeave(dt);
          KOS.Physics.collide([boat].concat(moored), venue, poles.concat(sg.buoy ? [sg.buoy] : []));
          if (controls.autoTrim && !isRib) ctrl.setSheet(boat.sheet);
          if (S.phase === 'go' && sg.kind !== 'leave') stepDock(dt);
        }
        keepMoored();
        if (S.rope) {
          S.rope.t += dt;
          if (S.rope.state === 'fly' && S.rope.t >= 0.45) { const r = S.rope; S.rope = { state: 'made', a: r.a, b: r.b, t: 0 }; sfx('knot', { vol: 0.6 }); lineMade(r.perfect, r.e); }
          else if (S.rope.state === 'miss' && Math.abs(S.rope.t - 0.4) < dt / 2 + 1e-6) { sfx('splash', { vol: 0.5, pitch: 1.4 }); if (scene.effects) scene.effects.splash(S.rope.b.x, S.rope.b.y, 0.4); floatText(t('dock.fx.miss'), '#9fe7ff', S.rope.b.x, S.rope.b.y - 1); }
          else if (S.rope.state === 'miss' && S.rope.t > 1.5) { S.rope = null; paintAction(true); }
          else if (S.rope.state === 'retract' && S.rope.t > 0.6) S.rope = null;
        }
        if (S.rope2 && S.rope2.state === 'retract') { S.rope2.t += dt; if (S.rope2.t > 0.6) S.rope2 = null; }
        if (S.phase === 'between') {
          S.betweenT -= dt;
          if (S.betweenT <= 0) {
            setupStage(S.nextStage, false);
            S.phase = 'go'; sfx('hornShort');
            KOS.UI.coach(t(stage().kind === 'dock' ? 'dock.next.dock' : 'dock.next.any'), { ms: 5000 });
          }
        }
      }
      if (S.phase === 'done' || S.pull) relaxSails(dt);
      if (S.phase === 'done') {
        controls.rudder = 0;
        if (S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      }
      for (let i = S.gulls.length - 1; i >= 0; i--) { const g = S.gulls[i]; g.t += dt; g.x += g.vx * dt; g.y += g.vy * dt; if (g.t > 2.4) S.gulls.splice(i, 1); }
      camera(false);
      hudTick(dt);
    }
    function relaxSails(dt) { // tied up head to wind: the boom swings to the middle and the sail flaps gently
      if (isRib) return;
      boat.boom *= Math.exp(-dt * 1.5); boat.luffing = true; boat.trim = 0.2; boat.heel *= Math.exp(-dt * 2); boat.hike *= Math.exp(-dt * 2);
    }
    function keepMoored() {
      for (const b of moored) {
        const p = b.pose, bob = Math.sin(env.t * 1.3 + p.x) * 0.02;
        b.x = p.x + bob; b.y = p.y; b.heading = p.heading; b.vx = b.vy = 0; b.speed = 0; b.t = env.t;
      }
    }

    function render(alpha) { scene.render(alpha); }

    function destroy() {
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      offAction && offAction();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      if (introCd) introCd.cancel();
      if (coachIntro) coachIntro.close(true);
      ctrl.detach();
      hud.destroy();
      ui.meter.remove(); ui.warn.remove(); ui.act.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function pause() { try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); if (isRib) { try { KOS.Audio.engine(boat.throttle); } catch (e) { /* optional */ } } }
    function onResize() { scene.resize(); camera(false); }

    // ---- test hooks: a kinematic "perfect helm" that drives the boat into the berth (tools/autoplay.js, own checks)
    let autopilot = false;
    function setAutopilot(on) { autopilot = !!on; }
    function autoDrive(dt) {
      const sg = stage(), tg = sg.target;
      if (sg.kind === 'leave') {
        if (S.step === 'castoff' || S.step === 'push') { S.autoT = (S.autoT || 0) + dt; if (S.autoT > 0.8) { S.autoT = 0; leaveAction(); } holdPose(tg); return; }
        // back out a little, then glide to the gate
        const gl = sg.gateLine.c;
        const h = Math.atan2(gl.x - boat.x, -(gl.y - boat.y));
        boat.heading = U.wrapPi(boat.heading + U.clamp(U.wrapPi(h - boat.heading), -1.2 * dt, 1.2 * dt));
        boat.speed = Math.min(1.6, boat.speed + dt * 0.8); syncV();
        boat.x += boat.vx * dt; boat.y += boat.vy * dt;
        stepLeave(dt);
        return;
      }
      const e = errors();
      // aim at a point behind the berth along its heading, then slide in
      const sternIn = tg.type === 'stern';
      const goalHeading = tg.heading;
      const lead = add(tg, vec(goalHeading), sternIn ? L * 1.4 : -(L * 1.4 + 2));
      const dLead = Math.hypot(lead.x - boat.x, lead.y - boat.y);
      let aim = S.autoPhase === 'final' ? tg : lead;
      if (dLead < 1.5 || S.autoPhase === 'final') S.autoPhase = 'final';
      const dx = aim.x - boat.x, dy = aim.y - boat.y, d = Math.hypot(dx, dy);
      let sp = U.clamp(d * 0.45, 0.12, 1.8);
      let h;
      if (S.autoPhase === 'final') { h = goalHeading; sp = U.clamp(d * 0.5, 0.0, 0.8); if (d < 0.05) sp = 0; }
      else h = Math.atan2(dx, -dy);
      boat.heading = U.wrapPi(boat.heading + U.clamp(U.wrapPi(h - boat.heading), -1.4 * dt, 1.4 * dt));
      const mv = d > 1e-3 ? Math.min(sp * dt, d) : 0;
      boat.x += dx / (d || 1) * mv; boat.y += dy / (d || 1) * mv;
      boat.vx = dx / (d || 1) * sp; boat.vy = dy / (d || 1) * sp; boat.speed = sternIn && S.autoPhase === 'final' ? -sp : sp;
      if (S.autoPhase === 'final' && d < 0.05) { boat.vx = boat.vy = 0; boat.speed = 0; }
      stepDock(dt);
      if (S.lineQ >= 2 && !S.rope && !S.pull) throwLine();
    }
    function skipIntro() { if (introCd) { introCd.cancel(); introCd = null; } if (S.phase === 'intro') { S.phase = 'go'; paintAction(true); } }

    return { start, update, render, destroy, pause, resume, onResize, boat, scene, state: S, ctrl, stages, setAutopilot, skipIntro, get controls() { return controls; },
      debug: { errors, tolPos, tolAng, vPerfect, vOk, throwLine, onAction, snapCamera: () => camera(true) } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
