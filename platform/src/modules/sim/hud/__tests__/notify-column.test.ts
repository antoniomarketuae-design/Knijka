import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deckCompactOpenWidthPx,
  deckTouchRowMinWidthPx,
  notifyColumnLeftFraction,
  notifyColumnWidthPx,
  rectIsInNotifyColumn,
  DECK_COMPACT_COLUMN_RESERVE_PX,
  DECK_ROOMY_CAPTION_HEIGHT_PX,
  DECK_ROOMY_OPEN_HEIGHT_PX,
  DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX,
  DECK_TOUCH_CAPTION_HEIGHT_PX,
  DECK_TOUCH_CAPTION_ROAD_MAX_PX,
  DECK_TOUCH_TRANSPORT_ROW_PX,
  DECK_TOUCH_CAPTION_MAX_VAR,
  DECK_TOUCH_CAPTION_VAR,
  DECK_TOUCH_TARGET_PX,
  NOTIFY_COLUMN_GUTTER_PX,
  NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX,
  NOTIFY_COLUMN_MIN_LEFT_FRACTION,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
} from "../notifyColumn";
import { hudCardMaxWidthPx, TOAST_CARD_WIDTH_PX } from "../hudPreferences";
import {
  MINIMAP_TOGGLE_SIZE_PX,
  ROOMY_MINIMAP_LANE_PX,
} from "../../../../components/sim/lesson-ui/immersive";

/**
 * =============================================================================
 * „MOVE EVERY TEXT PANEL OFF THE MIDDLE OF THE ROAD, TO THE RIGHT EDGE."
 *
 * Third asking, 2026-08-03. The attempt before this one made the panels
 * TRANSPARENT and reported the chrome budget improving from 70 % to 85 %; the
 * founder's view stayed blocked because nothing MOVED. So the assertions here
 * are about POSITION and nothing else — a coverage percentage cannot pass this
 * file.
 * =============================================================================
 */

/** The devices this product is judged on (tools/mobile/lib/devices.mjs) plus a
 *  laptop and the desktop the harness renders at. */
const LADDER = [320, 360, 375, 390, 393, 430, 448, 640, 852, 1024, 1280, 1920];

describe("the column is at the right edge on every device in the ladder", () => {
  it("never lets its left edge come left of 60 % of the width", () => {
    const bad: string[] = [];
    for (const w of LADDER) {
      for (const compact of [true, false]) {
        const f = notifyColumnLeftFraction(w, compact);
        if (f < NOTIFY_COLUMN_MIN_LEFT_FRACTION) {
          bad.push(`${w}px ${compact ? "compact" : "roomy"} → left at ${f.toFixed(3)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("the founder's own phone, both orientations, in numbers", () => {
    // 393 portrait: 36 vw = 141.5 px, so the column starts at x = 239.5 (0.61).
    expect(notifyColumnWidthPx(393, true)).toBeCloseTo(141.48, 1);
    expect(notifyColumnLeftFraction(393, true)).toBeCloseTo(0.61, 2);
    // 852 landscape: the 15 rem cap bites, so it starts at x = 600 (0.70).
    expect(notifyColumnWidthPx(852, true)).toBe(NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX);
    expect(notifyColumnLeftFraction(852, true)).toBeCloseTo(0.704, 2);
  });

  it("never asks for more width than the phone it is on", () => {
    for (const w of LADDER) {
      expect(notifyColumnWidthPx(w, true)).toBeLessThanOrEqual(hudCardMaxWidthPx(w));
    }
  });

  it("is exactly the toast card's width once the cap bites, so nothing reflows", () => {
    expect(NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX).toBe(TOAST_CARD_WIDTH_PX);
  });

  it("degrades to a safe answer on a nonsense viewport", () => {
    expect(notifyColumnWidthPx(0, true)).toBe(0);
    expect(notifyColumnWidthPx(Number.NaN, false)).toBe(0);
    expect(notifyColumnLeftFraction(0, true)).toBe(1);
  });
});

describe("the acceptance predicate has teeth", () => {
  // THE MEASUREMENT THE RENDERED FRAME IS JUDGED BY. Both examples are real:
  // the first is the objective stack as it shipped this morning (measured at
  // 1280×800: x = 353.1, w = 573.7), the second is where it lands after.
  it("rejects the centred banner that was on the road, accepts the moved one", () => {
    expect(rectIsInNotifyColumn({ x: 353.1, width: 573.7 }, 1280)).toBe(false);
    expect(rectIsInNotifyColumn({ x: 948, width: 320 }, 1280)).toBe(true);
  });

  it("rejects a card that is at the right edge but reaches back past the middle", () => {
    // A full-width strip anchored right is the top-rail shape being replaced.
    expect(rectIsInNotifyColumn({ x: 58, width: 323 }, 393)).toBe(false);
  });

  it("rejects a card that is narrow but floating, not at the edge", () => {
    expect(rectIsInNotifyColumn({ x: 800, width: 200 }, 1280)).toBe(false);
  });

  it("accepts the compact column on the founder's portrait phone", () => {
    expect(rectIsInNotifyColumn({ x: 239.5, width: 141.5 }, 393)).toBe(true);
  });
});

describe("the shipped CSS is generated from the same constants", () => {
  it("expresses both widths as a self-limiting min()", () => {
    expect(NOTIFY_COLUMN_WIDTH_CSS_ROOMY).toBe("min(20rem, 30vw)");
    expect(NOTIFY_COLUMN_WIDTH_CSS_COMPACT).toBe("min(15rem, 36vw)");
  });

  it("keeps the right inset safe-area aware — viewport-fit=cover ships", () => {
    expect(NOTIFY_COLUMN_RIGHT_CSS).toContain("env(safe-area-inset-right");
    expect(NOTIFY_COLUMN_RIGHT_CSS).toContain(`${NOTIFY_COLUMN_GUTTER_PX / 16}rem`);
  });

  /**
   * A stylesheet in a template literal can rot into a no-op without a single
   * type error (`unpanel.test.ts` says so in its own header, for the same
   * reason). These are the three surfaces that are moved by the CASCADE rather
   * than by their own component — the scene owns their files — so if the rule
   * text stops naming them, nothing anywhere else goes red.
   */
  it("PlayAreaStyles still moves the scene-owned panels into the column", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
      "utf8",
    );
    for (const surface of ['[data-hud="demo-deck"]', '[data-hud="audio-prompt"]']) {
      const rule = new RegExp(
        `${surface.replace(/[[\]"=]/g, (c) => `\\${c}`)}[^}]*\\{[^}]*NOTIFY_COLUMN_RIGHT_CSS`,
      );
      expect(css, `${surface} is no longer pulled to the right column`).toMatch(rule);
    }
  });

  it("the play shell and the overlay both read the column from this module", () => {
    const shell = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    const overlay = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");
    expect(shell).toContain("NOTIFY_COLUMN_WIDTH_CSS_ROOMY");
    expect(shell).toContain('data-hud="notify-column"');
    expect(overlay).toContain("NOTIFY_COLUMN_WIDTH_CSS_COMPACT");
    // …and the shape it replaces is gone, not merely unused.
    expect(shell).not.toMatch(/left-1\/2 top-3 flex/);
  });
});

/**
 * =============================================================================
 * THE DEMONSTRATION DECK WHEN IT IS OPEN, ON A PHONE — 2026-08-10.
 *
 * The regression these close was ours. Raising the deck's floor to the whole
 * control band (row C1, and the six overlaps it closed are real) is right for
 * the 26.5 px collapsed pill and impossible for the 231.5 px open panel: on a
 * 393 px landscape stage the panel laid out at y = −96 with its own toggle off
 * the top of the screen, so on all four device profiles the deck could be
 * opened and then not closed. Measured, WebKit, real insets, sc-zebra-approach
 * @L1, all four states (landing/driving × deck closed/open):
 *
 *                       BEFORE ov/occ/<44/off-stage   AFTER
 *   393 × 852  +deck      2 / 1 / 13 / 0              0 / 0 / 0 / 0
 *   852 × 393  +deck      2 / 7 / 13 / 6              0 / 0 / 0 / 0
 *   360 × 780  +deck      2 / 1 / 13 / 1              0 / 0 / 0 / 0
 *   780 × 360  +deck      2 / 1 /  7 / 0              0 / 0 / 0 / 0
 *
 * The assertions below are the arithmetic behind that, so „it fits" cannot be
 * re-broken by a number changed somewhere else.
 * =============================================================================
 */
describe("the open deck fits the phone it is opened on", () => {
  /** id, stage w/h, safe-area left/right — tools/mobile/lib/devices.mjs. */
  const PHONES = [
    { id: "852x393", w: 852, h: 393, left: 59, right: 59, landscape: true },
    { id: "780x360", w: 780, h: 360, left: 0, right: 0, landscape: true },
    { id: "393x852", w: 393, h: 852, left: 0, right: 0, landscape: false },
    { id: "360x780", w: 360, h: 780, left: 0, right: 0, landscape: false },
  ];

  it("gives the landscape transport one line, on both landscape phones", () => {
    // 14 px of panel + 6 × 44 of controls + a 96 px scrub bar + 6 × 4 of gaps.
    expect(deckTouchRowMinWidthPx()).toBe(398);
    const tight: string[] = [];
    for (const p of PHONES.filter((d) => d.landscape)) {
      const width = deckCompactOpenWidthPx(p.w, { left: p.left, right: p.right });
      if (width < deckTouchRowMinWidthPx()) tight.push(`${p.id} → ${width} px`);
    }
    expect(tight).toEqual([]);
    // …and the two numbers themselves, because „it fits" with 1 px to spare and
    // „it fits" with 56 are different claims.
    expect(deckCompactOpenWidthPx(852, { left: 59, right: 59 })).toBe(410);
    expect(deckCompactOpenWidthPx(780)).toBe(456);
  });

  it("leaves the notification column its worst measured card in portrait", () => {
    // The deck's ceiling is `100% − band − column top − this reserve`, and the
    // reserve has to cover the tallest card ever measured in that column
    // (106.3 px, the two-chip „ЗАЩО" peek). A column starved below its card
    // printed „ЗАЩО" and no sentence — the THEO-4 failure of 2026-08-09.
    expect(DECK_COMPACT_COLUMN_RESERVE_PX).toBeGreaterThanOrEqual(106.3);
  });

  it("sizes the teach card in WHOLE lines of its own leading", () => {
    // 14 px of padding + border, then 1 rem lines. A box that ends mid-glyph
    // reads as broken rather than as scrollable — photographed at 393 × 852.
    const CHROME = 14;
    const LINE = 16;
    expect((DECK_TOUCH_CAPTION_HEIGHT_PX - CHROME) % LINE).toBe(0);
    expect((DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX - CHROME) % LINE).toBe(0);
    // The portrait column is narrower, so it needs more lines, not fewer.
    expect(DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX).toBeGreaterThan(DECK_TOUCH_CAPTION_HEIGHT_PX);
    // …and the ROOMY card, whose own leading is 20 px on 18 px of chrome.
    expect((DECK_ROOMY_CAPTION_HEIGHT_PX - 18) % 20).toBe(0);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * THE CAPTION HAS TO FIT THE CORPUS, NOT THE PILOT TRACE — 2026-08-11.
   *
   * FOUNDER, portrait phone: «Спри НАПЪЛНО … броим до три» rendered without
   * „броим до три". Measured in the real box: 94 px of caption in a 78 px box,
   * one 16 px line, and the lost line was the one that says HOW LONG to stand
   * still at a Б2. Across the whole trace bank (1 811 distinct captions, 503
   * traces) the 78 px box clamped 89 % on an iPhone 16 and 95 % on the 360.
   *
   * The numbers below are the FIX's arithmetic. The real check is
   * `tools/mobile/deck-captions.mjs`, which lays all 1 811 out in the real box
   * in WebKit — a character budget here would be exactly the „measures
   * something weaker than the requirement it is named for" trap. What THIS
   * file can hold is that the geometry the tool measured is still the geometry
   * the stylesheet ships.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  describe("the demonstration caption fits the trace bank, not one trace", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
      "utf8",
    );
    const openRule = css.slice(
      css.indexOf('[data-sim-compact="on"] [data-hud="demo-deck"][data-deck-open="true"] {'),
    );
    const portraitRule = openRule.slice(0, openRule.indexOf("@media (max-height: 560px)"));
    const landscapeRule = openRule.slice(
      openRule.indexOf("@media (max-height: 560px)"),
      openRule.indexOf("/* …and the column stops short"),
    );

    it("PORTRAIT grows the card to its content under a ceiling", () => {
      // `height: auto` is the whole fix, and it is only safe because the
      // portrait deck is bottom-anchored with its toggle in the transport row:
      // the card grows UPWARD into empty stage and no control moves.
      expect(portraitRule).toContain("${DECK_TOUCH_CAPTION_VAR}: auto;");
      expect(portraitRule).toContain(
        "${DECK_TOUCH_CAPTION_MAX_VAR}: ${DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX / 16}rem;",
      );
      // …and the ceiling is what the envelope leaves after a TWO-row transport
      // (the stage is 369 px on an iPhone 16 against the 398 one row needs).
      const envelope = 284; // measured, 393 × 852, deck open
      const twoRowTransport = 14 + 44 + 4 + 44;
      expect(DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX).toBe(envelope - twoRowTransport - 4);
    });

    it("PORTRAIT leaves the 36 % notification lane the collapsed pill lives in", () => {
      // The open panel is not a notification. Census at 393 × 852 with the deck
      // open: nothing paints left of x 239.5 between y 186 and the control band
      // at y 470. Worth 141.5 → 369 px of caption width.
      expect(portraitRule).toContain("left: ${DECK_COMPACT_OPEN_PORTRAIT_LEFT_CSS};");
      expect(portraitRule).toContain("right: ${NOTIFY_COLUMN_RIGHT_CSS};");
      expect(portraitRule).toContain("width: auto;");
      // The COLLAPSED pill keeps that lane — the rule above this one is
      // untouched and still hands the deck the compact column width.
      expect(css).toContain("width: ${NOTIFY_COLUMN_WIDTH_CSS_COMPACT};");
    });

    it("LANDSCAPE takes the caption OUT of the corridor and hangs it over the road", () => {
      // ── WHY THE ONE-LINE BOX IS GONE — 2026-08-12, J-WAVE-4. ──────────────
      // The rule this replaces was right about the rail (the deck did have to
      // take the lane below it: 20 064 px² of surface and nine overlapping
      // control pairs on the Samsung) and wrong about what the 52 px cost. It
      // predicted „iPhone 16 46 → 31 px … on the gesture-bar Samsung it
      // collapses", i.e. a loss confined to the shortest phone. Measured the
      // next day in WebKit on a PRODUCTION build, on the real /simulator
      // route, real insets, deck open, caption live:
      //
      //   iPhone 16 landscape  box 410 ×  13.5   1811 / 1811 captions cut
      //   780 × 360 Android    box 456 ×   2.0   smaller than an EMPTY card
      //   Samsung gesture bar  box 456 × −22.0   the 58 px transport row does
      //                                          not fit its own 40 px deck
      //
      // 100 % of the demonstration's authored teaching text, on every sideways
      // phone including the founder's, with the citations in it. So the
      // caption stops competing for a corridor that cannot hold it.
      expect(landscapeRule).toContain("${DECK_TOUCH_CAPTION_VAR}: auto;");
      expect(landscapeRule).toContain(
        "${DECK_TOUCH_CAPTION_MAX_VAR}: ${DECK_TOUCH_CAPTION_ROAD_MAX_PX / 16}rem;",
      );
      expect(landscapeRule).toContain("left: ${DECK_COMPACT_OPEN_LEFT_CSS};");
      expect(landscapeRule).toContain("width: ${DECK_COMPACT_OPEN_WIDTH_CSS};");
      // …and the rail's lane is still taken out of the anchor, from the rail's
      // own exported constant rather than a copy of 52.
      expect(landscapeRule).toContain("TOP_RAIL_ROW_CSS");

      // THE DECK IS ITS TRANSPORT ROW, EXACTLY. With the caption out of flow
      // that row is the only child, so the honest bound is the row — and it is
      // the bound that fixes the Samsung, where a 40 px cap had been clipping a
      // 58 px shrink-0 row and driving the caption's ceiling negative.
      expect(landscapeRule).toContain("max-height: ${DECK_TOUCH_TRANSPORT_ROW_PX / 16}rem;");
      expect(DECK_TOUCH_TRANSPORT_ROW_PX).toBe(DECK_TOUCH_TARGET_PX + 12 + 2);

      // THE ROAD LANE. Positioned below the deck, left edge clearing the
      // steering arc, right edge the deck's own — and `width: auto`, because
      // TraceTimeline gives the box Tailwind's `w-full` and width:100% beats a
      // left/right pair (the box would start at x 275 and hang off the screen).
      expect(landscapeRule).toContain('[data-hud="deck-caption"] {');
      expect(landscapeRule).toContain("position: absolute;");
      expect(landscapeRule).toContain("top: calc(100% + 0.5rem);");
      // …and the lane's left edge comes from TouchControls' own constant, which
      // is written in `vw` rather than `%` because a percentage here resolves
      // against the DECK: the first attempt landed the caption at x 239 against
      // an arc reaching x 267, i.e. prose over «Волан».
      expect(landscapeRule).toContain("left: ${STEER_PAD_DECK_CLEARANCE_CSS};");
      expect(landscapeRule).toContain("width: auto;");
      // Prose over the road may never answer for a control beneath it.
      expect(landscapeRule).toContain("pointer-events: none;");
      // …and it paints no rectangle: glyphs and a shadow, the treatment the
      // first-run hint already uses. The border keeps its place in the box
      // model (transparent) so the card's 14 px of chrome is still true.
      expect(landscapeRule).toContain("background: none;");
      expect(landscapeRule).toContain("border-color: transparent;");
      expect(landscapeRule).toContain("backdrop-filter: none;");
      expect(landscapeRule).toContain("text-shadow:");

      // The ceiling is WHOLE LINES of the card's own leading inside the
      // smallest measured clear run (186 px on the Samsung: deck ends y 118,
      // dash dock starts y 312, right of an arc that reaches x 208).
      expect((DECK_TOUCH_CAPTION_ROAD_MAX_PX - 14) % 16).toBe(0);
      expect(DECK_TOUCH_CAPTION_ROAD_MAX_PX).toBeLessThanOrEqual(186);
      // Both custom-property names are the ones the component reads — the
      // assertions above quote them as text, so pin the symbols too or a rename
      // would leave two files agreeing about a property nothing publishes.
      expect(DECK_TOUCH_CAPTION_MAX_VAR).toBe("--deck-caption-max-h");
    });

    it("ROOMY is sized by the TALLEST caption in the bank, not by what was free", () => {
      // 135 at rest + 6 gap + the box; the deck's own cap is that same number,
      // and the keyboard legend reserves against it. 58 clamped 628 captions,
      // 78 clamped 78 — both were budgets set by the space rather than by the
      // corpus. The worst caption overflowed the 78 px box by exactly 60 px on
      // a production WebKit run, so 138 is the measured tallest and the sweep
      // reports 0 / 1811 there.
      expect(DECK_ROOMY_CAPTION_HEIGHT_PX).toBe(138);
      expect(DECK_ROOMY_OPEN_HEIGHT_PX).toBe(279);
      const measuredPanel = 104.5; // WebKit, 1264 × 619, transport on one line
      expect(DECK_ROOMY_CAPTION_HEIGHT_PX + 6 + measuredPanel).toBeLessThanOrEqual(
        DECK_ROOMY_OPEN_HEIGHT_PX,
      );
      // The 60 px comes out of the keyboard legend's cap, and that cap must
      // stay a usable panel on the window the sweep measures (1264 × 619):
      //   619 − ROOMY_HUD_FLOOR 108 − deck − ribbon lane 47 − gutter 8 − 12
      const legendCap = 619 - 108 - DECK_ROOMY_OPEN_HEIGHT_PX - 47 - 8 - 12;
      expect(legendCap).toBeGreaterThan(120);
    });
  });

  it("keeps the transport at the thumb minimum — row C6's number, not a taste", () => {
    expect(DECK_TOUCH_TARGET_PX).toBe(44);
    const timeline = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/TraceTimeline.tsx"),
      "utf8",
    );
    // Every size the touch branch chooses is h-11/w-11 or larger. The shapes
    // that shipped to a thumb before this row — h-8 w-8 buttons, h-6 speed
    // pills, w-5 ticks — survive only on the `compact` (mouse) side of the
    // ternary, and `touch` is written first so it wins.
    expect(timeline).toContain('touch ? "h-11 w-11 text-base" : compact ? "h-8 w-8 text-sm"');
    expect(timeline).toContain('touch ? "h-11" : compact ? "h-7" : "h-11"');
    // …and the annotation ticks are no longer buttons under a thumb AT ALL.
    //
    // 2026-08-10: this used to pin the ternary `annotations.map((a, i) => touch
    // ? <span> : <button>`, which stopped existing when the DESKTOP half of the
    // same defect was closed — the two branches were merged so that both decks
    // draw their marks from ONE list and only the mouse deck adds hit slots on
    // top. The claim being made here is unchanged and is now checked where it
    // actually lives: the slots are rendered only when `touch` is false.
    expect(timeline).toMatch(/\{touch\s*\?\s*null\s*:\s*ticks\.map\(/);
    expect(timeline).toContain("aria-label={\n                  annotations[tick.lastIndex]?.textBg");
  });

  it("PlayAreaStyles still gives the OPEN deck its own geometry", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
      "utf8",
    );
    // A stylesheet in a template literal rots without a type error, and this
    // one is the whole fix: the open deck is top-anchored on a short stage.
    expect(css).toContain('[data-hud="demo-deck"][data-deck-open="true"]');
    expect(css).toContain("DECK_COMPACT_OPEN_LEFT_CSS");
    expect(css).toContain("DECK_COMPACT_OPEN_WIDTH_CSS");
    expect(css).toContain("DECK_COMPACT_COLUMN_RESERVE_PX");
    // The caption box's height is published as a custom property so ONE place
    // asks the „short stage" question; the component reads it with the same
    // name, which is why the name is a constant and not a literal.
    expect(css).toContain("DECK_TOUCH_CAPTION_VAR");
    expect(
      readFileSync(
        resolve(__dirname, "../../../../components/sim/lesson-ui/TraceTimeline.tsx"),
        "utf8",
      ),
    ).toContain(`var(${"${DECK_TOUCH_CAPTION_VAR}"}`);
    expect(DECK_TOUCH_CAPTION_VAR).toBe("--deck-caption-h");
    // The short-stage rule sets `bottom: auto` — without it the panel still
    // hangs from the control band and still goes off the top of the screen.
    // THE DECK'S short-stage block, found by what it is about rather than by
    // being the last one in the file. `lastIndexOf` was fine while there were
    // two of these media queries and silently pointed at somebody else's the
    // moment a third arrived — a test that reads a different rule and passes is
    // worse than no test.
    const openDeckShort = css.lastIndexOf(
      '[data-sim-compact="on"] [data-hud="demo-deck"][data-deck-open="true"]',
    );
    expect(openDeckShort).toBeGreaterThan(0);
    const shortStage = css.slice(
      css.lastIndexOf("@media (max-height: 560px)", openDeckShort),
      css.indexOf("@media", openDeckShort) > 0 ? css.indexOf("@media", openDeckShort) : undefined,
    );
    expect(shortStage).toContain("bottom: auto");
    // …from the column's top PLUS the top rail's row, since 2026-08-12: the
    // rail hangs from that same `NOTIFY_COLUMN_TOP_CSS_COMPACT` and this deck
    // used to start underneath it. The anchor is still that constant — it is
    // now offset by the rail's own exported lane rather than by a literal.
    expect(shortStage).toContain(
      "top: calc(${NOTIFY_COLUMN_TOP_CSS_COMPACT} + ${TOP_RAIL_ROW_CSS})",
    );
  });

  it("PlayAreaStyles leaves the map toggle's lane on a ROOMY deck, and not on a phone", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
      "utf8",
    );
    // MEASURED 2026-08-10, WebKit, 1264 × 619: the collapsed deck's pill over
    // the „🗺" toggle by 1 060 px², with `elementFromPoint` at the toggle's
    // centre answering the pill — and the same toggle dead under the open
    // deck's transport row. The deck yields the toggle's lane at its RIGHT
    // edge (sideways, so nothing moves vertically into the briefing card).
    const base = css.slice(
      css.indexOf('[data-hud="demo-deck"] {'),
      css.indexOf('[data-sim-compact="on"] [data-hud="demo-deck"] {'),
    );
    expect(base).toContain("ROOMY_MINIMAP_LANE_PX");
    expect(base).toContain(`right: calc(${"${NOTIFY_COLUMN_RIGHT_CSS}"} + `);
    expect(base).toContain(`width: calc(${"${NOTIFY_COLUMN_WIDTH_CSS_ROOMY}"} - `);
    // …AND THE PHONE MUST NOT INHERIT IT. That toggle is not rendered on a
    // compact layout at all, so the inset there would be 48 px of geometry
    // spent on nothing — and every phone number this file documents would move.
    const compactRule = css.slice(
      css.indexOf('[data-sim-compact="on"] [data-hud="demo-deck"] {'),
      css.indexOf("@media (max-height: 560px)"),
    );
    expect(compactRule).toContain("right: ${NOTIFY_COLUMN_RIGHT_CSS};");
    expect(compactRule).not.toContain("ROOMY_MINIMAP_LANE_PX");
    // The lane is the toggle's own size plus this HUD's gutter — one number,
    // read by the shell for the button and by the stylesheet for the clearance.
    expect(ROOMY_MINIMAP_LANE_PX).toBe(MINIMAP_TOGGLE_SIZE_PX + 8);
    const shell = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    expect(shell).toContain('data-hud="minimap-column"');
    expect(shell).toContain(
      "style={{ width: MINIMAP_TOGGLE_SIZE_PX, height: MINIMAP_TOGGLE_SIZE_PX }}",
    );
  });

  it("the scene marks the deck open, and hands the toggle to the row", () => {
    const scene = readFileSync(
      resolve(__dirname, "../../../../components/sim/LessonScene.tsx"),
      "utf8",
    );
    // `data-deck-open` is what the CSS above keys on; `leading` is what puts
    // the close control inside the transport row instead of on a 48 px line
    // the landscape corridor cannot pay for.
    expect(scene).toContain('data-deck-open={open ? "true" : "false"}');
    expect(scene).toContain("touch={compact}");
    expect(scene).toContain("leading={compact ? toggle : null}");
  });
});
