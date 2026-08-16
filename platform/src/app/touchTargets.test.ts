import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 44px, ON THE SURFACES A STUDENT ACTUALLY STARTS FROM — 2026-08-16.
 *
 * HOW THESE WERE FOUND, AND WHY THE FIRST NUMBERS WERE WRONG. Playwright
 * WEBKIT against the DEPLOYED build, signed in, iPhone 16 portrait and
 * landscape with the real insets substituted into env(). The first pass read
 * `getBoundingClientRect()` and produced a list that was both too long and
 * too short:
 *
 *   TOO SHORT because a box rect cannot see an obstruction. Controls whose
 *   painted box is a comfortable 361 x 193 were untappable at the centre.
 *   (That is the install-bar defect; it has its own file,
 *   components/ui/pinnedBarInset.test.ts.)
 *
 *   TOO LONG because a box rect cannot see an ENLARGEMENT either. The three
 *   quality-tier pills on /simulator measure 59.5 x 28, 67.3 x 28 and
 *   65.6 x 28 — which is exactly the „the tier buttons are 28 px" this wave was
 *   sent to fix. They are not a defect. lesson-ui/QualityPresetSelector grows
 *   their TAP AREA with an absolutely positioned ::before at −10px top and
 *   bottom, and hit-testing them with `document.elementFromPoint` along their
 *   own centre line returns 49px portrait / 48px landscape. „Fixing" them would
 *   have cost painted pixels on the one screen in the product where every pixel
 *   of chrome is charged against a measured budget, to solve nothing.
 *
 * So the grading instrument is the HIT AREA, and the list below is what was
 * under 44px by BOTH measures — i.e. what a thumb genuinely misses:
 *
 *   /dashboard   „Всички теми"                 78.4 x 16   thumb 17px
 *                5 „Препоръчано" chips              x 30   thumb 31px
 *   /            wordmark → /                  136.5 x 32   thumb 32px
 *                „За автошколи"                123.1 x 36   thumb 36px
 *                „Вход"                         56.8 x 36   thumb 36px
 *                „Регистрация"                 125.8 x 36   thumb 36px
 *                4 legal footer links               x 15   thumb 16px
 *   /classroom   „Продължи урока"/„Влез…"       319 x 40   thumb 41px
 *   /classroom/… „Обратно към курса" + sibling      x 40
 *                „Продължи" (end of lesson)         x 32
 *
 * TWO INSTRUMENTS, AND THE CHOICE IS NOT TASTE. Where a control has vertical
 * neighbours in a gapped list, the BOX grows (`min-h-11`): a ::before reaching
 * the 14–29px those needed would eat the gutter and overlap the row below, so a
 * tap landing between two rows becomes a coin flip over which topic — or which
 * legal document — opens. Where a control sits on a shared baseline that other
 * panels align to, the ::before grows instead and the box is left alone.
 *
 * Source assertions, the idiom shellStability.test.ts established: the sweep
 * that found these needs WebKit, a database and a deploy; this is what keeps
 * them fixed in a unit run.
 */

const SRC = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

const MASTERY = read("components/dashboard/TopicMasteryGrid.tsx");
const MARKETING = read("app/(marketing)/layout.tsx");
const CLASSROOM_LIST = read("app/(dashboard)/classroom/page.tsx");
const CLASSROOM_LESSON = read("app/(dashboard)/classroom/[lessonId]/page.tsx");
const CLASSROOM_ROOM = read("app/(dashboard)/classroom/ClassroomRoom.tsx");
const QUALITY = read("components/sim/lesson-ui/QualityPresetSelector.tsx");

const flat = (s: string) => s.replace(/\s+/g, "");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * `min-h-11` is 2.75rem = 44px. Asserted by name rather than by value because
 * that is the token every other 44px fix in this codebase already states — the
 * dashboard hamburger, its mirror in the drawer, and the wordmark.
 */
const FLOOR = "min-h-11";

describe("/dashboard · the mastery panel", () => {
  /**
   * 78.4 x 16, and 17px to a thumb — the smallest hit target anywhere on the
   * dashboard, on the only way out of this panel into the topic list. The box
   * is deliberately NOT grown: it sits on a `.panel-head` baseline beside the
   * „Усвояване по теми" heading, and a 44px box there drags the rule under the
   * heading out of alignment on every panel that shares the pattern.
   */
  it("the «Всички теми» link gets its 44px from a ::before, not from a taller box", () => {
    const link = flat(MASTERY).match(/<Linkhref="\/theory"[^>]*>/)?.[0] ?? "";
    expect(link).toContain("relative");
    // -inset-y-3.5 is −14px a side: 16 + 28 = 44.
    expect(link).toContain("before:-inset-y-3.5");
    expect(link).toContain("before:content-['']");
    // The pseudo-element must span the link, or only its middle column is live.
    expect(link).toContain("before:left-0");
    expect(link).toContain("before:right-0");
  });

  /**
   * The five weak-concept chips were 30px in a `gap-2` wrapped list. Here the
   * BOX grows: 14px of ::before a side would consume the whole 8px gutter and
   * reach 3px into the row below.
   */
  it("the «Препоръчано за упражнение» chips grow their box to 44px", () => {
    const chip =
      flat(MASTERY).match(/<Linkhref=\{c\.href\}className="[^"]*"/)?.[0] ?? "";
    expect(chip).toContain(FLOOR);
    // …and NOT by a pseudo-element, which is the wrong instrument in a gapped
    // column and would make a tap between two rows ambiguous.
    expect(chip).not.toContain("before:-inset-y");
  });
});

describe("/ · the landing shell, where every control was short", () => {
  it.each([
    ["the wordmark home link", 'href="/"'],
    ["«За автошколи»", 'href="/za-avtoshkoli"'],
    ["«Вход»", 'href="/login"'],
    ["«Регистрация»", 'href="/register"'],
  ])("%s clears 44px", (_label, href) => {
    const header = flat(MARKETING).slice(
      flat(MARKETING).indexOf("<header"),
      flat(MARKETING).indexOf("</header>"),
    );
    const link = header.match(new RegExp(`<Link${href}[^>]*>`))?.[0] ?? "";
    expect(link, `no <Link ${href}> found in the marketing header`).not.toBe("");
    expect(link).toContain(FLOOR);
  });

  /**
   * The four legal links were 15px. These are the privacy notice, the terms and
   * the cookie policy on a product whose users are MINORS (ADR-004) — this is
   * the consent surface, not decoration. `w-fit` keeps the 44px row as wide as
   * its own label: a full-width block would put an invisible tap target across
   * the whole footer column.
   */
  it("the legal footer links clear 44px without spanning the column", () => {
    const footer = flat(MARKETING).slice(flat(MARKETING).indexOf("<footer"));
    const link = footer.match(/<Linkhref=\{href\}className="[^"]*"/)?.[0] ?? "";
    expect(link).toContain(FLOOR);
    expect(link).toContain("w-fit");
  });
});

describe("/classroom · the lesson list and the lesson", () => {
  /**
   * `.btn-accent` is `px-5 py-3` in globals.css and comes to exactly 44px. Each
   * of these call sites overrides the padding downward, which is how a button
   * that is correct by construction ships at 40 and 32. The floor is stated at
   * the call site rather than the padding restored, so the compact proportions
   * each card was designed with survive.
   */
  it.each([
    ["the lesson-list CTA (40px)", () => CLASSROOM_LIST, "/classroom/${next.id}"],
    ["the held-back lesson's way out (40px)", () => CLASSROOM_LESSON, "/classroom"],
    ["«Продължи» at the end of a lesson (32px)", () => CLASSROOM_ROOM, "/classroom/${next.id}"],
  ])("%s clears 44px", (_label, source) => {
    const btn = flat(source()).match(/className="btn-accent[^"]*"/)?.[0] ?? "";
    expect(btn, "no btn-accent call site found").not.toBe("");
    expect(btn).toContain(FLOOR);
  });

  it("the second way out of a held-back lesson clears 44px too", () => {
    const link = flat(CLASSROOM_LESSON).match(/<Linkhref="\/theory"[^>]*>/)?.[0] ?? "";
    expect(link).toContain(FLOOR);
    // It is not a .btn-* at all, so it never had the canonical 44px to fall
    // back on — `items-center` is what makes min-height do anything on a flex
    // box whose content is shorter than the floor.
    expect(link).toContain("items-center");
  });
});

describe("the tier pills on /simulator are NOT a defect, and stay untouched", () => {
  /**
   * This is the control the wave was sent to fix, and the assertion exists to
   * stop the next reader "fixing" it from a box measurement. Painted box 28px;
   * hit area 49px portrait / 48px landscape, measured with elementFromPoint on
   * the deployed build. The enlargement is the ::before below, and growing the
   * box instead would spend painted pixels on the sim's measured screen budget
   * to buy nothing.
   */
  it("keeps the ::before that makes 28px painted into 48px tappable", () => {
    const btn = flat(QUALITY).match(/className=\{`relative[^`]*`/)?.[0] ?? "";
    expect(btn).toContain("before:-inset-y-2.5");
    expect(btn).toContain("before:content-['']");
    expect(btn).toContain("before:left-0");
    expect(btn).toContain("before:right-0");
  });

  it("has not silently grown the painted box instead", () => {
    expect(flat(code(QUALITY))).toContain(flat("px-3 py-1.5 text-xs font-bold"));
  });
});
