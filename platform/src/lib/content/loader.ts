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
import {
  ConceptsFileSchema,
  QuestionsFileSchema,
  SignsFileSchema,
  TopicsFileSchema,
} from "./schemas";
import type { Concept, Question, Sign, Topic } from "./types";

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
  /** Parsed signs/signs.json */
  signs: unknown;
  /** True if the svg asset referenced by a sign exists (path relative to /content). */
  svgExists: (svgFile: string) => boolean;
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

function parseFile<T>(schema: z.ZodType<T[]>, data: unknown, file: string): T[] {
  const result = schema.safeParse(data);
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

  // Every sign's svg asset must exist.
  for (const sign of signs) {
    if (!raw.svgExists(sign.svgFile)) {
      errors.push(`signs/signs.json: sign "${sign.id}" svgFile "${sign.svgFile}" does not exist`);
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
  deepFreeze(signs);

  const conceptsByTopicId = new Map<string, Concept[]>();
  for (const concept of concepts) {
    let bucket = conceptsByTopicId.get(concept.topicId);
    if (!bucket) conceptsByTopicId.set(concept.topicId, (bucket = []));
    bucket.push(concept);
  }

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
 * probe both.
 */
function resolveContentDir(): string {
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

  return {
    topics: readJson(path.join(contentDir, "topics.json")),
    concepts: readJson(path.join(contentDir, "concepts.json")),
    questionsBySlug,
    signs: readJson(path.join(contentDir, "signs", "signs.json")),
    svgExists: (svgFile) => fs.existsSync(path.join(contentDir, svgFile)),
  };
}

/** The validated, frozen repo over the real /content files. */
export const contentRepo: ContentRepo = buildContentRepo(loadRawContentFromDisk());

setContentRepo(contentRepo);
