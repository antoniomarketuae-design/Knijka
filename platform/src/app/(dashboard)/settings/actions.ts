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
import { changePassword, requireUser, signOutEverywhere } from "@/modules/auth";
import {
  eraseUserAccount,
  exportFileName,
  exportUserData,
  totalErasedRows,
} from "@/modules/privacy";
import { consumeUserRateLimit, RATE_LIMITS } from "@/modules/security";
import {
  DELETE_CONFIRM_PHRASE,
  initialDeleteAccountState,
  type DeleteAccountState,
  type ExportMyDataResult,
} from "./privacy-contract";
import {
  initialChangePasswordState,
  PASSWORD_CHANGED_REDIRECT,
  SIGNED_OUT_EVERYWHERE_REDIRECT,
  type ChangePasswordState,
} from "./password-contract";

// ---------------------------------------------------------------------------
// Password + session revocation
// ---------------------------------------------------------------------------

/**
 * „Смени паролата" — the authenticated change /settings used to say was not
 * ready.
 *
 * Identity is the SERVER session (requireUser) and nothing else: the form has
 * no e-mail and no user id, so no payload can point this at another account.
 * Re-authentication is verifyCredentials, via the module — the same check that
 * guards account deletion.
 *
 * On success it never returns: the change bumps User.sessionEpoch, which ends
 * EVERY session including this browser's, so signing out here is the honest
 * ending rather than leaving a cookie that will be refused on the next click.
 */
export async function changeMyPassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();

  // A bcrypt compare at cost 12 sits behind this form. The session is already
  // valid, so this is not a brute-force guard — it stops a signed-in caller
  // from spending a 2-core VPS's CPU in a loop on an endpoint the login
  // limiter never sees (server actions do not pass through src/proxy.ts).
  if (!consumeUserRateLimit(user.id, RATE_LIMITS.credentialCheck).allowed) {
    return {
      status: "error",
      message: "Твърде много опити подред. Изчакай малко и пробвай пак.",
    };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // Confirmation is a UI concern (the server has no business knowing it was
  // typed twice) — but it is re-checked here because the client island is not
  // the only thing that can post to a server action.
  if (password !== confirm) {
    return {
      status: "error",
      message: "Двете нови пароли не съвпадат.",
      field: "confirm",
    };
  }

  const result = await changePassword(user.id, user.email, {
    currentPassword,
    password,
  });

  if (!result.ok) {
    if (result.error === "invalid_input") {
      const message =
        result.fieldErrors.password?.[0] ??
        result.fieldErrors.currentPassword?.[0] ??
        "Провери полетата и опитай пак.";
      return {
        status: "error",
        message,
        field: result.fieldErrors.password ? "password" : "currentPassword",
      };
    }
    if (result.error === "wrong_password") {
      return {
        status: "error",
        message: "Текущата парола не е вярна. Паролата ти не е променена.",
        field: "currentPassword",
      };
    }
    if (result.error === "no_password") {
      return {
        status: "error",
        message:
          "Този акаунт няма парола за смяна. Използвай „Забравена парола?“ от екрана за вход.",
      };
    }
    return {
      status: "error",
      message: "Не намерихме акаунта. Опитай да влезеш отново.",
    };
  }

  // Throws NEXT_REDIRECT — must stay outside any try/catch.
  await signOut({ redirectTo: PASSWORD_CHANGED_REDIRECT });
  return initialChangePasswordState; // unreachable; satisfies the return type
}

/**
 * „Изход от всички устройства" — revoke every session without changing the
 * password.
 *
 * The case a password change cannot serve: a student who left themselves signed
 * in on a school computer and remembers on the bus, and does not want to pick a
 * new password on a phone to fix it.
 */
export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireUser();
  await signOutEverywhere(user.id);
  await signOut({ redirectTo: SIGNED_OUT_EVERYWHERE_REDIRECT });
}

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
 * The budget here is NOT a brute-force guard, and this comment used to argue
 * against having one on exactly that basis: the caller already holds the
 * session, so guessing the password buys them nothing they do not have. What
 * it stops is the other thing — bcrypt at cost 12 is ~300 ms of CPU per call
 * on a 2-core VPS, a server action never reaches the proxy where every other
 * budget is taken, and the login limiter therefore never sees this. Shared with
 * the password change, because they are the same expense.
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

  if (!consumeUserRateLimit(user.id, RATE_LIMITS.credentialCheck).allowed) {
    return {
      status: "error",
      message: "Твърде много опити подред. Изчакай малко и пробвай пак.",
    };
  }

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
