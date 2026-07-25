import { z } from "zod";

/** Youngest allowed account: MIN_AGE years old this calendar year. Computed,
 *  never hardcoded — a fixed year silently raises the minimum age every
 *  January. Keep in sync with the register form's MIN_AGE. */
const MIN_AGE = 14;
const MIN_BIRTH_YEAR = 1950;
function maxBirthYear(): number {
  return new Date().getFullYear() - MIN_AGE;
}

/** Normalized e-mail: trimmed + lowercased before the format check, so
 *  "Ivan@Mail.BG " and "ivan@mail.bg" are the same account. */
const emailSchema = z
  .string({ error: "Имейлът е задължителен." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Невалиден имейл адрес." }));

/** Every place the product accepts a NEW password (registration, reset) uses
 *  exactly this — one definition, so the rules and the Bulgarian wording can
 *  never drift between the two screens. */
const passwordSchema = z
  .string({ error: "Паролата е задължителна." })
  .min(8, { error: "Паролата трябва да е поне 8 знака." })
  .max(72, { error: "Паролата е твърде дълга." }); // bcrypt input limit

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z
    .string({ error: "Името е задължително." })
    .trim()
    .min(1, { error: "Името е задължително." })
    .max(100, { error: "Името е твърде дълго." }),
  birthYear: z.coerce
    .number({ error: "Невалидна година на раждане." })
    .int({ error: "Невалидна година на раждане." })
    .min(MIN_BIRTH_YEAR, {
      error: `Годината на раждане трябва да е между ${MIN_BIRTH_YEAR} и ${maxBirthYear()}.`,
    })
    // Refinement (not .max) so a long-lived server process stays correct
    // across a New Year — the bound is evaluated per parse, not at import.
    .refine((year) => year <= maxBirthYear(), {
      error: `Годината на раждане трябва да е между ${MIN_BIRTH_YEAR} и ${maxBirthYear()}.`,
    }),
  // GDPR: explicit consent is a hard gate — the account cannot exist without it.
  consent: z.literal(true, {
    error: "Трябва да се съгласиш с обработката на личните ти данни.",
  }),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

/** Login only checks shape; credential correctness is decided in verifyCredentials.
 *  No min-length here — a too-short password must fail exactly like a wrong one. */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

/** „Забравена парола?" — only an address is asked for, and the answer is the
 *  same whether or not it exists (see requestPasswordReset). */
export const forgotPasswordInputSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

/**
 * The reset itself. `token` is only shape-checked here — whether it is real,
 * unexpired and unspent is a database question, answered in reset.ts. A length
 * bound is still worth having: it stops a megabyte of "token" reaching the
 * hasher, and an empty string can never be treated as a lookup key.
 */
export const resetPasswordInputSchema = z.object({
  token: z
    .string({ error: "Линкът е невалиден." })
    .trim()
    .min(1, { error: "Линкът е невалиден." })
    .max(200, { error: "Линкът е невалиден." }),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
