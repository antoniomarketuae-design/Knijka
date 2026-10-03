/**
 * THE TASK CEILING, ROUND 7 — the reducer.
 *
 * B · A SIGN-BOUND ARRIVAL (round-6 verifier R2; founder ruling 4 in the
 * integrator's reading, binding for round 7): the arrival is billed at EVERY
 * blown cap mark, including a cap the glass shows at or above the sign; where a
 * SPEEDING_* bill also falls in that continuous act, the arrival and the
 * speeding are ONE act with ONE bill, never two charges for one act; and
 * CLEAN_DRIVING is never minted inside it.
 *
 * Passing such a mark over its cap is passing it over the sign (the arrival
 * line is the cap plus its slack, at or above the sign plus the same slack), so
 * the arrival is in the speeding act the car is already in. The SPEEDING_*
 * codes keep every bill they had. The arrival:
 *  · is ABSORBED (`absorbedBy` the speeding code) if the speeding has billed in
 *    that act — before the blow, on it, or later while the act runs;
 *  · WAITS (`taskArrivalPending`) while the act runs without a speeding bill,
 *    and no praise is paid out meanwhile;
 *  · is BILLED, once, as the task's first bill on the frame the act ends — ROUND
 *    8 (round-7 verifier R5): where M-16 ends the SPEEDING_* act, the car at or
 *    under the sign and HELD there `speedingRearmSec` (4 s), not the first frame
 *    back at it — carrying the blow it is for
 *    (`signBoundArrival`: the speed the mark was passed at, the cap the glass
 *    read, the sign);
 *  · merges with any other task first bill that falls inside the same act (a
 *    second sign-bound blow, a graded blow): one act, one bill.
 *
 * C · THE F7 EDGE (round-6 verifier C1, part 1): the arrival is judged against
 * the weather act as its BLOW frame left it — the frame before the one the
 * lesson latches — so a car dropping under the weather line on the latch frame
 * no longer turns a blow inside an act already named into a second, surfaced
 * card.
 *
 * Every case was run RED on round 6 (`scratchpad/cap/r7/red-on-r6*.txt`) except
 * the ones marked GUARD.
 *
 * ROUND 14 — RETIRED HERE: 8 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
import { settlePendingTaskArrival, type RuleEvent, type SimTick, type ViolationEvent } from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const OVER = "SPEEDING_OVER_LIMIT";
const DANGER = "SPEEDING_DANGEROUS";

type Arrival = { capKmh: number; shownKmh: number; graceKmh: number; blownAtSec: number; arrivalKmh: number };
type Seg = { sec: number; speedKmh: number; over?: Partial<SimTick> & { taskCapArrival?: Arrival } };
function frames(segs: Seg[], base: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (const s of segs) {
    const n = Math.max(1, Math.round(s.sec / DT));
    for (let i = 0; i < n; i++) {
      out.push(tick(Math.round(t * 10) / 10, { maxSpeedKmh: 50, ...base, speedKmh: s.speedKmh, ...s.over } as Partial<SimTick>));
      t += DT;
    }
  }
  return out;
}
const at = (arrival: Arrival, speedKmh: number, over: Partial<SimTick> = {}): Seg => ({
  sec: DT,
  speedKmh,
  over: { ...over, taskCapArrival: arrival } as Seg["over"],
});
const viol = (events: RuleEvent[]) => events.filter((e): e is ViolationEvent => e.kind === "violation");
/** What a lesson acts on: absorbed first bills are dropped before the coach. */
const named = (events: RuleEvent[]) =>
  viol(events)
    .filter((e) => e.absorbedBy === undefined)
    .map((e) => `${e.code}${e.regrade === true ? ":regrade" : ""}${(e as unknown as { kinSurface?: string }).kinSurface !== undefined ? ":surface" : ""}`);
const taskFirst = (events: RuleEvent[]) =>
  viol(events).filter((e) => e.code === TASK && e.absorbedBy === undefined && e.regrade !== true);
const praise = (events: RuleEvent[]) => events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t);

/**
 * A ≤50 task on a posted-50 road: the glass cap EQUALS the sign (the motorway
 * «≤140» on a 140 is the same shape). Blown at 58 — over the arrival line 55,
 * and over the speeding's graced line 55 on this road.
 */
const SIGN50 = (blownAtSec: number, arrivalKmh = 58): Arrival => ({
  capKmh: 50,
  shownKmh: 50,
  graceKmh: 5,
  blownAtSec,
  arrivalKmh,
});

describe("B · the sign-bound arrival — one act with the speeding, one bill", () => {
  it("back at the sign on the latch frame, no speeding bill in the act: ONE task first bill when that correction has been held 4 s (M-16, round 8), carrying the blow (speed, cap, sign)", () => {
    const f = frames([{ sec: 3, speedKmh: 45 }, { sec: DT, speedKmh: 58 }, at(SIGN50(3.1), 48), { sec: 5, speedKmh: 45 }]);
    const { events } = drive(f);
    expect(named(events)).toEqual([TASK]);
    const b = taskFirst(events)[0];
    // The correction starts at 3.1; 7.1 − 3.1 is 3.9999… in binary floating
    // point, exactly as the reducer's own `t − resetSince >= speedingRearmSec`
    // sees it, so the first frame with 4 s held is 7.2.
    expect(b.t).toBe(7.2);
    expect(b.signBoundArrival).toEqual({ arrivalKmh: 58, shownKmh: 50, postedKmh: 50 });
  });

  it("over the sign but under the speeding's line after the blow (53 for 20 s): NOTHING bills and NO praise is paid while the act runs; the arrival is billed when the correction has been held 4 s (M-16, round 8)", () => {
    const f = frames([
      { sec: 2, speedKmh: 45 },
      { sec: 1, speedKmh: 58 },
      at(SIGN50(3), 53),
      { sec: 20, speedKmh: 53 },
      { sec: 5, speedKmh: 48 },
    ]);
    const { events, state } = drive(f);
    expect(named(events)).toEqual([TASK]);
    const b = taskFirst(events)[0];
    expect(b.t).toBe(27.1);
    // 53 km/h for 20 s is ~294 m — past the 250 m payout — and none of it paid in the act.
    expect(praise(events).filter((t) => t >= 3 && t <= 27.1)).toEqual([]);
    expect(state.taskArrivalPending).toBeNull();
  });

  it("a SECOND sign-bound blow inside the same act (the next mark, still over the sign): ONE bill for the act", () => {
    const f = frames([
      { sec: 2, speedKmh: 45 },
      { sec: 1, speedKmh: 58 },
      at(SIGN50(3), 53),
      { sec: 5, speedKmh: 53 },
      at(SIGN50(8.1, 57), 53),
      { sec: 5, speedKmh: 53 },
      { sec: 5, speedKmh: 48 },
    ]);
    const { events } = drive(f);
    expect(named(events)).toEqual([TASK]);
    // …where the act ends (the correction from 13.2 held 4 s, round 8) — not at the second blow.
    expect(taskFirst(events)[0].t).toBe(17.2);
  });

  it("a GRADED blow inside the act a sign-bound arrival is waiting in: the graded bill is the act's one bill — no second one when the car is back at the sign", () => {
    const graded: Arrival = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 8.1, arrivalKmh: 53 };
    const f = frames([
      { sec: 2, speedKmh: 45 },
      { sec: 1, speedKmh: 58 },
      at(SIGN50(3), 53),
      { sec: 5, speedKmh: 53 },
      at(graded, 53),
      { sec: 5, speedKmh: 53 },
      { sec: 5, speedKmh: 48 },
    ]);
    const { events, state } = drive(f);
    expect(taskFirst(events)).toHaveLength(1);
    expect(taskFirst(events)[0].t).toBe(8.1);
    expect(state.taskArrivalPending).toBeNull();
  });

  it("a cap ABOVE the sign (the glass «≤33» on a posted 30): the same act — billed when the car has been back at the sign 4 s (round 8), saying all three numbers", () => {
    const a: Arrival = { capKmh: 33, shownKmh: 33, graceKmh: 5, blownAtSec: 3, arrivalKmh: 38.2 };
    const f = frames([{ sec: 2, speedKmh: 28 }, { sec: 1, speedKmh: 38.2 }, at(a, 32), { sec: 1, speedKmh: 32 }, { sec: 5, speedKmh: 28 }], {
      maxSpeedKmh: 30,
    });
    const { events } = drive(f);
    expect(named(events)).toEqual([TASK]);
    expect(taskFirst(events)[0].signBoundArrival).toEqual({ arrivalKmh: 38.2, shownKmh: 33, postedKmh: 30 });
    expect(taskFirst(events)[0].t).toBe(8.1);
  });

  it("the drive ends inside the act: `settlePendingTaskArrival` hands the ending the arrival's one bill; an act already billed hands nothing", () => {
    const f = frames([{ sec: 2, speedKmh: 45 }, { sec: 1, speedKmh: 58 }, at(SIGN50(3), 53), { sec: 5, speedKmh: 53 }]);
    const { state, events } = drive(f);
    expect(named(events)).toEqual([]);
    const bill = settlePendingTaskArrival(state, { t: 8.1 });
    expect(bill?.code).toBe(TASK);
    expect(bill?.t).toBe(8.1);
    expect(bill?.signBoundArrival).toEqual({ arrivalKmh: 58, shownKmh: 50, postedKmh: 50 });
    // Round 8: a drive that ends 2 s after the car is back at the sign ends INSIDE
    // the act (the correction is not held yet): the ending settles its one bill…
    const short = drive(frames([{ sec: 2, speedKmh: 45 }, { sec: 1, speedKmh: 58 }, at(SIGN50(3), 48), { sec: 2, speedKmh: 45 }]));
    expect(named(short.events)).toEqual([]);
    expect(settlePendingTaskArrival(short.state, { t: 5 })?.code).toBe(TASK);
    // …and an act that ended (the correction held 4 s) has its bill already: nothing is handed over.
    const done = drive(frames([{ sec: 2, speedKmh: 45 }, { sec: 1, speedKmh: 58 }, at(SIGN50(3), 48), { sec: 5, speedKmh: 45 }]));
    expect(named(done.events)).toEqual([TASK]);
    expect(settlePendingTaskArrival(done.state, { t: 8 })).toBeNull();
  });

  it("GUARD — a graded arrival (the glass cap UNDER the sign) is billed on the latch frame without waiting, and carries no sign-bound mark", () => {
    const graded: Arrival = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 3, arrivalKmh: 40 };
    const f = frames([{ sec: 2, speedKmh: 28 }, { sec: 1, speedKmh: 40 }, at(graded, 40), { sec: 5, speedKmh: 28 }]);
    const { events } = drive(f);
    expect(named(events)).toEqual([TASK]);
    expect(taskFirst(events)[0].t).toBe(3);
    expect(taskFirst(events)[0].t).toBe(graded.blownAtSec);
    expect(taskFirst(events)[0].signBoundArrival).toBeUndefined();
  });
});

// ROUND 14: «C · the F7 edge — the arrival reads its BLOW frame's weather act» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.
