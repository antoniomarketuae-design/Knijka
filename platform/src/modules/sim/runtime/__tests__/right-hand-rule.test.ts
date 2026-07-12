import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { RHR_CORE_RADIUS_M } from "../worldRuntime";
import { loadDistrict, mkVehicle } from "./helpers";
import type { SimTickEvent } from "../../rules/types";

function driveInJunction(
  rt: ReturnType<typeof createWorldRuntime>,
  j: { x: number; y: number },
): SimTickEvent[] {
  const events: SimTickEvent[] = [];
  let t = 0;
  for (let i = 0; i < 14; i++) { // ≥ the C1 conviction sustain
    t += 0.1;
    rt.update(0.1);
    const tick = rt.sample(mkVehicle({ x: j.x, y: j.y, headingDeg: 0 }, { speedKmh: 20 }), t, false);
    events.push(...tick.events);
  }
  return events;
}

describe("right-hand-rule (uncontrolled junction) emission", () => {
  it("classifies uncontrolled equal junctions", () => {
    const rt = createWorldRuntime(loadDistrict());
    expect(rt.debugUncontrolledJunctions().length).toBeGreaterThan(0);
  });

  it("emits a violated prioritySituation with a car coming from the right", () => {
    const rt = createWorldRuntime(loadDistrict());
    const j = rt.debugUncontrolledJunctions()[0];
    rt.setRightConflictQuery(() => true); // a car is coming from the right
    const priority = driveInJunction(rt, j).filter((e) => e.kind === "prioritySituation");
    expect(priority).toContainEqual({
      kind: "prioritySituation",
      situation: "right-hand-rule",
      violated: true,
    });
  });

  it("emits nothing when the right is clear (default query)", () => {
    const rt = createWorldRuntime(loadDistrict());
    const j = rt.debugUncontrolledJunctions()[0];
    const priority = driveInJunction(rt, j).filter((e) => e.kind === "prioritySituation");
    expect(priority).toHaveLength(0);
  });

  it("commends a driver who slows for a car from the right and yields", () => {
    const rt = createWorldRuntime(loadDistrict());
    const j = rt.debugUncontrolledJunctions()[0];
    rt.setRightConflictQuery(() => true); // a car is approaching from the right
    const events: SimTickEvent[] = [];
    let t = 0;
    // Crawl inside the junction area but outside the core, at yield speed, while
    // the conflicting car passes — no barging in, so no violation.
    for (let i = 0; i < 5; i++) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(
        mkVehicle({ x: j.x + RHR_CORE_RADIUS_M + 4, y: j.y, headingDeg: 0 }, { speedKmh: 6 }),
        t,
        false,
      );
      events.push(...tick.events);
    }
    // Then drive well clear of the junction → yield credit awarded on exit.
    t += 0.1;
    rt.update(0.1);
    const leave = rt.sample(
      mkVehicle({ x: j.x + 100000, y: j.y + 100000, headingDeg: 0 }, { speedKmh: 20 }),
      t,
      false,
    );
    events.push(...leave.events);

    const priority = events.filter((e) => e.kind === "prioritySituation");
    expect(priority).toContainEqual({
      kind: "prioritySituation",
      situation: "right-hand-rule",
      violated: false,
      yielded: true,
    });
    // …and it must NOT also be flagged as a failure to yield.
    expect(priority).not.toContainEqual(
      expect.objectContaining({ situation: "right-hand-rule", violated: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// C1 revision — braking-response band
// ---------------------------------------------------------------------------

describe("RHR braking-response band (C1)", () => {
  it("never convicts a driver braking hard toward the conflict", () => {
    // Innocent: a staged "late" arrival materialises inside the physical
    // braking distance; the correct reaction — braking hard to a stop at the
    // core boundary — must not grade as barging (C1 exam-bank FP, shell G).
    const rt = createWorldRuntime(loadDistrict());
    const j = rt.debugUncontrolledJunctions()[0];
    rt.setRightConflictQuery(() => true);
    const events: SimTickEvent[] = [];
    let t = 0;
    // Enter the core decelerating ~5.5 m/s² (25 → 0 km/h over ~1.3 s).
    const speeds = [25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 0];
    for (let i = 0; i < speeds.length; i++) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(
        mkVehicle({ x: j.x + Math.max(0, 8 - i), y: j.y, headingDeg: 270 }, { speedKmh: speeds[i] }),
        t,
        false,
      );
      events.push(...tick.events);
    }
    const violated = events.filter(
      (e) => e.kind === "prioritySituation" && e.violated,
    );
    expect(violated).toHaveLength(0);
  });

  it("guard-rail: a brake-tap barger who releases and rolls through still grades", () => {
    const rt = createWorldRuntime(loadDistrict());
    const j = rt.debugUncontrolledJunctions()[0];
    rt.setRightConflictQuery(() => true);
    const events: SimTickEvent[] = [];
    let t = 0;
    // Slows 25 → 20, then holds 20 through the core: the brake released.
    const speeds = [25, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20];
    for (let i = 0; i < speeds.length; i++) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(
        mkVehicle({ x: j.x, y: j.y, headingDeg: 270 }, { speedKmh: speeds[i] }),
        t,
        false,
      );
      events.push(...tick.events);
    }
    const violated = events.filter(
      (e) => e.kind === "prioritySituation" && e.violated,
    );
    expect(violated.length).toBeGreaterThan(0);
  });
});
