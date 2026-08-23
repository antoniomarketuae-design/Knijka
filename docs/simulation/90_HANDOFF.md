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
