/**
 * „Следващ сценарий" — the pure next-target resolver (founder 2026-07-17: a
 * green rung must offer the next one, not dead-end on „Повтори").
 *
 * Ordering: the catalog's display order IS `SCENARIO_TEMPLATES` array order —
 * /simulator/page.tsx maps that array 1:1 into the catalog entries and
 * ScenarioCatalog renders them unsorted. This module reuses that ONE order;
 * it never re-derives a second one (a divergence would make the „next" button
 * point at a different card than the one the student sees below it).
 *
 * Two independent targets (founder 2026-07-17: „the next-lesson button goes to
 * stage 2 of the SAME lesson — we also need one that switches to the NEXT
 * LESSON"):
 *   (a) `level` — same template, next authored level. null at the top of the
 *       authored ladder, and null when the star gate leaves it shut (below);
 *   (b) `template` — the NEXT template in catalog order, at its lowest
 *       authored level. Families run in blocks in the array, so this stays
 *       inside the family until the block ends, then rolls into the next
 *       family — no family logic needed, the order already says it. null on
 *       the last card (end of the library).
 * Both null ⇒ nothing to offer; the UI says so instead of dead-ending.
 *
 * The star gate (doc 76 §8) applies to (a) ONLY: L2+ opens only after a ≥ 2★
 * session on the previous rung, and the save action REFUSES a locked level
 * server-side (actions.ts → LEVEL_LOCKED) — a student would drive a whole rung
 * and silently lose the result. A green pass does NOT imply 2★: with measured
 * rubric components a completed-but-unobservant run folds to 1★ (rubric.ts:
 * ratio < 0.5). So a level step whose stars fall short is NOT returned. (b) is
 * never gated — L1 of any card is always open — so a star-locked ladder still
 * leads somewhere, and „Повтори" stays one click away for re-earning the stars.
 *
 * `resolveScenarioNextStep` (singular) is the one-target view of the same
 * answer: level first, else template. Both share this one resolution — the
 * catalog order is read in exactly one place.
 */

import { SCENARIO_UNLOCK_MIN_STARS } from "./progress";
import { SCENARIO_TEMPLATES } from "./templates";
import {
  SCENARIO_LEVEL_NAMES_BG,
  type ScenarioFamily,
  type ScenarioLevel,
  type ScenarioSpec,
} from "./types";

/** Where the student goes next after a green rung. */
export interface ScenarioNextStep {
  /** "level" — the same template one rung up; "template" — the next card. */
  kind: "level" | "template";
  templateId: string;
  level: ScenarioLevel;
  /** The compiled rung id (<templateId>@L<n>) — the persist/regrade handle. */
  lessonId: string;
  titleBg: string;
  levelNameBg: string;
  family: ScenarioFamily;
  /** True while the step stays inside the finished template's family. */
  sameFamily: boolean;
}

export interface ScenarioNextStepInput {
  templateId: string;
  level: ScenarioLevel;
  /** The attempt's official verdict. */
  passed: boolean;
  /** Every objective green (LessonResult.completedAll). */
  allObjectivesPassed: boolean;
  /**
   * The attempt's rubric stars — gates the (a) level step against the doc 76
   * §8 unlock rule. Omitted/null = unknown ⇒ the level step is allowed (the
   * server stays the authority either way).
   */
  stars?: 1 | 2 | 3 | null;
}

/** Authored rungs, ascending — the array's order is not a contract. */
function authoredLevels(spec: ScenarioSpec): ScenarioLevel[] {
  return spec.levels.map((l) => l.level).sort((a, b) => a - b);
}

function stepFor(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  kind: ScenarioNextStep["kind"],
  fromFamily: ScenarioFamily,
): ScenarioNextStep {
  return {
    kind,
    templateId: spec.id,
    level,
    lessonId: `${spec.id}@L${level}`,
    titleBg: spec.titleBg,
    levelNameBg: SCENARIO_LEVEL_NAMES_BG[level],
    family: spec.family,
    sameFamily: spec.family === fromFamily,
  };
}

/** Both targets at once — each independently null when it does not exist. */
export interface ScenarioNextSteps {
  /** Next rung of the SAME template; null at the top, or star-locked. */
  level: ScenarioNextStep | null;
  /** Next card in catalog order at its lowest rung; null at the library's end. */
  template: ScenarioNextStep | null;
}

const NO_STEPS: ScenarioNextSteps = { level: null, template: null };

/**
 * Resolve every target reachable from a finished attempt. Both null when the
 * run was not green, when the id/rung is foreign — and, the case the UI must
 * speak to, when the catalog is exhausted (end of the library).
 */
export function resolveScenarioNextSteps(
  input: ScenarioNextStepInput,
  catalog: readonly ScenarioSpec[] = SCENARIO_TEMPLATES,
): ScenarioNextSteps {
  const { templateId, level, passed, allObjectivesPassed, stars = null } = input;
  // Only a fully green run advances — the buttons are the reward, not a skip.
  if (!passed || !allObjectivesPassed) return NO_STEPS;

  const index = catalog.findIndex((s) => s.id === templateId);
  if (index === -1) return NO_STEPS;
  const spec = catalog[index];
  const levels = authoredLevels(spec);
  // An unauthored rung never compiled, so it cannot have been played.
  if (!levels.includes(level)) return NO_STEPS;

  // (a) one rung up the same ladder — unless the stars leave it locked. A
  // locked rung is withheld, never offered-and-refused: actions.ts would
  // reject the attempt (LEVEL_LOCKED) after a full drive.
  const nextLevel = levels.find((l) => l > level);
  const starsOpenNextLevel = stars === null || stars >= SCENARIO_UNLOCK_MIN_STARS;
  const levelStep =
    nextLevel !== undefined && starsOpenNextLevel
      ? stepFor(spec, nextLevel, "level", spec.family)
      : null;

  // (b) the next card in catalog order, at its lowest authored rung — always
  // open (L1 is never gated). Skip any template with no authored levels
  // (validation forbids it; the loop keeps the resolver honest, not trusting).
  let templateStep: ScenarioNextStep | null = null;
  for (let i = index + 1; i < catalog.length; i += 1) {
    const candidate = catalog[i];
    const lowest = authoredLevels(candidate)[0];
    if (lowest !== undefined) {
      templateStep = stepFor(candidate, lowest, "template", spec.family);
      break;
    }
  }

  return { level: levelStep, template: templateStep };
}

/**
 * The single-target view: one rung up the same ladder when it is open, else
 * the next card. null = nothing to offer. Delegates to the plural resolver —
 * the catalog order lives there and only there.
 */
export function resolveScenarioNextStep(
  input: ScenarioNextStepInput,
  catalog: readonly ScenarioSpec[] = SCENARIO_TEMPLATES,
): ScenarioNextStep | null {
  const { level, template } = resolveScenarioNextSteps(input, catalog);
  return level ?? template;
}
