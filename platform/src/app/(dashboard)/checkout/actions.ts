"use server";

/**
 * Server action behind the consent step on /checkout (audit 2026-07-24, H-9).
 *
 * Like every server action this is a public POST endpoint, so the only trusted
 * input is the session: requireUser() decides WHO consents, the form decides
 * only WHICH boxes were ticked. Nothing here can be pointed at another account
 * no matter what is posted.
 *
 * Business logic (which consents a given buyer needs, what the wording is, how
 * it is stored) lives in @/modules/payments — this file only adapts it to the
 * useActionState shape the island wants.
 */

import { requireUser } from "@/modules/auth";
import {
  isPackId,
  recordCheckoutConsent,
  requiredCheckoutConsents,
  PaymentsError,
} from "@/modules/payments";
import {
  consentFieldName,
  type CheckoutConsentState,
} from "./consent-contract";

export async function acceptCheckoutConsent(
  _prev: CheckoutConsentState,
  formData: FormData,
): Promise<CheckoutConsentState> {
  const user = await requireUser();

  const pack = formData.get("pack");
  if (typeof pack !== "string" || !isPackId(pack)) {
    return { status: "error", message: "Неизвестен пакет. Върни се към плановете." };
  }

  // Re-derive the required set server-side (it depends on birthYear, which the
  // browser never sees) and read each box out of the form by its own name.
  const required = await requiredCheckoutConsents(user.id);
  const accepted = Object.fromEntries(
    required.map((kind) => [kind, formData.get(consentFieldName(kind)) === "on"]),
  );

  try {
    await recordCheckoutConsent(user.id, pack, accepted);
  } catch (err) {
    if (err instanceof PaymentsError && err.code === "CONSENT_REQUIRED") {
      return {
        status: "error",
        message:
          "Отбележи всички полета по-горе, за да продължим към плащането.",
      };
    }
    // Anything else is ours, not the student's — log it, say so plainly.
    console.error("checkout: failed to record consent", err);
    return {
      status: "error",
      message: "Нещо се обърка при записването. Опитай пак след малко.",
    };
  }

  return { status: "accepted" };
}
