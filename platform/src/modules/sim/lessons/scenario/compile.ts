/**
 * compileScenario — ScenarioSpec × level → LessonSpec (doc 76 §2: a scenario
 * COMPILES INTO the existing lesson machinery; no engine fork).
 *
 * The compiled object is a plain, valid LessonSpec: createLessonSession,
 * the rule engine, teach-pause, escalation and the wire all run it unchanged.
 * Level differences are PARAMETER DELTAS (doc 76 §7) applied here:
 *
 *   | Level | Aids (DEFAULT_LEVEL_AIDS)                       | exam | tol  | traffic |
 *   |  L1   | shadow + ribbon + follow hints + pause-on-error | off  | 1.5  | ×0.5    |
 *   |  L2   | ribbon only, hints after idle                   | off  | 1.25 | ×0.75   |
 *   |  L3   | none                                            | off  | 1.0  | ×1      |
 *   |  L4   | none, exam protocol                             |  ON  | 1.0  | ×1      |
 *   |  L5   | none + traffic/conditions/physics/staged deltas | off  | 1.0  | ×1.5    |
 *
 * The last two columns are the doc 86 L13 fix. They used to be blank: a rung
 * that authored nothing compiled to the SAME LessonSpec as its neighbour on
 * 146 of 155 templates, so the whole ladder was the aid table and the founder
 * read that, correctly, as „L2 L3 L4 L5 They have Nothing More". `tol` is the
 * §7 tolerance rung (widen-only on waypoints — see params.ts) and `traffic`
 * scales the template's own `ScenarioSpec.traffic` baseline, so a template
 * with no baseline still compiles bit-identically to before.
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
import { REACH_ZONE_GRACE_M, parseObjectiveParams } from "../objectives";
import { serializeObjectiveParams } from "./params";
import { assertScenarioSpec } from "./validate";
import {
  SCENARIO_LEVEL_NAMES_BG,
  type LevelSpec,
  type RubricSpec,
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

// ---------------------------------------------------------------------------
// THE LEVEL LADDER (doc 86 L13/D7 — the seam)
// ---------------------------------------------------------------------------
//
// Before this, an empty rung `{ level: n }` contributed NOTHING: measured over
// the 155 shipped templates on 2026-07-30, 146 of them compiled two rungs to a
// byte-identical LessonSpec — L1≡L2 on 146, L2≡L3 on 145, L1≡L3 on 145 — and
// only 21 of 669 rungs authored a `toleranceScale` at all. The founder's
// „L2 L3 L4 L5 They have Nothing More" was a literal description of the
// compiler's output, not an impression.
//
// The three tables below are the fix that does not require re-authoring 155
// templates: they derive a real, safe delta from `level` alone. An AUTHORED
// value always wins — the ladder speaks only where the template said nothing.
// None of them can invent content: no ladder entry stages an actor, changes
// the weather or touches physics, because the compiler cannot know whether a
// given micro-map has anywhere to put a car.

/**
 * The §7 tolerance rung. L1 1.5 / L2 1.25 is not a new convention — it is the
 * one the 21 hand-authored rungs already use (sc-park-perp-rev L1 1.5, L2
 * 1.25); the ladder simply stops making every other template opt in by hand.
 *
 * L3/L4/L5 sit at 1.0 deliberately. Tightening a WAYPOINT below the authored
 * radius is a completability hazard, not difficulty (see params.ts WIDEN-ONLY
 * and doc 86 B3/B5), and tightening a MANEUVER tolerance on 155 templates
 * blind would silently re-grade every recorded shadow. A template that wants
 * a tighter L4 park authors `toleranceScale` on that rung and re-records.
 */
export const DEFAULT_LEVEL_TOLERANCE: Record<ScenarioLevel, number> = {
  1: 1.5,
  2: 1.25,
  3: 1,
  4: 1,
  5: 1,
};

/**
 * Ambient-traffic density per rung, as a MULTIPLIER on the template's own
 * `ScenarioSpec.traffic` baseline — never an absolute count. Zero baseline
 * stays zero at every rung, so every template shipped today compiles
 * bit-identically; a template that authors a baseline gets the whole ladder
 * for free (quieter under the aids, busiest at L5 — «Усложнени» means the
 * street is fuller, which is the founder's deepening ask in doc 86 L12).
 */
export const DEFAULT_LEVEL_TRAFFIC_SCALE: Record<ScenarioLevel, number> = {
  1: 0.5,
  2: 0.75,
  3: 1,
  4: 1,
  5: 1.5,
};

/**
 * Par time per rung, as a multiplier on the rubric's authored `parTimeSec`
 * (which is INFORMATIONAL ONLY — doc 76 §6 — so this changes a line of Bulgarian
 * on the end screen, never a star). The aided rungs stop and read; the exam
 * rung is held to the authored figure; L5 carries the complications.
 */
export const DEFAULT_LEVEL_PAR_TIME_SCALE: Record<ScenarioLevel, number> = {
  1: 1.35,
  2: 1.2,
  3: 1,
  4: 1,
  5: 1.15,
};

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
 * Per-objective ceiling on how far a forgiving rung may widen a waypoint
 * radius, derived from the objective CHAIN.
 *
 * Objectives are strictly sequential, so a zone that already contains the car
 * the moment the previous gate completes is a graded gate the student never
 * drove. Splitting the free gap between the two neighbours makes that
 * impossible by construction: any pair of consecutive `reachZone`s that is
 * disjoint at L3 stays disjoint at L1 (asserted per scenario × rung in
 * `__tests__/level-seam.test.ts`).
 *
 * Only `reachZone` neighbours constrain, and only `reachZone` radii are
 * laddered at all. A `passSignal` completes on a stopLineCrossed EVENT near
 * the node, never on presence, so its (often 45 m) radius can neither swallow
 * a neighbour nor benefit from widening — and letting it zero the budget would
 * kill the widening on exactly the junction approaches that need it most.
 */
function radiusWidenBudget(spec: ScenarioSpec): number[] {
  const n = spec.success.length;
  const budget = new Array<number>(n).fill(REACH_ZONE_GRACE_M);
  const zones = spec.success.map((o) =>
    o.params.kind === "reachZone"
      ? { x: o.params.x, y: o.params.y, r: o.params.radiusM }
      : null,
  );
  for (let i = 0; i + 1 < n; i += 1) {
    const a = zones[i];
    const b = zones[i + 1];
    if (!a || !b) continue;
    const half = Math.max(0, (Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r) / 2);
    budget[i] = Math.min(budget[i], half);
    budget[i + 1] = Math.min(budget[i + 1], half);
  }
  return budget;
}

/**
 * The rubric a rung actually scores against: `LevelSpec.rubric` merged PER KEY
 * over `ScenarioSpec.rubric`, with the par-time ladder applied where the rung
 * did not state its own (doc 86 D7).
 *
 * **Call this instead of reading `spec.rubric`.** A consumer that reads the
 * template's rubric directly silently discards every per-rung override, which
 * is the failure mode D7 exists to end.
 *
 * Throws the same ScenarioCompileError compileScenario throws for a level the
 * template does not author, so the two stay interchangeable at a call site
 * that already has the level in hand.
 */
export function resolveScenarioRubric(
  spec: ScenarioSpec,
  level: ScenarioLevel,
): RubricSpec | undefined {
  const rung = spec.levels.find((l) => l.level === level);
  if (!rung) {
    throw new ScenarioCompileError(
      spec.id,
      level,
      `the template does not author L${level} (has: ${spec.levels.map((l) => `L${l.level}`).join(", ")})`,
    );
  }
  const base = spec.rubric;
  const over = rung.rubric;
  if (!base && !over) return undefined;

  const merged: RubricSpec = {};
  const placement = over?.placement ?? base?.placement;
  if (placement) merged.placement = { ...placement };
  const economy = over?.economy ?? base?.economy;
  if (economy) merged.economy = { ...economy };
  const observation = over?.observation ?? base?.observation;
  if (observation) merged.observation = { moments: observation.moments.map((m) => ({ ...m })) };

  if (over?.parTimeSec !== undefined) {
    // The rung stated its own par — the ladder does not second-guess it.
    merged.parTimeSec = over.parTimeSec;
  } else if (base?.parTimeSec !== undefined) {
    merged.parTimeSec = Math.round(base.parTimeSec * DEFAULT_LEVEL_PAR_TIME_SCALE[level]);
  }
  return merged;
}

/** A rung rubric that points at an objective the template does not have would
 *  score a silent «не се измерва» forever; make it a loud compile error. */
function assertRubricObjectives(spec: ScenarioSpec, level: ScenarioLevel, rubric?: RubricSpec): void {
  if (!rubric) return;
  const ids = new Set(spec.success.map((o) => o.id));
  for (const [field, ref] of [
    ["placement", rubric.placement?.objectiveId],
    ["economy", rubric.economy?.objectiveId],
  ] as const) {
    if (ref !== undefined && !ids.has(ref)) {
      throw new ScenarioCompileError(
        spec.id,
        level,
        `rubric.${field}.objectiveId "${ref}" is not one of this template's success objectives (${[...ids].join(", ")})`,
      );
    }
  }
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

  // The rung's own dial wins; a SILENT rung now falls back to the §7 ladder
  // instead of 1.0 (doc 86 L13 — that 1.0 is why L1, L2 and L3 compiled to the
  // same lesson on 145 of 155 templates). Waypoint gates only ever widen from
  // it; maneuver tolerances scale both ways (params.ts).
  const toleranceScale = rung.toleranceScale ?? DEFAULT_LEVEL_TOLERANCE[level];
  const widenBudget = radiusWidenBudget(spec);
  const objectives: LessonObjective[] = spec.success.map((o, i) => {
    const { kind, params } = serializeObjectiveParams(o.params, toleranceScale, widenBudget[i]);
    return { id: o.id, titleBg: o.titleBg, kind, params };
  });

  // Rung rubric: resolved here purely to REJECT a bad objective reference at
  // compile time. The score itself is read through resolveScenarioRubric by
  // the end-screen/wire — the rubric is a scenario-layer concept and does not
  // belong on LessonSpec, which the exam bank and curriculum share.
  assertRubricObjectives(spec, level, resolveScenarioRubric(spec, level));

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

  // Ambient traffic: the rung's explicit count wins; otherwise the template's
  // baseline scaled by the level ladder; otherwise zero — a scenario micro-map
  // is not a boulevard, and the ladder never conjures cars onto a template
  // that authored no baseline (every template shipped today: bit-identical).
  const trafficScale = DEFAULT_LEVEL_TRAFFIC_SCALE[level];
  const laddered = (baseline: number | undefined, fallback: number) =>
    baseline === undefined ? fallback : Math.max(0, Math.round(baseline * trafficScale));
  const traffic = {
    vehicleCount:
      rung.traffic?.vehicleCount ??
      laddered(spec.traffic?.vehicleCount, SCENARIO_DEFAULT_TRAFFIC.vehicleCount),
    pedestrianCount:
      rung.traffic?.pedestrianCount ??
      laddered(spec.traffic?.pedestrianCount, SCENARIO_DEFAULT_TRAFFIC.pedestrianCount),
    anchorRadiusM:
      rung.traffic?.anchorRadiusM ??
      spec.traffic?.anchorRadiusM ??
      SCENARIO_DEFAULT_TRAFFIC.anchorRadiusM,
  };

  // Rule config: rung over template, PER KEY — the conditions/physics merge
  // applied to grading itself, so „L3 grades tighter than L1" is expressible
  // (doc 86 D7). Absent on both = no key on the lesson, bit-identical.
  const ruleConfig = { ...(spec.ruleConfig ?? {}), ...(rung.ruleConfig ?? {}) };
  const hasRuleConfig = Object.keys(ruleConfig).length > 0;

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
    // Compiled COPY, never the template's own object (specs are shared data —
    // the signalPlan precedent), because a rung may now override keys in it.
    ...(hasRuleConfig ? { ruleConfig } : {}),
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
