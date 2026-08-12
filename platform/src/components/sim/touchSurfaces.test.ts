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

describe("§1 · the ⚙ sheet and the demonstration deck are one surface", () => {
  it("publishes the sheet as an attribute the stylesheet can arbitrate on", () => {
    // The deck lives in a tree TouchControls cannot reach, so the hand-off is
    // an `html[data-sim-*]` attribute — the same grammar `data-sim-camera` and
    // `data-sim-glance` already use.
    expect(TOUCH_CODE).toContain("root.dataset.simCarSheet = \"open\"");
    expect(TOUCH_CODE).toContain("delete root.dataset.simCarSheet");
    expect(STYLES_CODE).toContain('html[data-sim-car-sheet="open"] [data-hud="demo-deck"]');
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
    expect(SCENE_CODE).toContain("if (wasPlaying) clock.playing = true");
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
