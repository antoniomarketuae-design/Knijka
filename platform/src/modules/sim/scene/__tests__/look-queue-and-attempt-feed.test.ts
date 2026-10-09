/**
 * sc-roundabout-entry:7b747c15 round 8 — the two small pieces a look and the
 * attempt trace pass through on their way to the grade:
 *
 *  §1 `GlanceSampleQueue` (scene/cabin.ts) — the cabin's own queue of latched
 *     looks, and `CabinControls` holding it: a press latches one, a frame's
 *     sample builder takes one, a live lesson's grid takes the rest, a respawn
 *     forgets what is left.
 *  §2 `feedAttemptPoint` (scene/attemptFeed.ts) — the student's attempt trace
 *     fed once per graded grid point, from the grid point's own student state.
 *     The rubric's observation moments are scored from that trace
 *     (lessons/scenario/observation.ts), so §2 ends on the score itself.
 *
 * The queue inside the grid is scene/__tests__/grade-grid.test.ts; the scene's
 * own lines run in lessons/scenario/__tests__/live-grade-call.execution.test.ts;
 * the committed demos on six cadences are
 * lessons/scenario/__tests__/grade-grid-cadence.census.test.ts.
 */

import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { parkingObservationFromTrace } from "../../lessons/scenario/observation";
import { createTraceRecorder } from "../../traces/recorder";
import { FIXED_DT } from "../../vehicle/tuning";
import { createAttemptFeedState, feedAttemptPoint } from "../attemptFeed";
import { CabinControls, GLANCE_SAMPLE_QUEUE_CAPACITY, GlanceSampleQueue } from "../cabin";
import { createGradeGridSample } from "../gradeGrid";

const H = FIXED_DT;

function withWindow<T>(fn: () => T): T {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const prev = g.window;
  g.window = { addEventListener() {}, removeEventListener() {} };
  try {
    return fn();
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

describe("§1 the cabin's look queue", () => {
  it("first in, first out, each look taken exactly once; four wait, the fifth is dropped; `clear` forgets the rest", () => {
    expect(GLANCE_SAMPLE_QUEUE_CAPACITY).toBe(4);
    const q = new GlanceSampleQueue();
    expect(q.take()).toBeNull();
    q.push("left");
    q.push("right");
    expect(q.length).toBe(2);
    expect(q.take()).toBe("left");
    expect(q.take()).toBe("right");
    expect(q.take()).toBeNull();
    for (const look of ["rear", "left", "shoulder", "right", "left"] as const) q.push(look);
    expect(q.length).toBe(4);
    expect([q.take(), q.take(), q.take(), q.take(), q.take()]).toEqual(["rear", "left", "shoulder", "right", null]);
    q.push("rear");
    q.push("left");
    q.clear();
    expect(q.length).toBe(0);
    expect(q.take()).toBeNull();
  });

  it("CabinControls: two keys pressed between two frames are both latched — the sample builder's one take leaves the second for the grid; a held look is one look", () => {
    withWindow(() => {
      const cabin = new CabinControls({}, "ready", "off");
      cabin.glanceStart("left");
      cabin.glanceStart("left"); // key repeat on a held key: the same look
      cabin.glanceEnd("left");
      cabin.glanceStart("right");
      cabin.glanceEnd("right");
      // The frame: VehicleSample builder takes one…
      expect(cabin.consumeGlanceSample()).toBe("left");
      // …and the grid's `moreLooks` hook drains what is left, then null.
      expect(cabin.consumeGlanceSample()).toBe("right");
      expect(cabin.consumeGlanceSample()).toBeNull();
      cabin.dispose();
    });
  });

  it("CabinControls.forgetPendingGlances (a respawn): looks latched and not yet handed to a frame are gone; a look made after it is latched as ever", () => {
    withWindow(() => {
      const cabin = new CabinControls({}, "ready", "off");
      cabin.glance("rear");
      cabin.glanceStart("left");
      cabin.glanceEnd("left");
      cabin.forgetPendingGlances();
      expect(cabin.consumeGlanceSample(), "a look made before the respawn").toBeNull();
      cabin.glanceStart("right");
      expect(cabin.consumeGlanceSample()).toBe("right");
      cabin.dispose();
    });
  });
});

describe("§2 the attempt trace's feed, one graded grid point at a time", () => {
  /** The student at grid point k of a little drive: forward, reverse from
   *  grid point 361 (6.02 s) up to point 841 (14.02 s), forward again. Both
   *  lever changes fall ON a grid point the ring keeps (1, 4, 7, …), and so
   *  does one indicator edge: a feed that read the lever or the stalk of the
   *  point before would put the wrong one into a kept sample. */
  function studentAt(k: number, look: VehicleSample["mirrorGlance"]): VehicleSample {
    const t = k * H;
    const s = createGradeGridSample();
    s.position.x = 100 + t;
    s.position.y = 200 - 2 * t;
    s.headingDeg = (t * 3) % 360;
    s.speedKmh = 7 + t;
    s.gear = k >= 361 && k < 841 ? -1 : 1;
    s.indicator = k >= 121 && k < 240 ? "left" : t >= 9 && t < 10 ? "right" : "off";
    s.mirrorGlance = look;
    return s;
  }
  type Look = NonNullable<VehicleSample["mirrorGlance"]>;
  const MOMENTS = [
    { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
    { id: "obs-during-reverse", titleBg: "Оглед по време на движението назад" },
    { id: "obs-final-check", titleBg: "Последна проверка преди спиране" },
  ] as never;

  function record(looksAtK: Record<number, Look>, upToK = 1200) {
    const recorder = createTraceRecorder({ scenarioId: "sc-test@L1", kind: "attempt" });
    const state = createAttemptFeedState();
    for (let k = 1; k <= upToK; k++) {
      feedAttemptPoint(recorder, state, k * H, studentAt(k, looksAtK[k] ?? null), 0.25, k % 2 === 0, k % 3 === 0);
    }
    return recorder.finish();
  }

  it("each point is pushed with the grid point's time and the student's pose, heading, speed, lever and stalk; the ring keeps every third (20 Hz)", () => {
    const trace = record({});
    expect(trace).not.toBeNull();
    const samples = trace!.samples;
    expect(samples.length).toBe(400);
    for (let i = 0; i < samples.length; i++) {
      const k = 1 + 3 * i;
      const due = studentAt(k, null);
      expect(samples[i].tSec).toBeCloseTo((k - 1) * H, 9); // rebased on the first sample
      expect([samples[i].x, samples[i].y, samples[i].headingDeg, samples[i].speedKmh, samples[i].gear, samples[i].indicator]).toEqual([
        due.position.x,
        due.position.y,
        due.headingDeg,
        due.speedKmh,
        due.gear,
        due.indicator,
      ]);
      expect([samples[i].steerRad, samples[i].brakeOn, samples[i].throttleOn]).toEqual([0.25, k % 2 === 0, k % 3 === 0]);
    }
    // Teeth: the kept samples do straddle both lever changes and a stalk edge.
    const gearAt = (k: number) => samples[(k - 1) / 3].gear;
    expect([gearAt(358), gearAt(361), gearAt(838), gearAt(841)]).toEqual([1, -1, -1, 1]);
    expect([samples[(118 - 1) / 3].indicator, samples[(121 - 1) / 3].indicator]).toEqual(["off", "left"]);
  });

  it("a look the point HEARD becomes a `glance-…` event at that point's time, once; the indicator's edges become signal events at the point they changed on", () => {
    const trace = record({ 100: "left", 101: "shoulder", 700: "rear" })!;
    const at = (tSec: number) => Math.round((tSec + H) / H);
    expect(trace.events.filter((e) => e.kind.startsWith("glance-")).map((e) => `${e.kind}@${at(e.tSec)}`)).toEqual([
      "glance-left@100",
      "glance-shoulder@101",
      "glance-rear@700",
    ]);
    expect(trace.events.filter((e) => e.kind.startsWith("signal-")).map((e) => `${e.kind}:${e.detail ?? ""}@${at(e.tSec)}`)).toEqual([
      "signal-on:left@121",
      "signal-off:@240",
      "signal-on:right@540",
      "signal-off:@600",
    ]);
  });

  it("…and that is what the rubric's observation moments are scored from: the same looks at the same grid points give the same moments; a look one frame of a phone later gives others", () => {
    // Reverse runs from 6.02 s to 14.02 s: a look at 5 s (before), 9 s
    // (during), 13.5 s (the pre-stop check).
    const k = (tSec: number) => Math.round(tSec / H);
    const all = record({ [k(5)]: "rear", [k(9)]: "left", [k(13.5)]: "right" })!;
    expect(parkingObservationFromTrace(all, MOMENTS)?.observedMomentIds).toEqual([
      "obs-before-reverse",
      "obs-during-reverse",
      "obs-final-check",
    ]);
    // WHEN the look is heard is what is scored: the «during» look heard half a
    // second before the lever went into R is not a look while reversing.
    const early = record({ [k(5)]: "rear", [k(5.6)]: "left", [k(13.5)]: "right" })!;
    expect(parkingObservationFromTrace(early, MOMENTS)?.observedMomentIds).toEqual([
      "obs-before-reverse",
      "obs-final-check",
    ]);
    // No look at all in the trace: the moments are measured and empty.
    expect(parkingObservationFromTrace(record({})!, MOMENTS)?.observedMomentIds).toEqual([]);
  });
});
