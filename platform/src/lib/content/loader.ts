/**
 * Content loader (server-only). At module init it synchronously reads the
 * versioned JSON in /content, validates every file against the zod schemas
 * (schemas.ts), verifies referential integrity across files, then registers
 * a frozen ContentRepo via setContentRepo().
 *
 * ANY validation failure throws with a precise message — bad content must
 * fail the build, never ship. Consumers import this module for its side
 * effect (or use the exported `contentRepo`) and read through the
 * ContentRepo interface only.
 *
 * The standalone mirror of these checks for CI / content agents lives in
 * scripts/validate-content.mjs — keep the two in lockstep.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { setContentRepo, type ContentRepo } from "./repo";
import { sanitizeContentTree } from "./sanitize";
import {
  ConceptsFileSchema,
  QuestionsFileSchema,
  SectionsFileSchema,
  SignsFileSchema,
  TopicsFileSchema,
} from "./schemas";
import type { Concept, Question, Section, Sign, Topic } from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/content/loader is server-only — import it from server code, never from client components",
  );
}

/** Parsed-but-unvalidated content, decoupled from the filesystem for tests. */
export interface RawContent {
  /** Parsed topics.json */
  topics: unknown;
  /** Parsed concepts.json */
  concepts: unknown;
  /** topic slug (questions/<slug>.json basename) -> parsed file contents */
  questionsBySlug: Record<string, unknown>;
  /**
   * Parsed sections.json — the presentation-only concept grouping. Optional:
   * absent (undefined) means "no section layer", which the repo serves as an
   * empty list. When present it MUST partition every concept exactly once.
   */
  sections?: unknown;
  /** Parsed signs/signs.json */
  signs: unknown;
  /** True if the svg asset referenced by a sign exists (path relative to /content). */
  svgExists: (svgFile: string) => boolean;
  /**
   * True if platform/public/world/<districtId>.json exists — sceneStill media
   * (THEO-1) must reference a committed district. Optional so lightweight
   * fixtures need not provide it; absent = every district is unknown.
   */
  districtExists?: (districtId: string) => boolean;
  /**
   * True if `sourceId` is in one of the non-statutory source registers
   * (content/medical/sources.json, content/sources/sources.json — see
   * lib/content/sources). A `sourceRef` pointing at a source nobody registered
   * is an unresolvable citation, which is precisely the defect `sourceRefs`
   * was added to end, so it fails the load exactly like an unknown `signRef`.
   *
   * Optional and same convention as `districtExists`: absent = no source is
   * known, so a fixture that uses `sourceRefs` must supply this.
   */
  sourceExists?: (sourceId: string) => boolean;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Returns the ids forming a dependency cycle (closed walk), or null if acyclic. */
function findDependencyCycle(concepts: Concept[]): string[] | null {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (id: string): boolean => {
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue; // unresolved ref — reported separately
      const depState = state.get(dep);
      if (depState === "visiting") {
        cycle = [...stack.slice(stack.indexOf(dep)), dep];
        return true;
      }
      if (depState === undefined && visit(dep)) return true;
    }
    stack.pop();
    state.set(id, "done");
    return false;
  };

  for (const concept of concepts) {
    if (!state.has(concept.id) && visit(concept.id)) return cycle;
  }
  return null;
}

/**
 * Validate one content file — after stripping internal staff annotations from
 * every string in it (audit M-6).
 *
 * The strip runs BEFORE zod on purpose. The schemas require non-empty prose
 * (`textBg`, `explanationBg`, …), and what must be non-empty is what the
 * STUDENT sees: an `explanationBg` consisting only of `[REVIEW: …]` is a blank
 * explanation dressed up as content, and it fails the build here instead of
 * shipping an empty why-panel. It also means no code path downstream of the
 * loader — repo, exam builder, why-panel, tutor grounding — can be handed an
 * annotation, whatever slips into a JSON file.
 */
function parseFile<T>(schema: z.ZodType<T[]>, data: unknown, file: string): T[] {
  const result = schema.safeParse(sanitizeContentTree(data));
  if (!result.success) {
    throw new Error(`Content validation failed in ${file}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * Validates raw content and builds the frozen ContentRepo.
 * Throws with a precise, aggregated error message on any failure.
 * Exported so tests can run deliberately-broken in-memory fixtures through
 * the exact same pipeline as the real files.
 */
export function buildContentRepo(raw: RawContent): ContentRepo {
  // -- Phase 1: per-file structural validation (zod) -----------------------
  const topics = parseFile<Topic>(TopicsFileSchema, raw.topics, "topics.json");
  const concepts = parseFile<Concept>(ConceptsFileSchema, raw.concepts, "concepts.json");
  const sections = parseFile<Section>(SectionsFileSchema, raw.sections ?? [], "sections.json");
  const signs = parseFile<Sign>(SignsFileSchema, raw.signs, "signs/signs.json");
  const questionFiles = new Map<string, Question[]>();
  for (const slug of Object.keys(raw.questionsBySlug).sort()) {
    questionFiles.set(
      slug,
      parseFile<Question>(QuestionsFileSchema, raw.questionsBySlug[slug], `questions/${slug}.json`),
    );
  }

  // -- Phase 2: cross-file referential integrity ---------------------------
  const errors: string[] = [];

  // Ids must be globally unique across the whole repo.
  const idOwner = new Map<string, string>();
  const registerIds = (items: { id: string }[], file: string) => {
    for (const item of items) {
      const owner = idOwner.get(item.id);
      if (owner !== undefined) {
        errors.push(`duplicate id "${item.id}" in ${file} (already defined in ${owner})`);
      } else {
        idOwner.set(item.id, file);
      }
    }
  };
  registerIds(topics, "topics.json");
  registerIds(concepts, "concepts.json");
  for (const [slug, questions] of questionFiles) registerIds(questions, `questions/${slug}.json`);
  registerIds(sections, "sections.json");
  registerIds(signs, "signs/signs.json");

  // Topic slugs and orders must be unique (slugs key question files and lookups).
  for (const slug of duplicates(topics.map((t) => t.slug))) {
    errors.push(`topics.json: duplicate slug "${slug}"`);
  }
  for (const order of duplicates(topics.map((t) => String(t.order)))) {
    errors.push(`topics.json: duplicate order ${order}`);
  }

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const topicBySlug = new Map(topics.map((t) => [t.slug, t]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  // Every concept points at an existing topic; every dependsOn resolves.
  for (const concept of concepts) {
    if (!topicById.has(concept.topicId)) {
      errors.push(`concepts.json: concept "${concept.id}" references unknown topicId "${concept.topicId}"`);
    }
    for (const dep of concept.dependsOn) {
      if (!conceptById.has(dep)) {
        errors.push(`concepts.json: concept "${concept.id}" dependsOn unknown concept "${dep}"`);
      }
    }
  }

  // Question files are keyed by topic slug; every conceptId must resolve.
  for (const [slug, questions] of questionFiles) {
    if (!topicBySlug.has(slug)) {
      errors.push(`questions/${slug}.json: no topic with slug "${slug}" in topics.json`);
    }
    for (const question of questions) {
      for (const conceptId of question.conceptIds) {
        if (!conceptById.has(conceptId)) {
          errors.push(
            `questions/${slug}.json: question "${question.id}" references unknown concept "${conceptId}"`,
          );
        }
      }
    }
  }

  // Sections: a presentation-only grouping. When a section layer exists it
  // MUST partition every concept exactly once (no orphan, no duplicate) and a
  // section may only group concepts of its own parent topic.
  if (sections.length > 0) {
    const conceptToSection = new Map<string, string>();
    for (const section of sections) {
      if (!topicById.has(section.topicId)) {
        errors.push(`sections.json: section "${section.id}" references unknown topicId "${section.topicId}"`);
      }
      for (const conceptId of section.conceptIds) {
        const concept = conceptById.get(conceptId);
        if (!concept) {
          errors.push(`sections.json: section "${section.id}" references unknown concept "${conceptId}"`);
          continue;
        }
        if (concept.topicId !== section.topicId) {
          errors.push(
            `sections.json: section "${section.id}" (topic "${section.topicId}") includes concept "${conceptId}" of topic "${concept.topicId}"`,
          );
        }
        const owner = conceptToSection.get(conceptId);
        if (owner !== undefined) {
          errors.push(`sections.json: concept "${conceptId}" appears in multiple sections ("${owner}" and "${section.id}")`);
        } else {
          conceptToSection.set(conceptId, section.id);
        }
      }
    }
    for (const concept of concepts) {
      if (!conceptToSection.has(concept.id)) {
        errors.push(`sections.json: concept "${concept.id}" is not assigned to any section`);
      }
    }
  }

  // Every sign's svg asset must exist.
  for (const sign of signs) {
    if (!raw.svgExists(sign.svgFile)) {
      errors.push(`signs/signs.json: sign "${sign.id}" svgFile "${sign.svgFile}" does not exist`);
    }
  }

  // Media references (THEO-1): every signRef must be an official code in
  // signs/signs.json; every sceneStill district must be a committed world map.
  const signCodes = new Set(signs.map((s) => s.code));
  const districtExists = raw.districtExists ?? (() => false);
  const sourceExists = raw.sourceExists ?? (() => false);
  for (const [slug, questions] of questionFiles) {
    for (const question of questions) {
      const at = `questions/${slug}.json: question "${question.id}"`;
      // Non-statutory citations must resolve, for the same reason a signRef
      // must: a citation nobody can open is the defect, not the fix.
      for (const sourceRef of question.sourceRefs ?? []) {
        if (!sourceExists(sourceRef.sourceId)) {
          errors.push(
            `${at} sourceRefs references unknown sourceId "${sourceRef.sourceId}" (no such id in any register — see lib/content/sources REGISTERS)`,
          );
        }
      }
      const media = question.media;
      if (media !== null && "kind" in media) {
        if (media.kind === "sign" && !signCodes.has(media.signRef)) {
          errors.push(`${at} media references unknown signRef "${media.signRef}" (no such code in signs/signs.json)`);
        }
        if (media.kind === "sceneStill" && !districtExists(media.districtId)) {
          errors.push(`${at} media references unknown districtId "${media.districtId}" (no platform/public/world/${media.districtId}.json)`);
        }
      }
      for (const option of question.options) {
        if (option.media !== undefined && !signCodes.has(option.media.signRef)) {
          errors.push(`${at} option "${option.id}" media references unknown signRef "${option.media.signRef}" (no such code in signs/signs.json)`);
        }
      }
    }
  }

  // The concept dependency graph must be acyclic.
  const cycle = findDependencyCycle(concepts);
  if (cycle) {
    errors.push(`concepts.json: dependsOn cycle detected: ${cycle.join(" -> ")}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Content referential integrity failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }

  // -- Phase 3: indexes + frozen repo ---------------------------------------
  const topicsSorted = deepFreeze([...topics].sort((a, b) => a.order - b.order));
  deepFreeze(concepts);
  deepFreeze(sections);
  deepFreeze(signs);

  const conceptsByTopicId = new Map<string, Concept[]>();
  for (const concept of concepts) {
    let bucket = conceptsByTopicId.get(concept.topicId);
    if (!bucket) conceptsByTopicId.set(concept.topicId, (bucket = []));
    bucket.push(concept);
  }

  // Sections keep file order overall and within each parent topic.
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const sectionsByTopicId = new Map<string, Section[]>();
  for (const section of sections) {
    let bucket = sectionsByTopicId.get(section.topicId);
    if (!bucket) sectionsByTopicId.set(section.topicId, (bucket = []));
    bucket.push(section);
  }
  for (const bucket of sectionsByTopicId.values()) deepFreeze(bucket);

  // Flatten questions in curriculum order (topic order, then file order).
  const allQuestions: Question[] = [];
  const questionsByTopicSlug = new Map<string, Question[]>();
  for (const topic of topicsSorted) {
    const questions = questionFiles.get(topic.slug);
    if (!questions) continue;
    questionsByTopicSlug.set(topic.slug, questions);
    allQuestions.push(...questions);
  }
  deepFreeze(allQuestions);

  const questionById = new Map(allQuestions.map((q) => [q.id, q]));
  const questionsByConceptId = new Map<string, Question[]>();
  for (const question of allQuestions) {
    for (const conceptId of question.conceptIds) {
      let bucket = questionsByConceptId.get(conceptId);
      if (!bucket) questionsByConceptId.set(conceptId, (bucket = []));
      bucket.push(question);
    }
  }
  for (const bucket of conceptsByTopicId.values()) deepFreeze(bucket);
  for (const bucket of questionsByTopicSlug.values()) deepFreeze(bucket);
  for (const bucket of questionsByConceptId.values()) deepFreeze(bucket);

  const EMPTY_CONCEPTS: Concept[] = deepFreeze([]);
  const EMPTY_QUESTIONS: Question[] = deepFreeze([]);
  const EMPTY_SECTIONS: Section[] = deepFreeze([]);

  return Object.freeze<ContentRepo>({
    topics: () => topicsSorted,
    topicBySlug: (slug) => topicBySlug.get(slug),
    concepts: () => concepts,
    conceptById: (id) => conceptById.get(id),
    conceptsByTopic: (topicId) => conceptsByTopicId.get(topicId) ?? EMPTY_CONCEPTS,
    prerequisites: (conceptId) =>
      (conceptById.get(conceptId)?.dependsOn ?? [])
        .map((id) => conceptById.get(id))
        .filter((dep): dep is Concept => dep !== undefined),
    questions: () => allQuestions,
    questionById: (id) => questionById.get(id),
    questionsByTopic: (topicSlug) => questionsByTopicSlug.get(topicSlug) ?? EMPTY_QUESTIONS,
    questionsByConcept: (conceptId) => questionsByConceptId.get(conceptId) ?? EMPTY_QUESTIONS,
    signs: () => signs,
    sections: () => sections,
    sectionById: (id) => sectionById.get(id),
    sectionsByTopic: (topicId) => sectionsByTopicId.get(topicId) ?? EMPTY_SECTIONS,
  });
}

// --------------------------------------------------------------------------
// Filesystem wiring (module init)
// --------------------------------------------------------------------------

function readJson(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`Cannot read content file ${file}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`Invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

/**
 * /content lives at the repo root, one level above platform/. Next.js and
 * vitest run with cwd = platform/, repo-level tooling with cwd = repo root —
 * probe both. Exported for server code that streams content-owned assets
 * (e.g. the sign artwork route) — client code never touches the filesystem.
 */
export function resolveContentDir(): string {
  const candidates = [
    path.join(process.cwd(), "content"),
    path.resolve(process.cwd(), "..", "content"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "topics.json"))) return dir;
  }
  throw new Error(
    `Content directory not found (cwd: ${process.cwd()}). Looked for topics.json in: ${candidates.join(", ")}`,
  );
}

function loadRawContentFromDisk(): RawContent {
  const contentDir = resolveContentDir();

  const questionsDir = path.join(contentDir, "questions");
  const questionsBySlug: Record<string, unknown> = {};
  if (fs.existsSync(questionsDir)) {
    for (const file of fs.readdirSync(questionsDir)) {
      if (!file.endsWith(".json")) continue;
      questionsBySlug[file.slice(0, -".json".length)] = readJson(path.join(questionsDir, file));
    }
  }

  const sectionsFile = path.join(contentDir, "sections.json");
  // content/ and platform/ are siblings at the repo root.
  const worldDir = path.resolve(contentDir, "..", "platform", "public", "world");

  return {
    topics: readJson(path.join(contentDir, "topics.json")),
    concepts: readJson(path.join(contentDir, "concepts.json")),
    questionsBySlug,
    sections: fs.existsSync(sectionsFile) ? readJson(sectionsFile) : undefined,
    signs: readJson(path.join(contentDir, "signs", "signs.json")),
    svgExists: (svgFile) => fs.existsSync(path.join(contentDir, svgFile)),
    districtExists: (districtId) => fs.existsSync(path.join(worldDir, `${districtId}.json`)),
    sourceExists: (sourceId) => registeredSourceIds(contentDir).has(sourceId),
  };
}

/**
 * The ids in every non-statutory register, read once.
 *
 * Deliberately NOT `getSourceRegistry()` from lib/content/sources: this module
 * is imported at module-evaluation time by everything that touches content, and
 * pulling in the registry's full Zod validation here would make a malformed
 * register file take down the whole content load rather than fail the one row
 * that cites it. The registry does the real validation where it is used; this
 * only needs to answer "is that id registered at all?".
 */
let registeredIds: Set<string> | null = null;
function registeredSourceIds(contentDir: string): Set<string> {
  if (registeredIds) return registeredIds;
  const ids = new Set<string>();
  for (const dir of ["medical", "sources"]) {
    const file = path.join(contentDir, dir, "sources.json");
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = readJson(file) as { sources?: { id?: unknown }[] };
      for (const row of parsed.sources ?? []) {
        if (typeof row?.id === "string") ids.add(row.id);
      }
    } catch {
      /* a malformed register is simply an empty one here — see above */
    }
  }
  registeredIds = ids;
  return ids;
}

/** The validated, frozen repo over the real /content files. */
export const contentRepo: ContentRepo = buildContentRepo(loadRawContentFromDisk());

setContentRepo(contentRepo);
