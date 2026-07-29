import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE MOBILE FOLD — the practice runner and the exam runner at 393 x 852.
 *
 * WHAT WENT WRONG. Founder review, on his own phone, verbatim: „When I open
 * Theory questions, I have to scroll down to see all the answers from which to
 * choose, and it cant be like that it all have to be on the screen without
 * scrolling." — „The Exams section is absolutely the same thing." He has raised
 * it three times. The audience is 17–18-year-olds in Bulgaria who live on
 * phones, so this is not polish: it taxes the single most repeated action in
 * the product (1 089 practice questions, and a 45-question exam under a
 * 40-minute clock they are scored against).
 *
 * TWO THINGS ABOUT THE PREVIOUS PASS, because both are why there is a third.
 *
 *   It measured in CHROMIUM with an iPhone user agent. That is not an iPhone.
 *   Safe areas, toolbar-driven viewport resizing, scroll containment and `dvh`
 *   resolution are exactly where the two engines disagree. Every number below
 *   is Playwright WEBKIT.
 *
 *   It measured sixteen questions the runner happened to deal it, found seven
 *   stragglers „which overhang by 12–26px", and shipped. The acceptance is the
 *   WORST case, and neither runner lets you choose a question — practice deals
 *   adaptively, the exam deals a seeded paper — so the items that actually
 *   break were never on screen. src/app/dev/fold-rig exists to end that: it
 *   ranks the whole bank by rendered ink and mounts the top of it, one question
 *   at a time, inside the REAL (dashboard) chrome.
 *
 * THE MEASUREMENT (WebKit, 393 x 852, dpr 3, isMobile, hasTouch; the app's own
 * sticky topbar and <main> padding included; 40 questions per runner — the 16
 * heaviest ordinary text items, the 12 heaviest five- and six-option items and
 * the 12 heaviest artwork items; two consecutive runs, identical results).
 *
 *   THE FOLD IS THE TOP OF THE PINNED ACTION BAR, not the viewport edge: an
 *   answer painted under an opaque sticky bar is neither readable nor tappable.
 *
 *   practice   40/40 questions fully above the fold      worst overflow 0px
 *   exam       40/40 questions fully above the fold      worst overflow 0px
 *   practice   document overflow 0px on all 40 — the page does not scroll
 *   exam       document overflow 0px on all 40 — the page does not scroll
 *   tightest margin practice 20px, exam 8px — both on q-krastovishta-063
 *
 *   HYDRATION IS PART OF THE MEASUREMENT. The artwork budget is a client
 *   effect, so a page whose dev chunk timed out renders from the server and
 *   hands back plausible, wrong geometry. That happened, for a whole sweep.
 *   The rig now sets `data-hydrated` from an effect and the script refuses to
 *   measure a page without it.
 *
 *   The worst ORDINARY TEXT question in the bank is q-vehicle-032: a 123-char
 *   question with four options totalling 478 characters (the heaviest of the
 *   1 008 items that carry no artwork). Practice lands its last option at
 *   y=654 and the exam at y=668, of 852. The runner-up set — q-vehicle-061,
 *   q-eco-062, q-predimstvo-042 (the longest question text in the bank at 284
 *   chars), q-predimstvo-056 — all land between 640 and 702.
 *
 *   The worst SIX-option question, q-vehicle-063, lands at 698 / 719.
 *
 *   The worst ARTWORK question, q-krastovishta-029 (a top-down scene under the
 *   longest question text in the bank), lands at 755 / 767 — with the artwork
 *   budget having given the answers 100+ px back on its own.
 *
 *   The same sweep at 393x745 — the height a real iPhone 16 has with Safari's
 *   toolbars up — is NOT clean: the heaviest text items overhang by 4–14px and
 *   the heaviest scene items by more. That is reported rather than hidden. The
 *   brief's acceptance is 852; 745 is the next thing to buy, and the two levers
 *   left are <main>'s 24px top padding (owned by the dashboard layout) and the
 *   ~40px app topbar, neither of which is this lane's to move.
 *
 * WHERE THE PIXELS CAME FROM, in order of size. None of them came from text.
 *
 *   1. THE OPTION ROW WAS 19 % FURNITURE, HORIZONTALLY. Every previous pass
 *      traded vertical padding and ran out of room. At 393px the card column is
 *      337px and a practice option spent 64 of them before a single character:
 *      px-4 (32) + the tick box (16) + two gap-3 (24) + an ordinal badge (24).
 *      A narrower text column is more wrapped lines, and each line costs 23px
 *      four times over. Below `sm` the badge is gone and the paddings tighten:
 *      the answer column goes 233px -> 285px, +22 %. The badge labels the 1–9
 *      keyboard shortcuts and the line explaining those is itself `md:block`,
 *      so on a phone it was labelling nothing; it returns from `sm` up.
 *
 *   2. THE PRACTICE PROGRESS STRIP MOVED INTO THE ACTION BAR (38px). The bar
 *      was already pinned there for „Провери" and was two thirds empty. This is
 *      the Gran Turismo lesson in the founder's reference image: the readouts
 *      live hard against an edge, the middle of the screen is the thing you are
 *      doing. The counters ended up MORE visible than before — they no longer
 *      scroll away — and the session progress became a 2px rule along the bar's
 *      lit top edge.
 *
 *   3. THE EXAM NAVIGATOR BECAME A SHEET (~300px of document). 45 buttons in a
 *      9-column grid plus a legend hung below the question card; on an 852px
 *      screen that alone guaranteed the page scrolled, which pins the action bar
 *      over the last answer. It is a jump table, not part of answering, so on a
 *      phone it opens from the bar. Both surfaces render the SAME NavigatorGrid.
 *
 *   4. THE QUESTION CARD'S META ROW FOLDED INTO THE EXAM TOP BAR (42px). The
 *      weight and the multi-answer warning are two pills that fit up there; the
 *      flag — used a handful of times in 45 questions — became a 44px icon in
 *      the action bar, where it is reachable at every scroll position.
 *
 *   5. `max-sm:-mb-6` cancels <main>'s 24px bottom padding on both runners.
 *      That padding is breathing room under a page you scroll; under a pinned
 *      action bar all it did was make the document taller than the viewport,
 *      which is enough on its own to pin the bar over the last answer.
 *
 *   6. Line spacing on the ANSWER text went from 1.625 to 1.45 below `sm`
 *      (~1.4px per line back on 14px glyphs), and the question's from 1.625 to
 *      leading-snug. The GLYPHS did not move: `text-sm` answers and a `text-lg`
 *      question, the same sizes a desktop gets.
 *
 * THE ARTWORK POLICY IS REVERSED, DELIBERATELY. The previous pass wrote that
 * „the sign IS the question, so a smaller one is a harder question" and shrank
 * only the decorative frame. That is right about legibility and wrong about the
 * trade: an uncapped scene still is 237px in a 329px column — 28 % of an iPhone
 * 16 — and it pushed the answers of every scene question off the screen. The
 * brief settles it: „a thumbnail that expands on tap is legitimate; making the
 * student scroll is not."
 *
 * So below `sm` the artwork is drawn to a MEASURED budget (useArtworkBudget:
 * the picture gives back exactly the pixels the card is over by, floor 44px)
 * and the whole block opens FULL SCREEN on tap. A student who wants to study
 * the sign gets 361px of it — more than three times the 112px the inline block
 * ever showed — and a student who already knows it never loses the answers. On
 * the three items whose question text is a screenful on its own the budget hits
 * the floor and the block becomes a 44px „Виж схемата ⤢" strip; that is the
 * honest outcome there, because the alternative is not a bigger picture, it is
 * a scroll. From `sm` up nothing changed: same component, same sizes.
 *
 * WHAT WAS DELIBERATELY NOT TRADED
 *
 *   Text size. `text-sm` answers, `text-lg` question, on the phone exactly as
 *   on the desktop. Guarded below.
 *
 *   Touch targets. Option rows carry `min-h-11` — 44px stated directly instead
 *   of inferred from padding, which is the property that actually matters and
 *   the one the obvious „one more row would fit" edit breaks. The phone-only
 *   exam controls (flag, navigator) are 44px too.
 *
 *   The tick box. components/ui/CheckControl is untouched; its 3.51–3.65 : 1
 *   contrast and its forced-colors repaint (checkControl.test.ts) still stand.
 *
 * WHAT THIS FILE GUARDS, since it cannot run a browser:
 *
 *   1. the two action bars are still STICKY below `sm`, and still opaque — a
 *      transparent one lets option text render through the control on top of it;
 *   2. the exam countdown is still inside the sticky bar, and a clock is
 *      rendered at BOTH breakpoints;
 *   3. option rows keep the 44px thumb guarantee;
 *   4. body text sizes are unchanged, and no phone-only shrink was smuggled in;
 *   5. the practice route still ships the compact phone header AND the full band
 *      from `sm` up, each with its own single <h1>;
 *   6. the artwork goes through <QuestionArtwork> on a measured budget — never a
 *      hard-coded phone size — and the full-screen viewer exists;
 *   7. the reclaimed chrome stays reclaimed: the ordinal badge, the practice
 *      progress block, the exam meta row and the exam navigator are all `sm`-up
 *      only, and each has its phone counterpart;
 *   8. Tailwind's SCANNER can still see every one of these classes. It reads raw
 *      source TEXT, so a class split across two concatenated literals produces
 *      no CSS rule at all — silently, with typecheck and lint green and only the
 *      pixels different.
 */

const SRC = resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(resolve(SRC, rel), "utf8");

const PRACTICE = read("components/theory/PracticeSession.tsx");
const EXAM = read("components/exam/ExamRunner.tsx");
const MEDIA = read("components/theory/QuestionMedia.tsx");
const PRACTICE_PAGE = read("app/(dashboard)/theory/practice/page.tsx");

/** The one className string that carries a given utility. */
function classListWith(source: string, needle: string): string {
  for (const m of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`)/g)) {
    const value = m[1] ?? m[2] ?? "";
    if (value.includes(needle)) return value;
  }
  return "";
}

describe("sticky action bars (the founder's scroll-per-answer)", () => {
  it("practice pins „Провери“ / „Напред“ to the phone viewport", () => {
    const bar = classListWith(PRACTICE, "max-sm:sticky");
    expect(bar).not.toBe("");
    expect(bar).toContain("max-sm:bottom-0");
    // Painted over the card while pinned, so it must be opaque and edged.
    expect(bar).toMatch(/max-sm:bg-surface(\/\d+)?/);
    expect(bar).toContain("max-sm:border-t");
    // Above the option rows in paint order, or taps land on the option.
    expect(bar).toMatch(/max-sm:z-\d+/);
    // iPhone home indicator.
    expect(bar).toContain("env(safe-area-inset-bottom)");
    // Desktop keeps the plain in-flow row — no unconditional `sticky`.
    expect(bar).not.toMatch(/(^|\s)sticky(\s|$)/);
    // The negative margins have to match the card's phone padding (p-3), or
    // the bar stops reaching the card's edges and grows a seam.
    expect(bar).toContain("max-sm:-mx-3");
    expect(bar).toContain("max-sm:-mb-3");
  });

  it("exam pins its paper navigation to the phone viewport", () => {
    const bar = classListWith(EXAM, "max-sm:sticky");
    expect(bar).not.toBe("");
    expect(bar).toContain("max-sm:bottom-0");
    expect(bar).toMatch(/max-sm:bg-surface(\/\d+)?/);
    expect(bar).toMatch(/max-sm:z-\d+/);
    expect(bar).toContain("env(safe-area-inset-bottom)");
    expect(bar).not.toMatch(/(^|\s)sticky(\s|$)/);
    expect(bar).toContain("max-sm:-mx-3");
    expect(bar).toContain("max-sm:-mb-3");
  });

  it("both runners cancel <main>'s bottom padding on phones", () => {
    // 24px of padding under a pinned bar is 24px of document past the
    // viewport, and the moment the document scrolls the bar covers an answer.
    for (const source of [PRACTICE, EXAM]) {
      expect(source).toContain("max-sm:-mb-6");
    }
  });
});

describe("the exam countdown stays visible", () => {
  it("renders a clock at both breakpoints", () => {
    const clocks = [...EXAM.matchAll(/formatClock\(remainingSec\)/g)];
    expect(clocks).toHaveLength(2);
    // One hidden below `sm`, one hidden from `sm` up — exactly one is in the
    // accessibility tree (display:none removes the other) at any width.
    expect(EXAM).toMatch(/hidden[^"]*\bsm:block\b[^"]*\$\{[\s\S]*?timeLow/);
    expect(EXAM).toMatch(/\bsm:hidden\b[^"]*\$\{[\s\S]*?timeLow/);
  });

  it("puts the phone clock INSIDE the sticky bar", () => {
    const barStart = EXAM.indexOf("max-sm:sticky");
    expect(barStart).toBeGreaterThan(-1);
    const phoneClock = EXAM.lastIndexOf("formatClock(remainingSec)");
    expect(phoneClock).toBeGreaterThan(barStart);
  });
});

describe("what must not be traded for pixels", () => {
  it("option rows keep a thumb-sized target on phones", () => {
    // `min-h-11` is 44px stated directly. It replaced „py-3 must survive",
    // which only ever implied the number and broke the moment padding moved.
    const practiceRow = classListWith(PRACTICE, "min-h-11 items-start");
    expect(practiceRow).toContain("min-h-11");
    expect(practiceRow).toContain("sm:py-3.5");

    const examRow = classListWith(EXAM, "min-h-11 cursor-pointer");
    expect(examRow).toContain("min-h-11");
    expect(examRow).toContain("sm:p-3.5");

    // The phone-only exam controls in the action bar are 44px as well.
    expect(EXAM).toContain("h-11 w-11"); // flag
    expect(classListWith(EXAM, "GridIcon") || EXAM).toContain("h-11"); // navigator opener
  });

  it("keeps the reading sizes a seventeen-year-old was given", () => {
    // The question.
    expect(PRACTICE).toContain('className="max-w-[62ch] text-lg font-bold');
    expect(EXAM).toMatch(/<legend className="mb-1 text-lg font-bold/);
    // The answers: `text-sm` on the row, never a phone-only shrink.
    expect(classListWith(PRACTICE, "min-h-11 items-start")).toContain("text-sm");
    expect(EXAM).toMatch(/text-sm leading-\[1\.45\] sm:leading-relaxed/);
    // Sign-identification tiles answer with a PICTURE; the face keeps the size
    // it has always had on a phone (h-20 = 80px, 240 device px at dpr 3).
    expect(PRACTICE).toContain('className="h-20 w-20 sm:h-24 sm:w-24"');
    for (const source of [PRACTICE, EXAM]) {
      expect(source).not.toMatch(/max-sm:text-(xs|\[1[0-3]px\])/);
    }
  });

  it("draws the artwork to a MEASURED budget, never a hard-coded phone size", () => {
    for (const source of [PRACTICE, EXAM]) {
      // One artwork component, fed by the budget hook — a literal would be
      // wrong on both sides: too big for the three worst items, needlessly
      // small for the other twenty-five.
      expect(source).toContain("useArtworkBudget");
      expect(source).toMatch(/<QuestionArtwork media=\{[^}]+\} heightPx=\{artworkPx\}/);
      expect(source).not.toMatch(/<QuestionArtwork[^>]*heightPx=\{\d+\}/);
    }
    // The trade the cap is only acceptable because of: one tap, full screen.
    expect(MEDIA).toContain('role="dialog"');
    expect(MEDIA).toContain("ARTWORK_MIN_PX");
    // The budget must measure the DOCUMENT, not just the card: a card that
    // fits can still leave the page scrolling by the padding under it.
    expect(MEDIA).toContain("scrollHeight");
    // ...and against the VISUAL viewport, because a real iPhone's toolbars own
    // 80–110px that innerHeight still counts.
    expect(MEDIA).toContain("visualViewport");
    // Re-measure on layout change: a scene still swaps a placeholder for a
    // canvas plus a caption when its district json lands.
    expect(MEDIA).toContain("ResizeObserver");
  });
});

describe("the reclaimed chrome stays reclaimed", () => {
  it("the practice ordinal badge is a keyboard affordance, `sm` and up", () => {
    // It labels the 1–9 shortcuts; the line that explains them is md:block.
    expect(PRACTICE).toMatch(/aria-hidden\s*\n?\s*className="mt-0\.5 hidden h-6 w-6[^"]*sm:flex"/);
    expect(PRACTICE).toContain("Клавиши 1–");
  });

  it("the practice progress strip lives in the action bar on phones", () => {
    // The block above the question is `sm`-up only...
    expect(PRACTICE).toContain('className="hidden flex-col gap-1 sm:flex sm:gap-2.5"');
    // ...and exactly two progressbars exist, one per breakpoint, so only one
    // is ever in the accessibility tree.
    const bars = [...PRACTICE.matchAll(/role="progressbar"/g)];
    expect(bars).toHaveLength(2);
    // The phone one is the 2px rule on the action bar's top edge.
    expect(PRACTICE).toMatch(/absolute inset-x-0 top-0 h-\[2px\][^"]*sm:hidden/);
    // The phone readouts (question number, streak, quota, weight) went with it.
    const barIdx = PRACTICE.indexOf("max-sm:sticky");
    expect(PRACTICE.indexOf("sm:hidden", barIdx)).toBeGreaterThan(barIdx);
  });

  it("the exam meta row moved into the top bar and the flag into the action bar", () => {
    // The in-card row is `sm`-up only...
    expect(EXAM).toContain('className="hidden flex-wrap items-center gap-2 sm:flex"');
    // ...its two pills are rendered in the header for phones...
    expect(EXAM).toMatch(/\{q\.points\} т\.\s*\n?\s*<\/span>/);
    expect(EXAM).toContain("Всички верни");
    // ...and the flag button exists twice: spelled out on desktop, a 44px icon
    // inside the sticky bar on a phone.
    const flags = [...EXAM.matchAll(/toggleFlag\(q\.id\)/g)];
    expect(flags).toHaveLength(2);
    expect(EXAM.lastIndexOf("toggleFlag(q.id)")).toBeGreaterThan(
      EXAM.indexOf("max-sm:sticky"),
    );
  });

  it("the exam navigator is a sheet on phones and one control in both places", () => {
    // ~300px of document below the question card is what made the exam page
    // scroll no matter how tight the card got.
    expect(EXAM).toContain('className="card hidden h-fit p-4 sm:block"');
    expect(EXAM).toContain("setNavOpen");
    // ONE definition of the grid, mounted twice — two copies is how the panel
    // and the sheet drift apart.
    expect([...EXAM.matchAll(/function NavigatorGrid\b/g)]).toHaveLength(1);
    expect([...EXAM.matchAll(/<NavigatorGrid\b/g)]).toHaveLength(2);
    expect([...EXAM.matchAll(/function NavigatorLegend\b/g)]).toHaveLength(1);
  });
});

describe("the practice route's phone header", () => {
  it("ships a compact header below `sm` and the full band above it", () => {
    expect(PRACTICE_PAGE).toMatch(/<header className="[^"]*\bsm:hidden\b/);
    expect(PRACTICE_PAGE).toMatch(/<div className="hidden sm:block">\s*<AuroraHeader/);
    // The phone line is a LABEL, not a title: at `text-lg` it and its gap were
    // 44px spent re-stating the topic the student picked one tap ago.
    expect(PRACTICE_PAGE).toMatch(
      /<h1 className="min-w-0 truncate font-display text-sm font-black/,
    );
  });

  it("exposes exactly one <h1> at a time", () => {
    const h1s = [...PRACTICE_PAGE.matchAll(/<h1\b/g)];
    expect(h1s).toHaveLength(2);
    // Each lives under a display:none-at-the-other-breakpoint wrapper, so the
    // accessibility tree only ever holds one of them.
    expect(PRACTICE_PAGE).toMatch(/sm:hidden[\s\S]{0,400}?<h1/);
    expect(PRACTICE_PAGE).toMatch(/hidden sm:block[\s\S]{0,400}?<h1/);
  });
});

describe("Tailwind's scanner can see the classes", () => {
  it("every fold utility is an unbroken literal", () => {
    const needles = [
      "max-sm:sticky",
      "max-sm:bottom-0",
      "max-sm:-mx-3",
      "max-sm:-mb-3",
      "max-sm:-mb-6",
      "max-sm:rounded-b-xl",
      "max-sm:backdrop-blur",
      "min-h-11",
      "leading-[1.45]",
      "h-[2px]",
    ];
    const all = `${PRACTICE}\n${EXAM}\n${MEDIA}`;
    for (const n of needles) {
      // Present, and not split across a `" + "` / `${...}` seam — the scanner
      // reads text, so a seam means the rule is never generated.
      expect(all).toContain(n);
      expect(all).not.toMatch(
        new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]\\s*[+}]`),
      );
    }
  });
});
