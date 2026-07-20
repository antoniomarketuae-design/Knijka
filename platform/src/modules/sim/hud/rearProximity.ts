/**
 * Rear-proximity cue — pure logic for the „Кола отзад · X м" HUD badge
 * (PROX; doc 62 S5 — a graded action must have an information payoff, and
 * this badge is the universal rear-awareness fallback every camera mode and
 * quality preset gets for free).
 *
 * HONESTY CONTRACT (doc 62 #39/#48 — false warnings burned the founder's
 * trust): the cue exists ONLY while traffic.rearGapMeters() reports a REAL
 * vehicle in the corridor behind (a finite gap). Infinity — the no-vehicle
 * report — maps to null in EVERY state, including mid-display: the badge can
 * never linger and never guess.
 *
 * Severity ramp (spec): neutral above 8 m, amber under 8 m, red under 4 m
 * while MOVING (a car parked on your bumper at a light is normal city life —
 * red is reserved for tailgating at speed). 1 m of exit hysteresis at the
 * outer edge keeps the 5 Hz poll from flickering the badge at the boundary.
 *
 * Perf grammar: stepRearCue returns the PREVIOUS snapshot identity whenever
 * nothing visible changed, so the component's setState bails out — the badge
 * re-renders only on real level/meter edges, never at the poll rate.
 */

/** A vehicle behind within this many bumper meters raises the badge. */
export const REAR_CUE_RANGE_M = 15;
/** A raised badge drops only past this (1 m exit hysteresis, no flicker). */
export const REAR_CUE_EXIT_M = 16;
/** Amber under this gap, m. */
export const REAR_CUE_WARN_M = 8;
/** Red under this gap, m — while moving only. */
export const REAR_CUE_DANGER_M = 4;
/** At/above this |speed| the player counts as moving for the red band, km/h. */
export const REAR_CUE_MOVING_KMH = 5;

export type RearCueLevel = "info" | "warn" | "danger";

export interface RearCue {
  level: RearCueLevel;
  /** Whole display meters (rounded, never negative). */
  meters: number;
}

/**
 * Fold one 5 Hz poll into the cue state. `gapM` is the traffic system's
 * rearGapMeters read (Infinity = no vehicle behind — REAL geometry only).
 * Returns null (no badge), the unchanged `prev` identity, or a new snapshot.
 */
export function stepRearCue(
  prev: RearCue | null,
  gapM: number,
  speedKmh: number,
): RearCue | null {
  // The honesty contract: no vehicle reported ⇒ no badge, from ANY state.
  if (!Number.isFinite(gapM)) return null;
  const limit = prev !== null ? REAR_CUE_EXIT_M : REAR_CUE_RANGE_M;
  if (gapM > limit) return null;
  const level: RearCueLevel =
    gapM < REAR_CUE_DANGER_M && Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH
      ? "danger"
      : gapM < REAR_CUE_WARN_M
        ? "warn"
        : "info";
  const meters = Math.max(0, Math.round(gapM));
  if (prev !== null && prev.level === level && prev.meters === meters) return prev;
  return { level, meters };
}

/** Badge copy (BG). */
export function rearCueLabelBg(cue: RearCue): string {
  return `Кола отзад · ${cue.meters} м`;
}
