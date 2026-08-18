/**
 * THE GHOST THAT WAS DRAWN ON TOP OF THE STUDENT — catalogue sweep 161.
 *
 * Eight defects were routed to `ShadowCar.tsx`. Six of them are two causes,
 * and this file is the guard for both, stated as the frames stated them:
 *
 *   THE GHOST OCCUPIES THE VIEWER.
 *     sc-park-van/mobile-right/05-stopped.png (critical) — the ghost's bonnet,
 *     screen and A-pillars over the dashboard; the cluster is read through a
 *     second car's body. Same in sc-follow-distance/mobile-right/04-t077s.png,
 *     sc-mw-emergency-lane/mobile-right/04-t209s.png, and — one car-length out,
 *     over the stop line — sc-jx-blocked-exit/mobile-right/06-waited.png.
 *     Nothing in the file had ever asked where the camera was.
 *
 *   THE MARKER HAS NO OWNER.
 *     sc-pe-zone-living/pc-wrong/04-t017s.png — the 👀 quad reading as cartoon
 *     eyes pasted on an apartment block, 0.53 m of empty air under it and 38 %
 *     of the car's width across.
 *
 * A third pair (sc-signal-flashing, sc-rb-exit-signal, sc-zebra-approach) says
 * the ghost is indistinguishable from the solid traffic beside it and that the
 * legend which would say otherwise is desktop-only; the footprint halo is this
 * file's half of that answer, and the last section guards its shape.
 *
 * WHAT THIS FILE CANNOT PROVE, said plainly so nobody reads more into it.
 * `ShadowCar` is a react-three-fiber component: a GLB, a `useFrame`, a WebGL
 * context. There is no renderer here, so nothing below observes a pixel. What
 * it does observe is the exported law — `ghostProximityFade`, `applyGhostFade`
 * and the placement constants — and the component's JSX is written to consume
 * those exact exports, so moving one moves the render with it. The seam that
 * stays unguarded is the WIRING (that `useFrame` calls the fade at all); it is
 * one statement, and the sweep's next pass is what re-photographs it.
 *
 * Every assertion below is written to FAIL on the numbers the sweep
 * photographed, and each block also guards the opposite direction, because a
 * ghost nobody can see is the same defect as a ghost nobody can see past.
 */
import { describe, expect, it } from "vitest";
import { CHASSIS_HALF_EXTENTS } from "@/modules/sim/vehicle";
import {
  applyGhostFade,
  GHOST_FADE_FULL_M,
  GHOST_FADE_HIDE_M,
  GHOST_ROOF_Y,
  GHOST_WIDTH_M,
  GLANCE_ANCHOR_MAX_GAP_M,
  GLANCE_ICON_SCALE,
  GLANCE_ICON_Y,
  ghostProximityFade,
  glanceIconGapM,
  HALO_MARGIN_MAX_M,
  HALO_RX,
  HALO_RZ,
  type GhostFadeTarget,
} from "../ShadowCar";

/** The shell opacity the module renders at full strength (doc 76 §5). Kept as
 *  a literal because it is what the FRAMES were taken at — if the module's
 *  constant ever moves, the arithmetic quoted in this file is stale and the
 *  divergence is the thing worth failing on. */
const PHOTOGRAPHED_GHOST_OPACITY = 0.45;

/**
 * The quantity the eye actually receives. The shell has `depthWrite = false`
 * and renders both faces, so a ghost seen from behind at contact range stacks
 * roughly six surfaces — rear bumper, rear glass, interior, roof, screen,
 * bonnet — and standard `over` compositing gives 1 − (1 − a)^n. At a = 0.45,
 * n = 6 that is 0.972: "translucent" arrives as solid, which is exactly what
 * sc-zebra-approach and sc-jx-blocked-exit reported as an opaque car.
 */
function compositeAlpha(perSurface: number, surfaces: number): number {
  return 1 - Math.pow(1 - perSurface, surfaces);
}
const CONTACT_SURFACES = 6;

describe("the cockpit frames — the ghost may not be drawn on the viewer", () => {
  it("is gone at every distance the four occlusion frames were shot at", () => {
    // sc-park-van / sc-follow-distance / sc-mw-emergency-lane all photograph
    // the camera INSIDE the shell; sc-jx-blocked-exit is the near edge of it.
    for (const d of [0, 0.5, 1, 1.5, 2, 2.4]) {
      expect(ghostProximityFade(d), `${d} m`).toBe(0);
      expect(PHOTOGRAPHED_GHOST_OPACITY * ghostProximityFade(d), `${d} m`).toBe(0);
    }
    // …and the perceived stack goes with it, which is the claim the frames
    // actually make: 0.97 of solid blue over the instrument cluster → nothing.
    expect(compositeAlpha(PHOTOGRAPHED_GHOST_OPACITY, CONTACT_SURFACES)).toBeGreaterThan(0.95);
    expect(
      compositeAlpha(PHOTOGRAPHED_GHOST_OPACITY * ghostProximityFade(1), CONTACT_SURFACES),
    ).toBe(0);
  });

  it("no distance at all (NaN) hides the ghost rather than leaving it lit", () => {
    // A missing camera must fail toward the empty screen, never toward a car
    // body over the dashboard.
    expect(ghostProximityFade(Number.NaN)).toBe(0);
    expect(ghostProximityFade(-1)).toBe(0);
  });

  it("the stop line reads THROUGH the ghost at sc-jx-blocked-exit range", () => {
    // The ghost's rear sat at the ego's bonnet in that frame — ~4.5 m between
    // origins. It must dim enough for the stop line and the light behind it to
    // survive, without vanishing: the lesson is about that junction, and the
    // ghost is how it is taught.
    const shell = PHOTOGRAPHED_GHOST_OPACITY * ghostProximityFade(4.5);
    expect(shell).toBeLessThan(0.2);
    expect(shell).toBeGreaterThan(0.05);
    // Perceived, over the same six surfaces: from "solid" to "a tinted pane".
    expect(compositeAlpha(shell, CONTACT_SURFACES)).toBeLessThan(0.75);
  });
});

describe("the other direction — a ghost nobody can see teaches nothing", () => {
  it("is at FULL strength wherever a lesson needs it seen", () => {
    // sc-zebra-approach photographs the ghost on the crossing ~15 m out; that
    // frame's complaint is the missing legend, NOT the ghost's presence, and a
    // fade that reached it would have deleted the demonstration.
    for (const d of [GHOST_FADE_FULL_M, 10, 15, 40, 250]) {
      expect(ghostProximityFade(d), `${d} m`).toBe(1);
    }
    expect(PHOTOGRAPHED_GHOST_OPACITY * ghostProximityFade(15)).toBeCloseTo(0.45, 10);
  });

  it("never brightens as it closes, and never leaves [0, 1]", () => {
    let prev = -1;
    for (let d = 0; d <= 20; d += 0.05) {
      const f = ghostProximityFade(d);
      expect(f, `${d.toFixed(2)} m`).toBeGreaterThanOrEqual(0);
      expect(f, `${d.toFixed(2)} m`).toBeLessThanOrEqual(1);
      expect(f, `${d.toFixed(2)} m`).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("the hide radius is the shell, not a taste — and it is inside the ramp", () => {
    // 2.02 m is CHASSIS_HALF_EXTENTS.z, the half-length of the car the ghost
    // is a copy of. A hide radius under it would leave the camera inside a
    // body that is still being drawn.
    expect(GHOST_FADE_HIDE_M).toBeGreaterThanOrEqual(CHASSIS_HALF_EXTENTS.z);
    expect(GHOST_FADE_HIDE_M).toBeLessThan(GHOST_FADE_FULL_M);
    // Two car lengths is the far edge; anything much beyond it starts eating
    // ordinary following distances.
    expect(GHOST_FADE_FULL_M).toBeLessThanOrEqual(CHASSIS_HALF_EXTENTS.z * 2 * 2.5);
  });
});

describe("applyGhostFade — the fade has to reach the surfaces", () => {
  function targets(): GhostFadeTarget[] {
    return [
      { material: { opacity: 1 }, baseOpacity: 0.45 }, // shell
      { material: { opacity: 1 }, baseOpacity: 0.95 }, // a lamp quad
      { material: { opacity: 1 }, baseOpacity: 0.5 }, // the halo
    ];
  }

  it("scales each surface from ITS OWN base, not from one shared number", () => {
    // The lamp quads and the halo do not render at the shell's opacity; a fade
    // that forgot that would brighten the lamps as the ghost faded.
    const t = targets();
    applyGhostFade(t, 0.5);
    expect(t.map((x) => x.material.opacity)).toEqual([0.225, 0.475, 0.25]);
  });

  it("fade 0 takes every surface to zero", () => {
    const t = targets();
    applyGhostFade(t, 0);
    for (const x of t) expect(x.material.opacity).toBe(0);
  });

  it("fade 1 restores every base exactly — a ghost that recedes comes back", () => {
    // The frames all show the ghost passing THROUGH the student and out the
    // far side (playback loops). If the restore were lossy the demonstration
    // would dim a little on every lap.
    const t = targets();
    applyGhostFade(t, 0);
    applyGhostFade(t, 1);
    expect(t.map((x) => x.material.opacity)).toEqual([0.45, 0.95, 0.5]);
  });

  it("an empty target list is a no-op, not a throw", () => {
    expect(() => applyGhostFade([], 0.5)).not.toThrow();
  });
});

describe("the glance marker sits ON the roof (sc-pe-zone-living/pc-wrong)", () => {
  it("the photographed marker fails the anchor rule — that is the defect", () => {
    // The numbers off the frame: quad centre 2.15 m, quad 0.85 m tall, ghost
    // roofline 1.19 m. 0.53 m of air, and the eye gave the marker to the
    // building instead of the car.
    const photographed = glanceIconGapM(2.15, 0.85);
    expect(photographed).toBeCloseTo(0.535, 3);
    expect(photographed).toBeGreaterThan(GLANCE_ANCHOR_MAX_GAP_M);
  });

  it("…and the shipped marker passes it, without sinking into the roof", () => {
    const gap = glanceIconGapM(GLANCE_ICON_Y, GLANCE_ICON_SCALE);
    expect(gap).toBeLessThanOrEqual(GLANCE_ANCHOR_MAX_GAP_M);
    // The opposite failure, and it is a real one: a marker dropped below the
    // roofline is buried in a shell that writes no depth — visible, but
    // smeared through the car instead of standing on it.
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  it("is icon-sized against the car it belongs to, not car-sized", () => {
    // Photographed: 0.85 m on a 1.70 m car = 50 % of its width (the glyph
    // inside it measured 0.64 m, 38 %). At that size it competes with the car
    // for the role of "the object", which is how it ended up owning a facade.
    expect(GHOST_WIDTH_M).toBeCloseTo(1.7, 10);
    expect(0.85 / GHOST_WIDTH_M).toBeGreaterThan(0.3);
    expect(GLANCE_ICON_SCALE / GHOST_WIDTH_M).toBeLessThanOrEqual(0.3);
    // …and not so small it stops being a legible mirror-check cue on a phone.
    expect(GLANCE_ICON_SCALE / GHOST_WIDTH_M).toBeGreaterThan(0.15);
  });

  it("the roofline is the measured one, so the rule is anchored to the car", () => {
    // 1.19 m, read off an 8× crop of the frame with the ghost's own 1.70 m
    // width as the scale bar (680 crop px → 400 crop px/m; roof-to-tyre 475
    // px). If this ever becomes a guess, every gap above becomes a guess.
    expect(GHOST_ROOF_Y).toBeGreaterThan(CHASSIS_HALF_EXTENTS.y * 2);
    expect(GHOST_ROOF_Y).toBeLessThan(GHOST_WIDTH_M);
  });
});

describe("the footprint halo traces the car, not the road", () => {
  it("encloses the whole chassis box", () => {
    // A halo inside the footprint would be a stripe under the car; the point
    // is an outline the eye can attach to THIS vehicle at a glance.
    expect(HALO_RX).toBeGreaterThanOrEqual(CHASSIS_HALF_EXTENTS.x);
    expect(HALO_RZ).toBeGreaterThanOrEqual(CHASSIS_HALF_EXTENTS.z);
  });

  it("hugs it — the obvious circular ring is what this rejects", () => {
    expect(HALO_RX - CHASSIS_HALF_EXTENTS.x).toBeLessThanOrEqual(HALO_MARGIN_MAX_M);
    expect(HALO_RZ - CHASSIS_HALF_EXTENTS.z).toBeLessThanOrEqual(HALO_MARGIN_MAX_M);
    // The naive fix is one radius for both axes, sized to clear the 4.04 m
    // length. It is 4.9 m across a 1.70 m car and reads as a lit patch of
    // asphalt rather than as this car's footprint — so it fails here.
    const circular = HALO_RZ;
    expect(circular - CHASSIS_HALF_EXTENTS.x).toBeGreaterThan(HALO_MARGIN_MAX_M);
  });

  it("is elongated the way the car is", () => {
    expect(HALO_RX).toBeLessThan(HALO_RZ);
    // Same aspect as the chassis box, within a quarter — an outline that
    // disagrees with the silhouette above it reads as a separate object.
    const chassisAspect = CHASSIS_HALF_EXTENTS.z / CHASSIS_HALF_EXTENTS.x;
    const haloAspect = HALO_RZ / HALO_RX;
    expect(Math.abs(haloAspect / chassisAspect - 1)).toBeLessThan(0.25);
  });
});
