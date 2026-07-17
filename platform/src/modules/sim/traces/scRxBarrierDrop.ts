/**
 * sc-rx-barrier-drop — the authored drives for „Бариерата тръгва надолу"
 * (RX-01, the DESCENDING barrier; ADR-006 stage 3a RAIL PACK) on the committed
 * rx-drop-v1 district (railCrossing zone span: track band @ y ∈ [150, 156],
 * guarded — А34, stop line y = 145, DETERMINISTIC barrier timetable OPEN at
 * spawn and down [20, 60) of every 90 s — the arm DESCENDS in front of the
 * player at t = 20). No staged actor: the barrier timetable is WORLD DATA —
 * same session, same phases, always.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: reaches the stop line (~t 20 s) as the barrier drops, waits at
 *     the line through the whole down-window [20, 60), then crosses in the
 *     open window [60, 90) → ZERO violations + CLEAN_DRIVING.
 *   - „Гмуркане под спускащата се бариера": approaches unhurried and dives onto
 *     the band at ~t 24 s (barred) without stopping → EXACTLY
 *     RAIL_CROSSING_VIOLATION, once, detail entered-barred;
 *   - „Спиране върху релсите": enters the band while still OPEN (~t 16 s) and
 *     then FREEZES on the track band as the barrier comes down → EXACTLY the same
 *     code, once, detail stopped-on-track — the entry is innocent (guarded +
 *     open, чл. 52), the REST is the kill.
 *
 * The two mistakes therefore share the ONE rail code but differ by DETAIL, the
 * same-code/different-detail discipline sc-rx-guarded uses for its own pair.
 *
 * Geometry pinned to content/world/rx-drop-v1.json: a 1+1 street on x = 0,
 * lane center x = 4.06, band [150, 156], stop line y = 145, barrier down
 * [20, 60) of 90 s, spawn rxd-spawn-start (4.06, 15) heading north, 300 m,
 * limit 50.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RX_BARRIER_DROP_ID = "sc-rx-barrier-drop";

/** The single northbound lane center of rx-drop-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — meet the drop, wait it out, cross after
// ---------------------------------------------------------------------------

export function scRxBarrierDropShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е охраняем жп прелез (А34). Бариерата е вдигната, но всеки момент може да тръгне надолу." },
      { kind: "glance", mirror: "rear" },
      // Arrive at the stop line ~t = 20 s — exactly as the arm starts down.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 146]], targetKmh: 28 },
      { kind: "annotation", textBg: "Бариерата тръгва надолу — спри зад стоп-линията и изчакай. Вдига се чак когато линията е чиста." },
      // Wait out the WHOLE down-window [20, 60): a 44 s hold from ~t 20 resumes
      // deep in the open window [60, 90).
      { kind: "pause", sec: 44, brake: true },
      { kind: "annotation", textBg: "Бариерата е вдигната напълно. Бърз оглед и премини решително — без спиране върху релсите." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 146], [X_LANE, 190]], targetKmh: 25, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 35 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: търпение пред спускащата се бариера, решително преминаване след пълното ѝ вдигане." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Гмуркане под спускащата се бариера" (entered-barred)
// ---------------------------------------------------------------------------

export function scRxBarrierDropMistakeDiveScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „ще успея преди влака“ — бариерата тръгва надолу, а колата се гмурка под нея." },
      { kind: "glance", mirror: "rear" },
      // Unhurried approach that reaches the band at ~t 26 s — well inside the
      // barred window [20, 60): the arm is already coming down.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 190]], targetKmh: 21, stopAtEnd: false },
      { kind: "annotation", textBg: "Бариерата слиза, защото влакът ВЕЧЕ е в участъка — надбягването с него е почти сигурна смърт." },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При спуснати или спускащи се бариери не се навлиза — никога (чл. 52)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Спиране върху релсите" (stopped-on-track)
// ---------------------------------------------------------------------------

export function scRxBarrierDropMistakeStopOnTrackScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: влиза на прелеза при вдигната бариера… но се колебае и спира върху коловоза." },
      { kind: "glance", mirror: "rear" },
      // Enter the band while it is STILL OPEN (~t 16 s), braking to a halt ON
      // the rails at y = 153 — the entry is innocent (guarded + open), the rest
      // is the kill.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 153]], targetKmh: 42 },
      { kind: "annotation", textBg: "…и замръзва между релсите точно когато бариерата тръгва надолу над колата." },
      // Freeze on the band well past the 2 s rail-rest threshold.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Върху релсите не се спира никога — премини на едно движение и спри чак отвъд коловоза." },
      { kind: "drive", points: [[X_LANE, 153], [X_LANE, 190]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRxBarrierDropTraceName =
  | "shadow-correct"
  | "mistake-dive-barrier"
  | "mistake-stop-on-track";

const SCRIPTS: Record<
  ScRxBarrierDropTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scRxBarrierDropShadowScript },
  "mistake-dive-barrier": { kind: "mistake", script: scRxBarrierDropMistakeDiveScript },
  "mistake-stop-on-track": { kind: "mistake", script: scRxBarrierDropMistakeStopOnTrackScript },
};

/**
 * Record one of the three drives against a loaded rx-drop-v1 document — no
 * staged events (the barrier timetable is world data), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScRxBarrierDropDrive(
  districtRaw: unknown,
  name: ScRxBarrierDropTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RX_BARRIER_DROP_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
