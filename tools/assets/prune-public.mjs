#!/usr/bin/env node
/**
 * The public/ deploy split (audit 2026-07-24, M-28).
 *
 *   node tools/assets/prune-public.mjs --public <dir> [--apply] [--quiet]
 *
 * Removes every file whose bucket is `ship: "dev"` (tools/assets/publicBudget.mjs)
 * from the given public/ tree. Dry-run by default — `--apply` is required to
 * touch anything, because the obvious mistake is pointing this at a working
 * copy and losing the R0 keyframe evidence.
 *
 * WHY A PRUNE AND NOT AN ALLOW-LIST COPY: `deploy.sh` puts the live tree on
 * the target commit with `git reset --hard`, so public/ arrives complete and
 * in place. Copying a shipping subset elsewhere would mean teaching Next a
 * second asset root; deleting the dev-only files after the reset is one line
 * in the deploy and leaves the served paths untouched. `git reset --hard`
 * restores them on the next deploy, so this is idempotent and self-healing —
 * a prune that is skipped costs disk, never correctness.
 *
 * SAFETY: it refuses to run against a directory that does not look like this
 * project's public/ (no clips/manifest.json, no sim/), so a wrong `--public`
 * argument stops before it deletes anything.
 */

import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { classify, mb, walk } from "./publicBudget.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const quiet = args.includes("--quiet");
const publicIdx = args.indexOf("--public");
if (publicIdx < 0 || !args[publicIdx + 1]) {
  console.error("usage: prune-public.mjs --public <dir> [--apply]");
  process.exit(2);
}
const root = path.resolve(args[publicIdx + 1]);

// Two independent landmarks: a wrong path is far more likely to miss both
// than to contain either by coincidence.
if (!existsSync(path.join(root, "clips", "manifest.json")) || !existsSync(path.join(root, "sim"))) {
  console.error(`refusing: ${root} does not look like platform/public (no clips/manifest.json + sim/)`);
  process.exit(2);
}

let bytes = 0;
let count = 0;
const unclassified = [];

for (const rel of walk(root)) {
  const bucket = classify(rel);
  if (!bucket) {
    // Never delete something the declaration does not know about — that is a
    // "someone added an asset dir" signal, and check-asset-budget.mjs is where
    // it is supposed to fail.
    unclassified.push(rel);
    continue;
  }
  if (bucket.ship !== "dev") continue;
  bytes += statSync(path.join(root, rel)).size;
  count += 1;
  if (apply) rmSync(path.join(root, rel), { force: true });
}

if (!quiet) {
  console.log(
    `${apply ? "pruned" : "would prune"} ${count} dev-only file(s), ${mb(bytes)} from ${root}`,
  );
  if (unclassified.length > 0) {
    console.log(`  (left ${unclassified.length} undeclared file(s) alone — run check-asset-budget.mjs)`);
  }
  if (!apply) console.log("  dry run — pass --apply to delete");
}
