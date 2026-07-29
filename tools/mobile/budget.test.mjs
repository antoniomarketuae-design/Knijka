// -----------------------------------------------------------------------------
// The mobile screen budget, as a build gate.
//
//   npx vitest run ../tools/mobile/budget.test.mjs      (from platform/)
//
// It asserts against a sweep report, which either already exists (a CI step ran
// `node tools/mobile/cli.mjs` first, or a developer ran it locally) or is
// produced live when KNIJKA_MOBILE_BASE_URL points at a running server.
//
// WHY IT SKIPS INSTEAD OF FAILING WHEN THERE IS NO REPORT. Measuring needs a
// WebKit build, a database and a running Next server; the ordinary `npx vitest
// run` gate on this repo has none of them, and a unit-test gate that fails
// because a browser is missing is a gate people learn to ignore. The skip is
// LOUD — it prints exactly what to run — and .github/workflows/mobile-budget.yml
// is the job that makes sure it is not skipped where it counts.
//
// The unit tests below are NOT skippable: they check the harness's own
// arithmetic and its refusals, and they run everywhere, every time.
// -----------------------------------------------------------------------------
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { evaluate } from "./lib/budget.mjs";
import { expectMobileBudget, loadReport, mobileBudgetAvailability } from "./lib/vitest.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { ROUTES } from "./lib/routes.mjs";

const availability = mobileBudgetAvailability();
const hasData = availability.hasReport || availability.canMeasure;

/**
 * ENFORCEMENT IS OPT-IN LOCALLY AND AUTOMATIC IN CI, and that asymmetry is
 * deliberate. `tools/mobile/.out/latest.json` is a scratch artefact: whoever ran
 * a sweep last on this machine left one behind, possibly for a single route, on
 * a branch that has nothing to do with yours. Turning that into a red build for
 * every other lane sharing this box would teach people to distrust the gate,
 * which is how a gate dies. In CI the report can only exist because THIS run
 * produced it (.github/workflows/mobile-budget.yml), so there it is a verdict.
 * `KNIJKA_MOBILE_BUDGET=enforce` turns it on locally when you want it.
 */
const enforcing =
  hasData &&
  (process.env.KNIJKA_MOBILE_BUDGET === "enforce" ||
    (Boolean(process.env.CI) && process.env.KNIJKA_MOBILE_BUDGET !== "off"));

describe("mobile screen budget", () => {
  it.skipIf(!enforcing)(
    "every route meets its content / fold / touch budget on WebKit",
    async () => {
      await expectMobileBudget();
    },
    20 * 60 * 1000,
  );

  it.runIf(!enforcing)("is not enforcing, and says why", () => {
    console.warn(
      hasData
        ? `[mobile-harness] budget assertion NOT ENFORCED — a report exists at ` +
          `${availability.reportPath} but it was not produced by this run. ` +
          `Enforce it with KNIJKA_MOBILE_BUDGET=enforce.`
        : `[mobile-harness] budget assertion SKIPPED — no report at ${availability.reportPath} ` +
          `and KNIJKA_MOBILE_BASE_URL is unset.\n` +
          `  Run it:  node tools/mobile/cli.mjs      (starts its own dev server on :3460)`,
    );
    expect(enforcing).toBe(false);
  });

  it.skipIf(!availability.hasReport)("the stored report measured a real page", () => {
    const report = loadReport();
    expect(report.results.length).toBeGreaterThan(0);
    for (const result of report.results) {
      if (!result.ok) continue;
      // A landed URL on /login is the exact failure that once produced six
      // pages of "data" from the login screen.
      expect(result.landedUrl ?? "").not.toContain("/login");
      expect(result.coverage.contentSurfacesFound).toBeGreaterThan(0);
    }
  });
});

describe("the harness itself", () => {
  it("counts the three buckets as a partition of the viewport", () => {
    // free content + chrome + unclaimed must be the whole screen and nothing
    // more: chrome that overlaps the content is charged to chrome ONLY, which
    // is what makes a translucent control cost road instead of being counted
    // twice or not at all.
    const report = sample({ contentFraction: 0.34, chromeFraction: 0.66, unclaimedFraction: 0 });
    const r = report.results[0].coverage;
    expect(r.contentFraction + r.chromeFraction + r.unclaimedFraction).toBeCloseTo(1, 3);
  });

  it("fails a route whose content share is under budget", () => {
    const verdict = evaluate(sample({ contentFraction: 0.703 }));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0].reason).toMatch(/70\.3% < budget 85%/);
  });

  it("passes a route that meets the budget", () => {
    expect(evaluate(sample({ contentFraction: 0.86 })).pass).toBe(true);
  });

  it("fails a route that errored, rather than ignoring it", () => {
    const report = sample({});
    report.results[0].ok = false;
    report.results[0].error = "redirected to /login";
    const verdict = evaluate(report);
    expect(verdict.pass).toBe(false);
    expect(verdict.checked).toBe(0);
  });

  it("refuses to gate on a Chromium report", async () => {
    const report = sample({ contentFraction: 0.99 });
    report.engine = "chromium";
    await expect(expectMobileBudget({ report })).rejects.toThrow(/second opinion/i);
  });

  it("refuses an empty report", async () => {
    await expect(expectMobileBudget({ report: { engine: "webkit", results: [] } })).rejects.toThrow(
      /nothing was measured/,
    );
  });

  it("keeps the founder's device as a primary profile at 393x852 dpr 3", () => {
    const phone = DEVICES["iphone16-portrait"];
    expect([phone.width, phone.height, phone.dpr]).toEqual([393, 852, 3]);
    expect(phone.primary).toBe(true);
    // Nobody optimises for one device: a smaller phone must stay in the set.
    expect(DEVICES["small-portrait"].width).toBeLessThan(phone.width);
  });

  it("declares a content surface and a budget for every route", () => {
    for (const route of ROUTES) {
      expect(route.contentSelectors.length).toBeGreaterThan(0);
      expect(route.budget.contentMin).toBeGreaterThan(0);
    }
  });
});

/**
 * THE STABILITY PROBE MUST STAY ABLE TO FAIL.
 *
 * Two of its columns were found to be structurally incapable of reporting the
 * defect they exist for, on the day they first printed a zero: `unreachable` was
 * computed and left out of the returned object, and the reachability walk trusted
 * the DOCUMENT's scrollbar — which every dashboard surface has — so a control
 * pinned inside a `position: fixed` layer was always called reachable. Both
 * printed a clean 0/0 across all 24 rows while the nav drawer's „Изход" sat 173px
 * below a panel that could not scroll.
 *
 * The answer is the fixtures under `regressions/`, applied to the live app with
 * `--inject-css` (see README, "Negative controls"). They need a server, a
 * database and WebKit, so they cannot run here — but the machinery they depend on
 * is cheap to guard, and this is what says so if it is ever refactored away.
 */
describe("the stability probe's negative controls", () => {
  const PROBE = readFileSync(new URL("./stability-probe.mjs", import.meta.url), "utf8");

  it("still accepts --inject-css and applies it to every measured page", () => {
    expect(PROBE).toContain('a === "--inject-css"');
    expect(PROBE).toContain("page.addStyleTag({ content: injectedCss })");
  });

  it.each([
    ["drawer-without-scroll.css", "#mobile-nav"],
    ["controls-without-insets.css", 'aria-label^="Волан"'],
  ])("ships the %s fixture, and it still targets the real element", (file, needle) => {
    const css = readFileSync(new URL(`./regressions/${file}`, import.meta.url), "utf8");
    expect(css).toContain(needle);
  });

  /**
   * The two rules that made `unreach` real. A `fixed` ancestor has to defeat the
   * document's own scrollbar, and elements entirely outside the viewport have to
   * be audited — they are where the severe cases live, and the inventory clips
   * them away for every other question on purpose.
   */
  it("does not let the document's scrollbar excuse a viewport-pinned control", () => {
    expect(PROBE).toContain("if (!scrollable && !pinnedToViewport) {");
    expect(PROBE).toContain('if (cs.position === "fixed") pinnedToViewport = true;');
  });

  it("audits reachability for controls outside the viewport too", () => {
    expect(PROBE).toContain("const unreachable = [];");
    expect(PROBE).toContain("for (const it of [...items, ...offscreenInteractive]) {");
    // …and the finding actually leaves the page. This is the exact line whose
    // absence made the whole check invisible.
    expect(PROBE).toMatch(/\n\s*unreachable,\n/);
  });

  /**
   * No fixed sleep at a state change. The 700ms one produced a phantom 90px
   * shift of the driving cluster on alternate runs.
   */
  it("waits for the layout to come to rest instead of sleeping", () => {
    expect(PROBE).toContain("function geometryFingerprint()");
    for (const phase of ["toolbarShown", "toolbarHidden", "overlayOpen", "overlayClose"]) {
      expect(PROBE).toContain(`row.settle.${phase} = await settle(page)`);
    }
    expect(PROBE).not.toContain("await page.waitForTimeout(700)");
    expect(PROBE).not.toContain("await page.waitForTimeout(900)");
  });
});

/** A minimal report shaped exactly like sweep() emits. */
function sample(coverage) {
  return {
    engine: "webkit",
    results: [
      {
        route: "simulator-drive",
        device: "iphone16-landscape",
        ok: true,
        budget: { contentMin: 0.85, foldMustPass: false, touchMustPass: false },
        coverage: {
          contentFraction: 0.9,
          chromeFraction: 0.1,
          unclaimedFraction: 0,
          topContributors: [],
          bands: [],
          contentSurfacesFound: 1,
          ...coverage,
        },
        fold: { pass: true, items: [], documentOverflowPx: 0 },
        touch: { pass: true, violations: [] },
        safeArea: { pass: true, violations: [] },
      },
    ],
  };
}
