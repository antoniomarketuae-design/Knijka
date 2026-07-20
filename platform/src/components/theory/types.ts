import type { LawRef } from "@/lib/content/types";
import type { SessionReason, WhyPanelSimRef } from "@/modules/learning";

/**
 * Client-safe DTOs for the practice flow. The learning module's
 * SessionQuestion carries the full Question — including which options are
 * correct — so the server page maps it to this shape before it ever reaches
 * the client. Correct answers only travel back AFTER a submission.
 */

export interface PracticeOptionDto {
  id: string;
  textBg: string;
}

export interface PracticeQuestionDto {
  id: string;
  type: "single" | "multi";
  /** Official exam weight (1|2|3). */
  points: 1 | 2 | 3;
  textBg: string;
  options: PracticeOptionDto[];
  /** Why the engine picked this question. */
  reason: SessionReason;
  conceptId: string;
  conceptTitleBg: string;
  /** Topic of the concept — lets the summary link back to topic practice. */
  topicSlug: string | null;
  topicTitleBg: string | null;
}

/** Return shape of the submitPracticeAnswer server action. */
export interface PracticeSubmitResult {
  correct: boolean;
  correctOptionIds: string[];
  explanationBg: string;
  lawRefs: LawRef[];
  /** Avg mastery across the question's concepts before the answer (0..1). */
  masteryBefore: number;
  /** Avg mastery across the question's concepts after the answer (0..1). */
  masteryAfter: number;
  /** THEO-2 why-panel: the drill whose RECORDED mistake demo shows this
   *  question's fault (resolveWhyPanel); null when no scenario event or no
   *  recorded demo covers the question — the panel shows text + citations. */
  sim: WhyPanelSimRef | null;
}
