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
// AND THAT WAS STILL ONLY ONE KEY. Both of the checks above are about
// `include`. `test: { … }` is an object with eighty-odd other keys available to
// it, and vitest decides what it collects from several of them. MEASURED
// 2026-08-19 by mutation, `include: [...VITEST_INCLUDE]` left untouched and one
// key added beside it:
//   · `exclude: [… , "../tools/mobile/settle.test.mjs"]` — `npx vitest list
//     --filesOnly` fell from 892 files to 891, and asking vitest for
//     settle.test.mjs by name printed NOTHING and exited 0.
//   · `dir: "src"` — `npx vitest list --filesOnly` returned 0 files.
// Under both, the pre-fix `auditConfigWiring()` returned `[]` — its import
// check and its one spread count both pass, because neither key touches
// either — so this gate printed "partition OK … none orphaned" and exited 0.
// The same defect, one key over in the same literal, failing in the same
// reassuring direction.
//
// THE TWO KEYS DIVERGE AT THE VITEST GATE, and the difference is worth knowing
// before trusting either half alone. Under `exclude` the vitest gate ran and
// its deep-equality on `test.include` PASSED, because `include` had not
// changed — a clean green over a file it no longer collected. Under `dir` the
// vitest gate could not run at all: it printed "No test files found, exiting
// with code 1", having deselected its own gate. Loud, but not an assertion. Add
// `passWithNoTests: true` beside it and that exit code becomes 0 — measured —
// at which point THIS script is the only half left that can speak. That is the
// argument for two runners rather than one, restated at the key level.
//
// SO THE OBJECT IS CLOSED BY EXHAUSTION RATHER THAN BY NAMING KEYS. Pinning
// `exclude` too would have left `dir`, and pinning `dir` would have left
// `projects`, and the next vitest release adds keys nobody here has read. The
// config may set the keys VITEST_ROOT_KEYS and VITEST_TEST_KEYS vouch for and
// no others; each entry carries the reason it cannot deselect a test file, and
// an unlisted key is refused by name in both gates. `auditConfigKeys()` reads
// the key structure as text HERE; the vitest gate reads `Object.keys()` off the
// resolved config object, which is the half text cannot do — a key that arrives
// by spread, by `mergeConfig`, or under a computed name is a value, not a
// token. Both go red for every mutation above; the mutations are in the suite.
//
// WHAT THE PRECONDITION COSTS, because a gate nobody can afford gets deleted,
// and because the figure that used to stand in for it was assembled from parts.
// MEASURED 2026-08-19 on this box's 7200 rpm HDD, `auditOwnership()` end to end,
// three fresh processes of four calls each:
//   · 495 ms warm (medians 475 / 495 / 508), 913 test files
//   · of which the walk is ~90 ms, the vitest glob ~46 ms, and
//     `auditVitestConfig()` 0.66 ms — 0.35 ms of that is the new key scan. The
//     rest is reading and classifying 913 files, which is where a whole-repo
//     audit's money goes.
//   · importing this module is 7 ms warm, 260 ms cold.
// It was 297 ms warm before `stripComments` became a character scanner. That
// +200 ms is the price of not refusing a correct config, and it was paid on
// purpose: a chunked scanner recovers most of it and is harder to be sure of,
// and this runs once before a gate that takes 128 s.
//
// THE COLD FIRST CALL IS NOT A NUMBER, and the line that used to give one
// ("566 ms as the FIRST call of a fresh process") was measuring the OS file
// cache rather than this code. Across seven fresh processes measured the same
// afternoon it was 558 ms, 568 ms, 1.0 s, 1.4 s, 13.1 s and 48.0 s — the spread
// is seven other agents hitting the same spindle, not variance in the audit.
// Quote the warm figure; the cold one is disk, and it is somebody else's disk.
//
// AND DO NOT QUOTE THE FILE COUNT AS A CONSTANT. It was 911 at the start of the
// session these numbers were taken in and 913 by the end, because other lanes
// were adding test files while the measurements ran. The gate asserts a floor
// (`rows.length > 800`), never an equality, for exactly that reason.
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

/**
 * THE REST OF THE SAME OBJECT LITERAL — and why this is an ALLOWLIST rather
 * than a list of the keys known to be dangerous.
 *
 * Pinning `include` closed one axis and left every other key in `test: { … }`
 * open. MEASURED 2026-08-19 by mutation, with `include: [...VITEST_INCLUDE]`
 * left completely untouched and ONE key added beside it:
 *   · `exclude: [...defaultExclude, "../tools/mobile/settle.test.mjs"]` —
 *     `npx vitest list --filesOnly` fell from 892 files to 891, and asking
 *     vitest for settle.test.mjs by name printed NOTHING and exited 0.
 *   · `dir: "src"` — `npx vitest list --filesOnly` returned 0 files.
 * Under both, `auditConfigWiring()` returned `[]`, this gate printed
 * "partition OK … none orphaned" and exited 0, and the vitest gate's
 * deep-equality on `test.include` passed — because `include` had not changed.
 * That is the defect this file was rewritten to close, reproduced one key over
 * in the same literal, and failing in the same reassuring direction.
 *
 * vitest 4.1.10's InlineConfig has 80-odd keys (`dist/chunks/reporters.d.*.d.ts`,
 * `interface InlineConfig`). A DENYLIST of the ones that can deselect a file
 * would have to be right about all 80, and right again after every vitest
 * upgrade — the standing bet that has now lost here twice. So the rule is
 * inverted: the config may set these keys and no others, and each entry carries
 * the reason it cannot remove a test file from the run.
 *
 * AN UNLISTED KEY IS REFUSED, NOT GUESSED AT. That refusal is not the
 * false-failure class this repo keeps paying for. It is accurate — the gate
 * genuinely cannot certify the partition for an option it has never read — it
 * names the key, and the remedy is one line: if the key cannot deselect a test
 * file, add it here with its reason; if it can, the partition audit stopped
 * being true the moment it landed, which is the thing worth being stopped for.
 */
export const VITEST_ROOT_KEYS = {
  test: "the vitest options object; its own keys are audited against VITEST_TEST_KEYS",
  resolve:
    "Vite module resolution (the `@` alias). It rewrites import specifiers INSIDE a " +
    "file that was already collected; it cannot add or remove one from the collection.",
};

export const VITEST_TEST_KEYS = {
  include:
    "THE file-selection key, and the only one permitted to be — pinned to VITEST_INCLUDE " +
    "by the spread check here and by deep-equality on the resolved value in the vitest gate",
  environment:
    "the globals a collected file runs against. It is one value for every file: " +
    "`environmentMatchGlobs`, which could once vary it per path, is gone in vitest 4. " +
    "It cannot deselect a file.",
  coverage:
    "v8 instrumentation of SOURCE files. Its own include/exclude/thresholds decide what is " +
    "REPORTED, and its thresholds can fail the run loudly; none of them decide what is COLLECTED.",
  testTimeout:
    "the per-test clock. It cannot deselect a file: every collected file still runs and every " +
    "assertion still executes — a test that exceeds it FAILS LOUDLY rather than being skipped, " +
    "which is the opposite of deselection. Raised to 60 s on 2026-08-27 because the default 5 s " +
    "starved tests under contention: measured here, publicBudget runs 0.75 s alone and 19.6 s " +
    "inside a full run, providerIntegration 0.33 s alone and 11.4 s under load, scenery-sightline " +
    "T6 1.28 s alone against a >5 s red. None got slower; they queue behind 1,022 files on " +
    "--maxWorkers=2. 60 s is ~18x the slowest real standalone time, so a genuine hang still " +
    "fails — the same reasoning as the drive supervisor 900 s against a 510 s longest real drive.",
  hookTimeout:
    "the same clock for beforeAll/afterAll. Identical argument: a hook that exceeds it fails the " +
    "file loudly; it cannot remove a file from collection. Kept equal to testTimeout so a slow " +
    "fixture and a slow test are not judged on two different scales.",
};

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
  if (
    /\bfrom\s+["']vitest["']/.test(src) ||
    /\bimport\s*\(\s*["']vitest["']/.test(src)
  ) {
    return "vitest";
  }
  if (
    /\bfrom\s+["']node:test["']/.test(src) ||
    /\brequire\(\s*["']node:test["']\s*\)/.test(src)
  ) {
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
 *
 * THE PARAMETERS EXIST TO DEMONSTRATE THE DEFECT, not to configure the audit.
 * Called with no arguments — which is how `auditOwnership()` and both gates
 * call it — it globs exactly what the config is allowed to hand vitest, so the
 * defaults ARE the audited configuration. The overrides let a test glob what a
 * MUTATED config would hand it and compare the two sets, which turns "an
 * `exclude` beside the spread removes settle.test.mjs" from a sentence in a
 * comment into a number the suite recomputes. They are deliberately not read
 * from anywhere: an override that quietly became the default would make every
 * verdict a statement about a list nothing consults, which is the exact shape
 * of the bug this file has now closed twice.
 */
export function vitestWouldRun({
  include = VITEST_INCLUDE,
  exclude = VITEST_DEFAULT_EXCLUDE,
  cwd = null,
} = {}) {
  const { platform } = paths();
  const root = cwd ?? platform;
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
    globSync(include, {
      dot: true,
      cwd: root,
      ignore: exclude,
      expandDirectories: false,
    }).map((f) => slash(path.resolve(root, f))),
  );
}

/** The vitest gate's config, whose `include` this whole audit is arithmetic on. */
export const VITEST_CONFIG_FILE = "vitest.config.ts";

export function vitestConfigPath() {
  return path.join(paths().platform, VITEST_CONFIG_FILE);
}

/**
 * A filler that cannot occur in the source being scanned, standing in for the
 * contents of a string literal. Lengths are preserved so that every offset in
 * the masked copy is still an offset into the original.
 */
const MASK = "\u0001";

/**
 * String literal CONTENTS blanked; the quotes, the newlines and the length kept.
 *
 * `stripComments` deletes prose about code. This deletes the INSIDE of strings,
 * for the opposite reason: the structural walk below counts braces, brackets and
 * commas to find out which keys sit at the top level of an object literal, and
 * this config is full of strings that contain all three — `"src/**\/*.test.{ts,tsx}"`
 * alone carries a brace, a comma and a closing brace. Counting those would put
 * the walk at a depth it is not at and hide every key after them.
 *
 * The quote characters survive so a QUOTED key (`"exclude": [...]`) is still
 * visible as a key; the name is then read back out of the unmasked original at
 * the same offsets, which is the whole reason lengths are preserved.
 */
const maskStringContents = (code) => {
  let out = "";
  let quote = null;

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (!quote) {
      if (c === '"' || c === "'" || c === "`") quote = c;
      out += c;
      continue;
    }
    if (c === "\\") {
      // The escape and the character it escapes both vanish, so an escaped
      // quote cannot be mistaken for the end of the string.
      out += MASK;
      if (i + 1 < code.length) {
        out += code[i + 1] === "\n" ? "\n" : MASK;
        i++;
      }
      continue;
    }
    if (c === quote) {
      out += c;
      quote = null;
      continue;
    }
    if (c === "\n") {
      out += "\n";
      if (quote !== "`") quote = null; // same one-line bound as stripComments
      continue;
    }
    out += MASK;
  }

  return out;
};

// A key position holds an identifier, or a quoted name whose contents are now
// MASK. The escape below IS MASK; `objectLiteralKeys reads a QUOTED key` in
// scripts/__tests__/test-ownership.test.mjs is what fails if the two drift.
const KEY_TOKEN_RE = /^(?:(["'`])([\u0001]*)\1|([A-Za-z_$][\w$]*))/;

/**
 * The keys written at depth 1 of the object literal whose `{` sits at `open`,
 * with the offset each one's value starts at.
 *
 * Depth 1 is the point. A flat search for `exclude:` in this config matches the
 * COVERAGE exclude — a key that is correct, has been there since the coverage
 * gate landed, and decides what is reported rather than what is collected. A
 * scanner that refused the config over it would be a false refusal on day one,
 * and this repo has already shipped one of those from a scan that could not
 * tell nesting from text (`stripComments`, whose docstring carries the story).
 *
 * `unreadable` is not the same as "no keys": a spread or a computed key means
 * the set of keys is decided by something text cannot evaluate, and that is a
 * finding rather than a clean result. Returning it as a separate list keeps the
 * caller from reading an empty `keys` as "nothing to worry about".
 */
const objectLiteralKeys = (masked, original, open) => {
  const keys = [];
  const unreadable = [];
  let depth = 1;
  let expectKey = true;
  let i = open + 1;

  const skipSpace = (j) => {
    while (j < masked.length && /\s/.test(masked[j])) j++;
    return j;
  };

  while (i < masked.length) {
    const c = masked[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (depth === 1 && expectKey && c !== "}") {
      expectKey = false;
      if (masked.startsWith("...", i)) {
        unreadable.push(
          "a spread (`...`), which can inject any key — text cannot see which",
        );
        i += 3;
        continue;
      }
      const token = KEY_TOKEN_RE.exec(masked.slice(i));
      if (token && token[3] !== undefined) {
        // A bare identifier: `test: {…}`, or the shorthand `test,`.
        const after = skipSpace(i + token[0].length);
        keys.push({
          name: token[3],
          valueStart: masked[after] === ":" ? skipSpace(after + 1) : null,
        });
        i += token[0].length;
        continue;
      }
      if (token) {
        // A quoted key. The name is masked here; read it from the original.
        const after = skipSpace(i + token[0].length);
        keys.push({
          name: original.slice(i + 1, i + 1 + token[2].length),
          valueStart: masked[after] === ":" ? skipSpace(after + 1) : null,
        });
        i += token[0].length;
        continue;
      }
      if (c === "[") {
        unreadable.push(
          "a computed key (`[expr]:`) — text cannot see which key it names",
        );
        // fall through so the bracket still counts toward depth
      } else {
        unreadable.push(`something that is not a readable key at offset ${i}`);
      }
    }

    if (c === "{" || c === "[" || c === "(") {
      depth++;
      i++;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) return { keys, unreadable, closed: true };
      i++;
      continue;
    }
    if (c === "," && depth === 1) {
      expectKey = true;
      i++;
      continue;
    }
    i++;
  }

  unreadable.push("the object literal is never closed");
  return { keys, unreadable, closed: false };
};

/** The config still delegates to VITEST_INCLUDE: import present, spread present, once. */
const CONFIG_IMPORT_RE =
  /import\s*\{[^}]*\bVITEST_INCLUDE\b[^}]*\}\s*from\s*["']\.\/scripts\/tools-tests\.mjs["']/;
const CONFIG_SPREAD_RE =
  /\binclude\s*:\s*\[\s*\.\.\.\s*VITEST_INCLUDE\s*,?\s*\]/g;

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

  problems.push(...auditConfigKeys(code));
  return problems;
}

/**
 * EVERY OTHER KEY IN THE SAME OBJECT LITERAL, checked against the allowlist.
 *
 * The two checks above pin `include`. They say nothing whatever about the key
 * beside it, and `exclude` and `dir` were each measured on 2026-08-19 removing
 * files from vitest's collection while both gates printed green — see
 * VITEST_TEST_KEYS for the numbers. Pinning one more key by name would have
 * reproduced the same defect a third time, one key further along, so the
 * partition is closed by exhaustion instead: the config may set the keys the
 * allowlist vouches for and nothing else.
 *
 * `src` must already have had its comments stripped by the caller.
 */
export function auditConfigKeys(code) {
  const problems = [];
  const masked = maskStringContents(code);

  const call = /\bdefineConfig\s*\(\s*\{/.exec(masked);
  if (!call) {
    return [
      `${VITEST_CONFIG_FILE} does not hand a plain object literal to defineConfig({ … }) — ` +
        `this gate reads the config as text and cannot tell which keys a computed, merged or ` +
        `function-returned config sets, so it cannot certify that only \`include\` selects files`,
    ];
  }

  const report = (where, found, allowed) => {
    for (const note of found.unreadable) {
      problems.push(
        `${VITEST_CONFIG_FILE} builds ${where} with ${note}, so this gate cannot enumerate ` +
          `its keys — and a key it cannot see is a key that can deselect a test file unseen`,
      );
    }
    for (const { name } of found.keys) {
      // `Object.hasOwn`, never `name in allowed`. `in` walks the prototype
      // chain, so `constructor`, `toString`, `valueOf` and `hasOwnProperty`
      // would every one of them read as vouched-for keys nobody ever vouched
      // for — an allowlist with four free passes in it, granted by the language
      // rather than by anyone's judgement.
      if (Object.hasOwn(allowed, name)) continue;
      problems.push(
        `${VITEST_CONFIG_FILE} sets \`${name}\` in ${where}, which is not vouched for — ` +
          `vitest decides what it collects from more keys than \`include\` (\`exclude\` and ` +
          `\`dir\` were each measured dropping files while both gates stayed green). If ` +
          `${name} cannot remove a test file from the run, add it to ${
            allowed === VITEST_TEST_KEYS
              ? "VITEST_TEST_KEYS"
              : "VITEST_ROOT_KEYS"
          } in scripts/tools-tests.mjs with the one-line reason; if it can, this audit is no ` +
          `longer true and the fix is to take the key back out`,
      );
    }
  };

  const root = objectLiteralKeys(masked, code, call.index + call[0].length - 1);
  report("the top-level config object", root, VITEST_ROOT_KEYS);

  const test = root.keys.find((k) => k.name === "test");
  if (!test) {
    problems.push(
      `${VITEST_CONFIG_FILE} has no \`test\` key — the vitest gate's options are somewhere ` +
        `this gate cannot read them`,
    );
  } else if (test.valueStart === null || masked[test.valueStart] !== "{") {
    problems.push(
      `${VITEST_CONFIG_FILE} sets \`test\` to something other than an object literal, so its ` +
        `file-selection keys cannot be enumerated from text`,
    );
  } else {
    report(
      "`test`",
      objectLiteralKeys(masked, code, test.valueStart),
      VITEST_TEST_KEYS,
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

  const vanished = [];
  const rows = [];
  for (const file of files) {
    let declared;
    try {
      declared = declaredRunner(file);
    } catch (error) {
      // A file that no longer exists is not a partition finding. The walk and
      // the read are separate passes, and on this box seven other agents edit
      // the tree while the gate runs: measured 2026-08-19, `auditOwnership()`
      // died with ENOENT on src/modules/sim/lessons/__tests__/zz-probe-census
      // .test.ts, a scratch file another lane created and deleted between the
      // two. That is a FALSE REFUSAL — it reds the whole tools/ gate, with a
      // stack trace, over a partition that is fine.
      //
      // ENOENT ONLY, and the file is re-checked rather than assumed gone. A
      // bare catch here would swallow a permission error or a bad read and
      // report a clean partition over files it never managed to open, which is
      // the failure this whole script exists to refuse.
      if (error.code !== "ENOENT" || fs.existsSync(file)) throw error;
      vanished.push(slash(path.relative(repo, file)));
      continue;
    }
    const underTools = file.startsWith(slash(tools) + "/");
    // The node gate's real filter, quoted rather than described: `main()` runs
    // exactly the tools/ files whose declared runner is node.
    const nodeRuns =
      underTools && file.endsWith(".test.mjs") && declared === "node";
    const vitestRuns = vitestSet.has(file);
    rows.push({
      file: slash(path.relative(repo, file)),
      declared,
      vitestRuns,
      nodeRuns,
      problem: classify({ declared, vitestRuns, nodeRuns }),
    });
  }

  // `vanished` is returned rather than discarded. Dropping a file from the
  // audit is exactly the move this gate refuses everywhere else, so the count
  // is carried out to the caller and printed — a partition reported over 40
  // fewer files than the walk found is a fact the reader needs, not an
  // implementation detail.
  return { rows, problems: rows.filter((r) => r.problem !== null), vanished };
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

  const { rows, problems, vanished } = auditOwnership();
  if (vanished.length > 0) {
    console.warn(
      `[tools-tests] ${vanished.length} file(s) disappeared between the walk and the read and ` +
        `are NOT in the partition below — ${vanished.join(", ")}`,
    );
  }
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
    console.error(
      "[tools-tests] failed to launch node --test:",
      result.error.message,
    );
    return 1;
  }
  return result.status ?? 1;
}

// Importable: vitest.config.ts reads VITEST_INCLUDE from here and the vitest
// gate imports the audit. Neither may launch a test run as a side effect.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main(process.argv.slice(2)));
}
