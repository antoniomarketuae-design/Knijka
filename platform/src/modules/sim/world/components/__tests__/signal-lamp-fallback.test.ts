/**
 * B35 — A SIGNAL HEAD WITH NO PHASE SOURCE MUST NEVER RENDER GREEN.
 *
 * The render layer used to fall back to `?? "green"` when `getSignalPhase` was
 * not wired, while the engine layer it draws documents the opposite rule in as
 * many words (runtime/signals.ts lampState: "Unknown ids fail exactly like
 * phase(): 'red' (never a phantom green)").
 *
 * The cost was not cosmetic. On «Загаснал светофар» — a lesson whose entire
 * subject is that an extinguished head means равнозначно кръстовище and
 * правилото на дясното — the brightest thing on the head was a green lamp.
 * A student reads "green, go" and drives into the junction the lesson exists to
 * teach him to yield at. Any scene mounted without a signal runtime hit this,
 * including /dev/scene-still, which is what several review passes photographed.
 *
 * This is a source pin rather than a render assertion because the fallback is a
 * single token inside a useFrame loop that no unit test can reach — and a
 * single token is exactly what regressed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORLD_PROPS = join(
  process.cwd(),
  "src",
  "modules",
  "sim",
  "world",
  "components",
  "WorldProps.tsx",
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("signal lamp render fallback", () => {
  const source = stripComments(readFileSync(WORLD_PROPS, "utf8"));

  it("never defaults an unresolved head to green", () => {
    expect(source).not.toMatch(/getSignalPhase\?\.\([^)]*\)\s*\?\?\s*"green"/);
    // Belt and braces: no `?? "green"` anywhere in the file at all.
    expect(source).not.toMatch(/\?\?\s*"green"/);
  });

  it("defaults every head — vehicle AND pedestrian — to dark", () => {
    const fallbacks = [...source.matchAll(/getSignalPhase\?\.\([^)]*\)\s*\?\?\s*"(\w+)"/g)].map(
      (m) => m[1],
    );
    // Two instanced passes render heads: TrafficLights and PedestrianSignals.
    expect(fallbacks.length).toBeGreaterThanOrEqual(2);
    for (const f of fallbacks) expect(f).toBe("dark");
  });

  it("the scanner has teeth", () => {
    // Proves the regex matches the shape it is meant to ban, so a green run
    // above means "the fallback is dark", not "the pattern never matched".
    const offender = `const s = getSignalPhase?.(light.nodeId, light.approachBearingDeg) ?? "green";`;
    expect(offender).toMatch(/getSignalPhase\?\.\([^)]*\)\s*\?\?\s*"green"/);
    const fixed = `const s = getSignalPhase?.(light.nodeId, light.approachBearingDeg) ?? "dark";`;
    expect(fixed).not.toMatch(/getSignalPhase\?\.\([^)]*\)\s*\?\?\s*"green"/);
  });
});
