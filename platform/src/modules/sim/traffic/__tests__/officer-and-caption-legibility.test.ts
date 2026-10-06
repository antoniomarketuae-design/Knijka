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

import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario/templates";
import { SIGNAL_SETBACK_M } from "@/modules/sim/runtime/stoplines";
import {
  COCKPIT_EYE,
  COCKPIT_FOV_MAX,
  COCKPIT_PITCH_BASE,
  cockpitVFovForAspect,
} from "@/modules/sim/vehicle/tuning";
import {
  BUBBLE_GAP_M,
  BUBBLE_H_M,
  BUBBLE_LINE_PX,
  BUBBLE_MAX_SCALE,
  BUBBLE_POSTURE_LINE_PX,
  BUBBLE_REF_DIST_M,
  BUBBLE_TEX_H,
  BUBBLE_TEX_W,
  BUBBLE_W_M,
  OFC_ARM_FWD_RAD,
  OFC_ARM_OUT_RAD,
  PED_ARM_REACH_M,
  PED_CONTROLLER_BUILD,
  PED_CONTROLLER_HEIGHT,
  PED_HEAD_Y,
  PED_OFFICER_HEIGHT,
  PED_POSE_ARM_RAISE_RAD,
  PED_SHOULDER_HALF,
  PED_TORSO_RADIUS_M,
  bubbleScale,
  bubbleWhollyVisible,
  officerArmTarget,
  type OfficerArmTarget,
} from "../TrafficLayer";
import { AUDITED_PHONE, PC_LENSES, focalCssPx, lineCapCssPx } from "./captionLens";

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
    // The L1 card is the SHORT card since the founder's 2026-09-22 ruling:
    // name, one answer line, law. Its body is the answer and the law.
    const smallestBody = Math.min(BUBBLE_LINE_PX.answer, BUBBLE_LINE_PX.law);
    // THE FLOORS MOVED UP WITH THE CARD (sc-sig-controller-postures:ef0e821c).
    // 14 and 16 were what the 1024 px card could reach, and the row filed
    // against that card says plainly what those numbers buy: ≈4.7 and ≈5.3 CSS
    // px of cap on a 3× phone, i.e. „tiny … unreadable at native phone size".
    // Widening the ink box (`BUBBLE_W_M` 3.6 → 4.95 m) lifted the authored
    // sizes to 18.75 and 21.0 device px, and the floors follow so the gain
    // cannot be given back by a later edit to `BUBBLE_LINE_PX` alone.
    expect(bodyCapPx(smallestBody, D)).toBeGreaterThan(18);
    // The answer line carries the rule now, and it is bigger than the 56 px
    // body line whose ≈21 px floor this used to hold.
    expect(bodyCapPx(BUBBLE_LINE_PX.answer, D)).toBeGreaterThan(24);
    // The header was never the problem and must not have been shrunk to buy
    // the answer line.
    //
    // THIS READ `name > answer × 1.5`, AND THE RATIO WAS THE WRONG WAY TO SAY
    // IT (founder ruling 2026-10-04 «Enlarge answer line»). 1.5 was simply
    // what 112 / 68 left room for; it goes red the day the answer is RAISED to
    // the ruled size, although the header has not lost a pixel — a guard on
    // the header that fails when a different line grows is guarding nothing
    // about the header. The claim is stated directly now: the header is the
    // size the reviewed card painted it at (41.99 device px on this file's
    // scale), and it is still the biggest line on the card.
    expect(bodyCapPx(BUBBLE_LINE_PX.name, D)).toBeGreaterThan(41.9);
    expect(bodyCapPx(BUBBLE_LINE_PX.name, D)).toBeGreaterThan(
      bodyCapPx(BUBBLE_LINE_PX.answer, D),
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

// ---------------------------------------------------------------------------
// FOUNDER RULING 2026-10-04 «ENLARGE ANSWER LINE» — sc-sig-controller-postures:
// ef0e821c, the part of the row the 2026-09-22 short card left open.
//
// The short card made the L1 caption three lines; it did not make the line
// that carries the rule big enough to read where it is read. The card holds
// ONE apparent size from BUBBLE_REF_DIST_M out to the cap (11.5 → 54.6 m), and
// at that size «Спираш ТИ, напречното минава» stood ≈ 8 CSS px on the audited
// 852 × 393 DPR-3 phone, the citation ≈ 6. The founder accepted the citation
// (2026-09-27) and ruled on the answer:
//
//   · the ANSWER LINE reaches about 11 CSS px on the approach;
//   · ONLY the answer line grows — the citation stays the size he accepted;
//   · the card may leave the windscreen about 0.5–1 m earlier at the stop;
//   · it is still three lines in one accent plus neutral ink.
//
// Everything below is measured through `captionLens.ts` — the product's own
// horizontal field of view, checked there against the two w61 frames the row
// was judged on — and the reviewed card's numbers are LITERALS on purpose: a
// floor written as `BUBBLE_LINE_PX.law` would follow the constant wherever a
// later edit took it.
// ---------------------------------------------------------------------------

/** The size the founder ruled, CSS px of cap height on the audited phone. */
const RULED_ANSWER_CSS_PX = 11;
/** How much earlier the card may leave the windscreen, m (the ruling's upper
 *  figure). */
const RULED_EARLIER_EXIT_M = 1.0;

/** The short card as a0a3ac7 built it and the 2026-09-27 ruling accepted it. */
const REVIEWED_CARD = {
  namePx: 112,
  answerPx: 68,
  lawPx: 50,
  wM: 4.95,
  hM: 1.9,
  texW: 1408,
  texH: 540,
  refDistM: 11.5,
  maxScale: 4.75,
} as const;
const reviewedLens = {
  hM: REVIEWED_CARD.hM,
  texH: REVIEWED_CARD.texH,
  scale: (d: number) =>
    Math.min(REVIEWED_CARD.maxScale, Math.max(1, d / REVIEWED_CARD.refDistM)),
};

/** The far end of the band the card holds one apparent size across, m. */
const BAND_FAR_M = BUBBLE_REF_DIST_M * BUBBLE_MAX_SCALE;

/**
 * The SHIPPED cockpit camera on a viewport of this shape: the hFOV-locked
 * vertical field of view, the eye 1.20 m above the road and the 4° of standing
 * down-pitch (`COCKPIT_PITCH_BASE`).
 *
 * Not `phoneCamera()` above. That one is LEVEL and is reconstructed from a
 * clipping observation on an older canvas; it is what the FR-OFC-CARD cases
 * were written against and they keep it. The pitch is not a detail here: it
 * lifts everything ahead of the car up the frame, and with it the card is
 * whole on the audited phone from 15.3 m dead ahead, not from the 11.7 m a
 * level camera reports.
 */
function productCamera(cssW: number, cssH: number): PerspectiveCamera {
  const aspect = cssW / cssH;
  const cam = new PerspectiveCamera(cockpitVFovForAspect(aspect), aspect, 0.1, 2000);
  cam.position.set(0, EYE_Y, 0);
  cam.rotation.set(COCKPIT_PITCH_BASE, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Is a card `widthM` wide whole on this glass, with the figure `forwardM`
 *  ahead of the eye and `lateralM` to its right (negative = left), its head
 *  `headY` above the road? Placed as the frame loop places it before the HUD
 *  strip is consulted: centred over the head, half a card above the gap. */
function wholeOnGlass(
  cam: PerspectiveCamera,
  lateralM: number,
  forwardM: number,
  widthM: number,
  headY: number,
): boolean {
  const s = bubbleScale(Math.hypot(lateralM, forwardM));
  return bubbleWhollyVisible(
    cam,
    lateralM,
    headY + BUBBLE_GAP_M + (BUBBLE_H_M * s) / 2,
    -forwardM,
    (widthM * s) / 2,
    (BUBBLE_H_M * s) / 2,
    false,
    new Vector3(),
  );
}

/** The nearest the officer can be with the card still whole, walking in from
 *  the far end of the band in 5 cm steps — so „whole from here out" is what
 *  the number means, with no hole behind it. Infinity = not whole even there. */
function nearLimitM(
  cam: PerspectiveCamera,
  lateralM: number,
  widthM: number,
  headY: number = HEAD_Y,
): number {
  let limit = Number.POSITIVE_INFINITY;
  for (let d = BAND_FAR_M; d >= 3; d -= 0.05) {
    if (!wholeOnGlass(cam, lateralM, d, widthM, headY)) break;
    limit = d;
  }
  return limit;
}

/**
 * CENSUS — every lesson that puts this card on the glass.
 *
 * The frame loop captions the first pedestrian that publishes a `pose`, and a
 * pose is published by exactly two staged kinds (`orchestrator/runners.ts`:
 * `trafficController` → "directTraffic", `policeStop` → "stopSignal"). So the
 * set is found by kind, over the whole template — level overrides included —
 * rather than listed, and a sixth lesson reddens this the day it is authored.
 *
 * `laneX` is the centre of the lane the student approaches in (all five head
 * north, +y); it is the one number here the spec does not carry, and the
 * officer's own coordinates are asserted against the spec so that moving him
 * cannot leave this table describing somewhere he no longer stands.
 */
const CARD_CENSUS = [
  { id: "sc-signal-controller", kind: "trafficController", officer: { x: 0, y: -11 }, laneX: 4.0625 },
  { id: "sc-sig-controller-live", kind: "trafficController", officer: { x: 0, y: -11 }, laneX: 4.0625 },
  { id: "sc-sig-controller-postures", kind: "trafficController", officer: { x: 0, y: -11 }, laneX: 4.0625 },
  { id: "sc-vp-police-stop", kind: "policeStop", officer: { x: 15.6, y: 208 }, laneX: 12.19 },
  { id: "sc-pe-school-patrol", kind: "policeStop", officer: { x: -9.72, y: 246 }, laneX: 4.06 },
] as const;
const POSED_KINDS = ["trafficController", "policeStop"] as const;

/** Officer's offset from the driver's eye, m to the right. Heading north, the
 *  driver sits `COCKPIT_EYE.x` to the LEFT of the lane centre, i.e. at −x. */
const lateralOf = (row: (typeof CARD_CENSUS)[number]) =>
  row.officer.x - (row.laneX - COCKPIT_EYE.x);

/** The head the card is mounted over, m. The frame loop pins the JU-18
 *  регулировчик at `PED_CONTROLLER_HEIGHT` and every other posed figure — the
 *  police officer, the school warden — at `PED_OFFICER_HEIGHT`. */
const headOf = (row: (typeof CARD_CENSUS)[number]) =>
  PED_HEAD_Y * (row.kind === "trafficController" ? PED_CONTROLLER_HEIGHT : PED_OFFICER_HEIGHT);

describe("founder ruling 2026-10-04 — the answer line is ≈ 11 CSS px on the approach", () => {
  const LENSES = [
    { name: "phone 852 × 393", cssW: AUDITED_PHONE.cssW, cssH: AUDITED_PHONE.cssH },
    ...PC_LENSES,
  ];

  it("the lens is the product's own, and it is not the generous one", () => {
    // 551.1 CSS px per radian at the centre of the audited phone — 1653 device
    // px at DPR 3, against the 1702 this file's FR-OFC-CARD floors are stated
    // in. Every viewport measured here holds the hFOV (none is squarer than
    // the 1.454 : 1 at which the vertical clamp would start trading it away).
    expect(focalCssPx(AUDITED_PHONE.cssW)).toBeCloseTo(551.1, 1);
    expect(focalCssPx(AUDITED_PHONE.cssW) * AUDITED_PHONE.dpr).toBeLessThan(PX_PER_RAD);
    for (const l of LENSES) {
      expect(cockpitVFovForAspect(l.cssW / l.cssH), l.name).toBeLessThan(COCKPIT_FOV_MAX);
    }
    // …and it reproduces what the reviewed card measured on w61 04-t018s:
    // capitals 24 device px tall on the answer line, i.e. the row's ≈ 8 CSS px.
    expect(
      lineCapCssPx(REVIEWED_CARD.answerPx, 48, AUDITED_PHONE.cssW, reviewedLens) * AUDITED_PHONE.dpr,
    ).toBeCloseTo(24.1, 1);
  });

  it("the ANSWER line reaches the ruled size at the reference distance — and holds it to the cap", () => {
    // Computed the way this file computes every other floor (`bodyCapPx`, the
    // 1702 / 0.72 pair) …
    expect(
      bodyCapPx(BUBBLE_LINE_PX.answer, BUBBLE_REF_DIST_M) / AUDITED_PHONE.dpr,
    ).toBeGreaterThanOrEqual(RULED_ANSWER_CSS_PX);
    // … AND on the product's own lens, which is 6 % less generous and is the
    // one a re-driven frame will be measured against. The reviewed card read
    // 8.03 here. The distances are the ruling's own band — «on the APPROACH,
    // 11.5–54.6 m» — as literals, so a band that is shortened or a reference
    // distance that is moved fails here rather than moving the yardstick.
    for (const d of [11.5, 16.7, 27, 40, 54.6]) {
      expect(
        lineCapCssPx(BUBBLE_LINE_PX.answer, d, AUDITED_PHONE.cssW),
        `${d} m`,
      ).toBeGreaterThanOrEqual(RULED_ANSWER_CSS_PX);
    }
    // NON-VACUITY: the reviewed card does not pass this.
    expect(
      lineCapCssPx(REVIEWED_CARD.answerPx, REVIEWED_CARD.refDistM, AUDITED_PHONE.cssW, reviewedLens),
    ).toBeLessThan(8.1);
  });

  it("ONLY the answer line grew — the citation and the header are the reviewed sizes", () => {
    // The citation the founder accepted on 2026-09-27, to the texture px …
    expect(BUBBLE_LINE_PX.law).toBe(REVIEWED_CARD.lawPx);
    expect(BUBBLE_POSTURE_LINE_PX.law).toBe(REVIEWED_CARD.lawPx);
    expect(BUBBLE_LINE_PX.name).toBe(REVIEWED_CARD.namePx);
    // … and to the pixel on the glass, at every range in the band. A change to
    // the card's height, its texture height or its reference distance moves
    // this even with the 50 left alone, which is the edit a bare constant pin
    // cannot see.
    for (const d of [BUBBLE_REF_DIST_M, 27, BAND_FAR_M]) {
      expect(
        lineCapCssPx(BUBBLE_LINE_PX.law, d, AUDITED_PHONE.cssW),
        `law @ ${d} m`,
      ).toBeCloseTo(lineCapCssPx(REVIEWED_CARD.lawPx, d, AUDITED_PHONE.cssW, reviewedLens), 9);
      expect(
        lineCapCssPx(BUBBLE_LINE_PX.name, d, AUDITED_PHONE.cssW),
        `name @ ${d} m`,
      ).toBeCloseTo(lineCapCssPx(REVIEWED_CARD.namePx, d, AUDITED_PHONE.cssW, reviewedLens), 9);
    }
    // 5.90 CSS px — the «≈ 6» of the row, stated so the pin has a number.
    expect(
      lineCapCssPx(BUBBLE_LINE_PX.law, BUBBLE_REF_DIST_M, AUDITED_PHONE.cssW),
    ).toBeCloseTo(5.9, 1);
  });

  it("the card grew SIDEWAYS only: same height, same band, same metres per texel", () => {
    // Height is what the windscreen refuses (see BUBBLE_H_M) and what the
    // ruling's «0.5–1 m earlier» would have been spent on. None of it is.
    expect(BUBBLE_H_M).toBe(REVIEWED_CARD.hM);
    expect(BUBBLE_TEX_H).toBe(REVIEWED_CARD.texH);
    expect(BUBBLE_REF_DIST_M).toBe(REVIEWED_CARD.refDistM);
    expect(BUBBLE_MAX_SCALE).toBe(REVIEWED_CARD.maxScale);
    // Plane and texture widen TOGETHER, so the border, the corner radius, the
    // pointer and the padding keep the physical size they were photographed at
    // and the type is not stretched: one texel is the same 3.516 mm both ways.
    expect(BUBBLE_W_M / BUBBLE_TEX_W).toBeCloseTo(REVIEWED_CARD.wM / REVIEWED_CARD.texW, 12);
    expect(BUBBLE_W_M / BUBBLE_TEX_W).toBeCloseTo(BUBBLE_H_M / BUBBLE_TEX_H, 5);
    // And it did grow — the ink box is the only place the bigger line can go.
    expect(BUBBLE_W_M).toBeGreaterThan(REVIEWED_CARD.wM);
  });

  it("no pc size regresses: every line is at least what the reviewed card showed", () => {
    for (const l of PC_LENSES) {
      for (const d of [BUBBLE_REF_DIST_M, 27, BAND_FAR_M]) {
        const at = `${l.name} @ ${d} m`;
        expect(lineCapCssPx(BUBBLE_LINE_PX.name, d, l.cssW), at).toBeGreaterThanOrEqual(
          lineCapCssPx(REVIEWED_CARD.namePx, d, l.cssW, reviewedLens) - 1e-9,
        );
        expect(lineCapCssPx(BUBBLE_LINE_PX.law, d, l.cssW), at).toBeGreaterThanOrEqual(
          lineCapCssPx(REVIEWED_CARD.lawPx, d, l.cssW, reviewedLens) - 1e-9,
        );
        expect(lineCapCssPx(BUBBLE_LINE_PX.answer, d, l.cssW), at).toBeGreaterThan(
          lineCapCssPx(REVIEWED_CARD.answerPx, d, l.cssW, reviewedLens),
        );
      }
    }
  });

  it("CENSUS: these five lessons are every lesson that renders the card", () => {
    const found = SCENARIO_TEMPLATES.filter((s) => {
      const json = JSON.stringify(s);
      return POSED_KINDS.some((k) => json.includes(`"kind":"${k}"`));
    })
      .map((s) => s.id)
      .sort();
    expect(found).toEqual(CARD_CENSUS.map((r) => r.id).sort());
    for (const row of CARD_CENSUS) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === row.id)!;
      const posed = (spec.staged ?? []).filter((e) => e.kind === row.kind);
      expect(posed, row.id).toHaveLength(1);
      expect(
        (posed[0] as unknown as { officer: { x: number; y: number } }).officer,
        row.id,
      ).toEqual(row.officer);
    }
  });

  it("the card is still WHOLE on the approach, on the shipped lens, and leaves no earlier than ruled", () => {
    // THE WIDER CARD COSTS NOTHING VERTICALLY — it is billboarded, so its top
    // edge is level on the glass and does not move with its width — and that
    // is the axis the ruling's allowance was for. What a wider card can lose is
    // the SIDE of the frame, so the question is put per lesson, at the lateral
    // offset its officer actually stands at.
    const inLane = CARD_CENSUS.filter((r) => r.id !== "sc-pe-school-patrol");
    expect(inLane).toHaveLength(4);
    for (const l of LENSES) {
      const cam = productCamera(l.cssW, l.cssH);
      // Dead ahead is the reference case: not one step earlier.
      expect(nearLimitM(cam, 0, BUBBLE_W_M), `${l.name}, dead ahead`).toBe(
        nearLimitM(cam, 0, REVIEWED_CARD.wM),
      );
      for (const row of inLane) {
        const lat = lateralOf(row);
        const now = nearLimitM(cam, lat, BUBBLE_W_M, headOf(row));
        const was = nearLimitM(cam, lat, REVIEWED_CARD.wM, headOf(row));
        const at = `${l.name}, ${row.id} (officer ${lat.toFixed(2)} m)`;
        expect(Number.isFinite(now), at).toBe(true);
        expect(now - was, at).toBeLessThanOrEqual(RULED_EARLIER_EXIT_M);
        // …and nothing nearer than the reviewed card managed: a wider card
        // that fitted CLOSER would be a card whose height had been cut.
        expect(now, at).toBeGreaterThanOrEqual(was);
      }
    }
    // AT THE STOP LINE ITSELF, on the phone, for the three регулировчик
    // drills: the officer stands `lineDistM` − 11 = 16.7 m beyond the line.
    // Counting the eye as if it were ON the front bumper (it is ≈ 2 m behind
    // it, so this is the unkind reading) the card must still be whole.
    const phone = productCamera(AUDITED_PHONE.cssW, AUDITED_PHONE.cssH);
    for (const row of CARD_CENSUS.filter((r) => r.kind === "trafficController")) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === row.id)!;
      const ev = (spec.staged ?? []).find((e) => e.kind === "trafficController") as unknown as {
        lineDistM: number;
        junction: { y: number };
      };
      const officerPastLineM = ev.lineDistM - Math.abs(row.officer.y - ev.junction.y);
      expect(officerPastLineM, row.id).toBeCloseTo(16.7, 6);
      expect(nearLimitM(phone, lateralOf(row), BUBBLE_W_M, headOf(row)), row.id).toBeLessThanOrEqual(
        officerPastLineM,
      );
    }
  });

  it("DISCLOSED COST: the school warden, 13.5 m to the side, loses the card sooner than the ruling allows a stop", () => {
    // `sc-pe-school-patrol` stands its warden on the far kerb, 13.54 m left of
    // the driver's eye. The card over her head is whole only while she is
    // within ≈ 24° of the camera axis (it was ≈ 27° at 4.95 m wide), so it
    // leaves the SIDE of the frame at 31.2 m where it used to leave at
    // 27.1 m: 4.1 m sooner, four times the ruled allowance. The ruling was
    // about the card leaving the top of the windscreen at a stop; this is a
    // different edge, on a figure the student never stops in front of, and it
    // is the price of a 30-character line at 11 CSS px. It is pinned so it
    // cannot get worse unseen, and reported so it is not a surprise.
    const row = CARD_CENSUS.find((r) => r.id === "sc-pe-school-patrol")!;
    const lat = lateralOf(row);
    expect(lat).toBeCloseTo(-13.54, 2);
    for (const l of LENSES) {
      const cam = productCamera(l.cssW, l.cssH);
      const now = nearLimitM(cam, lat, BUBBLE_W_M, headOf(row));
      const was = nearLimitM(cam, lat, REVIEWED_CARD.wM, headOf(row));
      expect(was, l.name).toBeGreaterThan(27.0);
      expect(was, l.name).toBeLessThan(27.2);
      expect(now - was, l.name).toBeGreaterThan(RULED_EARLIER_EXIT_M);
      expect(now - was, l.name).toBeLessThanOrEqual(4.2);
    }
  });
});
