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
    const priority = approach(rt, { speedKmh: 20, frames: 14 }); // ≥ the C1 conviction sustain
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

// ---------------------------------------------------------------------------
// C1 revision — circulating latch + braking-response band
// ---------------------------------------------------------------------------

describe("roundabout yield tolerance bands (C1)", () => {
  it("never grades a vehicle already circulating the ring as a barging entry", () => {
    // Innocent: the ring polyline is polygonal, so a lawfully circulating
    // vehicle points "inward" beyond the entry threshold at every corner
    // while the loop actor keeps circulating behind it — the C1 exam-bank
    // bot was convicted 70 m PAST a lawful, yielded entry (shells D/G).
    // Once the azimuth has swept ≥ 35° this visit, entry grading stands down.
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    rt.setCirculatingQuery(() => true);
    const events: SimTickEvent[] = [];
    const r = rb.radius + 1;
    let t = 0;
    // CCW sweep from the south mouth: first 36° riding the tangent, then with
    // a 25° inward lean (the polygon-corner heading) for another 100°.
    for (let step = 0; step < 46; step++) {
      const azDeg = 180 - step * 3; // compass azimuth of the position
      const az = (azDeg * Math.PI) / 180;
      const inwardLean = step * 3 > 36 ? 25 : 0;
      const heading = (((azDeg - 90 - inwardLean) % 360) + 360) % 360;
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(
        mkVehicle(
          { x: rb.x + r * Math.sin(az), y: rb.y + r * Math.cos(az), headingDeg: heading },
          { speedKmh: 20 },
        ),
        t,
        false,
      );
      events.push(...tick.events);
    }
    const violated = events.filter((e) => e.kind === "prioritySituation" && e.violated);
    expect(violated).toHaveLength(0);
  });

  it("never convicts an entry approach braking hard for circulating traffic", () => {
    // Innocent: the staged "tight" gap appears inside braking distance; the
    // correct reaction (hard brake to the yield line) must not grade
    // (C1 exam-bank FP, shell F at the NW mouth).
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    rt.setCirculatingQuery(() => true);
    const events: SimTickEvent[] = [];
    let t = 0;
    const speeds = [30, 28.6, 27.2, 25.8, 24.4, 23, 21.6, 20.2, 18.8, 17.4, 16, 14.6, 13.2, 11.8, 10.4, 9, 7.6, 6.2, 4.8, 3.4, 2, 0.6, 0];
    for (let i = 0; i < speeds.length; i++) {
      t += 0.1;
      rt.update(0.1);
      // Radial approach from the south, easing from 34 m to ~24 m out.
      const d = Math.max(24, 34 - i * 0.7);
      const tick = rt.sample(
        mkVehicle({ x: rb.x, y: rb.y - d, headingDeg: 0 }, { speedKmh: speeds[i] }),
        t,
        false,
      );
      events.push(...tick.events);
    }
    const violated = events.filter((e) => e.kind === "prioritySituation" && e.violated);
    expect(violated).toHaveLength(0);
  });

  it("D1 guard-rail: a SUSTAINED-braking barger entering the ring still grades", () => {
    // Guilty: drives at the entry mouth pointed into the ring at 40 km/h and
    // rides the brake at a steady ~3 m/s² without ever stopping or yielding
    // while traffic circulates. The braking-response band is a reaction
    // window, not a transit pass — immunity must expire once the response
    // horizon has elapsed with the driver still pushing into the ring.
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    rt.setCirculatingQuery(() => true);
    const events: SimTickEvent[] = [];
    let t = 0;
    // 36 frames = 3.6 s; 1.08 km/h per 0.1 s frame = 3.0 m/s² throughout.
    // Fixed pose at the south mouth, heading north (inward = 1): azimuth
    // never sweeps, so the circulating latch stays off — this is an ENTRY.
    for (let i = 0; i < 36; i++) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(
        mkVehicle({ x: rb.x, y: rb.y - (rb.radius + 4), headingDeg: 0 }, { speedKmh: 40 - 1.08 * i }),
        t,
        false,
      );
      events.push(...tick.events);
    }
    const violated = events.filter((e) => e.kind === "prioritySituation" && e.violated);
    expect(violated.length).toBeGreaterThan(0);
  });
});
