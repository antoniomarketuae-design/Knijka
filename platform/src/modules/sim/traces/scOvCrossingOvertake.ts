/**
 * sc-ov-crossing-overtake — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Изпреварване на пешеходна пътека" (OV-07) on
 * the committed ov-crossing-v1 district, recorded with the template's OWN staged
 * lead car (brakingLeadCar sc-ovc-lead — single truth, imported from the
 * template). The lead paces the RIGHT lane; the crossing (ovc-x-1, y = 220)
 * arms its ~35 m zone from ~y = 185.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: follows the lead THROUGH the crossing in the right lane (no lane
 *     change) → ZERO violations + CLEAN_DRIVING;
 *   - „Изпреварване в зоната": pulls OUT to the left to overtake and CUTS BACK
 *     into the right lane — toward the lead — INSIDE the armed zone → grades
 *     EXACTLY OVERTAKING_AT_CROSSING (опасна), the signalled lane changes
 *     earning SAFE_LANE_CHANGE (the only graded fault is the illegal LOCATION);
 *   - „Излизане отляво в последния момент": the same out-and-back, later and
 *     tighter (the cut-back deeper in the zone) → EXACTLY OVERTAKING_AT_CROSSING.
 *
 * NB the OVERTAKING_AT_CROSSING check reads leadGapM at the lane-boundary frame;
 * a lane change AWAY from the lead's lane loses it from the ±4 m lead corridor,
 * so only a change TOWARD the lead's lane (the cut-back) can grade — which is
 * why both mistakes overtake by cutting back in, not by the pull-out.
 *
 * Geometry pinned to content/world/ov-crossing-v1.json: a 2+2 road on x = 0,
 * right-lane center x = 12.19, left-lane center x = 4.06 (boundary x = 8.125),
 * crossing ovc-x-1 at y = 220, spawn ovc-spawn-start (12.19, 15) heading north,
 * 320 m long, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_CROSSING_OVERTAKE } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_CROSSING_OVERTAKE_ID = "sc-ov-crossing-overtake";

/** Right (cruise/lead) and left (overtake target) lane centers of ov-crossing-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — follow the lead through the crossing
// ---------------------------------------------------------------------------

export function scOvCrossingOvertakeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб в твоята лента се движи кола, а напред има пешеходна пътека." },
      { kind: "glance", mirror: "rear" },
      // Follow in the RIGHT lane the whole way — no lane change, so nothing to grade.
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 120], [X_RIGHT, 185]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред пътека не се изпреварва — остани зад предния и намали." },
      { kind: "drive", points: [[X_RIGHT, 185], [X_RIGHT, 230], [X_RIGHT, 290]], targetKmh: 24 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: мина пътеката зад предната кола, без да я изпреварваш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварване в зоната" (OVERTAKING_AT_CROSSING)
// ---------------------------------------------------------------------------

export function scOvCrossingOvertakeMistakeInZoneScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: излиза вляво да изпревари и се връща в лентата точно на пътеката." },
      { kind: "glance", mirror: "rear" },
      // Follow the lead in the RIGHT lane, then pull OUT to the left to overtake
      // (this pull-out is signalled + mirrored — the ONLY graded fault is the
      // illegal cut-back INTO the lane inside the zone).
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 120], [X_RIGHT, 168]], targetKmh: 30, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_RIGHT, 168], [8.0, 182], [X_LEFT, 196]], targetKmh: 30, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Cut BACK into the right lane INSIDE the armed crossing zone (boundary
      // crossed ~y = 210, heading tilted toward the lead so it stays in the
      // lead-detection corridor at that frame) → OVERTAKING_AT_CROSSING.
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LEFT, 196], [8.0, 210], [X_RIGHT, 224]], targetKmh: 30, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Изпреварване и връщане в зоната на пътеката — може да пропуска пешеходец." },
      { kind: "drive", points: [[X_RIGHT, 224], [X_RIGHT, 290]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      // CITATION CORRECTED 2026-09-02, and it is the SECOND half of a fix that
      // only landed in one file. rules/catalog.ts:1070 records the first half on
      // 2026-08-03: «this cited чл. 119, which is the duty to YIELD to
      // pedestrians — it does not ban overtaking anywhere. The ban is чл. 43».
      // That file now carries lawRef «ЗДвП чл. 43, т. 5 и т. 6; чл. 119, ал. 2»
      // while THIS demo — the one the student actually watches — still named
      // чл. 119 on its own. ADR-002 is not only about free recall; a citation
      // corrected in the rule and left wrong in the teaching material tells the
      // student the wrong article just as effectively.
      { kind: "annotation", textBg: "Пред пътека не се изпреварва — това е опасна грешка (чл. 43, т. 5 и т. 6)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Излизане отляво в последния момент" (OVERTAKING_AT_CROSSING)
// ---------------------------------------------------------------------------

export function scOvCrossingOvertakeMistakeLateSwerveScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: изчаква до последно и се хвърля вляво, за да заобиколи предния." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 120], [X_RIGHT, 178]], targetKmh: 28, stopAtEnd: false },
      // Same out-and-back, but LATER and tighter — the cut-back lands deeper in
      // the zone, closer to the crossing (boundary crossed ~y = 214).
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_RIGHT, 178], [8.0, 190], [X_LEFT, 202]], targetKmh: 28, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LEFT, 202], [8.0, 214], [X_RIGHT, 226]], targetKmh: 28, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Заобикалянето на пътека е също изпреварване — забранено и опасно." },
      { kind: "drive", points: [[X_RIGHT, 226], [X_RIGHT, 290]], targetKmh: 26 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Не виждаш какво пропуска предният — затова пред пътека не се заобикаля." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvCrossingOvertakeTraceName =
  | "shadow-correct"
  | "mistake-overtake-in-zone"
  | "mistake-late-swerve";

const SCRIPTS: Record<
  ScOvCrossingOvertakeTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvCrossingOvertakeShadowScript },
  "mistake-overtake-in-zone": { kind: "mistake", script: scOvCrossingOvertakeMistakeInZoneScript },
  "mistake-late-swerve": { kind: "mistake", script: scOvCrossingOvertakeMistakeLateSwerveScript },
};

/**
 * Record one of the three drives against a loaded ov-crossing-v1 document — the
 * TEMPLATE's staged lead car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScOvCrossingOvertakeDrive(
  districtRaw: unknown,
  name: ScOvCrossingOvertakeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_CROSSING_OVERTAKE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_CROSSING_OVERTAKE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
