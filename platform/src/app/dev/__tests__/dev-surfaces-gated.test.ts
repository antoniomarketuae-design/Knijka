import { type Dirent, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE INTERNAL SURFACES MUST NOT BE REACHABLE IN A PRODUCTION BUILD.
 *
 * `/dev/*` mounts the clip rig, the scene-still rig, the cluster/HUD previews
 * and the verdict board. `/api/dev/*` WRITES to `public/clips` and rewrites the
 * clip manifest. None of that belongs in front of a 17-year-old, and one of
 * them is an unauthenticated write endpoint.
 *
 * Each of those files gates itself on `process.env.NODE_ENV === "production"`.
 * That convention held only because everyone remembered it — nothing failed if
 * a new dev route forgot, or if someone widened a gate to `NODE_ENV ===
 * "production" && !process.env.SOMETHING` to unblock an afternoon.
 *
 * WHY THIS FILE EXISTS NOW (2026-07-27): the clip rig was rebuilt because
 * /dev/clip-headless had become unrenderable (docs/development/69). One of the
 * candidate fixes was to serve the dev surfaces from a PRODUCTION build behind
 * an opt-in env var. That fix was NOT taken — the rig stays in development mode
 * — but the fact that it was seriously considered is exactly the moment to
 * nail the gate down, so the next person who considers it has to delete a
 * failing test on purpose rather than widen a condition by accident.
 *
 * This is a source-level test on purpose. Importing the route modules would
 * only prove the gate for the NODE_ENV the test process happens to run under;
 * reading the source proves the gate is PRESENT and UNCONDITIONAL for every
 * file, including ones added after this test was written.
 */

const APP = path.resolve(__dirname, "../..");
const DEV_PAGES = path.join(APP, "dev");
const DEV_API = path.join(APP, "api", "dev");

/**
 * `withFileTypes` on purpose: the directory entry already carries the kind, so
 * this asks the filesystem once per DIRECTORY instead of once per FILE. The
 * KNIJKA_DIST_DIR sweep below walks src/app + src/modules + src/lib — thousands
 * of entries — and the repo lives on a 7200 rpm spinning disk, where a per-entry
 * `statSync` is a per-entry seek.
 */
function collect(dir: string, filename: RegExp): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p, filename));
    else if (filename.test(e.name)) out.push(p);
  }
  return out;
}

/** Every route file that is reachable over HTTP under /dev or /api/dev. */
const routeFiles = [
  ...collect(DEV_PAGES, /^page\.tsx?$/),
  ...collect(DEV_PAGES, /^route\.tsx?$/),
  ...collect(DEV_API, /^route\.tsx?$/),
];

const rel = (p: string) => path.relative(APP, p).replace(/\\/g, "/");

/**
 * The one accepted spelling of the gate. Deliberately strict: it matches a bare
 * comparison and nothing else, so `NODE_ENV === "production" && !FOO` or
 * `NODE_ENV === "production" || FOO` fails this test rather than shipping.
 */
const GATE = /process\.env\.NODE_ENV\s*===\s*["'`]production["'`]\s*\)/;

/** Anything that would let an env var re-open a gate at runtime. */
const ESCAPE_HATCH =
  /process\.env\.NODE_ENV\s*===\s*["'`]production["'`]\s*(&&|\|\|)|(&&|\|\|)\s*process\.env\.NODE_ENV\s*===\s*["'`]production["'`]/;

describe("dev surfaces are unreachable in a production build", () => {
  it("finds the dev routes at all (a passing test on an empty list proves nothing)", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(9);
  });

  it.each(routeFiles.map((f) => [rel(f), f] as const))("%s gates on NODE_ENV=production", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(GATE);
  });

  it.each(routeFiles.map((f) => [rel(f), f] as const))(
    "%s has no env-var escape hatch around the gate",
    (_name, file) => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(ESCAPE_HATCH);
    },
  );

  /**
   * The clip rig (tools/clips/headless/clip-rig.mjs) introduced KNIJKA_DIST_DIR
   * so the render server can keep its Turbopack cache away from the shared dev
   * server's. It selects a BUILD DIRECTORY and must never grow into a way to
   * change what is served. If someone ever reaches for it to unlock a surface,
   * this fails.
   *
   * THE TIMEOUT IS DECLARED, NOT DECORATIVE. This case reads every .ts/.tsx
   * under src/app, src/modules and src/lib. Warm, that is ~0.8 s and it looks
   * like a fast test; COLD, on this repo's 7200 rpm disk and with several agents
   * sharing a 16 GB box, three consecutive solo runs took 22.2 s, 26.8 s and
   * 39.5 s — every one of them a failure against vitest's 5 s default, and every
   * one of them written off as a flake because the next warm run passed. It is
   * not a flake: it is an I/O-bound sweep whose cost depends on the page cache.
   * `collect` above no longer stats per file, and this says out loud what the
   * sweep may cost, so a cold run reports the truth instead of a phantom.
   */
  it("KNIJKA_DIST_DIR never reaches application code", () => {
    const appSources = [
      ...collect(APP, /\.(ts|tsx)$/),
      ...collect(path.resolve(APP, "..", "modules"), /\.(ts|tsx)$/),
      ...collect(path.resolve(APP, "..", "lib"), /\.(ts|tsx)$/),
    ];
    const offenders = appSources
      // This file names the variable in order to forbid it.
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => readFileSync(f, "utf8").includes("KNIJKA_DIST_DIR"))
      .map(rel);
    expect(offenders).toEqual([]);
    // The sweep must actually have swept — an empty list proves nothing if the
    // walk silently found no files (a moved directory would do exactly that).
    expect(appSources.length).toBeGreaterThan(200);
  }, 120_000);
});
