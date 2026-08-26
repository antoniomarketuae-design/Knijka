/**
 * Following-gap cue — pure logic for the „Дистанция · 34 м · 1,2 с" HUD badge,
 * the FRONT twin of `rearProximity.ts`.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * THE FINDING, `sc-fo-motorway-gap:76cde422`, CRITICAL, re-verified on the w11
 * re-drive: „the two-second following distance the lesson exists to teach is
 * never measured — no frame reports a gap in metres or seconds", across all 74
 * frames of two fresh legs. The verifier's own note names what the product
 * showed instead: the briefing quotes «дръж 2 секунди до предния: при тази
 * скорост това са над 70 метра» as PROSE, and at the moment of the rear-end
 * the HUD carries a speed, a governor cap and a fault card — and no gap.
 *
 * AND THE MEASUREMENT WAS ALREADY THERE. `traffic.leadGapMeters` has fed
 * `SimTick.leadGapM` for the whole life of the rule engine, and
 * `rules/engine.ts` grades three separate faults off it (FOLLOWING_TOO_CLOSE,
 * CLOSING_ON_LEAD_TOO_FAST, FOLLOWING_TOO_CLOSE_FOR_RAIN). What the product
 * had was a number it convicts a student with and never shows him — the exact
 * inverse of the dead-predicate class this audit keeps finding, and worse for
 * the student, because a lesson whose whole subject is a distance is asking him
 * to estimate by eye the one quantity the cockpit could simply tell him.
 * A rear-view mirror already gets that treatment: «Кола отзад · 5 м» renders
 * today off `rearGapMeters`, which is a HUD-ONLY channel nothing grades.
 *
 * ── THE ONE RULE THIS FILE OBEYS: THE BADGE AND THE GRADER READ ONE NUMBER ──
 *
 * A gauge that says „fine" while the engine bills, or „short" while the engine
 * is silent, is worse than no gauge — it is the product disagreeing with
 * itself, which is the failure `StatusDashboard`'s governor mark and
 * `dashboardStatus`'s weather vocabulary both exist to prevent. So the badge
 * takes no thresholds of its own: `FollowGapTarget` below is assembled by the
 * caller out of the LESSON'S OWN `RuleEngineConfig` (`lesson.ruleConfig`
 * merged over `DEFAULT_RULE_CONFIG`), and the severity ramp is literally the
 * `tailgating` predicate of `rules/engine.ts` minus its two TIME guards.
 *
 * WHICH TWO, AND WHY DROPPING THEM IS HONEST RATHER THAN CONVENIENT. The
 * engine's predicate is `moving && speed ≥ followMinSpeedKmh && gap <
 * safeGap × followFireRatio && gapOpening < followRecoveryRateMps`, stepped
 * through `followSustainSec`. `followSustainSec` and `followRecoveryRateMps`
 * are answers to „should this be BILLED YET" — hold it for two seconds, and
 * not while the driver is already re-opening a gap somebody cut into. Neither
 * is an answer to „how much room is there right now", which is the only
 * question a gauge asks. The badge therefore goes red the instant the gap
 * enters the billing band and does not wait out the sustain: a warning that
 * arrives only after the fault is booked is a scoreboard, not an instrument.
 *
 * ── WHAT THE BADGE MAY NEVER DO ────────────────────────────────────────────
 *
 * THE HONESTY CONTRACT, inherited verbatim from `rearProximity.ts`: the cue
 * exists ONLY while `leadGapMeters` reports a REAL vehicle in the corridor
 * ahead (a finite gap). Infinity — the empty-road report — maps to null in
 * EVERY state, including mid-display, so the badge can never linger and never
 * guess. `leadGapMeters` is geometry over `traffic.vehicles`, which is where
 * both the ambient agents and the STAGED actors publish, so the lead car a
 * following lesson stages is exactly what this reads.
 *
 * NO BARE VERDICT (доc 64 THEO-4). When the reading is short the label carries
 * the number the student must reach — «нужни 1,8 с» — because a red pill
 * saying only „1,0 с" tells him he is wrong and not what right would be. The
 * target is the lesson's own, so a rain-aware following drill shows «нужни
 * 2,9 с» and a dry one shows «нужни 1,8 с» without either being retyped here.
 *
 * SECONDS ARE WITHHELD RATHER THAN FAKED below `FOLLOW_CUE_MIN_SPEED_KMH`. A
 * time-gap is `metres ÷ speed`, so at 3 km/h it is a number that doubles when
 * the car slows by 1 km/h and reads „14 с" at two metres of air — the quantity
 * stops being about following and starts being about arithmetic. In that band
 * the badge shows metres alone, which is also the quantity ЗДвП and the
 * catalogue use there: «Твърде малка дистанция при спиране в колона … това са
 * около два метра» is a metre rule about a STOPPED queue, and чл. 23 ал. 1
 * governs „движещото се пред него" — a moving car — and nothing else.
 *
 * PERF GRAMMAR, inherited: `stepFollowCue` returns the PREVIOUS snapshot
 * identity whenever nothing visible changed, so the component's setState bails
 * out and the badge re-renders on real edges only, never at the poll rate.
 * Everything displayed is therefore held as an INTEGER (whole metres, whole
 * tenths of a second) — a float compare against a live rapier-derived speed
 * would never be equal twice and the bail-out would never fire.
 */

/**
 * Widest time-gap that still counts as FOLLOWING somebody, s.
 *
 * Speed-relative on purpose, and this is the constant a metre range would have
 * got wrong in exactly the lesson the finding was filed on: the badge has to be
 * up at 140 km/h with 70 m of air (`sc-fo-motorway-gap`'s own briefing number)
 * and must NOT be up in town with a car 70 m away that nobody is following.
 * 4 s is двойно the taught 1,8 s, so a student who is holding a generous gap
 * still sees the number he is holding — the payoff for doing it right, which
 * doc 62 S5 asks of every graded act.
 */
export const FOLLOW_CUE_RANGE_SEC = 4;
/** A raised badge drops only past this (0,6 s exit hysteresis, no flicker). */
export const FOLLOW_CUE_EXIT_SEC = 4.6;
/**
 * …and a METRE floor, because the time-gap alone goes blind exactly where the
 * queue rules live: at 6 km/h a car 12 m ahead is 7,2 s away and would fall
 * outside the band above, while being the one car the student is stuck behind.
 * 25 m is the range in which the stationary-queue teaching applies at all.
 */
export const FOLLOW_CUE_RANGE_M = 25;
/** The metre floor's own exit hysteresis, m. */
export const FOLLOW_CUE_EXIT_M = 30;
/**
 * Below this speed the badge shows METRES ONLY — see „SECONDS ARE WITHHELD"
 * in the header. km/h.
 */
export const FOLLOW_CUE_MIN_SPEED_KMH = 8;

export type FollowCueLevel = "info" | "warn" | "danger";

/**
 * The grader's own following thresholds, handed in rather than duplicated.
 * Every field is a `RuleEngineConfig` field of the same name; the caller
 * assembles them with `followGapTarget()` below so the merge with
 * `lesson.ruleConfig` happens in exactly one place.
 */
export interface FollowGapTarget {
  /** `followSafeSeconds`, already scaled when the lesson's rain-aware
   *  detector is armed AND it is raining (see `followGapTarget`). */
  safeSeconds: number;
  /** `followMinGapM` — the metre floor the grader's safe gap never goes under. */
  minGapM: number;
  /** `followFireRatio` — under this fraction of the safe gap the grader bills. */
  fireRatio: number;
  /** `followMinSpeedKmh` — below this the base detector is muted, so the badge
   *  raises no colour it could not justify. */
  minSpeedKmh: number;
}

export interface FollowCue {
  level: FollowCueLevel;
  /** Whole display metres (rounded, never negative). */
  meters: number;
  /** Time-gap in whole TENTHS of a second, or null below the speed floor. */
  deciSeconds: number | null;
  /** The taught target this reading is judged against, whole tenths of a s. */
  targetDeciSeconds: number;
}

/**
 * Assemble the badge's target from the lesson's effective rule config.
 *
 * `raining` alone is not enough and that is the whole reason this is a
 * function: `followRainAwareEnabled` ships OFF and lessons opt in
 * (`rules/types.ts`: „the exam-bot never widens its time-gap in rain, so a
 * default-on grade would flag its innocent rainy drives"). A badge that
 * demanded 2,9 s on a rainy lesson whose engine grades at 1,8 s would be the
 * disagreement this file exists to prevent, in the direction that scolds a
 * student for something nothing is measuring.
 */
export function followGapTarget(
  cfg: {
    followSafeSeconds: number;
    followMinGapM: number;
    followFireRatio: number;
    followMinSpeedKmh: number;
    followRainAwareEnabled: boolean;
    followRainSecondsFactor: number;
  },
  raining: boolean,
): FollowGapTarget {
  const wet = raining && cfg.followRainAwareEnabled;
  return {
    safeSeconds: cfg.followSafeSeconds * (wet ? cfg.followRainSecondsFactor : 1),
    minGapM: cfg.followMinGapM,
    fireRatio: cfg.followFireRatio,
    minSpeedKmh: cfg.followMinSpeedKmh,
  };
}

/**
 * Fold one 5 Hz poll into the cue state. `gapM` is the traffic system's
 * `leadGapMeters` read (Infinity = no vehicle ahead — REAL geometry only).
 * Returns null (no badge), the unchanged `prev` identity, or a new snapshot.
 */
export function stepFollowCue(
  prev: FollowCue | null,
  gapM: number,
  speedKmh: number,
  target: FollowGapTarget,
): FollowCue | null {
  // The honesty contract: no vehicle reported ⇒ no badge, from ANY state.
  if (!Number.isFinite(gapM) || gapM < 0) return null;

  // Reversing is not following; `speedKmh` is signed (VehicleSim), and a car
  // backing away from the vehicle in front is not closing on it.
  const speed = Math.max(0, speedKmh);
  const mps = speed / 3.6;
  const seconds = mps > 0.05 ? gapM / mps : Number.POSITIVE_INFINITY;

  const secLimit = prev !== null ? FOLLOW_CUE_EXIT_SEC : FOLLOW_CUE_RANGE_SEC;
  const metreLimit = prev !== null ? FOLLOW_CUE_EXIT_M : FOLLOW_CUE_RANGE_M;
  if (seconds > secLimit && gapM > metreLimit) return null;

  // The grader's own safe gap, to the metre — `rules/engine.ts`:
  //   safeGapM = max(followMinGapM, (speed / 3.6) * followSafeSeconds)
  const safeGapM = Math.max(target.minGapM, mps * target.safeSeconds);
  // …and its own arming gate. Below `followMinSpeedKmh` the base detector is
  // muted (queue traffic rolls in formation with short gaps), so the badge
  // stays neutral there rather than painting a red nothing can justify.
  const graded = speed >= target.minSpeedKmh;
  const level: FollowCueLevel =
    graded && gapM < safeGapM * target.fireRatio
      ? "danger"
      : graded && gapM < safeGapM
        ? "warn"
        : "info";

  const meters = Math.max(0, Math.round(gapM));
  const deciSeconds =
    speed >= FOLLOW_CUE_MIN_SPEED_KMH && Number.isFinite(seconds)
      ? Math.round(seconds * 10)
      : null;
  const targetDeciSeconds = Math.round(target.safeSeconds * 10);

  if (
    prev !== null &&
    prev.level === level &&
    prev.meters === meters &&
    prev.deciSeconds === deciSeconds &&
    prev.targetDeciSeconds === targetDeciSeconds
  ) {
    return prev;
  }
  return { level, meters, deciSeconds, targetDeciSeconds };
}

/** Tenths of a second → Bulgarian decimal («1,8»). */
function secondsBg(deci: number): string {
  return (deci / 10).toFixed(1).replace(".", ",");
}

/**
 * Badge copy (BG). The target rides along whenever the reading is short — see
 * „NO BARE VERDICT" in the header; a red pill that names only the shortfall
 * tells the student he is wrong and not what right would be.
 */
export function followCueLabelBg(cue: FollowCue): string {
  const metres = `Дистанция · ${cue.meters} м`;
  if (cue.deciSeconds === null) return metres;
  const held = `${metres} · ${secondsBg(cue.deciSeconds)} с`;
  if (cue.level === "info") return held;
  return `${held} · нужни ${secondsBg(cue.targetDeciSeconds)} с`;
}
