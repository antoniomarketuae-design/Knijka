/**
 * TASK_SPEED_CAP_EXCEEDED — the lesson task's own ceiling, graded (founder
 * ruling 2026-09-25, register item 17, „Bill it").
 *
 * The reducer half. `SimTick.taskSpeedCap` is stamped by `lessons/engine.ts`
 * only; here it is stamped by hand, so every case states the numbers it grades
 * against: `capKmh` (the objective's gate), `graceKmh` (the objective's own
 * slack — only a speed ABOVE gate + grace bills; round 2, verifier C1) and
 * `shownKmh` (the figure the glass printed — back at or under it is the
 * correction). Frames are 0.1 s, the shape the product ticks at.
 *
 * ROUND 2 also replaced round 1's stand-down (the task code held its episode
 * wherever the weather envelope or a bend was armed) with THE KIN LEDGER: one
 * continuous чл. 20, ал. 2 act is named by the first of the three codes to
 * bill, later first bills of the task/conditions codes are ABSORBED
 * (`absorbedBy`), and the act carries one charge — its owner's re-grade, or,
 * when the owner's own ceiling is no longer broken, the kin code whose ceiling
 * is (`kinOwner`). And a drive that ends inside a taught act is SETTLED
 * (`settleUnpaidTaskTeach`, verifier F2).
 *
 * The session half (the stamp, its stretch, the grace, the debrief) is
 * `lessons/__tests__/task-cap-ceiling.test.ts` and
 * `lessons/__tests__/task-cap-photographed.test.ts`.
 *
 * ROUND 14 — RETIRED HERE: 10 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
  COMMENDATIONS,
  N38_BASIS,
  VIOLATIONS,
  conditionsSpeedEnvelope,
  createRuleEngine,
  settleUnpaidTaskTeach,
  type RuleEvent,
  type SimTick,
  type TaskSpeedCap,
  type ViolationEvent,
} from "..";
import { scenarioForCode } from "../../scenarios";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
// `blownAtSec` (round 3) names the latch; one number per stamp stream.
const SPRAY: TaskSpeedCap = { capKmh: 80, shownKmh: 80, graceKmh: 5, blownAtSec: 0 };
/** L1's shape: the author's 80 plus the rung's grace — the gate is 85, the bill line 90. */
const SPRAY_L1: TaskSpeedCap = { capKmh: 85, shownKmh: 80, graceKmh: 5, blownAtSec: 0 };

type Seg = { sec: number; speedKmh: number; over?: Partial<SimTick> };

/** Consecutive segments at 0.1 s, starting at t = 0; each carries its own overrides. */
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

/** The bills that NAME or CHARGE something — absorbed first bills excluded. */
function bills(events: RuleEvent[], code = TASK) {
  return violations(events)
    .filter((e) => e.code === code && e.absorbedBy === undefined)
    .map((e) => ({
      t: Math.round(e.t * 10) / 10,
      regrade: e.regrade === true,
      ...((e as unknown as { kinOwner?: string }).kinOwner !== undefined ? { kinOwner: (e as unknown as { kinOwner?: string }).kinOwner } : {}),
    }));
}
/** First bills the kin ledger absorbed into an act another code named. */
function absorbed(events: RuleEvent[], code: string) {
  return violations(events)
    .filter((e) => e.code === code && e.absorbedBy !== undefined)
    .map((e) => e.absorbedBy);
}

describe("the ceiling bills, with the grace the product already has", () => {
  it("no stamp, no ceiling: 110 in a 140 books nothing (every recorder and replay)", () => {
    const { events } = drive(frames([{ sec: 60, speedKmh: 110 }]));
    expect(bills(events)).toEqual([]);
  });

  it("over the task's gate + grace: the first bill after the conditions duty's 3 s, the re-grade 6 s later, and NEVER a third", () => {
    const { events } = drive(frames([{ sec: 90, speedKmh: 110, over: { taskSpeedCap: SPRAY } }]));
    const b = bills(events);
    expect(b).toHaveLength(2);
    expect(b[0].regrade).toBe(false);
    expect(b[0].t).toBeCloseTo(3, 5);
    // The second is the SAME breach, marked so lessons/engine.ts drops it when
    // the first was already charged (exam, repeat, grade-on-sight).
    expect(b[1].regrade).toBe(true);
    expect(b[1].t).toBeCloseTo(9, 5);
  });

  it("C1 — the bill line is the gate PLUS the objective's slack: 85 never bills, however long it is held; 85.5 does", () => {
    // Round 1 billed above the bare gate (80), with 0 km/h of slack, while the
    // mark itself blows only above 80 + 5 and a posted 80 bills only above 85.
    const at = drive(frames([{ sec: 120, speedKmh: 85, over: { taskSpeedCap: SPRAY } }]));
    expect(bills(at.events)).toEqual([]);
    const over = drive(frames([{ sec: 20, speedKmh: 85.5, over: { taskSpeedCap: SPRAY } }]));
    expect(bills(over.events)).toHaveLength(2);
  });

  it("…and the grace is read off the stamp, not assumed: the same 83 bills under a 0 km/h stamp", () => {
    const zero = drive(frames([{ sec: 20, speedKmh: 83, over: { taskSpeedCap: { ...SPRAY, graceKmh: 0 } } }]));
    expect(bills(zero.events)).toHaveLength(2);
    const five = drive(frames([{ sec: 20, speedKmh: 83, over: { taskSpeedCap: SPRAY } }]));
    expect(bills(five.events)).toEqual([]);
  });

  it("the rung's grace (shown 80, bill line 90) is a band that neither bills nor forgives", () => {
    // 88 for two minutes: over the figure on the glass, inside the bill line.
    const inside = drive(frames([{ sec: 120, speedKmh: 88, over: { taskSpeedCap: SPRAY_L1 } }]));
    expect(bills(inside.events)).toEqual([]);
    // Billed at 95, then parked in the band: the episode is NOT over, so the
    // return to 95 reaches the re-grade rather than a fresh first bill.
    const held = drive(
      frames([
        { sec: 4, speedKmh: 95, over: { taskSpeedCap: SPRAY_L1 } },
        { sec: 10, speedKmh: 83, over: { taskSpeedCap: SPRAY_L1 } },
        { sec: 8, speedKmh: 95, over: { taskSpeedCap: SPRAY_L1 } },
      ]),
    );
    expect(bills(held.events).map((x) => x.regrade)).toEqual([false, true]);
  });

  it("the correction is the figure on the glass, HELD — a 1 s dip is one continuing breach (M-16)", () => {
    const dip = drive(
      frames([
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 1, speedKmh: 75, over: { taskSpeedCap: SPRAY } },
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    expect(bills(dip.events).filter((x) => !x.regrade)).toHaveLength(1);
    // …and a correction held past `speedingRearmSec` (4 s) ends it: the next
    // breach is a new act with its own first bill.
    const held = drive(
      frames([
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 5, speedKmh: 75, over: { taskSpeedCap: SPRAY } },
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    expect(bills(held.events).filter((x) => !x.regrade)).toHaveLength(2);
  });

  it("a cap that vanishes before the first bill restarts the sustain (round 3: after a bill, only a held absence or a new latch ends the act — task-cap-round3.test.ts)", () => {
    const { events } = drive(
      frames([
        { sec: 2.5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 0.5, speedKmh: 110 },
        { sec: 2.5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    // 2.5 s + 2.5 s over the line, but never 3 s in ONE stretch: no bill.
    expect(bills(events)).toEqual([]);
  });

  it("…and a breach of the NEXT objective's ceiling is a new act with its own first bill, however soon it follows", () => {
    const { events } = drive(
      frames([
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
        { sec: 1, speedKmh: 110 },
        // A NEW latch (round 3): the next objective's blow, `blownAtSec` 6.
        { sec: 5, speedKmh: 110, over: { taskSpeedCap: { capKmh: 60, shownKmh: 60, graceKmh: 5, blownAtSec: 6 } } },
      ]),
    );
    const firsts = bills(events).filter((x) => !x.regrade);
    expect(firsts.map((x) => x.t)).toEqual([3, 9]);
  });

  it("a stopped car is not over anything", () => {
    const { events } = drive(
      frames([{ sec: 30, speedKmh: 0, over: { taskSpeedCap: { capKmh: 20, shownKmh: 20, graceKmh: 5, blownAtSec: 0 } } }]),
    );
    expect(bills(events)).toEqual([]);
  });
});

describe("THE KIN LEDGER — one continuous чл. 20, ал. 2 act, one name, one charge", () => {
  const rain = { rain: true, headlights: "low" as const };

  it("…and where the conditions code names the act its bills are byte-identical to a drive with no stamp", () => {
    const withCap = drive(frames([{ sec: 60, speedKmh: 127, over: { ...rain, taskSpeedCap: SPRAY } }]));
    const without = drive(frames([{ sec: 60, speedKmh: 127, over: rain }]));
    expect(violations(withCap.events).filter((e) => e.code === COND)).toEqual(
      violations(without.events).filter((e) => e.code === COND),
    );
  });

  it("110 in the same rain is inside the envelope — the band only the task can see — and the task code bills it", () => {
    const { events } = drive(frames([{ sec: 60, speedKmh: 110, over: { ...rain, taskSpeedCap: SPRAY } }]));
    expect(bills(events, COND)).toEqual([]);
    expect(bills(events).map((x) => x.regrade)).toEqual([false, true]);
  });

  it("NO TASK IN THE ACT: a rainy bend co-bills the conditions and curve codes exactly as shipped (the independent triggers of scenarios/mapping.ts)", () => {
    const wet = { ...rain, maxSpeedKmh: 90, curveAdvisoryKmh: 50 };
    const { events } = drive(frames([{ sec: 30, speedKmh: 85, over: wet }]));
    expect(bills(events, COND).map((x) => x.regrade)).toEqual([false, true]);
    expect(bills(events, CURVE)).toHaveLength(1);
    expect(violations(events).some((e) => e.absorbedBy !== undefined || (e as unknown as { kinOwner?: string }).kinOwner !== undefined)).toBe(false);
  });
});

describe("the finish-time settlement (verifier F2) — settleUnpaidTaskTeach", () => {
  const rain = { rain: true, headlights: "low" as const };
  const last = (segs: Seg[]) => {
    const fs = frames(segs);
    const { state } = drive(fs);
    return { state, tick: fs[fs.length - 1] };
  };

  it("ROUND 3 (C1): the conditions code with NO task in the act is never settled — base never settled it, and the ruling covers the task cap only", () => {
    const { state, tick: t } = last([{ sec: 5, speedKmh: 127, over: rain }]);
    expect(settleUnpaidTaskTeach(state, t)).toBeNull();
  });

  it("the task names the act: taught, still over → the task's own regrade bill", () => {
    const { state, tick: t } = last([{ sec: 5, speedKmh: 110, over: { taskSpeedCap: SPRAY } }]);
    expect(settleUnpaidTaskTeach(state, t)).toMatchObject({ code: TASK, regrade: true });
    // …not once its re-grade landed.
    const landed = last([{ sec: 10, speedKmh: 110, over: { taskSpeedCap: SPRAY } }]);
    expect(settleUnpaidTaskTeach(landed.state, landed.tick)).toBeNull();
  });
});

describe("the one derivation of the weather envelope (conditionsSpeedEnvelope)", () => {
  const cfg = createRuleEngine().config;
  it("rain on 140 is 119; the most restrictive condition governs; dry is null", () => {
    expect(conditionsSpeedEnvelope({ maxSpeedKmh: 140, rain: true }, cfg)).toEqual({ limitKmh: 119, cause: "rain" });
    expect(conditionsSpeedEnvelope({ maxSpeedKmh: 50, rain: true, snow: true }, cfg)?.cause).toBe("snow");
    expect(conditionsSpeedEnvelope({ maxSpeedKmh: 140 }, cfg)).toBeNull();
  });
});

describe("praise is not minted over the breach", () => {
  it("110 over an 80 task for a minute earns no CLEAN_DRIVING; the same drive with no task earns it", () => {
    const over = drive(frames([{ sec: 60, speedKmh: 110, over: { taskSpeedCap: SPRAY } }]));
    const free = drive(frames([{ sec: 60, speedKmh: 110 }]));
    const clean = (ev: RuleEvent[]) => ev.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING");
    expect(clean(over.events)).toEqual([]);
    expect(clean(free.events).length).toBeGreaterThan(0);
    expect(COMMENDATIONS.CLEAN_DRIVING).toBeDefined();
  });

  const clean = (ev: RuleEvent[]) => ev.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING");

  it("GATE 1 — billed, then parked in the rung's grace band: no clean metres are banked until the figure on the glass is held", () => {
    const parked = drive(
      frames([
        { sec: 5, speedKmh: 95, over: { taskSpeedCap: SPRAY_L1 } },
        { sec: 60, speedKmh: 83, over: { taskSpeedCap: SPRAY_L1 } },
      ]),
    );
    expect(clean(parked.events)).toEqual([]);
    // Control: the same speeds with no task earn praise.
    const free = drive(frames([{ sec: 5, speedKmh: 95 }, { sec: 60, speedKmh: 83 }]));
    expect(clean(free.events).length).toBeGreaterThan(0);
  });

  it("GATE 2 — metres banked BEFORE the breach are not paid out while it runs its sustain", () => {
    // 7.8 s at 110 with no task ≈ 238 m banked (the payout is 250 m); then the cap.
    const run = drive(
      frames([
        { sec: 7.8, speedKmh: 110 },
        { sec: 10, speedKmh: 110, over: { taskSpeedCap: SPRAY } },
      ]),
    );
    expect(clean(run.events).filter((e) => e.t >= 7.8)).toEqual([]);
    // Control: with no task the 250th metre pays out inside that window.
    const free = drive(frames([{ sec: 17.8, speedKmh: 110 }]));
    expect(clean(free.events).some((e) => e.t >= 7.8 && e.t < 10.8)).toBe(true);
  });
});

describe("the catalogue row re-uses what the repo already carries (ADR-002)", () => {
  const row = VIOLATIONS.TASK_SPEED_CAP_EXCEEDED;
  const conditions = VIOLATIONS.SPEED_TOO_FAST_FOR_CONDITIONS;

  it("cites the conditions duty's own lawRef, verbatim", () => {
    expect(row.lawRef).toBe("ЗДвП чл. 20, ал. 2");
    expect(row.lawRef).toBe(conditions.lawRef);
  });

  it("is a второстепенна under б. „б“, like the duty it measures", () => {
    expect(row.severityClass).toBe("vtorostepenna");
    expect(row.points).toBe(1);
    expect(N38_BASIS.TASK_SPEED_CAP_EXCEEDED.clause).toBe("б");
  });

  it("the street half is the conditions row's retrieved sentence and citation, not a second copy", () => {
    expect(row.realWorldBg).toBe(conditions.realWorldBg);
    expect(row.realWorldRefs).toEqual(conditions.realWorldRefs);
  });

  it("explains, corrects and names a concept — never a bare verdict (THEO-4)", () => {
    for (const s of [row.titleBg, row.explanationBg, row.peekBg, row.correctiveBg]) {
      expect(s.trim().length).toBeGreaterThan(0);
    }
    expect(row.conceptId).toBe("c-speed-adaptation");
  });

  // ROUND 5 (2026-09-26, round-4 verifier F1). This case used to REQUIRE
  // «до следващата точка от маршрута» — round 3's rule, and a false sentence on
  // the glass once the founder ruled «Only the named stretch» (the ceiling holds
  // through the feature the task names — the bend, the curtain, the zone — and
  // stops where it ends) and «Bill the arrival» (an arrival mark's ceiling is its
  // own zone). The corrective now says exactly that, and this pins it.
  it("the corrective says where the ceiling stops — where the stretch the task names ends, never „the next point of the route“ nor „while the task is active“ (C2, F1)", () => {
    expect(row.correctiveBg).toContain("през целия участък, който задачата назовава");
    expect(row.correctiveBg).toContain("спира да важи там, където този участък свършва");
    expect(row.correctiveBg).not.toContain("следващата точка");
    expect(row.correctiveBg).not.toContain("докато задачата е активна");
  });

  it("shares the conditions duty's mini-lesson, so one drive gets ONE free teach for the topic", () => {
    expect(scenarioForCode("TASK_SPEED_CAP_EXCEEDED")).toBe(scenarioForCode("SPEED_TOO_FAST_FOR_CONDITIONS"));
  });
});
