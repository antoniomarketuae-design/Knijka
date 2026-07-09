import type { Concept, Question, Section, Sign, Topic } from "./types";

/**
 * Read-only access to the versioned learning content in /content.
 * Implemented by lib/content/loader.ts (build-time load + zod validation).
 * Modules consume ONLY this interface — never the JSON files directly.
 */
export interface ContentRepo {
  topics(): Topic[];
  topicBySlug(slug: string): Topic | undefined;
  concepts(): Concept[];
  conceptById(id: string): Concept | undefined;
  conceptsByTopic(topicId: string): Concept[];
  /** Prerequisites of a concept (direct dependsOn), resolved. */
  prerequisites(conceptId: string): Concept[];
  questions(): Question[];
  questionById(id: string): Question | undefined;
  questionsByTopic(topicSlug: string): Question[];
  questionsByConcept(conceptId: string): Question[];
  signs(): Sign[];
  /**
   * Sections — a presentation-only grouping of concepts (finer than topics).
   * OPTIONAL so lightweight test fixtures need not implement them; the real
   * loader always provides all three. Consumers must tolerate `undefined`
   * (treat as "no sections defined").
   */
  sections?(): Section[];
  sectionById?(id: string): Section | undefined;
  /** Sections whose parent is `topicId`, in content (file) order. */
  sectionsByTopic?(topicId: string): Section[];
}

let repo: ContentRepo | null = null;

/** Set by loader.ts on first import; test suites may inject a fixture repo. */
export function setContentRepo(r: ContentRepo): void {
  repo = r;
}

export function getContentRepo(): ContentRepo {
  if (!repo) {
    throw new Error(
      "ContentRepo not initialized — import '@/lib/content/loader' first (or setContentRepo in tests)",
    );
  }
  return repo;
}
