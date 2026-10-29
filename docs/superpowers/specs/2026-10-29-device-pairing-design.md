# KØS SEJL: same sailor on several devices, step 1 (issue #35)

Status: written 2026-10-29. Track B, built after the Christmas calendar (`2026-10-29-christmas-calendar-design.md`). It is not needed for 1 Dec, but if it ships in December the calendar state syncs with it.

## 1. Intent
Kids play on a phone, a tablet and a parent's laptop, and Export/Import is too clumsy. Step 1 lets a player link devices with a short code or QR, after which progress (stars, XP, badges, profile, Christmas state) syncs in the background. There are **no usernames, passwords, e-mail or real names**. Holdsport member links, trainer teams and e-mail magic links are later steps of #35.

## 2. Goals, non-goals, anti-goals
- **Goals:**
  - "Tilføj enhed" in the garage/passport shows a 6-character code and a QR (valid for 10 minutes).
  - On the other device, "Jeg har en kode" + the code → both devices are now the same sailor.
  - Automatic sync on start, after each result, and when the app returns to the foreground.
  - Merge without data loss.
  - Unlink a device; delete the sailor (GDPR).
- **Non-goals:** Holdsport, e-mail, trainer view, highscores, live-race identity (later issues).
- **Anti-goals:**
  - The game ever needing the server.
  - Any personal data beyond the nickname already in the profile.
  - A sync that loses stars.

## 3. Architecture
- **New service `server/api/` (`kos-api`):**
  - Node 20, **no dependencies** (my call: `node:http`, plus a JSON-file store with one file per account and atomic write via rename, so there is no native build on Windows or Ubuntu; SQLite can come with highscores).
  - It listens on `127.0.0.1:8790` (prod) / `8791` (test); nginx serves it at `/api/` and `/api-test/`, with systemd unit `kos-api@.service`.
  - A kill switch reuses the status-file idea: `api-status.json` `{state: on|closed|hidden}`.
- **Identity:**
  - Account id: 128-bit random.
  - Each device gets a device token (256-bit random), stored hashed (sha256) server-side.
  - The client keeps `{accountId, deviceToken}` in `KOS.Storage` key `sync`.
- **Endpoints** (JSON; CORS limited to the game origins like `kos-race`; rate-limited per IP):
  - `POST /v1/account` → `{accountId, deviceToken}` (created lazily on the first "Tilføj enhed").
  - `POST /v1/pair/start` (auth) → `{code, expiresAt}` (6 chars from an unambiguous alphabet, single-use, 10 min).
  - `POST /v1/pair/claim {code}` → `{accountId, deviceToken}`.
  - `GET /v1/save` (auth) → `{rev, save}`; `PUT /v1/save {baseRev, save}` (auth) → `{rev, save}` (the server merges; it never blindly overwrites).
  - `GET /v1/devices`, `DELETE /v1/devices/:id`, `DELETE /v1/account` (auth).
- **The save document** is the set of `KOS.Storage` keys that represent progress: `progress`, `xp`, `badges`, `profile`, `boat`, `boatPick`, `xmas2026` (and future `xmasYYYY`). Settings stay per device.
- **Merge** (pure, shared file `js/core/savemerge.js`, used by both server and client, unit-tested):
  - progress: per activity, max of stars/best/done/plays (a sum would double-count after repeated syncs), min of bestTimeMs, max of last.
  - xp = max. (Not a sum, for the same reason; this accepts losing XP earned in parallel on two devices before the first sync, which is a small loss.)
  - badges = union.
  - profile = most recently changed (`updatedAt`; add it).
  - xmas = `KOS.Xmas.merge`.
- **Client `js/net/sync.js`:**
  - lazy and only active when linked;
  - checks the status file; on failure it stays silent and shows a small "ikke synkroniseret" note in the garage;
  - never blocks gameplay.
  The UI lives in the garage/passport: "Mine enheder" with link, code entry, QR (a tiny QR generator vendored in `js/vendor/`) and unlink.

## 4. Safety and privacy
Only the nickname/age band/sail number already in the profile, plus progress. Codes are single-use and rate-limited (5 claims/min/IP, lockout after 20 failures). Tokens are hashed at rest. A privacy note text in the app is required before production; Allan gets the board's approval (issue checklist #38).

## 5. Testing
- `tools/test-api.js`:
  - endpoint tests against an in-process server on a temp data dir;
  - pairing happy path, expired/used code, rate limit, merge cases;
  - a concurrent PUT with a stale baseRev gets merged, not lost.
- `test-core`: `savemerge` properties (idempotent, commutative, no star ever decreases).
- A headless two-context e2e: device A earns stars, links, device B claims the code, and B shows A's stars; then B finds an elf and A sees it after the sync.

## 6. Deployment (Allan)
Same pattern as `kos-race`: copy `server/`, then `kos-api@8790`/`@8791` env files with `KOS_API_DATA=/var/lib/kos-api/<port>`, add the nginx `location /api/`, a nightly `tar` backup of the data dir, and start hidden → test → on.
