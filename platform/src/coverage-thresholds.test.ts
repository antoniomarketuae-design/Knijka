/**
 * Coverage-gate guard (audit L-6).
 *
 * The finding was not "coverage is low" — it was that nothing MEASURED it, so
 * "6,845 tests passing" read as strength while `modules/auth` sat at zero. The
 * fix is a per-directory threshold on the commercial path; this test guards the
 * fix itself, because a coverage gate is exactly the kind of config a future
 * session deletes to make a red build green.
 *
 * Two things are asserted, both structural:
 *  1. every directory on the commercial path (payments / auth / exam) still
 *     carries a four-metric threshold, and none of them is a token number;
 *  2. the test glob still matches `.tsx`, so a component test cannot be
 *     silently ignored the way it would have been before.
 *
 * It deliberately does NOT assert the threshold VALUES. Those are a ratchet the
 * founder is expected to raise; pinning them here would make raising one a
 * two-file edit and invite deleting the guard instead.
 */

import { describe, expect, it } from "vitest";
import config from "../vitest.config";

/** The three directories the audit says a failure costs a customer. */
const COMMERCIAL_PATH = [
  "src/modules/payments/**",
  "src/modules/auth/**",
  "src/modules/exam/**",
] as const;

const METRICS = ["statements", "branches", "functions", "lines"] as const;

/**
 * Below this a threshold is decoration: v8 reports high statement coverage for
 * merely IMPORTING a module, so anything under ~40% can be met by code nobody
 * exercises. The gate must be able to fail.
 */
const MEANINGFUL_THRESHOLD_PCT = 40;

const test = config.test ?? {};
const coverage = (test.coverage ?? {}) as {
  provider?: string;
  thresholds?: Record<string, Record<string, number> | boolean | number>;
};

describe("vitest coverage gate — the commercial path (audit L-6)", () => {
  it("has a coverage provider installed at all", () => {
    // The audit's literal finding: no @vitest/coverage-* in package.json.
    expect(coverage.provider).toBe("v8");
  });

  it.each(COMMERCIAL_PATH)("declares a four-metric threshold for %s", (glob) => {
    const entry = coverage.thresholds?.[glob];
    expect(entry, `no coverage threshold declared for ${glob}`).toBeTypeOf("object");

    for (const metric of METRICS) {
      const value = (entry as Record<string, number>)[metric];
      expect(value, `${glob} is missing a ${metric} threshold`).toBeTypeOf("number");
      expect(
        value,
        `${glob} ${metric} threshold of ${value}% is low enough to pass on imports alone`,
      ).toBeGreaterThanOrEqual(MEANINGFUL_THRESHOLD_PCT);
    }
  });

  it("keeps the thresholds per-directory rather than global", () => {
    // A global percentage would be dragged up by the ~6,200 simulator tests
    // (M-30) and would say nothing about checkout or the grader. Glob keys are
    // the mechanism that scopes the gate — and that opts these directories out
    // of any global number someone adds later.
    for (const metric of METRICS) {
      expect(
        coverage.thresholds?.[metric],
        `a global ${metric} threshold would be gamed upward by the sim tests`,
      ).toBeUndefined();
    }
  });

  it("runs .tsx test files, not only .ts", () => {
    // `include: ["src/**/*.test.ts"]` silently ignored any future component
    // test. Silence is the bug; this pins the fix.
    const include = test.include ?? [];
    expect(include.some((glob) => /\.test\.\{[^}]*tsx[^}]*\}$|\.test\.tsx$/.test(glob))).toBe(true);
  });
});
