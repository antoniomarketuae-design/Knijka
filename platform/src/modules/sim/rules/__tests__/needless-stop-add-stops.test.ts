import { describe, expect, it } from "vitest";
import { drive, tick } from "./fixtures";
import { NEEDLESS_STOP_ACT_COPY, NEEDLESS_STOP_ACT_PRIORITY_ROAD, VIOLATIONS } from "../catalog";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { RuleEngineConfig, RuleEvent, SimTick, ViolationEvent } from "../types";
import { resolveLawRef } from "@/lib/content/law";

/**
 * FOUNDER RULING 2026-10-04 «Add stops together» — STOPPED_WITHOUT_CAUSE on the
 * priority road (audit `sc-jx-priority-confidence:9c987e7b`).
 *
 * TWO GAPS, both measured on the lesson before this change:
 *  1. `needlessStopReason` read `townReasonAheadExceptLead`, whose first term is
 *     `nextJunctionM <= townCrawlClearAheadM` — a 25 m RADIUS, so every stop
 *     beside tj-n-c was acquitted, which is where this drill's fault happens.
 *  2. The bill ran through a per-stop `stepEpisode`: any excused frame and any
 *     move above 5 км/ч restarted the 6 s clock, so fourteen 3-second halts
 *     (97 s against a 40 s par) billed nothing.
 *
 * Both repairs sit behind per-lesson keys whose DEFAULTS reproduce the old
 * reading exactly (`sc-follow-tailgater`, the other lesson that arms the
 * detector, authors neither). This file pins each arm on synthetic frames at
 * 10 Hz; the session-level proof is
 * `lessons/scenario/__tests__/jx-priority-confidence-add-stops.test.ts`.
 */

const CODE = "STOPPED_WITHOUT_CAUSE";
/** Today's armed config — what `sc-follow-tailgater` compiles to. */
const ARMED: Partial<RuleEngineConfig> = { needlessStopEnabled: true };
/** What `sc-jx-priority-confidence` compiles to after the ruling. */
const PRIORITY: Partial<RuleEngineConfig> = {
  needlessStopEnabled: true,
  needlessStopJunctionExcuse: false,
  needlessStopPerStop: false,
};

const DT = 0.1;

/** Frames every 0.1 s over [t0, t1). */
function span(t0: number, t1: number, over: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  const n = Math.round((t1 - t0) / DT);
  for (let i = 0; i < n; i += 1) out.push(tick(Math.round((t0 + i * DT) * 1000) / 1000, over));
  return out;
}

/** A tape built from [seconds, speedKmh, extra] segments, starting with a 4 s roll at 40. */
function tape(segments: Array<[number, number, Partial<SimTick>?]>): SimTick[] {
  const out: SimTick[] = [...span(0, 4, { speedKmh: 40 })];
  let t = 4;
  for (const [sec, speedKmh, over] of segments) {
    out.push(...span(t, t + sec, { speedKmh, ...(over ?? {}) }));
    t += sec;
  }
  return out;
}

function bills(events: RuleEvent[]): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === CODE);
}

/** n stops of `stopSec` at rest, separated by `driveSec` at `driveKmh`. */
function stopAndGo(n: number, stopSec: number, driveSec: number, driveKmh: number): SimTick[] {
  const segs: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    segs.push([stopSec, 0]);
    segs.push([driveSec, driveKmh]);
  }
  return tape(segs);
}

describe("the defaults reproduce today's reading", () => {
  it("both keys default to the old behaviour", () => {
    expect(DEFAULT_RULE_CONFIG.needlessStopJunctionExcuse).toBe(true);
    expect(DEFAULT_RULE_CONFIG.needlessStopPerStop).toBe(true);
    expect(DEFAULT_RULE_CONFIG.needlessStopSustainSec).toBe(6);
  });

  it("per stop: fourteen 3 s halts at 18 км/ч bill nothing — the measured gap, kept where not ruled", () => {
    expect(bills(drive(stopAndGo(14, 3, 3, 18), ARMED).events)).toEqual([]);
  });

  it("per stop: a junction within 25 m still acquits an 8 s stop", () => {
    expect(bills(drive(tape([[8, 0, { nextJunctionM: 12 }]]), ARMED).events)).toEqual([]);
  });

  it("per stop: a body 40 m ahead excuses nothing (no memory is read)", () => {
    const withBody = drive(tape([[2, 0, { leadGapM: 40 }], [8, 0]]), ARMED).events;
    const without = drive(tape([[10, 0]]), ARMED).events;
    expect(bills(withBody).map((e) => e.t)).toEqual(bills(without).map((e) => e.t));
    expect(bills(withBody)).toHaveLength(1); // 10 s: the bill, and no re-grade before 12 s
  });

  it("per stop: the conflict memory is never even stamped — the reducer state stays as it was", () => {
    const { state } = drive(tape([[2, 0, { leadGapM: 40 }], [8, 0]]), ARMED);
    expect((state as unknown as { needlessStopConflictAt: number | null }).needlessStopConflictAt).toBeNull();
    const ruled = drive(tape([[2, 0, { leadGapM: 40 }], [8, 0]]), PRIORITY).state;
    expect((ruled as unknown as { needlessStopConflictAt: number | null }).needlessStopConflictAt).toBeCloseTo(5.9, 5);
  });

  it("per stop: the bill carries no detail and the pooled card", () => {
    const [first] = bills(drive(tape([[8, 0]]), ARMED).events);
    expect(first!.detail).toBeUndefined();
    expect(first!.titleBg).toBe(VIOLATIONS.STOPPED_WITHOUT_CAUSE.titleBg);
    expect(first!.lawRef).toBe("ЗДвП чл. 24, ал. 2");
  });
});

describe("arm (b) — the rests are ADDED UP across stops (needlessStopPerStop: false)", () => {
  it("fourteen 3 s halts at 18 км/ч bill once the rests reach 6 s, then the re-grade at 12 s", () => {
    const b = bills(drive(stopAndGo(14, 3, 3, 18), PRIORITY).events);
    expect(b.map((e) => e.regrade === true)).toEqual([false, true]);
    // Stop 1 rests 4.0–7.0, stop 2 from 10.0: the sixth rested second ends in stop 2.
    expect(b[0]!.t).toBeGreaterThan(12.8);
    expect(b[0]!.t).toBeLessThan(13.2);
    // Twelve rested seconds end at the close of stop 4 (22.0–25.0). Summed in
    // 0.1 s frames the ledger reads 11.9999… there, so the re-grade may land on
    // the first frame of stop 5 (28.0) instead — never later, never earlier.
    expect(b[1]!.t).toBeGreaterThan(24.8);
    expect(b[1]!.t).toBeLessThan(28.05);
  });

  it("a frame in motion PAUSES the sum: two 4 s stops 3 s apart at 18 км/ч bill", () => {
    expect(bills(drive(tape([[4, 0], [3, 18], [4, 0], [3, 18]]), PRIORITY).events)).toHaveLength(1);
  });

  it("an excused frame PAUSES the sum, it does not zero it (a queue, and its settle)", () => {
    // One standstill: 4 s causeless (4.0–8.0), a queue 10 m ahead (8.0–11.0)
    // whose 6 s settle excuses to 17.0, then causeless again.
    const segs: Array<[number, number, Partial<SimTick>?]> = [
      [4, 0],
      [3, 0, { leadGapM: 10 }],
      [10, 0],
    ];
    const added = bills(drive(tape(segs), PRIORITY).events);
    // 4 s banked + 2 s after 17.0 → ~19.0.
    expect(added[0]!.t).toBeGreaterThan(18.8);
    expect(added[0]!.t).toBeLessThan(19.2);
    // Zeroing instead of pausing would need 6 fresh seconds after 17.0 → ~23.0.
    expect(added[0]!.t).toBeLessThan(22);
  });

  it("an excused frame that is NOT a body (a stop line ahead) pauses and resumes at once", () => {
    const segs: Array<[number, number, Partial<SimTick>?]> = [
      [4, 0],
      [3, 0, { nextStopLineM: 10 }],
      [3, 0],
    ];
    const b = bills(drive(tape(segs), PRIORITY).events);
    expect(b).toHaveLength(1);
    // 4 s (4.0–8.0) + 2 s after the line clears at 11.0 → the bill near 13.0.
    expect(b[0]!.t).toBeGreaterThan(12.8);
    expect(b[0]!.t).toBeLessThan(13.2);
    // The same tape per stop: the excused frames restart the clock and 4 + 3 never reach 6.
    expect(
      bills(drive(tape(segs), { ...PRIORITY, needlessStopPerStop: true }).events),
    ).toEqual([]);
  });

  it("a HELD recovery zeroes the sum: 5 s at 30 км/ч between two 4 s stops bills nothing", () => {
    expect(bills(drive(tape([[4, 0], [5, 30], [4, 0], [5, 30]]), PRIORITY).events)).toEqual([]);
  });

  it("…but a recovery that is not held does not: 3 s at 30 км/ч between them bills", () => {
    expect(bills(drive(tape([[4, 0], [3, 30], [4, 0], [5, 30]]), PRIORITY).events)).toHaveLength(1);
  });

  it("…and driving on below the recovery speed is not a recovery: 10 s at 18 км/ч between them bills", () => {
    expect(bills(drive(tape([[4, 0], [10, 18], [4, 0], [5, 30]]), PRIORITY).events)).toHaveLength(1);
  });

  it("leaving the through road zeroes it too (a calmed zone is not this road)", () => {
    expect(
      bills(drive(tape([[4, 0], [1, 18, { zone: "residential" as SimTick["zone"] }], [4, 0]]), PRIORITY).events),
    ).toEqual([]);
  });

  it("a short rest stays free: two 2 s stops add to 4 s, under the sustain", () => {
    expect(bills(drive(tape([[2, 0], [3, 18], [2, 0], [3, 18]]), PRIORITY).events)).toEqual([]);
  });
});

describe("arm (a) — the junction radius no longer acquits on the priority road", () => {
  const JUNCTION_ONLY: Partial<RuleEngineConfig> = { needlessStopEnabled: true, needlessStopJunctionExcuse: false };

  it("an 8 s stop with the junction 12 m away bills where the author dropped the arm", () => {
    expect(bills(drive(tape([[8, 0, { nextJunctionM: 12 }]]), JUNCTION_ONLY).events)).toHaveLength(1);
    expect(bills(drive(tape([[8, 0, { nextJunctionM: 12 }]]), PRIORITY).events)).toHaveLength(1);
  });

  it("every OTHER reason still acquits", () => {
    const reasons: Array<[string, Partial<SimTick>]> = [
      ["stop line 10 m", { nextStopLineM: 10 }],
      ["pedestrian 10 m", { vruAheadM: 10 }],
      ["queue 10 m", { leadGapM: 10 }],
      ["rail crossing", { railCrossing: "approach" }],
      ["curve advisory", { curveAdvisoryKmh: 30 }],
      ["narrow meeting", { narrowTwoWay: true }],
      ["red light", { nextStopLineControl: "trafficLight", nextStopLineState: "red", nextStopLineM: 60 }],
      ["ban zone", { noStopZone: true }],
      ["fog", { fog: true }],
      ["snow", { snow: true }],
    ];
    for (const [name, over] of reasons) {
      expect(bills(drive(tape([[10, 0, { nextJunctionM: 12, ...over }]]), PRIORITY).events), name).toEqual([]);
    }
  });

  it("a body seen within 45 m ahead excuses the stop while it is there and for 6 s after", () => {
    // Seen at 40 m for 2 s (4.0–6.0), then nothing: excused to 12.0, then 6 s more → ~18.0.
    const b = bills(drive(tape([[2, 0, { leadGapM: 40 }], [16, 0]]), PRIORITY).events);
    expect(b.length).toBeGreaterThan(0);
    expect(b[0]!.t).toBeGreaterThan(17.8);
    expect(b[0]!.t).toBeLessThan(18.3);
    // …and a stop that ends inside the settle is never billed.
    expect(bills(drive(tape([[2, 0, { leadGapM: 40 }], [7, 0], [5, 30]]), PRIORITY).events)).toEqual([]);
  });

  it("a body beyond 45 m is not a conflict", () => {
    const b = bills(drive(tape([[2, 0, { leadGapM: 60 }], [6, 0]]), PRIORITY).events);
    expect(b).toHaveLength(1);
    expect(b[0]!.t).toBeLessThan(10.2);
  });
});

describe("arm (c) — the card says why stopping on the priority road is the fault (THEO-4)", () => {
  it("the ruled bill carries the priority-road act, its title and both citations", () => {
    const [first] = bills(drive(stopAndGo(4, 3, 3, 18), PRIORITY).events);
    expect(first!.detail).toBe(NEEDLESS_STOP_ACT_PRIORITY_ROAD);
    expect(first!.titleBg).toBe("Спиране без причина по пътя с предимство");
    expect(first!.lawRef).toBe("ЗДвП чл. 24, ал. 2; чл. 50, ал. 1");
    // Severity and points are the row's, untouched.
    expect(first!.severityClass).toBe(VIOLATIONS.STOPPED_WITHOUT_CAUSE.severityClass);
    expect(first!.points).toBe(VIOLATIONS.STOPPED_WITHOUT_CAUSE.points);
  });

  it("only the ruled mode carries it — junction arm alone, or accrual alone, stays pooled", () => {
    const junctionOnly = bills(drive(tape([[8, 0]]), { ...PRIORITY, needlessStopPerStop: true }).events);
    const accrualOnly = bills(drive(tape([[8, 0]]), { ...PRIORITY, needlessStopJunctionExcuse: true }).events);
    expect(junctionOnly[0]!.detail).toBeUndefined();
    expect(accrualOnly[0]!.detail).toBeUndefined();
  });

  const copy = NEEDLESS_STOP_ACT_COPY[NEEDLESS_STOP_ACT_PRIORITY_ROAD]!;

  it("never claims what a frame can contradict", () => {
    // The junction exists; the card must not deny it, nor place it «напред».
    expect(copy.explanationBg).not.toContain("нито кръстовище");
    expect(copy.explanationBg).not.toMatch(/кръстовището напред/);
    // It cannot know the лепка is still behind or the waiter still waiting.
    expect(copy.explanationBg).not.toMatch(/колата зад теб|залепена/);
    // The 6 s is a detection threshold, never law: no seconds figure on the card.
    expect(copy.explanationBg).not.toMatch(/\d+\s*(s|сек)/);
    // It explains the decision: priority, why the junction is no reason, the adding up.
    expect(copy.explanationBg).toContain("пътя с предимство");
    expect(copy.explanationBg).toContain("престоите се събират");
  });

  it("both quotations are RETRIEVED verbatim from the act (ADR-002)", () => {
    const art24 = resolveLawRef({ act: "ЗДвП", ref: "чл. 24" });
    const art50 = resolveLawRef({ act: "ЗДвП", ref: "чл. 50" });
    expect(art24.found && art50.found).toBe(true);
    if (!art24.found || !art50.found) return;
    const quotes = [...copy.explanationBg.matchAll(/„([^“]+)“/g)].map((m) => m[1]!);
    expect(quotes).toHaveLength(2);
    expect(art50.unit.textBg.replace(/\s+/g, " ")).toContain(quotes[0]!);
    expect(art24.unit.textBg.replace(/\s+/g, " ")).toContain(quotes[1]!);
    expect(copy.explanationBg).toContain("(ЗДвП чл. 50, ал. 1)");
    expect(copy.explanationBg).toContain("(ЗДвП чл. 24, ал. 2)");
  });
});
