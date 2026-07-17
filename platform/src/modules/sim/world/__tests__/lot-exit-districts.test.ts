/**
 * PARKING-LOT contract battery — the REVERSE-EXIT reuse of lot-perp-v1
 * (Scenario Studio doc 76 §3; the lot-perp-district.test.ts pattern).
 *
 * sc-park-bay-exit-rev ships NO map: it starts inside the P0's own free bay and
 * drives out. „Reuse" is only honest if the reused file is pinned against what
 * the new scenario actually leans on, which is a different set of facts than the
 * P0's. This battery asserts exactly those, and nothing the P0 already owns:
 *
 *   1. THE POSE  — lot-bay-3 is the free bay, it is boxed by occupied bays on
 *      BOTH sides, and the authored start pose sits inside its rect with real
 *      air around it (an exit drill is only a drill if the bay is a box);
 *   2. THE CORRIDOR — the authored reverse path never overlaps a parked-car
 *      rect, with the clearance MEASURED (not just "no overlap"), so a future
 *      change to the hero footprint or the bay pitch fails here, loudly,
 *      instead of silently inside a re-recording;
 *   3. THE DRIVE-AWAY — x = 1.0 up the aisle is on lot-e-aisle, 20 km/h, never
 *      wrong-way, and clear of the whole bay row;
 *   4. THE LIVE ENCOUNTER — the staged walker's aisle path is stageable on an
 *      EMPTY lot (a pedestrian needs no lane graph), while the backlog's aisle
 *      CAR is not (the service edge is excluded from the graph) — the blocker
 *      the template's L5 documents, pinned as a fact rather than a comment;
 *   5. PUBLICATION — the platform/public copy is byte-identical to the source.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { scenarioBaysOf } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { assertDistrict } from "../types";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle";
import { obstacleRectsOverlap } from "../../traces/recorder";
import { lotObstacleRects, recordScParkBayExitRevDrive } from "../../traces/scParkBayExitRev";
import { SC_PARK_BAY_EXIT_REV } from "../../lessons/scenario/templates-parking2";

function repoRoot(): string {
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

function loadLotRaw(): unknown {
  const file = path.join(repoRoot(), "content", "world", "lot-perp-v1.json");
  if (!fs.existsSync(file)) {
    throw new Error(`lot-perp-v1.json not found (run: node tools/maps/gen_parking_lot.mjs)`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
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

/** SAT separation between two OBBs, m: max over the 4 axes of the interval gap
 *  (> 0 = separated by that distance along the best axis). The measuring twin
 *  of recorder.obstacleRectsOverlap, which only answers yes/no. */
function rectGapM(
  a: { x: number; y: number; headingDeg: number; halfWidthM: number; halfLengthM: number },
  b: { x: number; y: number; headingDeg: number; halfWidthM: number; halfLengthM: number },
): number {
  let best = -Infinity;
  for (const r of [a, b]) {
    const h = (r.headingDeg * Math.PI) / 180;
    for (const [ux, uy] of [
      [Math.sin(h), Math.cos(h)],
      [Math.cos(h), -Math.sin(h)],
    ] as const) {
      const span = (rc: typeof a): [number, number] => {
        const hh = (rc.headingDeg * Math.PI) / 180;
        const c = rc.x * ux + rc.y * uy;
        const ext =
          rc.halfLengthM * Math.abs(Math.sin(hh) * ux + Math.cos(hh) * uy) +
          rc.halfWidthM * Math.abs(Math.cos(hh) * ux - Math.sin(hh) * uy);
        return [c - ext, c + ext];
      };
      const [a0, a1] = span(a);
      const [b0, b1] = span(b);
      const gap = Math.max(b0 - a1, a0 - b1);
      if (gap > best) best = gap;
    }
  }
  return best;
}

const heroAt = (x: number, y: number, headingDeg: number) => ({
  x,
  y,
  headingDeg,
  halfWidthM: CHASSIS_HALF_EXTENTS.x,
  halfLengthM: CHASSIS_HALF_EXTENTS.z,
});

describe("lot-perp-v1 as the sc-park-bay-exit-rev START POSE", () => {
  let raw: unknown;

  beforeAll(() => {
    raw = loadLotRaw();
    assertDistrict(raw);
  });

  it("lot-bay-3 is the free bay of an XX_XX row — boxed on BOTH sides", () => {
    const bays = scenarioBaysOf(raw);
    expect(bays.map((b) => b.id)).toEqual([
      "lot-bay-1",
      "lot-bay-2",
      "lot-bay-3",
      "lot-bay-4",
      "lot-bay-5",
    ]);
    const byId = new Map(bays.map((b) => [b.id, b]));
    expect(byId.get("lot-bay-3")!.occupied).toBe(false);
    // The drill's whole premise: an occupied bay immediately north AND south.
    expect(byId.get("lot-bay-2")!.occupied).toBe(true);
    expect(byId.get("lot-bay-4")!.occupied).toBe(true);
    expect(byId.get("lot-bay-2")!.y).toBe(-2.7);
    expect(byId.get("lot-bay-4")!.y).toBe(2.7);
  });

  it("the template's authored start pose IS lot-bay-3's centre on the bay axis", () => {
    const bay3 = scenarioBaysOf(raw).find((b) => b.id === "lot-bay-3")!;
    expect(SC_PARK_BAY_EXIT_REV.start.position).toEqual({ x: bay3.x, y: bay3.y });
    // Nose-in: the bay's own axis (90°), pointing east — deep into the bay, so
    // the only way out is backwards. (The P0 rests here nose-OUT, at 270°.)
    expect(SC_PARK_BAY_EXIT_REV.start.headingDeg).toBe(bay3.headingDeg);
    expect(SC_PARK_BAY_EXIT_REV.start.spawnPointId).toBeUndefined();
    // No spawn point exists inside a bay — which is WHY the pose seam is used.
    const spawns = (raw as { spawnPoints: Array<{ x: number; y: number }> }).spawnPoints;
    for (const s of spawns) expect(Math.hypot(s.x - bay3.x, s.y - bay3.y)).toBeGreaterThan(5);
  });

  it("the parked car rect matches the generator recipe (map REUSED, not re-cut)", () => {
    const params = (raw as { meta: { scenario: { params: Record<string, unknown> } } }).meta.scenario
      .params;
    // The template mirrors the generator recipe by value; a regenerated map
    // with different pitch/width would change the exit geometry silently.
    expect(SC_PARK_BAY_EXIT_REV.map.params).toEqual(params);
    expect(SC_PARK_BAY_EXIT_REV.map.districtId).toBe("lot-perp-v1");
  });

  it("the start pose has real air around it: > 0.5 m to each neighbour car", () => {
    const rects = lotObstacleRects(raw);
    expect(rects.length).toBe(4);
    const hero = heroAt(5.03, 0, 90);
    for (const r of rects) {
      expect(obstacleRectsOverlap(hero, r)).toBe(false);
      // 2.7 m pitch − 0.85 hero − 0.9 car = 0.95 m of air per side. If a future
      // map or chassis change eats it, the exit arc stops being authorable.
      expect(rectGapM(hero, r)).toBeGreaterThan(0.5);
    }
  });
});

describe("lot-perp-v1 as the sc-park-bay-exit-rev EXIT CORRIDOR", () => {
  it("the authored reverse arc clears every parked car — with margin, measured", () => {
    const raw = loadLotRaw();
    const rects = lotObstacleRects(raw);
    const drive = recordScParkBayExitRevDrive(raw, "shadow-correct");
    let minGap = Infinity;
    let worstT = 0;
    for (const s of drive.trace.samples) {
      if (s.gear !== -1) continue; // the arc only — the drive-away is elsewhere
      const hero = heroAt(s.x, s.y, s.headingDeg);
      for (const r of rects) {
        const gap = rectGapM(hero, r);
        if (gap < minGap) {
          minGap = gap;
          worstT = s.tSec;
        }
      }
    }
    // The authored envelope (see traces/scParkBayExitRev's header): straight
    // back 1 m, then radius 3.03 — ~0.43 m at the tightest point. A single arc
    // from the bay centre would leave ~0.08 m, which is why it is not used.
    expect(minGap, `tightest at t=${worstT}`).toBeGreaterThan(0.3);
  });

  it("the drive-away line (x = 1.0) rides lot-e-aisle at 20 km/h, never wrong-way", () => {
    const runtime: DistrictWorldRuntime = createWorldRuntime(loadLotRaw());
    runtime.update(1 / 60);
    let t = 0;
    for (let y = -3; y <= 21; y += 1.5) {
      t += 0.5;
      const tick = runtime.sample(sample(1.0, y, 0, 12), t, false);
      expect(runtime.locate({ x: 1.0, y }).edgeId).toBe("lot-e-aisle");
      expect(tick.maxSpeedKmh).toBe(20);
      // The P0's envelope note: lane detectors arm at |laneOffset| > 3.25 on
      // this road. x = 1.0 sits at −3.06 — inside, with 0.19 m to spare.
      expect(Math.abs(tick.laneOffsetM)).toBeLessThan(3.25);
      expect(tick.wrongWay).toBe(false);
      expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
    }
  });

  it("the drive-away line is clear of the whole bay row (rects start at x = 2.78)", () => {
    const rects = lotObstacleRects(loadLotRaw());
    for (let y = -6; y <= 6; y += 0.5) {
      const hero = heroAt(1.0, y, 0);
      for (const r of rects) expect(obstacleRectsOverlap(hero, r), `y=${y}`).toBe(false);
    }
  });

  it("the aisle checkpoint zone sits past the row AND past the staged walker", () => {
    const away = SC_PARK_BAY_EXIT_REV.success.find((o) => o.id === "sc-pbe-away")!;
    expect(away.params.kind).toBe("reachZone");
    if (away.params.kind !== "reachZone") return;
    // Completes at y ≈ 14 on the x = 1.0 line — north of the bay row (±5.4) and
    // north of the walker's crossing (y = 10), so the encounter cannot be
    // skipped by finishing the objective early.
    const completesAtY = away.params.y - Math.sqrt(away.params.radiusM ** 2 - 1);
    expect(completesAtY).toBeGreaterThan(10);
    expect(away.params.y).toBeLessThan(40); // on lot-e-aisle (ends at y = 40)
  });
});

describe("lot-perp-v1 staging limits — what the L5 note is about", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadLotRaw() as TrafficDistrict;
  });

  it("the service AISLE is excluded from the lane graph — no car can be pathed on it", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // Only lot-e-approach is routable (2 directed lanes) — the aisle is class
    // "service". This is the fact behind the template's honest-scope note: the
    // backlog's „a car rolls down the aisle" L5 needs a capability that does
    // not exist, not a bigger authoring effort.
    expect(graph.lanes.length).toBe(2);
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: 0 },
      anchorRadiusM: 400,
    });
    expect(
      traffic.stage({
        kind: "vehicle",
        id: "lot-aisle-car",
        pathNodes: ["lot-n-gate", "lot-n-end"], // the aisle edge
        hold: { nodeIndex: 0, offsetM: 0 },
        cruiseSpeedMps: 3,
      }),
      "if this ever stages, the L5 aisle car becomes authorable — revisit the template",
    ).toBeNull();
  });

  it("the staged WALKER needs no lane graph: her aisle path stages on the empty lot", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: 0 },
      anchorRadiusM: 400,
    });
    const walker = SC_PARK_BAY_EXIT_REV.staged![0];
    expect(walker.kind).toBe("pedestrianDartOut");
    if (walker.kind !== "pedestrianDartOut") return;
    const view = traffic.stage({
      kind: "pedestrian",
      id: walker.id,
      path: [
        walker.start,
        {
          x: walker.start.x + walker.dir.x * walker.travelM,
          y: walker.start.y + walker.dir.y * walker.travelM,
        },
      ],
      speedMps: walker.speedMps,
      crossingId: walker.crossingId,
      roadFromM: walker.roadFromM,
      roadToM: walker.roadToM,
      colorIndex: 3,
    });
    expect(view).not.toBeNull();
    // Her crossingId names NO zone here (a lot has no zebras) — deliberate:
    // the encounter grades on contact alone, never on crossing occupancy.
    expect((raw as unknown as { crossings: unknown[] }).crossings.length).toBe(0);
    expect(traffic.pedestrianOnCrossing(walker.crossingId)).toBe(false);
  });
});

describe("lot-perp-v1 publication law", () => {
  it("the platform/public copy is byte-identical to the content source", () => {
    const root = repoRoot();
    const content = fs.readFileSync(path.join(root, "content", "world", "lot-perp-v1.json"), "utf8");
    const pub = fs.readFileSync(
      path.join(root, "platform", "public", "world", "lot-perp-v1.json"),
      "utf8",
    );
    expect(pub).toBe(content);
  });
});
