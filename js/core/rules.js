// KØS SEJL — js/core/rules.js
// KOS.Rules: simplified Racing Rules of Sailing Part 2 + the basic COLREG collision rules.
//   KOS.Rules.rightOfWay(a, b, ctx) -> {standOn, giveWay, rule, reasonKey, reasonVars, both?}
//       ctx = {wind (wind object | dir radians), marks: [{x, y, id?, start?}], zone: 3 (lengths), mode: 'race'|'colreg',
//              nextMark?: boat -> mark id | [ids] (gate: both ids) | null, room?: mark -> {boat, astern} | {off: true} (zone-entry memory;
//              off: RRS 18.3, rule 18.2 does not apply between the two at that mark)}
//       rule: 'R10' 'R11' 'R12' 'R13' 'R18' 'R22' 'C-power-sail' 'C-overtaking' 'C-headon' 'C-crossing' 'C-sail-tack' 'C-sail-lee'
//       R18 only between boats both heading for that mark (ctx.nextMark, else boat.nextMark; unknown = yes) and never at a
//       start mark (mark.start) until both have started (boat.rc.leg >= 1, light objects: boat.started).
//       R22: a boat that is OCS (rc.ocs / ocs) or doing penalty turns (rc.pen / pen) keeps clear of boats sailing normally.
//       For 'C-headon' both boats must turn to starboard: {standOn: null, giveWay: a, both: true}.
//   KOS.Rules.overlapped(a, b), isWindward(a, b, wind), clearAstern(a, b), tackOf(boat, windDir?)
//   KOS.Rules.explain(result) -> localized reason text;  KOS.Rules.ruleName(rule) -> short localized title
//   KOS.Rules.monitor({mode, cooldown?, splitContact?, nextMark?}) -> {update(boats, wind, marks, dt) -> [{type:'foul'|'mark',
//       offender, victim, rule, reasonKey, contact, excused?}], reset()}
//       The monitor remembers per pair who had mark-room when the first of the two reached the zone (RRS 18.2(b); not between
//       opposite tacks on a beat, ended when the entitled boat passes head to wind or leaves the zone; none at all when one of them
//       was tacking when the first reached the zone: RRS 18.3, simplified), and when a boat gained
//       right of way. Within 1.2 s of a gain: gained by its own action (a finished tack or penalty, an overlap from clear astern)
//       -> the gainer broke R15 (offender, rule 'R15', reason R15-gain); otherwise -> excused. excused: nobody is penalised
//       (R15: the other boat had only just gained right of way; R16: the right-of-way boat turned so the hulls came closer, except
//       a boat entitled to mark-room, sailing within it: RRS 21).
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
      'rules.name.R22': 'Den der vender tilbage eller tager straf, viger',
      'rules.name.R15': 'Tid til at holde fri',
      'rules.name.R16': 'Kursændring',
      'rules.name.C-power-sail': 'Motor viger for sejl',
      'rules.name.C-overtaking': 'Den der overhaler, viger',
      'rules.name.C-sail-tack': 'Vinden fra bagbord viger',
      'rules.name.C-sail-lee': 'Luv viger for læ',
      'rules.name.C-headon': 'Lige imod hinanden',
      'rules.name.C-crossing': 'Krydsende kurser',
      'rules.reason.R10': 'Styrbord har ret! {give} sejler for bagbord halse (vinden kommer ind fra venstre side) og skal holde af vejen for {stand}.',
      'rules.reason.R11': 'Luv viger for læ! {give} ligger tættest på vinden og skal holde sig fri af {stand}, der ligger i læ.',
      'rules.reason.R12': 'Den bagerste viger! {give} kommer klar agterfra og skal holde fri af {stand} foran.',
      'rules.reason.R13': 'Den der slår, viger! {give} er midt i en vending og skal holde af vejen, til den er på bidevind igen.',
      'rules.reason.R18': 'Mærkeplads! {stand} ligger inderst ved mærket inden for zonen på 3 bådlængder – {give} skal give plads.',
      'rules.reason.R18-astern': 'Mærkeplads! {stand} kom først ind i zonen klar foran – {give} bagved skal give plads ved mærket.',
      'rules.reason.R22': 'Den der vender tilbage eller tager straf, viger! {give} er på vej tilbage over startlinjen eller sejler en strafrunde og skal holde af vejen for {stand}.',
      'rules.reason.R15': 'Ingen straf: {give} nåede ikke at holde fri – {stand} havde lige fået retten.',
      'rules.reason.R16': 'Ingen straf: {give} nåede ikke at holde fri – {stand} drejede hen imod {give}.',
      'rules.reason.R15-gain': 'Tid til at holde fri! {give} fik lige retten (efter en vending eller bagfra) og gav ikke {stand} tid til at holde fri.',
      'rules.reason.C-power-sail': 'Motor viger for sejl! {give} sejler for motor og skal holde af vejen for sejlbåden {stand}.',
      'rules.reason.C-overtaking': 'Den der overhaler, viger! {give} kommer bagfra og skal holde sig klar af {stand} hele vejen forbi.',
      'rules.reason.C-sail-tack': 'Søvejsregel 12: Har to sejlbåde vinden fra hver sin side, viger den med vinden fra bagbord. {give} har vinden ind fra venstre og skal holde af vejen for {stand}.',
      'rules.reason.C-sail-lee': 'Søvejsregel 12: Har to sejlbåde vinden fra samme side, viger den, der ligger mod vinden (luv). {give} skal holde fri af {stand}.',
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
      'rules.name.R22': 'Returning or penalised boat keeps clear',
      'rules.name.R15': 'Time to keep clear',
      'rules.name.R16': 'Changing course',
      'rules.name.C-power-sail': 'Power gives way to sail',
      'rules.name.C-overtaking': 'Overtaking boat keeps clear',
      'rules.name.C-sail-tack': 'Wind from port gives way',
      'rules.name.C-sail-lee': 'Windward gives way',
      'rules.name.C-headon': 'Head-on',
      'rules.name.C-crossing': 'Crossing',
      'rules.reason.R10': 'Starboard has right of way! {give} is on port tack (wind coming over the left side) and must keep clear of {stand}.',
      'rules.reason.R11': 'Windward keeps clear! {give} is closer to the wind and must stay away from {stand} to leeward.',
      'rules.reason.R12': 'The boat behind keeps clear! {give} is clear astern and must stay clear of {stand} ahead.',
      'rules.reason.R13': 'Tacking boat keeps clear! {give} is in the middle of a tack and must stay out of the way until close-hauled again.',
      'rules.reason.R18': 'Mark-room! {stand} is on the inside at the mark, inside the 3-length zone – {give} must give room.',
      'rules.reason.R18-astern': 'Mark-room! {stand} reached the zone clear ahead – {give} behind must give room at the mark.',
      'rules.reason.R22': 'Returning or penalised boat keeps clear! {give} is going back over the start line or doing a penalty turn and must keep clear of {stand}.',
      'rules.reason.R15': 'No penalty: {give} had no time to keep clear – {stand} had only just got right of way.',
      'rules.reason.R16': 'No penalty: {give} had no time to keep clear – {stand} turned towards {give}.',
      'rules.reason.R15-gain': 'Time to keep clear! {give} had only just got right of way (after a tack or from behind) and gave {stand} no time to keep clear.',
      'rules.reason.C-power-sail': 'Power gives way to sail! {give} is under motor and must keep clear of the sailing boat {stand}.',
      'rules.reason.C-overtaking': 'Overtaking boat keeps clear! {give} is coming from behind and must stay clear of {stand} all the way past.',
      'rules.reason.C-sail-tack': 'Rule 12: When two sailing boats have the wind on different sides, the one with the wind on its port side gives way. {give} has the wind over its left side and must keep clear of {stand}.',
      'rules.reason.C-sail-lee': 'Rule 12: When two sailing boats have the wind on the same side, the windward boat gives way. {give} must keep clear of {stand}.',
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
  function beamOf(b) { return b.cls ? b.cls.beam : b.beam || lengthOf(b) * 0.33; }
  const BY_THE_LEE = R(9); // the physics boats keep their tack up to 9 degrees by the lee (physics.js)
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
    if (Math.abs(twa) > Math.PI - BY_THE_LEE && boat.boom) return boat.boom < 0 ? 'starboard' : 'port'; // dead run: boom decides
    return twa >= 0 ? 'starboard' : 'port';
  }

  /** a is clear astern of b: all of a's hull is behind a line abeam of b's stern. The hull is the same capsule the contact check
   *  uses (capsuleOf): its most forward point along b's heading is the end of its centre segment plus the end radius, so a
   *  beam-on hull still reaches past its bow, and rules and contact agree on where the hull is. */
  function clearAstern(a, b) {
    const fb = U.vec(b.heading || 0), fa = U.vec(a.heading || 0);
    const sx = b.x - fb.x * lengthOf(b) / 2, sy = b.y - fb.y * lengthOf(b) / 2;
    const r = beamOf(a) * 0.45, along = Math.abs(fa.x * fb.x + fa.y * fb.y);
    return (a.x - sx) * fb.x + (a.y - sy) * fb.y + Math.max(0, lengthOf(a) / 2 - r) * along + r < 0;
  }
  function overlapped(a, b) { return !clearAstern(a, b) && !clearAstern(b, a); }

  /** Is a to windward of b? By side, as the RRS defines it: a lies on b's windward side across the two boats' mean course (the
   *  side the wind comes over: starboard on starboard tack; on a run the side away from the mainsail, which the tack gives).
   *  tack = the pair's tack (default b's). The wind line only breaks a tie (a right on the course line, or opposite headings). */
  function isWindward(a, b, wind, tack) {
    const wd = windDirOf(wind, a, b);
    const w = U.vec(wd); // points towards where the wind comes from
    const up = (a.x - b.x) * w.x + (a.y - b.y) * w.y;
    const fa = U.vec(a.heading || 0), fb = U.vec(b.heading || 0);
    let hx = fa.x + fb.x, hy = fa.y + fb.y;
    const hl = Math.hypot(hx, hy);
    if (hl < 0.2) return up > 0; // (nearly) opposite headings: no common course to measure the side across
    hx /= hl; hy /= hl;
    const lat = -(a.x - b.x) * hy + (a.y - b.y) * hx; // a's offset across the course, + = starboard
    if (Math.abs(lat) < 0.05) return up > 0;
    const tk = tack || tackOf(b, wind !== undefined ? wd : undefined);
    return tk === 'port' ? lat < 0 : lat > 0;
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

  /** The inside boat of an overlapped pair: the one on the mark's side of the other (across their mean course). With headings
   *  more than 45 degrees apart (one boat already rounding) the mean course says little: then the boat nearer the mark. */
  function insideOf(a, b, m) {
    if (Math.abs(U.angDiff(a.heading || 0, b.heading || 0)) > R(45)) return U.dist(a, m) <= U.dist(b, m) ? a : b;
    const fa = U.vec(a.heading || 0), fb = U.vec(b.heading || 0);
    let hx = fa.x + fb.x, hy = fa.y + fb.y;
    const hl = Math.hypot(hx, hy);
    if (hl < 1e-6) { hx = fa.x; hy = fa.y; } else { hx /= hl; hy /= hl; }
    const lat = p => -p.x * hy + p.y * hx; // across the course, + = starboard
    const la = lat(a), lb = lat(b), lm = lat(m);
    if (Math.abs(la - lb) < 0.05) return U.dist(a, m) < U.dist(b, m) ? a : b; // in line: the nearer boat
    return Math.abs(lm - la) < Math.abs(lm - lb) ? a : b;
  }
  /** Is the boat heading for mark m next? Unknown (no ctx.nextMark / boat.nextMark, or a mark without id) counts as yes. */
  function headsFor(b, m, ctx) {
    const n = ctx.nextMark ? ctx.nextMark(b) : b.nextMark;
    if (n === undefined || m.id === undefined) return true;
    if (n === null) return false;
    return Array.isArray(n) ? n.indexOf(m.id) >= 0 : n === m.id;
  }
  function startedOf(b) { return b.rc ? b.rc.leg >= 1 : !!b.started; }
  /** RRS 18.1: does mark-room at m apply between a and b at all (the zone aside)? */
  function r18At(a, b, m, ctx) {
    if (m.start && !(startedOf(a) && startedOf(b))) return false; // no mark-room at a starting mark before the start
    return headsFor(a, m, ctx) && headsFor(b, m, ctx);
  }
  /** RRS 22: an OCS boat sailing back towards the pre-start side and a boat doing penalty turns keep clear of everyone else.
   *  ret === false (rc.ret / ret): OCS but sailing on up the course, not returning - then the normal rules apply (RRS 22.1). */
  function keepsClear(b) { const o = b.rc || b; return !!((o.ocs && o.ret !== false) || o.pen); }

  function isBeating(b, wd) { return Math.abs(U.wrapPi(wd - (b.heading || 0))) < R(80); }
  /** RRS 18.1(a): no mark-room between boats on opposite tacks on a beat. */
  function oppBeat(a, b, wind, wd) {
    const w = wind !== undefined ? wd : undefined;
    return tackOf(a, w) !== tackOf(b, w) && isBeating(a, wd) && isBeating(b, wd);
  }

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
      // R22: returning OCS / taking a penalty -> keep clear of boats sailing normally (both: the normal rules between them)
      const ka = keepsClear(a), kb = keepsClear(b);
      if (ka && !kb) return result(b, a, 'R22');
      if (kb && !ka) return result(a, b, 'R22');
      // R13: a boat tacking keeps clear
      const ta = !!(a.r13 || a.tacking), tb = !!(b.r13 || b.tacking);
      if (ta && !tb) return result(b, a, 'R13');
      if (tb && !ta) return result(a, b, 'R13');
      if (ta && tb) { // both tacking: the one astern keeps clear, else the one on the other's port side
        if (clearAstern(a, b)) return result(b, a, 'R13');
        if (clearAstern(b, a)) return result(a, b, 'R13');
        return relBearing(a, b) > 0 ? result(b, a, 'R13') : result(a, b, 'R13');
      }

      // R18: mark-room inside the zone (not between opposite tacks on a beat)
      if (ctx.marks && ctx.marks.length) {
        const zoneL = ctx.zone || 3;
        if (!oppBeat(a, b, ctx.wind, wd)) {
          for (const m of ctx.marks) {
            if (!r18At(a, b, m, ctx)) continue;
            const da = U.dist(a, m), db = U.dist(b, m);
            const zr = zoneL * (da < db ? lengthOf(a) : lengthOf(b));
            if (da > zr || db > zr) continue;
            const memo = ctx.room && ctx.room(m); // RRS 18.2(b): the state when the first of the two reached the zone
            if (memo && memo.off) continue; // RRS 18.3: a boat tacked in the zone, 18.2 does not apply between them (R10/R11 do)
            if (memo && (memo.boat === a || memo.boat === b)) {
              const k = memo.astern ? 'rules.reason.R18-astern' : null;
              return memo.boat === a ? result(a, b, 'R18', k) : result(b, a, 'R18', k);
            }
            if (overlapped(a, b)) return insideOf(a, b, m) === a ? result(a, b, 'R18') : result(b, a, 'R18');
            if (clearAstern(a, b)) return result(b, a, 'R18', 'rules.reason.R18-astern');
            if (clearAstern(b, a)) return result(a, b, 'R18', 'rules.reason.R18-astern');
          }
        }
      }
    }

    const tA = tackOf(a, ctx.wind !== undefined ? wd : undefined), tB = tackOf(b, ctx.wind !== undefined ? wd : undefined);
    // two sailing boats outside racing: same answers as RRS 10/11/12 but under their COLREG names (rule 12 / rule 13)
    const cr = ctx.mode === 'colreg';
    if (tA !== tB) return tA === 'port' ? result(b, a, cr ? 'C-sail-tack' : 'R10') : result(a, b, cr ? 'C-sail-tack' : 'R10');
    if (overlapped(a, b)) return isWindward(a, b, wd, tA) ? result(b, a, cr ? 'C-sail-lee' : 'R11') : result(a, b, cr ? 'C-sail-lee' : 'R11');
    return clearAstern(a, b) ? result(b, a, cr ? 'C-overtaking' : 'R12') : result(a, b, cr ? 'C-overtaking' : 'R12');
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

  const REACT = 1.2; // s: time to react after the other boat gains right of way (R15) or turns towards you (R16)
  const TURN = R(10); // a change of course of at least this much within REACT counts for R16

  /** How close the hulls come over the next 2 s if boat so sails on at heading h (its own speed) and o keeps its velocity:
   *  {min, mean} hull gaps (negative = the hulls overlap). Compares a right-of-way boat's new course with its old one (R16). */
  function approach(so, o, h) {
    const vs = velOf(so), vo = velOf(o), v = U.vec(h, Math.hypot(vs.x, vs.y));
    const g = { x: 0, y: 0, heading: h, length: lengthOf(so), beam: beamOf(so) };
    const go = { x: 0, y: 0, heading: o.heading || 0, length: lengthOf(o), beam: beamOf(o) };
    let min = Infinity, sum = 0;
    for (let k = 0; k <= 10; k++) {
      const tt = k * 0.2;
      g.x = so.x + v.x * tt; g.y = so.y + v.y * tt; go.x = o.x + vo.x * tt; go.y = o.y + vo.y * tt;
      const d = hullGap(g, go);
      min = Math.min(min, d); sum += d;
    }
    return { min, mean: sum / 11 };
  }

  function monitor(opts) {
    opts = opts || {};
    let t = 0;
    const cd = {};
    // per pair: so = the right-of-way boat's id last frame, gainT/gainer = when and who last gained right of way, gainOwn = it
    // gained it by its own action (RRS 15 then binds it), ast = the id of the boat clear astern last frame (null = overlapped),
    // room = {markKey: {id, astern}}: who has mark-room, fixed when the first of the two reached the zone (RRS 18.2(b));
    // id null = no fixed entitlement (a boat passed head to wind in the zone, RRS 18.3), the fresh verdict decides
    const pairs = {};
    const seen = {}; // per boat: r13 / tack / R22 state last frame and its recent headings (R16)
    const markKey = m => (m.id !== undefined ? m.id : m.x + ',' + m.y);
    const mon = {
      fouls: [],
      reset() { t = 0; for (const o of [cd, pairs, seen]) for (const k in o) delete o[k]; mon.fouls.length = 0; },
      update(boats, wind, marks, dt) {
        t += dt || KOS.DT;
        const out = [];
        const ids = boats.map((b, i) => (b.id !== undefined && b.id !== null ? b.id : '#' + i));
        // own: did the boat itself just change its state (start a tack, change tack, start returning / a penalty)? Then the
        // other boat gaining right of way is its own doing, and it gets no time to react (RRS 15).
        // act: did it just end a state (finish a tack, change tack, finish returning / a penalty)? A right of way gained that
        // way is the gainer's own doing: it must give the other boat time to keep clear (RRS 15).
        // htw: did it just pass head to wind (start a tack, or change tack on a beat)? Ends its zone-entry mark-room (RRS 18.2(c)).
        const act = [], htw = [];
        const own = boats.map((b, i) => {
          const st = { r13: !!(b.r13 || b.tacking), tack: tackOf(b, b.tack ? undefined : windDirOf(wind, b)), kc: keepsClear(b) };
          const p = seen[ids[i]];
          const hs = p ? p.hs : [];
          hs.push({ t, h: b.heading || 0 });
          while (hs.length > 2 && hs[1].t <= t - REACT) hs.shift();
          seen[ids[i]] = Object.assign(st, { hs });
          act[i] = !!p && ((!st.r13 && p.r13) || st.tack !== p.tack || (!st.kc && p.kc));
          htw[i] = !!p && ((st.r13 && !p.r13) || (st.tack !== p.tack && isBeating(b, windDirOf(wind, b))));
          return !!p && ((st.r13 && !p.r13) || st.tack !== p.tack || (st.kc && !p.kc));
        });
        // R16, judged by its effect: the right-of-way boat at i changed course within the last REACT seconds, and its new course
        // brings the hulls closer than the old one would have (turning into the other boat's way). A turn that opens the
        // approach (ducking, bearing away from it) takes no room away and excuses nobody.
        const turnedTowards = (i, j) => {
          const so = boats[i], h0 = seen[ids[i]].hs[0].h, h1 = so.heading || 0;
          if (Math.abs(U.angDiff(h0, h1)) < TURN) return false;
          const was = approach(so, boats[j], h0), now = approach(so, boats[j], h1);
          return now.min < was.min - 0.05 || (now.min <= was.min + 0.05 && now.mean < was.mean - 0.05);
        };
        const rctx = { nextMark: opts.nextMark };
        for (let i = 0; i < boats.length; i++) {
          for (let j = i + 1; j < boats.length; j++) {
            const a = boats[i], b = boats[j];
            const pk = String(ids[i]) < String(ids[j]) ? ids[i] + '|' + ids[j] : ids[j] + '|' + ids[i]; // the same pair in any order
            let P = pairs[pk];
            const pair = () => P || (P = pairs[pk] = { so: null, gainT: -1e9, gainer: null, gainOwn: false, ast: null, room: {} });
            if (marks && marks.length && opts.mode !== 'colreg') {
              const wd = windDirOf(wind, a, b);
              for (const m of marks) {
                const mk = markKey(m), da = U.dist(a, m), db = U.dist(b, m);
                const zr = 3 * (da < db ? lengthOf(a) : lengthOf(b));
                const goneA = da > zr || !headsFor(a, m, rctx), goneB = db > zr || !headsFor(b, m, rctx);
                const memo = P && P.room[mk];
                if (memo) {
                  if (goneA && goneB) { delete P.room[mk]; continue; } // both left the zone / passed the mark
                  if (memo.id === null) continue;
                  const e = memo.id === ids[i] ? i : j;
                  if (htw[e]) { memo.id = null; continue; } // the entitled boat passed head to wind in the zone (RRS 18.2(c)(1), 18.3)
                  if (e === i ? goneA : goneB) delete P.room[mk]; // the entitled boat left the zone or passed the mark (18.2(c)(2))
                  else continue;
                }
                if ((goneA && goneB) || !r18At(a, b, m, rctx)) continue;
                if (oppBeat(a, b, wind, wd)) continue; // RRS 18.1(a): no mark-room between opposite tacks on a beat, nothing to fix
                // the first of the two has just reached the zone: an overlap gives the inside boat room, else the boat clear ahead.
                // A boat tacking right then (RRS 18.3, simplified: passing head to wind in the zone) fixes nothing: 18.2 does not
                // apply between these two at this mark until both have left the zone
                if (htw[i] || htw[j] || seen[ids[i]].r13 || seen[ids[j]].r13) { pair().room[mk] = { id: null, astern: false, off: true }; continue; }
                pair().room[mk] = overlapped(a, b) ? { id: insideOf(a, b, m) === a ? ids[i] : ids[j], astern: false }
                  : { id: clearAstern(a, b) ? ids[j] : ids[i], astern: true };
              }
            }
            if (a.capsized && b.capsized) continue;
            const L = Math.max(lengthOf(a), lengthOf(b));
            if (Math.abs(a.x - b.x) > 3 * L || Math.abs(a.y - b.y) > 3 * L) { if (P) P.so = null; continue; }
            pair();
            const row = rightOfWay(a, b, {
              wind, marks, mode: opts.mode, nextMark: opts.nextMark,
              room: m => { const r = P.room[markKey(m)]; return r && r.off ? { off: true } : r && r.id !== null ? { boat: r.id === ids[i] ? a : b, astern: r.astern } : null; },
            });
            const si = row.standOn === a ? i : row.standOn === b ? j : -1;
            const soId = si >= 0 ? ids[si] : null;
            const ast = clearAstern(a, b) ? ids[i] : clearAstern(b, a) ? ids[j] : null;
            // a gain by its own action (it finished a tack / a penalty / returning, or got an overlap from clear astern) binds the
            // gainer for REACT seconds (RRS 15); the other boat gaining right of way back in that time does not lift it
            if (soId !== null && P.so !== null && soId !== P.so && !own[si === i ? j : i] && !(P.gainOwn && t - P.gainT <= REACT)) {
              P.gainT = t; P.gainer = soId; P.gainOwn = act[si] || (P.ast === soId && ast === null);
            }
            P.so = soId; P.ast = ast;
            const gap = hullGap(a, b);
            if (gap > L) continue;
            const va = velOf(a), vb = velOf(b);
            const dx = a.x - b.x, dy = a.y - b.y, dd = Math.hypot(dx, dy) || 1;
            const closing = ((va.x - vb.x) * dx + (va.y - vb.y) * dy) / dd < -0.1;
            const contact = gap <= 0.05;
            if (!contact && !closing) continue;
            if (row.both && !contact) continue;
            const key = (a.id || i) + '|' + (b.id || j) + (opts.splitContact && contact ? '|c' : ''); // splitContact: a close-call warning must not swallow the contact a moment later (humans cannot dodge like the AI)
            if (cd[key] > t) continue;
            cd[key] = t + (opts.cooldown || 8);
            const offender = row.giveWay, victim = row.standOn || (row.giveWay === a ? b : a);
            const f = { type: 'foul', offender, victim, rule: row.rule, reasonKey: row.reasonKey, reasonVars: row.reasonVars, contact, t };
            if (si >= 0) { // no time to react (RRS 15 / 16)
              const gi = si === i ? j : i;
              if (t - P.gainT <= REACT && P.gainer === soId && P.gainOwn) {
                // the boat that just gained right of way by its own action did not give room to keep clear: it broke RRS 15
                Object.assign(f, { offender: boats[si], victim: boats[gi], rule: 'R15', baseRule: row.rule, reasonKey: 'rules.reason.R15-gain',
                  reasonVars: { give: nameOf(boats[si]), stand: nameOf(boats[gi]) } });
              } else {
                // gained without its own action (mark-room at the zone), or it turned into the give-way boat: nobody is penalised
                // R16 never excuses against the boat entitled to mark-room: it is sailing within its room as it rounds (RRS 21)
                const ex = t - P.gainT <= REACT && P.gainer === soId ? 'R15' : row.rule !== 'R18' && turnedTowards(si, gi) ? 'R16' : null;
                if (ex) Object.assign(f, { rule: ex, baseRule: row.rule, reasonKey: 'rules.reason.' + ex, excused: true });
              }
            }
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
    isPower, insideOf, keepsClear, oppBeat, strings: STR, register,
  };
})(typeof window !== 'undefined' ? window : globalThis);
