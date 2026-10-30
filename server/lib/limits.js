'use strict';

// Rate-limiting / connection-accounting helpers for the live server.
// Pure CommonJS, Node builtins only.

/**
 * Token bucket.
 * @param {object} opts
 * @param {number} [opts.rate=1]   tokens added per second
 * @param {number} [opts.burst=1]  bucket capacity (also the starting token count)
 * @param {function():number} [opts.now=Date.now]  clock in ms
 * @returns {{take: (n?: number) => boolean}}
 */
function createBucket({ rate = 1, burst = 1, now = Date.now } = {}) {
  let tokens = burst;
  let last = now();
  return {
    take(n = 1) {
      const t = now();
      if (t > last) {
        tokens = Math.min(burst, tokens + ((t - last) / 1000) * rate);
        last = t;
      }
      if (tokens >= n) {
        tokens -= n;
        return true;
      }
      return false;
    }
  };
}

/**
 * Connection counter with a global cap and a per-IP cap.
 * @param {object} opts
 * @param {number} [opts.maxTotal=Infinity]  max simultaneous connections overall
 * @param {number} [opts.maxPerIp=Infinity]  max simultaneous connections per IP
 * @returns {{add: (ip: string) => boolean, remove: (ip: string) => void,
 *            total: () => number, perIp: (ip: string) => number}}
 */
function createConnCounter({ maxTotal = Infinity, maxPerIp = Infinity } = {}) {
  const perIp = new Map();
  let total = 0;
  return {
    add(ip, force) { // force: over the caps, for a socket that replaces one being terminated (its remove() follows)
      const c = perIp.get(ip) || 0;
      if (!force && (total >= maxTotal || c >= maxPerIp)) return false;
      perIp.set(ip, c + 1);
      total++;
      return true;
    },
    remove(ip) {
      const c = perIp.get(ip) || 0;
      if (c <= 0) return;
      if (c <= 1) perIp.delete(ip);
      else perIp.set(ip, c - 1);
      total = Math.max(0, total - 1);
    },
    total() {
      return total;
    },
    perIp(ip) {
      return perIp.get(ip) || 0;
    }
  };
}

/**
 * Sliding-window drop tracker.
 * @param {object} opts
 * @param {number} [opts.limit=1]      number of drops that trips the tracker
 * @param {number} [opts.windowMs=60000] window length in ms
 * @param {function():number} [opts.now=Date.now]  clock in ms
 * @returns {{drop: () => boolean}}
 *   drop() records a drop at now(); returns true when `limit` or more drops
 *   happened within the last windowMs (caller should then close the socket).
 */
function createDropTracker({ limit = 1, windowMs = 60000, now = Date.now } = {}) {
  const drops = [];
  return {
    drop() {
      const t = now();
      drops.push(t);
      const cutoff = t - windowMs;
      while (drops.length && drops[0] <= cutoff) drops.shift();
      return drops.length >= limit;
    }
  };
}

/**
 * The key for per-client limits (scheduling, GET /rooms). One IPv6 client controls a whole /64 and can rotate the rest of the
 * address, so an IPv6 address counts as its /64 prefix; an IPv4-mapped address (::ffff:1.2.3.4) counts as the IPv4 address.
 * @param {string} ip
 * @returns {string}
 */
function ipKey(ip) {
  let s = String(ip || '').trim().toLowerCase();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (m) return m[1];
  if (s.indexOf(':') < 0) return s;
  s = s.split('%')[0]; // zone id
  const halves = s.split('::');
  const head = halves[0] ? halves[0].split(':') : [];
  let parts = head;
  if (halves.length > 1) {
    const tail = halves[1] ? halves[1].split(':') : [];
    parts = head.concat(new Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), tail);
  }
  return parts.slice(0, 4).map(x => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}

module.exports = { createBucket, createConnCounter, createDropTracker, ipKey };
