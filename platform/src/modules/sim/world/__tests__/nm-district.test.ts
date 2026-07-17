/**
 * NM narrow-street micro-map contract battery (Scenario Studio doc 76 §3; the
 * sp-districts.test.ts pattern for a single plain two-way street).
 *
 * content/world/ov-narrow-v1.json is the narrow-meeting generated micro-map
 * (tools/maps/gen_narrow_street.mjs — one straight two-way street, ONE lane per
 * direction, a posted limit and NOTHING else: no zebra, no lights, no
 * junctions). The parked row + the oncoming actor are STAGED lesson data
 * (narrowMeeting in the ScenarioSpec); the map only hosts the street. The
 * battery proves the file satisfies the FULL engine contract each district
 * drives through: world builder, runtime speed-limit surface, traffic graph.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { SC_LN_OBSTACLE_MEETING } from "../../lessons/scenario/templates-lanes2";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { resolveStagedVehiclePath } from "../../traffic/staged";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "ov-narrow-v1";
const LIMIT_KMH = 40;
const LENGTH_M = 240;
const X_LANE = 4.06; // right-lane center of a 1+1 street (drawn lane 8.125 m)

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_narrow_street.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document (plain two-way street)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(LIMIT_KMH);
    expect(road.length).toBe(LENGTH_M);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "nm-spawn-approach",
      "nm-spawn-finish",
    ]);
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

describe(`${ID} through the world runtime — the speed-limit surface`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored limit everywhere and surfaces the single northbound lane", () => {
    expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(LIMIT_KMH);
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    const tick = rt.sample(sample(X_LANE, 100, 0, 20), 1, false);
    expect(tick.edgeId).toBe("nm-e-street");
    expect(tick.laneId).toBe(0);
    expect(tick.maxSpeedKmh).toBe(LIMIT_KMH);
    expect(tick.oneway).toBe(false);
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("builds the lane graph: 2 directed lanes, no crossing bindings", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The SECOND tenant: sc-ln-obstacle-meeting (doc 72 OV-18 × OV-14, wave 7) —
// the чл. 44 queue drill. It shares this street with the live sc-ov-narrow and
// depends on things the battery above never had to pin: the paths its staged
// queue rides, the section/props geometry it authors, and (the load-bearing
// one) the exact SHAPE of the runtime's laneOffsetM curve across the осева,
// which is what makes its „провиране" demo grade CENTER_LINE_TOUCHED and its
// pull-out demo grade nothing but the crash.
// ---------------------------------------------------------------------------

describe(`${ID} — the invariants sc-ln-obstacle-meeting rests on`, () => {
  it("pins THIS district and the generator recipe (the L7 copy truth)", () => {
    const d = loadRaw(ID) as {
      meta: { scenario?: { laneCenterRightM?: number; params?: Record<string, number> } };
    };
    expect(SC_LN_OBSTACLE_MEETING.map.districtId).toBe(ID);
    expect(SC_LN_OBSTACLE_MEETING.map.archetype).toBe("narrow-street");
    expect(d.meta.scenario?.params?.lengthM).toBe(SC_LN_OBSTACLE_MEETING.map.params.lengthM);
    expect(d.meta.scenario?.params?.maxspeedKmh).toBe(SC_LN_OBSTACLE_MEETING.map.params.maxspeedKmh);
    expect(d.meta.scenario?.laneCenterRightM).toBe(X_LANE);
  });

  it("both staged actors resolve on the lane graph, holds inside their paths", () => {
    const graph = buildLaneGraph(loadRaw(ID) as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    for (const staged of SC_LN_OBSTACLE_MEETING.staged ?? []) {
      if (!("actor" in staged)) continue;
      const actor = staged.actor;
      const resolved = resolveStagedVehiclePath(graph, actor.pathNodes, actor.extraRightOffsetM ?? 0);
      expect(resolved, `${staged.id} path must resolve`).not.toBeNull();
      const holdArc = resolved!.nodeS[actor.hold.nodeIndex] + actor.hold.offsetM;
      expect(holdArc, `${staged.id} hold inside path`).toBeGreaterThanOrEqual(0);
      expect(holdArc).toBeLessThanOrEqual(resolved!.length);
      if (staged.kind === "oncomingStream") {
        expect(staged.gapsM).toHaveLength(staged.count - 1);
        for (const g of staged.gapsM) expect(holdArc - g).toBeGreaterThanOrEqual(0);
      }
      if (staged.kind === "narrowMeeting") {
        // The actor's section entrance must be a real arc of its own path…
        const entryArc = resolved!.nodeS[staged.actorEntry.nodeIndex] + staged.actorEntry.offsetM;
        expect(entryArc).toBeGreaterThan(0);
        expect(entryArc).toBeLessThanOrEqual(resolved!.length);
        // …and it must lie AHEAD of the hold: the runner syncs the car down to
        // its entrance, it never reverses to reach it.
        expect(entryArc).toBeGreaterThan(holdArc);
        // The parked row rides the player's own lane, inside the section, and
        // the props are held on the SAME street (northbound path).
        for (const p of staged.props ?? []) {
          const pr = resolveStagedVehiclePath(graph, p.pathNodes, p.extraRightOffsetM ?? 0);
          expect(pr, `${staged.id} prop path must resolve`).not.toBeNull();
          const arc = pr!.nodeS[p.hold.nodeIndex] + p.hold.offsetM;
          expect(arc).toBeGreaterThan(staged.sectionStart.y);
          expect(arc).toBeLessThan(staged.sectionEnd.y);
        }
      }
    }
  });

  it("the drill's geometry fits this 240 m street — section, queue and both gates", () => {
    const meeting = (SC_LN_OBSTACLE_MEETING.staged ?? []).find((s) => s.kind === "narrowMeeting")!;
    if (meeting.kind !== "narrowMeeting") return;
    // The section sits mid-block with room to stop before it and finish after
    // it, and it does NOT overlap sc-ov-narrow's own section (y ∈ [110, 145]
    // there) further than the parked row needs — the two tenants stage their
    // rows in different places so neither drill inherits the other's props.
    expect(meeting.sectionStart.y).toBeGreaterThan(120);
    expect(meeting.sectionEnd.y).toBeLessThan(LENGTH_M - 40);
    expect(meeting.obstructionSide).toBe("player");
    // The three gates: the wait is BEFORE the section (a car that stopped there
    // has not entered the стеснение), the round is inside it on the opposing
    // side, the home is past it — in that order, all on the road.
    const zone = (id: string) => {
      const o = SC_LN_OBSTACLE_MEETING.success.find((s) => s.id === id)!;
      expect(o.params.kind).toBe("reachZone");
      return o.params as { kind: "reachZone"; x: number; y: number; radiusM: number; maxSpeedKmh?: number };
    };
    const wait = zone("sc-lnom-wait");
    const round = zone("sc-lnom-round");
    const home = zone("sc-lnom-home");
    expect(wait.x).toBe(X_LANE);
    expect(wait.y).toBeLessThan(meeting.sectionStart.y - 6); // outside the barge frame
    expect(wait.maxSpeedKmh).toBeLessThanOrEqual(6); // unsatisfiable in motion
    expect(round.x).toBeLessThan(0); // the opposing lane — lane-exclusive
    expect(round.y).toBeGreaterThan(meeting.sectionStart.y);
    expect(round.y).toBeLessThan(meeting.sectionEnd.y);
    expect(home.x).toBe(X_LANE);
    expect(home.y).toBeGreaterThan(meeting.sectionEnd.y);
    expect(home.y).toBeLessThan(LENGTH_M);
    // Each gate's radius is smaller than the 8.125 m lane pitch, so no gate can
    // be satisfied from the other lane (the house lane-exclusivity law).
    for (const g of [wait, round, home]) expect(g.radiusM).toBeLessThan(8.125 / 2);
  });

  it("the runtime's laneOffsetM curve IS the CENTER_LINE_TOUCHED band the demo rides", () => {
    // THE load-bearing assert of this drill. laneOffsetM is measured from the
    // NEAREST lane centre (+ = toward the осева) and the whole street is
    // laneId 0 / laneCount 1 in BOTH directions, so rules/engine.ts's
    // centerLineCond (`laneId === laneCount-1 && laneOffsetM > 3.25`) marks out
    // exactly one band: |x| < 0.81, the paint itself. That is why
    //   - „провиране" at x = 0.4 grades CENTER_LINE_TOUCHED (offset 3.66), and
    //   - the pull-out at x = −4.06 grades NOTHING off position (offset ≈ 0):
    //     a car centred in the oncoming lane is not „off-centre", it is in the
    //     wrong lane — which on this map only the crash can say.
    const rt = createWorldRuntime(loadRaw(ID));
    const offsetAt = (x: number): number => {
      let tick = rt.sample(sample(x, 120, 0, 15), 1, false);
      for (let i = 0; i < 90; i++) {
        rt.update(1 / 60);
        tick = rt.sample(sample(x, 120, 0, 15), 1 / 60, false);
      }
      return tick.laneOffsetM;
    };
    const TOL = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM; // 3.25 — the same dial
    expect(offsetAt(X_LANE)).toBeLessThan(TOL); // own-lane centre: innocent
    expect(offsetAt(-X_LANE)).toBeLessThan(TOL); // oncoming centre: also innocent
    expect(offsetAt(0.4)).toBeGreaterThan(TOL); // the провиране line: convicts
    expect(offsetAt(-2)).toBeLessThan(TOL); // the lean-out that meets the car
    expect(offsetAt(0.81)).toBeCloseTo(TOL, 1); // the band edge, both sides
    expect(offsetAt(-0.81)).toBeCloseTo(TOL, 1);
  });
});
