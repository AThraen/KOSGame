// KØS SEJL — js/core/rules.js
// KOS.Rules: simplified Racing Rules of Sailing Part 2 + the basic COLREG collision rules.
//   KOS.Rules.rightOfWay(a, b, ctx) -> {standOn, giveWay, rule, reasonKey, reasonVars, both?}
//       ctx = {wind (wind object | dir radians), marks: [{x, y}], zone: 3 (lengths), mode: 'race'|'colreg'}
//       rule: 'R10' 'R11' 'R12' 'R13' 'R18' 'C-power-sail' 'C-overtaking' 'C-headon' 'C-crossing'
//       For 'C-headon' both boats must turn to starboard: {standOn: null, giveWay: a, both: true}.
//   KOS.Rules.overlapped(a, b), isWindward(a, b, wind), clearAstern(a, b), tackOf(boat, windDir?)
//   KOS.Rules.explain(result) -> localized reason text;  KOS.Rules.ruleName(rule) -> short localized title
//   KOS.Rules.monitor({mode}) -> {update(boats, wind, marks, dt) -> [{type:'foul'|'mark', offender, victim, rule,
//       reasonKey, contact}], reset()}
// Boats may be physics boats or light scenario objects {x, y, heading, length?, tack?, r13?, isPower?, speed?, name?}.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const R = d => d * Math.PI / 180;

  // ---------------------------------------------------------------- strings
  const STR = {
    da: {
      'rules.name.R10': 'Bagbord viger for styrbord',
      'rules.name.R11': 'Luv viger for læ',
      'rules.name.R12': 'Klar agter viger',
      'rules.name.R13': 'Den der slår, viger',
      'rules.name.R18': 'Mærkeplads',
      'rules.name.C-power-sail': 'Motor viger for sejl',
      'rules.name.C-overtaking': 'Den der overhaler, viger',
      'rules.name.C-headon': 'Lige imod hinanden',
      'rules.name.C-crossing': 'Krydsende kurser',
      'rules.reason.R10': 'Styrbord har ret! {give} sejler for bagbord halse (vinden kommer ind fra venstre side) og skal holde af vejen for {stand}.',
      'rules.reason.R11': 'Luv viger for læ! {give} ligger tættest på vinden og skal holde sig fri af {stand}, der ligger i læ.',
      'rules.reason.R12': 'Den bagerste viger! {give} kommer klar agterfra og skal holde fri af {stand} foran.',
      'rules.reason.R13': 'Den der slår, viger! {give} er midt i en vending og skal holde af vejen, til den er på kryds igen.',
      'rules.reason.R18': 'Mærkeplads! {stand} ligger inderst ved mærket inden for zonen på 3 bådlængder – {give} skal give plads.',
      'rules.reason.R18-astern': 'Mærkeplads! {stand} kom først ind i zonen klar foran – {give} bagved skal give plads ved mærket.',
      'rules.reason.C-power-sail': 'Motor viger for sejl! {give} sejler for motor og skal holde af vejen for sejlbåden {stand}.',
      'rules.reason.C-overtaking': 'Den der overhaler, viger! {give} kommer bagfra og skal holde sig klar af {stand} hele vejen forbi.',
      'rules.reason.C-headon': 'Lige imod hinanden! Begge både drejer til styrbord (højre), så I passerer bagbord mod bagbord.',
      'rules.reason.C-crossing': 'Krydsende kurser: {give} har {stand} på sin styrbord side (højre) og skal vige – gå agten om den anden båd.',
      'rules.foul': 'Regelbrud! {offender} skulle have holdt af vejen for {victim}.',
      'rules.contact': 'Bump! {offender} ramte {victim}.',
      'rules.markTouch': '{offender} rørte mærket! Tag en strafrunde.',
      'rules.giveWay': 'Du skal vige',
      'rules.standOn': 'Du har ret – hold din kurs',
      'rules.you': 'Du',
      'rules.boat': 'båden',
    },
    en: {
      'rules.name.R10': 'Port gives way to starboard',
      'rules.name.R11': 'Windward keeps clear',
      'rules.name.R12': 'Clear astern keeps clear',
      'rules.name.R13': 'While tacking, keep clear',
      'rules.name.R18': 'Mark-room',
      'rules.name.C-power-sail': 'Power gives way to sail',
      'rules.name.C-overtaking': 'Overtaking boat keeps clear',
      'rules.name.C-headon': 'Head-on',
      'rules.name.C-crossing': 'Crossing',
      'rules.reason.R10': 'Starboard has right of way! {give} is on port tack (wind coming over the left side) and must keep clear of {stand}.',
      'rules.reason.R11': 'Windward keeps clear! {give} is closer to the wind and must stay away from {stand} to leeward.',
      'rules.reason.R12': 'The boat behind keeps clear! {give} is clear astern and must stay clear of {stand} ahead.',
      'rules.reason.R13': 'Tacking boat keeps clear! {give} is in the middle of a tack and must stay out of the way until close-hauled again.',
      'rules.reason.R18': 'Mark-room! {stand} is on the inside at the mark, inside the 3-length zone – {give} must give room.',
      'rules.reason.R18-astern': 'Mark-room! {stand} reached the zone clear ahead – {give} behind must give room at the mark.',
      'rules.reason.C-power-sail': 'Power gives way to sail! {give} is under motor and must keep clear of the sailing boat {stand}.',
      'rules.reason.C-overtaking': 'Overtaking boat keeps clear! {give} is coming from behind and must stay clear of {stand} all the way past.',
      'rules.reason.C-headon': 'Head-on! Both boats turn to starboard (right) and pass port side to port side.',
      'rules.reason.C-crossing': 'Crossing: {give} has {stand} on its starboard (right) side and must give way – pass behind the other boat.',
      'rules.foul': 'Foul! {offender} should have kept clear of {victim}.',
      'rules.contact': 'Bump! {offender} hit {victim}.',
      'rules.markTouch': '{offender} touched the mark! Do a penalty turn.',
      'rules.giveWay': 'You must give way',
      'rules.standOn': 'You have right of way – hold your course',
      'rules.you': 'You',
      'rules.boat': 'the boat',
    },
  };
  let registered = false;
  function register() {
    if (registered || !KOS.I18n || typeof KOS.I18n.add !== 'function') return;
    KOS.I18n.add('da', STR.da);
    KOS.I18n.add('en', STR.en);
    registered = true;
  }
  register();
  function tr(key, vars) {
    register();
    if (KOS.t) { const s = KOS.t(key, vars); if (s && s !== key) return s; }
    let s = STR.en[key] || STR.da[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    return s;
  }

  // ---------------------------------------------------------------- geometry
  function lengthOf(b) { return b.cls ? b.cls.length : b.length || 4; }
  function isPower(b) { return !!(b.isPower || b.motoring || (b.cls && b.cls.isMotor)); }
  function nameOf(b) {
    if (b.isPlayer) return tr('rules.you');
    return b.name ? (b.sailNo ? b.name + ' ' + b.sailNo : b.name) : tr('rules.boat');
  }
  function windDirOf(wind, a, b) {
    if (typeof wind === 'number') return wind;
    if (wind && typeof wind.at === 'function') {
      const x = b ? (a.x + b.x) / 2 : a.x, y = b ? (a.y + b.y) / 2 : a.y;
      return wind.at(x, y).dir;
    }
    if (wind && wind.dir !== undefined) return wind.dir;
    if (a && a.windDir !== undefined) return a.windDir;
    return 0;
  }
  function velOf(b) {
    if (b.vx !== undefined && b.vy !== undefined && (b.vx || b.vy)) return { x: b.vx, y: b.vy };
    const s = b.speed || 0;
    return U.vec(b.heading || 0, s);
  }

  /** 'starboard' | 'port'. Uses the physics tack (with by-the-lee handling) unless a wind dir is given. */
  function tackOf(boat, windDir) {
    if (boat.tack && (windDir === undefined || boat._init)) return boat.tack;
    const wd = windDir !== undefined ? windDir : boat.windDir || 0;
    const twa = U.wrapPi(wd - (boat.heading || 0));
    if (Math.abs(twa) > R(170) && boat.boom) return boat.boom < 0 ? 'starboard' : 'port'; // dead run: boom decides
    return twa >= 0 ? 'starboard' : 'port';
  }

  /** a is clear astern of b: a's bow is behind a line abeam of b's stern. */
  function clearAstern(a, b) {
    const fb = U.vec(b.heading || 0), fa = U.vec(a.heading || 0);
    const sx = b.x - fb.x * lengthOf(b) / 2, sy = b.y - fb.y * lengthOf(b) / 2;
    const bx = a.x + fa.x * lengthOf(a) / 2, by = a.y + fa.y * lengthOf(a) / 2;
    return (bx - sx) * fb.x + (by - sy) * fb.y < 0;
  }
  function overlapped(a, b) { return !clearAstern(a, b) && !clearAstern(b, a); }

  /** Is a to windward of b? */
  function isWindward(a, b, wind) {
    const wd = windDirOf(wind, a, b);
    const w = U.vec(wd); // points towards where the wind comes from
    return (a.x - b.x) * w.x + (a.y - b.y) * w.y > 0;
  }

  function relBearing(from, to) { return U.angDiff(from.heading || 0, U.bearing(from, to)); }

  function result(standOn, giveWay, rule, reasonKey, extra) {
    const r = {
      standOn, giveWay, rule, reasonKey: reasonKey || 'rules.reason.' + rule,
      reasonVars: { give: giveWay ? nameOf(giveWay) : '', stand: standOn ? nameOf(standOn) : '' },
    };
    if (extra) Object.assign(r, extra);
    return r;
  }

  function overtaking(a, b) {
    // a overtakes b: a approaches from more than 22.5° abaft b's beam and is going faster in roughly b's direction
    const rb = Math.abs(relBearing(b, a));
    if (rb <= R(112.5)) return false;
    if (Math.abs(U.angDiff(a.heading || 0, b.heading || 0)) > R(70)) return false;
    const va = velOf(a), vb = velOf(b);
    const fb = U.vec(b.heading || 0);
    return va.x * fb.x + va.y * fb.y > vb.x * fb.x + vb.y * fb.y + 0.05;
  }

  function isBeating(b, wd) { return Math.abs(U.wrapPi(wd - (b.heading || 0))) < R(80); }

  function rightOfWay(a, b, ctx) {
    ctx = ctx || {};
    register();
    const wd = windDirOf(ctx.wind, a, b);
    const pa = isPower(a), pb = isPower(b);
    const colreg = ctx.mode === 'colreg' || pa || pb;

    if (colreg) {
      if (overtaking(a, b)) return result(b, a, 'C-overtaking');
      if (overtaking(b, a)) return result(a, b, 'C-overtaking');
      if (pa && !pb) return result(b, a, 'C-power-sail');
      if (pb && !pa) return result(a, b, 'C-power-sail');
      if (pa && pb) {
        const opp = Math.abs(U.angDiff(a.heading || 0, U.wrapPi((b.heading || 0) + Math.PI)));
        if (opp < R(15) && Math.abs(relBearing(a, b)) < R(20) && Math.abs(relBearing(b, a)) < R(20)) {
          return result(null, a, 'C-headon', null, { both: true, reasonVars: { give: nameOf(a), stand: nameOf(b) } });
        }
        const ra = relBearing(a, b);
        if (ra > 0 && ra < R(112.5)) return result(b, a, 'C-crossing');
        const rbb = relBearing(b, a);
        if (rbb > 0 && rbb < R(112.5)) return result(a, b, 'C-crossing');
        // neither sees the other to starboard (diverging): whoever has the other on the port side stands on
        return ra < 0 ? result(a, b, 'C-crossing') : result(b, a, 'C-crossing');
      }
      // sail vs sail outside racing: same structure as RRS 10/11 (COLREG rule 12)
    } else {
      // R13: a boat tacking keeps clear
      const ta = !!(a.r13 || a.tacking), tb = !!(b.r13 || b.tacking);
      if (ta && !tb) return result(b, a, 'R13');
      if (tb && !ta) return result(a, b, 'R13');
      if (ta && tb) return relBearing(a, b) > 0 ? result(b, a, 'R13') : result(a, b, 'R13');

      // R18: mark-room inside the zone (not between opposite tacks on a beat)
      if (ctx.marks && ctx.marks.length) {
        const zoneL = ctx.zone || 3;
        const oppBeat = tackOf(a, ctx.wind !== undefined ? wd : undefined) !== tackOf(b, ctx.wind !== undefined ? wd : undefined) && isBeating(a, wd) && isBeating(b, wd);
        if (!oppBeat) {
          for (const m of ctx.marks) {
            const da = U.dist(a, m), db = U.dist(b, m);
            const zr = zoneL * (da < db ? lengthOf(a) : lengthOf(b));
            if (da > zr || db > zr) continue;
            if (overlapped(a, b)) return da < db ? result(a, b, 'R18') : result(b, a, 'R18');
            if (clearAstern(a, b)) return result(b, a, 'R18', 'rules.reason.R18-astern');
            if (clearAstern(b, a)) return result(a, b, 'R18', 'rules.reason.R18-astern');
          }
        }
      }
    }

    const tA = tackOf(a, ctx.wind !== undefined ? wd : undefined), tB = tackOf(b, ctx.wind !== undefined ? wd : undefined);
    if (tA !== tB) return tA === 'port' ? result(b, a, 'R10') : result(a, b, 'R10');
    if (overlapped(a, b)) return isWindward(a, b, wd) ? result(b, a, 'R11') : result(a, b, 'R11');
    return clearAstern(a, b) ? result(b, a, 'R12') : result(a, b, 'R12');
  }

  function explain(res) {
    if (!res) return '';
    return tr(res.reasonKey, res.reasonVars);
  }
  function ruleName(rule) { return tr('rules.name.' + rule); }

  // ---------------------------------------------------------------- monitor
  function capsuleOf(b) {
    const L = lengthOf(b);
    const r = (b.cls ? b.cls.beam : b.beam || L * 0.33) * 0.45;
    const f = U.vec(b.heading || 0, Math.max(0, L / 2 - r));
    return { ax: b.x + f.x, ay: b.y + f.y, bx: b.x - f.x, by: b.y - f.y, r };
  }
  function hullGap(a, b) {
    const ca = capsuleOf(a), cb = capsuleOf(b);
    return U.segSeg(ca.ax, ca.ay, ca.bx, ca.by, cb.ax, cb.ay, cb.bx, cb.by).d - ca.r - cb.r;
  }

  function monitor(opts) {
    opts = opts || {};
    let t = 0;
    const cd = {};
    const mon = {
      fouls: [],
      reset() { t = 0; for (const k in cd) delete cd[k]; mon.fouls.length = 0; },
      update(boats, wind, marks, dt) {
        t += dt || KOS.DT;
        const out = [];
        for (let i = 0; i < boats.length; i++) {
          for (let j = i + 1; j < boats.length; j++) {
            const a = boats[i], b = boats[j];
            if (a.capsized && b.capsized) continue;
            const L = Math.max(lengthOf(a), lengthOf(b));
            if (Math.abs(a.x - b.x) > 3 * L || Math.abs(a.y - b.y) > 3 * L) continue;
            const gap = hullGap(a, b);
            if (gap > L) continue;
            const row = rightOfWay(a, b, { wind, marks, mode: opts.mode });
            const va = velOf(a), vb = velOf(b);
            const dx = a.x - b.x, dy = a.y - b.y, dd = Math.hypot(dx, dy) || 1;
            const closing = ((va.x - vb.x) * dx + (va.y - vb.y) * dy) / dd < -0.1;
            const contact = gap <= 0.05;
            if (!contact && !closing) continue;
            if (row.both && !contact) continue;
            const key = (a.id || i) + '|' + (b.id || j);
            if (cd[key] > t) continue;
            cd[key] = t + (opts.cooldown || 8);
            const offender = row.giveWay, victim = row.standOn || (row.giveWay === a ? b : a);
            const f = { type: 'foul', offender, victim, rule: row.rule, reasonKey: row.reasonKey, reasonVars: row.reasonVars, contact, t };
            out.push(f);
            mon.fouls.push(f);
          }
        }
        if (marks && marks.length) {
          for (const b of boats) {
            const c = capsuleOf(b);
            for (const m of marks) {
              const d = U.segDistance(m.x, m.y, c.ax, c.ay, c.bx, c.by) - c.r - (m.r || 1.2);
              if (d > 0) continue;
              const key = (b.id || '') + '|mark|' + (m.id || m.x + ',' + m.y);
              if (cd[key] > t) continue;
              cd[key] = t + (opts.cooldown || 8);
              const f = { type: 'mark', offender: b, victim: null, mark: m, rule: 'R31', reasonKey: 'rules.markTouch', reasonVars: { offender: nameOf(b) }, contact: true, t };
              out.push(f);
              mon.fouls.push(f);
            }
          }
        }
        return out;
      },
    };
    return mon;
  }

  KOS.Rules = {
    rightOfWay, overlapped, isWindward, clearAstern, tackOf, overtaking, explain, ruleName, monitor, hullGap,
    isPower, strings: STR, register,
  };
})(typeof window !== 'undefined' ? window : globalThis);
