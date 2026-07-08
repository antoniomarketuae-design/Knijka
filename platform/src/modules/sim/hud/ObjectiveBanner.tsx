"use client";

/**
 * Objective banner — top center. Shows the active objective ("Задача 2/3"),
 * an optional progress bar (driveDistance-style objectives) and, right after
 * an objective completes, a checkmark flash before advancing to the next one.
 *
 * The shell passes `flash` with a fresh `key` on every completion; the banner
 * owns the 1.6 s reveal timing.
 */

import { useEffect, useState } from "react";

export interface ObjectiveFlash {
  titleBg: string;
  /** Increment per completion so consecutive flashes re-trigger. */
  key: number;
}

export function ObjectiveBanner({
  titleBg,
  index,
  total,
  progress,
  flash,
}: {
  /** Active objective title; null when all objectives are done / free drive. */
  titleBg: string | null;
  /** 1-based index of the active objective. */
  index: number;
  total: number;
  /** 0..1 progress of the active objective; null hides the bar. */
  progress: number | null;
  flash: ObjectiveFlash | null;
}) {
  const [dismissedFlash, setDismissedFlash] = useState<ObjectiveFlash | null>(null);
  const showingFlash = flash !== null && flash !== dismissedFlash;

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setDismissedFlash(flash), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (showingFlash && flash) {
    return (
      <div
        role="status"
        className="hud-pop pointer-events-none flex items-center gap-2.5 rounded-2xl border px-5 py-2.5 backdrop-blur-md select-none"
        style={{
          borderColor: "color-mix(in srgb, var(--success) 60%, transparent)",
          background: "color-mix(in srgb, var(--success) 14%, var(--surface))",
        }}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-black"
          style={{ background: "var(--success)", color: "var(--accent-foreground)" }}
        >
          ✓
        </span>
        <span className="text-sm font-bold" style={{ color: "var(--success)" }}>
          {flash.titleBg}
        </span>
      </div>
    );
  }

  if (titleBg === null) return null;

  return (
    <div
      role="status"
      className="hud-banner-in pointer-events-none flex min-w-64 flex-col gap-1.5 rounded-2xl border border-border bg-surface/75 px-5 py-2.5 backdrop-blur-md select-none"
    >
      <div className="flex items-center gap-2.5">
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-accent">
          Задача {index}/{total}
        </span>
        <span className="text-sm font-bold text-foreground">{titleBg}</span>
      </div>
      {progress !== null ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              transition: "width 0.3s ease-out",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
