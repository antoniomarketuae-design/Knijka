/**
 * sc-pe-parked-row-scan — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Покрай редицата паркирани коли" (PE-04, the sustained
 * parked-row scan) on the committed pe-child-v1 district, recorded with the
 * template's OWN staged runner (pedestrianDartOut sc-prs-child, 2.6 m/s off the
 * EAST curb — single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (rode ~28 with the brake
 *     covered the whole row, half a metre off the cars, stopped for the late
 *     dart, waited it out);
 *   - „50 покрай редицата" grades EXACTLY SPEEDING_OVER_LIMIT + COLLISION (held
 *     ~47 in the 40 zone the length of the row → the minor-speeding episode
 *     fires and latches BEFORE the figure is on the driving surface, then the
 *     strike lands while it is still emerging from behind the row — occupancy
 *     never flips, so no too-fast and no not-yielded pile on);
 *   - „плътно покрай колите" grades EXACTLY COLLISION (a legal ~27 km/h hugging
 *     the row, no brake — struck the child as it cleared the cars; stays under
 *     the 30 km/h crossing-approach cap and never passes the line, so the ONLY
 *     code is the authored contact).
 *
 * Geometry pinned to content/world/pe-child-v1.json: street on x = 0, right-lane
 * center x = 4.06, zebra pe-x-1 at y = 78, spawn pe-spawn-approach (4.06, 15)
 * heading north, limit 40 km/h. The fast-row demo opens a few metres south of the
 * spawn (y = 8): the driver is already carrying speed INTO the recorded row —
 * they never slowed for it — which is the whole point, and it gives the 40-zone
 * minor-speeding episode (band 44–50, sustained 2 s) comfortable room to fire
 * before the late strike. Mistake drives only replay through the rule engine, so
 * the pre-spawn start touches no session (S10).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_PE_PARKED_ROW_SCAN } from "../lessons/scenario/templates-pe2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PE_PARKED_ROW_SCAN_ID = "sc-pe-parked-row-scan";

/** Northbound right-lane center of pe-child-v1. */
const X_LANE = 4.06;
/** Half a metre left of the row/lane-center — the shadow's sight-line offset. */
const X_LEFT = 3.5;
/** Hugging the right-side parked row — mistake 2's closed sight line. */
const X_HUG = 5.0;
/** The staged crossing pe-x-1. */
const Y_ZEBRA = 78;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scPeParkedRowScanShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Дълга редица паркирани коли отдясно — свали скоростта и се премести леко наляво за видимост." },
      { kind: "glance", mirror: "rear" },
      // ~28 km/h (под прага 30 за пътека), с покрита спирачка по цялата редица.
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 40]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Спирачката е покрита по цялата дължина — дете може да излезе между всеки две коли." },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_LEFT, 40], [X_LEFT, 62]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Дете изскача между колите на пътеката! Спирачка, право напред, без завиване." },
      // Firm, planned stop ~7 m short of the crossing line.
      { kind: "drive", points: [[X_LEFT, 62], [X_LEFT, Y_ZEBRA - 7]], targetKmh: 28 },
      // Wait the child out — the 2.6 m/s runner clears the carriageway in ~7 s.
      { kind: "pause", sec: 8, brake: true },
      { kind: "annotation", textBg: "Изчакай детето да освободи цялото платно — не потегляй под носа му." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      { kind: "drive", points: [[X_LEFT, Y_ZEBRA - 7], [X_LEFT, 106], [X_LEFT, 120]], targetKmh: 24 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: караше бавно и наляво покрай редицата, с покрита спирачка, и спря за изскочилото дете." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „50 покрай редицата" (SPEEDING_OVER_LIMIT + COLLISION)
// ---------------------------------------------------------------------------

export function scPeParkedRowScanMistakeFastRowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата държи близо 50 покрай редицата — детето остава невидимо до последно.",
      },
      { kind: "glance", mirror: "rear" },
      // Carry ~47 km/h (44 < v ≤ 50 → minor speeding in the 40 zone) the length
      // of the row. Opens at y = 8 (already at speed into the row) so the 2-s
      // minor-speeding episode fires and latches well before the late strike.
      { kind: "drive", points: [[X_LANE, 8], [X_LANE, 45]], targetKmh: 47, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 45], [X_LANE, Y_ZEBRA - 2]], targetKmh: 47, stopAtEnd: false },
      { kind: "annotation", textBg: "Дете изскача между колите — при тази скорост няма нито метри, нито секунда." },
      // The authored consequence: struck as it emerges from behind the row,
      // before occupancy flips (roadFromM 4) — the ONLY crossing outcome.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Превишаването покрай редицата се отсъжда самостоятелно (чл. 21); ударът прекратява изпита (чл. 20).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „плътно покрай колите" (COLLISION)
// ---------------------------------------------------------------------------

export function scPeParkedRowScanMistakeHugRowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата се движи плътно покрай паркираните коли, макар вляво да е свободно.",
      },
      { kind: "glance", mirror: "rear" },
      // ~27 km/h — legal AND under the 30 km/h crossing-approach cap (no
      // speeding, no too-fast). The fault is the closed sight line, hugging the
      // row: no braking, the child appears under the bumper.
      { kind: "drive", points: [[X_HUG, 15], [X_HUG, 50]], targetKmh: 27, stopAtEnd: false },
      { kind: "drive", points: [[X_HUG, 50], [X_HUG, Y_ZEBRA - 4]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "Детето между колите се появи под самата броня — плътно покрай тях гледката е затворена." },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Половин метър наляво връщаше и гледката, и спирачния резерв — ударът щеше да е спиране (чл. 20).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPeParkedRowScanTraceName = "shadow-correct" | "mistake-fast-row" | "mistake-hug-row";

const SCRIPTS: Record<
  ScPeParkedRowScanTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPeParkedRowScanShadowScript },
  "mistake-fast-row": { kind: "mistake", script: scPeParkedRowScanMistakeFastRowScript },
  "mistake-hug-row": { kind: "mistake", script: scPeParkedRowScanMistakeHugRowScript },
};

/**
 * Record one of the three drives against a loaded pe-child-v1 document — the
 * TEMPLATE's staged child runner armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScPeParkedRowScanDrive(
  districtRaw: unknown,
  name: ScPeParkedRowScanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PE_PARKED_ROW_SCAN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PE_PARKED_ROW_SCAN.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
