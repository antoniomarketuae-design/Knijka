/**
 * HZ debris-street micro-map contract battery (Scenario Studio doc 76 §3; the
 * hz-obstacle-district.test.ts pattern, re-pointed at a 2-lane ONE-WAY street).
 *
 * content/world/hz-debris-v1.json is the generated micro-map of
 * sc-hz-brake-dont-swerve (tools/maps/gen_hz_debris.mjs — one straight one-way
 * carriageway with TWO lanes in the same direction, a posted limit and NOTHING
 * else). The debris and the escort car are STAGED lesson data (the ScenarioSpec
 * + the trace script); the map only hosts the street. This battery proves the
 * file satisfies the full engine contract AND every geometric claim the
 * template pins BY VALUE (the L7 pattern).
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

const ID = "hz-debris-v1";
const LIMIT_KMH = 50;
const LENGTH_M = 300;
/** The lane centers the template and the trace script pin by value. */
const X_PLAYER = 4.06;
const X_ESCORT = -4.06;
/** The story's arclengths (meta.scenario). */
const REVEAL_Y = 160;
const DEBRIS_Y = 190;
/** The shadow's rest mark — 6 m short of the debris. */
const STOP_MARK_Y = 184;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_hz_debris.mjs)`);
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

  it("is a structurally valid district-v1 document (one-way, 2 lanes, one edge)", () => {
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(true);
    expect(road.maxspeed).toBe(LIMIT_KMH);
    expect(road.length).toBe(LENGTH_M);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
  });

  it("hosts a plain street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
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

  it("meta.scenario carries the lane + story truth the template pins by value", () => {
    const sc = (district as unknown as { meta: { scenario: Record<string, number | string> } }).meta
      .scenario;
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.lanePlayerX).toBe(X_PLAYER);
    expect(sc.laneEscortX).toBe(X_ESCORT);
    expect(sc.revealY).toBe(REVEAL_Y);
    expect(sc.debrisY).toBe(DEBRIS_Y);
    expect(sc.endY).toBe(LENGTH_M);
    expect(sc.streetEdgeId).toBe("hzd-e-street");
  });
});

describe(`${ID} through the world runtime — the lane surface`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored limit and BOTH one-way lanes at their pinned centers", () => {
    expect(runtime.speedLimitAt({ x: X_PLAYER, y: 15 })).toBe(LIMIT_KMH);
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    // laneId 0 = the player's curb lane; the drill's whole approach lives here.
    const mine = rt.sample(sample(X_PLAYER, 100, 0, 40), 1, false);
    expect(mine.edgeId).toBe("hzd-e-street");
    expect(mine.laneId).toBe(0);
    expect(mine.maxSpeedKmh).toBe(LIMIT_KMH);
    expect(mine.oneway).toBe(true);
    expect(mine.laneOffsetM).toBeCloseTo(0, 2);
    // laneId 1 = the escort's lane — the swerve's destination.
    const escort = rt.sample(sample(X_ESCORT, 100, 0, 40), 1.1, false);
    expect(escort.edgeId).toBe("hzd-e-street");
    expect(escort.laneId).toBe(1);
    expect(escort.laneOffsetM).toBeCloseTo(0, 2);
    expect(escort.laneCount).toBe(2);
  });
});

describe(`${ID} — the invariants sc-hz-brake-dont-swerve depends on (wave 6)`, () => {
  // „Спри в лентата, не свивай на сляпо" grades exactly three things: the
  // full-force stop in lane 0, the BLIND lane change into lane 1, and contact.
  // Every claim below is load-bearing — if one breaks, the drill silently
  // changes shape and the template's exact codeRefs rot.
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
  });

  it("carries NO crossing, junction or stop line: the drill grades braking, not a zebra duty", () => {
    // Two consequences, both load-bearing (the templates-hazards2 header):
    //  - no crossing ⇒ the CrossingZoneTracker has no zones ⇒ no PEDESTRIAN_*
    //    code can ever fire here;
    //  - no crossing/junction/stop line ⇒ nothing feeds the harsh-brake cause
    //    ledger, which is precisely what the template's ruleConfig override
    //    compensates for. If any appeared, that override would become wrong.
    expect(district.crossings.length).toBe(0);
    expect(district.intersections.length).toBe(0);
    const rt = createWorldRuntime(loadRaw(ID));
    expect(rt.debugSignalClusters().length).toBe(0);
    expect(rt.debugStopLines().length).toBe(0);
    expect(rt.debugUncontrolledJunctions().length).toBe(0);
  });

  it("ONE-WAY structurally disarms the center-line codes, so the swerve grades as a LANE CHANGE", () => {
    // rules/engine.ts guards BOTH CROSSED_SOLID_LINE and CENTER_LINE_TOUCHED on
    // `tick.oneway === false`. On a two-way map the leftward swerve of this
    // drill would arm the center-line arm (positive offset toward oncoming) and
    // the mistake's codeRefs would gain a code the card never claims. THIS is
    // why the drill could not reuse hz-obstacle-v1 (a two-way 1+1).
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    for (const x of [X_PLAYER, 0, X_ESCORT]) {
      const tick = rt.sample(sample(x, 150, 0, 40), 1, false);
      expect(tick.oneway, `x=${x}`).toBe(true);
      expect(tick.solidCenterLine, `x=${x}`).not.toBe(true);
    }
  });

  it("the whole story sits on the drivable street at the posted limit", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    // Spawn → reveal → the shadow's stop mark → the debris → the finish.
    for (const y of [15, REVEAL_Y, STOP_MARK_Y, DEBRIS_Y, LENGTH_M - 15]) {
      const tick = rt.sample(sample(X_PLAYER, y, 0, 40), 1, false);
      expect(tick.edgeId, `y=${y}`).toBe("hzd-e-street");
      expect(tick.maxSpeedKmh, `y=${y}`).toBe(LIMIT_KMH);
      expect(tick.laneId, `y=${y}`).toBe(0);
    }
    // …and the escort's lane is drivable across the same span (the shadow's
    // post-stop pass-around and the swerve demo both land there).
    for (const y of [REVEAL_Y, DEBRIS_Y, DEBRIS_Y + 40]) {
      const tick = rt.sample(sample(X_ESCORT, y, 0, 25), 1, false);
      expect(tick.edgeId, `y=${y}`).toBe("hzd-e-street");
      expect(tick.laneId, `y=${y}`).toBe(1);
    }
  });

  it("the reveal window is a FULL-FORCE stop and nothing less — the drill's central claim", () => {
    // The live car's full pedal is BRAKE_FORCE_N / CHASSIS_MASS ≈ 9.03 m/s²
    // (and the ghost is authored to the same rate). From the posted 50 that is
    // ≈ 10.7 m — it fits the 30 m reveal window with real room for reaction.
    // A COMFORTABLE stop (the recorder's default 0.7 × 4.6 = 3.22 m/s²) needs
    // ≈ 29.9 m and does NOT fit: lifting off instead of stamping ends up in the
    // debris. That gap between the two is the entire lesson, so it is asserted
    // here as well as in the generator.
    const v = LIMIT_KMH / 3.6;
    const windowM = DEBRIS_Y - REVEAL_Y;
    const fullStopM = v ** 2 / (2 * 9.03);
    const comfyStopM = v ** 2 / (2 * 0.7 * 4.6);
    expect(fullStopM).toBeLessThan(windowM - 8);
    expect(comfyStopM).toBeGreaterThan(windowM - 2.02);
    // The shadow's rest mark clears the debris by more than a car's nose.
    expect(STOP_MARK_Y + 2.02).toBeLessThan(DEBRIS_Y - 1.2);
  });

  it("the two lanes are exactly one pitch apart — the swerve is a real laneId delta", () => {
    // The escort sits a full lane pitch of lateral from the player (the pinned
    // centers are the map's 2 dp-rounded copies of ± SCALED_LANE_W / 2).
    // That pitch is also why the escort can NEVER enter the harsh-brake cause
    // ledger as a lead vehicle — leadGapFor drops everything past
    // LEAD_CORRIDOR_M = 4.0 — and therefore why the template must disarm
    // HARSH_BRAKING_NO_CAUSE by hand (the templates-hazards2 argument).
    expect(X_PLAYER - X_ESCORT).toBeCloseTo(8.125, 1);
    expect(X_PLAYER - X_ESCORT).toBeGreaterThan(4.0);
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("carries ONE graph lane, on the PLAYER's lane — which is why the escort is armed with a negative offset", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // The ln-merge-v1 precedent, re-proved here: buildLaneGraph gives a ONE-WAY
    // edge exactly ONE lane — it does NOT split the carriageway per marked lane
    // — and puts it ((lanes−1)/2 × W right of the centerline) on the PLAYER's
    // curb lane. That is precisely why SC_HZ_BRAKE_DONT_SWERVE_ESCORT must
    // carry extraRightOffsetM = −one lane pitch to reach the neighbouring lane:
    // the escort's lane is an OFFSET of this path, never a lane of its own.
    expect(graph.lanes.length).toBe(1);
    expect(graph.crossingLanes.size).toBe(0);
    const out = graph.nodeOut.get("hzd-n-start") ?? [];
    expect(out.some((li) => graph.lanes[li].toNode === "hzd-n-end")).toBe(true);
    const lane = graph.lanes[out[0]];
    expect(lane.px[0]).toBeCloseTo(X_PLAYER, 1);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    // No ambient traffic: nothing is ever a lead vehicle on this street unless
    // the template stages it (and the escort's lane pitch keeps it out anyway).
    expect(traffic.leadGapMeters(X_PLAYER, 15, 0)).toBe(Infinity);
  });
});
