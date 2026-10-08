// KØS SEJL — js/modes/shed.js
// The 'shed' mode (kind 'dom', hub area 'club'): tidy the club's sailing shed (skuret) before Træner Peter loses it.
// One SVG shows the inside of the shed: labelled places along the wall (life jacket rail, wetsuit hooks, sail rack,
// mast rack, boom pegs, rudder & board rack, rope hooks) and on the floor (a crate for shackles and blocks, the
// lost-and-found box, the bin). A kid in the doorway tosses gear onto the floor at a rising pace: drag each thing to
// its place (or tap it, then tap the place; or the keyboard). Wrong place = it bounces back + a mistake. Tangled ropes
// are coiled with a few taps first. The mess meter fills with every thing on the floor; when it is high, or a thing has
// lain there too long, Peter pops in and yells (funny-grumpy, never mean). The floor overflowing = fail (quick retry).
// Drag patterns, the ghost-finger demo and the kid art come from js/modes/rigging.js (KOS.RigKit).
//
// Activity params: {n (things in all), start (on the floor at the start), i0 / i1 (seconds between tosses, first /
//   last), max (floor limit), linger (s before Peter yells about one thing), tangle (0..1 share of tangled ropes),
//   pool ('basic'|'all'), burst (the whole team comes in at once now and then), seed}
// Test hooks on the instance: setAutopilot(on), skipIntro(), doNext(), state.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const doc = root.document;

  // ======================================================================== 1. places and things
  // place → [da, en]
  const PLACES = {
    vests: ['Redningsveste', 'Life jackets'],
    hooks: ['Våddragter', 'Wetsuits'],
    sails: ['Sejl', 'Sails'],
    masts: ['Master', 'Masts'],
    booms: ['Bomme', 'Booms'],
    foils: ['Ror og sværd', 'Rudders & boards'],
    ropes: ['Tovværk', 'Ropes'],
    box: ['Sjækler og blokke', 'Shackles & blocks'],
    lost: ['Glemt-kassen', 'Lost & found'],
    bin: ['Skrald', 'Rubbish'],
  };
  const PLACE_IDS = Object.keys(PLACES);
  // thing → [da, en, place, size on the floor (scene units)]
  const THINGS = {
    vest: ['Redningsvest', 'Life jacket', 'vests', 84],
    wetsuit: ['Våddragt', 'Wetsuit', 'hooks', 92],
    spraytop: ['Spraytop', 'Spray top', 'hooks', 84],
    sail: ['Optimistsejl', 'Optimist sail', 'sails', 96],
    sailbag: ['Sejlpose', 'Sail bag', 'sails', 84],
    mast: ['Mast med sejl', 'Mast with sail', 'masts', 136],
    boom: ['Bom', 'Boom', 'booms', 112],
    rudder: ['Ror', 'Rudder', 'foils', 86],
    board: ['Sværd', 'Daggerboard', 'foils', 84],
    rope: ['Tov', 'Rope', 'ropes', 80],
    shackle: ['Sjækkel', 'Shackle', 'box', 66],
    block: ['Blok', 'Block', 'box', 70],
    bottle: ['Tom saftevandsflaske', 'Empty juice bottle', 'bin', 74],
    wrapper: ['Slikpapir', 'Sweet wrapper', 'bin', 64],
    banana: ['Bananskræl', 'Banana peel', 'bin', 70],
    sock: ['En enlig sok', 'A lonely sock', 'lost', 70],
    cap: ['Kasket', 'Cap', 'lost', 74],
  };
  const POOLS = {
    basic: ['vest', 'vest', 'wetsuit', 'sail', 'rudder', 'board', 'rope', 'shackle', 'bottle', 'wrapper', 'sock', 'cap', 'spraytop', 'sailbag', 'block', 'banana'],
  };
  POOLS.all = POOLS.basic.concat(['mast', 'boom', 'mast', 'boom', 'rope']);

  const strDa = { place: {}, thing: {} }, strEn = { place: {}, thing: {} };
  for (const k in PLACES) { strDa.place[k] = PLACES[k][0]; strEn.place[k] = PLACES[k][1]; }
  for (const k in THINGS) { strDa.thing[k] = THINGS[k][0]; strEn.thing[k] = THINGS[k][1]; }
  KOS.I18n.add('da', {
    shed: Object.assign(strDa, {
      hud: { mess: 'Rod', tidy: 'Ryddet' },
      keys: 'Træk tingene på plads · Tastatur: ←/→ vælg, Enter tag op, ←/→ sted, Enter læg',
      demo: 'Træk!',
      intro: {
        tidy: 'Hej, jeg er Træner Peter! Skuret ligner en rodebutik. Træk tingene hen, hvor de hører til – før gulvet bliver fyldt!',
        rush: 'Holdet kommer ind fra vandet, og de smider ALT. Nu går det stærkere – og filtrede tove skal skydes op først!',
        regatta: 'Efter regattaen ligner skuret en slagmark! Vi går ikke hjem, før det hele er på plads. Kom så!',
      },
      // Peter yells about a thing that has lain on the floor too long (one line per place)
      yell: {
        vests: 'HVEM har smidt redningsvesten på gulvet?!',
        hooks: 'Våddragten skal hænge til tørre – ellers lugter skuret af gammel tang!',
        sails: 'Et sejl på gulvet?! Det bliver trådt på! Op på hylden med det!',
        masts: 'Der ligger en mast midt på gulvet! I masteholderen, før nogen falder over den!',
        booms: 'Hvem har glemt bommen? Op på knagerne med den!',
        foils: 'Ror og sværd på gulvet får skrammer! I stativet med dem!',
        ropes: 'Tovværk skal hænge på krogen – ikke ligge som spaghetti!',
        box: 'Sjækler i kassen – ikke i lommen!',
        lost: 'Hvem har glemt den her?! Glemt-kassen, tak!',
        bin: 'Skrald i skraldespanden! Skuret er ikke en losseplads!',
        mess1: 'Skuret skal være ryddeligt, før vi går hjem!',
        mess2: 'Hallo?! Jeg kan snart ikke se gulvet!',
        mess3: 'Kom så, kom så – det hober sig op!',
        last: 'Én ting mere på gulvet, og så er det for meget!',
        fail: 'STOP! Skuret er ét stort rod. Vi tager den lige en gang til!',
      },
      coach: {
        wrong: 'Næh nej – den hører ikke til der! Kig på skiltene.',
        wrongEasy: 'Næh nej – {thing} skal over i: {place}!',
        tangle: 'Tovet er filtret! Tryk på det et par gange for at skyde det op, før det hænges på krogen.',
        burst: 'Hele holdet kommer ind på én gang – pas på!',
        streak: 'Hov hov, det går jo stærkt!',
        done: 'Sådan! Det er et skur man kan være bekendt.',
        done3: 'Sådan! Det er et skur man kan være bekendt. Jeg har ikke én eneste ting at brokke mig over!',
      },
      fx: { ok: '{thing} ✓', oops: 'Ups! +{s} sek', streak: 'Combo x{n}!', coil: 'Skudt op!' },
      res: {
        ok: 'Skuret er ryddeligt! {n} ting på plads på {time} med {oops} fejl.',
        fail: 'Gulvet blev fyldt. Træner Peter tog sig til hovedet – prøv igen!',
      },
      stat: { items: 'Ting på plads', oops: 'Fejl', scold: 'Skæld ud fra Peter', peak: 'Mest rod' },
    }),
  });
  KOS.I18n.add('en', {
    shed: Object.assign(strEn, {
      hud: { mess: 'Mess', tidy: 'Tidied' },
      keys: 'Drag things to their place · Keyboard: ←/→ choose, Enter pick up, ←/→ place, Enter put',
      demo: 'Drag!',
      intro: {
        tidy: 'Hi, I\'m Coach Peter! The shed is a total mess. Drag everything to where it belongs – before the floor fills up!',
        rush: 'The team is coming in off the water and they drop EVERYTHING. It\'s faster now – and tangled ropes must be coiled first!',
        regatta: 'After the regatta the shed looks like a battlefield! Nobody goes home until it\'s all put away. Come on!',
      },
      yell: {
        vests: 'WHO threw the life jacket on the floor?!',
        hooks: 'Wetsuits hang up to dry – or the whole shed smells of old seaweed!',
        sails: 'A sail on the floor?! Someone will tread on it! Up on the rack!',
        masts: 'There\'s a mast in the middle of the floor! In the mast rack before someone trips over it!',
        booms: 'Who forgot the boom? Up on the pegs with it!',
        foils: 'Rudders and boards on the floor get scratched! Into the rack with them!',
        ropes: 'Ropes hang on the hook – they don\'t lie about like spaghetti!',
        box: 'Shackles go in the box – not in your pocket!',
        lost: 'Who forgot this?! Lost and found, please!',
        bin: 'Rubbish in the bin! The shed is not a rubbish tip!',
        mess1: 'The shed has to be tidy before we go home!',
        mess2: 'Hello?! I can hardly see the floor!',
        mess3: 'Come on, come on – it\'s piling up!',
        last: 'One more thing on the floor and that\'s too much!',
        fail: 'STOP! The shed is one big mess. Let\'s give it another go!',
      },
      coach: {
        wrong: 'Nope – that doesn\'t go there! Read the signs.',
        wrongEasy: 'Nope – the {thing} goes in: {place}!',
        tangle: 'That rope is tangled! Tap it a few times to coil it before it goes on the hook.',
        burst: 'The whole team is coming in at once – look out!',
        streak: 'Whoa, that\'s quick!',
        done: 'There we go! Now that\'s a shed to be proud of.',
        done3: 'There we go! Now that\'s a shed to be proud of. I haven\'t got a single thing to grumble about!',
      },
      fx: { ok: '{thing} ✓', oops: 'Oops! +{s} sec', streak: 'Combo x{n}!', coil: 'Coiled!' },
      res: {
        ok: 'The shed is tidy! {n} things put away in {time} with {oops} mistakes.',
        fail: 'The floor filled up. Coach Peter is tearing his hair out – try again!',
      },
      stat: { items: 'Things put away', oops: 'Mistakes', scold: 'Told off by Peter', peak: 'Most mess' },
    }),
  });

  // ======================================================================== 2. activities
  const LEVELS = {
    tidy: { n: 14, start: 3, i0: 4.2, i1: 2.8, max: 9, linger: 14, tangle: 0, pool: 'basic', burst: false, seed: 5 },
    rush: { n: 22, start: 4, i0: 3.2, i1: 1.9, max: 10, linger: 11, tangle: 0.5, pool: 'all', burst: false, seed: 17 },
    regatta: { n: 30, start: 9, i0: 2.7, i1: 1.5, max: 14, linger: 10, tangle: 0.7, pool: 'all', burst: true, seed: 29 },
  };
  KOS.Activities.add([
    { id: 'shed.tidy', order: 21.8, icon: 'trash', minutes: 2, difficulty: 1, unlock: null,
      title: { da: 'Ryd op i skuret', en: 'Tidy the shed' },
      desc: { da: 'Træner Peter vil have et ryddeligt skur! Træk veste, sejl, ror og skrald hen, hvor de hører til, før gulvet bliver fyldt.', en: 'Coach Peter wants a tidy shed! Drag life jackets, sails, rudders and rubbish to the right place before the floor fills up.' },
      params: Object.assign({ level: 'tidy' }, LEVELS.tidy) },
    { id: 'shed.rush', order: 25.8, icon: 'clock', minutes: 2, difficulty: 2, unlock: { after: 'shed.tidy' },
      title: { da: 'Skuret i myldretid', en: 'Shed rush hour' },
      desc: { da: 'Holdet kommer ind fra vandet og smider det hele. Hurtigere nu – med master, bomme og filtrede tove, der skal skydes op.', en: 'The team comes in off the water and drops everything. Faster now – with masts, booms and tangled ropes to coil.' },
      params: Object.assign({ level: 'rush' }, LEVELS.rush) },
    { id: 'shed.regatta', order: 29.8, icon: 'flag', minutes: 3, difficulty: 3, unlock: { after: 'shed.rush' },
      title: { da: 'Kaos efter regattaen', en: 'After-regatta chaos' },
      desc: { da: 'Efter regattaen ligner skuret en slagmark. Kan du rydde det hele, før Træner Peter eksploderer?', en: 'After the regatta the shed looks like a battlefield. Can you clear it all before Coach Peter blows his top?' },
      params: Object.assign({ level: 'regatta' }, LEVELS.regatta) },
  ].map(a => Object.assign({ mode: 'shed', area: 'club', boat: null }, a)));

  // ======================================================================== helpers
  const f = n => Math.round(n * 10) / 10;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n, o) => { try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(n, o); } catch (e) { /* sound optional */ } };
  const reducedMotion = () => { try { return !!(KOS.UI && KOS.UI.reduced && KOS.UI.reduced()); } catch (e) { return false; } };
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const thingName = k => t('shed.thing.' + k);
  const placeName = k => t('shed.place.' + k);
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ======================================================================== 3. art: the things (each in a 100 × 100 box, centre 50,50)
  const VEST_COL = [['#ff7a1a', '#a94415'], ['#ffd23f', '#a8841a'], ['#e8323c', '#8a1d22'], ['#2f7fe0', '#1d4f90']];
  const ROPE_COL = ['#3c8de0', '#e8323c', '#f2c230', '#3ec46a'];
  const SOCK_COL = [['#ff7a3d', '#a94415'], ['#9a5bd8', '#5d2f8f'], ['#3ec46a', '#1f7a3e']];
  const CAP_COL = [['#e8323c', '#8a1d22'], ['#283f86', '#141f45'], ['#f2c230', '#9a7a14']];
  const pick = (arr, v) => arr[(v || 0) % arr.length];
  function rope(col, coil) {
    // coil 0 = a tangled heap, 1 = half coiled, 2 = neatly coiled
    const dash = '<path d="M50 22v6M50 76v6M16 52h6M78 52h6" stroke="rgba(255,255,255,.55)" stroke-width="2.4"/>';
    if (coil >= 2) {
      return '<ellipse cx="50" cy="52" rx="33" ry="30" fill="none" stroke="' + col + '" stroke-width="7"/><ellipse cx="50" cy="52" rx="24" ry="21" fill="none" stroke="' + col + '" stroke-width="7"/>' +
        '<ellipse cx="50" cy="52" rx="15" ry="12.5" fill="none" stroke="' + col + '" stroke-width="7"/>' + dash +
        '<path d="M76 70q8 10 2 24" stroke="' + col + '" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M50 16q-6 -8 2 -12" stroke="' + col + '" stroke-width="6" fill="none" stroke-linecap="round"/>';
    }
    if (coil === 1) {
      return '<ellipse cx="44" cy="48" rx="26" ry="24" fill="none" stroke="' + col + '" stroke-width="7"/><ellipse cx="44" cy="48" rx="16" ry="14" fill="none" stroke="' + col + '" stroke-width="7"/>' +
        '<path d="M66 62c14 4 22 14 10 22s-30-4-22 8 30 2 34-6" stroke="' + col + '" stroke-width="6.5" fill="none" stroke-linecap="round"/>';
    }
    return '<path d="M14 62C26 18 64 92 72 40S26 10 36 58s56 26 50-20S20 84 30 88s50-10 48-30" stroke="' + col + '" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M22 34c10-14 30-6 24 8s-26 8-14 22" stroke="' + col + '" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M60 22l4 3M30 76l4-3" stroke="rgba(255,255,255,.55)" stroke-width="2.2"/>';
  }
  function icon(k, v, coil) {
    switch (k) {
      case 'vest': {
        const c = pick(VEST_COL, v);
        return '<path d="M28 16q10-6 16 6l6 12 6-12q6-12 16-6l6 68q-28 10-56 0z" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="3" stroke-linejoin="round"/>' +
          '<path d="M50 34v54" stroke="' + c[1] + '" stroke-width="2.6"/><path d="M36 28v58M64 28v58" stroke="' + c[1] + '" stroke-width="1.6" opacity=".6"/>' +
          '<path d="M24 52h52M23 70h54" stroke="#2a2f3a" stroke-width="4.5"/><rect x="45" y="48" width="10" height="8" rx="2" fill="#111"/><rect x="45" y="66" width="10" height="8" rx="2" fill="#111"/>' +
          '<path d="M30 40h12M58 40h12" stroke="#e8eef5" stroke-width="3"/>';
      }
      case 'wetsuit':
        return '<path d="M38 8h24l5 12 11 30-8 4-8-18v28l4 32H52l-2-26-2 26H34l4-32V36l-8 18-8-4 11-30z" fill="#1c1f26" stroke="#000" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M38 26h24M36 52h28" stroke="#2f8ce0" stroke-width="4"/><path d="M46 8q4 6 8 0" stroke="#3a3f4a" stroke-width="2" fill="none"/><path d="M50 12v24" stroke="#555b66" stroke-width="1.6"/>';
      case 'spraytop':
        return '<path d="M38 12q12-8 24 0l4 8 16 8-6 34-8-2v30H32V60l-8 2-6-34 16-8z" fill="#2f6fd0" stroke="#163a75" stroke-width="2.6" stroke-linejoin="round"/>' +
          '<path d="M40 16q10 8 20 0" stroke="#163a75" stroke-width="2.6" fill="#1d4f9a"/><path d="M50 22v34" stroke="#c9d0db" stroke-width="2.2"/>' +
          '<path d="M24 56l8-2M76 56l-8-2" stroke="#ff7a3d" stroke-width="4"/><path d="M32 86h36" stroke="#163a75" stroke-width="4"/>';
      case 'sail':
        return '<g transform="rotate(-30 50 50)"><rect x="8" y="37" width="84" height="26" rx="13" fill="#f4f6f8" stroke="#8a93a6" stroke-width="2.4"/>' +
          '<path d="M30 37v26M58 37v26" stroke="#2f6fd0" stroke-width="5"/><path d="M14 44h70M14 56h70" stroke="#d9dee6" stroke-width="1.6"/>' +
          '<ellipse cx="88" cy="50" rx="6" ry="13" fill="#e3e8ef" stroke="#8a93a6" stroke-width="2"/><path d="M88 43q-4 7 0 14q3-4 0-7" stroke="#8a93a6" stroke-width="1.4" fill="none"/></g>';
      case 'sailbag':
        return '<path d="M28 30q22-10 44 0l6 54q-28 10-56 0z" fill="#25335e" stroke="#121a35" stroke-width="2.6" stroke-linejoin="round"/>' +
          '<path d="M32 33q18 7 36 0" stroke="#ff7a3d" stroke-width="3.4" fill="none"/><path d="M50 30q-2-12 6-16" stroke="#ff7a3d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<rect x="36" y="52" width="28" height="16" rx="4" fill="#f4f6f8"/><path d="M41 60h18" stroke="#2f6fd0" stroke-width="3"/>';
      case 'mast':
        // a Tera / Zest mast with its sail rolled round it (that's how it lives in the shed)
        return '<path d="M8 92L92 8" stroke="#5b6470" stroke-width="9" stroke-linecap="round"/><path d="M8 92L92 8" stroke="#c9d0db" stroke-width="5.5" stroke-linecap="round"/>' +
          '<path d="M24 76L76 24" stroke="#8a93a6" stroke-width="17" stroke-linecap="round"/><path d="M24 76L76 24" stroke="#f4f6f8" stroke-width="13" stroke-linecap="round"/>' +
          '<path d="M34 72l-6-6M46 60l-6-6M58 48l-6-6M70 36l-6-6" stroke="#d9dee6" stroke-width="2"/><path d="M52 54l-8-8" stroke="#ff7a3d" stroke-width="3.4"/>' +
          '<circle cx="92" cy="8" r="3.6" fill="#2a2f3a"/>';
      case 'boom':
        return '<path d="M14 75L86 39" stroke="#5b6470" stroke-width="10" stroke-linecap="round"/><path d="M14 75L86 39" stroke="#c9d0db" stroke-width="6.5" stroke-linecap="round"/>' +
          '<path d="M16 74l70-35" stroke="rgba(255,255,255,.7)" stroke-width="1.6"/><rect x="6" y="70" width="12" height="10" rx="3" fill="#2a2f3a" transform="rotate(-26 12 75)"/>' +
          '<circle cx="62" cy="58" r="5" fill="#2a2f3a"/><circle cx="62" cy="58" r="2" fill="#c9d0db"/>';
      case 'rudder':
        return '<path d="M50 26L14 12" stroke="#a8713a" stroke-width="7" stroke-linecap="round"/><path d="M50 26L14 12" stroke="#d09658" stroke-width="3" stroke-linecap="round"/>' +
          '<path d="M40 30h22l4 54q-15 10-28 0z" fill="#f4f6f8" stroke="#8a93a6" stroke-width="2.6" stroke-linejoin="round"/>' +
          '<rect x="38" y="20" width="26" height="14" rx="3" fill="#2a2f3a"/><path d="M46 44v36" stroke="#d9dee6" stroke-width="2"/>';
      case 'board':
        return '<path d="M36 8h28v74q-14 14-28 0z" fill="#f4f6f8" stroke="#8a93a6" stroke-width="2.6" stroke-linejoin="round"/>' +
          '<rect x="43" y="14" width="14" height="8" rx="4" fill="#2a2f3a"/><path d="M42 30v52" stroke="#d9dee6" stroke-width="2"/><path d="M36 26h28" stroke="#ff7a3d" stroke-width="3"/>';
      case 'rope':
        return rope(pick(ROPE_COL, v), coil == null ? 2 : coil);
      case 'shackle':
        return '<path d="M34 64V40a16 16 0 0 1 32 0v24" stroke="#5b6470" stroke-width="11" fill="none"/><path d="M34 64V40a16 16 0 0 1 32 0v24" stroke="#c9d0db" stroke-width="7" fill="none"/>' +
          '<path d="M26 66h48" stroke="#5b6470" stroke-width="9" stroke-linecap="round"/><path d="M26 66h48" stroke="#9aa3b5" stroke-width="5" stroke-linecap="round"/><circle cx="78" cy="66" r="6" fill="#c9d0db" stroke="#5b6470" stroke-width="2"/>';
      case 'block':
        return '<path d="M50 26V12" stroke="#9aa3b5" stroke-width="5"/><circle cx="50" cy="10" r="6" fill="none" stroke="#9aa3b5" stroke-width="4"/>' +
          '<rect x="30" y="24" width="40" height="60" rx="19" fill="#2a2f3a" stroke="#11141a" stroke-width="2"/><circle cx="50" cy="56" r="13" fill="#c9d0db" stroke="#5b6470" stroke-width="3"/><circle cx="50" cy="56" r="4" fill="#5b6470"/>';
      case 'bottle':
        return '<g transform="rotate(-70 50 50)"><path d="M42 12h16v10q8 6 8 16v44q0 8-8 8H42q-8 0-8-8V38q0-10 8-16z" fill="rgba(235,245,255,.75)" stroke="#8a93a6" stroke-width="2.6"/>' +
          '<rect x="40" y="4" width="20" height="11" rx="2" fill="#e8323c"/><rect x="34" y="48" width="32" height="22" fill="#ff8a3d"/><path d="M40 59h20" stroke="#fff" stroke-width="3"/>' +
          '<path d="M38 76q12 6 24 0v6q0 8-8 8H46q-8 0-8-8z" fill="rgba(232,50,60,.35)"/></g>';
      case 'wrapper':
        return '<path d="M30 40L12 28v44l18-12zM70 40l18-12v44L70 60z" fill="#ff5fa8" stroke="#b02a6a" stroke-width="2" stroke-linejoin="round"/>' +
          '<rect x="28" y="36" width="44" height="28" rx="12" fill="#ffd25e" stroke="#c9902a" stroke-width="2.4"/><path d="M38 44l6 12M50 42l4 14M60 44l2 10" stroke="#ff5fa8" stroke-width="2.6" stroke-linecap="round"/>';
      case 'banana':
        return '<path d="M50 62q-30-12-38 10q20 2 38-4zM50 62q30-12 38 10q-20 2-38-4zM50 62q-8-32 6-50q6 24-2 50z" fill="#ffd84a" stroke="#b08a1c" stroke-width="2.4" stroke-linejoin="round"/>' +
          '<path d="M46 60h8v14q-4 4-8 0z" fill="#f4e7b0" stroke="#b08a1c" stroke-width="2"/><path d="M48 74v8" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><circle cx="30" cy="70" r="1.6" fill="#6b4a2a"/><circle cx="70" cy="68" r="1.6" fill="#6b4a2a"/>';
      case 'sock': {
        const c = pick(SOCK_COL, v);
        return '<path d="M36 10h26v44q0 6 6 10l14 10q8 8 0 16q-6 6-16 2L40 78q-6-4-6-12z" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="2.6" stroke-linejoin="round"/>' +
          '<path d="M36 22h26M35 34h27" stroke="#fff" stroke-width="5"/><path d="M36 10h26v6H36z" fill="' + c[1] + '"/><path d="M72 90q8-2 10-10" stroke="' + c[1] + '" stroke-width="3" fill="none"/>';
      }
      case 'cap': {
        const c = pick(CAP_COL, v);
        return '<path d="M20 64q0-34 32-34t32 34z" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="2.6"/><path d="M52 30v34M36 36q-6 12-4 28M68 36q6 12 4 28" stroke="' + c[1] + '" stroke-width="1.6" fill="none" opacity=".7"/>' +
          '<path d="M14 64h56q10 2 16 10H24q-12 0-10-10z" fill="' + c[1] + '"/><circle cx="52" cy="29" r="3.4" fill="' + c[1] + '"/>' +
          '<text x="52" y="56" font-size="15" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif">KØS</text>';
      }
    }
    return '<circle cx="50" cy="50" r="30" fill="#999"/>';
  }
  // long things are grabbed along their length (a fat invisible stroke), the rest by a circle
  const HIT = { mast: 'M8 92L92 8', boom: 'M14 75L86 39' };
  function hitSvg(k) {
    if (HIT[k]) return '<path class="shed-hit" d="' + HIT[k] + '" stroke-width="30" stroke-linecap="round"/>';
    return '<circle class="shed-hit" cx="50" cy="50" r="48"/>';
  }

  // ======================================================================== 4. art: the places
  // wall places are drawn in a 120 × 206 box, floor places (crate, lost & found, bin) in 130 × 82. `slots` say where
  // stored things go: [x, y, scale]; `rot` turns a thing so it hangs / lies right (per thing kind), `dy` nudges it.
  const WOOD = '#9b7349', WOOD_D = '#5e3f22', STEEL = '#c9d0db', STEEL_D = '#5b6470';
  const rail = y => '<rect x="2" y="' + y + '" width="116" height="6" rx="3" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.4"/><rect x="0" y="' + (y - 3) + '" width="6" height="12" rx="2" fill="' + STEEL_D + '"/><rect x="114" y="' + (y - 3) + '" width="6" height="12" rx="2" fill="' + STEEL_D + '"/>';
  const strip = y => '<rect x="0" y="' + y + '" width="120" height="11" rx="3" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.4"/>';
  const hook = (x, y) => '<path d="M' + x + ' ' + y + 'v7q0 5 5 5t5-5" stroke="' + STEEL_D + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const PLACE_ART = {
    vests: {
      box: 'wall', sil: ['vest'],
      back: rail(4) + rail(72) + rail(140) + [26, 60, 94].map(x => '<path d="M' + x + ' 10v12M' + x + ' 78v12M' + x + ' 146v12" stroke="' + STEEL_D + '" stroke-width="2"/>').join(''),
      slots: [[26, 48, 0.55], [60, 48, 0.55], [94, 48, 0.55], [26, 116, 0.55], [60, 116, 0.55], [94, 116, 0.55], [26, 184, 0.55], [60, 184, 0.55], [94, 184, 0.55]],
    },
    hooks: {
      box: 'wall', sil: ['wetsuit', 'spraytop'],
      back: strip(2) + strip(70) + strip(138) + [22, 60, 98].map(x => hook(x - 2, 12) + hook(x - 2, 80) + hook(x - 2, 148)).join(''),
      slots: [[22, 44, 0.52], [60, 44, 0.52], [98, 44, 0.52], [22, 112, 0.52], [60, 112, 0.52], [98, 112, 0.52], [22, 180, 0.52], [60, 180, 0.52], [98, 180, 0.52]],
    },
    sails: {
      box: 'wall', sil: ['sail', 'sailbag'], rot: { sail: 30 }, dy: { sail: 9 },
      back: '<rect x="2" y="0" width="7" height="206" rx="2" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.2"/><rect x="111" y="0" width="7" height="206" rx="2" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.2"/>' +
        [62, 130, 198].map(y => '<rect x="0" y="' + y + '" width="120" height="7" rx="2" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.2"/>').join(''),
      slots: [[34, 42, 0.62], [86, 42, 0.62], [34, 110, 0.62], [86, 110, 0.62], [34, 178, 0.62], [86, 178, 0.62]],
    },
    masts: {
      box: 'wall', sil: ['mast'], rot: { mast: -45 },
      back: '<rect x="0" y="4" width="120" height="14" rx="3" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.4"/>' +
        [20, 47, 74, 101].map(x => '<rect x="' + (x - 6) + '" y="10" width="12" height="9" rx="4" fill="' + WOOD_D + '"/>').join('') +
        '<rect x="0" y="194" width="120" height="10" rx="3" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.4"/>',
      slots: [[20, 104, 1.5], [47, 104, 1.5], [74, 104, 1.5], [101, 104, 1.5]],
    },
    booms: {
      box: 'wall', sil: ['boom'], rot: { boom: 26 },
      back: [34, 74, 114, 154, 194].map(y => '<rect x="4" y="' + (y - 2) + '" width="9" height="12" rx="2" fill="' + WOOD_D + '"/><rect x="107" y="' + (y - 2) + '" width="9" height="12" rx="2" fill="' + WOOD_D + '"/>').join(''),
      slots: [[60, 30, 1.34], [60, 70, 1.34], [60, 110, 1.34], [60, 150, 1.34], [60, 190, 1.34]],
    },
    foils: {
      box: 'wall', sil: ['rudder', 'board'],
      back: '<rect x="0" y="26" width="120" height="9" rx="2" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.2"/><rect x="0" y="118" width="120" height="9" rx="2" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1.2"/>' +
        [7, 33, 60, 87, 113].map(x => '<rect x="' + (x - 2) + '" y="22" width="4" height="17" fill="' + WOOD_D + '"/><rect x="' + (x - 2) + '" y="114" width="4" height="17" fill="' + WOOD_D + '"/>').join(''),
      slots: [[20, 66, 0.62], [46, 66, 0.62], [73, 66, 0.62], [100, 66, 0.62], [20, 158, 0.62], [46, 158, 0.62], [73, 158, 0.62], [100, 158, 0.62]],
    },
    ropes: {
      box: 'wall', sil: ['rope'],
      back: strip(2) + strip(70) + strip(138) + [32, 88].map(x => '<rect x="' + (x - 3) + '" y="8" width="6" height="16" rx="3" fill="' + WOOD_D + '"/><rect x="' + (x - 3) + '" y="76" width="6" height="16" rx="3" fill="' + WOOD_D + '"/><rect x="' + (x - 3) + '" y="144" width="6" height="16" rx="3" fill="' + WOOD_D + '"/>').join(''),
      slots: [[32, 44, 0.6], [88, 44, 0.6], [32, 112, 0.6], [88, 112, 0.6], [32, 180, 0.6], [88, 180, 0.6]],
    },
    box: {
      box: 'floor', sil: ['shackle', 'block'],
      back: '<rect x="10" y="6" width="110" height="20" rx="3" fill="#4a3018"/>',
      slots: [[30, 18, 0.42], [54, 13, 0.42], [78, 18, 0.42], [102, 13, 0.42]],
      front: '<rect x="6" y="20" width="118" height="60" rx="4" fill="#a0703f" stroke="' + WOOD_D + '" stroke-width="2"/><path d="M6 40h118M6 60h118" stroke="' + WOOD_D + '" stroke-width="1.6"/>' +
        '<circle cx="14" cy="30" r="1.8" fill="' + WOOD_D + '"/><circle cx="116" cy="30" r="1.8" fill="' + WOOD_D + '"/><circle cx="14" cy="70" r="1.8" fill="' + WOOD_D + '"/><circle cx="116" cy="70" r="1.8" fill="' + WOOD_D + '"/>',
    },
    lost: {
      box: 'floor', sil: ['sock', 'cap'],
      back: '<path d="M12 8h106l-2 14H14z" fill="#174a8a"/>',
      slots: [[34, 16, 0.44], [62, 12, 0.44], [92, 16, 0.44]],
      front: '<path d="M6 18h118l-8 62H14z" fill="#2f7fe0" stroke="#1d4f90" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 26h110" stroke="#5fa0f0" stroke-width="3"/>' +
        '<text x="65" y="66" font-size="34" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif" opacity=".9">?</text>',
    },
    bin: {
      box: 'floor', sil: [],
      back: '',
      slots: [],
      front: '<path d="M32 16h66l-6 64H38z" fill="#2c8a4a" stroke="#1b5a30" stroke-width="2.4" stroke-linejoin="round"/><path d="M48 26l2 46M65 26v46M82 26l-2 46" stroke="#1f6f3a" stroke-width="3"/>' +
        '<g class="shed-lid"><rect x="26" y="6" width="78" height="11" rx="4" fill="#1f6f3a" stroke="#14482a" stroke-width="2"/><rect x="56" y="1" width="18" height="7" rx="3" fill="#14482a"/></g>',
    },
  };
  const ART_BOX = { wall: [120, 206], floor: [130, 82] };
  // where a place's art sits inside its rect (under the label plate, whose height follows the label font size)
  function artTf(id, r, fs) {
    const A = PLACE_ART[id], B = ART_BOX[A.box], lh = Math.round(fs * 1.7);
    const s = Math.min((r.w - 6) / B[0], (r.h - lh - 6) / B[1]);
    return { s, lh, ax: (r.w - B[0] * s) / 2, ay: lh + 3 + (r.h - lh - 6 - B[1] * s) / (A.box === 'wall' ? 2 : 1) };
  }

  // ======================================================================== 5. layouts (wide: desktop / landscape; tall: portrait)
  // scene units; the wall meets the floor at wallY; the kid stands in the door and tosses things onto the floor rect
  // wide: W follows the screen (1000–1400), the wall places widen and the floor grows; tall: H follows the screen
  // (1100–1300), the room left over the places (T, for the HUD) and the extra height for the floor; things are drawn a
  // bit bigger (itemK) on the narrow screen
  function layoutOf(kind, W, H, fs, T) {
    const P = {};
    if (kind === 'wide') {
      const ws = Math.min(150, (W - 150) / 7 - 4);
      ['vests', 'hooks', 'sails', 'masts', 'booms', 'foils', 'ropes'].forEach((id, i) => { P[id] = { x: 16 + i * (ws + 4), y: 112, w: ws, h: 262 }; });
      P.box = { x: 14, y: 418, w: 152, h: 106 }; P.lost = { x: 14, y: 530, w: 152, h: 106 }; P.bin = { x: W - 148, y: 526, w: 140, h: 108 };
      return { kind, W, H, wallY: 400, P, door: { x: W - 126, y: 150, w: 116, h: 250 }, kid: { x: W - 70, y: 404, k: 1.22 },
        floor: { x0: 190, y0: 432, x1: W - 162, y1: 626 }, sign: { x: Math.round((16 + 7 * (ws + 4)) / 2), y: 40 }, itemK: 0.94, fs };
    }
    ['vests', 'hooks', 'sails', 'masts'].forEach((id, i) => { P[id] = { x: 8 + i * 148, y: T, w: 140, h: 268 }; });
    ['booms', 'foils', 'ropes'].forEach((id, i) => { P[id] = { x: 8 + i * 148, y: T + 278, w: 140, h: 232 }; });
    P.box = { x: 8, y: H - 118, w: 188, h: 112 }; P.lost = { x: 206, y: H - 118, w: 188, h: 112 }; P.bin = { x: 404, y: H - 118, w: 188, h: 112 };
    const wy = T + 514;
    return { kind, W: 600, H, wallY: wy, P, door: { x: 454, y: T + 262, w: 138, h: 252 }, kid: { x: 522, y: wy + 4, k: 1.22 },
      floor: { x0: 26, y0: wy + 24, x1: 574, y1: H - 132 }, sign: null, itemK: 1.2, fs };
  }

  function placeSvg(id, r, stored, fs) {
    const A = PLACE_ART[id], T = artTf(id, r, fs), s = T.s, ax = T.ax, ay = T.ay, lh = T.lh;
    const name = placeName(id), est = name.length * fs * 0.56, tl = est > r.w - 16 ? ' textLength="' + f(r.w - 16) + '" lengthAdjust="spacingAndGlyphs"' : '';
    return '<g class="shed-place" data-p="' + id + '" transform="translate(' + f(r.x) + ' ' + f(r.y) + ')" role="button" aria-label="' + esc(name) + '">' +
      '<rect class="shed-place-hit" x="0" y="0" width="' + f(r.w) + '" height="' + f(r.h) + '" rx="12"/>' +
      '<g transform="translate(' + f(ax) + ' ' + f(ay) + ') scale(' + f(s * 1000) / 1000 + ')">' + A.back + '<g class="shed-stored">' + storedSvg(id, stored) + '</g>' + (A.front || '') + '</g>' +
      '<g class="shed-label"><rect x="2" y="0" width="' + f(r.w - 4) + '" height="' + lh + '" rx="9"/><text x="' + f(r.w / 2) + '" y="' + f(lh * 0.71) + '" font-size="' + fs + '" text-anchor="middle"' + tl + '>' + esc(name) + '</text></g>' +
      '</g>';
  }
  // stored things fill the slots in order; empty slots show a dashed silhouette of what belongs there
  function storedSvg(id, stored) {
    const A = PLACE_ART[id];
    let s = '';
    A.slots.forEach((sl, j) => {
      const it = stored[j];
      const k = it ? it.k : A.sil[j % A.sil.length];
      const r = (A.rot && A.rot[k]) || 0, dy = (A.dy && A.dy[k]) || 0;
      s += '<g class="' + (it ? 'shed-in' : 'shed-sil') + '" transform="translate(' + sl[0] + ' ' + (sl[1] + dy) + ') rotate(' + r + ') scale(' + sl[2] + ') translate(-50 -50)">' + icon(k, it ? it.v : 0, 2) + '</g>';
    });
    // more than fit: they pile up on the first slots, a little offset
    for (let j = A.slots.length; A.slots.length && j < stored.length; j++) {
      const sl = A.slots[j % A.slots.length], it = stored[j], r = (A.rot && A.rot[it.k]) || 0, dy = (A.dy && A.dy[it.k]) || 0;
      s += '<g class="shed-in" transform="translate(' + (sl[0] + 4) + ' ' + (sl[1] + dy - 3) + ') rotate(' + r + ') scale(' + sl[2] + ') translate(-50 -50)">' + icon(it.k, it.v, 2) + '</g>';
    }
    return s;
  }
  function bgSvg(L) {
    const W = L.W, H = L.H, wy = L.wallY;
    let s = '<defs><linearGradient id="shWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e5034"/><stop offset="1" stop-color="#8d6a48"/></linearGradient>' +
      '<linearGradient id="shFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f897d"/><stop offset="1" stop-color="#b3ac9e"/></linearGradient>' +
      '<linearGradient id="shOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf9e"/><stop offset=".55" stop-color="#c9b6e6"/><stop offset=".56" stop-color="#5f8fc0"/><stop offset="1" stop-color="#3f6f9f"/></linearGradient>' +
      '<radialGradient id="shLamp" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="rgba(255,226,160,.35)"/><stop offset="1" stop-color="rgba(255,226,160,0)"/></radialGradient></defs>';
    // wall planks (reach well past the view box so a letterboxed screen never shows an edge)
    s += '<rect x="-2000" y="-2000" width="' + (W + 4000) + '" height="' + (wy + 2000) + '" fill="url(#shWall)"/>';
    let pl = '';
    for (let x = -2000; x < W + 2000; x += 42) pl += 'M' + x + ' -2000V' + wy;
    s += '<path d="' + pl + '" stroke="rgba(40,24,10,.32)" stroke-width="2"/>';
    s += '<rect x="-2000" y="-30" width="' + (W + 4000) + '" height="40" fill="#4c3524"/><path d="M-2000 10H' + (W + 2000) + '" stroke="#36251a" stroke-width="3"/>';
    // floor (concrete slabs) and the skirting board
    s += '<rect x="-2000" y="' + wy + '" width="' + (W + 4000) + '" height="2400" fill="url(#shFloor)"/>';
    let fl = '';
    for (let x = -2000; x < W + 2000; x += 160) fl += 'M' + x + ' ' + wy + 'L' + (x - 60) + ' ' + (wy + 2400);
    for (let y = wy + 90; y < wy + 2400; y += 120) fl += 'M-2000 ' + y + 'H' + (W + 2000);
    s += '<path d="' + fl + '" stroke="rgba(60,55,48,.22)" stroke-width="2"/>';
    s += '<rect x="-2000" y="' + (wy - 8) + '" width="' + (W + 4000) + '" height="10" fill="#5e4430"/>';
    // the lamp
    s += '<path d="M' + f(W / 2) + ' 10v26" stroke="#222" stroke-width="2"/><path d="M' + f(W / 2 - 22) + ' 50q22-22 44 0z" fill="#2a2f3a"/><circle cx="' + f(W / 2) + '" cy="52" r="7" fill="#ffe7a8"/>' +
      '<path d="M' + f(W / 2 - 300) + ' ' + (wy + 300) + 'L' + f(W / 2 - 24) + ' 50h48L' + f(W / 2 + 300) + ' ' + (wy + 300) + 'z" fill="url(#shLamp)"/>';
    // the door: open, looking out at the harbour at sunset
    const d = L.door;
    s += '<rect x="' + d.x + '" y="' + d.y + '" width="' + d.w + '" height="' + d.h + '" fill="url(#shOut)"/>';
    s += '<path d="M' + d.x + ' ' + f(d.y + d.h * 0.62) + 'h' + d.w + 'v8h-' + d.w + 'z" fill="rgba(255,255,255,.3)"/>';
    s += '<rect x="' + (d.x + 10) + '" y="' + f(d.y + d.h * 0.3) + '" width="4" height="' + f(d.h * 0.33) + '" fill="#e9eef5"/><rect x="' + (d.x + 40) + '" y="' + f(d.y + d.h * 0.22) + '" width="3" height="' + f(d.h * 0.41) + '" fill="#e9eef5"/>' +
      '<rect x="' + (d.x + 76) + '" y="' + f(d.y + d.h * 0.36) + '" width="3" height="' + f(d.h * 0.27) + '" fill="#e9eef5"/>';
    s += '<path d="M' + d.x + ' ' + f(d.y + d.h * 0.8) + 'h' + d.w + 'v' + f(d.h * 0.2) + 'h-' + d.w + 'z" fill="#a08870"/>';
    s += '<rect x="' + (d.x - 8) + '" y="' + (d.y - 10) + '" width="' + (d.w + 16) + '" height="12" rx="2" fill="#4c3524"/><rect x="' + (d.x - 8) + '" y="' + d.y + '" width="9" height="' + d.h + '" fill="#4c3524"/><rect x="' + (d.x + d.w - 1) + '" y="' + d.y + '" width="9" height="' + d.h + '" fill="#4c3524"/>';
    // a sign over the places (wide only)
    if (L.sign) {
      s += '<g transform="translate(' + L.sign.x + ' ' + L.sign.y + ') rotate(-1.5)"><rect x="-110" y="0" width="220" height="44" rx="8" fill="#ff7a3d" stroke="#8a3a14" stroke-width="3"/>' +
        '<text x="0" y="31" font-size="26" font-weight="900" text-anchor="middle" fill="#2a1406" font-family="system-ui, sans-serif" letter-spacing="2">KØS · SKURET</text></g>';
    }
    return s;
  }

  // ======================================================================== 6. the mode
  KOS.Modes.register('shed', { kind: 'dom', create(host, activity) { return createShed(host, activity); } });

  function createShed(host, activity) {
    const Pm = Object.assign({ level: 'tidy' }, LEVELS.tidy, activity.params || {});
    const assist = host.assist || 'easy';
    const easy = assist === 'easy', pro = assist === 'pro';
    const pace = easy ? 1.25 : pro ? 0.85 : 1;
    const LINGER = Pm.linger * (easy ? 1.3 : pro ? 0.8 : 1);
    const MAX = Pm.max + (easy ? 1 : 0);
    const PEN = easy ? 2 : pro ? 5 : 3;
    const rand = U.rng((Pm.seed || 1) * 7919 + 13);
    const GO_AT = 3; // seconds of calm (Peter's intro) before the first toss

    // ---- the plan: what lies on the floor at the start, and what gets tossed in, when
    const pool = POOLS[Pm.pool] || POOLS.basic;
    const plan = [];
    let last = null;
    for (let i = 0; i < Pm.n; i++) {
      let k = pool[Math.floor(rand() * pool.length)];
      if (k === last) k = pool[Math.floor(rand() * pool.length)];
      last = k;
      plan.push({ k, v: Math.floor(rand() * 4), coil: k === 'rope' && rand() < (Pm.tangle || 0) ? 0 : 2 });
    }
    const tossN = Pm.n - Pm.start;
    let at = GO_AT;
    for (let i = 0; i < plan.length; i++) {
      if (i < Pm.start) { plan[i].at = 0; continue; }
      const j = i - Pm.start, u = tossN > 1 ? j / (tossN - 1) : 0;
      // bursts: now and then the whole team comes in at once (three things in a quick row)
      const inBurst = Pm.burst && j > 3 && j % 8 >= 6;
      at += inBurst ? 0.3 : (Pm.i0 + (Pm.i1 - Pm.i0) * u) * pace;
      plan[i].at = at;
      if (Pm.burst && j > 3 && j % 8 === 6) plan[i].burst = true;
    }

    const S = {
      phase: 'play', clk: 0, time: 0, penalty: 0, mistakes: 0, scolds: 0, streak: 0, bestStreak: 0, doneN: 0, peak: 0,
      next: 0, sel: null, drag: null, kb: null, kbPlace: 0, yellCd: 0, messCd: 0, lastWarned: false, tips: {}, hudT: 0,
      endT: 0, result: null, finishing: false, tossT: 0, demoDone: false, botT: 0, interacted: false, ambT: 0, messN: 0,
    };
    const items = []; // {i, k, v, coil, state: 'fly'|'floor'|'held'|'gone', x, y, r, born, yelled, fly, el}
    const stored = {};
    PLACE_IDS.forEach(id => { stored[id] = []; });
    let autopilot = false;
    let L = null; // current layout
    const szOf = k => THINGS[k][3] * (L ? L.itemK : 1);

    // ---- DOM
    const rootEl = doc.createElement('div');
    rootEl.className = 'shed-root assist-' + assist;
    rootEl.innerHTML = '<svg class="shed-svg" preserveAspectRatio="xMidYMax meet" aria-hidden="false" role="application">' +
      '<g class="shed-static"></g><g class="shed-items"></g><g class="shed-fx"></g><g class="shed-top"></g></svg>' +
      '<div class="shed-keys"></div>';
    host.layer.appendChild(rootEl);
    const svg = rootEl.querySelector('svg');
    const staticG = svg.querySelector('.shed-static'), itemsG = svg.querySelector('.shed-items'), fxG = svg.querySelector('.shed-fx'), topG = svg.querySelector('.shed-top');
    rootEl.querySelector('.shed-keys').textContent = t('shed.keys');
    svg.setAttribute('aria-label', t('shed.intro.' + Pm.level));
    let kidG = null;
    const placeEl = {};

    const hud = KOS.UI.hud(host.layer, ['timer', { id: 'mess', icon: 'trash', labelKey: 'shed.hud.mess' }, { id: 'tidy', icon: 'check', labelKey: 'shed.hud.tidy' }]);
    hud.el.classList.add('shed-hud');
    const messCell = hud.el.querySelector('.hud-mess');

    function build(kind, W, H, fs, T) {
      L = layoutOf(kind, W, H, fs, T);
      L.T = T;
      svg.setAttribute('viewBox', '0 0 ' + L.W + ' ' + L.H);
      let s = bgSvg(L);
      PLACE_IDS.forEach(id => { s += placeSvg(id, L.P[id], stored[id], L.fs); });
      s += '<g class="shed-kid" transform="translate(' + L.kid.x + ' ' + L.kid.y + ') scale(' + L.kid.k + ')"></g>';
      staticG.innerHTML = s;
      rootEl.classList.toggle('is-tall', kind === 'tall');
      PLACE_IDS.forEach(id => { placeEl[id] = staticG.querySelector('[data-p="' + id + '"]'); });
      kidG = staticG.querySelector('.shed-kid');
      drawKid(false);
      refreshPlaces();
    }
    function drawKid(toss) {
      if (!kidG || !KOS.RigKit) return;
      kidG.innerHTML = KOS.RigKit.kidSvg(toss ? [-30, -98] : [-17, -39], true);
    }
    function redrawPlace(id) {
      const g = placeEl[id] && placeEl[id].querySelector('.shed-stored');
      if (g) g.innerHTML = storedSvg(id, stored[id]);
    }

    // ---- things
    function itemSvg(it) {
      const sz = szOf(it.k), k = sz / 100;
      return '<ellipse class="shed-shadow" cx="0" cy="' + f(sz * 0.3) + '" rx="' + f(sz * 0.38) + '" ry="' + f(sz * 0.1) + '"/>' +
        '<g class="shed-item-pop"><g transform="scale(' + f(k * 1000) / 1000 + ') translate(-50 -50)">' + hitSvg(it.k) + '<g class="shed-ico">' + icon(it.k, it.v, it.coil) + '</g></g></g>';
    }
    function makeEl(it) {
      const e = doc.createElementNS(SVGNS, 'g');
      e.setAttribute('class', 'shed-item');
      e.setAttribute('data-i', it.i);
      e.setAttribute('role', 'button');
      e.setAttribute('aria-label', thingName(it.k));
      e.innerHTML = itemSvg(it);
      itemsG.appendChild(e);
      it.el = e;
      place(it);
    }
    function place(it, x, y, sc) {
      it.el.style.transform = 'translate(' + f(x != null ? x : it.x) + 'px,' + f(y != null ? y : it.y) + 'px) rotate(' + f(it.r) + 'deg)' + (sc ? ' scale(' + sc + ')' : '');
    }
    function setCls(it) {
      if (!it.el) return;
      const c = 'shed-item' + (it.state === 'fly' ? ' is-fly' : '') + (it.state === 'held' ? ' is-held' : '') + (S.sel === it ? ' is-sel' : '') +
        (it.yelled && it.state === 'floor' ? ' is-stale' : '') + (it.k === 'rope' && it.coil < 2 ? ' is-tangled' : '');
      it.el.setAttribute('class', c);
    }
    const onFloor = () => items.filter(it => it.state === 'floor' || it.state === 'fly' || it.state === 'held');
    // a free spot on the floor: the best of a few random tries (farthest from the things already there)
    function freeSpot(sz) {
      const F = L.floor, m = sz * 0.44, my = Math.min(m, (F.y1 - F.y0) / 2 - 2);
      let best = null, bd = -1;
      for (let n = 0; n < 14; n++) {
        const x = F.x0 + m + rand() * Math.max(1, F.x1 - F.x0 - 2 * m), y = F.y0 + my + rand() * Math.max(1, F.y1 - F.y0 - 2 * my);
        let d = 1e9;
        onFloor().forEach(o => { d = Math.min(d, Math.hypot(o.x - x, o.y - y) - szOf(o.k) * 0.4); });
        if (d > bd) { bd = d; best = { x, y }; }
      }
      return best;
    }
    function spawn(p, flying) {
      const sz = szOf(p.k);
      const sp = freeSpot(sz);
      const it = { i: items.length, k: p.k, v: p.v, coil: p.coil, x: sp.x, y: sp.y, r: (rand() - 0.5) * 50, born: S.time, yelled: false, state: 'floor' };
      items.push(it);
      makeEl(it);
      if (flying) {
        const kx = L.kid.x - 30 * L.kid.k, ky = L.kid.y - 98 * L.kid.k;
        it.state = 'fly';
        it.fly = { t: 0, dur: reducedMotion() ? 0.01 : 0.7, x0: kx, y0: ky, r0: it.r - 360 * (rand() < 0.5 ? 1 : -1) };
        place(it, kx, ky);
        drawKid(true); S.tossT = 0.35;
        sfx('whoosh', { vol: 0.3, pitch: 1.1 + rand() * 0.3 });
      } else {
        it.born = LINGER * 0.4; // yesterday's mess: a little extra time before Peter notices
      }
      setCls(it);
      return it;
    }
    function land(it) {
      it.state = 'floor'; it.born = S.time; it.fly = null;
      place(it);
      setCls(it);
      sfx('bump', { vol: 0.3, pitch: 0.6 + rand() * 0.5 });
      checkMess();
    }

    // ---- places
    function refreshPlaces() {
      const held = S.drag && S.drag.active ? S.drag.it : null, cur = held || S.sel;
      PLACE_IDS.forEach(id => {
        const e = placeEl[id];
        if (!e) return;
        const right = cur && THINGS[cur.k][2] === id;
        e.classList.toggle('is-hot', !!(S.drag && S.drag.hot === id));
        // easy: the right place glows while you hold a thing; normal/pro: every place is a choice
        e.classList.toggle('is-hint', !!right && easy);
        e.classList.toggle('is-pick', !!cur);
        e.classList.toggle('is-kb', S.kb === 'place' && PLACE_IDS[S.kbPlace] === id);
      });
    }
    function placeAt(x, y) {
      for (const id of PLACE_IDS) {
        const r = L.P[id], m = 8;
        if (x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m) return id;
      }
      return null;
    }

    // ---- pointer: drag a thing to a place, or tap a thing then tap a place
    function svgXY(e) {
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      return { x: (e.clientX - m.e) / m.a, y: (e.clientY - m.f) / m.d, k: m.a };
    }
    function onDown(e) {
      interacted();
      if (S.phase !== 'play' || S.drag || (host.isPaused && host.isPaused())) return;
      if (e.button !== undefined && e.button > 0) return;
      const ie = e.target.closest && e.target.closest('.shed-item');
      const pe = !ie && e.target.closest && e.target.closest('.shed-place');
      const p = svgXY(e);
      if (ie) {
        const it = items[+ie.getAttribute('data-i')];
        if (!it || it.state !== 'floor') return;
        e.preventDefault();
        S.drag = { it, id: e.pointerId, x0: p.x, y0: p.y, ox: it.x - p.x, oy: it.y - p.y, sx: it.x, sy: it.y, active: false, touch: e.pointerType !== 'mouse', hot: null };
        try { svg.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        return;
      }
      if (pe && S.sel) { e.preventDefault(); attempt(S.sel, pe.getAttribute('data-p')); return; }
      if (S.sel) { S.sel = null; S.kb = null; refreshAll(); }
    }
    function onMove(e) {
      const d = S.drag;
      if (!d || e.pointerId !== d.id) return;
      const p = svgXY(e);
      if (!d.active) {
        if (Math.hypot(p.x - d.x0, p.y - d.y0) * (p.k || 1) < 7) return;
        d.active = true;
        d.it.state = 'held';
        if (S.sel && S.sel !== d.it) S.sel = null;
        S.kb = null;
        topG.appendChild(d.it.el);
        sfx('whoosh', { vol: 0.22, pitch: 1.5 });
        stopDemo(true);
      }
      e.preventDefault();
      // lift the thing above a finger so it stays visible
      const lift = d.touch ? 28 : 0;
      d.it.x = p.x + d.ox * 0.5; d.it.y = p.y + d.oy * 0.5 - lift;
      place(d.it, null, null, 1.12);
      const hot = placeAt(p.x, p.y);
      if (hot !== d.hot) { d.hot = hot; if (hot) sfx('tap', { vol: 0.3, pitch: 1.6 }); }
      setCls(d.it);
      refreshPlaces();
    }
    function onUp(e) {
      const d = S.drag;
      if (!d || e.pointerId !== d.id) return;
      S.drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      const it = d.it;
      if (!d.active) { tapThing(it); return; }
      const p = svgXY(e);
      itemsG.appendChild(it.el);
      it.state = 'floor';
      const hot = placeAt(p.x, p.y);
      if (hot && S.phase === 'play') { attempt(it, hot, { x: d.sx, y: d.sy }); return; }
      // let go somewhere else: it lands on the floor there (tidying up the heap is allowed)
      const F = L.floor, sz = szOf(it.k) * 0.4;
      it.x = U.clamp(it.x, F.x0 + sz, F.x1 - sz); it.y = U.clamp(it.y, F.y0 + Math.min(sz, (F.y1 - F.y0) / 2), F.y1 - Math.min(sz, (F.y1 - F.y0) / 2));
      it.el.classList.add('is-drop');
      place(it);
      setTimeout(() => { if (it.el) it.el.classList.remove('is-drop'); }, 260);
      setCls(it);
      refreshPlaces();
    }
    function onCancel(e) {
      const d = S.drag;
      if (!d || e.pointerId !== d.id) return;
      S.drag = null;
      itemsG.appendChild(d.it.el);
      d.it.state = 'floor'; d.it.x = d.sx; d.it.y = d.sy;
      place(d.it); setCls(d.it); refreshPlaces();
    }
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);

    function tapThing(it) {
      if (S.phase !== 'play' || it.state !== 'floor') return;
      if (it.k === 'rope' && it.coil < 2) { coil(it); return; }
      if (S.sel === it) { S.sel = null; S.kb = null; sfx('tap', { vol: 0.3, pitch: 0.9 }); }
      else { S.sel = it; sfx('tap', { vol: 0.5, pitch: 1.2 }); }
      refreshAll();
    }
    // tap-tap: a tangled rope is coiled in two taps
    function coil(it) {
      it.coil = Math.min(2, it.coil + 1);
      const ico = it.el.querySelector('.shed-ico');
      if (ico) ico.innerHTML = icon(it.k, it.v, it.coil);
      sfx('rope', { vol: 0.7, pitch: 0.9 + it.coil * 0.15 });
      it.el.classList.remove('is-coil'); it.el.getBoundingClientRect(); it.el.classList.add('is-coil');
      setTimeout(() => { if (it.el) it.el.classList.remove('is-coil'); }, 300);
      if (it.coil >= 2) { floatAt(t('shed.fx.coil'), it.x, it.y - 40, 'good'); sfx('coin', { vol: 0.3, pitch: 1.3 }); }
      setCls(it);
    }
    function refreshAll() { items.forEach(setCls); refreshPlaces(); }

    // ---- putting a thing away
    function attempt(it, placeId, from) {
      if (S.phase !== 'play' || !it || it.state === 'gone' || it.state === 'fly') return;
      interacted();
      const right = THINGS[it.k][2];
      if (placeId === right && it.k === 'rope' && it.coil < 2) {
        // a tangled rope is not a mistake: coil it first
        bounce(it, from);
        tip('tangle', 'shed.coach.tangle', null, true);
        return;
      }
      if (placeId !== right) { mistake(it, placeId, from); return; }
      store(it, placeId);
    }
    function bounce(it, from) {
      if (from) { it.x = from.x; it.y = from.y; }
      it.state = 'floor';
      it.el.classList.add('is-bounce');
      place(it);
      setTimeout(() => { if (it.el) it.el.classList.remove('is-bounce'); }, 420);
      setCls(it);
    }
    function mistake(it, placeId, from) {
      S.mistakes++; S.penalty += PEN; S.streak = 0;
      sfx('bump', { vol: 0.7, pitch: 0.7 });
      const r = L.P[placeId];
      floatAt(t('shed.fx.oops', { s: PEN }), r.x + r.w / 2, r.y + r.h / 2, 'bad');
      const pe = placeEl[placeId];
      if (pe) { pe.classList.remove('is-wrong'); pe.getBoundingClientRect(); pe.classList.add('is-wrong'); setTimeout(() => pe.classList.remove('is-wrong'), 500); }
      bounce(it, from);
      const right = THINGS[it.k][2];
      if (S.clk - (S.wrongAt || -9) > 3.5) {
        S.wrongAt = S.clk;
        KOS.UI.coach(easy ? t('shed.coach.wrongEasy', { thing: thingName(it.k), place: placeName(right) }) : t('shed.coach.wrong'), { pos: 'top', mood: 'oops', ms: 3000 });
      }
      if (!pro) { const re = placeEl[right]; if (re) { re.classList.remove('is-flash'); re.getBoundingClientRect(); re.classList.add('is-flash'); setTimeout(() => re.classList.remove('is-flash'), 1300); } }
      S.hudT = 0;
    }
    function store(it, placeId) {
      stopDemo(true);
      it.state = 'gone';
      if (S.sel === it) S.sel = null;
      S.kb = null;
      S.doneN++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      const A = PLACE_ART[placeId], r = L.P[placeId], n = stored[placeId].length;
      stored[placeId].push({ k: it.k, v: it.v });
      // fly into the place, then it appears in its slot
      const sl = A.slots.length ? A.slots[n % A.slots.length] : [65, 30, 0.5];
      const T = artTf(placeId, r, L.fs);
      const tx = r.x + T.ax + sl[0] * T.s, ty = r.y + T.ay + sl[1] * T.s;
      itemsG.appendChild(it.el);
      it.el.setAttribute('class', 'shed-item is-snap');
      it.x = tx; it.y = ty;
      place(it, tx, ty, 0.5);
      const e = it.el;
      setTimeout(() => { e.remove(); redrawPlace(placeId); if (placeId === 'bin' && placeEl.bin) { placeEl.bin.classList.remove('is-gulp'); placeEl.bin.getBoundingClientRect(); placeEl.bin.classList.add('is-gulp'); } }, reducedMotion() ? 0 : 260);
      it.el = null;
      const SND = { vests: 'zip', hooks: 'zip', sails: 'whoosh', masts: 'rigClick', booms: 'rigClick', foils: 'rigClick', ropes: 'rope', box: 'gear', lost: 'pop', bin: 'bump' };
      sfx(SND[placeId] || 'tap', { vol: 0.7 });
      setTimeout(() => sfx('coin', { vol: 0.35, pitch: 1 + Math.min(8, S.streak) * 0.06 }), 110);
      sparkle(tx, ty);
      floatAt(S.streak >= 3 ? t('shed.fx.streak', { n: S.streak }) : t('shed.fx.ok', { thing: thingName(it.k) }), tx, ty - 30, 'good');
      if (S.streak === 6) tip('streak', 'shed.coach.streak', 'wow');
      S.hudT = 0;
      refreshAll();
      checkWin();
    }

    // ---- Peter
    function yell(key, scold) {
      if (scold) S.scolds++;
      S.yellCd = 4.5;
      sfx('whistle', { vol: 0.55 });
      KOS.UI.coach(t(key), { pos: 'top', mood: 'yell', ms: 3400 });
      if (!reducedMotion()) { rootEl.classList.remove('is-shake'); void rootEl.offsetWidth; rootEl.classList.add('is-shake'); }
    }
    function tip(id, key, mood, again) {
      if (S.tips[id] && !again) return;
      if (again && S.clk - (S.tips[id] || -9) < 4) return;
      S.tips[id] = S.clk;
      KOS.UI.coach(t(key), { pos: 'top', mood: mood || 'oops', ms: 4200 });
    }
    function checkMess() {
      const n = onFloor().length;
      S.peak = Math.max(S.peak, n);
      if (n > MAX) { fail(); return; }
      if (n === MAX && !S.lastWarned) { S.lastWarned = true; yell('shed.yell.last', false); }
      if (n < MAX - 1) S.lastWarned = false;
    }

    // ---- juice (floating text in layer pixels, sparkles in the scene)
    function toLayer(x, y) {
      const m = svg.getScreenCTM(), lr = host.layer.getBoundingClientRect();
      if (!m) return { x: 0, y: 0 };
      return { x: x * m.a + m.e - lr.left, y: y * m.d + m.f - lr.top };
    }
    function floatAt(txt, x, y, kind) {
      const p = toLayer(x, y);
      const e = doc.createElement('div');
      e.className = 'rigging-float shed-float ' + (kind || '');
      e.textContent = txt;
      e.style.left = f(p.x) + 'px'; e.style.top = f(p.y) + 'px';
      host.layer.appendChild(e);
      setTimeout(() => e.remove(), 1200);
    }
    function sparkle(x, y) {
      let s = '';
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + rand() * 0.3, d = 30 + rand() * 22;
        s += '<g class="rgs-p" style="--dx:' + f(Math.cos(a) * d) + 'px;--dy:' + f(Math.sin(a) * d) + 'px;animation-delay:' + f(rand() * 60) + 'ms"><path d="M0 -6L1.7 -1.7L6 0L1.7 1.7L0 6L-1.7 1.7L-6 0L-1.7 -1.7Z" fill="' + (i % 2 ? '#ffd25e' : '#fff') + '"/></g>';
      }
      s += '<circle class="rgs-ring" r="10" fill="none" stroke="#ffd25e" stroke-width="3.5"/>';
      const e = doc.createElementNS(SVGNS, 'g');
      e.setAttribute('class', 'rig-sparkle');
      e.setAttribute('transform', 'translate(' + f(x) + ' ' + f(y) + ')');
      e.innerHTML = s;
      fxG.appendChild(e);
      setTimeout(() => e.remove(), 900);
    }

    // ---- the ghost-finger demo (rigging's): drag the first thing on the floor to its place
    let demo = null;
    function stopDemo(forGood) {
      if (forGood) S.demoDone = true;
      if (!demo) return;
      clearTimeout(demo.timer);
      demo.el.remove();
      demo = null;
    }
    function startDemo() {
      stopDemo();
      if (S.demoDone || autopilot || S.phase !== 'play' || !KOS.RigKit) return;
      const it = items.find(o => o.state === 'floor' && !(o.k === 'rope' && o.coil < 2));
      if (!it) return;
      const r = L.P[THINGS[it.k][2]], a = toLayer(it.x, it.y), b = toLayer(r.x + r.w / 2, r.y + r.h * 0.55);
      const still = reducedMotion();
      const el = KOS.RigKit.demoEl(a.x, a.y, b.x, b.y, '<svg viewBox="0 0 100 100">' + icon(it.k, it.v, 2) + '</svg>', t('shed.demo'), still);
      host.layer.appendChild(el);
      demo = { el };
      const mover = el.querySelector('.rgd-mover');
      if (!still && mover) mover.addEventListener('animationend', () => stopDemo(true));
      demo.timer = setTimeout(() => stopDemo(true), still ? 9000 : 8000);
    }
    function interacted() { S.interacted = true; if (demo || !S.demoDone) stopDemo(true); }

    // ---- keyboard: ←/→ choose a thing, Enter picks it up (or coils a tangled rope); ←/→ choose a place, Enter puts it there
    function onKey(e) {
      if (S.phase !== 'play' || (host.isPaused && host.isPaused())) return;
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const k = e.key;
      const nav = k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'd' || k === 'a';
      const ok = k === 'Enter' || k === ' ' || k === 'f';
      if (!nav && !ok && k !== 'Backspace' && k !== 'Delete') return;
      interacted();
      e.preventDefault();
      const dir = (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd') ? 1 : -1;
      if (k === 'Backspace' || k === 'Delete') { S.kb = null; refreshAll(); return; }
      if (S.kb === 'place' && S.sel && S.sel.state === 'floor') {
        if (nav) { S.kbPlace = (S.kbPlace + dir + PLACE_IDS.length) % PLACE_IDS.length; sfx('tap', { vol: 0.35, pitch: 1.3 }); refreshPlaces(); }
        else if (ok) { const it = S.sel; attempt(it, PLACE_IDS[S.kbPlace]); }
        return;
      }
      const list = items.filter(o => o.state === 'floor').sort((a, b) => a.x - b.x);
      if (!list.length) return;
      if (nav) {
        const ci = S.sel ? list.indexOf(S.sel) : -1;
        S.sel = list[ci < 0 ? (dir > 0 ? 0 : list.length - 1) : (ci + dir + list.length) % list.length];
        S.kb = null;
        sfx('tap', { vol: 0.4, pitch: 1.2 });
        refreshAll();
      } else if (ok) {
        if (!S.sel || S.sel.state !== 'floor') { S.sel = list[0]; refreshAll(); return; }
        if (S.sel.k === 'rope' && S.sel.coil < 2) { coil(S.sel); return; }
        S.kb = 'place';
        sfx('whoosh', { vol: 0.2, pitch: 1.5 });
        refreshPlaces();
      }
    }
    root.addEventListener('keydown', onKey);

    // ---- end of the run
    function fail() {
      if (S.phase !== 'play') return;
      S.phase = 'end'; S.endT = 0;
      cancelDrag();
      S.result = {
        stars: 0, success: false, score: S.doneN * 50, timeMs: Math.round((S.time + S.penalty) * 1000),
        stats: { 'shed.stat.items': S.doneN + ' / ' + Pm.n, 'shed.stat.oops': S.mistakes, 'shed.stat.scold': S.scolds },
        msgKey: 'shed.res.fail',
      };
      yell('shed.yell.fail', false);
      sfx('lose', { vol: 0.6 });
      rootEl.classList.add('is-failed');
    }
    function checkWin() {
      if (S.phase !== 'play' || S.next < plan.length || onFloor().length) return;
      S.phase = 'end'; S.endT = 0;
      const timeS = S.time + S.penalty;
      const allow3 = easy ? 2 : pro ? 0 : 1, allow2 = easy ? 5 : pro ? 2 : 3;
      const scold3 = easy ? 1 : 0;
      const stars = S.mistakes <= allow3 && S.scolds <= scold3 ? 3 : S.mistakes <= allow2 && S.scolds <= 3 ? 2 : 1;
      const score = Math.max(100, Math.round(1000 + Pm.n * 60 - S.mistakes * 80 - S.scolds * 120 - S.peak * 10));
      S.result = {
        stars, score, timeMs: Math.round(timeS * 1000), success: true,
        stats: { 'shed.stat.items': Pm.n, 'shed.stat.oops': S.mistakes, 'shed.stat.scold': S.scolds, 'shed.stat.peak': S.peak + ' / ' + MAX },
        msgKey: 'shed.res.ok', msgVars: { n: Pm.n, time: fmt(timeS * 1000), oops: S.mistakes },
      };
      KOS.UI.coach(t(stars >= 3 ? 'shed.coach.done3' : 'shed.coach.done'), { pos: 'top', mood: 'wow', ms: 5000 });
      sfx('cheer', { vol: 0.55 });
      if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* ignore */ } }
      rootEl.classList.add('is-done');
    }
    function cancelDrag() {
      if (!S.drag) return;
      const it = S.drag.it;
      S.drag = null;
      if (it.el) { itemsG.appendChild(it.el); it.state = 'floor'; place(it); setCls(it); }
    }
    function fmt(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

    // ---- layout
    function layout() {
      const w = host.layer.clientWidth || 1, h = host.layer.clientHeight || 1;
      const kind = w / h >= 0.95 ? 'wide' : 'tall';
      const W = kind === 'wide' ? Math.round(U.clamp(640 * w / h, 1000, 1400)) : 600;
      const H = kind === 'wide' ? 640 : Math.round(U.clamp(600 * h / w, 1100, 1300));
      const scale = Math.min(w / W, h / H);
      // labels stay readable on small screens (about 11 px at least); tall: room over the places for the HUD (~115 px)
      const fs = Math.round(U.clamp(11 / scale, 15, 20));
      const T = kind === 'wide' ? 0 : Math.round(U.clamp(118 / scale, 90, H - 900));
      if (L && L.kind === kind && L.W === W && L.H === H && L.fs === fs && L.T === T) return;
      const old = L;
      build(kind, W, H, fs, T);
      // things keep their spot relative to the floor
      if (old) {
        const a = old.floor, b = L.floor;
        items.forEach(it => {
          if (it.state === 'gone') return;
          it.x = b.x0 + (it.x - a.x0) / (a.x1 - a.x0) * (b.x1 - b.x0); it.y = b.y0 + (it.y - a.y0) / (a.y1 - a.y0) * (b.y1 - b.y0);
          if (it.fly) { it.fly.x0 = L.kid.x - 30 * L.kid.k; it.fly.y0 = L.kid.y - 98 * L.kid.k; }
          if (it.el) { it.el.innerHTML = itemSvg(it); place(it); }
        });
      }
    }
    const onResize = () => layout();
    root.addEventListener('resize', onResize);

    // ---- loop
    function update(dt) {
      S.clk += dt;
      if (S.phase === 'play') {
        if (S.clk >= GO_AT) S.time += dt;
        // toss the next things in
        while (S.next < plan.length && plan[S.next].at <= S.clk) {
          const p = plan[S.next++];
          if (p.burst) tip('burst', 'shed.coach.burst', 'oops');
          spawn(p, p.at > 0);
        }
        // flights
        items.forEach(it => {
          if (it.state !== 'fly') return;
          it.fly.t += dt;
          if (it.fly.t >= it.fly.dur) land(it);
        });
        if (S.phase !== 'play') return;
        if (S.tossT > 0 && (S.tossT -= dt) <= 0) drawKid(false);
        // Peter: a thing lying around too long, or the floor filling up
        S.yellCd -= dt; S.messCd -= dt;
        if (S.yellCd <= 0) {
          const n = onFloor().length;
          const stale = items.filter(it => it.state === 'floor' && !it.yelled && S.time - it.born > LINGER).sort((a, b) => a.born - b.born)[0];
          if (n >= Math.ceil(MAX * 0.75) && S.messCd <= 0) { S.messCd = 9; S.messN = (S.messN % 3) + 1; yell('shed.yell.mess' + S.messN, true); }
          else if (stale) { stale.yelled = true; setCls(stale); yell('shed.yell.' + THINGS[stale.k][2], true); }
        }
        if (autopilot && (S.botT -= dt) <= 0) { S.botT = 0.35; doNext(); }
        checkWin();
      } else if (S.phase === 'end') {
        S.endT += dt;
        if (!S.finishing && S.endT > (S.result && S.result.success ? 2.8 : 2.6)) { S.finishing = true; host.finish(S.result); }
      }
      if ((S.ambT -= dt) <= 0) { S.ambT = 0.5; try { KOS.Audio.ambient({ wind: 4, waves: 0.1, harbor: 0.6 }); } catch (e) { /* optional */ } }
      if ((S.hudT -= dt) <= 0) {
        S.hudT = 0.1;
        const n = onFloor().length, pct = Math.min(100, Math.round(n / MAX * 100));
        hud.update({ timer: (S.time + S.penalty) * 1000, custom: {
          mess: '<span class="shed-meter"><i style="width:' + pct + '%"></i></span>' + n + '<small>/' + MAX + '</small>',
          tidy: S.doneN + '<small>/' + Pm.n + '</small>' } });
        if (messCell) { messCell.classList.toggle('alert', n >= Math.ceil(MAX * 0.75)); messCell.classList.toggle('warn', n >= Math.ceil(MAX * 0.5)); }
        rootEl.classList.toggle('is-messy', n >= Math.ceil(MAX * 0.75));
      }
    }
    function render() {
      items.forEach(it => {
        if (it.state !== 'fly' || !it.el) return;
        const u = ease(Math.min(1, it.fly.t / it.fly.dur)), uu = Math.min(1, it.fly.t / it.fly.dur);
        const x = it.fly.x0 + (it.x - it.fly.x0) * uu, y = it.fly.y0 + (it.y - it.fly.y0) * uu - Math.sin(Math.PI * uu) * 120;
        const r = it.fly.r0 + (it.r - it.fly.r0) * u;
        it.el.style.transform = 'translate(' + f(x) + 'px,' + f(y) + 'px) rotate(' + f(r) + 'deg)';
      });
    }
    function destroy() {
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('resize', onResize);
      stopDemo(true);
      host.layer.querySelectorAll('.shed-float').forEach(n => n.remove());
      hud.destroy();
      rootEl.remove();
      try { KOS.Audio.ambient(null); } catch (e) { /* optional */ }
    }
    // test hook: put the oldest thing away (coiling a tangled rope first)
    function doNext() {
      if (S.phase !== 'play') return false;
      const it = items.filter(o => o.state === 'floor').sort((a, b) => a.born - b.born)[0];
      if (!it) return false;
      if (it.k === 'rope' && it.coil < 2) { coil(it); return true; }
      attempt(it, THINGS[it.k][2]);
      return true;
    }

    layout();
    // yesterday's mess is already on the floor
    while (S.next < plan.length && plan[S.next].at === 0) spawn(plan[S.next++], false);
    S.peak = onFloor().length;
    hud.update({ timer: 0, custom: { mess: '<span class="shed-meter"><i style="width:0%"></i></span>0<small>/' + MAX + '</small>', tidy: '0<small>/' + Pm.n + '</small>' } });

    return {
      start() {
        KOS.UI.coach(t('shed.intro.' + Pm.level), { pos: 'top', ms: 7000 });
        setTimeout(() => { if (!S.demoDone && !S.interacted) startDemo(); }, 900);
      },
      update, render, destroy,
      pause() { try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } cancelDrag(); },
      resume() {},
      onResize() { layout(); if (demo) startDemo(); },
      setAutopilot(on) { autopilot = !!on; if (autopilot) stopDemo(true); },
      skipIntro() { stopDemo(true); },
      doNext,
      state: S, items, plan,
      attempt: (i, placeId) => attempt(items[i], placeId),
      tap: i => tapThing(items[i]),
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
