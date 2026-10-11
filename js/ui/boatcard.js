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

  /** Fact box rows: from the boat definition first, then the researched fields. Rows without a value are left out. */
  function rows(def, facts) {
    const out = [];
    const motor = !!def.isMotor;
    if (def.length) out.push([t('boatcard.length'), fmt(def.length, 2) + ' m']);
    if (def.beam) out.push([t('boatcard.beam'), fmt(def.beam, 2) + ' m']);
    if (facts && facts.hull) out.push([t('boatcard.hull'), Math.round(facts.hull).toLocaleString(KOS.I18n.lang === 'da' ? 'da-DK' : 'en-GB') + ' kg']);
    if (!motor && def.sailArea) out.push([t('boatcard.sailArea'), fmt(def.sailArea, def.sailArea % 1 ? 1 : 0) + ' m²']);
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
      if (facts.sailor) out.push([t('boatcard.sailor'), tt(facts.sailor)]);
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

    // next step on the ladder
    h += '<section class="bcard-sec glass"><h2>' + ico('flag') + esc(t('boatcard.next')) + '</h2>';
    if (def.isMotor) h += '<p>' + esc(t('boatcard.nextRib')) + '</p>';
    else {
      const nx = nextOnLadder(id);
      if (!nx) h += '<p>' + esc(t('boatcard.nextTop')) + '</p>';
      else {
        const list = newInNext(def, nx).map(a => t(a[0], a[1])).join(', ');
        h += '<p class="next-boat"><b>' + esc(t('boatcard.nextBoat', { name: nx.name })) + '</b></p><p>' + esc(t('boatcard.nextNew', { list })) + '</p>';
      }
    }
    h += '</section>';
    return h + '</div>';
  }

  KOS.BoatCard = { html, polarSvg, rows, newInNext, nextOnLadder, WINDS };
})(typeof window !== 'undefined' ? window : globalThis);
