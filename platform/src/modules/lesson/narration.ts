/**
 * THE AUTHORED-NARRATION SOCKET.
 *
 * WHY THIS EXISTS. This module composes 54 lessons out of material that was
 * already written and reviewed (compose.ts explains at length why). In
 * parallel, `docs/ai/85_LESSON_CONTENT_SPEC.md` and `content/lessons/*.json`
 * are a founder-commissioned WRITTEN LECTURE — the same 54 sections, the same
 * beat idea, but with a real teacher's paragraphs instead of a concept summary
 * read aloud, each beat carrying its own `grounds` provenance and starting at
 * `status: "draft"` like every other corpus.
 *
 * Those two things must not become two lesson engines. They are the same
 * engine with two sources of words, and this file is the seam:
 *
 *   - a beat's TEXT may come from the authored corpus when one covers it;
 *   - everything else — the sequencing, the board pick, the interruption
 *     grounding, the quiz, the state machine — is unchanged and shared.
 *
 * THE ids-ONLY INVARIANT SURVIVES, and that is the point of routing it here
 * rather than letting prose into a beat. A beat still carries no sentence: it
 * carries (lessonId, beatId), and the sentence is looked up in a corpus that
 * went through the content pipeline. Exactly the discipline `sayRef` already
 * has for `concepts.json` — a different file, the same contract.
 *
 * The provider is INJECTED rather than imported so this module does not take
 * a dependency on a loader that does not exist yet, and so the two lanes can
 * land in either order. With no provider registered, nothing changes: every
 * lesson is composed, exactly as today.
 */

import type { LawRef } from "@/lib/content/types";

export interface LessonNarration {
  /** The authored paragraph(s) for this beat, verbatim. */
  textBg: string;
  /** Citations the beat's own `grounds` carry. */
  lawRefs: LawRef[];
  /**
   * Content status, straight from the file. A beat that is not approved is
   * NOT spoken to a student — it falls back to the composed line. Reviewed
   * material outranks better-written material, always: a fluent, confident,
   * subtly wrong sentence about Bulgarian traffic law is the worst artefact
   * this product can produce, because a gap gets fixed and a confident error
   * gets memorised.
   */
  status: "draft" | "needs-review" | "approved";
}

export type LessonNarrationProvider = (
  lessonId: string,
  beatId: string,
) => LessonNarration | null;

let provider: LessonNarrationProvider | null = null;

/**
 * Register the authored-lecture corpus. Called once, server-side, by whatever
 * loads `content/lessons/*.json` — the same place `@/lib/content/loader`
 * registers the content repo. Pass null to unregister (tests).
 */
export function setLessonNarrationProvider(
  next: LessonNarrationProvider | null,
): void {
  provider = next;
}

/**
 * The authored line for a beat, or null.
 *
 * Null for: no provider, no entry, an empty string, or an entry that has not
 * been approved. Each of those falls back to the composed line, so a
 * half-written corpus degrades one beat at a time instead of leaving holes.
 */
export function lessonNarration(
  lessonId: string,
  beatId: string,
): LessonNarration | null {
  if (provider === null) return null;
  let entry: LessonNarration | null;
  try {
    entry = provider(lessonId, beatId);
  } catch {
    // A broken corpus must never take the classroom down with it.
    return null;
  }
  if (entry === null) return null;
  if (entry.status !== "approved") return null;
  if (entry.textBg.trim().length === 0) return null;
  return entry;
}
