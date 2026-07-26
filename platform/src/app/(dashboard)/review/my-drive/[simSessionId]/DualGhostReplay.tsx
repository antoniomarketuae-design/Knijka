"use client";

/**
 * „Твоят дубъл" + the dual ghost (doc 82 §5.3 I2/I3) — the student's own
 * recorded drive, played back over its district, with one authored correct
 * drive running beside it on the SAME clock.
 *
 * Deliberately a 2D top-down canvas and not the 3D scene, for the reason the
 * doc gives in §7.4 item 26 and §2: the replay must open on a mid-range phone
 * in a second, and a full R3F world costs the whole simulator bundle plus a
 * district fetch plus a physics world for a screen with no physics in it. All
 * interpolation comes from `sampleAt` — the same code the 3D ghost player runs
 * — so this view can never disagree with what the simulator would draw. (The
 * 3D ShadowCar mount remains the upgrade path; nothing here blocks it, because
 * both consume the identical model.)
 *
 * What makes it a lesson rather than a toy:
 *  - it OPENS on the run-up to the worst fault, not on the fault (the decision
 *    was taken seconds earlier — that is the part worth watching);
 *  - every marker carries the rule catalog's authored `correctiveBg`, i.e.
 *    „какво трябваше да направя", stored copy only (ADR-002);
 *  - 0.25× exists because the moment being examined is usually under a second;
 *  - the divergence strip is a DISTANCE, never a score. There is not one
 *    correct line, and nothing on this screen grades anything: the rule engine
 *    convicts from events, and it already did.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MinimapPolyline } from "@/modules/sim/hud";
import {
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  tracePathForRibbon,
  type ScenarioTrace,
  type TracePoint,
} from "@/modules/sim/traces";
import type { AttemptFault } from "@/modules/sim/traces/attemptReel";
import {
  districtRoadPolylines,
  fitReplayView,
  replayToCanvas,
  traceBounds,
  type ReplayBounds,
  type ReplayView,
} from "@/modules/clips/replay/mistakeReplayCore";
import {
  DIVERGENCE_NOTABLE_GAP_M,
  divergenceSeries,
  firstDivergenceSec,
  type DivergenceSeries,
} from "@/modules/clips/replay/dualGhostCore";

/** Playback rates offered. 0.25× is the point of the screen, not a garnish. */
const SPEEDS = [0.25, 0.5, 1] as const;

/** Largest single rAF step, sec — a background-tab return must not teleport. */
const MAX_STEP_SEC = 0.25;

interface LoadedExtras {
  roads: MinimapPolyline[] | null;
  shadow: ScenarioTrace | null;
}

interface Colors {
  road: string;
  attempt: string;
  shadow: string;
  danger: string;
  warning: string;
  muted: string;
}

function cssColor(el: HTMLElement, v: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(v).trim() || fallback;
}

const SEVERITY_TONE: Record<AttemptFault["severityClass"], string> = {
  opasna: "var(--danger)",
  osnovna: "var(--warning)",
  vtorostepenna: "var(--accent-soft)",
};

function clock(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = Math.floor(tSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Bounds that contain BOTH drives. Fitting only the student's path would push
 * the correct line off-screen exactly when it diverges — i.e. at the one
 * moment the comparison is worth anything.
 */
function unionBounds(a: ReplayBounds, b: ReplayBounds): ReplayBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  view: ReplayView,
  point: TracePoint,
  color: string,
  scale: number,
): void {
  const [cx, cy] = replayToCanvas(view, point.x, point.y);
  ctx.save();
  ctx.translate(cx, cy);
  // headingDeg: 0 = north (up), clockwise — canvas rotate is clockwise.
  ctx.rotate((point.headingDeg * Math.PI) / 180);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -8 * scale);
  ctx.lineTo(5.5 * scale, 7 * scale);
  ctx.lineTo(-5.5 * scale, 7 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function DualGhostReplay({
  trace,
  faults,
  districtId,
  shadowTraceUrl,
  startAtSec,
}: {
  trace: ScenarioTrace;
  faults: AttemptFault[];
  /** District under public/world/, e.g. "jx-v1"; null = no map backdrop. */
  districtId: string | null;
  /** Public URL of the authored correct drive; null = single ghost. */
  shadowTraceUrl: string | null;
  /** Where the playhead opens — the run-up to the worst fault. */
  startAtSec: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attemptPointRef = useRef<TracePoint>(createTracePoint());
  const shadowPointRef = useRef<TracePoint>(createTracePoint());
  const tSecRef = useRef(startAtSec);

  const [extras, setExtras] = useState<LoadedExtras>({ roads: null, shadow: null });
  const [widthPx, setWidthPx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.5);
  // Mirrors tSecRef for the readouts only; the canvas never waits on React.
  const [tSecView, setTSecView] = useState(startAtSec);
  const [selectedFault, setSelectedFault] = useState<number | null>(
    faults.length > 0 ? 0 : null,
  );

  const durationSec = Math.max(trace.meta.durationSec, 0.001);

  // Both side assets are optional garnish: a failed fetch costs the backdrop
  // or the comparison, never the replay of the student's own drive.
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    const fetchJson = async (url: string): Promise<unknown | null> => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        return res.ok ? ((await res.json()) as unknown) : null;
      } catch {
        return null;
      }
    };
    void (async () => {
      const [districtRaw, shadowRaw] = await Promise.all([
        districtId !== null ? fetchJson(`/world/${districtId}.json`) : Promise.resolve(null),
        shadowTraceUrl !== null ? fetchJson(shadowTraceUrl) : Promise.resolve(null),
      ]);
      if (!alive) return;
      let shadow: ScenarioTrace | null = null;
      if (shadowRaw !== null) {
        // Never trust fetched JSON (the store.ts law) — a malformed shadow
        // degrades to the single ghost rather than NaN positions in the world.
        try {
          shadow = parseScenarioTrace(shadowRaw);
        } catch {
          shadow = null;
        }
      }
      setExtras({
        roads: districtRaw !== null ? districtRoadPolylines(districtRaw) : null,
        shadow,
      });
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [districtId, shadowTraceUrl]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidthPx(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const heightPx = Math.max(200, Math.min(360, Math.round(widthPx * 0.62)));

  const bounds = useMemo(() => {
    const own = traceBounds(trace);
    return extras.shadow !== null ? unionBounds(own, traceBounds(extras.shadow)) : own;
  }, [trace, extras.shadow]);

  const view = useMemo(
    () => (widthPx > 0 ? fitReplayView(bounds, widthPx, heightPx) : null),
    [bounds, widthPx, heightPx],
  );

  const divergence: DivergenceSeries | null = useMemo(
    () => (extras.shadow !== null ? divergenceSeries(trace, extras.shadow) : null),
    [trace, extras.shadow],
  );
  const partedAtSec = useMemo(
    () => (divergence !== null ? firstDivergenceSec(divergence) : null),
    [divergence],
  );

  /** Static layers rebuilt only on data/viewport change; the per-frame loop
   *  just strokes cached Path2Ds (the MistakeReplay perf model). */
  const layers = useMemo(() => {
    if (view === null) return null;
    const roadsPath = new Path2D();
    for (const line of extras.roads ?? []) {
      if (line.points.length < 2) continue;
      let first = true;
      for (const [wx, wy] of line.points) {
        const [cx, cy] = replayToCanvas(view, wx, wy);
        if (first) {
          roadsPath.moveTo(cx, cy);
          first = false;
        } else roadsPath.lineTo(cx, cy);
      }
    }
    const pathOf = (t: ScenarioTrace): Path2D => {
      const p = new Path2D();
      const ribbon = tracePathForRibbon(t);
      for (let i = 0; i < ribbon.count; i++) {
        const [cx, cy] = replayToCanvas(view, ribbon.pts[i * 2], ribbon.pts[i * 2 + 1]);
        if (i === 0) p.moveTo(cx, cy);
        else p.lineTo(cx, cy);
      }
      return p;
    };
    return {
      roadsPath,
      attemptPath: pathOf(trace),
      shadowPath: extras.shadow !== null ? pathOf(extras.shadow) : null,
      faultsPx: faults.map((f) => replayToCanvas(view, f.x, f.y)),
    };
  }, [view, extras.roads, extras.shadow, trace, faults]);

  const render = useCallback(
    (tSec: number): void => {
      const canvas = canvasRef.current;
      if (!canvas || view === null || layers === null) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const colors: Colors = {
        road: cssColor(canvas, "--border-strong", "#2c4066"),
        attempt: cssColor(canvas, "--warning", "#ffc857"),
        shadow: cssColor(canvas, "--accent-soft", "#7cc4ff"),
        danger: cssColor(canvas, "--danger", "#ff5b49"),
        warning: cssColor(canvas, "--warning", "#ffc857"),
        muted: cssColor(canvas, "--muted", "#8fa3c0"),
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, view.widthPx, view.heightPx);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = colors.road;
      ctx.lineWidth = 2;
      ctx.stroke(layers.roadsPath);

      // The two full paths, faint: the shape of both decisions, at a glance.
      ctx.globalAlpha = 0.35;
      if (layers.shadowPath !== null) {
        ctx.strokeStyle = colors.shadow;
        ctx.lineWidth = 1.5;
        ctx.stroke(layers.shadowPath);
      }
      ctx.strokeStyle = colors.attempt;
      ctx.lineWidth = 1.5;
      ctx.stroke(layers.attemptPath);
      ctx.globalAlpha = 1;

      // Fault markers — persistent, severity-coloured, ringed when selected.
      layers.faultsPx.forEach(([cx, cy], i) => {
        const fault = faults[i];
        ctx.fillStyle =
          fault.severityClass === "opasna"
            ? colors.danger
            : fault.severityClass === "osnovna"
              ? colors.warning
              : colors.muted;
        ctx.globalAlpha = i === selectedFault ? 1 : 0.55;
        ctx.beginPath();
        ctx.arc(cx, cy, i === selectedFault ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // The correct drive first, so the student's own car is never hidden
      // behind it at the moments where they coincide.
      if (extras.shadow !== null) {
        sampleAt(extras.shadow, tSec, shadowPointRef.current);
        drawCar(ctx, view, shadowPointRef.current, colors.shadow, 0.85);
      }
      sampleAt(trace, tSec, attemptPointRef.current);
      drawCar(ctx, view, attemptPointRef.current, colors.attempt, 1);
    },
    [view, layers, faults, selectedFault, extras.shadow, trace],
  );

  // One frame always; a rAF loop only while playing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view === null) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.widthPx * dpr);
    canvas.height = Math.round(view.heightPx * dpr);
    render(tSecRef.current);
  }, [view, render]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastMs = performance.now();
    const tick = (nowMs: number): void => {
      const dt = Math.min((nowMs - lastMs) / 1000, MAX_STEP_SEC) * speed;
      lastMs = nowMs;
      const next = tSecRef.current + dt;
      // Loop rather than stop: the whole value of the screen is watching the
      // same three seconds until the mistake is obvious.
      tSecRef.current = next >= durationSec ? 0 : next;
      setTSecView(tSecRef.current);
      render(tSecRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationSec, render]);

  const seek = useCallback(
    (tSec: number): void => {
      const clamped = Math.min(Math.max(tSec, 0), durationSec);
      tSecRef.current = clamped;
      setTSecView(clamped);
      render(clamped);
    },
    [durationSec, render],
  );

  const jumpToFault = (index: number): void => {
    setSelectedFault(index);
    // Land on the run-up, not the conviction: the choice happened earlier.
    seek(Math.max(0, faults[index].tSec - 3));
  };

  const fault = selectedFault !== null ? (faults[selectedFault] ?? null) : null;

  return (
    <div ref={wrapRef} className="flex w-full flex-col gap-4">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Повторение на твоето каране: ${faults.length} отбелязани грешки`}
        className="w-full rounded-xl border border-border bg-surface-2/60"
        style={{ height: heightPx }}
      />

      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary px-4 py-1.5 text-sm"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "Пауза" : "Пусни"}
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="Скорост">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={
                speed === s
                  ? "btn-primary px-2.5 py-1 text-xs"
                  : "btn-ghost px-2.5 py-1 text-xs"
              }
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="font-mono text-xs font-bold tabular-nums text-muted">
          {clock(tSecView)} / {clock(durationSec)}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="visually-hidden">Позиция във времето</span>
        <input
          type="range"
          min={0}
          max={durationSec}
          step={0.05}
          value={tSecView}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full"
        />
      </label>

      {/* Legend — states plainly that the blue line is ONE correct answer. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-muted">
        <span>
          <span
            aria-hidden
            className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--warning)" }}
          />
          ти
        </span>
        {extras.shadow !== null ? (
          <span>
            <span
              aria-hidden
              className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--accent-soft)" }}
            />
            едно правилно изпълнение
          </span>
        ) : null}
        {faults.length > 0 ? <span>точките са отчетените грешки</span> : null}
      </div>

      {/* I3: the divergence strip — a distance, never a score. */}
      {divergence !== null && divergence.points.length > 1 ? (
        <section aria-label="Разминаване" className="flex flex-col gap-2">
          <h2 className="text-sm font-extrabold">Къде се разминахте</h2>
          <DivergenceStrip series={divergence} tSec={tSecView} onSeek={seek} />
          <p className="text-[11px] leading-relaxed text-muted">
            {partedAtSec !== null ? (
              <>
                Линиите се разделят около{" "}
                <button
                  type="button"
                  className="font-mono font-bold text-accent underline"
                  onClick={() => seek(Math.max(0, partedAtSec - 2))}
                >
                  {clock(partedAtSec)}
                </button>{" "}
                — там е решението, а не там, където разликата е най-голяма.
              </>
            ) : (
              <>
                Двете карания не се отделят повече от {DIVERGENCE_NOTABLE_GAP_M} м
                едно от друго — линията ти е същата, разликата е в изпълнението.
              </>
            )}
          </p>
        </section>
      ) : null}

      {/* Faults — the reason the screen exists. */}
      {faults.length > 0 ? (
        <section aria-label="Отчетени грешки" className="flex flex-col gap-2">
          <h2 className="text-sm font-extrabold">Отчетени грешки ({faults.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            {faults.map((f, i) => (
              <button
                key={`${f.code}@${f.tSec}`}
                type="button"
                aria-pressed={selectedFault === i}
                onClick={() => jumpToFault(i)}
                className={`rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${
                  selectedFault === i ? "border-accent text-accent" : "border-border text-muted"
                }`}
              >
                {clock(f.tSec)}
              </button>
            ))}
          </div>

          {fault !== null ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-sm font-bold"
                  style={{ color: SEVERITY_TONE[fault.severityClass] }}
                >
                  {fault.titleBg}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {clock(fault.tSec)}
                </span>
              </div>
              {fault.explanationBg.length > 0 ? (
                <p className="text-xs leading-relaxed text-muted">{fault.explanationBg}</p>
              ) : null}
              {/* The authored corrective — the whole point of watching this
                  again. Stored catalog copy, never generated (ADR-002). */}
              {fault.correctiveBg !== null ? (
                <p className="text-xs font-semibold leading-relaxed">
                  <span className="text-success">✔ Правилното действие:</span>{" "}
                  {fault.correctiveBg}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {fault.lawRef.length > 0 ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
                    {fault.lawRef}
                  </span>
                ) : null}
                {/* Never claim the engine placed a marker it did not. */}
                {fault.positionExact ? null : (
                  <span className="text-[10px] text-muted">
                    позицията е възстановена от записа
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="rounded-lg border border-hair bg-surface-2/40 p-4 text-sm leading-relaxed text-muted">
          В това каране няма отчетени грешки. Пак си струва да го изгледаш: и
          чистото каране има форма — виж колко рано си спрял и колко плавно.
        </p>
      )}
    </div>
  );
}

/**
 * The gap between the two drives over time, as a filled area with a playhead.
 * Clicking it seeks — the strip is the index of the comparison, not decoration.
 */
function DivergenceStrip({
  series,
  tSec,
  onSeek,
}: {
  series: DivergenceSeries;
  tSec: number;
  onSeek: (tSec: number) => void;
}) {
  const W = 640;
  const H = 64;
  const maxGap = Math.max(series.maxGapM, DIVERGENCE_NOTABLE_GAP_M);
  const x = (t: number) => (t / Math.max(series.durationSec, 0.001)) * W;
  const y = (gap: number) => H - (gap / maxGap) * H;

  const d = [
    `M 0 ${H}`,
    ...series.points.map((p) => `L ${x(p.tSec).toFixed(2)} ${y(p.gapM).toFixed(2)}`),
    `L ${W} ${H}`,
    "Z",
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Разстояние между двете карания, най-голямо ${series.maxGapM.toFixed(1)} метра`}
      className="w-full cursor-pointer rounded-lg border border-border bg-surface-2/40"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        onSeek(((e.clientX - rect.left) / rect.width) * series.durationSec);
      }}
    >
      <path d={d} fill="var(--accent-soft)" opacity={0.35} />
      {/* The band inside which the two drives are the same manoeuvre. */}
      <line
        x1={0}
        y1={y(DIVERGENCE_NOTABLE_GAP_M)}
        x2={W}
        y2={y(DIVERGENCE_NOTABLE_GAP_M)}
        stroke="var(--border-strong)"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <line
        x1={x(Math.min(tSec, series.durationSec))}
        y1={0}
        x2={x(Math.min(tSec, series.durationSec))}
        y2={H}
        stroke="var(--warning)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export default DualGhostReplay;
