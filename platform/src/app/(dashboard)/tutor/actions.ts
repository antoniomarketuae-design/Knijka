"use server";

/**
 * Server action for the AI tutor — a thin, guarded adapter over
 * @/modules/tutor (module boundary rules, docs/architecture/05). All tutor
 * logic (budget, retrieval, prompting, cost booking) lives in the module;
 * this file only authenticates, validates the wire input and shapes the
 * response for the client.
 */

import "@/lib/content/loader";
import type { TutorAskDto } from "@/components/tutor/types";
import { requireUser } from "@/modules/auth";
import { FREE_TUTOR_LIFETIME_MESSAGES } from "@/modules/payments";
import {
  askTutor,
  getThread,
  isTutorEnabled,
  TUTOR_MAX_INPUT_LENGTH,
} from "@/modules/tutor";
import { getTutorAccess } from "./trial";

/**
 * Shown instead of an answer when a free student's trial is spent. Phrased as
 * the Учител speaking, because that is where it lands — inside the chat, in
 * his voice — and it names the exact next step rather than a dead „нямаш
 * достъп".
 */
const TRIAL_SPENT_REPLY_BG = `Това бяха безплатните ти ${FREE_TUTOR_LIFETIME_MESSAGES} въпроса към мен. С пакет мога да отговарям без ограничение — виж „Планове“. Упражненията остават безплатни и продължават да ти обясняват всяка грешка със закона.`;

export async function askTutorAction(message: string): Promise<TutorAskDto> {
  const user = await requireUser();

  // Server actions are a public POST endpoint — never trust the payload.
  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > TUTOR_MAX_INPUT_LENGTH
  ) {
    throw new Error("askTutorAction: invalid message");
  }
  if (!isTutorEnabled()) {
    throw new Error("askTutorAction: tutor is not enabled");
  }

  // C-3 free-trial gate, BEFORE any model spend. The page renders the paywall
  // instead of the chat, but an already-open tab keeps a live action handle —
  // so the allowance is re-counted here from the persisted thread on every
  // question. `limited` reuses the module's own "no answer this time" wire
  // flag, which the chat already understands: composer disabled, reply shown.
  const thread = await getThread(user.id);
  const trial = await getTutorAccess(user, thread.messages);
  if (!trial.allowed) {
    return { reply: TRIAL_SPENT_REPLY_BG, citations: [], limited: true };
  }

  const result = await askTutor(user.id, message);

  // Constrain the return value to exactly what the UI renders.
  return {
    reply: result.reply,
    citations: result.citations.map(({ act, ref }) => ({ act, ref })),
    limited: result.limited,
    retryable: result.retryable,
  };
}
