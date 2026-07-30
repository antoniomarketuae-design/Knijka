/**
 * scSignalHesitation — the authored drives (doc 76 §5/§9) for the SIGNALS-family
 * template sc-signal-hesitation (doc 72 JU-09 „Спане на зелено / Green
 * hesitation") on the committed sx-v1 signalized X-junction.
 *
 * The capability under test: HESITATION_AT_GREEN — DVSA explicitly fails
 * „waiting at a green filter light when it's safe to proceed"; BG examiners
 * mark „закъснели действия". The detector (engine.ts) fires when the driver is
 * STATIONARY within 12 m of a GREEN traffic-light line, box clear (no lead),
 * indicator off, engine running, for 5 s. The recorder pins sx-n-c's phase
 * GREEN over the whole encounter via signalOffsets (offset 44) so the light is
 * unambiguously green while the demos freeze.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: sees green + a clear box and PROCEEDS without freezing → ZERO
 *     violations (green is go);
 *   - „Замръзване на зелено": stops at the line on green and sits ~7 s →
 *     grades EXACTLY HESITATION_AT_GREEN;
 *   - „Изпуснато зелено": stops short of the line on green and sits ~8 s (the
 *     green-filter freeze that blocks the queue) → EXACTLY HESITATION_AT_GREEN.
 *
 * Geometry pinned to content/world/sx-v1.json (battery sx-district.test.ts):
 *   south stem, ns stop line at y = −27.725, drawn lane center x = 4.0625,
 *   spawn sx-spawn-south (4.06, −105) heading north. No staged conflict — the ONLY
 *   thing the stack grades is the hesitation (the drives cross straight through
 *   on green, so no priority/turn code arms).
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIGNAL_HESITATION_ID = "sc-signal-hesitation";

/** Drawn lane-center offset on sx-v1, m. */
const LANE = 4.0625;

/**
 * Green-at-the-encounter pin for sx-v1 (the doc 72 N2 dial): sx-n-c offset 44
 * shows GREEN across the whole approach + sit window (well before the demos
 * reach the line through past their ~8 s freeze), so the light is unambiguously
 * green while the hesitation clock runs. SIGNAL_TIMING cycle 50.
 */
export const SX_PIN_NS_GREEN_HOLD = { "sx-n-c": 44 } as const;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — green + clear box, proceed without delay
// ---------------------------------------------------------------------------

function scSignalHesitationShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Светофарът напред свети ЗЕЛЕНО и кутията е чиста — на зелено се тръгва без бавене." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 28 },
      { kind: "annotation", textBg: "Готовност: намали леко, увери се, че напред е чисто — и премини, без да спираш излишно." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Straight through the box on green WITHOUT freezing (min speed stays
        // well above a full stop, so the hesitation clock never arms).
        kind: "drive",
        points: [[LANE, -45], [LANE, -28.6], [LANE, -10], [LANE, 20], [LANE, 45]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така: зелено и чисто напред — тръгваш веднага, без да блокираш кръстовището." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Замръзване на зелено" (HESITATION_AT_GREEN)
// ---------------------------------------------------------------------------

function scSignalHesitationMistakeFreezeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: светофарът е зелен и напред е чисто, но колата спира и не тръгва." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -40]], targetKmh: 25 },
      { kind: "drive", points: [[LANE, -40], [LANE, -28.6]], targetKmh: 12 },
      { kind: "annotation", textBg: "Зелено е, чисто е — а колата стои. Всяка секунда бавене блокира кръстовището и колоната отзад." },
      // A full freeze on green with a clear box → HESITATION_AT_GREEN (> 5 s).
      { kind: "pause", sec: 7.0, brake: true },
      { kind: "drive", points: [[LANE, -28.6], [LANE, -10], [LANE, 20], [LANE, 45]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "На зелено с чист път се тръгва за секунда-две — замразяването е закъсняло действие (1 т.)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изпуснато зелено" (HESITATION_AT_GREEN)
// ---------------------------------------------------------------------------

function scSignalHesitationMistakeFilterScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „изпуснато зелено“: колата спира преди линията и се колебае цяла вечност на зелено." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -40]], targetKmh: 25 },
      // Stops short of the line (still inside the 12 m watch window) and dithers.
      { kind: "drive", points: [[LANE, -40], [LANE, -30.0]], targetKmh: 12 },
      { kind: "annotation", textBg: "Зелено, чисто — но колата чака „за всеки случай“ и държи цялото кръстовище блокирано." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "drive", points: [[LANE, -30.0], [LANE, -10], [LANE, 20], [LANE, 45]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Зеленото е за движение: чист път напред означава тръгвай, а не изчаквай — иначе задържаш всички." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSignalHesitationTraceName = "shadow-correct" | "mistake-freeze" | "mistake-filter";

const SCRIPTS: Record<ScSignalHesitationTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scSignalHesitationShadowScript },
  "mistake-freeze": { kind: "mistake", script: scSignalHesitationMistakeFreezeScript },
  "mistake-filter": { kind: "mistake", script: scSignalHesitationMistakeFilterScript },
};

/**
 * Record one hesitation drive against a loaded sx-v1 document — sx-n-c pinned
 * GREEN over the encounter (signalOffsets), no staged conflict, ambient traffic
 * zero (the harness law). Deterministic: same district → same trace (seed 7).
 */
export function recordScSignalHesitationDrive(
  districtRaw: unknown,
  name: ScSignalHesitationTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SIGNAL_HESITATION_ID,
    kind,
    seed: 7,
    signalOffsets: SX_PIN_NS_GREEN_HOLD,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
