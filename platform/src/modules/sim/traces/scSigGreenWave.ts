/**
 * scSigGreenWave — the authored drives (doc 76 §5/§9) for the SIGNALS-family
 * template sc-sig-green-wave („Зелена вълна") on the committed sig-wave-v1
 * avenue (tools/maps/gen_sig_wave.mjs): three signalized X-junctions 264 m
 * apart on one 50 km/h arterial.
 *
 * NO signalOffsets (the deliberate difference from every other signals trace):
 * the wave lives in the MAP. sig-wave-v1's signal nodes are named so that the
 * runtime's own fnv1a offsets come out 36 / 17 / 48 s — exactly 19 s apart —
 * and 19 s at 50 km/h is exactly the 264 m block. A driver holding the limit
 * therefore meets the IDENTICAL cycle-local phase at all three lamps, and the
 * recorder needs no dial at all: what the ghost rides here is what a live
 * student's session builds from the same JSON (the generator's wave self-check
 * is the guarantee).
 *
 * The measured envelope (probe against the production stack — the numbers the
 * three scripts below are tuned to):
 *   - a prompt 50 km/h departure from sw-spawn-south crosses the FIRST stop
 *     line ≈ 22 s in, i.e. ≈ 8 s into that lamp's 20 s green, and then meets
 *     green ≈ 8 s in at both remaining lamps — the wave, ridden;
 *   - the SAME drive at 58 km/h arrives ~2.6 s earlier per block and stares at
 *     RED from ~120 m out on every approach — the sprint gains nothing except
 *     a red windscreen, because a green wave punishes the EARLY;
 *   - between the lamps there is a genuine causeless-braking window: past
 *     y ≈ 305 the next stop line is > 120 m away (undefined to the tick) and
 *     the last junction is > 35 m behind, so every entry in the
 *     HARSH_BRAKING_NO_CAUSE ledger is positively absent and a slam there is
 *     graded as the phantom it is.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: locks 49.9 km/h, sails all three greens → ZERO violations;
 *   - „Спринт до всяко червено": 58 km/h between the lamps (→ SPEEDING_OVER_LIMIT)
 *     plus a 12 m/s² phantom slam in the block-2 window (→ HARSH_BRAKING_NO_CAUSE),
 *     ending stopped at the third line — EXACTLY those two codes;
 *   - „Заспиване на потеглящото зелено": rides the wave to the second lamp,
 *     stops at its GREEN line and sits 7 s → EXACTLY HESITATION_AT_GREEN.
 *
 * Geometry pinned to content/world/sig-wave-v1.json (battery
 * sig-wave-districts.test.ts): avenue on x = 0, northbound right-lane center
 * 4.0625, limit 50; signals at y = 0 / 264 / 528; their northbound stop lines
 * at y = −27.725 / 236.275 / 500.275; spawn sw-spawn-south (0, −289) heading
 * north. No staged actors, ambient traffic zero, dry day: the ONLY thing the
 * stack grades is how the driver spends the avenue.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIG_GREEN_WAVE_ID = "sc-sig-green-wave";

/** Northbound right-lane center of sig-wave-v1's avenue, m. */
const LANE = 4.0625;
/** Northbound stop line of the SECOND signal (sw-n-tl2 at y = 264), m. */
const LINE_2 = 236.275;
/** Northbound stop line of the THIRD signal (sw-n-tl3 at y = 528), m. */
const LINE_3 = 500.275;
/** Rest position 3.3 m short of a line: clear of stopOvershootCenterM (1.2 m),
 *  inside the hesitation watch window (12 m) — where a car BELONGS at a light. */
const REST_2 = LINE_2 - 3.3;
const REST_3 = LINE_3 - 3.3;

/** Spawn → lane-center merge, shared by all three drives (sw-spawn-south). */
const LEAD_IN: ReadonlyArray<readonly [number, number]> = [
  [0, -289],
  [0, -287],
  [LANE, -270],
  [LANE, -30],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — lock 50, ride all three greens
// ---------------------------------------------------------------------------

function scSigGreenWaveShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Три светофара на един булевард, съгласувани помежду си: при 50 км/ч зеленото „пътува“ с теб.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [...LEAD_IN], targetKmh: 50, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Първият светофар става зелен, докато си още на 100 метра — не ускоряваш, само задържаш 50.",
      },
      {
        // One continuous 50 km/h run through all three lamps: 264 m per block =
        // 19 s = exactly the offset gap, so the phase repeats identically.
        kind: "drive",
        points: [
          [LANE, -30],
          [LANE, 264],
          [LANE, 528],
          [LANE, 620],
        ],
        targetKmh: 50,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Второто зелено дойде само — вълната е настроена точно за 50 км/ч, а ти си в нея.",
      },
      {
        kind: "annotation",
        textBg: "И третото: три светофара, нито едно спиране. Равномерната скорост е по-бърза от спринта — и харчи наполовина.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спринт до всяко червено"
// (SPEEDING_OVER_LIMIT + HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

function scSigGreenWaveMistakeSprintScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „ще ги хвана всичките“ — газта до дупка между светофарите.",
      },
      { kind: "glance", mirror: "rear" },
      // 58 km/h: over the 55 km/h graced limit (→ SPEEDING_OVER_LIMIT) but under
      // the +10 опасна band, so the demo grades minor speeding and nothing else.
      { kind: "drive", points: [...LEAD_IN], targetKmh: 58, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "58 в петдесетака. Първите два светофара пак са зелени — но ти пристигаш при тях преди вълната, не с нея.",
      },
      {
        kind: "drive",
        points: [
          [LANE, -30],
          [LANE, 264],
          [LANE, 320],
        ],
        targetKmh: 58,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Третият светофар е червен и е далеч — а кракът вече е на спирачката.",
      },
      // The phantom slam: y 320 → 345 sits in the measured causeless window
      // (next line > 120 m ahead, last junction > 35 m behind, no lead, no
      // crossing, on the lane center). 12 m/s² ⇒ a sustained ~12 m/s² stab,
      // far over the 7 m/s² emergency threshold.
      { kind: "drive", points: [[LANE, 320], [LANE, 345]], targetKmh: 8, maxDecelMps2: 12, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Пред колата няма нищо — стоп-линията е на 180 метра. Такова заковаване насред отсечката е предпоставка за удар отзад.",
      },
      // And he floors it again — in character, and the point: even the second
      // sprint does not buy back the seconds the slam cost.
      { kind: "drive", points: [[LANE, 345], [LANE, 620]], targetKmh: 58 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "И сметката: третото зелено е същото, но ти стигна до него ПО-КЪСНО от този, който не вдигна над 50. Нула спечелено време, двойно гориво, две отсъдени грешки.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заспиване на потеглящото зелено" (HESITATION_AT_GREEN)
// ---------------------------------------------------------------------------

function scSigGreenWaveMistakeSleepScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката е огледалната: вълната е под теб, но реакцията липсва.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [...LEAD_IN], targetKmh: 50, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Първият светофар — зелен, минат по учебник. Скоростта е точната.",
      },
      { kind: "drive", points: [[LANE, -30], [LANE, REST_2]], targetKmh: 50 },
      {
        kind: "annotation",
        textBg: "Вторият също свети ЗЕЛЕНО и пътят е чист — а колата спира на линията и стои.",
      },
      // A full freeze on a green line with a clear box → HESITATION_AT_GREEN
      // (> 5 s). 7 s keeps the whole freeze inside that lamp's green, so the
      // demo grades the hesitation and never a yellow/red crossing.
      { kind: "pause", sec: 7, brake: true },
      { kind: "drive", points: [[LANE, REST_2], [LANE, REST_3]], targetKmh: 50 },
      { kind: "pause", sec: 3, brake: true },
      {
        kind: "annotation",
        textBg: "Седемте изгубени секунди не се връщат: вълната замина напред и третият светофар вече не е твой. Едно заспиване изяжда цялата отсечка.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSigGreenWaveTraceName = "shadow-correct" | "mistake-sprint" | "mistake-sleep-at-green";

const SCRIPTS: Record<
  ScSigGreenWaveTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSigGreenWaveShadowScript },
  "mistake-sprint": { kind: "mistake", script: scSigGreenWaveMistakeSprintScript },
  "mistake-sleep-at-green": { kind: "mistake", script: scSigGreenWaveMistakeSleepScript },
};

/**
 * Record one green-wave drive against a loaded sig-wave-v1 document. No staged
 * actors, ambient traffic zero, dry day — and deliberately NO signalOffsets:
 * the district's own fnv1a offsets ARE the wave (see the header), so the ghost
 * and the live session read the same three lamps. Deterministic: same district
 * → same trace (seed 7).
 */
export function recordScSigGreenWaveDrive(
  districtRaw: unknown,
  name: ScSigGreenWaveTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SIG_GREEN_WAVE_ID,
    kind,
    seed: 7,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
