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
 * WHAT A RUNG *ADDS*, AND HOW THE STUDENT HEARS ABOUT IT (2026-08-02; his
 * review line 214: „we need major reworks on all 150 L5-L4-L3-L2s CURRENTLY
 * I'M REVIEWING L1s"). The table above can take aids AWAY; measured on the 167
 * shipped templates it could add almost nothing — 92 authored no L5 at all,
 * `spec.traffic` existed on ONE, and `tol` is a flat 1.0 from L3 up, so a
 * silent L4 differed from L3 by a single boolean and a silent L5 did not
 * exist. Two things changed here:
 *
 *  · `LevelSpec.complication` (types.ts) — the delta AND the instructor's
 *    explanation of it, authored together so neither ships alone. The kit of
 *    reusable mechanisms lives in `complications.ts`.
 *  · `resolveScenarioComplication` (below) — where a rung says nothing, the
 *    compiler explains the difference IT produced, from stored copy selected
 *    by the measured delta (`rungDelta`). Not generation: ADR-002 fixed text,
 *    chosen by evidence.
 *
 * AND WHERE THE RUNG PRODUCED NO DIFFERENCE AT ALL (2026-08-16, register B2 /
 * B19 — *„L2 L3 L4 L5 THEY HAVE NOTHING MORE"*, *„same question 6 just this
 * time L5 and it has no difference at all"*). The two bullets above can only
 * EXPLAIN a delta; they cannot make one. Re-measuring every adjacent rung pair
 * of all 167 templates found three L5 rungs whose entire difference from their
 * own L4 was `toleranceScale` — a number the student cannot perceive, which is
 * exactly the defect he is naming. `l5LadderFloorApplies` closes that: an L5
 * that adds nothing the compiler can measure is driven at NIGHT
 * (`L5_LADDER_FLOOR_CONDITIONS`, complications.ts, which explains the choice).
 * The floor never overrules an author — it fires only when the measured delta
 * is empty — so it changes three rungs today and makes a fourth impossible.
 * The full census, and the per-family verdict on the rungs the ladder CANNOT
 * fill, live in `lessons/difficulty.ts`.
 *
 * Either way the sentence is compiled into `briefingBg` as step 1 — the field
 * `LessonPlayShell` renders and blocks the session on. 115 rungs used to
 * change the road and tell nobody; that is a difficulty TAX, and THEO-4
 * forbids the unexplained verdict in every one of its forms.
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
import { L5_LADDER_FLOOR_CONDITIONS } from "./complications";
import { serializeObjectiveParams } from "./params";
import { assertScenarioSpec } from "./validate";
import {
  SCENARIO_LEVEL_NAMES_BG,
  type LevelComplication,
  type LevelSpec,
  type RubricSpec,
  type RungAddition,
  type ScenarioFamily,
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
 * THE FAMILY AMBIENT BASELINE (doc 87 FR-27 / FR-30 / his items 8, 15, 17, 18,
 * 40, 42) — the street a lesson about OTHER ROAD USERS is set on.
 *
 * What he wrote, playing catalog position 8: *„the traffic car is quite quick
 * and its only 1 so by the time I reach the crossroad it already has passed —
 * should there be at least 1 more that we have to wait"*. And 15, 17 and 18 are
 * the same sentence three more times. The fix wave that followed staged BETTER
 * conflict cars; it never questioned the street they drive on. That street was
 * `SCENARIO_DEFAULT_TRAFFIC.vehicleCount: 0`, and the number is not a metaphor:
 *
 *   MEASURED 2026-08-02, 26 junction/signals/roundabout templates, a 25 m disc
 *   at the junction the drive is about, 60 s: **0 vehicle passages. All 26.**
 *
 * A yielding drill whose only other road user is the one scripted car is a
 * drill you can pass by arriving late. So the families that TEACH reading other
 * traffic now carry a baseline, and — being a template-level baseline, not a
 * rung count — the §7 ladder scales it: L1 gets half (a beginner is not made to
 * read a boulevard), L5 gets 1.5× (FR-13: a higher rung must ADD, not just
 * remove aids).
 *
 * ── RE-MEASURED 2026-08-03, WITH THE STUDENT STANDING WHERE THE DRILL GRADES ──
 *
 * The first measurement was taken with *the player out of the way*, and that is
 * why it certified a street the founder then photographed empty (B23, B28, B36,
 * B38: „the priority road is empty across the whole visible span while the
 * demonstration bubble says «Кола отдясно — тя има предимство»"). The taught
 * behaviour on a give-way drill is TO STOP AT THE LINE — so the honest probe
 * parks the player 30 m short of the junction, exactly where the objective
 * accepts, and asks two questions a picture can answer:
 *
 *   cone  = % of the minute with a MOVING car in the forward 100° cone ≤ 90 m
 *           — "is there anything in the windscreen"
 *   cross = % of the minute with a MOVING car on a CROSSING arm ≤ 60 m of the
 *           node — "is the priority road alive"
 *
 * Nine districts (sx-v1, tj-rhr/stop/emerge/occluded-v1, jx-equal-v1,
 * jxg-giveway-v1, sig-wave-v1, pe-jay-v1), 3 seeds, 60 s each:
 *
 *   n=2 (what L1 compiled to)  cone 10–32%   cross  0–32%   1.0–3.0 pass/min
 *   n=4 (what L3 compiled to)  cone 30–57%   cross 33–60%   3.3–6.3 pass/min
 *   n=5                        cone 45–70%   cross 37–69%   4.0–9.0 pass/min
 *   n=6                        cone 47–77%   cross 34–86%   3.7–11  pass/min
 *   n=7                        REGRESSES on four districts (tj-stop 59→43,
 *                              tj-emerge 51→31, sig-wave cross 54→49) with
 *                              agent-time stopped rising to 46–52% — the ring
 *                              of the junction starts queueing on itself.
 *
 * So **n=2 was the dead boulevard he filmed** — on a give-way lesson the
 * crossing arm was empty for two thirds to all of the minute — and **6 is the
 * knee**, not 4. Hence the three constants below rather than one:
 *
 *   BASELINE 5 — the L3/L4 street.
 *   FLOOR 4    — the count below which the drill's own SUBJECT disappears.
 *                A junction lesson quieted to 2 cars is not an easier junction
 *                lesson, it is a different lesson with nothing to yield to, and
 *                „quieter at L1" cannot be allowed to mean „delete the thing
 *                being taught". The ladder still runs — it just runs above a
 *                floor that keeps the lesson a lesson.
 *   CEILING 6  — the measured knee. Without it L5's ×1.5 lands on 8, which is
 *                past the jam.
 *
 * The rungs therefore compile to 4 / 4 / 5 / 5 / 6 for these two families.
 *
 * MEASURED AND REJECTED — `anchorRadiusM` as the dial. B23/B28 name it as the
 * fix owner („ambient vehicles spawn on a 400 m district anchor"). It was swept
 * at 400 / 220 / 150 m on all nine districts and, on seven of them, produced
 * BYTE-IDENTICAL numbers: these scenario micro-maps are smaller than the
 * smallest radius, so `buildRoutes`'s `preferNear` filter never bites (it falls
 * back to `byDist.slice(0, …)` when too few lanes are in radius). The radius is
 * an inert knob HERE; density is the whole story. Said out loud so the next
 * wave does not spend itself turning it again.
 *
 * WHY THE ROUNDABOUT FAMILY IS DELIBERATELY ZERO. It was measured too, and it
 * fails: on `rb-mini-v1` **two** ambient cars already spend 68–75% of their
 * time stopped at 5–7 km/h — the ring gridlocks rather than circulates. Giving
 * that family traffic would replace an empty roundabout with a jammed one and
 * make B15 („the roundabout convicts you for a car that never comes") worse,
 * not better. It stays 0 until the reservation logic on a mini ring is fixed;
 * a number nobody measured is exactly how the dead boulevard shipped.
 *
 * `pedestrianCount` stays 0 everywhere: the pedestrian families author their
 * own walkers, and ambient pedestrians on a junction drill would arm crossing
 * duties the copy never mentions.
 *
 * A template's own `traffic` still wins outright, and a rung's wins over that.
 */
export const SCENARIO_FAMILY_TRAFFIC_BASELINE: Partial<Record<ScenarioFamily, number>> = {
  // The yielding drills — „more than one car to wait for".
  junction: 5,
  // The signals family: five lessons on one crossroads, all photographed dead
  // (B38/B40). A signal drill with no traffic teaches the lamp, not the road.
  signals: 5,
};

/**
 * The floor and the ceiling the §7 ladder may not cross when the count came
 * from the FAMILY baseline above. Both are measurements, both are documented in
 * that table: below FLOOR the crossing arm is empty for most of the minute and
 * the drill has nothing to yield to; above CEILING the junction queues on
 * itself and the street is a jam instead of a road.
 *
 * They apply ONLY to the family baseline. A template that authors its own
 * `traffic.vehicleCount`, and a rung that authors one, are the author's final
 * word and are never clamped — the compiler does not overrule a number a human
 * put there on purpose.
 */
export const SCENARIO_FAMILY_TRAFFIC_FLOOR = 4;
export const SCENARIO_FAMILY_TRAFFIC_CEILING = 6;

/**
 * WHY `following` IS NOT IN THE TABLE ABOVE — measured, and it failed.
 *
 * His items 40 („nothing much happens untill the very end") and 42 („we need
 * to create interactive map… the truck to DO things") are following drills, so
 * a street was the obvious answer there too. It was tried at 3 ambient cars on
 * `ln-v1` and measured against the SHIPPED лепка, and the result was
 * unambiguous:
 *
 *   ambient 0 → the tailgater glues at 3.1–3.4 s and holds 9 m for 12 s.
 *   ambient 3 → it NEVER glues, at 30, 40 or 50 km/h. At 40 km/h the gap runs
 *               from 22 m to 456 m over the minute.
 *
 * The reason is structural, not tuneable: `fo-follow-v1` / `ln-v1` are two-lane
 * straights, ambient agents land in the player's OWN lane, and a car that slots
 * in between the student and a rear actor is not noise — it is the end of that
 * encounter. Every rear- and lead-paced drill in the family (лепка, cut-in,
 * brake-check, the queue) depends on nothing standing in that gap.
 *
 * So the following family keeps its quiet street, and items 40/42 stay what
 * they actually are: authoring work on the actors themselves
 * (`templates-following.ts` — FR-51 and FR-53b), not a density dial. Trading a
 * boring lesson for a broken one is not progress, and shipping the trade
 * without measuring it is how the dead boulevard got here.
 */

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
 * THE ONE COMPLICATION THE COMPILER MAY SPEAK FOR ITSELF.
 *
 * Every other rung addition is authored, because the compiler cannot see the
 * map. This one it can: `examMode` is derived from the level here, it IS a
 * real compiled difference from the rung below, and until now it was the ONLY
 * thing separating a silent L4 from a silent L3 — 167 templates changed one
 * boolean and told the student nothing about it.
 *
 * It is applied from the COMPILED examMode, never from `level === 4`, so a
 * template that turns its L4 exam flag off does not get an exam briefing. That
 * is the same discipline the `adds` gate enforces on authored rungs: the copy
 * follows the compiled delta, not the other way round.
 */
export const EXAM_PROTOCOL_COMPLICATION: LevelComplication = {
  adds: ["protocol"],
  titleBg: "Изпитни условия",
  coachBg:
    "Оттук нататък караш както на изпит: без кола-сянка, без линия по пътя и без подсказки — оценява се това, което направиш сам. Изпитващият гледа не само дали стигаш, а КАК: плавно, с оглед в огледалата преди всяка маневра, с мигач подаден навреме и на скорост, съобразена с обстановката. Направи всичко както досега, само по-подредено — бързането е това, което къса изпити.",
  lawRef: "Наредба № 38",
};

/**
 * The rung's complication line, as it lands in `LessonSpec.briefingBg`.
 *
 * ONE STRING, and it is the first thing the student reads: the overlay queue
 * puts `briefingBg[0].textBg` on the line and holds the session until „Разбрах"
 * (LessonPlayShell §4c). A complication announced anywhere else is a
 * complication announced nowhere — the `instructionsBg` lesson.
 */
export function complicationBriefingText(
  level: ScenarioLevel,
  c: LevelComplication,
): string {
  const law = c.lawRef ? ` (${c.lawRef})` : "";
  return `Ниво ${level} — ${c.titleBg}: ${c.coachBg}${law}`;
}

/**
 * LessonSpec.order of every compiled scenario: a SELECT-GRID SORT KEY ONLY,
 * far outside the contiguous 0..n curriculum chain (the A13/полигон pattern —
 * linear progression never sees these entries).
 */
export const SCENARIO_LESSON_ORDER = 1000;

/**
 * THE NUMBER THE STUDENT IS GRADED ON, KEPT SAYABLE — the compiled key that
 * carries the TEMPLATE'S OWN `maxSpeedKmh` alongside the laddered gate.
 *
 * THE DEFECT IT CLOSES, measured over every compiled rung of every template
 * (`__tests__/advisor-authored-cap.test.ts` pins every figure below):
 *
 *   953  reachZone cards compile with a speed cap
 *   644  of them above the halt band (`REACH_ZONE_HALT_CAP_KMH` = 8)
 *   499  of those 644 SAID NO NUMBER AT ALL — and were graded on one anyway
 *   169  of the 499 had no number on ANY surface: not the objective title,
 *        not one step of the briefing, not the street's posted limit
 *   116  more were WORSE than silent: the strictest number any surface showed
 *        was ABOVE the gate, so the student who obeyed the only figure he was
 *        given failed a threshold nobody had told him about
 *
 * The exhibit is the reference lesson. `sc-zebra-approach@L1 / sc-za-approach`
 * reads «Приближи пътеката с готовност за спиране», names no speed, and grades
 * at 45. `sc-crossing-child-ball@L1` is the sharp end of the 116: its briefing
 * says «под 40 км/ч» and its gate is 37. That is the founder's own complaint
 * one street over — he signalled a roundabout exit correctly and was failed —
 * and THEO-4 requirement zero calls a grade against an unstated threshold what
 * it is: a bare verdict from a product whose whole job is explaining decisions.
 *
 * WHY A NEW KEY AND NOT A SMARTER ADVISOR. `serializeObjectiveParams` folds the
 * rung's grace INTO `maxSpeedKmh` (`params.ts widenSpeedCap`), and the grace is
 * not recoverable from the result: `toleranceScale` is a rung concept that never
 * lands on the LessonSpec. So a card holding only the compiled number had two
 * options and both were wrong — say it (sweep161's photographed «дръж под 54.5
 * км/ч», the tolerance signing its own name) or say nothing (these 499). With
 * the author's figure in hand there is a third, and it is the true one.
 *
 * WHAT IT MAY NEVER DO IS MOVE A GATE. `parseObjectiveParams` (objectives.ts)
 * rebuilds `WitnessedReachZoneParams` from a whitelist and silently drops every
 * key it does not name, so this value is unreachable from grading BY
 * CONSTRUCTION — it is a coaching channel, exactly like `LessonSpec
 * .postedLimitKmh` one level out. Measured on the same sweep: for all 644
 * above-halt cards the authored cap is present, INTEGRAL (no «54.5»), and
 * ≤ the compiled gate, so the sentence it produces can never coach a student
 * into failing the task he is being coached through.
 *
 * Read by `advisor.ts spokenCapKmh`. That file imports this symbol from here
 * rather than through `scenario/index.ts` — the barrel line belongs there and
 * is named as routing debt in this wave's report — but it already takes a
 * value import off the same barrel (`parseScenarioLessonId`), so the deep
 * specifier adds no edge to the module graph that was not already paid for.
 */
export const AUTHORED_MAX_SPEED_PARAM_KEY = "authoredMaxSpeedKmh";

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

/** The exam flag a rung compiles to, without compiling it (the ladder default
 *  is `level === 4`; a rung may turn it on earlier or off at L4). */
function rungExamMode(rung: LevelSpec): boolean {
  return rung.examMode ?? rung.level === 4;
}

// ---------------------------------------------------------------------------
// THE RUNG DELTA — what the compiler can see one rung add over the one below
// ---------------------------------------------------------------------------
//
// These four resolvers are the single truth for „what does this rung actually
// compile to", shared by compileScenario (which builds the lesson) and
// rungDelta (which explains it). They were pulled out of compileScenario for
// exactly that reason: an explanation derived from a SECOND implementation of
// the merge rules would drift, and a difficulty ladder that describes itself
// incorrectly is worse than one that says nothing.

function rungConditions(spec: ScenarioSpec, rung: LevelSpec) {
  return { ...(spec.conditions ?? {}), ...(rung.conditions ?? {}) };
}

function rungPhysics(spec: ScenarioSpec, rung: LevelSpec): Record<string, boolean> {
  const merged = { ...(spec.physics ?? {}), ...(rung.physics ?? {}) };
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(merged)) if (v) out[k] = true;
  return out;
}

/** The §7 traffic precedence + ladder, in one place (see the compileScenario
 *  block that consumes it for the full reasoning). */
function rungTraffic(spec: ScenarioSpec, rung: LevelSpec) {
  const trafficScale = DEFAULT_LEVEL_TRAFFIC_SCALE[rung.level];
  const laddered = (baseline: number | undefined, fallback: number) =>
    baseline === undefined ? fallback : Math.max(0, Math.round(baseline * trafficScale));
  const authoredVehicles = spec.traffic?.vehicleCount;
  const familyVehicles = SCENARIO_FAMILY_TRAFFIC_BASELINE[spec.family];
  // An AUTHORED count ladders freely; a FAMILY baseline ladders between the
  // measured floor and the measured ceiling (see the baseline's doc block).
  const familyLaddered =
    familyVehicles === undefined
      ? SCENARIO_DEFAULT_TRAFFIC.vehicleCount
      : Math.min(
          SCENARIO_FAMILY_TRAFFIC_CEILING,
          Math.max(
            SCENARIO_FAMILY_TRAFFIC_FLOOR,
            Math.round(familyVehicles * trafficScale),
          ),
        );
  return {
    vehicleCount:
      rung.traffic?.vehicleCount ??
      (authoredVehicles === undefined
        ? familyLaddered
        : laddered(authoredVehicles, SCENARIO_DEFAULT_TRAFFIC.vehicleCount)),
    pedestrianCount:
      rung.traffic?.pedestrianCount ??
      laddered(spec.traffic?.pedestrianCount, SCENARIO_DEFAULT_TRAFFIC.pedestrianCount),
    anchorRadiusM:
      rung.traffic?.anchorRadiusM ??
      spec.traffic?.anchorRadiusM ??
      SCENARIO_DEFAULT_TRAFFIC.anchorRadiusM,
  };
}

function rungStagedKinds(spec: ScenarioSpec, rung: LevelSpec): string[] {
  return [...(spec.staged ?? []), ...(rung.stagedAdd ?? [])].map((s) => s.kind);
}

/** Everything the explanation may draw on — measured, never claimed. */
export interface RungDelta {
  adds: Set<RungAddition>;
  /** Environment keys this rung sets that the rung below did not. */
  weather: Set<"night" | "rain" | "fog" | "snow">;
  /** Physics flags this rung sets that the rung below did not. */
  grip: Set<string>;
  /** StagedEventSpec kinds this rung stages beyond the rung below. */
  stagedKinds: string[];
  vehicleCountFrom: number;
  vehicleCountTo: number;
  /** True when the traffic rise came from the §7 ladder, not an authored count. */
  trafficLaddered: boolean;
}

/**
 * Compare the rung at `idx` with the next LOWER authored rung, reading ONLY
 * what the template and the rung AUTHOR.
 *
 * The „authored" in the name is load-bearing: `l5LadderFloorApplies` below asks
 * this function whether a rung added anything, and answers by adding something
 * itself. Were the floor visible here the question would answer itself — every
 * silent L5 would report a night it only has because it reported nothing. So
 * the core never consults the ladder, and `rungDelta` (which does) is the only
 * thing the rest of the compiler calls.
 */
function rungDeltaAuthored(spec: ScenarioSpec, idx: number): RungDelta {
  const hi = spec.levels[idx];
  const lo = spec.levels[idx - 1];
  const d: RungDelta = {
    adds: new Set<RungAddition>(),
    weather: new Set(),
    grip: new Set(),
    stagedKinds: [],
    vehicleCountFrom: 0,
    vehicleCountTo: 0,
    trafficLaddered: hi.traffic?.vehicleCount === undefined,
  };

  const cHi = rungConditions(spec, hi);
  const cLo = rungConditions(spec, lo);
  if (cHi.night && !cLo.night) d.weather.add("night");
  for (const w of ["rain", "fog", "snow"] as const) {
    if (cHi.weather === w && cLo.weather !== w) d.weather.add(w);
  }
  if (d.weather.size > 0) d.adds.add("weather");

  const pHi = rungPhysics(spec, hi);
  const pLo = rungPhysics(spec, lo);
  for (const k of Object.keys(pHi)) if (!pLo[k]) d.grip.add(k);
  if (d.grip.size > 0) d.adds.add("grip");

  const tHi = rungTraffic(spec, hi);
  const tLo = rungTraffic(spec, lo);
  d.vehicleCountFrom = tLo.vehicleCount;
  d.vehicleCountTo = tHi.vehicleCount;
  if (tHi.vehicleCount > tLo.vehicleCount || tHi.pedestrianCount > tLo.pedestrianCount) {
    d.adds.add("traffic");
  }

  const sHi = rungStagedKinds(spec, hi);
  const sLo = rungStagedKinds(spec, lo);
  if (sHi.length > sLo.length) {
    d.adds.add("actor");
    const seen = [...sLo];
    for (const k of sHi) {
      const at = seen.indexOf(k);
      if (at >= 0) seen.splice(at, 1);
      else d.stagedKinds.push(k);
    }
  }

  const rcHi = JSON.stringify({ ...(spec.ruleConfig ?? {}), ...(hi.ruleConfig ?? {}) });
  const rcLo = JSON.stringify({ ...(spec.ruleConfig ?? {}), ...(lo.ruleConfig ?? {}) });
  if (rcHi !== rcLo) d.adds.add("rules");

  if (
    (rungExamMode(hi) && !rungExamMode(lo)) ||
    ((hi.vehicleStart ?? spec.start.vehicleStart ?? "ready") === "cold" &&
      (lo.vehicleStart ?? spec.start.vehicleStart ?? "ready") !== "cold")
  ) {
    d.adds.add("protocol");
  }

  const rHi = resolveScenarioRubric(spec, hi.level);
  const rLo = resolveScenarioRubric(spec, lo.level);
  const added =
    (rHi?.placement && !rLo?.placement) ||
    (rHi?.economy && !rLo?.economy) ||
    (rHi?.observation && !rLo?.observation);
  const tightened =
    rHi?.economy !== undefined &&
    rLo?.economy !== undefined &&
    (rHi.economy.attemptsFor3Stars < rLo.economy.attemptsFor3Stars ||
      rHi.economy.attemptsFor2Stars < rLo.economy.attemptsFor2Stars);
  if (added || tightened) d.adds.add("rubric");

  return d;
}

/**
 * THE L5 FLOOR — „an L5 that adds nothing is driven at night" (register B2/B19,
 * 2026-08-16).
 *
 * THE MEASUREMENT THAT FORCED IT. Every adjacent rung pair of all 167 shipped
 * templates compiled and diffed (the census lives in `lessons/difficulty.ts`):
 * L4 → L5 changed the WORLD on 142 rungs, changed NOTHING but a tolerance
 * number on 3 — `sc-park-parallel`, `sc-maneuver-3point` (both
 * `toleranceScale: 0.8` beside a rubric identical to their own L4's) and
 * `sc-rx-barrier-drop` (the bare `{ level: 5 }` that level-seam.test.ts has
 * carried on its S4 allowlist as „a dead L5") — and did not exist at all on 22
 * templates. Those three ARE his sentence: *„same question 6 just this time L5
 * and it has no difference at all"*.
 *
 * THE RULE, and it is deliberately the narrowest one that closes the hole:
 *  · L5 only. Night at «Частична помощ» would be a difficulty the rung's own
 *    name contradicts; «Усложнени» is the rung whose job is to add.
 *  · Only when the MEASURED delta over the rung below is empty. One authored
 *    car, one degree of weather, one staged actor and the ladder stays silent —
 *    the compiler never overrules an author, it only refuses to ship a rung
 *    that is the rung below plus a number.
 *  · Only when the drill is not already at night, so the floor can never
 *    „add" something the template has been doing since L1.
 *  · Only where there IS a rung below (idx > 0): the lowest authored rung has
 *    nothing to be harder than, and the whole complication contract rests on
 *    that (see resolveScenarioComplication).
 *
 * WHY NIGHT AND NOT ANYTHING ELSE is argued at `L5_LADDER_FLOOR_CONDITIONS`
 * (complications.ts) — in one line, it is the only mechanism in the kit that
 * needs nothing the compiler cannot see, and it touches no physics, so no
 * dry-tuned ghost is invalidated.
 *
 * WHAT THIS DOES NOT FIX, said out loud rather than counted as won: twelve
 * junction/signals L5 rungs whose entire addition is the family ladder's
 * 5 → 6 ambient car. That rise sits inside the noise of the measurement that
 * set the ceiling (n=5 → 4.0–9.0 passes/min, n=6 → 3.7–11 — the floor of the
 * busier street is BELOW the quieter one on some districts), so it is very
 * probably a rung the student cannot perceive either. They are named, and
 * capped, in `lessons/difficulty.ts` rather than silently nightfallen: giving
 * twelve give-way drills a night sky is a change nobody has driven, and a
 * junction whose ambient cars may not render headlamps is exactly the kind of
 * „harder to FINISH" this ladder is forbidden to produce.
 */
export function l5LadderFloorApplies(spec: ScenarioSpec, level: ScenarioLevel): boolean {
  if (level !== 5) return false;
  const idx = spec.levels.findIndex((l) => l.level === 5);
  if (idx <= 0) return false;
  if (rungConditions(spec, spec.levels[idx]).night) return false;
  return rungDeltaAuthored(spec, idx).adds.size === 0;
}

/** The conditions a rung actually compiles under: what it authors, plus the L5
 *  floor where the rung authored a difference the student could not see. */
function effectiveConditions(spec: ScenarioSpec, rung: LevelSpec) {
  const authored = rungConditions(spec, rung);
  return l5LadderFloorApplies(spec, rung.level)
    ? { ...authored, ...L5_LADDER_FLOOR_CONDITIONS }
    : authored;
}

/**
 * The delta the rest of the compiler reads: the authored one, plus the L5 floor
 * where it fires. The floor is folded in HERE and not in the core so the
 * night the ladder adds is explained by the same „По тъмно" copy an authored
 * night gets — the student is never told less because the sentence came from
 * the ladder rather than the template.
 */
function rungDelta(spec: ScenarioSpec, idx: number): RungDelta {
  const d = rungDeltaAuthored(spec, idx);
  if (l5LadderFloorApplies(spec, spec.levels[idx].level)) {
    d.weather.add("night");
    d.adds.add("weather");
  }
  return d;
}

// ---------------------------------------------------------------------------
// THE LADDER'S OWN VOICE — stored copy, selected BY the measured delta
// ---------------------------------------------------------------------------
//
// Measured 2026-08-02, before this: **115 rungs across 84 templates compiled a
// real complication — rain, wet grip, a staged actor, a fuller street — and
// told the student nothing about it**, because the only place a rung could
// speak was `instructionsBg`, which is template-wide. A rung the ladder makes
// harder and never explains is a difficulty TAX; doc 64's THEO-4 forbids the
// bare verdict, and a difficulty with no reason is the bare verdict's twin.
//
// So the compiler explains what the compiler can SEE. This is not generation
// (ADR-002): every sentence below is stored, reviewed Bulgarian, and the delta
// SELECTS it — the compiler never writes a word, it picks the one that matches
// the difference it just produced. A template that wants its own words puts
// them on `LevelSpec.complication`, which always wins.
//
// The alternative — leaving the ladder mute and asking 84 templates to write
// their own line — was tried by the field this comment is about. It produced
// zero lines in fifteen waves.

/**
 * One mechanism, in two lengths. The rung's line LEADS with the mechanism that
 * changes the driving most (`coachBg`, the full instructor sentence) and adds
 * any second one as a short tail (`tailBg`) — because the briefing's first step
 * is also the line the overlay puts on the glass, and two paragraphs there is a
 * wall, not a briefing. Both halves are stored text (ADR-002); the measured
 * delta only chooses between them.
 */
interface LadderCopy {
  titleBg: string;
  coachBg: string;
  tailBg: string;
  lawRef?: string;
}

/** Named phrase per staged-actor kind — so „a second actor" can say WHICH. */
const STAGED_KIND_BG: Readonly<Record<string, string>> = {
  pedestrianDartOut: "пешеходец, който стъпва на пътеката в последния момент",
  priorityFromRight: "кола отдясно, която има предимство",
  brakingLeadCar: "колата отпред, която спира рязко",
  cyclistRightHook: "велосипедист отдясно, който върви право напред",
  roundaboutEntry: "кола, която вече обикаля в кръговото",
  amberDilemma: "жълта светлина точно в неудобния момент",
  oncomingLeftTurn: "насрещна кола, докато завиваш наляво",
  narrowMeeting: "насрещна кола в стеснение, където двамата не се събирате",
  emergencyApproach: "автомобил със специален режим отзад",
  policeStop: "полицейска проверка",
  trafficController: "регулировчик, чиито жестове отменят светофара",
  cutInLeadCar: "кола, която се вклинва пред теб",
  rearTailgater: "залепен отзад шофьор, който те притиска",
  oncomingStream: "плътен насрещен поток",
  trainPass: "влак, който пресича платното",
  telltaleStimulus: "предупредителна лампа на таблото",
};

const LADDER_COPY_ORDER: ReadonlyArray<(d: RungDelta) => LadderCopy | null> = [
  // Wet: the rendered rain AND the grip together — one mechanism, one sentence.
  (d) =>
    d.weather.has("rain") && d.grip.has("wetGrip")
      ? {
          titleBg: "Мокър паваж",
          coachBg:
            "Вече вали и настилката държи около 70% от сухото сцепление: спирачният път става около 1,4 пъти по-дълъг. Още преди да потеглиш, включи късите светлини и чистачките; после вдигай газта по-рано и остави двойна дистанция — сухият навик за точката на спирачката тук закъснява точно с една дължина на колата.",
          tailBg:
            "Освен това пътят е мокър: включи късите светлини и смятай спирачния път около 1,4 пъти по-дълъг.",
          lawRef: "ЗДвП чл. 20, ал. 2; чл. 70",
        }
      : null,
  (d) =>
    d.weather.has("snow")
      ? {
          titleBg: "Сняг",
          coachBg:
            "Пътят е заснежен: утъпканият сняг държи около 40% от сухото сцепление, значи спирачният път от 25 км/ч е колкото сухият от 40. Преди да потеглиш, включи късите светлини; после карай около наполовина под знака и движи волана и спирачката бавно — резките команди на сняг не спират, а отключват поднасяне.",
          tailBg:
            "Освен това пътят е заснежен: включи късите светлини, карай наполовина под знака и без резки движения.",
          lawRef: "ЗДвП чл. 20, ал. 2; чл. 70",
        }
      : null,
  (d) =>
    d.weather.has("fog")
      ? {
          titleBg: "В мъгла",
          coachBg:
            "Пада мъгла: включи късите светлини (и задните за мъгла под 50 метра видимост) — дългите се отразяват в капките и правят стената пред теб по-плътна. Карай толкова бавно, че да спираш в рамките на това, което ВИЖДАШ: тук видимостта, а не табелата, е ограничението.",
          tailBg:
            "Освен това пада мъгла: включи късите светлини и карай толкова бавно, че да спираш в рамките на видимото.",
          lawRef: "ЗДвП чл. 70; чл. 20, ал. 2",
        }
      : null,
  (d) =>
    d.weather.has("night")
      ? {
          titleBg: "По тъмно",
          coachBg:
            "Упражнението вече е нощем: включи късите светлини още преди да потеглиш и помни, че оттук нататък не караш по пътя, а по снопа на фаровете — късите показват около 40 метра, а в тъмнината отвъд тях еднакво спокойно стои пешеходец в тъмни дрехи. Карай със скорост, от която можеш да спреш ВЪТРЕ в осветеното.",
          tailBg:
            "Освен това е тъмно: включи късите светлини и не изпреварвай собствения си сноп — виждаш около 40 метра.",
          lawRef: "ЗДвП чл. 70; чл. 20, ал. 2",
        }
      : null,
  // Rain WITHOUT the grip opt-in: render-only weather (the 4a discipline —
  // a weather tag never implies physics). Guarded against the wet entry above
  // so one mechanism is never named twice in the same line.
  (d) =>
    d.weather.has("rain") && !d.grip.has("wetGrip")
      ? {
          titleBg: "В дъжд",
          coachBg:
            "Вече вали: включи чистачките и късите светлини — в дъжд светлините са колкото за да виждаш, толкова и за да те виждат. Карай по-бавно, отколкото на сухо, и остави повече място отпред: мократа настилка удължава спирачния път още преди да си усетил, че се хлъзга.",
          tailBg:
            "Освен това вали: включи чистачките и късите светлини и остави повече място отпред.",
          lawRef: "ЗДвП чл. 70; чл. 20, ал. 2",
        }
      : null,
  // Reduced grip WITHOUT a new weather tag: the picture did not change, the
  // stopping distance did (a template whose rain has been render-only until
  // this rung). Guarded so it never doubles the wet/snow entries above.
  (d) =>
    (d.grip.has("wetGrip") || d.grip.has("snowGrip")) &&
    !d.weather.has("rain") &&
    !d.weather.has("snow")
      ? {
          titleBg: "Настилката вече е истинска",
          coachBg:
            "Картината е същата, но сега пътят държи колкото наистина държи: сцеплението е намалено, спирачният път е чувствително по-дълъг и гумите поднасят по-рано в завой. Карай по-бавно, отколкото ти се струва нужно, вдигни газта по-рано и остави двойна дистанция.",
          tailBg:
            "Освен това сцеплението вече е намалено — спирачният път е чувствително по-дълъг.",
          lawRef: "ЗДвП чл. 20, ал. 2",
        }
      : null,
  (d) =>
    d.grip.has("crosswind")
      ? {
          titleBg: "Страничен вятър",
          coachBg:
            "Появява се страничен вятър с пориви: той бута колата встрани постоянно, а при внезапно отслабване рязко завъртяният волан сам я изхвърля на другата страна. Намали скоростта, дръж волана здраво с две ръце и коригирай с малки, меки движения — вторият замах е този, който вади колата от лентата.",
          tailBg:
            "Освен това духа страничен вятър: дръж волана здраво с две ръце и коригирай с малки движения.",
          lawRef: "ЗДвП чл. 20, ал. 2",
        }
      : null,
  (d) => {
    if (!d.adds.has("actor")) return null;
    const named = d.stagedKinds.map((k) => STAGED_KIND_BG[k]).filter(Boolean);
    const what = named.length > 0 ? named.slice(0, 2).join(" и ") : "още един участник в движението";
    return {
      titleBg: "Още един участник",
      coachBg: `На това ниво в упражнението се появява ${what}. Карай така, че да можеш да реагираш, без да се налага да спираш рязко: гледай по-далеч напред, дръж крака готов над спирачката и решавай рано — късното решение е това, което превръща изненадата в удар.`,
      tailBg: `Освен това се появява ${what} — гледай по-далеч напред и решавай рано.`,
      lawRef: "ЗДвП чл. 20, ал. 2",
    };
  },
  (d) =>
    d.adds.has("traffic")
      ? {
          titleBg: "По-натоварена улица",
          coachBg:
            "Улицата вече не е празна — по нея се движат повече коли, отколкото на предишното ниво. Пролуката, която търсиш, трябва да е истинска, а не „мой ред е“: гледай не първата кола, а втората, тръгвай решително чак когато си сигурен, и ако се съмняваш — изчакай. Изчакването струва секунди, погрешната преценка струва предница.",
          tailBg:
            "Освен това улицата е по-натоварена — чакай истинска пролука, а не „мой ред е“.",
          lawRef: "ЗДвП чл. 25",
        }
      : null,
  (d) =>
    d.adds.has("rubric")
      ? {
          titleBg: "По-строга мярка",
          coachBg:
            "Мястото и допуските са същите, мярката е по-строга: тук се брои и КАК си стигнал — с колко опита и с колко оглеждания. Не бързай в началото, за да не поправяш накрая; икономичната маневра е и по-безопасната, защото всяко излизане и връщане е още едно място, на което някой може да мине зад теб.",
          tailBg: "Освен това мярката е по-строга — брои се и с колко опита го правиш.",
          lawRef: "Наредба № 38",
        }
      : null,
  (d) =>
    d.adds.has("rules")
      ? {
          titleBg: "Оценява се по-строго",
          coachBg:
            "На това ниво се следи и нещо, което досега не се е оценявало в това упражнение. Карай както би карал пред изпитващ: оглед преди всяка маневра, мигач навреме, скорост съобразена с обстановката — правилата не са се променили, промени се това колко от тях се измерват.",
          tailBg: "Освен това на това ниво се оценява по-строго от предишното.",
          lawRef: "Наредба № 38",
        }
      : null,
  // Protocol is LAST on purpose: it is the frame the rung is driven in, not the
  // thing on the road that changed. When something physical also changed, the
  // physical half leads and this rides as the tail; when the exam flag is the
  // WHOLE delta (the silent L4 of 155 templates), it becomes the line itself.
  (d) =>
    d.adds.has("protocol")
      ? {
          titleBg: EXAM_PROTOCOL_COMPLICATION.titleBg,
          coachBg: EXAM_PROTOCOL_COMPLICATION.coachBg,
          tailBg:
            "Освен това оттук нататък е по изпитен протокол — без кола-сянка, без линия и без подсказки.",
          lawRef: EXAM_PROTOCOL_COMPLICATION.lawRef,
        }
      : null,
];

/**
 * The complication a rung actually announces: the rung's OWN authored copy
 * where it has one, otherwise the ladder's stored copy for whatever the
 * compiler measured this rung adding over the next lower authored rung.
 *
 * **Call this, never `rung.complication`** — the same discipline
 * resolveScenarioRubric exists for. A UI that reads the raw field shows „Ниво
 * 4 — нищо ново" on 167 templates whose L4 is in fact the exam rung.
 *
 * Throws the same ScenarioCompileError compileScenario throws for a level the
 * template does not author.
 */
export function resolveScenarioComplication(
  spec: ScenarioSpec,
  level: ScenarioLevel,
): LevelComplication | undefined {
  const idx = spec.levels.findIndex((l) => l.level === level);
  if (idx < 0) {
    throw new ScenarioCompileError(
      spec.id,
      level,
      `the template does not author L${level} (has: ${spec.levels.map((l) => `L${l.level}`).join(", ")})`,
    );
  }
  const rung = spec.levels[idx];
  if (rung.complication) {
    return { ...rung.complication, adds: [...rung.complication.adds] };
  }
  // The lowest authored rung has nothing below it to be harder than.
  if (idx === 0) return undefined;
  const delta = rungDelta(spec, idx);
  if (delta.adds.size === 0) return undefined;

  // Compose from the MEASURED delta: the leading mechanism gets its full
  // instructor sentence, a second one rides as a short tail, and anything
  // beyond that is dropped from the LINE (never from `adds`, which stays the
  // complete measured set). The first briefing step is also the line the
  // overlay holds the session on — two paragraphs there is a wall, and a wall
  // is read the way an unexplained difficulty is: not at all.
  const parts: LadderCopy[] = [];
  for (const pick of LADDER_COPY_ORDER) {
    const copy = pick(delta);
    if (copy) parts.push(copy);
    if (parts.length === 2) break;
  }
  if (parts.length === 0) return undefined;
  const [lead, second] = parts;
  return {
    adds: [...delta.adds],
    titleBg: parts.map((p) => p.titleBg).join(" + "),
    coachBg: second ? `${lead.coachBg} ${second.tailBg}` : lead.coachBg,
    ...(lead.lawRef ? { lawRef: lead.lawRef } : {}),
  };
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
  //
  // `effectiveConditions`, not `rungConditions`: an L5 that measured out as
  // „the rung below plus a tolerance number" is driven at night by the ladder
  // floor (see l5LadderFloorApplies). Every other rung reads exactly what it
  // authors, so 164 of 167 templates compile bit-identically.
  const conditions = effectiveConditions(spec, rung);
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
  const physics = rungPhysics(spec, rung);

  // The rung's own dial wins; a SILENT rung now falls back to the §7 ladder
  // instead of 1.0 (doc 86 L13 — that 1.0 is why L1, L2 and L3 compiled to the
  // same lesson on 145 of 155 templates). Waypoint gates only ever widen from
  // it; maneuver tolerances scale both ways (params.ts).
  const toleranceScale = rung.toleranceScale ?? DEFAULT_LEVEL_TOLERANCE[level];
  const widenBudget = radiusWidenBudget(spec);
  // B58 — the street's own posted limit, so the ladder's speed grace can never
  // print a gate label ABOVE the sign. The template's map recipe is the single
  // authored source (it is mirrored byte-for-byte into the district's
  // meta.scenario.params by the generators, and the world tests assert that),
  // so no district load is needed at compile time. Non-numeric / absent ⇒
  // undefined ⇒ params.ts behaves exactly as before.
  const postedRaw = spec.map.params["maxspeedKmh"];
  const postedLimitKmh = typeof postedRaw === "number" && Number.isFinite(postedRaw) ? postedRaw : undefined;
  const objectives: LessonObjective[] = spec.success.map((o, i) => {
    const { kind, params } = serializeObjectiveParams(
      o.params,
      toleranceScale,
      widenBudget[i],
      postedLimitKmh,
    );
    // THE AUTHOR'S OWN FIGURE, KEPT BESIDE THE LADDER'S — the field that ends
    // „graded on a number nobody said" (see AUTHORED_MAX_SPEED_PARAM_KEY).
    //
    // `serializeObjectiveParams` writes ONE speed into the compiled objective:
    // `maxSpeedKmh` after widenSpeedCap folded the rung's grace into it. From
    // that single number nothing downstream can tell the author's 40 from the
    // ladder's 45 — the grace is not invertible here, because `toleranceScale`
    // is a rung concept that never reaches the lesson. That is why the advisor
    // could only ever choose between saying the tolerance (sweep161's defect:
    // «дръж под 54.5 км/ч») and saying nothing at all, and it chose nothing on
    // 499 of the 953 capped cards while the gate went on grading every one.
    //
    // MEASURED over every compiled rung of every template (the census is
    // pinned in `advisor-authored-cap.test.ts`): 953 capped reachZone cards,
    // 644 of them above the halt band, and for ALL 644 the authored cap is
    // present, integral, and ≤ the compiled gate. So carrying it makes „the
    // card names a number the student is held to" total rather than partial.
    //
    // IT CANNOT REACH THE GRADER. `parseObjectiveParams` (objectives.ts)
    // builds `WitnessedReachZoneParams` from a whitelist and drops every key
    // it does not name, so this is a COACHING channel by construction — the
    // same shape as the `postedLimitKmh` above, one level in. The gate stays
    // exactly what widenSpeedCap made it; only the sentence changes.
    if (kind === "reachZone" && o.params.kind === "reachZone" && o.params.maxSpeedKmh !== undefined) {
      params[AUTHORED_MAX_SPEED_PARAM_KEY] = o.params.maxSpeedKmh;
    }
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
  const examMode = rungExamMode(rung);
  // What this rung ADDS, and the sentence that explains it. Resolved here so
  // it lands in the briefing the student is shown (see briefingBg below).
  const complication = resolveScenarioComplication(spec, level);

  // Ambient traffic, in precedence order: the rung's explicit count wins; then
  // the template's own baseline; then the FAMILY baseline for the families
  // whose whole subject is other road users (SCENARIO_FAMILY_TRAFFIC_BASELINE
  // — measured, see its doc); then zero, because a parking bay or a полигон is
  // not a boulevard. Everything below the rung level is scaled by the §7
  // ladder, so L1 reads a quiet street and L5 a busy one.
  // (rungTraffic is the single truth — the complication resolver reads the
  //  SAME function, so the street the student is told about is the street the
  //  lesson builds.)
  const traffic = rungTraffic(spec, rung);

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
    // THE BRIEFING, DELIVERED (2026-08-02). Every template hand-authors
    // numbered steps and until today the compiler threw them away: no .tsx
    // read `instructionsBg`, so „Включи фаровете — вече е тъмно" existed in
    // the repository and nowhere else. Carried COPIED, never the template's
    // own objects (specs are shared data — the signalPlan precedent).
    // See LessonSpec.briefingBg for why a dropped field became a gate defect.
    //
    // THE COMPLICATION RIDES IN FRONT (2026-08-02, the level-ladder wave). If
    // this rung ADDS something — rain that changes the grip, a busier street,
    // the exam protocol — its explanation is step 1 and the drill's own steps
    // renumber behind it. That ordering is the delivery: the overlay puts
    // `briefingBg[0]` on the line and blocks on „Разбрах", so the one sentence
    // that says WHY the rung is harder is the one sentence nobody can skip.
    // Unexplained difficulty is a tax, not a lesson (THEO-4).
    briefingBg: (complication
      ? [
          { n: 0, textBg: complicationBriefingText(level, complication) },
          ...spec.instructionsBg,
        ]
      : spec.instructionsBg
    ).map((s, i) => ({ n: i + 1, textBg: s.textBg })),
    conceptIds: [...spec.conceptIds],
    world: { districtId: spec.map.districtId },
    // B58 — carried so the advisor card cannot print a cap above the sign; see
    // LessonSpec.postedLimitKmh. Same single authored source as the gate clamp
    // above, so the two can never disagree.
    ...(postedLimitKmh !== undefined ? { postedLimitKmh } : {}),
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
    // …and WHICH CAR, on the one drill whose four middle steps command a
    // clutch. Spread rather than written flat so every other compiled lesson
    // is byte-identical and the scene's own `DEFAULT_DIFFICULTY` stays the
    // authority for them (ScenarioStartSpec.openingTier carries the frames).
    ...(spec.start.openingTier ? { openingTier: spec.start.openingTier } : {}),
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
    // Doc 87 B40(a), the same opt-in pattern: only a template that AUTHORS
    // `actorLabels` gets a caption over a staged actor. Denormalised by value
    // like every other spec field so nothing at runtime reads the template.
    ...(spec.actorLabels ? { actorLabels: spec.actorLabels.map((a) => ({ ...a })) } : {}),
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
    // The sandbox's assignment is the MISTAKE. Showing the correct numbered
    // steps beside „направи грешката нарочно" would be the shell arguing with
    // itself, so the briefing is dropped here and only here.
    delete lesson.briefingBg;
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
