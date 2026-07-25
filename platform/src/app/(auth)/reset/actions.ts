"use server";

/**
 * Server action behind /reset (audit 2026-07-24, H-14).
 *
 * Public and unauthenticated by definition — possession of the token IS the
 * authentication. Every rule about it (single use, expiry, atomic consumption)
 * is enforced in @/modules/auth; this file is the adapter.
 *
 * No rate limit here, unlike /forgot: the guessing surface is a 256-bit random
 * token, so a limiter would only add a way to lock a legitimate student out of
 * their own link. The limit belongs on the step that SENDS mail, and that is
 * where it is.
 */

import { resetPassword } from "@/modules/auth";
import {
  RESET_TOKEN_PROBLEM_BG,
  type ResetPasswordActionResult,
} from "./reset-contract";

export async function resetPasswordAction(
  token: string,
  password: string,
): Promise<ResetPasswordActionResult> {
  const result = await resetPassword({ token, password });

  if (result.ok) return { status: "ok", email: result.email };

  if (result.error === "invalid_input") {
    return {
      status: "error",
      message:
        result.fieldErrors.password?.[0] ??
        result.fieldErrors.token?.[0] ??
        "Провери полетата и опитай отново.",
      // A bad password is fixable in place; a bad token in the payload is not.
      needsNewLink: !result.fieldErrors.password,
    };
  }

  return {
    status: "error",
    message: RESET_TOKEN_PROBLEM_BG[result.error],
    needsNewLink: true,
  };
}
