/**
 * I-2 „Твоят дубъл" — the storage reduction of a student's own attempt
 * (compact.ts).
 *
 * The properties that matter are not "it got smaller"; they are:
 *   • the reduced trace is STILL a ScenarioTrace — it must survive
 *     parseScenarioTrace, because the ghost player, the 2D replay and the
 *     headless reel renderer all consume that one shape and nothing else;
 *   • a long drive is decimated, never TRUNCATED — cutting the tail off a
 *     five-minute drive would routinely cut the mistake out of the reel;
 *   • the stored duration is the real duration, to the centisecond;
 *   • the bytes actually fit a phone's upload and a shared VPS's disk.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_STORED_SAMPLES,
  STORED_TRACE_HZ,
  compactTraceForStorage,
} from "../compact";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTraceRecorder } from "../recorder";
import type { ScenarioTrace } from "../types";

/** Deterministic noise — a real drive is not a straight line, and JSON size
 *  depends entirely on how many digits survive the rounding. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A recorded attempt of `durationSec`, captured at `hz` (the live recorder's
 *  20 Hz by default), with plausible jitter on every channel. */
function recordAttempt(durationSec: number, hz = 20, seed = 7): ScenarioTrace {
  const rnd = mulberry32(seed);
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
      x: 120.371_9 + t * 3.117_43 + rnd() * 0.05,
      y: -48.113_7 + Math.sin(t / 4) * 12.417_9 + rnd() * 0.05,
      headingDeg: 271.418_2 + Math.sin(t / 3) * 17.331 + rnd() * 0.1,
      steerRad: Math.sin(t / 2) * 0.213_47,
      speedKmh: 27.431_9 + Math.sin(t / 5) * 9.117,
      gear: 1,
      indicator: i % 200 < 40 ? "right" : "off",
      brakeOn: i % 90 < 12,
      throttleOn: i % 90 >= 12,
    });
  }
  rec.addEvent("glance-right", 2.117, undefined, "right");
  rec.addEvent("annotation", 5.913, "Погледни в дясното огледало");
  const trace = rec.finish();
  if (trace === null) throw new Error("fixture recorder produced no trace");
  return trace;
}

describe("compactTraceForStorage", () => {
  it("halves a 20 Hz attempt to the stored cadence and keeps it parseable", () => {
    const raw = recordAttempt(60);
    const stored = compactTraceForStorage(raw);
    expect(stored).not.toBeNull();

    // ~10 Hz over 60 s ⇒ ~600 samples (scheduled decimation, jitter allowed).
    expect(stored!.samples.length).toBeGreaterThanOrEqual(60 * STORED_TRACE_HZ - 10);
    expect(stored!.samples.length).toBeLessThanOrEqual(60 * STORED_TRACE_HZ + 2);

    // The whole reason the reduction is allowed to exist: the output is still
    // the ONE format every consumer accepts.
    const roundTripped = parseScenarioTrace(JSON.parse(serializeScenarioTrace(stored!)));
    expect(roundTripped).toEqual(stored);
  });

  it("keeps the drive's identity: same scenario, same kind, same duration", () => {
    const raw = recordAttempt(47.3);
    const stored = compactTraceForStorage(raw)!;

    expect(stored.meta.scenarioId).toBe(raw.meta.scenarioId);
    expect(stored.meta.kind).toBe("attempt");
    // The tail is PINNED to the real end of the drive — a decimated tail would
    // quietly shorten the student's own reel.
    expect(stored.meta.durationSec).toBeCloseTo(raw.meta.durationSec, 2);
    expect(stored.samples[stored.samples.length - 1].tSec).toBe(stored.meta.durationSec);
  });

  it("decimates a long drive instead of truncating it", () => {
    // 400 s at 20 Hz = 8,001 raw samples — well past the ceiling.
    const raw = recordAttempt(400);
    const stored = compactTraceForStorage(raw)!;

    expect(stored.samples.length).toBeLessThanOrEqual(MAX_STORED_SAMPLES);
    // …and it still covers the WHOLE drive. If this ever regresses to a
    // `.slice(0, MAX)` the last minutes of every long attempt — the part a
    // student most often wants to re-watch — silently stop existing.
    expect(stored.meta.durationSec).toBeCloseTo(raw.meta.durationSec, 2);
  });

  it("rounds to renderable precision only", () => {
    const raw = recordAttempt(10);
    const stored = compactTraceForStorage(raw)!;
    const s = stored.samples[5];
    const r = raw.samples.find((x) => Math.abs(x.tSec - s.tSec) < 1e-9)!;

    expect(s.x).toBeCloseTo(r.x, 2); // 1 cm
    expect(s.y).toBeCloseTo(r.y, 2);
    expect(s.headingDeg).toBeCloseTo(r.headingDeg, 1); // 0.1°
    expect(s.speedKmh).toBeCloseTo(r.speedKmh, 1);
    // Discrete channels are carried verbatim — rounding a gear would be a bug.
    expect(s.gear).toBe(r.gear);
    expect(s.indicator).toBe(r.indicator);
    expect(s.brakeOn).toBe(r.brakeOn);
  });

  it("holds tSec strictly ascending through a stuttering feed", () => {
    // A tab that stalls (pause menu, GC) and then floods: the recorder
    // re-anchors, so two kept samples can land inside one centisecond. parse.ts
    // demands STRICTLY ascending — a collision must drop, not poison the trace.
    const rec = createTraceRecorder({ scenarioId: "sc-stutter@L1", kind: "attempt" });
    const times = [0, 0.05, 0.1, 0.1001, 0.1002, 0.3, 0.5, 0.500_4, 0.7, 0.9, 1.1];
    for (const t of times) {
      rec.push({
        tSec: t,
        x: t,
        y: 0,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: 10,
        gear: 1,
        indicator: "off",
        brakeOn: false,
        throttleOn: true,
      });
    }
    const stored = compactTraceForStorage(rec.finish()!)!;
    for (let i = 1; i < stored.samples.length; i++) {
      expect(stored.samples[i].tSec).toBeGreaterThan(stored.samples[i - 1].tSec);
    }
    expect(parseScenarioTrace(stored)).not.toBeNull();
  });

  it("is deterministic — the same drive reduces to the same bytes", () => {
    const raw = recordAttempt(30, 20, 42);
    expect(serializeScenarioTrace(compactTraceForStorage(raw)!)).toBe(
      serializeScenarioTrace(compactTraceForStorage(raw)!),
    );
  });

  it("refuses a trace there is nothing to store of", () => {
    const raw = recordAttempt(10);
    expect(compactTraceForStorage({ ...raw, samples: raw.samples.slice(0, 1) })).toBeNull();
    // Two samples at the same instant: no span to decimate over.
    expect(
      compactTraceForStorage({
        ...raw,
        samples: [raw.samples[0], { ...raw.samples[0], tSec: raw.samples[0].tSec }],
      }),
    ).toBeNull();
  });

  it("fits the upload budget a 4G phone actually has", () => {
    // The concrete cost the reduction exists to pay down: a 60 s drill is
    // uploaded from the student's phone as a server-action payload.
    const raw = recordAttempt(60);
    const rawBytes = serializeScenarioTrace(raw).length;
    const storedBytes = serializeScenarioTrace(compactTraceForStorage(raw)!).length;

    expect(storedBytes).toBeLessThan(rawBytes / 2);
    expect(storedBytes).toBeLessThan(120 * 1024);
  });
});
