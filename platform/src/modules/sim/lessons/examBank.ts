/**
 * B1b — THE EXAM BANK generator: 1000+ honestly distinct, deterministically
 * replayable simulator exam variants over the authored data in
 * examBankData.ts (doc 72 §16 is the contract this file implements).
 *
 * A variant id IS its recipe: `EX-<shell>-<condition>-<NNNN>`
 * (e.g. EX-D-N2-0417) — shell letter, condition code, and the 4-digit index
 * into the shell's enumerated list of VALID slot assignments (mixed-radix
 * ascending over the slot option lists, filtered by the опасна-exposure
 * budget: every exam stages 2–3 termination-class encounters, doc 72 §16
 * constraint 3). The same id therefore always rebuilds the same LessonSpec —
 * on the client for play and on the server for grading (wire.ts resolves
 * bank ids next to the static lessons), with zero stored state.
 *
 * Determinism is law: nothing here reads Date.now() or Math.random(). The
 * one entropy point — „Нов изпит" — takes a caller-provided seed and runs a
 * fixed-arithmetic PRNG (mulberry32); the resulting ID is then fully
 * deterministic to replay. Per-session staging jitter stays where it always
 * was (the director derives it from lessonSeed(spec.id)) and per doc 72 §16
 * does NOT count as variety — the bank never relies on it.
 */

import type { LessonObjective, LessonSpec, StagedEventSpec } from "../contracts";
import {
  EXAM_BANK_CONCEPT_IDS,
  EXAM_CONDITIONS,
  EXAM_SHELLS,
  type ExamCondition,
  type ExamRouteShell,
} from "./examBankData";
import { EXAM_LESSON, L7_PARKING_BAY } from "./specs";

/** Официален exposure budget: termination-class encounters per exam. */
export const EXAM_MIN_TERMINAL_ENCOUNTERS = 2;
export const EXAM_MAX_TERMINAL_ENCOUNTERS = 3;

// ---------------------------------------------------------------------------
// Valid-assignment enumeration (per shell, memoized)
// ---------------------------------------------------------------------------

interface ShellIndex {
  shell: ExamRouteShell;
  /** Every budget-valid option-index vector, mixed-radix ascending. */
  assignments: number[][];
  /** digits.join(",") → position in `assignments` (draw encoding). */
  position: Map<string, number>;
}

const shellIndexCache = new Map<string, ShellIndex>();

function shellIndex(code: string): ShellIndex | undefined {
  const cached = shellIndexCache.get(code);
  if (cached) return cached;
  const shell = EXAM_SHELLS.find((s) => s.code === code);
  if (!shell) return undefined;

  const radices = shell.slots.map((s) => s.options.length);
  const digits = radices.map(() => 0);
  const assignments: number[][] = [];
  const position = new Map<string, number>();
  // Odometer over the full cartesian product (products are small — ≤ ~2.3k
  // per shell), keeping only budget-valid vectors.
  for (;;) {
    let terminal = 0;
    for (let i = 0; i < digits.length; i++) {
      if (shell.slots[i].options[digits[i]].terminal) terminal++;
    }
    if (
      terminal >= EXAM_MIN_TERMINAL_ENCOUNTERS &&
      terminal <= EXAM_MAX_TERMINAL_ENCOUNTERS
    ) {
      position.set(digits.join(","), assignments.length);
      assignments.push([...digits]);
    }
    // increment (least-significant = last slot)
    let i = digits.length - 1;
    while (i >= 0) {
      digits[i]++;
      if (digits[i] < radices[i]) break;
      digits[i] = 0;
      i--;
    }
    if (i < 0) break;
  }
  if (assignments.length > 9999) {
    // The 4-digit id segment is the contract; authored slot counts keep every
    // shell far below this, and the property tests assert it stays that way.
    throw new Error(`exam bank: shell ${code} exceeds the 4-digit id space`);
  }
  const built: ShellIndex = { shell, assignments, position };
  shellIndexCache.set(code, built);
  return built;
}

/** Budget-valid assignment count of one shell (the NNNN id space). */
export function examShellAssignmentCount(code: string): number {
  return shellIndex(code)?.assignments.length ?? 0;
}

/** Total distinct variants: Σ shells (valid assignments) × conditions. */
export const EXAM_BANK_SIZE: number = EXAM_SHELLS.reduce(
  (sum, s) => sum + examShellAssignmentCount(s.code) * EXAM_CONDITIONS.length,
  0,
);

// ---------------------------------------------------------------------------
// Id codec
// ---------------------------------------------------------------------------

export interface ParsedExamVariantId {
  shellCode: string;
  conditionCode: string;
  /** 0-based index into the shell's valid-assignment list. */
  assignmentIndex: number;
}

const ID_RE = /^EX-([A-Z])-([DVN][12])-(\d{4})$/;

/** Strict parse — null for anything that is not a live bank id. */
export function parseExamVariantId(id: string): ParsedExamVariantId | null {
  const m = ID_RE.exec(id.trim().toUpperCase());
  if (!m) return null;
  const [, shellCode, conditionCode, digits] = m;
  const idx = shellIndex(shellCode);
  if (!idx) return null;
  if (!EXAM_CONDITIONS.some((c) => c.code === conditionCode)) return null;
  const assignmentIndex = Number(digits);
  if (assignmentIndex >= idx.assignments.length) return null;
  return { shellCode, conditionCode, assignmentIndex };
}

export function isExamVariantId(id: string): boolean {
  return parseExamVariantId(id) !== null;
}

function formatId(shellCode: string, conditionCode: string, assignmentIndex: number): string {
  return `EX-${shellCode}-${conditionCode}-${String(assignmentIndex).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Spec generation
// ---------------------------------------------------------------------------

function conditionByCode(code: string): ExamCondition {
  const c = EXAM_CONDITIONS.find((x) => x.code === code);
  if (!c) throw new Error(`exam bank: unknown condition ${code}`);
  return c;
}

function bayOf(shell: ExamRouteShell) {
  return shell.bayRef === "l7" ? L7_PARKING_BAY : shell.bayRef;
}

function buildStagedEvents(shell: ExamRouteShell, digits: readonly number[]): StagedEventSpec[] {
  const events: StagedEventSpec[] = [];
  for (let i = 0; i < shell.slots.length; i++) {
    const slot = shell.slots[i];
    const option = slot.options[digits[i]];
    if (option.build !== null) events.push(option.build(slot.id));
  }
  return events;
}

/**
 * Rebuild the complete LessonSpec of a variant id. Undefined for ids outside
 * the bank — the wire resolver treats that exactly like an unknown lesson.
 */
export function examVariantById(id: string): LessonSpec | undefined {
  const parsed = parseExamVariantId(id);
  if (!parsed) return undefined;
  const idx = shellIndex(parsed.shellCode);
  if (!idx) return undefined;
  const { shell } = idx;
  const digits = idx.assignments[parsed.assignmentIndex];
  const cond = conditionByCode(parsed.conditionCode);
  const canonicalId = formatId(parsed.shellCode, parsed.conditionCode, parsed.assignmentIndex);
  const bay = bayOf(shell);

  const parkObjective: LessonObjective = {
    id: `x${shell.code}-park`,
    titleBg: shell.parkTitleBg,
    kind: "completeManeuver",
    params: { maneuver: "parkInBay", holdSec: 1.5, bay },
  };

  return {
    id: canonicalId,
    order: 100, // out of the linear curriculum, like lex-exam-1
    titleBg: `Изпитен вариант ${canonicalId}`,
    descriptionBg:
      `${shell.nameBg} · ${cond.labelBg}. ${shell.descriptionBg} ` +
      "Строга подготовка преди потегляне, официално оценяване от първата " +
      "секунда; опасна грешка, произшествие или превишени лимити прекратяват изпита.",
    conceptIds: [...EXAM_BANK_CONCEPT_IDS],
    spawn: { ...shell.spawn },
    preDrive: true,
    preDriveMode: "assess",
    // vehicleStart absent = cold start (A1 policy), exactly like lex-exam-1.
    examMode: true,
    unlockAfterLessonId: EXAM_LESSON.unlockAfterLessonId,
    parkingBay: bay,
    environment: { timeOfDay: cond.timeOfDay, rain: cond.rain },
    stagedEvents: buildStagedEvents(shell, digits),
    objectives: [...shell.objectives, parkObjective],
  };
}

/** Like examVariantById, but loud — for callers that already validated. */
export function generateExamVariant(id: string): LessonSpec {
  const spec = examVariantById(id);
  if (!spec) throw new Error(`exam bank: not a valid variant id: ${id}`);
  return spec;
}

/**
 * The doc-72 distinctness key of a variant: shell × conditions ×
 * slot-archetype assignment × parameter tier. Two ids with equal keys would
 * be the same exam pedagogically — the property tests assert the bank never
 * produces a collision (and that the count clears 1000).
 */
export function examVariantDistinctnessKey(id: string): string {
  const parsed = parseExamVariantId(id);
  if (!parsed) throw new Error(`exam bank: not a valid variant id: ${id}`);
  const idx = shellIndex(parsed.shellCode);
  if (!idx) throw new Error(`exam bank: unknown shell ${parsed.shellCode}`);
  const digits = idx.assignments[parsed.assignmentIndex];
  const slots = idx.shell.slots
    .map((slot, i) => `${slot.siteId}=${slot.options[digits[i]].key}`)
    .join(",");
  return `${parsed.shellCode}|${parsed.conditionCode}|${slots}`;
}

/** Every live variant id (test/enumeration utility — ~tens of thousands). */
export function allExamVariantIds(): string[] {
  const ids: string[] = [];
  for (const shell of EXAM_SHELLS) {
    const count = examShellAssignmentCount(shell.code);
    for (const cond of EXAM_CONDITIONS) {
      for (let i = 0; i < count; i++) ids.push(formatId(shell.code, cond.code, i));
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// „Нов изпит" — seeded weighted draw
// ---------------------------------------------------------------------------

/** mulberry32 — tiny deterministic PRNG (the director test suite's choice). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T>(rng: () => number, items: readonly T[], weightOf: (t: T) => number): number {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weightOf(items[i]);
    if (roll <= 0) return i;
  }
  return items.length - 1;
}

/**
 * Draw a fresh variant id. Shell uniform; condition weighted (real exams are
 * mostly daytime); slot options weighted by the taxonomy's W column; then the
 * опасна budget is enforced by a deterministic repair pass (drop the
 * lowest-weight extras / add the highest-weight missing terminals). Same
 * seed → same id, always.
 */
export function drawExamVariantId(seed: number): string {
  const rng = mulberry32(seed);
  const shell = EXAM_SHELLS[Math.floor(rng() * EXAM_SHELLS.length) % EXAM_SHELLS.length];
  const cond = EXAM_CONDITIONS[weightedPick(rng, EXAM_CONDITIONS, (c) => c.weight)];
  const idx = shellIndex(shell.code);
  if (!idx) throw new Error("exam bank: empty shell index");

  const digits = shell.slots.map((slot) => weightedPick(rng, slot.options, (o) => o.weight));

  // Budget repair — deterministic, weight-ordered (rng only breaks ties via
  // the initial pick, never here).
  const terminalSlots = () =>
    digits
      .map((d, i) => ({ i, opt: shell.slots[i].options[d] }))
      .filter((x) => x.opt.terminal);
  let terminals = terminalSlots();
  while (terminals.length > EXAM_MAX_TERMINAL_ENCOUNTERS) {
    // drop the lowest-weight staged terminal (ties: later slot loses)
    const drop = terminals.reduce((a, b) => (b.opt.weight <= a.opt.weight ? b : a));
    digits[drop.i] = 0; // option 0 is always "none"
    terminals = terminalSlots();
  }
  while (terminals.length < EXAM_MIN_TERMINAL_ENCOUNTERS) {
    // fill the empty/non-terminal slot whose best terminal option carries the
    // highest W (ties: earlier slot wins)
    let best: { i: number; opt: number; w: number } | null = null;
    for (let i = 0; i < shell.slots.length; i++) {
      if (shell.slots[i].options[digits[i]].terminal) continue;
      for (let o = 0; o < shell.slots[i].options.length; o++) {
        const option = shell.slots[i].options[o];
        if (!option.terminal) continue;
        if (best === null || option.weight > best.w) best = { i, opt: o, w: option.weight };
      }
    }
    if (best === null) break; // cannot happen with authored data (tests assert)
    digits[best.i] = best.opt;
    terminals = terminalSlots();
  }

  const assignmentIndex = idx.position.get(digits.join(","));
  if (assignmentIndex === undefined) {
    // Unreachable when the repair pass converged inside the budget; guarded
    // so a data bug degrades to the first valid assignment, never a crash.
    return formatId(shell.code, cond.code, 0);
  }
  return formatId(shell.code, cond.code, assignmentIndex);
}
