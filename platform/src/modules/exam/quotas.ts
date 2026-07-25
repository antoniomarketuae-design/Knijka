/**
 * The mock exam's topic mix, as a SPEC rather than an accident.
 *
 * WHY THIS FILE EXISTS (audit M-11). Quotas used to be derived purely from how
 * many approved questions each topic happened to hold. Over 500 seeds every
 * topic's count came out with min == max — the mix looked deliberate, but it
 * was arithmetic: 16 topics, 45 slots and near-equal pool sizes produce "3 of
 * everything" on their own. Two consequences, both silent:
 *
 *  1. Authoring re-weighted the exam. Adding 40 parking questions would have
 *     moved a slot off some other topic in every future paper, with no review,
 *     no ADR and nothing in docs/education/32 to compare against.
 *  2. The weighting was wrong on its merits. Пътни знаци — the biggest,
 *     most-examined official topic — drew the same 3 slots as икономично
 *     шофиране, because their banks are a similar size.
 *
 * docs/education/32 pins 45 questions / 97 points / ≥87 / 40:00 and says
 * nothing about distribution, so this table is where that decision now lives.
 * It is a product decision, edited here on purpose and nowhere else.
 *
 * V1 BASELINE (2026-07-25): each topic's share of the authored bank, converted
 * to whole slots by largest remainder. The authored bank is the curriculum's
 * own statement of weight — an author who writes 89 sign questions and 51
 * night-driving ones has already said which matters more — and starting from
 * it means this table changes nothing about *today's* papers except the two
 * places the old arithmetic was visibly wrong (знаци and маневри to 4 slots,
 * предимство and кръстовища to 2). What it changes is the future: from now on
 * the mix moves only when someone edits this table.
 *
 * RULES FOR EDITING
 * -----------------
 * - The quotas must sum to exactly EXAM_QUESTION_COUNT (45) — asserted in
 *   quotas.test.ts, not merely documented.
 * - Every slug must exist in content/topics.json, and every topic in
 *   content/topics.json must appear here. A curriculum change is a deliberate
 *   edit in both files; the builder falls back to proportional allocation and
 *   shouts if they ever disagree (buildExam → assignQuotas).
 * - A topic must keep at least 1 slot: docs/education/32's format is a paper
 *   that examines the whole curriculum, and auditExamSupply() treats a topic
 *   worth 0 slots as dark.
 */

import { EXAM_QUESTION_COUNT } from "./types";

/** One row of the declared mix: a topics.json slug and the slots it is owed. */
export interface TopicQuota {
  /** content/topics.json `slug`. */
  readonly slug: string;
  /** Questions this topic contributes to every mock exam. */
  readonly quota: number;
  /** Why this topic is worth these slots — read by the next person editing. */
  readonly rationale: string;
}

/** The declared mix. Curriculum order (topics.json `order`). Sums to 45. */
export const EXAM_TOPIC_QUOTAS: readonly TopicQuota[] = [
  {
    slug: "osnovni-ponyatia",
    quota: 3,
    rationale: "Задълженията и златните правила се проверяват във всеки изпит.",
  },
  {
    slug: "prevozno-sredstvo",
    quota: 3,
    rationale: "Оборудване, светлини и проверка преди потегляне — стабилна група.",
  },
  {
    slug: "patni-znatsi",
    quota: 4,
    rationale: "Най-голямата и най-често изпитвана официална тема.",
  },
  {
    slug: "signali-i-markirovka",
    quota: 3,
    rationale: "Светофар, регулировчик и маркировка — темата, която M-8 хвана да тъмнее.",
  },
  {
    slug: "predimstvo",
    quota: 2,
    rationale: "Малка по обем, но носи най-тежките въпроси (3 точки).",
  },
  {
    slug: "krastovishta",
    quota: 2,
    rationale: "Тясно свързана с предимството; двете заедно дават 4 слота.",
  },
  {
    slug: "skorost-i-distantsia",
    quota: 3,
    rationale: "Ограничения, спирачен път и дистанция — физиката на изпита.",
  },
  {
    slug: "manevri-i-izprevarvane",
    quota: 4,
    rationale: "Втората по обем тема; изпреварването е сред най-честите грешки.",
  },
  {
    slug: "uyazvimi-uchastnitsi",
    quota: 3,
    rationale: "Пешеходци и деца — темата с най-висока цена на грешката.",
  },
  {
    slug: "magistrali-i-izvangradsko",
    quota: 3,
    rationale: "Отделен режим на движение със собствени забрани.",
  },
  {
    slug: "spirane-i-parkirane",
    quota: 2,
    rationale: "Обемна, но с по-ниска тежест на въпросите.",
  },
  {
    slug: "nosht-i-uslozhneni-uslovia",
    quota: 2,
    rationale: "Най-малката авторска тема в банката.",
  },
  {
    slug: "alkohol-i-godnost",
    quota: 3,
    rationale: "Годност за шофиране — присъства във всеки официален вариант.",
  },
  {
    slug: "dokumenti-i-sanktsii",
    quota: 2,
    rationale: "Административна материя; проверява се, но не доминира.",
  },
  {
    slug: "ptp-i-parva-pomosht",
    quota: 3,
    rationale: "Задълженията при ПТП са част от всеки изпитен вариант.",
  },
  {
    slug: "eko-i-zashtitno-shofirane",
    quota: 3,
    rationale: "Защитното шофиране е и северната звезда на продукта.",
  },
];

/** Slots the table hands out in total — must equal EXAM_QUESTION_COUNT. */
export const DECLARED_QUOTA_TOTAL: number = EXAM_TOPIC_QUOTAS.reduce(
  (n, t) => n + t.quota,
  0,
);

/**
 * Fail fast at import time if the table stops summing to 45. A wrong table is
 * not a "degraded exam" — it is a paper that cannot be the official format, so
 * there is no useful runtime behaviour to fall back to.
 */
if (DECLARED_QUOTA_TOTAL !== EXAM_QUESTION_COUNT) {
  throw new Error(
    `exam/quotas: declared topic quotas sum to ${DECLARED_QUOTA_TOTAL}, expected ${EXAM_QUESTION_COUNT}`,
  );
}

const bySlug = new Map(EXAM_TOPIC_QUOTAS.map((t) => [t.slug, t.quota]));

/** Declared slots for a topics.json slug, or undefined when it is not in the table. */
export function declaredQuotaFor(slug: string): number | undefined {
  return bySlug.get(slug);
}
