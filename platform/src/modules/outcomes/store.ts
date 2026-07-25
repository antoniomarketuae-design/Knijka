/**
 * Persistence boundary for the outcomes module (same seam as
 * modules/privacy/store.ts and modules/learning/store.ts): all Prisma access
 * lives here, everything else in the module is pure and unit-testable through
 * setOutcomesStore(). Prisma is imported LAZILY, so importing this file never
 * requires DATABASE_URL.
 *
 * Two rules this file exists to enforce (both privacy, not performance):
 *
 * 1. Every per-student read and write is scoped by `userId`, written once,
 *    here. A widened `where` in an outcome list is somebody else's exam
 *    result, which is special-category-adjacent data about a minor.
 * 2. The calibration read returns CalibrationRow — which has no `id` and no
 *    `userId`. The internal view is therefore incapable of rendering an
 *    individual student, by construction rather than by discipline. If a
 *    future feature genuinely needs per-student calibration, it has to add a
 *    new method and justify it in review; it cannot happen by accident.
 */

import type { ExamKind, ReportedOutcome } from "./types";

/** A stored row, scoped to its owner. */
export interface OutcomeRow extends ReportedOutcome {
  userId: string;
}

/** The fields a write supplies; `id` and ownership are the store's business. */
export interface OutcomeWrite {
  kind: ExamKind;
  passed: boolean;
  examOn: Date;
  reportedAt: Date;
  readinessScore: number;
  mockAttempts: number;
  bestMockScore: number | null;
}

/**
 * The de-identified projection the calibration consumes. No id, no userId —
 * see rule 2 in the header. `reportedAt` stays because the LAG between the
 * exam and the report is what tells us how stale the readiness snapshot was.
 */
export interface CalibrationRow {
  passed: boolean;
  examOn: Date;
  reportedAt: Date;
  readinessScore: number;
  mockAttempts: number;
  bestMockScore: number | null;
}

export interface OutcomesStore {
  /**
   * Insert, or correct the existing report for the same sitting
   * ([userId, kind, examOn]). `replaced` says which happened — the UI tells
   * the student whether we added or updated.
   */
  upsertOutcome(
    userId: string,
    write: OutcomeWrite,
  ): Promise<{ row: OutcomeRow; replaced: boolean }>;
  /** The user's own reports, most recent exam first. */
  listOutcomes(userId: string): Promise<OutcomeRow[]>;
  /**
   * Art. 7(3) withdrawal. False when the id is unknown OR belongs to someone
   * else — same answer for both, so the endpoint cannot be used to probe for
   * other people's report ids.
   */
  deleteOutcome(userId: string, id: string): Promise<boolean>;
  /** Every report of one kind, de-identified, for the internal calibration. */
  listForCalibration(kind: ExamKind): Promise<CalibrationRow[]>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

/** The row shape both Prisma selects return, before the ExamKind narrowing. */
interface RawRow {
  id: string;
  userId: string;
  kind: string;
  passed: boolean;
  examOn: Date;
  reportedAt: Date;
  readinessScore: number;
  mockAttempts: number;
  bestMockScore: number | null;
}

/**
 * `kind` is a TEXT column, so the DB can hold a value the type no longer
 * knows about (an older deploy's vocabulary, a manual fix). Narrow on read
 * instead of casting — an unrecognised kind is dropped by the callers rather
 * than smuggled into a Record<ExamKind, …> lookup as undefined.
 */
function toRow(raw: RawRow): OutcomeRow | null {
  if (raw.kind !== "theory" && raw.kind !== "practical") return null;
  return { ...raw, kind: raw.kind };
}

class PrismaOutcomesStore implements OutcomesStore {
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  async upsertOutcome(userId: string, write: OutcomeWrite) {
    const db = await this.db();
    const key = { userId, kind: write.kind, examOn: write.examOn };

    // Read first only to answer "did this replace something?" — the WRITE is
    // still an upsert, so a double-submitted form can never throw P2002. A
    // race between the two only mislabels the toast, never loses a report.
    const existing = await db.examOutcomeReport.findUnique({
      where: { userId_kind_examOn: key },
      select: { id: true },
    });

    const data = {
      passed: write.passed,
      readinessScore: write.readinessScore,
      mockAttempts: write.mockAttempts,
      bestMockScore: write.bestMockScore,
      reportedAt: write.reportedAt,
    };

    const raw = await db.examOutcomeReport.upsert({
      where: { userId_kind_examOn: key },
      create: { ...key, ...data },
      update: data,
    });

    const row = toRow(raw);
    if (!row) {
      // Unreachable: we just wrote write.kind, which is an ExamKind.
      throw new Error(`outcomes: wrote unknown exam kind "${raw.kind}"`);
    }
    return { row, replaced: existing !== null };
  }

  async listOutcomes(userId: string): Promise<OutcomeRow[]> {
    const db = await this.db();
    const rows = await db.examOutcomeReport.findMany({
      where: { userId },
      orderBy: [{ examOn: "desc" }, { reportedAt: "desc" }],
    });
    return rows.flatMap((r) => toRow(r) ?? []);
  }

  async deleteOutcome(userId: string, id: string): Promise<boolean> {
    const db = await this.db();
    // deleteMany, not delete: the userId in the filter is what makes this
    // ownership-checked, and a miss returns count 0 instead of throwing.
    const { count } = await db.examOutcomeReport.deleteMany({
      where: { id, userId },
    });
    return count > 0;
  }

  async listForCalibration(kind: ExamKind): Promise<CalibrationRow[]> {
    const db = await this.db();
    return db.examOutcomeReport.findMany({
      where: { kind },
      // Explicit select: the de-identification is the point of this method.
      select: {
        passed: true,
        examOn: true,
        reportedAt: true,
        readinessScore: true,
        mockAttempts: true,
        bestMockScore: true,
      },
      orderBy: { examOn: "asc" },
    });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

export class InMemoryOutcomesStore implements OutcomesStore {
  private seq = 0;

  constructor(readonly rows: OutcomeRow[] = []) {}

  async upsertOutcome(userId: string, write: OutcomeWrite) {
    const index = this.rows.findIndex(
      (r) =>
        r.userId === userId &&
        r.kind === write.kind &&
        r.examOn.getTime() === write.examOn.getTime(),
    );
    const row: OutcomeRow = {
      id: index >= 0 ? this.rows[index].id : `outcome-${++this.seq}`,
      userId,
      ...write,
    };
    if (index >= 0) {
      this.rows[index] = row;
      return { row, replaced: true };
    }
    this.rows.push(row);
    return { row, replaced: false };
  }

  async listOutcomes(userId: string): Promise<OutcomeRow[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort(
        (a, b) =>
          b.examOn.getTime() - a.examOn.getTime() ||
          b.reportedAt.getTime() - a.reportedAt.getTime(),
      );
  }

  async deleteOutcome(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.id === id && r.userId === userId);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }

  async listForCalibration(kind: ExamKind): Promise<CalibrationRow[]> {
    return this.rows
      .filter((r) => r.kind === kind)
      .sort((a, b) => a.examOn.getTime() - b.examOn.getTime())
      .map(({ passed, examOn, reportedAt, readinessScore, mockAttempts, bestMockScore }) => ({
        passed,
        examOn,
        reportedAt,
        readinessScore,
        mockAttempts,
        bestMockScore,
      }));
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: OutcomesStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setOutcomesStore(s: OutcomesStore | null): void {
  store = s;
}

export function getOutcomesStore(): OutcomesStore {
  if (!store) store = new PrismaOutcomesStore();
  return store;
}
