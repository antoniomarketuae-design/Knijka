/**
 * sc-hz-accident-scene — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Покрай прясна катастрофа" (VP-12) on the committed
 * hz-accident-v1 district, recorded with the template's OWN staged actors (the
 * bystander pedestrianDartOut + the arriving emergencyApproach rig — single
 * truth, imported from the template; the scHzEmergencyStop pattern). Ambient
 * traffic ZERO (seed 7).
 *
 * THE ENVELOPE THE DEMOS ARE TUNED AGAINST (read before editing):
 *   - the drives record with the template's config (NO ruleConfig override —
 *     unlike the two siblings: this drill never asks for a full-force stop, so
 *     the causeless-harsh-brake detector stays LIVE and every drive brakes
 *     gently, well under harshBrakeDecelMps2 = 7);
 *   - hz-accident-v1 has NO crossing (crossings: []) — so the bystander's
 *     synthetic crossingId never arms the CrossingZoneTracker and NO
 *     PEDESTRIAN_* code can fire in any drive (the sc-hz-emergency-stop finding);
 *   - the В27 noStopping span [120, 195] is authored MAP data: resting in the
 *     live lane inside it for ≥ 4 s grades ILLEGAL_STOP_IN_BAN_ZONE, and nothing
 *     else on this street can acquit the rest as queue- or control-shaped (no
 *     lead in the corridor, no stop line, no junction);
 *   - the wreck tableau is TWO recorder obstacle rects curb-side of the driving
 *     line (x left-edges ≈ 5.4): a car on the wide line (x = 1.8) clears them by
 *     > 2.5 m, a car threading the tight line (x = 5.5) hits them — the doc 76
 *     §5/§9 obstacle-rect discipline (sc-hz-emergency-stop's parked car).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: sheds speed to ~26 BEFORE the scene, arcs WIDE (x = 1.8) around
 *     the wreck and the bystander, never stops in the lane, lets the rig pass,
 *     resumes past the В27 span → ZERO violations;
 *   - „Зяпане със спиране в лентата" grades EXACTLY ILLEGAL_STOP_IN_BAN_ZONE
 *     (stops dead at y = 140 inside the span for 5.5 s — a gawk-stop the В27
 *     forbids, with no queue/control to excuse it);
 *   - „Минаване плътно и бързо покрай хората" grades EXACTLY COLLISION, and it
 *     grades it TWICE — once per BODY (holds 46 km/h on the tight line x = 5.5
 *     straight into the wreck rects — wheel in the lane, so no
 *     POOR_LANE_KEEPING; under the limit, so no SPEEDING).
 *
 *     THE TWO BODIES ARE THE POINT OF THE DEMO, so they are written down here
 *     rather than left to be rediscovered. MEASURED contact channel, 26 reports
 *     at 45.9 км/ч: t=13.13 the first wreck rect (vehicle) · t=13.43…13.82 the
 *     BYSTANDER dragged along at 60 Hz (24 pedestrian reports) · t=14.23 the
 *     second wreck rect. The sheet prints ПТП(vehicle) then ПТП(pedestrian) —
 *     the 24 pedestrian reports are one accident still happening, and the second
 *     wreck arrives 1.1 s after the first, inside collisionSeparationSec (1.2 s),
 *     so the vehicle episode is still open and does not re-bill. The residue,
 *     stated because it is real: the reducer is told the body's CATEGORY and
 *     nothing more, so those two distinct wrecked CARS read as one encounter —
 *     it errs innocent (A12) and closing it means a stable actor id on
 *     `pushCollision`, not a change here.
 *
 *     Trace-gate note: `__tests__/sc-hz-accident-scene-traces.test.ts` compares
 *     a de-duplicated `new Set(codes)` against the template's codeRefs, so it is
 *     blind to how many rows each code printed. The row COUNT and the BODIES are
 *     pinned on the live-session path instead —
 *     `lessons/scenario/__tests__/s-w8-bot-completion.test.ts`, „the
 *     tight-and-fast squeeze is опасна".
 *
 * Geometry pinned to content/world/hz-accident-v1.json: a 260 m two-way street
 * on x = 0, northbound right-lane center x = 4.06 (lane width 8.125), spawn
 * hza-spawn-approach (4.06, 15) heading north, limit 50, В27 span [120, 195], NO
 * crossings / intersections.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_HZ_ACCIDENT_SCENE } from "../lessons/scenario/templates-hazards2";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_HZ_ACCIDENT_SCENE_ID = "sc-hz-accident-scene";

/** Northbound right-lane center of hz-accident-v1. */
const LANE_X = 4.06;
/** The wide-pass line the shadow arcs onto (offset −2.26, inside the 3.25 tol). */
const WIDE_X = 1.8;
/** The tight line the squeeze demo threads — clips the wreck, offset +1.44. */
const TIGHT_X = 5.5;
/** The gawk-stop rest mark — inside the В27 span [120, 195]. */
const GAWK_STOP_Y = 140;

/**
 * The wreck tableau: two damaged cars askew in the curb-half of the lane. Each
 * rect's LENGTH axis is rotated off north (a crash sits crooked), so its
 * x-extent reaches ≈ 1.6 m either side of centre: rect 1 at (7.0, 150, 20°)
 * spans x ∈ [5.4, 8.6], rect 2 at (7.2, 162, −15°) spans x ∈ [5.7, 8.7]. A car
 * on the wide line (x = 1.8, hero half-width 0.85 → [0.95, 2.65]) clears both by
 * > 2.7 m; a car on the tight line (x = 5.5 → [4.65, 6.35]) overlaps both. The
 * driving line itself (x = 4.06 → [3.21, 4.91]) clears by ~0.5 m — the wreck
 * eats the curb-half, not the whole lane, which is why arcing wide is a choice
 * and not a necessity (the bystander is why it is the RIGHT choice).
 */
export function hzAccidentObstacles(): ObstacleRect2D[] {
  return [
    { x: 7.0, y: 150, headingDeg: 20, halfWidthM: 0.9, halfLengthM: 2.25, withWhat: "vehicle" as const },
    { x: 7.2, y: 162, headingDeg: -15, halfWidthM: 0.9, halfLengthM: 2.25, withWhat: "vehicle" as const },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — slow early, arc WIDE, never stop in lane
// ---------------------------------------------------------------------------

export function scHzAccidentSceneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Права улица, 50 км/ч. Напред вдясно — прясна катастрофа. Намаляваме РАНО, още преди да сме до нея." },
      { kind: "glance", mirror: "rear" },
      // Lawful approach, then a gentle shed to ~26 well before the scene — the
      // чл. 20 „намали под лимита", and enough over 22 that the bystander arms.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 55], [LANE_X, 90]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Слизам чувствително под 50 и покривам спирачката — не знам какво ще излезе иззад ламарините." },
      { kind: "drive", points: [[LANE_X, 90], [LANE_X, 116]], targetKmh: 26, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Линейка отзад — дръж вдясно и я пусни. И минавам ШИРОКО от хората: вземам вътрешната част на лентата." },
      // Arc onto the wide line (x = 1.8) and hold it slow past the wreck — the
      // gate sc-hzac-wide sits at (1.8, 155), completable only from here.
      { kind: "drive", points: [[LANE_X, 116], [LANE_X, 138], [3.0, 146], [2.0, 151], [WIDE_X, 156]], targetKmh: 26, stopAtEnd: false },
      { kind: "drive", points: [[WIDE_X, 156], [WIDE_X, 169]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Подминах сцената и платното пред мен е чисто — чак сега се връщам в средата на лентата." },
      // Back to the driving line and away — the run-out gate sc-hzac-clear is at
      // (4.06, 232), beyond the В27 span, where speed is legal again.
      { kind: "drive", points: [[WIDE_X, 169], [3.0, 181], [LANE_X, 197]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[LANE_X, 197], [LANE_X, 235]], targetKmh: 42 },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Точно така: намалих рано, минах широко и бавно покрай хората и не спрях да зяпам. Пътят остана чист за линейката." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Зяпане със спиране в лентата" (ILLEGAL_STOP_IN_BAN_ZONE)
// ---------------------------------------------------------------------------

export function scHzAccidentSceneMistakeGawkScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: вместо да мина, спирам в лентата — само да погледна катастрофата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 60], [LANE_X, 105]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Спирам да зяпам — насред лентата, в зоната на произшествието." },
      // Gentle stop at y = 140, INSIDE the В27 span [120, 195].
      { kind: "drive", points: [[LANE_X, 105], [LANE_X, GAWK_STOP_Y]], targetKmh: 20 },
      { kind: "pause", sec: 5.5, brake: true },
      { kind: "annotation", textBg: "Спрелият да гледа е тапа: В27 забранява престоя покрай произшествие, а зад теб иде линейка, на която пътят трябва да е чист." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Минаване плътно и бързо покрай хората" (COLLISION)
// ---------------------------------------------------------------------------

export function scHzAccidentSceneMistakeSqueezeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: не намалявам и се провирам плътно, на педя от ламарините и хората." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 60], [LANE_X, 110]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Без да сваля скорост, тръгвам плътно покрай сцената…" },
      // Onto the tight line (x = 5.5) and straight into the wreck rects AND the
      // bystander standing between them — wheel stays in the lane (offset
      // +1.44 < 3.25), speed under the 50 limit. Two bodies, two ПТП rows; the
      // header carries the measured channel.
      { kind: "drive", points: [[LANE_X, 110], [TIGHT_X, 140], [TIGHT_X, 150]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[TIGHT_X, 150], [TIGHT_X, 162]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Тесен и бърз проход не оставя нито метър за грешката им — и я намери." },
      // Drive on and settle BEYOND the В27 span (y > 195) — the stop is legal,
      // so it must not add ILLEGAL_STOP_IN_BAN_ZONE.
      { kind: "drive", points: [[TIGHT_X, 162], [LANE_X, 185], [LANE_X, 212]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Покрай произшествие се минава широко и бавно — далеч от хората, със скорост, при която движението им е изненада, а не удар." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScHzAccidentSceneTraceName = "shadow-correct" | "mistake-gawk-stop" | "mistake-squeeze";

const SCRIPTS: Record<
  ScHzAccidentSceneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scHzAccidentSceneShadowScript },
  "mistake-gawk-stop": { kind: "mistake", script: scHzAccidentSceneMistakeGawkScript },
  "mistake-squeeze": { kind: "mistake", script: scHzAccidentSceneMistakeSqueezeScript },
};

/**
 * Record one of the three drives against a loaded hz-accident-v1 document — the
 * TEMPLATE's staged bystander + rig armed (single truth), the wreck staged as
 * two obstacle rects, ambient traffic zero (the harness law). collisionMinKmh 5
 * so the tight-and-fast pass grades COLLISION on contact. Deterministic: same
 * district → same trace.
 */
export function recordScHzAccidentSceneDrive(
  districtRaw: unknown,
  name: ScHzAccidentSceneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick" | "stagedEvents">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_HZ_ACCIDENT_SCENE_ID,
    kind,
    seed: 7,
    /**
     * `spec.staged` IS NOT THE SHIPPED CAST, and a caller that replays this
     * drive into a compiled LESSON must say so. `compile.ts` merges
     * `spec.staged` with the rung's `stagedAdd`, and every rung of this
     * template adds `sc-hzac-bystander-2` — so a session compiled at L3 stages
     * THREE actors while this default stages TWO, and anything graded off the
     * resulting tick stream is structurally blind to the second bystander the
     * founder specifically asked for. The default stays two so the COMMITTED
     * recordings under content/traces/ do not move; the override exists so a
     * live-session replay can drive the world the student actually gets.
     */
    stagedEvents:
      extra?.stagedEvents ?? ([...(SC_HZ_ACCIDENT_SCENE.staged ?? [])] as StagedEventSpec[]),
    obstacles: hzAccidentObstacles(),
    collisionMinKmh: 5,
    ...(SC_HZ_ACCIDENT_SCENE.ruleConfig ? { ruleConfig: SC_HZ_ACCIDENT_SCENE.ruleConfig } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
