/**
 * SP-signs micro-map contract battery (Scenario Studio doc 76 §3; the
 * sp-transition-district.test.ts pattern, here for a FIVE-SEGMENT street whose
 * В26 limit is cancelled TWICE, by two DIFFERENT legal endpoints).
 *
 * content/world/sp-signs-v1.json is the sign-scope generated micro-map
 * (tools/maps/gen_sp_signs.mjs): 50 → В26-40 → [JUNCTION] → 50 → В26-40 →
 * [END PLATE] → 50. The battery proves the file satisfies the FULL engine
 * contract AND the crux the scenario depends on: the runtime grades PER EDGE,
 * so the local limit really does return to 50 at BOTH endpoints, while the
 * junction endpoint is a genuine degree-3 node and the plate endpoint is not a
 * junction at all — and neither derives a stop line or a signal.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "sp-signs-v1";
const BASE_KMH = 50;
const LIMIT_KMH = 40;
/** The two В26 spans (meta.scenario.limit1 / limit2) — 240 m each, so the
 *  „ускоряване 200 м преди края" demo lands well inside either one. */
const LIMIT1 = { fromY: 100, toY: 340 };
const LIMIT2 = { fromY: 460, toY: 700 };
/** Endpoint 1 — the junction that cancels span 1. */
const JUNCTION_Y = 340;
/** Endpoint 2 — the end-of-restriction plate that cancels span 2. */
const END_SIGN_Y = 700;
const TOTAL_M = 800;
const X_LANE = 4.06;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_sp_signs.mjs)`);
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
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (five collinear segments + the side stub)", () => {
    expect(district.roads.nodes.length).toBe(7);
    expect(district.roads.edges.length).toBe(6);
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    for (const e of district.roads.edges) {
      expect(e.lanes, e.id).toBe(2);
      expect(e.oneway, e.id).toBe(false);
      // No arterial anywhere — that is what keeps the junction stop-line free.
      expect(e.class, e.id).toBe("residential");
    }
    // THE MAP'S WHOLE POINT: the driven route alternates 50 → 40 → 50 → 40 → 50,
    // so the В26 dies at BOTH endpoints and the speeding detectors grade both.
    const route = ["sp-sg-e-approach", "sp-sg-e-limit1", "sp-sg-e-between", "sp-sg-e-limit2", "sp-sg-e-end"];
    expect(route.map((id) => byId.get(id)!.maxspeed)).toEqual([BASE_KMH, LIMIT_KMH, BASE_KMH, LIMIT_KMH, BASE_KMH]);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    // No zones layer: no DistrictZoneKind encodes a speed span, so the plates
    // are narrative and `maxspeed` alone is the graded truth.
    expect(district.zones ?? []).toEqual([]);
  });

  it("endpoint 1 is a REAL junction; endpoint 2 is a plate, not a junction", () => {
    // Span 1 dies at a declared degree-3 intersection…
    expect(district.intersections.length).toBe(1);
    const ix = district.intersections[0];
    expect(ix.id).toBe("sp-sg-n-junction");
    expect(ix.y).toBe(JUNCTION_Y);
    expect(ix.degree).toBe(3);
    expect(ix.signalized).toBe(false);
    // …and the side stub is what supplies that third arm.
    const side = district.roads.edges.find((e) => e.id === "sp-sg-e-side")!;
    expect(side.from).toBe("sp-sg-n-junction");
    // …while span 2 dies at a node no intersection mentions: a sign cancels the
    // limit without being a junction. The two endpoints are the two rules.
    expect(district.intersections.some((i) => i.id === "sp-sg-n-endsign")).toBe(false);
    const endSign = district.roads.nodes.find((n) => n.id === "sp-sg-n-endsign")!;
    expect(endSign.y).toBe(END_SIGN_Y);
    const touchingEndSign = district.roads.edges.filter(
      (e) => e.from === "sp-sg-n-endsign" || e.to === "sp-sg-n-endsign",
    );
    expect(touchingEndSign.length).toBe(2); // degree 2 — collinear split only
  });

  it("carries the spawn geometry the scenario pins, inside the spans it names", () => {
    const at = (id: string) => district.spawnPoints.find((s) => s.id === id)!;
    expect(at("sp-sg-spawn-approach").x).toBe(X_LANE);
    expect(at("sp-sg-spawn-approach").y).toBe(15);
    expect(at("sp-sg-spawn-approach").heading).toBe(0);
    // Each control spawn sits INSIDE its own В26 span.
    const in1 = at("sp-sg-spawn-limit1");
    expect(in1.y).toBeGreaterThan(LIMIT1.fromY);
    expect(in1.y).toBeLessThan(LIMIT1.toY);
    const in2 = at("sp-sg-spawn-limit2");
    expect(in2.y).toBeGreaterThan(LIMIT2.fromY);
    expect(in2.y).toBeLessThan(LIMIT2.toY);
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

  it("derives NO stop line and NO signal — the junction cancels the limit, it does not control the drill", () => {
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugSignalClusters().length).toBe(0);
  });

  it("derives EXACTLY one uncontrolled junction — the В26 endpoint itself", () => {
    // It arms the right-hand-rule tracker, but that convicts only on a vehicle
    // approaching from the right: ambient traffic is 0 and no actor is staged,
    // so the only gradable fault on this map stays the driver's own speed.
    const junctions = runtime.debugUncontrolledJunctions();
    expect(junctions.length).toBe(1);
    expect(junctions[0].id).toBe("sp-sg-n-junction");
    expect(junctions[0].y).toBe(JUNCTION_Y);
  });

  it("resolves the В26 40 inside both spans and the base 50 outside them", () => {
    const limitAt = (y: number) => runtime.speedLimitAt({ x: X_LANE, y });
    expect(limitAt(50)).toBe(BASE_KMH); // approach, before the first plate
    expect(limitAt(220)).toBe(LIMIT_KMH); // span 1
    expect(limitAt(400)).toBe(BASE_KMH); // ENDPOINT 1: the junction cancelled it
    expect(limitAt(580)).toBe(LIMIT_KMH); // span 2
    expect(limitAt(760)).toBe(BASE_KMH); // ENDPOINT 2: the plate cancelled it
  });

  it("a tracked drive reads the full 50→40→50→40→50 sequence (edge-local maxSpeedKmh)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const seen: { y: number; limit: number }[] = [];
    for (let y = 20; y < TOTAL_M - 10; y += 4) {
      rt.update(1 / 60);
      seen.push({ y, limit: rt.sample(sample(X_LANE, y, 0, 30), y, false).maxSpeedKmh });
    }
    const inBand = (lo: number, hi: number) => seen.filter((s) => s.y > lo + 10 && s.y < hi - 10);
    // Well inside each stretch the limit is unambiguous (the ±10 m skirts avoid
    // the node seams, where either edge may legitimately own the sample).
    for (const [lo, hi, want] of [
      [0, LIMIT1.fromY, BASE_KMH],
      [LIMIT1.fromY, LIMIT1.toY, LIMIT_KMH],
      [JUNCTION_Y, LIMIT2.fromY, BASE_KMH],
      [LIMIT2.fromY, LIMIT2.toY, LIMIT_KMH],
      [END_SIGN_Y, TOTAL_M, BASE_KMH],
    ] as const) {
      const band = inBand(lo, hi);
      expect(band.length, `band ${lo}..${hi}`).toBeGreaterThan(0);
      expect(band.every((s) => s.limit === want), `band ${lo}..${hi} want ${want}`).toBe(true);
    }
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("builds the lane graph across every segment with no crossing bindings", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // Six 1+1 segments → 12 directed lanes.
    expect(graph.lanes.length).toBe(12);
    expect(graph.crossingLanes.size).toBe(0);
    // The harness law: ambient traffic ZERO on every drive of this map.
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});
