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

`tools/mobile/lib/road-criteria.mjs` says the same thing from the other side (cheat L6, and
`againstFlow()` returns `false` for `wrongWay === false` with the comment „ambiguous"): *„A
criterion cannot invent a signal the product does not publish… that is a PRODUCT-CONTRACT
question."*

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
- The harness still has to **read** it: a drive record must be captured off `/dev/drive-rig`
  and the flow criteria pointed at `edgeAlignment` instead of at the ambiguous `wrongWay`.
  Until that happens the rows stay open, per the standing rule at the top of this file.
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
