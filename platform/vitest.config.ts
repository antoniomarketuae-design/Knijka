import path from "node:path";
import { defineConfig } from "vitest/config";

// The include list lives in scripts/tools-tests.mjs, NOT here. It has to be
// readable by both runners: this file is TypeScript loaded by Vite, and the
// node:test gate is plain node with no transpiler, so a list written here is a
// list the other gate cannot check. Keeping it there is what lets
// `auditOwnership()` compare "the runner a test file imports" against "the
// runner that will actually collect it" and fail when they disagree — the
// property the tools/ gate has claimed in its header since it was written and
// did not have until 2026-08-19, when three files in tools/mobile turned out to
// be filtered out of node --test and matched by no vitest glob: 33 test blocks
// and 88 assertions, green because nothing ran them. That module's header
// carries the measurement.
import { VITEST_INCLUDE } from "./scripts/tools-tests.mjs";

/**
 * The commercial path — the code that takes money, grants access and proves a
 * student sat a legally-shaped exam. Audit M-30 found test mass inverted
 * against product risk (90% simulator-side), and L-6 found no coverage tooling
 * at all, so the holes were invisible behind a reassuring "6,845 tests passing".
 *
 * Thresholds are PER-DIRECTORY on purpose. A global percentage is worthless
 * here: the ~6,200 simulator tests would drag the number up on their own, so a
 * green global bar would say nothing about whether checkout or the exam grader
 * is covered. Glob thresholds also opt these directories OUT of any global
 * threshold, which is exactly what we want.
 *
 * The numbers are a RATCHET, not an aspiration: each is set at (or just below)
 * what the suite achieves today, so the gate fails only when someone adds
 * uncovered code to one of these three directories. Raise them when the floor
 * from M-30 lands; never lower one to make a build green.
 */
const COMMERCIAL_PATH_THRESHOLDS = {
  // measured 2026-07-24: 85.38 / 87.23 / 86.36 / 85.42
  "src/modules/payments/**": {
    statements: 84,
    branches: 86,
    functions: 85,
    lines: 84,
  },
  // measured 2026-07-25: 78.69 / 82.22 / 74.47 / 79.87 — the weakest of the
  // three, and the one M-30 says to raise first. `functions` trails because the
  // password-reset store methods are stubbed in the fakes rather than driven.
  "src/modules/auth/**": {
    statements: 77,
    branches: 80,
    functions: 72,
    lines: 78,
  },
  // measured 2026-07-24: 92.35 / 83.44 / 92.47 / 93.51
  "src/modules/exam/**": {
    statements: 91,
    branches: 82,
    functions: 91,
    lines: 92,
  },
} as const;

export default defineConfig({
  test: {
    // Every entry, and the reasoning behind each one, is documented at
    // VITEST_INCLUDE in scripts/tools-tests.mjs. Do not inline a pattern here:
    // a pattern written here is invisible to the node:test gate, and the
    // partition audit that runs in both gates would stop covering it.
    include: [...VITEST_INCLUDE],
    environment: "node",
      // PER-TEST TIME BUDGET — a clock, not a gate. 2026-08-27.
      //
      // vitest default 5 s was written for a small suite. This one is 1,022
      // files and ~16,300 tests on --maxWorkers=2, and a full run takes
      // 590-1,080 s wall-clock on a 7200 rpm disk. Under that contention,
      // filesystem-walking and district-loading tests are starved past 5 s and
      // go red WITHOUT ANY ASSERTION FAILING. Measured on this tree, each
      // standalone versus inside a full run:
      //
      //   tools/assets/publicBudget       0.75 s alone   19.6 s under load
      //   tutor/providerIntegration       0.33 s alone   11.4 s under load
      //   traffic/scenery-sightline T6    1.28 s alone    >5 s under load
      //   traces/barrel-bundle-weight     1.9 s alone     >5 s under load
      //   runtime/world-edge-warning      3.3 s alone     >5 s under load
      //
      // NOT ONE is slower than its own baseline; they are queued behind other
      // files. Patching them one timeout at a time is whack-a-mole: every
      // repair wave adds test files and starves the next shortest budget.
      //
      // 60 s is ~18x the slowest real standalone time here, so a genuine hang
      // still fails. Same reasoning as the drive supervisor 900 s against a
      // 510 s longest real drive (tools/mobile/lib/limits.mjs). NO ASSERTION IS
      // RELAXED: a false red under load is worse than no red, because it
      // teaches the next reader to skip past a real one.
      testTimeout: 60_000,
      hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      // Only source we own and could reasonably test. Route/React files are
      // out of scope until a component-test setup exists (there is no DOM
      // environment configured), and generated artifacts are not authored.
      include: ["src/modules/**/*.ts", "src/lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__tests__/**",
        "**/*.generated.ts",
        "**/index.ts", // pure re-export barrels — nothing to cover
        "**/types.ts", // type-only modules compile away to nothing
        "**/fixtures.ts",
      ],
      thresholds: COMMERCIAL_PATH_THRESHOLDS,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
