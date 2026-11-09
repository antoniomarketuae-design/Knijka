/**
 * RULING R13''' — A VEHICLE HE HAD TO GIVE WAY TO, JUDGED ON ITS OWN ROUTE, THAT
 * HAD TO BRAKE WHILE HE WAS IN ITS WAY (lane slowturn; runtime/leftTurnGiveWay.ts,
 * runtime/worldRuntime.ts LEFT_TURN_FORCED_SHED_MPS; replaces the evidence rule
 * of R13' / R13'' after the round-5 verifier's R13PP-LEFTTURNER-IN-APPROACH,
 * R13PP-OWN-STOP-HELD and R13PP-MERGE-FOLLOW).
 *
 * At an ADDED-path left commit (runtime/turns.ts: a slow or stop-interrupted
 * junction turn) with no tight gap, the N1 tracker convicts FAILED_TO_YIELD on
 * a vehicle only if ALL of these hold:
 *  (1) its planned route arrives by the OPPOSITE approach (its arrival lane
 *      ends > LEFT_TURN_ONCOMING_MIN_DEG off his approach heading) and goes
 *      STRAIGHT or RIGHT there (ЗДвП чл. 37, ал. 1 — never an oncoming
 *      left- or U-turner), it has not passed the node, and it is approaching
 *      now (R13'' arithmetic) or held for him;
 *  (2) its route ACROSS the junction (inside the junction open radius, and on)
 *      met his body on a grid point of this visit;
 *  (3) its account grew ≥ LEFT_TURN_FORCED_SHED_MPS over grid points on which
 *      his body lay on its route AHEAD of it, in its present approach (a grid
 *      point on which its route does not arrive at the node ends that approach);
 *      HELD = braked below LEFT_TURN_MIN_CLOSING_MPS by that in-the-way shed;
 *  (4) its route arrives at the node within LEFT_TURN_ONCOMING_RADIUS_M.
 * The cells hold each clause, one at a time, on the reference junction
 * left-turn-yield.test.ts uses, with a scripted probe (a 3 s gap — never
 * tight), scripted account rows and a scripted planned-route query; the
 * conviction names its vehicle on the internal diagnostic `forcedById`. Base
 * (3 s window) commits are untouched.
 *
 * THE GEOMETRY. He comes south down x = J.x (heading 178°) to 8 m short of J,
 * then the slow sweep puts his body on a 6 m circle about J from its south
 * point (heading 178°) round to its east point (88°). The oncoming car comes
 * NORTH on its own lane 3 m east of his line (x = J.x + 3): his sweep crosses
 * that line at ≈ 150° of heading (frames 36–76 of the sweep), and his approach
 * down x = J.x keeps his body 2.15 m clear of it (half a chassis 0.85 m against
 * the line 3 m off) — farther than the car's half body width (0.92 m).
 */
import { describe, expect, it } from "vitest";
import { createWorldRuntime, type OncomingConflict } from "..";
import {
  LEFT_TURN_FORCED_SHED_MPS,
  LEFT_TURN_MIN_CLOSING_MPS,
  LEFT_TURN_ONCOMING_MIN_DEG,
  LEFT_TURN_ONCOMING_RADIUS_M,
} from "../worldRuntime";
import { LeftTurnGiveWayEvidence, type PlannedRouteRow } from "../leftTurnGiveWay";
import { oncomingApproachFor } from "../../traffic/system";
import { eventsOf, loadDistrict, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";
import type { ShedAccountRow } from "../reverseBrakedFor";

const J = { x: 448.94, y: -250.42 };
/** His approach heading (southbound): «ahead of the node» is dy < 0. */
const APPROACH_DEG = 178;

function approach(n: number, fromM = 26, toM = 8): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < n; i++) {
    const d = fromM + ((toM - fromM) * i) / Math.max(1, n - 1);
    poses.push({ x: J.x, y: J.y + d, headingDeg: APPROACH_DEG });
  }
  return poses;
}

/** A −90° sweep about J over `n` frames, then `hold` frames straight on west. */
function leftSweep(n: number, hold = 0): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < n; i++) {
    const heading = APPROACH_DEG + ((88 - APPROACH_DEG) * i) / (n - 1);
    const rad = (heading * Math.PI) / 180;
    poses.push({ x: J.x + 6 * Math.sin(rad), y: J.y + 6 * Math.cos(rad), headingDeg: heading });
  }
  const last = poses[poses.length - 1];
  for (let i = 1; i <= hold; i++) poses.push({ x: last.x - 0.15 * i, y: last.y, headingDeg: 268 });
  return poses;
}

const DT = 0.05;

/** A scripted planned route, relative to J: its movement, its arrival lane's end heading, its centre-line ahead of it. */
interface Plan {
  movement: PlannedRouteRow["movement"];
  /** Heading its arrival lane ends with (0 = north). */
  arriveDeg: number;
  /** Its centre-line AFTER its present centre (which the query puts first), as (dx, dy) about J. */
  pts: Array<[number, number]>;
  /** The node's junction open radius (default 10 m). */
  jr?: number;
}

/** A scripted account row: where it is, which way it heads, how fast, its account, its route — all per frame. */
interface Row {
  id: number;
  dx?: number;
  dy: number | ((frame: number) => number);
  /** Its heading, degrees (0 = north = +y): oncoming to a southbound student is ≈ 0. */
  headingDeg: number | ((frame: number) => number);
  mps: number | ((frame: number) => number);
  shed: (frame: number) => number;
  /** Its planned route through the node this frame, or null (passed it / not on its route). Default: straight on north. */
  plan?: (frame: number) => Plan | null;
}
const at = <T,>(v: T | ((f: number) => T), f: number): T => (typeof v === "function" ? (v as (f: number) => T)(f) : v);

const STRAIGHT_NORTH = (dx: number): Plan => ({ movement: "straight", arriveDeg: 0, pts: [[dx, 36]] });

function runCell(poses: PathPose[], speedKmh: number, rowsIn: Row[]): SimTick[] {
  const rt = createWorldRuntime(loadDistrict());
  const gap3s: OncomingConflict = { distM: 15, closingMps: 5 };
  rt.setOncomingQuery(() => gap3s);
  let frame = 0;
  const rows: ShedAccountRow[] = rowsIn.map((r) => ({ id: r.id, kind: "vehicle", x: J.x, y: J.y, playerShedMps: 0, speedMps: 0, dirX: 0, dirY: 1 }));
  rt.setPlayerShedAccountsQuery(() => {
    rowsIn.forEach((r, i) => {
      const h = (at(r.headingDeg, frame) * Math.PI) / 180;
      Object.assign(rows[i], {
        x: J.x + (r.dx ?? 0),
        y: J.y + at(r.dy, frame),
        dirX: Math.sin(h),
        dirY: Math.cos(h),
        speedMps: at(r.mps, frame),
        playerShedMps: r.shed(frame),
      });
    });
    return rows;
  });
  const px: number[] = [];
  const py: number[] = [];
  const out: PlannedRouteRow = { id: 0, movement: "straight", approachDirX: 0, approachDirY: 0, halfWidthM: 0.92, px, py, n: 0, junctionRadiusM: 10 };
  rt.setPlannedRouteQuery((id, nodeId, reachM) => {
    const i = rowsIn.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const r = rowsIn[i];
    const p = r.plan ? r.plan(frame) : STRAIGHT_NORTH(r.dx ?? 0);
    if (p === null) return null;
    expect(reachM).toBe(LEFT_TURN_ONCOMING_RADIUS_M);
    expect(typeof nodeId).toBe("string");
    const a = (p.arriveDeg * Math.PI) / 180;
    out.id = id;
    out.movement = p.movement;
    out.approachDirX = Math.sin(a);
    out.approachDirY = Math.cos(a);
    out.junctionRadiusM = p.jr ?? 10;
    px[0] = rows[i].x;
    py[0] = rows[i].y;
    out.n = 1;
    for (const [dx, dy] of p.pts) {
      px[out.n] = J.x + dx;
      py[out.n] = J.y + dy;
      out.n++;
    }
    return out;
  });
  const ticks: SimTick[] = [];
  let t = 0;
  for (const pose of poses) {
    t += DT;
    rt.update(DT);
    ticks.push(rt.sample(mkVehicle(pose, { speedKmh }), t, false));
    frame++;
  }
  return ticks;
}

const APPROACH = 24;
/** The slow turn: 90° over 9 s at 10 km/h, then 3 s straight on. */
const SLOW = [...approach(APPROACH), ...leftSweep(180, 60)];
/** The fast turn: 90° over 1.5 s at 30 km/h (the base window's own turn). */
const FAST = [...approach(APPROACH), ...leftSweep(30, 30)];
/** Sweep frames on which his body lies on the line x = J.x + 3 (heading ≈ 160°–140°). */
const IN_WAY_FROM = APPROACH + 40;
/** Braked 2 m/s for him WHILE HE IS ON ITS ROUTE (sweep frames 40–60). */
const brakingInWay = (frame: number) => Math.min(2, Math.max(0, frame - IN_WAY_FROM) * 0.1);
/** Braked 2 m/s while he was still on his approach, clear of its route, and flat after. */
const brakingWhileClear = (frame: number) => Math.min(2, frame * 0.1);

const turnsOf = (ticks: SimTick[]) => eventsOf(ticks, "turnStarted");
const prioOf = (ticks: SimTick[]) => eventsOf(ticks, "prioritySituation");
const CONVICTED = (id: number) => [
  { kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, addedPath: true, forcedById: id },
];
/** An oncoming car on its own lane 3 m east of his line, 15 m short of the node, closing at 5 m/s, straight on north. */
const ONCOMING: Omit<Row, "shed"> = { id: 7, dx: 3, dy: -15, headingDeg: 0, mps: 5 };

describe("R13''' — at an ADDED-path left commit, a vehicle he had to give way to, judged on its own route, that braked while he was in its way", () => {
  it("the slow turn is an ADDED left turn, and the base window sees nothing (precondition)", () => {
    const ticks = runCell(SLOW, 10, [{ ...ONCOMING, shed: () => 0 }]);
    expect(turnsOf(ticks)).toEqual([{ kind: "turnStarted", direction: "left", addedPath: true }]);
  });

  it(`CONVICTS, naming the car: oncoming straight on, its route across the junction met his body, shed ≥ ${LEFT_TURN_FORCED_SHED_MPS} m/s while he lay on it ahead of it`, () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay }]))).toEqual(CONVICTED(7));
  });

  it("nothing when its account stayed flat — he made nobody brake", () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: () => 0 }]))).toEqual([]);
  });

  // (1) — the movement, from its own route (R13PP-LEFTTURNER-IN-APPROACH: heading
  // opposite and closing, in its approach lane, braking with him on its line).
  it("(1) nothing from an oncoming LEFT-turner still in its approach — the same car, the same braking while he is on its line, but its route turns away west in front of him", () => {
    const left = (): Plan => ({ movement: "left", arriveDeg: 0, pts: [[3, -3], [-40, -3]] });
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan: left }]))).toEqual([]);
  });

  it("(1) nothing from an oncoming U-turner", () => {
    const u = (): Plan => ({ movement: "uturn", arriveDeg: 0, pts: [[3, -3], [-3, -3], [-3, -40]] });
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan: u }]))).toEqual([]);
  });

  it("(1) CONVICTS on an oncoming RIGHT-turner into his exit arm that braked while he was on its route (R13PP-MERGE-FOLLOW: it counts, under (3))", () => {
    const right = (): Plan => ({ movement: "right", arriveDeg: 0, pts: [[3, -3], [5, 0], [40, 0]] });
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan: right }]))).toEqual(CONVICTED(7));
  });

  it("(1) nothing from a CROSS-TRAFFIC car — arriving eastbound (88° off his approach), its line across his sweep, braking while he is on it", () => {
    const cross = (): Plan => ({ movement: "straight", arriveDeg: 90, pts: [[40, -5.2]] });
    expect(prioOf(runCell(SLOW, 10, [{ id: 7, dx: -15, dy: -5.2, headingDeg: 90, mps: 5, shed: brakingInWay, plan: cross }]))).toEqual([]);
  });

  it("(1) nothing once its route no longer arrives at the node (it has passed it)", () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan: (f) => (f < IN_WAY_FROM + 30 ? STRAIGHT_NORTH(3) : null) }]))).toEqual([]);
  });

  // (2) — its route ACROSS the junction must meet his body.
  it("(2) nothing when its route across the junction never meets his body — it turns right into an arm short of his sweep, and he was only on the part of its route outside the junction radius", () => {
    const shortRight = (): Plan => ({ movement: "right", arriveDeg: 0, pts: [[3, -3], [40, -3]], jr: 2 });
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan: shortRight }]))).toEqual([]);
  });

  it("(2) …the same route with the junction radius reaching his sweep CONVICTS (the twin of the cell above)", () => {
    const right = (): Plan => ({ movement: "right", arriveDeg: 0, pts: [[3, -3], [40, -3]], jr: 10 });
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan: right }]))).toEqual(CONVICTED(7));
  });

  // (3) — only the shed accrued while he lay on its route ahead of it, in this approach.
  it("(3) nothing when it braked while he was still on his approach, CLEAR of its route, and then not again while he crossed it", () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingWhileClear }]))).toEqual([]);
  });

  it("(3) nothing when it braked for him in an EARLIER approach — its route stopped arriving at the node for a grid point — and came back flat", () => {
    const plan = (f: number) => (f === IN_WAY_FROM + 30 ? null : STRAIGHT_NORTH(3));
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan }]))).toEqual([]);
  });

  it("(3) HELD: CONVICTS on a car braked to rest (0 m/s) by what it shed while he was on its route", () => {
    const ticks = runCell(SLOW, 10, [
      {
        ...ONCOMING,
        mps: (f) => Math.max(0, 5 - Math.max(0, f - IN_WAY_FROM) * 0.25),
        shed: (f) => Math.min(5, Math.max(0, f - IN_WAY_FROM) * 0.25),
      },
    ]);
    expect(prioOf(ticks)).toEqual(CONVICTED(7));
  });

  it("(3) NOT HELD: a car whose shed (1.06 m/s) accrued while he stood clear, and which then stopped for its own reason, is not evidence (R13PP-OWN-STOP-HELD)", () => {
    const ticks = runCell(SLOW, 10, [
      {
        ...ONCOMING,
        mps: (f) => Math.max(0, 5 - Math.max(0, f - IN_WAY_FROM) * 0.25),
        shed: (f) => Math.min(1.06, f * 0.05),
      },
    ]);
    expect(prioOf(ticks)).toEqual([]);
  });

  it(`(4) nothing from a car farther than LEFT_TURN_ONCOMING_RADIUS_M (${LEFT_TURN_ONCOMING_RADIUS_M} m) from the node, whatever its route says`, () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, dy: -(LEFT_TURN_ONCOMING_RADIUS_M + 4), shed: brakingInWay }]))).toEqual([]);
  });

  it("(1) approaching now: nothing from a car standing (0 m/s) that was not held for him", () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, mps: 0, shed: (f) => Math.min(0.5, Math.max(0, f - IN_WAY_FROM) * 0.1) }]))).toEqual([]);
  });

  it("(1) approaching now (R13''): nothing from a car whose distance to the node GROWS (radial closing < 0), though its route still arrives there", () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, headingDeg: 180, shed: brakingInWay }]))).toEqual([]);
  });

  it("(1) approaching now, read in the crossing frame (R13''): CONVICTS on a car nearly abeam the node on its own lane — radial closing below the floor, still coming at his path along his approach axis — that braked while he was on its route", () => {
    // Waits at 15 m short while he crosses its line (and brakes for him), then rolls up to 1 m short of abeam the
    // node at 2.5 m/s: radially it closes at 2.5 × 1/√10 ≈ 0.79 m/s (< the floor), along his approach axis at 2.5 m/s.
    const rollFrom = IN_WAY_FROM + 20;
    const dy = (f: number) => (f < rollFrom ? -15 : Math.min(-1, -15 + (f - rollFrom) * 0.7));
    const ticks = runCell(SLOW, 10, [{ ...ONCOMING, dy, mps: 2.5, shed: brakingInWay }]);
    const k = ticks.findIndex((t) => t.events.some((e) => e.kind === "prioritySituation"));
    expect(k).toBeGreaterThan(rollFrom + 20); // the car is at 1 m short of abeam by then
    expect(prioOf(ticks)).toEqual(CONVICTED(7));
  });

  it("(1) approaching now (R13''): nothing from a RIGHT-turner already past abeam the node on its way round — radial closing < 0, though along his approach axis it still closes — that braked while he was on its route", () => {
    // Braked for him at 15 m short while he crossed its line; then rolled on to 1 m past abeam the node (5 m/s, still
    // heading north before its turn east): radially −5/√10 ≈ −1.6 m/s, along his approach axis +5 m/s.
    const rollFrom = IN_WAY_FROM + 20;
    const dy = (f: number) => (f < rollFrom ? -15 : Math.min(1, -15 + (f - rollFrom) * 0.8));
    const right = (): Plan => ({ movement: "right", arriveDeg: 0, pts: [[3, 2], [40, 2]] });
    const ticks = runCell(SLOW, 10, [{ ...ONCOMING, dy, shed: brakingInWay, plan: right }]);
    expect(prioOf(ticks)).toEqual([]);
  });

  it("(2) is per approach: met across the junction in an EARLIER approach, braked for him again in this one where its route across never meets him — nothing", () => {
    const resetAt = IN_WAY_FROM + 10;
    const plan = (f: number): Plan | null => (f === resetAt ? null : { ...STRAIGHT_NORTH(3), jr: f < resetAt ? 10 : 2 });
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: brakingInWay, plan }]))).toEqual([]);
  });

  it("SCOPE: a BASE (3 s window) left commit with the same braked oncoming car is untouched — no bill", () => {
    // Braked for him while he crossed its line on the fast sweep (sweep frames 5–15 of 30), before the base commit.
    const brakingFast = (f: number) => Math.min(2, Math.max(0, f - (APPROACH + 5)) * 0.2);
    const ticks = runCell(FAST, 30, [{ ...ONCOMING, shed: brakingFast }]);
    expect(turnsOf(ticks)).toEqual([{ kind: "turnStarted", direction: "left" }]);
    expect(prioOf(ticks)).toEqual([]);
  });
});

describe("R13''' (1) reads the traffic probe's own «heading roughly opposite» line", () => {
  it("LEFT_TURN_ONCOMING_MIN_DEG is the probe's ONCOMING_MIN_DEG: a car ahead whose heading is more than it off the approach is what oncomingApproachFor reports", () => {
    expect(LEFT_TURN_ONCOMING_MIN_DEG).toBe(130);
    for (const off of [0, 45, 90, 129, 129.9, 130.1, 131, 150, 180, 230, 229.9, 230.1, 270, 315]) {
      const h = (off * Math.PI) / 180;
      const v = { x: 0, y: 15, dirX: Math.sin(h), dirY: Math.cos(h), speedMps: 5 };
      // His approach heading is 0 (north) in this frame: the car is ahead of the node.
      const delta = Math.abs(((off % 360) + 540) % 360 - 180);
      expect(delta > LEFT_TURN_ONCOMING_MIN_DEG).toBe(oncomingApproachFor([v], 0, 0, 0, 1e9) !== null);
    }
  });
});

/**
 * PINNED AT INTEGRATION (st-land, 2026-11-08) — the three r6 verifier mutants that
 * survived every lane test (scratch/slowturn-verify/r6/mut.cjs):
 *  X10 the HELD return moved ahead of (1)'s movement and opposite-approach filters
 *      (killed before only by the catalogue witness witness-junctions-live-rungs,
 *      sc-junction-rhr:83b4fd69) — a held car must ALSO be one he had to give way to;
 *  X8  the (3) shed line read as 0.05 instead of LEFT_TURN_FORCED_SHED_MPS;
 *  X1  the HELD latch reading the car's TOTAL account instead of its in-the-way shed.
 * Same reference junction, probe and scripted rows as the cells above.
 */
describe("R13''' pins at integration: a held car is still judged by (1); the (3) line; HELD reads only the in-the-way shed", () => {
  const commitFrame = (ticks: SimTick[]) => ticks.findIndex((t) => t.events.some((e) => e.kind === "turnStarted"));

  it("(1) before HELD: nothing from a car HELD for him on HIS OWN approach, behind him — braked to rest by what it shed while he lay on its route ahead of it, but it arrives by his own approach, not the opposite one (sc-junction-rhr shadow-correct shape)", () => {
    const behind = (): Plan => ({ movement: "straight", arriveDeg: 180, pts: [[0, -40]] });
    const ticks = runCell(SLOW, 10, [
      { id: 3, dx: 0, dy: 34, headingDeg: 180, mps: (f) => Math.max(0, 5 - f * 0.25), shed: (f) => Math.min(5, f * 0.25), plan: behind },
    ]);
    // It is at rest, held by what it shed while he drove down its line ahead of it, long before the commit.
    expect(commitFrame(ticks)).toBeGreaterThan(APPROACH);
    expect(prioOf(ticks)).toEqual([]);
  });

  it("(1) before HELD: nothing from a CROSS-TRAFFIC LEFT-turner HELD for him — arriving eastbound (90° off his approach), turning north, braked to rest by what it shed while he lay on its route (sc-junction-left shadow-correct shape)", () => {
    const crossLeft = (): Plan => ({ movement: "left", arriveDeg: 90, pts: [[3, -5.2], [3, 40]] });
    const ticks = runCell(SLOW, 10, [
      {
        id: 1,
        dx: -15,
        dy: -5.2,
        headingDeg: 90,
        mps: (f) => Math.max(0, 5 - Math.max(0, f - IN_WAY_FROM) * 0.25),
        shed: (f) => Math.min(5, Math.max(0, f - IN_WAY_FROM) * 0.25),
        plan: crossLeft,
      },
    ]);
    // At rest (from IN_WAY_FROM + 20) before he commits.
    expect(commitFrame(ticks)).toBeGreaterThan(IN_WAY_FROM + 20);
    expect(prioOf(ticks)).toEqual([]);
  });

  it(`(3) nothing when the shed accrued while he was on its route is above 0.05 but below the ${LEFT_TURN_FORCED_SHED_MPS} m/s line (0.2 m/s), the car still coming`, () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: (f) => Math.min(0.2, Math.max(0, f - IN_WAY_FROM) * 0.1) }]))).toEqual([]);
  });

  it("(3) …the same car with 0.4 m/s shed while he was on its route CONVICTS (the twin of the cell above)", () => {
    expect(prioOf(runCell(SLOW, 10, [{ ...ONCOMING, shed: (f) => Math.min(0.4, Math.max(0, f - IN_WAY_FROM) * 0.1) }]))).toEqual(CONVICTED(7));
  });

  it("(3) NOT HELD: 0.35 m/s shed while he was on its route (≥ the line, < LEFT_TURN_MIN_CLOSING_MPS), then a stop for its own reason after he was clear (account 1.5 m/s in all), at rest at the commit — not evidence", () => {
    // Read on the tracker itself (its runtime sweep keeps his body on an oncoming lane from sweep frame ≈ 36 to the
    // commit, so «a stop after he was clear» cannot be staged on the reference junction). Node at the origin, he
    // came south (approach 180°); the car comes north on x = 3 and goes straight on.
    const ev = new LeftTurnGiveWayEvidence(LEFT_TURN_FORCED_SHED_MPS, LEFT_TURN_MIN_CLOSING_MPS, LEFT_TURN_ONCOMING_MIN_DEG);
    const row: PlannedRouteRow = { id: 7, movement: "straight", approachDirX: 0, approachDirY: 1, halfWidthM: 0.92, px: [3, 3], py: [-15, 36], n: 2, junctionRadiusM: 10 };
    const route = (id: number) => (id === 7 ? row : null);
    const ON = { x: 3, y: -5, headingDeg: 90, halfLengthM: 2.02, halfWidthM: 0.85 };
    const CLEAR = { x: -6, y: 12, headingDeg: 180, halfLengthM: 2.02, halfWidthM: 0.85 };
    const acct = (speedMps: number, playerShedMps: number) => [{ id: 7, x: 3, y: -15, speedMps, playerShedMps, dirX: 0, dirY: 1 }];
    const step = (speedMps: number, shed: number, me: typeof ON) => ev.track(acct(speedMps, shed), route, "J", 0, 0, LEFT_TURN_ONCOMING_RADIUS_M, me);
    step(5, 0, CLEAR);
    step(5, 0.35, ON); // shed for him while he lay on its route, ahead of it
    step(5, 0.35, CLEAR);
    // its own stop, after he was clear: 5, 4, 3, 2, 1, 0 m/s, the account rising to 1.5 m/s
    [4, 3, 2, 1, 0].forEach((mps, k) => step(mps, 0.35 + 0.23 * (k + 1), CLEAR));
    expect(ev.inWayShed(7)).toBeCloseTo(0.35, 9);
    expect(ev.routeMet(7)).toBe(true);
    expect(ev.isHeld(7)).toBe(false);
    expect(ev.evidence(acct(0, 1.5), route, "J", 0, 0, LEFT_TURN_ONCOMING_RADIUS_M, 180)).toBeNull();
    // The twin: the same car, still coming at 5 m/s with the same in-the-way shed, IS evidence — only HELD was in question.
    const twin = new LeftTurnGiveWayEvidence(LEFT_TURN_FORCED_SHED_MPS, LEFT_TURN_MIN_CLOSING_MPS, LEFT_TURN_ONCOMING_MIN_DEG);
    twin.track(acct(5, 0), route, "J", 0, 0, LEFT_TURN_ONCOMING_RADIUS_M, CLEAR);
    twin.track(acct(5, 0.35), route, "J", 0, 0, LEFT_TURN_ONCOMING_RADIUS_M, ON);
    expect(twin.evidence(acct(5, 0.35), route, "J", 0, 0, LEFT_TURN_ONCOMING_RADIUS_M, 180)).toBe(7);
  });
});
