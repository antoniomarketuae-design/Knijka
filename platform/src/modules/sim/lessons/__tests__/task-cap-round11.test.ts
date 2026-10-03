/**
 * THE TASK CEILING, ROUND 11 — the lesson engine: what the student is shown and
 * charged, on the witnesses of `rules/__tests__/task-cap-round11.test.ts`
 * (`rules/__tests__/taskCapWitnesses11.ts`).
 *
 * The verifiers drive their witnesses through a REAL lesson session so the coach
 * decides teach or charge: a compiled L1 lesson with NO capped objective
 * (`sc-follow-brake`), so `stepTaskCapLatch` stamps nothing and the tick's own
 * task-cap fields reach the reducer unchanged.
 *
 * A · F1: no free TASK or weather card from a flag no current owner explains
 *     (ST2, ESC_T, ESC_C).
 * B · W11 / W8 / W17: the later blow's stretch charges nothing (W11), the
 *     absorbed act's stretch after a lapse adds no coached row (W8, W17A).
 * C · the census's two classes: one act, one bill — SAME_FRAME charges no task
 *     point on the topic the weather just taught; STRETCH_SPEEDING shows no task
 *     card beside the speeding; STRETCH_TWICE teaches once and charges nothing;
 *     END_SPEEDING_BLOW (the resumed lane's SF4) — a drive ending on the frame the
 *     speeding's first bill and a later sign-bound blow share adds no TASK card,
 *     coached row or charge beside the speeding.
 *
 * Cases marked RED-ON-R10 were run RED on round 10's engine; RED-ON-R11-FIRST-CUT
 * on the first round-11 cut's engine.
 *
 * ROUND 12 (F-STRETCH, `lessons/__tests__/task-cap-round12.test.ts`, disclosed): a waiting sign-bound arrival is
 * billed on its latch's first stamp. ST2's and W17A's ≤50 arrival therefore leaves ONE coached row, a free surfaced
 * card at its stamp (5.5: a new breach after the weather owner's lapse, never charged); STRETCH_SPEEDING teaches the
 * task at its stamp (1.0) and the speeding co-bills at 6.6; STRETCH_TWICE teaches once, at the stamp (1.1). Each
 * test below states the round-12 outcome and keeps the property it was written for.
 *
 * ROUND 14 — RETIRED HERE: 8 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { CENSUS, NEW, ST, W11, W17A, W8_FOG70 } from "../../rules/__tests__/taskCapWitnesses11";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState } from "../types";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";

const UNCAPPED = "sc-follow-brake";
interface Seen {
  score: number;
  mistakes: string[];
  coached: string[];
  cards: string[];
}
function session(f: SimTick[]): Seen {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED);
  if (spec === undefined) throw new Error(`no template ${UNCAPPED}`);
  let s: LessonSessionState = createLessonSession(compileScenario(spec, 1));
  const cards: string[] = [];
  for (const x of f) {
    const r = applyTick(s, x);
    s = r.state;
    for (const m of r.teachMoments ?? []) cards.push(`${m.code}@${m.t}${m.charged === true ? ":CHARGED" : ":teach"}`);
  }
  const ended = s.phase === "driving" || s.phase === "preDrive" ? finishSession(s, f[f.length - 1].t) : s;
  const res = buildLessonResult(ended);
  return {
    score: res.score,
    mistakes: res.summary.mistakes.map((m) => `${m.code}@${m.t.toFixed(2)}|${m.points}`),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    cards,
  };
}
const task = (xs: string[]) => xs.filter((x) => x.startsWith(TASK));

describe("the harness is what the verifiers drove", () => {
  it(`${UNCAPPED} L1 is a non-exam lesson with NO capped objective`, () => {
    const l = compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED)!, 1);
    expect(l.examMode).toBeFalsy();
    expect(l.objectives.every((o) => (o.params as { maxSpeedKmh?: number }).maxSpeedKmh === undefined)).toBe(true);
  });
});

describe("A · F1 — no free card from a flag no current owner explains", () => {
  for (const [name, surfT] of [["ESC_T", 5]] as const) {
  }
  it("RED-ON-R10 · ESC_C — the weather breach inside the bend-owned act adds no weather card or coached row", () => {
    const seen = session(NEW.ESC_C);
    expect(seen.cards.filter((x) => x.startsWith(COND))).toEqual([]);
    expect(seen.coached.filter((x) => x.startsWith(COND))).toEqual([]);
  });
});

// ROUND 14: «B · W11, W8, W17 — the absorbed act's latches show and charge nothing» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

describe("C · the census's classes — one act, one bill, whatever the order", () => {
  it("STRETCH_SPEEDING — ROUND 12 REVERSES round 11 here (F-STRETCH, disclosed): the task is taught at its stamp (1.0), one frame after the blow, and the speeding at 6.6 is taught on its own topic beside it («TWO LAWS, TWO BILLS» after the stamp). Nothing is charged", () => {
    const seen = session(CENSUS.STRETCH_SPEEDING);
    expect(task(seen.cards)).toEqual([`${TASK}@1:teach`]);
    // Both taught: the task on its card at 1.0; the speeding 5.6 s later inside the pause gap, so as its toast — both rows.
    expect(seen.coached).toEqual([`${TASK}@1.00`, "SPEEDING_OVER_LIMIT@6.60"]);
    expect(seen.score).toBe(0);
  });
  it("STRETCH_TWICE — two stretches in one M-16 act: the task is taught ONCE and charged nothing. ROUND 12 (F-STRETCH, disclosed): the one teach is at the latch's first stamp (1.1), not the held correction (13.9)", () => {
    const seen = session(CENSUS.STRETCH_TWICE);
    expect(task(seen.cards)).toEqual([`${TASK}@1.1:teach`]);
    expect(task(seen.mistakes)).toEqual([]);
    expect(seen.score).toBe(0);
  });
});
