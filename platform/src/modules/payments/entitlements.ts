/**
 * Entitlement logic: what a user's Entitlement rows mean right now.
 * Pure functions are exported separately so tests hit them without a store.
 */

import { getPaymentsStore, type EntitlementRecord } from "./store";
import type { EntitlementSummary } from "./types";

/**
 * Calendar-month addition with end-of-month clamping (UTC), preserving the
 * time of day: Oct 31 + 4 months → Feb 28 (29 in leap years), never Mar 2/3.
 * Used for expiresAt = purchase date + PACK_ACCESS_MONTHS.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const dayOfMonth = result.getUTCDate();
  result.setUTCDate(1); // avoid overflow while shifting the month
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(dayOfMonth, daysInTargetMonth));
  return result;
}

/** Active = not yet expired. expiresAt === now counts as EXPIRED (strict >). */
export function isEntitlementActive(
  row: Pick<EntitlementRecord, "expiresAt">,
  now: Date,
): boolean {
  return row.expiresAt === null || row.expiresAt.getTime() > now.getTime();
}

/** Pure reduction of Entitlement rows → access flags. Premium implies core. */
export function summarizeEntitlements(
  rows: EntitlementRecord[],
  now: Date,
): EntitlementSummary {
  const active = rows.filter((r) => isEntitlementActive(r, now));

  const hasPremium = active.some((r) => r.pack === "premium_sim");
  const hasCore = hasPremium || active.some((r) => r.pack === "core");

  // Latest expiry among active rows; a never-expiring active row wins → null.
  let activeUntil: Date | null = null;
  for (const row of active) {
    if (row.expiresAt === null) return { hasCore, hasPremium, activeUntil: null };
    if (activeUntil === null || row.expiresAt.getTime() > activeUntil.getTime()) {
      activeUntil = row.expiresAt;
    }
  }
  return { hasCore, hasPremium, activeUntil };
}

/**
 * PUBLIC API: the user's current paid access.
 * `now` is injectable for tests; production callers omit it.
 */
export async function getEntitlements(
  userId: string,
  now: Date = new Date(),
): Promise<EntitlementSummary> {
  const rows = await getPaymentsStore().listEntitlements(userId);
  return summarizeEntitlements(rows, now);
}
