"use server";

/**
 * Server action behind /forgot (audit 2026-07-24, H-14).
 *
 * A public, unauthenticated POST — the one kind of endpoint that has to assume
 * every caller is hostile. Everything that decides anything lives in
 * @/modules/auth (token, limits, neutral answer); this file only turns a
 * request into arguments and a result into Bulgarian.
 *
 * The client IP is read HERE and not in the module: `headers()` is
 * Next-specific, and modules/auth must stay runnable from a unit test with no
 * framework around it.
 */

import { headers } from "next/headers";
import { requestPasswordReset } from "@/modules/auth";
import { clientIp, rateLimitMessageBg } from "@/modules/security";
import type { ForgotPasswordResult } from "./forgot-contract";

export async function requestPasswordResetAction(
  email: string,
): Promise<ForgotPasswordResult> {
  const ip = clientIp(await headers());
  const result = await requestPasswordReset({ email }, { ip });

  if (result.ok) return { status: "sent" };

  if (result.error === "rate_limited") {
    return { status: "error", message: rateLimitMessageBg(result.retryAfterSec) };
  }

  return {
    status: "error",
    message: result.fieldErrors.email?.[0] ?? "Въведи валиден имейл адрес.",
  };
}
