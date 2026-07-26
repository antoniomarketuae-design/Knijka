/**
 * Dual-ghost comparison — the student's line against the correct one
 * (doc 82 §5.3 I3).
 *
 * „Ти караше по-бързо" is a verdict. „Ето къде правилната кола вече спираше, а
 * ти още не беше" is a lesson, and it needs both cars on the SAME clock. The
 * scene already mounts two ghosts on independent clocks; what was missing is
 * the math that says how far apart they were, second by second, and where the
 * gap opened.
 *
 * Pure: no React, no canvas, no three.js. Interpolation is NOT reimplemented —
 * `sampleAt` comes from the sim traces barrel, the same code the 3D ghost
 * player runs, so the divergence strip can never drift from what is drawn
 * (exactly the rule mistakeReplayCore follows).
 *
 * TWO HONESTY RULES, both from the doc's own risk note, both enforced here:
 *
 *  1. There is not ONE correct line. The authored shadow is *едно правилно
 *     решение*, not the only one, so this module reports a DISTANCE, never a
 *     score, and never a "correctness". Nothing here feeds grading — the rule
 *     engine convicts, and it does so from events, not from geometry.
 *  2. A template with no recorded shadow trace must degrade visibly rather
 *     than silently compare the student against nothing. `divergenceSeries`
 *     over a missing shadow is not called; the caller renders the single-ghost
 *     reel and says so.
 */

import { createTracePoint, sampleAt, type ScenarioTrace } from "@/modules/sim/traces";

/**
 * Sample rate of the divergence strip, Hz. Matches the live FollowHintProbe's
 * ~4 Hz: fast enough that a two-second hesitation is visible as its own
 * feature, slow enough that a 300 s drive is 1,200 points rather than 6,000 —
 * this is drawn on a phone, next to two animating cars.
 */
export const DIVERGENCE_SAMPLE_HZ = 4;

export interface DivergencePoint {
  tSec: number;
  /** Straight-line distance between the two cars at this instant, meters. */
  gapM: number;
  /** attempt − shadow, km/h. Positive = the student was going faster. */
  speedDeltaKmh: number;
}

export interface DivergenceSeries {
  points: DivergencePoint[];
  /** Longest time both traces actually cover — see pairedDurationSec. */
  durationSec: number;
  /** Largest gapM in the series; 0 for an empty series. */
  maxGapM: number;
  /** tSec of that largest gap; null for an empty series. */
  maxGapAtSec: number | null;
}

/**
 * How long the two ghosts can honestly be compared for.
 *
 * The SHORTER of the two durations, deliberately. A student who parked in 40 s
 * against a 55 s shadow has not "diverged by 15 s" — they simply finished, and
 * extending the comparison would sample the shadow against the student's last
 * held position and draw a growing gap that describes nothing. Playback may
 * run to the longer trace; the STRIP stops where the comparison stops.
 */
export function pairedDurationSec(a: ScenarioTrace, b: ScenarioTrace): number {
  return Math.max(0, Math.min(a.meta.durationSec, b.meta.durationSec));
}

/**
 * Sample the distance between the two drives on one shared clock.
 *
 * Both cars are read through `sampleAt`, so the numbers here are the same
 * interpolation the renderer draws — a strip that disagreed with the picture
 * would be worse than no strip.
 */
export function divergenceSeries(
  attempt: ScenarioTrace,
  shadow: ScenarioTrace,
  hz: number = DIVERGENCE_SAMPLE_HZ,
): DivergenceSeries {
  const durationSec = pairedDurationSec(attempt, shadow);
  const step = 1 / Math.max(1, hz);
  const a = createTracePoint();
  const s = createTracePoint();

  const points: DivergencePoint[] = [];
  let maxGapM = 0;
  let maxGapAtSec: number | null = null;

  // `<= durationSec + eps` so the final instant is always sampled: the last
  // moment of a maneuver is the one the student is being shown.
  for (let t = 0; t <= durationSec + 1e-9; t += step) {
    const tSec = Math.min(t, durationSec);
    sampleAt(attempt, tSec, a);
    sampleAt(shadow, tSec, s);
    const dx = a.x - s.x;
    const dy = a.y - s.y;
    const gapM = Math.hypot(dx, dy);
    points.push({ tSec, gapM, speedDeltaKmh: a.speedKmh - s.speedKmh });
    if (gapM > maxGapM) {
      maxGapM = gapM;
      maxGapAtSec = tSec;
    }
    if (tSec >= durationSec) break;
  }

  return { points, durationSec, maxGapM, maxGapAtSec };
}

/**
 * Gap at which the two drives stop being the same manoeuvre, meters.
 *
 * Half a lane at the shipped perceptual road scale. Below this the pair is
 * "the same line, driven differently" — a metre of lateral offset is normal
 * variation and calling it out would teach students to trace a ghost rather
 * than read the road. Above it, the two cars are somewhere different, which is
 * the only claim this module is willing to make.
 */
export const DIVERGENCE_NOTABLE_GAP_M = 4;

/**
 * The moment worth jumping to: the first sustained excursion past
 * DIVERGENCE_NOTABLE_GAP_M, not the peak.
 *
 * The peak is usually the CONSEQUENCE — a car that took the wrong lane is
 * furthest from the shadow long after the decision. The student needs the
 * instant the lines parted, which is where the choice was made. `holdSec`
 * exists so a single noisy sample (a scrub through a tight turn) cannot claim
 * to be a decision.
 */
export function firstDivergenceSec(
  series: DivergenceSeries,
  gapM: number = DIVERGENCE_NOTABLE_GAP_M,
  holdSec = 1,
): number | null {
  const { points } = series;
  let runStart: number | null = null;
  for (const p of points) {
    if (p.gapM >= gapM) {
      if (runStart === null) runStart = p.tSec;
      if (p.tSec - runStart >= holdSec) return runStart;
    } else {
      runStart = null;
    }
  }
  return null;
}
