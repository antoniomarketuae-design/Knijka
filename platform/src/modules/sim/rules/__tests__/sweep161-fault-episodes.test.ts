import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import type { SimTick } from "../types";

/**
 * THE 2026-08-17 CATALOGUE SWEEP — three episode defects in the reducer.
 *
 * Every case here is pinned to a frame under `.audit-frames/sweep161`, and each
 * is paired with its opposite so the fix cannot be a loosening: the drive that
 * SHOULD convict is asserted next to the drive that must stay clean.
 *
 *  1 · the motorway crawl clock was reset by the crawl's own stops
 *      (`sc-mw-min-speed`, `sc-mw-discipline` — 0 points on the lesson named
 *      «не пълзи», 28 full stops, top speed 15 км/ч);
 *  2 · a rest on a rail band the car never approached was a 10-point опасна
 *      (`sc-pk-rail-ban / pc-right` — the whole of a correct drive's debrief,
 *      fired at 0 км/ч on a street with no crossing in the frame);
 *  3 · WRONG_WAY re-armed on a single frame of lawful direction, so one
 *      stretch of road became five опасни (`sc-ac-wind-truck-pass / pc-right`
 *      — «Движение в обратна посока по еднопосочна улица ×5», 50 наказателни
 *      т. against a sheet that allows 9).
 */

// ---------------------------------------------------------------------------
// 1 · the motorway chicane
// ---------------------------------------------------------------------------

/** A motorway frame: 140 limit, 3-lane bank, curb lane = emergency (laneId 1). */
const mw = (t: number, over: Parameters<typeof tick>[1] = {}) =>
  tick(t, {
    maxSpeedKmh: 140,
    motorway: true,
    emergencyLaneRight: true,
    laneId: 1,
    laneCount: 3,
    ...over,
  });

/**
 * ONE CREEP of the measured chicane, at 4 Hz: launch to `kmh`, hold it, brake,
 * rest. 4.5 s long, of which only the 1.5 s plateau is inside the steady band —
 * the launch and the brake carry |a| ≈ 3 m/s² and the rest is under
 * `movingSpeedKmh`, so three quarters of the creep never qualifies and never
 * did. This is the shape `pc-right` drove for 205 s.
 */
function creep(t0: number, kmh: number): SimTick[] {
  const out: SimTick[] = [];
  let t = t0;
  for (let i = 1; i <= 4; i += 1) {
    out.push(mw(t, { speedKmh: (kmh * i) / 4 }));
    t += 0.25;
  }
  for (let i = 0; i < 6; i += 1) {
    out.push(mw(t, { speedKmh: kmh }));
    t += 0.25;
  }
  for (let i = 3; i >= 0; i -= 1) {
    out.push(mw(t, { speedKmh: (kmh * i) / 4 }));
    t += 0.25;
  }
  for (let i = 0; i < 4; i += 1) {
    out.push(mw(t, { speedKmh: 0 }));
    t += 0.25;
  }
  return out;
}

const crawl = (cycles: number, t0 = 0, kmh = 11): SimTick[] =>
  Array.from({ length: cycles }, (_, i) => creep(t0 + i * 4.5, kmh)).flat();

const crawlBills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY").length;

describe("motorway crawl — the stop-start chicane the old clock could not book", () => {
  it("books the crawl a stop-start creep never held for 4 consecutive seconds", () => {
    // 3 creeps = 13.5 s of road carrying 4.5 s of qualifying plateau. Under the
    // consecutive clock this was 0 bills — the reset arrived every 1.5 s.
    expect(crawlBills(crawl(3))).toBe(1);
  });

  it("…and 205 s of it is still ONE bill, not one per creep", () => {
    expect(crawlBills(crawl(45))).toBe(1);
  });

  it("a lawful merge from rest up to cruise never accrues a second", () => {
    // 0 → 130 km/h at ~2.5 m/s²: every frame of the sub-50 band is a transition,
    // so the ledger stays empty however long the merge takes.
    const ticks: SimTick[] = [];
    for (let i = 0; i <= 58; i += 1) ticks.push(mw(i * 0.25, { speedKmh: Math.min(130, i * 2.25) }));
    expect(crawlBills(ticks)).toBe(0);
  });

  it("a genuine recovery ZEROES the ledger — two short stints never add up", () => {
    // The guard against the naive fix: 2 creeps (3 s accrued), a real recovery
    // to the flow floor, then 2 more (3 s). A session-wide accumulator would
    // bill; a per-episode one must not.
    const ticks: SimTick[] = [
      ...crawl(2, 0),
      ...Array.from({ length: 12 }, (_, i) => mw(9 + i * 0.25, { speedKmh: 110 })),
      ...crawl(2, 12),
    ];
    expect(crawlBills(ticks)).toBe(0);
  });

  it("…and a second crawl AFTER that recovery still bills on its own merits", () => {
    const ticks: SimTick[] = [
      ...crawl(3, 0),
      ...Array.from({ length: 12 }, (_, i) => mw(13.5 + i * 0.25, { speedKmh: 110 })),
      ...crawl(3, 16.5),
    ];
    expect(crawlBills(ticks)).toBe(2);
  });

  it("a queue crawl behind a lead is still innocent — congestion is a cause", () => {
    expect(crawlBills(crawl(6).map((f) => ({ ...f, leadGapM: 18 })))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · a rest on a band the car never approached
// ---------------------------------------------------------------------------

describe("rail rest — the entry gate the RX-03 case was missing", () => {
  it("a car that materialises AT REST on the band is not convicted of the прелез rule", () => {
    // `sc-pk-rail-ban / pc-right`, t=117 s: 0 км/ч, empty street, no rails and
    // no А34 in the frame, and «Нарушение на правилата за жп прелез −10» is the
    // entire debrief of a correct drive. No "approach" frame ever arrived, and
    // the two ENTRY cases already refuse to grade on that ground.
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) => tick(t, { speedKmh: 0, railCrossing: "on" }));
    expect(codes(drive(ticks).events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("a car that DROVE onto the band and stopped there is convicted exactly as before", () => {
    // The opposite direction: the RX-03 kill itself. Approach seen, stop made
    // before the band (so the entry is innocent), then a freeze on the rails.
    const ticks = [
      tick(0, { speedKmh: 20, railCrossing: "approach" }),
      tick(1, { speedKmh: 0, railCrossing: "approach" }),
      tick(2, { speedKmh: 0, railCrossing: "approach" }),
      tick(3, { speedKmh: 10, railCrossing: "on" }),
      tick(4, { speedKmh: 0, railCrossing: "on" }),
      tick(5, { speedKmh: 0, railCrossing: "on" }),
      tick(6, { speedKmh: 0, railCrossing: "on" }),
      tick(7, { speedKmh: 15, railCrossing: "on" }),
    ];
    const v = drive(ticks).events.filter(
      (e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION",
    );
    expect(v).toHaveLength(1);
    expect(v[0].kind === "violation" && v[0].detail).toBe("stopped-on-track");
  });
});

// ---------------------------------------------------------------------------
// 3 · the wrong-way flicker
// ---------------------------------------------------------------------------

/** `wrongWay` true for `onSec`, then false for `offSec`, `cycles` times, at 2 Hz. */
function flicker(cycles: number, onSec: number, offSec: number): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (let c = 0; c < cycles; c += 1) {
    for (let s = 0; s < onSec * 2; s += 1) {
      out.push(tick(t, { speedKmh: 16, wrongWay: true }));
      t += 0.5;
    }
    for (let s = 0; s < offSec * 2; s += 1) {
      out.push(tick(t, { speedKmh: 16 }));
      t += 0.5;
    }
  }
  return out;
}

const wrongWayBills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "WRONG_WAY").length;

describe("wrong-way — one run, one bill", () => {
  it("a signal that flickers five times over one stretch bills ONCE, not five 10-point опасни", () => {
    // `sc-ac-wind-truck-pass / pc-right` at 13–16 км/ч: five «Движение в обратна
    // посока по еднопосочна улица», 50 наказателни т. on a 9-point sheet.
    expect(wrongWayBills(flicker(5, 2, 1))).toBe(1);
  });

  it("two genuinely separate runs, with the lawful direction HELD between them, still bill twice", () => {
    // The opposite direction: the re-arm is a hysteresis, not an amnesty. 5 s
    // the right way round is longer than WRONG_WAY_REARM_SEC.
    expect(wrongWayBills(flicker(2, 2, 5))).toBe(2);
  });

  it("a single sustained run is unchanged — it still fires on the sustain", () => {
    const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25, wrongWay: true }));
    expect(wrongWayBills(ticks)).toBe(1);
  });

  it("driving the right way round never bills, however long", () => {
    const ticks = Array.from({ length: 40 }, (_, i) => tick(i, { speedKmh: 25 }));
    expect(wrongWayBills(ticks)).toBe(0);
  });
});
