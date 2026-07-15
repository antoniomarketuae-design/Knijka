/**
 * sc-follow-brake — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Внезапно спиране на предния" (FO-02, lead-car brake
 * slam) on the committed fo-brake-v1 district, recorded with the template's OWN
 * staged lead car (brakingLeadCar sc-fb-lead — single truth, imported from the
 * template). The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (follows at a safe gap, reacts to
 *     the slam and stops WITHOUT contact, then resumes);
 *   - „Закъсняла реакция": brakes ~1.5 s too late → grades EXACTLY COLLISION;
 *   - „Без реакция": never brakes → grades EXACTLY COLLISION.
 *
 * All three approach IDENTICALLY at ~40 km/h behind the safe ~22 m gap (so the
 * pre-slam following never trips a code); they diverge only in the REACTION to
 * the slam, which is why the collision demos grade ONLY COLLISION.
 *
 * Geometry pinned to content/world/fo-brake-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 420 m long, limit 50 km/h. The lead car paces AHEAD in the SAME lane
 * and brake-slams at y = 230 (template sc-fb-lead).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_BRAKE } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_BRAKE_ID = "sc-follow-brake";

/** Northbound right-lane center of fo-brake-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — react and stop in time, then resume
// ---------------------------------------------------------------------------

export function scFollowBrakeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Следвай спокойно на около 40 км/ч и дръж поне 2 секунди дистанция." },
      { kind: "glance", mirror: "rear" },
      // Cruise at 40 up to just past the slam-fire point (~208): the lead slams
      // at y = 230 while the player is still at cruise.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 210]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Предният спира рязко — пълна спирачка веднага, без да въртиш волана." },
      // React: full (comfortable) brake to a complete stop with the gap intact.
      { kind: "drive", points: [[X_LANE, 210], [X_LANE, 227]], targetKmh: 40, stopAtEnd: true },
      { kind: "pause", sec: 3.6, brake: true },
      { kind: "annotation", textBg: "Спря напълно, без да удариш предния — дистанцията ти даде време." },
      // Resume once the lead drives on (resumeAfterSec 3): it pulls away, the
      // gap opens, and the follow finishes cleanly to the end of the street.
      { kind: "drive", points: [[X_LANE, 227], [X_LANE, 320], [X_LANE, 400]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: реагира навреме и продължи спокойно до края." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Закъсняла реакция" (COLLISION)
// ---------------------------------------------------------------------------

export function scFollowBrakeMistakeLateReactionScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията е добра, но реакцията закъснява." },
      { kind: "glance", mirror: "rear" },
      // Identical safe approach — but carry the cruise ~1.5 s PAST the slam
      // before braking: too late to stop in the gap.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 226]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Спирачката задейства късно — вече няма разстояние за спиране." },
      { kind: "drive", points: [[X_LANE, 226], [X_LANE, 244]], targetKmh: 40, stopAtEnd: true },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Секунда и половина закъснение стигна за удар — гледай далеч напред и реагирай веднага." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Без реакция" (COLLISION)
// ---------------------------------------------------------------------------

export function scFollowBrakeMistakeNoReactionScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: вниманието се отклони — предният спря незабелязано." },
      { kind: "glance", mirror: "rear" },
      // Identical safe approach — but NO brake at all: cruise straight into the
      // stopped lead.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 238]], targetKmh: 40, stopAtEnd: false },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Никакво спиране — челен удар отзад. Наблюдението изпреварва спирачката." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowBrakeTraceName =
  | "shadow-correct"
  | "mistake-late-reaction"
  | "mistake-no-reaction";

const SCRIPTS: Record<
  ScFollowBrakeTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowBrakeShadowScript },
  "mistake-late-reaction": { kind: "mistake", script: scFollowBrakeMistakeLateReactionScript },
  "mistake-no-reaction": { kind: "mistake", script: scFollowBrakeMistakeNoReactionScript },
};

/**
 * Record one of the three drives against a loaded fo-brake-v1 document — the
 * TEMPLATE's staged lead car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFollowBrakeDrive(
  districtRaw: unknown,
  name: ScFollowBrakeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_BRAKE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_BRAKE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
