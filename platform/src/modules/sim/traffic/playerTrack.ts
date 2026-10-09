/**
 * sc-roundabout-entry:7b747c15 round 2 (verifier condition C1) — a reusable,
 * allocation-free `PlayerStepTrack`: the student's car as the vehicle
 * simulation integrated it, one sample per physics step, for ONE frame.
 *
 * It is filled today only by a caller that hands `traffic.update` a frame
 * longer than one step together with the car's states inside it (the traffic
 * clock's unit tests). The LIVE lesson and the replay harness no longer
 * hand the traffic system a per-frame track: since round 4 the whole graded
 * chain runs once per session grid point (scene/gradeGrid.ts), and the live
 * lesson reads the car's own state at that point from
 * `PlayerStepTrackRecorder` below.
 */

import type { PlayerStepTrack } from "./types";

/** A 0.5 s frame (rapier's ceiling) holds 30 steps of 1/60 s; room to spare. */
const TRACK_CAPACITY = 64;
/** The recorder's step ring — two 0.5 s frames of steps. */
const STEP_RING = TRACK_CAPACITY;

export class PlayerStepTrackBuffer implements PlayerStepTrack {
  count = 0;
  readonly tSec = new Float64Array(TRACK_CAPACITY);
  readonly x = new Float64Array(TRACK_CAPACITY);
  readonly y = new Float64Array(TRACK_CAPACITY);
  readonly speedKmh = new Float64Array(TRACK_CAPACITY);
  readonly headingDeg = new Float64Array(TRACK_CAPACITY);

  clear(): void {
    this.count = 0;
  }

  /** Append one physics step's state. When full, the OLDEST sample is
   *  dropped (a stalled tab can step more often than a frame is read). */
  push(tSec: number, x: number, y: number, speedKmh: number, headingDeg: number): void {
    if (this.count === TRACK_CAPACITY) {
      this.tSec.copyWithin(0, 1);
      this.x.copyWithin(0, 1);
      this.y.copyWithin(0, 1);
      this.speedKmh.copyWithin(0, 1);
      this.headingDeg.copyWithin(0, 1);
      this.count--;
    }
    const k = this.count++;
    this.tSec[k] = tSec;
    this.x[k] = x;
    this.y[k] = y;
    this.speedKmh[k] = speedKmh;
    this.headingDeg[k] = headingDeg;
  }
}

/** One physics step's state of the student's car, in district space. */
export interface PhysicsStepState {
  x: number;
  y: number;
  speedKmh: number;
  headingDeg: number;
}

/**
 * ROUND 5 — what drives the live lesson's session grid: the physics engine's
 * own steps, counted, each with the state it left the car in. Grid point k of
 * a live session IS step k of this source (scene/gradeGrid.ts `stepPhysics`).
 */
export interface PhysicsStepSource {
  /** Steps recorded since the source was made. Never decreases. */
  readonly stepCount: number;
  /** The car after its `n`-th step (1-based) into `out`; false (and `out`
   *  untouched) when that step is not held (not taken yet, or older than the
   *  ring). */
  stateAtStep(n: number, out: PhysicsStepState): boolean;
}

/** A source that never steps: nothing is graded against it. */
export const NO_PHYSICS_STEPS: PhysicsStepSource = {
  stepCount: 0,
  stateAtStep: () => false,
};

/**
 * The live lesson's step recorder. `record` runs after every rapier step
 * (VehicleRig `useAfterPhysicsStep`); the frame loop (LessonScene's
 * RuntimeDriver, through `GradeGrid.stepPhysics`) then grades one session
 * grid point per recorded step, reading the car AT that step.
 *
 * ROUND 5 — ONE CLOCK. Steps are numbered 1, 2, 3 … for the life of the
 * recorder and the number IS the grid index: nothing is pinned to the session
 * time, nothing is ever re-pinned. Round 4 derived the grid index from the
 * session time and mapped it onto the step number through an offset it
 * `syncGrid`-ed once and then only LOWERED; its verifier showed, in a model of
 * the live wiring, that the lowering graded one state twice and read the car
 * one step stale for the rest of the session (grid point 5 at 144 Hz; 8.35 s in
 * on a 59.88 Hz display), and that one repeated state inside a following
 * episode flips FOLLOWING_TOO_CLOSE on 5 of 14 cells. A respawn does not
 * renumber either: the session clock — and so the grid — runs on through a
 * retry, and the state a step left is where the car was, teleport or not.
 */
export class PlayerStepTrackRecorder implements PhysicsStepSource {
  private readonly ring = new PlayerStepTrackBuffer();
  private ringCount = 0;
  private stepsRecorded = 0;

  get stepCount(): number {
    return this.stepsRecorded;
  }

  record(x: number, y: number, speedKmh: number, headingDeg: number): void {
    const slot = this.stepsRecorded % STEP_RING;
    this.ring.x[slot] = x;
    this.ring.y[slot] = y;
    this.ring.speedKmh[slot] = speedKmh;
    this.ring.headingDeg[slot] = headingDeg;
    this.stepsRecorded++;
    if (this.ringCount < STEP_RING) this.ringCount++;
  }

  stateAtStep(n: number, out: PhysicsStepState): boolean {
    if (!(n >= 1) || n > this.stepsRecorded || n <= this.stepsRecorded - this.ringCount) return false;
    const slot = (n - 1) % STEP_RING;
    out.x = this.ring.x[slot];
    out.y = this.ring.y[slot];
    out.speedKmh = this.ring.speedKmh[slot];
    out.headingDeg = this.ring.headingDeg[slot];
    return true;
  }
}

/** The physics engine's rigid body, as far as the step record reads it
 *  (structural: @react-three/rapier carries its own nested rapier copy). */
export interface PhysicsStepBody {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
}

/** The vehicle simulation, as far as the step record reads it. */
export interface PhysicsStepSim {
  readonly speedKmh: number;
}

/**
 * ROUND 7 — THE AFTER-STEP READ, AS A FUNCTION OF THE BODY AND THE SIM ONLY.
 *
 * The car's state at every graded grid point comes from ONE place: what is
 * recorded after each physics step. Through round 6 that read lived in
 * VehicleRig's `useAfterPhysicsStep` closure, beside `sampleRef` (the frame's
 * drawn pose), and its only pin was the TEXT of the `rec.record(…)` line — so
 * a rig that filled `t` from `sampleRef.current`, or took the speed from the
 * sample through a local named `sim`, passed every test with that line
 * untouched (the round-6 verifier's RECALIAS / RECSPEED: on a 0.25/0.4 s
 * cadence 3,699 of 3,899 graded points then repeat the previous car state).
 *
 * So the read is here, where there is no frame sample to read: this function
 * is handed the rapier body and the vehicle sim and nothing else, and
 * VehicleRig's callback is this one call. District space (x = world x, y =
 * −world z), heading 0 = north, clockwise — `scene/vehicleSample.ts`'s own
 * mapping, from the body's rotation instead of the drawn group's.
 *
 * A null `rec`, `body` or `sim` (a rig mid-mount, or no recorder handed in)
 * records nothing and returns false.
 */
export function recordPhysicsStep(
  rec: Pick<PlayerStepTrackRecorder, "record"> | null | undefined,
  body: PhysicsStepBody | null | undefined,
  sim: PhysicsStepSim | null | undefined,
): boolean {
  if (!rec || !body || !sim) return false;
  const t = body.translation();
  const q = body.rotation();
  // Forward (0, 0, 1) rotated by q: x = 2(xz + wy), z = 1 − 2(x² + y²).
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const headingDeg = ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
  rec.record(t.x, -t.z, sim.speedKmh, headingDeg);
  return true;
}
