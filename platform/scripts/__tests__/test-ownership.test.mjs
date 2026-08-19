// -----------------------------------------------------------------------------
// test-ownership.test.mjs — EVERY TEST FILE IS RUN BY EXACTLY ONE RUNNER.
//
//   npx vitest run scripts/__tests__/test-ownership.test.mjs   (from platform/)
//
// This repo has two test runners. platform/src and a named handful of tools/
// files run under vitest; the rest of tools/ runs under `node --test` via
// scripts/tools-tests.mjs. Ownership is decided in two places that never spoke
// to each other: tools-tests.mjs reads a file's IMPORTS, vitest matches GLOBS.
//
// On 2026-08-19 that gap was measured. `../tools/mobile/**/*.test.mjs` had
// been narrowed to `../tools/mobile/budget.test.mjs` — correctly, because the
// broad glob was swallowing node:test files — and the narrowing orphaned
// ladder.test.mjs, selectors.test.mjs and settle.test.mjs. They import vitest,
// so tools-tests.mjs filtered them out as "vitest has them"; no vitest glob
// matched them, so vitest did not. `npx vitest list --filesOnly` returned 878
// files with no room for the three; asking vitest for them by name printed
// nothing and exited 0. 33 test blocks and 88 assertions, green by absence.
//
// A test nobody runs and a test that asserts nothing are the same defect: a
// green light with nothing behind it. This file and `--audit-only` in
// tools-tests.mjs are the two independent places that refuse it, one in each
// runner.
//
// THE SENTENCE THAT USED TO FINISH THAT PARAGRAPH WAS FALSE, and it was false
// for the same reason the sentence it replaced in settle.test.mjs was false —
// it described a property nobody had tried to break. It said "so it takes two
// deliberate acts to go blind again". MEASURED 2026-08-19 BY MUTATION: put the
// four literal patterns back into `include:` in platform/vitest.config.ts, so
// that the config no longer spreads VITEST_INCLUDE, and
//   · asking vitest for ladder/selectors/settle by name — `npx vitest list
//     --filesOnly ../tools/mobile/settle.test.mjs …` — printed NOTHING, exit 0,
//   · `node scripts/tools-tests.mjs --audit-only` printed "partition OK … none
//     orphaned" and exited 0,
//   · this file passed all 20 of its tests, none of which looked at the config.
// One edit, one file, and neither runner noticed — because `vitestWouldRun()`
// globs the CONSTANT, and nothing anywhere asserted that the config still used
// it. The audit was auditing a list that had stopped deciding anything.
//
// SO THE DELEGATION IS NOW CHECKED IN BOTH RUNNERS, by two checks that see
// different things. tools-tests.mjs scans the config as TEXT, because plain
// node cannot load a .ts file, and requires the literal
// `include: [...VITEST_INCLUDE]`. This file imports the REAL config — the same
// module vitest itself loaded to decide what to run — and deep-compares the
// resolved value. Text cannot see a value; a value cannot see whether it was
// spread or retyped. Neither check subsumes the other, which is what makes two
// acts two.
//
// AND THAT FIX THEN REPRODUCED THE DEFECT ONE KEY OVER, WHICH IS WHY THE
// ALLOWLIST BLOCKS BELOW EXIST. Everything above is about `include`. Nothing
// above has any opinion about the key written NEXT to it, and `test: { … }`
// accepts eighty-odd keys of which several decide what vitest collects.
// MEASURED 2026-08-19, `include: [...VITEST_INCLUDE]` untouched, one key added
// beside it in platform/vitest.config.ts:
//   · `exclude: [… , "../tools/mobile/settle.test.mjs"]` — `npx vitest list
//     --filesOnly` went 892 → 891, and asking vitest for settle.test.mjs by
//     name printed NOTHING and exited 0.
//   · `dir: "src"` — `npx vitest list --filesOnly` returned 0 files.
// Both gates green through both: `auditConfigWiring()` returned `[]`, the node
// gate printed "partition OK … none orphaned", and the deep-equality two
// paragraphs up passed, because `include` had not changed. Three lanes running,
// three orphan classes, one unchanged shape — a property proved on the axis
// somebody had just been looking at and asserted on the others.
//
// THE PARTITION IS THEREFORE CLOSED BY EXHAUSTION, NOT BY NAMING KEYS. Pinning
// `exclude` would have left `dir`; pinning `dir` would have left `projects`;
// the next vitest minor adds keys nobody here has read. The config may set only
// the keys VITEST_ROOT_KEYS and VITEST_TEST_KEYS vouch for, each with the
// recorded reason it cannot deselect a file, and an unlisted key is refused BY
// NAME in both runners. The split holds here too: the node gate reads the key
// structure out of the source text, this file reads `Object.keys()` off the
// object vitest actually resolved — so a key arriving by spread, by
// `mergeConfig`, or under a computed name is caught as a value where no text
// scan could see it, and a `defineConfig` this scanner cannot parse is caught
// as text where the value would look perfectly ordinary.
//
// AND HERE IS THE LIMIT OF THIS HALF, stated rather than left to be discovered
// by whoever next builds on it. Both mutations were run against the REAL config
// and both gates were watched:
//   · `exclude` — the node gate exited 1 naming `exclude`, and this file went
//     red on the value assertion, 17 tests failing. Two independent refusals.
//   · `dir: "src"` — the node gate exited 1 naming `dir`. This file did NOT go
//     red on an assertion. It could not: vitest printed "No test files found,
//     exiting with code 1" and never collected this file, because `dir` had
//     removed the gate from its own gate. Still a hard red, but a red no
//     assertion here produced.
// A key that deselects THIS file silences every check in it, which is the
// green-by-absence shape the whole file is about, one level up. That is why the
// node gate is not a convenience copy: it is the only half that can speak when
// vitest has been configured not to find this file. It is also why
// `passWithNoTests` is refused. MEASURED on the real config the same day:
// `dir: "src"` plus `passWithNoTests: true` turns that loud "No test files
// found, exiting with code 1" into "No test files found, exiting with code 0" —
// the vitest gate passes having run nothing at all, and `node
// scripts/tools-tests.mjs --audit-only` exits 1 naming BOTH keys. Two keys, and
// the node gate is the only half left standing.
//
// NEITHER HALF SEES THE COMMAND LINE. Both read the config file; a `--exclude`
// or `--dir` passed at invocation would deselect files without either gate
// having anything to look at. Checked rather than assumed: .github/workflows/
// ci.yml runs the bare `npx vitest run` and `npm run test:tools`, no selection
// flags on either, so nothing today exploits it. That file is not this lane's
// to change — if a flag is ever added there, this comment is the reason it
// needs a check of its own.
//
// THE PREDICTOR CHECKS ITSELF. The audit predicts vitest's file set with
// vitest's own glob engine and options rather than a hand-rolled matcher, and
// the first test below feeds it the one case verified beyond argument: THIS
// file, which is provably being collected by vitest because it is executing.
// If the prediction and the reality ever part — a Windows path separator, a
// changed default, a different hoisted copy of tinyglobby — that is where it
// fails, rather than quietly reporting a clean partition it did not measure.
// -----------------------------------------------------------------------------
import fs, { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";

import {
  auditConfigWiring,
  auditOwnership,
  classify,
  declaredRunner,
  paths,
  VITEST_CONFIG_FILE,
  VITEST_DEFAULT_EXCLUDE,
  VITEST_INCLUDE,
  VITEST_ROOT_KEYS,
  VITEST_TEST_KEYS,
  vitestConfigPath,
  vitestWouldRun,
} from "../tools-tests.mjs";
// The real config object, resolved by Vite exactly as vitest resolved it to
// decide this file would run. src/coverage-thresholds.test.ts is the precedent.
import vitestConfig from "../../vitest.config";

const SELF = fileURLToPath(import.meta.url)
  .split("\\")
  .join("/");

/**
 * The whole-repo audit, computed ONCE for the five tests that read it.
 *
 * It walks 913 files across 709 directories and reads every one. Measured
 * 2026-08-19: 495 ms warm, but the first call in a fresh process is bounded by
 * the OS file cache on this box's 7200 rpm HDD and ranged from 558 ms to 48 s
 * across seven runs with seven other agents in the tree. Five independent calls
 * multiplied that by five for no new information — the audit is a pure read of
 * a tree no test here mutates.
 */
let auditMemo = null;
const audit = () => (auditMemo ??= auditOwnership());

/**
 * The timeout for anything that walks or globs the repository.
 *
 * vitest's default is 5 s, and on 2026-08-19 `leaves no test file unowned…`
 * took 77 s and failed on it — a FALSE FAILURE, red for the state of the disk
 * rather than the state of the partition, and the fastest way to get a gate
 * deleted or wrapped in `--retry`. Nothing here is loosened: the assertions are
 * unchanged and still fail on a real orphan in milliseconds. Only the patience
 * is sized from the measurement above, with headroom over the worst cold run.
 */
const DISK_BOUND_MS = 120_000;

// Pay the cold walk and the cold glob ONCE, here, where the budget is stated,
// rather than in whichever test happened to run first — which is how a suite
// ends up with one arbitrarily slow test and seven fast ones, and how the
// 77-second failure above landed on the partition assertion rather than on the
// disk that actually caused it.
beforeAll(() => {
  audit();
  vitestWouldRun();
}, DISK_BOUND_MS);

describe("the predictor is checked against a file known to be running", () => {
  it("predicts THIS file, which vitest demonstrably collected", () => {
    // Ground truth, not a second opinion: this assertion is only ever
    // evaluated because vitest found and loaded this file. A predictor that
    // cannot name it is wrong about every other file it clears.
    expect([...vitestWouldRun()]).toContain(SELF);
  });

  it("predicts only files that exist", () => {
    // A matcher that invents paths would clear an orphan by pairing it with a
    // path nothing ever runs.
    const predicted = [...vitestWouldRun()];
    expect(predicted.length).toBeGreaterThan(100);
    expect(predicted.every((f) => f.includes("/"))).toBe(true);
  });

  it("uses vitest's real default exclude, not a copy that has drifted", () => {
    // VITEST_DEFAULT_EXCLUDE is copied out of vitest's internals so that the
    // node gate can glob without dragging Vite in. This is the pin that stops
    // the copy from rotting into a prediction vitest does not share.
    expect(VITEST_DEFAULT_EXCLUDE).toEqual(configDefaults.exclude);
  });
});

describe("the partition over the whole repository", () => {
  it("leaves no test file unowned, shared, or claimed by the wrong runner", () => {
    const { rows, problems } = audit();
    expect(
      problems.map((p) => `${p.file} — ${p.problem}`),
      "a test file is not run by exactly one runner",
    ).toEqual([]);
    // Discovery that finds nothing must fail rather than pass quietly: an
    // empty problem list over an empty file list is the shape of every "0
    // defects" instrument bug this project has had.
    expect(rows.length).toBeGreaterThan(800);
  });

  it("pins the three files that were orphaned, by name", () => {
    // The named regression. Drop any one of these from VITEST_INCLUDE and this
    // goes red naming it, in the same commit rather than at the next audit.
    const { rows } = audit();
    for (const name of ["ladder", "selectors", "settle"]) {
      const row = rows.find((r) => r.file === `tools/mobile/${name}.test.mjs`);
      expect(
        row,
        `tools/mobile/${name}.test.mjs is not in the audit at all`,
      ).toBeDefined();
      expect(row.declared).toBe("vitest");
      expect(row.vitestRuns).toBe(true);
      expect(row.nodeRuns).toBe(false);
    }
  });

  it("still leaves the node:test files to node — the narrowing was not undone", () => {
    // The defect this cuts BOTH ways. The broad glob that once covered the
    // three also covered navigation.test.mjs and ready.test.mjs, which are
    // node:test files, and vitest reported "No test suite found" as two hard
    // failures in every gate. Fixing the orphans by widening the glob again
    // would trade a silent failure for a loud one, not fix anything.
    const { rows } = audit();
    for (const name of [
      "navigation",
      "ready",
      "frames",
      "insets",
      "deck-captions",
    ]) {
      const row = rows.find((r) => r.file === `tools/mobile/${name}.test.mjs`);
      expect(
        row,
        `tools/mobile/${name}.test.mjs is not in the audit at all`,
      ).toBeDefined();
      expect(row.declared).toBe("node");
      expect(row.vitestRuns).toBe(false);
      expect(row.nodeRuns).toBe(true);
    }
  });

  it("collects this gate itself — a gate outside its own audit is not a gate", () => {
    const { rows } = audit();
    const self = rows.find(
      (r) => r.file === "platform/scripts/__tests__/test-ownership.test.mjs",
    );
    expect(self).toBeDefined();
    expect(self.problem).toBeNull();
    expect(VITEST_INCLUDE).toContain("scripts/__tests__/**/*.test.mjs");
  });
});

describe("the config still delegates to VITEST_INCLUDE — the half text cannot check", () => {
  it("the include vitest actually resolved IS VITEST_INCLUDE, entry for entry", () => {
    // THE ASSERTION THE WHOLE AUDIT RESTS ON AND DID NOT HAVE. Everything in
    // the describe blocks above reasons about VITEST_INCLUDE; none of it is
    // worth anything unless VITEST_INCLUDE is what the config hands vitest.
    // `vitestConfig` here is the module vitest loaded to decide that this file
    // would run at all, so a disagreement is between the constant and reality,
    // not between two opinions.
    expect(vitestConfig.test?.include).toEqual([...VITEST_INCLUDE]);
  });

  it("catches an include that no longer spreads the constant — the one-edit mutation", () => {
    // The exact mutation measured on 2026-08-19: the four literal patterns the
    // config held before the orphan fix. Deep-equality catches it here even
    // though the node gate's text scan is what names it there.
    const narrowed = [
      "src/**/*.test.{ts,tsx}",
      "scripts/__tests__/**/*.test.mjs",
      "../tools/assets/**/*.test.mjs",
      "../tools/mobile/budget.test.mjs",
    ];
    expect(narrowed).not.toEqual([...VITEST_INCLUDE]);
    // …and the three orphans are exactly what the difference consists of.
    for (const name of ["ladder", "selectors", "settle"]) {
      expect(VITEST_INCLUDE).toContain(`../tools/mobile/${name}.test.mjs`);
      expect(narrowed).not.toContain(`../tools/mobile/${name}.test.mjs`);
    }
  });
});

describe("a file that disappears mid-audit is counted, not crashed on and not hidden", () => {
  /**
   * The race, driven at the read rather than simulated.
   *
   * NOT HYPOTHETICAL. On 2026-08-19 `auditOwnership()` died with an unhandled
   * ENOENT on src/modules/sim/lessons/__tests__/zz-probe-census.test.ts — a
   * scratch file another lane created and deleted between this audit's walk and
   * its read. The whole tools/ gate went red, with a stack trace, over a
   * partition that was perfectly fine: a false refusal, on a box where seven
   * agents share the tree.
   */
  const VICTIM = "tools/mobile/settle.test.mjs";
  const isVictim = (p) => String(p).split("\\").join("/").endsWith(VICTIM);
  const withFs = (readFileSync_, existsSync_, fn) => {
    const read = fs.readFileSync;
    const exists = fs.existsSync;
    fs.readFileSync = readFileSync_(read);
    fs.existsSync = existsSync_(exists);
    try {
      return fn();
    } finally {
      fs.readFileSync = read;
      fs.existsSync = exists;
    }
  };
  const enoent = (p) =>
    Object.assign(new Error(`ENOENT: no such file, open ${p}`), {
      code: "ENOENT",
    });

  it(
    "drops it from the rows, names it in `vanished`, and calls it no finding",
    { timeout: DISK_BOUND_MS },
    () => {
      const result = withFs(
        (read) => (p, o) =>
          isVictim(p)
            ? (() => {
                throw enoent(p);
              })()
            : read(p, o),
        (exists) => (p) => (isVictim(p) ? false : exists(p)),
        () => auditOwnership(),
      );
      expect(result.vanished).toEqual([VICTIM]);
      expect(result.problems).toEqual([]);
      expect(result.rows.some((r) => r.file === VICTIM)).toBe(false);
    },
  );

  it(
    "still THROWS when the file is right there — the swallow-everything version",
    { timeout: DISK_BOUND_MS },
    () => {
      // The direction that matters more. A bare `catch { return null }` here
      // would report a clean partition over every file it failed to open, which
      // is this script's own failure mode wearing a helpful face. ENOENT is
      // only forgiven when the file is genuinely gone, re-checked on the spot.
      expect(() =>
        withFs(
          (read) => (p, o) =>
            isVictim(p)
              ? (() => {
                  throw enoent(p);
                })()
              : read(p, o),
          (exists) => exists, // …but the file still exists
          () => auditOwnership(),
        ),
      ).toThrow(/ENOENT/);
    },
  );

  it(
    "still THROWS on a read error that is not ENOENT at all",
    { timeout: DISK_BOUND_MS },
    () => {
      expect(() =>
        withFs(
          (read) => (p, o) =>
            isVictim(p)
              ? (() => {
                  throw Object.assign(new Error("EACCES"), { code: "EACCES" });
                })()
              : read(p, o),
          (exists) => () => false,
          () => auditOwnership(),
        ),
      ).toThrow(/EACCES/);
    },
  );
});

describe("no OTHER key in that literal can deselect a file — the value half", () => {
  // `Object.hasOwn`, never `k in allowed` — the same note sits at the matching
  // check in tools-tests.mjs. `in` walks the prototype chain, so `constructor`,
  // `toString`, `valueOf` and `hasOwnProperty` would all read as vouched for:
  // an allowlist with four free passes granted by the language rather than by
  // anyone's judgement. The test below drives exactly that.
  const unvouched = (obj, allowed) =>
    Object.keys(obj).filter((k) => !Object.hasOwn(allowed, k));

  it("the resolved config sets only vouched-for keys at the top level", () => {
    // `Object.keys` of the object vitest resolved, not tokens in a file. A key
    // that arrived by spread or under a computed name is here and is nowhere in
    // the source text.
    expect(unvouched(vitestConfig, VITEST_ROOT_KEYS)).toEqual([]);
  });

  it("…and only vouched-for keys inside `test`", () => {
    expect(unvouched(vitestConfig.test, VITEST_TEST_KEYS)).toEqual([]);
  });

  it("is not vacuous — the object it checks is the one that carries `include`", () => {
    // An allowlist check over an empty object passes. This is the guard against
    // reading a green tick off a config this test never actually reached.
    expect(Object.keys(vitestConfig.test)).toContain("include");
    expect(Object.keys(VITEST_TEST_KEYS)).toContain("include");
  });

  it("catches a key present only as a VALUE — the half no text scan can reach", () => {
    // THE MUTATION. `...spread` is the shape the node gate can only report as
    // "unreadable"; here the injected key is an ordinary own property, so it is
    // named. Nothing about this passes before the check exists.
    const merged = { ...vitestConfig.test, exclude: ["**/node_modules/**"] };
    expect(unvouched(merged, VITEST_TEST_KEYS)).toEqual(["exclude"]);
    const computed = { ...vitestConfig.test, ["d" + "ir"]: "src" };
    expect(unvouched(computed, VITEST_TEST_KEYS)).toEqual(["dir"]);
  });

  it("does not vouch for a key just because Object.prototype has one by that name", () => {
    // Under `k in allowed` — the shape this was written as first — every one of
    // these passes silently, because `"constructor" in {}` is true. Four keys
    // waved through by the language, in a list whose entire job is that nothing
    // gets waved through. Not exploitable via a real vitest option today; the
    // point is that the check is exact rather than nearly exact.
    for (const inherited of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
    ]) {
      expect(
        inherited in VITEST_TEST_KEYS,
        `${inherited} is reachable via the prototype`,
      ).toBe(true);
      expect(unvouched({ [inherited]: 1 }, VITEST_TEST_KEYS)).toEqual([
        inherited,
      ]);
    }
  });

  it("every vouched-for key records WHY it cannot deselect a file", () => {
    // The allowlist is only as good as the reasoning in it. An entry added to
    // make a build green, with an empty or placeholder reason, is the next
    // "silencing it takes two deliberate acts" — a sentence nobody tested.
    for (const [key, reason] of Object.entries({
      ...VITEST_ROOT_KEYS,
      ...VITEST_TEST_KEYS,
    })) {
      expect(reason, `${key} has no recorded reason`).toBeTypeOf("string");
      expect(
        reason.length,
        `${key}'s reason is too short to be one`,
      ).toBeGreaterThan(40);
    }
  });
});

describe("the keys are dangerous for a measured reason, not a supposed one", () => {
  // These do not test the guard. They test the PREMISE the guard rests on —
  // that these keys really can remove a file — because a guard against a
  // hazard that does not exist is how a lane reports a fix and changes nothing.
  it(
    "`exclude` beside an untouched `include` removes a file, and exactly one",
    { timeout: DISK_BOUND_MS },
    () => {
      const base = vitestWouldRun();
      const dropped = vitestWouldRun({
        exclude: [...VITEST_DEFAULT_EXCLUDE, "../tools/mobile/settle.test.mjs"],
      });
      const gone = [...base].filter((f) => !dropped.has(f));
      expect(gone.map((f) => f.split("/").slice(-3).join("/"))).toEqual([
        "tools/mobile/settle.test.mjs",
      ]);
      // …and settle.test.mjs is a file the partition audit swears is covered.
      const { rows } = audit();
      const row = rows.find((r) => r.file === "tools/mobile/settle.test.mjs");
      expect(row.vitestRuns).toBe(true);
      expect(row.problem).toBeNull();
    },
  );

  it(
    "`dir`/`root` — moving the base directory takes every out-of-tree file with it",
    { timeout: DISK_BOUND_MS },
    () => {
      // `dir: "src"` measured against the real vitest on 2026-08-19: 0 files
      // collected, down from 892. The glob reproduces it, which is the check that
      // the prediction and the runner still agree about what a base directory is.
      const narrowed = vitestWouldRun({ cwd: join(paths().platform, "src") });
      expect(narrowed.size).toBe(0);
      expect(vitestWouldRun().size).toBeGreaterThan(800);
    },
  );
});

describe("auditConfigWiring — the node gate's text scan, driven from here", () => {
  const CONFIG_SRC = readFileSync(vitestConfigPath(), "utf8");
  const SPREAD = "include: [...VITEST_INCLUDE],";
  const IMPORT = 'import { VITEST_INCLUDE } from "./scripts/tools-tests.mjs";';
  const TOP_LEVEL = "export default defineConfig({";

  /**
   * Mutate the REAL config source, not a synthetic stand-in.
   *
   * A synthetic sample would omit the two things that make this file hard to
   * scan — a second `include:` key under `coverage`, and glob strings holding a
   * doubled star — and a scanner proven only against the easy shape is a
   * scanner proven against nothing. The uniqueness check is not decoration: a
   * mutation helper whose anchor silently matches nothing returns the original
   * source, and every assertion below would then pass by testing the unmutated
   * file.
   */
  const mutate = (from, to) => {
    expect(
      CONFIG_SRC.split(from).length - 1,
      `anchor is not unique: ${from}`,
    ).toBe(1);
    const out = CONFIG_SRC.replace(from, to);
    expect(out, "the mutation changed nothing").not.toBe(CONFIG_SRC);
    return out;
  };

  it("clears the real config — the case verified by eye, and by this run existing", () => {
    // The self-check. This scan runs as a hard precondition of the node gate,
    // so a false REFUSAL here would block every tools/ test in CI — which is
    // how the stripComments defect was found rather than shipped.
    expect(auditConfigWiring(CONFIG_SRC)).toEqual([]);
  });

  it("refuses a config that inlines the patterns instead of spreading them", () => {
    const problems = auditConfigWiring(
      mutate(
        SPREAD,
        'include: ["src/**/*.test.{ts,tsx}", "scripts/__tests__/**/*.test.mjs"],',
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0 time\(s\), expected exactly 1/);
  });

  it("refuses a pattern smuggled in BESIDE the spread — invisible to the node gate", () => {
    // The quieter half of the same defect. Adding a pattern here rather than to
    // VITEST_INCLUDE gives vitest a file the ownership audit believes nobody
    // runs, so the audit reports an orphan that is not one — a FALSE FAILURE,
    // and the founder's own complaint is a false failure.
    const problems = auditConfigWiring(
      mutate(
        SPREAD,
        'include: [...VITEST_INCLUDE, "../tools/mobile/ready.test.mjs"],',
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0 time\(s\)/);
  });

  it("refuses a locally-defined VITEST_INCLUDE that shadows the shared one", () => {
    // The spread survives and resolves — to a list this repo's node gate has
    // never seen. Only the import check can tell the difference.
    const problems = auditConfigWiring(
      mutate(IMPORT, 'const VITEST_INCLUDE = ["src/**/*.test.{ts,tsx}"];'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/does not import VITEST_INCLUDE/);
  });

  it("is not satisfied by the rule written as a COMMENT above a config that breaks it", () => {
    // The config's own header already says "Do not inline a pattern here". It
    // said so on the day the mutation above went green in both gates. Prose is
    // not a gate; a scanner that counts prose is not a gate either.
    const problems = auditConfigWiring(
      mutate(
        SPREAD,
        '// include: [...VITEST_INCLUDE]\n    include: ["src/**/*.test.{ts,tsx}"],',
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0 time\(s\)/);
  });

  it("names the config it scanned, so a rename cannot leave it scanning nothing", () => {
    expect(VITEST_CONFIG_FILE).toBe("vitest.config.ts");
    expect(vitestConfigPath().split("\\").join("/")).toMatch(
      /\/platform\/vitest\.config\.ts$/,
    );
  });

  // ── the key beside the spread, mutation by mutation ──────────────────────
  //
  // Each of these leaves `include: [...VITEST_INCLUDE]` completely alone. That
  // is the point: every one of them passed both gates before this block
  // existed, and `exclude` and `dir` were measured actually removing files.

  it("refuses `exclude` written beside an untouched spread", () => {
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    exclude: ["**/x/**"],`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `exclude` in `test`/);
  });

  it("refuses `dir`, which collapsed collection to 0 files when it was measured", () => {
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    dir: "src",`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `dir` in `test`/);
  });

  it("refuses `projects`, which supersedes the root include entirely", () => {
    const problems = auditConfigWiring(
      mutate(
        SPREAD,
        `${SPREAD}\n    projects: [{ test: { include: ["src/**"] } }],`,
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `projects` in `test`/);
  });

  it("refuses a key it has simply never heard of, rather than assuming it is safe", () => {
    // THE WHOLE REASON THIS IS AN ALLOWLIST. `passWithNoTests` turns "no files
    // matched" from a hard failure into a green run — the single most direct
    // way to make an empty partition look like a clean one — and no denylist
    // written before today would have contained it.
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    passWithNoTests: true,`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `passWithNoTests` in `test`/);
  });

  it("objectLiteralKeys reads a QUOTED key — a name in quotes is still a name", () => {
    // Not decoration. The scanner blanks the INSIDE of every string so that a
    // glob's braces and commas cannot throw off the depth count, and a quoted
    // key is a string. If the mask and KEY_TOKEN_RE in tools-tests.mjs ever
    // drift apart, `"exclude": […]` becomes invisible and this is what says so.
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    "exclude": ["**/x/**"],`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `exclude` in `test`/);
  });

  it("refuses a key named after an Object.prototype member — the text half", () => {
    // The same free-pass hole as the value half, on the other instrument.
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    toString: null,`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `toString` in `test`/);
  });

  it("refuses top-level keys too — `root` moves the base every include resolves from", () => {
    const problems = auditConfigWiring(
      mutate(TOP_LEVEL, `${TOP_LEVEL}\n  root: "./src",`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sets `root` in the top-level config object/);
  });

  it("refuses `plugins`, because a plugin's config hook can set any of the above", () => {
    const problems = auditConfigWiring(
      mutate(TOP_LEVEL, `${TOP_LEVEL}\n  plugins: [dropSome()],`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /sets `plugins` in the top-level config object/,
    );
  });

  it("reports a spread as UNREADABLE rather than clearing the keys it can see", () => {
    // The honest answer when text cannot enumerate: not "no bad keys found".
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    ...extraOptions,`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/a spread/);
  });

  it("reports a computed key as UNREADABLE — a concatenation names nothing to text", () => {
    const problems = auditConfigWiring(
      mutate(SPREAD, `${SPREAD}\n    ["ex" + "clude"]: ["x"],`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/a computed key/);
  });

  it("refuses a config it cannot parse at all rather than reporting it clean", () => {
    const problems = auditConfigWiring(
      mutate(TOP_LEVEL, "export default defineConfig(() => ({"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/does not hand a plain object literal/);
  });

  it("does NOT refuse the coverage `exclude` — depth is the whole difference", () => {
    // THE FALSE REFUSAL THIS WOULD HAVE SHIPPED. platform/vitest.config.ts has
    // carried `exclude:` inside `coverage` since the coverage gate landed. It
    // is correct, it decides what is REPORTED, and a flat text search for
    // "exclude:" would red a correct config on day one — the same shape as the
    // stripComments false refusal that this repo caught only by luck.
    expect(CONFIG_SRC).toMatch(/coverage:\s*\{/);
    expect(CONFIG_SRC.split(/\bexclude:/).length - 1).toBeGreaterThanOrEqual(1);
    expect(auditConfigWiring(CONFIG_SRC)).toEqual([]);
  });
});

describe("classify — every verdict it can reach, reached", () => {
  // The decision is pure arithmetic over four facts, so it is driven with all
  // of them rather than only the combination that is on disk today. Each row
  // below is a mutation of the tree that has actually happened here or is one
  // narrowed glob away.
  const cases = [
    {
      what: "the state the repo is in now: written for vitest, globbed by vitest",
      input: { declared: "vitest", vitestRuns: true, nodeRuns: false },
      expect: null,
    },
    {
      what: "a node:test file under tools/, run by node",
      input: { declared: "node", vitestRuns: false, nodeRuns: true },
      expect: null,
    },
    {
      what: "THE DEFECT: a vitest file no glob matches",
      input: { declared: "vitest", vitestRuns: false, nodeRuns: false },
      expect: /run by NEITHER/,
    },
    {
      what: "a node:test file outside tools/, which nothing walks",
      input: { declared: "node", vitestRuns: false, nodeRuns: false },
      expect: /run by NEITHER/,
    },
    {
      what: "THE OTHER DEFECT: a glob widened until it swallows node:test files",
      input: { declared: "node", vitestRuns: true, nodeRuns: true },
      expect: /BOTH runners/,
    },
    {
      what: "claimed by the wrong runner — it will load and find no suite",
      input: { declared: "node", vitestRuns: true, nodeRuns: false },
      expect: /written for node but claimed by vitest/,
    },
    {
      what: "a file that imports no runner at all — the TEMPORARY-probe class",
      input: { declared: null, vitestRuns: true, nodeRuns: false },
      expect: /imports neither/,
    },
    {
      what: "…and it stays a finding even when nothing would run it either",
      input: { declared: null, vitestRuns: false, nodeRuns: false },
      expect: /imports neither/,
    },
  ];

  for (const c of cases) {
    it(c.what, () => {
      const verdict = classify(c.input);
      if (c.expect === null) expect(verdict).toBeNull();
      else expect(verdict).toMatch(c.expect);
    });
  }
});

describe("declaredRunner reads code, not prose about code", () => {
  /** Write a throwaway file outside the repo — the audit must not see it. */
  const withFile = (source, fn) => {
    const dir = mkdtempSync(join(tmpdir(), "runner-partition-"));
    try {
      const file = join(dir, "probe.test.mjs");
      writeFileSync(file, source, "utf8");
      return fn(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("reads a vitest import", () => {
    expect(
      withFile(
        'import { it } from "vitest";\nit("x", () => {});\n',
        declaredRunner,
      ),
    ).toBe("vitest");
  });

  it("reads a node:test import", () => {
    const src = [
      'import test from "node' + ':test";',
      'test("x", () => {});',
    ].join("\n");
    expect(withFile(src, declaredRunner)).toBe("node");
  });

  it("is not fooled by a header that QUOTES an import it does not make", () => {
    // Not hypothetical. tools/mobile/settle.test.mjs carried a header sentence
    // naming a glob that no longer existed, and a sibling test in that file
    // records the day a scan that could not tell code from prose reported a
    // landed fix as missing. A comment cannot decide which runner owns a file.
    const src = [
      '// This file used to say: import test from "node' + ':test";',
      '/* and this block mentions vitest, from "vitest", in passing */',
      "export const nothing = 1;",
    ].join("\n");
    expect(withFile(src, declaredRunner)).toBeNull();
  });

  it("returns null for a file that imports no runner — the green-tick-for-nothing case", () => {
    expect(withFile("export const probe = 1;\n", declaredRunner)).toBeNull();
  });

  it("does not mistake a URL for a comment and delete half the file", () => {
    // `https://x` inside a string is not a line comment. The stripper used to
    // dodge this with a `[^:]` lookbehind hack; it now knows what a string is,
    // and this stays here because the hack going away must not take the
    // behaviour with it.
    const src =
      'const doc = "https://example.test/x"; import { it } from "vitest";';
    expect(withFile(src, declaredRunner)).toBe("vitest");
  });

  it("does not mistake a GLOB for a block comment and delete the rest of the file", () => {
    // NOT HYPOTHETICAL, AND NOT FOUND BY READING. The old stripper opened a
    // block comment on the slash-star inside any doubled-star glob and closed
    // it at the next star-slash — which the NEXT glob supplies. Everything
    // between vanished, imports included.
    //
    // It surfaced on 2026-08-19 when the new config scan refused
    // platform/vitest.config.ts, a file that was CORRECT: its
    // "src/modules/payments/" coverage key opened the comment and the coverage
    // include glob closed it, forty lines and one `include: [...VITEST_INCLUDE]`
    // later. A false refusal, caught only because the first thing the new check
    // did was run against a file already known to be right.
    //
    // Under the old stripper this source classifies as null; under the new one
    // it is what it plainly is. All 910 test files in the repo were classified
    // with both implementations and agreed, so this is the one shape that moved.
    const src = [
      'const a = "src/modules/payments/**";',
      'import { it } from "vitest";',
      'const b = "src/modules/**/*.ts";',
      'it("x", () => {});',
    ].join("\n");
    expect(withFile(src, declaredRunner)).toBe("vitest");
  });

  it("still strips a real block comment that happens to sit between globs", () => {
    // The other direction, because a stripper that stopped stripping would
    // also make the test above pass. A genuine block comment claiming an
    // import must still not count as one.
    const src = [
      'const a = "src/**";',
      '/* this block says: import { it } from "vitest"; and it is still prose */',
      'const b = "y/**/z";',
      "export const nothing = 1;",
    ].join("\n");
    expect(withFile(src, declaredRunner)).toBeNull();
  });
});
