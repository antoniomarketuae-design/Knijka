/**
 * sc-roundabout-entry:7b747c15 round 8 (the round-7 verifier's condition C2) —
 * THE STUDENT'S ATTEMPT TRACE IS FED ON THE SESSION GRID.
 *
 * A scenario lesson records the student's own drive (traces/recorder.ts
 * `createTraceRecorder`, the S0-View attempt recorder). The trace is not only
 * something to watch afterwards: the rubric's OBSERVATION MOMENTS — the
 * «наблюдение n/m» row and the stars it feeds, a SHOWN score — are computed
 * from it after the drive (`finalizeLessonSession` →
 * lessons/scenario/observation.ts `parkingObservationFromTrace`): from the
 * gear of its samples (when the reverse phase began and ended) and from the
 * time and side of its `glance-…` events.
 *
 * Through round 7 the scene fed that recorder once per RENDER FRAME — the
 * frame's drawn chassis, the frame-end session clock, the frame's one-shot
 * glance — and the recorder decimates what it is fed to 20 Hz. So the trace,
 * and with it the scored moments, depended on the display: at 60 Hz the
 * reverse phase is known to a twentieth of a second, inside a phone's 0.5 s
 * frame to half a second, and a look was stamped with the end of the frame
 * that sampled it. The round-7 verifier's model of that feed on the committed
 * tapes: the observed-moment set differs from 60 Hz on 5 of 81 demos
 * (sc-park-perp-rev mistake-wide-approach and three more GAIN
 * obs-during-reverse on a phone's cadence; sc-park-gap-short
 * mistake-forward-hit LOSES it at 120 Hz).
 *
 * This function is that feed, and `GradeGrid` callers run it once per GRADED
 * GRID POINT, from the very student state the tick at that point was built
 * from:
 *
 *   · one sample per grid point, stamped k·FIXED_DT, the car where the physics
 *     step left it (not the frame's drawn chassis), the gear and indicator the
 *     grader read at that point — the recorder's own 20 Hz decimation then
 *     keeps the same grid points on every display;
 *   · a `glance-…` event at the grid point that HEARD the look (the tick that
 *     carries its `mirrorGlance` event), so the trace's looks are the graded
 *     looks, one for one, with the graded time;
 *   · `signal-on` / `signal-off` on the indicator's edges between grid points.
 *
 * It is one function so that the live lesson (LessonScene's `onPoint`) and the
 * replay harness (lessons/scenario/__tests__/liveChainReplay.ts) cannot feed
 * the recorder two different ways: the census of the scored moments runs this
 * code. It is handed the grid point's student and nothing of the frame's.
 *
 * WHAT IT DOES NOT MOVE. The steering angle and the two pedal flags are the
 * frame's (the controls are read once per frame; they are drawn in the replay
 * and scored by nothing). The trace's `driveline` events and the «втори замах»
 * annotation are still stamped by the scene with the frame-end clock — sparse
 * narration for the replay, read by no score.
 */

import type { VehicleSample } from "@/modules/sim/contracts";
import type { LiveTraceRecorder, LiveTraceSampleInput } from "@/modules/sim/traces";

/** What the feed writes into: the live ring recorder's two entry points. */
export type AttemptTraceSink = Pick<LiveTraceRecorder, "push" | "addEvent">;

/** The feed's own memory between grid points (one per drive). */
export interface AttemptFeedState {
  /** The indicator at the last point fed — `signal-on/off` are its edges. */
  indicator: LiveTraceSampleInput["indicator"];
  /** Scratch row handed to `push` (reused: the per-point path allocates nothing). */
  readonly row: LiveTraceSampleInput;
}

export function createAttemptFeedState(): AttemptFeedState {
  return {
    indicator: "off",
    row: {
      tSec: 0,
      x: 0,
      y: 0,
      headingDeg: 0,
      steerRad: 0,
      speedKmh: 0,
      gear: 0,
      indicator: "off",
      brakeOn: false,
      throttleOn: false,
    },
  };
}

/**
 * One graded grid point into the attempt trace. `tSec` and `student` are the
 * grid point's (`GradeGridPoint.tSec` / `.student` — the state the tick was
 * built from, its `mirrorGlance` the look that point heard); `steerRad`,
 * `brakeOn` and `throttleOn` are the frame's controls.
 */
export function feedAttemptPoint(
  recorder: AttemptTraceSink,
  state: AttemptFeedState,
  tSec: number,
  student: Readonly<VehicleSample>,
  steerRad: number,
  brakeOn: boolean,
  throttleOn: boolean,
): void {
  const row = state.row;
  row.tSec = tSec;
  row.x = student.position.x;
  row.y = student.position.y;
  row.headingDeg = student.headingDeg;
  row.steerRad = steerRad;
  row.speedKmh = student.speedKmh;
  row.gear = student.gear;
  row.indicator = student.indicator;
  row.brakeOn = brakeOn;
  row.throttleOn = throttleOn;
  recorder.push(row);
  // Sparse events: the look this point HEARD; indicator edges.
  if (student.mirrorGlance) recorder.addEvent(`glance-${student.mirrorGlance}`, tSec);
  if (student.indicator !== state.indicator) {
    state.indicator = student.indicator;
    if (student.indicator === "off") recorder.addEvent("signal-off", tSec);
    else recorder.addEvent("signal-on", tSec, undefined, student.indicator);
  }
}
