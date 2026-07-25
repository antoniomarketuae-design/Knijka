/**
 * The browser rapier shim (audit 2026-07-24 H-11 fix 1).
 *
 * Two things have to hold or the simulator dies on the phone it was supposed to
 * get faster:
 *   1. the shim satisfies @react-three/rapier's `await r.init()` contract — it
 *      awaits that unconditionally before constructing a World, and the plain
 *      @dimforge/rapier3d build ships an EMPTY init module, so a missing/
 *      throwing init means <Physics> suspends forever and nothing renders;
 *   2. next.config.ts still routes -compat to the shim for BROWSER builds only,
 *      because vehicle/*.test.ts run the same rapier world in Node with no
 *      bundler and no .wasm asset loader.
 *
 * The engine itself is not re-tested here — vehicle/harness.test.ts and friends
 * do that against the real world. `@dimforge/rapier3d` is bundler-only (its
 * internal imports are extensionless and its wasm arrives via `import * as wasm
 * from "./rapier_wasm3d_bg.wasm"`), so it cannot be loaded in Node at all;
 * that is precisely why the alias is scoped to the browser condition, and why
 * this test stubs the package rather than importing it for real.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ENGINE = { World: class {}, RigidBodyDesc: class {}, ColliderDesc: class {} };

vi.mock("@dimforge/rapier3d", () => ({ ...ENGINE, default: ENGINE }));

const PLATFORM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("rapierBrowser shim", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves init() so <Physics> can leave suspense", async () => {
    const shim = await import("./rapierBrowser");

    expect(typeof shim.init).toBe("function");
    // @react-three/rapier does `await r.init()` — a thenable is the contract,
    // and it must SETTLE (a never-resolving promise suspends the scene forever).
    await expect(shim.init()).resolves.toBeUndefined();
  });

  it("re-exports the engine surface @react-three/rapier statically imports", async () => {
    const shim = await import("./rapierBrowser");

    // The named bindings react-three-rapier pulls in at module scope; if any of
    // them stopped coming through, the simulator chunk would fail to link.
    expect(shim.World).toBe(ENGINE.World);
    expect(shim.ColliderDesc).toBe(ENGINE.ColliderDesc);
    // VehicleSim's `RapierModule` type is the DEFAULT export of -compat.
    expect(shim.default).toBe(ENGINE);
  });

  it("is wired in next.config.ts for the browser condition only", () => {
    const config = readFileSync(path.join(PLATFORM, "next.config.ts"), "utf8");

    // Aliasing -compat unconditionally would break the Node harness tests, which
    // import it directly and rely on its inlined-base64 wasm to run without a
    // bundler. The `browser:` key is the whole safety property.
    expect(config).toMatch(/"@dimforge\/rapier3d-compat":\s*\{\s*browser:/);
    expect(config).toMatch(/modules\/sim\/vehicle\/rapierBrowser/);
  });
});
