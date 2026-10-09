/**
 * WHICH STAGED BODIES SHELTER THIS LESSON'S CAR FROM ITS WIND, and the one
 * function that turns their live poses into the factor the car's wind is
 * multiplied by (`vehicle/windShelter.ts`; sc-ac-wind-truck-pass:ff1d4290).
 *
 * ONE MAPPING, THREE CALLERS — the `vehicle/lessonWind.ts` discipline (round-1
 * verifier V-08 of the crosswind lane: a harness that retypes the thing it
 * measures drifts from it in silence):
 *
 *   `LessonScene`           builds it once per lesson and hands it to
 *                           `VehicleRig`, which calls it before every fixed
 *                           physics step with the chassis' own position;
 *   the live-wind harness   (`scenario/__tests__/liveWindDrive.ts`) calls the
 *                           same function before every `sim.update`;
 *   the trace recorder      (`traces/recorder.ts`, the correct demo's
 *                           held-wheel channel) calls it on the ghost's pose,
 *                           so the wheel the demo shows is eased in the lee
 *                           exactly where the live car's is.
 *
 * THE SCOPE IS TWO AUTHORED FACTS, BOTH REQUIRED: the lesson authors
 * `physics.crosswind`, and it stages at least one actor whose path spec says
 * `windShelter: true`. Otherwise this returns `null`, the caller sets nothing,
 * and `VehicleSim` never multiplies — sc-ac-crosswind and every calm lesson
 * are bit-identical by construction, not by a factor of 1.
 */

import type { StagedActorPathSpec, StagedEventSpec } from "../contracts";
import { vehicleHalfLengthM, vehicleHalfWidthM, type VehicleProfile } from "../traffic/types";
import { lessonRigPhysics, type LessonPhysicsFlags } from "../vehicle/lessonWind";
import { windShelterFactor, type WindShelterBody } from "../vehicle/windShelter";

/** The slice of a lesson this mapping reads (structural: a `LessonSpec` fits). */
export interface WindShelterLesson {
  physics?: LessonPhysicsFlags;
  stagedEvents?: readonly StagedEventSpec[];
}

/** One sheltering actor: its staged id and its body's half-extents. */
export interface WindShelterActor {
  actorId: string;
  halfLengthM: number;
  halfWidthM: number;
}

/** The live pose a sheltering actor is read at (a `StagedActorView` fits). */
export interface WindShelterPose {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
}

function actorPathOf(spec: StagedEventSpec): StagedActorPathSpec | null {
  const actor = (spec as { actor?: unknown }).actor;
  if (typeof actor !== "object" || actor === null) return null;
  return actor as StagedActorPathSpec;
}

/** The staged actors of this lesson that are authored as walls to its wind. */
export function lessonWindShelterActors(lesson: WindShelterLesson): WindShelterActor[] {
  if (lesson.physics?.crosswind !== true) return [];
  const out: WindShelterActor[] = [];
  for (const spec of lesson.stagedEvents ?? []) {
    const actor = actorPathOf(spec);
    if (actor === null || actor.windShelter !== true) continue;
    const profile = actor.profile as VehicleProfile | undefined;
    out.push({
      actorId: spec.id,
      halfLengthM: vehicleHalfLengthM(profile),
      halfWidthM: vehicleHalfWidthM(profile),
    });
  }
  return out;
}

/**
 * `(x, y) → factor` for this lesson's car, district space — or `null` when the
 * lesson has no lee to compute (see the header). `poseOf` is the live traffic
 * port's `staged(id)`; an actor that is not staged yet shelters nothing.
 */
export function createLessonWindShelter(
  lesson: WindShelterLesson,
  poseOf: (actorId: string) => WindShelterPose | null | undefined,
): ((x: number, y: number) => number) | null {
  const actors = lessonWindShelterActors(lesson);
  if (actors.length === 0) return null;
  const windSignX = Math.sign(lessonRigPhysics(lesson.physics).windLateralN);
  if (windSignX === 0) return null;
  // One scratch list, refilled per call: this runs once per fixed physics step.
  const bodies: WindShelterBody[] = [];
  return (x, y) => {
    bodies.length = 0;
    for (const a of actors) {
      const p = poseOf(a.actorId);
      if (!p) continue;
      bodies.push({ x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY, halfLengthM: a.halfLengthM, halfWidthM: a.halfWidthM });
    }
    return windShelterFactor(x, y, bodies, windSignX);
  };
}
