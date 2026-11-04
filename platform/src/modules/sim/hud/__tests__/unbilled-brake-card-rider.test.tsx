/**
 * THE RESULT CARD'S «Похвали» ROW OVER A BRAKE CHECK THE LEDGER DID NOT BILL
 * (2026-11-01 · `sc-follow-tailgater:63c0c28c`, founder QUESTION 10; the
 * integrator's P4). A CLEAN_DRIVING row that stands on such a drive — a window
 * paid before the brake check, or 250 m after its last pumped / floored frame —
 * carries the SAME rider on the card as on the debrief bullet
 * (`commendationRiderFlags` / `commendationRiderBg`, one derivation, two
 * surfaces). A result without `unbilledHardBrakes` (every stored row from
 * before this lane, every drive without one) paints the card exactly as base.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeCommendation, type ScorableEvent } from "../../rules";
import { buildDebrief, type LessonResult } from "../../lessons";
import { SessionEndScreen } from "../SessionEndScreen";
import type { LessonSpec } from "../../contracts";

function resultOf(events: ScorableEvent[], over: Partial<LessonResult> = {}): LessonResult {
  const summary = buildSessionSummary(events);
  return {
    lessonId: "sc-test",
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 90,
    ...over,
  };
}

function markupOf(result: LessonResult): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Лепка отзад"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
}

const RIDER =
  "но само на отделни отсечки от маршрута: в същия урок имаше рязко спиране, за което симулаторът не видя причина. " +
  "Похвалата е за отсечките без него, не за урока — „чисто каране“ се брои чак когато ЦЯЛОТО каране е такова.";
const PUMP = { form: "pumped" as const, sinceSec: 26.33, atSec: 26.92, shownKmh: 24.43, onsetKmh: 23.87, sustainSec: 0.4, floorKmh: 35 };
const LESSON = { id: "sc-test", titleBg: "Лепка отзад", objectives: [] } as unknown as LessonSpec;

describe("the «Похвали» card row and the debrief bullet carry one rider", () => {
  const clean = makeCommendation("CLEAN_DRIVING", 12.5) as ScorableEvent;

  it("a CLEAN_DRIVING row on a drive carrying a pumped record: the card's row and the bullet both carry the brake-check rider", () => {
    const r = resultOf([clean], { unbilledHardBrakes: [PUMP] });
    const html = markupOf(r);
    expect(html).toContain(RIDER);
    const text = buildDebrief(LESSON, r).text;
    expect(text).toContain(`• Чисто и спокойно каране — ${RIDER}`);
  });

  it("the SAME row without the field (a stored row from before the lane): the card and the bullet are unscoped, as at base", () => {
    const r = resultOf([clean]);
    expect(markupOf(r)).not.toContain("но само на отделни отсечки");
    expect(buildDebrief(LESSON, r).text).toMatch(/Какво се получи добре:\n• Чисто и спокойно каране(\n|$)/u);
  });

  it("two records: the rider counts them and agrees in number", () => {
    const r = resultOf([clean], { unbilledHardBrakes: [PUMP, { ...PUMP, sinceSec: 40, atSec: 40.5 }] });
    expect(markupOf(r)).toContain("в същия урок имаше 2 рязки спирания, за които симулаторът не видя причина. Похвалата е за отсечките без тях");
  });
});
