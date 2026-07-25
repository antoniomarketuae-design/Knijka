/**
 * Password reset — the recovery path the product shipped without (audit
 * 2026-07-24, H-14: "a locked-out paying student is an instant refund and a
 * bad review"). The login page pointed at a manual contact channel, and the
 * inbox behind it does not exist.
 *
 * The whole design in five decisions:
 *
 * 1. THE SECRET NEVER TOUCHES THE DATABASE. 32 bytes of `randomBytes` go into
 *    the e-mail; only sha256 of them is stored. A leaked backup, a support
 *    person with read access, or a `SELECT *` in a log therefore hands over
 *    nothing usable (see prisma/schema.prisma → PasswordResetToken).
 * 2. SINGLE USE IS ENFORCED BY THE DATABASE, not by a read-then-write here —
 *    `consumePasswordResetToken` is one conditional update, so two tabs
 *    submitting the same link produce exactly one reset.
 * 3. THE REQUEST STEP NEVER REVEALS WHETHER AN ACCOUNT EXISTS. Unknown e-mail,
 *    known e-mail and mail-provider failure all return the same `{ ok: true }`
 *    and the same screen. Anything else turns this form into the user-
 *    enumeration oracle that `verifyCredentials` deliberately is not — and
 *    these users are minors (ADR-004).
 * 4. TWO INDEPENDENT LIMITS, because there are two different abuses: burning
 *    our mail quota from one source (per-IP) and mail-bombing one student's
 *    inbox from many (per-e-mail). Hitting the second one is SILENT for the
 *    same anti-enumeration reason as (3).
 * 5. MAIL FAILURE IS NOT THE STUDENT'S PROBLEM to see. It is logged; the
 *    screen says the same thing either way. Which is also why the console
 *    transport (@/modules/mail) is a legitimate production setting until the
 *    founder opens a provider account: recovery still works, the link is just
 *    in the server log.
 */

import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { passwordResetEmail, sendMail } from "@/modules/mail";
import {
  consumeRateLimit,
  type RateLimitRule,
} from "@/modules/security";
import {
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
  type ResetPasswordInput,
} from "./schemas";
import { getPasswordResetStore } from "./reset-store";
import { BCRYPT_ROUNDS } from "./service";
import { getAuthStore } from "./store";

/**
 * How long a link lives. An hour is the compromise this product actually
 * needs: long enough for a 17-year-old to notice the mail, find a computer and
 * think of a password; short enough that a link left sitting in a shared
 * mailbox stops being a key by the evening.
 */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** 256 bits — the same order as a session secret. Unguessable is the entire
 *  security property here, since possession of the link IS the proof. */
const TOKEN_BYTES = 32;

/**
 * The two budgets. They live here rather than in @/modules/security's policy
 * table because this flow is not routed through the proxy chokepoint (it is a
 * server action, not an /api route) — the guard has to be in the code that
 * does the work or it is not a guard at all.
 *
 * - per IP: five requests a quarter hour. A student who genuinely mistypes
 *   their address twice is unaffected; a script is capped at 20 mails an hour
 *   from one source.
 * - per e-mail: three an hour, so a bored classmate cannot bury someone's
 *   inbox — while a student whose first mail was slow can still ask again.
 */
export const PASSWORD_RESET_IP_LIMIT: RateLimitRule = {
  name: "password-reset-ip",
  limit: 5,
  windowSec: 15 * 60,
};
export const PASSWORD_RESET_EMAIL_LIMIT: RateLimitRule = {
  name: "password-reset-email",
  limit: 3,
  windowSec: 60 * 60,
};

export type RequestPasswordResetResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid_input";
      fieldErrors: Partial<Record<"email", string[]>>;
    }
  | { ok: false; error: "rate_limited"; retryAfterSec: number };

/** Why a link cannot be used. Distinguishable on purpose — unlike login, none
 *  of these leaks anything, and "изтече" vs "невалиден" is the difference
 *  between asking for a new link and thinking the product is broken. */
export type ResetTokenProblem = "invalid_token" | "expired" | "used";

export type VerifyResetTokenResult =
  | { ok: true }
  | { ok: false; error: ResetTokenProblem };

export type ResetPasswordResult =
  | { ok: true; /** So the page can sign the student straight in. */ email: string }
  | {
      ok: false;
      error: "invalid_input";
      fieldErrors: Partial<Record<keyof ResetPasswordInput, string[]>>;
    }
  | { ok: false; error: ResetTokenProblem };

/** sha256 hex. The only transformation between the e-mail and the DB row. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Base URL for the link in the e-mail. Same source and fallback as the Stripe
 *  redirects (payments/checkout.ts) — one wrong host and every reset 404s. */
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/** The link exactly as the student receives it. Exported for the tests, which
 *  is also the only way to prove the token survives the round trip verbatim. */
export function passwordResetUrl(token: string): string {
  return `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
}

/**
 * Step 1: „Забравена парола?" — issue a link if the address belongs to an
 * account, and say nothing about whether it did.
 *
 * `ip` comes from the caller (the server action reads it from the request
 * headers via @/modules/security clientIp); an absent one shares a bucket
 * rather than disabling the limit.
 */
export async function requestPasswordReset(
  input: unknown,
  options: { ip?: string; now?: Date } = {},
): Promise<RequestPasswordResetResult> {
  const parsed = forgotPasswordInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { ok: false, error: "invalid_input", fieldErrors };
  }

  const { email } = parsed.data;
  const now = options.now ?? new Date();

  const perIp = consumeRateLimit(
    options.ip ?? "unknown",
    PASSWORD_RESET_IP_LIMIT,
    now.getTime(),
  );
  if (!perIp.allowed) {
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSec: perIp.retryAfterSec,
    };
  }

  const perEmail = consumeRateLimit(
    email,
    PASSWORD_RESET_EMAIL_LIMIT,
    now.getTime(),
  );
  // Silent stop: telling the caller "too many for THIS address" would confirm
  // the address is worth flooding, and would differ from the unknown-address
  // answer. The student who really asked four times has three live links.
  if (!perEmail.allowed) return { ok: true };

  // The lookup is a plain login-shaped read (AuthStore); only the token write
  // needs the reset seam.
  const user = await getAuthStore().findUserByEmail(email);

  // Unknown address: stop here, return the same shape. No timing equalisation
  // is attempted — unlike login there is no bcrypt on the found path either,
  // so the two branches are already within noise of each other.
  if (!user) return { ok: true };

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
  );

  // Earlier links are deliberately left alive: a student who clicks "изпрати
  // отново" because the first mail was slow must not find the first link dead
  // when it finally arrives. Each is single-use, all die at the reset, and the
  // per-e-mail budget caps how many can exist at once.
  await getPasswordResetStore().createToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  // Failure is logged inside sendMail and swallowed here on purpose (see the
  // header, decision 5): the answer must not depend on the mail server.
  await sendMail(
    passwordResetEmail({
      to: user.email,
      resetUrl: passwordResetUrl(token),
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    }),
  );

  return { ok: true };
}

/**
 * Step 2a: is this link still worth showing a form for?
 *
 * Read-only — it must NOT consume the token, or merely opening the mail in a
 * client that pre-fetches links would burn the reset before the student typed
 * anything.
 */
export async function verifyPasswordResetToken(
  token: string,
  now: Date = new Date(),
): Promise<VerifyResetTokenResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "invalid_token" };

  const row = await getPasswordResetStore().findTokenByHash(hashToken(trimmed));
  if (!row) return { ok: false, error: "invalid_token" };
  if (row.usedAt) return { ok: false, error: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "expired" };
  }
  return { ok: true };
}

/**
 * Step 2b: actually change the password.
 *
 * Order matters and is not negotiable: CONSUME the token first, write the new
 * hash second. Reversed, a crash between the two would leave a working link
 * for a password that had already changed.
 *
 * Note what this cannot do: sessions are stateless JWTs (src/auth.ts), so an
 * attacker who is already signed in keeps that cookie until it expires. The
 * fix is session revocation, which needs a session table — out of scope here
 * and worth an ADR, not a silent half-measure.
 */
export async function resetPassword(
  input: unknown,
  options: { now?: Date } = {},
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { ok: false, error: "invalid_input", fieldErrors };
  }

  const { token, password } = parsed.data;
  const now = options.now ?? new Date();
  const store = getPasswordResetStore();

  const row = await store.findTokenByHash(hashToken(token));
  if (!row) return { ok: false, error: "invalid_token" };
  if (row.usedAt) return { ok: false, error: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "expired" };
  }

  // The atomic compare-and-set. Losing this race means another submit already
  // reset the password, which is exactly the "used" case.
  const consumed = await store.consumeToken(row.id, now);
  if (!consumed) return { ok: false, error: "used" };

  const user = await store.findUserById(row.userId);
  // The account was erased (GDPR Art. 17) between the mail and the click. The
  // token is spent either way; there is nothing to reset.
  if (!user) return { ok: false, error: "invalid_token" };

  await store.setPasswordHash(user.id, await hash(password, BCRYPT_ROUNDS));

  // Any other outstanding link for this account is now suspect — if a stranger
  // requested one too, this is the moment it stops mattering.
  await store.invalidateTokensForUser(user.id, now);

  return { ok: true, email: user.email };
}
