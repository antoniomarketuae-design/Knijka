/**
 * Chunked capture-run selection (pure, node-testable).
 *
 * The unattended batch (dev/clip-capture ?auto=1) records 20 clips, each a
 * FRESH R3F/WebGL scene + MediaRecorder. Twenty sequential contexts on a 16 GB
 * box exhaust GPU memory and the browser's ~16 live-context cap — the founder's
 * clip-12 death, four rounds running. Two defenses stack:
 *
 *   1. Per-clip HARD disposal (CaptureScene's SceneDisposer forceContextLoss),
 *      so only ONE context is ever live.
 *   2. CHUNKING: record a handful of clips, then a FULL window.location reload
 *      (the nuclear reset that reclaims every context + heap byte the browser
 *      never quite gives back) and RESUME at the next pilot index.
 *
 * These helpers pick — purely, so they unit-test — which clips a chunk records
 * (skipping any already fresh this run), where the next chunk resumes (`from`),
 * and whether the whole run is complete. "Fresh this run" is decided by
 * missingFreshClips (batch.ts): a clip is done when its manifest recordedAt is
 * at/after the run baseline persisted across the reloads (sessionStorage).
 */
import { missingFreshClips, type RecordedClipLike } from "./batch";

/** Clips recorded per page before a full reload. ~4-5 keeps every page well
 *  under the ~12-clip death zone while minimizing reload round-trips (20/4 = 5
 *  pages, 4 reloads). Tune here — the only knob. */
export const CAPTURE_CHUNK_SIZE = 4;

/** Clamp a raw ?from= value to a valid pilot index in [0, total]. Garbage,
 *  negatives and NaN all resolve to 0 (start from the top). */
export function parseFromIndex(raw: string | null, total: number): number {
  const cap = Math.max(0, Math.floor(total));
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return 0;
  return Math.min(n, cap);
}

export interface ChunkPlan<T> {
  /** Window start index (clamped into range). */
  from: number;
  /** Where the NEXT chunk resumes — the window end, clamped to total. */
  nextFrom: number;
  /** Window entries still missing a fresh recording — record exactly these. */
  toRecord: T[];
  /** Window entries already fresh this run — ids, skipped (not re-recorded). */
  skipped: string[];
  /** True when this window reaches the end of the pilot (no reload after). */
  isLastChunk: boolean;
}

/**
 * The chunk window [from, from+chunkSize) split into to-record vs already-fresh.
 * A pure function of (pilot, from, size, missingIds) — no I/O, fully testable.
 */
export function planChunk<T extends { id: string }>(
  pilot: readonly T[],
  from: number,
  chunkSize: number,
  missingIds: ReadonlySet<string>,
): ChunkPlan<T> {
  const size = Math.max(1, Math.floor(chunkSize));
  const start = Math.max(0, Math.min(Math.floor(from), pilot.length));
  const end = Math.min(start + size, pilot.length);
  const toRecord: T[] = [];
  const skipped: string[] = [];
  for (let i = start; i < end; i++) {
    const entry = pilot[i];
    if (missingIds.has(entry.id)) toRecord.push(entry);
    else skipped.push(entry.id);
  }
  return { from: start, nextFrom: end, toRecord, skipped, isLastChunk: end >= pilot.length };
}

/**
 * The first chunk window at/after `from` that actually has clips to record —
 * skipping all-fresh windows without wasting a reload on them. Returns null
 * when nothing from `from` onward still needs recording (the run is complete).
 */
export function nextChunkToRecord<T extends { id: string }>(
  pilot: readonly T[],
  from: number,
  chunkSize: number,
  missingIds: ReadonlySet<string>,
): ChunkPlan<T> | null {
  const size = Math.max(1, Math.floor(chunkSize));
  let cursor = Math.max(0, Math.min(Math.floor(from), pilot.length));
  while (cursor < pilot.length) {
    const plan = planChunk(pilot, cursor, size, missingIds);
    if (plan.toRecord.length > 0) return plan;
    cursor = plan.nextFrom;
  }
  return null;
}

/**
 * Per-pilot fresh/missing split for the end-of-run PASS/FAIL summary. The
 * MANIFEST is ground truth here (it survives the chunk reloads that wipe the
 * in-memory status pills), so the run is "ГОТОВО 20/20" only when `missing` is
 * empty — every pilot clip carries a webm recorded at/after the run baseline.
 */
export interface RunSummary {
  fresh: string[];
  missing: string[];
}
export function runSummary<T extends { id: string }>(
  pilot: readonly T[],
  missingIds: ReadonlySet<string>,
): RunSummary {
  const fresh: string[] = [];
  const missing: string[] = [];
  for (const entry of pilot) {
    if (missingIds.has(entry.id)) missing.push(entry.id);
    else fresh.push(entry.id);
  }
  return { fresh, missing };
}

/** The still-needs-recording id set from a live manifest + the run baseline —
 *  a thin Set wrapper over missingFreshClips, the shared batch.ts law. */
export function missingIdSet(
  pilot: readonly { id: string }[],
  manifestById: ReadonlyMap<string, RecordedClipLike>,
  since: string | null,
): Set<string> {
  return new Set(missingFreshClips(pilot, manifestById, since));
}
