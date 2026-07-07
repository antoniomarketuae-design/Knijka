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
