/**
 * FR-OFC-ARMS + FR-OFC-CARD (sweep161, 2026-08-18) — THE РЕГУЛИРОВЧИК DRILL'S
 * TWO TEACHING SURFACES, MEASURED FROM THE SEAT INSTEAD OF ASSERTED.
 *
 * Three sweep161 findings land on `TrafficLayer.tsx` for the same lesson and
 * they are all the same shape: the thing the лекция asks the student to READ is
 * not resolvable at the range it asks him to read it.
 *
 *   A. „through the whole approach … he renders as a featureless olive capsule
 *      with a bare head on a dark post: at 300–400 % zoom on 04-t053s there are
 *      no arms visible at all, because in the side-profile pose the arms extend
 *      along the road axis and foreshorten to nothing … the code comment in
 *      TrafficLayer.tsx claims 'BUILD 1.30 is free of the arm-legibility
 *      question'; the frames say it is not."
 *   B. „the caption's bottom lines … run straight through the 'МЕНЮ' button at
 *      top-left, so the button label is illegible against the green world text."
 *   C. „only the headline word … resolves during the approach; the five body
 *      lines that carry the actual rule … blur to unreadable mush even at 600 %
 *      zoom … they only become readable once the car is nearly at the stop
 *      line — after the stop/go choice has been made."
 *
 * Every number below is either an exported constant of the renderer or is
 * derived from one, so none of it can drift from the shipped geometry — and
 * `PX_PER_RAD` is the one MEASUREMENT this file carries, read off the audited
 * frame itself (see its comment).
 *
 * Each block holds BOTH directions. The founder has been burned by a false
 * failure and a false pass equally, and a legibility gate is very easy to
 * "pass" by making the figure enormous or the caption a billboard the size of
 * the junction — so the arm block also pins the halt wall that must NOT fold
 * away, and the caption block also pins the range at which the card must still
 * be whole.
 */
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { SIGNAL_SETBACK_M } from "@/modules/sim/runtime/stoplines";
import {
  BUBBLE_GAP_M,
  BUBBLE_H_M,
  BUBBLE_LINE_PX,
  BUBBLE_MAX_SCALE,
  BUBBLE_REF_DIST_M,
  BUBBLE_TEX_H,
  BUBBLE_W_M,
  OFC_ARM_FWD_RAD,
  OFC_ARM_OUT_RAD,
  PED_ARM_REACH_M,
  PED_CONTROLLER_BUILD,
  PED_CONTROLLER_HEIGHT,
  PED_HEAD_Y,
  PED_POSE_ARM_RAISE_RAD,
  PED_SHOULDER_HALF,
  PED_TORSO_RADIUS_M,
  bubbleScale,
  bubbleWhollyVisible,
  officerArmTarget,
  type OfficerArmTarget,
} from "../TrafficLayer";

// --- the officer, at the pinned controller scale -----------------------------
/** Shoulder joint → fingertip on the JU-18 figure, m. */
const REACH_M = PED_ARM_REACH_M * PED_CONTROLLER_HEIGHT;
/** How much of himself he hides: a capsule torso is rotationally symmetric, so
 *  its radius IS the silhouette half-depth from any direction. */
const TORSO_HALF_M = PED_TORSO_RADIUS_M * PED_CONTROLLER_BUILD;
const SHOULDER_M = PED_SHOULDER_HALF * PED_CONTROLLER_BUILD;

/**
 * Arm-tip offset from the shoulder in the officer's own frame, for the joint
 * pair the renderer damps toward. Composition in the frame loop is
 * qYaw · qLat(about local Z) · qRoll(about local X) applied to an arm that
 * hangs down (0, −1, 0), which is this closed form:
 *   (cos sag · sin lat, −cos sag · cos lat, −sin sag)
 * Local −Z is the officer's chest direction, so `forward` is what a driver
 * standing on his LATERAL axis — i.e. the one seeing the „премини" profile —
 * gets to see of the arm at all.
 */
function armTip(t: OfficerArmTarget) {
  return {
    lateral: REACH_M * Math.cos(t.sag) * Math.sin(t.lat),
    down: REACH_M * Math.cos(t.sag) * Math.cos(t.lat),
    forward: REACH_M * Math.sin(t.sag),
  };
}

/** The both-arms-out halt wall, fingertip to fingertip, m. */
function haltWallSpanM(sagRad: number): number {
  return 2 * (SHOULDER_M + REACH_M * Math.cos(sagRad) * Math.sin(OFC_ARM_OUT_RAD));
}

describe("FR-OFC-ARMS — the regulировчик's posture has a silhouette from the seat", () => {
  it("the out-stretched arms clear his own torso in SIDE PROFILE, the posture the drill grades", () => {
    const left: OfficerArmTarget = { lat: 0, sag: 0 };
    const right: OfficerArmTarget = { lat: 0, sag: 0 };
    officerArmTarget(false, 0, left);
    officerArmTarget(false, 1, right);
    expect(OFC_ARM_FWD_RAD, "the premise of every line below").toBeGreaterThan(0);

    // The measurement the finding is about. Before the fix this was
    // REACH × sin(0) = 0.000 m against 0.202 m of torso — the arm was not
    // small, it was absent, which is why 300–400 % zoom on 04-t053s found
    // nothing to enlarge.
    expect(armTip(left).forward).toBeGreaterThan(TORSO_HALF_M);
    expect(armTip(right).forward).toBeGreaterThan(TORSO_HALF_M);

    // And by a margin worth pixels, not a hair over the outline: 0.381 m of
    // reach spent forward, ~0.18 m of it beyond the body.
    expect(armTip(left).forward - TORSO_HALF_M).toBeGreaterThan(0.12);
  });

  it("both arms lean the SAME way and to OPPOSITE sides — one clear bar in profile, not a cancelled pair", () => {
    const left: OfficerArmTarget = { lat: 0, sag: 0 };
    const right: OfficerArmTarget = { lat: 0, sag: 0 };
    officerArmTarget(false, 0, left);
    officerArmTarget(false, 1, right);

    expect(left.sag).toBe(right.sag);
    expect(left.lat).toBeCloseTo(OFC_ARM_OUT_RAD, 12);
    expect(right.lat).toBeCloseTo(-OFC_ARM_OUT_RAD, 12);
    // Left tip goes one way along his lateral axis, right tip the other; both
    // tips go forward. A `sign * OFC_ARM_FWD_RAD` "fix" would make him a
    // swimmer and would not be the ППЗДвП posture at all.
    expect(armTip(left).lateral).toBeGreaterThan(0);
    expect(armTip(right).lateral).toBeLessThan(0);
    expect(armTip(left).forward).toBeCloseTo(armTip(right).forward, 12);
  });

  it("…and does not buy that by folding away the chest-on HALT WALL (the other direction)", () => {
    const t: OfficerArmTarget = { lat: 0, sag: 0 };
    officerArmTarget(false, 0, t);

    // 2.325 m flat → 2.156 m tilted. The wall is the „стоп" read and it is a
    // photographed silhouette (B41); a tilt chosen for profile legibility
    // alone — 45°, say — would cost 23 % of it and trade one unreadable
    // posture for another.
    const kept = haltWallSpanM(t.sag) / haltWallSpanM(0);
    expect(kept).toBeGreaterThan(0.92);
    expect(haltWallSpanM(t.sag)).toBeGreaterThan(2.1);
  });

  it("leaves the «внимание» window exactly as it was: right arm up, left down, neither out", () => {
    const left: OfficerArmTarget = { lat: 0, sag: 0 };
    const right: OfficerArmTarget = { lat: 0, sag: 0 };
    officerArmTarget(true, 0, left);
    officerArmTarget(true, 1, right);

    expect(left.lat).toBe(0);
    expect(right.lat).toBe(0);
    // The raise is a different gesture with its own legibility (a vertical arm
    // is never edge-on to a driver on the road plane), so the forward tilt must
    // not leak into it: these two are the pre-fix values, unchanged.
    expect(left.sag).toBe(0);
    expect(right.sag).toBe(PED_POSE_ARM_RAISE_RAD);
  });
});

// --- the caption -------------------------------------------------------------
/** Driver eye height in the cockpit, m — the value the BUBBLE_H_M note's own
 *  clip measurement was taken at. */
const EYE_Y = 1.2;
/** The officer's head, m. */
const HEAD_Y = PED_HEAD_Y * PED_CONTROLLER_HEIGHT;
/** Top edge of the card above the tarmac at scale `s`, m. */
const cardTopM = (s: number) => HEAD_Y + BUBBLE_GAP_M + BUBBLE_H_M * s;

/**
 * MEASURED, once, and the only unexported number in this file: on
 * `sweep161/sc-signal-controller/mobile-right/04-t053s.png` (2556 × 1179 device
 * px) the card spans ≈ 383 px. It was rendered under the OLD reference distance
 * of 16 m, i.e. at an apparent width of 3.6/16 = 0.225 rad, which fixes that
 * frame's scale at 383/0.225 ≈ 1702 px per radian.
 */
const PX_PER_RAD = 1702;
/** Cyrillic cap height as a fraction of the em, for the card's sans stack. */
const CAP_RATIO = 0.72;

/** Cap height in device px of a card line, at any distance inside the band. */
function bodyCapPx(fontPx: number, eyeD: number): number {
  const apparentCardH = (BUBBLE_H_M * bubbleScale(eyeD)) / eyeD; // rad
  return PX_PER_RAD * apparentCardH * (fontPx / BUBBLE_TEX_H) * CAP_RATIO;
}

/** The audited phone frame, and the vertical half-FOV it actually has.
 *
 *  Derived, not guessed: the note on BUBBLE_H_M records that the OLD card
 *  (scale 1) began to clip the top of the windscreen at ≈ 10.9 m with the eye
 *  at 1.20 m on a 1264 × 620 canvas. That single observation pins the vertical
 *  half-FOV of that canvas, and hFOV-locked resizing carries it to any other
 *  aspect. */
const CLIP_REF_D_M = 10.9;
const CLIP_REF_ASPECT = 1264 / 620;
const PHONE_ASPECT = 2556 / 1179;
const V_HALF_REF = Math.atan((cardTopM(1) - EYE_Y) / CLIP_REF_D_M);
const H_HALF = Math.atan(Math.tan(V_HALF_REF) * CLIP_REF_ASPECT);
const phoneCamera = () => {
  const vHalf = Math.atan(Math.tan(H_HALF) / PHONE_ASPECT);
  const cam = new PerspectiveCamera((vHalf * 360) / Math.PI, PHONE_ASPECT, 0.1, 500);
  cam.position.set(0, EYE_Y, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
};

/** Is the card whole, with the officer `d` m ahead and `lateralM` to the side? */
function cardWhole(d: number, lateralM = 0, wasVisible = false): boolean {
  const cam = phoneCamera();
  const s = bubbleScale(d);
  const tmp = new Vector3();
  // The renderer's own placement: centred over the head, half a card above it.
  return bubbleWhollyVisible(
    cam,
    lateralM,
    HEAD_Y + BUBBLE_GAP_M + (BUBBLE_H_M * s) / 2,
    -d, // three-space: the camera looks down −Z
    (BUBBLE_W_M * s) / 2,
    (BUBBLE_H_M * s) / 2,
    wasVisible,
    tmp,
  );
}

describe("FR-OFC-CARD — the caption is readable where the decision is made, and whole wherever it is drawn", () => {
  it("holds ONE apparent size from the reference distance out to the cap", () => {
    const ref = BUBBLE_W_M / BUBBLE_REF_DIST_M;
    for (const d of [BUBBLE_REF_DIST_M, 15, 20, 27, 40, BUBBLE_REF_DIST_M * BUBBLE_MAX_SCALE]) {
      expect((BUBBLE_W_M * bubbleScale(d)) / d, `${d} m`).toBeCloseTo(ref, 9);
    }
  });

  it("and that size resolves the five BODY lines, not only the headline (the finding)", () => {
    // At 27 m — the range `sc-sig-controller-postures` grades the read from,
    // and inside the t017…t058 window the auditor watched — the body lines
    // measured ≈ 12 px of cap height under the old 16 m reference and read as
    // "mush"; the headline measured ≈ 30 px and read crisp.
    const D = 27;
    const smallestBody = Math.min(
      BUBBLE_LINE_PX.pose,
      BUBBLE_LINE_PX.go,
      BUBBLE_LINE_PX.stop,
      BUBBLE_LINE_PX.priority,
      BUBBLE_LINE_PX.law,
    );
    expect(bodyCapPx(smallestBody, D)).toBeGreaterThan(14);
    expect(bodyCapPx(BUBBLE_LINE_PX.go, D)).toBeGreaterThan(16);
    // The headline was never the problem and must not have been shrunk to buy
    // the body lines.
    expect(bodyCapPx(BUBBLE_LINE_PX.headline, D)).toBeGreaterThan(
      bodyCapPx(BUBBLE_LINE_PX.go, D) * 2,
    );
  });

  it("is WHOLE across the approach the drill grades, including at the stop line", () => {
    // If this ever fails the fix has become a false negative: the student is
    // waiting at the line with the officer in front of him and no caption.
    expect(SIGNAL_SETBACK_M).toBeGreaterThan(12); // the premise of the row below
    for (const d of [SIGNAL_SETBACK_M, 20, 27, 40, 54]) {
      expect(cardWhole(d), `${d} m dead ahead`).toBe(true);
    }
    // …and off to the side, where a junction actually puts him.
    expect(cardWhole(20, -6)).toBe(true);
  });

  it("is HIDDEN once it can no longer be read whole — the half-card is what landed on «МЕНЮ»", () => {
    // 04-t076s: the car is level with the officer, the card's top is off the
    // frame and its surviving bottom lines are printing over the menu button.
    expect(cardWhole(8)).toBe(false);
    expect(cardWhole(5)).toBe(false);
    // Far off to one side is the same defect on the other axis.
    expect(cardWhole(14, -12)).toBe(false);
    // Behind the driver is not a caption at all.
    expect(cardWhole(-20)).toBe(false);
  });

  it("does not blink: the hysteresis holds a card that is marginally out", () => {
    // Find a distance the ENTER threshold rejects, then show that a card
    // already on screen survives it.
    let marginal = -1;
    for (let d = 20; d > 6; d -= 0.05) {
      if (!cardWhole(d, 0, false) && cardWhole(d, 0, true)) {
        marginal = d;
        break;
      }
    }
    expect(marginal, "a band exists where ENTER and EXIT disagree").toBeGreaterThan(0);
  });
});
