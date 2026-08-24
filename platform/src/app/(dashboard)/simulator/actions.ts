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
import { consumeUserRateLimit, RATE_LIMITS } from "@/modules/security";
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

// ---------------------------------------------------------------------------
// THE POOL-ACQUIRE TIMEOUT — the one failure on this path that is worth another
// try, and the only one that is PROVABLY safe to retry.
//
// WHAT WAS OBSERVED. Three of sweep 161's ~700 finishes were refused. One was
// an abort (sc-sig-green-wave/mobile-right); the other two were CLEAN PASSES —
// sc-vp-telltale-red and sc-follow-standstill, mobile · right, 08-debrief.png.
// Both frames show „0 наказателни точки · ИЗДЪРЖАН" and, across the foot of the
// same screen, „Сесията не се записа (SAVE_FAILED)". The grade was right, the
// debrief was right, and the row was gone — and a finished drive cannot be
// re-submitted: the result exists only in that browser tab, and the end screen
// offers „Повтори" (drive it again), not „save it again".
//
// WHAT IT IS ATTRIBUTED TO, and how firmly. No server log from the sweep
// survives, so the exact throw is not on record; what IS on record is that the
// run was ~78 lanes against one staging box, that the failures are scattered
// and unreproducible, and that `lib/db.ts` gives the pg pool `max: 20` with
// `connectionTimeoutMillis: 5000` — which converts pool saturation into a
// rejected query after 5 s. That note defends the choice with „A student who is
// shown a failure can retry". True of a PAGE, which has a retry button. Never
// true here. Whatever the trigger was, the property that turned it into
// permanent loss is the one fixed below: a single attempt at the one row in the
// product that cannot be rebuilt afterwards.
//
// WHY IT IS SAFE TO RETRY, which is the whole argument. pg-pool raises this by
// draining the PENDING QUEUE (`pg-pool/index.js:224`): the waiter is removed
// from `_pendingQueue` and rejected without ever being handed a client, so no
// statement was sent and nothing can have been committed. A retry cannot write
// a second SimSession. Every OTHER error is left alone for exactly that
// reason — a statement that may have reached Postgres must never be replayed
// against a `create()` with no idempotency key.
//
// WHY A STRING AND NOT A PRISMA CODE. Under the driver adapter there is no
// Rust pool, so this is not `P2024`. It is a bare `Error` from pg-pool with no
// `code` and no `severity`, and `@prisma/adapter-pg`'s `convertDriverError`
// rethrows exactly such errors untouched (`adapter-pg/dist/index.js:436-453`).
// The message is the only marker there is, and it is a safe one: a grep of the
// whole dependency tree finds it in exactly two files — `pg-pool/index.js` and
// the copy of the same code bundled into `@prisma/query-plan-executor` — both
// of them this one pending-queue drain, nothing else.
// ---------------------------------------------------------------------------

/** pg-pool's wording, verbatim (`pg-pool/index.js:224`). */
const POOL_ACQUIRE_TIMEOUT = "timeout exceeded when trying to connect";

/**
 * Backoff ladders, in ms. Every attempt already costs up to
 * POOL_ACQUIRE_TIMEOUT_MS (5 s in lib/db.ts) before it rejects, so these only
 * add breathing room for a slot to come free — the wait is dominated by the
 * timeout itself, not by these numbers.
 *
 * Budgets differ because the stakes do:
 *  - WRITE: two extra attempts, worst case ≈ 5 + 0.2 + 5 + 0.6 + 5 = 15.8 s.
 *    Long, but the end screen is already painted (the shell renders its own
 *    debrief while the save is in flight) and the calibration card that waits
 *    on the save carries its own skip. Fifteen seconds of a spinner against a
 *    passed lesson deleted for good is not a close call.
 *  - READS: one extra attempt (≈ 10.2 s worst case each). They are cheaper to
 *    lose but not free — see the two call sites.
 */
const SAVE_RETRY_BACKOFF_MS = [200, 600] as const;
const READ_RETRY_BACKOFF_MS = [200] as const;

/** Walk `cause` a little way: Prisma rethrows this one raw, but a future
 *  wrapper would nest it rather than change the sentence. */
function isPoolAcquireTimeout(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e !== null && e !== undefined && depth < 4; depth++) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && message.includes(POOL_ACQUIRE_TIMEOUT)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Run `op`, retrying ONLY the pool-acquire timeout, at most `backoffMs.length`
 * extra times. Anything else propagates on the first throw, unchanged.
 */
async function retryOnPoolAcquireTimeout<T>(
  label: string,
  backoffMs: readonly number[],
  op: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt >= backoffMs.length || !isPoolAcquireTimeout(err)) throw err;
      console.warn(
        `simulator: ${label} — pool-acquire timeout, retry ${attempt + 1}/${backoffMs.length}`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }
  }
}

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
  //
  // The gate READS the DB, so it shares the write's failure mode — and worse:
  // a pool-acquire timeout here throws, the whole action rejects, and
  // LessonPlayShell turns ANY rejection of this action into the same
  // „Сесията не се записа (SAVE_FAILED)" banner (LessonPlayShell.tsx:2414). So
  // a paid-up student's passed drive is deleted AND mislabelled as a refused
  // write, which is the false sentence doc 91 S4 spent a whole code on
  // preventing. Retried, never relaxed: a clean `false` still throws on the
  // first answer, and a non-timeout error still propagates on the first throw.
  if (
    !(await retryOnPoolAcquireTimeout("entitlement", READ_RETRY_BACKOFF_MS, () =>
      canDriveSimulator(user),
    ))
  ) {
    throw new Error("finishLessonAction: no simulator entitlement");
  }

  // Per-USER budget (audit: unmetered public POST). One call writes a
  // SimSession, a ~15 KB attempt trace, the learner-model fold and an XP award
  // — the heaviest write path in the product — and a server action never
  // reaches the proxy where the other budgets are taken. Keyed on the session
  // id rather than the IP: a driving school's classroom is one address.
  //
  // Returned as a CODE, not thrown, for the same reason NOT_SIGNED_IN is: this
  // action fires whenever a drive ends, and a throw here would replace the
  // student's result screen — debrief, citations, the whole teaching payload —
  // with an error. Only the persistence is refused.
  //
  // ITS OWN CODE, NOT `SAVE_FAILED` (doc 91 S4). Sharing the failure code cost
  // the student a true sentence: SAVE_FAILED is „we tried to write it and the
  // database refused" — outside their control, unfixable by them, and worth
  // reporting. This is „we did not try, because you have saved twenty drives in
  // ten minutes" — self-clearing, and the SAME drive saves normally after a
  // wait. Told the wrong one, the natural response is to drive it again at once,
  // which is exactly what spends the remainder of the budget. The copy lives in
  // LessonPlayShell's footer.
  const budget = consumeUserRateLimit(user.id, RATE_LIMITS.simFinish);
  if (!budget.allowed) return { ok: false, code: "RATE_LIMITED" };

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
    // Retried for the same reason the write is, and it is NOT merely coaching
    // that rides on it: the scenario level gate below reads `historyRows`, so
    // on a lost read an L2+ drive is refused as LEVEL_LOCKED and discarded even
    // though the student had unlocked it. The gate itself stays strict — an
    // empty history still locks; see the note at that `return` for the residual
    // this retry narrows but cannot close.
    historyRows = await retryOnPoolAcquireTimeout("listSessions", READ_RETRY_BACKOFF_MS, () =>
      getSimSessionStore().listSessions(user.id),
    );
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
      // OPEN, and deliberately not closed here: `historyRows` is [] both when
      // the student has no history AND when the read above failed outright, and
      // this line cannot tell those apart. On a failed read an L2+ drive is
      // therefore discarded as LEVEL_LOCKED — a false failure. The retry above
      // removes the common trigger; the remaining gap needs a code of its own
      // („не можахме да проверим нивото, опитай пак"), which means a new member
      // in components/sim/lesson-ui/types.ts and a branch in LessonPlayShell.
      // NOT fixed by defaulting to unlocked: a read that failed must never be
      // allowed to mean „unlocked", or the gate credits everybody the moment the
      // database wobbles.
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
    // The shown-but-not-charged violations (teach / learn-only arms), rebuilt
    // by gradeFinishWire from wire codes + our own catalog titles. This is the
    // debrief the student actually reads, and until this line the channel had
    // NO producer — `DebriefContext.coachedMistakes` was documented, filtered
    // and tested while every live debrief was built without it, so «чисто
    // каране без нито едно нарушение» shipped over drives whose HUD had raised
    // «Превишена скорост» twice (findings ef1eb9cf · a448e5f0 · 0fde4ec0 ·
    // faae7057; frames: sweep161/sc-signal-flashing/mobile-wrong/04-t012s.png).
    coachedMistakes: result.coachedMistakes,
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
    // ONE attempt was the whole policy here, and this is the one row in the
    // product that cannot be reconstructed afterwards — see the pool-acquire
    // note at the top of the file for what that cost sweep 161.
    const saved = await retryOnPoolAcquireTimeout("saveSession", SAVE_RETRY_BACKOFF_MS, () =>
      getSimSessionStore().saveSession(user.id, {
        lessonId: lesson.id,
        startedAt: new Date(wire.startedAtMs),
        finishedAt: new Date(wire.finishedAtMs),
        score: result.score,
        events: payload,
        debrief: debrief.text,
      }),
    );
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
