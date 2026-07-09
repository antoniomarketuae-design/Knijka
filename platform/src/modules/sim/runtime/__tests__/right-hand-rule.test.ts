import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { loadDistrict, mkVehicle } from "./helpers";
import type { SimTickEvent } from "../../rules/types";

function driveInJunction(
  rt: ReturnType<typeof createWorldRuntime>,
  j: { x: number; y: number },
): SimTickEvent[] {
  const events: SimTickEvent[] = [];
  let t = 0;
  for (let i = 0; i < 3; i++) {
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
});
