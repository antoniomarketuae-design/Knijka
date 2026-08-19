/**
 * THE COCKPIT MIRROR'S LOWER EDGE — B74, applied to the POV students drive in.
 *
 * WHAT THE FRAMES SHOW (sweep161, and this is the whole reason the file exists).
 * On every mobile cockpit frame the physical GLB interior mirror hangs in the
 * top of the picture with its top edge cut by the canvas, and a DOM card is
 * printed straight across its glass:
 *
 *   sc-ov-oneway/mobile-right/04-t101s.png    — `[data-hud="touch-hint"]`
 *   sc-jx-equal-left/mobile-wrong/07-end.png  — the session-end banner
 *   sc-park-bay-exit-rev/mobile-right/03-ready.png — and that lesson is TAUGHT
 *       as „Двете огледала, после поглед през ДЯСНОТО рамо и през задното
 *       стъкло", so the covered instrument is the instrument being graded.
 *
 * CameraRig published `--sim-mirror-h` only for the CHASE quad; the cockpit
 * branch published 0, which tells the shell there is no mirror at all. These
 * assertions hold the number the cockpit branch now publishes.
 *
 * WHY 0 IS NOT A SAFE DEFAULT. It reads as "no mirror on screen", so the rail
 * stays at the top — the reassuring answer, and the wrong one. Every case that
 * returns 0 below is a case where the glass really is not on the canvas.
 */

import { describe, expect, it } from "vitest";

import { cockpitMirrorBottomFraction, idleMirrorEdgePx } from "../CameraRig";
import { COCKPIT_HFOV_RAD, cockpitVFovForAspect } from "@/modules/sim/vehicle";
import { hotspotScreenRect } from "@/modules/sim/scene/vitok/cabinLook";

/**
 * The founder's handset, landscape: 2556×1179 device px at dpr 3 → 852×393 CSS.
 * This is the aspect every mobile frame in the catalogue was shot at.
 */
const HIS_ASPECT = 2556 / 1179;
/** The authored cockpit fov at that aspect — the camera's value at rest. */
const HIS_FOV = cockpitVFovForAspect(HIS_ASPECT);
/** PC landscape, the second platform the sweep drove (1440×900 → 1.6:1). */
const PC_ASPECT = 1440 / 900;
const PC_FOV = cockpitVFovForAspect(PC_ASPECT);

/** FOV_WIDEN_COCKPIT is 5° at ~130 km/h; the rig adds it to the base fov. */
const SPEED_WIDEN_DEG = 5;

describe("cockpitMirrorBottomFraction — the edge the DOM rail steps below", () => {
  it("reports a real edge on the founder's handset, where the frames show one", () => {
    const bottom = cockpitMirrorBottomFraction("forward", HIS_FOV);
    // The bug was publishing 0 here: "no mirror on this screen" while the frame
    // shows one with a coach card across it.
    expect(bottom).toBeGreaterThan(0);
    // …and it is in the TOP of the picture, which is why a top rail collides
    // with it at all. A value in the lower half would mean the rail must NOT
    // step down, and publishing it would push the HUD off the screen.
    expect(bottom).toBeLessThan(0.5);
  });

  it("reports one on PC too — the collision is not a mobile-only artefact", () => {
    const bottom = cockpitMirrorBottomFraction("forward", PC_FOV);
    expect(bottom).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(0.5);
  });

  it("puts the edge LOWER on the wider window, which is why mobile is the bad case", () => {
    // Holding hFOV constant (cockpitVFovForAspect) shrinks the vertical angle as
    // the window widens, so on the 2.17:1 handset the mirror is pushed toward
    // the top edge — it is CLIPPED there in 04-t101s.png — while the 1.6:1 PC
    // window still contains it. The lower edge therefore sits HIGHER (a smaller
    // fraction) on mobile than on PC.
    expect(cockpitMirrorBottomFraction("forward", HIS_FOV)).toBeLessThan(
      cockpitMirrorBottomFraction("forward", PC_FOV),
    );
  });

  it("the speed-widen moves the edge DOWN, and the inversion is what sees it", () => {
    // MUTATION THAT MATTERS: if the fov inversion were dropped and the raw
    // `cam.aspect` were passed through, this pair would be identical and the
    // published edge would be the at-rest one at every speed — too high, i.e.
    // the rail stops short and the glass stays covered exactly when the student
    // is moving fastest. The two must differ, and in this direction.
    const atRest = cockpitMirrorBottomFraction("forward", HIS_FOV);
    const atSpeed = cockpitMirrorBottomFraction("forward", HIS_FOV + SPEED_WIDEN_DEG);
    expect(atSpeed).toBeGreaterThan(atRest);
    // And it is not a rounding difference: on a 393 CSS-px window this is worth
    // real pixels, which is the whole reason the raw aspect is not good enough.
    expect((atSpeed - atRest) * 393).toBeGreaterThan(4);
  });

  it("inverts the authored formula exactly — the equivalent aspect is not a fudge", () => {
    // The inversion claims: cockpitVFovForAspect(tan(H/2)/tan(fov/2)) === fov.
    // If that identity fails the projection is being asked the wrong question,
    // and every number above is a coincidence.
    for (const aspect of [1.33, 1.6, 16 / 9, 2.0, HIS_ASPECT, 2.5]) {
      const fov = cockpitVFovForAspect(aspect);
      const equivalent = Math.tan(COCKPIT_HFOV_RAD / 2) / Math.tan((fov * Math.PI) / 360);
      expect(cockpitVFovForAspect(equivalent)).toBeCloseTo(fov, 6);
    }
  });

  it("agrees with hotspotScreenRect at rest — it publishes the glass, not a guess", () => {
    // The equivalent aspect at the AUTHORED fov is the authored aspect, so the
    // helper must return exactly what the cockpit projection already says about
    // that hotspot. A drift here means the helper invented its own geometry.
    const rect = hotspotScreenRect("hotspot_mirror_rear", "forward", HIS_ASPECT);
    expect(rect).not.toBeNull();
    expect(cockpitMirrorBottomFraction("forward", HIS_FOV)).toBeCloseTo(rect!.bottom, 9);
  });

  it("returns 0 when the glass is genuinely off the canvas — never a lie either way", () => {
    // A FALSE REFUSAL IS AS BAD AS A FALSE CERTIFICATE, so 0 has to mean
    // something. A pinhole fov drives the mirror far above the frame; there is
    // then no edge for a rail to step below and the property must be REMOVED
    // rather than set to a number the shell would honour.
    expect(cockpitMirrorBottomFraction("forward", 1)).toBe(0);
    // Nonsense inputs are answered, not thrown: this runs inside useFrame.
    expect(cockpitMirrorBottomFraction("forward", 0)).toBe(0);
    expect(cockpitMirrorBottomFraction("forward", Number.NaN)).toBe(0);
    expect(cockpitMirrorBottomFraction("forward", -47)).toBe(0);
  });

  it("follows the head: looking down at the belt takes the mirror off screen", () => {
    // The published edge is pose-dependent because the mirror leaves the frame
    // when the student looks away from it. Publishing the forward-pose number
    // during a belt check would step the rail down for a mirror nobody can see.
    const forward = cockpitMirrorBottomFraction("forward", HIS_FOV);
    const belt = cockpitMirrorBottomFraction("belt", HIS_FOV);
    expect(forward).toBeGreaterThan(0);
    expect(belt).toBe(0);
  });
});

describe("idleMirrorEdgePx — the case analysis the cockpit branch was missing", () => {
  /** 393 CSS px of play area: 1179 device px at dpr 3, his landscape window. */
  const HIS_HEIGHT_PX = 393;

  it("publishes a real height in the cockpit — the case that was absent", () => {
    // THIS IS THE FIX. The branch used to hand `publishRearView` a literal 0
    // for every non-chase frame, which removes `--sim-mirror-h` and leaves the
    // rail at the top of the play area, on the glass. Restoring the 0 here is
    // the mutation that reproduces every frame in this file's header.
    const px = idleMirrorEdgePx("cockpit", "forward", HIS_FOV, HIS_HEIGHT_PX);
    expect(px).toBeGreaterThan(0);
    // ~65 px, which is the value MirrorRig's own note records for the CHASE
    // window photographed on the same handset — the two mirrors sit at
    // comparable heights, so a wildly different number would mean the units or
    // the projection are wrong rather than the mirror being somewhere else.
    expect(px).toBeGreaterThan(40);
    expect(px).toBeLessThan(120);
  });

  it("still says «no mirror» for top-down, where there is genuinely no cabin", () => {
    // The other half of the pair: a rig that answered every mode with a height
    // would push the HUD down over a top-down view that has no mirror in it.
    expect(idleMirrorEdgePx("topdown", "forward", HIS_FOV, HIS_HEIGHT_PX)).toBe(0);
  });

  it("says «no mirror» for chase, whose own branch owns that number", () => {
    // Chase never reaches this call, but if it ever did, two writers publishing
    // two different edges for one custom property is a race, not a fallback.
    expect(idleMirrorEdgePx("chase", "forward", HIS_FOV, HIS_HEIGHT_PX)).toBe(0);
  });

  it("scales with the window and survives a degenerate one", () => {
    const small = idleMirrorEdgePx("cockpit", "forward", HIS_FOV, HIS_HEIGHT_PX);
    const large = idleMirrorEdgePx("cockpit", "forward", HIS_FOV, HIS_HEIGHT_PX * 2);
    expect(large).toBeCloseTo(small * 2, 9);
    // A zero-height canvas happens on the first frame after a mode switch; it
    // must produce "no mirror", not NaN — `publishRearView` rounds, and
    // `Math.round(NaN)` reaches the DOM as the string "NaNpx".
    expect(idleMirrorEdgePx("cockpit", "forward", HIS_FOV, 0)).toBe(0);
    expect(idleMirrorEdgePx("cockpit", "forward", HIS_FOV, Number.NaN)).toBe(0);
  });
});
