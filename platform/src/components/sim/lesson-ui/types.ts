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
       *  session yet — the server refuses to persist (soft gate, doc 76 §8).
       *  NOT_SIGNED_IN: no session server-side. A CODE, never a redirect — a
       *  redirect thrown in a server action becomes a 303 the router follows,
       *  which replaced the whole drive screen with /login mid-drive (B39).
       *
       *  RATE_LIMITED (doc 91 S4): the per-user abuse budget on the save action
       *  is spent. It is NOT `SAVE_FAILED` and the difference is the student's,
       *  not the engineer's: SAVE_FAILED means the write was attempted and the
       *  database refused it — nothing the driver did caused it and nothing they
       *  can do fixes it. RATE_LIMITED means the write was never attempted,
       *  because they saved twenty drives inside ten minutes; it clears on its
       *  own and the same drive saves fine after a wait. Telling a throttled
       *  student their drive „failed to save" is a false statement about their
       *  data, and the one they would act on — by driving it again, immediately,
       *  which is precisely what spends the rest of the budget. */
      code:
        | "INVALID_INPUT"
        | "UNKNOWN_LESSON"
        | "SAVE_FAILED"
        | "RATE_LIMITED"
        | "LEVEL_LOCKED"
        | "NOT_SIGNED_IN";
    };
