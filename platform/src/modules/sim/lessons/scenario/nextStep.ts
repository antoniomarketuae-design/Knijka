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
 * The cascade (top → bottom):
 *   (a) same template, next authored level;
 *   (b) top of the authored ladder → the NEXT template in catalog order, at
 *       its lowest authored level. Families run in blocks in the array, so
 *       this stays inside the family until the block ends, then rolls into
 *       the next family — no family logic needed, the order already says it;
 *   (c) last template in the catalog → null (end of the library).
 *
 * The star gate (doc 76 §8): L2+ opens only after a ≥ 2★ session on the
 * previous rung, and the save action REFUSES a locked level server-side
 * (actions.ts → LEVEL_LOCKED). A green pass does NOT imply 2★ — with measured
 * rubric components a completed-but-unobservant run folds to 1★ (rubric.ts:
 * ratio < 0.5). So a level step whose stars fall short is not offered; the
 * cascade falls through to (b) — the next template's lowest rung, which is
 * ALWAYS open (L1 is never gated). The student is never sent into a rung the
 * server would refuse to record, and „Повтори" stays one click away for
 * re-earning the stars.
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

/**
 * Resolve the next rung after an attempt. null when the run was not green,
 * when the id/rung is foreign — and, the case the UI must speak to, when the
 * catalog is exhausted (end of the library).
 */
export function resolveScenarioNextStep(
  input: ScenarioNextStepInput,
  catalog: readonly ScenarioSpec[] = SCENARIO_TEMPLATES,
): ScenarioNextStep | null {
  const { templateId, level, passed, allObjectivesPassed, stars = null } = input;
  // Only a fully green run advances — the button is the reward, not a skip.
  if (!passed || !allObjectivesPassed) return null;

  const index = catalog.findIndex((s) => s.id === templateId);
  if (index === -1) return null;
  const spec = catalog[index];
  const levels = authoredLevels(spec);
  // An unauthored rung never compiled, so it cannot have been played.
  if (!levels.includes(level)) return null;

  // (a) one rung up the same ladder — unless the stars leave it locked.
  const nextLevel = levels.find((l) => l > level);
  const starsOpenNextLevel = stars === null || stars >= SCENARIO_UNLOCK_MIN_STARS;
  if (nextLevel !== undefined && starsOpenNextLevel) {
    return stepFor(spec, nextLevel, "level", spec.family);
  }

  // (b) the next card in catalog order, at its lowest authored rung. Skip any
  // template with no authored levels (validation forbids it; the loop keeps
  // the resolver honest rather than trusting that).
  for (let i = index + 1; i < catalog.length; i += 1) {
    const candidate = catalog[i];
    const lowest = authoredLevels(candidate)[0];
    if (lowest !== undefined) return stepFor(candidate, lowest, "template", spec.family);
  }

  // (c) the end of the library.
  return null;
}
