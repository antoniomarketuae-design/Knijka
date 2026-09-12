## §14 — 2026-08-27: five repair waves, three instrument faults, and 70%

> §13 covers the sweep that made the evidence current. This covers what was
> repaired against it, and the three instrument faults that were quietly
> corrupting the ledger while it happened.

### State

- **HEAD `5d8df09`** on `scenario-engine`, pushed to origin AND vps.
- **filed 1475 · retired 1030 · open 445 · critical 157 — 70% done.**
- Sweep 3 (136 drives, 108 lessons) was running at handoff.

### THE ONE RULE THAT DECIDES WHETHER A WAVE CAN BE LANDED

**Exclusive file ownership per lane.** Wave 2 ran eight lanes in parallel
worktrees off one base; three of them each rewrote `rules/engine.ts`,
`lessons/engine.ts` and `objectives.ts`, conflicted, and `git apply --3way` left
**conflict markers inside the scorer**. The stack was reset and three lanes lost.

Waves 3, 4 and 5 named an exclusive file set in every lane's prompt. Result:
**zero cross-lane edits in three consecutive waves.** The one lane that did reach
across (wave 5's `remainder`, into `templates-hazards2.ts`) conflicted exactly as
predicted and was deferred rather than force-merged.

**The corollary, which worked twice:** a lane whose change breaks a file it does
not own must STOP and report file + line + edit. Wave 4's `rules` lane did that
for four assertions; integration then FLIPPED them (`.not.toContain` →
`.toContain`) rather than deleting, so the gates still bite in the direction that
is now correct.

### WHAT LANDED, in order of what it means for a student

1. **The motorway sanction is priced as a motorway** (`5d8df09`). Wrong-way ON A
   MOTORWAY printed the ONE-WAY STREET penalty — «Глоба: 51,13 € (100 лв.)»,
   «0 контролни точки — не е в списъка» — with чл. 178ж, ал. 1 demoted to a
   conditional row under «АКО ОТ ТОВА ИЗЛЕЗЕ БЕЛЯ». Now emits «глоба 511,29 €
   (1000 лв.) и 15 контролни точки от книжката. (ЗДвП чл. 178ж, ал. 1)». Proved
   by rendering the real debrief before and after, not by reasoning.
2. **The wet road costs what it is worth** (`ae87948`).
   `SPEED_TOO_FAST_FOR_CONDITIONS` was capped at the graced posted limit, so above
   it the code could not fire — while the product printed it under «Учебни моменти
   (не влизат в точките)», i.e. visible and free. Both lesson authors had already
   written that the mistake is double («грешката е двойна… чл. 20»).
3. **Objectives stop certifying a yield the engine just failed you for**
   (`bbf1223`). sc-signal-flashing printed «✓ …след като пропуснеш идващия отдясно
   1:48» directly above «✗ Непропускане… ОПАСНА ГРЕШКА в 1:43».
4. **The grader prices speed at all** (`c317a68`) — a continuing episode fired once
   and teach-first-then-grade spent that bill on the free mini-lesson.

### THREE INSTRUMENT FAULTS — all found by verifiers, all failing quietly

1. **`wave-c-merge` OVERWROTE the results file** on a second merge into one
   destination. Frames are added additively; results were replaced. MEASURED: a
   215-drive sweep then a 46-drive gap sweep left 261 frame dirs and **46 rows**.
   It printed "merged 46 drive(s)" — true, and reads like success. Fixed to merge
   by lesson+leg; mutation-proved 4+4=8. In production it then reported
   "158 already there + 46 from this run = 204".
2. **`make-verdicts2` hardcoded `wave-c`** as the judge prompt's frame root while
   reading results from `WAVEC_RESULTS`. Any sweep merging elsewhere sends every
   judge to a superseded build. Both paths now derive from the results path.
3. **JUDGES DID NOT TAG THEIR ROUND, so the previous round outranked them.**
   `wave-c-post` ranks `roundOf(i)*2 + (correctedBy === "verify")`, and `roundOf`
   only advances on a tag that is NOT "verify". Untagged judge lines join the
   PRECEDING block, where every older `verify` line beats them. The last boundary
   was line 2723, so 1,628 lines shared one block and **w11 verifiers were beating
   fresh w12 judgements**. Two verifiers found it independently. Tagging the round
   moved that adjudication from **56 to 73 retirements**. `make-verdicts2` now
   derives `ROUND_TAG` from the drive directory and requires it, with the
   consequence spelled out in the prompt.

### THE HARNESS NEVER FASTENED THE SEATBELT — and it skewed every score

194 of 204 drives in w12 were charged «Движение без предпазен колан −3». The
product was RIGHT: `LessonScene.tsx` records the founder's ruling against commit
265629d — all 150 scenarios spawn ready-to-drive with **exactly one item
outstanding, the belt**, «because the belt is the one pre-drive step whose
omission the rule engine goes on grading for the whole session».

So the harness drove like a student who never buckles up, putting a **3-point
floor under every score** and making every "does a good drive get credited" row
unanswerable. It now presses **KeyB** after `03-ready`.

MEASURED: sc-ac-ice pc-right went **3 → 0**, verdict unchanged. At sweep scale:
**0 of 25 drives charged** vs 194 of 204, and **16% of drives now score 0** vs 4%.

**A red that was mine:** that fix was committed on tsc + tools-tests alone and
broke `reverseAssist-audit-harness.test.ts`, which reads `lesson-audit.mjs` off
disk from `platform/src`. **TOOLS-TESTS IS NOT A SUBSTITUTE FOR THE FULL SUITE.**
The census was extended with the reasoning recorded, both gear assertions left
biting (its real claim is «there is no key that works the GEAR by hand»).

### THE TEST CLOCK IS NOW GLOBAL

Three tests went red WITHOUT ANY ASSERTION FAILING — starved, not slow:
publicBudget 0.75 s alone / 19.6 s under load; providerIntegration 0.33 s / 11.4 s;
scenery-sightline T6 1.28 s / >5 s. The suite is 1,026 files on `--maxWorkers=2`.
`testTimeout`/`hookTimeout` are **60 s globally**. `test-ownership.test.mjs`
REFUSED that change until both keys were vouched for in `VITEST_TEST_KEYS` with
the recorded reason they cannot deselect a file. **Add a key to that literal and
you must vouch for it there.**

### C: RAN OUT OF DISK — 1.1 GB free of 119 GB

Cause was NOT ours: `AppData\Local\prisma-dev-nodejs` held **18.7 GB**, almost all
of it two SQLite durable-stream journals that Prisma never compacts —
`default` **14.1 GB** and `knijka` **4.2 GB**, against databases of 160 MB and
90 MB. The `default` instance (port 51216) was dormant and unreferenced anywhere
in this repo; our `.env` points at 51218/51219, owned by `knijka`.

**MOVED, not deleted**, to `E:\prisma-parked\default` — reversible. C: went
1.08 → 15.46 GB. **Our `knijka` journal will grow the same way** (already 4.3 GB);
it cannot be moved while live. Still reclaimable when nothing is running: npm
caches ~3.1 GB, Temp ~3.2 GB.

### WHAT THE NEXT SESSION DOES

1. Sweep 3 was running at `5d8df09`. Merge to a FRESH destination (`w13`) —
   `w11` and `w12` frames are cited by banked retirements and must not be
   overwritten; the merge refuses on collision, which is correct.
2. Adjudicate: `WAVEC_RESULTS=<dest>/wave-c-results.jsonl node tools/audit/make-verdicts2.mjs <out> 35 6`,
   then run each batch through the Workflow tool. Judges now tag their own round.
3. `verdict-coverage` → `count-agreement` → `wave-c-post --apply` → `snapshot-ledger.sh`,
   then verify INDEPENDENTLY (raw BROKEN rows, closure ids, frame resolution) —
   count-agreement compares tools to each other and would say AGREED over a
   damaged corpus.
4. Re-run the held/deferred lanes: wave 5's `remainder`, plus `objectives`,
   `lessons-tail`, `hud-tail` from earlier waves.
5. **Still unfixable by any sweep of this shape: 72 rows** filed on `-wrong` legs,
   where 0 of 43 legs steer because the drive path runs the steering loop only in
   its `roll` phase. Fixing that unblocks all 72 at once.
6. **The debrief never says the licence is taken.** `debrief.ts gatedLineBg` drops
   `banBg` entirely — a WRONG_WAY debrief contains «три месеца» ZERO times, and
   the 1-month and 6-month bans are silent too. Found by wave 5's `rules` lane,
   which correctly declined to fix another lane's file.
7. Founder batch unchanged: `.audit-frames/wave-scripts/founder-batch.md`. The 29
   first-aid rows at `needs-review` still block BOTH standing vitest reds.
