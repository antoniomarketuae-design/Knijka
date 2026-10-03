/**
 * THE TASK CEILING, ROUND 5 — the reducer half.
 *
 * FOUNDER RULING 2026-09-26, «Bill the arrival» (register item 17, ruling 4):
 * for a cap that only asks the student to ARRIVE at a point at ≤N — the
 * zone-default objectives, whose named stretch is the capped zone itself and
 * which ruling 2 had left unbillable because the car is past the point in
 * under the task code's 3 s sustain — passing the mark over the cap IS the
 * offence. It is billed as ONE EVENT at the blow: a teach card the first time
 * (the per-topic first-fault grace, ruling 16), a point on a repeat. The blow
 * line is the product's own, cap + REACH_ZONE_CAP_SLACK_KMH. One act, one
 * bill: an arrival followed by sustained over-cap driving on the named
 * stretch, or a kin code's breach in the same continuous act, is ONE act and
 * ONE bill.
 *
 * The lesson engine stamps `SimTick.taskCapArrival` on the frame its latch is
 * created (`lessons/engine.ts stepTaskCapLatch`); these cases hand the reducer
 * that stamp directly, so they pin the reducer's own contract: one first bill
 * per latch, never below the blow line, named and absorbed by the kin ledger
 * exactly like the sustained code's first bill, never settled at the end.
 *
 * Also here, two base guards the round-4 verifier found no test for (its
 * surviving mutants N12 and N13): a dip into the bend's grace band is not a
 * correction, and the speeding settlement does not bill a car that is
 * reversing on its last tick.
 *
 * Every ruling-4 case was run RED on round 4 (`scratchpad/cap/r5/red-r4-*.txt`)
 * except the ones marked GUARD. The N12 and N13 blocks pin BASE behaviour and
 * pass on round 4 by design: they exist so that those two sabotages fail.
 *
 * ROUND 14 — RETIRED HERE: 4 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
import {
  settleUnpaidAdaptationTeach,
  settleUnpaidTaskTeach,
  settleUnpaidSpeedingTeach,
  type RuleEvent,
  type SimTick,
  type TaskSpeedCap,
  type ViolationEvent,
} from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const rain = { rain: true };

/** The arrival stamp the lesson engine writes on the latch's first frame. */
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
/** One frame carrying the arrival stamp (and, when given, the latch's first stamp). */
const at = (arrival: Arrival, speedKmh: number, over: Partial<SimTick> = {}): Seg => ({
  sec: DT,
  speedKmh,
  over: { ...over, taskCapArrival: arrival } as Seg["over"],
});
const viol = (events: RuleEvent[]) => events.filter((e): e is ViolationEvent => e.kind === "violation");
/** Bills a lesson would act on: absorbed first bills are dropped before the coach. */
const named = (events: RuleEvent[]) =>
  viol(events)
    .filter((e) => e.absorbedBy === undefined)
    .map((e) => `${e.code}${e.regrade === true ? ":regrade" : ""}${(e as unknown as { kinSurface?: string }).kinSurface !== undefined ? ":surface" : ""}`);

/** A ≤30 zone cap on a posted-50 street, blown at 45 at t = 2.0. */
const ZONE30 = (blownAtSec: number, arrivalKmh: number): Arrival => ({
  capKmh: 30,
  shownKmh: 30,
  graceKmh: 5,
  blownAtSec,
  arrivalKmh,
});

describe("ruling 4 · the arrival is ONE event at the blow", () => {
  it("an arrival stamp over the blow line (45 through ≤30 + 5) bills exactly one plain TASK first bill, on that frame", () => {
    const fs = frames([{ sec: 2, speedKmh: 40 }, at(ZONE30(2, 45), 45), { sec: 5, speedKmh: 45 }]);
    const { events } = drive(fs);
    const bills = viol(events);
    expect(bills.map((e) => e.code)).toEqual([TASK]);
    expect(bills[0].t).toBe(2);
    expect(bills[0].regrade).toBeUndefined();
    expect(bills[0].absorbedBy).toBeUndefined();
    expect((bills[0] as unknown as { kinOwner?: string }).kinOwner).toBeUndefined();
    expect((bills[0] as unknown as { kinSurface?: string }).kinSurface).toBeUndefined();
  });

  it("the same latch's arrival stamp seen again is not a second bill (one event per blow)", () => {
    const a = ZONE30(2, 45);
    const fs = frames([{ sec: 2, speedKmh: 40 }, at(a, 45), at(a, 45), at(a, 45), { sec: 3, speedKmh: 45 }]);
    expect(viol(drive(fs).events).map((e) => e.code)).toEqual([TASK]);
  });

  it("the blow line is the product's own: an arrival AT cap + grace (35.0) bills nothing, 35.1 bills", () => {
    expect(viol(drive(frames([{ sec: 2, speedKmh: 30 }, at(ZONE30(2, 35), 35), { sec: 2, speedKmh: 30 }])).events)).toEqual([]);
    expect(
      viol(drive(frames([{ sec: 2, speedKmh: 30 }, at(ZONE30(2, 35.1), 35.1), { sec: 2, speedKmh: 30 }])).events).map(
        (e) => e.code,
      ),
    ).toEqual([TASK]);
  });

  it("a NEW blow (a new latch name) is a new event — the repeat the coach charges", () => {
    const fs = frames([
      { sec: 2, speedKmh: 40 },
      at(ZONE30(2, 45), 45),
      { sec: 6, speedKmh: 25 },
      at(ZONE30(8.1, 45), 45),
      { sec: 2, speedKmh: 25 },
    ]);
    const bills = viol(drive(fs).events);
    expect(bills.map((e) => [e.code, e.t])).toEqual([
      [TASK, 2],
      [TASK, 8.1],
    ]);
  });

  it("GUARD — never below the arrival: a drive with no arrival stamp and no task stamp bills no TASK, lawful or fast", () => {
    for (const v of [30, 45, 70]) {
      expect(viol(drive(frames([{ sec: 10, speedKmh: v }])).events).filter((e) => e.code === TASK)).toEqual([]);
    }
  });

  it("GUARD — the settlement never turns an arrival-only act into a charge at the end", () => {
    const fs = frames([{ sec: 2, speedKmh: 40 }, at(ZONE30(2, 45), 45), { sec: 1, speedKmh: 45 }]);
    const { state } = drive(fs);
    expect(settleUnpaidTaskTeach(state, fs[fs.length - 1])).toBeNull();
    expect(settleUnpaidAdaptationTeach(state, fs[fs.length - 1])).toEqual([]);
  });
});

describe("ruling 4 · one act, one bill", () => {
  it("an arrival followed by sustained over-cap driving on the named stretch: the sustained first bill is ABSORBED, and the act carries ONE charge (its re-grade)", () => {
    // The latch stamps the tick for the whole stretch (a slow ≤20 zone crossed
    // at 30 for 12 s): the task episode accrues its 3 s and its 9 s.
    const cap: TaskSpeedCap = { capKmh: 20, shownKmh: 20, graceKmh: 5, blownAtSec: 2 };
    const arr: Arrival = { capKmh: 20, shownKmh: 20, graceKmh: 5, blownAtSec: 2, arrivalKmh: 30 };
    const fs = frames([
      { sec: 2, speedKmh: 18 },
      at(arr, 30, { taskSpeedCap: cap }),
      { sec: 12, speedKmh: 30, over: { taskSpeedCap: cap } },
    ]);
    const { events } = drive(fs);
    // The arrival names the act; the sustained first bill names nothing.
    expect(viol(events).filter((e) => e.code === TASK && e.regrade !== true && e.absorbedBy === TASK).length).toBe(1);
    expect(named(events)).toEqual([TASK, `${TASK}:regrade`]);
  });

  it("GUARD — a separate act later (the car back under every line in between) is billed on its own", () => {
    const fs = frames([
      { sec: 2, speedKmh: 40, over: rain },
      at(ZONE30(2, 41), 41, rain),
      { sec: 6, speedKmh: 30, over: rain },
      { sec: 10, speedKmh: 55, over: rain },
    ]);
    const { events } = drive(fs);
    expect(named(events)).toEqual([TASK, COND, `${COND}:regrade`]);
  });
});

describe("N12 — a dip into the bend's grace band is not a correction (base line, re-emitted by round 3)", () => {
  const bend = { curveAdvisoryKmh: 50, edgeId: "e-bend", maxSpeedKmh: 90 };
  it("60 → 53 (inside advisory + 5) → 60 in one bend is ONE bend bill, not two", () => {
    const fs = frames([
      { sec: 2, speedKmh: 60, over: bend },
      { sec: 1, speedKmh: 53, over: bend },
      { sec: 3, speedKmh: 60, over: bend },
    ]);
    expect(viol(drive(fs).events).map((e) => e.code)).toEqual([CURVE]);
  });
  it("…and a drive that dipped into the band and ended over it in the bend still owes the taught bend its settlement (ruling 3)", () => {
    const fs = frames([
      { sec: 2, speedKmh: 60, over: bend },
      { sec: 1, speedKmh: 53, over: bend },
      { sec: 1, speedKmh: 60, over: bend },
    ]);
    const { state } = drive(fs);
    expect(settleUnpaidAdaptationTeach(state, fs[fs.length - 1]).map((e) => e.code)).toEqual([CURVE]);
  });
  it("GUARD — back AT the advisory is a correction: a new episode bills again", () => {
    const fs = frames([
      { sec: 2, speedKmh: 60, over: bend },
      { sec: 1, speedKmh: 50, over: bend },
      { sec: 3, speedKmh: 60, over: bend },
    ]);
    expect(viol(drive(fs).events).map((e) => e.code)).toEqual([CURVE, CURVE]);
  });
});

describe("N13 — the speeding settlement does not bill a car reversing on its last tick (base A12 guard)", () => {
  // Posted 20 (a living-street figure): graded above 22, опасна above 30.
  // Taught at 25 (2 s sustain), then braked to a stop and reversing at 25
  // within the 4 s re-arm, so nothing re-armed and the taught flag stands.
  const segs = (endKmh: number): Seg[] => [
    { sec: 3, speedKmh: 25, over: { maxSpeedKmh: 20 } },
    { sec: 0.3, speedKmh: 15, over: { maxSpeedKmh: 20 } },
    { sec: 0.3, speedKmh: 5, over: { maxSpeedKmh: 20 } },
    { sec: 0.3, speedKmh: 0, over: { maxSpeedKmh: 20 } },
    { sec: 0.5, speedKmh: -10, over: { maxSpeedKmh: 20, gear: -1 } },
    { sec: 0.5, speedKmh: endKmh, over: { maxSpeedKmh: 20, gear: endKmh < 0 ? -1 : 1 } },
  ];
  it("reversing at 25 on the last tick: nothing is settled", () => {
    const fs = frames(segs(-25));
    const { state } = drive(fs);
    expect(state.speedingMinor.emitted).toBe(true);
    expect(settleUnpaidSpeedingTeach(state, fs[fs.length - 1])).toBeNull();
  });
  it("GUARD — the same drive back over the band FORWARD on its last tick is settled", () => {
    const fs = frames([...segs(-10).slice(0, 4), { sec: 1, speedKmh: 25, over: { maxSpeedKmh: 20 } }]);
    const { state } = drive(fs);
    expect(settleUnpaidSpeedingTeach(state, fs[fs.length - 1])).toMatchObject({ code: "SPEEDING_OVER_LIMIT", regrade: true });
  });
});
