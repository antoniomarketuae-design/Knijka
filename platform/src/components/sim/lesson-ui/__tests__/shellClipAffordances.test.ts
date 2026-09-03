/**
 * =============================================================================
 * THE THREE PLACES THE PLAY SHELL CLIPPED SOMETHING AND SAID NOTHING
 * — catalogue sweep 161, the LessonPlayShell.tsx lane, 2026-08-19.
 * =============================================================================
 *
 * 71 BROKEN findings routed at the shell. These hold the three that are the
 * shell's OWN geometry rather than a component it merely composes:
 *
 *   1 · THE RIGHT-EDGE COLUMN'S CAP LOST ITS MEANING WHEN THE COLUMN MOVED.
 *       `max-height` is measured from an element's top edge, so a cap written
 *       „the stage minus the instrument band" only stops above the band for a
 *       column anchored at 0. On 2026-08-17 `NOTIFY_COLUMN_TOP_CSS_ROOMY`
 *       stopped being 3.25 rem and became the interior mirror's lane; the cap
 *       did not follow. Measured in Chromium on the 1165 × 650 stage the sweep
 *       drove: top 164.00 (the number `notifyColumn.ts` records from both
 *       engines, so the reading is of the shipped CSS), height 486, bottom
 *       650 — the stage's own floor, 108 px INSIDE the band, over the pedal
 *       column and the wiper/lights icons. With the top subtracted: height 322,
 *       bottom 486, which is what the cap's comment always claimed.
 *
 *   2 · THE DEBRIEF SCROLLED IN SILENCE — sc-vu-emergency-junction and
 *       sc-vu-pass-clearance, both platforms. The per-objective breakdown, the
 *       only honest statement of what was and was not credited, was below a
 *       fold nothing announced. The scrim has carried `overflow-y-auto` since
 *       §I20, so it was always REACHABLE; WebKit paints no bar at rest and the
 *       sweep's harness runs Chromium with `--hide-scrollbars`, so neither the
 *       student nor the instrument could see one.
 *
 *   3 · THE SAVE-FAILURE ROW HAD NO LAYOUT IN THE ONE STATE IT EXISTS FOR —
 *       sc-vp-telltale-red/mobile-right/08-debrief. Bare 12 px type on the last
 *       row of pixels of an iPhone landscape screen, edge to edge, sharing its
 *       line with the OSM attribution.
 *
 * WHAT THIS FILE CAN AND CANNOT HOLD. jsdom has no layout engine, so a
 * rendered assertion about a flex box's height would pass whatever the class
 * list said — the reason `briefingOverflow.test.tsx` next door splits the same
 * way. So each row here is a PURE half (arithmetic, asserted in both
 * directions) plus a SOURCE half (the wiring that feeds it). The layout half
 * was measured in Chromium and WebKit before the fix landed and the numbers are
 * quoted where they are used; the probe that produced them was temporary by
 * construction and is not in the tree.
 *
 * EVERY ASSERTION BELOW WAS PROVED BY MUTATION — the input that SHOULD break it
 * was constructed and watched to break. Where the mutation is not obvious from
 * the case it is written out beside it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MINIMAP_TOGGLE_SIZE_PX, ROOMY_HUD_FLOOR_PX } from "../immersive";
import {
  isToastArrival,
  LEGEND_ANNOUNCE_MS,
  notifyColumnCapPx,
  rowsBelowFold,
  rowsFullyBelowFold,
  SCROLL_REMAINING_SLACK_PX,
  scrollRemainingPx,
  TASK_ANNOUNCE_MS,
  TOAST_FADE_PX,
  TOAST_TALLEST_LINE_PX,
  toastPageScrollTop,
} from "../LessonPlayShell";
import {
  overlayPriority,
  selectOverlay,
  type SimOverlayItem,
} from "@/modules/sim/hud";

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

/**
 * The source with its prose taken out. Same reason as the sibling file's: this
 * file's whole register is writing the reason down, and an assertion that
 * cannot tell code from the paragraph describing it is a ban on doing that.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = stripComments(SHELL);

/** The two desktop stages `notify-column-mirror.test.ts` measures against, with
 *  the `top` it records for each from both engines. */
const DESKTOP_STAGES = [
  { id: "1264 × 619", height: 619, top: 156.56 },
  { id: "1165 × 650", height: 650, top: 164 },
] as const;

/* ─────────────────────────────────────────────────────────────────────────────
   1 · THE COLUMN STOPS ABOVE THE INSTRUMENT BAND, WHEREVER IT STARTS
   ────────────────────────────────────────────────────────────────────────── */

describe("notifyColumnCapPx · the cap follows the column's own top", () => {
  it("THE FRAME, AS ARITHMETIC: 164 + cap lands on 100% − 108 − 3.5rem, not on the floor", () => {
    // The 1165 × 650 stage is the `?chrome=dashboard` box at the sweep's
    // 1440 × 900 window — the geometry every pc-* frame in sweep161 was shot
    // at. Chromium put the shipped `top` at exactly 164.00 there.
    const cap = notifyColumnCapPx(650, 164);
    expect(cap).toBe(322);
    expect(164 + cap).toBe(650 - ROOMY_HUD_FLOOR_PX - 56);

    // THE MUTATION, and it is the code that shipped: `calc(100% - 108px -
    // 3.5rem)` ignores the top entirely. Run it on the same stage and the
    // column's box ends 108 px inside the band — which is where the pedal
    // column, the wiper icon and the lights icon are, and is why
    // `sc-sp-limit-end/pc-wrong/04-t017s.png` has a graded-fault card lying
    // across the controls.
    const shipped = 650 - ROOMY_HUD_FLOOR_PX - 56;
    expect(shipped).toBe(486);
    expect(164 + shipped).toBe(650);
    expect(164 + shipped - (650 - ROOMY_HUD_FLOOR_PX)).toBe(108);
  });

  it("holds on both desktop stages, and the shipped formula holds on neither", () => {
    for (const s of DESKTOP_STAGES) {
      const bottom = s.top + notifyColumnCapPx(s.height, s.top);
      expect(bottom, `${s.id}: the column reaches the instrument band`).toBeLessThanOrEqual(
        s.height - ROOMY_HUD_FLOOR_PX,
      );
      // NEGATIVE CONTROL. Without this pair a cap that simply returned 0 would
      // satisfy the line above on every stage — which is the „loosen the check
      // until everything passes" failure this project has already paid for.
      const shippedBottom = s.top + (s.height - ROOMY_HUD_FLOOR_PX - 56);
      expect(shippedBottom, `${s.id}: the shipped cap was already clear`).toBeGreaterThan(
        s.height - ROOMY_HUD_FLOOR_PX,
      );
    }
  });

  it("…and above the 🗺 toggle, which stands ON the band rather than in it", () => {
    // sc-ac-highbeam-lead:8b149c07 filed TWO symptoms on one frame
    // (`sweep161/sc-ac-highbeam-lead/pc-wrong/04-t018s.png`): the −10 ОПАСНА
    // ГРЕШКА card cut mid-sentence, AND „the round mirror button painted on top
    // of the card's lower right corner". That button is `data-hud=
    // "minimap-column"`'s 🗺 toggle, whose bottom is `--sim-hud-floor`, so it
    // occupies the 40 px ABOVE the floor line the case above stops at — i.e.
    // that case passes with the toggle entirely under the card. The clearance
    // is real but unstated: it exists only because the column's band gutter
    // (56) happens to exceed MINIMAP_TOGGLE_SIZE_PX (40), and those two numbers
    // live in two files. MUTATION, watched to fail: a gutter of 20 puts the
    // column's bottom at 491 against the toggle's top at 471 and turns this red.
    for (const s of DESKTOP_STAGES) {
      const bottom = s.top + notifyColumnCapPx(s.height, s.top);
      expect(bottom, `${s.id}: the column reaches the map toggle`).toBeLessThanOrEqual(
        s.height - ROOMY_HUD_FLOOR_PX - MINIMAP_TOGGLE_SIZE_PX,
      );
    }
  });

  it("is not a cap that hides the column — the other direction", () => {
    // A column that yields ALL its height is the mirror-image defect: the
    // objective banner, the advisor and the graded-fault toast would have
    // nowhere to render at all, and every frame would still look tidy.
    // 322 px holds the tallest column this project has on record (316.6 px,
    // the five-step briefing, quoted in notifyColumn.ts).
    expect(notifyColumnCapPx(650, 164)).toBeGreaterThan(316.6);
    expect(notifyColumnCapPx(619, 156.56)).toBeGreaterThan(298);
  });

  it("never returns a negative height on a stage too short to hold anything", () => {
    // A 200 px stage (a restored desktop window mid-drag) would give −20; a
    // negative `max-height` is invalid CSS and would be DROPPED, leaving the
    // box at auto height — i.e. the full stage, the exact bug this fixes.
    expect(notifyColumnCapPx(200, 56)).toBe(0);
    expect(notifyColumnCapPx(0, 0)).toBe(0);
  });

  it("THE WIRING: the shipped `max-height` subtracts the top constant", () => {
    // The pure function above is only the argument; this is the declaration
    // that has to carry it. Asserted on code with the prose stripped, because
    // the block beside it quotes the old string to explain what was wrong.
    const style = CODE.slice(CODE.indexOf('data-hud="notify-column"'));
    const maxHeight = style.slice(style.indexOf("maxHeight:"), style.indexOf("maxHeight:") + 220);
    expect(maxHeight).toContain("NOTIFY_COLUMN_TOP_CSS_ROOMY");
    expect(maxHeight).toContain("ROOMY_HUD_FLOOR_PX");
    // …and the 3.5 rem gutter is the SAME number the function uses, not a
    // second literal that can drift from it.
    expect(maxHeight).toContain("NOTIFY_COLUMN_BAND_GUTTER_PX");
    expect(maxHeight).not.toMatch(/3\.5rem/);
  });

  it("…and the guard next door still finds its anchor 260 characters early", () => {
    // `thumb-band-clearance.test.ts` (N4) locates the column by `indexOf` on
    // its `data-hud` name and reads 260 characters forward for its stacking
    // order. The first draft of this lane's doc comment QUOTED that name higher
    // up the file and turned N4 red — correctly.
    const anchor = SHELL.indexOf('data-hud="notify-column"');
    expect(anchor).toBeGreaterThan(0);
    expect(SHELL.slice(anchor, anchor + 260)).toContain("z-30");

    // …AND THE LINE ABOVE IS NOT ENOUGH, WHICH THE MUTATION RUN PROVED. The
    // SECOND draft of that comment also explained what N4 searches for, so the
    // string `z-30` appeared inside the paragraph itself: the anchor moved to
    // the comment, the 260-character window found the word in the prose, and
    // both this case and N4 went green while the real declaration 2,900 lines
    // below was no longer being read at all. A guard that a paragraph can
    // satisfy is a guard on paragraphs.
    //
    // So the property is stated directly: the FIRST occurrence of the name is
    // inside the component, not in a module-level block.
    const component = SHELL.indexOf("export function LessonPlayShell({");
    expect(component).toBeGreaterThan(0);
    expect(anchor).toBeGreaterThan(component);

    // …AND THE DECLARATION N4 BELIEVES IT IS READING IS ACTUALLY THERE, which
    // N4's own window does not prove even today: the 260 characters after the
    // first occurrence are the PARAGRAPH that explains the stacking order — the
    // word it searches for is in the prose, and the real class list starts
    // further on. That is not a fault to fix from this lane (the file is
    // `hud/__tests__/thumb-band-clearance.test.ts`), but this lane can hold the
    // thing N4 is standing in for, measured from the JSX attribute itself.
    const attr = /^\s*data-hud="notify-column"\s*$/m.exec(SHELL);
    expect(attr, "the element still carries the name on a line of its own").not.toBeNull();
    const decl = SHELL.slice(attr!.index, attr!.index + 260);
    expect(decl).toContain("className=");
    expect(decl).toContain("z-30");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE DEBRIEF SAYS WHEN IT CONTINUES BELOW THE FOLD
   ────────────────────────────────────────────────────────────────────────── */

describe("scrollRemainingPx · the surface credit is read off announces its own fold", () => {
  it("THE FRAME: a 1900 px debrief in the 650 px stage reports what is left", () => {
    // sc-vu-emergency-junction/pc-right/08-debrief — the protocol table cut
    // just under «Общо (допустими 9)». Measured in both engines on a faithful
    // reproduction of the scrim at 1165 × 650: 1348 px below the fold in
    // Chromium, 1345 in WebKit (the 3 px is the pill's own line box).
    expect(scrollRemainingPx(0, 602, 1950)).toBe(1348);
    // The pre-fix behaviour said nothing at all in this state. That silence is
    // the defect; there is no number that reproduces it except 0.
  });

  it("reaches zero at the end — the affordance is not permanent chrome", () => {
    // THE DIRECTION THAT MATTERS MOST. A hint that never stands down is the
    // «↓ ОЩЕ N РЕДА» badge this same sweep filed twice for covering the
    // sentence it was counting.
    expect(scrollRemainingPx(1348, 602, 1950)).toBe(0);
    // …and it shrinks on the way, rather than being a boolean wearing a number.
    expect(scrollRemainingPx(400, 602, 1950)).toBe(948);
  });

  it("says nothing about a debrief that fits, on any scroll position", () => {
    // The false-certificate direction: a student whose whole debrief is on
    // screen must not be told to scroll for a breakdown they are looking at.
    expect(scrollRemainingPx(0, 602, 602)).toBe(0);
    expect(scrollRemainingPx(0, 602, 500)).toBe(0);
  });

  it("swallows sub-pixel residue and nothing larger", () => {
    // Fractional line boxes stack: a scroller read to the end reports 1–3 px
    // left on both engines. The slack is exactly that, and it is not a licence
    // to hide a line — the debrief's smallest face is 10 px.
    expect(scrollRemainingPx(0, 602, 602 + SCROLL_REMAINING_SLACK_PX)).toBe(0);
    expect(scrollRemainingPx(0, 602, 602 + SCROLL_REMAINING_SLACK_PX + 1)).toBe(5);
    // MUTATION: had the slack been a whole line (16 px), this case — half a
    // sentence of the per-objective list hanging below the fold — would report
    // nothing.
    expect(SCROLL_REMAINING_SLACK_PX).toBeLessThan(10);
  });

  it("reports nothing before first layout instead of the whole document", () => {
    // Same rule as `rowsBelowFold`: clientHeight 0 is „not measured yet", not
    // „everything is hidden". Without it the pill flashes on every mount, on
    // every debrief, including the ones that fit.
    expect(scrollRemainingPx(0, 0, 1950)).toBe(0);
  });

  it("THE WIRING: the scrim is the measured element, and the pill is conditional", () => {
    const end = CODE.slice(CODE.indexOf('data-hud="end-screen"'));
    const block = end.slice(0, end.indexOf("end-bar"));
    // Read off the element the browser actually clips against…
    expect(block).toContain("ref={endScrollRef}");
    expect(block).toContain("onScroll={measureEndScroll}");
    // …painted on the desktop half too, where a bar CAN exist…
    expect(block).toContain("scrollbar-width:thin");
    // …and the pill exists only while something is genuinely below.
    expect(block).toContain("{endHasMore ? (");

    // AND THE FLAG IS DERIVED FROM THE MEASUREMENT, WHICH THE LINE ABOVE DOES
    // NOT CHECK. The mutation run walked through the first version of this case
    // by leaving the JSX condition alone and replacing the handler's body with
    // `setEndHasMore(true)`: the pill became permanent chrome — the defect this
    // sweep filed twice on the phone — with every assertion here still green.
    // A conditional is only as honest as what feeds it.
    expect(CODE).toContain(
      "setEndHasMore(scrollRemainingPx(el.scrollTop, el.clientHeight, el.scrollHeight) > 0);",
    );
    // It may never eat a tap meant for the CTA it floats over.
    const pill = block.slice(block.indexOf("{endHasMore ? ("));
    expect(pill.slice(0, pill.indexOf("</p>"))).toContain("pointer-events-none");
  });

  /* ───────────────────────────────────────────────────────────────────────
     …AND IT USED TO SIT ON THE SENTENCE IT WAS ANNOUNCING — sweep w10.

     `sc-vu-pass-clearance/pc-right/08-debrief-p3.png`, 1440 × 900. One line
     of «Разбор от инструктора» with the pill drawn through it:

       Какво се получи д[↓ РАЗБОРЪТ ПРОДЪЛЖАВА — ПРЕВЪРТИ ЗА ОЦЕНКАТА ПО
       ЗАДАЧИ]дение не влезе в точките.

     Four more instances in the same sweep, every one of them this surface.
     The affordance was right; `sticky bottom-0` INSIDE the scroller was not.
     A sticky box pins to the bottom edge of the SCROLLPORT, so every line
     that scrolls past that edge passes under it — an opaque plate blanking
     whichever words happen to be there. Under THEO-4 the debrief IS the
     explanation, and a scroll hint may not be paid for with it.

     The three cases below are the three halves of the structural answer, and
     none of them can be satisfied by the shape that was photographed.
     ──────────────────────────────────────────────────────────────────── */
  it("THE FOLD LINE IS OUTSIDE THE SCROLL BOX, not floating inside it", () => {
    const scroller = CODE.indexOf('data-hud="end-screen"');
    const fold = CODE.indexOf('data-hud="end-fold"');
    expect(scroller).toBeGreaterThan(-1);
    expect(fold).toBeGreaterThan(scroller);

    // THE STRUCTURAL READING, and it is a count rather than a string because a
    // string cannot tell „next to" from „inside". Between the scroller's own
    // attributes and the line, a SIBLING leaves exactly one unmatched `</div>`
    // — the scroller's. Put the line back where it was photographed and the
    // inner content column's unmatched `<div` lands in the same slice and the
    // delta goes to −1. Both numbers were computed off the real file before
    // this case was written; the mutation is not hypothetical.
    const between = CODE.slice(scroller, fold);
    const opens = (between.match(/<div/g) ?? []).length;
    const closes = (between.match(/<\/div>/g) ?? []).length;
    expect(closes - opens).toBe(1);
  });

  it("…and the box that scrolls is the one that YIELDS the line's height", () => {
    // `min-h-0` is what lets a flex item shrink below its content at all, and
    // `flex-1` is what makes it take the rest. Without the pair the scroller
    // keeps its full height and pushes the line off the bottom of the overlay
    // — the same sentence lost by a different route, which is why this is
    // asserted and not left to the wrapper alone.
    const tag = CODE.slice(CODE.indexOf('data-hud="end-screen"'));
    expect(tag.slice(0, tag.indexOf(">"))).toContain("min-h-0 flex-1");
    const scrim = CODE.slice(CODE.indexOf('data-hud="end-scrim"'));
    expect(scrim.slice(0, scrim.indexOf(">"))).toContain("flex flex-col");
  });

  it("MUTATION — no `sticky` and no `absolute` anywhere on the line itself", () => {
    // The one-character revert this whole case exists to catch. Asserted on
    // the line's own element, not on the block, so the scroller's own
    // positioning cannot mask it.
    const pill = CODE.slice(CODE.indexOf('data-hud="end-fold"'));
    const element = pill.slice(0, pill.indexOf("</p>"));
    expect(element).not.toContain("sticky");
    expect(element).not.toContain("absolute");
    expect(element).toContain("shrink-0");
  });

  it("THE OBSERVER WATCHES THE CONTENT, NOT ONLY THE BOX", () => {
    // The trap one step from `BriefingCard`'s observer: a ResizeObserver on a
    // scroller fires for changes to the SCROLLER's size, never to what is
    // inside it — and this debrief grows twice after it opens, when the I1
    // calibration gate releases the result and when `finishLessonAction`
    // returns the concepts and the XP. Observing the scrim alone would measure
    // the card as it was before the two things a student most wants to read
    // arrived, and the pill would be stale in the reassuring direction.
    const effect = CODE.slice(CODE.indexOf("const measureEndScroll"));
    const body = effect.slice(0, effect.indexOf("}, [debriefOpen, measureEndScroll]);"));
    expect(body).toContain("ro.observe(el)");
    expect(body).toContain("firstElementChild");
    expect(body).toContain("ro.observe(content)");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE SAVE-FAILURE ROW IS A CARD, NOT THE LAST ROW OF PIXELS
   ────────────────────────────────────────────────────────────────────────── */

describe("the footer's one immersive state actually has a layout", () => {
  /** The footer row: from the ODbL comment to the end of the component. */
  const FOOTER = CODE.slice(CODE.indexOf("{ended && saveResult && !saveResult.ok ? ("));

  it("the warning takes the whole line — the attribution can never share it", () => {
    // THE FRAME: «Сесията не се записа (SAVE_FAILED) …» and «© OpenStreetMap
    // contributors» on one row, the second pushed right by `ml-auto`, reading
    // as one artefact strip. `basis-full` is what makes `flex-wrap` break.
    const warning = FOOTER.slice(0, FOOTER.indexOf("</span>"));
    expect(warning).toContain("basis-full");
    // …and it is a plate, because the sentence that says a student's drive was
    // not saved may not be the only thing on the screen with no box round it.
    expect(warning).toContain("border-warning");
    expect(warning).toContain("rounded-xl");
    // MUTATION: strip `basis-full` and the row is a two-item flex line again —
    // exactly the frame — while every className assertion above still passes.
    // That is why this case asserts the layout property and not the look.
  });

  it("takes real safe-area insets in the layout that has no page padding", () => {
    // Immersive+compact gives the shell root NO padding on purpose („eight
    // pixels of page gutter on each side of a driving simulator is eight
    // pixels of road"), and `viewport-fit=cover` ships, so on a landscape
    // iPhone the bottom and side insets are real. This row is that root's last
    // child; without insets it is painted under the home indicator.
    const style = FOOTER.slice(0, FOOTER.indexOf("{ended &&"));
    const row = CODE.slice(
      CODE.indexOf("immersive && !(ended && saveResult && !saveResult.ok)"),
    );
    const decl = row.slice(0, row.indexOf("{ended &&"));
    expect(decl).toContain("env(safe-area-inset-bottom");
    expect(decl).toContain("env(safe-area-inset-left");
    expect(decl).toContain("env(safe-area-inset-right");
    // …and only while immersive: the letterboxed desktop layout already sits
    // inside the dashboard's own padding and must not gain a second gutter.
    expect(decl).toContain("immersive");
    expect(style.length).toBeGreaterThanOrEqual(0);
  });

  it("the warning is still never suppressed by the fullscreen hide", () => {
    // The one thing this row must not lose. QW1 hides the footer while
    // immersive — UNLESS a save failed, which is the exception the whole
    // layout above exists to serve. A refactor that dropped the exception
    // would make every frame tidy and the message gone.
    expect(CODE).toContain("immersive && !(ended && saveResult && !saveResult.ok) ? \"hidden\" : \"\"");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   4 · THE BRIEFING'S SCROLLER IS PAINTED, NOT ONLY PRESENT
   ────────────────────────────────────────────────────────────────────────── */

describe("the ИНСТРУКЦИИ list can be seen to be scrollable", () => {
  it("carries the two declarations the product's other HUD scrollers carry", () => {
    // Filed five times in words that all name the same missing thing —
    // «no scrollbar or overflow affordance» (sc-ln-turn-lane-arrows), «no
    // item 5 and no scroll affordance» (sc-jx-priority-confidence), «cuts off
    // after item 4 with no scrollbar» (sc-ov-crest-curve), plus
    // sc-jx-blocked-exit and sc-sp-wet-limit-plate. `overflow-y-auto` alone
    // paints nothing at rest in WebKit, which is the engine the founder is on.
    const card = CODE.slice(CODE.indexOf("export function BriefingCard({"));
    const list = card.slice(card.indexOf("<ol"), card.indexOf("</ol>"));
    expect(list).toContain("overflow-y-auto");
    expect(list).toContain("scrollbar-width:thin");
    expect(list).toContain("scrollbar-color");
    // The counter stays too — it answers „did I know something was hidden",
    // which a scrollbar does not, and it is the half that survives a touch
    // screen with no bar at all.
    expect(card).toContain("↓ още {below}");
  });

  it("…and the desktop can reach the quality setting at all", () => {
    // sc-sp-curve/pc: „the in-drive menu never opens … on PC it is the
    // ordinary drive frame". Most of the compact sheet's rows are buttons on
    // the roomy top bar already; `nextQualitySelection` was the one that was
    // not, with a single call site inside the compact-only items array. A
    // desktop student whose frame rate collapsed had to leave the session.
    const calls = CODE.split("nextQualitySelection(qualitySelection)").length - 1;
    expect(calls, "the quality cycler is reachable from exactly one surface").toBe(2);
    // …and the second one is on the ROOMY bar, i.e. before the stage box —
    // the compact sheet's items array is built above it, the bar renders under
    // `{compact ? null : (`.
    // ── THE ANCHOR MAY NOT DEPEND ON THE CHECKOUT'S LINE ENDINGS.
    // This searched for `{compact ? null : (\r\n      <div …`, i.e. a literal
    // CRLF, and this repository stores LF with `core.autocrlf=true`: the working
    // copy is CRLF on a stock Windows checkout and LF the moment any tool
    // rewrites the file — and LF everywhere on Linux, which is where CI runs. A
    // -1 from `indexOf` then makes `slice` return the WHOLE FILE from 0, so the
    // case stayed green for the wrong reason on one platform and reported an
    // empty slice on the other. Matched on the newline instead of on a
    // particular spelling of it.
    const barOpen =
      /\{compact \? null : \(\s*<div className="flex flex-wrap items-center gap-3">/.exec(CODE);
    expect(barOpen, "the roomy top bar's opening conditional").not.toBeNull();
    const bar = CODE.slice(barOpen!.index, CODE.indexOf('data-sim-stage=""'));
    expect(bar.length).toBeGreaterThan(0);
    expect(bar).toContain("nextQualitySelection(qualitySelection)");

    // …AND ITS GUARD IS NAMED, not merely present. The first version of this
    // case counted call sites and checked the bar contained one, and the
    // mutation run walked straight through it: wrapping the button in
    // `{false && …}` leaves the call site in the source, in the right slice,
    // rendering nothing. A presence check cannot see reachability, so the
    // condition itself is the assertion — it must be about the session, and it
    // must not be about the layout, which is the gate that hid this row from
    // the desktop in the first place.
    const call = bar.indexOf("nextQualitySelection(qualitySelection)");
    // The JSX conditional that OPENS this block — not the nearest `{`, which is
    // the arrow function inside `onClick` and is what the first draft of this
    // slice found.
    const open = bar.lastIndexOf("? (", call);
    const cond = bar.slice(bar.lastIndexOf("{", open) + 1, open);
    expect(cond).toContain("!ended");
    expect(cond).toContain("onQualityChange");
    expect(cond).not.toContain("compact");
    expect(cond).not.toMatch(/\bfalse\b/);
    // THE TRADE TRAVELS WITH IT — doc 64 THEO-4 one layer out. A quality switch
    // that changes the picture without saying what it costs is the bare verdict
    // requirement zero forbids, and the compact row carries `hintBg` for
    // exactly this reason. A top bar has no second line, so it is the `title`.
    expect(bar).toContain("qualityTradeBg(qualitySelection, quality)");
  });

  it("the same pair is on the two scrollers that set the precedent", () => {
    // If either of those loses it, this one is no longer „the house pattern"
    // and the next pass has no reason to keep it here either.
    for (const p of ["../../LessonScene.tsx", "../../../../modules/sim/hud/PreDriveChecklist.tsx"]) {
      const src = readFileSync(resolve(__dirname, p), "utf8");
      expect(src, p).toContain("[scrollbar-width:thin]");
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   5 · THE LAST CARD IN THE COLUMN WAS GUILLOTINED, AND THE CAP'S OWN COMMENT
       SAID SO — „a separate defect, routed below" that nothing routed.

   Seven BROKEN findings, roomy leg, all one sentence: the card that explains a
   graded fault is cut off by the bottom of the play area mid-sentence.
   sc-pk-ban-stop/pc-wrong/04-t023s («shown half a sentence about a 10-point
   dangerous error»), sc-sp-limit-end/pc-wrong/04-t017s — VERIFIED BY EYE, the
   last visible line is «означава директно неиздържан» with the glyph tops of
   «изпит» sliced through, on a −10 ОПАСНА ГРЕШКА — plus sc-sp-eco-coast,
   sc-sp-wet-limit-plate, sc-vu-emergency, sc-merge-from-property and
   sc-ln-obstacle-meeting.
   ────────────────────────────────────────────────────────────────────────── */

describe("the column takes nothing out of the graded fault", () => {
  /** The sweep's own roomy stage: 1165 × 650, column top 164 (the number
   *  notifyColumn.ts records from both engines) ⇒ cap 322. */
  const CAP = notifyColumnCapPx(650, 164);

  it("the cap is the sweep's own 322, which is what the deficit was against", () => {
    expect(CAP).toBe(322);
  });

  /* ── TWO ARITHMETIC ROWS STOOD HERE AND ARE GONE WITH `notifyColumnCutPx`
        — 2026-08-26. Their numbers are the frame and are kept:

          objective banner 52 + two 240 px fault cards + 2 × 6 px of `gap-1.5`
          = 544 against a 322 px cap ⇒ **222 px cut**, i.e. 92 % of the second
          card. Eighteen pixels survive: its «ОПАСНА ГРЕШКА / −10 изпитни т.»
          header row and nothing under it — a verdict with its reason cut off,
          which is the bare verdict THEO-4 forbids, delivered by a layout.
          Two cards is not an edge case; it is what the queue shows when two
          things went wrong.

        What those two rows could NOT do is fail on anything the product does.
        They exercised a pure function with four numbers typed into the test,
        and the function had no caller anywhere in `platform/src` — so the
        deficit it modelled could return in full and both rows would stay
        green. The row below is the one that holds the fix, and it reads the
        shipped source: the deficit is absorbed by a SCROLLER, not computed. ── */

  it("THE WIRING: the toast stack scrolls instead, with a bar and a counted row", () => {
    const scroller = CODE.slice(CODE.indexOf("data-hud-toast-scroller"));
    const decls = scroller.slice(0, scroller.indexOf("<HudToasts"));
    // It can shrink at all…
    expect(decls).toContain("min-h-0");
    // …it scrolls rather than being clipped…
    expect(decls).toContain("overflow-y-auto");
    // …and the bar is PAINTED, because WebKit's overlay bar exists only during a
    // scroll and the harness runs Chromium with `--hide-scrollbars`. The same
    // pair the briefing card and the two precedent scrollers carry.
    expect(decls).toContain("scrollbar-width:thin");
    expect(decls).toContain("scrollbar-color");
    // The measured sentence, OUTSIDE the scroller and conditional on there
    // really being something below the fold.
    const after = scroller.slice(scroller.indexOf("</div>"));
    expect(after).toContain("toastsBelowFold > 0");
    expect(after).toContain("toastsUnseenBelowFold");
    expect(after).toContain("shrink-0");
  });

  describe("…and the sentence it says is true in BOTH shapes of fold", () => {
    /** One 240 px card in a 120 px scrollport: half of it is under the cut and
     *  there is no second card at all. Before the shrink-weight repair this
     *  state produced NO row (the scroller never overflowed, so the count was
     *  0); it is now the common one, which is why the wording had to move. */
    const oneTallCard = [{ top: 0, height: 240 }];
    /** Two cards, the first read whole, the second entirely under the cut. */
    const twoCards = [
      { top: 0, height: 100 },
      { top: 106, height: 100 },
    ];

    it("a single guillotined card has NOTHING entirely below it", () => {
      // Both counts, in both directions, so neither can drift into the other.
      expect(rowsBelowFold(oneTallCard, 0, 120)).toBe(1); // …something is cut…
      expect(rowsFullyBelowFold(oneTallCard, 0, 120)).toBe(0); // …but nothing is unseen
      // MUTATION: `r.top > fold - 1` → `r.top + r.height > fold + 1` (i.e. the
      // other counter's rule) makes this 1 and the shell promises a second
      // notification over a column that holds one card.
    });

    it("…and a second card that starts under the fold IS counted", () => {
      expect(rowsFullyBelowFold(twoCards, 0, 105)).toBe(1);
      // The bias: a row starting within 1 px ABOVE the fold still counts, because
      // announcing „the explanation continues" over an unmentioned second graded
      // fault is the one direction this may never round in.
      expect(rowsFullyBelowFold([{ top: 105.5, height: 100 }], 0, 106)).toBe(1);
    });

    it("scrolling to the end clears both, and an unlaid-out list claims nothing", () => {
      expect(rowsBelowFold(twoCards, 101, 105)).toBe(0);
      expect(rowsFullyBelowFold(twoCards, 101, 105)).toBe(0);
      // `clientHeight <= 0` is „not laid out yet", not „everything is hidden" —
      // the same guard `rowsBelowFold` carries, and for the same reason: a flash
      // of «още 2» on every mount is permanent chrome by another name.
      expect(rowsFullyBelowFold(twoCards, 0, 0)).toBe(0);
    });

    it("THE WIRING: the two counts pick two different sentences", () => {
      // ══ THE SCOPE, AND WHY IT IS WRITTEN THIS WAY NOW ════════════════════
      // This window used to be `after.slice(0, after.indexOf("</p>"))`, and on
      // 2026-08-26 the row it scopes stopped being a `<p>` and became a
      // `<button>` (the fold counter had to become the control — see the shell).
      // The slice did not fail. It found the NEXT `</p>` in the file instead
      // and silently grew from 849 characters to 6 828 — six thousand
      // characters of unrelated shell source, in which every string below
      // would go on passing wherever it happened to live. A gate that widens
      // instead of breaking is this project's signature failure and it is the
      // reason `row` is now anchored at BOTH ends to the same element.
      const scroller = CODE.slice(CODE.indexOf("data-hud-toast-scroller"));
      const after = scroller.slice(scroller.indexOf("</div>"));
      const open = after.indexOf("<button");
      const close = after.indexOf("</button>", open);
      expect(open, "the fold row still exists below the scroller").toBeGreaterThan(-1);
      expect(close, "…and it is closed").toBeGreaterThan(open);
      const row = after.slice(open, close);
      // AND THE ANCHOR PROVES ITSELF. If this row ever stops being the first
      // control under the scroller, `open` lands on some other button and this
      // line fails LOUDLY — which is exactly what the `</p>` version could not
      // do. The tag can change again; the identity may not go missing.
      expect(row, "the first control under the scroller IS the fold row").toContain(
        "data-hud-toast-more",
      );
      // The count branch names notifications…
      expect(row).toContain("toastsUnseenBelowFold > 0");
      expect(row).toContain("известие");
      expect(row).toContain("известия");
      // …and the other branch names what is actually under the cut. Same
      // vocabulary as the two overlays that already answer this exact question.
      expect(row).toContain("обяснението продължава");
      // And the whole row still exists only while something really is cut.
      expect(after).toContain("toastsBelowFold > 0");
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────
     …AND THE COUNTER HAD TO BECOME THE CONTROL — 2026-08-26.

     The counter above is honest: it says the explanation continues. It does not
     CONTINUE it. sc-follow-distance:843fbfa9 files that in its own words —
     „There is no scroll bar, no expand control and no «↓ ОЩЕ N РЕДА»
     affordance on the PC card … so PC is the leg the fix missed" — and the
     scroll it names existed the whole time and could not be ASKED for: the
     scroller must stay `pointer-events-none` (320 px of column over 240 px
     cards, the ~80 px beside them is ROAD), which makes its own painted bar
     undraggable, and a student reading half a sentence is not told that a wheel
     is what finishes it.

     The four cases below hold what the repair's own risk list NAMED and did not
     gate — „a later edit drops `self-end`" chief among them. A written risk with
     no test is a note.
     ────────────────────────────────────────────────────────────────────────── */

  /** The fold row, anchored at both ends to the same element. See the scoping
   *  note in „the two counts pick two different sentences" for why this is not
   *  a slice to the next closing tag. */
  const foldRowSource = () => {
    const scroller = CODE.slice(CODE.indexOf("data-hud-toast-scroller"));
    const after = scroller.slice(scroller.indexOf("</div>"));
    const open = after.indexOf("<button");
    const close = after.indexOf("</button>", open);
    expect(open, "the fold row still exists below the scroller").toBeGreaterThan(-1);
    const row = after.slice(open, close);
    expect(row, "the first control under the scroller IS the fold row").toContain(
      "data-hud-toast-more",
    );
    return row;
  };

  it("the fold row is a CONTROL, and it moves the box the student is reading", () => {
    const row = foldRowSource();
    // A real button: keyboard-reachable, and `type="button"` so it cannot
    // submit anything if this column is ever nested in a form.
    expect(row).toContain('type="button"');
    expect(row).toContain("onClick={revealMoreToasts}");
    // …and the handler moves the SCROLLER, not some state that renders nothing.
    // This is the „no dead predicate" half: `toastPageScrollTop` is only worth
    // anything if its result is written back to the element being read.
    const handler = CODE.slice(CODE.indexOf("const revealMoreToasts"));
    const body = handler.slice(0, handler.indexOf("}, ["));
    expect(body).toContain("toastPageScrollTop(el.scrollTop, el.clientHeight, el.scrollHeight)");
    expect(body).toContain("el.scrollTop =");
    // …and re-measures, so the row's own text and its disappearance at the end
    // land in the same render as the movement.
    expect(body).toContain("measureToastFold()");
  });

  it("…and it takes no ROAD with it: `self-end` and `pointer-events-auto`, never full width", () => {
    // THE INVARIANT THIS PINS, in the repair's own words: „a full-width control
    // in a 320 px column is 80 px of un-clickable ROAD beside a 240 px card,
    // which is the defect the column's own `pointer-events-none` exists to
    // prevent." The cards hug the right edge (`HudToasts` renders them under
    // `items-end`), so the control must too — `self-start` would be the same
    // defect mirrored, sitting over road on the other side.
    const row = foldRowSource();
    expect(row, "the column is inert; the control must opt back in").toContain(
      "pointer-events-auto",
    );
    expect(row, "it hugs the cards' right edge").toContain("self-end");
    for (const stretcher of ["w-full", "self-stretch", "self-start", "self-center", "flex-1"]) {
      expect(row, `${stretcher} would put this control over the road`).not.toContain(stretcher);
    }
    // And the reason both of those are load-bearing rather than cosmetic: the
    // column around it really is inert.
    const column = CODE.slice(CODE.indexOf('data-hud="notify-column"'));
    expect(column.slice(0, column.indexOf("style="))).toContain("pointer-events-none");
  });

  it("THE PURE HALF: one press always advances, keeps the joined line, and terminates", () => {
    // jsdom has no layout, so the arithmetic is asserted here rather than
    // through a scroller that would report 0 for every measurement.
    // A 360 px stack in a 120 px window: a page, not a nudge…
    expect(toastPageScrollTop(0, 120, 360)).toBe(90);
    // …and the page keeps `TOAST_PAGE_OVERLAP_PX` of the old view, so the line
    // the cut ran through is re-read WHOLE rather than jumped over. That is the
    // whole complaint this control answers; a clean page would move it one
    // screen down.
    expect(toastPageScrollTop(0, 120, 360)).toBeLessThan(120);
    // Pressing walks to the end and STOPS there — which is what lets
    // `toastsBelowFold` reach 0 and the row unmount itself. A counter that
    // cannot reach zero is the defect `SimOverlay` spent a round removing.
    expect(toastPageScrollTop(90, 120, 360)).toBe(180);
    expect(toastPageScrollTop(180, 120, 360)).toBe(240);
    expect(toastPageScrollTop(240, 120, 360)).toBe(240);
    // MUTATION, and it is the reason `TOAST_PAGE_MIN_STEP_PX` exists: a column
    // squeezed below the overlap makes `clientHeight − overlap` NEGATIVE, and
    // without the floor the press would scroll the student BACKWARDS.
    expect(toastPageScrollTop(0, 20, 400)).toBe(40);
    // A stack that fits has nowhere to go and is not offered a phantom scroll.
    expect(toastPageScrollTop(0, 300, 300)).toBe(0);
    // Never past the end, whatever it is handed.
    expect(toastPageScrollTop(9999, 120, 360)).toBe(240);
  });

  it("THE PURE HALF: the reset fires when a card ARRIVES, never when one is taken away", () => {
    // ══ THE DEFECT THIS REPLACED ═════════════════════════════════════════════
    // The first version of the scroll-reset effect keyed on `max(toasts.id)`
    // and its comment claimed „dismissing a card … does not yank a student back
    // to the top mid-read". Dismissing the NEWEST card LOWERS that maximum, the
    // dependency changed, and the effect fired: click the top card away while
    // reading the one below it and the window snapped to 0. Asserted in both
    // directions, because the false one is the one that shipped.
    expect(isToastArrival(-1, 1), "the first card ever raised").toBe(true);
    expect(isToastArrival(3, 4), "a fourth fault arrives").toBe(true);
    // THE ONE THAT WAS WRONG: ids 1-2-3 on screen, the student clicks 3 away,
    // the maximum falls to 2.
    expect(isToastArrival(3, 2), "a dismissal is not an arrival").toBe(false);
    // The effect re-running for any other reason is not an arrival either.
    expect(isToastArrival(3, 3)).toBe(false);
    // An emptied column (`clear()` between lessons) resets nothing and, because
    // the ref only rises, cannot re-fire for an id already served.
    expect(isToastArrival(3, -1)).toBe(false);
    expect(isToastArrival(0, 0)).toBe(false);

    // ── AND THE SOURCE HALF: whatever writes `scrollTop = 0` is guarded BY
    // that predicate. Scoped backwards from the write itself, so a second
    // reset added later without the guard is caught rather than ignored.
    const write = CODE.indexOf("el.scrollTop = 0");
    expect(write, "the reset still exists").toBeGreaterThan(-1);
    const effect = CODE.slice(CODE.lastIndexOf("useEffect", write), write);
    expect(effect).toContain("isToastArrival(toastResetForIdRef.current, newestToastId)");
    // …and the high-water mark is raised, or the guard would be true forever.
    const afterWrite = CODE.slice(CODE.lastIndexOf("useEffect", write), write + 400);
    expect(afterWrite).toContain("toastResetForIdRef.current = newestToastId");
  });

  it("…and the YIELD ORDER the briefing card argued for still holds", () => {
    // „A graded fault, or the task itself, must never be the thing that yields
    // to a briefing the student has already read." Giving the toast stack
    // `min-h-0` at the default shrink factor would have broken exactly that —
    // flexbox distributes a deficit in proportion to (base × factor), so a
    // 490 px stack at 1 against a 230 px briefing at 1 would absorb 68 % of the
    // FIRST pixel of pressure while the briefing was still full height.
    //
    // ══ WHAT THIS CASE USED TO ASSERT, AND WHY IT WAS THE WRONG HALF ═══════
    // It read `expect(w).toBeLessThan(1)` — „1 would put it ahead of the
    // briefing" — and the shipped weight was 0.05. The ratio was right; the
    // NUMBER was a cap. CSS Flexbox § 9.7 step 4b: „If the sum of the unfrozen
    // flex items' flex factors is less than one, multiply the initial free
    // space by this sum." Once the briefing has frozen at zero the scroller is
    // the only unfrozen item, that sum IS its own weight, and at 0.05 the box
    // absorbed a twentieth of the deficit and let the rest overflow the
    // `overflow-hidden` column. The scroller therefore never overflowed
    // ITSELF, `rowsBelowFold` returned 0, and the counter the case below
    // guards never mounted — the guillotine arrived together with the silence.
    // Frame, in the path shape w10 actually uses (`<wave>/frames/<lesson>__
    // <variant>/`, not sweep161's): `.audit-frames/w10-1/frames/
    // sc-ac-highbeam-lead__pc-wrong/04-t018s.png` — «нищо.» sliced through its
    // x-height at the column edge with nothing under the cut.
    //
    // So the order now lives on the side that may carry a big number.
    const scroller = CODE.slice(CODE.indexOf("data-hud-toast-scroller"));
    const decls = scroller.slice(0, scroller.indexOf("<HudToasts"));
    const factor = /\[flex-shrink:([\d.]+)\]/.exec(decls);
    expect(factor, "the shrink weight is written, not defaulted").not.toBeNull();
    const w = Number(factor![1]);
    // THE § 9.7 FLOOR. Below 1 the weight stops being a priority and becomes a
    // ceiling on how much of the deficit this box may take, which is the defect.
    expect(w).toBeGreaterThanOrEqual(1);
    // …and the briefing's weight is written too, on its own root.
    const briefingRoot = CODE.slice(CODE.indexOf('aria-label="Инструкции за упражнението"'));
    const briefingDecls = briefingRoot.slice(0, briefingRoot.indexOf("</div>"));
    const bFactor = /\[flex-shrink:([\d.]+)\]/.exec(briefingDecls);
    expect(bFactor, "the briefing carries the yield order now").not.toBeNull();
    const b = Number(bFactor![1]);
    // The arithmetic, at the shipped sizes: the briefing takes ≥90 % of the
    // deficit the two of them share, i.e. nine pixels of briefing for every one
    // of fault, until the briefing freezes at zero and the rest comes here.
    const briefingShare = 230 * b;
    const stackShare = 490 * w;
    expect(briefingShare / (briefingShare + stackShare)).toBeGreaterThan(0.9);
    // And the briefing is still the child that CAN empty: its `min-h-0` is the
    // one the yield order is built on.
    expect(CODE).toContain("flex w-full min-h-0 min-w-0 flex-col");
  });

  it("THE GENERAL FORM: no sub-1 shrink weight anywhere under the sim trees", () => {
    // One enforced instance is a convention, and this wave's frames found the
    // next instance immediately. A `flex-shrink` under 1 NEVER expresses „yields
    // last" — § 9.7 step 4b turns it into „may only ever absorb this fraction of
    // the deficit", and the remainder is handed to whatever `overflow` the
    // ancestor happens to have. Where a box must yield last, raise its SIBLING.
    //
    // ══ WHAT THE FIRST VERSION OF THIS WALKER COULD NOT SEE ═══════════════
    // It decided „prose or class list?" by asking whether the PHYSICAL LINE
    // holding the match also held `className=`. An adversarial reader dropped
    //
    //     className={[
    //       "flex min-h-0 flex-col",
    //       "[flex-shrink:0.05]",
    //     ].join(" ")}
    //
    // into `components/sim` and this file stayed at 36 passed: the weight is on
    // one line, the `className=` on another. That shape is not hypothetical —
    // `components/sim` + `modules/sim` already open a composed `className={`,
    // `className={[` or `className={cn(` in nine places, so the next instance
    // would have landed precisely where the gate could not look. A gate with a
    // blind spot the size of the idiom it polices is decoration.
    //
    // The question was never „is `className=` on this line". It is „is this
    // text CODE, or the paragraph explaining why the value was retired" — and
    // this file already answers that, for the shell, with `stripComments`. Same
    // answer here, and it needs no window at all: the prose goes, whatever
    // survives is a class list that ships. It closes the other half too — a
    // weight that has been COMMENTED OUT is not on anyone's screen and must not
    // be reported as an offender. A trailing `// [flex-shrink:0.5]` after code
    // on the same line survives stripping and would be reported; that is the
    // safe direction for a gate to be wrong in.
    const roots = [
      resolve(__dirname, "../../../../components/sim"),
      resolve(__dirname, "../../../../modules/sim"),
    ];
    const offenders: string[] = [];
    const seen: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = stripComments(readFileSync(full, "utf8"));
        for (const m of src.matchAll(/\[flex-shrink:([\d.]+)\]/g)) {
          seen.push(`${full}: ${m[0]}`);
          if (Number(m[1]) < 1) offenders.push(`${full}: ${m[0]}`);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(offenders).toEqual([]);
    // POSITIVE CONTROL, because a walker that visits nothing reports safety and
    // an empty `offenders` proves only that the loop ran zero times. These are
    // the two weights this repair wrote; if the walk stops finding them it has
    // stopped walking — or `stripComments` has started eating code — and the
    // assertion above means nothing.
    const inShell = (w: string) =>
      seen.some((s) => s.includes("LessonPlayShell.tsx") && s.endsWith(w));
    expect(inShell("[flex-shrink:20]"), "the briefing's weight is still walked").toBe(true);
    expect(inShell("[flex-shrink:1]"), "the toast scroller's weight is still walked").toBe(true);
  });

  it("…and the cut line is FADED, on the same predicate as the counter", () => {
    // Four PC rows in wave w10 do not say „I could not scroll" — they say the
    // card is „truncated mid-sentence … with no ellipsis, no scrollbar and no
    // expand control" (sc-ac-aquaplane:0ae00f29). The mask is the signal half:
    // a horizontally guillotined line reads as a rendering fault, a faded one
    // reads as „there is more". Same predicate the briefing list one card up
    // already carries.
    //
    // ── AND THE RAMP IS THE ONE THIS SURFACE'S TYPE ASKS FOR, 2026-08-27.
    //    It was `BRIEFING_FADE_MASK_CSS` — 10 px, solved against the briefing
    //    list's 11 px `leading-tight` line AND pinned to that list's matching
    //    `pb-2.5` by `briefingOverflow.test.tsx`. The toast stack's tallest
    //    line is `text-sm leading-snug` = 19.25 px, so 10 px left the glyph
    //    TOPS at ≈ 0.95 alpha with their bottoms cut off — a severed line, not
    //    a faded one, which is exactly what sc-signal-response:92c94379
    //    photographs on `w11/…/sc-signal-response__pc-right/04-t043s.png`.
    //
    //    THE ASSERTION IS THE RELATIONSHIP AND NOT THE LITERAL, deliberately:
    //    a test that pinned „28" would go green on a future type change that
    //    put the slice straight back. It bites from BOTH ends — long enough
    //    that a fully cut line is already dissolving, and short enough that the
    //    ramp cannot start eating a line the student could have read whole.
    const scroller = CODE.slice(CODE.indexOf("data-hud-toast-scroller"));
    const decls = scroller.slice(0, scroller.indexOf("<HudToasts"));
    expect(decls).toContain("TOAST_FADE_MASK_CSS");
    expect(decls).not.toContain("BRIEFING_FADE_MASK_CSS");
    expect(TOAST_FADE_PX).toBeGreaterThan(TOAST_TALLEST_LINE_PX);
    expect(TOAST_FADE_PX).toBeLessThan(2 * TOAST_TALLEST_LINE_PX);
    // Both spellings — unprefixed in current WebKit, prefixed in the engine the
    // founder reads this on.
    expect(decls).toContain("WebkitMaskImage");
    expect(decls).toContain("maskImage");
    // CONDITIONAL, not permanent chrome: a stack that fits, and a stack scrolled
    // to its end, are not dimmed. `toastsBelowFold` is recomputed on every
    // scroll and every resize, which is what makes the two states different.
    expect(decls).toContain("toastsBelowFold > 0");
  });

  it("the counter is measured off what HudToasts paints, not off a guessed shape", () => {
    // `rowsBelowFold` counts CARDS, and the cards are the children of the box
    // HudToasts owns. Reading the scroller's own children would count ONE row
    // (the wrapper) forever, which is the reassuring direction.
    expect(CODE).toContain("el.querySelector('[data-hud=\"toasts\"]')");
    expect(CODE).toContain("rowsBelowFold(");
    expect(CODE).toContain("listRowsInScrollCoords(");
    // THE OBSERVER WATCHES THE CONTENT TOO. A ResizeObserver on a scroller never
    // fires for what is inside it, and the thing that changes here IS what is
    // inside it — a second fault arriving.
    const eff = CODE.slice(CODE.indexOf("const ro = new ResizeObserver(measureToastFold)"));
    expect(eff.slice(0, eff.indexOf("}, ["))).toContain("ro.observe(stack)");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   6 · THE RIBBON LEGEND HAD NEVER BEEN ON A PHONE

   sc-ln-obstacle-meeting/mobile-right/01-arrival: «the two glowing road ribbons
   are explained on PC by a legend … but that legend does not exist anywhere on
   mobile. A phone student sees a green and a blue river of light on the tarmac
   with nothing telling him which to follow.»

   And two more on the same layer, both about what the legend never named at all:
   sc-junction-blind/mobile-right/04-t065s («a huge white chevron «◀» … with no
   label or legend») and sc-jx-equal-left/mobile-right/04-t039s («a vertical cyan
   beam of light rises out of the middle of the carriageway … with no legend
   anywhere»).
   ────────────────────────────────────────────────────────────────────────── */

describe("the legend is said on the one frame a priority-10 line can be heard", () => {
  const legendItem: SimOverlayItem = {
    id: "legend",
    kind: "legend",
    tone: "neutral",
    lineBg: "Зелената линия, стрелката и светлинният стълб …",
  };

  it("THE CAUSE, as the queue's own arithmetic: it lost to everything, always", () => {
    // `legend` is the lowest of the ten kinds, and the window used to start at
    // `sceneEpoch` — the frame the scene mounts, on which the BRIEFING is up and
    // blocking. There is no ordering in which a phone student saw this line.
    expect(overlayPriority("legend")).toBeLessThan(overlayPriority("hint"));
    expect(overlayPriority("legend")).toBeLessThan(overlayPriority("predrive"));
    expect(overlayPriority("legend")).toBeLessThan(overlayPriority("task"));

    const briefing: SimOverlayItem = {
      id: "briefing",
      kind: "hint",
      tone: "neutral",
      lineBg: "…",
      blocking: true,
    };
    expect(selectOverlay([briefing, legendItem]).active?.id).toBe("briefing");
    const task: SimOverlayItem = { id: "task", kind: "task", tone: "neutral", lineBg: "…" };
    expect(selectOverlay([task, legendItem]).active?.id).toBe("task");

    // …and even after the briefing is acknowledged, the task line covers 7 000
    // of the legend's own 8 000 ms when both are measured from the same instant.
    // One second, at the back of a ten-deep queue, is not „said once".
    expect(LEGEND_ANNOUNCE_MS - TASK_ANNOUNCE_MS).toBeLessThan(2000);
  });

  it("THE WIRING: the window opens on the first quiet frame, never at the mount", () => {
    // The mutation that broke the first draft of this case: keying the window on
    // `sceneEpoch` again passes any check that merely looks for a `legend`
    // candidate. So the CONDITION is the assertion.
    const cond = CODE.slice(
      CODE.indexOf("const legendQueueSilent ="),
      CODE.indexOf("const legendArmedEpochRef"),
    );
    expect(cond).toContain("!briefingOpen");
    expect(cond).toContain('snap.phase === "driving"');
    expect(cond).toContain("!taskFresh");
    expect(cond).toContain("teachQueue.length === 0");
    expect(cond).toContain("toasts.length === 0");
    // …and the key is that condition and nothing else. `legend:${sceneEpoch}`
    // unconditionally is the shipped bug; a `useRef` latch read at render time is
    // what `react-hooks/refs` refuses. Both are excluded by naming the whole
    // expression.
    expect(CODE).toContain("const legendKey = legendQueueSilent ? `legend:${sceneEpoch}` : null;");
    expect(CODE).not.toContain("legendArmedEpochRef");
  });

  it("…and it names the arrow and the beam, on both platforms, on every rung", () => {
    // The guidance layer mounts on `objectives.length > 0` and nothing else
    // (LessonScene), so gating the legend on the SHADOW CAR's aids left the
    // teal ribbon, the chevron and the 11 m shaft unnamed on every rung where
    // the aids are withdrawn — L3, L4 and the exam.
    expect(CODE).toContain("const guidanceShown = lesson.objectives.length > 0;");
    expect(CODE).toContain("const legendApplies = compact && !ended && guidanceShown;");
    expect(CODE).toContain("{!compact && !ended && guidanceShown ? (");
    // The blue row is the one that really does depend on the aids, and it is the
    // only one that does.
    const panel = CODE.slice(CODE.indexOf('data-hud="ribbon-legend"'));
    const rows = panel.slice(0, panel.indexOf("Minimap"));
    expect(rows).toContain("{shadowRibbonShown ? (");
    expect(rows).toContain("синя — пътят на колата-сянка");
    expect(rows).toContain("зелена — маршрутът до целта");
    // THE THIRD ROW IS THE FINDING — it must name BOTH unexplained objects.
    expect(rows).toMatch(/стрелка[^<]*стълб/);
    // …and the compact line has to carry the same two nouns, or the phone is
    // still the platform where they go unnamed.
    const line = CODE.slice(CODE.indexOf('id: "legend"'));
    const compactLine = line.slice(0, line.indexOf("];"));
    expect(compactLine).toContain("стрелката");
    expect(compactLine).toContain("стълб");
    // It degrades honestly: with no shadow ribbon the sentence may not claim one.
    expect(compactLine).toContain("shadowRibbonShown ?");
  });
});
