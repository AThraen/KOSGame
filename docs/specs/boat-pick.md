# Boat pick: see and choose the boat on the level cards

Branch `boat-pick`. Request from the club's game owner: "On the level selection it could be good to see which boat you will be sailing. And on some of them it should be possible to decide the boat type yourself."

## Goals
1. Every level card that involves a boat shows a small picture of it plus its name (cached per class, no extra work per card).
2. On some levels the player picks the boat before starting.

## What each card shows (the truth at runtime)
- Activity has `boat`: that boat (races, docking, capsize, rigging, RIB, 3 lessons, nav.depth, rowschool.rib).
- No `boat`, mode `school` or `nav`: the mode sails the player's favourite boat (Garage, storage key `boat`, default `opti`); the RIB is replaced by the Optimist there. The card shows that boat. We deliberately do NOT hard-code `boat: 'opti'` on these: it would change what is sailed for players whose favourite is another boat, and the `school-grad` badge filters lessons with `!boat`.
- Pick activities show the currently chosen boat.
- No boat at all (knots, quiz, shed, rowschool theory): nothing shown.
Helper: `KOS.App.cardBoat(activity)`.

## Which activities let you choose (`activity.pick`)
- `pick: {group: 'challenge'}`: `sail.rings`, `sail.cleanup`, `sail.timetrial`. Candidates: the 8 sailing boats (no RIB). Default boat: favourite boat when it is a sailing boat, else Optimist. Choice stored per activity id.
- `pick: {group: 'free'}`: free sailing. Candidates: the 8 sailing boats plus the RIB (the RIB free ride exists today).
- Everything else stays fixed: races, lessons, docking, capsize, rigging, RIB missions, nav, rowschool.

## Free sailing: one card, per-boat ids kept
The per-boat activities `sail.free.<id>` stay registered (progress, stars, unlocks, badges, tools and tests keep working unchanged, no migration). Only `sail.free.opti` is a visible card (title on the card: "Fri sejlads"); the others carry `pickHidden: true` and are left out of the level list. The picker routes to `sail.free.<boat>`; stars shown on the card are those of the chosen boat. Area star totals still count all of them.

## Offered boats (pure rule, `KOS.BoatPick.offered`)
A candidate boat is offered when
- `settings.unlockAll` is on (all candidates), or
- it is the activity's default boat, or
- the player has sailed it: some activity with `boat === id` has stars >= 1 or is completed (challenge group); for the free group the rule is the existing per-boat gate: `sail.free.<id>` is unlocked (stars threshold), so nobody loses a boat they could start before.
Order is the candidate order (the boat ladder). If only one boat is offered, tapping the card starts straight away (no picker).

## Storage
Key `boatPick` (object, `{<pickKey>: <boatId>}`; pickKey is the activity id, or `sail.free` for free sailing). Read through `KOS.BoatPick.cleanChoices` (drops non-string, unknown boats, non-objects) and resolved with `KOS.BoatPick.resolve` (a stored boat that is no longer offered falls back to the default). Wiped by Storage.reset like `boat`.

## Runtime
`App.play(id, {boat})` passes the choice as an option; the play host uses it only for activities with `pick` and a valid boat (never the RIB in a challenge). `host.boat` then drives sail.js unchanged. Retry/restart keep the choice. `App.play(id, {force:true})` without `boat` behaves exactly as before (tools/tests). Results-screen "next" resolves the stored choice for pick activities.

Scoring: sail.js already computes the reference time (`routeTime`) from the boat class (rings/cleanup chain and time-trial course), so star thresholds scale per boat; no change needed.

## UI
Pick cards show a highlighted boat chip with a small "change" arrow. Tapping opens a dialog: a radiogroup grid of boat tiles (picture + name; arrow keys move, Enter/Space select, buttons min 44 px), primary button "Start". Default selection is the stored/default boat. All strings da + en (`app.pick.*`). No "Coach" wording.
