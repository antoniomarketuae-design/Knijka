import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { loadDistrict, mkVehicle } from "./helpers";
import type { SimTickEvent } from "../../rules/types";

type PriorityEvent = Extract<SimTickEvent, { kind: "prioritySituation" }>;

// The district has one roundabout (rb-1). Approach it from the south heading
// inward; circulating-traffic presence is stubbed via setCirculatingQuery.
function approach(
  rt: ReturnType<typeof createWorldRuntime>,
  opts: { speedKmh: number; frames?: number; leave?: boolean },
): PriorityEvent[] {
  const rb = rt.district.roundabouts[0];
  const events: SimTickEvent[] = [];
  let t = 0;
  const frames = opts.frames ?? 4;
  for (let i = 0; i < frames; i++) {
    t += 0.1;
    rt.update(0.1);
    // 22 m south of the centre, pointing north (into the ring).
    const tick = rt.sample(
      mkVehicle({ x: rb.x, y: rb.y - 22, headingDeg: 0 }, { speedKmh: opts.speedKmh }),
      t,
      false,
    );
    events.push(...tick.events);
  }
  if (opts.leave) {
    t += 0.1;
    rt.update(0.1);
    const tick = rt.sample(
      mkVehicle({ x: rb.x + 100000, y: rb.y + 100000, headingDeg: 0 }, { speedKmh: 20 }),
      t,
      false,
    );
    events.push(...tick.events);
  }
  return events.filter((e): e is PriorityEvent => e.kind === "prioritySituation");
}

describe("roundabout-entry yield", () => {
  it("has a roundabout to test against", () => {
    const rt = createWorldRuntime(loadDistrict());
    expect(rt.district.roundabouts.length).toBeGreaterThan(0);
  });

  it("flags entering at speed while a car circulates from the left", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setCirculatingQuery(() => true);
    const priority = approach(rt, { speedKmh: 20 });
    expect(priority).toContainEqual({
      kind: "prioritySituation",
      situation: "roundabout",
      violated: true,
    });
  });

  it("emits nothing when the ring is clear (default query)", () => {
    const rt = createWorldRuntime(loadDistrict());
    const priority = approach(rt, { speedKmh: 20 }).filter((e) => e.situation === "roundabout");
    expect(priority).toHaveLength(0);
  });

  it("commends a driver who crawls to let circulating traffic pass", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setCirculatingQuery(() => true);
    const priority = approach(rt, { speedKmh: 2, frames: 5, leave: true }).filter(
      (e) => e.situation === "roundabout",
    );
    expect(priority).toContainEqual({
      kind: "prioritySituation",
      situation: "roundabout",
      violated: false,
      yielded: true,
    });
    expect(priority).not.toContainEqual(
      expect.objectContaining({ situation: "roundabout", violated: true }),
    );
  });
});
