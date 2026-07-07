/**
 * Wire DTOs between the tutor server action / page and the chat component.
 * Deliberately minimal — exactly what the UI renders, nothing more.
 */

export interface TutorChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Epoch ms. */
  ts: number;
}

export interface TutorAskDto {
  reply: string;
  /** Law citations validated against the retrieved materials. */
  citations: { act: string; ref: string }[];
  /** True when the daily question budget was reached (reply is the notice). */
  limited: boolean;
}
