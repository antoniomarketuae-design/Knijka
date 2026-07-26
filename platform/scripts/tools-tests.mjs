#!/usr/bin/env node
// The gate for tools/ — the repo's SECOND test runner, mechanized.
//
// WHY THIS EXISTS: the authoring and deploy scripts under tools/ are tested
// with `node:test`, not vitest, and every one of those files documents itself
// as "Run: node --test tools/<x>/<y>.test.mjs" — a per-file instruction that
// only ever ran when a human remembered to type it. `npx vitest run` cannot
// pick them up (different runner), and ci.yml had no step for them, so 92
// passing tests across tools/theory and tools/deploy were load-bearing on
// nothing. The integration pass that added tools/theory/synthesize_bg.test.mjs
// (30 tests guarding, among other things, "no paid provider without both
// brakes") shipped it straight into that blind spot.
//
// DISCOVERY IS BY RUNNER, NOT BY DIRECTORY. A hardcoded folder list is the
// same bug one level up: the next tools/<new-area>/x.test.mjs would be missed
// exactly like synthesize_bg was. So every *.test.mjs under tools/ is claimed
// by whichever runner it imports —
//   - imports "vitest"  -> tools/assets/publicBudget.test.mjs, which is
//     ALREADY inside `npx vitest run` via the second include glob in
//     vitest.config.ts (audit M-29: the public/ size ceiling has to fail in
//     the same place a unit test does). Running it here too would double-run
//     it at best and fail on the missing vitest globals at worst.
//   - everything else   -> node:test, which is this script's job.
// A file therefore cannot be silently owned by neither runner, which is the
// only property that makes this gate self-maintaining.
//
//   node scripts/tools-tests.mjs      (from platform/, like the other gates)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, "..", "..", "tools");

/** Every *.test.mjs under tools/, depth-first, node_modules excluded. */
function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith(".test.mjs")) out.push(full);
  }
  return out;
}

/** The ownership test: a vitest import means the vitest gate already has it. */
const ownedByVitest = (file) =>
  /^\s*import\s[^;]*\bfrom\s+["']vitest["']/m.test(fs.readFileSync(file, "utf8"));

if (!fs.existsSync(TOOLS)) {
  console.error(`[tools-tests] no tools/ directory at ${TOOLS}`);
  process.exit(1);
}

const all = collect(TOOLS);
const files = all.filter((f) => !ownedByVitest(f));

// A discovery gate that finds nothing must fail, not pass quietly — that is
// the failure mode this whole script was written to end.
if (files.length === 0) {
  console.error(
    `[tools-tests] found ${all.length} test file(s) under tools/ but none for node:test — ` +
      `discovery is broken, refusing to report success`,
  );
  process.exit(1);
}

console.log(
  `[tools-tests] ${files.length} node:test file(s); ` +
    `${all.length - files.length} left to vitest`,
);

const result = spawnSync(
  process.execPath,
  ["--test", ...files.map((f) => path.relative(process.cwd(), f))],
  { stdio: "inherit" },
);

if (result.error) {
  console.error("[tools-tests] failed to launch node --test:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
