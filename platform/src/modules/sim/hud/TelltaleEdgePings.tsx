"use client";

/**
 * TelltaleEdgePings — the armed cabin faults, surfaced at the screen edges in
 * the views where the instrument panel is out of frame.
 *
 * Founder review 2026-07-28: „from the POV behind the car … enough space that
 * we can use semi brightness/mini shadowed on the left and right side space for
 * warnings … a ping where the user can see what is missing, currently he only
 * sees in the dashboard."
 *
 * Design rules taken literally from that ruling:
 *  - QUIET. Dimmed chips (opacity ~0.72, soft shadow, no flashing) — the belt
 *    warning is already the thing that makes him nervous; a second flashing
 *    modal would be the same bug in a new place. Only the danger tone gets a
 *    slow 2 s breath, and prefers-reduced-motion kills even that.
 *  - EDGES ONLY. Fixed to the left/right rails at 34 % of the scene height:
 *    above the car and the road in chase view, below the objective banner, and
 *    clear of both the GlanceEdgePings row (vertically centred) and the status
 *    bar. They never sit over the road corridor or the mirrors.
 *  - COCKPIT VIEW IS EXEMPT. There the real cluster IS in frame and lights its
 *    own telltales — doubling them would be the tutorial-arrow smell.
 *
 * Perf grammar: the scene mutates one DashboardStatus object per frame; this
 * samples it on a low-Hz interval and re-renders only when the ARMED SET
 * changes (telltaleWarningsKey) — the StatusDashboard poll precedent. No 60 Hz
 * React state. Nothing here reads or writes grading.
 */

import { useEffect, useState, type RefObject } from "react";
import { createDashboardStatus, type DashboardStatus } from "./dashboardStatus";
import {
  armedTelltaleWarnings,
  telltaleWarningsKey,
  type TelltaleWarning,
} from "./telltaleWarnings";

/** Same cadence as the status bar — a telltale does not need 60 Hz. */
const POLL_MS = 250;
/** Never stack more than this per side; the rest stay on the instrument bar. */
const MAX_PER_SIDE = 2;

export function TelltaleEdgePings({
  statusRef,
  /** False in cockpit view (the cluster is in frame) and while any pause /
   *  quiz / teach / end overlay is up. */
  active,
  /** Show the fixing key on the chip — non-touch devices only. */
  showKeyHints = true,
}: {
  statusRef: RefObject<DashboardStatus>;
  active: boolean;
  showKeyHints?: boolean;
}) {
  const [warnings, setWarnings] = useState<TelltaleWarning[]>([]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const s = statusRef.current ?? createDashboardStatus();
      const next = armedTelltaleWarnings(s);
      setWarnings((prev) =>
        telltaleWarningsKey(prev) === telltaleWarningsKey(next) ? prev : next,
      );
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      // Cleanup, not effect body: switching back to the cockpit or opening a
      // pause overlay must not leave a stale chip to flash on the next entry.
      setWarnings((prev) => (prev.length === 0 ? prev : []));
    };
  }, [active, statusRef]);

  if (!active || warnings.length === 0) return null;

  const left = warnings.filter((w) => w.side === "left").slice(0, MAX_PER_SIDE);
  const right = warnings.filter((w) => w.side === "right").slice(0, MAX_PER_SIDE);

  return (
    <>
      <style>{`
        @keyframes telltale-breath {
          0%, 100% { opacity: 0.62; }
          50%      { opacity: 0.95; }
        }
        .telltale-breath { animation: telltale-breath 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .telltale-breath { animation: none; opacity: 0.85; }
        }
      `}</style>
      <EdgeColumn side="left" warnings={left} showKeyHints={showKeyHints} />
      <EdgeColumn side="right" warnings={right} showKeyHints={showKeyHints} />
    </>
  );
}

function EdgeColumn({
  side,
  warnings,
  showKeyHints,
}: {
  side: "left" | "right";
  warnings: TelltaleWarning[];
  showKeyHints: boolean;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      // Vertical band, picked from measured frames rather than taste — and it
      // differs by width because the overlay stack does:
      //   ≥sm  the controls legend opens by DEFAULT (non-touch) and runs ~350 px
      //        down the left column, so an upper chip lands on top of it →
      //        anchor to the lower rail, above the status bar and the map chip.
      //   <sm  the legend starts collapsed (touch) but the car fills the lower
      //        third of a 374 px-wide frame, so the lower rail clips its flank →
      //        anchor at 30 % height, on the verge beside the road.
      // Either way: never over the road corridor, and chase/top-down have no
      // mirrors to cover. The glance pings own the exact vertical centre.
      className={`pointer-events-none absolute top-[30%] z-10 flex max-w-[42%] flex-col gap-1.5 sm:top-auto sm:bottom-[8.75rem] ${
        side === "left" ? "left-2 items-start" : "right-2 items-end"
      }`}
      role="status"
      aria-label={side === "left" ? "Предупреждения — ляво" : "Предупреждения — дясно"}
    >
      {warnings.map((w) => (
        <Chip key={w.id} warning={w} side={side} showKeyHint={showKeyHints} />
      ))}
    </div>
  );
}

function Chip({
  warning,
  side,
  showKeyHint,
}: {
  warning: TelltaleWarning;
  side: "left" | "right";
  showKeyHint: boolean;
}) {
  const color = warning.tone === "danger" ? "var(--danger)" : "var(--warning)";
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold leading-none backdrop-blur-sm sm:px-2.5 sm:text-[11px] ${
        warning.tone === "danger" ? "telltale-breath" : "opacity-70"
      } ${side === "left" ? "flex-row" : "flex-row-reverse"}`}
      style={{
        // „semi brightness / mini shadowed": tinted glass, never a solid card.
        color,
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        background: "color-mix(in srgb, var(--background) 62%, transparent)",
        boxShadow: `0 1px 10px color-mix(in srgb, ${color} 18%, transparent)`,
      }}
    >
      <TelltaleGlyph id={warning.id} />
      <span>{warning.labelBg}</span>
      {showKeyHint && warning.keyHint !== null ? (
        <kbd className="rounded bg-surface/80 px-1 py-px font-mono text-[9px] font-bold text-accent">
          {warning.keyHint}
        </kbd>
      ) : null}
    </div>
  );
}

/** Tiny monochrome glyphs (currentColor) — the bar's icons at chip scale. */
function TelltaleGlyph({ id }: { id: TelltaleWarning["id"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      {id === "belt" ? (
        <>
          <circle cx="12" cy="6" r="3" {...common} strokeWidth="2" />
          <path d="M6 20 L18 10" {...common} strokeWidth="2.6" />
        </>
      ) : id === "handbrake" ? (
        <>
          <circle cx="12" cy="12" r="8.5" {...common} strokeWidth="2" />
          <path d="M9.5 16 V8 h3.2 a2.6 2.6 0 0 1 0 5.2 H9.5" {...common} strokeWidth="2" />
        </>
      ) : id === "fog" ? (
        <>
          <path d="M10 5 a7 7 0 0 0 0 14 z" {...common} strokeWidth="2" strokeLinejoin="round" />
          <path d="M12.5 7 h7 M12.5 12 h7 M12.5 17 h7" {...common} strokeWidth="1.8" />
          <path d="M17.5 5.5 q-2 3.25 0 6.5 t0 6.5" {...common} strokeWidth="1.6" />
        </>
      ) : id === "hazards" ? (
        <path d="M12 4 L20 18 H4 Z" {...common} strokeWidth="2" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M11 5 a7 7 0 0 0 0 14 z" {...common} strokeWidth="2" strokeLinejoin="round" />
          <path d="M13.5 8.8 L20 7 M13.5 12 h6.5 M13.5 15.2 L20 17" {...common} strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}
