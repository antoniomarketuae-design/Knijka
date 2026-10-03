/**
 * THE TASK CEILING, ROUND 8 — the reducer.
 *
 * B · ONE ACT DEFINITION (round-7 verifier R5, R6; the integrator's reading of
 * ruling 4, binding for round 8). A sign-bound arrival's act IS the act
 * SPEEDING_* already defines: the product's own continuing-offence rule (M-16).
 * The overspeed act ends only after a correction HELD for `speedingRearmSec`
 * (4 s), and the product's own definition of a correction is `speedReset` —
 * `speed <= limit`, at or under the SIGN itself. The grace band over the sign
 * (limit < speed <= limit + min(10 % of it, 5 km/h)) is NOT a correction:
 * `stepSustainedEpisode`'s `!cond` arm leaves a billed episode open there and
 * nulls `resetSince`. ONE definition for the three things that depend on it:
 *  · when the arrival bills itself — on the frame the act ends (the correction
 *    held 4 s), not on the first frame back at the sign;
 *  · when a SPEEDING_* bill absorbs it — any speeding bill in that act, before
 *    or after the blow, whatever order the two codes arrive in;
 *  · when praise is withheld — for the whole act, waiting or absorbed into
 *    SPEEDING_OVER_LIMIT or SPEEDING_DANGEROUS; once the act has ended under
 *    M-16, praise follows the base rules (A12) unchanged.
 * The verifier's reducer reproductions D1–D4 and H0–H3
 * (`scratchpad/cap/verify7/r7b/zz-v7-reducer.jsonl`) are ported verbatim.
 *
 * C · ABSORPTION FOR THE WHOLE ACT (round-7 verifier R7). An arrival absorbed
 * into a weather act stays absorbed for the whole life of that act, a kept act
 * that resumes on the same latch after its owner lapsed included: it never
 * surfaces a TASK card later in that act.
 *
 * D · THE PRAISE GATES (round-7 verifier C2: U8, U9, U10 survived all 118 tests
 * that name CLEAN_DRIVING). Base behaviour, pinned where a sabotage shows.
 *
 * Every case not marked GUARD or PIN was run RED on round 7
 * (`scratchpad/cap/r8/red-on-r7*.txt`).
 *
 * ROUND 14 — RETIRED HERE: 13 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
import { type RuleEvent, type SimTick, type TaskSpeedCap, type ViolationEvent } from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const OVER = "SPEEDING_OVER_LIMIT";
const DANGER = "SPEEDING_DANGEROUS";
const REARM_SEC = 4; // `speedingRearmSec` — the M-16 correction that counts

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
    .map((e) => `${e.code}${e.regrade === true ? ":regrade" : ""}${(e as unknown as { kinSurface?: string }).kinSurface !== undefined ? ":surface" : ""}@${e.t}`);
const absorbed = (events: RuleEvent[]) =>
  viol(events)
    .filter((e) => e.absorbedBy !== undefined)
    .map((e) => `${e.code}>${e.absorbedBy}@${e.t}`);
const praise = (events: RuleEvent[]) =>
  events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t);
const shape = (events: RuleEvent[]) => ({
  named: named(events).map((x) => x.split("@")[0]),
  absorbed: absorbed(events).map((x) => x.split("@")[0]),
});

/**
 * The frame the M-16 act ends on, measured the way the product measures it:
 * the first frame at or under the sign on which the car has been continuously
 * at or under it for `speedingRearmSec` (the reducer's `speedCorrectionHeld`).
 */
function m16End(f: SimTick[], fromT: number): number | null {
  let since: number | null = null;
  for (const x of f) {
    if (x.t < fromT) continue;
    if (x.speedKmh > x.maxSpeedKmh) {
      since = null;
      continue;
    }
    if (since === null) since = x.t;
    if (x.t - since >= REARM_SEC) return x.t;
  }
  return null;
}

/** A ≤50 task on a posted-50 road: the glass cap EQUALS the sign. Blown at 58 (over the arrival line 55). */
const SIGN50 = (blownAtSec: number, arrivalKmh = 58): Arrival => ({ capKmh: 50, shownKmh: 50, graceKmh: 5, blownAtSec, arrivalKmh });

// The verifier's own reducer reproductions, byte-for-byte (verify7/probes/zz-v7-reducer.test.ts).
const D1: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 0.3, speedKmh: 53 }, { sec: DT, speedKmh: 48 }, { sec: 5, speedKmh: 58 }, { sec: 8, speedKmh: 45 }];
const D2: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 0.3, speedKmh: 53 }, { sec: 4.5, speedKmh: 48 }, { sec: 5, speedKmh: 58 }, { sec: 8, speedKmh: 45 }];
const D3: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 3, speedKmh: 58 }, { sec: DT, speedKmh: 48 }, { sec: 0.3, speedKmh: 58 }, at(SIGN50(5.4), 58), { sec: 2, speedKmh: 58 }, { sec: 8, speedKmh: 45 }];
const D4: Seg[] = [...D1.slice(0, 6), { sec: 20, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(28.5), 58), { sec: 0.3, speedKmh: 53 }, { sec: DT, speedKmh: 48 }, { sec: 5, speedKmh: 58 }, { sec: 8, speedKmh: 45 }];
const H1: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 2, speedKmh: 70 }, at(SIGN50(4, 70), 70), { sec: 30, speedKmh: 54 }, { sec: 8, speedKmh: 45 }];
const H2: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 3, speedKmh: 58 }, at(SIGN50(5), 58), { sec: 30, speedKmh: 54 }, { sec: 8, speedKmh: 45 }];
const H3: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 30, speedKmh: 54 }, { sec: 8, speedKmh: 45 }];
const H0: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 2, speedKmh: 70 }, { sec: 30, speedKmh: 54 }, { sec: 8, speedKmh: 45 }];

describe("B · ONE ACT DEFINITION — the sign-bound arrival's act is the M-16 act (round-7 verifier R5)", () => {
  it("D2 (the dip HELD 4.5 s — a correction that counts): the act ends there, the arrival bills itself on the frame the correction has been held 4 s, and the later 58 is a NEW act with its own bill", () => {
    const f = frames(D2);
    const { events } = drive(f);
    const end = m16End(f, 2.6);
    expect(end).not.toBeNull();
    // The dip starts at 2.9 and has been held 4 s on this frame — not on 2.9.
    expect(end as number).toBeGreaterThanOrEqual(2.9 + REARM_SEC - 1e-9);
    expect(end as number).toBeLessThan(7.4);
    expect(named(events)).toEqual([`${TASK}@${end}`, `${OVER}@9.4`]);
    expect(absorbed(events)).toEqual([]);
  });
  it("the sign itself IS a correction (speedReset is `speed <= limit`): blow at 58, then exactly 50 — the act ends when 50 has been held 4 s, and the arrival bills there", () => {
    const f = frames([{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 8, speedKmh: 50 }]);
    const { events } = drive(f);
    const end = m16End(f, 2.6);
    expect(end).not.toBeNull();
    expect(named(events)).toEqual([`${TASK}@${end}`]);
    const b = viol(events).find((e) => e.code === TASK)!;
    // The bill lands frames after the blow, so it carries the blow itself.
    expect(b.signBoundArrival).toEqual({ arrivalKmh: 58, shownKmh: 50, postedKmh: 50 });
  });
  it("an act that already has its one bill takes no second one: a sign-bound blow, a GRADED blow inside its act (the task first bill takes the act's bill), then a SECOND sign-bound blow still inside it — one task first bill for the act", () => {
    const graded: Arrival = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 5.1, arrivalKmh: 53 };
    const f = frames([
      { sec: 2, speedKmh: 45 },
      { sec: 1, speedKmh: 58 },
      at(SIGN50(3), 53),
      { sec: 2, speedKmh: 53 },
      at(graded, 53),
      { sec: 2, speedKmh: 53 },
      at(SIGN50(7.2, 57), 53),
      { sec: 3, speedKmh: 53 },
      { sec: 6, speedKmh: 48 },
    ]);
    const { events, state } = drive(f);
    expect(named(events)).toEqual([`${TASK}@5.1`]);
    expect(state.taskArrivalPending).toBeNull();
    expect(state.taskSignAct).toBeNull();
  });
  it("a correction interrupted by one frame over the sign starts again: 48 for 3 s, 51 for one frame, 48 for 3 s — still the act; it ends 4 s after the SECOND dip began", () => {
    const f = frames([{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 3, speedKmh: 48 }, { sec: DT, speedKmh: 51 }, { sec: 6, speedKmh: 48 }]);
    const { events } = drive(f);
    const end = m16End(f, 2.6) as number;
    // 2.6 .. 5.5 at 48, 5.6 at 51, 5.7 .. at 48: held 4 s at 9.7.
    expect(end).toBeGreaterThan(9.6);
    expect(named(events)).toEqual([`${TASK}@${end}`]);
  });
});

describe("B · PRAISE is withheld exactly while that act runs (round-7 verifier R6)", () => {
  it("H0 — base A12 with NO task (70 for 2 s: SPEEDING_DANGEROUS; then 54 in the grace band): praise at 20.6 and 37.9, exactly as the product always paid it", () => {
    const { events } = drive(frames(H0));
    expect(named(events)).toEqual([`${DANGER}@3`]);
    expect(praise(events)).toEqual([20.6, 37.9]);
  });
  it("H3 — 58 through the mark with nothing billed (the arrival WAITS), then 54 for 30 s, then 45: no praise, and the arrival bills itself when the correction has been held 4 s", () => {
    const f = frames(H3);
    const { events } = drive(f);
    const end = m16End(f, 2.6) as number;
    expect(end).toBeGreaterThan(36.5);
    expect(named(events)).toEqual([`${TASK}@${end}`]);
    expect(praise(events)).toEqual([]);
  });
  it("GUARD — a graded cap (glass ≤35 under a posted 50) keeps round 7's behaviour: billed at the blow, never waiting", () => {
    const g: Arrival = { capKmh: 35, shownKmh: 35, graceKmh: 5, blownAtSec: 2.5, arrivalKmh: 45 };
    const { events } = drive(frames([{ sec: 2, speedKmh: 30 }, { sec: 0.5, speedKmh: 45 }, at(g, 45), { sec: 8, speedKmh: 30 }]));
    expect(named(events)).toEqual([`${TASK}@2.5`]);
  });
});

describe("D · the praise gates the CLEAN claims rest on (round-7 verifier C2: U8, U9, U10)", () => {
  it("GATE 1 lets a billed episode that is no longer being committed accrue again (U8): H0's grace band is praised at 20.6 — a gate that ignored the correction would praise nothing", () => {
    // Same drive as H0, asserted as the gate's own contract: after the опасна bill
    // at 3.0 the car sits at 54 — over the sign, under every bill line — and
    // `speedingDangerous` is emitted with no open run and no banked seconds.
    const f = frames(H0);
    const { events } = drive(f);
    expect(praise(events)[0]).toBe(20.6);
    // Not vacuous: on the praised frame the опасна episode is still billed (not re-armed).
    const { state } = drive(f.filter((x) => x.t <= 20.6));
    expect(state.speedingDangerous.emitted).toBe(true);
    expect(state.speedingDangerous.activeSince).toBeNull();
  });
  it("GATE 1 stops the accrual while a weather bill stands and the car is still over the envelope (U9): 48 in the rain on a 50 for 38 s, then 40 — no praise on the drop", () => {
    // Envelope 42.5 in rain on a posted 50: the conditions code bills at 5.0 and
    // re-grades at 11.0; from 11.0 to 40.0 the car drives ~387 m at 48 — past the
    // 250 m payout — while that bill stands. Those metres are not clean ones.
    const f = frames([{ sec: 2, speedKmh: 30 }, { sec: 38, speedKmh: 48 }, { sec: 10, speedKmh: 40 }], { rain: true });
    const { events } = drive(f);
    expect(named(events)).toEqual([`${COND}@5`, `${COND}:regrade@11`]);
    // Not vacuous: the metres driven over the envelope after the last bill exceed a payout.
    expect(((40 - 11) * 48) / 3.6).toBeGreaterThan(250);
    // At 40 km/h the next 250 m take 22.5 s — longer than the 10 s driven.
    expect(praise(events)).toEqual([]);
  });
  it("GATE 2 holds the payout through the опасна band's 1 s sustain (U10): 45 for 19.5 s (≈243 m banked), then 70 — the 250 m mark falls inside the sustain, the bill wipes it, no praise", () => {
    const f = frames([{ sec: 19.5, speedKmh: 45 }, { sec: 2, speedKmh: 70 }, { sec: 3, speedKmh: 45 }]);
    const { events } = drive(f);
    expect(named(events)).toEqual([`${DANGER}@20.5`]);
    // Not vacuous: the banked metres cross 250 before the опасна bill lands.
    let m = 0;
    let crossed: number | null = null;
    for (let i = 1; i < f.length; i++) {
      m += (f[i].speedKmh / 3.6) * DT;
      if (crossed === null && m >= 250) crossed = f[i].t;
    }
    expect(crossed).not.toBeNull();
    expect(crossed as number).toBeGreaterThanOrEqual(19.5);
    expect(crossed as number).toBeLessThan(20.5);
    expect(praise(events)).toEqual([]);
  });
});

// ROUND 14: «C · an arrival absorbed into a weather act stays absorbed for the WHOLE act (round-7 verifier R7)» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.
