/**
 * Test fixtures for the learning module — NOT part of the public API.
 *
 * Provides a tiny in-memory ContentRepo (injected via setContentRepo) and an
 * in-memory LearningStore fake (injected via setLearningStore) so unit tests
 * never touch real content files or the database.
 *
 * Fixture content graph:
 *   t-basics (order 1, "basics")
 *     c-road          diff 1, no prereqs      → q-road-1 (1pt single approved),
 *                                               q-road-2 (2pt single draft)
 *     c-priority      diff 2, needs c-road    → q-prio-1 (3pt multi approved),
 *                                               q-prio-2 (2pt single needs-review)
 *   t-signs (order 2, "signs")
 *     c-warning       diff 1, no prereqs      → q-warn-1, q-warn-2 (1pt single approved)
 *     c-sign-priority diff 3, needs c-priority→ q-sprio-1 (3pt single approved,
 *                                               also maps to c-priority)
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { Concept, Question, Topic } from "@/lib/content/types";
import type {
  AttemptRecord,
  LearningStore,
  ProgressRow,
  ProgressUpdate,
} from "./store";

// ---------------------------------------------------------------------------
// Content fixture
// ---------------------------------------------------------------------------

const TOPICS: Topic[] = [
  {
    id: "t-basics",
    order: 1,
    slug: "basics",
    titleBg: "Основни правила",
    titleEn: "Basics",
    descriptionBg: "",
  },
  {
    id: "t-signs",
    order: 2,
    slug: "signs",
    titleBg: "Пътни знаци",
    titleEn: "Signs",
    descriptionBg: "",
  },
];

function concept(
  id: string,
  topicId: string,
  dependsOn: string[],
  difficulty: 1 | 2 | 3,
): Concept {
  return {
    id,
    topicId,
    titleBg: `Понятие ${id}`,
    titleEn: id,
    summaryBg: "",
    dependsOn,
    lawRefs: [],
    difficulty,
  };
}

const CONCEPTS: Concept[] = [
  concept("c-road", "t-basics", [], 1),
  concept("c-priority", "t-basics", ["c-road"], 2),
  concept("c-warning", "t-signs", [], 1),
  concept("c-sign-priority", "t-signs", ["c-priority"], 3),
];

function question(
  id: string,
  conceptIds: string[],
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    conceptIds,
    type: "single",
    points: 1,
    textBg: `Въпрос ${id}`,
    options: [
      { id: `${id}-a`, textBg: "А", correct: true },
      { id: `${id}-b`, textBg: "Б", correct: false },
      { id: `${id}-c`, textBg: "В", correct: false },
    ],
    explanationBg: `Обяснение за ${id}`,
    lawRefs: [{ act: "ЗДвП", ref: "чл. 5" }],
    media: null,
    status: "approved",
    ...overrides,
  };
}

const QUESTIONS: Question[] = [
  question("q-road-1", ["c-road"]),
  question("q-road-2", ["c-road"], { points: 2, status: "draft" }),
  question("q-prio-1", ["c-priority"], {
    type: "multi",
    points: 3,
    options: [
      { id: "q-prio-1-a", textBg: "А", correct: true },
      { id: "q-prio-1-b", textBg: "Б", correct: true },
      { id: "q-prio-1-c", textBg: "В", correct: false },
    ],
  }),
  question("q-prio-2", ["c-priority"], { points: 2, status: "needs-review" }),
  question("q-warn-1", ["c-warning"]),
  question("q-warn-2", ["c-warning"]),
  question("q-sprio-1", ["c-sign-priority", "c-priority"], { points: 3 }),
];

export function makeFixtureRepo(): ContentRepo {
  return {
    topics: () => TOPICS,
    topicBySlug: (slug) => TOPICS.find((t) => t.slug === slug),
    concepts: () => CONCEPTS,
    conceptById: (id) => CONCEPTS.find((c) => c.id === id),
    conceptsByTopic: (topicId) => CONCEPTS.filter((c) => c.topicId === topicId),
    prerequisites: (conceptId) => {
      const c = CONCEPTS.find((x) => x.id === conceptId);
      if (!c) return [];
      return c.dependsOn
        .map((id) => CONCEPTS.find((x) => x.id === id))
        .filter((x): x is Concept => x !== undefined);
    },
    questions: () => QUESTIONS,
    questionById: (id) => QUESTIONS.find((q) => q.id === id),
    questionsByTopic: (topicSlug) => {
      const topic = TOPICS.find((t) => t.slug === topicSlug);
      if (!topic) return [];
      const conceptIds = new Set(
        CONCEPTS.filter((c) => c.topicId === topic.id).map((c) => c.id),
      );
      return QUESTIONS.filter((q) =>
        q.conceptIds.some((id) => conceptIds.has(id)),
      );
    },
    questionsByConcept: (conceptId) =>
      QUESTIONS.filter((q) => q.conceptIds.includes(conceptId)),
    signs: () => [],
  };
}

// ---------------------------------------------------------------------------
// Store fake
// ---------------------------------------------------------------------------

export interface RecordAnswerCall {
  userId: string;
  attempt: AttemptRecord;
  updates: ProgressUpdate[];
}

export class FakeLearningStore implements LearningStore {
  private progress = new Map<string, Map<string, ProgressRow>>();
  private attempts: (AttemptRecord & { userId: string })[] = [];
  /** Every recordAnswer call — one entry per (atomic) transaction. */
  readonly recordAnswerCalls: RecordAnswerCall[] = [];

  seedProgress(
    userId: string,
    row: { conceptId: string } & Partial<Omit<ProgressRow, "conceptId">>,
  ): void {
    const rows = this.progress.get(userId) ?? new Map<string, ProgressRow>();
    rows.set(row.conceptId, {
      conceptId: row.conceptId,
      mastery: row.mastery ?? 0,
      reps: row.reps ?? 0,
      lapses: row.lapses ?? 0,
      dueAt: row.dueAt ?? null,
      updatedAt: row.updatedAt ?? new Date(),
    });
    this.progress.set(userId, rows);
  }

  seedAttempt(
    userId: string,
    attempt: { questionId: string; correct: boolean; answeredAt: Date } & {
      context?: AttemptRecord["context"];
      points?: number;
    },
  ): void {
    this.attempts.push({
      userId,
      questionId: attempt.questionId,
      correct: attempt.correct,
      answeredAt: attempt.answeredAt,
      context: attempt.context ?? "practice",
      points: attempt.points ?? 1,
    });
  }

  getProgressRow(userId: string, conceptId: string): ProgressRow | undefined {
    return this.progress.get(userId)?.get(conceptId);
  }

  async getProgress(userId: string): Promise<ProgressRow[]> {
    return [...(this.progress.get(userId)?.values() ?? [])];
  }

  async getCorrectlyAnsweredSince(
    userId: string,
    since: Date,
  ): Promise<string[]> {
    const ids = this.attempts
      .filter(
        (a) =>
          a.userId === userId &&
          a.correct &&
          a.answeredAt.getTime() >= since.getTime(),
      )
      .map((a) => a.questionId);
    return [...new Set(ids)];
  }

  async recordAnswer(
    userId: string,
    attempt: AttemptRecord,
    updates: ProgressUpdate[],
  ): Promise<void> {
    this.recordAnswerCalls.push({ userId, attempt, updates });
    this.attempts.push({ userId, ...attempt });
    for (const u of updates) {
      this.seedProgress(userId, { ...u, updatedAt: attempt.answeredAt });
    }
  }

  async upsertProgress(
    userId: string,
    updates: ProgressUpdate[],
  ): Promise<void> {
    for (const u of updates) {
      this.seedProgress(userId, { ...u, updatedAt: new Date() });
    }
  }
}
