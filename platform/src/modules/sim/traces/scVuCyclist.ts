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
// Mistake demo 3 — „Отрязване на велосипедиста" (FAILED_TO_YIELD)
//
// THE FOUNDER'S RIGHT HOOK, verbatim: „a bicyclist on a road riding straight,
// and we behind him with the car … the driver takes the right road and does not
// let the bicyclist pass, which means the bicyclist will have to slow down."
//
// Why a THIRD demo and not a retune of demo 1: both existing demos start the
// right turn while the rider is still inside the runner's danger radius, so
// they grade FAILED_TO_YIELD correctly — but MEASURED against the staged
// cyclist they pass BEHIND it. The rider is 5–7 m ahead of the ghost at every
// frame of the turn, never enters playerGuard's window (along > 0, lateral
// < 3 m), and holds a flat 3.00 m/s from release to the end of the trace. The
// verdict is right; the PICTURE argues nothing. A student watching it sees a
// car tuck in behind a cyclist who is never affected.
//
// This demo puts the cut where the founder put it. The ghost:
//  1. rides its own lane while the rider is far ahead;
//  2. eases LEFT to y ≈ −2.2 to close the gap. That is not decoration — at the
//     2.6 m curb offset the rider sits INSIDE leadGapFor's 4.0 m corridor, so
//     closing on it in-lane at speed grades FOLLOWING_TOO_CLOSE and buries the
//     lesson under a second code. 4.46 m of lateral separation keeps the ONE
//     graded fault the refused priority (the same single-code discipline demos
//     1 and 2 keep);
//  3. draws level and cuts right ACROSS the rider's line while it is still
//     short of the mouth — inside dangerRadiusM (9 m), so the runner emits
//     prioritySituation "cyclist-right-hook" → FAILED_TO_YIELD;
//  4. lands ahead of the rider inside playerGuard's window, which brakes the
//     staged cyclist toward a standstill. That braking IS the founder's ruling
//     (the train-reel precedent): a near-miss that forces the vulnerable road
//     user to save himself teaches better than a crash, and no contact ever
//     occurs (measured closest approach stays clear of CYCLIST_CONTACT_M).
//
// Right indicator ON throughout — the founder's other complaint about the
// mis-mapped clip was a car showing a LEFT signal while a right turn was the
// subject. Here the signal and the manoeuvre agree; the fault is the priority.
// ---------------------------------------------------------------------------

/** The overtaking line, m: left-biased inside the eastbound lane so the rider
 *  clears leadGapFor's 4.0 m lead corridor (|−2.2 − (−6.66)| = 4.46 m). */
const CUT_PASS_Y = -2.2;

export function scVuCyclistMistakeForcedBrakeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата отрязва велосипедиста в десния завой и той трябва да спира.",
      },
      { kind: "glance", mirror: "right" },
      // Signalled correctly — the ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-115, THROUGH_Y], [-80, THROUGH_Y]], targetKmh: 44, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Пред теб, покрай бордюра, велосипедист се движи направо — ти си зад него.",
      },
      // Ease left INSIDE the lane and close the gap: the rider must stay outside
      // the lead corridor or the demo picks up a following code.
      { kind: "drive", points: [[-80, THROUGH_Y], [-68, CUT_PASS_Y]], targetKmh: 44, stopAtEnd: false },
      { kind: "drive", points: [[-68, CUT_PASS_Y], [-24, CUT_PASS_Y]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата го застига и вместо да го пропусне, се готви да завие пред него." },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[-24, CUT_PASS_Y], [-13, -2.6]], targetKmh: 24, stopAtEnd: false },
      // THE CUT: right turn started with the rider still short of the mouth and
      // inside the danger radius — and the ghost lands in front of it.
      {
        kind: "drive",
        points: [[-13, -2.6], [-9, -4.2], [-6.5, -6.3], [-4.6, -9.5], [STEM_X, -14], [STEM_X, -30], [STEM_X, -48]],
        targetKmh: 18,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Велосипедистът направо има предимство — колата му отряза пътя и той трябваше да спира, за да не се удари (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuCyclistTraceName =
  | "shadow-correct"
  | "mistake-hook"
  | "mistake-no-look"
  | "mistake-forced-brake";

const SCRIPTS: Record<ScVuCyclistTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scVuCyclistShadowScript },
  "mistake-hook": { kind: "mistake", script: scVuCyclistMistakeHookScript },
  "mistake-no-look": { kind: "mistake", script: scVuCyclistMistakeNoLookScript },
  "mistake-forced-brake": { kind: "mistake", script: scVuCyclistMistakeForcedBrakeScript },
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
