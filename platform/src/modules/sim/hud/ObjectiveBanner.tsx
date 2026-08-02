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
        className="hud-ghost hud-pop pointer-events-none flex items-center gap-2.5 rounded-2xl border px-5 py-2.5 select-none"
        style={{
          borderColor: "color-mix(in srgb, var(--success) 60%, transparent)",
        }}
      >
        {/* The tick is a lit lamp, not a chip: `data-hud-ink` holds its fill
            through the UNPANEL sweep, exactly as the reference keeps its one
            filled green „BEST" badge on an otherwise unfilled screen. */}
        <span
          aria-hidden
          data-hud-ink=""
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
    // The founder's own annotated phone frame has this banner as the topmost of
    // three stacked cards — the „ЗАДАЧА 2/2" panel. It is the same instruction
    // either way; the card around it was never the instruction.
    <div
      role="status"
      className="hud-ghost hud-banner-in pointer-events-none flex min-w-64 flex-col gap-1.5 px-5 py-2.5 select-none"
    >
      <div className="flex items-center gap-2.5">
        <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-accent">
          Задача {index}/{total}
        </span>
        <span className="text-sm font-bold text-foreground">{titleBg}</span>
      </div>
      {progress !== null ? (
        // A progress bar IS its fill — both halves are marked so the sweep
        // leaves them alone. It is two hairline-thin bars of colour on the
        // image, which is how the reference draws its own meters.
        <div
          data-hud-ink=""
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(226, 234, 247, 0.22)" }}
        >
          <div
            data-hud-ink=""
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
