'use strict';
// Persistence of scheduled races: one small JSON file (env KOS_SCHEDULE_FILE), written atomically (tmp + fsync + rename).
// A deliberate exception to "everything in memory": a schedule must survive a restart. No data beyond the host nickname, a sha256 of the
// host secret and a salted sha256 of the creator's IP (the per-IP limits; the salt lives in the same file, the IP itself never does).
const fs = require('fs');

// -> {races: [], salt: string|''}. A missing file starts empty; a broken one is kept aside as <file>.bad (never silently overwritten).
function load(file) {
  if (!file) return { races: [], salt: '' };
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return { races: [], salt: '' }; }
  try {
    const j = JSON.parse(txt);
    return { races: j && Array.isArray(j.races) ? j.races : [], salt: j && typeof j.salt === 'string' ? j.salt : '' };
  } catch (e) {
    try { fs.renameSync(file, file + '.bad'); } catch (e2) { /* ignore */ }
    return { races: [], salt: '', bad: true };
  }
}

// -> true when the file is on disk. fsync before the rename: a power cut leaves the old file or the new one, never an empty one.
function save(file, races, salt) {
  if (!file) return true;
  const tmp = file + '.' + process.pid + '.tmp';
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, JSON.stringify({ v: 1, salt: salt || '', races }));
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e2) { /* ignore */ } }
    try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
    return false;
  }
}

module.exports = { load, save };
