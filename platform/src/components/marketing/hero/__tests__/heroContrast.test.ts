/**
 * The test that would have caught it.
 *
 * The pre-rendered dusk loop shipped a 0.32-luminance sky band behind the
 * landing page's subhead on a phone, at 1.96 : 1 against a required 4.5 — and
 * every existing test passed, because the scrim was a template literal and its
 * WCAG claim was a comment. Nothing connected the gradient to the ratio it was
 * supposed to guarantee.
 *
 * So these cases are written against the WORST backdrop the hero can put under
 * the copy rather than against the scrim's own numbers: change a stop and the
 * failure is a contrast ratio, not a diff. The desktop composition is pinned
 * separately and exactly, because it is the one the founder has already signed
 * off and this change was not allowed to move it.
 */

import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  HERO_COPY_BAND,
  HERO_FOREGROUND,
  HERO_LOOP_ASPHALT_LUMINANCE,
  HERO_LOOP_MARK_LUMINANCE,
  HERO_DESKTOP_HEADLINE_COLUMN,
  HERO_DESKTOP_SUBHEAD_COLUMN,
  HERO_DESKTOP_SUBHEAD_ROWS,
  HERO_LOOP_DESKTOP_HEADLINE_BACKDROP,
  HERO_LOOP_DESKTOP_HEADLINE_PEAK,
  HERO_LOOP_DESKTOP_HORIZON,
  HERO_LOOP_DESKTOP_SUBHEAD_BACKDROP,
  HERO_LOOP_DESKTOP_SUBHEAD_PEAK,
  HERO_LOOP_DESKTOP_SUBHEAD_PEAK_GRADED,
  HERO_LOOP_GRADE_WIDE,
  HERO_LOOP_SKY_LUMINANCE,
  HERO_LOOP_SKY_PEAK_LUMINANCE,
  HERO_MUTED,
  HERO_PLATE_DESKTOP_HEADLINE_PEAK,
  HERO_SCRIM_NARROW,
  HERO_SCRIM_WIDE,
  relativeLuminance,
  scrimAlphaAt,
  SCRIM_LOOP_WIDE_VERTICAL,
  SCRIM_RGB,
  scrimmedLuminance,
  SCRIM_NARROW_VERTICAL,
  SCRIM_WIDE_BOTTOM,
  SCRIM_WIDE_HORIZONTAL,
  SCRIM_WIDE_TOP,
  stackedAlpha,
  WCAG_AA_BODY,
  WCAG_AA_LARGE,
} from "../heroContrast";
import { HeroLoopGrade } from "../HeroLoopVideo";
import { LiveHero } from "../LiveHero";

const MUTED_L = relativeLuminance(HERO_MUTED);
const FOREGROUND_L = relativeLuminance(HERO_FOREGROUND);

/** Contrast of a text token over the loop's sky, seen through the phone scrim. */
function throughNarrowScrim(textLuminance: number, backdrop: number, atFraction: number) {
  const alpha = scrimAlphaAt(SCRIM_NARROW_VERTICAL, atFraction);
  return contrastRatio(textLuminance, scrimmedLuminance(backdrop, alpha));
}

describe("the maths itself", () => {
  it("agrees with WCAG's worked examples", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    // Black on white is the canonical 21 : 1.
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 6);
  });

  it("round-trips sRGB through luminance", () => {
    // scrimmedLuminance at alpha 0 must be the identity, or every ratio below
    // is measuring the model rather than the design.
    expect(scrimmedLuminance(0.32, 0)).toBeCloseTo(0.32, 6);
    expect(scrimmedLuminance(0.32, 1)).toBeCloseTo(0, 6);
  });

  it("composites in sRGB, not in linear light", () => {
    // The whole reason 0.78 is enough: sRGB compositing is strongly
    // nonlinear, so a 78 % alpha removes ~95 % of the luminance. A linear-light
    // model would have said 0.78 → 0.070 and sent someone hunting for a
    // heavier scrim than the picture can survive.
    expect(scrimmedLuminance(0.32, 0.78)).toBeLessThan(0.32 * 0.22);
    expect(scrimmedLuminance(0.32, 0.78)).toBeCloseTo(0.0155, 3);
  });

  it("interpolates gradient stops the way CSS does", () => {
    expect(scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, 0)).toBeCloseTo(0.9, 6);
    expect(scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, 0.34)).toBeCloseTo(0.62, 6);
    // Halfway between the 0.34 and 0.64 stops.
    expect(scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, 0.49)).toBeCloseTo(0.37, 6);
    // Clamped past the last stop, not extrapolated to a negative alpha.
    expect(scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, 1)).toBe(0);
  });

  it("stacks layers multiplicatively", () => {
    expect(stackedAlpha([0.5, 0.5])).toBeCloseTo(0.75, 6);
    expect(stackedAlpha([0])).toBe(0);
  });
});

describe("the phone — the regression this file exists for", () => {
  it("keeps body copy over the loop's sky at WCAG AA, everywhere the copy is", () => {
    // Sampled across the whole copy band rather than at its midpoint: the bug
    // was a gradient that held at one end and released at the other.
    for (let f = HERO_COPY_BAND.from; f <= HERO_COPY_BAND.to + 1e-9; f += 0.01) {
      const ratio = throughNarrowScrim(MUTED_L, HERO_LOOP_SKY_LUMINANCE, f);
      expect(ratio, `--muted over the sky at ${(f * 100).toFixed(0)}% of the hero`).toBeGreaterThan(
        WCAG_AA_BODY,
      );
    }
  });

  it("holds against the sky's PEAK, not just its average", () => {
    // A floor that only survives the mean is not a floor — the brightest
    // pixels are where a line of text actually becomes unreadable.
    for (let f = HERO_COPY_BAND.from; f <= HERO_COPY_BAND.to + 1e-9; f += 0.01) {
      expect(
        throughNarrowScrim(MUTED_L, HERO_LOOP_SKY_PEAK_LUMINANCE, f),
        `--muted over the sky peak at ${(f * 100).toFixed(0)}%`,
      ).toBeGreaterThan(WCAG_AA_BODY);
    }
  });

  it("clears the large-text bar for the headline with room to spare", () => {
    // The h1 is `--foreground`; large text needs 3 : 1. It should not be close.
    for (let f = 0.19; f <= 0.43; f += 0.01) {
      expect(throughNarrowScrim(FOREGROUND_L, HERO_LOOP_SKY_PEAK_LUMINANCE, f)).toBeGreaterThan(
        WCAG_AA_LARGE * 3,
      );
    }
  });

  it("would have FAILED on the desktop scrim — the bug, reproduced", () => {
    // The old code painted SCRIM_WIDE at every width. On a phone the copy runs
    // the full width, so the horizontal gradient's transparent end (past 82 %)
    // is under the right-hand end of every line. This is the 1.96 : 1 that was
    // measured on the real page.
    const alphaAtLineEnd = scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, 0.95);
    expect(alphaAtLineEnd).toBe(0);
    const ratio = contrastRatio(
      MUTED_L,
      scrimmedLuminance(HERO_LOOP_SKY_LUMINANCE, alphaAtLineEnd),
    );
    expect(ratio).toBeLessThan(2);
    expect(ratio).toBeLessThan(WCAG_AA_BODY);
  });

  it("leaves the road legible as MOTION — the point of shipping a video", () => {
    // Below the copy the scrim releases, and it has to: the streaming lane
    // dashes are the only thing in the phone's crop with local contrast, so if
    // the scrim flattens them the loop plays and the hero still reads as a
    // still. The founder's complaint was exactly that.
    //
    // Note the metric. A dash on asphalt is 0.10 against 0.003, which WCAG's
    // formula scores at only 2.83 : 1 unscrimmed — its +0.05 floor compresses
    // everything this dark. So the test is not "clear some absolute bar", it
    // is "keep most of the contrast that is actually there".
    const roadAt = 0.78;
    const alpha = scrimAlphaAt(SCRIM_NARROW_VERTICAL, roadAt);
    const ratioAt = (a: number) =>
      contrastRatio(
        scrimmedLuminance(HERO_LOOP_MARK_LUMINANCE, a),
        scrimmedLuminance(HERO_LOOP_ASPHALT_LUMINANCE, a),
      );

    const unscrimmed = ratioAt(0);
    expect(ratioAt(alpha) / unscrimmed).toBeGreaterThan(0.8);

    // And the comparison that is the actual regression: at this same height
    // the desktop scrim — which used to be painted here too — stacks its
    // left-hand 0.65 with its bottom-up 0.32 and lands near 0.76 alpha, which
    // takes the dash and the asphalt to within 1.14 : 1 of each other. That is
    // a video playing behind a photograph.
    const oldAlpha = stackedAlpha([
      scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, 0.3),
      scrimAlphaAt(SCRIM_WIDE_BOTTOM, 1 - roadAt),
    ]);
    expect(oldAlpha).toBeGreaterThan(0.7);
    expect(ratioAt(oldAlpha)).toBeLessThan(1.2);
    expect(ratioAt(alpha)).toBeGreaterThan(ratioAt(oldAlpha) * 1.9);
  });

  it("never fully clears — a bare sky under the header would be a hole", () => {
    for (let f = 0; f <= 1 + 1e-9; f += 0.02) {
      expect(scrimAlphaAt(SCRIM_NARROW_VERTICAL, f)).toBeGreaterThan(0.1);
    }
  });
});

describe("the desktop composition — unchanged, and pinned so it stays that way", () => {
  it("emits exactly the three gradients that shipped", () => {
    expect(HERO_SCRIM_WIDE).toBe(
      "linear-gradient(90deg, rgba(4,6,11,0.9) 0%, rgba(4,6,11,0.62) 34%, rgba(4,6,11,0.12) 64%, rgba(4,6,11,0) 82%), " +
        "linear-gradient(0deg, rgba(4,6,11,0.75) 0%, rgba(4,6,11,0) 38%), " +
        "linear-gradient(180deg, rgba(4,6,11,0.62) 0%, rgba(4,6,11,0) 26%)",
    );
  });

  it("keeps every stop the founder signed off, to the digit", () => {
    // The exact-string check above is the guarantee; these are the tables it
    // is built from, pinned separately so a "harmless tidy-up" of the data
    // cannot pass by also updating the expected string.
    expect(SCRIM_WIDE_HORIZONTAL).toEqual([
      { at: 0, alpha: 0.9 },
      { at: 0.34, alpha: 0.62 },
      { at: 0.64, alpha: 0.12 },
      { at: 0.82, alpha: 0 },
    ]);
    expect(SCRIM_WIDE_BOTTOM).toEqual([
      { at: 0, alpha: 0.75 },
      { at: 0.38, alpha: 0 },
    ]);
    expect(SCRIM_WIDE_TOP).toEqual([
      { at: 0, alpha: 0.62 },
      { at: 0.26, alpha: 0 },
    ]);
  });

  it("still carries the desktop copy over the loop, each block on its own token", () => {
    // Measured at 1440 × 900 with the loop forced on — the real desktop
    // fallback path, a machine that fails the WebGL probe but passes the loop
    // door. The headline straddles the video's horizon and is `--foreground`
    // at large-text size; the subhead is below it, on road, and is `--muted`
    // at body size. Pairing either one with the other's token (which an
    // earlier draft of this test did) measures nothing that is on the screen.
    for (
      let f = HERO_DESKTOP_HEADLINE_COLUMN.from;
      f <= HERO_DESKTOP_HEADLINE_COLUMN.to + 1e-9;
      f += 0.01
    ) {
      const alpha = scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, f);
      expect(
        contrastRatio(FOREGROUND_L, scrimmedLuminance(HERO_LOOP_DESKTOP_HEADLINE_BACKDROP, alpha)),
        `--foreground at ${(f * 100).toFixed(0)}% across the desktop headline`,
      ).toBeGreaterThan(WCAG_AA_LARGE);
    }

    for (
      let f = HERO_DESKTOP_SUBHEAD_COLUMN.from;
      f <= HERO_DESKTOP_SUBHEAD_COLUMN.to + 1e-9;
      f += 0.01
    ) {
      const alpha = scrimAlphaAt(SCRIM_WIDE_HORIZONTAL, f);
      expect(
        contrastRatio(MUTED_L, scrimmedLuminance(HERO_LOOP_DESKTOP_SUBHEAD_BACKDROP, alpha)),
        `--muted at ${(f * 100).toFixed(0)}% across the desktop subhead`,
      ).toBeGreaterThan(WCAG_AA_BODY);
    }
  });
});

describe("the desktop LOOP — the rung that did not exist when the two above were written", () => {
  /**
   * A desktop that fails the WebGL probe used to get the still plate and now
   * gets the video. Every number below is from one sweep: 1440 × 900, WebGL
   * denied, copy layer hidden, sampling the whole 7.2 s loop rather than a
   * frame — the peak is a moving object, so a single capture measures whatever
   * it happened to catch.
   */
  /** Both peaks are recorded ALREADY composited, so no scrim maths is owed. */
  const mutedOver = (composited: number) => contrastRatio(MUTED_L, composited);

  it("reproduces the defect: the loop's PEAK fails AA where the plate's did not", () => {
    // Means were never the problem — the loop's road is darker than the
    // drawing's, so the subhead's average backdrop actually improved.
    expect(contrastRatio(MUTED_L, HERO_LOOP_DESKTOP_SUBHEAD_BACKDROP)).toBeGreaterThan(
      WCAG_AA_BODY,
    );
    // The peak is the whole defect: the lead car's light bar, a near-white
    // specular that sweeps to x ≈ 683 while the subhead's middle line runs to
    // x ≈ 742. 1.18 : 1 against a required 4.5.
    expect(mutedOver(HERO_LOOP_DESKTOP_SUBHEAD_PEAK)).toBeLessThan(1.3);
    expect(mutedOver(HERO_LOOP_DESKTOP_SUBHEAD_PEAK)).toBeLessThan(WCAG_AA_BODY);
  });

  it("clears AA at that peak once the loop's own grade is painted", () => {
    expect(mutedOver(HERO_LOOP_DESKTOP_SUBHEAD_PEAK_GRADED)).toBeGreaterThan(WCAG_AA_BODY);
  });

  it("holds the grade's full alpha across every row the subhead occupies", () => {
    // This is the link between the measured number above and the data that
    // produces it: the 0.0331 was captured with the peak alpha over the whole
    // block, so a stop that drops anywhere inside it invalidates the capture.
    for (let f = HERO_DESKTOP_SUBHEAD_ROWS.from; f <= HERO_DESKTOP_SUBHEAD_ROWS.to + 1e-9; f += 0.005) {
      expect(
        scrimAlphaAt(SCRIM_LOOP_WIDE_VERTICAL, f),
        `loop grade at ${(f * 100).toFixed(1)}% of the section`,
      ).toBeCloseTo(0.72, 6);
    }
  });

  it("costs the picture nothing above the horizon or on the near road", () => {
    // The grade is bounded, and both bounds are load-bearing. Above: the
    // sunset band, which is the only thing in this shot anyone looks at.
    // Below: the streaming lane dashes, the only moving thing in the frame and
    // the entire reason a video rung exists. Measured, both regions come out
    // bit-identical with and without this layer — these assertions are what
    // keeps that true.
    // The ramp starts ON the measured horizon, not near it. Pinned as an
    // identity because the two live in different sections of the module and
    // there is nothing else stopping them drifting apart.
    expect(SCRIM_LOOP_WIDE_VERTICAL[0].at).toBe(HERO_LOOP_DESKTOP_HORIZON);
    expect(scrimAlphaAt(SCRIM_LOOP_WIDE_VERTICAL, HERO_LOOP_DESKTOP_HORIZON)).toBe(0);
    for (let f = 0; f <= HERO_LOOP_DESKTOP_HORIZON; f += 0.02) {
      expect(scrimAlphaAt(SCRIM_LOOP_WIDE_VERTICAL, f), `grade at ${f}`).toBe(0);
    }
    for (let f = 0.74; f <= 1 + 1e-9; f += 0.02) {
      expect(scrimAlphaAt(SCRIM_LOOP_WIDE_VERTICAL, f), `grade at ${f}`).toBe(0);
    }
  });

  it("leaves the sky alone because the sky was measured and PASSES", () => {
    // The headline straddles the horizon on `--foreground` at large-text size,
    // where AA is 3 : 1. The loop's worst pixel there is worse than the
    // plate's and still clears the bar, so grading the sunset would buy
    // nothing. If a future loop makes this fail, this test is where it shows.
    expect(contrastRatio(FOREGROUND_L, HERO_PLATE_DESKTOP_HEADLINE_PEAK)).toBeGreaterThan(
      WCAG_AA_LARGE,
    );
    expect(contrastRatio(FOREGROUND_L, HERO_LOOP_DESKTOP_HEADLINE_PEAK)).toBeGreaterThan(
      WCAG_AA_LARGE,
    );
    expect(contrastRatio(FOREGROUND_L, HERO_LOOP_DESKTOP_HEADLINE_PEAK)).toBeLessThan(
      contrastRatio(FOREGROUND_L, HERO_PLATE_DESKTOP_HEADLINE_PEAK),
    );
  });

  it("records the MEASURED graded peak, not the grey model's prediction", () => {
    // scrimmedLuminance treats a backdrop as the neutral grey of equal
    // luminance. That is right for the dusk sky it was written for and
    // OPTIMISTIC for a near-white specular: sRGB's 2.4 exponent is convex, so
    // a spread of channels survives a multiply better than a grey does. The
    // model says 0.0219, the pixels say 0.0331 — a 34 % error in the unsafe
    // direction. Pinning the gap is what stops the constant being "simplified"
    // into the cheaper computation.
    const predicted = scrimmedLuminance(HERO_LOOP_DESKTOP_SUBHEAD_PEAK, 0.72);
    expect(predicted).toBeLessThan(HERO_LOOP_DESKTOP_SUBHEAD_PEAK_GRADED);
    expect(HERO_LOOP_DESKTOP_SUBHEAD_PEAK_GRADED / predicted).toBeGreaterThan(1.2);
  });

  it("does not touch the plate or the live scene", () => {
    // The whole argument for a fourth layer instead of a heavier
    // SCRIM_WIDE_HORIZONTAL. The two exact-string cases above already pin the
    // shipped desktop gradient; this states the consequence — the grade is not
    // part of it, so the live-3D render is unchanged.
    expect(HERO_SCRIM_WIDE).not.toContain(HERO_LOOP_GRADE_WIDE);
    expect(HERO_SCRIM_NARROW).not.toContain(HERO_LOOP_GRADE_WIDE);
  });
});

describe("the CSS the component actually paints", () => {
  it("builds one gradient for the phone and three for the desktop", () => {
    expect(HERO_SCRIM_NARROW.match(/linear-gradient/g)).toHaveLength(1);
    expect(HERO_SCRIM_WIDE.match(/linear-gradient/g)).toHaveLength(3);
    // And one for the loop's own grade, which is a fourth layer on the desktop
    // rung rather than a fourth gradient inside HERO_SCRIM_WIDE — see
    // SCRIM_LOOP_WIDE_VERTICAL for why that distinction is the fix.
    expect(HERO_LOOP_GRADE_WIDE.match(/linear-gradient/g)).toHaveLength(1);
  });

  it("emits valid, ordered percentage stops", () => {
    for (const css of [HERO_SCRIM_NARROW, HERO_SCRIM_WIDE, HERO_LOOP_GRADE_WIDE]) {
      for (const layer of css.split(/,\s*(?=linear-gradient)/)) {
        const stops = [...layer.matchAll(/rgba\(4,6,11,([\d.]+)\)\s+([\d.]+)%/g)];
        expect(stops.length).toBeGreaterThan(1);
        let previous = -1;
        for (const [, alpha, at] of stops) {
          expect(Number(alpha)).toBeGreaterThanOrEqual(0);
          expect(Number(alpha)).toBeLessThanOrEqual(1);
          expect(Number(at)).toBeGreaterThanOrEqual(previous);
          previous = Number(at);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// …and that the component actually paints it
// ---------------------------------------------------------------------------

/**
 * Everything above proves the NUMBERS are right. None of it would notice if
 * LiveHero went back to painting the desktop gradient at every width — which
 * is exactly the bug, so it needs its own guard.
 *
 * There is no jsdom in this project (heroCapability.ts / heroScene.ts are pure
 * by design and the suite is plain Node), and adding a DOM renderer to check
 * two class names would be a heavy dependency for a light question. LiveHero
 * uses no hooks and no context — it is a Server Component that returns markup
 * — so calling it gives back a React element tree that can be walked as plain
 * data. No renderer, no DOM, no new dependency.
 */
describe("LiveHero paints both compositions", () => {
  interface ElementLike {
    props?: { children?: unknown; className?: string; style?: { background?: string } };
  }

  /** Every element in the tree, depth-first. */
  function flatten(node: unknown, out: ElementLike[] = []): ElementLike[] {
    if (Array.isArray(node)) {
      for (const child of node) flatten(child, out);
      return out;
    }
    if (!node || typeof node !== "object") return out;
    const el = node as ElementLike;
    out.push(el);
    if (el.props && "children" in el.props) flatten(el.props.children, out);
    return out;
  }

  // Matched on the scrim COLOUR, not on "linear-gradient": layer 2b's two
  // join gradients are also linear-gradients, but they resolve to
  // `var(--background)` and exist to end the section into the page rather than
  // to buy contrast.
  const scrims = flatten(LiveHero({ children: null })).filter((el) =>
    el.props?.style?.background?.includes(`rgba(${SCRIM_RGB}`),
  );

  it("renders exactly two scrim layers", () => {
    expect(scrims).toHaveLength(2);
  });

  it("hides the phone's scrim above lg and the desktop's below it", () => {
    const narrow = scrims.find((el) => el.props?.style?.background === HERO_SCRIM_NARROW);
    const wide = scrims.find((el) => el.props?.style?.background === HERO_SCRIM_WIDE);
    expect(narrow, "the phone scrim is not painted at all").toBeDefined();
    expect(wide, "the desktop scrim is not painted at all").toBeDefined();

    // Exactly one is visible at any width, and each is the right one.
    expect(narrow?.props?.className).toContain("lg:hidden");
    expect(wide?.props?.className).toContain("hidden");
    expect(wide?.props?.className).toContain("lg:block");
  });

  it("keeps both scrims under the copy and over the picture", () => {
    // z-10 is the plate's and the stage's layer; the copy is z-20. A scrim
    // that drifted above the copy would dim the text it exists to protect.
    for (const scrim of scrims) {
      expect(scrim.props?.className).toContain("z-10");
      expect(scrim.props?.className).toContain("pointer-events-none");
    }
  });

  /**
   * The loop's grade is painted by HeroLoopVideo, not by LiveHero, and that
   * placement IS the fix — inside the band it inherits the crossfade, so a
   * refused autoplay or a 404 takes the dark band away with the video instead
   * of leaving it over the plate. HeroLoopVideo itself uses hooks and cannot be
   * called this way, so the grade is its own hook-free component for exactly
   * the reason LiveHero can be called: it is markup, and markup is data.
   */
  it("paints the loop's grade at lg only, and from the measured table", () => {
    const grade = HeroLoopGrade() as ElementLike;
    expect(grade.props?.style?.background).toBe(HERO_LOOP_GRADE_WIDE);
    // Same width rule as the two scrims: it answers a question only the
    // desktop composition asks, and below `lg` it would land on the phone
    // scrim's road release and re-crush the lane dashes.
    expect(grade.props?.className).toContain("hidden");
    expect(grade.props?.className).toContain("lg:block");
    expect(grade.props?.className).toContain("pointer-events-none");
    // No z-index: it must stay inside the band's own painting order, under
    // LiveHero's scrim and far under the copy.
    expect(grade.props?.className).not.toContain("z-");
  });
});
