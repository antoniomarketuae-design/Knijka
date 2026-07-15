"use client";

/**
 * TraceTimeline — the Scenario Studio playback deck (doc 76 §5): play/pause,
 * 0.25/0.5/1× speed, a scrubbable bar with annotation tick marks (click →
 * jump + teach card), loop-section, and „стъпка по стъпка" jumps from
 * annotation to annotation (the founder's "4D" — time as an axis).
 *
 * Control seam: the SHARED TraceClock ref. The in-canvas ghost (ShadowCar)
 * advances clock.tSec inside useFrame; this DOM component only reads it on a
 * 100 ms poll (HUD perf grammar — no per-frame React) and writes on user
 * input. Touch targets keep the P1 ≥44 px law.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  activeAnnotationIndex,
  traceAnnotations,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";

const POLL_MS = 100;
const SPEEDS = [0.25, 0.5, 1] as const;

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface TraceTimelineProps {
  trace: ScenarioTrace;
  clockRef: React.RefObject<TraceClock>;
  /** Deck label, e.g. „Демонстрация — сянка" (default per trace kind). */
  titleBg?: string;
}

const KIND_TITLE_BG: Record<ScenarioTrace["meta"]["kind"], string> = {
  shadow: "Демонстрация — следвай сянката",
  mistake: "❌ Грешен подход — само гледай",
  attempt: "Твоят опит — повторение",
};

export function TraceTimeline({ trace, clockRef, titleBg }: TraceTimelineProps) {
  const duration = Math.max(trace.meta.durationSec, 0.001);
  const annotations = useMemo(() => traceAnnotations(trace), [trace]);

  const [snap, setSnap] = useState({ t: 0, playing: true, speed: 1, looping: false });
  const barRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  // Low-frequency clock mirror (the HUD poll pattern — never per frame).
  useEffect(() => {
    const id = window.setInterval(() => {
      const clock = clockRef.current;
      if (!clock) return;
      setSnap((prev) => {
        const next = {
          t: clock.tSec,
          playing: clock.playing,
          speed: clock.speed,
          looping: clock.loop !== null,
        };
        return prev.t === next.t &&
          prev.playing === next.playing &&
          prev.speed === next.speed &&
          prev.looping === next.looping
          ? prev
          : next;
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [clockRef]);

  const activeIdx = activeAnnotationIndex(annotations, snap.t);
  const active = activeIdx >= 0 ? annotations[activeIdx] : null;

  const seek = (tSec: number) => {
    const clock = clockRef.current;
    if (!clock) return;
    clock.tSec = Math.max(0, Math.min(duration, tSec));
    setSnap((s) => ({ ...s, t: clock.tSec }));
  };

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const f = (e.clientX - rect.left) / Math.max(1, rect.width);
    seek(f * duration);
  };

  const togglePlay = () => {
    const clock = clockRef.current;
    if (!clock) return;
    // Restart from the top when resuming at the very end.
    if (!clock.playing && clock.tSec >= duration - 0.01) clock.tSec = 0;
    clock.playing = !clock.playing;
    setSnap((s) => ({ ...s, playing: clock.playing }));
  };

  const setSpeed = (speed: number) => {
    const clock = clockRef.current;
    if (!clock) return;
    clock.speed = speed;
    setSnap((s) => ({ ...s, speed }));
  };

  /** „Стъпка по стъпка": jump to the prev/next annotation and hold there. */
  const step = (dir: -1 | 1) => {
    const clock = clockRef.current;
    if (!clock || annotations.length === 0) return;
    const t = clock.tSec;
    let target: number | null = null;
    if (dir > 0) {
      for (const a of annotations) {
        if (a.tSec > t + 0.05) {
          target = a.tSec;
          break;
        }
      }
    } else {
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (annotations[i].tSec < t - 0.05) {
          target = annotations[i].tSec;
          break;
        }
      }
      if (target === null) target = 0;
    }
    if (target === null) return;
    clock.playing = false;
    seek(target);
    setSnap((s) => ({ ...s, playing: false }));
  };

  /** Loop the CURRENT section — between the surrounding annotations (whole
   *  trace when none). Toggling off clears the loop. */
  const toggleLoop = () => {
    const clock = clockRef.current;
    if (!clock) return;
    if (clock.loop) {
      clock.loop = null;
    } else {
      let start = 0;
      let end = duration;
      for (const a of annotations) {
        if (a.tSec <= clock.tSec) start = a.tSec;
        else {
          end = a.tSec;
          break;
        }
      }
      clock.loop = { startSec: start, endSec: end };
    }
    setSnap((s) => ({ ...s, looping: clock.loop !== null }));
  };

  const loop = clockRef.current?.loop ?? null;
  const pct = (snap.t / duration) * 100;

  return (
    <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-1.5 select-none">
      {/* Annotation teach card */}
      {active?.textBg ? (
        <div className="mx-auto max-w-md rounded-xl border border-border bg-background/85 px-3.5 py-2 text-center text-sm font-medium backdrop-blur">
          {active.textBg}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/80 px-3 py-2.5 shadow-glow-sm backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-bold uppercase tracking-wider text-muted">
            {titleBg ?? KIND_TITLE_BG[trace.meta.kind]}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-muted">
            {fmt(snap.t)} / {fmt(duration)}
          </span>
        </div>

        {/* Scrub bar + annotation ticks */}
        <div
          ref={barRef}
          role="slider"
          aria-label="Позиция в демонстрацията"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(snap.t)}
          className="relative h-11 cursor-pointer touch-none"
          onPointerDown={(e) => {
            scrubbing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) seekFromPointer(e);
          }}
          onPointerUp={(e) => {
            scrubbing.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" />
          {/* Loop-section highlight */}
          {loop ? (
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/30"
              style={{
                left: `${(loop.startSec / duration) * 100}%`,
                width: `${(Math.min(loop.endSec, duration) - loop.startSec) / duration * 100}%`,
              }}
            />
          ) : null}
          {/* Progress */}
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
            style={{ width: `${pct}%` }}
          />
          {/* Annotation ticks */}
          {annotations.map((a, i) => (
            <button
              key={`${a.tSec}-${i}`}
              type="button"
              aria-label={a.textBg ?? `Анотация ${i + 1}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                const clock = clockRef.current;
                if (clock) clock.playing = false;
                seek(a.tSec);
              }}
              className="absolute top-1/2 h-11 w-6 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(a.tSec / duration) * 100}%` }}
            >
              <span
                className={`mx-auto block h-3.5 w-1.5 rounded-full ${
                  i === activeIdx ? "bg-accent" : "bg-muted"
                }`}
              />
            </button>
          ))}
          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-accent shadow"
            style={{ left: `${pct}%` }}
          />
        </div>

        {/* Transport controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={snap.playing ? "Пауза" : "Пусни"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-lg text-background"
            >
              {snap.playing ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Предишна стъпка"
              title="Стъпка по стъпка — назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted transition hover:text-foreground"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Следваща стъпка"
              title="Стъпка по стъпка — напред"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted transition hover:text-foreground"
            >
              ⏭
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSpeed(sp)}
                aria-pressed={snap.speed === sp}
                className={`flex h-9 min-w-11 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition ${
                  snap.speed === sp ? "bg-accent text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {sp}×
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleLoop}
            aria-pressed={snap.looping}
            className={`flex h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition ${
              snap.looping
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            🔁 Участък
          </button>
        </div>
      </div>
    </div>
  );
}
