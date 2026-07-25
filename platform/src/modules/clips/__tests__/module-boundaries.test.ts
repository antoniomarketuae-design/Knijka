/**
 * The boundaries the clips module exists to hold (audit M-20).
 *
 * M-20's finding was not "the files are scattered" — it was that the scattering
 * had a cost: every cross-module deep import into the simulator came from clip
 * code that had been filed under `learning`, because "which recorded drive
 * demonstrates this theory mistake?" is a question `learning` has no business
 * answering. Moving the pipeline into one module removed those imports. These
 * tests are what stops them growing back, and they would all have FAILED before
 * the move.
 *
 * Three properties, in order of how expensive it is to lose them:
 *
 *  1. `learning` never reaches the simulator. It is the student model — mastery,
 *     scheduling, readiness. It must be usable without a 3D engine in the graph.
 *  2. `@/modules/clips/view` — the barrel client components import — never
 *     reaches the simulator either. This is the M-26 lesson made structural: a
 *     re-export is a static edge whether or not the symbol is called, so one
 *     careless line here puts the ~737 KB scenario catalogue back on
 *     /theory/practice and the mock-exam runner.
 *  3. The pipeline has exactly one owner. Nothing outside `modules/clips`
 *     re-creates a `lib/clips` or a `components/theory/clip*`.
 *
 * STATIC-GRAPH tests, like sim/traces' barrel-bundle-weight battery: the weight
 * and the coupling are both paid at parse time by the bundler's module graph, so
 * only the graph can prove they are gone. The walker below is deliberately the
 * same dumb string scan that test uses — over-collecting (a specifier inside a
 * comment) can only make the assertion stricter, never falsely green. It is
 * duplicated rather than shared because a shared test util between two modules
 * is itself a cross-module import.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every module specifier in `source` that survives type erasure. */
function valueImports(source: string): string[] {
  const specs: string[] = [];
  const re =
    /(?:^|[\s;}])(import|export)\s+([^;]*?)from\s*["']([^"']+)["']|(?:^|[\s;}])import\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[4]) {
      specs.push(m[4]);
      continue;
    }
    // `import type {...}` is erased entirely; a mixed clause still carries a
    // value edge, so only the statement-level `type` keyword disqualifies it.
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

/** Every `.ts`/`.tsx` under `dir`, relative to src/, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      out.push(path.relative(SRC, p).split(path.sep).join("/"));
    }
  };
  walk(path.join(SRC, dir));
  return out;
}

const SIM = /^modules\/sim\//;

describe("learning no longer reaches the simulator (M-20)", () => {
  it("has no import of @/modules/sim anywhere in its production source", () => {
    // Before the move this failed on clipPlanBuilder.ts (sim/lessons,
    // sim/traces, sim/traces/clipReplay, sim/world), clipPilot.ts (sim/lessons)
    // and whyPanel.ts (sim/lessons, sim/rules, sim/scenarios) — the audit's
    // eight deep imports, all of them clip code.
    const offenders: string[] = [];
    for (const rel of sourceFiles("modules/learning")) {
      const source = readFileSync(path.join(SRC, rel), "utf8");
      // Type-only edges are erased and cost nothing, but a type dependency on
      // the simulator is still a design statement — flag value edges only,
      // which is what the audit counted.
      for (const spec of valueImports(source)) {
        if (spec.startsWith("@/modules/sim")) offenders.push(`${rel} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("clips/view stays free of the simulator (M-20 + M-26)", () => {
  it("does not reach modules/sim from the browser barrel", () => {
    const graph = moduleGraph(path.join(SRC, "modules/clips/view/index.ts"));

    expect(graph.has("modules/clips/view/index.ts")).toBe(true); // walker sanity
    expect([...graph].filter((f) => SIM.test(f)).sort()).toEqual([]);
  });

  it("still reaches the simulator from the server/build barrel", () => {
    // The counter-assertion. The coupling was not deleted, it was CONFINED to
    // the module that owns it: the resolver genuinely has to read the scenario
    // catalogue. If this ever goes green-by-absence, the why-panel has stopped
    // resolving drills and the split above proves nothing.
    const graph = moduleGraph(path.join(SRC, "modules/clips/index.ts"));

    expect([...graph].some((f) => SIM.test(f))).toBe(true);
  });
});

describe("the clip pipeline has exactly one owner (M-20)", () => {
  it("has no lib/clips and no components/theory/clip* left", () => {
    // The six locations the audit named. Two of them were homes nothing should
    // move back into; a third (`app/dev/*`) is a legitimate CONSUMER and stays.
    expect(existsSync(path.join(SRC, "lib/clips"))).toBe(false);

    const strays = readdirSync(path.join(SRC, "components/theory")).filter(
      (f) => /^(clip|whyPanelModel|mistakeReplayCore|sceneStillCore|webmDuration)/.test(f),
    );
    expect(strays).toEqual([]);
  });
});
