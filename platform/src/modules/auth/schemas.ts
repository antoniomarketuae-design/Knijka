import { z } from "zod";

/** Normalized e-mail: trimmed + lowercased before the format check, so
 *  "Ivan@Mail.BG " and "ivan@mail.bg" are the same account. */
const emailSchema = z
  .string({ error: "Имейлът е задължителен." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Невалиден имейл адрес." }));

export const registerInputSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Паролата е задължителна." })
    .min(8, { error: "Паролата трябва да е поне 8 знака." })
    .max(72, { error: "Паролата е твърде дълга." }), // bcrypt input limit
  name: z
    .string({ error: "Името е задължително." })
    .trim()
    .min(1, { error: "Името е задължително." })
    .max(100, { error: "Името е твърде дълго." }),
  birthYear: z.coerce
    .number({ error: "Невалидна година на раждане." })
    .int({ error: "Невалидна година на раждане." })
    .min(1950, { error: "Годината на раждане трябва да е между 1950 и 2012." })
    .max(2012, { error: "Годината на раждане трябва да е между 1950 и 2012." }),
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
