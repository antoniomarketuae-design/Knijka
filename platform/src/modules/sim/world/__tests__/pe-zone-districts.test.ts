/**
 * PE LIVING-ZONE („жилищна зона", Д15/Д16) micro-map contract battery
 * (Scenario Studio doc 76 §3; the pe-school-districts.test.ts pattern extended
 * with the exit-mouth assertions this map adds).
 *
 * content/world/pe-zone-v1.json (tools/maps/gen_pe_zone.mjs) is a straight
 * two-way street whose limit falls 50 → 20 at a mid-block node, with ONE
 * UNMARKED crossing deep inside the zone and a degree-3 exit mouth onto an
 * ordinary street that joins from the EAST. The battery proves the full engine
 * contract sc-pe-zone-living drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: NOTHING painted at the
 *                crossing (a living zone has no zebra — the map's design
 *                crux), no lights/stop signs, zero non-finite coordinates;
 *   2. runtime — the PER-EDGE limit surface resolves 50 before the Д15 entry,
 *                20 through the whole zone and 50 again past the Д16 mouth
 *                (the „квартална улица с 50" demo grades against 20 — the
 *                whole point of the three-segment shape), the exit mouth
 *                derives ZERO stop lines and resolves as an UNCONTROLLED
 *                right-hand-rule junction, AND the CrossingZoneTracker arms
 *                pz-x-1 ~35 m out even though the crossing is UNMARKED;
 *   3. the SPEED-ONLY WINDOW — the structural invariant the „с 50" demo is
 *                tuned against: the ~35 m crossing zone arms wholly inside the
 *                zone, leaving a stretch where speed alone is gradable;
 *   4. the EXIT MOUTH — far enough past the crossing that the two encounters
 *                never overlap, and the joining street comes from the driver's
 *                RIGHT (so the shipped RHR tracker's modelled subset agrees
 *                with the чл. 25 exit duty instead of contradicting it);
 *   5. traffic — buildLaneGraph maps the unmarked crossing onto the zone
 *                edge's directed lanes; a STAGED walker's road-span occupancy
 *                drives pedestrianOnCrossing (the dart-out grading chain).
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

const ID = "pe-zone-v1";

/** The generator's committed recipe — pinned by value (the L7 pattern). */
const ZONE_ENTRY_Y = 120;
const CROSSING_Y = 215;
const ZONE_EXIT_Y = 285;
const TOTAL_M = 365;
const CROSS_ARM_M = 70;
const APPROACH_KMH = 50;
const ZONE_KMH = 20;
/** Right-lane center of a 2-lane street (drawn lane 8.125 m). */
const X_LANE = 4.06;
/** The curbs the staged walkers step off (half-carriageway + 1.6 stand-back). */
const CURB_X_WEST = -9.72;
const CURB_X_EAST = 9.73;
/** The CrossingZoneTracker's arming radius. */
const CROSSING_ZONE_M = 35;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pe_zone.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document (approach + zone + exit mouth)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.map((n) => n.id).sort()).toEqual([
      "pz-n-e",
      "pz-n-end",
      "pz-n-entry",
      "pz-n-exit",
      "pz-n-start",
    ]);
    expect(district.roads.edges.map((e) => e.id)).toEqual([
      "pz-e-approach",
      "pz-e-zone",
      "pz-e-out",
      "pz-e-cross",
    ]);
    // The Д15 entry is a degree-2 limit change; the Д16 mouth is the ONLY junction.
    expect(district.intersections.map((i) => i.id)).toEqual(["pz-n-exit"]);
    expect(district.intersections[0].degree).toBe(3);
    expect(district.intersections[0].signalized).toBe(false);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "pz-spawn-approach",
      "pz-spawn-finish",
    ]);
  });

  it("posts 50 outside the zone and 20 + the residential tag inside it", () => {
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    expect(byId.get("pz-e-approach")!.maxspeed).toBe(APPROACH_KMH);
    expect(byId.get("pz-e-approach")!.zone).toBeUndefined();
    expect(byId.get("pz-e-approach")!.length).toBe(ZONE_ENTRY_Y);
    const zone = byId.get("pz-e-zone")!;
    expect(zone.maxspeed).toBe(ZONE_KMH);
    // The additive legality tag (doc 72 N3) — the REDUCED limit is in maxspeed.
    expect(zone.zone).toBe("residential");
    expect(zone.length).toBe(ZONE_EXIT_Y - ZONE_ENTRY_Y);
    expect(byId.get("pz-e-out")!.maxspeed).toBe(APPROACH_KMH);
    expect(byId.get("pz-e-out")!.zone).toBeUndefined();
    expect(byId.get("pz-e-cross")!.maxspeed).toBe(APPROACH_KMH);
    expect(byId.get("pz-e-cross")!.length).toBe(CROSS_ARM_M);
  });

  it("no arm is arterial — the exit mouth can never derive a Б2 line", () => {
    // An arterial cross street would turn the чл. 25 exit duty into a Б2 full
    // stop: a different, and legally wrong, lesson. The generator forbids it;
    // assert the ship.
    const RANK: Record<string, number> = { primary: 5, secondary: 4, tertiary: 3, residential: 2 };
    for (const e of district.roads.edges) expect(RANK[e.class] ?? 2).toBeLessThan(4);
  });

  it("hosts ONE UNMARKED crossing inside the zone, on the zone edge", () => {
    expect(district.crossings.map((c) => c.id)).toEqual(["pz-x-1"]);
    const cross = district.crossings[0];
    // The design crux: чл. 61–62 shares the WHOLE carriageway, so a painted
    // zebra here would teach the opposite of the law. "unmarked" keeps the
    // CrossingZoneTracker (and with it the чл. 119 yield duty) armed on bare
    // asphalt — see gen_pe_zone.mjs's header.
    expect(cross.kind).toBe("unmarked");
    expect(cross.signalized).toBe(false);
    expect(cross.x).toBe(0);
    expect(cross.y).toBe(CROSSING_Y);
    expect(cross.edgeId).toBe("pz-e-zone");
    expect(cross.y).toBeGreaterThan(ZONE_ENTRY_Y);
    expect(cross.y).toBeLessThan(ZONE_EXIT_Y);
  });

  it("meta.scenario pins the values the ScenarioSpec copies by value", () => {
    const s = district.meta.scenario as Record<string, unknown>;
    expect(s.archetype).toBe("zebra-block");
    expect(s.primaryCrossingId).toBe("pz-x-1");
    expect(s.laneCenterRightM).toBe(X_LANE);
    expect(s.curbXWest).toBe(CURB_X_WEST);
    expect(s.curbXEast).toBe(CURB_X_EAST);
    expect(s.zoneEntryY).toBe(ZONE_ENTRY_Y);
    expect(s.zoneExitY).toBe(ZONE_EXIT_Y);
    expect(s.crossingY).toBe(CROSSING_Y);
    expect(s.exitJunctionNodeId).toBe("pz-n-exit");
    expect(s.expectedExitControl).toBe("rightHandRule");
  });

  it("paints NOTHING at the crossing and hosts no lights or stop signs", () => {
    // The living zone's whole visual argument: no zebra, no lights, no Б2 —
    // just a street people walk on.
    expect(world.stats.zebraCrossings).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
  });

  it("SHOWS a Б1 on the zone-exit approach — visible duty, zero grading", () => {
    // A free gift of the class ranks (props.ts: minor-meets-higher, maxRank < 5
    // ⇒ giveWay, never stop): the driver leaving the zone SEES „Пропусни
    // движещите се" at the mouth, which is exactly the чл. 25 exit duty the
    // template teaches. It stays RENDER-ONLY: stoplines.ts derives graded lines
    // only for Б2 (minor-meets-ARTERIAL, rank >= 4), and no arm here reaches
    // rank 4 — asserted by `debugStopLines().length === 0` below. So the map
    // shows the duty without billing a detector that does not model it (A12).
    expect(world.stats.signs.giveWay).toBe(1);
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
    expect(Array.from(again.roadSurface.positions.slice(0, 300))).toEqual(
      Array.from(world.roadSurface.positions.slice(0, 300)),
    );
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

describe(`${ID} through the world runtime — the zone's limit surface + the exit mouth`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("resolves 50 → 20 → 50 across the Д15 entry and the Д16 mouth", () => {
    // This IS the lesson's grading surface: the „квартална улица с 50" demo
    // fires the speeding codes against 20, not against 50.
    expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: ZONE_ENTRY_Y - 20 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: ZONE_ENTRY_Y + 20 })).toBe(ZONE_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: CROSSING_Y })).toBe(ZONE_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: ZONE_EXIT_Y - 20 })).toBe(ZONE_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: ZONE_EXIT_Y + 25 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: TOTAL_M - 15 })).toBe(APPROACH_KMH);
  });

  it("derives ZERO signals and ZERO stop lines; the exit mouth is UNCONTROLLED", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    // No arterial arm → the stop-sign heuristic derives nothing (and the Д15
    // entry is a degree-2 limit change, not a junction).
    expect(runtime.debugStopLines().length).toBe(0);
    // …so the mouth resolves as the right-hand-rule junction the чл. 25 exit
    // duty is DEMONSTRATED at (the tracker grades only the from-the-right
    // subset — the full duty is taught, never billed: A12).
    expect(runtime.debugUncontrolledJunctions().map((j) => j.id)).toEqual(["pz-n-exit"]);
    expect(runtime.debugUncontrolledJunctions()[0].y).toBe(ZONE_EXIT_Y);
  });

  it("CrossingZoneTracker arms the UNMARKED pz-x-1 ~35 m out and fires crossingPassed", () => {
    // The crossing paints nothing, but the runtime still grades it — that is
    // the whole reason the walkers can be graded on a zebra-less street.
    const rt = createWorldRuntime(loadRaw(ID));
    let pedOn = false;
    rt.setPedestrianQuery((id) => (id === "pz-x-1" ? pedOn : false));

    const drive = (yFrom: number, yTo: number, t0: number) => {
      const collected: Array<{ y: number; kind: string; flag?: boolean; id?: string }> = [];
      let t = t0;
      for (let y = yFrom; y <= yTo; y += 2) {
        t += 0.2;
        rt.update(0.2);
        const tick = rt.sample(sample(X_LANE, y, 0, 18), t, false);
        for (const e of tick.events) {
          if (e.kind === "crossingZoneEntered" || e.kind === "crossingPassed") {
            collected.push({ y, kind: e.kind, flag: e.pedestrianOnCrossing, id: e.crossingId });
          }
        }
      }
      return collected;
    };

    const first = drive(ZONE_ENTRY_Y, CROSSING_Y - 19, 0);
    const entered = first.find((e) => e.kind === "crossingZoneEntered" && e.id === "pz-x-1");
    expect(entered).toBeDefined();
    expect(entered!.flag).toBe(false);
    expect(Math.abs(CROSSING_Y - entered!.y - CROSSING_ZONE_M)).toBeLessThanOrEqual(4);

    // A walker steps onto the road WHILE the vehicle is inside the zone: the
    // contract re-emits the zone event with the flipped flag.
    pedOn = true;
    const second = drive(CROSSING_Y - 17, CROSSING_Y - 11, 8);
    const reEmit = second.find((e) => e.kind === "crossingZoneEntered" && e.id === "pz-x-1");
    expect(reEmit).toBeDefined();
    expect(reEmit!.flag).toBe(true);

    // Passing the crossing while it is OCCUPIED is what the reducer grades as
    // PEDESTRIAN_NOT_YIELDED (the „провиране между пешеходците" demo).
    const third = drive(CROSSING_Y - 9, CROSSING_Y + 11, 12);
    const passed = third.find((e) => e.kind === "crossingPassed" && e.id === "pz-x-1");
    expect(passed).toBeDefined();
    expect(passed!.flag).toBe(true);
  });
});

describe(`${ID} — the SPEED-ONLY WINDOW (the invariant the „с 50" demo is tuned against)`, () => {
  it("the ~35 m crossing zone arms WHOLLY inside the living zone", () => {
    // If the crossing zone reached back past the Д15 entry, a 50 km/h blast
    // would be graded by the crossing chain as well as the speeding chain and
    // the demo could not assert EXACTLY SPEEDING_DANGEROUS.
    expect(CROSSING_Y - CROSSING_ZONE_M).toBeGreaterThan(ZONE_ENTRY_Y);
  });

  it("leaves a real stretch of zone where speed alone is gradable", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    rt.setPedestrianQuery(() => false);
    // Drive the window at a zone-illegal 50: the limit surface says 20 the
    // whole way, and no crossing event exists to contaminate the episode.
    const events: string[] = [];
    let t = 0;
    for (let y = ZONE_ENTRY_Y + 2; y <= CROSSING_Y - CROSSING_ZONE_M - 5; y += 2) {
      t += 0.2;
      rt.update(0.2);
      const tick = rt.sample(sample(X_LANE, y, 0, 50), t, false);
      expect(tick.maxSpeedKmh).toBe(ZONE_KMH);
      for (const e of tick.events) events.push(e.kind);
    }
    expect(events).not.toContain("crossingZoneEntered");
    expect(events).not.toContain("crossingPassed");
    // …and the window is long enough for the 1 s dangerous-band sustain at
    // 50 km/h (~14 m) PLUS the 4.6 m/s² shed back to zone pace (~16 m).
    expect(CROSSING_Y - CROSSING_ZONE_M - ZONE_ENTRY_Y).toBeGreaterThanOrEqual(40);
  });
});

describe(`${ID} — the exit mouth (the чл. 25 „пропускаш всички" geometry)`, () => {
  it("sits far past the crossing, so the two encounters never overlap", () => {
    expect(ZONE_EXIT_Y - CROSSING_Y).toBeGreaterThanOrEqual(CROSSING_ZONE_M + 20);
  });

  it("the joining street comes from the driver's RIGHT (east arm)", () => {
    // The shipped RHR tracker grades only the from-the-right subset of the
    // exit duty; placing the cross street EAST keeps the modelled subset in
    // agreement with the law (see gen_pe_zone.mjs's second honest gap).
    const district = assertDistrict(loadRaw(ID));
    const cross = district.roads.edges.find((e) => e.id === "pz-e-cross")!;
    expect(cross.from).toBe("pz-n-exit");
    const far = district.roads.nodes.find((n) => n.id === "pz-n-e")!;
    expect(far.x).toBe(CROSS_ARM_M); // east of the zone street (x > 0)
    expect(far.y).toBe(ZONE_EXIT_Y);
  });
});

describe(`${ID} through the traffic lane graph + system`, () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw(ID) as TrafficDistrict;
  });

  it("builds the lane graph: 8 directed lanes (4 segments × 2), the crossing on the zone edge's pair", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(8);
    // The UNMARKED crossing maps onto lanes exactly like a painted one would.
    expect(graph.crossingLanes.get("pz-x-1")?.length).toBe(2);
    expect(graph.crossingSignalNode.size).toBe(0);
  });

  it("a STAGED walker's road span drives pedestrianOnCrossing (the dart-out chain)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_LANE, y: 15 },
      anchorRadiusM: 400,
    });
    // West curb → across the 16.25 m carriageway → east walk-out (the exact
    // geometry the template stages its walkers on, at pz-x-1).
    const staged = traffic.stage({
      kind: "pedestrian",
      id: "pz-test-ped",
      path: [
        { x: CURB_X_WEST, y: CROSSING_Y },
        { x: 13.73, y: CROSSING_Y },
      ],
      speedMps: 1.1,
      crossingId: "pz-x-1",
      roadFromM: 1.6,
      roadToM: 17.85,
    });
    expect(staged).not.toBeNull();
    expect(traffic.pedestrianOnCrossing("pz-x-1")).toBe(false);

    traffic.stagedCommand("pz-test-ped", { type: "cruise" });
    const onFlags: boolean[] = [];
    for (let i = 0; i < 60 * 26; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      if (i % 30 === 0) onFlags.push(traffic.pedestrianOnCrossing("pz-x-1"));
    }
    expect(onFlags[0]).toBe(false);
    expect(onFlags).toContain(true);
    expect(onFlags[onFlags.length - 1]).toBe(false);
    expect(traffic.staged("pz-test-ped")!.finished).toBe(true);
  });

  it("TWO walkers (the L5 rung) both count toward the same crossing's occupancy", () => {
    // pedestrianOnCrossing is a COUNT (traffic/system.ts), so the second
    // staged walker composes with the first instead of replacing it — which is
    // what lets L5 add an east-curb walker without a map or engine change.
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_LANE, y: 15 },
      anchorRadiusM: 400,
    });
    for (const [id, x0, x1] of [
      ["pz-test-w", CURB_X_WEST, 13.73],
      ["pz-test-e", CURB_X_EAST, -13.72],
    ] as const) {
      expect(
        traffic.stage({
          kind: "pedestrian",
          id,
          path: [
            { x: x0, y: CROSSING_Y },
            { x: x1, y: CROSSING_Y },
          ],
          speedMps: 1.1,
          crossingId: "pz-x-1",
          roadFromM: 1.6,
          roadToM: 17.85,
        }),
      ).not.toBeNull();
    }
    traffic.stagedCommand("pz-test-w", { type: "cruise" });
    traffic.stagedCommand("pz-test-e", { type: "cruise" });
    let bothOnRoad = false;
    for (let i = 0; i < 60 * 26; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      const w = traffic.staged("pz-test-w")!;
      const e = traffic.staged("pz-test-e")!;
      if (w.s >= 1.6 && w.s <= 17.85 && e.s >= 1.6 && e.s <= 17.85) bothOnRoad = true;
    }
    expect(bothOnRoad).toBe(true);
    expect(traffic.pedestrianOnCrossing("pz-x-1")).toBe(false); // both cleared
  });
});
