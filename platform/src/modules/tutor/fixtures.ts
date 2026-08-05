/**
 * Test fixtures for the tutor module — NOT part of the public API.
 *
 * Tiny Bulgarian content bank (injected via setContentRepo), an in-memory
 * TutorStore fake (setTutorStore) and a scripted TutorModel fake
 * (setTutorModel) so unit tests never touch content files, the database or
 * the real Anthropic API.
 *
 * THE BANK IS DELIBERATELY MIXED-CLEARANCE. Retrieval now filters every
 * candidate through the classroom's gate (retrieval.ts), so a fixture bank
 * where everything clears would test the scorer and quietly stop testing the
 * gate — which is the exact shape of the defect that put this gate here. So:
 *
 *   CLEARS   QUESTION_PRIORITY, QUESTION_SPEED (`approved` AND their citation
 *            pinned — see the note on QUESTION_PRIORITY for why those two rows
 *            alone carry a real id), SIGN_STOP (`approved`)
 *   WITHHELD QUESTION_DRAFT (`needs-review`), SIGN_DRAFT (`draft`), and BOTH
 *            concepts — `concepts.json` has no status field, so a summary is
 *            spoken only if its exact bytes are pinned in the classroom's carry
 *            (lesson/clearanceCarry.ts), and an invented fixture id can never
 *            be. That is not a limitation of the fixture; it is the gate's
 *            fail-closed default, observed.
 *
 * Every withheld row shares vocabulary with a cleared one on purpose: each
 * would out-rank or tie its cleared twin if the gate were removed, so the
 * assertions below fail loudly rather than silently passing on an empty bank.
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { Concept, Question, Sign, Topic } from "@/lib/content/types";
import type { TutorModel, TutorModelMessage } from "./model";
import type {
  TutorMessage,
  TutorStore,
  TutorThreadRecord,
  TutorUsageDelta,
} from "./store";

// ---------------------------------------------------------------------------
// Content fixture
// ---------------------------------------------------------------------------

const TOPICS: Topic[] = [
  {
    id: "t-priority",
    order: 1,
    slug: "predimstvo",
    titleBg: "Предимство",
    titleEn: "Priority",
    descriptionBg: "",
  },
];

/**
 * WITHHELD — `concept-not-carried`. Kept in the bank precisely because it is a
 * strong match for the priority questions below: if the gate is removed it
 * comes straight back and the assertions that name it fail.
 */
export const CONCEPT_PRIORITY: Concept = {
  id: "c-predimstvo",
  topicId: "t-priority",
  titleBg: "Предимство на кръстовище",
  titleEn: "Priority at intersections",
  summaryBg:
    "Водачът е длъжен да пропусне пътните превозни средства, които се движат по пътя с предимство.",
  dependsOn: [],
  lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
  difficulty: 2,
};

/** WITHHELD — `concept-not-carried`, same reason. */
export const CONCEPT_SPEED: Concept = {
  id: "c-skorost",
  topicId: "t-priority",
  titleBg: "Ограничения на скоростта",
  titleEn: "Speed limits",
  summaryBg:
    "В населено място скоростта е ограничена до 50 км/ч, извън населено място до 90 км/ч.",
  dependsOn: [],
  lawRefs: [{ act: "ЗДвП", ref: "чл. 21" }],
  difficulty: 1,
};

/**
 * CLEARS — and its `id` and `lawRefs` are REAL, which they did not have to be
 * until the question bank got a citation pin.
 *
 * `questionClearance` now asks two things: „did a human approve this row?"
 * (`status`) and „did a machine verify the citation printed beside it?"
 * (lesson/clearanceQuestionCitations.ts). The second cannot be answered for an
 * invented id — the same fail-closed default that keeps both fixture CONCEPTS
 * withheld. So this row borrows the id and the citation of a real approved row
 * (`q-predimstvo-003`, pinned to „ЗДвП чл. 48"); everything a tutor test
 * actually exercises — the text, the options, the explanation, the scoring —
 * is still invented here. If a content wave re-freezes that row's citation,
 * this fixture goes red, which is the correct and informative failure.
 */
export const QUESTION_PRIORITY: Question = {
  id: "q-predimstvo-003",
  conceptIds: ["c-predimstvo"],
  type: "single",
  points: 3,
  textBg: "Кой има предимство на нерегулирано кръстовище?",
  options: [
    { id: "a", textBg: "Идващият отдясно", correct: true },
    { id: "b", textBg: "Идващият отляво", correct: false },
  ],
  explanationBg:
    "На нерегулирано кръстовище на равнозначни пътища предимство има пътното превозно средство, което идва отдясно.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 48" }],
  media: null,
  status: "approved",
};

/**
 * CLEARS (`approved`). Carries the speed vocabulary the withheld CONCEPT_SPEED
 * used to be the only source of, so „a new topic mid-thread" still has
 * something honest to land on. Real id + real citation, for the reason given
 * on QUESTION_PRIORITY above (`q-speed-001`, pinned to „ЗДвП чл. 21").
 */
export const QUESTION_SPEED: Question = {
  id: "q-speed-001",
  conceptIds: ["c-skorost"],
  type: "single",
  points: 2,
  textBg: "Каква е максималната скорост в града?",
  options: [
    { id: "a", textBg: "50 км/ч", correct: true },
    { id: "b", textBg: "60 км/ч", correct: false },
  ],
  explanationBg:
    "В населено място скоростта е ограничена до 50 км/ч, освен ако знак не разпорежда друго.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 21" }],
  media: null,
  status: "approved",
};

/**
 * WITHHELD — `question-not-approved`. Deliberately built out of the SAME words
 * as QUESTION_PRIORITY, so it scores in the same band: it is filtered by its
 * status, never by the scorer failing to find it.
 */
export const QUESTION_DRAFT: Question = {
  id: "q-predimstvo-2",
  conceptIds: ["c-predimstvo"],
  type: "single",
  points: 3,
  textBg: "Кой има предимство на нерегулирано кръстовище с трамвай?",
  options: [
    { id: "a", textBg: "Трамваят", correct: true },
    { id: "b", textBg: "Идващият отдясно", correct: false },
  ],
  explanationBg:
    "На нерегулирано кръстовище предимство има трамваят пред пътните превозни средства.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 49" }],
  media: null,
  status: "needs-review",
};

export const SIGN_STOP: Sign = {
  id: "sign-b2",
  code: "Б2",
  group: "Б",
  nameBg: "Спри! Пропусни движещите се по пътя с предимство!",
  meaningBg:
    "Знакът Б2 задължава водача да спре и да пропусне превозните средства по пътя с предимство.",
  svgFile: "signs/b2.svg",
  lawRefs: [{ act: "ППЗДвП", ref: "чл. 46" }],
  status: "approved",
};

/**
 * WITHHELD — `sign-not-approved`. This is the real bank's normal case, not an
 * edge one: 71 of 77 signs are `draft` and the remaining 6 are `needs-review`,
 * so today the gate silences the WHOLE sign catalogue for the tutor.
 */
export const SIGN_DRAFT: Sign = {
  id: "sign-a1",
  code: "А1",
  group: "А",
  nameBg: "Опасен завой надясно",
  meaningBg:
    "Знакът А1 предупреждава за опасен завой надясно и изисква намаляване на скоростта.",
  svgFile: "signs/a1.svg",
  lawRefs: [{ act: "ППЗДвП", ref: "чл. 39" }],
  status: "draft",
};

const CONCEPTS = [CONCEPT_PRIORITY, CONCEPT_SPEED];
const QUESTIONS = [QUESTION_PRIORITY, QUESTION_SPEED, QUESTION_DRAFT];
const SIGNS = [SIGN_STOP, SIGN_DRAFT];

export function makeTutorFixtureRepo(): ContentRepo {
  return {
    topics: () => TOPICS,
    topicBySlug: (slug) => TOPICS.find((t) => t.slug === slug),
    concepts: () => CONCEPTS,
    conceptById: (id) => CONCEPTS.find((c) => c.id === id),
    conceptsByTopic: (topicId) => CONCEPTS.filter((c) => c.topicId === topicId),
    prerequisites: () => [],
    questions: () => QUESTIONS,
    questionById: (id) => QUESTIONS.find((q) => q.id === id),
    questionsByTopic: () => QUESTIONS,
    questionsByConcept: (conceptId) =>
      QUESTIONS.filter((q) => q.conceptIds.includes(conceptId)),
    signs: () => SIGNS,
  };
}

// ---------------------------------------------------------------------------
// Store fake
// ---------------------------------------------------------------------------

export interface SaveExchangeCall {
  threadId: string;
  messages: TutorMessage[];
  usage: TutorUsageDelta;
}

export class FakeTutorStore implements TutorStore {
  private threads = new Map<string, TutorThreadRecord>();
  private nextId = 1;
  readonly saveExchangeCalls: SaveExchangeCall[] = [];
  /** day ("YYYY-MM-DD") → global micro-USD, mirroring TutorSpendDay. */
  readonly spendByDay = new Map<string, number>();

  seedThread(
    userId: string,
    thread: Partial<Omit<TutorThreadRecord, "id">> & { id?: string } = {},
  ): TutorThreadRecord {
    const record: TutorThreadRecord = {
      id: thread.id ?? `thread-${this.nextId++}`,
      messages: thread.messages ?? [],
      tokensIn: thread.tokensIn ?? 0,
      tokensOut: thread.tokensOut ?? 0,
      costMicroUsd: thread.costMicroUsd ?? 0,
    };
    this.threads.set(userId, record);
    return record;
  }

  threadFor(userId: string): TutorThreadRecord | undefined {
    return this.threads.get(userId);
  }

  async getThreadByUser(userId: string): Promise<TutorThreadRecord | null> {
    return this.threads.get(userId) ?? null;
  }

  async createThread(userId: string): Promise<TutorThreadRecord> {
    return this.seedThread(userId);
  }

  async saveExchange(
    threadId: string,
    messages: TutorMessage[],
    usage: TutorUsageDelta,
  ): Promise<void> {
    this.saveExchangeCalls.push({ threadId, messages, usage });
    for (const record of this.threads.values()) {
      if (record.id === threadId) {
        record.messages = messages;
        record.tokensIn += usage.tokensIn;
        record.tokensOut += usage.tokensOut;
        record.costMicroUsd += usage.costMicroUsd;
      }
    }
  }

  /** Seed a day as already spent, to drive the kill-switch in tests. */
  seedDaySpend(day: string, costMicroUsd: number): void {
    this.spendByDay.set(day, costMicroUsd);
  }

  async spentOnDay(day: string): Promise<number> {
    return this.spendByDay.get(day) ?? 0;
  }

  async recordDaySpend(day: string, usage: TutorUsageDelta): Promise<void> {
    this.spendByDay.set(day, (this.spendByDay.get(day) ?? 0) + usage.costMicroUsd);
  }
}

// ---------------------------------------------------------------------------
// Model fake
// ---------------------------------------------------------------------------

export interface CompleteCall {
  system: string;
  messages: TutorModelMessage[];
  maxTokens: number;
}

export class FakeTutorModel implements TutorModel {
  readonly completeCalls: CompleteCall[] = [];

  constructor(
    private reply: string,
    private usage: { inputTokens: number; outputTokens: number } = {
      inputTokens: 100,
      outputTokens: 50,
    },
  ) {}

  async complete(input: CompleteCall) {
    this.completeCalls.push(input);
    return { text: this.reply, ...this.usage };
  }
}
