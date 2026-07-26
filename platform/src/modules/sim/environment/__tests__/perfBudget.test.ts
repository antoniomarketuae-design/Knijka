/**
 * perfBudget — the §2.2 envelope as data, and the scoring that turns a drive
 * on a physical device into the artifact doc 82 §6.2 gates P2–P8 on.
 *
 * The tests worth writing here are the ones that keep the gate HONEST: a run
 * that decayed must not pass on its average, an unmeasured load must not score
 * as a fast one, and a run whose context died must never read green.
 */
import { describe, expect, it } from "vitest";
import {
  PERF_BUDGETS,
  buildPerfReport,
  formatPerfReportMarkdown,
  type PerfRunInput,
  type PerfWindowSample,
} from "../perfBudget";

function window_(over: Partial<PerfWindowSample> = {}): PerfWindowSample {
  return {
    atS: 1,
    fps: 30,
    drawsPerFrame: 55,
    trisPerFrame: 180_000,
    worstFrameMs: 40,
    programs: 42,
    ...over,
  };
}

function run(over: Partial<PerfRunInput> = {}): PerfRunInput {
  return {
    tier: "low",
    scene: "d2-v1 city run",
    glRenderer: "Mali-G57 MP2",
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A165F)",
    viewport: "891×411",
    drawingBuffer: "891×411",
    devicePixelRatio: 2.625,
    appliedDpr: 1,
    hardwareConcurrency: 8,
    deviceMemoryGb: 4,
    firstFrameMs: null,
    domContentLoadedMs: null,
    scriptTransferBytes: null,
    totalTransferBytes: null,
    jsHeapBytes: null,
    windows: Array.from({ length: 10 }, (_, i) => window_({ atS: i + 1 })),
    contextLossCount: 0,
    recordedAt: "2026-07-26T00:00:00.000Z",
    ...over,
  };
}

function metric(input: PerfRunInput, id: string) {
  const found = buildPerfReport(input).metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no metric ${id}`);
  return found;
}

describe("PERF_BUDGETS", () => {
  it("carries the doc 82 §2.2 phone column verbatim", () => {
    const low = PERF_BUDGETS.low;
    expect(low.fpsTarget).toBe(30); // a flat 30, not a chased 60 (§7.3 #13)
    expect(low.fpsFloor).toBe(24);
    expect(low.drawCalls).toBe(70);
    expect(low.drawCallsHardCap).toBe(100);
    expect(low.triangles).toBe(250_000);
    expect(low.textureVramMb).toBe(80);
    expect(low.firstPlayableMb).toBe(3.5);
    expect(low.jsGzKb).toBe(500);
  });

  it("relaxes monotonically from phone to desktop", () => {
    const { low, med, high } = PERF_BUDGETS;
    expect(low.drawCalls).toBeLessThan(med.drawCalls);
    expect(med.drawCalls).toBeLessThan(high.drawCalls);
    expect(low.triangles).toBeLessThan(med.triangles);
    expect(med.triangles).toBeLessThan(high.triangles);
    expect(low.firstPlayableMb).toBeLessThan(med.firstPlayableMb);
  });
});

describe("buildPerfReport", () => {
  it("passes a flat 30 fps phone run inside the draw/triangle budget", () => {
    const report = buildPerfReport(run());
    expect(report.verdict).toBe("pass");
    expect(report.fps.median).toBeCloseTo(30, 5);
  });

  it("fails a run that DECAYS even though every other line passes", () => {
    // 45 → 25: median 33.5 (above the 30 target), minimum 25 (above the 24
    // floor), draws and triangles untouched. Nothing in the table separates it
    // from a locked 30 — except the ratio §7.3 #13 is actually about.
    const decaying = run({
      windows: [45, 44, 42, 38, 33, 30, 28, 26, 25, 25].map((fps, i) =>
        window_({ atS: i + 1, fps }),
      ),
    });
    const report = buildPerfReport(decaying);
    expect(report.fps.median).toBeGreaterThan(PERF_BUDGETS.low.fpsTarget);
    expect(metric(decaying, "fps-min").verdict).toBe("pass");
    expect(report.fps.decay).toBeLessThan(0.75);
    expect(metric(decaying, "fps-stability").verdict).toBe("fail");
    expect(report.verdict).toBe("fail");
  });

  it("does not report decay on a run too short to divide into thirds", () => {
    // A ratio computed from one or two windows fires on noise, and a metric
    // that fires on noise is worse than no metric.
    const short = run({ windows: [window_(), window_({ atS: 2, fps: 20 })] });
    expect(buildPerfReport(short).fps.decay).toBeNull();
    expect(buildPerfReport(short).metrics.map((m) => m.id)).not.toContain("fps-stability");
    expect(formatPerfReportMarkdown(buildPerfReport(short))).toContain(
      "Thermal decay not reported",
    );
  });

  it("passes a flat run's stability line", () => {
    const report = buildPerfReport(run());
    expect(report.fps.decay).toBeCloseTo(1, 5);
    expect(metric(run(), "fps-stability").verdict).toBe("pass");
  });

  it("warns past the soft draw budget and fails past the hard cap", () => {
    expect(metric(run({ windows: [window_({ drawsPerFrame: 70 })] }), "draws").verdict).toBe(
      "pass",
    );
    expect(metric(run({ windows: [window_({ drawsPerFrame: 85 })] }), "draws").verdict).toBe(
      "warn",
    );
    expect(metric(run({ windows: [window_({ drawsPerFrame: 140 })] }), "draws").verdict).toBe(
      "fail",
    );
  });

  it("fails outright on a lost WebGL context, whatever the frame rate said", () => {
    const died = run({ contextLossCount: 1 });
    expect(metric(died, "context-loss").verdict).toBe("fail");
    expect(buildPerfReport(died).verdict).toBe("fail");
  });

  it("omits boot metrics the browser never measured rather than scoring them 0", () => {
    // An unmeasured load scored as 0 ms would turn the gate that has never
    // been run (68_ALPHA_RECONSTRUCTION_PLAN:191) into an automatic green.
    const ids = buildPerfReport(run()).metrics.map((m) => m.id);
    expect(ids).not.toContain("first-frame");
    expect(ids).not.toContain("wire");
    expect(ids).not.toContain("js-wire");

    const measured = run({
      firstFrameMs: 6_400,
      totalTransferBytes: 3_100_000,
      scriptTransferBytes: 470_000,
    });
    expect(metric(measured, "first-frame").verdict).toBe("pass");
    expect(metric(measured, "wire").verdict).toBe("pass");
    expect(metric(measured, "js-wire").verdict).toBe("pass");
    expect(metric(run({ firstFrameMs: 13_000 }), "first-frame").verdict).toBe("fail");
  });

  it("scores each tier against its own column", () => {
    // 150 draws is the med budget line and 2× the phone one.
    const windows = [window_({ drawsPerFrame: 150, fps: 60, trisPerFrame: 600_000 })];
    expect(metric(run({ tier: "med", windows }), "draws").verdict).toBe("pass");
    expect(metric(run({ tier: "low", windows }), "draws").verdict).toBe("fail");
  });
});

describe("formatPerfReportMarkdown", () => {
  it("is self-contained: device, budget column, verdict and every window", () => {
    const input = run({ firstFrameMs: 6_400, totalTransferBytes: 3_100_000 });
    const md = formatPerfReportMarkdown(buildPerfReport(input));
    // The artifact has to still mean something after §2.2 is retuned, so it
    // restates what it was scored against and what produced it.
    expect(md).toContain(PERF_BUDGETS.low.reference);
    expect(md).toContain(input.userAgent);
    expect(md).toContain("Mali-G57 MP2");
    expect(md).toContain("d2-v1 city run");
    expect(md).toContain("PASS");
    // One row per per-second window, so a decay is visible by eye.
    for (const w of input.windows) expect(md).toContain(`| ${w.atS.toFixed(0)} |`);
  });

  it("says so when the GL renderer string is unavailable, rather than omitting it", () => {
    const md = formatPerfReportMarkdown(buildPerfReport(run({ glRenderer: null })));
    expect(md).toContain("(unavailable)");
  });
});
