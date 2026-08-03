/**
 * Shared wire contract between the password server actions (actions.ts) and the
 * client island that drives them (password-controls.tsx).
 *
 * Its own module for the same reason privacy-contract.ts is: a `"use server"`
 * file may only export async functions, so a plain `export const` there is a
 * build error — and both sides must agree on the shape exactly.
 */

export type ChangePasswordState = {
  status: "idle" | "error";
  /** Bulgarian, ready to render. Empty when status === "idle". */
  message: string;
  /** Which field to blame, so the form can point at it. */
  field?: "currentPassword" | "password" | "confirm";
};

export const initialChangePasswordState: ChangePasswordState = {
  status: "idle",
  message: "",
};

/**
 * Where a student lands after their password changes or they sign every device
 * out. Both revoke the CURRENT session too (that is what „навсякъде" means), so
 * the redirect is not a courtesy — the next request would bounce to /login
 * anyway, and arriving there with an explanation beats arriving there confused.
 */
export const PASSWORD_CHANGED_REDIRECT = "/login?changed=1";
export const SIGNED_OUT_EVERYWHERE_REDIRECT = "/login?revoked=1";
