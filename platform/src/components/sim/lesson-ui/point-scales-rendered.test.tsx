/**
 * THE SURFACES, RENDERED — because the defect was never in the data.
 *
 * `rules/__tests__/point-scales.test.ts` proves the vocabulary is right and
 * scans the source for a bare „т.". Both are necessary and neither is
 * sufficient: the founder's complaint came from LOOKING AT A SCREEN, and the
 * marking behind that screen was correct the whole time. 10 наказателни точки
 * for more than 10 km/h over is exactly приложение № 5, т. 10, б. „в“. What
 * reached his eyes was „−10 т." beside a chip reading „ЗДвП чл. 21, ал. 1" —
 * an unnamed unit next to the wrong article — and he read it as ten points off
 * his licence.
 *
 * So these render the real components with `react-dom/server` and read the
 * markup the way a student reads the card. The teach-moment overlay comes
 * first: it is the screen he meets MINUTES EARLIER than the result screen that
 * was repaired, and it is where his photograph was taken.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TeachMoment } from "@/modules/sim/lessons";
import { POINT_SCALES } from "@/modules/sim/rules";
import { ExamModeCard } from "./ExamModeCard";
import { TeachMomentOverlay } from "./TeachMomentOverlay";
import type { LessonEntryView } from "./types";

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

/** His exact drive: over the limit in town, first encounter, t = 22 s. */
const SPEEDING_AT_22: TeachMoment = {
  code: "SPEEDING_DANGEROUS",
  scenarioId: null,
  titleBg: "Превишена скорост",
  explanationBg:
    "Превиши разрешената скорост с повече от 10 km/h. Спирачният път расте с квадрата на скоростта.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  severity: "opasna",
  points: 10,
  t: 22,
};

describe("the teach-moment card — the screen he met first", () => {
  const roomy = textOf(
    <TeachMomentOverlay moment={SPEEDING_AT_22} remaining={0} onAcknowledge={() => {}} />,
  );

  it("puts the scale on the number he misread", () => {
    // WAS: „−10 т.". „точки" with no qualifier means КОНТРОЛНИ точки.
    expect(roomy).toContain("−10 изпитни т.");
    expect(roomy).not.toMatch(/−\d+ т\./);
  });

  it("names Наредба № 38 as the source of the ten — not ЗДвП чл. 21", () => {
    // THE PHOTOGRAPHED DEFECT. чл. 21 sets the SPEED LIMIT; it is the rule he
    // broke. It does not set a ten-point mark and never did.
    expect(roomy).toContain("Наредба № 38 приложение № 5, т. 10, б. „в“");
    expect(roomy).toContain("правило: ЗДвП чл. 21, ал. 1");
    expect(roomy).toContain("оценка: Наредба № 38");
  });

  it("says out loud that this is not the licence", () => {
    expect(roomy).toContain("НЕ са контролни точки");
  });

  it("still teaches before it grades (THEO-4)", () => {
    // The repair must not have cost the card its reason-giving. The authored
    // WHY and the „first encounter is free" promise are both still there.
    expect(roomy).toContain("Спирачният път расте");
    expect(roomy).toContain("не се брои в резултата");
    expect(roomy).toContain("опасна грешка");
  });

  it("the compact bottom sheet carries the same words, not a shorter verdict", () => {
    // The phone sheet is the one the founder actually drives on. It clamps the
    // explanation; it must not clamp away the unit or the citation.
    const compact = textOf(
      <TeachMomentOverlay
        moment={SPEEDING_AT_22}
        remaining={1}
        onAcknowledge={() => {}}
        compact
      />,
    );
    // Collapsed, the stake is behind „Повече" — but nothing bare leaks either.
    expect(compact).not.toMatch(/−\d+ т\./);
    expect(compact).toContain("правило: ЗДвП чл. 21, ал. 1");
  });

  it("agrees with точка at one point, on every class of fault", () => {
    const minor = textOf(
      <TeachMomentOverlay
        moment={{ ...SPEEDING_AT_22, severity: "vtorostepenna", points: 1 }}
        remaining={0}
        onAcknowledge={() => {}}
      />,
    );
    expect(minor).toContain("−1 изпитна т.");
    expect(minor).toContain("б. „б“");
  });
});

describe("the exam entry card — where the scale should be set before the drive", () => {
  const entry: LessonEntryView = {
    lesson: {
      id: "lx-exam",
      titleBg: "Изпитен маршрут",
      descriptionBg: "Официален формат.",
      conceptIds: [],
      objectives: [],
    } as unknown as LessonEntryView["lesson"],
    unlocked: true,
    passed: false,
    attempts: 2,
    bestScore: 12,
  };

  const card = textOf(
    <ExamModeCard entry={entry} prerequisiteTitleBg={null} onOpen={() => {}} />,
  );

  it("names the unit on both figures it prints", () => {
    expect(card).toContain("9 изпитни т. общо");
    expect(card).toContain("12 изпитни т.");
    expect(card).not.toMatch(/\d+ т\. общо · \d+ т\./);
  });

  it("sets the scale before the student ever sees a deduction", () => {
    expect(card).toContain("НЕ са контролни точки");
  });
});

describe("the four scales never collide in one reader's head", () => {
  it("each scale's note rules out the reading that is not it", () => {
    // A find-and-replace would have labelled all four „изпитни точки", which is
    // exactly as wrong as labelling none of them. The manoeuvre rubric is not
    // law and runs the other way; the micro-quiz is a different exam entirely.
    expect(POINT_SCALES.manoeuvre.sourceBg).toContain("не е закон");
    expect(POINT_SCALES.manoeuvre.noteBg).toContain("ПЕЧЕЛЯТ");
    expect(POINT_SCALES.manoeuvre.noteBg).toContain("Не са наказателни точки по Наредба № 38");
    expect(POINT_SCALES.theory.noteBg).toContain("ТЕОРЕТИЧНИЯ изпит");
    expect(POINT_SCALES.theory.noteBg).toContain("няма нищо общо с наказателните точки");
  });
});
