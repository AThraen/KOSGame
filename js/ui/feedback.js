'use strict';
// KOS.Feedback: bug reports / feature wishes by e-mail, no server involved.
// The address is stored scrambled (reversed, every char code +1, split in two parts) and only assembled when a
// human clicks a button, so it is neither in the HTML nor the DOM until then, and never as a literal in the source.
(function (g) {
  const KOS = g.KOS = g.KOS || {};
  const U_ = 'ofbsiu', D_ = 'npd/mjbnh'; // user part, domain part (scrambled, see above)
  const unscramble = s => Array.from(s).reverse().map(c => String.fromCharCode(c.charCodeAt(0) - 1)).join('');
  const address = () => unscramble(U_) + String.fromCharCode(64) + unscramble(D_);
  const t = (k, v) => (KOS.t ? KOS.t(k, v) : k);
  const BODY_MAX = 1500;

  function buildInfo() {
    const B = KOS.BUILD || {}, w = g.window || g, nav = g.navigator || {}, scr = g.screen || {};
    let settings = {}, act = '';
    try { settings = (KOS.Storage && KOS.Storage.settings && KOS.Storage.settings()) || {}; } catch (e) { /* ignore */ }
    try { act = (KOS.App && KOS.App.run && KOS.App.run.act && KOS.App.run.act.id) || ''; } catch (e) { /* ignore */ }
    return {
      version: B.version || 'dev', channel: B.channel || 'dev',
      screen: (w.innerWidth || scr.width || 0) + 'x' + (w.innerHeight || scr.height || 0),
      dpr: w.devicePixelRatio || 1,
      ua: String(nav.userAgent || '').slice(0, 200),
      perf: KOS.Perf && KOS.Perf.level != null ? KOS.Perf.level : '',
      activity: act,
      lang: (KOS.I18n && KOS.I18n.lang) || settings.lang || '',
      tilt: settings.tilt || '', controls: settings.controls || '',
    };
  }

  function versionText() {
    const B = KOS.BUILD || {};
    return (B.version || 'dev') + (B.channel && B.channel !== 'prod' && B.channel !== B.version ? ' · ' + B.channel : '');
  }

  // kind: 'bug' | 'wish'. Returns { to, subject, body, text } (to = the assembled address: call only on a human click)
  function compose(kind, info) {
    info = info || buildInfo();
    const k = kind === 'wish' ? 'wish' : 'bug';
    const subject = t('app.feedback.' + k + 'Subject') + ' (' + info.version + ')';
    const tech = [
      'version: ' + info.version + ' (' + info.channel + ')',
      'screen: ' + info.screen + ' @' + info.dpr + 'x',
      'perf: ' + info.perf, 'activity: ' + info.activity, 'lang: ' + info.lang,
      'tilt: ' + info.tilt, 'controls: ' + info.controls, 'ua: ' + info.ua,
    ].join('\n');
    let body = t('app.feedback.' + k + 'Body') + '\n\n---\n' + t('app.feedback.techNote') + '\n' + tech;
    if (body.length > BODY_MAX) body = body.slice(0, BODY_MAX);
    return { to: address(), subject, body, text: subject + '\n\n' + body };
  }

  function mailtoUrl(kind, info) {
    const m = compose(kind, info);
    return 'mail' + 'to:' + m.to + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
  }

  function reveal(kind, box) {
    const m = compose(kind);
    box.innerHTML = '';
    const doc = box.ownerDocument;
    const a = doc.createElement('span'); a.className = 'fb-addr'; a.textContent = m.to;
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'btn btn-glass fb-copy'; b.textContent = t('app.feedback.copy');
    b.addEventListener('click', () => copy(m.to + '\n' + m.text));
    box.appendChild(a); box.appendChild(b);
    box.hidden = false;
  }

  function copy(text) {
    const done = () => { try { KOS.UI.toast(t('app.feedback.copied'), { kind: 'good' }); } catch (e) { /* ignore */ } };
    const fallback = () => {
      try {
        const d = g.document, ta = d.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; d.body.appendChild(ta); ta.select();
        const okc = d.execCommand('copy'); d.body.removeChild(ta);
        if (okc) done();
      } catch (e) { /* ignore */ }
    };
    try {
      if (g.navigator && g.navigator.clipboard && g.navigator.clipboard.writeText) g.navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  // markup shared by credits + settings: two buttons, a "show address" link and the (empty, hidden) reveal box
  function html(esc, ico) {
    return '<div class="feedback" data-fb>' +
      '<h2>' + ico('mail') + esc(t('app.feedback.title')) + '</h2>' +
      '<p class="fb-hint">' + esc(t('app.feedback.hint')) + '</p>' +
      '<div class="fb-btns"><button type="button" class="btn btn-glass" data-fb-act="bug">' + ico('wrench') + '<span>' + esc(t('app.feedback.bug')) + '</span></button>' +
      '<button type="button" class="btn btn-glass" data-fb-act="wish">' + ico('star') + '<span>' + esc(t('app.feedback.wish')) + '</span></button></div>' +
      '<button type="button" class="link-btn fb-show" data-fb-act="show">' + esc(t('app.feedback.show')) + '</button>' +
      '<div class="fb-reveal" hidden></div></div>';
  }

  function bind(sec) {
    const root = sec.querySelector('[data-fb]');
    if (!root) return;
    let kind = 'bug';
    root.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('[data-fb-act]');
      if (!b) return;
      const act = b.getAttribute('data-fb-act');
      if (act === 'show') { reveal(kind, root.querySelector('.fb-reveal')); return; }
      kind = act;
      try { g.location.href = mailtoUrl(act); } catch (e) { /* no mail app: the address link below still works */ }
    });
  }

  KOS.Feedback = { address, compose, mailtoUrl, versionText, buildInfo, html, bind, BODY_MAX };

  if (KOS.I18n && KOS.I18n.add) {
    KOS.I18n.add('da', { app: { feedback: {
      title: 'Fejl eller idé?', hint: 'Skriv til os – det åbner en mail, som først sendes når du trykker send.',
      bug: 'Rapportér en fejl', wish: 'Ønsk en funktion', show: 'Vis adresse', copy: 'Kopiér', copied: 'Kopieret – indsæt i din mail',
      bugSubject: 'KØS SEJL – fejl', wishSubject: 'KØS SEJL – ønske',
      bugBody: 'Hvad skete der?\n\n\nHvad havde du forventet?\n\n\nHvad lavede du lige før?\n',
      wishBody: 'Hvad kunne du tænke dig at spillet kunne?\n\n\nHvorfor ville det være godt?\n',
      techNote: 'Tekniske oplysninger (hjælper os med at finde fejlen – slet dem gerne):',
    }, credits: { idea: 'Idé og udvikling: Allan Thraen', volunteer: 'KØS SEJL er et frivilligt projekt for KØS Sejlsport.' } } });
    KOS.I18n.add('en', { app: { feedback: {
      title: 'Bug or idea?', hint: 'Write to us – it opens an e-mail, which is only sent when you press send.',
      bug: 'Report a bug', wish: 'Suggest a feature', show: 'Show address', copy: 'Copy', copied: 'Copied – paste it into your e-mail',
      bugSubject: 'KØS SEJL – bug', wishSubject: 'KØS SEJL – wish',
      bugBody: 'What happened?\n\n\nWhat did you expect?\n\n\nWhat were you doing just before?\n',
      wishBody: 'What would you like the game to do?\n\n\nWhy would that be good?\n',
      techNote: 'Technical details (they help us find the problem – feel free to delete them):',
    }, credits: { idea: 'Idea and development: Allan Thraen', volunteer: 'KØS SEJL is a volunteer project for KØS Sejlsport.' } } });
  }
})(typeof window !== 'undefined' ? window : globalThis);
