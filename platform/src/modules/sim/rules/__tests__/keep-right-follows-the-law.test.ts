/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — the reducer half.
 *
 * ЗДвП чл. 15, ал. 1 (retrieved from content/law/acts/zdvp.json, see the pin
 * test `keep-right-law-pins.test.ts`) puts the driver in the rightmost free
 * marked lane. Ал. 2 switches that duty OFF — the driver «може да използва за
 * движение най-удобната за него пътна лента» — in two live cases:
 *   т. 2  in a settlement, on a carriageway with two or more marked lanes one
 *         way, where the permitted speed is not above 80 km/h;
 *   т. 3  where entry to the lane is admitted by a light signal.
 * (т. 1 is repealed.)
 *
 * So NOT_KEEPING_RIGHT may only be billed where ал. 1 binds: OUTSIDE a
 * settlement, OR on a motorway, OR where the limit is above 80 km/h. A town
 * street with two marked lanes one way at 50 km/h is exactly т. 2: no bill.
 *
 * These fixtures are hand-built ticks (`fixtures.tick` defaults: 50 km/h, no
 * settlement flag = a town street). The built-world half — that the runtime
 * really publishes the settlement signal from the map — is
 * `runtime/__tests__/settlement-signal.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import { KEEP_RIGHT_TOWN_MAX_KMH } from "../types";
import type { SimTick } from "../types";

/** 21 s holding the LEFT lane of a two-lane bank at 45 km/h, indicator off. */
function hog(over: Partial<SimTick> = {}, seconds = 21): SimTick[] {
  return Array.from({ length: seconds }, (_, t) =>
    tick(t, { speedKmh: 45, laneId: 1, laneCount: 2, ...over }),
  );
}
const billed = (ticks: SimTick[]): boolean => codes(drive(ticks).events).includes("NOT_KEEPING_RIGHT");

describe("(a) ал. 2, т. 2 — a town street with 2+ marked lanes one way at ≤ 80 km/h bills nothing", () => {
  it("20 s in the left lane of a 2-lane town street at 50 km/h is NOT billed", () => {
    expect(billed(hog({ maxSpeedKmh: 50 }))).toBe(false);
  });

  it("the far-left lane of a 3-lane town bank at 60 km/h is NOT billed either", () => {
    expect(billed(hog({ maxSpeedKmh: 60, laneId: 2, laneCount: 3 }))).toBe(false);
  });

  it("exactly at the boundary (the limit IS 80, «не по-голяма от 80») is still т. 2 — no bill", () => {
    expect(KEEP_RIGHT_TOWN_MAX_KMH).toBe(80);
    expect(billed(hog({ maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH }))).toBe(false);
  });

  it("an explicit `outsideSettlement: false` is the same town street", () => {
    expect(billed(hog({ maxSpeedKmh: 50, outsideSettlement: false }))).toBe(false);
  });
});

describe("(b) ал. 1 binds — outside a settlement, on a motorway, or above 80 km/h, the same student IS billed", () => {
  it("outside a settlement, even at a posted 60, the left-lane stay is billed (each clause alone arms)", () => {
    expect(billed(hog({ maxSpeedKmh: 60, outsideSettlement: true }))).toBe(true);
  });

  it("on a motorway, even under a 50 limit, it is billed", () => {
    expect(billed(hog({ maxSpeedKmh: 50, motorway: true }))).toBe(true);
  });

  it("one km/h above the boundary (81) inside a settlement is billed — т. 2 no longer applies", () => {
    expect(billed(hog({ maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH + 1 }))).toBe(true);
  });

  it("at 90 inside a settlement flag-less (a fast arterial) it is billed", () => {
    expect(billed(hog({ maxSpeedKmh: 90 }))).toBe(true);
  });

  it("the bill lands on the same 12 s sustain as before — the ruling moves WHERE, never WHEN", () => {
    const { events } = drive(hog({ outsideSettlement: true }));
    const v = events.filter((e) => e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT");
    expect(v).toHaveLength(1);
    expect(v[0].t).toBe(12);
  });
});

describe("the other arming clauses still hold where ал. 1 binds", () => {
  it("a single-lane bank is never billed, even outside a settlement", () => {
    expect(billed(hog({ outsideSettlement: true, laneId: 1, laneCount: 1 }))).toBe(false);
  });

  it("the rightmost lane is never billed", () => {
    expect(billed(hog({ outsideSettlement: true, laneId: 0 }))).toBe(false);
  });

  it("a declared overtake (left indicator) stays exempt", () => {
    expect(billed(hog({ outsideSettlement: true, indicator: "left" }))).toBe(false);
  });

  it("a stint under the 12 s sustain is not billed", () => {
    expect(billed(hog({ outsideSettlement: true }, 11))).toBe(false);
  });

  it("unpainted lane lines disarm it exactly as before", () => {
    expect(billed(hog({ outsideSettlement: true, laneLinesPainted: false }))).toBe(false);
  });
});

describe("(d) seconds on a road where ал. 1 does NOT bind never count toward the 12 s (round 2, V3)", () => {
  /** `townSec` seconds in the left lane at a town limit, then the same lane under `then`. */
  function transition(townSec: number, then: Partial<SimTick>, total = 30): SimTick[] {
    return Array.from({ length: total }, (_, t) =>
      tick(t, {
        speedKmh: 45,
        laneId: 1,
        laneCount: 2,
        maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH,
        ...(t >= townSec ? then : {}),
      }),
    );
  }
  const billAt = (ticks: SimTick[]): number[] =>
    drive(ticks)
      .events.filter((e) => e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT")
      .map((e) => e.t);

  it("10 s at 80 (т. 2) then 81: the bill lands at 22 — 12 s after the limit rose — not at 12", () => {
    expect(billAt(transition(10, { maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH + 1 }))).toEqual([22]);
  });

  it("10 s in town then out of the settlement: the bill lands at 22, not at 12", () => {
    expect(billAt(transition(10, { outsideSettlement: true }))).toEqual([22]);
  });

  it("10 s in town then onto a motorway: the bill lands at 22, not at 12", () => {
    expect(billAt(transition(10, { motorway: true }))).toEqual([22]);
  });

  it("8 s where ал. 1 binds then back into town: no bill (the episode does not survive the town street)", () => {
    const ticks = Array.from({ length: 30 }, (_, t) =>
      tick(t, { speedKmh: 45, laneId: 1, laneCount: 2, maxSpeedKmh: t < 8 ? 90 : KEEP_RIGHT_TOWN_MAX_KMH }),
    );
    expect(billAt(ticks)).toEqual([]);
  });

  it("11 s where ал. 1 binds, 3 s of town street, 11 s where it binds again: no bill — the two stays are never added up", () => {
    const binds = (t: number) => t < 11 || t >= 14;
    const ticks = Array.from({ length: 25 }, (_, t) =>
      tick(t, { speedKmh: 45, laneId: 1, laneCount: 2, maxSpeedKmh: binds(t) ? 90 : KEEP_RIGHT_TOWN_MAX_KMH }),
    );
    expect(billAt(ticks)).toEqual([]);
    // …and one more second on the second stretch (14 → 26 is 12 s) is the bill.
    const longer = Array.from({ length: 30 }, (_, t) =>
      tick(t, { speedKmh: 45, laneId: 1, laneCount: 2, maxSpeedKmh: binds(t) ? 90 : KEEP_RIGHT_TOWN_MAX_KMH }),
    );
    expect(billAt(longer)).toEqual([26]);
  });

  it("an explicit `motorway: false` is not a motorway (a town street at 50 stays unbilled)", () => {
    expect(billed(hog({ maxSpeedKmh: 50, motorway: false }))).toBe(false);
  });
});

/** Every NOT_KEEPING_RIGHT bill of a drive, by time. */
const billTimes = (ticks: SimTick[]): number[] =>
  drive(ticks)
    .events.filter((e) => e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT")
    .map((e) => e.t);
/** `seconds` in the LEFT lane of a two-lane bank, each tick shaped by `at(t)`. */
const stint = (seconds: number, at: (t: number) => Partial<SimTick>): SimTick[] =>
  Array.from({ length: seconds }, (_, t) => tick(t, { speedKmh: 45, laneId: 1, laneCount: 2, ...at(t) }));

describe("(e) the clause is the LIMIT on the road, never the speed of the car (round 3, W1)", () => {
  // Every fixture above drives at 45 km/h, so until round 3 nothing told the
  // posted limit from the dial: the round-2 verifier wrote
  // `maxSpeedKmh > 80 || speedKmh > 80` and every test, 96 wider test files
  // and the 2,434-drive census stayed green — a student SPEEDING in the left
  // lane of a town boulevard would have been billed for the lane as well.
  // ал. 2, т. 2 reads «по които е РАЗРЕШЕНО движението … със скорост не
  // по-голяма от 80 кm/h»: the permitted speed, a property of the road.

  it("a car at 95 km/h in the left lane of a town street posted 50 is NOT billed NOT_KEEPING_RIGHT — its speeding is billed by its own rule", () => {
    const ticks = stint(25, () => ({ maxSpeedKmh: 50, speedKmh: 95 }));
    expect(billTimes(ticks)).toEqual([]);
    // …and the drive is not silent: the engine does see the speed, and bills THAT.
    const speeding = codes(drive(ticks).events).filter((c) => c.startsWith("SPEEDING"));
    expect(speeding.length).toBeGreaterThan(0);
    expect(speeding).toContain("SPEEDING_DANGEROUS");
  });

  it("the same at exactly the boundary: limit 80, car at 81 and at 140 — still т. 2, no bill", () => {
    expect(billTimes(stint(25, () => ({ maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH, speedKmh: KEEP_RIGHT_TOWN_MAX_KMH + 1 })))).toEqual([]);
    expect(billTimes(stint(25, () => ({ maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH, speedKmh: 140 })))).toEqual([]);
  });

  it("a car at 60 km/h on a road posted 90 IS billed — a slow car does not turn a fast road into a town street", () => {
    expect(billTimes(stint(25, () => ({ maxSpeedKmh: 90, speedKmh: 60 })))).toEqual([12]);
    // one km/h over the boundary on the sign, the car well under it
    expect(billTimes(stint(25, () => ({ maxSpeedKmh: KEEP_RIGHT_TOWN_MAX_KMH + 1, speedKmh: 30 })))).toEqual([12]);
  });

  it("a car that speeds up past 80 on a town street posted 50 does not start a keep-right stay either", () => {
    // 45 for 6 s, then 95 for 20 s: neither the whole stay nor the fast part bills.
    expect(billTimes(stint(26, (t) => ({ maxSpeedKmh: 50, speedKmh: t < 6 ? 45 : 95 })))).toEqual([]);
  });
});

describe("(f) the branches no committed map reaches yet, pinned so they cannot drift (round 3, W4)", () => {
  it("a town street with a BUS LANE does not arm the rule: three lanes, the far-left one, 25 s — no bill", () => {
    // busLaneRight moves the rightmost REQUIRED lane to laneId 1; it must never
    // become a reason for the duty to bind. Both bus-lane maps today have one
    // general lane per direction, so only this test holds the branch.
    expect(billTimes(stint(25, () => ({ maxSpeedKmh: 50, busLaneRight: true, laneId: 2, laneCount: 3 })))).toEqual([]);
    expect(billTimes(stint(25, () => ({ maxSpeedKmh: 50, emergencyLaneRight: true, laneId: 2, laneCount: 3 })))).toEqual([]);
    // …while where ал. 1 binds, the bus lane only shifts the required lane:
    // laneId 1 is home, laneId 2 is a left-lane stay.
    expect(billTimes(stint(25, () => ({ outsideSettlement: true, busLaneRight: true, laneId: 1, laneCount: 3 })))).toEqual([]);
    expect(billTimes(stint(25, () => ({ outsideSettlement: true, busLaneRight: true, laneId: 2, laneCount: 3 })))).toEqual([12]);
  });

  it("a town stretch ENDS the stay it interrupts: billed out of town, a town stretch, then a new 12 s out of town — billed a second time", () => {
    // If the town stretch did not clear «already billed», the driver who comes
    // back out of town and settles in the left lane again would never be billed
    // for it. No map mixes town and binding roads today; this holds the branch.
    const out = (t: number) => t < 14 || t >= 20;
    const ticks = stint(34, (t) => (out(t) ? { outsideSettlement: true, maxSpeedKmh: 90 } : { maxSpeedKmh: 50 }));
    expect(billTimes(ticks)).toEqual([12, 32]);
  });

  it("one continuing stay is billed ONCE, however long it lasts", () => {
    expect(billTimes(stint(60, () => ({ outsideSettlement: true })))).toEqual([12]);
    expect(billTimes(stint(60, () => ({ motorway: true, maxSpeedKmh: 140 })))).toEqual([12]);
  });

  it("the sustain is the same 12 s on every road where ал. 1 binds — out of town, on a motorway, at 81, 100 or 140", () => {
    for (const road of [
      { outsideSettlement: true, maxSpeedKmh: 60 },
      { motorway: true, maxSpeedKmh: 50 },
      { maxSpeedKmh: 81 },
      { maxSpeedKmh: 100 },
      { maxSpeedKmh: 120 },
      { motorway: true, maxSpeedKmh: 140 },
    ] as Partial<SimTick>[]) {
      expect(billTimes(stint(30, () => road)), JSON.stringify(road)).toEqual([12]);
    }
  });

  describe("UNPAINTED lane lines — the intended behaviour, stated", () => {
    // «Дясната пътна лента» is a painted object (doc 86 T1, the paint referent):
    // where the world draws no divider there is no rightmost lane to be out of,
    // so the stay ENDS there. A new painted stretch starts a NEW stay, counted
    // from its own first second; time on the two sides of an unpainted stretch
    // is never added up; and — exactly like the town stretch above — an
    // unpainted stretch after a bill lets a new stay be billed.
    const painted = (from: number, to: number) => (t: number) => ({ outsideSettlement: true, laneLinesPainted: !(t >= from && t < to) });

    it("8 s painted, 3 s unpainted, 8 s painted — no bill: the two stays are not added up", () => {
      expect(billTimes(stint(19, painted(8, 11)))).toEqual([]);
    });
    it("…and the second painted stay is billed 12 s after IT began (at 23), not 12 s after the first one did", () => {
      expect(billTimes(stint(30, painted(8, 11)))).toEqual([23]);
    });
    it("an armed timer does NOT run on through the unpainted stretch: 11 s painted, 1 s unpainted, then painted — bill at 24, not at 12", () => {
      expect(billTimes(stint(30, painted(11, 12)))).toEqual([24]);
    });
    it("billed, then an unpainted stretch, then 12 painted seconds — billed again", () => {
      expect(billTimes(stint(40, painted(14, 17)))).toEqual([12, 29]);
    });
    it("a road that is unpainted throughout is never billed, wherever it is", () => {
      expect(billTimes(stint(40, () => ({ motorway: true, maxSpeedKmh: 140, laneLinesPainted: false })))).toEqual([]);
    });
  });
});

// (c) ал. 2, т. 3 — a lane admitted by a light signal — is NOT a SimTick
// channel: no district carries a per-lane admission signal on a multi-lane
// carriageway. The one lane-control gantry (lc-gantry-v1) stands over two
// single-lane one-way edges, so laneCount > 1 already keeps the rule silent
// there; `runtime/__tests__/settlement-signal.test.ts` measures that on the
// committed maps.
