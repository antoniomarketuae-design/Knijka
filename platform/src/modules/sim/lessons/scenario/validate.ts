/**
 * ScenarioSpec validation — strict, with ACTIONABLE errors (the 150-template
 * assembly line runs agent-authored specs through this gate unattended; a
 * vague error costs a whole revision round-trip).
 *
 * Design: manual structural validation in the house style (the
 * ObjectiveSpecError pattern of lessons/objectives.ts) rather than zod — the
 * spec is already TYPED at authoring time; this layer catches what types
 * cannot (registry membership, contiguous numbering, cross-references,
 * catalog codes) and re-runs the REAL objective parser so a spec that
 * validates here can never explode later inside createLessonSession.
 */

import { VIOLATIONS } from "../../rules/catalog";
import { parseObjectiveParams } from "../objectives";
import { serializeObjectiveParams } from "./params";
import { DOC72_ARCHETYPE_IDS } from "./registry";
import {
  MAP_ARCHETYPES,
  SCENARIO_FAMILIES,
  type LevelSpec,
  type ScenarioSpec,
  type TraceRef,
} from "./types";

/** Thrown by assertScenarioSpec — message lists EVERY problem found. */
export class ScenarioSpecError extends Error {
  readonly errors: readonly string[];
  constructor(specId: string, errors: readonly string[]) {
    super(
      `Invalid ScenarioSpec "${specId}" — ${errors.length} problem(s):\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
    this.name = "ScenarioSpecError";
    this.errors = errors;
  }
}

export interface ValidateScenarioOptions {
  /**
   * Known knowledge-graph concept ids (content/concepts.json). When provided,
   * every spec.conceptIds entry must be a member; when omitted the reference
   * check is skipped (browser callers don't carry the content bank — the
   * template test suite supplies the real registry, same pattern as the
   * rules-catalog concept test).
   */
  conceptIds?: ReadonlySet<string>;
}

const ID_RE = /^sc-[a-z0-9]+(-[a-z0-9]+)*$/;
const LAW_REF_RE = /^(ЗДвП|ППЗДвП|Наредба)/;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

function nonEmptyBg(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && CYRILLIC_RE.test(v);
}

function checkTraceRef(ref: TraceRef | undefined, label: string, errors: string[]): void {
  if (!ref || typeof ref.path !== "string" || ref.path.trim().length === 0) {
    errors.push(`${label}: traceRef.path is required (repo-relative, e.g. "content/traces/<template>/….trace.json")`);
    return;
  }
  if (!ref.path.endsWith(".json")) {
    errors.push(`${label}: traceRef.path "${ref.path}" must point to a .json trace file`);
  }
  if (ref.pending !== undefined && typeof ref.pending !== "boolean") {
    errors.push(`${label}: traceRef.pending must be boolean when present`);
  }
}

/**
 * Validate a ScenarioSpec. Returns the full list of problems (empty = valid).
 * Use assertScenarioSpec to throw instead.
 */
export function validateScenarioSpec(
  spec: ScenarioSpec,
  opts: ValidateScenarioOptions = {},
): string[] {
  const errors: string[] = [];

  // -- Identity & catalog card fields.
  if (!ID_RE.test(spec.id)) {
    errors.push(`id "${spec.id}" must match ${ID_RE} (naming standard: sc-<family>-<slug>, doc 76 §9)`);
  }
  if (!SCENARIO_FAMILIES.includes(spec.family)) {
    errors.push(`family "${spec.family}" is not one of: ${SCENARIO_FAMILIES.join(", ")}`);
  }
  if (!Array.isArray(spec.tagsBg) || spec.tagsBg.length === 0 || !spec.tagsBg.every(nonEmptyBg)) {
    errors.push(`tagsBg needs at least one non-empty Bulgarian tag`);
  }
  if (!nonEmptyBg(spec.titleBg)) errors.push(`titleBg must be non-empty Bulgarian text`);
  if (!nonEmptyBg(spec.objectiveBg)) errors.push(`objectiveBg must be non-empty Bulgarian text`);
  if (spec.localeBg !== "bg-BG") errors.push(`localeBg must be "bg-BG" (got "${String(spec.localeBg)}")`);

  // -- Provenance: doc-72 archetypes (REQUIRED) + concept graph (REQUIRED).
  if (!Array.isArray(spec.archetypeIds) || spec.archetypeIds.length === 0) {
    errors.push(`archetypeIds is REQUIRED (doc-72 provenance, e.g. ["PK-02"])`);
  } else {
    for (const a of spec.archetypeIds) {
      if (!DOC72_ARCHETYPE_IDS.has(a)) {
        errors.push(`archetypeIds: "${a}" is not a doc-72 archetype id (see lessons/scenario/registry.ts)`);
      }
    }
  }
  if (!Array.isArray(spec.conceptIds) || spec.conceptIds.length === 0) {
    errors.push(`conceptIds is REQUIRED (152-graph mastery/readiness feed)`);
  } else if (opts.conceptIds) {
    for (const c of spec.conceptIds) {
      if (!opts.conceptIds.has(c)) {
        errors.push(`conceptIds: "${c}" does not exist in content/concepts.json`);
      }
    }
  }

  // -- Map.
  if (!MAP_ARCHETYPES.includes(spec.map?.archetype)) {
    errors.push(`map.archetype "${spec.map?.archetype}" is not a known generator (${MAP_ARCHETYPES.join(", ")})`);
  }
  if (typeof spec.map?.districtId !== "string" || !/^[a-z0-9-]+$/.test(spec.map.districtId)) {
    errors.push(`map.districtId must be the committed district file id (kebab-case), got "${spec.map?.districtId}"`);
  }
  if (spec.map?.params) {
    for (const [k, v] of Object.entries(spec.map.params)) {
      if (typeof v !== "number" && typeof v !== "string") {
        errors.push(`map.params.${k} must be number|string`);
      }
    }
  }

  // -- Start.
  const hasSpawnId = typeof spec.start?.spawnPointId === "string" && spec.start.spawnPointId.length > 0;
  const hasPose = spec.start?.position !== undefined;
  if (hasSpawnId === hasPose) {
    errors.push(`start needs EXACTLY ONE of spawnPointId | position (got ${hasSpawnId ? "both" : "neither"})`);
  }
  if (hasPose) {
    const p = spec.start.position!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) errors.push(`start.position must be finite {x, y}`);
    if (spec.start.headingDeg === undefined || !Number.isFinite(spec.start.headingDeg)) {
      errors.push(`start.position requires start.headingDeg`);
    }
  }
  if (spec.start?.vehicleStart !== undefined && !["cold", "ready"].includes(spec.start.vehicleStart)) {
    errors.push(`start.vehicleStart must be "cold" | "ready"`);
  }

  // -- Instructions: contiguous 1..n, Bulgarian.
  if (!Array.isArray(spec.instructionsBg) || spec.instructionsBg.length === 0) {
    errors.push(`instructionsBg needs at least one numbered step`);
  } else {
    spec.instructionsBg.forEach((step, i) => {
      if (step.n !== i + 1) {
        errors.push(`instructionsBg[${i}].n is ${step.n}, must be ${i + 1} (contiguous 1..n)`);
      }
      if (!nonEmptyBg(step.textBg)) errors.push(`instructionsBg[${i}].textBg must be non-empty Bulgarian text`);
    });
  }

  // -- Success contract: unique ids + params must survive the REAL parser.
  const objectiveIds = new Set<string>();
  if (!Array.isArray(spec.success) || spec.success.length === 0) {
    errors.push(`success needs at least one graded objective`);
  } else {
    for (const o of spec.success) {
      if (typeof o.id !== "string" || o.id.length === 0) {
        errors.push(`success: every objective needs an id`);
        continue;
      }
      if (objectiveIds.has(o.id)) errors.push(`success: duplicate objective id "${o.id}"`);
      objectiveIds.add(o.id);
      if (!nonEmptyBg(o.titleBg)) errors.push(`success "${o.id}": titleBg must be non-empty Bulgarian text`);
      try {
        // Round-trip through the SAME parser createLessonSession runs — a
        // spec that passes here can never fail at session start.
        const { kind, params } = serializeObjectiveParams(o.params);
        parseObjectiveParams({ id: o.id, titleBg: o.titleBg, kind, params });
      } catch (e) {
        errors.push(`success "${o.id}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // -- Rubric cross-references.
  if (spec.rubric) {
    const r = spec.rubric;
    if (r.placement && !objectiveIds.has(r.placement.objectiveId)) {
      errors.push(`rubric.placement.objectiveId "${r.placement.objectiveId}" is not a success objective id`);
    }
    if (r.economy) {
      if (!objectiveIds.has(r.economy.objectiveId)) {
        errors.push(`rubric.economy.objectiveId "${r.economy.objectiveId}" is not a success objective id`);
      }
      if (
        !Number.isInteger(r.economy.attemptsFor3Stars) ||
        !Number.isInteger(r.economy.attemptsFor2Stars) ||
        r.economy.attemptsFor3Stars < 1 ||
        r.economy.attemptsFor3Stars > r.economy.attemptsFor2Stars
      ) {
        errors.push(`rubric.economy: need integers 1 <= attemptsFor3Stars <= attemptsFor2Stars`);
      }
    }
    if (r.observation) {
      const momentIds = new Set<string>();
      for (const m of r.observation.moments) {
        if (typeof m.id !== "string" || m.id.length === 0 || !nonEmptyBg(m.titleBg)) {
          errors.push(`rubric.observation: every moment needs an id + Bulgarian titleBg`);
        }
        if (momentIds.has(m.id)) errors.push(`rubric.observation: duplicate moment id "${m.id}"`);
        momentIds.add(m.id);
      }
      if (momentIds.size === 0) errors.push(`rubric.observation.moments must not be empty when present`);
    }
    if (r.parTimeSec !== undefined && !(Number.isFinite(r.parTimeSec) && r.parTimeSec > 0)) {
      errors.push(`rubric.parTimeSec must be > 0 when present`);
    }
  }

  // -- Traces + mistake demos.
  checkTraceRef(spec.shadow, "shadow", errors);
  if (!Array.isArray(spec.mistakes) || spec.mistakes.length > 4) {
    errors.push(`mistakes must be an array of 0..4 demos (doc 76 §9 stage 5: 2–4 per template)`);
  } else {
    spec.mistakes.forEach((m, i) => {
      checkTraceRef(m.traceRef, `mistakes[${i}]`, errors);
      if (!nonEmptyBg(m.titleBg)) errors.push(`mistakes[${i}].titleBg must be non-empty Bulgarian text`);
      if (!nonEmptyBg(m.whatWentWrongBg)) errors.push(`mistakes[${i}].whatWentWrongBg must be non-empty Bulgarian text`);
      if (!Array.isArray(m.codeRefs) || m.codeRefs.length === 0) {
        errors.push(`mistakes[${i}].codeRefs must name at least one ViolationCode the demo grades`);
      } else {
        for (const code of m.codeRefs) {
          if (!(code in VIOLATIONS)) {
            errors.push(`mistakes[${i}].codeRefs: "${code}" is not a rules-catalog ViolationCode`);
          }
        }
      }
    });
  }

  // -- Teach card.
  if (!nonEmptyBg(spec.teach?.whenBg)) errors.push(`teach.whenBg must be non-empty Bulgarian text`);
  if (!nonEmptyBg(spec.teach?.whyBg)) errors.push(`teach.whyBg must be non-empty Bulgarian text`);
  if (!nonEmptyBg(spec.teach?.examinerBg)) errors.push(`teach.examinerBg must be non-empty Bulgarian text`);
  if (typeof spec.teach?.lawRef !== "string" || !LAW_REF_RE.test(spec.teach.lawRef)) {
    errors.push(`teach.lawRef "${spec.teach?.lawRef}" must cite ЗДвП / ППЗДвП / Наредба (catalog convention)`);
  }

  // -- Levels: 1..5, unique, ascending, sane deltas.
  if (!Array.isArray(spec.levels) || spec.levels.length === 0) {
    errors.push(`levels needs at least one LevelSpec (L1..L5 rungs the template ships)`);
  } else {
    const seen = new Set<number>();
    let prev = 0;
    for (const l of spec.levels) {
      validateLevel(l, seen, errors);
      if (l.level <= prev) errors.push(`levels must be ascending by level (found L${l.level} after L${prev})`);
      prev = l.level;
    }
  }

  // -- Conditions (every weather compiles — dry/rain/fog/snow).
  for (const c of [spec.conditions, ...(spec.levels ?? []).map((l) => l.conditions)]) {
    if (c?.weather !== undefined && !["dry", "rain", "fog", "snow"].includes(c.weather)) {
      errors.push(`conditions.weather "${c.weather}" must be dry|rain|fog|snow`);
    }
  }

  // -- Physics opt-in (ADR-006 stage 4a + the snow unlock): booleans when present.
  if (spec.physics !== undefined) {
    if (typeof spec.physics !== "object" || spec.physics === null) {
      errors.push(`physics must be an object ({ wetGrip?: boolean; snowGrip?: boolean }) when present`);
    } else {
      if (spec.physics.wetGrip !== undefined && typeof spec.physics.wetGrip !== "boolean") {
        errors.push(`physics.wetGrip must be boolean when present`);
      }
      if (spec.physics.snowGrip !== undefined && typeof spec.physics.snowGrip !== "boolean") {
        errors.push(`physics.snowGrip must be boolean when present`);
      }
    }
  }

  return errors;
}

function validateLevel(l: LevelSpec, seen: Set<number>, errors: string[]): void {
  if (![1, 2, 3, 4, 5].includes(l.level)) {
    errors.push(`levels: level ${String(l.level)} must be 1..5`);
    return;
  }
  if (seen.has(l.level)) errors.push(`levels: duplicate L${l.level}`);
  seen.add(l.level);
  if (l.toleranceScale !== undefined && !(l.toleranceScale > 0 && l.toleranceScale <= 3)) {
    errors.push(`levels L${l.level}: toleranceScale must be in (0, 3], got ${l.toleranceScale}`);
  }
  if (l.traffic) {
    for (const [k, v] of Object.entries(l.traffic)) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
        errors.push(`levels L${l.level}: traffic.${k} must be >= 0`);
      }
    }
  }
  if (l.vehicleStart !== undefined && !["cold", "ready"].includes(l.vehicleStart)) {
    errors.push(`levels L${l.level}: vehicleStart must be "cold" | "ready"`);
  }
  if (l.stagedAdd) {
    l.stagedAdd.forEach((s, i) => {
      if (typeof s?.id !== "string" || s.id.length === 0 || typeof s?.kind !== "string") {
        errors.push(`levels L${l.level}: stagedAdd[${i}] needs id + kind (StagedEventSpec)`);
      }
    });
  }
}

/** Throw a ScenarioSpecError listing every problem; no-op when valid. */
export function assertScenarioSpec(spec: ScenarioSpec, opts: ValidateScenarioOptions = {}): void {
  const errors = validateScenarioSpec(spec, opts);
  if (errors.length > 0) throw new ScenarioSpecError(spec.id, errors);
}
