/**
 * Data-subject rights surface (GDPR Art. 15 access / portability and Art. 17
 * erasure). Our users are minors, so both rights have to be exercisable by the
 * user themselves, in the app, in Bulgarian — not only through a mailbox.
 */

/** Format marker written into every export, so a future importer can branch. */
export const EXPORT_FORMAT = "knijka.ai/personal-data-export";
export const EXPORT_FORMAT_VERSION = 1;

/** One learning-progress row (per concept from content/concepts.json). */
export interface ExportedProgress {
  conceptId: string;
  mastery: number;
  reps: number;
  lapses: number;
  dueAt: string | null;
  updatedAt: string;
}

export interface ExportedQuestionAttempt {
  questionId: string;
  context: string;
  correct: boolean;
  /** The question's official weight (1|2|3), NOT points earned. */
  points: number;
  answeredAt: string;
}

export interface ExportedExamAttempt {
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
  /** Raw per-question answers as stored ([{questionId, optionIds, ...}]). */
  answers: unknown;
}

export interface ExportedSimSession {
  lessonId: string;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  /** Rule-engine event log (the same JSON the replay/debrief screens read). */
  events: unknown;
  debrief: string | null;
}

export interface ExportedEntitlement {
  pack: string;
  purchasedAt: string;
  expiresAt: string | null;
  provider: string | null;
  /** Payment-provider reference — the user's own receipt id, so it belongs in their copy. */
  providerRef: string | null;
}

export interface ExportedGamification {
  xp: number;
  level: number;
  streak: number;
  lastActiveDay: string | null;
  achievements: unknown;
}

export interface ExportedTutorThread {
  createdAt: string;
  updatedAt: string;
  /** Full conversation as stored ([{role, content, ts}]). */
  messages: unknown;
}

export interface ExportedAccount {
  id: string;
  email: string;
  name: string | null;
  birthYear: number | null;
  locale: string;
  /** When the GDPR consent checkbox was ticked at registration. */
  consentAt: string | null;
  createdAt: string;
}

/**
 * The whole portable copy of one user (Art. 20 "structured, commonly used,
 * machine-readable"). Dates are ISO-8601 strings, not Date objects, because
 * this is serialized to a downloaded .json file.
 *
 * What is deliberately NOT here: `passwordHash` (a credential, not personal
 * data the subject needs — exporting it would only widen the blast radius of
 * a leaked download) and `role` (an internal access flag, see auth/types.ts).
 */
export interface PersonalDataExport {
  format: typeof EXPORT_FORMAT;
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  account: ExportedAccount;
  progress: ExportedProgress[];
  questionAttempts: ExportedQuestionAttempt[];
  examAttempts: ExportedExamAttempt[];
  simSessions: ExportedSimSession[];
  entitlements: ExportedEntitlement[];
  gamification: ExportedGamification | null;
  tutorThreads: ExportedTutorThread[];
}

/**
 * What erasure actually removed. Returned so the confirmation screen can say
 * something truthful ("изтрихме N записа") instead of a bare "готово", and so
 * the server log carries a receipt without carrying any PII.
 */
export interface ErasureReceipt {
  userId: string;
  erasedAt: string;
  deleted: {
    progress: number;
    questionAttempts: number;
    examAttempts: number;
    simSessions: number;
    entitlements: number;
    gamification: number;
    tutorThreads: number;
  };
}

export type EraseAccountResult =
  | { ok: true; receipt: ErasureReceipt }
  /** Password did not match — the account is untouched. */
  | { ok: false; error: "wrong_password" }
  /** Account has no password (OAuth-only): re-auth is impossible, use /contact. */
  | { ok: false; error: "no_password" }
  /** Session pointed at a row that no longer exists (already erased / stale JWT). */
  | { ok: false; error: "not_found" };
