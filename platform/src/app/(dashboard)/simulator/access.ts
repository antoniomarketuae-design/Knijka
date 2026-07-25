/**
 * The simulator's entitlement gate — ONE decision, three call sites.
 *
 * Audit C-3: /simulator used to call requireUser() and nothing else, so the
 * headline feature of the €21.99 pack was free to every signed-in account and
 * the pricing table's „Шофьорски симулатор" row was a false claim. This module
 * is the single place that answers "may this account drive?", and page.tsx,
 * actions.ts and micro-quiz-actions.ts all ask it — a server action is a
 * public POST endpoint, so gating only the page would leave the save path
 * wide open to a hand-crafted request.
 *
 * Two properties matter and both come from the shape of the input:
 *  - it takes a SessionUser (server-resolved, cookie-signed), never an id or
 *    a flag off the wire, so a client cannot claim access;
 *  - the entitlement itself is read from the DB inside
 *    requireEntitlementForSimulator, so it can only exist because a Stripe
 *    session was fulfilled.
 *
 * Admin bypass is the same one the exam and practice gates use: the role comes
 * from the SERVER session, so the founder/test account drives everywhere —
 * including staging, which is exactly where the gate has to be observable.
 * Deliberately NO `NODE_ENV !== "production"` escape hatch: a gate that is
 * invisible outside production is a gate nobody ever sees fail.
 */

import type { SessionUser } from "@/modules/auth";
import { requireEntitlementForSimulator } from "@/modules/payments";

export async function canDriveSimulator(user: SessionUser): Promise<boolean> {
  if (user.isAdmin) return true;
  return requireEntitlementForSimulator(user.id);
}
