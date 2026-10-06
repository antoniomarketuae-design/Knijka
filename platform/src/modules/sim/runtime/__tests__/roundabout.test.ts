import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { loadDistrict, mkVehicle } from "./helpers";
import type { SimTickEvent } from "../../rules/types";
import type { CirculatingQueryReport } from "../worldRuntime";
import { BUSY_RING, ringReport, type StubCar } from "./circulatingStub";

type PriorityEvent = Extract<SimTickEvent, { kind: "prioritySituation" }>;

/**
 * The real district's one roundabout (rb-1), approached radially from the
 * south. Since the founder ruling of 2026-10-05 («bill forced braking») an
 * entry is convicted on what a circulating car HAD TO DO because of it — the
 * speed the car shed for him while his nose was on the ring and he was moving,
 * or a touch — never on a car merely being there. So each test says what the
 * car did (`circulatingStub.ts`); the full behaviour table is
 * `roundabout-forced-braking.test.ts`, on a ring whose geometry is exact.
 */
function approach(
  rt: ReturnType<typeof createWorldRuntime>,
  opts: {
    /** Speed per frame, км/ч (a number = constant). */
    speedKmh: number | ((i: number) => number);
    /** Distance from the centre at the first / last frame, m. */
    fromM?: number;
    toM?: number;
    frames?: number;
    ring: (dM: number, i: number) => CirculatingQueryReport;
    leave?: boolean;
  },
): PriorityEvent[] {
  const rb = rt.district.roundabouts[0];
  const events: SimTickEvent[] = [];
  let t = 0;
  let d = opts.fromM ?? 34;
  const toM = opts.toM ?? rb.radius + 1;
  rt.setCirculatingQuery(() => opts.ring(d, i));
  let i = 0;
  const frames = opts.frames ?? 400;
  for (; i < frames; i++) {
    const kmh = typeof opts.speedKmh === "number" ? opts.speedKmh : opts.speedKmh(i);
    d = Math.max(toM, d - (kmh / 3.6) * 0.1);
    t += 0.1;
    rt.update(0.1);
    const tick = rt.sample(mkVehicle({ x: rb.x, y: rb.y - d, headingDeg: 0 }, { speedKmh: kmh }), t, false);
    events.push(...tick.events);
    if (d <= toM && typeof opts.speedKmh === "number" && opts.frames === undefined) break;
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
  return events.filter((e): e is PriorityEvent => e.kind === "prioritySituation" && e.situation === "roundabout");
}

/** A car going round the ring on its centreline, on his left (west side). */
function carOnRing(rt: ReturnType<typeof createWorldRuntime>, extra: Partial<StubCar> = {}): StubCar {
  return { id: 7, azDeg: 230, radiusM: rt.district.roundabouts[0].radius, speedMps: 5, shedMps: 0, ...extra };
}

describe("roundabout-entry yield", () => {
  it("has a roundabout to test against", () => {
    const rt = createWorldRuntime(loadDistrict());
    expect(rt.district.roundabouts.length).toBeGreaterThan(0);
  });

  it("bills an entry that makes a circulating car brake — once", () => {
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const car = carOnRing(rt);
    const priority = approach(rt, {
      speedKmh: 20,
      ring: () => {
        car.shedMps += 0.25; // braking for him from 34 m out, all the way in
        return ringReport(rb, [car]);
      },
    });
    expect(priority).toEqual([{ kind: "prioritySituation", situation: "roundabout", violated: true }]);
  });

  it("the conviction lands where his nose crosses onto the ring carriageway, not before", () => {
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const enterM = rt.debugRoundaboutZones()[0]!.enterReachM;
    const car = carOnRing(rt);
    rt.setCirculatingQuery(() => {
      car.shedMps += 0.5; // over the 0.3 m/s line in a single frame
      return ringReport(rb, [car]);
    });
    const stepM = (20 / 3.6) * 0.1;
    let billedAtM: number | null = null;
    let t = 0;
    for (let d = 34; d > rb.radius + 1 && billedAtM === null; d -= stepM) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(mkVehicle({ x: rb.x, y: rb.y - d, headingDeg: 0 }, { speedKmh: 20 }), t, false);
      if (tick.events.some((e) => e.kind === "prioritySituation" && e.situation === "roundabout" && e.violated)) {
        billedAtM = d;
      }
    }
    expect(billedAtM).not.toBeNull();
    // The nose is the centre carried 2.02 m (half the chassis) along the
    // heading: the first 0.1 s frame at or inside enterM + 2.02.
    expect(billedAtM!).toBeLessThanOrEqual(enterM + 2.02 + 1e-9);
    expect(billedAtM!).toBeGreaterThan(enterM + 2.02 - stepM);
  });

  it("does NOT bill the same 20 км/ч entry when the car is merely THERE — presence convicts nobody", () => {
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const car = carOnRing(rt, { approaching: true });
    const priority = approach(rt, { speedKmh: 20, ring: () => ringReport(rb, [car], true) });
    expect(priority).toHaveLength(0);
  });

  it("emits nothing when the ring is clear (default query)", () => {
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const events: SimTickEvent[] = [];
    let t = 0;
    for (let d = 34; d > rb.radius + 1; d -= (20 / 3.6) * 0.1) {
      t += 0.1;
      rt.update(0.1);
      events.push(...rt.sample(mkVehicle({ x: rb.x, y: rb.y - d, headingDeg: 0 }, { speedKmh: 20 }), t, false).events);
    }
    expect(events.filter((e) => e.kind === "prioritySituation" && e.situation === "roundabout")).toHaveLength(0);
  });

  it("commends a driver who holds back while a car comes round and enters after it has gone by", () => {
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const car = carOnRing(rt, { approaching: true });
    const priority = approach(rt, {
      // Crawl to 28 m, stand there 3 s while it goes by, then drive in.
      speedKmh: (i) => (i < 30 ? 6 : i < 60 ? 0 : 15),
      fromM: 33,
      frames: 110,
      ring: (_d, i) => {
        if (i >= 45) {
          car.approaching = false;
          car.pastEntry = true;
          car.azDeg = 60; // well round the ring, out of his way
        }
        return ringReport(rb, [car]);
      },
      leave: true,
    });
    expect(priority).toContainEqual({
      kind: "prioritySituation",
      situation: "roundabout",
      violated: false,
      yielded: true,
    });
    expect(priority).not.toContainEqual(expect.objectContaining({ violated: true }));
  });

  it("does not commend a crawl past a ring that is only «busy»: nothing was let past", () => {
    const rt = createWorldRuntime(loadDistrict());
    const priority = approach(rt, { speedKmh: 2, frames: 5, fromM: 22, ring: () => BUSY_RING, leave: true });
    expect(priority).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C1 revision — the circulating latch, and the driver's own brake
// ---------------------------------------------------------------------------

describe("roundabout yield tolerance bands (C1)", () => {
  it("never grades a vehicle already circulating the ring as a barging entry", () => {
    // Innocent: the C1 exam-bank bot was convicted 70 m PAST a lawful, yielded
    // entry because the polygonal ring points a circulating car «inward» at
    // every corner. A vehicle that is ON the ring holds ring priority: here it
    // never crossed the ring's edge at all (it starts on it), and a car behind
    // it braking the whole way round is following it, not yielding to it.
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const car = carOnRing(rt);
    rt.setCirculatingQuery(() => {
      car.shedMps += 0.25;
      return ringReport(rb, [car]);
    });
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

  it("never convicts an approach braking hard to the line for circulating traffic", () => {
    // Innocent: the staged "tight" gap appears inside braking distance; the
    // correct reaction (hard brake to the yield line) must not grade (C1
    // exam-bank FP, shell F at the NW mouth). Under the ruling this needs no
    // braking band: he stops short of the ring, so there is no entry — and the
    // car, which never had to brake, would not bill one anyway.
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const enterM = rt.debugRoundaboutZones()[0]!.enterReachM;
    const car = carOnRing(rt, { approaching: true });
    const speeds = [30, 28.6, 27.2, 25.8, 24.4, 23, 21.6, 20.2, 18.8, 17.4, 16, 14.6, 13.2, 11.8, 10.4, 9, 7.6, 6.2, 4.8, 3.4, 2, 0.6, 0];
    const priority = approach(rt, {
      speedKmh: (i) => speeds[Math.min(i, speeds.length - 1)],
      fromM: enterM + 2.02 + 9, // comes to rest a metre short of the ring's edge
      frames: speeds.length + 10,
      ring: () => ringReport(rb, [car], true),
    });
    expect(priority.filter((e) => e.violated)).toHaveLength(0);
  });

  it("D1 guard-rail: his own brake is no immunity — an entry that makes the car brake is billed even while he is braking hard himself", () => {
    // Guilty: comes at the mouth at 40 km/h riding a steady ~3 m/s² brake,
    // never stopping, and crosses onto the ring in front of a car that has to
    // brake for him. The old tracker gave a braking driver a response window;
    // what happened to the car is not softened by what his foot was doing.
    const rt = createWorldRuntime(loadDistrict());
    const rb = rt.district.roundabouts[0];
    const car = carOnRing(rt);
    const priority = approach(rt, {
      speedKmh: (i) => Math.max(8, 40 - 1.08 * i), // 3.0 m/s² throughout
      fromM: 40,
      frames: 60,
      ring: () => {
        car.shedMps += 0.25;
        return ringReport(rb, [car]);
      },
    });
    expect(priority.filter((e) => e.violated)).toHaveLength(1);
  });
});
