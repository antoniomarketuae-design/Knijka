#!/usr/bin/env node
/**
 * `npm run payments:reconcile [-- --days 30]`
 *
 * THE ONLY THING THAT CAN ANSWER "HAVE WE ALREADY LOST SALES?"
 *
 * Every other fix in the money path stops a NEW loss. None of them can tell
 * you about a purchase that already fell through the floor — a webhook that
 * 400'd on a mode mismatch, a session whose metadata was gone, a fulfilment
 * that failed after Stripe stopped retrying. Those students paid, got nothing,
 * and are INVISIBLE to us: there is no row in our database precisely because
 * the write is the thing that failed. Looking harder at our own tables cannot
 * find them.
 *
 * So this asks the other side. It lists Checkout Sessions Stripe says were
 * PAID in the last N days, left-joins them against Entitlement.providerRef,
 * and prints the ones with no grant behind them.
 *
 * PRINTS NOTHING WHEN CLEAN — silence is the pass. Exit codes: 0 reconciled,
 * 1 orphans found, 2 could not run. Non-zero on orphans so this can be a cron
 * line whose failure mail IS the alert.
 *
 * READ-ONLY. It never grants and never refunds: both are plausible responses
 * to an orphan and only a human knows which one this buyer deserves.
 *
 * The decisions live in payments-reconcile-core.mjs and are unit-tested
 * (src/lib/ops/paymentsReconcile.test.ts); this file is only the I/O around
 * them.
 */

import "dotenv/config";
import { createRequire } from "node:module";
import {
  buildReport,
  classifySessions,
  isPaid,
  parseDays,
} from "./payments-reconcile-core.mjs";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`payments:reconcile — ${message}`);
  process.exit(2);
}

const parsed = parseDays(process.argv.slice(2));
if (!parsed.ok) fail(parsed.message);
const { days } = parsed;

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) fail("STRIPE_SECRET_KEY is not set — nothing to reconcile against.");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set — cannot read the grants.");

const { default: Stripe } = await import("stripe");
const { Client } = require("pg");

const stripe = new Stripe(secretKey);
const since = Math.floor(Date.now() / 1000) - days * 86_400;

// Sessions Stripe says were paid. autoPagingEach walks the cursor, so a busy
// month does not silently truncate at the first 100.
const paid = [];
try {
  for await (const session of stripe.checkout.sessions.list({
    created: { gte: since },
    limit: 100,
  })) {
    if (isPaid(session)) paid.push(session);
  }
} catch (err) {
  fail(`could not list Stripe sessions: ${err.message}`);
}

if (paid.length === 0) process.exit(0); // nothing sold in the window

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let grantedRefs;
let receiptIds;
try {
  const ids = paid.map((s) => s.id);
  const grants = await client.query(
    'SELECT "providerRef" FROM "Entitlement" WHERE provider = $1 AND "providerRef" = ANY($2::text[])',
    ["stripe", ids],
  );
  const receipts = await client.query(
    'SELECT "stripeSessionId" FROM "Payment" WHERE "stripeSessionId" = ANY($1::text[])',
    [ids],
  );
  grantedRefs = new Set(grants.rows.map((r) => r.providerRef));
  receiptIds = new Set(receipts.rows.map((r) => r.stripeSessionId));
} catch (err) {
  await client.end();
  fail(`could not read the grants: ${err.message}`);
} finally {
  await client.end().catch(() => {});
}

const result = classifySessions(paid, grantedRefs, receiptIds);
const report = buildReport(result, days);

if (report === "") process.exit(0); // THE SILENT PASS

console.error(report);
process.exit(result.orphans.length > 0 ? 1 : 0);
