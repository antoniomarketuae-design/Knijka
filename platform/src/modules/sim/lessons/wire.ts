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
import { examTerminationFor } from "./exam";
import { examVariantById } from "./examBank";
import { lessonById } from "./specs";
import type {
  EventPosition,
  LessonResult,
  ObjectiveOutcome,
  SessionNearMiss,
} from "./types";

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
  /**
   * A15: world position of the event, meters (both present or both absent).
   * DISPLAY METADATA ONLY — the server persists it for the mistake map /
   * future replay and never derives any grading from it (a tampered position
   * moves a dot on a map, nothing else).
   */
  x?: number;
  y?: number;
}

/** A15: one near-miss encounter over the wire (session stat, never graded). */
export interface WireNearMiss {
  tSec: number;
  kind: "vehicle" | "pedestrian" | "cyclist";
  clearanceM: number;
  relSpeedMps: number;
  /** Player position at resolution (display metadata, like WireRuleEvent.x/y). */
  x?: number;
  y?: number;
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
  /** A15: near-miss encounters (validated stat; absent on older clients). */
  nearMisses?: WireNearMiss[];
}

/** Hard caps — a session cannot legitimately exceed these. */
const MAX_EVENTS = 500;
const MAX_DETAIL_LEN = 64;
const MAX_SESSION_SEC = 4 * 60 * 60;
/** A session cannot legitimately show more micro-quizzes than this. */
const MAX_MICRO_QUIZZES = 20;
/** A15 caps: near-miss list size + sane world-coordinate bound, meters. */
const MAX_NEAR_MISSES = 100;
const MAX_ABS_COORD_M = 100_000;

// ---------------------------------------------------------------------------
// Client side: serialize
// ---------------------------------------------------------------------------

export function serializeRuleEvents(
  events: ReadonlyArray<ScorableEvent>,
  escalations: ReadonlyArray<PenaltyEscalation> = [],
  positions: ReadonlyArray<EventPosition> = [],
): WireRuleEvent[] {
  // (code, t) → pending multipliers, consumed once each (mirrors escalation.ts).
  const pending = new Map<string, number[]>();
  for (const esc of escalations) {
    const key = `${esc.code}@${esc.t}`;
    const list = pending.get(key);
    if (list) list.push(esc.multiplier);
    else pending.set(key, [esc.multiplier]);
  }
  // A15: (kind, code, t) → pending positions, consumed once each (same scheme).
  const pendingPos = new Map<string, Array<{ x: number; y: number }>>();
  for (const p of positions) {
    const key = `${p.kind}:${p.code}@${p.t}`;
    const list = pendingPos.get(key);
    if (list) list.push({ x: p.x, y: p.y });
    else pendingPos.set(key, [{ x: p.x, y: p.y }]);
  }
  return events.slice(0, MAX_EVENTS).map((e) => {
    const wire: WireRuleEvent = { kind: e.kind, code: e.code, t: e.t };
    if (e.kind === "violation") {
      if (e.detail !== undefined) wire.detail = e.detail;
      const multiplier = pending.get(`${e.code}@${e.t}`)?.shift();
      if (multiplier !== undefined && multiplier > 1) wire.penaltyMultiplier = multiplier;
    }
    const pos = pendingPos.get(`${e.kind}:${e.code}@${e.t}`)?.shift();
    if (pos !== undefined) {
      wire.x = pos.x;
      wire.y = pos.y;
    }
    return wire;
  });
}

/** A15: session near-misses → wire (positions may be null → omitted). */
export function serializeNearMisses(
  nearMisses: ReadonlyArray<SessionNearMiss>,
): WireNearMiss[] {
  return nearMisses.slice(0, MAX_NEAR_MISSES).map((n) => {
    const wire: WireNearMiss = {
      tSec: n.tSec,
      kind: n.kind,
      clearanceM: n.clearanceM,
      relSpeedMps: n.relSpeedMps,
    };
    if (n.x !== null && n.y !== null) {
      wire.x = n.x;
      wire.y = n.y;
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
    // A15: optional position — both coordinates, finite, world-plausible.
    // Malformed positions drop silently (display metadata, not worth a
    // reject); a half-pair is kept out the same way.
    if (isPlausibleCoord(e.x) && isPlausibleCoord(e.y)) {
      wire.x = e.x;
      wire.y = e.y;
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

  const nearMisses = parseNearMisses(o.nearMisses);
  if (nearMisses === "invalid") return null;

  const wire: FinishLessonWire = {
    lessonId: o.lessonId,
    startedAtMs: o.startedAtMs,
    finishedAtMs: o.finishedAtMs,
    aborted: o.aborted,
    ruleEvents,
    objectives,
  };
  if (microQuiz !== null) wire.microQuiz = microQuiz;
  if (nearMisses !== null) wire.nearMisses = nearMisses;
  return wire;
}

/** A15: finite number inside the sane world-coordinate bound. */
function isPlausibleCoord(v: unknown): v is number {
  return isFiniteNum(v) && Math.abs(v) <= MAX_ABS_COORD_M;
}

/**
 * A15: parse the optional near-miss list: null (absent), the validated list,
 * or "invalid" (a present-but-malformed list is not our payload). Stats are
 * bounded (clearance 0–50 m, relative speed 0–200 m/s) — generous physical
 * envelopes, not grading thresholds; nothing here ever scores.
 */
function parseNearMisses(value: unknown): WireNearMiss[] | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_NEAR_MISSES) return "invalid";
  const out: WireNearMiss[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return "invalid";
    const n = item as Record<string, unknown>;
    if (n.kind !== "vehicle" && n.kind !== "pedestrian" && n.kind !== "cyclist") {
      return "invalid";
    }
    if (!isFiniteNum(n.tSec) || n.tSec < 0 || n.tSec > MAX_SESSION_SEC) return "invalid";
    if (!isFiniteNum(n.clearanceM) || n.clearanceM < 0 || n.clearanceM > 50) return "invalid";
    if (!isFiniteNum(n.relSpeedMps) || n.relSpeedMps < 0 || n.relSpeedMps > 200) {
      return "invalid";
    }
    const wire: WireNearMiss = {
      tSec: n.tSec,
      kind: n.kind,
      clearanceM: n.clearanceM,
      relSpeedMps: n.relSpeedMps,
    };
    if (isPlausibleCoord(n.x) && isPlausibleCoord(n.y)) {
      wire.x = n.x;
      wire.y = n.y;
    }
    out.push(wire);
  }
  return out;
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

  // B1b: exam-bank ids resolve by REGENERATION — the server rebuilds the
  // exact LessonSpec from the variant id (same pure generator the client
  // played), so grading integrity never depends on client-supplied spec data
  // and the SimSession row needs nothing beyond the lessonId it already
  // stores (the variant id IS the lessonId).
  const lesson = lessonById(wire.lessonId) ?? examVariantById(wire.lessonId);
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

  // A13: for examMode specs the termination record is REDERIVED here from
  // the rebuilt catalog events — never read from the client (the same pure
  // fold the live session ran, so both sides always agree on reason + time).
  const examTermination =
    lesson.examMode === true ? examTerminationFor(events) : null;

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
    ...(examTermination !== null ? { examTermination } : {}),
  };

  return { status: "ok", lesson, wire, events, result };
}
