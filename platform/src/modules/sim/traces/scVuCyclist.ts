/**
 * sc-vu-cyclist-hook — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Десен завой през велосипедист" (VU-01) on the committed
 * vu-cyclist-v1 district, recorded with the template's OWN staged cyclist
 * (cyclistRightHook sc-vu-cyclist — single truth, imported from the template).
 * No ambient traffic (seed 7): the ONLY actor is the curb-riding cyclist.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (waited the cyclist past the
 *     mouth, THEN turned right into the cleared gap);
 *   - „Завой пред велосипедиста" grades EXACTLY FAILED_TO_YIELD (the right turn
 *     started with the cyclist still alongside within the danger radius);
 *   - „Удар във велосипедиста" grades EXACTLY COLLISION (turned into it).
 *
 * Geometry pinned to content/world/vu-cyclist-v1.json: W–E through road on
 * y = 0, eastbound lane center y = −4.06; south stem on x = 0, southbound lane
 * center x = −4.06; junction vu-n-c at (0, 0); the cyclist rides the south curb
 * eastbound (y ≈ −6.66). The driver approaches eastbound from the west and
 * turns RIGHT (south) onto the stem across the cyclist's straight path.
 *
 * Runner windows (orchestrator/runners.ts CyclistRightHookRunner):
 *  · the cyclist is RELEASED (starts cruising) when the driver is within
 *    releaseDistM (70 ± seed jitter) of the junction and approaching;
 *  · HOOK (FAILED_TO_YIELD): a turnStarted "right" within 40 m of the junction
 *    while the cyclist is < CYCLIST_CLEAR_ARC_M (8 m) past the mouth AND within
 *    dangerRadiusM (9 m) of the driver;
 *  · COLLISION: driver within CYCLIST_CONTACT_M (2.2 m) of the cyclist at speed;
 *  · YIELD (YIELDED_TO_PRIORITY): the driver got within HOOK_PASS_NEAR_M (16 m)
 *    of the junction with a real conflict (cyclist within conflictWindowM = 20 m
 *    while ≤ 45 m out), then left the junction beyond HOOK_PASS_FAR_M (22 m)
 *    WITHOUT hooking — i.e. turned only after the cyclist cleared.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_CYCLIST_HOOK } from "../lessons/scenario/templates-vru";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_CYCLIST_HOOK_ID = "sc-vu-cyclist-hook";

/** Eastbound lane center of the through road / southbound lane center of stem. */
const THROUGH_Y = -4.06;
const STEM_X = -4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — yield to the cyclist, then turn
// ---------------------------------------------------------------------------

export function scVuCyclistShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Ще завиваш надясно — провери дясното огледало и мъртвата зона отдясно." },
      { kind: "glance", mirror: "right" },
      // Approach eastbound, then ease down EARLY to a stop at the mouth: the
      // gentle close keeps the gap in the conflict window (a real conflict
      // registers) while the sub-20 km/h speed keeps the follow detector off.
      { kind: "drive", points: [[-115, THROUGH_Y], [-70, THROUGH_Y]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Покрай бордюра се движи велосипедист направо — той има предимство." },
      // Announce the right turn, then ease to a stop at the mouth and WAIT.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[-70, THROUGH_Y], [-40, THROUGH_Y], [-13, THROUGH_Y]], targetKmh: 16 },
      { kind: "pause", sec: 9.0, brake: true },
      { kind: "annotation", textBg: "Велосипедистът премина и е чист — сега завиваме надясно." },
      // Right turn (east → south, ~90°) onto the stem, cyclist already cleared.
      {
        kind: "drive",
        points: [[-13, THROUGH_Y], [-9, -5.2], [-5.6, -8.5], [STEM_X, -13], [STEM_X, -30], [STEM_X, -50], [STEM_X, -62]],
        targetKmh: 15,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: пропусна велосипедиста и зави надясно, когато беше чисто." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Завой пред велосипедиста" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scVuCyclistMistakeHookScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: колата завива надясно, без да пропусне велосипедиста." },
      // Looked right — but misjudged the cyclist's speed and turned anyway.
      { kind: "glance", mirror: "right" },
      // Signalled correctly — the ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-115, THROUGH_Y], [-70, THROUGH_Y]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Велосипедистът е плътно вдясно… но колата не спира." },
      // Roll to the junction at sub-20 km/h (no follow grading) and turn right
      // across the cyclist while it is still alongside within the danger radius.
      { kind: "drive", points: [[-70, THROUGH_Y], [-34, THROUGH_Y]], targetKmh: 28, stopAtEnd: false },
      { kind: "drive", points: [[-34, THROUGH_Y], [-18, THROUGH_Y]], targetKmh: 18, stopAtEnd: false },
      {
        kind: "drive",
        points: [[-18, THROUGH_Y], [-11, THROUGH_Y], [-6, -6.0], [STEM_X, -11], [STEM_X, -28], [STEM_X, -48]],
        targetKmh: 18,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Велосипедистът направо има предимство — завиването пред него е непропускане на участник с предимство (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Завой без оглеждане" (FAILED_TO_YIELD)
//
// A DISTINCT second way to fail the right hook: where demo 1 misjudges the gap,
// this driver never checks the right blind spot (rear-mirror only) and cuts
// hard right straight across the cyclist. Same graded fault (the refused
// priority — prioritySituation "cyclist-right-hook" violated) but the coaching
// story is "look before you turn", not "wait for the gap". A clean COLLISION
// (cyclist) is NOT stageable through the v1 point-distance cyclist proxy without
// dragging in a follow/hook code (the 2.6 m curb offset kept to protect the
// shadow exceeds the 2.2 m contact radius, so a rear approach can't reach the
// centre), so both demos grade FAILED_TO_YIELD — the same same-code mistake
// pair as sc-ov-keep-right (2× NOT_KEEPING_RIGHT) / sc-follow-brake (2×
// COLLISION).
// ---------------------------------------------------------------------------

export function scVuCyclistMistakeNoLookScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: завой надясно без никакъв поглед в дясната мъртва зона." },
      // Only a rear-mirror glance — the right blind spot is never checked.
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-115, THROUGH_Y], [-70, THROUGH_Y]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Велосипедистът е в мъртвата зона отдясно, но водачът дори не поглежда натам…" },
      // Sub-20 km/h roll (no follow grading), then a hard early cut RIGHT across
      // the cyclist while it is alongside within the danger radius — the hook.
      { kind: "drive", points: [[-70, THROUGH_Y], [-34, THROUGH_Y]], targetKmh: 28, stopAtEnd: false },
      { kind: "drive", points: [[-34, THROUGH_Y], [-19, THROUGH_Y]], targetKmh: 18, stopAtEnd: false },
      {
        kind: "drive",
        points: [[-19, THROUGH_Y], [-12, THROUGH_Y], [-6, -6.1], [STEM_X, -11], [STEM_X, -28], [STEM_X, -48]],
        targetKmh: 18,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Велосипедистът направо има предимство — един поглед през дясното рамо преди завоя го спасява (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuCyclistTraceName = "shadow-correct" | "mistake-hook" | "mistake-no-look";

const SCRIPTS: Record<ScVuCyclistTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scVuCyclistShadowScript },
  "mistake-hook": { kind: "mistake", script: scVuCyclistMistakeHookScript },
  "mistake-no-look": { kind: "mistake", script: scVuCyclistMistakeNoLookScript },
};

/**
 * Record one of the three drives against a loaded vu-cyclist-v1 document — the
 * TEMPLATE's staged cyclist armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScVuCyclistDrive(
  districtRaw: unknown,
  name: ScVuCyclistTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_CYCLIST_HOOK_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_CYCLIST_HOOK.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
