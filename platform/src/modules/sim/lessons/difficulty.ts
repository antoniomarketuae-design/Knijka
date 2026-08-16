/**
 * THE RUNG CENSUS — „what actually changes between L1, L2, L3, L4 and L5?",
 * asked of the compiler rather than of the authoring intent.
 *
 * WHY THIS FILE EXISTS. Founder register B2, verbatim: *„L2 L3 L4 L5 THEY HAVE
 * NOTHING MORE"*. B19 is the same sentence about one drill: *„same question 6
 * just this time L5 — and it has no difference at all"*. Both rows have been
 * PARTIAL-SEEN through several waves, and the reason they could not be closed
 * is that nobody ever produced the number. Each wave answered a different
 * question — „does L1 differ from L3?" (yes, the aids), „does any rung author a
 * complication?" (yes, 347 of them) — and none of them answered his: how many
 * rungs are the same drive with a different number on it.
 *
 * So this module is the measuring instrument, and
 * `__tests__/rung-ladder-census.test.ts` is the gate that runs it over all 167
 * templates and refuses to let the answer get worse.
 *
 * ── THE METHOD ──────────────────────────────────────────────────────────────
 *
 * For each template and each ADJACENT authored rung pair, compile BOTH rungs
 * and diff the two LessonSpecs — the objects `createLessonSession` runs, never
 * the authored spec (the anti-theatre discipline of level-complication.test.ts:
 * a claim in a template is not evidence, a compiled difference is). The
 * difference is then sorted into three buckets, and the buckets are the whole
 * point:
 *
 *   WORLD   the drive itself changed — weather, grip, ambient density, a staged
 *           actor. The student sees it through the windscreen.
 *   FRAME   the drive is the same and the judging or the protocol changed —
 *           exam mode, a cold start, a rule-engine dial, a measured rubric
 *           component. The student meets it on the briefing and the end screen.
 *   NUMBER  nothing but tolerances and par time: the same drive with a wider or
 *           narrower gate. **This is the bucket the founder is naming.** A
 *           waypoint radius of 5 m instead of 6.25 m is not a rung; it is a
 *           number the student cannot perceive while driving.
 *
 * AIDS ARE DELIBERATELY IN NO BUCKET, and that is not a dodge — it is doc 86
 * S4's own rule („a ladder made of ids, titles and AIDS is exactly the ladder
 * he complained about"). L1 → L2 → L3 genuinely IS a different experience: the
 * shadow car goes, then the ribbon goes. But taking help away is not adding
 * anything, and „L2 L3 L4 L5 have nothing MORE" is precisely a complaint about
 * addition. Counting the aid table here would answer a question he did not ask.
 *
 * ── THE CENSUS, MEASURED 2026-08-16 ON ALL 167 TEMPLATES ────────────────────
 *
 *   pair      WORLD   FRAME   NUMBER-ONLY   rung not authored
 *   L1 → L2       1       0           166                   0
 *   L2 → L3      22       0           145                   0
 *   L3 → L4       0     162             0                   5
 *   L4 → L5     142       0             3                  22
 *
 * Read it row by row, because each row says something different:
 *
 *  · **L1 → L2 and L2 → L3 add nothing on 166 and 145 templates.** They are
 *    aid-fade rungs by design and by name (Пълна помощ → Частична помощ →
 *    Самостоятелно), and the ladder CANNOT fill them: weather at «Частична
 *    помощ» would contradict the rung's own name, and traffic, actors and
 *    geometry all need a map the compiler cannot see. This is stated, not
 *    fixed — see the per-family verdict below.
 *  · **L3 → L4 is the same delta on all 162 templates that author it:** a cold
 *    start and the exam flag (19 of them also tighten a rubric). That IS the
 *    exam banner the register describes. It is also, honestly, what «Изпитни
 *    условия» means — the rung's content is the STANDARD, not the road — and
 *    the two ways to add more to it were measured and rejected here: a
 *    laddered `ruleConfig` would tighten grading on 167 drills nobody has
 *    driven at that setting (the engine's graces exist to absorb solver noise,
 *    and manufacturing false convictions is not difficulty), and a laddered
 *    rubric reaches exactly one template, because only 20 of 167 author
 *    `rubric.economy` and 19 of those already override it at L4.
 *  · **L4 → L5 is where the ladder can and does work** — 142 of 145 authored
 *    L5 rungs change the world. The three that did not are B19 verbatim, and
 *    they are what the L5 floor in `scenario/compile.ts` closes.
 *
 * ── AFTER THE L5 FLOOR ──────────────────────────────────────────────────────
 *
 *   L4 → L5     145       0             0                  22
 *
 * and the residual is named rather than counted as won: `L5_PLUS_ONE_CAR_ONLY`
 * below, plus the 22 templates that author no L5 at all, per family.
 */

import type { LessonSpec } from "../contracts";
import { compileScenario, resolveScenarioRubric } from "./scenario/compile";
import type { ScenarioFamily, ScenarioLevel, ScenarioSpec } from "./scenario/types";

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

/** Which of the three buckets a rung step falls in (see the header). */
export type RungStepKind = "world" | "frame" | "number" | "none";

export interface RungStep {
  kind: RungStepKind;
  /** Human-readable diffs, e.g. `traffic 5->6`, `env +timeOfDay`. */
  world: string[];
  frame: string[];
  number: string[];
}

/**
 * The smallest ambient-vehicle rise this project is willing to call a rung.
 *
 * MEASURED, and it is the same sweep that set SCENARIO_FAMILY_TRAFFIC_CEILING
 * (see its doc in scenario/compile.ts — nine districts, 3 seeds, 60 s each,
 * with the player parked where the drill grades):
 *
 *   n=5   cone 45–70%   cross 37–69%   4.0–9.0 passes/min
 *   n=6   cone 47–77%   cross 34–86%   3.7–11  passes/min
 *
 * The bands overlap on every channel, and on passes/min the BUSIER street has
 * the LOWER floor — 6 cars produce fewer passes than 5 on some districts. One
 * extra ambient car is therefore inside the noise of the only instrument that
 * has ever been pointed at this, which means a student cannot be promised he
 * will notice it. Two is the smallest rise the sweep separates.
 *
 * It is a census threshold, not a compiler rule: nothing clamps to it. It exists
 * so „L5 adds a car" cannot be counted as an answer to B19 without someone
 * either measuring that the car is visible or authoring something else.
 */
export const MIN_PERCEPTIBLE_VEHICLE_RISE = 2;

const physicsFlags = (l: LessonSpec) =>
  new Set(
    Object.entries(l.physics ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k),
  );

const environmentKeys = (l: LessonSpec) =>
  new Set(
    Object.entries(l.environment ?? {})
      .filter(([, v]) => v !== undefined && v !== false)
      .map(([k]) => k),
  );

/**
 * Diff two COMPILED rungs of the same template.
 *
 * `hi` is the higher rung and `lo` the authored rung below it; both must be
 * levels the template authors or compileScenario throws (deliberately — a
 * census that silently skips a missing rung is how „145 of 155 identical" went
 * unnoticed for fifteen waves).
 *
 * Only rises count as WORLD. A rung that removes an aid, drops the exam flag or
 * widens a gate is not adding anything, and the whole complaint is about
 * addition.
 */
export function classifyRungStep(
  spec: ScenarioSpec,
  hiLevel: ScenarioLevel,
  loLevel: ScenarioLevel,
): RungStep {
  const hi = compileScenario(spec, hiLevel);
  const lo = compileScenario(spec, loLevel);
  const world: string[] = [];
  const frame: string[] = [];
  const number: string[] = [];

  const vHi = hi.traffic?.vehicleCount ?? 0;
  const vLo = lo.traffic?.vehicleCount ?? 0;
  if (vHi > vLo) world.push(`traffic ${vLo}->${vHi}`);
  const pHi = hi.traffic?.pedestrianCount ?? 0;
  const pLo = lo.traffic?.pedestrianCount ?? 0;
  if (pHi > pLo) world.push(`peds ${pLo}->${pHi}`);

  const envHi = environmentKeys(hi);
  const envLo = environmentKeys(lo);
  const envAdded = [...envHi].filter((k) => !envLo.has(k));
  if (envAdded.length > 0) world.push(`env +${envAdded.join("/")}`);

  const phHi = physicsFlags(hi);
  const phLo = physicsFlags(lo);
  const phAdded = [...phHi].filter((k) => !phLo.has(k));
  if (phAdded.length > 0) world.push(`phys +${phAdded.join("/")}`);

  const sHi = hi.stagedEvents?.length ?? 0;
  const sLo = lo.stagedEvents?.length ?? 0;
  if (sHi > sLo) world.push(`staged ${sLo}->${sHi}`);

  if (hi.examMode === true && lo.examMode !== true) frame.push("examMode");
  if (hi.vehicleStart === "cold" && lo.vehicleStart !== "cold") frame.push("coldStart");
  if (JSON.stringify(hi.ruleConfig ?? null) !== JSON.stringify(lo.ruleConfig ?? null)) {
    frame.push("ruleConfig");
  }

  // Rubric: a MEASURED component added or an existing one tightened. Par time is
  // NUMBER, not FRAME — doc 76 §6 makes it informational, so it cannot cost a
  // star and the student meets it as one line of Bulgarian on the end screen.
  const rHi = resolveScenarioRubric(spec, hiLevel);
  const rLo = resolveScenarioRubric(spec, loLevel);
  const measuredAdded =
    (rHi?.placement && !rLo?.placement) ||
    (rHi?.economy && !rLo?.economy) ||
    (rHi?.observation && !rLo?.observation);
  const tightened =
    rHi?.economy !== undefined &&
    rLo?.economy !== undefined &&
    (rHi.economy.attemptsFor3Stars < rLo.economy.attemptsFor3Stars ||
      rHi.economy.attemptsFor2Stars < rLo.economy.attemptsFor2Stars);
  if (measuredAdded || tightened) frame.push("rubric");

  if ((rHi?.parTimeSec ?? null) !== (rLo?.parTimeSec ?? null)) number.push("parTime");
  if (JSON.stringify(hi.objectives) !== JSON.stringify(lo.objectives)) number.push("tolerance");

  const kind: RungStepKind =
    world.length > 0 ? "world" : frame.length > 0 ? "frame" : number.length > 0 ? "number" : "none";
  return { kind, world, frame, number };
}

/** True when the step's only WORLD change is an ambient rise too small for the
 *  sweep that measured it to separate from noise (MIN_PERCEPTIBLE_VEHICLE_RISE). */
export function isSubPerceptibleTrafficStep(step: RungStep): boolean {
  if (step.kind !== "world" || step.world.length !== 1) return false;
  const m = /^traffic (\d+)->(\d+)$/.exec(step.world[0]);
  return m !== null && Number(m[2]) - Number(m[1]) < MIN_PERCEPTIBLE_VEHICLE_RISE;
}

// ---------------------------------------------------------------------------
// The residual, named
// ---------------------------------------------------------------------------

/**
 * L5 RUNGS WHOSE ENTIRE ADDITION IS ONE AMBIENT CAR — the honest residual of
 * B19 after the L5 floor, listed rather than fixed.
 *
 * All twelve are junction/signals drills with a bare `{ level: 5 }`, so their
 * L5 is the family baseline laddered from 5 to the measured ceiling of 6. By
 * MIN_PERCEPTIBLE_VEHICLE_RISE above, that step is inside the noise of the
 * sweep that set the ceiling — which means these are very probably twelve more
 * of the rungs he is describing.
 *
 * WHY THE LADDER DOES NOT SIMPLY NIGHTFALL THEM TOO. It would be one line in
 * `l5LadderFloorApplies`, and it would give twelve give-way drills a night sky
 * that nobody has driven. A junction lesson is decided by whether the student
 * can SEE the car with priority; if the ambient fleet does not render headlamps
 * after dark, that lesson stops being harder to drive well and becomes harder
 * to FINISH, which is the one thing doc 86 B3/B5 forbids a difficulty rung to
 * be. The R0 rule is look-before-ship, and this lane has not looked.
 *
 * So they are named here, capped by the census gate, and the fix is one of two
 * things a lane WITH a rig can do: drive one of them at night and either ship
 * the floor for the whole set, or author a per-template complication in
 * templates-junctions*.ts / templates-signals*.ts.
 */
export const L5_PLUS_ONE_CAR_ONLY: readonly string[] = [
  "sc-junction-stop",
  "sc-turn-left-oncoming",
  "sc-junction-gap",
  "sc-junction-blind",
  "sc-junction-left",
  "sc-jx-blocked-exit",
  "sc-signal-dead",
  "sc-signal-flashing",
  "sc-signal-hesitation",
  "sc-signal-controller",
  "sc-signal-redyellow",
  "sc-sig-green-wave",
];

// ---------------------------------------------------------------------------
// The per-family verdict — where five meaningful rungs are not available
// ---------------------------------------------------------------------------

export interface FamilyLadderVerdict {
  /**
   * Templates of this family that author NO L5, exact and exhaustive. The
   * ladder cannot invent one: `spec.levels` is what the catalogue offers, what
   * `resolve.ts` parses and what unlock progression counts, so a rung the
   * template does not declare does not exist anywhere in the product.
   */
  readonly withoutL5: readonly string[];
  /** Why this family's ladder stops where it stops — measured, not asserted. */
  readonly why: string;
}

/**
 * WHERE FIVE MEANINGFUL RUNGS ARE NOT AVAILABLE, PER FAMILY (the founder's own
 * instruction on this lane: say so per family rather than invent filler).
 *
 * Two facts apply to EVERY family and are stated once here rather than fifteen
 * times below:
 *
 *  1. **L2 and L3 add nothing on 166 and 145 templates**, and no ladder can
 *     change that. They are the aid-fade rungs — Пълна помощ, Частична помощ,
 *     Самостоятелно — and their content is the scaffolding coming off. Every
 *     mechanism that could ADD at those rungs needs the map (traffic, actors,
 *     geometry) or contradicts the rung's own name (weather at «Частична
 *     помощ»). If these rungs are to gain anything it is per-template authoring
 *     in templates-*.ts, not a table in the compiler.
 *  2. **L4 is the same delta on all 162 templates that author it** — cold start
 *     plus the exam flag. That is «Изпитни условия» working as named; the two
 *     ladder-side ways to deepen it were measured and rejected (see the header).
 *
 * What varies per family, and is therefore what this table records, is the top
 * of the ladder: which templates stop at L4 (or, for the five clip drills, at
 * L3) and why.
 */
export const SCENARIO_FAMILY_LADDER_VERDICT: Record<ScenarioFamily, FamilyLadderVerdict> = {
  parking: {
    withoutL5: ["sc-pk-busstop-ban", "sc-pk-rail-ban"],
    why:
      "26 of 28 carry an L5. The two that do not are STOPPING-BAN drills: the " +
      "graded act is choosing a lawful place to stop, and the lesson is over " +
      "the moment the student stops in the right one — there is no drive left " +
      "for weather or traffic to complicate. A fifth rung here would have to " +
      "be a different ban zone, i.e. a different template.",
  },
  junction: {
    withoutL5: [],
    why:
      "All 11 author an L5, but six of them add only the family ladder's sixth " +
      "ambient car — see L5_PLUS_ONE_CAR_ONLY. The family's own street is " +
      "already at the measured jam ceiling, so more cars is not available; the " +
      "next rung for these six is authored, not laddered.",
  },
  signals: {
    withoutL5: ["sc-sig-controller-live", "sc-sig-controller-postures"],
    why:
      "The two controller drills stop at L4: their subject is a human " +
      "regulator whose postures ARE the lesson, and the only complications the " +
      "compiler could add (a fuller street, darkness) compete with reading him " +
      "rather than deepening it. Six of the remaining eight are +1-car L5s.",
  },
  pedestrians: {
    withoutL5: [],
    why: "13 of 13 author an L5, all with a real world change (night, rain, a second walker).",
  },
  lanes: {
    withoutL5: [
      "sc-ov-being-overtaken",
      "sc-ov-solid-return",
      "sc-ln-boulevard-discipline",
      "sc-lane-control-signal",
    ],
    why:
      "18 of 22 carry an L5. `sc-lane-control-signal` is one of the five " +
      "templates-reels.ts clip drills and stops at L3 by construction. The " +
      "other three simply stop at L4 with no stated reason — they are " +
      "authoring backlog, not a limit of the family.",
  },
  roundabout: {
    withoutL5: ["sc-rb-circulate-priority"],
    why:
      "5 of 6. The family is also the one place ambient density is measured to " +
      "BACKFIRE — two cars already spend 68–75% of their time stopped on " +
      "rb-mini-v1 — so its L5s are authored weather and staged actors, never a " +
      "fuller ring (SCENARIO_FAMILY_TRAFFIC_BASELINE has no roundabout entry).",
  },
  merging: {
    withoutL5: ["sc-merge-motorway-exit"],
    why: "5 of 6; the exit drill stops at L4 with no stated reason (authoring backlog).",
  },
  hazards: {
    withoutL5: ["sc-driver-distraction", "sc-accident-own-conduct", "sc-animal-hazard"],
    why:
      "5 of 8. All three gaps are templates-reels.ts clip drills, which stop at " +
      "L3 by construction: a why-panel reel is a recorded mistake to watch, not " +
      "a ladder to climb.",
  },
  speed: {
    withoutL5: ["sc-sp-limit-end", "sc-sp-eco-coast"],
    why: "10 of 12; both gaps stop at L4 with no stated reason (authoring backlog).",
  },
  following: {
    withoutL5: [],
    why:
      "9 of 9, all on authored weather/grip — and deliberately never on ambient " +
      "density: 3 ambient cars on the two-lane straight this family is set on " +
      "measured the tailgater NEVER gluing (the gap ran 22 m → 456 m over a " +
      "minute), because an ambient agent lands in the gap the encounter needs.",
  },
  conditions: {
    withoutL5: [
      "sc-ac-rain-lights",
      "sc-ac-crosswind",
      "sc-ac-aquaplane",
      "sc-ac-ice",
      "sc-sign-warning",
    ],
    why:
      "9 of 14, and this family is the honest special case: its SUBJECT is the " +
      "condition, so the ladder's own complication kit has nothing left to add " +
      "— a rain lesson cannot be complicated by rain. `sc-sign-warning` is a " +
      "reels clip drill (L3 by construction); the other four would need a " +
      "second condition composed onto the first, which is authoring work with a " +
      "physics envelope behind it, not a ladder table.",
  },
  cockpit: {
    withoutL5: [],
    why:
      "7 of 7 — five go to night and two to rain with real wet grip. It is the " +
      "family the kit fits most cleanly: the drill is about finding and working " +
      "the controls, and darkness makes that harder without changing the drill.",
  },
  vru: {
    withoutL5: [],
    why:
      "9 of 9, and the family the complication kit fits best: a cyclist or a " +
      "motorcyclist is hardest to see in exactly the conditions the kit can " +
      "add without touching the map — three L5s go to night, five to rain (two " +
      "of those with real wet grip), one stages a second rider.",
  },
  rail: {
    withoutL5: [],
    why:
      "7 of 7 since the L5 floor: `sc-rx-barrier-drop` authored a bare " +
      "`{ level: 5 }` and compiled identically to its own L3 — the pair " +
      "level-seam.test.ts carries on its S4 allowlist as „a dead L5\" — and now " +
      "compiles at night.",
  },
  "exam-drills": {
    withoutL5: ["sc-ed-d2-stop-address", "sc-ed-reverse-line"],
    why:
      "3 of 5. Defensible for this family specifically: an exam drill's whole " +
      "point is the exam standard, which is L4. A rung ABOVE the exam is " +
      "optional here in a way it is not for a skill drill.",
  },
};
