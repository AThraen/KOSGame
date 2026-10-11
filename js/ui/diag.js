// KØS SEJL — js/ui/diag.js
// Start-up diagnostics for phones we cannot test on. Loaded first so its clock starts early.
// Switch on with #diag=1 (remembered in localStorage 'kos.diag', so it also works in the home-screen app) and off
// with #diag=0. Shows a small "⏱" pill; tapping it opens a report the player can copy, share or screenshot.
// Marks are always recorded (cheap); the UI, the frame-stall monitor and the JS speed test only run when switched on.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  if (typeof document === 'undefined') return;
  const now = () => (root.performance && performance.now ? performance.now() : Date.now());
  const marks = [];
  const stalls = [];
  const errors = [];
  const info = {};
  let frames = 0, frameT0 = 0, lastFrame = 0, monitorUntil = 0, raf = 0;

  const KEY = 'kos.diag';
  let on = false;
  try {
    const m = /[#&]diag=([01])/.exec(root.location.hash || '');
    if (m) localStorage.setItem(KEY, m[1]);
    on = localStorage.getItem(KEY) === '1';
  } catch (e) { on = /[#&]diag=1/.test(root.location.hash || ''); }

  function mark(name) { marks.push([name, now()]); }

  // frames slower than 150 ms (main thread or GPU busy), watched for a while after start and after each mark('hub ...')
  function watch(ms) {
    monitorUntil = Math.max(monitorUntil, now() + ms);
    if (raf) return;
    const tick = (t) => {
      if (lastFrame) { const d = t - lastFrame; if (d > 150 && !document.hidden) stalls.push([Math.round(lastFrame), Math.round(d)]); }
      if (!frameT0) frameT0 = t;
      frames++; lastFrame = t;
      raf = t < monitorUntil ? requestAnimationFrame(tick) : 0;
      if (!raf) lastFrame = 0;
    };
    raf = requestAnimationFrame(tick);
  }

  // JIT check: ~2-10 ms on a modern phone; Lockdown Mode (no JIT) is typically 10-50x slower
  function bench() {
    const t = now();
    let s = 0;
    for (let i = 1; i < 3e6; i++) s += Math.sqrt(i) * (i & 7);
    const parts = [];
    for (let i = 0; i < 2e4; i++) parts.push('<g x="' + i + '"/>');
    s += parts.join('').length;
    info.benchMs = Math.round(now() - t);
    info.benchSum = s > 0;
  }

  function osVersion() {
    const ua = navigator.userAgent || '';
    const m = /OS (\d+)[_.](\d+)(?:[_.](\d+))? like Mac/.exec(ua) || /Version\/(\d+)\.(\d+)/.exec(ua);
    return m ? m.slice(1).filter(Boolean).join('.') : '?';
  }

  function swVersion() {
    try {
      const c = navigator.serviceWorker && navigator.serviceWorker.controller;
      info.sw = c ? 'controlled' : 'none';
      if (!c) return;
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'version') info.swVersion = e.data.version; });
      c.postMessage({ type: 'version' });
    } catch (e) { info.sw = 'error'; }
  }

  const mq = (q) => { try { return root.matchMedia(q).matches; } catch (e) { return '?'; } };
  const f = (ms) => (ms == null || isNaN(ms) ? '-' : Math.round(ms) + ' ms');

  function report() {
    const L = [];
    const B = KOS.BUILD || {};
    const n = navigator;
    L.push('KØS SEJL diag ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
    L.push('build: ' + (B.version || '?') + ' ' + (B.channel || '') + (B.sha ? ' ' + B.sha : '') + '  sw: ' + (info.sw || '?') + (info.swVersion ? ' ' + info.swVersion : ''));
    L.push('os: ' + osVersion() + '  standalone: ' + !!(n.standalone || mq('(display-mode: standalone)')));
    L.push('ua: ' + n.userAgent);
    L.push('screen: ' + root.innerWidth + 'x' + root.innerHeight + ' @' + root.devicePixelRatio + '  cores: ' + (n.hardwareConcurrency || '?') + '  mem: ' + (n.deviceMemory || '?'));
    L.push('JS speed test: ' + f(info.benchMs) + (info.benchMs > 60 ? '  <-- SLOW (Lockdown Mode / no JIT?)' : ''));
    L.push('WebAssembly: ' + (typeof WebAssembly !== 'undefined' ? 'yes' : 'NO (Lockdown Mode?)'));
    L.push('reduced motion: ' + mq('(prefers-reduced-motion: reduce)') + '  reduced transparency: ' + mq('(prefers-reduced-transparency: reduce)'));
    try {
      const P = KOS.Perf || {};
      const st = (KOS.Storage && KOS.Storage.settings()) || {};
      const H = KOS.Hub && KOS.Hub.lite;
      L.push('perf tier: ' + P.level + ' (guess ' + P.guess + (P.forced != null ? ', forced ' + P.forced : '') + (P.why ? ', ' + P.why : '') + ')');
      L.push('lowFx setting: ' + st.lowFx + '  hub lite: ' + (H ? H.effective() + ' (stored ' + H.stored() + ', weak ' + H.weak() + ')' : '?') + '  tilt: ' + st.tilt);
      const pi = KOS.Hub && KOS.Hub.probeInfo;
      if (pi) L.push('hub probe: first frame ' + f(pi.firstFrameMs) + ', median frame ' + f(pi.medianMs) + (pi.why ? ', lite because ' + pi.why : ''));
    } catch (e) { L.push('state: ' + e.message); }
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav) L.push('page: response ' + f(nav.responseEnd) + ', DOM ready ' + f(nav.domContentLoadedEventEnd) + ', load ' + f(nav.loadEventEnd) + ' (' + (nav.type || '') + ')');
    } catch (e) { /* ignore */ }
    L.push('');
    L.push('timeline (ms since page start):');
    let prev = 0;
    for (const [name, t] of marks) { L.push('  ' + String(Math.round(t)).padStart(6) + '  +' + String(Math.round(t - prev)).padEnd(6) + name); prev = t; }
    L.push('');
    const big = stalls.slice().sort((a, b) => b[1] - a[1]).slice(0, 8);
    L.push('frame stalls > 150 ms: ' + stalls.length + (stalls.length ? ', total ' + Math.round(stalls.reduce((s, x) => s + x[1], 0)) + ' ms' : ''));
    for (const [at, d] of big) L.push('  at ' + at + ': ' + d + ' ms');
    if (frames > 1 && lastFrame) L.push('frames watched: ' + frames + ' (avg ' + Math.round((lastFrame - frameT0) / (frames - 1)) + ' ms)');
    try {
      const res = performance.getEntriesByType('resource').slice().sort((a, b) => b.duration - a.duration).slice(0, 8);
      if (res.length) {
        L.push('');
        L.push('slowest downloads:');
        for (const r of res) L.push('  ' + f(r.duration).padStart(8) + ' @' + Math.round(r.startTime) + '  ' + String(r.name).split('/').slice(-2).join('/') + (r.transferSize === 0 ? ' (cache)' : ''));
      }
    } catch (e) { /* ignore */ }
    if (errors.length) { L.push(''); L.push('errors:'); errors.slice(0, 5).forEach(e => L.push('  ' + e)); }
    return L.join('\n');
  }

  // ------------------------------------------------------------------ UI
  let pill = null, panel = null, pre = null, upd = 0;
  function ui() {
    pill = document.createElement('button');
    pill.type = 'button';
    pill.textContent = '⏱';
    pill.setAttribute('aria-label', 'Diagnose');
    pill.style.cssText = 'position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:99999;width:40px;height:40px;border-radius:20px;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.7);color:#fff;font-size:20px;padding:0';
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;inset:calc(env(safe-area-inset-top,0px) + 8px) 8px calc(env(safe-area-inset-bottom,0px) + 56px) 8px;z-index:99998;display:none;flex-direction:column;background:rgba(0,0,0,.92);color:#e8eef8;border-radius:12px;border:1px solid rgba(255,255,255,.3);font:11px/1.35 ui-monospace,Menlo,monospace';
    pre = document.createElement('pre');
    pre.style.cssText = 'flex:1;margin:0;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;padding:8px;border-top:1px solid rgba(255,255,255,.2)';
    const btn = (txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.style.cssText = 'flex:1;padding:8px 4px;border-radius:8px;border:0;background:#2d6bd0;color:#fff;font:600 13px system-ui'; b.addEventListener('click', fn); bar.appendChild(b); return b; };
    const copy = btn('Kopiér', () => {
      const txt = report();
      const done = () => { copy.textContent = 'Kopieret ✓'; setTimeout(() => { copy.textContent = 'Kopiér'; }, 1500); };
      try { navigator.clipboard.writeText(txt).then(done, () => selectAll()); } catch (e) { selectAll(); }
    });
    if (navigator.share) btn('Del', () => { navigator.share({ title: 'KØS SEJL diag', text: report() }).catch(() => {}); });
    btn('Luk', () => toggle(false));
    btn('Slå fra', () => { try { localStorage.setItem(KEY, '0'); } catch (e) { /* ignore */ } toggle(false); pill.remove(); panel.remove(); });
    panel.appendChild(pre); panel.appendChild(bar);
    // the game's pointer handlers must not see taps on the diag UI
    [pill, panel].forEach(el => ['pointerdown', 'touchstart', 'mousedown', 'click', 'wheel'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation(), { passive: true })));
    pill.addEventListener('click', () => toggle());
    document.body.appendChild(panel);
    document.body.appendChild(pill);
  }
  function selectAll() { try { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* ignore */ } }
  function toggle(show) {
    const vis = show == null ? panel.style.display === 'none' : show;
    panel.style.display = vis ? 'flex' : 'none';
    clearInterval(upd);
    if (vis) { pre.textContent = report(); upd = setInterval(() => { if (!getSelection().toString()) pre.textContent = report(); }, 1000); }
  }

  root.addEventListener('error', (e) => { errors.push((e.message || 'error') + ' ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '')); });
  root.addEventListener('unhandledrejection', (e) => { errors.push('promise: ' + String(e.reason && (e.reason.message || e.reason))); });

  KOS.Diag = {
    get on() { return on; },
    mark(name) { mark(name); if (on && /^hub /.test(name)) watch(20000); },
    report,
  };

  mark('diag.js (first script)');
  if (on) {
    watch(30000);
    document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'));
    root.addEventListener('load', () => {
      mark('window load');
      swVersion();
      setTimeout(bench, 300); // after the first screen is up, so the test itself does not slow the start
    });
    if (document.body) ui(); else document.addEventListener('DOMContentLoaded', ui);
  }
})(typeof window !== 'undefined' ? window : globalThis);
