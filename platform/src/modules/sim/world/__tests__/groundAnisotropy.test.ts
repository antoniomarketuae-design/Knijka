/**
 * THE GRAZING-ANGLE FILTER — the falloff row (register 87, STILL OPEN #10:
 * „the look: detail collapses past ~15 m").
 *
 * The measurement that produced these numbers, so a future edit knows what it
 * is undoing. `l0p-poligon-free`, tier `low`, cockpit pose, eye 1.3614 m above
 * the road (read off `__camProbe`, not assumed), car stationary, `low` download
 * budget (`colorOnly` — one map bound, no normal, no roughness; confirmed from
 * the request log: three KTX2 colour maps and the basis transcoder, nothing
 * else). Metric: RMS of a 3x3 Laplacian over a fixed 4.4 m strip of carriageway
 * centred on the eye axis, as a percent of the strip's mean luma — the SAME
 * pixels in every row. Controls in the same run: a synthetic constant patch
 * reads 0.000, the sky in the same frame reads 0.47, the source photograph
 * resampled to the band's own pixel rate reads 20.36 (8 m) / 10.26 (20 m).
 *
 *      anisotropy      8 m      12 m      20 m     20 m / 8 m
 *          1          1.999     1.747     1.481       0.74
 *          2          3.200     2.473     1.999       0.62
 *          4  (was)   4.418     3.147     2.369       0.54
 *          8          4.669     4.091     2.668       0.57
 *         16  (now)   4.669     4.774     3.432       0.74
 *
 * Two things in that table are the whole argument. The 8 m column SATURATES at
 * 8 — the footprint ratio there is 6.7:1, so nothing above 8 can buy anything
 * in the near field. The 20 m column is still climbing at 16, because its ratio
 * is 17:1. So the number that fixes the far field is free in the near field,
 * and „detail collapses past fifteen metres" goes from a 46 % fall to a 27 %
 * one WITHOUT one new byte, one new draw call or one new triangle.
 *
 * WHAT WAS TRIED AND DID NOT WORK, so nobody spends the day again: a mid-scale
 * albedo octave (an 11 m tile of the shared 64 KB noise, +-7.5 %, one extra tap)
 * on the theory that the road is missing 4-30 m "macro features". It moved
 * nothing — 4.611 -> 4.603 at 8 m and 2.423 -> 2.425 at 20 m — and the crops
 * were indistinguishable. The reason is in the data: at 20 m the carriageway
 * already carries MORE meso-scale energy (4.06) than at 8 m (1.93), because the
 * 2.6 m fine break's coarse fBm components survive mipping and project large at
 * distance. What is missing at twenty metres is pixel-scale, and pixel-scale is
 * a filtering problem, not an authoring one. It was reverted.
 *
 * Cost, measured on a GTX 1060 with the two conditions interleaved FRAME BY
 * FRAME under EXT_disjoint_timer_query_webgl2 (the in-scene A/B could not
 * resolve it against a +-0.6 ms run-to-run spread, and "I could not see a cost"
 * is not "there is no cost"), full-screen ground: 891x411 — the `low` reference
 * buffer — 0.053 -> 0.098 ms; 1264x661 0.095 -> 0.179 ms; 1920x1080 with the
 * med/high tap count 0.456 -> 0.829 ms. Measured asphalt coverage of a cockpit
 * frame is 32 %, so at the phone's buffer that is ~0.014 ms ON THAT GPU. A
 * Mali-G57 is not measurable here and this file does not pretend otherwise;
 * `?simPerf=1` + `__simPerf.gpu()` over chrome://inspect is the run that would
 * settle it, and it needs the handset.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QUALITY_PRESETS } from "../components/quality";
import { groundAnisotropyFor } from "../textures/pbrTextures";
import { TEXTURE_BUDGETS } from "../textures/textureBudget";

const PBR_SRC = readFileSync(
  fileURLToPath(new URL("../textures/pbrTextures.ts", import.meta.url)),
  "utf8",
);
const STATIC_WORLD_SRC = readFileSync(
  fileURLToPath(new URL("../components/StaticWorld.tsx", import.meta.url)),
  "utf8",
);

describe("groundAnisotropyFor — the tier asks, the device decides", () => {
  it("honours the request when the device can serve it", () => {
    expect(groundAnisotropyFor(16, 16)).toBe(16);
    expect(groundAnisotropyFor(8, 16)).toBe(8);
  });

  it("clamps DOWN to what the GPU reports, never up", () => {
    // A phone that reports 2 must get 2, not a silently ignored 16.
    expect(groundAnisotropyFor(16, 2)).toBe(2);
    expect(groundAnisotropyFor(16, 1)).toBe(1);
  });

  it("never returns below 1, whatever it is handed", () => {
    expect(groundAnisotropyFor(0, 16)).toBe(1);
    expect(groundAnisotropyFor(-4, 16)).toBe(1);
    expect(groundAnisotropyFor(Number.NaN, 16)).toBe(1);
    expect(groundAnisotropyFor(16, Number.NaN)).toBe(1);
    expect(groundAnisotropyFor(16, 0)).toBe(1);
  });

  it("has NO floor of its own — a tier that asks for 2 gets 2", () => {
    // The bug this replaces: `Math.max(4, anisotropy)` made every request
    // below 4 unreachable, so `low` and `med` bound the ground identically and
    // the low preset's own number was dead text.
    expect(groundAnisotropyFor(2, 16)).toBe(2);
    expect(groundAnisotropyFor(1, 16)).toBe(1);
  });

  it("has NO ceiling of its own — the bind reads the DEVICE cap, not an 8", () => {
    // Behavioural first: a request above the old hard ceiling must survive.
    expect(groundAnisotropyFor(16, 16)).toBeGreaterThan(8);
    // …and the one place that binds it must go through this function with the
    // GPU's own limit, so the ceiling can never quietly become a literal again.
    expect(PBR_SRC).toContain(
      "const a = groundAnisotropyFor(anisotropy, gl.capabilities.getMaxAnisotropy());",
    );
  });
});

describe("the ground gets its own anisotropy, and the cockpit is why", () => {
  it("every tier asks for 16 on the ground", () => {
    for (const level of ["low", "med", "high"] as const) {
      expect(QUALITY_PRESETS[level].groundAnisotropy).toBe(16);
    }
  });

  it("the ground number is never below the general one", () => {
    // Canvas textures and facades keep the old per-tier ladder; the ground is
    // the surface at 4-10 degrees, so it must never be filtered more coarsely
    // than a wall the camera looks at square-on.
    for (const level of ["low", "med", "high"] as const) {
      const p = QUALITY_PRESETS[level];
      expect(p.groundAnisotropy).toBeGreaterThanOrEqual(p.anisotropy);
    }
  });

  it("`low` is not the tier that gets starved of it", () => {
    // The counter-intuitive part, and the reason it is affordable: at `low` the
    // download budget is colorOnly, so each ground material has ONE map bound
    // instead of three or four. The tier with the least to filter can most
    // afford to filter it properly — and it is the tier the FPS complaint and
    // the "detail collapses" complaint are both about.
    expect(TEXTURE_BUDGETS.low.groundMaps).toBe("colorOnly");
    expect(QUALITY_PRESETS.low.groundAnisotropy).toBe(QUALITY_PRESETS.high.groundAnisotropy);
  });

  it("StaticWorld binds the GROUND number to the three PBR sets", () => {
    // A regression here is invisible on screen at a glance and undoes the whole
    // row, so it is asserted at the call site rather than trusted.
    for (const group of ['"road"', '"sidewalk"', '"ground"']) {
      expect(STATIC_WORLD_SRC).toContain(
        `usePbrSet(${group}, budget.groundMaps, preset.groundAnisotropy, gl)`,
      );
    }
    // …and the canvas-texture fallback keeps the general number, because those
    // are the 256-512 px procedural tiles, not the 1024 px photographs.
    expect(STATIC_WORLD_SRC).toContain("t.anisotropy = preset.anisotropy;");
  });

  it("costs no draw call and no byte — it is a sampler parameter", () => {
    // Stated as a test because the register's own constraint on this lane is
    // draw-call headroom (`low` measured 67 of a 70 soft cap across the 100
    // shipped districts, worst map hz-roadworks-v1). Anisotropy is set with
    // texParameterf on textures that are already resident; it cannot add a
    // submission, a triangle or a fetch.
    expect(PBR_SRC).not.toMatch(/anisotropy[\s\S]{0,200}?\bnew THREE\.(Mesh|InstancedMesh)/);
    expect(PBR_SRC).toContain("tex.anisotropy = a;");
  });
});
