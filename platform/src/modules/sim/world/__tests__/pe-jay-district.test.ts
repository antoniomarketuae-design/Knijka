/**
 * PE-JAY archetype contract battery (Scenario Studio doc 76 §3; the
 * sx-district.test.ts pattern) — content/world/pe-jay-v1.json, the committed
 * signalized X of tools/maps/gen_pe_jaywalk.mjs (buildSignalXDistrict + ONE
 * post-processed crossing).
 *
 * The district shipped WITHOUT a battery; it now hosts two templates whose
 * grading chains rest on opposite halves of its one distinguishing property —
 * a signal cluster AND a marked crossing in the same map:
 *   - sc-pe-jaywalker (templates-pe)      — crossing duty under a PINNED GREEN;
 *   - sc-sig-flash-amber-ped (signals2)   — crossing duty under FLASHING AMBER.
 * Everything asserted here is a coordinate or event those templates denormalize.
 *
 * The contract, layer by layer:
 *   1. world   — assertDistrict + buildWorldGeometry: the signalized X shape,
 *                lamp heads on every approach, the zebra painted;
 *   2. runtime — ONE single-node cluster; FOUR trafficLight stop lines at the
 *                ±27.7 mouths; the CrossingZoneTracker derives pej-x-1 from
 *                crossings[] and fires the crossingZoneEntered/crossingPassed
 *                pair the PEDESTRIAN_* detectors grade;
 *   3. modes   — the flashing-amber dial (doc 72 JU-20): a dialed cluster stops
 *                emitting stop-line events entirely, which is precisely what
 *                lets a crossing drill grade on this signalized map;
 *   4. traffic — 8 loopable directed lanes; the crossing maps onto the lanes and
 *                a STAGED walker's road-span occupancy drives
 *                pedestrianOnCrossing (the dart-out grading chain).
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

/** Northbound right-lane center of the ns road (drawn lane 8.125 m). */
const X_LANE = 4.0625;
/** The post-processed crossing on the north exit arm. */
const CROSSING_ID = "pej-x-1";
const CROSSING_Y = 34;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "pe-jay-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "pe-jay-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`pe-jay-v1.json not found (run: node tools/maps/gen_pe_jaywalk.mjs) in: ${candidates.join(", ")}`);
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

describe("pe-jay-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (signalized X + ONE crossing)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(5);
    expect(district.roads.edges.length).toBe(4);
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "sx-n-c", degree: 4, signalized: true });
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "sx-spawn-east",
      "sx-spawn-south",
      "sx-spawn-west",
    ]);
  });

  it("carries the ONE crossing both templates denormalize: pej-x-1 at (0, 34) on the north arm", () => {
    // The property that makes this district (and not sx-v1) the host of a
    // crossing drill on a signalized junction.
    expect(district.crossings.length).toBe(1);
    expect(district.crossings[0]).toMatchObject({
      id: CROSSING_ID,
      x: 0,
      y: CROSSING_Y,
      kind: "marked",
      edgeId: "sx-e-n",
    });
  });

  it("covers every edge with a ribbon, patches the junction and paints the zebra", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(4);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(1);
    expect(world.stats.zebraCrossings).toBe(1);
  });

  it("hosts a signalized junction: near + far-side lamp heads per incoming approach, no signs", () => {
    // Doc 62 S1/#19: 4 approaches × (near head + far-side companion).
    const vehicle = world.trafficLights.filter((tl) => tl.head !== "pedestrian");
    expect(vehicle.length).toBe(8);
    for (const tl of vehicle) {
      expect(tl.nodeId).toBe("sx-n-c");
      expect(Number.isFinite(tl.approachBearingDeg)).toBe(true);
    }
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
  });

  it("gives the signalized CROSSING its own pedestrian heads — the red the drill is ABOUT", () => {
    // Doc 86 L3 / founder item 29. Before this the builder read only
    // `intersections[].signalized`, so `pej-x-1.signalized: true` drew nothing:
    // the whole lesson („тя пресича на ЧЕРВЕНО за нея") turned on a phase the
    // student could not see anywhere in the world. The runtime already knew —
    // it registers the crossing as a signal node and the staged walker's gate
    // reads it — so the head is a render of an existing truth, not a new clock.
    const ped = world.trafficLights.filter((tl) => tl.head === "pedestrian");
    expect(ped.length).toBe(2); // one per kerb
    for (const tl of ped) {
      // Keyed to the CROSSING, so nothing that counts junction heads sees it.
      expect(tl.nodeId).toBe("pej-x-1");
      // At the crossing's own station (y = 34), off opposite kerbs.
      expect(-tl.position[2]).toBeCloseTo(34, 1);
      expect(Math.abs(tl.position[0])).toBeGreaterThan(10);
      // Standing on the pavement, not the carriageway.
      expect(tl.position[1]).toBeGreaterThan(0.1);
    }
    expect(Math.sign(ped[0]!.position[0])).toBe(-Math.sign(ped[1]!.position[0]));
    // The bearing is the VEHICLE axis the crossing interrupts (sx-e-n runs
    // north), which is the axis whose red is the walker's green.
    for (const tl of ped) expect(tl.approachBearingDeg).toBeCloseTo(0, 3);
  });

  it("the pedestrian head is driven by the SAME node the walker's own gate reads", () => {
    // The head cannot drift from the figure crossing under it: both resolve
    // through WorldRuntime's signal node for `pej-x-1`, and the render simply
    // inverts it (vehicle red ⇒ walker green, traffic/pedestrians.ts).
    const rt = createWorldRuntime(loadRaw());
    const clusters = rt.debugSignalClusters();
    expect(clusters.some((c) => c.memberNodeIds.includes("pej-x-1"))).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 1200; i++) {
      rt.update(0.1);
      rt.sample(sample(X_LANE, -60, 0, 0), i * 0.1, false);
      seen.add(rt.signalLampState("pej-x-1", 0));
    }
    // Over a full cycle the crossing really does go red for vehicles — i.e. the
    // walker really does get a green — so the head has both states to show.
    expect(seen.has("red")).toBe(true);
    expect(seen.has("green")).toBe(true);
  });

  it("the crossing shares the junction's cluster, so the driver's green IS the walker's red", () => {
    // This is why sc-pe-jaywalker works at all: the two signal nodes are 34 m
    // apart, inside CLUSTER_LINK_M, so they merge into one cluster, and the
    // crossing's group is the axis of sx-e-n — the same NS axis the drill pins
    // to a fresh green (templates-pe.ts signalPlan). The head therefore shows
    // RED to the walker at exactly the moment the copy says «Светофарът за теб
    // е зелен» and she steps out anyway. Structural, not a coincidence of
    // timing — assert it as structure.
    const rt = createWorldRuntime(loadRaw());
    const cluster = rt
      .debugSignalClusters()
      .find((c) => c.memberNodeIds.includes(CROSSING_ID));
    expect(cluster?.memberNodeIds).toContain("sx-n-c");
    for (let i = 0; i < 900; i++) {
      rt.update(0.1);
      rt.sample(sample(X_LANE, -60, 0, 0), i * 0.1, false);
      // Same axis, same cluster ⇒ the crossing's lamp and the northbound
      // driver's lamp are the same state, every tick.
      expect(rt.signalLampState(CROSSING_ID, 0)).toBe(rt.signalLampState("sx-n-c", 0));
    }
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
    for (const list of [world.trafficLights, world.signs, world.streetlights, world.trees, world.busStops]) {
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
});

describe("pe-jay-v1 through the world runtime — cluster, stop lines, limits", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("GLUES the signalized crossing and the junction into ONE cluster", () => {
    // The load-bearing surprise of this district (and the reason the templates
    // dial by NODE id, never by cluster id): pej-x-1 is `signalized: true` and
    // sits 34 m from sx-n-c, so cluster derivation merges the crossing head and
    // the junction into a SINGLE cluster — named after the crossing, centred
    // between the two. setSignalClusterMode("sx-n-c") still resolves here via
    // the member-node map, and dialing it flashing-amber correctly takes the
    // crossing's own head into warning mode with the junction.
    const clusters = runtime.debugSignalClusters();
    expect(clusters.length).toBe(1);
    expect(clusters[0].id).toBe("pej-x-1");
    expect([...clusters[0].memberNodeIds].sort()).toEqual(["pej-x-1", "sx-n-c"]);
  });

  it("derives FOUR trafficLight stop lines at the ±27.7 junction mouths", () => {
    const lines = runtime.debugStopLines();
    expect(lines.length).toBe(4);
    expect(new Set(lines.map((l) => l.control))).toEqual(new Set(["trafficLight"]));
    const byId = new Map(lines.map((l) => [l.id, l]));
    // The southern approach line both templates' shadows cross (spawn side).
    expect(byId.get("sx-e-s@92.3:trafficLight")).toMatchObject({ group: "ns", dirSign: 1 });
    // Signalized + guarded → NOT a structurally right-hand-rule junction.
    expect(runtime.debugUncontrolledJunctions()).toEqual([]);
  });

  it("resolves the tagged speed limits per axis (the 50 the drills are graded against)", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -100 })).toBe(50); // secondary N–S
    expect(runtime.speedLimitAt({ x: 80, y: 0 })).toBe(40); // residential E–W
  });

  it("locates the southern spawn on its authored edge", () => {
    expect(runtime.locate({ x: 0, y: -105 }).edgeId).toBe("sx-e-s");
  });
});

describe("pe-jay-v1 through the world runtime — the crossing-zone chain", () => {
  it("arms the pej-x-1 zone on the approach and fires crossingPassed with the ped flag", () => {
    const rt = createWorldRuntime(loadRaw());
    const onCrossing = true;
    rt.setPedestrianQuery((id) => id === CROSSING_ID && onCrossing);

    const entered: boolean[] = [];
    let passedFlag: boolean | null = null;
    let enteredAtY: number | null = null;
    let t = 0;
    for (let y = -60; y <= 60; y += 1) {
      t += 0.12;
      rt.update(0.12);
      const tick = rt.sample(sample(X_LANE, y, 0, 25), t, false);
      for (const e of tick.events) {
        if (e.kind === "crossingZoneEntered" && e.crossingId === CROSSING_ID) {
          entered.push(e.pedestrianOnCrossing);
          if (enteredAtY === null) enteredAtY = y;
        }
        if (e.kind === "crossingPassed" && e.crossingId === CROSSING_ID) {
          passedFlag = e.pedestrianOnCrossing;
        }
      }
    }
    // The 35 m zone radius puts the arm point just north of the junction node —
    // the coordinate both templates' approach copy is written against.
    expect(entered.length).toBeGreaterThanOrEqual(1);
    expect(entered[0]).toBe(true);
    expect(enteredAtY).toBeGreaterThan(-4);
    expect(enteredAtY).toBeLessThan(2);
    // Drove over an OCCUPIED crossing — the event PEDESTRIAN_NOT_YIELDED reads.
    expect(passedFlag).toBe(true);
  });

  it("an EMPTY crossing passes with the flag clear (the shadow's acquittal path)", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setPedestrianQuery(() => false);
    let passedFlag: boolean | null = null;
    let t = 0;
    for (let y = -60; y <= 60; y += 1) {
      t += 0.12;
      rt.update(0.12);
      const tick = rt.sample(sample(X_LANE, y, 0, 25), t, false);
      for (const e of tick.events) {
        if (e.kind === "crossingPassed" && e.crossingId === CROSSING_ID) passedFlag = e.pedestrianOnCrossing;
      }
    }
    expect(passedFlag).toBe(false);
  });
});

describe("pe-jay-v1 — the flashing-amber dial (doc 72 JU-20)", () => {
  function sweepLineEvents(mode: "live" | "flashingAmber"): number {
    const rt = createWorldRuntime(loadRaw());
    if (mode === "flashingAmber") rt.setSignalClusterMode("sx-n-c", "flashingAmber");
    let lines = 0;
    let t = 0;
    for (let y = -60; y <= -10; y += 1.5) {
      t += 0.12;
      rt.update(0.12);
      const tick = rt.sample(sample(X_LANE, y, 0, 25), t, false);
      for (const e of tick.events) if (e.kind === "stopLineCrossed") lines++;
    }
    return lines;
  }

  it("LIVE: the southern approach crosses a controlled stop line (the baseline)", () => {
    expect(sweepLineEvents("live")).toBeGreaterThanOrEqual(1);
  });

  it("FLASHING AMBER: the cluster carries no phase — the line stops firing entirely", () => {
    // This is what makes sc-sig-flash-amber-ped authorable on a SIGNALIZED map:
    // no phase => no signal code can grade, leaving the crossing chain alone.
    expect(sweepLineEvents("flashingAmber")).toBe(0);
  });
});

describe("pe-jay-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 4 two-way edges → 8 directed lanes, loopable", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(8);
    expect(graph.loopLanes.size).toBe(8);
    expect(graph.junctionRadiusM.get("sx-n-c")).toBeGreaterThan(0);
  });

  it("a STAGED walker's road-span occupancy drives pedestrianOnCrossing", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    // The template's walker geometry (sc-sfap-ped / sc-jay-ped share it):
    // west curb -9.73 → 23.45 m east, roadway span 1.6 → 17.85 along the path.
    const staged = traffic.stage({
      kind: "pedestrian",
      id: "pej-test-walker",
      crossingId: CROSSING_ID,
      path: [
        { x: -9.73, y: CROSSING_Y },
        { x: -9.73 + 23.45, y: CROSSING_Y },
      ],
      speedMps: 1.5,
      roadFromM: 1.6,
      roadToM: 17.85,
    });
    expect(staged).not.toBeNull();
    expect(traffic.pedestrianOnCrossing(CROSSING_ID)).toBe(false); // still at the curb
    traffic.stagedCommand("pej-test-walker", { type: "cruise" });
    // Walk her onto the carriageway (roadFromM 1.6 → ~1.1 s at 1.5 m/s).
    for (let i = 0; i < 120; i++) traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    expect(traffic.staged("pej-test-walker")!.s).toBeGreaterThan(1.6);
    expect(traffic.pedestrianOnCrossing(CROSSING_ID)).toBe(true);
    // …and off it again (roadToM 17.85 → ~11.9 s) — the shadow's wait payoff.
    for (let i = 0; i < 60 * 12; i++) traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    expect(traffic.pedestrianOnCrossing(CROSSING_ID)).toBe(false);
  });
});
