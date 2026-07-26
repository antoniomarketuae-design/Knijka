// The performance ENVELOPE, as data — doc 82 §2.2, and the scoring that turns
// a drive on a real device into the artifact §6.2 gates every later phase on.
//
// WHY THIS IS A MODULE AND NOT A CONSOLE.LOG. `68_ALPHA_RECONSTRUCTION_PLAN.md:191`
// ("runs on a mid-range Android: 30+ fps median at tier-low, <10 s load") has
// been unchecked since it was written, and there is no .har, Lighthouse run or
// trace in the repo. Every number in §2.2 is a PREDICTION until a log from a
// physical Galaxy A16 sits in docs/. A prediction is falsified by a
// measurement, not by a recollection of one — so the probe has to emit
// something committable, with the budget it was scored against baked in, or
// the next reader cannot tell a pass from a hopeful memory.
//
// WHAT IT MEASURES, AND WHY THOSE THINGS (§2.1). The phone is a weak CPU, not
// a weak GPU: at dpr 1.0 in landscape a Mali-G57 MP2 has roughly the laptop's
// shading headroom per pixel. Its real deficits are draw-call submission,
// JS parse/compile and memory. So the report leads with frame-time
// PERCENTILES (a flat 30 and a 45→25 decay have the same mean), draw calls and
// triangles per frame, and the boot timings — not with an average fps.
//
// Pure: no DOM, no three.js, no React. PerfProbe.tsx collects, this scores.

/** The three tiers, named as the budget table names them. */
export type PerfTier = "low" | "med" | "high";

/**
 * One tier's budget — the §2.2 column, verbatim.
 *
 * `fpsTarget` / `fpsFloor`: the phone is budgeted for a FLAT 30, not a chased
 * 60 (§7.3 #13 — the 25,771-tri cockpit, the mirror pass and Rapier at 60 Hz
 * make 33.3 ms the honest frame budget, and a locked 30 halves heat).
 * `drawCalls` / `triangles`: the soft budget; `drawCallsHardCap` /
 * `trianglesHardCap` are the numbers that mean "stop and fix it".
 * Both are per FRAME and INCLUDE the mirror pass and the composer's internal
 * passes — which is exactly what PerfProbe's manual gl.info accounting buys.
 */
export interface PerfBudget {
  tier: PerfTier;
  /** The device class the column was written for. */
  reference: string;
  fpsTarget: number;
  fpsFloor: number;
  drawCalls: number;
  drawCallsHardCap: number;
  triangles: number;
  trianglesHardCap: number;
  /** Transcoded + mips, MB. Not measurable from JS — reported as context. */
  textureVramMb: number;
  /** First-playable wire budget, MB (§2.2 bottom row). */
  firstPlayableMb: number;
  /** Of which JS, gzipped, KB. The §2.1 parse-time constraint. */
  jsGzKb: number;
}

export const PERF_BUDGETS: Record<PerfTier, PerfBudget> = {
  low: {
    tier: "low",
    reference: "Galaxy A16 / Redmi Note — Mali-G57 MP2 or Adreno 619, 4 GB, 891×411 @ dpr 1.0",
    fpsTarget: 30,
    fpsFloor: 24,
    drawCalls: 70,
    drawCallsHardCap: 100,
    triangles: 250_000,
    trianglesHardCap: 300_000,
    textureVramMb: 80,
    firstPlayableMb: 3.5,
    jsGzKb: 500,
  },
  med: {
    tier: "med",
    reference: "Iris Xe G7 96EU laptop — 1920×1080 @ dpr 1.0–1.25",
    fpsTarget: 60,
    fpsFloor: 45,
    drawCalls: 150,
    drawCallsHardCap: 250,
    triangles: 700_000,
    trianglesHardCap: 900_000,
    textureVramMb: 220,
    firstPlayableMb: 9,
    jsGzKb: 1_200,
  },
  high: {
    tier: "high",
    reference: "Discrete GPU — 1920×1080 @ dpr 1.5",
    fpsTarget: 60,
    fpsFloor: 50,
    drawCalls: 300,
    drawCallsHardCap: 400,
    triangles: 1_500_000,
    trianglesHardCap: 2_000_000,
    textureVramMb: 512,
    firstPlayableMb: 12,
    jsGzKb: 1_800,
  },
};

/** One second of accumulated frames — what PerfProbe pushes once per window. */
export interface PerfWindowSample {
  /** Seconds since the probe started (window END). */
  atS: number;
  fps: number;
  /** Mean draw calls per frame across the window, all passes. */
  drawsPerFrame: number;
  /** Mean triangles per frame across the window, all passes. */
  trisPerFrame: number;
  /** Worst single frame time in the window, ms — the hitch detector. */
  worstFrameMs: number;
  /** Compiled shader programs live at the end of the window. */
  programs: number;
}

/** How a measured value compares to its budget line. */
export type PerfMetricVerdict = "pass" | "warn" | "fail";

/** One scored line of the report. */
export interface PerfMetric {
  id: string;
  /** Bulgarian-free: this artifact is read by the founder and by Claude. */
  label: string;
  measured: string;
  budget: string;
  verdict: PerfMetricVerdict;
}

/** Everything the probe knows at report time. */
export interface PerfRunInput {
  tier: PerfTier;
  /** Free-text scene id so two runs are comparable ("d2-v1 city run"). */
  scene: string;
  /** UNMASKED_RENDERER_WEBGL, or null when the debug extension is blocked. */
  glRenderer: string | null;
  /** navigator.userAgent — the only way to prove which device produced this. */
  userAgent: string;
  /** CSS viewport, "w×h". */
  viewport: string;
  /** Drawing buffer, "w×h" — viewport × the applied dpr. */
  drawingBuffer: string;
  devicePixelRatio: number;
  /** The dpr the tier actually applied (QUALITY_PRESETS[tier].maxDpr clamp). */
  appliedDpr: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  /** navigationStart → first rendered frame, ms. The "<10 s load" gate. */
  firstFrameMs: number | null;
  /** navigationStart → DOMContentLoaded, ms. Dominated by JS parse (§2.1). */
  domContentLoadedMs: number | null;
  /** Transferred bytes of every script resource — the parse-cost proxy. */
  scriptTransferBytes: number | null;
  /** Transferred bytes of everything, first-playable wire weight. */
  totalTransferBytes: number | null;
  /** performance.memory.usedJSHeapSize at report time, bytes (Chromium only). */
  jsHeapBytes: number | null;
  /** Per-second windows, in order. */
  windows: readonly PerfWindowSample[];
  /** Context-loss log at report time — a run that died is not a pass. */
  contextLossCount: number;
  /** Wall-clock ISO timestamp of the report. */
  recordedAt: string;
}

/** The scored run. */
export interface PerfReport {
  input: PerfRunInput;
  budget: PerfBudget;
  /** Frame-time percentiles across every window, ms. */
  frameMs: { p50: number; p95: number; worst: number };
  /**
   * `decay` = median fps of the last third ÷ median fps of the first third.
   * 1.0 = flat, 0.55 = the 45→25 curve §7.3 #13 warns about. null until there
   * are enough windows (MIN_DECAY_WINDOWS) for the ratio to mean anything.
   */
  fps: { median: number; min: number; decay: number | null };
  draws: { median: number; max: number };
  tris: { median: number; max: number };
  metrics: PerfMetric[];
  /** Worst verdict across `metrics` — the one-word answer. */
  verdict: PerfMetricVerdict;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Nearest-rank percentile (p in 0..1). Small samples: no interpolation. */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * s.length));
  return s[rank - 1];
}

/** worse of two verdicts. */
function worst(a: PerfMetricVerdict, b: PerfMetricVerdict): PerfMetricVerdict {
  const rank = { pass: 0, warn: 1, fail: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/**
 * `value` against a soft budget and a hard cap, lower-is-better.
 * ≤ soft = pass, ≤ hard = warn, above = fail.
 */
function scoreCeiling(value: number, soft: number, hard: number): PerfMetricVerdict {
  if (value <= soft) return "pass";
  if (value <= hard) return "warn";
  return "fail";
}

/** `value` against a target and a floor, higher-is-better. */
function scoreFloor(value: number, target: number, floor: number): PerfMetricVerdict {
  if (value >= target) return "pass";
  if (value >= floor) return "warn";
  return "fail";
}

function mb(bytes: number): number {
  return bytes / 1_000_000;
}

/**
 * Windows needed before the thermal-decay ratio is reported at all. Below this
 * the "first third" and "last third" are one or two samples of noise, and a
 * measurement that fires on noise is worse than none.
 */
export const MIN_DECAY_WINDOWS = 9;

/**
 * Last-third fps ÷ first-third fps. This is the metric §7.3 #13 is actually
 * about: "budget for a FLAT 30, not a decaying 45→25". Both of those runs have
 * a median above 30 and a minimum above the floor, so nothing else in the
 * table separates them — and they are completely different products to drive.
 */
function fpsDecayRatio(fpsValues: readonly number[]): number | null {
  if (fpsValues.length < MIN_DECAY_WINDOWS) return null;
  const third = Math.floor(fpsValues.length / 3);
  const head = median(fpsValues.slice(0, third));
  const tail = median(fpsValues.slice(-third));
  if (head <= 0) return null;
  return tail / head;
}

/**
 * Score a run against its tier's budget.
 *
 * The fps line is scored on the MEDIAN of the per-second windows, not the
 * mean, and the p95 frame time is scored separately — because §7.3 #13's whole
 * point is that a flat 30 and a 45→25 decay are different products even when
 * they average the same. `min fps` and `worst frame` ride along as context so
 * one stall does not fail an otherwise flat run on its own.
 */
export function buildPerfReport(input: PerfRunInput): PerfReport {
  const budget = PERF_BUDGETS[input.tier];
  const windows = input.windows;
  const fpsValues = windows.map((w) => w.fps);
  const drawValues = windows.map((w) => w.drawsPerFrame);
  const triValues = windows.map((w) => w.trisPerFrame);
  // A window's mean frame time is the honest per-window sample; the worst
  // single frame is tracked separately because it is a different question.
  const frameMsValues = windows.map((w) => (w.fps > 0 ? 1000 / w.fps : 0));

  const fpsMedian = median(fpsValues);
  const fpsMin = fpsValues.length > 0 ? Math.min(...fpsValues) : 0;
  const drawsMedian = median(drawValues);
  const drawsMax = drawValues.length > 0 ? Math.max(...drawValues) : 0;
  const trisMedian = median(triValues);
  const trisMax = triValues.length > 0 ? Math.max(...triValues) : 0;
  const worstFrameMs = windows.length > 0 ? Math.max(...windows.map((w) => w.worstFrameMs)) : 0;

  const metrics: PerfMetric[] = [
    {
      id: "fps-median",
      label: "fps (median of 1 s windows)",
      measured: fpsMedian.toFixed(1),
      budget: `≥ ${budget.fpsTarget} (floor ${budget.fpsFloor})`,
      verdict: scoreFloor(fpsMedian, budget.fpsTarget, budget.fpsFloor),
    },
    {
      id: "fps-min",
      label: "fps (worst 1 s window)",
      measured: fpsMin.toFixed(1),
      budget: `≥ ${budget.fpsFloor}`,
      verdict: scoreFloor(fpsMin, budget.fpsFloor, budget.fpsFloor * 0.75),
    },
    {
      id: "frame-p95",
      label: "frame time p95 (ms)",
      measured: percentile(frameMsValues, 0.95).toFixed(1),
      budget: `≤ ${(1000 / budget.fpsFloor).toFixed(1)}`,
      verdict: scoreCeiling(
        percentile(frameMsValues, 0.95),
        1000 / budget.fpsTarget,
        1000 / budget.fpsFloor,
      ),
    },
    {
      id: "draws",
      label: "draw calls / frame (all passes)",
      measured: Math.round(drawsMedian).toString(),
      budget: `≤ ${budget.drawCalls} (cap ${budget.drawCallsHardCap})`,
      verdict: scoreCeiling(drawsMedian, budget.drawCalls, budget.drawCallsHardCap),
    },
    {
      id: "tris",
      label: "triangles / frame (all passes)",
      measured: `${Math.round(trisMedian / 1000)}k`,
      budget: `≤ ${Math.round(budget.triangles / 1000)}k (cap ${Math.round(budget.trianglesHardCap / 1000)}k)`,
      verdict: scoreCeiling(trisMedian, budget.triangles, budget.trianglesHardCap),
    },
    {
      id: "draws-max",
      label: "draw calls / frame (worst window)",
      measured: Math.round(drawsMax).toString(),
      budget: `≤ ${budget.drawCallsHardCap}`,
      verdict: scoreCeiling(drawsMax, budget.drawCallsHardCap, budget.drawCallsHardCap * 1.5),
    },
    {
      id: "context-loss",
      label: "WebGL context losses",
      measured: input.contextLossCount.toString(),
      budget: "0",
      verdict: input.contextLossCount === 0 ? "pass" : "fail",
    },
  ];

  // Thermal stability, only once there are enough windows to divide into
  // thirds. §7.3 #13: a locked 30 and a 45→25 decay have the same median and
  // the same minimum — this is the line that tells them apart, and it is the
  // reason PERF_RUN_SECONDS is 60 and not 10.
  const decay = fpsDecayRatio(fpsValues);
  if (decay !== null) {
    metrics.push({
      id: "fps-stability",
      label: "fps last third ÷ first third (thermal decay)",
      measured: decay.toFixed(2),
      budget: "≥ 0.90",
      verdict: decay >= 0.9 ? "pass" : decay >= 0.75 ? "warn" : "fail",
    });
  }

  // Boot metrics only when the browser gave us the timings. Absent ≠ zero:
  // scoring an unmeasured load as 0 ms would turn the one gate that has never
  // been run into an automatic green.
  if (input.firstFrameMs !== null) {
    metrics.push({
      id: "first-frame",
      label: "first rendered frame (s from navigation)",
      measured: (input.firstFrameMs / 1000).toFixed(1),
      // 68_ALPHA_RECONSTRUCTION_PLAN:191 — "<10 s load" on a mid-range Android.
      budget: "≤ 10.0",
      verdict: scoreCeiling(input.firstFrameMs, 8_000, 10_000),
    });
  }
  if (input.totalTransferBytes !== null) {
    metrics.push({
      id: "wire",
      label: "first-playable wire (MB transferred)",
      measured: mb(input.totalTransferBytes).toFixed(2),
      budget: `≤ ${budget.firstPlayableMb.toFixed(1)}`,
      verdict: scoreCeiling(
        mb(input.totalTransferBytes),
        budget.firstPlayableMb,
        budget.firstPlayableMb * 1.3,
      ),
    });
  }
  if (input.scriptTransferBytes !== null) {
    metrics.push({
      id: "js-wire",
      label: "script bytes transferred (KB) — the §2.1 parse budget",
      measured: (input.scriptTransferBytes / 1000).toFixed(0),
      budget: `≤ ${budget.jsGzKb}`,
      verdict: scoreCeiling(
        input.scriptTransferBytes / 1000,
        budget.jsGzKb,
        budget.jsGzKb * 1.5,
      ),
    });
  }

  return {
    input,
    budget,
    frameMs: {
      p50: percentile(frameMsValues, 0.5),
      p95: percentile(frameMsValues, 0.95),
      worst: worstFrameMs,
    },
    fps: { median: fpsMedian, min: fpsMin, decay },
    draws: { median: drawsMedian, max: drawsMax },
    tris: { median: trisMedian, max: trisMax },
    metrics,
    verdict: metrics.reduce<PerfMetricVerdict>((acc, m) => worst(acc, m.verdict), "pass"),
  };
}

const VERDICT_MARK: Record<PerfMetricVerdict, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

/**
 * The committable artifact: one self-contained markdown block.
 *
 * Self-contained on purpose — it restates the budget it was scored against and
 * the device that produced it, so a file in docs/simulation/perf/ still means
 * something after §2.2 is retuned. The founder copies this out of
 * chrome://inspect and `scripts/perf-report.mjs` files it.
 */
export function formatPerfReportMarkdown(report: PerfReport): string {
  const { input, budget } = report;
  const lines: string[] = [];
  lines.push(`# Sim perf run — tier \`${input.tier}\` — ${input.recordedAt}`);
  lines.push("");
  lines.push(`**Verdict: ${VERDICT_MARK[report.verdict]}** · scene \`${input.scene}\``);
  lines.push("");
  lines.push("## Device");
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| Budget column | ${budget.reference} |`);
  lines.push(`| GL renderer | ${input.glRenderer ?? "(unavailable)"} |`);
  lines.push(`| User agent | \`${input.userAgent}\` |`);
  lines.push(`| Viewport (CSS) | ${input.viewport} |`);
  lines.push(
    `| Drawing buffer | ${input.drawingBuffer} (devicePixelRatio ${input.devicePixelRatio}, applied ${input.appliedDpr}) |`,
  );
  lines.push(`| hardwareConcurrency | ${input.hardwareConcurrency ?? "n/a"} |`);
  lines.push(`| deviceMemory | ${input.deviceMemoryGb !== null ? `${input.deviceMemoryGb} GB` : "n/a"} |`);
  lines.push(
    `| JS heap at report | ${input.jsHeapBytes !== null ? `${mb(input.jsHeapBytes).toFixed(1)} MB` : "n/a"} |`,
  );
  lines.push(`| DOMContentLoaded | ${input.domContentLoadedMs !== null ? `${Math.round(input.domContentLoadedMs)} ms` : "n/a"} |`);
  lines.push("");
  lines.push("## Scored against doc 82 §2.2");
  lines.push("");
  lines.push("| Metric | Measured | Budget | |");
  lines.push("| --- | --- | --- | --- |");
  for (const m of report.metrics) {
    lines.push(`| ${m.label} | ${m.measured} | ${m.budget} | ${VERDICT_MARK[m.verdict]} |`);
  }
  lines.push("");
  lines.push(
    `Frame time p50 ${report.frameMs.p50.toFixed(1)} ms · p95 ${report.frameMs.p95.toFixed(1)} ms · worst single frame ${report.frameMs.worst.toFixed(0)} ms.`,
  );
  lines.push("");
  lines.push(
    report.fps.decay !== null
      ? `Thermal decay ${report.fps.decay.toFixed(2)}× (last third ÷ first third) over ${input.windows.length} s.`
      : `Thermal decay not reported — needs ≥ ${MIN_DECAY_WINDOWS} one-second windows.`,
  );
  lines.push("");
  lines.push(`## Per-second windows (${input.windows.length})`);
  lines.push("");
  lines.push("| t (s) | fps | draws/frame | tris/frame | worst frame (ms) | programs |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const w of input.windows) {
    lines.push(
      `| ${w.atS.toFixed(0)} | ${w.fps.toFixed(1)} | ${Math.round(w.drawsPerFrame)} | ${Math.round(
        w.trisPerFrame / 1000,
      )}k | ${w.worstFrameMs.toFixed(0)} | ${w.programs} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
