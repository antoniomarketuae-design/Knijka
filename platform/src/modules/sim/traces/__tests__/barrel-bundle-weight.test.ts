/**
 * The sim/traces barrel must not drag the clip-replay registry (audit
 * 2026-07-24 M-26).
 *
 * /theory/practice, the mock-exam runner /exams/[attemptId] and /review/verdict
 * all reach this barrel — they draw the 2D mistake replay through
 * modules/clips/replay/mistakeReplayCore, which borrows `sampleAt` and friends so
 * the 2D replay can never drift from the 3D ghost player. A barrel re-export is
 * a STATIC edge whether or not the symbol is ever called, so while the barrel
 * re-exported ./clipReplay (→ its ~40 scripted-drive recorders → their scenario
 * template modules) every theory learner downloaded and parsed the simulator's
 * clip-production registry to render a canvas. Measured on the production
 * Turbopack build: 488 KB raw / 103 KB gzip off /theory/practice, the exam
 * runner AND /review/verdict — the flagship exam screen, on a phone, forever.
 *
 * This is a STATIC-GRAPH test, not a runtime one: the weight is paid at parse
 * time by the bundler's module graph, so only the graph can prove it is gone.
 * It walks value-carrying imports (type-only edges are erased by tsc and cost
 * nothing) and fails if clipReplay is reachable from the barrel or from the
 * theory chain.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

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
    for (const spec of valueImports(readFileSync(file, "utf8"))) {
      const next = resolveSpec(spec, file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

const BARREL = "modules/sim/traces/index.ts";
const CLIP_REPLAY = "modules/sim/traces/clipReplay.ts";
const CATALOGUE = /^modules\/sim\/lessons\/scenario\/templates/;

describe("sim/traces barrel weight (M-26)", () => {
  it("does not reach the clip-replay registry", () => {
    const graph = moduleGraph(path.join(SRC, BARREL));

    expect(graph.has(BARREL)).toBe(true); // walker sanity — the entry itself
    expect([...graph].filter((f) => f.includes("traces/clipReplay"))).toEqual([]);
  });

  it("keeps the theory 2D replay off the clip-replay registry", () => {
    // The exact chain the audit measured: PracticeSession → QuestionMedia →
    // SceneStill → mistakeReplayCore → @/modules/sim/traces.
    const graph = moduleGraph(path.join(SRC, "modules/clips/replay/mistakeReplayCore.ts"));

    expect(graph.has(BARREL)).toBe(true); // the chain is still real
    expect([...graph].filter((f) => f.includes("traces/clipReplay"))).toEqual([]);
  });

  it("still reaches the registry from the build-time clip-plan generator", () => {
    // The counter-assertion: the weight was not deleted, it was MOVED to the
    // node-only tool that actually needs it. If this ever goes green-by-absence
    // the deep import has been dropped and the generator is broken.
    const graph = moduleGraph(path.join(SRC, "modules/clips/clipPlanBuilder.ts"));

    expect(graph.has(CLIP_REPLAY)).toBe(true);
    expect([...graph].filter((f) => CATALOGUE.test(f)).length).toBeGreaterThan(0);
  });

  it("ratchets the scenario-template modules still on the theory path", () => {
    // HONEST RESIDUAL: the barrel also re-exports 65 scripted-drive recorders
    // one by one, and each pins its own scenario template module — Turbopack
    // does not shake those re-exports out, so ~234 KB of catalogue still lands
    // on the theory chunk. Severing that needs a narrow playback sub-barrel and
    // is a separate change; this ratchet exists so nobody grows the residual
    // back while it waits.
    const templates = [...moduleGraph(path.join(SRC, BARREL))].filter((f) => CATALOGUE.test(f));

    expect(templates.length).toBeLessThanOrEqual(13);
  });
});
