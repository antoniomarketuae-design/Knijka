/**
 * THE RIGHT-EDGE NOTIFICATION COLUMN — one place for every text panel.
 *
 * FOUNDER, THIRD ASKING (2026-08-03, with a drawing):
 *
 *   „you see all this text in the middle yes, and we said we have to move it
 *    from there so it doesnt bother the view … it must be like a popup
 *    notifications going below, it must be small text so the user can just
 *    read it — all the texts that are in the front: the task, the demonstration
 *    window, and the guidance what to do, the instructions too."
 *
 * His annotated frame («Look where I put the lines…») draws two vertical
 * corridors hard against the LEFT and RIGHT edges and leaves the middle empty.
 * The right corridor on that 591 px-wide photograph runs from roughly 0.66 to
 * 0.95 of the width — about a third of the screen, at the edge.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS ARITHMETIC. The previous attempt
 * at this row „un-panelled the HUD" and reported chrome 70 % → 85 %: it made
 * the boxes TRANSPARENT while leaving them exactly where they were. He asked
 * for them MOVED. So the acceptance test here is not a coverage percentage —
 * it is a POSITION, and a position can be asserted:
 *
 *     (w − NOTIFY_COLUMN_GUTTER_PX − notifyColumnWidthPx(w, compact)) / w
 *         >= NOTIFY_COLUMN_MIN_LEFT_FRACTION
 *
 * — swept across the whole device ladder by `__tests__/notify-column.test.ts`,
 * which owns that division (it used to be an exported `notifyColumnLeftFraction`
 * here; see the block where it stood),
 *
 * i.e. on every device in the ladder the column's left edge is at or past 60 %
 * of the width, so the centre of the frame — the road, the vanishing point, the
 * thing the student is steering down — is never under a text panel.
 *
 * Pure numbers with no DOM, exactly like immersive.ts and overlayQueue.ts, so
 * the CSS the components ship and the assertion in the test are generated from
 * ONE set of constants and cannot drift apart.
 */

/** Gutter between the column and the screen edge, px. Matches the HUD's own. */
export const NOTIFY_COLUMN_GUTTER_PX = 12;

/**
 * Widest the column may ever be, px — roomy and compact.
 *
 * 320 (20 rem) on a desktop is the toast column plus a little: wide enough for
 * a five-step briefing to read as prose. 240 (15 rem) on a phone is the toast
 * card's own shipped width (`TOAST_CARD_WIDTH_PX`), so a notification is never
 * re-flowed just because it moved into this column.
 */
export const NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX = 320;
export const NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX = 240;

/**
 * …and as a fraction of the viewport, which is what decides it on a phone.
 *
 * 0.30 / 0.36 are not taste: they are the largest values for which the left
 * edge of the column still lands past `NOTIFY_COLUMN_MIN_LEFT_FRACTION` on the
 * NARROWEST device in the ladder (320 px). `notify-column.test.ts` sweeps the
 * whole ladder rather than trusting this comment.
 */
export const NOTIFY_COLUMN_WIDTH_FRACTION_ROOMY = 0.3;
export const NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT = 0.36;

/**
 * THE RULE. The column's left edge may never come left of this fraction of the
 * viewport width — that is what „off the middle of the road" means as a number.
 *
 * 0.6 and not 0.5: the road corridor in the authored cockpit frame (playArea.ts)
 * is not a hairline at x = 0.5, it is a band around it. A panel whose left edge
 * sits at 0.52 is technically „in the right half" and still lands on the lane
 * the student is driving in.
 */
export const NOTIFY_COLUMN_MIN_LEFT_FRACTION = 0.6;

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE SAME RULE FOR THE OTHER AXIS — 2026-08-16, „THE HUD IS STANDING ON
   THE ROAD".

   THE RULE ABOVE IS ABOUT x AND ONLY ABOUT x. It has been satisfied since
   2026-08-03 and the founder's complaint did not go away, because a column that
   is correctly at the right edge can still run all the way DOWN the picture:

     MEASURED ON THE DEPLOYED BUILD (WebKit, real insets, iPhone 16 landscape
     852 × 393, `/simulator?scenario=sc-zebra-approach&level=1`, the landing
     frame, canvas asserted):

       [data-hud="notify-column"]  [541, 8, 180 × 192]

     left fraction 0.635 — the x rule passes with room to spare — and a FLOOR at
     y = 200, i.e. 0.509 of the stage. His words: „it sits exactly over the
     RIGHT-HAND PAVEMENT, which is where the pedestrian comes from, and clips
     the crossing warning sign. A card that covers the hazard the lesson is
     about is worse than a card that is merely large."

   WHERE THE HAZARD IS, IN FRAME COORDINATES, AND IT IS DERIVED RATHER THAN
   EYEBALLED. `cabinLook.test.ts` already asserts the cockpit projection: a
   point at infinity lands at y = 0.58 of the canvas, so that is the HORIZON.
   The cockpit holds a ~75.4° horizontal FOV (cabinLook), which at the 2.168
   aspect of a landscape iPhone is 39.2° vertically. An object of height h above
   the 1.2 m eye point, at distance d, therefore lands
   `0.58 − atan(h/d) / 39.2°` of the way down the frame:

     a 2.2 m sign face   at 30 m → 0.531   ·  at 15 m → 0.483  ·  at 8 m → 0.398
     a 1.75 m pedestrian at 30 m → 0.556   ·  at 15 m → 0.531

   So everything the student is being TAUGHT to look at on this rung enters the
   frame at or below **0.53**, and it enters there at the distance where it can
   still be acted on (27 m is reaction plus braking at the 50 km/h limit).

   0.43 IS THAT LINE WITH A TENTH OF THE FRAME OF CLEARANCE — the same grammar
   and the same margin `HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION` uses one file over
   („0.55 leaves a tenth of the frame of clearance" below a hotspot at 0.65).
   It is a CEILING and not a height: it is applied with `min()` against the
   control band's own budget, so whichever is tighter wins.

   WHAT IT COSTS, STATED, because it is paid in authored Bulgarian. At
   852 × 393 the column goes 192 → 161 px and the peek's text window 116 → ~71,
   i.e. about eight visible lines down to about five. That is only acceptable
   because the other half of this row ships with it: the fold is no longer a
   silent 10 px fade — `SimOverlay` counts the lines below it and prints
   «↓ още N реда» beside «ПРОЧЕТИ», which opens the whole authored text with the
   car stopped. Measured on the same frame before the change: 580 characters in
   the card, 232 of them on screen, 348 below an unhinted fold and NOTHING on
   the glass saying so — including the founder's own «…дали да стъпи.», whose
   missing four words are what row 2 of his letter is about.

   PORTRAIT IS UNTOUCHED BY CONSTRUCTION: 0.43 × 852 = 366 px is larger than the
   control band's own cap there (330), so the `min()` picks the band and not
   one pixel moves.
   ═══════════════════════════════════════════════════════════════════════════ */

/* The cockpit horizon (0.58 of the canvas, `cabinLook.test.ts`'s own assertion)
   was published from here as `COCKPIT_HORIZON_FRACTION` until 2026-08-26. It is
   a datum for the derivation above, not a length this module applies — nothing
   read it but `__tests__/hud-off-the-road.test.ts`, it was never in the barrel,
   and no CSS string was ever derived from it. It now lives beside the assertion
   that uses it, so this file publishes only numbers it spends. */

/**
 * The top of the band a hazard is projected into, as a fraction of the stage.
 * See the derivation above: a 2.2 m sign at 30 m and a pedestrian at 15 m both
 * land at 0.53, and 30/15 m is where they still have to be noticed.
 */
export const HAZARD_BAND_TOP_FRACTION = 0.53;

/** …and the ceiling the peek keeps above it. A tenth of the frame of clearance. */
export const NOTIFY_COLUMN_MAX_STAGE_FRACTION = 0.43;

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE THIRD RULE: THE MIRROR IS AN INSTRUMENT — 2026-08-17, the catalogue
   sweep's „THE HUD IS STANDING ON THE MIRROR".

   THE TWO RULES ABOVE BOUND THE COLUMN'S LEFT EDGE AND ITS FLOOR. Nothing has
   ever bounded its CEILING, and the top of the right corridor is not empty: it
   is where the cockpit's own INTERIOR MIRROR is projected. This column starts
   8 px from the top of the stage on every phone, so the two have shared that
   corner since the column was moved there on 2026-08-03 and no probe looked,
   because every probe in this family measures DOM boxes against DOM boxes and
   the mirror is inside the WebGL canvas.

   MEASURED ON THE DEPLOYED BUILD (sweep161, WebKit, real insets, iPhone 16
   landscape 852 × 393 at DPR 3 — the frames the catalogue filed):

     sc-ov-solid-line/mobile-right/01-arrival.png
       [data-hud="notify-column"]     [541, 8, 180 × 161]
       the interior mirror, painted   [524, 0 → 707, 70]
       → 166 × 62 = 10 292 px², and it is the TOP of the card: its chip, its
         title and its first authored line. Line 1 of an eleven-line briefing
         is legible only because the casing behind it happens to be black;
         lines 2–3 fall off it onto sky and fade out mid-word above
         «↓ ОЩЕ 8 РЕДА».

     sc-rb-exit-signal/mobile-right/04-t063s.png
       «⚠ −10 ИЗПИТНИ Т.» sits ENTIRELY inside the glass, over the reflection
       of an orange-lit façade and a red truck, and the casing's bezel cuts
       diagonally through «предимство» in the title beside it.

     sc-vp-police-stop/mobile-right/04-t140s.png
       the same band also carries OVERHEAD signage — an information board at
       [639 → 852, 0 → 43], with the first-run hint over its left 82 px, on the
       rung whose subject is a traffic controller's authority.

   BOTH THINGS ARE DESTROYED AT ONCE, which is what makes this worse than the
   hazard band below rather than another instance of it. There the card merely
   covered the road; here the card is ALSO unreadable, because a live
   reflection is the worst backdrop a white glyph can have — and sc-park-van
   teaches reversing with restricted rearward visibility, i.e. on that rung the
   mirror IS the lesson and the HUD is printed on it.

   WHERE THE MIRROR IS, DERIVED AND NOT EYEBALLED — from the same source the
   hazard band comes from. `cabinLook.hotspotScreenRect("hotspot_mirror_rear",
   "forward", aspect)` projects the mirror's own proxy box (`scene/vitok/
   hotspots.ts`, whose position IS the GLB node's). `notify-column-mirror.
   test.ts` re-runs that projection rather than trusting this table:

     aspect  where the mirror's box ENDS, as a fraction of the stage height
     2.294   0.145   the gesture-bar Samsung sideways
     2.168   0.165   iPhone 16 sideways    → 64.8 px of a 393 px stage
     2.167   0.165   780 × 360 Android     → 59.4 px
     2.042   0.185   a 1264 × 619 desktop  → 114.3 px
     1.792   0.223   the 1440 × 900 window the drive harness renders → 145.0 px
     1.778   0.225   16:9, the authored reference
     ≤ 1.45  0.275   PINNED — `cockpitVFovForAspect` clamps at COCKPIT_FOV_MAX
                     (56°), so a squarer window stops gaining vertical field
     0.461   0.275   a phone UPRIGHT — and there the box's centre is off the
                     right edge (x 0.733 → 1.652), so only its left sliver is
                     on the glass at all

   AND THERE IS NO HORIZONTAL ESCAPE. The box spans x 0.574 → 0.866 at every
   landscape aspect — 489 → 738 px on an iPhone 16 — while this column runs
   541 → 721. The column is INSIDE the mirror's x band with the mirror sticking
   out on both sides, and it cannot move right: it is already standing on the
   right gutter, the 59 px notch inset and the throttle band's flank lane. The
   only axis left is the one the hazard band already uses.

   THE MIRROR DOES NOT MOVE, THE HUD DOES. That is not a new ruling — it is the
   one `PlayAreaStyles` rows B74/B76 already made for the chase view's rear
   window, in those words: „An instrument you cannot see is not an instrument,
   so the HUD moves, not the mirror."
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Gutter between the mirror's floor and the column's ceiling, px.
 *
 * 8 and not `NOTIFY_COLUMN_GUTTER_PX` (12): 8 is this HUD's own gutter
 * everywhere it separates two boxes (`DECK_ROOMY_LEGEND_GUTTER_PX`,
 * `RIBBON_LEGEND_LANE_PX` further down both spend it), and 12 is the distance
 * this column keeps from a SCREEN EDGE, which is a different question.
 */
export const NOTIFY_COLUMN_MIRROR_GUTTER_PX = 8;

/**
 * Where the mirror's box ends, as a fraction of the stage — one number per
 * layout class, each the WORST case over the shapes that class actually
 * serves. Same grammar as the width fractions at the top of this file („the
 * largest values for which … on the NARROWEST device in the ladder"), and for
 * the same reason: a static CSS length cannot ask what the aspect is, and the
 * one place that can — a media query — lives in `PlayAreaStyles`.
 *
 * ROOMY 0.24 covers every desktop shape from aspect 1.70 up (1.70 → 0.2372,
 * 1.778 → 0.2249, 2.042 → 0.1847), which is every window the ladder serves
 * once the shell's own rail and toolbar are taken out of it. A window squarer
 * than 1.70 pins toward the 0.275 clamp and is under-cleared; that is stated
 * rather than paid for, because 0.275 on a 619 px desktop stage costs 179 px
 * of top and leaves the tallest measured column 15 px from the instrument
 * band, which is a new defect bought to close a rarer one.
 *
 * COMPACT_LANDSCAPE 0.166 covers all three sideways phone profiles in
 * `tools/mobile/lib/devices.mjs` (0.1649, 0.1651, 0.1454) — the orientation
 * every frame in this catalogue was photographed in, and the one anybody
 * drives in.
 *
 * COMPACT_PORTRAIT 0.276 is the clamp plateau, and it is the one number here
 * that NO SHIPPED LENGTH USES. `notifyColumnMirrorLanePx()` reads it so the
 * predicate below tells the truth upright — the mirror really is 243 px down
 * on a 393 × 852 phone — but one static percentage cannot serve 0.166 sideways
 * and 0.276 upright, and the orientation question is answered by a media query
 * in `PlayAreaStyles`, exactly as it already is for the deck's caption. The gap
 * that leaves is asserted rather than implied, in the last block of
 * `notify-column-mirror.test.ts`.
 */
export const MIRROR_BAND_BOTTOM_FRACTION_ROOMY = 0.24;
export const MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE = 0.166;
export const MIRROR_BAND_BOTTOM_FRACTION_COMPACT_PORTRAIT = 0.276;

/**
 * …and the mirror's LEFT edge, so the rule below can tell „this box is under
 * the mirror" from „this box is in the other corridor".
 *
 * 0.5738 is the projection's own answer at every aspect from 1.45 up, where it
 * stops moving because the vFOV clamp has taken over the x span too (at 1.0 it
 * is 0.607, i.e. further RIGHT, so the landscape figure is the conservative
 * one). 0.573 rounds DOWN — a lane that claims slightly more of the picture
 * than the mirror occupies fails safe; one that claims slightly less excuses a
 * box by a rounding error.
 *
 * It matters because the corridor on the other side of the frame — «Меню»,
 * the view and pause buttons, the steering arc — is nowhere near this mirror,
 * and a rule stated as „the top of the stage" rather than as a rect would drag
 * all of it down. (The open demonstration deck is the interesting case: its
 * RIGHT edge does reach 533 px on an iPhone 16 sideways, i.e. 44 px into this
 * band. It is judged by the rule like anything else — and the answer is still
 * not to move it, because its own corridor is 83.5 px tall between the rail
 * and the control band. See the block below.)
 */
export const MIRROR_BAND_LEFT_FRACTION = 0.573;

/** The lane the column keeps clear of the mirror, in px, for a stage. */
export function notifyColumnMirrorLanePx(
  stage: { width: number; height: number },
  compact: boolean,
): number {
  if (!Number.isFinite(stage.height) || stage.height <= 0) return 0;
  const fraction = !compact
    ? MIRROR_BAND_BOTTOM_FRACTION_ROOMY
    : stage.height >= stage.width
      ? MIRROR_BAND_BOTTOM_FRACTION_COMPACT_PORTRAIT
      : MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE;
  return stage.height * fraction + NOTIFY_COLUMN_MIRROR_GUTTER_PX;
}

/* THE RULE AS A PREDICATE — `rectClearsMirrorBand` — used to stand here, and it
   moved to `__tests__/mirrorBand.ts` on 2026-08-26.

   What this module OWES the mirror is a length, and it still ships it: the two
   `NOTIFY_COLUMN_TOP_CSS_*` strings below are derived from the fractions above
   and `PlayAreaStyles.tsx` writes both. The predicate is a different thing —
   „here is a rect somebody MEASURED, is it legal?" — and nothing that paints
   asks it, because the layout is a static length in a stylesheet and the only
   party holding a measured box is a probe. Exported from here it read as a rule
   the HUD applies, and a review row was closed on that reading. Its two inputs
   are still imported from this file, so a fraction changed here still changes
   the judgement there. */

/* ═══════════════════════════════════════════════════════════════════════════
   WHY THE COMPACT DATUM BELOW DOES NOT CARRY THIS LANE, AND WHAT IT WOULD COST
   IF IT DID.

   `NOTIFY_COLUMN_TOP_CSS_COMPACT` is not this column's top — it is the phone
   layout's TOP-LEFT CORNER DATUM, and two surfaces that are nowhere near the
   mirror hang off it:

     · `TouchControls.TOP_RAIL_TOP_CSS = NOTIFY_COLUMN_TOP_CSS_COMPACT` — the
       «Меню · Изглед · Пауза» rail, x 64 → 231.5, i.e. the LEFT corridor.
     · `PlayAreaStyles`' open demonstration deck sideways, which is written
       `top: calc(<this datum> + TOP_RAIL_ROW_CSS)` and lays out 60 → 118 px on
       a 393 px stage against a control band that starts at 135.5.

   Adding 0.166 of the stage to the datum moves the deck to 125 → 183, i.e.
   straight through the band, and drops the rail's two opaque buttons onto the
   road. So the datum stays where it is and the COLUMN gets its own top, which
   is the constant published below.

   IT IS NOT APPLIED FROM THIS FILE, and that is an ownership fact rather than
   a design one: the compact column's `top` is an INLINE style written by
   `SimOverlay`, and its `max-height` is written by `PlayAreaStyles`, both from
   `NOTIFY_COLUMN_TOP_CSS_COMPACT`. Two one-line swaps to
   `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` adopt it; the ROOMY half needs no
   swap at all, because every surface that reads the roomy top is a
   right-column surface, so that constant carries the lane directly.

   ✅ THE SWAP LANDED — verified 2026-08-19, and this paragraph is corrected in
   place rather than left reading as a description of what ships. `SimOverlay`
   now writes `top: NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,` (and carries it into
   the column's `max-height` argument), pinned from two directions by
   `sim-overlay-mirror-lane.test.ts` — which asserts BOTH that the new constant
   is present and that `top: NOTIFY_COLUMN_TOP_CSS_COMPACT` is absent, so a
   revert cannot be quiet — and by `hud-off-the-road.test.ts`.

   ❌ …AND THE SENTENCE THAT USED TO END THIS PARAGRAPH WAS WRONG BY TWO.
   It read „the remaining `NOTIFY_COLUMN_TOP_CSS_COMPACT` readers are the ones
   this block says should keep it: `TouchControls.TOP_RAIL_TOP_CSS` and the
   demonstration deck." Re-read against the tree on 2026-08-24 — this file's own
   rule, three paragraphs down, that „a comment that describes a shipped state
   must be re-read against the tree, not inherited" — there were two more, and
   both were RIGHT-corridor surfaces standing in the mirror's corner:

     `[data-hud="touch-hint"]`     the first-run thumb card, filed TWENTY-FOUR
                                   times in one steered sweep as „painted with
                                   no panel straight onto the rear-view mirror
                                   and the sky". Its ink measures y 11.0 → 132.3
                                   on an 852 × 393 stage against a mirror
                                   painted 0 → 70.
     `[data-hud="audio-prompt"]`   same corner, same instrument — and its own
                                   ROOMY rule already carried the lane, so only
                                   the compact arm was ever wrong.

   Both now read the COLUMN constant. The reason a wrong sentence could stand
   here for five days is that ONE enforced instance is a convention, so the rule
   is now a scan rather than a claim: `mirror-lane-corridor.test.ts` enumerates
   every compact `top:` in `PlayAreaStyles` that names a `data-hud` surface and
   requires each to be either a stated corner-datum tenant or written from
   `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN`.

   ⚠ AND THE PRICE IT PAID IS NOW PHOTOGRAPHED, which the paragraph below
   predicted in the abstract and nobody had measured against the catalogue. The
   trade — „about five of the peek's eleven visible lines … the words are not
   deleted, they join the fold that already prints «↓ още N реда»" — is real,
   and the sweep shows what the fold was ALREADY holding before those five
   lines joined it (852 × 393, all mobile, all read off the frames):

     sc-merge-motorway-exit/mobile-right/01-arrival   ↓ ОЩЕ 39 РЕДА
     sc-zebra-approach/mobile-right/04-t087s          ↓ ОЩЕ 15 РЕДА
     sc-crossing-dart/mobile-right/01-arrival         ↓ ОЩЕ 15 РЕДА
     sc-sp-curve/mobile-wrong/04-t129s                ↓ ОЩЕ  8 РЕДА
     sc-speed-transition/mobile-wrong/04-t018s        ↓ ОЩЕ  3 РЕДА

   In the zebra frame the line at the cut — rendered half-height at ~50 %
   opacity, across the face of the pedestrian-crossing sign it is about — is
   instruction 3, the stop rule the lesson GRADES. The mirror lane makes that
   frame worse: 161 px of column becomes 95.8, so the cut moves UP.

   THIS IS NOT AN ARGUMENT FOR GIVING THE MIRROR BACK. Both surfaces are
   load-bearing and the two rows are not each other's price — the fold is deep
   because a violation card is handed a whole briefing to print in a peek, not
   because the column is 65 px shorter. The row that closes it is on the ITEM,
   and it is now stated where an item can be judged: `overlayQueue.whyIsReachable`
   („the fold may hide less than it shows"), with `SimOverlay.foldLinesBelow`
   owning the measured half. Recorded here so the next reader of this trade is
   handed the five numbers instead of re-deriving them from the catalogue.

   WHAT THE COMPACT SWAP COSTS, STATED BEFORE IT IS MADE, at 852 × 393:
     top 8 → 73.2 · the `min()` of the two budgets goes 161 → 95.8 px
   and at 780 × 360:
     top 8 → 67.8 · 147 → 87.0 px.
   That is about five of the peek's eleven visible lines, and it is the same
   trade `NOTIFY_COLUMN_MAX_STAGE_FRACTION` already made in the other
   direction: the words are not deleted, they join the fold that already prints
   «↓ още N реда» beside «ПРОЧЕТИ». It is also NOT a clipped control — the
   compact column sets no `overflow`, and the card's «ПРОЧЕТИ» row is a
   `shrink-0` sibling of a `min-h-0` scroller, so a card whose chrome needs
   more than 95.8 px paints past the ceiling rather than losing its buttons:
   worst case its floor lands at 0.46 of the stage against a hazard band that
   starts at 0.53.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The peek's ceiling as shipped CSS — the tighter of the two budgets.
 *
 * `floorCss` is what the control band leaves (TouchControls' own
 * `notifyColumnFloorCss()`); `topCss` is where the column starts. Both are
 * subtracted from the sky budget too, because a `max-height` is measured from
 * the box's own top edge and the column's top is not the stage's.
 *
 * ── `stageFraction` IS AN ARGUMENT NOW, AND ONE SURFACE PASSES A DIFFERENT
 *    ONE — 2026-08-24, the mirror-lane round.
 *
 * The default is and stays the peek's 0.43, so every existing call site is
 * byte-identical. The parameter exists because the corridor acquired a second
 * tenant whose LIFETIME is not the peek's: `[data-hud="touch-hint"]` is on the
 * glass only until the car first reaches `TOUCH_HINT_MOVING_KMH`
 * (`components/sim/lesson-ui/touchHintLifetime.ts`, whose own census reads it
 * painted at 03-ready in 174 of 174 runs and at no 04- frame in any of them),
 * and it CLIPS what it cannot hold — it sets `overflow: hidden` inside a
 * `pointer-events-none` parent, so its scroller cannot be scrolled by a thumb.
 * The peek does neither: it is up while the student drives, and it paints past
 * this ceiling rather than losing its «ПРОЧЕТИ» row.
 *
 * 0.43 is 0.53 („where a 2.2 m sign at 30 m and a pedestrian at 15 m land",
 * derived at the 50 km/h limit) less a tenth of the frame of clearance. That
 * margin is bought for a card that shares the glass with a moving car; charging
 * it to a card that cannot be on the glass above 5 km/h costs authored
 * Bulgarian that no gesture can recover. So the hint is bounded by
 * `HAZARD_BAND_TOP_FRACTION` itself — it may not enter the band, and it does
 * not pay the driving margin on top.
 */
export function notifyColumnMaxHeightCss(
  floorCss: string,
  topCss: string,
  stageFraction: number = NOTIFY_COLUMN_MAX_STAGE_FRACTION,
): string {
  return `min(
          calc(100% - ${floorCss} - ${topCss}),
          calc(${stageFraction * 100}% - ${topCss})
        )`;
}

/** …resolved, so the ladder sweep and the tests can assert on numbers. */
export function notifyColumnMaxHeightPx(
  stageHeightPx: number,
  bandFloorPx: number,
  topPx: number,
  stageFraction: number = NOTIFY_COLUMN_MAX_STAGE_FRACTION,
): number {
  if (!Number.isFinite(stageHeightPx) || stageHeightPx <= 0) return 0;
  return Math.min(
    stageHeightPx - bandFloorPx - topPx,
    stageHeightPx * stageFraction - topPx,
  );
}

/** Column width in CSS px for a viewport. */
export function notifyColumnWidthPx(viewportWidthPx: number, compact: boolean): number {
  const cap = compact
    ? NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX
    : NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX;
  const fraction = compact
    ? NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT
    : NOTIFY_COLUMN_WIDTH_FRACTION_ROOMY;
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return 0;
  return Math.min(cap, viewportWidthPx * fraction);
}

/* `notifyColumnLeftFraction` WAS HERE — dead-predicate census, 2026-08-26.
   It divided (viewportWidth − NOTIFY_COLUMN_GUTTER_PX − notifyColumnWidthPx)
   by the width, and the only thing that ever called it was
   `__tests__/notify-column.test.ts`: the declaration and one barrel line were
   the entire non-test census. It shipped in every bundle so that one test file
   could ask it a question.

   THE RULE IT EXPRESSED IS NOT DELETED. It is the acceptance criterion at the
   top of this file — the column's left edge at or past
   NOTIFY_COLUMN_MIN_LEFT_FRACTION on every device in the ladder — and it is
   still swept across the whole ladder, now derived in the test from the LIVE
   `notifyColumnWidthPx` (which `TouchControls.tsx` really does call) and the
   live gutter. Same arithmetic, same numbers, same verdict; one fewer function
   in the shipped HUD. */

// `rectIsInNotifyColumn` STOOD HERE AND NOTHING ASKED IT — removed 2026-08-26.
//
// It was a predicate for judging a MEASURED rect: „is this box in the column?"
// Nothing in the running product ever has one. The column's position is not
// discovered at runtime, it is DECLARED — `NOTIFY_COLUMN_RIGHT_CSS` and
// `NOTIFY_COLUMN_WIDTH_CSS_COMPACT` are handed to `SimOverlay` as inline
// lengths — so the only party that could ever hold a rect to compare against it
// is an instrument outside the app: the mobile drive harness, which is `.mjs`
// under `tools/` and cannot import this file at all.
//
// It was on the `hud` barrel, which made it look like a shipped rule. It was
// read by one test.
//
// CORRECTED 2026-08-26 AT INTEGRATION. This paragraph used to end „Its twin
// `rectClearsMirrorBand` below stays, and the difference is not sentiment:
// that one is called by this module's own live code path." Both halves are
// false now: the twin moved to `__tests__/mirrorBand.ts` in the same pass,
// and it had no non-test caller either. The sentence was true of ONE lane's
// tree and survived into a tree where the other lane had already moved the
// twin — which is what an integration defect looks like when it is made of
// prose instead of code, and why the comment above it says the opposite.
// The fractions the deleted predicate read
// (`NOTIFY_COLUMN_MIN_LEFT_FRACTION`, `NOTIFY_COLUMN_GUTTER_PX`) are unchanged
// and still declared above, so the harness's own copy of this arithmetic can go
// on being pinned to them by `hud-off-the-road.test.ts`.

/** px → a rem literal, so the CSS below is generated from the constants above. */
function rem(px: number): string {
  return `${px / 16}rem`;
}

/**
 * The shipped CSS lengths. Written as `min(<cap>, <fraction>vw)` on purpose:
 * a `min()` is self-limiting, which is what keeps `hud-card-fit.test.ts`'s
 * inline-width scanner from having to special-case it, and it is the same
 * shape the play area already uses for its own caps.
 */
export const NOTIFY_COLUMN_WIDTH_CSS_ROOMY = `min(${rem(
  NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX,
)}, ${NOTIFY_COLUMN_WIDTH_FRACTION_ROOMY * 100}vw)`;

export const NOTIFY_COLUMN_WIDTH_CSS_COMPACT = `min(${rem(
  NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX,
)}, ${NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT * 100}vw)`;

/**
 * Distance from the right edge, safe-area aware. `viewport-fit=cover` ships, so
 * on a landscape iPhone the right inset is a real 59 px of notch.
 */
export const NOTIFY_COLUMN_RIGHT_CSS = `calc(${rem(
  NOTIFY_COLUMN_GUTTER_PX,
)} + env(safe-area-inset-right, 0px))`;

/**
 * THE PHONE LAYOUT'S TOP-LEFT CORNER DATUM — and NOT the compact column's top.
 * (It was both until the swap landed; see the ✅ note above.)
 *
 * It sits at the very top because the tier picker — the only other thing in
 * that corner — is already stood down while the overlay layer speaks
 * (`PlayAreaStyles`, the row C1 rules), so the corner is free.
 *
 * ⚠ IT IS NO LONGER THIS COLUMN'S ANSWER, only its default. The mirror lane
 * above is what the column owes, `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` is what
 * it should read, and this constant stays put because `TOP_RAIL_TOP_CSS` and
 * the sideways demonstration deck are the OTHER things standing on it.
 */
export const NOTIFY_COLUMN_TOP_CSS_COMPACT = `calc(0.5rem + env(safe-area-inset-top, 0px))`;

/**
 * ROOMY: 2.75 rem below the corner, which clears the tier picker's own row —
 * that picker is a SETTING and it stays where the student expects to find it,
 * so the notifications queue underneath it — OR the interior mirror's lane,
 * whichever is lower. Every surface that reads this constant is a right-column
 * surface, which is why the lane could be applied here and not to the compact
 * datum above (2026-08-17).
 *
 * `max()` and not an addition, because the two datums answer different
 * questions: 0.5 / 3.25 rem is what the CORNER owes the picker and the rail,
 * the percentage is what the MIRROR owes. Whichever is lower down the stage
 * wins, so a shape where the mirror is high (an ultrawide window: 0.185 of a
 * 619 px stage is 114 px, still past 3.25 rem) is not paid for twice.
 *
 * A percentage in `top` resolves against the containing block's HEIGHT, which
 * for every surface that reads these is `[data-sim-stage]` — the same box
 * `NOTIFY_COLUMN_MAX_STAGE_FRACTION` is a fraction of, so the two rules are
 * measured against one ruler.
 *
 * WHAT THE ROOMY MOVE COSTS, MEASURED AGAINST THE TALLEST COLUMN THIS PROJECT
 * HAS ON RECORD (the five-step briefing, `[924, 144.5, 320 × 316.6]`, quoted
 * in the deck block below):
 *   1264 × 619   top 52 → 156.6   floor 368.6 → 473.2   band at 511   37.8 clear
 *   1165 × 650   top 52 → 164.0   floor 368.6 → 480.6   band at 542   61.4 clear
 * — where „band" is `100% − ROOMY_HUD_FLOOR_PX`. The shell's own cap is still
 * written `calc(100% − 108px − 3.5rem)`, i.e. it does not follow this top; the
 * two lines above are why that is safe today and the reason it is worth
 * re-measuring if the roomy column is ever allowed to grow past 316.6.
 *
 * AND THE STRING WAS RESOLVED IN THE ENGINES, not only in arithmetic: a
 * `calc(max(<rem>, <%> + <rem>) + env(…))` is either valid CSS or it is dropped
 * whole, and a dropped `top` leaves the column at 0 — which no unit test in
 * this module can see. Laid out against real stage boxes, WebKit and Chromium
 * agreeing to a hundredth (2026-08-17):
 *   1264 × 619 → 156.55   1165 × 650 → 164.00   (the pre-fix string → 52.00)
 *   852 × 393  →  73.23   780 × 360  →  67.75   780 × 340 → 64.44
 */
export const NOTIFY_COLUMN_TOP_CSS_ROOMY = `calc(max(3.25rem, ${
  MIRROR_BAND_BOTTOM_FRACTION_ROOMY * 100
}% + ${rem(NOTIFY_COLUMN_MIRROR_GUTTER_PX)}) + env(safe-area-inset-top, 0px))`;

/**
 * THE COMPACT COLUMN'S OWN TOP — the datum above plus the mirror's lane.
 *
 * ✅ APPLIED (verified 2026-08-19). `SimOverlay` writes it as the compact
 * column's inline `top` and carries it into that column's `max-height`; the
 * datum above stays where it is because the top rail and the open deck stand
 * on it, which was always the reason the two constants are separate.
 * `notify-column-mirror.test.ts` asserts that this constant clears the mirror
 * on every sideways phone in the ladder and that the datum still does not, and
 * `sim-overlay-mirror-lane.test.ts` asserts the adoption from both sides — the
 * new name present AND the old one absent — so the swap cannot be undone
 * quietly. (This docstring read „Published rather than applied" for one round
 * after it stopped being true; a comment that describes a shipped state must be
 * re-read against the tree, not inherited.)
 */
export const NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN = `calc(max(0.5rem, ${
  MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE * 100
}% + ${rem(NOTIFY_COLUMN_MIRROR_GUTTER_PX)}) + env(safe-area-inset-top, 0px))`;

/**
 * …and what those two CSS strings RESOLVE TO on a stage, px.
 *
 * Deliberately not `notifyColumnMirrorLanePx()`: that function answers „where
 * does the mirror end", which is the REQUIREMENT, and this one answers „where
 * does the shipped length put the column", which is the ANSWER. Upright they
 * disagree by construction — one static percentage cannot serve 0.166 and
 * 0.276 — and a resolver that quietly returned the requirement would hide the
 * one gap this row is knowingly leaving open.
 */
export function notifyColumnTopPx(
  stage: { width: number; height: number },
  compact: boolean,
  insetTopPx = 0,
): number {
  if (!Number.isFinite(stage.height) || stage.height <= 0) return insetTopPx;
  const datum = compact ? 8 : 52;
  const fraction = compact
    ? MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE
    : MIRROR_BAND_BOTTOM_FRACTION_ROOMY;
  return (
    Math.max(datum, stage.height * fraction + NOTIFY_COLUMN_MIRROR_GUTTER_PX) + insetTopPx
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DRIVING BAND'S LANE, AS THE COLUMN SEES IT — 2026-08-14, „FIX · FLANKS".
 *
 * The driving controls' flanks became BANDS: a 44 px column of stations hard
 * against each edge, 132 px tall on the steering side and 176 px on the
 * throttle one. The throttle band and this column share the same corner, and
 * measured on the founder's phone held sideways they shared 44 px of x —
 * `elementFromPoint` answered the briefing card at the centre of all four
 * stations, so a thumb aimed at a GRADED mirror glance pressed the card.
 *
 * Sideways this column therefore stops 8 px short of that band. It is
 * expressed as a CSS VARIABLE and not as a number because the amount is an
 * ORIENTATION (0 upright — this column is only `min(15rem, 36vw)` = 141 px
 * there, and 141 − 60 is not a card) and because the two declarations it
 * modifies are written INLINE by `SimOverlay`, which outranks any stylesheet.
 * A variable is the only form that survives that cascade.
 *
 * `--sim-flank-lane` is DECLARED by `TOUCH_BAND_CSS_VARS` (components/sim/
 * TouchControls), which owns the band's geometry and is the only place that
 * should ever set it; `touchArc.test.ts` asserts the two agree, so the name
 * cannot drift apart across the module boundary.
 *
 * The width given up here is bought back in height — the column's cap is no
 * longer the whole control band's floor, because the lanes are disjoint. Net at
 * 852 × 393: 240 × 128 = 30 720 px² → 180 × 192 = 34 560, and the LEFT edge does
 * not move, so the 0.60 left-edge rule reads what it read before.
 *
 * ── AND THE SWEEP RE-FILED THE DEFECT THIS LANE ALREADY CLOSED. REFUTED ON
 *    ITS OWN FRAME, 2026-08-19 ─────────────────────────────────────────────
 *
 * The filing (`sc-crossing-dart/mobile-right/01-arrival.png`, major): „The
 * instruction card sits on top of the right-hand control column … the panel
 * covers «Л ЛЯВО», «З ЗАДН» and «Д ДЯСН», and the «ПРОЧЕТИ»/«РАЗБРАХ» buttons
 * sit directly over the red ⚠ КОЛАН control — the seatbelt button is half under
 * the РАЗБРАХ button. The player cannot reach a control the HUD is telling him
 * about."
 *
 * The frame was opened and the corner cropped at 1.6× before anything was
 * changed here. It does not show that, and the two halves fail separately:
 *
 *   THE BUTTONS. «РАЗБРАХ» ends at x ≈ 720 CSS and its baseline row ends at
 *     y ≈ 164; the ⚠ КОЛАН disc begins at x ≈ 744 and y ≈ 179. Disjoint on
 *     BOTH axes — ~24 px of horizontal clearance and ~15 px of vertical — so
 *     „half under" is not a near miss, it is the opposite reading. Nothing on
 *     the card can take that thumb.
 *   THE PANEL. What covers Л/З/Д is not the card. It is the flank BAND's own
 *     translucent backdrop — the 44 px column of stations this block is about —
 *     and it is present on the LEFT edge of the same frame too, behind
 *     «КЛАКС / ДЯСН / ЛЯВ», where no notification column exists at all. The
 *     card's right edge stops ≈ 40 px short of it, which is this lane's 8 px
 *     gutter plus the notch inset doing exactly what they were added for.
 *
 * So the flank lane holds, and the finding is a re-reading of the fix. It is
 * written down instead of quietly dropped because the SAME frame carries a real
 * defect the filing did not name — the card is cut mid-instruction with
 * «↓ ОЩЕ 15 РЕДА» under it — and a lane that had merely closed this row would
 * have banked a green tick and walked past it. That one is live and is routed:
 * see the fold measurements in the mirror-lane block above and
 * `overlayQueue.whyIsReachable`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const FLANK_LANE_VAR = "var(--sim-flank-lane, 0px)";

/**
 * Room kept at the BOTTOM of the column for the demonstration transport, px.
 *
 * MEASURED, not guessed: at 1280×800 with the ghost demo open, the deck laid
 * out 320 × 239 px with its floor at ROOMY_HUD_FLOOR_PX. 248 is that height
 * plus the column's own 9 px gutter. It only ever bites when the column is long
 * enough to reach down there — a task line and an advisor prompt together are
 * about 110 px — and it exists so a five-step briefing scrolls inside itself
 * instead of being painted over the scrub bar.
 *
 * The deck is not a notification and does not join the flow above: it is a
 * TRANSPORT, it collapses to a 26 px pill on its own toggle, and a scrub bar
 * belongs near the floor. What the founder asked for is that it stop sitting in
 * the middle of the road, and at the bottom of this column it does not.
 *
 * ⚠ TWO THINGS THIS NUMBER NO LONGER DESCRIBES, both measured 2026-08-10 and
 * written here rather than left as a trap for whoever reaches for it next:
 *
 *   1. THE RULE THAT USES IT IS A NO-OP on a roomy screen. The shell writes
 *      the same `max-height` as an INLINE style, which outranks any selector —
 *      see the comment on that rule in `PlayAreaStyles`. Nothing has ever been
 *      reserved. (Turning it on is not a one-liner: at 1264 × 619 the authored
 *      value leaves the column 102.5 px and clips a five-step briefing.)
 *   2. THE DECK IS 48 px NARROWER than when 239 was measured — it now yields
 *      the map toggle's lane at its right edge (`ROOMY_MINIMAP_LANE_PX`) — and
 *      its transport therefore folds one line further: 191.5 px tall at both
 *      1264 × 619 and 1440 × 900. 248 is left alone rather than replaced with
 *      an arithmetic guess at 1280 × 800, which is the width the 239 came from
 *      and the one nobody has re-measured.
 */
export const NOTIFY_COLUMN_DECK_RESERVE_PX = 248;

/* ═══════════════════════════════════════════════════════════════════════════
   THE DECK WHEN IT IS OPEN, ON A DESKTOP — 2026-08-10, second pass.

   THE DEFECT, MEASURED IN THE RUNNING PRODUCT (WebKit, 1264 × 619,
   `/dev/drive-rig` on sc-zebra-approach@L1, the real shell, liveness asserted
   on a browser rAF counter AND a patched WebGL draw counter — 26 frames and
   5 075 draw submissions inside the 1.4 s the survey was taken):

     [data-hud="demo-deck"]  [924, 311.5, 272 × 191.5]
     [data-hud="notify-column"] [924, 144.5, 320 × 316.6]
     → 149.6 px of vertical overlap × 272 = **40 691 px²**, and
       `elementFromPoint` at their own centres returned a column card for
       EIGHT of the deck's controls — its own «🎬 Демонстрация ▾» toggle, all
       five annotation ticks, ⏸, ⏮ and ⏭. Every occluder computes
       `pointer-events: auto` (the briefing card is deliberately not ghosted),
       and a click synthesised at each dead centre was delivered to the column,
       so this is not an `elementFromPoint` artifact.

   IT IS THE LANDING STATE, not an edge case: the deck opens by default, so on
   a 1264 × 619 window every lesson that carries a demonstration starts with a
   transport that cannot be operated AND cannot be closed — the toggle that
   would collapse it is itself one of the eight.

   WHY THE CORRIDOR CANNOT HOLD BOTH, in numbers. The right corridor runs from
   the column's top (52) to the deck's floor (`ROOMY_HUD_FLOOR_PX`), which on
   this stage is 358.5 px. The column with a five-step briefing up is 316.6 and
   the open deck was 191.5: 508 px of demand against 358.5 of supply. No
   z-index and no reserve can settle that — one of them has to be somewhere
   else, which is exactly the conclusion the previous pass reached and left
   named rather than half-done.

   THE COLUMN IS NOT THE ONE THAT MOVES. It is where the authored sentence
   lives (THEO-4), it is the founder's own right-edge rail, and capping it here
   clips a numbered briefing — the trade the previous pass refused, correctly.
   The deck is a TRANSPORT and it is the newcomer to this corridor (the
   2026-08-03 pass dragged it here), so the deck yields: the same arbitration
   `ROOMY_MINIMAP_LANE_PX` already used against the map toggle.

   IT CHANGES CORRIDOR, which is the answer the LANDSCAPE PHONE already ships
   (`DECK_COMPACT_OPEN_LEFT_CSS`) and the second corridor the founder drew.
   Collapsed is untouched — it keeps the right edge, the map toggle's lane and
   the 8 px gutter at x 1196 that row verified.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ROOMY, OPEN: the left edge. The same 0.75 rem gutter the keyboard legend
 * already stands on, so the two share one rail rather than two.
 */
export const DECK_ROOMY_OPEN_LEFT_CSS = `calc(0.75rem + env(safe-area-inset-left, 0px))`;

/**
 * ROOMY, OPEN: wide enough that the transport stops wrapping.
 *
 * MEASURED, three widths, same stage, deck open and narrating:
 *
 *   22 rem (352 px)  deck 175 → 239 px tall   the row wraps to two lines
 *   26 rem (416 px)  deck 135 → 179 px tall   ONE line
 *   30 rem (480 px)  deck 135 → 179 px tall   no further gain
 *
 * 26 rem is the knee and it is worth 64 px of corridor — the difference
 * between the left corridor holding this beside the legend and not. Same trick
 * and same reason as `DECK_COMPACT_OPEN_WIDTH_CSS` in landscape.
 *
 * `min()` because a roomy stage starts at 641 px (`COMPACT_MAX_WIDTH_PX`), and
 * 416 px of deck on a 641 px stage is two thirds of the picture. 40 % is the
 * mirror of the column's own contract — `NOTIFY_COLUMN_MIN_LEFT_FRACTION` says
 * a RIGHT panel may not come left of 0.6, so a LEFT panel may not come right of
 * 0.4 — which keeps the road's centre band clear on any width.
 */
export const DECK_ROOMY_OPEN_WIDTH_CSS = `min(26rem, calc(40% - 0.75rem))`;

/**
 * ROOMY: the teach card's box, px — a CONSTANT, for the reason the touch one is.
 *
 * THE SECOND DEFECT THIS ROW FOUND, and nobody had looked because every probe
 * before it measured STATIC states. Sampled at 10 Hz for 30 s while the ghost
 * drove and the caption narrated (25 distinct caption texts inside the window):
 * the roomy deck's own height swung **135 → 259 px**, and its «🎬 Демонстрация ▾»
 * toggle jumped **84 px between two consecutive 100 ms samples** against a
 * half-extent of 13.3. A finger — or a mouse already moving to the button — is
 * off it. That is the founder's „elements moving when popups appear", on the
 * one control that closes the thing, on the desktop this row is about.
 *
 * `TraceTimeline`'s touch branch already fixed exactly this and says so; the
 * roomy branch was left as „it appears when there is an annotation and the
 * panel grows". It no longer grows: the box is fixed and the text scrolls
 * inside it, so nothing is lost.
 *
 * 138 = 18 px of padding and border plus SIX whole lines of the card's own
 * 20 px leading.
 *
 * ⚠ IT WAS 58, THEN 78, AND BOTH WERE BUDGETS SET BY WHAT WAS FREE RATHER THAN
 * BY WHAT THE CORPUS NEEDS. 58 clamped 628 of the 1 811 authored captions; 78
 * clamped 78 of them; and the note that used to stand here said a fourth line
 * „is the first one that is not free" and left it there. That is the same
 * mistake one level down from the one this file already caught: a budget
 * measured against the space instead of against the text, then applied to a
 * corpus nobody had laid out.
 *
 * 138 IS NOT A GUESS EITHER — IT IS THE MEASURED TALLEST. Laid out in this very
 * box at this very width (416 px), in WebKit, on a PRODUCTION build
 * (2026-08-12, `deck-captions.mjs --prod`), the worst caption in the bank
 * overflowed a 78 px box by exactly 60 px. 78 + 60 = 138, which is a whole
 * number of lines, and at 138 the sweep reports **0 / 1811**. The longest
 * annotation is 249 characters (`sc-rb-exit-signal/mistake-barge-entry`) — the
 * one that carries «движещите се в кръга (ЗДвП чл. 50, ал. 1)» — and it is
 * SIX lines at this width, not the seven the old note claimed.
 *
 * WHAT THE EXTRA 60 PX COSTS, STATED. The deck goes 219 → 279 and the whole 60
 * comes out of the keyboard legend's cap, which is the one surface in that rail
 * that carries no live information, scrolls, and is hidden on every phone. On
 * the 619 px window the sweep uses that cap is
 * 619 − 108 − 279 − 47 − 8 − 12 = 165 px, and the ribbon legend still lands at
 * y 185. Nothing else in the rail moves.
 *
 * „It scrolls" is not an answer here and never was: a caption is on screen for
 * FOUR SECONDS (`traces/sample.ts`, windowSec = 4). An unhinted scroll region
 * cannot be discovered, reached and read inside four seconds; the text is gone
 * before the gesture lands. The box has to FIT, and
 * `tools/mobile/deck-captions.mjs` is the gate that keeps it fitting.
 */
export const DECK_ROOMY_CAPTION_HEIGHT_PX = 138;

/**
 * ROOMY, OPEN: the deck's whole height once the box above is a constant, px.
 *
 * 135 measured at rest at 26 rem, + the panel's own 6 px gap + the caption box
 * (138 since 2026-08-12 — the row above says why). It is a CONSTANT, which is
 * the only reason the legend below can reserve against it: a reserve against a
 * box that breathes is not a reserve. It went 199 → 219 with the third caption
 * line and 219 → 279 with the sixth, and every one of those pixels comes out of
 * the keyboard legend's cap — the one surface in that rail that carries no live
 * information, scrolls, and is hidden on every phone. Measured after each
 * change at 1264 × 619: the legend still lays out with its expander pinned, the
 * ribbon legend still lands on stage, and not one binding is lost.
 */
export const DECK_ROOMY_OPEN_HEIGHT_PX = 135 + 6 + DECK_ROOMY_CAPTION_HEIGHT_PX;

/**
 * …and what the keyboard legend keeps above it. 8 px is this HUD's gutter
 * everywhere; 12 is the legend's own `left-3 top-3` offset, which its cap has
 * to pay for because the cap is measured from the top of the stage.
 */
export const DECK_ROOMY_LEGEND_GUTTER_PX = 8;
export const CONTROLS_HELP_TOP_INSET_PX = 12;

/**
 * …and the lane the shadow-line ribbon legend keeps in the same rail, px.
 *
 * THE SURFACE NOBODY HAD MEASURED, because it had no name. «синя — пътят на
 * колата-сянка / зелена — маршрутът до целта» is `absolute left-3` on
 * `var(--sim-hud-floor)` in `LessonPlayShell` — the SAME floor and the SAME
 * gutter the open deck now uses — and it carried no `data-hud`. Every probe in
 * this row iterates that attribute, so all of them read straight through it:
 * the first measurement of the moved deck reported ZERO overlaps while sitting
 * [20, 304, 416 × 199] entirely on top of it at [20, 464, 202 × 39]. 7 878 px²,
 * a total occlusion, found by looking at the frame and then by widening the
 * probe to every top-level positioned box rather than the named ones.
 *
 * 47 = the legend's measured 39 px plus this HUD's 8 px gutter. It is reserved
 * whenever the deck is open, without asking whether the ribbon is actually
 * mounted: it renders on exactly the `shadowCar` / `pathRibbon` lessons that
 * carry a demonstration in the first place, and the cost of reserving it on the
 * few that do not is 47 px of a keyboard legend that is already scrolling.
 */
export const RIBBON_LEGEND_LANE_PX = 39 + 8;

/* `NOTIFY_COLUMN_DECK_MAX_LIFT_COMPACT` WAS HERE, AND IT DESCRIBED A RULE THE
   PRODUCT HAD ALREADY THROWN AWAY — dead-predicate census, 2026-08-26.

   It was the string "45%", and its own docstring explained why the compact
   deck is capped at 45 % of the stage. `PlayAreaStyles.tsx` says the opposite,
   in the imperative: „THE 45 % CAP IS GONE — 2026-08-10, row C1, and this is
   the largest single overlap the row was opened on." The cap stopped the deck
   being lifted into this column and did it by dropping the deck onto the thumb
   controls instead — 1 861 px² of the horn button on an iPhone 16 landscape,
   1 936 px² on the 780 × 360 Android. The shipped rule is now
   `bottom: TOUCH_CONTROLS_FLOOR` and nothing else.

   The constant survived the removal, exported from here and from the barrel,
   read by nobody — a documented justification, in production code, for
   behaviour the product deliberately does not have. That is worse than dead:
   the next lane to read it would have believed it. */

/* ═══════════════════════════════════════════════════════════════════════════
   THE DECK WHEN IT IS OPEN, ON A PHONE — 2026-08-10.

   WHAT WENT WRONG, MEASURED. Row C1 closed six overlaps by raising the deck's
   floor to the whole control band (TOUCH_CONTROLS_FLOOR, 257.5 px on an
   iPhone 16 landscape). The COLLAPSED pill fits above that floor with 45 px to
   spare. The OPEN deck is 231.5 px tall, hangs from the same floor, and on a
   393 px stage it therefore lays out at y = −96: the top 96 px of it — INCLUDING
   its own «🎬 Демонстрация ▾» toggle, which is the panel's first child and the
   only way to dismiss it — is off the top of the screen. Photographed on all
   four device profiles; the toggle's real click times out because there is
   nothing on stage to click. A panel a student cannot close is a trap.

   THE SPACE THAT IS ACTUALLY LEFT, measured in WebKit with the real insets,
   sc-zebra-approach@L1, deck open, both orientations:

     LANDSCAPE 852×393   «Меню на урока» ends y 52 · control band starts y 135.5
                         → 83.5 px of height, and 470 px of WIDTH beside it
     LANDSCAPE 780×360   menu ends y 52 · band starts y 124   → 72 px / 516 px
     PORTRAIT  393×852   column ends y 173.3 · band starts y 470 → 296.7 px of
                         height and 141.5 px of width
     PORTRAIT  360×780   column ends y 114.3 · band starts y 432 → 317.7 / 129.6

   So the two orientations have opposite budgets, and one desktop panel cannot
   serve both: landscape has width and no height, portrait has height and no
   width. The deck is therefore laid out ONCE as a wrapping row of 44 px
   controls, and the CONTAINER decides how it folds — one line in landscape,
   four in portrait. Same markup, same grammar as the rest of `data-sim-compact`.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The teach card inside the open deck: a FIXED box, not a card that grows.
 *
 * The caption is the annotation the demonstration is currently narrating, so it
 * changes as the ghost drives. On a bottom-anchored panel a caption that grows
 * by a line moves everything above it — including the toggle — WHILE the
 * student is reaching for it. Measured on 2026-08-10, iPhone 16 portrait: a
 * real (not dispatched) click on the toggle timed out at 6 s because the button
 * never held still long enough to be actionable. That is the founder's own
 * „elements moving when popups appear", on the one control that closes the
 * thing.
 *
 * So the box is a CONSTANT and the text scrolls inside it. The deck's open
 * height then depends only on its width, the toggle never moves while it is
 * open, and no sentence is lost — which is what THEO-4 asks of a card that
 * explains a graded moment.
 *
 * TWO SIZES, AND BOTH ARE WHOLE LINES — 14 px of padding and border plus a
 * whole number of the card's own 1 rem leading. A box that ends mid-glyph reads
 * as a broken panel rather than as something to scroll, and the first pass at
 * this row photographed exactly that at 393 × 852 («пътеката» cut through the
 * middle).
 *
 * ⚠ BOTH WERE SIZED AGAINST THE PILOT TRACE — „the LONGEST annotation, measured
 * rather than counted: 71 characters" — AND THE PILOT IS NOT THE CORPUS. The
 * trace bank holds 1 811 distinct captions; the median is 80 characters and the
 * longest 249. Measured against the real bank in the real box, the 78 px
 * portrait size clamped 89 % of them. See the PORTRAIT block further down for
 * the sweep and for what changed.
 *
 *   landscape  14 + 2 × 16 = 46, of a 116 px corridor (780 × 360, the binding
 *              one) that also has to hold a 44 px transport row. UNCHANGED and
 *              still a fixed height: the landscape deck is TOP-anchored, so a
 *              caption that grows pushes its own toggle down the screen.
 *   portrait   14 + 10 × 16 = 174 — a CEILING now, not a height. The portrait
 *              deck is bottom-anchored and its toggle rides the transport row,
 *              so the card grows upward into empty stage and no control moves.
 *
 * Published as CUSTOM PROPERTIES rather than branched in the component: which
 * of the two applies is the „short stage" question, and PlayAreaStyles' media
 * query is where that question is already answered. A second copy of 560 px in
 * TypeScript is how the two would drift.
 */
export const DECK_TOUCH_CAPTION_VAR = "--deck-caption-h";
export const DECK_TOUCH_CAPTION_HEIGHT_PX = 46;
export const DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX = 174;
/* `DECK_TOUCH_CAPTION_LINE_PX` (30) STOOD HERE UNTIL 2026-08-12, J-WAVE-4.
   It was the one-line landscape budget, and it never fitted the corridor it was
   written for — the box it produced measured 13.5 px on an iPhone and −22 on
   the Samsung. It is not tuned, it is GONE: the landscape caption no longer
   competes for that corridor at all. See `DECK_TOUCH_TRANSPORT_ROW_PX` and
   `DECK_TOUCH_CAPTION_ROAD_MAX_PX` below for what replaced it and for the
   production measurement that condemned it. */

/**
 * PORTRAIT: how much of the corridor the open deck leaves to the column above.
 *
 * 108 px (6.75 rem) is the worst notification card this project has measured —
 * 106.3 px, the two-chip „ЗАЩО" peek — plus a rounding. The deck and the column
 * share one corridor in portrait; the column's own compact cap already runs all
 * the way down to the control band, so without this the two can be told to
 * occupy the same pixels the moment a briefing is long.
 *
 * It is spent by the DECK and not by the column on purpose: the column is where
 * the authored sentence lives (a starved column printed „ЗАЩО" and nothing
 * else, 2026-08-09), and the deck is a transport the student opened on purpose
 * and can close again.
 */
export const DECK_COMPACT_COLUMN_RESERVE_PX = 108;

/**
 * LANDSCAPE, OPEN: the left edge, past the lesson menu.
 *
 * The menu button is `left: calc(0.5rem + env(safe-area-inset-left))` and
 * `h-11 min-w-11 px-2` — measured 47.6 × 44 at [67, 8] on an iPhone 16
 * landscape and [8, 8] on the 780 × 360 Android. Clearing it horizontally
 * rather than vertically is what buys the deck the top 52 px of the stage, and
 * that is the difference between a 83.5 px budget and a 127.5 px one — i.e.
 * between „one row and no caption" and „one row and a caption".
 *
 * 3.5 rem (56) rather than the measured 47.6: the extra 8.4 px is the gutter,
 * and a round number survives the menu's own label changing width.
 */
export const DECK_COMPACT_OPEN_LEFT_CSS = `calc(0.5rem + 3.5rem + env(safe-area-inset-left, 0px))`;

/**
 * LANDSCAPE, OPEN: as wide as what is left between that edge and the column.
 *
 * `100%` is the STAGE, which is the whole viewport on any compact screen (the
 * shell is immersive there — immersive.ts). Resolves to 410 px at 852 × 393 and
 * 456 px at 780 × 360, against a transport row whose six 44 px controls plus
 * gaps plus a 6 rem minimum scrub bar need 400. It fits on one line, which is
 * the entire point of moving it here.
 */
export const DECK_COMPACT_OPEN_WIDTH_CSS = `calc(100% - ${DECK_COMPACT_OPEN_LEFT_CSS} - ${NOTIFY_COLUMN_RIGHT_CSS} - ${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - 0.5rem)`;

/* ── …and the same arithmetic in numbers, so the CSS above can be asserted.
      The transport is SIX 44 px circles — the deck's own toggle, ⏸, ⏮, ⏭, the
      speed cycler and the loop — plus a scrub bar that may not be squeezed
      below 6 rem, inside a panel with 14 px of padding and border. A width
      that clears this lays the whole transport out on one line; a width that
      does not folds it, which is exactly what the portrait column wants. */
export const DECK_TOUCH_TARGET_PX = 44;
export const DECK_TOUCH_ROW_CONTROLS = 6;
export const DECK_TOUCH_GAP_PX = 4;
export const DECK_TOUCH_SCRUB_MIN_PX = 96;
export const DECK_TOUCH_PANEL_CHROME_PX = 14;

/** The narrowest deck whose transport still lays out on ONE line, px. */
export function deckTouchRowMinWidthPx(): number {
  const items = DECK_TOUCH_ROW_CONTROLS + 1; // …the scrub bar is the seventh
  return (
    DECK_TOUCH_PANEL_CHROME_PX +
    DECK_TOUCH_ROW_CONTROLS * DECK_TOUCH_TARGET_PX +
    DECK_TOUCH_SCRUB_MIN_PX +
    (items - 1) * DECK_TOUCH_GAP_PX
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PORTRAIT, OPEN: THE DECK LEAVES THE 36 % LANE — 2026-08-11, the caption row.

   FOUNDER, PORTRAIT PHONE, DECK OPEN: «Спри НАПЪЛНО … броим до три» renders
   without „броим до три". Measured (WebKit, real insets, sc-junction-stop@L1,
   the real shell): the shipped caption «Пълно спиране ПРЕДИ линията: колелата
   неподвижни, броим до три.» needs 94 px in a 78 px box — **16 px, exactly one
   line, and the line it loses is „броим до три."**, i.e. the only part that
   says HOW LONG to stand still at a Б2. He was right to the pixel.

   AND IT IS NOT ONE STRING. Every authored `textBg` in the trace bank — 1 811
   distinct captions across 503 traces — laid out in the real box on all four
   device profiles:

     iPhone 16 portrait   141 × 78   1 612 / 1 811 clamped (89.0 %), worst 208 px
     Android portrait     130 × 78   1 727 / 1 811 clamped (95.4 %), worst 256 px
     iPhone 16 landscape  410 × 46     298 / 1 811 clamped (16.5 %), worst 48 px
     Android landscape    456 × 46     144 / 1 811 clamped ( 8.0 %), worst 48 px
     Desktop 1264 × 619   416 × 58     628 / 1 811 clamped (34.7 %), worst 80 px

   Only 84 of 1 811 render whole on all five, and the longest that does is 57
   characters. The box was sized against „the LONGEST annotation in the PILOT
   trace, 71 characters" (see DECK_TOUCH_CAPTION_HEIGHT_PX) — the corpus median
   is 80 and its maximum 249, so the budget was never the corpus's.

   „IT SCROLLS" IS NOT THE ANSWER, and this is the fact that settles it: a
   caption is on screen for FOUR SECONDS (`activeAnnotationIndex`, windowSec =
   4). A student cannot discover an unhinted scroll region, reach it and read it
   inside four seconds while a ghost car is driving — and the text is gone
   before the gesture lands. A box the text scrolls in is only honest when the
   text FITS; otherwise it is a clamp with extra steps.

   WHAT CHANGES, AND WHY IT IS FREE. The open deck used to inherit the compact
   NOTIFICATION lane — `NOTIFY_COLUMN_WIDTH_CSS_COMPACT`, 36 % of the stage,
   141.5 px on an iPhone 16 and 129.6 px on the 360 Android — because the
   COLLAPSED pill joined that right-edge rail on 2026-08-03. The open panel is
   not a notification and does not have to. Census of every painting box on the
   stage with the deck open (iPhone 16 portrait, 393 × 852, the probe's own
   40 px negative control passed): between the deck's ceiling (y 186) and the
   control band (y 470) there is NOTHING left of x 239.5. The column above ends
   at y 173.3; the nearest thumb control is «Пауза» at y 506. The strip is empty
   across the full width.

   So in PORTRAIT the open deck spans the stage between the same two gutters the
   column already stands on, and that buys two things at once:

     · the caption box goes 141.5 → 369 px wide on an iPhone 16 (336 on the
       360), i.e. 2.6× the characters per line;
     · the transport stops folding to FOUR rows. `deckTouchRowMinWidthPx()` is
       398, so 369 still folds — to TWO — which is 106 px against the 202 px
       measured today. Ninety-six pixels come back to the caption.

   LANDSCAPE IS DELIBERATELY UNTOUCHED. Its corridor is 116 px on the 360
   (menu bottom → control band) against a 44 px transport, so the caption there
   has ten pixels of slack and nowhere to go; and the tightest gap on the whole
   screen — 15 px between the reverse message and this deck's 🔁 — lives in that
   orientation. The rule below restates left/right/width, and the short-stage
   media query restates all three back, so neither can leak into the other.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * PORTRAIT, OPEN: the left edge — the column's own gutter, mirrored.
 *
 * `NOTIFY_COLUMN_RIGHT_CSS` is the right one; a panel that spans the stage
 * stands on both, so the two are written from the same constant and cannot
 * drift into an off-centre deck.
 */
export const DECK_COMPACT_OPEN_PORTRAIT_LEFT_CSS = `calc(${rem(
  NOTIFY_COLUMN_GUTTER_PX,
)} + env(safe-area-inset-left, 0px))`;

/**
 * PORTRAIT, OPEN: the caption box is `height: auto` and this is its CEILING.
 *
 * THE „NOTHING MOVES" CONTRACT SURVIVES, and it survives for a reason that is
 * geometric rather than lucky. In portrait the deck is BOTTOM-anchored
 * (`bottom: TOUCH_CONTROLS_FLOOR`) and on a phone the deck's own toggle is the
 * FIRST CONTROL OF THE TRANSPORT ROW (`TraceTimeline`'s `leading`), which is the
 * deck's LAST child. A caption that grows therefore grows UPWARD into empty
 * stage — every control in the deck keeps its exact y. That is the whole reason
 * the 2026-08-10 pass had to freeze the box: back then it did not, because the
 * caption was fixed and the panel could not give.
 *
 * LANDSCAPE gets it a different way — see `DECK_TOUCH_CAPTION_ROAD_MAX_PX`.
 * There the deck is TOP-anchored, so a caption that grows INSIDE it pushes the
 * transport and its toggle down the screen; the caption therefore leaves the
 * deck's flow entirely and hangs below it over the road, where nothing can be
 * pushed because nothing is under it.
 *
 * The portrait number is `DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX` — the same
 * constant that used to be the portrait box's fixed HEIGHT, now its ceiling. It
 * is published as a second custom property so the component can ask for a
 * height and a max-height without either branch of the media query having to
 * fight an inline style (the cascade trap this file's own glance rules carry an
 * `!important` for).
 */
export const DECK_TOUCH_CAPTION_MAX_VAR = "--deck-caption-max-h";

/**
 * LANDSCAPE, OPEN: the deck's whole height once the caption is out of its flow.
 *
 * ⚠ THIS REPLACES `DECK_TOUCH_CAPTION_LINE_PX`, AND IT REPLACES IT BECAUSE THE
 * ONE-LINE BUDGET DID NOT SURVIVE ITS OWN MEASUREMENT. J-WAVE-2 moved this deck
 * below the top rail — correctly; the rail had 20 064 px² of it — and paid for
 * the 52 px out of the caption, predicting „iPhone 16 46 → 31 px, 780×360
 * Android 46 → 20 px, and on the gesture-bar Samsung it collapses". Measured
 * the next day in WebKit on a PRODUCTION build, on the real `/simulator` route,
 * with real insets:
 *
 *   iPhone 16 landscape   caption box 410 ×  13.5   1811 / 1811 captions cut
 *   780 × 360 Android     caption box 456 ×   2.0   box smaller than an EMPTY card
 *   Samsung gesture bar   caption box 456 × −22.0   the 58 px transport row does
 *                                                   not fit its own 40 px deck
 *
 * Not „the shortest sideways phone" — EVERY sideways phone, including the
 * founder's, and photographed: «Напред е път с предимство и знак Б2 „Спри!"…»
 * sliced horizontally through the middle of its own glyphs. Landscape is how
 * anyone drives, so that is 100 % of the demonstration's authored teaching text
 * gone, on the orientation that matters, with the law in it.
 *
 * The corridor cannot be argued with: 75.5 px on an iPhone and 40 px on the
 * Samsung, against a transport row that is 58 px and `shrink-0`. So the caption
 * stops competing for it. Out of flow, the deck is EXACTLY its transport row —
 * which is the number below, and which also fixes the Samsung, where the row
 * had been overflowing its own container since the rail landed.
 *
 * 58 = a 44 px touch row + the panel's 12 px of padding + 2 px of border. It is
 * the panel's MEASURED height on all three landscape profiles (the transport
 * folds to one line at 410–456 px of width — `TraceTimeline`'s THE FOLD).
 */
export const DECK_TOUCH_TRANSPORT_ROW_PX = 58;

/**
 * LANDSCAPE, OPEN: the caption's ceiling once it hangs over the road, px.
 *
 * 174 = 14 px of the card's padding and border plus TEN whole lines of its own
 * 16 px leading — the same arithmetic, and the same number, as the portrait
 * ceiling. That is a coincidence of two different derivations, not a shared
 * constant, so it is written out here rather than aliased.
 *
 * WHERE THE ROOM COMES FROM, measured on production with the deck open and a
 * caption live (`tools/mobile/.out/j4cap/census.mjs`, WebKit, real insets):
 *
 *   iPhone 16 852×393   deck ends y 118 · steering arc [0,236 267×157] ·
 *                       drive pad [617,220 235×173] · dash dock y 338
 *   Samsung  780×360    deck ends y 118 · steering arc [0,200 208×160] ·
 *                       drive pad [604,184 176×176] · dash dock y 312
 *
 * Below the deck and to the RIGHT of the steering arc, nothing is painted until
 * the dash dock. That is 212 px on the iPhone and 186 px on the Samsung — the
 * binding one — and 174 is the largest whole number of lines inside 186.
 *
 * THE LANE'S LEFT EDGE IS THE ARC'S RIGHT EDGE, and the two profiles agree to
 * the pixel for a reason rather than by luck: the arc reaches
 * `env(safe-area-inset-left) + STEER_PAD_WIDTH_CSS` and this deck starts at
 * `env(safe-area-inset-left) + 0.5rem + 3.5rem`, so the clearance is
 * `STEER_PAD_WIDTH_CSS − 3.5rem` = 152 px on BOTH, inset-independent.
 * PlayAreaStyles writes exactly that expression, so the lane follows the pad if
 * the pad is ever reshaped.
 *
 * AND IT PAINTS NO RECTANGLE. Over the road the card drops its background, its
 * border colour and its backdrop-filter and keeps only glyphs with a shadow —
 * the treatment `LessonScene`'s first-run hint already uses, and for the reason
 * that block states: „no scrim, no card, no border, no backdrop-filter — every
 * one of those is a painted rectangle and the screen budget charges each one".
 * The 1 px border stays in the BOX MODEL (transparent) so the 14 px of chrome
 * above is still true.
 */
export const DECK_TOUCH_CAPTION_ROAD_MAX_PX = 174;

/** What `DECK_COMPACT_OPEN_WIDTH_CSS` resolves to on a given landscape stage. */
export function deckCompactOpenWidthPx(
  stageWidthPx: number,
  insets: { left?: number; right?: number } = {},
): number {
  const left = 8 + 56 + (insets.left ?? 0);
  const right =
    NOTIFY_COLUMN_GUTTER_PX + (insets.right ?? 0) + notifyColumnWidthPx(stageWidthPx, true) + 8;
  return stageWidthPx - left - right;
}
