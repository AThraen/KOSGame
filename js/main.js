// KØS SEJL — js/main.js
// Boot: apply settings, start the app on the title screen.
// Debug/test deep links (used by tools/smoke.js):  #screen=garage   #area=race   #play=<activityId>
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  if (typeof document === 'undefined') return;

  function parseHash() {
    const out = {};
    String(root.location.hash || '').replace(/^#/, '').split('&').forEach(kv => {
      if (!kv) return;
      const i = kv.indexOf('=');
      out[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }

  // Startup is two-phase: the core/ui scripts are classic scripts and boot() runs right after them (the title
  // is interactive as soon as they ran); the 12 big mode scripts (js/modes/*.js) are `defer`red - they download in
  // parallel but run later, and the last deferred script (js/modes-ready.js) calls Boot.modesReady().
  // App.show() holds back every screen except the title until then (the hub lists the activities the modes register).
  function boot() {
    if (!KOS.App || !KOS.UI || !KOS.Storage) {
      console.error('[KOS] boot: core shell modules missing');
      return;
    }
    const h = parseHash();
    // #god=1 / #god=0 switches God mode (testing) on or off for this browser
    if (h.god === '1' || h.god === '0') KOS.Storage.setGod(h.god === '1');
    KOS.App.init();
    KOS.App.show('title');
    document.documentElement.classList.add('title-ready');
  }

  function modesReady() {
    if (!KOS.App || !document.documentElement.classList.contains('title-ready')) return;
    const h = parseHash();
    KOS.modesReady = true;
    KOS.App.modesReady(); // plays a screen the player already asked for, or fills in the title
    if (h.play && KOS.Activities && KOS.Activities.get(h.play)) {
      KOS.App.show('title');
      KOS.App.play(h.play, { force: true });
    } else if (h.area) {
      KOS.App.show('title');
      KOS.App.show('area', { area: h.area });
    } else if (h.screen) {
      KOS.App.show('title');
      KOS.App.show(h.screen, {});
    }
    document.documentElement.classList.add('booted');
    if (KOS.Events && KOS.Events.emit) KOS.Events.emit('boot');
  }

  KOS.Boot = { modesReady };
  boot(); // the scripts sit at the end of <body>, so everything boot() needs is already parsed
})(typeof window !== 'undefined' ? window : globalThis);
