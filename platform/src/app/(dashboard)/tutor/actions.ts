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
import { askTutor, isTutorEnabled, TUTOR_MAX_INPUT_LENGTH } from "@/modules/tutor";

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

  const result = await askTutor(user.id, message);

  // Constrain the return value to exactly what the UI renders.
  return {
    reply: result.reply,
    citations: result.citations.map(({ act, ref }) => ({ act, ref })),
    limited: result.limited,
  };
}
