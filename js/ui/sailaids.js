// KØS SEJL — js/ui/sailaids.js
// KOS.SailAids: the daggerboard ("Sværd") and jib ("Fok") controls shared by the sea modes (free sail, race, nav).
//
//   const aids = KOS.SailAids.create({ctrl, boat, assist, coach})   (coach = optional fn(text) to show a tip; default KOS.UI.coach)
//   KOS.SailAids.inputOpts(cls, assist) -> {board, jib, autoJib}   pass into KOS.Input.attach(layer, {...})
//   aids.apply(controls)      after KOS.Input.toControls: Easy -> board + jib automatic; Normal/Pro -> the player's choice
//   aids.tick(dt, sailing)    per sim step: syncs the board icon / jib slider, and teaches (once per session) a board-down
//                             run, a board-up beat and a flapping jib through the coach bubble
//   aids.keys()               extra keyboard hint text (' · B sværd · Q/Z fok') for the intro, '' when nothing is shown
// Physics: KOS.Physics board / autoBoard / jib / autoJib controls (see physics.js). Analytics: emits KOS.Events
// 'controls:use' {what: 'board'|'jib'} the first time per activity the player uses one (KOS.Track records it).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  const STR = {
    da: { aids: {
      boardRun: 'Prøv at hive sværdet halvt op på læns – så glider båden lettere! Tryk SVÆRD (eller B).',
      boardBeat: 'Sværdet ned, når du krydser – ellers driver du sidelæns.',
      jibLuff: 'Fokken blafrer – hal den lidt ind!',
      keysBoard: 'B sværd', keysJib: 'Q/Z fok (eller Shift+↑/↓)',
    } },
    en: { aids: {
      boardRun: 'Try pulling the daggerboard halfway up on a run – the boat glides more easily! Tap BOARD (or B).',
      boardBeat: 'Board down when you beat upwind – or you slide sideways.',
      jibLuff: 'The jib is flapping – sheet it in a little!',
      keysBoard: 'B board', keysJib: 'Q/Z jib (or Shift+↑/↓)',
    } },
  };
  if (KOS.I18n && KOS.I18n.add) { KOS.I18n.add('da', STR.da); KOS.I18n.add('en', STR.en); }
  const t = k => (KOS.t ? KOS.t(k) : k);

  const told = {}; // per session (page load): each lesson once

  function inputOpts(cls, assist) {
    const adv = assist !== 'easy';
    return { board: !!(cls && cls.hasBoard) && adv, jib: !!(cls && cls.hasJib) && adv, autoJib: assist !== 'pro' };
  }

  function create(o) {
    const ctrl = o.ctrl, boat = o.boat, assist = o.assist || 'easy', cls = boat.cls;
    const opts = inputOpts(cls, assist);
    const say = o.coach || (txt => { try { KOS.UI.coach(txt, { ms: 5600 }); } catch (e) { /* ui optional */ } });
    const used = {};
    const timers = { run: 0, beat: 0, luff: 0 };
    function use(what) {
      if (used[what]) return;
      used[what] = true;
      try { KOS.Events.emit('controls:use', { what }); } catch (e) { /* optional */ }
    }
    if (ctrl && ctrl.on) {
      ctrl.on('board', () => use('board'));
      ctrl.on('jib', () => use('jib'));
    }
    function teach(key) {
      if (told[key]) return;
      told[key] = true;
      say(t('aids.' + key));
    }

    function apply(c) {
      if (cls.hasBoard) {
        c.autoBoard = !opts.board; // Easy (no button): the board follows the ideal by itself
        if (!opts.board) c.board = 1;
      }
      if (!opts.jib) c.autoJib = true;
      return c;
    }

    let syncT = 0;
    function tick(dt, sailing) {
      if ((syncT -= dt) <= 0) {
        syncT = 0.1;
        if (opts.board) ctrl.showBoard(boat.board);
        if (opts.jib) {
          if (ctrl.state.autoJib) { ctrl.setJib(boat.jib); ctrl.setIdealJib(null); }
          else ctrl.setIdealJib(boat.inIrons || boat.capsized ? null : KOS.Physics.idealJib(boat), 0.07);
        }
      }
      if (sailing === false || boat.capsized) return;
      const a = Math.abs(boat.twa || 0);
      if (opts.board) {
        timers.run = a > 2.44 && boat.board > 0.9 && boat.speed > 0.3 ? timers.run + dt : 0;           // TWA > 140°, board down
        timers.beat = a < cls.noGo + 0.35 && boat.board < 0.4 && boat.speed > 0.2 ? timers.beat + dt : 0; // beating with the board up
        if (timers.run > 4) teach('boardRun');
        if (timers.beat > 3) teach('boardBeat');
      }
      if (opts.jib) {
        timers.luff = boat.jibManual && boat.jibLuffing ? timers.luff + dt : 0;
        if (timers.luff > 2.5) teach('jibLuff');
      }
    }

    function keys() {
      const k = [];
      if (opts.board) k.push(t('aids.keysBoard'));
      if (opts.jib) k.push(t('aids.keysJib'));
      return k.length ? ' · ' + k.join(' · ') : '';
    }

    return { opts, apply, tick, keys };
  }

  KOS.SailAids = { create, inputOpts, _told: told };
})(typeof window !== 'undefined' ? window : globalThis);
