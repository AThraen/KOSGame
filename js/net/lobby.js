// KØS SEJL — js/net/lobby.js  (LAZY: loaded together with mp.js when the "Live-kapsejlads" entry is opened)
// KOS.Lobby: the screens around a live race (docs/specs/live-race.md section 6.4 and 8). It is a normal app screen 'live'
// (KOS.App.registerScreen). Views: entry, setup (host), join, room (code, link, QR, players), starting, results, msg (the
// trainer talks: unavailable, closed, kicked ...). No chat and no free text: names come from the profile.
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
    guest: 'Sejler', ready: 'Klar', lost: 'Mistet forbindelsen', you: 'dig', hostTag: 'Vært',
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
    guest: 'Sailor', ready: 'Ready', lost: 'Lost connection', you: 'you', hostTag: 'Host',
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

  // ------------------------------------------------------------------ state
  const DIRS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  const L = {
    view: 'entry', hostRole: 'sail', cfg: null, sess: null, room: null, code: '', msgKey: null, msgText: '', msgActions: [],
    busy: '', status: null, offs: [], timers: [], handoff: false, results: null, via: 'code',
  };
  const app = () => KOS.App;
  const kit = () => KOS.App.kit;
  const esc = s => KOS.UI.esc(s);
  const secEl = () => doc.getElementById('screen-live');

  function defaultCfg() {
    const boats = boatsList();
    const fav = KOS.Storage && KOS.Storage.get ? KOS.Storage.get('boat', 'opti') : 'opti';
    return { boat: boats.indexOf(fav) >= 0 ? fav : boats[0] || 'opti', venue: 'sound', course: 'wl', laps: 2, windDeg: 225, windKn: 10,
      gust: 0.4, shift: 0.4, maxP: 8, countdownS: 60, pen: true, contact: true, help: 'free', rain: 0, finishS: 180 };
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
    L.sess = null; L.room = null; L.busy = ''; L.results = null; L.handoff = false;
  }
  function paint() { const sec = secEl(); if (sec && app().cur === 'live') { render(sec); if (KOS.I18n) KOS.I18n.apply(sec); } }
  function setView(v) { L.view = v; paint(); }

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
    return t('live.unavailable');
  }

  // ------------------------------------------------------------------ flows
  function connectNow() {
    const M = KOS.MPStatus;
    return KOS.MP.connect({ url: M.resolve().wsUrl, name: myName(), timeoutMs: 4000, build: (KOS.BUILD && KOS.BUILD.version) || 'web' });
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
      L.results = rows;
      if (app().cur === 'live') setView('results'); // while racing, race.js shows the result itself
      else { const me = sess; L.timers.push(setTimeout(() => { if (L.sess === me && me.phase === 'results') { reset(); } }, 190000)); } // the server drops the room after 3 min: do not keep a socket on a dead room
    });
    on('rematch', (room, aborted) => { // the host went again with the same people: everybody lands in the lobby of the same room
      L.room = room; L.results = null; L.handoff = false; L.view = 'room';
      if (aborted) { try { KOS.UI.toast(t('live.aborted'), { kind: 'info' }); } catch (e) { /* optional */ } }
      const cur = app().cur;
      if (cur === 'live') paint(); else if (cur === 'play' || cur === 'results') app().show('live', {}, { replace: true }); else reset();
    });
    on('hostleft', () => { const s = L.sess; L.sess = null; try { s.close(); } catch (e) { /* ignore */ } trainerMsg(t('live.hostLeft'), ['back']); leaveRaceScreen(); });
    on('kicked', () => { const s = L.sess; L.sess = null; try { s.close(); } catch (e) { /* ignore */ } trainerMsg(t('live.kicked'), ['back']); leaveRaceScreen(); });
    on('offline', () => { if (L.view === 'room' || L.view === 'starting') { if (!L.handoff) lt('unavailable', 'offline'); trainerMsg(t('live.unavailable'), ['retry', 'ai']); } });
    on('reconnecting', () => { const el = secEl() && secEl().querySelector('.live-banner'); if (el) el.hidden = false; });
    on('reconnected', () => { const el = secEl() && secEl().querySelector('.live-banner'); if (el) el.hidden = true; });
    on('error', e => { if (e && e.code === 'few') KOS.UI.toast(t('live.few'), { kind: 'warn' }); });
  }
  // role: re-read the status first (spec 7), then connect with a 4 s timeout
  function guard() {
    return KOS.MPStatus.refresh({ force: true }).then(st => {
      L.status = st;
      if (st.mode === 'hidden') { unavailable(L.hostRole === 'watch' && L.view === 'setup'); return false; }
      return true;
    });
  }
  function doCreate() {
    L.busy = t('live.connecting'); paint();
    guard().then(ok => {
      if (!ok) return;
      return connectNow().then(sess => {
        wire(sess);
        return sess.create(Object.assign({}, L.cfg), L.hostRole).then(room => { L.room = room; L.busy = ''; lt('host', L.hostRole === 'watch' ? 'host-only' : 'host+sail'); setView('room'); });
      });
    }).catch(e => {
      L.busy = '';
      const code = e && e.code;
      try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
      if (code === 'closed' || code === 'busy') { lt('unavailable', 'closed'); trainerMsg(errText(code, L.sess && L.sess.status.msg), ['retry', 'ai']); return; }
      unavailable(L.hostRole === 'watch');
    });
  }
  function doJoin(raw) {
    const code = KOS.MP.normCode(raw);
    if (!code) { L.joinErr = t('live.noCode'); paint(); return; }
    L.code = code; L.busy = t('live.connecting'); L.joinErr = ''; paint();
    guard().then(ok => {
      if (!ok) return;
      return connectNow().then(sess => {
        wire(sess);
        return sess.join(code).then(room => { L.room = room; L.busy = ''; lt('join', L.via || 'code'); setView('room'); });
      });
    }).catch(e => {
      L.busy = '';
      const code2 = e && e.code;
      try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
      if (code2 === 'closed' || code2 === 'busy') lt('unavailable', 'closed');
      if (code2 === 'nocode' || code2 === 'full' || code2 === 'started' || code2 === 'closed' || code2 === 'busy') { L.joinErr = errText(code2); setView('join'); return; }
      unavailable(false);
    });
  }
  // after a reload (update, refresh): resume the same seat (countdown/race) or join the room again (lobby), no taps needed
  function autoRejoin(code) {
    L.code = code; L.busy = t('live.connecting'); L.joinErr = ''; L.view = 'join';
    const tok = KOS.MP.savedToken && KOS.MP.savedToken();
    guard().then(ok => {
      if (!ok) return;
      return connectNow().then(sess => {
        wire(sess);
        const joined = room => {
          L.room = room; L.busy = '';
          if ((sess.phase === 'countdown' || sess.phase === 'racing') && sess.grid) launchRace(sess); // else the 'start' that follows launches it
          else setView('room');
        };
        if (tok && tok.code === code) return sess.resume(tok).then(joined, () => sess.join(code).then(joined));
        return sess.join(code).then(joined);
      });
    }).catch(e => {
      L.busy = '';
      const c2 = e && e.code;
      try { if (L.sess) { L.sess.close(); L.sess = null; } } catch (x) { /* ignore */ }
      if (c2 === 'nocode' || c2 === 'full' || c2 === 'started' || c2 === 'closed' || c2 === 'busy') { L.joinErr = errText(c2); setView('join'); return; }
      unavailable(false);
    });
  }
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
    wl: '<svg class="live-cico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2" fill="none"/><circle cx="12" cy="4.5" r="2.4" fill="#ff7a1a"/><circle cx="12" cy="20" r="2.4" fill="#ff7a1a"/></svg>',
    tri: '<svg class="live-cico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5L20 19H4z" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2" fill="none"/><circle cx="12" cy="4.5" r="2.4" fill="#ff7a1a"/><circle cx="20" cy="19" r="2.4" fill="#ff7a1a"/><circle cx="4" cy="19" r="2.4" fill="#ff7a1a"/></svg>',
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
    const closed = L.status && L.status.mode === 'closed';
    return shell(t('live.title'),
      (closed ? trainerHtml(L.status.message || t('live.closed')) : '<p class="live-intro">' + esc(t('live.intro')) + '</p>') +
      '<div class="live-big-btns">' +
      '<button type="button" class="btn btn-primary btn-big" data-act="host"' + (closed ? ' disabled' : '') + '>' + kit().ico('flag') + '<span>' + esc(t('live.host')) + '</span></button>' +
      '<button type="button" class="btn btn-glass btn-big" data-act="joinview"' + (closed ? ' disabled' : '') + '>' + kit().ico('user') + '<span>' + esc(t('live.join')) + '</span></button>' +
      '</div>' + (closed ? '<button type="button" class="btn btn-glass" data-act="recheck">' + esc(t('live.retry')) + '</button>' : ''));
  }
  function viewMsg() {
    const btn = { retry: '<button type="button" class="btn btn-primary" data-act="retry">' + esc(t('live.retry')) + '</button>',
      ai: '<button type="button" class="btn btn-glass" data-act="ai">' + kit().ico('sail') + esc(t('live.playAi')) + '</button>',
      back: '<button type="button" class="btn btn-primary" data-act="entry">' + esc(t('common.ok')) + '</button>' };
    return shell(t('live.title'), trainerHtml(L.msgText) + '<div class="live-actions">' + L.msgActions.map(a => btn[a] || '').join('') + '</div>');
  }
  function viewSetup() {
    const c = L.cfg, boats = boatsList(), G = kit().boatGet;
    const bn = id => (G(id) && G(id).name) || id;
    const U = KOS.U, ms = U && U.windUnit && U.windUnit() !== 'kn';
    // wind chips in the player's unit (the server stores knots): 3-14 m/s or 6-27 kn
    const winds = ms ? [3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(v => ({ kn: Math.round(U.kn(v) * 10) / 10, label: v + ' m/s' })) : [6, 8, 10, 12, 14, 16, 18, 20, 24, 27].map(v => ({ kn: v, label: v + ' kn' }));
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
      row(t('live.cfg.laps'), [1, 2, 3].map(v => chip('opt', 'laps', v, String(v), c.laps === v)).join('')) +
      row(t('live.cfg.wind'), winds.map(w => chip('opt', 'windKn', w.kn, w.label, Math.abs(c.windKn - w.kn) < 0.06)).join('')) +
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
      '<div class="live-actions"><button type="button" class="btn btn-primary btn-big" data-act="create"' + (L.busy ? ' disabled' : '') + '>' + kit().ico('play') + '<span>' + esc(L.busy || t('live.cfg.create')) + '</span></button></div>');
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
    return '<ul class="live-players" aria-label="' + esc(t('live.players')) + '">' + room.players.map(p => {
      const tag = p.host ? '<span class="live-tag">' + esc(t('live.hostTag')) + '</span>' : '';
      const watch = p.host && room.hostRole === 'watch';
      const kick = iAmHost && !p.host ? '<button type="button" class="btn btn-sm btn-glass" data-act="kick" data-id="' + p.id + '">' + esc(t('live.kick')) + '</button>' : '';
      return '<li class="live-player' + (p.lost ? ' is-lost' : '') + '" data-id="' + p.id + '"><i class="live-dot" style="background:' + esc(p.color || '#999') + '"></i>' +
        '<b>' + esc(p.name) + (p.id === me ? ' (' + esc(t('live.you')) + ')' : '') + '</b>' + tag +
        (watch ? '' : '<span class="live-ready">' + (p.lost ? esc(t('live.lost')) : kit().ico('check') + esc(t('live.ready'))) + '</span>') + kick + '</li>';
    }).join('') + '</ul>';
  }
  function boatsCount(room) { return room.players.filter(p => !(p.host && room.hostRole === 'watch')).length; }
  function viewRoom() {
    const room = L.room, s = L.sess, host = s && room.hostId === s.id, code = room.code, link = linkFor(code);
    let qr = '';
    try { qr = KOS.QR.svg(link, { size: 200, ecc: 'M' }); } catch (e) { qr = ''; }
    const need = room.hostRole === 'watch' ? 1 : 2, have = boatsCount(room);
    const can = host && have >= need;
    const cf = room.cfg || {};
    const bn = (kit().boatGet(cf.boat) || {}).name || cf.boat;
    return '<div class="live-banner" role="status" hidden>' + esc(t('live.reconnecting')) + '</div>' + shell(t('live.title'),
      '<div class="live-room">' +
      '<div class="live-codebox glass"><div class="live-label">' + esc(t('live.code')) + '</div><div class="live-code" id="live-code-show" aria-live="polite">' + esc(code) + '</div>' +
      '<div class="live-link"><small>' + esc(t('live.joinLink')) + ':</small> <code id="live-link">' + esc(link) + '</code></div>' +
      '<div class="live-qr" id="live-qr" aria-label="' + esc(t('live.scan')) + '">' + qr + '</div><small>' + esc(t('live.scan')) + '</small>' +
      '<button type="button" class="btn btn-glass btn-sm" data-act="share">' + kit().ico('share') + '<span>' + esc(t('live.share')) + '</span></button></div>' +
      '<div class="live-side glass"><h2>' + esc(t('live.players')) + ' (' + room.players.length + '/' + (cf.maxP || '') + ')</h2>' + playersHtml(room) +
      '<div class="live-sum">' + esc(bn) + ' · ' + esc(t('live.cfg.' + cf.course)) + ' · ' + esc(String(cf.laps)) + ' ' + esc(t('live.cfg.laps').toLowerCase()) + ' · ' + esc(role(room)) + '</div>' +
      (host ? '<button type="button" class="btn btn-primary btn-big" data-act="start"' + (can ? '' : ' disabled') + '>' + kit().ico('play') + '<span>' + esc(t('live.start')) + '</span></button>' +
        (can ? '' : '<div class="live-hint" id="live-few">' + esc(t('live.few')) + '</div>') : '<div class="live-hint">' + esc(t('live.waitHost')) + '</div>') +
      '<button type="button" class="btn btn-glass btn-sm" data-act="leave">' + esc(t('live.leave')) + '</button></div>' +
      '</div>');
  }
  const role = room => t('live.role.' + (room.hostRole === 'watch' ? 'watch' : 'sail'));
  function viewStarting() {
    return shell(t('live.title'), '<div class="live-start glass"><div class="live-count" id="live-count" aria-live="assertive"></div><p class="live-intro">' + esc(t('live.race')) + '</p>' +
      '<button type="button" class="btn btn-glass btn-sm" data-act="leave">' + esc(t('live.leave')) + '</button></div>');
  }
  function fmt(ms) { const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s - m * 60 < 10 ? '0' : '') + (s - m * 60).toFixed(1); }
  function viewResults() {
    const rows = (L.results || []).slice().sort((a, b) => a.place - b.place);
    return shell(t('live.res.title'), '<ol class="live-results glass">' + rows.map(r => '<li><b>' + r.place + '.</b> <span>' + esc(r.name) + '</span> <em>' +
      (r.ms != null ? fmt(r.ms) : esc(t('live.res.dnf'))) + '</em></li>').join('') + '</ol>' +
      '<div class="live-actions"><button type="button" class="btn btn-primary" data-act="entry">' + esc(t('common.ok')) + '</button></div>');
  }

  function render(sec) {
    const v = L.view;
    sec.innerHTML = v === 'setup' ? viewSetup() : v === 'join' ? viewJoin() : v === 'room' && L.room ? viewRoom() : v === 'starting' ? viewStarting() :
      v === 'results' ? viewResults() : v === 'msg' ? viewMsg() : viewEntry();
    sec.setAttribute('data-live-view', v);
    kit().bind(sec, {
      back: () => {
        kit().sfx('click');
        if (L.view === 'entry') { app().back(); return; }
        if (L.view === 'room' || L.view === 'starting') leaveRoom(); else toEntry();
      },
      host: () => { L.hostRole = L.hostRole || 'sail'; if (!L.cfg) L.cfg = defaultCfg(); recheckThen(() => setView('setup')); },
      joinview: () => recheckThen(() => { L.joinErr = ''; L.via = 'code'; setView('join'); }),
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
      share: () => share(),
      leave: () => leaveRoom(),
      retry: () => recheckThen(() => { reset(); setView('entry'); }),
      ai: () => { kit().sfx('click'); reset(); aiRace(); },
      entry: () => toEntry(),
    });
    const inp = sec.querySelector('#live-code');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = sec.querySelector('[data-act="join"]'); if (b) b.click(); } });
  }
  // the results card after a live race: the host gets the rematch button, the others a note (they follow automatically)
  function parked() { return !!(L.sess && L.sess.phase === 'results' && L.sess.state === 'ok'); }
  function decorateResults(card) {
    if (!card || !parked()) return;
    const btn = card.querySelector('[data-act="retry"]');
    if (!btn) return;
    if (L.sess.role === 'host') { btn.setAttribute('data-act', 'rematch'); btn.classList.replace('btn-glass', 'btn-primary'); btn.innerHTML = kit().ico('retry') + '<span>' + esc(t('live.rematch')) + '</span>'; }
    else { btn.insertAdjacentHTML('beforebegin', '<p class="results-locknote live-rematch-wait">' + esc(t('live.rematchWait')) + '</p>'); btn.remove(); }
  }
  function rematch() { if (parked() && L.sess.role === 'host') { lt('rematch'); L.sess.rematch(); } else open(); }
  function recheckThen(fn) {
    KOS.MPStatus.refresh({ force: true }).then(st => {
      L.status = st;
      if (st.mode === 'hidden') unavailable(false);
      else if (st.mode === 'closed') { lt('unavailable', 'closed'); trainerMsg(st.message || t('live.closed'), ['retry', 'ai']); }
      else fn();
    });
  }
  function toEntry() { reset(); L.joinErr = ''; setView('entry'); }
  function leaveRoom() { reset(); setView('entry'); }
  function share() {
    const link = linkFor(L.room.code);
    const done = () => KOS.UI.toast(t('live.copied'), { kind: 'good' });
    try {
      if (root.navigator && root.navigator.share) { root.navigator.share({ title: t('live.title'), url: link }).catch(() => {}); return; }
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(link).then(done, () => {}); return; }
    } catch (e) { /* fall through */ }
    done();
  }

  function open(opts) {
    opts = opts || {};
    reset();
    L.status = opts.status || KOS.MPStatus.cached();
    L.joinErr = ''; L.code = opts.join || ''; L.via = opts.via || 'code';
    L.cfg = L.cfg || defaultCfg();
    L.view = opts.join ? 'join' : 'entry';
    if (L.view === 'entry' && L.status && L.status.mode === 'hidden') { L.view = 'msg'; L.msgText = t('live.unavailable'); L.msgActions = ['retry', 'ai']; lt('unavailable', 'server'); }
    else if (L.view === 'entry' && L.status && (L.status.mode === 'on' || L.status.mode === 'closed')) lt('open', L.status.mode);
    app().show('live', {});
    if (opts.join && opts.auto) autoRejoin(opts.join);
  }

  if (app() && app().registerScreen) app().registerScreen('live', sec => render(sec), () => { if (!L.handoff) reset(); });
  KOS.Lobby = { open, state: L, decorateResults, rematch, leaveParked: () => { if (parked()) reset(); }, _render: render };
})(typeof window !== 'undefined' ? window : globalThis);
