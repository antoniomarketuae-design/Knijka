/**
 * What the payment card says when there is no payment card.
 *
 * This is deliberately a MODULE OF ITS OWN, free of `@stripe/*` imports, for
 * one reason: it must be renderable in a test. The whole finding was that the
 * failure path had no visible output at all — a throw inside Stripe's provider
 * left a 560px empty card on screen — so "there is Bulgarian copy and a way
 * forward for every failure the server can report" is exactly the property that
 * has to be asserted, not assumed.
 *
 * COPY RULES, all learned from what a person in front of a broken payment form
 * actually needs to know, in order:
 *   1. whether money left their account (always: it did not);
 *   2. what to do next (retry, sign in again, tick the boxes again);
 *   3. nothing else. No error codes, no apologies of paragraph length.
 */

/** Every failure `/api/checkout/embedded` can report, plus the client's own. */
export type CheckoutErrorCode =
  /** 409 — the consent aged past its TTL; the gate reopens, not this card. */
  | "CONSENT_REQUIRED"
  /** 502 — Stripe or our wiring. */
  | "CHECKOUT_UNAVAILABLE"
  /** 401 — the session expired while the form was open. */
  | "UNAUTHORIZED"
  /** 503 — the deployment may not take money at all right now. */
  | "STRIPE_NOT_CONFIGURED"
  /** Client-side: the request never reached us. */
  | "NETWORK";

/**
 * CONSENT_REQUIRED is absent ON PURPOSE: it is not an error the student reads
 * here. The consent gate above re-renders its checkboxes for it, and a second
 * message on the same screen would just be noise. Its absence from this map is
 * what makes the omission deliberate rather than forgotten — the type below
 * excludes it, so a future code CANNOT be added without copy.
 */
export const CHECKOUT_ERROR_COPY_BG: Record<
  Exclude<CheckoutErrorCode, "CONSENT_REQUIRED">,
  { title: string; body: string }
> = {
  CHECKOUT_UNAVAILABLE: {
    title: "Не успяхме да отворим формата за плащане",
    body: "Нищо не е платено и нищо не ти е удържано. Опитай пак — обикновено се оправя веднага.",
  },
  UNAUTHORIZED: {
    title: "Сесията ти изтече",
    body: "Влез отново в акаунта си и опитай пак. Нищо не е платено.",
  },
  STRIPE_NOT_CONFIGURED: {
    title: "Плащането е временно недостъпно",
    body: "Онлайн плащането не е активно в момента. Нищо не ти е удържано.",
  },
  NETWORK: {
    title: "Няма връзка със сървъра",
    body: "Провери интернет връзката си и опитай пак. Нищо не е платено.",
  },
};

/**
 * Narrow the server's `code` field. An unlabelled failure still has to land on
 * copy — silence is the bug we are fixing — so this never returns null: a 401
 * becomes UNAUTHORIZED (the one a student can act on) and everything else
 * becomes "ours, retry".
 */
export function toCheckoutErrorCode(
  value: unknown,
  status: number,
): CheckoutErrorCode {
  if (
    value === "CONSENT_REQUIRED" ||
    value === "CHECKOUT_UNAVAILABLE" ||
    value === "UNAUTHORIZED" ||
    value === "STRIPE_NOT_CONFIGURED"
  ) {
    return value;
  }
  return status === 401 ? "UNAUTHORIZED" : "CHECKOUT_UNAVAILABLE";
}

/** The card the student sees instead of Stripe's form. Never renders nothing. */
export function CheckoutFailureNotice({
  code,
  onRetry,
}: {
  code: Exclude<CheckoutErrorCode, "CONSENT_REQUIRED">;
  onRetry: () => void;
}) {
  const copy = CHECKOUT_ERROR_COPY_BG[code];
  return (
    <div
      role="alert"
      className="flex min-h-64 flex-col items-center justify-center gap-3 py-12 text-center"
    >
      <h2 className="text-lg font-black">{copy.title}</h2>
      <p className="max-w-sm text-sm text-muted">{copy.body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-accent mt-2 inline-flex"
      >
        Опитай пак
      </button>
    </div>
  );
}

/** The in-flight state: a tall card must never be blank without a sentence. */
export function CheckoutPendingNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-64 flex-col items-center justify-center gap-3 py-12 text-center"
    >
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
      />
      <p className="text-sm text-muted">Подготвяме сигурното плащане…</p>
    </div>
  );
}
