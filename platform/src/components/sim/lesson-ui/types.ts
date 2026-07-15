/**
 * Shared types of the lesson UI (select screen + play shell + SceneSlot).
 * Pure types — no logic; the lesson business logic lives in @/modules/sim.
 */

import type { LessonSpec, QuizFrequency } from "@/modules/sim/lessons";
import type { SessionEndConcept } from "@/modules/sim/hud";

// ---------------------------------------------------------------------------
// In-sim micro-quiz difficulty setting (persisted like the quality preset)
// ---------------------------------------------------------------------------

export const MICRO_QUIZ_FREQUENCIES: ReadonlyArray<{
  id: QuizFrequency;
  labelBg: string;
}> = [
  { id: "off", labelBg: "Изкл." },
  { id: "occasional", labelBg: "Понякога" },
  { id: "frequent", labelBg: "Често" },
];

/** localStorage key for the persisted micro-quiz frequency. */
export const MICRO_QUIZ_STORAGE_KEY = "sim.quizFrequency";

/** Client-safe result of the submitMicroQuizAnswer server action. */
export interface MicroQuizAnswerResult {
  correct: boolean;
  correctOptionIds: string[];
  explanationBg: string;
  lawRefs: Array<{ act: string; ref: string }>;
}

/**
 * Render quality preset. The environment workstream owns what each preset
 * means (shadows, draw distance, post-processing); the UI only selects it
 * and hands it to the SceneSlot untouched.
 */
export type QualityPreset = "low" | "medium" | "high";

export const QUALITY_PRESETS: ReadonlyArray<{ id: QualityPreset; labelBg: string }> = [
  { id: "low", labelBg: "Ниско" },
  { id: "medium", labelBg: "Средно" },
  { id: "high", labelBg: "Високо" },
];

/** localStorage key for the persisted quality preset. */
export const QUALITY_STORAGE_KEY = "sim.quality";

/** One lesson-select card: the spec + the student's progression on it. */
export interface LessonEntryView {
  lesson: LessonSpec;
  unlocked: boolean;
  passed: boolean;
  attempts: number;
  /** Fewest penalty points so far (lower is better); null before any attempt. */
  bestScore: number | null;
}

/**
 * S1 — one „Сценарии" catalog card (doc 76 §8), serializable server → client:
 * the template's card copy + the student's per-level progression (computed
 * server-side in page.tsx via scenarioLevelProgress from persisted sessions;
 * the same pure fold the save action's soft gate runs).
 */
export interface ScenarioCatalogEntry {
  templateId: string;
  titleBg: string;
  objectiveBg: string;
  family: string;
  tagsBg: string[];
  levels: Array<{
    level: 1 | 2 | 3 | 4 | 5;
    unlocked: boolean;
    attempts: number;
    bestStars: 1 | 2 | 3 | null;
  }>;
}

/** Result of the finish-lesson server action (actions.ts). */
export type FinishLessonActionResult =
  | {
      ok: true;
      sessionId: string;
      debriefText: string;
      concepts: SessionEndConcept[];
      /** Always null until gamification accepts sim_lesson events. */
      xpEarned: number | null;
    }
  | {
      ok: false;
      /** LEVEL_LOCKED (S1): a scenario level whose previous rung has no ≥2★
       *  session yet — the server refuses to persist (soft gate, doc 76 §8). */
      code: "INVALID_INPUT" | "UNKNOWN_LESSON" | "SAVE_FAILED" | "LEVEL_LOCKED";
    };
