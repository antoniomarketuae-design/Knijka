/**
 * THE VEHICLE A SLOW LEFT-TURNER HAD TO GIVE WAY TO, AND MADE BRAKE — the
 * evidence half of the N1 tracker's forced-braking conviction at an ADDED-path
 * left commit (lane slowturn, sc-turn-left-oncoming:1613ef2c; integrator
 * ruling R13''' 2026-11-06, replacing the evidence rule of R13' / R13''; under
 * the founder's forced-braking rulings 2026-09-30 and 2026-10-05). The bill
 * itself, its constant and its scope are documented at
 * runtime/worldRuntime.ts LEFT_TURN_FORCED_SHED_MPS; this file decides WHICH
 * vehicle, if any, is that evidence.
 *
 * WHY THE ROUTE AND NOT THE HEADING. Rounds 4 and 5 read «the car he cut
 * across» from a car's heading and its closing on the node. Both rounds were
 * refuted on the same family: an oncoming LEFT-turner — heading opposite and
 * closing while still in its approach lane, then swinging away into the north
 * arm ≈ 20 m before his crossing — convicted a careful turner who had crossed
 * with a 5.7–8.0 s gap (verifier R13PP-LEFTTURNER-IN-APPROACH, round 5; R13P-
 * DEPARTING, round 4). A heading cannot say where a car will go; its route can.
 * So the vehicle is judged on the route the traffic model drives it on
 * (traffic/plannedRoute.ts, `TrafficSystem.plannedRouteThrough`).
 *
 * A VEHICLE IS EVIDENCE ONLY IF ALL HOLD (each from an existing fact; no new number):
 *  (1) A VEHICLE HE MUST GIVE WAY TO. Its planned route arrives at the node by
 *      the OPPOSITE approach — the lane it arrives by ends heading more than
 *      LEFT_TURN_ONCOMING_MIN_DEG (= traffic ONCOMING_MIN_DEG, 130°) off his
 *      approach heading frozen at the visit start — and its movement there is
 *      STRAIGHT or RIGHT (`turnSpeedCap`'s bands on its two lanes). ЗДвП чл. 37,
 *      ал. 1: «При завиване наляво за навлизане в друг път водачът на
 *      завиващото нерелсово пътно превозно средство е длъжен да пропусне
 *      насрещно движещите се пътни превозни средства» (content/law/acts/
 *      zdvp.json); the course's own reading of it, «пропускаш насрещно
 *      движещите се направо или надясно» (content/concepts.json
 *      c-left-turn-oncoming, lawRefs ЗДвП чл. 37). An oncoming LEFT-turner (or
 *      U-turner) is never evidence: its route turns away in front of him. It
 *      has not passed the node (the query is null once it is on the lane it
 *      leaves by) and it is APPROACHING now — R13'''s «approaches», read with
 *      R13'''s own arithmetic kept from R13'': its radial closing on the node
 *      is > 0 and the larger of the radial and the crossing-frame closing is ≥
 *      LEFT_TURN_MIN_CLOSING_MPS — or it is HELD for him (below).
 *  (2) ITS ROUTE CROSSES OR JOINS HIS PATH: the part of its planned route
 *      ACROSS the junction — from where it comes within the node's drawn
 *      junction open radius (traffic LaneGraph.junctionRadiusM, the mouth the
 *      model stops its cars at), through the box, and on along the lane it
 *      leaves by to the query's reach — met his body box on some grid point of
 *      its present approach (as (3)): the corridor his body swept on this turn, up to the commit.
 *      An oncoming straight car's crossing, an oncoming right-turner's join of
 *      his exit arm (R13PP-MERGE-FOLLOW, ruled: it counts, under (3)). Not
 *      «from where it leaves its lane line»: a straight-through pair on one
 *      road has no connector (graph.ts laneConnector: the lanes meet at the
 *      node), so that cut would put a crossing 2.4 m short of the node on its
 *      approach (measured on the R15 cut at 10 km/h, L2: 1000's route through
 *      sx-n-c is (−8.4, −4.1) → (0, −4.1) → (120, −4.1)).
 *  (3) THE SHED IS HIS, IN THIS APPROACH, WHILE HE WAS IN ITS WAY: its
 *      `playerShedMps` account grew by ≥ LEFT_TURN_FORCED_SHED_MPS over grid
 *      points on which his body box lay on its planned route AHEAD of it
 *      (between it and the node, across the junction, or on the lane it
 *      leaves by ahead of it) — only while its route arrives at this node (a
 *      grid point on which it does not — it has passed the node, or the node
 *      is beyond the reach — ends that approach and discards what it had).
 *      Shed accrued while he stood clear of its route never counts. HELD: a
 *      car is held for him when on some grid point of that approach its speed
 *      was below LEFT_TURN_MIN_CLOSING_MPS while its speed plus that in-the-way
 *      shed was at or above it (R13PP-OWN-STOP-HELD: a car whose shed accrued
 *      while he stood clear, and which then stopped at its own line, is not).
 *  (4) within LEFT_TURN_ONCOMING_RADIUS_M of the node (and its route arrives
 *      there within that reach).
 *
 * ON HIS ROUTE = his chassis box (collision/bodies.ts PLAYER_HALF_LENGTH_M ×
 * PLAYER_HALF_WIDTH_M, on his grid pose) within the vehicle's half body width
 * (`vehicleHalfWidthM(profile)`, carried on the row) of the route's centre-line
 * — the space the vehicle's body sweeps along its plan: there it could not go
 * on without striking him.
 *
 * ADR-014: everything is read on the grid point the runtime is grading — his
 * grid pose, the traffic system's accounts and routes as they stand at it. No
 * frame-end pose, no clock of its own. PURE apart from its own maps.
 */

/** One vehicle's planned route through a node — structural twin of traffic/types.ts PlannedRouteThroughNode (the runtime does not import traffic). */
export interface PlannedRouteRow {
  id: number;
  movement: "straight" | "right" | "left" | "uturn";
  approachDirX: number;
  approachDirY: number;
  halfWidthM: number;
  px: ArrayLike<number>;
  py: ArrayLike<number>;
  n: number;
  junctionRadiusM: number;
}
/** `TrafficSystem.plannedRouteThrough`, as the runtime is handed it. */
export type PlannedRouteQuery = (id: number, nodeId: string, reachM: number) => PlannedRouteRow | null;

/** The account row the tracker reads (runtime/reverseBrakedFor.ts ShedAccountRow's fields it needs). */
export interface GiveWayAccountRow {
  id: number;
  x: number;
  y: number;
  speedMps: number;
  playerShedMps: number;
  dirX?: number;
  dirY?: number;
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let u = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
}

function segsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const CORNER_X = new Float64Array(4);
const CORNER_Y = new Float64Array(4);

/**
 * The least distance, m, between an oriented box (centre, heading 0° = north
 * = +y, half length along it, half width across) and the polyline
 * (px, py)[from .. n−1]; 0 when they touch. Infinity for fewer than 2 points.
 */
export function boxPolylineClearanceM(
  cx: number,
  cy: number,
  headingDeg: number,
  halfLengthM: number,
  halfWidthM: number,
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  from: number,
  n: number,
): number {
  if (n - from < 2) return Infinity;
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  // right-of-travel normal
  const rx = fy;
  const ry = -fx;
  for (let k = 0; k < 4; k++) {
    const sl = k === 0 || k === 3 ? halfLengthM : -halfLengthM;
    const sw = k < 2 ? halfWidthM : -halfWidthM;
    CORNER_X[k] = cx + fx * sl + rx * sw;
    CORNER_Y[k] = cy + fy * sl + ry * sw;
  }
  let best = Infinity;
  for (let i = from; i < n - 1; i++) {
    const ax = px[i];
    const ay = py[i];
    const bx = px[i + 1];
    const by = py[i + 1];
    // an end inside the box
    for (const [qx, qy] of [
      [ax, ay],
      [bx, by],
    ]) {
      const ux = qx - cx;
      const uy = qy - cy;
      if (Math.abs(ux * fx + uy * fy) <= halfLengthM && Math.abs(ux * rx + uy * ry) <= halfWidthM) return 0;
    }
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      if (segsCross(ax, ay, bx, by, CORNER_X[k], CORNER_Y[k], CORNER_X[k2], CORNER_Y[k2])) return 0;
      const d = Math.min(
        pointSegDist(CORNER_X[k], CORNER_Y[k], ax, ay, bx, by),
        pointSegDist(ax, ay, CORNER_X[k], CORNER_Y[k], CORNER_X[k2], CORNER_Y[k2]),
        pointSegDist(bx, by, CORNER_X[k], CORNER_Y[k], CORNER_X[k2], CORNER_Y[k2]),
      );
      if (d < best) best = d;
    }
  }
  return best;
}

const ACROSS_X: number[] = [];
const ACROSS_Y: number[] = [];

/**
 * The route's part ACROSS the junction: from where it first comes within the
 * junction's open radius r of the node (nx, ny) — the entry point
 * interpolated on its segment — to its end. Written into the module's scratch
 * arrays (ACROSS_X/Y); returns the point count (0 when the route never comes
 * within r).
 */
export function routeAcross(px: ArrayLike<number>, py: ArrayLike<number>, n: number, nx: number, ny: number, r: number): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (m > 0) {
      ACROSS_X[m] = px[i];
      ACROSS_Y[m] = py[i];
      m++;
      continue;
    }
    const inside = Math.hypot(px[i] - nx, py[i] - ny) <= r;
    if (i === 0) {
      if (inside) {
        ACROSS_X[0] = px[0];
        ACROSS_Y[0] = py[0];
        m = 1;
      }
      continue;
    }
    // segment (i−1, i) with point i−1 outside: its first crossing into the circle
    const ax = px[i - 1] - nx;
    const ay = py[i - 1] - ny;
    const dx = px[i] - px[i - 1];
    const dy = py[i] - py[i - 1];
    const a = dx * dx + dy * dy;
    if (!(a > 0)) continue;
    const b = 2 * (ax * dx + ay * dy);
    const c = ax * ax + ay * ay - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const u = (-b - Math.sqrt(disc)) / (2 * a);
    if (u < 0 || u > 1) continue;
    ACROSS_X[0] = px[i - 1] + dx * u;
    ACROSS_Y[0] = py[i - 1] + dy * u;
    ACROSS_X[1] = px[i];
    ACROSS_Y[1] = py[i];
    m = 2;
  }
  return m;
}

/** His grid pose and chassis, as the tracker reads them. */
export interface GiveWayStudent {
  x: number;
  y: number;
  headingDeg: number;
  halfLengthM: number;
  halfWidthM: number;
}

/** Ruling R13''' (1)–(4) bookkeeping for one junction visit. */
export class LeftTurnGiveWayEvidence {
  /** Last account seen per vehicle in this visit (the per-grid-point growth is read against it). */
  private readonly lastShed = new Map<number, number>();
  /** (3): shed accrued while his body lay on its route ahead of it, in its present approach. */
  private readonly inWay = new Map<number, number>();
  /** (3) HELD: braked below the arrival floor by that in-the-way shed, in its present approach. */
  private readonly held = new Set<number>();
  /** (2): its route ACROSS the junction met his body on some grid point of this visit. */
  private readonly met = new Set<number>();

  constructor(
    private readonly shedLineMps: number,
    private readonly arrivalFloorMps: number,
    private readonly oncomingMinDeg: number,
  ) {}

  reset(): void {
    this.lastShed.clear();
    this.inWay.clear();
    this.held.clear();
    this.met.clear();
  }

  /** Once per graded grid point of a junction visit. */
  track(
    rows: readonly GiveWayAccountRow[],
    route: PlannedRouteQuery,
    nodeId: string,
    nx: number,
    ny: number,
    reachM: number,
    me: GiveWayStudent,
  ): void {
    const r2 = reachM * reachM;
    for (const row of rows) {
      const prev = this.lastShed.get(row.id);
      this.lastShed.set(row.id, row.playerShedMps);
      const growth = prev === undefined ? 0 : row.playerShedMps - prev;
      const dx = row.x - nx;
      const dy = row.y - ny;
      const plan = dx * dx + dy * dy <= r2 ? route(row.id, nodeId, reachM) : null;
      if (plan === null) {
        // Not approaching this node within reach: that approach is over (or not begun).
        this.inWay.delete(row.id);
        this.held.delete(row.id);
        this.met.delete(row.id);
        continue;
      }
      const clearAhead = boxPolylineClearanceM(me.x, me.y, me.headingDeg, me.halfLengthM, me.halfWidthM, plan.px, plan.py, 0, plan.n);
      const onRoute = clearAhead <= plan.halfWidthM;
      if (onRoute && !this.met.has(row.id)) {
        const m = routeAcross(plan.px, plan.py, plan.n, nx, ny, plan.junctionRadiusM);
        const clearAcross = boxPolylineClearanceM(me.x, me.y, me.headingDeg, me.halfLengthM, me.halfWidthM, ACROSS_X, ACROSS_Y, 0, m);
        if (clearAcross <= plan.halfWidthM) this.met.add(row.id);
      }
      let shed = this.inWay.get(row.id) ?? 0;
      if (growth > 0 && onRoute) {
        shed += growth;
        this.inWay.set(row.id, shed);
      }
      if (row.speedMps < this.arrivalFloorMps && row.speedMps + shed >= this.arrivalFloorMps) this.held.add(row.id);
    }
  }

  /**
   * At an ADDED-path left commit: the vehicle that is R13''' evidence, or null.
   * Call after `track` on the same grid point. `approachDeg` is his heading
   * frozen at the visit start.
   */
  evidence(
    rows: readonly GiveWayAccountRow[],
    route: PlannedRouteQuery,
    nodeId: string,
    nx: number,
    ny: number,
    reachM: number,
    approachDeg: number,
  ): number | null {
    const rad = (approachDeg * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fy = Math.cos(rad);
    for (const row of rows) {
      const shed = this.inWay.get(row.id);
      if (shed === undefined || shed < this.shedLineMps) continue; // (3)
      if (!this.met.has(row.id)) continue; // (2)
      const tx = nx - row.x;
      const ty = ny - row.y;
      const d2 = tx * tx + ty * ty;
      // (4) and «has not passed the node»: its route still arrives here within the reach (the query is null otherwise).
      const plan = route(row.id, nodeId, reachM);
      if (plan === null) continue;
      if (plan.movement !== "straight" && plan.movement !== "right") continue; // (1)
      const aBearing = (Math.atan2(plan.approachDirX, plan.approachDirY) * 180) / Math.PI;
      const off = Math.abs((((aBearing - approachDeg) % 360) + 540) % 360 - 180);
      if (!(off > this.oncomingMinDeg)) continue; // (1) the opposite approach
      if (this.held.has(row.id)) return row.id; // (1)/(3) held for him
      if (row.dirX === undefined || row.dirY === undefined) continue;
      const d = Math.sqrt(d2);
      const radial = d > 0 ? ((row.dirX * tx + row.dirY * ty) / d) * row.speedMps : row.speedMps;
      const inFrame = -(row.dirX * fx + row.dirY * fy) * row.speedMps;
      if (radial > 0 && Math.max(radial, inFrame) >= this.arrivalFloorMps) return row.id; // (1) approaching now
    }
    return null;
  }

  /** Diagnostics for probes and pins (never shown, read by no rule). */
  inWayShed(id: number): number | undefined {
    return this.inWay.get(id);
  }
  isHeld(id: number): boolean {
    return this.held.has(id);
  }
  routeMet(id: number): boolean {
    return this.met.has(id);
  }
}
