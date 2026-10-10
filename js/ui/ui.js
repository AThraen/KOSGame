// KØS SEJL — js/ui/ui.js
// KOS.UI: toasts, dialogs, coach bubbles (the real KØS coaches), HUD, countdown, stars, confetti, line icons, results card,
// and the player avatar SVG. See SPEC.md.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const t = (k, v) => (KOS.t ? KOS.t(k, v) : k);
  const doc = root.document;

  function sfx(name, opts) {
    try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(name, opts); } catch (e) { /* audio optional */ }
  }
  function reduced() {
    try {
      if (KOS.Storage && KOS.Storage.settings().reducedMotion) return true;
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function loc() { return KOS.I18n && KOS.I18n.lang === 'en' ? 'en-GB' : 'da-DK'; }
  function el(tag, cls, html) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ------------------------------------------------------------------ icons (24×24, stroke = currentColor)
  const ICONS = {
    play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    forward: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    house: '<path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-5h5v5"/><path d="M15.5 6V3.5h2.5v4.5"/>',
    tilt: '<path d="M6.5 11.5h12L21 18H3.5z"/><path d="M12.5 11.5V4.2"/><path d="M12.5 4.8l4.2 5.2h-4.2z" fill="currentColor" stroke-linejoin="round"/>',
    map: '<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
    star: '<path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9L12 3.2z" fill="currentColor" stroke-linejoin="round"/>',
    starOutline: '<path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9L12 3.2z" stroke-linejoin="round"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    retry: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5V9h4.5"/>',
    next: '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 13v4M8.5 20.5h7M9.5 20.5c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5"/>',
    medal: '<path d="M8 3l2.5 6M16 3l-2.5 6"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" fill="currentColor" stroke="none"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    boat: '<path d="M3 15.5h18l-2.5 4h-13z"/><path d="M11.5 3v12.5"/><path d="M11.5 4.5L18 13h-6.5"/><path d="M10 6.5L5.5 13H10"/>',
    sail: '<path d="M12 2.5v15"/><path d="M12 3.5c3.5 3 6 7.5 6.5 12.5H12"/><path d="M10.5 6c-2 2.5-3.5 6-4 10h4"/><path d="M3.5 18.5h17c-.8 1.8-2.4 3-4.5 3H8c-2.1 0-3.7-1.2-4.5-3z"/>',
    wind: '<path d="M3 8.5h11a3 3 0 1 0-3-3"/><path d="M3 12.5h15.5a3 3 0 1 1-3 3"/><path d="M3 16.5h7"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" stroke-linejoin="round"/>',
    anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14"/><path d="M8 10.5h8"/><path d="M4.5 13.5a7.5 7.5 0 0 0 15 0"/><path d="M4.5 13.5l-1 1.5M4.5 13.5l1.8.4M19.5 13.5l1 1.5M19.5 13.5l-1.8.4"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4.5h12l-2.5 4 2.5 4H5"/>',
    buoy: '<path d="M8.5 19h7l-1-8h-5z"/><path d="M12 11V4"/><path d="M9.5 4h5"/><path d="M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/>',
    knot: '<path d="M3 17c3 0 4-2 5.5-5S12 6 15 6s4.5 2 4.5 4-1.5 4-4.5 4-4.5-3-6-5"/><path d="M15 14c1.5 2 3 3 6 3"/>',
    rib: '<path d="M2.5 13.5h16a3 3 0 0 1 0 6H6a3.5 3.5 0 0 1-3.5-3.5z"/><path d="M9 13.5V10h4l1.5 3.5"/><path d="M19.5 13.5v-3.5h2"/>',
    school: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11"/><path d="M21.5 9v5"/>',
    rules: '<path d="M12 3l8 3.5v5c0 4.5-3.4 8-8 9.5-4.6-1.5-8-5-8-9.5v-5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r="1" fill="currentColor"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    download: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5.5"/><circle cx="12" cy="17" r="1.4" fill="currentColor"/>',
    quiz: '<rect x="3.5" y="4" width="17" height="13" rx="3"/><path d="M8 21l3-4"/><path d="M10 9a2 2 0 1 1 2.8 1.8c-.5.2-.8.7-.8 1.2"/><circle cx="12" cy="14.3" r=".9" fill="currentColor"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5a4 4 0 0 1 5-3l-2.5 2.5.5 2.5 2.5.5 2.5-2.5a4 4 0 0 1-3 5"/>',
    life: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
    whistle: '<path d="M3.5 12.5a4.5 4.5 0 1 0 9 0V10H21v-3H8a4.5 4.5 0 0 0-4.5 4.5"/><path d="M13 7v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z"/><path d="M13.5 7l3.5 3.5"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/>',
    sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" fill="currentColor" stroke-linejoin="round"/><path d="M19 15.5c.3 1.6 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-.9 2.5-2.5z" fill="currentColor" stroke="none"/>',
    heart: '<path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7.5-6.5 7.5-2.5 0-4-1.3-5.5-3.5L3 13.5a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
    joystick: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
    buttons: '<rect x="3" y="7" width="7.5" height="10" rx="2.5"/><rect x="13.5" y="7" width="7.5" height="10" rx="2.5"/><path d="M7.8 10l-2 2 2 2M16.2 10l2 2-2 2"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9"/>',
    shield: '<path d="M12 3l8 3.5v5c0 4.5-3.4 8-8 9.5-4.6-1.5-8-5-8-9.5v-5z"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M19 6l1.5-1.5"/>',
    place: '<path d="M4 20.5h16"/><rect x="9" y="7" width="6" height="13.5" rx="1"/><rect x="3.5" y="12" width="5.5" height="8.5" rx="1"/><rect x="15" y="14.5" width="5.5" height="6" rx="1"/>',
    lap: '<path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M18 2.8v4h-4M6 21.2v-4h4"/>',
    heel: '<path d="M3 18h18"/><path d="M12 18l-3-12 9 9.5z"/>',
    tack: '<path d="M5 19l7-14 7 14"/><path d="M9 13h6"/>',
    penalty: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="1" fill="currentColor"/>',
    score: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="currentColor" stroke="none"/>',
    speed: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l5-4"/><path d="M7 13.5l1 .5M12 9v1M17 13.5l-1 .5"/>',
    pos: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="4"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/>',
    passport: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="10" r="3.2"/><path d="M8.5 16.5h7"/>',
    credits: '<path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z"/>',
    gull: '<path d="M2.5 11c2.5-2.5 5.5-2.5 9.5 1.5 4-4 7-4 9.5-1.5"/>',
    motion: '<path d="M4 12h3l2-5 3 10 2-6 1.5 1H20"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  };
  function iconSvg(name, cls) {
    const body = ICONS[name] || ICONS.sail;
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  // ------------------------------------------------------------------ stars
  function stars(n, opts) {
    opts = opts || {};
    const max = opts.max || 3;
    let s = '<span class="stars' + (opts.cls ? ' ' + opts.cls : '') + '" aria-label="' + esc(n + '/' + max) + '">';
    for (let i = 0; i < max; i++) {
      s += '<span class="star ' + (i < n ? 'on' : 'off') + '" style="--i:' + i + '">' + starSvg(i < n) + '</span>';
    }
    return s + '</span>';
  }
  function starSvg(on) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 5.8 6.4.93-4.63 4.5 1.1 6.38L12 17.2l-5.72 3.01 1.1-6.38-4.63-4.5 6.4-.93z" ' +
      (on ? 'fill="var(--star)" stroke="#b9791b"' : 'fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)"') +
      ' stroke-width="1.3" stroke-linejoin="round"/>' + (on ? '<path d="M8.6 9.6l2-.3 1-2" stroke="#fff6cf" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".85"/>' : '') + '</svg>';
  }

  // ------------------------------------------------------------------ toasts
  function toast(text, opts) {
    opts = opts || {};
    const host = doc.getElementById('toasts');
    if (!host) return null;
    const kind = opts.kind || 'info';
    const icon = opts.icon || ({ good: 'check', bad: 'penalty', star: 'star', info: 'info', warn: 'penalty' }[kind] || 'info');
    const node = el('div', 'toast toast-' + kind);
    node.setAttribute('role', 'status');
    node.innerHTML = '<span class="toast-ico">' + iconSvg(icon) + '</span><span class="toast-text">' + esc(text) + '</span>';
    if (opts.action) {
      const b = el('button', 'toast-btn', esc(opts.action.label || opts.action.labelKey && t(opts.action.labelKey)));
      b.type = 'button';
      b.addEventListener('click', () => { sfx('click'); close(); opts.action.onClick && opts.action.onClick(); });
      node.appendChild(b);
    }
    host.appendChild(node);
    while (host.children.length > 4) host.removeChild(host.firstChild);
    requestAnimationFrame(() => node.classList.add('in'));
    let timer = null;
    function close() {
      if (!node.parentNode) return;
      clearTimeout(timer);
      node.classList.remove('in');
      node.classList.add('out');
      setTimeout(() => node.remove(), 300);
    }
    const ms = opts.ms === undefined ? (opts.action ? 9000 : 2600) : opts.ms;
    if (ms > 0) timer = setTimeout(close, ms);
    node.addEventListener('click', e => { if (e.target === node || e.target.closest('.toast-text')) close(); });
    if (opts.sound !== false) sfx(kind === 'bad' ? 'bump' : 'pop', { vol: 0.5 });
    return { el: node, close };
  }

  // ------------------------------------------------------------------ dialogs
  // Modal focus handling: Tab cycles inside `box`, the background (`behind` elements) is made inert, and focus goes back to
  // where it was when the modal closes. Returns release().
  function trapFocus(box, behind) {
    const prev = doc.activeElement;
    const els = (behind || []).filter(Boolean);
    els.forEach(e => { e._inertN = (e._inertN || 0) + 1; e.setAttribute('inert', ''); });
    const SEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const onKey = e => {
      if (e.key !== 'Tab') return;
      const f = Array.from(box.querySelectorAll(SEL)).filter(x => !x.disabled && x.getClientRects().length);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], cur = doc.activeElement;
      if (!box.contains(cur)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    };
    doc.addEventListener('keydown', onKey, true);
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      doc.removeEventListener('keydown', onKey, true);
      els.forEach(e => { e._inertN = Math.max(0, (e._inertN || 1) - 1); if (!e._inertN) e.removeAttribute('inert'); });
      try { if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    };
  }
  const dialogStack = [];
  function dialog(opts) {
    opts = opts || {};
    const host = doc.getElementById('dialogs');
    if (!host) return null;
    const wrap = el('div', 'dialog-wrap');
    const box = el('div', 'dialog glass' + (opts.cls ? ' ' + opts.cls : ''));
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = opts.titleKey ? t(opts.titleKey, opts.vars) : opts.title || '';
    box.innerHTML = (opts.icon ? '<div class="dialog-icon">' + iconSvg(opts.icon) + '</div>' : '') +
      (title ? '<h2 class="dialog-title">' + esc(title) + '</h2>' : '') +
      '<div class="dialog-body">' + (opts.body || (opts.bodyKey ? '<p>' + esc(t(opts.bodyKey, opts.vars)) + '</p>' : '')) + '</div>' +
      '<div class="dialog-buttons"></div>';
    const btns = box.querySelector('.dialog-buttons');
    const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ labelKey: 'common.ok', kind: 'primary' }];
    const api = { el: box, close };
    buttons.forEach((b, i) => {
      const btn = el('button', 'btn ' + (b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : 'btn-glass'));
      btn.type = 'button';
      btn.innerHTML = (b.icon ? iconSvg(b.icon) : '') + '<span>' + esc(b.labelKey ? t(b.labelKey) : b.label || '') + '</span>';
      btn.addEventListener('click', () => {
        sfx('click');
        const keep = b.onClick ? b.onClick(api) === false : false;
        if (!keep) close();
      });
      btns.appendChild(btn);
      if (i === buttons.length - 1 || b.kind === 'primary') api.defaultBtn = btn;
    });
    if (opts.dismissable !== false) {
      wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
    }
    wrap.appendChild(box);
    host.appendChild(wrap);
    dialogStack.push(api);
    const release = trapFocus(box, [doc.getElementById('app')]);
    requestAnimationFrame(() => wrap.classList.add('in'));
    setTimeout(() => { try { (api.defaultBtn || box).focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    sfx('whoosh', { vol: 0.35 });
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      const i = dialogStack.indexOf(api);
      if (i >= 0) dialogStack.splice(i, 1);
      release();
      wrap.classList.remove('in');
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 220);
      if (opts.onClose) opts.onClose();
    }
    api.dismissable = opts.dismissable !== false;
    return api;
  }
  function topDialog() { return dialogStack[dialogStack.length - 1] || null; }

  // ------------------------------------------------------------------ the club's coaches
  // Anton, Maria, Storm, Marius, Ida, Nicolas, Peter and Jesper are cartoons of the real KØS coaches (user photos 2026-10-07/08); Jesper is the default.
  // Optional fields: back (drawn behind the head), front (drawn over the face: collars), smile (mouth width).
  // setCoach(id) picks who talks during an activity (KOS.App does it per activity); coach()/coachSvg() take an
  // explicit opts.coach / who to override.
  const COACHES = {
    // chief coach, J70 trainer: short blond hair with buzzed sides, sunglasses pushed up, light grey vest over a white shirt
    anton: { skin: '#f3c6a2', ear: '#eab18c', brow: '#c9a35e', eye: '#2c4a6e',
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#f4f6f8"/>' +
        '<path d="M14 100c2-18 13-26 27-28l3 28zM86 100c-2-18-13-26-27-28l-3 28z" fill="#d3d7dc" stroke="#283653" stroke-width="2"/>' +
        '<path d="M40 73l10 8 10-8" fill="none" stroke="#c8ccd2" stroke-width="2.4"/>',
      hair: '<path d="M30 44c-1-13 8-21 20-21s21 7 20 21c-3-6-7-9-11-10-6 2-12 2-18 0-5 1-9 4-11 10z" fill="#d9b56a"/>' +
        '<path d="M30 44c0-6 2-10 4-13M70 44c0-6-2-10-4-13" stroke="#e7cf9c" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M36 31h28" stroke="#283653" stroke-width="2"/><ellipse cx="42" cy="31" rx="6.5" ry="4" fill="#4aa3e0" stroke="#283653" stroke-width="1.6"/>' +
        '<ellipse cx="58" cy="31" rx="6.5" ry="4" fill="#4aa3e0" stroke="#283653" stroke-width="1.6"/><path d="M39 30l3-1.5M55 30l3-1.5" stroke="#d6efff" stroke-width="1.2"/>' },
    // youth coach: a big tousled brown mop swept across the forehead, white T-shirt, wide grin
    storm: { skin: '#f6c7a4', ear: '#eeb48f', brow: '#6b4527', eye: '#3a2a1e', fringe: true,
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#f7f8fa"/><path d="M41 73q9 7 18 0" fill="none" stroke="#d5d9df" stroke-width="2.4"/>',
      hair: '<path d="M23 60C16 32 31 15 50 15c21 0 33 15 28 44-2-7-4-11-7-14-8 3-17 3-26 0-5 2-9 4-13 4-3 2-6 6-9 11z" fill="#7a5634"/>' +
        '<path d="M28 47c6-11 20-16 36-12-7 1-15 5-21 11-5 1-10 1-15 1z" fill="#946a41"/>' +
        '<path d="M36 22c5-4 12-5 18-3M60 21c6 1 10 5 12 10M27 38c1-6 4-11 9-14M44 30c6-3 14-3 20 0" stroke="#5e3f22" stroke-width="2" fill="none" stroke-linecap="round"/>' },
    // youth coach: messy blond hair swept up off the forehead, black sailing jacket under a blue buoyancy vest
    marius: { skin: '#f5c6a5', ear: '#ecb28e', brow: '#c8a45a', eye: '#3b5876',
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#1d2230"/>' +
        '<path d="M20 100c1-14 8-22 18-25l4 25zM80 100c-1-14-8-22-18-25l-4 25z" fill="#2f6fd0" stroke="#1a2b55" stroke-width="1.6"/>' +
        '<rect x="62" y="86" width="6" height="4" rx="1" fill="#e7f23a"/><path d="M42 73l8 7 8-7" fill="none" stroke="#3a4050" stroke-width="2.4"/>',
      hair: '<path d="M29 46c-3-14 5-25 21-26 15-1 24 8 21 25-2-5-4-8-7-9-7 2-15 2-22 0-5 1-10 4-13 10z" fill="#e4c47c"/>' +
        '<path d="M31 34q-2-9 5-11q1-6 8-6q4-4 9-1q6-2 9 3q7 1 7 9q2 4 0 8z" fill="#e4c47c"/>' +
        '<path d="M37 27q3-5 8-5M47 23q4-3 8 0M57 25q5-1 7 4M35 33c6-4 14-6 22-5" stroke="#f3dfaa" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
    // beginner coach: long straight light-brown hair with a middle part, falling over the shoulders; black top
    ida: { skin: '#f4c8ab', ear: '#ebb595', brow: '#9a7048', eye: '#5b7f9e',
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#15171d"/><path d="M42 73q8 5 16 0" fill="none" stroke="#2a2d36" stroke-width="2.4"/>',
      back: '<path d="M27 50c-2-20 8-31 23-31s25 11 23 31c1 16 3 28 7 40-9 4-17 4-24 1l-3-26h-6l-3 26c-7 3-15 3-24-1 4-12 6-24 7-40z" fill="#b48558"/>',
      hair: '<path d="M29 50c-1-19 8-28 21-28s22 9 21 28c-2-10-6-17-11-20-3 3-6 5-10 6l0-6c-4 4-10 7-17 9-2 3-3 7-4 11z" fill="#c29466"/>' +
        '<path d="M50 23v8M40 26c-4 4-7 10-8 18M60 26c4 4 7 10 8 18" stroke="#dcb487" stroke-width="1.6" fill="none" stroke-linecap="round"/>' },
    // J70 + navigation coach: shoulder-length curly auburn hair, sunglasses pushed up, red sailing jacket, big smile
    maria: { skin: '#f0bf9e', ear: '#e6a985', brow: '#7a4a2c', eye: '#4f7a96',
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#d8342a"/><path d="M40 72l10 9 10-9" fill="none" stroke="#a8221b" stroke-width="2.6"/>' +
        '<path d="M50 81v19" stroke="#a8221b" stroke-width="2"/>',
      back: '<g fill="#8a4f2c"><circle cx="28" cy="48" r="9"/><circle cx="25" cy="60" r="8"/><circle cx="28" cy="71" r="8"/><circle cx="72" cy="48" r="9"/>' +
        '<circle cx="75" cy="60" r="8"/><circle cx="72" cy="71" r="8"/><circle cx="34" cy="36" r="10"/><circle cx="66" cy="36" r="10"/></g>',
      hair: '<g fill="#9a5a32"><circle cx="38" cy="28" r="8"/><circle cx="50" cy="25" r="8.5"/><circle cx="62" cy="28" r="8"/><circle cx="31" cy="38" r="6.5"/><circle cx="69" cy="38" r="6.5"/></g>' +
        '<path d="M34 30q4 3 2 7M47 22q4 2 3 7M60 25q4 2 3 7M28 52q3 3 1 7M72 52q-3 3-1 7" stroke="#b97648" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M37 24h26" stroke="#2b2b30" stroke-width="2"/><ellipse cx="43" cy="24" rx="6.5" ry="3.8" fill="#3b4250" stroke="#1b1d22" stroke-width="1.4"/>' +
        '<ellipse cx="57" cy="24" rx="6.5" ry="3.8" fill="#3b4250" stroke="#1b1d22" stroke-width="1.4"/><path d="M40 23l3-1.2M54 23l3-1.2" stroke="#8a93a6" stroke-width="1"/>' },
    // H-boat + rules coach: grey cap with the brim to the side, brown hair peeking out, black/orange buoyancy vest with a VHF over a paint-splatter tee
    nicolas: { skin: '#f3c3a0', ear: '#e9ae89', brow: '#6b4a2e', eye: '#4a3a2a',
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#f4f5f7"/>' +
        '<g><circle cx="20" cy="92" r="1.7" fill="#2f8ce0"/><circle cx="25" cy="85" r="1.3" fill="#e04a6a"/><circle cx="80" cy="91" r="1.7" fill="#e0b52f"/><circle cx="76" cy="84" r="1.3" fill="#3ec46a"/></g>' +
        '<path d="M25 100c0-13 4-21 10-25h5c2 6 6 9 10 9s8-3 10-9h5c6 4 10 12 10 25z" fill="#1b1d22"/>' +
        '<path d="M34 76l6-1 2 5-6 2zM66 76l-6-1-2 5 6 2z" fill="#ff6a2a"/><rect x="60" y="86" width="6" height="11" rx="1.5" fill="#2a2d33" stroke="#555a64" stroke-width="1"/>',
      hair: '<path d="M29 50c-1-5 0-9 2-11l4 2c-1 3-1 6-1 9zM71 50c1-5 0-9-2-11l-4 2c1 3 1 6 1 9zM33 41q9 5 18 3q-7 4-16 3z" fill="#6b4a2e"/>' +
        '<path d="M28 43c-1-14 9-23 22-23s23 9 22 23c-14-3-30-3-44 0z" fill="#73776c"/>' +
        '<path d="M50 41c10-2 21-1 31 3-1 3-4 4-8 4-7-2-15-3-23-3z" fill="#5d6157" stroke="#3e413a" stroke-width="1.2"/>' +
        '<path d="M43 30h14" stroke="#f2f2f2" stroke-width="2.2" stroke-linecap="round"/><circle cx="50" cy="21" r="1.6" fill="#5d6157"/>' },
    // shed coach: wild, spiky, windswept light grey-blond hair sticking up and out (receding at the temples, high
    // forehead), blue eyes with smile crinkles, navy fleece half-zip with a stand-up collar over a white roll-neck
    peter: { skin: '#f0bf9c', ear: '#e6a986', brow: '#b9ae92', eye: '#3a78c0', smile: 11,
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#1f2c55"/><path d="M50 84v16" stroke="#121b3a" stroke-width="2"/>' +
        '<path d="M20 100c2-12 7-19 15-23M80 100c-2-12-7-19-15-23" stroke="#2a3a6c" stroke-width="2" fill="none"/>',
      hair: '<path d="M37 37L31 23l8 4-1-15 8 10 4-14 4 13 8-11-1 14 9-6-6 15c-6-3-11-4-14-4h-8c-5 0-9 1-14 4z" fill="#d6cfb9"/>' +
        '<path d="M31 52l-9-5 6-3-8-7 9 1-1-8 7 7c-2 4-3 9-4 15zM69 52l9-5-6-3 8-7-9 1 1-8-7 7c2 4 3 9 4 15z" fill="#d6cfb9"/>' +
        '<path d="M40 14l5 11M51 10l1 13M60 13l-4 11M33 25l6 7M67 23l-6 8M24 39l6 3M76 39l-6 3" stroke="#f1ecdd" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M42 30c4-2 12-2 16 0" stroke="#b5ad96" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M33.5 51.5l-3.5-1.5M33.5 55l-3.8 .5M66.5 51.5l3.5-1.5M66.5 55l3.8 .5" stroke="#c98d6c" stroke-width="1.1" stroke-linecap="round"/>',
      // the white roll-neck and the fleece's stand-up collar (half-zip a little open), drawn over the chin line
      front: '<path d="M39 71q11 6 22 0l1 7q-12 6-24 0z" fill="#f4f5f7" stroke="#d3d7de" stroke-width="1"/>' +
        '<path d="M33 76l5-8 12 13 12-13 5 8-8 10h-18z" fill="#22305e" stroke="#121b3a" stroke-width="1.4" stroke-linejoin="round"/>' +
        '<path d="M50 81v7" stroke="#c9d0db" stroke-width="1.6"/><rect x="48.6" y="85" width="2.8" height="4.4" rx="1" fill="#c9d0db"/>' },
    // family trainer + club president: light, thinning hair swept back (high forehead), blue eyes, navy fleece
    jesper: { skin: '#f1c19c', ear: '#e7ad87', brow: '#bca36e', eye: '#2f5d9a',
      body: '<path d="M14 100c2-20 16-28 36-28s34 8 36 28z" fill="#283f86"/><path d="M38 72l12 7 12-7v6l-12 6-12-6z" fill="#334c99"/>' +
        '<path d="M50 80v20" stroke="#1b2c63" stroke-width="2"/>',
      hair: '<path d="M30 45c-1-14 8-22 20-22s21 8 20 22c-2-6-4-9-7-10-1-4-5-6-9-4-3-2-7-2-10 0-4-1-7 1-8 4-3 1-5 4-6 10z" fill="#cfbd90"/>' +
        '<path d="M38 27c6-3 16-3 24 1M36 31c4-3 8-4 12-3M53 28c4 0 8 2 10 5" stroke="#e6d8b2" stroke-width="1.4" fill="none" stroke-linecap="round"/>' },
  };
  let coachId = 'jesper';
  function setCoach(id) { coachId = COACHES[id] ? id : 'jesper'; }
  function currentCoach() { return coachId; }
  function coachName(id) { id = id || coachId; const n = t('ui.coach.who.' + id); return n && n.indexOf('ui.coach.who') < 0 ? n : t('ui.coach.name'); }
  function coachMouth(mood, k) {
    // 'yell': wide open, shouting (Træner Peter in the shed)
    if (mood === 'yell') return '<path d="M40 63q10-5 20 0q-1 12-10 12t-10-12z" fill="#7a2d22" stroke="#5a1d16" stroke-width="1.2"/><path d="M41.5 64q8.5-3.5 17 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="71.5" rx="4.5" ry="2" fill="#e0646a"/>';
    return mood === 'wow' ?'<ellipse cx="50" cy="66" rx="5" ry="6" fill="#7a2d22"/>' :
      mood === 'oops' ? '<path d="M42 68q8-5 16 0" stroke="#7a2d22" stroke-width="3" fill="none" stroke-linecap="round"/>' :
        '<path d="M' + (50 - k) + ' 63q' + k + ' ' + k + ' ' + 2 * k + ' 0" stroke="#7a2d22" stroke-width="3" fill="#fff" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function realCoachSvg(c, mood, id) {
    return '<svg class="coach-svg coach-' + id + '" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="48" fill="#1c2a47"/>' + c.body + (c.back || '') +
      '<rect x="43" y="62" width="14" height="14" rx="6" fill="' + c.ear + '"/>' +
      '<ellipse cx="50" cy="52" rx="21" ry="22" fill="' + c.skin + '"/>' +
      '<ellipse cx="29.5" cy="54" rx="4" ry="5" fill="' + c.ear + '"/><ellipse cx="70.5" cy="54" rx="4" ry="5" fill="' + c.ear + '"/>' +
      c.hair +
      '<ellipse cx="41.5" cy="53" rx="3" ry="3.6" fill="' + c.eye + '"/><ellipse cx="58.5" cy="53" rx="3" ry="3.6" fill="' + c.eye + '"/>' +
      '<circle cx="42.6" cy="51.8" r="1.1" fill="#fff"/><circle cx="59.6" cy="51.8" r="1.1" fill="#fff"/>' +
      (mood === 'yell' ? '<path d="M36 44.5l9.5 3.5M64 44.5l-9.5 3.5" stroke="' + c.brow + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
        : '<path d="M36.5 47q5-3 9 0M54.5 47q5-3 9 0" stroke="' + c.brow + '" stroke-width="2" fill="none" stroke-linecap="round"/>') +
      '<ellipse cx="35" cy="61" rx="4.5" ry="2.6" fill="' + (mood === 'yell' ? '#ff6a5a' : '#ff9a8a') + '" opacity="' + (mood === 'yell' ? '.7' : '.45') + '"/><ellipse cx="65" cy="61" rx="4.5" ry="2.6" fill="' + (mood === 'yell' ? '#ff6a5a' : '#ff9a8a') + '" opacity="' + (mood === 'yell' ? '.7' : '.45') + '"/>' +
      coachMouth(mood, c.smile || (id === 'storm' || id === 'marius' || id === 'maria' || id === 'nicolas' ? 12 : id === 'jesper' ? 8 : 10)) + (c.front || '') + '</svg>';
  }
  function coachSvg(mood, who) {
    const id = COACHES[who] ? who : coachId;
    return realCoachSvg(COACHES[id], mood, id);
  }
  let coachCur = null;
  function coach(text, opts) {
    opts = opts || {};
    if (coachCur) coachCur.close(true);
    const host = opts.host || (doc.getElementById('screen-play') && !doc.getElementById('screen-play').hidden ? doc.getElementById('screen-play') : doc.body);
    const pos = opts.pos || 'bottom';
    const node = el('div', 'coach coach-' + pos + (opts.ms === 0 || opts.tapToClose ? ' coach-tapclose' : '') + (opts.mood === 'yell' ? ' coach-yell' : '') + (String(text).length > 105 ? ' coach-long' : ''));
    node.setAttribute('role', 'status');
    node.innerHTML = '<div class="coach-avatar">' + (opts.avatar && opts.avatar !== 'coach' ? opts.avatar : coachSvg(opts.mood, opts.coach)) + '</div>' +
      '<div class="coach-bubble"><div class="coach-name">' + esc(opts.name || coachName(opts.coach)) + '</div><div class="coach-text">' + esc(text) + '</div>' +
      (opts.ms === 0 || opts.tapToClose ? '<div class="coach-tap">' + esc(t('ui.coach.tap')) + '</div>' : '') + '</div>';
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('in'));
    sfx('pop', { vol: 0.45, pitch: 1.2 });
    let timer = null;
    // during play the bubble must never hide the boat: if it covers the followed boat it hops to the other slot
    // (.coach-dodge); if the boat is under both slots it ghosts out (.coach-ghost) until the boat moves on
    let dodge = null;
    if (pos === 'bottom' && host.id === 'screen-play') {
      let lastHop = 0;
      const hits = (a, b) => a.left < b.x1 + 10 && a.right > b.x0 - 10 && a.top < b.y1 + 10 && a.bottom > b.y0 - 10;
      dodge = setInterval(() => {
        if (!node.parentNode) { clearInterval(dodge); return; }
        const sc = KOS.SailScene && KOS.SailScene.current;
        const box = sc && sc.targetBox ? sc.targetBox() : null;
        if (!box) { node.classList.remove('coach-ghost'); return; }
        const over = hits(node.getBoundingClientRect(), box), tNow = Date.now();
        if (!over) { if (tNow - lastHop > 600) node.classList.remove('coach-ghost'); return; }
        if (tNow - lastHop < 1200) { node.classList.add('coach-ghost'); return; } // just hopped and still covering it
        node.classList.toggle('coach-dodge');
        node.classList.remove('coach-ghost');
        lastHop = tNow;
      }, 150);
    }
    const api = {
      el: node,
      close(instant) {
        if (!node.parentNode) return;
        clearTimeout(timer);
        clearInterval(dodge);
        if (coachCur === api) coachCur = null;
        if (instant) { node.remove(); return; }
        node.classList.remove('in');
        node.classList.add('out');
        setTimeout(() => node.remove(), 280);
        if (opts.onClose) opts.onClose();
      },
    };
    const ms = opts.ms === undefined ? Math.max(3200, Math.min(9000, String(text).length * 70)) : opts.ms;
    if (ms > 0) timer = setTimeout(() => api.close(), ms);
    node.addEventListener('pointerdown', e => { e.stopPropagation(); api.close(); });
    coachCur = api;
    return api;
  }

  function coachClose(instant) { if (coachCur) coachCur.close(instant !== false); }

  // ------------------------------------------------------------------ HUD
  const POS_KEYS = { irons: 'ui.pos.irons', closehauled: 'ui.pos.closehauled', closereach: 'ui.pos.closereach', beamreach: 'ui.pos.beamreach', broadreach: 'ui.pos.broadreach', run: 'ui.pos.run' };
  function fmtTime(ms) {
    ms = Math.max(0, ms || 0);
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const tenth = Math.floor((ms % 1000) / 100);
    return m + ':' + String(s % 60).padStart(2, '0') + '.' + tenth;
  }
  function hud(layer, items) {
    items = (items || ['wind', 'speed']).map(it => (typeof it === 'string' ? { id: it } : it));
    const root_ = el('div', 'hud');
    const cells = {};
    items.forEach(it => {
      const c = el('div', 'hud-item hud-' + it.id);
      const label = it.labelKey ? t(it.labelKey) : t('ui.hud.' + it.id);
      if (it.id === 'wind') {
        c.innerHTML = '<div class="hud-wind-dial"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.25)"/>' +
          '<text x="20" y="9" font-size="6" text-anchor="middle" fill="rgba(255,255,255,.6)" font-weight="800">N</text>' +
          '<g class="hud-wind-arrow"><path d="M20 7v22" stroke="var(--blue)" stroke-width="3" stroke-linecap="round"/><path d="M13.5 24l6.5 8 6.5-8z" fill="var(--blue)"/></g></svg></div>' +
          '<div class="hud-txt"><span class="hud-label">' + esc(label) + '</span><span class="hud-val"><b>–</b><small class="hud-wind-unit"> ' + esc(KOS.U.windUnitLabel()) + '</small></span></div>';
      } else if (it.id === 'heel') {
        c.innerHTML = '<span class="hud-ico">' + iconSvg('heel') + '</span><div class="hud-txt"><span class="hud-label">' + esc(label) + '</span>' +
          '<span class="hud-heel-bar"><i></i></span></div>';
      } else {
        const unit = it.id === 'speed' ? ' ' + t('common.kn') : '';
        c.innerHTML = '<span class="hud-ico">' + iconSvg(it.icon || it.id) + '</span><div class="hud-txt"><span class="hud-label">' + esc(label) + '</span>' +
          '<span class="hud-val"><b>–</b>' + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span></div>';
      }
      root_.appendChild(c);
      cells[it.id] = c;
    });
    (layer || doc.body).appendChild(root_);
    const last = {};
    function setVal(id, html) {
      if (last[id] === html) return;
      last[id] = html;
      const b = cells[id] && cells[id].querySelector('.hud-val b');
      if (b) {
        b.innerHTML = html;
        if (id === 'score' || id === 'place' || id === 'penalty' || id === 'lap') {
          cells[id].classList.remove('bump'); void cells[id].offsetWidth; cells[id].classList.add('bump');
        }
      }
    }
    return {
      el: root_,
      update(d) {
        d = d || {};
        if (cells.wind && d.wind) {
          const dir = (+d.wind.dir || 0) - (+d.viewRot || 0);
          const deg = (((dir * 180 / Math.PI) % 360) + 360) % 360; // arrow points where the wind blows TO (glyph points down at 0°)
          const key = Math.round(deg);
          if (last.windDeg !== key) { last.windDeg = key; cells.wind.querySelector('.hud-wind-arrow').setAttribute('transform', 'rotate(' + key + ' 20 20)'); }
          setVal('wind', KOS.U.windVal(d.wind.speed || 0));
          const wu = cells.wind.querySelector('.hud-wind-unit'), wut = ' ' + KOS.U.windUnitLabel();
          if (wu && wu.textContent !== wut) wu.textContent = wut;
        }
        if (cells.speed && d.speed !== undefined) setVal('speed', (+d.speed || 0).toFixed(1));
        if (cells.pos && d.pos !== undefined) setVal('pos', esc(POS_KEYS[d.pos] ? t(POS_KEYS[d.pos]) : d.pos));
        if (cells.timer && d.timer !== undefined) setVal('timer', typeof d.timer === 'number' ? fmtTime(d.timer) : esc(d.timer));
        if (cells.place && d.place !== undefined) {
          const p = typeof d.place === 'object' ? d.place : { place: d.place };
          setVal('place', p.place + (p.of ? '<small>/' + p.of + '</small>' : ''));
        }
        if (cells.lap && d.lap !== undefined) {
          const l = typeof d.lap === 'object' ? d.lap : { lap: d.lap };
          setVal('lap', l.lap + (l.of ? '<small>/' + l.of + '</small>' : ''));
        }
        if (cells.score && d.score !== undefined) setVal('score', Math.round(+d.score || 0).toLocaleString(loc()));
        if (cells.tack && d.tack !== undefined) {
          setVal('tack', esc(d.tack === 'port' ? t('common.port') : d.tack === 'starboard' ? t('common.starboard') : d.tack));
          cells.tack.classList.toggle('is-port', d.tack === 'port');
          cells.tack.classList.toggle('is-stbd', d.tack === 'starboard');
        }
        if (cells.penalty && d.penalty !== undefined) {
          setVal('penalty', esc(d.penalty));
          cells.penalty.classList.toggle('alert', !!d.penalty && d.penalty !== '0');
        }
        if (cells.heel && d.heel !== undefined) {
          const h = Math.max(-1, Math.min(1, (+d.heel || 0) / (d.heelMax || 0.8)));
          const k = Math.round(h * 50);
          if (last.heel !== k) {
            last.heel = k;
            const bar = cells.heel.querySelector('.hud-heel-bar i');
            bar.style.left = (50 + Math.min(0, k)) + '%';
            bar.style.width = Math.abs(k) + '%';
            cells.heel.classList.toggle('alert', Math.abs(h) > 0.8);
          }
        }
        // free-form custom items: d.custom = {id: html}
        if (d.custom) for (const id in d.custom) setVal(id, d.custom[id]);
      },
      show(b) { root_.hidden = !b; },
      destroy() { root_.remove(); },
    };
  }

  // ------------------------------------------------------------------ countdown 3-2-1-Sejl!
  function countdown(layer, seconds, onDone) {
    seconds = seconds === undefined ? 3 : seconds;
    const node = el('div', 'countdown');
    (layer || doc.body).appendChild(node);
    let n = seconds;
    let timer = null;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      node.innerHTML = '';
      const num = el('div', 'countdown-num' + (n <= 0 ? ' go' : ''), n > 0 ? String(n) : esc(t('ui.countdown.go')));
      node.appendChild(num);
      if (n > 0) { sfx('countdown', { pitch: 1 }); n--; timer = setTimeout(tick, 900); } else {
        sfx('go');
        timer = setTimeout(() => { node.remove(); if (onDone && !cancelled) onDone(); }, 700);
      }
    }
    tick();
    return { el: node, cancel() { cancelled = true; clearTimeout(timer); node.remove(); } };
  }

  // ------------------------------------------------------------------ confetti
  let confettiRun = null;
  function confetti(opts) {
    opts = opts || {};
    if (confettiRun) confettiRun.stop();
    const cv = el('canvas', 'confetti-canvas');
    doc.body.appendChild(cv);
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const W = root.innerWidth, H = root.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const cols = ['#ffd25e', '#ff7a3d', '#49c6f2', '#3ee08f', '#ff4d5e', '#ffffff', '#b78cff'];
    const n = reduced() ? 40 : (opts.count || Math.min(220, Math.round(W * H / 6000)));
    const parts = [];
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9), vy: -(9 + Math.random() * 11),
        r: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: cols[i % cols.length], shape: i % 3, wob: Math.random() * 6,
      });
    }
    let t0 = performance.now(), raf = 0, stopped = false;
    function frame(now) {
      if (stopped) return;
      const el_ = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx + Math.sin(el_ * 4 + p.wob) * 0.6; p.y += p.vy; p.rot += p.vr;
        if (p.y < H + 20) alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, 3.6 - el_));
        ctx.fillStyle = p.c;
        if (p.shape === 0) ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
        else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.6, 0, 6.283); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.8, p.r * 0.6); ctx.lineTo(-p.r * 0.8, p.r * 0.6); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      if (alive && el_ < 4) raf = requestAnimationFrame(frame); else stop();
    }
    function stop() { stopped = true; cancelAnimationFrame(raf); cv.remove(); if (confettiRun && confettiRun.cv === cv) confettiRun = null; }
    raf = requestAnimationFrame(frame);
    confettiRun = { stop, cv };
    return confettiRun;
  }

  // ------------------------------------------------------------------ player avatar
  const AVATAR = {
    skin: ['#ffdfc4', '#f6c39f', '#e0a37a', '#c68154', '#8d5a36', '#5c3a24'],
    hair: ['#2b1d14', '#5a3720', '#8a4b2a', '#c9772f', '#e8c170', '#f3e3b0', '#b8b8c0', '#ff6f91', '#4fa3ff'],
    jacket: ['#ff7a3d', '#ffb547', '#e8323c', '#18a957', '#49c6f2', '#2b6cb0', '#7b5cff', '#ff6f91', '#1d2433', '#f5f5f5'],
    styles: ['short', 'long', 'curly', 'cap', 'bun'],
  };
  function avatarSvg(av, opts) {
    av = Object.assign({ skin: AVATAR.skin[1], hair: AVATAR.hair[1], jacket: AVATAR.jacket[0], style: 'short' }, av || {});
    opts = opts || {};
    const s = av.skin, h = av.hair, j = av.jacket;
    const dark = shade(j, -0.25);
    let back = '', front = '';
    switch (av.style) {
      case 'long':
        back = '<path d="M26 50c-2 18 0 32 6 40h36c6-8 8-22 6-40z" fill="' + h + '"/>';
        front = '<path d="M28 48c0-16 10-26 22-26s22 10 22 26c-4-8-12-12-22-12s-18 4-22 12z" fill="' + h + '"/>';
        break;
      case 'curly':
        front = '<g fill="' + h + '"><circle cx="32" cy="40" r="8"/><circle cx="40" cy="31" r="9"/><circle cx="52" cy="28" r="9"/><circle cx="63" cy="33" r="8.5"/><circle cx="69" cy="42" r="7"/><circle cx="29" cy="49" r="5"/><circle cx="71" cy="50" r="5"/></g>';
        break;
      case 'cap':
        front = '<path d="M30 46c0-4 2-6 4-7h32c2 1 4 3 4 7z" fill="' + h + '"/><path d="M28 42c1-14 10-21 22-21s21 7 22 21z" fill="' + j + '"/>' +
          '<path d="M26 42h44c8 0 13 2 15 5H26z" fill="' + dark + '"/><circle cx="50" cy="22" r="2.5" fill="' + dark + '"/>';
        break;
      case 'bun':
        back = '<circle cx="50" cy="20" r="9" fill="' + h + '"/>';
        front = '<path d="M28 48c0-16 10-25 22-25s22 9 22 25c-5-7-13-10-22-10s-17 3-22 10z" fill="' + h + '"/>';
        break;
      default:
        front = '<path d="M28 47c-1-15 9-25 22-25s23 9 22 25c-3-5-7-8-11-9-2 3-6 4-11 4-6 0-10-2-12-5-5 2-8 6-10 10z" fill="' + h + '"/>';
    }
    return '<svg class="avatar-svg' + (opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 100 100" aria-hidden="true">' +
      (opts.bg === false ? '' : '<circle cx="50" cy="50" r="48" fill="' + (opts.bg || '#1c2a47') + '"/>') +
      '<clipPath id="avc"><circle cx="50" cy="50" r="48"/></clipPath><g clip-path="url(#avc)">' + back +
      '<path d="M14 104c2-20 16-30 36-30s34 10 36 30z" fill="' + j + '"/>' +
      '<path d="M36 76c4 6 9 9 14 9s10-3 14-9" fill="none" stroke="' + dark + '" stroke-width="3"/>' +
      '<path d="M50 85v19" stroke="' + dark + '" stroke-width="2.5"/>' +
      '<rect x="43" y="62" width="14" height="14" rx="6" fill="' + shade(s, -0.08) + '"/>' +
      '<ellipse cx="50" cy="51" rx="21" ry="22" fill="' + s + '"/>' +
      '<ellipse cx="29.5" cy="53" rx="4" ry="5" fill="' + shade(s, -0.08) + '"/><ellipse cx="70.5" cy="53" rx="4" ry="5" fill="' + shade(s, -0.08) + '"/>' +
      front +
      '<ellipse cx="42" cy="53" rx="3" ry="3.6" fill="#1b2335"/><ellipse cx="58" cy="53" rx="3" ry="3.6" fill="#1b2335"/>' +
      '<circle cx="43.1" cy="51.8" r="1.1" fill="#fff"/><circle cx="59.1" cy="51.8" r="1.1" fill="#fff"/>' +
      '<ellipse cx="35.5" cy="61" rx="4" ry="2.4" fill="#ff8a7a" opacity=".45"/><ellipse cx="64.5" cy="61" rx="4" ry="2.4" fill="#ff8a7a" opacity=".45"/>' +
      '<path d="M43 63q7 7 14 0" stroke="#6b2b22" stroke-width="2.6" fill="none" stroke-linecap="round"/></g></svg>';
  }
  function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    r = f(r); g = f(g); b = f(b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // ------------------------------------------------------------------ results card
  // Returns a DOM element; buttons carry data-act="retry|next|map". KOS.App wires them.
  // extra = {record: Storage.record output, next: activity|null, nextUnlocked: bool}
  function results(result, activity, extra) {
    result = result || {};
    extra = extra || {};
    const st = Math.max(0, Math.min(3, Math.round(+result.stars || 0)));
    const win = result.success !== false && st > 0;
    // on-land mini-games (rigging, knots, quiz, capsize drill) get headings that don't talk about "sailing"
    const mode = activity && KOS.Modes && KOS.Modes.get(activity.mode);
    const land = !!(mode && mode.kind === 'dom');
    const titleKey = result.titleKey || (win ? (st === 3 ? (land ? 'ui.results.perfectLand' : 'ui.results.perfect') : st === 2 ? 'ui.results.great' : (land ? 'ui.results.goodLand' : 'ui.results.good')) : 'ui.results.fail');
    const msg = result.msgKey ? t(result.msgKey, result.msgVars) : (win ? t(st === 3 ? 'ui.results.msgPerfect' : 'ui.results.msgWin') : t(extra.capsized ? 'ui.results.msgFail' : 'ui.results.msgTry'));
    const rec = extra.record || {};
    const card = el('div', 'results-card glass ' + (win ? 'is-win' : 'is-fail'));
    let starsHtml = '<div class="results-stars">';
    for (let i = 0; i < 3; i++) starsHtml += '<span class="rstar ' + (i < st ? 'on' : 'off') + '" style="--i:' + i + '">' + starSvg(i < st) + '</span>';
    starsHtml += '</div>';
    const statRows = [];
    if (result.score !== undefined) statRows.push(['score', t('common.score'), '<b class="count" data-to="' + Math.round(+result.score || 0) + '">0</b>']);
    if (result.timeMs) statRows.push(['clock', t('common.time'), '<b>' + fmtTime(result.timeMs) + '</b>']);
    if (rec.xpGained) statRows.push(['sparkle', t('ui.results.xp'), '<b class="xp">+<span class="count" data-to="' + rec.xpGained + '">0</span></b>']);
    if (result.stats) {
      for (const k in result.stats) {
        const v = result.stats[k];
        if (v === undefined || v === null || typeof v === 'object') continue;
        const lk = 'ui.stat.' + k;
        const label = KOS.I18n && KOS.I18n.has(lk) ? t(lk) : (KOS.I18n && KOS.I18n.has(k) ? t(k) : null);
        if (label) statRows.push(['check', label, '<b>' + esc(typeof v === 'number' && v % 1 ? v.toFixed(1) : v) + '</b>']);
      }
    }
    card.innerHTML =
      '<div class="results-ribbon">' + esc(activity ? KOS.tt(activity.title) : '') + '</div>' +
      starsHtml +
      '<h1 class="results-title">' + esc(t(titleKey, result.msgVars)) + '</h1>' +
      '<p class="results-msg">' + esc(msg) + '</p>' +
      (rec.newBest ? '<div class="results-badge">' + iconSvg('trophy') + esc(t('ui.results.newBest')) + '</div>' : '') +
      '<div class="results-stats">' + statRows.map(r => '<div class="rs-row">' + iconSvg(r[0]) + '<span>' + esc(r[1]) + '</span>' + r[2] + '</div>').join('') + '</div>' +
      '<div class="results-buttons">' +
      '<button type="button" class="btn btn-glass" data-act="retry">' + iconSvg('retry') + '<span>' + esc(t('common.retry')) + '</span></button>' +
      (extra.next ? '<button type="button" class="btn btn-primary" data-act="next"' + (extra.nextUnlocked ? '' : ' disabled') + '>' + '<span>' + esc(t('common.next')) + '</span>' + iconSvg(extra.nextUnlocked ? 'next' : 'lock') + '</button>' : '') +
      '<button type="button" class="btn btn-glass" data-act="map">' + iconSvg('map') + '<span>' + esc(t('ui.results.map')) + '</span></button>' +
      '</div>';
    // animate: stars pop one by one, numbers count up
    const quick = reduced();
    card.querySelectorAll('.rstar.on').forEach((s, i) => {
      setTimeout(() => { s.classList.add('pop'); sfx('star', { pitch: 1 + i * 0.12 }); }, quick ? 0 : 450 + i * 380);
    });
    setTimeout(() => {
      card.querySelectorAll('.count').forEach(c => {
        const to = +c.getAttribute('data-to') || 0;
        if (quick || to === 0) { c.textContent = to.toLocaleString(loc()); return; }
        const t0 = performance.now(), dur = 900;
        (function step(now) {
          const k = Math.min(1, (now - t0) / dur);
          c.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString(loc());
          if (k < 1 && c.isConnected) requestAnimationFrame(step);
        })(t0);
      });
    }, quick ? 0 : 400 + st * 380);
    return card;
  }

  // ---------------------------------------------------------------- phone panel chip
  // On phones (body.phone-ui) a goals / lesson panel would cover the sailing area, so it shows for a few seconds when it
  // changes and then collapses to a small chip in the top-left corner; tap the chip to expand it again (tap again or wait to collapse).
  //   const chip = UI.panelChip(layer, panelEl, {icon})   chip.set({text, frac}) every paint, chip.expand(ms), chip.destroy()
  function panelChip(layer, panel, o) {
    o = o || {};
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pc-chip';
    btn.innerHTML = '<span class="pc-ico">' + iconSvg(o.icon || 'flag') + '</span><span class="pc-txt"></span><i class="pc-bar"><b></b></i>';
    layer.appendChild(btn);
    panel.classList.add('pc-panel');
    let timer = 0, open = false, last = '', dead = false;
    const apply = () => { panel.classList.toggle('pc-open', open); btn.classList.toggle('pc-on', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    function collapse() { clearTimeout(timer); open = false; apply(); }
    function expand(ms) {
      if (dead) return;
      clearTimeout(timer); open = true; apply();
      timer = setTimeout(collapse, ms || 4000);
    }
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); sfx('tap'); if (open) collapse(); else expand(6000); });
    apply();
    return {
      el: btn,
      set(v) {
        v = v || {};
        const k = (v.text || '') + '|' + Math.round((v.frac || 0) * 100);
        if (k === last) return; last = k;
        btn.classList.toggle('pc-none', !v.text);
        btn.querySelector('.pc-txt').textContent = v.text || '';
        btn.querySelector('.pc-bar b').style.width = Math.round(Math.max(0, Math.min(1, v.frac || 0)) * 100) + '%';
        btn.classList.toggle('pc-done', !!v.done);
      },
      expand, collapse,
      destroy() { dead = true; clearTimeout(timer); btn.remove(); panel.classList.remove('pc-panel', 'pc-open'); },
    };
  }

  KOS.UI = {
    toast, dialog, topDialog, trapFocus, coach, coachClose, coachSvg, setCoach, currentCoach, coachName, hud, countdown, stars, starSvg, confetti, iconSvg, icons: ICONS, panelChip,
    results, avatarSvg, AVATAR, shade, esc, el, fmtTime, reduced, sfx,
  };

  if (KOS.I18n) {
    KOS.I18n.add('da', {
      ui: {
        coach: { name: 'Træner', tap: 'Tryk for at lukke', who: { anton: 'Træner Anton', storm: 'Træner Storm', maria: 'Træner Maria', ida: 'Træner Ida', marius: 'Træner Marius', nicolas: 'Træner Nicolas', peter: 'Træner Peter', jesper: 'Træner Jesper' } },
        countdown: { go: 'Sejl!' },
        hud: { wind: 'Vind', speed: 'Fart', pos: 'Kurs', timer: 'Tid', place: 'Plads', lap: 'Omgang', score: 'Point', heel: 'Krængning', tack: 'Halse', penalty: 'Straf' },
        pos: { irons: 'I vindøjet', closehauled: 'Bidevind', closereach: 'Skarp halvvind', beamreach: 'Halvvind', broadreach: 'Slør', run: 'Læns' },
        results: {
          perfect: 'Perfekt sejlet!', great: 'Flot klaret!', good: 'Godt sejlet!', fail: 'Næsten!', perfectLand: 'Perfekt!', goodLand: 'Godt gået!',
          msgPerfect: 'Alle tre stjerner – du sejler som en ægte mester!', msgWin: 'Du er på vej mod Sejlerpasset. Kan du få alle tre stjerner?', msgFail: 'Det gør ikke noget – selv verdensmestre kæntrer. Prøv igen!', msgTry: 'Næsten! Prøv igen – du kan det.',
          newBest: 'Ny rekord!', xp: 'Erfaring', map: 'Kort',
        },
        stat: { tacks: 'Vendinger', gybes: 'Bomninger', distance: 'Distance', penalties: 'Strafrunder', place: 'Placering', correct: 'Rigtige svar', touches: 'Berøringer', rescued: 'Reddet' },
      },
    });
    KOS.I18n.add('en', {
      ui: {
        coach: { name: 'Coach', tap: 'Tap to close', who: { anton: 'Coach Anton', storm: 'Coach Storm', maria: 'Coach Maria', ida: 'Coach Ida', marius: 'Coach Marius', nicolas: 'Coach Nicolas', peter: 'Coach Peter', jesper: 'Coach Jesper' } },
        countdown: { go: 'Sail!' },
        hud: { wind: 'Wind', speed: 'Speed', pos: 'Course', timer: 'Time', place: 'Place', lap: 'Lap', score: 'Score', heel: 'Heel', tack: 'Tack', penalty: 'Penalty' },
        pos: { irons: 'In irons', closehauled: 'Close-hauled', closereach: 'Close reach', beamreach: 'Beam reach', broadreach: 'Broad reach', run: 'Run' },
        results: {
          perfect: 'Perfect sailing!', great: 'Great job!', good: 'Well sailed!', fail: 'So close!', perfectLand: 'Perfect!', goodLand: 'Well done!',
          msgPerfect: 'All three stars – you sail like a true champion!', msgWin: 'You are on your way to the Sailing Passport. Can you get all three stars?', msgFail: 'No worries – even world champions capsize. Try again!', msgTry: 'Almost! Try again – you can do it.',
          newBest: 'New record!', xp: 'Experience', map: 'Map',
        },
        stat: { tacks: 'Tacks', gybes: 'Gybes', distance: 'Distance', penalties: 'Penalty turns', place: 'Place', correct: 'Correct answers', touches: 'Touches', rescued: 'Rescued' },
      },
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
