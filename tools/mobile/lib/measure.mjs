// -----------------------------------------------------------------------------
// measure.mjs — the sweep. One browser, one context per device, one page per
// route, one report.
//
// Everything the harness promises is assembled here: WebKit device profiles,
// an authenticated session, the strict coverage probe, the fold test, the
// touch-target audit, the safe-area check, and a screenshot of every state it
// measured so a number can always be put next to a picture.
//
// OUTPUT GOES SOMEWHERE GITIGNORED. Capture directories have been committed by
// accident twice in this repo (see the .r0phone/ and .sim-shots/ entries in
// .gitignore), so this writes only under tools/mobile/.out/, which .gitignore
// covers, and the run directory is named by timestamp so two agents cannot
// overwrite each other.
// -----------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { engineByName } from "./pw.mjs";
import { resolveDevices } from "./devices.mjs";
import { assertInsetsApplied, insetBanner, newDeviceContext } from "./insets.mjs";
import { probeBody } from "./probe.mjs";
import { resolveRoutes } from "./routes.mjs";
import { gotoAuthenticated, signIn } from "./auth.mjs";
import { ensureHarnessUser } from "./user.mjs";
import { baseUrl } from "./server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, "..", ".out");
export const LATEST_REPORT = join(OUT_DIR, "latest.json");

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** Errors that are about this box, not about the page being measured. */
const TRANSIENT = /interrupted by another navigation|offline page|Timeout .* exceeded|ECONNRESET|fetch failed/i;

async function withRetry(fn, attempts = 2) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!TRANSIENT.test(String(error?.message || error))) throw error;
    }
  }
  throw lastError;
}

/**
 * Compile every route server-side, from Node, BEFORE the browser goes near it.
 *
 * WHY (measured, and the harness caught it on its own first run): a cold
 * `next dev` on this mechanical disk took 60 s to render /theory. WebKit gives
 * up on a navigation before that, the fetch inside public/sw.js THROWS, and the
 * service worker answers with /offline.html — so the sweep photographed
 * „Телефонът ти е офлайн" and would have published its geometry as the theory
 * hub's mobile layout. Warming with a plain fetch (no service worker in the
 * path) makes the browser's first navigation hit an already-compiled route.
 *
 * The session cookies are carried over because the proxy redirects an
 * unauthenticated request at the edge, and a redirect compiles nothing.
 */
async function warmRoutes(context, url, routes, quiet) {
  const cookies = await context.cookies();
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const route of routes) {
    const target = new URL(route.path, url).toString();
    const startedAt = Date.now();
    try {
      const res = await fetch(target, { headers: { cookie }, redirect: "manual" });
      await res.arrayBuffer();
      if (!quiet) {
        console.log(
          `[mobile-harness] warmed ${route.path} -> ${res.status} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
        );
      }
    } catch (error) {
      if (!quiet) console.log(`[mobile-harness] warm ${route.path} failed: ${error.message}`);
    }
  }
}

/**
 * Run a sweep.
 *
 * @param {{
 *   routes?: string[], devices?: string[], engine?: string, port?: number,
 *   baseUrl?: string, credentials?: {email:string,password:string},
 *   screenshots?: boolean, runDir?: string, onResult?: (r:any)=>void,
 * }} options
 */
export async function sweep(options = {}) {
  const engine = engineByName(options.engine || "webkit");
  const devices = resolveDevices(options.devices);
  const routes = resolveRoutes(options.routes);
  const url = options.baseUrl || baseUrl(options.port);
  const runId = stamp();
  const runDir = options.runDir || join(OUT_DIR, `run-${runId}`);
  const shots = options.screenshots !== false;
  if (shots) mkdirSync(runDir, { recursive: true });

  // CREDENTIALS WITHOUT A DATABASE ROUND TRIP. The local dev DB is a 10-slot
  // PGlite shared by every lane, and it is regularly at capacity — a sweep that
  // cannot run because it wanted to WRITE a user row, on a box where the user
  // row already exists, is a self-inflicted outage. Supply
  // KNIJKA_MOBILE_EMAIL + KNIJKA_MOBILE_PASSWORD (or pass credentials) and the
  // harness never opens a connection of its own.
  const credentials =
    options.credentials ||
    (process.env.KNIJKA_MOBILE_EMAIL && process.env.KNIJKA_MOBILE_PASSWORD
      ? {
          email: process.env.KNIJKA_MOBILE_EMAIL,
          password: process.env.KNIJKA_MOBILE_PASSWORD,
        }
      : await ensureHarnessUser());

  const browser = await engine.launcher.launch();
  /** @type {any[]} */
  const results = [];
  const started = Date.now();
  let warmed = false;

  // SIGN IN ONCE, NOT ONCE PER DEVICE. Authentication is not part of what is
  // being measured, and on a loaded box a sign-in costs minutes. The first
  // context does it for real; every later context is created from its storage
  // state, which is the same cookie the browser would have had anyway.
  let storageState;

  try {
    for (const device of devices) {
      // REAL INSETS, BY DEFAULT, THROUGH THE ONE DOOR. `newDeviceContext` is
      // `browser.newContext` plus the profile's notch and home indicator
      // substituted into the app's own env(safe-area-inset-*) declarations —
      // see lib/insets.mjs for why a raw newContext here measured a phone that
      // does not exist for the whole life of this harness.
      // Motion is stated at the call site and printed in the report; a coverage
      // sweep wants deterministic geometry.
      const { context, inset } = await newDeviceContext(browser, device, {
        motion: "reduce",
        insets: options.insets ?? "real",
        rotation: options.rotation,
        ...(storageState ? { storageState } : {}),
      });
      const page = await context.newPage();
      try {
        if (!storageState) {
          await signIn(page, credentials, url);
          storageState = await context.storageState();
        }
        if (!warmed) {
          await warmRoutes(context, url, routes, options.quiet);
          warmed = true;
        }
        // AND IT MUST BE ABLE TO FAIL. An emulation that rewrote nothing is
        // indistinguishable from a phone with no notch, which is the exact
        // defect this closes — so the first page of every device column is
        // asked what actually landed, and the sweep stops rather than publish
        // a column that silently measured the old, notchless phone.
        const insetSeen = await assertInsetsApplied(page, inset);
        if (!options.quiet) {
          console.log(`  ${insetBanner(device, inset)}`);
          console.log(
            `  engine env() ${JSON.stringify(insetSeen.engine)} · <body> padding ` +
              `${insetSeen.body.left}/${insetSeen.body.right}/${insetSeen.body.bottom} · ` +
              `${insetSeen.agent?.declarations ?? 0} rules + ` +
              `${insetSeen.agent?.inlineDeclarations ?? 0} inline styles rewritten`,
          );
        }

        for (const route of routes) {
          const result = {
            route: route.id,
            path: route.path,
            label: route.label,
            device: device.id,
            deviceLabel: device.label,
            engine: engine.name,
            insets: inset.mode,
            insetAsked: { top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left },
            rotation: inset.rotation,
            ok: false,
          };
          try {
            // ONE RETRY FOR TRANSIENTS. On this box a single route can lose to
            // an in-flight router navigation, a 3-minute cold compile or a
            // database at its connection cap — none of which is a fact about
            // the layout. Retrying once costs a minute; not retrying costs a
            // whole device column of the baseline, which is what happened.
            await withRetry(async () => {
              result.landedUrl = await gotoAuthenticated(page, url, route);
              if (route.waitFor) {
                await page.waitForSelector(route.waitFor, { timeout: 180_000, state: "attached" });
              }
            });
            if (route.prepare) await route.prepare(page);
            // Settle: entry transitions are disabled via reducedMotion, but the
            // 3D shell still needs frames to put a first image on the canvas,
            // and a measurement of a half-mounted screen is a lie in whichever
            // direction happens to be convenient.
            await page.waitForTimeout(route.settleMs ?? 1200);

            const probe = await page.evaluate(probeBody, {
              contentSelectors: route.contentSelectors,
              mustFit: route.mustFit,
              // The bands the probe calls unsafe are the ones the page was
              // actually laid out against — `inset`, not the raw profile —
              // so a single-sided `--rotation` run cannot report the notch on
              // the side it just moved the notch away from.
              safeArea: { top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left },
              safeEdgeMargin: 8,
              minTouch: 44,
            });
            Object.assign(result, probe, { ok: true, budget: route.budget, note: route.note });

            if (probe.coverage.contentSurfacesFound === 0) {
              result.ok = false;
              result.error =
                `no element matched the content selector(s) ${route.contentSelectors.join(", ")} — ` +
                `the coverage number would be 0% for a reason that has nothing to do with the layout`;
            }

            if (shots) {
              const file = join(runDir, `${route.id}__${device.id}.png`);
              await page.screenshot({ path: file });
              result.screenshot = file;
            }
          } catch (error) {
            result.ok = false;
            result.error = String(error?.message || error).split("\n")[0];
            if (shots) {
              try {
                const file = join(runDir, `FAILED__${route.id}__${device.id}.png`);
                await page.screenshot({ path: file });
                result.screenshot = file;
              } catch {
                /* the page may be gone */
              }
            }
          }
          results.push(result);
          options.onResult?.(result);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    runId,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    engine: engine.name,
    enginePrimary: engine.primary,
    baseUrl: url,
    devices: devices.map((d) => d.id),
    routes: routes.map((r) => r.id),
    runDir: shots ? runDir : null,
    results,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(LATEST_REPORT, JSON.stringify(report, null, 2));
  if (shots) writeFileSync(join(runDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}
