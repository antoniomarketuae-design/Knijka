/**
 * sc-follow-distance — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дистанция на следване" (FO-01, steady-state
 * tailgating) on the committed fo-follow-v1 district, recorded with the
 * template's OWN staged lead car (brakingLeadCar sc-fd-lead — single truth,
 * imported from the template). The trace gate replays exactly these through the
 * production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a calm ~26 km/h follow that
 *     keeps the pinned ~13 m gap safely above the 2-second threshold for its
 *     speed);
 *   - „Лепене за предния": eases up behind a CLOSER-pacing clone of the lead
 *     (followGapM 8, hold 27 — demo-only; see scFollowDistanceStaged) and holds
 *     a visually GLUED ~4.5 m bumper gap (one car length, ~0.35 s at 48 km/h)
 *     for a sustained stretch → grades EXACTLY FOLLOWING_TOO_CLOSE. The shared
 *     13 m lead read as a normal follow on video (founder R-media #4); only the
 *     tailgate demo's lead moved — the shadow and gap-melts keep the 13 m lead;
 *   - „Дистанцията се топи": starts safe at 26, accelerates to 48 without
 *     opening the gap → grades EXACTLY FOLLOWING_TOO_CLOSE.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The lead car paces AHEAD in the SAME lane;
 * its slam tier is authored out of reach in the template — it is deterministic
 * moving traffic, the gap the following rule exists for, not a braking drill.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_DISTANCE } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_DISTANCE_ID = "sc-follow-distance";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scFollowDistanceShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб се движи кола — следвай я спокойно на дистанция от поне 2 секунди." },
      { kind: "glance", mirror: "rear" },
      // ~26 km/h behind the pinned ~13 m lead: ~1.8 s of gap — comfortably safe.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "На 26 км/ч тези 13 метра са около 1,8 секунди — има време за реакция." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 230]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Дистанцията се държи в секунди, не в метри на око — брой „едно-и-две“." },
      { kind: "drive", points: [[X_LANE, 230], [X_LANE, 345]], targetKmh: 26 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка с безопасна дистанция до предния." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Лепене за предния" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowDistanceMistakeTailgateScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: залепяне за предния — дистанцията се стопява до една дължина кола." },
      { kind: "glance", mirror: "rear" },
      // Ease up behind the closer lead (a smooth close from ~8 m to ~4.5 m of
      // bumpers — never overshooting into it), then GLUE on at 48 km/h.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "На 48 км/ч една дължина кола е под секунда — няма никакво време за реакция." },
      // The sustained tailgate: ~4.5 m bumper gap (~0.35 s) held for ~16 s.
      { kind: "drive", points: [[X_LANE, 70], [X_LANE, 300]], targetKmh: 48, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 300], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ако предният спре рязко, тук няма никакъв шанс за спиране — изостани." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Дистанцията се топи" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowDistanceMistakeGapMeltsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията беше добра, но с ускоряването се стопи." },
      { kind: "glance", mirror: "rear" },
      // Safe at 26, then accelerate to 48 WITHOUT dropping back — the same 13 m
      // becomes sub-second at speed.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Стрелката се качва, но дистанцията остава същата — грешка." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ускоряваш ли, изостани още — метрите остават същите, а нужната дистанция расте." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowDistanceTraceName =
  | "shadow-correct"
  | "mistake-tailgate"
  | "mistake-gap-melts";

const SCRIPTS: Record<
  ScFollowDistanceTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowDistanceShadowScript },
  "mistake-tailgate": { kind: "mistake", script: scFollowDistanceMistakeTailgateScript },
  "mistake-gap-melts": { kind: "mistake", script: scFollowDistanceMistakeGapMeltsScript },
};

/**
 * The staged lead for a given demo. The shadow and gap-melts demos replay the
 * TEMPLATE's single-truth lead (13 m of centers). The „Лепене за предния" demo
 * re-records against a CLOSER-pacing clone (followGapM 8 → a HELD ~4.5 m bumper
 * gap = one car length, ~0.35 s at 48 km/h; hold 27 so the initial gap is ~8 m
 * and the close is smooth, never overshooting into the lead) — the shared 13 m
 * lead read as a normal follow on video, not tailgating (founder R-media #4).
 * This changes only the DEMO's recording; the live lesson still uses the
 * template's own staged lead, and grading is unchanged (FOLLOWING_TOO_CLOSE).
 */
function scFollowDistanceStaged(name: ScFollowDistanceTraceName): StagedEventSpec[] {
  const base = [...(SC_FOLLOW_DISTANCE.staged ?? [])] as StagedEventSpec[];
  if (name !== "mistake-tailgate") return base;
  return base.map((e) =>
    e.kind === "brakingLeadCar" && e.id === "sc-fd-lead"
      ? { ...e, followGapM: 8, actor: { ...e.actor, hold: { nodeIndex: 0, offsetM: 27 } } }
      : e,
  );
}

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — the
 * demo's staged lead car armed (see scFollowDistanceStaged), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScFollowDistanceDrive(
  districtRaw: unknown,
  name: ScFollowDistanceTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_DISTANCE_ID,
    kind,
    seed: 7,
    stagedEvents: scFollowDistanceStaged(name),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
