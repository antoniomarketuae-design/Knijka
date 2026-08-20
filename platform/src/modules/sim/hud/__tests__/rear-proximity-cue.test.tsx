/**
 * =============================================================================
 * THE REAR-PROXIMITY BADGE — THE SURFACE, NOT THE FOLD.
 *
 * `rear-proximity.test.ts` beside this file proves `stepRearCue`, which is the
 * arithmetic. Nothing proved the SURFACE: not the markup a student reads, not
 * the name every probe in this project resolves an owner by, and not the seam
 * between „what the world reports" and „what the badge says". That gap is how
 * finding O53 („the rear-proximity badge is hidden by the shadow transport")
 * survived a full round — the claim was read off a stale comment in the
 * component's own header, the mechanism was false, and the row was then owned
 * and silently dropped without either file being opened.
 *
 * So this file asserts the three things that were actually wrong or actually
 * unproved, and each one is written so that the defect it guards makes it red:
 *
 *   1. THE NAME. The badge carried no `data-hud`, so every overlap probe in
 *      `tools/mobile` (all of which resolve an owner with
 *      `closest("[data-hud]")`) read straight through it and every arbitration
 *      rule in `PlayAreaStyles` was unable to select it. Third instance of that
 *      failure in this repo after the ribbon legend and the objective banner.
 *
 *   2. O53 ITSELF, REFUTED AND PINNED. The deck is overridden in four states
 *      and centred in none of them, so it cannot be over this badge. Pinned as
 *      a test so the same false row cannot be re-filed off the same stylesheet.
 *
 *   3. BOTH DIRECTIONS OF THE WARNING, which is the row that matters to a
 *      seventeen-year-old: a reversing student genuinely close to something IS
 *      warned, and one who is not is NOT. Proving it at the component seam is
 *      what makes the parking-family silence provably the SOURCE's blindness
 *      (`rearGapFor` sweeps `this.vehicles`, and a parked bay occupant is an
 *      `ObstacleRect2D`, not a vehicle) rather than this component's.
 *
 * THE GEOMETRY BLOCK CARRIES ITS OWN SELF-CHECK, and it is not decoration.
 * Every „0 defects" instrument in this project has failed in the reassuring
 * direction, so the pad model here is first required to REPRODUCE a number
 * somebody verified by eye — `TouchControls`' recorded WebKit measurement of a
 * chip of this size at this floor on an iPhone 16 in portrait, „wheel 981 px²,
 * throttle 363 px²". If the model cannot land on those two figures it is the
 * model that is wrong, and the block goes red before it is allowed to assert
 * anything else.
 * =============================================================================
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RearProximityBadge, type RearCuePose, type RearGapSource } from "../RearProximityCue";
import { rearCueLabelBg, stepRearCue, type RearCue } from "../rearProximity";
import { rearGapFor } from "../../traffic/system";
import { PlayAreaStyles } from "../../../../components/sim/lesson-ui/PlayAreaStyles";
import { ROOMY_HUD_FLOOR_PX } from "../../../../components/sim/lesson-ui/immersive";
import {
  padCorridorPx,
  padRectPx,
  touchControlsFloorPx,
  type StageBox,
} from "../../../../components/sim/TouchControls";

/** The badge markup for a given cue — what actually reaches the glass. */
function badgeMarkup(cue: RearCue): string {
  return renderToStaticMarkup(<RearProximityBadge cue={cue} />);
}

// ───────────────────────────────────────────────────────────────────────────
// 1 · THE NAME, AND THE CASCADE THAT DEPENDS ON IT
// ───────────────────────────────────────────────────────────────────────────

describe("the badge is a NAMED surface", () => {
  it('carries data-hud="rear-proximity" on its positioned box', () => {
    // MUTATION THAT PROVES THIS: delete the `data-hud` attribute from
    // RearProximityCue's wrapper — the state this file shipped in until this
    // row — and this assertion fails. That attribute is the whole reason a
    // `closest("[data-hud]")` probe can see the badge and the whole reason
    // PlayAreaStyles can ever be given a selector for it.
    expect(badgeMarkup({ level: "warn", meters: 6 })).toContain('data-hud="rear-proximity"');
  });

  it("puts its floor in a CLASS, never an inline style", () => {
    // Not a style nit. `PlayAreaStyles` is an unlayered <style> while
    // Tailwind's utilities are layered, so a rule there beats the class with no
    // `!important` — but an INLINE declaration outranks every selector in every
    // stylesheet. That trap has cost this project four separate rules that read
    // as correct and changed nothing (the ribbon legend's `bottom`, the
    // notification column's `top`, the keyboard legend's 65 % cap, the flank
    // lane), each one found only by re-measuring. Moving this badge's `bottom`
    // into `style={{…}}` would make the compact floor rule — the one the row
    // below routes — silently inert on the day someone writes it.
    //
    // MUTATION: move `bottom-[6.75rem]` from `className` into a `style` prop;
    // the first expectation fails. Weakening it to "the markup mentions 6.75rem
    // somewhere" would pass under that mutation, which is why it is written
    // against the class list and the style attribute separately.
    const markup = badgeMarkup({ level: "info", meters: 12 });
    expect(markup).toMatch(/class="[^"]*\bbottom-\[6\.75rem\][^"]*"/);
    const styleAttrs = markup.match(/style="[^"]*"/g) ?? [];
    for (const attr of styleAttrs) expect(attr).not.toMatch(/\bbottom\s*:/);
  });

  it("stands on the published roomy floor, which is where 108 px is correct", () => {
    // `ROOMY_HUD_FLOOR_PX` is 108 and 6.75rem is 108 px. This is an identity
    // between two files, asserted so that shrinking the instrument band in
    // `immersive.ts` cannot leave this badge floating at a number nobody
    // maintains any more. MUTATION: change ROOMY_HUD_FLOOR_PX to 96 without
    // touching the badge → red, which is exactly the drift we want reported.
    expect(ROOMY_HUD_FLOOR_PX / 16).toBe(6.75);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · O53, REFUTED AND PINNED
// ───────────────────────────────────────────────────────────────────────────

/**
 * The SHIPPED stylesheet with its prose removed.
 *
 * Comments are part of the same template literal as the rules, and this file's
 * prose quotes CSS constantly — including, at the rear-proximity block, the
 * exact rule that is deliberately NOT shipped. An assertion read against the
 * raw string would be satisfied by a paragraph ABOUT a rule, which is the
 * failure mode `scripts/tools-tests.mjs` strips comments to avoid („so prose
 * about the rule cannot satisfy the rule"). Same discipline here.
 */
function shippedCss(): string {
  return renderToStaticMarkup(<PlayAreaStyles />).replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The declaration bodies of every rule that POSITIONS the deck element itself.
 *
 * Two kinds of rule are deliberately excluded, and both would otherwise make
 * the „every state pins a horizontal edge" assertion below a red test about
 * nothing: rules targeting a DESCENDANT of the deck (`[data-hud="deck-caption"]`
 * and its `> div`, which paint the caption and never place the panel), and the
 * two `visibility: hidden` stand-downs, which change no geometry at all.
 */
function deckBlocks(css: string): string[] {
  const out: string[] = [];
  const re = /(\[data-hud="demo-deck"\][^{}]*)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    const [, selectorTail, body] = m;
    if (/\[data-hud="(?!demo-deck)/.test(selectorTail)) continue; // a descendant
    if (!/\b(top|bottom|left|right|width):/.test(body)) continue; // not a placement
    out.push(body);
  }
  return out;
}

describe("O53 · the demonstration deck is not over this badge", () => {
  const css = shippedCss();

  it("never centres the deck — in any of its four states", () => {
    // O53's whole mechanism was „both are bottom-[6.75rem] left-1/2
    // -translate-x-1/2, therefore the deck covers the badge". The deck's
    // Tailwind classes still say that; the SHIPPED CASCADE does not, and the
    // cascade is what renders. Read off the stylesheet rather than the classes,
    // which is the read the original finding never did.
    //
    // MUTATION: add `left: 50%` to any `[data-hud="demo-deck"]` block in
    // PlayAreaStyles → red. That is the exact edit that would make O53 true
    // again, so this is the assertion that keeps it false. Scoped to the deck's
    // OWN blocks: `left: 50%` is legitimate elsewhere in this stylesheet (the
    // `[data-hud-close]::before` 44 px hit target centres itself that way), and
    // a file-wide match would be a red test about an unrelated control.
    const blocks = deckBlocks(css);
    expect(blocks.length).toBeGreaterThanOrEqual(4); // the four states
    for (const body of blocks) expect(body).not.toMatch(/left:\s*50%/);

    // …and the base rule cancels BOTH centring properties. Tailwind v4 compiles
    // `-translate-x-1/2` to the independent `translate` property, so a rule that
    // only clears `transform` reads as correct and still renders the panel half
    // its own width off. PlayAreaStyles records that costing a deploy.
    const base = blocks[0];
    expect(base).toMatch(/\bleft:\s*auto/);
    expect(base).toMatch(/\btranslate:\s*none/);
    expect(base).toMatch(/\btransform:\s*none/);

    // Every state pins a horizontal edge of its own, which is the positive form
    // of „it is never centred" — a deck that declared neither would fall back
    // to the class list O53 read, and this would go red.
    for (const body of blocks) expect(body).toMatch(/\b(left|right):/);
  });

  it("has no positional rule that could move the badge — because none is shipped", () => {
    // The other half of the refutation, and the half that made O53 impossible
    // to implement as written: PlayAreaStyles was asked to lift this badge and
    // owns no declaration for it. Naming the surface (row 1) is what makes such
    // a rule POSSIBLE; it is deliberately not written yet, and the reason is
    // measured at the rule site — at TOUCH_CONTROLS_FLOOR the badge lands
    // 848 px² under the compact-portrait deck's collapsed pill and entirely
    // inside its open panel, i.e. it would CREATE the occlusion O53 alleged.
    //
    // MUTATION: ship that rule → red, and the reader is sent to the block that
    // explains why it must not be shipped bare.
    const declaring = css.match(/\[data-hud="rear-proximity"\]\s*\{/g) ?? [];
    expect(declaring).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · THE BAND ARITHMETIC — WITH ITS OWN HONESTY GATE FIRST
// ───────────────────────────────────────────────────────────────────────────

/** The six profiles doc 91 measures on, as the stage box after the shell's p-2. */
const LADDER: readonly (StageBox & { id: string; portrait: boolean })[] = [
  { id: "iphone16-portrait", portrait: true, width: 377, height: 836, insetBottom: 34 },
  { id: "iphone16-landscape", portrait: false, width: 836, height: 377, insetBottom: 21 },
  { id: "small-portrait", portrait: true, width: 344, height: 764, insetBottom: 0 },
  { id: "small-landscape", portrait: false, width: 764, height: 344, insetBottom: 0 },
  { id: "galaxy-portrait", portrait: true, width: 344, height: 764, insetBottom: 24 },
  { id: "galaxy-landscape", portrait: false, width: 764, height: 344, insetBottom: 24 },
];

/** The chip, as WebKit laid it out: the pill width/height this file's numbers
 *  were all measured against (PlayAreaStyles quotes 134.2 × 26.5 repeatedly). */
const CHIP_W = 134.2;
const CHIP_H = 26.5;

/** Area of the intersection of two rects, px². */
function overlapPx2(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** A centred chip standing on `floorPx`, as a stage rect. */
function chipAt(floorPx: number, stage: StageBox) {
  return {
    x: stage.width / 2 - CHIP_W / 2,
    y: stage.height - floorPx - CHIP_H,
    w: CHIP_W,
    h: CHIP_H,
  };
}

describe("the thumb band · the model must first reproduce a frame read by eye", () => {
  it("SELF-CHECK: lands on TouchControls' recorded 981 / 363 px² at 108 px", () => {
    // THE GATE. `TouchControls` records, from WebKit on an iPhone 16 in
    // portrait: „at 108px (bottom-[6.75rem], the roomy floor) wheel 981px²,
    // throttle 363px²". Those two numbers were read off a real frame. If the
    // pure-geometry model below cannot reproduce them, the model is wrong and
    // every number this file goes on to assert is worthless — so it is checked
    // BEFORE anything else and the tolerance is a pixel of text metrics, not a
    // fudge factor.
    //
    // This is the rule the project bought with four instruments that all lied
    // in the reassuring direction (a scrollWidth probe blind to vertical
    // clipping, a parser anchored on /id:/, a speed probe reading the limit
    // sign, a safe-area probe on a phone with no notch). A probe that cannot
    // miss cannot be trusted; this one can, and here is where it would.
    //
    // IT IS SOLVED TWO WAYS RATHER THAN COMPARED WITH A TOLERANCE, because a
    // loose tolerance is how a wrong model passes. The chip's width is the one
    // unknown — WebKit lays out «Кола отзад · N м» and nothing here can measure
    // text — so each recorded figure is inverted for it independently, against
    // a DIFFERENT pad edge. If `padRectPx` had either edge wrong the two solves
    // would disagree by tens of pixels; they agree to 1.4 px, i.e. the pad model
    // and the photographed frame describe the same chip.
    const stage = LADDER[0];
    const centre = stage.width / 2;
    const padL = padRectPx("left", stage);
    const padR = padRectPx("right", stage);

    // Both pads span the chip's whole 26.5 px row at this floor, so each area
    // is (horizontal run) × CHIP_H and the width falls straight out:
    //   wheel     981/26.5 = 37.02 px of run past the steering pad's RIGHT edge
    //             ⇒ W = 2·(37.02 − 158.34 + 188.5) = 134.36
    //   throttle  363/26.5 = 13.70 px of run past the drive pad's LEFT edge
    //             ⇒ W = 2·(13.70 + 241.28 − 188.5) = 132.96
    const widthFromWheel = 2 * (981 / CHIP_H - (padL.x + padL.w) + centre);
    const widthFromThrottle = 2 * (363 / CHIP_H + padR.x - centre);
    expect(Math.abs(widthFromWheel - widthFromThrottle)).toBeLessThan(1.5);

    // …and the width they agree on is the pill this file's numbers are quoted
    // against everywhere else (134.2 × 26.5). Independent of the two solves: if
    // the photographed frame had been of some other surface, or either pad edge
    // were wrong, neither solve would land here.
    expect(Math.abs(widthFromWheel - CHIP_W)).toBeLessThan(1.5);
    expect(Math.abs(widthFromThrottle - CHIP_W)).toBeLessThan(1.5);

    // Forward direction, closing the loop: the model, fed that chip, reproduces
    // both photographed areas to within a pixel of text metrics.
    const chip = chipAt(ROOMY_HUD_FLOOR_PX, stage);
    expect(Math.abs(overlapPx2(chip, padL) - 981)).toBeLessThan(CHIP_H);
    expect(Math.abs(overlapPx2(chip, padR) - 363)).toBeLessThan(CHIP_H);
  });

  it("108 px is inside the control band on every compact profile", () => {
    // Permanently true and not a statement about the badge: it is where the
    // instrument floor sits relative to the thumb floor. `--sim-hud-floor` is
    // `dashHeightPx + 8` (48 px on every profile in the ladder) and this band
    // reaches far higher, which is the sentence `TouchControls` writes at the
    // `TOUCH_CONTROLS_FLOOR` export: „a widget that clears the dash can still
    // land squarely on the steering pad".
    for (const stage of LADDER) {
      expect(
        touchControlsFloorPx(stage),
        `${stage.id}: the thumb band must reach above the roomy instrument floor`,
      ).toBeGreaterThan(ROOMY_HUD_FLOOR_PX);
    }
  });

  it("PORTRAIT leaves no width for a centred chip at that floor — LANDSCAPE does", () => {
    // BOTH DIRECTIONS, because „the corridor is too narrow" is only half a
    // finding. The pad corridor is the free lane between the two thumb pads at
    // the pads' own row.
    for (const stage of LADDER) {
      const corridor = padCorridorPx(stage);
      if (stage.portrait) {
        // Under 67 px on the iPhone and under 60 on both 360-px Androids: no
        // readable chip fits, at ANY width, which is why the old floor cannot
        // simply be kept and re-centred.
        expect(corridor.w, `${stage.id}: portrait corridor`).toBeLessThan(CHIP_W);
      } else {
        // …and the orientation the product actually drives in is clear at the
        // shipped floor. This is the assertion that stops the routed row being
        // escalated into a stop-the-line, and it is also what would go red if
        // someone „fixed" landscape and broke it.
        expect(corridor.w, `${stage.id}: landscape corridor`).toBeGreaterThan(CHIP_W);
        const chip = chipAt(ROOMY_HUD_FLOOR_PX, stage);
        expect(overlapPx2(chip, padRectPx("left", stage)), `${stage.id}: steering`).toBe(0);
        expect(overlapPx2(chip, padRectPx("right", stage)), `${stage.id}: drivetrain`).toBe(0);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · BOTH DIRECTIONS OF THE WARNING — THE ROW THE PARKING FAMILY RIDES ON
// ───────────────────────────────────────────────────────────────────────────

/** Drive the component's own fold the way its 5 Hz poll does. */
function poll(source: RearGapSource, pose: RearCuePose, prev: RearCue | null): RearCue | null {
  return stepRearCue(
    prev,
    source.rearGapMeters(pose.position.x, pose.position.y, pose.headingDeg),
    pose.speedKmh,
  );
}

/** A student reversing due north at parking speed. */
const REVERSING: RearCuePose = { position: { x: 0, y: 0 }, headingDeg: 0, speedKmh: -3 };

describe("a reversing student who IS close to something is warned", () => {
  it("a body 1.2 m behind raises the badge, and the badge says how far", () => {
    // Heading 0° is +y, so „behind" is −y. One body, 1.2 m back, dead in the
    // corridor. `bumperSubtrahendM` eats the two half-lengths, so the reported
    // gap is bumper-to-bumper and smaller than the centre distance — which is
    // the honest number for a student to read while reversing.
    const source: RearGapSource = {
      rearGapMeters: (px, py, h) => rearGapFor([{ x: 0, y: -1.2 }], px, py, h),
    };
    const cue = poll(source, REVERSING, null);
    expect(cue).not.toBeNull();
    // MUTATION: flip `if (fwd >= 0) continue` in rearGapFor to `<= 0` and the
    // body behind stops registering — this goes null and fails. Removing the
    // component's poll entirely fails it too.
    const markup = badgeMarkup(cue!);
    expect(markup).toContain(rearCueLabelBg(cue!));
    // The label is what a screen reader announces AND what the eye reads, so
    // both paths are asserted. A chip that renders a colour and no distance
    // would pass a „is the badge up" check and teach nothing.
    expect(markup).toMatch(/aria-label="Кола отзад · \d+ м"/);
    expect(markup).toMatch(/role="status"/);
  });

  it("closing from 14.5 m to 1 m never goes silent on the way in", () => {
    // The failure that matters is not „no badge at 1 m", it is a badge that
    // blinks out somewhere in the approach and reads as „clear". Walk the whole
    // ramp at the real poll rate.
    //
    // It starts at 14.5 and not at the 15 m raise edge itself, which is already
    // covered next door in `rear-proximity.test.ts`. Seating a body at exactly
    // −(15 + 4.1) makes `rearGapFor` return 15.000000000000002 in binary
    // floating point, so the range test rejects it — a genuine but microscopic
    // edge that says nothing about the ramp this row is asserting, and pinning
    // the ramp to it would be a test about IEEE 754.
    let prev: RearCue | null = null;
    for (let d = 14.5; d >= 1; d -= 0.25) {
      const source: RearGapSource = {
        // `bumperSubtrahendM` is VEHICLE_LENGTH_M = 4.1 for a plain car, so
        // seating the body at −(d + 4.1) makes the REPORTED bumper gap exactly
        // d — the ramp is walked in the units the student reads, not in centre
        // distances the badge never shows.
        rearGapMeters: (px, py, h) => rearGapFor([{ x: 0, y: -(d + 4.1) }], px, py, h),
      };
      prev = poll(source, REVERSING, prev);
      expect(prev, `silent at ${d} m behind`).not.toBeNull();
    }
    // …and it is monotonically getting closer, never counting up.
    expect(prev!.meters).toBeLessThanOrEqual(2);
  });
});

describe("a reversing student who is NOT close to anything is not warned", () => {
  it("an empty world raises nothing, from the cold state and from a live badge", () => {
    // The false-certificate direction's mirror: a badge that lingers after the
    // road behind clears teaches a student to distrust the one rear instrument
    // they have, and the next real warning is furniture.
    const empty: RearGapSource = { rearGapMeters: (px, py, h) => rearGapFor([], px, py, h) };
    expect(poll(empty, REVERSING, null)).toBeNull();
    expect(poll(empty, REVERSING, { level: "danger", meters: 1 })).toBeNull();
    // MUTATION: make rearGapFor return 0 instead of Infinity for „nothing
    // found" and both fail — which is the shape of every false-warning bug.
  });

  it("a body AHEAD is not a body behind, and a body one lane over is not either", () => {
    // Two ways a rear cue can lie in the reassuring-looking direction by firing
    // when it should not, both of which would train a student to ignore it.
    const ahead: RearGapSource = {
      rearGapMeters: (px, py, h) => rearGapFor([{ x: 0, y: +8 }], px, py, h),
    };
    expect(poll(ahead, REVERSING, null)).toBeNull();
    const nextLane: RearGapSource = {
      rearGapMeters: (px, py, h) => rearGapFor([{ x: 8.1, y: -3 }], px, py, h),
    };
    expect(poll(nextLane, REVERSING, null)).toBeNull();
  });

  it("A BODY THE SOURCE CANNOT SEE READS EXACTLY LIKE AN EMPTY ROAD — the parking row", () => {
    // ── THE FINDING THIS FILE EXISTS TO MAKE UNDROPPABLE ────────────────────
    //
    // `traffic.rearGapMeters` is `rearGapFor(this.vehicles, …)`, and
    // `this.vehicles` holds ambient road-graph agents plus `stage()`d actors —
    // which resolve a lane-graph path and return null without one. A parking
    // bay's occupant is neither: it is the district's `occupancy` rect and
    // `extraObstacles: ObstacleRect2D[]` („bodies the district's own occupancy
    // does not carry (van, wall)", traces/scParkDepth.ts), drawn by
    // `ScenarioObstacles` over `computeParkedCars`. A parking lot also has no
    // road graph to seed ambient traffic from.
    //
    // So on the whole parking family — sc-park-narrow reverses into a 2.5 m
    // pocket between two OCCUPIED bays, and its own step 4 reads „движи се
    // назад съвсем бавно и следи двете съседни коли" — the badge is silent for
    // the entire manoeuvre. The two states are indistinguishable at the seam,
    // and that is the defect stated as a test: the same student, the same
    // 0.8 m of air, one warned and one not, decided purely by which array the
    // body was put in.
    //
    // The component is exonerated by the first half and the source is convicted
    // by the second. It is written this way ON PURPOSE so it stays green when
    // the routed fix lands in traffic/system.ts (the body simply moves into the
    // swept list and the first branch starts applying) instead of turning into
    // a red test about nothing.
    //
    // THE FIX LANDED (O59, 2026-08-20) and this test did not have to move,
    // which is the whole point of writing it at the seam. `rearGapMeters` is
    // now the nearer of the moving sweep and a static one over the district's
    // occupied bays (`traffic/system.ts` `occupiedBayBodies` /
    // `rearStaticGapFor`); the corpus measurement that convicted the source —
    // 51 recorded parking drives, 36,367 samples, ZERO finite rear reads before
    // it — and all four directions of the new behaviour are in
    // `traffic/__tests__/rear-static-gap.test.ts`. What the two `RearGapSource`
    // stubs below model is still exactly right: this component reports what its
    // source reports, and the seam is what decides whether a student is warned.
    const NEIGHBOUR = { x: 0, y: -0.8 };
    const asVehicle: RearGapSource = {
      rearGapMeters: (px, py, h) => rearGapFor([NEIGHBOUR], px, py, h),
    };
    const asObstacle: RearGapSource = {
      // What the parking family actually hands it: the bay occupant exists in
      // the world and in the collider pool, and in NO vehicle array.
      rearGapMeters: (px, py, h) => rearGapFor([], px, py, h),
    };
    expect(poll(asVehicle, REVERSING, null), "a vehicle 0.8 m behind").not.toBeNull();
    expect(poll(asObstacle, REVERSING, null), "the SAME body as an obstacle").toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · O61 · THE SEVERITY REACHES THE GLASS
//
// The three blocks above prove WHETHER the badge speaks. O61 is about what it
// says, and that half had nothing at the surface: the level is a string in a
// snapshot until `LEVEL_COLOR` turns it into a border and a text colour, and
// nothing asserted that a „danger" cue paints differently from a „warn" one.
// A fix that made `stepRearCue` return "danger" while the badge kept painting
// `var(--warning)` would have been green everywhere — and it would have shipped
// a student the same colour at 0.12 m as at 6 m, which IS the finding.
// ───────────────────────────────────────────────────────────────────────────

describe("O61 · the level a student is shown is the level that was computed", () => {
  it("each level paints its own colour, and danger is the alarm colour", () => {
    const info = badgeMarkup({ level: "info", meters: 11 });
    const warn = badgeMarkup({ level: "warn", meters: 6 });
    const danger = badgeMarkup({ level: "danger", meters: 0 });
    // ANCHORED ON THE BORDER, not on the raw markup, and the difference is a
    // measurement rather than a nicety: the icon's two TAILLIGHTS are
    // `var(--danger)` at every non-neutral level, so a bare `toContain` is
    // already true of an amber badge and would have passed the mutation below.
    // Caught by running it.
    //
    // MUTATION: point LEVEL_COLOR.danger at var(--warning) — the exact shape of
    // „the fix computed a level nothing painted" — and these two go red.
    expect(danger).toContain("border-color:var(--danger)");
    expect(warn).toContain("border-color:var(--warning)");
    expect(warn).not.toContain("border-color:var(--danger)");
    // …and the three are not the same string, which is the claim that matters
    // to an eye: three levels, three surfaces.
    expect(new Set([info, warn, danger]).size).toBe(3);
    // The neutral band deliberately keeps the ordinary foreground for its TEXT
    // (a grey chip is not an alarm), so it must not carry the alarm colour on
    // its border either.
    expect(info).toContain("border-color:var(--border-strong)");
    expect(info).not.toContain("var(--danger)"); // neutral: not even the lamps
  });

  it("the taillights light up only once the badge is not neutral", () => {
    // The icon's two lamps are the non-textual half of the severity, and they
    // are what reads at a glance on a phone held at arm's length.
    expect(badgeMarkup({ level: "info", meters: 11 })).not.toContain('fill="var(--danger)"');
    expect(badgeMarkup({ level: "warn", meters: 6 })).toContain('fill="var(--danger)"');
    expect(badgeMarkup({ level: "danger", meters: 0 })).toContain('fill="var(--danger)"');
  });

  it("END TO END: 0.12 m behind at parking speed reaches the glass as RED", () => {
    // The measured pose of `sc-park-narrow/shadow-correct`'s closest approach,
    // driven through the SAME seam the component polls — source → stepRearCue →
    // markup. This is the row O61 was filed for, and before the fix the markup
    // produced here carried `var(--warning)`.
    const source: RearGapSource = {
      // 0.1157 m of bumper gap: the body centre 4.2157 m back, less the 4.1 m
      // `bumperSubtrahendM` eats.
      rearGapMeters: (px, py, h) => rearGapFor([{ x: 0, y: -4.2157 }], px, py, h),
    };
    const pose: RearCuePose = { position: { x: 0, y: 0 }, headingDeg: 0, speedKmh: -3.828 };
    const cue = poll(source, pose, null);
    expect(cue).not.toBeNull();
    expect(cue!.level).toBe("danger");
    expect(rearCueLabelBg(cue!)).toBe("Кола отзад · 0 м");
    expect(badgeMarkup(cue!)).toContain("border-color:var(--danger)");

    // BOTH DIRECTIONS AT THE SAME SEAM. The same 0.12 m with the car ROLLING
    // FORWARD is amber, not red — the gap is not closing, and a badge that is
    // red whenever it is up is wallpaper.
    const forward = poll(source, { ...pose, speedKmh: 3.828 }, null);
    expect(forward!.level).toBe("warn");
    expect(badgeMarkup(forward!)).not.toContain("border-color:var(--danger)");
    // …and so is reversing at the same speed with six metres of air.
    const roomy: RearGapSource = {
      rearGapMeters: (px, py, h) => rearGapFor([{ x: 0, y: -10.1 }], px, py, h),
    };
    const clear = poll(roomy, pose, null);
    expect(clear!.level).toBe("warn");
    expect(rearCueLabelBg(clear!)).toBe("Кола отзад · 6 м");
    expect(badgeMarkup(clear!)).not.toContain("border-color:var(--danger)");
  });
});
