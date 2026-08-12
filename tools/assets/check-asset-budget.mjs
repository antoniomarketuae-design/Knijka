#!/usr/bin/env node
/**
 * The public/ size gate (audit 2026-07-24, M-29).
 *
 *   node tools/assets/check-asset-budget.mjs [--public <dir>] [--json]
 *
 * Exits 0 when every bucket is inside its ceiling and every file is declared;
 * 1 otherwise. The declaration (and the reasoning behind each ceiling) lives
 * in publicBudget.mjs.
 *
 * Runs in CI through publicBudget.test.mjs — the same `npx vitest run` step
 * everything else is gated by — so the ceiling is enforced on every push
 * without a bespoke workflow step to forget about.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUCKETS, kb, mb, scanPublic, sessionCosts, size } from "./publicBudget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC = path.resolve(HERE, "../../platform/public");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const publicIdx = args.indexOf("--public");
const root = publicIdx >= 0 ? path.resolve(args[publicIdx + 1]) : DEFAULT_PUBLIC;

const result = scanPublic(root);
const sessions = sessionCosts(result);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        prodBytes: result.prodBytes,
        devBytes: result.devBytes,
        totalBytes: result.totalBytes,
        buckets: result.buckets.map((b) => ({
          id: b.bucket.id,
          ship: b.bucket.ship,
          files: b.files,
          bytes: b.bytes,
          maxBytes: b.bucket.maxBytes,
        })),
        unclassified: result.unclassified,
        violations: result.violations,
        sessions: sessions.map((s) => ({
          id: s.model.id,
          steps: s.model.steps,
          measured: s.measured,
          permitted: s.permitted,
          maxIdleBytes: s.model.maxIdleBytes,
          violations: s.violations,
        })),
      },
      null,
      2,
    ),
  );
} else {
  const order = new Map(BUCKETS.map((b, i) => [b.id, i]));
  const rows = [...result.buckets].sort((a, b) => order.get(a.bucket.id) - order.get(b.bucket.id));
  console.log(`public/ asset budget — ${root}\n`);
  console.log("ship  bucket                files        bytes      ceiling   used");
  for (const r of rows) {
    const pct = ((r.bytes / r.bucket.maxBytes) * 100).toFixed(0);
    console.log(
      [
        r.bucket.ship.padEnd(5),
        r.bucket.id.padEnd(21),
        String(r.files).padStart(5),
        String(r.bytes).padStart(12),
        String(r.bucket.maxBytes).padStart(12),
        `${pct}%`.padStart(6),
      ].join(" "),
    );
  }
  console.log(
    `\nDEPLOY SIZE — bytes on disk, in git, on the VPS. Paid once, by us.` +
      `\n  deployed (prod): ${mb(result.prodBytes)}   working copy only (dev): ${mb(result.devBytes)}   total: ${mb(result.totalBytes)}`,
  );

  // THE SECOND NUMBER. Lazy loading does not move one byte of the block above;
  // this is the block it moves. See SESSION_MODELS in publicBudget.mjs.
  for (const s of sessions) {
    const { model, measured, permitted } = s;
    const row = (label, now, allowed, note) =>
      console.log(`  ${label.padEnd(22)}${now.padEnd(24)}${allowed.padEnd(12)}${note}`);

    console.log(`\nSESSION DOWNLOAD — what ONE STUDENT pulls. Paid every time, out of a data plan.`);
    console.log(`  ${model.title}`);
    row("", "measured today", `permitted (${model.steps})`, "");
    row(
      "idle (no play)",
      `${kb(measured.idleBytes)} · ${measured.upfrontFiles} poster(s)`,
      kb(permitted.idleBytes),
      "← the floor a student cannot decline",
    );
    row(
      "worst case",
      `${mb(measured.worstCaseBytes)} · ${measured.onDemandFiles} clip(s)`,
      mb(permitted.worstCaseBytes),
      "← every card opened, every clip played once",
    );
    row(
      "biggest single fetch",
      mb(measured.biggestFetch.bytes),
      mb(permitted.biggestFetchBytes),
      "← the unskippable lump; the ceiling that binds",
    );
    if (measured.biggestFetch.rel !== "") {
      console.log(`  ${"".padEnd(22)}(${measured.biggestFetch.rel})`);
    }
    console.log(`  the floor holds only while: ${model.idleRequires}`);
  }
}

let failed = false;

if (result.unclassified.length > 0) {
  failed = true;
  console.error(
    `\nUNDECLARED: ${result.unclassified.length} file(s) under public/ match no bucket.\n` +
      "Add a bucket to tools/assets/publicBudget.mjs saying whether they ship and what they may weigh:",
  );
  for (const f of result.unclassified.slice(0, 20)) console.error(`  ${f.rel} (${f.bytes} B)`);
  if (result.unclassified.length > 20) {
    console.error(`  … and ${result.unclassified.length - 20} more`);
  }
}

const sessionViolations = sessions.flatMap((s) => s.violations);

if (result.violations.length > 0 || sessionViolations.length > 0) {
  failed = true;
  console.error("\nOVER BUDGET:");
  for (const v of [...result.violations, ...sessionViolations]) {
    console.error(`  ${v.kind}  ${v.id}: ${size(v.bytes)} > ${size(v.limit)}`);
  }
  console.error(
    "\nRaise the ceiling only with a reason written next to it. The 1.1 MB posters\n" +
      "H-10 had to undo got in because nothing said no.",
  );
}

process.exit(failed ? 1 : 0);
