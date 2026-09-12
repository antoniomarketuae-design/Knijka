## §13 — 2026-08-26 (second session): the day the evidence turned out to be a week old

> Read §12 first for the standing order and the eleven invariants; nothing here
> replaces them. This section records what changed and what the next session
> must NOT relearn.

### State at the end of this session

- **HEAD `ba3ed16`** on `scenario-engine`, clean, pushed to origin AND vps.
- **filed 1471 · retired 788 · open 683 · critical 220.** Every counter agrees.
- Ledger snapshotted to `ledger/audit` on both remotes after every corpus change.

### THE FINDING THAT REFRAMES THE PROGRAMME

**475 of the 476 STILL rows rested on frames photographed BEFORE 2026-08-25.**
159 came from `sweep161`, shot 2026-08-18. Three repair commits landed on the
morning of 2026-08-25 — `d8c1b80` 08:36 (touch hint clears the mirror),
`c61868b` 09:55 (briefing's first step gets its number back), `bc5a279` 10:07
(four HUD surfaces get their ground back) — and the dead-predicate wave landed
2026-08-26. Every one of them is AFTER every frame in the corpus.

Those verdicts were never wrong about their frame. They were answering a
question about a build that no longer exists.

It was found empirically before it was measured: two independent adversarial
verifiers, reading source instead of photographs, reported that the rows their
lane claimed were **already closed by an earlier commit**. `briefing-step1`'s
agent honestly claimed 0 and its verifier found 28 genuinely addressed by
`c61868b`. `hint-plate`'s agent claimed 18 and its verifier confirmed 0, ruling
all 18 a **credit misroute**. 46 rows in 2 of 8 lanes.

**Operational consequence, and it is the reason to batch:** source-level
verification can never retire anything — `wave-c-post` requires a frame that
resolves plus a quote, which is correct. So every repair round that lands
without a sweep behind it ADDS to the proof backlog instead of draining it.
Batch the repair waves; drive once.

### What ran

**Repair wave 1** — 8 root-cause lanes over 151 of the 476 STILL rows, each
attacked by an adversarial verifier, then a fix round on the four lanes that
needed it, each re-attacked by a SECOND verifier told to check whether the
blockers were resolved or merely reworded.

FIVE LANDED (`ba3ed16`): engine-conviction (12 critical), objectives-never-ticked
(9 critical), simoverlay-plate, briefing-step1, overflow-clip.

THREE DID NOT, and that is the wave working:
- `hint-plate` — claimed 18, closed 0; would have shipped a NEW defect breaking
  `NOTIFY_COLUMN_MIN_LEFT_FRACTION` on 8 of 12 ladder devices, invisible to
  `notify-column.test.ts` because that test measures from the CSS width alone.
- `camera-void` — withdrew itself to a **0-byte patch**. R0 look-before-ship
  cannot be done from a lane forbidden to run a browser, and the change rewrote
  the live chase camera. Its three rows stay open. Correct answer, not a failure.
- `speed-ambiguity` — second verifier: DO-NOT-LAND on an unmodelled width
  regression and a calibration that contradicts itself in the same block.

**The engine-conviction lane is the one to understand.** `stepEpisode` bills a
one-switch duty ONCE per episode, and teach-first-then-grade spends that single
event on the free mini-lesson — so the «повторение» the debrief promises never
arrives, and `sc-ac-night-lights` drives a whole night section unlit to «чисто
каране по изпитния лист». It now bills exactly TWICE (teach + grade,
`STANDING_DUTY_MAX_BILLS`), which is the only value satisfying both open
criticals: bill once and `sc-ac-rain-lights` keeps congratulating an unlit run;
bill freely and `sc-junction-scan`'s 356-точки runaway returns.

Its FIRST version also shipped an `onRoad` acquittal that **disarmed В27 in the
exact case the В27 lesson teaches**. The verifier caught it; the fix agent
dropped the gate whole rather than narrowing it, proved the six span detectors
byte-identical to HEAD, and found the same flaw in the curve arm nobody raised.

### Tool defects fixed, each of which was silently defeating the process

1. **`apply-splits.mjs` destroyed 638 findings on its second run** (`0bee40d`).
   It REWROTE `chunk-split.jsonl` instead of merging, and was the only writer in
   the file taking no `.pre-split` backup. `filed` fell 1462 → 824. **And
   `count-agreement` then printed AGREED**, because all nine tools read the same
   damaged files. Recovered whole from `ledger/audit`. Now merges by
   `parentId + childIndex` and shouts if the file shrinks.
2. **`npx tsc --noEmit` at the repo root was never running the gate.** It
   resolves an unrelated npm package called `tsc`, prints "This is not the tsc
   command you are looking for", and exits 1 with ZERO `error TS` lines. Run it
   from `platform/`.
3. **`npx prisma` at the repo root fetches 8.0.0-rc.11** over the pinned 7.8.0 —
   and the infra checklist tells you to run `prisma db push`.
4. **`/api/health` says `commit:"unknown"`** unless `NEXT_PUBLIC_COMMIT_SHA` is
   set; the harness then refuses every drive. Put it in the gitignored
   `platform/.env` and rewrite it on every commit.
5. **`waveC-redrive.json` is the drive set, not the open list.** A lesson whose
   row omits the leg you pass plans **0 drives** and prints that at exit 0.
6. **`wave-c-merge.mjs` overwrote the results file on a second merge into the
   same destination.** Frames are added additively; the results file was
   REPLACED with only the halves named on that command line. MEASURED: a
   215-drive sweep merged into `w11`, then an 8-lesson gap sweep merged into the
   same `w11` — frames went to 231, the results file went to **16**. Nothing
   errored, and it printed "merged 16 drive(s)", which is true and reads like
   success. Every downstream tool reads the results file, so 215 certifiable
   drives would have been invisible to adjudication with their frames sitting
   right there on disk. Now merges by lesson+leg and shouts if the file shrinks;
   mutation-proved 4 + 4 = 8.
7. **`make-verdicts2.mjs` hardcoded `wave-c` as the frame root** while reading
   its results from `WAVEC_RESULTS`. Any sweep that merges elsewhere — and this
   one had to — would have sent every judge to pictures from a superseded build.
8. **The judge brief never mentioned steering.** Fixed; see below.

### The §12c PARTIAL split is DONE

13 atomic children from the last 4 compounds, 6 GONE / 7 OPEN, every GONE
carrying a frame checked for non-zero size. The splitting agent OVERRULED the
previous verifier on `sc-park-gap-short`'s key badge: comparing filed and current
frames at 700% showed it was already inside the card border on the filed frame
and still renders as a bare `[` glyph, not the `E` the row names.

### THE SWEEP THAT SETTLES IT — DONE, and the evidence is perfect

**231 drives at `ba3ed16`, in `.audit-frames/w11/`.** 129 lessons in the main
sweep (215 drives, 4 supervised shards) plus an 8-lesson gap sweep (16 drives)
for lessons that carried only UNJUDGED-class rows and so were missing from the
STILL-derived drive set.

- non-zero exits: **0** · treeMoved: **0** · zero-byte frames: **0**
- all 231 legs: *"a pill was read off the debrief — judgeable"*
- one attested commit throughout: `ba3ed1638991`
- verdicts: 121 НЕИЗДЪРЖАН · 50 НЕЗАВЪРШЕН · 44 ИЗДЪРЖАН (main sweep)

**STEERING IS HALF-FIXED, and this is new.** 77 of 82 `-right` legs STEERED
(22–110 wheel commands each). 0 of 43 `-wrong` legs did — the drive path runs the
steering loop only in its `roll` phase, and every MODE=wrong lane holds the
throttle flat and never reaches it. So **72 of the open rows cannot be settled by
any sweep of this shape**: they are filed on a `-wrong` leg and turn on steering,
lane position, parking, reversing or objective crediting. Judges are now told, in
the generated brief, to mark those UNJUDGED and never STILL. Task #18 is
therefore half-closed: right legs really drive now.

Of the 5 `-right` legs that did not steer, 3 are `guidance loop NOT-RUN` on
`sc-vp-*` vehicle-preparation lessons (correct — the car is not meant to move) and
2 are `guidance loop BLIND` (`sc-ac-truck-spray`, `sc-fo-motorway-gap`), which may
themselves be defects worth filing.

### WHAT THE NEXT SESSION DOES

1. Adjudicate on the FRESH frames:
   `WAVEC_RESULTS="E:/AI driver/.audit-frames/w11/wave-c-results.jsonl" node tools/audit/make-verdicts2.mjs .audit-frames/verdicts-w11 35 6`
   then run each emitted `verdicts-batch-N.js` through the Workflow tool
   (judges + adversarial verifiers).
3. `verdict-coverage` → `count-agreement` → `wave-c-post --apply` → `snapshot-ledger.sh`.
   **This is where the count finally moves.**
4. THEN wave 2 (133 rows, 25 critical) and wave 3 (192 rows, 74 critical) — both
   pre-built in `.audit-frames/patches/w2` and `w3`, every row assigned exactly
   once. **Re-derive them after adjudication**, because the open list will change.
5. Re-run the three held lanes against fresh frames: `hint-plate`, `camera-void`,
   `speed-ambiguity`.

### Founder-only batch, assembled

`.audit-frames/wave-scripts/founder-batch.md`. The headline item: **29 first-aid
questions sit at `needs-review`** with their ERC 2021 sources already retrieved —
signing them clears BOTH standing red vitest files (`content-bank` "no dark,
threadbare or under-represented topic" and `compose` "gives every lesson at least
one quiz beat"). Also: 3 questions with unconfirmed legal citations, the
200-UNJUDGED decision, and two exposed credentials still unrotated.
