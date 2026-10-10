/**
 * ADR-017 — THE RIG'S STEP HANDLE AND ITS PAD SHIM ARE ABSENT FROM PRODUCTION.
 *
 * ADR-017 gave the drive rig a read handle on the physics step track and the
 * session grid clock (`window.__rigStepSource`, published by LessonScene) and
 * made its synthetic pad evaluate the controller lazily on every
 * `navigator.getGamepads()` read. Both are DEV instruments: a production
 * session must carry neither the handle (a window global that exposes the
 * car's per-step state) nor the shim (a replaced `navigator.getGamepads` that
 * drives the car). How the dev route is excluded TODAY, and what this file
 * proves stays so:
 *
 *   1. `/dev/drive-rig/page.tsx` calls `notFound()` under
 *      `NODE_ENV === "production"` (pinned for every dev route, unconditional
 *      spelling and no escape hatch, by app/dev/__tests__/dev-surfaces-gated);
 *   2. the rig (`DriveRig`, the pad) is VALUE-imported by that route's client
 *      and by nothing else — the census below walks platform/src;
 *   3. the handle is published from ONE place, LessonScene, inside a layout
 *      effect whose first statement is the bare production early return —
 *      pinned on the source text;
 *   4. and the proof that matters: the PRODUCTION BUNDLE of the student's
 *      simulator route (app/(dashboard)/simulator/simulator-client.tsx →
 *      LessonPlayShell → SceneSlot → the dynamically imported LessonScene),
 *      built here with rolldown under `process.env.NODE_ENV = "production"`
 *      and minified (dead-code elimination, as the Next build does), carries
 *      neither the handle's name nor the pad's identity. The SAME bundle
 *      built for development carries the handle — the positive control, so
 *      the absence is a measurement and not a matcher that cannot see.
 */
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import { RIG_STEP_SOURCE_GLOBAL } from "../rig";

const SRC = path.resolve(__dirname, "../../../..");
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");

/** The pad's identity string (rig.ts SyntheticPad) — present wherever the shim is. */
const PAD_ID = "aidrive drive-rig (STANDARD GAMEPAD)";

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
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated") continue;
      out.push(...collect(p, filename));
    } else if (filename.test(e.name)) out.push(p);
  }
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || /[\\/]__tests__[\\/]/.test(f);

describe("ADR-017 — the step handle and the pad shim: source census", () => {
  const sources = collect(SRC, /\.(ts|tsx)$/).filter((f) => !isTest(f));

  it("sweeps the tree at all (an empty sweep proves nothing)", () => {
    expect(sources.length).toBeGreaterThan(500);
  }, 120_000);

  it("the handle's name appears in exactly two product files: the rig that reads it and the scene that publishes it", () => {
    expect(RIG_STEP_SOURCE_GLOBAL).toBe("__rigStepSource");
    const hits = sources.filter((f) => readFileSync(f, "utf8").includes(RIG_STEP_SOURCE_GLOBAL)).map(rel);
    expect(hits.sort()).toEqual(["components/sim/LessonScene.tsx", "modules/sim/devrig/rig.ts"]);
  }, 120_000);

  it("LessonScene publishes it ONCE, inside a layout effect whose first statement is the bare production early return", () => {
    const src = readFileSync(path.join(SRC, "components/sim/LessonScene.tsx"), "utf8");
    const assign = "host.__rigStepSource = view;";
    expect(src.split(assign).length - 1).toBe(1);
    const at = src.indexOf(assign);
    const open = src.lastIndexOf("useLayoutEffect(() => {", at);
    expect(open, "the publication must sit in a useLayoutEffect").toBeGreaterThan(-1);
    const body = src.slice(open + "useLayoutEffect(() => {".length, at);
    // Its FIRST statement is the gate, spelled bare (no &&, no ||, no env var).
    expect(
      body.trimStart().startsWith('if (process.env.NODE_ENV === "production") return;'),
      "the effect's FIRST statement must be the bare production early return",
    ).toBe(true);
    // …and nothing between the gate and the assignment closes the effect.
    expect(body.includes("});")).toBe(false);
    // The scene imports the rig's TYPES only — never the rig.
    const devrigImports = src.match(/^import[^;]*from "@\/modules\/sim\/devrig";/gm) ?? [];
    expect(devrigImports.length).toBe(1);
    expect(devrigImports[0]!.startsWith("import type ")).toBe(true);
  });

  it("the rig itself is value-imported by the drive-rig route's client and by nothing else", () => {
    const importers = sources
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        return (
          /import\s*\{[^}]*\bDriveRig\b[^}]*\}\s*from\s*"(@\/modules\/sim\/devrig|\.\.?\/[^"]*devrig[^"]*|\.\/rig)"/.test(s) ||
          /from\s*"(@\/modules\/sim\/devrig\/rig|\.\/rig)"/.test(s.replace(/^import type[^;]*;/gm, ""))
        );
      })
      .map(rel);
    expect(importers.sort()).toEqual(["app/dev/drive-rig/drive-rig-client.tsx", "modules/sim/devrig/index.ts"]);
  }, 120_000);

  it("the drive-rig route still 404s in production (the route's own gate, re-read here)", () => {
    const page = readFileSync(path.join(SRC, "app/dev/drive-rig/page.tsx"), "utf8");
    expect(page).toMatch(/if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/);
  });
});

// ---------------------------------------------------------------------------
// The production bundle
// ---------------------------------------------------------------------------

/** Bundle `entry` the way a build would for `mode` and return all chunk code. */
async function bundle(entry: string, mode: "production" | "development"): Promise<{ code: string; modules: number }> {
  const b = await rolldown({
    input: path.join(SRC, entry),
    platform: "browser",
    logLevel: "silent",
    // Third-party packages are not under test and are not where the rig lives.
    // So is the generated Prisma client (server-only, not generated in every tree).
    external: (id) =>
      (!id.startsWith(".") && !id.startsWith("@/") && !path.isAbsolute(id)) || id.startsWith("@/generated/"),
    resolve: { alias: { "@": SRC } },
    transform: {
      define: { "process.env.NODE_ENV": JSON.stringify(mode) },
      jsx: "react-jsx",
    },
    moduleTypes: { ".css": "empty", ".glsl": "text", ".svg": "empty", ".png": "empty" },
    treeshake: true,
  });
  try {
    const { output } = await b.generate({ format: "esm", minify: true });
    let code = "";
    let modules = 0;
    for (const o of output) {
      if (o.type === "chunk") {
        code += o.code + "\n";
        modules += o.moduleIds.length;
      }
    }
    return { code, modules };
  } finally {
    await b.close();
  }
}

const SIMULATOR = "app/(dashboard)/simulator/simulator-client.tsx";

describe("ADR-017 — the production bundle of the student's simulator route", () => {
  it("carries neither the step handle nor the pad shim — and the development bundle of the SAME route carries the handle (positive control)", async () => {
    const prod = await bundle(SIMULATOR, "production");
    const dev = await bundle(SIMULATOR, "development");
    // The bundle really is the scene: the dynamically imported LessonScene and
    // the grade grid are in it (a bundle that missed them would prove nothing).
    expect(prod.modules).toBeGreaterThan(200);
    // (Method names survive minification: `stepPhysics` is GradeGrid's live
    // entry, called from LessonScene's RuntimeDriver.)
    expect(prod.code).toContain("stepPhysics");
    expect(prod.code).toContain("advanceSteps");
    expect(dev.code.includes(RIG_STEP_SOURCE_GLOBAL), "positive control: the dev bundle publishes the handle").toBe(true);
    expect(prod.code.includes(RIG_STEP_SOURCE_GLOBAL), "the production bundle must not carry the step handle").toBe(false);
    expect(prod.code.includes(PAD_ID), "the production bundle must not carry the rig's pad").toBe(false);
    expect(dev.code.includes(PAD_ID), "nor does the simulator route carry the pad even in dev").toBe(false);
  }, 300_000);

  it("the pad marker is real: the drive-rig route's own client bundle carries it (positive control for the pad)", async () => {
    const rigDev = await bundle("app/dev/drive-rig/drive-rig-client.tsx", "development");
    expect(rigDev.code.includes(PAD_ID)).toBe(true);
    expect(rigDev.code.includes(RIG_STEP_SOURCE_GLOBAL)).toBe(true);
  }, 300_000);
});
