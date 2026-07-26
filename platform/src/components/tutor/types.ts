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
}
