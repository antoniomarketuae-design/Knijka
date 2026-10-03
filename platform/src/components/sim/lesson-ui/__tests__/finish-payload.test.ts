/**
 * THE SHELL'S FINISH PAYLOAD, EXECUTED — round-3 verifier COND-C 2.
 *
 * `LessonPlayShell` builds the `finishLessonAction` payload the SERVER grades
 * and debriefs from (the debrief the student actually reads is the server's,
 * `saveResult.debriefText`). Round 3 added `taskCapBreaches` to it, and the only
 * test near it (`lesson-mistake-wire-parity`) rebuilt the payload BY HAND — so
 * deleting the shell's line left every test green while the server debrief went
 * back to printing unscoped praise over a blown task cap.
 *
 * The builder is now a pure exported function (`finishLessonPayload`) that the
 * shell's `finalize` calls, and this file RUNS it: a real compiled spray session
 * through a real blown ≤80 mark, the real `buildLessonResult`, the shell's own
 * payload, the server's own `gradeFinishWire` and debrief. Deleting either
 * serialization line in the shell turns it red (mutation table, round 4).
 * RED on round 3 (the function did not exist).
 *
 * ROUND 5 (round-4 verifier F6, its surviving mutant PAY6): the builder was
 * executed, but its CALL SITE in `finalize` was not — `result: { ...r,
 * taskCapBreaches: undefined, coachedMistakes: undefined }` there stayed green
 * across 33 files. The body of `finalize` is now `finalizeLessonSession`, a
 * plain exported function the `useCallback` hands the session to, and the
 * second block below RUNS it with a fake `send`: whatever the call site does to
 * the result reaches this file's assertions and the server's own grader. The
 * one line left inside the callback is pinned by its source (third block),
 * because a React callback is the one thing a node test cannot call.
 * RED on round 4 (`finalizeLessonSession` did not exist).
 *
 * ROUND 6 (round-5 verifier F3, its surviving mutants PB3 and PB5): every block
 * above compared LISTS, and none compared the GRADE — so a payload that sent
 * the server no rule events at all (every charged violation gone, the task's
 * own point on a repeat included) or that never reported an abort stayed green
 * across 39 files. The fourth block below makes the server's grade of what the
 * shell sends equal the client's own result, field by field: the score, the
 * violations (code, time, points, class), the verdict, the abort, the training
 * score and its escalations — for a charged drive, a repeat-escalated drive and
 * an aborted one, through the pure builder AND through `finalizeLessonSession`.
 * RED on round 5 under PB3 and PB5 (`scratchpad/cap/r6/mut`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  applyNearMiss,
  applyTick,
  buildDebrief,
  abortSession,
  buildLessonResult,
  compileScenario,
  createLessonSession,
  finishSession,
  parkingObservationFromTrace,
  scoreRubric,
  type LessonSessionState,
  type RubricScore,
  type ScenarioSpec,
} from "@/modules/sim/lessons";
import { gradeFinishWire, parseFinishLessonWire, type FinishLessonWire } from "@/modules/sim/lessons/wire";
import { compactTraceForStorage, parseScenarioTrace, type ScenarioTrace } from "@/modules/sim/traces";
import type { LessonResult } from "@/modules/sim/lessons";
import type { SimTick } from "@/modules/sim/rules";
import { finalizeLessonSession, finishLessonPayload } from "../LessonPlayShell";
import type { FinishLessonActionResult } from "../types";
import {
  CLEARANCE_DOMAIN,
  EPOCH_ORIGIN_MS,
  EPOCH_REMAINDERS_MS,
  NEAR_MISS_KINDS,
  QUIZ_DOMAIN,
  REFUSAL_CODES,
  REL_SPEED_DOMAIN,
  clockCallSitesFromShell,
  nearMissCapFromWire,
  refusalCodesFromAction,
  saveDomain,
} from "./payload-domains";

function tickAt(t: number, y: number, speedKmh: number): SimTick {
  return {
    t,
    speedKmh,
    maxSpeedKmh: 140,
    position: { x: 0, y },
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
  };
}
/** sc-ac-truck-spray L3 in the rain: `through` km/h through the ≤80 mark at y 450 for `holdM` metres, then 78. */
function spray(through: number, holdM: number): LessonSessionState {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ac-truck-spray")!;
  let s = createLessonSession(compileScenario(spec, 3));
  let y = 15;
  let v = 0;
  let t = 0;
  while (s.phase === "driving" && y < 800 && t < 120) {
    t = Math.round((t + 0.1) * 10) / 10;
    const target = (y < 450 + holdM ? through : 78) / 3.6;
    v = v < target ? Math.min(target, v + 0.4) : Math.max(target, v - 0.6);
    y += v * 0.1;
    s = applyTick(s, tickAt(t, y, v * 3.6)).state;
  }
  return s.phase === "driving" ? finishSession(s, t) : s;
}
const UNSCOPED = /чисто каране без нито едно нарушение|задръж това ниво|карането беше чисто по изпитния лист/u;

describe("finishLessonPayload — the payload the shell sends is the payload this test grades", () => {
  it("a blown cap with a taught (uncharged) task card: the payload carries taskCapBreaches AND coachedMistakes", () => {
    const ended = spray(116, 90);
    const r = buildLessonResult(ended);
    expect(r.taskCapBreaches?.length).toBe(1);
    expect(r.coachedMistakes?.some((c) => c.code === "TASK_SPEED_CAP_EXCEEDED")).toBe(true);
    const p = finishLessonPayload({
      lessonId: ended.lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 71_000,
      state: ended,
      result: r,
      microQuiz: { total: 0, correct: 0 },
    });
    expect(p.taskCapBreaches).toEqual([{ objectiveId: "sc-acts-gap", t: r.taskCapBreaches![0].t }]);
    expect(p.coachedMistakes?.map((c) => c.code)).toContain("TASK_SPEED_CAP_EXCEEDED");
    // …and the server accepts exactly what the shell sent, and debriefs on it.
    const graded = gradeFinishWire(p);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.taskCapBreaches?.map((b) => b.objectiveId)).toEqual(["sc-acts-gap"]);
    expect(graded.result.coachedMistakes?.map((c) => c.code)).toContain("TASK_SPEED_CAP_EXCEEDED");
    const text = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    expect(text).not.toMatch(UNSCOPED);
  });
  it("a breach at the mark too short to run the task's sustain (100 through, then 78): the breach row AND the arrival card reach the server", () => {
    // ROUND 6 (ruling 4, the integrator's reading): the blow is billed as the
    // arrival even on the curtain, so this drive now also carries the taught
    // TASK row (round 5: the breach row was its only evidence).
    const ended = spray(100, 5);
    const r = buildLessonResult(ended);
    expect(r.taskCapBreaches?.length).toBe(1);
    expect((r.coachedMistakes ?? []).map((c) => c.code)).toEqual(["TASK_SPEED_CAP_EXCEEDED"]);
    const p = finishLessonPayload({
      lessonId: ended.lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 71_000,
      state: ended,
      result: r,
      microQuiz: { total: 0, correct: 0 },
    });
    expect(p.taskCapBreaches?.length).toBe(1);
    expect(p.coachedMistakes?.map((c) => c.code)).toEqual(["TASK_SPEED_CAP_EXCEEDED"]);
    const graded = gradeFinishWire(p);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    const text = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    expect(text).not.toMatch(UNSCOPED);
    for (const l of text.split("\n").filter((x) => x.includes("Чисто и спокойно каране"))) {
      expect(l).toContain("но само на отделни отсечки");
    }
  });
  it("a drive that honoured its cap sends neither list (the shape an older client sends)", () => {
    const ended = spray(78, 0);
    const r = buildLessonResult(ended);
    const p = finishLessonPayload({
      lessonId: ended.lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 71_000,
      state: ended,
      result: r,
      microQuiz: { total: 0, correct: 0 },
    });
    expect("taskCapBreaches" in p).toBe(false);
    expect("coachedMistakes" in p).toBe(false);
    expect(gradeFinishWire(p).status).toBe("ok");
  });
  it("the optional channels ride only when given", () => {
    const ended = spray(78, 0);
    const r = buildLessonResult(ended);
    const p = finishLessonPayload({
      lessonId: ended.lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 71_000,
      state: ended,
      result: r,
      microQuiz: { total: 2, correct: 1 },
      observedMomentIds: ["m1"],
    });
    expect(p.observedMomentIds).toEqual(["m1"]);
    expect(p.microQuiz).toEqual({ total: 2, correct: 1 });
    expect("attemptTrace" in p).toBe(false);
  });
});

/** Run the shell's finalize body on an ended session, capturing what it SENDS. */
function finalizeAndCapture(
  ended: LessonSessionState,
  opts: { mistakeExperience?: boolean } = {},
): { sent: FinishLessonWire[]; shown: LessonResult | null; saved: FinishLessonActionResult[] } {
  const sent: FinishLessonWire[] = [];
  const saved: FinishLessonActionResult[] = [];
  let shown: LessonResult | null = null;
  finalizeLessonSession(ended, {
    lessonId: ended.lesson.id,
    mistakeExperience: opts.mistakeExperience === true,
    rubric: undefined,
    startedAtMs: 1_000,
    microQuiz: { total: 0, correct: 0 },
    finishTrace: () => null,
    now: () => 71_000,
    setResult: (r) => {
      shown = r;
    },
    setRubric: () => {},
    setTraceUploaded: () => {},
    send: (wire) => {
      sent.push(wire);
      return new Promise<FinishLessonActionResult>(() => {});
    },
    setSaveResult: (r) => {
      saved.push(r);
    },
  });
  return { sent, shown, saved };
}

describe("finalizeLessonSession — the shell's finalize, EXECUTED (round-4 verifier F6, mutant PAY6)", () => {
  it("a blown cap with a taught task card: what finalize SENDS carries taskCapBreaches AND coachedMistakes, and the server debriefs it scoped", () => {
    const ended = spray(116, 90);
    const { sent, shown } = finalizeAndCapture(ended);
    expect(sent.length).toBe(1);
    const p = sent[0];
    expect(shown).not.toBeNull();
    expect(p.lessonId).toBe(ended.lesson.id);
    expect(p.startedAtMs).toBe(1_000);
    expect(p.finishedAtMs).toBe(71_000);
    expect(p.taskCapBreaches?.map((b) => b.objectiveId)).toEqual(["sc-acts-gap"]);
    expect(p.coachedMistakes?.map((c) => c.code)).toContain("TASK_SPEED_CAP_EXCEEDED");
    // Exactly the payload the pure builder makes from the same result.
    expect(p).toEqual(
      finishLessonPayload({
        lessonId: ended.lesson.id,
        startedAtMs: 1_000,
        finishedAtMs: 71_000,
        state: ended,
        result: buildLessonResult(ended),
        microQuiz: { total: 0, correct: 0 },
      }),
    );
    const graded = gradeFinishWire(p);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.taskCapBreaches?.map((b) => b.objectiveId)).toEqual(["sc-acts-gap"]);
    expect(graded.result.coachedMistakes?.map((c) => c.code)).toContain("TASK_SPEED_CAP_EXCEEDED");
    const text = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    expect(text).not.toMatch(UNSCOPED);
  });
  it("the breach-only drive (100 through, then 78): finalize sends the breach row, the only evidence the server has", () => {
    const { sent } = finalizeAndCapture(spray(100, 5));
    expect(sent.length).toBe(1);
    expect(sent[0].taskCapBreaches?.length).toBe(1);
    const graded = gradeFinishWire(sent[0]);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    const text = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    expect(text).not.toMatch(UNSCOPED);
  });
  it("GUARD — a THEO-3 sandbox is never persisted: finalize shows the result and sends nothing", () => {
    const { sent, shown } = finalizeAndCapture(spray(116, 90), { mistakeExperience: true });
    expect(shown).not.toBeNull();
    expect(sent).toEqual([]);
  });
});

describe("the one line left inside finalize's useCallback — pinned by its source", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(HERE, "..", "LessonPlayShell.tsx"), "utf8");
  const norm = (x: string) => x.replace(/\s+/g, " ").trim();
  it("finalize hands the session to finalizeLessonSession untouched, and the payload is built in exactly one place", () => {
    const starts = src.split("const finalize = useCallback(").length - 1;
    // A pin that cannot find its block must fail, not pass.
    expect(starts).toBe(1);
    const from = src.indexOf("const finalize = useCallback(");
    const to = src.indexOf("[lesson.id, lesson.mistakeExperience, scenarioSpec],", from);
    expect(to).toBeGreaterThan(from);
    const body = norm(src.slice(from, to));
    expect(body).toBe(
      norm(`const finalize = useCallback(
    (state: LessonSessionState) => {
      if (finalizedRef.current) return; // exactly one grade + one save per session
      finalizedRef.current = true;
      sessionRef.current = state;
      finalizeLessonSession(state, {
        lessonId: lesson.id,
        mistakeExperience: lesson.mistakeExperience !== undefined,
        rubric: scenarioSpec?.rubric,
        startedAtMs: startedAtMsRef.current,
        microQuiz: quizStatsRef.current,
        finishTrace: () => attemptRecorderRef.current?.finish() ?? null,
        now: Date.now,
        setResult,
        setRubric,
        setTraceUploaded,
        send: finishLessonAction,
        setSaveResult,
      });
    },`),
    );
    // The payload builder is called from finalizeLessonSession and nowhere else.
    expect(src.split("finishLessonPayload(").length - 1).toBe(2);
    expect(src.split("finishLessonAction(").length - 1).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ROUND 6 — the server's grade of what the shell sends IS the client's result.
// ---------------------------------------------------------------------------

/** sc-ac-truck-spray L3 in the rain along x 0, with a speed profile and an optional abort at `abortAtY`. */
function sprayDrive(speed: (y: number) => number, o: { abortAtY?: number } = {}): LessonSessionState {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ac-truck-spray")!;
  let s = createLessonSession(compileScenario(spec, 3));
  let y = 15;
  let v = 0;
  let t = 0;
  while (s.phase === "driving" && y < 900 && t < 200) {
    t = Math.round((t + 0.1) * 10) / 10;
    const target = speed(y) / 3.6;
    v = v < target ? Math.min(target, v + 0.6) : Math.max(target, v - 3);
    y += v * 0.1;
    s = applyTick(s, tickAt(t, y, v * 3.6)).state;
    if (o.abortAtY !== undefined && y >= o.abortAtY) return abortSession(s, t);
  }
  return s.phase === "driving" ? finishSession(s, t) : s;
}
/** The fields of a grade a student and the stored record read. */
function gradeOf(r: LessonResult) {
  return {
    score: r.score,
    effectiveScore: r.effectiveScore,
    passed: r.passed,
    aborted: r.aborted,
    completedAll: r.completedAll,
    officialPassed: r.summary.passed,
    totalPoints: r.summary.score.totalPoints,
    violations: r.summary.mistakes.map((m) => [m.code, m.t, m.points, m.severityClass]),
    escalations: r.escalations.map((e) => [e.code, e.t, e.multiplier]),
  };
}
/** Charged: 116 through the ≤80 mark and 110 held along the curtain — the arrival is taught, the act's re-grade charged. */
const charged = () => sprayDrive((y) => (y < 800 ? (y < 452 ? 116 : 110) : 78));
/**
 * A repeat: three hard stops from 90 to 30 before the mark (the first is the
 * card, the second a charge, the third a REPEAT ×1.5 — the training score's
 * half of the grade), then 78 through the ≤80 mark.
 */
const repeated = () =>
  sprayDrive((y) => (y < 120 ? 90 : y < 160 ? 30 : y < 240 ? 90 : y < 280 ? 30 : y < 360 ? 90 : y < 400 ? 30 : 78));
/** Aborted mid-curtain, at y 600, 110 through the ≤80 mark. */
const aborted = () => sprayDrive((y) => (y < 452 ? 116 : 110), { abortAtY: 600 });

describe("the server's grade of the shell's payload EQUALS the client's result (round-5 verifier F3: PB3, PB5)", () => {
  it("the drives are what they claim: one is charged, one escalates a repeat, one is aborted", () => {
    const c = buildLessonResult(charged());
    expect(c.score).toBeGreaterThan(0);
    expect(c.summary.mistakes.map((m) => m.code)).toContain("TASK_SPEED_CAP_EXCEEDED");
    const a = buildLessonResult(aborted());
    expect(a.aborted).toBe(true);
    expect(a.passed).toBe(false);
  });
  for (const [label, make] of [
    ["a charged drive", charged],
    ["a repeat-escalated drive", repeated],
    ["an aborted drive", aborted],
  ] as const) {
    it(`${label}: the pure builder's payload, graded by the server, gives the client's grade`, () => {
      const ended = make();
      const r = buildLessonResult(ended);
      const p = finishLessonPayload({
        lessonId: ended.lesson.id,
        startedAtMs: 1_000,
        finishedAtMs: 71_000,
        state: ended,
        result: r,
        microQuiz: { total: 0, correct: 0 },
      });
      expect(p.aborted).toBe(r.aborted);
      const graded = gradeFinishWire(p);
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") return;
      expect(gradeOf(graded.result)).toEqual(gradeOf(r));
      expect(graded.events.filter((e) => e.kind === "violation").length).toBe(r.summary.mistakes.length);
    });
    it(`${label}: what finalizeLessonSession SENDS, graded by the server, gives the grade it SHOWED`, () => {
      const { sent, shown } = finalizeAndCapture(make());
      expect(sent.length).toBe(1);
      expect(shown).not.toBeNull();
      const graded = gradeFinishWire(sent[0]);
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") return;
      expect(gradeOf(graded.result)).toEqual(gradeOf(shown as unknown as LessonResult));
    });
  }
  it("the repeat drive really escalates (so the training-score half of the parity is measured, not vacuous)", () => {
    const r = buildLessonResult(repeated());
    expect(r.escalations.length).toBeGreaterThan(0);
    expect(r.effectiveScore).toBeGreaterThan(r.score);
  });
});

// ---------------------------------------------------------------------------
// ROUND 7 (round-6 verifier R1) — the channels the three drives above never
// carried. The census (`finish-payload-census.test.ts`) runs the same parity
// over every committed drive; these are the fast, named cases, and near-misses
// live ONLY here, because they come from the running scene (`applyNearMiss`)
// and no recorder produces one.
// ---------------------------------------------------------------------------

const REPO_ROOT_FP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
/** A committed recording, handed to finalize as the attempt the shell recorded. */
function attemptOf(templateId: string, traceName: string, lessonId: string): ScenarioTrace {
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT_FP, "content", "traces", templateId, `${traceName}.trace.json`), "utf-8"),
  ) as ScenarioTrace;
  const t = parseScenarioTrace({ ...raw, meta: { ...raw.meta, kind: "attempt", scenarioId: lessonId } });
  if (t === null) throw new Error(`unparseable ${templateId}/${traceName}`);
  return t;
}
interface Captured {
  sent: FinishLessonWire[];
  saved: FinishLessonActionResult[];
  rubric: RubricScore | null;
  uploaded: boolean | null;
}
function finalizeWith(
  ended: LessonSessionState,
  o: {
    rubric?: ScenarioSpec["rubric"];
    trace?: ScenarioTrace | null;
    send?: (w: FinishLessonWire) => Promise<FinishLessonActionResult>;
    microQuiz?: { total: number; correct: number };
  } = {},
): Captured {
  const c: Captured = { sent: [], saved: [], rubric: null, uploaded: null };
  finalizeLessonSession(ended, {
    lessonId: ended.lesson.id,
    mistakeExperience: false,
    rubric: o.rubric,
    startedAtMs: 1_000,
    microQuiz: o.microQuiz ?? { total: 0, correct: 0 },
    finishTrace: () => o.trace ?? null,
    now: () => 71_000,
    setResult: () => {},
    setRubric: (x) => {
      c.rubric = x;
    },
    setTraceUploaded: (u) => {
      c.uploaded = u;
    },
    send: (w) => {
      c.sent.push(w);
      return o.send ? o.send(w) : new Promise<FinishLessonActionResult>(() => {});
    },
    setSaveResult: (x) => {
      c.saved.push(x);
    },
  });
  return c;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ROUND 7 — the stored channels and the call site's own outputs (round-6 verifier R1)", () => {
  it("near-misses: every one the scene reported reaches what the server stores, with its place (PB14)", () => {
    let s = spray(78, 0);
    s = applyNearMiss(s, { tSec: 12.5, kind: "cyclist", npcId: 1001, clearanceM: 0.4, relSpeedMps: 6.2 }, { x: 0, y: 180 });
    s = applyNearMiss(s, { tSec: 20.25, kind: "vehicle", npcId: 7, clearanceM: 0.9, relSpeedMps: 11 }, null);
    const { sent } = finalizeWith(s);
    const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    // What actions.ts stores (`nearMisses`), rebuilt the way it rebuilds it.
    const stored = (graded.wire.nearMisses ?? []).map((n) => ({
      tSec: n.tSec,
      kind: n.kind,
      clearanceM: n.clearanceM,
      relSpeedMps: n.relSpeedMps,
      x: n.x ?? null,
      y: n.y ?? null,
    }));
    expect(stored).toEqual(s.nearMisses);
    expect(stored).toHaveLength(2);
  });
  it("the attempt: finalize forwards the drive's own reduced recording, the server accepts it, and «Виж своя дубъл» is offered (CS11, CS12, PB18)", () => {
    const ended = spray(116, 90);
    const trace = attemptOf("sc-ac-truck-spray", "shadow-correct", ended.lesson.id);
    const c = finalizeWith(ended, { trace });
    const compact = compactTraceForStorage(trace);
    expect(compact).not.toBeNull();
    expect(c.sent[0].attemptTrace).toEqual(compact);
    expect(parseFinishLessonWire(JSON.parse(JSON.stringify(c.sent[0])))?.attemptTrace).toEqual(compact);
    expect(c.uploaded).toBe(true);
  });
  it("GUARD — a drive with no recording offers no replay link, and sends no trace (CS12)", () => {
    const c = finalizeWith(spray(116, 90), { trace: null });
    expect(c.uploaded).toBe(false);
    expect("attemptTrace" in c.sent[0]).toBe(false);
  });
  it("the save result: the server's own answer reaches the screen (CS8)…", async () => {
    const ok: FinishLessonActionResult = { ok: true, sessionId: "s1", debriefText: "сървър", concepts: [], xpEarned: null };
    const c = finalizeWith(spray(116, 90), { send: () => Promise.resolve(ok) });
    await flush();
    expect(c.saved).toEqual([ok]);
  });
  it("…and a save that fails says SAVE_FAILED instead of leaving the screen waiting (CS9)", async () => {
    const c = finalizeWith(spray(116, 90), { send: () => Promise.reject(new Error("offline")) });
    await flush();
    expect(c.saved).toEqual([{ ok: false, code: "SAVE_FAILED" }]);
  });
  it("a parking rubric: the moments the recording observed are sent, the shell shows the score THOSE moments give, and the server stores the same stars (CS10, CS13)", () => {
    const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-park-perp-rev")!;
    const lesson = compileScenario(spec, 3);
    const ended = finishSession(createLessonSession(lesson), 30);
    const trace = attemptOf("sc-park-perp-rev", "shadow-correct", lesson.id);
    const moments = spec.rubric?.observation?.moments ?? [];
    const mapped = parkingObservationFromTrace(trace, moments);
    // Not vacuous: the recording really observed moments, and they change what is shown.
    expect(mapped?.observedMomentIds.length ?? 0).toBeGreaterThan(0);
    const r = buildLessonResult(ended);
    expect(scoreRubric(r, spec.rubric!, mapped!)).not.toEqual(scoreRubric(r, spec.rubric!, undefined));
    const c = finalizeWith(ended, { rubric: spec.rubric, trace });
    expect(c.sent[0].observedMomentIds).toEqual(mapped!.observedMomentIds);
    expect(c.rubric).toEqual(scoreRubric(r, spec.rubric!, mapped!));
    const graded = gradeFinishWire(JSON.parse(JSON.stringify(c.sent[0])));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    const stored = scoreRubric(graded.result, spec.rubric!, { observedMomentIds: graded.wire.observedMomentIds ?? [] });
    expect(stored.stars).toBe(c.rubric!.stars);
  });
});

// ---------------------------------------------------------------------------
// ROUND 8 (round-7 verifier R1–R4, C1) — the endings the census never had: an
// ABORTED drive that recorded an attempt and whose save the server stored, a
// server REFUSAL, and the EXAM rung. Each surviving mutant of the round-7
// verifier bends one of these; the census (`finish-payload-census.test.ts`)
// runs them over every committed drive and rung, and these are the fast, named
// cases.
// ---------------------------------------------------------------------------

/** sc-ac-truck-spray in the rain at `level`, `through` km/h through the ≤80 mark; aborted at `abortAt` s when given. */
function sprayAt(level: 1 | 2 | 3 | 4 | 5, through: number, abortAt?: number): LessonSessionState {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ac-truck-spray")!;
  let s = createLessonSession(compileScenario(spec, level));
  let y = 15;
  let v = 0;
  let t = 0;
  while (s.phase === "driving" && y < 800 && t < 120) {
    t = Math.round((t + 0.1) * 10) / 10;
    const target = (y < 540 ? through : 78) / 3.6;
    v = v < target ? Math.min(target, v + 0.4) : Math.max(target, v - 0.6);
    y += v * 0.1;
    s = applyTick(s, tickAt(t, y, v * 3.6)).state;
    if (abortAt !== undefined && t >= abortAt && s.phase === "driving") return abortSession(s, t);
  }
  return s.phase === "driving" ? finishSession(s, t) : s;
}

describe("ROUND 8 — the aborted drive with a recording, the server's refusal, the exam rung (round-7 verifier R1–R4, C1)", () => {
  it("an ABORTED drive with a recording: finalize uploads it, the server accepts it, and «Виж своя дубъл» is offered (NP1, NP12)", () => {
    const ended = sprayAt(3, 116, 30);
    expect(ended.phase).toBe("aborted");
    const trace = attemptOf("sc-ac-truck-spray", "shadow-correct", ended.lesson.id);
    const c = finalizeWith(ended, { trace });
    const compact = compactTraceForStorage(trace);
    expect(compact).not.toBeNull();
    expect(c.sent[0].aborted).toBe(true);
    expect(c.sent[0].attemptTrace).toEqual(compact);
    expect(parseFinishLessonWire(JSON.parse(JSON.stringify(c.sent[0])))?.attemptTrace).toEqual(compact);
    expect(c.uploaded).toBe(true);
  });
  it("an ABORTED drive whose save the server STORED: the screen is handed the server's stored session, not SAVE_FAILED (NP2)", async () => {
    const ok: FinishLessonActionResult = { ok: true, sessionId: "s-abort", debriefText: "сървър", concepts: [], xpEarned: null };
    const c = finalizeWith(sprayAt(3, 116, 30), { send: () => Promise.resolve(ok) });
    await flush();
    expect(c.sent[0].aborted).toBe(true);
    expect(c.saved).toEqual([ok]);
  });
  for (const code of ["LEVEL_LOCKED", "RATE_LIMITED", "NOT_SIGNED_IN"] as const) {
    it(`a server REFUSAL (${code}): the screen is handed the server's own code, never SAVE_FAILED — nothing was attempted and the student's data did not fail to save (NP3)`, async () => {
      const refusal: FinishLessonActionResult = { ok: false, code };
      for (const ended of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
        const c = finalizeWith(ended, { send: () => Promise.resolve(refusal) });
        await flush();
        expect(c.saved).toEqual([refusal]);
      }
    });
  }
  it("the EXAM rung: every commendation the shell showed reaches what the server stores and debriefs (NP14)", () => {
    const ended = sprayAt(4, 76);
    // Not vacuous: an exam rung, with praise earned on it.
    expect(ended.lesson.examMode).toBe(true);
    const shownPraise = ended.events.filter((e) => e.kind === "commendation");
    expect(shownPraise.length).toBeGreaterThan(0);
    const { sent } = finalizeWith(ended);
    const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.events.filter((e) => e.kind === "commendation").map((e) => [e.code, e.t])).toEqual(
      shownPraise.map((e) => [e.code, e.t]),
    );
    const client = buildLessonResult(ended);
    expect(buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text).toBe(
      buildDebrief(ended.lesson, client, { coachedMistakes: client.coachedMistakes }).text,
    );
  });
});

// ---------------------------------------------------------------------------
// ROUND 9 (round-8 verifier F1–F3 and N5; the integrator's parity stop rule) —
// every field over its FULL domain, derived from the source (`payload-domains.ts`).
// The census (`finish-payload-census.test.ts`) drives the same domains over every
// committed drive; these are the fast, named cases.
// ---------------------------------------------------------------------------

describe("ROUND 9 — the full domain of every field the payload carries (round-8 verifier Q1, Q2, Q5, Q6)", () => {
  it("the save result: EVERY value the server action can produce — each refusal code it returns (read from its source), a stored session bare and with XP, a rejected save — reaches the screen as the server's own answer, on a finished AND an aborted drive (Q2)", async () => {
    // The codes are read from `simulator/actions.ts`, not listed here.
    const read = refusalCodesFromAction();
    expect(read.unresolved).toBe(0);
    expect(read.codes).toEqual([...REFUSAL_CODES]);
    const domain = saveDomain(9);
    // Not vacuous: the two codes the round-8 guard never drove are in it.
    expect(domain.map((v) => v.key)).toEqual(expect.arrayContaining(["INVALID_INPUT", "UNKNOWN_LESSON", "reject", "ok+xp"]));
    // Round 10 (the round-9 verifier's C1): a stored session with SEVERAL concepts and ZERO XP is in it too.
    expect(domain.find((v) => v.key === "ok+2c0xp")?.answer).toMatchObject({ ok: true, xpEarned: 0, concepts: [{ id: "c-speed" }, { id: "c-weather" }] });
    for (const ended of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
      for (const v of domain) {
        const c = finalizeWith(ended, {
          send: () => (v.answer === undefined ? Promise.reject(new Error("offline")) : Promise.resolve(v.answer)),
        });
        await flush();
        expect(c.saved, `${v.key} on a ${ended.phase} drive`).toEqual([v.expect]);
      }
    }
  });
  it("the micro-quiz: EVERY (correct, total) the product can produce — n of n, 0 of n and all between — is stored exactly as the student scored it, and the server's debrief says the same, on a finished AND an aborted drive (Q1)", () => {
    expect(QUIZ_DOMAIN).toContainEqual({ total: 4, correct: 4 });
    for (const ended of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
      const client = buildLessonResult(ended);
      for (const quiz of QUIZ_DOMAIN) {
        const { sent } = finalizeWith(ended, { microQuiz: quiz });
        const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
        expect(graded.status).toBe("ok");
        if (graded.status !== "ok") return;
        expect(graded.wire.microQuiz, `${quiz.correct}/${quiz.total} on a ${ended.phase} drive`).toEqual(quiz);
        expect(
          buildDebrief(graded.lesson, graded.result, { microQuiz: graded.wire.microQuiz, coachedMistakes: graded.result.coachedMistakes }).text,
        ).toBe(buildDebrief(ended.lesson, client, { microQuiz: quiz, coachedMistakes: client.coachedMistakes }).text);
      }
    }
  });
  it("an ABORTED drive's near-misses — every kind the wire accepts, with and without a place — reach what the server stores (Q5: no committed drive carries one, so it is pinned here)", () => {
    let s = sprayAt(3, 116, 30);
    expect(s.phase).toBe("aborted");
    NEAR_MISS_KINDS.forEach((kind, i) => {
      // Round 10: the relative speeds from the derived domain (the detector's own real-number readings, and 0).
      s = applyNearMiss(s, { tSec: 10 + i, kind, npcId: 1000 + i, clearanceM: 0.3 + i / 10, relSpeedMps: REL_SPEED_DOMAIN[1 + i] }, { x: 0, y: 100 + i });
      s = applyNearMiss(s, { tSec: 20 + i, kind, npcId: 2000 + i, clearanceM: 0.8, relSpeedMps: i === 0 ? 0 : REL_SPEED_DOMAIN[3 + i] }, null);
    });
    const { sent } = finalizeWith(s);
    expect(sent[0].aborted).toBe(true);
    const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    const stored = (graded.wire.nearMisses ?? []).map((n) => ({
      tSec: n.tSec,
      kind: n.kind,
      clearanceM: n.clearanceM,
      relSpeedMps: n.relSpeedMps,
      x: n.x ?? null,
      y: n.y ?? null,
    }));
    expect(stored).toEqual(s.nearMisses);
    expect(stored).toHaveLength(2 * NEAR_MISS_KINDS.length);
  });
  it("E — the server's debrief (the text the student READS) of a drive with near-misses says what the shell's said: the result `gradeFinishWire` builds carries them, so the near-miss reservation is not lost when the server's text replaces the fallback", () => {
    let s = spray(78, 0);
    s = applyNearMiss(s, { tSec: 12.5, kind: "cyclist", npcId: 1001, clearanceM: 0.4, relSpeedMps: 6.2 }, { x: 0, y: 180 });
    const { sent } = finalizeWith(s);
    const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.nearMisses).toEqual(s.nearMisses);
    const client = buildLessonResult(s);
    const shellText = buildDebrief(s.lesson, client, { coachedMistakes: client.coachedMistakes }).text;
    const serverText = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    // Not vacuous: the shell's text names the near-miss…
    expect(shellText).toMatch(/Разминавания на косъм: 1 — велосипедист на 0,4 м/u);
    // …and the server's is the same text.
    expect(serverText).toBe(shellText);
  });
  it("a drive QUIT after a ×1.5 repeat escalation: the escalation reaches the server, and the training score it stores equals the one the student was shown (Q6)", () => {
    // `repeated` above, quit at y 450 — after its third hard stop (the ×1.5 repeat).
    const quit = sprayDrive((y) => (y < 120 ? 90 : y < 160 ? 30 : y < 240 ? 90 : y < 280 ? 30 : y < 360 ? 90 : y < 400 ? 30 : 78), {
      abortAtY: 450,
    });
    const client = buildLessonResult(quit);
    // Not vacuous: aborted, AFTER an escalation, which raises the training score.
    expect(client.aborted).toBe(true);
    expect(client.escalations.length).toBeGreaterThan(0);
    expect(client.effectiveScore).toBeGreaterThan(client.score);
    const { sent, shown } = finalizeAndCapture(quit);
    const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(gradeOf(graded.result)).toEqual(gradeOf(shown as unknown as LessonResult));
    expect(graded.result.escalations.map((e) => [e.code, e.t, e.multiplier])).toEqual(
      client.escalations.map((e) => [e.code, e.t, e.multiplier]),
    );
    expect(graded.result.effectiveScore).toBe(client.effectiveScore);
  });
  it("the near-miss list over its declared LENGTH domain — 0, 1, 2, the wire's own cap less one and the cap itself (read from wire.ts), every kind, placed and not — is stored whole and debriefed alike, on a finished AND an aborted drive", () => {
    const cap = nearMissCapFromWire();
    expect(cap).not.toBeNull();
    const max = cap as number;
    expect(max).toBeGreaterThanOrEqual(3);
    const lengths = [0, 1, 2, max - 1, max];
    for (const base of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
      for (const n of lengths) {
        let s = base;
        for (let i = 0; i < n; i++) {
          const kind = NEAR_MISS_KINDS[i % NEAR_MISS_KINDS.length];
          s = applyNearMiss(
            s,
            { tSec: 5 + i / 10, kind, npcId: 3000 + i, clearanceM: 0.2 + (i % 9) / 10, relSpeedMps: REL_SPEED_DOMAIN[i % REL_SPEED_DOMAIN.length] },
            i % 2 === 0 ? { x: 0, y: 50 + i } : null,
          );
        }
        const label = `${n} near-misses on a ${s.phase} drive`;
        const { sent, shown } = finalizeAndCapture(s);
        const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
        expect(graded.status, label).toBe("ok");
        if (graded.status !== "ok") return;
        const stored = (graded.wire.nearMisses ?? []).map((x) => [x.tSec, x.kind, x.clearanceM, x.relSpeedMps, x.x ?? null, x.y ?? null]);
        expect(stored, label).toEqual((s.nearMisses ?? []).map((x) => [x.tSec, x.kind, x.clearanceM, x.relSpeedMps, x.x, x.y]));
        expect(stored, label).toHaveLength(n);
        // …and the result the server debriefs from carries the same list, in the same order (the closest
        // near-miss the debrief names is the FIRST of equal clearances).
        expect(graded.result.nearMisses ?? [], label).toEqual(s.nearMisses ?? []);
        const client = shown as unknown as LessonResult;
        expect(buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text, label).toBe(
          buildDebrief(s.lesson, client, { coachedMistakes: client.coachedMistakes }).text,
        );
      }
    }
  });
});

describe("ROUND 10 — the near-miss's relative speed over its DERIVED domain (round-9 verifier R3, V9P16)", () => {
  it("every relative speed of REL_SPEED_DOMAIN — the scene detector's own real-number readings, 0 and the wire's maximum — is stored exactly as the scene reported it, on a finished AND an aborted drive, and the server's debrief says what the shell's said", () => {
    // Not vacuous: real numbers, not the integers round 9 drove.
    expect(REL_SPEED_DOMAIN.filter((v) => !Number.isInteger(v)).length).toBeGreaterThanOrEqual(3);
    for (const base of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
      for (const [i, rel] of REL_SPEED_DOMAIN.entries()) {
        const s = applyNearMiss(base, { tSec: 6 + i / 10, kind: NEAR_MISS_KINDS[i % NEAR_MISS_KINDS.length], npcId: 4000 + i, clearanceM: 0.45, relSpeedMps: rel }, i % 2 === 0 ? { x: 0, y: 60 } : null);
        const label = `relSpeedMps ${rel} on a ${s.phase} drive`;
        const { sent, shown } = finalizeAndCapture(s);
        const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
        expect(graded.status, label).toBe("ok");
        if (graded.status !== "ok") return;
        expect((graded.wire.nearMisses ?? []).map((n) => n.relSpeedMps), label).toEqual([rel]);
        expect(graded.result.nearMisses ?? [], label).toEqual(s.nearMisses ?? []);
        const client = shown as unknown as LessonResult;
        expect(buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text, label).toBe(
          buildDebrief(s.lesson, client, { coachedMistakes: client.coachedMistakes }).text,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND 9 — NP10 (owed since round 8): the SAME mark blown twice, so the payload
// carries two breach rows of ONE objective. `stepTaskCapLatch` makes a second
// latch and a second row when the mark is blown again after its stretch was
// spent and its verdict cleared (lessons/engine.ts; task-cap-round3's R2
// construction, here on a CATALOGUED lesson so the server can grade it).
// ---------------------------------------------------------------------------

/** sc-ac-truck-spray at `level`: 110 through the ≤80 mark and past its stretch, put back on the approach at y 330, 110 through it AGAIN. */
function sprayBlownTwice(level: 1 | 2 | 3 | 5, abort: boolean): LessonSessionState {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === "sc-ac-truck-spray")!;
  let s = createLessonSession(compileScenario(spec, level));
  let y = 15;
  let t = 0;
  const step = (v: number) => {
    t = Math.round((t + 0.1) * 10) / 10;
    y += (v / 3.6) * 0.1;
    s = applyTick(s, tickAt(t, y, v)).state;
  };
  while (s.phase === "driving" && y < 760) step(110);
  y = 330;
  while (s.phase === "driving" && y < 620) step(110);
  if (abort) return abortSession(s, t);
  return s.phase === "driving" ? finishSession(s, t) : s;
}

describe("ROUND 9 — two breach rows of ONE objective reach the server whole (round-7 verifier NP10)", () => {
  for (const level of [1, 2, 3, 5] as const) {
    for (const abort of [false, true]) {
      it(`L${level}, ${abort ? "aborted" : "finished"}: both rows of the blown-twice mark are sent, stored and debriefed as the shell showed them`, () => {
        const ended = sprayBlownTwice(level, abort);
        const client = buildLessonResult(ended);
        // Not vacuous: TWO rows, both of the ≤80 mark.
        expect((client.taskCapBreaches ?? []).map((b) => b.objectiveId)).toEqual(["sc-acts-gap", "sc-acts-gap"]);
        expect(client.aborted).toBe(abort);
        const { sent, shown } = finalizeAndCapture(ended);
        const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
        expect(graded.status).toBe("ok");
        if (graded.status !== "ok") return;
        expect((graded.result.taskCapBreaches ?? []).map((b) => [b.objectiveId, b.t])).toEqual(
          (client.taskCapBreaches ?? []).map((b) => [b.objectiveId, b.t]),
        );
        expect(gradeOf(graded.result)).toEqual(gradeOf(shown as unknown as LessonResult));
        expect(buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text).toBe(
          buildDebrief(ended.lesson, client, { coachedMistakes: client.coachedMistakes }).text,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// ROUND 11 — the clearance and the clocks over domains DERIVED from the product
// (the round-10 verifier's F5 and F6, under the parity stop rule)
// ---------------------------------------------------------------------------

/** `finalizeLessonSession` with the payload's clocks as the shell's `Date.now()` call sites would stamp them. */
function finalizeAtClock(ended: LessonSessionState, startedAtMs: number | null, nowMs: number): FinishLessonWire {
  const sent: FinishLessonWire[] = [];
  finalizeLessonSession(ended, {
    lessonId: ended.lesson.id,
    mistakeExperience: false,
    rubric: undefined,
    startedAtMs,
    microQuiz: { total: 0, correct: 0 },
    finishTrace: () => null,
    now: () => nowMs,
    setResult: () => {},
    setRubric: () => {},
    setTraceUploaded: () => {},
    send: (wire) => {
      sent.push(wire);
      return new Promise<FinishLessonActionResult>(() => {});
    },
    setSaveResult: () => {},
  });
  return sent[0];
}

describe("ROUND 11 — the near-miss's clearance over its DERIVED domain (round-10 verifier F5: P13, P14, P15, MP6)", () => {
  it("every clearance of CLEARANCE_DOMAIN — the detector's exact 0 and its Float32 readings under the enter clearance, and the wire's ends — with EVERY kind, is stored exactly as the scene reported it, on a finished AND an aborted drive, and the server's debrief says what the shell's said", () => {
    // Not vacuous: the exact 0, readings under 0.15 and 0.2, and Float32 readings that are not two-decimal numbers.
    expect(CLEARANCE_DOMAIN[0]).toBe(0);
    expect(CLEARANCE_DOMAIN.filter((v) => v > 0 && v < 0.15).length).toBeGreaterThanOrEqual(2);
    expect(CLEARANCE_DOMAIN.filter((v) => Math.round(v * 100) / 100 !== v).length).toBeGreaterThanOrEqual(5);
    const finished = sprayAt(3, 116);
    const aborted = sprayAt(3, 116, 30);
    expect([finished.phase, aborted.phase]).toEqual(["completed", "aborted"]);
    for (const base of [finished, aborted]) {
      for (const [k, kind] of NEAR_MISS_KINDS.entries()) {
        let s = base;
        for (const [i, c] of CLEARANCE_DOMAIN.entries()) {
          s = applyNearMiss(s, { tSec: 6 + i / 10 + k / 100, kind, npcId: 5000 + 100 * k + i, clearanceM: c, relSpeedMps: 7.5 }, i % 2 === 0 ? { x: 0, y: 60 } : null);
        }
        const label = `${kind} clearances on a ${s.phase} drive`;
        const { sent, shown } = finalizeAndCapture(s);
        const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
        expect(graded.status, label).toBe("ok");
        if (graded.status !== "ok") return;
        expect((graded.wire.nearMisses ?? []).map((n) => [n.kind, n.clearanceM]), label).toEqual(CLEARANCE_DOMAIN.map((c) => [kind, c]));
        expect(graded.result.nearMisses ?? [], label).toEqual(s.nearMisses ?? []);
        const client = shown as unknown as LessonResult;
        expect(buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text, label).toBe(
          buildDebrief(s.lesson, client, { coachedMistakes: client.coachedMistakes }).text,
        );
      }
    }
  });
});

describe("ROUND 11 — the payload's clocks are the shell's Date.now() readings (round-10 verifier F6: P19, P20, MP11)", () => {
  it("the shell stamps every clock with Date.now() — the drive's start (first drive and retry) and finalize's `now` — so the domain the payload is driven over is Date.now() readings", () => {
    expect(clockCallSitesFromShell()).toEqual({ clock: "Date.now", starts: 2, nows: 1 });
    expect(EPOCH_ORIGIN_MS).toBeGreaterThan(1.7e12);
  });
  it("a Date.now() start and finish, at every millisecond remainder class, reach the server exactly — on a finished AND an aborted drive, and a missing start is stamped with the finish", () => {
    const origin = EPOCH_ORIGIN_MS - (EPOCH_ORIGIN_MS % 1000);
    // The residue classes a floor, a shift or a dropped millisecond would each move (the census walks all 1 000).
    const sample = [0, 1, 137, 499, 500, 863, 999].map((r) => EPOCH_REMAINDERS_MS[r]);
    for (const ended of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
      for (const [i, remS] of sample.entries()) {
        const remF = sample[(i + 3) % sample.length];
        const start = origin + i * 60_000 + remS;
        const finish = origin + i * 60_000 + 125_000 + remF;
        const label = `${ended.phase} start ${start} finish ${finish}`;
        const w = finalizeAtClock(ended, start, finish);
        expect([w.startedAtMs, w.finishedAtMs], label).toEqual([start, finish]);
        const graded = gradeFinishWire(JSON.parse(JSON.stringify(w)));
        expect(graded.status, label).toBe("ok");
        if (graded.status !== "ok") return;
        expect([graded.wire.startedAtMs, graded.wire.finishedAtMs], label).toEqual([start, finish]);
        const unstamped = finalizeAtClock(ended, null, finish);
        expect([unstamped.startedAtMs, unstamped.finishedAtMs], `${label} (no start)`).toEqual([finish, finish]);
      }
    }
  });
});

describe("ROUND 14 — the sandbox and the list lengths (round-13 verifier R3: YP9, YP11–YP14)", () => {
  const WIRE_SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../modules/sim/lessons/wire.ts"), "utf8").replace(/\r\n/g, "\n");
  /** A wire cap, read from wire.ts (never typed here), or a failure naming it. */
  const capFromWire = (name: string): number => {
    const m = WIRE_SRC.match(new RegExp(`\\nconst ${name} = (\\d+);\\n`));
    if (m === null) throw new Error(`wire.ts no longer declares ${name} as a literal`);
    return Number(m[1]);
  };
  it("YP9 · an ABORTED THEO-3 sandbox (a mistake experience quit half-way — a real student can do it) is never persisted: finalize shows the result and sends nothing; the same aborted drive outside a sandbox IS sent", () => {
    const ended = sprayAt(3, 116, 30);
    expect(ended.phase).toBe("aborted");
    const sandbox = finalizeAndCapture(ended, { mistakeExperience: true });
    expect(sandbox.shown).not.toBeNull();
    expect(sandbox.sent).toEqual([]);
    expect(finalizeAndCapture(ended).sent).toHaveLength(1);
  });
  it("YP11 / YP12 · every coached row and every breach row the session holds is sent and stored — counts past what any committed drive carries (12 coached rows, 6 breach rows), on a finished AND an aborted drive", () => {
    for (const base of [sprayAt(3, 116), sprayAt(3, 116, 30)]) {
      const coached = Array.from({ length: 12 }, (_, i) => ({ code: i % 2 === 0 ? "TASK_SPEED_CAP_EXCEEDED" : "SPEED_TOO_FAST_FOR_CONDITIONS", titleBg: "—", t: 1 + i }));
      const breaches = Array.from({ length: 6 }, (_, i) => ({ objectiveId: "sc-acts-gap", t: 2 + i }));
      const s: LessonSessionState = { ...base, coachedMistakes: coached, taskCapBreaches: breaches };
      const { sent } = finalizeAndCapture(s);
      expect(sent[0].coachedMistakes?.map((c) => [c.code, c.t])).toEqual(coached.map((c) => [c.code, c.t]));
      expect(sent[0].taskCapBreaches?.map((b) => [b.objectiveId, b.t])).toEqual(breaches.map((b) => [b.objectiveId, b.t]));
      const graded = gradeFinishWire(JSON.parse(JSON.stringify(sent[0])));
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") return;
      expect(graded.result.coachedMistakes?.map((c) => [c.code, c.t])).toEqual(coached.map((c) => [c.code, c.t]));
      expect(graded.result.taskCapBreaches?.map((b) => [b.objectiveId, b.t])).toEqual(breaches.map((b) => [b.objectiveId, b.t]));
    }
  });
  it("YP13 / YP14 · the coached list and the rule-event list are cut at EXACTLY the wire's own caps (read from wire.ts): the cap itself is sent whole, one more is cut to the cap", async () => {
    const { serializeCoachedMistakes, serializeRuleEvents } = await import("@/modules/sim/lessons/wire");
    const coachedCap = capFromWire("MAX_COACHED_MISTAKES_WIRE");
    const eventCap = capFromWire("MAX_EVENTS");
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ code: "SPEED_TOO_FAST_FOR_CONDITIONS", t: i / 10 }));
    expect(serializeCoachedMistakes(rows(coachedCap))).toHaveLength(coachedCap);
    expect(serializeCoachedMistakes(rows(coachedCap + 1))).toHaveLength(coachedCap);
    const { makeViolation } = await import("@/modules/sim/rules");
    const events = (n: number) => Array.from({ length: n }, (_, i) => makeViolation("SPEED_TOO_FAST_FOR_CONDITIONS", i / 10));
    expect(serializeRuleEvents(events(eventCap))).toHaveLength(eventCap);
    expect(serializeRuleEvents(events(eventCap + 1))).toHaveLength(eventCap);
  });
});
