"use client";

/**
 * The consent step in front of the payment form (audit 2026-07-24, H-9).
 *
 * Two things the Terms have always promised and the code never asked for: a
 * parent's approval when the buyer may still be under 18 (ЗЛС makes that
 * contract avoidable otherwise), and an explicit waiver of the 14-day
 * withdrawal right in exchange for instant access (ЗЗП чл. 57, т. 13).
 *
 * The payment UI is not merely hidden until both are ticked — it is not
 * MOUNTED. Stripe's embedded form only ever asks our server for a
 * client_secret after the consent is stored, and the server refuses to mint
 * one otherwise (modules/payments/checkout.ts). So the checkbox is a real
 * gate, not a decoration a devtools user can step around.
 *
 * Copy rule: the wording next to each box is imported, never retyped. What is
 * on screen and what ends up in the ConsentEvent row must be the same string —
 * a consent whose stored text differs from what the student read is worse than
 * no consent at all.
 *
 * It comes from `@/modules/payments/view`, not the main barrel: the barrel
 * reaches the entitlement store and so the `pg` driver, which a browser bundle
 * cannot resolve at all (view.ts has the details).
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { EmbeddedCheckoutForm } from "@/components/payments/EmbeddedCheckoutForm";
import { ContactEmail } from "@/components/legal/ContactEmail";
import { CheckControl } from "@/components/ui/CheckControl";
import {
  CHECKOUT_CONSENT_TEXTS_BG,
  type CheckoutConsentKind,
  type PackId,
} from "@/modules/payments/view";
import { acceptCheckoutConsent } from "./actions";
import {
  checkoutStep,
  consentFieldName,
  initialCheckoutConsentState,
} from "./consent-contract";

/** Short label above each box, so the wall of text has a handle. */
const CONSENT_TITLES_BG: Record<CheckoutConsentKind, string> = {
  parental_purchase: "Съгласие на родител",
  withdrawal_waiver: "Незабавен достъп",
};

/**
 * Shown when the payment step came back with 409 CONSENT_REQUIRED — i.e. the
 * student did exactly what this gate asks for (left to fetch a parent) and the
 * 60-minute TTL ran out while she was away. It must not read as a fault: the
 * whole message is "tick again, nothing was charged".
 */
export const CONSENT_EXPIRED_BG =
  "Съгласието важи 60 минути и изтече, докато те нямаше. Нищо не е платено — отбележи полетата пак и продължи.";

export function CheckoutConsentGate({
  pack,
  required,
}: {
  pack: PackId;
  /** Decided on the server from birthYear — the browser never sees the year. */
  required: CheckoutConsentKind[];
}) {
  const [state, formAction, pending] = useActionState(
    acceptCheckoutConsent,
    initialCheckoutConsentState,
  );
  // Mirrors the boxes so the button can be disabled before a round-trip. The
  // server checks the same thing again — this is only politeness.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const allTicked = required.every((kind) => ticked[kind]);

  /**
   * Set when the payment step answered 409: the stored consent aged past
   * CHECKOUT_CONSENT_TTL_MINUTES while the student was away fetching a parent.
   *
   * It has to be state of its OWN and not something derived from `state`,
   * because `useActionState` still holds "accepted" — the consent really was
   * recorded, it simply no longer authorises a payment. This flag is what turns
   * the gate back into the checkboxes, so the one click the flow assumes ("just
   * tick again") actually exists on screen instead of only in a code comment.
   */
  const [consentExpired, setConsentExpired] = useState(false);

  if (checkoutStep(state, consentExpired) === "payment") {
    return (
      <EmbeddedCheckoutForm
        pack={pack}
        onConsentExpired={() => {
          setConsentExpired(true);
          // Un-tick, deliberately: re-consenting must be a fresh, deliberate
          // act. A box that is still ticked from an hour ago is not consent to
          // a payment happening now.
          setTicked({});
        }}
      />
    );
  }

  return (
    <form
      // Re-submitting clears the expiry flag first, so a successful second pass
      // through the action mounts the payment form again instead of bouncing
      // off a stale flag.
      action={(formData: FormData) => {
        setConsentExpired(false);
        formAction(formData);
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="pack" value={pack} />

      {consentExpired && (
        <p
          role="alert"
          className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm font-medium text-warning"
        >
          {CONSENT_EXPIRED_BG}
        </p>
      )}

      <div>
        <h2 className="text-lg font-black">Преди да платиш</h2>
        <p className="mt-1 text-sm text-muted">
          Две неща, които трябва да потвърдиш. Отнема 10 секунди и е
          задължително по закон.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {required.map((kind) => (
          <li key={kind}>
            <label className="flex cursor-pointer gap-3 rounded-xl border border-border bg-surface-2/40 p-4 transition hover:border-accent/60 motion-reduce:transition-none">
              {/* Appearance only. The name, the checked state and the default
                  (unticked — a pre-ticked consent is not consent) are exactly
                  what they were; only the box the student looks at changed,
                  from one the browser drew at 1.66 : 1 to one we draw. Kept at
                  20px rather than the 16px default because this is the legal
                  gate, not an option in a list. */}
              <CheckControl
                type="checkbox"
                name={consentFieldName(kind)}
                checked={ticked[kind] ?? false}
                onChange={(e) =>
                  setTicked((prev) => ({ ...prev, [kind]: e.target.checked }))
                }
                size="size-5"
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-bold">{CONSENT_TITLES_BG[kind]}</span>
                <span className="mt-1 block text-muted">
                  {CHECKOUT_CONSENT_TEXTS_BG[kind]}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/* The Terms offer an alternative to the waiver (access after the 14
          days). We do not build a delayed-activation flow for it — we say so
          and give the address that handles it, instead of quietly pretending
          the choice does not exist. */}
      <p className="text-xs text-muted">
        Ако предпочиташ да запазиш правото си на отказ, не отбелязвай второто
        поле — пиши ни на <ContactEmail /> и ще активираме достъпа ти след
        14-дневния срок. Подробностите са в{" "}
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          Общите условия
        </Link>
        .
      </p>

      {state.status === "error" && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !allTicked}
        className="btn-accent w-full disabled:opacity-50"
      >
        {pending ? "Момент…" : "Продължи към плащането"}
      </button>
    </form>
  );
}
