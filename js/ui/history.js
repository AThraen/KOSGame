// KØS SEJL — js/ui/history.js
// KOS.Nav: the browser / Android / iOS-swipe back button navigates inside the app instead of leaving the site.
//
// Model: the app has a "depth" = how many back steps it takes to reach the title screen with nothing open
// (screens on KOS.App.stack, open KOS.UI dialogs, the hub's place list, a live-lobby sub view). KOS.Nav keeps exactly that
// many same-URL history entries above the page's own entry (state {kosNav: i}, the URL, hash and query are never touched):
//   - deeper (a screen or overlay opened)     -> history.pushState one entry per level
//   - shallower (closed by its own button)    -> history.go(-n), guarded, so the entries never drift from the app
//   - a popstate that went back (back button) -> ONE app back action (close the top dialog / pause or resume a run /
//                                                the screen's own back), then re-sync (a run keeps its entry: back toggles pause)
//   - forward                                  -> just re-sync (nothing is re-done)
// At the title with nothing open the depth is 0, so back leaves the site normally. After a reload history.state may
// still point at a deep entry: the first sync walks back to the page's own entry.
// A run is never abandoned by back: it opens the pause card (a live race: the leave card, the race keeps running).
// Leaving a live lobby with a session or live results asks first.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  if (typeof document === 'undefined' || !root.history || !root.history.pushState) return;
  const doc = document, H = root.history;
  const MAX = 30;

  let pos = 0;          // our idea of which kosNav index the browser is on
  let busy = false;     // a history.go() of ours is in flight; its popstate is not a user back
  let busyT = 0;
  let queued = false;
  let backing = false;  // inside a back action (its own sync calls are coalesced)

  const idxOf = s => (s && typeof s.kosNav === 'number' && s.kosNav >= 0 ? s.kosNav : null);
  const stateWith = i => Object.assign({}, H.state && typeof H.state === 'object' ? H.state : {}, { kosNav: i });
  const App = () => KOS.App;
  const UI = () => KOS.UI;

  // ---- how many back steps the app is away from the bare title screen
  function screenDepth() {
    const A = App();
    if (!A || !A.cur || A.cur === 'title') return 0;
    const st = A.stack || [];
    let n = 0;
    for (let i = st.length - 1; i >= 0; i--) { n++; if (st[i].screen === 'title') return n; }
    return n + 1; // App.back() on an empty stack goes to the title
  }
  function placesOpen() { const A = App(); return !!(A && A.cur === 'hub' && doc.querySelector('#screen-hub .hub-places')); }
  function lobbySub() { const A = App(), L = KOS.Lobby && KOS.Lobby.state; return !!(A && A.cur === 'live' && L && L.view && L.view !== 'entry'); }
  function depth() {
    let d = screenDepth();
    try { d += (UI() && UI().dialogCount) ? UI().dialogCount() : (UI() && UI().topDialog && UI().topDialog() ? 1 : 0); } catch (e) { /* ignore */ }
    if (placesOpen()) d++;
    if (lobbySub()) d++;
    return Math.min(MAX, d);
  }

  // ---- keep the history entries in step with the app
  function sync() {
    queued = false;
    if (busy || backing) return;
    const want = depth();
    try {
      if (want > pos) { while (pos < want) { pos++; H.pushState(stateWith(pos), ''); } }
      else if (want < pos) {
        busy = true;
        clearTimeout(busyT);
        busyT = setTimeout(settle, 1500); // safety net: never stay busy if the popstate does not come
        H.go(want - pos);
      }
    } catch (e) { busy = false; }
  }
  function schedule() { if (queued) return; queued = true; Promise.resolve().then(sync); }
  function settle() { busy = false; const i = idxOf(H.state); pos = i == null ? 0 : i; schedule(); }

  function onPop(e) {
    const i = idxOf(e.state);
    if (busy) { clearTimeout(busyT); busy = false; pos = i == null ? 0 : i; schedule(); return; }
    if (i == null) { // a foreign entry (a hash typed in the address bar): it becomes the new bottom
      try { H.replaceState(stateWith(0), ''); } catch (err) { /* ignore */ }
      pos = 0; schedule(); return;
    }
    const wentBack = i < pos;
    pos = i;
    if (wentBack) {
      backing = true;
      try { backAction(); } catch (err) { console.error('[KOS.Nav]', err); }
      backing = false;
    }
    schedule();
  }

  // ---- what one press of back does (mirrors Escape in js/ui/app.js)
  function closeTopDialog() {
    const d = UI() && UI().topDialog && UI().topDialog();
    if (!d) return false;
    if (d.dismissable) d.close();
    return true; // a dialog that must be answered stays (back does nothing else)
  }
  function confirmLeave(onLeave) {
    UI().dialog({ icon: 'flag', titleKey: 'app.nav.leaveTitle', bodyKey: 'app.nav.leaveBody', cls: 'nav-leave',
      buttons: [{ labelKey: 'app.nav.stay', kind: 'primary' }, { labelKey: 'app.nav.leave', kind: 'danger', onClick: () => { setTimeout(onLeave, 0); } }] });
  }
  function clickIn(sel) { const b = doc.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; }
  function backAction() {
    const A = App();
    if (!A || !A.cur) return;
    const run = A.run || {};
    if (A.cur === 'play') {
      if (closeTopDialog()) return;
      // a run: back opens the pause card (live race: the leave card; the race keeps running), back again resumes
      if (run.running && !run.finished && A.setPaused) A.setPaused(!run.paused);
      return; // a finishing / crashed run: nothing (its own buttons lead on)
    }
    if (closeTopDialog()) return;
    if (A.cur === 'hub' && placesOpen()) { if (!clickIn('#screen-hub [data-act="places-close"]')) { const p = doc.querySelector('#screen-hub .hub-places'); if (p) p.remove(); } return; }
    if (A.cur === 'title') return;
    const live = KOS.Lobby && KOS.Lobby.state;
    if (A.cur === 'results' && run.lastResult && run.lastResult.activity && run.lastResult.activity.liveRace) {
      confirmLeave(() => { if (!clickIn('#screen-results [data-act="map"]')) A.back(); });
      return;
    }
    if (A.cur === 'live' && live && live.sess) {
      confirmLeave(() => { if (A.cur === 'live' && !clickIn('#screen-live [data-act="leave"]')) clickIn('#screen-live .screen-head [data-act="back"]'); });
      return;
    }
    // every other screen: its own header back button (keeps per-screen rules like the lobby's sub views), else App.back()
    if (clickIn('#screen-' + A.cur + ' .screen-head [data-act="back"]')) return;
    A.back();
  }

  // ---- start: normalise a stale state after a reload, then follow the app
  (function init() {
    const i = idxOf(H.state);
    if (i == null) { try { H.replaceState(stateWith(0), ''); } catch (e) { /* ignore */ } pos = 0; }
    else pos = i; // a reload on a deep entry: the first sync (title, depth 0) walks back to the page's own entry
    root.addEventListener('popstate', onPop);
    const E = KOS.Events;
    if (E && E.on) { E.on('screen', schedule); E.on('dialog', schedule); }
    // anything a tap or key changes (the hub's place list, lobby views) is picked up right after the handlers ran
    doc.addEventListener('keydown', () => setTimeout(schedule, 0), true);
    doc.addEventListener('click', () => setTimeout(schedule, 0), true);
  })();

  KOS.Nav = { sync: schedule, depth, get pos() { return pos; }, get busy() { return busy; }, _back: backAction };
})(typeof window !== 'undefined' ? window : globalThis);
