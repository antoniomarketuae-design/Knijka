/**
 * DOOR 4 — THE IN-DRIVE QUIZ HAD NEITHER A TICKET NOR A STATUS FILTER.
 *
 * Two independent defects on one surface, each of which was invisible because
 * its neighbour looked covered:
 *
 *   THE DEAL had no status check. `loadMicroQuizBank` walked
 *   `questionsByConcept` and took what it found. Measured over every quizzable
 *   lesson on 2026-08-04: 98 distinct rows dealt, 23 of them `needs-review` —
 *   shown to a student mid-drive, with their unreviewed explanations, on a
 *   screen that PAUSES the car so the card can be read.
 *
 *   THE SUBMIT half did not bind the question to a deal. `submitAnswer` called
 *   `assertPracticeTicket` only for `context === "practice"`; for `"micro"` it
 *   validated the id's type and length and then answered with
 *   `correctOptionIds`, `explanationBg` and `lawRefs`. Verified by running it
 *   against the real bank: `q-ptp-009` (`needs-review`, hit-and-run, cites
 *   НК чл. 140) came back keyed, explained and cited to a user who had never
 *   been dealt it, with no ticket at all — and the answer WROTE a
 *   QuestionAttempt and moved mastery 0 → 0.35 on `c-hit-and-run`, i.e. the
 *   readiness score was client-writable through this door.
 *
 * This is audit M-10's answer-key oracle, one door along. M-10 was written up
 * as a practice defect; practice was fixed by wiring `issuePracticeTicket`; the
 * neighbour returning the identical payload kept the old shape, and the
 * comment on `SubmitAnswerOptions.ticket` said micro was safe because "the sim
 * picks those, not the client" — which is not how the micro-quiz works.
 *
 * The file therefore pins FOUR things, because closing three of them still
 * leaves a door:
 *   1. every row the deal can offer is `approved` (the real content bank);
 *   2. the deal actually ISSUES the ticket and the submit half PASSES it — the
 *      M-10 trap was a mechanism that existed, was exported and was tested,
 *      and was simply never wired, so behaviour tests alone would have passed;
 *   3. the drive shell carries the ticket back;
 *   4. the grader refuses a first-aid id through micro, over the real bank.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import { FakeLearningStore } from "@/modules/learning/fixtures";
import { issuePracticeTicket, resetPracticeTicketWarning } from "@/modules/learning/practiceTicket";
import { setLearningStore } from "@/modules/learning/store";
import { submitAnswer } from "@/modules/learning/submit";
import type { LessonSpec } from "@/modules/sim/contracts";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "@/modules/sim/lessons/specs";
import {
  isQuizMediaRenderable,
  QUIZ_TARGET_CONCEPT_IDS,
} from "@/modules/sim/lessons/quiz-trigger";

const SRC = resolve(__dirname, "../../..");
const read = (p: string): string => readFileSync(resolve(SRC, p), "utf8");
const ACTIONS = read("app/(dashboard)/simulator/micro-quiz-actions.ts");
const SHELL = read("components/sim/lesson-ui/LessonPlayShell.tsx");

/** A numeric `const NAME = n;` out of the server action — see buildBank. */
function actionConst(name: string): number {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(ACTIONS);
  if (m === null) throw new Error(`micro-quiz-actions.ts declares no ${name}`);
  return Number(m[1]);
}

/** The lessons that can actually pop a quiz (A13 exam / THEO-3 sandbox never do). */
const QUIZZABLE_LESSONS: readonly LessonSpec[] = [
  ...LESSONS,
  ...POLIGON_LESSONS,
  EXAM_LESSON,
].filter((l) => l.examMode !== true && l.mistakeExperience === undefined);

/**
 * `loadMicroQuizBank`'s SELECTION, replayed over the real content repo — a
 * replay rather than a call because the action is a `"use server"` module
 * behind getSessionUser + the simulator entitlement. Its constants are read out
 * of the action's own source so the replay cannot silently drift.
 */
function buildBank(lesson: LessonSpec): Question[] {
  const maxPerConcept = actionConst("MAX_PER_CONCEPT");
  const maxBank = actionConst("MAX_BANK");
  const repo = getContentRepo();
  const conceptIds = [...new Set([...lesson.conceptIds, ...QUIZ_TARGET_CONCEPT_IDS])];
  const bank: Question[] = [];
  const seen = new Set<string>();
  for (const conceptId of conceptIds) {
    let taken = 0;
    for (const q of repo.questionsByConcept(conceptId)) {
      if (bank.length >= maxBank) break;
      if (taken >= maxPerConcept) break;
      if (seen.has(q.id)) continue;
      if (q.status !== "approved") continue; // the gate under test
      if (!isQuizMediaRenderable(q)) continue;
      seen.add(q.id);
      taken += 1;
      bank.push(q);
    }
    if (bank.length >= maxBank) break;
  }
  return bank;
}

function servableQuestions(): Question[] {
  const byId = new Map<string, Question>();
  for (const lesson of QUIZZABLE_LESSONS) {
    for (const q of buildBank(lesson)) byId.set(q.id, q);
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// 1 — the deal
// ---------------------------------------------------------------------------

describe("the in-drive quiz never DEALS an unsigned row", () => {
  it("offers something at all (otherwise everything below passes vacuously)", () => {
    expect(servableQuestions().length).toBeGreaterThan(20);
  });

  it("every question any quizzable lesson can offer is approved", () => {
    const unsigned = servableQuestions()
      .filter((q) => q.status !== "approved")
      .map((q) => `${q.id} [${q.status}]`);
    expect(unsigned).toEqual([]);
  });

  it("no first-aid row is reachable through the deal", () => {
    // Not because first aid is special-cased anywhere — it is not — but because
    // the 29 rows regrounded on ERC 2025 / RCUK 2025 are the concrete harm this
    // sweep is about, and several of their answers were REVERSED. If a future
    // edit re-opens the deal, this is the assertion whose failure is legible.
    const ptp = servableQuestions().filter((q) => q.conceptIds.some((c) => c.startsWith("c-first-aid")) || q.id.startsWith("q-ptp-"));
    for (const q of ptp) expect(q.status, q.id).toBe("approved");
  });

  it("the ACTION's own source carries the status gate", () => {
    // The replay above models the action; this is the thread tying it to the
    // real thing. Without it the replay could stay green over an action that
    // dropped the check.
    expect(ACTIONS).toMatch(/if \(q\.status !== "approved"\) continue;/);
  });
});

// ---------------------------------------------------------------------------
// 2 — the wiring (the M-10 trap: built, exported, tested, never wired)
// ---------------------------------------------------------------------------

describe("the deal issues a ticket and the submit half spends it", () => {
  it("loadMicroQuizBank signs exactly the ids it dealt, for this user", () => {
    expect(ACTIONS).toMatch(/issuePracticeTicket\(\s*user\.id,\s*bank\.map\(/);
  });

  it("submitMicroQuizAnswer takes a ticket and hands it to the learning module", () => {
    expect(ACTIONS).toMatch(/ticket: string,\s*\)/);
    expect(ACTIONS).toMatch(/\{ ticket \}/);
  });

  it("an empty bank grants no capability", () => {
    expect(ACTIONS).toMatch(/bank\.length === 0 \? "" :/);
  });

  it("the drive shell carries the ticket back on submit", () => {
    expect(SHELL).toMatch(/quizTicketRef\.current = ticket/);
    expect(SHELL).toMatch(
      /submitMicroQuizAnswer\(questionId, selectedOptionIds, quizTicketRef\.current\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3 — the grader, over the REAL bank
// ---------------------------------------------------------------------------

describe("the grader refuses what the drive was never dealt", () => {
  let store: FakeLearningStore;

  beforeEach(() => {
    store = new FakeLearningStore();
    setLearningStore(store);
    resetPracticeTicketWarning();
    vi.stubEnv("AUTH_SECRET", "test-secret-for-micro-quiz-tickets");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const firstAid = (): Question => {
    const q = getContentRepo()
      .questions()
      .find((x) => x.id.startsWith("q-ptp-") && x.status !== "approved");
    if (q === undefined) throw new Error("no unsigned first-aid row in the bank");
    return q;
  };

  it("refuses an unsigned first-aid id posted through micro — no ticket", async () => {
    const victim = firstAid();
    await expect(
      submitAnswer("attacker", victim.id, [victim.options[0].id], "micro", new Date()),
    ).rejects.toThrow(/not approved/i);
    expect(store.recordAnswerCalls).toEqual([]);
  });

  it("refuses it even with a ticket forged around it", async () => {
    // The status gate is not the ticket gate. A student who somehow held a
    // ticket covering this id still gets nothing: content clearance is checked
    // on its own, and it does not care what the session says.
    const victim = firstAid();
    const ticket = issuePracticeTicket("attacker", [victim.id]);
    await expect(
      submitAnswer("attacker", victim.id, [victim.options[0].id], "micro", new Date(), {
        ticket,
      }),
    ).rejects.toThrow(/not approved/i);
    expect(store.recordAnswerCalls).toEqual([]);
  });

  it("refuses an APPROVED question the drive was not dealt", async () => {
    vi.stubEnv("PRACTICE_TICKET_REQUIRED", "1");
    const dealt = servableQuestions()[0];
    const stranger = getContentRepo()
      .questions()
      .find((q) => q.status === "approved" && q.id !== dealt.id)!;

    const ticket = issuePracticeTicket("driver", [dealt.id]);
    await expect(
      submitAnswer("driver", stranger.id, [stranger.options[0].id], "micro", new Date(), {
        ticket,
      }),
    ).rejects.toMatchObject({ reason: "QUESTION_NOT_IN_SESSION" });
    expect(store.recordAnswerCalls).toEqual([]);
  });

  it("still grades — and still explains — a question the drive WAS dealt", async () => {
    // THEO-4: the point of closing this door is not to make the quiz silent.
    // A legitimately dealt question must come back with its explanation and its
    // citation, exactly as before.
    vi.stubEnv("PRACTICE_TICKET_REQUIRED", "1");
    const dealt = servableQuestions()[0];
    const ticket = issuePracticeTicket("driver", [dealt.id]);
    const correct = dealt.options.filter((o) => o.correct).map((o) => o.id);

    const result = await submitAnswer("driver", dealt.id, correct, "micro", new Date(), {
      ticket,
    });
    expect(result.correct).toBe(true);
    expect(result.explanationBg.length).toBeGreaterThan(0);
    expect(result.lawRefs.length).toBeGreaterThan(0);
    expect(store.recordAnswerCalls).toHaveLength(1);
  });

  it("a refused submission writes NOTHING — no attempt, no mastery", async () => {
    // The half that matters beyond cheating: a QuestionAttempt and a Progress
    // row are what the readiness score is computed from (readiness.ts). Before
    // this fix a forged micro id moved them; measured, mastery 0 → 0.35.
    vi.stubEnv("PRACTICE_TICKET_REQUIRED", "1");
    const victim = firstAid();
    await expect(
      submitAnswer("attacker", victim.id, [victim.options[0].id], "micro", new Date()),
    ).rejects.toThrow();
    expect(store.recordAnswerCalls).toEqual([]);
    expect(store.getProgressRow("attacker", victim.conceptIds[0])).toBeUndefined();
  });
});
