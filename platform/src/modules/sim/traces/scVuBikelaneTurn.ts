/**
 * sc-vu-bikelane-turn — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Десен завой през велоалея" (VU-01, the TWO-WAY /
 * counter-flow variant) on the committed vu-bikelane-v1 district, recorded with
 * the template's OWN two staged cyclists (the with-flow + counter-flow
 * cyclistRightHook riders — single truth, imported from the template). No
 * ambient traffic (seed 7).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (waited BOTH the with-flow
 *     rider and the counter-flow rider past the mouth, THEN turned right);
 *   - „Завой само с поглед назад" grades EXACTLY FAILED_TO_YIELD + COLLISION
 *     (checked only behind, turned into the counter-flow rider from ahead — the
 *     hook on the CF runner + an authored contact beat);
 *   - „Отрязване на колелото по алеята" grades EXACTLY FAILED_TO_YIELD (cut the
 *     with-flow rider off in the mouth — the classic right hook, no contact).
 *
 * GEOMETRY, pinned to content/world/vu-bikelane-v1.json + the template's
 * constants (the vu-bikelane-districts battery asserts every one against the
 * map): W–E through road on y = 0, eastbound lane center y = −4.06; south stem
 * on x = 0, southbound lane center x = −4.06; junction vu-n-c at (0, 0). The
 * two-way cycle track rides the south side: the with-flow rider at y = −6.66
 * (eastbound, vu-n-w → vu-n-c → vu-n-e), the counter-flow rider at y = −8.26
 * (westbound, the REVERSED path vu-n-e → vu-n-c → vu-n-w). The driver
 * approaches eastbound from the west and turns RIGHT (south) onto the stem
 * across BOTH cycle directions.
 *
 * Runner windows (orchestrator/runners.ts CyclistRightHookRunner, per rider):
 *  · RELEASE when the driver is within releaseDistM (60 ± seed jitter) of the
 *    junction and approaching — both riders roll then, staggered by their hold
 *    offsets so the with-flow rider crosses the mouth ~2.4 s before the
 *    counter-flow one;
 *  · HOOK (FAILED_TO_YIELD): a turnStarted "right" within 40 m of the junction
 *    while THAT rider is < CYCLIST_CLEAR_ARC_M (8 m) past the mouth AND within
 *    dangerRadiusM (9 m) of the driver;
 *  · YIELD (YIELDED_TO_PRIORITY): got within 16 m of the junction with a real
 *    conflict (rider within conflictWindowM = 25 m while ≤ 45 m out), then left
 *    beyond 22 m WITHOUT hooking — turned only after the rider cleared.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_BIKELANE_TURN } from "../lessons/scenario/templates-vru2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_BIKELANE_TURN_ID = "sc-vu-bikelane-turn";

/** Eastbound through-lane center / southbound stem lane center. */
const THROUGH_Y = -4.06;
const STEM_X = -4.06;

/** The right turn (east → south, ~90°) onto the stem — the vu-cyclist-hook arc,
 *  from the core-edge hold at x = −20, extended down the 90 m stem to the
 *  finish zone at y = −72. */
const TURN_TO_STEM: ReadonlyArray<readonly [number, number]> = [
  [-20, THROUGH_Y],
  [-13, THROUGH_Y],
  [-9, -5.2],
  [-5.6, -8.5],
  [STEM_X, -13],
  [STEM_X, -30],
  [STEM_X, -50],
  [STEM_X, -72],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — scan BOTH ways, wait out both riders,
// then turn
// ---------------------------------------------------------------------------

export function scVuBikelaneTurnShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Ще завиваш надясно през ДВУПОСОЧНА велоалея — провери и назад, и напред-надясно.",
      },
      { kind: "glance", mirror: "right" },
      // Approach eastbound; the riders release as the driver closes within 60 m.
      { kind: "drive", points: [[-130, THROUGH_Y], [-62, THROUGH_Y]], targetKmh: 42, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "По алеята кара велосипедист направо, а насреща идва второ колело — и двете имат предимство.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      // Ease to a STOP just OUTSIDE the junction core (x = −20, > 18 m from the
      // node) and WAIT there: the whole two-way track — with-flow rider AND the
      // counter-flow rider from ahead — crosses the mouth while the car stands
      // still, so no priority conflict is ever barged. Hold until BOTH have
      // cleared the crossing box before creeping into the core to turn.
      { kind: "drive", points: [[-62, THROUGH_Y], [-38, THROUGH_Y], [-20, THROUGH_Y]], targetKmh: 15 },
      { kind: "pause", sec: 11.0, brake: true },
      {
        kind: "annotation",
        textBg: "И двете посоки на алеята са чисти — сега завиваме надясно.",
      },
      { kind: "glance", mirror: "right" }, // the second scan ahead-right before committing
      { kind: "drive", points: TURN_TO_STEM, targetKmh: 15 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Готово: пропусна колелата и в двете посоки и зави, когато алеята беше чиста.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Завой само с поглед назад" (FAILED_TO_YIELD + COLLISION)
//
// The driver checks only BEHIND (the shoulder glance that covers the
// overtaken rider), waits the with-flow rider past, and turns — into the
// counter-flow rider coming from AHEAD on the two-way track. The CF runner
// grades the hook (FAILED_TO_YIELD); the contact is an AUTHORED beat
// (DriveStep.collision — the templates-vru2 precedent), pushed exactly as a
// physics contact would grade COLLISION(cyclist).
// ---------------------------------------------------------------------------

export function scVuBikelaneTurnMistakeOnlyBehindScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: водачът проверява само НАЗАД и завива, щом движещият се направо отмине.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-130, THROUGH_Y], [-62, THROUGH_Y]], targetKmh: 42, stopAtEnd: false },
      { kind: "drive", points: [[-62, THROUGH_Y], [-34, THROUGH_Y], [-13, THROUGH_Y]], targetKmh: 16 },
      // Only a REAR glance — the ahead-right of the two-way path is never scanned.
      { kind: "glance", mirror: "rear" },
      // Wait the with-flow rider past (so it is not the conflict), then turn —
      // straight into the counter-flow rider still crossing the mouth.
      { kind: "pause", sec: 8.4, brake: true },
      {
        kind: "annotation",
        textBg: "Отзад е чисто… но насрещното колело по алеята идва точно отпред-дясно.",
      },
      { kind: "drive", points: [[-13, THROUGH_Y], [-9, -5.2], [-6, -7.6]], targetKmh: 15, stopAtEnd: false },
      { kind: "collision", withWhat: "cyclist" },
      { kind: "drive", points: [[-6, -7.6], [STEM_X, -13], [STEM_X, -30], [STEM_X, -48]], targetKmh: 15 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Двупосочната алея иска ДВЕ проверки — назад И напред-надясно. Завоят пред насрещното колело е непропускане (чл. 25; чл. 37).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Отрязване на колелото по алеята" (FAILED_TO_YIELD)
//
// The classic right hook on the WITH-FLOW rider: the driver overtakes it, then
// cuts right across it while it is still in the mouth (< 8 m past, within the
// danger radius) — a refused priority (prioritySituation "cyclist-right-hook"
// violated), with NO contact (the 2.6 m curb line stays outside the 2.2 m
// contact radius; the counter-flow rider is still 12 m out and never hooks).
// The same-code sibling of demo 1's hook, but on the rider you SAW.
// ---------------------------------------------------------------------------

export function scVuBikelaneTurnMistakeCutPathScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата отрязва велосипедиста по алеята — завива, преди той да е преминал устието.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-130, THROUGH_Y], [-62, THROUGH_Y]], targetKmh: 42, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Велосипедистът по алеята е плътно вдясно и още не е преминал… но колата не спира.",
      },
      // Roll to the mouth sub-20 (no follow grading), then cut right across the
      // with-flow rider while it is still alongside within the danger radius.
      { kind: "drive", points: [[-62, THROUGH_Y], [-34, THROUGH_Y]], targetKmh: 26, stopAtEnd: false },
      { kind: "drive", points: [[-34, THROUGH_Y], [-18, THROUGH_Y]], targetKmh: 16, stopAtEnd: false },
      {
        kind: "drive",
        points: [[-18, THROUGH_Y], [-11, THROUGH_Y], [-6, -6.0], [STEM_X, -11], [STEM_X, -28], [STEM_X, -48]],
        targetKmh: 16,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Велосипедистът по алеята се движи направо и има предимство — отрязването му е непропускане (чл. 37).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuBikelaneTurnTraceName = "shadow-correct" | "mistake-only-behind" | "mistake-cut-path";

const SCRIPTS: Record<
  ScVuBikelaneTurnTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVuBikelaneTurnShadowScript },
  "mistake-only-behind": { kind: "mistake", script: scVuBikelaneTurnMistakeOnlyBehindScript },
  "mistake-cut-path": { kind: "mistake", script: scVuBikelaneTurnMistakeCutPathScript },
};

/**
 * Record one of the three drives against a loaded vu-bikelane-v1 document — the
 * TEMPLATE's two staged riders armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScVuBikelaneTurnDrive(
  districtRaw: unknown,
  name: ScVuBikelaneTurnTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_BIKELANE_TURN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_BIKELANE_TURN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
