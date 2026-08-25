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
// Deep imports, not the sim/traces barrel: that barrel re-exports 65 scripted-
// drive recorders (audit M-26), and this file rides the client bundle.
import { MAX_STORED_EVENTS, MAX_STORED_SAMPLES } from "../traces/compact";
import { parseScenarioTrace } from "../traces/parse";
import type { ScenarioTrace } from "../traces/types";
import {
  escalationQueue,
  foldTrainingScore,
  isEscalationMultiplier,
  type PenaltyEscalation,
} from "./escalation";
import { examTerminationFor } from "./exam";
import { examVariantById } from "./examBank";
import { scenarioLessonById } from "./scenario/resolve";
import { lessonById } from "./specs";
import type {
  EventPosition,
  LessonResult,
  ObjectiveDetail,
  ObjectiveOutcome,
  RedMetVia,
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
  /**
   * S1 (additive): the A10 measurement detail of this objective (park
   * attempts/alignment, reaction band, …). MEASUREMENT/RUBRIC METADATA ONLY
   * — validated shape-by-shape server-side and used for the scenario rubric
   * stars + history display; the official score/verdict NEVER derives from
   * it (a tampered detail moves a star, never a penalty point). Malformed
   * details drop silently, like A15 positions.
   */
  detail?: ObjectiveDetail;
}

/** Contextual micro-quizzes answered during the drive (feeds the debrief). */
export interface WireMicroQuiz {
  total: number;
  correct: number;
}

/**
 * One violation the drive SHOWED and deliberately did not score (the teach /
 * learn-only arms — lessons/types.ts CoachedMistake). CODE AND TIME ONLY, no
 * title: the server re-derives the Bulgarian copy from its own catalog, so a
 * client cannot author a sentence into the debrief it will be handed back
 * (ADR-002 — the same reason WireRuleEvent carries no copy). Display/debrief
 * metadata, never the score: the worst a tampered list can do is add an
 * „Учебни моменти" row to the student's own debrief, and OMITTING it merely
 * reproduces the old behaviour — the direction this channel exists to end.
 */
export interface WireCoachedMistake {
  code: string;
  t: number;
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
  /**
   * The shown-but-not-charged violations (WireCoachedMistake above) — feeds
   * the SERVER debrief's coached channel, which is the text the student
   * actually reads (`LessonPlayShell.tsx` renders `saveResult.debriefText`).
   * Absent on older clients → the debrief scopes its claims to the sheet.
   */
  coachedMistakes?: WireCoachedMistake[];
  /**
   * S1 (scenario sessions): ids of the template's rubric observation moments
   * the student's recorded glances covered (lessons/scenario/observation.ts
   * maps the attempt trace client-side). RUBRIC METADATA ONLY — bounded and
   * validated; drives the observation stars line, never the official score.
   */
  observedMomentIds?: string[];
  /**
   * I-2 „Твоят дубъл" (scenario sessions): the student's OWN recorded drive,
   * already reduced for storage client-side (traces/compact.ts — 10 Hz, cm
   * precision, ≤ MAX_STORED_SAMPLES). DISPLAY DATA ONLY, like the A15
   * positions: the graded truth is the server-rebuilt catalog event log, so a
   * tampered trace can at worst make the student's own replay lie to the
   * student. Absent, oversized, foreign-scenario or malformed payloads DROP
   * SILENTLY — an optional bulky channel must never cost a real session its
   * save.
   */
  attemptTrace?: ScenarioTrace;
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
/** S1 caps: observation-moment id list (templates author ≤ a handful). */
const MAX_OBSERVED_MOMENTS = 32;
const MAX_MOMENT_ID_LEN = 64;
/** Coached-mistake list cap — mirrors engine.ts MAX_COACHED_MISTAKES. */
const MAX_COACHED_MISTAKES_WIRE = 100;
const MAX_CODE_LEN = 64;

// ---------------------------------------------------------------------------
// Client side: serialize
// ---------------------------------------------------------------------------

export function serializeRuleEvents(
  events: ReadonlyArray<ScorableEvent>,
  escalations: ReadonlyArray<PenaltyEscalation> = [],
  positions: ReadonlyArray<EventPosition> = [],
): WireRuleEvent[] {
  // (code, t) → pending multipliers, consumed once each. Borrowed from
  // escalation.ts rather than mirrored: this used to be a third hand-written
  // copy of the same queue, and the point of this lane is that copies drift.
  const takeMultiplier = escalationQueue(escalations);
  // A15: (kind, code, t) → pending positions, consumed once each (same scheme).
  // Left inline: different key space (kind is part of it) and a different
  // payload, so sharing would mean genericising a helper whose whole value is
  // that it says one thing.
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
      const multiplier = takeMultiplier(e.code, e.t);
      if (multiplier > 1) wire.penaltyMultiplier = multiplier;
    } else if (e.situation !== undefined) {
      // THE PRAISE'S OWN DISCRIMINATOR (round 10, 2026-08-25). Set only when
      // `YIELD_PRAISE_SITUATION_COPY` retitled the pooled `YIELDED_TO_PRIORITY`
      // — three of its nine situations — so nothing new crosses for any
      // commendation that shipped before it existed. Without this the server's
      // `rebuildRuleEvents` recomputes the POOLED title and the end screen
      // prints two names for one act: «Похвали» from the client's own events,
      // «Разбор» from the server's rebuild, a few centimetres apart.
      //
      // Same channel, same 64-char cap and the same trust as a violation's
      // `detail`: a forged value can only select another row of that table (an
      // unknown one falls back to the pooled title), so it moves a sentence of
      // praise and a positive concept tag. It cannot reach a point, a verdict
      // or a penalty — those are rebuilt from `code` alone, as they always were.
      wire.detail = e.situation;
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

/**
 * The shown-but-not-charged record → wire. Titles are dropped here on purpose
 * (see WireCoachedMistake); the cap matches the engine's, so a capped state
 * serializes whole.
 */
export function serializeCoachedMistakes(
  coached: ReadonlyArray<{ code: string; t: number }>,
): WireCoachedMistake[] {
  return coached
    .slice(0, MAX_COACHED_MISTAKES_WIRE)
    .map((c) => ({ code: c.code, t: c.t }));
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
    const outcome: WireObjectiveOutcome = { id: ob.id, done: ob.done, completedAtSec };
    // S1: measurement detail — malformed shapes drop silently (metadata,
    // not worth a reject; the A15 position treatment).
    const detail = parseWireObjectiveDetail(ob.detail);
    if (detail !== null) outcome.detail = detail;
    objectives.push(outcome);
  }

  const microQuiz = parseMicroQuiz(o.microQuiz);
  if (microQuiz === "invalid") return null;

  const nearMisses = parseNearMisses(o.nearMisses);
  if (nearMisses === "invalid") return null;

  const coachedMistakes = parseCoachedMistakes(o.coachedMistakes);
  if (coachedMistakes === "invalid") return null;

  const observedMomentIds = parseObservedMomentIds(o.observedMomentIds);
  if (observedMomentIds === "invalid") return null;

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
  if (coachedMistakes !== null) wire.coachedMistakes = coachedMistakes;
  if (observedMomentIds !== null) wire.observedMomentIds = observedMomentIds;

  const attemptTrace = parseAttemptTrace(o.attemptTrace, o.lessonId);
  if (attemptTrace !== null) wire.attemptTrace = attemptTrace;
  return wire;
}

/**
 * I-2: validate the uploaded attempt trace — null means "no trace on this
 * session", for every reason (absent, not our shape, not reduced, or not
 * about this lesson). Never "invalid": dropping a replay is the correct
 * failure mode, refusing the whole finish payload is not.
 *
 * `parseScenarioTrace` already rebuilds a clean object and rejects NaN
 * positions, unordered timestamps and foreign versions. The three checks on
 * top of it are the ones only this layer can make:
 *   • kind must be "attempt" — a client must not be able to file its drive as
 *     an authored "shadow"/"mistake" demo;
 *   • scenarioId must be the lesson being finished, or the replay would render
 *     one drive inside another scenario's world;
 *   • size must be within the client-side reduction caps, so an unreduced
 *     (or hostile) payload never reaches the compressor.
 */
function parseAttemptTrace(value: unknown, lessonId: unknown): ScenarioTrace | null {
  if (value === undefined || value === null) return null;
  const trace = parseScenarioTrace(value);
  if (trace === null) return null;
  if (trace.meta.kind !== "attempt") return null;
  if (trace.meta.scenarioId !== lessonId) return null;
  if (trace.samples.length > MAX_STORED_SAMPLES) return null;
  if (trace.events.length > MAX_STORED_EVENTS) return null;
  return trace;
}

/** S1: parse the optional observed-moment list — null (absent), the deduped
 *  validated list, or "invalid" (present but not our payload shape). */
function parseObservedMomentIds(value: unknown): string[] | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_OBSERVED_MOMENTS) return "invalid";
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_MOMENT_ID_LEN) {
      return "invalid";
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * S1: shape-validate one A10 objective detail from the wire. Returns the
 * REBUILT clean object (unknown fields dropped) or null — malformed details
 * are display/rubric metadata and drop silently.
 */
function parseWireObjectiveDetail(value: unknown): ObjectiveDetail | null {
  if (typeof value !== "object" || value === null) return null;
  const d = value as Record<string, unknown>;
  const numOrNull = (v: unknown, min: number, max: number): number | null | "bad" =>
    v === null ? null : isFiniteNum(v) && v >= min && v <= max ? v : "bad";
  switch (d.kind) {
    case "parkInBay": {
      if (!Number.isInteger(d.attempts) || (d.attempts as number) < 0 || (d.attempts as number) > 1000) return null;
      if (typeof d.inBay !== "boolean") return null;
      const centerOffsetM = numOrNull(d.centerOffsetM, 0, 1000);
      const headingOffsetDeg = numOrNull(d.headingOffsetDeg, 0, 180);
      if (centerOffsetM === "bad" || headingOffsetDeg === "bad") return null;
      const alignment = d.alignment;
      if (alignment !== null && alignment !== "centered" && alignment !== "acceptable" && alignment !== "sloppy") return null;
      return {
        kind: "parkInBay",
        attempts: d.attempts as number,
        inBay: d.inBay,
        centerOffsetM,
        headingOffsetDeg,
        alignment,
      };
    }
    case "emergencyStop": {
      const outcomes = ["pending", "stoppedInTime", "hitLeadCar", "passedWithoutStopping", "collision"];
      if (typeof d.outcome !== "string" || !outcomes.includes(d.outcome)) return null;
      const reactionTimeSec = numOrNull(d.reactionTimeSec, 0, 3600);
      const stopGapM = numOrNull(d.stopGapM, -100, 1000);
      if (reactionTimeSec === "bad" || stopGapM === "bad") return null;
      const band = d.band;
      if (band !== null && band !== "otlichen" && band !== "dobur" && band !== "baven") return null;
      return {
        kind: "emergencyStop",
        outcome: d.outcome as "pending",
        reactionTimeSec,
        band,
        stopGapM,
      };
    }
    case "passSignal": {
      if (!Number.isInteger(d.redsMetInRun) || (d.redsMetInRun as number) < 0 || (d.redsMetInRun as number) > 1000) return null;
      if (typeof d.redMetHere !== "boolean") return null;
      // `redMetVia` is ADDITIVE (2026-08-17): payloads written before it — every
      // stored session and recorded trace — simply omit it and decode to null,
      // which the debrief renders as the sentence true of BOTH signatures
      // rather than inventing one. Absent is legal; a wrong value is not.
      const via = d.redMetVia;
      if (via !== undefined && via !== null && via !== "waitedOutGreen" && via !== "controllerProceed") {
        return null;
      }
      return {
        kind: "passSignal",
        redsMetInRun: d.redsMetInRun as number,
        redMetHere: d.redMetHere,
        redMetVia: (via ?? null) as RedMetVia | null,
      };
    }
    case "roundabout": {
      if (typeof d.entered !== "boolean" || typeof d.exitSignaled !== "boolean") return null;
      return { kind: "roundabout", entered: d.entered, exitSignaled: d.exitSignaled };
    }
    case "threePointTurn": {
      if (typeof d.entered !== "boolean") return null;
      if (!Number.isInteger(d.reversals) || (d.reversals as number) < 0 || (d.reversals as number) > 1000) return null;
      if (!Number.isInteger(d.movements) || (d.movements as number) < 0 || (d.movements as number) > 1001) return null;
      const headingToTargetDeg = numOrNull(d.headingToTargetDeg, 0, 180);
      if (headingToTargetDeg === "bad") return null;
      return {
        kind: "threePointTurn",
        entered: d.entered,
        reversals: d.reversals as number,
        movements: d.movements as number,
        headingToTargetDeg,
      };
    }
    default:
      return null;
  }
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
/**
 * Coached-mistake list — same tri-state contract as parseNearMisses. A code
 * the catalog does not know DROPS SILENTLY rather than rejecting: the list is
 * debrief metadata from possibly-newer clients, and losing one row costs a
 * teach line while rejecting costs the whole session its save. Shape errors
 * still reject — a malformed list is not our payload.
 */
function parseCoachedMistakes(value: unknown): WireCoachedMistake[] | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_COACHED_MISTAKES_WIRE) return "invalid";
  const out: WireCoachedMistake[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return "invalid";
    const c = item as Record<string, unknown>;
    if (typeof c.code !== "string" || c.code.length > MAX_CODE_LEN) return "invalid";
    if (!isFiniteNum(c.t) || c.t < 0 || c.t > MAX_SESSION_SEC) return "invalid";
    out.push({ code: c.code, t: c.t });
  }
  return out;
}

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
      // `detail` is the praise's situation on this side too (serializeRuleEvents
      // above) — the one input that decides which of the retitled acts this is.
      // Rebuilt through the SAME catalog function the client used, so an
      // unknown or absent value lands on the pooled row on both sides rather
      // than on two different rows.
      out.push(makeCommendation(e.code as CommendationCode, e.t, e.detail));
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
      // S1: the validated measurement detail rides through for the rubric +
      // history display (never into the official score — see the field doc).
      ...(w?.detail !== undefined ? { detail: w.detail } : {}),
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
  // stores (the variant id IS the lessonId). S1: scenario ids
  // (<templateId>@L<n>) resolve the same way — the server RECOMPILES the
  // micro-lesson from the pure template, so it regrades identically.
  const lesson =
    lessonById(wire.lessonId) ??
    examVariantById(wire.lessonId) ??
    scenarioLessonById(wire.lessonId);
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
  /**
   * OVER THE ROWS THE LEDGER CHARGED, AND NO OTHERS — one function, called from
   * here and from `engine.ts buildLessonResult`, and it is the same call
   * because the two must never again be able to differ.
   *
   * `LessonPlayShell.tsx:2683` renders `saveResult.debriefText` whenever the
   * save succeeds and falls back to the client's own text only when it fails,
   * so a divergence here is not a second opinion — it is the opinion. The
   * filter used to be written out in both files (neither may import the other,
   * and `escalation.ts` did not yet host it); they were repaired in separate
   * lanes, and the window between those lanes is what shipped «Тренировъчен
   * резултат: 25 наказателни т.» beside an official 10. escalation.ts's header
   * carries that drive, the re-measurement, and why comparing the two debrief
   * TEXTS is not enough to catch the next one.
   */
  const { effectiveTotalPoints, escalated } = foldTrainingScore(
    summary.mistakes,
    escalations,
  );

  // A13: for examMode specs the termination record is REDERIVED here from
  // the rebuilt catalog events — never read from the client (the same pure
  // fold the live session ran, so both sides always agree on reason + time).
  const examTermination =
    lesson.examMode === true ? examTerminationFor(events) : null;

  /**
   * The shown-but-not-charged record, TITLED BY OUR OWN CATALOG. The wire
   * carries code+t only (WireCoachedMistake — ADR-002: a client must not be
   * able to author debrief copy); an uncatalogued code drops here for the
   * parse helper's reason. This is the producer for the SERVER debrief's
   * `DebriefContext.coachedMistakes` — the channel that was documented,
   * filtered and tested while NO live call site fed it, which is how
   * «чисто каране без нито едно нарушение» shipped over a drive whose HUD
   * had raised «Превишена скорост» twice (findings ef1eb9cf · a448e5f0 ·
   * 0fde4ec0 · faae7057).
   */
  const coachedMistakes = (wire.coachedMistakes ?? []).flatMap((c) =>
    c.code in VIOLATIONS
      ? [{ code: c.code, titleBg: VIOLATIONS[c.code as ViolationCode].titleBg, t: c.t }]
      : [],
  );

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
    ...(coachedMistakes.length > 0 ? { coachedMistakes } : {}),
  };

  return { status: "ok", lesson, wire, events, result };
}
