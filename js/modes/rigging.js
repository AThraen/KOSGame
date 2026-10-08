// KØS SEJL — js/modes/rigging.js
// The 'rigging' mode (kind 'dom', hub area 'club'): rig and unrig every boat in the club ladder.
// A big side-view SVG of the boat (on its trolley at the slipway, or alongside the pontoon for keelboats) and the
// parts laid out on the ground (the "tray"). Drag a part onto its glowing spot on the boat (or tap it and press
// "Sæt på"/Enter). Order matters: wrong order = friendly coach hint + small time penalty. Tap any part (in the
// tray or on the boat) to learn its Danish and English name. When the boat is rigged it rolls down the slipway and
// sails off; when unrigged it is rinsed with fresh water and the sail is rolled (never folded!).
//
// Activity params: {cls: 'opti'|'tera'|'feva'|'zest'|'ilca'|'29er'|'hboat'|'j70', unrig: bool, seed}
// Test hooks on the instance: setAutopilot(on), skipIntro(), doNext(), state, steps.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const doc = root.document;

  // ======================================================================== 1. parts (names + what they are)
  // name.da / name.en are the part's Danish and English names (shown together in both languages); desc is per language.
  const PARTS = {
    vest: ['Redningsvest', 'Life jacket', 'Tag redningsvesten på, før du går ned til vandet – og lyn den helt op. Det er regel nummer ét. Sikkerhed først!', 'Put your life jacket on before you go down to the water – and zip it right up. That\'s rule number one. Safety first!'],
    optiRig: ['Mast med sejl og bom', 'Mast with sail and boom', 'I KØS bliver optimistens sejl siddende bundet til mast og bom. Hele riggen sættes i mastefoden på én gang – husk mastlåsen, så den ikke falder ud, hvis du kæntrer.', 'At KØS the Optimist\'s sail stays tied to the mast and boom. The whole rig goes into the mast step in one go – remember the mast clip so it can\'t fall out if you capsize.'],
    mast: ['Mast', 'Mast', 'Den lange stang, sejlet sidder på. Masten står i mastefoden – husk mastlåsen, så den ikke falder ud, hvis du kæntrer.', 'The tall pole the sail is set on. It stands in the mast step – remember the mast clip so it can\'t fall out if you capsize.'],
    mastBottom: ['Undermast', 'Bottom mast section', 'ILCA-masten er i to dele. Den nederste, tykke del står i mastefoden og kommer først.', 'The ILCA mast comes in two parts. The thick bottom section sits in the mast step and goes in first.'],
    mastTop: ['Topmast', 'Top mast section', 'Den tynde øverste del stikkes ned i undermasten. Den skal sidde helt i bund!', 'The thin top section slots into the bottom section. Push it all the way home!'],
    boom: ['Bom', 'Boom', 'Den vandrette stang langs sejlets underkant. Duk dig, når du vender og bommer!', 'The horizontal pole along the foot of the sail. Duck when you tack and gybe!'],
    sprit: ['Spryd', 'Sprit', 'Optimistens skrå stang. Den spænder sejlets øverste hjørne (piken) ud og strammes med sprydstrammeren.', 'The Optimist\'s diagonal pole. It holds the top corner of the sail (the peak) up and is tensioned with the sprit adjuster.'],
    sail: ['Storsejl', 'Mainsail', 'Bådens motor! Vinden i sejlet skubber og suger båden frem.', 'The boat\'s engine! Wind in the sail pushes and pulls the boat along.'],
    ties: ['Sejlbånd', 'Sail ties', 'Små snore, der binder sejlet til mast og bom. Bind dem med et råbåndsknob – lige stramme hele vejen.', 'Little strings that tie the sail to the mast and boom. Use a reef knot – equally tight all the way.'],
    mainsheet: ['Storskøde', 'Mainsheet', 'Tovet du trimmer sejlet med: hal ind og fier ud. Slå et ottetalsknob i enden, så det ikke smutter ud af blokken.', 'The rope you trim the sail with: pull in and ease out. Tie a figure-eight knot in the end so it can\'t slip out of the block.'],
    daggerboard: ['Sværd', 'Daggerboard', 'Pladen der stikker ned under båden, så den ikke driver sidelæns. Sæt det i sværdkassen ved slæbestedet, men hold det oppe – det skubbes først ned, når båden flyder. Træk det op igen, før du sejler ind på lavt vand.', 'The board under the boat that stops it sliding sideways. Put it in its case at the slipway but keep it up – push it down only once the boat floats. Pull it up again before you sail into shallow water.'],
    rudder: ['Ror og rorpind', 'Rudder and tiller', 'Roret styrer båden, og rorpinden er håndtaget. Sæt roret på agterspejlet ved slæbestedet med bladet oppe – bladet sænkes først, når du er i vandet, og hives op igen, før du kommer ind. Husk rorlåsen, så roret ikke falder af.', 'The rudder steers the boat and the tiller is its handle. Hang it on the transom at the slipway with the blade up – lower the blade only once you\'re in the water, and raise it again before you come in. Remember the rudder clip so it can\'t fall off.'],
    bailer: ['Øsekar', 'Bailer', 'Til at øse vand ud af båden. Bind det fast, så det ikke flyder væk, hvis du kæntrer.', 'For scooping water out of the boat. Tie it on so it doesn\'t float away if you capsize.'],
    paddle: ['Pagaj', 'Paddle', 'Dør vinden, padler du hjem. Den skal også bindes fast i båden.', 'If the wind dies, you paddle home. Tie it into the boat too.'],
    painter: ['Fangline', 'Painter', 'Tovet i stævnen. Bruges til at fortøje båden – eller til at blive slæbt hjem af RIB\'en.', 'The rope at the bow. Use it to tie the boat up – or to get towed home by the RIB.'],
    shrouds: ['Vant', 'Shrouds', 'Ståltrådene fra masten ned til bådens sider. De holder masten oppe fra siden.', 'The wires from the mast down to the sides of the boat. They hold the mast up sideways.'],
    forestay: ['Forstag', 'Forestay', 'Ståltråden fra masten ned til stævnen. Den holder masten, så den ikke vælter bagud.', 'The wire from the mast down to the bow. It stops the mast falling backwards.'],
    jib: ['Fok', 'Jib', 'Det lille forsejl foran masten. Den hjælper storsejlet og gør båden hurtigere.', 'The small sail in front of the mast. It helps the mainsail and makes the boat faster.'],
    jibsheets: ['Fokkeskøder', 'Jib sheets', 'To tove fra fokkens hjørne bagud gennem blokkene – ét til hver side.', 'Two ropes from the corner of the jib back through the blocks – one for each side.'],
    gennaker: ['Gennaker', 'Gennaker', 'Det store, farverige forsejl til slør og læns. Den pakkes klar, så den kan poppe op derude. Wiii!', 'The big colourful sail for reaching and running. Pack it ready so it can pop open out there. Wheee!'],
    chute: ['Strømpe', 'Chute', 'Røret i stævnen, som gennakeren trækkes ned i, når den ikke bruges.', 'The tube at the bow that the gennaker is pulled down into when it\'s not in use.'],
    kicker: ['Kicker', 'Kicker (vang)', 'Taljen fra bommen ned til masten. Den holder bommen nede, så sejlet ikke vrider sig.', 'The pulley system from the boom down to the mast. It holds the boom down so the sail doesn\'t twist.'],
    cunningham: ['Cunningham', 'Cunningham', 'Et tov ved sejlets forreste, nederste hjørne. Stram det i hård vind, så sejlet bliver fladere.', 'A rope at the front bottom corner of the sail. Pull it on in strong wind to flatten the sail.'],
    outhaul: ['Udhal', 'Outhaul', 'Trækker sejlets nederste bagerste hjørne ud mod enden af bommen. Stramt i hård vind, løsere i let vind.', 'Pulls the back bottom corner of the sail out along the boom. Tight in strong wind, looser in light wind.'],
    trapeze: ['Trapez', 'Trapeze wires', 'Wirer fra masten. Gasten hager sig fast med sin trapezsele og står helt ude på kanten. Sejt!', 'Wires from the mast. The crew hooks on with a harness and stands right out on the edge. Cool!'],
    wings: ['Vinger', 'Wings (racks)', '29\'erens rør-vinger ud over siderne, så du kan hænge længere ud og holde båden flad.', 'The 29er\'s tube racks out over the sides, so you can hike further out and keep the boat flat.'],
    pole: ['Bovspryd', 'Bowsprit', 'Stangen foran stævnen. Gennakerens forreste hjørne sidder yderst på den.', 'The pole sticking out in front of the bow. The gennaker\'s front corner is fixed to its tip.'],
    cover: ['Bomkapper', 'Boom cover', 'Overtrækket, der beskytter storsejlet mod sol og regn, mens båden ligger i havn.', 'The cover that protects the mainsail from sun and rain while the boat is in harbour.'],
    fenders: ['Fendere', 'Fenders', 'Bløde puder, der beskytter skroget mod broen. Ind med dem, når du er fri af broen – ud igen, før du lægger til.', 'Soft bumpers that protect the hull against the pontoon. Bring them in once clear – put them out again before you come alongside.'],
    lines: ['Fortøjninger', 'Mooring lines', 'Tovene, der holder båden fast til broen. Kast los, når alt andet er klar.', 'The ropes holding the boat to the pontoon. Cast off when everything else is ready.'],
    tiller: ['Rorpind', 'Tiller', 'Håndtaget på roret. Sæt den på rorhovedet og sæt splitten i.', 'The handle on the rudder. Fit it on the rudder head and put the pin in.'],
    halyard: ['Fald', 'Halyard', 'Tovet, der hejser sejlet op i masten. Sjaklen sættes i sejlets top (hovedet).', 'The rope that hoists the sail up the mast. The shackle clips onto the top of the sail (the head).'],
    hose: ['Ferskvand', 'Fresh water', 'Saltvand slider på beslag, tovværk og sejl. Skyl båden og sejlet med ferskvand efter hver tur.', 'Salt water wears out fittings, ropes and sails. Rinse the boat and sail with fresh water after every trip.'],
    roll: ['Rul sejlet', 'Roll the sail', 'Rul sejlet stramt fra toppen, ligesom en plakat. Så får det ingen knæk og holder meget længere.', 'Roll the sail up tightly from the top, like a poster. That way it gets no creases and lasts much longer.'],
    fold: ['Fold sejlet', 'Fold the sail', 'Folder du sejlet, får det skarpe knæk, som gør det svagere og langsommere.', 'Folding a sail makes sharp creases that weaken it and make it slower.'],
  };
  // job verbs per part when the generic "på / af" reads badly (keelboat jobs)
  const JOB = {
    da: { on: { sail: 'Hejs storsejlet', jib: 'Hejs fokken', fenders: 'Fendere ud', lines: 'Fortøj båden', cover: 'Bomkapper på', hose: 'Skyl med ferskvand', roll: 'Rul sejlet', fold: 'Fold sejlet', halyard: 'Fald på' },
      off: { sail: 'Storsejlet ned', jib: 'Fokken ned', fenders: 'Fendere ind', lines: 'Kast los', cover: 'Bomkapper af', halyard: 'Fald af' } },
    en: { on: { sail: 'Hoist the main', jib: 'Hoist the jib', fenders: 'Fenders out', lines: 'Tie up', cover: 'Boom cover on', hose: 'Rinse with fresh water', roll: 'Roll the sail', fold: 'Fold the sail', halyard: 'Halyard on' },
      off: { sail: 'Main down', jib: 'Jib down', fenders: 'Fenders in', lines: 'Cast off', cover: 'Boom cover off', halyard: 'Halyard off' } },
  };

  const strDa = { p: {}, job: JOB.da }, strEn = { p: {}, job: JOB.en };
  for (const k in PARTS) {
    const p = PARTS[k];
    strDa.p[k] = { da: p[0], en: p[1], desc: p[2] };
    strEn.p[k] = { da: p[0], en: p[1], desc: p[3] };
  }
  KOS.I18n.add('da', {
    rigging: Object.assign(strDa, {
      hud: { steps: 'Opgaver', oops: 'Fejl' },
      on: 'PÅ', off: 'AF', decoyTag: '?',
      btn: { on: 'Sæt på', off: 'Tag af', do: 'Gør det', close: 'Luk', wear: 'Tag den på', unwear: 'Tag den af' },
      keys: 'Træk en del op på båden · Tastatur: ←/→ vælg, Enter gør det',
      keysTouch: 'Træk op på båden ↑',
      demo: 'Træk!',
      trayTitle: 'Delene på jorden', trayTitleUnrig: 'Opgaver',
      intro: {
        rig: 'Nu rigger vi {boat} til! Først tager du redningsvesten på. Træk delene hen på båden – eller tryk på en del og vælg \'Sæt på\'. Rig altid med stævnen mod vinden.',
        rigKeel: 'Vi skal ud med {boat}! Først tager du redningsvesten på. Træk opgaverne hen på båden – eller tryk og vælg \'Gør det\' – i den rigtige rækkefølge.',
        unrig: 'Godt sejlet! Nu rigger vi {boat} af i den rigtige rækkefølge – træk delene hen på båden, eller tryk og vælg \'Tag af\'.',
        unrigKeel: 'Vi er tilbage ved broen med {boat}. Fortøj, tag sejlene ned i den rigtige rækkefølge og pak båden sammen. Træk opgaverne hen på båden.',
      },
      coach: {
        order: 'Hov! {part} må vente lidt. Først: {need}!',
        orderOff: 'Hov! {part} skal blive siddende lidt endnu. Først af: {need}!',
        orderMix: 'Ikke helt endnu! Først: {need}.',
        miss: 'Slip delen over den lysende cirkel – den bliver grøn, når du rammer.',
        streak: 'Du er en rigge-haj! 🦈',
        half: 'Halvvejs – godt gået!',
        last: 'Sidste opgave!',
        doneRig: 'Klar til at sejle! Ud på vandet med dig!',
        doneRigKeel: 'Alt er klar – kast los og sejl ud!',
        doneUnrig: 'Flot pakket! Båden er klar til næste tur.',
        fold: 'Nej nej – fold aldrig sejlet! Det får knæk. Vi ruller det, ligesom en plakat.',
      },
      decoy: {
        opti: 'Vores optimister har ingen pagaj med – træneren i RIB\'en passer på jer derude. Den bliver på land!',
        tera: 'En Tera har ikke trapez – den er alt for lille til at stå ude på kanten.',
        feva: 'Spryd hører til optimisten. En Feva har en almindelig bom.',
        zest: 'En Zest har ingen trapez. Den er en rolig træningsbåd.',
        ilca: 'En ILCA har ingen fok – den har kun ét sejl.',
        '29er': 'Spryd hører til optimisten, ikke en lynhurtig 29\'er!',
        hboat: 'En H-båd har intet sværd – den har en tung køl, der altid sidder fast.',
        j70: 'En J/70 har intet sværd – den har en køl med en tung bombe i bunden.',
      },
      fx: { ok: 'Sådan!', oops: 'Ups! +{s} sek', streak: 'Combo x{n}!', rinse: 'Skyllet!', roll: 'Rullet!', foils: 'Sværd og ror ned!' },
      keelRudder: 'Roret styrer båden, og rorpinden er håndtaget. På klubbens kølbåde bliver roret siddende hele sæsonen.',
      done: { packed: 'PAKKET' },
      res: {
        rig: '{boat} rigget til på {time} med {oops} fejl.',
        unrig: '{boat} rigget af og pakket på {time} med {oops} fejl.',
      },
      stat: { oops: 'Fejl', steps: 'Opgaver', penalty: 'Strafsekunder' },
    }),
  });
  KOS.I18n.add('en', {
    rigging: Object.assign(strEn, {
      hud: { steps: 'Jobs', oops: 'Oops' },
      on: 'ON', off: 'OFF', decoyTag: '?',
      btn: { on: 'Fit it', off: 'Take off', do: 'Do it', close: 'Close', wear: 'Put it on', unwear: 'Take it off' },
      keys: 'Drag a part onto the boat · Keyboard: ←/→ choose, Enter do it',
      keysTouch: 'Drag onto the boat ↑',
      demo: 'Drag!',
      trayTitle: 'Parts on the ground', trayTitleUnrig: 'Jobs',
      intro: {
        rig: 'Let\'s rig the {boat}! First, put your life jacket on. Drag the parts onto the boat – or tap a part and choose \'Fit it\'. Always rig with the bow into the wind.',
        rigKeel: 'We\'re taking the {boat} out! First, put your life jacket on. Drag the jobs onto the boat – or tap and choose \'Do it\' – in the right order.',
        unrig: 'Well sailed! Now unrig the {boat} in the right order – drag the parts onto the boat, or tap and choose \'Take off\'.',
        unrigKeel: 'We\'re back at the pontoon with the {boat}. Tie up, drop the sails in the right order and pack the boat away. Drag the jobs onto the boat.',
      },
      coach: {
        order: 'Oops! The {part} has to wait. First: {need}!',
        orderOff: 'Oops! The {part} has to stay on a bit longer. First off: {need}!',
        orderMix: 'Not quite yet! First: {need}.',
        miss: 'Let go over the glowing circle – it turns green when you\'re on it.',
        streak: 'You\'re a rigging shark! 🦈',
        half: 'Halfway – nice work!',
        last: 'Last job!',
        doneRig: 'Ready to sail! Off you go!',
        doneRigKeel: 'All set – cast off and sail out!',
        doneUnrig: 'Nicely packed! The boat is ready for next time.',
        fold: 'No no – never fold the sail! It gets creases. We roll it, like a poster.',
      },
      decoy: {
        opti: 'Our Optis don\'t carry a paddle – the coach in the RIB looks after you out there. It stays ashore!',
        tera: 'A Tera has no trapeze – it\'s far too small to stand out on the edge.',
        feva: 'A sprit belongs on the Optimist. A Feva has a normal boom.',
        zest: 'A Zest has no trapeze. It\'s a calm training boat.',
        ilca: 'An ILCA has no jib – it only has one sail.',
        '29er': 'A sprit belongs on the Optimist, not on a super-fast 29er!',
        hboat: 'An H-boat has no daggerboard – it has a heavy keel that is always there.',
        j70: 'A J/70 has no daggerboard – it has a keel with a heavy bulb at the bottom.',
      },
      fx: { ok: 'Nice!', oops: 'Oops! +{s} sec', streak: 'Combo x{n}!', rinse: 'Rinsed!', roll: 'Rolled!', foils: 'Board and rudder down!' },
      keelRudder: 'The rudder steers the boat and the tiller is its handle. On the club\'s keelboats the rudder stays on all season.',
      done: { packed: 'PACKED' },
      res: {
        rig: '{boat} rigged in {time} with {oops} mistakes.',
        unrig: '{boat} unrigged and packed in {time} with {oops} mistakes.',
      },
      stat: { oops: 'Mistakes', steps: 'Jobs', penalty: 'Penalty seconds' },
    }),
  });

  // ======================================================================== 2. rig sequences per class
  // [part, group, type?]  group: all steps of a lower group must be done first; same group = any order.
  // type 'off' = a removal job while rigging (sail cover off, cast off, fenders in).
  const RIG = {
    // KØS Optis are stored with the sail tied to mast and boom: the whole rig goes in at once, then the sprit
    // (no paddle: the club's Optis train with a RIB looking after them)
    opti: [['vest', 0], ['optiRig', 1], ['sprit', 2], ['mainsheet', 3],
      ['daggerboard', 4], ['rudder', 4], ['bailer', 4], ['painter', 4]],
    tera: [['vest', 0], ['mast', 1], ['sail', 2], ['boom', 3], ['outhaul', 4], ['kicker', 4], ['mainsheet', 5],
      ['daggerboard', 6], ['rudder', 6], ['painter', 6]],
    // KØS Fevas and 29ers keep the mast up all season (mast, shrouds, forestay: see KEEP_ON)
    feva: [['vest', 0], ['jib', 1], ['sail', 2], ['boom', 3], ['kicker', 4], ['mainsheet', 4],
      ['jibsheets', 4], ['chute', 5], ['pole', 6], ['gennaker', 7], ['daggerboard', 8], ['rudder', 8]],
    zest: [['vest', 0], ['mast', 1], ['shrouds', 2], ['forestay', 2], ['jib', 3], ['sail', 4], ['boom', 5], ['kicker', 6], ['mainsheet', 6],
      ['jibsheets', 6], ['daggerboard', 7], ['rudder', 7], ['painter', 7]],
    ilca: [['vest', 0], ['mastBottom', 1], ['mastTop', 2], ['sail', 3], ['boom', 4], ['outhaul', 5], ['kicker', 5], ['cunningham', 5],
      ['mainsheet', 6], ['daggerboard', 7], ['rudder', 7]],
    '29er': [['vest', 0], ['wings', 1], ['trapeze', 2], ['jib', 3], ['sail', 4], ['boom', 5],
      ['kicker', 6], ['cunningham', 6], ['jibsheets', 6], ['pole', 7], ['gennaker', 8], ['daggerboard', 9], ['rudder', 9]],
    // KØS H-boats keep rudder, tiller and halyards on in the harbour (see KEEP_ON): the jobs start with the cover
    // jib sheets go on before the jib is hoisted, or it flogs out of control
    hboat: [['vest', 0], ['cover', 1, 'off'], ['jibsheets', 2], ['sail', 2], ['jib', 3], ['lines', 4, 'off'], ['fenders', 5, 'off']],
    // KØS J70s are also kept rigged in the harbour (rudder + halyards on, see KEEP_ON)
    j70: [['vest', 0], ['cover', 1, 'off'], ['jibsheets', 2], ['sail', 2], ['jib', 3], ['pole', 4], ['gennaker', 5],
      ['lines', 6, 'off'], ['fenders', 7, 'off']],
  };
  // parts that stay rigged on the club's boats all season (drawn in place, never a job)
  const KEEP_ON = { hboat: ['rudder', 'tiller', 'halyard'], j70: ['rudder', 'tiller', 'halyard'], feva: ['mast', 'shrouds', 'forestay'], '29er': ['mast', 'shrouds', 'forestay'] };
  const DECOY = { opti: 'paddle', tera: 'trapeze', feva: 'sprit', zest: 'trapeze', ilca: 'jib', '29er': 'sprit', hboat: 'daggerboard', j70: 'daggerboard' };

  // side-view geometry per class (scene units; ground / waterline y = 0, bow points +x)
  const CFG = {
    opti: { L: 230, fb: 40, hull: 'pram', mastAt: 0.24, mastR: 1.0, boomH: 20, boomL: 196, sail: 'sprit', mw: 5 },
    tera: { L: 260, fb: 34, hull: 'dinghy', mastAt: 0.3, mastR: 1.2, boomH: 24, boomL: 188, sail: 'sleeve', battens: 0, mw: 5 },
    feva: { L: 300, fb: 38, hull: 'dinghy', mastAt: 0.4, mastR: 1.3, boomH: 34, boomL: 176, sail: 'tri', battens: 3, jib: { at: 0.03, h: 0.72, back: 0.95 }, mw: 6 },
    zest: { L: 300, fb: 42, hull: 'dinghy', mastAt: 0.38, mastR: 1.25, boomH: 34, boomL: 184, sail: 'tri', battens: 2, jib: { at: 0.04, h: 0.7, back: 0.9 }, mw: 6 },
    ilca: { L: 340, fb: 30, hull: 'dinghy', mastAt: 0.2, mastR: 1.32, boomH: 30, boomL: 272, sail: 'sleeve', battens: 3, mw: 6 },
    '29er': { L: 360, fb: 30, hull: 'skiff', mastAt: 0.38, mastR: 1.3, boomH: 40, boomL: 206, sail: 'square', battens: 5, jib: { at: 0.02, h: 0.72, back: 0.85 }, mw: 6, spreaders: true },
    hboat: { L: 440, fb: 52, hull: 'keel', keel: 'long', mastAt: 0.4, mastR: 1.12, boomH: 48, boomL: 226, sail: 'tri', battens: 3, jib: { at: 0.04, h: 0.78, back: 0.85 }, mw: 8, spreaders: true, cabin: true },
    j70: { L: 460, fb: 46, hull: 'keel', keel: 'bulb', mastAt: 0.38, mastR: 1.2, boomH: 46, boomL: 236, sail: 'square', battens: 4, jib: { at: 0.03, h: 0.82, back: 0.8 }, mw: 8, spreaders: true, cabin: true },
  };

  // ======================================================================== 3. activities
  const BOAT_STARS = (KOS.App && KOS.App.BOAT_STARS) || { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90 };
  const LADDER = ['opti', 'tera', 'feva', 'zest', 'ilca', '29er', 'hboat', 'j70'];
  const bname = id => { const b = KOS.Boats && KOS.Boats.get(id); return b ? b.name : id; };
  const UNRIG = ['opti', 'feva', 'ilca', 'j70'];
  const acts = [];
  LADDER.forEach((id, i) => {
    const n = bname(id), keel = !!CFG[id].keel;
    acts.push({
      id: 'rigging.' + id, order: 20 + i * 2, boat: id, icon: 'wrench', minutes: 2 + (RIG[id].length > 11 ? 1 : 0),
      difficulty: Math.min(5, 1 + Math.floor(i / 2)),
      unlock: i === 0 ? null : { stars: BOAT_STARS[id] || 0 },
      title: { da: 'Rig til · ' + n, en: 'Rig the ' + n },
      desc: keel ? { da: 'Gør ' + n + ' klar ved broen: sejl op, skøder gennem blokkene, fendere ind og kast los.', en: 'Get the ' + n + ' ready at the pontoon: sails up, sheets through the blocks, fenders in and cast off.' }
        : (KEEP_ON[id] || []).indexOf('mast') >= 0 ? { da: 'Masten står oppe hele sæsonen: sæt sejl, ror og sværd på ' + n + ' i den rigtige rækkefølge – så bakker du den ud i vandet.', en: 'The mast stays up all season: fit the sails, rudder and board on the ' + n + ' in the right order – then back her into the water.' }
        : { da: 'Sæt mast, sejl, ror og sværd på ' + n + ' i den rigtige rækkefølge – så bakker du den ud i vandet.', en: 'Fit the mast, sail, rudder and board on the ' + n + ' in the right order – then back her into the water.' },
      params: { cls: id, unrig: false, seed: 11 + i * 7 },
    });
    if (UNRIG.indexOf(id) >= 0) {
      acts.push({
        id: 'rigging.unrig.' + id, order: 21 + i * 2, boat: id, icon: 'wrench', minutes: 2, difficulty: Math.min(5, 1 + Math.floor(i / 2)),
        unlock: { after: 'rigging.' + id },
        title: { da: 'Rig af · ' + n, en: 'Unrig the ' + n },
        desc: { da: 'Tag alt af i den rigtige rækkefølge, skyl med ferskvand og rul sejlet – aldrig fold!', en: 'Take everything off in the right order, rinse with fresh water and roll the sail – never fold!' },
        params: { cls: id, unrig: true, seed: 101 + i * 7 },
      });
    }
  });
  KOS.Activities.add(acts.map(a => Object.assign({ mode: 'rigging', area: 'club' }, a)));

  // ======================================================================== helpers
  const f = n => Math.round(n * 10) / 10;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n, o) => { try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(n, o); } catch (e) { /* sound optional */ } };
  const lang = () => (KOS.I18n && KOS.I18n.lang) || 'da';
  const pname = (k, l) => t('rigging.p.' + k + '.' + (l || (lang() === 'en' ? 'en' : 'da')));
  const pother = k => t('rigging.p.' + k + '.' + (lang() === 'en' ? 'da' : 'en'));
  let keelJobs = false; // hoisting the sails is a keelboat job; on dinghies the card just shows the part
  function jobLabel(k, type) {
    const key = 'rigging.job.' + type + '.' + k;
    if ((k === 'sail' || k === 'jib') && !keelJobs) return pname(k);
    return KOS.I18n.has(key) ? t(key) : pname(k);
  }
  function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const tg = k < 0 ? 0 : 255, a = Math.abs(k);
    r = Math.round(r + (tg - r) * a); g = Math.round(g + (tg - g) * a); b = Math.round(b + (tg - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  const ln = (x1, y1, x2, y2, col, w, extra) => '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' + (extra || '') + '/>';
  const P = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('') + 'Z';
  const circ = (x, y, r, fill, stroke, w) => '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' : '') + '/>';
  const block = (x, y, r) => circ(x, y, r || 3.4, '#2a2f3a', '#9aa3b5', 1.2) + circ(x, y, (r || 3.4) * 0.35, '#c9d0db');
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const reducedMotion = () => { try { return !!(KOS.UI && KOS.UI.reduced && KOS.UI.reduced()); } catch (e) { return false; } };
  // a pointing hand, fingertip at (18, 1)
  const HAND_SVG = '<svg viewBox="0 0 40 50" aria-hidden="true"><path d="M14 5a4 4 0 0 1 8 0v15l1.5-.6a3.6 3.6 0 0 1 5 2.2l.4 1a3.6 3.6 0 0 1 5.4 2.4l.2 1.2a3.4 3.4 0 0 1 4 3.2V38q0 10-10 11h-9q-5.5 0-8.5-5.5L3.5 33a3.4 3.4 0 0 1 5.3-4.2L14 34z" fill="#fff" stroke="#1d2a44" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 21v8M28.5 23.5v6M34 27.5v4" stroke="#9aa3b5" stroke-width="1.6" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- the sailor (kid art, 100 units tall, feet at 0,0)
  const KID_H = { opti: 124, hboat: 98, j70: 102 }; // keelboat sailors drawn a bit big so they read at phone size
  const KID = { skin: '#f2c39b', skinD: '#c98d68', shirt: '#2fa7a0', shirtD: '#1d7570', pants: '#33508a', pantsD: '#23396a', shoe: '#262b33', hair: '#7a4a26' };
  // the arm on the -x side reaches to `hand` (local coords); the other arm hangs relaxed
  function kidUnder() {
    const K = KID;
    return '<ellipse cx="0" cy="-0.5" rx="20" ry="3" fill="rgba(0,0,0,.18)"/>' +
      '<path d="M-10 -35L-10 -5h7.5L-0.8 -29h1.6L3 -5h7.5L10 -35Z" fill="' + K.pants + '" stroke="' + K.pantsD + '" stroke-width="1" stroke-linejoin="round"/>' +
      '<ellipse cx="-7" cy="-3" rx="7" ry="3.6" fill="' + K.shoe + '"/><ellipse cx="7" cy="-3" rx="7" ry="3.6" fill="' + K.shoe + '"/>' +
      '<path d="M-6 -4.2h4M8 -4.2h4" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M-13 -64Q0 -69 13 -64L14.5 -33Q0 -30 -14.5 -33Z" fill="' + K.shirt + '" stroke="' + K.shirtD + '" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M-4 -52l4 -5 4 5 -4 5z" fill="#ffd25e" opacity=".9"/>';
  }
  function kidArm(sx, sy, ex, ey, hx, hy) {
    const K = KID, mx = sx + (ex - sx) * 0.6, my = sy + (ey - sy) * 0.6;
    return ln(sx, sy, ex, ey, K.skin, 5.4) + ln(ex, ey, hx, hy, K.skin, 5) + ln(sx, sy, mx, my, K.shirt, 7.4) + circ(hx, hy, 3.4, K.skin, K.skinD, 0.8);
  }
  function kidOver(hand) {
    const K = KID, h = hand || [-17, -39];
    // elbow: halfway, bent down/outwards a little
    const sx = -12.5, sy = -62, dx = h[0] - sx, dy = h[1] - sy, d = Math.hypot(dx, dy) || 1;
    const ex = sx + dx / 2 + (dy / d) * 4 * (dx < 0 ? 1 : -1), ey = sy + dy / 2 + Math.abs(dx / d) * 4;
    let s = kidArm(sx, sy, ex, ey, h[0], h[1]) + kidArm(12.5, -62, 16.5, -50.5, 17, -39);
    s += '<rect x="-3.6" y="-71" width="7.2" height="9" rx="3" fill="' + K.skin + '"/>';
    s += circ(-12.4, -80, 3, K.skin, K.skinD, 0.8) + circ(12.4, -80, 3, K.skin, K.skinD, 0.8);
    s += circ(0, -80, 12.5, K.skin, K.skinD, 0.9);
    s += '<path d="M-13 -79Q-14 -95 0 -94.5Q14 -95 13 -79Q11 -87 4 -88.5Q-2 -84 -9 -86Q-12 -83 -13 -79Z" fill="' + K.hair + '"/>';
    s += circ(-4.6, -79.5, 1.7, '#2a1d14') + circ(4.6, -79.5, 1.7, '#2a1d14') + circ(-4.1, -80.1, 0.6, '#fff') + circ(5.1, -80.1, 0.6, '#fff');
    s += '<ellipse cx="-8" cy="-75" rx="2.6" ry="1.6" fill="#ff8f7f" opacity=".5"/><ellipse cx="8" cy="-75" rx="2.6" ry="1.6" fill="#ff8f7f" opacity=".5"/>';
    s += '<path d="M-4 -74.5Q0 -71 4 -74.5" stroke="#7a2d22" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    return s;
  }
  // the orange buoyancy aid, zipped right up (drawn between the shirt and the arms)
  function kidVest() {
    return '<path d="M-15.5 -65.5Q-10 -70 -5.5 -67.5L0 -58L5.5 -67.5Q10 -70 15.5 -65.5L16.5 -35Q0 -31 -16.5 -35Z" fill="#ff7a1a" stroke="#a94415" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M-8.5 -62V-36M8.5 -62V-36" stroke="#e0620d" stroke-width="1.2"/>' +
      '<path d="M-16 -47H-3M3 -47H16" stroke="#e8eef5" stroke-width="2.4"/>' +
      '<path d="M0 -58V-33" stroke="#4a2408" stroke-width="1.8"/>' + '<rect x="-1.6" y="-59.5" width="3.2" height="4.6" rx="1" fill="#c9d0db" stroke="#4a2408" stroke-width=".6"/>' +
      '<path d="M-16.5 -39.5H16.5" stroke="#2a2f3a" stroke-width="2.8"/><rect x="-3" y="-41.8" width="6" height="4.6" rx="1" fill="#111"/>';
  }
  function kidTf(kd, dx, dy) { return 'translate(' + f(kd.x + (dx || 0)) + ' ' + f(kd.y + (dy || 0)) + ') scale(' + f(kd.flip ? -kd.k : kd.k) + ' ' + f(kd.k) + ')'; }

  // ---------------------------------------------------------------- geometry
  function geo(id) {
    const c = CFG[id], L = c.L, g = Object.assign({ id }, c);
    g.keelboat = c.hull === 'keel';
    g.xs = -L / 2; g.xb = L / 2;
    g.bot = g.keelboat ? 22 : -50;
    g.deck = g.bot - c.fb - (g.keelboat ? 22 : 0);
    g.sheer = c.hull === 'pram' ? 6 : 10;
    g.dAt = x => g.deck - (x - g.xs) / L * g.sheer;
    g.mx = g.xb - L * c.mastAt;
    g.mDeck = g.dAt(g.mx) - (c.cabin ? 14 : 0);
    g.mastH = L * c.mastR;
    g.top = g.mDeck - g.mastH;
    g.boomY = g.mDeck - c.boomH;
    g.boomX = g.mx - c.boomL;
    g.mid = g.mDeck - g.mastH * 0.5;
    if (c.jib) {
      g.jx = g.xb - L * c.jib.at; g.jDeck = g.dAt(g.jx) - 2;
      g.jHead = g.mDeck - g.mastH * c.jib.h;
      g.jcx = g.jx + (g.mx - g.jx) * 0.2 - (g.jx - g.mx) * c.jib.back; g.jcy = g.mDeck - 12;
    }
    g.hounds = g.mDeck - g.mastH * (c.jib ? c.jib.h : 0.78);
    g.dx = id === 'opti' ? g.mx - L * 0.16 : g.mx - L * 0.1;
    g.peak = { x: g.mx - c.boomL * 0.86, y: g.top - 8 };
    g.spritLow = { x: g.mx, y: g.boomY - 30 };
    // sail centroid-ish
    g.sailC = { x: g.mx - c.boomL * 0.33, y: g.boomY - (g.boomY - g.top) * 0.36 };
    g.ground = { x: g.keelboat ? g.xb - L * 0.3 : L * 0.05, y: g.keelboat ? g.dAt(g.xb - L * 0.3) - 6 : 52 };
    // the sailor: on dinghies standing at the bow holding the trolley handle (grip at xb+62, y -70);
    // on keelboats on the pontoon by the stern, waving. Kid art is 100 units tall (feet at 0), scaled by k.
    const kh = KID_H[id] || 112, kk = kh / 100;
    if (g.keelboat) g.kid = { x: g.xs - 40, y: -20, h: kh, k: kk, flip: true, hand: [-24, -76] };
    else g.kid = { x: g.xb + 62 + 30 * kk, y: 2, h: kh, k: kk, flip: false, hand: [-30, (-70 - 2) / kk] };
    g.kid.x0 = g.kid.x - 22 * kk; g.kid.x1 = g.kid.x + 22 * kk; // body extent (both sides, arms included)
    // view box (fully rigged, with room for the trolley handle / pole / rudder / sailor)
    const x0 = Math.min(g.xs - 80, g.kid.x0 - 16), x1 = Math.max(g.xb + (g.keelboat ? 110 : 100), g.kid.x1 + 16), y0 = g.top - 26, y1 = g.keelboat ? g.bot + L * 0.24 : 78;
    g.vb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    // slipway (dinghies): flat apron, then the ramp runs down into the water to the LEFT, so the boat is backed in stern first
    g.xW = g.xs - 150;
    g.waterY = 30;
    return g;
  }

  // ---------------------------------------------------------------- the hull (always drawn)
  function hullSvg(g, col, sailNo) {
    const { xs, xb, bot, L } = g, dS = g.dAt(xs), dB = g.dAt(xb);
    let d;
    if (g.hull === 'pram') d = 'M' + f(xs) + ' ' + f(dS) + 'L' + f(xb) + ' ' + f(dB) + 'L' + f(xb - 26) + ' ' + f(bot - 6) + 'Q' + f(0) + ' ' + f(bot + 6) + ' ' + f(xs + 8) + ' ' + f(bot - 4) + 'Z';
    else if (g.keelboat) d = 'M' + f(xs) + ' ' + f(dS) + 'L' + f(xb) + ' ' + f(dB) + 'C' + f(xb - 10) + ' ' + f(dB + g.fb * 0.5) + ' ' + f(xb - L * 0.12) + ' ' + f(bot - 4) + ' ' + f(xb - L * 0.3) + ' ' + f(bot) +
      'L' + f(xs + L * 0.22) + ' ' + f(bot - 2) + 'C' + f(xs + L * 0.08) + ' ' + f(bot - 6) + ' ' + f(xs + 10) + ' ' + f(2) + ' ' + f(xs + 3) + ' ' + f(dS + g.fb * 0.7) + 'Z';
    else d = 'M' + f(xs) + ' ' + f(dS) + 'L' + f(xb) + ' ' + f(dB) + 'C' + f(xb - 6) + ' ' + f(dB + g.fb * 0.45) + ' ' + f(xb - L * 0.12) + ' ' + f(bot) + ' ' + f(xb - L * 0.3) + ' ' + f(bot) +
      'L' + f(xs + L * 0.06) + ' ' + f(bot - 1) + 'L' + f(xs + 2) + ' ' + f(dS + g.fb * (g.hull === 'skiff' ? 0.85 : 0.75)) + 'Z';
    let s = '<defs><linearGradient id="rgHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + shade(col.hull, 0.18) + '"/><stop offset=".55" stop-color="' + col.hull + '"/><stop offset="1" stop-color="' + shade(col.hull, -0.22) + '"/></linearGradient></defs>';
    // keel + keelboat rudder (behind the hull edge)
    if (g.keel === 'long') {
      const a = g.mx + L * 0.02, b = g.mx - L * 0.3, depth = bot + L * 0.17;
      s += '<path d="M' + f(a) + ' ' + f(bot - 4) + 'L' + f(a - L * 0.1) + ' ' + f(depth) + 'L' + f(b + L * 0.03) + ' ' + f(depth) + 'L' + f(b) + ' ' + f(bot - 4) + 'Z" fill="#26364d" stroke="#16202f"/>';
      s += '<path d="M' + f(b - 2) + ' ' + f(bot - 2) + 'L' + f(b - 14) + ' ' + f(bot + 4) + 'L' + f(b - 10) + ' ' + f(depth - 6) + 'L' + f(b + L * 0.03) + ' ' + f(depth) + 'Z" fill="#2f4260" stroke="#16202f"/>';
    } else if (g.keel === 'bulb') {
      const a = g.mx - L * 0.06, depth = bot + L * 0.2;
      s += '<path d="M' + f(a) + ' ' + f(bot - 4) + 'L' + f(a - 8) + ' ' + f(depth) + 'L' + f(a - 34) + ' ' + f(depth) + 'L' + f(a - 34) + ' ' + f(bot - 4) + 'Z" fill="#2b2f36"/>';
      s += '<ellipse cx="' + f(a - 26) + '" cy="' + f(depth + 2) + '" rx="' + f(L * 0.1) + '" ry="9" fill="#2b2f36" stroke="#15181c"/>';
    }
    s += '<path d="' + d + '" fill="url(#rgHull)" stroke="' + shade(col.hull, -0.5) + '" stroke-width="2" stroke-linejoin="round"/>';
    // gunwale / rubbing strake + deck edge
    s += '<path d="M' + f(xs + 1) + ' ' + f(dS + 3) + 'L' + f(xb - 1) + ' ' + f(dB + 3) + '" stroke="' + (col.trim || '#ff7a3d') + '" stroke-width="4" stroke-linecap="round"/>';
    s += '<path d="M' + f(xs) + ' ' + f(dS - 1) + 'L' + f(xb) + ' ' + f(dB - 1) + '" stroke="' + shade(col.deck || '#eee', -0.1) + '" stroke-width="3" stroke-linecap="round"/>';
    // waterline boot stripe for keelboats
    if (g.keelboat) s += '<path d="M' + f(xs + 14) + ' ' + f(-2) + 'L' + f(xb - L * 0.1) + ' ' + f(-2) + '" stroke="' + (col.trim || '#1b2a41') + '" stroke-width="5" opacity=".85" stroke-linecap="round"/>';
    // highlight
    s += '<path d="M' + f(xs + 12) + ' ' + f(dS + 9) + 'L' + f(xb - 20) + ' ' + f(dB + 9) + '" stroke="rgba(255,255,255,.45)" stroke-width="2.5" stroke-linecap="round"/>';
    // cabin
    if (g.cabin) {
      const c0 = g.mx + L * 0.08, c1 = g.mx - L * 0.2, cy = g.dAt(g.mx);
      s += '<path d="M' + f(c1) + ' ' + f(cy + 1) + 'L' + f(c1 + 10) + ' ' + f(cy - 14) + 'L' + f(c0 - 16) + ' ' + f(cy - 14) + 'L' + f(c0) + ' ' + f(cy + 1) + 'Z" fill="' + (col.deck || '#eee') + '" stroke="' + shade(col.deck || '#ddd', -0.4) + '" stroke-width="1.5"/>';
      for (let i = 0; i < 3; i++) s += '<rect x="' + f(c1 + 22 + i * (c0 - c1 - 50) / 3) + '" y="' + f(cy - 10) + '" width="' + f((c0 - c1 - 70) / 3) + '" height="5" rx="2.5" fill="#1d2a44" opacity=".8"/>';
      // stern pulpit + stanchions
      s += '<path d="M' + f(xs + 4) + ' ' + f(dS) + 'L' + f(xs + 8) + ' ' + f(dS - 20) + 'L' + f(xs + 34) + ' ' + f(dS - 20) + 'L' + f(xs + 34) + ' ' + f(dS - 2) + '" stroke="#c9d0db" stroke-width="2" fill="none"/>';
    }
    // club sticker + sail number on the bow
    const sx = xb - L * (g.keelboat ? 0.2 : 0.22), sy = (g.dAt(sx) + Math.min(bot, g.dAt(sx) + g.fb)) / 2 + (g.keelboat ? 4 : 0);
    // the club's H-boats have 'KØS Sejlsport' in white along their red topsides
    if (col.id === 'hboat') { const mx2 = (xs + xb) / 2, my2 = (g.dAt(mx2) + Math.min(bot, g.dAt(mx2) + g.fb)) / 2 + 5; s += '<text x="' + f(mx2) + '" y="' + f(my2) + '" font-size="' + f(Math.max(12, g.fb * 0.5)) + '" font-weight="900" text-anchor="middle" fill="#fff" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">KØS Sejlsport</text>'; }
    s += '<rect x="' + f(sx - 17) + '" y="' + f(sy - 7) + '" width="34" height="14" rx="6" fill="#0f1729"/><text x="' + f(sx) + '" y="' + f(sy + 4.2) + '" font-size="10.5" font-weight="900" text-anchor="middle" fill="#fff" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">KØS</text>';
    if (sailNo && col.id !== 'hboat') s += '<text x="' + f(sx - L * 0.2) + '" y="' + f(sy + 4) + '" font-size="11" font-weight="900" text-anchor="middle" fill="' + shade(col.hull, -0.55) + '" opacity=".75" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">' + esc(sailNo) + '</text>';
    return s;
  }

  function trolleySvg(g) {
    const { L } = g, wx = -L * 0.06;
    let s = '';
    s += ln(g.xs + L * 0.18, -36, g.xb - L * 0.16, -36, '#9aa6b4', 5);
    s += ln(g.xs + L * 0.22, -36, g.xs + L * 0.22, -47, '#9aa6b4', 4) + ln(g.xb - L * 0.24, -36, g.xb - L * 0.24, -47, '#9aa6b4', 4);
    s += '<rect x="' + f(g.xs + L * 0.22 - 14) + '" y="-51" width="28" height="6" rx="3" fill="#262b33"/><rect x="' + f(g.xb - L * 0.24 - 14) + '" y="-51" width="28" height="6" rx="3" fill="#262b33"/>';
    s += ln(wx, -18, wx - 14, -36, '#9aa6b4', 4) + ln(wx, -18, wx + 14, -36, '#9aa6b4', 4);
    s += ln(g.xb - L * 0.16, -36, g.xb + 62, -70, '#9aa6b4', 5) + ln(g.xb + 58, -76, g.xb + 66, -64, '#262b33', 8);
    // wheels (pair: far one darker)
    s += circ(wx + 10, -18, 18, '#1b1f26') + circ(wx, -18, 18, '#2a2f38', '#14171c', 2) + circ(wx, -18, 8, '#c9d0db', '#7d8794', 1.5) + circ(wx, -18, 2.5, '#5b6470');
    return s;
  }

  // ---------------------------------------------------------------- parts (installed state), per key
  // Each returns an SVG string in scene units. `st` = {flyGennaker} for the sail-off.
  const SPAR = '#b8c3cf', SPAR_D = '#5b6470';
  function sparLine(x1, y1, x2, y2, w) { return ln(x1, y1, x2, y2, SPAR_D, w + 2.4) + ln(x1, y1, x2, y2, SPAR, w) + ln(x1, y1, x2, y2, 'rgba(255,255,255,.55)', Math.max(1, w * 0.3)); }
  function mainShape(g) {
    const { mx, top, boomY, boomX } = g, L = g.boomL;
    if (g.sail === 'sprit') {
      return 'M' + f(mx - 3) + ' ' + f(boomY - 2) + 'L' + f(mx - 3) + ' ' + f(top + 10) + 'L' + f(g.peak.x) + ' ' + f(g.peak.y) +
        'Q' + f(boomX + 6) + ' ' + f((g.peak.y + boomY) / 2) + ' ' + f(boomX + 4) + ' ' + f(boomY - 2) + 'Z';
    }
    if (g.sail === 'square') {
      return 'M' + f(mx - 3) + ' ' + f(boomY - 2) + 'L' + f(mx - 3) + ' ' + f(top + 4) + 'L' + f(mx - L * 0.34) + ' ' + f(top + 12) +
        'Q' + f(boomX - L * 0.08) + ' ' + f((top + boomY) / 2) + ' ' + f(boomX + 4) + ' ' + f(boomY - 2) + 'Z';
    }
    return 'M' + f(mx - 3) + ' ' + f(boomY - 2) + 'L' + f(mx - 3) + ' ' + f(top + 4) + 'Q' + f(boomX - L * 0.14) + ' ' + f((top + boomY) / 2 + 10) + ' ' + f(boomX + 4) + ' ' + f(boomY - 2) + 'Z';
  }
  const INS = { opti: '⛵', tera: 'T', feva: 'F', zest: 'Z', ilca: '▽', '29er': '29', hboat: 'H', j70: 'J/70' };
  function jibPts(g) { return [[g.jx, g.jDeck], [g.mx - 3, g.jHead], [g.jcx, g.jcy]]; }

  const DRAW = {
    mast(g) {
      const w = g.mw;
      return '<rect x="' + f(g.mx - w / 2 - 1.2) + '" y="' + f(g.top - 1) + '" width="' + f(w + 2.4) + '" height="' + f(g.mDeck - g.top + 1) + '" rx="' + f(w / 2) + '" fill="' + SPAR_D + '"/>' +
        '<rect x="' + f(g.mx - w / 2) + '" y="' + f(g.top) + '" width="' + w + '" height="' + f(g.mDeck - g.top) + '" rx="' + f(w / 2) + '" fill="' + SPAR + '"/>' +
        ln(g.mx - w * 0.15, g.top + 4, g.mx - w * 0.15, g.mDeck - 2, 'rgba(255,255,255,.6)', 1.2) +
        (g.keelboat ? '' : '<path d="M' + f(g.mx) + ' ' + f(g.top) + 'v-14l-16 4z" fill="#e8323c" class="rig-flag"/>');
    },
    mastBottom(g) {
      const w = g.mw + 1;
      return '<rect x="' + f(g.mx - w / 2 - 1.2) + '" y="' + f(g.mid - 1) + '" width="' + f(w + 2.4) + '" height="' + f(g.mDeck - g.mid + 1) + '" rx="3" fill="' + SPAR_D + '"/>' +
        '<rect x="' + f(g.mx - w / 2) + '" y="' + f(g.mid) + '" width="' + w + '" height="' + f(g.mDeck - g.mid) + '" rx="3" fill="#a9b5c2"/>' + ln(g.mx - 1, g.mid + 4, g.mx - 1, g.mDeck - 2, 'rgba(255,255,255,.55)', 1.2);
    },
    mastTop(g) {
      const w = g.mw - 1.5;
      return '<rect x="' + f(g.mx - w / 2 - 1) + '" y="' + f(g.top - 1) + '" width="' + f(w + 2) + '" height="' + f(g.mid - g.top + 12) + '" rx="2.5" fill="' + SPAR_D + '"/>' +
        '<rect x="' + f(g.mx - w / 2) + '" y="' + f(g.top) + '" width="' + w + '" height="' + f(g.mid - g.top + 10) + '" rx="2" fill="#cdd6df"/>' +
        '<path d="M' + f(g.mx) + ' ' + f(g.top) + 'v-14l-16 4z" fill="#e8323c" class="rig-flag"/>';
    },
    // KØS Opti: mast, sail and boom go in as one rig (the sail stays tied on with the sail ties)
    optiRig(g, col, o) { return DRAW.sail(g, col, o) + DRAW.ties(g) + DRAW.mast(g) + DRAW.boom(g); },
    boom(g) { return sparLine(g.mx - 2, g.boomY, g.boomX, g.boomY, g.mw - 1) + circ(g.mx - 3, g.boomY, 3.2, '#2a2f3a'); },
    sprit(g) { return sparLine(g.spritLow.x - 2, g.spritLow.y, g.peak.x + 4, g.peak.y + 3, 3); },
    sail(g, col, o) {
      const d = mainShape(g), sc = col.sail || '#fff';
      let s = '<defs><linearGradient id="rgSail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + shade(sc, -0.12) + '"/><stop offset=".55" stop-color="' + sc + '"/><stop offset="1" stop-color="' + shade(sc, -0.08) + '"/></linearGradient></defs>';
      s += '<path d="' + d + '" fill="url(#rgSail)" stroke="' + shade(sc, -0.4) + '" stroke-width="1.6" stroke-linejoin="round"/>';
      // seams
      for (let i = 1; i < 5; i++) { const y = g.boomY - (g.boomY - g.top) * i / 5; s += ln(g.mx - 3, y, g.mx - 3 - g.boomL * (1 - i / 5) * 0.95, y + 10, 'rgba(60,70,90,.12)', 1); }
      for (let i = 1; i <= (g.battens || 0); i++) {
        const k = i / (g.battens + 1), y = g.top + (g.boomY - g.top) * k, xr = g.mx - 3 - g.boomL * (g.sail === 'square' ? 0.3 + 0.7 * k : k) - (g.sail === 'square' ? 8 : 4);
        s += ln(xr + 4, y, xr + 4 + g.boomL * 0.28, y - 2, 'rgba(40,50,70,.35)', 2);
      }
      if (g.sail === 'sleeve') s += '<rect x="' + f(g.mx - g.mw / 2 - 3) + '" y="' + f(g.top + 2) + '" width="' + f(g.mw + 6) + '" height="' + f(g.boomY - g.top) + '" rx="4" fill="' + shade(sc, -0.05) + '" stroke="' + shade(sc, -0.35) + '" stroke-width="1.2"/>';
      const ix = g.mx - g.boomL * 0.36, fs = Math.max(12, g.boomL * 0.12);
      s += '<text x="' + f(ix) + '" y="' + f(g.top + (g.boomY - g.top) * 0.36) + '" font-size="' + f(fs * (INS[g.id].length > 2 ? 0.8 : 1)) + '" font-weight="900" text-anchor="middle" fill="' + (col.trim || '#1f6fb2') + '" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">' + INS[g.id] + '</text>';
      if (o && o.sailNo) s += '<text x="' + f(ix) + '" y="' + f(g.top + (g.boomY - g.top) * 0.62) + '" font-size="' + f(fs * 0.78) + '" font-weight="900" text-anchor="middle" fill="#1d2a44" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">' + esc(o.sailNo) + '</text>';
      return s;
    },
    ties(g) {
      let s = '';
      for (let i = 0; i < 6; i++) { const y = g.boomY - 12 - (g.boomY - g.top - 22) * i / 5; s += ln(g.mx - 7, y, g.mx + 5, y - 3, '#e8323c', 2.4) + circ(g.mx + 5, y - 3, 1.6, '#b81f28'); }
      for (let i = 0; i < 4; i++) { const x = g.mx - 22 - (g.boomL - 34) * i / 3; s += ln(x, g.boomY - 6, x + 2, g.boomY + 5, '#e8323c', 2.4) + circ(x + 2, g.boomY + 5, 1.6, '#b81f28'); }
      return s;
    },
    mainsheet(g) {
      const bx = g.boomX + g.boomL * 0.1, dy = g.dAt(bx) - 4;
      return ln(bx - 3, g.boomY + 3, bx - 3, dy, '#24395c', 1.6) + ln(bx + 3, g.boomY + 3, bx + 3, dy, '#24395c', 1.6) +
        block(bx, g.boomY + 4) + block(bx, dy) + '<path d="M' + f(bx + 3) + ' ' + f(dy) + 'q14 2 22 -6t18 -2" stroke="#24395c" stroke-width="1.8" fill="none"/>';
    },
    daggerboard(g, col, o) {
      // raised in its case on land; pushed down (o.down 0..1) once the boat floats
      const dy = g.dAt(g.dx) + (g.keelboat ? 0 : 44 * ((o && o.down) || 0));
      return '<rect x="' + f(g.dx - 8) + '" y="' + f(dy - 44) + '" width="16" height="70" rx="5" fill="#f4f6f8" stroke="#7d8794" stroke-width="1.5"/>' +
        '<rect x="' + f(g.dx - 4) + '" y="' + f(dy - 38) + '" width="8" height="9" rx="3" fill="#7d8794"/>';
    },
    rudder(g, col, o) {
      const xs = g.xs, dS = g.dAt(xs), bladeBot = g.keelboat ? g.bot + g.L * 0.12 : Math.min(-8, g.bot + 34);
      // dinghies: hung on the transom with the blade pulled up; lowered (o.down 0..1) once afloat
      const up = g.keelboat ? 0 : 1 - ((o && o.down) || 0);
      let s = '';
      if (!g.keelboat) s += '<rect x="' + f(xs - 9) + '" y="' + f(dS - 10) + '" width="10" height="' + f(g.fb * 0.62) + '" rx="3" fill="#dfe4ea" stroke="#7d8794" stroke-width="1.3"/>';
      s += '<path d="M' + f(xs - 3) + ' ' + f(dS - 8) + 'L' + f(xs - 7) + ' ' + f(dS - 8) + 'L' + f(xs - 10) + ' ' + f(bladeBot - 20) + 'Q' + f(xs - 22) + ' ' + f(bladeBot) + ' ' + f(xs - 4) + ' ' + f(bladeBot) + 'L' + f(xs + 3) + ' ' + f(dS + 10) + 'Z" fill="#f4f6f8" stroke="#7d8794" stroke-width="1.5" stroke-linejoin="round"' +
        (up ? ' transform="translate(0 ' + f(-(bladeBot - g.bot + 4) * up) + ')"' : '') + '/>';
      s += ln(xs - 4, dS - 8, xs + g.L * 0.3, dS - 14, '#c58b4f', 4.5) + ln(xs - 4, dS - 8, xs + g.L * 0.3, dS - 14, 'rgba(255,255,255,.35)', 1.2);
      if (g.id !== 'opti') s += ln(xs + g.L * 0.3, dS - 14, xs + g.L * 0.45, dS - 34, '#2a2f3a', 2.2) + circ(xs + g.L * 0.45, dS - 34, 3, '#2a2f3a');
      return s;
    },
    tiller(g) {
      const xs = g.xs, dS = g.dAt(xs);
      return ln(xs + 6, dS - 4, xs + g.L * 0.24, dS - 14, '#c58b4f', 5) + ln(xs + 6, dS - 4, xs + g.L * 0.24, dS - 14, 'rgba(255,255,255,.35)', 1.4) +
        ln(xs + g.L * 0.24, dS - 14, xs + g.L * 0.34, dS - 30, '#2a2f3a', 2.2) + circ(xs + 6, dS - 4, 3, '#5b6470');
    },
    bailer(g) {
      const x = g.mx - g.L * 0.34, y = g.dAt(x) - 4;
      return '<path d="M' + f(x - 9) + ' ' + f(y + 12) + 'l3 -13h14l3 13z" fill="#ff7a3d" stroke="#a94415" stroke-width="1.2" transform="rotate(-14 ' + f(x) + ' ' + f(y) + ')"/>' +
        '<path d="M' + f(x + 6) + ' ' + f(y - 4) + 'q8 -6 14 2" stroke="#ffd25e" stroke-width="1.6" fill="none"/>';
    },
    // the life jacket goes on the sailor (its group sits inside the sailor's scaled group, see createRigging)
    vest() { return kidVest(); },
    // the sailor aboard (sail-off): sitting in the cockpit, the hull hides the legs
    crew(g) {
      const kd = g.kid, x = g.xs + g.L * (g.keelboat ? 0.16 : 0.3), y = g.dAt(x) + kd.h * 0.36;
      return '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + f(kd.k) + ')">' + kidUnder() + kidVest() + kidOver([-22, -56]) + '</g>';
    },
    paddle(g) {
      const x = g.xs + g.L * 0.34, y = g.dAt(x);
      return ln(x, y + 14, x - 26, y - 30, '#c58b4f', 4) + '<ellipse cx="' + f(x - 30) + '" cy="' + f(y - 36) + '" rx="5.5" ry="11" fill="#2b6cb0" stroke="#163d66" transform="rotate(-30 ' + f(x - 30) + ' ' + f(y - 36) + ')"/>';
    },
    painter(g) {
      const x = g.xb, y = g.dAt(x) + 4;
      return circ(x - 2, y, 2.6, '#5b6470') + '<path d="M' + f(x - 2) + ' ' + f(y) + 'q10 8 4 22q-4 10 -18 6q-12 -4 -4 -10q10 -6 14 2" stroke="#ffd25e" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    },
    shrouds(g) {
      const ch = g.mx - 12, cy = g.dAt(ch);
      let s = ln(g.mx, g.hounds, ch, cy, 'rgba(70,80,95,.9)', 1.3) + ln(g.mx, g.hounds, ch - 5, cy + 1, 'rgba(70,80,95,.5)', 1.1);
      if (g.spreaders) s += ln(g.mx, (g.hounds + g.mDeck) / 2, g.mx - 9, (g.hounds + g.mDeck) / 2 + 2, SPAR_D, 2.4);
      return s;
    },
    forestay(g) {
      const fx = g.jx || g.xb - 4, fy = g.jDeck || g.dAt(g.xb);
      return ln(fx, fy, g.mx, g.hounds, 'rgba(70,80,95,.9)', 1.3) + circ(fx, fy, 2.2, '#5b6470');
    },
    jib(g, col) {
      const p = jibPts(g), sc = col.sail || '#fff';
      return '<path d="M' + f(p[0][0]) + ' ' + f(p[0][1]) + 'L' + f(p[1][0]) + ' ' + f(p[1][1]) + 'Q' + f(p[2][0] + 10) + ' ' + f((p[1][1] + p[2][1]) / 2 + 20) + ' ' + f(p[2][0]) + ' ' + f(p[2][1]) + 'Z" fill="' + shade(sc, -0.04) + '" stroke="' + shade(sc, -0.4) + '" stroke-width="1.4" stroke-linejoin="round"/>' +
        ln(p[0][0], p[0][1], p[1][0], p[1][1], 'rgba(60,70,90,.35)', 1.2);
    },
    jibsheets(g, col, o) {
      const bx = g.mx - g.L * 0.18, by = g.dAt(bx) - 3;
      // jib not hoisted yet: the sheets lead from its clew lying on the foredeck
      const down = o && o.jibUp === false && g.keelboat;
      const cx = down ? g.jx + (g.mx - g.jx) * 0.35 : g.jcx, cy = down ? g.dAt(g.jx + (g.mx - g.jx) * 0.35) - 4 : g.jcy;
      return '<path d="M' + f(cx) + ' ' + f(cy) + 'Q' + f((cx + bx) / 2) + ' ' + f(by + 4) + ' ' + f(bx) + ' ' + f(by) + '" stroke="#e8323c" stroke-width="1.8" fill="none"/>' +
        '<path d="M' + f(cx) + ' ' + f(cy) + 'Q' + f((cx + bx) / 2) + ' ' + f(by + 10) + ' ' + f(bx - 4) + ' ' + f(by + 2) + '" stroke="#18a957" stroke-width="1.8" fill="none"/>' +
        block(bx, by) + '<path d="M' + f(bx) + ' ' + f(by) + 'q-12 6 -20 0" stroke="#e8323c" stroke-width="1.8" fill="none"/>';
    },
    kicker(g) {
      const bx = g.mx - g.boomL * 0.22, x2 = g.mx - 3, y2 = g.mDeck - 6;
      return ln(bx, g.boomY + 2, x2, y2, '#2a2f3a', 2.4) + ln(bx - 2, g.boomY + 4, x2 - 3, y2 - 2, '#ff7a3d', 1.3) + block(bx, g.boomY + 3, 3) + block(x2, y2, 3);
    },
    cunningham(g) {
      const y = g.boomY - 16;
      return circ(g.mx - 7, y, 2.6, 'none', '#5b6470', 1.6) + '<path d="M' + f(g.mx - 7) + ' ' + f(y) + 'L' + f(g.mx + 2) + ' ' + f(g.mDeck - 4) + 'q8 2 14 -2" stroke="#ffd25e" stroke-width="1.8" fill="none"/>';
    },
    outhaul(g) {
      return '<path d="M' + f(g.boomX + 6) + ' ' + f(g.boomY - 3) + 'L' + f(g.boomX - 4) + ' ' + f(g.boomY) + 'L' + f(g.boomX + g.boomL * 0.6) + ' ' + f(g.boomY + 3) + '" stroke="#18a957" stroke-width="1.8" fill="none"/>' + block(g.boomX - 3, g.boomY + 1, 2.6);
    },
    trapeze(g) {
      const tx = g.mx - g.L * 0.16, ty = g.mDeck - 54;
      return ln(g.mx, g.hounds, tx, ty, 'rgba(70,80,95,.9)', 1.2) + ln(g.mx, g.hounds, tx + 8, ty + 4, 'rgba(70,80,95,.5)', 1.1) +
        '<path d="M' + f(tx - 6) + ' ' + f(ty + 2) + 'h12" stroke="#2a2f3a" stroke-width="4" stroke-linecap="round"/>' + circ(tx, ty + 9, 4, 'none', '#c9d0db', 2) + ln(tx, ty + 13, tx + 4, g.mDeck - 18, '#ff7a3d', 1.3);
    },
    wings(g) {
      const x0 = g.xs + g.L * 0.12, x1 = g.xs + g.L * 0.62, y0 = g.dAt(x0) - 8, y1 = g.dAt(x1) - 8;
      let s = ln(x0, y0, x1, y1, '#3a3f48', 5) + ln(x0, y0, x1, y1, '#8a95a3', 2);
      for (let i = 0; i <= 3; i++) { const x = x0 + (x1 - x0) * i / 3, y = y0 + (y1 - y0) * i / 3; s += ln(x, y, x + 8, g.dAt(x) + 8, '#3a3f48', 3); }
      return s;
    },
    pole(g) {
      const x0 = g.xb - g.L * 0.1, y0 = g.dAt(x0) - 3;
      return sparLine(x0, y0, g.xb + g.L * 0.2, g.dAt(g.xb) - 9, 3.5);
    },
    chute(g) {
      const x = g.xb - g.L * 0.12, y = g.dAt(x) - 2;
      return '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="10" ry="4" fill="#1d2a44" stroke="#9aa3b5" stroke-width="1.5"/>' +
        '<path d="M' + f(x - 9) + ' ' + f(y + 2) + 'Q' + f(x - 30) + ' ' + f(y + 22) + ' ' + f(x - 56) + ' ' + f(y + 16) + '" stroke="rgba(29,42,68,.45)" stroke-width="7" fill="none" stroke-linecap="round"/>';
    },
    gennaker(g, col) {
      // packed: a colourful bundle peeking out of the chute / bag at the bow
      const x = g.xb - g.L * (g.id === 'feva' ? 0.12 : 0.16), y = g.dAt(x) - 6, c1 = col.spi || '#ff7a3d';
      return '<path d="M' + f(x - 12) + ' ' + f(y + 4) + 'q4 -14 12 -12q8 -6 14 4q4 6 -2 10z" fill="' + c1 + '" stroke="' + shade(c1, -0.4) + '" stroke-width="1.2"/>' +
        '<path d="M' + f(x - 6) + ' ' + f(y - 4) + 'q6 -4 12 2" stroke="#ffd25e" stroke-width="3" fill="none"/>' +
        '<path d="M' + f(x + 12) + ' ' + f(y + 2) + 'Q' + f(x + 40) + ' ' + f(y - 2) + ' ' + f(g.xb + g.L * 0.2) + ' ' + f(g.dAt(g.xb) - 9) + '" stroke="#2a2f3a" stroke-width="1" fill="none" opacity=".6"/>';
    },
    gennakerFly(g, col) {
      const c1 = col.spi || '#ff7a3d', head = { x: g.mx + 2, y: g.top + (g.keelboat ? 30 : 16) };
      const tack = g.id === 'feva' ? { x: g.xb - 6, y: g.dAt(g.xb) - 6 } : { x: g.xb + g.L * 0.2, y: g.dAt(g.xb) - 9 };
      const clew = { x: g.mx - g.L * 0.1, y: g.mDeck - 14 };
      return '<defs><linearGradient id="rgSpi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset=".48" stop-color="' + c1 + '"/><stop offset=".49" stop-color="#fff"/><stop offset=".58" stop-color="#fff"/><stop offset=".59" stop-color="#ffd25e"/><stop offset="1" stop-color="' + shade('#ffd25e', -0.2) + '"/></linearGradient></defs>' +
        '<path d="M' + f(head.x) + ' ' + f(head.y) + 'C' + f(tack.x + g.L * 0.45) + ' ' + f(head.y + 30) + ' ' + f(tack.x + g.L * 0.2) + ' ' + f(tack.y - 20) + ' ' + f(tack.x) + ' ' + f(tack.y) +
        'Q' + f((tack.x + clew.x) / 2) + ' ' + f(tack.y - 24) + ' ' + f(clew.x) + ' ' + f(clew.y) + 'Q' + f(g.mx - g.L * 0.04) + ' ' + f((head.y + clew.y) / 2) + ' ' + f(head.x) + ' ' + f(head.y) + 'Z" fill="url(#rgSpi)" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/>';
    },
    cover(g) {
      const x0 = g.mx - 4, x1 = g.boomX + 6;
      return '<path d="M' + f(x0) + ' ' + f(g.boomY - 18) + 'Q' + f((x0 + x1) / 2) + ' ' + f(g.boomY - 24) + ' ' + f(x1) + ' ' + f(g.boomY - 9) + 'L' + f(x1) + ' ' + f(g.boomY + 6) + 'L' + f(x0) + ' ' + f(g.boomY + 6) + 'Z" fill="#1f3b73" stroke="#0e1f44" stroke-width="1.5"/>' +
        [0.25, 0.5, 0.75].map(k => ln(x0 + (x1 - x0) * k, g.boomY - 19, x0 + (x1 - x0) * k, g.boomY + 6, 'rgba(255,255,255,.25)', 1.2)).join('');
    },
    halyard(g) {
      return ln(g.mx + 4, g.top + 4, g.mx + 4, g.mDeck - 6, '#ffd25e', 1.6) + block(g.mx + 2, g.top + 5, 2.8) + '<path d="M' + f(g.mx + 4) + ' ' + f(g.mDeck - 6) + 'q10 4 16 -2" stroke="#ffd25e" stroke-width="1.6" fill="none"/>';
    },
    fenders(g) {
      let s = '';
      [-0.22, 0.02, 0.24].forEach(k => {
        const x = g.L * k, y = g.dAt(x);
        s += ln(x, y + 2, x, y + 14, '#f4f6fb', 1.4) + '<rect x="' + f(x - 7) + '" y="' + f(y + 14) + '" width="14" height="30" rx="7" fill="#f4f6fb" stroke="#9aa3b5" stroke-width="1.4"/>' + ln(x - 6, y + 21, x + 6, y + 21, '#2b6cb0', 2) + ln(x - 6, y + 37, x + 6, y + 37, '#2b6cb0', 2);
      });
      return s;
    },
    lines(g) {
      const b = { x: g.xb - 6, y: g.dAt(g.xb) + 2 }, st = { x: g.xs + 6, y: g.dAt(g.xs) + 2 };
      return '<path d="M' + f(b.x) + ' ' + f(b.y) + 'Q' + f(b.x + 40) + ' ' + f(-2) + ' ' + f(b.x + 70) + ' ' + f(-18) + '" stroke="#ffd25e" stroke-width="2.6" fill="none"/>' +
        '<path d="M' + f(st.x) + ' ' + f(st.y) + 'Q' + f(st.x - 30) + ' ' + f(-4) + ' ' + f(st.x - 60) + ' ' + f(-18) + '" stroke="#ffd25e" stroke-width="2.6" fill="none"/>';
    },
  };
  // drawing order (back to front); HULL is the fixed hull group
  const ORDER = ['gennakerFly', 'lines', 'sail', 'jib', 'ties', 'mastBottom', 'mastTop', 'mast', 'optiRig', 'sprit', 'boom', 'outhaul', 'kicker', 'cunningham',
    'trapeze', 'forestay', 'shrouds', 'halyard', 'mainsheet', 'cover', 'daggerboard', 'bailer', 'paddle', 'crew', 'HULL',
    'jibsheets', 'wings', 'rudder', 'tiller', 'painter', 'pole', 'chute', 'gennaker', 'fenders'];
  // where each job's snap target sits
  function zoneOf(g, k) {
    const L = g.L;
    switch (k) {
      case 'mast': return [g.mx, g.mDeck - g.mastH * 0.45];
      case 'optiRig': return [g.mx - g.boomL * 0.2, g.boomY - (g.boomY - g.top) * 0.4];
      case 'mastBottom': return [g.mx, g.mDeck - g.mastH * 0.25];
      case 'mastTop': return [g.mx, g.mDeck - g.mastH * 0.78];
      case 'boom': return [g.mx - g.boomL * 0.5, g.boomY];
      case 'sprit': return [(g.spritLow.x + g.peak.x) / 2, (g.spritLow.y + g.peak.y) / 2];
      case 'sail': return [g.sailC.x, g.sailC.y];
      case 'ties': return [g.mx, g.boomY - (g.boomY - g.top) * 0.6];
      case 'mainsheet': { const bx = g.boomX + g.boomL * 0.1; return [bx, (g.boomY + g.dAt(bx)) / 2]; }
      case 'daggerboard': return [g.dx, g.dAt(g.dx) - 26];
      case 'rudder': return [g.xs - 6, g.dAt(g.xs) + 16];
      case 'tiller': return [g.xs + L * 0.14, g.dAt(g.xs) - 12];
      case 'bailer': return [g.mx - L * 0.34, g.dAt(g.mx - L * 0.34) - 8];
      case 'vest': return [g.kid.x, g.kid.y - g.kid.h * 0.5]; // on the sailor's chest
      case 'paddle': return [g.xs + L * 0.3, g.dAt(g.xs) - 24];
      case 'painter': return [g.xb + 2, g.dAt(g.xb) + 16];
      case 'shrouds': return [g.mx - 7, (g.hounds + g.mDeck) / 2 + 30];
      case 'forestay': return [((g.jx || g.xb) + g.mx) / 2 + 6, ((g.jDeck || g.deck) + g.hounds) / 2];
      case 'jib': return [(g.jx + g.mx + g.jcx) / 3, (g.jDeck + g.jHead + g.jcy) / 3 + 8];
      case 'jibsheets': return [(g.jcx + g.mx - L * 0.18) / 2, g.dAt(g.mx - L * 0.18) - 4];
      case 'gennaker': return [g.xb - L * 0.14, g.dAt(g.xb) - 12];
      case 'chute': return [g.xb - L * 0.12, g.dAt(g.xb) - 2];
      case 'kicker': return [g.mx - g.boomL * 0.11, (g.boomY + g.mDeck) / 2];
      case 'cunningham': return [g.mx - 4, g.boomY - 12];
      case 'outhaul': return [g.boomX + 16, g.boomY];
      case 'trapeze': return [g.mx - L * 0.12, g.mDeck - 80];
      case 'wings': return [g.xs + L * 0.37, g.dAt(g.xs + L * 0.37) - 8];
      case 'pole': return [g.xb + L * 0.08, g.dAt(g.xb) - 7];
      case 'cover': return [g.mx - g.boomL * 0.5, g.boomY - 8];
      case 'halyard': return [g.mx + 4, g.top + (g.mDeck - g.top) * 0.3];
      case 'fenders': return [g.L * 0.02, g.dAt(0) + 30];
      case 'lines': return [g.xb + 36, -10];
      case 'hose': return [0, g.dAt(0) + g.fb * 0.4];
      case 'roll': return [g.ground.x, g.ground.y];
      default: return [0, g.deck];
    }
  }
  const SOUND = { optiRig: 'rigClick', mast: 'rigClick', mastBottom: 'rigClick', mastTop: 'rigClick', boom: 'rigClick', sprit: 'rigClick', pole: 'rigClick', wings: 'rigClick',
    tiller: 'rigClick', rudder: 'rigClick', daggerboard: 'rigClick', sail: 'zip', jib: 'zip', gennaker: 'zip', cover: 'zip', chute: 'zip',
    ties: 'knot', painter: 'knot', hose: 'splash', roll: 'whoosh', fenders: 'bump', bailer: 'tap', paddle: 'tap', vest: 'zip' };
  const GROW = { optiRig: 1, mast: 1, mastBottom: 1, mastTop: 1, sail: 1, jib: 1, halyard: 1 }; // grow up from the bottom when fitted

  // ---------------------------------------------------------------- tray icons (64×64)
  function icon(k, col) {
    col = col || {};
    const sp = 'stroke="' + SPAR_D + '" stroke-width="2"';
    const rope = c => 'stroke="' + c + '" stroke-width="3.2" fill="none" stroke-linecap="round"';
    const I = {
      mast: '<rect x="29" y="4" width="6" height="56" rx="3" fill="' + SPAR + '" ' + sp + '/><path d="M32 4v-0l-12 3 12 3z" fill="#e8323c"/>',
      optiRig: '<path d="M16 8L50 12Q44 32 54 50H16z" fill="#fff" stroke="#8a95a3" stroke-width="2" stroke-linejoin="round"/><rect x="11" y="4" width="6" height="56" rx="3" fill="' + SPAR + '" ' + sp + '/><rect x="11" y="49" width="46" height="5" rx="2.5" fill="' + SPAR + '" ' + sp + '/><path d="M12 16h8M12 28h8M12 40h8" stroke="#e8323c" stroke-width="2.4" stroke-linecap="round"/><text x="33" y="36" font-size="11" font-weight="900" fill="' + (col.trim || '#1f6fb2') + '" text-anchor="middle" font-family="system-ui">' + (INS[col.id] || '') + '</text>',
      mastBottom: '<rect x="28" y="22" width="8" height="38" rx="3" fill="#a9b5c2" ' + sp + '/>',
      mastTop: '<rect x="29.5" y="4" width="5" height="40" rx="2.5" fill="#cdd6df" ' + sp + '/><path d="M32 4l-11 3 11 3z" fill="#e8323c"/>',
      boom: '<rect x="4" y="29" width="56" height="6" rx="3" fill="' + SPAR + '" ' + sp + '/><circle cx="8" cy="32" r="3.5" fill="#2a2f3a"/>',
      sprit: '<path d="M8 56L56 8" stroke="' + SPAR_D + '" stroke-width="6.5" stroke-linecap="round"/><path d="M8 56L56 8" stroke="' + SPAR + '" stroke-width="4" stroke-linecap="round"/>',
      sail: '<path d="M14 58V6Q46 26 54 58z" fill="#fff" stroke="#8a95a3" stroke-width="2" stroke-linejoin="round"/><text x="30" y="40" font-size="12" font-weight="900" fill="' + (col.trim || '#1f6fb2') + '" text-anchor="middle" font-family="system-ui">' + (INS[col.id] || '') + '</text>',
      ties: '<path d="M10 18c10-8 18 8 28 0s14 6 18 2M10 34c10-8 18 8 28 0s14 6 18 2M10 50c10-8 18 8 28 0s14 6 18 2" ' + rope('#e8323c') + '/>',
      mainsheet: '<circle cx="32" cy="34" r="16" ' + rope('#24395c') + '/><circle cx="32" cy="34" r="10" ' + rope('#24395c') + '/><circle cx="32" cy="12" r="6" fill="#2a2f3a" stroke="#9aa3b5" stroke-width="2"/><path d="M48 36q10 6 8 20" ' + rope('#24395c') + '/>',
      daggerboard: '<rect x="22" y="4" width="20" height="56" rx="7" fill="#f4f6f8" stroke="#7d8794" stroke-width="2"/><rect x="27" y="10" width="10" height="10" rx="3" fill="#7d8794"/>',
      rudder: '<path d="M34 6h8l-2 30q-2 20-14 22-6-2 0-14l4-36z" fill="#f4f6f8" stroke="#7d8794" stroke-width="2" stroke-linejoin="round"/><path d="M40 10L60 20" stroke="#c58b4f" stroke-width="5" stroke-linecap="round"/>',
      tiller: '<path d="M6 44L46 28" stroke="#c58b4f" stroke-width="6" stroke-linecap="round"/><path d="M46 28l12-16" stroke="#2a2f3a" stroke-width="3" stroke-linecap="round"/>',
      bailer: '<path d="M12 46l5-24h30l5 24z" fill="#ff7a3d" stroke="#a94415" stroke-width="2" stroke-linejoin="round"/><path d="M47 24q10-10 12 4" ' + rope('#ffd25e') + '/>',
      vest: '<path d="M16 56V22q0-10 8-12h5q3 7 6 0h5q8 2 8 12v34z" fill="#ff7a1a" stroke="#a94415" stroke-width="2.2" stroke-linejoin="round"/><path d="M32 16v40M18 40h28" stroke="#ffd25e" stroke-width="3.4" stroke-linecap="round"/>',
      paddle: '<path d="M12 56L44 16" stroke="#c58b4f" stroke-width="5" stroke-linecap="round"/><ellipse cx="48" cy="12" rx="6" ry="12" transform="rotate(38 48 12)" fill="#2b6cb0" stroke="#163d66" stroke-width="2"/>',
      painter: '<ellipse cx="32" cy="38" rx="20" ry="12" ' + rope('#ffd25e') + '/><ellipse cx="32" cy="38" rx="12" ry="7" ' + rope('#e5b93e') + '/><path d="M52 38q6-20-8-28" ' + rope('#ffd25e') + '/>',
      shrouds: '<path d="M18 6L10 58M46 6L54 58" stroke="#6b7684" stroke-width="2.4"/><circle cx="10" cy="58" r="3" fill="#5b6470"/><circle cx="54" cy="58" r="3" fill="#5b6470"/>',
      forestay: '<path d="M14 58L50 6" stroke="#6b7684" stroke-width="2.4"/><circle cx="14" cy="58" r="3.5" fill="#5b6470"/>',
      jib: '<path d="M12 56L40 6Q50 34 52 56z" fill="#fff" stroke="#8a95a3" stroke-width="2" stroke-linejoin="round"/>',
      jibsheets: '<path d="M8 20Q30 50 56 40" ' + rope('#e8323c') + '/><path d="M8 20Q26 58 52 52" ' + rope('#18a957') + '/><circle cx="8" cy="20" r="4" fill="#fff" stroke="#8a95a3" stroke-width="2"/>',
      gennaker: '<path d="M10 54Q8 10 40 6Q58 30 54 54Q34 44 10 54z" fill="' + (col.spi || '#ff7a3d') + '" stroke="rgba(0,0,0,.3)" stroke-width="2"/><path d="M22 47Q22 20 42 14" stroke="#fff" stroke-width="5" fill="none"/><path d="M34 46Q36 26 50 24" stroke="#ffd25e" stroke-width="5" fill="none"/>',
      chute: '<ellipse cx="18" cy="20" rx="10" ry="5" fill="#1d2a44" stroke="#9aa3b5" stroke-width="2"/><path d="M12 24Q20 54 56 52" stroke="rgba(29,42,68,.75)" stroke-width="12" fill="none" stroke-linecap="round"/>',
      kicker: '<path d="M14 12L50 52" stroke="#2a2f3a" stroke-width="3"/><path d="M18 12L54 50" stroke="#ff7a3d" stroke-width="2"/><circle cx="14" cy="12" r="6" fill="#2a2f3a" stroke="#9aa3b5" stroke-width="2"/><circle cx="50" cy="52" r="6" fill="#2a2f3a" stroke="#9aa3b5" stroke-width="2"/>',
      cunningham: '<circle cx="20" cy="18" r="7" fill="none" stroke="#5b6470" stroke-width="3"/><path d="M20 25L28 54Q40 58 54 50" ' + rope('#ffd25e') + '/>',
      outhaul: '<path d="M6 30h52" stroke="' + SPAR + '" stroke-width="6"/><path d="M58 22L4 30L52 38" ' + rope('#18a957') + '/>',
      trapeze: '<path d="M30 4L14 46M34 4L50 46" stroke="#6b7684" stroke-width="2.2"/><path d="M8 46h12M44 46h12" stroke="#2a2f3a" stroke-width="5" stroke-linecap="round"/><circle cx="14" cy="54" r="5" fill="none" stroke="#c9d0db" stroke-width="2.6"/><circle cx="50" cy="54" r="5" fill="none" stroke="#c9d0db" stroke-width="2.6"/>',
      wings: '<path d="M6 30H58" stroke="#3a3f48" stroke-width="6" stroke-linecap="round"/><path d="M6 30H58" stroke="#8a95a3" stroke-width="2.4"/><path d="M14 30l8 18M32 30l8 18M50 30l6 18" stroke="#3a3f48" stroke-width="3.5" stroke-linecap="round"/>',
      pole: '<path d="M6 44L58 22" stroke="' + SPAR_D + '" stroke-width="7.5" stroke-linecap="round"/><path d="M6 44L58 22" stroke="' + SPAR + '" stroke-width="4.5" stroke-linecap="round"/>',
      cover: '<path d="M6 22Q32 12 58 26V42H6z" fill="#1f3b73" stroke="#0e1f44" stroke-width="2"/><path d="M20 18v24M34 16v26M48 20v22" stroke="rgba(255,255,255,.3)" stroke-width="2"/>',
      fenders: '<rect x="12" y="10" width="16" height="44" rx="8" fill="#f4f6fb" stroke="#9aa3b5" stroke-width="2"/><rect x="36" y="10" width="16" height="44" rx="8" fill="#f4f6fb" stroke="#9aa3b5" stroke-width="2"/><path d="M14 20h12M14 44h12M38 20h12M38 44h12" stroke="#2b6cb0" stroke-width="3"/>',
      lines: '<path d="M6 50Q22 20 40 34T58 14" ' + rope('#ffd25e') + '/><path d="M44 54h14M51 47v14" stroke="#9aa3b5" stroke-width="4" stroke-linecap="round"/>',
      halyard: '<path d="M32 10V54Q40 60 52 54" ' + rope('#ffd25e') + '/><circle cx="32" cy="10" r="6" fill="#2a2f3a" stroke="#9aa3b5" stroke-width="2"/><path d="M28 54h8v6h-8z" fill="#c9d0db"/>',
      hose: '<path d="M6 54Q6 34 22 34H38" stroke="#18a957" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="36" y="28" width="10" height="12" rx="3" fill="#ffd25e" stroke="#a37b12" stroke-width="2"/><path d="M48 30l10-8M48 34l12 0M48 38l10 8" stroke="#49c6f2" stroke-width="3" stroke-linecap="round"/>',
      roll: '<rect x="8" y="22" width="48" height="20" rx="10" fill="#fff" stroke="#8a95a3" stroke-width="2"/><path d="M14 26a6 6 0 1 0 0 12a3 3 0 1 0 0-6" fill="none" stroke="#8a95a3" stroke-width="2"/><path d="M36 22v20" stroke="#e8323c" stroke-width="3"/>',
      fold: '<path d="M10 44l22-10 22 10-22 10z" fill="#fff" stroke="#8a95a3" stroke-width="2" stroke-linejoin="round"/><path d="M10 36l22-10 22 10-22 10z" fill="#f4f4f4" stroke="#8a95a3" stroke-width="2" stroke-linejoin="round"/><path d="M10 28l22-10 22 10-22 10z" fill="#fff" stroke="#8a95a3" stroke-width="2" stroke-linejoin="round"/>',
    };
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + (I[k] || I.mast) + '</svg>';
  }

  // ---------------------------------------------------------------- background scene (sky, Nordhavn skyline, slipway / pontoon)
  function bgSvg(g) {
    const W0 = -4000, W1 = 9000;
    const hz = -70; // horizon
    let s = '<defs>' +
      '<linearGradient id="rgSky" gradientUnits="userSpaceOnUse" x1="0" y1="' + f(hz - g.mastH * 1.25 - 120) + '" x2="0" y2="' + hz + '"><stop offset="0" stop-color="#5b6db0"/><stop offset=".45" stop-color="#a98dc4"/><stop offset=".78" stop-color="#f3b1a0"/><stop offset="1" stop-color="#ffd3a1"/></linearGradient>' +
      '<linearGradient id="rgFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb4d8"/><stop offset="1" stop-color="#5c84b8"/></linearGradient>' +
      '<linearGradient id="rgNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(64,140,200,.55)"/><stop offset="1" stop-color="rgba(22,70,130,.92)"/></linearGradient>' +
      '<linearGradient id="rgGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9c3bb"/><stop offset=".06" stop-color="#a9a39b"/><stop offset="1" stop-color="#6e6a66"/></linearGradient>' +
      '<radialGradient id="rgSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4cf"/><stop offset=".35" stop-color="rgba(255,226,170,.6)"/><stop offset="1" stop-color="rgba(255,200,150,0)"/></radialGradient>' +
      '</defs>';
    return { defs: s, hz, W0, W1 };
  }
  function skySvg(g, hz) {
    let s = '<rect x="-4000" y="-6000" width="13000" height="' + (6000 + hz + 2) + '" fill="url(#rgSky)"/>';
    s += '<circle cx="' + f(g.xb + 260) + '" cy="' + f(hz - 70) + '" r="190" fill="url(#rgSun)"/>';
    // soft clouds
    [[-g.L * 0.6, hz - g.mastH * 0.9, 1.2], [g.L * 0.7, hz - g.mastH * 0.6, 0.9], [g.L * 1.8, hz - g.mastH * 0.95, 1.1], [-g.L * 1.6, hz - g.mastH * 0.5, 0.8]].forEach(c => {
      s += '<g opacity=".55" transform="translate(' + f(c[0]) + ' ' + f(c[1]) + ') scale(' + c[2] + ')"><ellipse cx="0" cy="0" rx="70" ry="16" fill="#ffe9e0"/><ellipse cx="-30" cy="-8" rx="34" ry="16" fill="#ffeee6"/><ellipse cx="22" cy="-12" rx="30" ry="18" fill="#fff3ec"/></g>';
    });
    return s;
  }
  function skylineSvg(g, hz) {
    // Nordhavn towers, the red-brick power station with its chimney, a forest of masts
    let s = '';
    const r = U.rng(77);
    for (let i = 0; i < 26; i++) {
      const x = -1400 + i * 120 + r() * 40, w = 40 + r() * 60, h = 40 + r() * 110;
      s += '<rect x="' + f(x) + '" y="' + f(hz - h) + '" width="' + f(w) + '" height="' + f(h) + '" fill="' + (i % 3 ? '#8b86b0' : '#9c94b8') + '" opacity=".85"/>';
      for (let j = 0; j < h / 14 - 1; j++) s += '<rect x="' + f(x + 5) + '" y="' + f(hz - h + 8 + j * 14) + '" width="' + f(w - 10) + '" height="3" fill="#ffd9b0" opacity=".35"/>';
    }
    const px = g.xs - 360;
    s += '<rect x="' + f(px) + '" y="' + f(hz - 70) + '" width="150" height="70" fill="#a65a4a"/><rect x="' + f(px + 20) + '" y="' + f(hz - 92) + '" width="110" height="24" fill="#97503f"/>';
    s += '<rect x="' + f(px + 120) + '" y="' + f(hz - 240) + '" width="18" height="170" fill="#8e4a3c"/>';
    for (let i = 0; i < 6; i++) s += '<rect x="' + f(px + 14 + i * 22) + '" y="' + f(hz - 56) + '" width="9" height="26" rx="4" fill="#6e3a30"/>';
    for (let i = 0; i < 40; i++) { const x = -900 + i * 47 + r() * 20, h = 50 + r() * 70; s += ln(x, hz + 4, x, hz - h, 'rgba(240,240,255,.55)', 1.4); }
    return s;
  }
  function groundSvg(g) {
    let s = '';
    if (g.keelboat) {
      // pontoon behind the boat + posts, cleats
      s += '<rect x="-4000" y="-18" width="13000" height="10" fill="#8a6a48"/><rect x="-4000" y="-20" width="13000" height="3" fill="#b08a5f"/>';
      for (let x = -1200; x < 1600; x += 140) s += '<rect x="' + x + '" y="-20" width="12" height="40" fill="#5f4630"/>';
      [g.xb + 70, g.xs - 60].forEach(x => { s += '<path d="M' + f(x - 10) + ' -20h20l-4 -4h-12z" fill="#2a2f3a"/>'; });
      return s;
    }
    // concrete slipway apron + ramp down into the water on the left (boats are backed in stern first)
    const xW = g.xW, slope = 0.18;
    s += '<path d="M9000 -6L' + f(xW) + ' -6L' + f(xW - 2000) + ' ' + f(-6 + 2000 * slope) + 'L' + f(xW - 2000) + ' 3000L9000 3000Z" fill="url(#rgGround)"/>';
    s += '<path d="M9000 -6L' + f(xW) + ' -6L' + f(xW - 2000) + ' ' + f(-6 + 2000 * slope) + '" stroke="#ddd6cc" stroke-width="3" fill="none"/>';
    for (let x = 2000; x > xW; x -= 90) s += ln(x, 0, x + 60, 300, 'rgba(60,55,50,.15)', 2);
    for (let i = 0; i < 9; i++) s += ln(xW - i * 40, -6 + i * 40 * slope, xW - i * 40 + 70, 300, 'rgba(60,80,90,.16)', 2);
    // a coiled hose in the background for flavour
    s += '<ellipse cx="' + f(g.xs - 40) + '" cy="20" rx="20" ry="7" fill="none" stroke="#18a957" stroke-width="4"/><ellipse cx="' + f(g.xs - 40) + '" cy="20" rx="12" ry="4" fill="none" stroke="#139047" stroke-width="3"/>';
    return s;
  }
  function nearWaterSvg(g) {
    // keelboats: water everywhere in front of the pontoon; dinghies: the water starts where the ramp (left) dips under
    const y = g.keelboat ? 0 : g.waterY, xe = g.keelboat ? 9000 : g.xW - (g.waterY + 6) / 0.18, x0 = -4000, w = xe - x0;
    let s = '<rect x="' + f(x0) + '" y="' + f(y) + '" width="' + f(w) + '" height="3000" fill="url(#rgNear)"/>';
    s += '<g class="rig-waves">';
    const wx0 = g.keelboat ? -3970 : xe - 30 - 1800;
    for (let i = 0; i < 60; i++) { const x = wx0 + (i % 20) * 90 + (i > 19 ? 45 : 0), yy = y + 10 + Math.floor(i / 20) * 18; if (x + 40 < xe) s += '<path d="M' + f(x) + ' ' + f(yy) + 'q10 -5 20 0t20 0" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none"/>'; }
    s += '</g><rect x="' + f(x0) + '" y="' + f(y - 1) + '" width="' + f(w) + '" height="3" fill="rgba(255,255,255,.55)"/>';
    return s;
  }
  function groundSailSvg(g, state, col) {
    const { x, y } = g.ground, w = g.keelboat ? g.L * 0.22 : g.L * 0.5;
    if (state === 'flat') {
      if (g.keelboat) return '<path d="M' + f(x - w / 2) + ' ' + f(y + 4) + 'L' + f(x + w / 2) + ' ' + f(y + 2) + 'L' + f(x) + ' ' + f(y - 8) + 'Z" fill="#fff" stroke="#8a95a3" stroke-width="1.5"/>';
      return '<path d="M' + f(x - w / 2) + ' ' + f(y + 10) + 'L' + f(x + w / 2) + ' ' + f(y + 14) + 'L' + f(x + w * 0.2) + ' ' + f(y - 10) + 'Z" fill="#fff" stroke="#8a95a3" stroke-width="1.5"/>' +
        '<text x="' + f(x + 6) + '" y="' + f(y + 8) + '" font-size="12" font-weight="900" fill="' + (col.trim || '#1f6fb2') + '" text-anchor="middle" font-family="system-ui">' + INS[g.id] + '</text>';
    }
    if (state === 'rolled') {
      const ww = w * 0.8;
      return '<rect x="' + f(x - ww / 2) + '" y="' + f(y - 6) + '" width="' + f(ww) + '" height="13" rx="6.5" fill="#fff" stroke="#8a95a3" stroke-width="1.5"/>' +
        '<circle cx="' + f(x - ww / 2 + 6) + '" cy="' + f(y + 0.5) + '" r="4" fill="none" stroke="#8a95a3" stroke-width="1.2"/>' + ln(x + ww * 0.2, y - 6, x + ww * 0.2, y + 7, '#e8323c', 2.4);
    }
    return '';
  }

  // ======================================================================== 4. the mode
  KOS.Modes.register('rigging', { kind: 'dom', create(host, activity) { return createRigging(host, activity); } });

  function createRigging(host, activity) {
    const Pm = Object.assign({ cls: null, unrig: false, seed: 1 }, activity.params || {});
    const clsId = CFG[Pm.cls] ? Pm.cls : (CFG[host.boat] ? host.boat : 'opti');
    const assist = host.assist || 'easy';
    const unrig = !!Pm.unrig;
    const g = geo(clsId);
    keelJobs = g.keelboat;
    const def = (KOS.Boats && KOS.Boats.get(clsId)) || { name: clsId, colors: {} };
    const profile = host.profile || {};
    const col = Object.assign({ hull: '#fff', deck: '#eee', sail: '#fff', trim: '#ff7a3d' }, def.colors || {}, { id: clsId });
    if (profile.boatColor && !g.keelboat && clsId !== 'opti') col.hull = profile.boatColor;
    const sailNo = profile.sailNo ? 'DEN ' + String(profile.sailNo).slice(0, 4) : 'DEN 1';
    const boatName = def.name;
    const rand = U.rng((Pm.seed || 1) * 977 + 3);
    const PEN = assist === 'easy' ? 2 : assist === 'pro' ? 8 : 5;

    // ---- the job list
    const steps = [];
    const base = RIG[clsId];
    const maxG = base.reduce((m, s) => Math.max(m, s[1]), 0);
    if (!unrig) base.forEach(s => steps.push({ k: s[0], g: s[1], type: s[2] || 'on' }));
    else {
      base.slice().reverse().forEach(s => steps.push({ k: s[0], g: maxG + 1 - s[1], type: s[2] === 'off' ? 'on' : 'off' }));
      steps.push({ k: 'hose', g: maxG + 1, type: 'on', pack: true });
      steps.push({ k: 'roll', g: maxG + 2, type: 'on', pack: true });
    }
    steps.forEach((s, i) => { s.i = i; s.done = false; });
    const decoys = [];
    if (unrig) decoys.push({ k: 'fold', decoy: true, type: 'on', i: 100 });
    if (!unrig && assist !== 'easy') decoys.push({ k: DECOY[clsId], decoy: true, type: 'on', i: 101 });
    // the tray shows jobs shuffled (seeded), so the order isn't given away
    const cards = steps.concat(decoys).map(s => s);
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp; }

    // installed parts
    const inst = {};
    ORDER.forEach(k => { inst[k] = false; });
    if (unrig) base.forEach(s => { inst[s[0]] = s[2] !== 'off'; });
    else base.forEach(s => { inst[s[0]] = s[2] === 'off'; });
    // keelboats keep their mast stepped and the boom and standing rigging on all season
    // keelboats keep their mast stepped and the boom and standing rigging on all season (Feva / 29er: the mast, see KEEP_ON)
    (g.keelboat ? ['mast', 'boom', 'shrouds', 'forestay'] : []).concat(KEEP_ON[clsId] || []).forEach(k => { inst[k] = true; });
    let groundSail = null; // null | 'flat' | 'rolled'
    let foilsDown = 0; // dinghy rudder blade + daggerboard: 0 = raised (on land), 1 = lowered (afloat)

    const S = {
      phase: 'play', time: 0, started: false, penalty: 0, mistakes: 0, streak: 0, bestStreak: 0, doneN: 0,
      endT: 0, result: null, hudT: 0, ambT: 0, gullT: 6, botT: 0, tips: {}, sel: null, drag: null, finishing: false,
    };
    let autopilot = false;

    // ---- DOM
    const rootEl = doc.createElement('div');
    rootEl.className = 'rigging-root' + (unrig ? ' is-unrig' : '') + ' assist-' + assist;
    const vb = g.vb;
    const B = bgSvg(g);
    rootEl.innerHTML =
      '<div class="rigging-scene">' +
      '<svg class="rigging-svg" viewBox="' + f(vb.x) + ' ' + f(vb.y) + ' ' + f(vb.w) + ' ' + f(vb.h) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + B.defs +
      '<g class="rg-sky">' + skySvg(g, B.hz) + '</g>' +
      '<g class="rg-skyline">' + skylineSvg(g, B.hz) + '</g>' +
      '<g class="rg-world">' +
      '<rect x="-4000" y="' + B.hz + '" width="13000" height="3000" fill="url(#rgFar)"/>' +
      '<g class="rg-ground">' + groundSvg(g) + '</g>' +
      '<g class="rg-gsail"></g>' +
      '<g class="rg-trolley">' + (g.keelboat ? '' : trolleySvg(g)) + '</g>' +
      '<g class="rg-kid"><g class="rg-kid-in" transform="' + kidTf(g.kid) + '">' + kidUnder() + '<g class="rig-part" data-k="vest"></g>' + kidOver(g.kid.hand) + '</g></g>' +
      '<g class="rg-wake"></g>' +
      '<g class="rg-boat"><g class="rg-boat-in"></g></g>' +
      '<g class="rg-water">' + nearWaterSvg(g) + '</g>' +
      '<g class="rg-fx"></g>' +
      '<g class="rg-zones"></g>' +
      '</g></svg>' +

      '<div class="rigging-stamp" hidden></div>' +
      '</div>' +
      '<div class="rigging-tray"><div class="rigging-info" hidden></div><div class="rigging-tray-head"><span class="rigging-tray-title"></span><span class="rigging-keys"></span><span class="rigging-keys-touch"></span></div><div class="rigging-cards" role="listbox"></div></div>';
    host.layer.appendChild(rootEl);
    const sceneEl = rootEl.querySelector('.rigging-scene');
    const svg = rootEl.querySelector('svg');
    const worldG = svg.querySelector('.rg-world'), skylineG = svg.querySelector('.rg-skyline');
    const boatG = svg.querySelector('.rg-boat'), boatIn = svg.querySelector('.rg-boat-in'), trolleyG = svg.querySelector('.rg-trolley');
    const zonesG = svg.querySelector('.rg-zones'), fxG = svg.querySelector('.rg-fx'), gsailG = svg.querySelector('.rg-gsail'), wakeG = svg.querySelector('.rg-wake');
    const infoEl = rootEl.querySelector('.rigging-info'), stampEl = rootEl.querySelector('.rigging-stamp');
    const cardsEl = rootEl.querySelector('.rigging-cards');
    rootEl.querySelector('.rigging-tray-title').textContent = t(unrig || g.keelboat ? 'rigging.trayTitleUnrig' : 'rigging.trayTitle');
    rootEl.querySelector('.rigging-keys').textContent = t('rigging.keys');
    rootEl.querySelector('.rigging-keys-touch').textContent = t('rigging.keysTouch');
    const kidG = svg.querySelector('.rg-kid'), kidIn = svg.querySelector('.rg-kid-in');

    // part groups in drawing order
    const partEl = {};
    ORDER.forEach(k => {
      const e = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      if (k === 'HULL') { e.setAttribute('class', 'rig-hull'); e.innerHTML = hullSvg(g, col, sailNo); }
      else { e.setAttribute('class', 'rig-part'); e.setAttribute('data-k', k); }
      boatIn.appendChild(e);
      partEl[k] = e;
    });
    function drawPart(k, mode) {
      const e = partEl[k];
      if (!e || !DRAW[k]) return;
      e.innerHTML = DRAW[k](g, col, { sailNo, jibUp: !!inst.jib, down: foilsDown });
      e.setAttribute('class', 'rig-part' + (mode ? ' ' + mode : '') + (GROW[k] ? ' grow' : ''));
    }
    function clearPart(k) { const e = partEl[k]; if (e) { e.innerHTML = ''; e.setAttribute('class', 'rig-part'); } }
    // the life jacket is worn by the sailor standing next to the boat
    partEl.vest = kidG.querySelector('[data-k="vest"]');
    ORDER.forEach(k => { if (k !== 'HULL' && inst[k]) drawPart(k); });
    if (inst.vest) drawPart('vest');
    function drawGroundSail() { gsailG.innerHTML = groundSail ? groundSailSvg(g, groundSail, col) : ''; }

    // zones
    const zoneEl = {};
    steps.forEach(s => {
      const z = zoneOf(g, s.k);
      const e = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      e.setAttribute('class', 'rig-zone');
      e.setAttribute('transform', 'translate(' + f(z[0]) + ' ' + f(z[1]) + ')');
      e.innerHTML = '<circle class="rgz-glow" r="20"/><circle class="rgz-ring" r="14"/><circle class="rgz-dot" r="4"/>';
      zonesG.appendChild(e);
      zoneEl[s.i] = e;
      s.zx = z[0]; s.zy = z[1];
    });
    function zoneScale() {
      const m = svg.getScreenCTM();
      const k = m ? m.a : 1;
      const r = 24 / Math.max(0.05, k);
      steps.forEach(s => {
        const e = zoneEl[s.i];
        e.querySelector('.rgz-glow').setAttribute('r', f(r));
        e.querySelector('.rgz-ring').setAttribute('r', f(r * 0.66));
        e.querySelector('.rgz-dot').setAttribute('r', f(r * 0.2));
      });
    }

    // ---- tray cards
    const cardEl = {};
    cards.forEach(s => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'rigging-card' + (s.decoy ? ' is-decoy' : '');
      b.setAttribute('role', 'option');
      b.dataset.i = s.i;
      const badge = s.k === 'hose' || s.k === 'roll' || s.k === 'fold' ? '' : '<span class="rgc-badge ' + s.type + '">' + esc(t('rigging.' + (s.type === 'off' ? 'off' : 'on'))) + '</span>';
      b.innerHTML = '<span class="rgc-ico">' + icon(s.k, col) + '</span>' + badge +
        '<span class="rgc-name">' + esc(jobLabel(s.k, s.type)) + '</span><span class="rgc-en">' + esc(pother(s.k)) + '</span>';
      b.setAttribute('aria-label', jobLabel(s.k, s.type) + ' – ' + pother(s.k));
      cardsEl.appendChild(b);
      cardEl[s.i] = b;
      b.addEventListener('pointerdown', e => onCardDown(e, s));
      // once a touch drag has started (or the card is held = armed), stop the tray from scrolling under the finger
      b.addEventListener('touchmove', e => { const st = S.ptrSt; if (st && (st.active || st.armed) && e.cancelable) e.preventDefault(); }, { passive: false });
      b.addEventListener('click', e => { if (b.__noClick) { b.__noClick = false; return; } select(s); e.preventDefault(); });
      b.addEventListener('focus', () => { if (S.sel !== s && !S.drag && !S.ptr) select(s, true); });
    });
    const byI = i => steps[i] || decoys.find(d => d.i === i);

    // ---- HUD
    const hud = KOS.UI.hud(host.layer, ['timer', { id: 'steps', icon: 'wrench', labelKey: 'rigging.hud.steps' }, { id: 'oops', icon: 'penalty', labelKey: 'rigging.hud.oops' }]);
    hud.el.classList.add('rigging-hud');

    // ---- logic
    function available(s) {
      if (s.done || s.decoy) return false;
      return !steps.some(o => !o.done && o.g < s.g);
    }
    function blocking(s) { return steps.filter(o => !o.done && o.g < s.g).sort((a, b) => a.g - b.g || a.i - b.i)[0]; }
    function nextStep() { return steps.find(s => available(s)); }
    function remaining() { return steps.filter(s => !s.done).length; }

    function refresh() {
      const easy = assist === 'easy';
      steps.forEach(s => {
        const c = cardEl[s.i];
        const av = available(s);
        if (c) { c.classList.toggle('is-next', easy && av); c.classList.toggle('is-sel', S.sel === s); }
        const z = zoneEl[s.i];
        const dragging = S.drag && S.drag.s === s;
        const show = !s.done && (dragging ? assist !== 'pro' || S.drag.near : (easy && av) || S.sel === s);
        z.classList.toggle('show', !!show);
        z.classList.toggle('rg-dim', !!show && !av && !dragging);
      });
      decoys.forEach(d => { const c = cardEl[d.i]; if (c) c.classList.toggle('is-sel', S.sel === d); });
      // easy: faint ghost outline of parts that can be fitted now
      if (!unrig) steps.forEach(s => {
        if (s.done || s.type !== 'on' || !DRAW[s.k]) return;
        const ghost = (easy && available(s)) || (S.drag && S.drag.s === s && assist !== 'pro') || (S.sel === s && assist !== 'pro');
        if (ghost && !partEl[s.k].classList.contains('rig-ghost')) drawPart(s.k, 'rig-ghost');
        else if (!ghost && partEl[s.k].classList.contains('rig-ghost')) clearPart(s.k);
      });
      if (unrig) steps.forEach(s => {
        if (s.done || s.type !== 'off' || !partEl[s.k]) return;
        partEl[s.k].classList.toggle('rig-avail', (easy && available(s)) || S.sel === s);
      });
    }

    function start() {
      if (!S.started) { S.started = true; }
    }

    function select(s, viaFocus) {
      if (S.phase !== 'play') return;
      S.sel = s;
      showInfo(s.k, s);
      if (!viaFocus) sfx('tap', { vol: 0.5, pitch: 1.1 });
      start();
      refresh();
    }
    function showInfo(k, s) {
      const bk = s && (s.decoy ? 'do' : s.k === 'vest' ? (s.type === 'off' ? 'unwear' : 'wear') : s.type === 'off' ? 'off' : s.pack ? 'do' : 'on');
      const btn = s ? '<button type="button" class="btn btn-primary rigging-do">' + esc(t('rigging.btn.' + bk)) + '</button>' : '';
      infoEl.innerHTML = '<div class="rgi-ico">' + icon(k, col) + '</div><div class="rgi-txt"><div class="rgi-name">' + esc(pname(k)) + ' <small>· ' + esc(pother(k)) + '</small></div>' +
        '<div class="rgi-desc">' + esc(k === 'rudder' && g.keelboat ? t('rigging.keelRudder') : t('rigging.p.' + k + '.desc')) + '</div></div>' + btn +
        '<button type="button" class="icon-btn rgi-close" aria-label="' + esc(t('rigging.btn.close')) + '">' + KOS.UI.iconSvg('close') + '</button>';
      infoEl.hidden = false;
      infoEl.classList.remove('in'); void infoEl.offsetWidth; infoEl.classList.add('in');
      const d = infoEl.querySelector('.rigging-do');
      if (d) d.addEventListener('click', () => { attempt(s, null); });
      infoEl.querySelector('.rgi-close').addEventListener('click', () => { hideInfo(); S.sel = null; refresh(); });
    }
    function hideInfo() { infoEl.hidden = true; }

    // tap a fitted part on the boat (or the sailor's life jacket) → learn what it is
    const onPartTap = e => {
      if (S.phase !== 'play') return;
      const pe = e.target.closest && e.target.closest('.rig-part');
      if (!pe || pe.classList.contains('rig-ghost')) return;
      const k = pe.getAttribute('data-k');
      if (!k || !inst[k]) return;
      const s = steps.find(o => o.k === k && !o.done);
      sfx('tap', { vol: 0.5 });
      if (s && unrig) { S.sel = s; showInfo(k, s); refresh(); } else showInfo(k, null);
    };
    boatIn.addEventListener('click', onPartTap);
    kidG.addEventListener('click', onPartTap);

    // ---- drag & drop
    function layerXY(e) { const r = host.layer.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function zoneScreen(s) {
      const z = zoneEl[s.i];
      if (!z) return null;
      const r = z.querySelector('.rgz-dot').getBoundingClientRect(), lr = host.layer.getBoundingClientRect();
      return { x: r.left + r.width / 2 - lr.left, y: r.top + r.height / 2 - lr.top };
    }
    const SNAP = assist === 'easy' ? 95 : assist === 'pro' ? 55 : 75;
    function onCardDown(e, s) {
      if (S.phase !== 'play' || S.drag) return;
      if (e.button !== undefined && e.button > 0) return;
      const card = cardEl[s.i];
      const p0 = layerXY(e);
      S.ptr = true;
      const side = rootEl.classList.contains('tray-side');
      const st = { s, id: e.pointerId, x0: p0.x, y0: p0.y, ghost: null, active: false, near: false, armed: false };
      S.ptrSt = st;
      // touch: holding the card still for a moment arms it, then it can be dragged in any direction
      const touch = e.pointerType !== 'mouse';
      if (touch) st.armT = setTimeout(() => { if (!st.active && S.ptrSt === st) { st.armed = true; card.classList.add('is-armed'); } }, 200);
      const move = ev => {
        if (ev.pointerId !== st.id) return;
        const p = layerXY(ev), dx = p.x - st.x0, dy = p.y - st.y0;
        if (!st.active) {
          // portrait tray scrolls sideways, so a drag starts when the finger moves mostly up (or left for a side tray)
          // the tray scrolls sideways (or up/down for a side tray): a quick swipe along it scrolls; a move towards the boat
          // (or any move after holding the card) drags
          const ok = ev.pointerType === 'mouse' || st.armed ? Math.hypot(dx, dy) > 6 : side ? (-dx > 8 && Math.abs(dx) > Math.abs(dy) * 0.6) : (-dy > 8 && Math.abs(dy) > Math.abs(dx) * 0.4);
          if (!ok) { if (Math.hypot(dx, dy) > 14 && ev.pointerType !== 'mouse') cleanup(); else if (Math.hypot(dx, dy) > 6) clearTimeout(st.armT); return; }
          clearTimeout(st.armT);
          card.classList.remove('is-armed');
          st.active = true;
          S.drag = st;
          card.__noClick = true;
          try { card.setPointerCapture(st.id); } catch (er) { /* ignore */ }
          st.ghost = doc.createElement('div');
          st.ghost.className = 'rigging-ghost';
          st.ghost.innerHTML = icon(s.k, col) + '<span>' + esc(jobLabel(s.k, s.type)) + '</span>';
          host.layer.appendChild(st.ghost);
          card.classList.add('is-dragging');
          zoneScale();
          sfx('whoosh', { vol: 0.25, pitch: 1.4 });
          start();
          if (S.sel !== s) { S.sel = s; hideInfo(); }
        }
        ev.preventDefault();
        st.ghost.style.transform = 'translate(' + f(p.x) + 'px,' + f(p.y) + 'px) translate(-50%,-70%)';
        if (!s.decoy) {
          const z = zoneScreen(s);
          const near = !!z && Math.hypot(z.x - p.x, z.y - p.y) < SNAP;
          if (near !== st.near) {
            st.near = near; zoneEl[s.i].classList.toggle('hot', near); st.ghost.classList.toggle('hot', near);
            if (near) sfx('tap', { vol: 0.35, pitch: 1.6 });
            refresh();
            if (partEl[s.k]) partEl[s.k].classList.toggle('hot', near);
          }
        }
        st.last = p;
      };
      const up = ev => {
        if (ev.pointerId !== st.id) return;
        const wasActive = st.active;
        const p = st.last || layerXY(ev);
        cleanup();
        if (!wasActive) return;
        const scr = sceneEl.getBoundingClientRect(), lr = host.layer.getBoundingClientRect();
        const overBoat = p.y + lr.top < scr.bottom - 10 && p.x + lr.left > scr.left && p.x + lr.left < scr.right;
        if (s.decoy) { if (overBoat) attempt(s, p, st.ghost); else flyBack(st.ghost, card); return; }
        if (st.near) attempt(s, p, st.ghost);
        else { flyBack(st.ghost, card); if (overBoat) tip('miss', 'rigging.coach.miss'); }
      };
      const cancel = ev => { if (ev.pointerId !== st.id) return; const g0 = st.ghost; cleanup(); if (g0) flyBack(g0, card); };
      function cleanup() {
        S.ptr = false;
        clearTimeout(st.armT);
        if (S.ptrSt === st) S.ptrSt = null;
        card.classList.remove('is-armed');
        root.removeEventListener('pointermove', move);
        root.removeEventListener('pointerup', up);
        root.removeEventListener('pointercancel', cancel);
        card.classList.remove('is-dragging');
        if (zoneEl[s.i]) zoneEl[s.i].classList.remove('hot');
        if (partEl[s.k]) partEl[s.k].classList.remove('hot');
        if (S.drag === st) S.drag = null;
        refresh();
      }
      S.cleanupDrag = cleanup;
      root.addEventListener('pointermove', move);
      root.addEventListener('pointerup', up);
      root.addEventListener('pointercancel', cancel);
    }
    function flyBack(ghost, card) {
      if (!ghost) return;
      const r = card.getBoundingClientRect(), lr = host.layer.getBoundingClientRect();
      ghost.classList.add('back');
      ghost.style.transform = 'translate(' + f(r.left + r.width / 2 - lr.left) + 'px,' + f(r.top + r.height / 2 - lr.top) + 'px) translate(-50%,-50%) scale(.6)';
      setTimeout(() => ghost.remove(), 300);
    }
    function flyTo(ghost, s) {
      const z = zoneScreen(s);
      if (!ghost || !z) { if (ghost) ghost.remove(); return; }
      ghost.classList.add('snap');
      ghost.style.transform = 'translate(' + f(z.x) + 'px,' + f(z.y) + 'px) translate(-50%,-50%) scale(.35)';
      setTimeout(() => ghost.remove(), 240);
    }

    // ---- drag demo: a ghost finger drags the first part from the tray onto its spot (a static hint with reduced motion).
    // Shown when the activity starts; any touch, click or key stops it.
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
      if (S.demoDone || autopilot || S.phase !== 'play' || S.doneN > 0) return;
      const s = nextStep(), card = s && cardEl[s.i];
      if (!card) return;
      try { card.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old browsers */ }
      const lr = host.layer.getBoundingClientRect(), cr = card.getBoundingClientRect(), z = zoneScreen(s);
      if (!z || !cr.width) return;
      const x0 = cr.left + cr.width / 2 - lr.left, y0 = cr.top + cr.height * 0.42 - lr.top, x1 = z.x, y1 = z.y;
      const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - Math.max(30, Math.abs(x1 - x0) * 0.25);
      const xm = (x0 + 2 * cx + x1) / 4, ym = (y0 + 2 * cy + y1) / 4;
      const still = reducedMotion();
      const el = doc.createElement('div');
      el.className = 'rigging-demo' + (still ? ' still' : '');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = '--x0:' + f(x0) + 'px;--y0:' + f(y0) + 'px;--xm:' + f(xm) + 'px;--ym:' + f(ym) + 'px;--x1:' + f(x1) + 'px;--y1:' + f(y1) + 'px';
      el.innerHTML = '<svg class="rgd-path" width="100%" height="100%"><path d="M' + f(x0) + ' ' + f(y0) + 'Q' + f(cx) + ' ' + f(cy) + ' ' + f(x1) + ' ' + f(y1) + '"/>' +
        '<circle cx="' + f(x1) + '" cy="' + f(y1) + '" r="7"/></svg>' +
        '<div class="rgd-mover"><div class="rgd-item">' + icon(s.k, col) + '</div><div class="rgd-hand">' + HAND_SVG + '</div><div class="rgd-label">' + esc(t('rigging.demo')) + '</div></div>';
      host.layer.appendChild(el);
      demo = { el, s };
      const mover = el.querySelector('.rgd-mover');
      if (!still) mover.addEventListener('animationend', () => stopDemo(true));
      demo.timer = setTimeout(() => stopDemo(true), still ? 9000 : 8000);
    }
    const onAnyInput = () => { if (demo || !S.demoDone) stopDemo(true); };
    rootEl.addEventListener('pointerdown', onAnyInput, true);
    root.addEventListener('keydown', onAnyInput, true);

    // ---- doing a job
    function attempt(s, p, ghost) {
      if (S.phase !== 'play' || !s || s.done) { if (ghost) ghost.remove(); return; }
      start();
      if (s.decoy) { mistake(s, null, ghost); return; }
      if (!available(s)) { mistake(s, blocking(s), ghost); return; }
      if (ghost) flyTo(ghost, s);
      complete(s);
    }
    function mistake(s, need, ghost) {
      S.mistakes++; S.penalty += PEN; S.streak = 0;
      sfx('bump', { vol: 0.7, pitch: 0.7 });
      const c = cardEl[s.i];
      if (ghost) flyBack(ghost, c);
      if (c) { c.classList.remove('rg-shake'); void c.offsetWidth; c.classList.add('rg-shake'); }
      const z = s.decoy ? null : zoneScreen(s);
      floatText(t('rigging.fx.oops', { s: PEN }), z ? z.x : null, z ? z.y : null, 'bad');
      if (s.decoy) {
        KOS.UI.coach(s.k === 'fold' ? t('rigging.coach.fold') : t('rigging.decoy.' + clsId), { pos: 'top', mood: 'oops' });
        // the decoy goes away once explained
        if (c) { c.classList.add('gone'); setTimeout(() => c.remove(), 350); }
        delete cardEl[s.i];
        if (S.sel === s) { S.sel = null; hideInfo(); }
      } else if (need) {
        const key = need.type === 'off' && s.type === 'off' ? 'rigging.coach.orderOff' : (need.type === s.type ? 'rigging.coach.order' : 'rigging.coach.orderMix');
        KOS.UI.coach(t(key, { part: jobLabel(s.k, s.type), need: jobLabel(need.k, need.type) }), { pos: 'top', mood: 'oops' });
        if (assist !== 'pro') { const nc = cardEl[need.i]; if (nc) { nc.classList.remove('rg-hint'); void nc.offsetWidth; nc.classList.add('rg-hint'); scrollCard(nc); } }
      }
      bumpHud();
      refresh();
    }
    function complete(s) {
      stopDemo(true);
      s.done = true; S.doneN++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      const c = cardEl[s.i];
      if (c) { c.classList.add('gone'); setTimeout(() => c.remove(), 350); }
      delete cardEl[s.i];
      if (S.sel === s) { S.sel = null; hideInfo(); }
      const z = zoneScreen(s);
      // the part itself
      if (s.k === 'hose') rinse();
      else if (s.k === 'roll') { groundSail = 'rolled'; drawGroundSail(); popFx(s); }
      else if (s.type === 'on') { inst[s.k] = true; drawPart(s.k, 'pop'); if (s.k === 'jib' && inst.jibsheets) drawPart('jibsheets'); }
      else {
        inst[s.k] = false;
        if (s.k === 'jib' && inst.jibsheets) setTimeout(() => drawPart('jibsheets'), 480);
        const e = partEl[s.k];
        if (e) { e.setAttribute('class', 'rig-part off'); setTimeout(() => { if (!inst[s.k]) clearPart(s.k); }, 480); }
        if (unrig && (((s.k === 'sail' || s.k === 'optiRig') && !g.keelboat) || (s.k === 'jib' && g.keelboat))) { groundSail = 'flat'; setTimeout(() => { drawGroundSail(); }, 300); }
      }
      if (s.k === 'boom' && partEl.cover && inst.cover) drawPart('cover');
      sfx(SOUND[s.k] || 'rope', { vol: 0.8 });
      setTimeout(() => sfx('coin', { vol: 0.35, pitch: 1 + Math.min(8, S.streak) * 0.06 }), 120);
      sparkle(s.zx, s.zy);
      floatText(S.streak >= 3 ? t('rigging.fx.streak', { n: S.streak }) : (s.k === 'hose' ? t('rigging.fx.rinse') : s.k === 'roll' ? t('rigging.fx.roll') : pname(s.k) + ' ✓'), z ? z.x : null, z ? z.y : null, 'good');
      const left = remaining();
      if (S.streak === 5) tip('streak', 'rigging.coach.streak');
      else if (left === Math.floor(steps.length / 2) && steps.length >= 8) tip('half', 'rigging.coach.half');
      else if (left === 1) tip('last', 'rigging.coach.last');
      if (left === 0) finishRun();
      bumpHud();
      refresh();
      const n = nextStep();
      if (n && assist === 'easy' && cardEl[n.i]) scrollCard(cardEl[n.i]);
    }
    function scrollCard(c) { try { c.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* old browsers */ } }
    function tip(id, key, vars) {
      if (S.tips[id]) return;
      S.tips[id] = true;
      KOS.UI.coach(t(key, vars), { pos: 'top' });
    }
    function bumpHud() { S.hudT = 0; }

    // ---- juice
    function floatText(txt, x, y, kind) {
      const e = doc.createElement('div');
      e.className = 'rigging-float ' + (kind || '');
      e.textContent = txt;
      const lr = host.layer.getBoundingClientRect(), sr = sceneEl.getBoundingClientRect();
      e.style.left = f(x != null ? x : sr.left - lr.left + sr.width / 2) + 'px';
      e.style.top = f(y != null ? y - (kind === 'good' ? 34 : 0) : sr.top - lr.top + sr.height * 0.45) + 'px';
      host.layer.appendChild(e);
      setTimeout(() => e.remove(), 1200);
    }
    function sparkle(x, y) {
      const m = svg.getScreenCTM(), k = m ? 1 / m.a : 1;
      let s = '';
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + rand() * 0.3, d = (26 + rand() * 18) * k;
        s += '<g class="rgs-p" style="--dx:' + f(Math.cos(a) * d) + 'px;--dy:' + f(Math.sin(a) * d) + 'px;animation-delay:' + f(rand() * 60) + 'ms"><path d="M0 ' + f(-5 * k) + 'L' + f(1.4 * k) + ' ' + f(-1.4 * k) + 'L' + f(5 * k) + ' 0L' + f(1.4 * k) + ' ' + f(1.4 * k) + 'L0 ' + f(5 * k) + 'L' + f(-1.4 * k) + ' ' + f(1.4 * k) + 'L' + f(-5 * k) + ' 0L' + f(-1.4 * k) + ' ' + f(-1.4 * k) + 'Z" fill="' + (i % 2 ? '#ffd25e' : '#fff') + '"/></g>';
      }
      s += '<circle class="rgs-ring" r="' + f(8 * k) + '" fill="none" stroke="#ffd25e" stroke-width="' + f(3 * k) + '"/>';
      const e = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      e.setAttribute('class', 'rig-sparkle');
      e.setAttribute('transform', 'translate(' + f(x) + ' ' + f(y) + ')');
      e.innerHTML = s;
      fxG.appendChild(e);
      setTimeout(() => e.remove(), 900);
    }
    function popFx(s) { sparkle(s.zx, s.zy); }
    function rinse() {
      const m = svg.getScreenCTM(), k = m ? 1 / m.a : 1;
      const e = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      e.setAttribute('class', 'rig-rinse');
      let s = '';
      const x0 = g.xs + g.L * 0.1, x1 = g.xb - g.L * 0.1;
      for (let i = 0; i < 46; i++) {
        const x = x0 + (x1 - x0) * rand(), y = g.deck - 40 * k - rand() * 60 * k;
        s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f((2 + rand() * 2.5) * k) + '" fill="#bfeaff" style="animation-delay:' + f(rand() * 700) + 'ms"/>';
      }
      e.innerHTML = s;
      fxG.appendChild(e);
      setTimeout(() => sfx('splash', { vol: 0.5, pitch: 1.3 }), 300);
      setTimeout(() => e.remove(), 1700);
      boatG.classList.add('shine');
    }

    // ---- end of the run
    function finishRun() {
      S.phase = 'end'; S.endT = 0;
      hideInfo(); S.sel = null;
      const timeS = S.time + S.penalty;
      const N = steps.length;
      const per = assist === 'easy' ? 8 : assist === 'pro' ? 4.5 : 6;
      const ref = 6 + N * per;
      const allow3 = assist === 'easy' ? 2 : assist === 'pro' ? 0 : 1;
      const allow2 = assist === 'easy' ? 5 : assist === 'pro' ? 2 : 3;
      const stars = S.mistakes <= allow3 && timeS <= ref ? 3 : S.mistakes <= allow2 && timeS <= ref * 1.7 ? 2 : 1;
      const score = Math.max(100, Math.round(1000 + N * 100 - S.mistakes * 120 - timeS * 6));
      const tstr = fmt(timeS * 1000);
      S.result = {
        stars, score, timeMs: Math.round(timeS * 1000), success: true,
        stats: { 'rigging.stat.steps': N, 'rigging.stat.oops': S.mistakes, 'rigging.stat.penalty': S.penalty + ' s' },
        msgKey: unrig ? 'rigging.res.unrig' : 'rigging.res.rig', msgVars: { boat: boatName, time: tstr, oops: S.mistakes },
      };
      rootEl.classList.add('is-done');
      // decoys nobody fell for just slip away
      decoys.forEach(d => { const c = cardEl[d.i]; if (c) { c.classList.add('gone'); delete cardEl[d.i]; } });
      KOS.UI.coach(t(unrig ? 'rigging.coach.doneUnrig' : g.keelboat ? 'rigging.coach.doneRigKeel' : 'rigging.coach.doneRig'), { pos: 'top', mood: 'wow' });
      sfx('cheer', { vol: 0.55 });
      if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* ignore */ } }
      if (unrig) {
        stampEl.textContent = t('rigging.done.packed');
        stampEl.hidden = false;
        setTimeout(() => stampEl.classList.add('in'), 500);
      }
    }
    function fmt(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

    // sail-off animation (sim-time driven, see render)
    // Dinghies are backed down the slipway STERN FIRST: the sailor (life jacket on) holds the trolley handle at the bow and
    // pushes the boat backwards into the water until it floats off, hops in, the boat turns round and sails away.
    // Keelboats: the sailor steps aboard and the boat motors/sails out from the pontoon.
    const slope = 0.18;
    const groundAt = x => (x >= g.xW ? 0 : (g.xW - x) * slope); // ramp runs down to the left
    let viewCx = 0; // world x at the centre of the view (set by layout)
    const LT = { push0: 0.5, push1: 3.3, hop: 3.45, hopD: 0.4, foil0: 3.95, foil1: 4.55, float1: 4.65, turn1: 5.45, end: 7.9 };
    let anim = { bx: 0, by: 0, ba: 0, sx: 1, cam: 0, camY: 0, fly: false };
    // only ONE sailor at a time: the kid hops from where it stands into the cockpit (sim-time driven), and only when it
    // lands is the standing kid hidden and the sitting crew drawn in the boat
    function boardKid() {
      if (anim.aboard) return;
      anim.aboard = true;
      kidG.classList.add('aboard');
      drawPart('crew');
    }
    // where the crew sits, in world coords, for a boat at (bx, by) (rotation ignored: it is small while hopping)
    function crewAt(bx, by) {
      const x = g.xs + g.L * (g.keelboat ? 0.16 : 0.3);
      return { x: bx + x, y: by + g.dAt(x) + g.kid.h * 0.36 };
    }
    // kid transform while hopping from (fx, fy) world feet to the cockpit; boards when done. Returns null when not hopping.
    function hopKid(T, T0, fx, fy, bx, by) {
      if (anim.aboard || T < T0) return null;
      const u = (T - T0) / LT.hopD;
      if (u >= 1) { boardKid(); return null; }
      // jump in front of the sail, then drop in behind the hull so the gunwale hides the legs as the sailor sits down
      const front = u < 0.75;
      if (front !== (kidG.previousElementSibling === boatG)) { if (front) boatG.after(kidG); else boatG.before(kidG); }
      const c = crewAt(bx, by), e = ease(u);
      const x = fx + (c.x - fx) * e, y = fy + (c.y - fy) * e - Math.sin(Math.PI * u) * g.kid.h * 0.45;
      return kidTf(g.kid, x - g.kid.x, y - g.kid.y);
    }
    function sailOff(T) {
      if (unrig) return;
      const a = anim;
      if (g.keelboat) {
        const hk = hopKid(T, 0.3, g.kid.x, g.kid.y, 0, 0);
        if (hk) a.kidTf = hk;
        const τ = Math.max(0, T - 0.8);
        a.bx = 22 * τ * τ + 10 * τ; a.by = Math.sin(T * 2.2) * 1.5; a.ba = -Math.min(5, τ * 3); a.cam = Math.max(0, a.bx - 40);
        a.boatTf = 'translate(' + f(a.bx) + ' ' + f(a.by) + ') rotate(' + f(a.ba) + ')';
        if (τ > 1.2 && !a.fly && inst.gennaker) { a.fly = true; drawPart('gennakerFly', 'pop'); clearPart('gennaker'); sfx('flap', { vol: 0.8 }); sfx('pop', { pitch: 0.7 }); }
        return;
      }
      const kd = g.kid, k = kd.k;
      // trolley: one wheel pair (axle A) + the handle the sailor holds (grip G). The sailor stays upright on the ramp, so the
      // trolley pivots on its axle to keep the handle at the sailor's hand height.
      const ax = -g.L * 0.06, ay = -18, Gx = g.xb + 62, Gy = -70, Dx = Gx - ax, Dy = Gy - ay;
      const wheelDeep = (g.waterY + 6) + 22; // how far down the ramp the wheels go (well into the water)
      const P = (g.xW - wheelDeep / slope) - ax; // trolley offset when fully pushed in (negative)
      const τ1 = U.clamp((T - LT.push0) / (LT.push1 - LT.push0), 0, 1);
      const tx = P * ease(τ1), dw = groundAt(tx + ax);
      let φ = 0, kx = kd.x + tx, dk = 0;
      for (let it = 0; it < 3; it++) {
        dk = groundAt(kx);
        const sn = U.clamp(((Dy + dk - dw) - Dy * Math.cos(φ)) / Dx, -0.6, 0.6);
        φ = Math.asin(sn);
        kx = ax + tx + Dx * Math.cos(φ) - Dy * Math.sin(φ) + 30 * k;
      }
      const φd = φ * 180 / Math.PI;
      a.trolleyTf = 'translate(' + f(tx) + ' ' + f(dw) + ') rotate(' + f(φd) + ' ' + f(ax) + ' ' + f(ay) + ')';
      const walking = τ1 > 0 && τ1 < 1;
      a.kidTf = kidTf(kd, kx - kd.x, dk - (walking ? Math.abs(Math.sin(T * 9)) * 2 : 0));
      const floatDy = g.waterY + 62;
      if (T < LT.push1) { a.bx = tx; a.by = dw; a.ba = φd; a.sx = 1; }
      else {
        if (!a.splash) { a.splash = true; sfx('splash', { vol: 0.7 }); }
        const τf = ease(U.clamp((T - LT.push1) / (LT.float1 - LT.push1), 0, 1));
        const bob = Math.sin(T * 3) * 2 * τf;
        a.bx = tx - 46 * τf; a.by = dw + (floatDy - dw) * τf + bob; a.ba = φd * (1 - τf);
        if (T >= LT.hop) { const hk = hopKid(T, LT.hop, kx, kd.y + dk, a.bx, a.by); if (hk) a.kidTf = hk; }
        // afloat with the sailor aboard: push the daggerboard down and lower the rudder blade
        const fd = ease(U.clamp((T - LT.foil0) / (LT.foil1 - LT.foil0), 0, 1));
        if (fd !== foilsDown) {
          if (foilsDown === 0) { sfx('rigClick', { vol: 0.6 }); if (!reducedMotion()) floatText(t('rigging.fx.foils'), null, null, 'good'); }
          foilsDown = fd;
          if (inst.rudder) drawPart('rudder');
          if (inst.daggerboard) drawPart('daggerboard');
        }
        // turn round (seen from the side: the boat flips to face the other way), then sail off to the left
        const τt = U.clamp((T - LT.float1) / (LT.turn1 - LT.float1), 0, 1);
        a.sx = Math.cos(Math.PI * ease(τt));
        if (Math.abs(a.sx) < 0.08) a.sx = a.sx < 0 ? -0.08 : 0.08;
        a.bx -= 14 * τt;
        const τs = Math.max(0, T - LT.turn1);
        a.bx -= 30 * τs * τs + 20 * τs;
        a.ba += τs > 0 ? Math.min(6, τs * 3) : 0;
        if (τs > 0.6 && !a.fly && inst.gennaker) { a.fly = true; drawPart('gennakerFly', 'pop'); clearPart('gennaker'); sfx('flap', { vol: 0.8 }); sfx('pop', { pitch: 0.7 }); }
      }
      a.boatTf = 'translate(' + f(a.bx) + ' ' + f(a.by) + ') rotate(' + f(a.ba) + ' ' + f(ax) + ' ' + f(ay) + ') scale(' + f(a.sx) + ' 1)';
      // camera: keep sailor + boat framed while pushing, then ease over to centre the boat once it floats
      const λ = ease(U.clamp((T - LT.push1) / (LT.turn1 - LT.push1), 0, 1));
      a.cam = a.bx - (viewCx - (g.xs + g.xb) / 2) * λ;
      boatG.classList.toggle('flipped', a.sx < 0);
      a.camY = Math.max(0, a.by - 16) * 0.8; // follow the boat down the ramp so it never hides behind the tray
    }

    // ---- keyboard
    function cardsInOrder() { return Array.prototype.slice.call(cardsEl.querySelectorAll('.rigging-card:not(.gone)')); }
    function onKey(e) {
      if (S.phase !== 'play' || (host.isPaused && host.isPaused())) return;
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const list = cardsInOrder();
      if (!list.length) return;
      const curI = S.sel ? list.indexOf(cardEl[S.sel.i]) : -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'd' || e.key === 'a') {
        const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd') ? 1 : -1;
        const ni = curI < 0 ? (dir > 0 ? 0 : list.length - 1) : (curI + dir + list.length) % list.length;
        const c = list[ni];
        select(byI(+c.dataset.i));
        try { c.focus({ preventScroll: true }); } catch (er) { c.focus(); }
        scrollCard(c);
        e.preventDefault();
      } else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'f') && S.sel) {
        e.preventDefault();
        attempt(S.sel, null);
      }
    }
    root.addEventListener('keydown', onKey);

    // ---- layout (side tray on landscape phones)
    function layout() {
      const w = host.layer.clientWidth, h = host.layer.clientHeight;
      rootEl.classList.toggle('tray-side', w > h && h < 560);
      // narrow (portrait) scenes: crop the side margins and stand the boat on the bottom edge, so it is as big as possible
      const sw = sceneEl.clientWidth || w, sh = sceneEl.clientHeight || h;
      // fit the rigged boat under the HUD (top 60 px reserved) and stand it on the bottom edge
      const side = rootEl.classList.contains('tray-side');
      const top = !side && sw >= 700 ? Math.min(150, sh * 0.22) : 60, availH = Math.max(80, sh - top), y1 = vb.y + vb.h;
      let x0 = vb.x, x1 = vb.x + vb.w;
      let s = Math.min(sw / (x1 - x0), availH / vb.h);
      if (s < availH / vb.h) { // width-limited: crop the side margins
        x0 = Math.min(g.xs - 34, g.boomX - 14, g.kid.x0 - 12); x1 = Math.max(g.xb + (g.keelboat ? 70 : 74), g.kid.x1 + 14);
        s = Math.min(sw / (x1 - x0), availH / vb.h);
      }
      const vw = sw / s, vh = sh / s, cx = (x0 + x1) / 2;
      viewCx = cx;
      svg.setAttribute('viewBox', f(cx - vw / 2) + ' ' + f(y1 - vh) + ' ' + f(vw) + ' ' + f(vh));
      svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
      zoneScale();
    }
    const onResize = () => layout();
    root.addEventListener('resize', onResize);

    // ---- instance
    function update(dt) {
      if (S.phase === 'play') {
        if (S.started) S.time += dt;
        if (autopilot && (S.botT -= dt) <= 0) { S.botT = 0.45; doNext(); }
      } else if (S.phase === 'end') {
        S.endT += dt;
        // reduced motion: no launch film, just the boat afloat with the sailor aboard
        sailOff(reducedMotion() && !unrig ? (g.keelboat ? 3 : LT.turn1 + 0.6) : S.endT);
        if (!S.finishing && S.endT > (unrig ? 3.2 : reducedMotion() ? 2.6 : g.keelboat ? 5.2 : LT.end)) { S.finishing = true; host.finish(S.result); }
      }
      if ((S.ambT -= dt) <= 0) { S.ambT = 0.5; try { KOS.Audio.ambient({ wind: 7, waves: 0.25, harbor: 0.9 }); } catch (e) { /* optional */ } }
      if ((S.gullT -= dt) <= 0) { S.gullT = 9 + rand() * 10; sfx('gull', { vol: 0.25, pitch: 0.9 + rand() * 0.3 }); }
      if ((S.hudT -= dt) <= 0) {
        S.hudT = 0.1;
        hud.update({ timer: (S.time + S.penalty) * 1000, custom: { steps: S.doneN + '<small>/' + steps.length + '</small>', oops: String(S.mistakes) } });
      }
    }
    function render() {
      if (S.phase !== 'end' || unrig) return;
      const a = anim;
      worldG.setAttribute('transform', 'translate(' + f(-a.cam) + ' ' + f(-(a.camY || 0)) + ')');
      skylineG.setAttribute('transform', 'translate(' + f(-a.cam * 0.25) + ' ' + f(-(a.camY || 0)) + ')');
      if (a.trolleyTf) trolleyG.setAttribute('transform', a.trolleyTf);
      if (a.kidTf) kidIn.setAttribute('transform', a.kidTf);
      if (a.boatTf) boatG.setAttribute('transform', a.boatTf);
      if (g.keelboat ? S.endT > 1 : S.endT > LT.turn1) {
        const wy = g.keelboat ? 0 : g.waterY + 2;
        if (g.keelboat) {
          const sx = a.bx + g.xs, wx0 = Math.max(-4000, sx - 320);
          wakeG.innerHTML = '<path d="M' + f(Math.min(wx0, sx - 10)) + ' ' + f(wy + 2) + 'Q' + f(sx - 20) + ' ' + f(wy + 6) + ' ' + f(sx + 30) + ' ' + f(wy) + '" stroke="rgba(255,255,255,.7)" stroke-width="5" fill="none" stroke-linecap="round"/>' +
            '<path d="M' + f(a.bx + g.xb - 10) + ' ' + f(wy) + 'q10 -8 22 -2" stroke="#fff" stroke-width="3" fill="none"/>';
        } else {
          // turned round: the stern is now on the right (bx - xs), the bow on the left
          const sx = a.bx - g.xs, bw = a.bx - g.xb;
          wakeG.innerHTML = '<path d="M' + f(sx + 260) + ' ' + f(wy + 2) + 'Q' + f(sx + 20) + ' ' + f(wy + 6) + ' ' + f(sx - 30) + ' ' + f(wy) + '" stroke="rgba(255,255,255,.7)" stroke-width="5" fill="none" stroke-linecap="round"/>' +
            '<path d="M' + f(bw + 10) + ' ' + f(wy) + 'q-10 -8 -22 -2" stroke="#fff" stroke-width="3" fill="none"/>';
        }
      }
    }
    function destroy() {
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('keydown', onAnyInput, true);
      stopDemo(true);
      root.removeEventListener('resize', onResize);
      if (S.drag && S.drag.ghost) S.drag.ghost.remove();
      if (S.cleanupDrag) { try { S.cleanupDrag(); } catch (e) { /* already gone */ } }
      host.layer.querySelectorAll('.rigging-ghost,.rigging-float').forEach(n => n.remove());
      hud.destroy();
      rootEl.remove();
      try { KOS.Audio.ambient(null); } catch (e) { /* optional */ }
    }
    function doNext() {
      if (S.phase !== 'play') return false;
      const n = nextStep();
      if (!n) return false;
      start();
      attempt(n, null);
      return true;
    }

    layout();
    refresh();
    // intro
    const introKey = unrig ? (g.keelboat ? 'rigging.intro.unrigKeel' : 'rigging.intro.unrig') : (g.keelboat ? 'rigging.intro.rigKeel' : 'rigging.intro.rig');
    const hudSync = () => hud.update({ timer: 0, custom: { steps: '0<small>/' + steps.length + '</small>', oops: '0' } });
    hudSync();
    if (unrig) boatG.classList.add('wet');

    return {
      start() { KOS.UI.coach(t(introKey, { boat: boatName }), { pos: 'top', ms: 9000 }); setTimeout(zoneScale, 50); setTimeout(() => { if (!S.demoDone) startDemo(); }, 900); },
      update, render, destroy,
      pause() { try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } },
      resume() {},
      onResize() { layout(); if (demo) startDemo(); },
      setAutopilot(on) { autopilot = !!on; if (autopilot) stopDemo(true); },
      skipIntro() { stopDemo(true); },
      doNext,
      state: S, steps, decoys,
      select: i => select(byI(i)),
      attempt: i => attempt(byI(i), null),
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
