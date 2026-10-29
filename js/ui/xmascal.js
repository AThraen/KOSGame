// KØS SEJL — js/ui/xmascal.js
// The Julekalender screen (issue #6, docs/superpowers/specs/2026-10-29-christmas-calendar-design.md 4.1-4.3, 9).
// KOS.Xmas (js/ui/xmas.js) owns the data and the saved state; this file is only the UI on top of it:
//   - screen 'xmas' (#screen-xmas, deep link #screen=xmas): a winter boat-shed wall with 24 doors, the tree panel,
//     the "Nisse-jagt X/24" chip + elf gallery, and in God mode a dev bar (◀ dag ▶ steps the test date, Nulstil jul)
//   - the door card (coach in a Santa hat, Spil / Senere, the day's elf hint); Spil = KOS.App.play(act, {force, from: 'xmas'})
//   - elves: KOS.XmasCal.elfHtml(n) is a hidden elf button any screen can drop in; one delegated click handler finds it
//   - KOS.XmasCal.status() is the one-line state ("Låge 5 er klar!") the hub pin and the header share
// Every date comes from KOS.Season.now() (honours the God-mode test date), never new Date().
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  if (typeof document === 'undefined') return;
  const doc = document;

  // ------------------------------------------------------------------ strings
  KOS.I18n.add('da', {
    xcal: {
      title: 'Julekalender',
      pin: 'Julekalender',
      ready: 'Låge {n} er klar!',
      opens: 'Åbner 1. dec',
      allOpen: 'Alle låger åbne',
      progress: '{n}/24 låger åbnet',
      closed: 'Julekalenderen er lukket. Vi ses til jul!',
      door: 'Låge {n}',
      doorLocked: 'Låge {n} – åbner om {d} dage',
      doorLocked1: 'Låge {n} – åbner i morgen',
      doorReady: 'Låge {n} – klar til at blive åbnet',
      doorOpen: 'Låge {n} – åbnet',
      doorGold: 'Låge {n} – guldkugle',
      inDays: 'Låge {n} åbner om {d} dage',
      tomorrow: 'Låge {n} åbner i morgen',
      teaserToast: 'Julekalenderen åbner 1. december. Glæd dig!',
      play: 'Spil', later: 'Senere',
      goldNote: 'Klar opgaven, så bliver kuglen af guld!',
      isGold: 'Guldkugle! Flot klaret.',
      hint: 'Nisse-jagt',
      tree: 'Juletræet',
      baubles: '{n}/24 kugler',
      gold: '{n} af guld',
      star: 'Stjernen er på!',
      elves: 'Nisse-jagt',
      elvesChip: 'Nisse-jagt {n}/24',
      gallery: 'Nisse-jagt',
      galleryLead: 'Find dagens nisse – lågens tip viser hvor. {n}/24 fundet.',
      unknown: '?',
      found: 'Du fandt {name}! ({n}/24)',
      elfAria: 'En nisse gemmer sig her',
      toast: 'Julekalenderen er åben! Find den på kortet ved havnen.',
      coachReady: 'Låge {n} er klar! Kom og åbn den i julekalenderen.',
      back: 'Julekalender',
      testDate: 'Testdato: {d}',
      dev: { prev: 'En dag tilbage', next: 'En dag frem', day: 'dag', reset: 'Nulstil jul', resetDone: 'Julekalenderen er nulstillet' },
    },
  });
  KOS.I18n.add('en', {
    xcal: {
      title: 'Christmas calendar',
      pin: 'Christmas calendar',
      ready: 'Door {n} is ready!',
      opens: 'Opens 1 Dec',
      allOpen: 'All doors open',
      progress: '{n}/24 doors opened',
      closed: 'The Christmas calendar is closed. See you at Christmas!',
      door: 'Door {n}',
      doorLocked: 'Door {n} – opens in {d} days',
      doorLocked1: 'Door {n} – opens tomorrow',
      doorReady: 'Door {n} – ready to open',
      doorOpen: 'Door {n} – opened',
      doorGold: 'Door {n} – gold bauble',
      inDays: 'Door {n} opens in {d} days',
      tomorrow: 'Door {n} opens tomorrow',
      teaserToast: 'The Christmas calendar opens on 1 December. Not long now!',
      play: 'Play', later: 'Later',
      goldNote: 'Finish the task and the bauble turns gold!',
      isGold: 'Gold bauble! Well done.',
      hint: 'Elf hunt',
      tree: 'The Christmas tree',
      baubles: '{n}/24 baubles',
      gold: '{n} gold',
      star: 'The star is on!',
      elves: 'Elf hunt',
      elvesChip: 'Elf hunt {n}/24',
      gallery: 'Elf hunt',
      galleryLead: 'Find each day’s elf – the door’s tip says where. {n}/24 found.',
      unknown: '?',
      found: 'You found {name}! ({n}/24)',
      elfAria: 'An elf is hiding here',
      toast: 'The Christmas calendar is open! Find it on the map by the harbour.',
      coachReady: 'Door {n} is ready! Come and open it in the Christmas calendar.',
      back: 'Calendar',
      testDate: 'Test date: {d}',
      dev: { prev: 'One day back', next: 'One day on', day: 'day', reset: 'Reset Christmas', resetDone: 'The Christmas calendar has been reset' },
    },
  });

  const t = (k, v) => KOS.t(k, v);
  const tt = o => KOS.tt(o);
  const X = () => KOS.Xmas;
  const A = () => KOS.XmasArt;
  const UI = () => KOS.UI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = (n, c) => (UI() && UI().iconSvg ? UI().iconSvg(n, c) : '');
  const sfx = (n, o) => { try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(n, o); } catch (e) { /* optional */ } };
  const now = () => (KOS.Season && KOS.Season.now ? KOS.Season.now() : new Date());
  const reduced = () => { try { return !!(UI() && UI().reduced && UI().reduced()); } catch (e) { return false; } };
  const god = () => { try { return !!(KOS.Storage && KOS.Storage.god && KOS.Storage.god()); } catch (e) { return false; } };
  const locale = () => (KOS.I18n && KOS.I18n.lang === 'en' ? 'en-GB' : 'da-DK');
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // the calendar exists at all (season window open, or forced with #xmas=1)
  const live = () => !!(X() && A() && KOS.Season && KOS.Season.active('xmas'));

  // door n -> 'locked' | 'ready' | 'open' | 'gold'
  function doorState(n, info) {
    const x = X();
    if (x.isGold(n)) return 'gold';
    if (x.isOpen(n)) return 'open';
    return (info || x.dayInfo()).openable.indexOf(n) >= 0 ? 'ready' : 'locked';
  }
  // baubles per door for KOS.XmasArt.tree: 0 empty, 1 silver, 2 gold
  function baubles() { const x = X(); const b = []; for (let n = 1; n <= x.N; n++) b.push(x.isGold(n) ? 2 : x.isOpen(n) ? 1 : 0); return b; }

  // one line about where the calendar is: the hub pin's subline and the screen's header
  function status() {
    const x = X(), info = x.dayInfo();
    if (info.phase === 'teaser') return t('xcal.opens');
    if (info.phase === 'advent') {
      if (!x.isOpen(info.today)) return t('xcal.ready', { n: info.today });
      const missed = info.openable.filter(n => !x.isOpen(n));
      return missed.length ? t('xcal.ready', { n: missed[missed.length - 1] }) : t('xcal.progress', { n: x.counts().open });
    }
    if (info.phase === 'after') return t('xcal.allOpen');
    return t('xcal.closed');
  }
  // a door is waiting: the pin glows
  function hasReady() { const x = X(), info = x.dayInfo(); return info.openable.some(n => !x.isOpen(n)); }

  // the "Testdato: 13. dec" pill (God-mode test date in effect), '' otherwise
  function testPill(cls) {
    const o = KOS.Season && KOS.Season.dateOverride && KOS.Season.dateOverride();
    if (!o) return '';
    const p = o.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    const label = d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: d.getFullYear() === 2026 ? undefined : 'numeric' });
    return '<span class="xc-testdate' + (cls ? ' ' + cls : '') + '" role="note">' + ico('calendar') + '<span>' + esc(t('xcal.testDate', { d: label })) + '</span></span>';
  }

  // a coach portrait with a Santa hat (falls back to the plain portrait)
  function hatCoach(id, mood) {
    const svg = UI() && UI().coachSvg ? UI().coachSvg(mood, id) : '';
    return A() && A().hatCoach ? A().hatCoach(svg, id) : svg;
  }

  // ------------------------------------------------------------------ elves (any screen)
  // A hidden elf: an absolutely placed button (style = its position). '' when elf n is not out (door not opened, already
  // found, season over). The click is handled once, document-wide, so a screen only has to drop the markup in.
  function elfHtml(n, style, cls) {
    const x = X();
    if (!x || !A() || !x.isElfVisible(n)) return '';
    return '<button type="button" class="xmas-elf' + (cls ? ' ' + cls : '') + '" data-xmas-elf="' + n + '" style="' + (style || '') + '" aria-label="' + esc(t('xcal.elfAria')) + '">' + A().elf(n - 1) + '</button>';
  }
  // the elves that hide on one screen spot type: ELVES whose spot matches (screen, and id/act/area when given)
  function elvesAt(screen, key, val) {
    const x = X();
    if (!x) return [];
    return x.ELVES.filter(e => e.spot && e.spot.screen === screen && (!key || e.spot[key] === val)).map(e => e.n);
  }
  function onElfClick(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-xmas-elf]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const n = +b.getAttribute('data-xmas-elf'), x = X();
    if (!x || b.classList.contains('is-found')) return;
    if (!x.findElf(n)) { b.remove(); return; }
    sfx('pop', { pitch: 1.3 }); setTimeout(() => sfx('bell', { vol: 0.6 }), 90);
    b.classList.add('is-found');
    b.disabled = true;
    setTimeout(() => b.remove(), reduced() ? 50 : 700);
    const el = x.elf(n);
    if (UI()) UI().toast(t('xcal.found', { name: el ? el.name : '', n: x.counts().elves }), { kind: 'good', icon: 'sparkle', ms: 3600, sound: false });
  }
  doc.addEventListener('click', onElfClick, true);

  // ------------------------------------------------------------------ elf gallery
  function gallery() {
    const x = X();
    if (!x || !UI()) return;
    const found = x.counts().elves;
    const body = '<p class="xc-gal-lead">' + esc(t('xcal.galleryLead', { n: found })) + '</p><div class="xc-gal">' +
      x.ELVES.map(e => {
        const has = x.isFound(e.n);
        return '<button type="button" class="xc-gslot' + (has ? ' has' : '') + '" data-elf="' + e.n + '"' + (has ? '' : ' disabled') + ' aria-label="' + esc(has ? e.name : t('xcal.unknown')) + '">' +
          '<span class="xc-gnum">' + e.n + '</span>' + (has ? A().elf(e.n - 1) : A().elfSilhouette()) +
          '<span class="xc-gname">' + esc(has ? e.name : t('xcal.unknown')) + '</span></button>';
      }).join('') + '</div><p class="xc-gtag" aria-live="polite"></p>';
    const d = UI().dialog({ title: t('xcal.gallery'), body, cls: 'xc-gal-dlg', buttons: [{ labelKey: 'common.ok', kind: 'primary' }] });
    if (!d) return;
    const tag = d.el.querySelector('.xc-gtag');
    d.el.querySelector('.xc-gal').addEventListener('click', ev => {
      const s = ev.target.closest('.xc-gslot.has');
      if (!s) return;
      const el = x.elf(+s.getAttribute('data-elf'));
      sfx('tap');
      d.el.querySelectorAll('.xc-gslot.on').forEach(o => o.classList.remove('on'));
      s.classList.add('on');
      tag.innerHTML = '<b>' + esc(el.name) + '</b> – ' + esc(tt(el.tag));
    });
  }
  function chipHtml(cls) {
    const x = X();
    return '<button type="button" class="xc-chip' + (cls ? ' ' + cls : '') + '" data-act="xmas-elves" aria-label="' + esc(t('xcal.elvesChip', { n: x.counts().elves })) + '">' +
      '<span class="xc-chip-elf">' + A().elf(1) + '</span><span class="xc-chip-txt"><small>' + esc(t('xcal.elves')) + '</small><b>' + x.counts().elves + '/24</b></span></button>';
  }

  // ------------------------------------------------------------------ door card
  function doorCard(n) {
    const x = X(), d = x.door(n);
    if (!d || !UI()) return;
    const st = doorState(n);
    const el = x.elf(n);
    const act = KOS.Activities && KOS.Activities.get(d.act);
    const body = '<div class="xc-card">' +
      '<div class="xc-card-coach">' + hatCoach(d.coach) + '</div>' +
      '<div class="xc-card-main"><div class="xc-card-who">' + esc(UI().coachName ? UI().coachName(d.coach) : '') + '</div>' +
      '<p class="xc-card-text">' + esc(tt(d.text)) + '</p>' +
      '<p class="xc-card-gold' + (st === 'gold' ? ' is-gold' : '') + '">' + A().svg.star.replace('class="xa-star"', 'class="xa-star xc-mini"') + '<span>' + esc(t(st === 'gold' ? 'xcal.isGold' : 'xcal.goldNote')) + '</span></p></div></div>' +
      (el ? '<div class="xc-hint">' + (x.isFound(n) ? A().elf(n - 1) : A().elfSilhouette()) + '<p><b>' + esc(t('xcal.hint')) + ':</b> ' + esc(tt(d.hint)) + '</p></div>' : '');
    UI().dialog({
      title: t('xcal.door', { n }) + ': ' + tt(d.title), body, cls: 'xc-card-dlg',
      buttons: [{ label: t('xcal.later') }, {
        label: t('xcal.play'), kind: 'primary', icon: 'play',
        onClick: () => { setTimeout(() => { if (KOS.App) KOS.App.play(d.act, { force: true, from: 'xmas', day: n }); }, 0); },
      }],
    });
    if (!act) { const b = doc.querySelector('.xc-card-dlg .btn-primary'); if (b) b.disabled = true; }
  }

  // ------------------------------------------------------------------ the screen
  let cur = null; // {sec, off[]} while the screen is up

  function doorInner(n) {
    const d = X().door(n), U = UI();
    const body = U && U.icons && U.icons[d.icon];
    if (!body) return A().present('gold').replace('<svg class="xa-present"', '<svg x="16" y="20" width="28" height="30"');
    return '<svg x="17" y="21" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffd98a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="#ffd98a">' + body + '</svg>';
  }
  function doorBtn(n, info) {
    const st = doorState(n, info);
    const label = st === 'locked' ? (X().daysUntil(n) === 1 ? t('xcal.doorLocked1', { n }) : t('xcal.doorLocked', { n, d: X().daysUntil(n) == null ? '?' : X().daysUntil(n) }))
      : st === 'ready' ? t('xcal.doorReady', { n }) : st === 'gold' ? t('xcal.doorGold', { n }) : t('xcal.doorOpen', { n });
    return '<button type="button" class="xc-door is-' + st + (info.today === n ? ' is-today' : '') + '" data-door="' + n + '" aria-label="' + esc(label + (st === 'open' || st === 'gold' ? ': ' + tt(X().door(n).title) : '')) + '">' +
      A().door(n, st, st === 'open' || st === 'gold' ? doorInner(n) : '') + '</button>';
  }

  function render(sec) {
    leave();
    sec.classList.add('xmas-screen');
    const x = X();
    if (!live()) {
      sec.innerHTML = KOS.App.kit.header(t('xcal.title'), '', '') +
        '<div class="scroll center"><div class="xc-closed glass">' + (A() ? A().tree(baubles(), { cls: 'xc-closed-tree' }) : '') + '<p>' + esc(t('xcal.closed')) + '</p></div></div>';
      KOS.App.kit.bind(sec, { back: () => { sfx('click'); KOS.App.back(); } });
      return;
    }
    x.registerBadges();
    const info = x.dayInfo();
    const c = x.counts();
    const elvesHere = elvesAt('calendar');
    sec.innerHTML = KOS.App.kit.header(t('xcal.title'), '<span class="xc-status">' + esc(status()) + '</span>', chipHtml()) +
      '<div class="xc-body">' +
      '<div class="xc-wall"><div class="xc-lights" aria-hidden="true"></div><div class="xc-grid" role="group" aria-label="' + esc(t('xcal.title')) + '">' +
      x.WALL.map(n => doorBtn(n, info)).join('') + '</div></div>' +
      '<aside class="xc-side">' + (elvesHere[0] ? elfHtml(elvesHere[0], '', 'xc-elf-a') : '') +
      '<div class="xc-tree">' + A().tree(baubles()) + (elvesHere[1] ? elfHtml(elvesHere[1], '', 'xc-elf-b') : '') + '</div>' +
      '<div class="xc-info"><b class="xc-info-t">' + esc(t('xcal.tree')) + '</b>' +
      '<span>' + esc(t('xcal.baubles', { n: c.open })) + (c.gold ? ' · ' + esc(t('xcal.gold', { n: c.gold })) : '') + '</span>' +
      (x.isOpen(24) ? '<span class="xc-star-note">' + esc(t('xcal.star')) + '</span>' : '') +
      testPill() + (god() ? devBar() : '') + '</div>' +
      '</aside></div>';
    const off = [];
    const onClick = e => {
      const dEl = e.target.closest('[data-door]');
      if (dEl) { tapDoor(+dEl.getAttribute('data-door'), dEl); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.getAttribute('data-act');
      if (act === 'back') { sfx('click'); KOS.App.back(); }
      else if (act === 'xmas-elves') { sfx('click'); gallery(); }
      else if (act === 'xc-prev' || act === 'xc-next') { sfx('click'); stepDay(act === 'xc-prev' ? -1 : 1); }
      else if (act === 'xc-reset') { sfx('click'); x.reset(); UI().toast(t('xcal.dev.resetDone'), { kind: 'info', icon: 'retry' }); KOS.App.refresh(); }
    };
    sec.addEventListener('click', onClick);
    off.push(() => sec.removeEventListener('click', onClick));
    const fitNow = () => fit(sec);
    root.addEventListener('resize', fitNow);
    off.push(() => root.removeEventListener('resize', fitNow));
    // a found elf, a gold bauble (God-mode win) or a language switch: update in place
    const onX = () => { if (cur && cur.sec === sec) softRefresh(sec); };
    if (KOS.Events && KOS.Events.on) {
      KOS.Events.on('xmas', onX); off.push(() => KOS.Events.off && KOS.Events.off('xmas', onX));
      const onLang = () => { if (KOS.App.cur === 'xmas') KOS.App.refresh(); };
      KOS.Events.on('lang', onLang); off.push(() => KOS.Events.off && KOS.Events.off('lang', onLang));
    }
    cur = { sec, off };
    fit(sec);
    requestAnimationFrame(() => fit(sec));
  }
  function leave() {
    if (!cur) return;
    cur.off.forEach(f => f());
    cur.sec.classList.remove('xmas-screen');
    cur = null;
  }
  // chip, counts, tree and door states without rebuilding (keeps focus and the enter animation)
  function softRefresh(sec) {
    const x = X(), info = x.dayInfo();
    if (!cur) return;
    const chip = sec.querySelector('.xc-chip');
    if (chip) chip.outerHTML = chipHtml();
    const st = sec.querySelector('.xc-status'); if (st) st.textContent = status();
    const tr = sec.querySelector('.xc-tree .xa-tree:not(.xa-elf)'); if (tr) tr.outerHTML = A().tree(baubles());
    sec.querySelectorAll('.xc-door').forEach(b => {
      const n = +b.getAttribute('data-door');
      if (n === cur.opening) return; // mid swing: tapDoor redraws it
      if (!b.classList.contains('is-' + doorState(n, info))) b.outerHTML = doorBtn(n, info);
    });
    // a door just opened lets its calendar elf out (elf a beside the tree panel, elf b behind the tree)
    elvesAt('calendar').forEach((n, i) => {
      if (sec.querySelector('[data-xmas-elf="' + n + '"]')) return;
      const host = sec.querySelector(i ? '.xc-tree' : '.xc-side');
      if (host) host.insertAdjacentHTML('afterbegin', elfHtml(n, '', i ? 'xc-elf-b' : 'xc-elf-a'));
    });
    const c = x.counts(), inf = sec.querySelector('.xc-info span');
    if (inf) inf.textContent = t('xcal.baubles', { n: c.open }) + (c.gold ? ' · ' + t('xcal.gold', { n: c.gold }) : '');
  }

  function tapDoor(n, btn) {
    const x = X(), st = doorState(n);
    if (st === 'locked') {
      sfx('bump');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      const d = x.daysUntil(n);
      UI().toast(d === 1 ? t('xcal.tomorrow', { n }) : d ? t('xcal.inDays', { n, d }) : t('xcal.teaserToast'), { kind: 'info', icon: 'lock', sound: false });
      return;
    }
    if (st === 'ready') {
      if (!x.openDoor(n)) return;
      sfx('bell'); setTimeout(() => sfx('star', { pitch: 1.2 }), 160);
      const info = x.dayInfo();
      if (reduced()) { btn.outerHTML = doorBtn(n, info); doorCard(n); return; }
      btn.classList.add('is-opening');
      const c = cur;
      c.opening = n;
      setTimeout(() => {
        if (cur !== c) return; // left the screen meanwhile
        c.opening = 0;
        const ob = c.sec.querySelector('.xc-door[data-door="' + n + '"]');
        if (ob) ob.outerHTML = doorBtn(n, info);
        const nb = c.sec.querySelector('.xc-door[data-door="' + n + '"]');
        if (nb) nb.classList.add('just-opened');
        doorCard(n);
      }, 420);
      return;
    }
    sfx('click');
    doorCard(n);
  }

  // God mode: step the test date one day and re-render (#date=YYYY-MM-DD does the same through the URL)
  function stepDay(k) {
    const d = now();
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, 12);
    KOS.Season.setDateOverride(ymd(n));
    KOS.Season.mark();
    KOS.App.refresh();
  }
  function devBar() {
    return '<div class="xc-dev" role="group" aria-label="God mode">' +
      '<button type="button" class="xc-dev-btn" data-act="xc-prev" aria-label="' + esc(t('xcal.dev.prev')) + '">' + ico('back') + '</button>' +
      '<span class="xc-dev-day">' + esc(t('xcal.dev.day')) + ' ' + (X().dayInfo().today || '–') + '</span>' +
      '<button type="button" class="xc-dev-btn" data-act="xc-next" aria-label="' + esc(t('xcal.dev.next')) + '">' + ico('forward') + '</button>' +
      '<button type="button" class="xc-dev-btn xc-dev-reset" data-act="xc-reset" title="' + esc(t('xcal.dev.reset')) + '">' + ico('retry') + '<span>' + esc(t('xcal.dev.reset')) + '</span></button></div>';
  }

  // size the doors so the whole wall fits the space it has: 4x6 on phones, 6x4 or 8x3 when wide. Below 46 px a door
  // would be too small to tap, so the wall keeps that size and the page scrolls (320x568).
  function fit(sec) {
    const body = sec.querySelector('.xc-body'), wall = sec.querySelector('.xc-wall'), grid = sec.querySelector('.xc-grid');
    if (!body || !wall || !grid) return;
    const r = body.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const land = r.width > r.height * 1.15;
    body.classList.toggle('is-land', land);
    const side = sec.querySelector('.xc-side');
    const sr = side.getBoundingClientRect();
    const W = (land ? r.width - sr.width - 12 : r.width) - 20, H = (land ? r.height : r.height - sr.height - 10) - 30; // wall padding + lights
    const gap = 6, ar = 72 / 60;
    let best = null;
    [[4, 6], [6, 4], [8, 3], [3, 8]].forEach(([c, rows]) => {
      const d = Math.min((W - gap * (c - 1)) / c, (H - gap * (rows - 1)) / rows / ar);
      if (!best || d > best.d) best = { c, d };
    });
    const scroll = best.d < 46;
    if (scroll) best = { c: land ? 8 : 4, d: Math.min(80, (W - gap * ((land ? 8 : 4) - 1)) / (land ? 8 : 4)) }; // too small to tap: a wall as wide as the screen, and the page scrolls
    const d = Math.max(40, Math.min(132, Math.floor(best.d)));
    grid.style.setProperty('--cols', best.c);
    grid.style.setProperty('--d', d + 'px');
    body.classList.toggle('is-scroll', scroll);
  }

  // ------------------------------------------------------------------ results: a hidden elf after its activity, and the way back
  function decorateResults(card, act, fromXmas) {
    if (!X() || !card) return;
    if (fromXmas) {
      const mb = card.querySelector('[data-act="map"]');
      if (mb) mb.innerHTML = ico('calendar') + '<span>' + esc(t('xcal.back')) + '</span>';
    }
    const n = elvesAt('results', 'act', act && act.id).find(k => X().isElfVisible(k));
    if (n) { card.style.position = 'relative'; card.insertAdjacentHTML('beforeend', elfHtml(n, '', 'xc-elf-results')); }
  }

  KOS.App.registerScreen('xmas', render, leave);
  // the badges show in the passport once the calendar is (or was) in play
  try { if (live() || X().counts().open) X().registerBadges(); } catch (e) { /* storage not ready */ }
  KOS.XmasCal = { live, status, hasReady, testPill, hatCoach, elfHtml, elvesAt, gallery, chipHtml, doorCard, decorateResults, doorState, baubles, fit };
})(typeof window !== 'undefined' ? window : globalThis);
