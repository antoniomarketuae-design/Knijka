/**
 * THE TASK CEILING, ROUND 11 — the reducer.
 *
 * A · F1 (round-10 verifier; the integrator's ruling for round 11, REFUTES — the
 * R1 class again). EVERY owner-scoped flag of the kin act (`ownerLapsed`,
 * `surfaceTask`, `surfaceCond`) describes the CURRENT owner, and `surfaceTask`
 * the CURRENT latch. Round 10 cleared only `ownerLapsed` when the bend took an
 * act over, so a `surfaceTask` raised under the weather owner for a waiting
 * latch outlived the latch's own absorbed bill and the escalation, and a graded
 * mark blown inside the LIVE bend act surfaced a free TASK card (the verifier's
 * ST2 family and its 288-programme grid, 288 of 288). Now:
 *  · the escalation puts all three down (ESC_T, ESC_C);
 *  · (the kept act's restore is NOT an owner change: the act comes back with its
 *    own owner, whose flags describe it and its latch — round 3's C3 still reads a
 *    lapse made before the act was kept, `task-cap-photographed` C4);
 *  · a new latch puts `surfaceTask` down (it was the old latch's breach);
 *  · the absorbed latch's own bill consumes it (F-ABSORBED; W17 below).
 * THE FLAG INVARIANT is driven over the verifier's grid and its controls, the
 * generated programmes of the property census and every witness here.
 *
 * B · W11 (F2): the kin-while-waiting path records EVERY waiting latch.
 * C · W8 (F3): the absorbed act ends only when the WHOLE continuous act —
 *     joined weather and bend episodes included — is over.
 * D · W17 (F4): the absorbed branch is tried before the surface branch.
 * E · TWO CLASSES THE PROPERTY CENSUS FOUND (`task-cap-property-census.test.ts`),
 *     both pre-existing, each pinned here by a hand witness of the seed's shape:
 *  · a later sign-bound blow on the very frame a weather or bend first bill
 *    lands no longer skips that bill (seeds 3547, 9504);
 *  · the named stretch of a WAITING arrival joins the wait, so a SPEEDING_* bill
 *    later in the same M-16 act absorbs the one act instead of billing beside a
 *    task card, and the stretch never names the act twice (seeds 1195, 9199, the
 *    27-seed P2 family).
 *    ROUND 12 (F-STRETCH, `task-cap-round12.test.ts`) SUPERSEDES this second class: a waiting arrival's first
 *    stamp now ENDS the wait and bills it there (the graded twin's rule), so the stretch never joins a wait; the
 *    STRETCH_* witnesses below are re-read to the round-12 bills, each marked, and the ST family's ≤50 arrival
 *    surfaces on its stamp. Still one task bill per act, never a second naming.
 * F · THE RESUMED LANE'S TWO SETTLEMENTS:
 *  · SF4 — the wait's verdict is read on EVERY frame, a blow frame included: a
 *    SPEEDING_* bill on the frame of a later sign-bound blow takes the waiting act
 *    there and then, so a drive that ENDS on that frame settles nothing beside it
 *    (END_SPEEDING_BLOW; the census's P7 and its speed-blow family answer the class);
 *  · W4 — the act that took a sign-bound arrival's bill lists every latch blown in
 *    it (TWO_ABSORPTIONS).
 *
 * Cases marked RED-ON-R10 were run RED on round 10's engine
 * (`scratchpad/cap/r11/red-on-r10*.txt`); cases marked RED-ON-R11-FIRST-CUT were
 * run RED on the first round-11 cut's engine (`scratchpad/cap/r11b/red-on-cut1*`);
 * the others pin behaviour already there and are proven by the mutant each kills
 * (`scratchpad/cap/r11b/mut-*`).
 *
 * ROUND 14 — RETIRED HERE: 17 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick, settlePendingTaskArrival, type RuleEngineState, type SimTick } from "..";
import { drive } from "./fixtures";
import { arr, generateProgramme, labels, prog, stamp, staleSurfaceGrid } from "./taskCapProgrammes";
import { CENSUS, NEW, ST, W11, W17A, W8_FOG70, W8_FOG70_CTRL } from "./taskCapWitnesses11";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const OVER = "SPEEDING_OVER_LIMIT";

const shown = (ev: string[]) => ev.filter((x) => !x.includes(">") && !x.includes(":rg"));
/** The state after the frames up to and including `t`. */
const stateAt = (f: SimTick[], t: number): RuleEngineState => drive(f.filter((x) => x.t <= t + 1e-9)).state;

// ---------------------------------------------------------------------------
// A · F1
// ---------------------------------------------------------------------------

// ROUND 14: «A · F1 — every owner-scoped flag describes the CURRENT owner, and `surfaceTask` the CURRENT latch» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// B · W11 — the kin-while-waiting path records EVERY waiting latch
// ---------------------------------------------------------------------------

// ROUND 14: «B · W11 (verifier F2) — a weather or bend bill that takes a waiting arrival takes EVERY latch that waited with it» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// C · W8 — the absorbed act ends only when the WHOLE continuous act is over
// ---------------------------------------------------------------------------

// ROUND 14: «C · W8 (verifier F3) — the act that absorbed a sign-bound arrival ends with the WHOLE continuous act, joined weather and bend episodes inclu» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// D · W17 — the absorbed branch is tried before the surface branch
// ---------------------------------------------------------------------------

// ROUND 14: «D · W17 (verifier F4) — a latch of the act that absorbed a sign-bound arrival bills absorbed even with a surface flag up for it» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// E · THE TWO CLASSES THE PROPERTY CENSUS FOUND
// ---------------------------------------------------------------------------

describe("E · the property census's findings — one act, one bill, whatever the order", () => {
  it("STRETCH_TWICE (census P1, seeds 1195 and 9199) — two stretches of the arrival's latch in ONE M-16 act: still ONE task bill, never a TASK naming at each stretch. ROUND 12 (F-STRETCH, disclosed): the one bill is the arrival's on its first stamp (1.1), not on the held correction (13.9); both stretches' first bills are its act carrying on — the second resumes the act kept with the latch (round 6)", () => {
    const { events } = drive(CENSUS.STRETCH_TWICE);
    const ev = labels(events);
    expect(shown(ev)).toEqual([`${TASK}@1.1`]);
    expect(ev.filter((x) => x.startsWith(TASK) && x.includes(">"))).toHaveLength(2);
    const bill = events.find((e) => e.kind === "violation" && e.code === TASK && e.absorbedBy === undefined);
    expect(bill?.kind === "violation" ? bill.signBoundArrival : undefined).toEqual({ arrivalKmh: 67.6, shownKmh: 60, postedKmh: 60 });
  });
  it("STRETCH_LONG — ROUND 12 (F-STRETCH, the verifier's case, disclosed): the ≤60 latch stamps 66 on a raised 65 for 14 s (over the sign's line, inside its grace band). The stamp at 1.1 ends the wait and bills the arrival there; the stretch's first bill (4.2) is its act's absorbed bill; its re-grade (10.2) is the act's one charge — the graded twin's act. Round 11 taught only at 19.1 and charged nothing; round 10 taught at 4.2 and charged at 10.2", () => {
    const ev = labels(drive(CENSUS.STRETCH_LONG).events);
    expect(ev).toEqual([`${TASK}@1.1`, `${TASK}>${TASK}@4.2`, `${TASK}:rg@10.2`]);
  });
});

// ROUND 14: «F · the resumed lane's two settlements — the wait's verdict on a blow frame (SF4), and the absorbed act's latch list (W4)» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// Stated for the census: a NEW mark (a new latch) blown inside a waiting act still takes the act's one bill (round 7).
describe("E · round 7 kept — a new mark's arrival inside a waiting act takes the act's one bill", () => {
  it("a graded ≤45 mark blown at 3.0 while a sign-bound ≤60 arrival waits: its arrival is shown at once and is the act's one bill", () => {
    const f = prog(
      [
        { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
        { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
        { from: 1.1, to: 3.0, v: 62, o: { maxSpeedKmh: 60 } },
        { from: 3.0, to: 3.1, v: 56, o: { maxSpeedKmh: 60, ...arr(45, 3.0, 56), ...stamp(45, 3.0) } },
        { from: 3.1, to: 15, v: 44, o: { maxSpeedKmh: 60, ...stamp(45, 3.0) } },
      ],
      {},
    );
    const { events, state } = drive(f);
    expect(shown(labels(events))).toEqual([`${TASK}@3`]);
    expect(state.taskArrivalPending).toBeNull();
    void createRuleEngine;
    void reduceTick;
  });
});
