/**
 * sc-lane-change — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Смяна на лента" on the committed
 * ln-v1 district, recorded with the template's OWN staged target-lane pace car
 * (brakingLeadCar sc-lc-blindspot — single truth, imported from the template).
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + the SAFE_LANE_CHANGE commendation (mirror →
 *     signal → shoulder → move, the учебен ред);
 *   - „Престрояване без мигач" grades EXACTLY LANE_CHANGE_WITHOUT_INDICATOR;
 *   - „Престрояване без огледало" grades EXACTLY LANE_CHANGE_WITHOUT_MIRROR_CHECK.
 *
 * Geometry pinned to content/world/ln-v1.json: a 2+2 straight boulevard on
 * y ∈ [0, 400], RIGHT-lane center x = 12.19, LEFT-lane center x = 4.06 (lane
 * boundary x = 8.125), spawn ln-spawn-start (12.19, 15) heading north, limit
 * 50 km/h.
 *
 * Rule envelope the scripts respect (rules/engine.ts §3, cfg defaults): the
 * lane change grades when tick.laneId crosses the boundary at ≥ 10 km/h in a
 * forward gear. indicatorOk = a matching-direction indicator within
 * indicatorLookbackSec = 3 s; mirrorOk = a matching-direction glance within
 * mirrorLookbackSec = 5 s. So the shadow arms BOTH just before the crossing;
 * each mistake arms exactly one and withholds the other. The pace car is
 * deterministic moving traffic (its slam tier is authored out of the play
 * corridor in the template) and never grades — it is the blind-spot presence
 * the mirror check exists for, not a braking drill.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_LANE_CHANGE } from "../lessons/scenario/templates-flow";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_LANE_CHANGE_ID = "sc-lane-change";

/** Right-lane (start) and left-lane (target) centers of ln-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scLaneChangeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Установи се в дясната лента с постоянна скорост." },
      { kind: "glance", mirror: "rear" },
      // Settle in the RIGHT lane (satisfies the cruise objective at 12.19,150).
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 90], [X_RIGHT, 160]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Провери лявото огледало — в лявата лента зад теб има кола." },
      // The учебен ред, all inside the lookback windows before the crossing:
      // огледало (glance-left) → мигач (indicator-left) → рамо (a second
      // glance-left as the blind-spot check) → плавна маневра.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Ляв мигач, после бърз поглед през рамо към мъртвата зона." },
      { kind: "glance", mirror: "left" },
      {
        // Smooth diagonal into the LEFT lane — the laneId boundary (x = 8.125)
        // is crossed ~y = 195, ~2 s after the indicator armed.
        kind: "drive",
        points: [[X_RIGHT, 175], [10.0, 188], [6.0, 205], [X_LEFT, 225], [X_LEFT, 265]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 265], [X_LEFT, 300]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: огледало, мигач, рамо, маневра — по реда." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Престрояване без мигач" (LANE_CHANGE_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scLaneChangeMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: воланът тръгва наляво без ляв мигач." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 90], [X_RIGHT, 160]], targetKmh: 40, stopAtEnd: false },
      // The driver DID look (mirror is OK) — the isolated fault is the missing
      // indicator, so NO left-signal is ever armed.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Огледа се, но не подаде мигач — и се престрои." },
      {
        kind: "drive",
        points: [[X_RIGHT, 175], [10.0, 188], [6.0, 205], [X_LEFT, 225], [X_LEFT, 270]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мигачът предхожда маневрата: движещият се отзад в лявата лента няма как да предвиди престрояването ти без него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Престрояване без огледало" (LANE_CHANGE_WITHOUT_MIRROR_CHECK)
// ---------------------------------------------------------------------------

export function scLaneChangeMistakeNoMirrorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: мигач има, но воланът тръгва без поглед в огледалото." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 90], [X_RIGHT, 160]], targetKmh: 40, stopAtEnd: false },
      // The driver DID signal (indicator is OK) — the isolated fault is the
      // missing mirror/shoulder check, so NO left glance is ever made (the
      // rear glance above does not clear the left blind spot).
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Мигач — да. Но никакъв поглед наляво към мъртвата зона." },
      {
        kind: "drive",
        points: [[X_RIGHT, 175], [10.0, 188], [6.0, 205], [X_LEFT, 225], [X_LEFT, 270]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Огледалото не показва мъртвата зона — точно там се движеше кола. Редът е железен: огледало → мигач → рамо → маневра.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScLaneChangeTraceName =
  | "shadow-correct"
  | "mistake-no-indicator"
  | "mistake-no-mirror";

const SCRIPTS: Record<ScLaneChangeTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scLaneChangeShadowScript },
  "mistake-no-indicator": { kind: "mistake", script: scLaneChangeMistakeNoIndicatorScript },
  "mistake-no-mirror": { kind: "mistake", script: scLaneChangeMistakeNoMirrorScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged pace car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScLaneChangeDrive(
  districtRaw: unknown,
  name: ScLaneChangeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_LANE_CHANGE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_LANE_CHANGE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
