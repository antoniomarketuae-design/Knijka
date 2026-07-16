/**
 * sc-ac-highbeam-lead — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дълги светлини зад кола" (AC-04) on the committed
 * fo-follow-v1 district, recorded at NIGHT with the template's OWN staged lead
 * car (brakingLeadCar sc-ah-lead — single truth, imported from the template).
 * The recorder feeds tick.isNight so the beam-dip detector is live, and the
 * pacing lead gives it a leadGapM to arm against; ambient traffic is ZERO
 * (seed 7).
 *
 * The trace gate replays exactly these through the production stack, at night:
 *   - shadow: low beams on (the recorder's night DEFAULT) for a calm ~28 km/h
 *     follow ~20 m behind the lead → ZERO violations + CLEAN_DRIVING (night's
 *     prudent-speed factor is 1, the 20 m gap sits far above the following
 *     threshold, and low beam behind the lead is exactly correct);
 *   - „Дълги през целия път": {headlights:"high"} from the start behind the
 *     moving lead grades EXACTLY HIGH_BEAM_NOT_DIPPED (3 s sustain, leadGapM
 *     ~20 m ≤ 150 m);
 *   - „Не превключи щом настигна": low beams first, then {headlights:"high"}
 *     mid-drive behind the lead → EXACTLY HIGH_BEAM_NOT_DIPPED.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The lead paces AHEAD in the SAME lane at
 * ~20 m; its slam tier is authored out of reach in the template — it is
 * deterministic moving traffic (the car the long beam dazzles), not a braking
 * drill. The drives stay centered, under the limit and at a safe gap, so the
 * ONLY gradable channel is the beam state.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_HIGHBEAM_LEAD } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_HIGHBEAM_LEAD_ID = "sc-ac-highbeam-lead";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — low beams the whole way behind the lead
// ---------------------------------------------------------------------------

export function scAcHighbeamLeadShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тъмно е и пред теб се движи кола — следвай я с включени КЪСИ светлини." },
      // Low beams: matches the recorder's night default, stated for the story.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Зад движеща се кола дългите светлини заслепяват през огледалата ѝ — карай на къси." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "На дълги минаваш само когато пред теб няма нито предна, нито насрещна кола." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка зад предната кола с включени къси светлини." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Дълги през целия път" (HIGH_BEAM_NOT_DIPPED)
// ---------------------------------------------------------------------------

export function scAcHighbeamLeadMistakeHighsAllWayScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: следва предната кола на дълги светлини през целия участък." },
      // High beams behind the moving lead the whole way → HIGH_BEAM_NOT_DIPPED
      // after the 3 s sustain. Speed legal, gap safe, lane centered: no other code.
      { kind: "headlights", setting: "high" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Дългите бият право в огледалата на предната кола и заслепяват водача ѝ." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Зад движеща се кола дългите се превключват на къси — веднага." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Не превключи щом настигна предния" (HIGH_BEAM_NOT_DIPPED)
// ---------------------------------------------------------------------------

export function scAcHighbeamLeadMistakeLateDipScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: тръгва на къси, но включва дългите зад движещата се пред него кола." },
      // Start correctly on low, then flick to HIGH behind the lead → the
      // detector arms and fires HIGH_BEAM_NOT_DIPPED after 3 s.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Включва дългите зад предната кола — вместо да я превключи на къси." },
      { kind: "headlights", setting: "high" },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 320]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Настигнеш ли предния, превключи на къси, не го дръж на дълги." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcHighbeamLeadTraceName = "shadow-correct" | "mistake-highs-all-way" | "mistake-late-dip";

const SCRIPTS: Record<
  ScAcHighbeamLeadTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcHighbeamLeadShadowScript },
  "mistake-highs-all-way": { kind: "mistake", script: scAcHighbeamLeadMistakeHighsAllWayScript },
  "mistake-late-dip": { kind: "mistake", script: scAcHighbeamLeadMistakeLateDipScript },
};

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — at
 * NIGHT, the TEMPLATE's staged lead car armed (single truth), ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScAcHighbeamLeadDrive(
  districtRaw: unknown,
  name: ScAcHighbeamLeadTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_HIGHBEAM_LEAD_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_HIGHBEAM_LEAD.staged ?? [])] as StagedEventSpec[],
    isNight: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
