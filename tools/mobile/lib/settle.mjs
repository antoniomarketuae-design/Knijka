// -----------------------------------------------------------------------------
// settle.mjs — HOW LONG DID THE LAYOUT TAKE TO STOP MOVING, WITHOUT CHARGING
// THE APP FOR THE PROBE.
//
// THE DEFECT THIS FILE EXISTS FOR. The settle loop used to live in Node:
//
//     await page.waitForTimeout(minMs);
//     let previous = await page.evaluate(geometryFingerprint);
//     while (Date.now() - started < timeoutMs) {
//       await page.waitForTimeout(pollMs);
//       const current = await page.evaluate(geometryFingerprint);   // <-- bridge
//       ...
//     }
//     return { ms: Date.now() - started, ... };                     // <-- metric
//
// `ms` is wall clock around that loop, so every driver-bridge crossing — each
// one scheduled onto a main thread the 3D shell is already using — was reported
// as time the app spent settling. Re-derived from the last recorded sweep
// (`tools/mobile/.out/stability/stability.json`, not quoted from any report):
// the `base` phase of simulator-drive / iphone16-portrait returned
// ms 32,144 with evalMs 31,881 — 99.2% instrument — on a page that by
// construction was doing nothing at all, while `atRestMs` said the layout had
// been still since 1,477 ms. One single `evaluate` in that sample took ~30.5 s
// to come back. The same arithmetic on a quiet box passes anything, including a
// black canvas, by 10 ms. A metric that can be moved 30 seconds either way by
// how busy the machine is measures the machine.
//
// SUBTRACTING AN AVERAGE AFTERWARDS WOULD NOT FIX IT. The fix is to stop
// putting the bridge inside the window: ONE crossing, and then the sampling
// loop runs inside the page and timestamps itself with `performance.now()`.
// The bridge is outside the number by construction, and what remains to report
// beside the number is what it cost — never subtracted from it silently.
//
// THE FLOOR AND THE STEP ARE PART OF THE ANSWER. Nothing is read before
// `minMs`, so no app number can be smaller than it; and a number can only land
// on floor + k*step, so a budget margin thinner than one step is a rounding
// accident. Both travel with every sample so a verdict can say which it is.
// -----------------------------------------------------------------------------

/** Nothing is read before this. It is the floor of every app number. */
export const SETTLE_MIN_MS = 150;
/** Gap between in-page samples. Also the resolution, absent main-thread stalls. */
export const SETTLE_POLL_MS = 100;
/** How long the LAYOUT gets to stop moving, in APP time (in-page ms). */
export const SETTLE_WINDOW_MS = 6_000;
/**
 * Hard Node-side stop. The window above is in-page time, so a page whose main
 * thread is wedged would otherwise never resolve; this turns that into a named
 * failure instead of a hang. Deliberately far larger than the window: on this
 * box a single bridge crossing has been measured at 30.5 s, and a ceiling
 * shorter than that would convert a slow box into a fake finding.
 */
export const SETTLE_CEILING_MS = 120_000;

/**
 * THE WHOLE POLLING LOOP, INSIDE THE PAGE.
 *
 * Serialized to the browser by `page.evaluate`, so it must close over nothing:
 * every constant it needs arrives in `config`. Exported because a measurement
 * instrument that cannot itself be measured is how all four of the previous
 * defects survived — see settle.test.mjs, which drives this function against a
 * fake document whose geometry stops changing at a known sample.
 *
 * @param {{minMs:number,pollMs:number,windowMs:number}} config
 * @returns {Promise<{settled:boolean, atRestMs:number|null, spanMs:number,
 *                    samples:number, walkMs:number, walkBeforeRestMs:number,
 *                    floorMs:number, stepMs:number}>}
 */
export function settleBody(config) {
  const { minMs, pollMs, windowMs } = config;

  /** A cheap whole-page geometry hash. Two equal consecutive reads = at rest. */
  const fingerprint = () => {
    let acc = 0;
    let n = 0;
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      acc += r.left * 31 + r.top * 17 + r.width * 7 + r.height * 3;
      n += 1;
    }
    return `${n}:${Math.round(acc * 10)}`;
  };

  return new Promise((resolve) => {
    const t0 = performance.now();
    let walkMs = 0;
    let walkBeforeRest = 0;
    let widestStep = 0;
    let samples = 0;
    let previous = null;

    const take = () => {
      const before = performance.now();
      const value = fingerprint();
      const after = performance.now();
      walkMs += after - before;
      samples += 1;
      return { value, at: after - t0, walkSoFar: walkMs };
    };

    const finish = (settled, current) => {
      resolve({
        settled,
        // At rest as of the EARLIER of the two matching samples: the layout
        // demonstrably was not moving then, and everything after it is the
        // instrument proving that to itself. When nothing ever matched there is
        // no such moment, and saying so is the point — a null here means "this
        // phase produced no app number", which is not the same as 0 ms and must
        // never be scored as one.
        atRestMs: settled ? Math.round(previous.at) : null,
        spanMs: Math.round(current.at),
        samples,
        walkMs: Math.round(walkMs),
        walkBeforeRestMs: Math.round(settled ? walkBeforeRest : walkMs),
        floorMs: minMs,
        stepMs: Math.round(widestStep),
      });
    };

    const step = () => {
      const current = take();
      if (previous) widestStep = Math.max(widestStep, current.at - previous.at);
      if (previous && current.value === previous.value) {
        walkBeforeRest = previous.walkSoFar;
        finish(true, current);
        return;
      }
      previous = current;
      if (current.at >= windowMs) {
        finish(false, current);
        return;
      }
      setTimeout(step, pollMs);
    };

    setTimeout(() => {
      previous = take();
      setTimeout(step, pollMs);
    }, minMs);
  });
}

/**
 * Wait until the page's geometry stops changing, and report the APP number.
 *
 * `ms` is kept — total Node wall clock, the number the settle budget used to be
 * stated against — but it is NO LONGER THE METRIC and nothing scores against
 * it. `atRestMs` is. `evalMs` is kept under its old name because everything
 * that reads this harness knows it as "the instrument's cost"; it now covers
 * both halves of that cost, the bridge crossing AND the in-page DOM walk.
 *
 * @param {import("playwright").Page} page
 */
export async function settle(
  page,
  {
    minMs = SETTLE_MIN_MS,
    pollMs = SETTLE_POLL_MS,
    windowMs = SETTLE_WINDOW_MS,
    ceilingMs = SETTLE_CEILING_MS,
  } = {},
) {
  const started = Date.now();
  const timedOut = Symbol("settle-ceiling");
  const inPage = await Promise.race([
    page
      .evaluate(settleBody, { minMs, pollMs, windowMs })
      .catch((e) => ({ error: String(e?.message || e).split("\n")[0] })),
    new Promise((r) => setTimeout(() => r(timedOut), ceilingMs)),
  ]);
  const ms = Date.now() - started;

  if (inPage === timedOut || !inPage || inPage.error) {
    // NO SAMPLE. Not a zero, not a pass — the phase did not happen. Callers
    // must treat this as a failed row; that is the whole lesson of the last
    // three rounds of this instrument.
    return {
      ms,
      atRestMs: null,
      settled: false,
      samples: 0,
      evalMs: ms,
      bridgeMs: ms,
      walkMs: 0,
      walkBeforeRestMs: 0,
      instrumentShare: 1,
      floorMs: minMs,
      stepMs: 0,
      error: inPage === timedOut ? `the page did not answer within ${ceilingMs} ms` : inPage.error,
    };
  }

  // Everything the Node side spent that the page did not see: the bridge
  // crossing in both directions, plus however long the main thread made this
  // evaluate wait its turn. Instrument, entirely, and now outside the metric.
  const bridgeMs = Math.max(0, ms - inPage.spanMs);
  const evalMs = bridgeMs + inPage.walkMs;
  return {
    ms,
    atRestMs: inPage.atRestMs,
    settled: inPage.settled,
    samples: inPage.samples,
    evalMs,
    bridgeMs,
    walkMs: inPage.walkMs,
    walkBeforeRestMs: inPage.walkBeforeRestMs,
    instrumentShare: ms > 0 ? Math.round((evalMs / ms) * 1000) / 1000 : 0,
    floorMs: inPage.floorMs,
    stepMs: inPage.stepMs,
  };
}

/**
 * THE APP NUMBER for a phase, or null when the phase produced none.
 *
 * ONE definition, imported by the table, the detail, the stability block and
 * the verdict — because two places disagreeing about which number was the
 * number is how a 1,200 ms budget came to be judged against a figure that was
 * 99.2% instrument.
 */
export const appMs = (s) => (s && s.settled && typeof s.atRestMs === "number" ? s.atRestMs : null);

/**
 * How much of a sample was the probe: bridge crossings plus its own DOM walk.
 * `1` when there is no sample at all. Printed beside every app number, and
 * never subtracted from one silently.
 */
export const instrumentShare = (s) => {
  if (!s) return 0;
  if (typeof s.instrumentShare === "number") return s.instrumentShare;
  return s.ms > 0 ? Math.min(1, (s.evalMs ?? 0) / s.ms) : 0;
};
