import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "@/modules/sim/lessons";
import { PRE_DRIVE_STEP_ORDER } from "@/modules/sim/procedures";
import {
  isPassing,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  SEVERITY_POINTS,
} from "@/modules/sim/rules";
import { ExamBriefingCard } from "../ExamBriefingCard";
import { LessonCard } from "../LessonCard";
import type { LessonEntryView } from "../types";

/**
 * THE TWO CARDS THE STUDENT READS BEFORE THE ENGINE EVER GRADES HIM.
 *
 * ── The defect, and why a rendering test is the only kind that catches it ───
 *
 * `ExamBriefingCard` is the examiner's protocol: the screen that tells a
 * seventeen-year-old what is graded and what ends the exam, minutes before the
 * exam grades him. Until this file existed it shipped, under one heading
 * „Кога се прекратява":
 *
 *     опасна грешка — незабавно;
 *     пътнотранспортно произшествие — незабавно;
 *     повече от 9 наказателни точки общо;
 *     повече от 6 наказателни точки от основни грешки.
 *
 * Three of those four are false and the act's other real terminator was absent.
 * `rules/scoring.ts` says so in its own header — „чл. 48, ал. 3 … ends a
 * practical exam in exactly two cases: повторна намеса на комисията, and
 * допускане на ПТП. It is NOT „any опасна" … the candidate keeps driving and
 * the examiner keeps ticking" — and `n38.ts` records the sentence
 * „опасна грешка … прекратява изпита на място" as one the product withdrew.
 *
 * IT SURVIVED BECAUSE THE CORRECTION NEVER REACHED THIS FILE. The withdrawal
 * landed in the catalogue, in `consequences.ts` and in `scales.ts`; this card
 * had 0 commits since the sweep baseline `ec1f56f`. Every existing suite was
 * green throughout, because every existing suite asks the RULES MODULE what the
 * rule is, and the rules module was right the whole time. The wrong sentence
 * was in a JSX literal that nothing rendered and nothing read.
 *
 * So these render the real components with `react-dom/server` and read the
 * markup the way a student reads the card — the pattern
 * `point-scales-rendered.test.tsx` established for exactly this failure, where
 * „the defect was never in the data".
 *
 * ── The direction that must ALSO be checked ─────────────────────────────────
 *
 * A briefing that under-claims is not the safe side of this. Telling a student
 * a ПТП does not end the exam would be the same crime pointing the other way —
 * so the two real terminators are asserted PRESENT, not merely the three false
 * ones asserted absent, and the pass thresholds are asserted to still be stated
 * rather than quietly dropped along with the bad heading.
 */

/** Markup with tags stripped — what a reader actually reads. */
function textOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// ExamBriefingCard — the examiner's protocol
// ---------------------------------------------------------------------------

describe("the exam briefing — what it says ends the exam", () => {
  const card = textOf(
    <ExamBriefingCard
      variantId="EX-1234"
      variantDescriptionBg={null}
      onStart={() => {}}
      onBack={() => {}}
    />,
  );

  it("renders enough to be worth reading (anchor check)", () => {
    // A floor, so a component that throws or returns null cannot make every
    // `not.toContain` below vacuously true — the exact shape of green-because-
    // nothing-rendered this file was written against.
    expect(card.length).toBeGreaterThan(900);
    expect(card).toContain("Преди да потеглиш");
  });

  it("names BOTH terminators the act names — including the one that was missing", () => {
    // чл. 48, ал. 3, first arm. It was on no list on this card at all.
    expect(card).toContain("повторна намеса на комисията");
    // …and the second arm, which was the only true item of the old four.
    expect(card).toMatch(/допускане на пътнотранспортно произшествие/i);
  });

  it("quotes чл. 48, ал. 3 verbatim rather than paraphrasing it", () => {
    // The house rule from `scales.ts`: „quote it, never paraphrase it" —
    // hand-typing is named there as how the over-claim reached four surfaces.
    expect(card).toContain("Практическият изпит се прекратява");
    expect(card).toContain("чл. 48, ал. 3");
  });

  it("no longer tells the student that any опасна грешка ends the exam", () => {
    // THE WITHDRAWN SENTENCE. `n38.ts`: „the product once told students every
    // опасна „прекратява изпита на място" and … this was wrong".
    expect(card).not.toMatch(/опасна грешка\s*[—-]\s*незабавно/);
    // …and the positive half, so this cannot be satisfied by deleting the
    // subject instead of correcting it: the card must SAY that driving goes on.
    expect(card).toMatch(/карането продължава/);
  });

  it("files the 9 and the 6 as the PASS rule, not as terminations", () => {
    // приложение № 5, т. 11 decides издържан/неиздържан; it never stops a car.
    // Conflating the two is, in `n38.ts`' words, „the same class of error as
    // conflating наказателни with контролни точки".
    const terminationHeading = card.indexOf("Кога изпитващият спира изпита");
    const passHeading = card.indexOf("Кога изпитът е неиздържан");
    expect(terminationHeading).toBeGreaterThan(-1);
    expect(passHeading).toBeGreaterThan(terminationHeading);

    const terminationSection = card.slice(terminationHeading, passHeading);
    expect(terminationSection).not.toContain(String(PASS_MAX_TOTAL_POINTS));
    expect(terminationSection).not.toContain(String(PASS_MAX_OSNOVNI_POINTS));

    // …and they are still stated, under the heading that owns them. Dropping a
    // threshold is not an acceptable way to stop mis-filing it.
    const passSection = card.slice(passHeading);
    expect(passSection).toContain(String(PASS_MAX_TOTAL_POINTS));
    expect(passSection).toContain(String(PASS_MAX_OSNOVNI_POINTS));
  });

  it("states each threshold ONCE — the assertions above cannot see a doubled one", () => {
    // MEASURED, BY PRINTING THE CARD AND READING IT. The first version of this
    // block rendered «повече от 9 9 наказателни точки»: `examPointsWordBg`
    // already returns „9 наказателни точки", and the constant was prefixed to
    // it as well. Every `toContain(String(9))` above was green throughout — a
    // doubled 9 contains a 9 twice — which is this project's whole lesson about
    // instruments in one line. Only a negative shape can fail here.
    expect(card).not.toMatch(
      new RegExp(`${PASS_MAX_TOTAL_POINTS}\\s+${PASS_MAX_TOTAL_POINTS}\\b`),
    );
    expect(card).not.toMatch(
      new RegExp(`${PASS_MAX_OSNOVNI_POINTS}\\s+${PASS_MAX_OSNOVNI_POINTS}\\b`),
    );
    expect(card).toContain(`повече от ${PASS_MAX_TOTAL_POINTS} наказателни точки`);
    expect(card).toContain(`повече от ${PASS_MAX_OSNOVNI_POINTS} наказателни точки`);
  });

  it("explains WHY one опасна already fails — the arithmetic, not an assertion", () => {
    // THEO-4: a virtual instructor explains every decision. „10 > 9" is the
    // whole reason the two headings are not in conflict, and it is the thing a
    // student otherwise has to be told twice.
    expect(card).toContain(String(SEVERITY_POINTS.opasna));
    expect(card).toMatch(/една-единствена опасна/);
    // The engine agrees with the sentence: a lone опасна is not passing.
    expect(
      isPassing({
        totalPoints: SEVERITY_POINTS.opasna,
        osnovniPoints: 0,
        vtorostepenniPoints: 0,
        hasDangerous: true,
        violations: [],
        unscoredAfterClose: 0,
        ledgerClosedAtSec: null,
      } as never),
    ).toBe(false);
  });

  it("derives the pre-drive step count instead of typing it", () => {
    expect(card).toContain(`${PRE_DRIVE_STEP_ORDER.length}-те стъпки`);
  });
});

// ---------------------------------------------------------------------------
// LessonCard — the select-screen card
// ---------------------------------------------------------------------------

/** The narrowest spec these assertions need; the card reads nothing else. */
function lessonSpec(over: Partial<LessonSpec> = {}): LessonSpec {
  return {
    id: "l-test",
    order: 3,
    titleBg: "Тест",
    descriptionBg: "Описание.",
    conceptIds: ["c-a", "c-b"],
    objectives: [{ id: "o1", titleBg: "Задача", kind: "reachWaypoint", params: {} }],
    preDrive: true,
    ...over,
  } as unknown as LessonSpec;
}

function entry(over: Partial<LessonEntryView> = {}): LessonEntryView {
  return {
    lesson: lessonSpec(),
    unlocked: true,
    passed: false,
    attempts: 1,
    bestScore: 12,
    ...over,
  };
}

describe("the lesson card — the numbers it states", () => {
  it("renders enough to be worth reading (anchor check)", () => {
    const card = textOf(<LessonCard entry={entry()} onStart={() => {}} />);
    expect(card.length).toBeGreaterThan(60);
    expect(card).toContain("Тест");
  });

  it("prints the pre-drive count the in-drive checklist counts against", () => {
    // `hud/PreDriveChecklist.tsx` renders `{done}/{PRE_DRIVE_STEP_ORDER.length}`.
    // The card used the literal „13" — a second copy of a number with nothing
    // pinning it to the procedure, which is how a card comes to state a figure
    // no other surface agrees with.
    const card = textOf(<LessonCard entry={entry()} onStart={() => {}} />);
    expect(card).toContain(`${PRE_DRIVE_STEP_ORDER.length} стъпки`);
  });

  it("says nothing about preparation when the lesson has none", () => {
    const card = textOf(
      <LessonCard entry={entry({ lesson: lessonSpec({ preDrive: false }) })} onStart={() => {}} />,
    );
    expect(card).not.toContain("подготовка");
  });

  it("puts the ceiling next to «Най-добър», so a failing score reads as one", () => {
    // `bestScore` is PENALTY points. „Най-добър: 12 изпитни т." called a failed
    // drive the student's best, with nothing on screen to work out that 9 is
    // the cap — and this is the card on which he decides whether to re-drive.
    // The house rule for a surface with no room for the т. 11 quote is
    // `scales.ts`' own: say „допустими 9" next to the total.
    const card = textOf(<LessonCard entry={entry({ bestScore: 12 })} onStart={() => {}} />);
    expect(card).toContain(`допустими ${PASS_MAX_TOTAL_POINTS}`);
    expect(isPassing({ totalPoints: 12 } as never)).toBe(false);
  });

  it("does not invent a score before the first attempt", () => {
    // The false-certificate direction: a card that prints a ceiling next to a
    // number the student has not earned yet would be crediting an untaken drive.
    const card = textOf(
      <LessonCard entry={entry({ attempts: 0, bestScore: null })} onStart={() => {}} />,
    );
    expect(card).not.toContain("Най-добър");
    expect(card).not.toContain("допустими");
  });
});
