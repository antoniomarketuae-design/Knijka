/**
 * OV one-way archetype contract battery (Scenario Studio doc 76 §3; the
 * sp-districts.test.ts pattern).
 *
 * content/world/ov-oneway-v1.json is — since the founder R3 redesign (doc 62
 * #47) — a T-JUNCTION micro-map (tools/maps/gen_ov_oneway.mjs): a 200 m
 * two-way approach stem meets a single-lane one-way cross street flowing EAST
 * (±140 m arms, 50 km/h). The battery proves the file satisfies the FULL
 * engine contract, with the archetype's REASON TO EXIST verified end-to-end:
 * the runtime's oneway / wrongWay surface feeds the rule engine's WRONG_WAY
 * grading on the bar (heading WEST = against the flow), the with-flow
 * eastbound drive stays clean, the stem stays two-way, and the approach lane
 * carries the authored М10 right-only arrows (meta.scenario.laneArrows) that
 * make the legal entry readable from the road.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const X_STEM = 4.06; // approach stem, northbound lane center
const BAR_Y = 200; // the one-way bar's polyline (lane center)

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ov-oneway-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ov-oneway-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ov-oneway-v1.json not found (run: node tools/maps/gen_ov_oneway.mjs) in: ${candidates.join(", ")}`);
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

describe("ov-oneway-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 T-junction (two-way stem + one-way bar flowing east)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(3);
    const stem = district.roads.edges.find((e) => e.id === "ov-ow-approach")!;
    expect(stem.lanes).toBe(2);
    expect(stem.oneway).toBe(false);
    expect(stem.length).toBe(200);
    for (const id of ["ov-ow-oneway-w", "ov-ow-oneway-e"]) {
      const bar = district.roads.edges.find((e) => e.id === id)!;
      expect(bar.lanes).toBe(1);
      expect(bar.oneway).toBe(true);
      expect(bar.maxspeed).toBe(50);
      expect(bar.length).toBe(140);
      // Flow EAST: geometry x strictly increasing from → to.
      const g = bar.geometry as Array<[number, number]>;
      expect(g[g.length - 1][0]).toBeGreaterThan(g[0][0]);
    }
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "ov-ow-n-junction", degree: 3 });
    expect(district.crossings.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "ov-ow-spawn-east",
      "ov-ow-spawn-entry",
    ]);
  });

  it("authors the М10 right-only arrows on the approach lane (the readable legal entry)", () => {
    const sc = district.meta.scenario as {
      laneArrows?: { edgeId?: string; lanes?: Array<{ centerM?: number; arrow?: string }> };
      gates?: Record<string, { x: number; y: number }>;
      onewayFlow?: string;
    };
    expect(sc.onewayFlow).toBe("east");
    expect(sc.laneArrows?.edgeId).toBe("ov-ow-approach");
    expect(sc.laneArrows?.lanes).toEqual([{ centerM: X_STEM, arrow: "right" }]);
    // The gates the ScenarioSpec pins by value (the L7 copy law).
    expect(sc.gates?.mouth).toEqual({ x: X_STEM, y: 170 });
    expect(sc.gates?.legalEntry).toEqual({ x: 60, y: BAR_Y });
    expect(sc.gates?.finish).toEqual({ x: 125, y: BAR_Y });
    // …and the arrows actually PAINT: stripping the authored laneArrows from
    // the meta must remove marking quads (the markings.ts SN-04 pass).
    const stripped = JSON.parse(JSON.stringify(raw)) as { meta: { scenario: Record<string, unknown> } };
    delete stripped.meta.scenario.laneArrows;
    const bare = buildWorldGeometry(assertDistrict(stripped), { seed: 7 });
    expect(world.stats.markingQuads).toBeGreaterThan(bare.stats.markingQuads);
  });

  it("hosts no lights, no stop signs, no zebras (direction choice, not priority)", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
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
      path.join(process.cwd(), "content", "world", "ov-oneway-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-oneway-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-oneway-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-oneway-v1 through the world runtime — the oneway/wrongWay surface at the T", () => {
  it("derives NO stop lines and NO signals (all-residential T; the uncontrolled tracker may arm)", () => {
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
  });

  it("keeps the stem two-way and flags only the against-flow bar heading as wrongWay", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const stem = rt.sample(sample(X_STEM, 100, 0, 40), 1, false); // northbound approach
    expect(stem.edgeId).toBe("ov-ow-approach");
    expect(stem.oneway).toBe(false);
    expect(stem.wrongWay).toBe(false);

    const east = createWorldRuntime(loadRaw());
    east.update(1 / 60);
    const withFlow = east.sample(sample(60, BAR_Y, 90, 40), 1, false); // heading east = flow
    expect(withFlow.oneway).toBe(true);
    expect(withFlow.wrongWay).toBe(false);

    const west = createWorldRuntime(loadRaw());
    west.update(1 / 60);
    const against = west.sample(sample(-60, BAR_Y, 270, 40), 1, false); // heading west = against
    expect(against.oneway).toBe(true);
    expect(against.wrongWay).toBe(true);
  });

  it("grades direction through the REAL reducer: west on the bar = WRONG_WAY; east = clean", () => {
    const drive = (headingDeg: number, x0: number, xStep: number): RuleEvent[] => {
      const rt = createWorldRuntime(loadRaw());
      let rules = createRuleEngine();
      const out: RuleEvent[] = [];
      const dt = 0.1;
      let t = 0;
      let x = x0;
      // ~3 s of forward driving at 40 km/h along the bar (past the 1.5 s
      // wrong-way sustain).
      for (let i = 0; i < 30; i++) {
        t += dt;
        x += xStep;
        rt.update(dt);
        const tick = rt.sample(sample(x, BAR_Y, headingDeg, 40), t, false);
        const r = reduceTick(rules, tick);
        rules = r.state;
        out.push(...r.events);
      }
      return out;
    };

    const withFlow = drive(90, 30, (40 / 3.6) * 0.1); // east, x increasing
    expect(withFlow.filter((e) => e.kind === "violation")).toEqual([]);

    const against = drive(270, -30, -(40 / 3.6) * 0.1); // west, x decreasing
    const codes = against.filter((e) => e.kind === "violation").map((e) => e.code);
    expect([...new Set(codes)]).toEqual(["WRONG_WAY"]);
  });
});

describe("ov-oneway-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 2 stem lanes + 1 per one-way arm", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(4);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty junction)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_STEM, y: 15 },
      anchorRadiusM: 500,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_STEM, 15, 0)).toBe(Infinity);
  });
});

/**
 * SWEEP-161 FINDING (sc-ov-oneway, mobile-right, CRITICAL) — REFUTED AS A
 * DISTRICT DEFECT. Recorded in this battery because the file it was routed to,
 * `public/world/ov-oneway-v1.json`, is JSON and cannot carry the reasoning, and
 * because it is GENERATED (`meta.generator = tools/maps/gen_ov_oneway.mjs`), so
 * a hand-edit there would be silently reverted by the next regeneration.
 *
 * THE CLAIM: „Past the T-junction the world simply stops. The «еднопосочна
 * улица» the student is told to follow to its end is an unpainted grey apron
 * that runs out into a flat green plane — no road, no kerb, no buildings, no
 * traffic, no barrier. At t203s the car is sitting on grass with nothing in any
 * direction."
 *
 * WHAT THE FRAMES ACTUALLY SHOW. At t143s the car is STOPPED (0 км/ч) on the
 * junction apron at the top of the stem, pointed NORTH, looking out over open
 * terrain; at t203s it is on grass with the district's buildings visible only
 * in the mirror, behind it. It is north of the bar, not on it. The one-way
 * street runs EAST–WEST; the student was told to turn onto it and drive it to
 * its end, and never entered it.
 *
 * WHY IT NEVER ENTERED IT — MEASURED AT THE INSTRUMENT, NOT INFERRED. The
 * sweep's driver cannot steer: the entire actuation of
 * `tools/mobile/lesson-audit.mjs` is `page.keyboard.down/up("KeyW")` and
 * `…("KeyS")` plus one `press("Escape")`, and a census of that harness for
 * KeyA / KeyD / ArrowLeft / ArrowRight / any steer token returns ZERO. The
 * spawn is `ov-ow-spawn-entry` at (4.06, 15) heading 0 — due north, 185 m of
 * straight stem ahead of it. A car that can only accelerate and brake drives
 * the stem, crosses the junction pad and leaves the authored extent
 * (`meta.boundsLocalMeters.maxY` = 210.06). „Nothing in any direction" is what
 * is north of a micro-map's north edge; it is not the one-way street.
 *
 * AND THE SIGNATURE IS FILE-INDEPENDENT, which is what rules the district out.
 * Across the standing corpus, BROKEN findings whose verdict is some form of
 * „drove off the map" cover SIX distinct scenarios — sc-junction-blind,
 * sc-jx-equal-left, sc-ov-lane-keeping, sc-ov-oneway, sc-park-night,
 * sc-vu-emergency-junction — routed to SIX different suspect files
 * (lessons/finish.ts ×2, scene/lessonWorldRecipe.ts, templates-vru.ts,
 * templates-lanes.ts, and this district). Every one of them is a lesson whose
 * correct line requires a TURN. One symptom routed to six files is not six
 * defects.
 *
 * ROUTED, NOT TOUCHED: `tools/mobile/lesson-audit.mjs` (no lateral input).
 *
 * THE ONE RESIDUAL, STATED RATHER THAN QUIETLY FIXED: nothing closes the top of
 * the T. `builders/terminus.ts` builds a closing mass only at DEAD ENDS near
 * the boundary, and `ov-ow-n-junction` is a degree-3 intersection, so it is not
 * a candidate — a real T has a wall across the top and this one has open
 * terrain. That is worth fixing, but the fix belongs to the GENERATOR
 * (`tools/maps/gen_ov_oneway.mjs`, which would have to author the closing
 * footprint) or to `terminus.ts`'s definition of an end — not to a hand-edit of
 * generated JSON, and neither file is this lane's. It is reported, not touched.
 *
 * WHAT THIS BLOCK PINS is the half of the claim that is checkable here and was
 * false: that the one-way street „runs out into a flat green plane". It does
 * not — both arms are authored at full length and both build carriageway.
 */
describe("ov-oneway-v1: the one-way street the sweep never drove is really there", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("authors both arms of the bar at their full ±140 m, meeting the stem at the T", () => {
    const nodes = new Map(district.roads.nodes.map((n) => [n.id, n]));
    const j = nodes.get("ov-ow-n-junction")!;
    expect([j.x, j.y]).toEqual([0, 200]);
    // The two arms reach the full authored half-length in BOTH directions —
    // the street the briefing says to follow "до края" exists on both sides.
    expect([nodes.get("ov-ow-n-east")!.x, nodes.get("ov-ow-n-east")!.y]).toEqual([140, 200]);
    expect([nodes.get("ov-ow-n-west")!.x, nodes.get("ov-ow-n-west")!.y]).toEqual([-140, 200]);
    // …and the stem is the 200 m the spawn drives north up.
    expect([nodes.get("ov-ow-n-south")!.x, nodes.get("ov-ow-n-south")!.y]).toEqual([0, 0]);
  });

  it("the spawn faces due NORTH up the stem — a straight line leaves the map at the T", () => {
    const spawn = district.spawnPoints.find((s) => s.id === "ov-ow-spawn-entry")!;
    expect(spawn.heading).toBe(0); // north; no steering input can change this
    expect(spawn.y).toBe(15);
    // 185 m of stem, then the junction, then the north edge of the world 10 m on.
    const maxY = district.meta.boundsLocalMeters.maxY;
    expect(maxY).toBeGreaterThan(200);
    expect(maxY).toBeLessThan(215);
  });

  it("the bar carries drawn carriageway across its whole length — not an apron that stops", () => {
    // Sample the ROAD surface across the bar at 20 m intervals from the west
    // tip to the east tip. If the street "ran out into a flat green plane",
    // the far samples would have no road under them.
    const road = world.roadSurface.positions;
    const xsAtBar: number[] = [];
    for (let i = 0; i + 2 < road.length; i += 3) {
      const x = road[i]!;
      const y = -road[i + 2]!; // world (x, h, -y) → district y
      if (Math.abs(y - BAR_Y) <= 12) xsAtBar.push(x);
    }
    expect(xsAtBar.length).toBeGreaterThan(0);
    // Road geometry reaches within 5 m of BOTH authored tips.
    expect(Math.min(...xsAtBar)).toBeLessThanOrEqual(-135);
    expect(Math.max(...xsAtBar)).toBeGreaterThanOrEqual(135);
  });
});
