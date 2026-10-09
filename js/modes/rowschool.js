// KØS SEJL — js/modes/rowschool.js
// Mode 'rowschool' (hub area 'rules', "Vigeregelskolen"): right-of-way scenarios.
// Every scenario runs three phases:
//   1. ASK      a frozen situation in KOS.SailScene (boats + course arrows + wind arrow), "Hvem skal vige?" — tap a boat
//               or a choice chip (keys 1/2/3).
//   2. EXPLAIN  the rule (KOS.Rules decides it) with a kid-friendly reason, plus an animated replay: the real simulation
//               run by the autopilot, so the replay is exactly "how to sail it".
//   3. SAIL IT  the player handles the situation live. KOS.Rules is re-checked every step (who is give-way right now) and
//               local checks catch collisions, getting too close, changing course when you have right of way, crossing
//               ahead, head-on to port, sitting in the ferry's way… → "Prøv igen".
// Stars per activity: first-try correct answers + clean first sails (stricter in Pro, generous in Let).
//
// Scenario geometry is built from speeds, so it works for every boat class: the player's steady speed comes from the
// real physics (table per class), the conflict point C is where both would arrive after T seconds if nobody acts.
// Test hooks on the instance: setAutopilot(on), skipIntro(), validate() (runs every scenario: autopilot and
// "hold course" runs, reports fails), state.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    rowschool: {
      you: 'Dig', youTag: 'DIG', both: 'Begge', q: 'Hvem skal vige?', tapBoat: '… eller tryk på en af bådene',
      kicker: 'Situation {n} af {m}', hud: { sit: 'Situation' },
      right: 'Rigtigt!', right2: 'Rigtigt – i andet forsøg!', wrong: 'Ikke helt …', wrongTry: 'Prøv igen!',
      btn: { go: 'Sejl den selv!', replay: 'Se igen', retry: 'Prøv igen', watch: 'Se løsningen' },
      replay: 'GENSPIL', wind: 'VIND', goal: 'MÅL', zone: 'Zone: 3 bådlængder', channel: 'SEJLRENDE',
      tag: { give: 'VIGER', stand: 'HOLDER KURS', both: 'TIL STYRBORD' },
      role: {
        give: 'Du skal vige', stand: 'Du har ret – hold kurs og fart', both: 'Drej til styrbord (højre)',
        avoid: 'Du har ret … men hold øje!', keepout: 'Kom væk fra færgens vej!', keepShip: 'Hold dig langt væk fra skibet!',
        room: 'Du har ret til plads ved mærket', giveRoom: 'Giv plads ved mærket', free: 'Sejl hen til målet',
      },
      fail: {
        bump: { t: 'Bump!', d: 'I ramte hinanden. Prøv igen – og hold god afstand.' },
        close: { t: 'For tæt på!', d: 'Den, der skal vige, skal holde så god afstand, at den anden aldrig bliver i tvivl.' },
        closeBig: { t: 'Alt for tæt på!', d: 'Store skibe laver kæmpe bølger og kan ikke se dig tæt på. Hold meget mere afstand.' },
        course: { t: 'Du ændrede kurs!', d: 'Når du har ret, skal du holde din kurs, så den anden ved, hvad du gør.' },
        slow: { t: 'Du stoppede!', d: 'Når du har ret, skal du holde både kurs og fart.' },
        ahead: { t: 'Du sejlede foran!', d: 'Gå agten om den anden – altså bag om dens hæk. Aldrig lige foran dens stævn.' },
        port: { t: 'Forkert vej!', d: 'Når I mødes snude mod snude, drejer begge til styrbord (højre). Så passerer I bagbord mod bagbord.' },
        lane: { t: 'Du er i vejen!', d: 'Færgen kan ikke dreje udenom dig i sejlrenden. Kom hurtigt til side!' },
        mark: { t: 'Du ramte mærket!', d: 'Rund tæt om mærket – men rør det ikke.' },
        late: { t: 'Tiden løb ud', d: 'Sejl hen til den gyldne ring, når situationen er klaret.' },
        miss: { t: 'Du sejlede forbi målet', d: 'Når situationen er klaret, skal du sejle hen til den gyldne MÅL-ring.' },
      },
      ok: 'Klaret!', clean: 'Rent sejlet!', allClean: 'Perfekt!', watchOut: 'Pas på!', almost: 'Uha, tæt på!',
      coach: {
        welcome: 'Velkommen i Vigeregelskolen! Først gætter du, hvem der skal vige. Bagefter sejler du situationen selv.',
        keys: 'Styr med ←/→ (eller A/D).', keysRib: 'Styr med ←/→, og giv gas med ↑/↓.',
        twist: 'Mads viger ikke! Regel 14: Alle skal undgå en kollision – også den, der har ret. Drej væk!',
        twistDone: 'Godt reddet! Du havde ret, men du undgik alligevel kollisionen. Det er regel 14.',
        firstFail: 'Bare rolig – nu viser jeg den rigtige vej med en prikket linje.',
        horn5: 'Fem korte tut betyder: “Jeg forstår ikke, hvad du laver – pas på!”',
      },
      hint: {
        R10: 'Tip: Se på vindpilen. Hvilken side af båden kommer vinden ind på?',
        R11: 'Tip: I er på samme halse. Hvem ligger tættest på vinden?',
        R12: 'Tip: Hvem kommer bagfra?',
        R13: 'Tip: Hvem er i gang med at vende?',
        R18: 'Tip: Se zonen rundt om mærket. Hvem ligger inderst?',
        power: 'Tip: Hvem sejler for motor, og hvem sejler for sejl?',
        overtaking: 'Tip: Hvem kommer bagfra og indhenter den anden?',
        headon: 'Tip: Når to motorbåde mødes lige imod hinanden, gør de præcis det samme …',
        crossing: 'Tip: Hvem har den anden båd på sin højre side?',
        big: 'Tip: Hvem kan nemmest dreje udenom – den lille eller den store?',
      },
      rnum: {
        R10: 'Kapsejladsregel 10', R11: 'Kapsejladsregel 11', R12: 'Kapsejladsregel 12', R13: 'Kapsejladsregel 13',
        R14: 'Kapsejladsregel 14', R18: 'Kapsejladsregel 18', 'C-power-sail': 'Søvejsregel 18', 'C-overtaking': 'Søvejsregel 13',
        'C-headon': 'Søvejsregel 14', 'C-crossing': 'Søvejsregel 15', 'C-sail-tack': 'Søvejsregel 12', 'C-sail-lee': 'Søvejsregel 12', narrow: 'Søvejsregel 9', draught: 'Søvejsregel 18',
      },
      rname: { narrow: 'Hold dig ude af vejen i sejlrenden', draught: 'Store skibe kan ikke vige', R14: 'Undgå kollision' },
      reason: {
        R10: {
          me: 'Styrbord har ret! Du sejler for bagbords halse – vinden kommer ind over din venstre side. Derfor skal du holde af vejen for {name}.',
          other: 'Styrbord har ret! Du sejler for styrbords halse – vinden kommer ind over din højre side. {name} er på bagbords halse og skal holde af vejen for dig.',
        },
        R11: {
          me: 'Luv viger for læ! I er på samme halse, og du ligger tættest på vinden (i luv). Så skal du holde dig fri af {name}, der ligger i læ.',
          other: 'Luv viger for læ! {name} ligger tættest på vinden (i luv) og skal holde sig fri af dig. Du ligger i læ og holder bare din kurs.',
        },
        R12: {
          me: 'Den bagerste viger! Du kommer klar agterfra, så du skal holde dig fri af {name} foran dig – styr udenom i god afstand.',
          other: 'Den bagerste viger! {name} kommer bagfra og skal holde sig fri af dig.',
        },
        R13: {
          me: 'Den der vender, viger! Du er midt i en vending og skal holde af vejen, til du er på bidevind igen.',
          other: 'Den der vender, viger! {name} er midt i en vending og skal holde af vejen for dig, til vendingen er helt færdig.',
        },
        R18: {
          me: 'Mærkeplads! {name} ligger inderst ved mærket, inden for zonen på 3 bådlængder. Du ligger udenpå og skal give plads, så {name} kan runde.',
          other: 'Mærkeplads! Du ligger inderst ved mærket, inden for zonen på 3 bådlængder. {name} ligger udenpå og skal give dig plads til at runde.',
        },
        'C-power-sail': {
          me: 'Motor viger for sejl! Du kører for motor, og {name} sejler for sejl. Så er det dig, der skal holde af vejen.',
          other: 'Motor viger for sejl! {name} kører for motor og skal holde af vejen for dig, fordi du sejler for sejl.',
        },
        'C-overtaking': {
          me: 'Den der overhaler, viger – altid! Også selvom du sejler, og {name} kører for motor. Hold dig klar af den hele vejen forbi.',
          other: 'Den der overhaler, viger! {name} kommer bagfra og skal holde sig klar af dig hele vejen forbi.',
        },
        'C-headon': { both: 'Lige imod hinanden! Når to motorbåde mødes snude mod snude, drejer begge til styrbord (højre). Så passerer I bagbord mod bagbord.' },
        'C-crossing': {
          me: 'Krydsende kurser: {name} kommer fra din styrbord side (højre). Så skal du vige – drej til styrbord eller sæt farten ned, og gå agten om.',
          other: 'Krydsende kurser: Du kommer fra højre side af {name}. Så skal {name} vige, og du holder kurs og fart.',
        },
        narrow: { me: 'Normalt viger den, der overhaler. Men færgen kan kun sejle i den dybe sejlrende og kan ikke dreje udenom. Små både må aldrig ligge i vejen for store skibe i en smal sejlrende – så det er dig, der skal væk – ud til styrbord side (højre) af renden!' },
        narrowRib: { me: 'I en smal sejlrende holder alle til styrbord side (højre). Og færgen kan kun sejle i renden – så du skal holde dig af vejen og give den masser af plads.' },
        draught: { me: 'Fragtskibet stikker dybt og skal bruge mere end en kilometer for at stoppe. Det kan ikke vige for dig! Små både holder sig langt væk fra store skibe – også selvom de sejler.' },
      },
      sc: {
        r10a: { title: 'Mødes på kryds', ask: 'Du krydser op mod vinden. Freja kommer fra højre – I er på vej mod samme punkt.', tip: 'Fald af (drej væk fra vinden), og gå agten om Freja. Luf op igen bagefter.', why: 'Husk: Styrbord er højre. Kommer vinden ind over din højre side, er du på styrbords halse.' },
        r10b: { title: 'Hvem kommer der?', ask: 'Du krydser op mod vinden. Oskar kommer fra venstre på kollisionskurs.', tip: 'Du har ret. Hold din kurs – Oskar skal gå agten om dig.' },
        r10c: { title: 'Med vinden agterind', ask: 'Vinden kommer agterfra. Alma kommer fra venstre, og jeres kurser mødes.', tip: 'Du er på bagbords halse. Fald lidt mere af, og lad Alma komme forbi foran dig.', why: 'Bagbord-styrbord-reglen gælder på alle kurser – også på læns. Pas på: Her kommer styrbord-båden fra venstre – tjek altid vindretningen.' },
        r11a: { title: 'Side om side', ask: 'Du og Noah sejler side om side på samme halse. Noah ligger i læ af dig og begynder at luffe op.', tip: 'Luf op sammen med Noah, og hold god afstand.', why: 'Luv er siden, vinden kommer fra. Læ er siden i skyggen af vinden.' },
        r11b: { title: 'En båd i luv', ask: 'Du og Viggo sejler side om side på samme halse. Viggo ligger i luv og kommer tættere på.', tip: 'Hold din kurs. Viggo skal holde sig fri af dig.' },
        r12a: { title: 'Hurtigere bagfra', ask: 'Du sejler hurtigere end Ida, som sejler lige foran dig. Snart indhenter du hende.', tip: 'Styr udenom Ida i god afstand – den bagerste skal vige.' },
        r13a: { title: 'Pludselig vending', ask: 'Ida er midt i en vending lige foran dig.', tip: 'Hold din kurs. Ida skal holde af vejen, mens hun vender.', why: 'En båd vender fra den passerer vindøjet, til den ligger på bidevind igen.' },
        r14a: { title: 'Kollisionskurs', ask: 'Du sejler for styrbords halse. Mads kommer fra venstre for bagbords halse.', tip: 'Du har ret … men hold godt øje med Mads!' },
        r18a: { title: 'Mærket – udenpå', ask: 'I skal rundt om mærket, som holdes om bagbord. Sofie ligger inderst – tættest på mærket.', tip: 'Giv Sofie plads ved mærket. Rund lidt bredere end hende.', why: 'Zonen er en usynlig cirkel på 3 bådlængder rundt om mærket.' },
        r18b: { title: 'Mærket – indenom', ask: 'I skal rundt om mærket. Du ligger inderst, og Emil ligger udenpå.', tip: 'Du får plads. Rund tæt om mærket – men rør det ikke!' },
        ps1: { title: 'Motorbåd på vej', ask: 'Du sejler. En motorbåd kommer fra venstre – lige mod dig.', tip: 'Hold kurs og fart. Motorbåden skal vige for dig.' },
        ov1: { title: 'Den langsomme fiskerbåd', ask: 'En langsom fiskerbåd tøffer af sted foran dig. Du sejler hurtigere.', tip: 'Du overhaler – så er det dig, der skal holde dig klar. Sejl udenom i god afstand.' },
        ps2: { title: 'I RIB’en', ask: 'Du kører klubbens RIB. En sejlbåd krydser din kurs forude.', tip: 'Drej til styrbord (højre) eller sæt farten ned, og gå agten om sejlbåden.' },
        pp1: { title: 'Snude mod snude', ask: 'Du kører RIB. En motorbåd kommer lige imod dig.', tip: 'Drej til styrbord (højre) i god tid. Så passerer I bagbord mod bagbord.' },
        pp2: { title: 'Fra højre', ask: 'Du kører RIB. En motorbåd kommer fra din styrbord side (højre).', tip: 'Drej til styrbord, og gå agten om motorbåden. Aldrig foran!' },
        sh1: { title: 'Færgen kommer', ask: 'Du sejler midt i sejlrenden. Færgen kommer bagfra – og den er stor!', tip: 'Sejl til side mod højre – hurtigt! – ud mod styrbord side af renden.' },
        sh2: { title: 'Kæmpe skib', ask: 'Et kæmpe fragtskib kommer fra højre. Jeres kurser krydser hinanden.', tip: 'Drej til styrbord mod skibets hæk, og hold god afstand. Kryds bag om det.' },
        ex1: { title: 'Travlt i farvandet', ask: 'Der er travlt ved Kalkbrænderiløbet! Du krydser op mod vinden, og Lukas kommer fra højre.', tip: 'Du er på bagbords halse – fald af, og gå agten om Lukas.' },
        ex2: { title: 'Ud gennem renden', ask: 'Du kører RIB ud gennem sejlrenden. Færgen kommer imod dig.', tip: 'Hold til styrbord side af renden (højre), og giv færgen masser af plads.' },
        ex3: { title: 'Trænerbåden', ask: 'Trænerbåden kommer fra højre, mens du sejler.', tip: 'Hold kurs og fart – trænerbåden viger.' },
      },
      res: { msg: 'Du svarede rigtigt {q} af {n} gange i første forsøg og sejlede {s} af {n} situationer rent.' },
      stat: { right: 'Rigtige i 1. forsøg', clean: 'Rene sejladser', tries: 'Sejlforsøg i alt' },
      badge: 'Nyt mærke: Regelekspert!',
    },
  });
  KOS.I18n.add('en', {
    rowschool: {
      you: 'You', youTag: 'YOU', both: 'Both', q: 'Who must give way?', tapBoat: '… or tap one of the boats',
      kicker: 'Situation {n} of {m}', hud: { sit: 'Situation' },
      right: 'Correct!', right2: 'Correct – on the second try!', wrong: 'Not quite …', wrongTry: 'Try again!',
      btn: { go: 'Sail it yourself!', replay: 'Watch again', retry: 'Try again', watch: 'Show me' },
      replay: 'REPLAY', wind: 'WIND', goal: 'GOAL', zone: 'Zone: 3 boat lengths', channel: 'CHANNEL',
      tag: { give: 'GIVES WAY', stand: 'STANDS ON', both: 'TO STARBOARD' },
      role: {
        give: 'You must give way', stand: 'Right of way – hold course and speed', both: 'Turn to starboard (right)',
        avoid: 'Right of way … but watch out!', keepout: 'Get out of the ferry\'s way!', keepShip: 'Keep well clear of the ship!',
        room: 'You are entitled to room at the mark', giveRoom: 'Give room at the mark', free: 'Sail to the goal',
      },
      fail: {
        bump: { t: 'Bump!', d: 'You hit each other. Try again – and keep a good distance.' },
        close: { t: 'Too close!', d: 'The give-way boat must keep so far away that the other boat is never in doubt.' },
        closeBig: { t: 'Far too close!', d: 'Big ships make huge waves and can\'t see you up close. Keep much further away.' },
        course: { t: 'You changed course!', d: 'When you have right of way, hold your course so the other boat knows what you will do.' },
        slow: { t: 'You stopped!', d: 'When you have right of way, hold both your course and your speed.' },
        ahead: { t: 'You crossed ahead!', d: 'Pass astern – behind the other boat\'s stern. Never right in front of its bow.' },
        port: { t: 'Wrong way!', d: 'When you meet head-on, both turn to starboard (right) and pass port side to port side.' },
        lane: { t: 'You\'re in the way!', d: 'The ferry can\'t steer around you in the channel. Get out of its way, fast!' },
        mark: { t: 'You hit the mark!', d: 'Round close to the mark – but don\'t touch it.' },
        late: { t: 'Time\'s up', d: 'Sail to the golden ring once the situation is over.' },
        miss: { t: 'You sailed past the goal', d: 'Once the situation is over, sail into the golden GOAL ring.' },
      },
      ok: 'Done!', clean: 'Clean sailing!', allClean: 'Perfect!', watchOut: 'Watch out!', almost: 'Phew, close!',
      coach: {
        welcome: 'Welcome to the Right-of-Way School! First you guess who must give way. Then you sail the situation yourself.',
        keys: 'Steer with ←/→ (or A/D).', keysRib: 'Steer with ←/→ and throttle with ↑/↓.',
        twist: 'Mads isn\'t giving way! Rule 14: everyone must avoid a collision – even the boat with right of way. Turn away!',
        twistDone: 'Nice save! You had right of way, but you still avoided the collision. That\'s rule 14.',
        firstFail: 'No worries – now I\'ll show you the right way with a dotted line.',
        horn5: 'Five short blasts mean: "I don\'t understand what you\'re doing – watch out!"',
      },
      hint: {
        R10: 'Tip: Look at the wind arrow. Which side of the boat does the wind come over?',
        R11: 'Tip: You are on the same tack. Who is closest to the wind?',
        R12: 'Tip: Who is coming from behind?',
        R13: 'Tip: Who is in the middle of a tack?',
        R18: 'Tip: Look at the zone around the mark. Who is on the inside?',
        power: 'Tip: Who is under motor, and who is under sail?',
        overtaking: 'Tip: Who is coming from behind and catching up?',
        headon: 'Tip: When two motorboats meet head-on, they both do exactly the same thing …',
        crossing: 'Tip: Who has the other boat on its right-hand side?',
        big: 'Tip: Who can turn away more easily – the small boat or the big one?',
      },
      rnum: {
        R10: 'Racing rule 10', R11: 'Racing rule 11', R12: 'Racing rule 12', R13: 'Racing rule 13', R14: 'Racing rule 14',
        R18: 'Racing rule 18', 'C-power-sail': 'COLREG rule 18', 'C-overtaking': 'COLREG rule 13', 'C-headon': 'COLREG rule 14',
        'C-crossing': 'COLREG rule 15', 'C-sail-tack': 'COLREG rule 12', 'C-sail-lee': 'COLREG rule 12', narrow: 'COLREG rule 9', draught: 'COLREG rule 18',
      },
      rname: { narrow: 'Keep out of the way in a channel', draught: 'Big ships can\'t give way', R14: 'Avoid contact' },
      reason: {
        R10: {
          me: 'Starboard has right of way! You are on port tack – the wind comes over your left side. So you must keep clear of {name}.',
          other: 'Starboard has right of way! You are on starboard tack – the wind comes over your right side. {name} is on port tack and must keep clear of you.',
        },
        R11: {
          me: 'Windward keeps clear! You are on the same tack and you are closest to the wind (to windward). So you must keep clear of {name} to leeward.',
          other: 'Windward keeps clear! {name} is closest to the wind (to windward) and must keep clear of you. You are to leeward – just hold your course.',
        },
        R12: {
          me: 'The boat behind keeps clear! You are clear astern, so you must keep clear of {name} ahead – steer around with plenty of room.',
          other: 'The boat behind keeps clear! {name} is coming from behind and must keep clear of you.',
        },
        R13: {
          me: 'A tacking boat keeps clear! You are in the middle of a tack and must keep clear until you are close-hauled again.',
          other: 'A tacking boat keeps clear! {name} is in the middle of a tack and must keep clear of you until the tack is finished.',
        },
        R18: {
          me: 'Mark-room! {name} is on the inside at the mark, within the 3-length zone. You are outside and must give {name} room to round.',
          other: 'Mark-room! You are on the inside at the mark, within the 3-length zone. {name} is outside and must give you room to round.',
        },
        'C-power-sail': {
          me: 'Power gives way to sail! You are under motor and {name} is under sail. So you are the one who keeps clear.',
          other: 'Power gives way to sail! {name} is under motor and must keep clear of you, because you are under sail.',
        },
        'C-overtaking': {
          me: 'The overtaking boat keeps clear – always! Even though you are sailing and {name} is under motor. Keep clear all the way past.',
          other: 'The overtaking boat keeps clear! {name} is coming from behind and must keep clear of you all the way past.',
        },
        'C-headon': { both: 'Head-on! When two motorboats meet bow to bow, both turn to starboard (right) and pass port side to port side.' },
        'C-crossing': {
          me: 'Crossing: {name} is on your starboard (right) side. So you give way – turn to starboard or slow down, and pass astern.',
          other: 'Crossing: You are on {name}\'s right-hand side. So {name} gives way, and you hold course and speed.',
        },
        narrow: { me: 'Normally the overtaking boat keeps clear. But the ferry can only sail in the deep channel and can\'t steer around you. Small boats must never be in the way of big ships in a narrow channel – so you must move – out to the starboard (right) side of the channel!' },
        narrowRib: { me: 'In a narrow channel everyone keeps to the starboard (right) side. And the ferry can only use the channel – so keep out of its way and give it lots of room.' },
        draught: { me: 'The cargo ship has a deep keel and needs more than a kilometre to stop. It can\'t give way to you! Small boats keep well clear of big ships – even when sailing.' },
      },
      sc: {
        r10a: { title: 'Meeting upwind', ask: 'You are beating upwind. Freja comes from the right – you are heading for the same spot.', tip: 'Bear away (turn away from the wind) and pass behind Freja. Head up again afterwards.', why: 'Remember: starboard is right. If the wind comes over your right side, you are on starboard tack.' },
        r10b: { title: 'Who\'s that?', ask: 'You are beating upwind. Oskar comes from the left on a collision course.', tip: 'You have right of way. Hold your course – Oskar must pass behind you.' },
        r10c: { title: 'Wind from behind', ask: 'The wind is from behind. Alma comes from the left and your courses meet.', tip: 'You are on port tack. Bear away a little more and let Alma pass in front of you.', why: 'The port-starboard rule works on every point of sail – downwind too. Careful: downwind, the starboard-tack boat comes from the left!' },
        r11a: { title: 'Side by side', ask: 'You and Noah sail side by side on the same tack. Noah is to leeward of you and starts to head up.', tip: 'Head up with Noah and keep a good distance.', why: 'Windward is the side the wind comes from. Leeward is the sheltered side.' },
        r11b: { title: 'A boat to windward', ask: 'You and Viggo sail side by side on the same tack. Viggo is to windward and getting closer.', tip: 'Hold your course. Viggo must keep clear of you.' },
        r12a: { title: 'Faster from behind', ask: 'You are faster than Ida, who is sailing right in front of you. Soon you will catch up.', tip: 'Steer around Ida with plenty of room – the boat behind keeps clear.' },
        r13a: { title: 'Sudden tack', ask: 'Ida is in the middle of a tack right in front of you.', tip: 'Hold your course. Ida must keep clear while she tacks.', why: 'A boat is tacking from passing head to wind until she is close-hauled again.' },
        r14a: { title: 'Collision course', ask: 'You are on starboard tack. Mads comes from the left on port tack.', tip: 'You have right of way … but keep an eye on Mads!' },
        r18a: { title: 'The mark – outside', ask: 'You must round the mark, leaving it to port. Sofie is on the inside – closest to the mark.', tip: 'Give Sofie room at the mark. Round a little wider than her.', why: 'The zone is an invisible circle of 3 boat lengths around the mark.' },
        r18b: { title: 'The mark – inside', ask: 'You must round the mark. You are on the inside and Emil is outside.', tip: 'You get room. Round close to the mark – but don\'t touch it!' },
        ps1: { title: 'Motorboat coming', ask: 'You are sailing. A motorboat comes from the left – straight at you.', tip: 'Hold course and speed. The motorboat must give way to you.' },
        ov1: { title: 'The slow fishing boat', ask: 'A slow fishing boat is chugging along in front of you. You are sailing faster.', tip: 'You are overtaking – so you keep clear. Sail around with plenty of room.' },
        ps2: { title: 'In the RIB', ask: 'You are driving the club RIB. A sailing boat is crossing ahead of you.', tip: 'Turn to starboard (right) or slow down, and pass behind the sailing boat.' },
        pp1: { title: 'Bow to bow', ask: 'You are driving the RIB. A motorboat is coming straight at you.', tip: 'Turn to starboard (right) in good time. Then you pass port side to port side.' },
        pp2: { title: 'From the right', ask: 'You are driving the RIB. A motorboat comes from your starboard (right) side.', tip: 'Turn to starboard and pass behind the motorboat. Never in front!' },
        sh1: { title: 'Here comes the ferry', ask: 'You are sailing in the middle of the channel. The ferry is coming from behind – and it\'s big!', tip: 'Sail aside to the right – fast! – out to the starboard side of the channel.' },
        sh2: { title: 'Giant ship', ask: 'A giant cargo ship comes from the right. Your courses cross.', tip: 'Turn to starboard towards the ship\'s stern and keep well clear. Cross behind it.' },
        ex1: { title: 'Busy waters', ask: 'It\'s busy by Kalkbrænderiløbet! You are beating upwind and Lukas comes from the right.', tip: 'You are on port tack – bear away and pass behind Lukas.' },
        ex2: { title: 'Out through the channel', ask: 'You are driving the RIB out through the channel. The ferry is coming towards you.', tip: 'Keep to the starboard (right) side of the channel and give the ferry lots of room.' },
        ex3: { title: 'The coach boat', ask: 'The coach boat comes from the right while you are sailing.', tip: 'Hold course and speed – the coach boat gives way.' },
      },
      res: { msg: 'You answered {q} of {n} right on the first try and sailed {s} of {n} situations cleanly.' },
      stat: { right: 'Right on 1st try', clean: 'Clean sails', tries: 'Sailing attempts' },
      badge: 'New badge: Rules master!',
    },
  });

  // ======================================================================== 2. scenarios
  // Local frame: wind FROM local north (unless `wind` is set), headings in degrees, C = conflict point (0, 0).
  // `rot` turns the local frame into the world (deg); `lane` puts the frame on a venue channel (local north = up-channel).
  // npc placement: meet {dt (s later than you at C), side (own lengths to its right)} | rel {fwd, side} (your lengths
  // from your start) | at {x, y} (local m). Scripts: [{t, h (local deg), v (speed factor)}]. auto = how YOU sail it right.
  const OPEN = { venue: 'sound', at: { x: 3750, y: -2000 } };
  const HARB = { venue: 'harbor', at: { x: 480, y: -1050 } };
  const S_ = (base, o) => Object.assign({}, base, o);
  const SC = {
    r10a: S_(OPEN, { rot: 225, rule: 'R10', ans: 'me', me: { hdg: 50 }, T: 11,
      npcs: [{ name: 'Freja', color: '#2f7de1', hdg: -50, meet: { dt: -0.4 }, focus: 1 }],
      auto: [{ t: 5.0, h: 110 }, { t: 12.5, h: 50 }], dur: 18 }),
    r10b: S_(OPEN, { rot: 250, rule: 'R10', ans: 'other', hold: 1, me: { hdg: -50 }, T: 11,
      npcs: [{ name: 'Oskar', color: '#22b07d', hdg: 50, meet: { dt: 0.3 }, script: [{ t: 4.6, h: 110 }, { t: 13, h: 50 }], focus: 1 }],
      auto: [], dur: 16 }),
    r10c: S_(OPEN, { rot: 210, rule: 'R10', ans: 'me', me: { hdg: 140 }, T: 10,
      npcs: [{ name: 'Alma', color: '#a35cf0', hdg: 220, meet: { dt: -0.3 }, focus: 1 }],
      auto: [{ t: 0.8, h: 178 }, { t: 13.5, h: 150 }], dur: 15 }),
    r11a: S_(OPEN, { rot: 235, rule: 'R11', ans: 'me', me: { hdg: -90 }, T: 0, encEnd: 9,
      npcs: [{ name: 'Noah', color: '#ff5a8a', hdg: -90, rel: { fwd: 0.2, side: -2.0 }, script: [{ t: 2, h: -52 }], intent: -52, focus: 1 }],
      auto: [{ t: 1.4, h: -50 }, { t: 9.5, h: -75 }], dur: 13 }),
    r11b: S_(OPEN, { rot: 240, rule: 'R11', ans: 'other', hold: 1, me: { hdg: -90 }, T: 0, encEnd: 8,
      npcs: [{ name: 'Viggo', color: '#ffb000', hdg: -110, rel: { fwd: 0.2, side: 2.1 }, script: [{ t: 2.2, h: -72 }], focus: 1 }],
      auto: [], dur: 11 }),
    r12a: S_(OPEN, { rot: 230, rule: 'R12', ans: 'me', me: { hdg: -90 }, T: 0, encEnd: 9,
      npcs: [{ name: 'Ida', color: '#ff8fb1', hdg: -90, rel: { fwd: 2.6, side: 0 }, eff: 0.55, focus: 1 }],
      auto: [{ t: 0.8, h: -118 }, { t: 5.8, h: -90 }], dur: 12 }),
    r13a: S_(OPEN, { rot: 245, rule: 'R13', ans: 'other', hold: 1, me: { hdg: -50 }, T: 0, encEnd: 5,
      npcs: [{ name: 'Ida', color: '#ff8fb1', hdg: -3, v0: 0.9, turn: 16, rel: { fwd: 4.8, side: 1.4 }, script: [{ t: 0, h: -50 }], intent: -50, focus: 1 }],
      auto: [], dur: 10 }),
    r14a: S_(OPEN, { rot: 220, rule: 'R10', lesson: 'R14', ans: 'other', avoid: 1, me: { hdg: -50 }, T: 11,
      npcs: [{ name: 'Mads', color: '#5b6bff', hdg: 50, meet: { dt: 0.2 }, focus: 1, ignores: 1 }],
      auto: [{ t: 6.2, h: -115 }, { t: 12.5, h: -50 }], dur: 17 }),
    r18a: S_(OPEN, { rot: 200, rule: 'R18', ans: 'me', me: { hdg: 160 }, T: 0, evalT: 7.2, encEnd: 12,
      npcs: [{ name: 'Sofie', color: '#00a6a6', hdg: 160, rel: { fwd: 0.15, side: -1.3 }, turn: 30, script: [{ t: 7.7, h: 70 }], focus: 1 }],
      mark: { fwd: 8, side: -2.6 }, auto: [{ t: 9.3, h: 70 }], dur: 16 }),
    r18b: S_(OPEN, { rot: 215, rule: 'R18', ans: 'other', room: 1, me: { hdg: 160 }, T: 0, evalT: 7.2, encEnd: 11,
      npcs: [{ name: 'Emil', color: '#7c4dff', hdg: 160, rel: { fwd: 0.15, side: 1.3 }, turn: 30, script: [{ t: 9.4, h: 70 }], focus: 1 }],
      mark: { fwd: 8, side: -1.3 }, auto: [{ t: 7.7, h: 70 }], dur: 15 }),
    ps1: S_(OPEN, { rot: 230, rule: 'C-power-sail', ans: 'other', hold: 1, me: { hdg: -90 }, T: 10,
      npcs: [{ kind: 'motor', name: 'Speedy', color: '#1f6fd1', hdg: 0, speed: 4.2, meet: { dt: 0.2 }, script: [{ t: 4.8, h: 70 }, { t: 11.5, h: 0 }], focus: 1 }],
      auto: [], dur: 14 }),
    ov1: S_(OPEN, { rot: 240, rule: 'C-overtaking', ans: 'me', me: { hdg: -90 }, T: 0, encEnd: 10,
      npcs: [{ kind: 'fish', name: 'Fiskeren', color: '#2a9d6f', hdg: -90, speed: 0.9, rel: { fwd: 4.2, side: 0 }, focus: 1 }],
      auto: [{ t: 0.8, h: -122 }, { t: 7.0, h: -90 }], dur: 14 }),
    ps2: S_(OPEN, { rot: 210, rule: 'C-power-sail', ans: 'me', noAhead: 1, me: { kind: 'rib', hdg: 90, thr: 0.3 }, T: 9,
      npcs: [{ kind: 'sail', cls: 'zest', name: 'Karla', color: '#2f7de1', hdg: -60, meet: { dt: -0.3 }, focus: 1 }],
      auto: [{ t: 3.0, h: 165 }, { t: 10, h: 90 }], dur: 14 }),
    pp1: S_(OPEN, { rot: 200, rule: 'C-headon', ans: 'both', headon: 1, me: { kind: 'rib', hdg: 0, thr: 0.3 }, T: 8,
      npcs: [{ kind: 'motor', name: 'Speedy', color: '#1f6fd1', hdg: 180, speed: 4.0, meet: { dt: 0, side: 0.3 }, script: [{ t: 3.2, h: 215 }, { t: 9, h: 180 }], focus: 1 }],
      auto: [{ t: 3.0, h: 35 }, { t: 9, h: 0 }], dur: 13 }),
    pp2: S_(OPEN, { rot: 250, rule: 'C-crossing', ans: 'me', noAhead: 1, me: { kind: 'rib', hdg: 0, thr: 0.3 }, T: 8,
      npcs: [{ kind: 'motor', name: 'Brumbassen', color: '#d6452f', hdg: 270, speed: 3.6, meet: { dt: -0.2 }, focus: 1 }],
      auto: [{ t: 2.6, h: 90 }, { t: 8.6, h: 0 }], dur: 14 }),
    sh1: { venue: 'harbor', lane: 'kalk', laneY: -1000, wind: 270, rule: 'narrow', ans: 'me', keepout: 1, me: { hdg: 0 }, T: 22, C: { x: 4, y: 0 }, encEnd: 26,
      npcs: [{ kind: 'ferry', name: 'Færgen', hdg: 0, speedRel: 6, relM: { fwd: -110, side: -8 }, focus: 1 }],
      auto: [{ t: 0.4, h: 70 }, { t: 8.5, h: 10 }], dur: 26 },
    sh2: { venue: 'sound', at: { x: 2600, y: -2270 }, laneRot: 'ferry', wind: -34, rule: 'draught', ans: 'me', noAhead: 1, me: { hdg: 90 }, T: 16, encEnd: 23,
      npcs: [{ kind: 'ship', name: 'Nordstjernen', hdg: 0, speed: 7, meet: { dt: 0 }, focus: 1, horn: 1 }],
      auto: [{ t: 0.8, h: 180 }, { t: 19, h: 95 }], dur: 29 },
    ex1: S_(HARB, { rot: 240, rule: 'R10', ans: 'me', me: { hdg: 50 }, T: 11,
      npcs: [{ name: 'Lukas', color: '#1fb5c9', hdg: -50, meet: { dt: -0.4 }, focus: 1 },
        { kind: 'motor', name: 'Speedy', color: '#1f6fd1', hdg: 270, speed: 3.2, at: { x: 62, y: -48 }, traffic: 1 },
        { name: 'Ella', color: '#ffd23f', hdg: 135, at: { x: -46, y: -50 }, traffic: 1 }],
      auto: [{ t: 5.0, h: 110 }, { t: 12.5, h: 50 }], dur: 18 }),
    ex2: { venue: 'harbor', lane: 'kalk', laneY: -800, wind: 80, rule: 'narrow', reason: 'narrowRib', ans: 'me', keepout: 1, headon: 1,
      me: { kind: 'rib', hdg: 0, thr: 0.3 }, T: 12, C: { x: -8, y: 0 }, encEnd: 16,
      npcs: [{ kind: 'ferry', name: 'Færgen', hdg: 180, speed: 5.5, meet: { dt: 0, side: 0 }, focus: 1 },
        { name: 'Ella', color: '#ffd23f', hdg: 100, at: { x: -95, y: -40 }, traffic: 1 }],
      auto: [{ t: 0.6, h: 60 }, { t: 7.5, h: 0 }], dur: 19 },
    ex3: S_(HARB, { rot: 235, rule: 'C-power-sail', ans: 'other', hold: 1, me: { hdg: -90 }, T: 10,
      npcs: [{ kind: 'rib', name: 'Trænerbåden', hdg: 180, speed: 4.5, meet: { dt: 0.3 }, script: [{ t: 3.6, v: 0.05 }, { t: 13, v: 1 }], focus: 1 },
        { name: 'Ella', color: '#ffd23f', hdg: -30, at: { x: 60, y: 70 }, traffic: 1 },
        { name: 'Viggo', color: '#ffb000', hdg: 40, at: { x: -80, y: 75 }, traffic: 1 }],
      auto: [], dur: 14 }),
  };

  const POWER = {
    motor: { L: 7, B: 2.6, turn: 30, tau: 2 },
    fish: { L: 5.6, B: 2.2, turn: 16, tau: 2 },
    ferry: { L: 60, B: 13, turn: 3, tau: 8 },
    ship: { L: 70, B: 12, turn: 2, tau: 10 },
    rib: { L: 4.8, B: 2.1, turn: 40, tau: 1.5 },
  };

  // ======================================================================== 3. activities
  const ACTS = [
    { id: 'rowschool.r10', order: 10, icon: 'rules', minutes: 4, difficulty: 1, unlock: null, scen: ['r10a', 'r10b', 'r10c'],
      title: { da: 'Bagbord og styrbord', en: 'Port and starboard' },
      desc: { da: 'Den vigtigste regel på vandet: bagbords halse viger for styrbords halse.', en: 'The most important rule on the water: port tack gives way to starboard tack.' } },
    { id: 'rowschool.r11', order: 20, icon: 'rules', minutes: 4, difficulty: 2, unlock: { after: 'rowschool.r10' }, scen: ['r11a', 'r11b', 'r12a'],
      title: { da: 'Luv, læ og agter', en: 'Windward, leeward and astern' },
      desc: { da: 'Samme halse: luv viger for læ, og den bagerste viger.', en: 'Same tack: windward keeps clear, and the boat behind keeps clear.' } },
    { id: 'rowschool.r13', order: 30, icon: 'rules', minutes: 3, difficulty: 2, unlock: { after: 'rowschool.r11' }, scen: ['r13a', 'r14a'],
      title: { da: 'Vendinger og kollisioner', en: 'Tacks and collisions' },
      desc: { da: 'Den der vender, viger – og ingen må nogensinde bare sejle ind i en anden.', en: 'A tacking boat keeps clear – and nobody may ever just sail into another boat.' } },
    { id: 'rowschool.r18', order: 40, icon: 'buoy', minutes: 3, difficulty: 3, unlock: { after: 'rowschool.r13' }, scen: ['r18a', 'r18b'],
      title: { da: 'Mærkeplads', en: 'Mark-room' },
      desc: { da: 'Ved mærket får den inderste båd plads. Hold øje med zonen på tre bådlængder!', en: 'At the mark the inside boat gets room. Watch the three-length zone!' } },
    { id: 'rowschool.power', order: 50, icon: 'rib', minutes: 4, difficulty: 2, unlock: { after: 'rowschool.r18' }, scen: ['ps1', 'ov1', 'ps2'],
      title: { da: 'Motor og sejl', en: 'Power and sail' },
      desc: { da: 'Motorbåde viger for sejlbåde – men den der overhaler, viger altid.', en: 'Motorboats give way to sailing boats – but the overtaking boat always keeps clear.' } },
    { id: 'rowschool.rib', order: 60, icon: 'rib', boat: 'rib', minutes: 3, difficulty: 2, unlock: { after: 'rowschool.power' }, scen: ['pp1', 'pp2'],
      title: { da: 'RIB mod motorbåd', en: 'RIB vs motorboat' },
      desc: { da: 'Når to motorbåde mødes: drej til styrbord, og vig for den, der kommer fra højre.', en: 'When two motorboats meet: turn to starboard, and give way to the one on your right.' } },
    { id: 'rowschool.ships', order: 70, icon: 'anchor', minutes: 4, difficulty: 3, unlock: { after: 'rowschool.rib' }, scen: ['sh1', 'sh2'],
      title: { da: 'Færger og store skibe', en: 'Ferries and big ships' },
      desc: { da: 'Store skibe kan ikke dreje eller stoppe hurtigt. Hold dig af vejen i sejlrenden!', en: 'Big ships can\'t turn or stop quickly. Keep out of their way in the channel!' } },
    { id: 'rowschool.exam', order: 80, icon: 'medal', minutes: 5, difficulty: 4, unlock: { after: 'rowschool.ships' }, scen: ['ex1', 'ex2', 'ex3'],
      title: { da: 'Travl havn – eksamen', en: 'Busy harbour – exam' },
      desc: { da: 'Alt det, du har lært, på én gang ved Kalkbrænderiløbet. Klarer du vigeregel-eksamen?', en: 'Everything you have learned, all at once by Kalkbrænderiløbet. Can you pass the right-of-way exam?' } },
  ];
  KOS.Activities.add(ACTS.map(a => ({ id: a.id, mode: 'rowschool', area: 'rules', order: a.order, boat: a.boat || null, icon: a.icon,
    minutes: a.minutes, difficulty: a.difficulty, unlock: a.unlock, title: a.title, desc: a.desc, params: { scenarios: a.scen } })));

  // ======================================================================== 4. simulation core (no DOM)
  const TABLES = {};
  function venueOf(id) { return KOS.World.get(id || 'sound'); }
  // steady speed (m/s) of a class by true wind angle, measured with the real physics (10° steps), cached
  function speedTable(clsId, kn) {
    const key = clsId + '@' + kn;
    if (TABLES[key]) return TABLES[key];
    const wind = KOS.Wind.steady(0, kn), venue = venueOf('sound'), out = [];
    for (let a = 0; a <= 180; a += 10) {
      const h = a * D2R;
      const b = KOS.Physics.createBoat(clsId, { x: 3750, y: -2000, heading: h, speed: 1.6 });
      const c = KOS.Physics.controls(); c.autoTrim = true; c.autoHike = true;
      const env = { wind, venue, assist: 'easy', t: 0 };
      for (let i = 0; i < 420; i++) { env.t += KOS.DT; KOS.Physics.step(b, c, env, KOS.DT); b.heading = h; b.yawRate = 0; }
      out.push(Math.max(0, b.speed));
    }
    return (TABLES[key] = out);
  }
  function tableSpeed(tab, twaAbs) { const a = U.clamp(Math.abs(twaAbs) / D2R, 0, 180) / 10, i = Math.min(17, Math.floor(a)); return U.lerp(tab[i], tab[i + 1], a - i); }
  function ribSpeed(thr) {
    const key = 'rib@' + thr;
    if (TABLES[key]) return TABLES[key];
    const b = KOS.Physics.createBoat('rib', { x: 3750, y: -2000, heading: 0 }), c = KOS.Physics.controls();
    c.throttle = thr;
    const env = { wind: KOS.Wind.steady(0, 8), venue: venueOf('sound'), assist: 'easy', t: 0 };
    for (let i = 0; i < 600; i++) { env.t += KOS.DT; KOS.Physics.step(b, c, env, KOS.DT); b.heading = 0; }
    return (TABLES[key] = Math.max(0.5, b.speed));
  }

  // local ↔ world frame of a scenario
  function frameOf(scn) {
    const venue = venueOf(scn.venue);
    let C0 = scn.at, rot = scn.rot || 0;
    const laneById = id => (venue.lanes || []).find(l => l.id === id) || ((KOS.World.global && KOS.World.global.lanes) || []).find(l => l.id === id);
    if (scn.lane) {
      const ln = laneById(scn.lane);
      const pts = ln.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if ((a[1] - scn.laneY) * (b[1] - scn.laneY) <= 0 && a[1] !== b[1]) {
          const k = (scn.laneY - a[1]) / (b[1] - a[1]);
          C0 = { x: a[0] + (b[0] - a[0]) * k, y: scn.laneY };
          const north = b[1] < a[1] ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]];
          rot = U.heading(north[0], north[1]) / D2R;
          break;
        }
      }
      scn._laneW = ln.width;
    } else if (scn.laneRot) {
      const ln = laneById(scn.laneRot);
      let best = null;
      for (let i = 1; i < ln.points.length; i++) {
        const a = ln.points[i - 1], b = ln.points[i];
        const d = U.segDistance(C0.x, C0.y, a[0], a[1], b[0], b[1]);
        if (!best || d < best.d) best = { d, h: U.heading(a[0] - b[0], a[1] - b[1]) };
      }
      rot = best.h / D2R;
    }
    const r = rot * D2R, cs = Math.cos(r), sn = Math.sin(r);
    return {
      venue, C0, rot, r,
      toW: (x, y) => ({ x: C0.x + x * cs - y * sn, y: C0.y + x * sn + y * cs }),
      hW: h => U.wrapPi(h * D2R + r),
      windL: (scn.wind || 0) * D2R,
      windW: U.wrapPi((scn.wind || 0) * D2R + r),
    };
  }

  // the scenarios are tuned for the club's dinghies; keelboats and the RIB sail the sail scenarios in a Zest
  const DINGHIES = ['opti', 'tera', 'feva', 'zest', 'ilca', '29er'];
  const vh = h => U.vec(h * D2R);
  const rt = h => U.vec((h + 90) * D2R);

  /** Build the plan of a scenario: geometry, speeds, the autopilot dry run (goal ring, ghost path) and the right answer. */
  function prepare(id, o) {
    o = o || {};
    const scn = SC[id];
    const F = frameOf(scn);
    const kn = scn.kn || 9;
    const sailCls = DINGHIES.indexOf(o.sailCls) >= 0 ? o.sailCls : 'zest';
    const pCls = scn.me.kind === 'rib' ? 'rib' : sailCls;
    const tabs = {};
    const tab = c => tabs[c] || (tabs[c] = speedTable(c, kn));
    const vp = pCls === 'rib' ? ribSpeed(scn.me.thr || 0.3) : tableSpeed(tab(pCls), U.wrapPi(F.windL - scn.me.hdg * D2R));
    const Lp = KOS.Boats.get(pCls).length;
    const C = scn.C || { x: 0, y: 0 };
    const fp = vh(scn.me.hdg), rp = rt(scn.me.hdg);
    const p0 = { x: C.x - fp.x * vp * scn.T, y: C.y - fp.y * vp * scn.T };
    let anyPower = pCls === 'rib';
    const npcs = scn.npcs.map((sp, i) => {
      const kind = sp.kind || 'sail';
      let cls = null, L, B, vBase, turn, tau, phys = false, power = false;
      if (kind === 'sail') {
        cls = sp.cls || (pCls === 'rib' ? 'zest' : pCls);
        const def = KOS.Boats.get(cls);
        L = def.length; B = def.beam; phys = true; tau = 1.2; turn = sp.turn || 34;
        vBase = tableSpeed(tab(cls), U.wrapPi(F.windL - sp.hdg * D2R)) * (sp.eff || 1);
      } else {
        const P = POWER[kind];
        L = P.L; B = P.B; turn = sp.turn || P.turn; tau = P.tau; power = true; vBase = sp.speedRel != null ? vp + sp.speedRel : sp.speed;
        if (kind === 'rib') { cls = 'rib'; phys = true; }
      }
      if (power) anyPower = true;
      let s;
      if (sp.meet) {
        const f = vh(sp.hdg), r = rt(sp.hdg), side = (sp.meet.side || 0) * L, d = vBase * (scn.T + (sp.meet.dt || 0));
        s = { x: C.x + r.x * side - f.x * d, y: C.y + r.y * side - f.y * d };
      } else if (sp.relM) s = { x: p0.x + fp.x * sp.relM.fwd + rp.x * sp.relM.side, y: p0.y + fp.y * sp.relM.fwd + rp.y * sp.relM.side };
      else if (sp.rel) s = { x: p0.x + fp.x * sp.rel.fwd * Lp + rp.x * sp.rel.side * Lp, y: p0.y + fp.y * sp.rel.fwd * Lp + rp.y * sp.rel.side * Lp };
      else s = { x: sp.at.x, y: sp.at.y };
      return { i, spec: sp, kind, cls, L, B, vBase, turn: turn * D2R, tau, phys, power, big: kind === 'ferry' || kind === 'ship', start: s, focus: !!sp.focus };
    });
    const marksL = scn.mark ? [{ x: p0.x + fp.x * vp * scn.mark.fwd + rp.x * scn.mark.side * Lp, y: p0.y + fp.y * vp * scn.mark.fwd + rp.y * scn.mark.side * Lp }] : [];
    const plan = {
      id, scn, F, kn, pCls, vp, Lp, p0, C, npcs, tabs, anyPower,
      venue: F.venue,
      marksW: marksL.map((m, i) => Object.assign(F.toW(m.x, m.y), { id: 'rs-mark' + i, kind: 'orange', round: 'port', r: 1.1 })),
      engine: scn.rule !== 'narrow' && scn.rule !== 'draught',
      mode: anyPower ? 'colreg' : 'race',
      encEnd: scn.encEnd != null ? scn.encEnd : scn.T + 3,
      late: scn.dur * 1.35 + 8,
      ring: null, path: [],
      focusIdx: Math.max(0, npcs.findIndex(n => n.focus)),
    };
    // dry run with the autopilot: goal ring, ghost path, the rule at evalT (KOS.Rules decides the answer)
    const sim = makeSim(plan, { assist: o.assist || 'normal' });
    let row = null, fail = null, pathT = 0;
    const evalT = scn.evalT || 0;
    plan.path.push({ x: sim.player.x, y: sim.player.y });
    while (sim.t < scn.dur - 1e-6) {
      if (!row && sim.t >= evalT - 1e-6) row = sim.evalRow();
      sim.step(KOS.DT, sim.autoControls());
      if (!fail) fail = sim.check();
      if ((pathT += KOS.DT) >= 0.2) { pathT = 0; plan.path.push({ x: sim.player.x, y: sim.player.y }); }
    }
    plan.path.push({ x: sim.player.x, y: sim.player.y });
    plan.ring = { x: sim.player.x, y: sim.player.y, r: Math.max(5, Lp * 1.5 + 3) };
    plan.dryFail = fail;
    plan.row = row;
    plan.ans = row.ans;
    plan.rule = row.rule;
    plan.ansMismatch = row.ans !== scn.ans || (scn.rule !== row.rule);
    return plan;
  }

  /** A fresh, runnable simulation of a plan. sim.step(dt, controls), sim.check() → fail | null, sim.success(). */
  function makeSim(plan, o) {
    o = o || {};
    const F = plan.F, scn = plan.scn, assist = o.assist || 'normal';
    const wind = KOS.Wind.steady(F.windW, plan.kn);
    const env = { wind, venue: plan.venue, assist, t: 0 };
    const envN = { wind, venue: plan.venue, assist: 'easy', t: 0 };
    const P0 = F.toW(plan.p0.x, plan.p0.y);
    const h0 = F.hW(scn.me.hdg);
    const player = KOS.Physics.createBoat(plan.pCls, {
      x: P0.x, y: P0.y, heading: h0, speed: plan.vp, isPlayer: true,
      sailNo: o.sailNo || (plan.pCls === 'rib' ? 'KØS 1' : 'DEN 1'), name: o.name || '',
      colors: o.color && plan.pCls !== 'rib' ? { hull: o.color } : undefined,
    });
    player.tag = KOS.t('rowschool.youTag'); player.tagColor = 'rgba(255,122,61,0.92)';
    // settle the sails / heel at the start spot (position and heading held)
    const pc = KOS.Physics.controls(); pc.autoTrim = true; pc.autoHike = true; pc.throttle = scn.me.thr || 0;
    for (let i = 0; i < 90; i++) { KOS.Physics.step(player, pc, env, KOS.DT); player.x = P0.x; player.y = P0.y; player.heading = h0; player.yawRate = 0; player.speed = plan.vp; const f = U.vec(h0); player.vx = f.x * plan.vp; player.vy = f.y * plan.vp; }
    player.distanceSailed = 0; player.wake.length = 0;
    env.t = 0;

    const npcs = plan.npcs.map(n => {
      const sp = n.spec, w = F.toW(n.start.x, n.start.y), h = F.hW(sp.hdg);
      const v0 = sp.v0 != null ? plan.vp * sp.v0 : n.vBase;
      let ob;
      if (n.phys) {
        ob = KOS.Physics.createBoat(n.cls, { x: w.x, y: w.y, heading: h, speed: v0, name: sp.name, sailNo: n.cls === 'rib' ? 'KØS 2' : '',
          colors: sp.color ? { hull: sp.color } : undefined });
      } else {
        ob = { id: 'rs-' + plan.id + '-' + n.i, x: w.x, y: w.y, heading: h, speed: v0, vx: 0, vy: 0, length: n.L, beam: n.B, isPower: true, name: sp.name, kind: n.kind, color: sp.color };
      }
      ob.tag = sp.name; ob.noTag = !!sp.traffic && false;
      const fv = U.vec(h); ob.vx = fv.x * v0; ob.vy = fv.y * v0;
      return Object.assign({}, n, { o: ob, v: v0, hT: h, si: 0, vMul: 1, ctl: Object.assign(KOS.Physics.controls(), { autoTrim: true, autoHike: true, throttle: 0.3 }),
        trail: [], trailT: 0, gap: 99, role: 'none', latSign: 0, minD: 1e9, minRel: 0, passChecked: false, near: false });
    });
    const sim = {
      plan, t: 0, player, npcs, wind, env, h0, marks: plan.marksW, slowT: 0, reached: false, twisted: false, trails: [],
      boats() { return [player].concat(npcs.filter(n => n.phys).map(n => n.o)); },
      focus() { return npcs[plan.focusIdx]; },
    };
    // visual state for physics NPCs at t = 0
    for (const n of npcs) if (n.phys) stepNpc(n, 0);

    function stepNpc(n, dt) {
      const sp = n.spec, ob = n.o, sc = sp.script || [];
      while (n.si < sc.length && sim.t >= sc[n.si].t - 1e-6) { const e = sc[n.si++]; if (e.h != null) n.hT = F.hW(e.h); if (e.v != null) n.vMul = e.v; }
      const err = U.angDiff(ob.heading, n.hT), mt = n.turn * dt, dh = U.clamp(err, -mt, mt);
      const h = U.wrapPi(ob.heading + dh);
      const vt = n.kind === 'sail' ? tableSpeed(plan.tabs[n.cls], U.wrapPi(F.windW - h)) * (sp.eff || 1) * n.vMul : n.vBase * n.vMul;
      if (dt > 0) n.v += (vt - n.v) * (1 - Math.exp(-dt / n.tau));
      const f = U.vec(h);
      const nx = ob.x + f.x * n.v * dt, ny = ob.y + f.y * n.v * dt;
      if (n.phys) {
        n.ctl.rudder = dt > 0 ? U.clamp(dh / dt / n.turn, -1, 1) : 0;
        n.ctl.throttle = n.cls === 'rib' ? U.clamp(n.v / 14.4 * 1.05, 0, 1) : 0;
        KOS.Physics.step(ob, n.ctl, envN, Math.max(dt, 1e-4));
      }
      ob.x = nx; ob.y = ny; ob.heading = h; ob.speed = n.v; ob.vx = f.x * n.v; ob.vy = f.y * n.v; ob.yawRate = dt > 0 ? dh / dt : 0;
      ob.rudder = n.ctl.rudder;
      if (n.kind === 'sail') { const twa = U.wrapPi(F.windW - h); ob.r13 = Math.abs(twa) < ob.cls.noGo + 0.03 && Math.abs(err) > 0.08; }
      if (!n.phys && dt > 0 && (n.trailT -= dt) <= 0) {
        n.trailT = n.big ? 0.25 : 0.1;
        n.trail.push({ x: ob.x - f.x * n.L / 2, y: ob.y - f.y * n.L / 2, t: sim.t, h });
        const keep = n.big ? 14 : 5;
        while (n.trail.length && sim.t - n.trail[0].t > keep) n.trail.shift();
      }
    }

    sim.step = function (dt, controls) {
      sim.t += dt; env.t += dt; envN.t += dt;
      KOS.Physics.step(player, controls, env, dt);
      for (const n of npcs) stepNpc(n, dt);
    };
    // autopilot: heading script (and throttle for the RIB)
    sim.autoControls = function (hold) {
      let h = h0, thr = scn.me.thr || 0;
      if (!hold) for (const e of scn.auto || []) if (sim.t >= e.t) { if (e.h != null) h = F.hW(e.h); if (e.thr != null) thr = e.thr; }
      const c = sim._ac || (sim._ac = KOS.Physics.controls());
      c.autoTrim = true; c.autoHike = true; c.throttle = thr; c.hike = 0;
      c.rudder = U.clamp(U.angDiff(player.heading, h) * 2.6 - (player.yawRate || 0) * 0.35, -1, 1);
      return c;
    };
    sim.ctx = function () { return { wind: F.windW, marks: sim.marks.length ? sim.marks : undefined, zone: 3, mode: plan.mode }; };
    sim.evalRow = function () {
      const fn = sim.focus();
      if (!plan.engine) return { rule: scn.rule, ans: scn.ans };
      const row = KOS.Rules.rightOfWay(player, fn.o, sim.ctx());
      return { rule: row.rule, ans: row.both ? 'both' : row.giveWay === player ? 'me' : 'other', row };
    };
    sim.roleVs = function (n) {
      if (scn.avoid && n.focus) return 'stand';
      if (!plan.engine) return n.focus ? (scn.ans === 'me' ? 'give' : scn.ans === 'both' ? 'both' : 'stand') : 'none';
      const row = KOS.Rules.rightOfWay(player, n.o, sim.ctx());
      n.row = row;
      return row.both ? 'both' : row.giveWay === player ? 'give' : 'stand';
    };
    sim.myRole = function () {
      if (scn.keepout || scn.rule === 'draught') return scn.keepout ? 'keepout' : 'keepShip';
      if (scn.avoid) return sim.t < plan.scn.T + 4 ? 'avoid' : 'free';
      if (scn.room) return sim.t < plan.encEnd ? 'room' : 'free';
      if (scn.rule === 'R18') return sim.t < plan.encEnd ? 'giveRoom' : 'free';
      const f = sim.focus();
      if (sim.t > plan.encEnd) return 'free';
      return f.role === 'none' ? 'free' : f.role;
    };
    const K = {
      clr: { easy: 0.12, normal: 0.22, pro: 0.35 }[assist] || 0.22,
      clrBig: { easy: 8, normal: 11, pro: 14 }[assist] || 11,
      tol: ({ easy: 36, normal: 25, pro: 16 }[assist] || 25) * D2R,
      slow: { easy: 0.25, normal: 0.4, pro: 0.5 }[assist] || 0.4,
      lane: { easy: 4, normal: 7, pro: 10 }[assist] || 7,
    };
    sim.K = K;
    sim.clrFor = n => n.big ? K.clrBig : Math.max(0.35, plan.Lp * K.clr);
    sim.check = function () {
      const pl = player, enc = sim.t <= plan.encEnd;
      for (const n of npcs) {
        const ob = n.o;
        const gap = KOS.Rules.hullGap(pl, ob);
        n.gap = gap;
        if (gap <= 0.05) return { kind: 'bump', n };
        if (Math.abs(pl.x - ob.x) > 400 || Math.abs(pl.y - ob.y) > 400) { n.role = 'none'; continue; }
        const role = sim.roleVs(n);
        n.role = role;
        const dx = pl.x - ob.x, dy = pl.y - ob.y, d = Math.hypot(dx, dy) || 1;
        const closing = ((pl.vx - ob.vx) * dx + (pl.vy - ob.vy) * dy) / d < -0.05;
        n.closing = closing;
        const clr = sim.clrFor(n);
        n.near = (role === 'give' || role === 'both') && closing && gap < clr * 2.5 + plan.Lp;
        if (enc && (role === 'give' || role === 'both') && closing && gap < clr) return { kind: n.big ? 'closeBig' : 'close', n };
        if (!n.focus) continue;
        const f = U.vec(ob.heading), along = dx * f.x + dy * f.y, lat = dx * -f.y + dy * f.x;
        if (scn.noAhead && enc) {
          const s = lat > 0 ? 1 : -1;
          const range = n.big ? 320 : Math.max(30, n.L * 8);
          if (n.latSign && s !== n.latSign && along > n.L / 2 && along < range) return { kind: 'ahead', n };
          n.latSign = s;
        }
        if (scn.keepout && !n.passed && along > -n.L / 2 && along < n.L / 2 + 26 && Math.abs(lat) < n.B / 2 + K.lane) return { kind: 'lane', n };
        if (scn.keepout && along < -n.L / 2 - 4) n.passed = true;
        if (scn.headon && enc) {
          n.maxStb = Math.max(n.maxStb || 0, U.angDiff(sim.h0, pl.heading));
          if (d < n.minD) { n.minD = d; n.minRel = U.angDiff(pl.heading, U.bearing(pl, ob)); }
          else if (!n.passChecked && n.minD < 3 * (plan.Lp + n.L) && d > n.minD + 1) { n.passChecked = true; if (n.minRel > 0 || n.maxStb < 12 * D2R) return { kind: 'port', n }; }
        }
      }
      if (scn.hold && enc && sim.t > 0.3) {
        if (Math.abs(U.angDiff(sim.h0, pl.heading)) > K.tol) return { kind: 'course' };
        if (plan.pCls !== 'rib') {
          if (pl.speed < plan.vp * K.slow) sim.slowT += KOS.DT; else sim.slowT = 0;
          if (sim.slowT > 1.2) return { kind: 'slow' };
        }
      }
      if (scn.headon && enc && U.angDiff(sim.h0, pl.heading) < -20 * D2R) return { kind: 'port' };
      for (const m of sim.marks) {
        const L = plan.Lp, f = U.vec(pl.heading), r = KOS.Boats.get(plan.pCls).beam * 0.45;
        const ax = pl.x + f.x * (L / 2 - r), ay = pl.y + f.y * (L / 2 - r), bx = pl.x - f.x * (L / 2 - r), by = pl.y - f.y * (L / 2 - r);
        if (U.segDistance(m.x, m.y, ax, ay, bx, by) - r - m.r <= 0) return { kind: 'mark' };
      }
      if (plan.ring && Math.hypot(pl.x - plan.ring.x, pl.y - plan.ring.y) < plan.ring.r) sim.reached = true;
      if (plan.ring && !sim.reached && sim.t > plan.encEnd + 2) { // clearly sailing away from the goal → say so now
        const d = Math.hypot(pl.x - plan.ring.x, pl.y - plan.ring.y);
        sim.awayT = d > plan.ring.r * 4 + 25 && d > (sim.lastD || 1e9) ? (sim.awayT || 0) + KOS.DT : 0;
        sim.lastD = d;
        if (sim.awayT > 3) return { kind: 'miss' };
      }
      if (plan.ring && sim.t > plan.late) return { kind: 'late' };
      return null;
    };
    sim.success = function () { return !!plan.ring && sim.reached && (scn.keepout ? !!sim.focus().passed : sim.t >= plan.encEnd); };
    return sim;
  }

  KOS.RowSchool = { SC, ACTS, prepare, makeSim, speedTable };

  // ======================================================================== 5. drawing helpers (world meters, bow = −y)
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hullPath(ctx, L, B, bowK, sternK) {
    const h = L / 2, b = B / 2;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(b * 0.75, -h + L * 0.08, b, -h + L * bowK * 0.6, b, -h + L * bowK);
    ctx.lineTo(b * sternK, h);
    ctx.lineTo(-b * sternK, h);
    ctx.lineTo(-b, -h + L * bowK);
    ctx.bezierCurveTo(-b, -h + L * bowK * 0.6, -b * 0.75, -h + L * 0.08, 0, -h);
    ctx.closePath();
  }
  function drawWake(ctx, n, now) {
    const tr = n.trail; if (tr.length < 2) return;
    const ob = n.o, spread = n.big ? 0.32 : 0.45, life = n.big ? 14 : 5;
    ctx.save(); ctx.lineCap = 'round';
    // turbulent centre
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i], age = now - b.t, k = 1 - age / life;
      if (k <= 0) continue;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * k * k) + ')';
      ctx.lineWidth = n.B * (0.55 + (1 - k) * 0.9);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // the V: two arms growing with age
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let first = true;
      for (let i = tr.length - 1; i >= 0; i--) {
        const p = tr[i], age = now - p.t; if (age > life) break;
        const w = n.B / 2 + age * Math.max(0.6, ob.speed) * spread, rx = Math.cos(p.h) * side, ry = Math.sin(p.h) * side;
        const x = p.x + rx * w, y = p.y + ry * w;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(0.25, n.B * 0.09); ctx.stroke();
    }
    ctx.restore();
  }
  function drawMotor(ctx, n, tm) {
    const L = n.L, B = n.B, ob = n.o;
    ctx.save(); ctx.translate(ob.x, ob.y); ctx.rotate(ob.heading);
    ctx.save(); ctx.translate(0.25, 0.35); hullPath(ctx, L, B, 0.38, 0.92); ctx.fillStyle = 'rgba(0,25,60,0.25)'; ctx.fill(); ctx.restore();
    hullPath(ctx, L, B, 0.38, 0.92); ctx.fillStyle = '#f7f9fb'; ctx.fill(); ctx.lineWidth = 0.08; ctx.strokeStyle = '#6b7788'; ctx.stroke();
    ctx.save(); hullPath(ctx, L * 0.9, B * 0.82, 0.4, 0.9); ctx.fillStyle = '#dfe6ee'; ctx.fill(); ctx.restore();
    ctx.fillStyle = n.spec.color || '#1f6fd1';
    ctx.beginPath(); ctx.moveTo(-B / 2 + 0.05, -L * 0.1); ctx.lineTo(-B / 2 + 0.05, L / 2 - 0.1); ctx.lineTo(-B / 2 + 0.22, L / 2 - 0.1); ctx.lineTo(-B / 2 + 0.22, -L * 0.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(B / 2 - 0.05, -L * 0.1); ctx.lineTo(B / 2 - 0.05, L / 2 - 0.1); ctx.lineTo(B / 2 - 0.22, L / 2 - 0.1); ctx.lineTo(B / 2 - 0.22, -L * 0.1); ctx.fill();
    // windscreen + console
    ctx.fillStyle = 'rgba(30,60,90,0.85)'; ctx.beginPath(); ctx.moveTo(-B * 0.36, -L * 0.02); ctx.quadraticCurveTo(0, -L * 0.14, B * 0.36, -L * 0.02); ctx.lineTo(B * 0.32, L * 0.05); ctx.quadraticCurveTo(0, -L * 0.05, -B * 0.32, L * 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; rr(ctx, -B * 0.28, L * 0.06, B * 0.56, L * 0.12, 0.15); ctx.fill(); ctx.strokeStyle = '#9aa6b5'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.fillStyle = '#c9b48a'; rr(ctx, -B * 0.34, L * 0.24, B * 0.68, L * 0.14, 0.2); ctx.fill();
    // driver
    ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.arc(-B * 0.12, L * 0.2, 0.32, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b3a20'; ctx.beginPath(); ctx.arc(-B * 0.12, L * 0.2, 0.18, 0, TAU); ctx.fill();
    // outboard
    ctx.fillStyle = '#20242b'; rr(ctx, -0.32, L / 2 - 0.15, 0.64, 0.75, 0.15); ctx.fill();
    ctx.restore();
  }
  function drawFish(ctx, n, tm) {
    const L = n.L, B = n.B, ob = n.o;
    ctx.save(); ctx.translate(ob.x, ob.y); ctx.rotate(ob.heading);
    ctx.save(); ctx.translate(0.2, 0.3); hullPath(ctx, L, B, 0.3, 0.7); ctx.fillStyle = 'rgba(0,25,60,0.25)'; ctx.fill(); ctx.restore();
    hullPath(ctx, L, B, 0.3, 0.7); ctx.fillStyle = n.spec.color || '#2a9d6f'; ctx.fill(); ctx.strokeStyle = '#163c2e'; ctx.lineWidth = 0.08; ctx.stroke();
    hullPath(ctx, L * 0.86, B * 0.78, 0.32, 0.7); ctx.fillStyle = '#b98a5a'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,20,0.5)'; ctx.lineWidth = 0.04; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * B * 0.1, -L * 0.3); ctx.lineTo(i * B * 0.1, L * 0.4); ctx.stroke(); }
    ctx.fillStyle = '#ffffff'; rr(ctx, -B * 0.3, L * 0.02, B * 0.6, L * 0.26, 0.12); ctx.fill(); ctx.strokeStyle = '#7a8796'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.fillStyle = '#e84a3c'; rr(ctx, -B * 0.32, L * 0.0, B * 0.64, L * 0.06, 0.05); ctx.fill();
    ctx.fillStyle = 'rgba(40,80,110,0.85)'; ctx.fillRect(-B * 0.22, L * 0.04, B * 0.44, L * 0.05);
    // nets / crates
    ctx.fillStyle = '#ff8c2b'; rr(ctx, -B * 0.25, -L * 0.28, B * 0.22, L * 0.12, 0.05); ctx.fill();
    ctx.fillStyle = '#2f7de1'; rr(ctx, B * 0.03, -L * 0.26, B * 0.22, L * 0.12, 0.05); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0, L * 0.28); ctx.lineTo(0, L * 0.48); ctx.stroke();
    ctx.restore();
  }
  function drawFerry(ctx, n, tm) {
    const L = n.L, B = n.B, ob = n.o;
    ctx.save(); ctx.translate(ob.x, ob.y); ctx.rotate(ob.heading);
    ctx.save(); ctx.translate(1.2, 1.8); hullPath(ctx, L, B, 0.2, 0.96); ctx.fillStyle = 'rgba(0,25,60,0.28)'; ctx.fill(); ctx.restore();
    hullPath(ctx, L, B, 0.2, 0.96); ctx.fillStyle = '#1d3b6e'; ctx.fill();
    hullPath(ctx, L * 0.96, B * 0.88, 0.21, 0.96); ctx.fillStyle = '#f4f6f9'; ctx.fill();
    // car deck at the bow, superstructure
    ctx.fillStyle = '#9aa6b5'; rr(ctx, -B * 0.32, -L * 0.42, B * 0.64, L * 0.12, 1); ctx.fill();
    ctx.fillStyle = '#ffffff'; rr(ctx, -B * 0.42, -L * 0.28, B * 0.84, L * 0.68, 2.2); ctx.fill(); ctx.strokeStyle = '#b8c2cf'; ctx.lineWidth = 0.25; ctx.stroke();
    ctx.fillStyle = '#e9edf2'; rr(ctx, -B * 0.34, -L * 0.18, B * 0.68, L * 0.48, 1.8); ctx.fill();
    // bridge with wings + windows
    ctx.fillStyle = '#ffffff'; rr(ctx, -B * 0.5, -L * 0.27, B, L * 0.05, 0.6); ctx.fill(); ctx.strokeStyle = '#9aa6b5'; ctx.stroke();
    ctx.fillStyle = '#23384f'; ctx.fillRect(-B * 0.36, -L * 0.265, B * 0.72, L * 0.018);
    // lifeboats
    ctx.fillStyle = '#ff7a1a';
    for (let i = 0; i < 3; i++) { rr(ctx, -B * 0.47, -L * 0.1 + i * L * 0.14, B * 0.09, L * 0.09, 0.6); ctx.fill(); rr(ctx, B * 0.38, -L * 0.1 + i * L * 0.14, B * 0.09, L * 0.09, 0.6); ctx.fill(); }
    // funnel
    ctx.fillStyle = '#1d3b6e'; rr(ctx, -B * 0.16, L * 0.2, B * 0.32, L * 0.1, 1.2); ctx.fill();
    ctx.fillStyle = '#ffb547'; ctx.fillRect(-B * 0.16, L * 0.23, B * 0.32, L * 0.025);
    ctx.fillStyle = 'rgba(60,60,60,0.25)'; const ph = (tm * 0.6) % 1;
    for (let i = 0; i < 3; i++) { const k = (ph + i / 3) % 1; ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.arc(0, L * 0.26 + k * L * 0.25, 1 + k * 3.5, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawShip(ctx, n, tm) {
    const L = n.L, B = n.B, ob = n.o;
    ctx.save(); ctx.translate(ob.x, ob.y); ctx.rotate(ob.heading);
    ctx.save(); ctx.translate(1.5, 2.2); hullPath(ctx, L, B, 0.16, 0.95); ctx.fillStyle = 'rgba(0,25,60,0.3)'; ctx.fill(); ctx.restore();
    hullPath(ctx, L, B, 0.16, 0.95); ctx.fillStyle = '#7a2230'; ctx.fill();
    hullPath(ctx, L * 0.97, B * 0.9, 0.17, 0.95); ctx.fillStyle = '#3c4552'; ctx.fill();
    const cols = ['#e84a3c', '#2f7de1', '#22b07d', '#ffb547', '#f4f6f9', '#8a5cf0', '#ff7a3d'];
    let k = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = cols[(r * 3 + c * 5 + 1) % cols.length]; k++;
      rr(ctx, -B * 0.4 + c * B * 0.2 + 0.1, -L * 0.34 + r * L * 0.085, B * 0.18, L * 0.075, 0.2); ctx.fill();
    }
    ctx.fillStyle = '#f4f6f9'; rr(ctx, -B * 0.42, L * 0.2, B * 0.84, L * 0.12, 1); ctx.fill(); ctx.strokeStyle = '#9aa6b5'; ctx.lineWidth = 0.25; ctx.stroke();
    ctx.fillStyle = '#ffffff'; rr(ctx, -B * 0.5, L * 0.2, B, L * 0.03, 0.4); ctx.fill();
    ctx.fillStyle = '#23384f'; ctx.fillRect(-B * 0.38, L * 0.205, B * 0.76, L * 0.012);
    ctx.fillStyle = '#20242b'; rr(ctx, -B * 0.12, L * 0.34, B * 0.24, L * 0.06, 0.8); ctx.fill();
    ctx.fillStyle = 'rgba(60,60,60,0.25)'; const ph = (tm * 0.5) % 1;
    for (let i = 0; i < 3; i++) { const q = (ph + i / 3) % 1; ctx.globalAlpha = 0.45 * (1 - q); ctx.beginPath(); ctx.arc(0, L * 0.37 + q * L * 0.22, 1.2 + q * 4, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  const POWER_DRAW = { motor: drawMotor, fish: drawFish, ferry: drawFerry, ship: drawShip };

  // ======================================================================== 6. the mode
  KOS.Modes.register('rowschool', { kind: 'sea', create(host, activity) { return createRowSchool(host, activity); } });

  function createRowSchool(host, activity) {
    const assist = host.assist || 'easy';
    const ids = ((activity.params && activity.params.scenarios) || ['r10a']).filter(id => SC[id]);
    const profile = host.profile || {};
    const sailCls = (() => { const b = KOS.Boats.get(host.boat); return b && !b.isMotor ? b.id : 'zest'; })();
    const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
    const S = {
      idx: -1, phase: 'boot', pt: 0, plan: null, sim: null, rep: null, view: null, results: [], wrong: 0, attempts: 0, failedOnce: false,
      fail: null, slowmo: 0, hudT: 0, ambT: 0, waits: [], tips: {}, cd: 0, cdN: 0, hornT: 0, flash: 0, showPath: assist === 'easy', ended: false,
      repT: 0, repHold: 0, answer: null, winT: 0,
    };
    const plans = {};
    function planFor(id) { return plans[id] || (plans[id] = prepare(id, { assist, sailCls })); }

    // ---- scene. The camera follows a dummy target that we glide between framings of the situation.
    const first = planFor(ids[0]);
    const camT = { x: first.F.C0.x, y: first.F.C0.y, heading: 0, speed: 0, vx: 0, vy: 0, cls: 'opti' };
    const scene = new KOS.SailScene(host.canvas, { tilt: host.tilt, tiltAuto: host.tiltAuto, venue: first.venue, wind: KOS.Wind.steady(first.F.windW, first.kn), boats: [], marks: [], lines: [],
      follow: camT, showWindArrow: false, showNoGo: false, highlightPlayer: false, showLanes: false });
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawScreen, { screen: true });

    const ctrl = KOS.Input.attach(host.layer, { layout: 'none', hike: false, autoTrim: assist !== 'pro', pauseButton: false });
    let controls = KOS.Physics.controls();
    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', { id: 'sit', icon: 'rules', labelKey: 'rowschool.hud.sit' }]);

    // ---- DOM overlays (all .rowschool-*; removed in destroy)
    const el = (cls, parent) => { const d = document.createElement('div'); d.className = cls; (parent || host.layer).appendChild(d); return d; };
    const cardEl = el('rowschool-card glass'); cardEl.hidden = true;
    const titleEl = el('rowschool-title'); titleEl.hidden = true;
    const roleEl = el('rowschool-role'); roleEl.hidden = true;
    const cdEl = el('countdown rowschool-cd'); cdEl.hidden = true;
    const flashEl = el('rowschool-flash');
    const esc = s => KOS.UI.esc ? KOS.UI.esc(s) : String(s);

    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio is optional */ } }
    function coach(text, ms, mood) { try { return (S.coachH = KOS.UI.coach(text, { ms: ms || 5200, mood })); } catch (e) { return null; } }
    // a tip from the last sail must never sit on top of the question / fail card
    function closeCoach() { try { if (S.coachH) S.coachH.close(); } catch (e) { /* optional */ } S.coachH = null; S.welcome = null; }
    function after(sec, fn) { S.waits.push({ t: sec, fn }); }
    function haptic(p) { try { KOS.Input.haptic && KOS.Input.haptic(p); } catch (e) { /* optional */ } }

    // ==================================================================== scenario flow
    function loadScenario(i) {
      S.idx = i;
      const id = ids[i];
      S.plan = planFor(id);
      S.wrong = 0; S.attempts = 0; S.failedOnce = false; S.answer = null; S.fail = null; S.showPath = assist === 'easy';
      S.results[i] = S.results[i] || { q: false, s: false, tries: 0 };
      // a new venue or a far-away spot: cut the camera there (behind the title) instead of gliding over kilometres
      S.snapCam = i > 0 && (scene.venue !== S.plan.venue || Math.hypot(scene.camera.x - S.plan.F.C0.x, scene.camera.y - S.plan.F.C0.y) > 300);
      if (scene.venue !== S.plan.venue) scene.setVenue(S.plan.venue);
      scene.wind = KOS.Wind.steady(S.plan.F.windW, S.plan.kn);
      scene.showLanes = !!(S.plan.scn.keepout || S.plan.scn.lane);
      scene.marks = S.plan.marksW;
      newSim();
      setPhase('intro');
      titleEl.innerHTML = '<small>' + esc(t('rowschool.kicker', { n: i + 1, m: ids.length })) + '</small><b>' + esc(t('rowschool.sc.' + id + '.title')) + '</b>';
      titleEl.hidden = false; titleEl.classList.remove('in'); void titleEl.offsetWidth; titleEl.classList.add('in');
      sfx('whoosh', { vol: 0.5 });
      hudTick(1);
    }
    function newSim() {
      S.sim = makeSim(S.plan, { assist, name: profile.name, sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : undefined, color: profile.boatColor });
      showSim(S.sim);
    }
    function showSim(sim) {
      S.view = sim;
      scene.boats.length = 0;
      for (const b of sim.boats()) { b.noTag = true; scene.boats.push(b); } // the mode draws its own, overlap-free name tags
    }
    function setPhase(p) {
      S.phase = p; S.pt = 0;
      const sailing = p === 'count' || p === 'sail';
      const lay = sailing ? (S.plan.pCls === 'rib' ? 'rib' : 'sail') : 'none';
      if (ctrl.opts.layout !== lay) ctrl.setLayout(lay, { hike: false, spinnaker: false, autoTrim: assist !== 'pro' });
      host.layer.classList.toggle('rowschool-sailing', sailing);
      host.layer.classList.toggle('rowschool-autotrim', assist !== 'pro');
      if (!sailing) roleEl.hidden = true;
    }

    // ---- ASK
    function showAsk() {
      setPhase('ask');
      titleEl.hidden = true;
      S.introLen = 0;
      closeCoach();
      const pl = S.plan, f = pl.npcs[pl.focusIdx], id = pl.id;
      const chip = (c, label, color, k) => '<button type="button" class="rs-choice" data-c="' + c + '">' +
        (color ? '<i class="rs-dot" style="--c:' + color + '"></i>' : '<i class="rs-dot rs-dot2"><b style="--c:#ff9a3d"></b><b style="--c:' + (f.spec.color || '#2f7de1') + '"></b></i>') +
        '<span>' + esc(label) + '</span>' + (touch ? '' : '<kbd>' + k + '</kbd>') + '</button>';
      cardEl.className = 'rowschool-card glass rs-ask';
      cardEl.innerHTML = '<div class="rs-kicker">' + KOS.UI.iconSvg('rules') + esc(t('rowschool.kicker', { n: S.idx + 1, m: ids.length })) + dots() + '</div>' +
        '<h2 class="rs-q">' + esc(t('rowschool.q')) + '</h2>' +
        '<p class="rs-sub">' + esc(t('rowschool.sc.' + id + '.ask')) + '</p>' +
        '<div class="rs-choices">' + chip('me', t('rowschool.you'), '#ff9a3d', 1) + chip('other', f.spec.name, f.spec.color || powerColor(f), 2) + chip('both', t('rowschool.both'), null, 3) + '</div>' +
        '<p class="rs-hint" hidden></p><p class="rs-tap">' + esc(t('rowschool.tapBoat')) + '</p>';
      openCard();
      cardEl.querySelectorAll('.rs-choice').forEach(b => b.addEventListener('click', () => answer(b.getAttribute('data-c'))));
    }
    function powerColor(n) { return n.kind === 'ferry' ? '#1d3b6e' : n.kind === 'ship' ? '#7a2230' : n.kind === 'rib' ? '#ff6a1a' : '#2f7de1'; }
    function dots() {
      return '<span class="rs-dots">' + ids.map((_, i) => {
        const r = S.results[i];
        const cls = i < S.idx ? (r && r.q && r.s ? 'ok' : 'meh') : i === S.idx ? 'cur' : '';
        return '<i class="' + cls + '"></i>';
      }).join('') + '</span>';
    }
    function openCard() { cardEl.hidden = false; cardEl.classList.remove('in'); void cardEl.offsetWidth; cardEl.classList.add('in'); }
    function closeCard() { cardEl.hidden = true; cardEl.classList.remove('in'); }

    function answer(c) {
      if (S.phase !== 'ask') return;
      const pl = S.plan, ok = c === pl.ans;
      const btn = cardEl.querySelector('.rs-choice[data-c="' + c + '"]');
      if (!ok) {
        S.wrong++;
        sfx('bump', { vol: 0.6 }); haptic([20, 40, 20]);
        if (btn) { btn.classList.add('wrong'); btn.disabled = true; }
        const h = cardEl.querySelector('.rs-hint');
        if (h) { h.hidden = false; h.textContent = t('rowschool.wrongTry') + ' ' + t('rowschool.hint.' + hintKey(pl.rule, pl.scn)); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); }
        const tgt = c === 'me' ? S.sim.player : c === 'other' ? S.sim.focus().o : null;
        if (tgt && scene.effects) scene.effects.text(tgt.x, tgt.y - 2, '✗', { color: '#ff4d5e', size: 30 });
        return;
      }
      S.results[S.idx].q = S.wrong === 0;
      if (btn) btn.classList.add('right');
      sfx('coin', { pitch: 1.1 }); sfx('star', { vol: 0.6 }); haptic(25);
      const fx = scene.effects, sim = S.sim;
      const giver = pl.ans === 'me' ? sim.player : pl.ans === 'other' ? sim.focus().o : null;
      if (fx) {
        for (const b of giver ? [giver] : [sim.player, sim.focus().o]) { fx.stars(b.x, b.y, 12); fx.ripple(b.x, b.y, 3, 1); }
        fx.text(sim.player.x, sim.player.y - 3, t('rowschool.right'), { color: '#3ee08f', size: 26 });
      }
      S.answer = c;
      after(0.55, showExplain);
    }
    function hintKey(rule, scn) {
      return ({ R10: 'R10', R11: 'R11', R12: 'R12', R13: 'R13', R18: 'R18', 'C-power-sail': 'power', 'C-overtaking': 'overtaking', 'C-headon': 'headon', 'C-crossing': 'crossing' })[rule] || 'big';
    }

    // ---- EXPLAIN (+ replay)
    function reasonText(pl) {
      const f = pl.npcs[pl.focusIdx], who = pl.ans === 'both' ? 'both' : pl.ans === 'me' ? 'me' : 'other';
      const key = 'rowschool.reason.' + (pl.scn.reason || pl.rule) + '.' + who;
      if (KOS.I18n.has && KOS.I18n.has(key)) return t(key, { name: f.spec.name });
      return pl.row && pl.row.row ? KOS.Rules.explain(pl.row.row) : '';
    }
    function ruleTitle(rule) {
      const own = 'rowschool.rname.' + rule;
      if (KOS.I18n.has && KOS.I18n.has(own)) return t(own);
      return KOS.Rules.ruleName(rule);
    }
    function showExplain() {
      setPhase('explain');
      closeCoach();
      const pl = S.plan, id = pl.id, why = 'rowschool.sc.' + id + '.why';
      cardEl.className = 'rowschool-card glass rs-explain';
      cardEl.innerHTML = '<div class="rs-verdict">' + KOS.UI.iconSvg('check') + esc(S.wrong ? t('rowschool.right2') : t('rowschool.right')) + dots() + '</div>' +
        '<div class="rs-rule"><span class="rs-rnum">' + esc(t('rowschool.rnum.' + pl.rule)) + '</span><b>' + esc(ruleTitle(pl.rule)) + '</b></div>' +
        '<p class="rs-reason">' + esc(reasonText(pl)) + '</p>' +
        (KOS.I18n.has && KOS.I18n.has(why) ? '<p class="rs-why">' + KOS.UI.iconSvg('info') + '<span>' + esc(t(why)) + '</span></p>' : '') +
        '<div class="rs-btns"><button type="button" class="btn btn-glass rs-replay">' + KOS.UI.iconSvg('retry') + '<span>' + esc(t('rowschool.btn.replay')) + '</span></button>' +
        '<button type="button" class="btn btn-primary rs-go">' + KOS.UI.iconSvg('sail') + '<span>' + esc(t('rowschool.btn.go')) + '</span>' + (touch ? '' : '<kbd>Enter</kbd>') + '</button></div>';
      openCard();
      cardEl.querySelector('.rs-replay').addEventListener('click', () => { sfx('click'); startReplay(); });
      cardEl.querySelector('.rs-go').addEventListener('click', () => { sfx('click'); startSail(); });
      for (const n of S.sim.npcs) if (n.focus) n.o.tagColor = tagColor(pl.ans === 'other' || pl.ans === 'both' ? 'give' : 'stand');
      S.sim.player.tagColor = tagColor(pl.ans === 'me' || pl.ans === 'both' ? 'give' : 'stand');
      startReplay();
    }
    function tagColor(role) { return role === 'give' ? 'rgba(232,50,60,0.9)' : 'rgba(24,169,87,0.92)'; }
    function startReplay() {
      S.rep = makeSim(S.plan, { assist, name: profile.name, sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : undefined, color: profile.boatColor });
      const pl = S.plan;
      S.rep.player.tagColor = tagColor(pl.ans === 'me' || pl.ans === 'both' ? 'give' : 'stand');
      for (const n of S.rep.npcs) if (n.focus) n.o.tagColor = tagColor(pl.ans === 'other' || pl.ans === 'both' ? 'give' : 'stand');
      S.rep.trails = [];
      S.repT = 0; S.repHold = 0;
      showSim(S.rep);
    }
    function replayStep(dt) {
      const r = S.rep; if (!r) return;
      if (S.repHold > 0) { S.repHold -= dt; if (S.repHold <= 0) startReplay(); return; }
      r.step(dt, r.autoControls());
      if ((S.repT += dt) >= 0.25) {
        S.repT = 0;
        r.trails.push([{ x: r.player.x, y: r.player.y }].concat(r.npcs.map(n => ({ x: n.o.x, y: n.o.y }))));
        if (r.trails.length > 160) r.trails.shift();
      }
      if (r.t >= S.plan.scn.dur) S.repHold = 1.4;
    }

    // ---- SAIL IT
    function startSail() {
      if (S.phase === 'sail' || S.phase === 'count') return;
      closeCard();
      newSim();
      S.fail = null; S.slowmo = 0; S.hornT = 0; S.winT = 0;
      S.attempts++; S.results[S.idx].tries++;
      controls = KOS.Physics.controls();
      controls.autoTrim = assist !== 'pro'; controls.autoHike = true;
      setPhase('count');
      if (S.plan.pCls === 'rib') ctrl.setThrottle(S.plan.scn.me.thr || 0.3);
      else { ctrl.setSheet(S.sim.player.sheet); ctrl.setAutoTrim(assist !== 'pro'); }
      roleEl.hidden = false; paintRole(true);
      if (autopilot) { S.cdN = 0; beginSail(); return; }
      S.cdN = S.attempts > 1 ? 2 : 3; S.cd = 0;
      cdEl.hidden = false; cdTick();
      if (S.attempts === 1 || S.failedOnce) {
        const keys = touch ? '' : ' ' + t(S.plan.pCls === 'rib' ? 'rowschool.coach.keysRib' : 'rowschool.coach.keys');
        coach(t('rowschool.sc.' + S.plan.id + '.tip') + (S.tips.keys ? '' : keys), 6000);
        S.tips.keys = true;
      }
    }
    function cdTick() {
      cdEl.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'countdown-num' + (S.cdN <= 0 ? ' go' : '');
      d.textContent = S.cdN > 0 ? String(S.cdN) : t('ui.countdown.go');
      cdEl.appendChild(d);
      sfx(S.cdN > 0 ? 'countdown' : 'go');
    }
    function beginSail() {
      setPhase('sail');
      cdEl.hidden = true;
      const f = S.sim.focus();
      if (f && f.spec.horn) { after(0.4, () => horn5()); }
    }
    function horn5() { for (let i = 0; i < 5; i++) after(i * 0.32, () => sfx('hornShort', { vol: 0.8, pitch: 0.7 })); if (!S.tips.horn5) { S.tips.horn5 = true; after(1.8, () => { if (S.phase === 'sail') coach(t('rowschool.coach.horn5'), 5000); }); } }

    function failSail(f) {
      if (S.phase !== 'sail') return;
      S.fail = f; S.failedOnce = true;
      setPhase('fail');
      const sim = S.sim, pl = sim.player;
      if (f.kind === 'bump') { sfx('crash'); scene.shake(0.9); if (scene.effects && f.n) scene.effects.splash((pl.x + f.n.o.x) / 2, (pl.y + f.n.o.y) / 2, 1.2); }
      else { sfx('whistle'); scene.shake(0.3); }
      haptic([40, 60, 40]);
      flash();
      if (scene.effects) scene.effects.text(pl.x, pl.y - 3, t('rowschool.fail.' + f.kind + '.t'), { color: '#ff4d5e', size: 26 });
      try { KOS.Audio.engine(null); } catch (e) { /* optional */ }
      after(autopilot ? 0 : 0.9, () => {
        cardEl.className = 'rowschool-card glass rs-fail';
        cardEl.innerHTML = '<div class="rs-fail-ico">' + KOS.UI.iconSvg(f.kind === 'bump' ? 'life' : 'whistle') + '</div>' +
          '<h2 class="rs-q">' + esc(t('rowschool.fail.' + f.kind + '.t')) + '</h2>' +
          '<p class="rs-sub">' + esc(t('rowschool.fail.' + f.kind + '.d')) + '</p>' +
          (!S.showPath ? '<p class="rs-hint">' + esc(t('rowschool.coach.firstFail')) + '</p>' : '') +
          '<div class="rs-btns"><button type="button" class="btn btn-glass rs-watch">' + KOS.UI.iconSvg('eye') + '<span>' + esc(t('rowschool.btn.watch')) + '</span></button>' +
          '<button type="button" class="btn btn-primary rs-retry">' + KOS.UI.iconSvg('retry') + '<span>' + esc(t('rowschool.btn.retry')) + '</span>' + (touch ? '' : '<kbd>Enter</kbd>') + '</button></div>';
        closeCoach(); openCard();
        cardEl.querySelector('.rs-retry').addEventListener('click', () => { sfx('click'); retry(); });
        cardEl.querySelector('.rs-watch').addEventListener('click', () => { sfx('click'); showExplain(); });
        S.showPath = true;
        if (autopilot) retry();
      });
    }
    function retry() { if (S.phase === 'fail') startSail(); }
    function flash() { flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }

    function winSail() {
      setPhase('win');
      const r = S.results[S.idx];
      r.s = S.attempts === 1;
      const pl = S.sim.player, fx = scene.effects;
      sfx('star', { pitch: 1.15 }); after(0.15, () => sfx('coin', { pitch: 1.3 }));
      haptic(30);
      if (fx) { fx.stars(pl.x, pl.y, 18); fx.confetti(pl.x, pl.y, r.q && r.s ? 80 : 30); fx.ripple(pl.x, pl.y, 4, 1.2); }
      const big = r.q && r.s;
      titleEl.innerHTML = '<b class="rs-ok">' + esc(big ? t('rowschool.allClean') : r.s ? t('rowschool.clean') : t('rowschool.ok')) + '</b>' +
        '<span class="rs-mini">' + (r.q ? '<i class="on">✓</i>' : '<i>✓</i>') + (r.s ? '<i class="on">⛵</i>' : '<i>⛵</i>') + '</span>';
      titleEl.hidden = false; titleEl.classList.remove('in'); void titleEl.offsetWidth; titleEl.classList.add('in');
      if (S.plan.scn.avoid) coach(t('rowschool.coach.twistDone'), 5000);
      try { KOS.Audio.engine(null); } catch (e) { /* optional */ }
      after(autopilot ? 0.05 : 1.9, () => { titleEl.hidden = true; if (S.idx + 1 < ids.length) loadScenario(S.idx + 1); else endActivity(); });
    }

    function endActivity() {
      if (S.ended) return;
      S.ended = true;
      setPhase('done');
      const n = ids.length, q = S.results.filter(r => r && r.q).length, s = S.results.filter(r => r && r.s).length;
      const ratio = (q + s) / (2 * n);
      const th = assist === 'easy' ? [0.6, 0.3] : assist === 'pro' ? [0.99, 0.66] : [0.8, 0.5];
      const stars = ratio >= th[0] ? 3 : ratio >= th[1] ? 2 : 1;
      const tries = S.results.reduce((a, r) => a + (r ? r.tries : 0), 0);
      if (stars === 3) { try { KOS.UI.confetti(); } catch (e) { /* optional */ } sfx('cheer', { vol: 0.6 }); }
      sfx('win', { vol: 0.5 });
      const pl = S.sim.player;
      if (scene.effects) { scene.effects.confetti(pl.x, pl.y, 120); scene.effects.text(pl.x, pl.y - 4, '★'.repeat(stars), { color: '#ffd25e', size: 34 }); }
      // rules master: every rowschool activity done (this one counts as done now)
      try {
        const all = ACTS.every(a => a.id === activity.id || (KOS.Storage.progress(a.id) || {}).done);
        if (all && KOS.Storage.award) KOS.Storage.award('rules-master'); // announced on the results screen
      } catch (e) { /* storage optional */ }
      const result = {
        stars, success: true, score: Math.round(1000 * ratio + q * 150 + s * 150), timeMs: Math.round(S.timeAll * 1000),
        stats: { 'rowschool.stat.right': q + '/' + n, 'rowschool.stat.clean': s + '/' + n, 'rowschool.stat.tries': tries },
        msgKey: 'rowschool.res.msg', msgVars: { q, s, n },
      };
      after(autopilot ? 0.05 : 1.7, () => host.finish(result));
    }

    // ==================================================================== per step
    S.timeAll = 0;
    function update(dt) {
      S.timeAll += dt; S.pt += dt;
      for (let i = S.waits.length - 1; i >= 0; i--) { const w = S.waits[i]; if ((w.t -= dt) <= 0) { S.waits.splice(i, 1); w.fn(); } }
      if (S.ended && S.phase !== 'done') return;
      switch (S.phase) {
        case 'intro': if (S.pt > (autopilot ? 0.05 : S.introLen || 1.7)) showAsk(); break;
        case 'ask': if (autopilot && S.pt > 0.05) answer(S.plan.ans); break;
        case 'explain': replayStep(dt); if (autopilot && S.pt > 0.05) startSail(); break;
        case 'count':
          if ((S.cd += dt) >= 0.85) { S.cd = 0; S.cdN--; if (S.cdN < 0) beginSail(); else cdTick(); }
          break;
        case 'sail': sailStep(dt); break;
        case 'win': // keep the water alive while we celebrate (no more rule checks)
          controls = KOS.Input.toControls(ctrl.state, S.sim.player, controls, dt);
          S.sim.step(dt, autopilot ? S.sim.autoControls() : controls);
          break;
        default: break;
      }
      framing(dt);
      hudTick(dt);
    }
    function sailStep(dt0) {
      const sim = S.sim, pl = sim.player, scn = S.plan.scn;
      let dt = dt0;
      if (S.slowmo > 0) { S.slowmo -= dt0; dt = dt0 * 0.35; }
      controls = KOS.Input.toControls(ctrl.state, pl, controls, dt);
      controls.autoHike = true;
      if (assist !== 'pro') controls.autoTrim = ctrl.state.autoTrim !== false;
      const c = autopilot ? sim.autoControls() : controls;
      sim.step(dt, c);
      if (controls.autoTrim && S.plan.pCls !== 'rib') ctrl.setSheet(pl.sheet);
      const f = sim.check();
      if (f) { failSail(f); return; }
      // warnings + twists
      for (const n of sim.npcs) {
        if (n.near && !n.warned) { n.warned = true; sfx('hornShort', { vol: 0.5, pitch: 1.2 }); if (scene.effects) scene.effects.text(n.o.x, n.o.y - 3, t('rowschool.watchOut'), { color: '#ffb547', size: 22 }); }
      }
      if (scn.avoid && !sim.twisted) {
        const fn = sim.focus();
        if (fn.gap < S.plan.Lp * 4 && fn.closing) { sim.twisted = true; S.slowmo = autopilot ? 0 : 1.6; coach(t('rowschool.coach.twist'), 5200, 'wow'); sfx('hornLong', { vol: 0.7 }); scene.shake(0.2); }
      }
      if (scn.keepout || scn.rule === 'draught') {
        const fn = sim.focus();
        if ((S.hornT -= dt) <= 0 && fn.gap < (fn.big ? 70 : 25) && fn.closing && sim.t < S.plan.encEnd) { S.hornT = 6; horn5(); }
      }
      if (sim.success()) winSail();
      if ((S.roleT = (S.roleT || 0) - dt) <= 0) { S.roleT = 0.2; paintRole(); }
    }
    function paintRole(force) {
      const r = S.sim.myRole();
      if (!force && r === S.lastRole) return;
      S.lastRole = r;
      roleEl.className = 'rowschool-role rs-r-' + r;
      roleEl.innerHTML = KOS.UI.iconSvg(r === 'give' || r === 'giveRoom' || r === 'keepout' || r === 'keepShip' ? 'shield' : r === 'free' ? 'flag' : r === 'both' ? 'forward' : 'check') + '<span>' + esc(t('rowschool.role.' + r)) + '</span>';
      roleEl.classList.remove('pop'); void roleEl.offsetWidth; roleEl.classList.add('pop');
    }

    // ---- camera: frame the situation in the free part of the screen (HUD on top, card / controls at the bottom)
    function framing(dt) {
      const v = S.view; if (!v) return;
      const pts = [];
      const add = (x, y, r) => { pts.push([x - r, y - r], [x + r, y + r]); };
      const pl = v.player, Lp = S.plan.Lp;
      const asking = S.phase === 'intro' || S.phase === 'ask';
      add(pl.x, pl.y, Lp * 1.6);
      for (const n of v.npcs) {
        const d = Math.hypot(n.o.x - pl.x, n.o.y - pl.y);
        if (n.spec.traffic && d > 75) continue;
        if (!n.focus && d > 140) continue;
        add(n.o.x, n.o.y, n.big ? n.L * 0.55 : n.L * 1.2);
      }
      if (asking) {
        const C = S.plan.F.toW(S.plan.C.x, S.plan.C.y);
        if (S.plan.scn.T > 0 && !S.plan.scn.keepout) add(C.x, C.y, Lp);
        const f = U.vec(pl.heading); add(pl.x + f.x * Math.max(Lp * 3, pl.speed * 3), pl.y + f.y * Math.max(Lp * 3, pl.speed * 3), Lp);
      }
      if (asking || S.phase === 'explain') { // keep the other boat's course arrow on screen too
        for (const n of v.npcs) if (n.focus && !n.big) {
          const f = U.vec(n.o.heading), a = n.L * 0.55 + Math.max(n.L * 1.6, Math.abs(n.o.speed || 0) * 3.2);
          add(n.o.x + f.x * a, n.o.y + f.y * a, Lp * 0.8);
        }
      }
      for (const m of S.plan.marksW) add(m.x, m.y, Lp * 3.2);
      if ((S.phase === 'sail' || S.phase === 'count' || S.phase === 'fail') && S.plan.ring) {
        const rg = S.plan.ring, d = Math.hypot(rg.x - pl.x, rg.y - pl.y);
        if (d < 120) add(rg.x, rg.y, rg.r);
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      const W = scene.w, H = scene.h, land = H < 500 && W > H;
      const hb = hud.el.getBoundingClientRect();
      let top = Math.max(64, hb.bottom + 14), bot = H - 14, left = 14, right = 14;
      if (!cardEl.hidden) { const cr = cardEl.getBoundingClientRect(); if (land && cr.left > W * 0.4) right = W - cr.left + 10; else if (land) left = cr.right + 10; else bot = Math.min(bot, cr.top - 10); }
      else if (S.phase === 'sail' || S.phase === 'count' || S.phase === 'fail') {
        const slider = assist === 'pro' || S.plan.pCls === 'rib';
        if (land) { left = 150; right = 150; bot = H - 20; } else { bot = H - (W < 700 ? 200 : 140); if (slider) right = W < 700 ? 96 : 120; }
      }
      // keep the situation clear of the coach bubble while a tip is up (portrait / desktop: the bubble sits at the bottom)
      const co = document.querySelector('.coach');
      if (co) { const r = co.getBoundingClientRect(); if (r.height && r.top > H * 0.45) bot = Math.min(bot, r.top - 10); else if (r.height && land && r.bottom < H * 0.5) top = Math.max(top, r.bottom + 6); }
      if (!land && W < 640) top += 70; // phones: the wind badge / replay badge / role pill row under the HUD
      const pad = 26, aw = Math.max(80, W - left - right - pad * 2), ah = Math.max(80, bot - top - pad * 2);
      let z = Math.min(aw / Math.max(4, x1 - x0), ah / Math.max(4, y1 - y0));
      z = U.clamp(z, 1.1, Math.min(W, H) * 0.16 / Lp);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = (left + W - right) / 2, sy = (top + bot) / 2;
      camT.x = cx - (sx - W / 2) / z; camT.y = cy - (sy - H / 2) / (z * scene.kY); // screen-Y px → metres divides by Z*kY (kY is exactly 1 when flat)
      scene.fixedZoom = z;
      if (S.snapCam) { S.snapCam = false; scene.follow(camT); }
    }

    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      const v = S.view;
      if (S.hudT <= 0 && v) {
        S.hudT = 0.1;
        hud.update({ wind: { dir: S.plan.F.windW, speed: S.plan.kn }, speed: U.kn(Math.abs(v.player.speed)), custom: { sit: (S.idx + 1) + '<small>/' + ids.length + '</small>' } });
      }
      if (S.ambT <= 0) {
        S.ambT = 0.5;
        try {
          KOS.Audio.ambient({ wind: S.plan.kn, waves: 0.45, harbor: S.plan.venue.id === 'harbor' ? 0.5 : 0.1 });
          if (S.plan.pCls === 'rib' && S.phase === 'sail') KOS.Audio.engine(S.sim.player.throttle || 0); else KOS.Audio.engine(null);
        } catch (e) { /* optional */ }
      }
    }

    // ==================================================================== drawing
    function drawWorld(ctx, sc) {
      const v = S.view; if (!v) return;
      const mpp = sc.mpp, tm = sc.t, pl = S.plan;
      // zone around the mark (R18)
      for (const m of pl.marksW) {
        const R = 3 * pl.Lp;
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.12, 2 * mpp); ctx.setLineDash([7 * mpp, 6 * mpp]); ctx.lineDashOffset = -tm * 8 * mpp;
        ctx.fillStyle = 'rgba(255,214,94,0.10)'; ctx.beginPath(); ctx.arc(m.x, m.y, R, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
        // label on the far side of the zone from the boats, so tags and arrows never cover it
        let ax = 0, ay = 0; for (const b of v.boats()) { ax += b.x - m.x; ay += b.y - m.y; }
        const al = Math.hypot(ax, ay) || 1, lx = m.x - ax / al * R, ly = m.y - ay / al * R;
        if (S.phase === 'ask' || S.phase === 'intro' || S.phase === 'explain') sc.pill(ctx, lx, ly, t('rowschool.zone'), { dy: ay > 0 ? -12 : 12, size: 10, bg: 'rgba(13,19,33,0.6)' });
      }
      // ferry corridor (where you must not be)
      if (pl.scn.keepout && (S.phase !== 'ask' || true)) {
        const n = v.focus(), ob = n.o, f = U.vec(ob.heading), r = { x: -f.y, y: f.x }, w = n.B / 2 + v.K.lane, a0 = -n.L / 2, a1 = n.L / 2 + 26 + 60;
        ctx.save();
        const g = ctx.createLinearGradient(ob.x + f.x * a0, ob.y + f.y * a0, ob.x + f.x * a1, ob.y + f.y * a1);
        g.addColorStop(0, 'rgba(255,77,94,0.20)'); g.addColorStop(0.55, 'rgba(255,77,94,0.16)'); g.addColorStop(1, 'rgba(255,77,94,0)');
        ctx.fillStyle = g; ctx.beginPath();
        ctx.moveTo(ob.x + f.x * a0 + r.x * w, ob.y + f.y * a0 + r.y * w); ctx.lineTo(ob.x + f.x * a1 + r.x * w, ob.y + f.y * a1 + r.y * w);
        ctx.lineTo(ob.x + f.x * a1 - r.x * w, ob.y + f.y * a1 - r.y * w); ctx.lineTo(ob.x + f.x * a0 - r.x * w, ob.y + f.y * a0 - r.y * w); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // replay trails
      if (S.phase === 'explain' && v.trails && v.trails.length > 1) {
        const cols = ['#ff9a3d'].concat(v.npcs.map(n => n.spec.color || powerColor(n)));
        for (let k = 0; k < cols.length; k++) {
          ctx.save(); ctx.strokeStyle = cols[k]; ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(0.15, 3 * mpp); ctx.setLineDash([0.1, 7 * mpp]); ctx.lineCap = 'round';
          ctx.beginPath(); v.trails.forEach((p, i) => { const q = p[k]; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke(); ctx.restore();
        }
      }
      // ghost path (easy, or after a fail)
      if (S.showPath && (S.phase === 'count' || S.phase === 'sail' || S.phase === 'fail') && pl.path.length > 1) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,214,94,0.8)'; ctx.lineWidth = Math.max(0.2, 4 * mpp); ctx.setLineDash([0.1, 10 * mpp]); ctx.lineDashOffset = -tm * 18 * mpp; ctx.lineCap = 'round';
        ctx.beginPath(); pl.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.restore();
      }
      // goal ring
      if (pl.ring && S.phase !== 'ask' && S.phase !== 'intro' && S.phase !== 'explain') drawGoal(ctx, sc, pl.ring);
      // power vessels: wakes then hulls, then tags
      for (const n of v.npcs) if (!n.phys) drawWake(ctx, n, v.t);
      for (const n of v.npcs) if (!n.phys) { const fn = POWER_DRAW[n.kind]; if (fn) fn(ctx, n, tm); }
      // player highlight ring (always readable, even when tiny next to a ferry)
      const R = Math.max(pl.Lp * 0.85, 16 * mpp), pulse = 0.5 + 0.5 * Math.sin(tm * 4);
      ctx.save(); ctx.strokeStyle = 'rgba(255,154,61,' + (0.55 + 0.35 * pulse) + ')'; ctx.lineWidth = Math.max(0.12, 2.5 * mpp);
      ctx.beginPath(); ctx.arc(v.player.x, v.player.y, R + pulse * 2 * mpp, 0, TAU); ctx.stroke(); ctx.restore();
      // danger rings while sailing
      if (S.phase === 'sail') for (const n of v.npcs) if (n.near) {
        const k = 0.5 + 0.5 * Math.sin(tm * 10);
        ctx.save(); ctx.strokeStyle = 'rgba(255,77,94,' + (0.5 + 0.4 * k) + ')'; ctx.lineWidth = Math.max(0.15, 3 * mpp);
        ctx.beginPath(); ctx.arc(n.o.x, n.o.y, (n.big ? n.L * 0.6 : n.L * 0.9) + k * 6 * mpp, 0, TAU); ctx.stroke(); ctx.restore();
      }
      // fail: mark the spot
      if (S.phase === 'fail' && S.fail && S.fail.n) {
        const n = S.fail.n, x = (v.player.x + n.o.x) / 2, y = (v.player.y + n.o.y) / 2;
        ctx.save(); ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = Math.max(0.2, 4 * mpp);
        ctx.beginPath(); ctx.arc(x, y, Math.max(pl.Lp, 22 * mpp) * (1 + 0.1 * Math.sin(tm * 8)), 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
    function drawGoal(ctx, sc, rg) {
      const mpp = sc.mpp, tm = sc.t, r = rg.r;
      ctx.save(); ctx.translate(rg.x, rg.y);
      const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.2);
      g.addColorStop(0, 'rgba(255,214,94,0.0)'); g.addColorStop(0.8, 'rgba(255,214,94,0.18)'); g.addColorStop(1, 'rgba(255,214,94,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,94,0.95)'; ctx.lineWidth = Math.max(0.2, 4 * mpp); ctx.setLineDash([r * 0.32, r * 0.18]); ctx.lineDashOffset = -tm * r * 0.4;
      ctx.beginPath(); ctx.arc(0, 0, r * (1 + 0.04 * Math.sin(tm * 3)), 0, TAU); ctx.stroke();
      ctx.restore();
      // label on the ring's top edge, so it never sits on a boat passing through the ring
      sc.pill(ctx, rg.x, rg.y - r, t('rowschool.goal'), { dy: 0, size: 11, bg: 'rgba(255,181,71,0.92)', color: '#2a1206' });
    }

    function drawScreen(ctx, sc) {
      const v = S.view; if (!v) return;
      const pl = S.plan, tm = sc.t;
      const asking = S.phase === 'ask' || S.phase === 'intro', explaining = S.phase === 'explain';
      // course arrows in the frozen situation (and the replay)
      if (asking || explaining || S.phase === 'count') {
        const items = [{ b: v.player, col: '#ff9a3d', role: pl.ans === 'me' || pl.ans === 'both' ? 'give' : 'stand', L: pl.Lp }];
        for (const n of v.npcs) items.push({ b: n.o, col: n.spec.color || powerColor(n), role: n.focus ? (pl.ans === 'other' || pl.ans === 'both' ? 'give' : 'stand') : null, L: n.L, n });
        if (asking && pl.scn.T > 0 && !pl.scn.keepout) drawConflict(ctx, sc, items, tm);
        for (const it of items) {
          if (it.n && it.n.spec.traffic && !asking) continue;
          const col = explaining && it.role ? (it.role === 'give' ? '#ff4d5e' : '#3ee08f') : it.col;
          drawArrow(ctx, sc, it.b, it.L, col, tm, it.n && asking ? it.n.spec.intent : null);
        }
      }
      // REPLAY badge
      if (explaining) {
        const a = 0.55 + 0.45 * Math.sin(tm * 5);
        ctx.save(); ctx.font = '900 12px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const hb = hud.el.getBoundingClientRect(), x = 18, y = sc.h < 500 && sc.w > sc.h ? 116 : Math.max(76, hb.bottom + 26);
        ctx.fillStyle = 'rgba(13,19,33,0.7)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 8, y - 13, 92, 26, 13) : ctx.rect(x - 8, y - 13, 92, 26); ctx.fill();
        ctx.fillStyle = 'rgba(255,77,94,' + a + ')'; ctx.beginPath(); ctx.arc(x + 4, y, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(t('rowschool.replay'), x + 15, y + 1); ctx.restore();
      }
      drawTags(ctx, sc);
      drawWindBadge(ctx, sc, tm);
    }
    // name tags (+ VIGER / HOLDER KURS while explaining) behind each boat's stern, so they never sit on the course arrow,
    // and pushed apart when two boats sail side by side
    function drawTags(ctx, sc) {
      const v = S.view, pl = S.plan, explaining = S.phase === 'explain';
      const roleTxt = r => pl.ans === 'both' ? t('rowschool.tag.both') : t('rowschool.tag.' + r);
      const items = [{ b: v.player, L: pl.Lp, text: v.player.tag, bg: 'rgba(255,122,61,0.92)', role: pl.ans === 'me' || pl.ans === 'both' ? 'give' : 'stand' }];
      for (const n of v.npcs) items.push({ b: n.o, L: n.L, text: n.spec.name, bg: 'rgba(13,19,33,0.66)', role: n.focus ? (pl.ans === 'other' || pl.ans === 'both' ? 'give' : 'stand') : null });
      ctx.save(); ctx.font = '800 11px ui-rounded,"Segoe UI",system-ui,sans-serif';
      const boxes = [];
      for (const it of items) {
        if (!it.text) continue;
        const p = sc.worldToScreen(it.b.x, it.b.y);
        if (p.x < -80 || p.x > sc.w + 80 || p.y < -80 || p.y > sc.h + 80) continue;
        const f = U.vec(it.b.heading), q = sc.worldToScreen(it.b.x + f.x, it.b.y + f.y);
        let dx = q.x - p.x, dy = q.y - p.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        const role = explaining && it.role ? roleTxt(it.role) : null;
        const w = Math.max(ctx.measureText(it.text).width + 16, role ? ctx.measureText(role).width + 18 : 0), h = role ? 44 : 20;
        const off = Math.min(it.L / sc.mpp * 0.5, 120) + 10 + Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
        boxes.push({ x: p.x - dx * off, y: p.y - dy * off, w, h, it, role });
      }
      for (let k = 0; k < 8; k++) {
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j], ox = (a.w + b.w) / 2 + 4 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + 3 - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0) continue;
          if (oy < ox) { const s = a.y <= b.y ? -1 : 1; a.y += s * oy / 2; b.y -= s * oy / 2; } else { const s = a.x <= b.x ? -1 : 1; a.x += s * ox / 2; b.x -= s * ox / 2; }
        }
      }
      for (const bx of boxes) {
        // never let a tag hang off the screen edge (big ships / traffic near the border)
        bx.x = U.clamp(bx.x, bx.w / 2 + 6, sc.w - bx.w / 2 - 6);
        bx.y = U.clamp(bx.y, bx.h / 2 + 6, sc.h - bx.h / 2 - 6);
        const top = bx.y - bx.h / 2;
        pillPx(ctx, bx.x, top + 10, bx.it.text, bx.it.bg, '#fff', bx.w);
        if (bx.role) pillPx(ctx, bx.x, top + 33, bx.role, bx.it.role === 'give' ? '#ff4d5e' : '#18a957', '#fff');
      }
      ctx.restore();
    }
    function pillPx(ctx, x, y, text, bg, fg, minW) {
      ctx.save(); ctx.font = '900 11px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = minW ? Math.max(minW * 0, ctx.measureText(text).width + 16) : ctx.measureText(text).width + 16, h = 21;
      ctx.fillStyle = bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
      ctx.fillStyle = fg; ctx.fillText(text, x, y + 1); ctx.restore();
    }
    // a fat course arrow from the bow; optional dashed "intention" arc (a boat about to head up / tack)
    function drawArrow(ctx, sc, b, L, col, tm, intentDeg) {
      const p = sc.worldToScreen(b.x, b.y), z = 1 / sc.mpp, f = U.vec(b.heading);
      const sp = Math.abs(b.speed || 0);
      const len = U.clamp(Math.max(L * 1.6, sp * 3.2) * z, 46, 170);
      const sx = p.x + f.x * L * 0.55 * z, sy = p.y + f.y * L * 0.55 * z;
      const ex = sx + f.x * len, ey = sy + f.y * len, nx = -f.y, ny = f.x, wob = 1 + 0.06 * Math.sin(tm * 5);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(13,19,33,0.45)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(sx + 2, sy + 3); ctx.lineTo(ex - f.x * 10 + 2, ey - f.y * 10 + 3); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex - f.x * 10, ey - f.y * 10); ctx.stroke();
      const hl = 18 * wob, hw = 12 * wob;
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(13,19,33,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex + f.x * 4, ey + f.y * 4); ctx.lineTo(ex - f.x * hl + nx * hw, ey - f.y * hl + ny * hw); ctx.lineTo(ex - f.x * hl - nx * hw, ey - f.y * hl - ny * hw); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (intentDeg != null) {
        const h1 = S.plan.F.hW(intentDeg), d = U.angDiff(b.heading, h1), R = len * 0.75;
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -tm * 20; ctx.strokeStyle = col; ctx.lineWidth = 4;
        const a0 = b.heading - Math.PI / 2, a1 = a0 + d;
        ctx.beginPath(); ctx.arc(p.x, p.y, R, a0, a1, d < 0); ctx.stroke(); ctx.setLineDash([]);
        const hx = p.x + Math.cos(a1) * R, hy = p.y + Math.sin(a1) * R, tx = -Math.sin(a1) * Math.sign(d), ty = Math.cos(a1) * Math.sign(d);
        ctx.beginPath(); ctx.moveTo(hx + tx * 12, hy + ty * 12); ctx.lineTo(hx - ty * 8, hy + tx * 8); ctx.lineTo(hx + ty * 8, hy - tx * 8); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // dotted courses to the meeting point and a pulsing "!" where they would collide
    function drawConflict(ctx, sc, items, tm) {
      const C = S.plan.F.toW(S.plan.C.x, S.plan.C.y), pc = sc.worldToScreen(C.x, C.y);
      ctx.save(); ctx.setLineDash([3, 9]); ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.lineDashOffset = -tm * 14;
      for (const it of items) {
        if (!it.n || !it.n.focus) { if (it.n) continue; }
        const p = sc.worldToScreen(it.b.x, it.b.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pc.x, pc.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      const k = 1 + 0.12 * Math.sin(tm * 7);
      ctx.fillStyle = 'rgba(255,77,94,0.25)'; ctx.beginPath(); ctx.arc(pc.x, pc.y, 26 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff4d5e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pc.x, pc.y, 15 * k, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '900 18px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', pc.x, pc.y + 1);
      ctx.restore();
    }
    // big wind arrow badge (screen space): top-right, under the HUD on narrow screens
    function drawWindBadge(ctx, sc, tm) {
      const W = sc.w, H = sc.h, hb = hud.el.getBoundingClientRect();
      const narrow = W < 640, land = H < 500 && W > H;
      const R = narrow ? 30 : 36;
      // landscape phones: top-left next to the pause button (the card owns the right side); phones: under the HUD
      const cx = land ? 74 + R : W - R - 16, cy = land ? R + 10 : narrow ? Math.max(hb.bottom + R + 12, R + 16) : R + 18;
      const dir = S.plan.F.windW;
      ctx.save(); ctx.translate(cx, cy);
      ctx.fillStyle = 'rgba(13,19,33,0.62)'; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(dir + Math.PI); // arrow points downwind (local −y forward)
      const L = R * 1.25, hw = R * 0.26;
      ctx.beginPath(); ctx.moveTo(0, -L / 2); ctx.lineTo(hw * 1.5, -L / 2 + hw * 1.9); ctx.lineTo(hw * 0.5, -L / 2 + hw * 1.6); ctx.lineTo(hw * 0.5, L / 2);
      ctx.lineTo(-hw * 0.5, L / 2); ctx.lineTo(-hw * 0.5, -L / 2 + hw * 1.6); ctx.lineTo(-hw * 1.5, -L / 2 + hw * 1.9); ctx.closePath();
      const g = ctx.createLinearGradient(0, L / 2, 0, -L / 2); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(73,198,242,0.95)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) { const q = (tm * 0.9 + i * 0.5) % 1, y = L / 2 - q * L * 0.9; ctx.globalAlpha = Math.sin(q * Math.PI); ctx.beginPath(); ctx.moveTo(-hw * 1.9, y); ctx.lineTo(-hw * 1.9, y - 7); ctx.moveTo(hw * 1.9, y + 4); ctx.lineTo(hw * 1.9, y - 3); ctx.stroke(); }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '900 9px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('rowschool.wind'), 0, R + 9);
      ctx.restore();
    }

    // ==================================================================== input: taps on boats, keys
    function onPointer(e) {
      if (S.phase !== 'ask') return;
      if (e.target.closest && e.target.closest('.rowschool-card, .kc, .hud, button, .coach')) return;
      const r = host.canvas.getBoundingClientRect();
      const w = scene.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      const v = S.view, f = v.focus();
      const dist = (b, L) => Math.max(0, Math.hypot(b.x - w.x, b.y - w.y) - L * 0.6);
      const tol = 26 * scene.mpp;
      const dm = dist(v.player, S.plan.Lp), df = dist(f.o, f.L);
      if (Math.min(dm, df) > tol + S.plan.Lp) return;
      answer(dm <= df ? 'me' : 'other');
    }
    function onKey(e) {
      if (host.isPaused && host.isPaused()) return;
      const k = e.key;
      if (S.phase === 'ask') {
        const m = { 1: 'me', 2: 'other', 3: 'both' }[k];
        if (m) { e.preventDefault(); answer(m); }
      } else if ((k === 'Enter' || k === ' ') && !e.repeat) {
        if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.rowschool-card')) return; // the button handles it
        if (S.phase === 'explain') { e.preventDefault(); startSail(); } else if (S.phase === 'fail') { e.preventDefault(); retry(); }
      } else if ((k === 'r' || k === 'R') && S.phase === 'explain') startReplay();
    }
    host.layer.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);

    // ==================================================================== instance
    let autopilot = false;
    function start() {
      loadScenario(0);
      scene.fixedZoom = 6; // start a bit zoomed out; framing() eases in
      if (activity.id === 'rowschool.r10') { S.introLen = 4.2; after(0.3, () => { if (!autopilot && S.phase === 'intro') S.welcome = coach(t('rowschool.coach.welcome'), 7000); }); }
    }
    function destroy() {
      host.layer.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      S.waits.length = 0;
      ctrl.detach(); hud.destroy(); scene.destroy();
      [cardEl, titleEl, roleEl, cdEl, flashEl].forEach(n => n.remove());
      host.layer.classList.remove('rowschool-sailing', 'rowschool-autotrim');
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function validate() {   // test hook: every scenario, autopilot run + hold-course run
      const out = [];
      for (const id of Object.keys(SC)) {
        const p = prepare(id, { assist, sailCls });
        const run = hold => {
          const sim = makeSim(p, { assist });
          let f = null, minGap = 99;
          while (sim.t < p.late && !f) { sim.step(KOS.DT, sim.autoControls(hold)); f = sim.check(); minGap = Math.min(minGap, sim.focus().gap); if (!f && sim.success()) break; }
          return { fail: f ? f.kind : null, ok: !f && sim.success(), t: +sim.t.toFixed(1), minGap: +minGap.toFixed(2) };
        };
        out.push({ id, rule: p.rule, ans: p.ans, want: SC[id].ans, mismatch: p.ansMismatch, dry: p.dryFail ? p.dryFail.kind : null, auto: run(false), hold: run(true), vp: +p.vp.toFixed(2) });
      }
      return out;
    }
    return {
      start, update, render(a) { scene.render(a); }, destroy,
      pause() { try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ } },
      resume() { S.ambT = 0; },
      onResize() { scene.resize(); },
      setAutopilot(on) { autopilot = !!on; },
      skipIntro() { if (S.phase === 'intro') S.pt = 99; },
      validate, state: S, scene, get sim() { return S.sim; },
      answer, startSail,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
