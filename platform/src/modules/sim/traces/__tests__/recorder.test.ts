/**
 * Recorders — the live ring recorder's cadence/overflow behavior and the
 * scripted headless recorder driving the PRODUCTION stack on the полигон
 * (the S0-View demo script): 20 Hz cadence, event capture, innocence
 * (zero violations — the doc 76 §5 shadow gate), determinism, and playback
 * agreement between sampleAt and the recorded route.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPoligonGhostDemo,
  createTraceRecorder,
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  serializeScenarioTrace,
  traceAnnotations,
} from "..";

const poligonRaw: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../../../content/world/poligon-v1.json", import.meta.url)),
    "utf8",
  ),
);

// ---------------------------------------------------------------------------
// Live ring recorder
// ---------------------------------------------------------------------------

describe("createTraceRecorder (live ring)", () => {
  const frame = (tSec: number, x = tSec * 5) => ({
    tSec,
    x,
    y: 0,
    headingDeg: 90,
    steerRad: 0,
    speedKmh: 18,
    gear: 1,
    indicator: "off" as const,
    brakeOn: false,
    throttleOn: true,
  });

  it("decimates a 60 Hz feed to ~20 Hz and rebases t to zero", () => {
    const rec = createTraceRecorder({ scenarioId: "sc-live", kind: "attempt" });
    for (let i = 0; i <= 180; i++) rec.push(frame(10 + i / 60)); // 3 s from t=10
    const trace = rec.finish();
    expect(trace).not.toBeNull();
    expect(trace!.samples[0].tSec).toBe(0);
    expect(trace!.meta.durationSec).toBeCloseTo(3, 1);
    // ~20 Hz over 3 s ⇒ ~60 samples (scheduled decimation, jitter allowed).
    expect(trace!.samples.length).toBeGreaterThanOrEqual(55);
    expect(trace!.samples.length).toBeLessThanOrEqual(65);
    // Strictly ascending — parse accepts it.
    expect(parseScenarioTrace(JSON.parse(serializeScenarioTrace(trace!)))).toEqual(trace);
  });

  it("ring overflow keeps the NEWEST window and drops events before it", () => {
    const rec = createTraceRecorder({
      scenarioId: "sc-ring",
      kind: "attempt",
      maxDurationSec: 1, // capacity = 20 samples
    });
    rec.addEvent("annotation", 0.5, "стар — извън прозореца");
    rec.addEvent("annotation", 4.5, "нов — вътре");
    for (let i = 0; i <= 300; i++) rec.push(frame(i / 60)); // 5 s
    const trace = rec.finish()!;
    expect(trace.samples.length).toBe(20);
    // The retained window is the last ~1 s of the 5 s feed.
    expect(trace.meta.durationSec).toBeLessThanOrEqual(1.01);
    const t0 = 5 - trace.meta.durationSec;
    expect(trace.samples[0].x).toBeCloseTo(t0 * 5, 0);
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].textBg).toBe("нов — вътре");
    expect(trace.events[0].tSec).toBeCloseTo(4.5 - t0, 1);
  });

  it("returns null under two samples and records again after reset", () => {
    const rec = createTraceRecorder({ scenarioId: "sc-empty", kind: "attempt" });
    expect(rec.finish()).toBeNull();
    rec.push(frame(0));
    expect(rec.finish()).toBeNull();
    rec.reset();
    rec.push(frame(0));
    rec.push(frame(0.1));
    expect(rec.finish()).not.toBeNull();
    expect(rec.sampleCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scripted headless recorder — the полигон demo through the production stack
// ---------------------------------------------------------------------------

describe("recordScriptedDrive (полигон ghost demo)", () => {
  const demo = buildPoligonGhostDemo(poligonRaw);

  it("produces a valid, parseable v1 trace at an exact 20 Hz cadence", () => {
    const parsed = parseScenarioTrace(JSON.parse(serializeScenarioTrace(demo.trace)));
    expect(parsed).toEqual(demo.trace);
    expect(demo.trace.meta.kind).toBe("shadow");
    const s = demo.trace.samples;
    expect(s.length).toBeGreaterThan(200); // a ~20+ s drive
    // Exact 20 Hz grid — except the final closing sample, which captures the
    // very last pose and may land inside the last grid cell.
    for (let i = 1; i < s.length - 1; i++) {
      expect(s[i].tSec - s[i - 1].tSec).toBeCloseTo(0.05, 3);
    }
    const lastDt = s[s.length - 1].tSec - s[s.length - 2].tSec;
    expect(lastDt).toBeGreaterThan(0);
    expect(lastDt).toBeLessThanOrEqual(0.05 + 1e-6);
    expect(demo.trace.meta.durationSec).toBeCloseTo(s[s.length - 1].tSec, 6);
  });

  it("drives the authored route: east straight → left corner → apron stop", () => {
    const s = demo.trace.samples;
    const first = s[0];
    const last = s[s.length - 1];
    expect(first.x).toBeCloseTo(24, 0);
    expect(first.y).toBeCloseTo(-134.06, 0);
    expect(Math.round(first.headingDeg)).toBe(90); // east
    expect(last.x).toBeCloseTo(99.06, 0);
    expect(last.y).toBeCloseTo(-80, 0);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.1); // at rest
    expect(last.brakeOn).toBe(true); // holding the brake in the final pause
    // Heading at the end is north (0°) after the left turn.
    const northish = last.headingDeg < 5 || last.headingDeg > 355;
    expect(northish).toBe(true);
    // The apron leg respects its 20 km/h limit.
    for (const smp of s) expect(smp.speedKmh).toBeLessThanOrEqual(25.01);
  });

  it("captures the sparse events: annotations, glances, signal on/off", () => {
    const kinds = demo.trace.events.map((e) => e.kind);
    expect(traceAnnotations(demo.trace)).toHaveLength(4);
    expect(kinds).toContain("glance-rear");
    expect(kinds).toContain("glance-left");
    const on = demo.trace.events.find((e) => e.kind === "signal-on");
    expect(on?.detail).toBe("left");
    expect(kinds).toContain("signal-off");
    // Events are chronological and inside the trace span.
    for (let i = 1; i < demo.trace.events.length; i++) {
      expect(demo.trace.events[i].tSec).toBeGreaterThanOrEqual(demo.trace.events[i - 1].tSec);
    }
    expect(demo.trace.events[demo.trace.events.length - 1].tSec).toBeLessThanOrEqual(
      demo.trace.meta.durationSec + 1e-6,
    );
  });

  it("the indicator is ON through the corner and OFF at the end", () => {
    const s = demo.trace.samples;
    // Mid-corner sample: heading between 30° and 60° (east→north left turn).
    const mid = s.find((p) => p.headingDeg > 30 && p.headingDeg < 60);
    expect(mid?.indicator).toBe("left");
    expect(s[s.length - 1].indicator).toBe("off");
  });

  it("THE SHADOW GATE: the demo replays through the rule engine innocent", () => {
    const violations = demo.ruleEvents.filter((e) => e.kind === "violation");
    expect(violations.map((v) => `${v.code}@${v.t.toFixed(1)}`)).toEqual([]);
  });

  it("is deterministic: two recordings are bit-identical", () => {
    const again = buildPoligonGhostDemo(poligonRaw);
    expect(JSON.stringify(again.trace)).toBe(JSON.stringify(demo.trace));
    expect(JSON.stringify(again.ruleEvents)).toBe(JSON.stringify(demo.ruleEvents));
  });

  it("sampleAt agrees with the recorded route between samples", () => {
    const s = demo.trace.samples;
    const out = createTracePoint();
    // Probe 50 midpoints spread over the drive: the interpolated position
    // must sit between (and collinear with) its bracketing samples.
    for (let k = 1; k < 50; k++) {
      const i = Math.floor((k / 50) * (s.length - 1));
      const a = s[i];
      const b = s[i + 1];
      const tMid = (a.tSec + b.tSec) / 2;
      sampleAt(demo.trace, tMid, out);
      expect(out.x).toBeCloseTo((a.x + b.x) / 2, 6);
      expect(out.y).toBeCloseTo((a.y + b.y) / 2, 6);
      // Speed lerps too.
      expect(out.speedKmh).toBeCloseTo((a.speedKmh + b.speedKmh) / 2, 6);
      // Discrete state comes from a real sample, never invented.
      expect([a.indicator, b.indicator]).toContain(out.indicator);
      expect([a.gear, b.gear]).toContain(out.gear);
    }
  });
});
