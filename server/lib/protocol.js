'use strict';
// Message validation for the live race server. Pure, no sockets.
const PROTOCOL_VERSION = 1;
const MAX_FRAME = 2048;
const MAX_ST = 512;
const ALPHABET = 'ACDEFGHJKMNPRTUVWXY34679';
const COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#008080', '#9a6324', '#800000'];

function clean(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '').trim().slice(0, max);
}
function normCode(s) {
  if (typeof s !== 'string') return null;
  const c = s.toUpperCase().replace(/\s+/g, '');
  if (c.length !== 4) return null;
  for (const ch of c) if (ALPHABET.indexOf(ch) < 0) return null;
  return c;
}
const fin = n => typeof n === 'number' && Number.isFinite(n);
const int = n => fin(n) && Math.floor(n) === n;

const CFG_DEFAULTS = { boat: 'zest', venue: 'sound', course: 'wl', laps: 2, windDeg: 0, windKn: 10, gust: 0.4, shift: 0.4, seed: 0, maxP: 12, maxS: 900, countdownS: 20 };
function clampNum(v, lo, hi, def) {
  if (!fin(v)) return def;
  return Math.min(hi, Math.max(lo, v));
}
// Fills defaults and clamps. `base` is the existing cfg (for partial updates).
function sanitizeCfg(cfg, base, hardMaxP) {
  const b = base || CFG_DEFAULTS;
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const out = Object.assign({}, b);
  if (typeof c.boat === 'string' && /^[a-z0-9_-]{1,24}$/.test(c.boat)) out.boat = c.boat;
  if (c.venue === 'sound' || c.venue === 'bay') out.venue = c.venue;
  if (c.course === 'wl' || c.course === 'tri') out.course = c.course;
  if (c.laps !== undefined) out.laps = Math.round(clampNum(c.laps, 1, 3, b.laps));
  if (c.windDeg !== undefined) out.windDeg = Math.round(((clampNum(c.windDeg, -3600, 3600, b.windDeg) % 360) + 360) % 360);
  if (c.windKn !== undefined) out.windKn = clampNum(c.windKn, 4, 16, b.windKn);
  if (c.gust !== undefined) out.gust = clampNum(c.gust, 0, 1, b.gust);
  if (c.shift !== undefined) out.shift = clampNum(c.shift, 0, 1, b.shift);
  if (c.maxP !== undefined) out.maxP = Math.round(clampNum(c.maxP, 2, 24, b.maxP));
  if (c.maxS !== undefined) out.maxS = Math.round(clampNum(c.maxS, 60, 1800, b.maxS));
  if (c.countdownS !== undefined) out.countdownS = Math.round(clampNum(c.countdownS, 8, 60, b.countdownS));
  if (hardMaxP) out.maxP = Math.min(out.maxP, hardMaxP);
  out.seed = b.seed; // never set by clients
  return out;
}

// raw: string frame. Returns {ok:true,msg} or {ok:false}.
function validate(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_FRAME) return { ok: false };
  let m;
  try { m = JSON.parse(raw); } catch (e) { return { ok: false }; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return { ok: false };
  const bad = { ok: false };
  switch (m.t) {
    case 'hello':
      if (!fin(m.v)) return bad;
      return { ok: true, msg: { t: 'hello', v: m.v, name: clean(m.name, 16), build: clean(m.build, 32) } };
    case 'ping':
      if (!fin(m.c)) return bad;
      return { ok: true, msg: { t: 'ping', c: m.c } };
    case 'create':
      if (!m.cfg || typeof m.cfg !== 'object' || (m.hostRole !== 'sail' && m.hostRole !== 'watch')) return bad;
      return { ok: true, msg: { t: 'create', cfg: m.cfg, hostRole: m.hostRole } };
    case 'join': {
      const code = normCode(m.code);
      if (!code) return { ok: true, msg: { t: 'join', code: null } };
      return { ok: true, msg: { t: 'join', code } };
    }
    case 'cfgset':
      if (!m.cfg || typeof m.cfg !== 'object') return bad;
      return { ok: true, msg: { t: 'cfgset', cfg: m.cfg } };
    case 'kick':
      if (!int(m.id)) return bad;
      return { ok: true, msg: { t: 'kick', id: m.id } };
    case 'start': case 'leave':
      return { ok: true, msg: { t: m.t } };
    case 'st': {
      if (!Array.isArray(m.s) || m.s.length !== 9 || !m.s.every(fin)) return bad;
      if (Buffer.byteLength(raw) > MAX_ST) return bad;
      return { ok: true, msg: { t: 'st', s: m.s } };
    }
    case 'fin':
      if (!fin(m.ms)) return bad;
      return { ok: true, msg: { t: 'fin', ms: m.ms } };
    case 'resume': {
      const code = normCode(m.code);
      if (!code || !int(m.id) || typeof m.key !== 'string' || m.key.length > 32) return bad;
      return { ok: true, msg: { t: 'resume', code, id: m.id, key: m.key } };
    }
    default:
      return bad;
  }
}

module.exports = { PROTOCOL_VERSION, MAX_FRAME, MAX_ST, ALPHABET, COLORS, CFG_DEFAULTS, validate, normCode, sanitizeCfg, clean };
