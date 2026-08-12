/**
 * SINGLE-ROUNDABOUT archetype contract battery (Scenario Studio doc 76 §3; the
 * rb-mini-district.test.ts pattern).
 *
 * content/world/rb-single-v1.json is the roundabout family's FULL-SIZE ring
 * (tools/maps/gen_rb_single.mjs — single-lane CCW ring R = 38, encoded with
 * district-v1's rb-1 conventions exactly like rb-mini-v1: oneway
 * `roundabout: true` ring edges + roundabouts[] registration + uncontrolled
 * degree-3 joints).
 *
 * WHY IT EXISTS RATHER THAN A BIGGER rb-mini-v1. The founder rejected the two
 * ring picture questions on the map itself (2026-07-27): „it is not real
 * roundabout - rather 4 small roundabouts … we need proper 1 roundabout". The
 * cause is that the builder opens a junction pad of `widest approach half width
 * + curb fillet` = 17.13 m at EVERY arm↔ring joint, and rb-mini-v1's R = 18
 * puts those four pads 25.5 m apart, so they overlap into four blobs. Growing
 * rb-mini-v1 was not an option: its R = 18 is pinned by value by the roundabout
 * scenario templates, their authored traces and the bot-completion batteries
 * that grade real verdicts off ring phase and mouth spacing. So the ring the
 * pictures need ships as its own district and rb-mini-v1 stays byte-identical.
 *
 * The battery proves the file satisfies the FULL engine contract:
 *
 *   1. rb-1 encoding — assertDistrict + the ring/joint conventions;
 *   2. ONE-ROUNDABOUT — the arithmetic that decides whether a ring renders as
 *      one roundabout or as four mouths (the whole point of the archetype);
 *   3. world   — buildWorldGeometry: Б1 (give way) + Д11 (roundabout) signs at
 *                every entry, no stop signs/lights, no NaNs, deterministic;
 *   4. runtime — the ring/arm limits resolve and the four joints stay
 *                uncontrolled (roundabout priority is circulatingConflict, not
 *                a stop line);
 *   5. traffic — the lane graph carries the ring (4 oneway lanes) + arms.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const RING_NODES = ["rbs-n-s", "rbs-n-e", "rbs-n-n", "rbs-n-w"];

/** builders/constants.ts JUNCTION_CORNER_RADIUS_MINOR_M (arms rank <= 2). */
const JUNCTION_CORNER_RADIUS_M = 9;
/** builders/constants.ts LANE_WIDTH_M — copied, so a silent constant move fails
 *  here rather than quietly reshaping the shipped picture. */
const LANE_WIDTH_M = 3.25 * 2.5;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "rb-single-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "rb-single-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `rb-single-v1.json not found (run: node tools/maps/gen_rb_single.mjs) in: ${candidates.join(", ")}`,
  );
}

describe("rb-single-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (rb-1 ring conventions)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(8);
    expect(district.roads.edges.length).toBe(8);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts).toHaveLength(1);
    const rb = district.roundabouts[0];
    expect(rb).toMatchObject({ id: "rbs-rb-1", x: 0, y: 0, radius: 38 });
    expect(rb.edgeIds).toHaveLength(4);
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const seq = rb.edgeIds.map((id) => byId.get(id)!);
    for (let i = 0; i < seq.length; i++) {
      expect(seq[i].oneway, seq[i].id).toBe(true);
      expect(seq[i].roundabout, seq[i].id).toBe(true);
      expect(seq[i].lanes, seq[i].id).toBe(1);
      expect(seq[i].to).toBe(seq[(i + 1) % seq.length].from);
    }
    expect(seq.map((e) => e.from)).toEqual(RING_NODES);
    expect(district.intersections.map((i) => i.id).sort()).toEqual([...RING_NODES].sort());
    for (const ix of district.intersections) {
      expect(ix.signalized).toBe(false);
      expect(ix.degree).toBe(3);
    }
  });

  it("THE ONE-ROUNDABOUT INVARIANT: a real circulatory carriageway and a real island", () => {
    // Re-derived from the builder's own rules rather than read back out of the
    // file's meta, so a generator that merely PUBLISHES good numbers without
    // producing them fails here.
    const rb = district.roundabouts[0];
    const ringHalf = LANE_WIDTH_M / 2; // single-lane ring, above the 2.4 floor
    const armHalf = LANE_WIDTH_M; // 2-lane arms
    const openRadius = armHalf + JUNCTION_CORNER_RADIUS_M;
    const circulatoryRun = (Math.PI * rb.radius) / 2 - 2 * openRadius;
    const theta = openRadius / rb.radius;
    const islandRadius =
      rb.radius -
      Math.hypot((rb.radius - ringHalf) * Math.sin(theta), rb.radius - (rb.radius - ringHalf) * Math.cos(theta));

    expect(circulatoryRun).toBeGreaterThanOrEqual(20);
    expect(islandRadius).toBeGreaterThanOrEqual(18);
    // Adjacent mouths must not be able to touch: pad centres are a chord apart.
    expect(2 * rb.radius * Math.sin(Math.PI / 4)).toBeGreaterThan(2 * openRadius);
    // …and the file's published measurement must agree with the derivation, so
    // question authors can trust meta.scenario.ring.
    const published = (district.meta.scenario as { ring: Record<string, number> }).ring;
    expect(published.circulatoryRunM).toBeCloseTo(circulatoryRun, 1);
    expect(published.islandMinRadiusM).toBeCloseTo(islandRadius, 1);
    expect(published.entryGiveWayRadiusM).toBeCloseTo(rb.radius + openRadius + 0.6, 2);
  });

  it("publishes an ego pose that is BEHIND the painted give-way line", () => {
    // „the car is already at the roundabout and it must be on the line before
    // entering it" — the spawn the picture questions are authored from.
    const ring = (district.meta.scenario as { ring: { entryGiveWayRadiusM: number } }).ring;
    const gw = district.spawnPoints.find((s) => s.id === "rbs-spawn-giveway")!;
    expect(gw).toBeDefined();
    expect(Math.hypot(gw.x, gw.y)).toBeGreaterThan(ring.entryGiveWayRadiusM);
    expect(Math.hypot(gw.x, gw.y)).toBeLessThan(ring.entryGiveWayRadiusM + 6);
    expect(gw.heading).toBe(0); // northbound, into the ring
  });

  it("signs every entry: give way (Б1) + roundabout (Д11), zero stop signs/lights", () => {
    expect(world.stats.signs.giveWay).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.roundabout).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(8);
    // A dashed give-way line is PAINTED on each of the four entries — the line
    // the ego is staged behind has to actually be on the tarmac.
    expect(world.stats.stopLines).toBeGreaterThanOrEqual(4);
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
      path.join(process.cwd(), "content", "world", "rb-single-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "rb-single-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(
      path.dirname(src),
      "..",
      "..",
      "platform",
      "public",
      "world",
      "rb-single-v1.json",
    );
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("rb-single-v1 through the world runtime + traffic graph", () => {
  it("derives no signals/stop lines; the 4 ring joints stay uncontrolled", () => {
    const rt = createWorldRuntime(loadRaw());
    expect(rt.debugSignalClusters().length).toBe(0);
    expect(rt.debugStopLines().length).toBe(0); // heuristic skips roundabout nodes
    expect(rt.debugUncontrolledJunctions().map((j) => j.id).sort()).toEqual([...RING_NODES].sort());
  });

  it("resolves the ring 30 / arm 40 limits", () => {
    const rt = createWorldRuntime(loadRaw());
    expect(rt.speedLimitAt({ x: 0, y: -38 })).toBe(30); // ring
    expect(rt.speedLimitAt({ x: 4.06, y: -100 })).toBe(40); // south arm
  });

  it("builds the lane graph: 4 ring lanes + 8 arm lanes", () => {
    const graph = buildLaneGraph(loadRaw() as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(12); // 4 oneway ring + 4 × 2 arm directions
    // The ring must survive the traffic config's class exclusions — a ring no
    // vehicle can be staged on is a roundabout no scenario can ever use.
    const ringIds = new Set(assertDistrict(loadRaw()).roundabouts[0].edgeIds);
    expect(graph.lanes.filter((l) => ringIds.has(l.edgeId)).length).toBe(4);
  });
});
