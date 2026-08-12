/**
 * LINE TYPES + BUS LANES archetype contract battery (ADR-006 stage 2b; the
 * ban-districts.test.ts pattern — two maps in one file).
 *
 * content/world/ov-solid-v1.json (1+1 street, М1 solidCenterLine @ [90, 230])
 * and content/world/ov-bus-v1.json (2+2 boulevard, BUS busLane @ [90, 330])
 * are the first maps carrying the stage-2b `zones` vocabulary
 * (tools/maps/gen_ban_zones.mjs — same shape as 2a, so zonesVersion stays 1).
 * The battery proves:
 *  - both files satisfy the full engine contract (builder / runtime / traffic);
 *  - the spans PARSE and surface on the tick exactly inside their arclength;
 *  - the archetypes' REASON TO EXIST end-to-end through the REAL reducer:
 *    fully crossing the solid осева grades exactly CROSSED_SOLID_LINE while a
 *    mere touch keeps grading CENTER_LINE_TOUCHED (the two OV-04 tiers), and
 *    cruising the bus lane grades exactly DRIVING_IN_BUS_LANE while cruising
 *    the GENERAL lane through the span grades NOTHING — the keep-right
 *    interplay proof (SN-05) through the production runtime + reducer;
 *  - the version contract: a stage-2a zones file (zonesVersion 1, old kinds)
 *    is untouched by 2b — its ticks never carry the new fields — and a plain
 *    v1 file stays plain.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** ov-solid-v1 (1+1): the single northbound lane center. */
const OVS_LANE = 4.06;
/** ov-bus-v1 (2+2): right (bus) / left (general) lane centers, northbound. */
const OVBUS_RIGHT = 12.19;
const OVBUS_LEFT = 4.06;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ban_zones.mjs) in: ${candidates.join(", ")}`);
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

const violationsOf = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

for (const { id, lanes, zoneKind, signRef, fromM, toM, laneX, edgeId, tickFlag } of [
  {
    id: "ov-solid-v1",
    lanes: 2,
    zoneKind: "solidCenterLine",
    signRef: "М1",
    fromM: 90,
    toM: 230,
    laneX: OVS_LANE,
    edgeId: "ovs-e-street",
    tickFlag: "solidCenterLine",
  },
  {
    id: "ov-bus-v1",
    lanes: 4,
    zoneKind: "busLane",
    signRef: "BUS",
    fromM: 90,
    toM: 330,
    laneX: OVBUS_RIGHT,
    edgeId: "ovbus-e-street",
    tickFlag: "busLaneRight",
  },
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

    it("is a structurally valid district-v1 document carrying ONE authored span", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      const road = district.roads.edges[0];
      expect(road.id).toBe(edgeId);
      expect(road.lanes).toBe(lanes);
      expect(road.oneway).toBe(false);
      expect(road.maxspeed).toBe(50);
      // Same SHAPE as stage 2a — new vocabulary only, so zonesVersion stays 1.
      expect(district.meta.zonesVersion).toBe(1);
      expect(district.zones).toHaveLength(1);
      const z = district.zones![0];
      expect(z.kind).toBe(zoneKind);
      expect(z.signRef).toBe(signRef);
      expect(z.edgeId).toBe(edgeId);
      expect(z.fromM).toBe(fromM);
      expect(z.toM).toBe(toM);
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
      expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
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

  describe(`${id} through the world runtime — span membership on the tick`, () => {
    let runtime: DistrictWorldRuntime;

    beforeAll(() => {
      runtime = createWorldRuntime(loadRaw(id));
    });

    it("derives ZERO signals, stop lines and junction trackers", () => {
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    });

    it("flags the span EXACTLY inside its arclength (before / inside / after)", () => {
      const rt = createWorldRuntime(loadRaw(id));
      const flagsOf = (y: number) => {
        rt.update(1 / 60);
        const tick = rt.sample(sample(laneX, y, 0, 30), y, false);
        return {
          solidCenterLine: tick.solidCenterLine,
          busLaneRight: tick.busLaneRight,
          noStopZone: tick.noStopZone,
          noParkZone: tick.noParkZone,
          noOvertakeZone: tick.noOvertakeZone,
        };
      };
      const allKeys = [
        "solidCenterLine",
        "busLaneRight",
        "noStopZone",
        "noParkZone",
        "noOvertakeZone",
      ] as const;

      const before = flagsOf(fromM - 20);
      for (const key of allKeys) expect(before[key]).toBeUndefined();

      const inside = flagsOf((fromM + toM) / 2);
      expect(inside[tickFlag]).toBe(true);
      // Only THE span's flag — nothing else leaks.
      for (const key of allKeys) {
        if (key !== tickFlag) expect(inside[key]).toBeUndefined();
      }

      const after = flagsOf(toM + 20);
      for (const key of allKeys) expect(after[key]).toBeUndefined();
    });
  });
}

// ---------------------------------------------------------------------------
// The archetypes' reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("ov-solid-v1 — М1 crossing adjudication through the real reducer", () => {
  /** Drive north in the own lane, run one lateral excursion to `peakX` over
   *  y ∈ [outY, backY], return to the lane, continue to the end. */
  const excursionDrive = (outY: number, backY: number, peakX: number): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("ov-solid-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    const vMps = 30 / 3.6;
    const rampM = 30; // lateral ramp length of each leg, m
    for (let y = 15; y < 320; y += vMps * dt) {
      let x = OVS_LANE;
      if (y >= outY && y < outY + rampM) x = OVS_LANE + (peakX - OVS_LANE) * ((y - outY) / rampM);
      else if (y >= outY + rampM && y < backY) x = peakX;
      else if (y >= backY && y < backY + rampM) x = peakX + (OVS_LANE - peakX) * ((y - backY) / rampM);
      t += dt;
      rt.update(dt);
      const tick = rt.sample(sample(x, y, 0, 30), t, false);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };

  it("the runtime surfaces opposingBank on the oncoming half (two-way, committed fix)", () => {
    const rt = createWorldRuntime(loadRaw("ov-solid-v1"));
    rt.update(1 / 60);
    const own = rt.sample(sample(OVS_LANE, 160, 0, 30), 1, false);
    expect(own.opposingBank).toBeUndefined();
    rt.update(1 / 60);
    const across = rt.sample(sample(-1.5, 161, 0, 30), 2, false);
    expect(across.opposingBank).toBe(true);
    expect(across.solidCenterLine).toBe(true);
  });

  it("fully crossing the осева INSIDE the М1 span grades exactly CROSSED_SOLID_LINE", () => {
    expect(violationsOf(excursionDrive(130, 185, -1.5))).toEqual(["CROSSED_SOLID_LINE"]);
  });

  it("the same crossing AFTER the span ends (dashed country) stays innocent", () => {
    expect(violationsOf(excursionDrive(240, 285, -1.5))).toEqual([]);
  });

  it("a MERE touch inside the span (riding the line band) grades CENTER_LINE_TOUCHED, never the опасна", () => {
    // Peak x = 0.5: the car's center hovers 0.5 m short of the осева — the
    // „настъпване" band (laneOffset ≈ 3.56 > 3.25), own bank throughout.
    const codes = violationsOf(excursionDrive(120, 190, 0.5));
    expect(codes).toEqual(["CENTER_LINE_TOUCHED"]);
  });

  it("a clean in-lane pass-through stays innocent", () => {
    const rt = createWorldRuntime(loadRaw("ov-solid-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = 15; y < 320; y += (30 / 3.6) * dt) {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(sample(OVS_LANE, y, 0, 30), t, false));
      rules = r.state;
      out.push(...r.events);
    }
    expect(out.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

describe("ov-bus-v1 — bus-lane adjudication through the real reducer", () => {
  /** Cruise one lane from y0 to y1 at 30 km/h, then stop feeding frames. */
  const laneCruise = (x: number, y0: number, y1: number): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("ov-bus-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = y0; y < y1; y += (30 / 3.6) * dt) {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(sample(x, y, 0, 30), t, false));
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };

  it("cruising the BUS lane through the span grades exactly DRIVING_IN_BUS_LANE", () => {
    expect(violationsOf(laneCruise(OVBUS_RIGHT, 15, 360))).toEqual(["DRIVING_IN_BUS_LANE"]);
  });

  it("cruising the GENERAL lane through the whole span grades NOTHING — the keep-right interplay proof", () => {
    // 240 m of left-lane travel inside the span at 30 km/h ≈ 29 s — far past
    // the 12 s keep-right sustain. The span makes laneId 1 the rightmost
    // REQUIRED lane, so NOT_KEEPING_RIGHT provably does not fire.
    expect(violationsOf(laneCruise(OVBUS_LEFT, 15, 360))).toEqual([]);
  });

  it("control: the SAME left-lane cruise outside the span grades NOT_KEEPING_RIGHT (the exemption is the span)", () => {
    expect(violationsOf(laneCruise(OVBUS_LEFT, 335, 490))).toEqual(["NOT_KEEPING_RIGHT"]);
  });

  it("a signalled brief transit into the bus lane (right-turn shape) stays innocent", () => {
    const rt = createWorldRuntime(loadRaw("ov-bus-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    const vMps = 30 / 3.6;
    for (let y = 15; y < 250; y += vMps * dt) {
      // Left (general) lane until y = 150; signalled ramp into the bus lane
      // over [150, 170]; ride it briefly [170, 178]; signalled ramp back
      // [178, 198]; left lane on.
      let x = OVBUS_LEFT;
      let indicator: VehicleSample["indicator"] = "off";
      let glance: VehicleSample["mirrorGlance"] = null;
      if (y >= 150 && y < 170) {
        x = OVBUS_LEFT + (OVBUS_RIGHT - OVBUS_LEFT) * ((y - 150) / 20);
        indicator = "right";
      } else if (y >= 170 && y < 178) {
        x = OVBUS_RIGHT;
        indicator = "right";
      } else if (y >= 178 && y < 198) {
        x = OVBUS_RIGHT + (OVBUS_LEFT - OVBUS_RIGHT) * ((y - 178) / 20);
        indicator = "left";
      }
      if (Math.abs(y - 148) < vMps * dt) glance = "right";
      if (Math.abs(y - 176) < vMps * dt) glance = "left";
      t += dt;
      rt.update(dt);
      const v: VehicleSample = { ...sample(x, y, 0, 30), indicator, mirrorGlance: glance };
      const r = reduceTick(rules, rt.sample(v, t, false));
      rules = r.state;
      out.push(...r.events);
    }
    expect(out.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Version contract — 2a files and plain v1 files are untouched by 2b
// ---------------------------------------------------------------------------

describe("the additive contract — older files are untouched by the 2b vocabulary", () => {
  it("a stage-2a zones file (ov-ban-v1) parses unchanged and never carries the new tick fields", () => {
    const raw = loadRaw("ov-ban-v1") as District;
    expect(raw.meta.zonesVersion).toBe(1);
    expect(raw.zones).toHaveLength(1);
    const rt = createWorldRuntime(raw);
    for (const y of [50, 150, 300]) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(12.19, y, 0, 30), y, false);
      expect(tick.solidCenterLine).toBeUndefined();
      expect(tick.busLaneRight).toBeUndefined();
      expect("solidCenterLine" in tick).toBe(false);
      expect("busLaneRight" in tick).toBe(false);
    }
  });

  it("a plain v1 map stays plain (no zones, no span tick fields)", () => {
    const raw = loadRaw("ov-crossing-v1") as District;
    expect(raw.zones).toBeUndefined();
    const rt = createWorldRuntime(raw);
    for (const y of [15, 100, 220, 300]) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(12.19, y, 0, 30), y, false);
      expect(tick.solidCenterLine).toBeUndefined();
      expect(tick.busLaneRight).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe("line-type maps through the traffic lane graph + system", () => {
  it("ov-solid-v1 builds the 1+1 lane graph; zero traffic is a LEGAL config", () => {
    const raw = loadRaw("ov-solid-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(OVS_LANE, 15, 0)).toBe(Infinity);
  });

  it("ov-bus-v1 builds the 2+2 lane graph; zero traffic is a LEGAL config", () => {
    const raw = loadRaw("ov-bus-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});
