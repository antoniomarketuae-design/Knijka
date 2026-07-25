/**
 * batch — the „which clips still need (re-)recording?" selection.
 *
 * Battery: absent clips are always selected; a present clip older than the
 * batch baseline is stale (the pilot-v2 „silently stale" case); a present clip
 * recorded at/after the baseline is fresh and skipped; an unparseable
 * recordedAt is treated as stale; with no baseline (null) only absent clips are
 * selected; pilot order is preserved.
 */
import { describe, expect, it } from "vitest";
import { missingFreshClips, type RecordedClipLike } from "./batch";

const PILOT = [{ id: "a__m0" }, { id: "b__m0" }, { id: "c__m0" }, { id: "d__m0" }];
const BATCH = "2026-07-21T06:00:00.000Z";

function manifest(entries: Record<string, string>): Map<string, RecordedClipLike> {
  return new Map(Object.entries(entries).map(([id, recordedAt]) => [id, { recordedAt }]));
}

describe("missingFreshClips", () => {
  it("selects clips with no manifest entry at all", () => {
    const byId = manifest({
      a__m0: "2026-07-21T06:05:00.000Z",
      c__m0: "2026-07-21T06:06:00.000Z",
    });
    // b and d were never recorded.
    expect(missingFreshClips(PILOT, byId, BATCH)).toEqual(["b__m0", "d__m0"]);
  });

  it("selects present clips older than the batch baseline (silently stale)", () => {
    const byId = manifest({
      a__m0: "2026-07-21T06:05:00.000Z", // fresh (after 06:00)
      b__m0: "2026-07-21T04:30:00.000Z", // stale (before 06:00)
      c__m0: "2026-07-21T06:10:00.000Z", // fresh
      d__m0: "2026-07-20T20:00:00.000Z", // stale (previous day)
    });
    expect(missingFreshClips(PILOT, byId, BATCH)).toEqual(["b__m0", "d__m0"]);
  });

  it("keeps a clip recorded exactly at the baseline (>= is fresh)", () => {
    const byId = manifest({
      a__m0: BATCH,
      b__m0: BATCH,
      c__m0: BATCH,
      d__m0: BATCH,
    });
    expect(missingFreshClips(PILOT, byId, BATCH)).toEqual([]);
  });

  it("treats an unparseable recordedAt as stale", () => {
    const byId = manifest({
      a__m0: "not-a-date",
      b__m0: "2026-07-21T06:05:00.000Z",
      c__m0: "",
      d__m0: "2026-07-21T06:07:00.000Z",
    });
    expect(missingFreshClips(PILOT, byId, BATCH)).toEqual(["a__m0", "c__m0"]);
  });

  it("with no baseline, selects ONLY entirely-absent clips", () => {
    const byId = manifest({
      a__m0: "2026-07-21T06:05:00.000Z",
      c__m0: "2026-07-20T01:00:00.000Z", // old, but present → fresh without a baseline
    });
    expect(missingFreshClips(PILOT, byId, null)).toEqual(["b__m0", "d__m0"]);
  });

  it("selects everything when the manifest is empty", () => {
    expect(missingFreshClips(PILOT, new Map(), BATCH)).toEqual([
      "a__m0",
      "b__m0",
      "c__m0",
      "d__m0",
    ]);
  });

  it("preserves pilot order regardless of manifest order", () => {
    const byId = manifest({ d__m0: "2026-07-20T00:00:00.000Z", b__m0: "2026-07-20T00:00:00.000Z" });
    // b and d present-but-stale, a and c absent → all four, in pilot order.
    expect(missingFreshClips(PILOT, byId, BATCH)).toEqual(["a__m0", "b__m0", "c__m0", "d__m0"]);
  });
});
