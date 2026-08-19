// -----------------------------------------------------------------------------
// settle.test.mjs — THE TEST THAT WOULD HAVE CAUGHT A PROBE TIMING ITSELF.
//
//   npx vitest run ../tools/mobile/settle.test.mjs   (from platform/)
//
// This is a VITEST file on purpose: the runner is part of whether a test is
// load-bearing, and the last three defects in this instrument were all found by
// hand because nothing in any gate could see them.
//
// THE SENTENCE THAT USED TO BE HERE WAS WRONG, AND IT COST THIS FILE ITS WHOLE
// PURPOSE. It said "platform/vitest.config.ts already globs
// `../tools/mobile/**/*.test.mjs`, so a vitest test here runs in the same gate
// everything else runs in". That glob was removed — correctly, because it was
// also swallowing the node:test files in this directory and hard-failing on
// them — and this file was named by nothing that replaced it. MEASURED
// 2026-08-19: `npx vitest list --filesOnly` returned 878 files and none of them
// was this one; asking vitest for it by name printed nothing and exited 0.
// Every assertion below had been green by absence since that narrowing.
//
// It is named explicitly now, in `VITEST_INCLUDE` in
// platform/scripts/tools-tests.mjs, and both gates fail if it stops being named
// there (platform/scripts/__tests__/test-ownership.test.mjs). A comment is not
// a gate; that is the whole lesson, and this header was the proof.
//
// WHAT IS BEING PINNED, and why each one is here:
//
//   1. THE INSTRUMENT IS OUTSIDE THE NUMBER. `settle()` is given a page whose
//      round trip costs seconds while the page itself reports rest in
//      milliseconds. The app number must be the page's, not the round trip's.
//      That is the exact shape of the defect: a real sample recorded ms 32,144
//      with evalMs 31,881 while the layout had been still since 1,477 ms.
//   2. A PHASE THAT NEVER SETTLED HAS NO NUMBER. `appMs` must return null, not
//      zero and not the wall clock — a blank is not a pass.
//   3. THE FLOOR AND THE STEP TRAVEL WITH THE SAMPLE, because a budget margin
//      thinner than the instrument's own resolution is a rounding accident and
//      the verdict has to be able to say so.
//   4. THE PROBE SCORES THE APP NUMBER. A source scan, because the arithmetic
//      being right in lib/ is worth nothing if the table still ranks `s.ms`.
// -----------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { appMs, instrumentShare, settle, settleBody } from "./lib/settle.mjs";
import { contextOptions, DEVICES, MOTION_MODES, resolveMotion } from "./lib/devices.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const probeSource = () => readFileSync(join(HERE, "stability-probe.mjs"), "utf8");

/** Source with comments stripped — prose about a call must not read as the call. */
const probeCode = () =>
  probeSource()
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * A document whose geometry follows a script.
 *
 * `frames` is one entry per sample: a list of rects. Repeat a frame to make the
 * geometry hold still; change it to make the layout move. `costMs` is burned
 * inside `querySelectorAll`, which is where the real DOM walk's cost lands, so
 * `walkMs` has something real to measure.
 */
function scriptedDocument(frames, { costMs = 0 } = {}) {
  let call = 0;
  return {
    calls: () => call,
    querySelectorAll() {
      const frame = frames[Math.min(call, frames.length - 1)];
      call += 1;
      if (costMs > 0) {
        const until = performance.now() + costMs;
        while (performance.now() < until) {
          /* burn — this is what walking a real document costs */
        }
      }
      return frame.map((r) => ({ getBoundingClientRect: () => r }));
    },
  };
}

const rect = (x, y, w = 10, h = 10) => ({ left: x, top: y, width: w, height: h });

/** Run `settleBody` with a stubbed `document`, restoring whatever was there. */
async function runBody(doc, config) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return await settleBody(config);
  } finally {
    if (had) globalThis.document = previous;
    else delete globalThis.document;
  }
}

const CONFIG = { minMs: 20, pollMs: 10, windowMs: 2_000 };

describe("settleBody — the loop that now runs inside the page", () => {
  it("reports rest at the FIRST of the two matching samples, never the confirming one", async () => {
    // Moves for two samples, then holds. Sample 3 and 4 match, so the layout
    // was demonstrably still as of sample 3 — and everything after that is the
    // instrument proving it to itself, which the app must not be charged for.
    const doc = scriptedDocument([
      [rect(0, 0)],
      [rect(0, 5)],
      [rect(0, 9)],
      [rect(0, 9)],
    ]);
    const out = await runBody(doc, CONFIG);

    expect(out.settled).toBe(true);
    expect(out.samples).toBe(4);
    expect(out.atRestMs).toBeLessThan(out.spanMs);
    expect(out.atRestMs).toBeGreaterThanOrEqual(CONFIG.minMs);
    expect(appMs(out)).toBe(out.atRestMs);
  });

  it("a layout that never stops moving produces NO app number — null, not zero", async () => {
    let n = 0;
    const doc = {
      querySelectorAll() {
        n += 1;
        return [{ getBoundingClientRect: () => rect(0, n) }];
      },
    };
    const out = await runBody(doc, { minMs: 5, pollMs: 5, windowMs: 120 });

    expect(out.settled).toBe(false);
    expect(out.atRestMs).toBeNull();
    expect(appMs(out)).toBeNull();
    // The distinction the whole round is about: absent is not fast.
    expect(appMs(out)).not.toBe(0);
    expect(out.spanMs).toBeGreaterThanOrEqual(120);
  });

  it("counts what its OWN walk cost, separately, and only up to the moment of rest", async () => {
    const doc = scriptedDocument([[rect(0, 0)], [rect(0, 4)], [rect(0, 4)]], { costMs: 12 });
    const out = await runBody(doc, CONFIG);

    expect(out.settled).toBe(true);
    expect(out.samples).toBe(3);
    // Three walks at ~12 ms each — the instrument's irreducible share, because
    // it runs on the same main thread as the layout it is watching.
    expect(out.walkMs).toBeGreaterThanOrEqual(24);
    // …and the part of it charged before rest is strictly less than the total,
    // so the two can never be conflated in a report.
    expect(out.walkBeforeRestMs).toBeLessThan(out.walkMs);
  });

  it("carries the floor and the resolution, because a margin thinner than a step is not a margin", async () => {
    const doc = scriptedDocument([[rect(0, 0)], [rect(0, 3)], [rect(0, 3)]]);
    const out = await runBody(doc, CONFIG);

    expect(out.floorMs).toBe(CONFIG.minMs);
    expect(out.atRestMs).toBeGreaterThanOrEqual(out.floorMs);
    expect(out.stepMs).toBeGreaterThan(0);
  });
});

describe("settle() — the bridge is outside the metric by construction", () => {
  /** A page whose round trip is slow while the page itself is fast. */
  const slowBridgePage = (bridgeMs, inPage) => ({
    evaluate: async () => {
      await new Promise((r) => setTimeout(r, bridgeMs));
      return inPage;
    },
  });

  it("THE DEFECT, REPRODUCED AND REFUSED: a 400 ms round trip around a 60 ms layout", async () => {
    // The recorded shape, scaled down so the test is fast: wall clock is
    // dominated by the crossing, the layout came to rest long before it. The
    // old instrument returned the wall clock as the app's settle time.
    const out = await settle(
      slowBridgePage(400, {
        settled: true,
        atRestMs: 60,
        spanMs: 90,
        samples: 3,
        walkMs: 6,
        walkBeforeRestMs: 4,
        floorMs: 20,
        stepMs: 30,
      }),
    );

    expect(appMs(out)).toBe(60); // the APP number — the page's own timestamp
    expect(out.ms).toBeGreaterThanOrEqual(400); // the wall clock, still recorded
    expect(out.bridgeMs).toBeGreaterThanOrEqual(250); // …and named as the probe's
    expect(out.walkMs).toBe(6);
    expect(out.evalMs).toBe(out.bridgeMs + out.walkMs);
    // The instrument owned most of the sample and the metric did not move.
    expect(instrumentShare(out)).toBeGreaterThan(0.5);
    expect(appMs(out)).toBeLessThan(out.ms / 4);
  });

  it("a page that never answers is a NO SAMPLE, not a zero and not a pass", async () => {
    const wedged = { evaluate: () => new Promise(() => {}) };
    const out = await settle(wedged, { ceilingMs: 60 });

    expect(out.settled).toBe(false);
    expect(appMs(out)).toBeNull();
    expect(out.error).toMatch(/did not answer/);
    expect(instrumentShare(out)).toBe(1);
  });

  it("an evaluate that throws is reported, not swallowed into a fast number", async () => {
    const broken = { evaluate: async () => { throw new Error("Execution context was destroyed"); } };
    const out = await settle(broken);

    expect(appMs(out)).toBeNull();
    expect(out.error).toMatch(/Execution context was destroyed/);
  });
});

describe("the probe scores the APP number", () => {
  it("the budget is compared against the app number, and never against wall clock again", () => {
    const code = probeCode();
    expect(code).toMatch(/worstApp\s*>\s*SETTLE_BUDGET_MS/);
    expect(code).not.toMatch(/worstSettle\s*>\s*SETTLE_BUDGET_MS/);
  });

  it("the settle loop crosses the bridge ONCE — no page.evaluate inside a polling loop", () => {
    // lib/settle.mjs is the only place a fingerprint is taken, and it takes it
    // with a single evaluate. If a loop ever grows back around one, this fails.
    const lib = readFileSync(join(HERE, "lib", "settle.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(lib.match(/page\s*\n?\s*\.evaluate\(/g) ?? []).toHaveLength(1);
    expect(lib).not.toMatch(/while\s*\([^)]*\)\s*\{[\s\S]{0,400}?page\s*\.?\s*\n?\s*\.?evaluate/);
  });

  it("a phase with no sample fails the row instead of scoring as fast", () => {
    const code = probeCode();
    expect(code).toMatch(/noSample/);
    expect(code).toMatch(/NO SAMPLE/);
  });

  it("prints the instrument's share beside every app number and shouts past the limit", () => {
    const code = probeCode();
    expect(code).toMatch(/INSTRUMENT_SHARE_LIMIT/);
    expect(code).toMatch(/INSTRUMENT-BOUND/);
    // A quarter, not a half: "most of it was the instrument" is far too late a
    // place to start warning about a number that was once 99.2% instrument.
    expect(probeSource()).toMatch(/const INSTRUMENT_SHARE_LIMIT = 0\.25;/);
  });

  it("the idle phase is named as one — it follows no state change and cannot be a settling time", () => {
    const code = probeCode();
    expect(code).toMatch(/IDLE_PHASE/);
    expect(code).toMatch(/idle/);
  });

  it("asks the canvas AGAIN at the end of the row, in the frame the capture comes from", () => {
    const code = probeCode();
    expect(code).toMatch(/worldAtEnd/);
    expect(code).toMatch(/ENDED-BLANK__/);
  });

  it("a lost run is reported at the bottom of the report as well as in the table", () => {
    const code = probeCode();
    expect(code).toMatch(/SAMPLE INTEGRITY/);
    expect(code).toMatch(/produced < asked/);
  });

  it("no fetch in this harness can wait forever, and a slow run says so while it waits", () => {
    // MEASURED 2026-08-05: Turbopack ran a `filesystem cache database
    // compaction` for 7.0 minutes, the dev server stopped answering, and a
    // `fetch` with no deadline sat on the connection. The run was killed at
    // 15.5 minutes having printed nothing and burned no CPU — from outside,
    // identical to a slow compile. Both halves matter: a deadline so it ends,
    // and a heartbeat so a long wait is never mistaken for a hang.
    const code = probeCode();
    const auth = readFileSync(join(HERE, "lib", "auth.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).toMatch(/signal:\s*AbortSignal\.timeout\(/);
    expect(auth).toMatch(/signal:\s*AbortSignal\.timeout\(/);
    expect(code).toMatch(/function heartbeat\(/);
    expect(code).toMatch(/heartbeat\(`\$\{surface\.id\}/);
  });

  it("the navigation retry ladder has a TOTAL budget — the individual timeouts multiply", async () => {
    // Counted from the code, not guessed: gotoQuiesced makes 3 attempts of up
    // to 180 s and re-warms (up to 420 s) between them, and the offline-page
    // check repeats that whole ladder up to 4 times. Worst case is over two
    // hours for ONE iteration. Every individual timeout was defensible; nobody
    // had multiplied them together — the same shape as every other defect in
    // this instrument. Observed 2026-08-05: one iteration sat there 31 minutes.
    const auth = await import("./lib/auth.mjs");
    expect(typeof auth.NAV_BUDGET_MS).toBe("number");
    expect(auth.NAV_BUDGET_MS).toBeGreaterThan(60_000);
    expect(auth.NAV_BUDGET_MS).toBeLessThanOrEqual(900_000);
    const source = readFileSync(join(HERE, "lib", "auth.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // The budget has to reach BOTH things that can wait: the navigation and
    // the warm fetch. A deadline only one of them honours is not a deadline.
    expect(source).toMatch(/const deadline = Date\.now\(\) \+ budgetMs;/);
    expect(source).toMatch(/timeout: Math\.max\(1_000, Math\.min\(180_000, deadline - Date\.now\(\)\)\)/);
    expect(source).toMatch(/Math\.min\(WARM_TIMEOUT_MS, deadline - Date\.now\(\)\)/);
    expect(probeCode()).toMatch(/NAV_BUDGET_MS/);
  });

  it("…and the budget actually stops a route that will not load", async () => {
    const { gotoAuthenticated } = await import("./lib/auth.mjs");
    const page = {
      goto: async (url, options) => {
        if (url === "about:blank") return;
        await new Promise((r) => setTimeout(r, (options?.timeout ?? 100) + 5));
        throw new Error("Timeout was reached");
      },
      evaluate: async () => false,
      url: () => "http://localhost:1/x",
      context: () => ({ cookies: async () => [] }),
    };
    const t0 = Date.now();
    await expect(
      gotoAuthenticated(page, "http://localhost:1", { id: "x", path: "/x" }, { budgetMs: 400 }),
    ).rejects.toThrow(/would not load|navigation budget/);
    // Bounded: one attempt may overrun by its own timeout, but the ladder does
    // not multiply. Before this, the same page took 31 real minutes.
    expect(Date.now() - t0).toBeLessThan(8_000);
  });

  it("a route that loads and lands where asked still passes straight through", async () => {
    const { gotoAuthenticated } = await import("./lib/auth.mjs");
    const visited = [];
    const page = {
      goto: async (url) => { visited.push(url); },
      evaluate: async () => false, // not the offline page
      url: () => "http://localhost:1/simulator?scenario=x",
      context: () => ({ cookies: async () => [] }),
    };
    const landed = await gotoAuthenticated(page, "http://localhost:1", {
      id: "simulator-drive",
      path: "/simulator?scenario=x&level=1",
      expectPath: "/simulator",
    });
    expect(landed).toContain("/simulator");
    expect(visited[0]).toBe("about:blank"); // stop the old router first
    expect(visited[1]).toContain("/simulator?scenario=x&level=1");
  });
});

describe("motion is a stated run parameter, not a constant nobody can see", () => {
  it("contextOptions REFUSES to build a context without a motion mode", () => {
    expect(() => contextOptions(DEVICES["iphone16-portrait"])).toThrow(/motion.*required/i);
    expect(() => contextOptions(DEVICES["iphone16-portrait"], { motion: "whatever" })).toThrow(
      /motion mode must be one of/i,
    );
  });

  it("both modes exist and each one SAYS what it does to an animation claim", () => {
    expect(MOTION_MODES.reduce.playwright).toBe("reduce");
    expect(MOTION_MODES.allow.playwright).toBe("no-preference");
    expect(resolveMotion("reduce").says).toMatch(/NO CLAIM ABOUT AN ANIMATION/);
    expect(resolveMotion("allow").says).toMatch(/what a student sees/);
  });

  it("the chosen mode reaches Playwright, both ways", () => {
    expect(contextOptions(DEVICES["iphone16-portrait"], { motion: "reduce" }).reducedMotion).toBe("reduce");
    expect(contextOptions(DEVICES["iphone16-portrait"], { motion: "allow" }).reducedMotion).toBe(
      "no-preference",
    );
  });

  it("no device profile hard-codes it any more — that is what made it unfalsifiable", () => {
    // COMMENTS STRIPPED FIRST. The file explains the defect by quoting it —
    // `reducedMotion: "reduce"` appears verbatim in its own header — and a scan
    // that cannot tell code from prose about code would report the fix as
    // missing. (This test failed exactly that way when it was written.)
    const devices = readFileSync(join(HERE, "lib", "devices.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // No string literal is assigned to it any more; it comes from the mode.
    expect(devices).not.toMatch(/reducedMotion:\s*["'`]/);
    expect(devices).toMatch(/reducedMotion:\s*motion\.playwright/);
  });

  it("the probe prints the mode, in the run banner and in the JSON artefact", () => {
    const code = probeCode();
    expect(code).toMatch(/motion=\$\{MOTION\.id\}/);
    expect(code).toMatch(/motion:\s*MOTION\.id/);
  });
});
