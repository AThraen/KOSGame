// KØS SEJL — js/ui/input.js
// KOS.Input: keyboard, mouse and multi-touch controls for the sea modes.
//
//   const ctrl = KOS.Input.attach(layer, {layout: 'sail'|'rib'|'none', spinnaker, spinnakerKind, hike, autoTrim,
//                                         joystick, extraButtons: [{id, icon, labelKey, key}], pauseButton})
//   ctrl.state  = {steer -1..1, sheet 0..1, sheetDelta -1|0|1, hike 0..1, spinnaker, throttle -1..1, action, autoTrim, buttons{}}
//   ctrl.on('action'|'pause'|'spinnaker'|'hike'|'autotrim'|'gear'|'button'|<extra id>, fn) → off()
//   ctrl.setSheet(v)                 sync the sheet thumb (e.g. from auto-trim)
//   ctrl.setIdealSheet(center, half) show the green "ideal trim" zone on the sheet slider (null hides)
//   ctrl.setThrottle(v), ctrl.setSpinnaker(on, available), ctrl.setAutoTrim(on)
//   opts.board: show the "Sværd" button (cycles Ned → Halvt → Op = state.board 1 / 0.5 / 0.15, key B; event 'board')
//     ctrl.showBoard(actual)       paint the board icon at the boat's real (animated) board position
//   opts.jib: show the small "Fok" slider next to the sheet (state.jib 0..1, state.autoJib; keys Q/Z or Shift+↑/↓;
//     events 'jib' (first manual move), 'autojib')   ctrl.setJib(v), ctrl.setIdealJib(center, half), ctrl.setAutoJib(on)
//   ctrl.setEnabled(id, bool), ctrl.highlight(id, bool)   ids: left right steer sheet hike spi throttle wheel joystick pause <extra ids>
//   ctrl.setLayout(layout, opts), ctrl.detach()
//   KOS.Input.toControls(state, boat, prevControls[, dt]) → physics controls with smooth rudder
//   KOS.Input.haptic(pattern)
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------- strings
  const STR = {
    da: {
      'input.left': 'Bagbord', 'input.right': 'Styrbord', 'input.leftHint': 'Drej til venstre', 'input.rightHint': 'Drej til højre',
      'input.sheet': 'Skøde', 'input.sheetIn': 'Hal ind', 'input.sheetOut': 'Fier ud', 'input.auto': 'AUTO',
      'input.hike': 'Hæng ud', 'input.spi': 'Spiler', 'input.gennaker': 'Gennaker',
      'input.throttle': 'Gashåndtag', 'input.ahead': 'Frem', 'input.astern': 'Bak', 'input.neutral': 'N',
      'input.wheel': 'Rat', 'input.joystick': 'Styrepind', 'input.pause': 'Pause', 'input.action': 'Handling',
      'input.horn': 'Horn', 'input.flag': 'Flag', 'input.lifebuoy': 'Redningskrans', 'input.rope': 'Tov', 'input.anchor': 'Anker',
      'input.camera': 'Kamera', 'input.help': 'Hjælp', 'input.look': 'Kig', 'input.turn': 'Strafrunde', 'input.tow': 'Slæb',
      'input.board': 'Sværd', 'input.boardDown': 'Ned', 'input.boardHalf': 'Halvt', 'input.boardUp': 'Op', 'input.boardHint': 'Sværdet ned, halvt op eller op (B)',
      'input.jib': 'Fok', 'input.jibHint': 'Fokkeskøde: hal ind / fier ud (Q / Z)',
    },
    en: {
      'input.left': 'Port', 'input.right': 'Starboard', 'input.leftHint': 'Turn left', 'input.rightHint': 'Turn right',
      'input.sheet': 'Sheet', 'input.sheetIn': 'Sheet in', 'input.sheetOut': 'Ease out', 'input.auto': 'AUTO',
      'input.hike': 'Hike', 'input.spi': 'Spinnaker', 'input.gennaker': 'Gennaker',
      'input.throttle': 'Throttle', 'input.ahead': 'Ahead', 'input.astern': 'Astern', 'input.neutral': 'N',
      'input.wheel': 'Wheel', 'input.joystick': 'Joystick', 'input.pause': 'Pause', 'input.action': 'Action',
      'input.horn': 'Horn', 'input.flag': 'Flag', 'input.lifebuoy': 'Lifebuoy', 'input.rope': 'Rope', 'input.anchor': 'Anchor',
      'input.camera': 'Camera', 'input.help': 'Help', 'input.look': 'Look', 'input.turn': 'Penalty turn', 'input.tow': 'Tow',
      'input.board': 'Board', 'input.boardDown': 'Down', 'input.boardHalf': 'Half', 'input.boardUp': 'Up', 'input.boardHint': 'Daggerboard down, half up or up (B)',
      'input.jib': 'Jib', 'input.jibHint': 'Jib sheet: in / out (Q / Z)',
    },
  };
  if (KOS.I18n && KOS.I18n.add) { try { KOS.I18n.add('da', STR.da); KOS.I18n.add('en', STR.en); } catch (e) {} }
  function tr(key) {
    if (!key) return '';
    let r = null;
    try { if (KOS.t) r = KOS.t(key); } catch (e) {}
    if (r && r !== key) return r;
    const lang = (KOS.I18n && KOS.I18n.lang) || 'da';
    return (STR[lang] && STR[lang][key]) || STR.da[key] || key;
  }
  // register lazily too, in case i18n loads/initialises later
  function ensureStrings() {
    if (ensureStrings.done || !(KOS.I18n && KOS.I18n.add)) return;
    try { KOS.I18n.add('da', STR.da); KOS.I18n.add('en', STR.en); ensureStrings.done = true; } catch (e) {}
  }

  // ---------------------------------------------------------------- icons (48×48, stroke = currentColor)
  const sv = (body, extra) => '<svg viewBox="0 0 48 48" aria-hidden="true" ' + (extra || '') + ' fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  const ICON = {
    left: sv('<path d="M33 41V25a10 10 0 0 0-10-10H11"/><path d="M19 6l-9 9 9 9"/>'),
    right: sv('<path d="M15 41V25a10 10 0 0 1 10-10h12"/><path d="M29 6l9 9-9 9"/>'),
    hike: sv('<path d="M28 41h16" stroke-width="5"/><path d="M33 37 22 25"/><circle cx="15.5" cy="19.5" r="4.5" fill="currentColor" stroke="none"/><path d="M25 28l9-5"/><path d="M33 37l-6 4" stroke-width="3"/><path d="M6 44c3-2 6-2 9 0s6 2 9 0" stroke-width="3" opacity=".6"/>'),
    spi: sv('<path d="M10 41C5 27 11 10 30 6c9 9 9 26-20 35z" fill="currentColor" fill-opacity=".25"/><path d="M30 6v35M10 41h20"/><path d="M14 30c5-1 10-4 14-9" stroke-width="2.5" opacity=".7"/>'),
    pause: sv('<rect x="13" y="10" width="7" height="28" rx="2.5" fill="currentColor"/><rect x="28" y="10" width="7" height="28" rx="2.5" fill="currentColor"/>', '').replace('stroke-width="4"', 'stroke-width="0"'),
    sheetIn: sv('<path d="M24 5c7 8 8 22 6 38H18c-2-16-1-30 6-38z" stroke-width="2.5" opacity=".7"/><path d="M24 17l2 20" stroke-width="4.5"/>'),
    sheetOut: sv('<path d="M24 5c7 8 8 22 6 38H18c-2-16-1-30 6-38z" stroke-width="2.5" opacity=".7"/><path d="M24 17l16 12" stroke-width="4.5"/>'),
    horn: sv('<path d="M8 20v8h6l14 9V11l-14 9H8z" fill="currentColor" fill-opacity=".25"/><path d="M34 17c3 4 3 10 0 14M39 12c6 7 6 17 0 24"/>'),
    flag: sv('<path d="M12 44V6"/><path d="M12 8h24l-6 8 6 8H12" fill="currentColor" fill-opacity=".25"/>'),
    lifebuoy: sv('<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="7"/><path d="M12 12l7 7M36 12l-7 7M12 36l7-7M36 36l-7-7" stroke-width="5"/>'),
    rope: sv('<path d="M10 36c0-8 8-8 8-16s-8-8-8-14M24 42c0-8 8-8 8-16s-8-8-8-14M38 36c0-6-4-8-4-12"/>'),
    anchor: sv('<circle cx="24" cy="9" r="4"/><path d="M24 13v29M15 21h18M8 28c2 9 9 14 16 14s14-5 16-14"/>'),
    camera: sv('<rect x="6" y="14" width="36" height="26" rx="5"/><path d="M17 14l3-5h8l3 5"/><circle cx="24" cy="27" r="7"/>'),
    help: sv('<circle cx="24" cy="24" r="18"/><path d="M18 19a6 6 0 1 1 8 5.6c-1.4.6-2 1.6-2 3.4"/><circle cx="24" cy="35" r="1.5" fill="currentColor"/>'),
    look: sv('<path d="M4 24s7-13 20-13 20 13 20 13-7 13-20 13S4 24 4 24z"/><circle cx="24" cy="24" r="6" fill="currentColor"/>'),
    turn: sv('<path d="M40 24a16 16 0 1 1-6-12.5"/><path d="M36 4v9h-9"/>'),
    tow: sv('<path d="M6 30h12l4-6h8l4 6h8" /><path d="M10 38c3 2 6 2 9 0s6-2 9 0 6 2 9 0"/><path d="M26 24V10l8 4-8 4" fill="currentColor" fill-opacity=".25"/>'),
    check: sv('<path d="M9 25l10 10 20-22"/>'),
    star: sv('<path d="M24 6l5.5 11.5 12.5 1.6-9.2 8.6 2.4 12.4L24 34l-11.2 6.1 2.4-12.4L6 19.1l12.5-1.6z" fill="currentColor" fill-opacity=".3"/>'),
    whistle: sv('<circle cx="18" cy="28" r="10"/><path d="M26 20h16v8H27"/><circle cx="18" cy="28" r="3" fill="currentColor"/>'),
    action: sv('<path d="M26 4L10 28h13l-2 16 16-24H24z" fill="currentColor" fill-opacity=".3"/>'),
    play: sv('<path d="M16 10l22 14-22 14z" fill="currentColor"/>'),
  };
  // daggerboard icon: hull cross-section from astern with the board at v (1 = down, 0 = up)
  function boardIcon(v) {
    const bot = 23 + 21 * clamp(v, 0, 1), top = bot - 27;
    return '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 22h42" stroke-width="2" opacity=".45" stroke-dasharray="3 3"/>' +
      '<path d="M5 15h38l-5 9H10z" fill="currentColor" fill-opacity=".22" stroke-width="3"/>' +
      '<rect x="21" y="' + top.toFixed(1) + '" width="6" height="27" rx="2" fill="currentColor" stroke-width="0"/></svg>';
  }
  const JIB_SVG = sv('<path d="M12 42L28 5c6 12 9 24 8 37z" fill="currentColor" fill-opacity=".25" stroke-width="3"/>');
  function iconFor(name) {
    if (ICON[name]) return ICON[name];
    try { if (KOS.UI && KOS.UI.iconSvg) { const s = KOS.UI.iconSvg(name); if (s) return s; } } catch (e) {}
    return '<span class="kc-letter">' + String(name || '?').slice(0, 1).toUpperCase() + '</span>';
  }
  const WHEEL_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="41" fill="none" stroke="#1d2433" stroke-width="12"/>' +
    '<circle cx="50" cy="50" r="41" fill="none" stroke="#3a4458" stroke-width="7"/>' +
    '<path d="M50 50L50 12M50 50L17 69M50 50L83 69" stroke="#cfd8e6" stroke-width="7" stroke-linecap="round"/>' +
    '<circle cx="50" cy="50" r="13" fill="#ff8a3d" stroke="#1d2433" stroke-width="3"/>' +
    '<text x="50" y="54.5" text-anchor="middle" font-size="10" font-weight="900" fill="#1d2433" font-family="system-ui,sans-serif">KØS</text>' +
    '<rect x="44" y="5" width="12" height="12" rx="4" fill="#ffc65c" stroke="#1d2433" stroke-width="2"/></svg>';

  // ---------------------------------------------------------------- haptics / sound feedback
  function haptic(p) {
    try {
      const s = KOS.Storage && KOS.Storage.settings ? KOS.Storage.settings() : null;
      if (s && (s.haptics === false || s.reducedMotion === 'haptics-off')) return;
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p);
    } catch (e) {}
  }
  function sfx(name, o) { try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(name, o); } catch (e) {} }

  const isTouchDevice = () => {
    try {
      return (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    } catch (e) { return false; }
  };

  let active = null; // only one ctrl listens to the keyboard at a time

  // ---------------------------------------------------------------- attach
  function attach(layer, opts) {
    ensureStrings();
    if (active) { try { active.detach(); } catch (e) {} }
    opts = Object.assign({ layout: 'sail', spinnaker: false, hike: true, autoTrim: false, extraButtons: [], pauseButton: true,
      board: false, jib: false, autoJib: true }, opts || {});
    const listeners = {};
    const state = { steer: 0, sheet: 0.5, sheetDelta: 0, hike: 0, spinnaker: false, throttle: 0, action: false,
      autoTrim: !!opts.autoTrim, buttons: {}, board: 1, jib: 0.5, autoJib: opts.autoJib !== false };
    const BOARD_STEPS = [1, 0.5, 0.15];
    let boardIdx = 0, boardShown = 1, idealJ = null;
    // inputs that combine into state
    const keys = new Set();
    const src = { padL: new Set(), padR: new Set(), joyX: 0, wheel: 0, wheelHeld: false, hikeHeld: new Set(),
      sheetDrag: null, jibDrag: null, thrDrag: null, keyHike: false, keyAction: false, detentHold: false };
    let ideal = null, enabled = {}, lastSteerSign = 0, raf = 0, lastT = 0, dead = false;

    const ctrl = {
      state, el: null, opts,
      on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => ctrl.off(evt, fn); },
      off(evt, fn) { const a = listeners[evt]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
      emit(evt, v) { (listeners[evt] || []).slice().forEach(fn => { try { fn(v, ctrl); } catch (e) { setTimeout(() => { throw e; }); } }); },
      setSheet(v) { if (src.sheetDrag == null) { state.sheet = clamp(+v || 0, 0, 1); paintSheet(); } },
      setIdealSheet(center, half) { ideal = center == null ? null : { c: clamp(center, 0, 1), h: clamp(half == null ? 0.08 : half, 0.01, 0.5) }; paintSheet(); },
      setThrottle(v) { state.throttle = clamp(+v || 0, -1, 1); paintThrottle(); },
      setSpinnaker(on, available) {
        if (available != null && available !== opts.spinnaker) { opts.spinnaker = !!available; render(); }
        state.spinnaker = !!on; paintToggles();
      },
      setAutoTrim(on) { state.autoTrim = !!on; paintSheet(); },
      setJib(v) { if (src.jibDrag == null) { state.jib = clamp(+v || 0, 0, 1); paintJib(); } },
      setIdealJib(center, half) { idealJ = center == null ? null : { c: clamp(center, 0, 1), h: clamp(half == null ? 0.07 : half, 0.01, 0.5) }; paintJib(); },
      setAutoJib(on) { state.autoJib = !!on; paintJib(); },
      setBoard(v) { // set the wanted board position (snaps the button to the nearest step)
        state.board = clamp(+v, 0, 1);
        let bi = 0; BOARD_STEPS.forEach((b, i) => { if (Math.abs(b - state.board) < Math.abs(BOARD_STEPS[bi] - state.board)) bi = i; });
        boardIdx = bi; paintBoard();
      },
      showBoard(v) { const nv = clamp(+v, 0, 1); if (Math.abs(nv - boardShown) > 0.01) { boardShown = nv; paintBoard(); } },
      cycleBoard() { cycleBoard(); },
      setEnabled(id, on) { enabled[id] = on !== false; const el = find(id); if (el) el.classList.toggle('kc-disabled', on === false); },
      highlight(id, on) { const el = find(id); if (el) el.classList.toggle('kc-highlight', on !== false); },
      setLayout(layout, o) { Object.assign(opts, o || {}, { layout }); render(); },
      poll() { return state; },
      detach,
    };

    const rootEl = document.createElement('div');
    rootEl.className = 'kc';
    rootEl.setAttribute('data-kc', '');
    ctrl.el = rootEl;
    layer.appendChild(rootEl);
    rootEl.addEventListener('contextmenu', e => e.preventDefault());

    function find(id) {
      const map = { left: '.kc-steer-l', right: '.kc-steer-r', steer: '.kc-steer', sheet: '.kc-sheet', hike: '.kc-hike', spi: '.kc-spi',
        throttle: '.kc-throttle', wheel: '.kc-wheel', joystick: '.kc-joy', pause: '.kc-pause', board: '.kc-board', jib: '.kc-jib' };
      return rootEl.querySelector(map[id] || '[data-btn="' + id + '"]');
    }
    const isOn = id => enabled[id] !== false;

    // ------------------------------------------------ DOM
    function mode() {
      let m = opts.joystick;
      if (m == null) { try { const s = KOS.Storage && KOS.Storage.settings && KOS.Storage.settings(); m = s && s.controls === 'joystick'; } catch (e) { m = false; } }
      return !!m;
    }
    function keycap(t) { return '<span class="kc-key">' + t + '</span>'; }
    function render() {
      const L = opts.layout, joy = mode();
      rootEl.className = 'kc kc-' + L + (joy ? ' kc-joymode' : '') + (isTouchDevice() ? ' kc-touch' : ' kc-fine') + (opts.pauseButton === false ? ' kc-nopause' : '') + (L === 'sail' && opts.board ? ' kc-hasboard' : '');
      let h = '';
      if (opts.pauseButton !== false) h += '<button class="kc-btn kc-pause" type="button" aria-label="' + tr('input.pause') + '">' + ICON.pause + keycap('P') + '</button>';
      if (L === 'sail' || L === 'rib') {
        if (joy) {
          h += '<div class="kc-joy" role="slider" aria-label="' + tr('input.joystick') + '"><div class="kc-joy-base"><i></i><i></i></div><div class="kc-joy-knob"></div>' + keycap('A D') + '</div>';
        } else if (L === 'sail') {
          h += '<div class="kc-pad kc-steer kc-steer-l" role="button" aria-label="' + tr('input.leftHint') + '">' + ICON.left + '<b>' + tr('input.left') + '</b>' + keycap('←') + '</div>';
          h += '<div class="kc-pad kc-steer kc-steer-r" role="button" aria-label="' + tr('input.rightHint') + '">' + ICON.right + '<b>' + tr('input.right') + '</b>' + keycap('→') + '</div>';
        } else {
          h += '<div class="kc-wheel" role="slider" aria-label="' + tr('input.wheel') + '"><div class="kc-wheel-rot">' + WHEEL_SVG + '</div>' + keycap('← →') + '</div>';
        }
      }
      if (L === 'sail') {
        h += '<div class="kc-slider kc-sheet" role="slider" aria-label="' + tr('input.sheet') + '">' +
          '<button class="kc-auto" type="button">' + tr('input.auto') + '</button>' +
          '<span class="kc-sl-lbl kc-top">' + ICON.sheetIn + '<b>' + tr('input.sheetIn') + '</b></span>' +
          '<div class="kc-track"><div class="kc-fill"></div><div class="kc-zone"></div><div class="kc-thumb"><i></i><i></i><i></i></div></div>' +
          '<span class="kc-sl-lbl kc-bot">' + ICON.sheetOut + '<b>' + tr('input.sheetOut') + '</b></span>' + keycap('↑ ↓') + '</div>';
        if (opts.hike !== false) h += '<button class="kc-btn kc-round kc-hike" type="button" aria-label="' + tr('input.hike') + '">' + ICON.hike + '<b>' + tr('input.hike') + '</b>' + keycap('Space') + '</button>';
        if (opts.spinnaker) h += '<button class="kc-btn kc-round kc-spi" type="button" aria-pressed="false" aria-label="' + tr(opts.spinnakerKind === 'asym' ? 'input.gennaker' : 'input.spi') + '">' + ICON.spi + '<b>' + (opts.spinnakerKind === 'asym' ? 'GEN' : 'SPI') + '</b>' + keycap('E') + '</button>';
        if (opts.jib) {
          h += '<div class="kc-slider kc-jib" role="slider" aria-label="' + tr('input.jibHint') + '" title="' + tr('input.jibHint') + '">' +
            '<button class="kc-auto" type="button">' + tr('input.auto') + '</button>' +
            '<span class="kc-sl-lbl kc-top">' + JIB_SVG + '<b>' + tr('input.jib') + '</b></span>' +
            '<div class="kc-track"><div class="kc-fill"></div><div class="kc-zone"></div><div class="kc-thumb"><i></i><i></i></div></div>' + keycap('Q Z') + '</div>';
        }
      }
      const boardBtn = L === 'sail' && opts.board;
      if (L === 'rib') {
        h += '<div class="kc-slider kc-throttle" role="slider" aria-label="' + tr('input.throttle') + '">' +
          '<span class="kc-sl-lbl kc-top"><b>' + tr('input.ahead') + '</b></span>' +
          '<div class="kc-track"><div class="kc-fill"></div><div class="kc-notch"><span>' + tr('input.neutral') + '</span></div><div class="kc-thumb kc-lever"><i></i><i></i><i></i></div></div>' +
          '<span class="kc-sl-lbl kc-bot"><b>' + tr('input.astern') + '</b></span>' + keycap('↑ ↓') + '</div>';
      }
      if ((opts.extraButtons && opts.extraButtons.length) || boardBtn) {
        h += '<div class="kc-extras">';
        if (boardBtn) h += '<button class="kc-btn kc-extra kc-board" type="button" aria-label="' + tr('input.boardHint') + '" title="' + tr('input.boardHint') + '">' +
          '<span class="kc-bd-ico"></span><span class="kc-bd-txt"><b>' + tr('input.board') + '</b><i></i></span>' + keycap('B') + '</button>';
        (opts.extraButtons || []).forEach((b, i) => {
          const lbl = b.labelKey ? tr(b.labelKey) : (b.label || tr('input.' + (b.icon || b.id)));
          h += '<button class="kc-btn kc-extra" type="button" data-btn="' + b.id + '" aria-label="' + lbl + '" title="' + lbl + '">' + iconFor(b.icon || b.id) +
            '<b>' + lbl + '</b>' + keycap(b.key || (i < 9 ? String(i + 1) : '')) + '</button>';
        });
        h += '</div>';
      }
      rootEl.innerHTML = h;
      wire();
      orient();
      paintSheet(); paintThrottle(); paintToggles(); paintSteer(); paintJib(); paintBoard();
      Object.keys(enabled).forEach(id => ctrl.setEnabled(id, enabled[id]));
    }

    // ------------------------------------------------ pointer plumbing (multi-touch: one capture per pointer)
    function press(el, h) {
      if (!el) return;
      const ptrs = new Set();
      el.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (er) {}
        ptrs.add(e.pointerId);
        if (h.down) h.down(e, ptrs);
      });
      el.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId) && h.move) h.move(e, ptrs); });
      const up = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (h.up) h.up(e, ptrs); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
    function hit(el) { // juicy ring burst
      if (!el) return;
      el.classList.remove('kc-hit'); void el.offsetWidth; el.classList.add('kc-hit');
    }
    function wire() {
      const q = s => rootEl.querySelector(s);
      press(q('.kc-pause'), { down: (e) => { hit(e.currentTarget); haptic(12); sfx('click'); ctrl.emit('pause'); } });
      ['l', 'r'].forEach(side => {
        const el = q('.kc-steer-' + side), set = side === 'l' ? src.padL : src.padR;
        press(el, {
          down: e => { if (!isOn(side === 'l' ? 'left' : 'right')) return; set.add(e.pointerId); hit(el); haptic(8); },
          up: e => { set.delete(e.pointerId); },
        });
      });
      // joystick
      const joy = q('.kc-joy');
      if (joy) {
        let cx = 0, cy = 0;
        const upd = e => {
          const R = joy.clientWidth * 0.36;
          let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          joy.querySelector('.kc-joy-knob').style.transform = 'translate(-50%,-50%) translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
          const x = dx / R; src.joyX = Math.abs(x) < 0.12 ? 0 : Math.sign(x) * (Math.abs(x) - 0.12) / 0.88;
        };
        press(joy, {
          down: e => { const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; joy.classList.add('kc-on'); haptic(8); upd(e); },
          move: upd,
          up: (e, ptrs) => { if (ptrs.size) return; src.joyX = 0; joy.classList.remove('kc-on'); joy.querySelector('.kc-joy-knob').style.transform = ''; },
        });
      }
      // wheel
      const wh = q('.kc-wheel');
      if (wh) {
        let cx = 0, cy = 0, a0 = 0, w0 = 0;
        const ang = e => Math.atan2(e.clientX - cx, -(e.clientY - cy));
        press(wh, {
          down: e => { const r = wh.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; a0 = ang(e); w0 = src.wheel; src.wheelHeld = true; wh.classList.add('kc-on'); haptic(8); },
          move: e => {
            let d = ang(e) - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            const nv = clamp(w0 + d / (Math.PI * 0.75), -1, 1);
            if (Math.abs(nv) === 1 && Math.abs(src.wheel) < 1) haptic(10);
            src.wheel = nv; a0 = ang(e); w0 = src.wheel;
          },
          up: (e, ptrs) => { if (!ptrs.size) { src.wheelHeld = false; wh.classList.remove('kc-on'); } },
        });
      }
      // sheet slider
      const sh = q('.kc-sheet');
      if (sh) {
        const track = sh.querySelector('.kc-track');
        const val = e => { const r = track.getBoundingClientRect(), th = 40; return clamp((e.clientY - r.top - th / 2) / Math.max(1, r.height - th), 0, 1); };
        press(sh.querySelector('.kc-auto'), { down: () => { state.autoTrim = !state.autoTrim; haptic(15); sfx('rigClick'); paintSheet(); ctrl.emit('autotrim', state.autoTrim); } });
        press(track, {
          down: e => {
            if (!isOn('sheet')) return;
            src.sheetDrag = e.pointerId; sh.classList.add('kc-on'); haptic(8);
            if (state.autoTrim) { state.autoTrim = false; ctrl.emit('autotrim', false); }
            setSheetFrom(val(e));
          },
          move: e => { if (src.sheetDrag === e.pointerId) setSheetFrom(val(e)); },
          up: e => { if (src.sheetDrag === e.pointerId) { src.sheetDrag = null; sh.classList.remove('kc-on'); state.sheetDelta = keySheetDelta(); } },
        });
      }
      // jib slider
      const jb = q('.kc-jib');
      if (jb) {
        const track = jb.querySelector('.kc-track');
        const val = e => { const r = track.getBoundingClientRect(), th = 34; return clamp((e.clientY - r.top - th / 2) / Math.max(1, r.height - th), 0, 1); };
        press(jb.querySelector('.kc-auto'), { down: () => { state.autoJib = !state.autoJib; haptic(15); sfx('rigClick'); paintJib(); ctrl.emit('autojib', state.autoJib); } });
        press(track, {
          down: e => {
            if (!isOn('jib')) return;
            src.jibDrag = e.pointerId; jb.classList.add('kc-on'); haptic(8);
            jibManual();
            setJibFrom(val(e));
          },
          move: e => { if (src.jibDrag === e.pointerId) setJibFrom(val(e)); },
          up: e => { if (src.jibDrag === e.pointerId) { src.jibDrag = null; jb.classList.remove('kc-on'); } },
        });
      }
      // daggerboard button
      const bd = q('.kc-board');
      press(bd, { down: () => { if (!isOn('board')) return; hit(bd); cycleBoard(); } });
      // throttle
      const th = q('.kc-throttle');
      if (th) {
        const track = th.querySelector('.kc-track');
        const val = e => { const r = track.getBoundingClientRect(), tt = 44; const u = clamp((e.clientY - r.top - tt / 2) / Math.max(1, r.height - tt), 0, 1); let v = 1 - 2 * u; if (Math.abs(v) < 0.1) v = 0; return v; };
        press(track, {
          down: e => { if (!isOn('throttle')) return; src.thrDrag = e.pointerId; th.classList.add('kc-on'); haptic(8); setThrottle(val(e)); },
          move: e => { if (src.thrDrag === e.pointerId) setThrottle(val(e)); },
          up: e => { if (src.thrDrag === e.pointerId) { src.thrDrag = null; th.classList.remove('kc-on'); } },
        });
      }
      // hike (hold)
      const hk = q('.kc-hike');
      press(hk, {
        down: e => { if (!isOn('hike')) return; src.hikeHeld.add(e.pointerId); hit(hk); haptic(14); hikeChanged(); },
        up: e => { src.hikeHeld.delete(e.pointerId); hikeChanged(); },
      });
      // spinnaker (toggle)
      const sp = q('.kc-spi');
      press(sp, { down: () => { if (!isOn('spi')) return; toggleSpi(); hit(sp); } });
      // extras
      rootEl.querySelectorAll('.kc-extra').forEach(b => {
        const id = b.getAttribute('data-btn');
        press(b, {
          down: () => { if (!isOn(id)) return; hit(b); haptic(12); sfx('tap'); state.buttons[id] = true; b.classList.add('kc-on'); fireButton(id); },
          up: (e, ptrs) => { if (!ptrs.size) { state.buttons[id] = false; b.classList.remove('kc-on'); if (id === 'action') state.action = src.keyAction; } },
        });
      });
    }
    function fireButton(id) {
      if (id === 'action') { state.action = true; ctrl.emit('action'); }
      ctrl.emit(id); ctrl.emit('button', id);
    }
    function setSheetFrom(v) {
      const prev = state.sheet;
      state.sheet = v; state.sheetDelta = v < prev - 0.002 ? -1 : v > prev + 0.002 ? 1 : 0;
      const inZ = ideal && Math.abs(v - ideal.c) <= ideal.h, wasZ = ideal && Math.abs(prev - ideal.c) <= ideal.h;
      if (inZ && !wasZ) haptic(18);
      if (Math.floor(v * 10) !== Math.floor(prev * 10)) sfx('rigClick', { vol: 0.25, pitch: 1.4 - v * 0.6 });
      paintSheet();
    }
    function jibManual() { if (state.autoJib) { state.autoJib = false; ctrl.emit('autojib', false); } ctrl.emit('jib', state.jib); }
    function setJibFrom(v) {
      const prev = state.jib;
      state.jib = v;
      const inZ = idealJ && Math.abs(v - idealJ.c) <= idealJ.h, wasZ = idealJ && Math.abs(prev - idealJ.c) <= idealJ.h;
      if (inZ && !wasZ) haptic(14);
      if (Math.floor(v * 10) !== Math.floor(prev * 10)) sfx('rigClick', { vol: 0.2, pitch: 1.6 - v * 0.6 });
      paintJib();
    }
    function cycleBoard() {
      boardIdx = (boardIdx + 1) % BOARD_STEPS.length;
      state.board = BOARD_STEPS[boardIdx];
      haptic(boardIdx === 0 ? [10, 30, 10] : 14); sfx('rigClick', { pitch: 0.8 + boardIdx * 0.2 });
      paintBoard(); ctrl.emit('board', state.board);
    }
    function setThrottle(v) {
      const prev = state.throttle;
      if (prev !== 0 && v !== 0 && Math.sign(prev) !== Math.sign(v)) v = 0; // always pass through neutral
      state.throttle = clamp(v, -1, 1);
      const s0 = Math.sign(prev), s1 = Math.sign(state.throttle);
      if (s0 !== s1) { haptic(s1 === 0 ? [10, 30, 10] : 20); ctrl.emit('gear', s1); }
      paintThrottle();
    }
    function hikeChanged() {
      const on = src.hikeHeld.size > 0 || src.keyHike;
      const el = rootEl.querySelector('.kc-hike'); if (el) el.classList.toggle('kc-on', on);
      if (on !== hikeChanged.last) { hikeChanged.last = on; ctrl.emit('hike', on); }
    }
    function toggleSpi() {
      state.spinnaker = !state.spinnaker; haptic(state.spinnaker ? [15, 40, 25] : 15); sfx(state.spinnaker ? 'pop' : 'tap');
      paintToggles(); ctrl.emit('spinnaker', state.spinnaker);
    }

    // ------------------------------------------------ painting
    function paintSheet() {
      const sh = rootEl.querySelector('.kc-sheet'); if (!sh) return;
      const v = state.sheet;
      sh.style.setProperty('--v', v.toFixed(4));
      const z = sh.querySelector('.kc-zone');
      if (ideal) { z.style.display = 'block'; sh.style.setProperty('--z0', clamp(ideal.c - ideal.h, 0, 1).toFixed(4)); sh.style.setProperty('--z1', clamp(ideal.c + ideal.h, 0, 1).toFixed(4)); }
      else z.style.display = 'none';
      sh.classList.toggle('kc-good', !!ideal && Math.abs(v - ideal.c) <= ideal.h);
      sh.classList.toggle('kc-autoon', !!state.autoTrim);
      const a = sh.querySelector('.kc-auto'); if (a) a.setAttribute('aria-pressed', state.autoTrim ? 'true' : 'false');
    }
    function paintJib() {
      const jb = rootEl.querySelector('.kc-jib'); if (!jb) return;
      const v = state.jib;
      jb.style.setProperty('--v', v.toFixed(4));
      const z = jb.querySelector('.kc-zone');
      if (idealJ && !state.autoJib) { z.style.display = 'block'; jb.style.setProperty('--z0', clamp(idealJ.c - idealJ.h, 0, 1).toFixed(4)); jb.style.setProperty('--z1', clamp(idealJ.c + idealJ.h, 0, 1).toFixed(4)); }
      else z.style.display = 'none';
      jb.classList.toggle('kc-good', !!idealJ && !state.autoJib && Math.abs(v - idealJ.c) <= idealJ.h);
      jb.classList.toggle('kc-autoon', !!state.autoJib);
      const a = jb.querySelector('.kc-auto'); if (a) a.setAttribute('aria-pressed', state.autoJib ? 'true' : 'false');
    }
    function paintBoard() {
      const bd = rootEl.querySelector('.kc-board'); if (!bd) return;
      const ico = bd.querySelector('.kc-bd-ico'); if (ico) ico.innerHTML = boardIcon(boardShown);
      const txt = bd.querySelector('.kc-bd-txt i'); if (txt) txt.textContent = tr(['input.boardDown', 'input.boardHalf', 'input.boardUp'][boardIdx]);
      bd.setAttribute('data-pos', String(boardIdx));
    }
    function paintThrottle() {
      const th = rootEl.querySelector('.kc-throttle'); if (!th) return;
      th.style.setProperty('--v', ((1 - state.throttle) / 2).toFixed(4));
      th.classList.toggle('kc-fwd', state.throttle > 0); th.classList.toggle('kc-rev', state.throttle < 0);
    }
    function paintToggles() {
      const sp = rootEl.querySelector('.kc-spi');
      if (sp) { sp.classList.toggle('kc-on', !!state.spinnaker); sp.setAttribute('aria-pressed', state.spinnaker ? 'true' : 'false'); }
    }
    function paintSteer() {
      const l = rootEl.querySelector('.kc-steer-l'), r = rootEl.querySelector('.kc-steer-r');
      const kl = keys.has('L'), kr = keys.has('R');
      if (l) l.classList.toggle('kc-on', src.padL.size > 0 || kl);
      if (r) r.classList.toggle('kc-on', src.padR.size > 0 || kr);
      const w = rootEl.querySelector('.kc-wheel-rot');
      if (w) w.style.transform = 'rotate(' + (state.steer * 135).toFixed(1) + 'deg)';
      const j = rootEl.querySelector('.kc-joy');
      if (j && !j.classList.contains('kc-on')) {
        const knob = j.querySelector('.kc-joy-knob');
        const kx = (kr ? 1 : 0) - (kl ? 1 : 0);
        knob.style.transform = kx ? 'translate(-50%,-50%) translate(' + (kx * j.clientWidth * 0.3).toFixed(1) + 'px,0)' : '';
      }
    }
    function orient() {
      const w = layer.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
      const h = layer.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
      const land = w > h;
      rootEl.classList.toggle('kc-landscape', land);
      rootEl.classList.toggle('kc-portrait', !land);
      rootEl.classList.toggle('kc-short', h < 500);
      rootEl.classList.toggle('kc-narrow', w < 360);
    }

    // ------------------------------------------------ keyboard
    const KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', Space: 'H',
      KeyE: 'SPI', Enter: 'ACT', NumpadEnter: 'ACT', KeyF: 'ACT', KeyP: 'PAUSE', Escape: 'PAUSE', KeyB: 'BOARD', KeyQ: 'JU', KeyZ: 'JD' };
    const jibKeys = () => opts.layout === 'sail' && opts.jib && isOn('jib');
    function keySheetDelta() { return (keys.has('D') ? 1 : 0) - (keys.has('U') ? 1 : 0); }
    function onKey(e) {
      if (dead) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      let k = KEYMAP[e.code] || KEYMAP[e.key];
      const down = e.type === 'keydown';
      if ((k === 'BOARD' && !(opts.board && opts.layout === 'sail')) || ((k === 'JU' || k === 'JD') && !jibKeys())) k = null; // free for extra buttons
      if (e.shiftKey && (k === 'U' || k === 'D') && jibKeys()) k = k === 'U' ? 'JU' : 'JD'; // Shift+↑/↓ = jib sheet
      if (!down && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) { keys.delete(e.code === 'ArrowUp' ? 'JU' : 'JD'); }
      if (!k && /^Digit[1-9]$/.test(e.code) && opts.extraButtons) {
        const idx = +e.code.slice(5) - 1, b = opts.extraButtons[idx];
        if (b) k = 'X:' + b.id;
      }
      if (!k && opts.extraButtons) { const b = opts.extraButtons.find(x => x.key && (x.key === e.key || x.key.toUpperCase() === (e.key || '').toUpperCase())); if (b) k = 'X:' + b.id; }
      if (!k) return;
      if (dialogOpen()) return;
      e.preventDefault();
      if (down && e.repeat && keys.has(k)) return;
      if (down) keys.add(k); else keys.delete(k);
      if (k === 'H') { src.keyHike = down && isOn('hike') && opts.layout === 'sail'; hikeChanged(); }
      else if (k === 'SPI') { if (down && opts.spinnaker && isOn('spi') && opts.layout === 'sail') toggleSpi(); }
      else if (k === 'ACT') { src.keyAction = down; state.action = down || !!state.buttons.action; if (down) { ctrl.emit('action'); flashBtn('action'); } }
      else if (k === 'PAUSE') { if (down) ctrl.emit('pause'); }
      else if (k === 'BOARD') { if (down && isOn('board')) { flashBtn('board'); cycleBoard(); } }
      else if (k === 'JU' || k === 'JD') { if (down) jibManual(); }
      else if (k.indexOf('X:') === 0) {
        const id = k.slice(2);
        if (isOn(id)) { state.buttons[id] = down; if (down) { flashBtn(id); if (id !== 'action') { ctrl.emit(id); ctrl.emit('button', id); } else { state.action = true; ctrl.emit('action'); ctrl.emit('button', id); } } else if (id === 'action') state.action = src.keyAction; }
      } else if ((k === 'U' || k === 'D') && opts.layout === 'sail') {
        if (down && state.autoTrim) { state.autoTrim = false; ctrl.emit('autotrim', false); paintSheet(); }
        if (src.sheetDrag == null) state.sheetDelta = keySheetDelta();
      } else if ((k === 'U' || k === 'D') && opts.layout === 'rib') {
        if (!down) src.detentHold = false;
      }
      paintSteer();
    }
    function flashBtn(id) { const b = id === 'board' ? rootEl.querySelector('.kc-board') : rootEl.querySelector('[data-btn="' + id + '"]'); if (b) { hit(b); b.classList.add('kc-on'); setTimeout(() => b.classList.remove('kc-on'), 140); } }
    function dialogOpen() {
      try { const d = document.getElementById('dialogs'); return !!(d && d.children.length && d.offsetParent !== null && d.querySelector('[open], .dialog, .modal')); } catch (e) { return false; }
    }
    function blur() { keys.clear(); src.keyHike = false; src.keyAction = false; state.sheetDelta = 0; hikeChanged(); paintSteer(); }

    // ------------------------------------------------ tick: combine sources, ramps
    function tick(now) {
      if (dead) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
      step(dt);
    }
    function step(dt) {
      const kl = keys.has('L'), kr = keys.has('R');
      let s = 0;
      const pl = src.padL.size > 0 || kl, pr = src.padR.size > 0 || kr;
      if (pl && !pr) s = -1; else if (pr && !pl) s = 1;
      if (opts.layout === 'rib' && !mode()) {
        // wheel springs back when released; arrow keys turn it gradually
        if (kl !== kr) src.wheel = clamp(src.wheel + (kr ? 1 : -1) * dt * 2.2, -1, 1);
        else if (!src.wheelHeld) src.wheel *= Math.pow(0.02, dt);
        if (!src.wheelHeld && kl !== kr) {} // keys own it
        if (Math.abs(src.wheel) < 0.002) src.wheel = 0;
        s = src.wheel;
      }
      if (src.joyX) s = src.joyX;
      if (!isOn('steer')) s = 0;
      state.steer = clamp(s, -1, 1);
      const sg = Math.sign(state.steer);
      if (sg !== lastSteerSign) { lastSteerSign = sg; }

      if (opts.layout === 'sail' && src.sheetDrag == null) {
        const d = keySheetDelta();
        state.sheetDelta = d;
        if (d) { const prev = state.sheet; state.sheet = clamp(state.sheet + d * 0.55 * dt, 0, 1); if (state.sheet !== prev) setSheetFrom(state.sheet); state.sheetDelta = d; }
      }
      if (opts.layout === 'sail' && opts.jib && src.jibDrag == null) {
        const dj = (keys.has('JD') ? 1 : 0) - (keys.has('JU') ? 1 : 0);
        if (dj) setJibFrom(clamp(state.jib + dj * 0.5 * dt, 0, 1));
      }
      if (opts.layout === 'rib' && src.thrDrag == null) {
        const d = (keys.has('U') ? 1 : 0) - (keys.has('D') ? 1 : 0);
        if (d && !src.detentHold) {
          const prev = state.throttle; let v = clamp(prev + d * 0.85 * dt, -1, 1);
          if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) { v = 0; src.detentHold = true; } // click into neutral; press again to shift
          setThrottle(v);
        }
      }
      const hikeOn = (src.hikeHeld.size > 0 || src.keyHike) && opts.layout === 'sail';
      state.hike = clamp(state.hike + (hikeOn ? 5 : -3.5) * dt, 0, 1);
      paintSteer();
    }

    function onResize() { orient(); }
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onResize); ro.observe(layer); }
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', blur);
    render();
    raf = requestAnimationFrame(tick);

    function detach() {
      if (dead) return; dead = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', blur);
      if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      for (const k in listeners) delete listeners[k];
      if (active === ctrl) active = null;
    }
    ctrl._step = step; // test hook: deterministic stepping
    active = ctrl;
    return ctrl;
  }

  // ---------------------------------------------------------------- state → physics controls
  function defaults() {
    try { if (KOS.Physics && KOS.Physics.controls) return KOS.Physics.controls(); } catch (e) {}
    return { rudder: 0, sheet: 0.5, hike: 0, spinnaker: false, throttle: 0, autoTrim: true, autoHike: false };
  }
  function toControls(state, boat, prev, dt) {
    const c = prev ? Object.assign({}, prev) : defaults();
    dt = dt || KOS.DT || 1 / 60;
    state = state || {};
    const target = clamp(+state.steer || 0, -1, 1);
    let r = +c.rudder || 0;
    // the helm moves the tiller smoothly: quicker back to centre than out to full lock
    const centring = Math.abs(target) < Math.abs(r) - 1e-6 || (r !== 0 && Math.sign(target) !== Math.sign(r));
    let rate = centring ? 6 : 3.4;
    const id = boat && boat.cls && boat.cls.id;
    if (id === 'rib') rate *= 1.3;
    else if (id === 'hboat' || id === 'j70') rate *= 0.8;
    // small inputs give fine control: ease near the target
    const diff = target - r;
    const stepMax = rate * dt;
    r += Math.abs(diff) <= stepMax ? diff : Math.sign(diff) * stepMax;
    if (Math.abs(r) < 1e-4) r = 0;
    c.rudder = clamp(r, -1, 1);
    if (state.sheet != null) c.sheet = clamp(state.sheet, 0, 1);
    if (state.hike != null) c.hike = clamp(state.hike, 0, 1);
    c.spinnaker = !!state.spinnaker;
    if (state.throttle != null) c.throttle = clamp(state.throttle, -1, 1);
    if (state.autoTrim != null) c.autoTrim = !!state.autoTrim;
    if (state.board != null) c.board = clamp(+state.board, 0, 1);
    if (state.jib != null) c.jib = clamp(+state.jib, 0, 1);
    if (state.autoJib != null) c.autoJib = !!state.autoJib;
    return c;
  }

  KOS.Input = { attach, toControls, haptic, icons: ICON, isTouchDevice, get active() { return active; } };
})(typeof window !== 'undefined' ? window : globalThis);
