/**
 * What the student is TOLD about the tutor allowance their pack buys.
 *
 * The rule and the number live in @/modules/payments (quota.ts
 * checkTutorPackAllowance); only the voice lives here, beside
 * TUTOR_BUDGET_REPLY_BG, because it lands in the same place and in the same
 * person: inside the chat, as the Учител speaking.
 *
 * Doc 81 §5.3 is specific about the shape, and doc 64 THEO-4 is why:
 *
 * 1. The counter appears ONLY in the last fifth of the allowance. 95% of
 *    students never see a number at all; the ones who do read „остават ти 47
 *    от 300 въпроса", which sounds generous. A balance shown on every reply
 *    reads as a taxi meter, and a student who does not ask because asking
 *    costs is precisely the failure requirement-zero exists to prevent.
 * 2. The unit is always „въпрос" — never money, never credits (§5.4).
 * 3. When it runs out the student gets a straight answer and the list of what
 *    still works: never an error, never a composer that silently does nothing.
 */

import { TUTOR_PACK_QUESTION_ALLOWANCE } from "@/modules/payments";
import type { TutorPackAllowance } from "@/modules/payments";

/**
 * How much of the allowance must be left before the student sees a number.
 * 0.2 of 300 = the last 60 questions — roughly the point where a student who
 * is genuinely going to run out can still change how they use the remainder.
 */
export const TUTOR_ALLOWANCE_NOTICE_FRACTION = 0.2;

/**
 * The counter line, or null when the student should not see one — which is
 * the answer in every case except "a pack holder, in the last fifth, with at
 * least one question left". At zero the reply below does the talking, so a
 * notice as well would be the same bad news twice.
 */
export function tutorAllowanceNoticeBg(
  allowance: Pick<TutorPackAllowance, "applies" | "remaining" | "limit">,
): string | null {
  if (!allowance.applies || allowance.remaining <= 0) return null;
  const threshold = Math.ceil(allowance.limit * TUTOR_ALLOWANCE_NOTICE_FRACTION);
  if (allowance.remaining > threshold) return null;
  return `Остават ти ${allowance.remaining} от ${allowance.limit} въпроса към Учителя в този пакет. Упражненията, изпитите и обясненията към тях не влизат в тази бройка — те са без ограничение.`;
}

/**
 * Shown instead of an answer once the pack's tutor questions are used up.
 *
 * `limit` rather than the constant because an account with two active packs
 * has two allowances, and quoting „300" at a student who was actually given
 * 600 is the kind of small lie that costs a support conversation.
 *
 * Same shape as TUTOR_BUDGET_REPLY_BG: what happened, and what still works.
 * It deliberately promises nothing about buying more — doc 81 §5.5 makes a
 * top-up conditional on six weeks of real usage data, and the Учител must not
 * pre-sell something that may never exist.
 */
export function tutorAllowanceSpentReplyBg(
  limit: number = TUTOR_PACK_QUESTION_ALLOWANCE,
): string {
  return `Това бяха ${limit}-те въпроса към мен, които влизат в пакета ти — стигна наистина далеч. Всичко останало в пакета работи докрай: упражненията, пробните изпити и обяснението със закона след всеки въпрос. Точно там се учи най-много — а аз пазя това, което вече си говорихме.`;
}
