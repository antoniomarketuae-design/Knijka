/**
 * Test fixtures: synthetic content banks + a fixture ContentRepo to inject
 * via setContentRepo(). No real /content files are touched by tests.
 */

import type { ContentRepo } from "../../../lib/content/repo";
import type { Concept, Question, Topic } from "../../../lib/content/types";
import { EXAM_TOPIC_QUOTAS } from "../quotas";

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

/**
 * Bank whose topics carry the REAL topics.json slugs, so buildExam takes the
 * declared-quota path (quotas.ts) instead of the proportional fallback. Every
 * topic gets a generous, weight-balanced pool: 12 questions per weight, which
 * is more than any declared quota, so supply never constrains the mix.
 *
 * `extraFor`/`extra` grow one topic's pool (audit M-11: authoring volume must
 * no longer move slots); `starveSlug`/`keepApproved` shrink one topic's
 * APPROVED pool below its declared quota so the re-flow path is exercised.
 */
export function declaredQuotaBank(opts?: {
  extraFor?: string;
  extra?: number;
  starveSlug?: string;
  keepApproved?: number;
}): FixtureBank {
  const topics: Topic[] = EXAM_TOPIC_QUOTAS.map((row, i) => ({
    id: `t-${row.slug}`,
    order: i + 1,
    slug: row.slug,
    titleBg: `Тема ${row.slug}`,
    titleEn: `Topic ${row.slug}`,
    descriptionBg: "",
  }));
  const concepts: Concept[] = topics.map((t) => ({
    id: `c-${t.slug}`,
    topicId: t.id,
    titleBg: `Понятие ${t.slug}`,
    titleEn: `Concept ${t.slug}`,
    summaryBg: "",
    dependsOn: [],
    lawRefs: [],
    difficulty: 1,
  }));

  const questions: Question[] = [];
  for (const t of topics) {
    const perWeight = t.slug === opts?.extraFor ? 12 + (opts.extra ?? 0) : 12;
    const keep = t.slug === opts?.starveSlug ? (opts.keepApproved ?? 0) : Infinity;
    let approvedSoFar = 0;
    for (let i = 1; i <= perWeight; i++) {
      for (const points of [1, 2, 3] as const) {
        const approved = approvedSoFar < keep;
        if (approved) approvedSoFar++;
        questions.push(
          makeQuestion(`q-${t.slug}-${points}p-${i}`, `c-${t.slug}`, points, {
            status: approved ? "approved" : "needs-review",
          }),
        );
      }
    }
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

/** Bank where every question is worth 3 points — the lightest 45 is already 135. */
export function allThreesBank(): FixtureBank {
  const keys = ["a", "b", "c", "d"];
  const topics = keys.map((k, i) => makeTopic(k, i + 1));
  const concepts = keys.map((k) => makeConcept(k));
  const questions: Question[] = [];
  for (const k of keys) {
    for (let i = 1; i <= 15; i++) {
      questions.push(makeQuestion(`q-${k}-${i}`, `c-${k}`, 3));
    }
  }
  return { topics, concepts, questions };
}

/**
 * Four equally-authored topics of 45 questions each (15 per weight) — enough
 * supply for the audit's per-slot bar. `starveTopic` reproduces audit M-8: that
 * topic keeps only 3 approved questions per weight and the rest sit un-reviewed,
 * so its exam slots drift to the topics further through review while the paper
 * still looks perfectly valid. The backlog deliberately mixes `draft` with
 * `needs-review` — both are un-reviewed, so both must be equally un-examinable.
 */
export function supplyBank(opts?: { starveTopic?: string }): FixtureBank {
  const keys = ["a", "b", "c", "d"];
  const topics = keys.map((k, i) => makeTopic(k, i + 1));
  const concepts = keys.map((k) => makeConcept(k));
  const questions: Question[] = [];
  for (const k of keys) {
    const starved = opts?.starveTopic === k;
    for (const points of [1, 2, 3] as const) {
      for (let i = 1; i <= 15; i++) {
        const backlog = i % 2 === 0 ? "draft" : "needs-review";
        questions.push(
          makeQuestion(`q-${k}-${points}p-${i}`, `c-${k}`, points, {
            status: starved && i > 3 ? backlog : "approved",
          }),
        );
      }
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
