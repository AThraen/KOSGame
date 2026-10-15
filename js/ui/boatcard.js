// KØS SEJL — js/ui/boatcard.js
// KOS.BoatCard: the "Bådkort" (boat card) detail page opened from the Sejlerpas. Pure string builders (no DOM), so the
// node tests can run them. app.js owns the screen (renderers.boatcard) and passes in esc / ico / the boat picture.
//   KOS.BoatCard.html(id, env)   inner HTML of the scroll area. env = { esc, ico, art(id), unlocked, need, have, fav }
//   KOS.BoatCard.polarSvg(def, o) half-circle speed chart (SVG string) from def.polar(twa, tws) and def.spiFactor(twa)
//   KOS.BoatCard.rows(def, facts) fact-box rows [[label, value], ...]
//   KOS.BoatCard.newInNext(def, nextDef) -> list of i18n keys for what is new in the next boat on the ladder
// Facts live in js/core/boatfacts.js (sources in docs/reference/boat-facts.md).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const t = (k, v) => KOS.I18n.t(k, v);
  const tt = o => KOS.I18n.tt(o);
  const R = d => d * Math.PI / 180;

  KOS.I18n.add('da', {
    boatcard: {
      title: 'Bådkort', back: 'Tilbage til Sejlerpasset', art: 'Tegning af {name}',
      lockedTitle: 'Ikke låst op endnu', teaser: 'Lidt om båden',
      facts: 'Fakta', fun: 'Vidste du det?', club: 'I KØS', chart: 'Hvor hurtig er den?', next: 'Næste trin',
      length: 'Længde', beam: 'Bredde', hull: 'Skrogvægt', sailArea: 'Sejlareal', crew: 'Besætning', sails: 'Sejl', keelOrBoard: 'Køl / sværd',
      designer: 'Konstrueret af', year: 'År', country: 'Land', status: 'Klasse', sailor: 'Typisk sejler',
      main: 'Storsejl', jib: 'Fok', gennaker: 'Gennaker', spinnaker: 'Spinnaker',
      keel: 'Fast køl', board: 'Sværd, kan hejses', trapeze: 'Trapez', motor: 'Motor',
      persons: '{n} pers.', person1: '1 person',
      chartHelp: 'Fart i spillet ved forskellige vindstyrker. Jo længere ude, jo hurtigere. Vinden kommer fra venstre.',
      chartInto: 'Mod vinden', chartAcross: 'Tværs', chartWith: 'Med vinden',
      chartLine: 'Fuld streg: uden gennaker', chartSpi: 'Stiplet: med gennaker', chartSpi2: 'Stiplet: med spinnaker',
      chartLabel: '{name}: fart i knob ved {winds}. Hurtigst ca. {max} knob.',
      wind: 'Vind', topSpeed: 'Topfart i spillet', topSpeedNote: 'En RIB har motor og skal ikke sejle efter vinden.',
      nextBoat: 'Næste båd: {name}', nextNew: 'Nyt: {list}', nextTop: 'Du er helt øverst på bådstigen!',
      nextRib: 'RIB’en er en motorbåd og står uden for bådstigen.',
      newJib: 'fok', newGennaker: 'gennaker', newSpinnaker: 'spinnaker', newTrapeze: 'trapez', newKeel: 'køl', newNoCapsize: 'kan ikke kæntre',
      newCrew: 'flere ombord ({n})', newSail: 'mere sejl ({n} m²)', newLonger: 'længere ({n} m)',
      newSimple: 'lidt mere fart og fart i pusten',
      weightTitle: 'Hvilken vægt passer?', weightIntro: 'Vægten på sejlerne afgør mest, hvilken båd der passer bedst. Vinduerne er en vejledning, ikke et facit. I hård vind er et mindre sejl bedst, i let vind et større.',
      weightUnit1: 'kg', weightUnit2: 'kg pr. sejler', weightTotal: 'Besætning i alt {a}–{b} kg',
      legCore: 'Kerne: optimal vægt', legExt: 'Udvidet zone: her er de fleste', legEdge: 'Randzone ±2,5 kg: virker fint, koster lidt fart',
      weightLabel: '{name}: kerne {c1}–{c2} kg, udvidet zone {e1}–{e2} kg.', weightSrc: 'Kilde: KØS Sejlsport, “Vores jolleflåde”.',
      clubFigure: 'klubbens tal', gennakerArea: 'Gennaker-areal', rigs: 'Rig i klassen', kg: 'ca. {a}–{b} kg', kgPer: 'ca. {a}–{b} kg pr. sejler',
      nextPhilo: 'Ny båd er sjovt – men du bliver bedst af at sejle den samme båd i mange slags vejr, sammen med andre i samme båd.',
      nextWhen: 'Hvis du vokser ud af den, passer disse til din vægt:', nextNewIn: 'Nyt',
    },
  });
  KOS.I18n.add('en', {
    boatcard: {
      title: 'Boat card', back: 'Back to the Sailing Passport', art: 'Drawing of {name}',
      lockedTitle: 'Not unlocked yet', teaser: 'A little about this boat',
      facts: 'Facts', fun: 'Did you know?', club: 'At KØS', chart: 'How fast is it?', next: 'Next step',
      length: 'Length', beam: 'Beam', hull: 'Hull weight', sailArea: 'Sail area', crew: 'Crew', sails: 'Sails', keelOrBoard: 'Keel / board',
      designer: 'Designed by', year: 'Year', country: 'Country', status: 'Class', sailor: 'Typical sailor',
      main: 'Mainsail', jib: 'Jib', gennaker: 'Gennaker', spinnaker: 'Spinnaker',
      keel: 'Fixed keel', board: 'Daggerboard, can be raised', trapeze: 'Trapeze', motor: 'Engine',
      persons: '{n} people', person1: '1 person',
      chartHelp: 'Speed in the game at different wind strengths. The further out, the faster. The wind comes from the left.',
      chartInto: 'Into the wind', chartAcross: 'Across', chartWith: 'Downwind',
      chartLine: 'Solid line: no gennaker', chartSpi: 'Dashed: with gennaker', chartSpi2: 'Dashed: with spinnaker',
      chartLabel: '{name}: speed in knots at {winds}. Fastest about {max} knots.',
      wind: 'Wind', topSpeed: 'Top speed in the game', topSpeedNote: 'A RIB has an engine and does not sail by the wind.',
      nextBoat: 'Next boat: {name}', nextNew: 'New: {list}', nextTop: 'You are at the very top of the boat ladder!',
      nextRib: 'The RIB is a motor boat and sits outside the boat ladder.',
      newJib: 'a jib', newGennaker: 'a gennaker', newSpinnaker: 'a spinnaker', newTrapeze: 'a trapeze', newKeel: 'a keel', newNoCapsize: 'it cannot capsize',
      newCrew: 'more people aboard ({n})', newSail: 'more sail ({n} m²)', newLonger: 'longer ({n} m)',
      newSimple: 'a bit more speed and more power in the gusts',
      weightTitle: 'Which weight fits?', weightIntro: 'The sailors’ weight mostly decides which boat fits best. The windows are guidance, not an exact answer. In strong wind a smaller sail is better, in light wind a bigger one.',
      weightUnit1: 'kg', weightUnit2: 'kg per sailor', weightTotal: 'Crew total {a}–{b} kg',
      legCore: 'Core: optimal weight', legExt: 'Extended zone: most sailors are here', legEdge: 'Edge zone ±2.5 kg: works, costs a little speed',
      weightLabel: '{name}: core {c1}–{c2} kg, extended zone {e1}–{e2} kg.', weightSrc: 'Source: KØS Sejlsport, “Vores jolleflåde”.',
      clubFigure: 'club figure', gennakerArea: 'Gennaker area', rigs: 'Rigs in the class', kg: 'about {a}–{b} kg', kgPer: 'about {a}–{b} kg per sailor',
      nextPhilo: 'A new boat is fun – but you get best by sailing the same boat in many kinds of weather, together with others in the same boat.',
      nextWhen: 'If you grow out of it, these fit your weight:', nextNewIn: 'New',
    },
  });

  const WINDS = [6, 12, 18]; // true wind in knots; shown in the player's wind unit
  const COLORS = ['#7fe3a8', '#49c6f2', '#ffb547']; // light, medium, strong wind (also told apart by the legend text)

  const fmt = (n, dec) => {
    const s = (+n).toFixed(dec === undefined ? 1 : dec);
    return KOS.I18n.lang === 'da' ? s.replace('.', ',') : s;
  };
  const num = v => (Math.round(v * 100) / 100);

  function sailNames(def) {
    if (def.isMotor || def.id === 'rib') return [];
    const out = [t('boatcard.main')];
    if (def.hasJib) out.push(t('boatcard.jib'));
    if (def.hasSpinnaker === 'asym') out.push(t('boatcard.gennaker'));
    else if (def.hasSpinnaker === 'sym') out.push(t('boatcard.spinnaker'));
    return out;
  }

  const fmtM = v => fmt(v, (String(v).split('.')[1] || '').length);
  const rng = r => r[0] + '–' + r[1];
  /** Typical sailor in kg from the club weight windows (core). Empty when the boat has none. */
  function kgText(facts) {
    const w = facts && facts.weight;
    if (!w) return '';
    if (w.rows.length === 1) return t(w.twoPerson ? 'boatcard.kgPer' : 'boatcard.kg', { a: w.rows[0].core[0], b: w.rows[0].core[1] });
    return w.rows.map(r => r.label.replace(/^RS Tera /, '') + ' ' + t('boatcard.kg', { a: r.core[0], b: r.core[1] })).join(' · ');
  }
  /** Weight window chart: 30-80 kg axis, core solid, extended hatched, edge (extended +-2.5) faint dashed. */
  function weightSvg(facts) {
    const w = facts.weight, two = !!w.twoPerson;
    const W = 340, x0 = 8, x1 = 332, k = (x1 - x0) / 50, X = kg => Math.round((x0 + (Math.max(30, Math.min(80, kg)) - 30) * k) * 10) / 10;
    const rowH = 44, top = 22, H = top + w.rows.length * rowH + 4;
    const cls = two ? ' two' : '';
    const hid = 'wt-hatch' + (two ? '2' : '1');
    const p = ['<defs><pattern id="' + hid + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="wt-hl' + cls + '"/></pattern></defs>'];
    for (let g = 30; g <= 80; g += 10) {
      p.push('<line class="wt-grid" x1="' + X(g) + '" x2="' + X(g) + '" y1="' + (top - 6) + '" y2="' + (H - 2) + '"/>');
      p.push('<text class="wt-tick" x="' + X(g) + '" y="11" text-anchor="' + (g === 30 ? 'start' : g === 80 ? 'end' : 'middle') + '">' + g + '</text>');
    }
    w.rows.forEach((r, i) => {
      const y = top + i * rowH, by = y + 20, bh = 14;
      p.push('<text class="wt-name" x="' + x0 + '" y="' + (y + 12) + '">' + esc0(r.label) + '</text>');
      p.push('<text class="wt-sail" x="' + x1 + '" y="' + (y + 12) + '" text-anchor="end">' + esc0(fmtM(r.sail) + ' m² · ' + rng(r.core) + ' kg') + '</text>');
      p.push('<rect class="wt-edge' + cls + '" x="' + X(r.ext[0] - 2.5) + '" y="' + by + '" width="' + (X(r.ext[1] + 2.5) - X(r.ext[0] - 2.5)) + '" height="' + bh + '" rx="3"/>');
      p.push('<rect class="wt-ext' + cls + '" x="' + X(r.ext[0]) + '" y="' + by + '" width="' + (X(r.ext[1]) - X(r.ext[0])) + '" height="' + bh + '" fill="url(#' + hid + ')"/>');
      p.push('<rect class="wt-core' + cls + '" x="' + X(r.core[0]) + '" y="' + by + '" width="' + (X(r.core[1]) - X(r.core[0])) + '" height="' + bh + '" rx="2"/>');
    });
    const label = w.rows.map(r => t('boatcard.weightLabel', { name: r.label, c1: r.core[0], c2: r.core[1], e1: r.ext[0], e2: r.ext[1] })).join(' ');
    return '<svg class="wt-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc0(label) + '">' + p.join('') + '</svg>';
  }
  function weightHtml(facts) {
    const w = facts.weight, two = !!w.twoPerson, c2 = two ? ' two' : '';
    let h = '<p class="dim">' + esc0(t('boatcard.weightIntro')) + '</p>';
    h += '<p class="wt-unit' + c2 + '">' + esc0(t(two ? 'boatcard.weightUnit2' : 'boatcard.weightUnit1')) + '</p>';
    h += '<div class="wt-wrap">' + weightSvg(facts) + '</div>';
    if (two && w.total) h += '<p class="wt-total">' + esc0(t('boatcard.weightTotal', { a: w.total[0], b: w.total[1] })) + '</p>';
    h += '<ul class="wt-legend"><li><i class="wt-sw core' + c2 + '"></i>' + esc0(t('boatcard.legCore')) + '</li><li><i class="wt-sw ext' + c2 + '"></i>' + esc0(t('boatcard.legExt')) + '</li><li><i class="wt-sw edge"></i>' + esc0(t('boatcard.legEdge')) + '</li></ul>';
    return h + '<p class="pc-note">' + esc0(t('boatcard.weightSrc')) + '</p>';
  }

  /** Fact box rows: from the boat definition first, then the researched fields. Rows without a value are left out. */
  function rows(def, facts) {
    const out = [];
    const motor = !!def.isMotor;
    if (def.length) out.push([t('boatcard.length'), fmt(def.length, 2) + ' m']);
    if (def.beam) out.push([t('boatcard.beam'), fmt(def.beam, 2) + ' m']);
    if (facts && facts.hull) out.push([t('boatcard.hull'), Math.round(facts.hull).toLocaleString(KOS.I18n.lang === 'da' ? 'da-DK' : 'en-GB') + ' kg']);
    if (!motor && facts && facts.sails) {
      const v = facts.sails.map(x => (x.label ? tt(x.label) + ' ' : '') + fmtM(x.m2)).join(' · ') + ' m²' + (facts.sailNoteClub ? ' (' + t('boatcard.clubFigure') + ')' : '');
      out.push([t('boatcard.sailArea'), v]);
      if (facts.gennaker) out.push([t('boatcard.gennakerArea'), fmt(facts.gennaker, 1) + ' m²']);
      if (facts.rigs) out.push([t('boatcard.rigs'), tt(facts.rigs)]);
    } else if (!motor && def.sailArea) out.push([t('boatcard.sailArea'), fmt(def.sailArea, def.sailArea % 1 ? 1 : 0) + ' m²']);
    if (!motor) out.push([t('boatcard.crew'), def.crew > 1 ? t('boatcard.persons', { n: def.crew }) : t('boatcard.person1')]);
    if (!motor) out.push([t('boatcard.sails'), sailNames(def).join(' · ')]);
    if (!motor) {
      const kb = def.keel ? t('boatcard.keel') : def.hasBoard ? t('boatcard.board') : '';
      const parts = [kb, def.trapeze ? t('boatcard.trapeze') : ''].filter(Boolean);
      if (parts.length) out.push([t('boatcard.keelOrBoard'), parts.join(' · ')]);
    }
    if (facts) {
      if (facts.designer) out.push([t('boatcard.designer'), facts.designer]);
      if (facts.year) out.push([t('boatcard.year'), String(facts.year)]);
      if (facts.country) out.push([t('boatcard.country'), tt(facts.country)]);
      if (facts.status) out.push([t('boatcard.status'), tt(facts.status)]);
      const sl = [facts.sailor ? tt(facts.sailor) : '', kgText(facts)].filter(Boolean).join(' · ');
      if (sl) out.push([t('boatcard.sailor'), sl]);
    }
    return out;
  }

  /** What is new in `next` compared with `cur` (i18n keys with optional vars). Only derived from the game's boat data. */
  function newInNext(cur, next) {
    const out = [];
    if (next.hasJib && !cur.hasJib) out.push(['boatcard.newJib']);
    if (next.hasSpinnaker !== 'none' && cur.hasSpinnaker === 'none') out.push([next.hasSpinnaker === 'sym' ? 'boatcard.newSpinnaker' : 'boatcard.newGennaker']);
    if (next.trapeze && !cur.trapeze) out.push(['boatcard.newTrapeze']);
    if (next.keel && !cur.keel) out.push(['boatcard.newKeel']);
    if (next.canCapsize === false && cur.canCapsize !== false) out.push(['boatcard.newNoCapsize']);
    if (next.crew > cur.crew) out.push(['boatcard.newCrew', { n: next.crew }]);
    if (next.sailArea > cur.sailArea * 1.1) out.push(['boatcard.newSail', { n: fmt(next.sailArea, next.sailArea % 1 ? 1 : 0) }]);
    if (!out.length && next.length > cur.length) out.push(['boatcard.newLonger', { n: fmt(next.length, 2) }]);
    if (!out.length) out.push(['boatcard.newSimple']);
    return out;
  }

  /**
   * Half-circle speed chart. The wind comes from the left: 0° (into the wind) is the left end of the flat edge,
   * 90° (across) is straight down, 180° (downwind) is the right end. Radius = boat speed in knots.
   * o = { winds: [kn...], windTxt: fn(kn) -> text, name }
   */
  function polarSvg(def, o) {
    o = o || {};
    const winds = o.winds || WINDS;
    const wtxt = o.windTxt || (k => (KOS.U && KOS.U.windTxt ? KOS.U.windTxt(k) : k + ' kn'));
    const W = 340, H = 232, cx = W / 2, cy = 22, Rr = 150;
    const step = 5, STEP = 2; // degrees between samples
    const curves = winds.map((tws, wi) => {
      const base = [], kite = [];
      let max = 0;
      for (let a = 0; a <= 180; a += STEP) {
        const sp = def.polar(R(a), tws);
        base.push([a, sp]);
        if (def.hasSpinnaker && def.hasSpinnaker !== 'none') {
          const f = def.spiFactor(R(a));
          if (f > 1.001 && !def.spiCollapsedAt(R(a))) kite.push([a, sp * f]);
        }
        max = Math.max(max, sp, kite.length && kite[kite.length - 1][0] === a ? kite[kite.length - 1][1] : 0);
      }
      return { tws, wi, base, kite, max };
    });
    let vmax = 0;
    for (const c of curves) vmax = Math.max(vmax, c.max);
    const ringStep = vmax > 14 ? 5 : vmax > 6.5 ? 2 : 1;
    const top = Math.max(ringStep, Math.ceil(vmax / ringStep) * ringStep);
    const px = (a, s) => [cx - Rr * (s / top) * Math.cos(R(a)), cy + Rr * (s / top) * Math.sin(R(a))];
    const f1 = v => Math.round(v * 10) / 10;
    const path = pts => pts.map((p, i) => { const q = px(p[0], p[1]); return (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); }).join('');
    const parts = [];
    // rings + speed labels along the 90° line... labels sit on the left part of each ring so they stay clear of the curves
    for (let s = ringStep; s <= top + 1e-6; s += ringStep) {
      const r = Rr * s / top;
      parts.push('<path class="pc-ring" d="M' + f1(cx - r) + ' ' + cy + 'A' + f1(r) + ' ' + f1(r) + ' 0 0 0 ' + f1(cx + r) + ' ' + cy + '"/>');
      parts.push('<text class="pc-tick" x="' + f1(cx) + '" y="' + f1(cy + r - 3) + '" text-anchor="middle">' + s + '</text>');
    }
    parts.push('<path class="pc-axis" d="M' + f1(cx - Rr - 4) + ' ' + cy + 'H' + f1(cx + Rr + 4) + 'M' + cx + ' ' + cy + 'V' + f1(cy + Rr + 4) + '"/>');
    // the no-go zone is a pie slice with no speed; only draw the edge as a light guide
    const labelY = H - 6;
    parts.push('<text class="pc-end" x="' + (cx - Rr) + '" y="' + (cy - 7) + '" text-anchor="start">' + esc0(t('boatcard.chartInto')) + '</text>');
    parts.push('<text class="pc-end" x="' + (cx + Rr) + '" y="' + (cy - 7) + '" text-anchor="end">' + esc0(t('boatcard.chartWith')) + '</text>');
    parts.push('<text class="pc-end" x="' + (cx + 6) + '" y="' + f1(cy + Rr + 14) + '" text-anchor="start">' + esc0(t('boatcard.chartAcross')) + '</text>');
    parts.push('<text class="pc-unit" x="' + (cx + 5) + '" y="' + (cy + 11) + '">kn</text>');
    for (const c of curves) {
      const col = COLORS[c.wi % COLORS.length];
      parts.push('<path class="pc-line" d="' + path(c.base) + '" stroke="' + col + '"/>');
      if (c.kite.length > 1) parts.push('<path class="pc-line pc-kite" d="' + path(c.kite) + '" stroke="' + col + '"/>');
    }
    void step; void labelY;
    const labelWinds = winds.map(wtxt).join(', ');
    return '<svg class="polar-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc0(t('boatcard.chartLabel', { name: o.name || def.name, winds: labelWinds, max: fmt(vmax, 1) })) + '">' + parts.join('') + '</svg>';
  }
  function esc0(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function legendHtml(def, o) {
    const winds = (o && o.winds) || WINDS;
    const wtxt = (o && o.windTxt) || (k => k + ' kn');
    let h = '<ul class="pc-legend">' + winds.map((k, i) => '<li><i style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc0(t('boatcard.wind')) + ' ' + esc0(wtxt(k)) + '</li>').join('') + '</ul>';
    if (def.hasSpinnaker && def.hasSpinnaker !== 'none') {
      h += '<p class="pc-note"><span class="pc-sw"></span>' + esc0(t('boatcard.chartLine')) + ' · <span class="pc-sw dash"></span>' + esc0(t(def.hasSpinnaker === 'sym' ? 'boatcard.chartSpi2' : 'boatcard.chartSpi')) + '</p>';
    }
    return h;
  }

  /** The ladder is the sailing boats in list order; the RIB stands outside it. */
  function nextOnLadder(id) {
    const sail = KOS.Boats.list.filter(b => !b.isMotor);
    const i = sail.findIndex(b => b.id === id);
    if (i < 0) return null;
    return sail[i + 1] || null;
  }

  function html(id, env) {
    const def = KOS.Boats.get(id);
    const facts = (KOS.BoatFacts && KOS.BoatFacts.get(id)) || null;
    const esc = env.esc, ico = env.ico;
    const un = env.unlocked;
    const dot = '<span class="bcard-art-wrap' + (un ? '' : ' locked') + '" role="img" aria-label="' + esc(t('boatcard.art', { name: def.name })) + '">' + env.art(id) + '</span>';
    let h = '<div class="bcard">';
    h += '<section class="bcard-hero glass">' + dot;
    h += '<div class="bcard-chips">';
    if (un && def.crew && !def.isMotor) h += '<span class="chip-lite">' + ico('user') + esc(def.crew > 1 ? t('boatcard.persons', { n: def.crew }) : t('boatcard.person1')) + '</span>';
    if (un && facts && facts.status) h += '<span class="chip-lite">' + ico('trophy') + esc(tt(facts.status)) + '</span>';
    if (un && def.ageHint) h += '<span class="chip-lite">' + esc(tt(def.ageHint)) + '</span>';
    if (!un) h += '<span class="chip-lite lock">' + ico('lock') + esc(t('boatcard.lockedTitle')) + '</span>';
    h += '</div>';
    if (un && def.desc) h += '<p class="bcard-desc">' + esc(tt(def.desc)) + '</p>';
    if (!un) h += '<p class="lock-txt">' + ico('lock') + ' ' + esc(t('app.garage.needStars', { n: env.need, have: env.have })) + '</p>';
    h += '</section>';

    if (!un) {
      const teasers = facts ? (facts.teaser || [0]).map(i => facts.facts[i]).filter(Boolean) : [];
      if (teasers.length) {
        h += '<section class="bcard-sec glass"><h2>' + ico('sparkle') + esc(t('boatcard.teaser')) + '</h2><ul class="fun-list">' +
          teasers.map(f => '<li>' + esc(tt(f)) + '</li>').join('') + '</ul></section>';
      }
      return h + '</div>';
    }

    h += '<section class="bcard-sec glass"><h2>' + ico('info') + esc(t('boatcard.facts')) + '</h2><dl class="fact-grid">' +
      rows(def, facts).map(r => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl></section>';

    if (facts && facts.facts && facts.facts.length) {
      h += '<section class="bcard-sec glass"><h2>' + ico('sparkle') + esc(t('boatcard.fun')) + '</h2><ul class="fun-list">' +
        facts.facts.map(f => '<li>' + esc(tt(f)) + '</li>').join('') + '</ul></section>';
    }
    if (facts && facts.club) {
      h += '<section class="bcard-sec glass club-sec"><h2>' + ico('anchor') + esc(t('boatcard.club')) + '</h2><ul class="fun-list">' +
        facts.club.map(f => '<li>' + esc(tt(f)) + '</li>').join('') + '</ul></section>';
    }

    h += '<section class="bcard-sec glass"><h2>' + ico('speed') + esc(t('boatcard.chart')) + '</h2>';
    if (def.isMotor) {
      const mk = (def.motor && def.motor.maxKn) || def.maxKn;
      h += '<div class="topspeed"><b>' + esc(fmt(mk, 0)) + '</b><span>kn</span></div><p class="dim">' + esc(t('boatcard.topSpeed')) + '. ' + esc(t('boatcard.topSpeedNote')) + '</p>';
    } else {
      const o = { winds: WINDS, windTxt: env.windTxt || (k => KOS.U.windTxt(k)), name: def.name };
      h += '<p class="dim">' + esc(t('boatcard.chartHelp')) + '</p><div class="polar-wrap">' + polarSvg(def, o) + '</div>' + legendHtml(def, o);
    }
    h += '</section>';

    // weight windows (club sheet): never asks the player for a weight
    if (facts && facts.weight) h += '<section class="bcard-sec glass wt-sec"><h2>' + ico('user') + esc(t('boatcard.weightTitle')) + '</h2>' + weightHtml(facts) + '</section>';

    // next step: club philosophy first, then boats that fit the weight window (or the game ladder for the keelboats)
    h += '<section class="bcard-sec glass"><h2>' + ico('flag') + esc(t('boatcard.next')) + '</h2>';
    if (def.isMotor) h += '<p>' + esc(t('boatcard.nextRib')) + '</p>';
    else {
      const picks = facts && facts.next ? facts.next.map(n => ({ id: n.id, name: tt(n.name), why: tt(n.why) })) : null;
      const nx = picks ? null : nextOnLadder(id);
      if (!picks && !nx) h += '<p>' + esc(t('boatcard.nextTop')) + '</p>';
      else {
        h += '<p class="next-philo">' + esc(t('boatcard.nextPhilo')) + '</p>';
        if (picks) {
          h += '<p class="dim">' + esc(t('boatcard.nextWhen')) + '</p><ul class="next-list">';
          for (const n of picks) {
            const tg = KOS.Boats.get(n.id);
            const skip = ['boatcard.newSail', 'boatcard.newSimple', 'boatcard.newLonger'];
            const nw = tg && tg.id !== def.id ? newInNext(def, tg).filter(x => !skip.includes(x[0])) : [];
            h += '<li class="next-boat"><b>' + esc(n.name) + '</b> – ' + esc(n.why) + (nw.length ? ' <span class="next-new">' + esc(t('boatcard.nextNewIn')) + ': ' + esc(nw.map(x => t(x[0], x[1])).join(', ')) + '.</span>' : '') + '</li>';
          }
          h += '</ul>';
        } else {
          const list = newInNext(def, nx).map(x => t(x[0], x[1])).join(', ');
          h += '<p class="next-boat"><b>' + esc(t('boatcard.nextBoat', { name: nx.name })) + '</b></p><p>' + esc(t('boatcard.nextNew', { list })) + '</p>';
        }
      }
    }
    h += '</section>';
    return h + '</div>';
  }

  KOS.BoatCard = { weightSvg, kgText, html, polarSvg, rows, newInNext, nextOnLadder, WINDS };
})(typeof window !== 'undefined' ? window : globalThis);
