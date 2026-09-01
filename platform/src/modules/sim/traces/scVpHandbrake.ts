/**
 * sc-vp-handbrake — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Потегляне с вдигната ръчна" (VP-05 handbrake + PK-05
 * move-off observation — the checklist chain) on the committed vp-ready-v1
 * street (map REUSED: 360 m 1+1, limit 50, dry day; the cockpit-family map
 * already hosts sc-vp-readiness / sc-pk-move-off / sc-vp-stall).
 *
 * The move-off-observation detector ships config-OFF (rules/types.ts
 * moveOffObservationEnabled), so this DRILL enables it via ruleConfig —
 * mirrored from SC_VP_HANDBRAKE.ruleConfig so the recorder grades exactly what
 * the LIVE lesson grades (the sc-pk-move-off precedent). The serialized trace
 * bytes never depend on the config; only the graded `ruleEvents` do.
 *
 * THE TUNING THAT MATTERS (why each demo convicts on ONE code and no extras):
 * with the observation drill ENABLED, every drive here starts from rest and so
 * arms the move-off detector — which means the HANDBRAKE demo must still GLANCE
 * before pulling away, or it would bill MOVE_OFF_WITHOUT_OBSERVATION too and
 * the §9 exact-code assert would (rightly) fail. The two demos are deliberately
 * ONE-FAULT-EACH: the handbrake demo does the observation correctly and only
 * leaves the lever up; the observation demo releases the handbrake correctly and
 * only skips the mirror. That isolation IS the pedagogy — each card names one
 * thing to fix.
 *
 * The trace gate replays exactly these through the production stack with the
 * move-off drill ENABLED:
 *   - shadow: handbrake released + a left AND shoulder/rear glance at rest, then
 *     a centered, legal ~40 km/h drive up the street → ZERO violations +
 *     CLEAN_DRIVING;
 *   - „Вдигната ръчна": {handbrake:true} held through the drive (glances intact)
 *     → EXACTLY HANDBRAKE_LEFT_ON (1.5 s sustain while moving);
 *   - „Без оглед": handbrake down (the default), no left/rear glance anywhere
 *     → EXACTLY MOVE_OFF_WITHOUT_OBSERVATION.
 *
 * Geometry pinned to content/world/vp-ready-v1.json: the street runs south →
 * north on x = 0, right-lane center x = 4.06, length 360 m, spawn
 * vp-spawn-approach (4.06, 15), limit 50. Every drive stays on x = 4.06
 * (centered) and at 40 km/h (well under the limit), so nothing but the flipped
 * cockpit channel is gradable.
 */

import { SC_VP_HANDBRAKE } from "../lessons/scenario/templates-cockpit2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VP_HANDBRAKE_ID = "sc-vp-handbrake";

/** Right-lane center of vp-ready-v1 (1+1 street, drawn lane 8.125 m). */
const LANE_X = 4.06;

/** The northbound run up the street, shared by every drive (rest → cruise).
 *  Covers both graded zones: sc-vph-moved (y 150) and sc-vph-finish (y 330). */
const RUN: Array<[number, number]> = [
  [LANE_X, 15],
  [LANE_X, 20],
  [LANE_X, 40],
  [LANE_X, 120],
  [LANE_X, 220],
  [LANE_X, 335],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — lever down, lamp out, mirror, then go
// ---------------------------------------------------------------------------

export function scVpHandbrakeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Кокпит чек-лист преди потегляне: колан, предавка — и ръчната спирачка." },
      // The checklist, in order. Both cockpit steps match the recorder
      // defaults (belt on, handbrake off), so the shadow records
      // byte-identically while STATING the correct state for the story.
      { kind: "seatbelt", on: true },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "handbrake", on: false },
      { kind: "annotation", textBg: "Ръчната е свалена докрай — и червената лампа на таблото угасва. Това е потвърждението." },
      { kind: "pause", sec: 1.0, brake: true },
      // The checklist's LAST step — mirror + shoulder, both inside the
      // detector's 7 s lookback (moveOffLookbackSec) of the pull-away below.
      { kind: "annotation", textBg: "Чек-листът не свършва на таблото: последната стъпка е огледът." },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "shoulder" },
      { kind: "annotation", textBg: "Чисто е отзад и отляво — чак сега потегляме." },
      { kind: "drive", points: RUN, targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Колата върви свободно, без съпротивление: ръчната наистина е долу, а огледът е направен." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Вдигната ръчна" (HANDBRAKE_LEFT_ON)
//   The observation is done CORRECTLY here (glances intact): the ONLY fault is
//   the lever. One card, one thing to fix.
// ---------------------------------------------------------------------------

export function scVpHandbrakeMistakeHandbrakeOnScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: чек-листът е изкаран „по памет“ и ръчната остава вдигната." },
      // Handbrake left UP → HANDBRAKE_LEFT_ON after 1.5 s of motion. Belt on,
      // speed legal, lane centered, and the glances below keep the move-off
      // detector satisfied: no other code can attach.
      { kind: "handbrake", on: true },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "annotation", textBg: "Червената лампа на таблото свети — но никой не поглежда натам." },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "shoulder" },
      { kind: "drive", points: RUN, targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Колата тегли тежко, а задните спирачки се пекат. Двата признака бяха там от първия метър: лампата и съпротивлението.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Без оглед" (MOVE_OFF_WITHOUT_OBSERVATION)
//   The handbrake is released CORRECTLY here: the ONLY fault is the checklist's
//   missing last step — the driver watched the lamp instead of the mirror.
// ---------------------------------------------------------------------------

export function scVpHandbrakeMistakeNoObservationScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: ръчната е свалена изрядно — и колата тръгва веднага, без нито един поглед назад." },
      { kind: "handbrake", on: false },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Лампата угасна и водачът реши, че чек-листът е готов. Не е: липсва последната стъпка." },
      // NO left/rear glance anywhere → MOVE_OFF_WITHOUT_OBSERVATION on the
      // first pull-away. Handbrake down, belt on, speed legal, lane centered:
      // no other code can attach.
      { kind: "drive", points: RUN, targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Потеглянето от място е маневра: приближаващият отзад-отляво остана невидим. Огледай се ПРЕДИ да тръгнеш.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVpHandbrakeTraceName = "shadow-correct" | "mistake-handbrake-on" | "mistake-no-observation";

const SCRIPTS: Record<ScVpHandbrakeTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scVpHandbrakeShadowScript },
  "mistake-handbrake-on": { kind: "mistake", script: scVpHandbrakeMistakeHandbrakeOnScript },
  "mistake-no-observation": { kind: "mistake", script: scVpHandbrakeMistakeNoObservationScript },
};

/**
 * Record one of the three drives against a loaded vp-ready-v1 document — no
 * staged actors, ambient traffic zero, dry day, the move-off-observation drill
 * ENABLED via ruleConfig (mirrored from SC_VP_HANDBRAKE.ruleConfig so the LIVE
 * lesson grades what the recorder grades). Deterministic: same district → same
 * trace (rule config does not affect the serialized trace bytes).
 */
export function recordScVpHandbrakeDrive(
  districtRaw: unknown,
  name: ScVpHandbrakeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VP_HANDBRAKE_ID,
    kind,
    seed: 7,
    ruleConfig: { ...(SC_VP_HANDBRAKE.ruleConfig ?? {}) },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
