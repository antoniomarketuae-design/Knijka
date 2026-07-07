/**
 * Test fixtures for the gamification module — NOT part of the public API.
 *
 * FakeGamificationStore: in-memory GamificationStore (injected via
 * setGamificationStore) so unit tests never touch Prisma / DATABASE_URL.
 *
 * makeGamificationFixtureRepo: a tiny ContentRepo (injected via
 * setContentRepo) with two topics for mission + topic-mastered tests:
 *   t-alpha (order 1): c-a1, c-a2 → q-a1..q-a3 (q-a3 maps to both concepts)
 *   t-beta  (order 2): c-b1      → q-b1, q-b2
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { Concept, Question, Topic } from "@/lib/content/types";
import type {
  AttemptRow,
  GamificationStateRow,
  GamificationStore,
  MasteryRow,
  StateWrite,
} from "./store";

// ---------------------------------------------------------------------------
// Store fake
// ---------------------------------------------------------------------------

export class FakeGamificationStore implements GamificationStore {
  private states = new Map<string, GamificationStateRow>();
  private attempts: (AttemptRow & { userId: string })[] = [];
  private mastery = new Map<string, MasteryRow[]>();
  /** Every saveState call, for assertions on write behavior. */
  readonly saveStateCalls: { userId: string; state: StateWrite }[] = [];

  seedState(userId: string, state: Partial<GamificationStateRow>): void {
    this.states.set(userId, {
      xp: state.xp ?? 0,
      streak: state.streak ?? 0,
      lastActiveDay: state.lastActiveDay ?? null,
      achievements: state.achievements ?? [],
    });
  }

  seedAttempt(
    userId: string,
    attempt: { questionId: string; correct: boolean; answeredAt: Date } & {
      context?: string;
    },
  ): void {
    this.attempts.push({
      userId,
      questionId: attempt.questionId,
      context: attempt.context ?? "practice",
      correct: attempt.correct,
      answeredAt: attempt.answeredAt,
    });
  }

  seedMastery(userId: string, rows: MasteryRow[]): void {
    this.mastery.set(userId, rows);
  }

  getStateSync(userId: string): GamificationStateRow | undefined {
    return this.states.get(userId);
  }

  async getState(userId: string): Promise<GamificationStateRow | null> {
    const s = this.states.get(userId);
    // Deep-ish copy: callers must not mutate stored state through the read.
    return s ? { ...s, achievements: s.achievements.map((a) => ({ ...a })) } : null;
  }

  async saveState(userId: string, state: StateWrite): Promise<void> {
    this.saveStateCalls.push({ userId, state });
    this.states.set(userId, {
      xp: state.xp,
      streak: state.streak,
      lastActiveDay: state.lastActiveDay,
      achievements: state.achievements.map((a) => ({ ...a })),
    });
  }

  async countCorrectAnswers(userId: string): Promise<number> {
    return this.attempts.filter((a) => a.userId === userId && a.correct).length;
  }

  async getAttemptsSince(userId: string, since: Date): Promise<AttemptRow[]> {
    return this.attempts
      .filter(
        (a) =>
          a.userId === userId && a.answeredAt.getTime() >= since.getTime(),
      )
      .map(({ questionId, context, correct, answeredAt }) => ({
        questionId,
        context,
        correct,
        answeredAt,
      }));
  }

  async getMastery(userId: string): Promise<MasteryRow[]> {
    return (this.mastery.get(userId) ?? []).map((m) => ({ ...m }));
  }
}

// ---------------------------------------------------------------------------
// Content fixture
// ---------------------------------------------------------------------------

const TOPICS: Topic[] = [
  {
    id: "t-alpha",
    order: 1,
    slug: "alpha",
    titleBg: "Тема Алфа",
    titleEn: "Alpha",
    descriptionBg: "",
  },
  {
    id: "t-beta",
    order: 2,
    slug: "beta",
    titleBg: "Тема Бета",
    titleEn: "Beta",
    descriptionBg: "",
  },
];

function concept(id: string, topicId: string): Concept {
  return {
    id,
    topicId,
    titleBg: `Понятие ${id}`,
    titleEn: id,
    summaryBg: "",
    dependsOn: [],
    lawRefs: [],
    difficulty: 1,
  };
}

const CONCEPTS: Concept[] = [
  concept("c-a1", "t-alpha"),
  concept("c-a2", "t-alpha"),
  concept("c-b1", "t-beta"),
];

function question(id: string, conceptIds: string[]): Question {
  return {
    id,
    conceptIds,
    type: "single",
    points: 1,
    textBg: `Въпрос ${id}`,
    options: [
      { id: `${id}-a`, textBg: "А", correct: true },
      { id: `${id}-b`, textBg: "Б", correct: false },
    ],
    explanationBg: "",
    lawRefs: [],
    media: null,
    status: "approved",
  };
}

const QUESTIONS: Question[] = [
  question("q-a1", ["c-a1"]),
  question("q-a2", ["c-a2"]),
  question("q-a3", ["c-a1", "c-a2"]),
  question("q-b1", ["c-b1"]),
  question("q-b2", ["c-b1"]),
];

export function makeGamificationFixtureRepo(): ContentRepo {
  return {
    topics: () => TOPICS,
    topicBySlug: (slug) => TOPICS.find((t) => t.slug === slug),
    concepts: () => CONCEPTS,
    conceptById: (id) => CONCEPTS.find((c) => c.id === id),
    conceptsByTopic: (topicId) => CONCEPTS.filter((c) => c.topicId === topicId),
    prerequisites: () => [],
    questions: () => QUESTIONS,
    questionById: (id) => QUESTIONS.find((q) => q.id === id),
    questionsByTopic: (topicSlug) => {
      const topic = TOPICS.find((t) => t.slug === topicSlug);
      if (!topic) return [];
      const ids = new Set(
        CONCEPTS.filter((c) => c.topicId === topic.id).map((c) => c.id),
      );
      return QUESTIONS.filter((q) => q.conceptIds.some((id) => ids.has(id)));
    },
    questionsByConcept: (conceptId) =>
      QUESTIONS.filter((q) => q.conceptIds.includes(conceptId)),
    signs: () => [],
  };
}
