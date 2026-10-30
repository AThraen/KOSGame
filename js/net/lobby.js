// KØS SEJL — js/net/lobby.js  (LAZY: loaded together with mp.js when the "Live-kapsejlads" entry is opened)
// KOS.Lobby: the screens around a live race (docs/specs/live-race.md section 6.4 and 8). It is a normal app screen 'live'
// (KOS.App.registerScreen). Views: entry, setup (host), join, room (code, link, QR, players), starting, results, msg (the
// trainer talks: unavailable, closed, kicked ...), list ("Find et løb"), plan (schedule a race), mine (my scheduled races),
// wait (a scheduled race that is not open yet). No chat and no free text: names come from the profile, race titles are presets.
//   KOS.Lobby.open({join?: 'ABCD', status?})
//   KOS.Lobby.state            the current view model (read-only; used by tests)
// All strings are live.* keys in both languages (live.title / live.card.* / live.unavailable live in js/net/mpstatus.js).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const doc = root.document;
  const t = (k, v) => KOS.t(k, v);
  const lt = (a, n, v) => { try { if (KOS.Track) KOS.Track.event('Live', a, n, v); } catch (e) { /* analytics never breaks the game */ } };

  // ------------------------------------------------------------------ strings
  KOS.I18n.add('da', { live: {
    playAi: 'Sejl mod computeren', retry: 'Prøv igen', hostUnavailable: 'Kan ikke nå løbsserveren. Tjek at serveren kører.',
    closed: 'Der er travlt lige nu – prøv igen om lidt.', noCode: 'Den kode findes ikke. Tjek bogstaverne.', full: 'Løbet er fuldt.',
    started: 'Løbet er allerede startet.', kicked: 'Værten har fjernet dig fra løbet.', hostLeft: 'Værten har forladt løbet.',
    few: 'Der skal være flere sejlere for at starte.', reconnecting: 'Forbinder igen…',
    host: 'Vær vært', join: 'Deltag', code: 'Løbskode', start: 'Start løbet', kick: 'Fjern', leave: 'Forlad', share: 'Del link',
    copied: 'Link kopieret', startsIn: 'Starter om {n}', players: 'Sejlere', waitHost: 'Venter på værten…', go: 'Sejl!',
    guest: 'Sejler', ready: 'Klar', lost: 'Mistet forbindelsen', lostShort: 'Mistet', offlineNote: 'Forbindelsen er væk. Sejl bare videre – dit resultat bliver uofficielt.', backOnline: 'Du er online igen!', you: 'dig', hostTag: 'Vært',
    intro: 'Sejl et rigtigt løb mod dine kammerater – alle i samme båd-type, på samme tid.',
    hostIntro: 'Vælg båd og bane. Så får du en kode, som de andre taster ind.', joinIntro: 'Tast koden fra værten – eller scan QR-koden.',
    role: { sail: 'Vært + sejler', watch: 'Kun vært', sailHint: 'Du sejler selv med.', watchHint: 'Storskærm: overblik og stillingen.' },
    cfg: { boat: 'Båd', course: 'Bane', venue: 'Farvand', laps: 'Omgange', wind: 'Vind', windDir: 'Vindretning', gust: 'Vindstød', shift: 'Vindskift',
      start: 'Startsekvens', pen: 'Straffe', contact: 'Kontakt mellem både', help: 'Hjælp', maxP: 'Max sejlere', role: 'Din rolle', create: 'Opret løbet',
      wl: 'Op og ned', tri: 'Trekant', sound: 'Øresund', bay: 'Havnen', none: 'Ingen', some: 'Lidt', lots: 'Meget',
      s20: '20 sek.', s60: '1 min', s180: '3 min', on: 'Til', off: 'Fra', locked: 'Samme for alle', free: 'Frit valg',
      hard: 'Hårde', rain: 'Regn', rain0: 'Ingen', rain1: 'Let regn', rain2: 'Kraftig regn', finish: 'Målvindue', f60: '1 min', f180: '3 min', f300: '5 min', f0: 'Ingen grænse' },
    dinghyNote: 'I klubben sejler vi normalt ikke joller i så meget vind. Du kan godt vælge det, men det bliver vildt!',
    strongNote: 'Hård vind passer godt til J/70 og H-båd. De er stabile kølbåde.',
    aborted: 'Værten afbrød løbet. I er tilbage i lobbyen.',
    hm: { open: 'Vært', title: 'Værtsmenu', standings: 'Stillingen', endNow: 'Afslut løbet nu', abort: 'Afbryd løbet', lobbyAfter: 'Tilbage til lobbyen efter løbet', kick: 'Fjern', yes: 'Ja', no: 'Nej', close: 'Luk', sailing: 'Sejler',
      endAsk: 'Afslut løbet nu? Dem der ikke er i mål, får “Ikke i mål”.', abortAsk: 'Afbryd løbet? Alle kommer tilbage til lobbyen, og der er intet resultat.', kickAsk: 'Fjern {name} fra løbet?' },
    fin: { you: 'Du kom i mål som nr. {place} på {time}!', waitN: 'Venter på {n} sejlere…', wait1: 'Venter på 1 sejler…', window: 'Målvindue lukker om {t}', chip: 'Målvindue {t}', sailing: 'Stadig på vandet', allIn: 'Alle er i mål. Resultatet kommer…', sailors: 'Sejlerne' },
    dir: { N: 'N', NE: 'NØ', E: 'Ø', SE: 'SØ', S: 'S', SW: 'SV', W: 'V', NW: 'NV' },
    joinLink: 'Link', codeLabel: 'Kode (4 tegn)', joinGo: 'Deltag i løbet', yourName: 'Dit navn i løbet', waiting: 'Venter på sejlere…',
    scan: 'Scan med mobilen for at deltage', needBoats: 'Mindst {n} sejlere skal med.', connecting: 'Opretter forbindelse…',
    res: { title: 'Resultat', unofficial: 'Uofficielt resultat (forbindelsen røg)', wait: 'Venter på de andre…', place: 'Plads', dnf: 'Ikke i mål', done: 'Færdig',
      title1: 'Du vandt løbet!', title2: '2. plads – flot!', title3: '3. plads – på podiet!', titleN: '{place}. plads!',
      msg: 'Du kom i mål som nr. {place} af {of} på {time}.', dnfMsg: 'Du nåede ikke i mål denne gang.' },
    race: 'Løbet starter – sejladsen kommer i næste version.',
    rematch: 'Ny kapsejlads med samme deltagere', rematchWait: 'Venter på værten – hvis der kommer en ny kapsejlads, kommer du automatisk med.',
    watch: { start: 'Start', follow: 'Følg føreren', overview: 'Overblik', startsIn: 'Starter om', leader: 'Fører', finish: 'Mål', col: { pos: 'Nr.', sailor: 'Sejler', gap: 'Efter', kn: 'kn', mark: 'Næste', dist: 'Afst.', pen: 'Straf' } },
  } });
  KOS.I18n.add('en', { live: {
    playAi: 'Race the computer', retry: 'Try again', hostUnavailable: 'Cannot reach the race server. Check that the server is running.',
    closed: 'It is busy right now – try again in a little while.', noCode: 'That code does not exist. Check the letters.', full: 'The race is full.',
    started: 'The race has already started.', kicked: 'The host removed you from the race.', hostLeft: 'The host left the race.',
    few: 'More sailors are needed to start.', reconnecting: 'Reconnecting…',
    host: 'Host a race', join: 'Join', code: 'Race code', start: 'Start race', kick: 'Remove', leave: 'Leave', share: 'Share link',
    copied: 'Link copied', startsIn: 'Starting in {n}', players: 'Sailors', waitHost: 'Waiting for the host…', go: 'Go!',
    guest: 'Sailor', ready: 'Ready', lost: 'Lost connection', lostShort: 'Lost', offlineNote: 'The connection is gone. Keep sailing – your result will be unofficial.', backOnline: 'You are back online!', you: 'you', hostTag: 'Host',
    intro: 'Sail a real race against your friends – everyone in the same boat type, at the same time.',
    hostIntro: 'Pick the boat and the course. You get a code for the others to type in.', joinIntro: 'Type the code from the host – or scan the QR code.',
    role: { sail: 'Host + sail', watch: 'Host only', sailHint: 'You sail too.', watchHint: 'Big screen: overview and standings.' },
    cfg: { boat: 'Boat', course: 'Course', venue: 'Waters', laps: 'Laps', wind: 'Wind', windDir: 'Wind direction', gust: 'Gusts', shift: 'Wind shifts',
      start: 'Start sequence', pen: 'Penalties', contact: 'Contact between boats', help: 'Help', maxP: 'Max sailors', role: 'Your role', create: 'Create the race',
      wl: 'Up and down', tri: 'Triangle', sound: 'The Sound', bay: 'The harbour', none: 'None', some: 'A few', lots: 'Many',
      s20: '20 s', s60: '1 min', s180: '3 min', on: 'On', off: 'Off', locked: 'Same for all', free: 'Free choice',
      hard: 'Hard', rain: 'Rain', rain0: 'None', rain1: 'Light rain', rain2: 'Heavy rain', finish: 'Finish window', f60: '1 min', f180: '3 min', f300: '5 min', f0: 'No limit' },
    dinghyNote: 'At the club we normally do not sail dinghies in this much wind. You can still pick it, but it will be wild!',
    strongNote: 'Strong wind suits the J/70 and the H-boat well. They are steady keelboats.',
    aborted: 'The host stopped the race. You are back in the lobby.',
    hm: { open: 'Host', title: 'Host menu', standings: 'Standings', endNow: 'End the race now', abort: 'Abort the race', lobbyAfter: 'Back to the lobby after the race', kick: 'Remove', yes: 'Yes', no: 'No', close: 'Close', sailing: 'Sailing',
      endAsk: 'End the race now? Boats that have not finished get “Did not finish”.', abortAsk: 'Abort the race? Everybody goes back to the lobby and there is no result.', kickAsk: 'Remove {name} from the race?' },
    fin: { you: 'You finished {place} in {time}!', waitN: 'Waiting for {n} sailors…', wait1: 'Waiting for 1 sailor…', window: 'Finish window closes in {t}', chip: 'Finish window {t}', sailing: 'Still sailing', allIn: 'Everybody is in. The result is coming…', sailors: 'Sailors' },
    dir: { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SW', W: 'W', NW: 'NW' },
    joinLink: 'Link', codeLabel: 'Code (4 characters)', joinGo: 'Join the race', yourName: 'Your name in the race', waiting: 'Waiting for sailors…',
    scan: 'Scan with your phone to join', needBoats: 'At least {n} sailors are needed.', connecting: 'Connecting…',
    res: { title: 'Result', unofficial: 'Unofficial result (connection lost)', wait: 'Waiting for the others…', place: 'Place', dnf: 'Did not finish', done: 'Finished',
      title1: 'You won the race!', title2: '2nd place – great!', title3: '3rd place – on the podium!', titleN: 'Place {place}!',
      msg: 'You finished {place} of {of} in {time}.', dnfMsg: 'You did not finish this time.' },
    race: 'The race is starting – the sailing itself arrives in the next version.',
    rematch: 'New race with the same sailors', rematchWait: 'Waiting for the host – if there is a new race you join automatically.',
    watch: { start: 'Start', follow: 'Follow the leader', overview: 'Overview', startsIn: 'Starting in', leader: 'Leader', finish: 'Finish', col: { pos: 'No.', sailor: 'Sailor', gap: 'Gap', kn: 'kn', mark: 'Next', dist: 'Dist.', pen: 'Pen.' } },
  } });

  // version gate and rejoin (live6)
  KOS.I18n.add('da', { live: {
    old: { msg: 'Der er kommet en ny version af spillet – opdater for at være med', btn: 'Opdater nu', working: 'Henter den nye version…',
      none: 'Jeg kan ikke finde en nyere version lige nu. Luk spillet helt og åbn det igen – så prøver vi en gang til.' },
    ver: 'Version', verDiff: 'Anden version end din – det kan give problemer', verUnknown: 'ukendt',
    rejoinGone: 'Løbet er slut – vi kunne ikke hente resultatet.',
    rejoinClosed: 'Løbet blev lukket, mens du var væk.', rejoinDropped: 'Du var væk for længe, så løbet er startet uden dig. Næste gang er du med!',
    resOver: 'Løbet er slut. Sådan gik det:', seatHere: 'Du er stadig med i løbet {code}',
  } });
  // reconnect and resume (live-rules spec E): never lose a racer
  KOS.I18n.add('da', { live: {
    stillTrying: 'Forbindelsen er væk – vi prøver stadig', tryNow: 'Prøv nu', replaced: 'Løbet er åbent i et andet vindue.',
    stillTryingShort: 'Ingen forbindelse – prøver igen', reconnectingShort: 'Forbinder igen…', replacedShort: 'Åbent i et andet vindue', rejoinGoneShort: 'Løbet er slut',
    resTitle: 'Resultatet af løbet {code}', detachNote: 'Løbet fortsætter. Du kan komme tilbage fra forsiden eller Live-kapsejlads.',
    retire: { btn: 'Udgå af løbet', title: 'Udgå af løbet?', body: 'Så er du ude af løbet og får ikke en placering. Det kan ikke fortrydes.', stay: 'Bliv i løbet', yes: 'Udgå' },
  } });
  KOS.I18n.add('en', { live: {
    stillTrying: 'Connection lost – still trying', tryNow: 'Try now', replaced: 'The race is open in another window.',
    stillTryingShort: 'No connection – retrying', reconnectingShort: 'Reconnecting…', replacedShort: 'Open in another window', rejoinGoneShort: 'The race is over',
    resTitle: 'Result of race {code}', detachNote: 'The race goes on. You can come back from the start screen or Live race.',
    retire: { btn: 'Retire from the race', title: 'Retire from the race?', body: 'You leave the race and get no place. This cannot be undone.', stay: 'Stay in the race', yes: 'Retire' },
  } });
  KOS.I18n.add('en', { live: {
    old: { msg: 'A new version of the game is out – update to join', btn: 'Update now', working: 'Getting the new version…',
      none: 'I cannot find a newer version right now. Close the game completely and open it again – then we try once more.' },
    ver: 'Version', verDiff: 'A different version than yours – this can cause trouble', verUnknown: 'unknown',
    rejoinGone: 'The race is over – we could not get the result.',
    rejoinClosed: 'The race was closed while you were away.', rejoinDropped: 'You were away too long, so the race started without you. Next time you are in!',
    resOver: 'The race is over. This is how it went:', seatHere: 'You are still in race {code}',
  } });

  // the open race list and scheduled races (live-rules spec B/C). Titles are fixed presets: no free text anywhere.
  KOS.I18n.add('da', { live: {
    startEarly: 'Start løbet nu', auto: 'Løbet starter af sig selv {when}, når mindst 2 sejlere er med.', autoIn: 'Starter om {t}', waitMore: 'Venter på flere sejlere…',
    cancelHost: 'Løbet er aflyst.', cancelFew: 'Der kom ikke nok sejlere, så løbet er aflyst. Prøv igen en anden dag!',
    titles: { train: 'Træningsløb', friday: 'Fredagsræs', club: 'Klubmesterskab', xmas: 'Juleræs', weekend: 'Weekendræs' },
    when: { today: 'i dag kl. {time}', tomorrow: 'i morgen kl. {time}', day: '{day} kl. {time}', at: 'kl. {time}' },
    dur: { h: '{h} timer {m} min', h1: '1 time {m} min', d: '{d} dage' },
    vis: { label: 'Hvem kan være med', private: 'Kun med kode', open: 'Alle (på listen)', privateHint: 'Kun dem, der får koden, linket eller QR-koden.', openHint: 'Alle kan se dit navn og være med – løbet står under “Find et løb”.' },
    list: { title: 'Find et løb', intro: 'Tryk på et løb for at være med.', sched: 'Planlagte løb', open: 'Åbne løb', loading: 'Henter løb…', refresh: 'Opdater',
      empty: 'Ingen åbne løb lige nu – start dit eget eller planlæg et.', err: 'Jeg kan ikke hente listen lige nu. Prøv igen om lidt.',
      lobby: 'I lobbyen', startsIn: 'Starter om {t}', now: 'Starter nu', planned: 'Planlagt {when}', full: 'Fuldt', by: 'Vært: {name}', sailors: '{n}/{max} sejlere',
      hostRace: '{name}s løb', hostRaceS: '{name}’ løb', more: 'Vis flere ({n})' },
    plan: { btn: 'Planlæg til senere', title: 'Planlæg et løb', intro: 'Vælg navn, dag og tidspunkt. Løbet åbner 15 minutter før start, og serveren starter det selv, når mindst 2 sejlere er med.',
      name: 'Navn', day: 'Dag', time: 'Tidspunkt', go: 'Planlæg løbet', opens: 'Åbner kl. {time}',
      noTime: 'Vælg både dag og tidspunkt.', tooSoon: 'Vælg et tidspunkt mindst 10 minutter fra nu.', tooLate: 'Du kan højst planlægge 14 dage frem.',
      badtime: 'Det tidspunkt kan ikke bruges – vælg et andet.', limit: 'Du har planlagt 3 løb i dag. Det er max.', full: 'Der er planlagt rigtig mange løb lige nu – prøv igen senere.',
      done: '{title} er planlagt {when}.', more: 'Flere valg', less: 'Færre valg' },
    mine: { btn: 'Mine planlagte løb', btnN: 'Mine planlagte løb ({n})', title: 'Mine planlagte løb', intro: 'Del koden, linket eller QR-koden med dine sejlere. Når løbet er åbnet, kan du gå ind og starte det.',
      empty: 'Du har ingen planlagte løb lige nu.', opens: 'Åbner {when}', isOpen: 'Løbet er åbent nu!', go: 'Gå til løbet', qr: 'QR-kode', cancel: 'Aflys',
      cancelAsk: 'Aflys {title} {when}?', cancelled: 'Løbet er aflyst.', cantCancel: 'Løbet er i gang og kan ikke aflyses nu.' },
    wait: { msg: 'Åbner {opens} · starter {start}.', left: 'Åbner om {t}', leftDay: 'Åbner {when}', soon: 'Åbner nu…', remind: 'Påmind mig', check: 'Tjek om løbet er åbent',
      auto: 'Siden går selv ind i løbet, når det åbner.' },
    ics: { desc: 'Live-kapsejlads i KØS SEJL. Kode: {code}. Løbet åbner 15 minutter før start: {link}' },
  } });
  KOS.I18n.add('en', { live: {
    startEarly: 'Start the race now', auto: 'The race starts by itself {when} when at least 2 sailors are in.', autoIn: 'Starting in {t}', waitMore: 'Waiting for more sailors…',
    cancelHost: 'The race was cancelled.', cancelFew: 'Not enough sailors came, so the race is cancelled. Try again another day!',
    titles: { train: 'Training race', friday: 'Friday race', club: 'Club championship', xmas: 'Christmas race', weekend: 'Weekend race' },
    when: { today: 'today at {time}', tomorrow: 'tomorrow at {time}', day: '{day} at {time}', at: 'at {time}' },
    dur: { h: '{h} hours {m} min', h1: '1 hour {m} min', d: '{d} days' },
    vis: { label: 'Who can join', private: 'Code only', open: 'Everyone (listed)', privateHint: 'Only those who get the code, the link or the QR code.', openHint: 'Everyone can see your name and join – the race is shown under “Find a race”.' },
    list: { title: 'Find a race', intro: 'Tap a race to join it.', sched: 'Scheduled races', open: 'Open races', loading: 'Getting races…', refresh: 'Refresh',
      empty: 'No open races right now – start your own or schedule one.', err: 'I cannot get the list right now. Try again in a little while.',
      lobby: 'In the lobby', startsIn: 'Starting in {t}', now: 'Starting now', planned: 'Scheduled {when}', full: 'Full', by: 'Host: {name}', sailors: '{n}/{max} sailors',
      hostRace: '{name}’s race', hostRaceS: '{name}’ race', more: 'Show more ({n})' },
    plan: { btn: 'Schedule for later', title: 'Schedule a race', intro: 'Pick a name, a day and a time. The race opens 15 minutes before the start, and the server starts it by itself when at least 2 sailors are in.',
      name: 'Name', day: 'Day', time: 'Time', go: 'Schedule the race', opens: 'Opens at {time}',
      noTime: 'Pick both a day and a time.', tooSoon: 'Pick a time at least 10 minutes from now.', tooLate: 'You can schedule at most 14 days ahead.',
      badtime: 'That time cannot be used – pick another one.', limit: 'You have scheduled 3 races today. That is the maximum.', full: 'A lot of races are scheduled right now – try again later.',
      done: '{title} is scheduled {when}.', more: 'More options', less: 'Fewer options' },
    mine: { btn: 'My scheduled races', btnN: 'My scheduled races ({n})', title: 'My scheduled races', intro: 'Share the code, the link or the QR code with your sailors. When the race has opened you can go in and start it.',
      empty: 'You have no scheduled races right now.', opens: 'Opens {when}', isOpen: 'The race is open now!', go: 'Go to the race', qr: 'QR code', cancel: 'Cancel',
      cancelAsk: 'Cancel {title} {when}?', cancelled: 'The race is cancelled.', cantCancel: 'The race is on and cannot be cancelled now.' },
    wait: { msg: 'Opens {opens} · starts {start}.', left: 'Opens in {t}', leftDay: 'Opens {when}', soon: 'Opening now…', remind: 'Remind me', check: 'Check if the race is open',
      auto: 'This page joins by itself when the race opens.' },
    ics: { desc: 'Live race in KØS SEJL. Code: {code}. The race opens 15 minutes before the start: {link}' },
  } });

  // ------------------------------------------------------------------ state
  const DIRS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  const L = {
    view: 'entry', hostRole: 'sail', cfg: null, sess: null, room: null, code: '', msgKey: null, msgText: '', msgActions: [],
    busy: '', status: null, offs: [], timers: [], handoff: false, results: null, via: 'code',
    list: null, plan: null, wait: null, mineQr: '', planFrom: 'setup', waitFrom: '', tickT: 0,
  };
  const app = () => KOS.App;
  const kit = () => KOS.App.kit;
  const esc = s => KOS.UI.esc(s);
  const secEl = () => doc.getElementById('screen-live');

  function defaultCfg() {
    const boats = boatsList();
    const fav = KOS.Storage && KOS.Storage.get ? KOS.Storage.get('boat', 'opti') : 'opti';
    return { boat: boats.indexOf(fav) >= 0 ? fav : boats[0] || 'opti', venue: 'sound', course: 'wl', laps: 2, windDeg: 225, windKn: 10,
      gust: 0.4, shift: 0.4, maxP: 8, countdownS: 60, pen: true, contact: true, help: 'free', rain: 0, finishS: 180, vis: 'private' };
  }
  function boatsList() { try { const l = app().liveBoats(); return l && l.length ? l : ['opti']; } catch (e) { return ['opti']; } }
  function myName() {
    const p = KOS.Storage && KOS.Storage.profile ? KOS.Storage.profile() : null;
    const n = String((p && p.name) || '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, 16);
    return n || t('live.guest');
  }
  function reset() {
    L.offs.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
    L.offs = [];
    L.timers.forEach(clearInterval); L.timers = [];
    if (L.sess && (!L.handoff || L.sess.phase === 'results')) { try { L.sess.leave(); } catch (e) { /* ignore */ } }
    L.sess = null; L.room = null; L.busy = ''; L.results = null; L.resCode = ''; L.resLate = false; L.handoff = false;
    L.rj = null; clearTimeout(L.rjT);
    stopTick();
  }
  function paint() { const sec = secEl(); if (sec && app().cur === 'live') { render(sec); if (KOS.I18n) KOS.I18n.apply(sec); } }
  function setView(v) { L.view = v; paint(); if (KOS.Nav) KOS.Nav.sync(); } // KOS.Nav: a lobby sub view is one back step
  // one 1 s ticker for the clocks on screen (list, wait, scheduled room): runs only while one of those views is shown
  const TICK_VIEWS = ['list', 'wait', 'room'];
  function stopTick() { if (L.tickT) { clearInterval(L.tickT); L.tickT = 0; } }
  function ensureTick() {
    if (L.tickT) return;
    L.tickT = setInterval(() => {
      if (app().cur !== 'live' || TICK_VIEWS.indexOf(L.view) < 0) { stopTick(); return; }
      onTick();
    }, 1000);
  }

  // ------------------------------------------------------------------ messages (the trainer talks)
  function trainerMsg(text, actions) {
    L.msgText = text; L.msgActions = actions || [];
    setView('msg');
  }
  function aiRace() {
    const A = KOS.Activities;
    const list = A ? A.byArea('race').filter(a => !a.pickHidden && !a.liveRace && A.isUnlocked(a.id)) : [];
    if (list.length) app().play(list[0].id); else app().show('area', { area: 'race' });
  }
  function unavailable(hostOnly) {
    lt('unavailable', 'server');
    trainerMsg(t(hostOnly ? 'live.hostUnavailable' : 'live.unavailable'), ['retry', 'ai']);
  }
  function errText(code, msg) {
    if (code === 'closed' || code === 'busy') return msg || (L.status && L.status.message) || t('live.closed');
    if (code === 'nocode') return t('live.noCode');
    if (code === 'full') return t('live.full');
    if (code === 'started') return t('live.started');
    if (code === 'few') return t('live.few');
    if (code === 'badtime') return t('live.plan.badtime');
    if (code === 'schedlimit') return t('live.plan.limit');
    if (code === 'schedfull') return t('live.plan.full');
    return t('live.unavailable');
  }

  // the server (or the public status file) says this build is too old: the trainer asks kindly, the button updates and carries on
  function showOld(intent) {
    L.busy = ''; L.oldIntent = intent || {};
    lt('old', (KOS.BUILD && KOS.BUILD.version) || '');
    trainerMsg(t('live.old.msg'), ['update', 'ai']);
  }
  function handleOld(e, intent) {
    if (!e || e.code !== 'old') return false;
    try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
    showOld(intent);
    return true;
  }
  function doUpdate() {
    const A = app(), M = KOS.MPStatus, it = L.oldIntent || {};
    const keep = () => { try { M.keepIntent(it.join ? { join: it.join } : {}); } catch (e) { /* ignore */ } };
    try { KOS.UI.toast(t('live.old.working'), { kind: 'info' }); } catch (e) { /* optional */ }
    if (!A.checkUpdate) { root.location.reload(); return; }
    A.checkUpdate({ force: true, ms: 12000, keep }).then(reloading => {
      if (!reloading) trainerMsg(t('live.old.none'), ['update', 'ai']);
    });
  }

  // ------------------------------------------------------------------ flows
  function connectNow() {
    const M = KOS.MPStatus;
    const B = KOS.BUILD || {};
    return KOS.MP.connect({ url: M.resolve().wsUrl, name: myName(), timeoutMs: 7000, build: B.version || 'web', ver: B.version || 'dev', sha: B.sha || '' });
  }
  function wire(sess) {
    L.sess = sess;
    const on = (e, fn) => L.offs.push(sess.on(e, fn));
    on('room', room => { L.room = room; if (L.view === 'room') paint(); });
    on('start', () => {
      L.room = sess.room || L.room;
      if (sess.role === 'host' && sess.cfg) { // host side only, once per race: what was sailed (no names, no codes)
        const c = sess.cfg, rm = L.room || sess.room || {}, n = (rm.players || []).length;
        const U = KOS.U, wMs = U && U.ms ? U.ms(c.windKn) : c.windKn * 0.5144;
        const band = wMs < 4 ? '0-4' : wMs < 8 ? '4-8' : wMs <= 11 ? '8-11' : '11+';
        const gust = c.gust >= 1 ? 3 : c.gust >= 0.8 ? 2 : c.gust >= 0.4 ? 1 : 0;
        lt('start', c.boat + ' ' + c.course + ' ' + c.laps + 'L', n);
        lt('conditions', band + (c.rain ? ' rain' : '') + ' gust' + gust);
      }
      launchRace(sess);
    });
    on('res', rows => {
      L.results = rows; L.resCode = sess.code || L.resCode || '';
      if (app().cur === 'live') setView('results'); // while racing, race.js shows the result itself
      else { const me = sess; L.timers.push(setTimeout(() => { if (L.sess === me && me.phase === 'results') { reset(); } }, 190000)); } // the server drops the room after 3 min: do not keep a socket on a dead room
    });
    on('rematch', (room, aborted) => { // the host went again with the same people: everybody lands in the lobby of the same room
      L.room = room; L.results = null; L.resLate = false; L.handoff = false; L.view = 'room';
      if (aborted) { try { KOS.UI.toast(t('live.aborted'), { kind: 'info' }); } catch (e) { /* optional */ } }
      const cur = app().cur;
      if (cur === 'live') paint(); else if (cur === 'play' || cur === 'results') app().show('live', {}, { replace: true }); else reset();
    });
    on('hostleft', () => { const s = L.sess; L.sess = null; try { s.close(); } catch (e) { /* ignore */ } trainerMsg(t('live.hostLeft'), ['back']); leaveRaceScreen(); });
    on('schedcancelled', e => { const s = L.sess; L.sess = null; try { s.close(); } catch (x) { /* ignore */ } trainerMsg(t(e && e.why === 'host' ? 'live.cancelHost' : 'live.cancelFew'), ['back']); leaveRaceScreen(); });
    on('kicked', () => { const s = L.sess; L.sess = null; try { s.close(); } catch (e) { /* ignore */ } trainerMsg(t('live.kicked'), ['back']); leaveRaceScreen(); });
    on('offline', () => { if (L.view === 'room' || L.view === 'starting') { if (!L.handoff) lt('unavailable', 'offline'); trainerMsg(t('live.unavailable'), ['retry', 'ai']); } });
    // spec E1: a lost seat is retried for as long as it exists; after 15 s the banner says so and offers "Prøv nu"
    on('reconnecting', syncBanner); on('away', syncBanner); on('reconnected', syncBanner);
    on('gone', e => { const s = L.sess; L.sess = null; try { s.close(); } catch (x) { /* ignore */ } if (app().cur === 'live') showGone(s && s.code, e && e.rows, e && e.why); });
    on('replaced', () => { L.sess = null; if (app().cur === 'live') trainerMsg(t('live.replaced'), ['back']); });
    on('detached', () => { if (L.sess === sess) { L.sess = null; reset(); } }); // the race screen was left: the seat stays, the title/hub banner leads back
    on('error', e => { if (e && e.code === 'few') KOS.UI.toast(t('live.few'), { kind: 'warn' }); });
  }
  // the reconnect banner over the lobby: "Forbinder igen…", after 15 s "Forbindelsen er væk – vi prøver stadig" + "Prøv nu"
  function bannerHtml() {
    const s = L.sess, on = !!(s && s.state === 'reconnecting');
    const k = on && s.away ? 'live.stillTrying' : 'live.reconnecting';
    return '<div class="live-banner' + (on && s.away ? ' is-away' : '') + '" role="status"' + (on ? '' : ' hidden') + '><span class="nb-long">' + esc(t(k)) + '</span><span class="nb-short">' + esc(t(k + 'Short')) + '</span>' +
      (on && s.away ? '<button type="button" class="btn btn-sm btn-primary" data-act="trynow">' + esc(t('live.tryNow')) + '</button>' : '') + '</div>';
  }
  function syncBanner() {
    const el = secEl() && secEl().querySelector('.live-banner');
    if (!el) return;
    el.outerHTML = bannerHtml(); // its "Prøv nu" is a data-act button: the screen's click delegation handles it
  }
  // the seat is gone (spec E4): the race ended while this phone was away (the official table if the server or this phone still has it,
  // else a kind word), the lobby was closed meanwhile, or the race started without this seat. Never "the race is over" when it is not.
  function showGone(code, rows, why) {
    try { KOS.MP.clearSeat(); } catch (x) { /* ignore */ }
    if (why === 'closed' || why === 'dropped' || why === 'full') { trainerMsg(t(why === 'full' ? 'live.full' : why === 'closed' ? 'live.rejoinClosed' : 'live.rejoinDropped'), ['back']); return; }
    const lr = !rows && code && KOS.MP.lastResult ? KOS.MP.lastResult(code) : null;
    rows = rows || (lr && lr.rows) || null;
    if (rows && rows.length) { L.results = rows; L.resCode = code || ''; L.resLate = true; setView('results'); return; }
    trainerMsg(t('live.rejoinGone'), ['back']);
  }
  // the seat this phone holds (kos.mp.seat / this tab's token), if any: the entry view offers it, and its code is resumed, not joined
  function heldSeat() {
    try { const s = KOS.MP.seat && KOS.MP.seat(); if (s) return s; const tk = KOS.MP.savedToken && KOS.MP.savedToken(); return tk && tk.code ? { code: tk.code, phase: '' } : null; } catch (e) { return null; }
  }
  // role: re-read the status first (spec 7), then connect with a 4 s timeout
  function guard() {
    return KOS.MPStatus.refresh({ force: true }).then(st => {
      L.status = st;
      if (st.mode === 'hidden') { unavailable(L.hostRole === 'watch' && L.view === 'setup'); return false; }
      if (KOS.MPStatus.tooOld(st)) { showOld(L.intent); return false; }
      return true;
    });
  }
  function doCreate() {
    L.busy = t('live.connecting'); L.intent = {}; paint();
    guard().then(ok => {
      if (!ok) return;
      return connectNow().then(sess => {
        wire(sess);
        return sess.create(Object.assign({}, L.cfg), L.hostRole).then(room => { L.room = room; L.busy = ''; lt('host', L.hostRole === 'watch' ? 'host-only' : 'host+sail'); setView('room'); });
      });
    }).catch(e => {
      L.busy = '';
      if (handleOld(e, {})) return;
      const code = e && e.code;
      try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
      if (code === 'closed' || code === 'busy') { lt('unavailable', 'closed'); trainerMsg(errText(code, L.sess && L.sess.status.msg), ['retry', 'ai']); return; }
      unavailable(L.hostRole === 'watch');
    });
  }
  function doJoin(raw, secret) {
    const code = KOS.MP.normCode(raw);
    if (!code) { L.joinErr = t('live.noCode'); paint(); return; }
    const held = heldSeat();
    if (held && held.code === code && !L.sess) { L.rejoin = true; autoRejoin(code); return; } // our own seat (typed again, or tapped in the list): resume it
    if (secret === undefined) { const mine = mySched().find(e => e.code === code); secret = mine ? mine.secret : ''; } // my own scheduled race: I take the host seat
    L.code = code; L.busy = t('live.connecting'); L.joinErr = ''; L.intent = { join: code }; paint();
    guard().then(ok => {
      if (!ok) return;
      return connectNow().then(sess => {
        wire(sess);
        return sess.join(code, secret).then(room => { L.room = room; L.busy = ''; lt('join', L.via || 'code'); setView('room'); });
      });
    }).catch(e => {
      L.busy = '';
      if (handleOld(e, { join: code })) return;
      const code2 = e && e.code;
      try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
      if (code2 === 'notopen') { showWait(code, e); return; }
      if (code2 === 'bad' && secret) { doJoin(code, ''); return; } // my scheduled race, but its host seat is taken (my other phone): join as a sailor
      if (code2 === 'closed' || code2 === 'busy') lt('unavailable', 'closed');
      if (code2 === 'nocode' || code2 === 'full' || code2 === 'started' || code2 === 'closed' || code2 === 'busy') { L.joinErr = errText(code2); setView('join'); return; }
      unavailable(false);
    });
  }
  // after a reload (update, refresh), or "Fortsæt live-løbet" on the title/hub: resume the same seat (any phase) or join the room again
  // (lobby), no taps needed. A seat of our own is never given up while it may live (spec E1): no network = "vi prøver stadig" + retries.
  function autoRejoin(code) {
    L.code = code; L.busy = t('live.connecting'); L.joinErr = ''; L.view = L.rj ? L.view : 'join'; L.intent = { join: code };
    const tok = KOS.MP.savedToken && KOS.MP.savedToken();
    const mine = !!(tok && tok.code === code);
    (mine ? guardSeat() : guard()).then(ok => {
      if (!ok) return;
      return connectNow().then(sess => {
        wire(sess);
        const joined = room => {
          L.room = room; L.busy = ''; L.rejoin = false; L.rj = null;
          if ((sess.phase === 'countdown' || sess.phase === 'racing') && sess.grid) launchRace(sess); // else the 'start' that follows launches it
          else if (sess.phase !== 'results') setView('room'); // results: the 'res' that follows shows the official table
          else L.resLate = true;
        };
        if (!mine) return sess.join(code).then(joined);
        // nocode + rows: the race ended while we were away, here is its table. A bare nocode, or the room's lobby still alive (a rematch
        // or a long drop left the seat behind, a restart): try a plain join; if that fails too, say why (over / closed / started without us)
        const wasLobby = (((KOS.MP.seat && KOS.MP.seat()) || {}).phase || 'lobby') === 'lobby';
        return sess.resume(tok).then(joined, e => {
          if (e && e.code === 'nocode' && e.rows && e.alive !== 'lobby') throw e;
          if (e && e.code === 'nocode' && (e.alive === 'countdown' || e.alive === 'racing')) throw { code: 'nocode', gone: true, why: 'dropped' };
          return sess.join(code).then(joined, e2 => {
            if (e && e.rows) throw e;
            throw e2 && (e2.code === 'nocode' || e2.code === 'started') ? { code: e2.code, gone: true, why: e2.code === 'started' ? 'dropped' : wasLobby ? 'closed' : 'over' } : e2;
          });
        });
      });
    }).catch(e => {
      L.busy = '';
      if (handleOld(e, { join: code })) return;
      const c2 = e && e.code;
      try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
      if (c2 === 'notopen') { L.rj = null; showWait(code, e); return; }
      if (mine && (c2 === 'unreachable' || c2 === 'timeout' || c2 === 'closed' || c2 === 'busy' || c2 === 'bad')) { rejoinWait(code); return; }
      L.rj = null;
      if (mine && e && (e.rows || e.gone)) { L.rejoin = false; showGone(code, e.rows, e.rows ? 'over' : e.why); return; }
      if (L.rejoin && (c2 === 'nocode' || c2 === 'started' || c2 === 'full')) { L.rejoin = false; showGone(code); return; }
      if (c2 === 'nocode' || c2 === 'full' || c2 === 'started' || c2 === 'closed' || c2 === 'busy') { L.joinErr = errText(c2); setView('join'); return; }
      unavailable(false);
    });
  }
  // our own seat: only a too-old build stops the resume (the status file may be unreachable offline; the server is the judge)
  function guardSeat() {
    return KOS.MPStatus.refresh({ force: true }).then(st => {
      L.status = st;
      if (st.mode !== 'hidden' && KOS.MPStatus.tooOld(st)) { showOld(L.intent); return false; }
      return true;
    });
  }
  // no way to the server right now: say so kindly and keep trying (0.5, 1, 2, 5, 10 s, then every 10 s; "Prøv nu" and coming back online
  // try at once)
  const RJ_BACKOFF = [500, 1000, 2000, 5000, 10000];
  function rejoinWait(code) {
    const n = L.rj && L.rj.code === code ? L.rj.n + 1 : 0;
    L.rj = { code, n };
    if (L.view !== 'msg' || L.msgText !== t('live.stillTrying')) trainerMsg(t('live.stillTrying'), ['trynow', 'back']);
    clearTimeout(L.rjT);
    L.rjT = setTimeout(() => { if (L.rj && L.rj.code === code && app().cur === 'live') autoRejoin(code); }, RJ_BACKOFF[Math.min(n, RJ_BACKOFF.length - 1)] * (0.8 + 0.4 * Math.random()));
  }
  function rejoinNow() {
    if (!L.rj || L.busy) return;
    clearTimeout(L.rjT); L.rj.n = -1; autoRejoin(L.rj.code);
  }
  try { root.addEventListener('online', () => { if (L.rj && app().cur === 'live') rejoinNow(); }); } catch (e) { /* no window */ }
  // the gun is T0 on the shared clock: build the race now (race.js waits for it); the session is handed over to the race
  function launchRace(sess) {
    L.handoff = true;
    let ok = false;
    try { ok = app().play('race.live', { force: true, live: KOS.MP.liveFacade(sess) }); } catch (e) { ok = false; }
    if (!ok) { L.handoff = false; startCountdown(); }
  }
  function leaveRaceScreen() { if (app().cur === 'play' || app().cur === 'results') { L.handoff = false; app().show('live', {}, { replace: true }); } }
  function startCountdown() {
    L.view = 'starting'; paint();
    const tick = () => {
      const el = secEl() && secEl().querySelector('#live-count');
      if (!el || !L.sess) return;
      const n = Math.ceil((L.sess.T0 - L.sess.serverNow()) / 1000);
      el.textContent = n > 0 ? t('live.startsIn', { n }) : t('live.go');
      el.setAttribute('data-n', String(Math.max(0, n)));
    };
    tick();
    L.timers.push(setInterval(tick, 250));
  }

  // ------------------------------------------------------------------ views
  const chip = (act, k, v, label, on, icon) => '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + (icon || '') + esc(label) + '</button>';
  // tiny course diagrams on the course chips: up-and-down = two marks on a line, triangle = three marks (wind comes from the top)
  const COURSE_ICO = {
    wl: '<svg class="live-cico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5L10 8V15" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2" fill="none"/><path d="M4 21H20" stroke="#49c6f2" stroke-width="1.8"/><circle cx="14" cy="4.5" r="2" fill="#ff7a1a"/><circle cx="9.5" cy="7.5" r="1.5" fill="#e8323c"/><circle cx="8" cy="16" r="1.8" fill="#ff7a1a"/><circle cx="16" cy="16" r="1.8" fill="#ff7a1a"/></svg>',
    tri: '<svg class="live-cico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 9L5 13L14 17" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2" fill="none"/><path d="M8 2H20" stroke="#49c6f2" stroke-width="1.8"/><circle cx="15" cy="9" r="2" fill="#ff7a1a"/><circle cx="5" cy="13" r="2" fill="#ff7a1a"/><circle cx="10" cy="18.5" r="1.8" fill="#ff7a1a"/><circle cx="18" cy="18.5" r="1.8" fill="#ff7a1a"/><path d="M4 22H20" stroke="#ffd25e" stroke-width="1.2"/></svg>',
  };
  const row = (label, body) => '<div class="live-row"><div class="live-label">' + esc(label) + '</div><div class="live-chips">' + body + '</div></div>';
  function trainerHtml(text) {
    const UI = KOS.UI;
    return '<div class="live-trainer glass"><div class="live-trainer-av">' + UI.coachSvg('happy', 'jesper') + '</div>' +
      '<div class="live-trainer-bubble"><div class="coach-name">' + esc(UI.coachName('jesper')) + '</div><p class="live-trainer-text">' + esc(text) + '</p></div></div>';
  }
  function head(title) { return kit().header(title, ''); }
  function shell(title, body) {
    return head(title) + '<div class="scroll"><div class="live-wrap">' + body + '</div></div>';
  }
  function linkFor(code) {
    const l = root.location;
    return l.origin + l.pathname + '#join=' + code;
  }

  function viewEntry() {
    const closed = L.status && L.status.mode === 'closed', mineN = mySched().length, held = heldSeat();
    // a seat this phone still holds (e.g. after "Til kortet"): the way back comes first, before host / join / find
    const back = held ? '<button type="button" class="btn btn-primary btn-big live-seatgo" data-act="resumeseat" data-code="' + esc(held.code) + '">' + kit().ico('play') +
      '<span>' + esc(t('live.seat.go')) + '<small>' + esc(t('live.seatHere', { code: held.code })) + '</small></span></button>' : '';
    return shell(t('live.title'),
      (closed ? trainerHtml(L.status.message || t('live.closed')) : '<p class="live-intro">' + esc(t('live.intro')) + '</p>') +
      '<div class="live-big-btns">' + back +
      '<button type="button" class="btn ' + (held ? 'btn-glass' : 'btn-primary') + ' btn-big" data-act="host"' + (closed ? ' disabled' : '') + '>' + kit().ico('flag') + '<span>' + esc(t('live.host')) + '</span></button>' +
      '<button type="button" class="btn btn-glass btn-big" data-act="joinview"' + (closed ? ' disabled' : '') + '>' + kit().ico('user') + '<span>' + esc(t('live.join')) + '</span></button>' +
      (canPlan() ? '<button type="button" class="btn btn-glass btn-big" data-act="listview">' + kit().ico('map') + '<span>' + esc(t('live.list.title')) + '</span></button>' : '') +
      '</div>' + (closed ? '<button type="button" class="btn btn-glass" data-act="recheck">' + esc(t('live.retry')) + '</button>' : '') +
      (mineN ? '<div class="live-actions"><button type="button" class="btn btn-glass" data-act="mineview">' + kit().ico('calendar') + '<span>' + esc(t('live.mine.btnN', { n: mineN })) + '</span></button></div>' : ''));
  }
  function viewMsg() {
    const btn = { retry: '<button type="button" class="btn btn-primary" data-act="retry">' + esc(t('live.retry')) + '</button>',
      ai: '<button type="button" class="btn btn-glass" data-act="ai">' + kit().ico('sail') + esc(t('live.playAi')) + '</button>',
      update: '<button type="button" class="btn btn-primary" data-act="update">' + kit().ico('sparkle') + '<span>' + esc(t('live.old.btn')) + '</span></button>',
      back: '<button type="button" class="btn btn-primary" data-act="entry">' + esc(t('common.ok')) + '</button>',
      trynow: '<button type="button" class="btn btn-primary" data-act="trynow">' + kit().ico('retry') + '<span>' + esc(t('live.tryNow')) + '</span></button>' };
    return shell(t('live.title'), trainerHtml(L.msgText) + '<div class="live-actions">' + L.msgActions.map(a => btn[a] || '').join('') + '</div>');
  }
  function viewSetup() {
    const c = L.cfg, boats = boatsList(), G = kit().boatGet;
    const bn = id => (G(id) && G(id).name) || id;
    const U = KOS.U, winds = windOpts();
    const wMs = U && U.ms ? U.ms(c.windKn) : c.windKn * 0.5144;
    const keelB = id => { const B = G(id); return !!(B && B.canCapsize === false); };
    const note = wMs > 8.6 && !keelB(c.boat) ? t('live.dinghyNote') : wMs > 9 && keelB(c.boat) ? t('live.strongNote') : '';
    return shell(t('live.host'),
      '<p class="live-intro">' + esc(t('live.hostIntro')) + '</p>' +
      '<div class="live-form glass">' +
      row(t('live.cfg.role'), ['sail', 'watch'].map(r => chip('role', 'role', r, t('live.role.' + r), L.hostRole === r)).join('')) +
      '<div class="live-hint">' + esc(t('live.role.' + L.hostRole + 'Hint')) + '</div>' +
      row(t('live.cfg.boat'), boats.map(b => chip('opt', 'boat', b, bn(b), c.boat === b)).join('')) +
      row(t('live.cfg.venue'), ['sound', 'bay'].map(v => chip('opt', 'venue', v, t('live.cfg.' + v), c.venue === v)).join('')) +
      row(t('live.cfg.course'), ['wl', 'tri'].map(v => chip('opt', 'course', v, t('live.cfg.' + v), c.course === v, COURSE_ICO[v])).join('')) +
      visRow(c.vis, 'vis', true) + // who can see the race (and the host's nickname): high up, not below a dozen other settings
      row(t('live.cfg.laps'), [1, 2, 3].map(v => chip('opt', 'laps', v, String(v), c.laps === v)).join('')) +
      windRow(c, winds) +
      (note ? '<div class="live-hint live-windnote" role="note">' + esc(note) + '</div>' : '') +
      row(t('live.cfg.windDir'), DIRS.map(d => chip('opt', 'windDeg', d[1], t('live.dir.' + d[0]), c.windDeg === d[1])).join('')) +
      row(t('live.cfg.gust'), [['none', 0], ['some', 0.4], ['lots', 0.8], ['hard', 1]].map(g => chip('opt', 'gust', g[1], t('live.cfg.' + g[0]), c.gust === g[1])).join('')) +
      row(t('live.cfg.rain'), [0, 1, 2].map(v => chip('opt', 'rain', v, t('live.cfg.rain' + v), c.rain === v)).join('')) +
      row(t('live.cfg.shift'), [['none', 0], ['some', 0.4], ['lots', 0.8]].map(g => chip('opt', 'shift', g[1], t('live.cfg.' + g[0]), c.shift === g[1])).join('')) +
      row(t('live.cfg.start'), [['s20', 20], ['s60', 60], ['s180', 180]].map(g => chip('opt', 'countdownS', g[1], t('live.cfg.' + g[0]), c.countdownS === g[1])).join('')) +
      row(t('live.cfg.finish'), [60, 180, 300, 0].map(v => chip('opt', 'finishS', v, t('live.cfg.f' + v), c.finishS === v)).join('')) +
      row(t('live.cfg.pen'), [[true, 'on'], [false, 'off']].map(g => chip('opt', 'pen', g[0], t('live.cfg.' + g[1]), c.pen === g[0])).join('')) +
      row(t('live.cfg.contact'), [[true, 'on'], [false, 'off']].map(g => chip('opt', 'contact', g[0], t('live.cfg.' + g[1]), c.contact === g[0])).join('')) +
      row(t('live.cfg.help'), ['locked', 'free'].map(v => chip('opt', 'help', v, t('live.cfg.' + v), c.help === v)).join('')) +
      row(t('live.cfg.maxP'), [4, 8, 12, 24].map(v => chip('opt', 'maxP', v, String(v), c.maxP === v)).join('')) +
      '</div>' +
      '<div class="live-actions"><button type="button" class="btn btn-primary btn-big" data-act="create"' + (L.busy ? ' disabled' : '') + '>' + kit().ico('play') + '<span>' + esc(L.busy || t('live.cfg.create')) + '</span></button>' +
      (canPlan() ? '<button type="button" class="btn btn-glass btn-big" data-act="planview"' + (L.busy ? ' disabled' : '') + '>' + kit().ico('calendar') + '<span>' + esc(t('live.plan.btn')) + '</span></button>' : '') + '</div>');
  }
  function viewJoin() {
    const p = KOS.Storage && KOS.Storage.profile ? KOS.Storage.profile() : null;
    return shell(t('live.join'),
      '<p class="live-intro">' + esc(t('live.joinIntro')) + '</p>' +
      '<div class="live-form glass"><div class="live-me">' + (kit().profileAvatar ? '<span class="live-me-av">' + kit().profileAvatar() + '</span>' : '') +
      '<span><small>' + esc(t('live.yourName')) + '</small><b>' + esc(myName()) + '</b></span>' +
      (p && p.boatColor ? '<i class="live-dot" style="background:' + esc(p.boatColor) + '"></i>' : '') + '</div>' +
      '<label class="live-label" for="live-code">' + esc(t('live.codeLabel')) + '</label>' +
      '<input id="live-code" class="live-code-input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" value="' + esc(L.code || '') + '" aria-describedby="live-joinerr">' +
      '<div id="live-joinerr" class="live-err" role="alert">' + esc(L.joinErr || '') + '</div></div>' +
      '<div class="live-actions"><button type="button" class="btn btn-primary btn-big" data-act="join"' + (L.busy ? ' disabled' : '') + '>' + kit().ico('flag') + '<span>' + esc(L.busy || t('live.joinGo')) + '</span></button></div>');
  }
  function playersHtml(room) {
    const me = L.sess ? L.sess.id : 0;
    const iAmHost = room.hostId === me;
    // the host sees every player's game version; one that differs from the host's gets a small warning (old builds have broken races)
    const nv = v => String(v || '').replace(/^v/, '');
    const hostV = nv((room.players.find(q => q.host) || {}).v);
    const verTag = p => {
      if (!iAmHost) return '';
      const diff = !p.host && nv(p.v) !== hostV;
      return '<span class="live-ver' + (diff ? ' is-diff' : '') + '"' + (diff ? ' title="' + esc(t('live.verDiff')) + '"' : '') + '>' + (diff ? '<i aria-hidden="true">⚠</i> ' : '') + '<small class="sr-only">' + esc(t('live.ver')) + ' </small>' + esc(p.v || t('live.verUnknown')) + (diff ? '<small class="sr-only"> – ' + esc(t('live.verDiff')) + '</small>' : '') + '</span>';
    };
    return '<ul class="live-players" aria-label="' + esc(t('live.players')) + '">' + room.players.map(p => {
      const tag = p.host ? '<span class="live-tag">' + esc(t('live.hostTag')) + '</span>' : '';
      const watch = p.host && room.hostRole === 'watch';
      const kick = iAmHost && !p.host ? '<button type="button" class="btn btn-sm btn-glass" data-act="kick" data-id="' + p.id + '">' + esc(t('live.kick')) + '</button>' : '';
      return '<li class="live-player' + (p.lost ? ' is-lost' : '') + '" data-id="' + p.id + '"><i class="live-dot" style="background:' + esc(p.color || '#999') + '"></i>' +
        '<b>' + esc(p.name) + (p.id === me ? ' (' + esc(t('live.you')) + ')' : '') + '</b>' + tag + verTag(p) +
        (watch ? '' : '<span class="live-ready">' + (p.lost ? esc(t('live.lost')) : kit().ico('check') + esc(t('live.ready'))) + '</span>') + kick + '</li>';
    }).join('') + '</ul>';
  }
  function boatsCount(room) { return room.players.filter(p => !(p.host && room.hostRole === 'watch')).length; }
  function viewRoom() {
    const room = L.room, s = L.sess, host = s && room.hostId === s.id, code = room.code, link = linkFor(code);
    // a sailor waiting in a scheduled room: what happens and when comes first; the code and QR (for sharing) go below the players, the QR behind a button
    const waiting = !!room.sched && !host, qrOn = !waiting || L.roomQr === code;
    let qr = '';
    if (qrOn) { try { qr = KOS.QR.svg(link, { size: waiting ? 160 : 200, ecc: 'M' }); } catch (e) { qr = ''; } }
    const need = room.hostRole === 'watch' ? 1 : 2, have = boatsCount(room);
    const can = host && have >= need;
    const cf = room.cfg || {};
    const bn = (kit().boatGet(cf.boat) || {}).name || cf.boat;
    const hint = '<div class="live-hint">' + esc(room.sched && !room.hostId ? t('live.auto', { when: whenTxt(room.sched.at) }) : t('live.waitHost')) + '</div>';
    const leave = '<button type="button" class="btn btn-glass btn-sm" data-act="leave">' + esc(t('live.leave')) + '</button>';
    const codebox = '<div class="live-codebox glass' + (waiting ? ' is-small' : '') + '"><div class="live-label">' + esc(t('live.code')) + '</div><div class="live-code" id="live-code-show" aria-live="polite">' + esc(code) + '</div>' +
      '<div class="live-link"><small>' + esc(t('live.joinLink')) + ':</small> <code id="live-link">' + esc(link) + '</code></div>' +
      (qrOn ? '<div class="live-qr" id="live-qr" aria-label="' + esc(t('live.scan')) + '">' + qr + '</div><small>' + esc(t('live.scan')) + '</small>' : '') +
      '<div class="live-codebtns">' + (waiting ? '<button type="button" class="btn btn-glass btn-sm" data-act="roomqr" aria-pressed="' + qrOn + '">' + kit().ico('qr') + '<span>' + esc(t('live.mine.qr')) + '</span></button>' : '') +
      '<button type="button" class="btn btn-glass btn-sm" data-act="share">' + kit().ico('share') + '<span>' + esc(t('live.share')) + '</span></button></div></div>';
    const side = '<div class="live-side glass"><h2>' + esc(t('live.players')) + ' (' + room.players.length + '/' + (cf.maxP || '') + ')</h2>' + playersHtml(room) +
      '<div class="live-sum">' + esc(bn) + ' · ' + esc(t('live.cfg.' + cf.course)) + ' · ' + esc(String(cf.laps)) + ' ' + esc(t('live.cfg.laps').toLowerCase()) + (room.sched ? '' : ' · ' + esc(role(room))) + '</div>' +
      (room.sched && !waiting ? schedRoomHtml(room) : '') +
      (host ? visRow(cf.vis, 'visroom', true) : '') +
      (host ? '<button type="button" class="btn btn-primary btn-big" data-act="start"' + (can ? '' : ' disabled') + '>' + kit().ico('play') + '<span>' + esc(t(room.sched ? 'live.startEarly' : 'live.start')) + '</span></button>' +
        (can ? '' : '<div class="live-hint" id="live-few">' + esc(t('live.few')) + '</div>') : waiting ? '' : hint) +
      (waiting ? '' : leave) + '</div>';
    return bannerHtml() + shell(room.sched ? titleTxt(room.sched.title) : t('live.title'),
      (waiting ? '<div class="live-schedtop glass">' + schedRoomHtml(room) + hint + leave + '</div>' : '') +
      '<div class="live-room' + (waiting ? ' is-waiting' : '') + '">' + (waiting ? side + codebox : codebox + side) + '</div>');
  }
  const role = room => t('live.role.' + (room.hostRole === 'watch' ? 'watch' : 'sail'));
  function viewStarting() {
    return shell(t('live.title'), '<div class="live-start glass"><div class="live-count" id="live-count" aria-live="assertive"></div><p class="live-intro">' + esc(t('live.race')) + '</p>' +
      '<button type="button" class="btn btn-glass btn-sm" data-act="leave">' + esc(t('live.leave')) + '</button></div>');
  }
  function fmt(ms) { const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s - m * 60 < 10 ? '0' : '') + (s - m * 60).toFixed(1); }
  function viewResults() {
    const rows = (L.results || []).slice().sort((a, b) => a.place - b.place);
    return shell(L.resCode ? t('live.resTitle', { code: L.resCode }) : t('live.res.title'), (L.resLate ? '<p class="live-intro">' + esc(t('live.resOver')) + '</p>' : '') + '<ol class="live-results glass">' + rows.map(r => '<li><b>' + r.place + '.</b> <span>' + esc(r.name) + '</span> <em>' +
      (r.ms != null ? fmt(r.ms) : esc(t('live.res.dnf'))) + '</em></li>').join('') + '</ol>' +
      '<div class="live-actions"><button type="button" class="btn btn-primary" data-act="entry">' + esc(t('common.ok')) + '</button></div>');
  }

  // wind chips in the player's unit (the server stores knots): 3-14 m/s or 6-27 kn
  function windOpts() {
    const U = KOS.U, ms = U && U.windUnit && U.windUnit() !== 'kn';
    return ms ? [3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(v => ({ kn: Math.round(U.kn(v) * 10) / 10, label: v + ' m/s' })) : [6, 8, 10, 12, 14, 16, 18, 20, 24, 27].map(v => ({ kn: v, label: v + ' kn' }));
  }
  const windRow = (c, winds) => row(t('live.cfg.wind'), (winds || windOpts()).map(w => chip('opt', 'windKn', w.kn, w.label, Math.abs(c.windKn - w.kn) < 0.06)).join(''));
  // stacked: the label above two equal chips (the room's narrow side card; the chips share the row instead of pushing it wider)
  function visRow(v, act, stacked) {
    v = v === 'open' ? 'open' : 'private';
    const chips = ['private', 'open'].map(x => chip(act, 'vis', x, t('live.vis.' + x), v === x, kit().ico(x === 'open' ? 'eye' : 'lock'))).join('');
    return (stacked ? '<div class="live-row live-vis"><div class="live-label">' + esc(t('live.vis.label')) + '</div><div class="live-chips">' + chips + '</div></div>' : row(t('live.vis.label'), chips)) +
      '<div class="live-hint live-vishint' + (v === 'open' ? ' is-open' : '') + '">' + esc(t('live.vis.' + v + 'Hint')) + '</div>';
  }

  // ------------------------------------------------------------------ open list + scheduled races (live-rules spec B/C)
  const TITLES = ['train', 'friday', 'club', 'xmas', 'weekend']; // the server's preset ids; the client translates them
  const SCHED_KEY = 'liveSched'; // KOS.Storage: [{code, secret, title, startAt, opensAt, boat, course, wind, maxP, vis, url}] my scheduled races
  const MIN_LEAD = 10 * 60000, MAX_LEAD = 14 * 86400000, OPEN_BEFORE = 15 * 60000, LIST_MS = 10000;
  // the status file kill switch: closed/hidden hides the list and blocks new schedules (my existing ones stay visible)
  const canPlan = () => !L.status || L.status.mode === 'on';
  const titleTxt = id => (TITLES.indexOf(id) >= 0 ? t('live.titles.' + id) : t('live.title'));
  const locale = () => (KOS.I18n && KOS.I18n.lang === 'en' ? 'en-GB' : 'da-DK');
  function fmtDate(ms, o) { try { return new Intl.DateTimeFormat(locale(), o).format(new Date(ms)); } catch (e) { return new Date(ms).toLocaleString(); } }
  const clock = ms => fmtDate(ms, { hour: '2-digit', minute: '2-digit' });
  const dayKey = ms => { const d = new Date(ms); return d.getFullYear() * 500 + d.getMonth() * 40 + d.getDate(); };
  // "i dag kl. 18.00" / "i morgen kl. 18.00" / "fre. 6. nov. kl. 18.00" (local time)
  function whenTxt(ms) {
    const now = Date.now(), k = dayKey(ms), tm = clock(ms);
    if (k === dayKey(now)) return t('live.when.today', { time: tm });
    if (k === dayKey(now + 86400000)) return t('live.when.tomorrow', { time: tm });
    return t('live.when.day', { day: fmtDate(ms, { weekday: 'short', day: 'numeric', month: 'short' }), time: tm });
  }
  // a countdown: "0:45", "12:03", "2 timer 5 min", "3 dage"
  function durTxt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 3600) return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const h = Math.floor(s / 3600);
    return h < 48 ? t(h === 1 ? 'live.dur.h1' : 'live.dur.h', { h, m: Math.floor((s % 3600) / 60) }) : t('live.dur.d', { d: Math.floor(h / 24) });
  }
  // a clock on screen: data-until (local ms) + data-fmt (key with {t}) + data-done (key when it has passed); onTick() fills it
  // far (optional): a key with {when}, used while it is a day or more away ("Åbner i morgen kl. 13.38" instead of "25 timer 44 min")
  const untilHtml = (cls, at, fmt, done, far) => '<span class="' + cls + '" data-until="' + Math.round(at) + '" data-fmt="' + fmt + '" data-done="' + done + '"' + (far ? ' data-far="' + far + '"' : '') + '></span>';
  function onTick() {
    const sec = secEl(), now = Date.now();
    if (!sec) return;
    sec.querySelectorAll('[data-until]').forEach(el => {
      const left = +el.getAttribute('data-until') - now;
      const far = el.getAttribute('data-far');
      const txt = left <= 0 ? t(el.getAttribute('data-done')) : far && left >= 86400000 ? t(far, { when: whenTxt(+el.getAttribute('data-until')) }) : t(el.getAttribute('data-fmt'), { t: durTxt(left) });
      if (el.textContent !== txt) el.textContent = txt;
    });
    // the list refreshes every 10 s while it is on screen (never in the background)
    if (L.view === 'list' && L.list && !L.list.loading && !(doc && doc.hidden) && now - L.list.tried >= LIST_MS) loadList();
    // the wait card joins by itself once the room has opened (a few tries; opensAt is server time, w.skew puts it on our clock)
    const w = L.wait;
    if (L.view === 'wait' && w && !L.busy && w.tries < 4 && now >= w.opensAt - (w.skew || 0) + 1500 + w.tries * 10000) { w.tries++; doJoin(w.code); }
  }

  // my scheduled races (the secret is only here: it makes me the host and lets me cancel)
  function wsUrl() { try { return KOS.MPStatus.resolve().wsUrl || ''; } catch (e) { return ''; } }
  function schedAll() {
    const S = KOS.Storage, now = Date.now();
    if (!S || !S.get) return [];
    return (S.get(SCHED_KEY, [], Array.isArray) || []).filter(e => e && KOS.MP.normCode(e.code) && /^[0-9a-f]{32}$/.test(String(e.secret)) && typeof e.startAt === 'number' && e.startAt + 10 * 60000 > now);
  }
  function mySched() { const u = wsUrl(); return schedAll().filter(e => !e.url || e.url === u).sort((a, b) => a.startAt - b.startAt); } // a race on another server (test vs prod) is not shown
  function saveSched(list) { try { KOS.Storage.set(SCHED_KEY, list.slice(-20)); } catch (e) { /* storage full */ } }
  const addSched = e => saveSched(schedAll().filter(x => x.code !== e.code).concat([e]));
  const dropSched = code => saveSched(schedAll().filter(x => x.code !== code));

  // ---- "Find et løb": GET /rooms (no socket); falls back to one short socket when the HTTP route is not there
  function openList() { L.list = L.list || { rows: null, err: '', tried: 0, at: 0, loading: false }; L.waitFrom = ''; L.joinErr = ''; setView('list'); loadList(); }
  function loadList() {
    const st = L.list;
    if (!st || st.loading) return;
    st.loading = true; st.tried = Date.now();
    const viaWs = () => connectNow().then(sess => sess.list().then(r => { sess.close(); return r; }, e => { sess.close(); throw e; }));
    // rate limited (a club Wi-Fi behind one IP): keep the list on screen, or ask over the socket when there is none yet
    KOS.MP.fetchRooms(wsUrl()).catch(e => (e && e.code === 'rate' && st.rows ? Promise.reject(e) : viaWs())).then(rows => {
      st.rows = rows; st.at = Date.now(); st.err = '';
    }, e => {
      if (handleOld(e, {})) return;
      if (!st.rows) st.err = t('live.list.err'); // a failed refresh keeps the last list on screen
    }).then(() => {
      st.loading = false;
      const box = L.view === 'list' && secEl() && secEl().querySelector('#live-listbox');
      if (box) { box.innerHTML = listBody(); box.setAttribute('aria-busy', 'false'); onTick(); } // only the list itself: the scroll position stays
    });
  }
  const courseTxt = c => (COURSE_ICO[c] || '') + esc(t('live.cfg.' + (c === 'tri' ? 'tri' : 'wl')));
  function metaHtml(cls, course, wind) {
    const bn = (kit().boatGet(cls) || {}).name || cls || '';
    const U = KOS.U, w = U && U.windTxt ? U.windTxt(+wind || 0) : Math.round(+wind || 0) + ' kn';
    return '<span class="live-meta"><span>' + kit().ico('boat') + esc(bn) + '</span><span>' + courseTxt(course) + '</span><span>' + kit().ico('wind') + esc(w) + '</span></span>';
  }
  // an open lobby has no title: "Milles løb" / "Mille’s race" (Danish genitive: a name ending in s, x or z takes only ’)
  const hostRace = name => t(/[sxz]$/i.test(String(name || '')) ? 'live.list.hostRaceS' : 'live.list.hostRace', { name: name || '?' });
  function rowHtml(r) {
    const st = L.list, pending = r.phase === 'sched', full = !pending && r.n >= r.max, shut = full || r.phase === 'countdown'; // a countdown is shown, but nobody can join it any more
    const head = r.sched ? titleTxt(r.sched.title) : hostRace(r.host);
    let status;
    if (pending) status = '<span class="live-st is-sched">' + kit().ico('calendar') + esc(t('live.list.planned', { when: whenTxt(r.sched.at) })) + '</span>';
    else if (r.phase === 'countdown') status = '<span class="live-st is-go">' + kit().ico('timer') + untilHtml('', st.at + (+r.startsIn || 0), 'live.list.startsIn', 'live.list.now') + '</span>';
    else if (r.sched) status = '<span class="live-st is-open">' + kit().ico('timer') + untilHtml('', st.at + (+r.startsIn || 0), 'live.list.startsIn', 'live.list.now') + '</span>';
    else status = '<span class="live-st is-lobby">' + esc(t('live.list.lobby')) + '</span>';
    const count = pending ? '<span class="live-n">' + esc(t('live.plan.opens', { time: clock(r.sched.opens) })) + '</span>' :
      '<span class="live-n' + (full ? ' is-full' : '') + '">' + kit().ico('user') + esc(full ? t('live.list.full') : t('live.list.sailors', { n: r.n, max: r.max })) + '</span>';
    // every card has the same four rows, whatever the name's length: title (one line) / status + sailors / class, course, wind / host
    return '<li><button type="button" class="live-item glass" data-act="pick" data-code="' + esc(r.code) + '"' + (shut ? ' disabled' : '') + '>' +
      '<b class="live-item-name">' + esc(head) + '</b>' +
      '<span class="live-item-top">' + status + count + '</span>' +
      '<span class="live-item-bot">' + metaHtml(r.cls, r.course, r.wind) + '</span>' +
      '<span class="live-item-by">' + esc(t('live.list.by', { name: r.host })) + '</span></button></li>';
  }
  // races you can join first: an opened scheduled race by its start (soonest first), then the lobbies with the most sailors;
  // full rooms and countdowns (shown, nobody can join them) last
  const LIST_FIRST = 6; // open races shown before "Vis flere"
  function openOrder(rows) {
    const shut = r => (r.n >= r.max || r.phase === 'countdown' ? 1 : 0);
    const at = r => (r.sched ? +r.startsIn || 0 : Infinity);
    return rows.slice().sort((a, b) => shut(a) - shut(b) || (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1) || b.n - a.n);
  }
  function listBody() {
    const st = L.list || {};
    if (!st.rows) return st.err ? trainerHtml(st.err) + '<div class="live-actions"><button type="button" class="btn btn-primary" data-act="relist">' + kit().ico('retry') + '<span>' + esc(t('live.retry')) + '</span></button></div>' :
      '<p class="live-hint live-loading" role="status">' + esc(t('live.list.loading')) + '</p>';
    if (!st.rows.length) {
      return '<div class="live-empty">' + trainerHtml(t('live.list.empty')) + '<div class="live-actions">' +
        '<button type="button" class="btn btn-primary" data-act="host">' + kit().ico('flag') + '<span>' + esc(t('live.host')) + '</span></button>' +
        '<button type="button" class="btn btn-glass" data-act="planview">' + kit().ico('calendar') + '<span>' + esc(t('live.plan.btn')) + '</span></button></div></div>';
    }
    // races you can join now first (an opened scheduled race is one of them), then the scheduled races that are not open yet
    // (each header counts its races, so the scheduled ones further down are not missed; long lists show the first few open races)
    const open = openOrder(st.rows.filter(r => r.phase !== 'sched')), sch = st.rows.filter(r => r.phase === 'sched');
    const shown = st.more ? open : open.slice(0, LIST_FIRST), rest = open.length - shown.length;
    const sect = (k, rows, n, extra) => rows.length ? '<section class="live-sect"><h2 class="live-h">' + esc(t(k)) + ' <span class="live-hn">(' + n + ')</span></h2><ul class="live-list">' + rows.map(rowHtml).join('') + '</ul>' + (extra || '') + '</section>' : '';
    const more = rest > 0 ? '<div class="live-actions live-more"><button type="button" class="btn btn-glass" data-act="listmore">' + kit().ico('plus') + '<span>' + esc(t('live.list.more', { n: rest })) + '</span></button></div>' : '';
    return sect('live.list.open', shown, open.length, more) + sect('live.list.sched', sch, sch.length);
  }
  function viewList() { // Refresh sits in the screen head beside the title: one row less (in landscape that row was a third of the screen)
    const refresh = '<button type="button" class="btn btn-glass btn-sm live-refresh" data-act="relist" aria-label="' + esc(t('live.list.refresh')) + '">' + kit().ico('retry') + '<span>' + esc(t('live.list.refresh')) + '</span></button>';
    return kit().header(t('live.list.title'), '', refresh) + '<div class="scroll"><div class="live-wrap">' +
      '<p class="live-intro live-listintro">' + esc(t('live.list.intro')) + '</p>' +
      '<div id="live-listbox" aria-live="polite">' + listBody() + '</div></div></div>';
  }

  // ---- "Planlæg til senere": preset title, local day + time (now + 10 min .. 14 days), the race settings and who can see it
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  function openPlan(from) {
    L.planFrom = from === 'setup' || from === 'list' ? from : 'entry';
    if (!L.plan) L.plan = { title: 'train', vis: 'open', err: '' };
    if (!L.plan.day || planCheck(L.plan)) { const d = planDefault(); L.plan.day = ymd(d); L.plan.time = hhmm(d); } // never open on a time that is already too soon
    L.plan.err = '';
    setView('plan');
  }
  // today at 18.00; later in the day the next whole hour at least 15 min ahead (until 21.00); after that tomorrow at 18.00
  function planDefault() {
    const now = Date.now(), d = new Date(now);
    d.setHours(18, 0, 0, 0);
    if (d.getTime() >= now + MIN_LEAD + 5 * 60000) return d;
    const n = new Date(now + MIN_LEAD + 5 * 60000); n.setMinutes(0, 0, 0); n.setHours(n.getHours() + 1);
    if (n.getDate() === new Date(now).getDate() && n.getHours() <= 21) return n;
    d.setDate(d.getDate() + 1); return d;
  }
  function planStart(p) { // local day + time -> UTC ms (NaN when one is missing)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.day || ''), n = /^(\d{2}):(\d{2})/.exec(p.time || '');
    return m && n ? new Date(+m[1], +m[2] - 1, +m[3], +n[1], +n[2], 0, 0).getTime() : NaN;
  }
  function planCheck(p) {
    const at = planStart(p), now = Date.now();
    return !isFinite(at) ? 'noTime' : at < now + MIN_LEAD ? 'tooSoon' : at > now + MAX_LEAD ? 'tooLate' : '';
  }
  const cap = x => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);
  const planWhen = p => { const at = planStart(p); return isFinite(at) && !planCheck(p) ? cap(whenTxt(at)) + ' · ' + t('live.plan.opens', { time: clock(at - OPEN_BEFORE) }) : ''; };
  function viewPlan() {
    const p = L.plan, c = L.cfg, boats = boatsList(), G = kit().boatGet, now = new Date();
    const bn = id => (G(id) && G(id).name) || id;
    return shell(t('live.plan.title'),
      '<p class="live-intro">' + esc(t('live.plan.intro')) + '</p>' +
      '<div class="live-form live-plan glass">' +
      // day and time first, side by side (the fields that matter most stay above the fold on a small phone), then the name
      '<div class="live-plan-dt"><div class="live-plan-f"><label class="live-label" for="live-plan-day">' + esc(t('live.plan.day')) + '</label>' +
      '<input id="live-plan-day" class="live-input" type="date" min="' + ymd(now) + '" max="' + ymd(new Date(Date.now() + MAX_LEAD)) + '" value="' + esc(p.day) + '" required></div>' +
      '<div class="live-plan-f"><label class="live-label" for="live-plan-time">' + esc(t('live.plan.time')) + '</label>' +
      '<input id="live-plan-time" class="live-input" type="time" step="300" value="' + esc(p.time) + '" required></div></div>' +
      '<div class="live-plan-when live-plan-when2" aria-hidden="true">' + esc(planWhen(p)) + '</div>' + // a narrow phone: the summary under the pickers, the bar holds the button only
      '<div id="live-plan-err" class="live-err" role="alert">' + esc(p.err || '') + '</div>' +
      row(t('live.plan.name'), TITLES.map(id => chip('ptitle', 'title', id, titleTxt(id), p.title === id)).join('')) +
      row(t('live.cfg.boat'), boats.map(b => chip('opt', 'boat', b, bn(b), c.boat === b)).join('')) +
      row(t('live.cfg.course'), ['wl', 'tri'].map(v => chip('opt', 'course', v, t('live.cfg.' + v), c.course === v, COURSE_ICO[v])).join('')) +
      visRow(p.vis, 'pvis', true) +
      // wind and the less common settings wait behind "Flere valg" (the defaults are fine for a club race)
      '<button type="button" class="btn btn-glass btn-sm live-pmore" data-act="pmore" aria-expanded="' + (L.planMore ? 'true' : 'false') + '">' + kit().ico(L.planMore ? 'minus' : 'plus') + '<span>' + esc(t(L.planMore ? 'live.plan.less' : 'live.plan.more')) + '</span></button>' +
      (L.planMore ? windRow(c) +
        row(t('live.cfg.maxP'), [4, 8, 12, 24].map(v => chip('opt', 'maxP', v, String(v), c.maxP === v)).join('')) +
        row(t('live.cfg.pen'), [[true, 'on'], [false, 'off']].map(g => chip('opt', 'pen', g[0], t('live.cfg.' + g[1]), c.pen === g[0])).join('')) +
        row(t('live.cfg.contact'), [[true, 'on'], [false, 'off']].map(g => chip('opt', 'contact', g[0], t('live.cfg.' + g[1]), c.contact === g[0])).join('')) : '') +
      '</div>' +
      // the summary, any error and the button stay at the bottom of the screen while the form scrolls
      '<div class="live-plan-bar"><div class="live-plan-foot"><div class="live-plan-when" id="live-plan-when">' + esc(planWhen(p)) + '</div>' +
      '<div id="live-plan-err2" class="live-err" aria-hidden="true">' + esc(p.err || '') + '</div></div>' +
      '<div class="live-actions"><button type="button" class="btn btn-primary btn-big" data-act="plan"' + (L.busy ? ' disabled' : '') + '>' + kit().ico('calendar') + '<span>' + esc(L.busy || t('live.plan.go')) + '</span></button></div></div>');
  }
  // the pickers write into L.plan as they change (no repaint: the native picker keeps its focus)
  function bindPlanInputs(sec) {
    const upd = () => {
      const d = sec.querySelector('#live-plan-day'), tm = sec.querySelector('#live-plan-time');
      if (!L.plan || !d || !tm) return;
      L.plan.day = d.value; L.plan.time = tm.value; L.plan.err = '';
      const w = planWhen(L.plan);
      sec.querySelectorAll('.live-plan-when').forEach(el => { el.textContent = w; });
      sec.querySelectorAll('#live-plan-err, #live-plan-err2').forEach(el => { el.textContent = ''; });
    };
    ['#live-plan-day', '#live-plan-time'].forEach(q => { const el = sec.querySelector(q); if (el) { el.addEventListener('input', upd); el.addEventListener('change', upd); } });
  }
  function doPlan() {
    const p = L.plan, bad = planCheck(p);
    if (bad) { p.err = t('live.plan.' + bad); paint(); return; } // shown at the pickers and right above the button
    const at = planStart(p), cfg = Object.assign({}, L.cfg, { vis: p.vis });
    L.busy = t('live.connecting'); p.err = ''; paint();
    guard().then(ok => {
      if (!ok) { L.busy = ''; return; }
      return connectNow().then(sess => sess.schedule(cfg, p.title, at).then(r => {
        try { sess.close(); } catch (x) { /* ignore */ }
        const c = r.cfg || cfg;
        addSched({ code: r.code, secret: r.secret, title: r.title, startAt: r.startAt, opensAt: r.opensAt, boat: c.boat, course: c.course, wind: c.windKn, maxP: c.maxP, vis: c.vis, url: wsUrl() });
        L.busy = ''; L.plan = null; L.mineQr = ''; // the QR is one tap away ("QR-kode"): the share buttons stay in view
        lt('schedule', r.title);
        try { KOS.UI.toast(t('live.plan.done', { title: titleTxt(r.title), when: whenTxt(r.startAt) }), { kind: 'good' }); } catch (x) { /* optional */ }
        setView('mine');
      }, e => { try { sess.close(); } catch (x) { /* ignore */ } throw e; }));
    }).catch(e => {
      L.busy = '';
      if (handleOld(e, {})) return;
      const code = e && e.code;
      if (['badtime', 'schedlimit', 'schedfull', 'closed', 'busy'].indexOf(code) >= 0) { if (L.plan) L.plan.err = errText(code); setView('plan'); return; }
      unavailable(false);
    });
  }

  // ---- "Mine planlagte løb": share (link/QR), remind, go in as host, cancel
  function mineHtml(e) {
    const link = linkFor(e.code), open = Date.now() >= e.opensAt, qrOn = L.mineQr === e.code;
    let qr = '';
    if (qrOn) { try { qr = KOS.QR.svg(link, { size: 180, ecc: 'M' }); } catch (x) { qr = ''; } }
    const btn = (act, ico, k, cls) => '<button type="button" class="btn btn-sm ' + (cls || 'btn-glass') + '" data-act="' + act + '" data-code="' + e.code + '"' + (L.busy ? ' disabled' : '') + '>' + kit().ico(ico) + '<span>' + esc(t(k)) + '</span></button>';
    return '<li class="live-mitem glass" data-code="' + e.code + '">' +
      '<div class="live-mhead"><div class="live-mtxt"><b class="live-mtitle">' + esc(titleTxt(e.title)) + '</b><span class="live-mwhen">' + kit().ico('calendar') + esc(whenTxt(e.startAt)) + '</span></div>' +
      '<div class="live-mcode" aria-label="' + esc(t('live.code')) + '">' + esc(e.code) + '</div></div>' +
      '<div class="live-mmeta">' + metaHtml(e.boat, e.course, e.wind) + '<span class="live-n">' + kit().ico(e.vis === 'private' ? 'lock' : 'eye') + esc(t('live.vis.' + (e.vis === 'private' ? 'private' : 'open'))) + '</span></div>' +
      '<div class="live-hint' + (open ? ' is-open' : '') + '">' + esc(open ? t('live.mine.isOpen') : t('live.mine.opens', { when: whenTxt(e.opensAt) })) + '</div>' +
      (qrOn ? '<div class="live-mqr"><div class="live-qr">' + qr + '</div><div class="live-link"><code>' + esc(link) + '</code></div></div>' : '') +
      '<div class="live-mbtns">' + (open ? btn('mgo', 'play', 'live.mine.go', 'btn-primary live-mgo') : '') + btn('mshare', 'share', 'live.share') + btn('mqr', 'qr', 'live.mine.qr', qrOn ? 'btn-glass is-on' : '') +
      (open ? '' : btn('mremind', 'calendar', 'live.wait.remind')) + '</div>' +
      '<div class="live-mcancel">' + btn('mcancel', 'trash', 'live.mine.cancel', 'live-cancel') + '</div></li>'; // destructive: on its own line, away from the others
  }
  function viewMine() {
    const list = mySched();
    return shell(t('live.mine.title'),
      (list.length ? '<p class="live-intro">' + esc(t('live.mine.intro')) + '</p><ul class="live-list live-mine">' + list.map(mineHtml).join('') + '</ul>' : trainerHtml(t('live.mine.empty'))) +
      (canPlan() ? '<div class="live-actions"><button type="button" class="btn btn-glass" data-act="planview">' + kit().ico('plus') + '<span>' + esc(t('live.plan.btn')) + '</span></button></div>' : ''));
  }
  function askCancel(code) {
    const e = mySched().find(x => x.code === code);
    if (!e || L.busy) return;
    KOS.UI.dialog({ icon: 'calendar', title: t('live.mine.cancelAsk', { title: titleTxt(e.title), when: whenTxt(e.startAt) }), buttons: [
      { label: t('live.hm.no') },
      { label: t('live.mine.cancel'), kind: 'danger', icon: 'trash', onClick: () => doCancel(e) },
    ] });
  }
  function doCancel(e) {
    L.busy = t('live.connecting'); paint();
    const done = () => { dropSched(e.code); if (L.mineQr === e.code) L.mineQr = ''; lt('schedcancel'); try { KOS.UI.toast(t('live.mine.cancelled'), { kind: 'info' }); } catch (x) { /* optional */ } };
    connectNow().then(sess => sess.schedCancel(e.code, e.secret).then(() => { sess.close(); }, x => { sess.close(); throw x; })).then(done, x => {
      if (handleOld(x, {})) { L.busy = ''; return; }
      const c = x && x.code;
      if (c === 'nocode') done(); // the server no longer has it (it ran, or it was cancelled for too few sailors): forget it here too
      else { try { KOS.UI.toast(t(c === 'bad' ? 'live.mine.cantCancel' : 'live.unavailable'), { kind: 'warn' }); } catch (y) { /* optional */ } }
    }).then(() => { L.busy = ''; if (L.view === 'mine') paint(); });
  }

  // ---- a scheduled race that has not opened yet (from the list, a code or a #live=/#join= link)
  function showWait(code, e) {
    const prev = L.wait && L.wait.code === code ? L.wait.tries : 0;
    // skew: the server's clock minus ours (kids' tablets are often minutes off): the countdown and the join tries use the server's time
    const skew = Number.isFinite(e.now) && e.now > 0 ? e.now - Date.now() : 0;
    L.wait = { code, opensAt: +e.opensAt || Date.now(), startAt: +e.startAt || Date.now(), title: e.title, tries: prev, skew };
    L.busy = ''; L.joinErr = '';
    setView('wait');
  }
  function viewWait() {
    const w = L.wait;
    // "Åbner i morgen kl. 13.38 · starter kl. 13.53." (the title is the screen head); the start's day only when it differs
    const start = dayKey(w.startAt) === dayKey(w.opensAt) ? t('live.when.at', { time: clock(w.startAt) }) : whenTxt(w.startAt);
    return shell(titleTxt(w.title), '<div class="live-waitwrap">' +
      trainerHtml(t('live.wait.msg', { opens: whenTxt(w.opensAt), start })) +
      '<div class="live-waitbox glass"><div class="live-label">' + esc(t('live.code')) + '</div><div class="live-code">' + esc(w.code) + '</div>' +
      '<div class="live-count live-waitleft" aria-live="off">' + untilHtml('', w.opensAt - (w.skew || 0), 'live.wait.left', 'live.wait.soon', 'live.wait.leftDay') + '</div>' +
      '<div class="live-hint">' + esc(t('live.wait.auto')) + '</div></div>' +
      '<div class="live-actions"><button type="button" class="btn btn-primary" data-act="remind">' + kit().ico('calendar') + '<span>' + esc(t('live.wait.remind')) + '</span></button>' +
      '<button type="button" class="btn btn-glass" data-act="waitjoin"' + (L.busy ? ' disabled' : '') + '>' + kit().ico('retry') + '<span>' + esc(L.busy || t('live.wait.check')) + '</span></button></div></div>');
  }
  // a #live=CODE link: a listed scheduled race that has not opened yet shows its wait card at once (one GET /rooms, no socket),
  // instead of the join screen that only says so after "Deltag i løbet". A private one is not listed: the join tells, as before.
  function peekSched(code) {
    const url = wsUrl();
    if (!url || !KOS.MP || typeof KOS.MP.fetchRooms !== 'function') return;
    KOS.MP.fetchRooms(url, { timeoutMs: 4000 }).then(rows => {
      const r = (rows || []).find(x => x.code === code && x.phase === 'sched' && x.sched);
      const inp = doc && doc.getElementById('live-code');
      if (!r || L.view !== 'join' || L.busy || (inp && String(inp.value || '').toUpperCase() !== code)) return;
      showWait(code, { opensAt: r.sched.opens, startAt: r.sched.at, title: r.sched.title, now: r.sched.at - (+r.startsIn || 0) });
    }, () => { /* no list: the join screen stays */ });
  }
  // the scheduled room in the lobby: its title, the server's gun and how long until it
  function schedRoomHtml(room) {
    const sc = room.sched, skew = L.sess && L.sess.serverNow ? L.sess.serverNow() - Date.now() : 0;
    return '<div class="live-schedbox">' + kit().ico('calendar') + '<span><b>' + esc(titleTxt(sc.title)) + '</b> · ' + esc(whenTxt(sc.at)) + '</span>' +
      untilHtml('live-schedin', sc.at - skew, 'live.autoIn', 'live.waitMore') + '</div>';
  }

  // ---- "Påmind mig": a calendar file made here in the browser (no server, no mail)
  function icsText(e) {
    const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const q = x => String(x).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    // RFC 5545: lines of at most 75 octets (UTF-8: æ/ø/å take 2, the en dash 3), folded between characters, never inside one
    const octets = ch => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
    const fold = l => {
      let out = '', n = 0, lim = 75; // a continuation line starts with one space
      for (const ch of l) { const k = octets(ch); if (n + k > lim) { out += '\r\n '; n = 0; lim = 74; } out += ch; n += k; }
      return out;
    };
    const link = linkFor(e.code), title = titleTxt(e.title) + ' – ' + t('live.title');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KOS SEJL//Live race//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + e.code + '-' + e.startAt + '@kos-sejl', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(e.startAt), 'DTEND:' + z(e.startAt + 30 * 60000),
      'SUMMARY:' + q(title), 'DESCRIPTION:' + q(t('live.ics.desc', { code: e.code, link })), 'URL:' + link,
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:' + q(title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
  }
  function remind(e) {
    if (!e || !doc) return;
    try {
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' }));
      a.download = 'kos-sejl-' + e.code + '.ics'; a.hidden = true;
      doc.body.appendChild(a); a.click();
      setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (x) { /* ignore */ } }, 2000);
      lt('remind', e.title || '');
    } catch (x) { /* no download support: nothing to do */ }
  }

  function render(sec) {
    const v = L.view;
    sec.innerHTML = v === 'setup' ? viewSetup() : v === 'join' ? viewJoin() : v === 'room' && L.room ? viewRoom() : v === 'starting' ? viewStarting() :
      v === 'results' ? viewResults() : v === 'msg' ? viewMsg() : v === 'list' ? viewList() : v === 'plan' && L.plan ? viewPlan() : v === 'mine' ? viewMine() :
      v === 'wait' && L.wait ? viewWait() : viewEntry();
    sec.setAttribute('data-live-view', v);
    kit().bind(sec, {
      back: () => {
        kit().sfx('click');
        if (L.view === 'entry') { app().back(); return; }
        if (L.view === 'plan') { L.plan.err = ''; if (L.planFrom === 'setup') setView('setup'); else if (L.planFrom === 'list') openList(); else toEntry(); return; }
        if ((L.view === 'wait' || L.view === 'join') && L.waitFrom === 'list') { L.waitFrom = ''; L.joinErr = ''; openList(); return; }
        if ((L.view === 'wait' || L.view === 'join') && L.waitFrom === 'mine') { L.waitFrom = ''; L.joinErr = ''; setView('mine'); return; }
        if (L.view === 'room' || L.view === 'starting') leaveRoom(); else toEntry();
      },
      host: () => { L.hostRole = L.hostRole || 'sail'; if (!L.cfg) L.cfg = defaultCfg(); recheckThen(() => setView('setup')); },
      joinview: () => recheckThen(() => { L.joinErr = ''; L.via = 'code'; setView('join'); }),
      resumeseat: b => { const c = b.getAttribute('data-code'); lt('rejoin', 'entry'); L.rejoin = true; autoRejoin(c); },
      recheck: () => recheckThen(() => setView('entry')),
      role: b => { L.hostRole = b.getAttribute('data-v'); paint(); },
      opt: b => {
        const k = b.getAttribute('data-k'), raw = b.getAttribute('data-v');
        L.cfg[k] = k === 'boat' || k === 'help' || k === 'venue' || k === 'course' ? raw : raw === 'true' ? true : raw === 'false' ? false : Number(raw);
        paint();
      },
      create: () => { if (!L.busy) doCreate(); },
      join: () => { const inp = sec.querySelector('#live-code'); if (!L.busy) doJoin(inp ? inp.value : ''); },
      kick: b => { if (L.sess) { lt('kick'); L.sess.kick(Number(b.getAttribute('data-id'))); } },
      start: () => { if (L.sess) L.sess.start(); },
      share: () => share(L.room.code, L.room.sched ? titleTxt(L.room.sched.title) : ''),
      roomqr: () => { L.roomQr = L.roomQr === L.room.code ? '' : L.room.code; paint(); },
      leave: () => leaveRoom(),
      update: () => doUpdate(),
      retry: () => recheckThen(() => { reset(); setView('entry'); }),
      ai: () => { kit().sfx('click'); reset(); aiRace(); },
      entry: () => toEntry(),
      // live-rules spec B/C: the open list, scheduling, my scheduled races, the wait card
      listview: () => recheckThen(() => openList()),
      relist: () => loadList(),
      listmore: () => { if (!L.list) return; L.list.more = true; const box = secEl() && secEl().querySelector('#live-listbox'); if (box) { box.innerHTML = listBody(); onTick(); } },
      pick: b => { L.via = 'list'; L.waitFrom = 'list'; kit().sfx('click'); doJoin(b.getAttribute('data-code')); },
      vis: b => { L.cfg.vis = b.getAttribute('data-v') === 'open' ? 'open' : 'private'; paint(); },
      visroom: b => { if (L.sess) L.sess.setCfg({ vis: b.getAttribute('data-v') === 'open' ? 'open' : 'private' }); },
      planview: () => { const from = L.view; if (!L.cfg) L.cfg = defaultCfg(); recheckThen(() => openPlan(from)); },
      ptitle: b => { L.plan.title = b.getAttribute('data-v'); paint(); },
      pvis: b => { L.plan.vis = b.getAttribute('data-v') === 'private' ? 'private' : 'open'; paint(); },
      pmore: () => { L.planMore = !L.planMore; paint(); },
      plan: () => { if (!L.busy) doPlan(); },
      mineview: () => { L.mineQr = ''; setView('mine'); },
      mqr: b => { const c = b.getAttribute('data-code'); L.mineQr = L.mineQr === c ? '' : c; paint(); },
      mshare: b => { const e = mySched().find(x => x.code === b.getAttribute('data-code')); if (e) share(e.code, titleTxt(e.title)); },
      mgo: b => { L.via = 'mine'; L.waitFrom = 'mine'; doJoin(b.getAttribute('data-code')); },
      mcancel: b => askCancel(b.getAttribute('data-code')),
      remind: () => remind(L.wait),
      mremind: b => { const e = mySched().find(x => x.code === b.getAttribute('data-code')); if (e) remind(e); },
      waitjoin: () => { if (L.wait) doJoin(L.wait.code); },
      trynow: () => { kit().sfx('click'); if (L.sess && L.sess.retryNow) L.sess.retryNow(); else if (L.rj) rejoinNow(); },
    });
    if (v === 'plan') bindPlanInputs(sec);
    if (v === 'list' || v === 'wait' || v === 'room' && sec.querySelector('[data-until]')) { onTick(); ensureTick(); }
    const inp = sec.querySelector('#live-code');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = sec.querySelector('[data-act="join"]'); if (b) b.click(); } });
  }
  // the results card after a live race: the host gets the rematch button, the others a note (they follow automatically)
  function parked() { return !!(L.sess && L.sess.phase === 'results' && L.sess.state === 'ok'); }
  // a scheduled room whose creator is not here is run by the server: any sailor may ask for the next race (it starts a minute later)
  function canRematch() { const r = L.sess && L.sess.room; return L.sess.role === 'host' || !!(r && r.sched && !r.hostId); }
  function decorateResults(card) {
    if (!card || !parked()) return;
    const btn = card.querySelector('[data-act="retry"]');
    if (!btn) return;
    if (canRematch()) { btn.setAttribute('data-act', 'rematch'); btn.classList.replace('btn-glass', 'btn-primary'); btn.innerHTML = kit().ico('retry') + '<span>' + esc(t('live.rematch')) + '</span>'; }
    else { btn.insertAdjacentHTML('beforebegin', '<p class="results-locknote live-rematch-wait">' + esc(t('live.rematchWait')) + '</p>'); btn.remove(); }
  }
  function rematch() { if (parked() && canRematch()) { lt('rematch'); L.sess.rematch(); } else open(); }
  function recheckThen(fn) {
    KOS.MPStatus.refresh({ force: true }).then(st => {
      L.status = st;
      if (st.mode === 'hidden') unavailable(false);
      else if (KOS.MPStatus.tooOld(st)) showOld(L.view === 'join' ? { join: L.code } : {});
      else if (st.mode === 'closed') { lt('unavailable', 'closed'); trainerMsg(st.message || t('live.closed'), ['retry', 'ai']); }
      else fn();
    });
  }
  function toEntry() { reset(); L.joinErr = ''; setView('entry'); }
  function leaveRoom() { reset(); setView('entry'); }
  function share(code, title) {
    const link = linkFor(code);
    const done = () => KOS.UI.toast(t('live.copied'), { kind: 'good' });
    try {
      if (root.navigator && root.navigator.share) { root.navigator.share({ title: title || t('live.title'), url: link }).catch(() => {}); return; }
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(link).then(done, () => {}); return; }
    } catch (e) { /* fall through */ }
    done();
  }

  function open(opts) {
    opts = opts || {};
    reset();
    L.status = opts.status || KOS.MPStatus.cached();
    L.joinErr = ''; L.code = opts.join || ''; L.via = opts.via || 'code'; L.rejoin = !!opts.rejoin;
    L.cfg = L.cfg || defaultCfg();
    L.view = opts.join ? 'join' : 'entry';
    if (L.view === 'entry' && L.status && L.status.mode === 'hidden') { L.view = 'msg'; L.msgText = t('live.unavailable'); L.msgActions = ['retry', 'ai']; lt('unavailable', 'server'); }
    else if (L.view === 'entry' && L.status && (L.status.mode === 'on' || L.status.mode === 'closed')) lt('open', L.status.mode);
    const tooOld = KOS.MPStatus.tooOld(L.status);
    if (tooOld) { L.oldIntent = opts.join ? { join: opts.join } : {}; L.view = 'msg'; L.msgText = t('live.old.msg'); L.msgActions = ['update', 'ai']; lt('old', (KOS.BUILD && KOS.BUILD.version) || ''); }
    app().show('live', {});
    if (opts.join && opts.auto && !tooOld) autoRejoin(opts.join);
    else if (opts.join && L.view === 'join') peekSched(String(opts.join).toUpperCase());
  }

  if (app() && app().registerScreen) app().registerScreen('live', sec => render(sec), () => { if (!L.handoff) reset(); });
  KOS.Lobby = { open, state: L, decorateResults, rematch, leaveParked: () => { if (parked()) reset(); }, _render: render, _ics: icsText };
})(typeof window !== 'undefined' ? window : globalThis);
