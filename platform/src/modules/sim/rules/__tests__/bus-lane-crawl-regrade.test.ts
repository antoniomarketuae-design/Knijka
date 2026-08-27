import { describe, expect, it } from "vitest";
import { codes, cruise, drive, tick } from "./fixtures";
import type { RuleEvent, SimTick, ViolationEvent } from "../types";

/**
 * THE 2026-08-27 (w13) BUS-LANE ROW — `sc-ov-bus-lane:b309af77`, critical.
 *
 * THE LESSON THAT COULD NOT GRADE ITS OWN SUBJECT. `sc-ov-bus-lane` is a pure
 * lane-choice drill — no staged actor, ambient zero — whose spec says „the only
 * gradable act is which lane the driver travels" and whose briefing says
 * «движението на автомобили в бус лентата е забранено, дори тя да е празна».
 * Both audited legs finished with that act ungraded:
 *   `.audit-frames/w13/frames/sc-ov-bus-lane__pc-right/_audit-debrief.json`
 *     «Грешки (4)» — mirror, indicator, mirror, lane-keeping. No bus-lane row.
 *   `…__pc-wrong/_audit-debrief.json`
 *     «Грешки (2)» — both «Превишена скорост», on the leg whose authored
 *     mistake is «Пътуване по бус лентата».
 *
 * TWO CAUSES, BOTH IN THE REDUCER, BOTH ALREADY-SOLVED PATTERNS IN IT:
 *  1 · the 4 s sustain demanded CONSECUTIVE seconds, and `busLaneCruise`
 *      carries `moving` (> 5 км/ч). The right leg's own run.log ladder —
 *      45 · 1 · 0 · 0 · 1 · 3 · 0 · 12 · 3 · 0 · 4 · 15 · 9 · 0 · 10 · 16 · 0 · 3 · 14 —
 *      never holds four unbroken seconds above 5 in 208 s. The stop-start creep
 *      past a queue IS the fault's shape (verbatim `stepAccruedEpisode`'s own
 *      motorway-crawl case).
 *  2 · the single bill was spent on the teach-first free lesson
 *      (`ev-lane-discipline` → „teach-first-then-grade"), so even the fast leg
 *      charged nothing — verbatim `STANDING_DUTY_REGRADE_SEC` /
 *      `MOTORWAY_CRAWL_REGRADE_SEC`.
 *
 * Every case here is paired with its opposite, so the repair cannot be a
 * loosening: the drive that must convict sits next to the drive that must stay
 * clean. The detector's own gates (≤3 s transit, declared right indicator,
 * single-lane span, reverse) are unchanged and stay pinned in
 * `line-marking-detectors.test.ts`.
 */

const BUS = { laneId: 0, laneCount: 2, busLaneRight: true } as const;

function violationsOf(events: RuleEvent[], code: string): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === code);
}

/**
 * ONE CREEP of the photographed ladder at 4 Hz: launch, a short plateau above
 * `movingSpeedKmh`, brake, rest. 3 s long, of which ~1.25 s qualifies — under
 * the 4 s sustain on its own, which is exactly why the old consecutive clock
 * could never bank it.
 */
function creep(t0: number, kmh: number, over: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  let t = t0;
  for (let i = 1; i <= 2; i += 1) {
    out.push(tick(t, { ...BUS, speedKmh: (kmh * i) / 2, ...over }));
    t += 0.25;
  }
  for (let i = 0; i < 5; i += 1) {
    out.push(tick(t, { ...BUS, speedKmh: kmh, ...over }));
    t += 0.25;
  }
  for (let i = 1; i >= 0; i -= 1) {
    out.push(tick(t, { ...BUS, speedKmh: (kmh * i) / 2, ...over }));
    t += 0.25;
  }
  for (let i = 0; i < 4; i += 1) {
    out.push(tick(t, { ...BUS, speedKmh: 0, ...over }));
    t += 0.25;
  }
  return out;
}

/** N creeps back to back, all inside the span and never leaving lane 0. */
function crawlThroughBusLane(n: number, kmh = 14, over: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  for (let i = 0; i < n; i += 1) out.push(...creep(i * 3, kmh, over));
  return out;
}

describe("DRIVING_IN_BUS_LANE — the crawl the lesson is about (w13 b309af77)", () => {
  it("a stop-start creep down the bus lane is convicted, though no 4 s is unbroken", () => {
    const { events } = drive(crawlThroughBusLane(6));
    const v = violationsOf(events, "DRIVING_IN_BUS_LANE");
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
    // No frame of that drive holds above `movingSpeedKmh` for four consecutive
    // seconds — the plateau is 1.25 s — so this is the accrual and nothing else.
  });

  it("…and the SAME creep in the GENERAL lane stays clean (the opposite drive)", () => {
    const { events } = drive(
      crawlThroughBusLane(6).map((f) => ({ ...f, laneId: 1 })), // general lane, span still armed
    );
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("a creep that pulls out into the general lane before 4 accrued seconds is clean", () => {
    // Two creeps (≈2.5 qualifying seconds), then out — the reset zeroes the
    // ledger, which is what the lesson asks the student to do.
    const { events } = drive([
      ...crawlThroughBusLane(2),
      ...cruise(7, 20, { speedKmh: 20, laneId: 1, laneCount: 2, busLaneRight: true }),
    ]);
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("a declared RIGHT-turn creep to the curb never accrues, however long it crawls", () => {
    const { events } = drive(crawlThroughBusLane(8, 14, { indicator: "right" }));
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("a single-lane road with a degenerate span never convicts, crawl or not", () => {
    const { events } = drive(crawlThroughBusLane(8, 14, { laneCount: 1 }));
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("reverse manoeuvring against the curb never convicts", () => {
    const { events } = drive(crawlThroughBusLane(8, 14, { gear: -1 }));
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });
});

describe("DRIVING_IN_BUS_LANE — the bill the free lesson consumed", () => {
  it("one continuous cruise bills twice: the teach's bill, then one marked re-grade", () => {
    // 4 s sustain + 6 s BUS_LANE_REGRADE_SEC = the second bill lands at t = 10.
    const { events } = drive(cruise(0, 30, { ...BUS, speedKmh: 40 }));
    const v = violationsOf(events, "DRIVING_IN_BUS_LANE");
    expect(v).toHaveLength(2);
    expect(v[0].regrade).not.toBe(true);
    expect(v[1].regrade).toBe(true);
    expect(v[1].t).toBeGreaterThan(v[0].t);
  });

  it("and never a third, however long the cruise runs", () => {
    const { events } = drive(cruise(0, 200, { ...BUS, speedKmh: 40 }));
    expect(violationsOf(events, "DRIVING_IN_BUS_LANE")).toHaveLength(2);
  });

  it("the first bill's instant is unchanged — the re-grade is purely additive", () => {
    const { events } = drive(cruise(0, 30, { ...BUS, speedKmh: 40 }));
    const v = violationsOf(events, "DRIVING_IN_BUS_LANE");
    expect(v[0].t).toBe(4); // cfg.busLaneSustainSec, exactly as before the repair
  });

  it("a genuine correction ends the episode: pulling out re-arms both bills", () => {
    const { events } = drive([
      ...cruise(0, 6, { ...BUS, speedKmh: 40 }), // first bill at t = 4
      ...cruise(7, 12, { speedKmh: 40, laneId: 1, laneCount: 2, busLaneRight: true }), // out
      ...cruise(13, 18, { ...BUS, speedKmh: 40 }), // back in — a SECOND act
    ]);
    const v = violationsOf(events, "DRIVING_IN_BUS_LANE");
    // Two acts, each billed once; neither ran long enough for its re-grade.
    expect(v).toHaveLength(2);
    expect(v.every((x) => x.regrade !== true)).toBe(true);
  });

  it("a clean drive down the general lane past the span books nothing at all", () => {
    const { events } = drive(
      cruise(0, 60, { speedKmh: 45, laneId: 1, laneCount: 2, busLaneRight: true }),
    );
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });
});
