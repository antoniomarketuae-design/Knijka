/**
 * ONE FRAME, ONE CLOCK — how much time a render frame may hand the lesson.
 *
 * THE DEFECT THIS FILE EXISTS TO CLOSE (measured, PC, 2026-08-16). Chromium
 * 1440×900 @2 on staging, `sc-zebra-approach` L1, the ego camera's own
 * `matrixWorld` sampled per rendered frame: the PC render graph — three mirror
 * RTT passes, the chase rear-view camera and the N8AO+SMAA composer — costs
 * 2.33 s/frame at dsf1 and 3.57 s/frame at dsf2. On such a frame the scene ran
 * on THREE different clocks that only agree above 10 fps:
 *
 *   the car's body     `MathUtils.clamp(dt, 0, 0.5)`  → +0.500 s of world
 *   the lesson's clock `Math.min(delta, 0.1)`         → +0.100 s of lesson
 *   the cabin's timers the raw R3F delta              → +3.570 s of blinking
 *
 * The middle one was `LessonScene`'s RuntimeDriver, and it is the one that is
 * graded. `tRef` becomes `SimTick.t`, and `SimTick.t` is what the rule engine
 * differentiates speed over (`accelMps2`), what every sustain and lookback
 * window is counted in, what the scenario director is stepped with (`tSec` /
 * `dtSec`), what the attempt recorder timestamps, and what the engine
 * integrates distance with:
 *
 *   s.cleanDistanceM += (speed / 3.6) * Math.min(t - s.prevT, 2);   engine.ts
 *
 * So below 10 fps the engine was fed a car whose POSITION advanced five times
 * further than its own clock could explain, and it credited one fifth of the
 * road actually driven. At the measured 3.57 s/frame, 60 s of world time — 700 m
 * at 42 km/h, two CLEAN_DRIVING commendations — was booked as 12 s and 140 m,
 * and earned none. The duties measured in seconds paid the same fifth: the
 * give-way witness gate accumulates `stoppedForSec += input.dtSec` against
 * WITNESS_STOPPED_HOLD_SEC = 2.0 (orchestrator/runners.ts), so a genuine
 * two-second standstill at a Б2 was credited as 0.4 s and the objective
 * refused. That is a FALSE FAILURE manufactured by the frame rate, on exactly
 * the machines least able to afford one — and the answer is the clock, never
 * the gate. The duty is still two seconds; it is now two seconds of the world
 * the car is driving in.
 *
 * THE FIX IS NOT A NEW NUMBER. It is the removal of a second one: the lesson's
 * clock stops guessing and advances by precisely the world time the physics
 * integrated for the same frame. Above 10 fps nothing changes at all (both
 * clamps are inert, the advance is the raw delta, every recorded gate is
 * bit-identical); below it the two stop diverging.
 *
 * WHAT IS STILL SPLIT, AND WHOSE FILES IT IS IN. Two clamps of the same family
 * live outside this lane and are untouched: `traffic/system.ts` steps every NPC
 * car and staged pedestrian at MAX_DT_SEC = 0.1, and `VehicleRig`'s
 * `cabin.update(delta, …)` runs the blink/wiper/stall timers on the raw,
 * unclamped delta. On a sub-10-fps frame the world around the car therefore
 * still moves at a fifth of its pace while the indicator blinks at seven times
 * it. Both are one-line changes in files this wave does not own; neither is
 * made worse by this one (`traffic.update()` re-clamps to the same 0.1 it used
 * to be handed, so its behaviour here is bit-identical).
 *
 * WHY THE FILE SITS IN `lesson-ui/`. The clock belongs to the scene, and so
 * would a home under `modules/sim/*` — but those modules belong to other lanes
 * this wave, and a constant that must be unit-tested cannot live inside
 * `LessonScene.tsx` (importing that file into a Node test drags in R3F, rapier
 * wasm and the whole world). This lane owns `lesson-ui/`, `LessonScene.tsx` is
 * its only consumer, and `qualityChoice.ts` next door already establishes the
 * shape: the decision is a pure function with a test, not an expression at a
 * call site where nothing can check it.
 */

/**
 * The most world time a single render frame can ever produce.
 *
 * Not a preference and not a tuning knob — it is `@react-three/rapier`'s own
 * ceiling, read out of the shipped bundle:
 *
 *   const clampedDelta = three.MathUtils.clamp(dt, 0, 0.5);
 *   steppingState.accumulator += clampedDelta;
 *   while (steppingState.accumulator >= timeStep) { …stepWorld(timeStep)… }
 *
 * (`node_modules/@react-three/rapier/dist/react-three-rapier.cjs.dev.js`, the
 * `step` callback inside `<Physics>`.) Everything past half a second is
 * discarded before the accumulator ever sees it, which is why the measured
 * world/wall ratios landed on 0.5/frameTime: predicted 0.215 at 2.33 s against
 * 0.216 measured, predicted 0.140 at 3.57 s against 0.153 measured.
 *
 * `__tests__/sessionClock.test.ts` re-reads that literal out of the installed
 * package on every run, so a rapier upgrade that moves the ceiling cannot move
 * it behind this file's back.
 */
export const PHYSICS_MAX_FRAME_DT = 0.5;

/**
 * How far the lesson's own clock advances for a render frame of `deltaSec`.
 *
 * Identical to the clamp above by construction — that is the whole point, and
 * it is why the two arguments of `Math.min` are not written here as a pair of
 * independent numbers.
 *
 * THE NaN CASE IS NOT DEFENSIVE PADDING — IT IS THE SAME EQUALITY AGAIN, and it
 * was written the wrong way round first (this file's own test caught it).
 * rapier's clamp is `Math.max(0, Math.min(0.5, dt))`, so:
 *
 *   negative   → 0     — matched here by the same floor.
 *   Infinity   → 0.5   — the accumulator gains half a second and the world
 *                        really does step, so the lesson clock must gain it
 *                        too. Rejecting it "defensively" would have opened a
 *                        fresh split of exactly the kind this file closes.
 *   NaN        → NaN   — `accumulator += NaN` makes `accumulator >= timeStep`
 *                        false forever, so the world advances by NOTHING, this
 *                        frame and every frame after it. 0 is therefore the
 *                        honest match, and it is also the only value that keeps
 *                        `SimTick.t` a number: one NaN in `tRef` makes every
 *                        sustain window, lookback and scored comparison for the
 *                        rest of the session answer `false` in silence.
 */
export function sessionClockAdvance(deltaSec: number): number {
  if (Number.isNaN(deltaSec)) return 0;
  return Math.max(0, Math.min(PHYSICS_MAX_FRAME_DT, deltaSec));
}
