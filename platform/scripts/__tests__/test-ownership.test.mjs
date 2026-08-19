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
// THE PREDICTOR CHECKS ITSELF. The audit predicts vitest's file set with
// vitest's own glob engine and options rather than a hand-rolled matcher, and
// the first test below feeds it the one case verified beyond argument: THIS
// file, which is provably being collected by vitest because it is executing.
// If the prediction and the reality ever part — a Windows path separator, a
// changed default, a different hoisted copy of tinyglobby — that is where it
// fails, rather than quietly reporting a clean partition it did not measure.
// -----------------------------------------------------------------------------
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";

import {
  auditConfigWiring,
  auditOwnership,
  classify,
  declaredRunner,
  VITEST_CONFIG_FILE,
  VITEST_DEFAULT_EXCLUDE,
  VITEST_INCLUDE,
  vitestConfigPath,
  vitestWouldRun,
} from "../tools-tests.mjs";
// The real config object, resolved by Vite exactly as vitest resolved it to
// decide this file would run. src/coverage-thresholds.test.ts is the precedent.
import vitestConfig from "../../vitest.config";

const SELF = fileURLToPath(import.meta.url).split("\\").join("/");

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
    const { rows, problems } = auditOwnership();
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
    const { rows } = auditOwnership();
    for (const name of ["ladder", "selectors", "settle"]) {
      const row = rows.find((r) => r.file === `tools/mobile/${name}.test.mjs`);
      expect(row, `tools/mobile/${name}.test.mjs is not in the audit at all`).toBeDefined();
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
    const { rows } = auditOwnership();
    for (const name of ["navigation", "ready", "frames", "insets", "deck-captions"]) {
      const row = rows.find((r) => r.file === `tools/mobile/${name}.test.mjs`);
      expect(row, `tools/mobile/${name}.test.mjs is not in the audit at all`).toBeDefined();
      expect(row.declared).toBe("node");
      expect(row.vitestRuns).toBe(false);
      expect(row.nodeRuns).toBe(true);
    }
  });

  it("collects this gate itself — a gate outside its own audit is not a gate", () => {
    const { rows } = auditOwnership();
    const self = rows.find((r) => r.file === "platform/scripts/__tests__/test-ownership.test.mjs");
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

describe("auditConfigWiring — the node gate's text scan, driven from here", () => {
  const CONFIG_SRC = readFileSync(vitestConfigPath(), "utf8");
  const SPREAD = "include: [...VITEST_INCLUDE],";
  const IMPORT = 'import { VITEST_INCLUDE } from "./scripts/tools-tests.mjs";';

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
    expect(CONFIG_SRC.split(from).length - 1, `anchor is not unique: ${from}`).toBe(1);
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
      mutate(SPREAD, 'include: ["src/**/*.test.{ts,tsx}", "scripts/__tests__/**/*.test.mjs"],'),
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
      mutate(SPREAD, 'include: [...VITEST_INCLUDE, "../tools/mobile/ready.test.mjs"],'),
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
      mutate(SPREAD, '// include: [...VITEST_INCLUDE]\n    include: ["src/**/*.test.{ts,tsx}"],'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0 time\(s\)/);
  });

  it("names the config it scanned, so a rename cannot leave it scanning nothing", () => {
    expect(VITEST_CONFIG_FILE).toBe("vitest.config.ts");
    expect(vitestConfigPath().split("\\").join("/")).toMatch(/\/platform\/vitest\.config\.ts$/);
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
    expect(withFile('import { it } from "vitest";\nit("x", () => {});\n', declaredRunner)).toBe(
      "vitest",
    );
  });

  it("reads a node:test import", () => {
    const src = ['import test from "node' + ':test";', 'test("x", () => {});'].join("\n");
    expect(withFile(src, declaredRunner)).toBe("node");
  });

  it("is not fooled by a header that QUOTES an import it does not make", () => {
    // Not hypothetical. tools/mobile/settle.test.mjs carried a header sentence
    // naming a glob that no longer existed, and a sibling test in that file
    // records the day a scan that could not tell code from prose reported a
    // landed fix as missing. A comment cannot decide which runner owns a file.
    const src = [
      '// This file used to say: import test from "node' + ':test";',
      "/* and this block mentions vitest, from \"vitest\", in passing */",
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
    const src = 'const doc = "https://example.test/x"; import { it } from "vitest";';
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
