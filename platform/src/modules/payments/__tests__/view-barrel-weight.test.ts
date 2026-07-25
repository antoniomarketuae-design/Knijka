/**
 * A client island may never reach the payments store (integration gate,
 * 2026-07-25).
 *
 * The H-9 consent gate landed as a `"use client"` island that imported the
 * consent copy from `@/modules/payments`. That barrel re-exports the
 * entitlement store, so the browser graph became store.ts → lib/db →
 * @prisma/adapter-pg → pg → `node:net`/`node:tls`/`node:dns`/`node:fs`. Unlike
 * the usual barrel-weight problem this is not a size regression that ships
 * quietly: Turbopack cannot polyfill those builtins and `npm run build` died
 * with 7 module-not-found errors. tsc and vitest were both green throughout,
 * because a type-checker and a node-environment test runner are perfectly happy
 * to resolve `pg`.
 *
 * That is the reason this is a STATIC-GRAPH test rather than an import
 * smoke-test: only the module graph can distinguish "works under node" from
 * "can be bundled for a browser". The walker follows value-carrying imports
 * (type-only edges are erased by tsc and cost nothing) and is the same one used
 * by modules/sim/traces/__tests__/barrel-bundle-weight.test.ts.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Every module specifier in `source` that survives type erasure.
 *
 * Deliberately dumb string scanning rather than a real parser: the assertion is
 * about which FILES the bundler pulls in, and over-collecting (e.g. a specifier
 * inside a comment) can only make the test stricter, never falsely green.
 */
function valueImports(source: string): string[] {
  const specs: string[] = [];
  // `import ... from "x"` / `export ... from "x"` / bare `import "x"`.
  const re =
    /(?:^|[\s;}])(import|export)\s+([^;]*?)from\s*["']([^"']+)["']|(?:^|[\s;}])import\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[4]) {
      specs.push(m[4]);
      continue;
    }
    // `import type {...}` / `export type {...}` are erased entirely. A mixed
    // clause (`import { a, type B }`) still carries a value edge, so only the
    // statement-level `type` keyword disqualifies it.
    if (/^type\s/.test(m[2].trimStart())) continue;
    specs.push(m[3]);
  }
  return specs;
}

/**
 * True when `source` opens with a `"use server"` directive.
 *
 * Such a module is a boundary, not an edge: Next replaces each of its exports
 * with a client reference stub, so nothing it imports reaches the browser. The
 * consent island calls a server action that imports the whole payments barrel
 * and that is entirely correct — walking through it would report a `pg` edge
 * the bundler never creates. Skipping leading comments matters because this
 * codebase puts a file header above the directive as often as below it.
 */
function isServerBoundary(source: string): boolean {
  let i = 0;
  for (;;) {
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source.startsWith("//", i)) {
      const nl = source.indexOf("\n", i);
      if (nl === -1) return false;
      i = nl + 1;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i);
      if (end === -1) return false;
      i = end + 2;
    } else {
      return /^["']use server["']/.test(source.slice(i));
    }
  }
}

/** Resolve a specifier the way the bundler's tsconfig paths + extensions do. */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package — not our source graph

  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/** Transitive value-import closure of `entry`, as paths relative to src/. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = readFileSync(file, "utf8");
    // Record the boundary module itself, then stop — see isServerBoundary.
    if (rel !== path.relative(SRC, entry).split(path.sep).join("/") && isServerBoundary(source)) {
      continue;
    }
    for (const spec of valueImports(source)) {
      const next = resolveSpec(spec, file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

const VIEW = "modules/payments/view.ts";
const SERVER_BARREL = "modules/payments/index.ts";
const COPY = "modules/payments/consentCopy.ts";
const CONSENT_GATE = "app/(dashboard)/checkout/consent-gate.tsx";
/** Anything that ends in a database connection. `lib/db` is the only door. */
const DB = /^(lib\/db\.ts|modules\/payments\/store\.ts)$/;

describe("payments/view — browser-safe barrel", () => {
  it("never reaches the database", () => {
    const graph = moduleGraph(path.join(SRC, VIEW));

    expect(graph.has(VIEW)).toBe(true); // walker sanity — the entry itself
    expect([...graph].filter((f) => DB.test(f))).toEqual([]);
  });

  it("keeps the /checkout consent island off the database", () => {
    // The exact regression: this island renders CHECKOUT_CONSENT_TEXTS_BG, and
    // reading it off the server barrel put `pg` in the browser bundle.
    const graph = moduleGraph(path.join(SRC, CONSENT_GATE));

    expect([...graph].filter((f) => DB.test(f))).toEqual([]);
  });

  it("serves the island the SAME copy the server stores as proof", () => {
    // Counter-assertion: the strings were not duplicated to dodge the bundler.
    // Both sides must land on the one leaf module, or the stored ConsentEvent
    // text could drift from what the buyer actually read.
    expect(moduleGraph(path.join(SRC, CONSENT_GATE)).has(COPY)).toBe(true);
    expect(moduleGraph(path.join(SRC, SERVER_BARREL)).has(COPY)).toBe(true);
  });

  it("leaves the server barrel able to reach the store", () => {
    // The weight was moved, not deleted. If this ever goes green-by-absence the
    // server surface has been gutted and consent is no longer being persisted.
    const graph = moduleGraph(path.join(SRC, SERVER_BARREL));

    expect(graph.has("modules/payments/store.ts")).toBe(true);
  });
});
