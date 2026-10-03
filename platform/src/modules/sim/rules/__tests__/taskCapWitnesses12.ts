/**
 * THE TASK CEILING, ROUND 12 — shared witness programmes (not a test file), for the reducer-level and lesson-level
 * round-12 tests.
 *
 *  · `stretchPair` / `STRETCH_VARIANTS` — the round-11 verifier's F-STRETCH probe
 *    (`scratchpad/cap/verify11/probes/zz-v11-stretch.test.ts`), both halves, frame for frame: a sign-bound ≤60 mark
 *    blown at 67.6 on a posted 60, then the sign raised past the cap with the ≤60 latch stamping the car at 66–68 for
 *    6–30 s; and its GRADED TWIN, the same driving with the sign already raised at the blow.
 *  · `PRIOR_STRETCH` — what rounds 10 and 11 billed on the sign-bound half, as the verifier
 *    measured it (`verify11/r10stretch-l4/zz-v11-stretch.jsonl`, `verify11/out/zz-v11-stretch.jsonl`): the change
 *    round 12 makes is disclosed against both, in the test and in the report.
 *  · `R12` — the consequences of THE NAMED STRETCH ENDS THE WAIT (`rules/engine.ts`), one hand-built witness each.
 */
import type { SimTick } from "..";
import { arr, prog, stamp } from "./taskCapProgrammes";

export const TASK = "TASK_SPEED_CAP_EXCEEDED";

/** The verifier's F-STRETCH probe, both halves. */
export function stretchPair(len: number, v: number, raised: number): { signBound: SimTick[]; graded: SimTick[] } {
  return {
    // SIGN-BOUND: the sign is 60 at the blow (the ≤60 cap AT the sign), then raised on the named stretch.
    signBound: prog(
      [
        { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
        { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
        { from: 1.1, to: 1.1 + len, v, o: { maxSpeedKmh: raised, ...stamp(60, 1.0) } },
        { from: 1.1 + len, to: 1.1 + len + 15, v: 50, o: { maxSpeedKmh: 60 } },
      ],
      {},
    ),
    // GRADED TWIN: the same driving, the sign already raised at the blow (the ≤60 cap under it).
    graded: prog(
      [
        { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: raised } },
        { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: raised, ...arr(60, 1.0, 67.6), ...stamp(60, 1.0) } },
        { from: 1.1, to: 1.1 + len, v, o: { maxSpeedKmh: raised, ...stamp(60, 1.0) } },
        { from: 1.1 + len, to: 1.1 + len + 15, v: 50, o: { maxSpeedKmh: 60 } },
      ],
      {},
    ),
  };
}
export const STRETCH_VARIANTS: ReadonlyArray<{ len: number; tag: string; v: number; raised: number }> = [6, 10, 14, 20, 30].flatMap((len) => [
  { len, tag: "grace", v: 66, raised: 65 },
  { len, tag: "grace2", v: 68, raised: 65 },
  { len, tag: "under", v: 66, raised: 70 },
]);

/**
 * What rounds 10 and 11 billed on the SIGN-BOUND half, measured: round 10 by the round-11 verifier
 * (`verify11/r10stretch-l4/zz-v11-stretch.jsonl`), round 11 by the verifier (`verify11/out/zz-v11-stretch.jsonl`) and
 * again on round 11's engine byte copy (sha256 677563f0…, `scratchpad/cap/r12/engine-r11.ts`). Round 10 taught the
 * STRETCH's first bill 3 s after the stamp and charged its re-grade; round 11 joined the stretch to the wait and taught
 * only at the held correction, 15–34 s after the blow, charging nothing on the grace-band variants.
 */
export const PRIOR_STRETCH: Readonly<Record<"r10" | "r11", (len: number, tag: string) => string[]>> = {
  r10: (len) => (len >= 10 ? [`${TASK}@4.2`, `${TASK}:rg@10.2`] : [`${TASK}@4.2`]),
  r11: (len, tag) =>
    tag === "under"
      ? len >= 10
        ? [`${TASK}>${TASK}@4.2`, `${TASK}@5.2`, `${TASK}:rg@10.2`]
        : [`${TASK}>${TASK}@4.2`, `${TASK}@5.2`]
      : [`${TASK}>${TASK}@4.2`, `${TASK}@${Math.round((1.1 + len + 4) * 10) / 10}`],
};

const rain = { rain: true };

/**
 * THE CONSEQUENCES OF THE RULE — one hand-built witness each (`rules/engine.ts` „THE NAMED STRETCH ENDS THE WAIT").
 */
export const R12 = {
  /**
   * The MIRROR of the round-11 witness STRETCH_SPEEDING: the speeding bills BEFORE the latch first stamps. A ≤60
   * sign-bound mark blown at 68.8 on a posted 60, the car held at 68.8 (over the sign's graded line, 65) for 3 s, the
   * speeding's first bill lands while the arrival still waits and takes the act's one bill; then the sign rises to 90
   * and the latch stamps the car at 65.7 — the absorbed act's own latch carrying on (round 10), no TASK named.
   */
  SPEEDING_BEFORE_STAMP: prog(
    [
      { from: 0, to: 0.9, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 0.9, to: 1.0, v: 68.8, o: { maxSpeedKmh: 60, ...arr(60, 0.9, 68.8) } },
      { from: 1.0, to: 4.0, v: 68.8, o: { maxSpeedKmh: 60 } },
      { from: 4.0, to: 8.0, v: 65.7, o: { maxSpeedKmh: 90, ...stamp(60, 0.9) } },
      { from: 8.0, to: 20, v: 50, o: { maxSpeedKmh: 60 } },
    ],
    {},
  ),
  /**
   * A weather first bill AFTER the stamp, in the act the arrival named: a ≤50 sign-bound mark blown at 58 on a posted
   * 50 in the rain (dry until the blow, so no weather act is open at it), the sign raised to 70 on the next frame with
   * the latch stamping 58 — the arrival names the act TASK there — and the car over the rain envelope (0.85 × 70 = 59.5)
   * from 1.6: the weather's first bill at 4.6 is that act's absorbed bill, one act, one name.
   */
  KIN_AFTER_STAMP: prog(
    [
      { from: 0, to: 1.0, v: 47, o: { maxSpeedKmh: 50 } },
      { from: 1.0, to: 1.1, v: 58, o: { maxSpeedKmh: 50, ...arr(50, 1.0, 58) } },
      { from: 1.1, to: 1.6, v: 58, o: { maxSpeedKmh: 70, ...rain, ...stamp(50, 1.0) } },
      { from: 1.6, to: 6.0, v: 62, o: { maxSpeedKmh: 70, ...rain, ...stamp(50, 1.0) } },
      { from: 6.0, to: 20, v: 40, o: { maxSpeedKmh: 50 } },
    ],
    {},
  ),
  /** …and its mirror: the weather's first bill lands BEFORE the stamp, while the arrival waits — it takes the act (round 9). */
  KIN_BEFORE_STAMP: prog(
    [
      { from: 0, to: 1.0, v: 47, o: { maxSpeedKmh: 50 } },
      { from: 1.0, to: 1.1, v: 58, o: { maxSpeedKmh: 50, ...arr(50, 1.0, 58) } },
      { from: 1.1, to: 4.5, v: 54, o: { maxSpeedKmh: 50, ...rain } },
      { from: 4.5, to: 8.0, v: 62, o: { maxSpeedKmh: 70, ...rain, ...stamp(50, 1.0) } },
      { from: 8.0, to: 20, v: 40, o: { maxSpeedKmh: 50 } },
    ],
    {},
  ),
  /**
   * A SECOND MARK after the stamp: the ≤60 arrival billed on its first stamp (1.1), the stamp gone, the car on over the
   * sign (the M-16 act runs on), and a graded ≤45 mark blown at 56 at 6.0 — a new latch, its own blow, its own bill
   * (charged: the topic's teach was spent at 1.1). Round 11 let the ≤45 arrival take the waiting act's one bill and
   * the ≤60 blow was never billed at all.
   */
  SECOND_MARK_AFTER_STAMP: prog(
    [
      { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
      { from: 1.1, to: 2.0, v: 64, o: { maxSpeedKmh: 70, ...stamp(60, 1.0) } },
      { from: 2.0, to: 6.0, v: 62, o: { maxSpeedKmh: 60 } },
      { from: 6.0, to: 6.1, v: 56, o: { maxSpeedKmh: 60, ...arr(45, 6.0, 56), ...stamp(45, 6.0) } },
      { from: 6.1, to: 20, v: 44, o: { maxSpeedKmh: 60, ...stamp(45, 6.0) } },
    ],
    {},
  ),
  /** …and its control: the same drive with the ≤60 latch never stamping — the ≤45 arrival takes the waiting act's bill (round 7). */
  SECOND_MARK_NO_STAMP: prog(
    [
      { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
      { from: 1.1, to: 2.0, v: 64, o: { maxSpeedKmh: 60 } },
      { from: 2.0, to: 6.0, v: 62, o: { maxSpeedKmh: 60 } },
      { from: 6.0, to: 6.1, v: 56, o: { maxSpeedKmh: 60, ...arr(45, 6.0, 56), ...stamp(45, 6.0) } },
      { from: 6.1, to: 20, v: 44, o: { maxSpeedKmh: 60, ...stamp(45, 6.0) } },
    ],
    {},
  ),
  /**
   * THE KEPT ACT: the ≤60 arrival billed on its first stamp (1.1) names the act; the stretch ends (the car at the
   * figure on the glass, held); the SAME latch takes the car over its line again at 10.0 — the arrival's act resumes
   * (round 6): its first bill absorbed, the act's one charge kept, no second naming.
   */
  KEPT_ACT_RESUMES: prog(
    [
      { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
      { from: 1.1, to: 5.0, v: 67, o: { maxSpeedKmh: 70, ...stamp(60, 1.0) } },
      { from: 5.0, to: 10.0, v: 55, o: { maxSpeedKmh: 70, ...stamp(60, 1.0) } },
      { from: 10.0, to: 16.0, v: 67, o: { maxSpeedKmh: 70, ...stamp(60, 1.0) } },
      { from: 16.0, to: 30, v: 50, o: { maxSpeedKmh: 60 } },
    ],
    {},
  ),
};
