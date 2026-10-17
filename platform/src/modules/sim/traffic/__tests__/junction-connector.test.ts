/**
 * sc-sig-controller-postures:5ee4301e, round 2 — AN AMBIENT CAR DRIVES THROUGH A JUNCTION, IT DOES NOT HOP IT.
 *
 * THE CAUSE (round 1's verifier, measured on sc-turn-left-oncoming phone-L3 through the live chain): an ambient car
 * that entered sx-v1 lawfully on its own green and turned right had its pose jump from (−1.1, −4.1) to (−4.1, 0),
 * heading 180, and then stood at 0 km/h inside the box for the rest of the drive, the lesson's staged oncoming pair
 * frozen behind it; the rig tapes then turned into the frozen car (33 COLLISIONs in 100 start delays, 0 at base).
 *
 * WHY. Lanes are edge centrelines offset to the right and cut square at the node, so two lanes of a turn do not meet
 * (`traffic/graph.ts`). `vehicles.ts` ran each lane to its last metre and carried the remainder into the next lane's
 * arc 0: the published pose hopped the gap. On a RIGHT turn the next lane begins BEHIND the car — it overshot to the
 * node, hopped back beside its own follower and had to re-cross the lane it came on, in front of that follower. The
 * follower would not close on it and it would not close on the follower.
 *
 * WHAT IS PINNED HERE (the drill-level witness and the catalogue census are in
 * lessons/scenario/__tests__/junction-box-clears.census.test.ts):
 *   1. the connector's shape on sx-v1: it leaves the lane at the junction cut, is tangent to both lanes, and is the
 *      circular arc between them — a right turn stays in its own corner of the box;
 *   2. a U-turn at a dead end is the half circle between the two directions' lanes; lanes that meet have none;
 *   3. stepping the fleet at 1/60 s on sx-v1, no ambient car's pose ever moves further than its speed allows — the
 *      hop (5.7 m at a turn, 8.1 m at a dead end) is gone;
 *   4. the turn speed is reached at the MIDDLE of the connector (the node's counterpart) and the car accelerates
 *      out; a right-turner is never back on the lane it left;
 *   5. a follower in the connector keeps a car's length from a leader standing on the lane beyond it;
 *   6. a stop point on the lane AFTER a turn is where it is: the car brakes for it from the true distance.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLaneGraph, laneConnector, type DirectedLane, type LaneGraph } from "../graph";
import type { TrafficRoute } from "../routes";
import { createTrafficSystem } from "../system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../types";
import { createVehicleAgent, updateVehicle, VEHICLE_LENGTH_M, type VehicleAgent } from "../vehicles";
import { makeVehicleEnv } from "./fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const sx = (): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, "sx-v1.json"), "utf-8"));
const H = 1 / 60;

function graphOf(d: TrafficDistrict): LaneGraph {
  return buildLaneGraph(d, {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
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
/** sx-v1: two lanes, one each way — the lane centre is half a lane width off the centreline. */
const OFFSET = DEFAULT_TRAFFIC_CONFIG.laneWidthM / 2;

describe("the connector between two lanes of a turn (graph.ts laneConnector)", () => {
  const g = graphOf(sx());
  const R = g.junctionRadiusM.get("sx-n-c") as number;
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  const sb = laneOf(g, "sx-n-c", "sx-n-s");
  const nb = laneOf(g, "sx-n-c", "sx-n-n");
  const ebOut = laneOf(g, "sx-n-c", "sx-n-e");

  it("a RIGHT turn leaves the lane at the junction cut and is the circular arc into the next lane's cut — it never comes back to the lane it left", () => {
    const c = laneConnector(g, eb, sb);
    expect(R).toBeGreaterThan(OFFSET + 5);
    // The cut: the drawn junction radius back from the node on the approach, the same forward on the exit.
    expect(c.exitS).toBeCloseTo(eb.length - R, 9);
    expect(c.entryS).toBeCloseTo(R, 9);
    const n = c.px.length - 1;
    expect(c.px[0]).toBeCloseTo(-R, 9);
    expect(c.py[0]).toBeCloseTo(-OFFSET, 9);
    expect(c.px[n]).toBeCloseTo(-OFFSET, 9);
    expect(c.py[n]).toBeCloseTo(-R, 9);
    // Tangent to both lanes: the first chord runs east, the last one south (within the 3° a segment is cut at).
    expect(Math.abs(Math.atan2(c.py[1] - c.py[0], c.px[1] - c.px[0]))).toBeLessThan(0.06);
    expect(Math.abs(Math.atan2(c.px[n] - c.px[n - 1], -(c.py[n] - c.py[n - 1])))).toBeLessThan(0.06);
    // The circular arc of radius (cut − lane offset) about the corner (−R, −R): every point within 1 % of it…
    const r = R - OFFSET;
    for (let i = 0; i <= n; i++) {
      expect(Math.hypot(c.px[i] + R, c.py[i] + R) / r, `point ${i}`).toBeGreaterThan(0.99);
      expect(Math.hypot(c.px[i] + R, c.py[i] + R) / r, `point ${i}`).toBeLessThan(1.01);
      // …so it stays in its own corner of the box: never back on the eastbound lane's line beyond the cut, never
      // across the southbound lane it is joining.
      expect(c.py[i], `point ${i}`).toBeLessThanOrEqual(-OFFSET + 1e-9);
      expect(c.px[i], `point ${i}`).toBeLessThanOrEqual(-OFFSET + 1e-9);
    }
    // …and its length is the quarter circle's, the TRUE distance the car drives (the hop «drove» R + R here).
    expect(c.length / ((Math.PI / 2) * r)).toBeGreaterThan(0.995);
    expect(c.length / ((Math.PI / 2) * r)).toBeLessThan(1.005);
    expect(c.cum[n]).toBe(c.length);
  });

  it("a LEFT turn is the wide arc across the box; straight on, the lanes already meet and there is no connector", () => {
    const left = laneConnector(g, eb, nb);
    const n = left.px.length - 1;
    expect(left.px[0]).toBeCloseTo(-R, 9);
    expect(left.py[0]).toBeCloseTo(-OFFSET, 9);
    expect(left.px[n]).toBeCloseTo(OFFSET, 9);
    expect(left.py[n]).toBeCloseTo(R, 9);
    const r = R + OFFSET;
    for (let i = 0; i <= n; i++) {
      expect(Math.hypot(left.px[i] + R, left.py[i] - R) / r, `point ${i}`).toBeGreaterThan(0.99);
      expect(Math.hypot(left.px[i] + R, left.py[i] - R) / r, `point ${i}`).toBeLessThan(1.01);
    }
    expect(left.length / ((Math.PI / 2) * r)).toBeGreaterThan(0.995);
    expect(left.length / ((Math.PI / 2) * r)).toBeLessThan(1.005);

    const straight = laneConnector(g, eb, ebOut);
    expect(straight.length).toBe(0);
    expect(straight.exitS).toBe(eb.length);
    expect(straight.entryS).toBe(0);
    // Built once per pair.
    expect(laneConnector(g, eb, nb)).toBe(left);
  });

  it("a dead end's U-turn is the half circle between the two directions' lanes; a pair that is not contiguous has none", () => {
    const out = laneOf(g, "sx-n-c", "sx-n-e");
    const back = laneOf(g, "sx-n-e", "sx-n-c");
    const u = laneConnector(g, out, back);
    // No drawn patch at a dead end: the cut is half the gap between the two lane ends, i.e. the lane offset.
    expect(u.exitS).toBeCloseTo(out.length - OFFSET, 9);
    expect(u.entryS).toBeCloseTo(OFFSET, 9);
    const n = u.px.length - 1;
    for (let i = 0; i <= n; i++) {
      // Centre (120 − offset, 0), radius = the offset: within 3 % (one cubic's half circle).
      expect(Math.hypot(u.px[i] - (120 - OFFSET), u.py[i]) / OFFSET, `point ${i}`).toBeGreaterThan(0.97);
      expect(Math.hypot(u.px[i] - (120 - OFFSET), u.py[i]) / OFFSET, `point ${i}`).toBeLessThan(1.03);
    }
    expect(u.length / (Math.PI * OFFSET)).toBeGreaterThan(0.97);
    expect(u.length / (Math.PI * OFFSET)).toBeLessThan(1.03);

    // A U-turn AT A JUNCTION is made the same way, about the end of the lane in the middle of the box — not at the
    // junction's cut, which would put it in the mouth of the arm, across the lane traffic leaves the junction by.
    const atJunction = laneConnector(g, eb, laneOf(g, "sx-n-c", "sx-n-w"));
    expect(atJunction.exitS).toBeCloseTo(eb.length - OFFSET, 9);
    expect(atJunction.entryS).toBeCloseTo(OFFSET, 9);
    for (let i = 0; i < atJunction.px.length; i++) {
      expect(Math.hypot(atJunction.px[i] + OFFSET, atJunction.py[i]) / OFFSET, `point ${i}`).toBeGreaterThan(0.97);
      expect(Math.hypot(atJunction.px[i] + OFFSET, atJunction.py[i]) / OFFSET, `point ${i}`).toBeLessThan(1.03);
      // Never further up the arm than the lane offset: the arm's mouth (27 m out) is not touched.
      expect(atJunction.px[i], `point ${i}`).toBeGreaterThan(-OFFSET - 1e-9);
    }

    // sx-n-s → sx-n-c then sx-n-e → sx-n-c: the second does not start where the first ends.
    const none = laneConnector(g, laneOf(g, "sx-n-s", "sx-n-c"), back);
    expect(none.length).toBe(0);
    expect(none.entryS).toBe(0);
  });
});

describe("an ambient car's pose through a junction (vehicles.ts)", () => {
  it("sx-v1 at 1/60 s, 240 s, eight cars: no pose ever moves further than its speed allows and no heading flips", () => {
    const raw = sx();
    const traffic = createTrafficSystem(raw, {
      anchor: { x: 0, y: -105 },
      anchorRadiusM: 400,
      vehicleCount: 8,
      pedestrianCount: 0,
      sidewalkPedestrianCount: 0,
    } as never);
    const prev = new Map<number, { x: number; y: number; v: number; hdg: number }>();
    let worst = 0;
    let worstWhere = "";
    let worstTurn = 0;
    let turning = 0;
    for (let k = 1; k <= 240 * 60; k++) {
      traffic.update(H, { signalPhase: () => "green", playerPos: null });
      for (const v of traffic.vehicles) {
        const p = prev.get(v.id);
        const hdg = Math.atan2(v.dirX, v.dirY);
        prev.set(v.id, { x: v.x, y: v.y, v: v.speedMps, hdg });
        if (!p) continue;
        const moved = Math.hypot(v.x - p.x, v.y - p.y);
        // One step of travel: the speed it had or has, plus one step of the fleet's own acceleration.
        const allowed = (Math.max(p.v, v.speedMps) + DEFAULT_TRAFFIC_CONFIG.accelMps2 * H) * H + 1e-9;
        if (moved - allowed > worst) {
          worst = moved - allowed;
          worstWhere = `car ${v.id} t=${(k * H).toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) → (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`;
        }
        let d = Math.abs(hdg - p.hdg);
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > 1e-6) turning++;
        if (d > worstTurn) worstTurn = d;
      }
    }
    expect(turning).toBeGreaterThan(50); // the fleet did turn
    expect(worst, worstWhere).toBe(0);
    // The heading turns with the path: a connector is cut at 3° a segment (the hop flipped it 90° or 180° at once).
    expect(worstTurn).toBeLessThan(0.2);
  }, 120_000);

  /** One car on a hand-built route. */
  function oneCar(lanes: DirectedLane[], g: LaneGraph, d: TrafficDistrict, s0: number, speed: number) {
    const agents: VehicleAgent[] = [];
    const env = makeVehicleEnv(g, d, agents);
    const a = createVehicleAgent(0, routeOf(lanes), s0, 1, 0);
    a.speed = speed;
    agents.push(a);
    updateVehicle(a, 0, env);
    return { a, env, agents };
  }

  it("a right turn: once off the lane it left the car is never back on it, the turn speed is reached at the MIDDLE of the connector, and it accelerates out", () => {
    const d = sx();
    const g = graphOf(d);
    const eb = laneOf(g, "sx-n-w", "sx-n-c");
    const sb = laneOf(g, "sx-n-c", "sx-n-s");
    const back = laneOf(g, "sx-n-s", "sx-n-c");
    const wb = laneOf(g, "sx-n-c", "sx-n-w");
    const c = laneConnector(g, eb, sb);
    const { a, env } = oneCar([eb, sb, back, wb], g, d, eb.length - 80, 10);
    let atApex = -1;
    let atEnd = -1;
    let minSpeed = Infinity;
    let minAt = -1;
    let atCut = -1;
    let left = false;
    for (let k = 0; k < 40 * 60; k++) {
      const sBefore = a.s;
      updateVehicle(a, H, env);
      if (a.routePos !== 0) {
        atEnd = a.speed;
        break;
      }
      if (a.s <= c.exitS) continue;
      if (atCut < 0) atCut = a.speed;
      if (a.state.y < -OFFSET - 0.5) left = true;
      // Once it has left the lane line it is never back on it — the old path re-crossed it at (−4.06, −4.06).
      if (left) expect(a.state.y, `s=${a.s.toFixed(2)}`).toBeLessThan(-OFFSET - 0.5);
      expect(a.state.x, `s=${a.s.toFixed(2)}`).toBeLessThanOrEqual(-OFFSET + 1e-9);
      if (atApex < 0 && sBefore <= c.exitS + c.length / 2 && a.s > c.exitS + c.length / 2) atApex = a.speed;
      if (a.speed < minSpeed) {
        minSpeed = a.speed;
        minAt = (a.s - c.exitS) / c.length;
      }
    }
    expect(left).toBe(true);
    // turnSpeedCap's «proper turn» band, 4 m/s, is what the car slows TOWARDS the apex for — it is still braking at
    // the cut, slowest about the middle of the turn (the following law trails the envelope by about a metre a
    // second, as it always did at the node), never under the cap…
    expect(atCut).toBeGreaterThan(atApex + 1);
    expect(atApex).toBeGreaterThan(3.9);
    expect(atApex).toBeLessThan(5.5);
    expect(minSpeed).toBeGreaterThan(3.85);
    expect(minAt).toBeGreaterThan(0.4);
    expect(minAt).toBeLessThan(0.75);
    // …and the car leaves the connector faster than it took the apex (it used to accelerate from the node).
    expect(atEnd).toBeGreaterThan(atApex + 2);
    // It joins the next lane at the connector's entry arc, not at arc 0.
    expect(a.routePos).toBe(1);
    expect(a.s).toBeGreaterThanOrEqual(c.entryS);
    expect(a.s).toBeLessThan(c.entryS + 0.3);
  });

  it("a follower in the connector keeps a car's length from a leader standing on the lane beyond it", () => {
    const d = sx();
    const g = graphOf(d);
    const eb = laneOf(g, "sx-n-w", "sx-n-c");
    const sb = laneOf(g, "sx-n-c", "sx-n-s");
    const back = laneOf(g, "sx-n-s", "sx-n-c");
    const wb = laneOf(g, "sx-n-c", "sx-n-w");
    const c = laneConnector(g, eb, sb);
    const { a, env, agents } = oneCar([eb, sb, back, wb], g, d, eb.length - 60, 8);
    // The leader: standing on the southbound lane 3 m past the connector's end (its own law is never stepped).
    const leader = createVehicleAgent(1, routeOf([sb, back, wb, eb]), c.entryS + 3, 1, 0);
    agents.push(leader);
    updateVehicle(leader, 0, env);
    leader.speed = 0;
    let closest = Infinity;
    for (let k = 0; k < 40 * 60; k++) {
      updateVehicle(a, H, env);
      closest = Math.min(closest, Math.hypot(a.state.x - leader.state.x, a.state.y - leader.state.y));
    }
    // It came to rest behind the leader, in the connector, a body length and the standstill gap short of it —
    // measured along the path it actually drives.
    expect(a.speed).toBeLessThan(0.05);
    expect(a.routePos).toBe(0);
    expect(a.s).toBeGreaterThan(c.exitS);
    const pathGap = c.exitS + c.length - a.s + (leader.s - c.entryS);
    expect(pathGap).toBeGreaterThan(VEHICLE_LENGTH_M + 0.4 - 1e-6);
    expect(pathGap).toBeLessThan(VEHICLE_LENGTH_M + DEFAULT_TRAFFIC_CONFIG.minGapM + 0.5);
    expect(closest).toBeGreaterThan(VEHICLE_LENGTH_M);
  });

  it("a stop point on the lane AFTER a turn is at its true distance: the car stops for an occupied crossing there without ever braking harder than it brakes for one straight ahead", () => {
    const d = sx();
    // A marked crossing on the south arm, 45 m below the node — 18 m past the end of the right turn's connector.
    (d.crossings as unknown[]).push({ id: "x-south", x: 0, y: -45, kind: "marked", signalized: false, edgeId: "sx-e-s" });
    const g = graphOf(d);
    const eb = laneOf(g, "sx-n-w", "sx-n-c");
    const sb = laneOf(g, "sx-n-c", "sx-n-s");
    const back = laneOf(g, "sx-n-s", "sx-n-c");
    const wb = laneOf(g, "sx-n-c", "sx-n-w");
    const c = laneConnector(g, eb, sb);
    const { a, env } = oneCar([eb, sb, back, wb], g, d, eb.length - 70, 10);
    env.crossingCounts.set("x-south", 1); // somebody is on it, for the whole run
    let hardest = 0;
    for (let k = 0; k < 60 * 60; k++) {
      const v0 = a.speed;
      updateVehicle(a, H, env);
      hardest = Math.max(hardest, (v0 - a.speed) / H);
    }
    // At rest on the southbound lane, short of the crossing by the config's stop offset, its own half-length and the
    // standstill gap.
    expect(a.speed).toBeLessThan(0.05);
    expect(a.routePos).toBe(1);
    const crossS = sb.crossings.find((x) => x.crossingId === "x-south")!.s;
    const stopS = crossS - DEFAULT_TRAFFIC_CONFIG.crossingStopOffsetM - VEHICLE_LENGTH_M / 2;
    expect(a.s).toBeLessThan(stopS);
    expect(a.s).toBeGreaterThan(stopS - DEFAULT_TRAFFIC_CONFIG.minGapM - 0.5);
    expect(a.s).toBeGreaterThan(c.entryS);
    // …and it got there on the comfortable side of the fleet's braking: it knew how far the crossing was all the way
    // through the turn. (Believing the box is R + R long instead of the arc's 36 m puts the crossing 18 m further
    // than it is, and the car then needs its hard braking for it.)
    expect(hardest).toBeLessThan(DEFAULT_TRAFFIC_CONFIG.comfortDecelMps2 + 0.6);
  });
});
