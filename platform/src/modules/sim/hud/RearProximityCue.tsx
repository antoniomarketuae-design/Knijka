"use client";

/**
 * RearProximityCue — the rear-awareness fallback badge (PROX): a small
 * „Кола отзад · X м" chip centered just above the status dashboard whenever a
 * REAL vehicle sits in the lane corridor behind the player within ~15 m.
 * Pure DOM overlay — works identically in cockpit/chase/top-down and on every
 * quality preset (it is the low-tier stand-in for the chase mirror strip,
 * which arrives in a later wave). NO sound, by design.
 *
 * Data path: polls traffic.rearGapMeters(player pose) at ~5 Hz off the shared
 * per-frame sample ref — no 60 Hz React state, no useFrame, and the poll
 * allocates only on a visible CHANGE (stepRearCue returns the previous
 * snapshot identity otherwise, so setState bails out). Honesty (doc 62
 * #39/#48): the badge renders exclusively from published traffic geometry —
 * stepRearCue maps the no-vehicle report (Infinity) to null in every state;
 * see rearProximity.ts and its tests.
 *
 * Placement: bottom-center at the shell's above-dashboard line (6.75rem —
 * the Minimap/legend row), clear of the minimap (right-3), the ribbon legend
 * (left-3), the touch sliders (edges) and the StatusDashboard itself.
 */

import { useEffect, useState, type RefObject } from "react";
import { rearCueLabelBg, stepRearCue, type RearCue, type RearCueLevel } from "./rearProximity";

const POLL_MS = 200; // ~5 Hz — well under one human glance of latency

/** Structural slice of the traffic system (no cross-module type import). */
export interface RearGapSource {
  rearGapMeters(px: number, py: number, headingDeg: number): number;
}

/** Structural slice of the scene's per-frame VehicleSample ref. */
export interface RearCuePose {
  position: { x: number; y: number };
  headingDeg: number;
  speedKmh: number;
}

const LEVEL_COLOR: Record<RearCueLevel, string> = {
  info: "var(--border-strong)",
  warn: "var(--warning)",
  danger: "var(--danger)",
};

/** Rear-view car glyph: body + roof + the two taillights. */
function RearCarIcon({ level }: { level: RearCueLevel }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path
        d="M5 10 l1.5 -4 h11 L19 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="10"
        width="17"
        height="7"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="7" cy="13.5" r="1.4" fill={level === "info" ? "currentColor" : "var(--danger)"} />
      <circle cx="17" cy="13.5" r="1.4" fill={level === "info" ? "currentColor" : "var(--danger)"} />
    </svg>
  );
}

export function RearProximityCue({
  traffic,
  sampleRef,
  hidden = false,
}: {
  traffic: RearGapSource;
  /** The scene's shared per-frame vehicle sample (read-only here). */
  sampleRef: RefObject<RearCuePose | null>;
  /** True while a pause/quiz/end overlay is up — badge off, poll stopped. */
  hidden?: boolean;
}) {
  const [cue, setCue] = useState<RearCue | null>(null);

  // Poll only while visible. No state write on the hidden edge (lint: no
  // setState in effect bodies) — `hidden` gates the RENDER below instead,
  // which is just as honest: hidden ⇒ physics paused ⇒ traffic frozen, so
  // the held snapshot is still true when the overlay lifts.
  useEffect(() => {
    if (hidden) return;
    const id = window.setInterval(() => {
      const s = sampleRef.current;
      if (!s) return;
      const gapM = traffic.rearGapMeters(s.position.x, s.position.y, s.headingDeg);
      setCue((prev) => stepRearCue(prev, gapM, s.speedKmh));
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [traffic, sampleRef, hidden]);

  if (hidden || cue === null) return null;

  const color = LEVEL_COLOR[cue.level];
  const label = rearCueLabelBg(cue);
  return (
    <div className="pointer-events-none absolute bottom-[6.75rem] left-1/2 z-10 -translate-x-1/2">
      <div
        role="status"
        aria-label={label}
        className="flex select-none items-center gap-1.5 rounded-full border bg-background/85 px-3 py-1.5 text-xs font-bold tabular-nums shadow-glow-sm backdrop-blur"
        style={{
          borderColor: color,
          color: cue.level === "info" ? "var(--foreground)" : color,
          // Damped severity ramps, never hard color cuts (the perf/UX law).
          transition: "color 200ms linear, border-color 200ms linear",
        }}
      >
        <RearCarIcon level={cue.level} />
        {label}
      </div>
    </div>
  );
}
