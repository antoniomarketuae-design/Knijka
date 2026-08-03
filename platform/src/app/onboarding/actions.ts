"use server";

/**
 * The onboarding answers, on their way to the User row.
 *
 * WHAT THIS FIXES. The flow used to write only localStorage. Register on a
 * phone, open on a laptop, and the exam date was gone — and the server never
 * had it in the first place, so „изпитът ти е след 6 дни" was a message this
 * product could not send to anybody. On a one-time four-month pack with
 * nothing to renew, that countdown is the strongest retention signal we
 * collect. `onboardedAt` is stamped in the same write, which turns "how many
 * registrations activated?" into one query instead of a guess.
 *
 * UNTRUSTED ENTRY POINT. A server action is a POST against the page, reachable
 * by anyone who can send the same request (next/docs 01-app/02-guides/
 * server-actions.md §Security). So:
 *   - identity is the SERVER session and nothing else — the client never sends
 *     a user id, so no payload can point this at someone else's row;
 *   - the answers are validated in @/lib/onboarding/service, not trusted;
 *   - the return value is the three answers this student just gave, nothing
 *     wider than the UI renders.
 *
 * ANONYMOUS IS NOT AN ERROR. /onboarding sits outside the auth matcher on
 * purpose (see page.tsx), so someone can reach the flow before signing in.
 * That caller gets `saved: false` and keeps the localStorage mirror; they are
 * not redirected mid-question and nothing throws.
 */

import { getSessionUser } from "@/modules/auth";
import { consumeUserRateLimit, RATE_LIMITS } from "@/modules/security";
import {
  readOnboarding,
  saveOnboardingAnswers,
  type OnboardingAnswers,
  type OnboardingSnapshot,
} from "@/lib/onboarding/service";

const ANONYMOUS: OnboardingSnapshot = {
  examDate: null,
  dailyGoalMin: null,
  onboarded: false,
};

export interface SaveOnboardingResult {
  /** Did anything reach the row? False for anonymous or invalid input. */
  saved: boolean;
}

/**
 * Persist one step's answer (and, on the last step, the `onboardedAt` stamp).
 *
 * Called from an event handler inside startTransition — Next dispatches
 * actions one at a time per client, so three quick steps queue rather than
 * race (server-actions.md §Sequential dispatch).
 */
export async function saveOnboardingAction(
  answers: OnboardingAnswers,
): Promise<SaveOnboardingResult> {
  const user = await getSessionUser();
  if (!user) return { saved: false };

  if (!consumeUserRateLimit(user.id, RATE_LIMITS.onboarding).allowed) {
    return { saved: false };
  }

  // Only the three fields, re-read off the payload by name: an action argument
  // is deserialized client input, and passing it through whole would let a
  // caller post keys the store would forward into `data`.
  const saved = await saveOnboardingAnswers(user.id, {
    examDate: typeof answers?.examDate === "string" ? answers.examDate : undefined,
    dailyGoalMin:
      typeof answers?.dailyGoalMin === "number" ? answers.dailyGoalMin : undefined,
    completed: answers?.completed === true,
  });
  return { saved };
}

/**
 * The server's answers, for a device whose local mirror is cold.
 *
 * This is the cross-device fix made visible: the laptop that never ran the
 * flow gets the phone's exam date the first time it opens the dashboard. It is
 * deliberately NOT part of the dashboard render — that page is held to a
 * three-query budget (lib/dashboard/queryBudget.test.ts) and this read would
 * be a fourth on every paint, for a chip that only needs filling once per
 * device.
 */
export async function readOnboardingAction(): Promise<OnboardingSnapshot> {
  const user = await getSessionUser();
  if (!user) return ANONYMOUS;
  if (!consumeUserRateLimit(user.id, RATE_LIMITS.onboarding).allowed) {
    return ANONYMOUS;
  }
  return readOnboarding(user.id);
}
