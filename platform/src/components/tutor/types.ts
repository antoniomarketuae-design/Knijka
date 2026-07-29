/**
 * Wire DTOs between the tutor server action / page and the chat component.
 * Deliberately minimal — exactly what the UI renders, nothing more.
 */

import type { TutorCitationRef } from "./TutorChatCitations";

export interface TutorChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Epoch ms. */
  ts: number;
  /**
   * Law citations the SERVER validated against the materials it retrieved for
   * this reply (ADR-002). The chat renders a citation chip for these and for
   * nothing else — see TutorChatCitations.ts. Absent on user messages and on
   * replies persisted before the tutor stored the list; both render chip-free.
   */
  citations?: TutorCitationRef[];
}

export interface TutorAskDto {
  reply: string;
  /** Law citations validated against the retrieved materials. */
  citations: TutorCitationRef[];
  /** True when the daily question budget was reached (reply is the notice). */
  limited: boolean;
  /**
   * True when `limited` came from a fault that clears on its own (the provider
   * being unreachable), rather than from a ceiling the student has genuinely
   * reached. The composer stays live for these — the reply tells them to try
   * again, so disabling the input would contradict it.
   */
  retryable?: boolean;
}
