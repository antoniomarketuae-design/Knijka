"use client";

/**
 * lessonWorldRecipe — THE drill's scene-mount recipe, extracted verbatim from
 * LessonScene's load path so every other mount of "the drill's world" (the
 * clip-capture rig, future stills rigs) builds the EXACT same scene: same
 * builders, same seeds, same bay paint, same held scenery, same grip patches.
 *
 * Doc 66 R5 root cause (pilot v1): the capture rig RE-LISTED LessonScene's
 * components instead of reusing its recipe, and every divergence (options,
 * quality, tree seed) became a render defect the founder had to catch. This
 * module makes divergence structurally impossible: LessonScene now calls
 * these helpers itself, so the capture mount and the drill mount cannot
 * drift apart without a diff here.
 *
 * Pure client-side TS (no React) — callers own fetching the district JSON
 * and everything after the core build (traffic anchoring, directors, aids).
 */

import {
  lessonDistrictId,
  scenarioBaysOf,
  type ParkingBaySpec,
} from "@/modules/sim/contracts";
import {
  isScenarioLessonId,
  lessonParkingBaysFor,
  type LessonSpec,
} from "@/modules/sim/lessons";
import {
  assertDistrict,
  buildWorldGeometry,
  type WorldGeometry,
} from "@/modules/sim/world";
import {
  createWorldRuntime,
  resolveSurfaceGripPatches,
  type SurfaceGripPatch,
} from "@/modules/sim/runtime";
import type { createTrafficSystem } from "@/modules/sim/traffic";
import {
  heldSceneryFor,
  parkedClearZonesFor,
  type ParkedClearZone,
} from "./scenarioSceneryProps";
import type { ScenarioObstacleSpec } from "./obstacleSpec";

/** Minimal structural mirror of the district's spawn points (the runtime and
 *  world modules each validate the full document). */
export interface SpawnPointLike {
  id: string;
  x: number;
  y: number;
  heading: number;
}

export interface LessonWorldCore {
  runtime: ReturnType<typeof createWorldRuntime>;
  district: ReturnType<typeof assertDistrict>;
  geometry: WorldGeometry;
  /** S1: precise hittable parked cars + held scenery (scenario lessons only). */
  scenarioObstacles: ScenarioObstacleSpec[];
  /** Authored clear zones for TrafficLayer's parked-car curb pass (doc 66 R5,
   *  founder v1 №9 — visual-only; [] for templates without one). Mount them
   *  on the layer: `<TrafficLayer parkedClearZones={core.parkedClearZones}>`. */
  parkedClearZones: readonly ParkedClearZone[];
  /** SURFACE-PATCH slice: waterPatch/icePatch rects ([] on pre-slice maps). */
  gripPatches: SurfaceGripPatch[];
  spawnPoints: SpawnPointLike[];
}

/** Public URL of a committed district document. */
export function districtUrlFor(lesson: LessonSpec): string {
  return `/world/${lessonDistrictId(lesson)}.json`;
}

/**
 * Build the drill's world core from the RAW district document — byte-for-byte
 * the block LessonScene ran inline before extraction: runtime, validated
 * district, bay-paint recipe (per-district curriculum bays + scenario meta
 * bays + the lesson's graded rect, deduped), buildWorldGeometry with exactly
 * those options (default tree seed — never a second recipe), occupied-bay
 * obstacles + held scenery, and the district's authored grip patches.
 */
export function buildLessonWorldCore(lesson: LessonSpec, raw: unknown): LessonWorldCore {
  const districtId = lessonDistrictId(lesson);
  const runtime = createWorldRuntime(raw);
  const district = assertDistrict(raw);
  // Bay paint is CURRICULUM data, per district (doc 74 §5.4); scenario-lot
  // districts ADD their meta.scenario bay rects, plus the lesson's own graded
  // rect defensively deduped (the L7 painted-rect-equals-graded-rect law).
  const scenarioBays = scenarioBaysOf(raw);
  const paintBays: ParkingBaySpec[] = [
    ...lessonParkingBaysFor(districtId),
    ...scenarioBays.map((b) => ({
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      widthM: b.widthM,
      lengthM: b.lengthM,
    })),
  ];
  if (
    lesson.parkingBay &&
    !paintBays.some((b) => b.x === lesson.parkingBay!.x && b.y === lesson.parkingBay!.y)
  ) {
    paintBays.push({ ...lesson.parkingBay });
  }
  const geometry = buildWorldGeometry(district, { parkingBays: paintBays });
  // Occupied bays → precise hittable parked cars + the template's held
  // scenery (scenario lessons only; [] everywhere else).
  const scenarioObstacles: ScenarioObstacleSpec[] = isScenarioLessonId(lesson.id)
    ? [
        ...scenarioBays
          .filter((b) => b.occupied)
          .map((b, i) => ({
            kind: "vehicle" as const,
            x: b.x,
            y: b.y,
            headingDeg: b.headingDeg,
            seed: i,
          })),
        ...heldSceneryFor(lesson.id, raw),
      ]
    : [];
  const gripPatches = resolveSurfaceGripPatches(district);
  const spawnPoints = (raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? [];
  return {
    runtime,
    district,
    geometry,
    scenarioObstacles,
    parkedClearZones: parkedClearZonesFor(lesson.id),
    gripPatches,
    spawnPoints,
  };
}

/**
 * SIGNAL MODES (doc 62 S1): dial the lesson's clusters DARK / FLASHING AMBER
 * at session start — sorted application keeps a hypothetical multi-cluster
 * dial deterministic. The exact loop LessonScene ran inline (and the same
 * node→mode map the trace recorder applies), shared so live play and capture
 * can never desync on it.
 */
export function applySignalModes(
  runtime: ReturnType<typeof createWorldRuntime>,
  lesson: LessonSpec,
): void {
  for (const [nodeId, mode] of Object.entries(lesson.signalModes ?? {}).sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    runtime.setSignalClusterMode(nodeId, mode);
  }
}

/**
 * Wire the traffic system's telemetry queries into the runtime — the seven
 * hookups LessonScene ran inline (and recordScriptedDrive's exact set), so
 * the rule engine's proximity detectors see the same world in every mount.
 */
export function wireTrafficQueries(
  runtime: ReturnType<typeof createWorldRuntime>,
  traffic: ReturnType<typeof createTrafficSystem>,
): void {
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));
}
