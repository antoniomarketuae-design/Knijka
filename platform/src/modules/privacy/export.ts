/**
 * GDPR Art. 15 (access) + Art. 20 (portability): one JSON document holding
 * everything personal we store about the signed-in user, and nothing else.
 *
 * "Nothing else" is load-bearing twice over: no other user's rows (the store
 * scopes every query by userId), and no credentials (the password hash is
 * reduced to a boolean before it ever leaves the store).
 */

import { getPrivacyStore } from "./store";
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type PersonalDataExport,
} from "./types";

/** ISO-8601, or null — dates travel as strings in a portable file. */
function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Builds the portable copy for `userId`, or null when the row is gone
 * (a session whose account was erased in another tab).
 */
export async function exportUserData(
  userId: string,
  now: Date = new Date(),
): Promise<PersonalDataExport | null> {
  const bundle = await getPrivacyStore().loadUserBundle(userId);
  if (!bundle) return null;

  const { user } = bundle;

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      birthYear: user.birthYear,
      locale: user.locale,
      consentAt: iso(user.consentAt),
      createdAt: user.createdAt.toISOString(),
    },
    progress: bundle.progress.map((p) => ({
      conceptId: p.conceptId,
      mastery: p.mastery,
      reps: p.reps,
      lapses: p.lapses,
      dueAt: iso(p.dueAt),
      updatedAt: p.updatedAt.toISOString(),
    })),
    questionAttempts: bundle.questionAttempts.map((a) => ({
      questionId: a.questionId,
      context: a.context,
      correct: a.correct,
      points: a.points,
      answeredAt: a.answeredAt.toISOString(),
    })),
    examAttempts: bundle.examAttempts.map((e) => ({
      startedAt: e.startedAt.toISOString(),
      finishedAt: iso(e.finishedAt),
      score: e.score,
      maxScore: e.maxScore,
      passed: e.passed,
      answers: e.answers ?? null,
    })),
    simSessions: bundle.simSessions.map((s) => ({
      lessonId: s.lessonId,
      startedAt: s.startedAt.toISOString(),
      finishedAt: iso(s.finishedAt),
      score: s.score,
      events: s.events ?? null,
      debrief: s.debrief,
    })),
    entitlements: bundle.entitlements.map((e) => ({
      pack: e.pack,
      purchasedAt: e.purchasedAt.toISOString(),
      expiresAt: iso(e.expiresAt),
      provider: e.provider,
      providerRef: e.providerRef,
    })),
    gamification: bundle.gamification
      ? {
          xp: bundle.gamification.xp,
          level: bundle.gamification.level,
          streak: bundle.gamification.streak,
          lastActiveDay: iso(bundle.gamification.lastActiveDay),
          achievements: bundle.gamification.achievements ?? [],
        }
      : null,
    tutorThreads: bundle.tutorThreads.map((t) => ({
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      messages: t.messages ?? [],
    })),
  };
}

/**
 * Filename for the download. Dated so a student can keep several copies, and
 * free of the e-mail address — the file often lands in a shared Downloads
 * folder on a family computer.
 */
export function exportFileName(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return `knijka-ai-moite-danni-${day}.json`;
}
