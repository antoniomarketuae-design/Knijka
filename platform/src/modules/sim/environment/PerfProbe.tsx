"use client";

// PerfProbe — the in-canvas half of the §6.2 P1 measurement.
//
// It was a console.log that lived at the bottom of LessonScene. It still logs
// the same one-line-per-second readout (nothing the founder already knows
// changes), but it now also ACCUMULATES those windows and can emit the scored
// markdown artifact that doc 82 §6.2 gates every later phase on:
//
//   1. open the sim on the phone with `?simPerf=1`, over chrome://inspect
//   2. drive the reference scene for PERF_RUN_SECONDS
//   3. the full report prints itself; or call `__simPerf.report()` any time
//   4. copy it, run `node scripts/perf-report.mjs --stdin` on the laptop,
//      commit what lands in docs/simulation/perf/
//
// WHY THE ACCOUNTING LOOKS LIKE THIS. `gl.info.autoReset` is turned off
// because three zeroes the counters after EVERY gl.render — with the A4 mirror
// RTT passes and the composer's internal passes that leaves only the LAST
// pass visible, which is the number that flatters you. The counters are read
// and reset at the START of each frame (useFrame priority -100, before
// MirrorRig's pass at 0 and the composer's render at 1), so each read captures
// one whole previous frame. That is what makes "draws ≤70 incl. mirror pass"
// a statement about the same thing §2.2 budgeted.
//
// ADR-004: everything here stays on the device. The report embeds the user
// agent and GL renderer string because a measurement whose device cannot be
// identified proves nothing — but it is printed to a DevTools console the
// founder is already attached to, never transmitted, and the probe is
// unreachable without an explicit opt-in.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { QUALITY_PRESETS, type QualityLevel } from "./quality";
import { getContextLossLog } from "./contextLoss";
import {
  buildPerfReport,
  formatPerfReportMarkdown,
  type PerfRunInput,
  type PerfWindowSample,
} from "./perfBudget";

/**
 * How long an unattended run collects before printing itself. 60 s is chosen
 * against §7.3 #13: thermal decay is the failure mode a 10 s run cannot see
 * (a Galaxy A55 holds 99%+ 3DMark stability, but that is the claim under test,
 * not an assumption). The probe keeps sampling afterwards — the auto-print is
 * a convenience, `__simPerf.report()` is always current.
 */
const PERF_RUN_SECONDS = 60;

/** Windows retained. 10 minutes at 1 Hz; a longer session drops the oldest. */
const MAX_WINDOWS = 600;

/** The handle the probe hangs off `window` for the chrome://inspect console. */
export interface SimPerfHandle {
  /** Print + return the scored markdown artifact. */
  report: () => string;
  /** The raw run input, for a script that wants to re-score it. */
  json: () => PerfRunInput;
  /** Label this run's scene ("d2-v1 city run") so two logs are comparable. */
  scene: (name: string) => void;
  /** Drop every window and restart the clock — re-run without a reload. */
  reset: () => void;
}

declare global {
  interface Window {
    __simPerf?: SimPerfHandle;
  }
}

/** UNMASKED_RENDERER_WEBGL, when the debug extension is not blocked. */
function readGlRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    const value: unknown = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Navigation + resource timings — the §2.1 parse/wire half of the picture. */
function readBootTimings(): Pick<
  PerfRunInput,
  "domContentLoadedMs" | "scriptTransferBytes" | "totalTransferBytes" | "jsHeapBytes"
> {
  const empty = {
    domContentLoadedMs: null,
    scriptTransferBytes: null,
    totalTransferBytes: null,
    jsHeapBytes: null,
  };
  if (typeof performance === "undefined") return empty;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    let scriptBytes = 0;
    let totalBytes = nav?.transferSize ?? 0;
    for (const r of resources) {
      // transferSize is 0 for cross-origin resources without Timing-Allow-Origin
      // and for cache hits. Everything the sim loads is same-origin, so a 0 here
      // means "served from cache" — which is a different (and much better) run
      // than a cold one. Note it in the artifact rather than papering over it.
      totalBytes += r.transferSize || 0;
      if (r.initiatorType === "script") scriptBytes += r.transferSize || 0;
    }
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      scriptTransferBytes: scriptBytes > 0 ? scriptBytes : null,
      totalTransferBytes: totalBytes > 0 ? totalBytes : null,
      jsHeapBytes: typeof mem?.usedJSHeapSize === "number" ? mem.usedJSHeapSize : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Whole-frame renderer stats (opt-in via LessonScene's `shouldLogPerf`),
 * logged once per second: fps, draw calls and triangles PER FRAME, including
 * the mirror RTT passes and the composer's internal passes.
 *
 * Budget lines it is scored against: doc 82 §2.2 (PERF_BUDGETS) — tier `low`
 * ≤70 draws / ≤250k tris at a flat 30 fps.
 */
export function PerfProbe({ level }: { level: QualityLevel }) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    /* eslint-disable react-hooks/immutability -- three's own API for
       whole-frame accounting is a mutable flag on the renderer. With autoReset
       on, three zeroes gl.info after EVERY gl.render, so the mirror RTT passes
       and the composer's internal passes vanish and only the last pass is
       counted — the number that flatters you. Restored on unmount. */
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
      gl.info.reset();
    };
    /* eslint-enable react-hooks/immutability */
  }, [gl]);

  // One-line readout of the active tier + the feature gates it selected, so the
  // founder's probe shows which facade/clearcoat path this run is on.
  useEffect(() => {
    const p = QUALITY_PRESETS[level];
    console.info(
      `[sim-perf] tier=${level} facadeMaps=${p.facadeMaps} clearcoat=${p.clearcoat}` +
        ` maxDpr=${p.maxDpr} shadows=${p.shadows} postprocessing=${p.postprocessing}`,
    );
  }, [level]);

  const windowsRef = useRef<PerfWindowSample[]>([]);
  // navigationStart → first frame, captured once. This is the "<10 s load"
  // number in 68_ALPHA_RECONSTRUCTION_PLAN:191.
  const firstFrameMsRef = useRef<number | null>(null);
  const accRef = useRef({
    frames: 0,
    calls: 0,
    tris: 0,
    windowStart: -1,
    worstFrameMs: 0,
    lastFrameAt: -1,
    printedAt: -1,
  });

  // The console handle. Registered on mount so a run can be interrogated
  // mid-drive; the closure reads refs, so it is always current.
  useEffect(() => {
    const sceneRef = { name: "(unlabelled)" };
    const snapshot = (): PerfRunInput => {
      const canvas = gl.domElement;
      const ctx = gl.getContext();
      const nav =
        typeof navigator !== "undefined"
          ? (navigator as Navigator & { deviceMemory?: number })
          : null;
      return {
        tier: level,
        scene: sceneRef.name,
        glRenderer: readGlRenderer(ctx),
        userAgent: nav ? nav.userAgent : "(unknown)",
        viewport:
          typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : "n/a",
        drawingBuffer: `${canvas.width}×${canvas.height}`,
        devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        appliedDpr: gl.getPixelRatio(),
        hardwareConcurrency:
          typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
        deviceMemoryGb: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null,
        // performance.now() is measured from timeOrigin (≈ navigationStart), so
        // the first frame the probe sees IS the navigation→first-frame number.
        firstFrameMs: firstFrameMsRef.current,
        ...readBootTimings(),
        windows: [...windowsRef.current],
        contextLossCount: getContextLossLog().filter((e) => e.kind === "lost").length,
        recordedAt: new Date().toISOString(),
      };
    };

    const handle: SimPerfHandle = {
      json: snapshot,
      report: () => {
        const md = formatPerfReportMarkdown(buildPerfReport(snapshot()));
        // console.log, not info: DevTools renders a bare multi-line string
        // verbatim, which is what makes it copyable in one gesture.
        console.log(md);
        return md;
      },
      scene: (name: string) => {
        sceneRef.name = name;
      },
      reset: () => {
        windowsRef.current = [];
        accRef.current.windowStart = -1;
        accRef.current.printedAt = -1;
      },
    };
    window.__simPerf = handle;
    console.info(
      "[sim-perf] window.__simPerf ready — .scene('name') to label, .report() for the committable markdown",
    );
    return () => {
      if (window.__simPerf === handle) delete window.__simPerf;
    };
  }, [gl, level]);

  useFrame((state) => {
    const acc = accRef.current;
    const nowMs = typeof performance !== "undefined" ? performance.now() : 0;
    if (firstFrameMsRef.current === null) firstFrameMsRef.current = nowMs;
    if (acc.lastFrameAt >= 0) {
      const frameMs = nowMs - acc.lastFrameAt;
      if (frameMs > acc.worstFrameMs) acc.worstFrameMs = frameMs;
    }
    acc.lastFrameAt = nowMs;

    acc.frames += 1;
    acc.calls += gl.info.render.calls;
    acc.tris += gl.info.render.triangles;
    gl.info.reset();

    const now = state.clock.elapsedTime;
    if (acc.windowStart < 0) acc.windowStart = now;
    const span = now - acc.windowStart;
    if (span < 1) return;

    const sample: PerfWindowSample = {
      atS: now,
      fps: acc.frames / span,
      drawsPerFrame: acc.calls / acc.frames,
      trisPerFrame: acc.tris / acc.frames,
      worstFrameMs: acc.worstFrameMs,
      programs: gl.info.programs?.length ?? 0,
    };
    windowsRef.current.push(sample);
    if (windowsRef.current.length > MAX_WINDOWS) windowsRef.current.shift();

    console.info(
      `[sim-perf] fps=${sample.fps.toFixed(0)}` +
        ` draws/frame=${Math.round(sample.drawsPerFrame)}` +
        ` tris/frame=${Math.round(sample.trisPerFrame / 1000)}k` +
        ` worst=${sample.worstFrameMs.toFixed(0)}ms` +
        ` programs=${sample.programs}`,
    );

    acc.frames = 0;
    acc.calls = 0;
    acc.tris = 0;
    acc.worstFrameMs = 0;
    acc.windowStart = now;

    // Auto-print once, at the run length — so an unattended phone run leaves a
    // complete artifact in the console without anyone remembering to ask.
    if (acc.printedAt < 0 && now >= PERF_RUN_SECONDS) {
      acc.printedAt = now;
      window.__simPerf?.report();
    }
  }, -100);

  return null;
}
