"use server";

/**
 * Server actions for the GDPR rights controls on /settings (audit C-2).
 *
 * Both are untrusted POST endpoints (see the Next.js Server Actions security
 * notes): the ONLY identity input is the server session via requireUser() —
 * the client never sends a user id, so neither action can be pointed at
 * someone else's account no matter what is posted.
 *
 * Business logic lives in @/modules/privacy; this file only adapts it to the
 * form/useActionState shapes the settings UI needs.
 */

import { signOut } from "@/auth";
import { requireUser } from "@/modules/auth";
import {
  eraseUserAccount,
  exportFileName,
  exportUserData,
  totalErasedRows,
} from "@/modules/privacy";
import {
  DELETE_CONFIRM_PHRASE,
  initialDeleteAccountState,
  type DeleteAccountState,
  type ExportMyDataResult,
} from "./privacy-contract";

// ---------------------------------------------------------------------------
// Art. 15 / 20 — „Изтегли данните ми"
// ---------------------------------------------------------------------------

/**
 * Returns the user's full personal-data export as a JSON string. The client
 * island turns it into a Blob download — deliberately NOT a GET route, so the
 * file can never be fetched by a link someone else pastes, and no personal
 * data ever appears in a URL.
 */
export async function exportMyData(): Promise<ExportMyDataResult> {
  const user = await requireUser();

  const data = await exportUserData(user.id);
  if (!data) return { ok: false, error: "not_found" };

  return {
    ok: true,
    fileName: exportFileName(),
    // Pretty-printed: a 17-year-old (or their parent) should be able to open
    // this in any text editor and read it, not just feed it to a machine.
    json: JSON.stringify(data, null, 2),
  };
}

// ---------------------------------------------------------------------------
// Art. 17 — „Изтрий акаунта ми"
// ---------------------------------------------------------------------------

/**
 * Irreversibly deletes the signed-in account after password re-entry and a
 * typed confirmation, then signs the browser out.
 *
 * No rate limit here on purpose: the action already requires a valid session,
 * and someone holding the session gains nothing from guessing the password
 * that only guards this one button. Adding a counter would suggest a
 * protection that the login form (the actual brute-force surface) does not
 * have.
 *
 * On success this never returns — signOut() redirects, which is also what
 * clears the JWT cookie. Leaving a valid cookie pointing at a deleted user id
 * would keep every requireUser() page half-working until it expired.
 */
export async function deleteMyAccount(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();

  if (confirm !== DELETE_CONFIRM_PHRASE) {
    return {
      status: "error",
      message: `За потвърждение напиши точно ${DELETE_CONFIRM_PHRASE} в полето.`,
    };
  }
  if (!password) {
    return { status: "error", message: "Въведи паролата си, за да продължим." };
  }

  const result = await eraseUserAccount({
    userId: user.id,
    email: user.email, // from the session, never from the form
    password,
  });

  if (!result.ok) {
    if (result.error === "wrong_password") {
      return {
        status: "error",
        message: "Паролата не е вярна. Акаунтът ти е непокътнат.",
      };
    }
    if (result.error === "no_password") {
      return {
        status: "error",
        message:
          "Този акаунт няма парола, затова не можем да потвърдим самоличността ти тук. Пиши ни от страницата за контакт и ще го изтрием ръчно.",
      };
    }
    // not_found: already gone. Fall through to sign-out — insisting there is
    // nothing to delete would only confuse someone whose click did land.
  }

  if (result.ok) {
    // Receipt only, no PII: proof the erasure ran, safe to keep in the log.
    console.info(
      `[privacy] erased account ${result.receipt.userId} (${totalErasedRows(
        result.receipt.deleted,
      )} dependent rows) at ${result.receipt.erasedAt}`,
    );
  }

  // Throws NEXT_REDIRECT — must stay outside any try/catch.
  await signOut({ redirectTo: "/?deleted=1" });
  return initialDeleteAccountState; // unreachable; satisfies the return type
}
