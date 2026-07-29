/**
 * Should the chat composer be locked after a turn?
 *
 * `limited` is the tutor module's ONE wire flag for every "no answer this time"
 * outcome, and it now covers two genuinely different kinds:
 *
 *   TERMINAL   the burst guard, the daily cap, the pack's question allowance,
 *              the site-wide budget kill-switch, the spent free trial. Nothing
 *              the student does in the next minute changes any of them, so the
 *              composer locks and the reply above explains why.
 *
 *   RETRYABLE  the provider was unreachable — a 402 on an unfunded account, a
 *              locked account, a 429, a gateway 5xx, a timeout. The reply tells
 *              the student to try again in a moment, so locking the input would
 *              make the product contradict itself in the same breath.
 *
 * Kept out of TutorChat.tsx deliberately: this is a rule, and rules in this
 * codebase are unit-tested (CLAUDE.md — business logic out of components).
 */
export function shouldLockComposer(result: {
  limited: boolean;
  retryable?: boolean;
}): boolean {
  return result.limited && result.retryable !== true;
}
