/**
 * The AI tutor's free-trial gate — ONE decision, two call sites (the page and
 * askTutorAction).
 *
 * Audit C-3: /pricing sells „AI Учител — пълен достъп" in both packs and
 * promises free accounts only a „кратък пробен достъп", but every account got
 * the module's 30-questions-per-day cost budget forever, so the paid row was a
 * false claim. The trial is now a real, lifetime allowance
 * (FREE_TUTOR_LIFETIME_MESSAGES) enforced server-side.
 *
 * Why lifetime questions and not messages-per-day: see quota.ts — the tutor is
 * the one surface that spends model tokens per request.
 *
 * The count comes from the PERSISTED thread, never from the client. A student
 * cannot reset it by clearing storage, opening a second tab or replaying the
 * action: the only rows that count are the ones the tutor module itself wrote.
 */

import { isFeatureDisabled } from "@/lib/features";
import type { SessionUser } from "@/modules/auth";
import {
  checkTutorQuota,
  FREE_TUTOR_LIFETIME_MESSAGES,
  type TutorQuota,
} from "@/modules/payments";
import type { TutorMessage } from "@/modules/tutor";

/**
 * Questions this student has EVER sent. `messages` must come from
 * getThread(user.id) — the tutor's own store, which only records a question
 * after the model actually answered it (saveExchange), so a failed or budgeted
 * call never burns a trial slot.
 */
export function countLifetimeQuestions(messages: TutorMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

/**
 * How much tutor the account may use right now. Admins (role from the SERVER
 * session, like every other gate) are unlimited so the founder/test account can
 * exercise the tutor on staging without buying a pack.
 */
export async function getTutorAccess(
  user: SessionUser,
  messages: TutorMessage[],
): Promise<TutorQuota> {
  // DISABLED_FEATURES kill switch (src/lib/features.ts), before the admin
  // bypass and before any quota arithmetic. The tutor is the only surface that
  // spends real money per request, so „off" has to mean off for everyone,
  // including the founder — otherwise the switch that was flipped because the
  // bill ran away leaves the most expensive account still spending.
  //
  // `remaining: 0` is what makes this reach the ACTION and not only the page:
  // askTutorAction already refuses on `!allowed` before calling askTutor(), so
  // no model token is spent by a tab that was open when the switch flipped.
  // The action tells the student it is switched off rather than reusing the
  // trial-spent copy — see TUTOR_OFFLINE_REPLY_BG in actions.ts.
  if (isFeatureDisabled("tutor")) {
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_TUTOR_LIFETIME_MESSAGES,
      unlimited: false,
    };
  }
  if (user.isAdmin) {
    return {
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      limit: FREE_TUTOR_LIFETIME_MESSAGES,
      unlimited: true,
    };
  }
  return checkTutorQuota(user.id, countLifetimeQuestions(messages));
}
