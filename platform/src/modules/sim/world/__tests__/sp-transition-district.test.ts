/**
 * SP-transition micro-map contract battery (Scenario Studio doc 76 §3; the
 * nm-district.test.ts pattern, here for a TWO-SEGMENT street whose limit drops
 * mid-route).
 *
 * content/world/sp-trans-v1.json is the 50→30 zone-transition generated
 * micro-map (tools/maps/gen_sp_transition.mjs — a 160 m approach @ 50 then a
 * 200 m zone @ 30, meeting at a degree-2 mid node). The battery proves the file
 * satisfies the FULL engine contract AND the crux of SP-03: the runtime grades
 * PER EDGE, so the local limit is 50 before the transition and 30 after it, with
 * no stop line or junction derived at the mid node.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { SCENARIO_SIGN_SCALE } from "../builders/constants";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "sp-trans-v1";
const APPROACH_KMH = 50;
const ZONE_KMH = 30;
const TRANSITION_Y = 160;
const TOTAL_M = 360;
const X_LANE = 4.06;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_sp_transition.mjs)`);
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

describe(`${ID} through the world builder`, () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw(ID);
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (two collinear segments)", () => {
    expect(district.roads.nodes.length).toBe(3);
    expect(district.roads.edges.length).toBe(2);
    const approach = district.roads.edges.find((e) => e.id === "sp-tr-e-approach")!;
    const zone = district.roads.edges.find((e) => e.id === "sp-tr-e-zone")!;
    expect(approach.maxspeed).toBe(APPROACH_KMH);
    expect(zone.maxspeed).toBe(ZONE_KMH);
    expect(approach.lanes).toBe(2);
    expect(zone.lanes).toBe(2);
    expect(zone.zone).toBe("school");
    // The mid node is a plain limit change, NOT an intersection.
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
  });

  it("produces no NaN/infinite coordinates in the core buffers", () => {
    const buffers = [world.roadSurface, world.markings, world.sidewalks, world.terrain];
    let nonFinite = 0;
    for (const mesh of buffers) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
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

describe(`${ID} through the world runtime — the PER-EDGE speed-limit surface`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO stop lines and junction trackers at the mid node (limit change, not a junction)", () => {
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    expect(runtime.debugSignalClusters().length).toBe(0);
  });

  it("resolves 50 on the approach and 30 in the zone (the local limit drops mid-route)", () => {
    expect(runtime.speedLimitAt({ x: X_LANE, y: 80 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: TRANSITION_Y + 100 })).toBe(ZONE_KMH);
  });

  it("a tracked drive sees the limit drop across the transition (edge-local maxSpeedKmh)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let onApproach = -1;
    let inZone = -1;
    for (let y = 20; y < TOTAL_M - 10; y += 4) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(X_LANE, y, 0, 25), y, false);
      if (y < TRANSITION_Y - 10) onApproach = tick.maxSpeedKmh;
      if (y > TRANSITION_Y + 20) inZone = tick.maxSpeedKmh;
    }
    expect(onApproach).toBe(APPROACH_KMH);
    expect(inZone).toBe(ZONE_KMH);
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("builds the lane graph across both segments with no crossing bindings", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // Two 1+1 segments → 4 directed lanes.
    expect(graph.lanes.length).toBe(4);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sp-creep2-v1 — the founder R3 P5 road (doc 62 #30: sc-speed-creep's LONG
// 50→30 street, 400 m approach + 280 m zone). Same generator, same two-segment
// contract; this block pins the P5-specific truths the redesigned template
// copies by value.
// ---------------------------------------------------------------------------

describe("sp-creep2-v1 — the P5 long creep road (doc 62 #30)", () => {
  const CREEP2 = "sp-creep2-v1";
  const CREEP2_TRANSITION_Y = 400;
  const CREEP2_TOTAL_M = 680;

  it("is a structurally valid two-segment street: 400 m @ 50 → 280 m @ 30, tagged zone", () => {
    const district = assertDistrict(loadRaw(CREEP2));
    expect(district.roads.nodes.length).toBe(3);
    expect(district.roads.edges.length).toBe(2);
    const approach = district.roads.edges.find((e) => e.id === "sp-tr-e-approach")!;
    const zone = district.roads.edges.find((e) => e.id === "sp-tr-e-zone")!;
    expect(approach.maxspeed).toBe(50);
    expect(approach.length).toBe(400);
    expect(zone.maxspeed).toBe(30);
    expect(zone.length).toBe(280);
    // The tagged zone edge is what qualifies the painted „30" road numerals
    // (markings.ts speed glyphs) — the world's own signage for the lower cap.
    expect(zone.zone).toBe("school");
    expect(district.intersections.length).toBe(0);
    expect(district.spawnPoints.some((s) => s.id === "sp-tr-spawn-approach")).toBe(true);
  });

  it("resolves 50 on the approach and 30 in the zone (the per-edge surface the drill grades)", () => {
    const rt = createWorldRuntime(loadRaw(CREEP2));
    rt.update(1 / 60);
    expect(rt.speedLimitAt({ x: X_LANE, y: 240 })).toBe(50);
    expect(rt.speedLimitAt({ x: X_LANE, y: CREEP2_TRANSITION_Y + 120 })).toBe(30);
    expect(rt.debugStopLines().length).toBe(0);
    expect(rt.debugUncontrolledJunctions().length).toBe(0);
  });

  it("builds world geometry + the lane graph end to end", () => {
    const district = assertDistrict(loadRaw(CREEP2));
    const world = buildWorldGeometry(district, { seed: 7 });
    let nonFinite = 0;
    for (const mesh of [world.roadSurface, world.markings, world.sidewalks, world.terrain]) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
    const graph = buildLaneGraph(loadRaw(CREEP2) as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(4);
    expect(CREEP2_TOTAL_M).toBe(680);
  });

  it("SHOWS legible speed context (doc 62 P5 taste-pass): prominent entry В26-50, no false 50 on the 30 zone, a built-up approach + painted „30“ numerals", () => {
    const district = assertDistrict(loadRaw(CREEP2));
    const world = buildWorldGeometry(district, { seed: 7 });
    const plates = world.signs.filter((s) => s.kind === "limit50");
    // RE-BASELINED 1 -> 2 by doc 86 D6. The В26-50 still posts at the south
    // entry where the creep begins, at scenario prominence (lessonSized) so it
    // reads against the 2.5× road. The SECOND is the mid-route transition
    // plate for the opposite direction of travel: a driver leaving the зона-30
    // northbound— sorry, southbound — is back on a 50 road and the world now
    // says so. Both state a limit their own edge really carries, which is the
    // whole point of the lane (sign-truth.test.ts proves it over all 90 maps).
    expect(plates.length).toBe(2);
    expect(world.stats.signs.limit50).toBe(2);
    expect(plates.every((s) => s.scale === SCENARIO_SIGN_SCALE)).toBe(true);
    // …and the зона-30 is finally signed as 30 instead of being graded silently
    // (props.ts iterated deadEnds only, so a degree-2 limit change was
    // structurally unreachable — doc 86 D6).
    expect(world.stats.signs.limit30).toBeGreaterThanOrEqual(1);
    // NONE rides the 30 zone: local y > transitionY maps to world z < -400
    // (toWorld: y → -z). The reduced-zone tail no longer wears a 50 it would
    // overstate — the scenario audit the clip doubles as.
    expect(plates.every((s) => s.position[2] > -CREEP2_TRANSITION_Y)).toBe(true);
    // The approach now reads built-up — a town reason for the urban 50 cap, not
    // a bare strip: the school block PLUS the residential row flanking the creep.
    expect(district.buildings.length).toBeGreaterThan(1);
    expect(district.buildings.some((b) => b.id.startsWith("sp-tr-b-approach"))).toBe(true);
    // The markings.ts speed-glyph seam paints the zone's „30" numerals:
    // raising the zone edge's tagged limit above the glyph gate must REMOVE
    // marking quads — proving the numerals derive from the authored 30.
    const noZone = JSON.parse(JSON.stringify(loadRaw(CREEP2))) as {
      roads: { edges: Array<{ id: string; maxspeed: number }> };
    };
    noZone.roads.edges.find((e) => e.id === "sp-tr-e-zone")!.maxspeed = 50;
    const bare = buildWorldGeometry(assertDistrict(noZone), { seed: 7 });
    expect(world.stats.markingQuads).toBeGreaterThan(bare.stats.markingQuads);
  });

  it("RESTATES the 30 through the zone, so the graded tail is not signed by paint alone", () => {
    // Founder item 31, measured: the зона-30 carried posts at y=406 and y=450
    // and then nothing for 230 m, of which the last 190 m are graded. What was
    // still telling him the number over that stretch was the tarmac glyph —
    // „just written with numbers on the road 30 which is not existing in the
    // world almost anywhere". props.ts now repeats В26 at the same pitch
    // markings paints the glyph, so post and paint say it together.
    const world = buildWorldGeometry(assertDistrict(loadRaw(CREEP2)), { seed: 7 });
    const northbound = world.signs
      .filter((s) => s.kind === "limit30" && s.position[0] > 0)
      .map((s) => -s.position[2])
      .sort((a, b) => a - b);
    // Every plate really is inside the зона-30 span (400 → 680).
    expect(northbound.every((y) => y > CREEP2_TRANSITION_Y && y < 680)).toBe(true);
    // The longest unsigned run a northbound student drives inside the graded
    // zone, from the transition to the graded finish at y = 650.
    const stations = [CREEP2_TRANSITION_Y, ...northbound, 650];
    let worstGap = 0;
    for (let i = 1; i < stations.length; i++) {
      worstGap = Math.max(worstGap, stations[i]! - stations[i - 1]!);
    }
    expect(worstGap).toBeLessThanOrEqual(120);
    // …and the repeats still state the number the reducer grades, never a
    // rounded or inherited one (the T4 rule, kept by construction).
    for (const s of world.signs.filter((x) => x.kind === "limit30")) {
      expect(s.speedKmh).toBe(30);
    }
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", `${CREEP2}.json`),
      path.resolve(process.cwd(), "..", "content", "world", `${CREEP2}.json`),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${CREEP2}.json`);
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});
