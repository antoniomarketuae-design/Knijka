/**
 * Browser-only stand-in for `@dimforge/rapier3d-compat` (audit 2026-07-24
 * H-11, fix 1). Wired by `turbopack.resolveAlias` in next.config.ts under the
 * `browser` condition ONLY — nothing imports this file by name.
 *
 * WHY: the `-compat` package inlines the 1.53 MB physics wasm as a base64
 * string literal. Measured on the production build, that made one 2,236,377 B
 * chunk holding a single 2,092,530-character base64 blob — a blob the phone
 * must download, then run through a JS string decode, before a single frame of
 * the simulator can render. The plain `@dimforge/rapier3d` build ships the same
 * engine as a real `.wasm` asset, which the browser stream-compiles off the
 * network while the rest of the JS parses.
 *
 * The two packages are the same library with one difference that matters here:
 * `-compat` gates everything behind `await init()` (it has to — it must decode
 * that base64 first), while the plain build initializes its wasm as part of
 * module evaluation and therefore ships an EMPTY `init` module. @react-three/
 * rapier calls `await r.init()` unconditionally, so the shim supplies the
 * already-resolved no-op that contract expects.
 *
 * NODE IS DELIBERATELY NOT ALIASED. The vehicle harness tests
 * (vehicle/*.test.ts) run the real rapier world headless and import `-compat`
 * directly; that path has no bundler and no `.wasm` asset loader, and the
 * base64 inlining is exactly what makes it work. The alias is scoped to the
 * browser condition so the harness keeps its working import while the phone
 * stops paying for it.
 */

export * from "@dimforge/rapier3d";
export { default } from "@dimforge/rapier3d";

/**
 * `-compat`'s init gate. The plain build has already initialized its wasm by
 * the time this module finishes evaluating (its `rapier_wasm3d.js` sets the
 * wasm instance at import time), so awaiting this is a formality — but it MUST
 * exist and MUST resolve, because @react-three/rapier awaits it before it will
 * construct a World.
 */
export async function init(): Promise<void> {
  // Intentionally empty — see the note above.
}
