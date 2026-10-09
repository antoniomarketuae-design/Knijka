/**
 * WHEN A VEHICLE'S BRAKING IS „HARSH" — the product's one answer, as a pure
 * step over a series of speed losses (sc-ac-wind-truck-pass:ff1d4290 round 3;
 * the integrator's decision D2 of 2026-10-08 under the founder's delegation).
 *
 * WHY THIS FILE EXISTS. The rule engine has always known what a harsh brake is
 * — it convicts the STUDENT's own causeless one (`engine.ts`, the
 * HARSH_BRAKING_NO_CAUSE ledger, two gates measured across 20/30/60/120 Hz in
 * 2026-08-29's A12 battery). Round 3 of the truck-pass lesson needs the same
 * question asked of ANOTHER vehicle: «did the truck the student came back in
 * front of really have to brake HARD because of him?» — and the card it bills
 * under says so in words («водачът му трябваше да спира рязко»), so the answer
 * must be the product's own and not a new line. Round 2 answered it with one
 * frame (the account grew 0.3 m/s at a rate over 7 m/s²), and the round-2
 * verifier measured what that means: a 50 ms touch of the truck's guard that
 * cost it 1.44 км/ч billed 10 т. and failed the lesson (F2-02).
 *
 * THE NUMBERS, ALL OF THEM THE ENGINE'S (`types.ts DEFAULT_RULE_CONFIG`):
 *   · `harshBrakeDecelMps2` 7 m/s² — „emergency-grade only; a firm 4–5 m/s²
 *     stop never fires";
 *   · `harshBrakeSustainSec` 0.4 s — how long it must be held;
 * so a harsh brake is at least 7 × 0.4 = 2.8 m/s (10.1 км/ч) of speed shed in
 * at least 0.4 s at a mean over 7 m/s² — never a blip.
 *
 * THE TWO GATES, AS THE ENGINE RUNS THEM (its docblock at `causelessBraking`
 * carries the measurements that chose each):
 *   1. ACCRUED QUALIFYING SECONDS — every frame whose reading is at or over the
 *      line credits its own span (never the gap before it); a frame under it
 *      credits nothing but does not zero the clock. Fires only at `sustainSec`.
 *   2. THE MEAN OVER THE OPEN WINDOW must itself be over the line, EXCLUSIVE,
 *      with the relative tie tolerance below; the window opens on the first
 *      braking frame and RE-ANCHORS when, held for the sustain, its mean is
 *      not emergency-grade.
 *   A frame that is not braking at all (under `BRAKING_LINE_MPS2`) is the
 *   released pedal: everything re-arms.
 * The engine's own ledger additionally excuses braking with a CAUSE ahead and
 * ignores stabs from under `harshBrakeMinSpeedKmh` (35 км/ч: „low-speed stabs
 * are clumsy, not dangerous"). Neither belongs to the question asked of a
 * vehicle the student made brake: the account read here holds ONLY the speed
 * shed because of him (a cause is what it is), and the floor is about the
 * student's own clumsy pedal, not about how hard a deceleration was. (The
 * lesson's truck runs at 40 км/ч, above the floor anyway.)
 *
 * HOW IT IS HELD TO THE ENGINE: `rules/__tests__/harsh-brake-episode.test.ts`
 * drives the engine's HARSH_BRAKING_NO_CAUSE and this step over the same speed
 * traces and requires the same verdict on every row; and the truck-pass
 * runner's own tests judge every return against the engine's reducer fed the
 * truck's speed trace (`orchestrator/__tests__/overtake-return-forced.test.ts`,
 * the sweep's oracle).
 */

/**
 * THIS PRODUCT'S LINE BETWEEN BRAKING AND NOT BRAKING, m/s² — the deceleration
 * at which the harsh-brake ledger opens an episode at all and at which a
 * released pedal re-arms it (moved here from `engine.ts`, which imports it; the
 * engine's cause ledger asks the same question of the lead and of the gap).
 */
export const BRAKING_LINE_MPS2 = 2;

/**
 * THE HARSH-BRAKE LINE IS EXCLUSIVE, with this RELATIVE tie tolerance (moved
 * here from `engine.ts`, which imports it — its measurement is documented
 * there): it can only ever decide the exact tie, and decides it for the
 * acquittal every time.
 */
export const HARSH_BRAKE_TIE_TOLERANCE = 1e-9;

/**
 * „HELD FOR THE SUSTAIN" IS `>=`, AND AN EXACT TIE IS HELD — decided by the
 * rule, not by how a run of frames happened to sum. Measured on the lesson
 * truck (round 3): its guard brakes at 8 m/s², so a brake of 24 whole 60 Hz
 * frames spans exactly 24/60 = 0.4 s, and summed frame by frame that reads
 * 0.39999999999999997 on one tape and 0.4000000000000001 on the next — the
 * same brake harsh or not by a rounding mode. The engine's own ledger compares
 * a student's brake with a bare `>=` (its sums there are of irregular frames,
 * and A12's battery never sits on the tie); for another vehicle's account the
 * tie is the common case, so the same relative tolerance the mean uses is
 * applied here in the direction `>=` already says.
 */
function heldFor(sec: number, sustainSec: number): boolean {
  return sec >= sustainSec * (1 - HARSH_BRAKE_TIE_TOLERANCE);
}

/** The numbers that make a brake „harsh" — `RuleEngineConfig`'s own: the
 *  line, its sustain, and the window the deceleration is read over. */
export interface HarshBrakeLine {
  harshBrakeDecelMps2: number;
  harshBrakeSustainSec: number;
  accelWindowSec: number;
}

/** One vehicle's open harsh-brake episode. Mutated in place by its step. */
export interface HarshBrakeTrack {
  /** The reading window's samples (cumulative loss by time) — the engine's
   *  `speedWindow`, kept in loss rather than speed. */
  window: Array<{ t: number; lossMps: number }>;
  /** The previous frame's time, s (the engine's `prevT`). */
  prevT: number | null;
  /** When the open window was anchored, s; `null` = no window open. */
  anchorT: number | null;
  /** The cumulative speed loss on the anchor frame, m/s (the mean's base). */
  anchorLossMps: number;
  /** Seconds of qualifying frames accrued in this window. */
  qualifiedSec: number;
  /** When the last qualifying frame was, s. */
  lastQualAt: number | null;
  /** This episode has already been found harsh (reported once). */
  fired: boolean;
}

/** What made the episode harsh, on the frame it became so. */
export interface HarshBrakeVerdict {
  /** The open window's length, s (≥ the sustain). */
  heldSec: number;
  /** Speed shed over that window, m/s. */
  shedMps: number;
  /** Its mean deceleration, m/s² (> the line). */
  meanDecelMps2: number;
  /** Qualifying seconds accrued in it (≥ the sustain). */
  qualifiedSec: number;
}

export function newHarshBrakeTrack(): HarshBrakeTrack {
  return { window: [], prevT: null, anchorT: null, anchorLossMps: 0, qualifiedSec: 0, lastQualAt: null, fired: false };
}

/** Is a window of this length, mean and accrual harsh on `line`? — the
 *  engine's conviction test, the one predicate both callers use. */
export function isHarshBrakeWindow(
  w: { heldSec: number; meanDecelMps2: number; qualifiedSec: number },
  line: Pick<HarshBrakeLine, "harshBrakeDecelMps2" | "harshBrakeSustainSec">,
): boolean {
  return (
    heldFor(w.heldSec, line.harshBrakeSustainSec) &&
    heldFor(w.qualifiedSec, line.harshBrakeSustainSec) &&
    w.meanDecelMps2 > line.harshBrakeDecelMps2 * (1 + HARSH_BRAKE_TIE_TOLERANCE)
  );
}

/**
 * One frame of a vehicle's speed history, given as the speed it has LOST
 * since a reference (`lossTotalMps`, m/s — any fixed reference minus its
 * speed now; it falls again when the vehicle picks up) at time `tSec`.
 * Returns the verdict on the FIRST frame the episode is harsh, `null` on
 * every other. (The overtaken truck's runner feeds it the truck's own speed
 * and then requires the speed shed in the harsh window to be on the truck's
 * account of speed shed because of the student.)
 *
 * Line for line the engine's causeless ledger (`engine.ts`, from
 * `stepSpeedWindow` to the HARSH_BRAKING_NO_CAUSE push), with speed read as
 * minus the loss: the deceleration is the change over the reading window
 * (`accelWindowSec`, anchored on the latest sample at or before its start —
 * the M-18 derivative), braking is that reading at `BRAKING_LINE_MPS2` or
 * more, a frame qualifies at the line or more, its first qualifying frame is
 * worth the span its reading covers and every later one its own frame, and
 * the mean is taken from the frame the window opened. Two differences, both
 * stated in the header: no cause and no onset-speed floor.
 */
export function stepHarshBrakeTrack(
  track: HarshBrakeTrack,
  tSec: number,
  lossTotalMps: number,
  line: HarshBrakeLine,
): HarshBrakeVerdict | null {
  const dt = track.prevT === null ? 0 : tSec - track.prevT;
  track.prevT = tSec;
  // The reading window (engine `stepSpeedWindow`).
  const w = track.window;
  while (w.length >= 2 && w[1]!.t <= tSec - line.accelWindowSec) w.shift();
  const readAnchor = w.length > 0 ? w[0]! : null;
  w.push({ t: tSec, lossMps: lossTotalMps });
  const decel =
    readAnchor !== null && dt > 0 && tSec > readAnchor.t ? (lossTotalMps - readAnchor.lossMps) / (tSec - readAnchor.t) : 0;
  const harshDecel = dt > 0 && decel >= line.harshBrakeDecelMps2;
  if (!(decel >= BRAKING_LINE_MPS2)) {
    // Not braking: the pedal is released — re-arm (engine: `accelMps2 > -BRAKING_LINE`).
    track.anchorT = null;
    track.qualifiedSec = 0;
    track.lastQualAt = null;
    track.fired = false;
    return null;
  }
  const open = track.anchorT;
  const heldSec = open === null ? 0 : tSec - open;
  const shedMps = lossTotalMps - track.anchorLossMps;
  const meanDecelMps2 = heldSec > 0 ? shedMps / heldSec : 0;
  const held = heldFor(heldSec, line.harshBrakeSustainSec);
  const meanIsHarsh =
    open !== null && held && shedMps > line.harshBrakeDecelMps2 * heldSec * (1 + HARSH_BRAKE_TIE_TOLERANCE);
  if (open === null || (held && !meanIsHarsh)) {
    // Open, or re-anchor on this frame's own reading.
    track.anchorT = tSec;
    track.anchorLossMps = lossTotalMps;
    track.qualifiedSec = 0;
    track.lastQualAt = null;
  }
  if (harshDecel) {
    // The first qualifying frame is worth the span its reading covers; every
    // later one its own frame and never the gap before it.
    track.qualifiedSec +=
      track.lastQualAt === null
        ? readAnchor === null
          ? 0
          : Math.max(0, Math.min(tSec - readAnchor.t, 2))
        : Math.max(0, Math.min(tSec - track.lastQualAt, Math.min(dt, 2)));
    track.lastQualAt = tSec;
  }
  if (!track.fired && heldFor(track.qualifiedSec, line.harshBrakeSustainSec) && meanIsHarsh) {
    track.fired = true;
    return { heldSec, shedMps, meanDecelMps2, qualifiedSec: track.qualifiedSec };
  }
  return null;
}
