import { describe, expect, it } from "vitest";
import { buildSessionSummary } from "../../../rules";
import type { LessonResult } from "../../types";
import { scoreRubric } from "../rubric";
import type { RubricSpec } from "../types";

/**
 * =============================================================================
 * ADR-010 — PAR TIME GATES THE STARS, NEVER THE VERDICT
 * — founder ruling 2026-09-21, registered decision 21, option C.
 * =============================================================================
 *
 * The question was *"May a drive that takes 3.2× the reference time still be
 * ИЗДЪРЖАН with three stars?"* The answer: the verdict stays exactly what
 * Наредба 38 makes it, but a drive that far over the guideline does not collect
 * full marks for the manoeuvre.
 *
 * WHAT THESE CASES ARE FOR. Each one is a guardrail from the ADR, executed:
 * the cap fires above 3×; not at 3×; never on an aborted drive; never counts
 * lawful waiting as slowness; can only WITHHOLD a star, never award one; and it
 * always explains itself on the card. A cap that fired on the reference drives
 * is exactly what got the last one reverted, so the boundary cases matter more
 * than the headline.
 *
 * The copy is pinned by its distinctive phrases, duplicated here rather than
 * imported, for the reason `rubric.test.ts` gives: an assertion that reads the
 * constant it checks can only ever agree with itself.
 */
const OVER_THREE_TIMES = "над три пъти повече";
const SHEET_UNCHANGED = "Изпитният лист не се променя от това";

/** The majority rubric shape — 128 of 162 shipped rubrics author par and nothing else. */
const PAR_ONLY: RubricSpec = { parTimeSec: 60 };

function clean(over: Partial<LessonResult> = {}): LessonResult {
  return {
    lessonId: "sc-test@L1",
    summary: buildSessionSummary([]),
    objectives: [{ id: "a", titleBg: "Стигни края", done: true, completedAtSec: 40 }],
    completedAll: true,
    aborted: false,
    passed: true,
    score: 0,
    effectiveScore: 0,
    escalations: [],
    durationSec: 50,
    ...over,
  };
}

const parRow = (r: ReturnType<typeof scoreRubric>) => r.breakdownBg.find((l) => l.id === "parTime");

describe("ADR-010 — a drive far over the ориентир does not earn full marks", () => {
  it("a clean, finished drive at 3.5× par is held to two stars", () => {
    const r = scoreRubric(clean({ durationSec: 210 }), PAR_ONLY);
    expect(r.stars).toBe(2);
  });

  it("…and the card says why, in the lesson's voice — never a bare star (THEO-4)", () => {
    const r = scoreRubric(clean({ durationSec: 210 }), PAR_ONLY);
    const detail = parRow(r)?.detailBg ?? "";
    expect(detail, "the withheld star is not explained").toContain(OVER_THREE_TIMES);
    expect(detail, "the card no longer says the exam sheet did not move").toContain(SHEET_UNCHANGED);
    expect(detail, "both numbers must stay on the card").toMatch(/210\s*с при ориентир 60\s*с/u);
  });

  it("the founder's own example — 3.2× — is inside the cap, which is why it fires ABOVE 3", () => {
    expect(scoreRubric(clean({ durationSec: 192 }), PAR_ONLY).stars).toBe(2);
  });
});

describe("ADR-010 guardrails — the ways a pace cap goes wrong", () => {
  it("does NOT fire at exactly 3× — the boundary is strict", () => {
    const r = scoreRubric(clean({ durationSec: 180 }), PAR_ONLY);
    expect(r.stars).toBe(3);
    expect(parRow(r)?.detailBg ?? "").not.toContain(OVER_THREE_TIMES);
  });

  it("does NOT fire on an ordinary slow drive — 2.9× keeps full marks", () => {
    expect(scoreRubric(clean({ durationSec: 174 }), PAR_ONLY).stars).toBe(3);
  });

  it("does NOT count waiting for priority as slowness", () => {
    // 200 s on the clock, 150 s of it held at a red: 50 s of driving against a
    // 60 s guideline. Calling that slow would punish the student for obeying.
    const r = scoreRubric(clean({ durationSec: 200, yieldWaitSec: 150 }), PAR_ONLY);
    expect(r.stars).toBe(3);
    expect(parRow(r)?.detailBg ?? "").not.toContain(OVER_THREE_TIMES);
  });

  it("does NOT apply to an aborted drive — a part-driven route is not compared to a whole-lesson guideline", () => {
    const r = scoreRubric(clean({ durationSec: 600, aborted: true, completedAll: false }), PAR_ONLY);
    expect(parRow(r)?.detailBg ?? "").not.toContain(OVER_THREE_TIMES);
  });

  it("can only WITHHOLD a star — it never raises one", () => {
    // A drive that is already held down by legality must not come back up.
    const r = scoreRubric(clean({ durationSec: 210, score: 4, effectiveScore: 4 }), PAR_ONLY);
    expect(r.stars).toBeLessThanOrEqual(2);
  });

  it("fast is still not better — beating the guideline earns nothing extra", () => {
    // PAR_TIME_NOT_A_TARGET_BG stands; the cap is one-sided by construction.
    expect(scoreRubric(clean({ durationSec: 20 }), PAR_ONLY).stars).toBe(3);
  });

  it("never touches the result it grades — the verdict and the sheet are not the rubric's to move", () => {
    const res = clean({ durationSec: 210 });
    const before = JSON.stringify({ score: res.score, passed: res.passed, eff: res.effectiveScore });
    scoreRubric(res, PAR_ONLY);
    expect(JSON.stringify({ score: res.score, passed: res.passed, eff: res.effectiveScore })).toBe(before);
  });

  it("a lesson that authors no ориентир can never be capped", () => {
    const r = scoreRubric(clean({ durationSec: 9999 }), {});
    expect(r.stars).toBe(3);
  });
});
