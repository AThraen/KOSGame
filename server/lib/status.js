'use strict';

// Live status file watcher for the live server.
// Pure CommonJS, Node builtins only.

const fs = require('fs');
const path = require('path');

const MODES = ['on', 'closed', 'hidden'];

function hiddenStatus() {
  return { mode: 'hidden', message: '', maxRooms: null, maxPlayers: null, minClient: null, minProto: null };
}

function cleanMessage(v) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 200);
  return s;
}

// "0.8.5" (also "0.8"); anything else = no minimum
function cleanVer(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^v?\d{1,4}\.\d{1,4}(\.\d{1,4})?$/.test(s) ? s.replace(/^v/, '') : null;
}

function cleanInt(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

/**
 * Parse a status file's text.
 * @param {string|null|undefined} text  JSON like
 *   {"mode":"on"|"closed"|"hidden","message":"...","maxRooms":40,"maxPlayers":24,"minClient":"0.8.5","minProto":2}
 * @returns {{mode: string, message: string, maxRooms: number|null, maxPlayers: number|null}}
 *   Any missing/invalid input, non-object JSON, or unknown mode yields the
 *   hidden status.
 */
function parseStatus(text) {
  if (text === null || text === undefined) return hiddenStatus();
  if (typeof text !== 'string' || text.trim() === '') return hiddenStatus();
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return hiddenStatus();
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return hiddenStatus();
  if (MODES.indexOf(obj.mode) === -1) return hiddenStatus();
  return {
    mode: obj.mode,
    message: cleanMessage(obj.message),
    maxRooms: cleanInt(obj.maxRooms),
    maxPlayers: cleanInt(obj.maxPlayers),
    minClient: cleanVer(obj.minClient),
    minProto: cleanInt(obj.minProto)
  };
}

/**
 * Watch a status file and report changes.
 * @param {object} opts
 * @param {string} [opts.file]   path to the status file (falsy => stays hidden)
 * @param {number} [opts.pollMs=5000]  polling interval in ms
 * @param {function(object):void} [opts.onChange]  called with the new status when it changes
 * @returns {{current: () => object, start: () => void, stop: () => void, reload: () => void}}
 */
function createStatus({ file, pollMs = 5000, onChange } = {}) {
  let status = hiddenStatus();
  let watcher = null;
  let timer = null;

  function read() {
    if (!file) return hiddenStatus();
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      return hiddenStatus();
    }
    return parseStatus(text);
  }

  function reload(notify = true) {
    const next = read();
    if (JSON.stringify(next) !== JSON.stringify(status)) {
      status = next;
      if (notify && typeof onChange === 'function') onChange(next);
    }
  }

  function start() {
    if (timer || watcher) return;
    reload(false); // initial synchronous read; no onChange
    if (file) {
      try {
        const dir = path.dirname(file);
        const base = path.basename(file);
        watcher = fs.watch(dir, (event, name) => {
          if (name === base) reload();
        });
        if (watcher && typeof watcher.on === 'function') {
          watcher.on('error', () => {}); // ignore watcher errors
        }
      } catch (e) {
        watcher = null; // ignore watch failures
      }
    }
    timer = setInterval(reload, pollMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (watcher) {
      try {
        watcher.close();
      } catch (e) {}
      watcher = null;
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    current() {
      return status;
    },
    start,
    stop,
    reload() {
      reload(true);
    }
  };
}

module.exports = { parseStatus, createStatus };
