# Live-kapsejlads: real-time multiplayer one-design race (issue #28)

Status: implementation contract for the build agents. Branch `live-race`. Names refer to `js/modes/race.js` at the branch point; re-grep before editing.
Requirements source: GitHub issue AThraen/KOSGame#28 and its comments. This file turns them into an exact contract.

## 0. Non-negotiables
1. **The game works fully without the server.** Multiplayer code is lazy-loaded only when the "Live-kapsejlads" entry is opened. No WebSocket, no `fetch` to the server, no extra heavy script at startup, on the hub or in the service worker. Nothing in `sw.js` waits for or caches `/mp*`.
2. **One-design only (v1):** one boat class per race, chosen by the host.
3. **No chat, no free text.** Names come from the local profile nickname (`profile.name`, max 16 chars, sanitised). No personal data on the server, no persistence, no logging of names.
4. **The server only relays and keeps the clock.** No boat simulation, no physics validation. Everything in memory, only dependency `ws`.
5. **AI races stay bit-for-bit unchanged** when `host.live` is absent. All live behaviour in `race.js` sits behind `if (LIVE)`.
6. Danish default, English second, every string through `KOS.t`. Natural kid Danish ("Træner", "Vært", "Sejler"; never "Coach").

## 1. File layout
```
server/
  package.json            {"name":"kos-race","private":true,"dependencies":{"ws":"^8"}}  (only dependency)
  index.js                entry: http + ws, wires modules, SIGTERM clean shutdown, env: PORT, KOS_STATUS_FILE
  lib/rooms.js            pure room/phase logic (no sockets): create/join/leave/kick/start/finish, codes, results
  lib/protocol.js         message validation + size limits (pure); PROTOCOL_VERSION, validate(msg)
  lib/status.js           reads/watches the status json (fs.watch + 5 s poll), current()
  lib/limits.js           token buckets, connection counters (pure, injectable clock)
  bin/kos-race            on|closed|hidden [message] | status
  deploy/kos-race@.service  systemd template unit (instances: prod 8787, test 8788; MemoryMax=256M, NoNewPrivileges)
  deploy/nginx-mp.conf    location snippets /mp/ and /mp-test/ (ws upgrade) + static /mp-status.json, /mp-test-status.json (no-store)
  deploy/mp-status.example.json
  README.md               install, two instances, kos-race usage
js/net/
  mpstatus.js             EAGER, tiny, no I/O at load: KOS.Config + KOS.MPStatus (6.1, 6.2)
  mpstate.js              LAZY, pure: pack/unpack state, interpolation Buffer, clock maths (Node-testable)
  mp.js                   LAZY: KOS.MP connection, clock sync, room events (6.3)
  lobby.js                LAZY: KOS.Lobby screens, QR display, i18n strings (6.4)
js/vendor/qr.js           vendored MIT QR encoder with licence header; KOS.QR.svg(text,{size,ecc:'M'}); no network
tools/test-mp.js          Node-only tests (suite `mp`)
tools/test-mp-ui.js       headless Chrome tests (suite `mpui`)
```
Only `js/net/mpstatus.js` is added to `index.html` (classic script after `app.js`). `mpstate.js`, `mp.js`, `lobby.js`, `js/vendor/qr.js` are injected on demand by `KOS.MPStatus.load()` and ARE in the precache list (so they are available offline once cached), but loading them opens no socket. The precache never contains an `/mp*` URL. Run `node tools/gen-precache.js` after adding files; never hand-edit `sw.js`.

## 2. Roles and room lifecycle
Roles: one `host` plus `player`s. Host chooses at creation:
- `hostRole:'sail'` ("Vært + sejler"): the host also has a boat.
- `hostRole:'watch'` ("Kun vært"): no boat; the host client shows the overview map and leader board (5.5). Both roles work on any screen size.
Each connection gets `id` (1..N, never reused in a room) and `name`.

Room code: 4 chars from the 24-char alphabet `ACDEFGHJKMNPRTUVWXY34679` (no 0/O/Q, 1/I/L, 2/Z, 5/S, 8/B). Input is uppercased and stripped of spaces. Collision-checked on create. Link: `<game url>#join=CODE`.

Phases (server-authoritative):
```
lobby --start(host)--> countdown --T0--> racing --all done / maxS--> results --60 s--> deleted
```
- `lobby`: join/leave/kick, host edits `cfg`. Joining is only allowed here (no late join; `err code:'started'`).
- `countdown`: server sets `T0 = serverNow + countdownS*1000` and sends `start`. Clients build the race and wait. T0 is the shared start clock.
- `racing`: clients send `st` and `fin`; server relays. After `cfg.maxS` seconds past T0 the room goes to `results` with DNFs.
- `results`: server sends `res`; room is kept 60 s. Status `closed` never affects running rooms.
- Host leaves in `lobby`/`countdown`: all get `hostleft`, room deleted after 5 s. Host leaves in `racing`: race continues (no host controller needed), results are produced normally.
- Player disconnect: in `lobby` removed; in `countdown`/`racing` kept `lost:true` for 20 s (resume possible), then `dnf`. Empty room deleted after 10 s.

## 3. JSON protocol
WebSocket text frames, one JSON object per frame, `PROTOCOL_VERSION = 1`, every message `{ "t": "<type>", ... }`. Max frame 2048 B (`st` <= 512 B). Bad JSON, unknown `t`, wrong types, oversize: reply `{t:'err',code:'bad'}` and count a strike (3 strikes: close 4400). Numbers must be finite; strings are length-capped and stripped of control characters.

### 3.1 Client to server
| t | fields | notes |
|---|---|---|
| `hello` | `v:1, name, build` | first frame; no other frame accepted before it; reply `welcome` |
| `ping` | `c` (client `performance.now()`) | clock sync (4.1) |
| `create` | `cfg:Cfg, hostRole:'sail'\|'watch'` | rejected `err code:'closed'\|'busy'` (7) |
| `join` | `code` | reply `joined` or `err code:'nocode'\|'full'\|'started'\|'closed'` |
| `cfgset` | `cfg:Partial<Cfg>` | host, lobby only; server re-broadcasts `room` |
| `kick` | `id` | host only |
| `start` | none | host only; needs >= 2 boats (host-sail) or >= 1 player (host-watch), else `err code:'few'` |
| `st` | `s:StateArr` | player, racing/countdown-last-2s; server drops above 14/s |
| `fin` | `ms` | player: finish time in ms after T0 on the shared clock; once only |
| `leave` | none | graceful |
| `resume` | `code, id, key` | reconnect (4.7) |

`Cfg` (server fills defaults and clamps): `{ boat, venue:'sound'|'bay', course:'wl'|'tri', laps:1..3, windDeg:0..359, windKn:4..16, gust:0..1, shift:0..1, seed:int, maxP:2..24, maxS:60..1800, countdownS:8..180, pen:bool (penalty turns), help:'locked'|'free' }`. `seed` is chosen by the server on create. `boat` must match `/^[a-z0-9_-]{1,24}$/` server-side; the client validates it against `KOS.Boats` sailing classes.

### 3.2 Server to client
| t | fields |
|---|---|
| `welcome` | `v, id, now` (server ms), `mode, msg` (current status) |
| `pong` | `c` (echo), `s` (server `Date.now()` at receipt) |
| `created` / `joined` | `code, id, key` (12-char resume secret), `room:RoomInfo` |
| `room` | `room:RoomInfo` on any lobby change |
| `kicked` | none (then close 4403) |
| `start` | `T0` (server ms of the gun), `cfg` (final, with `seed`), `grid:[{id,slot,name,color}]` |
| `s` | `a:[StateArr,...]` batched relay of the others' latest states, <= 10 Hz per recipient |
| `fin` | `id, ms` |
| `res` | `rows:[{id,name,place,ms\|null,status:'fin'\|'dnf'\|'lost'}]` official table |
| `hostleft` | none |
| `err` | `code, msg?` |
| `status` | `mode, msg` pushed on status-file change (informational) |

`RoomInfo = {code, phase, cfg, hostRole, hostId, players:[{id,name,color,host,lost}]}`. Colours come from a fixed 12-colour palette by join order. Duplicate names get " 2", " 3" suffixes.

### 3.3 Compact state array
`StateArr = [id, seq, x, y, hd, sp, hl, fl, lg]`, a plain JSON array (~60 B):
| idx | field | encoding |
|---|---|---|
| 0 | `id` | player id (server overwrites with the sender id; cannot be spoofed) |
| 1 | `seq` | uint, +1 per frame; receivers drop older |
| 2,3 | `x`,`y` | world metres, 0.01 |
| 4 | `hd` | heading rad in (-pi,pi], 0.001 |
| 5 | `sp` | speed m/s, 0.01 |
| 6 | `hl` | heel rad, 0.01 (visual) |
| 7 | `fl` | bit flags: 1 spinnaker, 2 capsized, 4 penalty turn, 8 finished, 16 OCS, 32 hiking |
| 8 | `lg` | `rc.leg` index (leader board) |
`mpstate.js` exports `packState(boat,id,seq)`, `unpackState(arr)` (null if malformed) and `Buffer`. Server validates length 9 and numeric entries before relaying.

## 4. Algorithms
### 4.1 Clock sync (ping/pong offset)
1. After `welcome` the client sends 8 pings 250 ms apart: `{t:'ping', c:c0}`, `c0 = performance.now()`.
2. On `pong` at client time `c1`: `rtt = c1 - c0`, `offset = s + rtt/2 - c1`.
3. Keep the last 8 samples; use the median `offset` of the 3 lowest-rtt samples. `KOS.MP.rtt` = lowest rtt.
4. Afterwards ping every 5 s; accept a new sample only if `rtt <= 1.5 * bestRtt`; smooth with `offset += 0.2*(new-offset)`; never move the clock backwards by more than 30 ms per update.
5. `serverNow() = performance.now() + offset`. Race clock `raceClock = (serverNow() - T0)/1000` s (negative before the gun) is the only clock live race.js uses.
Maths lives in `mpstate.js` (`clockSample(c0,c1,s)`, `pickOffset(samples)`), unit-tested with asymmetric delays.

### 4.2 Deterministic wind
`KOS.Wind.create({dir,speed,gust,shift,seed,bounds})` is deterministic for the same sequence of `update(dt)` calls. In live mode: (a) wind is created from `cfg` exactly as race.js does today (incl. the 240 x 0.5 s pre-warm); (b) `wind.update(KOS.DT)` runs once per fixed sim step driven by the shared race clock (5.2), never by wall time or intro state; (c) `wind.recenter()` is NOT called (it moves the field bounds per boat and would diverge); bounds are fixed around the course centre with a 600 m margin. Test: two instances from the same `cfg` stepped equally return identical `wind.at(x,y)`.

### 4.3 Course and start slots
All clients derive the identical course from `cfg` (race.js already derives everything from `P`). `grid` order is slot order; slot `i` uses `startRow(i)`.

### 4.4 Client send loop
While `racing` (and from clock >= -2 s): `st` every 100 ms from an accumulator in `update()` (not `setInterval`). Extra immediate frame on capsize, penalty-turn change and finish.

### 4.5 Server rate limits and relay
Token buckets per client: `st` 14/s burst 20; other messages 10/s burst 20. Over limit: drop silently (`st`) or `err code:'rate'`; 50 drops in 10 s: close 4429. Each room has a 100 ms tick; per recipient one `s` frame with the latest state of every other player (latest-wins per id, skip unchanged `seq`). A watching host receives all.

### 4.6 Interpolation (client)
Each remote boat has a ring buffer of the last 8 states, keyed by receipt time converted with `serverNow()`. Render time = `serverNow() - interpDelay`, `interpDelay = clamp(100 + 1.5*jitterEMA, 100, 150)` ms (jitterEMA of inter-arrival deviation, starts at 50). Linear position, shortest-angle heading, other fields from the earlier sample. Past the newest sample: extrapolate along heading*speed up to 250 ms, then freeze. No sample for 3 s: shown as lost (greyed tag). `Buffer.add(state, recvMs)` and `Buffer.sample(renderMs)` are pure and unit-tested.

### 4.7 Reconnect
Client keeps `{code,id,key}` in memory only. On socket close in `countdown`/`racing`: retry with `resume` at 0.5, 1, 2, 3, 4 s ... for **15 s** total (`state:'reconnecting'`). The server accepts `resume` within 20 s of the loss, re-binds, replies `joined` + `room`; the client re-syncs the clock. After 15 s: emit `offline` and continue locally (5.6, 8).

## 5. Plugging into race.js
### 5.1 Entry
Register one extra activity from `js/modes/race.js`, hidden from the level list: `{id:'race.live', mode:'race', area:'race', pickHidden:true, liveRace:true, params:{defaults}}`. It is started only by the lobby: `KOS.App.play('race.live', {force:true, live:session})`. `App.play` gets one optional field `opts.live` kept on `run.live`; `renderers.play` sets `host.live = run.live || null`. `liveRace` activities are excluded from stars, area totals, badges, unlock chains and never touch `KOS.Storage.progress`; `finish()` in app.js skips progress/badges when `a.liveRace`. The result still goes through `host.finish(result)` with `result.live = true`, no stars.

`host.live` is a thin facade over the session so race.js has no socket knowledge and tests can stub it:
`{ cfg, grid, T0, myId, role:'sail'|'watch', countdownS, serverNow(), send(msg), on(evt,fn)->off, leave() }`.

### 5.2 Changes inside `createRace(host, activity)` (all behind `const LIVE = host.live || null`)
1. **Params:** `P = Object.assign(defaults, activity.params, LIVE ? liveParams(LIVE.cfg) : {})` with `P.fleet = 0`, `P.series = 'live'`, `P.race = 1`, `P.races = 1`. `nBoats = LIVE.grid.length` (affects `lineLen`, `startRow`). Boat class = `cfg.boat`.
2. **Boats:** `me` is created as today at `startRow(mySlot)` with profile name and the `grid` colour. Other grid entries become boats via `KOS.Physics.createBoat(...)` with `b.remote = true`, `b.rid = id`, no `helm`, `b.rc` as usual. Remote boats are NOT stepped by physics and are excluded from the `live` collision/rules list: **no boat-boat collision or foul in v1**. `me` still collides with marks/land and the rules monitor still runs for marks. Role `watch`: no `me`; `boats` holds only remotes; no steering input/HUD is built.
3. **Clock:** in `update(dt)` when `LIVE`: `target = (LIVE.serverNow() - LIVE.T0)/1000`; run `n = clamp(round((target - S.clock)/KOS.DT), 0, 300)` calls of `simStep(KOS.DT)` (catch-up capped at 5 s of sim). Start value `S.clock = -(LIVE.countdownS)`. The signal sequence is compressed with `k = LIVE.countdownS / PRE`: `signals()` thresholds are scaled by `k` so warning/prep/one-minute fire at the same fractions and the gun is exactly at `clock = 0`. `S.ff` and the "Sejl!" intro card are disabled (the lobby is the intro).
4. **Wind:** no `recenter` (4.2).
5. **Remotes:** at the start of each `simStep`, for every remote boat set `x,y,heading,speed,heel,spinnaker` from `Buffer.sample(...)`. `track()` runs for remotes for display (leg/OCS) only; a remote's official finish comes from the `fin` message (`rc.finT = ms/1000`, then `finished(b)`). Leader board order uses `lg` plus local distance as today.
6. **Own finish:** `finished(me)` sets `rc.finT = S.raceT` (equal to the shared clock after the gun). Send `{t:'fin', ms}` once, with the penalised time if penalty turns are owed (+20 s per turn, as in `complete()`).
7. **Results:** `complete()` in live mode waits up to 4 s after own finish for `res` and builds `raceTable` from it; otherwise from local `fin` events with `S.result.unofficial = true`. `stars = 0`. Titles use `live.res.*`.
8. **Send loop and teardown:** `sendState(dt)` per 4.4. `destroy()` unsubscribes the live listeners and calls `LIVE.leave()`.
9. **Instance additions:** `live:{state, remotes}`; test hook `debug.liveFeed(frame)` injects a fake `s` frame. Existing members unchanged. New named helpers only: `liveParams`, `stepLive`, `applyRemotes`, `sendState`; no refactors of existing functions.

### 5.3 What must stay identical
With `LIVE` falsy: params, `rand()` consumption order, AI fleet, `PRE`, `S.ff`, results and stars are unchanged. Existing `tools/test-core.js` race tests and the smoke race pass stay green with no edits.

### 5.4 Official vs unofficial results
Official = server `res`. Time basis = each player's own `ms` after the shared T0. Sort by `ms` ascending; DNF/lost last, ordered by last reported `lg` descending; ties share the better place. Server sanity: `ms >= 5000` and `ms <= maxS*1000 + 5000`, else `dnf`. Cheating is accepted in v1 (club game, no ranked ladder).

### 5.5 "Kun vært" view
`createRace` with `LIVE.role === 'watch'`: no input, no own boat; camera = overview fit of the whole course (`scene.fit(cb, margin)` on each resize); boat tags always on (sail number + name); a **leader board** panel (reuse `buildBoard`/`paintBoard` styling) refreshed every 0.5 s from `rank()`, finish times appear as boats finish; signals and big race clock reuse the existing panel flags. The quit button leaves the room (see lifecycle for host departure).

### 5.6 Local continuation
On `LIVE.on('offline')`: set `S.unofficial = true`; remote boats freeze greyed and are hidden after 3 s; the sim switches from the shared clock to the normal wall-dt path so the race finishes locally; `complete()` builds the table from own time vs last known `fin`s with title `live.res.unofficial`. While `reconnecting` a small banner (`live.reconnecting`) shows and sailing continues. Live mode disables pause (pause button hidden, `setPaused` ignored) to protect the shared clock; quit still works.

## 6. Client modules
### 6.1 `KOS.Config`
Defined in `js/net/mpstatus.js`, no I/O: `{ liveRace:true, mpUrl:null, mpStatusUrl:null }`. `KOS.MPStatus.resolve()` fills the URLs lazily from `KOS.BUILD` channel and `location`:
- prod: ws `wss://<host>/mp/ws`, status `<origin>/mp-status.json`
- test (and `dev`): ws `wss://<host>/mp-test/ws`, status `<origin>/mp-test-status.json`
- dev/test override via hash `#mp=<ws url>&mpstatus=<url>`, honoured only on `localhost`/`127.0.0.1` or `KOS.BUILD==='dev'`.
`KOS.Config.liveRace === false` hides the feature (build-time kill switch).

### 6.2 `KOS.MPStatus` (eager, no I/O at load)
```
cached()        -> {mode,message,maxRooms,maxPlayers,at} | null      never fetches
refresh({force})-> Promise<Status>   fetch(statusUrl,{cache:'no-store'}), 3 s timeout, at most once per 120000 ms unless force; never rejects
visible()       -> boolean           Config.liveRace!==false && cached && cached.mode!=='hidden'
load()          -> Promise<void>     injects mpstate.js, qr.js, mp.js, lobby.js once; rejects {code:'load'} on script error
```
Missing, unreachable, non-200, unparseable or unknown `mode` => `{mode:'hidden'}`. The hub calls `refresh()` only when the **race area menu** is shown and then re-renders the entry (visible when `visible()`; greyed with `message` when `closed`). Opening the entry does `refresh({force:true})` then `load()`.

### 6.3 `KOS.MP` (lazy)
```
KOS.MP.connect({url,name,timeoutMs=4000}) -> Promise<Session>     rejects {code:'unreachable'|'timeout'|'proto'}
Session: id, code, room, phase, role, rtt, state('ok'|'reconnecting'|'offline'|'closed'), serverNow()
  create(cfg,hostRole)->Promise<RoomInfo>   rejects {code:'closed'|'busy'|'bad'}
  join(code)->Promise<RoomInfo>             rejects {code:'nocode'|'full'|'started'|'closed'}
  setCfg(partial), kick(id), start(), leave(), send(msg), close()
  on(evt,fn)->off   evts: room, start, states, fin, res, hostleft, kicked, reconnecting, reconnected, offline, status, error
KOS.MP.parseJoin(hash)->'ABCD'|null     KOS.MP.normCode(str)->'ABCD'|null
```
No auto-connect anywhere. All promises reject with plain `{code}` objects handled by callers; nothing may reach `window.onerror`.

### 6.4 `KOS.Lobby` (lazy)
`KOS.Lobby.open({join?:code})` shows a normal app screen `live` (via the existing `App.show` renderers pattern). Screens: entry (Vært / Deltag), host setup (role, boat, venue, course, wind preset, max players), lobby (large code, QR, share button, player list with Kick for the host, Start for the host, Leave), join (4-char input), starting ("Starter om N"), results. Share: `navigator.share({url})` else copy link + toast. QR: `KOS.QR.svg(link,{size:240})`, dark on light with quiet zone.
Entry point: one card "Live-kapsejlads" in the race area menu (hub), rendered when `KOS.MPStatus.visible()`. Hub change is only that card plus `refresh()` on area enter.
`#join=CODE` in `main.js` boot only stores `KOS.pendingJoin` (no network). On the hub, if `refresh()` then says visible, a prompt "Deltag i løb CODE?" calls `Lobby.open({join})`; otherwise the unavailable/closed message (8). The hash is cleared afterwards.

## 7. Status / kill switch
- Static `/mp-status.json` (prod) and `/mp-test-status.json` (test), written by `kos-race`, served by nginx with `Cache-Control: no-store`. Shape in 6.2.
- **Client:** lazy read (6.2); missing/unreachable => hidden; `closed` => entry greyed with message, Host/Join disabled; Host/Join force a re-read. Running races are never interrupted by a status change.
- **Server** (`lib/status.js`): file path from env `KOS_STATUS_FILE`; `fs.watch` + 5 s poll; invalid/missing => `hidden`. `create` rejected unless `mode==='on'` (`err code:'closed'`, `msg` from file); `join` rejected when `hidden`; `closed` still lets players join existing lobbies and keeps races running. Effective limits = `min(hard, file)`; on change a `status` message goes to lobby rooms.
- Hard limits (env-overridable): `maxRooms 40`, `maxPlayers 24` per room, `maxConns 300`, per-IP connections 20, frame 2048 B, rates 4.5, idle (no frames) 60 s, lobby max age 30 min, racing max age `maxS+120 s`. A blocked `create` returns `err code:'busy'`; the client shows `live.closed`.
- `kos-race on|closed|hidden [message]`: atomic write (tmp + rename) of `$KOS_STATUS_FILE` (default `/var/www/html/mp-status.json`), keeping existing `maxRooms/maxPlayers`. `kos-race status`: mode, message, rooms, players, conns (from 127.0.0.1-only `GET /health`, counts only, never names or codes) and process RSS/CPU.
- Not v1: auto-close on sustained CPU, `/mp/admin` page.

## 8. Errors, fallbacks, messages (da / en)
Strings live in `lobby.js` via `KOS.I18n.add`, prefix `live.`, both languages for every key; `tools/check-i18n.js` must pass.
| Situation | key | da | en |
|---|---|---|---|
| unreachable (timeout 4 s / offline / refused) | `live.unavailable` | Live-kapsejlads er ikke tilgængelig lige nu. Prøv igen senere – eller sejl mod computeren imens. | Live race is not available right now. Try again later – or race the computer meanwhile. |
| AI button | `live.playAi` | Sejl mod computeren | Race the computer |
| retry | `live.retry` | Prøv igen | Try again |
| big-screen host unreachable | `live.hostUnavailable` | Kan ikke nå løbsserveren. Tjek at serveren kører. | Cannot reach the race server. Check that the server is running. |
| closed / busy | `live.closed` | Der er travlt lige nu – prøv igen om lidt. (status `message` wins if set) | It is busy right now – try again in a little while. |
| no such code | `live.noCode` | Den kode findes ikke. Tjek bogstaverne. | That code does not exist. Check the letters. |
| full | `live.full` | Løbet er fuldt. | The race is full. |
| already started | `live.started` | Løbet er allerede startet. | The race has already started. |
| kicked | `live.kicked` | Værten har fjernet dig fra løbet. | The host removed you from the race. |
| host left | `live.hostLeft` | Værten har forladt løbet. | The host left the race. |
| too few | `live.few` | Der skal være flere sejlere for at starte. | More sailors are needed to start. |
| reconnecting | `live.reconnecting` | Forbindelsen vakler… prøver igen | Connection is shaky… trying again |
| unofficial result | `live.res.unofficial` | Uofficielt resultat (forbindelsen røg) | Unofficial result (connection lost) |
| waiting | `live.res.wait` | Venter på de andre… | Waiting for the others… |
| roles | `live.role.sail` / `live.role.watch` | Vært + sejler / Kun vært | Host + sail / Host only |
| labels | `live.title`, `.host`, `.join`, `.code`, `.start`, `.kick`, `.leave`, `.share`, `.copied`, `.startsIn`, `.players`, `.waitHost` | Live-kapsejlads, Vær vært, Deltag, Løbskode, Start løbet, Fjern, Forlad, Del link, Link kopieret, Starter om {n}, Sejlere, Venter på værten… | Live race, Host a race, Join, Race code, Start race, Remove, Leave, Share link, Link copied, Starting in {n}, Sailors, Waiting for the host… |
Result titles/message `live.res.title1..N`, `live.res.msg` follow the `race.res.*` wording. The trainer (`KOS.UI.coach`) speaks the unavailable/closed messages. No raw error codes or stack traces are shown. No endless spinners: every wait has a timeout that resolves to one of these states.

## 9. Limits (summary)
Code 4 chars/24-char alphabet; name <= 16; players per room default 12, hard 24; rooms hard 40; frame <= 2048 B (`st` <= 512); `st` 10 Hz (server tolerates 14/s); countdown 8-180 s (default 20; lobby offers 20 s, 1 min, 3 min); race max 1800 s; reconnect 15 s client / 20 s server; results kept 60 s; connect timeout 4 s; status cache 2 min; interpolation delay 100-150 ms, extrapolation <= 250 ms.

## 10. Test plan per step (steps = commits in order)
Every step ends with `node tools/run-tests.js` green; steps marked (U) also run `node tools/run-tests.js smoke mobile i18n`.
1. **Spec** (this file).
2. **Server core** (`server/lib/*`, pure). `test-mp.js` A: code alphabet and collisions, protocol validation (oversize, types, spoofed id), room phases, kick, token buckets with a fake clock, status parsing (missing/invalid => hidden), result ordering and ties.
3. **Server process + deploy files**. `test-mp.js` B: spawn on port 0 with a temp status file; real `ws` clients: hello/create/join/start/relay/fin/res; `closed` blocks create but not a running race; `hidden` rejects join; file flip honoured via fs.watch; resume after dropping a client; per-IP and room limits; `/health` loopback only; `kos-race on|closed|hidden|status` against a temp dir.
4. **Client pure modules** (`mpstate.js`, `mpstatus.js`). `test-mp.js` C: pack/unpack round-trip and malformed input; Buffer interpolate, extrapolation cap, angle wrap, out-of-order; clock sync with asymmetric delays; `parseJoin/normCode`; MPStatus fallbacks with a stubbed `fetch`; loading `mpstatus.js` calls neither `fetch` nor `WebSocket` (throwing stubs).
5. **`KOS.MP` + vendored QR**. `test-mp.js` D: `mp.js` in Node against the real server (`ws` as global `WebSocket`): refused/timeout => `{code}` rejections; two clients complete a race; reconnect within 15 s resumes, beyond that `offline`. QR: known string gives expected version/size and matrix checksum.
6. **race.js live hooks**. (a) without `host.live` the existing tests and a seeded AI-race golden finish order are unchanged; (b) two `createRace` with a stub `LIVE` give identical wind; (c) clock-driven stepping hits the gun at T0; (d) `debug.liveFeed` moves/interpolates a remote boat; (e) own `fin` sent once on the shared clock; (f) `offline` => `S.unofficial` and the race completes locally.
7. **Lobby UI, hub entry, i18n, precache** (U). `test-mp-ui.js` (headless, `tools/serve.js` + real server on a free port via `#mp=`): no entry with status missing/hidden; greyed entry with message on `closed`; Host shows code + QR; a second page joins by code and by `#join=`; host starts; both race a few seconds and see each other; host-watch shows the leader board. `gen-precache` run; `check-i18n` green for `live.*`.
8. **Server-OFF and kill tests** (U). With no server: game boots, zero console errors, zero WebSocket constructions and zero `/mp*` requests before the entry is opened (`page.on('request')` plus a WebSocket stub counter), ordinary smoke passes, the entry shows `live.unavailable` + a button that starts a normal AI race, big-screen host shows `live.hostUnavailable` with no endless spinner. Kill the server mid-race: after ~15 s the race continues, finishes, shows `live.res.unofficial`, no console errors, the frame counter keeps advancing.
9. **Docs and suites**: README "Live-kapsejlads", ARCHITECTURE.md (net layer, lazy load, no-server rule), MODE-AUTHORING.md (`host.live`, race only); `tools/run-tests.js` gets suites `mp` and `mpui` (in `all`).
Conventions: scratch in `tools/tmp`, screenshots to the session scratchpad with prefix `live-`, headless only, no external network.

## 11. Out of scope for v1
Several boat classes per race; AI boats in live races; boat-boat collisions and right-of-way fouls between humans; chat, emotes, voice, accounts, friends, leaderboards or stored history; late join; spectator-only links beyond the host; host migration; server-side physics or anti-cheat; database/persistence; admin web page and CPU auto-close; series or several races per room; rematch in the same room; WebRTC/TURN; stars/badges/progress for live races; in-race pause.

## 12. Build notes for agents
- Good for the local model (self-contained, testable): `server/lib/*`, `mpstate.js`, QR vendoring and wrapper, `bin/kos-race`, deploy files, test files. Do inline and review closely: race.js hooks, app.js `play`/`finish` changes, lobby UI.
- Keep race.js additions small and named (`LIVE`, `liveParams`, `stepLive`, `applyRemotes`, `sendState`); do not refactor existing functions or reorder `rand()` calls.
- `index.html` gets only `js/net/mpstatus.js`; everything else is lazy. Regenerate `sw.js` with `node tools/gen-precache.js`.
