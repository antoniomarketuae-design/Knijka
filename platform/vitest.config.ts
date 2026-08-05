import path from "node:path";
import { defineConfig } from "vitest/config";

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
    // `.tsx` is included deliberately (audit L-6): the previous `*.test.ts`
    // glob would have silently ignored a future component test rather than
    // failing loudly, which is the worst way for a test file to be wrong.
    //
    // The second glob reaches OUT of platform/ on purpose (audit M-29): the
    // public/ size ceiling is enforced by tools/assets/publicBudget.test.mjs,
    // and it has to run in the gate everything else runs in, or it is not a
    // ceiling — it is a suggestion nobody executes.
    // The third entry reaches out of platform/ for the same reason the second
    // one does: tools/mobile/budget.test.mjs is the mobile SCREEN BUDGET, and a
    // budget nobody's build enforces is a suggestion. It names ONE FILE because
    // most tools/ tests are node:test files (scripts/tools-tests.mjs owns
    // those) and vitest cannot run them.
    //
    // It used to say `../tools/mobile/**/*.test.mjs`, which contradicted that
    // sentence: the moment the probe rewrite added navigation.test.mjs and
    // ready.test.mjs — both node:test, both green under `node --test` — vitest
    // globbed them and reported "No test suite found" as two hard failures in
    // every gate. The comment was right and the glob was wrong.
    include: [
      "src/**/*.test.{ts,tsx}",
      "../tools/assets/**/*.test.mjs",
      "../tools/mobile/budget.test.mjs",
    ],
    environment: "node",
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
