/**
 * ADR-009 — „Позна ли се?" ON A PRACTICE RUNG (doc 92 §5.9, lane F).
 *
 * THE PROBLEM THIS GATE HAD. It asks «Издържах ли?» and then answers with
 * «Изпитът каза … издържан/неиздържан». Under founder Ruling A a practice drive
 * can now have TWO answers — the изпитен лист, and whether the lesson counted —
 * and this card measures the first one (`calibrationStore.readSessionPassed`
 * reads `sheetRoutePassed`, on purpose: see that file). A student who read his
 * own clean sheet correctly, pressed «Да, издържах», was told he was right, and
 * then met «Не е взет» on the very next screen would reasonably conclude the
 * product cannot count.
 *
 * So the card says, before the answer, WHICH verdict it is asking about, and
 * after the answer it names the second one with the act that caused it.
 *
 * BOTH PROPS DEFAULT TO OFF, and the first test pins that: `app/dev/popup-rig`
 * builds this component's props by hand, and every rung without targets — every
 * exam rung included — must render exactly today's card.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalibrationGate, type CalibrationReveal } from "./CalibrationGate";

const HINT_BG = "Отговори за изпитния лист";
const SQUEEZE_BG = "„Тясно изпреварване на велосипедист“";

/** The reveal the server sends back, with the sheet PASSED — the state this
 *  whole section exists for: right about the exam, lesson still not taken. */
function reveal(extra: Partial<CalibrationReveal> = {}): CalibrationReveal {
  return {
    predictedPoints: 0,
    predictedPass: true,
    actualPoints: 0,
    actualPass: true,
    errorPoints: 0,
    verdict: "accurate",
    verdictAgreed: true,
    titleBg: "Позна се",
    bodyBg: "Прецени изпитния лист точно.",
    ...extra,
  };
}

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

const noop = async (): Promise<null> => null;

describe("the question, before the answer", () => {
  it("adds nothing at all when the lesson has no targets", () => {
    const asked = textOf(
      <CalibrationGate lessonTitleBg="Изпитен маршрут" onSubmit={noop} onResolved={() => {}} />,
    );
    expect(asked).toContain("Издържах ли?");
    expect(asked).not.toContain(HINT_BG);
    expect(asked).not.toContain("не е взет");
  });

  it("says which verdict it is asking about when the rung can end «Не е взет»", () => {
    const asked = textOf(
      <CalibrationGate
        lessonTitleBg="Изпреварване на велосипедист · Ниво 3"
        onSubmit={noop}
        onResolved={() => {}}
        lessonHasTargets
      />,
    );
    expect(asked).toContain(HINT_BG);
    expect(asked).toContain("дали урокът се зачита, ще видиш веднага след това");
  });

  it("leaks nothing about THIS drive while it asks", () => {
    // The one property that makes this mechanic worth anything. `lessonHasTargets`
    // is a fact about the LESSON, known before the ignition; the hint must not
    // acquire a tense that says something happened.
    const asked = textOf(
      <CalibrationGate
        lessonTitleBg="Изпреварване на велосипедист · Ниво 3"
        onSubmit={noop}
        onResolved={() => {}}
        lessonHasTargets
        lessonMistake={{ namesBg: SQUEEZE_BG, one: true }}
      />,
    );
    expect(asked).not.toContain("не е взет");
    expect(asked).not.toContain(SQUEEZE_BG);
    expect(asked).not.toContain("0 наказателни");
  });
});

describe("the reveal, after it", () => {
  it("keeps the two tiles, and adds the lesson verdict beside them", () => {
    const shown = textOf(
      <CalibrationGate
        lessonTitleBg="Изпреварване на велосипедист · Ниво 3"
        onSubmit={noop}
        onResolved={() => {}}
        initialReveal={reveal()}
        lessonMistake={{ namesBg: SQUEEZE_BG, one: true }}
      />,
    );
    // The tiles are untouched and now literally true: this IS what the изпитен
    // лист said.
    expect(shown).toContain("Изпитът каза");
    expect(shown).toContain("издържан");
    expect(shown).toContain(
      `По изпитния лист: издържан. Урокът обаче не е взет — ${SQUEEZE_BG} е грешката, която той учи.`,
    );
  });

  // NAMED FOR THE FLAG, NOT FOR A GUESS ABOUT IT. `actualPass` is
  // `sheetRoutePassed` (summary.passed && completedAll && !aborted), which folds
  // the ROUTE; a verifier measured this branch over all 2,434 authored drives:
  // of the 558 where the prop is non-null, 425 take this arm because the route
  // stopped short and only the remainder for any other reason. The old title,
  // «when the sheet failed too», described a state the client cannot reach here
  // — the failed sheet is gated out upstream (96 drives, prop null).
  it("does not repeat the sheet's verdict when the sheet-and-route flag is false (an unfinished route)", () => {
    const shown = textOf(
      <CalibrationGate
        lessonTitleBg="Изпреварване на велосипедист · Ниво 3"
        onSubmit={noop}
        onResolved={() => {}}
        initialReveal={reveal({ actualPass: false, actualPoints: 12, predictedPass: false })}
        lessonMistake={{ namesBg: SQUEEZE_BG, one: true }}
      />,
    );
    expect(shown).toContain(`Урокът също не е взет — ${SQUEEZE_BG} е грешката, която той учи.`);
    expect(shown).not.toContain("По изпитния лист: издържан");
  });

  it("speaks of several acts in the plural", () => {
    const shown = textOf(
      <CalibrationGate
        lessonTitleBg="Избор на лента"
        onSubmit={noop}
        onResolved={() => {}}
        initialReveal={reveal()}
        lessonMistake={{ namesBg: "„A“ и „B“", one: false }}
      />,
    );
    expect(shown).toContain("са грешките, които той учи");
    expect(shown).not.toContain("е грешката, която той учи");
  });

  it("does not suppress «сгреши и самата присъда» — agreement is about the tile", () => {
    // The student's call was about the изпитен лист and it was wrong about the
    // изпитен лист. Hiding the clause because the lesson also went down would
    // be flattering him for a different question.
    const shown = textOf(
      <CalibrationGate
        lessonTitleBg="Изпреварване на велосипедист · Ниво 3"
        onSubmit={noop}
        onResolved={() => {}}
        initialReveal={reveal({ actualPass: false, predictedPass: true, verdictAgreed: false })}
        lessonMistake={{ namesBg: SQUEEZE_BG, one: true }}
      />,
    );
    expect(shown).toContain("сгреши и самата присъда");
  });

  it("renders today's reveal, word for word, without the prop", () => {
    const shown = textOf(
      <CalibrationGate
        lessonTitleBg="Изпитен маршрут"
        onSubmit={noop}
        onResolved={() => {}}
        initialReveal={reveal()}
      />,
    );
    expect(shown).not.toContain("не е взет");
    // …and not the sentence either half of the new line is built from. (Not a
    // bare «урок»: `EXAM_POINTS_SHORT_NOTE_BG` has always ended «важат за този
    // урок», and it is still printed here.)
    expect(shown).not.toContain("грешката, която той учи");
    expect(shown).not.toContain("По изпитния лист:");
    expect(shown).toContain("Виж пълния резултат");
  });
});
