/**
 * Rehydrating a COMPLETED attempt's review — the read path for /exams/[id].
 *
 * WHY THIS EXISTS (audit M-1). The full review used to live only in the
 * browser: the runner cached it in localStorage after submit, and
 * getExamHistory returned a score and nothing else. So the paper a candidate
 * had just failed became a bare number on any other device, in any other
 * browser, after any cache clear — and, because nothing pruned the ~39 KB per
 * attempt, eventually on the same device too. The graded payload was never
 * missing: store.listAttempts already read the whole `answers` column and
 * toHistoryEntry threw it away.
 *
 * That is a requirement-zero problem, not a convenience one (docs/education/64,
 * THEO-4): a mock exam that reports "62/97" and no explanations is the bare
 * verdict this product exists to refuse. A failed exam is also the single
 * highest-intent teaching moment we get — so the review has to survive the
 * device it was taken on, and it has to point somewhere: hence the per-topic
 * breakdown, which turns 45 verdicts into the two or three topics worth
 * practising next.
 *
 * The enrichment (option texts, `correct` flags, explanations, law refs) is a
 * plain content-repo read, safe here because it is reachable only for an
 * attempt that is already graded and closed — the same rule the post-submit
 * screen follows.
 *
 * ---------------------------------------------------------------------------
 * DOOR 6 — WHY THE ENRICHMENT IS NOW CHECKED (docs/education/92 §10.3)
 * ---------------------------------------------------------------------------
 *
 * The paragraph above is true and was not enough. „Reachable only for a closed
 * attempt" says WHEN the read happens; it says nothing about WHAT is read, and
 * the two are separated by however long the candidate waits before opening the
 * review. The row is stored with `correct`, `points` and `maxPoints` — the
 * NUMBER is frozen deliberately (audit M-1: „a later content edit must not
 * change what the candidate could have scored") — while the TEXT beside it was
 * fetched fresh, today, with no check of any kind. This was found by RUNNING
 * it, not by reading it:
 *
 *     rehydrateReview([{ questionId: "q-ptp-009", … }])
 *       → explanation 542 chars, correct flags [false,true,false,false],
 *         four citations — and `q-ptp-009` is `needs-review`.
 *
 * What `/review` can do to a row that has already been sat
 * (`content-admin/logic.ts applyDecision`) is what makes it bite:
 *   reject → `status: "draft"`, and the candidate still reads the withdrawn
 *            row as teaching text;
 *   edit   → patches `options[].correct`, `explanationBg`, `lawRefs` AND
 *            re-approves, so the page shows the NEW KEY beside the OLD
 *            VERDICT: „you got this wrong" printed against an option now
 *            marked correct.
 *
 * It is NOT a leak and must not be inflated into one: `getExamReview` refuses
 * another user's attempt, and grading runs on the ids the SERVER dealt, so no
 * client can push an id into the `answers` column. The defect is TEACHING
 * INTEGRITY, and it is the sixth instance of one shape — the check is real but
 * made at a different moment from the read (rule П5: the gate belongs where the
 * content is READ, not where it was DEALT).
 *
 * THE CLOSURE, and why it is neither of the two expensive options. Freezing the
 * text in the row would put back the ~39 KB per attempt audit M-1 took out;
 * gating the review outright would cost a candidate the single highest-intent
 * teaching moment the product gets. So what is frozen is a FINGERPRINT — 16 hex
 * of the exact bytes the grader taught from, ~45 × 16 B ≈ 0.7 KB per attempt,
 * 1.8% of what the text would cost — and every row is then one of five states
 * (`ReviewIntegrity`). Four of them are visible to the student in plain
 * Bulgarian; none of them changes a single point.
 *
 * The clearance half is IMPORTED, not re-implemented: `questionClearance` comes
 * from `@/modules/lesson`, which is the same function the classroom, the tutor
 * and the micro-quiz obey. A second opinion about „may this be said" is exactly
 * how the previous five doors stayed open.
 */

import { getContentRepo } from "../../lib/content/repo";
import type { Question } from "../../lib/content/types";
import { questionClearance } from "@/modules/lesson";
import { teachingPin } from "./pin";
import type {
  ExamReviewQuestion,
  ExamReviewRow,
  ExamTopicResult,
  ReviewIntegrity,
} from "./types";

/**
 * One entry of the graded `ExamAttempt.answers` array as index.ts persists it.
 * `maxPoints` is written since 2026-07-25; rows graded before that fall back to
 * the question's current weight (see resolveMaxPoints).
 */
export interface GradedAnswerRecord {
  questionId: string;
  optionIds: string[];
  correct: boolean;
  /** Points AWARDED (question weight if correct, else 0). */
  points: number;
  /** Question weight at the time of grading (1 | 2 | 3). */
  maxPoints?: number;
  /**
   * `teachingPin` of the question AS GRADED (since 2026-08-09). Rows written
   * before that have none, which is not the same as „unchanged" and is not
   * reported as such — see `ReviewIntegrity.unpinned`.
   */
  contentPin?: string;
}

/** Parse the graded payload defensively — it is a JSON column, not a type. */
export function parseGradedAnswers(v: unknown): GradedAnswerRecord[] | null {
  if (!Array.isArray(v)) return null;
  const out: GradedAnswerRecord[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.questionId !== "string") return null;
    if (typeof o.correct !== "boolean") return null;
    if (typeof o.points !== "number") return null;
    if (
      !Array.isArray(o.optionIds) ||
      !o.optionIds.every((x) => typeof x === "string")
    ) {
      return null;
    }
    out.push({
      questionId: o.questionId,
      optionIds: o.optionIds as string[],
      correct: o.correct,
      points: o.points,
      maxPoints: typeof o.maxPoints === "number" ? o.maxPoints : undefined,
      contentPin: typeof o.contentPin === "string" ? o.contentPin : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Door 6: what was graded, and whether the bank still holds it
// ---------------------------------------------------------------------------

/**
 * The state of one graded row, decided at READ time. Order matters and is
 * argued: „gone" and „withdrawn" are facts about the bank today and outrank a
 * pin comparison that has nothing left to compare against; „unpinned" is asked
 * before „moved" because a missing pin cannot produce a mismatch, only an
 * unknown, and reporting an unknown as a change would be a lie in the safe
 * direction that still teaches the student to distrust the notice.
 */
export function reviewIntegrity(
  q: Question | undefined,
  contentPin: string | undefined,
): ReviewIntegrity {
  if (q === undefined) return "gone";
  if (!questionClearance(q).cleared) return "withdrawn";
  if (contentPin === undefined) return "unpinned";
  return contentPin === teachingPin(q) ? "verified" : "moved";
}

/**
 * What the student is told, in the classroom's own register: claim-free, and
 * never a substitute for the withheld content (`clearance.ts` — there is
 * nothing honest to substitute WITH). Empty for a row that is fine.
 */
const INTEGRITY_NOTICE_BG: Record<ReviewIntegrity, string> = {
  verified: "",
  unpinned:
    "Този изпит е от преди да започнем да отпечатваме съдържанието на всеки въпрос. " +
    "Показаното тук е ДНЕШНАТА версия — ако въпросът е бил редактиран междувременно, " +
    "не можем да го засечем. Точките ти са тези от изпита и не се променят.",
  moved:
    "Този въпрос беше редактиран, след като ти го реши. Затова не показваме нито " +
    "текста, който си видял (него вече го няма), нито новия — новият отговор до " +
    "старата ти оценка би те подвел. Точките ти по този въпрос остават същите.",
  withdrawn:
    "Този въпрос е върнат на преподавател за проверка след твоя изпит. Докато тя " +
    "приключи, не ти показваме обяснението и верния отговор — предпочитаме да ти " +
    "кажа „не знам сигурно“, отколкото да те науча на грешното. Точките ти по него " +
    "остават същите.",
  gone: "Този въпрос вече не е наличен в учебното съдържание.",
};

/** Does this state let the bank's text through to the screen? */
function speaks(integrity: ReviewIntegrity): boolean {
  return integrity === "verified" || integrity === "unpinned";
}

/**
 * ONE graded row → one review row. THE ONLY PLACE the bank's text is allowed
 * onto a review screen, and therefore the only place the check has to be
 * written: `/exams/[id]` (rehydrateReview, below) and the post-submit screen
 * (`exams/actions.ts buildReview`) both come through here. They used to be two
 * near-identical maps, which is how one of them could have been fixed and the
 * other left open — the shape of doors 1 and 3b.
 */
export function buildReviewRow(rec: {
  questionId: string;
  optionIds: readonly string[];
  correct: boolean;
  points: number;
  maxPoints: number;
  contentPin?: string;
}): ExamReviewRow {
  const q = getContentRepo().questionById(rec.questionId);
  const integrity = reviewIntegrity(q, rec.contentPin);
  const chosen = new Set(rec.optionIds);

  // The verdict is IDENTICAL in every state. Nothing here re-grades, re-scores
  // or hides a point: what a withheld row loses is the teaching half.
  const verdict = {
    questionId: rec.questionId,
    answered: chosen.size > 0,
    correct: rec.correct,
    pointsAwarded: rec.points,
    maxPoints: rec.maxPoints,
    integrity,
    noticeBg: INTEGRITY_NOTICE_BG[integrity],
  };

  if (q === undefined || !speaks(integrity)) {
    return {
      ...verdict,
      // Degrade to the verdict plus the reason — never invent a question, and
      // never print today's key against a verdict earned on other bytes. The
      // reason lives in `noticeBg`; the heading says only that there is one.
      textBg:
        integrity === "gone"
          ? INTEGRITY_NOTICE_BG.gone
          : "Този въпрос не се показва в прегледа.",
      type: "single",
      options: [],
      explanationBg: "",
      lawRefs: [],
    };
  }

  return {
    ...verdict,
    questionId: q.id,
    textBg: q.textBg,
    type: q.type,
    options: q.options.map((o) => ({
      id: o.id,
      textBg: o.textBg,
      correct: o.correct,
      chosen: chosen.has(o.id),
    })),
    explanationBg: q.explanationBg,
    lawRefs: q.lawRefs.map((l) => ({ act: l.act, ref: l.ref })),
  };
}

/**
 * Turn the stored grade into the full review + the per-topic breakdown.
 *
 * Question order is the stored order, which is the order the candidate sat —
 * "Въпрос 12" in the review is the twelfth question they answered.
 */
export function rehydrateReview(records: readonly GradedAnswerRecord[]): {
  questions: ExamReviewQuestion[];
  byTopic: ExamTopicResult[];
} {
  const repo = getContentRepo();
  const topicById = new Map(repo.topics().map((t) => [t.id, t]));

  const questions: ExamReviewQuestion[] = [];
  const perTopic = new Map<string, ExamTopicResult>();

  for (const rec of records) {
    const q = repo.questionById(rec.questionId);
    const topic = q === undefined ? undefined : topicById.get(primaryTopicId(q) ?? "");
    const maxPoints = resolveMaxPoints(rec, q);

    // The topic breakdown is UNAFFECTED by withholding, on purpose: „practise
    // Приоритет next" is a fact about the candidate's answers, not about
    // whether a row is currently readable, and taking the row out of the count
    // would quietly change the score they see per topic.
    questions.push({
      ...buildReviewRow({ ...rec, maxPoints }),
      topicSlug: topic?.slug ?? null,
      topicTitleBg: topic?.titleBg ?? null,
    });

    // A question whose topic can no longer be resolved is left out of the
    // breakdown rather than bucketed under a fake topic: the breakdown's only
    // job is to send the student somewhere, and there is nowhere to send them.
    if (topic === undefined) continue;
    const row = perTopic.get(topic.id) ?? {
      topicId: topic.id,
      slug: topic.slug,
      titleBg: topic.titleBg,
      questions: 0,
      correct: 0,
      points: 0,
      maxPoints: 0,
    };
    row.questions += 1;
    if (rec.correct) row.correct += 1;
    row.points += rec.points;
    row.maxPoints += maxPoints;
    perTopic.set(topic.id, row);
  }

  // Curriculum order (topics.json `order`) — the same order the theory hub and
  // every other topic list uses, so a student reads one mental map, not two.
  const order = new Map([...topicById.values()].map((t) => [t.id, t.order]));
  const byTopic = [...perTopic.values()].sort(
    (a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0),
  );

  return { questions, byTopic };
}

/** Primary topic of a question — the builder's rule (first resolvable concept). */
function primaryTopicId(q: Question): string | undefined {
  const repo = getContentRepo();
  return q.conceptIds.map((id) => repo.conceptById(id)).find((c) => c !== undefined)
    ?.topicId;
}

/**
 * The weight this question was graded at. Prefer what was persisted: a weight
 * edited after the exam must not retroactively change how many points the
 * candidate "could have" scored. Older rows have no stored weight, so fall back
 * to the bank, then to the awarded points (correct answers at least self-report).
 */
function resolveMaxPoints(rec: GradedAnswerRecord, q: Question | undefined): number {
  if (rec.maxPoints !== undefined) return rec.maxPoints;
  if (q !== undefined) return q.points;
  return rec.points;
}
