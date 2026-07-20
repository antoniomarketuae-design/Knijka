/**
 * compileScenario — ScenarioSpec × level → LessonSpec (doc 76 §2: a scenario
 * COMPILES INTO the existing lesson machinery; no engine fork).
 *
 * The compiled object is a plain, valid LessonSpec: createLessonSession,
 * the rule engine, teach-pause, escalation and the wire all run it unchanged.
 * Level differences are PARAMETER DELTAS (doc 76 §7) applied here:
 *
 *   | Level | Aids (DEFAULT_LEVEL_AIDS)                       | examMode |
 *   |  L1   | shadow + ribbon + follow hints + pause-on-error |   off    |
 *   |  L2   | ribbon only, hints after idle                   |   off    |
 *   |  L3   | none                                            |   off    |
 *   |  L4   | none, exam protocol                             |   ON     |
 *   |  L5   | none + traffic/conditions/physics/staged deltas |   off    |
 *
 * TOP-DOWN IS ON EVERY RUNG, L1..L5 (founder ruling 2026-07-17; doc 76 §12
 * „Top-down mode confirmed as a first-class POV option"). topdownAllowed is a
 * POV, not an aid: it reveals no answer the driver's own mirrors do not, and a
 * reverse-park is unreadable without it. Denying G on a scenario L4 rung while
 * every one of the 18,396 exam-bank practical variants grants it unconditionally
 * (LessonScene topdownInCycle) was an INCONSISTENCY, not a principle — the
 * cockpit-lock line of doc 76 §4 governs the GRADED views (grading never reads
 * the camera), never the student's ability to look.
 *
 * Escape hatch, kept honest: mergeAids() drops falsy flags, so a template or
 * rung that means it may still opt OUT by passing aids: { topdownAllowed: false }
 * in its LevelSpec — the compiled lesson then omits the flag and LessonScene
 * drops G from the C cycle. No shipped template opts out today.
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
 *  - weather: EVERY condition compiles — dry/rain/fog/snow (the doc 76 §0
 *    weather gaps are closed: fog via the AC-03 unlock, snow via the AC-08
 *    winter-grip unlock: snow haze render + tick.snow conditions envelope;
 *    the snow-grip PHYSICS stays an explicit physics.snowGrip opt-in, authored
 *    template-wide or per rung — the wet precedent, never implied by the tag).
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

/** The §7 aid table — per-level defaults a LevelSpec may override.
 *  topdownAllowed rides on EVERY rung: a POV, not an aid (see the header). */
export const DEFAULT_LEVEL_AIDS: Record<ScenarioLevel, LessonAidsSpec> = {
  1: {
    shadowCar: true,
    pathRibbon: true,
    followHints: true,
    pauseOnError: true,
    topdownAllowed: true,
  },
  2: { pathRibbon: true, hintsAfterIdleSec: 20, topdownAllowed: true },
  3: { topdownAllowed: true },
  // L4: examMode carries the exam-protocol behavior; top-down stays — the
  // real-exam cockpit-lock governs GRADING, and every exam-bank variant grants G.
  4: { topdownAllowed: true },
  5: { topdownAllowed: true },
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
// THEO-3 — the mistake-experience opt-in (doc 64: „Направи грешката")
// ---------------------------------------------------------------------------

/**
 * Fixed instruction lead-in of a mistake-experience session; the compiled
 * descriptionBg is this + the targeted mistake's STORED titleBg (ADR-002:
 * fixed UI chrome + stored text, never generated).
 */
export const MISTAKE_EXPERIENCE_LEAD_IN_BG =
  "Направи грешката нарочно — тук нищо не се оценява. Задачата:";

/**
 * Lesson-id of a compiled mistake-experience session. DELIBERATELY foreign to
 * the `<templateId>@L<n>` rung namespace (resolve.ts regex rejects the `~m`
 * suffix): the sandbox never persists and the wire must never regrade it as a
 * real attempt — an id that ever leaks server-side resolves to nothing and is
 * refused (UNKNOWN_LESSON). Parser lives in mistakeExperience.ts (the
 * compile/resolve split precedent); round-trip pinned by tests.
 */
export function mistakeExperienceLessonId(
  templateId: string,
  level: ScenarioLevel,
  mistakeIndex: number,
): string {
  return `${templateId}@L${level}~m${mistakeIndex}`;
}

/**
 * Opt-in compile modes (the ruleConfig/signalPlan/physics precedent applied
 * to the CALL: absent/empty = bit-identical output — golden-tested).
 * `mistakeExperience` compiles the rung as the THEO-3 sandbox: same world,
 * same staged encounters, same detectors and aids — but the id moves to the
 * `~m<i>` namespace, the instruction copy tells the student to DO the wrong
 * thing, examMode is dropped (a sandbox is never an exam) and the lesson
 * carries the targeted mistake's codeRefs for the engine's one-shot
 * consequence moment (engine.ts `mistakeMoment`).
 */
export interface ScenarioCompileOptions {
  mistakeExperience?: { mistakeIndex: number };
}

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
export function compileScenario(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  opts: ScenarioCompileOptions = {},
): LessonSpec {
  assertScenarioSpec(spec);

  const rung: LevelSpec | undefined = spec.levels.find((l) => l.level === level);
  if (!rung) {
    throw new ScenarioCompileError(
      spec.id,
      level,
      `the template does not author L${level} (has: ${spec.levels.map((l) => `L${l.level}`).join(", ")})`,
    );
  }

  // Conditions: rung overrides template. EVERY weather compiles — fog closed
  // the render/grading gap first (AC-03), snow composes the same render seam
  // with the AC-08 winter story (snow haze + tick.snow conditions envelope).
  // The reduced-grip PHYSICS is deliberately NOT implied by the weather tag:
  // it stays the template's explicit physics opt-in (the wet precedent).
  const conditions = { ...(spec.conditions ?? {}), ...(rung.conditions ?? {}) };
  const environment: LessonSpec["environment"] | undefined =
    conditions.night ||
    conditions.weather === "rain" ||
    conditions.weather === "fog" ||
    conditions.weather === "snow"
      ? {
          ...(conditions.night ? { timeOfDay: "night" as const } : {}),
          ...(conditions.weather === "rain" ? { rain: true } : {}),
          ...(conditions.weather === "fog" ? { fog: true } : {}),
          ...(conditions.weather === "snow" ? { snow: true } : {}),
        }
      : undefined;

  // Physics: rung over template, PER KEY — the conditions merge above applied
  // literally, NOT a wholesale replace: an L5 may ADD crosswind without
  // clearing an inherited wetGrip, and may drop an inherited flag with an
  // explicit `false` (the falsy-drop at the propagation site then omits it —
  // the mergeAids escape-hatch pattern). The rung-level half of the 4a opt-in:
  // physics used to be template-wide only, so "L5 = rain + wet grip" would
  // have dragged L1..L4 onto wet grip too and invalidated their dry-tuned
  // ghosts — those rungs shipped render-only weather instead. Absent on both
  // spec and rung = {} = no physics key at all (bit-identical dry compile).
  const physics = { ...(spec.physics ?? {}), ...(rung.physics ?? {}) };

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
    // 4a physics opt-in (the ruleConfig pattern): only a template OR RUNG that
    // AUTHORS physics.wetGrip / physics.snowGrip / physics.crosswind flips the
    // live car to reduced grip or lateral wind — no weather tag ever does.
    ...(physics.wetGrip || physics.snowGrip || physics.crosswind
      ? {
          physics: {
            ...(physics.wetGrip ? { wetGrip: true } : {}),
            ...(physics.snowGrip ? { snowGrip: true } : {}),
            ...(physics.crosswind ? { crosswind: true } : {}),
          },
        }
      : {}),
    // Approach-relative signal pin (the ruleConfig/physics opt-in pattern):
    // only a template that AUTHORS signalPlan gets the one-shot pin — the
    // LIVE session arms it on the runtime; recorded traces are untouched.
    ...(spec.signalPlan ? { signalPlan: { ...spec.signalPlan } } : {}),
    // Session-start cluster MODE dials (doc 62 S1, the signalPlan pattern):
    // only a template that AUTHORS signalModes dials its clusters dark /
    // flashing-amber in LIVE play; recorded traces keep their own dials.
    ...(spec.signalModes ? { signalModes: { ...spec.signalModes } } : {}),
    // R3 #27 ball cue (the signalPlan opt-in pattern): only a template that
    // AUTHORS `hazard` mounts the TrafficLayer ball — the scenario director
    // flips hazardActiveRef when its dart runner triggers (ballLeadSec).
    ...(spec.hazard ? { hazard: { ...spec.hazard } } : {}),
  };

  const aids = mergeAids(level, rung.aids);
  if (aids) lesson.aids = aids;

  // THEO-3 mistake-experience delta (opt-in; absent = bit-identical). Applied
  // LAST so the sandbox inherits everything above unchanged — world, staged
  // encounters (they create the mistake's conditions), detectors, aids (the
  // lowest rung is the full-help rung by the §7 ladder — „aids are on").
  const mx = opts.mistakeExperience;
  if (mx !== undefined) {
    const idx = mx.mistakeIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= spec.mistakes.length) {
      throw new ScenarioCompileError(
        spec.id,
        level,
        `mistakeExperience.mistakeIndex ${idx} is out of range (template authors ${spec.mistakes.length} mistakes)`,
      );
    }
    const mistake = spec.mistakes[idx];
    lesson.id = mistakeExperienceLessonId(spec.id, level, idx);
    lesson.titleBg = `${spec.titleBg} · Преживей грешката`;
    // Fixed lead-in + the STORED mistake title — the instruction that tells
    // the student to DO the wrong thing (ADR-002: stored text, never free).
    lesson.descriptionBg = `${MISTAKE_EXPERIENCE_LEAD_IN_BG} ${mistake.titleBg}.`;
    // A sandbox is never an exam — drop the flag even if a template ever
    // authored its lowest rung as exam protocol.
    delete lesson.examMode;
    lesson.mistakeExperience = { mistakeIndex: idx, codes: [...mistake.codeRefs] };
  }

  // Final guarantee: the compiled objectives round-trip the REAL parser —
  // a compile that returns can never explode inside createLessonSession.
  for (const o of lesson.objectives) parseObjectiveParams(o);

  return lesson;
}
