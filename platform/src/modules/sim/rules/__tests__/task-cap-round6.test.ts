/**
 * THE TASK CEILING, ROUND 6 — the reducer half of «one act, one bill».
 *
 * FOUNDER RULING 4 (2026-09-26, «Bill the arrival»), IN THE INTEGRATOR'S
 * READING (binding for round 6): every capped objective has a mark, so the
 * arrival event applies to every blown cap; it is ONE act with any sustained
 * over-cap stretch that follows on the named feature, and with any kin breach
 * in the same continuous act: one act, one bill.
 *
 * Round 5 kept that promise only while the task's own episode stayed open
 * after the arrival. Once the arrival applies to named features — the curtain,
 * the ice, the scene, stretches hundreds of metres long — the student can do
 * three things between the blow and a later over-cap stretch on the SAME
 * feature that close the episode, and each then opened a NEW act whose first
 * bill the coach charged on the topic the arrival had just spent (a card AND a
 * point for one blow):
 *  · hover in the grace band (over the figure on the glass, under the bill
 *    line) from the frame after the blow, so the episode never opens at all;
 *  · correct — back at the figure, held past the re-arm;
 *  · leave the graded road for a while (a frame on which the sign is not above
 *    the cap carries no stamp), past the re-arm.
 *
 * `rules/engine.ts` now keeps the arrival's ACT with its latch
 * (`RuleEngineState.taskArrival`): the act still ends by the plain rule, but an
 * act ending while its latch is current is kept, and the SAME latch taking the
 * car over the task's bill line again resumes it, with the charge it already
 * carried. A NEW latch — a new blow — is still a new act; a separate kin breach
 * that begins after the act ended and never takes the car over the task's line
 * names its own act («the same continuous act» only); and once the latch stops
 * stamping, a later, separate weather breach names its own act as before.
 *
 * Every case was run RED on round 5 (`scratchpad/cap/r6f/red-on-r5-list.txt`)
 * except the ones marked GUARD, PIN or PARTIAL-RED. The PARTIAL-RED one was RED
 * on the round-6 partial, which held the act open for as long as the latch
 * stamped (`scratchpad/cap/r6f/red-on-partial.txt`), and is green on round 5,
 * which had no hold at all. The PIN held on round 5 too (round 5 never resumed
 * an act) and is there for the resume that OVERWRITES an open act instead of
 * joining it (mutant O9, `scratchpad/cap/r6f/`).
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
import { type RuleEvent, type SimTick, type TaskSpeedCap, type ViolationEvent } from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const rain = { rain: true };

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

/** A ≤20 cap on a posted-50 road (a named feature: the ice, a ring), blown at 30 at t = 2.0. */
const CAP20: TaskSpeedCap = { capKmh: 20, shownKmh: 20, graceKmh: 5, blownAtSec: 2 };
const ARR20: Arrival = { capKmh: 20, shownKmh: 20, graceKmh: 5, blownAtSec: 2, arrivalKmh: 30 };
const stamped = (speedKmh: number, sec: number, extra: Partial<SimTick> = {}): Seg => ({
  sec,
  speedKmh,
  over: { taskSpeedCap: CAP20, ...extra },
});

describe("one act, one bill — the arrival's act lives with its latch", () => {
  it("the frame after the blow already in the grace band (23: over the figure, under the bill line), then 30 on the same stretch: the sustained first bill is ABSORBED", () => {
    const { events } = drive(
      frames([{ sec: 2, speedKmh: 18 }, at(ARR20, 23, { taskSpeedCap: CAP20 }), stamped(23, 2), stamped(30, 4)]),
    );
    expect(named(events)).toEqual([TASK]);
    expect(viol(events).filter((e) => e.code === TASK && e.absorbedBy === TASK)).toHaveLength(1);
  });

  it("a correction HELD (18 for 5 s, past the re-arm), then 30 for 4 s on the same stretch: still one act — absorbed", () => {
    const { events } = drive(
      frames([{ sec: 2, speedKmh: 18 }, at(ARR20, 30, { taskSpeedCap: CAP20 }), stamped(30, 1), stamped(18, 5), stamped(30, 4)]),
    );
    expect(named(events)).toEqual([TASK]);
  });

  it("…and the act's one charge stays its only one: 30 for 12 s (the re-grade charges), 18 for 5 s, 30 for 12 s again", () => {
    const { events } = drive(
      frames([{ sec: 2, speedKmh: 18 }, at(ARR20, 30, { taskSpeedCap: CAP20 }), stamped(30, 12), stamped(18, 5), stamped(30, 12)]),
    );
    expect(named(events)).toEqual([TASK, `${TASK}:regrade`]);
  });

  it("a gap in the SAME latch (6 s with no stamp — the sign not above the cap there), then the latch stamps again over the line: the act resumes — absorbed", () => {
    const { events } = drive(
      frames([
        { sec: 2, speedKmh: 18 },
        at(ARR20, 30, { taskSpeedCap: CAP20 }),
        stamped(30, 1),
        { sec: 6, speedKmh: 30 },
        stamped(30, 4),
      ]),
    );
    expect(named(events)).toEqual([TASK]);
  });

  it("…and a resumed act keeps the charge it carried: 30 for 12 s (charged), a 6 s gap, 30 for 12 s on the same latch — ONE charge", () => {
    const { events } = drive(
      frames([
        { sec: 2, speedKmh: 18 },
        at(ARR20, 30, { taskSpeedCap: CAP20 }),
        stamped(30, 12),
        { sec: 6, speedKmh: 30 },
        stamped(30, 12),
      ]),
    );
    expect(named(events)).toEqual([TASK, `${TASK}:regrade`]);
  });

  it("GUARD — a NEW latch (a new blow) is a new act: its arrival is a plain first bill, the repeat the coach charges", () => {
    // The second blow's frame is t = 12.1 (2 + 0.1 + 1 + 9 s of frames).
    const cap2: TaskSpeedCap = { ...CAP20, blownAtSec: 12.1 };
    const { events } = drive(
      frames([
        { sec: 2, speedKmh: 18 },
        at(ARR20, 30, { taskSpeedCap: CAP20 }),
        stamped(30, 1),
        { sec: 9, speedKmh: 18 },
        at({ ...ARR20, blownAtSec: 12.1 }, 30, { taskSpeedCap: cap2 }),
        { sec: 1, speedKmh: 30, over: { taskSpeedCap: cap2 } },
      ]),
    );
    const firsts = viol(events).filter((e) => e.code === TASK && e.regrade !== true);
    expect(firsts.map((e) => [e.t, e.absorbedBy ?? null])).toEqual([
      [2, null],
      [12.1, null],
    ]);
  });

  it("GUARD — the kept act ends with the latch: once its stamps stop and the task's episode re-arms, a later weather breach names its OWN act (a plain conditions first bill)", () => {
    const cap30: TaskSpeedCap = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 2 };
    const arr30: Arrival = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 2, arrivalKmh: 41 };
    const { events } = drive(
      frames(
        [
          { sec: 2, speedKmh: 40 },
          at(arr30, 41, { taskSpeedCap: cap30 }),
          { sec: 1, speedKmh: 41, over: { taskSpeedCap: cap30 } },
          // Off the stretch: no stamp, 40 is under the rain's 42.5.
          { sec: 6, speedKmh: 40 },
          // A separate weather breach.
          { sec: 5, speedKmh: 55 },
        ],
        rain,
      ),
    );
    const cond = viol(events).filter((e) => e.code === COND && e.regrade !== true);
    expect(cond).toHaveLength(1);
    expect(cond[0].absorbedBy).toBeUndefined();
    expect((cond[0] as unknown as { kinSurface?: string }).kinSurface).toBeUndefined();
    expect(named(events)).toEqual([TASK, COND]);
  });

  it("PARTIAL-RED — a SEPARATE weather breach on the same stretch after a held correction — under the task's line (snow: 25 against the task's 35) — is its OWN act: a plain conditions first bill, never swallowed into the arrival's act", () => {
    // The reading joins the arrival to a kin breach only «in the same continuous
    // act». 40 through the ≤30 mark in snow (envelope 25), back to 20 — under
    // both lines — held 6 s (the task re-arms, the snow episode closes: the act
    // is over), then 30 on the SAME stretch: over the snow's 25, under the
    // task's bill line 35. That is a new breach of a different ceiling, not an
    // over-cap stretch on the feature, so it names its own act (the coach then
    // charges it on the topic the arrival spent). The round-6 partial held the
    // act open for as long as the latch stamped and SURFACED this bill as a free
    // card instead (`:surface`) — one act where the reading says two.
    const cap30: TaskSpeedCap = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 2 };
    const arr30: Arrival = { capKmh: 30, shownKmh: 30, graceKmh: 5, blownAtSec: 2, arrivalKmh: 40 };
    const on = { taskSpeedCap: cap30 };
    const { events } = drive(
      frames(
        [
          { sec: 2, speedKmh: 20 },
          at(arr30, 40, on),
          { sec: 1, speedKmh: 40, over: on },
          { sec: 6, speedKmh: 20, over: on },
          { sec: 5, speedKmh: 30, over: on },
        ],
        { snow: true },
      ),
    );
    expect(named(events)).toEqual([TASK, COND]);
    const cond = viol(events).filter((e) => e.code === COND && e.regrade !== true);
    expect(cond).toHaveLength(1);
    expect((cond[0] as unknown as { kinSurface?: string }).kinSurface).toBeUndefined();
    expect(cond[0].absorbedBy).toBeUndefined();
  });
});
