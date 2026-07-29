// -----------------------------------------------------------------------------
// pw.mjs — the ONE place this harness gets a browser from.
//
// Two things it fixes, both of which have already cost this project a day:
//
// 1. WEBKIT IS THE PRIMARY ENGINE, NOT CHROMIUM. Every mobile check this repo
//    ever ran used Chromium with an iPhone user-agent. That is not an iPhone.
//    Safe areas (env(safe-area-inset-*)), URL-bar/toolbar viewport resizing,
//    scroll containment/overscroll, `svh`/`dvh` resolution and touch hit
//    testing are exactly the places the two engines disagree — which is why
//    fixes passed on this box and died on the founder's screen. `webkit()` is
//    the default export here; Chromium is available as a deliberate SECOND
//    opinion and is never the first.
//
// 2. BROWSERS AND TEMP FILES LIVE ON E:. The dev box's C: is chronically
//    near-full (memory: dev-machine-health), so the Playwright registry is
//    pinned to E:\ms-playwright and TEMP is moved to E:\tmp before Playwright
//    is loaded. Same rule as tools/clips/headless/pw.mjs.
//
// MODULE RESOLUTION. tools/mobile/ has no node_modules of its own on purpose —
// Playwright is ~500 MB with its browsers and E: is a mechanical disk, so this
// resolves the ALREADY-INSTALLED copy under tools/clips/headless/. Order:
//   $KNIJKA_PLAYWRIGHT_ROOT -> plain bare import -> tools/clips/headless.
// In CI, `npm i playwright` anywhere on the ancestor path makes the bare
// import win and this file needs no change.
// -----------------------------------------------------------------------------
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "E:\\ms-playwright";
try {
  mkdirSync("E:\\tmp", { recursive: true });
  process.env.TEMP ||= "E:\\tmp";
  process.env.TMP ||= "E:\\tmp";
} catch {
  // Not on the dev box (CI/linux) — the OS default temp dir is fine.
}

/** Candidate roots to resolve the `playwright` package from, in order. */
const ROOTS = [
  process.env.KNIJKA_PLAYWRIGHT_ROOT,
  new URL("./", import.meta.url).href, // tools/mobile/lib — walks up normally
  new URL("../../clips/headless/", import.meta.url).href,
].filter(Boolean);

async function loadPlaywright() {
  const failures = [];
  for (const root of ROOTS) {
    try {
      const base = root.startsWith("file:") ? root : pathToFileURL(root).href;
      const require = createRequire(base.endsWith("/") ? `${base}index.mjs` : base);
      const entry = require.resolve("playwright");
      const mod = await import(pathToFileURL(entry).href);
      // Playwright ships CommonJS. Node's ESM-CJS interop only surfaces named
      // exports it can statically detect, and playwright's entry defeats that,
      // so the launchers live on `default`. Unwrap once, here, rather than in
      // every caller.
      const ns = mod.webkit ? mod : mod.default;
      if (!ns || typeof ns.webkit?.launch !== "function") {
        throw new Error(`resolved ${entry} but it exposes no webkit launcher`);
      }
      return ns;
    } catch (error) {
      failures.push(`${root}: ${error.message}`);
    }
  }
  throw new Error(
    `[mobile-harness] could not resolve the playwright package.\n` +
      failures.map((f) => `  - ${f}`).join("\n") +
      `\nInstall it (npm i -D playwright) or set KNIJKA_PLAYWRIGHT_ROOT to a ` +
      `directory that can resolve it.`,
  );
}

const playwright = await loadPlaywright();

/** THE default engine. Anything that measures the founder's phone uses this. */
export const webkit = playwright.webkit;
/** Second opinion only — never the primary source of a mobile number. */
export const chromium = playwright.chromium;
export const firefox = playwright.firefox;

/**
 * Resolve an engine by name, defaulting to WebKit and shouting about the
 * alternative so a Chromium number is never mistaken for an iPhone number.
 */
export function engineByName(name = "webkit") {
  const key = String(name).toLowerCase();
  if (key === "webkit") return { name: "webkit", launcher: webkit, primary: true };
  if (key === "chromium") return { name: "chromium", launcher: chromium, primary: false };
  if (key === "firefox") return { name: "firefox", launcher: firefox, primary: false };
  throw new Error(`[mobile-harness] unknown engine "${name}" (webkit|chromium|firefox)`);
}
