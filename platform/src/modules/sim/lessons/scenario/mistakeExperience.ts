/**
 * THEO-3 (doc 64) — the mistake-experience mode („Направи грешката"): a
 * per-mistake sandbox where the student INTENTIONALLY performs a template's
 * demonstrated wrong action, then pause → consequence (the recorded red-ghost
 * replay + the stored whatWentWrongBg + the lawRef) → graded retry of the
 * SAME rung. This module is COMPOSITION over existing machinery, never a
 * fork: compileScenario's mistakeExperience opt-in builds the LessonSpec, the
 * coach's learn-only channel suppresses scoring, the teach-pause mechanism
 * freezes the sim, MistakeReplay (THEO Stage 1) shows the consequence.
 *
 * Here live only the mode's pure seams: the `~m<i>` id parser (mirror of
 * resolve.ts for the rung namespace), the entry-rung compile helper, and the
 * six founder-seeded mistake classes (the wired entry points — the mechanism
 * itself works for ANY template mistake via compileMistakeExperience).
 */

import type { LessonSpec } from "../../contracts";
import { compileScenario } from "./compile";
import { scenarioById } from "./templates";
import type { ScenarioLevel, ScenarioSpec } from "./types";

/**
 * The generous window (sim-seconds of driving) after which a student who has
 * NOT managed to commit the targeted mistake is offered „Виж демонстрацията"
 * (the red-ghost replay) instead — never a dead end (doc 64 THEO-3).
 */
export const MISTAKE_EXPERIENCE_DEMO_OFFER_SEC = 60;

// Mirror of compile.ts mistakeExperienceLessonId — the compile/resolve split
// precedent (rung ids: template literal in compile.ts, regex in resolve.ts).
// Round-trip pinned by mistake-experience-compile.test.ts.
const MISTAKE_EXPERIENCE_ID_RE = /^(sc-[a-z0-9]+(?:-[a-z0-9]+)*)@L([1-5])~m(\d{1,2})$/;

export interface ParsedMistakeExperienceLessonId {
  templateId: string;
  level: ScenarioLevel;
  mistakeIndex: number;
}

/** Parse "<templateId>@L<n>~m<i>"; null when the shape is foreign. */
export function parseMistakeExperienceLessonId(
  id: string,
): ParsedMistakeExperienceLessonId | null {
  const m = MISTAKE_EXPERIENCE_ID_RE.exec(id);
  if (m === null) return null;
  return {
    templateId: m[1],
    level: Number(m[2]) as ScenarioLevel,
    mistakeIndex: Number(m[3]),
  };
}

/** Lowest authored rung — the mode always compiles here (full-help ladder). */
export function scenarioEntryLevel(spec: ScenarioSpec): ScenarioLevel {
  let min = spec.levels[0].level;
  for (const rung of spec.levels) if (rung.level < min) min = rung.level;
  return min;
}

/**
 * Compile one template mistake into its experience session: the template's
 * LOWEST rung (aids on by the §7 ladder) + the mistakeExperience opt-in.
 * Throws ScenarioCompileError for an out-of-range index (compile.ts).
 */
export function compileMistakeExperience(spec: ScenarioSpec, mistakeIndex: number): LessonSpec {
  return compileScenario(spec, scenarioEntryLevel(spec), {
    mistakeExperience: { mistakeIndex },
  });
}

// ---------------------------------------------------------------------------
// The six founder-seeded mistake classes (doc 64 THEO-3 seed catalog)
// ---------------------------------------------------------------------------

export type MistakeExperienceClassId =
  | "zebra-no-stop"
  | "no-mirror-turn"
  | "stop-sign-ignored"
  | "corner-speeding"
  | "tailgating"
  | "forbidden-overtake";

export interface MistakeExperienceSeed {
  classId: MistakeExperienceClassId;
  templateId: string;
  mistakeIndex: number;
}

/**
 * Founder seed list → shipped template mistakes (all recorded, all compiled —
 * gated by mistake-experience-seeds.test.ts). Notes:
 *  - no-mirror-turn maps to sc-lane-change[1] („Престрояване без проверка в
 *    огледалото" — the exact LANE_CHANGE_WITHOUT_MIRROR_CHECK code, surfacing
 *    on every mirror-discipline question card); the turn-variant alternative
 *    sc-vu-cyclist-hook[1] cites only FAILED_TO_YIELD — founder may re-rule.
 *  - the list is ordered; seed-for-event resolution takes the first match.
 */
export const MISTAKE_EXPERIENCE_SEEDS: readonly MistakeExperienceSeed[] = [
  { classId: "zebra-no-stop", templateId: "sc-zebra-approach", mistakeIndex: 1 },
  { classId: "no-mirror-turn", templateId: "sc-lane-change", mistakeIndex: 1 },
  { classId: "stop-sign-ignored", templateId: "sc-junction-stop", mistakeIndex: 0 },
  { classId: "corner-speeding", templateId: "sc-sp-curve", mistakeIndex: 0 },
  { classId: "tailgating", templateId: "sc-follow-distance", mistakeIndex: 0 },
  { classId: "forbidden-overtake", templateId: "sc-ov-ban-overtake", mistakeIndex: 0 },
];

/** A resolved seed — the entry-point payload („Преживей грешката" buttons). */
export interface MistakeExperienceSeedRef {
  classId: MistakeExperienceClassId;
  templateId: string;
  mistakeIndex: number;
  /** STORED mistake-demo title (the button's tooltip/context — ADR-002). */
  titleBg: string;
}

/**
 * The wired seed matching one scenario-event's rule-code set (the why-panel
 * card seam): first seed whose mistake codeRefs are ALL inside `eventCodes`.
 * Codes are disjoint across events (scenarioForCode maps a code to ONE
 * event), so a seed matches at most one event. Null = no wired experience
 * for this event (only the six founder classes are wired today).
 */
export function mistakeExperienceSeedForEvent(
  eventCodes: ReadonlySet<string>,
): MistakeExperienceSeedRef | null {
  for (const seed of MISTAKE_EXPERIENCE_SEEDS) {
    const spec = scenarioById(seed.templateId);
    const mistake = spec?.mistakes[seed.mistakeIndex];
    // A pending trace has no red ghost to show — never offered.
    if (mistake === undefined || mistake.traceRef.pending === true) continue;
    if (mistake.codeRefs.every((code) => eventCodes.has(code))) {
      return {
        classId: seed.classId,
        templateId: seed.templateId,
        mistakeIndex: seed.mistakeIndex,
        titleBg: mistake.titleBg,
      };
    }
  }
  return null;
}
