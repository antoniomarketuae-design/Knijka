/**
 * Pure logic of `npm run payments:reconcile` — no Stripe, no database, no
 * process.exit. Split out for the same reason seed-founder-guards.mjs is:
 * the part that DECIDES has to be testable, and the part that talks to the
 * network cannot be.
 *
 * The decision itself is a set difference, and the whole value of this tool
 * rests on it pointing the right way: sessions Stripe says were PAID, minus
 * the ones we granted access for. Getting that backwards would report a
 * healthy system as broken, which is the one failure mode that guarantees
 * nobody ever runs it again.
 */

/** Hard ceiling so a fat-fingered `--days 100000` cannot walk all of Stripe. */
export const MAX_DAYS = 365;
export const DEFAULT_DAYS = 30;

/**
 * `--days 30` → 30. Returns { ok: false, message } rather than exiting, so the
 * caller owns the process and the test does not have to trap an exit.
 */
export function parseDays(argv) {
  const i = argv.indexOf("--days");
  if (i === -1) return { ok: true, days: DEFAULT_DAYS };

  const raw = argv[i + 1];
  const n = Number(raw);
  if (raw === undefined || !Number.isFinite(n) || n <= 0) {
    return {
      ok: false,
      message: `--days needs a positive number, got ${raw === undefined ? "nothing" : `"${raw}"`}`,
    };
  }
  return { ok: true, days: Math.min(Math.floor(n), MAX_DAYS) };
}

/**
 * Split paid Stripe sessions into the two things a human must act on.
 *
 * `orphans` — PAID, no Entitlement. Someone was charged and got nothing. This
 *   is the number the whole tool exists to produce.
 * `missingReceipts` — access granted but no Payment row. Fulfilled before the
 *   ledger existed, so the student is fine and only the books are short. NOT
 *   an orphan, and deliberately counted separately: conflating them would
 *   inflate the alarming number with rows that harm nobody.
 */
export function classifySessions(paidSessions, grantedRefs, receiptSessionIds) {
  const granted = grantedRefs instanceof Set ? grantedRefs : new Set(grantedRefs);
  const receipts =
    receiptSessionIds instanceof Set ? receiptSessionIds : new Set(receiptSessionIds);

  const orphans = [];
  const missingReceipts = [];
  for (const session of paidSessions) {
    if (!granted.has(session.id)) orphans.push(session);
    else if (!receipts.has(session.id)) missingReceipts.push(session);
  }
  return { orphans, missingReceipts };
}

/** Only `payment_status: "paid"` counts. Unpaid sessions owe us nothing. */
export function isPaid(session) {
  return session?.payment_status === "paid";
}

/** "12,99 €" — the amount the way the buyer saw it. */
export function formatAmount(cents, currency) {
  const code = String(currency ?? "eur");
  const symbol = code.toLowerCase() === "eur" ? "€" : code.toUpperCase();
  return `${(Number(cents ?? 0) / 100).toFixed(2).replace(".", ",")} ${symbol}`;
}

/**
 * One orphan as a line an operator can act on: who, how much, when, and —
 * because a test-mode session in this list means something completely
 * different from a live one — which mode it was.
 */
export function formatOrphanLine(session) {
  const who =
    session.metadata?.userId ?? session.client_reference_id ?? "(no userId in metadata)";
  const email =
    session.customer_details?.email ?? session.customer_email ?? "(no e-mail)";
  const when = new Date((session.created ?? 0) * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  return (
    `  ${session.id}  ${formatAmount(session.amount_total, session.currency)}  ` +
    `${when}  ${session.livemode ? "LIVE" : "test"}  ` +
    `pack=${session.metadata?.pack ?? "?"}  user=${who}  ${email}`
  );
}

/**
 * The whole report as a string, or "" when there is nothing to say.
 *
 * EMPTY MEANS CLEAN, and the caller prints nothing at all. A reconciliation
 * tool that chatters on a healthy day trains you to ignore it on the day it
 * matters, so silence is the pass condition.
 */
export function buildReport({ orphans, missingReceipts }, days) {
  if (orphans.length === 0 && missingReceipts.length === 0) return "";

  const out = [];
  if (orphans.length > 0) {
    out.push(
      "",
      `  ${orphans.length} PAID SESSION(S) WITH NO ACCESS GRANTED — last ${days} days`,
      "  These people were charged and got nothing.",
      "",
      ...orphans.map(formatOrphanLine),
      "",
      "  Each line is a support conversation waiting to happen. Decide per row:",
      "  grant the access, or refund the charge. This tool does neither on its own.",
      "",
    );
  }
  if (missingReceipts.length > 0) {
    out.push(
      `  ${missingReceipts.length} session(s) granted access but with NO receipt row ` +
        "(fulfilled before the Payment ledger existed).",
      "  Access is fine; the books are not.",
      "",
    );
  }
  return out.join("\n");
}
