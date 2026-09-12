# Edits queued for the moment the sweep finishes and the tree unfreezes

The tree must not move while drives certify against its hash, so these are
written down rather than made. Apply in this order.

## 1. `tools/audit/make-verdicts2.mjs` — stop hardcoding the drive destination

**Why.** The judge prompt names `E:\AI driver\.audit-frames\wave-c\frames\...` as
"THE NEW frames", but this sweep must merge to a DIFFERENT destination: 219 of the
788 banked retirements cite `(lesson, leg)` directories under `wave-c/frames/`
that this sweep re-drives, so `wave-c-merge` refuses that destination (correctly —
its look-only first pass reports the collisions and moves nothing). With the
destination hardcoded, every judge would be sent to the wrong pictures while the
results file it reads came from the right ones — and a judge who opens a stale
frame and writes STILL is not making a mistake anyone can see afterwards.

**The change.** Derive both paths from `resultsPath`, which is already
configurable via `WAVEC_RESULTS`.

After the `resultsPath` block (~line 64), add:

```js
/** The drive root is wherever the results file lives — never assume `wave-c`.
 *  A sweep whose frames must not collide with banked closure evidence merges to
 *  its own destination, and a judge sent to the wrong directory reads a frame
 *  from a superseded build and writes a verdict nobody can tell is stale. */
const DRIVE_ROOT = path.dirname(resultsPath);
const win = (p) => p.split("/").join(String.fromCharCode(92));
```

Then replace these two prompt lines (~207 and ~209):

```js
  "    E:\\AI driver\\.audit-frames\\wave-c\\frames\\<lesson>__<platform>-<mode>\\*.png",
...
  "    E:\\AI driver\\.audit-frames\\wave-c\\wave-c-results.jsonl",
```

with:

```js
  "    " + win(DRIVE_ROOT) + "\\frames\\<lesson>__<platform>-<mode>\\*.png",
...
  "    " + win(resultsPath),
```

## 1b. `tools/audit/make-verdicts2.mjs` — tell judges that `-wrong` legs never steer

**Why.** The brief has NO mention of steering (grep: zero hits). MEASURED on this
sweep: **77 of 82 `-right` legs steered** (22–110 commands each), and **0 of 43
`-wrong` legs did** — the drive path only runs the steering loop in its `roll`
phase, and every MODE=«wrong» lane holds the throttle flat and never reaches it.
`run.log` says so itself in capitals. **72 of the 476 open rows** are filed on a
`-wrong` leg AND turn on steering, positioning or objective crediting. Without
this paragraph a judge reads "the objective never ticked", sees it on a fresh
frame, and writes STILL — which is not a defect report, it is a description of a
car that never turned the wheel, and it would put 72 false rows in the ledger.

Insert into the prompt array, next to the bracket-meanings block (~line 215):

```js
  "",
  "-- THE CAR MAY NOT HAVE BEEN STEERED, AND THAT CHANGES YOUR VERDICT --",
  "MEASURED on this sweep: 77 of 82 `-right` legs STEERED (22-110 commands each).",
  "0 of 43 `-wrong` legs did. The drive path runs the steering loop only in its",
  "`roll` phase, and every MODE=wrong lane holds the throttle flat and never gets",
  "there. Each leg's run.log states which it was, in capitals:",
  "    STEERING: 22 command(s) ...            <- steered, judge it normally",
  "    !! THIS DRIVE WAS NOT STEERED AND NOT MEASURED   <- see below",
  "",
  "ON AN UNSTEERED LEG, any finding that turns on steering, lane position, parking,",
  "reversing, route progress or OBJECTIVE CREDITING is UNJUDGED — never STILL.",
  "«The objective did not tick» on a car that never turned the wheel is not a",
  "product defect, and recording it as one retires nothing and puts a false row in",
  "the ledger. The run.log names the affected objectives for you.",
  "",
  "Copy and paint defects ARE judgeable on an unsteered leg — the text on the glass",
  "does not depend on the wheel. Judge those normally.",
  "",
  "«guidance loop BLIND» is NOT the same as «NOT-RUN». BLIND means the loop ran and",
  "could not see the guidance — that may itself be a defect worth filing. NOT-RUN on",
  "a vehicle-preparation lesson (sc-vp-*) is expected: the car is not meant to move.",
```

## 2. Merge the sweep to a fresh destination

```
node tools/audit/wave-c-merge.mjs \
  --halves fill-w1s1,fill-w1s2,fill-w1s3,fill-w1s4 \
  --dest w11 --copy
```

`--copy` keeps the shards, so a bad merge costs nothing. Expect it to report any
non-zero exit or `treeMoved` row out loud rather than hiding it (guard 3).

## 3. Adjudicate against the new destination

```
WAVEC_RESULTS="E:/AI driver/.audit-frames/w11/wave-c-results.jsonl" \
  node tools/audit/make-verdicts2.mjs .audit-frames/verdicts-w11 35 6
```

Then run each emitted `verdicts-batch-N.js` through the Workflow tool.

## 3a. FILE THREE NEW DEFECTS the verifiers found — none has a row yet

File into `chunk-wavec-new.jsonl` (which MUST stay in finding-reader's ADDITIVE
set), AFTER adjudication finishes. Each was found by an adversarial verifier
while overturning a closure, and each is photographed.

1. **`sc-sig-controller-postures` — the MODEL drive now kills a pedestrian.
   CRITICAL, and it is a REGRESSION.** The filed record has the correct lane at
   *ИЗДЪРЖАН 0 т. on both platforms*. At `ba3ed163`, `mobile-right` is
   **НЕИЗДЪРЖАН 13 т. with «Удар в пешеходец»**. The drive that demonstrates how
   to do it right hits someone. Currently survives only as a note inside
   `f7e046c4` (UNJUDGED) and will be lost with it.

2. **Phantom convictions on empty world — `sc-vu-emergency-junction` pc-right.**
   `04-t076s` books «ОПАСНА ГРЕШКА −10 · Непропускане на пътно превозно средство
   с предимство» and ~t200s books «Удар в неподвижно препятствие», while the
   windscreen holds no object at all. Supports `7fab4e4e` (correctly UNJUDGED)
   but is a distinct claim: the engine convicts against geometry that is not on
   the glass.

3. **Mobile fault toast truncated mid-word at «…с»** —
   `sc-junction-blind__mobile-right/04-t061s.png`. A batch-2 verifier said
   explicitly it "will be lost unless someone files it".

**Also worth a row, from batch 1:** `sc-hz-emergency-stop` — a CRAWL DODGES THE
DRILL AND IS TOLD IT PASSED. Both legs peaked at 16/19 км/ч against
`minTriggerSpeedKmh: 25`, so the child never darted, yet «✓ Спри преди детето»
ticked and both read ИЗДЪРЖАН ★★☆. `objectives.ts:1086-1090` states the mechanism
in the build's own words: a drive that never reaches trigger speed never arms the
encounter and the check "falls through to `true`". This is the same shape as the
engine-conviction lane: the lesson cannot grade its own subject.

## 3b. FILE the defect a verifier found and explicitly said would be lost

A batch-2 verifier ended its report with: *"the mobile fault toast truncated
mid-word at «…с» (`sc-junction-blind__mobile-right/04-t061s.png`) is still
unfiled and will be lost unless someone files it."*

It is a real, photographed defect and it belongs in `chunk-wavec-new.jsonl`
(which MUST stay in finding-reader's ADDITIVE set). Do it AFTER adjudication
finishes — filing into the corpus while judges are writing verdicts is the
moving-target problem `count-agreement` warns about.

Also from the same verifier, already re-anchored and needing no separate row: the
"grader is blind to speed" note now lives on reopened rows
`sc-ac-truck-spray:8ed4d8b3` and `:990e5f64`.

## 4. Commit `docs/simulation/90_HANDOFF.md` §13

Draft is at `.audit-frames/wave-scripts/handoff-13.md`.

## 5. After adjudication

`verdict-coverage` → `count-agreement` → `wave-c-post --apply` →
`snapshot-ledger.sh` → re-derive waves 2 and 3 from the NEW open list.
