"use client";

/**
 * FollowGapCue — the „Дистанция · 34 м · 1,2 с" badge: the distance to the
 * vehicle the student is following, in the two units the lesson teaches it in.
 *
 * Isolated additive block, the `RearProximityCue` pattern it is the front twin
 * of: it polls `traffic.leadGapMeters` off the scene's shared per-frame sample
 * at ~5 Hz, owns no frame-loop wiring and reads and writes NOTHING in the rule
 * engine. `leadGapMeters` is a pure geometric query over `traffic.vehicles`;
 * calling it more often changes no grading, and the badge below renders.
 *
 * The pedagogy, the thresholds and the honesty contract are all in
 * `followGap.ts` — this file is the surface. Read that header first; in
 * particular the reason the severity ramp is the rule engine's own predicate
 * rather than a second set of numbers.
 *
 * SPLIT INTO A CONTAINER AND A PURE BADGE, for the reason `RearProximityCue`
 * states in full: the container only ever paints through a 5 Hz interval the
 * server renderer never runs, so `renderToStaticMarkup(<FollowGapCue/>)` is the
 * empty string in every state and the markup that reaches a student — the
 * `data-hud` name, the placement, the severity colour, the Bulgarian label a
 * screen reader announces — could not be asserted at all. This project has no
 * DOM test environment (`vitest.config.ts`: `environment: "node"`), so a
 * surface that cannot be server-rendered is a surface no test can see.
 */

import { useEffect, useState, type RefObject } from "react";
import {
  followCueLabelBg,
  stepFollowCue,
  type FollowCue,
  type FollowCueLevel,
  type FollowGapTarget,
} from "./followGap";

const POLL_MS = 200; // ~5 Hz — the rear cue's cadence, well under one glance

/** Structural slice of the traffic system (no cross-module type import). */
export interface LeadGapSource {
  leadGapMeters(px: number, py: number, headingDeg: number): number;
}

/** Structural slice of the scene's per-frame VehicleSample ref. */
export interface FollowCuePose {
  position: { x: number; y: number };
  headingDeg: number;
  speedKmh: number;
}

const LEVEL_COLOR: Record<FollowCueLevel, string> = {
  info: "var(--border-strong)",
  warn: "var(--warning)",
  danger: "var(--danger)",
};

/**
 * The gap glyph: the car ahead (seen from behind — the roofline and the two
 * brake lights the student is actually looking at) with the room in front of
 * him drawn as a measured span under it.
 */
function LeadCarIcon({ level }: { level: FollowCueLevel }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      {/* the lead car's rear end */}
      <path
        d="M6 9 l1.6 -3.4 h8.8 L18 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect
        x="4.5"
        y="9"
        width="15"
        height="6"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="7.6" cy="12" r="1.2" fill={level === "info" ? "currentColor" : "var(--danger)"} />
      <circle cx="16.4" cy="12" r="1.2" fill={level === "info" ? "currentColor" : "var(--danger)"} />
      {/* the gap itself — a span with an end tick each side */}
      <path
        d="M4.5 20 h15 M4.5 18 v4 M19.5 18 v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FollowGapCue({
  traffic,
  sampleRef,
  target,
  hidden = false,
}: {
  traffic: LeadGapSource;
  /** The scene's shared per-frame vehicle sample (read-only here). */
  sampleRef: RefObject<FollowCuePose | null>;
  /** The lesson's own following thresholds — see `followGapTarget()`. */
  target: FollowGapTarget;
  /** True while a pause/quiz/end overlay is up — badge off, poll stopped. */
  hidden?: boolean;
}) {
  const [cue, setCue] = useState<FollowCue | null>(null);

  // Poll only while visible. No state write on the hidden edge (lint: no
  // setState in effect bodies) — `hidden` gates the RENDER below instead,
  // which is just as honest: hidden ⇒ physics paused ⇒ traffic frozen, so the
  // held snapshot is still true when the overlay lifts.
  useEffect(() => {
    if (hidden) return;
    const id = window.setInterval(() => {
      const s = sampleRef.current;
      if (!s) return;
      const gapM = traffic.leadGapMeters(s.position.x, s.position.y, s.headingDeg);
      setCue((prev) => stepFollowCue(prev, gapM, s.speedKmh, target));
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [traffic, sampleRef, target, hidden]);

  if (hidden || cue === null) return null;
  return <FollowGapBadge cue={cue} />;
}

/** The badge itself, as a PURE surface — see the split note in the header. */
export function FollowGapBadge({ cue }: { cue: FollowCue }) {
  const color = LEVEL_COLOR[cue.level];
  const label = followCueLabelBg(cue);
  return (
    <div
      // NAMED, for the reason `RearProximityCue` had to learn twice: without a
      // `data-hud` every `closest("[data-hud]")` probe in tools/mobile reads
      // through this badge and reports it absent, and `PlayAreaStyles` owns no
      // selector that can reach it.
      data-hud="follow-gap"
      // Parked one row ABOVE the rear cue's 6.75rem floor: the two are the same
      // instrument pointing opposite ways and a session can raise both at once
      // (a queue with somebody on your bumper is the normal case, not the
      // corner one). `PlayAreaStyles` drops it ONTO that floor whenever there
      // is no rear chip to stack on, which is most of the time — the row above
      // is scarce on a landscape phone and the reasoning lives there, beside
      // the block that measured the floor in the first place.
      //
      // `bottom` stays a CLASS and not an inline style for the reason
      // `RearProximityCue` spells out: an inline declaration outranks every
      // selector in `PlayAreaStyles`, so the rule above would silently do
      // nothing and the chip would sit on the road forever.
      className="pointer-events-none absolute bottom-[9.5rem] left-1/2 z-10 -translate-x-1/2"
    >
      <div
        role="status"
        aria-label={label}
        className="hud-ghost flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums"
        style={{
          borderColor: color,
          color: cue.level === "info" ? "var(--foreground)" : color,
          // Damped severity ramps, never hard colour cuts (the perf/UX law).
          transition: "color 200ms linear, border-color 200ms linear",
        }}
      >
        <LeadCarIcon level={cue.level} />
        {label}
      </div>
    </div>
  );
}
