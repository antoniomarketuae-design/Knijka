/**
 * TASK_SPEED_CAP_EXCEEDED, ROUND 3 — the reducer half of the verifier's
 * refutation of round 2 (founder ruling 2026-09-25, register item 17). Every
 * case was run RED on round 2 except the pins marked GUARD, which pin what
 * round 2 already did right so the repairs cannot move it.
 *
 *   R2  a stamp that vanishes for a moment — the stretch's edge, the
 *       objective's fresh-approach reset — must not end a billed act; a NEW
 *       latch (`blownAtSec`) is a new act at once;
 *   R3  the finish-time settlement bills a code only after THAT code's own
 *       first bill (the teach) was shown in the act — the shape of
 *       `settleUnpaidSpeedingTeach` (0e58070) — including the hand-over arm;
 *   R4  the blow at the mark voids the clean-driving window in progress (the
 *       one that covers the mark), even when the breach never runs its sustain;
 *   C1  no settlement of the conditions code in an act no task took part in;
 *   C3  a new breach of a different kin ceiling after the owner fell back
 *       inside its own bill line surfaces its card (`kinSurface`);
 *   V13 GATE 2's `conditionsSpeed` entry, which no test pinned.
 *
 * ROUND 14 — RETIRED HERE: 7 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
import { settleUnpaidTaskTeach, type RuleEvent, type SimTick, type TaskSpeedCap, type ViolationEvent } from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
/** The spray's ≤80 at L3, latched (blown) at t = 0. */
const SPRAY: TaskSpeedCap = { capKmh: 80, shownKmh: 80, graceKmh: 5, blownAtSec: 0 };
const rain = { rain: true, headlights: "low" as const };

type Seg = { sec: number; speedKmh: number; over?: Partial<SimTick> };
function frames(segs: Seg[], base: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (const s of segs) {
    const n = Math.round(s.sec / DT);
    for (let i = 0; i < n; i++) {
      out.push(tick(Math.round(t * 10) / 10, { maxSpeedKmh: 140, ...base, speedKmh: s.speedKmh, ...s.over }));
      t += DT;
    }
  }
  return out;
}
const violations = (events: RuleEvent[]) => events.filter((e): e is ViolationEvent => e.kind === "violation");
/** Bills that NAME, SURFACE or CHARGE something — absorbed first bills excluded. */
function bills(events: RuleEvent[], code = TASK) {
  return violations(events)
    .filter((e) => e.code === code && e.absorbedBy === undefined)
    .map((e) => ({
      t: Math.round(e.t * 10) / 10,
      regrade: e.regrade === true,
      ...((e as unknown as { kinOwner?: string }).kinOwner !== undefined ? { kinOwner: (e as unknown as { kinOwner?: string }).kinOwner } : {}),
      ...((e as unknown as { kinSurface?: string }).kinSurface !== undefined ? { kinSurface: (e as unknown as { kinSurface?: string }).kinSurface } : {}),
    }));
}
const absorbed = (events: RuleEvent[], code: string) =>
  violations(events)
    .filter((e) => e.code === code && e.absorbedBy !== undefined)
    .map((e) => e.absorbedBy);
const clean = (ev: RuleEvent[]) =>
  ev.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => Math.round(e.t * 10) / 10);
const last = (segs: Seg[]) => {
  const fs = frames(segs);
  const { state } = drive(fs);
  return { state, tick: fs[fs.length - 1] };
};

// ===========================================================================
// R2 — A FLICKER OF THE SAME LATCH IS NOT A NEW ACT
// ===========================================================================

describe("R2 — the stamp flickering off for a moment does not end a billed act", () => {
  it("billed (5 s at 110), the stamp gone for 1 s, back for 20 s: ONE first bill and ONE re-grade — never a second act", () => {
    const { events } = drive(
      frames([
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 1, speedKmh: 110 },
        { sec: 20, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    expect(bills(events).map((b) => b.regrade)).toEqual([false, true]);
  });

  it("…and the same for a 3.9 s gap — the correction's own hold (speedingRearmSec) is the only thing that ends it", () => {
    const { events } = drive(
      frames([
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 3.9, speedKmh: 110 },
        { sec: 20, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    expect(bills(events).filter((b) => !b.regrade)).toHaveLength(1);
  });

  it("GUARD — absent for longer than the hold (5 s), the act has ended: the next breach is named afresh", () => {
    const { events } = drive(
      frames([
        { sec: 12, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 5, speedKmh: 110 },
        { sec: 20, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    expect(bills(events).filter((b) => !b.regrade)).toHaveLength(2);
  });

  it("a NEW latch (a later blow, `blownAtSec` moved) is a new act at once, however short the gap", () => {
    const { events } = drive(
      frames([
        { sec: 12, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 0.5, speedKmh: 110 },
        { sec: 20, speedKmh: 110, over: { taskSpeedCap: { ...SPRAY, blownAtSec: 12.5 } } },
      ]),
    );
    const firsts = bills(events).filter((b) => !b.regrade);
    expect(firsts.map((b) => b.t)).toEqual([3, 15.5]);
  });
});

// ===========================================================================
// R3 — THE SETTLEMENT BILLS A CODE ONLY AFTER ITS OWN TEACH
// ===========================================================================

describe("R3 — settleUnpaidTaskTeach needs the settled code's own teach in this act", () => {
  it("the conditions code names the act BEFORE the mark (no stamp); 1 s over the task line after it, ended at 110: nothing (TASK was never taught)", () => {
    const { state, tick: t } = last([
      { sec: 4, speedKmh: 125, over: rain },
      { sec: 1, speedKmh: 110, over: { ...rain, taskSpeedCap: SPRAY } },
    ]);
    expect(settleUnpaidTaskTeach(state, t)).toBeNull();
  });

  it("GUARD — the task named and taught the act and the drive ends still over: its own withheld charge is settled", () => {
    const { state, tick: t } = last([{ sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } }]);
    expect(settleUnpaidTaskTeach(state, t)).toMatchObject({ code: TASK, regrade: true });
  });

  it("GUARD — taught, then a held correction ended the task's episode; back over for < 3 s at the end: nothing (the new episode has shown nothing)", () => {
    const { state, tick: t } = last([
      { sec: 5, speedKmh: 110, over: { ...rain, taskSpeedCap: SPRAY } },
      { sec: 5, speedKmh: 75, over: { ...rain, taskSpeedCap: SPRAY } },
      { sec: 2, speedKmh: 110, over: { ...rain, taskSpeedCap: SPRAY } },
    ]);
    expect(settleUnpaidTaskTeach(state, t)).toBeNull();
  });
});

// ===========================================================================
// C1 — NO CONDITIONS SETTLEMENT WHERE NO TASK TOOK PART
// ===========================================================================

// ROUND 4: the founder answered round 3's C1 question «Yes, same as speeding» —
// such an act IS now settled, by `settleUnpaidAdaptationTeach`
// (rules/__tests__/task-cap-round4.test.ts). What stays true, and is pinned
// here, is that `settleUnpaidTaskTeach` (the task-act settlement) never does it.
describe("C1 — an act no task stamp touched is never settled by settleUnpaidTaskTeach (round 4: settleUnpaidAdaptationTeach owns it)", () => {
  it("the conditions code taught, still over the envelope when the drive ends: nothing — base never settled this code", () => {
    const { state, tick: t } = last([{ sec: 5, speedKmh: 127, over: rain }]);
    expect(settleUnpaidTaskTeach(state, t)).toBeNull();
  });
  it("…and the same in fog, snow and at night", () => {
    for (const w of [{ fog: true }, { snow: true }, { isNight: true }] as Array<Partial<SimTick>>) {
      const { state, tick: t } = last([{ sec: 5, speedKmh: 49, over: { ...w, maxSpeedKmh: 50 } }]);
      expect(settleUnpaidTaskTeach(state, t)).toBeNull();
    }
  });
});

// ===========================================================================
// R4 — THE BLOW AT THE MARK VOIDS THE WINDOW THAT COVERS IT
// ===========================================================================

describe("R4 — a new task latch voids the clean-driving window in progress", () => {
  it("238 m banked, then the ≤80 is latched and the car is back UNDER the task line at once: no commendation until a whole fresh 250 m past the latch", () => {
    // 110 for 7.8 s ≈ 238 m banked; then 70 under a stamp — nothing is billed
    // (70 is under the task's line), yet the window that spans the blow is not
    // a clean one: the blow IS the breach, measured by the objective.
    const run = drive(
      frames([
        { sec: 7.8, speedKmh: 110 },
        { sec: 20, speedKmh: 70, over: { taskSpeedCap: { ...SPRAY, blownAtSec: 7.8 } } },
      ]),
    );
    expect(violations(run.events)).toEqual([]);
    // 250 m at 70 km/h is 12.86 s: the first payout is no earlier than 7.8 + 12.8.
    expect(clean(run.events).filter((t) => t >= 7.8 && t < 20.6)).toEqual([]);
    expect(clean(run.events).some((t) => t >= 20.6)).toBe(true);
    // CONTROL — the same speeds with no stamp pay out the banked window at once.
    const free = drive(frames([{ sec: 7.8, speedKmh: 110 }, { sec: 20, speedKmh: 70 }]));
    expect(clean(free.events).some((t) => t >= 7.8 && t < 9)).toBe(true);
  });

  it("the SAME latch coming back after a gap does not void a second time (only a new blow is a new breach)", () => {
    const again = drive(
      frames([
        { sec: 5, speedKmh: 70, over: { taskSpeedCap: SPRAY } },
        { sec: 1, speedKmh: 70 },
        { sec: 10, speedKmh: 70, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    // 16 s at 70 km/h ≈ 311 m: one payout at 250 m (~12.9 s), from the first latch frame.
    expect(clean(again.events)).toHaveLength(1);
    expect(clean(again.events)[0]).toBeGreaterThan(12.5);
    expect(clean(again.events)[0]).toBeLessThan(13.5);
  });
});

// ===========================================================================
// C3 — A SEPARATE BREACH IS NEVER SWALLOWED WITHOUT ITS CARD
// ===========================================================================

// ROUND 14: «C3 — a new breach of a different kin ceiling after the owner fell back inside its own bill line surfaces» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ===========================================================================
// V13 — GATE 2's conditionsSpeed ENTRY
// ===========================================================================

describe("V13 — GATE 2 holds the payout while the weather envelope is breached and has not run its sustain", () => {
  it("238 m banked at 110 in the rain, then 2 s at 125 (over 119, under the 3 s sustain), then 110: the 250th metre is paid only after the car is back inside", () => {
    const run = drive(
      frames(
        [
          { sec: 7.8, speedKmh: 110 },
          { sec: 2, speedKmh: 125 },
          { sec: 5, speedKmh: 110 },
        ],
        rain,
      ),
    );
    expect(violations(run.events)).toEqual([]);
    const paid = clean(run.events);
    expect(paid.filter((t) => t >= 7.8 && t < 9.8)).toEqual([]);
    expect(paid.some((t) => t >= 9.8 && t < 10.1)).toBe(true);
  });
});

describe("R3 — the other hand-over direction needs the conditions code's own teach", () => {
  it("the task names and teaches the act, its stamp ends with the car at 127 in the rain (the conditions first bill absorbed) — ended there: nothing, the conditions code was never shown", () => {
    const { state, tick: t } = last([
      { sec: 4, speedKmh: 110, over: { ...rain, taskSpeedCap: SPRAY } },
      { sec: 1, speedKmh: 127, over: { ...rain, taskSpeedCap: SPRAY } },
      { sec: 3, speedKmh: 127, over: rain },
    ]);
    expect(settleUnpaidTaskTeach(state, t)).toBeNull();
  });
});

// ROUND 14: «R3 — a NEW latch inside an act the weather keeps open: the new episode has shown nothing» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ROUND 14: «C3 — a breach already running when the owner lapsed is the same breach, never surfaced» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.
