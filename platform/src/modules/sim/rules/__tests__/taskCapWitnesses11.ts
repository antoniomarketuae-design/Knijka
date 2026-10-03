/**
 * THE TASK CEILING, ROUND 11 — the witness drives (not a test file), shared by the
 * reducer's `task-cap-round11.test.ts` and the lesson's
 * `lessons/__tests__/task-cap-round11.test.ts`. Every frame is the verifier's
 * where one is named (`scratchpad/cap/verify10b/probes/zz-v10b-wit.test.ts`).
 */
import type { SimTick } from "..";
import { arr, prog, stamp, type Seg } from "./taskCapProgrammes";

const rain = { rain: true };
const r70 = (o: Record<string, unknown> = {}) => ({ rain: true, maxSpeedKmh: 70, ...o });
const d70 = (o: Record<string, unknown> = {}) => ({ rain: false, maxSpeedKmh: 70, ...o });
const f70 = (o: Record<string, unknown> = {}) => ({ fog: true, maxSpeedKmh: 70, ...o });

// ---------------------------------------------------------------------------
// The verifier's witnesses (verify10b/probes/zz-v10b-wit.test.ts), frame for frame
// ---------------------------------------------------------------------------

/** The head: a graded ≤35 owner in the rain, its lapse under the weather line (4.1–4.6), then a sign-bound ≤50 blow that WAITS. */
const STH: Seg[] = [
  { from: 0, to: 3.1, v: 46, o: rain },
  { from: 3.1, to: 3.2, v: 46, o: { ...rain, ...arr(35, 3.1, 46), ...stamp(35, 3.1) } },
  { from: 3.2, to: 4.1, v: 46, o: { ...rain, ...stamp(35, 3.1) } },
  { from: 4.1, to: 4.6, v: 41, o: { ...rain, ...stamp(35, 3.1) } },
  { from: 4.6, to: 4.7, v: 58, o: { ...rain, ...arr(50, 4.6, 58) } },
];
/** The ≤50 latch stamps from 5.5 — its episode opens after the owner's lapse while the arrival waits (the flag goes up). */
const RAISE: Seg[] = [{ from: 4.7, to: 5.5, v: 60, o: r70() }, { from: 5.5, to: 9.0, v: 60, o: r70(stamp(50, 4.6)) }];
/** The control: the stamp only from 7.8, after the weather's bill took the arrival (the flag never goes up). */
const NORAISE: Seg[] = [{ from: 4.7, to: 7.8, v: 60, o: r70() }, { from: 7.8, to: 9.0, v: 60, o: r70(stamp(50, 4.6)) }];
/** The bend takes the act over at 10.5; a graded ≤40 mark is blown inside the LIVE bend act at `m`. */
const tail = (m: number, end: number): Seg[] => [
  { from: 9.0, to: 16.0, v: 60, o: r70({ ...stamp(50, 4.6), curveAdvisoryKmh: 40 }) },
  { from: 16.0, to: m, v: 60, o: r70({ curveAdvisoryKmh: 40 }) },
  { from: m, to: m + 0.1, v: 60, o: r70({ curveAdvisoryKmh: 40, ...arr(40, m, 60), ...stamp(40, m) }) },
  { from: m + 0.1, to: m + 2, v: 60, o: r70({ curveAdvisoryKmh: 40, ...stamp(40, m) }) },
  ...(end > m + 2 ? [{ from: m + 2, to: end, v: 25, o: { maxSpeedKmh: 70 } }] : []),
];
const tailEnd = (m: number): Seg[] => [
  { from: 9.0, to: 16.0, v: 60, o: d70({ ...stamp(50, 4.6), curveAdvisoryKmh: 40 }) },
  { from: 16.0, to: m, v: 60, o: d70({ curveAdvisoryKmh: 40 }) },
  { from: m, to: m + 0.1, v: 60, o: d70({ curveAdvisoryKmh: 40, ...arr(40, m, 60), ...stamp(40, m) }) },
  { from: m + 0.1, to: m + 12, v: 60, o: d70({ curveAdvisoryKmh: 40, ...stamp(40, m) }) },
];
const SP_RAISE: Seg[] = [{ from: 4.7, to: 5.5, v: 49, o: { rain: true, maxSpeedKmh: 50 } }, { from: 5.5, to: 9.0, v: 62, o: { rain: true, maxSpeedKmh: 50, ...stamp(50, 4.6) } }];
const SP_NORAISE: Seg[] = [{ from: 4.7, to: 5.5, v: 49, o: { rain: true, maxSpeedKmh: 50 } }, { from: 5.5, to: 9.0, v: 62, o: { rain: true, maxSpeedKmh: 50 } }];
export const ST: Record<string, SimTick[]> = {
  ST: prog([...STH, ...RAISE, ...tail(12, 30)], {}),
  ST_CTRL: prog([...STH, ...NORAISE, ...tail(12, 30)], {}),
  ST2: prog([...STH, ...RAISE, ...tail(27, 45)], {}),
  ST2_CTRL: prog([...STH, ...NORAISE, ...tail(27, 45)], {}),
  ST3: prog([...STH, ...RAISE, ...tail(40, 58)], {}),
  ST3_CTRL: prog([...STH, ...NORAISE, ...tail(40, 58)], {}),
  END: prog([...STH, ...RAISE, ...tailEnd(27)], {}),
  END_CTRL: prog([...STH, ...NORAISE, ...tailEnd(27)], {}),
  SP_ST2: prog([...STH, ...SP_RAISE, ...tail(27, 45)], {}),
  SP_ST2_CTRL: prog([...STH, ...SP_NORAISE, ...tail(27, 45)], {}),
};
/** Verifier 10's W17A: the waiting latch's stretch, no later mark. */
export const W17A = prog([...STH, { from: 4.7, to: 5.5, v: 60, o: r70() }, { from: 5.5, to: 11.5, v: 60, o: r70(stamp(50, 4.6)) }, { from: 11.5, to: 25, v: 30, o: { maxSpeedKmh: 70 } }], {});

// ---------------------------------------------------------------------------
// THE NEW CLEARS' WITNESSES
// ---------------------------------------------------------------------------

/** The weather-named act a graded ≤35 arrival joined and held open through the owner's lapse (4.1–4.6). */
const LAPSED_HEAD: Seg[] = [
  { from: 0, to: 3.1, v: 46, o: rain },
  { from: 3.1, to: 3.2, v: 46, o: { ...rain, ...arr(35, 3.1, 46), ...stamp(35, 3.1) } },
  { from: 3.2, to: 4.1, v: 46, o: { ...rain, ...stamp(35, 3.1) } },
  { from: 4.1, to: 4.6, v: 41, o: { ...rain, ...stamp(35, 3.1) } },
  { from: 4.6, to: 5.0, v: 46, o: { ...rain, ...stamp(35, 3.1) } },
];
export const NEW = {
  /**
   * ESC_T — a NEW graded ≤45 mark at 5.0 SURFACES (the weather owner had lapsed); the owner lapses again (5.1–5.5, a
   * bend episode holds the act open) and that latch's episode re-opens at 5.5 — `surfaceTask` up for it; the bend takes the
   * act over at 6.6, before that breach's first bill at 8.5.
   */
  ESC_T: prog(
    [
      ...LAPSED_HEAD,
      { from: 5.0, to: 5.1, v: 52, o: { ...rain, ...arr(45, 5.0, 52), ...stamp(45, 5.0) } },
      { from: 5.1, to: 5.5, v: 41, o: { ...rain, curveAdvisoryKmh: 30, ...stamp(45, 5.0) } },
      { from: 5.5, to: 12, v: 52, o: { ...rain, curveAdvisoryKmh: 30, ...stamp(45, 5.0) } },
      { from: 12, to: 24, v: 30, o: {} },
    ],
    {},
  ),
  /**
   * FRESH_T — ESC_T's head without the bend's bill: a NEW graded ≤45 mark at 5.0 SURFACES, the owner lapses again
   * (5.1–5.5) and that latch's episode re-opens at 5.5 (`surfaceTask` up for it); a sign-bound ≤50 blow at 6.5 is a NEW
   * latch before that breach bills — the flag was the old latch's.
   */
  FRESH_T: prog(
    [
      ...LAPSED_HEAD,
      { from: 5.0, to: 5.1, v: 52, o: { ...rain, ...arr(45, 5.0, 52), ...stamp(45, 5.0) } },
      { from: 5.1, to: 5.5, v: 41, o: { ...rain, curveAdvisoryKmh: 30, ...stamp(45, 5.0) } },
      { from: 5.5, to: 6.5, v: 52, o: { ...rain, ...stamp(45, 5.0) } },
      { from: 6.5, to: 6.6, v: 58, o: { ...rain, ...arr(50, 6.5, 58) } },
      { from: 6.6, to: 20, v: 40, o: rain },
    ],
    {},
  ),
  /**
   * REST_L — a NEW graded ≤40 mark at 5.0 SURFACES (the weather owner had lapsed); the act ends at 5.1 and is KEPT with
   * its owner lapsed; the same latch resumes it at 9.0, the car over the weather's line — its breach began after that
   * owner's lapse (round 3's C3), so its first bill surfaces: a free card, never a charge.
   */
  REST_L: prog(
    [
      ...LAPSED_HEAD,
      { from: 5.0, to: 5.1, v: 47, o: { ...rain, ...arr(40, 5.0, 47), ...stamp(40, 5.0) } },
      { from: 5.1, to: 9.0, v: 38, o: { ...rain, ...stamp(40, 5.0) } },
      { from: 9.0, to: 15, v: 50, o: { ...rain, ...stamp(40, 5.0) } },
      { from: 15, to: 27, v: 30, o: {} },
    ],
    {},
  ),
  /**
   * REST_C — a task-named act whose owner lapsed (1.3); a weather breach opens after the lapse (`surfaceCond` up) and
   * ends unbilled; the act ends at 2.5 and is KEPT; fog opens a weather breach at 7.0 while no act is open; the same latch
   * resumes the kept act at 8.0 — the weather's first bill (10.0) is a breach after the task owner's lapse, and surfaces.
   */
  REST_C: prog(
    [
      { from: 0, to: 1.0, v: 44, o: d70() },
      { from: 1.0, to: 1.1, v: 56, o: d70({ ...arr(45, 1.0, 56), ...stamp(45, 1.0) }) },
      { from: 1.1, to: 1.3, v: 56, o: d70(stamp(45, 1.0)) },
      { from: 1.3, to: 2.0, v: 48, o: d70(stamp(45, 1.0)) },
      { from: 2.0, to: 2.5, v: 62, o: r70(stamp(45, 1.0)) },
      { from: 2.5, to: 7.0, v: 40, o: d70(stamp(45, 1.0)) },
      { from: 7.0, to: 8.0, v: 48, o: f70(stamp(45, 1.0)) },
      { from: 8.0, to: 14, v: 56, o: f70(stamp(45, 1.0)) },
      { from: 14, to: 26, v: 30, o: { maxSpeedKmh: 70 } },
    ],
    {},
  ),
  /**
   * ESC_C — a task-named act (the ≤45 arrival at 1.0, dry; two more frames over the line bank its episode 0.2 s, so it
   * stays live); the owner lapses in its grace band (1.3); rain at 2.0 opens the weather's episode after that lapse
   * (`surfaceCond` up); the bend takes the act over at 3.5, before the weather's first bill at 5.0.
   */
  ESC_C: prog(
    [
      { from: 0, to: 1.0, v: 44, o: d70() },
      { from: 1.0, to: 1.1, v: 56, o: d70({ ...arr(45, 1.0, 56), ...stamp(45, 1.0) }) },
      { from: 1.1, to: 1.3, v: 56, o: d70(stamp(45, 1.0)) },
      { from: 1.3, to: 2.0, v: 48, o: d70(stamp(45, 1.0)) },
      { from: 2.0, to: 9, v: 62, o: r70({ ...stamp(45, 1.0), curveAdvisoryKmh: 45 }) },
      { from: 9, to: 22, v: 30, o: { maxSpeedKmh: 70 } },
    ],
    {},
  ),
};

const stretch = (from: number, to: number, latch: number, v = 60): Seg => ({ from, to, v, o: { maxSpeedKmh: 70, ...stamp(50, latch) } });
const after70 = (from: number, to: number): Seg => ({ from, to, v: 40, o: { maxSpeedKmh: 70 } });
export const W11 = {
  W11_BEND: prog([{ from: 0, to: 1.0, v: 45 }, { from: 1.0, to: 1.1, v: 58, o: arr(50, 1.0, 58) }, { from: 1.1, to: 2.0, v: 54 }, { from: 2.0, to: 2.1, v: 58, o: arr(50, 2.0, 58) }, { from: 2.1, to: 4.0, v: 54, o: { curveAdvisoryKmh: 35 } }, { from: 4.0, to: 4.5, v: 45 }, stretch(4.5, 10.5, 2.0), after70(10.5, 20)], {}),
  W11_RAIN: prog([{ from: 0, to: 1.0, v: 45 }, { from: 1.0, to: 1.1, v: 58, o: arr(50, 1.0, 58) }, { from: 1.1, to: 2.0, v: 54 }, { from: 2.0, to: 2.1, v: 58, o: arr(50, 2.0, 58) }, { from: 2.1, to: 5.3, v: 54, o: rain }, { from: 5.3, to: 5.7, v: 42, o: rain }, stretch(5.7, 11.7, 2.0), after70(11.7, 20)], {}),
  W11_BEND3: prog([{ from: 0, to: 1.0, v: 45 }, { from: 1.0, to: 1.1, v: 58, o: arr(50, 1.0, 58) }, { from: 1.1, to: 1.6, v: 54 }, { from: 1.6, to: 1.7, v: 58, o: arr(50, 1.6, 58) }, { from: 1.7, to: 2.2, v: 54 }, { from: 2.2, to: 2.3, v: 58, o: arr(50, 2.2, 58) }, { from: 2.3, to: 4.0, v: 54, o: { curveAdvisoryKmh: 35 } }, { from: 4.0, to: 4.5, v: 45 }, stretch(4.5, 10.5, 2.2), after70(10.5, 20)], {}),
};

const S1_HEAD: Seg[] = [
  { from: 0, to: 3.2, v: 54, o: rain },
  { from: 3.2, to: 4.2, v: 42, o: rain },
  { from: 4.2, to: 4.5, v: 58, o: rain },
  { from: 4.5, to: 4.6, v: 58, o: { ...rain, ...arr(50, 4.5, 58) } },
];
const fogTail = (lapse: boolean): Seg[] => {
  const st = stamp(50, 4.5);
  return [
    { from: 4.6, to: 8.0, v: 45, o: f70() },
    { from: 8.0, to: 8.3, v: 57, o: f70(st) },
    { from: 8.3, to: 9.0, v: 45, o: f70(st) },
    ...(lapse ? [{ from: 9.0, to: 9.5, v: 41, o: f70({ ...st, curveAdvisoryKmh: 30 }) }, { from: 9.5, to: 10.0, v: 45, o: f70(st) }] : [{ from: 9.0, to: 10.0, v: 45, o: f70(st) }]),
    { from: 10.0, to: 16.0, v: 57, o: f70(st) },
    { from: 16.0, to: 26.0, v: 30, o: { maxSpeedKmh: 70 } },
  ];
};
export const W8_FOG70 = prog([...S1_HEAD, ...fogTail(true)], {});
export const W8_FOG70_CTRL = prog([...S1_HEAD, ...fogTail(false)], {});

export const CENSUS = {
  /** A waiting ≤50 arrival (1.0); rain from 1.1; the weather's first bill at 4.2 lands on the frame of a SECOND ≤50 blow. */
  SAME_FRAME: prog(
    [
      { from: 0, to: 1.0, v: 45 },
      { from: 1.0, to: 1.1, v: 58, o: arr(50, 1.0, 58) },
      { from: 1.1, to: 4.2, v: 54, o: rain },
      { from: 4.2, to: 4.3, v: 57, o: { ...rain, ...arr(50, 4.2, 57) } },
      { from: 4.3, to: 16, v: 40, o: rain },
    ],
    {},
  ),
  /**
   * A graded ≤35 owner lapses (4.1–4.6); the sign-bound ≤50 blow at 4.6 WAITS; the weather re-opens (5.2) and its first
   * bill at 8.3 lands on the frame of a SECOND ≤50 blow — inside the weather act whose owner had lapsed.
   */
  SAME_FRAME_LAPSED: prog(
    [
      { from: 0, to: 3.1, v: 46 },
      { from: 3.1, to: 3.2, v: 46, o: { ...arr(35, 3.1, 46), ...stamp(35, 3.1) } },
      { from: 3.2, to: 4.1, v: 46, o: stamp(35, 3.1) },
      { from: 4.1, to: 4.6, v: 41, o: stamp(35, 3.1) },
      { from: 4.6, to: 4.7, v: 58, o: arr(50, 4.6, 58) },
      { from: 4.7, to: 5.2, v: 40, o: { curveAdvisoryKmh: 30 } },
      { from: 5.2, to: 8.3, v: 46 },
      { from: 8.3, to: 8.4, v: 57, o: arr(50, 8.3, 57) },
      { from: 8.4, to: 12, v: 46 },
      { from: 12, to: 30, v: 30 },
    ],
    rain,
  ),
  /**
   * END_SPEEDING_BLOW (the resumed round 11's SF4) — a sign-bound ≤50 blow at 1.0 (58) WAITS, the car holds 58 on the 50 so
   * SPEEDING_OVER_LIMIT bills at 3.0 — the very frame of a SECOND ≤50 blow — and the drive ENDS on that frame.
   */
  END_SPEEDING_BLOW: prog(
    [
      { from: 0, to: 1.0, v: 45 },
      { from: 1.0, to: 1.1, v: 58, o: arr(50, 1.0, 58) },
      { from: 1.1, to: 3.0, v: 58 },
      { from: 3.0, to: 3.1, v: 58.5, o: arr(50, 3.0, 58.5) },
    ],
    {},
  ),
  /** The same drive one frame longer (it does not end on the blow frame). */
  END_SPEEDING_BLOW_ON: prog(
    [
      { from: 0, to: 1.0, v: 45 },
      { from: 1.0, to: 1.1, v: 58, o: arr(50, 1.0, 58) },
      { from: 1.1, to: 3.0, v: 58 },
      { from: 3.0, to: 3.1, v: 58.5, o: arr(50, 3.0, 58.5) },
      { from: 3.1, to: 3.2, v: 58 },
    ],
    {},
  ),
  /**
   * TWO_ABSORPTIONS (settles W4) — SPEEDING_OVER_LIMIT bills at 2.5 (58 on a 50 from 0.5); a ≤50 mark blown at 3.0 is
   * absorbed into it at its blow, and a second ≤50 mark blown at 4.0 in the same M-16 act is absorbed into it too: the act
   * that took the arrival's bill now lists BOTH latches, in the order they were blown.
   */
  TWO_ABSORPTIONS: prog(
    [
      { from: 0, to: 0.5, v: 45 },
      { from: 0.5, to: 3.0, v: 58 },
      { from: 3.0, to: 3.1, v: 58.5, o: arr(50, 3.0, 58.5) },
      { from: 3.1, to: 4.0, v: 58 },
      { from: 4.0, to: 4.1, v: 58.5, o: arr(50, 4.0, 58.5) },
      { from: 4.1, to: 5.0, v: 58 },
      { from: 5.0, to: 15, v: 45 },
    ],
    {},
  ),
  /** A waiting ≤60 arrival (0.9); the sign rises to 90 and its latch stamps 65.7 (first bill due at 4.0); the sign drops to 60, then 80 with the car at 89: SPEEDING at 6.6. */
  STRETCH_SPEEDING: prog(
    [
      { from: 0, to: 0.9, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 0.9, to: 1.0, v: 68.8, o: { maxSpeedKmh: 60, ...arr(60, 0.9, 68.8) } },
      { from: 1.0, to: 4.1, v: 65.7, o: { maxSpeedKmh: 90, ...stamp(60, 0.9) } },
      { from: 4.1, to: 4.6, v: 58.4, o: { maxSpeedKmh: 60 } },
      { from: 4.6, to: 7.7, v: 89, o: { maxSpeedKmh: 80, ...stamp(60, 0.9) } },
      { from: 7.7, to: 20, v: 50, o: { maxSpeedKmh: 60 } },
    ],
    {},
  ),
  /** A waiting ≤60 arrival (1.0); two stretches of its latch (1.1–4.6, 9.9–13.5) in ONE M-16 act (63 on a posted 60 between them; held at 13.9). */
  STRETCH_TWICE: prog(
    [
      { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
      { from: 1.1, to: 4.6, v: 76, o: { maxSpeedKmh: 80, ...stamp(60, 1.0) } },
      { from: 4.6, to: 9.9, v: 63, o: { maxSpeedKmh: 60 } },
      { from: 9.9, to: 13.5, v: 70, o: { maxSpeedKmh: 80, ...stamp(60, 1.0) } },
      { from: 13.5, to: 25, v: 50, o: { maxSpeedKmh: 60 } },
    ],
    {},
  ),
  /** A waiting ≤60 arrival (1.0); its latch stamps 66 on a raised 65 for 14 s — over the sign's line, inside its grace band — so the act never ends before 19.1. */
  STRETCH_LONG: prog(
    [
      { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arr(60, 1.0, 67.6) } },
      { from: 1.1, to: 15.1, v: 66, o: { maxSpeedKmh: 65, ...stamp(60, 1.0) } },
      { from: 15.1, to: 30, v: 50, o: { maxSpeedKmh: 60 } },
    ],
    {},
  ),
};

