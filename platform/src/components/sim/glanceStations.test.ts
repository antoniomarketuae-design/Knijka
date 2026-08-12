/**
 * THE THREE GRADED MIRROR STATIONS — the contract that makes a one-shot press
 * a VISIBLE glance, pinned so it cannot be argued about again.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * «Л» / «З» / «Д» were reported as producing no camera movement at all — by
 * touch, by mouse and by `element.click()` — and that report was wrong. What
 * had actually happened is that the instrument ran slower than the thing it
 * measured: a HELD key stays deflected across arbitrarily many slow frames, so
 * it photographs on any shutter, while a TAP holds for `GLANCE_TAP_HOLD_S` and
 * then eases home over `GLANCE_EASE_S`. Photograph that a second later, or on a
 * SwiftShader frame loop running at 0.4 fps, and a perfectly live control reads
 * as dead. (Measured end to end in `tools/mobile/glance-envelope.mjs` and
 * `glance-probe.mjs`; with a real GPU the same taps move 89 % of the road's
 * pixels, identical to the held-key positive control, and 7 % — baseline — at
 * +1800 ms, which is the false negative.)
 *
 * So the two things that must never quietly change are pinned here:
 *
 *  1. THE STATIONS MUST USE THE TAP PATH. `cabin.glance()` starts a hold that
 *     releases ITSELF; `cabin.glanceStart()` is the KEY path and has no timer,
 *     because a key has a keyup. Wiring a one-shot button to `glanceStart`
 *     leaves the head turned for ever; wiring it to `glanceStart` + an
 *     immediate `glanceEnd` produces NO head turn at all — measured at 4.5 % of
 *     road pixels against a 7.6 % noise floor, i.e. exactly the „dead button"
 *     this file is named after. Both wrong answers look reasonable in a diff.
 *
 *  2. THE HOLD MUST BE LONG ENOUGH TO SEE. A glance that is graded but
 *     invisible is the founder's own „pressing a button with no meaning".
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLANCE_EASE_S,
  GLANCE_TAP_HOLD_S,
  GlanceHold,
  type MirrorGlanceKind,
} from "@/modules/sim/scene/cabin";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("the touch stations are wired to the SELF-RELEASING glance", () => {
  const body = stripComments(read("components/sim/TouchControls.tsx"));

  it.each([
    ["left", "Поглед в лявото огледало"],
    ["rear", "Поглед в огледалото за задно виждане"],
    ["right", "Поглед в дясното огледало"],
  ])("«%s» calls cabin.glance(), the path that holds and then lets go", (mirror, labelBg) => {
    expect(body, `the ${mirror} station must still be on screen`).toContain(labelBg);
    expect(body).toContain(`glance("${mirror}")`);
  });

  it("a hold started here is always given a way to end", () => {
    // `glanceStart` is the KEY path: it has no timer, because a key has a
    // keyup. A one-shot button wired to it leaves the head turned for ever.
    // This does NOT forbid a future hold-to-glance touch control — that would
    // be a better teacher than a 0.9 s flick — it requires only that whoever
    // builds one binds the release edge in the same file, the way
    // `GlanceEdgePings` and `VitokCockpit` already do.
    if (body.includes("glanceStart(")) expect(body).toContain("glanceEnd(");
  });
});

describe("a single tap turns the head long enough to be seen", () => {
  /** Advance a hold at 60 fps and report the envelope every frame. */
  function tapTrace(mirror: MirrorGlanceKind): number[] {
    const g = new GlanceHold();
    g.start(mirror, true); // exactly what `CabinControls.glance()` does
    const out: number[] = [];
    for (let i = 0; i < 180; i += 1) {
      g.update(1 / 60);
      out.push(g.strength);
    }
    return out;
  }

  it("holds at full deflection for the whole tap window, then comes home", () => {
    const trace = tapTrace("left");
    expect(Math.max(...trace)).toBe(1);
    const heldFrames = trace.filter((v) => v > 0.5).length;
    // The press, the ease in and the ease out, minus the frame the release
    // lands on. Anything materially shorter is a flash nobody can read.
    expect(heldFrames / 60).toBeGreaterThan(GLANCE_TAP_HOLD_S - GLANCE_EASE_S);
    expect(trace[trace.length - 1]).toBe(0); // and it always lets go
  });

  it("…on every mirror, not just the one anyone happened to test", () => {
    for (const mirror of ["left", "right", "rear"] as const) {
      expect(Math.max(...tapTrace(mirror))).toBe(1);
    }
  });

  it("a KEY tap — press and release in the same frame — turns nothing, by design", () => {
    // This is the shape the „dead button" measurement actually had, and it is
    // correct behaviour for a keyboard: Q is a HOLD. It is pinned so nobody
    // mistakes it for the touch path's contract and „fixes" the wrong one.
    const g = new GlanceHold();
    g.start("left"); // no tap flag: the key path
    g.end("left");
    const seen: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      g.update(1 / 60);
      seen.push(g.strength);
    }
    expect(Math.max(...seen)).toBe(0);
  });
});
