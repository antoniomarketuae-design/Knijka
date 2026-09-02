"use client";

import { HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION } from "@/modules/sim/scene/vitok/cabinLook";
import {
  notifyColumnFloorCss,
  PAD_CORRIDOR_LEFT_CSS,
  PAD_CORRIDOR_RIGHT_CSS,
  STEER_PAD_DECK_CLEARANCE_CSS,
  TOP_RAIL_ROW_CSS,
  TOUCH_BAND_CSS_VARS,
  TOUCH_CONTROLS_FLOOR,
} from "../TouchControls";
import { ROOMY_HUD_FLOOR_PX, ROOMY_MINIMAP_LANE_PX } from "./immersive";
import {
  CONTROLS_HELP_TOP_INSET_PX,
  DECK_COMPACT_COLUMN_RESERVE_PX,
  DECK_COMPACT_OPEN_LEFT_CSS,
  DECK_COMPACT_OPEN_PORTRAIT_LEFT_CSS,
  DECK_COMPACT_OPEN_WIDTH_CSS,
  DECK_ROOMY_LEGEND_GUTTER_PX,
  DECK_ROOMY_OPEN_HEIGHT_PX,
  DECK_ROOMY_OPEN_LEFT_CSS,
  DECK_ROOMY_OPEN_WIDTH_CSS,
  DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX,
  DECK_TOUCH_CAPTION_MAX_VAR,
  DECK_TOUCH_CAPTION_ROAD_MAX_PX,
  DECK_TOUCH_CAPTION_VAR,
  DECK_TOUCH_TRANSPORT_ROW_PX,
  NOTIFY_COLUMN_DECK_RESERVE_PX,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_TOP_CSS_ROOMY,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
  RIBBON_LEGEND_LANE_PX,
} from "@/modules/sim/hud";
// Deep import, and for the reason LessonScene's own two deep imports state: the
// barrel belongs to the HUD lane, this wave does not own it, and a rule that
// needs one new length is not worth a cross-lane edit to a re-export list.
import {
  FLANK_LANE_VAR,
  HAZARD_BAND_TOP_FRACTION,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
  notifyColumnMaxHeightCss,
} from "@/modules/sim/hud/notifyColumn";

/**
 * One CSS rule, mounted by the play shell: while a LETTERBOXED session is on
 * screen, the page's prose width cap does not apply to it.
 *
 * WHY IT IS A GLOBAL SELECTOR AND NOT A CLASS. The cap does not live on the
 * shell — it lives on the (dashboard) group's
 * `<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">`,
 * a 72 rem reading measure that is exactly right for the theory reader, the
 * exam runner and the lesson-select shelf, and exactly wrong for a driving
 * simulator. Measured in the harness at 1920×1080: it held the picture to
 * 1088×612 with 824 px of empty column beside it (founder review 2026-07-28:
 * „there is alot of dark space that we can use to make the screen bigger").
 * The shell cannot widen an ancestor from the inside, and editing the layout
 * would widen every dashboard page, not the one that needs it.
 *
 * `:has()` scopes it precisely: the cap lifts only for a <main> that currently
 * contains a letterboxed session, and drops back the instant the session ends
 * or goes fullscreen (the attribute is absent in the immersive layout). The
 * sidebar is untouched — <main> is a grid column, so it grows into the content
 * area and never under the nav.
 *
 * Specificity/cascade: `main:has([data-sim-play])` is (0,1,1) against
 * `.max-w-6xl` (0,1,0), and this <style> is unlayered while Tailwind's
 * utilities are layered — it wins on both counts.
 *
 * The padding goes with it, and to the same 0.5 rem the IMMERSIVE layout
 * already uses (`p-2` on the shell root) — so entering fullscreen is a change
 * of size, not a change of framing. On a 1366×768 laptop the column is already
 * narrower than the 72 rem cap, so the padding is the only lever there at all
 * (1044 px → 1094 px of picture); on a 1920×1080 window it is worth another
 * 48 px on top of the cap being lifted.
 *
 * GRACEFUL DEGRADATION IS THE POINT of doing it this way: a browser without
 * `:has()` simply keeps today's layout (a 16:9 picture in the reading column),
 * which is a smaller picture, never a broken one. The height cap the shell
 * applies inline is independent of this rule and works everywhere.
 */
export function PlayAreaStyles() {
  return (
    <style>{`
      main:has([data-sim-play="letterbox"]) {
        max-width: none;
        padding: 0.5rem;
      }

      /* ══ THE THUMB BAND'S FOUR LENGTHS — doc 91 §N1, 2026-08-13 ═══════════
         Authored HERE and not as an inline style on TouchControls because
         three of the four need an AT-RULE and a React style prop cannot carry
         one: @supports is the older-engine fallback for svh, @media
         (orientation) is the arc's landscape/portrait split, and @media
         (max-height) is the one short-stage collapse. The values and the
         reasoning are in TouchControls (TOUCH_BAND_CSS_VARS); this file only
         mounts them, so there is still one definition.

         --sim-svh DELIBERATELY HAS NO DECLARATION OUTSIDE @supports. Every
         consumer writes var(--sim-svh, 100vh), so an engine without
         small-viewport units falls back to 100vh — on iOS the LARGE viewport,
         which is stable too, and on this shell's stage always at least the
         stage, so the band lift resolves to 0 and the layout is exactly what
         shipped before this wave. It degrades to the status quo. */
${TOUCH_BAND_CSS_VARS}

      /* ------------------------------------------------------------------
         COMPACT (phone-shaped viewport, 2026-07-28 second pass).

         Two pieces of DESKTOP chrome are rendered by the scene itself, not by
         this shell, and both land in the corner the micro menu needs:

           [data-hud="controls-help"]  the „⌨ Клавиши" keyboard legend, at
             left-3 top-3 — a list of key bindings on a device with no keys.
             It is already collapsed on touch, but the chip still sits exactly
             where the one control a phone DOES need has to go.
           [data-hud="difficulty"]     the Начинаещ/Нормален/Напреднал picker
             at right-3 top-3. It used to be nudged clear of the notch and
             left there; since J-WAVE-3 it is not on a phone at all — see the
             block on the rule itself for the 255-into-167.5 arithmetic and for
             where the control went instead.

         A CSS rule and not a prop, deliberately: LessonScene belongs to the
         scene lane, both elements already carry stable data-hud names, and a
         media-query-free rule driven by the shell's own attribute keeps ONE
         definition of "compact" in the codebase (immersive.ts) instead of a
         second one written in @media that would drift from it.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="controls-help"] {
        display: none;
      }
      /* ══════════════════════════════════════════════════════════════════
         THE TIER PICKER LEAVES THE PHONE'S TOP STRIP — 2026-08-12, J-WAVE-3.

         THE DEAD CONTROL, MEASURED (WebKit, real insets, „/dev/drive-rig“
         l0-free-drive, all three PORTRAIT profiles, in EVERY state and on both
         routes). „elementFromPoint“ at «Начинаещ»'s own centre answered
         «Пауза»:

           iphone16-portrait  1 dead, 1 325 px²
                              «Пауза» [128,67 53×44] ∩ «Начинаещ» [126,72 78×25]
           small-portrait     1 dead, 1 975 px² — «Пауза»∩«Начинаещ» 1 075,
                              «Изглед»∩«Начинаещ» 775, «Пауза»∩«Нормален» 125
           galaxy-portrait    1 dead, 1 975 px² — identical to its 360×780 twin

         and, on the same frames, «Начинаещ» printed straight ACROSS «ИЗГЛЕД»
         and «ПАУЗА». That scored 0 in the text-over-control column only because
         the metric skips text inside a button — the number was right and the
         number was not the whole answer.

         TWO OWNERS, ONE STRIP. „TOP_RAIL_RIGHT_CSS“ reserves the notification
         column's lane and nothing else; this rule used to pin the picker to
         „top: 0.5rem + inset, right: 0.75rem“. Neither knew about the other.

         AND THE STRIP CANNOT HOLD BOTH — this is arithmetic, not a taste call.
         The picker lays out 255 px («Начинаещ» 78 + «Нормален» 78 +
         «Напреднал» 85, two 4 px gaps, 8 px of padding). What the top band has
         to offer it, on a 393 px portrait stage:

           the rail's lane   x 64 → 231.5  = 167.5 px, and five word-buttons
                             are ALREADY wrapping to three rows inside it
           the column's lane x 239.5 → 381 = 141.5 px (min(15rem, 36vw)), 129.6
                             on the 360 px Android

         255 into 167.5, or 255 into 141.5. Neither fits, and abbreviating does
         not rescue it: three targets at the product's own 44 px floor plus two
         gaps is 148 px, which is already wider than the 129.6 the narrowest
         phone leaves. Stacking them vertically fits the width and costs 132 px
         of the notification lane — the corridor the authored sentence lives in.

         SO IT IS NOT MOVED, IT IS REPLACED. The picker is the surface this file
         has already twice ruled may stand down — „the only one of the three
         that carries no information" (the glance rule below) and rank 4 of four
         in row C1, „chrome, and the only one of the four that is still one tap
         away at any time from the ⚙ sheet". THAT LAST CLAUSE WAS NOT TRUE: the
         sheet had no tier control. It does now („TouchControls“, the «НОРМ»
         cell, immediately before «СЪЕД» because the tier is what decides
         whether that clutch exists) — so the sentence this file has been
         telling itself since row C1 is finally the sentence it ships.

         ROOMY IS UNTOUCHED. There the corner is 320 px of column starting
         2.75 rem lower („NOTIFY_COLUMN_TOP_CSS_ROOMY“ clears the picker's row
         by construction), the rail does not exist, and the segmented control is
         the right shape for a mouse. This is a phone rule and only a phone rule.
         ══════════════════════════════════════════════════════════════════ */
      [data-sim-compact="on"] [data-hud="difficulty"] {
        display: none;
      }

      /* ══════════════════════════════════════════════════════════════════
         THE TWO SCENE-OWNED PANELS JOIN THE RIGHT-EDGE COLUMN — 2026-08-03.

         FOUNDER, THIRD ASKING, with a drawing whose two purple corridors run
         down the LEFT and RIGHT edges and leave the middle empty: „all the
         texts that are in the front: the task, the demonstration window, and
         the guidance what to do, the instructions too."

         Two of the four he named are not the shell's to move:

           [data-hud="demo-deck"]     „🎬 Демонстрация" + the scrub bar and the
             transport row. absolute bottom-[6.75rem] left-1/2 -translate-x-1/2
             w-[min(88%,26rem)] — measured at 1280×800 it laid out 416 px
             starting at x = 432, i.e. dead centre over the wheel and the road.
           [data-hud="audio-prompt"]  „Звукът е част от урока…" with its own
             «Разбрах». absolute left-1/2 top-3 w-[min(30rem,…)] — 480 px of
             card across the top of the picture.

         Both live in the SCENE tree (LessonScene.tsx / AudioLessonPrompt.tsx),
         which this lane does not own, and data-hud is the vocabulary the two
         trees share — the same reason the mirror rules and the row C1 priority
         rules below are written here rather than in twelve components. The
         numbers are interpolated from modules/sim/hud/notifyColumn.ts, so the
         column the shell renders, the column SimOverlay renders and the column
         these two are dragged into cannot drift apart.

         left: auto + transform: none is the load-bearing pair: both
         elements centre themselves with left-1/2 AND a translate, and undoing
         only one of them leaves the panel half a width off the screen. This
         stylesheet is unlayered while Tailwind's utilities are layered, so it
         wins the cascade without !important — the same fact the main:has()
         rule at the top of this file already relies on.

         The DECK keeps its floor rather than joining the top of the stack: it
         is a transport, not a notification, and a scrub bar under the thumb is
         where a scrub bar belongs. It is at the right edge, which is what was
         asked. On a phone that floor is TOUCH_CONTROLS_FLOOR and not
         bottom-[6.75rem] — 108 px is inside the control band, where the deck
         overlapped the steering wheel by 981 px² and the throttle by 363 px²
         (WebKit, iPhone 16 portrait 393×852). TOUCH_CONTROLS_FLOOR is
         interpolated from TouchControls so it follows the pads wherever they go.
         ══════════════════════════════════════════════════════════════════ */
      [data-hud="demo-deck"] {
        left: auto;
        /* …AND IT LEAVES THE MAP TOGGLE'S LANE AT ITS RIGHT EDGE — 2026-08-10.

           THE COLLISION, MEASURED (WebKit, 1264 × 619, the real lesson shell,
           sc-zebra-approach@L1). Collapsed: the deck's pill
           [1109.8, 476.5, 134.2 × 26.5] over the map toggle [1204, 463, 40 × 40]
           — 1 060 px², and „elementFromPoint" at the toggle's own centre
           answered «🎬 Демонстрация ▸». Open: the transport row wraps to two
           lines at this width, so the deck's box reaches y 491 and the hit test
           at the same point answered the row's wrapper. THE MAP TOGGLE WAS DEAD
           IN BOTH DECK STATES — a student could not open the minimap on any
           lesson that carries a demonstration.

           They collided because the deck MOVED here: it used to be centred over
           the road, and the 2026-08-03 pass dragged it into the right-edge
           column at the same floor and the same gutter the toggle and the
           shadow-line legend were already standing on. The deck is the
           newcomer, so the deck is what yields — the toggle stays exactly where
           students have been finding it.

           IT YIELDS SIDEWAYS AND NOT UPWARD, and that is the whole measurement,
           not a taste call. Lifting the deck by the same 48 px was tried first
           and re-measured: it freed the toggle and pushed the collapsed pill UP
           into the briefing card, where „elementFromPoint" then answered the
           column — one dead control traded for another, plus one more of the
           open deck's controls buried (13 of 13 instead of 12). Insetting the
           right edge instead moves nothing vertically: the deck keeps the
           column's LEFT edge, so nothing travels toward the road, and the
           corner reads as a notch cut for the toggle.

           The lane is the toggle's own size plus this HUD's 8 px gutter
           (immersive.ts), so the button and the clearance cannot drift.
           ROOMY only — the compact rule below restates both properties, and on
           a phone this toggle is not rendered at all (the micro menu carries
           «Карта»), so there is nothing there to clear. */
        right: calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${ROOMY_MINIMAP_LANE_PX}px);
        width: calc(${NOTIFY_COLUMN_WIDTH_CSS_ROOMY} - ${ROOMY_MINIMAP_LANE_PX}px);
        /* BOTH, and "translate" is the one that actually does the work here.
           Tailwind v4 compiles "-translate-x-1/2" to the INDEPENDENT translate
           property, not to transform — so a rule that only cancels transform
           reads as correct, computes "left: auto; right: 12px" exactly as
           intended, and still renders the panel 160 px (half its own width) to
           the left of where it says it is. Measured on 2026-08-03: the audio
           card resolved right = 12px and laid out at x = 780, not x = 940. */
        transform: none;
        translate: none;
        align-items: flex-end;
      }
      [data-sim-compact="on"] [data-hud="demo-deck"] {
        /* THE 45 % CAP IS GONE — 2026-08-10, row C1, and this is the largest
           single overlap the row was opened on.

           It used to read „min(TOUCH_CONTROLS_FLOOR, 45%)". The cap was added
           to stop the deck being LIFTED into the column on a short stage, and
           it did — by dropping it onto the thumb controls instead. Measured,
           WebKit, iPhone 16 landscape 852 × 393 with the real insets, the
           collapsed pill's hit rect [646.8, 177.7, 134.2 × 50.5] against:

             «Клаксон — задръж»  [667, 176, 44×44]   1 861 px²  (44 × 42.3)
             the drivetrain pad  [617, 220, 235×173] 1 100 px²  (134.2 × 8.2)

           and on the 780 × 360 Android 1 936 px² — the horn ENTIRELY under the
           deck — plus 198 px² of the right-mirror glance. None of the three was
           reported by any lane, because a scrub bar landing on the horn is not
           a shape anybody thought to look for.

           The floor alone is correct now that the arc no longer climbs (see
           TouchControls' ARC block): TOUCH_CONTROLS_FLOOR clears the whole band
           INCLUDING this button's own 0.75 rem ::before, which is what the
           floor's 1.25 rem gap is for. */
        bottom: ${TOUCH_CONTROLS_FLOOR};
        width: ${NOTIFY_COLUMN_WIDTH_CSS_COMPACT};
        /* …AND THE RIGHT EDGE IS RESTATED, NOT INHERITED — 2026-08-10.
           The base rule above now insets the deck by the map toggle's lane,
           which is a ROOMY fact: that toggle is not rendered on a phone at all.
           Without this line the compact deck would inherit the inset and every
           phone geometry this file measures — the 45 px of clearance above the
           control band, the landscape strip's width — would silently shift by
           48 px. It resolves to exactly the value the compact deck already had. */
        right: ${NOTIFY_COLUMN_RIGHT_CSS};
      }

      /* …AND ON A SHORT STAGE IT CHANGES CORRIDOR, because three things do not
         fit in one — the same sentence this file already writes about the tier
         picker, one surface further down.

         Landscape 852 × 393, top to bottom, everything the RIGHT corridor is
         asked to hold: 8 px of inset, a 106.3 px briefing card, the deck's
         50.5 px hit rect, and a control band of 152 (pad) + 20.5 (rise) + 44
         (station) + 21 (home indicator) = 237.5. That is 402.3 of a 393 px
         stage BEFORE a single gutter, and 414.3 with two. It cannot be done,
         and the two ways to not do it are to hide something or to move it.

         Hiding is worse here than it is for the tier picker: this is the
         transport for a demonstration that may be PLAYING, and chrome that
         blinks in and out as cards arrive is the founder's own „elements moving
         when popups appear". So it MOVES — to the other corridor he drew, which
         on a phone held sideways is empty from the lesson menu (ends y 52) down
         to the steering arc (starts y 171.5). Measured there afterwards: the
         pill at [71, 109, 240 × 26.5] and its hit rect at y 97–147.5, i.e.
         45 px clear of the menu above it and 24 px clear of the arc below.

         It keeps the DRIVE side's floor rather than the steering side's, which
         is 16 px taller than it needs to be here — one constant, and the extra
         clearance is free. Portrait is untouched: there the pill starts at
         y 443.5 against a column that ends by y 173, so the right corridor
         holds all three with 270 px to spare. */
      @media (max-height: 560px) {
        [data-sim-compact="on"] [data-hud="demo-deck"] {
          right: auto;
          left: calc(0.75rem + env(safe-area-inset-left, 0px));
          align-items: flex-start;
        }
      }

      /* ══════════════════════════════════════════════════════════════════
         …AND WHEN IT IS OPEN IT IS A DIFFERENT SHAPE — 2026-08-10.

         THE REGRESSION THIS CLOSES, AND WE CAUSED IT. Raising the floor to the
         whole control band above is right for the COLLAPSED pill (26.5 px,
         45 px of clearance) and impossible for the OPEN panel (231.5 px). On a
         393 px landscape stage the panel therefore laid out at y = −96 with its
         own toggle off the top of the screen: measured on all four device
         profiles, the deck could be opened and then not closed, its pause
         button sat on «Меню на урока» (1 024 px² at 852 × 393, 864 px² at
         780 × 360) and elementFromPoint at the pause button's own centre
         returned the menu.

         Neither the floor nor the six overlaps it closed are given back. What
         changes is that the OPEN deck stops hanging from that floor:

         PORTRAIT keeps the floor and gains a ceiling. The deck and the
         notification column share this corridor, and the column's compact cap
         already runs down to the band — so the deck, which the student opened
         and can close, yields DECK_COMPACT_COLUMN_RESERVE_PX to the column,
         which is where the authored sentence lives. Resolves to 295 px of deck
         at 393 × 852 and 316 px at 360 × 780, against a measured open height of
         about 256.

         LANDSCAPE hangs from the TOP instead, beside the lesson menu rather
         than under it. Under the menu there are 83.5 px of clear corridor
         (852 × 393) and 72 px (780 × 360) — one row of 44 px controls and no
         caption. Beside it there are 127.5 and 116, which is a row AND the
         teach card, and 410–456 px of width for the row to lay out on ONE line.
         The numbers come from notifyColumn.ts so the CSS here and the arithmetic
         in the tests cannot drift.
         ══════════════════════════════════════════════════════════════════ */
      [data-sim-compact="on"] [data-hud="demo-deck"][data-deck-open="true"] {
        /* THE TEACH CARD GREW A CEILING INSTEAD OF A HEIGHT — 2026-08-11.

           This used to publish ONE number, 78 px, „four lines fit the portrait
           column", and it was sized against the pilot trace's longest caption
           (71 characters). The corpus is 1 811 captions with a median of 80 and
           a maximum of 249, and measured in this very box on this very phone it
           clamped 89 % of them — including the founder's own «…броим до три»,
           which needs 94 px of a 78 px box and loses exactly the four words
           that say how long to stand still at a Б2. The full sweep, all five
           profiles, is in notifyColumn.ts.

           A caption is on screen for FOUR SECONDS (traces/sample.ts,
           activeAnnotationIndex windowSec = 4), so „it scrolls" was never an
           answer: an unhinted scroll region cannot be discovered, reached and
           read inside four seconds, and the text is gone before the gesture
           lands. The box has to FIT.

           So in PORTRAIT the box takes its content (height: auto) up to a ceiling,
           and the deck below spans the stage instead of the 36 % notification
           lane it inherited from the collapsed pill. The „nothing moves"
           contract is not weakened, it is re-derived: this deck is BOTTOM
           anchored and on a phone its toggle is the first control of the
           transport ROW — the deck's last child — so the card grows upward into
           stage that the census says is empty and every control keeps its y.
           The short-stage rule below restates the fixed height, because a
           TOP-anchored deck would push its own toggle down the screen. */
        ${DECK_TOUCH_CAPTION_VAR}: auto;
        ${DECK_TOUCH_CAPTION_MAX_VAR}: ${DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX / 16}rem;
        /* …AND THE OPEN PANEL LEAVES THE NOTIFICATION LANE. The collapsed pill
           keeps it (the rule above); this is the open panel, which is not a
           notification. Census with the deck open at 393 × 852: nothing paints
           left of x 239.5 between the deck's ceiling (y 186) and the control
           band (y 470) — the column above ends at 173.3 and the nearest thumb
           control is «Пауза» at y 506. Worth 141.5 → 369 px of caption width
           and one whole fold of the transport (202 → 106 px). */
        left: ${DECK_COMPACT_OPEN_PORTRAIT_LEFT_CSS};
        right: ${NOTIFY_COLUMN_RIGHT_CSS};
        width: auto;
        max-height: calc(
          100% - ${TOUCH_CONTROLS_FLOOR} - ${NOTIFY_COLUMN_TOP_CSS_COMPACT} -
            ${DECK_COMPACT_COLUMN_RESERVE_PX}px
        );
      }
      @media (max-height: 560px) {
        [data-sim-compact="on"] [data-hud="demo-deck"][data-deck-open="true"] {
          /* ══════════════════════════════════════════════════════════
             THE CAPTION STOPS COMPETING FOR THIS CORRIDOR — 2026-08-12,
             J-WAVE-4, and the previous rule's own prediction is why.

             That rule (one line, 30 px) said the loss would be limited to
             „the shortest sideways phone". Measured the next day in WebKit
             on a PRODUCTION build, on the real /simulator route, with real
             insets, deck open and a caption live:

               iPhone 16 landscape  caption box 410 ×  13.5  1811/1811 cut
               780 × 360 Android    caption box 456 ×   2.0  smaller than an
                                                             EMPTY card
               Samsung gesture bar  caption box 456 × −22.0  the 58 px
                                                             transport row does
                                                             not fit its 40 px
                                                             deck

             EVERY sideways phone, including the founder's, and photographed:
             «Напред е път с предимство и знак Б2 „Спри!"…» sliced horizontally
             through the middle of its glyphs. That is 100 % of the
             demonstration's authored teaching text — the citations included —
             gone on the orientation people actually drive in.

             The corridor is not negotiable (75.5 px iPhone, 40 px Samsung,
             against a shrink-0 58 px transport row), so the caption LEAVES it.
             Out of flow, the deck is exactly its transport row, which fits
             everywhere and fixes the Samsung overflow as a side effect. The
             caption is positioned below the deck, over the road, in the lane
             the census says is empty — see the deck-caption rule further down.
             ══════════════════════════════════════════════════════════ */
          ${DECK_TOUCH_CAPTION_VAR}: auto;
          ${DECK_TOUCH_CAPTION_MAX_VAR}: ${DECK_TOUCH_CAPTION_ROAD_MAX_PX / 16}rem;
          /* …AND IT STARTS BELOW THE TOP RAIL — 2026-08-12, J-WAVE-2.
             The rail landed at "top: 0.5rem", "left: 0.5rem + 3.5rem", and
             that left bound is THIS DECK'S OWN clearance constant, taken by
             the rail because it is the one lane past «Меню». Sideways this
             deck hangs from the same "top", so the two started at the same
             point. Measured on the Samsung gesture-bar row (780 × 360, the
             34.6 % profile), deck [64,8 456×92] against rail [64,8 456×44]:
             20 064 px² of surface, NINE overlapping control pairs (768 px²,
             the transport's hit boxes reaching 3 px above their own row —
             «Пауза» ∩ «Пауза», the deck's ⏸ against the rail's word) and,
             with a caption up, 14 366 px² of the demonstration's own prose
             lying across all five rail buttons.
             THE RAIL IS THE FIXED ONE: it is the corner his reference reserves
             for the two opaque buttons and it has to be findable in every
             state, including this one. So the deck takes the lane below it —
             the same yield it already makes to the map toggle's lane, and one
             property rather than a second overlap patch.
             THE COST, STATED: this corridor was already tight, so the 52 px
             came out of the CAPTION, which was the "min-h-0" child here and
             therefore the thing that gave. That cost was UNDER-STATED — it was
             the whole caption on every sideways phone, not a few pixels on the
             shortest — and the block above carries the production measurement
             and the fix. The rail itself is untouched: it is still the fixed
             one and this deck still takes the lane below it. */
          top: calc(${NOTIFY_COLUMN_TOP_CSS_COMPACT} + ${TOP_RAIL_ROW_CSS});
          bottom: auto;
          right: auto;
          left: ${DECK_COMPACT_OPEN_LEFT_CSS};
          width: ${DECK_COMPACT_OPEN_WIDTH_CSS};
          /* THE DECK IS ITS TRANSPORT ROW, EXACTLY — 2026-08-12, J-WAVE-4.
             It used to be "whatever the corridor leaves", and on the Samsung
             the corridor leaves 40 px against a 58 px shrink-0 row: the deck
             was overflowing its own container and its caption box computed a
             NEGATIVE height (−22). With the caption out of flow the row is the
             only child, so the honest bound is the row. It is still a bound —
             a second child would clip and the overlap probe would say so — and
             it is derived, not copied (notifyColumn.ts). */
          max-height: ${DECK_TOUCH_TRANSPORT_ROW_PX / 16}rem;
        }

        /* ══════════════════════════════════════════════════════════════
           …AND THE CAPTION HANGS BELOW IT, OVER THE ROAD — J-WAVE-4.

           WHERE, and it is read off the running product rather than chosen.
           Census on production with the deck open and a caption live (WebKit,
           real insets, tools/mobile/.out/j4cap/census.mjs):

             iPhone 16 852×393  deck ends y 118 · arc [0,236 267×157] ·
                                pad [617,220 235×173] · dash dock y 338
             Samsung  780×360   deck ends y 118 · arc [0,200 208×160] ·
                                pad [604,184 176×176] · dash dock y 312

           Below the deck and RIGHT of the steering arc nothing is painted
           until the dash dock: 212 px of clear road on the iPhone, 186 on the
           Samsung. The ceiling is 174 (ten whole lines inside the smaller).

           THE LEFT EDGE IS THE ARC'S RIGHT EDGE, and it is TouchControls' own
           constant rather than a copy of today's 208 —
           STEER_PAD_DECK_CLEARANCE_CSS, 152 px on both landscape profiles,
           with the safe-area insets cancelling out of the arithmetic. That
           constant is in "vw" and not "%" for a reason its own note states:
           written with the pad's percentage this lane resolved against the
           DECK instead of the stage and landed at x 239 against an arc whose
           right edge is 267 — 1 792 px² of prose over «Волан» the moment a
           caption grew past two lines. Caught by re-measuring, not by reading.
           "right: 0" keeps the deck's own right edge, which already clears the
           drive pad (533 < 617) and the notification column (533 < 541).

           "width: auto" is NOT decoration: TraceTimeline gives this box
           Tailwind's "w-full", and width:100% beats a left/right pair — the
           box would lay out 410 px wide starting at x 275 and hang off the
           screen. Same class of trap as the "translate" note above.

           IT PAINTS NO RECTANGLE (the rule after this one). Over the road the
           card keeps its glyphs and a shadow and drops everything that fills
           pixels — the treatment LessonScene's first-run hint already uses,
           and for the reason that block gives. "pointer-events: none" so
           prose over the road can never answer for a control underneath it;
           the caption is not interactive and the lint below guarantees it
           never needs to scroll.
           ══════════════════════════════════════════════════════════════ */
        [data-sim-compact="on"]
          [data-hud="demo-deck"][data-deck-open="true"]
          [data-hud="deck-caption"] {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: ${STEER_PAD_DECK_CLEARANCE_CSS};
          right: 0;
          width: auto;
          pointer-events: none;
        }
        [data-sim-compact="on"]
          [data-hud="demo-deck"][data-deck-open="true"]
          [data-hud="deck-caption"]
          > div {
          /* The 1 px border stays in the BOX MODEL and only loses its colour,
             so the card's 14 px of chrome — the number the ceiling above is
             built from — is still true. */
          background: none;
          border-color: transparent;
          backdrop-filter: none;
          text-shadow:
            0 1px 4px rgba(0, 0, 0, 0.96),
            0 0 14px rgba(0, 0, 0, 0.8);
        }
      }

      /* ══════════════════════════════════════════════════════════════════
         …AND THE LAST SURFACE STILL STANDING ON THE DEAD 108 px FLOOR —
         2026-08-20, the row behind finding O53.

         O53 CLAIMED the rear-proximity badge is „hidden by the shadow
         transport". IT IS NOT, and the refutation is this file's own work:
         the deck is overridden in all four states above and is centred in
         none of them (roomy-collapsed and compact sit at the right edge,
         roomy-open takes the LEFT corridor, compact raises its floor to
         TOUCH_CONTROLS_FLOOR). Implementing O53 would have lifted a badge off
         a floor that is correct on every roomy stage, to clear a panel that
         left that corridor a fortnight earlier — a false refusal in layout
         form. The real defect was underneath the claim and is two things.

         THE FIRST WAS THAT WE COULD NOT REACH IT. „RearProximityCue“ carried
         no „data-hud“, so this stylesheet contained ZERO rules able to match
         it and every overlap probe in tools/mobile — all of which resolve an
         owner with „closest([data-hud])“ — read straight through it and
         reported it absent. THIRD TIME in this file's history: the shadow-line
         ribbon legend (7 878 px², a total occlusion, invisible until
         RIBBON_LEGEND_LANE_PX named it) and the objective banner (17 frames of
         the 161-sweep, 4 698 px²) were the first two. It is named now.

         THE SECOND IS THE FLOOR, and it is the same arithmetic the deck rule
         above already ran for itself. 6.75 rem is ROOMY_HUD_FLOOR_PX — right
         on a desktop, and untouched here. On a phone „TouchControls“ has the
         WebKit measurement of a chip this size at this exact floor (iPhone 16
         portrait 393 × 852): „at 108px … wheel 981px², throttle 363px²".
         Recomputed from the pads' own exported geometry, stage 377 × 836 after
         the shell's p-2, „touchControlsFloorPx“ is 382 px — so the badge
         floated 274 px INSIDE the control band — and the clear corridor
         between the two pads on that row is 66.94 px (59.68 on both 360-px
         Androids). «Кола отзад · 12 м» is not 67 px wide, so no centred chip
         fits there at any width. The deck and the minimap column were both
         moved off this floor for exactly this reason; this badge, having no
         name, was left on it.

         THE OBVIOUS RULE IS WRITTEN OUT BELOW AND IS NOT SHIPPED, because it
         was measured before it was believed and it CREATES the occlusion O53
         falsely alleged:

           [data-sim-compact="on"] [data-hud="rear-proximity"] {
             bottom: ${"$"}{TOUCH_CONTROLS_FLOOR};
           }

         In compact LANDSCAPE it is clean — all three profiles put the chip in
         the empty corridor between the pads, clear of the collapsed deck which
         the max-height rule above has already sent to the LEFT gutter. In
         compact PORTRAIT it is worse than what it replaces. The deck stands on
         this exact floor there, and on a 393 px phone (stage 377, column
         min(15rem, 36vw) = 141.48, gutter 12):

           collapsed pill  stage x 223.5…365  vs badge x 121.5…255.5
                           → 31.98 × 26.5 ≈ 848 px² under the badge
           OPEN panel      left 12 / right 12 / width auto — the FULL stage
                           width at the same floor, ~295 px tall. The badge is
                           entirely inside it, later in DOM order, same z-10:
                           the deck wins and the badge is gone.

         That is one occlusion traded for another, which is the trade this file
         already made once for the deck against the map toggle and rejected on
         the re-measure („one dead control traded for another"). So the floor
         is NOT changed here.

         WHAT IT ACTUALLY NEEDS, stated so the next round can price it: at this
         floor in compact portrait there is no free lane while a demonstration
         is mounted, and the 66.94 px pad corridor cannot hold a 134 px chip at
         the old floor either. Something has to give and it is not this
         stylesheet's to give alone — either the DECK yields the band floor in
         portrait (it is a transport; this is a live proximity warning, and the
         arbitration grammar in this file says the newcomer and the weaker
         claim yields), or the badge sheds its words on a phone and becomes the
         glyph plus «2 м» (~60 px, which does fit the corridor) — a copy change
         on a safety cue, so THEO-4 has an opinion and a human should have one
         too. ROUTED, not dropped; the numbers above are the whole brief.

         COMPACT PORTRAIT IS ALSO NOT THE ORIENTATION THIS PRODUCT DRIVES IN,
         and that is why it is a route and not a stop-the-line: rank 2 of the
         C1 ladder in this very file is «Завърти телефона хоризонтално», and
         its own note reads „on a portrait phone NOTHING else is actionable
         until it is done". All three LANDSCAPE profiles are clear at 108 px
         today — the badge sits in the pad corridor (x 351…485 against a
         corridor of 275…593 on an iPhone 16) and 61 px above the dash dock.
         ══════════════════════════════════════════════════════════════════ */

      /* ── THE SECOND CHIP IN THAT LANE, AND IT TAKES THE FLOOR WHEN IT CAN.
         „[data-hud=follow-gap]" («Дистанция · 34 м · 1,2 с») is the front
         twin of the badge the block above is about, added for
         sc-fo-motorway-gap. Two centred chips cannot share one row, so the
         component parks it at 9.5rem — one row up, clear of «Кола отзад».

         But the row above is the row the block above spends four hundred words
         explaining is scarce: on the 852 × 393 landscape phone this catalogue
         is shot at, 108 px is the pad corridor and the cockpit horizon is
         165 px off the floor. A chip at 9.5rem tops out at ~180 px, i.e. on the
         road — which is the founder's standing sentence, written three times,
         that THE CENTRE OF THE SCREEN IS ROAD.

         It does not have to be up there most of the time. The rear badge is a
         PROXIMITY WARNING and exists only while a real vehicle is inside ~15 m
         behind (the honesty contract in rearProximity.ts); the following gap is a
         continuous instrument and is up whenever anybody is being followed. So
         the front chip claims the accepted 6.75 rem floor whenever the stage
         has no rear chip to stack on, and yields the row only for the seconds
         both are raised. Measured against the two components' own gates rather
         than guessed: nothing else in this file writes „bottom" for either
         name, so this rule and the Tailwind class are the only two authorities
         and they cannot drift into a third.

         :has() and not a component prop, for this file's standing reason — the
         two chips are separate components in a different lane and „data-hud"
         is the only vocabulary the two trees share. */
      [data-sim-stage]:not(:has([data-hud="rear-proximity"])) [data-hud="follow-gap"] {
        bottom: 6.75rem;
      }

      /* …and the column stops short of the deck rather than being painted over
         it. The reserve is the deck's own MEASURED open height plus a gutter
         (notifyColumn.ts). :has() so a screen with no demonstration — which is
         most of them — gets the full column back. ROOMY only; the compact rule
         below supersedes it and is written to out-specify it.

         ⚠ ON ROOMY THIS RULE IS A NO-OP, and it is left that way ON PURPOSE.
         The shell writes the same property as an INLINE style
         („LessonPlayShell": maxHeight: calc(100% − ROOMY_HUD_FLOOR_PX − 3.5rem))
         and an inline declaration outranks any selector — the exact trap the
         glance rules below carry an „!important" for. Turning it on would cap
         the column at 102.5 px on a 619 px window and clip a five-step numbered
         briefing, i.e. authored prose, i.e. THEO-4. THE COLUMN IS NOT THE ONE
         THAT MOVES. What the corridor could not hold is settled below, by the
         DECK changing corridor when it is open — see the block after this one
         for the 40 691 px² this closes. */
      [data-sim-stage]:has([data-hud="demo-deck"]) [data-hud="notify-column"] {
        max-height: calc(100% - ${NOTIFY_COLUMN_DECK_RESERVE_PX}px - 6.75rem - 3.75rem);
      }

      /* ══════════════════════════════════════════════════════════════════
         THE OPEN DECK CHANGES CORRIDOR ON A DESKTOP TOO — 2026-08-10.

         THE COLLISION, MEASURED IN THE RUNNING PRODUCT (WebKit, 1264 × 619,
         the real shell on „/dev/drive-rig“, sc-zebra-approach@L1, with the
         briefing card up — i.e. the state a lesson LANDS in, since the deck
         opens by default). Liveness was asserted around the survey on two
         independent counters, a browser rAF tick and a patched WebGL draw
         entry point: 26 frames and 5 075 draw submissions inside the 1.4 s the
         measurement was taken, so nothing here was read off a paused scene.

           [data-hud="demo-deck"]     [924, 311.5, 272 × 191.5]
           [data-hud="notify-column"] [924, 144.5, 320 × 316.6]
           → **40 691 px²**, and EIGHT of the deck's controls answered a column
             card at their own centres — its own «🎬 Демонстрация ▾» toggle, all
             five annotation ticks, ⏸, ⏮ and ⏭. Every occluder computes
             „pointer-events: auto“, and a click synthesised at each dead centre
             was delivered to the column, so this is not a hit-test artifact.
             The student could not operate the transport AND could not close it.

         WHY THE DECK AND NOT THE COLUMN. 316.6 + 191.5 of demand against
         358.5 px of corridor: it cannot be reserved, only relocated. The column
         carries the authored sentence (THEO-4) and is the founder's own
         right-edge rail; the deck is a transport and is the NEWCOMER here (the
         2026-08-03 pass moved it into this corridor). Same arbitration the map
         toggle's lane already used, and the same answer landscape already
         ships: it changes corridor, to the second one the founder drew.

         COLLAPSED IS DELIBERATELY UNTOUCHED — it keeps the right edge, the map
         toggle's 48 px lane and the verified 8 px gutter at x 1196. Only the
         open panel moves, and only on a roomy stage: „:not([data-sim-compact])“
         because the phone rules above already place both states and a phone
         does not render the legend this one has to clear at all.
         ══════════════════════════════════════════════════════════════════ */
      [data-sim-shell]:not([data-sim-compact])
        [data-hud="demo-deck"][data-deck-open="true"] {
        right: auto;
        left: ${DECK_ROOMY_OPEN_LEFT_CSS};
        width: ${DECK_ROOMY_OPEN_WIDTH_CSS};
        /* The base rule pins the collapsed pill to the corridor's RIGHT edge;
           in the left corridor the pill belongs at the left one. */
        align-items: flex-start;
        /* THE CEILING IS THE SAME NUMBER THE LEGEND RESERVES, and that identity
           is the point: the rule below hands this deck
           DECK_ROOMY_OPEN_HEIGHT_PX of the left rail, so this deck may not take
           more than DECK_ROOMY_OPEN_HEIGHT_PX. One constant governs both, so a
           reserve and the thing it reserves for cannot disagree.

           IT NO LONGER BITES ONLY ON A NARROW STAGE. Until
           sc-ln-obstacle-meeting:db54b249 the second term of the width was 40 %,
           which held the deck at the 26 rem knee on any stage over ~1070 px and
           dropped it below only at the bottom of the roomy range. The width is
           now capped by COCKPIT_CLUSTER_LEFT_PCT — the projected left edge of
           the instrument binnacle, which the deck was standing on — so an
           ordinary 1440 × 900 window lays this out at 370 px and the transport
           may wrap there too. That is why DECK_ROOMY_OPEN_HEIGHT_PX carries a
           wrapped row: when this cap binds, the child that gives is the CAPTION
           („min-h-0", the same piece TraceTimeline's touch branch designates),
           and a clamped caption is clipped authored prose. */
        max-height: ${DECK_ROOMY_OPEN_HEIGHT_PX}px;
      }

      /* …AND THE KEYBOARD LEGEND KEEPS ITS HANDS OFF THAT SPACE.

         Without this the move only trades one collision for a smaller one:
         measured with the deck moved and nothing else changed, «⌨ Клавиши»
         [20, 104.5, 240 × 273.2] against the deck at [20, 328, 320 × 175] was
         11 928 px², and the legend's own «Всички клавиши» expander went dead
         under it. The legend is the one surface of the three that carries no
         live information — it is a static list of key bindings, it is hidden
         outright on every phone, and it already stands aside for a held glance
         a few rules below.

         IT IS CAPPED, NOT HIDDEN, and the component was built for exactly this:
         „the row list is a „min-h-0 overflow-y-auto“ child, so the cap scrolls
         it instead of hiding rows", with the expander pinned so the way back is
         never scrolled out of reach. Not one binding is lost.

         „min()“ is what keeps this from being a tax on every desktop: the
         legend's own 65 % cap wins wherever the corridor is tall enough, so a
         1440 × 900 window — where the two never collided — is not touched at
         all. „!important“ because that 65 % cap is an INLINE style, the same
         trap this file names twice; „:has()“ so it applies only while a deck is
         actually open. */
      [data-sim-shell]:not([data-sim-compact])
        [data-sim-stage]:has([data-hud="demo-deck"][data-deck-open="true"])
        [data-hud="controls-help"] {
        max-height: min(
          calc(${HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION * 100}% - 0.75rem),
          calc(
            100% - ${ROOMY_HUD_FLOOR_PX}px - ${DECK_ROOMY_OPEN_HEIGHT_PX}px -
              ${RIBBON_LEGEND_LANE_PX}px - ${DECK_ROOMY_LEGEND_GUTTER_PX}px -
              ${CONTROLS_HELP_TOP_INSET_PX}px
          )
        ) !important;
      }

      /* …AND THE SHADOW-LINE LEGEND STEPS ABOVE THE DECK RATHER THAN UNDER IT.

         It stands on the same floor and the same gutter, so the moved deck
         landed straight on it: [20, 304, 416 × 199] over [20, 464, 202 × 39] —
         7 878 px², and a TOTAL occlusion, the legend entirely inside the deck's
         box. It went unreported by the first pass of this lane's own probe
         because the legend had no „data-hud" and the probe iterated that
         attribute; it has a name now (notifyColumn.ts, RIBBON_LEGEND_LANE_PX)
         and the probe counts every top-level positioned box.

         It is NOT hidden. It names which of the two coloured ribbons on the
         road is the demonstration and which is the route — information a
         student needs MOST while the demonstration is the thing playing. So it
         rides one deck-height higher for as long as the deck is open, in the
         same „step out of the way and come back" grammar the mirror rules use.
         The three of them then read down the left rail in order: keys, ribbons,
         transport. */
      [data-sim-shell]:not([data-sim-compact]):has(
          [data-hud="demo-deck"][data-deck-open="true"]
        )
        [data-hud="ribbon-legend"] {
        /* !important, and it was NOT optional: this legend's own „bottom" is an
           INLINE style (the shell writes „var(--sim-hud-floor, 6.75rem)" so the
           band and the legend cannot drift), and an inline declaration outranks
           any selector. Written without it the rule read as correct and changed
           nothing — the re-measure still reported the full 7 878 px². The same
           trap the glance rules and the column's dead reserve above already
           carry a note about; three for three in this one file.

           The :has() hangs on the SHELL and not on the stage, because this
           legend is the shell's own child and the deck is the SCENE's — they do
           not share the stage element as an ancestor, only the shell. */
        bottom: calc(
          var(--sim-hud-floor, 6.75rem) + ${DECK_ROOMY_OPEN_HEIGHT_PX}px +
            ${DECK_ROOMY_LEGEND_GUTTER_PX}px
        ) !important;
      }

      /* …AND IT MUST NOT STARVE THE COLUMN ON A LANDSCAPE PHONE — 2026-08-09.
         MEASURED, in the real lesson shell, WebKit, iPhone 16 landscape with
         real insets, sc-zebra-approach@L1 with the demonstration mounted:
         the reserve above is 248 + 6.75rem + 3.75rem = 416 px of a 393 px
         stage, i.e. a NEGATIVE budget. The column collapsed, the peek card's
         44 px min-height held the box, and the flex child that shrank to zero
         was ROW 2 — THE AUTHORED LINE. innerText of the card read „ЗАЩО"
         and nothing else: the glyph, the two 44 px chips and no sentence.
         A card that names a graded mistake and cannot print the sentence is a
         bare verdict with the WHY behind a button, which is precisely what
         THEO-4 forbids, and it happened in the orientation people drive in.

         2026-08-10, row C1: THE FLOOR IS THE CONTROL BAND, NOT THE DECK.
         The 45 % answer that replaced the 416 px one was still asking the wrong
         question — it reserved room for a surface that has now moved out of
         this corridor on exactly the stage where the reserve bit. What the
         column must actually not paint over is the DRIVING CONTROLS, and that
         edge is TOUCH_CONTROLS_FLOOR, which the arc already publishes and which
         already carries a 1.25 rem gap.

         Both selectors, and BOTH ARE NEEDED: the second only repeats the first
         with the „:has()" added so it out-specifies the ROOMY rule above —
         (0,4,0) against (0,3,0) — which would otherwise win on a compact stage
         that happens to have a deck and hand the column a 416 px reserve again.
         The first covers every compact screen with no demonstration on it.

         What it leaves, measured against the 106.3 px worst card:
           852 × 393  cap 127.5   393 × 852  cap 403
           780 × 360  cap 116     360 × 780  cap 424
         The 780 × 360 line is the one that fixes the arc's rise floor; see the
         derivation in TouchControls' ARC block. */
      /* 2026-08-14 · „FIX · FLANKS": THE FLOOR IS THE COLUMN'S OWN NOW, and
         the reason is that the column is the ONE surface that shares the
         throttle flank's corner. TOUCH_CONTROLS_FLOOR is what everything ELSE
         on this screen stands above; notifyColumnFloorCss() is the same idea
         solved for a box that also has to get out of the band's LANE. The two
         orientations answer it in opposite directions and the derivation is on
         the export (TouchControls, „THE NOTIFICATION COLUMN'S OWN FLOOR").
         What it leaves, against the 106.3 px worst card:
           852 × 393  cap 192 (was 127.5)   393 × 852  cap 330 (was 403)
           780 × 360  cap 188 (was 116)     360 × 780  cap 292 (was 424)
         Sideways — the orientation people drive in, and the one where the card
         was measured hiding 333 px of its own body — the card GAINS. Upright it
         loses cap it was not using: the briefing card measures ~205 px there. */
      /* 2026-08-16 · „THE HUD IS STANDING ON THE ROAD", row 1: THE BAND IS NOT
         THE ONLY THING THIS COLUMN HAS TO CLEAR. The rule above asks „what is
         left above the driving controls" and answers 192 px on an iPhone 16
         sideways — which is 0.509 of the stage, and the founder photographed
         exactly that box lying over the right-hand pavement on the one rung
         whose whole subject is the right-hand pavement.
         Measured on the deployed build, the landing frame of
         sc-zebra-approach@L1: [data-hud="notify-column"] [541, 8, 180 × 192].
         „notifyColumnMaxHeightCss()“ adds the second budget — the HAZARD BAND,
         derived from the cockpit projection rather than chosen (notifyColumn.ts
         has the arithmetic: horizon 0.58, a 2.2 m sign at 30 m at 0.531, a
         pedestrian at 15 m at 0.531, so 0.43 leaves a tenth of the frame). The
         „min()“ keeps the band rule intact wherever it is the tighter of the
         two, which is every portrait profile in the ladder.
           852 × 393  192 → 161      393 × 852  330 → 330 (unchanged)
           780 × 360  188 → 147      360 × 780  292 → 292 (unchanged) */
      /* ⚠ 2026-08-27 · THIS RULE IS INERT, AND UNTIL NOW IT WAS ALSO WRONG.
         Kept and corrected rather than deleted, and both halves are written
         down so the next reader does not repair the copy that is not shipping.
         (No backticks anywhere in this block on purpose: every character here
         is inside a template literal, and one backtick ends the stylesheet.)

         WHY IT IS INERT. SimOverlay moved this column's „top" off the phone
         layout's CORNER DATUM and onto the interior mirror's lane on
         2026-08-17, and — because a „max-height" is measured from the box's
         own top edge — it had to write the CEILING in the same declaration,
         INLINE («an inline style outranks every selector», the same cascade
         fact the „right"/„width" note two blocks down was learned from). Its
         own source says what that leaves here: „The stylesheet's compact
         max-height rule is therefore now INERT for this element — it is the
         sibling lane's to delete." Both elements that carry this handle are
         covered: SimOverlay's peek column writes maxHeight inline, and this
         shell's own column carries „hidden" whenever data-sim-compact is on.
         hud-off-the-road.test.ts states the same thing from the other side and
         asks for the rule to STAY as the fallback, which is why this is a
         correction and not a deletion.

         WHY THE FALLBACK HAD TO BE CORRECTED. Inert is not the same as
         harmless. What stood here was NOTIFY_COLUMN_TOP_CSS_COMPACT — 8 px —
         against a column whose top is 73.24 px on the handset this catalogue
         is shot at: a ceiling measured from a top the product abandoned. That
         is exactly the half-landed swap sim-overlay-mirror-lane.test.ts exists
         to prevent, sitting in a rule no test reads because no pixel depends
         on it; the day anyone moves the ceiling back out of the inline style
         it would put the card's floor at 0.565 of the stage, past the hazard
         band's 0.53 and far past the cockpit horizon at 0.402. The floor was already the same length on
         both sides — sim-overlay-mirror-lane.test.ts pins
         SIM_OVERLAY_COLUMN_FLOOR_CSS to notifyColumnFloorCss() — so the top
         was the only term that disagreed, and it is the term the swap moved.

         …AND THE ARITHMETIC THE SWAP ACTUALLY BOUGHT, recorded here because
         nothing in the tree states it and five w12 rows are about it. On
         852 × 393 (iPhone 16 landscape, the profile the sweep is driven on)
         the BAND term is the binding one and it is exact:

           393 × NOTIFY_COLUMN_MAX_STAGE_FRACTION − 73.24
             = 157.20 − 73.24 = 83.96 px

         and SimOverlay's own resolved table says the same from the other end
         („852 × 393  top 8 → 73.23   ceiling 149 → 83.96").

         83.96 px — against touchArc.test.ts's own MEASURED_WORST_CARD_PX of
         106.3, the height that file calls „the floor the column's own cap may
         never fall under … a cap below this clips an authored sentence". That
         guard still certifies the whole ladder because it computes
         height − floor − 8 (the abandoned datum) and never applies the band
         term at all — its own assertion for this profile is 192. So the guard
         reads 192 where the product ships 83.96, and it is the guard that is
         stale, not the ceiling that is arbitrary. This is the measurable part
         of the w12 rows that photograph two lines of a 26-line briefing under
         «↓ ОЩЕ N РЕДА» (sc-mw-discipline, sc-sp-limit-end, sc-ac-snow,
         sc-vu-emergency, sc-ov-oncoming-gap).

         IT IS NOT FIXABLE FROM THIS FILE, and the shape of the wrong fix is
         worth naming: the shipped ceiling is SimOverlay.tsx's inline
         maxHeight and the 0.40 is notifyColumn.ts's, so the only lever here
         would be an !important override — which would also widen the column
         for the toast column and the task row, and THOSE are on the glass
         while the student drives. That is the distinction
         mirror-lane-corridor.test.ts asserts one screen down («the peek's
         rule … must NOT have inherited the wider bound»), and it is right.
         Routed with the numbers rather than forced. */
      [data-sim-compact="on"] [data-sim-stage] [data-hud="notify-column"],
      [data-sim-compact="on"] [data-sim-stage]:has([data-hud="demo-deck"]) [data-hud="notify-column"] {
        max-height: ${notifyColumnMaxHeightCss(
          notifyColumnFloorCss(),
          NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
        )};
      }

      /* …AND THE LANE ITSELF IS NOT WRITTEN HERE, WHICH COST THIS WAVE A
         DEPLOY AND IS WORTH THE THREE LINES. The first attempt put the
         column's right/width override in exactly this file, inside an
         orientation media query. It was correct CSS and it did nothing:
         SimOverlay writes both declarations as INLINE STYLES, and an inline
         style outranks every selector in every stylesheet. The band came back
         perfect on all six profiles and elementFromPoint still answered the
         briefing card at the centre of all four throttle stations.
         The lane is therefore a VARIABLE (--sim-flank-lane, declared in
         TOUCH_BAND_CSS_VARS above and read by the inline style itself) — the
         one form that crosses the cascade. */
      [data-hud="audio-prompt"] {
        left: auto;
        right: ${NOTIFY_COLUMN_RIGHT_CSS};
        top: ${NOTIFY_COLUMN_TOP_CSS_ROOMY};
        width: ${NOTIFY_COLUMN_WIDTH_CSS_ROOMY};
        transform: none;
        translate: none;
      }
      /* …AND SIDEWAYS IT PAYS THE MIRROR'S LANE, WHICH THIS RULE DID NOT AND
         THE ROOMY ONE ABOVE ALREADY DOES — 2026-08-24.

         The roomy declaration two lines up reads NOTIFY_COLUMN_TOP_CSS_ROOMY,
         which carries the interior mirror's lane in its own max(). This one
         read the phone layout's CORNER DATUM instead, and the datum is 8 px —
         i.e. this card was authored into the top-right corner of a compact
         stage, which is the corner the cockpit's interior mirror is projected
         into (notifyColumn.ts, „THE MIRROR IS AN INSTRUMENT"; the mirror is
         painted [524, 0 → 707, 70] on an iPhone 16 sideways and this column
         runs 541 → 721, i.e. inside its x band with the glass sticking out on
         both sides). SimOverlay swapped the peek to the COLUMN constant on
         2026-08-19; this card is the same corridor, the same phone and the same
         instrument, and it was simply not on that list.

         It costs nothing to move: unlike the peek and the first-run hint this
         rule writes no max-height, so the card keeps every line it had — only
         its top edge steps from 8 px to 73.24 (852 × 393), 67.76 (780 × 360),
         64.44 (780 × 340), which is the lane plus its 8 px gutter and nothing
         else. */
      [data-sim-compact="on"] [data-hud="audio-prompt"] {
        top: ${NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN};
        width: ${NOTIFY_COLUMN_WIDTH_CSS_COMPACT};
      }
      /* …and its inner card stops being a one-line strip: in a 240 px column
         the icon, the sentence and the «Разбрах» need three rows, not one. */
      [data-hud="audio-prompt"] > div {
        flex-wrap: wrap;
      }

      /* ══════════════════════════════════════════════════════════════════
         …AND THE TWO CHIPS THAT WERE LEFT BEHIND — 2026-08-09, row C1.

         The 2026-08-03 pass moved the deck and the audio card and then wrote,
         a few lines below, „The «follow the blue line» chip is still centred
         and still steps." It is. Photographed on the founder's own device
         profile (WebKit, iPhone 16 portrait, real insets) on the landing frame
         of „sc-zebra-approach@L1“: «Следвай синята линия» laid out 410 px wide
         starting at x = 121 of a 393 px screen — dead across the vanishing
         point — and its right end painted straight through the «ИНСТРУКЦИИ»
         card in the column at x = 239.5. That is row C1's exact symptom, two
         surfaces in the same pixels, on the surface C1 is about.

         Its twin is worse and had no handle at all: the telltale cue
         («Контролна лампа: температура! Спри спокойно вдясно») is „left-1/2
         top-24“, i.e. it stacks UNDER the follow chip in the middle of the
         road — the „three panels down the screen" shape the whole notification
         column exists to end. It is named „data-hud="telltale-cue"“ in
         LessonScene as of this row.

         Both join the column on the same terms as the audio card: same right
         edge, same width, „transform“ AND „translate“ cancelled (Tailwind v4
         compiles „-translate-x-1/2“ to the independent „translate“ property —
         cancelling only one of the two leaves the panel half a width off).
         They keep their vertical order, one under the other, so a session that
         raises both still reads top to bottom.
         ══════════════════════════════════════════════════════════════════ */
      [data-hud="follow-hint"],
      [data-hud="telltale-cue"] {
        left: auto;
        right: ${NOTIFY_COLUMN_RIGHT_CSS};
        width: ${NOTIFY_COLUMN_WIDTH_CSS_ROOMY};
        transform: none;
        translate: none;
        display: flex;
        justify-content: flex-end;
      }
      [data-sim-compact="on"] [data-hud="follow-hint"],
      [data-sim-compact="on"] [data-hud="telltale-cue"] {
        width: ${NOTIFY_COLUMN_WIDTH_CSS_COMPACT};
      }
      /* A pill in a 240 px column wraps rather than running off it — the
         hud-card-fit rule, applied to the two elements that never had it. */
      [data-hud="follow-hint"] > div,
      [data-hud="telltale-cue"] > div {
        max-width: 100%;
        text-align: right;
      }

      /* ------------------------------------------------------------------
         THE MIRROR AND THE HUD — rows B74 / B76.

         The chase view now carries a PERSISTENT rear-view window and Q/E/F
         open it to full size on the glanced side (CameraRig +
         scene/chaseRearView.ts). That window is a quad INSIDE the WebGL
         canvas, so every DOM card painted over the canvas covers it, whatever
         renderOrder it carries — which is exactly what the audit photographed:
         the „Клавиши" legend over ~60 % of the Q window, the toast card over
         half of the E one, the objective chips over the top 40 % of F.

         An instrument you cannot see is not an instrument, so the HUD moves,
         not the mirror. CameraRig publishes on the document root which camera
         is live, whether a glance is held and on which side, and the two window
         edges in CSS pixels; these rules step each panel below whichever edge
         concerns it. Nothing is hidden — a teaching card that arrives
         mid-glance is still on screen, one window-height lower, and it slides
         back the moment the key is released.

         Written here, in the shell's own stylesheet, for the same reason the
         two rules above are: the panels belong to three different components in
         two different lanes, and their only shared vocabulary is data-hud.
         ------------------------------------------------------------------ */
      [data-hud="controls-help"],
      [data-hud="follow-hint"],
      [data-hud="notify-column"] {
        transition: top 180ms ease-out;
      }
      [data-hud="difficulty"] {
        transition: opacity 140ms ease-out;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-hud="controls-help"],
        [data-hud="follow-hint"],
        [data-hud="notify-column"],
        [data-hud="difficulty"] {
          transition: none;
        }
      }

      /* THE MIRROR AND THE COLUMN — 2026-08-03 re-anchor.
         The chase rear window sits at the TOP CENTRE at rest, so a column at
         the right edge no longer has to step under it: the chase rule that
         used to push the objective stack down by --sim-mirror-h is gone with
         the stack, and the column keeps its own top. The „follow the blue
         line" chip is still centred and still steps. */
      html[data-sim-camera="chase"] [data-hud="follow-hint"] {
        top: calc(4rem + var(--sim-mirror-h, 0px));
      }

      /* …but a HELD glance grows the window to full size and MOVES it to the
         glanced side, and „right" and „rear" both put it over this column. So
         the column steps below it for the second the key is down, exactly as
         the toast column used to, and slides back on release. Nothing is
         hidden: a teaching card that arrives mid-glance is still on screen, one
         window-height lower. */
      html[data-sim-glance="left"] [data-hud="controls-help"] {
        top: calc(0.75rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="rear"] [data-hud="follow-hint"] {
        top: calc(4rem + var(--sim-glance-h, 0px));
      }
      /* !important because the column's own top is an INLINE style (both the
         shell and SimOverlay compute it from notifyColumn.ts), and an inline
         declaration outranks any selector. Without it this rule is a comment —
         which is the exact way the tier picker's filled segment survived a
         whole „unpanel" pass, so it is stated rather than discovered. */
      html[data-sim-glance="rear"] [data-hud="notify-column"],
      html[data-sim-glance="right"] [data-hud="notify-column"] {
        top: calc(${NOTIFY_COLUMN_TOP_CSS_ROOMY} + var(--sim-glance-h, 0px)) !important;
      }
      html[data-sim-glance="rear"] [data-sim-compact="on"] [data-hud="notify-column"],
      html[data-sim-glance="right"] [data-sim-compact="on"] [data-hud="notify-column"] {
        top: calc(${NOTIFY_COLUMN_TOP_CSS_COMPACT} + var(--sim-glance-h, 0px)) !important;
      }

      /* The tier picker shares the top-right corner with the E window and with
         the toast column, and three things do not fit in one corner. It is the
         only one of the three that carries no information — Начинаещ /
         Нормален / Напреднал is a SETTING, and a setting you are not touching
         while your head is turned. So it stands down for the second the glance
         lasts, instead of being stepped into the toasts' new place. A teaching
         card is never treated this way: it moves, it does not disappear. */
      html[data-sim-glance="right"] [data-hud="difficulty"] {
        opacity: 0;
        pointer-events: none;
      }

      /* ------------------------------------------------------------------
         ROW C7 — one speedometer per screen.

         In the cockpit camera the „Виток" 3D cluster draws speed and the
         selector letter inside the cabin, at the resolution four review rounds
         were spent on. The compact readout was drawing both AGAIN, 40 px lower,
         because it had no way to know which camera was live; the audit frame has
         the analogue dial, its digital „0 км/ч" and its „D" in the same picture
         as a DOM „D 0 км/ч". Two speedometers do not make a student faster at
         reading one.

         What does NOT go away is the limit disc: the cluster shows what the car
         is doing, never what the law allows, and speed discipline is the whole
         claim of this product. So in the cockpit the readout is exactly the one
         number the instrument panel cannot give you.

         Chase and top-down are untouched — there the cluster is not in frame at
         all, which is why this readout was kept in the first place.
         ------------------------------------------------------------------ */
      html[data-sim-camera="cockpit"] [data-hud="speed-block"] {
        display: none;
      }

      /* ------------------------------------------------------------------
         ROW C2 — 44 px under the thumb, 0 px more paint.

         Measured in WebKit on iPhone 16: „Начинаещ" 75.6×24.5, „Нормален"
         73.5×24.5, „Напреднал" 78.8×24.5 and „🎬 Демонстрация ▸" 137.2×26.5.
         Wide enough, half as tall as a thumb needs.

         Growing the buttons would have grown the chrome with them — the tier
         group alone is already 2.6 % of a landscape phone, and this is the
         screen the founder measured as „half furniture". So the TAP AREA grows
         and the pill does not: an absolutely positioned ::before at −0.75 rem
         top and bottom puts the hit rect at 24.5 + 24 ≈ 48 px. A pseudo-element
         paints nothing and is in no DOM, so it is charged nothing — and the
         mobile probe unions exactly these insets into the measured hit rect
         (tools/mobile/lib/probe.mjs, „a common and legitimate trick").
         ------------------------------------------------------------------ */
      /* The tier pills were the FIRST target of this row and are no longer
         matched: on a compact stage the picker is not rendered at all
         (J-WAVE-3), and its cell in the ⚙ sheet is a real 44 × 44 „SheetCell“
         that needs no pseudo-element. The ROOMY picker never took this
         treatment — a mouse is not what 44 px is about. */
      [data-sim-compact="on"] [data-hud="demo-deck"] > button,
      /* C2 residual (doc 87:238): the fourth target. «Разбрах» measured
         62.9 × 24.9 px — and it is the ONE control that clears the popup C1 is
         about, so leaving it under the thumb minimum meant the student could
         not dismiss the thing covering his road. Same treatment, same reason:
         the hit rect grows to ~49 px, the pill paints not one pixel more. */
      [data-sim-compact="on"] [data-hud="audio-prompt"] button {
        position: relative;
      }
      [data-sim-compact="on"] [data-hud="demo-deck"] > button::before,
      [data-sim-compact="on"] [data-hud="audio-prompt"] button::before {
        content: "";
        position: absolute;
        top: -0.75rem;
        bottom: -0.75rem;
        left: 0;
        right: 0;
      }

      /* ------------------------------------------------------------------
         ROW A6 — EVERY CLOSE CONTROL IS 44 px, AND NONE OF THEM IS 44 px WIDE.

         Founder, verbatim: „those pop ups … need to be able to be removed when
         clicked with the mouse … complete rework". A control he cannot hit is
         the same defect as a control that is not there, and the register closed
         row C2 on 44 px as the number.

         WHY IT CANNOT SIMPLY BE «h-11 w-11». The notification column is
         «min(15rem, 36vw)» (notifyColumn.ts). On the founder's 393 px portrait
         phone that is **141 px** — a 44 px painted button would be 31 % of the
         column's whole width, on the screen whose review thread is „half of it
         is furniture". So this is row C2's own answer, generalised: the ring
         stays 18 px and an unpainted ::before carries the hit rect.

         CENTRED, not inset. C2's rule stretches «left: 0; right: 0» because it
         grows wide-but-short pills. These are 18 px SQUARES, so both axes are
         short, and a rect centred on the glyph is the only shape that is 44 px
         in both without depending on the glyph's own box.

         BOTH GRAMMARS, unlike C2. C2 is «[data-sim-compact="on"]» because a
         thumb is what 44 px is about. This row is not about a thumb — it is a
         MOUSE user's sentence — and the mouse case is the roomy one, so the
         rule is unscoped. Nothing is painted either way, so the desktop pays
         nothing for it.

         ORDERING IS LOAD-BEARING. «z-index» lifts the hit rect above the
         SIBLING card that follows it in the column (cards are 6 px apart and
         the rects are 44 px tall, so consecutive controls DO overlap). Without
         it the later card's rect wins in the overlap and the founder's click
         lands on the wrong ✕ — the „I clicked it and the wrong one closed" bug,
         which is worse than no control at all. Verified by measurement, not by
         reasoning: «popup-close.test.ts» + the rendered click captures.
         ------------------------------------------------------------------ */
      [data-hud-close] {
        position: relative;
        z-index: 1;
      }
      [data-hud-close]::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2.75rem;
        height: 2.75rem;
        transform: translate(-50%, -50%);
      }

      /* …AND THE FOLD CONTROL BESIDE IT PAYS THE SAME 44 px — 2026-08-27.

         ⚠ NO BACKTICKS IN THIS COMMENT. Every rule in this file lives inside a
         JS template literal, so one backtick here ends the stylesheet and the
         rest of the file is parsed as code — 80 syntax errors from a quotation
         mark. That is why the paragraphs around this one quote with «…» and
         „…" and never with the identifier-quote the rest of the lane uses.

         The ИНСТРУКЦИИ panel had exactly ONE exit and it was a one-way door:
         onClose clears briefingOpen for the rest of the lesson and nothing
         re-opens it. sc-ov-crossing-overtake:4bce6fca photographs what that
         costs — the five-step panel on a DRIVING beat at 11 км/ч, blanking the
         right kerb the lesson's own step 4 says a person may step out from —
         so a student who wants the road back has to choose between the road and
         the authored steps, permanently. The fold («▾», beside the ✕) is the
         third option, and it is the same 18 px ring on the same argument: the
         column cannot afford a painted 44 px square.

         WHY A SECOND BLOCK AND NOT A COMMA. popupClose.test.ts pins the close
         rule by its exact selector text — a regex requiring «[data-hud-close]»
         to be followed directly by «::before {», and another requiring it to be
         followed directly by «{ … position: relative» — so a «:is(…)» or a
         comma-joined selector turns that suite red while changing no pixel.
         Duplicated deliberately, and the duplication is GATED rather than
         trusted: briefingFoldControl.test.ts asserts the two ::before bodies
         are character-identical, so the day one of them is retuned the other
         cannot silently keep the old number. */
      [data-hud-fold] {
        position: relative;
        z-index: 1;
      }
      [data-hud-fold]::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2.75rem;
        height: 2.75rem;
        transform: translate(-50%, -50%);
      }

      /* …AND THE SAME ON THE END-OF-LESSON SCREEN — ROW A2.

         His item 2 asks for three things: Space skips the debrief, the screen
         SAYS so, and a control turns the popup off for good. All three are
         built (SessionEndScreen, doc 86 L15) — and two of the three were the
         smallest controls in the product: «Пропусни разбора» measured 28 px
         tall and the «Не показвай автоматично» pill 19 px. „It is on the
         screen" is not the same claim as „he can press it", and A2 is a row
         about a man trying to get rid of a popup.

         Named by their own SEMANTICS and not by their position in the tree:
         «aria-keyshortcuts="Space"» is the skip button (it is the attribute
         that promises the shortcut) and «aria-pressed» is the auto-open pill
         (it is the attribute that makes it a toggle). A «:nth-child» chain
         would have been a private detail of a file this lane must not edit —
         and it would silently stop matching the day a wrapper moves, which is
         the failure mode where a fix reports green and the founder still
         cannot press the button. These two attributes are load-bearing to what
         the controls ARE. The debrief's own CTAs are full-size already and are
         deliberately not matched. Nothing painted here either. */
      [data-hud="end-screen"] button[aria-keyshortcuts="Space"],
      [data-hud="end-screen"] button[aria-pressed] {
        position: relative;
      }
      [data-hud="end-screen"] button[aria-keyshortcuts="Space"]::before,
      [data-hud="end-screen"] button[aria-pressed]::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 2.75rem;
        transform: translateY(-50%);
      }

      /* ------------------------------------------------------------------
         ROW C1 — ONE surface in the top band, not four painted on each other.

         The founder's landing frame (doc 87:237) is three surfaces stacked in
         the same 60 px of screen — the audio card with its own «Разбрах», the
         red «⚠ Коланът не е поставен» line, and the tier picker bleeding
         through behind them — plus a fourth full-width «Завърти телефона
         хоризонтално» note across the road. The harness reached the same
         verdict from the other side: „«Разбрах» was not tappable (something is
         painted over it)." A control that cannot be pressed is not a smaller
         box problem. It is a PRIORITY problem, and priority is what was
         missing: each of these four decided on its own that it deserved the
         top of the screen, which is the exact defect hud/overlayQueue.ts was
         written to end — except that three of the four are mounted in the
         SCENE tree and never entered the queue.

         They enter it here, by the cascade, because that is the one vocabulary
         the two trees share (the SimOverlay precedent, hud/SimOverlay.tsx:216:
         the overlay layer already stands the tier picker and the telltale
         pings down while it speaks). The order is not a taste call — it is
         which one the student can act on soonest:

           1. the shell's overlay line (a graded fault, a task, a teach card):
              it is the lesson talking, and it already owns the rail;
           2. «Завърти телефона хоризонтално»: on a portrait phone NOTHING
              else is actionable until it is done;
           3. the audio chip: real pedagogy, but it keeps until the student
              is holding the phone the right way round;
           4. the tier picker: chrome, and the only one of the four that is
              still one tap away at any time from the ⚙ sheet.

         ⚠ RANK 4 HAS LEFT THE PHONE ENTIRELY — J-WAVE-3, and the reason is a
         correction to this very sentence. „Still one tap away from the ⚙ sheet"
         was written here on 2026-07-30 and was NOT TRUE: the sheet had no tier
         control, so standing the picker down was standing the setting down.
         The sheet has the cell now, and the picker itself is gone from every
         compact stage (the collision it was in is at the head of this file:
         255 px of segmented control against a 167.5 px rail lane). The three
         ranks above are unchanged.

         Nothing is deleted and nothing moves — each surface simply waits for
         the one above it. All of them come straight back, which on a landing
         screen is a second or two later.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="audio-prompt"],
      [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="touch-hint"] {
        display: none;
      }
      /* 2026-08-09: the two chips above are rank 3 as well. They now share the
         column with the overlay line instead of being painted across the road,
         so „one surface in the band" has to include them or the band is two
         surfaces deep again the moment a lesson raises an aid. */
      [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="follow-hint"],
      [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="telltale-cue"] {
        display: none;
      }
      [data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="follow-hint"],
      [data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="telltale-cue"] {
        display: none;
      }
      /* Rank 4 — the tier picker — used to be two more selectors here, standing
         down behind the hint and behind the audio chip. It is gone from this
         list because as of J-WAVE-3 it is hidden on EVERY compact stage
         unconditionally (the block above), so a conditional hide could never
         match. The priority order itself is unchanged; the surface it applied
         to simply is not on a phone any more. */
      [data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="audio-prompt"] {
        display: none;
      }
      /* …AND THE DEMONSTRATION DECK IS RANK 3 TOO — 2026-08-12.
         It was left out of this list, and the omission is measurable: on the
         360 × 780 Samsung profile the first-run hint's own «Завърти телефона
         хоризонтално» laid out 897 px² across the deck's «🎬 Демонстрация ▸»
         toggle, on the LANDING FRAME of a lesson that carries a demonstration.
         The hint is one sentence, once, and it is the only thing on that screen
         a student can act on; the deck is a transport that comes straight back. */
      [data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="demo-deck"] {
        display: none;
      }

      /* ══════════════════════════════════════════════════════════════════
         THE ⚙ CAR SHEET AND THE DEMONSTRATION DECK ARE ONE SURFACE, NOT TWO
         — 2026-08-12, doc 91 §3, and it is the largest single number in the
         phone sweep.

         Both stand on TOUCH_CONTROLS_FLOOR. Apart they are fine — the sheet
         alone measured 0–2 overlapping pairs. TOGETHER, on every one of the six
         profiles, 7–9 controls went dead and 10 266–13 895 px² of 44 px targets
         landed on top of each other, worst on the Samsung gesture-bar pair
         (13 895 px² portrait, 13 098 landscape) which is 34.6 % of the
         Bulgarian market. Even with the deck merely COLLAPSED the pill sat on
         «Ръчна спирачка», «Предпазен колан» and «Двигател» and answered for
         them: on the founder's own phone, sideways, «🎬 Демонстрация ▸» was
         itself dead behind a sheet cell.

         The notification column already solves exactly this for itself — its
         peek is „replaced by, not stacked with, the open sheet" (SimOverlay).
         Same arbitration here, and the deck is the one that yields for the same
         reason it yielded to the map toggle and to the column: it is a
         TRANSPORT, the student opened it on purpose, and one tap brings it
         back. "html[data-sim-car-sheet]" is written by TouchControls, which is
         the component that owns the sheet and cannot reach the deck's tree —
         the same grammar "data-sim-camera" and "data-sim-glance" already use.
         ══════════════════════════════════════════════════════════════════ */
      html[data-sim-car-sheet="open"] [data-hud="demo-deck"] {
        display: none;
      }

      /* ══════════════════════════════════════════════════════════════════
         …AND THE NOTIFICATION COLUMN, ON A SHORT LANDSCAPE STAGE — the
         hand-over TouchControls' own sheet block wrote down and refused to
         patch. 2026-08-13, doc 91 §W3.

         Measured on the deployed build, WebKit, real insets, the Samsung
         gesture-bar 780 x 360 (34.6 % of the Bulgarian market), sheet open with
         ONE card in the column:

           sheet  [2, 56, 776 x 44]      column card [528, 42, 240 x 44]

         elementFromPoint at their own centres answered the COLUMN for the
         sheet's «Рестарт на колата», for «ЗАТВОРИ КОНТРОЛИТЕ» — the button that
         closes the sheet — and, on the manual tier, for «M►». Reproduced on all
         three landscape profiles and on none of the portrait ones, 5 728-7 139
         px2 of 44 px targets. The column is z-30 against the sheet's z-20, and
         the touch root is deliberately raised while the sheet is open, so the
         stack does not resolve itself.

         THE GEOMETRIC FIX DOES NOT EXIST, and the arithmetic is in TouchControls
         so it is not re-tried blind: the column's own top is 42 and the sheet's
         floor-anchored row starts at 56 on a 360-tall stage, so „clear each
         other vertically" needs a 14 px column; and giving the sheet the rail's
         right bound leaves 518 px, i.e. two rows, i.e. a row through «Меню на
         урока» at [8, 8, 48 x 44]. One corridor, two surfaces, 360 px.

         So it is the same arbitration as the deck above, and it is the WEAKER
         claim of the two: the sheet is modal, the student opened it on purpose,
         its ✕ is 44 px and one tap brings the column straight back. A teaching
         card is not being deleted — it is being deferred for the two seconds a
         hand is in the car's switch panel, and it returns to the same corridor
         it left.

         SCOPED TO LANDSCAPE-COMPACT AND NOTHING ELSE. Portrait folds this sheet
         into three rows at the floor while the column sits under the corner, and
         the sweep measures 0 dead there — so portrait keeps its card, and this
         rule is exactly as wide as the defect it answers.
         ══════════════════════════════════════════════════════════════════ */
      @media (orientation: landscape) {
        html[data-sim-car-sheet="open"] [data-sim-compact="on"] [data-hud="notify-column"] {
          visibility: hidden;
        }
      }

      /* ══════════════════════════════════════════════════════════════════
         …AND THE READ MODE REPLACES THE LESSON MENU, FOR THE SAME REASON —
         2026-08-13, doc 91 §I11 + §W2.

         The expanded instruction panel buried SEVEN controls on the founder's
         phone held sideways. Six of them are TouchControls' and they are
         answered by the mechanism, not by a rule: opening the panel now stops
         the car (LessonPlayShell's "paused" prop), which makes every one of
         them inert — a control nobody can see is not a buried control, and the
         pads keep their DOM nodes so the thumb picks the pedal straight back up
         (§I3; "display: none" on that tree would BE the §C1 bug).

         «Меню на урока» is the seventh, and it is the exception: it is the
         shell's own chrome, in a different tree, and no pause reaches it.
         Measured buried on iphone16-landscape (its centre sits 1 px inside the
         reading surface's left edge) and reachable-by-luck on the 780 profiles,
         which is worse than a clean rule.

         So it yields, exactly as the demonstration deck yields to the ⚙ sheet
         above: replaced by, not stacked with. It loses nothing by waiting — it
         is a paused-state object (pause, quality, quit, „← Всички уроци"), the
         car is already stopped, and the reading surface's own ✕ is 44 px and
         brings it straight back.

         Scoped to compact: PlayMenu only mounts there, and on a roomy screen
         the sheet is a centred bottom sheet with the top bar well clear of it.
         ══════════════════════════════════════════════════════════════════ */
      html[data-sim-overlay-read="open"] [data-sim-compact="on"] [data-hud="play-menu"] {
        display: none;
      }

      /* …AND THE DEMONSTRATION DECK, WHICH THE SWEEP FOUND AFTER THE FACT —
         2026-08-13, wave 9.

         The rule above was written for «Меню на урока» because that was the
         seventh buried control in the wave-8 census. Re-measured against the
         rebuilt screen on the deployed build (six profiles, canvas asserted,
         car moving), ONE live control was still under the reading surface, on
         all three landscape profiles and none of the portrait ones:

           «🎬Демонстрация ▸» [71,110,134×27] → answered by the read surface's
           own sentence, «Непропускане на пешеходец»

         It is the same kind of object as the menu and the answer is the same
         rule, not a new one: a demonstration is a BETWEEN-ATTEMPTS thing, the
         car is stopped while this surface is up, and the deck comes straight
         back with the ✕. It already yields to the ⚙ sheet above for exactly
         this reason — this adds the one surface that was missed.

         visibility AND NOT display, and the distinction is load-bearing here in
         a way it is not for the menu: the deck owns a REPLAY CLOCK, and this
         file's own §1 note puts it in one line — display:none hides a panel; it
         does not stop a replay. It would also drop the deck's layout box, and
         the caption lane is measured off it. The scene is already told about
         the read mode through the same pause that stops the car, so the clock
         is handled; this rule only has to stop the deck painting over the
         words.

         (No backticks in this comment ON PURPOSE — the whole stylesheet is one
         template literal, so a backtick here ends it. That is exactly how this
         rule failed to compile the first time it was written.) */
      html[data-sim-overlay-read="open"] [data-sim-compact="on"] [data-hud="demo-deck"] {
        visibility: hidden;
      }

      /* …AND THE SAME DECK YIELDS TO «МЕНЮ НА УРОКА», which is the LAST live
         control the wave-10 sweep found buried anywhere — 2026-08-13, §W3.

         Measured on the deployed build, WebKit, iPhone 16 landscape, menu open:
         «🎬Демонстрация ▸» [71, 110, 134 x 27] answered by «Меню на урока», and
         88 px2 of the menu's own type over it. Making the menu stop the car
         does NOT fix this one: the deck is not a driving control, so the pause
         leaves it live and the sheet simply stands on it.

         Third instance of one rule, so it is written as the same rule: a
         transport the student opened on purpose is replaced by the surface on
         top of it, not stacked with it, and one tap brings it straight back.
         visibility AND NOT display for the reason the block above gives —
         display:none hides a panel, it does not stop a replay clock.

         NO NEW ATTRIBUTE. The menu holds its open state in React and publishes
         nothing to the cascade, and adding a root attribute for one rule is
         more moving parts than the rule is worth. ":has()" reads the DOM the
         menu already renders, and this file uses that grammar in four other
         places. Scoped to compact, where PlayMenu is the only thing that
         mounts. */
      [data-sim-compact="on"]:has([data-hud="play-menu"] [role="menu"]) [data-hud="demo-deck"] {
        visibility: hidden;
      }

      /* ══════════════════════════════════════════════════════════════════
         THE FIRST-RUN THUMB HINT LEAVES THE MIDDLE OF THE SCREEN — 2026-08-12,
         AND THEN ACTUALLY LEAVES IT — 2026-08-16.

         THE FRAME THAT OPENED THIS ROW IN 2026-08-12. The hint was "top: 50%",
         full-width, three stacked lines; the flanks are 44 px targets at the
         bottom corners; so the hint's own third line ran straight through them.
         Measured, WebKit, real insets, iPhone 16 landscape:

           «Спряла кола: пусни палеца и натисни пак надолу…»
              over «Клаксон — задръж»              733 px²
              over «Поглед в дясното огледало»     355 px²
              over «Поглед в лявото огледало»      197 px²
              over «Мигач наляво»                   29 px²

         That rule put the hint in the corridor BETWEEN THE TWO PADS, standing
         on the instrument band. It closed every one of those overlaps and it
         did not answer the founder's actual sentence, which he has now written
         three times: THE CENTRE OF THE SCREEN IS ROAD. Measured on the deployed
         build, same profile, the state a lesson lands in once the briefing is
         acknowledged:

           [data-hud="touch-hint"]  [275, 202, 334 × 143]

         — the middle 39 % of the width, centred 16 px off the vanishing point,
         crossing the cockpit horizon (0.58 of the stage = 228 px), 47 762 px²
         or 14.3 % of the picture. „Off the controls" and „off the road" are two
         different requirements and only the first had been met.

         SO IT JOINS THE RIGHT-EDGE CORRIDOR, on exactly the terms the audio
         card, the follow chip and the telltale cue already join it: same right
         inset, same width, same top, all four interpolated from
         notifyColumn.ts. Nothing new is invented and no fifth geometry exists.

         IT CANNOT COLLIDE WITH THE COLUMN IT NOW SHARES A LANE WITH, and that
         is a fact about the C1 ladder rather than a hope: the hint is „display:
         none“ while the overlay column speaks (rank 1 beats rank 2, further up
         this file), and the audio chip, the follow chip, the telltale cue and
         the demonstration deck are all „display: none“ while the hint is up
         (rank 2 beats rank 3). One surface in the corridor, always.

         AND IT NO LONGER FIGHTS «Кола отзад · 12 м». „RearProximityCue“ is
         „bottom-[6.75rem] left-1/2“, i.e. also dead centre, and the founder's
         own frame has that chip inserted BETWEEN two lines of the teal hint.
         Moving the hint out of the centre band ends that collision without
         touching a file this lane does not own. ⚠ The cue itself is still
         centred and still has NO „data-hud“ name, so no probe in this project
         can see it — the same trap the shadow-line legend was in until
         „RIBBON_LEGEND_LANE_PX“ named it. Handed over, not fixed here.

         "overflow-y: auto" against a "max-height" stays, because a bounded box
         that scrolls is the only version of this that cannot come back — and
         the ceiling is the column's own, so the hint is bound by the same
         hazard band the peek is (notifyColumn.ts).
         ══════════════════════════════════════════════════════════════════ */
      [data-hud="touch-hint"] {
        top: ${NOTIFY_COLUMN_TOP_CSS_ROOMY};
        bottom: auto;
        left: auto;
        right: ${NOTIFY_COLUMN_RIGHT_CSS};
        width: ${NOTIFY_COLUMN_WIDTH_CSS_ROOMY};
        transform: none;
        translate: none;
        align-items: flex-end;
        text-align: right;
        /* …and the OVERFLOW IS THE WORDS', not the card's. It used to be
           „overflow-y: auto" here, i.e. the whole hint scrolled — and measured
           on the deployed build that put «РАЗБРАХ», the one control that clears
           it, 10.9 px below its own fold on an iPhone 16 sideways. The words
           now live in their own scroller and the button is a shrink-0 sibling
           (LessonScene), so this box only has to be honest about its size. */
        overflow: hidden;
      }
      /* …AND IT PAYS THE FLANK'S LANE, WHICH THE FIRST PASS AT THIS ROW DID
         NOT, AND THE RE-MEASURE IS THE ONLY REASON WE KNOW. Written with the
         column's width alone the hint laid out [541, 8, 240 × 141.6] on the
         deployed build — right edge 781 — straight across «Л ЛЯВО» [741,44],
         «З ЗАДН» [741,88] and «Д ДЯСН» [741,132], with its own pointer-events
         «Разбрах» over the last two. Three graded mirror glances, buried by the
         card that teaches the thumbs.
         The peek beside it has paid this lane since 2026-08-14 („FIX · FLANKS")
         and it pays it as a VARIABLE because its own declarations are inline;
         here a stylesheet is doing the writing, so the same variable is simply
         read. Landscape 3.75 rem, upright 0 — the orientation split lives in
         TOUCH_BAND_CSS_VARS and nowhere else. Re-measured: [541, 8, 180 × …],
         right edge 721, twenty pixels clear of the band. */
      /* ── …AND IT WAS STANDING ON THE INTERIOR MIRROR THE WHOLE TIME.
         2026-08-24, twenty-four filings of one sentence.

         WHAT THE FRAMES SHOW. Every one of them is 03-ready on a sideways
         phone, and every one says the same thing — e.g.
         .audit-frames/w10-3/frames/sc-rb-busy-gap__mobile-right/03-ready.png:
         „«Ляв палец — волан…» and «Спряла кола: пусни палеца…» painted straight
         onto the rear-view mirror and the sky, and the mirror is unreadable
         through them". Measured off that frame (2556 × 1179 at dpr 3, i.e. the
         852 × 393 stage this whole catalogue was shot at), the hint's own ink:

           white line 1   y  11.0 → 18.3      teal line 1   y 44.7 → 52.0
           white line 2   y  27.0 → 33.3      teal line 2   y 58.0 → 68.0
                                              teal line 3   y 74.3 → 82.0
           «РАЗБРАХ» pill y  88.7 → 132.3  (43.6 px, i.e. its min-h-11)

         — a box of 8 → 132.5 against a mirror painted 0 → 70. Sixty-two pixels
         of first-run teaching copy on the one instrument the same lesson grades
         a glance at.

         THE LANE IS NOT NEW AND NEITHER IS THE RULING. „An instrument you
         cannot see is not an instrument, so the HUD moves, not the mirror"
         (rows B74/B76, further up this file). SimOverlay moved the peek onto
         NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN on 2026-08-19 and
         notifyColumn.ts then recorded that „the remaining
         NOTIFY_COLUMN_TOP_CSS_COMPACT readers are TOP_RAIL_TOP_CSS and the
         demonstration deck". Re-read against the tree, that sentence was wrong
         by two: this rule and the audio card were both still on the datum, and
         both are right-corridor surfaces. mirror-lane-corridor.test.ts now
         holds the GENERAL form, so the next surface added to this corridor
         cannot quietly inherit the corner again.

         AND THE CEILING HAD TO MOVE WITH THE TOP — the half of the 2026-08-17
         swap that was left half-landed once already. A max-height is measured
         from the box's own top edge, so moving only the top would drop this
         card's floor from 0.40 of the stage to 0.565, through the hazard band,
         and it would have been reported as „the mirror is fixed".

         WHY THE HINT'S CEILING IS THE BAND ITSELF AND NOT THE PEEK'S 0.40. Fed
         the peek's fraction from the new top, this card's budget on the
         founder's own handset is 84.0 px against the 124.5 px it measures on
         the frame above — and this card CLIPS what it cannot hold (overflow:
         hidden on the bare rule; its words live in an overflow-y-auto
         scroller inside a pointer-events-none parent, so no thumb can scroll
         them back). That is not a fold, it is a deletion of two lines of the
         founder's own reverse-gear sentence. The peek stops at the cockpit horizon
         because it is on the glass WHILE THE STUDENT DRIVES and may not stand on
         the road; this card cannot be — touchHintLifetime.ts stands it down the first time the
         car reaches 5 км/ч and its census reads it painted at 03-ready in 174
         of 174 runs and at no 04- frame in any of them. So it is bounded by
         HAZARD_BAND_TOP_FRACTION — it may not ENTER the band — and does not
         also pay the driving margin.

         RESOLVED, AND THE TWO SMALLER PROFILES STILL PAY. The min() has a
         SECOND term — what the driving controls leave (notifyColumnFloorCss) —
         and on every sideways phone in the ladder it is that term, not the
         band, that binds. Printed from the module's own resolvers rather than
         read off the arithmetic above:

           stage      top     floor   ceiling  card    was (0.40)  clipped now
           852 × 393  73.24   193     126.76   124.5   83.96       0.0 px
           780 × 360  67.76   172     120.24   124.5   76.24       4.3 px
           780 × 340  64.44   172     103.56   124.5   71.56      20.9 px

         So on the handset this whole catalogue was photographed on the card
         keeps every line it had AND leaves the mirror; the peek's own fraction
         would have deleted 40.5 px of it. On a 340 px stage there are only
         103.56 px between the mirror's lane and the thumb pads and the card
         wants 124.5, so something must give: this rule gives the tail of the
         reverse-gear sentence rather than the instrument, and says so instead
         of picking the quiet half. The copy is five lines at 180 px and only
         the founder may cut it — that, not another length here, is what closes
         the last 20.9 px. */
      [data-sim-compact="on"] [data-hud="touch-hint"] {
        top: ${NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN};
        right: calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${FLANK_LANE_VAR});
        width: calc(${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - ${FLANK_LANE_VAR});
        max-height: ${notifyColumnMaxHeightCss(
          notifyColumnFloorCss(),
          NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
          HAZARD_BAND_TOP_FRACTION,
        )};
      }
      /* …AND IT STANDS DOWN FOR THE ⚙ SHEET — measured 2026-08-12, kept in
         2026-08-16, and the REASON changed with the hint's corridor.

         WHEN IT WAS WRITTEN: the hint was anchored to "TOUCH_CONTROLS_FLOOR"
         and so is the sheet, and the sheet is a WRAPPING strip that folds to
         three rows on a 393 px phone. iPhone 16 portrait, sheet open with the
         first-run hint still up: «Завърти телефона хоризонтално» over «Ръчна
         спирачка», «Предпазен колан» and «Светлини» at 1 144 px² each, the
         hint's own «Разбрах» over «Скоростен лост — стъпка към D» and «Рестарт»
         at 1 584 px² each, and both of those cells DEAD.

         WHY IT STAYS: the hint now stands in the notification corridor, and
         that corridor is the one this file ALREADY hides in landscape while the
         sheet is open (§W3, a few rules up — the sheet's floor-anchored row
         starts at y 91.5 on an 852 × 393 stage and runs the full width, through
         x 541–721 where the corridor is). Same corridor, same arbitration, and
         the hint is the weaker claim of the two for the same reason the column
         is: the sheet is modal, the student opened it one tap ago, and its ✕ is
         44 px. Unlike the deck the hint loses nothing by waiting — it is a
         sentence that has not been read yet rather than a running replay. */
      html[data-sim-car-sheet="open"] [data-hud="touch-hint"] {
        display: none;
      }

      /* ══════════════════════════════════════════════════════════════════
         …AND THE OPEN SHEET OUTRANKS THE NOTIFICATION COLUMN — 2026-08-12,
         doc 91 §O.3 N4, and it is what was actually stopping «Напреднал».

         MEASURED ON THE DEPLOYED /simulator, two fingers on the glass through
         CDP, not a rig: on small-landscape and galaxy-gesturebar-landscape the
         «M►» cell answers «Скоростният лост е на N» at its own centre, and the
         event log says the finger's pointerdown was delivered to the CARD:

           pointerdown «Съединител …» id4              ← the clutch, held
           pointerdown «Скоростният лост е на N» id5   ← aimed at «M►»
           pointerup   «Скоростният лост е на N» id5
           N → N,  gear never engaged

         while the same clutch with «]» on a keyboard reaches M1 on the same two
         profiles. So the driveline is fine, useTapActivation IS bound at that
         cell (SheetCell), and neither of them is the defect: the finger never
         arrives. THE CARD TEACHING «M►» IS THE RECTANGLE BURYING IT —
         transmissionSwitchHint() fires the instant «Напреднал» is chosen, and
         its own text names the control it is standing on.

         WHY z-index AND NOT „display: none" LIKE THE HINT ABOVE. The rule three
         blocks up this file already states the principle: „A teaching card is
         never treated this way: it moves, it does not disappear." This card is
         the sentence that explains the gate; hiding it while the student is
         doing the thing it teaches is a THEO-4 breach. And it does not need to
         move either — the sheet paints almost nothing. Its cells are 44 px
         TRANSPARENT targets carrying a 10 px word (about 370 px² of ink each),
         so raising them costs the card two words of legibility and buys back
         every cell the column was answering for.

         The whole root is raised rather than the sheet alone, because
         [data-hud="touch-controls"] is z-10 and that establishes a stacking
         context its own children cannot climb out of. Raising it is also the
         right answer on its own terms: the column is pointer-events-none except
         on its buttons, the root is pointer-events-none except on its controls,
         and when a driving control and a notification want the same pixel while
         the student is holding the control strip open, the control is what the
         finger meant.

         Scoped to the sheet being OPEN, so nothing changes for the arc, the
         pads or the rail in the state a lesson is actually driven in. */
      html[data-sim-car-sheet="open"] [data-hud="touch-controls"] {
        z-index: 40;
      }

      /* ══════════════════════════════════════════════════════════════════
         «КОЛАН» IS THE ONE RED THING ON THE SCREEN, AND IT WAS THE QUIETEST
         — 2026-08-16, „THE HUD IS STANDING ON THE ROAD", row 4.

         FOUNDER: „«КОЛАН» is the least visible thing on screen and it faults
         the student 4.5 s in … the affordance the student needs FIRST is the
         one hardest to find."

         MEASURED ON THE DEPLOYED BUILD (WebKit, real insets, iPhone 16
         landscape 852 × 393, sc-zebra-approach@L1, belt off, canvas asserted):

           «Закопчай предпазния колан»  [741, 176, 44 × 44]
             color            rgb(255, 106, 88)   — var(--danger)
             font-size        15px (the ⚠) · 8px (the word)
             background-color rgba(0, 0, 0, 0)    ← nothing
             border           0px                 ← nothing

         and its three neighbours on the same flank — «Л ЛЯВО», «З ЗАДН»,
         «Д ДЯСН» — are the SAME 44 × 44 transparent box, the SAME 15 px glyph
         and the SAME 8 px caption, in white. So the one control that is an
         alert is distinguished from three ordinary controls by HUE ALONE, at
         about 2.5 mm² of ink, over whatever the road happens to be — in his
         frame, a parked car. TouchControls' own note already claims the
         opposite („it is the only red thing on the screen, and fastening it
         hands the same box back to the ⚙ dock"); the claim was true about the
         COLOUR and false about the SALIENCE, and nobody had measured the ink.

         WHAT CHANGES: fill, hairline and a slow pulse. NOT geometry — the box
         stays 44 × 44 („box-sizing: border-box“, so the 1 px ring is inside
         it), the station keeps its place on the band, and „touchArc.test.ts“
         reads the same rects it read yesterday. Nothing else on the screen
         gains ink, which is the whole point: scarcity is what makes „the
         reddest thing on the screen IS the instruction" true.

         WHY IT IS A STYLESHEET RULE. The markup is „TouchControls.tsx“, which
         this lane does not own, and „data-hud“ / „data-arc“ are the vocabulary
         the two trees share — the same mechanism this file already uses for the
         deck, the audio card, the follow chip and the telltale cue. The button
         is named by its ACCESSIBLE NAME rather than by its position, exactly as
         row A2's two end-screen controls are: „aria-label“ is what this control
         IS, and a „:nth-child“ chain would be a private detail of somebody
         else's file that stops matching the day a wrapper moves — the failure
         mode where a fix reports green and the founder still cannot see the
         button. It is additionally pinned to station 0 of the right flank, so
         the rule cannot leak onto a future control that reuses the label.
         ══════════════════════════════════════════════════════════════════ */
      [data-hud="touch-controls"]
        [data-arc="0"][data-arc-side="right"]
        button[aria-label="Закопчай предпазния колан"] {
        border-radius: 9999px;
        border-width: 1px;
        border-color: color-mix(in srgb, var(--danger) 72%, transparent);
        background-color: color-mix(in srgb, var(--danger) 20%, transparent);
        animation: sim-belt-pulse 1800ms ease-in-out infinite;
      }
      /* …and the word gets the two pixels the ring can pay for. 8 px is the
         flank's caption size and it is right for «ДЯСН» — a reminder of a
         control the student already knows. This one is being READ for the
         first time, under time pressure, by a 17-year-old. 15 px glyph + 1 px
         gap + 10 px word = 26 px inside a 44 px box; nothing reflows. */
      [data-hud="touch-controls"]
        [data-arc="0"][data-arc-side="right"]
        button[aria-label="Закопчай предпазния колан"]
        > span:last-child {
        font-size: 10px;
        letter-spacing: 0;
      }
      @keyframes sim-belt-pulse {
        0%, 100% { background-color: color-mix(in srgb, var(--danger) 20%, transparent); }
        50%      { background-color: color-mix(in srgb, var(--danger) 42%, transparent); }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-hud="touch-controls"]
          [data-arc="0"][data-arc-side="right"]
          button[aria-label="Закопчай предпазния колан"] {
          animation: none;
          /* …and it keeps the loud end of the ramp rather than the quiet one:
             reduced motion is a request about movement, not about salience. */
          background-color: color-mix(in srgb, var(--danger) 34%, transparent);
        }
      }

      /* ══════════════════════════════════════════════════════════════════
         THE TWO PAD MARKS STOP BEING „TWO UNSTYLED BLUE CROSSHAIRS" —
         2026-08-16, row 5.

         WHAT THEY ACTUALLY ARE, found by hit-testing the two coordinates in his
         frame rather than by guessing (WebKit, iPhone 16 landscape, deployed):

           (107, 341)  → „[role="slider"][aria-label^="Волан"]“   the steering
                         pad's rule: a 62 × 1 px line, two 1 × 8 px end ticks and
                         a 22 px ring, „bg-accent/45“ + „border-accent“
           (763, 304)  → „[role="slider"][aria-label^="Ход"]“     the drivetrain
                         pad's rule: the same shape rotated, ring border written
                         INLINE as „var(--accent)“

         They are not stray widgets and they are not debris — they are the only
         ink either pad has, and on the absolute drive axis the ring's resting
         place IS „middle is stop". But a horizontal rule with two end ticks and
         a ring through it reads as a crosshair, and both were painted in BRAND
         BLUE at full saturation: the only two saturated marks left on a screen
         whose every other instrument was moved to a neutral hairline register
         by the UNPANEL pass. „[data-hud="touch-controls"]“ was deliberately left
         off „GHOST_SURFACES“ („these controls paint nothing to strip") and that
         is exactly how these two kept their colour.

         SO THE TOKEN IS RESTATED, NOT THE DECLARATIONS. Overriding the colours
         directly cannot work and the reason is worth writing down: the drive
         ring's border is set AT RUNTIME as information — green while the thumb
         asks for throttle, red while it brakes, accent at neutral
         („TouchControls“' „driveApply“) — written inline, so a stylesheet rule
         strong enough to beat it („!important“) would kill the one piece of
         live feedback the pad has. Redefining „--accent“ (and „--color-accent“,
         which is what Tailwind's „bg-accent/45“ and „border-accent“ resolve
         through) on the slider's own subtree moves the NEUTRAL colour and
         leaves „var(--success)“ / „var(--danger)“ untouched. Same mechanism the
         UNPANEL register uses one section down — „inherited by the subtree, so
         „text-foreground“ / „text-muted“ inside a ghost follow without any
         component having to know".

         The value is the register's own ink at 0.62, which puts the rules at
         0.28 after Tailwind's own 45 % modifier — the same weight as the flank
         ghost's hairline, so the pads read as part of the same instrument
         family instead of as two brand-coloured targets floating on a street.
         ══════════════════════════════════════════════════════════════════ */
      [data-hud="touch-controls"] [role="slider"] {
        --accent: rgba(226, 234, 247, 0.62);
        --color-accent: rgba(226, 234, 247, 0.62);
      }

      /* ══════════════════════════════════════════════════════════════════
         PORTRAIT: THE INSTRUMENT READOUT STANDS UP IN THE GAP BETWEEN THE
         THUMBS — 2026-08-12.

         The compact readout is bottom-CENTRE, which is right on a phone held
         sideways (350 px of clear corridor) and impossible on one held upright:
         the two pads are 42 % and 36 % of the width, so 78 % of the bottom edge
         is thumb. Measured on all three portrait profiles, the limit disc — the
         «50» — laid out 397–457 px² on top of the steering pad.

         It is the pad it collides with, so shrinking either is not available
         (he rejected shrinking, and the drivetrain pad has a hard floor of
         2 × TOUCH_DRIVE_ABSOLUTE_RANGE_PX). What is available is the corridor
         itself: 78–86 px wide on every portrait profile in the ladder, free at
         every height. The row becomes a COLUMN and stands in it — same three
         numbers, same 30 px speed digit the founder signed off as legible, same
         bottom edge, no pad under any of them.

         Landscape is untouched: this is inside the portrait query and the row
         there has 350 px and no collision. */
      @media (orientation: portrait) {
        [data-sim-compact="on"] [data-hud="dash-dock"] {
          left: ${PAD_CORRIDOR_LEFT_CSS};
          right: ${PAD_CORRIDOR_RIGHT_CSS};
        }
        [data-sim-compact="on"] [data-hud="status-dashboard"],
        [data-sim-compact="on"] [data-hud="speed-block"] {
          flex-direction: column;
          align-items: center;
          gap: 0;
        }
        /* The corridor is 63–71 px of usable width once both gutters are paid,
           and a three-digit speed at the founder-signed-off 30 px is ~55 of it.
           The row's own 4 px side padding is the difference between fitting and
           not, and it buys nothing in a column. */
        [data-sim-compact="on"] [data-hud="status-dashboard"] {
          padding-inline: 0;
        }
      }

      /* …AND THE SAME PRIORITY ON A ROOMY SCREEN — 2026-08-03.
         Rank 3 waits for rank 1 on a desktop too, and it has to, because both
         now start at the SAME point of the right-edge column: before this the
         audio chip was centred at the top and the task banner was centred under
         it, so „they do not collide" was an accident of two panels each being
         in the wrong place.

         ⚠ THE SENTENCE THAT USED TO END THIS PARAGRAPH WAS FALSE, AND IT IS THE
         WHOLE OF THE «audio-prompt» DEAD-SURFACE CLASS — w11, 2026-08-27.

         It read: „:has(> *) is the honest test — the shell's column is always
         mounted and is USUALLY EMPTY, and an empty column must not suppress
         anything. The chip comes back the moment the task line retires
         (TASK_ANNOUNCE_MS, seven seconds)."

         Both halves are wrong against the tree:

           1. THE COLUMN IS NEVER EMPTY. Its first child is the objective
              banner, and the banner is up for the whole lesson — it is the
              ЗАДАЧА line on every roomy frame in the catalogue. There is no
              „task line retires" here; that seven-second clock belongs to the
              COMPACT overlay queue, which is a different surface in a different
              file. So on a roomy screen this rule is not a priority, it is a
              permanent kill switch.
           2. AND IT REACHES THE PHONE TOO, WHICH IT WAS NEVER MEANT TO. The
              shell writes «hidden» on this column when compact
              (LessonPlayShell: className={… compact ? "hidden" : ""}), i.e. the
              whole thing is display:none on a phone — but :has() matches the
              TREE, not the box, so a display:none column with children still
              satisfies :has(> *) and this desktop rule silenced the chip on
              every mobile beat as well.

         WHAT THAT COST, from the drives rather than from reasoning: sweep w11
         reports «✗ NOT ON THE GLASS — audio-prompt» on 68 of 68 beats across
         all four legs of sc-vu-emergency-junction (pc-right 2/2, pc-wrong 2/2,
         mobile-right 22/22, mobile-wrong 42/42), and the same line on
         sc-mw-discipline, sc-sp-eco-coast, sc-sp-limit-end, sc-mw-min-speed,
         sc-sp-wet-limit-plate, sc-vu-cyclist-hook, sc-ac-aquaplane,
         sc-crossing-white-cane and sc-park-gap-short. Held in the DOM on every
         beat, painted on none — one selector, nine lessons, seven filed rows.

         THE FIX IS THE ONE TOKEN THAT MAKES THE PREDICATE SAY WHAT IT MEANT:
         the column must be VISIBLE and carrying something. «:not(.hidden)» is
         the shell's own switch, read rather than duplicated, so the two cannot
         drift. That restores the phone to the C1 LADDER above — which is where
         the arbitration for this chip actually lives («overlay-active» and
         «:has(touch-hint)» a few rules up, both still in force and both dead
         for as long as this rule was doing their job for them).

         WHAT IS STILL NOT FIXED, and it is stated instead of being implied by
         the diff: ON ROOMY THE CHIP IS STILL NEVER PAINTED, because the banner
         really is permanent and this chip is positioned on the column's OWN box
         (same top, same right, same width — the rule 800 lines up). Showing it
         would stack it on the ЗАДАЧА line. Making it visible there needs a
         PLACE for it, not a predicate, and that is a question about what the
         notify column is rather than a scoping bug. Filed, not smuggled in. */
      [data-sim-stage]:has([data-hud="notify-column"]:not(.hidden) > *)
        [data-hud="audio-prompt"] {
        display: none;
      }

${LIFTED_SHEET_FLOOR_CSS}
${UNPANEL_CSS}
    `}</style>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BOTTOM SHEET THAT DOES NOT REACH THE BOTTOM NEEDS A BOTTOM — sc-rb-exit-
 * signal:a57347d2, and it is the shell's own instrument band that lifts it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE FILING, verbatim: „The card's rounded bottom border is cut off, so the
 * panel reads as chopped." The verifier who re-drove it added the measurement
 * that turns it from a look into a diagnosis — off
 * `.audit-frames/w13/frames/sc-rb-exit-signal__mobile-right/02-briefing.png`,
 * cropped to 300 %: „the blue left border terminates on a flat horizontal cut,
 * there is no bottom-left radius and no bottom stroke, while the same card's
 * TOP-left corner is a fully drawn rounded blue border in the same frame."
 *
 * RE-MEASURED HERE, on that frame (2556 × 1179 device px at dpr 3 — the
 * 852 × 393 stage this catalogue is shot at). The card's fill and its left
 * hairline both end at device y ≈ 1057.5, i.e. **40.5 CSS px above the bottom
 * of the picture**, and `COMPACT_DASH_HEIGHT_PX` is 40. That is not a
 * coincidence and it is not a clip: it is the sheet standing exactly where it
 * is told to.
 *
 * WHAT IS ACTUALLY WRONG, then, is the CLASS LIST and not the geometry. Both
 * sheets in this product are authored flush-to-floor —
 *
 *   SimOverlay.tsx:2557        rounded-t-2xl border-x border-t   (the read sheet)
 *   TeachMomentOverlay.tsx:350 rounded-t-2xl border-x border-t   (compact teach)
 *
 * — a top edge, two sides, and deliberately NO BOTTOM, because a sheet whose
 * bottom edge is the screen's bottom edge has no bottom edge to draw. Both
 * anchor `bottom: var(--sim-dash-h, 0px)`, and that is `0px` on every roomy
 * layout and every ended session, where the authored shape is exactly right.
 * On a phone mid-session it is 40 px, and the same shape becomes a card with a
 * square strokeless edge hanging in mid-air over the instruments.
 *
 * WHY THAT IS WORTH A RULE. This product's largest filed defect family is
 * instructions that really are cut off — the ↓ ОЩЕ N РЕДА rows next door. A
 * card that merely LOOKS cut off is charged at the same price by the only
 * reader who matters: a seventeen-year-old who stops believing he has been
 * shown the whole instruction. Nothing below the cut is missing here (the
 * frame shows all five steps and «Разбрах» inside the box) — which is the
 * whole reason the edge has to say so.
 *
 * ── WHY IT IS A STYLESHEET RULE AND NOT TWO COMPONENT EDITS ────────────────
 *
 * `SimOverlay.tsx` belongs to the hud lane; `data-hud` is the vocabulary this
 * file is built on for exactly that case (see this file's own header, and the
 * tier picker's fill three blocks down, which is the same call made the same
 * way). No `!important` is needed and none is used: `border-x border-t` sets
 * only three widths and `rounded-t-2xl` only two radii, so the four
 * declarations below collide with nothing, and this <style> is unlayered
 * against Tailwind's layered utilities anyway.
 *
 * ── AND THE COMPACT TEACH SHEET IS DELIBERATELY NOT IN THIS SELECTOR ───────
 *
 * It carries the identical class list and it would be one more comma. It is
 * left out because `TeachMomentOverlay`'s `compact` branch IS NOT MOUNTED on
 * the /simulator route: `LessonPlayShell:6648` renders it under
 * `!compact && …` and passes `compact={false}` — on a phone the teach moment
 * is a row in the overlay queue instead (`LessonPlayShell:4494`) — and the
 * only other importer in
 * the tree is `app/dev/popup-rig/popup-rig-client.tsx`, a dev rig. Adding it
 * would be a repair to a surface no student can reach — reported instead, so
 * that whoever revives the phone teach sheet inherits the finished shape
 * rather than the bug.
 *
 * Exported so `liftedSheetFloor.test.ts` can APPLY the selector to the markup
 * SimOverlay actually ships rather than grep for its characters — the failure
 * mode `unpanelInkExemption.test.ts` was written after, where a rule in a
 * template literal rots into a no-op with no type error and no red test.
 */
export const LIFTED_SHEET_FLOOR_CSS = `
      /* The gate is "data-sim-dash-lift", written by LessonPlayShell from the
         SAME expression that fills "--sim-dash-h", so „is there a band" has one
         answer. Absent on roomy and after the session ends — where the sheet
         really does sit on the floor and the authored top-only shape is right.
         "> section" is the read sheet's own box; the wrapper it hangs in is the
         "[data-hud=overlay-read]" dialog and carries no border of its own.
         (No back-ticks anywhere in this block: it is a template literal, and
         one would end the string with no type error until the parser reaches
         the next one.) */
      [data-sim-dash-lift="on"] [data-sim-stage] [data-hud="overlay-read"] > section {
        /* Matches the three sides "border-x border-t" already draw, and picks
           up the inline "border-color" the component sets for all four. */
        border-bottom-width: 1px;
        border-bottom-style: solid;
        /* 1rem = Tailwind's "2xl", i.e. the two radii "rounded-t-2xl" gives the
           top of this same box. The card is "overflow-hidden", so this also
           clips its content — measured against the widest thing at the bottom:
           «Разбрах» is inset 12 px ("px-3") and sits 8 px ("pb-2") above the
           edge, where a 1rem corner has cut only 16 − √(16² − 8²) = 2.1 px of
           width. Nothing on the control is touched. */
        border-bottom-left-radius: 1rem;
        border-bottom-right-radius: 1rem;
      }
`;

/* ===========================================================================
   THE UNPANEL LAYER — the driving HUD stops being a web page over a road.
   ===========================================================================

   FOUNDER REFERENCE, 2026-08-02. Two Gran Turismo frames and one layout he
   drew himself, in `C:\Users\Ljh\Desktop\For fix\`. Opened, finally, and the
   thing they share is NOT the coverage number:

     · tyre temps, ABS, ECU, TC, fuel, the lap times, the leaderboard — none of
       it sits on a card. Naked text and hairline outlines, straight on the
       image;
     · „Brake" and „Throttle" are barely-visible grey words you can read the
       road through;
     · nothing is filled, nothing is blurred, nothing casts a shadow.

   WHY THIS EXISTS AS ITS OWN PASS, AFTER THE COVERAGE WORK. The mobile harness
   charges every pixel a control paints on, so we drove chrome 68.3 % → 6.1 %
   and called it done. Measured here on 2026-08-02 at 1280×720, the drive
   screen still carried THIRTY-EIGHT filled / blurred / bordered surfaces —
   the „⌨ Клавиши" legend alone was 7.8 % of the frame as an opaque blurred
   card, the instrument bar 4.6 %, the audio chip 2.7 %. Six per cent of solid
   cards still reads as a web page; fifteen per cent of floating text reads as
   a game. WE OPTIMISED AREA AND HE WAS ASKING ABOUT FILL.

   So this layer changes FILL, not size, and it is expected to score WORSE on
   tools/mobile — a text-shadow paints more pixels than the glyph alone, and a
   hairline that used to be invisible against a fill is now charged. That is
   the trade, stated out loud rather than hidden.

   HOW CONTRAST SURVIVES WITHOUT A BOX. Exactly the way the reference does it:
   a two-stop dark halo under the type (`--hud-halo`), and ink pinned to the
   LIGHT register in both themes. The pin is the part that is easy to get
   wrong: the ground behind this HUD is a photograph of a road, not the app
   background, so `--foreground` — which is #0b1524 in the light theme — would
   be dark ink under a dark halo, i.e. mud. Inside the stage, and only there,
   the tokens are restated for the surface they are actually painted on.

   WHERE THE TOKEN OVERRIDE HANGS, AND WHY NOT ON THE STAGE. The obvious move
   is to restate the tokens once on the scene box and let them inherit. It is
   wrong, and the reason is worth writing down: the debrief, the micro-quiz and
   the teach card are rendered INSIDE that box, and they are explicit pauses —
   pages to read, on their own scrim, with the theory-grade contrast the founder
   already signed off. Doc 89 §3 is about those cards clipping their own text; a
   student who cannot read the rule they just broke has lost the lesson, not the
   look. Cancelling an inherited override in a subtree cannot be done cleanly
   either — `--x: initial` on a custom property yields the guaranteed-invalid
   value, not the theme's, and restating the palette here would fork it.

   So the tokens ride on the GHOST SURFACES THEMSELVES. Nothing that is not in
   the list below can inherit them, the pause overlays never see them, and no
   cancellation rule has to exist.

   WHAT IS DELIBERATELY NOT SWEPT:
     · `border-radius` — a radius on a transparent element paints nothing, and
       blanket-zeroing it would square off the red speed-limit disc, which is a
       road sign, not a card;
     · semantic border colours (danger / success / accent) set by the
       component — those are information;
     · every explicit pause, by construction (see above).

   WHY A STYLESHEET AND NOT TWELVE COMPONENT EDITS. The same reason the mirror
   and overlay-queue rules above live here: these panels belong to five
   components across three lanes, and `data-hud` is the only vocabulary they
   share. The components this lane owns carry `hud-ghost` in their own class
   lists (the intent is in the code); the ones it does not are reached here by
   name, which is also the merge-safe way to do it while other lanes have those
   files open.
   =========================================================================== */
/**
 * THE GHOST SURFACES — stated once, used by every rule below.
 *
 * `.hud-ghost` is what the components in this lane carry in their own class
 * lists, so the intent lives in the code. The `data-hud` names are the surfaces
 * owned by OTHER lanes: reaching them through the shared attribute vocabulary
 * is both the established pattern in this file and the merge-safe way to do it
 * while those files are open in another worktree.
 *
 * Anything not on this list keeps its panel — which is how the debrief, the
 * micro-quiz, the teach card and the pre-drive checklist stay readable without
 * a single cancellation rule (see the header).
 */
export const GHOST_SURFACES = [
  ".hud-ghost",
  '[data-hud="controls-help"]', // „⌨ Клавиши" — 7.8 % of the frame, measured
  '[data-hud="audio-prompt"]',
  '[data-hud="difficulty"]',
  '[data-hud="demo-deck"]',
  '[data-hud="touch-hint"]',
  '[data-hud="follow-hint"]',
  '[data-hud="glance-buttons"]',
  '[data-hud="glance-ping"]',
  '[data-hud="mouse-pedals"]', // „Brake" / „Throttle" in the reference
] as const;

/** `:is(…)` over the list — one token, so the list cannot drift between rules. */
const GHOST = `:is(${GHOST_SURFACES.join(", ")})`;

/**
 * Exported ONLY so `unpanel.test.ts` can assert on the shipped text of these
 * rules. A stylesheet in a template literal is the one thing in this app that
 * can rot into a no-op without a single type error, a single failing render or
 * a single changed pixel in a test — which is exactly how the tier picker's
 * filled segment survived a whole „unpanel" pass. The component below is still
 * the only consumer at runtime.
 */
export const UNPANEL_CSS = `
      /* ── The register. See GHOST_SURFACES above for what is on this list. */
      [data-sim-stage] ${GHOST} {
        /* THE FACE — 2026-08-03, and it is the half of the reference the first
           unpanel pass did not read. His sentence about the top edge is not
           only about fill: „crisp flat vector glyphs laid on the 3D … where his
           reference uses LOW-CONTRAST MONOSPACE TEXT ANCHORED TO THE EDGE."
           Both GT frames are telemetry in a mono face — ABS, TC, the lap
           times, the sector deltas — and our HUD was drawing the same job in
           IBM Plex Sans, the app's reading face, which is what a web page is
           set in. One declaration on the register moves every instrument at
           once (speed, gear, limit, telltales, the tier picker, the peek line)
           instead of eleven component edits that would drift.

           JetBrains Mono ships a CYRILLIC subset in this app (layout.tsx), so
           «Начинаещ» and «км/ч» render in it rather than falling through to a
           latin-only fallback — that was the one thing worth checking before
           pinning a face on Bulgarian copy.

           The explicit pauses are unaffected: they are not on this list, and
           the debrief / teach card / micro-quiz stay in the reading face. */
        font-family: var(--font-mono);
        /* The halo that replaces the box. Two stops: a tight one that holds an
           edge against bright tarmac, a wide soft one that separates the glyph
           from a busy background, the way the reference's does. */
        --hud-halo: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.7);
        /* Ink, pinned light in BOTH themes — the ground here is a road, not the
           app background (see the header). Inherited by the subtree, so
           "text-foreground" / "text-muted" inside a ghost follow without any
           component having to know. */
        --foreground: #f2f6fc;
        --muted: #c3cfe2;
        /* Hairlines, pinned neutral for the same reason: #d3e0f0 vanishes on a
           bright road and #1e2c46 vanishes on a dark one. Semantic borders
           (danger / success / accent) are set by the component and untouched. */
        --border: rgba(226, 234, 247, 0.22);
        --border-strong: rgba(226, 234, 247, 0.38);
        text-shadow: var(--hud-halo);
      }

      /* …NUMBERS AND LABELS IN THE TELEMETRY FACE, SENTENCES IN THE READING
         FACE. The mono pin above is the reference's grammar for instruments —
         and the reference has no PROSE in it at all, while this HUD does: the
         violation toast carries THEO-4's authored WHY, which is the single
         most important thing on the screen at the moment it appears. Measured:
         JetBrains Mono sets about 24 characters per line in the 216 px toast
         content box against about 35 in the body face, i.e. the same
         explanation grows from four lines to six on the founder's phone. A
         look is not worth costing a student the rule they just broke.

         The split falls out of the existing markup with nothing to maintain:
         every instrument value in this HUD is a span/div/kbd and every
         authored sentence is a <p>. */
      [data-sim-stage] ${GHOST} :is(p, h1, h2, h3, blockquote) {
        font-family: var(--font-sans);
      }

      /* ── The sweep. Fill, blur and shadow come off the panel AND off every
            chip inside it — a ghost panel with a solid pill in it is still a
            panel, just a smaller one. What is left is the outline, which is
            exactly the reference's hairline.

            "[data-hud-ink]" is the opt-out for the handful of fills that ARE
            the information: a progress bar with no fill is not a progress bar,
            and the tier picker's lit pill is the answer to „which tier am I
            on" (the reference has a filled green „BEST" chip for the same
            reason).

            ── AND SINCE 2026-08-19 IT IS ALSO THE ONLY THING HOLDING THE PEEK
               CARD'S GROUND UP. This is a note about a dependency, not a change
               of behaviour: the two ":not()" clauses below are exactly as they
               shipped. What changed is what rests on them.

            Three of this sweep's criticals were the SAME sentence, filed from
            three lessons: „the ИНСТРУКЦИИ card has NO panel background at all
            … the briefing text is painted straight onto the street"
            (sc-junction-gap/mobile-right/01-arrival.png,
            sc-speed-transition/mobile-right/07-end.png) and „the ИНСТРУКЦИИ
            panel … fades out mid-sentence … ↓ ОЩЕ 16 РЕДА"
            (sc-rx-unguarded/mobile-right/01-arrival.png). LOOKED AT, all three:
            the dark rectangle behind the first three or four lines is not the
            card's panel — it is the interior rear-view mirror the card happens
            to sit over. Below the mirror's bottom edge the type continues onto
            sky and facade with nothing behind it.

            "SimOverlay.tsx" closed them by giving the card a shade: a child
            <div> at z-index -1 carrying "data-hud-ink=""". THAT ATTRIBUTE IS
            THE WHOLE FIX. The shade is a "div" inside a ".hud-ghost", so
            without the two ":not()" clauses below it matches this sweep's
            second selector and is handed "background-image: none !important" —
            the shade paints nothing, and the three frames come back exactly as
            filed. SimOverlay says so at its own site („the shade is stripped by
            the stylesheet and this whole fix is a no-op").

            THE CONTRACT HAD ONE GUARDED HALF AND ONE UNGUARDED ONE. Two suites
            assert the COMPONENT still emits the attribute
            ("unpanel.test.ts" on the ack chip, "sim-overlay-scrim.test.ts" on
            the shade). NOTHING asserted this stylesheet still honours it, and
            this is a CSS rule inside a template literal — the one thing in this
            app that can rot into a no-op „without a single type error, a single
            failing render or a single changed pixel in a test" (the note above
            GHOST_SURFACES, written after the tier picker's fill survived a
            whole unpanel pass). Deleting ":not([data-hud-ink])" from the line
            below leaves tsc silent, leaves both of those suites green, and puts
            the three criticals back on the phone.

            "unpanelInkExemption.test.ts" now holds this half, and holds it by
            APPLYING the selector rather than matching its text, so a rewrite
            that keeps the characters and loses the meaning still fails.
            ──────────────────────────────────────────────────────────────── */
      [data-sim-stage] ${GHOST},
      [data-sim-stage] ${GHOST} :is(div, span, button, kbd, p, li, a, section):not([data-hud-ink]):not([data-hud-ink] *):not([aria-pressed="true"]) {
        background-color: transparent !important;
        background-image: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
      }

      /* ── THE SEGMENTED CONTROL — «Начинаещ | Нормален | Напреднал».
            2026-08-03 review, verbatim: „a segmented control lifted straight
            from a settings page, with a FILLED BLUE SELECTED SEGMENT."

            He is describing an iOS/Material segmented control, and he is right
            that it is one: a pill group with a brand-filled active segment is
            the single most recognisable piece of settings-page furniture in
            mobile design, and it was sitting on his windscreen.

            The container was already unpanelled by the sweep above. What
            survived is the SEGMENT, because the sweep carries a blanket
            ":not([aria-pressed="true"])" — written for progress fills and the
            reference's one filled badge, and it happened to also exempt this.
            So the exemption is withdrawn HERE, for this control only, and the
            selected state is restated in the reference's own grammar: the
            chosen tier is the one at full ink with a rule under it, the others
            step back. Nothing is hidden, nothing moves, and the answer to
            „which tier am I on" is still readable at a glance — which is the
            reason the fill was exempted in the first place.

            WHY IT IS STILL A CSS RULE AND NOT A COMPONENT EDIT: the picker is
            rendered by LessonScene.tsx, another lane's file, and "data-hud" is
            the shared vocabulary this whole stylesheet is built on (see the
            header). Specificity: this is (0,3,1) against the sweep's (0,2,1)
            and it repeats "!important", so it wins on both counts. ────────── */
      [data-sim-stage] [data-hud="difficulty"] button[aria-pressed="true"] {
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: inset 0 -2px 0 0 currentColor !important;
        color: var(--foreground);
        border-radius: 0;
      }
      [data-sim-stage] [data-hud="difficulty"] button[aria-pressed="false"] {
        /* Legible, and clearly not the one you are on. 0.72 against the pinned
           #c3cfe2 over the halo, not against the road. */
        opacity: 0.72;
      }
      [data-sim-stage] [data-hud="difficulty"] button {
        letter-spacing: 0.06em;
      }
      /* …and the GROUP's own ring goes with the fill. A rounded outline around
         three options is the other half of what makes a segmented control read
         as one: rendered, it was still a pill sitting in his sky. Three words
         at the edge with one of them underlined is the whole control, and it
         is the shape the reference uses for the same job. */
      [data-sim-stage] [data-hud="difficulty"] {
        border-color: transparent;
      }

      /* ── „Brake" and „Throttle" are ghosts in the reference, and so are the
            mirror-glance arrows that sit in the same corners. Readable, and
            you can see the road through them. They come back to full strength
            the moment a finger is on them, which is the one state where a
            control has to be unambiguous. ────────────────────────────────── */
      [data-sim-stage] [data-hud="mouse-pedals"] button,
      [data-sim-stage] [data-hud="glance-buttons"] button {
        opacity: 0.5;
        transition: opacity 140ms ease-out;
      }
      [data-sim-stage] [data-hud="mouse-pedals"] button:hover,
      [data-sim-stage] [data-hud="mouse-pedals"] button[data-pressed="1"],
      [data-sim-stage] [data-hud="glance-buttons"] button:hover,
      [data-sim-stage] [data-hud="glance-buttons"] button:active {
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-sim-stage] [data-hud="mouse-pedals"] button,
        [data-sim-stage] [data-hud="glance-buttons"] button {
          transition: none;
        }
      }

      /* ── Doc 89 §3, and it belongs in this layer because it is the same
            defect seen from the other side: „the violation card is WIDER THAN
            THE VIEWPORT. Both edges are cut off mid-word — «...АСНА ГРЕШКА»,
            «ътнотранспортно произшествие»." A card that clips its own text has
            destroyed the content, which is worse than a card that is too big.

            The three explicit pauses keep their panel — a student reading the
            rule they just broke needs a page, not a ghost — so they are simply
            never allowed to exceed the picture, and a long Bulgarian compound
            wraps mid-word rather than running off the edge. Cheap, total, and
            it cannot regress: it is stated once for the whole stage instead of
            per card. ─────────────────────────────────────────────────────── */
      [data-sim-stage] [data-hud-keep] {
        max-width: 100%;
      }
      /* Text elements only, deliberately: a blanket "min-width: 0" on "*" is
         the usual flex-overflow fix and it would out-specify the "min-w-11"
         utilities that hold this app's 44 px touch targets open. Wrapping is
         the half of the fix that cannot shrink a control. */
      [data-sim-stage] [data-hud-keep] :is(p, h1, h2, h3, h4, li, dd, dt, td, blockquote) {
        overflow-wrap: anywhere;
      }
`;
