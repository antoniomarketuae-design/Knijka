import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  nextTier,
  tierCellLabelBg,
  tierCellTextBg,
  viewMenuShowsTopdownAids,
  viewMenuViewsBg,
} from "./TouchControls";

/**
 * =============================================================================
 * J-WAVE-2 · SURFACES — the two surfaces that cannot share a line, and the two
 * controls the founder said were missing.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT. The geometry was measured in a
 * browser on all six profiles (WebKit, real insets, `/dev/drive-rig`
 * sc-zebra-approach@L1) and the numbers are in the wave report. No unit test
 * can reproduce a phone. What a unit test CAN do is keep the three decisions
 * from being undone by an edit that looks harmless:
 *
 *   §1  the ⚙ sheet's open state is PUBLISHED, twice — once as the attribute
 *       the stylesheet arbitrates on and once as the value the scene needs in
 *       order to stop the demonstration. A hidden transport is still a running
 *       one, and `display: none` cannot pause a clock.
 *   §2  the camera menu offers the three VIEWS and, only inside top-down, the
 *       two aids that until this wave existed on a keyboard and nowhere else.
 *   §3  the three GRADED mirror glances are NOT in that menu. This is the one
 *       assertion here that is about pedagogy rather than layout: a scored A2
 *       step two taps behind a popover is a step the product is refusing while
 *       appearing to offer it.
 *
 * Source-reading assertions, the idiom `touchPadRelease.test.tsx` established
 * in the wave before this one: the mechanism is a prop chain across two files
 * and a stylesheet, and a prop chain that has only been reformatted has not
 * changed.
 * =============================================================================
 */

const norm = (rel: string) => readFileSync(join(__dirname, rel), "utf8").replace(/\r\n/g, "\n");
/** Comments stripped — this wave's prose quotes the very geometry it removed,
 *  so a naive substring search would find the bug in the story about the bug. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const flat = (src: string) => src.replace(/\s+/g, " ");

const TOUCH = norm("TouchControls.tsx");
const TOUCH_CODE = flat(strip(TOUCH));
const SCENE = norm("LessonScene.tsx");
const SCENE_CODE = flat(strip(SCENE));
const STYLES_CODE = flat(strip(norm("lesson-ui/PlayAreaStyles.tsx")));
const SHELL_CODE = flat(strip(norm("lesson-ui/LessonPlayShell.tsx")));
const OVERLAY_CODE = flat(strip(norm("../../modules/sim/hud/SimOverlay.tsx")));

describe("§1 · the ⚙ sheet and the demonstration deck are one surface", () => {
  it("publishes the sheet as an attribute the stylesheet can arbitrate on", () => {
    // The deck lives in a tree TouchControls cannot reach, so the hand-off is
    // an `html[data-sim-*]` attribute — the same grammar `data-sim-camera` and
    // `data-sim-glance` already use.
    expect(TOUCH_CODE).toContain("root.dataset.simCarSheet = \"open\"");
    expect(TOUCH_CODE).toContain("delete root.dataset.simCarSheet");
    expect(STYLES_CODE).toContain('html[data-sim-car-sheet="open"] [data-hud="demo-deck"]');
  });

  /* ── THE OTHER HALF OF `touchArc.test.ts`' NEW SWEEP — w37, 2026-09-12.
        That file proves the ARITHMETIC clears the steering flank; this one
        proves the stylesheet is still spending it. The two are separable and
        the separation is the whole failure: the collapsed pill's left was a
        literal `0.75rem` inside a `calc()` inside a template literal, so a
        resolver could be perfect while the CSS put the pill on the horn — which
        is exactly what w37's frames photographed. Interpolated now, from the
        constant the OPEN deck and the top rail already stand on. */
  it("the collapsed landscape deck is placed from the flank clearance, not from the stage edge", () => {
    const at = STYLES_CODE.indexOf('@media (max-height: 560px) { [data-sim-compact="on"] [data-hud="demo-deck"] {');
    expect(at, "the compact-landscape deck rule moved — re-anchor this test").toBeGreaterThan(-1);
    const rule = STYLES_CODE.slice(at, at + 220);
    expect(rule).toContain("left: ${DECK_COMPACT_OPEN_LEFT_CSS}");
    // The value it replaced, by name: 12 px from the stage edge is 48 px inside
    // `FLANK_LANE_PX`, and the notch cancels so it was every landscape profile.
    expect(rule).not.toContain("0.75rem + env(safe-area-inset-left");
  });


  it("takes the sheet's own inert state into account, not just its open flag", () => {
    // A teach card makes this overlay inert and the sheet's node is not
    // rendered at all. A `true` left published there would keep a
    // demonstration hidden behind a card that has nothing to do with it.
    const effect = TOUCH_CODE.slice(TOUCH_CODE.indexOf("root.dataset.simCarSheet"));
    expect(TOUCH_CODE).toContain("if (!sheetOpen || !visible)");
    expect(effect.length).toBeGreaterThan(0);
    expect(TOUCH_CODE).toContain("onSheetOpenChange?.(visible && sheetOpen)");
  });

  it("hands the same fact to the scene, because a hidden deck still runs", () => {
    // §1's whole point. `display: none` stops a panel being SEEN; the trace
    // clock goes on advancing behind it, and TraceTimeline seeds `playing:
    // true`, so a student who opened the car controls mid-demonstration came
    // back to a replay that had moved on without them.
    expect(SCENE_CODE).toContain("onSheetOpenChange={setTouchSheetOpen}");
    expect(SCENE_CODE).toContain("suppressed={touchSheetOpen}");
    // …and the pause itself: taken on the way in, and only GIVEN BACK if it
    // was taken — a demonstration the student had already paused stays paused.
    expect(SCENE_CODE).toContain("const wasPlaying = clock.playing");
    expect(SCENE_CODE).toContain("clock.playing = false");
    // The CAPTURED clock, not `clockRef.current` re-read at teardown: the clock
    // this effect paused is the one it must un-pause.
    //
    // AND IT MAY NOT RESURRECT A DEMONSTRATION THAT HAS STOOD DOWN — 2026-08-24.
    // The deck now stops itself the moment the student starts driving
    // (`demoDeckLifetime.demoDeckStandsDown`, the third use of the pattern
    // `touchHintStandsDown` and `controlsLegendStandsDown` already share). With
    // `wasPlaying` alone, a student who opened the ⚙ sheet, pulled away, and
    // closed it again would have the replay restarted BEHIND THEIR MOVING CAR:
    // `wasPlaying` was captured true before they set off. So the give-back is
    // guarded on the latch as well, and this pin says so.
    expect(SCENE_CODE).toContain(
      "if (wasPlaying && !stoodDownRef.current) clock.playing = true",
    );
  });

  it("does not close the deck — the way back must be the same frame", () => {
    // The prop must not reach `setOpen`, and the deck must not be unmounted on
    // it: the student's step, playhead and open state are what „get back to
    // where they were" means.
    const deck = SCENE_CODE.slice(
      SCENE_CODE.indexOf("function DemoDeck("),
      SCENE_CODE.indexOf("function RuntimeDriver("),
    );
    expect(deck.length).toBeGreaterThan(200);
    expect(deck).not.toMatch(/if \(suppressed\) return null/);
    expect(deck).not.toMatch(/suppressed[^;]{0,40}setOpen/);
  });
});

/**
 * ── §1b · THE SAME ARBITRATION, ONE SURFACE OVER — 2026-08-13, §I11 + §W2 ────
 *
 * The read mode (the expanded instruction panel) buried SEVEN controls on the
 * founder's phone held sideways. Six are TouchControls' and the pause answers
 * them — `paused` → `physicsPaused` → `hidden`, which makes them inert, and a
 * control nobody can see is not a buried control (the previous commit's whole
 * subject). «Меню на урока» is the seventh and the pause CANNOT reach it: it is
 * shell chrome in a different tree, and its centre sits 1 px inside the reading
 * surface's left edge on iphone16-landscape.
 *
 * So it stands down, exactly as the demonstration deck stands down for the ⚙
 * sheet above — replaced by, not stacked with — and it loses nothing by waiting,
 * because every row in it is a paused-state action and the car is already
 * stopped.
 */
describe("§1b · the read mode and the lesson menu are one surface", () => {
  it("the read mode publishes itself as an attribute the stylesheet can arbitrate on", () => {
    expect(OVERLAY_CODE).toContain('root.dataset.simOverlayRead = "open"');
    expect(OVERLAY_CODE).toContain("delete root.dataset.simOverlayRead");
  });

  it("…and the menu carries the name the rule needs", () => {
    expect(SHELL_CODE).toContain('data-hud="play-menu"');
  });

  it("…and the rule stands it down, scoped to the compact stage", () => {
    expect(STYLES_CODE).toContain(
      'html[data-sim-overlay-read="open"] [data-sim-compact="on"] [data-hud="play-menu"] { display: none; }',
    );
  });

  it("but NOT the touch controls, because unmounting those IS the §C1 bug", () => {
    // A `display: none` on `[data-hud="touch-controls"]` would destroy the pads'
    // DOM nodes while a thumb is still on the glass — its `pointerup` reaches
    // nobody and the pad stays owned by a finger that can never let go. That is
    // the founder's unrecoverable session, and the read mode must not
    // re-introduce it by taking the shortcut that looks the same from outside.
    expect(STYLES_CODE).not.toMatch(
      /data-sim-overlay-read="open"\][^{]{0,80}\[data-hud="touch-controls"\][^{]{0,20}\{ display: none/,
    );
  });
});

describe("§2 · the camera is a control, not a keyboard shortcut", () => {
  it("offers the three views by name rather than a blind cycle", () => {
    const views = viewMenuViewsBg(true).map((v) => v.id);
    expect(views).toEqual(["cockpit", "chase", "topdown"]);
    expect(viewMenuViewsBg(true).map((v) => v.wordBg)).toEqual([
      "Кабина",
      "Отвън",
      "Отгоре",
    ]);
  });

  it("drops top-down on the rungs that refuse it", () => {
    // Exam rungs: the C cycle skips it and the keyboard legend does not
    // advertise G or N. A menu that offered it would be the same silent
    // refusal, one surface over.
    expect(viewMenuViewsBg(false).map((v) => v.id)).toEqual(["cockpit", "chase"]);
    expect(viewMenuShowsTopdownAids("topdown", false)).toBe(false);
  });

  it("shows G's zoom and N's orientation ONLY while top-down is live", () => {
    expect(viewMenuShowsTopdownAids("topdown", true)).toBe(true);
    expect(viewMenuShowsTopdownAids("cockpit", true)).toBe(false);
    expect(viewMenuShowsTopdownAids("chase", true)).toBe(false);
    expect(viewMenuShowsTopdownAids(null, true)).toBe(false);
  });

  it("reaches the aids through the rig's own handle, not a synthetic keypress", () => {
    // CameraRig owns the two presets — they are read once a frame and must not
    // become React state. The key listener and the touch rail therefore call
    // the SAME two functions, which is what stops a phone and a keyboard
    // stepping the presets differently.
    const rig = flat(strip(norm("CameraRig.tsx")));
    expect(rig).toContain("if (e.code === \"KeyG\") cycleZoom(); else toggleOrientation();");
    expect(rig).toContain("topdownAidRef.current = { cycleZoom, toggleOrientation,");
    expect(TOUCH_CODE).toContain("aid.cycleZoom()");
    expect(TOUCH_CODE).toContain("aid.toggleOrientation()");
  });
});

describe("§3 · the graded mirror glances stay in the open", () => {
  it("keeps all three on the flank rails and out of the camera menu", () => {
    // The popover's whole body — from its own declaration to the next
    // top-level function, on the UNFLATTENED source so the boundary is real.
    const src = strip(TOUCH);
    const from = src.indexOf("function ViewRailControl(");
    expect(from, "ViewRailControl must still exist").toBeGreaterThan(0);
    const to = src.indexOf("\nfunction ", from + 10);
    const menu = src.slice(from, to > 0 ? to : undefined);
    expect(menu).toContain('data-hud="view-menu"');
    expect(menu.length).toBeGreaterThan(100);
    for (const glance of ["glance(\"left\")", "glance(\"right\")", "glance(\"rear\")"]) {
      expect(menu, `${glance} must not be inside the camera popover`).not.toContain(glance);
      expect(TOUCH_CODE, `${glance} must still exist on a rail`).toContain(glance);
    }
  });

  it("keeps them inside an ArcStation, i.e. always visible while driving", () => {
    // 10–30 presses a lesson and every one of them scored. The station wrapper
    // is what puts a control under a resting thumb; anything else is a menu.
    const arcs = TOUCH_CODE.slice(TOUCH_CODE.indexOf("side=\"right\""));
    for (const glance of ["glance(\"left\")", "glance(\"right\")", "glance(\"rear\")"]) {
      expect(arcs).toContain(glance);
    }
  });
});

/* =============================================================================
 * §4 · J-WAVE-3 — THE TOP STRIP HAS ONE OWNER.
 *
 * The defect, measured in WebKit with the real insets on all three PORTRAIT
 * profiles, in every state and on both routes: `elementFromPoint` at the tier
 * pill «Начинаещ»'s own centre answered the rail's «Пауза». One dead control,
 * 1 325 px² on the iPhone 16 and 1 975 px² on both 360 px Androids, plus
 * «Начинаещ» printed straight across «ИЗГЛЕД» and «ПАУЗА».
 *
 * Two owners, one strip: `TOP_RAIL_RIGHT_CSS` reserves the notification
 * column's lane and nothing else, and the picker was pinned into the same
 * band from the scene tree. 255 px of segmented control against a 167.5 px
 * rail lane or a 141.5 px column lane — it fits in neither, so on a phone the
 * pill is not repositioned, it is replaced by a cell in the ⚙ sheet.
 *
 * These four assertions are the ones that would let it come back silently.
 * ========================================================================== */
describe("§4 · the tier picker is off the phone's top strip", () => {
  it("hides the scene's pill on every compact stage, unconditionally", () => {
    // Unconditional is the load-bearing word: the two `:has()` rules that used
    // to stand it down behind a hint could never close this, because the
    // collision is with the RAIL, which is on screen in every state.
    expect(STYLES_CODE).toMatch(
      /\[data-sim-compact="on"\] \[data-hud="difficulty"\] \{ display: none; \}/,
    );
    // …and the rule it replaced — a reposition inside the very strip the rail
    // owns — must not come back.
    expect(STYLES_CODE).not.toMatch(
      /\[data-sim-compact="on"\] \[data-hud="difficulty"\] \{ right:/,
    );
  });

  it("keeps the ROOMY picker exactly as it was", () => {
    // A mouse has the corner: the column starts 2.75 rem lower there by
    // construction and the rail does not exist. This is a phone rule only, and
    // the unpanel styling of the segments is untouched.
    expect(STYLES_CODE).toContain('[data-sim-stage] [data-hud="difficulty"] button');
    expect(SCENE_CODE).toContain('data-hud="difficulty"');
  });

  it("gives the tier a real home in the ⚙ sheet before it takes the pill away", () => {
    // Removing a control is not the same move as moving one. The sheet cell is
    // what makes row C1's own sentence — „still one tap away at any time from
    // the ⚙ sheet" — true for the first time.
    expect(SCENE_CODE).toContain("difficulty={difficulty}");
    expect(SCENE_CODE).toContain("onSelectDifficulty={setDifficulty}");
    expect(TOUCH_CODE).toContain("textBg={tierCellTextBg(difficulty)}");
    expect(TOUCH_CODE).toContain("onSelectDifficulty(nextTier(difficulty))");
  });

  it("puts that cell BEFORE the clutch, because the tier is what creates it", () => {
    // «СЪЕД» is rendered only on the manual tier, so a tier cell placed after
    // it would move under the thumb every time the tier changed — the
    // founder's own „elements moving". Order asserted on the shipped source.
    const sheet = TOUCH_CODE.slice(TOUCH_CODE.indexOf('aria-label="Контроли на автомобила"'));
    const tier = sheet.indexOf("tierCellTextBg");
    const clutch = sheet.indexOf('textBg="СЪЕД"');
    expect(tier, "the tier cell must be in the sheet").toBeGreaterThan(0);
    expect(clutch, "the clutch cell must be in the sheet").toBeGreaterThan(0);
    expect(tier).toBeLessThan(clutch);
  });

  it("cycles in the curriculum's own order and names both ends", () => {
    expect(nextTier("beginner")).toBe("normal");
    expect(nextTier("normal")).toBe("advanced");
    expect(nextTier("advanced")).toBe("beginner");
    // Four letters on the face, the whole word in the accessible name — the
    // same split the rail's camera button uses.
    expect(tierCellTextBg("normal")).toBe("НОРМ");
    expect(tierCellTextBg("advanced")).toBe("НАПР");
    expect(tierCellLabelBg("normal")).toBe(
      "Ниво на помощта: Нормален — натисни за Напреднал",
    );
  });
});

/**
 * ── §1c · THE LAST TWO CORRIDOR COLLISIONS — 2026-08-13, §W3 ────────────────
 *
 * Wave 10 swept six profiles × seven states on the deployed build and found
 * exactly two live controls still answering for something else:
 *
 *   ⚙ SHEET vs THE NOTIFICATION COLUMN, landscape only. Measured on the
 *   Samsung gesture-bar 780×360: sheet [2, 56, 776×44] against a column card
 *   [528, 42, 240×44]. The column is z-30 over the sheet's z-20, so «Рестарт на
 *   колата», «ЗАТВОРИ КОНТРОЛИТЕ» — the button that closes the sheet — and, on
 *   the manual tier, «M►» all answered the column. 5 728–7 139 px². The
 *   geometric fix does not exist and TouchControls' own sheet block writes down
 *   why: the column's top is 42 and the sheet's floor-anchored row starts at 56,
 *   so clearing vertically needs a 14 px column; and narrowing the sheet to the
 *   rail's right bound puts a second row through «Меню на урока» at [8,8,48×44].
 *
 *   THE DEMONSTRATION DECK vs THE LESSON MENU. «🎬Демонстрация ▸»
 *   [71, 110, 134×27] answered by «Меню на урока», with 88 px² of the menu's own
 *   type over it. Making the menu stop the car does NOT fix this one — the deck
 *   is not a driving control, so the pause leaves it live and the sheet stands
 *   on it.
 *
 * Both take the arbitration this file already applies twice: a transport the
 * student opened on purpose is REPLACED BY the surface on top of it, never
 * stacked with it, and one 44 px tap brings it back.
 */
describe("§1c · the ⚙ sheet and the lesson menu each clear their corridor", () => {
  it("the notification column yields to the ⚙ sheet, and only where the collision is", () => {
    expect(STYLES_CODE).toContain(
      'html[data-sim-car-sheet="open"] [data-sim-compact="on"] [data-hud="notify-column"]',
    );
    // SCOPED TO LANDSCAPE. Portrait folds the sheet into three rows at the floor
    // with the column up under the corner and measures 0 dead — so portrait
    // keeps its teaching card, and the rule is exactly as wide as the defect.
    const at = STYLES_CODE.indexOf('html[data-sim-car-sheet="open"] [data-sim-compact="on"] [data-hud="notify-column"]');
    expect(STYLES_CODE.slice(Math.max(0, at - 120), at)).toContain("@media (orientation: landscape)");
  });

  it("the demonstration deck yields to the lesson menu, by the DOM the menu already renders", () => {
    expect(STYLES_CODE).toContain(
      '[data-sim-compact="on"]:has([data-hud="play-menu"] [role="menu"]) [data-hud="demo-deck"]',
    );
  });

  /**
   * sc-ed-reverse-line:d6fb0f3c — „with the settings sheet open and the rest of
   * the HUD dimmed, the «Следвай синята линия» pill stays at full brightness
   * outside the overlay, so a modal that should own the screen does not."
   *
   * The deck was not the only surface left standing on the menu. Read off the
   * row's own frame (`.audit-frames/sweep161/sc-ed-reverse-line/mobile-right/
   * 07b-menu.png`, device y 240): the pill's ink is rgb(72, 169, 255) — the
   * accent at full strength — while the objective banner, the notification
   * column, the deck pill and the whole touch rail are gone from the stage.
   *
   * The ORDER is asserted as well as the presence, and that is not tidiness:
   * the case below reads a fixed window after the deck's selector, so a second
   * selector appended AFTER it moves the declaration out of that window. The
   * rule's own site says so; this is the half that fails if someone reorders it.
   */
  it("…and so does the standing route pill, in the same rule and before the deck", () => {
    const pill =
      '[data-sim-compact="on"]:has([data-hud="play-menu"] [role="menu"]) [data-hud="follow-hint"]';
    const deck =
      '[data-sim-compact="on"]:has([data-hud="play-menu"] [role="menu"]) [data-hud="demo-deck"]';
    expect(
      STYLES_CODE,
      "the route pill is up for the whole of every L1 drive and was the one " +
        "surface the menu could not stand down",
    ).toContain(pill);
    const pillAt = STYLES_CODE.indexOf(pill);
    const deckAt = STYLES_CODE.indexOf(deck);
    expect(pillAt).toBeGreaterThan(-1);
    expect(deckAt).toBeGreaterThan(-1);
    expect(
      pillAt,
      "the pill's selector moved after the deck's — the `visibility` window the " +
        "next case reads is 130 chars and a second selector does not fit in it",
    ).toBeLessThan(deckAt);
    // ONE rule, not two: the slice from the pill to the deck must be nothing
    // but the comma that joins them, or these are two declarations that can
    // drift apart the way `pauseModalUp` and `paused` did.
    expect(STYLES_CODE.slice(pillAt + pill.length, deckAt)).toBe(", ");
  });

  it("…and both use `visibility`, never `display`, because a deck owns a replay clock", () => {
    const deckAt = STYLES_CODE.indexOf('[data-sim-compact="on"]:has([data-hud="play-menu"] [role="menu"]) [data-hud="demo-deck"]');
    expect(STYLES_CODE.slice(deckAt, deckAt + 130)).toContain("visibility: hidden");
    const colAt = STYLES_CODE.indexOf('html[data-sim-car-sheet="open"] [data-sim-compact="on"] [data-hud="notify-column"]');
    expect(STYLES_CODE.slice(colAt, colAt + 130)).toContain("visibility: hidden");
  });
});
