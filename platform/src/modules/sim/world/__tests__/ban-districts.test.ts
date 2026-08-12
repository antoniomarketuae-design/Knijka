/**
 * ZONE-BAN archetype contract battery (ADR-006 stage 2a; the
 * ov-lane-district.test.ts pattern, two maps in one file like ac-vp).
 *
 * content/world/ov-ban-v1.json (2+2 boulevard, В24 noOvertaking @ [90, 210])
 * and content/world/pk-ban-v1.json (1+1 street, В27 noStopping @ [70, 190])
 * are the FIRST maps carrying the optional district `zones` array
 * (tools/maps/gen_ban_zones.mjs). The battery proves:
 *  - both files satisfy the full engine contract (builder / runtime / traffic);
 *  - the zones PARSE and surface on the tick exactly inside their spans;
 *  - the archetypes' REASON TO EXIST end-to-end through the REAL reducer:
 *    a casual rest inside В27 grades exactly ILLEGAL_STOP_IN_BAN_ZONE while a
 *    queue/red-shaped rest in the same spot stays innocent (the deferred-
 *    illegal-stop finding made structural), and a lane change past a lead
 *    inside В24 grades exactly OVERTAKING_IN_BAN_ZONE;
 *  - the v1-unchanged proof: a SHIPPED zones-less map parses with no zones
 *    and its ticks never carry a zone field.
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

/** ov-ban-v1 (2+2): right/left lane centers of the northbound bank. */
const OVB_RIGHT = 12.19;
const OVB_LEFT = 4.06;
/** pk-ban-v1 (1+1): the single northbound lane center. */
const PKB_LANE = 4.06;

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

for (const { id, lanes, zoneKind, signRef, fromM, toM, laneX, edgeId } of [
  { id: "ov-ban-v1", lanes: 4, zoneKind: "noOvertaking", signRef: "В24", fromM: 90, toM: 210, laneX: OVB_RIGHT, edgeId: "ovb-e-street" },
  { id: "pk-ban-v1", lanes: 2, zoneKind: "noStopping", signRef: "В27", fromM: 70, toM: 190, laneX: PKB_LANE, edgeId: "pkb-e-street" },
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

    it("is a structurally valid district-v1 document carrying ONE authored ban zone", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      const road = district.roads.edges[0];
      expect(road.id).toBe(edgeId);
      expect(road.lanes).toBe(lanes);
      expect(road.oneway).toBe(false);
      expect(road.maxspeed).toBe(50);
      // The zones slice + its version contract (runtime/district.ts).
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

  describe(`${id} through the world runtime — zone membership on the tick`, () => {
    let runtime: DistrictWorldRuntime;

    beforeAll(() => {
      runtime = createWorldRuntime(loadRaw(id));
    });

    it("derives ZERO signals, stop lines and junction trackers", () => {
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    });

    it("flags the zone EXACTLY inside its span (before / inside / after)", () => {
      const rt = createWorldRuntime(loadRaw(id));
      const flagOf = (y: number) => {
        rt.update(1 / 60);
        const tick = rt.sample(sample(laneX, y, 0, 30), y, false);
        return {
          noStopZone: tick.noStopZone,
          noParkZone: tick.noParkZone,
          noOvertakeZone: tick.noOvertakeZone,
        };
      };
      const flagKey = zoneKind === "noStopping" ? "noStopZone" : "noOvertakeZone";

      const before = flagOf(fromM - 20);
      expect(before.noStopZone).toBeUndefined();
      expect(before.noParkZone).toBeUndefined();
      expect(before.noOvertakeZone).toBeUndefined();

      const inside = flagOf((fromM + toM) / 2);
      expect(inside[flagKey]).toBe(true);
      // Only THE zone's flag — nothing else leaks.
      for (const key of ["noStopZone", "noParkZone", "noOvertakeZone"] as const) {
        if (key !== flagKey) expect(inside[key]).toBeUndefined();
      }

      const after = flagOf(toM + 20);
      expect(after.noStopZone).toBeUndefined();
      expect(after.noParkZone).toBeUndefined();
      expect(after.noOvertakeZone).toBeUndefined();
    });
  });
}

// ---------------------------------------------------------------------------
// The archetypes' reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("pk-ban-v1 — В27 rest adjudication through the real reducer", () => {
  /** Drive to restY, rest 6 s there (with the given AT-REST lead-gap channel
   *  — a queue lead materializes as the car pulls up, the road is clear while
   *  rolling), drive on. */
  const restDrive = (restY: number, restLeadGapM: number = Infinity): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("pk-ban-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    const step = (y: number, speedKmh: number, leadGapM: number) => {
      t += dt;
      rt.update(dt);
      const tick = rt.sample(sample(PKB_LANE, y, 0, speedKmh), t, false, false, leadGapM);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    };
    // approach at 30 km/h from y=15 to restY…
    for (let y = 15; y < restY; y += (30 / 3.6) * dt) step(y, 30, Infinity);
    // …rest 6 s (past the 4 s sustain)…
    for (let i = 0; i < 60; i++) step(restY, 0, restLeadGapM);
    // …drive on to the end.
    for (let y = restY; y < 280; y += (30 / 3.6) * dt) step(y, 30, Infinity);
    return out;
  };
  const violations = (events: RuleEvent[]) =>
    [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

  it("a casual 6 s rest INSIDE the В27 span grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    expect(violations(restDrive(130))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("the SAME rest behind a queue lead (gap 6 m) stays innocent — structural, not tuned", () => {
    expect(violations(restDrive(130, 6))).toEqual([]);
  });

  it("the same rest AFTER the zone (the legal spot) stays innocent", () => {
    expect(violations(restDrive(230))).toEqual([]);
  });

  it("a pass-through drive with no rest stays innocent", () => {
    const rt = createWorldRuntime(loadRaw("pk-ban-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = 15; y < 280; y += (30 / 3.6) * dt) {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(sample(PKB_LANE, y, 0, 30), t, false));
      rules = r.state;
      out.push(...r.events);
    }
    expect(out.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

describe("ov-ban-v1 — В24 lane-change adjudication through the real reducer", () => {
  /** A straight cruise with ONE lane change (right → left) whose boundary
   *  crossing lands at boundaryY, a lead reported 18 m ahead throughout. */
  const overtakeDrive = (boundaryY: number): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("ov-ban-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    const vMps = 30 / 3.6;
    const changeLen = 28; // lateral ramp length of the lane change, m
    for (let y = 15; y < boundaryY + 90; y += vMps * dt) {
      // Lateral profile: right lane until the ramp, linear ramp across the
      // boundary at boundaryY, left lane after.
      let x = OVB_RIGHT;
      if (y >= boundaryY + changeLen / 2) x = OVB_LEFT;
      else if (y > boundaryY - changeLen / 2) {
        const f = (y - (boundaryY - changeLen / 2)) / changeLen;
        x = OVB_RIGHT + (OVB_LEFT - OVB_RIGHT) * f;
      }
      t += dt;
      rt.update(dt);
      const v: VehicleSample = { ...sample(x, y, 0, 30), indicator: "left" };
      if (Math.abs(y - (boundaryY - changeLen)) < vMps * dt) v.mirrorGlance = "left";
      const tick = rt.sample(v, t, false, false, 18);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };
  const violations = (events: RuleEvent[]) =>
    [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

  it("a lane change past the lead INSIDE the В24 span grades exactly OVERTAKING_IN_BAN_ZONE", () => {
    expect(violations(overtakeDrive(150))).toEqual(["OVERTAKING_IN_BAN_ZONE"]);
  });

  it("the same lane change AFTER the zone ends stays innocent", () => {
    expect(violations(overtakeDrive(250))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// v1-unchanged proof — a shipped zones-less map is untouched by the slice
// ---------------------------------------------------------------------------

describe("v1 files remain plain (no zones, no tick fields) — the additive contract", () => {
  it("a shipped map parses with zones undefined and its ticks never carry a zone flag", () => {
    const raw = loadRaw("ov-crossing-v1") as District;
    expect(raw.zones).toBeUndefined();
    expect(raw.meta.zonesVersion).toBeUndefined();
    const rt = createWorldRuntime(raw);
    for (const y of [15, 100, 220, 300]) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(12.19, y, 0, 30), y, false);
      expect(tick.noStopZone).toBeUndefined();
      expect(tick.noParkZone).toBeUndefined();
      expect(tick.noOvertakeZone).toBeUndefined();
      expect("noStopZone" in tick).toBe(false);
      expect("noOvertakeZone" in tick).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe("ban-zone maps through the traffic lane graph + system", () => {
  it("ov-ban-v1 builds the 2+2 lane graph; zero traffic is a LEGAL config", () => {
    const raw = loadRaw("ov-ban-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // One graph lane per DIRECTION (the traffic layer's convention — the
    // ov-keepright battery pins the same 2 on its 2+2 boulevard).
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(OVB_RIGHT, 15, 0)).toBe(Infinity);
  });

  it("pk-ban-v1 builds the 1+1 lane graph; zero traffic is a LEGAL config", () => {
    const raw = loadRaw("pk-ban-v1") as TrafficDistrict;
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
