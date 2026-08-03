"use client";

/**
 * Objective banner — the top item of the RIGHT-EDGE NOTIFICATION COLUMN. Shows
 * the active objective ("Задача 2/3"), an optional progress bar (driveDistance
 * objectives) and, right after one completes, a checkmark flash before
 * advancing to the next.
 *
 * The shell passes `flash` with a fresh `key` on every completion; the banner
 * owns the 1.6 s reveal timing.
 *
 * ── 2026-08-03: IT IS NOT „TOP CENTER" ANY MORE. ─────────────────────────────
 * The founder's own annotated frame has this banner as the topmost of three
 * stacked cards across the middle of the road — the „ЗАДАЧА 2/2" panel — and
 * his instruction, for the third time, is to MOVE it, not to shrink it or fade
 * it. It is now a column item: `w-full` inside `notifyColumn.ts`'s geometry,
 * the chip above the title rather than beside it (a 20-character Bulgarian
 * objective and a chip do not share a 240 px line), small text, wrapping.
 *
 * `min-w-64` is gone with the centring. A 256 px floor inside a column that is
 * 141 px wide on a portrait iPhone is precisely the shape `hud-card-fit`'s last
 * section warns about: min-width is resolved AFTER max-width, so the floor wins
 * and the card hangs out of the stage.
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
        className="hud-ghost hud-pop pointer-events-none flex w-full min-w-0 items-center gap-2 rounded-2xl border px-3 py-1.5 select-none"
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
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black"
          style={{ background: "var(--success)", color: "var(--accent-foreground)" }}
        >
          ✓
        </span>
        <span
          className="min-w-0 break-words text-[11px] font-bold leading-tight"
          style={{ color: "var(--success)" }}
        >
          {flash.titleBg}
        </span>
      </div>
    );
  }

  if (titleBg === null) return null;

  return (
    <div
      role="status"
      className="hud-ghost hud-banner-in pointer-events-none flex w-full min-w-0 flex-col gap-1 px-1 py-0.5 select-none"
    >
      <span className="text-[10px] font-black uppercase tracking-wider text-accent">
        Задача {index}/{total}
      </span>
      <span className="break-words text-[11px] font-bold leading-tight text-foreground">
        {titleBg}
      </span>
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
