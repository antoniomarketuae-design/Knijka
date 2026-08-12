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
  RUNG_ADDITIONS,
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
/**
 * A FIRST-WORD check, and it is not the gate. „ЗДвП чл. 9999" passes this, and
 * so did „ППЗДвП чл. 31" for as long as this was the only thing looking at the
 * 250 citation strings under `modules/sim` — ППЗДвП being an act
 * `content/law/acts` holds not one byte of, so that number was unverifiable by
 * construction. This regex stays because it is the cheap authoring-time nudge
 * that runs in the browser; the real check resolves every lawRef in the module
 * against the corpus and lives in `modules/sim/__tests__/law-citations.test.ts`
 * (the corpus loader is node-only, so it cannot run from here).
 */
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
 * Physics opt-in shape (ADR-006 stage 4a + the snow/crosswind unlocks):
 * booleans when present. ONE gate for both authoring sites — the template's
 * spec.physics and a rung's LevelSpec.physics carry the same shape, so they
 * get the same message (only the label differs).
 */
function checkPhysics(p: ScenarioSpec["physics"], label: string, errors: string[]): void {
  if (p === undefined) return;
  if (typeof p !== "object" || p === null) {
    errors.push(
      `${label} must be an object ({ wetGrip?: boolean; snowGrip?: boolean; crosswind?: boolean }) when present`,
    );
    return;
  }
  for (const k of ["wetGrip", "snowGrip", "crosswind"] as const) {
    if (p[k] !== undefined && typeof p[k] !== "boolean") {
      errors.push(`${label}.${k} must be boolean when present`);
    }
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

  // -- Staged-actor captions (doc 87 B40(a)). A caption over an actor that does
  // not exist renders nothing and reports nothing — a silent hole exactly like
  // the one this row was filed for, so a stale `actorId` fails HERE.
  if (spec.actorLabels) {
    const stagedIds = new Set((spec.staged ?? []).map((s) => s.id));
    spec.actorLabels.forEach((a, i) => {
      if (!stagedIds.has(a.actorId)) {
        errors.push(
          `actorLabels[${i}].actorId "${a.actorId}" names no staged event on this template ` +
            `(staged: ${[...stagedIds].join(", ") || "none"})`,
        );
      }
      if (a.kind !== "standingOnGreen") {
        errors.push(`actorLabels[${i}].kind "${String(a.kind)}" is not an authored caption (traffic/stagedActorLabels.ts)`);
      }
    });
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
    spec.levels.forEach((l, i) => {
      validateLevel(l, seen, errors, i === 0);
      if (l.level <= prev) errors.push(`levels must be ascending by level (found L${l.level} after L${prev})`);
      prev = l.level;
    });
  }

  // -- Conditions (every weather compiles — dry/rain/fog/snow).
  for (const c of [spec.conditions, ...(spec.levels ?? []).map((l) => l.conditions)]) {
    if (c?.weather !== undefined && !["dry", "rain", "fog", "snow"].includes(c.weather)) {
      errors.push(`conditions.weather "${c.weather}" must be dry|rain|fog|snow`);
    }
  }

  // -- Physics opt-in, template-wide (rung-level physics is checked per level
  //    in validateLevel — same gate, same messages).
  checkPhysics(spec.physics, "physics", errors);

  // -- Signal plan (approach-relative one-shot pin): shape when present.
  if (spec.signalPlan !== undefined) {
    const sp = spec.signalPlan;
    if (typeof sp !== "object" || sp === null) {
      errors.push(`signalPlan must be an object ({ arm; triggerM; clusterId? }) when present`);
    } else {
      if (sp.arm !== "greenFresh" && sp.arm !== "redFresh") {
        errors.push(`signalPlan.arm must be "greenFresh" | "redFresh"`);
      }
      if (!(Number.isFinite(sp.triggerM) && sp.triggerM > 0)) {
        errors.push(`signalPlan.triggerM must be a positive number of meters`);
      }
      if (
        sp.clusterId !== undefined &&
        (typeof sp.clusterId !== "string" || sp.clusterId.length === 0)
      ) {
        errors.push(`signalPlan.clusterId must be a non-empty string when present`);
      }
    }
  }

  // -- Signal modes (session-start cluster dials, doc 62 S1): shape when
  //    present — node id → "dark" | "flashingAmber" only ("controlled" is the
  //    trafficController runner's own dial, never authorable here).
  if (spec.signalModes !== undefined) {
    const sm = spec.signalModes;
    if (typeof sm !== "object" || sm === null || Array.isArray(sm)) {
      errors.push(`signalModes must be a { nodeId: "dark" | "flashingAmber" } record when present`);
    } else {
      for (const [nodeId, mode] of Object.entries(sm)) {
        if (nodeId.length === 0) errors.push(`signalModes: node id must be non-empty`);
        if (mode !== "dark" && mode !== "flashingAmber") {
          errors.push(`signalModes["${nodeId}"] must be "dark" | "flashingAmber"`);
        }
      }
    }
  }

  return errors;
}

function validateLevel(
  l: LevelSpec,
  seen: Set<number>,
  errors: string[],
  isLowest: boolean,
): void {
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
  // The rung's physics delta (merged per key over the template's at compile).
  checkPhysics(l.physics, `levels L${l.level}: physics`, errors);
  if (l.stagedAdd) {
    l.stagedAdd.forEach((s, i) => {
      if (typeof s?.id !== "string" || s.id.length === 0 || typeof s?.kind !== "string") {
        errors.push(`levels L${l.level}: stagedAdd[${i}] needs id + kind (StagedEventSpec)`);
      }
    });
  }
  // The complication — SHAPE only here. That the declared `adds` are REAL is
  // not knowable from one spec in isolation (it is a difference between two
  // compiled lessons), so it is gated in __tests__/level-complication.test.ts
  // against compileScenario's own output. This layer only refuses copy that
  // could never teach: an empty claim, a missing sentence, a bad citation.
  if (l.complication !== undefined) {
    const c = l.complication;
    if (typeof c !== "object" || c === null) {
      errors.push(`levels L${l.level}: complication must be an object when present`);
    } else {
      if (!Array.isArray(c.adds) || c.adds.length === 0) {
        errors.push(
          `levels L${l.level}: complication.adds must name at least one addition (${RUNG_ADDITIONS.join("|")}) — a rung that adds nothing must not claim one`,
        );
      } else {
        for (const a of c.adds) {
          if (!RUNG_ADDITIONS.includes(a)) {
            errors.push(
              `levels L${l.level}: complication.adds "${a}" is not one of ${RUNG_ADDITIONS.join(", ")}`,
            );
          }
        }
        if (new Set(c.adds).size !== c.adds.length) {
          errors.push(`levels L${l.level}: complication.adds has duplicate entries`);
        }
      }
      if (!nonEmptyBg(c.titleBg)) {
        errors.push(`levels L${l.level}: complication.titleBg must be non-empty Bulgarian text`);
      }
      // THEO-4: the sentence that says WHAT changed and WHAT you do about it.
      // A one-word „по-трудно" is exactly the bare verdict doc 64 forbids, so
      // the floor is a real sentence, not a label.
      if (!nonEmptyBg(c.coachBg) || c.coachBg.trim().length < 40) {
        errors.push(
          `levels L${l.level}: complication.coachBg must be a real Bulgarian instruction (>= 40 chars) — say what changed, what it does and what the driver does about it (THEO-4)`,
        );
      }
      if (c.lawRef !== undefined && !LAW_REF_RE.test(c.lawRef)) {
        errors.push(
          `levels L${l.level}: complication.lawRef "${c.lawRef}" must cite ЗДвП / ППЗДвП / Наредба (ADR-002 retrieval)`,
        );
      }
      if (isLowest) {
        errors.push(
          `levels L${l.level}: this is the template's LOWEST rung — a complication needs a rung below it to be harder than`,
        );
      }
    }
  }
}

/** Throw a ScenarioSpecError listing every problem; no-op when valid. */
export function assertScenarioSpec(spec: ScenarioSpec, opts: ValidateScenarioOptions = {}): void {
  const errors = validateScenarioSpec(spec, opts);
  if (errors.length > 0) throw new ScenarioSpecError(spec.id, errors);
}
