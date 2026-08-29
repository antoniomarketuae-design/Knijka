# Handoff — 2026-08-23, account switch #2

This replaces `89_HANDOFF.md`, which handed over the account switch before this one.
Read that file only if you want the history; **everything you need to act is here.**

---

## 0. THE ONE PARAGRAPH VERSION

The audit's open list has moved from **1,012 → 594** (criticals **318 → 196**), and for the first
time some of those closures happened *because a repair reached a student* rather than because a
symptom was already gone. Getting there required discovering that **the harness could not steer, could
not select reverse, and does not give the same answer twice** — three facts that invalidated a class of
earlier conclusions and one of the numbers I reported. 38 commits, all gated. **A 246-drive proof cycle
is running right now**; it is the next thing to land, and §3 tells you exactly what to do with it.

---

## 1. WHERE THINGS STAND, EXACTLY

```
filed BROKEN    : 1045    (the corpus, never rewritten)
retired         : 451     (closures.jsonl, each with a frame and a quote)
OPEN            : 594     (196 critical · 354 major · 44 minor)
lessons open    : 139 of 146      suspect files : 118
```

Recompute it yourself — never trust this file's numbers:

```bash
node tools/audit/finding-reader.mjs --count
node tools/audit/count-agreement.mjs        # every counter must agree
```

**HEAD is `769bfd4`**, branch `scenario-engine`, tree clean, 38 commits ahead of the previous handoff.

**Gates at HEAD:** `tsc` 0 · `validate-content` 0 · `tools-tests` 0 (473 pass) · `vitest` **15,390
passing** with **exactly two failures that are red on purpose** — `content-bank.test.ts`
(`ptp-i-parva-pomosht` 31/64 against a 50% floor) and `compose.test.ts` (`l-accidents-first-aid` has no
quiz beat). **Those are a signature problem, not a code problem. Only the founder signs content. Do not
"fix" them, and do not let a lane delete them.**

### RUNNING RIGHT NOW — do not disturb until it finishes

Four `wave-c.mjs` drivers, **123 lessons × 2 legs ≈ 246 drives**, output to
`.audit-frames/proof2-{1,2,3,4}`, all attesting **`769bfd43`**, logs at
`<scratchpad>/p2run-{1,2,3,4}.txt`. Roughly 6 hours at 4 drivers.

**THE REPO MUST NOT MOVE WHILE THEY RUN.** The harness stamps the worktree hash at the start and end of
every drive and refuses to certify when it differs. I broke this rule once by creating one file under
`tools/` mid-run and spoiled four drives. Not a modified file, not an untracked one — nothing. Scratch
work goes in the scratchpad or under `.audit-frames/`, both outside the hash.

**I broke this rule TWICE, and the second time was writing this handoff.** Creating this very file under
`docs/` moved the worktree hash while the proof-2 drives were in flight and spoiled
`sc-crossing-white-cane pc-right` — it is listed in step 1 as a re-drive. The lesson is not "be careful";
it is that **the repo has no safe corner during a certifying run.** If you must write a document while
drives run, write it in the scratchpad and move it in afterwards.

Wait for all four with:

```bash
until [ $(grep -l "drive(s) written to" <scratchpad>/p2run-*.txt | wc -l) -eq 4 ]; do sleep 120; done
```

A driver exiting **non-zero is normal** when some drive is uncertifiable — it is the harness refusing to
let a wrapper report success over bad evidence. Read the tail of its log, not the exit code alone.

---

## 2. THE FIVE THINGS THIS SESSION PROVED THAT CHANGE HOW YOU WORK

These cost days to find. Do not re-derive them, and do not let an agent contradict them without measuring.

### 2.1 The harness could not steer — every drive before `60b12e0` was a car that could not turn

A full keyboard census of `tools/mobile/lesson-audit.mjs` returned three keys: `KeyW`, `KeyS`, `Escape`.
The product takes steering from `KeyA`/`KeyD` (`engine/input.ts:194-195`) and there is **no auto-steer
anywhere** in the sim. That covers all 376 Wave C drives and every drive behind the original 1,712
findings.

It is fixed and proven (`60b12e0`, `70bcd1b`): a guidance controller follows RouteGuidance's ghost
ribbon, and every drive publishes a tracking record (`tracked` / `intermittent` / `blind`).

**The trap, which cost a wrong assertion:** holding a steer key tilts the cockpit camera by
`COCKPIT_LOOK_INTO_TURN` = 0.09 rad = 5.16°, and releasing it puts the world back **exactly**. A probe
that photographs *while the key is held* measures the camera lean and reports a turn that never
happened. Measure before-press to after-release-and-settle.

**Consequences you must respect:**
- **A drive stamped `blind` closes nothing.** The controller loses the ribbon on sharp turns, so junction
  lessons often come back blind. Check `guidance` in `_audit-status.json`.
- **The ribbon is a road CENTRELINE, not a lane** (`guidanceRoute.ts`). No lane-position claim — drifted
  into oncoming, clipped the kerb, failed to keep right — can be settled from a steered drive **in
  either direction**.

### 2.2 THE HARNESS IS NOT DETERMINISTIC — verdict-diff across runs is not an instrument

`sc-ln-obstacle-meeting/pc-right`, eight consecutive runs, one commit, unchanged worktree, no repair
between them:

```
6 x НЕИЗДЪРЖАН  10 точки  1★      (140-170 s / 29-33 frames  OR  269-271 s / 50-54 frames)
1 x ИЗДЪРЖАН     0 точки  3★
1 x НЕЗАВЪРШЕН   0 точки  1★
```

**A 13% pass rate on identical code**, with bimodal durations — the same inputs produce either a ~110 s
drive that ends naturally or one that burns the whole 210 s budget. The control law is wall-clock
(`ROLL_MS 4000` / `STOP_MS 3000`), so CPU jitter decides how far the car travels per phase.

- **"The lesson passes now" closes nothing. "The lesson fails now" refutes nothing.** A score moving
  0 ↔ 10 between runs is expected noise.
- If you genuinely need a verdict-level fact, **drive it N times and report the rate.** One run is an anecdote.
- **This is also a product finding**, filed as a critical: a lesson whose correct line survives ordinary
  jitter 13% of the time has no success corridor, and the outcome is not a function of the driving.

**One number I gave the founder is affected and must be re-stated if it comes up:** the re-baseline's
*"13 of 92 lessons (14%) were instrument artifacts"* was built on verdict-diff. Some of those flipped by
luck. The honest version is unknown without N-run rates.

**What is NOT affected: the 451 retirements.** Wave C compares *a symptom on a photograph* against *the
same symptom on a newer photograph*, with an adversarial verifier attacking every closure. "The teaching
card is sliced through the middle of a word" does not flip between runs.

### 2.3 The correct drive crawls because the harness makes it crawl

`lesson-audit.mjs` runs `CRUISE_KMH 12` / `ROLL_MS 4000` / `ROLL_DISTANCE_M 15` / `STOP_MS 3000` **in
RIGHT mode only** (`:3769`, `:3837`), producing a saw-tooth peaking at ~14 km/h on every lesson. The same
lesson's WRONG leg ramps to 135 because it holds full throttle.

27 findings blamed the product for that motion; adjudicated clause by clause they came out
**REFUTED 11 · CLOSED 4 · STILL 10 · UNJUDGED 2**. The rule to apply: *the crawl explains the motion,
never the grading.* A drive that crawls **and is awarded three stars** still has a rubric defect.

**A control that is NOT one:** the steered re-drives kept `CRUISE_KMH = 12`, so "it crawls there too" is
true by construction on every lane. I put that check in a brief and a verifier had to correct me.

### 2.4 The debrief tally under-reports faults, and `08-debrief.png` is a viewport shot

- On `sc-mw-min-speed` four bookings were verified frame-by-frame against a tally reading
  «Опасни 1/10, Основни 0/0, Второстепенни 0/0». **«0 наказателни точки» proves nothing was TALLIED**,
  not that the drive was clean. Never use a zero tally as evidence a rule works.
- The unsuffixed `08-debrief.png` stops at the XP pill. Route ticks, «Похвали» and «Разбор» live in
  `08-debrief-p2..pN.png`; each drive dir carries `_audit-debrief.json` with a fold map. **Five
  retirements had to be re-cited** for quoting text that was not on the frame they named.
- `run.log` **truncates each line at ~200 chars**, so grepping body text misses cards whose titles are
  present. Judges' "this never appears anywhere" claims had a **3-of-5 error rate**. Open a frame.

### 2.5 `devrig/driveScript.ts` is not in any product path

`devrig/index.ts`: *"Dev builds only. Consumed only by src/app/dev/drive-rig, which 404s in production."*
`lesson-audit.mjs` navigates only to `/simulator` (`:1037`, `:1738`). Proved photographically: the lime
`drive-rig-readout` overlay that stamps every rig frame is **absent from all 376 Wave C frames**. Eleven
criticals are routed to a file no student and no audit drive has ever executed. A repair round already
tried to "fix" it and produced a regression that clamped a car from 49 km/h to 9.8; it was reverted.

---

## 3. WHAT TO DO NEXT — in order, no overlap with what is done

### STEP 1 — land the proof cycle that is already running

```bash
# 1. wait for all four (see §1)
# 2. merge — it refuses on overlap, on two BUILDS, and on a polluted destination
node tools/audit/wave-c-merge.mjs --halves proof2-1,proof2-2,proof2-3,proof2-4 --dest proof2
# 3. sanity
node -e "const r=require('fs').readFileSync('.audit-frames/proof2/wave-c-results.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);console.log(r.length,'drives',new Set(r.map(x=>x.lesson)).size,'lessons','treeMoved',r.filter(x=>x.treeMoved).length)"
```

If any drive is `treeMoved`, re-drive **those lessons only** on a still tree into `.audit-frames/proof2-fix`,
delete the stale frame dirs first (the merge refuses on collision, correctly), then merge them in.

### STEP 2 — adjudicate, on SYMPTOMS ONLY

**267 open findings, 144 critical**, sit on the 29 files rounds 1–6 repaired. Copy
`.audit-frames/wave-c/batches/proof-adjudicate.js` — it already carries the whole brief, including the
non-determinism rule — change the AFTER path from `.audit-frames/proof/` to `.audit-frames/proof2/`,
and set the lane list to the 29 files (they are listed in `REPAIRED` in
`tools/audit/make-repair-round.mjs`). Validate with `check-workflow.mjs`, then run it.

Then post:

```bash
node tools/audit/verdict-coverage.mjs          # must reach 100% of the open list
node tools/audit/wave-c-post.mjs               # report
node tools/audit/wave-c-post.mjs --apply       # writes closures + a ledger section
```

`--apply` is idempotent now and refuses on an unknown findingId. **Retirement evidence is checked on the
read path too** — a closure with no frame, a dead frame or no quote does not reduce the open list.

### STEP 3 — repair rounds 7, 8, … until the tail is spent

```bash
node tools/audit/make-repair-round.mjs 7 .audit-frames/wave-c/batches/repair-7.js
node tools/audit/check-workflow.mjs .audit-frames/wave-c/batches/repair-7.js
# then run it as a Workflow
```

The generator picks the next files by open criticals, **skips everything already repaired** (the
`REPAIRED` set — add each round's files to it after committing, or round N+1 regenerates round N), and
**skips `tools/`** because the instrument is not the product. The brief it emits carries every lesson
this audit has paid for; **add to it, never trim it.**

Criticals per round so far: **24 → 24 → 18 → 13 → 12**. The tail is arriving; expect diminishing
returns and switch back to a proof cycle when a round stops finding concentrations.

### STEP 4 — the instrument debts that are still open

| # | what | why it matters |
|---|---|---|
| 16 | The reverse arm works on `sc-ed-reverse-line` but **`sc-park-45-rev` still reports `demanded:false`** — 11 of 13 «на заден ход» gates are «Задача 2», reachable only after a «Задача 1» position gate | 19 lessons / 118 findings / 46 critical only ever tested on their approach |
| 17 | Next's dev-tools overlay is baked into every captured mobile frame | it already manufactured one wrong REFUTED by occluding a corner a judge cropped |
| 18 | **No drive actually steers** — the channel exists, the traces do not use it | see §5, this is the biggest open design question |

---

## 4. RULES THAT WERE PAID FOR IN BLOOD

- **The frame wins.** Every zero-defects report in this project was an instrument bug, and every one lied
  in the reassuring direction.
- **Never commit a fixer's work on its report alone.** One reported *"harness restored byte-for-byte"*,
  *"census green on the exact shipping bytes"*, *"14,847 passing"* — while two census tests were RED and
  every drive from that tree could not steer. An adversarial verifier caught it.
- **A check that runs after the act is a report, not a guard.** The merge printed *"Nothing further was
  written"* having already moved 342 directories; later, its build check ran after the frames moved. Both
  fixed; look for the shape.
- **An assertion never watched RED is decoration**, and **a source-text grep is not a test** — a
  substring catches deletion, never neutralisation.
- **Guard your constants.** A 20 m threshold carrying four hundred words of justification could be set to
  zero, or its clause deleted, with all 798 rules tests still green.
- **Ask what a fix REMOVES.** Round 1 closed a rule act "forever" and deleted the commendation a student
  earns by reversing and re-approaching correctly.
- **One reader.** Five tools once gave four different answers and a repair lane spent itself re-fixing
  370 rows — 87 critical — that were already closed. `finding-reader.mjs` is the only reader;
  `count-agreement.mjs` fails when counters disagree and now reports INCONCLUSIVE if the corpus moved
  mid-check.
- **`--maxWorkers=2` contention flakes look exactly like failures.** `platform/AGENTS.md` documents it.
  Run the file alone before believing a red. A test that goes red from a cold disk is an instrument that
  lies.
- **Never pipe `tsc`/`vitest`** or read a wrapper's exit code. Read each command's own status.

---

## 5. THE BIGGEST OPEN QUESTION

**No drive actually steers.** The channel is wired and proven; the scripted traces still press only
throttle and brake. So the drives are still straight-line, and every "no drivable success path" finding
carries the same ambiguity it always did.

**The product already ships the answer, and nobody is using it.** `shadow: TraceRef` is a **required**
field on every scenario template, with the contract *"must replay with ZERO violations — CI gate once
recorded"*. There are **167 traces on disk and served over HTTP**, 20 Hz, carrying
`x, y, headingDeg, steerRad, speedKmh, gear` (−1 = R), `indicator, brakeOn, throttleOn`. **82 of them
turn and 18 contain reverse.** The §5 gate is real — 165 of 167 assert
`expect(violationCodes(shadow)).toEqual([])`.

Two of the 167 are **ungated** (`sc-animal-hazard` 853 samples, `sc-lane-control-signal` 642) — filed.

The design question, deliberately not decided: replaying an authored trace tests whether the product
grades its own correct drive as correct, but it steers by hidden truth a student cannot see, so a pass
may hide a defect a real student would hit. **Running both legs — trace replay for grading, guidance
following for teaching — is probably the right answer, and it has not been built.**

---

## 6. WHERE THE EVIDENCE LIVES

```
.audit-frames/findings/*.jsonl        the corpus — never rewritten
.audit-frames/wave-c/closures.jsonl   retirements, each with frame + quote; delete to reverse a wave
.audit-frames/wave-c/verdicts.jsonl   every verdict ever written, append-only
.audit-frames/wave-c/frames/          376 unsteered drives (Wave C)
.audit-frames/rebase/frames/          151 steered, pre-repair
.audit-frames/proof/frames/           195 steered, post rounds 1-2
.audit-frames/proof2/frames/          ~246 steered, post rounds 1-6   <- landing now
```

`.audit-frames/` is gitignored on purpose — ~10 GB of evidence, not source.

**Disk:** C: was down to 2.8 GB and is now 9.3 GB. This session alone generated ~5 GB there because the
scratchpad lives on C: while E: has 819 GB free. It will recur. Two committed files once hardcoded a
dead session's temp path and failed at *import*; both now use `os.tmpdir()`.

---

## 7. WHAT NOT TO REDO

- Do not re-drive Wave C, the rebase, or proof cycle 1. All three are merged, adjudicated and posted.
- Do not repair the 29 files in `REPAIRED` again until proof cycle 2 says what is still open on them.
- Do not "fix" `devrig/driveScript.ts` (§2.5) or anything under `tools/` to make a finding disappear.
- Do not touch a content `status` field. **0 of 1,089 questions are human-signed** and 796 marked
  approved are being served to students today. That is the founder's signature to give.
- Do not re-file the XP-divergence finding (a first-pass bonus, not a platform split) or the
  `sc-ov-keep-right` false-refusal critical (I read a harness field as a product claim). Both are on the
  record as `REFUTED-AT-FILING` in `chunk-wavec-new.jsonl` so they cannot be re-filed by accident.

---

## 8 · A RULE ADDED THE EXPENSIVE WAY — 2026-08-23, the account after this one

**`wave-c-merge.mjs` MOVES frame directories. It does not copy them.**

After a merge the shards are empty and the destination holds the only copy. I
re-merged to fold in four re-drives, deleted the destination first to clear the
"polluted destination" refusal, and **destroyed 200 drives — about five hours of
driving.** The tool had said so plainly on the line I was reading:

```
frames dirs      : 204 (moved)
```

I read `(moved)` as a count and not as a warning.

**The rule: never delete a merge destination. To re-merge, delete only the frame
dirs you are replacing, or merge the fix shards in as additional `--halves`.**

Nothing in git was harmed — `HEAD` never moved and the ledger was untouched. The
re-drive came back *larger* than the loss (243 drives / 145 lessons against 204 /
123, `treeMoved` 0, all judgeable), so the cost was time, not evidence.

Two smaller things from the same hour, both cheap and both worth knowing:

- **Node and Git Bash disagree about `/tmp`.** A shard list written with
  `fs.writeFileSync("/tmp/x")` is not the file `cat /tmp/x` reads. Four drivers
  launched with an empty `--lessons` and each began the whole 243-drive
  catalogue — a 4× duplication. Write scratch lists into the session scratchpad
  with an absolute path.
- **The harness's two refusals are correct and should never be worked around.**
  `--base` has no default on purpose (the old one pointed at staging and returned
  real-looking frames for a build that was not yours), and it will not start on a
  dirty tree. When an uncommitted doc blocks a certifying run, **park the file
  outside the repo** — do not commit it, or the drives attest a different build
  than the ones they must merge with.

---

## 9. 2026-08-24 — THE DAY THE HYPOTHESIS DIED, AND WHAT REPLACED IT

### 9.1 The morning: 376 drives nearly wasted on a dead database

Four drivers returned twelve drives with `verdict=(none — no verdict surface in the DOM)`. Nothing
was wrong with the product. Every frame was **byte-identical at 275,851 bytes**, and `01-arrival.png`
was not a cockpit — it was the error boundary, then the **paywall**.

Four faults, stacked, none in the product:

1. The `prisma dev` `knijka` server was dead (killed with the dev server by the memory pressure of a
   13-worktree agent wave on a 16 GB box). `/simulator` → 500, `/api/health` → `db.ok:false`.
2. Restarting it **moves the port** (51214 → 51218). `platform/.env` is gitignored, so repointing it
   moves no worktree hash and does not break certification.
3. The dev DB's schema was **21 days behind**: `User.sessionEpoch` and the whole `LoginLockout` table
   missing → every `db.user.findUnique()` threw → `next-auth error=Configuration`. Doc 91 prescribed
   `prisma db push` on 2026-08-14 and nobody ran it.
4. The founder password no longer matched. `seed-founder.mjs` sets a password **only on create**, so
   the seed can never repair a drifted store.

**What hid it:** `tools/mobile/lib/auth.mjs` caches a session and validates **identity** but not
**authority**. Admin is what bypasses the simulator entitlement, so a cookie minted while the DB was
broken sailed past sign-in onto the 21,99 EUR page and the harness photographed marketing copy for
210 s per drive at `exit=0`.

> **RULE.** A no-verdict rate above a few percent is an INFRASTRUCTURE alarm, not a finding. Open
> `01-arrival.png` and confirm it is a cockpit before judging one row. `exit=0` means the harness
> finished; it does not mean the car existed.

The restart checklist is in `~/.claude/projects/E--AI-driver/memory/audit-drive-infra-checklist.md`.

### 9.2 The hypothesis, and why it failed

The morning's claim was that the open list was mostly repaired already and merely awaited a re-drive
— 525 of 563 findings had evidence older than the last commit touching the file they blame.

**That statistic was a bad proxy and the claim was wrong.** "The file has been edited since the
frame" was never the same as "this finding was fixed", and the first version of the measurement even
dated findings by their SWEEP DIRECTORY mtime — which `wave-c-merge.mjs` resets, because it MOVES
frame directories.

A deterministic stratified sample of **153 of 563 findings (27%, all 118 files)** was read against
source by seven agents, then attacked from BOTH directions:

| | sample | ≈ of 563 |
|---|---|---|
| already repaired (survived attack) | 17 · 11% | ~63 |
| **genuinely still broken (survived challenge)** | **61 · 40%** | **~224** |
| never was a defect / instrument artifact | 21 · 14% | ~77 |
| only a frame can settle it | 54 · 35% | ~199 |

**Why both passes were needed.** The first verifier was told to doubt the good news and moved 27
verdicts — **every one downward, none up**. A number from a test that can only move one way is not a
measurement, so a second pass was run with the stance inverted. It refuted 21 of 87.

### 9.3 The real blocker: repairs that ship a measurement and wire it to nothing

Verified by hand — each exported, gated by its own test, and with **zero non-test consumers**
(a mention inside a comment is not a use):

> **CORRECTED 2026-08-25 — the first two were WIRED and are no longer dead.**
> Commit `9b2ffe1` put `worldEdgeClearanceM` on the SimTick (`worldRuntime.ts:1977`) and
> `LessonPlayShell.tsx:3347-3350` reads it to raise the rim card. A wave-2 lane deferred a
> critical on the strength of the stale sentence below, so it is corrected here rather than left
> to mislead the next reader. `touchHintShouldHide` and `whyIsReachable` are still dead.
>
> The residual on the rim is NOT a consumer hunt: `applyTick` runs at `LessonPlayShell:3337`,
> BEFORE the rim block, so grading continues off-map BY POLICY. That is a one-line decision at
> `:3350`, and it belongs with the founder alongside the ending gate.

- `runtime/district.ts` **`districtWorldEdge`** / **`worldEdgeClearanceM`** — the measure proving a
  learner reaches the end of the authored world **60–78 m past the last road on EVERY map**. Its own
  block said «it draws nothing and it ends nothing».
- `lesson-ui/touchHintLifetime.ts` **`touchHintShouldHide`**.
- `hud/overlayQueue.ts` **`whyIsReachable`** — named twice in `notifyColumn.ts`, both times in prose.
  Several open truncation findings are measured by it and acted on by nothing.

Same shape as round 7 (mutation-proved a change in a module nothing imports), round 8 (changed a
value read only by its own test), and the **16 findings (12 critical) blaming
`devrig/driveScript.ts`, which 404s in production** (`src/app/dev/drive-rig/page.tsx:31`).

> **A repair is not finished when it is measured and gated. It is finished when a path from
> `/simulator` reaches it.** The ADDRESS RULE applies to the repair, not only to the routing.

### 9.4 What landed

- `ae4a499` — eight demo captions that spoiled the hazard, reworded at source, 36 traces re-recorded.
- `aeef1b3` — the demonstration stands down when the student drives (it was narrating «Спряхме
  плътно вдясно…» at 6 км/ч in the running lane); and a lesson stops promising an oil-pressure lamp
  when the product shows temperature.
- `9b2ffe1` — the world edge is announced before the student drives into it, and the measure that
  knew finally has a reader. Its gate checks **that the measure is still wired** and took three
  mutation-caught iterations to become honest.

**376 drives**, all `exit=0`, **zero tree movement**, 272 ended naturally, 2 no-verdict (0.5%).

### 9.5 Traps that cost hours, so they are written down

- **The worktree checks out CRLF; the main tree is LF.** A worktree patch carries whole-file ending
  churn, and this repo has SOURCE-PINNED tests comparing LF snippets — they go red and **the failures
  read as logic errors**. Normalise after every `git apply`.
- **`\b` inside a template literal is the BACKSPACE escape.** A dead-code gate written that way
  matched nothing and reported five live consumers as none.
- **A no-verdict drive is not automatically a defect.** `sc-follow-tailgater/mobile-right` logged
  «the session did not end on its own» and «no control on this screen ends the session»; the frame
  4.6 s later shows «Сесията завърши — първо се самооцени» with a РЕЗУЛТАТ chip. The ladder gave up
  just before the end line rendered. **The frame outranks the log.**

### 9.6 Open for the founder

- **`sc-vp-stall`** teaches clutch technique to a car with no clutch: `transmissionModeFor` returns
  `"manual"` only for `"advanced"`, and `DEFAULT_DIFFICULTY` is `"normal"`. Build a lesson-level
  transmission channel (multi-file, graded path) or rewrite the briefing for an automatic and lose a
  Category B subject. **4 findings, 3 critical, one lesson. His call.**
- **The ending gate on the world edge.** It would close the "session cannot end" family, but it
  grades, and `terminalDepartureZone` was disarmed today for producing a false refusal.
- Two content-signature rows need his signature: `ptp-i-parva-pomosht` supply, `l-accidents-first-aid`
  quiz beat.
- **Still not done, flagged three times: rotate the Poyo API key and the `id_ed25519_flokinet` SSH
  key.** Both were exposed in chat.

---

## 10. 2026-08-25 — THE REPAIR WAVE, AND WHY NONE OF IT IS COMMITTED YET

### 10.1 State

```
open list : 523        criticals : 168        (from 563 / 182 at the start of round 10)
```

Forty findings retired in round 10, every one having survived an adversarial verifier. Five more
are offered by the poster and are **deliberately not applied**: all five come from lanes whose
verifiers died when the account hit its monthly spend limit, so not one has been attacked.

### 10.2 Twelve repair patches are held in `.audit-frames/patches/`, NOT integrated

| lane | files | verified? |
|---|---|---|
| hud-briefing-numbering | 5 | yes |
| lesson-play-shell-w10 | 8 | yes |
| mirror-lane-corridor | 3 | yes |
| round10-mixed | 7 | yes |
| w11-conditions-traces | 42 | yes |
| wf_…-9 / -10 / -11 | 17 / 12 / 3 | yes |
| wf_…-2 / -6 | 11 / 19 | **NO — verifier died on the spend limit** |

**Nothing was integrated, and the reason is the verifiers, not the limit.** They overturned a
large share of the FIXED claims, and two of the overturns are the pattern this programme keeps
paying for:

- `sc-hz-accident-scene:b8ca9ed6` — the lane authored three commendation explanations. **A
  commendation's `explanationBg` has no renderer anywhere in the product**: `lessons/engine.ts`
  `toHudEvents` drops it, `HudToasts`, `SessionEndScreen` and `debrief` print the title only. The
  sentences reach nobody. FIXED → PARTIAL.
- lane r1 — `itemEchoesLine` has **zero non-test call sites**; all six references in
  `LessonPlayShell.tsx` are comments and it is not in the `hud/index.ts` barrel. It cannot regress
  because it guards nothing shipped.
- lane r1, the verifier's own mutation — deleting `relative isolate` from the controls-help panel
  leaves **24 passed, nothing red**, while the shade then paints an 80%-alpha band down the whole
  left rail. The case the lane was proudest of guards a token that changes nothing.

### 10.3 The one patch that looked ready, and why it is not

`mirror-lane-corridor` earned the only unqualified endorsement in the wave — *"no row verdict
overturned … its numbers reproduced everywhere I re-derived them, which is not the norm in this
corpus"*, three files, no grading path, clean line endings. Its verifier still found two blockers:

1. **The ceiling clause is UNGATED.** Reverting only the `topCss` argument inside the `max-height`
   call — while leaving the `top:` line — keeps **all 1,165 tests green** and puts the card
   **65.2 px into the thumb control band** on the founder's own handset. The scan reads `top:`
   declarations only. One assertion on the argument list closes it.
2. **It introduces a NEW defect.** Nothing clipped on any profile before the patch (caps
   160.99 / 146.80 / 138.20 against a 124.5 px card); after it, 0 / 4.3 / **20.9 px** are clipped —
   and the gate PINS that (`toBeLessThan(21)`) instead of forbidding it. What is lost on 780×340 is
   the tail of «Спряла кола: пусни палеца и натисни пак надолу — минава на заден ход.» — the
   reverse-gear sentence this very file records as having been rewritten *because the old wording
   made students select R wrongly*.

**A repair that trades a layout overlap for deleted teaching text is not a repair.** Fix (1) and
(2) before this lands.

### 10.4 Two audit-tool defects fixed today

- **PARTIAL was in the judges' brief before it was in the tools** (`151bd19` → corrected). 184
  well-formed verdicts were rejected as malformed and counted as UNJUDGED — "nobody looked".
- **A verifier's correction could be resurrected by a re-run judge** (`d4fd66a`). The poster
  decided by file order; a resumed workflow re-ran judges whose fresh lines landed AFTER that
  round's verifier corrections, reviving 6 closures the verifiers had killed. Precedence is now
  *later round wins; within a round, verify wins.*

### 10.5 What to do next, in order

1. **Raise the spend limit** — every agent lane is blocked on it.
2. Re-run verifiers for lanes `wf_…-2` and `wf_…-6`; nothing from them may be integrated first.
3. Fix `mirror-lane-corridor` V1 and V2, then integrate it — it is the closest to ready.
4. Integrate the rest per-row, honouring each verifier's overturns. **The FIXED column in a lane
   report is a claim; the VERIFIER section is the record.**
5. Only then re-run `wave-c-post.mjs --apply`, and only after the verify phase has finished.

---

## 11. 2026-08-25 — THE REPAIR WAVE, INTEGRATED

Six lanes landed, one superseded, two held out. Every one gated with `tsc` and
the full suite, and landed only after its verifier's objections were ANSWERED —
not accepted wholesale and not waved through.

| commit | lane | what |
|---|---|---|
| `d8c1b80` | mirror-lane-corridor | the touch hint clears the mirror and instruments; the ungated ceiling closed |
| `c61868b` | hud-briefing-numbering | the briefing's step 1 gets its number back, as DATA |
| `bc5a279` | lesson-play-shell-w10 | four HUD surfaces get their ground back; `relative isolate` gated |
| `6a1e4ff` | round10-mixed | the yield praise names the act, on a surface that renders |
| `d81dfbc` | wf_…-10 | advisor caps, the B58 gate, task/briefing agreement |
| `fcdec17` | wf_…-12 | motorway traffic, conditions traces, 18 re-recorded JSONs |

**Superseded:** `w11-conditions-traces` — the same 42 files as `wf_…-12`, same
deletions, 63 fewer code lines. Its only unique content is a memoisation cache in
a test helper and extra commentary. Two integration agents worked one repair; the
richer landed.

**Held out:** `wf_…-2` and `wf_…-6` never got a verifier (their agents died when
the account hit its spend limit). `wf_…-2` is additionally proved RED: two
world-referent gates fail with it applied and pass at HEAD, because its new
violation code is in neither `REFERENT_RULES` nor `NO_WORLD_REFERENT`.

### What the verifiers actually bought

1. **The numbering regression, filed by THREE lanes.** Two prefixed the ordinal
   into `briefingLineBg`; by majority that wins. Measured over 663 rungs: 29 to a
   worse fold band, **12 to ZERO body, 1,190 body characters lost** — the graded
   step among them, including «…тук играят деца». **No gate could see it**: those
   scenarios sit outside the five files `briefing-card-budget` owns.
2. **`relative isolate`** — deleting it left **139 tests green** while the shade
   escaped behind the stage. Now caught by a source case AND a rendered one.
3. **Commendation `explanationBg` has no renderer anywhere.** `toHudEvents` drops
   it; all five downstream surfaces print the title only; the string appears zero
   times in eight captured debrief DOMs. The fourth dead predicate this week.
4. **A mutation case that was red when the code was RIGHT** — it asserted the
   plain line FAILS. Landing it would have locked the regression in permanently.
5. **Two `tsc` reds a green suite cannot see** (TS2739 on a fabricated row, TS2305
   on an unpublished barrel type). **Vitest does not typecheck.**

### The rule this wave earned

**A test that cannot go red is worse than no test, because it reports safety.**
Four predicates this week shipped, were gated by their own tests, and were read by
nothing when found:  and  (both WIRED 2026-08-25 by 9b2ffe1), ,
`whyIsReachable` — and now `explanationBg` and `itemEchoesLine`.

### What was deliberately left unfinished

`sc-mw-min-speed:f3c26187` — two lanes moved the briefing and neither moved the
task chips, so the chip quotes a number the lesson no longer sources. The briefing
change is reverted; the lane's reasoning is kept at the site as an unshipped
proposal; and `sp-mw-flow-visible §4` — which is the row's own specification — is
`describe.skip` with the re-enable condition written above it: **briefing, BOTH
chips and the objective caps move together, in one round, with
task-title-agrees-with-briefing, one-junction-three-names §3 and tier-feasibility
green.** Deleting that block would have made the tree green and the row invisible.

**tsc 0 · vitest 15,709 passing · open list 523 / 168 critical.**

---

## §12 — 2026-08-26: the day the count was made honest (ACCOUNT-SWITCH HANDOFF)

> **If you are the next session, on either account: read this section, then
> `docs/simulation/QUEUE` below, then act. Everything is pushed to BOTH remotes.
> The founder was told the numbers in the exact words of the "boxes" explanation
> at the end of this section — use the same framing, do not re-explain it
> differently.**

### State at handoff

- **HEAD `23322f2`** on `scenario-engine`, clean, pushed to origin AND vps.
- **Open list: `filed=1462 retired=782 open=680 critical=218`** — verify with
  `node tools/audit/verdict-coverage.mjs | head -1`. Every counter AGREES
  (`node tools/audit/count-agreement.mjs`), corpus gates 14/14 from the repo
  root and from `platform/` — the count no longer depends on cwd.
- **Of the 680: 476 STILL (atomic, individually fixable) · 200 UNJUDGED
  (cannot be settled by one drive at 13% determinism) · 4 PARTIAL.** **[CORRECTED 2026-08-28 — see §15 "A NUMBER THIS DOCUMENT HAS REPEATED FOUR TIMES IS WRONG": 13% is the PASS rate of one lesson, not a determinism rate; the corpus holds only 20 genuinely-distinct repeat drives and cannot support any determinism figure.]**
- The audit corpus is gitignored ON PURPOSE (drives certify against the
  worktree hash) and is now BACKED UP on the **`ledger/audit`** branch on both
  remotes. After every wave that touches the corpus, run
  `bash tools/audit/snapshot-ledger.sh "note"` — it commits through a temp
  index, moves nothing in the working tree, and drives keep certifying.
- Gates: tsc 0 · vitest 15,960 pass / 2 fail / 171 skip (the 2 are
  `t-accidents` + `l-accidents-first-aid` content, red at HEAD for weeks,
  BLOCKED ON FOUNDER CONTENT) · tools 495/496 (`deck-captions` standing).

### What happened on 2026-08-26, in order

1. **The 204-leg fill sweep completed** — every (lesson,leg) pair a comparison
   row needed, all at commit `2706813`, all exit=0 with frames. It had hung
   ELEVEN HOURS overnight: three drivers blocked on dead Playwright browsers,
   `spawnSync` had no timeout. Fixed at the source (`lib/limits.mjs`, measured
   bound: longest real drive 510 s, timeout 900 s) plus `lib/resume.mjs` — the
   resume predicate used to ignore the exit code, so a CRASHED drive was
   recorded as measured FOR EVER and a sweep could report 204/204 over holes.
   Both mutation-proved. Commit `220d476`.
2. **Fill adjudication** — 8 judges + 8 adversarial verifiers, 64 rows.
   Open 523 → 511. Commit `220d476` (same).
3. **The dead-predicate wave** (`9be440d`) — the class where a "repair" ships a
   measurement and wires it to NO consumer. 75 candidates, verified verdicts:
   21 WIRED to real consumers · 30 DELETED (answered questions the product
   never asks) · 20 PREMISE-FALSE (live after all — verify everything) ·
   7 findings REOPENED. Integration survived a DO-NOT-COMMIT review with 4
   blockers, all fixed. THE LESSON: splitting patches per-file let HALF of a
   verifier-rejected item ship (its test was a new file = "uncontested").
4. **The reopens actually applied** (`a302a1d` area) — REOPEN.jsonl had recorded
   an INTENTION; 5 rows were still counted retired. Moved out of closures with
   history kept in `reopened.jsonl`. Open 511 → 516. Up is honest here.
5. **THE PARTIAL SPLIT** (`16cbc85`) — the main event. 230 of the open rows
   were COMPOUND (avg 2.8 complaints each) and PARTIAL retires nothing, so
   finished work was invisible — THIS is why the count never moved. Six lanes
   split them into 647 atomic children; six adversarial verifiers overturned
   28 GONE claims and ZERO in the closing direction. **250 already-repaired
   clauses retired on frame evidence** (0 missing frames, 0 without quotes).
   Open 516 → 685 → 680. `chunk-split.jsonl` is ADDITIVE in finding-reader —
   NEVER remove that declaration, supersession eats the file otherwise.
6. **Three tools taught that a SPLIT parent is history, not an invented id**
   (`verdict-coverage`, `count-agreement` WORKED_RE hyphen fix, `wave-c-post`
   — the last one refused ALL retirements until fixed). Commit `23322f2`.

### The queue — what the next session does, in order

1. **Repair waves against the 476 STILL**, batched by suspectFile. Top of the
   list (run `node tools/audit/finding-reader.mjs --count` for the live table):
   LessonPlayShell.tsx · rules/engine.ts · SimOverlay.tsx · objectives.ts ·
   LessonScene.tsx. Use the wave pattern of 2706813/9be440d: isolated
   worktrees while drives run, adversarial verifier per lane, ADDRESS RULE
   (prove a non-test import chain to /simulator BEFORE editing), integrate →
   full gate → commit. After each wave: confirm-sweep the touched lessons
   (~1 h), NOT a full sweep (~5 h). Full sweep every ~5th round.
2. **After every corpus change**: `verdict-coverage` → `count-agreement` →
   `wave-c-post --apply` → `snapshot-ledger.sh`.
3. **FOUNDER DECISION PENDING — the 200 UNJUDGED**: 99 need a rate-mode
   harness (drive N times, judge the RATE — does not exist yet), 37 were never
   exercised, the rest lane-position/no-frame. Recommendation given to the
   founder: accept as known-unmeasurable and ship; build rate mode only if he
   says so. DO NOT judge them from single drives — 13% determinism, measured. **[CORRECTED 2026-08-28 — see §15 "A NUMBER THIS DOCUMENT HAS REPEATED FOUR TIMES IS WRONG": 13% is the PASS rate of one lesson, not a determinism rate; the corpus holds only 20 genuinely-distinct repeat drives and cannot support any determinism figure.]**
4. **Deferred with cause, needs a DRIVE to land**: the `overlayHoldsDrive`
   wire into LessonPlayShell `paused` — verifier proved it makes compact
   THEO-3 undrivable at 60 s without `blocking:false` at LPS:4240. Wire+flag+
   drive-proof together, never the wire alone. Details in §11 area and
   `.audit-frames/patches/INTEGRATION-REVIEW.md`.
5. **Founder-only items, batch into ONE sitting**: sc-vp-stall transmission
   channel · world-edge ENDING rule · ptp-i-parva-pomosht supply ·
   l-accidents-first-aid quiz beat (unblocks the 2 red vitest files) ·
   **rotate the two exposed keys (flagged 5+ times: Poyo API key, and the SSH
   key at C:\Users\Ljh\.ssh\id_ed25519_flokinet whose contents were surfaced
   in a session)**.

### Traps that cost hours today — do not relearn them

- `vps` remote needs `GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_flokinet -o
  IdentitiesOnly=yes"`. Never export it globally — origin breaks and verifiers
  cry MISSING.
- Node resolves `/tmp` and `/c/...` as `E:\tmp` / broken. Windows-form paths in
  Node, POSIX in bash.
- Repo-wide grep walks 78 worktrees under `.claude/worktrees` and times out —
  scope every search to `platform/src` or `tools/`.
- A supervisor threshold BELOW the longest real drive (510 s) kills healthy
  work and manufactures defects. Bounds live in `tools/mobile/lib/limits.mjs`
  with the corpus query that justifies them.
- The dev server port is NOT 3000 (that is nexflow — another product). Find it
  with the health probe; today it was 3460, commit-attested.

### The founder conversation to carry forward

He asked twice why the count never fell and said plainly: **"what I want is to
finally finish those 500 questions so we can move on with the platform."** When
the split made 516 → 680 he was (rightly) frustrated. The explanation he
accepted the numbers under: the 516 were BOXES; 230 boxes held 2–5 problems
each; a box only closed when everything inside was fixed, so finished work was
invisible; opening the boxes banked 250 already-fixed problems and left 680
honest atomic ones; **1,462 ever filed · 782 closed with evidence · 53% done**.
Progress from here is monotonic: every fix retires its own row. Give him the
53% number and the retired-per-day rate, not the open count alone.

### §12a — THE FOUNDER'S STANDING ORDER (verbatim, given repeatedly — this is not optional)

> *"I dont want to repeat my self, auto queue fix after fix after fix after fix
> after fix untill all open questions are fixed."* · *"continue and repair do
> not stop auto queue dont come back for checkpoints"* · *"we have to fix all
> open files in one go with auto queue with everything… no stops no checkpoints
> I want those 53% finished already."* (2026-08-26)

**What this means operationally:** launch the repair campaign against ALL 476
STILL rows and chain it wave → integrate → gate → commit+push → apply
retirements → snapshot ledger → confirm-sweep → NEXT WAVE, automatically,
without asking permission between waves. Do not stop to report unless something
needs a founder DECISION (the 200-UNJUDGED question, founder-only items, a
destructive/irreversible step) or a gate is red and the fix needs judgement.
Status updates are fine; checkpoints that WAIT are not. He has had to give this
instruction five separate times — do not make him give it a sixth.

The only legitimate stops: founder-only items (§12 list), the UNJUDGED
decision, and anything that would falsify evidence or sign content (only the
founder signs content — never flip a `status` field to make a gate green).

### §12b — THE ELEVEN INVARIANTS (every pass, no exceptions — each was bought with a failure)

1. **The server must attest the CURRENT commit** or the harness refuses
   (`EXIT_TARGET_UNVERIFIED`). Every commit ⇒ dev-server restart before the
   next sweep (~10 min).
2. **`/api/health` must read `db.ok:true` AND the matching commit, and ONE
   canary drive must return a real verdict, before dispatching any sweep.**
   Caught a dead database twice; without it the harness photographs the
   PAYWALL at exit=0, byte-identical frames. Infra details (prisma dev moves
   its port on restart, schema drift, session cache) are in the auto-memory
   note `audit-drive-infra-checklist`.
3. **Never `--apply` before the verify phase has finished.** Done once: 78
   retired, 41 overturned by verifiers, reverted by hand.
4. **A verdict that has not been attacked is not a verdict.**
5. **Normalise LF after every `git apply`** — worktrees check out CRLF, the
   tree is LF; the mismatch breaks source-pinned tests in a way that reads as
   logic errors.
6. **`tsc` before every commit.** Vitest does not typecheck; five tsc reds
   have passed a green suite so far (latest: a /s regex flag on ES2017).
7. **Gate the STACK, not each patch.** The rapier-in-collision breach passed
   every patch individually.
8. **Mutate every gate you keep.** A test that cannot go red reports safety.
9. **Nothing is recorded as closing a row its verifier did not close.**
10. **A driver that stops printing is NOT a driver that is working** — 11 h
    lost to silence. Every sweep runs with the in-tool timeout
    (`lib/limits.mjs`, 900 s vs 510 s longest real drive) and something armed
    to notify on completion. Never launch a sweep nothing is watching.
11. **The ADDRESS RULE: prove a non-test import chain to /simulator BEFORE
    editing.** Grep the export → find a non-test importer → walk it to a
    rendered component. A chain ending in a test/story/script is dead. Round 7
    mutation-proved a fix eleven ways in a module nothing imports.

### §12c — held out WITH CAUSE (do not resurrect without meeting the condition)

- `wf_…-2` patch — proved RED (fault code in neither referent rules nor the
  catalogue) and ineffective. Binned.
- `wf_…-6` patch — never verified (its agent died on a spend limit). Re-verify
  from scratch or bin.
- `w11-conditions-traces` — duplicate of a landed lane. Binned.
- `overlayHoldsDrive` wire into LessonPlayShell `paused` — verifier-proved
  false refusal without `blocking:false` at LPS:4240; land ONLY with a driven
  proof that compact THEO-3 completes past 60 s (§12 queue item 4).
- The disarmed terminal-departure arm (`engine.ts:1265`) — re-enable ONLY with
  a test that drives overshoot-and-return and proves dwell does not accrue
  while closing on the mark.
- The 4 remaining PARTIAL rows — re-split or judge per-clause in the next
  adjudication; do NOT leave them to rot as compounds again.

### §12d — the sweep supervisor

`tools/mobile/drive-supervisor.sh` (committed with this section) wraps a
wave-c shard: kills+resumes on stall, reaps ONLY its own descendant browsers
(v1 reaped globally and executed its siblings' browsers — two drives died in
the same millisecond), threshold 1200 s > the in-tool 900 s timeout. Resume is
exit-code-aware (`lib/resume.mjs`), so a restart costs one drive, never a
shard, and a crashed drive is re-driven instead of counted.

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

---

## §15 — 2026-08-27 (late): the loop was made to run itself

> §14 covers waves 1–6 and the three instrument faults. This covers w14 — the
> sixth adjudication — and the answer to the founder's standing complaint about
> the loop, which was not a complaint about the work.

### State at the time of writing

- **HEAD `d068941`** on `scenario-engine`, on origin AND vps.
- **1506 ever filed · 1126 closed with evidence · 74% done · 33 retired in w14.**
- Repair wave 7 (15 lanes) running; wave 8 (8 lanes) built and queued behind it.

### THE FOUNDER'S ACTUAL COMPLAINT, AND WHAT IT WAS ABOUT

> "After this wave is finished auto queue everything required and auto queue next
> wave aswell, if you cant do it since we try but we never achieve this, send
> some agents only to watch if things are running until all questions are fixed"

He is right, and the diagnosis is worth writing down precisely, because the
obvious reading is wrong. **The loop has never failed on the hard parts.** Six
repair waves, twenty-six-plus lanes, over a hundred agents, zero agent errors.
It fails *between* the parts — on the steps somebody has to remember:

- `platform/.env`'s `NEXT_PUBLIC_COMMIT_SHA` goes stale after a commit, and every
  drive of the next sweep exits `EXIT_TARGET_UNVERIFIED`;
- the second remote does not get the push, because `GIT_SSH_COMMAND` exported for
  `vps` makes `origin` exit 128;
- `snapshot-ledger.sh` is not run, and 1,126 closures live in one gitignored
  directory on one 7200 rpm HDD;
- and above all: **a turn ends, and the loop waits for a human to type
  "continue".**

That last one is the whole of it. So three things now exist.

### 1. `tools/audit/wave-cycle.sh` — every mechanical step, one command each

`gate` · `commit <msgfile>` · `preflight` · `sweep` · `merge` · `post` · `status`.
Each refuses to run if the step before it did not really happen: `commit` will not
push without a green gate, will not finish without confirming **both** remotes
hold the sha, restamps `.env` itself, and snapshots the ledger. `post` will not
`--apply` unless all nine corpus-reading tools report one open list.

Two traps are encoded in it because both have already bitten:

- **`npx tsc` must run FROM `platform/`.** From the repo root npx resolves a
  different package and exits 1 with *zero* `error TS` lines — a red that is not
  one, which reads as a real failure and stops a wave.
- **`grep -oP` silently returns empty on this box** ("supports only unibyte and
  UTF-8 locales"). The first draft of the gate extracted the vitest failure count
  with `-P`, got `""`, defaulted it to `0`, and would have **declared a red suite
  green.** Every extraction is `sed` now. That is the reassuring direction again,
  which is where every instrument bug on this programme has pointed.

### 2. `tools/audit/loop-watchdog.sh` — it watches, and it repairs nothing

Every 120 s: is anything serving `/api/health`, does it say `db.ok`, does it know
which build it is, does `platform/.env`'s stamp equal HEAD, is C: above 3 GB. It
writes `.audit-frames/watchdog.log` and does **nothing else** — no restarts, no
kills, no git. A watchdog that repairs is a watchdog that can break the run it is
watching: v1 of the drive supervisor killed every `ms-playwright` process on the
box and executed its siblings' browsers.

It caught both known faults on its first pass, which is the only reason to
believe it works.

### 3. A 17-minute heartbeat that re-enters the loop

`CronCreate`, firing the standing order back at me whenever the session is idle.
This is the piece that was actually missing: the loop now continues without the
founder typing "continue". **It is session-only** — it is not written to disk and
it dies when the session does, so a new session must recreate it. Say so out loud
rather than letting someone assume it persisted.

### W14 — WHAT THE SIXTH ADJUDICATION FOUND

12 judges, then 12 adversarial verifiers. **The verifiers overturned more than
they upheld**: one pass killed 6 of 10 closures, another all 5 of 5, a third 4 of
6. Three patterns, all of which will recur:

- **Closed on a branch the row cannot reach.** `sc-sig-controller-live:bf4c6bab`
  was closed on «Какво се получи добре: чисто каране» — real text, emitted from
  `debrief.ts:456`'s `summary.mistakes.length === 0` branch. The row is about a
  drive carrying a dangerous error, which never takes that branch.
- **Closed on an absence the same run contradicts.** `sc-ov-oncoming-gap:ea19fa97`
  was closed because its own lane showed no lost keys, while three sibling lanes
  in the SAME run at the SAME commit printed `lostKeys: 1`. It has now been closed
  by w12, w13 and w14 and overturned by a verifier each time.
- **Closed on the wrong surface.** `sc-hz-accident-scene:9925844d` cited a sign
  «rendered whole» on a frame where the 2D HUD deck covers that quadrant in every
  beat from t=049 on. A badge hidden by the deck is not a repair.

**And one overturn corrected a premise of mine, which is the more useful lesson.**
I had `sc-sp-wet-limit-plate` filed as a wet-road grading fault: the engine
convicting at 58,9 in a 50 «on a wet surface». A verifier read the source:
`templates-speed2.ts:634` sets `weather: "dry"` on levels 1–2 and adds rain +
`wetGrip` only at :630-632 on levels 3–5 — *"L1–L2 dry, L3–L5 rain + wetGrip, and
the contrast IS the lesson"* — and **every sweep so far has driven only the L1 dry
rung.** Left as filed, that row would have sent a repair lane to make the
conditions code convict a dry-road driver under a wet-road rule: the founder's own
standing complaint, manufactured by the audit that exists to prevent it. The row
has been rewritten in place to the claim that survives — `sc-swp-finish` is a bare
`reachZone` with no speed cap whose *title* asserts a speed discipline it never
measures — with the withdrawal stated in its own text.

### TWO NEW FINDINGS, BOTH CRITICAL, BOTH VERIFIED BEFORE FILING

1. **`sc-junction-scan` — the praise channel certifies a manoeuvre that never
   happened.** «Похвали ✓ Правилно отстъпено предимство 0:55» on a leg whose own
   `run.log` records «0 full stops · 0 lawful waits honoured (0s) · top 59 км/ч»,
   verdict НЕИЗДЪРЖАН, 33 наказателни точки, 3 опасни грешки including «Удар в
   неподвижно препятствие». You cannot yield right of way without ever stopping.
   **This is not the `sc-ac-wind-truck-pass` row.** That one is about praise not
   being gated on the verdict; gating on the verdict would not fix this one,
   because a *clean* drive that never yielded would still collect it. A
   commendation must require the event it names.
2. **`sc-follow-brake` — a perfect drive cannot finish the lesson.** Both
   objectives ticked (`✓ Стигни края на отсечката 4:01`), zero penalty points in
   every class — and on the same card the instructor writes «Прекъсна урока …
   преди края» and «Карай го отново и стигни до края, за да получиш оценка». The
   lesson had nothing left to ask for 17 seconds (last objective 241 s, cut at
   258 s) and would not end itself. **The НЕЗАВЪРШЕН is not the defect and must
   not be "repaired" by loosening it** — it follows correctly from an abort. The
   defect is that the abort was needed.

### AND ONE INSTRUMENT FAULT THAT IS WORSE THAN A PRODUCT FAULT

`.audit-frames/w14/frames/sc-sp-curve__pc-right/` never drove: the debrief text is
the **paywall page**, top speed 0 км/ч, the speed probe unreadable on all 113
samples, `verdictSurface: "absent"`, the guidance loop reporting NOT-RUN. And its
`run.log` ends **`EVIDENCE: complete — this lane can be judged (exit 0)`**.

`lesson-audit.mjs:5651` computes that exit from `frames.lost || stdoutBroken` — it
asks whether the *frames and the log* survived, never whether the **drive
happened**, while line 222 documents `EXIT_JUDGEABLE` as "the drive happened and
every frame it claims exists". The code contradicts its own definition, and judges
are handed a folder whose own log tells them to adjudicate a photograph of a
paywall.

**AND HERE IS ITS SIZE, because a fault stated without its size is the thing this
audit keeps correcting other people for.** Measured across all four rounds
(`.audit-frames/wave7/dead-lanes.mjs`, output beside it):

| | |
|---|---|
| lanes with a status file (w11–w14) | **791** |
| exit ≠ 0, i.e. already refused | 0 |
| exit 0 with no verdict card | 6 |
| …**and** the guidance loop never ran — the dead class | **2** |

The two are `w13 sc-fo-motorway-gap__pc-wrong` and `w14 sc-sp-curve__pc-right`,
both `verdictSurface: "absent"`, both carrying `03b-frozen.png`. Two lanes in 791,
not a systemic corruption — and one of them explains a real gap: `verdict-coverage`
reports `sc-fo-motorway-gap 0/2 judged, 2 missing`, which is two open findings
still open because their only evidence is a lane that never drove.

**The discriminator is proved, and it is the whole difficulty of the fix.** The
other **4** exit-0-no-card lanes (`sc-follow-rain-gap__mobile-right`,
`sc-pk-stop-vs-park__mobile-right`, `sc-ln-decisive-change__mobile-right`,
`sc-ov-crest-curve__mobile-right`) have `loop DID run` — they are the genuine
product outcome *"the lesson never ends"* and **must stay judgeable.** Any fix that
refuses on "no verdict card" alone silently deletes four real defects. Wave 7's
harness lane owns it, and this table is its acceptance test: 2 flip to refused, 4
stay judgeable, 785 unaffected.

### THE THIRD INSTRUMENT GAP OF THE SAME SHAPE — and why it was NOT fixed

`sc-vp-stall` is permanently unjudgeable. `templates-cockpit.ts` sets
`start.openingTier: "advanced"` deliberately (Round 11) so a clutch lesson is not
taught on an automatic — so the car correctly starts in N with a manual box — and
`tools/mobile/lesson-audit.mjs` **has no clutch key and no gear key.** Four
criticals stay UNJUDGED however many times it is re-driven.

**The keys were deliberately not added.** `reverseAssist-audit-harness.test.ts`
pins the harness's keyboard census precisely to stop keys being added casually,
and its real claim is *"there is no key that works the GEAR by hand"* — because a
stray gear key once put a car in R with nobody noticing. `BracketRight` **is** the
gear key. Driving a manual properly needs a clutch-and-gear *sequence* with its own
gate, not two keypresses smuggled past a census. That is deliberate work, not an
integration afterthought.

The pattern across all three is one sentence: **the harness can only test what it
can do.** It could not fasten a belt, so 194 of 204 drives carried a false −3. It
cannot steer in wrong-mode, so ~40 rows are unsettleable. It cannot work a clutch,
so a manual lesson is permanently UNJUDGED.

### THE LAST THREE UNJUDGED ROWS, AND ONE THING DELIBERATELY NOT FILED

Six open findings had **no verdict line at all** — not STILL, not UNJUDGED, just
never adjudicated by any batch. Three were filed the same day and are STILL by
construction; the other three were a real coverage hole and are now judged:

- **`sc-ov-crossing-overtake:5125c346` STILL**, and settled from the data rather
  than the picture — see the new critical below.
- **`sc-fo-motorway-gap:9c02c245` UNJUDGED.** Its only mobile evidence is a
  2026-08-24 lane at `ae4a499` whose own log says *"0 trace commands — THIS DRIVE
  DID NOT STEER"*, top 24 км/ч with 25 full stops **on a road posted 140**, 289.6 m
  of witness path against an objective disc at (0, 400). The zero credit is
  arithmetic about the harness. One `mobile-right` lane on current HEAD, in the
  same round as `pc-right`, settles it.
- **`sc-fo-motorway-gap:d18105c7` STILL.** On w12 `pc-wrong`: *"✓ Стигни края на
  отсечката по магистралата 0:50"* printed directly above *"Грешки (4)"* — no
  seatbelt, «Удар в друго превозно средство −10 ОПАСНА ГРЕШКА», a second collision,
  НЕИЗДЪРЖАН · 13 наказателни точки — while the careful leg of the same round shows
  both objectives as «–». The gate is `{reachZone, y:400, r:8, maxSpeedKmh:140}`
  and 134 км/ч passes under the cap.

**Measured while checking it, across every lane of that lesson in the corpus
(w10-3, w11, w12, w13 — both platforms, both modes, 9 lanes with a debrief):**

| objective | credited |
|---|---|
| «Стигни края на отсечката по магистралата» on a **-wrong** leg | **4 of 4** |
| …on a **-right** leg | **1 of 5** |
| «Спри зад спирачещия автомобил» on **any** leg | **0 of 9** |

**The second objective has never been credited by anybody, and I did not file
it.** It is a `reachZone` at y=790 r=18 cap 8 км/ч, and neither failure to reach
it is explained by a fault I can prove: the careful lanes crawl (top 17–45 км/ч,
25+ full stops, 289–354 m of a 790 m target — the harness, not the lesson) and the
reckless lanes end early on a collision. It is a **known-unmeasured surface**, and
it stays in this document rather than in the corpus, because filing it would be
inventing a defect to explain an instrument limit. It needs one drive that
actually holds motorway speed to the end.

### A NEW CRITICAL: the fiction is on four surfaces, not one

`sc-ov-crossing-overtake` teaches *«ако предният намалява до пътеката, най-вероятно
пропуска човек, когото ти не виждаш иззад колата му»* — read the car ahead, deduce
the person you cannot see. Row `5125c346` filed that against the **briefing**. The
same assertion is made by three more surfaces in `templates-lanes.ts` — the
instruction (`:538`), `whatWentWrongBg` (`:589`), and `teach.whyBg` (`:603`) — so
repairing the briefing alone leaves the fault card and the teach panel saying it.

**Both halves of the sentence are unreachable, and the source says so itself:**

- `:618` stages exactly `[OVC_LEAD_CAR]` and nothing else. Family `lanes` is absent
  from `SCENARIO_FAMILY_TRAFFIC_BASELINE` (`compile.ts:222-228`), the template
  authors no `traffic`, so it falls to `SCENARIO_DEFAULT_TRAFFIC.pedestrianCount
  = 0` (`compile.ts:129-131`, comment: *"pedestrianCount stays 0 everywhere"*).
  `public/world/ov-crossing-v1.json` holds 1 crossing, 1 building, 2 spawnPoints
  and **no pedestrian array at all**. The engine has a `PedestrianDartOutSpec`;
  this lesson does not use it.
- And the antecedent cannot happen either: `OVC_LEAD_CAR.slamAt` is
  `{ x: 12.19, y: 520 }` on a **320 m** road — `:521`'s own comment reads *"far
  past the 320 m road — never reached"* — with `:524` setting
  `minSlamSpeedKmh: 250`, *"the slam tier is authored out of reach"*. **The lead
  car can never slow at the crossing.**

So the one inference this lesson exists to install is practised on a demonstration
containing neither half. Instruction 2 does state the legal rule without the
fiction (*«независимо дали виждаш пешеходец»*), which is why this is a repair and
not a deletion: either the world gets the walker, or all four surfaces stop
asserting one.

### A NUMBER THIS DOCUMENT HAS REPEATED FOUR TIMES IS WRONG

**"13% determinism" is a pass rate, not a determinism rate.** It appears at
§9 (line ~108), §12 (twice, lines ~622 and ~682) and in the founder batch, always
as *"the harness is ~13% deterministic (measured, not estimated)"*, and it is the
sole justification for recommending that 163 rows be accepted as unmeasurable.

Its real source: `sc-ln-obstacle-meeting__pc-right`, driven eight times at commit
`641a4475` (`.audit-frames/det-1` … `det-8`), returning **6× НЕИЗДЪРЖАН · 1×
ИЗДЪРЖАН · 1× НЕЗАВЪРШЕН**. One pass in eight is 12.5%. That is the ИЗДЪРЖАН rate
of one lesson. It was written down as a determinism rate and inherited from there.

**And the corpus cannot support any determinism figure at all.** Measured across
all 78 frame directories and 3,146 attested drives:

| | |
|---|---|
| groups that *look* like (lesson, leg, commit) driven more than once | 794 |
| …that are **byte-identical status files** — one drive copied into both a `fill-*` shard dir and its `w*` round dir by `wave-c-merge --copy` | **787** |
| **genuinely distinct repeat drives in the whole corpus** | **20, in 7 groups, across 3 lessons** |
| of those 7 groups: agreed | 6 (all 2-run, all ИЗДЪРЖАН) |
| differed | 1 — the eight-run lesson above |

**I nearly reported "99.87% verdict-stable" off the 794 before hashing the files.**
That would have been the same error in the opposite direction, and it is worth
recording that the reassuring reading was the one that came first.

So the honest statement is: **the harness's determinism has never been measured.**
One lesson is demonstrably flaky at 6-of-8 modal agreement; three lessons have
ever been driven twice at one commit.

**The consequence is not small.** The 163 UNJUDGED rows were being attributed to
*flake*, which would be a founder decision (accept / rate-mode / sample). They are
mostly blocked by *capability*, which is engineering and needs nobody:

- `-wrong` legs cannot steer — `lesson-audit.mjs:3794` starts them in a `"flat"`
  phase that has no branch in the tick loop, and `guideTick` runs only under
  `phase === "roll"`. **0 of 43, by construction.**
- The harness cannot drive a manual, so `sc-vp-stall` stays unjudgeable.
- The harness cannot drive a motorway: best speed ever reached on a 140-cap lesson
  is 45–52 км/ч, and the median `-right` drive makes **17 full stops**.

Founder batch item 4 is rewritten accordingly, and now asks one cheap question
instead of a three-way ruling: spend ~50 drives (10 lessons × 5 runs at one commit)
measuring determinism properly before deciding anything about the 163.


### NEXT, IN ORDER

1. Wave 7 integrates → full gate → commit → both remotes → `.env` restamp →
   snapshot. `tools/audit/wave-cycle.sh commit <msgfile>` does all of it.
2. Wave 8 fires immediately: `.audit-frames/wave8/wave8.js`, 8 lanes over the 82
   STILL rows wave 7 does not cover. Waves 7 + 8 together attack all 216.
3. Then a confirm-sweep over the touched lessons, adjudicate, `post`.
4. Founder batch is unchanged and still his: `.audit-frames/wave-scripts/founder-batch.md`.
   The 29 first-aid rows at `needs-review` still block BOTH standing vitest reds.

---

## §16 — 2026-08-28: two thirds of the open list was pointing at the wrong file

> This is the most structurally important thing the programme has found. It is
> not a defect in the product. It is a defect in the ledger, and it explains why
> fifteen rounds moved the count and not the road.

### The measurement

Wave 7 handed **134 standing STILL findings** to 15 repair lanes batched by
`suspectFile`, under the ADDRESS RULE — prove a non-test import chain to the
running `/simulator` page BEFORE editing. Five adversarial verifiers then attacked
every lane's claims. The result:

**89 of the 134 rows (66%) name a file that cannot contain the defect.**
50 of those re-routings were upheld by an adversarial verifier in its own words;
39 rest on a lane's word alone and are tagged `LANE-ONLY` in the table.

Some lanes edited nothing at all, correctly:

| lane | rows | mis-addressed |
|---|---|---|
| `faultcard` | 10 | **10** — no file edited |
| `drivescript` | 10 | **10** — both owned files byte-clean at HEAD |
| `playshell` | 17 | 12 |
| `simoverlay` | 13 | 8 |
| `collision` | 9 | 8 |
| `weather` | 12 | 7 |

Every lane worked every row; none sampled.

### What that means for every number this programme has reported

"216 STILL findings across 71 files" was never 216 defects sitting in 71 files. A
lane sent to `FaultCard.tsx` for ten rows that live in `SimOverlay.tsx` cannot
close one of them however well it works — and it will report, honestly, that the
symptom still reproduces. **That is the mechanism behind the whole flat stretch of
this audit.** It is not that the repairs were bad; a large share of them were
posted to the wrong address.

The table is at `.audit-frames/wave7/reroute.json` and **has been applied to the
corpus**: 88 of 89 rows now carry the corrected `suspectFile`, with the old value
preserved in `suspectFileWas` and the reason in `rerouted`. Row counts did not
move (a re-route changes a field, never the population) and all nine corpus tools
still agree: **1507 filed · 1126 retired · 381 open**. The distinct-file count
went from 91 to 116, which is what it looks like when rows come off a handful of
over-loaded addresses.

**Applying it was not optional, and here is why.** A verifier found that
`.audit-frames/routing-collision.json` re-routed six rows on 2026-08-19 and the
re-route was **never propagated into the wave ledger** — so a later wave batched
those rows by the old address and they cost a lane a second time. A routing table
nobody reads back is a routing table that was never written.

### THE CORPUS TRAP FOUND WHILE APPLYING IT

`findingId` is **derived, not stored**:

```
findingId = scenario + ":" + sha1(what + "\0" + frame).slice(0, 8)
```

`suspectFile` is safely outside that hash, so re-routing 88 rows moved no id and
orphaned nothing (checked: all 1,126 closures still resolve). **But editing a
row's `what` REHASHES its id and orphans every verdict and closure keyed to the
old one.** I edited `sc-sp-wet-limit-plate`'s `what` earlier the same day to
withdraw a false premise, and got away with it only because that row had no
verdict line yet. Anyone correcting a finding's text must re-point its verdicts
and closures, or delete-and-refile deliberately.

### CLUSTERS — one cause, many rows

The re-routing also collapsed the list. These are not "similar" rows; each group
is **one cause with several symptoms**, and one lane fixing the cause retires the
group:

| rows | one cause |
|---|---|
| **13** | `SimOverlay.tsx`. Two sub-causes: the peek text-window floor (`minHeight: "2.75rem"` at `:2037` + `paddingBottom: TEXT_FADE_PX`) leaves ~34 px, so any two-line title eats the window and the **body gets zero lines**; and the mobile in-drive card that `FaultCard.tsx` provably cannot paint (5 rows were filed against `FaultCard`). |
| **7** | `buildings.ts buildOne` writes an **open tube** — one full-height quad per footprint edge, no floor, no cap (`:212-216`, the file's only collider writes). Cars end up *inside* buildings rather than stopped against them. |
| **4** | `GovernorCapMark` (`StatusDashboard.tsx:364`) with `NORMAL_CAP_MARGIN_KMH = 10` (`difficulty.ts:214`): the «РЕЖИМ Нормален ≤N» numeral is always the lesson's own domain + 10 and carries **no road fact** — while being the largest number on the bar and the only one wearing ≤. |
| **4** | `templates-junctions.ts` — stop and scan are **byte-identical field for field**: same district, same spawn, all three exit gates literally `{x:55, y:-4.06, radiusM:9}`. Three lessons, one drill. |
| **2** | `LessonScene.tsx:2542` `defaultOpen={!touchOnly && !driveLockedAtMount}` — one expression, two rows, and the last open limb of a third outside this wave. |
| **2** | `LessonPlayShell.tsx` slot contention: over a 138 s drive that ended in a building, the colour legend took the phone's single overlay slot **seven** times and the objective line **zero**. |
| **2** each | no winter token in `contracts.ts` · truck spray emitted by the scene store instead of the truck rig · no offence code for the police signal or the red telltale · cyclist clearance measured and never billed · snow-vs-fog authored as a road problem instead of a haze problem. |

### TWO CRITICALS CONFIRMED, RE-ADDRESSED, AND REPAIRED BY NOBODY

Both were verified independently at source, twice:

- **`sc-rx-tram-left:07c63b97`.** `lessons/types.ts:489-494` — `YieldReason` is a
  closed five-member union (`giveWayLine | stopSign | redLight | pedestrian |
  roundaboutEntry`) with **no rail member**; `grep -c tram` returns **0** across
  `lessons/types.ts`, `finish.ts`, `advisor.ts` and `rules/types.ts`. On the one
  lesson in the catalogue whose subject is ЗДвП чл. 8, ал. 2, a car stopped for a
  tram is classified `"redLight"` and the product can only ever explain the lamp.
  **Not ADR-002-blocked** — чл. 8 ал. 2 is retrievable verbatim from
  `content/law/acts/zdvp.json`.
- **`sc-pk-move-off:6aa68f53` / `sc-vp-handbrake:20bf57db`, and worse than filed.**
  `scene/cabin.ts:22` is `MirrorGlanceKind = "left" | "right" | "rear"` — no
  shoulder member, so a «РАМО» button added to `TouchControls.tsx` would be wired
  to nothing (the dead-predicate class, arriving in advance). And
  `observation.ts:65` is `.map((e) => e.tSec)`, which **discards the glance kind**
  — so a mirror press credits a moment titled «Поглед през ляво рамо в мъртвата
  зона». **The product currently teaches that a mirror discharges the blind-spot
  duty.** Separately, `:63` returns `null` without a reverse phase, so move-off
  drills report «Наблюдение» unmeasured on *every* drive while the debrief tells
  the student to self-check on an act the interface cannot perform.

### WAVE 8 WAS REBUILT BECAUSE OF ALL THIS

The first wave-8 plan batched 82 rows by the old field. It was discarded. Wave 8
now covers **all 217 STILL rows in 22 lanes, eleven of them batched by a known
cause rather than by a filename** — and each such lane is told the cause, told
that its bar is therefore *higher*, and told to **verify the cause first** because
it came to it second-hand.

---

## §17 — 2026-08-28: wave 8, and both causes I handed down were wrong

> Wave 8 ran 22 lanes over all 217 STILL rows at their corrected addresses, eleven
> of them batched by a **known cause** rather than by a filename. Each such lane
> was told the cause, told its bar was therefore higher, and told to **verify the
> cause first, because it arrived second-hand**.
>
> Two of them came back and said the cause was false. That instruction paid for
> itself twice in one wave, and both times the wrong claim was mine.

### THE STALE CAUSE — `collider-buildings`

I handed seven rows to one lane with this: *"`buildOne` writes an OPEN TUBE — one
full-height quad per footprint edge, no floor, no cap (`:212-216`, the file's only
collider writes). Cars end up inside buildings rather than stopped against them."*

**It had been repaired before the wave started — by us.** `buildings.ts:297-349`
writes a **closed six-face slab** per footprint edge (outer, inner, cap, floor, two
end caps), `:138` defines `WALL_COLLIDER_THICKNESS_M = 1.0`, and
`git log -S WALL_COLLIDER_THICKNESS_M` dates it to **`6399a8d`, 2026-08-27 19:54** —
one of our own commits, hours before I wrote the brief. Lines 212-216 are facade
tint. `building-collider-is-solid.test.ts` was already 9/9 green.

The seven frames the rows rest on were written **2026-08-17/18**, ten days earlier.
The lane then produced the post-fix evidence: on the w14 re-drives (`startedAt`
21:25 local, ~1.5 h after the slab landed) every car is brought to a stop within
one beat, with 2–4 «Удар в неподвижно препятствие» billed and the ЗАЩО explainer
shown. It opened the frames rather than inferring: `sc-ac-night-overdrive__pc-wrong/
04-t045s.png` is 0 км/ч against a **headlight-lit, front-facing** facade with
«ОПАСНА ГРЕШКА −10» on the glass.

**And it killed the "the camera is inside the mesh" reading with a fact I had not
thought about at all.** The facade meshes take no `side` prop
(`StaticWorld.tsx:666-696`), so they are three.js' default `FrontSide` — a camera
inside a building sees that building's walls **culled away**. An opaque, lit,
*front-facing* facade filling the windscreen is a camera *outside* the wall, which
is what a correct stop looks like.

Verifier r27 re-derived it all: *"the stale brief really is stale, the culling
argument is right, and all seven refutations survive on evidence I re-derived."*

**Where the staleness came from, so it does not recur.** The re-routing pass read
wave 7's lane reports and lifted their causes. Those reports were written against a
tree that wave 7 then changed. I carried the cause forward as fact without asking
whether the wave that produced it had already fixed it. **A cause is exactly as
fresh as the report it came from, and a repair wave invalidates its own reports.**

(Also mine, and sloppier: the lane's `owns` list printed
`modules/sim/world/builders/buildings.ts` without the `platform/src/` prefix,
because the wave-8 builder stores prefixes and the brief printed them raw.)

### THE FALSE CAUSE — `route-the-unrouted`

I batched 21 rows as *"these still carry no usable address — some say literally
'unknown'. Nobody ever routed them."* The lane counted the field:

| what the row actually carries | count |
|---|---|
| literally `"unknown"` | **5** |
| a DIRECTORY, not a file | 2 |
| a TEST file (can never be a product address) | 1 |
| a real product file, **routed in wave 7** with a `rerouted` block | **7** |
| a real product file, never re-routed | 6 |

So my sentence was true of **5 of 21**. Seven had been routed eight days earlier
with adjudicated evidence, four of them at `confidence: VERIFIED`, and the lane
re-checked all seven line-by-line at HEAD: four verbatim, two with the diagnosis
intact, one refuted.

**And it found the real common cause, which is a routing class worth more than the
batch was.** Six rows are routed at the **roomy (desktop)** surface for a defect
photographed on the **compact (phone)** one. `LessonPlayShell.tsx` mounts two card
systems and the corpus does not distinguish them: `AdvisorCard` (`:6327`),
`BriefingCard` (`:6341`) and `MistakeConsequenceOverlay` (`:7016`) are **roomy
only**, while on compact the same content goes through the `SimOverlayItem` queue
(`:4732-5038`) and is painted by `hud/SimOverlay.tsx` as the one-line peek +
«↓ ОЩЕ N РЕДА» + «ЗАЩО»/✕ card. Every frame in that lane showing that card shape is
a **mobile** leg. So five more rows belong at `hud/SimOverlay.tsx` /
`hud/overlayQueue.ts`, with the chain proved end to end.

### THE LESSON, AND IT IS NOT "DO NOT HAND DOWN CAUSES"

Batching by cause was still right — it is what let one lane refute seven rows at
once instead of seven lanes each half-repairing a symptom. What has to travel with
a cause is the instruction that came with it, and it must never be softened:

> **VERIFY THE CAUSE FIRST. It came to you second-hand. Open the file, read the
> lines named, and confirm it before you act on it. If it is wrong, say so with
> evidence — that is a completed lane, not a failed one.**

Both lanes did exactly that, and both were right to. A lane that had "just fixed"
the open tube would have written a second collider into a file that already had
one, and the seven rows would have been banked on it.

### THE WAVE-8 INTEGRATION, AND THE FOUR THINGS THAT HAD TO BE FIXED FIRST

None of the four was caught by a gate. All four came from the adversarial pass.

1. **Two offence codes with no emitter anywhere.** The `offence-codes` lane added
   `POLICE_STOP_SIGNAL_IGNORED` and `WARNING_LAMP_IGNORED` to the `ViolationCode`
   union and the catalogue, and shipped **no producer** — `grep` over `src` and
   `content` returns the union member, the catalogue row and one comment. On
   `/simulator` neither code can fire on any drive. It also broke the build
   (`n38.ts`'s exhaustive `Record<ViolationCode, N38Basis>`) and ten tests,
   including the repo's own dead-predicate guard, which was naming the lane's work
   out loud. The lane had even written *"if this row is orphaned, the runner edit
   it is paired with did not ship"* — and then shipped it orphaned. **Reverted**,
   with the retrieved ЗДвП чл. 103 / чл. 101 ал. 1 references and the complete
   list of what must land together kept in a comment. The retrieval was the
   expensive half and is the part worth saving.

2. **`requireLawfulSpeed: true` on a type with no such field.** Dead predicate and
   a `tsc` error at `templates-cockpit.ts:315`. Deleted, with the hole documented
   at the site so the next reader knows the objective's title claims a discipline
   nothing measures — the `sc-swp-finish` shape again.

3. **The streetlamp pool was offset 2.2 m the wrong way**, onto the footway, on
   `sc-ov-night-gap` — a critical row whose whole subject is what you can see at
   night. The fix agent re-derived the whole chain rather than taking the
   verifier's word, walking the shipped GLB accessor bounds through the node
   transforms: the arm is local **+X**; `rotateY(−π/2)` puts it on **+Z**;
   `yawFromFacing` aims +Z along `facing`; and `props.ts:1543-1548` sets
   `facing = mul(r, -side)` — at the centreline. So the negative sign pushed the
   disc away from the road. Measured on `sp-creep-v1`: pool centre landing at
   **18.22 m** instead of **13.82 m**. One character, and it had **zero test
   coverage** — the only gate was a `drawSlots` count, which is direction-blind.
   Now gated by a test that re-measures the GLB and reads the three `translate`
   arguments out of the source (comment-stripped and quote-aware, so a
   commented-out line cannot satisfy it), rather than pinning today's numbers.
   **Still owed: a look at a frame** (doc 66 R0). Geometry that reasons correctly
   can still render wrong.

4. **A test pinned on an input the product cannot produce** — `litTickCount(0)`,
   where the machine's standstill test is `|v| < REVERSE_ASSIST_STANDSTILL_KMH`
   and the dial rounds, so an exact 0 may never occur on a live drive. Re-pinned.

**Two corrections to briefs I wrote**, both found by the agents:

- I gave the lamp-pool file as `platform/src/components/sim/WorldProps.tsx`. **That
  path does not exist** — the real file is
  `platform/src/modules/sim/world/components/WorldProps.tsx`. The agent found it by
  the quoted line rather than by the path, which is the right instinct.
- My integrator preamble says this repo stores `.ts`/`.tsx` as **CRLF**, and one
  agent contradicted it from `.gitattributes`' own prose (*"every one of these
  files is already stored LF in the index, verified 1209/1209"*). **My preamble is
  right and the prose is narrower than it reads**: `.gitattributes` sets
  `eol=lf` for exactly four patterns — `*.trace.json`, `*.generated.ts`,
  `content/world/*.json`, `platform/public/world/*.json` — the byte-exact gate
  fixtures. `git show HEAD:…/WorldProps.tsx` carries **2423 CR lines**. Both files
  the agent touched landed fully CRLF and `git diff --stat` shows 174/1, so
  nothing broke; but the claim must not propagate.

### AN ARBITRATION: THE MODE NUMERAL STAYS, DEMOTED AND EXPLAINED

Two lanes reached opposite conclusions about the «РЕЖИМ Нормален ≤N» strip.
`hud-cap-numeral` demoted the numeral's weight and added a clause distinguishing
it from the law; `speed-contract-camera` wanted it dropped entirely. Only the
first owns the file, so only the first landed — but the disagreement is real and
is mine to settle.

**The numeral stays, demoted and explained.** Dropping it would leave the student
with a throttle that stops responding and no sentence saying why — «газта не отива
по-нагоре» becomes an unexplained mystery, which is the requirement-zero
violation, not the cure for it. What was wrong was never that the number existed;
it was that it was drawn in the same weight as the two numbers that can convict,
while being the only one on the bar that carries no fact about the road under the
wheels. The landed copy now says so: *«Това е таван на РЕЖИМА, не разрешение …
знакът до скоростта е ограничението.»*

### THE HARVEST — turning refutations into ledger entries

Wave 8's lanes repaired little and **disproved a lot**, and a refutation is worth
nothing while it sits in prose. Of roughly 120 rows carrying a lane refutation
claim, **42 were written as verdicts and about two thirds were refused**:
**18 REFUTED · 18 PARTIAL · 6 STILL**.

The refusals are the valuable half, and they follow rules worth keeping:

- **A wrong address is not a refutation.** The defect may be entirely real
  somewhere else; those rows stay STILL. Nineteen rows were refused on this alone.
- **BLOCKED is not REFUTED.** A lane that correctly declined to ship a dead
  predicate has repaired nothing.
- **"The claim is true at HEAD" is a founder ruling, not a falsification** — three
  rows where the lane agreed the observation was right and disagreed that it was a
  defect.
- **A refutation nobody photographed is not certified** (doc 66 R0). Four rows,
  including one whose own frame was a scratchpad PNG from a dead session that no
  longer exists.
- **"Plausible" is not "upheld."** Five rows.

**Open list: 381 → 363.**

### AND A TRAP I DOCUMENTED AT 02:00 AFTER CAUSING IT AT 00:30

`wave-c-post` reported *«1 cite an id not in the corpus»*. It was mine.
`sc-sp-wet-limit-plate:5708fd93` carried a w14 adjudication with a photographed
frame and a sound argument — and I had rewritten that row's `what` earlier the
same day to withdraw the false "in the rain" premise. Since
`findingId = scenario + sha1(what + NUL + frame)`, the edit **rehashed the id**
and the verdict was left pointing at nothing, silently doing no work.

Re-pointed to `d9fd3821` — but **not** by copying the old line across. Its `why`
argued the car did 58,9 in a 50 *«in the rain»*, which is exactly the premise the
correction withdrew; carrying it forward under the corrected row would be worse
than the orphan, because it would look settled. The new line keeps the verdict,
the frame and the photographed quote, and restates the reasoning on the claim that
survives: `sc-swp-finish` is a bare `reachZone` with no speed cap whose title
asserts a speed discipline it never measures.

### TWELVE CENSUS TESTS, DECIDED ONE AT A TIME

Wave 8's 22 lanes reddened twelve **census** and **ratchet** tests — the ones that
pin an exact count or an exact roster (*"exactly these rows witness a cockpit
state, and no others"*, *"the census is a ratchet: no silent rise"*). They exist
because those numbers crept once and nobody noticed.

A bulk re-baseline is how a regression gets blessed, so four agents adjudicated
them under one rule — **default to REGRESSION; if you cannot say in one sentence
why the new number is CORRECT rather than merely different, it is a regression** —
and two adversarial verifiers then checked every verdict, looking hardest at the
re-baselines, because a re-baseline is the answer that makes a red gate go away.
All verdicts came back SOUND.

**Re-baselined, each with its reason written beside the number:** the three
`reach-zone` rosters, the four advisor/cap censuses (953→958), `b58`'s parse
census (502→507), `world-referent` (T8raw 195→196, B4raw 152→153), the
`rung-ladder` L5 roster gaining `sc-junction-scan`, and the L1→L2 ratchet 166→167.

Almost all of them trace to **one line**: the integration fix that removed the
dead `requireLawfulSpeed: true` and implemented its intent with a real
`maxSpeedKmh: 50` plus `radiusM` 14→4. That objective's title says «нареди се в
**дясната лента**» and a 14 m disc ticks for a car that never reached the lane —
so it is a genuine title-truth repair, measured against all three committed traces
(each passes within 0.10 m at 39.9 км/ч, 0.00 m lateral). A verifier proved the
attribution by controlled removal rather than argument.

**Two were regressions, and the gates were left biting:**

- **`point-scales`.** A new live sentence under the ИЗДЪРЖАН badge read «нищо не
  влиза в **точките**» — unqualified. To a Bulgarian reader that is *контролни*
  точки, the 39-point licence budget; this card counts Наредба № 38 exam points.
  Two different scales, and the one the reader assumes is the one a
  seventeen-year-old is actually afraid of. Now «наказателните точки», matching
  the wording this same file already uses 65 lines below.
- **`reach-zone-witness` — the sharpest finding of the wave.** A matcher
  fallthrough let a banner naming **no lamp at all** acquire a `lamps: "lit"`
  demand from the words «съобразена за видимостта скорост». Five assertions
  pinning those strings as `undefined` **still passed** while
  `parseObjectiveParams` began returning `"lit"` — the letter of the pin survived
  and its meaning inverted. **Invisible to the test written to catch it, and
  visible only to a census counting the roster.** The refusal it produced would
  have cited a requirement the banner never made. Reverted; the demand may be
  right on the merits, and the honest route is to retitle so the banner says
  «осветен». The finding stays open: `mistake-lights-off` completes that gate today.

And a footnote worth keeping, because it is the same class arriving from the other
side: reverting that fallthrough left `deriveVisibilitySpeedLampDemand` **exported
with no caller and no test**. Deleted — an unread predicate is what this wave spent
itself finding, and leaving one behind while removing another would have been a
poor joke.

### FIVE FILES WERE PHANTOM WHOLE-FILE REWRITES, FROM MY OWN BRIEF

My integrator preamble said *"this repo stores `.ts`/`.tsx` as CRLF"*. **Both
conventions exist here**, `core.autocrlf` is `false` so git normalises nothing, and
lanes took the blanket advice and wrote CRLF over blobs that were LF.
`world/types.ts` read as a **953-line rewrite** and is a **19-line addition**. A
census verifier caught it; no gate did.

Every modified file is now restored to **its own blob's** convention, by a script
that refuses any file whose line count would move. The check that proves it, and
the one to keep running: the whole-tree diffstat and the `--ignore-cr-at-eol`
diffstat are now **identical**. Note also that a one-off `git show HEAD:… | grep -c`
disagreed with the script on `difficulty.ts` and was the unreliable measurement —
read the blob as bytes, not through a pipe.

---

## §18 — 2026-08-29: the round that could not have repaired anything, and the 74% that did not survive

**Read this section before running anything.** It ends with the exact state the next
session inherits and the commands to continue. The numbers below are the honest ones.

### THE LEDGER, IN THE FORM THE FOUNDER REQUIRES

**1,510 ever filed · 1,251 closed with evidence · 83% · 259 open · 12 retired today.**

Never report the raw open count alone. The 259 are three different problems:

| bucket | rows | what it actually needs |
|---|---|---|
| confirmed-STILL | **136** (this round) | a REPAIR wave — one is built and queued, see below |
| UNJUDGED | **72** | a specific drive each; the judges named many of them |
| PARTIAL | **16** | compound rows; each needs splitting before it can close |

### THE FINDING THAT OUTRANKS THE ROUND

A batch-2 adversarial verifier refused to certify its own batch's closures and gave one
reason. I verified it independently, then went further:

```
git diff --stat f91dd1c HEAD -- platform/src     # EMPTY
git log --oneline f91dd1c..HEAD                  # 9 commits, none product code
```

**NOT ONE LINE OF PRODUCT CODE HAS CHANGED SINCE REPAIR WAVE 8 (`f91dd1c`).** The w15,
w16 and w17 sweeps all ran against a byte-identical `platform/src`. Everything between
them was the audit harness, audit tooling or docs.

That destroys a whole class of closure. Commit `bc7d43f` ("wave 9") changed HOW THE CAR
IS DRIVEN — it taught the harness to rest every 45 m, hold a pace, and press the
product's own play button. Measured consequence: `sc-speed-dangerous` pc-right went from
19 full stops / 133 driving ticks / a collision at w15, to 2 stops / 48 ticks / no
collision at w17, **on identical product code**. A judge reading "it used to be convicted
and now it passes" sees a repair. There was no repair. There is a better driver.

This is the dead-predicate class's twin. There, a repair ships a measurement nothing
reads. Here, a MEASUREMENT CHANGES and is credited to a repair that never happened. Both
move the ledger without moving the product, and both fail in the reassuring direction.

### SO EVERY CLOSURE WAS ATTACKED, AND 74% DIED

Five adversarial attackers plus an adjudicator re-examined all 35 surviving closures
against that fact. **9 upheld, 26 overturned.** Combined with the judges' own verifiers,
the round's arithmetic is:

**56 raw closures claimed → 12 survived. 79% did not.**

Why the 26 failed:

- **15 (58%) credited the harness with a repair.** Worst case: `sc-mw-emergency-lane`,
  where `_audit-debrief.json` is **byte-identical** at w15 and w17 — the convicted state
  is verbatim intact and only the drive moved. Also `sc-ov-abort`, closed because "the
  careful driver is no longer punished" — it finishes because `pace.used=true` is
  replaying `content/traces/.../shadow-correct.trace.json`; the car is on a tape.
- **8 — the evidence does not show the quote.** Two cited **a different lesson's frame
  entirely** (`sc-rx-guarded`'s closure points at `sc-pk-move-off__mobile-right/run.log`).
  One "the pill is now opaque" was measured: greyscale sd inside the pill 7.70/9.66 at
  w17 vs 8.44/8.77 at w15 — equally translucent; only the backdrop changed.
- **3 cited a source change outside the window that matters** — real code, landed in an
  ancestor of the build the row was filed against, so it cannot explain the change.

**A sub-class worth a permanent gate (5 rows):** a row that a verify pass had ALREADY
opened was re-closed, on unchanged product code, with no new evidence. Attacker 2's
proposed mechanical remedy, not yet implemented: *refuse at the gate any CLOSED whose
immediately-preceding verdict is `correctedBy:"verify"` and whose product tree hash is
unchanged.* **This is the highest-value tool change available and it is not written yet.**

### THE HARNESS LEARNED THE CLUTCH — 5 rows unblocked (4 critical)

`sc-vp-stall` is the catalogue's only manual lesson: `openingTier: "advanced"`
(`templates-cockpit.ts:486`) plus `transmissionModeFor` (`driveline.ts:254`) hands it a
manual box, so it spawns in N — and the harness's entire key vocabulary was
W/S/A/D/B/Escape. Three sweeps photographed a stationary car and honestly refused to
judge them (exit 8, "DO NOT RE-DRIVE — the harness is what has to change").

The ledger had already written the spec and named the files. The keys are the product's
own (`scene/cabin.ts:565-567`: clutch `KeyZ`, gears `BracketRight`/`BracketLeft`) and the
sequence is the one the product paints on its own glass (`engine/stuckStart.ts`).

It **verifies instead of pressing blind** — reads `gear()` off the driveline's own
selector and either watches the letter leave N or says loudly it could not. It engages
only from N (a gear-up in D/M/R would upshift a moving car, and the harness would then
file its own gesture against the product). The clutch is held THROUGH the throttle,
because dropping it with no gas is precisely the stall this lesson exists to grade.

Proven before shipping: `manual box: N to M1 on attempt 1`, top 30 km/h, a real
NEZAVERSHEN verdict — where three sweeps had 0 km/h.

Two pieces of prose were then false and were fixed: the judges' brief told judges this
lesson could never be driven and to NOT ask for a re-drive. The bracket now explains that
its meaning **depends on the drive's date** — before 2026-08-29 it means re-drive; after,
it means the engage failed, which is a harness finding.

### THE RESTORE DRILL FAILED THE FIRST TIME IT WAS EVER RUN

Item 0 of the founder batch, never executed. The dump is fine; the DOCUMENTED RECOVERY
PATH was not:

```
pg_restore: error: could not open input file /var/backups/knijka/...dump: Permission denied
```

`backup-db.sh` does `chmod 700 "$BACKUP_DIR"` because "a dump of a minors' database is not
world-readable (ADR-004)". The directory is root's; `pg_restore` runs as `postgres`;
postgres cannot read root's 0700 directory. **The README's own commands could not have
restored this database.** Corrected to pipe it — root reads the file, postgres receives it
on stdin. Do NOT loosen the 0700; it protects a minors' database and the pipe costs
nothing.

Proven, not asserted: 20 tables, `User` = 2 rows, scratch database dropped. It surfaced on
a Saturday morning with the site up instead of during the incident it was written for.
Today's dump is also on E: (3 dumps, checksums verified, 0 days old).

### WHAT I GOT WRONG, AND THE ONE ROOT CAUSE UNDER BOTH

**I bypassed `wave-cycle.sh` and hand-rolled the mechanical steps. Twice, it cost real work.**

1. **5 drives lost to `treeMoved`.** I ran `wave-c-post --apply` — which appends to the
   TRACKED `docs/simulation/88_LESSON_AUDIT.md` — while w17 was still driving. My first
   diagnosis was wrong and worth recording: I blamed the COMMIT. HEAD was identical at both
   ends of those drives (`bc7d43f`). It was the **uncommitted write** that moved the
   worktree hash. The rule is not "don't commit during a sweep", it is **don't touch a
   tracked file at all** — the hash moves when the file changes, not when it is committed.
2. **6 more drives lost to `exit=6` (TARGET_UNVERIFIED).** `.env` still carried `bc7d43f`
   while HEAD was `b7a321c`. I first said "restamped but not restarted"; wrong — nothing
   restamped it at all. `wave-cycle.sh commit` does that step. I had used `git commit`.
   I then compounded it by dispatching the re-drive **without the preflight**, which is
   the exact check for this. The preflight caught it on the second attempt.
3. The same bypass broke the VPS push (`Permission denied (publickey)`): `core.sshCommand`
   is pinned repo-locally to the GitHub key with `IdentitiesOnly=yes`, and the VPS needs
   its flokinet key. `push_both()` in `wave-cycle.sh:134` already knows this.

**USE THE RUNNER. It encodes every step I keep skipping.**

### STATE HANDED OVER

- **Both remotes hold HEAD** (origin GitHub, vps flokinet).
- **Gate green**: tsc 0 · vitest 16,340 passing · content green · tools 0 failing.
  **3 standing reds only**: 2 vitest (t-accidents content-bank, l-accidents-first-aid
  compose — both founder-blocked on the 29 first-aid signatures) + 1 tools-test
  (deck-captions freeze).
- **Dev server** on :3000 must attest HEAD before any drive. After ANY commit:
  restamp `platform/.env` (`NEXT_PUBLIC_COMMIT_SHA`), **restart the server** (it is a
  build-time constant), then `wave-cycle.sh preflight`.
- **`.audit-frames/` is gitignored on purpose** — snapshot it with
  `tools/audit/snapshot-ledger.sh` to the `ledger/audit` branch, which is how the corpus
  survives an account switch.

### NEXT, IN ORDER

1. **REPAIR WAVE 10 — generated, validated, NOT launched.** Regenerate it from the
   current ledger rather than trusting a stale artefact:

   ```
   node tools/audit/make-repair-wave.mjs .audit-frames/repair-wave-10.js 6 8
   Workflow({ scriptPath: ".audit-frames/repair-wave-10.js" })
   ```

   `tools/audit/make-repair-wave.mjs` is NEW and is the missing half of this programme:
   `make-verdicts2.mjs` turns drives into verdicts; nothing turned verdicts back into
   REPAIRS, so that step was done by hand each round and therefore skipped — which is why
   the last nine commits contain no product code.

   It selects ONLY rows whose EFFECTIVE verdict is STILL (originals first, corrections
   last — selecting on raw verdicts would have sent lanes at 44 rows a verifier had already
   overturned). It refuses PARTIAL (compound: split the row first) and UNJUDGED (nobody
   could tell). One file per lane, disjoint by construction.

   As generated on 2026-08-29: **174 confirmed-STILL over 82 files**; the wave takes the
   6 densest-in-critical — `finish.ts` (6/6 crit) · `rules/engine.ts` (8/5) ·
   `templates-lanes.ts` (6/4) · `templates-parking3.ts` (4/4) · `objectives.ts` (4/4) ·
   `runtime/surface.ts` (3/3) = **31 rows, 26 critical**.

   Each lane carries the three checks that have each cost a wave: verify the cause
   (briefs here have been wrong twice), THE ADDRESS RULE (66% of findings name a file that
   cannot hold the defect), and THE DEAD-PREDICATE TEST (51 of 82 audited repairs shipped
   code nothing reads). Each gets an adversarial verifier that traces the live import
   chain itself.
   **This is the first product code the repo will have seen in nine commits.**
2. **Implement attacker 2's gate** (above): refuse a CLOSED that re-closes a
   verify-overturned row on an unchanged product tree. It automates the class that cost
   this round five rows.
3. **w18 sweep** — `.audit-frames/w18-lessons.txt` (28 lessons). **Add `sc-vp-stall` back**;
   the clutch fix makes its 3 UNJUDGED + 1 PARTIAL rows settleable for the first time.
   Evidence for 4 lessons already exists in `.audit-frames/fill-w17r` — it was NOT merged
   into w17 because those legs ran at `b7a321c` and the rest of w17 at `bc7d43f`, and
   `wave-c-merge` correctly refuses to mix builds.
4. **DO NOT WRITE TO THE TREE WHILE DRIVES OR VERIFIERS MEASURE IT.** Queue integrator
   edits until they finish. Both of today's losses come from breaking this.
