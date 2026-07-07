/**
 * Test fixtures for the tutor module — NOT part of the public API.
 *
 * Tiny Bulgarian content bank (injected via setContentRepo), an in-memory
 * TutorStore fake (setTutorStore) and a scripted TutorModel fake
 * (setTutorModel) so unit tests never touch content files, the database or
 * the real Anthropic API.
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

export const QUESTION_PRIORITY: Question = {
  id: "q-predimstvo-1",
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

const CONCEPTS = [CONCEPT_PRIORITY, CONCEPT_SPEED];
const QUESTIONS = [QUESTION_PRIORITY];
const SIGNS = [SIGN_STOP];

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
