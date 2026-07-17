/**
 * BRIDGE-DECK micro-map contract battery (the ac-surface-districts pattern) —
 * doc 72 §13 AC-08, the ANTICIPATION arm: „Мостът замръзва пръв".
 *
 * content/world/ac-bridge-v1.json (tools/maps/gen_ac_bridge.mjs) is the second
 * map carrying an `icePatch` span, and the first authored so the deck READS as
 * a bridge from the approach. The battery proves the three data facts
 * sc-ac-bridge-ice's drives are tuned against:
 *  - the file satisfies the full engine contract (builder / runtime / traffic)
 *    with clean plain-street geometry (no lights, signs, zebras, junctions —
 *    nothing else gradable), exactly like ac-ice-v1;
 *  - THE VOID: both banks are dressed on both sides, and NOTHING stands within
 *    40 m of either abutment — the gorge is the only bridge channel the
 *    district-v1 schema offers, so it is a contract, not a coincidence;
 *  - THE POST: the shipped zone-sign pass places the А15 „Опасност от
 *    хлъзгане" post at the NEAR abutment (the approach warning the whole
 *    lesson turns on), driven by the same span that feeds the physics rig;
 *  - the authored grip is pinned BY VALUE against ICE_PATCH_GRIP_FACTOR
 *    (tuning.ts stays the documented truth) and carries NO float gate — ice
 *    bites at any speed;
 *  - the runtime treats the kind as unknown (inert on the tick — the additive
 *    contract; the rig-side seam is covered by
 *    runtime/__tests__/surface-patches.test.ts);
 *  - determinism + a byte-identical public copy.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { ICE_PATCH_GRIP_FACTOR } from "../../vehicle";
import { createWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "ac-bridge-v1";
const EDGE_ID = "ac-bridge-e-street";
const SPAWN_ID = "ac-bridge-spawn-approach";
/** Right-lane center — the generator's laneCenterRightM (the by-value pin). */
const LANE_X = 4.06;
const LENGTH_M = 520;
const MAXSPEED_KMH = 50;
/** The deck = the icePatch span (the drives' whole geometry). */
const DECK_FROM = 250;
const DECK_TO = 340;
/** The void the generator asserts around the abutments (DECK_VOID_PAD_M). */
const VOID_PAD_M = 40;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ac_bridge.mjs) in: ${candidates.join(", ")}`);
}

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "low",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

describe(`${ID} through the world builder`, () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document carrying ONE authored deck span", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.id).toBe(EDGE_ID);
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(MAXSPEED_KMH);
    expect(road.length).toBe(LENGTH_M);
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);

    const zones = (district as { zones?: unknown[] }).zones as Array<{
      kind: string;
      edgeId: string;
      fromM: number;
      toM: number;
      signRef: string;
      patchGripFactor?: number;
      aquaplaneAboveKmh?: number;
    }>;
    expect(zones).toHaveLength(1);
    const z = zones[0];
    expect(z.kind).toBe("icePatch");
    expect(z.edgeId).toBe(EDGE_ID);
    expect(z.fromM).toBe(DECK_FROM);
    expect(z.toM).toBe(DECK_TO);
    expect(z.signRef).toBe("А15"); // „Опасност от хлъзгане"
    // The map VALUE equals the tuning constant — tuning.ts stays the single
    // documented truth (the LANE_X by-value discipline).
    expect(z.patchGripFactor).toBe(ICE_PATCH_GRIP_FACTOR);
    // Ice has NO float gate: it bites at any speed (unlike the waterPatch).
    expect(z.aquaplaneAboveKmh).toBeUndefined();
  });

  it("hosts a plain street: no lights, no stop signs, no zebras, no junctions", () => {
    expect(district.intersections.length).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("THE ROOM: the deck leaves a readable approach and a far side to accelerate on", () => {
    // The three distances the template's objectives are cut from — if a future
    // edit shortens the approach, the anticipation lesson stops being teachable
    // and this fails first.
    expect(DECK_FROM).toBeGreaterThanOrEqual(150); // room to READ the cues
    expect(DECK_TO - DECK_FROM).toBeGreaterThanOrEqual(60); // the 3 s sustain fits ON the deck
    expect(LENGTH_M - DECK_TO).toBeGreaterThanOrEqual(120); // room to prove where throttle belongs
  });

  it("THE VOID: both banks are dressed on both sides, and nothing stands beside the deck", () => {
    // The district-v1 schema has no bridge primitive — the ABSENCE of buildings
    // across the deck window is the entire visual channel that says „мост".
    expect(district.buildings.length).toBe(4);
    const ids = district.buildings.map((b) => b.id).sort();
    expect(ids).toEqual([
      "ac-bridge-b-approach-e",
      "ac-bridge-b-approach-w",
      "ac-bridge-b-far-e",
      "ac-bridge-b-far-w",
    ]);
    const voidFrom = DECK_FROM - VOID_PAD_M;
    const voidTo = DECK_TO + VOID_PAD_M;
    for (const b of district.buildings) {
      for (const [x, y] of b.footprint) {
        expect(y > voidFrom && y < voidTo, `${b.id} point (${x}, ${y}) stands in the deck void`).toBe(false);
        // …and none of them is on the road or the sidewalk.
        expect(Math.abs(x)).toBeGreaterThan(8.125 + 4);
      }
    }
    // One bank on each side of the street, on each side of the gorge.
    const east = district.buildings.filter((b) => b.footprint.every(([x]) => x > 0));
    const west = district.buildings.filter((b) => b.footprint.every(([x]) => x < 0));
    expect(east).toHaveLength(2);
    expect(west).toHaveLength(2);
  });

  it("THE POST: the А15 „Опасност от хлъзгане“ stands at the NEAR abutment", () => {
    // Placed by the shipped zone-sign pass (builders/zoneSigns.ts: icePatch →
    // "slippery") from the SAME span that drives the physics rig — the approach
    // warning and the ice are one authored fact, so they cannot drift apart.
    expect(world.stats.signs.slippery).toBe(1);
    const post = world.signs.find((s) => s.kind === "slippery")!;
    expect(post).toBeDefined();
    expect(post.position[0]).toBeGreaterThan(0); // right of travel
    // District arclength s maps to world z = -s (the zone-signs convention).
    expect(post.position[2]).toBeCloseTo(-DECK_FROM, 1);
  });

  it("pins the scenario payload the template denormalizes", () => {
    const meta = district.meta as {
      scenario?: { laneCenterRightM?: number; params?: Record<string, number> };
    };
    expect(meta.scenario?.laneCenterRightM).toBe(LANE_X);
    expect(meta.scenario?.params).toEqual({ lengthM: LENGTH_M, maxspeedKmh: MAXSPEED_KMH });
    const spawn = district.spawnPoints.find((s) => s.id === SPAWN_ID)!;
    expect(spawn).toBeTruthy();
    expect(spawn.x).toBe(LANE_X);
    expect(spawn.y).toBe(15);
    expect(spawn.heading).toBe(0);
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
      path.join(process.cwd(), "content", "world", `${ID}.json`),
      path.resolve(process.cwd(), "..", "content", "world", `${ID}.json`),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${ID}.json`);
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe(`${ID} through the world runtime — the deck stays tick-inert (additive contract)`, () => {
  it("derives ZERO signals, stop lines and junction trackers; the span adds NOTHING to the tick", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    expect(rt.debugSignalClusters().length).toBe(0);
    expect(rt.debugStopLines().length).toBe(0);
    expect(rt.debugUncontrolledJunctions().length).toBe(0);
    // Lane fix before / on / after the deck — and no surface vocabulary on the
    // tick: the PHYSICS RIG is the consumer of the kind (runtime/surface.ts).
    // This is WHY the mistake demos grade POOR_LANE_KEEPING and COLLISION and
    // never a speed code: on a dry clear morning the engine sees an ordinary
    // 50-street, and only the car's behaviour betrays the ice.
    let t = 0;
    for (const y of [DECK_FROM - 30, (DECK_FROM + DECK_TO) / 2, DECK_TO + 30]) {
      t += 1;
      rt.update(1 / 60);
      const tick = rt.sample(sample(LANE_X, y, 0, 40), t, false);
      expect(tick.edgeId, `y=${y}`).toBe(EDGE_ID);
      expect(tick.laneId, `y=${y}`).toBe(0);
      expect(tick.maxSpeedKmh, `y=${y}`).toBe(MAXSPEED_KMH);
      expect("icePatch" in tick).toBe(false);
    }
  });
});

describe(`${ID} through the traffic lane graph + system`, () => {
  it("builds the 1+1 lane graph; zero traffic is a LEGAL config", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2); // one per direction
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(LANE_X, 15, 0)).toBe(Infinity);
  });
});
