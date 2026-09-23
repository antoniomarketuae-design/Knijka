import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cockpitVFovForAspect } from "../../vehicle/tuning";
import {
  COCKPIT_HEADER_EDGE,
  HEADER_VISIBLE_BAND,
  REAR_MIRROR_GLASS_TOP,
  REAR_MIRROR_STATION_DROP_MAX_M,
  cockpitHeaderDropM,
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
  REAR_MIRROR_CASING_BOX,
  headerPadSpan,
  inRearMirrorCasing,
  reanchoredStalk,
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
/** B58, restated from `tools/glb/raise_interior_mirror.mjs`: the station was raised
 *  105 mm against a measured occlusion threshold of 92.8 mm at the lane centre. */
const B58_STATION_RAISE_M = 0.105;
const B58_CLEARANCE_THRESHOLD_M = 0.0928;
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
      // capped, because two measured bars refuse it (see the cap's own block in
      // cabinLook.ts, and `the two bars` below).
      const wanted = rearMirrorStationDropUncappedM(p.aspect);
      expect(wanted).toBeGreaterThan(0.03);
      expect(rearMirrorStationDropM(p.aspect)).toBe(REAR_MIRROR_STATION_DROP_MAX_M);
      // What the refused drop WOULD have bought, so the cost is a number: the
      // glass would hang below the header at exactly the 16:9 offset…
      const hd = cockpitHeaderDropM(p.aspect);
      expect(glassTopFy(p.aspect, wanted)).toBeLessThan(headerFy(p.aspect, hd));
      expect(tanGap(p.aspect, hd, wanted)).toBeCloseTo(tanGap(16 / 9, 0, 0), 3);
      // …and what the cap leaves standing, which is the honest half of the row:
      // the glass top is still off the top of the frame, i.e. the housing is
      // still cut by the edge the founder photographed.
      expect(glassTopFy(p.aspect, rearMirrorStationDropM(p.aspect))).toBeGreaterThan(1);
    });
  }

  it("the numbers the lane report quotes: ~39 mm of header lands, ~36 mm of station is refused", () => {
    const iphone = PHONES[0].aspect;
    expect(cockpitHeaderDropM(iphone)).toBeCloseTo(0.0393, 3);
    expect(rearMirrorStationDropUncappedM(iphone)).toBeCloseTo(0.0364, 3);
    expect(rearMirrorStationDropM(iphone)).toBe(0);
  });

  /**
   * THE TWO BARS THAT SET THE CAP, EXECUTED RATHER THAN QUOTED. A cap written
   * as a constant with a paragraph beside it is a claim; these are the two
   * measurements the paragraph rests on, run against the shipped arithmetic, so
   * raising the constant without freeing the corridor turns this file red.
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

    it("B58's sign clearance allows 12.2 mm — the station was raised 105 for a 92.8 threshold", () => {
      expect(B58_STATION_RAISE_M - B58_CLEARANCE_THRESHOLD_M).toBeCloseTo(0.0122, 4);
      expect(B58_STATION_RAISE_M - REAR_MIRROR_STATION_DROP_MAX_M).toBeGreaterThanOrEqual(
        B58_CLEARANCE_THRESHOLD_M,
      );
    });

    it("the phone HUD allows ~0.1 mm — which is why the cap is 0", () => {
      // At the shipped cap the hint clips nothing on the handset the catalogue
      // was shot on and scrolls no more than it already did on the other two.
      const shipped = lane(REAR_MIRROR_STATION_DROP_MAX_M);
      expect(hintOverflow(HUD_STAGES[0], shipped)).toBe(0);
      expect(hintOverflow(HUD_STAGES[2], shipped)).toBeLessThan(21);
      // One millimetre of station drop already breaks the smallest stage's
      // pinned scroll, and B58's own bar breaks the handset's «clips NOTHING».
      expect(hintOverflow(HUD_STAGES[2], lane(0.001))).toBeGreaterThan(21);
      expect(hintOverflow(HUD_STAGES[0], lane(0.0122))).toBeGreaterThan(0);
      // …and the composition-true drop puts a card floor INSIDE the hazard band:
      // the peek card cannot paint shorter than its own chrome (106 px — the chip
      // row, the three-line window, the shrunken control row and two gaps, derived
      // from the source in hud-off-the-road.test.ts), and that floor is not
      // bounded by the column's ceiling.
      const stage = HUD_STAGES[1];
      const fullTop =
        stage.height * lane(rearMirrorStationDropUncappedM(PHONES[0].aspect)) +
        NOTIFY_COLUMN_MIRROR_GUTTER_PX;
      const shippedTop =
        stage.height * lane(REAR_MIRROR_STATION_DROP_MAX_M) + NOTIFY_COLUMN_MIRROR_GUTTER_PX;
      expect((fullTop + PEEK_CARD_CHROME_PX) / stage.height).toBeGreaterThan(
        HAZARD_BAND_TOP_FRACTION,
      );
      expect((shippedTop + PEEK_CARD_CHROME_PX) / stage.height).toBeLessThan(
        HAZARD_BAND_TOP_FRACTION,
      );
    });
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
      expect(wanted.bottom, p.id).toBeGreaterThan(moved.bottom + 0.045);
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
    expect(src).toContain('if (e.kind === "rear" && rearStationDropM > 0) e.mesh.position.y -= rearStationDropM;');
    expect(src).toContain("}, [entries, rearStationDropM]);");
  });

  it("CameraRig publishes the rail from the REAL canvas aspect's drop", () => {
    const src = read("components/sim/CameraRig.tsx");
    expect(src).toContain("rearMirrorStationDropM(state.size.width / Math.max(1, state.size.height)),");
  });
});
