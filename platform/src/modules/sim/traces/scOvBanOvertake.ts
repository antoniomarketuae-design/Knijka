/**
 * sc-ov-ban-overtake — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Изпреварване при забрана" (OV-06, ADR-006 stage 2a)
 * on the committed ov-ban-v1 district (the FIRST map carrying the ZONE-BAN
 * `zones` layer: В24 noOvertaking @ y ∈ [90, 210]), recorded with the
 * template's OWN staged slow lead (brakingLeadCar sc-ovb-lead, matchPlayer
 * ~16 m ahead capped at ~21.6 km/h — single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: follows the lead patiently THROUGH the В24 zone in the right
 *     lane, then overtakes AFTER the zone ends (out at ~y 215, past, back at
 *     ~y 315) → ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE (the legal
 *     pass is actively good);
 *   - „Изпреварване в зоната": pulls out INSIDE the zone and cuts back toward
 *     the lead deep in the ban span (boundary ~y 164) → grades EXACTLY
 *     OVERTAKING_IN_BAN_ZONE (основна); the signalled changes earn
 *     SAFE_LANE_CHANGE — the only graded fault is the illegal LOCATION;
 *   - „Хвърляне точно преди знака": pulls out just BEFORE the zone and cuts
 *     back already inside it (boundary ~y 109) → EXACTLY OVERTAKING_IN_BAN_ZONE.
 *
 * NB the OV-07 corridor discipline applies verbatim (scOvCrossingOvertake):
 * the check reads leadGapM at the lane-boundary frame, and a change AWAY from
 * the lead's lane loses it from the corridor — so only the cut-back TOWARD
 * the lead's lane can grade, which is why both mistakes overtake by cutting
 * back in, not by the pull-out.
 *
 * Geometry pinned to content/world/ov-ban-v1.json: a 2+2 road on x = 0, right
 * lane center x = 12.19, left x = 4.06 (boundary x = 8.125), В24 span
 * [90, 210], spawn ovb-spawn-start (12.19, 15) heading north, 400 m, limit 50.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_BAN_OVERTAKE } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_BAN_OVERTAKE_ID = "sc-ov-ban-overtake";

/** Right (cruise/lead) and left (overtake target) lane centers of ov-ban-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — patience in the zone, pass after it
// ---------------------------------------------------------------------------

export function scOvBanOvertakeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб пълзи бавна кола, а участъкът напред е под знак В24 — забранено изпреварване." },
      { kind: "glance", mirror: "rear" },
      // Patient follow in the RIGHT lane through the whole В24 span [90, 210].
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 90], [X_RIGHT, 150], [X_RIGHT, 205]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Краят на зоната: сега изпреварването е разрешено — огледало, мигач, маневра." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_RIGHT, 205], [X_RIGHT, 215], [8.0, 230], [X_LEFT, 245]], targetKmh: 30, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Pass the slow lead in the left lane (it is capped at ~21.6 km/h).
      { kind: "drive", points: [[X_LEFT, 245], [X_LEFT, 300]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Подмина бавната кола — прибери се вдясно, щом я видиш в огледалото." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LEFT, 300], [8.0, 315], [X_RIGHT, 330]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_RIGHT, 330], [X_RIGHT, 372]], targetKmh: 32 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: търпение в зоната, чисто изпреварване след нея." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварване в зоната" (OVERTAKING_IN_BAN_ZONE)
// ---------------------------------------------------------------------------

export function scOvBanOvertakeMistakeInZoneScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „предният пълзи“ — излиза да изпреварва по средата на зоната В24." },
      { kind: "glance", mirror: "rear" },
      // Follow UNDER the lead's pace (20 < ~21.6 km/h cap) so the 16 m gap
      // holds — the only graded fault must be the LOCATION of the cut-back.
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 70], [X_RIGHT, 110]], targetKmh: 20, stopAtEnd: false },
      // Pull OUT inside the zone (signalled + mirrored). Kept SHORT and only
      // slightly faster than the lead: the arc gap must not close under the
      // following-distance band before the cut-back frame.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_RIGHT, 110], [8.0, 124], [X_LEFT, 138]], targetKmh: 24, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 138], [X_LEFT, 146]], targetKmh: 24, stopAtEnd: false },
      // Cut BACK toward the lead's lane DEEP inside the ban span (boundary
      // crossed ~y = 160, heading tilted toward the lead so it stays in the
      // lead corridor at that frame) → OVERTAKING_IN_BAN_ZONE.
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LEFT, 146], [8.0, 160], [X_RIGHT, 174]], targetKmh: 24, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Изпреварване в зоната на В24 — знакът стои точно там, където това е опасно." },
      // Ease off behind the lead (16 km/h reopens the squeezed gap — the
      // aborted pass ends as ordinary following, not tailgating).
      { kind: "drive", points: [[X_RIGHT, 174], [X_RIGHT, 240]], targetKmh: 16, stopAtEnd: false },
      { kind: "drive", points: [[X_RIGHT, 240], [X_RIGHT, 300]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "„Предният е бавен“ не отменя забраната — изчакай края на зоната (чл. 42–43)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Хвърляне точно преди знака" (OVERTAKING_IN_BAN_ZONE)
// ---------------------------------------------------------------------------

export function scOvBanOvertakeMistakeEarlyJumpScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: хвърля се да изпреварва точно преди знака — и завършва маневрата вече в зоната." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 55]], targetKmh: 20, stopAtEnd: false },
      // Pull-out BEFORE the zone starts (boundary ~y = 69 < 90 — legal side),
      // signalled + mirrored…
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_RIGHT, 55], [8.0, 69], [X_LEFT, 83]], targetKmh: 24, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 83], [X_LEFT, 95]], targetKmh: 24, stopAtEnd: false },
      // …but the cut-back lands INSIDE the span (boundary ~y = 109 ∈ [90, 210])
      // → OVERTAKING_IN_BAN_ZONE.
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LEFT, 95], [8.0, 109], [X_RIGHT, 123]], targetKmh: 24, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Маневрата трябва да ЗАВЪРШИ преди зоната — „на ръба“ значи вътре." },
      // Ease off behind the lead (the squeezed gap reopens at 16 km/h).
      { kind: "drive", points: [[X_RIGHT, 123], [X_RIGHT, 210]], targetKmh: 16, stopAtEnd: false },
      { kind: "drive", points: [[X_RIGHT, 210], [X_RIGHT, 290]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Видиш ли В24 напред — прибери се и изчакай: зоната започва при знака, не при преценката ти." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvBanOvertakeTraceName =
  | "shadow-correct"
  | "mistake-overtake-in-zone"
  | "mistake-early-jump";

const SCRIPTS: Record<
  ScOvBanOvertakeTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvBanOvertakeShadowScript },
  "mistake-overtake-in-zone": { kind: "mistake", script: scOvBanOvertakeMistakeInZoneScript },
  "mistake-early-jump": { kind: "mistake", script: scOvBanOvertakeMistakeEarlyJumpScript },
};

/**
 * Record one of the three drives against a loaded ov-ban-v1 document — the
 * TEMPLATE's staged slow lead armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScOvBanOvertakeDrive(
  districtRaw: unknown,
  name: ScOvBanOvertakeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_BAN_OVERTAKE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_BAN_OVERTAKE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
