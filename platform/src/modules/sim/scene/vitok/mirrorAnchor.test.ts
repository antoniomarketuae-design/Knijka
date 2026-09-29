import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  COCKPIT_EYE,
  COCKPIT_LEAN_LONGITUDINAL,
  COCKPIT_PITCH_BASE,
  COCKPIT_PITCH_GAIN,
  cockpitVFovForAspect,
} from "../../vehicle/tuning";
import {
  COCKPIT_HEADER_EDGE,
  HEADER_VISIBLE_BAND,
  REAR_MIRROR_GLASS_TOP,
  REAR_MIRROR_STATION_DROP_MAX_M,
  cockpitHeaderDropM,
  hotspotLabelPoint,
  hotspotScreenRect,
  projectCockpitPoint,
  rearMirrorStationDropM,
  rearMirrorStationDropUncappedM,
} from "./cabinLook";
import {
  HAZARD_BAND_TOP_FRACTION,
  NOTIFY_COLUMN_MIRROR_GUTTER_PX,
  notifyColumnMaxHeightPx,
} from "../../hud/notifyColumn";
import { notifyColumnFloorPx } from "../../../../components/sim/TouchControls";
/** The first-run touch hint's measured card height, px — the same figure
 *  `hud/__tests__/mirror-lane-corridor.test.ts` declares and for the same
 *  reason: it is read off `03-ready.png` at dpr 3, not exported by a module. */
const TOUCH_HINT_CARD_PX = 124.5;
import {
  B58_CLEARANCE_NODE_RAISE_M,
  B58_STATION_RAISE_M,
  COCKPIT_EYE_GLB,
  REAR_GLASS_ASSEMBLY_DROP_M,
  REAR_GLASS_CORNERS,
  REAR_GLASS_LIFT_M,
  REAR_GLASS_NODE,
  REAR_HOUSING_CORNERS,
  REAR_MIRROR_CASING_BOX,
  REAR_MIRROR_HOUSING_BOXES,
  headerPadSpan,
  inRearMirrorCasing,
  reanchoredStalk,
  rearGlassPointGlb,
  rearMirrorB58ClearanceM,
  rigMirrorGlass,
  stalkAxisY,
  stalkRun,
} from "./mirrorStation";

/**
 * «RE-ANCHOR THE MIRROR» — founder ruling 2026-09-22, row
 * sc-mw-emergency-lane:3ffb0692: „the rear-view mirror is a black housing
 * floating detached in open sky above the windscreen header, skewed off-axis
 * and clipped by the top edge of the screen, on every mobile frame". Keep the
 * cockpit camera and the sign sizes; pin the mirror to the VISIBLE header on
 * wide phones.
 *
 * The audited phone viewports are `tools/mobile/lib/devices.mjs`'s landscape
 * profiles, plus the Samsung gesture-bar stage the HUD ladder serves.
 */
const PHONES = [
  { id: "iphone16-landscape 852×393", aspect: 852 / 393 },
  { id: "small-landscape 780×360", aspect: 780 / 360 },
  { id: "galaxy-gesturebar stage 780×340", aspect: 780 / 340 },
];
/** Windows the founder signed the composition off on, and the upright phones. */
const UNCHANGED = [
  { id: "16:9 reference", aspect: 16 / 9 },
  { id: "PC 1440×900", aspect: 1440 / 900 },
  { id: "drive harness 1165×650", aspect: 1165 / 650 },
  { id: "4:3", aspect: 4 / 3 },
  { id: "iphone16-portrait", aspect: 393 / 852 },
  { id: "small-portrait", aspect: 360 / 780 },
];

/** The sideways phone STAGES the HUD ladder serves, with their real insets —
 *  the same three `hud/__tests__/mirror-lane-corridor.test.ts` holds. */
const HUD_STAGES = [
  { width: 852, height: 393, insetBottom: 21 },
  { width: 780, height: 360, insetBottom: 0 },
  { width: 780, height: 340, insetBottom: 0 },
];
/** B58's measured occlusion threshold, in NODE raise (mirrorStation restates
 *  `tools/glb/raise_interior_mirror.mjs`: raised 105 mm against 92.8). */
const B58_CLEARANCE_THRESHOLD_M = B58_CLEARANCE_NODE_RAISE_M;
/** The shortest the peek card can paint, px — hud-off-the-road.test.ts derives it
 *  from SimOverlay's own class names; quoted here as the floor no ceiling bounds. */
const PEEK_CARD_CHROME_PX = 106;

const fy = (p: readonly [number, number, number], aspect: number) =>
  projectCockpitPoint(p, "forward", aspect).y;
const headerFy = (aspect: number, drop: number) =>
  fy([0, COCKPIT_HEADER_EDGE.y - drop, COCKPIT_HEADER_EDGE.z], aspect);
const glassTopFy = (aspect: number, drop: number) =>
  fy([REAR_MIRROR_GLASS_TOP[0], REAR_MIRROR_GLASS_TOP[1] - drop, REAR_MIRROR_GLASS_TOP[2]], aspect);
/** tan-space offset of the glass top below the header edge — aspect-free. */
const tanGap = (aspect: number, headerDrop: number, stationDrop: number) =>
  (headerFy(aspect, headerDrop) - glassTopFy(aspect, stationDrop)) *
  2 *
  Math.tan((cockpitVFovForAspect(aspect) * Math.PI) / 360);

describe("the defect, restated in the shipped geometry (drops forced to 0)", () => {
  it("on every audited phone the header edge is ABOVE the frame and the glass touches row 0", () => {
    for (const p of PHONES) {
      expect(headerFy(p.aspect, 0), p.id).toBeGreaterThan(1);
      expect(glassTopFy(p.aspect, 0), p.id).toBeGreaterThan(0.99);
    }
  });
});

describe("the ruling: the header is visible and the mirror hangs from it", () => {
  for (const p of PHONES) {
    it(`${p.id}: the header edge is on screen, ${HEADER_VISIBLE_BAND * 100} % inside the top`, () => {
      const h = headerFy(p.aspect, cockpitHeaderDropM(p.aspect));
      expect(h).toBeLessThanOrEqual(1 - HEADER_VISIBLE_BAND + 1e-4);
      // …and not buried: no more than 0.1 % of frame height lower than asked.
      expect(h).toBeGreaterThan(1 - HEADER_VISIBLE_BAND - 1e-3);
    });

    it(`${p.id}: the drop the composition asks for is REFUSED, and by how much`, () => {
      // The ruling's geometry is solved and still published
      // (`rearMirrorStationDropUncappedM`) — it is the shipped drop that is
      // capped by B58's sign clearance (see the cap's own block in cabinLook.ts,
      // and `the two bars` below).
      const wanted = rearMirrorStationDropUncappedM(p.aspect);
      expect(wanted).toBeGreaterThan(0.03);
      expect(rearMirrorStationDropM(p.aspect)).toBe(REAR_MIRROR_STATION_DROP_MAX_M);
      // What the refused drop WOULD have bought, so the cost is a number: the
      // glass would hang below the header at exactly the 16:9 offset…
      const hd = cockpitHeaderDropM(p.aspect);
      expect(glassTopFy(p.aspect, wanted)).toBeLessThan(headerFy(p.aspect, hd));
      expect(tanGap(p.aspect, hd, wanted)).toBeCloseTo(tanGap(16 / 9, 0, 0), 3);
      // …and what the cap refuses, which is still most of it: B58 allows 11.3 of
      // the ~36 mm. What the 11.3 mm DOES buy (the glass inside the frame on the
      // two judged stages, cut on the gesture-bar one) is held in «the shipped
      // re-anchor» block below.
      expect(rearMirrorStationDropM(p.aspect)).toBeLessThan(wanted - 0.02);
    });
  }

  it("the numbers the lane report quotes: ~39 mm of header lands, 11.3 of ~36 mm of station lands", () => {
    const iphone = PHONES[0].aspect;
    expect(cockpitHeaderDropM(iphone)).toBeCloseTo(0.0393, 3);
    expect(rearMirrorStationDropUncappedM(iphone)).toBeCloseTo(0.0364, 3);
    expect(rearMirrorStationDropM(iphone)).toBe(0.0113);
  });

  /**
   * THE TWO BARS THAT SET THE CAP, EXECUTED RATHER THAN QUOTED. A cap written
   * as a constant with a paragraph beside it is a claim; these are the two
   * measurements the paragraph rests on, run against the shipped arithmetic.
   * Until 2026-09-27 the HUD bar bound it at 0; the ruling moved the card that
   * made it bind, so B58 is the bar that sets it now — at the GLASS (11.3 of
   * 11.35 mm), not at the casing's 12.2 the first cut subtracted to.
   */
  describe("the two bars", () => {
    /** Where the mirror's floor lands, as a fraction of the stage, for a drop. */
    const bottom = (aspect: number, drop: number) =>
      hotspotScreenRect("hotspot_mirror_rear", "forward", aspect, drop)!.bottom;
    /** The lane the HUD would have to publish for that drop (rounded up, 3dp —
     *  `MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE`'s own grammar). */
    const lane = (drop: number) =>
      Math.ceil(Math.max(...HUD_STAGES.map((s) => bottom(s.width / s.height, drop))) * 1000) / 1000;
    /** …and what the first-run touch hint then has to scroll on a stage. */
    const hintOverflow = (stage: (typeof HUD_STAGES)[number], laneFraction: number) => {
      const top = Math.max(8, stage.height * laneFraction + NOTIFY_COLUMN_MIRROR_GUTTER_PX);
      const band = notifyColumnMaxHeightPx(
        stage.height,
        notifyColumnFloorPx(stage),
        top,
        HAZARD_BAND_TOP_FRACTION,
      );
      return Math.max(0, TOUCH_HINT_CARD_PX - band);
    };

    it("B58's sign clearance allows 12.2 mm of CASING but only 11.35 mm of GLASS — the glass binds", () => {
      // The subtraction the first cut used is the casing's own bar, and only its:
      expect(B58_STATION_RAISE_M - B58_CLEARANCE_THRESHOLD_M).toBeCloseTo(0.0122, 4);
      // …the glass and the housing portalled into it are placed by MirrorRig's
      // eye-ray lift, which eats part of any node raise, so their bar is lower.
      expect(rearMirrorB58ClearanceM(0.0113).glass).toBeGreaterThanOrEqual(0);
      expect(rearMirrorB58ClearanceM(0.0114).glass).toBeLessThan(0);
      expect(rearMirrorB58ClearanceM(0.0122).casing).toBeGreaterThanOrEqual(-1e-12);
    });

    it("the phone HUD no longer binds it: the card that clipped MOVED, and the peek stays off the road", () => {
      // WHY THE HINT HAD TO MOVE, kept as arithmetic: under the lane the shipped
      // drop publishes, the RIGHT corridor would clip the first-run hint on the
      // handset the catalogue was shot on (it held 2.26 px of slack at 0 mm).
      // The ruling answered that by moving the card (touchHintLandscapeCorridor
      // .test.ts holds where it went and that it clips nothing there).
      const shipped = lane(REAR_MIRROR_STATION_DROP_MAX_M);
      expect(shipped).toBeGreaterThan(lane(0));
      expect(hintOverflow(HUD_STAGES[0], lane(0))).toBe(0);
      expect(hintOverflow(HUD_STAGES[0], shipped)).toBeGreaterThan(0);
      // …and the tenant that STAYS — the peek — cannot paint shorter than its own
      // chrome (106 px, derived in hud-off-the-road.test.ts); at the shipped drop
      // that floor is still above the hazard band on every sideways stage, while
      // the composition-true drop would put it INSIDE the band on 780 × 360.
      for (const stage of HUD_STAGES) {
        const top = stage.height * shipped + NOTIFY_COLUMN_MIRROR_GUTTER_PX;
        expect((top + PEEK_CARD_CHROME_PX) / stage.height).toBeLessThan(HAZARD_BAND_TOP_FRACTION);
      }
      const stage = HUD_STAGES[1];
      const fullTop =
        stage.height * lane(rearMirrorStationDropUncappedM(PHONES[0].aspect)) +
        NOTIFY_COLUMN_MIRROR_GUTTER_PX;
      expect((fullTop + PEEK_CARD_CHROME_PX) / stage.height).toBeGreaterThan(
        HAZARD_BAND_TOP_FRACTION,
      );
    });
  });
});

/**
 * THE 2026-09-22 FOLLOW-UP RULING, BUILT — «re-anchor AND move the card».
 * The card moved (the first-run hint to the left corridor on sideways phones,
 * `touchHintLandscapeCorridor.test.ts`), so the HUD no longer refuses the drop,
 * and what is left binding it is B58 alone. These are the three pins the row
 * is closed on, asked of the SHIPPED drop — not of a forced one.
 */
describe("the shipped re-anchor: the glass is inside the frame, under the B58 bar", () => {
  /** The two stages the row was photographed on / is judged on. */
  const JUDGED = [PHONES[0], PHONES[1]];
  /** cockpitMirrorEdge.test.ts's conservative glass-top point (authored, no
   *  lift — it projects HIGHER than the rigged edge), asked as a second opinion. */
  const GLASS_TOP_NEAR: readonly [number, number, number] = [0.119, 0.9086, 0.417];

  for (const p of JUDGED) {
    it(`${p.id}: HEAD AT REST (0 g — pitch COCKPIT_PITCH_BASE, eye COCKPIT_EYE): the glass top projects BELOW the top edge of the frame`, () => {
      // AT REST ONLY — projectCockpitPoint is the resting head. Under braking
      // CameraRig tips the view and leans the head, and this air is gone by
      // ~0.06 g: see «THE BRAKING RESIDUAL, STATED» below.
      const d = rearMirrorStationDropM(p.aspect);
      expect(glassTopFy(p.aspect, d)).toBeLessThan(1);
      expect(
        fy([GLASS_TOP_NEAR[0], GLASS_TOP_NEAR[1] - d, GLASS_TOP_NEAR[2]], p.aspect),
      ).toBeLessThan(1);
      // …with a pixel of air on the stage, not a rounding error: ≥ 1 CSS px of 393.
      expect((1 - glassTopFy(p.aspect, d)) * 393).toBeGreaterThan(1);
    });
  }

  it("B58: at every drop the product can ask for, NO part sits lower than at the 92.8 mm threshold — casing, glass AND housing", () => {
    // Asked of the assembly as MirrorRig and VitokCockpit build it
    // (`rearMirrorB58ClearanceM`), part by part, so either one breaking the
    // bar is red on its own name. The margins are tiny on purpose (the cap is
    // the largest 0.1 mm step that holds), so they are pinned in micrometres.
    const c = rearMirrorB58ClearanceM(REAR_MIRROR_STATION_DROP_MAX_M);
    expect(c.casing, "the authored casing").toBeGreaterThanOrEqual(0);
    expect(c.glass, "the rigged glass").toBeGreaterThanOrEqual(0);
    expect(c.housing, "the housing portalled into the glass").toBeGreaterThanOrEqual(0);
    for (let a = 1.3; a <= 3.2; a += 0.01) {
      const d = rearMirrorStationDropM(a);
      expect(d).toBeLessThanOrEqual(REAR_MIRROR_STATION_DROP_MAX_M);
      const at = rearMirrorB58ClearanceM(d);
      expect(Math.min(at.casing, at.glass, at.housing), `aspect ${a.toFixed(2)}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("…and the cap is the LARGEST 0.1 mm step that holds: one step more and the glass or housing breaks it", () => {
    const next = rearMirrorB58ClearanceM(REAR_MIRROR_STATION_DROP_MAX_M + 0.0001);
    expect(Math.min(next.glass, next.housing)).toBeLessThan(0);
    // The integer-tenths grammar the constant is written in.
    expect(Math.round(REAR_MIRROR_STATION_DROP_MAX_M * 1e4)).toBeCloseTo(REAR_MIRROR_STATION_DROP_MAX_M * 1e4, 9);
  });

  it("the round-1 cap (12.0 mm) held the casing and broke the glass by 0.7 mm — why it came down", () => {
    const r1 = rearMirrorB58ClearanceM(0.012);
    expect(r1.casing).toBeCloseTo(0.0002, 9);
    expect(r1.glass).toBeLessThan(-0.0006);
    expect(r1.housing).toBeLessThan(-0.0006);
    // In the verifier's own units: at 12 mm the glass centre sits where a
    // 92.10 mm node raise would put it, 0.7 mm under the 92.8 bar.
    const centreY = (raise: number, drop: number) => rearGlassPointGlb([0, 0, 0], raise, drop)[1];
    let lo = 0;
    let hi = 0.2;
    const target = centreY(B58_STATION_RAISE_M, 0.012);
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (centreY(m, 0) < target) lo = m;
      else hi = m;
    }
    expect(lo * 1000).toBeCloseTo(92.1, 1);
  });

  it("the drop is spent: a cap of 0 would leave the glass cut, so the constant is load-bearing", () => {
    expect(REAR_MIRROR_STATION_DROP_MAX_M).toBeGreaterThan(0);
    for (const p of JUDGED) {
      expect(glassTopFy(p.aspect, 0), p.id).toBeGreaterThan(1);
      expect(rearMirrorStationDropM(p.aspect), p.id).toBe(REAR_MIRROR_STATION_DROP_MAX_M);
    }
  });

  /**
   * THE RESIDUAL, STATED — THE FOUNDER TRADE, PRECISELY. At the capped drop the
   * glass top is still above the frame on every canvas of aspect ≥ 2.18796
   * (the conservative authored corner: ≥ 2.17393). That is every 20:9 Android
   * at full screen — 800 × 360, 915 × 412 — and the 780 × 340 gesture-bar
   * stage, not only the last. Across the ladder's stage heights 340–430 CSS px
   * the first cut width is ⌈2.18796 · h⌉; the list is enumerated below.
   */
  const glassCutFrom = (() => {
    let lo = 2.0;
    let hi = 2.45;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      if (glassTopFy(m, rearMirrorStationDropM(m)) > 1) hi = m;
      else lo = m;
    }
    return hi;
  })();

  it("THE RESIDUAL, STATED: the glass stays cut from aspect 2.188 up — every 20:9 phone, not only 780 × 340", () => {
    expect(glassCutFrom).toBeCloseTo(2.18796, 4);
    // …and it is a single threshold: inside below it, cut above it, all the
    // way to the 2.45 end of the ladder.
    for (let a = 1.78; a <= 2.45; a += 0.005) {
      const d = rearMirrorStationDropM(a);
      expect(glassTopFy(a, d) > 1, `aspect ${a.toFixed(3)}`).toBe(a >= glassCutFrom);
    }
    const CUT = [
      { id: "20:9 Samsung 800×360", w: 800, h: 360, px: 2.82 },
      { id: "20:9 Pixel 915×412", w: 915, h: 412, px: 3.1 },
      { id: "gesture-bar stage 780×340", w: 780, h: 340, px: 8.25 },
    ];
    for (const c of CUT) {
      const a = c.w / c.h;
      const over = (glassTopFy(a, rearMirrorStationDropM(a)) - 1) * c.h;
      expect(over, c.id).toBeCloseTo(c.px, 1);
    }
    const INSIDE = [
      { id: "iPhone 16 852×393", w: 852, h: 393 },
      { id: "iPhone 844×390", w: 844, h: 390 },
      { id: "iPhone Pro Max 932×430", w: 932, h: 430 },
      { id: "small 780×360", w: 780, h: 360 },
      { id: "740×360", w: 740, h: 360 },
      { id: "16:9 667×375", w: 667, h: 375 },
    ];
    for (const c of INSIDE) {
      const a = c.w / c.h;
      expect(glassTopFy(a, rearMirrorStationDropM(a)), c.id).toBeLessThan(1);
    }
    // The drop that would fix the worst of them is what B58 refuses.
    const s = PHONES[2];
    expect(glassTopFy(s.aspect, B58_STATION_RAISE_M - B58_CLEARANCE_THRESHOLD_M)).toBeGreaterThan(1);
  });

  it("…enumerated over every stage height 340–430: the first cut width is ⌈2.18796 · h⌉", () => {
    for (let h = 340; h <= 430; h++) {
      const w = Math.ceil(glassCutFrom * h);
      expect(glassTopFy(w / h, rearMirrorStationDropM(w / h)), `${w}×${h}`).toBeGreaterThan(1);
      expect(glassTopFy((w - 1) / h, rearMirrorStationDropM((w - 1) / h)), `${w - 1}×${h}`).toBeLessThan(1);
    }
    expect(Math.ceil(glassCutFrom * 340)).toBe(744);
    expect(Math.ceil(glassCutFrom * 360)).toBe(788);
    expect(Math.ceil(glassCutFrom * 393)).toBe(860);
    expect(Math.ceil(glassCutFrom * 412)).toBe(902);
    expect(Math.ceil(glassCutFrom * 430)).toBe(941);
  });

  /**
   * THE BRAKING RESIDUAL, STATED (verifier condition C1, lane mirror round 3).
   * Every frame check above is the head AT REST. CameraRig is not at rest
   * under braking: it tips the view by COCKPIT_PITCH_GAIN rad per g (nose-dive)
   * and leans the eye forward COCKPIT_LEAN_LONGITUDINAL m per g, and the
   * car-fixed cabin rises in the frame. The re-anchor's 11.3 mm is the B58
   * cap, so no drop is left to buy this back: on 852 × 393 the ~1.8 CSS px of
   * air over the glass is spent at ~0.062 g of braking and the lowered header
   * leaves the frame at ~0.283 g (the round-2 verifier's 0.08 / 0.37 g are the
   * PITCH-ONLY figures — 0.083 / 0.366 here; CameraRig's forward lean of the
   * eye brings both earlier). At 0.5 g the glass is cut by ~12.8 CSS px and
   * the header is ~6.1 px out of the frame. The row's w61 braking frames (04-t042s,
   * 04-t053s) are EXPECTED to stay cut, in open sky — this is the residual
   * handed to the founder, not a regression, and the row must not be counted
   * closed on braking frames without a founder ruling.
   */
  describe("THE BRAKING RESIDUAL, STATED — the frame checks above are the head at rest", () => {
    /** CameraRig's cockpit camera in the chassis frame, with its longitudinal
     *  G head motion: quaternion FLIP_Y · Euler(BASE + g·GAIN, 0, 0, "YXZ"),
     *  eye COCKPIT_EYE + (0, 0, −g·LEAN) (pinned against CameraRig below).
     *  longG < 0 is braking. */
    const fyUnderLongG = (p: readonly [number, number, number], aspect: number, longG: number) => {
      const cam = new PerspectiveCamera(cockpitVFovForAspect(aspect), aspect, 0.01, 100);
      cam.position.set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z - longG * COCKPIT_LEAN_LONGITUDINAL);
      cam.quaternion
        .set(0, 1, 0, 0)
        .multiply(new Quaternion().setFromEuler(new Euler(COCKPIT_PITCH_BASE + longG * COCKPIT_PITCH_GAIN, 0, 0, "YXZ")));
      cam.updateMatrixWorld(true);
      return (new Vector3(p[0], p[1], p[2]).project(cam).y + 1) / 2;
    };
    const phone = PHONES[0];
    const H = 393;
    const d = rearMirrorStationDropM(phone.aspect);
    const glassTop = [REAR_MIRROR_GLASS_TOP[0], REAR_MIRROR_GLASS_TOP[1] - d, REAR_MIRROR_GLASS_TOP[2]] as const;
    const headerEdge = [0, COCKPIT_HEADER_EDGE.y - cockpitHeaderDropM(phone.aspect), COCKPIT_HEADER_EDGE.z] as const;
    /** The braking deceleration (g) at which a point reaches the top edge. */
    const brakingGToTop = (p: readonly [number, number, number]) => {
      let lo = 0;
      let hi = 1.2;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (fyUnderLongG(p, phone.aspect, -mid) >= 1) hi = mid;
        else lo = mid;
      }
      return hi;
    };

    it("the helper IS the at-rest projection at 0 g (so what it adds is only CameraRig's head motion)", () => {
      for (const s of PHONES) {
        const dd = rearMirrorStationDropM(s.aspect);
        expect(fyUnderLongG([REAR_MIRROR_GLASS_TOP[0], REAR_MIRROR_GLASS_TOP[1] - dd, REAR_MIRROR_GLASS_TOP[2]], s.aspect, 0)).toBeCloseTo(
          glassTopFy(s.aspect, dd),
          9,
        );
        expect(fyUnderLongG([0, COCKPIT_HEADER_EDGE.y - 0.02, COCKPIT_HEADER_EDGE.z], s.aspect, 0)).toBeCloseTo(
          headerFy(s.aspect, 0.02),
          9,
        );
      }
    });

    it("852 × 393: ~1.8 CSS px of air at rest, spent by ~0.062 g of braking; the header band leaves the frame at ~0.283 g", () => {
      expect((1 - fyUnderLongG(glassTop, phone.aspect, 0)) * H).toBeCloseTo(1.8, 1);
      expect((1 - fyUnderLongG(headerEdge, phone.aspect, 0)) * H).toBeCloseTo(7.92, 1);
      expect(brakingGToTop(glassTop)).toBeCloseTo(0.0624, 3);
      expect(brakingGToTop(headerEdge)).toBeCloseTo(0.2832, 3);
      // The w61 braking class, in CSS px over the top edge.
      expect((fyUnderLongG(glassTop, phone.aspect, -0.5) - 1) * H).toBeCloseTo(12.77, 1);
      expect((fyUnderLongG(headerEdge, phone.aspect, -0.5) - 1) * H).toBeCloseTo(6.14, 1);
      // Braking cuts it; accelerating (longG > 0) only adds air.
      expect(fyUnderLongG(glassTop, phone.aspect, -0.2)).toBeGreaterThan(1);
      expect(fyUnderLongG(glassTop, phone.aspect, 0.2)).toBeLessThan(fyUnderLongG(glassTop, phone.aspect, 0));
    });

    it("…and no drop B58 allows can buy it back: at the cap, 0.5 g still cuts the glass by several CSS px", () => {
      expect(d).toBe(REAR_MIRROR_STATION_DROP_MAX_M);
      const cutPx = (fyUnderLongG(glassTop, phone.aspect, -0.5) - 1) * H;
      expect(cutPx).toBeGreaterThan(5);
    });

    it("the head motion measured is CameraRig's own (read off its source)", () => {
      const src = readFileSync(resolve(__dirname, "../../../../components/sim/CameraRig.tsx"), "utf8");
      expect(src).toContain("const FLIP_Y = new Quaternion(0, 1, 0, 0);");
      expect(src).toContain("-lean.longG * COCKPIT_LEAN_LONGITUDINAL,");
      expect(src).toContain("COCKPIT_PITCH_BASE + lean.longG * COCKPIT_PITCH_GAIN,");
      expect(src).toContain("const longGTarget = clampAbs(longAccel / 9.81, 1.2);");
    });
  });

  it("the conservative authored corner agrees, 0.014 of aspect earlier (2.17393)", () => {
    const near = (a: number) =>
      fy([GLASS_TOP_NEAR[0], GLASS_TOP_NEAR[1] - rearMirrorStationDropM(a), GLASS_TOP_NEAR[2]], a);
    expect(near(2.1739)).toBeLessThan(1);
    expect(near(2.174)).toBeGreaterThan(1);
  });
});

/**
 * F1 of the round-1 verification: «105 − d ≥ 92.8» is the casing's arithmetic,
 * not the glass's. These hold that the B58 check above is asked of the glass
 * and housing AS THE PRODUCT PLACES THEM — MirrorRig's own placement function,
 * the node as the GLB ships it, the boxes MirrorHousing renders.
 */
describe("B58 is measured on the built assembly — MirrorRig's placement, the GLB's node", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../../../", p), "utf8");

  it("the node the check starts from is hero_interior.glb's hotspot_mirror_rear, raised by B58", () => {
    const glb = readFileSync(resolve(__dirname, "../../../../../public/sim/vehicles/hero_interior.glb"));
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")) as {
      nodes: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[];
      scenes: { nodes: number[] }[];
    };
    const i = json.nodes.findIndex((n) => n.name === "hotspot_mirror_rear");
    const node = json.nodes[i];
    // A scene root — no parent transform between the GLB frame and the quad.
    expect(json.scenes[0].nodes).toContain(i);
    expect(json.nodes.some((n) => (n.children ?? []).includes(i))).toBe(false);
    expect(node.translation![0]).toBeCloseTo(REAR_GLASS_NODE.x, 6);
    expect(node.translation![1]).toBeCloseTo(REAR_GLASS_NODE.preRaiseY + B58_STATION_RAISE_M, 6);
    expect(node.translation![2]).toBeCloseTo(REAR_GLASS_NODE.z, 6);
    expect(node.rotation).toEqual([...REAR_GLASS_NODE.quaternion]);
    expect(node.scale).toEqual([REAR_GLASS_NODE.scale, REAR_GLASS_NODE.scale, REAR_GLASS_NODE.scale]);
  });

  it("MirrorRig places the rear glass through rigMirrorGlass (via placeRigGlassNode), with the module's lift and drop", () => {
    const src = read("components/sim/vitok/MirrorRig.tsx");
    // Round 3: the transform half of the effect is mirrorStation.placeRigGlassNode,
    // which calls rigMirrorGlass and owns the undo — mirrorCasing.test.ts executes it.
    expect(src).toMatch(
      /const restoreTransform = placeRigGlassNode\(\s*e\.mesh,\s*MIRROR_DEFS\[e\.kind\]\.glassLiftM,/,
    );
    expect(src).toContain('e.kind === "rear" ? MIRROR_DROP_M : 0,');
    expect(src).toContain('e.kind === "rear" ? rearStationDropM : 0,');
    expect(src).toMatch(/e\.mesh\.material = previous;\s*restoreTransform\(\);/);
    // The rig no longer moves the node itself — one placement, one undo.
    expect(src).not.toMatch(/e\.mesh\.position\.(set|copy)\(/);
    expect(src).not.toMatch(/e\.mesh\.scale\.(multiplyScalar|copy)\(/);
    expect(src).toContain("const MIRROR_DROP_M = REAR_GLASS_ASSEMBLY_DROP_M;");
    expect(src).toContain("glassLiftM: REAR_GLASS_LIFT_M,");
    // No second, inline copy of the lift left behind to drift from this one.
    expect(src).not.toMatch(/addScaledVector\(toEye/);
  });

  it("MirrorHousing renders the module's boxes — the ones the housing clearance is asked of", () => {
    const src = read("components/sim/vitok/VitokCockpit.tsx");
    expect(src).toContain("const BOX = REAR_MIRROR_HOUSING_BOXES;");
    for (const part of ["front", "rear", "hood"]) {
      expect(src).toContain(`<mesh position={BOX.${part}.position} onUpdate={setLayer}>`);
      expect(src).toContain(`<boxGeometry args={BOX.${part}.size} />`);
    }
    expect(src).toContain("{BOX.bezel.map((bar, i) => (");
    expect(src).toContain("{mirrorMeshes.rear ? createPortal(<MirrorHousing />, mirrorMeshes.rear) : null}");
    expect(REAR_HOUSING_CORNERS).toHaveLength(8 * (3 + REAR_MIRROR_HOUSING_BOXES.bezel.length));
    expect(REAR_GLASS_CORNERS).toHaveLength(4);
  });

  it("the placement is REF 8's: 60 mm toward the eye, shrunk by the distance ratio, then straight down", () => {
    const authored = [REAR_GLASS_NODE.x, REAR_GLASS_NODE.preRaiseY + B58_STATION_RAISE_M, REAR_GLASS_NODE.z] as const;
    const rig = rigMirrorGlass(authored, REAR_GLASS_LIFT_M, REAR_GLASS_ASSEMBLY_DROP_M, 0);
    const d = Math.hypot(...COCKPIT_EYE_GLB.map((e, k) => e - authored[k]));
    // 60 mm along the ray, then the 14 mm assembly drop.
    const moved = [rig.position[0] - authored[0], rig.position[1] + REAR_GLASS_ASSEMBLY_DROP_M - authored[1], rig.position[2] - authored[2]];
    expect(Math.hypot(...moved)).toBeCloseTo(REAR_GLASS_LIFT_M, 12);
    for (let k = 0; k < 3; k++) {
      expect(moved[k] / REAR_GLASS_LIFT_M).toBeCloseTo((COCKPIT_EYE_GLB[k] - authored[k]) / d, 12);
    }
    expect(rig.scaleRatio).toBeCloseTo((d - REAR_GLASS_LIFT_M) / d, 12);
    // The station drop is a pure translation AFTER that: same x, z and scale.
    const dropped = rigMirrorGlass(authored, REAR_GLASS_LIFT_M, REAR_GLASS_ASSEMBLY_DROP_M, 0.0113);
    expect(dropped.position[0]).toBe(rig.position[0]);
    expect(dropped.position[2]).toBe(rig.position[2]);
    expect(dropped.scaleRatio).toBe(rig.scaleRatio);
    expect(dropped.position[1]).toBeCloseTo(rig.position[1] - 0.0113, 12);
    // A door glass (lift 0) is never moved, whatever it is handed.
    expect(rigMirrorGlass([0.905, 1.005, -0.592], 0, 0, 0)).toEqual({ position: [0.905, 1.005, -0.592], scaleRatio: 1 });
  });

  it("…which is why 105 mm of node raise delivers only ~97.4 mm at the glass (MirrorRig's own figure)", () => {
    const at = (raise: number) => rearGlassPointGlb([0, 0, 0], raise, 0)[1];
    expect((at(B58_STATION_RAISE_M) - at(0)) * 1000).toBeCloseTo(97.45, 1);
    expect((at(B58_STATION_RAISE_M) - at(B58_CLEARANCE_THRESHOLD_M)) * 1000).toBeCloseTo(11.35, 2);
  });

  it("cabinLook's REAR_MIRROR_GLASS_TOP is the rigged quad's top corner, through the mount", () => {
    const g = rearGlassPointGlb(REAR_GLASS_CORNERS[0], B58_STATION_RAISE_M, 0);
    const chassis = [-g[0], g[1] - 0.55, -g[2]];
    for (let k = 0; k < 3; k++) expect(chassis[k]).toBeCloseTo(REAR_MIRROR_GLASS_TOP[k], 4);
  });
});

describe("the camera and every narrower window are untouched", () => {
  for (const w of UNCHANGED) {
    it(`${w.id}: both drops are exactly 0 — before the cap as well as after`, () => {
      expect(cockpitHeaderDropM(w.aspect)).toBe(0);
      expect(rearMirrorStationDropUncappedM(w.aspect)).toBe(0);
      expect(rearMirrorStationDropM(w.aspect)).toBe(0);
    });
  }

  it("the drops never shrink as the window widens (no pop between shapes)", () => {
    let lastH = 0;
    let lastS = 0;
    for (let a = 1.7; a <= 2.5; a += 0.01) {
      const h = cockpitHeaderDropM(a);
      const s = rearMirrorStationDropM(a);
      expect(h).toBeGreaterThanOrEqual(lastH);
      expect(s).toBeGreaterThanOrEqual(lastS);
      lastH = h;
      lastS = s;
    }
  });

  it("answers nonsense aspects with 0 — it runs inside render and useFrame", () => {
    for (const a of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(cockpitHeaderDropM(a)).toBe(0);
      expect(rearMirrorStationDropM(a)).toBe(0);
    }
  });
});

describe("the click proxy and the DOM rail read the SAME drop the mesh carries", () => {
  it("hotspotScreenRect defaults to the SHIPPED drop, and moves by an explicit one", () => {
    for (const p of PHONES) {
      const moved = hotspotScreenRect("hotspot_mirror_rear", "forward", p.aspect)!;
      const explicit = hotspotScreenRect(
        "hotspot_mirror_rear",
        "forward",
        p.aspect,
        rearMirrorStationDropM(p.aspect),
      )!;
      expect(moved).toEqual(explicit);
      // The plumbing is alive even though the shipped cap is 0: the drop the
      // composition asks for moves the proxy down by a fifth of the stage.
      const wanted = hotspotScreenRect(
        "hotspot_mirror_rear",
        "forward",
        p.aspect,
        rearMirrorStationDropUncappedM(p.aspect),
      )!;
      expect(wanted.bottom, p.id).toBeGreaterThan(moved.bottom + 0.03);
      // …and the shipped drop really moves it: 11.3 mm is ~0.02 of the stage.
      const authored = hotspotScreenRect("hotspot_mirror_rear", "forward", p.aspect, 0)!;
      expect(moved.bottom, p.id).toBeGreaterThan(authored.bottom + 0.015);
    }
  });

  it("the «🖱 Задръж Вътрешно огледало» chip rides the SAME drop — it names the glass where it is", () => {
    // Dormant while the cap was 0; live now. VitokCockpit renders the chip at
    // `spec.pos.y + anchor.lift`, so the drop has to be IN the lift, or the
    // label hangs 11.3 mm off the control it names — the §L10 two-places defect.
    for (const p of [PHONES[0], PHONES[1]]) {
      const d = rearMirrorStationDropM(p.aspect);
      expect(d).toBeGreaterThan(0);
      const shipped = hotspotLabelPoint("hotspot_mirror_rear", "forward", p.aspect)!;
      const undropped = hotspotLabelPoint("hotspot_mirror_rear", "forward", p.aspect, 0)!;
      expect(shipped.side).toBe(undropped.side);
      expect(shipped.lift).toBeCloseTo(undropped.lift - d, 12);
      // …and the point it reports is the projection of that rendered anchor.
      const spec = { y: 0.908, z: 0.5 };
      const q = projectCockpitPoint([0, spec.y + shipped.lift, spec.z], "forward", p.aspect);
      expect(shipped.y).toBeCloseTo(1 - q.y, 12);
      // No other control's chip moves.
      expect(hotspotLabelPoint("hotspot_mirror_left", "mirrorLeft", p.aspect, 0.05)).toEqual(
        hotspotLabelPoint("hotspot_mirror_left", "mirrorLeft", p.aspect, 0),
      );
    }
  });

  it("…and moves NO other control", () => {
    for (const p of PHONES) {
      expect(hotspotScreenRect("hotspot_mirror_left", "forward", p.aspect, 0.05)).toEqual(
        hotspotScreenRect("hotspot_mirror_left", "forward", p.aspect, 0),
      );
    }
  });
});

describe("mirrorStation — what moves, and the mount stays attached", () => {
  // VitokCockpit's STALK (authored + B58's 105 mm), restated.
  const STALK = { root: { y: 0.86505 + 0.105, z: 0.15 }, tip: { y: 0.822 + 0.105, z: 0.47 } };

  it("drop 0 is the authored axis exactly — the 16:9 build does not move", () => {
    expect(reanchoredStalk(STALK, 0)).toEqual(STALK);
    const run = stalkRun(STALK, 0.06, 0.385);
    expect(run.pitch).toBeCloseTo(Math.atan2(0.04305, 0.32), 9);
  });

  it("the root stays in the roof and the mirror end follows the glass", () => {
    const d = rearMirrorStationDropM(PHONES[0].aspect);
    const moved = reanchoredStalk(STALK, d);
    expect(moved.root).toEqual(STALK.root);
    expect(moved.tip.y).toBeCloseTo(STALK.tip.y - d, 12);
  });

  it("the sleeve's front stop only GAINS clearance over the glass top as it drops", () => {
    // Sleeve underside at its front (z 0.385) = axis − 17 mm; glass top = 0.9086 − drop.
    const clearance = (d: number) =>
      stalkAxisY(reanchoredStalk(STALK, d), 0.385) - 0.017 - (REAR_MIRROR_GLASS_TOP[1] - d);
    // Asked of the drop the composition wants, not of the capped one: the shape
    // of the geometry is what this case is about, and the cap is a HUD fact.
    const d = rearMirrorStationDropUncappedM(PHONES[0].aspect);
    expect(d).toBeGreaterThan(0);
    expect(clearance(0)).toBeGreaterThan(0.01);
    expect(clearance(d)).toBeGreaterThan(clearance(0));
  });

  it("the header pad keeps its top and lowers its underside", () => {
    const shipped = headerPadSpan(0.945, 0.05, 0);
    expect(shipped.yLo).toBe(0.945);
    expect(shipped.height).toBeCloseTo(0.05, 12);
    expect(shipped.centerY).toBeCloseTo(0.945 + 0.05 / 2, 12);
    const lowered = headerPadSpan(0.945, 0.05, 0.0393);
    expect(lowered.yHi).toBe(0.995);
    expect(lowered.yLo).toBeCloseTo(0.9057, 9);
  });

  it("the casing box catches the mirror end and nothing it must not", () => {
    // The authored casing (VitokCockpit: x ±0.096, y 0.864–0.955, z 0.467–0.560).
    expect(inRearMirrorCasing(0, 0.9, 0.5)).toBe(true);
    expect(inRearMirrorCasing(0.09, 0.95, 0.55)).toBe(true);
    // The stalk's ROOT ring (z 0.149–0.151) stays in the roof.
    expect(inRearMirrorCasing(0, 0.97, 0.15)).toBe(false);
    // The overhead console (z ≤ 0.07) and the grab handles (|x| ≥ 0.688).
    expect(inRearMirrorCasing(0, 0.85, 0.06)).toBe(false);
    expect(inRearMirrorCasing(0.7, 0.9, 0.5)).toBe(false);
    expect(REAR_MIRROR_CASING_BOX.z[0]).toBeGreaterThan(0.151);
  });
});

/**
 * THE WIRING, read off the source — the layer vitest's node environment cannot
 * render. A drop that stops at a pure function is the dead-predicate class
 * this project has shipped before, so every consumer of the two drops is named
 * here, each paired with a mutation in the lane report.
 */
describe("every consumer reads the drop", () => {
  const read = (p: string) =>
    readFileSync(resolve(__dirname, "../../../../", p), "utf8");

  it("VitokCockpit: header pad, mount, casing, click proxy and the glass (via MirrorRig)", () => {
    const src = read("components/sim/vitok/VitokCockpit.tsx");
    expect(src).toContain("const headerDropM = cockpitHeaderDropM(canvasAspect);");
    expect(src).toContain("const stationDropM = rearMirrorStationDropM(canvasAspect);");
    expect(src).toContain("<CabinRoof headerDropM={headerDropM} stationDropM={stationDropM} />");
    expect(src).toContain("applyRearMirrorCasingDrop(casing, stationDropM);");
    expect(src).toContain("rearStationDropM={stationDropM}");
    expect(src).toContain("[spec.pos[0], spec.pos[1] - rearProxyDropM, spec.pos[2]]");
  });

  it("MirrorRig lowers the rear glass by it (the housing is parented into the glass)", () => {
    const src = read("components/sim/vitok/MirrorRig.tsx");
    expect(src).toContain('e.kind === "rear" ? rearStationDropM : 0,');
    expect(src).toContain("}, [entries, rearStationDropM]);");
  });

  it("CameraRig publishes the rail from the REAL canvas aspect's drop", () => {
    const src = read("components/sim/CameraRig.tsx");
    expect(src).toContain("rearMirrorStationDropM(state.size.width / Math.max(1, state.size.height)),");
  });
});
