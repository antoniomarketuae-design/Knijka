/**
 * Grounded system prompt for „Учителят" + citation extraction.
 *
 * ADR-002 contract enforced here:
 *  - the model sees ONLY retrieved materials and their lawRefs;
 *  - it is instructed to answer strictly from them, to refuse honestly when
 *    the materials don't cover the question, and to cite lawRefs as
 *    bracketed markers like [ЗДвП чл. 47] (chip-friendly for the UI);
 *  - extractCitations() only accepts markers that match a lawRef we actually
 *    injected, so a hallucinated reference can never become a citation chip.
 */

import type { LawRef } from "@/lib/content/types";
import type { RetrievedItem } from "./retrieval";

/** Exact refusal phrase the model must use for uncovered questions. */
export const TUTOR_NO_MATERIAL_REPLY_BG =
  "Нямам материал за това — питай ме за правилата от учебната програма.";

const KIND_LABEL_BG: Record<RetrievedItem["kind"], string> = {
  concept: "понятие",
  question: "изпитен въпрос",
  sign: "пътен знак",
};

/** "[ЗДвП чл. 47]" — the marker format the model is told to emit. */
export function formatLawRef(ref: LawRef): string {
  return `[${ref.act} ${ref.ref}]`;
}

export interface TutorPromptInput {
  materials: RetrievedItem[];
  /** titleBg of the student's weakest concepts (from learning readiness). */
  weakestConceptTitlesBg: string[];
}

export function buildTutorSystemPrompt(input: TutorPromptInput): string {
  const { materials, weakestConceptTitlesBg } = input;

  const materialsBlock =
    materials.length === 0
      ? "(няма намерени материали по този въпрос)"
      : materials
          .map((m, i) => {
            const refs =
              m.lawRefs.length > 0
                ? m.lawRefs.map(formatLawRef).join(", ")
                : "(без правно основание)";
            return [
              `[${i + 1}] (${KIND_LABEL_BG[m.kind]}) ${m.titleBg}`,
              m.bodyBg,
              `Правни основания: ${refs}`,
            ]
              .filter((line) => line.trim().length > 0)
              .join("\n");
          })
          .join("\n\n");

  const weakBlock =
    weakestConceptTitlesBg.length === 0
      ? "(няма данни — ученикът тепърва започва)"
      : weakestConceptTitlesBg.map((t) => `- ${t}`).join("\n");

  return [
    "Ти си „Учителят“ — личният AI инструктор по теория за шофьорския изпит в Книжка.AI.",
    "",
    "Стил: кратък, приятелски и търпелив. Обясняваш простичко, „на един дъх“ — 2–4 изречения, без канцеларски език. Отговаряш ВИНАГИ на български.",
    "",
    "Твърди правила:",
    "1. Отговаряш САМО въз основа на МАТЕРИАЛИТЕ по-долу. Никога не цитираш закон по памет и никога не си измисляш членове, числа или правила, които не са в МАТЕРИАЛИТЕ.",
    `2. Ако МАТЕРИАЛИТЕ не покриват въпроса, отговори точно с: „${TUTOR_NO_MATERIAL_REPLY_BG}“`,
    "3. Когато използваш материал, ВИНАГИ цитирай правните му основания в квадратни скоби, изписани точно както са дадени, например [ЗДвП чл. 47]. Не поставяй нищо друго в квадратни скоби.",
    "4. Когато е уместно (не във всеки отговор), завърши с кратко предложение ученикът да потренира някое от слабите си места.",
    "",
    "МАТЕРИАЛИ:",
    materialsBlock,
    "",
    "СЛАБИ МЕСТА НА УЧЕНИКА (най-слаби понятия, най-слабото първо):",
    weakBlock,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

const MARKER_RE = /\[([^\][]+)\]/g;

function normalizeMarker(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extract the law citations the model actually used, in order of first
 * appearance, deduplicated. Only markers matching a lawRef from the injected
 * materials are accepted — anything else (typos, invented refs) is dropped.
 */
export function extractCitations(reply: string, known: LawRef[]): LawRef[] {
  const byLabel = new Map<string, LawRef>();
  for (const ref of known) {
    byLabel.set(normalizeMarker(`${ref.act} ${ref.ref}`), ref);
  }

  const seen = new Set<string>();
  const citations: LawRef[] = [];
  for (const match of reply.matchAll(MARKER_RE)) {
    const label = normalizeMarker(match[1]);
    const ref = byLabel.get(label);
    if (ref && !seen.has(label)) {
      seen.add(label);
      citations.push(ref);
    }
  }
  return citations;
}
