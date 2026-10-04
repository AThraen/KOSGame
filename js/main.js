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

  function boot() {
    if (!KOS.App || !KOS.UI || !KOS.Storage) {
      console.error('[KOS] boot: core shell modules missing');
      return;
    }
    KOS.App.init();
    const h = parseHash();
    if (h.play && KOS.Activities && KOS.Activities.get(h.play)) {
      KOS.App.show('title');
      KOS.App.play(h.play, { force: true });
    } else if (h.area) {
      KOS.App.show('title');
      KOS.App.show('area', { area: h.area });
    } else if (h.screen) {
      KOS.App.show('title');
      KOS.App.show(h.screen, {});
    } else {
      KOS.App.show('title');
    }
    document.documentElement.classList.add('booted');
    if (KOS.Events && KOS.Events.emit) KOS.Events.emit('boot');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
