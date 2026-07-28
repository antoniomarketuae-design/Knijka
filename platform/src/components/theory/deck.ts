/**
 * The theory hub's SELECTION logic, kept pure and out of the components.
 *
 * WHY THIS FILE EXISTS AT ALL. The hub used to be a stacked accordion: sixteen
 * `<details>` rows that pushed the page down as you opened them. Founder
 * review, verbatim: „this choose scroll down is very old and unsatisfying".
 * Measured on the real device profile (390 x 844, dpr 3, isMobile) the old hub
 * was 5 066px tall — six viewport-heights — and put exactly ONE topic above the
 * fold, because the title band and the smart-training card between them ate
 * 520px before the first topic appeared.
 *
 * The redesign turns the list into an instrument board, and an instrument board
 * needs to answer a question a list cannot: WHERE SHOULD I GO NEXT. That answer
 * is the material below — a state per topic, a lens to filter by that state,
 * and one recommendation that says out loud why it picked what it picked.
 *
 * The last part is not decoration. Doc 64 THEO-4 forbids a bare verdict
 * anywhere in the theory module — every judgement the product makes has to
 * explain itself like an instructor would. "Study topic 5 next" is a judgement.
 * So `pickFocus` returns a reason string, not just a topic, and there is no way
 * to render the recommendation without it.
 */

import type { TopicOverview } from "@/modules/learning";

/**
 * Mastery at or above this counts as "learned" for the purposes of the board.
 * It is the same 0.75 the shared mastery palette turns green at
 * (`components/ui/mastery.ts`), and it must stay the same number: a tile whose
 * ring is green but whose chip says „в процес" is a board that lies.
 */
export const MASTERED_AT = 0.75;

export type TopicState = "fresh" | "progress" | "mastered";

export type DeckLens = "all" | "due" | "progress" | "fresh" | "mastered";

/**
 * Which of the three states a topic is in.
 *
 * `fresh` keys off `seenConceptCount`, NOT off mastery. That distinction is the
 * one `components/ui/mastery.ts` was written to fix: a student who opens a
 * topic and scores 0% has started it, and showing them „не е започната" after
 * they answered ten questions is the board forgetting what they did.
 */
export function topicState(topic: TopicOverview): TopicState {
  if (topic.seenConceptCount === 0) return "fresh";
  return topic.avgMastery >= MASTERED_AT ? "mastered" : "progress";
}

/** Bulgarian label for a state — the tile chip and the screen-reader text. */
export function stateLabel(state: TopicState): string {
  switch (state) {
    case "fresh":
      return "Незапочната";
    case "progress":
      return "В процес";
    case "mastered":
      return "Усвоена";
  }
}

export const LENS_LABELS: Record<DeckLens, string> = {
  all: "Всички",
  due: "За преговор",
  progress: "В процес",
  fresh: "Нови",
  mastered: "Усвоени",
};

/** The lens order the chip row renders in. */
export const LENSES: DeckLens[] = ["all", "due", "progress", "fresh", "mastered"];

export function matchesLens(topic: TopicOverview, lens: DeckLens): boolean {
  if (lens === "all") return true;
  if (lens === "due") return topic.dueCount > 0;
  return topicState(topic) === lens;
}

/** How many topics each lens would show — the counts baked into the chips. */
export function lensCounts(topics: TopicOverview[]): Record<DeckLens, number> {
  const counts: Record<DeckLens, number> = {
    all: topics.length,
    due: 0,
    progress: 0,
    fresh: 0,
    mastered: 0,
  };
  for (const topic of topics) {
    if (topic.dueCount > 0) counts.due += 1;
    counts[topicState(topic)] += 1;
  }
  return counts;
}

export interface DeckReadiness {
  /** Concepts with at least one recorded answer, across all topics. */
  seenConceptCount: number;
  /** Concepts in the whole curriculum. */
  conceptCount: number;
  /** Concepts due for review right now, across all topics. */
  dueCount: number;
  /**
   * Mastery over the WHOLE curriculum (0..1), concept-weighted.
   *
   * Not the mean of the per-topic averages: topics hold between 6 and 14
   * concepts, so averaging the averages would let a small topic move the
   * headline gauge as much as a large one. The gauge is read as „колко от
   * материала знам", and that is a concept count.
   */
  avgMastery: number;
  /** Topics whose average mastery has reached MASTERED_AT. */
  masteredTopics: number;
}

export function deckReadiness(topics: TopicOverview[]): DeckReadiness {
  let seen = 0;
  let total = 0;
  let due = 0;
  let masterySum = 0;
  let mastered = 0;
  for (const topic of topics) {
    seen += topic.seenConceptCount;
    total += topic.conceptCount;
    due += topic.dueCount;
    masterySum += topic.avgMastery * topic.conceptCount;
    if (topicState(topic) === "mastered") mastered += 1;
  }
  return {
    seenConceptCount: seen,
    conceptCount: total,
    dueCount: due,
    avgMastery: total === 0 ? 0 : masterySum / total,
    masteredTopics: mastered,
  };
}

export type FocusKind = "due" | "weakest" | "next" | "held";

export interface DeckFocus {
  /** `null` only in the `held` case — there is nothing left to point at. */
  topic: TopicOverview | null;
  kind: FocusKind;
  /** The heading above the recommendation. */
  title: string;
  /** WHY this topic (doc 64 THEO-4: never a bare instruction). */
  reason: string;
}

/** „18 понятия" / „1 понятие" — Bulgarian has no -s to lean on. */
function concepts(n: number): string {
  return n === 1 ? "1 понятие" : `${n} понятия`;
}

/**
 * The single next thing to do, and the sentence that justifies it.
 *
 * The order is deliberate and it is the spaced-repetition contract, not a
 * preference: work that is DUE decays if it is skipped, so it outranks work
 * that is merely unfinished. Only when nothing is due does the board fall back
 * to the weakest started topic, and only when everything started is strong does
 * it open new ground.
 *
 * Ties break on `order`, i.e. on exam-syllabus order, so the recommendation is
 * stable between reloads. A recommendation that moves on its own teaches the
 * student not to trust it.
 */
export function pickFocus(topics: TopicOverview[]): DeckFocus {
  const withDue = topics.filter((t) => t.dueCount > 0);
  if (withDue.length > 0) {
    const pick = withDue.reduce((best, t) =>
      t.dueCount > best.dueCount || (t.dueCount === best.dueCount && t.order < best.order)
        ? t
        : best,
    );
    return {
      topic: pick,
      kind: "due",
      title: "Преговори това сега",
      reason: `${concepts(pick.dueCount)} от „${pick.titleBg}" ${
        pick.dueCount === 1 ? "чака" : "чакат"
      } преговор. Точно те са най-близо до забравяне, затова започваме оттук.`,
    };
  }

  const started = topics.filter(
    (t) => t.seenConceptCount > 0 && t.avgMastery < MASTERED_AT,
  );
  if (started.length > 0) {
    const pick = started.reduce((best, t) =>
      t.avgMastery < best.avgMastery ||
      (t.avgMastery === best.avgMastery && t.order < best.order)
        ? t
        : best,
    );
    return {
      topic: pick,
      kind: "weakest",
      title: "Най-слабото ти място",
      reason: `„${pick.titleBg}" стои на ${Math.round(
        pick.avgMastery * 100,
      )}% — най-ниското от започнатите ти теми. Вдигнеш ли нея, вдигаш и общия резултат най-бързо.`,
    };
  }

  const fresh = topics.filter((t) => t.seenConceptCount === 0);
  if (fresh.length > 0) {
    const pick = fresh.reduce((best, t) => (t.order < best.order ? t : best));
    return {
      topic: pick,
      kind: "next",
      title: "Следващата тема",
      reason: `Още не си отварял „${pick.titleBg}" — ${concepts(
        pick.conceptCount,
      )}, подредени по реда на изпита. Това е новата територия.`,
    };
  }

  return {
    topic: null,
    kind: "held",
    title: "Всичко е усвоено",
    reason:
      "И 16-те теми са над 75%, а няма чакащи преговори. Пусни изпитен тест — сега проверката е по-полезна от още повторения.",
  };
}
