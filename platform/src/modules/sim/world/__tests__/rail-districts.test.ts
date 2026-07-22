/**
 * RAIL PACK slice-1 archetype contract battery (ADR-006 stage 3a; the
 * ban-districts.test.ts pattern, two maps in one file).
 *
 * content/world/rx-unguarded-v1.json (1+1 street, unguarded track band
 * @ [150, 156], stop line y = 145) and content/world/rx-guarded-v1.json (the
 * guarded variant with the deterministic barrier timetable down [0, 40) of
 * every 90 s) are the FIRST maps carrying zones kind "railCrossing"
 * (tools/maps/gen_rail_crossing.mjs). The battery proves:
 *  - both files satisfy the full engine contract (builder / runtime / traffic);
 *  - the rail span surfaces on the tick exactly as phased: absent before the
 *    approach window, "approach" inside it, "on" over the band, absent after
 *    — and the barrier timetable is deterministic in session time;
 *  - the archetypes' REASON TO EXIST end-to-end through the REAL reducer:
 *    a no-stop unguarded crossing / a barred entry / a mid-band rest each
 *    grade exactly RAIL_CROSSING_VIOLATION, while the correct ritual AND the
 *    stop-free GUARDED-OPEN pass (the чл. 52 legal asymmetry) stay innocent;
 *  - the v1-unchanged proof: a SHIPPED zones-less map parses with no zones
 *    and its ticks never carry a rail field.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, RAIL_APPROACH_M, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** rx-*-v1 (1+1): the single northbound lane center. */
const RX_LANE = 4.06;
/** rx-*-v1: the authored track band. */
const BAND_FROM = 150;
const BAND_TO = 156;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_rail_crossing.mjs) in: ${candidates.join(", ")}`);
}

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

for (const { id, guarded, signRef, edgeId } of [
  { id: "rx-unguarded-v1", guarded: false, signRef: "А35", edgeId: "rxu-e-street" },
  { id: "rx-guarded-v1", guarded: true, signRef: "А34", edgeId: "rxg-e-street" },
] as const) {
  describe(`${id} through the world builder`, () => {
    let raw: unknown;
    let district: District;
    let world: WorldGeometry;

    beforeAll(() => {
      raw = loadRaw(id);
      district = assertDistrict(raw);
      world = buildWorldGeometry(district, { seed: 7 });
    });

    it("is a structurally valid district-v1 document carrying ONE authored rail span", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      const road = district.roads.edges[0];
      expect(road.id).toBe(edgeId);
      expect(road.lanes).toBe(2);
      expect(road.oneway).toBe(false);
      expect(road.maxspeed).toBe(50);
      // The zones slice + its version contract (runtime/district.ts — kind
      // growth keeps zonesVersion 1, the 2b precedent).
      expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
      expect(district.zones).toHaveLength(1);
      const z = district.zones![0];
      expect(z.kind).toBe("railCrossing");
      expect(z.signRef).toBe(signRef);
      expect(z.edgeId).toBe(edgeId);
      expect(z.fromM).toBe(BAND_FROM);
      expect(z.toM).toBe(BAND_TO);
      if (guarded) {
        expect(z.guarded).toBe(true);
        expect(z.barrier).toEqual({ cycleSec: 90, downFromSec: 0, downToSec: 40 });
      } else {
        expect(z.guarded).toBeUndefined();
        expect(z.barrier).toBeUndefined();
      }
    });

    it("authors the perpendicular rail path the staged TRAIN rides (ADR-006 stage 3c)", () => {
      const rc = (raw as {
        meta: { scenario?: { railCrossing?: { bandCenterY?: number; railPath?: number[][] } } };
      }).meta.scenario?.railCrossing;
      expect(rc?.bandCenterY).toBe((BAND_FROM + BAND_TO) / 2); // 153
      const rp = rc?.railPath;
      expect(Array.isArray(rp)).toBe(true);
      expect(rp).toHaveLength(2);
      // East–west line ON the band centre, symmetric, crossing the whole
      // carriageway so the ~34 m consist enters + exits (aligns with the
      // rendered rail deck stamped at the same band centre).
      expect(rp![0][1]).toBe(153);
      expect(rp![1][1]).toBe(153);
      expect(rp![0][0]).toBe(-rp![1][0]);
      const halfRoadM = 8.125; // SCALED_LANE_W = 3.25 × 2.5 (the 1+1 street)
      expect(rp![0][0]).toBeLessThan(-halfRoadM);
      expect(rp![1][0]).toBeGreaterThan(halfRoadM);
    });

    it("hosts a plain street: no lights, no stop signs, no zebras", () => {
      expect(world.trafficLights.length).toBe(0);
      expect(world.stats.signs.stop).toBe(0);
      expect(world.stats.signs.giveWay).toBe(0);
      expect(world.stats.zebraCrossings).toBe(0);
    });

    it("produces no NaN/infinite coordinates in any buffer or placement", () => {
      const buffers = [
        world.roadSurface,
        world.junctionSurface,
        world.sidewalks,
        world.markings,
        world.parkingLanes,
        world.roadDecals,
        world.terrain,
        world.terrainPaved,
        world.buildingRoofs,
        ...world.buildingWalls,
      ];
      let nonFinite = 0;
      for (const mesh of buffers) {
        for (let i = 0; i < mesh.positions.length; i++) {
          if (!Number.isFinite(mesh.positions[i])) nonFinite++;
        }
      }
      for (const list of [world.signs, world.streetlights, world.trees, world.busStops]) {
        for (const t of list) {
          if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
        }
      }
      expect(nonFinite).toBe(0);
    });

    it("stays trivially inside the performance budget (micro-map)", () => {
      expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
      expect(world.stats.triangles).toBeLessThan(300_000);
    });

    it("is deterministic for a fixed seed", () => {
      const again = buildWorldGeometry(district, { seed: 7 });
      expect(again.stats).toEqual(world.stats);
    });

    it("the published copy is byte-identical to the content source", () => {
      const srcCandidates = [
        path.join(process.cwd(), "content", "world", `${id}.json`),
        path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
      ];
      const src = srcCandidates.find((f) => fs.existsSync(f))!;
      const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${id}.json`);
      expect(fs.existsSync(pub)).toBe(true);
      expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
    });
  });

  describe(`${id} through the world runtime — rail phase on the tick`, () => {
    let runtime: DistrictWorldRuntime;

    beforeAll(() => {
      runtime = createWorldRuntime(loadRaw(id));
    });

    it("derives ZERO signals, stop lines and junction trackers", () => {
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    });

    it("phases the crossing EXACTLY: absent / approach / on / absent (northbound)", () => {
      const rt = createWorldRuntime(loadRaw(id));
      const phaseAt = (y: number, tSec: number) => {
        rt.update(1 / 60);
        const tick = rt.sample(sample(RX_LANE, y, 0, 30), tSec, false);
        return { phase: tick.railCrossing, guarded: tick.railGuarded, barred: tick.railBarred };
      };

      // Before the approach window (northbound): nothing.
      const far = phaseAt(BAND_FROM - RAIL_APPROACH_M - 10, 50);
      expect(far.phase).toBeUndefined();
      expect(far.guarded).toBeUndefined();
      expect(far.barred).toBeUndefined();

      // Inside the approach window: "approach" (+ guarded flag on the А34 map).
      const appr = phaseAt(BAND_FROM - 10, 50);
      expect(appr.phase).toBe("approach");
      expect(appr.guarded).toBe(guarded ? true : undefined);

      // On the band: "on".
      const on = phaseAt((BAND_FROM + BAND_TO) / 2, 50);
      expect(on.phase).toBe("on");

      // Past the band (northbound — the band is BEHIND): nothing.
      const past = phaseAt(BAND_TO + 12, 50);
      expect(past.phase).toBeUndefined();
    });

    if (guarded) {
      it("the barrier timetable is deterministic in session time (down [0, 40) of 90 s)", () => {
        const rt = createWorldRuntime(loadRaw(id));
        const barredAt = (tSec: number) => {
          rt.update(1 / 60);
          return rt.sample(sample(RX_LANE, BAND_FROM - 8, 0, 20), tSec, false).railBarred;
        };
        expect(barredAt(5)).toBe(true); // first down-window
        expect(barredAt(39.5)).toBe(true); // …to its very edge
        expect(barredAt(40.5)).toBeUndefined(); // lifted
        expect(barredAt(89)).toBeUndefined(); // still open
        expect(barredAt(95)).toBe(true); // next cycle (95 mod 90 = 5)
      });
    } else {
      it("an unguarded span never sets railGuarded / railBarred", () => {
        const rt = createWorldRuntime(loadRaw(id));
        for (const t of [5, 39, 45, 95]) {
          rt.update(1 / 60);
          const tick = rt.sample(sample(RX_LANE, BAND_FROM - 8, 0, 20), t, false);
          expect(tick.railGuarded).toBeUndefined();
          expect(tick.railBarred).toBeUndefined();
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// The archetypes' reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

/** Drive rx-*-v1 northbound at `cruiseKmh`, optionally stopping `stopSec` at
 *  stopY and resting `restOnSec` mid-band; session clock starts at t0. */
function railDrive(
  id: string,
  opts: { t0?: number; stopAtLineSec?: number; restOnBandSec?: number } = {},
): RuleEvent[] {
  const rt = createWorldRuntime(loadRaw(id));
  let rules = createRuleEngine();
  const out: RuleEvent[] = [];
  const dt = 0.1;
  let t = opts.t0 ?? 0;
  const step = (y: number, speedKmh: number) => {
    t += dt;
    rt.update(dt);
    const tick = rt.sample(sample(RX_LANE, y, 0, speedKmh), t, false);
    const r = reduceTick(rules, tick);
    rules = r.state;
    out.push(...r.events);
  };
  const vMps = 30 / 3.6;
  // approach to the stop line…
  for (let y = 15; y < 145; y += vMps * dt) step(y, 30);
  // …optional full stop at the line…
  if (opts.stopAtLineSec) {
    for (let i = 0; i < Math.round(opts.stopAtLineSec / dt); i++) step(145, 0);
  }
  // …cross the band (with an optional mid-band rest)…
  for (let y = 145; y < 153; y += vMps * dt) step(y, 30);
  if (opts.restOnBandSec) {
    for (let i = 0; i < Math.round(opts.restOnBandSec / dt); i++) step(153, 0);
  }
  // …and drive out.
  for (let y = 153; y < 280; y += vMps * dt) step(y, 30);
  return out;
}
const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

describe("rx-unguarded-v1 — RX-02 adjudication through the real reducer", () => {
  it("the correct ritual (full stop, brisk crossing) stays innocent", () => {
    expect(violations(railDrive("rx-unguarded-v1", { stopAtLineSec: 1.5 }))).toEqual([]);
  });

  it("rolling across with NO stop grades exactly RAIL_CROSSING_VIOLATION", () => {
    expect(violations(railDrive("rx-unguarded-v1"))).toEqual(["RAIL_CROSSING_VIOLATION"]);
  });

  it("a 3 s freeze ON the band (after a correct stop) grades exactly the code", () => {
    expect(
      violations(railDrive("rx-unguarded-v1", { stopAtLineSec: 1.5, restOnBandSec: 3 })),
    ).toEqual(["RAIL_CROSSING_VIOLATION"]);
  });
});

describe("rx-guarded-v1 — RX-01 adjudication through the real reducer", () => {
  it("THE LEGAL ASYMMETRY: a stop-free transit in the OPEN window stays innocent (чл. 52)", () => {
    // Session clock starts at 45 s — the barrier is up ([40, 90) of the 90 s
    // cycle) and the whole 265 m transit at 30 km/h finishes before 90 s.
    expect(violations(railDrive("rx-guarded-v1", { t0: 45 }))).toEqual([]);
  });

  it("the SAME stop-free transit while BARRED grades exactly RAIL_CROSSING_VIOLATION", () => {
    expect(violations(railDrive("rx-guarded-v1", { t0: 0 }))).toEqual(["RAIL_CROSSING_VIOLATION"]);
  });

  it("a polite stop at the line does NOT acquit a barred crossing", () => {
    // Stop 3 s at the line (~t 18.6), then creep across — still inside the
    // 40 s down-window.
    expect(violations(railDrive("rx-guarded-v1", { t0: 0, stopAtLineSec: 3 }))).toEqual([
      "RAIL_CROSSING_VIOLATION",
    ]);
  });
});

// ---------------------------------------------------------------------------
// v1-unchanged proof — a shipped zones-less map is untouched by the slice
// ---------------------------------------------------------------------------

describe("v1 files remain plain (no rail tick fields) — the additive contract", () => {
  it("a shipped map parses with zones undefined and its ticks never carry a rail field", () => {
    const raw = loadRaw("ov-crossing-v1") as District;
    expect(raw.zones).toBeUndefined();
    const rt = createWorldRuntime(raw);
    for (const y of [15, 100, 220, 300]) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(12.19, y, 0, 30), y, false);
      expect(tick.railCrossing).toBeUndefined();
      expect(tick.railGuarded).toBeUndefined();
      expect(tick.railBarred).toBeUndefined();
      expect("railCrossing" in tick).toBe(false);
      expect("railBarred" in tick).toBe(false);
    }
  });

  it("an unknown zone kind stays inert next to a rail span (forward compat)", () => {
    const raw = loadRaw("rx-unguarded-v1") as Record<string, unknown> & { zones: unknown[] };
    raw.zones = [
      ...raw.zones,
      { id: "x-future", kind: "hoverLane", edgeId: "rxu-e-street", fromM: 10, toM: 40, signRef: "??" },
    ];
    const rt = createWorldRuntime(raw);
    rt.update(1 / 60);
    const tick = rt.sample(sample(RX_LANE, 25, 0, 30), 1, false);
    expect(tick.railCrossing).toBeUndefined();
    expect(tick.noStopZone).toBeUndefined();
    // …while the REAL rail span still phases.
    rt.update(1 / 60);
    expect(rt.sample(sample(RX_LANE, 153, 0, 30), 2, false).railCrossing).toBe("on");
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe("rail maps through the traffic lane graph + system", () => {
  for (const id of ["rx-unguarded-v1", "rx-guarded-v1"] as const) {
    it(`${id} builds the 1+1 lane graph; zero traffic is a LEGAL config`, () => {
      const raw = loadRaw(id) as TrafficDistrict;
      const graph = buildLaneGraph(raw, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      expect(graph.lanes.length).toBe(2);
      expect(graph.crossingLanes.size).toBe(0);
      const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
      expect(traffic.stats.vehicleCount).toBe(0);
      expect(traffic.leadGapMeters(RX_LANE, 15, 0)).toBe(Infinity);
    });
  }
});

// ---------------------------------------------------------------------------
// RX-03 („опашка върху прелеза", sc-rx-queue-clear) — the invariants the
// QUEUE drill adds on top of the RX-01 map it reuses. The drill's whole
// tuning rests on three properties of rx-guarded-v1 that nothing else pins:
// the queue tail's rest pose is on the drivable street PAST the band, the
// gaps that pose implies fall on the right side of the standstill threshold,
// and the barrier's open window is long enough to hold a whole crossing.
// ---------------------------------------------------------------------------

describe("rx-guarded-v1 hosts the RX-03 queue drill (sc-rx-queue-clear)", () => {
  /** The staged queue tail's hold arc (templates-rail2 RXQ_QUEUE_TAIL_Y). */
  const TAIL_Y = 166;
  /** The rule engine's standstill threshold + the recorder's lead-gap datum. */
  const STANDSTILL_MIN_GAP_M = 1.5;
  const VEHICLE_LENGTH_M = 4.1;

  it("the tail's pose is real road, clear of the band, and inside the street", () => {
    const raw = loadRaw("rx-guarded-v1") as District;
    const edge = raw.roads.edges[0];
    // The street runs 0 → 300 on x = 0, so the actor's hold offset IS its y.
    expect(edge.length).toBe(300);
    expect(TAIL_Y).toBeGreaterThan(BAND_TO); // past the far rail…
    expect(TAIL_Y).toBeLessThan(edge.length); // …and still on the street.
    // Ten meters of it: the gap that makes the drill's two mistakes distinct.
    expect(TAIL_Y - BAND_TO).toBe(10);
  });

  it("the tail's geometry puts each demo's rest on the RIGHT side of the standstill line", () => {
    // leadGapM = tailY − playerY − VEHICLE_LENGTH_M (traffic/system leadGapFor).
    const gapAt = (playerY: number) => TAIL_Y - playerY - VEHICLE_LENGTH_M;
    // The shadow + the rails-freeze demo rest far enough back that the
    // standstill code CANNOT fire — so their sheets are the rail question only.
    expect(gapAt(146)).toBeGreaterThan(STANDSTILL_MIN_GAP_M); // shadow, at the line
    expect(gapAt(153)).toBeGreaterThan(STANDSTILL_MIN_GAP_M); // frozen mid-band
    // The kiss demo rests inside the threshold — AND clear of the band, so it
    // bills the gap and nothing else.
    expect(gapAt(160.8)).toBeLessThan(STANDSTILL_MIN_GAP_M);
    expect(160.8).toBeGreaterThan(BAND_TO);
  });

  it("the barrier's OPEN window is long enough to hold a whole crossing (the drill's clock)", () => {
    const raw = loadRaw("rx-guarded-v1") as District;
    const b = raw.zones![0].barrier!;
    // Open = [downToSec, cycleSec). The drill enters the band at t ≈ 44–57 and
    // is across in seconds — every authored entry must fit with room to spare.
    const openSec = b.cycleSec - b.downToSec;
    expect(b.downFromSec).toBe(0);
    expect(openSec).toBeGreaterThanOrEqual(45);
    // …and the tail rolls at ~51.7 s (32 s after the player's ~19.7 s stop),
    // which must land INSIDE that window — otherwise the lawful crossing would
    // be barred and the drill would teach RX-01's lesson by accident.
    expect(51.7).toBeGreaterThan(b.downToSec);
    expect(51.7).toBeLessThan(b.cycleSec);
  });

  it("an OPEN-window transit that never rests on the band is innocent — the drill's shadow, in miniature", () => {
    // The RX-03 shadow's exact shape through the REAL reducer: session clock
    // at 45 s (barrier up), no stop at the line, brisk across the band.
    expect(violations(railDrive("rx-guarded-v1", { t0: 45 }))).toEqual([]);
    // …and the SAME transit that freezes mid-band bills the one code the drill
    // is built to teach — the queue, not the train.
    expect(violations(railDrive("rx-guarded-v1", { t0: 45, restOnBandSec: 3 }))).toEqual([
      "RAIL_CROSSING_VIOLATION",
    ]);
  });
});
