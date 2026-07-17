/**
 * VU-BLINDSPOT contract battery (doc 72 §7 VU-07 „Мотор между колоните"; the
 * ln-district.test.ts pattern).
 *
 * sc-vu-blindspot-moto REUSES the committed ln-v1 micro-map, so this battery
 * adds no map coverage — ln-district.test.ts already proves the boulevard
 * satisfies the engine contract (lane centers, laneId/laneCount surface, the
 * real lane-change reducer). What it proves instead is the set of invariants
 * THIS TEMPLATE's demos rest on, which nothing else asserts:
 *
 *  1. THE DENORMALIZED CONSTANTS ARE THE MAP: the lane centers pinned by value
 *     into templates-vru2.ts (the L7 pattern) match ln-v1.json's meta.scenario.
 *  2. THE FILTERING LINE IS THE BLIND SPOT: the template's OWN staged spec —
 *     imported, not re-typed — lands the rider between the lanes when driven
 *     through the real traffic system.
 *  3. THE LEAD-CORRIDOR MARGIN IS REAL: a rider on the filtering line is
 *     structurally outside the player's lead corridor, so drawing level with
 *     an innocent player can never read as a zero-gap lead. This is the
 *     load-bearing one — the shadow's ZERO-violation gate depends on it, and
 *     the boundary itself (x = 8.125) would clear the corridor by only 7 cm.
 *  4. THE PASS LANDS IN THE TARGET LANE: the rider's laneShift puts it on the
 *     LEFT-lane center — the lane the player is about to take. That is the
 *     drill's whole premise ("моторът е точно там, накъдето отиваш").
 *  5. NOTHING ELSE ON THIS MAP CAN GRADE: ln-v1 carries no signal, stop line,
 *     crossing or junction, so the demos convict on the lane-change pair alone
 *     — the §9 `toEqual` asserts have teeth precisely because the map is bare.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { RearTailgaterSpec } from "../../contracts";
import { SC_VU_BLINDSPOT_MOTO } from "../../lessons/scenario/templates-vru2";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem, leadGapFor } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";

/** Pinned lane centers (denormalized into templates-vru2.ts / scVuBlindspotMoto). */
const LANE_RIGHT_X = 12.19;
const LANE_LEFT_X = 4.06;
/** The rider's authored filtering line (templates-vru2 VUB_X_FILTER). */
const FILTER_X = 7.59;
/** traffic/system.ts LEAD_CORRIDOR_M — the lead query's half-width, m. */
const LEAD_CORRIDOR_M = 4.0;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ln-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ln-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ln-v1.json not found (run: node tools/maps/gen_two_lane_road.mjs)`);
}

/** The template's own staged rider — single truth, never re-typed here. */
const MOTO = SC_VU_BLINDSPOT_MOTO.staged![0] as RearTailgaterSpec;

describe("sc-vu-blindspot-moto — the template's pinned ln-v1 constants ARE the map", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("the L7 denormalized lane centers match ln-v1.json meta.scenario", () => {
    const meta = (raw as unknown as { meta: { scenario: Record<string, unknown> } }).meta.scenario;
    expect(meta.laneCenterRightM).toBe(LANE_RIGHT_X);
    expect(meta.laneCenterLeftM).toBe(LANE_LEFT_X);
    expect(meta.lanesPerDirection).toBe(2);
    // …and the template's map block cites the same generator recipe.
    expect(SC_VU_BLINDSPOT_MOTO.map.districtId).toBe("ln-v1");
    expect(SC_VU_BLINDSPOT_MOTO.map.params).toEqual(
      (meta as { params: Record<string, number | string> }).params,
    );
  });

  it("the rider's path nodes exist on the graph and its spawn point is ln-v1's", () => {
    const nodeIds = new Set(raw.roads.nodes.map((n) => n.id));
    for (const id of MOTO.actor.pathNodes) expect(nodeIds.has(id)).toBe(true);
    expect(SC_VU_BLINDSPOT_MOTO.start.spawnPointId).toBe("ln-spawn-start");
  });
});

describe("sc-vu-blindspot-moto — the filtering line through the REAL traffic system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  const stageRider = () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: LANE_RIGHT_X, y: 15 },
      anchorRadiusM: 400,
    });
    const view = traffic.stage({
      kind: "vehicle",
      id: MOTO.id,
      pathNodes: MOTO.actor.pathNodes,
      hold: MOTO.actor.hold,
      cruiseSpeedMps: MOTO.actor.cruiseSpeedMps,
      extraRightOffsetM: MOTO.actor.extraRightOffsetM,
      colorIndex: MOTO.actor.colorIndex,
    });
    expect(view).not.toBeNull();
    return traffic;
  };

  it("the template's own extraRightOffsetM puts the rider BETWEEN the lanes (the blind spot)", () => {
    const traffic = stageRider();
    const rider = traffic.staged(MOTO.id)!;
    expect(Math.abs(rider.x - FILTER_X)).toBeLessThan(0.05);
    // Between the two lane centers, on the divider's target-lane side — this
    // is „промъква се между лентите", asserted rather than asserted-in-prose.
    expect(rider.x).toBeGreaterThan(LANE_LEFT_X);
    expect(rider.x).toBeLessThan(LANE_RIGHT_X);
  });

  it("THE LOAD-BEARING MARGIN: a rider drawing level is outside the player's lead corridor", () => {
    // The shadow's ZERO-violation gate rests on this. If the filtering line
    // fell inside the corridor, a rider alongside an innocent player would
    // read as a lead at gap 0 (leadGapFor clamps to ≥ 0) and fire
    // FOLLOWING_TOO_CLOSE on a driver doing everything right.
    const lateralM = LANE_RIGHT_X - FILTER_X;
    expect(lateralM).toBeGreaterThan(LEAD_CORRIDOR_M);
    expect(lateralM).toBeGreaterThan(LEAD_CORRIDOR_M + 0.5); // real daylight, not 7 cm

    // Functional proof against the shipped query: a rider on the filtering
    // line, 8 m AHEAD of a right-lane player heading north, is invisible to it.
    expect(leadGapFor([{ x: FILTER_X, y: 158 }], LANE_RIGHT_X, 150, 0)).toBe(Infinity);
    // Counter-proof that the query is live at all: the same rider in the
    // player's OWN lane is seen immediately.
    expect(leadGapFor([{ x: LANE_RIGHT_X, y: 158 }], LANE_RIGHT_X, 150, 0)).toBeLessThan(Infinity);
    // …and the boundary itself would have cleared it by only ~7 cm — which is
    // exactly why VUB_X_FILTER is not 8.125.
    expect(LANE_RIGHT_X - 8.125).toBeGreaterThan(LEAD_CORRIDOR_M);
    expect(LANE_RIGHT_X - 8.125 - LEAD_CORRIDOR_M).toBeLessThan(0.1);
  });

  it("the laneShift pass lands the rider on the LEFT-lane center — the lane the player wants", () => {
    const traffic = stageRider();
    traffic.stagedCommand(MOTO.id, { type: "cruise", speedMps: MOTO.passSpeedMps });
    traffic.stagedCommand(MOTO.id, { type: "laneShift", toOffsetM: MOTO.passShiftM, rampSec: 1.5 });
    // Well past the 1.5 s ramp.
    for (let i = 0; i < 180; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    const rider = traffic.staged(MOTO.id)!;
    expect(Math.abs(rider.x - LANE_LEFT_X)).toBeLessThan(0.05);
    expect(rider.s).toBeGreaterThan(0); // it really drove off up the boulevard
  });
});

describe("sc-vu-blindspot-moto — ln-v1 is bare, so ONLY the lane change can grade", () => {
  it("derives ZERO signals, stop lines and junction trackers", () => {
    // The §9 asserts are `toEqual` on an exact code set. That is only
    // meaningful because there is nothing else on this map to convict on: no
    // signal to run, no stop line to roll, no zebra, no priority node.
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("carries no crossings, roundabouts or intersections at the document level", () => {
    const raw = loadRaw() as TrafficDistrict & {
      crossings: unknown[];
      roundabouts: unknown[];
      intersections: unknown[];
    };
    expect(raw.crossings.length).toBe(0);
    expect(raw.roundabouts.length).toBe(0);
    expect(raw.intersections.length).toBe(0);
    // The posted limit the column's 32 km/h pace is authored against.
    expect(raw.roads.edges[0].maxspeed).toBe(50);
  });
});
