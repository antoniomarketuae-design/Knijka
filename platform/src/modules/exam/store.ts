/**
 * Exam persistence, isolated behind the ExamStore interface.
 *
 * - Production: PrismaExamStore over ExamAttempt + QuestionAttempt rows.
 *   The Prisma client is imported LAZILY (dynamic import inside methods) so
 *   that test runs which inject the in-memory fake never touch the DB layer
 *   or require DATABASE_URL.
 * - Tests: InMemoryExamStore injected via setExamStore().
 *
 * The `answers` JSON column is treated as an opaque payload here; its two
 * shapes (in-progress marker vs graded answer array) are owned by index.ts.
 */

export interface ExamAttemptRecord {
  id: string;
  userId: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
  answers: unknown;
}

export interface QuestionAttemptInput {
  userId: string;
  questionId: string;
  /** Always "exam" from this module (QuestionAttempt.context). */
  context: "exam";
  correct: boolean;
  /** Points awarded (question weight if correct, else 0). */
  points: number;
}

export interface ExamStore {
  createAttempt(input: {
    userId: string;
    maxScore: number;
    answers: unknown;
  }): Promise<ExamAttemptRecord>;
  getAttempt(attemptId: string): Promise<ExamAttemptRecord | null>;
  finishAttempt(
    attemptId: string,
    patch: { finishedAt: Date; score: number; passed: boolean; answers: unknown },
  ): Promise<void>;
  createQuestionAttempts(rows: QuestionAttemptInput[]): Promise<void>;
  /** All attempts of a user, newest first. */
  listAttempts(userId: string): Promise<ExamAttemptRecord[]>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

/** Prisma-compatible JSON input (no top-level null — our payloads never are). */
type JsonIn = string | number | boolean | JsonIn[] | { [k: string]: JsonIn | null };

class PrismaExamStore implements ExamStore {
  /** Lazy so importing the exam module never boots Prisma (tests, edge). */
  private async db() {
    const { db } = await import("../../lib/db");
    return db;
  }

  async createAttempt(input: {
    userId: string;
    maxScore: number;
    answers: unknown;
  }): Promise<ExamAttemptRecord> {
    const db = await this.db();
    return db.examAttempt.create({
      data: {
        userId: input.userId,
        maxScore: input.maxScore,
        answers: input.answers as JsonIn,
      },
    });
  }

  async getAttempt(attemptId: string): Promise<ExamAttemptRecord | null> {
    const db = await this.db();
    return db.examAttempt.findUnique({ where: { id: attemptId } });
  }

  async finishAttempt(
    attemptId: string,
    patch: { finishedAt: Date; score: number; passed: boolean; answers: unknown },
  ): Promise<void> {
    const db = await this.db();
    await db.examAttempt.update({
      where: { id: attemptId },
      data: {
        finishedAt: patch.finishedAt,
        score: patch.score,
        passed: patch.passed,
        answers: patch.answers as JsonIn,
      },
    });
  }

  async createQuestionAttempts(rows: QuestionAttemptInput[]): Promise<void> {
    if (rows.length === 0) return;
    const db = await this.db();
    await db.questionAttempt.createMany({ data: rows });
  }

  async listAttempts(userId: string): Promise<ExamAttemptRecord[]> {
    const db = await this.db();
    return db.examAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
    });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

export class InMemoryExamStore implements ExamStore {
  /** Exposed for test assertions and clock manipulation. */
  readonly attempts = new Map<string, ExamAttemptRecord>();
  readonly questionAttempts: QuestionAttemptInput[] = [];
  private nextId = 1;

  async createAttempt(input: {
    userId: string;
    maxScore: number;
    answers: unknown;
  }): Promise<ExamAttemptRecord> {
    const record: ExamAttemptRecord = {
      id: `attempt-${this.nextId++}`,
      userId: input.userId,
      startedAt: new Date(),
      finishedAt: null,
      score: null,
      maxScore: input.maxScore,
      passed: null,
      answers: input.answers,
    };
    this.attempts.set(record.id, record);
    return record;
  }

  async getAttempt(attemptId: string): Promise<ExamAttemptRecord | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async finishAttempt(
    attemptId: string,
    patch: { finishedAt: Date; score: number; passed: boolean; answers: unknown },
  ): Promise<void> {
    const record = this.attempts.get(attemptId);
    if (!record) throw new Error(`InMemoryExamStore: no attempt ${attemptId}`);
    Object.assign(record, patch);
  }

  async createQuestionAttempts(rows: QuestionAttemptInput[]): Promise<void> {
    this.questionAttempts.push(...rows);
  }

  async listAttempts(userId: string): Promise<ExamAttemptRecord[]> {
    return [...this.attempts.values()]
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: ExamStore | null = null;

/** Tests inject a fake; production lazily falls back to Prisma. */
export function setExamStore(s: ExamStore | null): void {
  store = s;
}

export function getExamStore(): ExamStore {
  if (!store) store = new PrismaExamStore();
  return store;
}
