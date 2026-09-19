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

## Previously parked, recorded elsewhere

- **No seatbelt input** — 194 of 204 legs carried a false −3. The harness cannot fasten one.
- **No steering on `-wrong` legs** (withheld by doctrine at four sites) — ~40 rows unsettleable
  without a road-referenced antecedent.
- **No clutch or gear** — `sc-vp-stall` is permanently UNJUDGED. The gear key was deliberately
  *not* added: a key that fakes the act produces evidence about the harness, not the student.
- **WebKit has no WebAudio** in the bundled Playwright build — every mobile audio claim is
  UNJUDGED by construction; only pc legs judge audio.
