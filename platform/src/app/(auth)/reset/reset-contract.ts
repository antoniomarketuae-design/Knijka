/**
 * Wire contract between /reset (page + server action) and its client form.
 *
 * The Bulgarian copy for a dead link lives here because BOTH sides need it and
 * they must agree: the page renders it when the link is already dead on
 * arrival, the action returns it when the link dies between opening the page
 * and submitting the form (expiry, or another tab getting there first).
 */

import type { ResetTokenProblem } from "@/modules/auth";

export const RESET_TOKEN_PROBLEM_BG: Record<ResetTokenProblem, string> = {
  // "Невалиден" and not "не съществува": the usual cause is a mail client that
  // wrapped the link, so the first thing to suggest is copying it whole.
  invalid_token:
    "Линкът не е валиден. Най-често се случва, когато е копиран само наполовина — отвори го директно от имейла или поискай нов.",
  expired: "Линкът е изтекъл. Поискай нов — новият важи един час.",
  used: "Този линк вече е използван. Ако паролата ти вече е сменена, влез с нея; ако не си бил(а) ти, поискай нов линк веднага.",
};

export type ResetPasswordActionResult =
  /** `email` is returned so the form can sign the student straight in — they
   *  have just proved control of the address AND typed the new password. */
  | { status: "ok"; email: string }
  | {
      status: "error";
      message: string;
      /** True when the link itself is the problem, so the UI offers /forgot
       *  instead of asking them to fix the password field. */
      needsNewLink: boolean;
    };
