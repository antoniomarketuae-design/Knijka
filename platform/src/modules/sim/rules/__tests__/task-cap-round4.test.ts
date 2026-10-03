/**
 * RULING 3 OF 2026-09-25 — «Yes, same as speeding» — the reducer half.
 *
 * On a drive with NO task cap (and in any act no task stamp took part in), a
 * TAUGHT weather or bend overspeed still running when the drive ends is settled
 * exactly as SPEEDING_OVER_LIMIT is since 0e58070 (`settleUnpaidSpeedingTeach`):
 * the code's own first bill was shown in the episode, its re-grade has not
 * landed, and the car is still over that code's own line on the last tick.
 * `settleUnpaidAdaptationTeach` is that settlement; round 3's
 * `settleUnpaidTaskTeach` keeps the acts a task took part in, and gains one
 * last-resort arm for a bend that owns such an act.
 *
 * Every case was run RED on round 3 (the function did not exist) except the
 * GUARDs.
 *
 * ROUND 14 — RETIRED HERE: 3 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
  type SimTick,
  type TaskSpeedCap,
} from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const rain = { rain: true };
const bend = { curveAdvisoryKmh: 50, edgeId: "e-bend" };

type Seg = { sec: number; speedKmh: number; over?: Partial<SimTick> };
function frames(segs: Seg[], base: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (const s of segs) {
    const n = Math.round(s.sec / DT);
    for (let i = 0; i < n; i++) {
      out.push(tick(Math.round(t * 10) / 10, { maxSpeedKmh: 50, ...base, speedKmh: s.speedKmh, ...s.over }));
      t += DT;
    }
  }
  return out;
}
const last = (segs: Seg[]) => {
  const fs = frames(segs);
  const { state, events } = drive(fs);
  return { state, events, tick: fs[fs.length - 1] };
};
const settled = (segs: Seg[]) => {
  const { state, tick: t } = last(segs);
  return settleUnpaidAdaptationTeach(state, t).map((e) => ({ code: e.code, regrade: e.regrade === true }));
};

describe("ruling 3 · the weather envelope (SPEED_TOO_FAST_FOR_CONDITIONS), no task", () => {
  it("rain, 55 in a 50 (envelope 42.5) for 4 s — taught at 3 s, ended still over: one regrade-marked conditions bill", () => {
    expect(settled([{ sec: 4, speedKmh: 55, over: rain }])).toEqual([{ code: COND, regrade: true }]);
  });
  it("…and in fog (0.6) and snow (0.5), each on its own envelope", () => {
    expect(settled([{ sec: 4, speedKmh: 35, over: { fog: true } }])).toEqual([{ code: COND, regrade: true }]);
    expect(settled([{ sec: 4, speedKmh: 30, over: { snow: true } }])).toEqual([{ code: COND, regrade: true }]);
  });
  it("GUARD — never taught (ended 2.5 s in, before the 3 s sustain): nothing withheld, nothing settled", () => {
    expect(settled([{ sec: 2.5, speedKmh: 55, over: rain }])).toEqual([]);
  });
  it("GUARD — its re-grade already landed (12 s over): nothing — that would be a third bill", () => {
    expect(settled([{ sec: 12, speedKmh: 55, over: rain }])).toEqual([]);
  });
  it("GUARD — one frame back inside the envelope at the end acquits, exactly as mid-drive", () => {
    expect(settled([{ sec: 4, speedKmh: 55, over: rain }, { sec: 0.1, speedKmh: 40, over: rain }])).toEqual([]);
  });
  it("GUARD — the tick in hand is re-checked: a last tick under the envelope settles nothing even if the state says open", () => {
    const { state, tick: t } = last([{ sec: 4, speedKmh: 55, over: rain }]);
    expect(settleUnpaidAdaptationTeach(state, { ...t, speedKmh: 40 })).toEqual([]);
    expect(settleUnpaidAdaptationTeach(state, { ...t, rain: false })).toEqual([]);
  });
  it("GUARD — a lawful rainy drive (40) has nothing to settle", () => {
    expect(settled([{ sec: 20, speedKmh: 40, over: rain }])).toEqual([]);
  });
});

describe("ruling 3 · the bend (SPEED_TOO_FAST_FOR_CURVE), no task", () => {
  it("70 against an advisory of 50 (grace 5) for 2 s — taught at 1.5 s, ended still over in the bend: one regrade-marked bend bill", () => {
    expect(settled([{ sec: 2, speedKmh: 70, over: { ...bend, maxSpeedKmh: 90 } }])).toEqual([{ code: CURVE, regrade: true }]);
  });
  it("GUARD — never taught (1.2 s): nothing", () => {
    expect(settled([{ sec: 1.2, speedKmh: 70, over: { ...bend, maxSpeedKmh: 90 } }])).toEqual([]);
  });
  it("GUARD — back at the advisory on the last tick: nothing", () => {
    expect(
      settled([
        { sec: 2, speedKmh: 70, over: { ...bend, maxSpeedKmh: 90 } },
        { sec: 0.1, speedKmh: 50, over: { ...bend, maxSpeedKmh: 90 } },
      ]),
    ).toEqual([]);
  });
  it("GUARD — out of the bend on the last tick (no advisory on it): nothing — the span's end is its reset", () => {
    expect(
      settled([
        { sec: 2, speedKmh: 70, over: { ...bend, maxSpeedKmh: 90 } },
        { sec: 0.1, speedKmh: 70, over: { maxSpeedKmh: 90, edgeId: "e-bend" } },
      ]),
    ).toEqual([]);
  });
  it("GUARD — the tick in hand is re-checked: a last tick under the bill line, or out of the span, settles nothing even if the state says open", () => {
    // Added after mutation pass 1 (S6 survived): the state conjuncts alone
    // cover every tick the reducer itself saw, so only a standalone call with a
    // tick the reducer did not reduce can tell whether the advisory is re-read.
    const { state, tick: t } = last([{ sec: 2, speedKmh: 70, over: { ...bend, maxSpeedKmh: 90 } }]);
    expect(settleUnpaidAdaptationTeach(state, t).map((e) => e.code)).toEqual([CURVE]);
    expect(settleUnpaidAdaptationTeach(state, { ...t, speedKmh: 54 })).toEqual([]);
    expect(settleUnpaidAdaptationTeach(state, { ...t, curveAdvisoryKmh: undefined })).toEqual([]);
  });
  it("GUARD — inside the grace band (54 against 50 + 5) was never an overspeed: nothing", () => {
    expect(settled([{ sec: 5, speedKmh: 54, over: { ...bend, maxSpeedKmh: 90 } }])).toEqual([]);
  });
});

describe("ruling 3 · a rainy bend with no task — the two codes co-bill as they do mid-drive", () => {
  it("both taught and both still over at the end: each settles on its own guard", () => {
    // Posted 50 in the rain (envelope 42.5) and an advisory of 50 (bill line 55):
    // 70 is over both.
    const out = settled([{ sec: 4, speedKmh: 70, over: { ...bend, ...rain, maxSpeedKmh: 50 } }]);
    expect(out).toEqual([
      { code: COND, regrade: true },
      { code: CURVE, regrade: true },
    ]);
  });
});

// ROUND 14: «ruling 3 · acts a task took part in stay with round 3's settlement» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.
