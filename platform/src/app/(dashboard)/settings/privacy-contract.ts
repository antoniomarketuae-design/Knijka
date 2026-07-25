/**
 * Shared wire contract between the GDPR server actions (actions.ts) and the
 * client island that drives them (privacy-controls.tsx).
 *
 * It lives in its own module because a `"use server"` file may only export
 * async functions — a plain `export const` there is a build error, and these
 * two values have to be identical on both sides: the confirmation word is
 * rendered by the client AND re-checked by the server, which is the only
 * version that counts.
 */

/** Typed verbatim before an account is destroyed, so the final click cannot
 *  be muscle memory. Bulgarian, because the whole UI is (bg-BG). */
export const DELETE_CONFIRM_PHRASE = "ИЗТРИЙ";

export type ExportMyDataResult =
  | { ok: true; fileName: string; json: string }
  /** The session outlived the account (erased in another tab). */
  | { ok: false; error: "not_found" };

export type DeleteAccountState = {
  status: "idle" | "error";
  /** Bulgarian, ready to render. Empty when status === "idle". */
  message: string;
};

export const initialDeleteAccountState: DeleteAccountState = {
  status: "idle",
  message: "",
};
