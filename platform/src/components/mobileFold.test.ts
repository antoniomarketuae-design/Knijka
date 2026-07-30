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
 * THE PHONE HELD SIDEWAYS — 852 x 393, re-measured, and NOT clean either.
 *
 *   Every `max-sm:` above is a WIDTH test, and a landscape iPhone is 852px wide,
 *   so it was being served the DESKTOP layout into 393px of height. Founder
 *   review row C5: 479px of scroll, options overflowing by 334px, not one answer
 *   on the screen. Four separate places read „wide" as „roomy" and all four are
 *   fixed: the page's header swap, the card's own paddings and option list, the
 *   app topbar's height, and — one level down — <QuestionArtwork>, whose height
 *   budget switched itself OFF at `(min-width: 640px)` and so drew the full
 *   150px cap on the shortest screen the product has.
 *
 *   Where that leaves it (fold rig, WebKit, 852x393, fold = top of the pinned
 *   bar). An ordinary dealt question: 0px of scroll, every option and „Провери"
 *   on screen. The eighteen HEAVIEST items in the bank: six are clean, twelve
 *   need 22–104px of document scroll and on six of those an option sits 4–79px
 *   under the action bar. Worst: q-krastovishta-029 (the longest question text
 *   in the bank under a scene still) at 79px, and q-vehicle-063 (six options) at
 *   67px.
 *
 *   That residual is a real limit, not an oversight. 393px of height minus a
 *   48px app topbar leaves 345px for a 284-character question, six answers and a
 *   44px action bar, and the only things left to trade are the 18px question and
 *   the 14px answers — the two things this file exists to say were not traded.
 *   The next lever, measured, is the app topbar: hiding it on the runner in
 *   landscape returns 48px and would clear nine of the twelve. It also removes
 *   the only navigation on the screen, so it is a product decision, not a
 *   layout one.
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
    // The negative margins have to match the card's phone padding, or the bar
    // stops reaching the card's edges and grows a seam. That padding is now
    // `p-3 px-4` on a phone — the card went full bleed, so the horizontal half
    // is 16px and the vertical half is still 12px.
    expect(bar).toContain("max-sm:-mx-4");
    expect(bar).toContain("max-sm:-mb-3");
    // And it sits at the BOTTOM of a card that now reaches the bottom of the
    // screen: `mt-auto` in a flex column is what puts „Провери" in the thumb
    // zone instead of halfway up the phone.
    expect(bar).toContain("max-sm:mt-auto");
  });

  it("pins the same bar on a phone held SIDEWAYS", () => {
    // 852 x 393 is not a desktop. Every `max-sm:` above is a WIDTH test and
    // matches nothing in landscape, which is how the runner ended up serving
    // its desktop layout into 393px of height: 520px of scroll and not one
    // answer option on the screen (measured, WebKit).
    const bar = classListWith(PRACTICE, "short:sticky");
    expect(bar).not.toBe("");
    for (const utility of [
      "short:bottom-0",
      "short:-mx-4",
      "short:-mb-3",
      "short:mt-auto",
      "short:border-t",
      "short:bg-surface/95",
      "env(safe-area-inset-bottom)",
    ]) {
      expect(bar).toContain(utility);
    }
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
    const badge = classListWith(PRACTICE, "mt-0.5 hidden h-6 w-6");
    expect(badge).toContain("sm:flex");
    // …and OFF on a landscape phone, which is wide enough to trip `sm` and has
    // no keyboard either. It is 24px of horizontal furniture in the orientation
    // where the option list runs two columns wide.
    expect(badge).toContain("short:hidden");
    expect(PRACTICE).toContain("Клавиши 1–");
  });

  it("the practice progress strip lives in the action bar on phones", () => {
    // The block above the question is `sm`-up only, and `short:hidden` sends it
    // back into the bar on a landscape phone, which `sm:` alone reads as a
    // desktop.
    expect(PRACTICE).toContain(
      'className="hidden flex-col gap-1 short:hidden sm:flex sm:gap-2.5"',
    );
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
  it("picks its header by BOTH dimensions, not by width alone", () => {
    // THE DEFECT THIS REPLACED. The swap used to be `sm:hidden` / `hidden
    // sm:block`, which is a WIDTH test — and an iPhone 16 held sideways is
    // 852 x 393, so it passed for „desktop" and got the full aurora band:
    // measured in WebKit, the band filled the entire 393px screen on its own
    // and the question card started below the bottom edge. 520px of scroll.
    //
    // Each variant is ONE media query carrying both conditions. The obvious
    // spelling, `max-sm:tall:`, compiled to no rule at all in this Tailwind and
    // the header silently vanished on a portrait phone — so the composed form
    // is the thing under test, not an implementation detail.
    expect(PRACTICE_PAGE).toMatch(/<header className="[^"]*\bnarrow-tall:flex\b/);
    expect(PRACTICE_PAGE).toMatch(
      /<div className="hidden wide-tall:block">\s*<AuroraHeader/,
    );
    // The phone line is a LABEL, not a title: at `text-lg` it and its gap were
    // 44px spent re-stating the topic the student picked one tap ago.
    expect(PRACTICE_PAGE).toMatch(
      /<h1 className="min-w-0 truncate font-display text-sm font-black/,
    );
  });

  it("never exposes two <h1>s, and gives a landscape phone neither header", () => {
    const h1s = [...PRACTICE_PAGE.matchAll(/<h1\b/g)];
    expect(h1s).toHaveLength(2);
    // Each lives under a wrapper that is display:none for the other viewport,
    // and the two conditions are mutually exclusive by construction (narrow vs
    // wide), so the accessibility tree never holds both.
    expect(PRACTICE_PAGE).toMatch(/narrow-tall:flex[\s\S]{0,700}?<h1/);
    expect(PRACTICE_PAGE).toMatch(/hidden wide-tall:block[\s\S]{0,400}?<h1/);
    // A landscape phone matches NEITHER, deliberately: the app topbar is
    // already 12.2% of that screen and a 28px title row on top of it puts the
    // question card under the founder's 85%. The way back is not dropped with
    // it — the runner puts a 44px „← Теми" in the action bar for exactly that
    // viewport, and this is the pin that keeps the two edits together.
    expect(PRACTICE).toMatch(/short:inline-flex[\s\S]{0,80}?← Теми/);
  });
});

describe("Tailwind's scanner can see the classes", () => {
  it("every fold utility is an unbroken literal", () => {
    const needles = [
      "max-sm:sticky",
      "max-sm:bottom-0",
      "max-sm:-mx-4",
      "max-sm:-mb-3",
      "max-sm:-mb-6",
      "max-sm:mt-auto",
      "max-sm:backdrop-blur",
      "min-h-11",
      "leading-[1.45]",
      "h-[2px]",
      // The landscape set. These are the ones a „tidy the classes" pass is
      // most likely to eat, and losing any of them puts the answers back
      // under the fold on a phone held sideways with everything still green.
      "short:sticky",
      "short:mt-auto",
      "short:flex-1",
      "short:sm:grid-cols-2",
      "narrow-tall:flex",
      "wide-tall:block",
    ];
    const all = `${PRACTICE}\n${EXAM}\n${MEDIA}\n${PRACTICE_PAGE}`;
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
