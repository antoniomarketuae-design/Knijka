/**
 * Persistence boundary for the student's own recorded drive — the durable
 * half of audit 2026-07-24 I-2 („Твоят дубъл": film the student's OWN
 * mistake with the same headless pipeline that films the authored demos).
 *
 * Until this file existed the answer to "are student traces persisted?" was
 * NO: LessonPlayShell finished the live recorder, mapped its glance events to
 * a handful of rubric moment ids, and dropped the kinematics on the floor.
 * The renderer already accepts any `ScenarioTrace`; what was missing was a
 * trace that outlived the browser tab.
 *
 * Same pattern as modules/sim/lessons/store.ts: ALL Prisma access hides
 * behind an injectable interface, the client is imported lazily (importing
 * this file never needs DATABASE_URL), and tests inject an in-memory fake.
 *
 * SERVER ONLY. Deliberately NOT re-exported from ./index.ts — that barrel is
 * on the THEORY path (the M-26 law in index.ts), and `node:zlib` has no
 * business in a bundle that draws a 2D replay for a question. The simulator's
 * server action deep-imports this file, exactly as it deep-imports
 * lessons/store.ts.
 *
 * Storage shape (prisma/schema.prisma → SimAttemptTrace):
 *   gz = gzip(JSON(ScenarioTrace)) of the ALREADY-REDUCED trace (compact.ts:
 *        10 Hz, cm precision, ≤ MAX_STORED_SAMPLES). Measured: reduction cuts
 *        a 300 s attempt from 1.25 MB to 146 KB, and gzip cuts that to 19 KB
 *        — ten field names repeated a thousand times is exactly what DEFLATE
 *        is for. A 60 s drill lands at ~11 KB.
 *   the summary columns (durationSec/sampleCount) are denormalised so the
 *        „моите записи" list never inflates a blob to render a row.
 *
 * ADR-004: a trace is recorded kinematics of a fictional car in a fictional
 * district — it carries no PII of its own. It is nevertheless keyed to a user,
 * so it is deleted with them (ON DELETE CASCADE from BOTH the session and the
 * user), and it is not hoarded: ATTEMPT_TRACE_RETENTION newest per user, the
 * rest pruned on every write. Minimal data, minimal retention.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { parseScenarioTrace, serializeScenarioTrace } from "./parse";
import type { ScenarioTrace } from "./types";

/**
 * How many attempt traces one user keeps, newest first. A trace is a replay
 * toy, not a record: the graded truth (score, event log, debrief) lives on
 * SimSession forever and is ~1 KB, while the kinematics behind it are 10–20 KB
 * that nobody re-watches after the next drive. Five keeps the whole product
 * under ~100 KB of trace per student.
 */
export const ATTEMPT_TRACE_RETENTION = 5;

/**
 * Refusal ceiling on the COMPRESSED payload. compact.ts already bounds the
 * sample count, so a blob past this is a client that did not reduce (or is
 * not ours) — store nothing rather than a surprise megabyte.
 */
export const MAX_STORED_TRACE_BYTES = 128 * 1024;

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

/**
 * gzip the serialized trace. Throws only if the payload is past the ceiling —
 * the caller (a swallow-on-failure path) treats that as "not stored".
 *
 * Returns a plain `Uint8Array<ArrayBuffer>`, not the `Buffer` zlib hands back:
 * Prisma's Bytes field is typed on the non-shared buffer, and a Buffer view
 * into node's pooled allocator is the wrong thing to hold onto anyway.
 */
export function encodeTraceForStorage(trace: ScenarioTrace): Uint8Array<ArrayBuffer> {
  const gz = gzipSync(Buffer.from(serializeScenarioTrace(trace), "utf8"));
  if (gz.byteLength > MAX_STORED_TRACE_BYTES) {
    throw new Error(`attempt trace too large after gzip: ${gz.byteLength} B`);
  }
  return new Uint8Array(gz);
}

/**
 * Inverse of encodeTraceForStorage, defensive end to end (the store.ts law:
 * never trust stored bytes). A truncated row, a foreign encoding or a trace
 * from a future format version all degrade to null — the caller hides the
 * replay, never renders NaN positions into the world.
 */
export function decodeStoredTrace(gz: Uint8Array): ScenarioTrace | null {
  let json: string;
  try {
    json = gunzipSync(gz).toString("utf8");
  } catch {
    return null;
  }
  try {
    return parseScenarioTrace(JSON.parse(json) as unknown);
  } catch {
    return null; // not JSON at all
  }
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Which of `newestFirst` fall outside the retention window. Pure so the
 * policy is testable without a database — the Prisma store below is the only
 * thing that turns the answer into DELETEs.
 */
export function staleTraceIds(
  newestFirst: ReadonlyArray<string>,
  retention: number = ATTEMPT_TRACE_RETENTION,
): string[] {
  return newestFirst.slice(Math.max(0, retention));
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface SaveAttemptTraceInput {
  /** The SimSession this drive belongs to (the row's primary key: one
   *  session, one trace — a retry writes a new session). */
  simSessionId: string;
  lessonId: string;
  /** ALREADY reduced by compactTraceForStorage — the store compresses, it
   *  does not decide what to keep. */
  trace: ScenarioTrace;
}

/** Summary row for a „моите записи" list — never carries the blob. */
export interface AttemptTraceListRow {
  simSessionId: string;
  lessonId: string;
  recordedAt: Date;
  durationSec: number;
  sampleCount: number;
}

export interface AttemptTraceStore {
  /** Write one trace and prune the user back to the retention window. */
  save(userId: string, input: SaveAttemptTraceInput): Promise<void>;
  /** Newest-first summaries (no blobs) — the picker for a replay/reel. */
  list(userId: string, limit?: number): Promise<AttemptTraceListRow[]>;
  /** The trace itself, scoped to its owner; null when absent or unreadable. */
  load(userId: string, simSessionId: string): Promise<ScenarioTrace | null>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

function createPrismaStore(): AttemptTraceStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async save(userId, input) {
      const gz = encodeTraceForStorage(input.trace);
      const db = await getDb();
      // upsert, not create: a re-submitted finish (a retried server action on
      // a flaky mobile connection) must not violate the primary key.
      const row = {
        userId,
        lessonId: input.lessonId,
        durationSec: input.trace.meta.durationSec,
        sampleCount: input.trace.samples.length,
        gz,
      };
      await db.simAttemptTrace.upsert({
        where: { simSessionId: input.simSessionId },
        create: { simSessionId: input.simSessionId, ...row },
        update: row,
      });

      // Retention: the window is tiny, so reading the ids back costs one
      // index scan of ≤ RETENTION+1 rows and keeps the policy in pure code.
      const mine = await db.simAttemptTrace.findMany({
        where: { userId },
        orderBy: { recordedAt: "desc" },
        select: { simSessionId: true },
      });
      const stale = staleTraceIds(mine.map((r) => r.simSessionId));
      if (stale.length > 0) {
        await db.simAttemptTrace.deleteMany({ where: { simSessionId: { in: stale } } });
      }
    },

    async list(userId, limit = ATTEMPT_TRACE_RETENTION) {
      const db = await getDb();
      const rows = await db.simAttemptTrace.findMany({
        where: { userId },
        orderBy: { recordedAt: "desc" },
        take: Math.max(1, Math.min(limit, ATTEMPT_TRACE_RETENTION)),
        select: {
          simSessionId: true,
          lessonId: true,
          recordedAt: true,
          durationSec: true,
          sampleCount: true,
        },
      });
      return rows;
    },

    async load(userId, simSessionId) {
      const db = await getDb();
      // userId in the WHERE, not just the id: a trace id is a cuid another
      // account could guess at, and this is the only read path.
      const row = await db.simAttemptTrace.findFirst({
        where: { simSessionId, userId },
        select: { gz: true },
      });
      if (row === null) return null;
      return decodeStoredTrace(row.gz);
    },
  };
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: AttemptTraceStore | null = null;

/** Tests inject an in-memory fake here. */
export function setAttemptTraceStore(s: AttemptTraceStore | null): void {
  store = s;
}

export function getAttemptTraceStore(): AttemptTraceStore {
  if (!store) store = createPrismaStore();
  return store;
}
