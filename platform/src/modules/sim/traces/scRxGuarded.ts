/**
 * sc-rx-guarded — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Охраняем прелез с бариера" (RX-01, ADR-006 stage 3a)
 * on the committed rx-guarded-v1 district (railCrossing zone span: track band
 * @ y ∈ [150, 156], guarded — А34, stop line y = 145, DETERMINISTIC barrier
 * timetable down [0, 40) of every 90 s cycle). No staged actor: the barrier
 * timetable is WORLD DATA — same session, same phases, always.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: arrives at the lowered barrier (~t 20 s), waits at the stop
 *     line until the lift (t = 40), then crosses after the lift → ZERO
 *     violations + CLEAN_DRIVING. (The pure LEGAL-ASYMMETRY proof — crossing
 *     a guarded-OPEN crossing with NO stop at all is legal, чл. 52 — lives in
 *     the rail-district battery and the detector unit tests, where a
 *     stop-free open-window transit of THIS map grades zero violations.)
 *   - „Навлизане при спуснати бариери": blasts across the band at ~t 18 s
 *     (barred) → EXACTLY RAIL_CROSSING_VIOLATION, once (detail
 *     entered-barred);
 *   - „Промъкване покрай бариерата": polite stop at the line, then creeps
 *     across at ~10 km/h while still barred → EXACTLY the same code, once —
 *     a stop does NOT acquit a barred entry.
 *
 * Geometry pinned to content/world/rx-guarded-v1.json: a 1+1 street on x = 0,
 * lane center x = 4.06, band [150, 156], stop line y = 145, barrier down
 * [0, 40) of 90 s, spawn rxg-spawn-start (4.06, 15) heading north, 300 m,
 * limit 50.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RX_GUARDED_ID = "sc-rx-guarded";

/** The single northbound lane center of rx-guarded-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait out the barrier, cross after it
// ---------------------------------------------------------------------------

export function scRxGuardedShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е охраняем жп прелез (А34) — бариерите са спуснати: минава влак." },
      { kind: "glance", mirror: "rear" },
      // Arrive at the stop line ~t = 20 s (barrier down until t = 40).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 146]], targetKmh: 28 },
      { kind: "annotation", textBg: "Спри зад стоп-линията и изчакай — бариерата се вдига чак когато линията е чиста." },
      // Wait past the lift (26 s from ~t 20 → resume ~t 46 > 40, deep in the
      // open window [40, 90)).
      { kind: "pause", sec: 26, brake: true },
      { kind: "annotation", textBg: "Бариерите са вдигнати напълно. Бърз оглед и премини решително — без спиране върху релсите." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 146], [X_LANE, 190]], targetKmh: 25, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 35 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: търпение пред бариерата, решително преминаване след пълното ѝ вдигане." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Навлизане при спуснати бариери" (RAIL_CROSSING_VIOLATION)
// ---------------------------------------------------------------------------

export function scRxGuardedMistakeRunBarrierScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „ще мина преди влака“ — колата се хвърля през прелеза при спуснати бариери." },
      { kind: "glance", mirror: "rear" },
      // Band entry at ~t 18 s — deep inside the barred window [0, 40).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 190]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Бариерата слиза, защото влакът ВЕЧЕ е в участъка — надбягването с него е почти сигурна смърт." },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При спуснати или спускащи се бариери не се навлиза — никога (чл. 51–52)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Промъкване покрай бариерата" (RAIL_CROSSING_VIOLATION)
// ---------------------------------------------------------------------------

export function scRxGuardedMistakeCreepBarredScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: спира учтиво пред бариерата… но не изчаква и тръгва да се промъква." },
      { kind: "glance", mirror: "rear" },
      // A polite stop at the line (~t 20 s — the barrier is still down)…
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 146]], targetKmh: 28 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "annotation", textBg: "…и пропълзява през коловоза при още спуснати бариери — учтивото спиране не оправдава нищо." },
      // …then a creep across the band at ~10 km/h, still deep in [0, 40):
      // the barred ENTRY convicts; the slow transit never rests on the band.
      { kind: "drive", points: [[X_LANE, 146], [X_LANE, 175]], targetKmh: 10, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 175], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Забраната важи до ПЪЛНОТО вдигане на бариерите — „бавно и внимателно“ върху релсите не съществува." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRxGuardedTraceName =
  | "shadow-correct"
  | "mistake-run-barrier"
  | "mistake-creep-barred";

const SCRIPTS: Record<
  ScRxGuardedTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scRxGuardedShadowScript },
  "mistake-run-barrier": { kind: "mistake", script: scRxGuardedMistakeRunBarrierScript },
  "mistake-creep-barred": { kind: "mistake", script: scRxGuardedMistakeCreepBarredScript },
};

/**
 * Record one of the three drives against a loaded rx-guarded-v1 document —
 * no staged events (the barrier timetable is world data), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScRxGuardedDrive(
  districtRaw: unknown,
  name: ScRxGuardedTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RX_GUARDED_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
