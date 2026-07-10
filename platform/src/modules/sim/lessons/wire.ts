/**
 * Wire format for the client → server hop at session end.
 *
 * The lesson runs client-side (rule engine is deterministic in the browser),
 * but the SERVER must never trust client-computed scores: the client sends
 * only compact event references ({kind, code, t, detail}), and the server
 * REBUILDS canonical events from the violation catalog — severity, points,
 * titles and law refs always come from the catalog, so a tampered client can
 * at worst lie about *which* events happened, never about what they cost.
 * (Full anti-cheat = server-side replay of SimTicks; out of scope for v1.)
 *
 * A9 escalation over the wire: a violation ref MAY carry the coach's repeat
 * multiplier (`penaltyMultiplier`). It is validated against the fixed
 * escalation set (×1.5/×2.0 only) and applied ONLY to the training-layer
 * effective score — the official score/verdict is always rebuilt from catalog
 * base points, so a tampered multiplier can at worst hide/show the „повторна
 * грешка" annotation, never lower the official result.
 */

import type { LessonSpec } from "../contracts";
import {
  buildSessionSummary,
  COMMENDATIONS,
  VIOLATIONS,
  makeCommendation,
  makeViolation,
  type CommendationCode,
  type ScorableEvent,
  type ViolationCode,
} from "../rules";
import { PRE_DRIVE_STEPS, type PreDriveStepId } from "../procedures";
import {
  applyEscalations,
  isEscalationMultiplier,
  type PenaltyEscalation,
} from "./escalation";
import { lessonById } from "./specs";
import type { LessonResult, ObjectiveOutcome } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WireRuleEvent {
  kind: "violation" | "commendation";
  code: string;
  t: number;
  detail?: string;
  /**
   * A9: the coach's repeat escalation for this violation (×1.5 or ×2.0 only;
   * ×1.0 is implicit/absent). Affects ONLY the effective training score.
   */
  penaltyMultiplier?: number;
}

export interface WireObjectiveOutcome {
  id: string;
  done: boolean;
  completedAtSec: number | null;
}

/** Contextual micro-quizzes answered during the drive (feeds the debrief). */
export interface WireMicroQuiz {
  total: number;
  correct: number;
}

export interface FinishLessonWire {
  lessonId: string;
  startedAtMs: number;
  finishedAtMs: number;
  aborted: boolean;
  ruleEvents: WireRuleEvent[];
  objectives: WireObjectiveOutcome[];
  /** Micro-quiz tally, if any quizzes were shown; undefined otherwise. */
  microQuiz?: WireMicroQuiz;
}

/** Hard caps — a session cannot legitimately exceed these. */
const MAX_EVENTS = 500;
const MAX_DETAIL_LEN = 64;
const MAX_SESSION_SEC = 4 * 60 * 60;
/** A session cannot legitimately show more micro-quizzes than this. */
const MAX_MICRO_QUIZZES = 20;

// ---------------------------------------------------------------------------
// Client side: serialize
// ---------------------------------------------------------------------------

export function serializeRuleEvents(
  events: ReadonlyArray<ScorableEvent>,
  escalations: ReadonlyArray<PenaltyEscalation> = [],
): WireRuleEvent[] {
  // (code, t) → pending multipliers, consumed once each (mirrors escalation.ts).
  const pending = new Map<string, number[]>();
  for (const esc of escalations) {
    const key = `${esc.code}@${esc.t}`;
    const list = pending.get(key);
    if (list) list.push(esc.multiplier);
    else pending.set(key, [esc.multiplier]);
  }
  return events.slice(0, MAX_EVENTS).map((e) => {
    const wire: WireRuleEvent = { kind: e.kind, code: e.code, t: e.t };
    if (e.kind === "violation") {
      if (e.detail !== undefined) wire.detail = e.detail;
      const multiplier = pending.get(`${e.code}@${e.t}`)?.shift();
      if (multiplier !== undefined && multiplier > 1) wire.penaltyMultiplier = multiplier;
    }
    return wire;
  });
}

// ---------------------------------------------------------------------------
// Server side: parse + rebuild canonical events
// ---------------------------------------------------------------------------

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Parse the whole finish payload; null = reject the request. */
export function parseFinishLessonWire(value: unknown): FinishLessonWire | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;

  if (typeof o.lessonId !== "string" || o.lessonId.length > 64) return null;
  if (!isFiniteNum(o.startedAtMs) || !isFiniteNum(o.finishedAtMs)) return null;
  if (o.finishedAtMs < o.startedAtMs) return null;
  if (o.finishedAtMs - o.startedAtMs > MAX_SESSION_SEC * 1000) return null;
  if (typeof o.aborted !== "boolean") return null;
  if (!Array.isArray(o.ruleEvents) || o.ruleEvents.length > MAX_EVENTS) return null;
  if (!Array.isArray(o.objectives) || o.objectives.length > 50) return null;

  const ruleEvents: WireRuleEvent[] = [];
  for (const item of o.ruleEvents) {
    if (typeof item !== "object" || item === null) return null;
    const e = item as Record<string, unknown>;
    if (e.kind !== "violation" && e.kind !== "commendation") return null;
    if (typeof e.code !== "string" || !isFiniteNum(e.t) || e.t < 0) return null;
    const wire: WireRuleEvent = { kind: e.kind, code: e.code, t: e.t };
    if (typeof e.detail === "string" && e.detail.length <= MAX_DETAIL_LEN) {
      wire.detail = e.detail;
    }
    if (e.penaltyMultiplier !== undefined) {
      // Strict: only the coach's escalation ladder exists (×1.5/×2.0), and
      // only violations can escalate — anything else is not our payload.
      if (e.kind !== "violation" || !isEscalationMultiplier(e.penaltyMultiplier)) return null;
      wire.penaltyMultiplier = e.penaltyMultiplier;
    }
    ruleEvents.push(wire);
  }

  const objectives: WireObjectiveOutcome[] = [];
  for (const item of o.objectives) {
    if (typeof item !== "object" || item === null) return null;
    const ob = item as Record<string, unknown>;
    if (typeof ob.id !== "string" || typeof ob.done !== "boolean") return null;
    const completedAtSec = isFiniteNum(ob.completedAtSec) ? ob.completedAtSec : null;
    objectives.push({ id: ob.id, done: ob.done, completedAtSec });
  }

  const microQuiz = parseMicroQuiz(o.microQuiz);
  if (microQuiz === "invalid") return null;

  const wire: FinishLessonWire = {
    lessonId: o.lessonId,
    startedAtMs: o.startedAtMs,
    finishedAtMs: o.finishedAtMs,
    aborted: o.aborted,
    ruleEvents,
    objectives,
  };
  if (microQuiz !== null) wire.microQuiz = microQuiz;
  return wire;
}

/** Parse an optional micro-quiz tally: null (absent), the value, or "invalid". */
function parseMicroQuiz(value: unknown): WireMicroQuiz | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return "invalid";
  const q = value as Record<string, unknown>;
  if (!isFiniteNum(q.total) || !isFiniteNum(q.correct)) return "invalid";
  const total = Math.trunc(q.total);
  const correct = Math.trunc(q.correct);
  if (total < 0 || total > MAX_MICRO_QUIZZES) return "invalid";
  if (correct < 0 || correct > total) return "invalid";
  return { total, correct };
}

/**
 * Rebuild CANONICAL scorable events from wire references. Unknown codes are
 * rejected (null) — a payload naming codes we never emitted is not ours.
 * Pre-drive events regain their step-specific titles from `detail`.
 */
export function rebuildRuleEvents(wire: ReadonlyArray<WireRuleEvent>): ScorableEvent[] | null {
  const out: ScorableEvent[] = [];
  for (const e of wire) {
    if (e.kind === "violation") {
      if (!(e.code in VIOLATIONS)) return null;
      const code = e.code as ViolationCode;
      const overrides: { titleBg?: string; detail?: string } = {};
      if (e.detail !== undefined) overrides.detail = e.detail;
      const stepTitle = preDriveStepTitle(code, e.detail);
      if (stepTitle !== null) overrides.titleBg = stepTitle;
      out.push(makeViolation(code, e.t, overrides));
    } else {
      if (!(e.code in COMMENDATIONS)) return null;
      out.push(makeCommendation(e.code as CommendationCode, e.t));
    }
  }
  return out;
}

/** Recreate the machine's per-step titles (procedures/machine.ts) from detail. */
function preDriveStepTitle(code: ViolationCode, detail: string | undefined): string | null {
  if (detail === undefined || !(detail in PRE_DRIVE_STEPS)) return null;
  const step = PRE_DRIVE_STEPS[detail as PreDriveStepId];
  if (code === "PREDRIVE_WRONG_ORDER") return `Нарушен ред: ${step.titleBg.toLowerCase()}`;
  if (code === "PREDRIVE_STEP_SKIPPED") return `Пропусната стъпка: ${step.titleBg.toLowerCase()}`;
  return null;
}

/**
 * Reconcile claimed objective outcomes against the lesson spec: every spec
 * objective exactly once, in spec order; unknown/duplicate ids reject.
 */
export function reconcileObjectiveOutcomes(
  lesson: LessonSpec,
  wire: ReadonlyArray<WireObjectiveOutcome>,
): ObjectiveOutcome[] | null {
  const byId = new Map<string, WireObjectiveOutcome>();
  for (const w of wire) {
    if (byId.has(w.id)) return null;
    byId.set(w.id, w);
  }
  for (const id of byId.keys()) {
    if (!lesson.objectives.some((o) => o.id === id)) return null;
  }
  return lesson.objectives.map((spec) => {
    const w = byId.get(spec.id);
    return {
      id: spec.id,
      titleBg: spec.titleBg,
      done: w?.done ?? false,
      completedAtSec: w?.done ? (w.completedAtSec ?? null) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Full server-side grading pipeline
// ---------------------------------------------------------------------------

export type GradedFinishWire =
  | { status: "invalid" }
  | { status: "unknown-lesson" }
  | {
      status: "ok";
      lesson: LessonSpec;
      wire: FinishLessonWire;
      /** Canonical rebuilt events — the only thing scores derive from. */
      events: ScorableEvent[];
      result: LessonResult;
    };

/**
 * parse → resolve lesson → rebuild canonical events → reconcile objectives →
 * official summary fold → verdict. The single entry the server action calls;
 * everything here is pure and unit-testable.
 */
export function gradeFinishWire(input: unknown): GradedFinishWire {
  const wire = parseFinishLessonWire(input);
  if (wire === null) return { status: "invalid" };

  const lesson = lessonById(wire.lessonId);
  if (lesson === undefined) return { status: "unknown-lesson" };

  const events = rebuildRuleEvents(wire.ruleEvents);
  if (events === null) return { status: "invalid" };

  const objectives = reconcileObjectiveOutcomes(lesson, wire.objectives);
  if (objectives === null) return { status: "invalid" };

  const summary = buildSessionSummary(events);
  const completedAll = objectives.every((o) => o.done);

  // A9: fold the (validated) wire escalations into the training-layer score.
  // Official score/verdict stay on catalog base points — see file header.
  const escalations: PenaltyEscalation[] = [];
  for (const e of wire.ruleEvents) {
    if (e.kind === "violation" && e.penaltyMultiplier !== undefined) {
      escalations.push({ code: e.code, t: e.t, multiplier: e.penaltyMultiplier });
    }
  }
  const { effectiveTotalPoints, escalated } = applyEscalations(summary.mistakes, escalations);

  const result: LessonResult = {
    lessonId: lesson.id,
    summary,
    objectives,
    completedAll,
    aborted: wire.aborted,
    passed: summary.passed && completedAll && !wire.aborted,
    score: summary.score.totalPoints,
    effectiveScore: effectiveTotalPoints,
    escalations: escalated,
    durationSec: (wire.finishedAtMs - wire.startedAtMs) / 1000,
  };

  return { status: "ok", lesson, wire, events, result };
}
