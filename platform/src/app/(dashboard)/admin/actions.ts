"use server";

/**
 * The four support mutations, as server actions.
 *
 * IDENTITY AND AUTHORISATION COME FROM THE SERVER SESSION, TWICE. The page
 * gates on `user.isAdmin` (resolved from the DB inside getSessionUser, never
 * from the JWT) — and every action below gates again, because a server action
 * is a public POST endpoint. Gating only the page would leave four endpoints
 * that grant access, revoke access and delete rows reachable by anyone who has
 * ever seen the request shape. That is the same rule the simulator, hazard and
 * tutor actions follow, and it matters more here than anywhere else in the
 * product.
 *
 * The refusal is notFound(), not a 403, for the same reason
 * review/calibration/page.tsx uses it: an internal tool should not confirm its
 * own existence to a logged-in student.
 *
 * Business logic — what a grant may be, what may never be deleted, that
 * nothing happens without a written reason, and that every change writes an
 * AdminAction row naming the admin — lives in @/modules/admin. This file only
 * adapts forms to it and turns errors into a message on the screen the admin
 * is already looking at.
 */

import { notFound, redirect } from "next/navigation";
import {
  AdminError,
  deleteStuckAttempt,
  grantEntitlement,
  restoreFreeExam,
  revokeEntitlement,
  type AdminActor,
} from "@/modules/admin";
import { requireUser } from "@/modules/auth";

/** Same gate as the page, applied again at the endpoint. */
async function requireAdminActor(): Promise<AdminActor> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return { id: user.id, email: user.email };
}

/**
 * Where to send the admin back to. The e-mail is carried through so the
 * dossier they were reading is still on screen after the action — a support
 * tool that loses your place mid-ticket gets used wrong.
 */
function back(email: string, params: Record<string, string>): never {
  const qs = new URLSearchParams({ email, ...params });
  redirect(`/admin?${qs.toString()}`);
}

/** Bounded so a hand-crafted POST cannot stuff the ledger. */
function field(formData: FormData, name: string, max = 400): string {
  return String(formData.get(name) ?? "").slice(0, max);
}

/**
 * Runs one mutation and converts its outcome into a redirect.
 *
 * `redirect()` throws a control-flow signal that Next catches, so it MUST NOT
 * happen inside the try — a catch around it would swallow the navigation and
 * report the successful action as an error.
 */
async function run(
  email: string,
  ok: string,
  work: () => Promise<void>,
): Promise<never> {
  let outcome: Record<string, string>;
  try {
    await work();
    outcome = { msg: ok };
  } catch (err) {
    if (err instanceof AdminError) {
      outcome = { err: err.code };
    } else {
      // Never surface a raw error to the browser: these messages come from
      // Prisma and quote the connection string, password included.
      console.error("[admin] action failed:", err);
      outcome = { err: "FAILED" };
    }
  }
  back(email, outcome);
}

// ---------------------------------------------------------------------------

/** „Дай пакет" — a promo grant, never a fake purchase (see the module). */
export async function grantEntitlementAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  const email = field(formData, "email", 320);
  const userId = field(formData, "userId", 64);
  const pack = field(formData, "pack", 64);
  const reason = field(formData, "reason");

  await run(email, "granted", async () => {
    await grantEntitlement({ actor, userId, pack, reason });
  });
}

/** „Отнеми" — deletes the grant, never the receipt. */
export async function revokeEntitlementAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  const email = field(formData, "email", 320);
  const userId = field(formData, "userId", 64);
  const entitlementId = field(formData, "entitlementId", 64);
  const reason = field(formData, "reason");

  await run(email, "revoked", async () => {
    await revokeEntitlement({ actor, userId, entitlementId, reason });
  });
}

/**
 * „Върни безплатния изпит" — the button this whole surface was built for.
 * See @/modules/admin restoreFreeExam for the exact failure it undoes.
 */
export async function restoreFreeExamAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  const email = field(formData, "email", 320);
  const userId = field(formData, "userId", 64);
  const reason = field(formData, "reason");

  await run(email, "free-exam-restored", async () => {
    await restoreFreeExam({ actor, userId, reason });
  });
}

/** „Изтрий опита" — unfinished attempts only; a graded exam is not deletable. */
export async function deleteAttemptAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  const email = field(formData, "email", 320);
  const userId = field(formData, "userId", 64);
  const attemptId = field(formData, "attemptId", 64);
  const reason = field(formData, "reason");

  await run(email, "attempt-deleted", async () => {
    await deleteStuckAttempt({ actor, userId, attemptId, reason });
  });
}
