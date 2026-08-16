import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PWA INSTALL BAR PAYS FOR THE STRIP IT SITS ON — 2026-08-16.
 *
 * HOW IT WAS FOUND. tools/mobile, Playwright WEBKIT, against the DEPLOYED
 * build over the tunnel, signed in as the founder's own account, iPhone 16
 * portrait 393x852 and landscape 852x393 with their real insets substituted
 * into env(). Two independent methods, because a rectangle overlap on its own
 * only proves that two boxes share pixels, not that a student loses a tap:
 *
 *   RECT INTERSECTION, /dashboard, at rest, no scrolling:
 *     portrait   bar card y 723–818 (h 95) of an 852 viewport;
 *                34,284 px² over the „Теория" module card = 49 % of it
 *     landscape  bar card h 52 of a 393 viewport;
 *                34,944 px² over the „ПРОДЪЛЖИ УРОКА" hero card = 21 % of it
 *
 *   document.elementFromPoint AT THE CENTRE OF EACH CONTROL, same session:
 *     the „Елементи на пътя" practice link (150.1 x 30) resolved to
 *     `div.mx-auto.flex.w-full` — the install bar's own card — and not to the
 *     link. Its middle pixel was not tappable at all.
 *
 * WHY IT HAPPENED. `components/pwa/InstallHint` is `fixed inset-x-0 bottom-0
 * z-40`. <body>'s bottom padding was `env(safe-area-inset-bottom)` and nothing
 * else, i.e. the home indicator — a different strip, claimed for a different
 * reason. Nothing in the layout had ever heard of the bar, so the page ran
 * under it. The hint's own allow-list already knew this was a hazard: the
 * practice and exam runners are excluded from it precisely because a fixed
 * bottom bar would sit on „Провери"/„Следващ". That exclusion treated two
 * routes; the bar still overlaid both routes it IS allowed on.
 *
 * WHAT THESE ASSERTIONS PIN. Three files have to agree or the fix is worse
 * than the defect, and none of the three can see the other two:
 *
 *   1. PinnedBarInset MEASURES the bar and publishes `--pinned-bar-h`, and it
 *      does so with BOTH observers. ResizeObserver cannot see an element that
 *      does not exist yet, and the bar unmounts on every client navigation off
 *      /dashboard — without the MutationObserver the reserved strip outlives
 *      the bar for the rest of the session.
 *   2. globals.css spends it through `max()` against the safe-area inset, never
 *      `+`. The bar's own bottom padding is already
 *      `max(0.75rem, env(safe-area-inset-bottom))`, so its measured height
 *      CONTAINS the home-indicator strip; adding them reserves it twice and
 *      leaves a 34px hole under every page in the product.
 *   3. DashboardShell's root min-height subtracts THE SAME expression. It used
 *      to name `env(safe-area-inset-bottom)` alone, and the long comment on
 *      that line records what happens when the root asks for more height than
 *      body's content box has: the document scrolls by the difference on every
 *      screen, and `useQuestionBudget` reads that difference as „the question
 *      must give this back" and clamps the stem against a floor it can never
 *      reach. A bar-height mismatch is that same bug, three times larger.
 *
 * PROVEN WITH A NEGATIVE CONTROL, because „I checked and it was clean" is how
 * this survives. Same lane dev server, same session, same page, same seed data,
 * same bar; the ONLY difference between the two columns is <body>'s bottom
 * padding, forced back to the pre-fix `env(safe-area-inset-bottom)` with an
 * inline override. Scrolled to the very end of the document — i.e. as far as a
 * student can possibly get the content out from under the bar:
 *
 *   iPhone 16 PORTRAIT   bar wrapper 141px
 *     fix OFF  bodyPad 34px   docH 4000   15,558 px² of content still under the
 *                                         bar; „Учи между полунощ и 5:00
 *                                         сутринта." 100 % covered; the last
 *                                         painted pixel of the page sits 58px
 *                                         BELOW the bar's top edge
 *     fix ON   bodyPad 141px  docH 4107   0 px²; last pixel 49px clear
 *
 *   iPhone 16 LANDSCAPE  bar wrapper 85px
 *     fix OFF  bodyPad 21px   docH 2450   13,110 px²; that same row 88 % covered;
 *                                         last pixel 35px BELOW the bar top
 *     fix ON   bodyPad 85px   docH 2514   0 px²; last pixel 29px clear
 *
 * An achievement row that no amount of scrolling could reveal is the sharpest
 * form of the founder's report, and the +107 / +64 px of document are exactly
 * the reserve.
 *
 * AND THE REGRESSION IT COULD HAVE CAUSED, CHECKED RATHER THAN ASSUMED. Same
 * server, /theory/practice — the runner whose `useQuestionBudget` reads
 * `scrollHeight − vh`:
 *   portrait   --pinned-bar-h absent, body padding-bottom 34px, shell
 *              min-height 818px (= 852 − 34), document overflow 0
 *   landscape  absent, 21px, 372px (= 393 − 21), overflow 0
 * i.e. character-for-character the pre-fix geometry, and the 34px document
 * scroll that calc exists to prevent is still zero. On /dashboard the same two
 * numbers move together: 141px/711px and 85px/308px.
 *
 * Source assertions rather than a rendered measurement, the idiom
 * shellStability.test.ts established for the same class of finding: the browser
 * sweep is what FOUND this, and reproducing it needs WebKit, a database and a
 * deploy. This file is what stops it being undone in a unit run.
 */

const SRC = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

const INSET = read("components/ui/PinnedBarInset.tsx");
const GLOBALS = read("app/globals.css");
const SHELL = read("components/dashboard/DashboardShell.tsx");
const ROOT_LAYOUT = read("app/layout.tsx");

/** Whitespace-insensitive, so a formatter cannot redden an assertion. */
const flat = (s: string) => s.replace(/\s+/g, "");
/** Comments stripped — the prose here quotes the very declaration it replaced,
 *  so a naive substring search would find the bug inside the story about it. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The one expression both consumers must spend. Written once here so a test
 * cannot pass because two files agree with each other and disagree with this.
 */
const RESERVE = "max(env(safe-area-inset-bottom,0px),var(--pinned-bar-h,0px))";

describe("the bar's height is measured, not guessed", () => {
  it("publishes --pinned-bar-h, the name both consumers read", () => {
    expect(flat(INSET)).toContain(flat('PINNED_BAR_VAR = "--pinned-bar-h"'));
  });

  /**
   * The bar has four heights and three are decided at runtime: 141px portrait,
   * 85px landscape (a max-height query drops the badge and the pitch), taller
   * again while „Как?" is expanded, and gone the moment the student dismisses
   * it — none of which involves a navigation. A constant would be wrong in
   * three of the four states.
   */
  it("reads the BORDER box, which is where the bar keeps its padding", () => {
    expect(INSET).toContain("getBoundingClientRect().height");
    // contentRect excludes padding, and padding is most of the bar's landscape
    // height (12px above the card + 21px of home-indicator payback below it).
    expect(code(INSET)).not.toContain("contentRect");
  });

  it("watches for the bar ARRIVING and LEAVING, not only resizing", () => {
    expect(INSET).toContain("new MutationObserver");
    expect(INSET).toContain("new ResizeObserver");
    expect(flat(INSET)).toContain(flat("{ childList: true }"));
  });

  it("removes the property when there is no bar, so the fallback rules", () => {
    expect(INSET).toContain("removeProperty(PINNED_BAR_VAR)");
    // …and on unmount, or a route that mounts no bar keeps the last one's strip.
    expect(flat(code(INSET))).toContain(flat("return () => {"));
    expect(flat(code(INSET))).toContain(flat("publish(0);"));
  });

  /**
   * The wrapper must generate no box: its child is `position: fixed` and has to
   * keep resolving against the viewport, and on the routes where the hint
   * renders nothing this element must be as absent from layout as from screen.
   */
  it("generates no box of its own", () => {
    expect(flat(INSET)).toContain(flat('style={{ display: "contents" }}'));
  });

  it("is actually wrapped around the hint in the root layout", () => {
    expect(flat(ROOT_LAYOUT)).toContain(
      flat("<PinnedBarInset><InstallHint /></PinnedBarInset>"),
    );
  });
});

describe("both consumers reserve the same strip, through max() and not +", () => {
  it("<body> pays the larger of the notch and the bar", () => {
    expect(flat(GLOBALS)).toContain(flat(`padding-bottom: ${RESERVE}`));
  });

  /**
   * THE ASSERTION THAT FAILS ON THE SHIPPED BEHAVIOUR. Before this fix the
   * declaration was a bare `padding-bottom: env(safe-area-inset-bottom, 0px)`,
   * which is what let the bar sit on the lesson card. If anyone puts it back —
   * or "simplifies" the max() away — this is the line that goes red.
   */
  it("no longer pays the notch alone", () => {
    // Whole file, not a `body { … }` slice: the first `body{` in a flattened
    // stylesheet is not necessarily THE rule (this sheet also carries
    // `html,body` and scope selectors), and an assertion aimed at the wrong
    // block passes on the broken source — which this one did, until it was
    // checked against a deliberately reverted tree. `padding-bottom:
    // env(safe-area-inset-bottom, …)` appears exactly once in this stylesheet,
    // so the file is the honest scope.
    expect(flat(code(GLOBALS))).not.toContain(
      flat("padding-bottom: env(safe-area-inset-bottom, 0px);"),
    );
  });

  /**
   * The shell's root min-height must subtract WHATEVER BODY PAYS. Naming the
   * inset alone here re-opens the overflow defect its own comment documents,
   * one bar-height instead of one notch.
   */
  it("the dashboard shell subtracts the same expression", () => {
    expect(flat(SHELL)).toContain(flat(`min-h-[calc(100dvh-${RESERVE})]`));
  });

  it("the shell no longer subtracts the notch alone", () => {
    expect(flat(code(SHELL))).not.toContain(
      flat("min-h-[calc(100dvh-env(safe-area-inset-bottom,0px))]"),
    );
  });

  /**
   * `+` is the plausible-looking version of this that is wrong: it reserves the
   * home-indicator strip twice (the bar already contains it) and leaves a 34px
   * hole under every page. Named explicitly so a future edit has to argue with
   * a sentence rather than with a diff.
   */
  it("never ADDS the two claims on the same strip", () => {
    for (const source of [flat(code(GLOBALS)), flat(code(SHELL))]) {
      expect(source).not.toContain(
        flat("env(safe-area-inset-bottom,0px)+var(--pinned-bar-h,0px)"),
      );
    }
  });
});
