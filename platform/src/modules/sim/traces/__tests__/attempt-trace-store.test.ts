/**
 * I-2 „Твоят дубъл" — the persistence boundary of a student's own drive
 * (attemptStore.ts): the gzip codec and the retention policy.
 *
 * Two things are being defended here.
 *
 * 1. **The codec is a round trip, and a HOSTILE one is not.** A stored blob is
 *    read back months later by a renderer that will happily draw whatever it
 *    is handed; the store.ts law ("never trust stored bytes") is the only
 *    thing standing between a truncated BYTEA and NaN positions in the world.
 *
 * 2. **Retention is real.** Recorded kinematics are cheap to regenerate and
 *    expensive to hoard, and this product runs on a shared box. If the prune
 *    ever silently stops pruning, nothing else in the system notices — the
 *    disk just fills.
 */

import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  ATTEMPT_TRACE_RETENTION,
  MAX_STORED_TRACE_BYTES,
  decodeStoredTrace,
  encodeTraceForStorage,
  staleTraceIds,
} from "../attemptStore";
import { compactTraceForStorage } from "../compact";
import { serializeScenarioTrace } from "../parse";
import { createTraceRecorder } from "../recorder";
import { TRACE_VERSION, type ScenarioTrace } from "../types";

function attempt(durationSec: number, hz = 20): ScenarioTrace {
  const rec = createTraceRecorder({
    scenarioId: "sc-park-perp-rev@L1",
    kind: "attempt",
    maxDurationSec: durationSec + 10,
  });
  const n = Math.round(durationSec * hz);
  for (let i = 0; i <= n; i++) {
    const t = i / hz;
    rec.push({
      tSec: t,
      x: 120.371_9 + t * 3.117_43,
      y: -48.113_7 + Math.sin(t / 4) * 12.417_9,
      headingDeg: 271.418_2 + Math.sin(t / 3) * 17.331,
      steerRad: Math.sin(t / 2) * 0.213_47,
      speedKmh: 27.431_9 + Math.sin(t / 5) * 9.117,
      gear: 1,
      indicator: "off",
      brakeOn: i % 90 < 12,
      throttleOn: true,
    });
  }
  rec.addEvent("glance-rear", 3.2, undefined, "rear");
  const t = rec.finish();
  if (t === null) throw new Error("fixture recorder produced no trace");
  return t;
}

describe("attempt-trace codec", () => {
  it("round-trips a stored drive byte-for-byte", () => {
    const stored = compactTraceForStorage(attempt(45))!;
    expect(decodeStoredTrace(encodeTraceForStorage(stored))).toEqual(stored);
  });

  it("compresses hard enough to be worth the column", () => {
    const stored = compactTraceForStorage(attempt(60))!;
    const json = serializeScenarioTrace(stored).length;
    const gz = encodeTraceForStorage(stored).byteLength;

    // Measured ~8×. Pinned loosely: the assertion is "DEFLATE is doing its job
    // on repeated field names", not a specific zlib build's ratio.
    expect(gz).toBeLessThan(json / 5);
    expect(gz).toBeLessThan(32 * 1024);
  });

  it("refuses to store a trace that was never reduced", () => {
    // The ceiling's exact purpose: a client that skipped compactTraceForStorage
    // (or is not ours) must not push a surprise megabyte into the row.
    const raw = attempt(600);
    expect(serializeScenarioTrace(raw).length).toBeGreaterThan(MAX_STORED_TRACE_BYTES);
    expect(() => encodeTraceForStorage(raw)).toThrow(/too large/);
  });

  it("degrades to null on anything it did not write", () => {
    const good = encodeTraceForStorage(compactTraceForStorage(attempt(20))!);

    expect(decodeStoredTrace(good.slice(0, good.byteLength - 8))).toBeNull(); // truncated
    expect(decodeStoredTrace(new Uint8Array([1, 2, 3, 4]))).toBeNull(); // not gzip
    expect(decodeStoredTrace(gzipSync(Buffer.from("not json at all")))).toBeNull();
    expect(decodeStoredTrace(gzipSync(Buffer.from("{}")))).toBeNull(); // no meta
  });

  it("degrades to null on a trace from a format version it cannot read", () => {
    const stored = compactTraceForStorage(attempt(20))!;
    const future = JSON.stringify({
      ...stored,
      meta: { ...stored.meta, version: TRACE_VERSION + 1 },
    });
    expect(decodeStoredTrace(gzipSync(Buffer.from(future)))).toBeNull();
  });

  it("degrades to null on a hand-edited blob with NaN positions", () => {
    const stored = compactTraceForStorage(attempt(20))!;
    // JSON has no NaN literal — a corrupt row would carry null or a string.
    const poisoned = serializeScenarioTrace(stored).replace(/"x":[-\d.]+/, '"x":null');
    expect(decodeStoredTrace(gzipSync(Buffer.from(poisoned)))).toBeNull();
  });
});

describe("attempt-trace retention", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

  it("keeps the newest window and returns the rest for deletion", () => {
    const newestFirst = ids(ATTEMPT_TRACE_RETENTION + 3);
    expect(staleTraceIds(newestFirst)).toEqual(newestFirst.slice(ATTEMPT_TRACE_RETENTION));
  });

  it("deletes nothing while the user is inside the window", () => {
    expect(staleTraceIds([])).toEqual([]);
    expect(staleTraceIds(ids(ATTEMPT_TRACE_RETENTION))).toEqual([]);
  });

  it("prunes to the requested window when one is given", () => {
    expect(staleTraceIds(["a", "b", "c"], 1)).toEqual(["b", "c"]);
    // A zero window is "keep nothing" — never accidentally "keep everything".
    expect(staleTraceIds(["a", "b"], 0)).toEqual(["a", "b"]);
  });
});
