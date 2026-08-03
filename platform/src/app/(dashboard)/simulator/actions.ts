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
 *
 * A14 learner-model integration: AFTER the session persisted, this action —
 * the server path, so concept ids/severities always come from the rebuilt
 * catalog events, never from client claims —
 *  1. feeds concept-linked violations/commendations into the learning module
 *    (recordSimObservations: mastery dip + SM-2 review scheduling), and
 *  2. reports a sim_lesson event to gamification for XP (recordActivity,
 *     not trackActivity, because the awarded XP must reach the session-end
 *     screen's XP chip).
 * Both are swallow-on-failure: a learner-model bug never breaks the save.
 */

import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { getSessionUser } from "@/modules/auth";
import { recordActivity } from "@/modules/gamification";
import { recordSimObservations, type SimObservation } from "@/modules/learning";
import {
  buildDebrief,
  gradeFinishWire,
  isScenarioLevelUnlocked,
  parseScenarioLessonId,
  scenarioById,
  scoreRubric,
  type RubricScore,
} from "@/modules/sim/lessons";
import {
  getSimSessionStore,
  type SimSessionEventsJson,
  type SimSessionListRow,
} from "@/modules/sim/lessons/store";
// Deep import, like lessons/store above: the attempt-trace store is server-only
// (node:zlib + Prisma) and is deliberately off the sim/traces barrel, which
// rides the theory bundle (audit M-26).
import { getAttemptTraceStore } from "@/modules/sim/traces/attemptStore";
import type { FinishLessonActionResult } from "@/components/sim/lesson-ui/types";
import { canDriveSimulator } from "./access";

export async function finishLessonAction(
  input: unknown,
): Promise<FinishLessonActionResult> {
  // getSessionUser + a RESULT CODE rather than requireUser(), for the reason
  // loadMicroQuizBank states at length: requireUser() calls redirect(), and Next
  // turns a redirect thrown inside a server action into a 303 that the ROUTER
  // FOLLOWS. This action fires whenever a session ENDS — including an early
  // abort or a failed drill twelve seconds in — so on an anonymous or expired
  // session the student did not get "your drive was not saved", the whole drive
  // screen was replaced by /login, mid-session, with no error anywhere. Four of
  // five signal lessons bounced this way and three review waves reported it as
  // environmental.
  //
  // It is also the worse bug for a real student than for a harness: a drive
  // that ends after a session quietly expired lost the RESULT SCREEN — the
  // debrief, the law citations, the whole teaching payload — to a login page.
  // Returning a code keeps the result on screen (the shell renders it locally
  // and says so); only the persistence is lost, which is all that actually
  // failed. The auth requirement itself is unchanged: nothing is written, no
  // learner-model or XP call is reached, for a caller with no session.
  const user = await getSessionUser();
  if (user === null) return { ok: false, code: "NOT_SIGNED_IN" };

  // C-3 entitlement gate. The page already refuses unentitled accounts, but a
  // server action is a public POST endpoint: without this check a free account
  // could still write SimSessions, feed the learner model and farm sim XP with
  // a hand-crafted request. Same decision function as the page, so the two can
  // never drift apart. Thrown rather than returned as a code — no legitimate
  // client can reach this line (the play shell only mounts behind the gated
  // page), so it is an abuse signal, not a UI state, exactly like the invalid
  // payloads askTutorAction throws on.
  if (!(await canDriveSimulator(user))) {
    throw new Error("finishLessonAction: no simulator entitlement");
  }

  const graded = gradeFinishWire(input);
  if (graded.status === "invalid") return { ok: false, code: "INVALID_INPUT" };
  if (graded.status === "unknown-lesson") return { ok: false, code: "UNKNOWN_LESSON" };

  const { lesson, wire, events, result } = graded;

  // Debrief context (server-only facts the pure engine doesn't own):
  //  - priorBestScore: the driver's fewest penalty points on THIS lesson so
  //    far. listSessions runs BEFORE saveSession below, so it excludes this
  //    attempt → the debrief can coach improvement vs the driver's own best,
  //    and a pass now is a FIRST pass iff no prior attempt passed.
  //  - conceptTitles: names the "practice this next" focus concept.
  //  - microQuiz: the contextual-quiz tally the client tracked (validated wire).
  let priorBestScore: number | null = null;
  let previouslyPassed = false;
  let historyRows: SimSessionListRow[] = [];
  try {
    historyRows = await getSimSessionStore().listSessions(user.id);
    const mine = historyRows.filter((r) => r.lessonId === lesson.id);
    const scores = mine
      .filter((r) => r.score !== null)
      .map((r) => r.score as number);
    if (scores.length > 0) priorBestScore = Math.min(...scores);
    previouslyPassed = mine.some((r) => r.passed);
  } catch {
    // No history available — improvement coaching is simply skipped (and the
    // first-pass XP bonus errs toward awarding; the achievement-style loss of
    // a one-time bonus is worse than a rare double award).
  }

  // ---------------------------------------------------------------------------
  // S1 scenario sessions (<templateId>@L<n>) — two server-side extras:
  //  1. the SOFT LEVEL GATE (doc 76 §8): L2+ persists only when the previous
  //     level already has a ≥2★ session in THIS user's history (the same pure
  //     fold the /simulator level picker runs — client and server agree);
  //  2. the RUBRIC (doc 76 §6): stars recomputed here from the server-graded
  //     result + validated wire measurement channels, persisted as
  //     events.rubricStars (drives the catalog best + future unlocks). The
  //     official score/verdict above never read any of this.
  // ---------------------------------------------------------------------------
  const scenarioRef = parseScenarioLessonId(lesson.id);
  const scenarioSpec = scenarioRef !== null ? scenarioById(scenarioRef.templateId) : undefined;
  let scenarioRubric: RubricScore | null = null;
  if (scenarioRef !== null && scenarioSpec !== undefined) {
    if (
      !isScenarioLevelUnlocked(
        scenarioSpec,
        scenarioRef.level,
        historyRows.map((r) => ({ lessonId: r.lessonId, rubricStars: r.rubricStars })),
        // Admin bypass — flag from the SERVER session (requireUser), never
        // from the wire: an admin session may persist any authored level.
        { unlockAll: user.isAdmin },
      )
    ) {
      return { ok: false, code: "LEVEL_LOCKED" };
    }
    if (scenarioSpec.rubric !== undefined) {
      scenarioRubric = scoreRubric(
        result,
        scenarioSpec.rubric,
        wire.observedMomentIds !== undefined
          ? { observedMomentIds: wire.observedMomentIds }
          : undefined,
      );
    }
  }

  const conceptTitles: Record<string, string> = {};
  try {
    const repo = getContentRepo();
    for (const id of result.summary.conceptIds) {
      const concept = repo.conceptById(id);
      if (concept) conceptTitles[id] = concept.titleBg;
    }
  } catch {
    // Content repo unavailable — the debrief falls back to a generic pointer.
  }

  const debrief = buildDebrief(lesson, result, {
    microQuiz: wire.microQuiz,
    priorBestScore,
    conceptTitles,
  });

  const payload: SimSessionEventsJson = {
    version: 1,
    passed: result.passed,
    aborted: result.aborted,
    terminated: result.summary.terminated,
    completedAll: result.completedAll,
    ruleEvents: events,
    objectives: result.objectives,
    // A15 (all display metadata — the graded truth stays above):
    //  - effectiveScore: A9 training-layer total, so history can show
    //    „официален vs тренировъчен“;
    //  - eventPositions: validated wire positions keyed back to events by
    //    (kind, code, t) — future replay / stored mistake maps;
    //  - nearMisses: the A11 session stat.
    effectiveScore: result.effectiveScore,
    eventPositions: wire.ruleEvents.flatMap((e) =>
      e.x !== undefined && e.y !== undefined
        ? [{ kind: e.kind, code: e.code, t: e.t, x: e.x, y: e.y }]
        : [],
    ),
    nearMisses: (wire.nearMisses ?? []).map((n) => ({
      tSec: n.tSec,
      kind: n.kind,
      clearanceM: n.clearanceM,
      relSpeedMps: n.relSpeedMps,
      x: n.x ?? null,
      y: n.y ?? null,
    })),
    // A13: exam-mode marker + server-derived termination record. Both come
    // from the SPEC and the rebuilt catalog events (gradeFinishWire) — the
    // client never sends an exam flag, so it cannot claim one. Stored so
    // A14's paths can weight exam evidence later (no A14 change here; the
    // gamification event below already carries lessonId).
    ...(lesson.examMode === true ? { examMode: true } : {}),
    ...(result.examTermination !== undefined
      ? { examTermination: result.examTermination }
      : {}),
    // S1: scenario rubric stars (server-computed above; display + unlock).
    ...(scenarioRubric !== null ? { rubricStars: scenarioRubric.stars } : {}),
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
  // I-2 „Твоят дубъл" — persist the student's OWN recorded drive beside the
  // session it belongs to. Until this existed the 20 Hz recording died with
  // the browser tab: only the handful of glance-derived rubric moment ids
  // survived, so the reel renderer (which happily accepts any ScenarioTrace)
  // had nothing of the student's to film.
  //
  // Written AFTER the session row, because the trace is keyed on it, and
  // swallowed on failure for the same reason the learner-model fold below is:
  // a display artifact must never cost a graded session its save. Retention
  // and compression live in the store — this layer only decides WHETHER.
  // -------------------------------------------------------------------------
  if (wire.attemptTrace !== undefined) {
    try {
      await getAttemptTraceStore().save(user.id, {
        simSessionId: sessionId,
        lessonId: lesson.id,
        trace: wire.attemptTrace,
      });
    } catch (err) {
      console.warn("simulator: attempt-trace save failed (session saved)", err);
    }
  }

  // -------------------------------------------------------------------------
  // A14 §2 — sim events feed the learner model. Only server-rebuilt catalog
  // events are used (conceptId + severityClass always come from the catalog),
  // in chronological order so same-concept evidence compounds honestly.
  // Aborted sessions still count: the mistakes made before quitting are real
  // evidence. Failure is logged and swallowed — the session is already saved.
  // -------------------------------------------------------------------------
  try {
    const chronological = [
      ...result.summary.mistakes,
      ...result.summary.commendations,
    ].sort((a, b) => a.t - b.t);
    const observations: SimObservation[] = [];
    for (const e of chronological) {
      if (e.conceptId === undefined) continue;
      observations.push(
        e.kind === "violation"
          ? { conceptId: e.conceptId, kind: "violation", severity: e.severityClass }
          : { conceptId: e.conceptId, kind: "commendation" },
      );
    }
    await recordSimObservations(user.id, observations);
  } catch (err) {
    console.warn("simulator: recordSimObservations failed (session saved)", err);
  }

  // -------------------------------------------------------------------------
  // A14 §1 — XP for the drive. No XP for aborted sessions (quitting is not a
  // completed learning activity, and instant-abort must not farm the base
  // award). recordActivity instead of trackActivity so the awarded XP reaches
  // the session-end screen; failures degrade to the pre-A14 null chip.
  // -------------------------------------------------------------------------
  let xpEarned: number | null = null;
  if (!result.aborted) {
    try {
      const cleanDrives = events.filter(
        (e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING",
      ).length;
      const awarded = await recordActivity(user.id, {
        type: "sim_lesson",
        passed: result.passed,
        score: result.score,
        lessonId: lesson.id,
        firstPass: result.passed && !previouslyPassed,
        cleanDrives,
      });
      xpEarned = awarded.xpAwarded;
    } catch (err) {
      console.warn("simulator: gamification failed (session saved)", err);
    }
  }

  return {
    ok: true,
    sessionId,
    debriefText: debrief.text,
    concepts: enrichConcepts(debrief.conceptIds),
    xpEarned,
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
