import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { registerInputSchema, type RegisterInput } from "./schemas";
import { EmailTakenError, getAuthStore } from "./store";
import type { SessionUser } from "./types";

/** Exported so the password RESET path (reset.ts) hashes at exactly the same
 *  cost — two different work factors in one product would mean a password's
 *  strength silently depended on which screen set it. */
export const BCRYPT_ROUNDS = 12;

/**
 * Real bcrypt hash of a throwaway string. When the e-mail is unknown we still
 * run one bcrypt compare against this, so login timing does not reveal
 * whether an account exists (user-enumeration hardening, GDPR minors).
 */
const DUMMY_HASH = "$2b$12$eHX.QQBbaeXfFdx9sT5Use15A2h5.d6fyKpeQ0FmxzCkIyTfVmz7m";

export type RegisterResult =
  | { ok: true; user: SessionUser }
  | {
      ok: false;
      error: "invalid_input";
      fieldErrors: Partial<Record<keyof RegisterInput, string[]>>;
    }
  | { ok: false; error: "email_taken" };

/**
 * Validates raw input (zod) and creates the user with a bcrypt password hash
 * and consentAt = now. Duplicate e-mail is detected via the DB unique
 * constraint (race-safe), not a pre-check — the store is what maps that
 * constraint violation to EmailTakenError.
 */
export async function registerUser(input: unknown): Promise<RegisterResult> {
  const parsed = registerInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { ok: false, error: "invalid_input", fieldErrors };
  }

  const { email, password, name, birthYear } = parsed.data;
  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  try {
    const user = await getAuthStore().createUser({
      email,
      name,
      passwordHash,
      birthYear,
      consentAt: new Date(), // consent === true is guaranteed by the schema
      locale: "bg",
    });
    // Self-registration always creates a plain student (role defaults in the
    // schema); admin is granted only by seed/ops, never through this path.
    return { ok: true, user: { ...user, isAdmin: false } };
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { ok: false, error: "email_taken" };
    }
    throw err; // real failures (DB down etc.) surface as 500 in the route
  }
}

/**
 * Returns the user when e-mail + password match, otherwise null.
 * Deliberately indistinguishable between "no such e-mail", "OAuth-only
 * account (no passwordHash)" and "wrong password".
 *
 * This is also what a GDPR-erased account must fail (Art. 17): once
 * @/modules/privacy has deleted the User row there is nothing left to find
 * here, and the response is identical to a typo — the erased e-mail address
 * must not become an oracle for "this account once existed".
 *
 * It doubles as the re-authentication step in front of irreversible actions
 * (account deletion), which is why there is no second, subtly different
 * password check anywhere in the codebase.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await getAuthStore().findUserByEmail(normalizedEmail);

  if (!user?.passwordHash) {
    await compare(password, DUMMY_HASH); // equalize timing; result ignored
    return null;
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (!passwordOk) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.role === "admin",
  };
}
