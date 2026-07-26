/**
 * D2 — the SECOND exam district battery (ADR-007; the poligon-district
 * map-agnostic proof mold, applied to real OSM data).
 *
 * content/world/d2-v1.json is Лозенец, Sofia — built by
 * tools/maps/build_district_d2.mjs from the COMMITTED Overpass snapshot
 * (tools/maps/data/d2-lozenets.json — the ADR-007 reproducibility clause)
 * through the district-v1 transform verbatim. The battery proves the file
 * satisfies the FULL engine contract the first city district drives through,
 * from its own data alone:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: every edge ribboned,
 *                city furniture (lights, zebras) derived, zero buildings by
 *                ADR-007 descope (drivable-first), budgets, determinism;
 *   2. runtime — createWorldRuntime: signal clusters + stop lines DERIVE from
 *                signalized flags (no controls field exists — district-v1
 *                format law; unmapped = uncontrolled = right-hand rule), the
 *                Лозенец speed zones resolve (70 Яворов / 50 default / 30
 *                zones / 20 living pockets), all 5 spawns locate onto their
 *                edges, the Locator walks бул. Драган Цанков without jitter;
 *   3. traffic — buildLaneGraph + createTrafficSystem: a loopable city lane
 *                graph, crossings mapped, ambient agents stay finite and
 *                in-bounds, seed-deterministic;
 *   4. the INNOCENT DRIVE (the exam-shell precondition): a scripted lane-true
 *                drive down „Митрополит Кирил Видински" through the FULL
 *                production stack (recordScriptedDrive) replays with ZERO
 *                rule-engine violations, bit-identically.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE, type VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { recordScriptedDrive, type RecordedDrive } from "../../traces/recorder";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { CLASS_RANK } from "../builders/constants";
import { assertDistrict, type District, type WorldGeometry } from "../types";

function loadD2Raw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "d2-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "d2-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `d2-v1.json not found (run: node tools/maps/build_district_d2.mjs) in: ${candidates.join(", ")}`,
  );
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

/** Right-lane center offset from a 2-lane two-way centerline (the demo.ts
 *  authoring law): (floor(2/2) − 0.5) × 3.25 m × PERCEPTUAL_ROAD_SCALE. */
const LANE_OFF = (Math.floor(2 / 2) - 0.5) * 3.25 * PERCEPTUAL_ROAD_SCALE;

/** Offset a polyline to the RIGHT of its travel direction (x-east/y-north,
 *  heading cw-from-north: right of tangent (tx, ty) is (ty, −tx)). */
function offsetRight(
  pts: ReadonlyArray<readonly [number, number]>,
  offM: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([pts[i][0] + (dy / len) * offM, pts[i][1] - (dx / len) * offM]);
  }
  return out;
}

/** Sub-polyline between arclengths s0..s1 (endpoints interpolated). */
function slice(
  pts: ReadonlyArray<readonly [number, number]>,
  s0: number,
  s1: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let acc = 0;
  const at = (a: readonly [number, number], b: readonly [number, number], f: number): [number, number] => [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
  ];
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const lo = acc;
    const hi = acc + seg;
    if (hi > s0 && lo < s1 && seg > 0) {
      if (out.length === 0) out.push(at(pts[i - 1], pts[i], Math.max(0, (s0 - lo) / seg)));
      if (hi >= s1) {
        out.push(at(pts[i - 1], pts[i], Math.min(1, (s1 - lo) / seg)));
        break;
      }
      out.push([pts[i][0], pts[i][1]]);
    }
    acc = hi;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Structural contract
// ---------------------------------------------------------------------------
describe("d2-v1 is a structurally valid district-v1 document (ADR-007 contract)", () => {
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadD2Raw());
  });

  it("carries the ODbL provenance block and the Лозенец identity", () => {
    expect(district.meta.attribution.text).toContain("OpenStreetMap");
    expect(district.meta.attribution.license).toContain("ODbL");
    expect(district.meta.attribution.obligation).toBeTruthy();
    expect(district.meta.district).toBe("lozenets");
    expect((district.meta as { source?: { pipeline?: string } }).source?.pipeline).toContain(
      "build_district_d2",
    );
  });

  it("pins the built network (deterministic from the committed snapshot)", () => {
    expect(district.roads.nodes.length).toBe(249);
    expect(district.roads.edges.length).toBe(283);
    expect(district.intersections.length).toBe(102);
    expect(district.intersections.filter((i) => i.signalized).length).toBe(9);
    expect(district.crossings.length).toBe(52);
    expect(district.roundabouts.length).toBe(1);
    expect(district.spawnPoints.length).toBe(5);
    // BUILDINGS — the pin here used to be `toBe(0)`, the ADR-007 „drivable
    // first" descope. Doc 82 §1.2 item 1 named that zero as the single largest
    // cause of the „roads floating on an infinite lawn" read, and doc 82 P5/V7
    // is the pass that closed it: `tools/maps/gen_streetwall.mjs` stamps a
    // deterministic street wall of `sw-` prefixed footprints as a POST-PASS
    // over this build (same shape as the M-15 zone layer below — re-running
    // build_district_d2.mjs alone drops both, and these two pins catch it).
    // The AUTHORED count is still zero: every footprint on d2 is generated,
    // and stripping the `sw-` prefix must return the file to the ADR-007 state.
    expect(district.buildings.length).toBe(380);
    expect(district.buildings.filter((b) => !b.id.startsWith("sw-")).length).toBe(0);
    // The M-15 zone layer (tools/maps/gen_exam_district_zones.mjs) — a POST-PASS
    // over this build, so re-running build_district_d2.mjs alone drops it and
    // this pin catches that. Kinds, not spans: the spans belong to the M-15
    // battery (runtime/__tests__/exam-district-zones.test.ts).
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
    expect([...new Set((district.zones ?? []).map((z) => z.kind))].sort()).toEqual([
      "curveAdvisory",
      "noOvertaking",
      "noStopping",
      "solidCenterLine",
    ]);
    const stats = (district.meta as { stats?: { roadKm?: number } }).stats;
    expect(stats?.roadKm).toBe(21.7);
  });

  it("every edge resolves: nodes exist, endpoints coincide (the traffic law)", () => {
    const nodeById = new Map(district.roads.nodes.map((n) => [n.id, n]));
    const ids = new Set<string>();
    for (const e of district.roads.edges) {
      expect(ids.has(e.id), `duplicate edge id ${e.id}`).toBe(false);
      ids.add(e.id);
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      expect(from, `${e.id} from ${e.from}`).toBeTruthy();
      expect(to, `${e.id} to ${e.to}`).toBeTruthy();
      // buildLaneGraph hard invariant: geometry endpoints ARE the node coords.
      expect(e.geometry[0][0]).toBe(from!.x);
      expect(e.geometry[0][1]).toBe(from!.y);
      expect(e.geometry[e.geometry.length - 1][0]).toBe(to!.x);
      expect(e.geometry[e.geometry.length - 1][1]).toBe(to!.y);
      expect(e.geometry.length).toBeGreaterThanOrEqual(2);
      expect(e.length).toBeGreaterThan(0);
      expect(Number.isInteger(e.lanes) && e.lanes >= 1).toBe(true);
      for (const [x, y] of e.geometry) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("speaks only the engine's class vocabulary and BG speed bands", () => {
    const classes = new Set(district.roads.edges.map((e) => e.class));
    expect([...classes].sort()).toEqual([
      "primary",
      "primary_link",
      "residential",
      "secondary",
      "service",
      "tertiary",
      "unclassified",
    ]);
    for (const c of classes) expect(CLASS_RANK[c], `class ${c} unranked`).toBeGreaterThan(0);
    const speeds = new Set(district.roads.edges.map((e) => e.maxspeed));
    expect([...speeds].sort((a, b) => a - b)).toEqual([20, 30, 40, 50, 70]);
  });

  it("crossings resolve onto drivable edges (51 of 52; 1 on an excluded way)", () => {
    const edgeIds = new Set(district.roads.edges.map((e) => e.id));
    let resolved = 0;
    for (const c of district.crossings) {
      if (c.edgeId !== null) {
        expect(edgeIds.has(c.edgeId), `crossing ${c.id} edge ${c.edgeId}`).toBe(true);
        resolved++;
      }
      expect(["signals", "marked", "unmarked", "unknown"]).toContain(c.kind);
      expect(c.signalized).toBe(c.kind === "signals");
    }
    expect(resolved).toBe(51);
  });

  it("hosts the Драган Цанков roundabout: a REAL second ring, bigger than rb-1", () => {
    const rb = district.roundabouts[0];
    expect(rb.id).toBe("rb-1");
    expect(rb.edgeIds.length).toBe(12);
    // district-v1's ring is r≈19.8 — D2 brings genuinely different geometry.
    expect(rb.radius).toBeGreaterThan(25);
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    for (const id of rb.edgeIds) {
      const e = byId.get(id);
      expect(e, `ring edge ${id}`).toBeTruthy();
      expect(e!.roundabout).toBe(true);
      expect(e!.oneway).toBe(true);
    }
  });

  it("spawns sit on resolvable quiet-street edges", () => {
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    for (const s of district.spawnPoints) {
      const e = byId.get(s.edgeId);
      expect(e, `spawn ${s.id} edge ${s.edgeId}`).toBeTruthy();
      expect(["residential", "living_street", "unclassified"]).toContain(e!.class);
      expect(Number.isFinite(s.heading)).toBe(true);
    }
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "d2-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "d2-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "d2-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. World builder
// ---------------------------------------------------------------------------
describe("d2-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadD2Raw());
    world = buildWorldGeometry(district, { seed: 7, parkingBays: [] });
  });

  it("covers every edge with a ribbon or a junction patch", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(283);
    // ONE legit skip: e673155346.0 (бул. Христо Смирненски, a 3.38 m stub)
    // is fully consumed by its two scaled junction mouths — the junction
    // patches cover the asphalt (the D1 real-district contract: ribbons +
    // skipped == edges, not zero skips).
    expect(world.stats.skippedRibbons).toBe(1);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(102);
  });

  it("derives city furniture from the data alone: lights, zebras, signs", () => {
    expect(world.trafficLights.length).toBeGreaterThan(0);
    expect(world.stats.zebraCrossings).toBeGreaterThan(0);
    expect(world.stats.buildings).toBe(380);
  });

  it("the street wall costs FOUR draw calls, not 380 (doc 82 V7 / §2.2)", () => {
    // The whole reason V7 could be a data-only pass: buildings.ts merges every
    // prism into ONE mesh per facade palette variant, so the draw cost of a
    // populated district is the same four meshes an empty one would have paid
    // for a single block. Nothing here may quietly promote a plot to the
    // 16-model instanced kit either — `buildBuildingInstances` charges its
    // draw calls unconditionally, and gen_streetwall keeps every generated
    // height inside (PAVILION_MAX_HEIGHT_M, TOWER_MIN_HEIGHT_M) for exactly
    // this reason.
    expect(world.buildingWalls.length).toBe(4);
    expect(world.buildingWalls.some((m) => m.positions.length > 0)).toBe(true);
    expect(world.stats.buildingInstances).toBe(0);
    // 380 four-sided prisms ≈ 6.8 k triangles of wall + roof against the §2.2
    // phone budget of 250 k/frame — the street wall is ~3 % of it.
    const prismTris =
      world.buildingWalls.reduce((n, m) => n + m.indices.length / 3, 0) +
      world.buildingRoofs.indices.length / 3;
    expect(prismTris).toBeGreaterThan(0);
    expect(prismTris).toBeLessThan(12_000);
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
    for (const list of [
      world.trafficLights,
      world.signs,
      world.streetlights,
      world.trees,
      world.billboards,
      world.busStops,
      world.parkingKits,
    ]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("builds valid colliders (indexed trimeshes, ground covers the district)", () => {
    const g = world.colliders.ground;
    expect(g.halfExtents[0]).toBeGreaterThan(700);
    expect(g.halfExtents[2]).toBeGreaterThan(450);
    for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
      expect(c.positions.length % 3).toBe(0);
      expect(c.indices.length % 3).toBe(0);
      if (c.indices.length > 0) {
        const maxIdx = Math.max(...Array.from(c.indices));
        expect(maxIdx).toBeLessThan(c.positions.length / 3);
      }
    }
  });

  it("stays inside the city performance budget (the district-v1 bounds)", () => {
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(900_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7, parkingBays: [] });
    expect(again.stats).toEqual(world.stats);
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. World runtime
// ---------------------------------------------------------------------------
describe("d2-v1 through the world runtime", () => {
  let district: District;
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    district = assertDistrict(loadD2Raw());
    runtime = createWorldRuntime(loadD2Raw());
  });

  it("derives 4 signal clusters from signalized flags alone (no controls field)", () => {
    const clusters = runtime.debugSignalClusters();
    expect(clusters.length).toBe(4);
    // 9 signalized junction nodes + 21 signalized crossings = 30 members,
    // glued into 4 physical junction complexes along the Лозенец arterials
    // (Джеймс Баучер / Свети Наум / Симеоновско шосе / Никола Мирчев) by
    // the 40 m single-linkage rule — the D1 clustering behavior, unchanged.
    const members = clusters.reduce((s, c) => s + c.memberNodeIds.length, 0);
    expect(members).toBe(30);
    for (const c of clusters) expect(Number.isFinite(c.offsetSec)).toBe(true);
  });

  it("derives 19 stop lines: 16 signal approaches + 3 Б2 lines", () => {
    const lines = runtime.debugStopLines();
    expect(lines.length).toBe(19);
    // The three Б2s: two heuristic (service mouths onto the Яворов ramps) and
    // n2945503673, which audit C-4 turned from an accident of a missing
    // `primary_link` rank into an authored STOP_LINE_OVERRIDES entry with a
    // visible octagon — sc-ed-d2-priority-run's first beat.
    // Record<string, number>: StopLine.control also admits "giveWay" (Б1); this
    // district derives none, so the tally still resolves to only these two keys.
    const byControl: Record<string, number> = { trafficLight: 0, stopSign: 0 };
    for (const l of lines) byControl[l.control]++;
    expect(byControl).toEqual({ trafficLight: 16, stopSign: 3 });
    // Every line sits on a real edge, inside its arclength.
    for (const l of lines) {
      expect(l.sM).toBeGreaterThan(0);
      expect(Number.isFinite(l.approachBearingDeg)).toBe(true);
    }
  });

  it("treats the 90 unsignalized non-ring junctions as right-hand-rule (conservative: unmapped = uncontrolled)", () => {
    expect(runtime.debugUncontrolledJunctions().length).toBe(90);
  });

  it("resolves the Лозенец speed zones from edge tags", () => {
    // бул. Пейо К. Яворов (primary, OSM-tagged 70) — D1 has nothing above 50.
    expect(runtime.speedLimitAt({ x: -50.66, y: 359.15 })).toBe(70);
    // A tagged 30 pocket (e112078548.0).
    expect(runtime.speedLimitAt({ x: 148.08, y: 481.64 })).toBe(30);
    // Far off-map -> the meta urban default.
    expect(runtime.speedLimitAt({ x: 0, y: -5000 })).toBe(50);
  });

  it("locates every spawn point on its authored edge", () => {
    for (const s of district.spawnPoints) {
      expect(runtime.locate({ x: s.x, y: s.y }).edgeId).toBe(s.edgeId);
    }
  });

  it("the Locator walks бул. Драган Цанков without jitter", () => {
    const edge = district.roads.edges.find((e) => e.id === "e193362542.0")!;
    expect(edge.name).toContain("Драган Цанков");
    // Curb lane of the 4-lane two-way: (4/2 − 0.5) × scaled lane width.
    const curbOff = (edge.lanes / 2 - 0.5) * 3.25 * PERCEPTUAL_ROAD_SCALE;
    const lane = offsetRight(edge.geometry, curbOff);
    const total = edge.length;
    let prevLane: number | null = null;
    for (let s = 40; s <= total - 40; s += 5) {
      const p = slice(lane, s, s + 0.5)[0];
      const hit = runtime.locate({ x: p[0], y: p[1] });
      expect(hit.edgeId, `s=${s}`).toBe("e193362542.0");
      expect(Number.isFinite(hit.laneOffsetM)).toBe(true);
      expect(Math.abs(hit.laneOffsetM), `s=${s}`).toBeLessThan(2.5);
      if (prevLane !== null) expect(hit.laneId).toBe(prevLane);
      prevLane = hit.laneId;
    }
  });

  it("samples a clean tick mid-block (no phantom events)", () => {
    runtime.update(1 / 60);
    // Mid-block point on „Митрополит Кирил Видински" (southbound curb lane).
    const edge = district.roads.edges.find((e) => e.id === "e281197488.0")!;
    const lane = offsetRight(edge.geometry, LANE_OFF);
    const p = slice(lane, 200, 201)[0];
    const tick = runtime.sample(sample(p[0], p[1], 176, 30), 1, false);
    expect(tick.maxSpeedKmh).toBe(50);
    expect(tick.wrongWay).toBe(false);
    expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
    expect(Number.isFinite(tick.laneOffsetM)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Traffic lane graph + system
// ---------------------------------------------------------------------------
describe("d2-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;
  let district: District;

  beforeAll(() => {
    raw = loadD2Raw() as TrafficDistrict;
    district = assertDistrict(loadD2Raw());
  });

  it("builds a loopable city lane graph: 316 directed lanes, 264 in the loop core", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(316);
    expect(graph.loopLanes.size).toBe(264);
    // The graph.test city bar: most lanes belong to the loopable core.
    expect(graph.loopLanes.size).toBeGreaterThan(graph.lanes.length * 0.5);
    // Crossings map onto host lanes; the signalized ones find their lamp node.
    expect(graph.crossingLanes.size).toBe(49);
    expect(graph.crossingSignalNode.size).toBe(21);
  });

  it("runs ambient city traffic with zero errors, agents finite and in-bounds", () => {
    const spawn = district.spawnPoints[0];
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 8,
      pedestrianCount: 4,
      anchor: { x: spawn.x, y: spawn.y },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(8);
    for (let i = 0; i < 240; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: spawn.x, y: spawn.y },
        playerSpeedKmh: 0,
      });
    }
    const b = (district.meta as { boundsLocalMeters: { minX: number; minY: number; maxX: number; maxY: number } })
      .boundsLocalMeters;
    for (const v of traffic.vehicles) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
      expect(v.x).toBeGreaterThan(b.minX - 60);
      expect(v.x).toBeLessThan(b.maxX + 60);
      expect(v.y).toBeGreaterThan(b.minY - 60);
      expect(v.y).toBeLessThan(b.maxY + 60);
    }
    for (const p of traffic.pedestrians) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("is deterministic: same seed + same dt sequence = identical playback", () => {
    const spawn = district.spawnPoints[0];
    const run = () => {
      const t = createTrafficSystem(raw, {
        seed: 42,
        vehicleCount: 6,
        pedestrianCount: 2,
        anchor: { x: spawn.x, y: spawn.y },
        anchorRadiusM: 400,
      });
      for (let i = 0; i < 120; i++) {
        t.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      }
      return t.vehicles.map((v) => [v.x, v.y, v.speedMps]);
    };
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// 5. The innocent drive — mini exam-shell precondition proof
// ---------------------------------------------------------------------------
describe("d2-v1 innocent drive (recordScriptedDrive through the full stack)", () => {
  let demo: RecordedDrive;
  let districtRaw: unknown;

  function record(): RecordedDrive {
    const district = assertDistrict(districtRaw);
    const edge = district.roads.edges.find((e) => e.id === "e281197488.0")!;
    // Southbound curb lane down „Митрополит Кирил Видински", junction mouths
    // excluded (60 m margins keep every derived stop line out of the path).
    const lane = offsetRight(edge.geometry, LANE_OFF);
    const points = slice(lane, 60, edge.length - 60);
    return recordScriptedDrive(
      districtRaw,
      {
        steps: [
          { kind: "glance", mirror: "rear" },
          { kind: "drive", points, targetKmh: 30, stopAtEnd: true },
          { kind: "pause", sec: 1, brake: true },
        ],
      },
      { scenarioId: "d2-innocent-proof", kind: "shadow", seed: 7 },
    );
  }

  beforeAll(() => {
    districtRaw = loadD2Raw();
    demo = record();
  });

  it("THE INNOCENCE GATE: zero rule-engine violations on the whole drive", () => {
    const violations = demo.ruleEvents.filter((e) => e.kind === "violation");
    expect(violations.map((v) => `${v.code}@${v.t.toFixed(1)}`)).toEqual([]);
  });

  it("actually drove: 300+ m of Лозенец street at street speed", () => {
    const s = demo.trace.samples;
    expect(s.length).toBeGreaterThan(50);
    let dist = 0;
    for (let i = 1; i < s.length; i++) {
      dist += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    }
    expect(dist).toBeGreaterThan(300);
    for (const smp of s) expect(smp.speedKmh).toBeLessThanOrEqual(30.01);
    // Comes to rest at the end (stopAtEnd + braked pause).
    expect(Math.abs(s[s.length - 1].speedKmh)).toBeLessThan(0.5);
  });

  it("is deterministic: two recordings are bit-identical", () => {
    const again = record();
    expect(JSON.stringify(again.trace)).toBe(JSON.stringify(demo.trace));
    expect(JSON.stringify(again.ruleEvents)).toBe(JSON.stringify(demo.ruleEvents));
  });
});
