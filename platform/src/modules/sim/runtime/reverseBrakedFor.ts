/**
 * «A VEHICLE OR RIDER BEHIND HAS HAD TO SLOW FOR THIS REVERSING CAR» — the one
 * measurement the coach's reverse warning reads (lane rbreverse,
 * sc-roundabout-entry:9e85f27e).
 *
 * THE ROW. rig-w3b SC2 (59be0de): after striking the central island the
 * student reversed on the ring (≈ 4.3 km/h, 6.3 m) toward the staged
 * circulator, which braked from 2.9 m/s to a standstill about 1 m off his rear
 * bumper — and the coach said nothing about it.
 *
 * FOUNDER RULING Q2 (2026-10-19): WARN ONLY. Nothing here is graded: no rule
 * event, no points, no verdict, no debrief row. The result rides the tick as
 * `SimTick.reverseBrakedFor`; the lesson session folds it and only the
 * advisor card / peek read it (`lessons/advisor.ts reverseWarningForSession`).
 * `rules/__tests__/reverse-braked-for-not-graded.test.ts` pins every file under
 * rules/ blind to the field.
 *
 * THE TEST (integrator rulings R1, R5 as revised, R5'' 2026-11-04 — which
 * REPLACES R5' and removes its standstill baseline; no new number: every bound
 * below is an existing product number, mirrored because the runtime may not
 * import the hud or traffic modules, and pinned to its source in
 * `runtime/__tests__/reverse-braked-for.test.ts`):
 *
 *  · IN R — `SimTick.gear === −1`, the CONTRACT gear (the selector, mapped by
 *    `SampleBuilder.updateCabinChannels`), not the cosmetic VehicleSim
 *    readout, which is a function of speed and would dither as the speed
 *    test does. The R INTERVAL is a contiguous run of grid points in R.
 *  · REVERSING — signed speed < −0.8 km/h (`hud/rearProximity.ts
 *    REAR_CUE_REVERSING_KMH`, the rear badge's own «the car is going back»).
 *  · BEHIND — the vehicle's centre is in the car's rear half-plane (fwd < 0,
 *    `traffic/system.ts rearNearestFor`'s test, WITHOUT its 4 m corridor: on
 *    the row's frames the circulator is 50°–75° off the rear axis).
 *  · IT HAS HAD TO SLOW FOR HIM — EITHER
 *    (A) BRAKING FOR HIM NOW: its own `playerShedMps` account has grown by
 *        ≥ 0.3 m/s (the traffic model's braking line:
 *        `STAGED_BRAKE_LAMP_MARGIN_MPS`, the same 0.3 as
 *        `ROUNDABOUT_FORCED_SHED_MPS` and `OVERTAKE_BRAKED_SHED_MPS`) since the
 *        first grid point of the current R interval (the original R5); OR
 *    (B) STOPPED FOR HIM AND STILL STANDING: it is AT REST NOW — its speed
 *        at/below 0.5 m/s, the traffic model's own stopped bar
 *        (`traffic/staged.ts HOLD_LIT_SPEED_MPS`, «the actor counts as stopped
 *        at/below this», set to match the ambient fleet's `speed < 0.5` bar in
 *        vehicles.ts; it is the bar at which BOTH fleets light a standing
 *        car's brake lamps, and the bar staged.ts reads the student himself as
 *        STOPPED by) — AND its account has grown by ≥ 0.3 m/s since the start
 *        of the DRIVE (an account starts at 0 when its agent is made, so this
 *        is the account itself).
 *    R5''' (integrator, 2026-11-04 — the r3 verifier's V3-risk2-tail, no new
 *    number): «AT REST NOW» reads «AT REST AT ANY POINT OF THIS R INTERVAL».
 *    In Risk 2 the circulator, standing for him, starts moving off (0.56 m/s)
 *    while still beside him, and the warning dropped ~0.2 s before the
 *    contact; a vehicle that stood (at/below the stopped bar) on any grid point
 *    of the current R interval, with its drive account ≥ 0.3, keeps (B) for the
 *    rest of that interval. The «seen at rest» set lives exactly as long as
 *    (A)'s baseline: leaving R forgets both. The STALE vehicle stays silent — it
 *    drove off before R, so it never stood inside the interval.
 *    WHY (B): the plainest danger is reversing into a vehicle that has ALREADY
 *    stopped for the standing car. Measured: «Risk 2» (the car stands at the
 *    island, the circulator stops 3.2 m off it, then R) and the round-2
 *    verifier's NUDGE cell (the circulator stops for the halted car, the car
 *    creeps forward 0.3–0.5 m, stops, then reverses into it — COLLISION vehicle
 *    −10 at 71.98 on L1) — neither has any growth inside the R interval. WHY
 *    «at rest now»: a vehicle that slowed for him long ago and has since driven
 *    off (the verifier's STALE cell E1: 85 m behind, leaving) is no danger, and
 *    the warning must not name it. Neither half is keyed on a crash (R1).
 *  · RAISED on a grid point where all of it holds, for the NEAREST such
 *    vehicle; DROPPED on speed ≥ −0.8 or on leaving R; RE-RAISED inside the
 *    same R interval by the same test (a stop and a renewed reverse). (A)'s
 *    baseline lives exactly as long as its R interval: leaving R forgets it.
 *    There is no separation clause.
 *
 * WHAT IT CANNOT SEE (R9, recorded): a pedestrian has no account, so a person
 * on foot behind a reversing car never raises it — the look-first recovery
 * card and «Спри, ако някой идва» are his only cover.
 */
import type { ReverseBrakedFor } from "../rules/types";

/** The traffic model's braking line, m/s — mirrors `traffic/staged.ts
 *  STAGED_BRAKE_LAMP_MARGIN_MPS` (= ROUNDABOUT_FORCED_SHED_MPS =
 *  OVERTAKE_BRAKED_SHED_MPS = 0.3); pinned in the test. */
export const REVERSE_BRAKED_FOR_SHED_MPS = 0.3;
/** «Reversing», km/h — mirrors `hud/rearProximity.ts REAR_CUE_REVERSING_KMH`. */
export const REVERSE_BRAKED_FOR_REVERSING_KMH = -0.8;
/** A vehicle is «at rest» at/below this speed, m/s — mirrors `traffic/staged.ts
 *  HOLD_LIT_SPEED_MPS`, the traffic model's stopped bar; pinned in the test. */
export const REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS = 0.5;

/** One vehicle's account as the query returns it (`TrafficSystem.playerShedAccounts`). */
export interface ShedAccountRow {
  readonly id: number;
  readonly kind: "vehicle" | "cyclist";
  readonly x: number;
  readonly y: number;
  readonly playerShedMps: number;
  /** The vehicle's own speed, m/s. */
  readonly speedMps: number;
}

/** The runtime's account query — `traffic.playerShedAccounts()`. Pure. */
export type PlayerShedAccountsQuery = () => readonly ShedAccountRow[];

/** The car on one graded grid point. */
export interface ReverseBrakedForCar {
  /** `SimTick.gear` (−1 = R). */
  gear: number;
  /** Signed, km/h (< 0 travelling backward). */
  speedKmh: number;
  x: number;
  y: number;
  headingDeg: number;
}

function snapshot(rows: readonly ShedAccountRow[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.id, r.playerShedMps);
  return m;
}

/**
 * Has this vehicle had to slow for the car — (A) or (B) of the test above?
 * `rBase` is the accounts at the R interval's first point.
 */
export function hasSlowedFor(r: ShedAccountRow, rBase: ReadonlyMap<number, number>, seenAtRestInR?: ReadonlySet<number>): boolean {
  // (A) A vehicle absent from the baseline was not there to have an account:
  // all of its account is since (agents start at 0).
  const grownInR = r.playerShedMps - (rBase.get(r.id) ?? 0);
  if (grownInR >= REVERSE_BRAKED_FOR_SHED_MPS) return true;
  // (B) at rest now — or (R5''') at rest on some point of this R interval — and stopped at least in part for
  // him (the account is the drive's).
  const atRest = Math.abs(r.speedMps) <= REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS || (seenAtRestInR?.has(r.id) ?? false);
  return atRest && r.playerShedMps >= REVERSE_BRAKED_FOR_SHED_MPS;
}

/**
 * The per-session state of the measurement: the R interval's baseline. One
 * instance per world runtime (a runtime is one drive).
 */
export class ReverseBrakedForTracker {
  /** The R interval's baseline; null outside R. */
  private rBase: Map<number, number> | null = null;
  /** R5''': the ids seen at rest on some point of the current R interval; cleared with the baseline. */
  private seenAtRestInR = new Set<number>();

  /** One graded grid point. Returns the tick's value (`null` = nobody). */
  step(car: ReverseBrakedForCar, query: PlayerShedAccountsQuery): ReverseBrakedFor | null {
    if (car.gear !== -1) {
      this.rBase = null;
      this.seenAtRestInR.clear();
      return null;
    }
    if (this.rBase === null) this.rBase = snapshot(query());
    // R5''': every point of the R interval, reversing or not.
    for (const r of query()) if (Math.abs(r.speedMps) <= REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS) this.seenAtRestInR.add(r.id);

    if (!(car.speedKmh < REVERSE_BRAKED_FOR_REVERSING_KMH)) return null;

    const rad = (car.headingDeg * Math.PI) / 180;
    const fx = Math.sin(rad); // forward x (0° = north = +y)
    const fy = Math.cos(rad);
    let best: ReverseBrakedFor | null = null;
    let bestD = Infinity;
    for (const r of query()) {
      const rx = r.x - car.x;
      const ry = r.y - car.y;
      const fwd = rx * fx + ry * fy;
      if (!(fwd < 0)) continue; // not in the rear half-plane
      if (!hasSlowedFor(r, this.rBase, this.seenAtRestInR)) continue;
      const d = Math.hypot(rx, ry);
      if (d < bestD) {
        bestD = d;
        best = { vehicleId: r.id, kind: r.kind, fwdM: fwd, leftM: rx * -fy + ry * fx };
      }
    }
    return best;
  }
}
