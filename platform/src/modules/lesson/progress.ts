/**
 * WHERE THE STUDENT GOT TO.
 *
 * The room, the engine and the course index all shipped without a single row
 * that records that anyone watched a lesson. Three things were broken by that
 * one absence, and they are not cosmetic:
 *
 *  1. A student who closed the tab restarted at beat 1. Fifty-four lessons of
 *     four to six minutes each is a course, and a course that forgets where you
 *     are is a video you have to scrub.
 *  2. „урок 21 от 54" could never become „продължи оттам". The classroom index
 *     said so out loud in its own header comment and fell back to per-CONCEPT
 *     mastery — „the first lesson whose section has no recorded answers" —
 *     which answers a different question and gets the wrong lesson whenever a
 *     student practises a topic before watching its lesson.
 *  3. Doc 84's gate U3 — measure completion per lesson — could not be
 *     evaluated at all, which is what blocks phases 3 and 4 from having any
 *     evidence to be judged on.
 *
 * `LessonProgress` (prisma/schema.prisma) is the row. This file is the whole
 * of what the product may do with it: a store boundary so unit tests inject an
 * in-memory fake (mirroring @/modules/learning store.ts), and the three pure
 * decisions — where to resume inside a lesson, which lesson to resume, and how
 * much of the course is done — kept out of the store so they can be argued
 * with in a test instead of in a page.
 *
 * WHAT `beatIndex` COUNTS. Engine beats — an index into `Lesson.beats`, which
 * is what the schema comment says and what the plain outline uses. The room
 * splits one engine beat into one room beat per SENTENCE, so the surface
 * converts on the way in and on the way out (`classroom/resume.ts`). Storing
 * the room's finer index would tie a database row to one renderer's idea of a
 * pause point.
 *
 * PRIVACY. userId, lessonId, an integer and three timestamps. No answers, no
 * text, no device data — under ADR-004 these are minors, and a resume cursor
 * is the smallest thing that can possibly implement resuming.
 */

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export interface LessonProgressRow {
  lessonId: string;
  /** Resume cursor into `Lesson.beats`. */
  beatIndex: number;
  startedAt: Date;
  updatedAt: Date;
  /** null = still in progress. Sticky once set — see `saveLessonPosition`. */
  completedAt: Date | null;
}

export interface LessonProgressStore {
  listForUser(userId: string): Promise<LessonProgressRow[]>;
  getOne(userId: string, lessonId: string): Promise<LessonProgressRow | null>;
  /**
   * Move the bookmark. `completed` only ever SETS completion; it never clears
   * it, so a retake moves the cursor without un-completing the lesson — which
   * is what makes „38 от 54 завършени" a number that only goes up.
   */
  save(
    userId: string,
    lessonId: string,
    beatIndex: number,
    completed: boolean,
    now?: Date,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// The Prisma store (lazy import: unit tests never need DATABASE_URL)
// ---------------------------------------------------------------------------

function createPrismaStore(): LessonProgressStore {
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async listForUser(userId) {
      const db = await getDb();
      const rows = await db.lessonProgress.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((r) => ({
        lessonId: r.lessonId,
        beatIndex: r.beatIndex,
        startedAt: r.startedAt,
        updatedAt: r.updatedAt,
        completedAt: r.completedAt,
      }));
    },

    async getOne(userId, lessonId) {
      const db = await getDb();
      const row = await db.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
      });
      if (row === null) return null;
      return {
        lessonId: row.lessonId,
        beatIndex: row.beatIndex,
        startedAt: row.startedAt,
        updatedAt: row.updatedAt,
        completedAt: row.completedAt,
      };
    },

    async save(userId, lessonId, beatIndex, completed, now = new Date()) {
      const db = await getDb();
      await db.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: {
          userId,
          lessonId,
          beatIndex,
          completedAt: completed ? now : null,
        },
        // Spread rather than `completedAt: completed ? now : null`: writing
        // null on every non-final beat would un-complete a lesson the student
        // is re-watching, and the completion count is the one number doc 84
        // gate U3 is evaluated on.
        update: { beatIndex, ...(completed ? { completedAt: now } : {}) },
      });
    },
  };
}

let store: LessonProgressStore | null = null;

export function setLessonProgressStore(s: LessonProgressStore | null): void {
  store = s;
}

export function getLessonProgressStore(): LessonProgressStore {
  if (store === null) store = createPrismaStore();
  return store;
}

/** An in-memory store for tests and for wiring a surface before the DB. */
export class InMemoryLessonProgressStore implements LessonProgressStore {
  readonly rows = new Map<string, LessonProgressRow>();

  private key(userId: string, lessonId: string): string {
    return `${userId}\u0000${lessonId}`;
  }

  async listForUser(userId: string): Promise<LessonProgressRow[]> {
    return [...this.rows.entries()]
      .filter(([k]) => k.startsWith(`${userId}\u0000`))
      .map(([, v]) => v)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getOne(userId: string, lessonId: string): Promise<LessonProgressRow | null> {
    return this.rows.get(this.key(userId, lessonId)) ?? null;
  }

  async save(
    userId: string,
    lessonId: string,
    beatIndex: number,
    completed: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    const key = this.key(userId, lessonId);
    const existing = this.rows.get(key);
    this.rows.set(key, {
      lessonId,
      beatIndex,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      completedAt: completed ? (existing?.completedAt ?? now) : (existing?.completedAt ?? null),
    });
  }
}

// ---------------------------------------------------------------------------
// The three pure decisions
// ---------------------------------------------------------------------------

/**
 * Which engine beat to open a lesson on.
 *
 * A COMPLETED lesson opens at the start, deliberately: the student is
 * re-watching it, and dropping them on the last sentence of a lesson they
 * already finished is not resuming, it is skipping to the end. An in-progress
 * row opens where it was left, clamped — the beat list can get shorter when a
 * template's trace goes `pending` and a beat stops resolving.
 */
export function resumeBeatIndex(
  row: LessonProgressRow | null,
  beatCount: number,
): number {
  if (row === null || row.completedAt !== null) return 0;
  if (!Number.isFinite(row.beatIndex) || row.beatIndex <= 0) return 0;
  return Math.min(Math.floor(row.beatIndex), Math.max(0, beatCount - 1));
}

/** What the course index's one big button offers. */
export interface CourseResume {
  lessonId: string;
  beatIndex: number;
  /**
   * continue — an unfinished lesson, most recently touched.
   * start    — nothing unfinished; the first lesson never opened.
   * restart  — every lesson is complete. There is no „finished" screen, and
   *            saying so honestly beats pretending there is more.
   */
  kind: "continue" | "start" | "restart";
}

/**
 * Which lesson „Продължи оттам" points at.
 *
 * MOST RECENTLY TOUCHED UNFINISHED LESSON FIRST, not lowest-numbered: a
 * student who jumped ahead to the lesson about roundabouts because that is
 * what scared them wants that one back, not lesson 1. Only when nothing is
 * open does it fall to course order.
 *
 * `rows` may be in any order; it is sorted here rather than trusted, because
 * one caller reads it from a store and another builds it in a test.
 */
export function resumePoint(
  lessonIds: readonly string[],
  rows: readonly LessonProgressRow[],
): CourseResume | null {
  if (lessonIds.length === 0) return null;
  const known = new Set(lessonIds);
  const byLesson = new Map(rows.map((r) => [r.lessonId, r]));

  const open = rows
    .filter((r) => r.completedAt === null && known.has(r.lessonId))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  if (open !== undefined) {
    return { lessonId: open.lessonId, beatIndex: open.beatIndex, kind: "continue" };
  }

  const fresh = lessonIds.find((id) => !byLesson.has(id));
  if (fresh !== undefined) return { lessonId: fresh, beatIndex: 0, kind: "start" };

  return { lessonId: lessonIds[0], beatIndex: 0, kind: "restart" };
}

/** Doc 84 gate U3, as three integers. */
export interface CourseCompletion {
  total: number;
  started: number;
  completed: number;
}

export function courseCompletion(
  lessonIds: readonly string[],
  rows: readonly LessonProgressRow[],
): CourseCompletion {
  const known = new Set(lessonIds);
  const mine = rows.filter((r) => known.has(r.lessonId));
  return {
    total: lessonIds.length,
    started: mine.length,
    completed: mine.filter((r) => r.completedAt !== null).length,
  };
}
