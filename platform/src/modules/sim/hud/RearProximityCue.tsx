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
 *
 * ── THE ONE SURFACE THAT LIST FORGOT: THE DEMONSTRATION PLAYER ─────────────
 *
 * sweep161, `sc-follow-tailgater/pc-right/04-t098s.png`: *„The tailgater is
 * invisible for the whole drive. Once the demonstration player takes over the
 * corner where the 'Кола отзад' chip lived, there is no cue at all that a car
 * is glued to the bumper — not in the mirror (covered), not in the cockpit,
 * not on the HUD — in the one lesson that is entirely about a car behind
 * you."*
 *
 * The enumeration above is the defect. It names four neighbours and clears all
 * four; the „ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА" transport was never added to it,
 * and it is the widest thing on the bottom edge. MEASURED off that frame
 * (1440×900 PC, play area 265…1430 × 110…750): the player panel occupies
 * 107–213 px above the play area's floor and this badge sits at 6.75rem =
 * 108 px — the two overlap at the player's own bottom edge, and the badge is
 * `z-10` under it.
 *
 * WHY IT LANDS HARDEST HERE. The chip is legible on lessons without a shadow
 * — it is photographed intact on `sc-signal-controller/mobile-right` reading
 * «Кола отзад · 11 м» — and the transport is up for the whole drive on exactly
 * the shadow-following family, which is the family whose subject is the car
 * behind you. So the badge disappears precisely where it is the lesson.
 *
 * NOT FIXED HERE, AND THE REASON IS NOT TIMIDITY. This component cannot see
 * the transport: it takes a traffic source and a pose ref, and nothing else.
 * Moving the default band would relocate a placement that is verified good on
 * every lesson without a shadow, to fix the ones with; adding a prop nobody
 * passes would repeat the `DebriefContext.coachedMistakes` mistake this same
 * sweep found (a channel built, tested and never fed). The shell owns the
 * answer — `components/sim/lesson-ui/LessonPlayShell.tsx` knows when the
 * transport is mounted, and `PlayAreaStyles.tsx` is the established way to say
 * so without drilling a prop through the 3D tree (its own „compact stage"
 * rules key off the shell's data attributes for exactly this reason). Routed
 * there: the badge needs to lift above 213 px while the transport is up.
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
        className="hud-ghost flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums"
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
