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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FOUR „THE WORLD IS NOT THE LESSON" ROWS PARKED ON THIS FILE — MEASURED,
 * AND ONLY ONE OF THEM IS ANSWERABLE FROM HERE (2026-08-24).
 *
 * The rows, verbatim: „the car ends up INSIDE building geometry" (sc-pk-
 * driveway, critical); „the briefing's whole premise is «сграда на ъгъла
 * закрива гледката надясно» … the corner is open field" and „dense city on the
 * approach street and bare terrain 100 m later" (sc-junction-blind); „beyond
 * the priority road the world stops" (sc-junction-left); „finishes parked on a
 * grey slab in the middle of an empty green field" (sc-ov-lane-keeping).
 *
 * They were routed here on a true premise — this function is the ONE place a
 * LESSON and a DISTRICT are held at the same time, so if anything in the
 * product is supposed to notice that the world does not contain what the
 * briefing describes, it is this. Nothing did. What follows is what each row
 * turned out to BE, built through this recipe rather than argued from the
 * source, so the next reader does not re-derive it. Every number below was
 * produced by `buildLessonWorldCore` on the committed districts.
 *
 * 1. sc-pk-driveway, „inside building geometry". TWO defects behind one frame,
 *    and neither is the „no solid body" the row's second clause guesses at —
 *    `colliders.buildings` on pk-drive-v1 carries all five masses (80 vertices
 *    = 5 × 16), and the sweep's own t050s frame is the ПТП card firing.
 *      (a) THE GRADED CELL IS HALF KERB. Sampled on a 5 × 3 lattice, 16 of the
 *          17 catalogue bays stand 15/15 on the driven carriageway;
 *          `PK_DRIVE_TARGET_BAY` (8, 45) 2.7 × 5 @ 90° stands 9/15, with 6
 *          stations on the raised sidewalk: its outer edge reaches x = 10.5
 *          against a built kerb line at x = 8.125, so 2.375 m of a 5 m cell —
 *          47.5% of it — is pavement, and the white U is painted there 0.11 m
 *          BELOW the pavement drawn over it. That is measured, pinned
 *          and mutation-tested in `__tests__/lesson-world-bay-clearance.test.ts`
 *          §2. OWNER: `lessons/scenario/templates-pk.ts` (the bay, pinned
 *          value-for-value against `traces/scPkDriveway.ts`) and/or
 *          `tools/maps/gen_pk_driveway.mjs` (the cross-section / a dropped kerb
 *          across the driveway mouth). Not this file's to move, and §2 fails
 *          the day either moves, so the repair is verifiable rather than
 *          claimed.
 *      (b) THE GARAGE IS AUTHORED 4 m AND BUILT 18.27 m, AND IT STANDS WHERE
 *          THE LESSON PARKS THE CAR. `pkd-b-garage` (x ∈ [12, 18],
 *          y ∈ [37, 53]) authors `height: 4` beside `heightSource: "default"`,
 *          and `cityBuildings.resolveBuildingHeightM` reads "default" as NO
 *          DATA and substitutes its 15–25 m jitter — measured on the shipped
 *          function, `resolveBuildingHeightM("pkd-b-garage") = 18.27`. Both the
 *          wall mesh and the collider take that height (`buildings.buildOne`
 *          calls it once, line 114), so a four-metre garage is built as a
 *          six-storey block whose west face is 1.5 m from the graded bay's east
 *          edge (§1) — and `PK_DRIVE_TARGET_BAY.headingDeg` is 90°, so the car
 *          that finishes the drill is pointed straight into it at ~4 m. An
 *          18 m wall 4 m from the eye fills the whole windscreen: that IS the
 *          row's „facade at arm's length … the view is inside the structure".
 *          NOT A ONE-MAP SLIP: 222 buildings on the committed scenario maps,
 *          written by ~30 `tools/maps/gen_*.mjs`, author a deliberate height
 *          beside `heightSource: "default"` — including all 14 lot kiosks at
 *          3.5 m. OWNER: the generators, or the „default" contract in
 *          `world/builders/cityBuildings.ts` (DEFAULT_HEIGHT_MIN_M /
 *          DEFAULT_HEIGHT_MAX_M). It is a data/renderer contract mismatch, not
 *          a placement bug, and it is the first thing to fix on this row.
 *      (c) A SECOND MASS IS REACHABLE AND THIS IS A HYPOTHESIS, NOT A
 *          MEASUREMENT — the chassis pose was never logged, and the previous
 *          routing lane asked for exactly that before anyone touches a file
 *          (`.audit-frames/routing-collision.json`, sc-ov-being-overtaken:
 *          „verify which of the two it is by logging the chassis translation
 *          against both footprints on a re-drive"). `terminusClosures` puts two
 *          masses (18.27 m and 13.15 m) at y ∈ [108, 128] on a street whose
 *          asphalt ends at y = 90, so a lane that keeps driving forward reaches
 *          them across `terrainPaved`. WHAT ARGUES AGAINST IT FOR THE ROW'S OWN
 *          FRAME: `pc-right/04-t045s.png` is DEMONSTRATION playback („ДЕМОНСТРА-
 *          ЦИЯ — СЛЕДВАЙ СЯНКАТА, 0:17 / 0:21"), and the shadow script in
 *          `traces/scPkDriveway.ts` never leaves y ∈ [16, 51.3] — at 0:17 of 21 s
 *          it is reversing into the bay, i.e. beside the garage, not 60 m north
 *          of the road's end. Read (b) first for that frame; (c) is live for the
 *          free-driving mobile lanes only, and only a logged pose decides it.
 *          Either way `buildings.buildOne` gives every mass a collider that is
 *          an open tube of wall quads with no floor and no cap, so a chassis
 *          that does arrive ends up inside rather than stopped — ALREADY routed
 *          with proof to `world/builders/buildings.ts` and `lessons/finish.ts`
 *          in `.audit-frames/routing-collision.json` (sc-ln-turn-lane-arrows).
 *          Nothing here authors a collider.
 *
 * 2. sc-junction-blind, „the corner is open field". THE MAP'S ONLY BUILDING
 *    STOPS OCCLUDING BEFORE THE STUDENT REACHES THE GIVE-WAY LINE, AND THERE
 *    IS NOTHING ON THE OTHER THREE CORNERS. `tj-b-occluder` stands
 *    x ∈ [20, 46], y ∈ [-46, -20] and it is the district's ONLY building
 *    (`meta.stats.buildings` = 1) on a 140 m + 130 m junction, so three corners
 *    of the drill's own junction are bare ground — which is what the frame is
 *    photographing. The sight line, derived from the shipped numbers rather
 *    than estimated: `SC_JUNCTION_BLIND_CONFLICT.lineDistM` = 18 puts the
 *    give-way pose at (4.06, -18); the actor runs east→west, so it sits in the
 *    westbound lane at y ≈ +4.06, released `armDistM` = 70 out. That ray
 *    crosses the building's west face x = 20 at y = -12.7 — 7.3 m NORTH of its
 *    nearest face — and crosses further north still as the car closes. Occlusion
 *    exists only further back: from the `sc-jblind-approach` disc at (4.06, -30)
 *    the same ray crosses x = 20 at y = -21.8, i.e. 1.8 m inside the footprint.
 *    So the mass hides the car on the approach and has released it by the line,
 *    which is precisely backwards for instruction 3 („изпълзи внимателно,
 *    докато очите наистина видят зад сградата" — there is nothing left to creep
 *    past). Both the setback and the three empty corners are map data. OWNER:
 *    the tj-occluded-v1 generator under `tools/maps/`.
 *
 * 3/4. sc-junction-left and sc-ov-lane-keeping, „the world stops" / „a grey
 *    slab in an empty green field". The slab is `terrainPaved`, and it is not
 *    the lesson's ground at all: on tj-emerge-v1 it spans x ∈ [-216, 216]
 *    against roads that reach x = 160, because `terrain.ts` zones paved ground
 *    by proximity to a BUILDING and pads each terminus mass by 20 m. So a car
 *    that leaves the carriageway drives onto a 400 m concrete apron and then
 *    onto grass. This is the same defect `buildWorldGeometry.ts` already fixed
 *    for `mapKind: "scenario-lot"` (its `lotApronFootprint` / `lotEnclosure`
 *    block) and did not fix for `scenario-street` / `scenario-junction` — those
 *    are the mapKind strings the two gates actually test (`buildWorldGeometry.ts`
 *    lines 199 and 319, `mapKind !== "scenario-lot"`); „t-junction" is the
 *    scenario ARCHETYPE and matches nothing there. OWNER:
 *    `world/builders/buildWorldGeometry.ts` + `world/builders/terrain.ts`.
 *
 *    ── 2026-08-27 · HALF OF THIS ONE IS ANSWERED, AND IT IS THE HALF THE
 *       FRAMES ARE OF. `world/builders/worldRim.ts` now belts every district
 *       that declares a `mapKind` (103 of the 105 — both OSM extracts are
 *       excluded on purpose, see its gate) with a contiguous row of building
 *       masses 37–43 m past the declared bounds, through the same
 *       `extraVolumes` seam the lot enclosure uses: zero draw calls, and the
 *       walls land in `colliders.buildings`. On tj-emerge-v1 — sc-junction-left's
 *       own map — the authored streetwall stops at x = −69 and restarts at
 *       x = +68, so the 137 m of horizon a student sees from the stop line at
 *       (4.06, −18) is exactly the gap; the belt fills it. `world/__tests__/
 *       world-rim.test.ts` §2 fires 72 rays from every authored spawn on nine
 *       maps and requires each one to meet a facade before it reaches
 *       `districtWorldEdge`.
 *
 *       WHAT IS NOT ANSWERED, so this is not read as closed. The row's other
 *       half — „a 400 m concrete apron", i.e. `terrainPaved` zoning off the
 *       terminus masses on `scenario-street` / `scenario-junction` — is
 *       untouched: the belt is deliberately kept OUT of the terrain pass's aabb
 *       list (a 20 m paved ring around every map is a bigger version of the same
 *       defect), and the terminus masses that cause the apron are still in it.
 *       And nothing out there is DRESSED: no kerb, no marking, no pavement, no
 *       parked cars between the last asphalt and the belt. „No far-side street"
 *       is still true; „no buildings" is not.
 *
 * WHAT WAS TRIED HERE AND REFUTED, so it is not tried again. (i) „the parked
 * decoration stands in the graded cell" — measured with the shipped
 * `computeParkedCars` over all 17 scenario bays and all 11 curriculum/полигон/
 * exam bays: ZERO overlaps, so a `parkedClearZones` rule for the graded bay
 * would remove nothing and was not written. (ii) „a lesson objective is
 * anchored off the carriageway" — 393 objective anchors, 1 genuine off-road
 * (sc-merge-motorway-exit, another lane's) and 6 roundabout-centre artefacts;
 * no population defect. (iii) „the bay paint the recipe emits strays outside
 * the district" — `lessonParkingBaysFor` is district-scoped, `stats.parkingBays`
 * is 1/0/0/0 on the four maps, no stray rect.
 * ═══════════════════════════════════════════════════════════════════════════
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
  // THE ONE VALUE HERE THAT CAN FAIL SILENTLY (2026-08-19). The consumer is
  // `spawnPose` (LessonScene.tsx:398):
  // `spawnPoints.find(s => s.id === lesson.spawn.pointId)` with
  // `p?.x ?? explicit?.x ?? 0` after it. So a lesson whose `pointId` is not in
  // the district it loads raises nothing — it is a car placed at district
  // ORIGIN facing north, which on every scenario junction map is the middle of
  // the junction, and every objective after that is graded against a route the
  // student never joined. That is the shape of the four world findings routed
  // to this file („the world does not match the briefing", „it has left the
  // authored world"), reached from the other end. One renamed spawn point in a
  // generator is enough.
  //
  // THE `?? []` IS NOT PART OF IT, and that half was written as a hazard and
  // then disproved: `createWorldRuntime` above runs `parseDistrict`, which
  // throws `district: missing spawnPoints[]` (runtime/district.ts:361) before
  // this line is reached. The array is guaranteed by the schema; only the
  // NAMED-BUT-ABSENT id falls through. Both halves are pinned in
  // `__tests__/lesson-world-spawn-resolution.test.ts`.
  //
  // MEASURED before it was called a hazard, over every playable spec —
  // LESSONS + POLIGON_LESSONS + EXAM_LESSON plus all 167 scenario templates at
  // every authored rung, 819 lessons: 0 unresolved. It is latent, not live,
  // and that test carries its own positive control — a census that silently
  // stopped finding lessons would report exactly this same 0.
  const spawnPoints = (raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? [];
  return {
    runtime,
    district,
    geometry,
    scenarioObstacles,
    // `raw` is passed so the bus-stop kerb rule can see the district's
    // authored `kind: "busStop"` frontages (doc 87 B64) — nobody parks at a
    // spirka, and the shelter has to be visible from the road.
    parkedClearZones: parkedClearZonesFor(lesson.id, raw),
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
