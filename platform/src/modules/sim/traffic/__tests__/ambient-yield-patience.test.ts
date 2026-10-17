/**
 * sc-sig-controller-postures:5ee4301e — THE PATIENCE BOUND (`vehicles.ts AMBIENT_YIELD_PATIENCE_SEC`), as it stands
 * under the round-4 junction-box protocol.
 *
 * Round 3 (decision D6) let a turner go once it had held its way open for a standing student for the bound. Its
 * verifier found what that costs (R3-F1): released at flip + 5 s, the turner pulled away as a student at his line set
 * off, and they met in the box — 7 lawful COLLISION cells the bound itself created. So the bound now lifts the taught
 * MARGIN and nothing else: the car goes only if it will have passed before the EARLIEST the student could reach its
 * path, were he to pull away the instant it commits (junction-box-protocol.test.ts pins that question). A student at
 * his line — 30 m from a turn that takes 7 s — is never waited out; one who sits 100 m back is.
 *
 * THE RULE pinned here, on one car driven through `updateVehicle` with nothing else in the world:
 *   · the bound is the product's own `hesitationSustainSec` — the time after which the rule engine itself says a
 *     student standing at an open way is not taking it;
 *   · for that long the margin is kept for a standing student, to the step; then the car asks again without it;
 *   · only time the car itself held for him counts: a red lamp does not run the clock — and a staged car that holds
 *     the box as well neither runs it nor resets it (round 3 reset it: verifier R3-F4);
 *   · the clock dies when he moves, and a car that has only just pulled away stops at its line again;
 *   · «standing» is the rule engine's own full stop (1 km/h — round 5, vehicles.ts PLAYER_STANDING_MAX_MPS);
 *   · no clock lets it go while his standing body is on its path through the box, or just beyond it;
 *   · the same bound releases a car about to turn round.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { STOP_LINE_BEYOND_CUT_M } from "../../world/builders/network";
import { buildLaneGraph, laneConnector, type DirectedLane, type LaneGraph } from "../graph";
import type { TrafficRoute } from "../routes";
import type { SignalPhase } from "../../contracts";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict, type TrafficVehicleState } from "../types";
import {
  AMBIENT_YIELD_PATIENCE_SEC,
  createVehicleAgent,
  updateVehicle,
  VEHICLE_LENGTH_M,
  type VehicleAgent,
  type VehicleEnv,
} from "../vehicles";
import { makeVehicleEnv } from "./fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const sx = (): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, "sx-v1.json"), "utf-8"));
const H = 1 / 60;
const CFG = DEFAULT_TRAFFIC_CONFIG;
const OFFSET = CFG.laneWidthM / 2;
/** Standing 2 m short of the line — the fleet's standstill gap. */
const AT_LINE = CFG.minGapM;

function graphOf(d: TrafficDistrict): LaneGraph {
  return buildLaneGraph(d, {
    laneWidthM: CFG.laneWidthM,
    excludedRoadClasses: CFG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
}
function laneOf(g: LaneGraph, from: string, to: string): DirectedLane {
  const l = g.lanes.find((x) => x.fromNode === from && x.toNode === to);
  if (!l) throw new Error(`no lane ${from}>${to}`);
  return l;
}
function routeOf(lanes: DirectedLane[]): TrafficRoute {
  const laneStartS = new Float64Array(lanes.length);
  let total = 0;
  lanes.forEach((l, i) => {
    laneStartS[i] = total;
    total += l.length;
  });
  return { laneIndices: lanes.map((l) => l.index), laneStartS, totalLength: total };
}

interface Rig {
  a: VehicleAgent;
  env: VehicleEnv;
  g: LaneGraph;
  /** Arc of the car's centre when its nose is on its stop line. */
  lineS: number;
  /** The junction's drawn radius. */
  R: number;
  lamp: { phase: SignalPhase };
}
/** One eastbound car on sx-v1's west arm standing at its line, bound `turn` at the junction. */
function eastbound(turn: "left" | "uturn"): Rig {
  const d = sx();
  const g = graphOf(d);
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  const wb = laneOf(g, "sx-n-c", "sx-n-w");
  const lanes = turn === "uturn" ? [eb, wb] : [eb, laneOf(g, "sx-n-c", "sx-n-n"), laneOf(g, "sx-n-n", "sx-n-c"), wb];
  const R = g.junctionRadiusM.get("sx-n-c") as number;
  const lineS = eb.length - (R + STOP_LINE_BEYOND_CUT_M) - VEHICLE_LENGTH_M / 2;
  const agents: VehicleAgent[] = [];
  const env = makeVehicleEnv(g, d, agents);
  const lamp = { phase: "green" as SignalPhase };
  env.ambientSignal = () => lamp.phase;
  const a = createVehicleAgent(0, routeOf(lanes), lineS - AT_LINE, 1, 0);
  agents.push(a);
  updateVehicle(a, 0, env);
  return { a, env, g, lineS, R, lamp };
}
function student(env: VehicleEnv, x: number, y: number, headingDeg: number, speedMps: number): void {
  env.hasPlayer = true;
  env.playerX = x;
  env.playerY = y;
  env.playerSpeedMps = speedMps;
  env.playerDirX = Math.sin((headingDeg * Math.PI) / 180);
  env.playerDirY = Math.cos((headingDeg * Math.PI) / 180);
}
/** Step the car `steps` grid points; returns how far its arc advanced (Infinity once it has left its lane). */
function stepN(r: Rig, steps: number): number {
  const s0 = r.a.s;
  const pos0 = r.a.routePos;
  for (let k = 0; k < steps; k++) {
    r.env.timeSec += H;
    updateVehicle(r.a, H, r.env);
  }
  return r.a.routePos === pos0 ? r.a.s - s0 : Infinity;
}
const BOUND_STEPS = Math.round(AMBIENT_YIELD_PATIENCE_SEC / H);
/**
 * The oncoming student standing 100 m beyond the node on the east arm, heading west: inside the reach the taught
 * margin gives him (the car waits), outside the one he has without it (after the bound it goes) — measured 80…130 m.
 */
const AT_HIS_LINE_X = 100;
/** …and at his own line: 30 m beyond the node (the line is at R + 0.6 = 27.7 m). */
const REALLY_AT_HIS_LINE_X = 30;

describe("the patience bound is the product's own number", () => {
  it("AMBIENT_YIELD_PATIENCE_SEC is the rule engine's hesitationSustainSec, 5 s", () => {
    expect(AMBIENT_YIELD_PATIENCE_SEC).toBe(DEFAULT_RULE_CONFIG.hesitationSustainSec);
    expect(AMBIENT_YIELD_PATIENCE_SEC).toBe(5);
  });
});

describe("a left-turner holding the way open for a student who stands 100 m back on the opposite arm", () => {
  it("AT his line the bound releases nothing: he could be in the turner's path before it is out of it — a minute, and it has not moved", () => {
    const r = eastbound("left");
    student(r.env, REALLY_AT_HIS_LINE_X, OFFSET, 270, 0);
    expect(stepN(r, 12 * BOUND_STEPS)).toBe(0);
    expect(r.a.speed).toBe(0);
    // The clock ran the whole time — it is the question after it that says no.
    expect(r.env.timeSec - (r.a.playerYieldSinceSec as number)).toBeGreaterThan(11 * AMBIENT_YIELD_PATIENCE_SEC);
  });

  it("a staged car holding the box as well neither runs the clock nor resets it: when it has gone, the bound is already served", () => {
    // Round 3 reset the clock on every step a staged car held the box, so a staged car lapping through restarted
    // the bound for good (verifier R3-F4: 37.8 s at a line; 10.7 s with the clock left alone).
    const r = eastbound("left");
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    // A staged car crossing northbound, 20 m below the node at 8 m/s: it holds the box by itself.
    (r.env.staged as TrafficVehicleState[]).push({
      id: 1000,
      x: OFFSET,
      y: -20,
      dirX: 0,
      dirY: 1,
      speedMps: 8,
      braking: false,
      colorIndex: 0,
    });
    expect(stepN(r, BOUND_STEPS + 120)).toBe(0);
    expect(r.env.timeSec - (r.a.playerYieldSinceSec as number)).toBeGreaterThan(AMBIENT_YIELD_PATIENCE_SEC);
    (r.env.staged as TrafficVehicleState[]).length = 0;
    expect(stepN(r, 2)).toBeGreaterThan(0);
  });

  it("holds for the whole bound, to the step, and then goes", () => {
    const r = eastbound("left");
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    // The first step starts the clock; the bound is whole BOUND_STEPS steps later.
    expect(stepN(r, BOUND_STEPS)).toBe(0);
    expect(r.a.speed).toBe(0);
    expect(r.a.playerYieldSinceSec).not.toBeNull();
    expect(stepN(r, 2)).toBeGreaterThan(0);
    // …and it drives the turn: 15 s later it has left its lane (the box is 27 m deep and the turn is taken at 4 m/s).
    expect(stepN(r, 15 * 60)).toBe(Infinity);
  });

  it("with no student it never held at all, and with the student gone the clock is dead", () => {
    const free = eastbound("left");
    expect(stepN(free, 60)).toBeGreaterThan(0.5);
    expect(free.a.playerYieldSinceSec).toBeNull();

    const r = eastbound("left");
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    stepN(r, 60);
    expect(r.a.playerYieldSinceSec).not.toBeNull();
    r.env.hasPlayer = false;
    stepN(r, 1);
    expect(r.a.playerYieldSinceSec).toBeNull();
  });

  it("a red lamp does not run the clock: released after 10 s of red, the car still gives him the whole bound", () => {
    const r = eastbound("left");
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    r.lamp.phase = "red";
    expect(stepN(r, 600)).toBe(0);
    expect(r.a.playerYieldSinceSec).toBeNull();
    r.lamp.phase = "green";
    expect(stepN(r, BOUND_STEPS)).toBe(0);
    expect(stepN(r, 2)).toBeGreaterThan(0);
  });

  it("the clock dies when he moves: 4 s standing, one step moving, and the bound starts again", () => {
    const r = eastbound("left");
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    expect(stepN(r, 240)).toBe(0);
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 1);
    expect(stepN(r, 1)).toBe(0);
    expect(r.a.playerYieldSinceSec).toBeNull();
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    expect(stepN(r, BOUND_STEPS)).toBe(0);
    expect(stepN(r, 2)).toBeGreaterThan(0);
  });

  it("«standing» is the rule engine's full stop, 1 km/h: creeping at 0.29 m/s he is never treated as waiting; at 0.27 m/s he is", () => {
    const creeping = eastbound("left");
    student(creeping.env, AT_HIS_LINE_X, OFFSET, 270, 0.29);
    expect(stepN(creeping, 4 * BOUND_STEPS)).toBe(0);
    expect(creeping.a.playerYieldSinceSec).toBeNull();

    const still = eastbound("left");
    student(still.env, AT_HIS_LINE_X, OFFSET, 270, 0.27);
    expect(stepN(still, BOUND_STEPS)).toBe(0);
    expect(stepN(still, 2)).toBeGreaterThan(0);
  });

  it("IT NEVER ENTERS WHILE HE IS MOVING INTO ITS PATH: released, it has only pulled away when he sets off — it stops at its line again", () => {
    const r = eastbound("left");
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 0);
    stepN(r, BOUND_STEPS);
    // 0.4 s into its pull-away…
    expect(stepN(r, 24)).toBeGreaterThan(0);
    expect(r.a.speed).toBeGreaterThan(0.3);
    // …he sets off towards the junction at 2 m/s.
    student(r.env, AT_HIS_LINE_X, OFFSET, 270, 2);
    stepN(r, 300);
    expect(r.a.speed).toBe(0);
    expect(r.a.routePos).toBe(0);
    // Its nose is not over its line.
    expect(r.a.s).toBeLessThanOrEqual(r.lineS);
  });

  it("it never goes while his standing body is on its path through the box", () => {
    const r = eastbound("left");
    // The turn's own path: stand him on its middle.
    const ck = laneConnector(r.g, laneOf(r.g, "sx-n-w", "sx-n-c"), laneOf(r.g, "sx-n-c", "sx-n-n"));
    expect(ck.length).toBeGreaterThan(0);
    // The turn crosses his own (westbound) lane 5.5 m west of the node. Standing in that lane 2 m short of the node,
    // heading west, he is «standing in the junction» on the opposite approach (clause b of the yield) and 3.5 m from
    // the turn's path: the car could not pass him.
    const on = ck.py.findIndex((y) => y >= OFFSET);
    expect(on).toBeGreaterThan(0);
    const standX = -2;
    expect(Math.hypot(ck.px[on] - standX, ck.py[on] - OFFSET)).toBeLessThan(VEHICLE_LENGTH_M + 0.5);
    student(r.env, standX, OFFSET, 270, 0);
    expect(stepN(r, 6 * BOUND_STEPS)).toBe(0);
    expect(r.a.playerYieldSinceSec).toBeNull();
    // Clear of the clamp's separation but still in the box, 12 m short of the turn's path and heading for it: the
    // clock runs, and still nothing lets the car go — he could be in its path in two seconds (round 3 released it).
    const clear = eastbound("left");
    student(clear.env, ck.px[on] + 12, OFFSET, 270, 0);
    const pathClear = (() => {
      let min = Infinity;
      for (let i = 0; i < ck.px.length; i++) min = Math.min(min, Math.hypot(ck.px[i] - (ck.px[on] + 12), ck.py[i] - OFFSET));
      return min;
    })();
    expect(pathClear).toBeGreaterThan(VEHICLE_LENGTH_M + 0.5 + 1);
    expect(stepN(clear, 6 * BOUND_STEPS)).toBe(0);
    expect(clear.a.playerYieldSinceSec).not.toBeNull();
  });

  it("…nor while he stands just beyond the box on the lane it turns into, where it would stop with its tail inside", () => {
    const r = eastbound("left");
    const out = laneOf(r.g, "sx-n-c", "sx-n-n");
    const ck = laneConnector(r.g, laneOf(r.g, "sx-n-w", "sx-n-c"), out);
    // The U-turn rule does not reach a left turn and clause (b) needs him oncoming: use the U-turner for the exit lane.
    const u = eastbound("uturn");
    const wb = laneOf(u.g, "sx-n-c", "sx-n-w");
    const cu = laneConnector(u.g, laneOf(u.g, "sx-n-w", "sx-n-c"), wb);
    expect(cu.length).toBeGreaterThan(0);
    const last = cu.px.length - 1;
    // 7 m down the lane the U-turn joins, standing, heading west: clear of the turn itself, but inside the separation
    // of where the car's centre is when its TAIL has left the box (half a car length past the turn) + the path step.
    student(u.env, cu.px[last] - 7, cu.py[last], 270, 0);
    expect(stepN(u, 6 * BOUND_STEPS)).toBe(0);
    // 12 m down it there is room for a whole car behind him, and standing there heading away he is not coming
    // (round 5, D1/D2): it goes at once.
    const room = eastbound("uturn");
    student(room.env, cu.px[last] - 12, cu.py[last], 270, 0);
    expect(stepN(room, 2)).toBeGreaterThan(0);
    expect(ck.length).toBeGreaterThan(0);
  });
});

describe("a car about to turn round and a student at the junction (round 5: D1/D2 at every node, verifier R4-F5)", () => {
  it("standing at his own line on the cross street, off its path, he is not coming: it goes at once — no bound to serve", () => {
    const r = eastbound("uturn");
    student(r.env, OFFSET, -(r.R + STOP_LINE_BEYOND_CUT_M + 2), 0, 0);
    expect(stepN(r, 2)).toBeGreaterThan(0);
    expect(r.a.playerYieldSinceSec).toBeNull();
  });

  it("moving there, it waits at its line; the moment he stops, it goes", () => {
    const r = eastbound("uturn");
    student(r.env, OFFSET, -(r.R + STOP_LINE_BEYOND_CUT_M + 2), 0, 2);
    stepN(r, 300);
    expect(r.a.speed).toBe(0);
    expect(r.a.s).toBeLessThanOrEqual(r.lineS);
    student(r.env, OFFSET, -(r.R + STOP_LINE_BEYOND_CUT_M + 2), 0, 0);
    expect(stepN(r, 30)).toBeGreaterThan(0);
  });
});
