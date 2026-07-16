/**
 * sc-ov-bus-lane — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Бус лента" (SN-05, ADR-006 stage 2b BUS LANES) on
 * the committed ov-bus-v1 district (2+2 boulevard; BUS busLane span @
 * y ∈ [90, 330] — the CURB lane is a bus lane). NO staged actor, ambient
 * traffic zero (the harness law) — the only gradable act is which lane the
 * driver travels.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: moves LEFT into the general lane BEFORE the span, travels it
 *     through the whole span (24+ s — far past the keep-right 12 s sustain,
 *     the SN-05 interplay proof: NOT_KEEPING_RIGHT provably does NOT fire),
 *     returns right AFTER the span → ZERO violations + CLEAN_DRIVING +
 *     SAFE_LANE_CHANGE (both changes signalled + mirrored);
 *   - „Пътуване по бус лентата": never leaves the curb lane — cruises the bus
 *     lane through the whole span → EXACTLY DRIVING_IN_BUS_LANE (основна);
 *   - „Само да задмина колоната": correctly in the general lane, then dips
 *     back INTO the bus lane mid-span and rides it ~11 s → EXACTLY
 *     DRIVING_IN_BUS_LANE; the signalled changes stay commendations — the
 *     graded fault is the TRAVEL, not the signalling.
 *
 * Geometry pinned to content/world/ov-bus-v1.json: a 2+2 road on x = 0,
 * right (bus) lane center x = 12.19, left (general) x = 4.06 (boundary
 * x = 8.125); BUS span [90, 330]; spawn ovbus-spawn-start (12.19, 15) heading
 * north; 500 m, limit 50.
 */

import { SC_OV_BUS_LANE } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_BUS_LANE_ID = "sc-ov-bus-lane";

/** Right (bus) and left (general) lane centers of ov-bus-v1. */
const X_BUS = 12.19;
const X_GENERAL = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the general lane through the span
// ---------------------------------------------------------------------------

export function scOvBusLaneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред дясната лента става бус лента (BUS) — мястото на колата е в общата лента." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_BUS, 15], [X_BUS, 50]], targetKmh: 35, stopAtEnd: false },
      // Signalled move into the GENERAL lane BEFORE the span begins
      // (boundary crossed ≈ y 67 < 90).
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_BUS, 50], [8.1, 67], [X_GENERAL, 84]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The whole span in the general lane — 240 m ≈ 24 s: the keep-right
      // rule must stay silent (the bus lane is not a required lane).
      { kind: "drive", points: [[X_GENERAL, 84], [X_GENERAL, 210], [X_GENERAL, 338]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Краят на бус лентата — огледало, мигач и обратно вдясно." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_GENERAL, 338], [8.1, 353], [X_BUS, 368]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_BUS, 368], [X_BUS, 468]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така: общата лента покрай бус лентата, и вдясно чак след края ѝ." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Пътуване по бус лентата" (DRIVING_IN_BUS_LANE)
// ---------------------------------------------------------------------------

export function scOvBusLaneMistakeCruiseScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: бус лентата е празна — и колата просто остава да пътува по нея." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_BUS, 15], [X_BUS, 120], [X_BUS, 340]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Празната бус лента пак е бус лента — движението на автомобили по нея е забранено." },
      { kind: "drive", points: [[X_BUS, 340], [X_BUS, 460]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Пътувай в общата лента — бус лентата пази разписанието на градския транспорт." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Само да задмина колоната" (DRIVING_IN_BUS_LANE)
// ---------------------------------------------------------------------------

export function scOvBusLaneMistakeDipInScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: започва правилно в общата лента — но „колоната е бавна“…" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_BUS, 15], [X_BUS, 48]], targetKmh: 35, stopAtEnd: false },
      // The correct pre-span move into the general lane…
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_BUS, 48], [8.1, 63], [X_GENERAL, 78]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_GENERAL, 78], [X_GENERAL, 150]], targetKmh: 35, stopAtEnd: false },
      // …then the dip back INTO the bus lane mid-span, „just to get ahead".
      { kind: "annotation", textBg: "…и се връща в бус лентата, „само да мине по-бързо“." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_GENERAL, 150], [8.1, 164], [X_BUS, 178]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // ~11 s of TRAVEL in the bus lane — the graded act.
      { kind: "drive", points: [[X_BUS, 178], [X_BUS, 290]], targetKmh: 35, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_BUS, 290], [8.1, 304], [X_GENERAL, 318]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_GENERAL, 318], [X_GENERAL, 336]], targetKmh: 35, stopAtEnd: false },
      // The legal return right — AFTER the span end (330).
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_GENERAL, 336], [8.1, 350], [X_BUS, 364]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_BUS, 364], [X_BUS, 455]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Бус лентата се пресича само за завой надясно или спиране до бордюра — не се пътува по нея." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvBusLaneTraceName = "shadow-correct" | "mistake-cruise" | "mistake-dip-in";

const SCRIPTS: Record<
  ScOvBusLaneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvBusLaneShadowScript },
  "mistake-cruise": { kind: "mistake", script: scOvBusLaneMistakeCruiseScript },
  "mistake-dip-in": { kind: "mistake", script: scOvBusLaneMistakeDipInScript },
};

/**
 * Record one of the three drives against a loaded ov-bus-v1 document — no
 * staged events, ambient traffic zero (the harness law). Deterministic: same
 * district → same trace.
 */
export function recordScOvBusLaneDrive(
  districtRaw: unknown,
  name: ScOvBusLaneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_BUS_LANE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_BUS_LANE.staged ?? [])],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
