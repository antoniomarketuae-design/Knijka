/**
 * THE U-TURN'S CORRECTIVE — ON EVERY SURFACE THAT PRINTS ONE
 * (sc-mv-uturn-ban:6d60c160, «the debrief explains overtaking after a U-turn»).
 *
 * `correctiveBg` used to be read BY CODE at display time on every surface, so a
 * repair that taught the debrief text to speak of the U-turn would have left
 * the fault card a few centimetres above it still advising «Изпреварвай или
 * заобикаляй чак където линията стане прекъсната» — two answers to one mistake
 * on one screen, the shape `session-end-ledger-close.test.tsx` exists to catch
 * for numbers. This file is the same check for the advice. It renders THE
 * SCREEN (not the card alone — the card takes the string as a prop and can only
 * ever repeat what it is handed), and then the stored-drive reader:
 *
 *   · «Грешки» on the result screen     hud/SessionEndScreen.tsx
 *   · «Твоят дубъл» replay markers      traces/attemptReel.ts
 * („История на сесиите" — app/(dashboard)/simulator/historyMistakes.ts — is the
 * third reader and is pinned beside its own code, in historyMistakes.test.ts:
 * a module test may not import from app/.)
 *
 * BOTH DIRECTIONS on each: the act gets its own corrective, and the bare event
 * (an overtake across the same line) keeps the pooled one — it is the right
 * advice for that act and must not be lost to this repair.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildDebrief, lessonById, type LessonResult } from "../../lessons";
import { VIOLATIONS, actCopy, buildSessionSummary, makeViolation, type ViolationEvent } from "../../rules";
import { buildAttemptReel } from "../../traces/attemptReel";
import { TRACE_VERSION, type ScenarioTrace, type TraceSample } from "../../traces/types";
import { SessionEndScreen } from "../SessionEndScreen";

/** The act selector, as a literal — red on an assertion where the act is absent. */
const UTURN = "u-turn";
const POOLED = VIOLATIONS.CROSSED_SOLID_LINE.correctiveBg;
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй/u;
const actCorrective = (): string =>
  (actCopy("CROSSED_SOLID_LINE", UTURN) as { correctiveBg?: string } | null)?.correctiveBg ?? "";

const l0 = lessonById("l0-free-drive")!;

function resultOf(mistakes: ViolationEvent[]): LessonResult {
  const summary = buildSessionSummary(mistakes);
  return {
    lessonId: l0.id,
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 90,
  };
}

function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The «Грешки» section of the real screen, as text. Throws rather than
 *  returning "" — a probe that misses quietly turns „not on the screen" into a
 *  pass. */
function faultsSection(result: LessonResult): string {
  const markup = renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Тестов урок"
      result={result}
      debriefText={buildDebrief(l0, result).text}
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
  const open = markup.indexOf('<section aria-label="Грешки"');
  if (open < 0) throw new Error('no <section aria-label="Грешки"> on the screen');
  const close = markup.indexOf("</section>", open);
  if (close < 0) throw new Error("unterminated Грешки section");
  const text = textOf(markup.slice(open, close));
  if (text === "") throw new Error("Грешки rendered empty");
  return text;
}

describe("the act corrective exists and is not the pooled one (the premise of this file)", () => {
  it("is authored, names the U-turn, and differs from the overtaking advice", () => {
    expect(actCorrective()).toMatch(/Обратен завой/u);
    expect(actCorrective()).not.toMatch(OVERTAKING_ADVICE);
    expect(POOLED).toMatch(OVERTAKING_ADVICE);
  });
});

describe("«Грешки» on the result screen", () => {
  it("a U-turn across the solid line → the card's ✔ line is the U-turn's corrective", () => {
    const section = faultsSection(resultOf([makeViolation("CROSSED_SOLID_LINE", 20.3, { detail: UTURN })]));
    expect(section).toContain("Обратен завой през непрекъсната осева линия");
    expect(section).toContain(`✔ Правилното действие: ${actCorrective()}`);
    expect(section).not.toMatch(OVERTAKING_ADVICE);
  });

  it("the bare crossing (an overtake) → still the pooled corrective", () => {
    const section = faultsSection(resultOf([makeViolation("CROSSED_SOLID_LINE", 20.3)]));
    expect(section).toContain(VIOLATIONS.CROSSED_SOLID_LINE.titleBg);
    expect(section).toContain(`✔ Правилното действие: ${POOLED}`);
  });

  it("the screen and the debrief beside it give ONE piece of advice for the act", () => {
    const result = resultOf([makeViolation("CROSSED_SOLID_LINE", 20.3, { detail: UTURN })]);
    const debrief = buildDebrief(l0, result).text;
    expect(debrief).toContain(`→ Правилното действие: ${actCorrective()}`);
    expect(debrief).not.toMatch(OVERTAKING_ADVICE);
    expect(faultsSection(result)).toContain(actCorrective());
  });
});

describe("«Грешки» — the crossing billed with the body astride the line (round 3: the act `astride`)", () => {
  // The straddle differs from the bare crossing in ONE sentence — what the car
  // did — and in nothing a surface prints as advice: the title and the
  // corrective are the crossing's own, on the screen and in the debrief alike.
  const ASTRIDE = "astride";
  const astride = () => makeViolation("CROSSED_SOLID_LINE", 20.3, { detail: ASTRIDE });

  it("the card carries the crossing's title and the POOLED corrective — never the U-turn's", () => {
    const section = faultsSection(resultOf([astride()]));
    expect(section).toContain(VIOLATIONS.CROSSED_SOLID_LINE.titleBg);
    expect(section).toContain(`✔ Правилното действие: ${POOLED}`);
    expect(section).not.toContain("Обратен завой");
  });

  it("…and its reason is the straddle's: «Застъпи …», with no «изцяло» anywhere on the card or in the debrief beside it", () => {
    const result = resultOf([astride()]);
    const section = faultsSection(result);
    const debrief = buildDebrief(l0, result).text;
    for (const text of [section, debrief]) {
      expect(text).toContain("Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил");
      expect(text).not.toContain("изцяло");
    }
    expect(debrief).toContain(`→ Правилното действие: ${POOLED}`);
    // The bare crossing beside it still says «изцяло» — the pooled row did not move.
    expect(faultsSection(resultOf([makeViolation("CROSSED_SOLID_LINE", 20.3)]))).toContain("Пресече изцяло");
  });
});

describe("«Учебни моменти» — the coached row (the THEO-3 sandbox, and any lesson where the act is not the target)", () => {
  // The lesson's-own-mistake block is pinned by the witness. This is the OTHER
  // coached channel: rows the score did not charge and the lesson does not own
  // (`debrief.ts coachedLines`). It read its corrective by code as well, so in
  // „Направи грешката" — where every violation is coached and none is a target —
  // the U-turn would still have been answered with the overtaking advice.
  const coachedRow = (detail?: string) => {
    const e = makeViolation("CROSSED_SOLID_LINE", 20.3, detail !== undefined ? { detail } : {});
    return { code: e.code, titleBg: e.titleBg, t: e.t, ...(detail !== undefined ? { detail } : {}) };
  };
  const debriefOf = (detail?: string): string =>
    buildDebrief(l0, resultOf([]), { coachedMistakes: [coachedRow(detail)] }).text;

  it("the coached U-turn is given the U-turn's corrective", () => {
    const text = debriefOf(UTURN);
    expect(text).toContain("Учебни моменти");
    expect(text).toContain("• Обратен завой през непрекъсната осева линия");
    expect(text).toContain(`  → Правилното действие: ${actCorrective()}`);
    expect(text).not.toMatch(OVERTAKING_ADVICE);
  });

  it("the coached bare crossing keeps the pooled corrective", () => {
    const text = debriefOf();
    expect(text).toContain(`• ${VIOLATIONS.CROSSED_SOLID_LINE.titleBg}`);
    expect(text).toContain(`  → Правилното действие: ${POOLED}`);
  });
});

describe("«Твоят дубъл» — the replay marker", () => {
  function straightTrace(): ScenarioTrace {
    const samples: TraceSample[] = [];
    for (let i = 0; i <= 30 * 20; i++) {
      const tSec = i / 20;
      samples.push({
        tSec,
        x: 0,
        y: 10 * tSec,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: 36,
        gear: 1,
        indicator: "off",
        brakeOn: false,
        throttleOn: true,
      });
    }
    return {
      meta: { scenarioId: "sc-mv-uturn-ban", kind: "attempt", version: TRACE_VERSION, durationSec: 30 },
      samples,
      events: [],
    };
  }
  const stored = (detail?: string) => {
    const e = makeViolation("CROSSED_SOLID_LINE", 20.3, detail !== undefined ? { detail } : {});
    return { ...e };
  };

  it("carries the U-turn's corrective beside the U-turn's title", () => {
    const reel = buildAttemptReel(straightTrace(), [stored(UTURN)]);
    expect(reel.faults).toHaveLength(1);
    expect(reel.faults[0].titleBg).toBe("Обратен завой през непрекъсната осева линия");
    expect(reel.faults[0].correctiveBg).toBe(actCorrective());
  });

  it("carries the pooled corrective for the bare crossing", () => {
    const reel = buildAttemptReel(straightTrace(), [stored()]);
    expect(reel.faults[0].correctiveBg).toBe(POOLED);
  });
});
