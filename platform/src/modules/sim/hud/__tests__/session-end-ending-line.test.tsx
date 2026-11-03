/**
 * THE ENDING'S SENTENCE IS ON THE END CARD, ONCE, ON BOTH LENSES — lane
 * endings2, item B (sc-crossing-dart:1c7a07d8 / sc-pk-driveway:7fa8b79e;
 * integrator rulings N2–N4).
 *
 * The engine pushed every ending as a toast on the frame that closed the
 * drive, and no student read it: the phone drops toasts once the drive ends,
 * and the PC end screen opens opaque over the toast column on the same render.
 * The sentence now rides on the result (`LessonResult.ending`) and the verdict
 * card says it under the pill — `data-hud="end-ending"` — with the citation
 * chip when the ending carries one. Not beside an exam termination (the
 * protocol card owns the reason). `renderToStaticMarkup`, as the sibling
 * `session-end-verdict.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary } from "../../rules";
import type { LessonResult } from "../../lessons";
import { SessionEndScreen } from "../SessionEndScreen";

function resultOf(over: Partial<LessonResult> = {}): LessonResult {
  const summary = buildSessionSummary([]);
  return {
    lessonId: "sc-test",
    summary,
    objectives: [{ id: "a", titleBg: "Задача", done: false, completedAtSec: null }],
    completedAll: false,
    aborted: false,
    passed: false,
    score: 0,
    effectiveScore: 0,
    escalations: [],
    durationSec: 90,
    ...over,
  };
}

function render(result: LessonResult, compact: boolean): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Тестов урок"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
      compact={compact}
    />,
  );
}

const lines = (html: string) => [...html.matchAll(/<p data-hud="end-ending"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
const text = (frag: string) => frag.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const PIN = {
  titleBg: "Край на упражнението след удара",
  explanationBg:
    "След удара колата спря до мястото на удара и остана неподвижна, затова урокът приключва тук. Разборът показва как се стига до такъв удар и какво го предотвратява: по-ранно намаляване и готовност да спреш, щом до пътя ти има пешеходец или велосипедист.",
  lawRef: "ЗДвП чл. 123, ал. 1",
};
const GATE2 = {
  titleBg: "Край на изпитния маршрут",
  explanationBg:
    "Колата стоя неподвижно при края на маршрута, но не всички задачи се отчетоха, затова изпитът приключва тук и не е издържан. Разборът показва всяка неизпълнена задача и всяка допусната грешка.",
};

describe("the end card's ending line", () => {
  for (const compact of [false, true]) {
    it(`${compact ? "phone" : "PC"}: the title, the sentence and the citation chip — each exactly once on the screen`, () => {
      const html = render(resultOf({ ending: PIN }), compact);
      const l = lines(html);
      expect(l.length).toBe(1);
      expect(text(l[0])).toBe(`${PIN.titleBg} — ${PIN.explanationBg} ${PIN.lawRef}`);
      expect(count(html, PIN.explanationBg)).toBe(1);
      expect(count(html, PIN.titleBg)).toBe(1);
      expect(count(html, PIN.lawRef)).toBe(1);
    });

    it(`${compact ? "phone" : "PC"}: an ending with no citation renders no chip`, () => {
      const l = lines(render(resultOf({ ending: GATE2 }), compact));
      expect(l.length).toBe(1);
      expect(text(l[0])).toBe(`${GATE2.titleBg} — ${GATE2.explanationBg}`);
      expect(l[0].includes("rounded-full")).toBe(false);
    });

    it(`${compact ? "phone" : "PC"}: CONTROL — no ending, no line`, () => {
      expect(lines(render(resultOf(), compact))).toEqual([]);
    });

    it(`${compact ? "phone" : "PC"}: N4 — beside an exam termination the line is NOT rendered (the protocol card owns the reason)`, () => {
      const html = render(resultOf({ ending: GATE2, examTermination: { reason: "collision", tSec: 12 } }), compact);
      expect(lines(html)).toEqual([]);
      expect(count(html, GATE2.explanationBg)).toBe(0);
    });
  }

  it("sits directly under the verdict pill, above the «Незавършен» account", () => {
    const html = render(resultOf({ ending: GATE2 }), false);
    const at = html.indexOf('data-hud="end-ending"');
    expect(at).toBeGreaterThan(0);
    const pill = html.lastIndexOf("uppercase tracking-wide", at);
    expect(pill).toBeGreaterThan(0);
    // nothing but the pill's own closing tag between the pill and the line
    expect(html.slice(html.indexOf("</p>", pill) + 4, at)).toBe("<p ");
  });

  it("is withheld with the rest of the card while the calibration gate holds the result", () => {
    const html = renderToStaticMarkup(
      <SessionEndScreen
        lessonTitleBg="Тестов урок"
        result={resultOf({ ending: GATE2 })}
        debriefText={null}
        concepts={[]}
        xpEarned={null}
        onRetry={() => undefined}
        onExit={() => undefined}
        nextLessonTitleBg={null}
        onNextLesson={null}
        calibrationGate={<div>gate</div>}
        calibrationLocked
      />,
    );
    expect(lines(html)).toEqual([]);
  });
});
