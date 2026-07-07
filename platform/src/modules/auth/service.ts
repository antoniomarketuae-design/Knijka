import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { registerInputSchema, type RegisterInput } from "./schemas";
import type { SessionUser } from "./types";

const BCRYPT_ROUNDS = 12;

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
 * constraint (race-safe), not a pre-check.
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
    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        birthYear,
        consentAt: new Date(), // consent === true is guaranteed by the schema
        locale: "bg",
      },
      select: { id: true, email: true, name: true },
    });
    return { ok: true, user };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" // unique constraint violation (email)
    ) {
      return { ok: false, error: "email_taken" };
    }
    throw err; // real failures (DB down etc.) surface as 500 in the route
  }
}

/**
 * Returns the user when e-mail + password match, otherwise null.
 * Deliberately indistinguishable between "no such e-mail", "OAuth-only
 * account (no passwordHash)" and "wrong password".
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    await compare(password, DUMMY_HASH); // equalize timing; result ignored
    return null;
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (!passwordOk) return null;

  return { id: user.id, email: user.email, name: user.name };
}
