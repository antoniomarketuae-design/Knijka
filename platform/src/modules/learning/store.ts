/**
 * Persistence boundary for the learning module.
 *
 * ALL Prisma access is isolated here behind the LearningStore interface so the
 * rest of the module stays pure and unit tests inject an in-memory fake via
 * setLearningStore() (mirroring setContentRepo() in @/lib/content/repo).
 *
 * The Prisma client is imported lazily inside the default store so importing
 * this file (e.g. from unit tests) never requires DATABASE_URL.
 */

export interface ProgressRow {
  conceptId: string;
  /** 0..1 (see mastery.ts) */
  mastery: number;
  /** Consecutive successful reviews (see scheduler.ts) */
  reps: number;
  /** Total wrong answers for this concept */
  lapses: number;
  /** Next review; null = never scheduled */
  dueAt: Date | null;
  /** Last write — used as the recency signal by readiness.ts */
  updatedAt: Date;
}

export interface ProgressUpdate {
  conceptId: string;
  mastery: number;
  reps: number;
  lapses: number;
  dueAt: Date | null;
}

export interface AttemptRecord {
  questionId: string;
  /** Mirrors submit.ts AnswerContext — "lesson" is the classroom mini-quiz. */
  context: "practice" | "micro" | "lesson";
  correct: boolean;
  /** Official point weight of the question (1|2|3), not points earned. */
  points: number;
  answeredAt: Date;
}

/** Official sim severity classes (docs/education/32; mirrors sim/rules). */
export type SimSeverity = "opasna" | "osnovna" | "vtorostepenna";

/**
 * One concept-linked rule event from a recent sim session — the raw sim
 * evidence the readiness blend and weak-spots ranking consume. Derived
 * READ-ONLY from SimSession rows (owned by the sim module) exactly like the
 * gamification store derives from QuestionAttempt/ExamAttempt: no writes, no
 * schema coupling beyond the versioned events Json we parse defensively.
 */
export interface SimEvidenceRow {
  conceptId: string;
  kind: "violation" | "commendation";
  /** Set for violations; null for commendations. */
  severity: SimSeverity | null;
  /** When the session finished (recency of the evidence). */
  finishedAt: Date;
}

/**
 * Ceiling on the concept-linked rule events ONE readiness computation reads.
 *
 * The fourteen-day window is a bound on TIME, not on volume: it is exactly as
 * large as the student's own diligence, so the best customer pays the most.
 * Newest drives first, so the cap trims the OLDEST evidence in the window —
 * which is the direction readiness already wants (recency is the whole point
 * of a fourteen-day window). Five hundred events is far past where the two
 * consumers change their answer: the blend needs a per-concept ratio and the
 * weak-spots card ranks three concepts, and both saturate within a few dozen
 * events per concept.
 */
export const SIM_EVIDENCE_ROW_LIMIT = 500;

export interface LearningStore {
  /** All Progress rows for a user. */
  getProgress(userId: string): Promise<ProgressRow[]>;
  /** Distinct question ids answered CORRECTLY at/after `since` (any context). */
  getCorrectlyAnsweredSince(userId: string, since: Date): Promise<string[]>;
  /**
   * Persist one QuestionAttempt plus its per-concept Progress upserts
   * atomically (single transaction).
   */
  recordAnswer(
    userId: string,
    attempt: AttemptRecord,
    updates: ProgressUpdate[],
  ): Promise<void>;
  /**
   * Progress-only upserts (no QuestionAttempt) — used by the exam mastery
   * feed, where the exam module already owns the attempt rows.
   */
  upsertProgress(userId: string, updates: ProgressUpdate[]): Promise<void>;
  /**
   * Concept-linked rule events from sim sessions finished at/after `since`
   * (read-only; see SimEvidenceRow). At most SIM_EVIDENCE_ROW_LIMIT rows,
   * newest drive first. Unreadable/foreign event payloads are skipped
   * silently — never fail readiness over one corrupt row.
   */
  getSimEvidenceSince(userId: string, since: Date): Promise<SimEvidenceRow[]>;
}

/**
 * Narrow ONE (conceptId, kind, severityClass) triple to a SimEvidenceRow, or
 * null when it is not evidence this module recognises.
 *
 * Everything is `unknown` because the triple arrives out of a Json column that
 * another module writes: a foreign or half-migrated payload must produce fewer
 * rows, never a throw and never a row with a severity the blend would index a
 * weight table with. Pure, so the rules are unit-testable without a database.
 */
export function toSimEvidenceRow(
  conceptId: unknown,
  kind: unknown,
  severityClass: unknown,
  finishedAt: Date,
): SimEvidenceRow | null {
  if (typeof conceptId !== "string" || conceptId.length === 0) return null;
  if (kind === "commendation") {
    return { conceptId, kind: "commendation", severity: null, finishedAt };
  }
  if (kind !== "violation") return null;
  if (
    severityClass !== "opasna" &&
    severityClass !== "osnovna" &&
    severityClass !== "vtorostepenna"
  ) {
    return null;
  }
  return { conceptId, kind: "violation", severity: severityClass, finishedAt };
}

/** One projected rule event — every column is nullable by construction. */
interface SimEvidenceQueryRow {
  finishedAt: unknown;
  conceptId: string | null;
  kind: string | null;
  severity: string | null;
}

/** Timestamps out of $queryRaw are adapter-shaped; accept Date/string/number. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function createPrismaStore(): LearningStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async getProgress(userId) {
      const db = await getDb();
      const rows = await db.progress.findMany({ where: { userId } });
      return rows.map((r) => ({
        conceptId: r.conceptId,
        mastery: r.mastery,
        reps: r.reps,
        lapses: r.lapses,
        dueAt: r.dueAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getCorrectlyAnsweredSince(userId, since) {
      const db = await getDb();
      const rows = await db.questionAttempt.findMany({
        where: { userId, correct: true, answeredAt: { gte: since } },
        select: { questionId: true },
      });
      return [...new Set(rows.map((r) => r.questionId))];
    },

    async upsertProgress(userId, updates) {
      const db = await getDb();
      await db.$transaction(
        updates.map((u) =>
          db.progress.upsert({
            where: { userId_conceptId: { userId, conceptId: u.conceptId } },
            create: {
              userId,
              conceptId: u.conceptId,
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
            update: {
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
          }),
        ),
      );
    },

    async getSimEvidenceSince(userId, since) {
      const db = await getDb();
      // NOT `select: { events: true }` over the whole window. This read wants
      // three strings per rule event — conceptId, kind, severityClass — and
      // `events` is the entire session payload: every ViolationEvent carries
      // its own titleBg + explanationBg + lawRef, ~430 bytes of Bulgarian
      // prose that already lives in sim/rules, plus objectives, eventPositions
      // and nearMisses that nothing here reads at all. Selecting the column
      // shipped all of it to Node and JSON.parsed it, for every session in
      // fourteen days, with no `take` — so the cost of one dashboard paint
      // grew with how much the student drove.
      //
      // Postgres can do the projection where the bytes already are, so the
      // wire carries evidence instead of prose. Three things make it safe on a
      // Json column another module owns:
      //   * the CASE guard — jsonb_array_elements() THROWS on a scalar or an
      //     object, and one corrupt row must not fail a student's readiness;
      //   * `version = '1'` — same envelope check the in-Node parse did, so a
      //     future payload version is skipped rather than misread;
      //   * `->>` on a non-object element yields NULL, and toSimEvidenceRow
      //     drops NULLs — junk inside the array is skipped, not trusted.
      // ORDER BY startedAt (not finishedAt) rides the (userId, startedAt)
      // index, exactly like sim/lessons/store.ts:listSessions.
      const rows = await db.$queryRaw<SimEvidenceQueryRow[]>`
        SELECT s."finishedAt"              AS "finishedAt",
               e.value ->> 'conceptId'     AS "conceptId",
               e.value ->> 'kind'          AS "kind",
               e.value ->> 'severityClass' AS "severity"
          FROM "SimSession" s
          CROSS JOIN LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_typeof(s."events" -> 'ruleEvents') = 'array'
                      THEN s."events" -> 'ruleEvents'
                      ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS e(value, ord)
         WHERE s."userId" = ${userId}
           AND s."finishedAt" >= ${since}
           AND s."events" ->> 'version' = '1'
         ORDER BY s."startedAt" DESC, e.ord ASC
         LIMIT ${SIM_EVIDENCE_ROW_LIMIT}`;

      const out: SimEvidenceRow[] = [];
      for (const r of rows) {
        // The WHERE cannot match a NULL finishedAt, so this only ever falls
        // back when a driver adapter hands the column over as something other
        // than a Date. `since` is then the honest floor: the row IS inside the
        // window, and no consumer reads the timestamp for anything finer.
        const finishedAt = asDate(r.finishedAt) ?? since;
        const row = toSimEvidenceRow(r.conceptId, r.kind, r.severity, finishedAt);
        if (row) out.push(row);
      }
      return out;
    },

    async recordAnswer(userId, attempt, updates) {
      const db = await getDb();
      await db.$transaction([
        db.questionAttempt.create({
          data: {
            userId,
            questionId: attempt.questionId,
            context: attempt.context,
            correct: attempt.correct,
            points: attempt.points,
            answeredAt: attempt.answeredAt,
          },
        }),
        ...updates.map((u) =>
          db.progress.upsert({
            where: { userId_conceptId: { userId, conceptId: u.conceptId } },
            create: {
              userId,
              conceptId: u.conceptId,
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
            update: {
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
          }),
        ),
      ]);
    },
  };
}

let store: LearningStore | null = null;

/**
 * Test suites inject an in-memory fake here (see fixtures.ts). `null` restores
 * the Prisma-backed store — which is how prismaStoreQueries.test.ts gets to
 * look at the statement this module really issues.
 */
export function setLearningStore(s: LearningStore | null): void {
  store = s;
}

export function getLearningStore(): LearningStore {
  if (!store) {
    store = createPrismaStore();
  }
  return store;
}
