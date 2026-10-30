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
   - **Review round 3:** "the side that faces the mark" is the side the mark must be left on (`mark.round`, default port; a gate's `s` mark is starboard), across the pair's mean course, not where the mark happens to lie laterally (a boat aiming straight at the mark is still outside). Headings more than 45° apart keep the nearer-boat fallback.
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
13a. **Review-round rules changes (deviations; they apply to AI races and Søslag too, since all use `rules.js`).** Found by the rules reviews, each a real RRS bug with a `rules:` test in `tools/test-core.js`:
   - **Windward/leeward by side** (RRS Definitions *Leeward and Windward*): a boat is to windward when it lies on the other's windward side across their course (on a run: the side away from the mainsail), not by the wind line. Round 1.
   - **Both boats tacking** (RRS 13): the one clear astern keeps clear, else the one on the other's port side.
   - **Zone-entry memory limits** (RRS 18.1(a), 18.2(c), 18.3): no fixed entitlement between opposite tacks on a beat; it ends when the entitled boat passes head to wind or leaves the zone; none when a boat was tacking as the first reached the zone.
   - **RRS 21 over R16:** a boat entitled to mark-room and sailing within it is not "turning into" the other boat; R16 does not excuse the boat that owed it room. Round 2.
   - **Rule 18 with one boat in the zone** (RRS 18.1, 18.2(a)): mark-room (fresh or the zone-entry memory) applies once at least one of the two is in the zone. Round 3.
   - **R15 only binds a gainer that left no room** (RRS 15): within 1.2 s of a gain the gainer is the offender (or, for a gain that is nobody's action, nobody is) only if the give-way boat could not have kept clear by holding the course it had when the gain happened; a give-way boat that steers into a boat that left room breaks its base rule (R10/R11/R12). The same held-course check limits the R16 excuse. Round 3.
   - **Søslag** ignores excused fouls (no penalty turn, the reason is shown). Round 3.
   - **Review round 7** (`tools/tmp/rowreview/review7*.js`): R22 applies only while a boat is *taking* its penalty turn (the game steers it, or it has turned one way past 120 degrees), not while it only owes one and sails on (RRS 22.2; st flag 256 = turning, 4 alone = owes one); RRS 18.3 switches 18.2 off only when the tacking boat is itself in the zone, and 18.3(a) makes the boat that tacked in the zone keep clear of a starboard boat at close-hauled (`R18`, reason `R18-tack`); R16 excuses only a turn that became noticeable (10 degrees) at most 1.2 s before the contact; mark-room lasts until the entitled boat has finished turning round the mark (0.8 s steady), not only until its leg changes; the committee boats are rules marks too (a line end: the boat on its side is inside). Kept as a product decision: a right-of-way boat that turns into a give-way boat with no time to react is not penalised itself (R16: nobody).
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

## E. Reconnect and resume (must never lose a racer)

User requirement (2026-10-30): a player who drops off, gets lost, reloads, or ends up back in the normal game must always be able to get back into the live race they are still part of. Evidence: the audit scripts in `tools/tmp/reconnect/` (`srv-exp.js`, `br-exp.js`, `out.txt`).

1. **Never give up while the seat may still be alive** (`js/net/mp.js` `RECONNECT_MS`/giveUp, `race.js` `goOffline`).
   - **No final "offline" state** while a seat token exists.
   - **Backoff:** 0.5, 1, 2, 5, 10 s, then every 10 s, with jitter.
   - **Immediate retry:** `online`, `visibilitychange` (visible), `pageshow` and `focus` reset the backoff to an immediate try, with only one retry chain at a time.
   - **Stop conditions:** retries stop only on `nocode`, `res`, `kicked` or `hostleft`.
   - **While retrying:** after 15 s the banner says "Forbindelsen er væk – vi prøver stadig" / "Connection lost – still trying" with a "Prøv nu" button. Sailing continues locally. "Unofficial" is a reversible display state that is cleared once the player is back.
2. **The player keeps their own boat.**
   - **Same race instance:** a reconnect inside the same race keeps the client's own boat as the truth (no teleport).
   - **Reload:** a local snapshot (pose, velocity, leg/marks, penalty turns owed + progress, OCS) goes to sessionStorage every 2 s and on `pagehide`. On reload, the newer of the snapshot and the server's `me` wins.
   - **Penalty count:** the number of penalty turns owed is restored exactly (today it is always 1).
3. **Leaving is not withdrawing.**
   - **Leaving:** "Til kortet", the back button or quitting a live race only *detaches* the session. No `leave` is sent and the seat is kept.
   - **Withdrawing:** a separate "Udgå af løbet" / "Retire" action with a confirm sends `leave` (the player becomes RET/DNF).
4. **"Fortsæt live-løbet" on the title screen and the hub.**
   - **When it shows:** a prominent banner/button (not a one-time dialog) whenever a valid seat is stored. It shows without network and also when a `#join` is pending (with a choice).
   - **Tapping it:** resumes and goes straight into the race.
   - **"Ikke nu":** hides it for this visit only. "Udgå" sends `leave` and clears it.
   - **Seat record:** `{code, id, key, url, exp, phase, startedAt}` in localStorage, refreshed on every contact and every 60 s, with `exp` = last contact + 2 h. Cleared on retire, kick, `hostleft` or expiry.
   - **Results:** on `res`, store `kos.mp.lastResult` `{code, rows, myId, at}` for 30 min before clearing the seat.
   - **If the race is gone (`nocode`):** show the stored result if there is one, otherwise "Løbet er slut – vi kunne ikke hente resultatet". Then clear.
   - **Late resume:** resuming during the results phase shows the official result.
5. **Watchdogs everywhere.**
   - **Client:** a pong watchdog in every phase (lobby 8 s, countdown/racing 2.5 s), so a half-open socket in the lobby can no longer miss the start.
   - **Server:** a ws `ping` every 10 s; a socket is terminated after about 25 s without a pong, which marks the seat lost (the seat itself is kept).
6. **Lost seats still start.** `begin()` no longer deletes seats that are lost at the gun. They are put on the grid and can resume. A boat that never comes back is DNS/lost in the results. A lobby seat in a scheduled room waits until the gun.
7. **One owner per seat.** On resume the server closes the previous socket with code 4409 "replaced", and only accepts `st`/`fin`/`foul` from the socket that owns the seat. The client treats 4409 as "the race is open in another window" and does not reconnect-steal.
8. **Docs:** update `docs/specs/live-race.md` (the 45 s text is obsolete) to describe this behaviour.

**Tests:**
- **New suite** `tools/test-live-reconnect.js`, registered as `livereconnect`. It runs headless Chrome through a TCP proxy that can cut cleanly or black-hole (the `br-exp.js` approach).
- **Lost network:** 2, 10, 40 and 90 s cuts, both clean and half-open. Each must reconnect in the same instance with no teleport, an official result, and the host seeing the boat again. Also `context.setOffline` with the `online` event.
- **Background:**
  - iOS-like: CDP `Page.setWebLifecycleState` frozen/active, plus visibility events;
  - Android-like: hidden with timers running and the network down for 20 s after the page returns.
- **Reload and kill:** `page.reload()` and a fresh context from `storageState`; check the hub/title banner, resume, pose, leg and penalty count.
- **Accidental exit:** "Til kortet" mid-race → banner → resume back into the race.
- **Race over while away:** the result is shown.
- **Server-level** (`test-live-server.js`): a lost seat at the gun (manual + scheduled), a duplicate socket (4409, old frames ignored), and heartbeat termination.
