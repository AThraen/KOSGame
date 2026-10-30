# Live race: right-of-way fixes, open race list, scheduled races

Status: written 2026-10-30, ready to build on branch `live-rules`. Issues: #28 (live race), #37 steps 1 + scheduling.

The base contract is `docs/specs/live-race.md`. This document changes it where stated; everything else there still holds: no chat or free text, nicknames only, the game works without the server, and AI races stay bit-for-bit unchanged.

The evidence for part A is the review scripts in `tools/tmp/rowreview/` (`scenarios.js`, `live.js`, `phones.js`). Each fix must turn its repro into a passing automated test.

## A. Right-of-way fixes (`js/core/rules.js`, `js/modes/race.js`, `js/net/mpstate.js`, `js/net/mp.js`)

Apply in this order. "AI races" means `!LIVE`. Rule fixes 3–7 are real rules bugs and apply to AI races too; update the existing tests in `tools/test-core.js` when a test was asserting the old, wrong behaviour.

1. **Send tack and R13 state.**
   - **Change:** add two bits to the `st` flags `fl` (64 = port tack, 128 = r13/tacking). Remote boats use the received values, with no local physics guess; between packets keep the last received value.
   - **Compatibility:** bump `PROTOCOL_VERSION` (server + client) and use the existing version gate, so old clients get the friendly "update the game" message.
   - **Fixes:** luffing shown as tacking; port/starboard flipping on a run.
2. **No R18 at the start.** Exclude the starting marks (pin, and the committee boat already) from R18 for a boat until it has started (`rc.leg >= 1` or the equivalent). R11/R10 then apply at the pin (RRS 18.1).
3. **Mark-room goes to the inside boat.** When overlapped, the inside boat is the one whose side faces the mark; decide by which side of the other boat the mark lies on, not by distance to the mark.
4. **Mark-room is fixed at zone entry.** For each pair, remember the overlap state when the first of the two reaches the zone (RRS 18.2(b)):
   - clear ahead at entry → that boat keeps mark-room even if an overlap begins later;
   - overlapped at entry → the inside boat keeps it.
   Reset the memory when both boats have left the zone or passed the mark.
5. **Mark-room only for boats heading to that mark.** Apply R18 at a mark only if both boats' next mark is that mark (RRS 18.1).
6. **Time to react (R15/R16, simplified).**
   - **Change:** keep a short memory per pair. For 1.2 s after a boat *gains* right of way, a contact (or the close-call warning) does not count against the boat that just lost right of way. Gaining right of way means completing a tack, gaining an overlap to leeward from clear astern, or the other boat entering or leaving an R13 state.
   - **Exception:** if the right-of-way boat changed course towards the other boat during that time, the giving-way boat is also excused.
   - **Feedback:** no penalty to either boat, and the reason text says so ("Ingen straf: <name> nåede ikke at holde fri" / en).
   - **Review round 1 (RRS 15, deliberate change):** when the boat gained right of way by its *own* action (it finished a tack, finished a penalty or returning, or got an overlap from clear astern), that boat is the offender under rule `R15` ("Tid til at holde fri! <name> fik lige retten … og gav ikke <other> tid til at holde fri"), instead of nobody. Otherwise a port boat about to hit a starboard boat could escape by tacking at the last moment. The gain binds the gainer for the whole 1.2 s, even if the other boat gains right of way back in that time. The "nobody" excuse stays for gains that are nobody's own action, and for R16.
   - **R16 is judged by effect (review round 1):** the right-of-way boat's course change excuses the give-way boat only if its new course brings the hulls closer over the next 2 s than its old course would have. Ducking or bearing away from the other boat (RRS 14) excuses nobody.
   - **Both phones (review round 1):** a contact that a phone's own monitor excused vetoes the other phone's `{t:'foul'}` for 2 s; a received foul waits 0.3 s so the own verdict comes first, and it is only accepted for a boat this phone saw close by (a contact or close call in the last 2 s, or the hulls within half a length).
7. **R22 keep-clear.** A boat that is OCS and returning, or doing penalty turns, has no right of way against boats sailing normally. It is the offender in a contact (`ocs` and `pen` flags are already sent). Returning means sailing towards the pre-start side (each phone works it out from the boat's velocity against the line, `rc.ret`); an OCS boat that sails on up the course keeps its normal rights (RRS 22.1). Our own boat stops being OCS only when its whole hull (bow and stern) is behind the line; the AI helms keep judging the centre, as they steer by it.
8. **Contact speed.** Measure the closing speed before `collide`/`bumpRemotes` changes the velocities, and use that for the contact threshold. The threshold is 0.35 m/s for live and AI races alike, unless an AI-only reason exists (then document it).
9. **Short network gaps.** A remote boat that is `frozen` but whose last packet is less than 2 s old stays in the rules and contact lists, extrapolated. Only `lost` makes it a ghost.
10. **Both phones agree on fouls.**
    - **Message:** the stand-on boat's phone also judges contacts. When it decides the other boat fouled it, it sends a new message `{t:'foul', o:<offenderId>, r:<rule>}` (rate-limited by the server; relayed only to the offender).
    - **Offender's phone:** it takes the penalty if either its own verdict or the received one says so, de-duplicated within 2 s for the same pair.
    - **Unchanged:** stand-on boats are never penalised.
11. **Clear astern (rules.js:133).** Use the hull's most forward point along the other boat's heading, not only the bow point.
12. **By the lee for scenario objects (rules.js:128).** Use the same 9° margin as the physics boats.
13. **Contact position.** Rules and contact use the dead-reckoned position without the visual smoothing offset (`mpstate.js`, about line 206); only drawing uses the smoothed one.

**Tests:**
- `tools/test-core.js`: one scenario test per point 2–7, 11 and 12 (named `rules: ...`).
- `tools/test-live-state.js`: points 1, 9 and 13, by porting `live.js` A/B/C into assertions.
- A Node two-phone simulation (port `phones.js` D/E) in `tools/test-live-race.js` or a new `livefoul` suite: zero cases where both or neither boat is penalised for a clear foul, and slow contacts are penalised.

## B. Open race list (#37 step 1)

- **Visibility** is a new host setting in the lobby (`cfg.vis`):
  - `private` (the default; code/link/QR only, as today);
  - `open` (listed for everyone).
  The "my team" option waits for accounts (#35).
- **Server:** a public room in phase `lobby` (or `countdown`) appears in the list.
  - **Message:** `{t:'list'}` → `{t:'rooms', rooms:[{code, host, cls, course, wind, n, max, phase, startsIn, sched}]}`.
  - **HTTP:** the same data is at `GET /rooms` on the race server, CORS limited to game origins as the WS origins are, so the list can show without opening a socket. It is rate-limited.
  - **Limits:** at most 30 listed rooms; `host` is the sanitised nickname.
  - **Status file:** `hidden`/`closed` returns an empty list.
- **Client, under Live race:**
  - **List:** a new **"Find et løb" / "Find a race"** list showing host nickname, class, course, wind, players `n/max` and status ("I lobbyen", "Starter om 0:45", "Planlagt fre 18:00"). Tapping an entry follows the same join flow as entering a code.
  - **Refresh:** every 10 s while the list is open; never in the background.
  - **Empty state:** "Ingen åbne løb lige nu – start dit eget eller planlæg et."

## C. Scheduled races

Use case: a trainer says "Fredagsræs kl. 18" and the kids join from home.

- **Creating:** in the host flow, "Planlæg til senere" opens a date + time picker (local time; from now + 10 min up to 14 days ahead).
  - **Fixed title,** chosen from preset names (no free text): Træningsløb, Fredagsræs, Klubmesterskab, Juleræs, Weekendræs (+ en).
  - **Settings:** class, course, wind, max players, penalties/contact, and visibility (scheduled races default to `open`).
- **Server:** stores scheduled races in a small JSON file (env `KOS_SCHEDULE_FILE`, atomic write). This is a deliberate exception to "everything in memory", because schedules must survive a restart. It contains no personal data beyond the host nickname.
  - **Each entry:** code (reserved from now on), title id, cfg, startAt (UTC ms), hostName, a sha256 of a host secret, and a salted sha256 of the creator's IP (the per-IP limits survive a restart; the salt is in the same file, the IP never is). The secret is returned once and kept by the creating client in `KOS.Storage` key `liveSched`.
- **Lifecycle:**
  - **Opening:** at `startAt − 15 min` the server opens the room in `lobby` as a server-run room: no host connection is needed and players can join. If the creator connects with the secret, they become host as today and may start early, change settings or cancel.
  - **Starting:** at `startAt` the server starts the countdown itself if ≥ 2 players have joined. Otherwise it waits up to 10 more min, then cancels with a friendly message.
  - **Fallback:** a room without a connected host follows the "host left during racing" rules; the results and rematch flow need no host.
- **Limits:** at most 3 scheduled races per IP per day and 5 not-yet-run races per IP, at most 50 in total, and expired entries are removed. An entry stays in the file until its race begins or is cancelled, so a restart in the open window opens the lobby again. Once the creator holds the host seat, the server's gun only fires for the first race and only while nobody is host.
- **Client:**
  - **The list** shows the races you can join now first (open lobbies and opened scheduled races, "n/max sejlere"), then the upcoming scheduled races (title, time, class). Deviation: nobody can sign up before a room opens, so a pending race shows its opening time ("Åbner kl. 17.45") instead of "n tilmeldt". Open lobbies are titled "<navn>s løb" with the same "Vært: <navn>" line as scheduled races. Joining before the room opens shows "Åbner kl. 17:45" with an "Påmind mig" option, which adds an `.ics` download (a calendar file generated in the browser, no server mail).
  - **Creator:** sees "Mine planlagte løb" (from `liveSched`) with cancel and share (link/QR with the code).
  - **Deep link:** `#live=CODE` works for scheduled codes, and shows the time until it opens.
- The **status file kill switch** hides the list and blocks creating scheduled races (existing ones are kept).

**Tests:**
- `tools/test-live-server.js`: list visibility, list limits, scheduling validation, open at −15 min, server start at T with ≥2 players, the 10 min cancel, the host secret (start early / cancel / wrong secret), persistence across a restart (temp file), rate limits.
- The headless client tests extend the existing live client/race suites: list rendering, empty state, joining from the list, the scheduling form, and the "my scheduled races" view.

## D. Deployment notes (for Allan)
- The server needs the new `KOS_SCHEDULE_FILE` env var per instance (e.g. `/var/lib/kos-race/8787-schedule.json`). The README is updated.
- The protocol bump means the server and the game must be deployed together. Deploy the test instance first and test there.
