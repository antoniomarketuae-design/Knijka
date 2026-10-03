/**
 * AN ABORTED DRIVE WHOSE изпитен лист FAILED READS «НЕИЗДЪРЖАН» (task-cap lane,
 * round 9 — the round-8 verifier's N5, mutant Z16).
 *
 * `sessionVerdict` consults the изпитен лист FIRST: «the изпитен лист is the only
 * authority for „Неиздържан"» (SessionEndScreen.tsx). Its `!result.aborted` guard
 * belongs to the ADR-009 arm only — an aborted run has no lesson verdict to give,
 * so a lesson mistake on it stays «Незавършен». The verifier sabotaged the FIRST
 * arm instead (`if (!result.summary.passed && !result.aborted) return "failed"`),
 * so a student who crashed and then quit read «Незавършен» — the word for a clean
 * run that stopped early — over a sheet that had already failed him. It survived
 * the lane suite and the 346-file wide suite: every aborted fixture in the repo
 * had a clean sheet.
 *
 * `renderToStaticMarkup`, as the sibling `session-end-verdict.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation, type ScorableEvent } from "../../rules";
import {
  SCENARIO_TEMPLATES,
  abortSession,
  applyTick,
  buildLessonResult,
  compileScenario,
  createLessonSession,
  type LessonResult,
} from "../../lessons";
import type { SimTick } from "../../rules";
import { SESSION_VERDICT_LABEL_BG, SessionEndScreen, sessionVerdict } from "../SessionEndScreen";

/** A real graded result: the summary is the ENGINE's, never hand-written. */
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
function pillOf(result: LessonResult): string {
  const markup = renderToStaticMarkup(
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
    />,
  );
  const m = markup.match(/<p class="rounded-full px-4 py-1\.5 text-sm font-black uppercase tracking-wide [^"]*">([^<]*)<\/p>/);
  if (m === null) throw new Error("no verdict pill in the markup");
  return m[1];
}

describe("an ABORTED drive whose изпитен лист failed reads «Неиздържан» (Z16)", () => {
  it("a collision, then the student quits: the sheet failed, so the verdict is «Неиздържан» — not «Незавършен»", () => {
    const r = resultOf([makeViolation("COLLISION", 22)], { aborted: true, completedAll: false, passed: false });
    // Not vacuous: the sheet really failed, and the drive really was aborted.
    expect(r.summary.passed).toBe(false);
    expect(r.aborted).toBe(true);
    expect(sessionVerdict(r)).toBe("failed");
    expect(pillOf(r)).toBe(SESSION_VERDICT_LABEL_BG.failed);
    expect(pillOf(r)).toBe("Неиздържан");
  });
  it("the allowance blown (four основни), then quit: «Неиздържан»", () => {
    const r = resultOf(
      [10, 20, 30, 40].map((t) => makeViolation("TURN_WITHOUT_INDICATOR", t)),
      { aborted: true, completedAll: false, passed: false },
    );
    expect(r.summary.passed).toBe(false);
    expect(sessionVerdict(r)).toBe("failed");
  });
  it("GUARD — the partner that must NOT move: an aborted run with a CLEAN sheet stays «Незавършен»", () => {
    const r = resultOf([], { aborted: true, completedAll: false, passed: false });
    expect(r.summary.passed).toBe(true);
    expect(sessionVerdict(r)).toBe("unfinished");
    expect(pillOf(r)).toBe("Незавършен");
  });
  it("a REAL drive: sc-ac-truck-spray L3 in the rain, a collision-free drive whose sheet fails on its own speeding, quit mid-way — the engine's own result reads «Неиздържан»", () => {
    // 130 km/h against the posted 80 of the lesson's approach until the sheet fails, then quit.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ac-truck-spray")!;
    let s = createLessonSession(compileScenario(spec, 3));
    let y = 15;
    let t = 0;
    const tickAt = (tt: number, yy: number, v: number): SimTick => ({
      t: tt,
      speedKmh: v,
      maxSpeedKmh: 80,
      position: { x: 0, y: yy },
      headingDeg: 0,
      laneOffsetM: 0,
      laneId: 0,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      isNight: false,
      rain: true,
      events: [],
    });
    while (s.phase === "driving" && t < 60 && buildLessonResult(s).summary.passed) {
      t = Math.round((t + 0.1) * 10) / 10;
      y += (130 / 3.6) * 0.1;
      s = applyTick(s, tickAt(t, y, 130)).state;
    }
    expect(s.phase).toBe("driving");
    const quit = abortSession(s, t);
    const r = buildLessonResult(quit);
    expect(r.aborted).toBe(true);
    expect(r.summary.passed).toBe(false);
    expect(sessionVerdict(r)).toBe("failed");
    expect(pillOf(r)).toBe("Неиздържан");
  });
});
