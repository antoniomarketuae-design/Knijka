/**
 * Public API of the `auth` module (docs/architecture/05).
 * Other modules / route handlers / components import ONLY from here —
 * deep imports into this module are a review-blocking violation.
 *
 * (Exception by design: `src/auth.ts` — the NextAuth wiring — deep-imports
 * `./service` and `./schemas` to avoid an import cycle with `./session`,
 * which itself needs `auth()` from `src/auth.ts`. It is part of this
 * module's infrastructure, not a consumer.)
 */
export { getSessionUser, requireUser } from "./session";
export { registerUser, verifyCredentials } from "./service";
export type { RegisterResult } from "./service";
export { registerInputSchema, loginInputSchema } from "./schemas";
export type { RegisterInput, LoginInput } from "./schemas";
export type { SessionUser } from "./types";

// Password reset (audit H-14). The pages under src/app/(auth)/forgot|reset are
// thin adapters over exactly these three functions.
export {
  requestPasswordReset,
  verifyPasswordResetToken,
  resetPassword,
  passwordResetUrl,
  RESET_TOKEN_TTL_MINUTES,
  PASSWORD_RESET_IP_LIMIT,
  PASSWORD_RESET_EMAIL_LIMIT,
} from "./reset";
export type {
  RequestPasswordResetResult,
  VerifyResetTokenResult,
  ResetPasswordResult,
  ResetTokenProblem,
} from "./reset";
export { forgotPasswordInputSchema, resetPasswordInputSchema } from "./schemas";
export type { ForgotPasswordInput, ResetPasswordInput } from "./schemas";

// Persistence seam (tests inject the in-memory fake; production uses Prisma)
export {
  setAuthStore,
  getAuthStore,
  InMemoryAuthStore,
  EmailTakenError,
} from "./store";
export type { AuthStore, AuthUserRecord, CreateUserInput } from "./store";

// Password-reset persistence — a separate seam on purpose (reset-store.ts
// explains why it is not six more methods on AuthStore).
export {
  setPasswordResetStore,
  getPasswordResetStore,
  InMemoryPasswordResetStore,
} from "./reset-store";
export type {
  PasswordResetStore,
  PasswordResetTokenRecord,
  CreatePasswordResetTokenInput,
  InMemoryResetToken,
} from "./reset-store";
