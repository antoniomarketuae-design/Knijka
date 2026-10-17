/**
 * sc-sig-controller-postures:5ee4301e, round 2 — WHO AN AMBIENT CAR WAITS FOR AT ITS LINE, each clause on its own.
 *
 * Round 1's verifier ran eight mutants; five survived the round-1 tests (its condition F8). Three of them are
 * clauses of the left-turner's yield to the oncoming student (round 4: `vehicles.ts studentHoldsBox`, the
 * junction-box protocol — the rounds 1–3 clause `owesOncomingPlayer` is gone), one is the bearing
 * the car asks its signal with (`laneEndSignal`). Each is pinned here on one car driven through `updateVehicle`,
 * with nothing else in the world:
 *
 *   V3  the approach bearing is the lane's END direction — a lane that bends reads the lamp it arrives at;
 *   V6  a turner that can no longer stop before its line completes the turn (it is not slammed into the box);
 *   V7  the gap it leaves a MOVING oncoming student is the taught 4 s, at the point of use;
 *   V8  «oncoming» means travelling AGAINST this approach — a student on the cross street is not owed the turn.
 *
 * And round 2's own rule (now the staged half of `boxGate`) — «a vehicle that has entered a junction box must clear
 * it»: the car
 * waits AT ITS LINE while a staged vehicle stands on its path through the box or will cross it before the car is
 * out; a staged vehicle going its way does not hold it; a car that can no longer stop is not held.
 *
 * And the car about to turn round (now `studentHoldsBox`): it waits at its line while the student is at the
 * junction or less than the taught 4 s from it — whoever turns round gives way to everybody.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../runtime";
import { axisOfBearing } from "../../runtime/geometry";
import { STOP_LINE_BEYOND_CUT_M } from "../../world/builders/network";
import { buildLaneGraph, laneConnector, type DirectedLane, type LaneGraph } from "../graph";
import type { TrafficRoute } from "../routes";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict, type TrafficVehicleState } from "../types";
import { createVehicleAgent, updateVehicle, VEHICLE_LENGTH_M, type VehicleAgent, type VehicleEnv } from "../vehicles";
import { makeVehicleEnv } from "./fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const sx = (): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, "sx-v1.json"), "utf-8"));
const H = 1 / 60;
const CFG = DEFAULT_TRAFFIC_CONFIG;
const OFFSET = CFG.laneWidthM / 2;

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
  /** Arc of the car's centre when its nose is on its stop line. */
  lineS: number;
  /** The junction's drawn radius. */
  R: number;
}
/** One eastbound car on sx-v1's west arm, on a green lamp, bound `turn` at the junction. */
function eastbound(turn: "left" | "straight" | "uturn", standoffM: number, speed: number): Rig {
  const d = sx();
  const g = graphOf(d);
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  const out = turn === "left" ? laneOf(g, "sx-n-c", "sx-n-n") : laneOf(g, "sx-n-c", "sx-n-e");
  const back = turn === "left" ? laneOf(g, "sx-n-n", "sx-n-c") : laneOf(g, "sx-n-e", "sx-n-c");
  const wb = laneOf(g, "sx-n-c", "sx-n-w");
  // A U-turn at the junction: straight back up the arm it came down (and round again at the arm's dead end).
  const lanes = turn === "uturn" ? [eb, wb] : [eb, out, back, wb];
  const R = g.junctionRadiusM.get("sx-n-c") as number;
  const lineS = eb.length - (R + STOP_LINE_BEYOND_CUT_M) - VEHICLE_LENGTH_M / 2;
  const agents: VehicleAgent[] = [];
  const env = makeVehicleEnv(g, d, agents);
  env.ambientSignal = () => "green";
  const a = createVehicleAgent(0, routeOf(lanes), lineS - standoffM, 1, 0);
  a.speed = speed;
  agents.push(a);
  updateVehicle(a, 0, env);
  return { a, env, lineS, R };
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
/** Step the car for `sec`; returns how far its arc advanced. */
function run(r: Rig, sec: number): number {
  const s0 = r.a.s;
  const pos0 = r.a.routePos;
  for (let k = 0; k < Math.round(sec / H); k++) {
    r.env.timeSec += H;
    updateVehicle(r.a, H, r.env);
  }
  return r.a.routePos === pos0 ? r.a.s - s0 : Infinity;
}
/** Standing 2 m short of the line — the fleet's standstill gap. */
const AT_LINE = CFG.minGapM;

describe("the left-turner's yield to the oncoming student, clause by clause (boxGate · studentHoldsBox)", () => {
  it("the control: with nobody oncoming, a turner standing at its line on green pulls away", () => {
    const r = eastbound("left", AT_LINE, 0);
    expect(run(r, 3)).toBeGreaterThan(3);
  });

  it("V7 — the gap a MOVING oncoming student is left is the taught 4 s ON TOP of the turn's own time: at 12 m/s the turner waits for him at 150 m and goes at 180 m", () => {
    // Round 4 (the junction-box protocol, P3). Rounds 1–3 read «4 s away at his present speed»: 60 m at 12 m/s was
    // free — and the turn takes the car 7.2 s to be clear of his lane, so he was in it first. Now he is where he could
    // be at the EARLIEST (up to the 50 km/h limit) when the car is clear + 4 s: 11.2 s × ~13.9 m/s ≈ 155 m of reach.
    const held = eastbound("left", AT_LINE, 0);
    student(held.env, 150, OFFSET, 270, 12);
    expect(run(held, 3)).toBe(0);
    const stillHeld = eastbound("left", AT_LINE, 0);
    student(stillHeld.env, 60, OFFSET, 270, 12);
    expect(run(stillHeld, 3)).toBe(0);

    const free = eastbound("left", AT_LINE, 0);
    student(free.env, 180, OFFSET, 270, 12);
    expect(run(free, 3)).toBeGreaterThan(3);
  });

  it("V8 — «oncoming» is travelling AGAINST the approach: a student standing on the cross street, heading north, is not owed the turn", () => {
    // (5, −25): inside the junction's radius of the turner's lane end, on the south side, out of its corridor.
    const cross = eastbound("left", AT_LINE, 0);
    student(cross.env, 5, -25, 0, 0);
    expect(run(cross, 3)).toBeGreaterThan(3);
    // The same distance from the node, but AT HIS LINE on the opposite approach and heading west: owed.
    const oncoming = eastbound("left", AT_LINE, 0);
    student(oncoming.env, 30, OFFSET, 270, 0);
    expect(run(oncoming, 3)).toBe(0);
  });

  it("V6 — a turner that can no longer stop before its line completes the turn: it is not braked into the box", () => {
    // 3 m short of its stopping point at 9 m/s: 9² / (2 × 5.5) = 7.4 m to stop — it cannot.
    const r = eastbound("left", 3, 9);
    student(r.env, 30, OFFSET, 270, 0);
    expect((9 * 9) / (2 * CFG.hardDecelMps2)).toBeGreaterThan(3);
    run(r, 0.5);
    // Held, it would have shed 5.5 m/s² × 0.5 s = 2.75 m/s. It keeps its speed and goes through.
    expect(r.a.speed).toBeGreaterThan(8.5);
    // …while the same car 12 m out CAN stop, and does.
    const far = eastbound("left", 12, 9);
    // (Round 3: he rolls at 0.4 m/s at his line — «at his line» and not standing. For a student who STANDS the car
    // goes after the patience bound, 5 s, which this 6 s read would straddle: ambient-yield-patience.test.ts.)
    student(far.env, 30, OFFSET, 270, 0.4);
    run(far, 6);
    expect(far.a.speed).toBeLessThan(0.05);
    expect(far.a.s).toBeLessThan(far.lineS);
  });
});

describe("V3 — the car asks its signal with the bearing it ARRIVES on (laneEndSignal)", () => {
  it("a lane that leaves its start northbound and reaches the junction eastbound asks for bearing 90", () => {
    const edge = (id: string, from: string, to: string, geometry: number[][], length: number) => ({
      id,
      from,
      to,
      class: "residential",
      oneway: true,
      roundabout: false,
      lanes: 1,
      maxspeed: 50,
      length,
      geometry,
    });
    const d = {
      roads: {
        nodes: [
          { id: "A", x: -100, y: -100 },
          { id: "C", x: 0, y: 0 },
          { id: "D", x: 100, y: 0 },
        ],
        edges: [
          edge("bend", "A", "C", [[-100, -100], [-100, 0], [0, 0]], 200),
          edge("on", "C", "D", [[0, 0], [100, 0]], 100),
        ],
      },
      intersections: [{ id: "C", x: 0, y: 0, degree: 2, signalized: true }],
      crossings: [],
    } as unknown as TrafficDistrict;
    const g = graphOf(d);
    const bend = laneOf(g, "A", "C");
    const on = laneOf(g, "C", "D");
    expect([bend.startDirX, bend.startDirY]).toEqual([0, 1]);
    expect([bend.endDirX, bend.endDirY]).toEqual([1, 0]);
    const agents: VehicleAgent[] = [];
    const env = makeVehicleEnv(g, d, agents);
    const asked: Array<{ node: string; bearing: number; from: string }> = [];
    env.ambientSignal = (node, bearing, from) => {
      asked.push({ node, bearing, from });
      return "red";
    };
    const a = createVehicleAgent(0, routeOf([bend, on]), bend.length - 50, 1, 0);
    a.speed = 5;
    agents.push(a);
    updateVehicle(a, 0, env);
    updateVehicle(a, H, env);
    expect(asked.length).toBeGreaterThan(0);
    for (const q of asked) {
      expect(q.node).toBe("C");
      expect(q.from).toBe("A");
      expect(q.bearing).toBeCloseTo(90, 6);
    }
  });

  it("the catalogue: on every graded traffic-light line, the lane that ends there arrives on the line's own axis", () => {
    // What makes «the lamp facing the car» the lamp the grader reads for the student on the same approach
    // (stoplines.ts: a line's group is the axis of its approach bearing).
    let lines = 0;
    let bent = 0;
    for (const file of readdirSync(WORLD).filter((f) => f.endsWith(".json")).sort()) {
      const raw = JSON.parse(readFileSync(path.join(WORLD, file), "utf-8")) as TrafficDistrict & {
        intersections: Array<{ signalized: boolean }>;
        roads: { edges: Array<{ id: string }> };
      };
      if (!raw.intersections?.some((i) => i.signalized)) continue;
      const rt = createWorldRuntime(raw) as unknown as {
        debugStopLines(): Array<{ edgeIdx: number; control: string; junctionNodeId: string; group: string | null }>;
      };
      const g = graphOf(raw);
      for (const ln of rt.debugStopLines()) {
        if (ln.control !== "trafficLight") continue;
        const edgeId = raw.roads.edges[ln.edgeIdx].id;
        const lane = g.lanes.find((l) => l.edgeId === edgeId && l.toNode === ln.junctionNodeId);
        if (!lane) continue; // an edge class the traffic does not drive
        lines++;
        const end = ((Math.atan2(lane.endDirX, lane.endDirY) * 180) / Math.PI + 360) % 360;
        const start = ((Math.atan2(lane.startDirX, lane.startDirY) * 180) / Math.PI + 360) % 360;
        expect(axisOfBearing(end), `${file} ${edgeId} → ${ln.junctionNodeId}`).toBe(ln.group);
        if (axisOfBearing(start) !== ln.group) bent++;
      }
    }
    expect(lines).toBeGreaterThan(40);
    // …and the START of the lane would not do: this many signal lanes leave their far end on the other axis.
    expect(bent).toBeGreaterThan(0);
  }, 120_000);
});

describe("the junction box is not entered while a staged vehicle holds it (boxGate)", () => {
  it("a staged car that will cross the turn before the turner is out holds it at the line; the same car standing still far away does not", () => {
    // Oncoming, westbound, 60 m beyond the node at 10 m/s: 6 s from the box. The left turn takes the car ~15 s to clear.
    const held = eastbound("left", AT_LINE, 0);
    (held.env.staged as TrafficVehicleState[]).push(staged(60, OFFSET, 270, 10));
    expect(run(held, 3)).toBe(0);

    const free = eastbound("left", AT_LINE, 0);
    (free.env.staged as TrafficVehicleState[]).push(staged(60, OFFSET, 270, 0));
    expect(run(free, 3)).toBeGreaterThan(3);
  });

  it("a staged car STANDING on the path out of the box holds it at the line (it would be frozen against it inside)", () => {
    const r = eastbound("left", AT_LINE, 0);
    // On the northbound exit lane, 3 m past the end of the turn — within the clamp's 4.8 m of the path.
    (r.env.staged as TrafficVehicleState[]).push(staged(OFFSET, r.R + 3, 0, 0));
    expect(run(r, 5)).toBe(0);
    // …and it is released when that car drives on.
    r.env.staged[0].y = r.R + 30;
    expect(run(r, 3)).toBeGreaterThan(3);
  });

  it("a staged car moving the turner's own way — its follower, or the leader it is following — never holds it", () => {
    const follower = eastbound("left", AT_LINE, 0);
    (follower.env.staged as TrafficVehicleState[]).push(staged(-60, -OFFSET, 90, 5));
    expect(run(follower, 3)).toBeGreaterThan(3);
  });

  it("straight across: a staged car crossing the box on the other street holds the car at its line too", () => {
    const r = eastbound("straight", AT_LINE, 0);
    expect(laneConnector(r.env.graph, laneOf(r.env.graph, "sx-n-w", "sx-n-c"), laneOf(r.env.graph, "sx-n-c", "sx-n-e")).length).toBe(0);
    // Northbound on the south arm, 60 m below the node, 10 m/s.
    (r.env.staged as TrafficVehicleState[]).push(staged(OFFSET, -60, 0, 10));
    expect(run(r, 3)).toBe(0);
    // The whole width of the box is the car's path, not its two ends and its middle: a crossing 13.5 m east of the
    // node (where an outer lane of a wider road would run) holds it just the same…
    const outer = eastbound("straight", AT_LINE, 0);
    (outer.env.staged as TrafficVehicleState[]).push(staged(13.5, -60, 0, 10));
    expect(run(outer, 3)).toBe(0);
    // …so does one 13.5 m WEST of it, on the car's own side of the box…
    const near = eastbound("straight", AT_LINE, 0);
    (near.env.staged as TrafficVehicleState[]).push(staged(-13.5, -60, 0, 10));
    expect(run(near, 3)).toBe(0);
    // …and one that will pass 40 m east of the node, beyond the box, does not.
    const beyond = eastbound("straight", AT_LINE, 0);
    (beyond.env.staged as TrafficVehicleState[]).push(staged(40, -60, 0, 10));
    expect(run(beyond, 3)).toBeGreaterThan(3);
    const free = eastbound("straight", AT_LINE, 0);
    expect(run(free, 3)).toBeGreaterThan(3);
  });

  it("a car that can no longer stop before its line is not held THERE: it enters — and decides again at its waiting point, short of the lane the staged car is coming down (round 5, D4)", () => {
    const r = eastbound("left", 3, 9);
    // 30 m east of the node at 10 m/s on the westbound lane: there before the car is off it, at the speed it has.
    (r.env.staged as TrafficVehicleState[]).push(staged(30, OFFSET, 270, 10));
    run(r, 0.5);
    // Over its line at speed: no stop was asked of it there.
    expect(r.a.s).toBeGreaterThan(r.lineS);
    expect(r.a.speed).toBeGreaterThan(5);
    // …then it stands short of the westbound lane: its body's northern reach is still south of that lane's edge.
    run(r, 10);
    expect(r.a.speed).toBeLessThan(0.3);
    const reach = (VEHICLE_LENGTH_M / 2) * Math.abs(r.a.state.dirY) + 1 * Math.abs(r.a.state.dirX);
    expect(r.a.state.y + reach).toBeLessThan(0);
  });
});

describe("a car about to turn round at a junction gives way to the student (studentHoldsBox)", () => {
  it("the control: with no student in the world the U-turner pulls away on green", () => {
    const r = eastbound("uturn", AT_LINE, 0);
    expect(run(r, 3)).toBeGreaterThan(3);
  });

  it("while the student MOVES in the junction — from any side — it waits at its line: he may be turning", () => {
    // In the box on the cross street, heading north at 4 m/s: nothing a left-turner owes him (V8 above)…
    const inBox = eastbound("uturn", AT_LINE, 0);
    student(inBox.env, 2, -10, 0, 4);
    expect(run(inBox, 3)).toBe(0);
    // …rolling up to his own line on the south approach at 2 m/s.
    const rolling = eastbound("uturn", AT_LINE, 0);
    student(rolling.env, OFFSET, -(rolling.R + STOP_LINE_BEYOND_CUT_M + 2), 0, 2);
    expect(run(rolling, 3)).toBe(0);
  });

  it("…and STANDING at his own line, off its path, he is not coming (round 5, D1/D2 at every node): it goes", () => {
    // Round 4 held a U-turner for a student anywhere at the junction «whatever his heading»: on sc-junction-rhr a
    // U-turner stood 36.6–37.8 s for a student at rest 21.6 m south of the node and 19 m off its path (verifier R4-F5).
    const atHisLine = eastbound("uturn", AT_LINE, 0);
    student(atHisLine.env, OFFSET, -(atHisLine.R + STOP_LINE_BEYOND_CUT_M + 2), 0, 0);
    expect(run(atHisLine, 3)).toBeGreaterThan(3);
  });

  it("BEYOND SIGNALISED LANE ENDS (R4-F5, tj-rhr-v1 — no lamps): the U-turner on the west arm goes for a student at rest 21.6 m south of the node, 19 m off its path; rolling there, it waits; standing ON its path, it waits", () => {
    const d = JSON.parse(readFileSync(path.join(WORLD, "tj-rhr-v1.json"), "utf-8")) as TrafficDistrict;
    expect(d.intersections.every((ix) => !ix.signalized)).toBe(true);
    const g = graphOf(d);
    const eb = laneOf(g, "tj-n-w", "tj-n-c");
    const wb = laneOf(g, "tj-n-c", "tj-n-w");
    const R = g.junctionRadiusM.get("tj-n-c") as number;
    const rig = (x: number, y: number, headingDeg: number, mps: number): number => {
      const agents: VehicleAgent[] = [];
      const env = makeVehicleEnv(g, d, agents);
      const lineS = eb.length - Math.max(6.5, R + STOP_LINE_BEYOND_CUT_M) - VEHICLE_LENGTH_M / 2;
      const a = createVehicleAgent(0, routeOf([eb, wb]), lineS - AT_LINE, 1, 0);
      agents.push(a);
      updateVehicle(a, 0, env);
      student(env, x, y, headingDeg, mps);
      const s0 = a.s;
      for (let k = 0; k < 3 * 60; k++) {
        env.timeSec += H;
        updateVehicle(a, H, env);
      }
      return a.routePos === 0 ? a.s - s0 : Infinity;
    };
    // The U-turn's own path is 19 m or more from him there (read off the connector).
    const cu = laneConnector(g, eb, wb);
    let off = Infinity;
    for (let i = 0; i < cu.px.length; i++) off = Math.min(off, Math.hypot(cu.px[i] - OFFSET, cu.py[i] + 21.6));
    expect(off).toBeGreaterThan(18.5);
    expect(rig(OFFSET, -21.6, 0, 0)).toBeGreaterThan(3);
    expect(rig(OFFSET, -21.6, 0, 3)).toBe(0);
    expect(rig(cu.px[Math.floor(cu.px.length / 2)], cu.py[Math.floor(cu.px.length / 2)], 0, 0)).toBe(0);
  });

  it("beyond the junction it is the protocol's question: on the CROSS street he is waited for only if his own signal has let him in; coming against the car he is predicted", () => {
    // Round 4. Rounds 2–3 held the U-turner for anyone within «4 s at his present speed» of the junction, whatever
    // his lamp. On the cross street, 64 m out at 10 m/s, with this rig's lamps all green (no phase of their own — an
    // uncontrolled cluster): nothing is asked of the car beyond the junction itself.
    const cross = eastbound("uturn", AT_LINE, 0);
    student(cross.env, OFFSET, -64, 0, 10);
    expect(run(cross, 3)).toBeGreaterThan(3);
    // Coming AGAINST the car on the opposite arm he is predicted (P3): at 12 m/s it waits for him at 180 m and not at
    // 200 m — the U-turn ends in his own lane, and it is slower than a left turn.
    const held = eastbound("uturn", AT_LINE, 0);
    student(held.env, 180, OFFSET, 270, 12);
    expect(run(held, 3)).toBe(0);
    const far = eastbound("uturn", AT_LINE, 0);
    student(far.env, 200, OFFSET, 270, 12);
    expect(run(far, 3)).toBeGreaterThan(3);
  });
});
