# 93 — Instrument gaps: what the audit harness cannot measure

The audit harness drives the product and judges an open-defect ledger. Some rows in that
ledger cannot be settled — not because nobody has looked, but because the instrument cannot
produce the evidence. **A row blocked by an instrument gap must stay open.** Closing it on a
harness change is how a missing instrument comes to read as a refuted defect.

This document is the register of those gaps. Each entry says what cannot be measured, what it
would take, and which rows stay unsettleable. Entries are added when a capability is **parked**
— stopped deliberately, on evidence, with the work kept.

**The standing rule these gaps exist to protect: a harness change is not a repair.** No finding
may close on a change to `tools/`, and no claim about the product may rest on one.

---

## GAP-1 — The wiring layer of `tools/mobile/lesson-audit.mjs` is unexecutable

**Parked 2026-09-19**, after five passes (w52 → w52e), each adversarially verified, each
refused on evidence. The work is kept; the capability is not certified.

### What it cannot measure

`tools/mobile/lesson-audit.mjs` carries a top-level `await`, so **no test can import it**.
Every defence of the code in that file is therefore a source grep, and a source grep refuses
the shape its author imagined and nothing else.

Measured 2026-09-19 against a green suite at **152 passing / 0 failing**: **6 of 6 wiring
mutations survived**, each applied under an md5 gate and the file restored `cmp`-identical
afterwards.

| mutation | what it does | result |
| --- | --- | --- |
| **W23** | appends `overLimit.needKmh = overLimit.postedKmh;` after the store-backs | **survived** 152/152 |
| W21 | wraps a store-back in a two-line guard | survived 152/152 |
| W27 | appends `overLimit.flatTicks = 0;` after the store-back | survived 152/152 |
| G4 | `sustainedAtSec = elapsedSec({now, from: t0})` → `from: now` | survived 152/152 |
| G3 | the same on `overCap.provenAtSec` | survived 152/152 |
| F3 | drops the clock from the over-cap scan's `state:` argument | survived 152/152 |

**W23 is not coverage debt — it is the headline defect restored.** Driven through the real
`overLimitLedgerStep` at 52 km/h over a posted 50, ten ticks of 500 ms, bands
`{gradedAbove: 55, dangerousAbove: 60}`:

```
as shipped (need 55)            overSec 0.0   arm stopped ×10   hold.done null         past SUSTAIN(3): false
under W23  (need = posted = 50) overSec 4.5   arm accrue  ×10   hold.done "sustained"  past SUSTAIN(3): true
```

Under W23 the harness certifies an antecedent as DRIVEN and prints that the leg "accrued
INSIDE" the penalised band — for a band the leg never entered, because the engine's
`gradedAbove` for a posted 50 is 55 and the изпитен лист bills nothing at 52. W23 walks past
all ten anchored store-backs (it *adds* a line rather than changing one) and past the negative
assertion guarding it (it writes `= overLimit.postedKmh`, so the forbidden substring never
appears).

**A second, live defect needs no mutation at all.** `tools/audit/leg-evidence.mjs`'s OVER-CAP
arm interpolates `topKmh`, `provenAtKmh`, `provenAtSec` and `done` with none of the
`measured()` / `speed()` guards its over-limit sibling carries. Rendering the real initialiser
through the real `renderEvidence` on the pristine tree produces, today:

> `OVER-CAP: the leg did NOT beat its task cap of 36 (top -1 км/ч, metres). No row about what the engine books above that cap may rest on this leg.`

`-1` is the documented unreadable-dial sentinel, rendered as a dial reading inside a
**refuting** judging sentence. It is reachable: the speed and the cap strip are independent DOM
reads in the same `evaluate`, `capKmh` is sticky across ticks, and the top-of-dial tracker
leaves `topKmh` at `-1` because `-1 > -1` is false. Any frame where the cap strip paints and
the speedometer's label never matches renders it.

### What it would take

1. Extract the flat-block **tick body** itself as a pure function —
   `overLimitFlatTick({p, state, cfg, now}) -> nextState` — so the store-backs cease to be a
   surface and the residual grep degenerates to "the call happens". Equivalently: split the
   drive loop's tick body out of `lesson-audit.mjs` into a module with no top-level `await`.
2. Give the **over-cap** chain (note line, `leg-evidence` arm, `provenAtKmh`) the three-valued
   treatment the over-limit chain received.

Both are larger than the lane that met this wall, and both risk what roughly 200 committed
legs measured. **Sequence them after a drive proves the instrument runs end to end** — see
"never exercised" below.

### What stays unsettleable

- **`sc-follow-tailgater:63c0c28c` stays PARTIAL.** No finding closed on any of the five passes.
- **The capability has never been driven.** 0 of the 11 `_audit-status.json` files under
  `.audit-frames/w51/frames` carry an `overLimit` field. Every claim the lane produced is about
  what the harness *computes*, never about what the product *does*. Driving before the render
  defects are fixed would bake the `-1` and `null` sentences into the evidence the judging
  reads from.

### What was kept, and why it is sound

The extraction into `tools/mobile/lib/driveline.mjs` — `overLimitScanStep`, `overCapScanStep`,
`elapsedSec`, `overLimitNoteLine` — and its execution tests. That file **is** importable, so a
mutation there cannot be caught by a grep: every kill in it is by execution. Fourteen named
mutations (M1–M5 and the nine store-back survivors) die there. The extraction removed zero
lines of behaviour.

**The lesson generalises beyond this lane:** when arithmetic sits in a file that cannot be
imported, the answer is to move the arithmetic out, not to accept a regex over it. "The file is
un-importable" is a true statement that had been keeping computable logic untested.

---

## GAP-2 — `wrongWay === false` could not say which way the car faced — **CLOSED 2026-09-20**

**Closed in the PRODUCT, not in `tools/`** — by publishing `SimTick.edgeAlignment` from
`platform/src/modules/sim/runtime/worldRuntime.ts`. This entry stays in the register because
the gap is what the field's contract is *for*: delete the field and every row below reopens.

### What it could not measure

`tick.wrongWay` is computed under three gates — the edge is resolved, it is `oneway`, the car
is not off the carriageway, and either the district states its one-way streets *or* the edge is
a roundabout ring. Everything those gates do not arm publishes `wrongWay: false` as well. So
`false` meant **either** „the car faced the right way" **or** „nobody asked", and a reader
outside the rule engine could convict a drive on that channel but could never clear one.

`tools/mobile/lib/road-criteria.mjs` said the same thing from the other side (cheat L6, and
`againstFlow()` returned `false` for `wrongWay === false` with the comment „ambiguous"): *„A
criterion cannot invent a signal the product does not publish… that is a PRODUCT-CONTRACT
question."* **That half is now done too — see „The harness reads it" below.**

The ring is where it cost the most: **34 of 34 roundabout ring edges across all 106
`content/world/*.json` are `oneway`**, and on the two OSM districts `worldStatesOneWayStreets`
is false, so their one-way *streets* never arm the channel at all — only their ring edges do.

### What was published

`SimTick.edgeAlignment`, a record set on **every** tick the world runtime produces, from the
same lane fix, the same tangent and the same heading the verdict uses:

| member | meaning |
| --- | --- |
| `deg: number \| null` | **SIGNED** rotation FROM the committed edge's geometry-forward bearing TO the vehicle heading. **Degrees**, range **(-180, +180]**, `0 = north, clockwise` — the same convention as `SimTick.headingDeg`. `+` = the heading lies **clockwise of (to the right of)** the edge direction; `0` = exactly along `from`→`to`; `±180` = exactly against it. |
| `reason?: "no-edge-fix"` | present **iff** `deg === null`. The one null case: no committed edge fix (nothing within the locator's 30 m lock radius). There is deliberately no `degenerate-geometry` case — measured over all 106 shipped districts (876 edges) there is not one zero-length segment, shortest 0.2435 m, so it would be a branch no drive can enter. |
| `wrongWayArmed: boolean` | was the conviction channel **asked** on this tick. `false` ⇒ `wrongWay === false` carries no claim. Lifted out of the gate expression itself — one boolean, two readers — so it cannot drift. |
| `edgeId: string \| null` | the edge `deg` is measured against; `null` iff `deg === null`. **Not** `tick.edgeId`, which is nulled past the kerb while the angle still refers to a real edge. |
| `offCarriageway: boolean` | the predicate that disarms `wrongWay`. The angle is published anyway — suppressing it would recreate the same ambiguity one kerb over — so a road-referenced consumer filters on this. |
| `travelDir?: 1 \| -1` | present iff `deg !== null`. The occupied bank's nominal direction along the geometry; rotate `deg` by 180° when `-1` to read it bank-relative on a two-way road. **The record's only bank discriminator** — `laneOffsetM` is „+ = left of travel" on *both* banks, so it carries no bank — and it can only ever be `-1` on a two-way edge (`locator.ts computeLane` returns `+1` unconditionally on a one-way). |
| `roundabout?: boolean` | present iff `deg !== null`. Not otherwise published on the tick. |

### Reading it as a direction of TRAVEL — read `gear` with it

The founder's ruling asked for a travel-direction-vs-edge-direction value. What is published is
**heading**-vs-edge, because it has to be: `wrongWay` is a heading verdict, and the invariant
below — the thing that makes the observation trustworthy where the verdict is armed — only holds
if both measure the same quantity.

On a car going forwards the two coincide. On a car **reversing** they are opposite, and
`SimTick.speedKmh` is documented `>= 0` (unsigned), so **`SimTick.gear` is the only channel that
says so** (`-1` = reverse):

```
direction of travel ≈ (gear === -1 ? deg + 180 : deg)   (mod 360)
```

This is not a nicety for the reverse/park half of the authorised instrument, it is the whole
half: a car backing **lawfully** along its own lane reads `|deg| ≈ 180` on every frame
(measured — `edge-alignment.test.ts` §7, 41/41 ticks), so a criterion written on `deg` alone
convicts every correct reverse-park. `wrongWay` reads the nose the same way and **does** fire on
a lawful reverse around a ring where the channel is armed; that is the product's present
behaviour, it is unchanged by this entry, and it is the reason a consumer must join `gear`
rather than trusting either channel on its own.

**Three states that cannot collide:** the record **absent** = the tick did not come from the
world runtime (a hand-built unit-test tick, a recorded trace, a clip plan) and asserts nothing;
`deg === null` + `reason` = the runtime looked and could not measure; a number = measured.
`deg` is **never 0 for „unmeasured"** — 0 is the strongest possible „aligned".

**It grades nothing, and nothing may make it grade.** No rule, objective, card, score, HUD
field or debrief line reads it; `wrongWay` keeps its exact prior meaning and remains the only
conviction channel.

### The invariant

On every tick:

```
tick.wrongWay === (ea.wrongWayArmed && ea.deg !== null && Math.abs(ea.deg) > WRONG_WAY_ANGLE_DEG)
```

`WRONG_WAY_ANGLE_DEG` (120) is now **exported** from `worldRuntime.ts` so the test and any
consumer read the product's own threshold rather than restating it. The invariant holds by
construction: `isWrongWay` is `|signedDeltaDeg(headingDeg, forwardDeg)| > WRONG_WAY_ANGLE_DEG`
and `signedDeltaDeg(a,b)` is the exact negation of `signedDeltaDeg(b,a)` (both return `+180` at
exactly antiparallel), so the published angle is the unthresholded form of the same quantity.

### How it is defended — by execution, never by grep

| file | kills |
| --- | --- |
| `platform/src/modules/sim/runtime/__tests__/edge-alignment.test.ts` | the sign flip (`+30` read at a heading 30° clockwise of the flow — a magnitude assertion would not catch it), re-gating the observation behind the conviction, a `null → 0` collapse, `travelDir` hardcoded to `1`, `offCarriageway` hardcoded `false`, `edgeId` collapsed into `SimTick.edgeId`, deleted wiring, and any future drift from `wrongWay` |
| `platform/src/modules/sim/runtime/__tests__/edge-alignment-not-graded.test.ts` | any grading read: **five** real drives' tick streams are folded through the real `reduceTick` **and** the real `applyTick` three times — as published, stripped, and corrupted (**every** member lied about) — and the three must be deep-equal |
| `platform/src/components/sim/lesson-ui/__tests__/edge-alignment-not-in-hud.test.ts` | the third surface: `snapshotOf` copies named fields, so a HUD slip is invisible to both folds above |
| `platform/src/modules/sim/devrig/__tests__/edge-alignment-rig-record.test.ts` | the **dead-predicate** failure — the harness reads `DriveRigSample`, not `SimTick`, so the rig's named copy (plus `edgeId`, `laneId`, `oneway`, `wrongWay`, `opposingBank` and a per-frame `seq`) is pinned here, as is `DRIVE_RIG_VERSION` |

**The whole existing suite is a null control for this field** — nothing else in the tree
constructs it, so a sign flip or a collapsed null stays green everywhere but in these four
files. They are not extra assurance; they are the only assurance.

**And a guard is only as good as the state its material enters.** The first cut of these four
files was green while *four* deliberate defects were live in the tree, because every fixture in
all of them was a one-way edge, on the carriageway, measured, in forward gear:

| survived green | why the material could not see it |
| --- | --- |
| `travelDir: 1` hardcoded | no fixture was on a two-way edge, where `-1` is the only possible value |
| `offCarriageway: false` hardcoded on the measured branch | no fixture drove past a kerb while keeping a lane fix |
| `edgeId: offCarriageway ? null : id` | same — the one state where the two `edgeId`s differ was never entered |
| `rules/engine.ts` grading `edgeAlignment.offCarriageway`, `reason`, or `deg === null` | the not-graded fold perturbed 3 of 7 members and drove no off-carriageway, off-network or opposing-bank material |

Fixed by driving a **two-way** edge (`e672186635.0`), the far side of a **kerb**
(`e432951179.0` at +25 m), **off the network**, and in **reverse gear**; by making `corrupted()`
lie about all seven members; and by asserting both properties — state coverage and per-member
perturbation — rather than assuming them. `DRIVE_RIG_VERSION` moved `1 → 2` at the same time:
the record gained three *required* members, so „a dump with no `edgeAlignment`" needed a way to
mean „an older shape" rather than „the runtime published nothing".

### What this does NOT settle

- It publishes a **signal**, not a judgement. No open row closes on this change. What it
  removes is the reason ~30 rows — and the roundabout family in particular — could not be
  judged either way.
- The harness now **reads** it (2026-09-24, road-criteria R18), and that still closes no row.
  `againstFlow()` on the one-way surface reads `row.alignDeg` against the product's own mirrored
  `WRONG_WAY_ANGLE_DEG`, rotated 180° on `gear === -1`; a tick with no signed value is `null`
  (UNKNOWN), never `false`; and the two defences that existed only because the boolean was
  ambiguous — the liveness gate and the witness floor (R7/R12, with `longestWitnessRunSec` and
  `longestContiguousWitnessSec`) — are DELETED, retiring disclosures L6, L7 and L9. What still
  has to happen before a row moves is a real capture off `/dev/drive-rig`: every fixture in
  both criteria suites is synthetic (module L5), so the criteria are proven against rows this
  harness wrote, not against a drive.
- `tangentAt` fabricates a due-north tangent on a zero-length segment and that is
  indistinguishable from a real one. Unreachable on shipped content today (measured), but it is
  a silent fail-open the moment a district gains a duplicate vertex.

---

## Previously parked, recorded elsewhere

- **No seatbelt input** — 194 of 204 legs carried a false −3. The harness cannot fasten one.
- **No steering on `-wrong` legs** (withheld by doctrine at four sites) — ~40 rows unsettleable
  without a road-referenced antecedent. **The referent half of this is GAP-2 above**, closed
  2026-09-20: a `-wrong` leg can now be shown to have faced the wrong way, in signed degrees
  off the edge, whether or not the conviction channel was armed. The *steering* half — a leg
  that actually commits the offence — is untouched by that change.
- **No clutch or gear** — `sc-vp-stall` is permanently UNJUDGED. The gear key was deliberately
  *not* added: a key that fakes the act produces evidence about the harness, not the student.
- **WebKit has no WebAudio** in the bundled Playwright build — every mobile audio claim is
  UNJUDGED by construction; only pc legs judge audio.

## GAP-3 — the ten INSTRUMENT rows (`chunk-wavec-new.jsonl` 62–71), verified 2026-09-20

These rows were filed by a workflow that was stopped before anything checked them, and the
handoff carried them as **unverified** with the note that their measurements were two module
generations stale. They are `bucket: INSTRUMENT`, so `finding-reader.mjs:217` (which counts only
`bucket === "BROKEN"`) keeps them out of the open product arithmetic: **0 of the 90 open rows is
one of these**, measured, and closing or reopening one moves no product number.

Verified against `HEAD 5d56296` by EXECUTION — every verdict below names the test that produced
it in `tools/mobile/__tests__/road-criteria-cheats.test.mjs` (44 tests, 44 pass), not a reading of
the module. The suite's last case, *«the fixture still matches the recipe rows 62-67 carry»*, is
what retires the "stale measurements" worry: the fixture was rebuilt to the rows' own recipe.

| row | claim | verdict | the test that says so |
|---|---|---|---|
| 62 | only one contiguous run convicts, so chopping the offence under 0.6 s buys an unlimited amount | **DEAD** | `N1` (two-way, FRACTION rule) · `N15a` (one-way ring) |
| 63 | every duration comes from `tSec`, a field the record supplies, and so does the sample floor | **DEAD** | `N3a` frozen · `N3b` stuttering · `CLOCK-ONLY-a` · `CLOCK-ONLY-b` · plus an honest-leg control |
| 64 | the blindness census reads the longest single gap, never the total | **DEAD** | `N2` (2900 ms holes convicted in aggregate) · `N2 isolated` |
| 65 | AC-LANE counts six exclusion classes and its ceiling divides only two | **DEAD** | `N13` unpainted · `N17` not-moving · `N12` two parks |
| 66 | the record declares its own exemptions and nothing bounds them, in two places | **DEAD** | `N4` (leg-wide census) · `M5b` (the declaration goes over budget) |
| 67 | a row may contradict itself and the file resolves it in the acquitting direction | **DEAD** | `N14` · `N14 IN THE OTHER DIRECTION` |
| 68 | `wrongWay === false` is ambiguous; only the offence arms the channel — *awaiting a founder ruling* | **RESOLVED** | ruled 2026-09-20; built as `SimTick.edgeAlignment` in `eb0e016`; GAP-2 above. The `SEAM` test is the instrument's record of what it replaced |
| 69 | no test catches a **consumer-side WIDENING** of the pill guard | **STANDS** | not this module. `verdict-surface.test.mjs` grew three ADR-009 cases, but they cover *recognition* and *REMOVAL* («REMOVING the word from PILL_WORDS costs a DISAGREEMENT»). Widening — a consumer accepting more than it should — is still uncovered |
| 70 | addendum: «every one of the cheats is dead» | **SUPERSEDED** | it was wrong when written and row 71 corrects it; it is now *nearly* true, with L8 and L9 below the exceptions |
| 71 | one cheat is still live (N15b) | **STANDS, in a narrower form** | `N15b` is refused, and *«NO witness length passes this leg — the floor and the budget meet with no gap»* — but only for a **5.00 s** calibration park. `L9 (STILL LIVE, disclosed)` shrinks it to 4.50 s and the same 1.50 s witness passes |

**Two limits stay open ON PURPOSE and are asserted at the verdict they get, so a later repair reds
the suite rather than silently changing the answer:**

- **L8** — a leg can split its against-flow ticks across two surfaces, each honestly under its own
  ceiling, and stay under the derivable leg-wide mix bound (0.1770 against 0.201581). A tighter
  number would have to come from somewhere, and no product constant supplies one.
  `L8 CONTROL` proves the bound does bite when the mix cannot afford the total.
- **L9** — row 71's mechanism, reopened from the other end: the witness floor is defeated by
  SHRINKING the calibration rather than by lengthening the witness. The derivable fix is a 9 s
  calibration floor, and it would red the known-good leg's own 5.00 s park.

**What to do with these rows:** nothing, unless L8 or L9 is being worked. They are a register, not
a queue — a harness change closes no finding, and none of them was ever on the open list.

## RULING-1 — the pc-path leg may steer on the dev pose probe — **RATIFIED 2026-09-22**

**The question, as put to the founder.** To reverse into a bay the pc-path leg steers on
`window.__camProbe`, a pose readout that exists in development builds only and never in a student's
build. `lesson-audit.mjs`'s standing rule («WHY THE PIXELS, WHEN A CHEAPER SIGNAL EXISTS») is that the
probe may WITNESS a drive and never STEER it, because a loop closed around it could pass a lesson
whose visible guidance is broken. DESIGN-v2 §14.2 reserved the exception for him; the 2026-09-20
ruling to build the instrument never asked it, and `path-routing.json` refused to route any lesson
until it was answered.

**The answer: «Ratify, pc-path only».** The exception holds on pc-path legs and nowhere else, under
the limits `PATH_TESTIMONY` (`tools/mobile/lib/path-follow.mjs`) prints first on every artefact. A
pc-path leg MAY testify to whether the product CREDITS a park along a witness of the authored line,
the faults booked on that drive net of attribution, collisions as candidates, and the HUD /
ReverseAssist / debrief during it. It MAY NOT testify to guidance, legibility, lane choice or
route-keeping (the car is on the authored line by construction), the clearance of the authored line,
pass rates, a wrong drive, mobile/touch, or production builds. Those stay with the normal legs. The
rule text in `lesson-audit.mjs` is not rewritten; its five pointers now say «ratified».

**What it unlocked, measured the same night.** Real-browser canaries at `91e5a51`
(`.audit-frames/canary-path-91e5a51/frames/<lesson>__pc-path`, gated by `tools/audit/path-canary.mjs`):

| lesson | gates | product's own verdict on the park |
|---|---|---|
| sc-park-wall | G0–G10 PASS | 2/2 objectives, «приемливо», «ъгъл 4°» |
| sc-park-left | G0–G10 PASS | 2/2, «приемливо», 2° |
| sc-park-van | G0–G10 PASS | 2/2, «приемливо», 1.5° |
| sc-pk-driveway | G0–G10 PASS | 2/2, «приемливо», 0.5° |
| sc-park-zebra | G0–G10 PASS | 2/2, «центрирано», 5.4° |
| sc-park-gap-short | G0–G10 PASS | 2/2, «приемливо», 8.4° (cam yaw 7.97° agrees) |
| sc-park-judge | G7 FAIL (an authored stop NOT SERVED) | 2/2, «центрирано», 5.6° |
| sc-park-gap-long | G2/G3/G6 FAIL (no reverse arm found) | 2/2, «приемливо», 7.8° |
| sc-park-45-rev | G2/G3/G4/G6/G7 FAIL | 1/2 — the reverse went unmeasured, park NOT credited |

The six that passed every gate are routed (`canaryPassed: true`, 9 rows). judge, gap-long and 45-rev
stay unrouted until their canaries pass; sc-ed-poligon-chain was not canaried; sc-park-bay-exit-rev
is refused by design. **Routing closes nothing**: every routed row still has to be swept and judged,
and gap-short's credited heading has 0.5° of bench margin (T9.k), so one canary is one sample.

## RULING-2 — the forward half: extend the probe to a forward-steered leg, route position on the tick — **RATIFIED 2026-09-22**

Put to the founder the same day the parking half retired its first rows, as the two policy points
W59-STEERING-SPEC §9.2 reserved for him (`handoff-2026-09-20/reports/W59-STEERING-SPEC.md`):

1. **«Extend it».** The dev-only position readout may steer a NEW forward-steered leg (lane and curve
   holding on roads and roundabouts), under the same kind of printed testimony limits as pc-path:
   it may testify only whether the product GRADES a correct road drive fairly — never that guidance
   leads a student there, never lane choice or route-keeping as a student skill, never a wrong drive,
   never mobile or production. RULING-1 is not widened to any other leg by this.
2. **«On the grading tick».** Position along the route (`sM`) is published as an optional, additive
   `SimTick` field beside `laneOffsetM` — the precedent is the 2026-09-20 edge-alignment signal
   (eb0e016) — with a test pinning that no rule or detector reads it. Not a separate channel, not
   `/dev/drive-rig` only.

**Nothing is built yet.** The spec's two stop rules bind it: increment 1 must prove an oncoming-lane
pose is separable in the published record (`opposingBank`; `laneOffsetM` alone reads 0.0000 on both
banks), and increment 3 must make the unsteered negative control FAIL (AC-1) within budget, or the
work is parked with the measurement kept. Acceptance is `tools/mobile/lib/road-criteria.mjs`.

## GAP-4 — sc-park-bay-exit-rev cannot be planned robustly — **PARKED 2026-09-22**

The one pathref W59 §4.2.2 left unscreened. A re-plan (workflow `wf_0919eec8-6df`, scratch only,
NOT landed) found why it is refused: the authored reverse ends on a 3.03 m quarter arc this car
cannot turn (tightest reverse ≈ 4.2 m), and nothing inside the Slice 0 1.0 m / 15° end box clears
the 0.15 m body floor. Re-planned against what the product actually grades — Задача 1 is
`reachZone(1.0, −3.03) r 2.5` in reverse (templates-parking2.ts:989-994), then Задача 2 — it drove
20/20 bench seeds with both tasks credited in order. **It was refuted and parked anyway**, on
evidence:
- **Not reproducible, and ill-conditioned.** The committed pathref was built from a pinned fleet
  table; the repo's builder (`build-pathrefs.mjs`) sizes bodies from the shipped GLBs, which differ
  by ≤ 4.8e-5 m — and rebuilt that way the witness touches `lot-bay-4` on the bench. A 0.05 mm
  change in body extents moves the planned clearance 16 mm and flips F1 to contact on a seed.
- **The arm band fails its own screen**: 5 of 8 R0 corners, three into `lot-bay-4` (to −0.53 m),
  yet it is emitted at full width.
- **A policy change the planner may not make.** The 2026-09-16 policy note rejected a zone-only
  target as «satisfied without performing the manoeuvre … none of which a planner may decide».
- **The canary would refuse it by construction** (G7 measures the reverse end against the
  unreachable authored end, > 2 m away).
What would unpark it: a founder decision on the target (the product's Задача 1 zone vs the authored
end), then a plan with a clearance margin that survives GLB-vs-table extents (planned ≥ 0.25 m
held), a screened arm band, and a G7 rule for zone-graded ends. The row
`sc-park-bay-exit-rev:49af2940` stays open.

## GAP-5 — a source guard with a positional window cannot see an attribute

**Found** 2026-09-23 by the adversarial verifier of lane F, as a sabotage of its own
invention that SURVIVED a green 69/69.

The briefing-recall pill's gate is now an executed predicate
(`briefingRecallPillShown(stage)`), and every mutation of the gate itself dies. Both
guards that hold the shell to calling it read `CODE.slice(at - 700, at)` — the 700
characters before the `data-hud="briefing-recall"` anchor. So a suppression written
OUTSIDE that window is invisible to them: inserting `hidden={!compact}` immediately
AFTER the anchor leaves all 69 tests green.

That is exactly the production defect this lane exists to prevent —
`sc-signal-hesitation:f5ffccf3`, an element held in the tree and painted nowhere —
restored under a passing suite. It is a gap in the INSTRUMENT, not in the repair: the
round-1 finding was about the gate, and the gate is fixed. «Executed, not matched»
answers whether the predicate decides; it says nothing about whether the element
reaches the glass.

What would close it: a DOM render of the shell (assert the pill's computed
visibility, not its source), which needs a jsdom/testing-library the platform does
not have — or the existing route, a mobile leg photographed with the pill on the
glass. **Until then, no closure may rest on «the suite proves the pill paints».**
The same positional-window weakness applies to every other `slice(at - N, at)` guard
in the HUD tests; this is the first one measured.
