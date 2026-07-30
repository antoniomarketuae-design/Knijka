/**
 * sc-sp-eco-coast — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Видиш ли червено отдалеч, пусни газта" (SP-11 / JU-09)
 * on the committed sx-v1 district (map REUSED from the signals family). No
 * staged conflict — the ONLY thing graded is HOW the driver spends the last
 * 80 metres of a red-light approach, pinned deterministically by signalOffsets.
 *
 * THE DIAL (signals.ts ns timeline, phaseAt(t + offset), cycle 50 s: green
 * [0,20) → yellow [20,23) → red [23,49) → redYellow [49,50)): offset 30 ⇒ the
 * ns approach shows RED for the whole run-in (session t < 19), redYellow on
 * t ∈ [19,20), and GREEN from t 20 through t 40. So a driver who READS the red
 * early and lets the car roll down meets the green as it opens — while a driver
 * who keeps the gas on arrives at the line early, on red, and pays for it.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: lifts off early and ENGINE-BRAKES down to a smooth halt a couple
 *     of metres short of the line, waits the last of the red out, crosses on
 *     GREEN → ZERO violations (the coast is the лекция; a slam it never needs);
 *   - „Газ до последно" (mistake-late-brake): keeps the gas on to the line, then
 *     a late hard stab that carries the nose PAST the stop line onto the mouth
 *     of the junction while still red → EXACTLY STOP_LINE_OVERSHOOT (the harsh
 *     brake itself is a lawful response to the red and never grades — the fault
 *     the engine can see is the overrun the late braking bought);
 *   - „Заспиване на зелено" (mistake-sleep-at-green): the same clean coast to a
 *     halt, but then it sits through the opening green → EXACTLY
 *     HESITATION_AT_GREEN (the wasted stop's second cost).
 *
 * Geometry pinned to content/world/sx-v1.json (battery sx-district.test.ts): ns
 * south approach on x = 0 (right lane 4.06, limit 50), the northbound stop line
 * at y = −27.73, junction centre (0, 0), spawn sx-spawn-south (4.06, −105) heading
 * north. No staged actors, ambient traffic zero, dry day.
 */

import type { StagedEventSpec } from "../contracts";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SP_ECO_COAST_ID = "sc-sp-eco-coast";

/** Northbound right-lane center of sx-v1's ns road. */
const X_LANE = 4.06;
/** The eco-coast dial: ns red through t 19, green from t 20 (see header). */
const SIGNAL_OFFSETS = { "sx-n-c": 30 } as const;

/** Spawn → right-lane merge, shared by all three drives (sx-spawn-south). */
const LEAD_IN: ReadonlyArray<readonly [number, number]> = [
  [X_LANE, -105],
  [X_LANE, -70],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — lift off early, coast to the line
// ---------------------------------------------------------------------------

export function scSpEcoCoastShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Светофарът напред е червен и се вижда отдалеч — пусни газта и остави колата да се търкаля.",
      },
      { kind: "glance", mirror: "rear" },
      // Merge and reach ~40 km/h, then LIFT OFF at −70 and engine-brake gently
      // (maxDecelMps2 2.0 = a long, soft deceleration, not a stab) to a smooth
      // halt ~3 m short of the line — clear of the overshoot band (1.2 m).
      { kind: "drive", points: [...LEAD_IN], targetKmh: 40, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Не заковавай — плавното забавяне с двигателя пести гориво, спирачки и е по-безопасно.",
      },
      { kind: "drive", points: [[X_LANE, -70], [X_LANE, -45], [X_LANE, -30.7]], targetKmh: 40, maxDecelMps2: 2.0 },
      {
        kind: "annotation",
        textBg: "Изчакай спокойно последните секунди на червеното — кракът е на спирачката.",
      },
      // The last of the red (arrival ~t 15, green at t 20): hold, then launch a
      // beat after the green — no dawdle.
      { kind: "pause", sec: 6.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Зелено — тръгни плавно, без рязко ускорение." },
      { kind: "drive", points: [[X_LANE, -30.7], [X_LANE, 10], [X_LANE, 47]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: видя червеното отдалеч, пусна газта и стигна линията плавно — а зеленото те посрещна.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Газ до последно" (STOP_LINE_OVERSHOOT)
// ---------------------------------------------------------------------------

export function scSpEcoCoastMistakeLateBrakeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: газта до последно към червеното — после закова, но е късно.",
      },
      { kind: "glance", mirror: "rear" },
      // Keep the gas on to the line at the limit (no lift-off), then a late,
      // hard stab (maxDecelMps2 9) that stops the car with the nose already PAST
      // the paint (centre at −28.3 ⇒ ~0.6 m short = nose ~1.6 m over the line),
      // still on red. The recorder clamps position to the endpoint, so the
      // overrun is exactly authored: центрирано в лентата, носът над линията.
      { kind: "drive", points: [...LEAD_IN], targetKmh: 50, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, -70], [X_LANE, -40], [X_LANE, -28.3]], targetKmh: 50, maxDecelMps2: 9 },
      {
        kind: "annotation",
        textBg: "Спирачният път не стигна — предницата премина стоп-линията и навлезе в устието на кръстовището.",
      },
      // Hold past the line on red (> 0.7 s ⇒ the overshoot episode fires); the
      // overrun is billed while red, and the car clears only once the light
      // opens (green from t 20) — a departure on red would add RED_LIGHT_CROSSED,
      // a different and far graver fault than the one this demo teaches.
      { kind: "pause", sec: 11.0, brake: true },
      { kind: "drive", points: [[X_LANE, -28.3], [X_LANE, 10], [X_LANE, 47]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Червеното се вижда от 80 метра. Пуснеш ли газта отрано, спираш на линията без нито един рязък сантиметър.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заспиване на зелено" (HESITATION_AT_GREEN)
// ---------------------------------------------------------------------------

export function scSpEcoCoastMistakeSleepScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката огледална: колата спря чисто на линията — но после проспа зеленото.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [...LEAD_IN], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, -70], [X_LANE, -45], [X_LANE, -30.7]], targetKmh: 40, maxDecelMps2: 2.5 },
      {
        kind: "annotation",
        textBg: "Зеленото светна и пътят е чист — а колата стои и стои.",
      },
      // Arrive on red (~t 13), then a long freeze that spans the opening green
      // (green from t 20): > 5 s stationary on a clear green ⇒ HESITATION_AT_GREEN.
      { kind: "pause", sec: 14.0, brake: true },
      { kind: "drive", points: [[X_LANE, -30.7], [X_LANE, 10], [X_LANE, 47]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Изгубените секунди на зелено са също толкова изгубени, колкото и профуканите на червено — колоната зад теб чака теб.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpEcoCoastTraceName =
  | "shadow-correct"
  | "mistake-late-brake"
  | "mistake-sleep-at-green";

const SCRIPTS: Record<
  ScSpEcoCoastTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpEcoCoastShadowScript },
  "mistake-late-brake": { kind: "mistake", script: scSpEcoCoastMistakeLateBrakeScript },
  "mistake-sleep-at-green": { kind: "mistake", script: scSpEcoCoastMistakeSleepScript },
};

/**
 * Record one eco-coast drive against a loaded sx-v1 document — the red-light
 * approach pinned (signalOffsets), no staged events, ambient traffic zero.
 * Deterministic: same district → same trace (seed 7).
 */
export function recordScSpEcoCoastDrive(
  districtRaw: unknown,
  name: ScSpEcoCoastTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SP_ECO_COAST_ID,
    kind,
    seed: 7,
    stagedEvents: [] as StagedEventSpec[],
    signalOffsets: SIGNAL_OFFSETS,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
