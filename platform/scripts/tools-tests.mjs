#!/usr/bin/env node
// The gate for tools/ — the repo's SECOND test runner — and the one place the
// repo's RUNNER PARTITION is written down and audited.
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
// exactly like synthesize_bg was. So every test file under tools/ is claimed
// by whichever runner it imports — `from "vitest"` means the vitest gate has
// it, `from "node:test"` means this script does.
//
// THE SENTENCE THAT USED TO END THIS HEADER WAS FALSE. It read: "A file
// therefore cannot be silently owned by neither runner, which is the only
// property that makes this gate self-maintaining." It had not been true since
// the vitest include glob was narrowed from `../tools/mobile/**/*.test.mjs` to
// the single file `../tools/mobile/budget.test.mjs` — a narrowing that was
// itself correct (the broad glob was swallowing node:test files and reporting
// "No test suite found" as a hard failure), but that silently orphaned
// everything else in that directory. The two halves never met: THIS script
// decides a file is "left to vitest" by reading its IMPORTS, while vitest
// decides what it runs by matching GLOBS, and nothing compared the two.
//
// MEASURED 2026-08-19, at commit 85ca415, before the fix below:
//   · `npx vitest list --filesOnly` returned 878 files — 876 under
//     platform/src, plus tools/assets/publicBudget.test.mjs and
//     tools/mobile/budget.test.mjs. Nothing else.
//   · `npx vitest list ../tools/mobile/{ladder,selectors,settle}.test.mjs`
//     printed NOTHING and exited 0. Three files, 33 test blocks, 88
//     assertions, filtered out here and globbed by nobody. Green by absence,
//     which is the same green a passing suite prints.
//
// SO THE PROPERTY IS NOW ENFORCED INSTEAD OF ASSERTED. `auditOwnership()`
// enumerates every test file in the repository and, for each one, compares
//   · the runner the file DECLARES, read from its imports (comments stripped
//     first — half the files here explain the defect by quoting the code that
//     caused it, and a scan that cannot tell code from prose about code lies),
//     against
//   · the runners that will actually EXECUTE it: vitest if any VITEST_INCLUDE
//     pattern matches, resolved with vitest's OWN glob engine and vitest's own
//     options (see `vitestWouldRun`), and node:test if this script's own walk
//     collects it.
// It fails on every disagreement in either direction — claimed by nobody,
// claimed by both, claimed by the wrong one, or declaring no runner at all —
// and it runs HERE, before a single test does, as well as inside the vitest
// gate (scripts/__tests__/test-ownership.test.mjs). Silencing it now takes two
// deliberate acts in two runners rather than one narrowed glob.
//
//   node scripts/tools-tests.mjs              (from platform/, like the other gates)
//   node scripts/tools-tests.mjs --audit-only (the partition check, no tests)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * THE VITEST GATE'S FILE SELECTION, and the reason it lives in a .mjs rather
 * than in vitest.config.ts where you would expect it.
 *
 * It has to be readable by BOTH runners. vitest.config.ts is TypeScript and is
 * loaded by Vite; this script is plain node with no transpiler. If the list
 * lived in the config, the node gate could not read it, the audit could only
 * ever run under vitest, and narrowing a glob so that the audit's own file
 * stopped being collected would silence the audit — the exact failure it
 * exists to catch, one level up. So the array lives here and the config
 * imports it.
 *
 * `src/**` is `.tsx` as well as `.ts` deliberately (audit L-6): a `*.test.ts`
 * glob would silently ignore a future component test rather than fail loudly.
 *
 * The entries that reach OUT of platform/ do so on purpose (audit M-29): the
 * public/ size ceiling (tools/assets) and the mobile SCREEN budget
 * (tools/mobile/budget.test.mjs) have to fail in the same gate a unit test
 * fails in, or they are not ceilings — they are suggestions nobody executes.
 *
 * tools/mobile is enumerated FILE BY FILE rather than globbed. A directory
 * glob there is wrong in both directions: `../tools/mobile/**\/*.test.mjs`
 * swallows the 8 node:test files in that directory and hard-fails, and no glob
 * narrow enough to miss them is narrow enough to be obvious. The list is
 * hand-written and the audit below is what keeps it honest — add a vitest file
 * to tools/mobile without adding it here and both gates go red naming it.
 */
export const VITEST_INCLUDE = [
  "src/**/*.test.{ts,tsx}",
  "scripts/__tests__/**/*.test.mjs",
  "../tools/assets/**/*.test.mjs",
  "../tools/mobile/budget.test.mjs",
  "../tools/mobile/ladder.test.mjs",
  "../tools/mobile/selectors.test.mjs",
  "../tools/mobile/settle.test.mjs",
];

/**
 * vitest's own default `exclude`, copied from vitest 4.1.10
 * (`dist/chunks/defaults.9aQKnqFk.js`: `const defaultExclude =
 * ["**\/node_modules/**", "**\/.git/**"]`).
 *
 * A copy of somebody else's constant rots. This one cannot rot silently:
 * scripts/__tests__/test-ownership.test.mjs asserts it still equals
 * `configDefaults.exclude` imported from "vitest/config", which is free inside
 * the vitest gate and would drag Vite into this script if done here.
 */
export const VITEST_DEFAULT_EXCLUDE = ["**/node_modules/**", "**/.git/**"];

/** Any file either runner could plausibly be expected to run. */
const TEST_FILE_RE = /\.(test|spec)\.(m|c)?(t|j)sx?$/;

/**
 * Paths are resolved LAZILY, never at module scope.
 *
 * vitest.config.ts imports VITEST_INCLUDE from this file, so this module is
 * evaluated inside Vite's config loader, which inlines relative imports into a
 * single bundle. Anything that reads `import.meta.url` while that bundle is
 * being evaluated is reading it in whatever context the bundler chose, and a
 * throw there takes the whole config down. Nothing below runs until a caller
 * asks for it, and no caller asks during config load.
 */
let cachedPaths = null;
export function paths() {
  if (!cachedPaths) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const platform = path.resolve(here, "..");
    const repo = path.resolve(platform, "..");
    cachedPaths = { here, platform, repo, tools: path.join(repo, "tools") };
  }
  return cachedPaths;
}

/** Forward slashes everywhere, so Windows and CI compare as the same string. */
const slash = (p) => p.split(path.sep).join("/");

/**
 * Source with comments removed.
 *
 * Not optional. tools/mobile/settle.test.mjs, ladder.test.mjs and this file all
 * discuss imports in prose, and settle.test.mjs records the day a scan that
 * could not tell code from prose about code reported a landed fix as missing.
 * The `[^:]` guard keeps `https://` out of it.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * The runner a file is WRITTEN for: "vitest", "node", or null for neither.
 *
 * null is a finding, not a shrug. A test file that imports no runner is the
 * same defect as a test file no runner runs — this repo has already shipped
 * five committed files whose own headers said "TEMPORARY — delete after
 * reading", carrying three assertions between them and a green tick forever.
 */
export function declaredRunner(file) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  if (/\bfrom\s+["']vitest["']/.test(src) || /\bimport\s*\(\s*["']vitest["']/.test(src)) {
    return "vitest";
  }
  if (/\bfrom\s+["']node:test["']/.test(src) || /\brequire\(\s*["']node:test["']\s*\)/.test(src)) {
    return "node";
  }
  return null;
}

/**
 * Every test file under `dir`, depth-first. node_modules is NEVER walked (it is
 * 44,952 files and ~42 s on this box's 7200 rpm HDD); dot-directories are
 * skipped, which is what keeps .git and .next out.
 *
 * Measured 2026-08-19 over the whole repo: 902 files across 708 directories in
 * 101 ms, plus 139 ms to read and classify all 902. Cheap enough to run before
 * every gate, which is the only reason it can be a precondition rather than a
 * chore.
 */
export function collectTestFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTestFiles(full, out);
    else if (TEST_FILE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every *.test.mjs under tools/ — the pool this script may draw from. */
export function collectToolTests() {
  return collectTestFiles(paths().tools).filter((f) => f.endsWith(".test.mjs"));
}

/**
 * The set of files vitest will actually collect, answered by vitest.
 *
 * NOT re-implemented: `tinyglobby` is the engine vitest globs `include` with
 * (`dist/chunks/cli-api.*.js`: `import { glob } from 'tinyglobby'`), and it is
 * resolved THROUGH vitest's own package so the version that answers here is the
 * version that will answer in the run — a hoisted top-level copy could be a
 * different one. The options are copied from the same call site:
 * `glob(include, { dot: true, cwd, ignore: exclude, expandDirectories: false })`.
 *
 * If it cannot be resolved this THROWS. It does not fall back to a hand-rolled
 * matcher: a second-best matcher that disagrees with the real one produces a
 * partition audit that passes while the partition is broken, which is worse
 * than no audit, because it is an audit somebody trusts.
 */
export function vitestWouldRun() {
  const { platform } = paths();
  const req = createRequire(import.meta.url);
  let globSync;
  try {
    // Resolve tinyglobby the way vitest itself would, from vitest's own root.
    const fromVitest = createRequire(req.resolve("vitest/package.json"));
    ({ globSync } = fromVitest("tinyglobby"));
  } catch (error) {
    throw new Error(
      "[tools-tests] cannot resolve tinyglobby through vitest — the runner partition " +
        `cannot be audited, and an unaudited partition is how 88 assertions went unrun: ${error.message}`,
    );
  }
  return new Set(
    globSync(VITEST_INCLUDE, {
      dot: true,
      cwd: platform,
      ignore: VITEST_DEFAULT_EXCLUDE,
      expandDirectories: false,
    }).map((f) => slash(path.resolve(platform, f))),
  );
}

/**
 * The verdict for ONE file, as pure arithmetic over four facts.
 *
 * Kept separate from the filesystem so the gate can drive every combination —
 * including the ones the tree does not currently contain — instead of only the
 * combination that happens to be on disk today.
 */
export function classify({ declared, vitestRuns, nodeRuns }) {
  const runners = [vitestRuns && "vitest", nodeRuns && "node"].filter(Boolean);
  if (declared === null) {
    return "imports neither vitest nor node:test — it can assert nothing under either runner";
  }
  if (runners.length === 0) {
    return `written for ${declared} and run by NEITHER runner — green by absence`;
  }
  if (runners.length > 1) {
    return `run by BOTH runners (${runners.join(" + ")}) — it will double-run or hard-fail`;
  }
  if (runners[0] !== declared) {
    return `written for ${declared} but claimed by ${runners[0]}`;
  }
  return null;
}

/**
 * The partition, audited over the whole repository.
 *
 * The file list is the UNION of this script's walk and vitest's own glob
 * result, not just the walk. The two disagree at the edges by construction —
 * vitest globs with `dot: true` and this walk skips dot-directories — and a
 * file the walk cannot see is exactly the file an audit built only on the walk
 * would clear without looking at.
 */
export function auditOwnership() {
  const { repo, tools } = paths();
  const vitestSet = vitestWouldRun();
  const walked = collectTestFiles(repo).map(slash);
  const files = [...new Set([...walked, ...vitestSet])].sort();

  const rows = files.map((file) => {
    const declared = declaredRunner(file);
    const underTools = file.startsWith(slash(tools) + "/");
    // The node gate's real filter, quoted rather than described: `main()` runs
    // exactly the tools/ files whose declared runner is node.
    const nodeRuns = underTools && file.endsWith(".test.mjs") && declared === "node";
    const vitestRuns = vitestSet.has(file);
    return {
      file: slash(path.relative(repo, file)),
      declared,
      vitestRuns,
      nodeRuns,
      problem: classify({ declared, vitestRuns, nodeRuns }),
    };
  });

  return { rows, problems: rows.filter((r) => r.problem !== null) };
}

/** Print the audit; return true when the partition is total and disjoint. */
function reportAudit() {
  const { rows, problems } = auditOwnership();
  if (problems.length > 0) {
    console.error(
      `[tools-tests] RUNNER PARTITION BROKEN — ${problems.length} of ${rows.length} test file(s) ` +
        `are not owned by exactly one runner:`,
    );
    for (const p of problems) console.error(`  ${p.file}\n      ${p.problem}`);
    console.error(
      "[tools-tests] fix VITEST_INCLUDE in scripts/tools-tests.mjs, or the file's imports. " +
        "A test nobody runs and a test that asserts nothing are the same defect.",
    );
    return false;
  }
  const byVitest = rows.filter((r) => r.vitestRuns).length;
  console.log(
    `[tools-tests] partition OK: ${rows.length} test file(s), ` +
      `${byVitest} vitest / ${rows.length - byVitest} node:test, none shared, none orphaned`,
  );
  return true;
}

function main(argv) {
  const { tools } = paths();

  if (!fs.existsSync(tools)) {
    console.error(`[tools-tests] no tools/ directory at ${tools}`);
    return 1;
  }

  // The partition is a PRECONDITION, not a summary. It runs before any test,
  // so a suite that is green because a third of it was never collected cannot
  // print a green line first and be believed.
  if (!reportAudit()) return 1;
  if (argv.includes("--audit-only")) return 0;

  const all = collectToolTests();
  const files = all.filter((f) => declaredRunner(f) === "node");

  // A discovery gate that finds nothing must fail, not pass quietly — that is
  // the failure mode this whole script was written to end.
  if (files.length === 0) {
    console.error(
      `[tools-tests] found ${all.length} test file(s) under tools/ but none for node:test — ` +
        `discovery is broken, refusing to report success`,
    );
    return 1;
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
    return 1;
  }
  return result.status ?? 1;
}

// Importable: vitest.config.ts reads VITEST_INCLUDE from here and the vitest
// gate imports the audit. Neither may launch a test run as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
