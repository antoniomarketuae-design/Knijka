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

/** Raw frame deltas retained for the stutter histogram (~2 min at 60 fps). */
const MAX_DELTA_SAMPLES = 7200;

// ---------------------------------------------------------------------------
// GPU PASS TIMER — the instrument that can actually see a frame-rate change
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS. Everything above counts SUBMISSIONS (draw calls, triangles)
// and wall-clock rAF deltas. Both are structurally blind to the founder's
// complaint:
//
//   * A shadow map is one extra RENDER PASS over the whole depth-only scene.
//     It moves draw calls by a handful and triangles by ~0 %, and can still
//     cost milliseconds. The art wave's A/B measured "+2 draws, +0.38 % tris"
//     and honestly concluded it could not see a cost. It could not, because it
//     was not measuring one.
//   * Wall-clock frame time in Chromium is VSYNC-CAPPED. Every cell of that
//     table read 16.5–16.8 ms because the display refresh is 60 Hz, not
//     because the frame took 16.6 ms. A frame that takes 8 ms and a frame that
//     takes 15 ms are the same number on that instrument.
//
// `EXT_disjoint_timer_query_webgl2` measures GPU EXECUTION TIME of the
// commands between beginQuery/endQuery, in nanoseconds, on the GPU's own
// clock. It is unaffected by vsync, unaffected by how far ahead the CPU is
// running, and it is the only thing on this box that answers "what does the
// shadow pass cost".
//
// HOW PASSES ARE SEPARATED. We do not (cannot) ask three or `postprocessing`
// to announce their passes. We watch `bindFramebuffer`: a render target switch
// IS a pass boundary, by construction, for every renderer. Each region between
// two switches is timed with one query and keyed by `fb<id>@<w>x<h>`, where the
// size is the viewport three set for that target. That gives the shadow map
// (its own square target), the main scene (the composer's full-res HDR input,
// hundreds of draws), and every fullscreen effect pass (one draw each) as
// separate rows without anyone having to guess.
//
// HOW A ONE-DRAW PASS IS NAMED. Fullscreen effect passes are all "1 draw at
// full res" and indistinguishable by size. So the timer also records the
// fragment shader's declared UNIFORM NAMES for the program that drew — `aoRadius`
// is N8AO, `supportBuffer` is the bloom mipmap blur, `SMAA*` is SMAA. The
// fingerprint is printed next to the row so the naming is auditable rather than
// asserted.
//
// COST WHEN OFF: zero. Nothing is wrapped until `gpuStart()` is called, and
// `gpuStop()` restores every original method. ADR-004: shader uniform NAMES and
// GPU nanoseconds, printed to a console the founder is attached to, never
// transmitted.

/** The subset of EXT_disjoint_timer_query_webgl2 we use. */
interface DisjointTimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

/**
 * Timer queries in flight before a region is timed draws-only.
 *
 * Sized from a measurement, not a guess: the med tier enters ~50 render-target
 * regions per frame and a query result is not readable for 1-3 frames, so a
 * 64-deep pool starved (2,114 untimed entries in the first 8 s run) and the
 * table then leaned on the per-entry mean to stay honest. 320 covers the
 * observed depth with headroom; the report still prints `dropped` so a future
 * scene that outgrows it says so instead of quietly degrading.
 */
const QUERY_POOL_SIZE = 320;
/** Uniform names kept as a pass fingerprint. */
const FINGERPRINT_UNIFORMS = 8;
/** Distinct programs fingerprinted per region — enough to name a mixed pass. */
const FINGERPRINT_PROGRAMS = 3;

/** One render-target region, as measured. */
export interface GpuPassRow {
  /** Stable identity: render target id + the viewport it was drawn at. */
  key: string;
  /** Best-effort human name. Derived, never authoritative — check `shader`. */
  label: string;
  /** Times the region was entered per frame (a mip chain enters many times). */
  entriesPerFrame: number;
  /** Draw calls issued inside it, per frame. */
  drawsPerFrame: number;
  /** GPU milliseconds this region costs PER FRAME. The number that matters. */
  gpuMsPerFrame: number;
  /** Mean GPU ms of ONE entry — what a timer query literally returned. */
  gpuMsPerEntry: number;
  /** Resolved timer queries behind the mean. 0 ⇒ untimed, draws only. */
  samples: number;
  /** Declared fragment uniforms of the program that drew here. */
  shader: string | null;
}

/** A whole timed run. */
export interface GpuPassReport {
  tier: QualityLevel;
  glRenderer: string | null;
  drawingBuffer: string;
  /** Frames the window covered. */
  frames: number;
  /** Wall-clock ms per frame over the window (vsync-capped unless disabled). */
  wallMsPerFrame: number;
  /** Σ of every row's gpuMsPerFrame — the real GPU cost of one frame. */
  gpuMsPerFrameTotal: number;
  /** Regions the pool could not time (accuracy caveat; should be ~0). */
  droppedQueries: number;
  /** GPU_DISJOINT_EXT events. Non-zero ⇒ some samples were discarded. */
  disjointEvents: number;
  rows: GpuPassRow[];
}

interface RegionAcc {
  entries: number;
  draws: number;
  gpuNs: number;
  samples: number;
  shader: string | null;
  width: number;
  height: number;
  defaultFb: boolean;
}

/** Declared uniform names of a fragment shader, in order, deduped. */
function fingerprintFragment(src: string): string {
  const names: string[] = [];
  const re = /uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+(\w+)/g;
  let m = re.exec(src);
  while (m !== null && names.length < FINGERPRINT_UNIFORMS) {
    if (!names.includes(m[1])) names.push(m[1]);
    m = re.exec(src);
  }
  return names.join(",");
}

/**
 * Name a region from what was measured about it. Ordered most-specific first;
 * the shader fingerprint beats geometry, geometry beats draw counts.
 */
function labelRegion(acc: RegionAcc, shadowMapSize: number, bufW: number, bufH: number): string {
  const f = acc.shader ?? "";
  if (acc.defaultFb) return "canvas (final blit)";
  if (acc.width === shadowMapSize && acc.height === shadowMapSize && acc.draws > 4) {
    return "shadow map";
  }
  if (/aoRadius|distanceFalloff|radiusToScreen|aoSamples|sampleTexture/i.test(f)) return "AO (N8AO)";
  if (/supportBuffer|mipmap/i.test(f)) return "bloom (mipmap blur)";
  if (/luminance(Threshold|Smoothing|Range)/i.test(f)) return "bloom (luminance)";
  if (/SMAA|areaTexture|searchTexture/i.test(f)) return "SMAA";
  if (acc.draws > 20) {
    return acc.width === bufW && acc.height === bufH ? "main scene" : "scene RTT (mirror/probe)";
  }
  if (acc.draws <= 2) return "fullscreen pass";
  return "pass";
}

/** Wrapped GL entry points, restored verbatim on stop. */
interface TimerOriginals {
  bindFramebuffer: WebGL2RenderingContext["bindFramebuffer"];
  viewport: WebGL2RenderingContext["viewport"];
  drawArrays: WebGL2RenderingContext["drawArrays"];
  drawElements: WebGL2RenderingContext["drawElements"];
  drawArraysInstanced: WebGL2RenderingContext["drawArraysInstanced"];
  drawElementsInstanced: WebGL2RenderingContext["drawElementsInstanced"];
  drawRangeElements: WebGL2RenderingContext["drawRangeElements"];
  shaderSource: WebGL2RenderingContext["shaderSource"];
  attachShader: WebGL2RenderingContext["attachShader"];
  useProgram: WebGL2RenderingContext["useProgram"];
}

interface GpuPassTimer {
  /**
   * Poll finished queries, count one frame, and arm the end-of-frame close.
   * Called from the probe's `useFrame`.
   */
  tick: () => void;
  /** Unwrap and produce the report. */
  stop: (tier: QualityLevel, glRenderer: string | null) => GpuPassReport;
}

/**
 * Wrap a live WebGL2 context and time every render-target region.
 * Returns null when the extension is unavailable — the caller must then say so
 * rather than print a table of zeroes.
 */
function startGpuPassTimer(
  ctx: WebGL2RenderingContext,
  shadowMapSize: number,
): GpuPassTimer | null {
  const maybeExt = ctx.getExtension("EXT_disjoint_timer_query_webgl2") as DisjointTimerExt | null;
  if (maybeExt === null) return null;
  // Re-bound non-null: the timing closures below are created after this guard,
  // but TS does not carry a narrowing across a function boundary.
  const ext: DisjointTimerExt = maybeExt;

  const o: TimerOriginals = {
    bindFramebuffer: ctx.bindFramebuffer,
    viewport: ctx.viewport,
    drawArrays: ctx.drawArrays,
    drawElements: ctx.drawElements,
    drawArraysInstanced: ctx.drawArraysInstanced,
    drawElementsInstanced: ctx.drawElementsInstanced,
    drawRangeElements: ctx.drawRangeElements,
    shaderSource: ctx.shaderSource,
    attachShader: ctx.attachShader,
    useProgram: ctx.useProgram,
  };

  const regions = new Map<string, RegionAcc>();
  const fbIds = new WeakMap<WebGLFramebuffer, number>();
  const fragSrc = new WeakMap<WebGLShader, string>();
  const progFingerprint = new WeakMap<WebGLProgram, string>();
  const pool: WebGLQuery[] = [];
  const inflight: { q: WebGLQuery; key: string }[] = [];
  for (let i = 0; i < QUERY_POOL_SIZE; i += 1) {
    const q = ctx.createQuery();
    if (q) pool.push(q);
  }

  let nextFbId = 1;
  let curFb = 0;
  let curDraws = 0;
  /** Distinct fragment fingerprints seen in the CURRENT region, capped. */
  let curShaders: string[] = [];
  let vpW = ctx.drawingBufferWidth;
  let vpH = ctx.drawingBufferHeight;
  let active: WebGLQuery | null = null;
  let dropped = 0;
  let disjointEvents = 0;
  let frames = 0;
  /** Set by stop(); a rAF close scheduled before it must not touch an unwrapped context. */
  let stopped = false;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

  const keyOf = () => `fb${curFb}@${vpW}x${vpH}`;

  function closeRegion(): void {
    const key = keyOf();
    let acc = regions.get(key);
    if (!acc) {
      acc = {
        entries: 0,
        draws: 0,
        gpuNs: 0,
        samples: 0,
        shader: null,
        width: vpW,
        height: vpH,
        defaultFb: curFb === 0,
      };
      regions.set(key, acc);
    }
    acc.entries += 1;
    acc.draws += curDraws;
    if (acc.shader === null && curShaders.length > 0) acc.shader = curShaders.join(" | ");
    curDraws = 0;
    curShaders = [];
    if (active !== null) {
      ctx.endQuery(ext.TIME_ELAPSED_EXT);
      inflight.push({ q: active, key });
      active = null;
    }
  }

  function openRegion(): void {
    // Draining once per frame is not enough: a ~50-region frame outruns a pool
    // whose results take 1-3 frames to become readable. Reclaim mid-frame when
    // it runs dry, so starvation costs a poll and not a missing measurement.
    if (pool.length === 0) drain();
    const q = pool.pop();
    if (!q) {
      dropped += 1;
      return;
    }
    ctx.beginQuery(ext.TIME_ELAPSED_EXT, q);
    active = q;
  }

  ctx.bindFramebuffer = function bindFramebufferTimed(
    target: number,
    fb: WebGLFramebuffer | null,
  ): void {
    // READ_FRAMEBUFFER binds are not a draw target and must not split a region.
    if (target !== ctx.FRAMEBUFFER && target !== ctx.DRAW_FRAMEBUFFER) {
      o.bindFramebuffer.call(ctx, target, fb);
      return;
    }
    closeRegion();
    o.bindFramebuffer.call(ctx, target, fb);
    if (fb === null) {
      curFb = 0;
    } else {
      let id = fbIds.get(fb);
      if (id === undefined) {
        id = nextFbId;
        nextFbId += 1;
        fbIds.set(fb, id);
      }
      curFb = id;
    }
    openRegion();
  };

  ctx.viewport = function viewportTimed(x: number, y: number, w: number, h: number): void {
    vpW = w;
    vpH = h;
    o.viewport.call(ctx, x, y, w, h);
  };

  ctx.shaderSource = function shaderSourceTimed(sh: WebGLShader, src: string): void {
    // Fragment shaders only: `out vec4` / `gl_FragColor` are the reliable tell
    // without asking the context for the shader type (a sync GL round trip).
    if (/gl_FragColor|out\s+(?:highp\s+|mediump\s+|lowp\s+)?vec4/.test(src)) fragSrc.set(sh, src);
    o.shaderSource.call(ctx, sh, src);
  };

  ctx.attachShader = function attachShaderTimed(pr: WebGLProgram, sh: WebGLShader): void {
    const src = fragSrc.get(sh);
    if (src !== undefined) progFingerprint.set(pr, fingerprintFragment(src));
    o.attachShader.call(ctx, pr, sh);
  };

  /**
   * Fingerprint a program we did not watch being built.
   *
   * The timer is armed AFTER the scene has warmed, so by then three and
   * `postprocessing` have already compiled every program and the shaderSource
   * hook above sees nothing. The first run of this instrument returned an empty
   * shader column for all 33 regions for exactly that reason. WebGL can be
   * asked after the fact — `getAttachedShaders` + `getShaderSource` — so it is.
   * Both are synchronous GL calls, hence the memo: paid once per program, in
   * the first frames of the window, never on the steady-state path.
   */
  function fingerprintProgram(pr: WebGLProgram): string {
    const cached = progFingerprint.get(pr);
    if (cached !== undefined) return cached;
    let fp = "";
    try {
      const shaders = ctx.getAttachedShaders(pr);
      for (const sh of shaders ?? []) {
        const src = ctx.getShaderSource(sh);
        if (src !== null && /gl_FragColor|out\s+(?:(?:highp|mediump|lowp)\s+)?vec4/.test(src)) {
          fp = fingerprintFragment(src);
          break;
        }
      }
    } catch {
      fp = "";
    }
    progFingerprint.set(pr, fp);
    return fp;
  }

  ctx.useProgram = function useProgramTimed(pr: WebGLProgram | null): void {
    // Every DISTINCT program in the region, not just the first. A region that
    // issues 25 draws is 25 chances to be mis-named off its opening material;
    // the pass costing 30 % of the high frame was unidentifiable for exactly
    // that reason. Capped so the row stays readable.
    if (pr !== null && curShaders.length < FINGERPRINT_PROGRAMS) {
      const fp = fingerprintProgram(pr);
      if (fp.length > 0 && !curShaders.includes(fp)) curShaders.push(fp);
    }
    o.useProgram.call(ctx, pr);
  };

  const countDraw = () => {
    curDraws += 1;
  };
  ctx.drawArrays = function drawArraysTimed(m: number, f: number, c: number): void {
    countDraw();
    o.drawArrays.call(ctx, m, f, c);
  };
  ctx.drawElements = function drawElementsTimed(m: number, c: number, t: number, off: number): void {
    countDraw();
    o.drawElements.call(ctx, m, c, t, off);
  };
  ctx.drawArraysInstanced = function drawArraysInstancedTimed(
    m: number,
    f: number,
    c: number,
    i: number,
  ): void {
    countDraw();
    o.drawArraysInstanced.call(ctx, m, f, c, i);
  };
  ctx.drawElementsInstanced = function drawElementsInstancedTimed(
    m: number,
    c: number,
    t: number,
    off: number,
    i: number,
  ): void {
    countDraw();
    o.drawElementsInstanced.call(ctx, m, c, t, off, i);
  };
  ctx.drawRangeElements = function drawRangeElementsTimed(
    m: number,
    s: number,
    e: number,
    c: number,
    t: number,
    off: number,
  ): void {
    countDraw();
    o.drawRangeElements.call(ctx, m, s, e, c, t, off);
  };

  function drain(): void {
    // Per spec a disjoint invalidates every query in flight — discard, do not
    // average a lie into the table.
    if (ctx.getParameter(ext.GPU_DISJOINT_EXT) === true) {
      disjointEvents += 1;
      for (const p of inflight) pool.push(p.q);
      inflight.length = 0;
      return;
    }
    while (inflight.length > 0) {
      const head = inflight[0];
      if (ctx.getQueryParameter(head.q, ctx.QUERY_RESULT_AVAILABLE) !== true) break;
      inflight.shift();
      const ns = ctx.getQueryParameter(head.q, ctx.QUERY_RESULT) as number;
      const acc = regions.get(head.key);
      if (acc) {
        acc.gpuNs += ns;
        acc.samples += 1;
      }
      pool.push(head.q);
    }
  }

  /**
   * Close the frame's last region — WITHOUT reopening one — at the true end of
   * a frame's GL work.
   *
   * WITHOUT THIS THE TABLE LIES, and it lies about whichever pass happens to be
   * last. A region stays open until the next `bindFramebuffer`, and for the
   * final blit that is the NEXT FRAME, so TIME_ELAPSED spans the vsync wait and
   * the final pass absorbs the whole idle gap. MEASURED, not feared: at tier
   * med the final blit read 5.003 ms/frame with the 60 Hz cap on and 1.462 ms
   * with `--disable-gpu-vsync` — 3.5 ms of pure idle, 26 % of the whole frame,
   * booked to a fullscreen triangle.
   *
   * WHY IT IS A rAF CALLBACK AND NOT A `useFrame`. The obvious hook is
   * `useFrame(cb, 1000)`, which R3F runs after the composer's pass at 1. But
   * R3F disables its own automatic render as soon as ANY subscriber claims a
   * POSITIVE priority, and tier `low` mounts no composer — that hook would
   * black-screen the phone tier in order to measure it. A raw rAF registered
   * from inside R3F's own loop callback lands after R3F's next-frame callback
   * in the browser's registration order, i.e. after that frame is fully
   * rendered, at every tier, and touches the render loop not at all.
   */
  function closeFrame(): void {
    if (stopped) return;
    if (active !== null || curDraws > 0) closeRegion();
  }

  return {
    tick: () => {
      frames += 1;
      drain();
      // OPEN A REGION FOR EVERY FRAME, even one that never rebinds a target.
      //
      // Regions are cut at `bindFramebuffer`, which silently assumes every
      // frame contains at least one. Tier `low` breaks that assumption and it
      // is the tier that matters most: with no composer, three binds the
      // default framebuffer once and never rebinds, so the ONLY rebinds are the
      // mirror RTT's — every other frame. Frames in between rendered ~212 draws
      // inside no region at all, their work was booked as an untimed entry, and
      // `msPerEntry × entriesPerFrame` then read 10.31 ms/frame for a scene the
      // composer tiers render for ~4. Opening here bounds every frame from its
      // first command; a rebind inside still splits it into sub-passes.
      if (active === null) openRegion();
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(closeFrame);
    },
    stop: (tier, glRenderer) => {
      stopped = true;
      if (active !== null) {
        ctx.endQuery(ext.TIME_ELAPSED_EXT);
        active = null;
      }
      ctx.bindFramebuffer = o.bindFramebuffer;
      ctx.viewport = o.viewport;
      ctx.drawArrays = o.drawArrays;
      ctx.drawElements = o.drawElements;
      ctx.drawArraysInstanced = o.drawArraysInstanced;
      ctx.drawElementsInstanced = o.drawElementsInstanced;
      ctx.drawRangeElements = o.drawRangeElements;
      ctx.shaderSource = o.shaderSource;
      ctx.attachShader = o.attachShader;
      ctx.useProgram = o.useProgram;
      drain();

      const bufW = ctx.drawingBufferWidth;
      const bufH = ctx.drawingBufferHeight;
      const f = Math.max(frames, 1);
      const rows: GpuPassRow[] = [];
      for (const [key, acc] of regions) {
        // Per-ENTRY mean × entries-per-frame, not total/frames: a region the
        // pool could not time on some entries must not read as cheaper than it
        // is. `samples` is printed so the reader can audit the divisor.
        const msPerEntry = acc.samples > 0 ? acc.gpuNs / acc.samples / 1e6 : 0;
        const entriesPerFrame = acc.entries / f;
        rows.push({
          key,
          label: labelRegion(acc, shadowMapSize, bufW, bufH),
          entriesPerFrame,
          drawsPerFrame: acc.draws / f,
          gpuMsPerFrame: msPerEntry * entriesPerFrame,
          gpuMsPerEntry: msPerEntry,
          samples: acc.samples,
          shader: acc.shader,
        });
      }
      rows.sort((a, b) => b.gpuMsPerFrame - a.gpuMsPerFrame);
      const elapsed = (typeof performance !== "undefined" ? performance.now() : 0) - startedAt;
      return {
        tier,
        glRenderer,
        drawingBuffer: `${bufW}×${bufH}`,
        frames,
        wallMsPerFrame: elapsed / f,
        gpuMsPerFrameTotal: rows.reduce((s, r) => s + r.gpuMsPerFrame, 0),
        droppedQueries: dropped,
        disjointEvents,
        rows,
      };
    },
  };
}

/** Fixed-width table of a GpuPassReport — copyable out of DevTools in one gesture. */
export function formatGpuPassReport(r: GpuPassReport): string {
  const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);
  const lines = [
    `[sim-gpu] tier=${r.tier} buffer=${r.drawingBuffer} frames=${r.frames}`,
    `[sim-gpu] renderer=${r.glRenderer ?? "(masked)"}`,
    `[sim-gpu] GPU ${r.gpuMsPerFrameTotal.toFixed(2)} ms/frame` +
      ` (⇒ ${(1000 / Math.max(r.gpuMsPerFrameTotal, 0.001)).toFixed(0)} fps GPU-bound)` +
      ` · wall ${r.wallMsPerFrame.toFixed(2)} ms/frame` +
      ` · dropped=${r.droppedQueries} disjoint=${r.disjointEvents}`,
    "",
    `${pad("pass", 26)}${padL("ms/frame", 10)}${padL("%", 7)}${padL("draws", 8)}${padL("enter", 7)}${padL("n", 6)}  ${pad("key", 18)}shader uniforms`,
    "-".repeat(120),
  ];
  for (const row of r.rows) {
    const pct = r.gpuMsPerFrameTotal > 0 ? (100 * row.gpuMsPerFrame) / r.gpuMsPerFrameTotal : 0;
    lines.push(
      pad(row.label, 26) +
        padL(row.gpuMsPerFrame.toFixed(3), 10) +
        padL(pct.toFixed(1), 7) +
        padL(row.drawsPerFrame.toFixed(1), 8) +
        padL(row.entriesPerFrame.toFixed(2), 7) +
        padL(String(row.samples), 6) +
        "  " +
        pad(row.key, 18) +
        (row.shader ?? ""),
    );
  }
  return lines.join("\n");
}

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
  /**
   * Begin per-pass GPU timing. `false` ⇒ this browser has no
   * EXT_disjoint_timer_query_webgl2 and NO per-pass number can be produced
   * here; say that rather than reporting a table of zeroes.
   */
  gpuStart: () => boolean;
  /** End timing, print the table, return it. `null` ⇒ it was never started. */
  gpuStop: () => GpuPassReport | null;
  /** start → wait `seconds` → stop → print. The one-call form. */
  gpu: (seconds?: number) => Promise<GpuPassReport | null>;
  /**
   * ABLATION: toggle the shadow map and force the material recompile three
   * needs.
   *
   * ⚠ IT DOES NOT CURRENTLY HOLD, and the timer is what caught it. LessonScene
   * mounts `<Canvas shadows="percentage">`, so R3F owns `gl.shadowMap.enabled`
   * and restores it on the next reconcile. Measured after calling this with
   * `false`: the 1024×1024 region kept rendering its 156 draws and still cost
   * 0.53-0.91 ms, i.e. the shadow map never stopped. The ablation delta that
   * survives (med at 1904×1021: 12.52 → 10.43 ms in one pair, 10.56 → 9.99 in
   * another) is therefore the material RECOMPILE moving other passes around,
   * NOT the price of shadows — do not quote it as such.
   *
   * The trustworthy shadow number is the direct per-pass row, which needs no
   * ablation at all. This stays because it is the right lever the moment the
   * Canvas prop becomes tier-aware; until then it is a known-broken control.
   */
  setShadows: (enabled: boolean) => boolean;
  /** Raw frame deltas (ms) since the last drain — the freeze/stutter histogram. */
  frameDeltas: () => number[];
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
  // Only used by the shadow ABLATION: three needs every material recompiled
  // when shadowMap.enabled flips, and the only way to reach them is the graph.
  const scene = useThree((s) => s.scene);

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
  /** Live GPU pass timer, or null when it was never started / already stopped. */
  const timerRef = useRef<GpuPassTimer | null>(null);
  /**
   * Every frame delta since the last drain, uncooked. `worstFrameMs` above
   * keeps only the maximum, which cannot tell "one 400 ms hitch" from
   * "permanently 30 fps" — and those are two completely different bugs with
   * the same founder sentence ("it lags and freezes").
   */
  const deltasRef = useRef<number[]>([]);
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
        deltasRef.current = [];
        accRef.current.windowStart = -1;
        accRef.current.printedAt = -1;
      },
      gpuStart: () => {
        if (timerRef.current !== null) return true;
        const ctx = gl.getContext();
        if (typeof WebGL2RenderingContext === "undefined" || !(ctx instanceof WebGL2RenderingContext)) {
          console.warn("[sim-gpu] not a WebGL2 context — per-pass GPU timing is unavailable here");
          return false;
        }
        const timer = startGpuPassTimer(ctx, QUALITY_PRESETS[level].shadowMapSize);
        if (timer === null) {
          console.warn(
            "[sim-gpu] EXT_disjoint_timer_query_webgl2 is not exposed by this browser/driver —" +
              " per-pass GPU milliseconds CANNOT be measured here. Do not substitute frame time:" +
              " it is vsync-capped and will read 16.6 ms whatever the passes cost.",
          );
          return false;
        }
        timerRef.current = timer;
        console.info("[sim-gpu] per-pass GPU timing armed");
        return true;
      },
      gpuStop: () => {
        const timer = timerRef.current;
        if (timer === null) return null;
        timerRef.current = null;
        const rep = timer.stop(level, readGlRenderer(gl.getContext()));
        console.log(formatGpuPassReport(rep));
        return rep;
      },
      gpu: async (seconds = 8) => {
        if (!window.__simPerf?.gpuStart()) return null;
        await new Promise((r) => setTimeout(r, seconds * 1000));
        return window.__simPerf?.gpuStop() ?? null;
      },
      setShadows: (enabled: boolean) => {
        /* eslint-disable react-hooks/immutability -- an ablation switch on the
           renderer + the material recompile three requires to honour it. Not a
           render-time mutation: it is called from the console/driver script. */
        gl.shadowMap.enabled = enabled;
        scene.traverse((obj) => {
          const mat = (obj as unknown as { material?: unknown }).material;
          const one = (m: unknown) => {
            if (m !== null && typeof m === "object" && "needsUpdate" in m) {
              (m as { needsUpdate: boolean }).needsUpdate = true;
            }
          };
          if (Array.isArray(mat)) mat.forEach(one);
          else if (mat !== undefined) one(mat);
        });
        /* eslint-enable react-hooks/immutability */
        console.info(`[sim-gpu] shadowMap.enabled = ${enabled} (materials invalidated)`);
        return enabled;
      },
      frameDeltas: () => {
        const out = deltasRef.current;
        deltasRef.current = [];
        return out;
      },
    };
    window.__simPerf = handle;
    console.info(
      "[sim-perf] window.__simPerf ready — .scene('name') to label, .report() for the committable markdown," +
        " .gpu(8) for per-pass GPU milliseconds",
    );
    return () => {
      if (window.__simPerf === handle) delete window.__simPerf;
    };
  }, [gl, level, scene]);

  // Unwrap the context if the scene tears down mid-measurement — a wrapped
  // context outliving the probe would leak timer queries into the next run.
  useEffect(
    () => () => {
      const timer = timerRef.current;
      timerRef.current = null;
      if (timer !== null) timer.stop(level, null);
    },
    [level],
  );

  useFrame((state) => {
    const acc = accRef.current;
    const nowMs = typeof performance !== "undefined" ? performance.now() : 0;
    if (firstFrameMsRef.current === null) firstFrameMsRef.current = nowMs;
    if (acc.lastFrameAt >= 0) {
      const frameMs = nowMs - acc.lastFrameAt;
      if (frameMs > acc.worstFrameMs) acc.worstFrameMs = frameMs;
      // MAX_DELTA_SAMPLES of history is ~2 minutes at 60 fps; the driver drains
      // it, so an unattended session cannot grow it without bound.
      const deltas = deltasRef.current;
      deltas.push(frameMs);
      if (deltas.length > MAX_DELTA_SAMPLES) deltas.shift();
    }
    acc.lastFrameAt = nowMs;
    timerRef.current?.tick();

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
