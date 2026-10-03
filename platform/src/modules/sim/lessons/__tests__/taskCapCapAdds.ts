/**
 * THE TASK CEILING, ROUND 14 — «CAP ADDS, NEVER REMOVES» THROUGH A REAL LESSON SESSION (not a test file).
 *
 * FOUNDER RULING 2026-10-03, verbatim: «Cap adds, never removes. The task cap is an extra rule on top. Its bill stands
 * on its own; the bend/weather bills are charged exactly as they would be in a lesson with no cap. Blowing the cap can
 * only add, never lower the score, and order never matters.»
 *
 * `lessonRun` drives frames through a real lesson session of the uncapped practice lesson every task-cap round has
 * used and records what the student is shown and charged; `capAddsBreaches` compares the run WITH the cap and the run
 * of the same frames with the cap fields removed (`stripCap`) and states the ruling as a property — no model of what the
 * lesson ought to do is needed:
 *   (i)  every bill that is not the cap's is the same bill in both runs: the same charged mistakes (code, time,
 *        points), the same coached rows, the same cards and toasts (code or title, frame, text) — the pause schedule
 *        included, since the cap's cards keep their own pause clocks;
 *   (ii) the score with the cap is the score without it plus the cap's own points, never less;
 *   (iii) the verdict (the lesson's, and the official one) is never better with the cap.
 */
import { makeViolation, type SimTick, type ViolationCode } from "../../rules";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState } from "../types";

export const UNCAPPED = "sc-follow-brake";
const TASK = "TASK_SPEED_CAP_EXCEEDED";
export const TASK_TITLE = makeViolation(TASK as ViolationCode, 0).titleBg;

export interface Display {
  i: number;
  /** A teach card's code (toasts carry none). */
  code?: string;
  title: string;
  text: string;
  /** A pause card (teach moment) or a toast. */
  pause: boolean;
}
export interface LessonRun {
  score: number;
  passed: boolean;
  officialPassed: boolean;
  mistakes: string[];
  coached: string[];
  displays: Display[];
  config: LessonSessionState["rules"]["config"];
}
export function lessonRun(f: readonly SimTick[]): LessonRun {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED);
  if (spec === undefined) throw new Error(`no template ${UNCAPPED}`);
  let s: LessonSessionState = createLessonSession(compileScenario(spec, 1));
  const displays: Display[] = [];
  f.forEach((x, i) => {
    const r = applyTick(s, x);
    s = r.state;
    for (const m of r.teachMoments ?? []) displays.push({ i, code: m.code, title: m.titleBg, text: m.explanationBg, pause: true });
    for (const h of r.hudEvents as Array<{ kind: string; titleBg?: string; explanationBg?: string }>) {
      if ((h.kind === "violation" || h.kind === "lesson") && h.explanationBg !== undefined && h.titleBg !== undefined) displays.push({ i, title: h.titleBg, text: h.explanationBg, pause: false });
    }
  });
  const ended = s.phase === "driving" || s.phase === "preDrive" ? finishSession(s, f[f.length - 1].t) : s;
  const res = buildLessonResult(ended);
  return {
    score: res.score,
    passed: res.passed,
    officialPassed: res.summary.passed,
    mistakes: res.summary.mistakes.map((m) => `${m.code}@${m.t.toFixed(2)}|${m.points}`),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    displays,
    config: s.rules.config,
  };
}

/** The same frames with every cap field removed — the lesson with no cap. */
export function stripCap(f: readonly SimTick[]): SimTick[] {
  return f.map((x) => {
    const { taskSpeedCap: _c, taskCapArrival: _a, ...rest } = x;
    return rest as SimTick;
  });
}

const notTask = (row: string) => !row.startsWith(TASK);
const isCapDisplay = (d: Display) => d.code === TASK || d.title === TASK_TITLE;
const dKey = (d: Display) => `${d.pause ? "card" : "toast"}@${d.i}|${d.code ?? ""}|${d.title}|${d.text}`;
export const capPoints = (r: LessonRun) => r.mistakes.filter((m) => m.startsWith(TASK)).reduce((a, m) => a + Number(m.slice(m.indexOf("|") + 1)), 0);

/** Every way the run with the cap breaks the ruling against the run of the same frames with no cap ([] = it holds). */
export function capAddsBreaches(cap: LessonRun, noCap: LessonRun): string[] {
  const out: string[] = [];
  const same = (what: string, a: readonly string[], b: readonly string[]) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${what}: with the cap ${JSON.stringify(a).slice(0, 400)} / no cap ${JSON.stringify(b).slice(0, 400)}`);
  };
  same("charged mistakes other than the cap's", cap.mistakes.filter(notTask), noCap.mistakes);
  same("coached rows other than the cap's", cap.coached.filter(notTask), noCap.coached);
  same("cards and toasts other than the cap's", cap.displays.filter((d) => !isCapDisplay(d)).map(dKey), noCap.displays.map(dKey));
  if (noCap.mistakes.some((m) => !notTask(m)) || noCap.coached.some((m) => !notTask(m)) || noCap.displays.some(isCapDisplay)) out.push("a cap bill with no cap");
  if (cap.score !== noCap.score + capPoints(cap)) out.push(`score ${cap.score} with the cap ≠ ${noCap.score} without + ${capPoints(cap)} the cap's`);
  if (cap.score < noCap.score) out.push(`the cap LOWERED the score: ${cap.score} < ${noCap.score}`);
  if (cap.passed && !noCap.passed) out.push("the lesson verdict is BETTER with the cap");
  if (cap.officialPassed && !noCap.officialPassed) out.push("the official verdict is BETTER with the cap");
  return out;
}
