"use server";

/**
 * Server action for the simulator: persist a finished lesson session.
 *
 * Trust model: the client sends only compact event REFERENCES; the lessons
 * module rebuilds canonical events from the violation catalog and recomputes
 * the official summary + verdict server-side (client scores are never
 * trusted), then this action regenerates the debrief and writes the
 * SimSession row via the injectable store. Business logic stays in
 * @/modules/sim/lessons — this file only adapts it to the wire, exactly like
 * the exams/theory actions do.
 */

import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import { buildDebrief, gradeFinishWire } from "@/modules/sim/lessons";
import {
  getSimSessionStore,
  type SimSessionEventsJson,
} from "@/modules/sim/lessons/store";
import type { FinishLessonActionResult } from "@/components/sim/lesson-ui/types";

export async function finishLessonAction(
  input: unknown,
): Promise<FinishLessonActionResult> {
  const user = await requireUser();

  const graded = gradeFinishWire(input);
  if (graded.status === "invalid") return { ok: false, code: "INVALID_INPUT" };
  if (graded.status === "unknown-lesson") return { ok: false, code: "UNKNOWN_LESSON" };

  const { lesson, wire, events, result } = graded;
  const debrief = buildDebrief(lesson, result);

  const payload: SimSessionEventsJson = {
    version: 1,
    passed: result.passed,
    aborted: result.aborted,
    terminated: result.summary.terminated,
    completedAll: result.completedAll,
    ruleEvents: events,
    objectives: result.objectives,
  };

  let sessionId: string;
  try {
    const saved = await getSimSessionStore().saveSession(user.id, {
      lessonId: lesson.id,
      startedAt: new Date(wire.startedAtMs),
      finishedAt: new Date(wire.finishedAtMs),
      score: result.score,
      events: payload,
      debrief: debrief.text,
    });
    sessionId = saved.id;
  } catch (err) {
    console.warn("simulator: saveSession failed", err);
    return { ok: false, code: "SAVE_FAILED" };
  }

  // -------------------------------------------------------------------------
  // INTEGRATION ASK (gamification): once GamificationEvent accepts
  //   { type: "sim_lesson", passed: boolean, score: number }
  // (see SimLessonGamificationEvent in @/modules/sim/lessons), award XP here:
  //   await trackActivity(user.id, { type: "sim_lesson", passed: result.passed, score: result.score });
  // and return the awarded XP as `xpEarned`. The union is currently CLOSED
  // (practice_answer | exam_completed), so sim lessons award no XP yet and
  // the session-end screen hides its XP chip.
  // -------------------------------------------------------------------------

  return {
    ok: true,
    sessionId,
    debriefText: debrief.text,
    concepts: enrichConcepts(debrief.conceptIds),
    xpEarned: null,
  };
}

// ---------------------------------------------------------------------------
// helpers (not exported — "use server" files may only export async functions)
// ---------------------------------------------------------------------------

/** Map mistake concept ids → titled theory links (content repo, server-only). */
function enrichConcepts(
  conceptIds: string[],
): Array<{ id: string; titleBg: string; href: string }> {
  try {
    const repo = getContentRepo();
    const topicSlugById = new Map(repo.topics().map((t) => [t.id, t.slug]));
    return conceptIds.flatMap((id) => {
      const concept = repo.conceptById(id);
      if (!concept) return [];
      const slug = topicSlugById.get(concept.topicId);
      return [
        {
          id,
          titleBg: concept.titleBg,
          href: slug ? `/theory/practice?topic=${slug}` : "/theory",
        },
      ];
    });
  } catch {
    // Content repo unavailable — degrade to no links, never fail the save.
    return [];
  }
}
