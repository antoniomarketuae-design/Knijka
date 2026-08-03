/**
 * The four support operations, and the one read behind them.
 *
 * WHY THIS MODULE EXISTS AT ALL. Before it, every support case was psql over
 * SSH at 3am: hand-written UPDATEs against production, no record of who ran
 * them, and no undo. The failure that made it urgent is specific — a free
 * student taps „Започни пробен изпит", the phone drops connection, and
 * requireEntitlementForExam counts STARTED attempts, so the one lifetime free
 * exam is spent on a paper they never saw. The best conversion moment in the
 * product, turned into a bad review, remediable only by SQL.
 *
 * WHAT IT DELIBERATELY CANNOT DO. It cannot delete a graded attempt (that is a
 * student's record), cannot edit a Payment (that is the books — Bulgarian
 * accounting law, see the schema header), cannot read or set a password, and
 * cannot act without a written reason. Everything it CAN do writes an
 * AdminAction row in the same transaction, naming the admin.
 */

import { isAttemptExpired } from "@/modules/exam";
import {
  addMonths,
  FREE_MOCK_EXAM_LIMIT,
  isEntitlementActive,
  isPackId,
  PACK_ACCESS_MONTHS,
} from "@/modules/payments";
import { getAdminStore, type CreateAdminActionInput } from "./store";
import {
  ADMIN_GRANT_PROVIDER,
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  AdminError,
  type AdminActionKind,
  type AdminUserDossier,
} from "./types";

/** How much support history the dossier shows. Bounded — this is a screen. */
const HISTORY_LIMIT = 25;

/** The admin performing the action. Comes from the SERVER session, never the wire. */
export interface AdminActor {
  id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Input hygiene
// ---------------------------------------------------------------------------

/**
 * A support action with no stated reason is a mystery in six months, which is
 * exactly when someone asks why this account has free access. Enforced here,
 * in the module, and not only in the form — the server action is a public POST
 * endpoint like any other.
 */
function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < ADMIN_REASON_MIN) {
    throw new AdminError("REASON_REQUIRED", "A reason is required for every admin action");
  }
  return trimmed.slice(0, ADMIN_REASON_MAX);
}

function auditFor(
  actor: AdminActor,
  action: AdminActionKind,
  subjectId: string,
  targetRef: string | null,
  reason: string,
  detail?: unknown,
): CreateAdminActionInput {
  return {
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    subjectId,
    targetRef,
    reason,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Everything /admin shows about one account, found by e-mail — the only handle
 * a support ticket ever carries.
 *
 * Throws USER_NOT_FOUND rather than returning null so the route cannot forget
 * to branch. Deliberately does NOT return anything secret: no password hash,
 * no reset token, no birth year, no session. Support answering a ticket needs
 * to see entitlements, money, exams and tutor spend; it never needs to become
 * the student.
 */
export async function getUserDossier(
  email: string,
  now: Date = new Date(),
): Promise<AdminUserDossier> {
  const store = getAdminStore();
  const user = await store.findUserByEmail(email);
  if (!user) throw new AdminError("USER_NOT_FOUND", `No account for ${email}`);

  const [entitlements, payments, attempts, tutor, history] = await Promise.all([
    store.listEntitlements(user.id),
    store.listPayments(user.id),
    store.listAttempts(user.id),
    store.tutorSpend(user.id),
    store.listActions(user.id, HISTORY_LIMIT),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      freeExamGrants: user.freeExamGrants,
    },
    entitlements: entitlements.map((e) => ({
      id: e.id,
      pack: e.pack,
      provider: e.provider,
      providerRef: e.providerRef,
      purchasedAt: e.purchasedAt,
      expiresAt: e.expiresAt,
      // Computed with the SAME function the paywalls use, so the screen can
      // never say „active" about access the product is refusing.
      active: isEntitlementActive(e, now),
    })),
    // Field by field rather than a spread: `userId` exists on the record so
    // the store can filter on it, and has no business travelling on to a
    // screen that already knows whose account it is showing.
    payments: payments.map((p) => ({
      id: p.id,
      stripeSessionId: p.stripeSessionId,
      stripePaymentIntentId: p.stripePaymentIntentId,
      pack: p.pack,
      amountCents: p.amountCents,
      currency: p.currency,
      livemode: p.livemode,
      status: p.status,
      createdAt: p.createdAt,
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      score: a.score,
      maxScore: a.maxScore,
      passed: a.passed,
      status:
        a.finishedAt !== null
          ? "completed"
          : isAttemptExpired(a.startedAt, now)
            ? "expired"
            : "in-progress",
    })),
    tutor,
    freeExam: {
      // The same number requireEntitlementForExam counts, spelled out rather
      // than left for a human to infer at 3am.
      attempts: attempts.length,
      grants: user.freeExamGrants,
      allowance: FREE_MOCK_EXAM_LIMIT + user.freeExamGrants,
      hasFreeExamLeft: attempts.length < FREE_MOCK_EXAM_LIMIT + user.freeExamGrants,
    },
    history,
  };
}

// ---------------------------------------------------------------------------
// The four mutations
// ---------------------------------------------------------------------------

/**
 * Give an account a pack without a payment — the goodwill / beta-tester /
 * „it broke and they paid" lever.
 *
 * provider is ALWAYS "promo" (never "stripe"): the provider column is what
 * separates access that was bought from access that was given, and a grant
 * masquerading as a purchase would corrupt every revenue figure derived from
 * that table, permanently and invisibly. providerRef stays NULL, which is also
 * why the unique index on (provider, providerRef) is partial — promo grants
 * must remain repeatable.
 */
export async function grantEntitlement(input: {
  actor: AdminActor;
  userId: string;
  pack: string;
  reason: string;
  months?: number;
  now?: Date;
}): Promise<{ entitlementId: string; expiresAt: Date }> {
  const reason = requireReason(input.reason);
  if (!isPackId(input.pack)) {
    throw new AdminError("INVALID_INPUT", `Unknown pack ${input.pack}`);
  }
  const months = input.months ?? PACK_ACCESS_MONTHS;
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new AdminError("INVALID_INPUT", `Refusing a ${months}-month grant`);
  }

  const purchasedAt = input.now ?? new Date();
  const expiresAt = addMonths(purchasedAt, months);

  const created = await getAdminStore().grantEntitlement(
    {
      userId: input.userId,
      pack: input.pack,
      purchasedAt,
      expiresAt,
      provider: ADMIN_GRANT_PROVIDER,
      providerRef: null,
    },
    auditFor(input.actor, "grant_entitlement", input.userId, null, reason, {
      pack: input.pack,
      months,
      expiresAt: expiresAt.toISOString(),
      provider: ADMIN_GRANT_PROVIDER,
    }),
  );
  return { entitlementId: created.id, expiresAt };
}

/**
 * Take access away — a chargeback, a duplicate grant, a refund.
 *
 * Deletes the Entitlement row and NOT the Payment: the grant is revocable, the
 * receipt is not. That asymmetry is the schema's (Payment vs Entitlement) and
 * this is where it becomes visible — after a revoke the books still say the
 * money moved, which is what Bulgarian accounting law requires and what a
 * dispute needs.
 *
 * The `detail` snapshot is the undo: it records the exact row so the same
 * access can be re-granted from the ledger if the revoke turns out to be wrong.
 */
export async function revokeEntitlement(input: {
  actor: AdminActor;
  userId: string;
  entitlementId: string;
  reason: string;
}): Promise<void> {
  const reason = requireReason(input.reason);

  const store = getAdminStore();
  const existing = (await store.listEntitlements(input.userId)).find(
    (e) => e.id === input.entitlementId,
  );
  if (!existing) {
    throw new AdminError("NOT_FOUND", `No entitlement ${input.entitlementId} on this account`);
  }

  const ok = await store.revokeEntitlement(
    input.userId,
    input.entitlementId,
    auditFor(
      input.actor,
      "revoke_entitlement",
      input.userId,
      input.entitlementId,
      reason,
      {
        // The whole row, so this is reversible from the log alone.
        pack: existing.pack,
        provider: existing.provider,
        providerRef: existing.providerRef,
        purchasedAt: existing.purchasedAt.toISOString(),
        expiresAt: existing.expiresAt?.toISOString() ?? null,
      },
    ),
  );
  if (!ok) {
    throw new AdminError("NOT_FOUND", `No entitlement ${input.entitlementId} on this account`);
  }
}

/**
 * Give back a free mock exam that the product ate.
 *
 * THE CASE THIS EXISTS FOR, in full: a free student taps „Започни пробен
 * изпит"; the attempt row is created; their phone drops connection on the
 * tram; requireEntitlementForExam counts STARTED attempts, so the one free
 * exam they were ever going to get is spent on a paper they never saw. Until
 * this button, the only remedy was hand-written SQL against production.
 *
 * It moves User.freeExamGrants, which widens the allowance by exactly one
 * exam. It does not delete attempt rows (that is the student's history) and
 * does not grant a pack (that is a different button and a much bigger gift).
 */
export async function restoreFreeExam(input: {
  actor: AdminActor;
  userId: string;
  reason: string;
  exams?: number;
}): Promise<{ grants: number }> {
  const reason = requireReason(input.reason);
  const exams = input.exams ?? 1;
  if (!Number.isInteger(exams) || exams < 1 || exams > 10) {
    throw new AdminError("INVALID_INPUT", `Refusing to restore ${exams} exams`);
  }

  const grants = await getAdminStore().addFreeExamGrants(
    input.userId,
    exams,
    auditFor(input.actor, "reset_free_exams", input.userId, null, reason, { exams }),
  );
  return { grants };
}

/**
 * Delete an attempt that is stuck open.
 *
 * ONLY an unfinished one, enforced in the WHERE clause of the delete, not by a
 * check the code does first: a graded exam is the student's own record and the
 * evidence behind their readiness score. Support must not be able to remove
 * one, not even by racing a submit.
 *
 * Note what this does NOT do: it does not give the free exam back. Deleting the
 * row lowers the lifetime attempt count, which would silently restore the
 * allowance as a side effect — so the two remedies are kept separate and
 * separately logged, and the screen says which one to use.
 */
export async function deleteStuckAttempt(input: {
  actor: AdminActor;
  userId: string;
  attemptId: string;
  reason: string;
  now?: Date;
}): Promise<void> {
  const reason = requireReason(input.reason);

  const store = getAdminStore();
  const attempt = (await store.listAttempts(input.userId)).find(
    (a) => a.id === input.attemptId,
  );
  if (!attempt) {
    throw new AdminError("NOT_FOUND", `No attempt ${input.attemptId} on this account`);
  }
  if (attempt.finishedAt !== null) {
    throw new AdminError(
      "NOT_IN_PROGRESS",
      `Attempt ${input.attemptId} is graded — a finished exam is the student's record`,
    );
  }

  const ok = await store.deleteInProgressAttempt(
    input.userId,
    input.attemptId,
    auditFor(input.actor, "delete_attempt", input.userId, input.attemptId, reason, {
      startedAt: attempt.startedAt.toISOString(),
      expired: isAttemptExpired(attempt.startedAt, input.now ?? new Date()),
    }),
  );
  if (!ok) {
    // Lost the race with a submit — the attempt was graded in between, and a
    // graded attempt is never deletable.
    throw new AdminError(
      "NOT_IN_PROGRESS",
      `Attempt ${input.attemptId} could not be deleted (it is no longer in progress)`,
    );
  }
}
