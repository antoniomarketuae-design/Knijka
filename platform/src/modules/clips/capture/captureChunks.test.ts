/**
 * captureChunks — the chunked-run selection math behind the ?auto=1 reload
 * loop. Battery: from-index is clamped; a window splits into to-record vs
 * already-fresh; nextChunkToRecord skips all-fresh windows without a reload and
 * returns null when the run is done; runSummary is the manifest-truth PASS/FAIL
 * split; missingIdSet mirrors batch.missingFreshClips.
 */
import { describe, expect, it } from "vitest";
import {
  CAPTURE_CHUNK_SIZE,
  missingIdSet,
  nextChunkToRecord,
  parseFromIndex,
  planChunk,
  runSummary,
} from "./captureChunks";
import type { RecordedClipLike } from "./batch";

const PILOT = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
const ALL_MISSING = new Set(PILOT.map((e) => e.id));

describe("parseFromIndex", () => {
  it("defaults null / garbage / negatives / NaN to 0", () => {
    expect(parseFromIndex(null, 20)).toBe(0);
    expect(parseFromIndex("", 20)).toBe(0);
    expect(parseFromIndex("abc", 20)).toBe(0);
    expect(parseFromIndex("-4", 20)).toBe(0);
    expect(parseFromIndex("0", 20)).toBe(0);
  });

  it("parses a valid index and clamps to total", () => {
    expect(parseFromIndex("4", 20)).toBe(4);
    expect(parseFromIndex("8", 20)).toBe(8);
    expect(parseFromIndex("99", 20)).toBe(20);
    expect(parseFromIndex("4", 0)).toBe(0);
  });

  it("floors a fractional-but-parseable string", () => {
    expect(parseFromIndex("4.9", 20)).toBe(4);
  });
});

describe("planChunk", () => {
  it("splits a window into to-record (missing) and skipped (fresh)", () => {
    // c1 and c3 already fresh; window [0,4) records c0, c2.
    const missing = new Set(["c0", "c2", "c4", "c5"]);
    const plan = planChunk(PILOT, 0, 4, missing);
    expect(plan.toRecord.map((e) => e.id)).toEqual(["c0", "c2"]);
    expect(plan.skipped).toEqual(["c1", "c3"]);
    expect(plan.from).toBe(0);
    expect(plan.nextFrom).toBe(4);
    expect(plan.isLastChunk).toBe(false);
  });

  it("marks the final window as the last chunk (no reload after)", () => {
    const plan = planChunk(PILOT, 16, 4, ALL_MISSING);
    expect(plan.from).toBe(16);
    expect(plan.nextFrom).toBe(20);
    expect(plan.toRecord).toHaveLength(4);
    expect(plan.isLastChunk).toBe(true);
  });

  it("clamps an over-range from to the end (empty final window)", () => {
    const plan = planChunk(PILOT, 99, 4, ALL_MISSING);
    expect(plan.from).toBe(20);
    expect(plan.nextFrom).toBe(20);
    expect(plan.toRecord).toEqual([]);
    expect(plan.isLastChunk).toBe(true);
  });

  it("treats a non-positive chunk size as 1", () => {
    const plan = planChunk(PILOT, 0, 0, ALL_MISSING);
    expect(plan.toRecord.map((e) => e.id)).toEqual(["c0"]);
    expect(plan.nextFrom).toBe(1);
  });
});

describe("nextChunkToRecord", () => {
  it("returns the window at `from` when it has clips to record", () => {
    const plan = nextChunkToRecord(PILOT, 4, 4, ALL_MISSING);
    expect(plan).not.toBeNull();
    expect(plan?.from).toBe(4);
    expect(plan?.nextFrom).toBe(8);
    expect(plan?.toRecord.map((e) => e.id)).toEqual(["c4", "c5", "c6", "c7"]);
  });

  it("skips all-fresh windows without a wasted reload", () => {
    // Only c9 and c18 still missing. From 0, the first non-empty window is
    // [8,12) (holds c9); it must skip [0,4) and [4,8) in-memory.
    const missing = new Set(["c9", "c18"]);
    const plan = nextChunkToRecord(PILOT, 0, 4, missing);
    expect(plan?.from).toBe(8);
    expect(plan?.toRecord.map((e) => e.id)).toEqual(["c9"]);
  });

  it("returns null when nothing from `from` onward needs recording", () => {
    // c2 is missing but BEHIND from=8 — the forward scan never reaches it.
    const missing = new Set(["c2"]);
    expect(nextChunkToRecord(PILOT, 8, 4, missing)).toBeNull();
  });

  it("returns null when the whole run is complete", () => {
    expect(nextChunkToRecord(PILOT, 0, 4, new Set())).toBeNull();
  });

  it("walks the whole pilot in ceil(total/size) advancing steps", () => {
    // Simulate the reload loop: each returned plan.nextFrom feeds the next.
    const seen: number[] = [];
    let from = 0;
    for (let guard = 0; guard < 100; guard++) {
      const plan = nextChunkToRecord(PILOT, from, CAPTURE_CHUNK_SIZE, ALL_MISSING);
      if (plan === null) break;
      seen.push(plan.from);
      if (plan.isLastChunk) break;
      from = plan.nextFrom;
    }
    expect(seen).toEqual([0, 4, 8, 12, 16]);
  });
});

describe("runSummary", () => {
  it("splits the pilot into fresh (recorded) and missing (failed) by manifest truth", () => {
    const missing = new Set(["c3", "c11"]);
    const s = runSummary(PILOT, missing);
    expect(s.missing).toEqual(["c3", "c11"]);
    expect(s.fresh).toHaveLength(18);
    expect(s.fresh).not.toContain("c3");
  });

  it("is a clean 20/20 (empty missing) when every clip is fresh", () => {
    const s = runSummary(PILOT, new Set());
    expect(s.missing).toEqual([]);
    expect(s.fresh).toHaveLength(20);
  });
});

describe("missingIdSet", () => {
  const BASE = "2026-07-21T06:00:00.000Z";
  function manifest(entries: Record<string, string>): Map<string, RecordedClipLike> {
    return new Map(Object.entries(entries).map(([id, recordedAt]) => [id, { recordedAt }]));
  }

  it("mirrors missingFreshClips — absent + stale ids only", () => {
    const small = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const byId = manifest({
      a: "2026-07-21T06:05:00.000Z", // fresh
      b: "2026-07-21T04:00:00.000Z", // stale (before baseline)
      // c absent
    });
    const set = missingIdSet(small, byId, BASE);
    expect([...set].sort()).toEqual(["b", "c"]);
  });
});
