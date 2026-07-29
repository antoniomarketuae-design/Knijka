// -----------------------------------------------------------------------------
// vitest.mjs — the assertion helper, so a screen budget can FAIL A BUILD.
//
// The founder asked for a repeatable environment, not a ritual: "Do not rely
// only on manually shrinking a desktop browser window." A number that is only
// ever read by a human in a terminal decays the week nobody reads it. This is
// the part that makes CI care.
//
// Two modes, because CI and a laptop want different things:
//
//   LIVE   — measure now, against a running server. Used when
//            KNIJKA_MOBILE_BASE_URL is set (CI starts `next start` first) or
//            when the caller passes a baseUrl.
//   REPORT — assert against a report a previous `cli.mjs` run wrote. Used when
//            the sweep and the assertion are separate CI steps, which is the
//            cheaper shape: browsers and a database are needed once, not per
//            assertion.
//
// If NEITHER is available the helper says so and the caller decides. It never
// invents a number, and it never passes by accident: `mobileBudgetAvailability`
// exists precisely so a test can skip LOUDLY instead of silently green.
// -----------------------------------------------------------------------------
import { existsSync, readFileSync } from "node:fs";

import { evaluate, formatReport } from "./budget.mjs";
import { LATEST_REPORT } from "./measure.mjs";

/** Where a report would come from, and whether we can measure live. */
export function mobileBudgetAvailability() {
  const reportPath = process.env.KNIJKA_MOBILE_REPORT || LATEST_REPORT;
  return {
    reportPath,
    hasReport: existsSync(reportPath),
    baseUrl: process.env.KNIJKA_MOBILE_BASE_URL || null,
    canMeasure: Boolean(process.env.KNIJKA_MOBILE_BASE_URL),
  };
}

/** Load the most recent sweep report (or the one named by env). */
export function loadReport(path) {
  const file = path || process.env.KNIJKA_MOBILE_REPORT || LATEST_REPORT;
  if (!existsSync(file)) {
    throw new Error(
      `[mobile-harness] no report at ${file}. Run \`node tools/mobile/cli.mjs\` first, ` +
        `or set KNIJKA_MOBILE_BASE_URL to measure live.`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Measure and assert in one call.
 *
 * @param {{routes?:string[],devices?:string[],baseUrl?:string,report?:any}} options
 */
export async function expectMobileBudget(options = {}) {
  let report = options.report;
  if (!report) {
    const baseUrl = options.baseUrl || process.env.KNIJKA_MOBILE_BASE_URL;
    if (baseUrl) {
      const { sweep } = await import("./measure.mjs");
      report = await sweep({ ...options, baseUrl, quiet: true });
    } else {
      report = loadReport();
    }
  }

  // A report that measured nothing must never pass. This is the failure mode
  // the whole harness exists to end: a sweep that silently measured the login
  // page, or no page at all, and handed back a clean table.
  if (!report.results || report.results.length === 0) {
    throw new Error("[mobile-harness] the report contains no results — nothing was measured");
  }
  if (report.engine !== "webkit") {
    throw new Error(
      `[mobile-harness] refusing to gate on a ${report.engine} report. The founder's phone is ` +
        `WebKit; Chromium is a second opinion, never the source of a mobile verdict.`,
    );
  }

  const verdict = evaluate(report);
  if (!verdict.pass) throw new Error(formatReport(report, verdict));
  return { report, verdict };
}
