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
import {
  CHECKOUT_CONSENT_TEXTS_BG,
  type CheckoutConsentKind,
  type PackId,
} from "@/modules/payments/view";
import { CONTACT_EMAIL } from "@/lib/legal/identity";
import { acceptCheckoutConsent } from "./actions";
import {
  consentFieldName,
  initialCheckoutConsentState,
} from "./consent-contract";

/** Short label above each box, so the wall of text has a handle. */
const CONSENT_TITLES_BG: Record<CheckoutConsentKind, string> = {
  parental_purchase: "Съгласие на родител",
  withdrawal_waiver: "Незабавен достъп",
};

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

  if (state.status === "accepted") {
    return <EmbeddedCheckoutForm pack={pack} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="pack" value={pack} />

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
              <input
                type="checkbox"
                name={consentFieldName(kind)}
                checked={ticked[kind] ?? false}
                onChange={(e) =>
                  setTicked((prev) => ({ ...prev, [kind]: e.target.checked }))
                }
                className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
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
        поле — пиши ни на {CONTACT_EMAIL} и ще активираме достъпа ти след
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
