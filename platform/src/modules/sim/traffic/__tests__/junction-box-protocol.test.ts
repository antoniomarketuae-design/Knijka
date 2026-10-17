/**
 * sc-sig-controller-postures:5ee4301e, round 4 — THE JUNCTION-BOX PROTOCOL (`vehicles.ts`), rule by rule.
 *
 * Rounds 1–3 pinned one clause each (`owesOncomingPlayer`, `uTurnOwesPlayer`, `boxHeldByStaged`, `yieldWaived`) and
 * the round-3 verifier refuted the tree one grid step beside every pin: a turner that waited for a student «at his
 * line» started with one standing 3 m short of it; a student at rest was «more than 4 s away» at his present speed; a
 * turner released by the patience bound entered as he set off and froze in his lane; a staged car that had just
 * stopped for him was «standing for good». The protocol that replaces them is pinned here on one car driven through
 * `updateVehicle` on sx-v1 (the officer drills' junction), with nothing else in the world:
 *
 *   P3  the other vehicle is where it could be at the EARLIEST — the student's launch is his car's own, a staged car
 *       that has only just stopped will restart;
 *   P1  all yielding happens at the line, against the time the car needs to pass the stretch the other could reach;
 *       the taught 4 s is the margin, the patience bound lifts the margin and nothing else;
 *   P2  a car that has entered clears: across the other's bows it is refused only a step INTO that body, and it does
 *       not step across the bows of a staged car that could be there first.
 *
 * The patience clock itself is ambient-yield-patience.test.ts; who else holds a car at its line (the lamp's bearing,
 * the staged crossings, the yellow rule) is ambient-junction-yield.test.ts.
 *
 * ROUND 5 (integrator decision 2026-10-13, after the round-4 verifier's R4-F1/F3: the release was tied to a SIGNAL and
 * to a PLACE). What lets an ambient driver go is a fact read off the student's CAR:
 *   D1  WAITING — his left indicator on AND his car at rest (the rule engine's own full stop), wherever he stands: an
 *       opposing left-turner whose turn passes his is released, as in round 4;
 *   D2  COMING — the moment his car moves, whatever he signals: predicted along his heading, P1 and P3 as for a student
 *       who signals nothing;
 *   D3  THE WAITING POINT — a car released for a waiting student keeps deciding up to the last point of its path where
 *       its body is still clear of the lane he could drive straight on; it holds THERE if he has become coming, and past
 *       it it clears and does not brake for him;
 *   D4  inside the box a staged car is decided at that waiting point and, beyond it, only if it is MOVING and will be at
 *       the crossing first at the speed it has now.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { DIFFICULTY_PRESETS } from "../../vehicle/difficulty";
import { CHASSIS_MASS, ENGINE_FORCE_CURVE, engineForceAt } from "../../vehicle/tuning";
import { JUNCTION_TRIM_MAX_FRACTION, STOP_LINE_BEYOND_CUT_M } from "../../world/builders/network";
import { buildLaneGraph, laneConnector, sampleLane, type DirectedLane, type LaneGraph } from "../graph";
import type { TrafficRoute } from "../routes";
import { GUARD_AHEAD_M } from "../staged";
import {
  DEFAULT_TRAFFIC_CONFIG,
  VEHICLE_PROFILE_LENGTH_M,
  VEHICLE_PROFILE_WIDTH_M,
  type TrafficDistrict,
  type TrafficVehicleState,
} from "../types";
import type { SignalPhase } from "../../contracts";
import {
  AMBIENT_LEFT_TURN_GAP_SEC,
  AMBIENT_YIELD_PATIENCE_SEC,
  createVehicleAgent,
  earliestReachM,
  PLAYER_LAUNCH_ACCEL_MPS2,
  PLAYER_STANDING_MAX_MPS,
  STAGED_GUARD_AHEAD_M,
  stagedPathSepM,
  studentWaiting,
  WAITING_HOLD_STUDENT,
  waitingPointHoldFor,
  trackStagedRest,
  updateVehicle,
  VEHICLE_LENGTH_M,
  waitingPointArc,
  type VehicleAgent,
  type VehicleEnv,
} from "../vehicles";
import { makeVehicleEnv } from "./fixtures";
import { DEFAULT_RULE_CONFIG } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const districtOf = (id: string): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
const H = 1 / 60;
const CFG = DEFAULT_TRAFFIC_CONFIG;
const OFFSET = CFG.laneWidthM / 2;
const HALF = VEHICLE_LENGTH_M / 2;
/** The clamp separation between two cars: the summed half lengths + 0.5 m. */
const SEP = 2 * HALF + 0.5;
/** Half the body the fleet publishes for a car (4.1 m) — what a contact is judged on and what staged.ts clamps with. */
const BODY_HALF = VEHICLE_PROFILE_LENGTH_M.car / 2;
/** The ambient car's clamp separation against a staged car: its own following half length + the staged body's + 0.5 m. */
const STAGED_SEP = HALF + BODY_HALF + 0.5;
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
  eb: DirectedLane;
  out: DirectedLane;
  /** Arc of the car's centre when its nose is on its stop line. */
  lineS: number;
  /** The junction's drawn radius. */
  R: number;
  lamp: { of: (bearing: number) => SignalPhase };
}
/** One eastbound car on sx-v1's west arm standing at its line on green, bound `turn` at the junction. */
function eastbound(turn: "left" | "straight" | "uturn"): Rig {
  const d = districtOf("sx-v1");
  const g = graphOf(d);
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  const out = turn === "left" ? laneOf(g, "sx-n-c", "sx-n-n") : laneOf(g, "sx-n-c", "sx-n-e");
  const back = turn === "left" ? laneOf(g, "sx-n-n", "sx-n-c") : laneOf(g, "sx-n-e", "sx-n-c");
  const wb = laneOf(g, "sx-n-c", "sx-n-w");
  const lanes = turn === "uturn" ? [eb, wb] : [eb, out, back, wb];
  const R = g.junctionRadiusM.get("sx-n-c") as number;
  const lineS = eb.length - (R + STOP_LINE_BEYOND_CUT_M) - HALF;
  const agents: VehicleAgent[] = [];
  const env = makeVehicleEnv(g, d, agents);
  const lamp = { of: (_bearing: number): SignalPhase => "green" };
  env.ambientSignal = (_node, bearing) => lamp.of(bearing);
  const a = createVehicleAgent(0, routeOf(lanes), lineS - AT_LINE, 1, 0);
  agents.push(a);
  updateVehicle(a, 0, env);
  return { a, env, g, eb, out: turn === "uturn" ? wb : out, lineS, R, lamp };
}
function student(env: VehicleEnv, x: number, y: number, headingDeg: number, speedMps: number): void {
  env.hasPlayer = true;
  env.playerX = x;
  env.playerY = y;
  env.playerSpeedMps = speedMps;
  env.playerDirX = Math.sin((headingDeg * Math.PI) / 180);
  env.playerDirY = Math.cos((headingDeg * Math.PI) / 180);
}
function staged(x: number, y: number, headingDeg: number, speedMps: number): TrafficVehicleState {
  return {
    id: 1000,
    x,
    y,
    dirX: Math.sin((headingDeg * Math.PI) / 180),
    dirY: Math.cos((headingDeg * Math.PI) / 180),
    speedMps,
    braking: false,
    colorIndex: 0,
  };
}
/** Step the car for `sec` on the fixed grid, keeping the staged rest clock as the system does; arc advanced. */
function run(r: Rig, sec: number, clock = false): number {
  const s0 = r.a.s;
  const pos0 = r.a.routePos;
  for (let k = 0; k < Math.round(sec / H); k++) {
    r.env.timeSec += H;
    if (clock) trackStagedRest(r.env);
    updateVehicle(r.a, H, r.env);
  }
  return r.a.routePos === pos0 ? r.a.s - s0 : Infinity;
}
/** Put the car INSIDE the box: on its connector, where `at(pose)` first holds, doing `speed`. */
function onConnector(r: Rig, speed: number, at: (x: number, y: number) => boolean): void {
  const c = laneConnector(r.g, r.eb, r.out);
  for (let arc = 0; arc <= c.length; arc += 0.05) {
    r.a.s = c.exitS + arc;
    r.a.speed = speed;
    updateVehicle(r.a, 0, r.env);
    if (at(r.a.state.x, r.a.state.y)) return;
  }
  throw new Error("the connector never gets there");
}
const R_SX = 27.125; // sx-n-c's junction cut radius (asserted against the graph in the first E1 test's rig)
const THE_STUDENTS_LINE = 30; // his centre with his nose just behind his own line on the east arm (R + 0.6 = 27.7 m)

describe("P3 — the numbers are the product's own", () => {
  it("the student's launch is his car's tractive plateau over its mass, and no tier or staged actor pulls away harder", () => {
    expect(PLAYER_LAUNCH_ACCEL_MPS2).toBe(ENGINE_FORCE_CURVE[0][1] / CHASSIS_MASS);
    expect(PLAYER_LAUNCH_ACCEL_MPS2).toBeCloseTo(3.934, 3);
    // The plateau is the most the curve ever gives…
    for (let kmh = 0; kmh <= 200; kmh += 5) expect(engineForceAt(kmh)).toBeLessThanOrEqual(ENGINE_FORCE_CURVE[0][1]);
    // …no difficulty tier multiplies the throttle above 1…
    for (const p of Object.values(DIFFICULTY_PRESETS)) expect(p.throttleMul).toBeLessThanOrEqual(1);
    // …and no staged actor in the catalogue is authored to accelerate harder (staged.ts defaults to 2.6 m/s²).
    const authored = [...JSON.stringify(SCENARIO_TEMPLATES).matchAll(/"accelMps2":([0-9.]+)/g)].map((m) => Number(m[1]));
    for (const a of authored) expect(a).toBeLessThanOrEqual(PLAYER_LAUNCH_ACCEL_MPS2);
  });

  it("D1 — «at rest» is the rule engine's own full stop (DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh, 1 km/h)", () => {
    expect(PLAYER_STANDING_MAX_MPS).toBe(DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh / 3.6);
    expect(PLAYER_STANDING_MAX_MPS * 3.6).toBe(1);
  });

  it("a staged car's bows are at least as long as its own guard reads ahead", () => {
    expect(STAGED_GUARD_AHEAD_M).toBe(GUARD_AHEAD_M);
  });

  it("the earliest reach is a launch, never the present speed held: a car at rest is 31 m on in four seconds", () => {
    const a = PLAYER_LAUNCH_ACCEL_MPS2;
    expect(earliestReachM(0, 4, 50 / 3.6)).toBeCloseTo((50 / 3.6) ** 2 / (2 * a) + (50 / 3.6) * (4 - 50 / 3.6 / a), 9);
    expect(earliestReachM(0, 2, 50 / 3.6)).toBeCloseTo(0.5 * a * 4, 9);
    // Already faster than the limit: it holds what it has — never less than speed × time.
    expect(earliestReachM(20, 3, 50 / 3.6)).toBe(60);
    for (const v of [0, 3, 8, 13]) for (const t of [0.5, 2, 6]) expect(earliestReachM(v, t, 50 / 3.6)).toBeGreaterThanOrEqual(v * t);
    expect(earliestReachM(5, 0, 14)).toBe(0);
  });
});

describe("P1 with P3 — a left-turner and the student on the opposite arm", () => {
  it("the control: with nobody oncoming, a turner standing at its line on green pulls away", () => {
    expect(run(eastbound("left"), 3)).toBeGreaterThan(3);
  });

  it("never «only if he is at his line»: standing AT it, 3 m short of it and 6 m short of it, he is waited for — for a minute", () => {
    // Round 3: «at his line» ended a car length behind the line (32.6 m from the node); a student standing 3 m short
    // (the verifier's stop −34) was not waited for and both started on the same «proceed».
    for (const x of [THE_STUDENTS_LINE, THE_STUDENTS_LINE + 3, THE_STUDENTS_LINE + 6]) {
      const r = eastbound("left");
      student(r.env, x, OFFSET, 270, 0);
      expect(run(r, 60), `standing at x = ${x}`).toBe(0);
      expect(r.a.speed).toBe(0);
    }
  });

  it("never «his present speed held»: a student AT REST 60 m out could be in the turner's path before it is out of it — it waits", () => {
    // The turn takes the car 7.2 s to be 5.8 m clear of his lane; from rest 60 m out he could be at its path in
    // under 6 s (3.5 s to 50 km/h over 24.6 m, the rest at 13.9 m/s). Round 2/3: 0 m/s × 4 s = not coming.
    const r = eastbound("left");
    student(r.env, 60, OFFSET, 270, 0);
    expect(run(r, 60)).toBe(0);
  });

  it("the taught gap is the margin: from rest he is waited for out to 130 m, and not at 140 m", () => {
    const near = eastbound("left");
    student(near.env, 130, OFFSET, 270, 0);
    expect(run(near, 3)).toBe(0);
    const far = eastbound("left");
    student(far.env, 140, OFFSET, 270, 0);
    expect(run(far, 3)).toBeGreaterThan(3);
    // The margin is the product's taught 4 s on top of the car's own time: without it the line would sit ~55 m nearer.
    expect(earliestReachM(0, 7.2 + AMBIENT_LEFT_TURN_GAP_SEC, 50 / 3.6) - earliestReachM(0, 7.2, 50 / 3.6)).toBeCloseTo(
      (50 / 3.6) * AMBIENT_LEFT_TURN_GAP_SEC,
      6,
    );
  });

  it("moving: at 12 m/s he is waited for at 150 m and not at 180 m — he may speed up to the limit", () => {
    const near = eastbound("left");
    student(near.env, 150, OFFSET, 270, 12);
    expect(run(near, 3)).toBe(0);
    const far = eastbound("left");
    student(far.env, 180, OFFSET, 270, 12);
    expect(run(far, 3)).toBeGreaterThan(3);
  });

  it("«oncoming» is travelling AGAINST the approach, and a car going straight on or right owes him nothing", () => {
    const straight = eastbound("straight");
    student(straight.env, THE_STUDENTS_LINE, OFFSET, 270, 0);
    expect(run(straight, 3)).toBeGreaterThan(3);
    // Travelling the turner's own way beyond the junction (he has driven through): not oncoming.
    const sameWay = eastbound("left");
    student(sameWay.env, 60, -OFFSET, 90, 10);
    expect(run(sameWay, 3)).toBeGreaterThan(3);
  });

  it("his BODY on the way out holds the car whatever the clock says: 4.75 m beside the exit lane it waits, 4.85 m beside it it goes", () => {
    // The clamp refuses a step that closes inside 4.8 m of him: a car that would be stopped in the box against him
    // does not enter it; one that would pass him does.
    const held = eastbound("left");
    student(held.env, OFFSET + 4.75, held.R + 2, 90, 0);
    expect(run(held, 30)).toBe(0);
    const free = eastbound("left");
    student(free.env, OFFSET + 4.85, free.R + 2, 90, 0);
    expect(run(free, 3)).toBeGreaterThan(3);
    expect(SEP).toBe(4.8);
  });
});

describe("round 2's merge order, pinned here directly (its own kill went through a drill whose timing this round moved)", () => {
  it("a fleet car on the next lane SHORT of where this car joins it is behind it in the merge — not its leader", () => {
    const mid = (): Rig => {
      const r = eastbound("left");
      // Well into the turn: 12 m north of the node line, nearer the join than the other car is.
      onConnector(r, 6, (_x, y) => y >= 12);
      return r;
    };
    const control = mid();
    const free = run(control, 0.5);
    const r = mid();
    // Another ambient car on the northbound exit lane, 2 m past the node — 25 m short of the cut this car joins at.
    const back = laneOf(r.g, "sx-n-n", "sx-n-c");
    const other = createVehicleAgent(1, routeOf([r.out, back]), 2, 1, 0);
    other.speed = 5;
    r.env.agents.push(other);
    updateVehicle(other, 0, r.env);
    expect(laneConnector(r.g, r.eb, r.out).entryS).toBeGreaterThan(20);
    expect(run(r, 0.5)).toBeCloseTo(free, 3);
  });
});

describe("P1 — where no signal settles who goes first, only a car turning ROUND is held for the student, and only while he MOVES", () => {
  it("jxg-giveway-v1 (no lamps): a left-turner is not held for a student 20 m up the opposite arm — priority there is his to work out and the rule engine's to grade; a car turning round is, while he rolls (round 5: standing, he is not coming)", () => {
    const d = districtOf("jxg-giveway-v1");
    const g = graphOf(d);
    // The first unsignalised junction end with a left turn and an opposite arm.
    let pick: { lk: DirectedLane; nk: DirectedLane; opp: DirectedLane } | null = null;
    for (const lk of g.lanes) {
      if (pick || lk.endSignalNodeId !== null || lk.endYieldDegree < 3 || lk.reverse < 0) continue;
      const opp = g.lanes.find((l) => l.toNode === lk.toNode && l.endDirX * lk.endDirX + l.endDirY * lk.endDirY < -0.9 && l.length > 60);
      const nk = g.lanes.find((l) => {
        if (l.fromNode !== lk.toNode || l.index === lk.reverse) return false;
        const cos = lk.endDirX * l.startDirX + lk.endDirY * l.startDirY;
        return cos < 0.57 && cos >= -0.17 && lk.endDirX * l.startDirY - lk.endDirY * l.startDirX > 0;
      });
      if (opp && nk && lk.length > 60) pick = { lk, nk, opp };
    }
    expect(pick).not.toBeNull();
    const { lk, nk, opp } = pick!;
    const R = g.junctionRadiusM.get(lk.toNode) as number;
    const off = Math.max(6.5, Math.min(R, lk.length * JUNCTION_TRIM_MAX_FRACTION) + STOP_LINE_BEYOND_CUT_M);
    const drive = (next: DirectedLane, withStudent: boolean, studentMps = 0): number => {
      const agents: VehicleAgent[] = [];
      const env = makeVehicleEnv(g, d, agents);
      const a = createVehicleAgent(0, routeOf([lk, next]), 0, 1, 0);
      a.s = lk.length - off - HALF - AT_LINE;
      agents.push(a);
      updateVehicle(a, 0, env);
      if (withStudent) {
        const p = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
        sampleLane(opp, opp.length - 20, 0, p);
        env.hasPlayer = true;
        env.playerX = p.x;
        env.playerY = p.y;
        env.playerSpeedMps = studentMps;
        env.playerDirX = opp.endDirX;
        env.playerDirY = opp.endDirY;
      }
      const s0 = a.s;
      for (let k = 0; k < 4 * 60; k++) {
        env.timeSec += H;
        updateVehicle(a, H, env);
      }
      return a.routePos === 0 ? a.s - s0 : Infinity;
    };
    expect(drive(nk, false)).toBeGreaterThan(2);
    expect(drive(nk, true)).toBeGreaterThan(2);
    const round = g.lanes[lk.reverse];
    expect(drive(round, false)).toBeGreaterThan(1);
    expect(drive(nk, true, 3)).toBeGreaterThan(2);
    expect(drive(round, true, 3)).toBe(0);
    // Standing 20 m up the opposite arm, off its path, he is not coming (round 5, R4-F5): the car turns round.
    expect(drive(round, true, 0)).toBeGreaterThan(1);
  });
});

describe("P1 — the car's own time is its own run, and a run it cannot make is not counted on", () => {
  it("with one of the fleet standing on its way out it will not be clear in any time: a student who could EVER come holds it — 200 m off, at rest", () => {
    const free = eastbound("left");
    student(free.env, 200, OFFSET, 270, 0);
    expect(run(free, 3)).toBeGreaterThan(3);

    const r = eastbound("left");
    student(r.env, 200, OFFSET, 270, 0);
    // Another ambient car standing on the northbound exit lane just inside the box.
    const out = laneOf(r.g, "sx-n-c", "sx-n-n");
    const other = createVehicleAgent(1, routeOf([out, laneOf(r.g, "sx-n-n", "sx-n-c")]), r.R - 4, 1, 0);
    r.env.agents.push(other);
    updateVehicle(other, 0, r.env);
    other.speed = 0;
    expect(run(r, 20)).toBe(0);
  });
});

describe("the traffic system keeps the staged rest clock the protocol reads", () => {
  it("system.ts calls trackStagedRest before each of its two fleet loops", () => {
    const src = readFileSync(path.resolve(HERE, "../system.ts"), "utf-8");
    const calls = [...src.matchAll(/trackStagedRest\(vEnv\);\n\s+for \(let (\w) = 0; \1 < this\.vehicleAgents\.length; \1\+\+\) \{\n\s+updateVehicle\(/g)];
    expect(calls).toHaveLength(2);
    expect(src.match(/updateVehicle\(this\.vehicleAgents/g)).toHaveLength(2);
  });
});

describe("P3 — what he says he will do: the left indicator", () => {
  it("signalling LEFT at his line he is not waited for by an opposing left-turner; signalling right, or nothing, he is", () => {
    for (const [ind, goes] of [
      ["left", true],
      ["right", false],
      ["off", false],
    ] as const) {
      const r = eastbound("left");
      student(r.env, THE_STUDENTS_LINE, OFFSET, 270, 0);
      r.env.playerIndicator = ind;
      if (goes) expect(run(r, 3), ind).toBeGreaterThan(3);
      else expect(run(r, 20), ind).toBe(0);
    }
  });

  it("…because the two opposing left turns pass each other here: the fleet's own connectors are 14 m apart on sx-v1", () => {
    const r = eastbound("left");
    const mine = laneConnector(r.g, r.eb, r.out);
    const his = laneConnector(r.g, laneOf(r.g, "sx-n-e", "sx-n-c"), laneOf(r.g, "sx-n-c", "sx-n-s"));
    let min = Infinity;
    for (let i = 0; i < mine.px.length; i++) {
      for (let j = 0; j < his.px.length; j++) min = Math.min(min, Math.hypot(mine.px[i] - his.px[j], mine.py[i] - his.py[j]));
    }
    expect(min).toBeGreaterThan(SEP + 2);
    expect(min).toBeGreaterThan(13);
    expect(min).toBeLessThan(16);
  });

  it("D1 — WAITING is his car at rest, not a place: at rest signalling left 5, 9 and 15 m inside the drawn junction he is not waited for", () => {
    // Round 4 waited for him once he was inside the drawn radius «wherever he said he was going» — the verifier's
    // boxwait instrument: the head of the oncoming queue stood its whole green in 42 of 80 cells (R4-F3).
    for (const inside of [5, 9, 15]) {
      const r = eastbound("left");
      student(r.env, r.R - inside, OFFSET, 270, 0);
      r.env.playerIndicator = "left";
      expect(run(r, 3), `${inside} m inside`).toBeGreaterThan(3);
    }
  });

  it("D2 — COMING the moment his car moves, whatever he signals: rolling there at 4 m/s signalling left he is waited for", () => {
    const r = eastbound("left");
    student(r.env, r.R - 5, OFFSET, 270, 4);
    r.env.playerIndicator = "left";
    expect(run(r, 2)).toBe(0);
  });

  it("E1 — the line between waiting and coming is whether he can still give way: nose 0.125 m behind his line at 1.1 km/h he can still stop short of it (he waits); at 6 km/h he cannot (he comes)", () => {
    const line = THE_STUDENTS_LINE;
    const waits = eastbound("left");
    expect(waits.R).toBeCloseTo(R_SX, 6);
    expect(line - (R_SX + STOP_LINE_BEYOND_CUT_M) - HALF).toBeCloseTo(0.125, 6);
    student(waits.env, line, OFFSET, 270, 1.1 / 3.6);
    waits.env.playerIndicator = "left";
    expect(run(waits, 3)).toBeGreaterThan(3);
    const comes = eastbound("left");
    student(comes.env, line, OFFSET, 270, 6 / 3.6);
    comes.env.playerIndicator = "left";
    expect(run(comes, 10)).toBe(0);
  });

  it("E1/D1 — PAST his line only his car at rest says he waits — the product's standing threshold (1 km/h): 5 m inside at 0.9 km/h signalling left he waits, at 1.1 km/h he comes", () => {
    const waits = eastbound("left");
    student(waits.env, waits.R - 5, OFFSET, 270, 0.9 / 3.6);
    waits.env.playerIndicator = "left";
    expect(run(waits, 3)).toBeGreaterThan(3);
    const comes = eastbound("left");
    student(comes.env, comes.R - 5, OFFSET, 270, 1.1 / 3.6);
    comes.env.playerIndicator = "left";
    expect(run(comes, 10)).toBe(0);
  });

  it("E1 — «can still stop short» is the fleet's own comfortable deceleration (DEFAULT_TRAFFIC_CONFIG.comfortDecelMps2, 2.2 m/s²): at 11 m/s signalling left, 0.5 m more than that stop from his line he waits, 0.5 m less he comes; signalling nothing he comes from both", () => {
    expect(CFG.comfortDecelMps2).toBe(2.2);
    const need = (11 * 11) / (2 * CFG.comfortDecelMps2); // 27.5 m
    const line = R_SX + STOP_LINE_BEYOND_CUT_M + HALF; // his centre with his nose on his line
    for (const [extra, ind, goes] of [
      [0.5, "left", true],
      [-0.5, "left", false],
      [0.5, "off", false],
      [-0.5, "off", false],
    ] as const) {
      const r = eastbound("left");
      student(r.env, line + need + extra, OFFSET, 270, 11);
      r.env.playerIndicator = ind;
      if (goes) expect(run(r, 3), `${extra} ${ind}`).toBeGreaterThan(3);
      else expect(run(r, 10), `${extra} ${ind}`).toBe(0);
    }
  });

  it("E1 — the indicator still never moves the prediction onto the turn: 60 m out at 12 km/h signalling left he can stop and waits (both go); at 50 km/h 50 m out he cannot, is predicted straight on — the left-turner waits, a car going straight does not", () => {
    for (const turn of ["left", "straight"] as const) {
      const r = eastbound(turn);
      student(r.env, 60, OFFSET, 270, 12 / 3.6);
      r.env.playerIndicator = "left";
      expect(run(r, 3), turn).toBeGreaterThan(3);
    }
    const turner = eastbound("left");
    student(turner.env, 50, OFFSET, 270, 50 / 3.6);
    turner.env.playerIndicator = "left";
    expect(run(turner, 3)).toBe(0);
    const straight = eastbound("straight");
    student(straight.env, 50, OFFSET, 270, 50 / 3.6);
    straight.env.playerIndicator = "left";
    expect(run(straight, 3)).toBeGreaterThan(3);
  });

  it("E1 — one predicate: studentWaiting is read at the line (the release, also for a car in the box while he moves) and first of all by studentLeavesRoom (a student at rest, wherever he stands), and nowhere reads the indicator for a release without it", () => {
    const src = readFileSync(path.resolve(HERE, "../vehicles.ts"), "utf-8");
    expect(src.match(/studentWaiting\(env, lk\)/g)).toHaveLength(2);
    // Round 9 (E13): inside the box the one predicate that decides about a student AT REST is studentLeavesRoom, and it
    // is the in-box clause's whole answer — E1 first, his room second. Round 7's «at rest is waiting again, whatever he
    // signals» release is gone, and so is round 8's «past his line nothing he signals counts».
    expect(src).toContain("if (inBox && atRest) return !studentLeavesRoom(env, lk, n, toCutM);");
    expect(src.match(/studentLeavesRoom\(/g)).toHaveLength(2); // its definition and that one call
    const body = src.slice(src.indexOf("export function studentLeavesRoom("));
    expect(body.slice(0, body.indexOf("\n}")).split("\n")[1].trim()).toBe("if (studentWaiting(env, lk)) return true;");
    expect(src).not.toMatch(/if \(inBox && \(atRest \|\| studentWaiting\(env, lk\)\)\) return false;/);
    expect(src.match(/playerIndicator === "left"/g) ?? []).toHaveLength(0);
    expect(src.match(/playerIndicator !== "left"/g)).toHaveLength(1);
  });

  it("…and only where the two turns really pass each other: at a junction whose opposing left turns CROSS, a left signal releases nothing", () => {
    // The first such movement of the catalogue, found from the geometry (12 exist — the census below).
    let found: { d: TrafficDistrict; g: LaneGraph; lk: DirectedLane; nk: DirectedLane; opp: DirectedLane } | null = null;
    for (const f of readdirSync(WORLD).filter((x) => x.endsWith(".json")).sort()) {
      if (found) break;
      const d = districtOf(f.replace(/\.json$/, ""));
      if (!Array.isArray((d as { intersections?: unknown }).intersections)) continue;
      const g = graphOf(d);
      for (const lk of g.lanes) {
        if (found || lk.endSignalNodeId === null) continue;
        for (const nk of g.lanes) {
          if (nk.fromNode !== lk.toNode || nk.index === lk.reverse) continue;
          const cos = lk.endDirX * nk.startDirX + lk.endDirY * nk.startDirY;
          if (!(cos < 0.57 && cos >= -0.17 && lk.endDirX * nk.startDirY - lk.endDirY * nk.startDirX > 0)) continue;
          const opp = g.lanes.filter((l) => l.toNode === lk.toNode && l.endDirX * lk.endDirX + l.endDirY * lk.endDirY < -0.7)[0];
          if (!opp) continue;
          const exit = g.lanes.filter((l) => {
            if (l.fromNode !== lk.toNode || l.index === opp.reverse) return false;
            const c = opp.endDirX * l.startDirX + opp.endDirY * l.startDirY;
            return c < 0.57 && c >= -0.17 && opp.endDirX * l.startDirY - opp.endDirY * l.startDirX > 0;
          })[0];
          if (!exit) continue;
          const a = laneConnector(g, lk, nk);
          const b = laneConnector(g, opp, exit);
          if (a.length === 0 || b.length === 0) continue;
          let min = Infinity;
          for (let i = 0; i < a.px.length; i++) {
            for (let j = 0; j < b.px.length; j++) min = Math.min(min, Math.hypot(a.px[i] - b.px[j], a.py[i] - b.py[j]));
          }
          if (min < SEP + 2) {
            found = { d, g, lk, nk, opp };
            break;
          }
        }
      }
    }
    expect(found).not.toBeNull();
    const { d, g, lk, nk, opp } = found!;
    const R = g.junctionRadiusM.get(lk.toNode) as number;
    const offOf = (l: DirectedLane): number =>
      Math.max(CFG.signalStopOffsetM, Math.min(R, l.length * JUNCTION_TRIM_MAX_FRACTION) + STOP_LINE_BEYOND_CUT_M);
    const drive = (indicator: "left" | "off" | null): number => {
      const agents: VehicleAgent[] = [];
      const env = makeVehicleEnv(g, d, agents);
      env.ambientSignal = () => "green";
      const a = createVehicleAgent(0, routeOf([lk, nk]), 0, 1, 0);
      a.s = lk.length - offOf(lk) - HALF - AT_LINE;
      agents.push(a);
      updateVehicle(a, 0, env);
      if (indicator !== null) {
        // Fifteen metres short of his own line on the opposite arm, at rest: clear of the turn itself (so it is
        // where he could BE, not where he is, that holds the car).
        const p = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
        sampleLane(opp, opp.length - offOf(opp) - HALF - 15, 0, p);
        const turn = laneConnector(g, lk, nk);
        let clearOfTheTurn = Infinity;
        for (let i = 0; i < turn.px.length; i++) clearOfTheTurn = Math.min(clearOfTheTurn, Math.hypot(turn.px[i] - p.x, turn.py[i] - p.y));
        expect(clearOfTheTurn).toBeGreaterThan(SEP + 1);
        env.hasPlayer = true;
        env.playerX = p.x;
        env.playerY = p.y;
        env.playerSpeedMps = 0;
        env.playerDirX = opp.endDirX;
        env.playerDirY = opp.endDirY;
        env.playerIndicator = indicator;
      }
      const s0 = a.s;
      for (let k = 0; k < 10 * 60; k++) {
        env.timeSec += H;
        updateVehicle(a, H, env);
      }
      return a.routePos === 0 ? a.s - s0 : Infinity;
    };
    expect(drive(null)).toBeGreaterThan(3);
    expect(drive("off")).toBe(0);
    expect(drive("left")).toBe(0);
  }, 120_000);

  it("a car turning ROUND is not released by it: it ends in the very lane he is driving", () => {
    const r = eastbound("uturn");
    student(r.env, THE_STUDENTS_LINE, OFFSET, 270, 0);
    r.env.playerIndicator = "left";
    expect(run(r, 20)).toBe(0);
  });

  it("the catalogue: at every signalised left turn the answer is the geometry's — 44 movements where the two lefts pass each other, 12 where they cross and he is still waited for", () => {
    // Read from outside: for every signalised lane end with a proper left turn and an opposing left turn, the two
    // connectors' least distance. The protocol releases on the indicator only where that is ≥ the clamp separation
    // + the 2 m step both are read at; the count of movements on each side is pinned so a re-cut junction shows.
    let clear = 0;
    let crossing = 0;
    for (const f of readdirSync(WORLD).filter((x) => x.endsWith(".json")).sort()) {
      const d = districtOf(f.replace(/\.json$/, ""));
      if (!Array.isArray((d as { intersections?: unknown }).intersections)) continue;
      const g = graphOf(d);
      for (const lk of g.lanes) {
        if (lk.endSignalNodeId === null) continue;
        for (const nk of g.lanes) {
          if (nk.fromNode !== lk.toNode || nk.index === lk.reverse) continue;
          const cos = lk.endDirX * nk.startDirX + lk.endDirY * nk.startDirY;
          const cross = lk.endDirX * nk.startDirY - lk.endDirY * nk.startDirX;
          if (!(cos < 0.57 && cos >= -0.17 && cross > 0)) continue;
          const opp = g.lanes
            .filter((l) => l.toNode === lk.toNode && l.endDirX * lk.endDirX + l.endDirY * lk.endDirY < -0.7)
            .sort((p, q) => p.endDirX * lk.endDirX + p.endDirY * lk.endDirY - (q.endDirX * lk.endDirX + q.endDirY * lk.endDirY))[0];
          if (!opp) continue;
          const exit = g.lanes
            .filter((l) => {
              if (l.fromNode !== lk.toNode || l.index === opp.reverse) return false;
              const c = opp.endDirX * l.startDirX + opp.endDirY * l.startDirY;
              return c < 0.57 && c >= -0.17 && opp.endDirX * l.startDirY - opp.endDirY * l.startDirX > 0;
            })
            .sort((p, q) => opp.endDirX * q.startDirY - opp.endDirY * q.startDirX - (opp.endDirX * p.startDirY - opp.endDirY * p.startDirX))[0];
          if (!exit) continue;
          const a = laneConnector(g, lk, nk);
          const b = laneConnector(g, opp, exit);
          if (a.length === 0 || b.length === 0) continue;
          let min = Infinity;
          for (let i = 0; i < a.px.length; i++) {
            for (let j = 0; j < b.px.length; j++) min = Math.min(min, Math.hypot(a.px[i] - b.px[j], a.py[i] - b.py[j]));
          }
          if (min >= SEP + 2) clear++;
          else crossing++;
        }
      }
    }
    expect({ clear, crossing }).toEqual(OPPOSING_LEFTS_IN_THE_CATALOGUE);
  }, 120_000);
});
/** Measured on the committed districts, 2026-10-13. */
const OPPOSING_LEFTS_IN_THE_CATALOGUE = { clear: 44, crossing: 12 };

describe("P1 — the student on a CROSSING arm", () => {
  const ewGreen = (bearing: number): SignalPhase => (bearing === 90 || bearing === 270 ? "green" : "red");

  it("standing at his red line he is not coming — his signal does not let him — and the cross street drives", () => {
    const r = eastbound("straight");
    r.lamp.of = ewGreen;
    student(r.env, OFFSET, -(r.R + STOP_LINE_BEYOND_CUT_M + HALF + 0.5), 0, 0);
    expect(run(r, 3)).toBeGreaterThan(3);
  });

  it("already past his line and crossing, he is finishing: the car on its fresh green waits until he is through", () => {
    const r = eastbound("straight");
    r.lamp.of = ewGreen;
    // Northbound, 20 m below the node (7 m past his line), 6 m/s: he will cross the eastbound lane.
    student(r.env, OFFSET, -20, 0, 6);
    expect(run(r, 2)).toBe(0);
    // …through and 10 m beyond the eastbound lane, still heading north: nothing of the car's path is ahead of him.
    student(r.env, OFFSET, 12, 0, 6);
    expect(run(r, 3)).toBeGreaterThan(3);
  });

  it("short of his line but no longer able to stop before it, he is coming too; able to stop, he is not", () => {
    const cannot = eastbound("straight");
    cannot.lamp.of = ewGreen;
    const line = cannot.R + STOP_LINE_BEYOND_CUT_M + HALF; // his centre with his nose on the line
    // 13 m/s needs 13² / (2 × 5.5) = 15.4 m: 10 m short of the line he cannot stop.
    student(cannot.env, OFFSET, -(line + 10), 0, 13);
    expect((13 * 13) / (2 * CFG.hardDecelMps2)).toBeGreaterThan(10);
    expect(run(cannot, 1)).toBe(0);
    const can = eastbound("straight");
    can.lamp.of = ewGreen;
    // 17 m short he can (15.4 m) — measured from the junction's NODE, not from the eastbound lane's end 4 m south of it.
    student(can.env, OFFSET, -(line + 17), 0, 13);
    expect(run(can, 1)).toBeGreaterThan(0);
  });

  it("STANDING with his nose a hand's breadth over his line he is still waiting, not finishing — the cross street drives", () => {
    // The committed sc-signal-redyellow demo stops 0.4 m over its line; read as «past his line», it held the whole
    // cross street at its own green for the 20 s of it (round-4 measurement).
    const r = eastbound("straight");
    r.lamp.of = ewGreen;
    student(r.env, OFFSET, -(r.R + STOP_LINE_BEYOND_CUT_M + HALF - 0.4), 0, 0);
    expect(run(r, 3)).toBeGreaterThan(3);
  });

  it("STANDING inside the drawn junction he is in the box: the car at its line does not enter towards him", () => {
    const r = eastbound("straight");
    r.lamp.of = ewGreen;
    // On the northbound lane 15 m below the node, at rest, 11 m short of the eastbound lane.
    student(r.env, OFFSET, -15, 0, 0);
    expect(run(r, 4)).toBe(0);
  });

  it("where the lamps carry no phase of their own (his reads what the car's reads) nothing new is asked: priority there is graded", () => {
    const r = eastbound("straight");
    student(r.env, OFFSET, -20, 0, 6);
    expect(run(r, 2)).toBeGreaterThan(0);
  });
});

describe("P1 with P3 — a staged vehicle is predicted by what it can do next", () => {
  it("one that has JUST stopped — its guard, for the student — will restart: the turner waits out the bound, then reads it as standing", () => {
    // Oncoming on the east arm, 60 m beyond the node, at rest. Round 3 read 0 km/h as «standing for good» at once
    // and released the turner into the box that car then re-entered (verifier R3-F2).
    const r = eastbound("left");
    (r.env.staged as TrafficVehicleState[]).push(staged(60, OFFSET, 270, 0));
    expect(run(r, AMBIENT_YIELD_PATIENCE_SEC - 0.1, true)).toBe(0);
    expect(run(r, 1, true)).toBeGreaterThan(0);
  });

  it("…and the clock is its REST: it rolls for a moment after 4 s and the bound starts again", () => {
    const r = eastbound("left");
    const st = staged(60, OFFSET, 270, 0);
    (r.env.staged as TrafficVehicleState[]).push(st);
    expect(run(r, 4, true)).toBe(0);
    st.speedMps = 1;
    run(r, 0.1, true);
    st.speedMps = 0;
    expect(run(r, AMBIENT_YIELD_PATIENCE_SEC - 0.2, true)).toBe(0);
    expect(run(r, 1, true)).toBeGreaterThan(0);
  });

  it("standing for good ON the way out it holds the car for as long as it stands there", () => {
    const r = eastbound("left");
    (r.env.staged as TrafficVehicleState[]).push(staged(OFFSET, r.R + 3, 0, 0));
    expect(run(r, 20, true)).toBe(0);
  });

  it("held by its OWN red on the crossing arm it is not predicted across the box; one that can no longer stop for it is", () => {
    const ewGreen = (bearing: number): SignalPhase => (bearing === 90 || bearing === 270 ? "green" : "red");
    const stops = eastbound("straight");
    stops.lamp.of = ewGreen;
    // Northbound 60 m below the node at 10 m/s: 30 m short of its line, 9.1 m to stop.
    (stops.env.staged as TrafficVehicleState[]).push(staged(OFFSET, -60, 0, 10));
    expect(run(stops, 3, true)).toBeGreaterThan(3);
    const runs = eastbound("straight");
    runs.lamp.of = ewGreen;
    // 35 m below the node: 5 m short of its line at 10 m/s — a red-light runner.
    (runs.env.staged as TrafficVehicleState[]).push(staged(OFFSET, -35, 0, 10));
    expect(run(runs, 1, true)).toBe(0);
  });

  it("moving the car's OWN way just ahead of it in the box it is its leader — the corridor terms' business — not a reason to stand at the line", () => {
    const r = eastbound("straight");
    // 12 m past the car's line, in its lane, doing 6 m/s eastbound: inside the clamp separation of the path's first metres.
    (r.env.staged as TrafficVehicleState[]).push(staged(r.a.state.x + AT_LINE + HALF + 12, -OFFSET, 90, 6));
    expect(run(r, 3, true)).toBeGreaterThan(0.5);
  });

  it("coming AT the car along its own exit lane — a staged car against the flow — it is not something a line can wait out", () => {
    const r = eastbound("straight");
    (r.env.staged as TrafficVehicleState[]).push(staged(70, -OFFSET, 270, 5));
    expect(run(r, 2, true)).toBeGreaterThan(1);
  });
});

describe("P2 — a car that has entered clears: the clamps are directional", () => {
  /** How far the car's body reaches east of its centre at the heading it has, m. */
  const reachAlongX = (r: Rig): number =>
    BODY_HALF * Math.abs(r.a.state.dirX) + (VEHICLE_PROFILE_WIDTH_M.car / 2) * Math.abs(r.a.state.dirY);
  /** The left-turner on its connector with its centre on the westbound lane's line — in the oncoming student's lane. */
  function inHisLane(speed: number): Rig {
    const r = eastbound("left");
    onConnector(r, speed, (_x, y) => y >= OFFSET);
    return r;
  }

  it("ACROSS THE BOWS of a student it will be out of the way of before he arrives, it does not brake for him: it drives on out of his lane", () => {
    // In his lane, crossing it at 6 m/s; he is 9 m off on that lane, coming at 3 m/s: it is out in under a second,
    // he is there in a second and a half. Before round 4 he was «a body ahead» in its heading corridor and it braked
    // at 5.5 m/s² — in his lane.
    const control = inHisLane(6);
    const free = run(control, 0.5);
    const r = inHisLane(6);
    student(r.env, r.a.state.x + 9, OFFSET, 270, 3);
    expect(run(r, 0.5)).toBeCloseTo(free, 6);
    expect(r.a.speed).toBeGreaterThan(5);
  });

  it("…and NOT across the bows of one who would be at it first: 4.5 m off and closing at 8 m/s, the clamp holds it as it always did", () => {
    // «Further through» is read in time. Its nose on his line with him a car length away is not further through —
    // it is in his way (the round-4 search, sc-signal-dead L5: exempted by position alone, a car from his left drove
    // on in front of him).
    const r = inHisLane(6);
    student(r.env, r.a.state.x + 4.5, OFFSET, 270, 8);
    expect(run(r, H)).toBe(0);
    expect(r.a.speed).toBe(0);
  });

  it("…and never INTO him: across the bows of a student who is barely rolling, the step that would put the two bodies into each other is refused", () => {
    // He rolls at 0.31 m/s; the car, on his line ahead of him, is heading 140° off his course — towards him — at
    // 12 m/s. It will be off his line long before he gets anywhere (so nothing else holds it), and its next step
    // would leave 5 cm of air between the two bodies.
    const place = (airM: number): Rig => {
      const r = inHisLane(12);
      const hA = (Math.atan2(r.a.state.dirX, r.a.state.dirY) * 180) / Math.PI;
      const hP = hA + 140;
      const pdx = Math.sin((hP * Math.PI) / 180);
      const pdy = Math.cos((hP * Math.PI) / 180);
      const c = Math.abs(r.a.state.dirX * pdx + r.a.state.dirY * pdy);
      const cross = r.a.state.dirX * pdy - r.a.state.dirY * pdx;
      const s = Math.abs(cross);
      const wid = VEHICLE_PROFILE_WIDTH_M.car / 2;
      const along = BODY_HALF + BODY_HALF * c + wid * s + airM;
      const lat = 0;
      // The car is `along` ahead of him on his course and `lat` to its side: rx·pdy − ry·pdx = lat.
      student(r.env, r.a.state.x - pdx * along - pdy * lat, r.a.state.y - pdy * along + pdx * lat, hP, 0.31);
      return r;
    };
    const room = place(0.6);
    expect(run(room, H)).toBeGreaterThan(0.15);
    const none = place(0.2);
    expect(run(none, H)).toBe(0);
    expect(none.a.speed).toBe(0);
  });

  it("a MOVING student behind its own centre is following it out of the box, not ahead of it: it does not brake for him", () => {
    // The car has turned in ahead of him and is 1.5 m «ahead» of his bonnet by its own heading — inside the 2 m of
    // slop the open-road test allows a body beside it. Braking there is braking into him (the delay sweep, phone-L1+8).
    const control = inHisLane(6);
    const free = run(control, 0.5);
    const r = inHisLane(6);
    // 1.5 m behind the car's centre along its heading and 3 m to its side, going the car's own way at 5 m/s.
    const hx = r.a.state.dirX;
    const hy = r.a.state.dirY;
    student(r.env, r.a.state.x - hx * 1.5 + hy * 3, r.a.state.y - hy * 1.5 - hx * 3, (Math.atan2(hx, hy) * 180) / Math.PI, 5);
    expect(run(r, 0.5)).toBeCloseTo(free, 6);
    // …standing there he is a body beside it, as on the open road: the old test, the old braking.
    const still = inHisLane(6);
    student(still.env, still.a.state.x - hx * 1.5 + hy * 3, still.a.state.y - hy * 1.5 - hx * 3, (Math.atan2(hx, hy) * 180) / Math.PI, 0);
    expect(run(still, 0.5)).toBeLessThan(free - 0.05);
  });

  it("a student who STANDS in its way is a body in its path, as he always was: it stops for him", () => {
    const r = inHisLane(6);
    student(r.env, r.a.state.x + reachAlongX(r) + BODY_HALF + 0.25, OFFSET, 270, 0);
    expect(run(r, H)).toBe(0);
  });

  it("driving ALONG his line and not across it — head-on, or as his leader — it is not «across his bows»: the old clamp stands", () => {
    // An eastbound car going STRAIGHT through, the student coming at it in its own lane (the wrong way), 4.5 m off.
    const r = eastbound("straight");
    r.a.s = r.eb.length - 10;
    r.a.speed = 6;
    updateVehicle(r.a, 0, r.env);
    student(r.env, r.a.state.x + 4.5, r.a.state.y, 270, 8);
    expect(run(r, H)).toBe(0);
    expect(r.a.speed).toBe(0);
  });

  it("NOT YET ACROSS a staged car's bows, it does not step onto the line of one that will be there first at the speed it has NOW", () => {
    // Round 5 (D4): the one in-box wait left, bounded by construction — the staged car is moving and close.
    // 4.85 m short of the westbound lane's line, doing 6 m/s; the staged car oncoming on that lane, 20 m east, 10 m/s.
    const r = eastbound("left");
    onConnector(r, 6, (_x, y) => y >= OFFSET - 4.85);
    const here = r.a.state.x;
    (r.env.staged as TrafficVehicleState[]).push(staged(here + 20, OFFSET, 270, 10));
    expect(run(r, 0.5, true)).toBeLessThan(0.5);
    expect(r.a.speed).toBe(0);
    // It rests OUTSIDE everything that car's own guards read: a clamp separation off its line of travel.
    expect(OFFSET - r.a.state.y).toBeGreaterThanOrEqual(STAGED_SEP - 1e-6);
    // (staged.ts 3b holds for an ambient body inside 2.05 + 2.05 + 0.5 = 4.6 m of its next pose; 2b inside 3.0 m of its line.)
    expect(STAGED_SEP).toBeGreaterThan(2 * BODY_HALF + 0.5);
  });

  it("…but crosses ahead of one that cannot reach it, of one AT REST — just stopped by its guard or standing for good — and of one that could be first only by speeding up", () => {
    const start = (): Rig => {
      const r = eastbound("left");
      onConnector(r, 6, (_x, y) => y >= OFFSET - 4.85);
      return r;
    };
    const far = start();
    (far.env.staged as TrafficVehicleState[]).push(staged(far.a.state.x + 70, OFFSET, 270, 10));
    expect(run(far, 0.5, true)).toBeGreaterThan(2.5);

    // Round 4 held the car here until a stopped staged car had stood for the bound (it «could» restart): on the
    // committed sc-turn-left-oncoming mistake-cut-gap demo that stood ambient car 3 in the box 6.1 / 6.4 s (R4-F2).
    const justStopped = start();
    (justStopped.env.staged as TrafficVehicleState[]).push(staged(justStopped.a.state.x + 20, OFFSET, 270, 0));
    expect(run(justStopped, 0.5, true)).toBeGreaterThan(2.5);
    const standing = start();
    (standing.env.staged as TrafficVehicleState[]).push(staged(standing.a.state.x + 20, OFFSET, 270, 0));
    standing.env.timeSec = 100;
    trackStagedRest(standing.env);
    standing.env.timeSec = 100 + AMBIENT_YIELD_PATIENCE_SEC;
    expect(run(standing, 0.5, true)).toBeGreaterThan(2.5);

    // 30 m east at 5 m/s: at that speed it is 7 m on when the car is off its line; pulling away at full launch it
    // could be there (round 4's earliest reach held the car for it).
    const slow = start();
    (slow.env.staged as TrafficVehicleState[]).push(staged(slow.a.state.x + 30, OFFSET, 270, 5));
    expect(run(slow, 0.5, true)).toBeGreaterThan(2.5);
  });

  it("across his line at a SHALLOW angle — nearly head-on — he is a body in its path, however far off: it brakes for him as it always did", () => {
    // 20° off his course, on his line, he 12 m off and coming at 3 m/s: the car would be off his line first, and
    // still it is not «crossing» it (turnSpeedCap's 0.9) — he is ahead of it in its own heading corridor.
    const control = inHisLane(6);
    const free = run(control, 0.5);
    const r = inHisLane(6);
    const hA = (Math.atan2(r.a.state.dirX, r.a.state.dirY) * 180) / Math.PI;
    const hP = hA + 160;
    const pdx = Math.sin((hP * Math.PI) / 180);
    const pdy = Math.cos((hP * Math.PI) / 180);
    student(r.env, r.a.state.x - pdx * 12, r.a.state.y - pdy * 12, hP, 3);
    expect(run(r, 0.5)).toBeLessThan(free - 0.05);
  });

  it("ACROSS a staged car's bows it is the one further through: that car's clamp separation no longer holds it, only its body does", () => {
    // In the westbound lane, the staged car 4.5 m east of it and held (0 m/s, as its own guard would hold it).
    const r = inHisLane(4);
    expect(Math.abs(r.a.state.dirX)).toBeLessThan(0.9); // crossing that lane, not driving along it
    (r.env.staged as TrafficVehicleState[]).push(staged(r.a.state.x + reachAlongX(r) + BODY_HALF + 0.25, OFFSET, 270, 0));
    expect(Math.abs(r.env.staged[0].x - r.a.state.x)).toBeLessThan(STAGED_SEP);
    expect(run(r, H, true)).toBeGreaterThan(0.05);
    const into = inHisLane(4);
    (into.env.staged as TrafficVehicleState[]).push(staged(into.a.state.x + reachAlongX(into) + BODY_HALF + 0.05, OFFSET, 270, 0));
    expect(run(into, H, true)).toBe(0);
  });
});

describe("D3 — the waiting point: a car released for a WAITING student keeps deciding up to the last point short of his lane", () => {
  const WID = VEHICLE_PROFILE_WIDTH_M.car / 2;
  /** How far the car's body reaches north (towards the westbound lane he drives) of its centre at the heading it has. */
  const reachNorth = (r: Rig): number => BODY_HALF * Math.abs(r.a.state.dirY) + WID * Math.abs(r.a.state.dirX);
  /** The eastbound left-turner released by a student WAITING at his line (at rest, signalling left), driven until its centre is `intoM` m into its connector. */
  function released(intoM: number): Rig {
    const r = eastbound("left");
    student(r.env, THE_STUDENTS_LINE, OFFSET, 270, 0);
    r.env.playerIndicator = "left";
    const c = laneConnector(r.g, r.eb, r.out);
    for (let k = 0; k < 60 * 30 && r.a.routePos === 0 && r.a.s < c.exitS + intoM; k++) {
      r.env.timeSec += H;
      updateVehicle(r.a, H, r.env);
    }
    expect(r.a.releasedNode).toBe("sx-n-c");
    return r;
  }

  it("it is read off the built geometry: on sx-v1 every left turn has one 12.25 m into its 49 m connector — 15 m past its stop line — with the body clear of the opposite lane there and in it a step later", () => {
    const d = districtOf("sx-v1");
    const g = graphOf(d);
    for (const [a, b, c] of [
      ["sx-n-w", "sx-n-c", "sx-n-n"],
      ["sx-n-n", "sx-n-c", "sx-n-e"],
      ["sx-n-e", "sx-n-c", "sx-n-s"],
      ["sx-n-s", "sx-n-c", "sx-n-w"],
    ]) {
      const lk = laneOf(g, a, b);
      const nk = laneOf(g, b, c);
      const ck = laneConnector(g, lk, nk);
      const w = waitingPointArc(g, CFG, lk, nk);
      expect(w, `${a}>${c}`).toBeCloseTo(12.25, 6);
      // The opposite lane (the one he drives straight on), carried through the junction.
      const opp = g.lanes.find((l) => l.toNode === "sx-n-c" && l.endDirX * lk.endDirX + l.endDirY * lk.endDirY < -0.7)!;
      const e = opp.px.length - 1;
      const reachInto = (arc: number): number => {
        const p = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
        sampleLane(ck, arc, 0, p);
        const nx = -opp.endDirY;
        const ny = opp.endDirX;
        const lat = Math.abs((p.x - opp.px[e]) * nx + (p.y - opp.py[e]) * ny);
        const extent = BODY_HALF * Math.abs(p.dirX * nx + p.dirY * ny) + WID * Math.abs(-p.dirY * nx + p.dirX * ny);
        return CFG.laneWidthM / 2 + extent - lat; // > 0: some of the body is in his lane
      };
      expect(reachInto(w)).toBeLessThan(0);
      expect(reachInto(w + 0.25)).toBeGreaterThan(0);
      // 15 m past its stop point: the line is R + 0.6 from the node and the car stands its half length behind it.
      const stopS = lk.length - (g.junctionRadiusM.get("sx-n-c")! + STOP_LINE_BEYOND_CUT_M) - HALF;
      expect(ck.exitS + w - stopS).toBeCloseTo(15, 6);
    }
    // A right turn never comes into his lane (nothing to hold short of); a straight run has no connector.
    expect(waitingPointArc(g, CFG, laneOf(g, "sx-n-w", "sx-n-c"), laneOf(g, "sx-n-c", "sx-n-s"))).toBe(Infinity);
    expect(waitingPointArc(g, CFG, laneOf(g, "sx-n-w", "sx-n-c"), laneOf(g, "sx-n-c", "sx-n-e"))).toBeNaN();
  });

  it("released, then he SETS OFF while it can still stop short of his lane: it holds there — its body clear of his lane — and goes again once he is past", () => {
    const r = released(1);
    const ck = laneConnector(r.g, r.eb, r.out);
    const w = waitingPointArc(r.g, CFG, r.eb, r.out);
    student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
    run(r, 10);
    expect(r.a.speed).toBeLessThan(0.3);
    expect(r.a.routePos).toBe(0);
    expect(r.a.s).toBeLessThanOrEqual(ck.exitS + w + 1e-9);
    expect(r.a.s).toBeGreaterThan(ck.exitS); // inside the box, past its line
    expect(r.a.state.y + reachNorth(r)).toBeLessThan(0);
    // Round 7 (E6): the hold says whom it is for — the student — read-only, for the instruments.
    expect(waitingPointHoldFor(r.a.state)).toEqual([WAITING_HOLD_STUDENT]);
    // He has driven through: 20 m west of the node, heading on west.
    student(r.env, -20, OFFSET, 270, 6);
    expect(run(r, 2)).toBeGreaterThan(0.5);
    // …and once it is not held at its waiting point, it is held for nobody.
    expect(waitingPointHoldFor(r.a.state)).toBeNull();
  });

  /**
   * ROUND 9 (E13, amending round 8's E9). Round 7 read a student who stopped in the junction as «waiting again, whatever
   * he signals» and released the held car; with his indicator cancelled he set off straight and was struck (R7-F1).
   * Round 8 read him there by his room whatever he signalled; the held car then stood at its waiting point — in its own
   * approach lane — and the straight stream a left-turning student waits for stalled behind it (R8-F1). Now: signalling
   * LEFT at rest he is WAITING by E1 and read exactly as at his line — the car goes; signalling nothing or right (or
   * having cancelled) he is read by his room, and the car stays at its waiting point for as long as he stands.
   */
  it("E13 — held there, a student who STOPS IN THE JUNCTION signalling LEFT is waiting, as at his line: the car goes; signalling nothing or right it stays at its waiting point, held for him, for as long as he stands", () => {
    for (const x of [THE_STUDENTS_LINE - 3, 14, 4]) {
      const r = released(1);
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
      run(r, 10);
      expect(r.a.speed).toBeLessThan(0.3);
      expect(waitingPointHoldFor(r.a.state)).toEqual([WAITING_HOLD_STUDENT]);
      student(r.env, x, OFFSET, 270, 0);
      r.env.playerIndicator = "left";
      expect(run(r, 3), "left at x=" + x).toBeGreaterThan(0.5);
    }
    for (const ind of ["off", "right"] as const) {
      for (const x of [THE_STUDENTS_LINE - 3, 14, 4]) {
        const r = released(1);
        const ck = laneConnector(r.g, r.eb, r.out);
        const w = waitingPointArc(r.g, CFG, r.eb, r.out);
        student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
        run(r, 10);
        expect(r.a.speed).toBeLessThan(0.3);
        student(r.env, x, OFFSET, 270, 0);
        r.env.playerIndicator = ind;
        expect(run(r, 20), ind + " at x=" + x).toBeLessThan(0.05);
        expect(r.a.s).toBeLessThanOrEqual(ck.exitS + w + 1e-9);
        expect(waitingPointHoldFor(r.a.state), ind + " at x=" + x).toEqual([WAITING_HOLD_STUDENT]);
        // He sets off straight on and drives through: it goes once he is past.
        student(r.env, -20, OFFSET, 270, 6);
        expect(run(r, 2), ind + " at x=" + x).toBeGreaterThan(0.5);
      }
    }
  });

  it("E9 — at or short of his own line E1 stands: standing there signalling left he is WAITING and the held car goes; signalling nothing it goes because from there he could not reach its path before it has cleared it at the fleet's gentle acceleration", () => {
    for (const ind of ["left", "off"] as const) {
      const r = released(1);
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
      run(r, 10);
      expect(r.a.speed).toBeLessThan(0.3);
      // His nose just behind his line.
      student(r.env, THE_STUDENTS_LINE, OFFSET, 270, 0);
      r.env.playerIndicator = ind;
      expect(run(r, 3), ind).toBeGreaterThan(0.5);
    }
  });

  it("E9 — the room is read at the fleet's own «Gentle acceleration» (DEFAULT_TRAFFIC_CONFIG.accelMps2, 1.8 m/s²), not at his car's launch: standing with his nose 2 m past his line, whatever he signals, the held car goes (from there at 1.8 m/s² he cannot reach its path before it has cleared it); 3 m past it it stays", () => {
    expect(CFG.accelMps2).toBe(1.8);
    expect(PLAYER_LAUNCH_ACCEL_MPS2).toBeGreaterThan(2 * CFG.accelMps2);
    // Round-8 scan on this rig: the car held at its waiting point has room at 1.8 m/s² from a student standing at
    // x ≥ 28 (his nose about 2 m past his line) and none from x ≤ 27; read at his 3.93 m/s² launch it would have none.
    for (const ind of ["left", "off", "right"] as const) {
      const r = released(1);
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
      run(r, 10);
      expect(r.a.speed).toBeLessThan(0.3);
      student(r.env, THE_STUDENTS_LINE - 2, OFFSET, 270, 0);
      r.env.playerIndicator = ind;
      expect(run(r, 3), ind).toBeGreaterThan(0.5);
    }
    const src = readFileSync(path.resolve(HERE, "../vehicles.ts"), "utf-8");
    expect(src).toContain("gentleReachM(env.playerSpeedMps, sec, nodeLimitMps(env.graph, lk.toNode), env.cfg.accelMps2)");
  });

  it("…a student who sets off 60 m beyond his line could not reach its path before it has cleared it — inside the box the taught margin is not added: it does not stop", () => {
    // With the 4 s margin he would be «coming» from there (the line test holds a car for him out to 130 m from rest).
    const r = released(1);
    student(r.env, 60, OFFSET, 270, 2);
    run(r, 2);
    expect(r.a.speed).toBeGreaterThan(1);
  });

  it("PAST its waiting point it clears and does not brake for him: in his lane with him 4.5 m off and closing at 8 m/s it drives on (a car never let in for a waiting student is held by the clamp, as before)", () => {
    const control = eastbound("left");
    onConnector(control, 6, (_x, y) => y >= OFFSET);
    const free = run(control, H);
    const r = eastbound("left");
    onConnector(r, 6, (_x, y) => y >= OFFSET);
    r.a.releasedNode = "sx-n-c";
    student(r.env, r.a.state.x + 4.5, OFFSET, 270, 8);
    expect(run(r, H)).toBeCloseTo(free, 9);
    expect(r.a.speed).toBeGreaterThan(5);
    const held = eastbound("left");
    onConnector(held, 6, (_x, y) => y >= OFFSET);
    student(held.env, held.a.state.x + 4.5, OFFSET, 270, 8);
    expect(run(held, H)).toBe(0);
  });

  it("…and where it can no longer stop short of his lane it is past it: 1 m before its waiting point at 6 m/s (3.3 m to stop) it does not stop for a student who sets off", () => {
    const r = released(1);
    const ck = laneConnector(r.g, r.eb, r.out);
    const w = waitingPointArc(r.g, CFG, r.eb, r.out);
    r.a.s = ck.exitS + w - 1;
    r.a.speed = 6;
    updateVehicle(r.a, 0, r.env);
    expect((6 * 6) / (2 * CFG.hardDecelMps2)).toBeGreaterThan(1);
    student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
    run(r, 0.5);
    expect(r.a.speed).toBeGreaterThan(5);
  });

  it("D4 — at its waiting point ANY car that has one decides about a staged car: one MOVING on the lane ahead that will be there first at its present speed holds it there, short of that lane — one 60 m off does not", () => {
    // Not released (no student): the waiting point is the one place after the line a staged car is decided (D4).
    const r = eastbound("left");
    const ck = laneConnector(r.g, r.eb, r.out);
    const w = waitingPointArc(r.g, CFG, r.eb, r.out);
    onConnector(r, 4, (x) => x >= -27);
    expect(r.a.releasedNode).toBeNull();
    // Oncoming on the westbound lane, 30 m east of the node at 10 m/s: at the speed it has it is at the crossing before
    // the car is off it (inside the box a staged car is waited for at its PRESENT speed — the round-5 bound).
    (r.env.staged as TrafficVehicleState[]).push(staged(30, OFFSET, 270, 10));
    run(r, 10, true);
    expect(r.a.speed).toBeLessThan(0.3);
    expect(r.a.s).toBeGreaterThan(ck.exitS);
    expect(r.a.s).toBeLessThanOrEqual(ck.exitS + w + 1e-9);
    expect(r.a.state.y + reachNorth(r)).toBeLessThan(0);
    // Round 8 (E11, verifier VR7_STAGED_AS_STUDENT): the hold says it is for that staged car, not for the student.
    expect(waitingPointHoldFor(r.a.state)).toEqual([1000]);
    // 60 m off at 10 m/s it could be there only by speeding up (round 4's earliest reach): not waited for in the box.
    const far = eastbound("left");
    onConnector(far, 4, (x) => x >= -27);
    (far.env.staged as TrafficVehicleState[]).push(staged(60, OFFSET, 270, 10));
    run(far, 3, true);
    expect(far.a.speed).toBeGreaterThan(1);
  });

  /**
   * ROUND 8 (E9 for a staged car) — the staged hold follows the student's rule and P3: a staged car STANDING in the
   * junction that has not yet stood for the patience bound will restart, and is read by its room at the fleet's gentle
   * acceleration — the car at its waiting point waits for it; once it has stood for the bound it is a standing body
   * (only its body on the rest of the path holds the car), and one standing outside the junction is that from the start.
   */
  it("E9/P3 — a staged car standing IN the junction, just stopped, holds a car at its waiting point by its room; once it has stood for the patience bound — or standing outside the junction — it does not", () => {
    const r = eastbound("left");
    onConnector(r, 2, (x) => x >= -20);
    (r.env.staged as TrafficVehicleState[]).push(staged(10, OFFSET, 270, 0));
    run(r, 3, true);
    expect(r.a.speed).toBeLessThan(0.3);
    expect(waitingPointHoldFor(r.a.state)).toEqual([1000]);
    // It has now stood for the bound (P3: standing for good) — only its body could hold the car, and it is 10 m off.
    run(r, AMBIENT_YIELD_PATIENCE_SEC, true);
    expect(run(r, 3, true)).toBeGreaterThan(0.5);
    const out = eastbound("left");
    onConnector(out, 2, (x) => x >= -20);
    (out.env.staged as TrafficVehicleState[]).push(staged(35, OFFSET, 270, 0));
    expect(run(out, 3, true)).toBeGreaterThan(0.5);
  });

  /**
   * ROUND 8 (E11, verifier VR7_STAGED_SEP_SMALL) — a staged car's restart distance is the clamp separation of the two
   * bodies (the fleet car's half length + the staged body's + 0.5 m) + half the 2 m step the path is read at: 5.7 m for a
   * car. A staged car driving south 5.4 m east of the exit lane's line, 70 m up at 10 m/s, comes within it of the rest of
   * the path and is there first: the car holds at its waiting point for it. 6.0 m east of that line it never comes
   * within it: the car is not held for it.
   */
  it("E11 — a staged car's restart distance is the clamp separation of the two bodies + half a path step (5.7 m): held for one passing 5.4 m beside the rest of its path, not for one passing 6.0 m beside it", () => {
    expect(stagedPathSepM("car")).toBeCloseTo(HALF + BODY_HALF + 0.5 + 2 / 2, 9);
    expect(stagedPathSepM("car")).toBeCloseTo(5.7, 9);
    const exitX = laneOf(graphOf(districtOf("sx-v1")), "sx-n-c", "sx-n-n").px[0];
    const atW = (dx: number): Rig => {
      const r = eastbound("left");
      onConnector(r, 2, (x) => x >= -20);
      (r.env.staged as TrafficVehicleState[]).push(staged(exitX + dx, 70, 180, 10));
      run(r, 3.2, true);
      return r;
    };
    const near = atW(5.4);
    expect(near.a.speed).toBeLessThan(0.3);
    expect(waitingPointHoldFor(near.a.state)).toEqual([1000]);
    const wide = atW(6.0);
    expect(wide.a.speed).toBeGreaterThan(1);
  });

  /**
   * ROUND 7 (E8, verifier R6-C2 O3) — «committed» is the fleet's HARD braking (DEFAULT_TRAFFIC_CONFIG.hardDecelMps2), the
   * figure the D3 hold itself is asked at: a released car that can still stop short of its waiting point at hard braking
   * is NOT past it, and the ordinary clamps still apply to it — it keeps the clamp separation (two car halves + 0.5 m)
   * from a student standing ahead of it. Only one that can no longer stop short is past it and is refused just a step
   * INTO him. At 6 m/s hard braking needs 3.27 m and comfortable braking 8.18 m; 4.50 m before its waiting point a
   * reading by comfortable braking calls it committed and drives it past him at 4.39 m (the verifier's O3, measured).
   */
  it("E8/O3 — past its waiting point means unable to stop short of it at the fleet's HARD braking, not its comfortable braking", () => {
    expect(CFG.hardDecelMps2).toBe(5.5);
    const v0 = 6;
    const hardStop = (v0 * v0) / (2 * CFG.hardDecelMps2);
    const comfortStop = (v0 * v0) / (2 * CFG.comfortDecelMps2);
    const drive = (dW: number): { moved: number; minD: number } => {
      const r = eastbound("left");
      const ck = laneConnector(r.g, r.eb, r.out);
      const w = waitingPointArc(r.g, CFG, r.eb, r.out);
      // Standing on the eastbound line 10 m west of the node — ahead of the car, which is turning off it to the north.
      student(r.env, -10, -OFFSET, 90, 0);
      r.env.playerIndicator = "off";
      r.a.releasedNode = "sx-n-c";
      r.a.s = ck.exitS + w - dW;
      r.a.speed = v0;
      updateVehicle(r.a, 0, r.env);
      const s0 = r.a.s;
      let minD = Infinity;
      for (let k = 0; k < 240; k++) {
        r.env.timeSec += H;
        updateVehicle(r.a, H, r.env);
        minD = Math.min(minD, Math.hypot(r.a.state.x + 10, r.a.state.y + OFFSET));
      }
      return { moved: r.a.s - s0, minD };
    };
    // 4.50 m before it: stoppable at hard braking, not at comfortable — not past it: the clamp keeps it off him.
    const held = drive(hardStop + 0.25 * (comfortStop - hardStop));
    expect(held.minD).toBeGreaterThanOrEqual(SEP);
    expect(held.moved).toBeLessThan(10);
    // Inside the hard-braking distance it IS past it: it clears (only a step into his body would be refused).
    expect(drive(hardStop - 0.3).moved).toBeGreaterThan(20);
  });

  /** ROUND 7 (E8, verifier R6-C2 O4) — WAITING is a student on the OPPOSITE arm: travelling against this car's approach. */
  it("E8/O4 — only a student travelling AGAINST the car's approach can be waiting for it: at rest signalling left on a crossing arm or behind it, he is not", () => {
    const r = eastbound("left");
    r.env.playerIndicator = "left";
    // The opposite arm (westbound, 270°), at rest: waiting.
    student(r.env, THE_STUDENTS_LINE, OFFSET, 270, 0);
    expect(studentWaiting(r.env, r.eb)).toBe(true);
    // A crossing arm (northbound 0°, southbound 180°) and this car's own way (eastbound 90°), at rest: not waiting.
    for (const [x, y, h] of [[OFFSET, -THE_STUDENTS_LINE, 0], [-OFFSET, THE_STUDENTS_LINE, 180], [-THE_STUDENTS_LINE - 10, -OFFSET, 90]] as const) {
      student(r.env, x, y, h, 0);
      expect(studentWaiting(r.env, r.eb), `heading ${h}`).toBe(false);
    }
    // …nor 45° off the opposite heading (dot −0.71 is the edge: −0.7).
    student(r.env, THE_STUDENTS_LINE, OFFSET, 270 - 46, 0);
    expect(studentWaiting(r.env, r.eb)).toBe(false);
  });

  /**
   * ROUND 7 (E8, verifier R6-C2 O6) — inside the box the taught margin is NOT added. The round-6 test above did not pin it:
   * its student, 60 m out at 2 m/s signalling left, could still stop short of his line, so he was WAITING and nothing was
   * asked of him at all. Here he signals nothing — COMING — from 60 m east of the node at 2 m/s: without the margin he
   * cannot reach the car's path before it has cleared it and the car drives past its waiting point; with the 4 s margin
   * he could, and it would stand at its waiting point.
   */
  it("E8/O6 — a COMING student who could reach its path only with the taught margin added does not stop a released car in the box", () => {
    const r = released(1);
    const ck = laneConnector(r.g, r.eb, r.out);
    const w = waitingPointArc(r.g, CFG, r.eb, r.out);
    student(r.env, 60, OFFSET, 270, 2);
    r.env.playerIndicator = "off";
    expect(earliestReachM(2, AMBIENT_LEFT_TURN_GAP_SEC, 50 / 3.6)).toBeGreaterThan(0);
    run(r, 6);
    // Past its waiting point (or already off the connector), not standing at it.
    expect(r.a.routePos > 0 || r.a.s > ck.exitS + w).toBe(true);
    expect(r.a.speed).toBeGreaterThan(1);
  });

  /**
   * ROUND 9 (E16, verifier R8-C3 VR8_ROOM_SPEED0). The room is read from his PRESENT speed: a student «at rest» by the
   * product's standing threshold (1 km/h) may still be creeping, and creeping he gets further in the car's time than
   * from a standstill. The scan finds the nearest stand (in 0.1 m steps along his lane) at which a car held at its
   * waiting point has room from a student at a dead stop — and there the same student creeping at 0.27 m/s (just under
   * the threshold, still «at rest», signalling nothing) leaves it none.
   */
  it("E16 — the room is read from his present speed: where a student at a dead stop leaves the car room, the same student creeping at 0.27 m/s (still «at rest») does not", () => {
    const creep = 0.27;
    expect(creep).toBeLessThan(PLAYER_STANDING_MAX_MPS);
    const goes = (x: number, v: number): boolean => {
      const r = released(1);
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
      run(r, 10);
      expect(r.a.speed).toBeLessThan(0.3);
      student(r.env, x, OFFSET, 270, v);
      r.env.playerIndicator = "off";
      return run(r, 1) > 0.05;
    };
    let x0 = NaN;
    for (let x = 24; x <= THE_STUDENTS_LINE; x = +(x + 0.1).toFixed(1)) {
      if (goes(x, 0)) {
        x0 = x;
        break;
      }
    }
    expect(x0).toBeGreaterThan(24);
    expect(x0).toBeLessThan(THE_STUDENTS_LINE - 0.5); // past his line: the room test, not E1 at his line
    expect(goes(x0, creep), "x0=" + x0).toBe(false);
    // …and a little further back the creeping student leaves it room too (the reach is a little longer, not unbounded).
    expect(goes(x0 + 2, creep)).toBe(true);
  });

  /**
   * ROUND 9 (E16, verifier R8-C3 VR8_ROOM_INF_GOES). A run the car cannot make as sampled — one of the fleet standing on
   * the rest of its path — has no time to pass his line in, so it leaves no room: the car stays at its waiting point
   * (clear of his lane) rather than drive up behind that car and stop in his lane.
   */
  it("E16 — a car whose way out is blocked by a standing fleet car has no room to go: it stays at its waiting point for a student standing in the junction, where with its way out free it would go", () => {
    const at = (blocked: boolean): number => {
      const r = released(1);
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
      run(r, 10);
      expect(r.a.speed).toBeLessThan(0.3);
      // He stands 1 m past his line signalling nothing: from there, with its way out free, it has room (E13 room test).
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 0);
      r.env.playerIndicator = "off";
      if (blocked) {
        const out = laneOf(r.g, "sx-n-c", "sx-n-n");
        const other = createVehicleAgent(1, routeOf([out, laneOf(r.g, "sx-n-n", "sx-n-c")]), r.R - 4, 1, 0);
        r.env.agents.push(other);
        updateVehicle(other, 0, r.env);
        other.speed = 0;
      }
      return run(r, 3);
    };
    expect(at(false)).toBeGreaterThan(0.5);
    expect(at(true)).toBeLessThan(0.05);
  });

  /**
   * ROUND 9 (E13/E16, verifier R8-C3 VR8_INBOX_ATREST_ONLY). The in-box clause asks only about a student AT REST; a
   * student still MOVING who is WAITING by E1 (slowing to his line, able to stop short of it at the comfortable
   * deceleration, signalling left) is read below exactly as at the line — he releases the car. Signalling nothing at the
   * same place and speed he is coming, and it stays at its waiting point.
   */
  it("E13 — a MOVING student who can still stop short of his line signalling left releases a car held at its waiting point, as at his line; signalling nothing he is coming and it stays", () => {
    for (const ind of ["left", "off"] as const) {
      const r = released(1);
      student(r.env, THE_STUDENTS_LINE - 1, OFFSET, 270, 6);
      run(r, 10);
      expect(r.a.speed).toBeLessThan(0.3);
      student(r.env, THE_STUDENTS_LINE + 10, OFFSET, 270, 4);
      r.env.playerIndicator = ind;
      expect(studentWaiting(r.env, r.eb), ind).toBe(ind === "left");
      const moved = run(r, 2);
      if (ind === "left") expect(moved, ind).toBeGreaterThan(0.5);
      else expect(moved, ind).toBeLessThan(0.05);
    }
  });

  /**
   * ROUND 9 (E16, verifier R8-C3 VR8_STAGED_ROOM_BRISK). A staged car standing in the junction (short of the patience
   * bound) is read by its room at the fleet's gentle acceleration (cfg.accelMps2, 1.8 m/s²), not at the student's
   * launch: one standing on the westbound lane 26 m east of the node leaves the car at its waiting point room — read
   * at 3.93 m/s² it would not (the r9 staged-room probe: 94 of 4,424 poses differ) — and one 20 m east does not.
   */
  it("E16 — a staged car standing in the junction is read by its room at the fleet's gentle acceleration: 26 m east on the westbound lane it leaves room, 20 m east it does not", () => {
    const atW = (x: number): Rig => {
      const r = eastbound("left");
      const ck = laneConnector(r.g, r.eb, r.out);
      const w = waitingPointArc(r.g, CFG, r.eb, r.out);
      r.a.s = ck.exitS + w - 0.01;
      r.a.speed = 0;
      r.a.releasedNode = "sx-n-c";
      updateVehicle(r.a, 0, r.env);
      expect(Math.hypot(x, OFFSET)).toBeLessThan(r.R);
      (r.env.staged as TrafficVehicleState[]).push(staged(x, OFFSET, 270, 0));
      return r;
    };
    const far = atW(26);
    expect(run(far, 2, true)).toBeGreaterThan(0.05);
    const near = atW(20);
    expect(run(near, 2, true)).toBeLessThan(0.05);
    expect(waitingPointHoldFor(near.a.state)).toEqual([1000]);
  });
});
