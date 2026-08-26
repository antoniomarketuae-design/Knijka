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
  (cannot be settled by one drive at 13% determinism) · 4 PARTIAL.**
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
   says so. DO NOT judge them from single drives — 13% determinism, measured.
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
