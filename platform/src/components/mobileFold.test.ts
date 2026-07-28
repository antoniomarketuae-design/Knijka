import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE MOBILE FOLD — the practice runner and the exam runner at 390 x 844.
 *
 * WHAT WENT WRONG. Founder review, on his own phone, verbatim: „I open to start
 * Training in any theory questions I see the question and than the answers
 * below in this case 1 2 3 or 4 I have to scroll down to choose the Right
 * answer which is making it very hard to work on the mobile phone" — and „The
 * Exams section is absolutely the same thing." The audience is 17–18-year-olds
 * in Bulgaria who live on phones, so this is not polish: it taxes the single
 * most repeated action in the product (~1 089 practice questions, and a
 * 45-question exam under a 40-minute clock they are scored against).
 *
 * WHERE THE PIXELS WENT. Measured in headless Chromium on the real device
 * profile — 390 x 844, dpr 3, isMobile, hasTouch — against a running dev
 * server, 16 practice questions (smart + „Пътни знаци“ lanes) and 14 exam
 * questions of one paper. A narrow desktop window does NOT reproduce this;
 * isMobile changes viewport-meta handling.
 *
 *   practice, y of the question text        BEFORE 396–424      AFTER 203
 *     · sticky app header                          65                 65
 *     · <main> padding                             24                 24
 *     · page title band (aurora)                  181                 46
 *     · gap under it                               32                 16
 *     · card padding + progress chrome          87–115             36–52
 *
 *   practice, document height              BEFORE 914–1168     AFTER 844–952
 *     (844 = the viewport; the page does not scroll at all)
 *   practice, bottom of the LAST option    BEFORE 777–1031     AFTER 568–830
 *   practice, options below the fold       BEFORE 0–2, in 7 of 16 questions
 *                                           AFTER 0, in 15 of 16 (see below)
 *   practice, bottom of „Провери“          BEFORE 869–1123 — BELOW THE FOLD
 *                                                  ON EVERY SINGLE QUESTION
 *                                           AFTER pinned; always one tap
 *
 *   exam, y of the question text           BEFORE 266–296      AFTER 214–244
 *   exam, document height                  BEFORE 1137–1344    AFTER 1045–1237
 *   exam, bottom of the last option        BEFORE 691–898      AFTER 623–815
 *   exam, options cut by the fold          BEFORE 1, in 4 of 14 questions
 *                                           AFTER 0 of 14 against the viewport
 *   exam, bottom of „Следващ“              BEFORE 762–969 — below the fold on
 *                                                  9 of 14; AFTER pinned
 *   exam, the countdown                    BEFORE scrolled away the moment the
 *                                                 candidate reached the answers
 *                                           AFTER pinned in the footer, visible
 *                                                 at every scroll position
 *
 * THE STICKY FOOTERS ARE PART OF THE MEASUREMENT. They are painted over the
 * card, so an option under one is not tappable and the honest fold is the top
 * of the bar: 779 in practice (a 65px bar), 789 in the exam (a 55px bar).
 * Against that line, 15 of 16 practice questions and 12–13 of 14 exam questions
 * (two papers) are completely clear. The stragglers are the genuinely verbose
 * items — four options of four lines each — which overhang by 12–26px; clearing
 * those would mean shrinking body text, and the students reading it are
 * seventeen.
 *
 * The under-five-minutes warning banner was captured too (it is the state the
 * fold has least room in): compacted below `sm` it costs 62px, and the question
 * plus all four options still land above the bar — with the countdown red and
 * pinned in it, which is where a candidate at 0:01 needs to see it.
 *
 * WHAT WAS DELIBERATELY NOT TRADED
 *
 *   Text size. The option text is `text-sm` and the question `text-lg` on the
 *   phone exactly as on the desktop. Every pixel above came from chrome,
 *   padding and gaps.
 *
 *   Touch targets. Option rows went from py-3.5 to py-3 below `sm`; a
 *   single-line row is still 52px (practice) / 49px (exam) tall, over the 44px
 *   floor. Guarded below.
 *
 *   The artwork. 63 of 1 089 questions carry a sign face or a top-down scene
 *   and 18 more answer with sign pictures — the picture IS the question there,
 *   so a smaller one is a HARDER question, not a smaller one. The runners shrink
 *   the decorative FRAME (p-4 to p-2.5, 30px) and leave the artwork at full
 *   size: a captured sign question measures 134px of media block and still
 *   lands question + all four options + „Провери“ on one screen. Tap-to-enlarge
 *   was considered and rejected — it would add a modal to the most repeated
 *   loop in the product to buy pixels for 6% of the bank that no longer need
 *   them.
 *
 *   The tick box. components/ui/CheckControl is untouched; its contrast and
 *   forced-colors numbers (checkControl.test.ts) still stand. Both runners were
 *   re-captured under `forced-colors: active` after this change: the new sticky
 *   bars render on an opaque Canvas with a real top border, so nothing bleeds
 *   through them.
 *
 * WHAT THIS FILE GUARDS, since it cannot run a browser:
 *
 *   1. the two action bars are still STICKY below `sm`, and still opaque — a
 *      transparent one lets option text render through the control that sits
 *      on top of it;
 *   2. the exam countdown is still inside the sticky bar, so it cannot scroll
 *      away again, and a clock is rendered at BOTH breakpoints;
 *   3. option rows keep the mobile padding that clears 44px — the obvious next
 *      "one more row would fit" edit is the one that breaks the thumb;
 *   4. body text sizes are unchanged;
 *   5. the practice route still ships the compact phone header AND the full
 *      band from `sm` up, each with its own single <h1>;
 *   6. the runners never pass a size utility to QuestionMediaView — the frame
 *      may shrink on a phone, the artwork may not;
 *   7. Tailwind's SCANNER can still see every one of these classes. It reads
 *      raw source text, so a class split across two concatenated literals
 *      produces no CSS rule at all — silently, with typecheck and lint green
 *      and only the pixels different.
 */

const SRC = resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(resolve(SRC, rel), "utf8");

const PRACTICE = read("components/theory/PracticeSession.tsx");
const EXAM = read("components/exam/ExamRunner.tsx");
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
  });

  it("exam pins „Предишен“ / „Следващ“ to the phone viewport", () => {
    const bar = classListWith(EXAM, "max-sm:sticky");
    expect(bar).not.toBe("");
    expect(bar).toContain("max-sm:bottom-0");
    expect(bar).toMatch(/max-sm:bg-surface(\/\d+)?/);
    expect(bar).toMatch(/max-sm:z-\d+/);
    expect(bar).toContain("env(safe-area-inset-bottom)");
    expect(bar).not.toMatch(/(^|\s)sticky(\s|$)/);
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
    // 12px padding + a 20px line + 2px border = 46px at one line; both runners
    // used to be 14px and the desktop still is. Anything smaller is a miss.
    const practiceRow = classListWith(PRACTICE, "px-4 py-3 text-sm");
    expect(practiceRow).toContain("py-3 ");
    expect(practiceRow).toContain("sm:py-3.5");
    expect(practiceRow).not.toMatch(/(^|\s)py-(0|1|1\.5|2|2\.5)(\s|$)/);

    const examRow = classListWith(EXAM, "cursor-pointer items-start");
    expect(examRow).toContain("py-3 ");
    expect(examRow).toContain("sm:p-3.5");
    expect(examRow).not.toMatch(/(^|\s)py-(0|1|1\.5|2|2\.5)(\s|$)/);
  });

  it("keeps the reading sizes a seventeen-year-old was given", () => {
    // The question.
    expect(PRACTICE).toContain('className="max-w-[62ch] text-lg font-bold');
    expect(EXAM).toMatch(/<legend className="mb-1 text-lg font-bold/);
    // The answers: `text-sm` on the row, never a phone-only shrink.
    expect(classListWith(PRACTICE, "px-4 py-3 text-sm")).toContain("text-sm");
    // Sign-identification tiles answer with a PICTURE; the face keeps the size
    // it has always had on a phone (h-20 = 80px, 240 device px at dpr 3).
    expect(PRACTICE).toContain('className="h-20 w-20 sm:h-24 sm:w-24"');
    for (const source of [PRACTICE, EXAM]) {
      expect(source).not.toMatch(/max-sm:text-(xs|\[1[0-3]px\])/);
    }
  });

  it("never shrinks the question artwork on a phone — only its frame", () => {
    for (const source of [PRACTICE, EXAM]) {
      const media = source.match(/<QuestionMediaView[\s\S]{0,200}?\/>/g) ?? [];
      expect(media.length).toBeGreaterThan(0);
      for (const tag of media) {
        // A padding class is the whole licence: no h-*, w-*, size-*, scale-*
        // or max-w-* may reach the sign face or the scene canvas.
        expect(tag).not.toMatch(/className="[^"]*\b(max-)?sm:?[^"]*\b(h|w|size|scale|max-w)-/);
      }
    }
  });
});

describe("the practice route's phone header", () => {
  it("ships a compact header below `sm` and the full band above it", () => {
    expect(PRACTICE_PAGE).toMatch(/<header className="[^"]*\bsm:hidden\b/);
    expect(PRACTICE_PAGE).toMatch(/<div className="hidden sm:block">\s*<AuroraHeader/);
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
      "max-sm:-mx-4",
      "max-sm:-mb-4",
      "max-sm:rounded-b-xl",
      "max-sm:backdrop-blur",
      "max-sm:p-2.5",
    ];
    const both = `${PRACTICE}\n${EXAM}`;
    for (const n of needles) {
      // Present, and not split across a `" + "` / `${...}` seam — the scanner
      // reads text, so a seam means the rule is never generated.
      expect(both).toContain(n);
      expect(both).not.toMatch(
        new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]\\s*[+}]`),
      );
    }
  });
});
