/**
 * compileScenario — ScenarioSpec × level → LessonSpec (doc 76 §2: a scenario
 * COMPILES INTO the existing lesson machinery; no engine fork).
 *
 * The compiled object is a plain, valid LessonSpec: createLessonSession,
 * the rule engine, teach-pause, escalation and the wire all run it unchanged.
 * Level differences are PARAMETER DELTAS (doc 76 §7) applied here:
 *
 *   | Level | Aids (DEFAULT_LEVEL_AIDS)                       | examMode |
 *   |  L1   | shadow + ribbon + follow hints + pause-on-error |          |
 *   |       | + top-down driving allowed                      |   off    |
 *   |  L2   | ribbon only, hints after idle                   |   off    |
 *   |  L3   | none                                            |   off    |
 *   |  L4   | none, cockpit-locked (no aids flag set)         |   ON     |
 *   |  L5   | none + traffic/conditions/staged complications  |   off    |
 *
 * Compile decisions (documented):
 *  - preDrive is OFF: a maneuver drill starts at the skill, not the 13-step
 *    ritual (the curriculum owns pre-drive training). vehicleStart defaults
 *    to "ready"; L4 rungs typically override to "cold" (exam protocol).
 *  - The bay of the first parkInBay success objective becomes
 *    LessonSpec.parkingBay — the painted rect IS the graded rect (the L7
 *    single-truth pattern). The scene must include it in the paint set
 *    (S0-View: merge lesson.parkingBay into the buildWorldGeometry bays).
 *  - Traffic defaults to ZERO (a focused micro-map is not a boulevard);
 *    templates/levels opt back in per rung.
 *  - weather: dry/rain/FOG compile (fog ungated — FogExp2 render + tick.fog
 *    conditions envelope + fog-lamp duty, doc 72 AC-03); snow stays TAGGABLE
 *    but not compilable (doc 76 §0 weather gaps) — such a rung throws.
 */

import type { LessonAidsSpec, LessonObjective, LessonSpec, ParkingBaySpec } from "../../contracts";
import { parseObjectiveParams } from "../objectives";
import { serializeObjectiveParams } from "./params";
import { assertScenarioSpec } from "./validate";
import {
  SCENARIO_LEVEL_NAMES_BG,
  type LevelSpec,
  type ScenarioLevel,
  type ScenarioSpec,
} from "./types";

// ---------------------------------------------------------------------------
// Ladder defaults (doc 76 §7)
// ---------------------------------------------------------------------------

/** The §7 aid table — per-level defaults a LevelSpec may override. */
export const DEFAULT_LEVEL_AIDS: Record<ScenarioLevel, LessonAidsSpec> = {
  1: {
    shadowCar: true,
    pathRibbon: true,
    followHints: true,
    pauseOnError: true,
    topdownAllowed: true,
  },
  2: { pathRibbon: true, hintsAfterIdleSec: 20 },
  3: {},
  4: {}, // examMode carries the exam-protocol behavior; no aids by definition
  5: {},
};

/** Scenario micro-lessons carry NO ambient traffic unless a rung opts in. */
export const SCENARIO_DEFAULT_TRAFFIC = {
  vehicleCount: 0,
  pedestrianCount: 0,
  anchorRadiusM: 400,
} as const;

/**
 * LessonSpec.order of every compiled scenario: a SELECT-GRID SORT KEY ONLY,
 * far outside the contiguous 0..n curriculum chain (the A13/полигон pattern —
 * linear progression never sees these entries).
 */
export const SCENARIO_LESSON_ORDER = 1000;

// Re-exported for tooling/tests (the serializer itself lives in params.ts to
// keep validate ↔ compile cycle-free).
export { serializeObjectiveParams } from "./params";

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------

export class ScenarioCompileError extends Error {
  constructor(specId: string, level: number, message: string) {
    super(`compileScenario("${specId}", L${level}): ${message}`);
    this.name = "ScenarioCompileError";
  }
}

/** Merge ladder defaults with the rung's overrides; drop falsy flags so the
 *  compiled aids object stays minimal (absent = off, the contract default). */
function mergeAids(level: ScenarioLevel, overrides?: Partial<LessonAidsSpec>): LessonAidsSpec | undefined {
  const merged: LessonAidsSpec = { ...DEFAULT_LEVEL_AIDS[level], ...(overrides ?? {}) };
  const out: LessonAidsSpec = {};
  if (merged.shadowCar) out.shadowCar = true;
  if (merged.pathRibbon) out.pathRibbon = true;
  if (merged.followHints) out.followHints = true;
  if (merged.pauseOnError) out.pauseOnError = true;
  if (merged.topdownAllowed) out.topdownAllowed = true;
  if (merged.hintsAfterIdleSec !== undefined && merged.hintsAfterIdleSec > 0) {
    out.hintsAfterIdleSec = merged.hintsAfterIdleSec;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Compile one template rung into a playable micro-lesson. Throws
 * ScenarioSpecError (invalid template) or ScenarioCompileError (level not
 * authored / condition gated). Pure + deterministic: same spec + level =
 * identical LessonSpec (golden-snapshot-tested).
 */
export function compileScenario(spec: ScenarioSpec, level: ScenarioLevel): LessonSpec {
  assertScenarioSpec(spec);

  const rung: LevelSpec | undefined = spec.levels.find((l) => l.level === level);
  if (!rung) {
    throw new ScenarioCompileError(
      spec.id,
      level,
      `the template does not author L${level} (has: ${spec.levels.map((l) => `L${l.level}`).join(", ")})`,
    );
  }

  // Conditions: rung overrides template. FOG is compilable (doc 76 §0 weather
  // gap closed: FogExp2 render + tick.fog conditions envelope + fog-lamp duty);
  // SNOW stays a catalog tag until its render/friction slice ships.
  const conditions = { ...(spec.conditions ?? {}), ...(rung.conditions ?? {}) };
  if (conditions.weather === "snow") {
    throw new ScenarioCompileError(
      spec.id,
      level,
      `condition "${conditions.weather}" is tag-only for now (doc 76 §0 weather gaps) — the engine ships dry/rain/fog (+night)`,
    );
  }
  const environment: LessonSpec["environment"] | undefined =
    conditions.night || conditions.weather === "rain" || conditions.weather === "fog"
      ? {
          ...(conditions.night ? { timeOfDay: "night" as const } : {}),
          ...(conditions.weather === "rain" ? { rain: true } : {}),
          ...(conditions.weather === "fog" ? { fog: true } : {}),
        }
      : undefined;

  const toleranceScale = rung.toleranceScale ?? 1;
  const objectives: LessonObjective[] = spec.success.map((o) => {
    const { kind, params } = serializeObjectiveParams(o.params, toleranceScale);
    return { id: o.id, titleBg: o.titleBg, kind, params };
  });

  // Single-truth paint: the first parkInBay's bay is the lesson's painted rect.
  let parkingBay: ParkingBaySpec | undefined;
  for (const o of spec.success) {
    if (o.params.kind === "completeManeuver" && o.params.maneuver === "parkInBay") {
      parkingBay = { ...o.params.bay };
      break;
    }
  }

  const staged = [...(spec.staged ?? []), ...(rung.stagedAdd ?? [])];
  const examMode = rung.examMode ?? level === 4;
  const traffic = {
    vehicleCount: rung.traffic?.vehicleCount ?? SCENARIO_DEFAULT_TRAFFIC.vehicleCount,
    pedestrianCount: rung.traffic?.pedestrianCount ?? SCENARIO_DEFAULT_TRAFFIC.pedestrianCount,
    anchorRadiusM: rung.traffic?.anchorRadiusM ?? SCENARIO_DEFAULT_TRAFFIC.anchorRadiusM,
  };

  const lesson: LessonSpec = {
    // Variant naming (doc 76 §2): template id + level rung — the wire
    // resolver (resolve.ts scenarioLessonById) parses exactly this shape so
    // the server regrades by recompiling the same pure spec (the B1b exam-
    // bank pattern).
    id: `${spec.id}@L${level}`,
    order: SCENARIO_LESSON_ORDER,
    titleBg: `${spec.titleBg} · Ниво ${level} — ${SCENARIO_LEVEL_NAMES_BG[level]}`,
    descriptionBg: spec.objectiveBg,
    conceptIds: [...spec.conceptIds],
    world: { districtId: spec.map.districtId },
    traffic,
    spawn: spec.start.spawnPointId
      ? { pointId: spec.start.spawnPointId }
      : {
          position: { ...spec.start.position! },
          headingDeg: spec.start.headingDeg,
        },
    // Maneuver drills start at the skill; the curriculum owns the ritual.
    preDrive: false,
    vehicleStart: rung.vehicleStart ?? spec.start.vehicleStart ?? "ready",
    objectives,
    // S1 (doc 76 §0 low-speed fidelity): scenario micro-lessons grade ANY
    // contact — a 2 km/h bumper touch on a parked car IS the mistake being
    // taught. Street lessons keep VehicleRig's 10 km/h nudge tolerance by
    // omitting the field.
    collisionMinKmh: 0,
    ...(environment ? { environment } : {}),
    ...(parkingBay ? { parkingBay } : {}),
    ...(staged.length > 0 ? { stagedEvents: staged } : {}),
    ...(examMode ? { examMode: true } : {}),
    // Config-gated drills: carry the detector opt-in to the LIVE session so
    // the student's own attempt grades the taught fault (not only the shadow).
    ...(spec.ruleConfig ? { ruleConfig: spec.ruleConfig } : {}),
    // 4a physics opt-in (the ruleConfig pattern): only a template that AUTHORS
    // physics.wetGrip flips the live car to wet grip — rain alone never does.
    ...(spec.physics?.wetGrip ? { physics: { wetGrip: true } } : {}),
  };

  const aids = mergeAids(level, rung.aids);
  if (aids) lesson.aids = aids;

  // Final guarantee: the compiled objectives round-trip the REAL parser —
  // a compile that returns can never explode inside createLessonSession.
  for (const o of lesson.objectives) parseObjectiveParams(o);

  return lesson;
}
