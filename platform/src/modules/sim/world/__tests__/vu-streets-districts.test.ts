/**
 * VU-STREETS archetype contract battery (N8 slice 1 — doc 72 §7 VU-02/VU-04;
 * the ln-district.test.ts pattern).
 *
 * content/world/vu-pass-v1.json + vu-door-v1.json are the VRU-interaction
 * micro-maps (tools/maps/gen_vu_streets.mjs — one straight 1+1 street each).
 * The battery proves both satisfy the FULL engine contract, with each
 * archetype's REASON TO EXIST verified:
 *  - vu-pass-v1: JUNCTION-FREE (the vulnerable-pass tracker disarms inside
 *    junction areas — an intersection would carve dead zones out of the pass
 *    corridor) and the staged cyclist recipe rides the east curb at the
 *    pinned line (lane 4.0625 + 2.6 = 6.6625 — the templates-vru/scVuPass
 *    denormalized constants);
 *  - vu-door-v1: the occupied parallel row (meta.scenario.bays) sits fully
 *    curb-side of the northbound lane, the М1 span covers the WHOLE row (the
 *    swerve-mistake canvas — tick.solidCenterLine arms over it), and the
 *    pinned door geometry (traces/scVuDoorZone) hangs exactly on the row's
 *    flank.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { scenarioBaysOf } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { doorObstacle } from "../../traces/scVuDoorZone";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** Pinned lane centers (denormalized into templates-vru.ts / the trace scripts). */
const LANE_X = 4.0625;
const CYCLIST_X = 6.6625;
/** vu-door-v1 row geometry (generator params, pinned). */
const ROW_X = 6.75;
const PARKED_FLANK_X = 5.85; // ROW_X − PARKED_CAR_HALF_WIDTH_M (0.9)

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_vu_streets.mjs) in: ${candidates.join(", ")}`);
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

for (const id of ["vu-pass-v1", "vu-door-v1"] as const) {
  describe(`${id} through the world builder`, () => {
    let district: District;
    let world: WorldGeometry;

    beforeAll(() => {
      district = assertDistrict(loadRaw(id));
      world = buildWorldGeometry(district, { seed: 7 });
    });

    it("is a structurally valid 1+1 street with NO junctions (the VU law)", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      const road = district.roads.edges[0];
      expect(road.lanes).toBe(2);
      expect(road.oneway).toBe(false);
      expect(district.intersections.length).toBe(0);
      expect(district.crossings.length).toBe(0);
      expect(district.roundabouts.length).toBe(0);
      expect(district.spawnPoints.length).toBe(2);
    });

    it("hosts a plain street: no lights, no stop signs, no zebras", () => {
      expect(world.trafficLights.length).toBe(0);
      expect(world.stats.signs.stop).toBe(0);
      expect(world.stats.zebraCrossings).toBe(0);
    });

    it("produces no NaN/infinite coordinates and stays inside the micro-map budget", () => {
      const buffers = [world.roadSurface, world.junctionSurface, world.sidewalks, world.markings];
      let nonFinite = 0;
      for (const mesh of buffers) {
        for (let i = 0; i < mesh.positions.length; i++) {
          if (!Number.isFinite(mesh.positions[i])) nonFinite++;
        }
      }
      expect(nonFinite).toBe(0);
      expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
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

    it("derives ZERO signals, stop lines and junction trackers", () => {
      const runtime = createWorldRuntime(loadRaw(id));
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    });
  });
}

describe("vu-pass-v1 — the pass-corridor contract", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("vu-pass-v1"));
  });

  it("numbers the northbound lane at the pinned center (x = 4.0625, laneCount 1, limit 50)", () => {
    runtime.update(1 / 60);
    const tick = runtime.sample(sample(LANE_X, 100, 0, 40), 1, false);
    expect(tick.edgeId).toBe("vup-e-street");
    expect(tick.laneId).toBe(0);
    expect(tick.laneCount).toBe(1);
    expect(Math.abs(tick.laneOffsetM)).toBeLessThan(0.05);
    expect(tick.maxSpeedKmh).toBe(50);
    // No zones on the pass street — the corridor is deliberately empty.
    expect(tick.solidCenterLine).toBeUndefined();
    // Junction-free: no junction context anywhere mid-street.
    expect(tick.nextJunctionM).toBeUndefined();
  });

  it("stages the template's cyclist recipe on the pinned curb line (x ≈ 6.6625)", () => {
    const traffic = createTrafficSystem(loadRaw("vu-pass-v1") as TrafficDistrict, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const view = traffic.stage({
      kind: "vehicle",
      id: "battery-cyclist",
      pathNodes: ["vup-n-start", "vup-n-end"],
      hold: { nodeIndex: 1, offsetM: -250 },
      cruiseSpeedMps: 3,
      extraRightOffsetM: 2.6,
    });
    expect(view).not.toBeNull();
    expect(Math.abs(view!.x - CYCLIST_X)).toBeLessThan(0.05);
    expect(Math.abs(view!.y - 110)).toBeLessThan(0.5); // nodeS[1] (360) − 250
    // …and the query the vulnerable-pass tracker rides SEES it.
    const c = traffic.cyclistNear(LANE_X, 95, 0, 30);
    expect(c).not.toBeNull();
    expect(Math.abs(c!.x - CYCLIST_X)).toBeLessThan(0.05);
  });
});

describe("vu-door-v1 — the door-zone contract", () => {
  it("carries the occupied row fully curb-side of the lane, under the М1 span", () => {
    const raw = loadRaw("vu-door-v1");
    const bays = scenarioBaysOf(raw);
    expect(bays.length).toBe(10);
    for (const b of bays) {
      expect(b.occupied).toBe(true);
      expect(b.x).toBeCloseTo(ROW_X, 5);
      expect(b.headingDeg).toBe(0);
      // The parked-car rect twin (half-width 0.9) stays east of the lane
      // center with the hug line's documented ~0.4 m gap geometry.
      expect(ROW_X - 0.9).toBeCloseTo(PARKED_FLANK_X, 5);
      expect(PARKED_FLANK_X).toBeGreaterThan(LANE_X);
      // Inside the М1 span [90, 240] — the swerve-mistake canvas.
      expect(b.y).toBeGreaterThanOrEqual(90);
      expect(b.y).toBeLessThanOrEqual(240);
    }
    // Row pitch 9 m from y 110 (the inter-bay gaps the swerve demo threads).
    expect(bays.map((b) => b.y)).toEqual([110, 119, 128, 137, 146, 155, 164, 173, 182, 191]);
  });

  it("arms tick.solidCenterLine over the row and nowhere before it", () => {
    const runtime = createWorldRuntime(loadRaw("vu-door-v1"));
    runtime.update(1 / 60);
    const before = runtime.sample(sample(LANE_X, 50, 0, 30), 1, false);
    expect(before.solidCenterLine).toBeUndefined();
    expect(before.maxSpeedKmh).toBe(40);
    const inside = runtime.sample(sample(LANE_X, 156, 0, 30), 2, false);
    expect(inside.solidCenterLine).toBe(true);
    const after = runtime.sample(sample(LANE_X, 260, 0, 30), 3, false);
    expect(after.solidCenterLine).toBeUndefined();
  });

  it("the pinned door hangs exactly on the row's flank beside the bay at y 155", () => {
    const door = doorObstacle();
    expect(door.x + door.halfLengthM).toBeCloseTo(PARKED_FLANK_X, 5);
    expect(door.y).toBeCloseTo(156, 5); // front-left of the y-155 parked car
    expect(door.trigger).toBeDefined();
    expect(door.withWhat).toBe("vehicle");
  });
});
