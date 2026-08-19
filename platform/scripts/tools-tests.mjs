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
// gate (scripts/__tests__/test-ownership.test.mjs).
//
// AND THE SENTENCE THAT USED TO END THAT PARAGRAPH WAS FALSE TOO. It read:
// "Silencing it now takes two deliberate acts in two runners rather than one
// narrowed glob." It was the same mistake as the header sentence it replaced,
// in the same place, one level further out — a property asserted in prose by
// the person who most wanted it to be true.
//
// MEASURED 2026-08-19 BY MUTATION, before the fix below. Replace
// `include: [...VITEST_INCLUDE]` in platform/vitest.config.ts with the four
// literal patterns it held before the orphan fix — one edit, one file, and a
// file this script does not own:
//   · `npx vitest list --filesOnly ../tools/mobile/{settle,ladder,selectors}.test.mjs`
//     printed NOTHING and exited 0. The three files were orphaned again, with
//     the fix that un-orphaned them still sitting in VITEST_INCLUDE below.
//   · `node scripts/tools-tests.mjs --audit-only` printed "partition OK: 910
//     test file(s), 891 vitest / 19 node:test, none shared, none orphaned" and
//     exited 0.
//   · `npx vitest run scripts/__tests__/test-ownership.test.mjs` passed all 20 of
//     its tests, none of which had any opinion about the config.
// Both gates green, 33 test blocks and 88 assertions dark. `vitestWouldRun()`
// globs the CONSTANT and nothing checked that the config still spreads it, so
// the audit was auditing a list that had stopped deciding anything — and it
// said so in the reassuring direction, which is the direction every instrument
// bug in this project has failed in.
//
// SO THE DELEGATION IS CHECKED TOO, ONCE PER RUNNER, and neither check can see
// what the other sees:
//   · HERE, `auditConfigWiring()` reads vitest.config.ts as TEXT — this script
//     has no transpiler and cannot load a .ts file — and requires the import of
//     VITEST_INCLUDE and the literal `include: [...VITEST_INCLUDE]`, comments
//     stripped first so prose about the rule cannot satisfy the rule.
//   · IN VITEST, test-ownership.test.mjs imports the real config and asserts
//     `config.test.include` deep-equals `[...VITEST_INCLUDE]` — the resolved
//     VALUE, which catches an inlined copy of today's list that the text scan
//     would clear and which text cannot reach.
// Neither subsumes the other. THAT is what makes two acts two.
//
// WHAT THE PRECONDITION COSTS, because a gate nobody can afford gets deleted,
// and because the figure that used to stand in for it was assembled from parts.
// MEASURED 2026-08-19 on this box's 7200 rpm HDD, 910 test files over 709
// directories, `auditOwnership()` end to end:
//   · 459 ms, median of five warm calls in one process
//   · 566 ms as the FIRST call of a fresh process (median of three)
//   · of which the walk is 91 ms, the vitest glob 45 ms, and
//     `auditVitestConfig()` 0.50 ms — the rest is reading and classifying 910
//     files, which is where a whole-repo audit's money goes
// It was 297 ms warm before `stripComments` became a character scanner. That
// +162 ms is the price of not refusing a correct config, and it was paid on
// purpose: a chunked scanner recovers most of it and is harder to be sure of,
// and this runs once before a gate that takes 128 s.
//
// The numbers that used to stand here (101 ms walk + 139 ms classify, on
// `collectTestFiles`) described two of the four phases and never the glob or
// the union, so a reader adding them up got 240 ms for a precondition that has
// not finished under 290 on any run measured since.
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
 * Source with comments removed — and with STRING LITERALS LEFT INTACT.
 *
 * Not optional. tools/mobile/settle.test.mjs, ladder.test.mjs and this file all
 * discuss imports in prose, and settle.test.mjs records the day a scan that
 * could not tell code from prose about code reported a landed fix as missing.
 *
 * IT USED TO BE TWO REGEXES, and they had the mirror of that bug: they could not
 * tell prose from a string that merely LOOKS like prose. It was
 *   src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
 * and the first of those opens a block comment on the slash-star inside any
 * glob that contains a doubled star. Found 2026-08-19 by the config scan below
 * refusing a config that was CORRECT: platform/vitest.config.ts carries the
 * coverage-threshold key "src/modules/payments/", doubled-star terminated,
 * whose slash-star-star opened a comment that ran to the first star-slash
 * pair — inside the coverage include glob forty lines further down — and ate
 * `include: [...VITEST_INCLUDE]` on the way. The scan then reported the literal
 * as absent — a FALSE REFUSAL, which is the same defect as a false pass wearing
 * the other sign, and the only reason it was caught is that the first thing the
 * new check did was run against a file already known to be right.
 *
 * The `[^:]` guard on the old line-comment regex was a symptom patch for the
 * same blindness: it existed so that `https://` inside a string would survive.
 * A scanner that knows what a string is does not need it.
 *
 * KNOWN LIMIT, stated rather than discovered later: this is a character scanner,
 * not a parser, and it does not detect REGEX LITERALS. A regex holding an
 * unpaired quote (`/["']/`) reads as a string opening. The damage is bounded to
 * that one line — an unterminated ' or " is closed at the newline, because JS
 * cannot carry one across a line break either — so at worst a trailing comment
 * on that same line survives into the output. Every *.test.* file in the repo
 * was classified with both the old and the new implementation and all 910
 * agreed, so nothing on disk is affected today.
 */
const stripComments = (src) => {
  let out = "";
  let inBlock = false;
  let quote = null;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inBlock) {
      // Newlines are kept so that line numbers in the output still mean
      // something to whoever is reading a failure message beside the file.
      if (c === "*" && next === "/") {
        inBlock = false;
        i++;
        out += " ";
      } else if (c === "\n") out += "\n";
      continue;
    }

    if (quote) {
      out += c;
      if (c === "\\") {
        if (next !== undefined) {
          out += next;
          i++;
        }
      } else if (c === quote) quote = null;
      else if (c === "\n" && quote !== "`") quote = null; // see KNOWN LIMIT
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
    } else if (c === "/" && next === "*") {
      inBlock = true;
      i++;
      out += " ";
    } else if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else out += c;
  }

  return out;
};

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
 * Measured 2026-08-19, median of five warm calls: this walk alone is 91 ms for
 * 910 files across 709 directories. Do not quote that as the audit's cost — it
 * is one of four phases, and the last time these per-phase figures stood in for
 * the whole they understated it by half. The end-to-end number and its
 * breakdown are in the header, where a reader deciding whether to keep the
 * precondition will actually look.
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
 * The set of files VITEST_INCLUDE resolves to.
 *
 * READ THAT SENTENCE AGAIN — it is not "the set vitest will collect", which is
 * what this docstring claimed until 2026-08-19 and what the audit below was
 * built on believing. This function never opens vitest.config.ts. It CANNOT:
 * the config is TypeScript and this script is plain node with no transpiler.
 * The two sets are equal only for as long as the config keeps spreading
 * VITEST_INCLUDE into `test.include`, and until `auditConfigWiring()` was added
 * nothing anywhere checked that it did. An overclaiming docstring is not a
 * footnote here: somebody read "answered by vitest", believed the audit was
 * grounded in the real config, and wrote "silencing it takes two deliberate
 * acts" on top of it. It took one.
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

/** The vitest gate's config, whose `include` this whole audit is arithmetic on. */
export const VITEST_CONFIG_FILE = "vitest.config.ts";

export function vitestConfigPath() {
  return path.join(paths().platform, VITEST_CONFIG_FILE);
}

/** The config still delegates to VITEST_INCLUDE: import present, spread present, once. */
const CONFIG_IMPORT_RE =
  /import\s*\{[^}]*\bVITEST_INCLUDE\b[^}]*\}\s*from\s*["']\.\/scripts\/tools-tests\.mjs["']/;
const CONFIG_SPREAD_RE = /\binclude\s*:\s*\[\s*\.\.\.\s*VITEST_INCLUDE\s*,?\s*\]/g;

/**
 * THE OTHER HALF OF THE PARTITION, checked as TEXT because it cannot be checked
 * any other way from here.
 *
 * `vitestWouldRun()` globs the CONSTANT. If vitest.config.ts stops spreading
 * that constant, the constant stops deciding anything and every verdict above
 * becomes a statement about a list with no consequences — while still printing
 * "partition OK". Measured by mutation on 2026-08-19: swap
 * `include: [...VITEST_INCLUDE]` for the four literal patterns it held before
 * the orphan fix and `npx vitest list --filesOnly` stops naming
 * tools/mobile/{ladder,selectors,settle}.test.mjs, yet this gate printed
 * "partition OK: 910 test file(s) … none orphaned" and exited 0 and the vitest
 * gate passed 26 of 26. One edit, one file, 33 test blocks dark.
 *
 * Comments are stripped FIRST, and that is load-bearing rather than tidy: the
 * config's own header says "Do not inline a pattern here" in prose, and a
 * scanner that counts prose would clear a config that inlined the patterns and
 * kept the reassuring sentence. That is the failure this repo already shipped
 * once, in settle.test.mjs, whose header named a glob that no longer existed.
 *
 * WHAT THIS CANNOT SEE, stated so nobody builds on it the way the last reader
 * built on `vitestWouldRun`: it reads source text, so a config that retyped
 * today's patterns verbatim instead of spreading them would fail here (no
 * spread) but would resolve to an identical VALUE. The reverse hole — a spread
 * that resolves to something else — is not visible to text at all. The vitest
 * side (scripts/__tests__/test-ownership.test.mjs) imports the real config and
 * deep-compares the resolved value, which is the half text cannot do. Neither
 * check subsumes the other; that is why there are two, one per runner.
 */
export function auditConfigWiring(src) {
  const code = stripComments(src);
  const problems = [];

  if (!CONFIG_IMPORT_RE.test(code)) {
    problems.push(
      `${VITEST_CONFIG_FILE} does not import VITEST_INCLUDE from ./scripts/tools-tests.mjs — ` +
        `whatever it globs now, this gate is auditing a list that decides nothing`,
    );
  }

  // `String.match` with a /g/ regex resets lastIndex itself, so the shared
  // literal above is safe to reuse across calls.
  const spreads = code.match(CONFIG_SPREAD_RE) ?? [];
  if (spreads.length !== 1) {
    problems.push(
      `${VITEST_CONFIG_FILE} spells \`include: [...VITEST_INCLUDE]\` ${spreads.length} time(s), ` +
        `expected exactly 1 — a literal list there is invisible to this runner, and an extra ` +
        `pattern beside the spread is a file this audit clears while vitest alone decides its fate`,
    );
  }

  return problems;
}

/** `auditConfigWiring` against the real file; an unreadable config is a finding. */
export function auditVitestConfig() {
  const file = vitestConfigPath();
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch (error) {
    return [
      `cannot read ${slash(file)} — the vitest gate's file selection is unauditable, ` +
        `and an unaudited partition is how 88 assertions went unrun: ${error.message}`,
    ];
  }
  return auditConfigWiring(src);
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
  // ORDER MATTERS. If the config no longer spreads VITEST_INCLUDE then the
  // ownership verdict below is arithmetic on a list nothing consults, and
  // printing it first would put a reassuring line above the real failure. This
  // fails fast instead of reporting a clean partition it did not measure.
  const wiring = auditVitestConfig();
  if (wiring.length > 0) {
    console.error(
      "[tools-tests] VITEST_INCLUDE IS NO LONGER THE VITEST GATE'S INCLUDE LIST — " +
        "the ownership audit is not run, because it would be a verdict about a list " +
        "that decides nothing:",
    );
    for (const p of wiring) console.error(`  ${p}`);
    console.error(
      `[tools-tests] restore \`include: [...VITEST_INCLUDE]\` in platform/${VITEST_CONFIG_FILE}, ` +
        "or move the pattern you added into VITEST_INCLUDE where both runners can see it.",
    );
    return false;
  }

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
      `${byVitest} vitest / ${rows.length - byVitest} node:test, none shared, none orphaned; ` +
      `${VITEST_CONFIG_FILE} still spreads VITEST_INCLUDE`,
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
