"use client";

/**
 * MistakeReplay — the mini mistake-movie of the theory why-panel (THEO
 * Stage 1, doc 64 THEO-2): a lightweight top-down 2D canvas replay of a
 * committed trace over its district's road polylines. NO three.js — the
 * practice page stays feather-light; all math lives in mistakeReplayCore.
 *
 * Behavior: fetches trace + district lazily on mount (the panel mounts it
 * only when open), auto-plays at ~1x in a loop, flashes a red pulse at each
 * violation moment and shows that annotation's STORED Bulgarian text under
 * the canvas (ADR-002: stored copy only, never generated). Any fetch/parse
 * failure degrades to nothing — the panel simply has no replay section.
 * prefers-reduced-motion swaps the animation for a static path drawing with
 * step-through buttons over the same frames.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SVGProps,
} from "react";
import { IconPlay } from "@/components/icons";
import type { MinimapPolyline } from "@/modules/sim/hud";
import {
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  tracePathForRibbon,
  type ScenarioTrace,
  type TracePoint,
} from "@/modules/sim/traces";
import {
  activeMarkerIndex,
  advancePlayhead,
  annotationMarkers,
  crossingPointsOf,
  districtRoadPolylines,
  fitReplayView,
  flashAlpha,
  flashIndex,
  markerAtStep,
  replayToCanvas,
  stepTimes,
  traceBounds,
  type ReplayBounds,
  type ReplayMarker,
  type ReplayPoint,
  type ReplayView,
} from "@/modules/clips/replay/mistakeReplayCore";

interface ReplayData {
  trace: ScenarioTrace;
  markers: ReplayMarker[];
  bounds: ReplayBounds;
  roads: MinimapPolyline[];
  crossings: ReplayPoint[];
  steps: number[];
}

/** Canvas-space layers rebuilt only on data/viewport change — the per-frame
 *  loop just strokes cached Path2Ds. */
interface StaticLayers {
  roadsPath: Path2D;
  tracePath: Path2D;
  crossingsPx: Array<[number, number]>;
  markersPx: Array<[number, number]>;
}

interface ReplayColors {
  road: string;
  crossing: string;
  path: string;
  car: string;
  danger: string;
}

const CULL_PAD_PX = 40;

function buildStaticLayers(data: ReplayData, view: ReplayView): StaticLayers {
  const roadsPath = new Path2D();
  for (const line of data.roads) {
    if (line.points.length < 2) continue;
    // Cull roads fully outside the fitted viewport (+pad) — micro-district
    // maps are tiny, but district-v1 has ~a thousand edges.
    let minPx = Infinity;
    let maxPx = -Infinity;
    let minPy = Infinity;
    let maxPy = -Infinity;
    const px: number[] = [];
    for (const [wx, wy] of line.points) {
      const [cx, cy] = replayToCanvas(view, wx, wy);
      px.push(cx, cy);
      if (cx < minPx) minPx = cx;
      if (cx > maxPx) maxPx = cx;
      if (cy < minPy) minPy = cy;
      if (cy > maxPy) maxPy = cy;
    }
    if (
      maxPx < -CULL_PAD_PX ||
      minPx > view.widthPx + CULL_PAD_PX ||
      maxPy < -CULL_PAD_PX ||
      minPy > view.heightPx + CULL_PAD_PX
    ) {
      continue;
    }
    roadsPath.moveTo(px[0], px[1]);
    for (let i = 2; i < px.length; i += 2) roadsPath.lineTo(px[i], px[i + 1]);
  }

  const tracePath = new Path2D();
  const ribbon = tracePathForRibbon(data.trace);
  for (let i = 0; i < ribbon.count; i++) {
    const [cx, cy] = replayToCanvas(view, ribbon.pts[i * 2], ribbon.pts[i * 2 + 1]);
    if (i === 0) tracePath.moveTo(cx, cy);
    else tracePath.lineTo(cx, cy);
  }

  const crossingsPx: Array<[number, number]> = [];
  for (const c of data.crossings) {
    const [cx, cy] = replayToCanvas(view, c.x, c.y);
    if (cx >= -8 && cx <= view.widthPx + 8 && cy >= -8 && cy <= view.heightPx + 8) {
      crossingsPx.push([cx, cy]);
    }
  }

  const markersPx = data.markers.map((m) => replayToCanvas(view, m.x, m.y));
  return { roadsPath, tracePath, crossingsPx, markersPx };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  view: ReplayView,
  layers: StaticLayers,
  data: ReplayData,
  tSec: number,
  colors: ReplayColors,
  point: TracePoint,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.widthPx, view.heightPx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Roads, then crossing marks, then the faint full path.
  ctx.strokeStyle = colors.road;
  ctx.lineWidth = 2;
  ctx.stroke(layers.roadsPath);

  ctx.fillStyle = colors.crossing;
  for (const [cx, cy] of layers.crossingsPx) ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);

  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = colors.path;
  ctx.lineWidth = 1.5;
  ctx.stroke(layers.tracePath);
  ctx.globalAlpha = 1;

  // Persistent violation dots.
  ctx.fillStyle = colors.danger;
  ctx.globalAlpha = 0.55;
  for (const [cx, cy] of layers.markersPx) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The car, interpolated by the SAME sampleAt the 3D ghost player uses.
  sampleAt(data.trace, tSec, point);
  const [carX, carY] = replayToCanvas(view, point.x, point.y);
  const fi = flashIndex(data.markers, tSec);

  if (fi >= 0) {
    // Red pulse at the violation moment: expanding, fading ring at the car.
    const a = flashAlpha(data.markers[fi].tSec, tSec);
    ctx.strokeStyle = colors.danger;
    ctx.globalAlpha = Math.max(a, 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(carX, carY, 6 + 9 * (1 - a), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(carX, carY);
  // headingDeg: 0 = north (up), clockwise — canvas rotate is clockwise.
  ctx.rotate((point.headingDeg * Math.PI) / 180);
  ctx.fillStyle = fi >= 0 ? colors.danger : colors.car;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function cssColor(el: HTMLElement, v: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(v).trim() || fallback;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function IconPause(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  );
}

export function MistakeReplay({
  tracePath,
  districtId,
  className,
}: {
  /** Committed trace under public/, e.g. "/traces/sc-…/mistake-….trace.json". */
  tracePath: string;
  /** District under public/world/, e.g. "zx-v1" — the trace's home map. */
  districtId: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<TracePoint>(createTracePoint());
  const tSecRef = useRef(0);
  const labelIdxRef = useRef(-2);

  const [data, setData] = useState<ReplayData | null>(null);
  const [failed, setFailed] = useState(false);
  const [widthPx, setWidthPx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [labelBg, setLabelBg] = useState("");

  // Static path drawing + step-through instead of animation.
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);

  // Lazy fetch: the panel mounts this component only when it opens.
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    (async () => {
      try {
        const [traceRes, districtRes] = await Promise.all([
          fetch(tracePath, { signal: ac.signal }),
          fetch(`/world/${districtId}.json`, { signal: ac.signal }),
        ]);
        if (!traceRes.ok || !districtRes.ok) throw new Error("fetch failed");
        const [traceRaw, districtRaw] = (await Promise.all([
          traceRes.json(),
          districtRes.json(),
        ])) as [unknown, unknown];
        const trace = parseScenarioTrace(traceRaw);
        const roads = districtRoadPolylines(districtRaw);
        if (!trace || !roads) throw new Error("unusable payload");
        const markers = annotationMarkers(trace);
        if (!alive) return;
        setData({
          trace,
          markers,
          bounds: traceBounds(trace),
          roads,
          crossings: crossingPointsOf(districtRaw),
          steps: stepTimes(trace, markers),
        });
      } catch {
        // Quiet fallback: no replay section (the panel's text still teaches).
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [tracePath, districtId]);

  // The panel column is responsive — track our own width. Re-observe when
  // `data` lands: the loading placeholder and the figure are different nodes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidthPx(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [data]);

  const heightPx = Math.max(140, Math.min(240, Math.round(widthPx * 0.72)));

  const view = useMemo(
    () => (data && widthPx > 0 ? fitReplayView(data.bounds, widthPx, heightPx) : null),
    [data, widthPx, heightPx],
  );

  const layers = useMemo(
    () => (data && view ? buildStaticLayers(data, view) : null),
    [data, view],
  );

  // Draw: one frame always; a rAF loop only while animating.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || !view || !layers) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.widthPx * dpr);
    canvas.height = Math.round(view.heightPx * dpr);

    const colors: ReplayColors = {
      road: cssColor(canvas, "--border-strong", "#2c4066"),
      crossing: cssColor(canvas, "--border", "#24334d"),
      path: cssColor(canvas, "--accent-soft", "#7cc4ff"),
      car: cssColor(canvas, "--foreground", "#e6edf7"),
      danger: cssColor(canvas, "--danger", "#ff5b49"),
    };
    const durationSec = Math.max(data.trace.meta.durationSec, 0.001);

    const render = (tSec: number): void => {
      drawFrame(ctx, dpr, view, layers, data, tSec, colors, pointRef.current);
      if (progressRef.current) {
        progressRef.current.style.width = `${Math.min(tSec / durationSec, 1) * 100}%`;
      }
    };

    if (reducedMotion) {
      // Static frame at the current step; the label derives at render time.
      const steps = data.steps;
      const t = steps[Math.min(stepIdx, steps.length - 1)] ?? 0;
      tSecRef.current = t;
      render(t);
      return;
    }

    render(tSecRef.current);
    if (!playing) return;

    let raf = 0;
    let lastMs = performance.now();
    const tick = (nowMs: number): void => {
      const dt = (nowMs - lastMs) / 1000;
      lastMs = nowMs;
      tSecRef.current = advancePlayhead(tSecRef.current, dt, durationSec);
      render(tSecRef.current);
      // The annotation label re-renders only when the active index changes.
      const idx = activeMarkerIndex(data.markers, tSecRef.current);
      if (idx !== labelIdxRef.current) {
        labelIdxRef.current = idx;
        setLabelBg(idx >= 0 ? data.markers[idx].labelBg : "");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, view, layers, playing, reducedMotion, stepIdx]);

  if (failed) return null;

  if (!data) {
    return (
      <div ref={wrapRef} className={className}>
        <div
          aria-hidden
          className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
        />
      </div>
    );
  }

  const stepCount = data.steps.length;
  const stepT = data.steps[Math.min(stepIdx, stepCount - 1)] ?? 0;
  const shownLabelBg = reducedMotion
    ? (markerAtStep(data.markers, stepT)?.labelBg ?? "")
    : labelBg;

  return (
    <figure ref={wrapRef} className={`flex w-full flex-col gap-2 ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Повторение на записа върху картата: ${data.markers.length} отбелязани момента`}
        className="w-full rounded-xl border border-border bg-surface-2/60"
        style={{ height: heightPx }}
      />

      <div className="flex items-center gap-2">
        {reducedMotion ? (
          <>
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              disabled={stepIdx === 0}
              aria-label="Предишен момент"
              className="btn-ghost px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(stepCount - 1, i + 1))}
              disabled={stepIdx >= stepCount - 1}
              aria-label="Следващ момент"
              className="btn-ghost px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              →
            </button>
            <span className="font-mono text-[11px] font-bold tabular-nums text-muted">
              Момент {Math.min(stepIdx + 1, stepCount)} от {stepCount}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Пауза" : "Пусни"}
            className="btn-ghost shrink-0 px-2 py-1"
          >
            {playing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
          </button>
        )}
        <div aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div ref={progressRef} className="h-full rounded-full bg-accent" style={{ width: "0%" }} />
        </div>
      </div>

      {/* Stored annotation copy only (ADR-002) — reserved height, no jumps. */}
      <figcaption className="min-h-11 text-xs leading-snug text-foreground/90">
        {shownLabelBg}
      </figcaption>
    </figure>
  );
}

export default MistakeReplay;
