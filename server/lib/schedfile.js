'use strict';
// Persistence of pending scheduled races: one small JSON file (env KOS_SCHEDULE_FILE), written atomically (tmp + rename).
// A deliberate exception to "everything in memory": a schedule must survive a restart. No data beyond the host nickname and a sha256 of the host secret.
const fs = require('fs');

function load(file) {
  if (!file) return [];
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return j && Array.isArray(j.races) ? j.races : [];
  } catch (e) { return []; } // missing or broken file: start empty
}

function save(file, races) {
  if (!file) return;
  const tmp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, races }));
    fs.renameSync(tmp, file);
  } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ } }
}

module.exports = { load, save };
