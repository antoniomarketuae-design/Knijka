import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE APP SHELL HOLDS STILL — the three cross-cutting stability defects found
 * in phase 7 and the reason each fix cannot be quietly removed.
 *
 * HOW THEY WERE FOUND. `tools/mobile/stability-probe.mjs`, Playwright WEBKIT
 * (not Chromium in an iPhone costume — see tools/mobile/README.md rule 1), on
 * four device profiles: iPhone 16 portrait 393x852 and landscape 852x393 with
 * their REAL insets, plus a 360x780 / 780x360 Android floor with none. Six
 * surfaces each: /dashboard, /theory, /theory/practice, /exams, /simulator and
 * the driving shell. Every measurement was taken three times per surface —
 * resting, with the nav drawer open, and after it closed — and again with the
 * viewport shortened by 90px to stand in for iOS's collapsing toolbar.
 *
 * WHAT IT FOUND, and what it did NOT. The layout does not move: 0px of shift on
 * every surface when the drawer opens, when it closes, and when the toolbar
 * takes 90px back. Left and right margins agree to the pixel everywhere
 * (16/16). No control is clipped by the toolbar. The founder's „elements
 * shifting position" and „uneven margins" are, measurably, not happening. What
 * IS happening is three things, all of them in the shell, all of them invisible
 * on a device without a notch — which is why they had survived:
 *
 *   1. THE DRAWER PAID NO INSETS. globals.css gives <body> exactly the
 *      left/right/bottom padding `viewport-fit=cover` took away, but the drawer
 *      is `absolute` inside a `fixed` parent: its containing block is the
 *      viewport and none of that reaches it. On a landscape iPhone every nav
 *      row sat 43px inside the 59px notch band, and the panel's bottom edge
 *      21px into the home indicator; in portrait „Изход" sat 18px inside the
 *      34px home-indicator band. Five surfaces, because it is shell chrome.
 *
 *   2. THE TOPBAR STAYED MOUNTED UNDER THE SIMULATOR. In the compact/immersive
 *      play shell the topbar is covered but still live: „Книжка.AI" overlapped
 *      „Меню на урока" by 1440px², the hamburger overlapped the difficulty chip
 *      by 907px², and elementFromPoint at the centre of both returned something
 *      else. Two menu buttons on the same pixels, one of them invisible and
 *      still in the tab order and the accessibility tree.
 *
 *   3. THE SKIP LINK LANDED IN THE NOTCH. `focus:fixed focus:left-4` is 16px
 *      from the PHYSICAL edge, i.e. 43px inside the landscape notch band — on
 *      the one control that exists specifically for keyboard and switch users.
 *
 * These are source assertions rather than a rendered measurement on purpose:
 * the browser sweep is the thing that FOUND them, and it needs a dev server, a
 * database and WebKit. This file is what makes them stay fixed in a unit run.
 */

const SRC = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

const SHELL = read("components/dashboard/DashboardShell.tsx");
const GLOBALS = read("app/globals.css");
const GROUP_LAYOUT = read("app/(dashboard)/layout.tsx");

/** Strip whitespace so a formatter cannot redden an assertion about CSS. */
const flat = (s: string) => s.replace(/\s+/g, "");

describe("the mobile nav drawer pays its own safe-area insets", () => {
  /**
   * The drawer escapes <body>'s padding by construction, so each inset has to
   * be named on the panel itself. All three, because the notch is on the LEFT
   * in one landscape rotation, the home indicator is at the BOTTOM in portrait,
   * and the top is only 0 for as long as layout.tsx keeps
   * `statusBarStyle: "black"` rather than "black-translucent".
   */
  it.each([
    ["left", "paddingLeft"],
    ["top", "paddingTop"],
    ["bottom", "paddingBottom"],
  ])("insets its content on the %s edge", (edge, prop) => {
    expect(flat(SHELL)).toContain(
      flat(`${prop}: "calc(1rem + env(safe-area-inset-${edge}, 0px))"`),
    );
  });

  /**
   * The PANEL grows by the inset instead of the reading column shrinking. With
   * a fixed `w-72` and 75px of left padding the nav column would have lost a
   * quarter of its width on the one orientation that has the least of it.
   */
  it("widens by the left inset so the 18rem reading column survives", () => {
    expect(flat(SHELL)).toContain(flat(`width: "calc(18rem + env(safe-area-inset-left, 0px))"`));
    // …and the old fixed width is gone, or the two would fight.
    expect(SHELL).not.toMatch(/id="mobile-nav"[\s\S]{0,400}?\bw-72\b/);
  });

  /** Every env() here carries a fallback: without one the whole declaration is
   *  invalid on an engine that does not know the variable, and an invalid
   *  `width` is `auto` — a full-bleed drawer. */
  it("never uses env() without a fallback", () => {
    const uses = SHELL.match(/env\(safe-area-inset-[a-z]+[^)]*\)/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) expect(use).toMatch(/,\s*0px\s*\)$/);
  });
});

describe("the app topbar stands down inside the immersive simulator", () => {
  it("is addressable by a data attribute, not by a class name", () => {
    expect(SHELL).toContain("data-app-topbar");
  });

  /**
   * `display: none` and not `visibility` or `pointer-events`: the defect is
   * three-part — it painted nothing, it was hit-testable, and it was in the
   * accessibility tree. Only `display: none` answers all three.
   */
  it("is removed from layout, hit-testing and the a11y tree while compact", () => {
    expect(flat(GLOBALS)).toContain(
      flat(`[data-surface="cluster"]:has([data-sim-compact="on"]) [data-app-topbar] { display: none; }`),
    );
  });

  /**
   * The rule keys off the attribute LessonPlayShell already sets for its own
   * compact layout. If that attribute is ever renamed this test is the thing
   * that says the topbar quietly came back.
   */
  it("keys off the attribute the play shell actually publishes", () => {
    expect(read("components/sim/lesson-ui/LessonPlayShell.tsx")).toContain(
      `data-sim-compact={compact ? "on" : undefined}`,
    );
  });
});

describe("the skip link stays clear of the notch when focused", () => {
  it("offsets by the safe-area inset rather than a bare 1rem", () => {
    expect(GROUP_LAYOUT).toContain("calc(1rem + env(safe-area-inset-left, 0px))");
    expect(GROUP_LAYOUT).toContain("calc(1rem + env(safe-area-inset-top, 0px))");
    expect(GROUP_LAYOUT).not.toContain("focus:left-4");
  });
});

describe("<body> still pays the inset back for ordinary in-flow content", () => {
  /**
   * The counterpart to all of the above, and the reason none of it needed to
   * change anywhere else: `viewport-fit=cover` hands the page the whole
   * display, and this is the single place the inset is given back for every
   * screen that is NOT position:fixed. The stability sweep measured 0 blocking
   * safe-area findings on all six surfaces because of these three lines.
   */
  it.each(["left", "right", "bottom"])("pads %s on <body>", (edge) => {
    expect(flat(GLOBALS)).toContain(flat(`padding-${edge}: env(safe-area-inset-${edge}, 0px);`));
  });

  /** Top is deliberately absent — layout.tsx explains why (statusBarStyle). */
  it("does not pad the top, which the OS owns on this app", () => {
    expect(flat(GLOBALS)).not.toContain(flat("padding-top: env(safe-area-inset-top"));
  });
});
