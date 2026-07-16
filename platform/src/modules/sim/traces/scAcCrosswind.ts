/**
 * sc-ac-crosswind — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Страничен вятър" (doc 72 AC-12, the crosswind
 * physics slice) on the committed fo-follow-v1 district (the plain 1+1
 * straight street sc-ac-highbeam-lead already reuses), recorded in DAY DRY.
 * No lane actors, ambient traffic ZERO (seed 7), no obstacles: the ONLY
 * gradable channel is the driver's lane position — exactly the doc-72 call
 * („the POOR_LANE_KEEPING detector would grade the outcome unchanged"), so
 * the slice ships with NO new rule code.
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, wind edition — read before
 * editing):
 *   - The LIVE student session runs REAL wind physics: LessonSpec.physics
 *     .crosswind → VehicleRig → VehicleSim windLateralN = −CROSSWIND_BRIDGE_N
 *     (west, toward the center line on this northbound street) + the
 *     deterministic gust sine. Measured: ≈1 m of downwind drift per 5 s
 *     hands-fixed at speed, compounding (vehicle/crosswind.test.ts).
 *   - These RECORDED demos are KINEMATIC (recorder.ts authored envelopes —
 *     the recorder never runs VehicleSim), so the wind truth must be
 *     AUTHORED: the drift-and-correct story is drawn INTO the polylines
 *     below (the shadow's small held-and-released deviation, the mistakes'
 *     line-crossing drifts), and the annotations carry the counter-steer
 *     teaching. The ghost tells the same story the live wind writes.
 *
 * The trace gate replays exactly these through the production stack, day dry:
 *   - shadow: slows to ~34 km/h for the exposed segment, meets the gusts with
 *     a SMALL steady correction (drift to x ≈ 3.3, ~0.8 m — far inside the
 *     3.25 m lane-keep band), releases it smoothly as the gust breathes →
 *     ZERO violations + CLEAN_DRIVING;
 *   - „Полет през открития участък“: carries 50 km/h in, leaves the wheel
 *     loose — the gust walks the car to x ≈ 0.55 and it RIDES the center
 *     line ~4.9 s toward oncoming → EXACTLY CENTER_LINE_TOUCHED;
 *   - „Свръхкорекцията“ (the doc-72 second-swerve killer): near-limit speed,
 *     a late panic YANK right overshoots to x ≈ 7.7 and wobbles along the
 *     curb side ~4.7 s → EXACTLY POOR_LANE_KEEPING.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: street on x = 0,
 * right-lane center x = 4.06 (drawn lane 8.125 m), spawn fo-spawn-approach
 * (4.06, 15) heading north, 360 m long, limit 50. Lane detectors
 * (DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM = 3.25): the offset passes 3.25 m
 * toward the center at x < 0.8125 (CENTER_LINE_TOUCHED side, 3.5 s sustain)
 * and away from it at x > 7.3125 (POOR_LANE_KEEPING side, 3 s sustain).
 * The exposed segment of the story spans y ≈ 150–265 (copy-only — the wind
 * in the LIVE session blows over the whole map; a per-zone exposure model
 * is doc-65 Phase-4 work, stated, not faked).
 */

import { SC_AC_CROSSWIND } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_CROSSWIND_ID = "sc-ac-crosswind";

/** Northbound right-lane center of fo-follow-v1. */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — reduced speed, small steady correction
// ---------------------------------------------------------------------------

export function scAcCrosswindShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е открит участък — мостът, където страничният вятър духа силно отдясно. Двете ръце здраво на волана." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 90], [LANE_X, 140]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Преди открития участък смъкваме към 34 км/ч — колкото по-бавно, толкова по-малко те мести поривът." },
      // The gust story, AUTHORED into the polyline: the wind shoves LEFT
      // (west, toward the осева), the correct driver meets it with a small
      // STEADY correction — drift to x ≈ 3.3 (≈ 0.8 m, far inside the
      // 3.25 m band), held, then released smoothly as the gust slackens.
      {
        kind: "drive",
        points: [[LANE_X, 140], [3.55, 170], [3.3, 185], [3.55, 200], [LANE_X, 225]],
        targetKmh: 34,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Поривът бута колата наляво — посрещаш го с лека, ПОСТОЯННА корекция надясно, не с рязко завъртане." },
      // The wind breathes: a second, smaller push near the end of the gap —
      // met the same way, released the same way.
      {
        kind: "drive",
        points: [[LANE_X, 225], [3.7, 245], [LANE_X, 265]],
        targetKmh: 34,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Вятърът диша: отслабне ли поривът, отпускаш корекцията плавно — никога с втори замах." },
      { kind: "drive", points: [[LANE_X, 265], [LANE_X, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Минахме открития участък в лентата: по-ниска скорост, здрав волан, меки корекции — и готовност за порив при всяко следващо открито място." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Полет през открития участък" (CENTER_LINE_TOUCHED)
// ---------------------------------------------------------------------------

export function scAcCrosswindMistakeFullSpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 50 км/ч през открития участък, с отпусната ръка на волана." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 150]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Поривът удря — и при 50 км/ч без корекция колата тръгва наляво, към осевата линия." },
      // Loose hands at full speed: the gust walks the car across its half of
      // the roadway to x ≈ 0.55 and it RIDES the center line toward oncoming
      // (offset > 3.25 m from y ≈ 182 to 250 — ~4.9 s at 50 km/h, past the
      // 3.5 s CENTER_LINE_TOUCHED sustain).
      {
        kind: "drive",
        points: [[LANE_X, 150], [0.55, 185], [0.55, 250]],
        targetKmh: 50,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата язди осевата линия в насрещното — вятърът я държи там, докато водачът не се събуди." },
      { kind: "drive", points: [[0.55, 250], [LANE_X, 285], [LANE_X, 345]], targetKmh: 50 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "На открит участък скоростта се смъква ПРЕДИ порива — при 50 км/ч вятърът те мести с метри, преди да реагираш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Свръхкорекцията" (POOR_LANE_KEEPING — the second swerve)
// ---------------------------------------------------------------------------

export function scAcCrosswindMistakeOvercorrectScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: поривът бута наляво — и водачът отговаря с рязко завъртане, вместо с лека корекция." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 150]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Поривът мести колата наляво… дотук нищо страшно — лека корекция би стигнала." },
      // The gust push itself: ~1.5 m left — visible, still safely in-band.
      { kind: "drive", points: [[LANE_X, 150], [2.6, 180]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Но ръцете дръпват волана РЯЗКО надясно — вторият замах, истинският убиец при вятър." },
      // The panic yank: overshoots the whole lane to x ≈ 7.7 and wobbles
      // along the curb side (offset < −3.25 from y ≈ 217 to 280 — ~4.7 s,
      // past the 3 s POOR_LANE_KEEPING sustain).
      {
        kind: "drive",
        points: [[2.6, 180], [7.7, 220], [7.7, 280]],
        targetKmh: 48,
        stopAtEnd: false,
      },
      { kind: "drive", points: [[7.7, 280], [LANE_X, 310], [LANE_X, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Свръхкорекцията изхвърли колата чак до бордюра — срещу порив се стои с меки, постоянни корекции, не с резки движения." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcCrosswindTraceName = "shadow-correct" | "mistake-full-speed" | "mistake-overcorrect";

const SCRIPTS: Record<
  ScAcCrosswindTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcCrosswindShadowScript },
  "mistake-full-speed": { kind: "mistake", script: scAcCrosswindMistakeFullSpeedScript },
  "mistake-overcorrect": { kind: "mistake", script: scAcCrosswindMistakeOvercorrectScript },
};

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — in
 * DAY DRY (the wind is PHYSICS, opted in per template — never a weather tag),
 * ambient traffic zero (the harness law). Deterministic: same district →
 * same trace.
 */
export function recordScAcCrosswindDrive(
  districtRaw: unknown,
  name: ScAcCrosswindTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_CROSSWIND_ID,
    kind,
    seed: 7,
    ...(SC_AC_CROSSWIND.staged && SC_AC_CROSSWIND.staged.length > 0
      ? { stagedEvents: [...SC_AC_CROSSWIND.staged] }
      : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
