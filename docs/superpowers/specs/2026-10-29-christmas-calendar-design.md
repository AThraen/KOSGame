# KØS SEJL Julekalender 2026: design (issue #6)

Status: written 2026-10-29, ready to build. Must be live on production **before 1 December 2026** (release target: tag by 27 November).
Related: #6 (this), #35 (cross-device login, separate design: `2026-10-29-device-pairing-design.md`).

## 1. Intent

KØS's young sailors are off the water in December. A Christmas calendar gives them a reason to open the game every day: one door a day, a short (2–4 min) sailing-flavoured activity behind it, and a daily elf hunt across the game. The club gets a visible, cosy, low-effort December presence. It must feel like a gift, never like homework.

**Success:** a kid opens the game on 1 December and immediately sees a snowy harbour, a glowing calendar and a Santa-hatted coach saying "Låge 1 er klar!". Every door works on every supported device. On 24 December the tree on the jetty is full and the star goes on top.

## 2. Goals, non-goals, anti-goals

**Goals**
- 24 doors opened by local device date. Missed doors can be opened later, with no penalty, until 6 January.
- Each door gives a bauble on the Christmas tree. Finishing the door's activity turns it gold.
- A daily elf hidden somewhere in the game (24 named elves) with a "Nisse-jagt X/24" counter and an elf gallery.
- A wintry look while the season is on: snow on the title and hub, Christmas decorations on the hub map, Santa hats on coaches.
- **Testable any day of the year** with a date override (section 9).
- Reusable for 2027: content is data, dates are windows, and saves are keyed by year.

**Non-goals**
- Login or sync. The state is designed to merge later (section 7) but needs no server.
- New physics or new game modes. All content reuses existing modes, some with a Christmas theme parameter.
- Any leaderboard.

**Anti-goals (fail even if it "works")**
- Punishing missed days, streak-loss guilt, or anything that nags.
- Breaking any existing activity or test, or making the hub slower (the map must stay static: no animated vectors on the panned map, which made Android flash).
- Spoilers on production: kids must not be able to open all doors early by sharing a link (the date override needs God mode).
- Text that only works in Danish: every string comes in da and en, and `check-i18n` passes.

## 3. Season windows (extend `js/ui/season.js`)

Add to `WINDOWS` (group `xmas`, override `#xmas=1|0|auto` exactly like Halloween):

| id | from | to | what |
|---|---|---|---|
| `xmas` | 2026-11-29 | 2027-01-06 | the calendar pin/screen and the `xmas.*` activities. From 29 Nov (1st Advent) to 30 Nov it is a **teaser**: every door is locked and shows a countdown. |
| `xmas-deco` | 2026-11-29 | 2027-01-06 | snow, hub decorations, Santa hats |

**Date override (new, my call):** `#date=YYYY-MM-DD` stores `kos.season.date` and makes `Season.now()` return that date at the current time of day. `#date=auto` clears it. It **only takes effect while God mode is on** (`KOS.Storage.god()`), so `#god=1&date=2026-12-13` is the tester link. The calendar and everything date-based must read the date via `KOS.Season.now()`, never `new Date()`. While an override is active, a small "Testdato: 13. dec" pill shows at the top of the hub and the calendar. Tests keep using `Season.now = () => ...` and `Season.force`.

## 4. The calendar

### 4.1 Entry points
- **Hub pin** "Julekalender" at the club (like the Halloween promo pin, `js/ui/hub.js`, `data-act="xmas"`). The badge is a small gift/tree icon, and the subline says "Låge 5 er klar!", "Åbner 1. dec" (teaser) or "Alle låger åbne" (after the 24th). Generalise the Halloween event-pin code so both can exist from one table, instead of copying it.
- **As built (pin and hello):** the pin sits out in the open bay off the club (world point of the club, offset into the water) so it is clear of every place label from 320×568 to 1280×800; the first-visit toast says "Find den på kortet ude i bugten". It is listed first in "Alle steder" (Halloween keeps its old place after the areas). The daily coach line waits until the toast has gone, opens the calendar when tapped, moves to the half of the screen without the pin on wide screens, and if it still covers the pin the map glides the pin clear. The elf chip is hidden in the teaser (29–30 Nov). The God-mode "Testdato" pill on the calendar sits in the header under the status line.
- The **"Alle steder" list** gets the same entry.
- **One-time toast** the first time the hub opens in the season, plus a coach line (Santa-hatted) the first time each day a new door is ready: "Låge N er klar!". At most once per day, stored in the xmas state.
- **Deep link** `#xmas` (or `#screen=xmas`, whichever matches the router) opens the calendar.

### 4.2 Calendar screen (`screen-xmas`, new `js/ui/xmas.js` + `css/xmas.css`)
- The layout is a winter **boat shed wall with 24 doors** in a shuffled but fixed order (the classic calendar look). On a phone it is a 4×6 grid; on wide screens, 6×4 or 8×3. It fits without scrolling at 390×844 and 844×390, and scrolls gracefully at 320×568.
- **Door states:**
  - *locked future*: frosted, with "om 3 dage" on long-press or tap (a small shake plus toast).
  - *ready*: glowing and pulsing gently (no pulse when reduced motion is on).
  - *opened*: shows the door's icon and a silver bauble.
  - *gold*: a gold bauble once its activity has been finished.
- Opening a ready door plays a short door animation and a bell, then shows a **door card**:
  - the door title and a one-line Christmas framing text (da/en), with the day's coach in a Santa hat;
  - a "Spil" button (launches the activity, see 4.3);
  - the **elf hint** for that day ("Søren gemmer sig ved masten i garagen …");
  - a "Senere" button.
  Re-opening an opened door shows the same card.
- A **tree panel** on the screen (and the same tree on the hub map at the jetty) shows 24 bauble slots: empty, silver or gold. The star appears on top once door 24 is opened.
- A **"Nisse-jagt 7/24" chip** opens the **elf gallery**: 24 slots, found elves in colour with their name, unfound ones as grey silhouettes labelled "?". The chip is also shown on the hub during the season.
- **Back:** it obeys the existing back-button/history system (`js/ui/history.js`, `tools/test-back.js` must still pass).

### 4.3 Doors (data table in `js/ui/xmas.js`, my call, adjustable)
Each door is `{ day, act, icon, coach, title{da,en}, text{da,en}, elf }`. Launch with `KOS.App.play(act, { force: true, from: 'xmas', day })`; `force` bypasses normal unlocks. Activities with a boat pick must launch straight into the default boat or show the normal pick flow; the builder verifies each id launches headlessly and swaps any that do not for a similar one.

| day | activity | framing (da gist) |
|---|---|---|
| 1 | `xmas.presents` (new) | Gavejagt i bugten: saml julegaverne |
| 2 | `quiz.xmas1` (new) | Julequiz 1 |
| 3 | `knots.eight` | Bind snoren om julegaven |
| 4 | `shed.tidy` | Juleoprydning i skuret |
| 5 | `dock.opti.jetty` | Nissen skal i land til risengrød |
| 6 | `rib.tow` | Træk juletræet hjem til klubben |
| 7 | `quiz.xmas2` (new) | Julequiz 2 |
| 8 | `rigging.opti` | Rig julebåden |
| 9 | `knots.bowline` | Pælestik til kanen |
| 10 | `nav.buoys` | Julemandens bøjer |
| 11 | `sail.cleanup` | Julerod i bugten |
| 12 | `capsize.opti` | Isbad! Kæntringsøvelse |
| 13 | `xmas.lucia` (new) | Luciasejlads med lys i mørket |
| 14 | `quiz.xmas3` (new) | Julequiz 3 |
| 15 | `knots.clove` | Dobbelt halvstik om juletræet |
| 16 | `rowschool.r10` | Hvem viger på vej til julefrokost? |
| 17 | `dock.rib.pontoon` | Julemandens RIB skal fortøjes |
| 18 | `sail.timetrial` | Kanen mod tiden |
| 19 | `nav.night` | Nattesejlads under julestjernen |
| 20 | `shed.rush` | Travlt i nisseværkstedet |
| 21 | `knots.cleat` | Vintersolhverv: fortøj båden |
| 22 | `rib.rescue` | Nissen faldt i vandet! |
| 23 | `quiz.xmas4` (new, 8 q) | Lillejuleaftens-quiz |
| 24 | `xmas.finale` (new) | Juleaftens store gavejagt + stjernen |

Coaches rotate through `anton storm marius ida maria nicolas peter jesper`.

**Bauble rules:** opening door N gives a silver bauble. A successful finish (`result.success`) of door N's activity **after door N was opened** turns it gold, whether launched from the calendar or not; listen to the `progress` event. Stars and XP are recorded as normal by the activity.

### 4.4 New content (all `area: 'event'`, `season: 'xmas'`, reached through the calendar; they don't appear in area screens)
- **`xmas.presents` / `xmas.finale`:** `sail` mode `kind: 'rings'` with a new param `theme: 'xmas'`, which draws wrapped presents (red/green/gold boxes with ribbon) instead of rings, light snowfall on the canvas (off in low-fx/reduced motion) and Christmas result text. The finale uses more presents (12), a slightly harder breeze, and a big star as the last pickup. Pick-group: none (default Optimist).
- **`xmas.lucia`:** `halloween` mode with `theme: 'lucia'`, which makes the night sail collect floating candles/lanterns (warm light), with **no ghost boats** (`ghosts: 0`) and Lucia strings ("Sankta Lucia" intro). The Halloween strings and behaviour stay untouched when `theme` is absent. Note the mode is registered by `halloween.js`, but only the `halloween.hunt` activity is season-gated to Halloween, so the mode is available all year.
- **`quiz.xmas1..4`:** a new quiz category `xmas` (da+en), ≥ 28 questions mixing Christmas with winter sailing life (winter storage, ice, Lucia, julenisse and knots, safety in cold water, club traditions). Each has the existing quiz shape, n = 5 (xmas4: 8, all cats incl. `xmas`), with different seeds. Questions must be factually safe; no religious content beyond common Danish tradition.

## 5. The elf hunt

- 24 named elves (da names, used in en too, with an en tagline):
  1. Skøde-Søren
  2. Fender-Frida
  3. Knob-Karl
  4. Ror-Rikke
  5. Bom-Bent
  6. Sejl-Sofie
  7. Mast-Mads
  8. Jolle-Julie
  9. Bøje-Bo
  10. Vante-Vera
  11. Ankér-Anton
  12. Kompas-Klara
  13. Lucia-Lea
  14. Pagaj-Per
  15. Vimpel-Vilma
  16. Klampe-Klaus
  17. Kaase-Kamma
  18. Bølge-Bertil
  19. Spiler-Signe
  20. Tovværk-Thor
  21. Rorpind-Rasmus
  22. Redningsvest-Ronja
  23. Pejling-Palle
  24. Julestjerne-Nisse
- **Visibility (my call):** elf N appears at its spot **once door N has been opened**, and stays there until found, even after the season (until 6 Jan). The door card gives the hint.
- **Spots (data, my call):**
  - 12 on the hub map, at world coordinates like the Halloween `DECO` table, static and spread around harbour, bay and land;
  - 2 on the calendar screen;
  - 2 in the garage/passport;
  - 1 on the settings screen;
  - 1 on the title screen;
  - 1 in the "Alle steder" list;
  - 3 on area screens;
  - 2 on the results screen of specific activities (shown after finishing that activity, e.g. elf 13 after `xmas.lucia`).
  The builder may move spots for layout reasons, but must keep them visible without scrolling at 390×844 and reachable at 320×568.
- **As built (hub spots):** the map elves live in a layer under the pins, drawn at about 23 px and peeking over a little snowdrift (hat and face only) with a 44 px target. Spots were moved so no elf touches a pin badge or label from 320×568 to 1280×800: elf 1 among the firs west of the harbour, 7 just south of the clubhouse, 14 in the water east of the RIB pontoon, 20 on the tip of Svaneknoppen (hints updated to match). Round 2: elf 1 moved by the snowman west of the harbour and elf 7 to the big Christmas tree at the clubhouse, so neither sits under the "Næste udfordring" bar in the default view (at 320×568 elf 7 still has 7 px of its 44 px target under the bar). Elves on open water (9, 14, 15, 18, 21) peek over a translucent blue-grey ice floe showing only hat and eyes; land drifts are off-white (#e6eef5).
- **The elf:** a small SVG nisse (red cap, beard, sailing jacket), about 30 px drawn with a hit area of at least 44 px, peeking from behind something. It is not shown while an activity is running (no in-canvas elves). Tapping it plays a "Hov!" pop with a bell sound, it hops away, and a toast says "Du fandt Knob-Karl! (7/24)". Recorded immediately.
- **Badges** (via `KOS.App.addBadges`):
  - `xmas-elf-8` "Nissespejder"
  - `xmas-elf-16` "Nissedetektiv"
  - `xmas-elf-24` "Nissemester"
  - `xmas-doors-24` "Juleaften" (all doors opened)
  - `xmas-gold-24` "Guldjul" (all 24 gold)
  `tools/check-badges.js` must still pass.
- **Reward at 24 elves (my call):** a "Julerød" boat colour (red hull with gold stripe if the boat renderer supports stripes; otherwise red with the badge only) unlocked in the profile colour picker. If there is no colour list to extend, the badge alone is the reward. This is the builder's call; note what was done.

## 6. Christmas look (only while `xmas-deco`)
- **Title:** CSS snowfall (a few dozen flakes, transform-only, off when reduced motion or low-fx is on), plus a small "God jul fra KØS" line.
- **Hub map decorations:** a static `XDECO` table like `DECO`: small fir trees, snowy roofs/caps on club buildings if feasible, a snowman on land, string lights along the jetty, and **the big tree at the jetty showing the live bauble state** (re-rendered on refresh, never animated on the panned layer). A light snow overlay above the map (screen layer, CSS, off when low-fx is on) is allowed if it does not hurt `perftier`/`hublite`.
- **As built:** the hub snow overlay and the snowy roofs were left out (animated layers over the panned map made Android flash, and the static firs, snowman, lights and tree already carry the look). The title gets a cool winter-evening tint over the sunset photo instead. In English the calendar is called the **advent calendar** ("Christmas calendar" did not fit the 320 px header and the hub pin).
- **Coaches** wear a Santa hat (`coachSvg` overlay) everywhere during deco.
- **Race marks:** no change, unless trivial.
- **Halloween:** no conflict, because its windows end 9 Nov.

## 7. State and future sync
- Key `KOS.Storage` `'xmas2026'` (year in the key, reusable in 2027): `{ v: 1, open: { "1": ts, ... }, gold: { "3": ts }, elves: { "7": ts }, seen: { toast: ts, coachDay: "2026-12-05" } }`. Validate on read; garbage falls back to empty.
- `KOS.Xmas.merge(a, b)` is a pure function that takes the union of `open`/`gold`/`elves` with the earliest timestamp, and the later of the `seen` values. It is exported for #35 sync and unit-tested now.
- `KOS.Xmas.state()`, `openDoor(n)`, `markGold(n)`, `findElf(n)`, `dayInfo(date)` → `{ phase: 'before'|'teaser'|'advent'|'after'|'closed', today: 1..24|null, openable: [..] }`. These are pure where possible so test-core can run them in Node.
- **Matomo** (via the existing `js/ui/track.js`):
  - category `julekalender`, actions `door`/`gold`/`elf` with value N;
  - page path `/julekalender` on screen view.
  No personal data.

## 8. Constraints
- Plain HTML/JS/SVG, no build step, no dependencies. New files go in `sw.js` precache (`node tools/gen-precache.js`). `index.html` script order follows the existing pattern.
- Danish default, English complete. Kid-safe text.
- Works offline, on low-end phones (respect `lowFx`, `reducedMotion`, the `hub-lite` path), and in portrait and landscape.
- The game must behave exactly as today outside the season windows; `tests all` must pass in Oct/Nov dates.
- Code style matches the surrounding code: comment density, `KOS.*` module pattern, i18n via `KOS.I18n.add`.

## 9. Testing without waiting for December

**For Allan (test site after a push to main, or local `npm start`):**

| Link suffix | Shows |
|---|---|
| `#god=1&date=2026-11-29` | teaser: pin "Åbner 1. dec", all doors locked, decorations on |
| `#god=1&date=2026-12-01` | day 1: door 1 ready, toast + coach |
| `#god=1&date=2026-12-13` | Lucia day, doors 1–13 openable |
| `#god=1&date=2026-12-24` | finale + star |
| `#god=1&date=2027-01-07` | everything gone, normal game |
| `#date=auto` | back to the real date |
| `#xmas=1` / `#xmas=0` / `#xmas=auto` | force the season on/off regardless of date (before 29 Nov, forced on shows only the locked teaser unless God mode is on) |

In God mode the calendar also shows a small **dev bar**: `◀ dag ▶` to step the override date by one day, plus "Nulstil jul" to clear the `xmas2026` state. God mode's existing "win" button finishes activities, for gold-bauble testing.

**Automated:**
- **`test-core`:**
  - xmas window boundaries;
  - date override honoured only with God mode;
  - `dayInfo` across 28 Nov → 7 Jan;
  - open/gold/elf rules (elf visible only after its door, gold only after open);
  - `merge` union/idempotence/commutativity;
  - every door activity id exists while the season is forced on and is hidden when it is off;
  - the quiz bank has ≥ 28 `xmas` questions in both languages;
  - corrupt state falls back to empty.
- **New suite `xmas`** (`tools/test-xmas.js`, headless Chrome, registered in `run-tests.js`):
  - at 390×844 and 1280×800, date 2026-12-05 with God mode: title has snow, hub shows pin + tree + elf chip;
  - calendar shows doors 1–5 ready and 6–24 locked; open door 1 → card → play → God-win → bauble gold;
  - find elf 1 at its spot → counter 1/24 → gallery shows it;
  - date 2026-11-29: teaser; 2027-01-07: no pin, no decorations, no `xmas.*` activities;
  - every one of the 24 door activities launches without page errors (start, wait 1.5 s, quit);
  - zero `pageerror`/console errors throughout; screenshots saved to `tools/tmp/xmas/` for review.
- `node tools/run-tests.js all` passes (incl. i18n, back, mobile, hublite, perftier, smoke).
- **Visual review loop:** a reviewer (separate agent) inspects the screenshots against this document, then the issues are fixed and re-shot until clean.

## 10. Left to the builder
- Exact visuals: door art, elf SVG, tree, present sprites, snow density, palette (warm red/green/gold on the dark-navy UI).
- Exact elf spot coordinates and which area/results screens host elves.
- How the "Julerød" reward plugs into the profile (or badge-only).
- Whether door activities with a boat pick use the pick flow or a fixed boat.
- Door order on the wall.

## 11. Release
- Work on branch `xmas-calendar`, merge to `main` (test site) for Allan's phone test with the links above.
- Allan approves, then tag `v0.9.0` (target ≤ 27 Nov). Content then "wakes up" by itself on 29 Nov (teaser) and 1 Dec.
