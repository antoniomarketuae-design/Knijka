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
// tools-tests.mjs are the two independent places that now refuse it, one in
// each runner, so it takes two deliberate acts to go blind again.
//
// THE PREDICTOR CHECKS ITSELF. The audit predicts vitest's file set with
// vitest's own glob engine and options rather than a hand-rolled matcher, and
// the first test below feeds it the one case verified beyond argument: THIS
// file, which is provably being collected by vitest because it is executing.
// If the prediction and the reality ever part — a Windows path separator, a
// changed default, a different hoisted copy of tinyglobby — that is where it
// fails, rather than quietly reporting a clean partition it did not measure.
// -----------------------------------------------------------------------------
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";

import {
  auditOwnership,
  classify,
  declaredRunner,
  VITEST_DEFAULT_EXCLUDE,
  VITEST_INCLUDE,
  vitestWouldRun,
} from "../tools-tests.mjs";

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
    // The `[^:]` guard in the comment stripper. Without it, `https://x` eats
    // the rest of the line and can take the import with it.
    const src = 'const doc = "https://example.test/x"; import { it } from "vitest";';
    expect(withFile(src, declaredRunner)).toBe("vitest");
  });
});
