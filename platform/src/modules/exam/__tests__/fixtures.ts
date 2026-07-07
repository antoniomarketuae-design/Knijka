/**
 * Test fixtures: synthetic content banks + a fixture ContentRepo to inject
 * via setContentRepo(). No real /content files are touched by tests.
 */

import type { ContentRepo } from "../../../lib/content/repo";
import type { Concept, Question, Topic } from "../../../lib/content/types";

export interface FixtureBank {
  topics: Topic[];
  concepts: Concept[];
  questions: Question[];
}

function makeTopic(key: string, order: number): Topic {
  return {
    id: `t-${key}`,
    order,
    slug: `topic-${key}`,
    titleBg: `Тема ${key}`,
    titleEn: `Topic ${key}`,
    descriptionBg: "",
  };
}

function makeConcept(key: string): Concept {
  return {
    id: `c-${key}`,
    topicId: `t-${key}`,
    titleBg: `Понятие ${key}`,
    titleEn: `Concept ${key}`,
    summaryBg: "",
    dependsOn: [],
    lawRefs: [],
    difficulty: 1,
  };
}

export function makeQuestion(
  id: string,
  conceptId: string,
  points: 1 | 2 | 3,
  opts?: { type?: "single" | "multi"; status?: Question["status"] },
): Question {
  const type = opts?.type ?? "single";
  const optionCount = type === "multi" ? 4 : 3;
  return {
    id,
    conceptIds: [conceptId],
    type,
    points,
    textBg: `Въпрос ${id}?`,
    options: Array.from({ length: optionCount }, (_, i) => ({
      id: `${id}-o${i + 1}`,
      textBg: `Отговор ${i + 1}`,
      // single: o2 correct; multi: o1 + o3 correct (exact-set rule target)
      correct: type === "single" ? i === 1 : i === 0 || i === 2,
    })),
    explanationBg: `Обяснение за ${id}`,
    lawRefs: [{ act: "ЗДвП", ref: "чл. 1" }],
    media: null,
    status: opts?.status ?? "approved",
  };
}

/**
 * Rich bank: 4 topics x (18 eligible + 2 needs-review). Eligible per topic:
 * 6 x 1pt, 6 x 2pt (multi), 6 x 3pt — exactly-97 exams are always feasible.
 */
export function richBank(): FixtureBank {
  const keys = ["a", "b", "c", "d"];
  const topics = keys.map((k, i) => makeTopic(k, i + 1));
  const concepts = keys.map((k) => makeConcept(k));
  const questions: Question[] = [];
  for (const k of keys) {
    for (let i = 1; i <= 6; i++) {
      questions.push(
        makeQuestion(`q-${k}-1p-${i}`, `c-${k}`, 1, {
          status: i % 2 === 0 ? "draft" : "approved",
        }),
      );
      questions.push(makeQuestion(`q-${k}-2p-${i}`, `c-${k}`, 2, { type: "multi" }));
      questions.push(makeQuestion(`q-${k}-3p-${i}`, `c-${k}`, 3));
    }
    questions.push(makeQuestion(`q-${k}-nr-1`, `c-${k}`, 3, { status: "needs-review" }));
    questions.push(makeQuestion(`q-${k}-nr-2`, `c-${k}`, 2, { status: "needs-review" }));
  }
  return { topics, concepts, questions };
}

/** Bank where every question is worth 1 point — 97 is unreachable (max 45). */
export function allOnesBank(): FixtureBank {
  const keys = ["a", "b", "c", "d"];
  const topics = keys.map((k, i) => makeTopic(k, i + 1));
  const concepts = keys.map((k) => makeConcept(k));
  const questions: Question[] = [];
  for (const k of keys) {
    for (let i = 1; i <= 15; i++) {
      questions.push(makeQuestion(`q-${k}-${i}`, `c-${k}`, 1));
    }
  }
  return { topics, concepts, questions };
}

/** Bank with fewer than 45 eligible questions. */
export function tinyBank(): FixtureBank {
  const topics = [makeTopic("a", 1)];
  const concepts = [makeConcept("a")];
  const questions = Array.from({ length: 10 }, (_, i) =>
    makeQuestion(`q-a-${i + 1}`, "c-a", 1),
  );
  return { topics, concepts, questions };
}

/** ContentRepo over a fixture bank (inject with setContentRepo). */
export function makeFixtureRepo(bank: FixtureBank): ContentRepo {
  const { topics, concepts, questions } = bank;
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  return {
    topics: () => [...topics].sort((a, b) => a.order - b.order),
    topicBySlug: (slug) => topics.find((t) => t.slug === slug),
    concepts: () => concepts,
    conceptById: (id) => conceptById.get(id),
    conceptsByTopic: (topicId) => concepts.filter((c) => c.topicId === topicId),
    prerequisites: (conceptId) =>
      (conceptById.get(conceptId)?.dependsOn ?? [])
        .map((id) => conceptById.get(id))
        .filter((c): c is Concept => c !== undefined),
    questions: () => questions,
    questionById: (id) => questions.find((q) => q.id === id),
    questionsByTopic: (topicSlug) => {
      const topic = topics.find((t) => t.slug === topicSlug);
      if (!topic) return [];
      const topicConcepts = new Set(
        concepts.filter((c) => c.topicId === topic.id).map((c) => c.id),
      );
      return questions.filter((q) => q.conceptIds.some((id) => topicConcepts.has(id)));
    },
    questionsByConcept: (conceptId) =>
      questions.filter((q) => q.conceptIds.includes(conceptId)),
    signs: () => [],
  };
}

/** Correct option ids of a bank question (for building answers in tests). */
export function correctIds(bank: FixtureBank, questionId: string): string[] {
  const q = bank.questions.find((x) => x.id === questionId);
  if (!q) throw new Error(`fixture: unknown question ${questionId}`);
  return q.options.filter((o) => o.correct).map((o) => o.id);
}

/** topicId of a bank question (via its first concept). */
export function topicOf(bank: FixtureBank, questionId: string): string {
  const q = bank.questions.find((x) => x.id === questionId);
  if (!q) throw new Error(`fixture: unknown question ${questionId}`);
  const c = bank.concepts.find((x) => x.id === q.conceptIds[0]);
  if (!c) throw new Error(`fixture: unknown concept for ${questionId}`);
  return c.topicId;
}
