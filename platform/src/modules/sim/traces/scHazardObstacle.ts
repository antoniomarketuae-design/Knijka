/**
 * sc-hazard-obstacle — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Заобикаляне на обект на платното" (OV-18) on the
 * committed hz-obstacle-v1 district. No lane actors, ambient traffic ZERO
 * (seed 7): the ONLY hazard is a STOPPED car curb-side of the driving line,
 * staged as a recorder obstacle rect (the sc-pk-smooth-stop pattern), so the
 * ONLY things the stack can grade are the driver's own avoidance and any contact
 * with the obstacle.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; EASES toward the centreline WITHIN the lane
 *     (never crossing into oncoming — laneId 0 throughout, lateral offset under
 *     the 3.25 m lane-keep tolerance) and clears the obstacle;
 *   - „Задържане по линията" grades EXACTLY COLLISION (holds the driving line
 *     into the stopped car);
 *   - „Закъсняло отклонение" grades EXACTLY COLLISION (swerves too late and
 *     clips the obstacle's corner).
 *
 * Geometry pinned to content/world/hz-obstacle-v1.json: a 240 m straight street
 * on x = 0, right-lane center x = 4.06, spawn hz-spawn-approach (4.06, 15)
 * heading north, limit 50. The stalled car sits centred at (5.5, 130) (curb-side
 * of the 4.06 driving line): the hero footprint clears it from an ease to
 * x ≈ 2.0 and overlaps it while holding the 4.06 line.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_HAZARD_OBSTACLE_ID = "sc-hazard-obstacle";

/** Northbound right-lane center of hz-obstacle-v1. */
const LANE_X = 4.06;

/** A stalled car curb-side of the driving line at (5.5, 130): the obstruction
 *  the driver must ease around within the wide lane. */
export function hazardObstacleRects(): ObstacleRect2D[] {
  return [
    {
      x: 5.5,
      y: 130,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — an early, smooth in-lane ease-around
// ---------------------------------------------------------------------------

export function scHazardObstacleShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред, към бордюрната страна на лентата, стои аварирал автомобил — забелязваме го отдалеч." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 95]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Намаляваме и се оглеждаме назад, преди да се отклоним — заобикалянето също е маневра." },
      // Ease toward the centreline (x ≈ 2.0) to clear, then return — all within
      // the lane, offset under the lane-keep tolerance, never crossing x = 0.
      { kind: "drive", points: [[LANE_X, 95], [2.0, 118], [2.0, 142], [LANE_X, 165]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Плавно към средата на своята лента, без да навлизаме в насрещното — платното е широко." },
      { kind: "drive", points: [[LANE_X, 165], [LANE_X, 225]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Готово: забелязахме отрано, заобиколихме плавно и се върнахме в лентата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Задържане по линията" (into the stalled car = COLLISION)
// ---------------------------------------------------------------------------

export function scHazardObstacleMistakeHoldScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: колата продължава право по линията, все едно обектът го няма." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, 145]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Няма отклонение — предницата отива право в спрелия автомобил…" },
      { kind: "drive", points: [[LANE_X, 145], [LANE_X, 200]], targetKmh: 20 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Обект на платното иска ранно забелязване и плавно отклонение, не надежда, че „ще се размине“." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Закъсняло отклонение" (clips the obstacle corner = COLLISION)
// ---------------------------------------------------------------------------

export function scHazardObstacleMistakeLateScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: отклонението идва в последния момент — рязко и твърде късно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 122]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Забелязан късно, обектът е вече върху колата — рязкото дърпане не стига…" },
      { kind: "drive", points: [[LANE_X, 122], [LANE_X, 128], [3.0, 132]], targetKmh: 34 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Който забележи опасността отдалеч, има време за плавна маневра; който я види късно, вече няма избор." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScHazardObstacleTraceName = "shadow-correct" | "mistake-hold-line" | "mistake-late-swerve";

const SCRIPTS: Record<ScHazardObstacleTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scHazardObstacleShadowScript },
  "mistake-hold-line": { kind: "mistake", script: scHazardObstacleMistakeHoldScript },
  "mistake-late-swerve": { kind: "mistake", script: scHazardObstacleMistakeLateScript },
};

/**
 * Record one of the three drives against a loaded hz-obstacle-v1 document — the
 * stalled-car obstacle armed, ambient traffic zero (the harness law).
 * collisionMinKmh 0 so even a gentle contact grades COLLISION (doc 76 §0).
 * Deterministic: same district → same trace.
 */
export function recordScHazardObstacleDrive(
  districtRaw: unknown,
  name: ScHazardObstacleTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_HAZARD_OBSTACLE_ID,
    kind,
    seed: 7,
    obstacles: hazardObstacleRects(),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
