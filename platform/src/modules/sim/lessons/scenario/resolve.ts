/**
 * Scenario lesson-id resolution (S1) — the wire/catalog seam: a compiled
 * scenario micro-lesson persists and regrades under `<templateId>@L<level>`
 * (compile.ts naming), so the server rebuilds the EXACT LessonSpec from the
 * id alone via the pure compiler — grading integrity never depends on
 * client-supplied spec data (the B1b exam-bank pattern, wire.ts).
 */

import type { LessonSpec } from "../../contracts";
import { compileScenario } from "./compile";
import { scenarioById } from "./templates";
import type { ScenarioLevel, ScenarioSpec } from "./types";

/** Naming standard: sc-<family>-<slug> (validate.ts) + the @L<level> rung. */
const SCENARIO_LESSON_ID_RE = /^(sc-[a-z0-9]+(?:-[a-z0-9]+)*)@L([1-5])$/;

/** True for any id in the scenario namespace (template or compiled rung). */
export function isScenarioLessonId(id: string): boolean {
  return SCENARIO_LESSON_ID_RE.test(id);
}

export interface ParsedScenarioLessonId {
  templateId: string;
  level: ScenarioLevel;
}

/** Parse "<templateId>@L<n>"; null when the shape is foreign. */
export function parseScenarioLessonId(id: string): ParsedScenarioLessonId | null {
  const m = SCENARIO_LESSON_ID_RE.exec(id);
  if (m === null) return null;
  return { templateId: m[1], level: Number(m[2]) as ScenarioLevel };
}

/**
 * Resolve a compiled scenario lesson by its id — the wire's third resolver
 * (after lessonById and examVariantById). undefined for foreign ids, unknown
 * templates AND levels the template does not author (compileScenario throws
 * for those — an unauthored rung is not our payload).
 */
export function scenarioLessonById(id: string): LessonSpec | undefined {
  const parsed = parseScenarioLessonId(id);
  if (parsed === null) return undefined;
  const spec: ScenarioSpec | undefined = scenarioById(parsed.templateId);
  if (spec === undefined) return undefined;
  try {
    return compileScenario(spec, parsed.level);
  } catch {
    return undefined;
  }
}
