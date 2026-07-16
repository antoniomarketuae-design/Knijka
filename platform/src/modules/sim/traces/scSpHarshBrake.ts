/**
 * sc-sp-harsh-brake — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Рязко спиране без причина" (SP-11 / VP-09) on the
 * committed sp-creep-v1 district (map REUSED from sc-speed-creep). No staged
 * actors, ambient traffic ZERO (seed 7), dry day, no crossing/junction/signal
 * on the map: every cause in the HARSH_BRAKING_NO_CAUSE ledger is positively
 * absent, so the ONLY thing that decides the grade is HOW the car brakes.
 *
 * The capability seam is the recorder's drive.maxDecelMps2 override: the
 * default 4.6 m/s² stop envelope tracks ~3.2 m/s² (0.7 ×) — under the 7 m/s²
 * emergency threshold — while the mistakes pass 12 ⇒ a sustained ~8.4–12 m/s²
 * slam the detector grades (onset ≥ 35 km/h, ≥ 0.4 s sustain).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: cruise ~45, the SAME stop planned early and braked
 *     progressively at the control zone, resume, finish → ZERO violations +
 *     CLEAN_DRIVING (the progressive stop proves the innocent side of the
 *     exact maneuver the mistakes slam);
 *   - „Фантомно спиране": a 12 m/s²-envelope slam from 47 km/h to a dead stop
 *     mid-block → EXACTLY HARSH_BRAKING_NO_CAUSE;
 *   - „Рязък натиск до пълзене": a panic stab from 47 km/h down to a crawl
 *     (no full stop — the detector grades the decel, not the standstill) →
 *     EXACTLY HARSH_BRAKING_NO_CAUSE.
 *
 * Geometry pinned to content/world/sp-creep-v1.json: street on x = 0,
 * right-lane center x = 4.06, spawn sp-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. All drives stay on x = 4.06 (centered)
 * and under 50 km/h so no speed/lane code can leak.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SP_HARSH_BRAKE } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SP_HARSH_BRAKE_ID = "sc-sp-harsh-brake";

/** Northbound right-lane center of sp-creep-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the planned, progressive stop
// ---------------------------------------------------------------------------

export function scSpHarshBrakeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Планирано спиране: решението пада рано, газта се вдига първа, спирачката е постепенна." },
      { kind: "glance", mirror: "rear" },
      // Default 4.6 envelope → a ~3.2 m/s² progressive stop at the control
      // zone (y = 180): the CORRECT version of the exact stop the mistakes slam.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 181]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Плавно и предвидимо: движещият се зад теб видя стоповете навреме и има място да реагира." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 181], [X_LANE, 260]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Отново в движение: равномерна скорост и поглед далеч напред — следващото спиране пак се планира отрано." },
      { kind: "drive", points: [[X_LANE, 260], [X_LANE, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спокойна скорост, планирано спиране, нито едно рязко набиване." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Фантомно спиране" (slam to a dead stop, no cause)
// ---------------------------------------------------------------------------

export function scSpHarshBrakeMistakePhantomScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „стори ми се, че нещо мръдна“ — спирачките се забиват до дупка на празна улица." },
      // The 12 m/s² envelope turns the SAME planned stop into an emergency
      // slam: braking starts ~10 m before rest instead of ~25.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 181]], targetKmh: 47, maxDecelMps2: 12 },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Пред колата няма нищо — а движещият се отзад няма как да очаква това спиране." },
      { kind: "drive", points: [[X_LANE, 181], [X_LANE, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Съмняваш ли се — вдигни газта и намали плавно; силната спирачка е за истинска опасност." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Рязък натиск до пълзене" (panic stab, no full stop)
// ---------------------------------------------------------------------------

export function scSpHarshBrakeMistakeStabScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: сянка между паркираните коли — и паническо набиване от 47 км/ч до пълзене." },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 47, stopAtEnd: false },
      // The stab: 12 m/s² down to a 10 km/h crawl — no standstill, the decel
      // itself is the graded fault.
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 165]], targetKmh: 10, maxDecelMps2: 12, stopAtEnd: false },
      { kind: "annotation", textBg: "Никаква реална опасност на пътя — само стопове, светнали твърде късно за този отзад." },
      { kind: "drive", points: [[X_LANE, 165], [X_LANE, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дори без пълно спиране рязкото забавяне без причина е същата грешка — предпоставка за удар отзад." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpHarshBrakeTraceName = "shadow-correct" | "mistake-phantom-stop" | "mistake-stab-crawl";

const SCRIPTS: Record<
  ScSpHarshBrakeTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpHarshBrakeShadowScript },
  "mistake-phantom-stop": { kind: "mistake", script: scSpHarshBrakeMistakePhantomScript },
  "mistake-stab-crawl": { kind: "mistake", script: scSpHarshBrakeMistakeStabScript },
};

/**
 * Record one of the three drives against a loaded sp-creep-v1 document — no
 * staged actors, ambient traffic zero, dry day. Deterministic: same district →
 * same trace.
 */
export function recordScSpHarshBrakeDrive(
  districtRaw: unknown,
  name: ScSpHarshBrakeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SP_HARSH_BRAKE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SP_HARSH_BRAKE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
