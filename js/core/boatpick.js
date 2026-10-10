// KØS SEJL — js/core/boatpick.js
// Pure rules for "choose your boat" on level cards (docs/specs/boat-pick.md). No DOM, no storage.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const SAIL_BOATS = ['opti', 'tera', 'feva', 'zest', 'ilca', '29er', 'hboat', 'j70'];
  const FREE_BOATS = SAIL_BOATS.concat(['rib']);

  // Which of `candidates` (ordered) may be picked.
  //   o.def        default boat: always offered
  //   o.sailed(id) has the player sailed this boat before (progress on any activity with that boat)
  //   o.allow(id)  optional extra gate (free sailing: the per-boat activity is unlocked); when given it replaces `sailed`
  //   o.unlockAll  settings.unlockAll: everything
  function offered(candidates, o) {
    o = o || {};
    const gate = typeof o.allow === 'function' ? o.allow : (typeof o.sailed === 'function' ? o.sailed : () => false);
    return (candidates || []).filter(id => o.unlockAll || id === o.def || !!gate(id));
  }

  // Stored choices -> {pickKey: boatId} with only string keys and known boats.
  function cleanChoices(v, exists) {
    const out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    const known = typeof exists === 'function' ? exists : () => true;
    for (const k of Object.keys(v)) { if (typeof v[k] === 'string' && known(v[k])) out[k] = v[k]; }
    return out;
  }

  // The boat to use: the stored one if still offered, else the default (if offered), else the first offered.
  function resolve(stored, offeredList, def) {
    const list = offeredList || [];
    if (stored && list.indexOf(stored) >= 0) return stored;
    if (def && list.indexOf(def) >= 0) return def;
    return list[0] || def || 'opti';
  }

  KOS.BoatPick = { SAIL_BOATS, FREE_BOATS, offered, cleanChoices, resolve };
})(typeof window !== 'undefined' ? window : globalThis);
