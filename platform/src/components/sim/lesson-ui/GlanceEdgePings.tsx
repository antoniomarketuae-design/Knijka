"use client";

/**
 * GlanceEdgePings — the look-left/right teaching affordances (founder ruling
 * 2026-07-20, the doc 62 S5 design law: a graded action must carry an
 * information payoff). Two soft pulsing „огледай" cues at the screen edges
 * appear when the player approaches a junction whose drill GRADES observation
 * (JU-23 opt-in lessons, rungs L1–L2, „Съветник" ON — glancePingsEligible);
 * each side's cue fades into a ✓ the moment that side's GRADED glance
 * registers on the tick stream. On non-touch devices a subtle hold-to-glance
 * button cluster (left/rear/right) renders too — the SAME CabinControls
 * channel the Q/E/F keys drive, so the graded act (and the cabin head-turn)
 * is identical; touch devices already carry the TouchControls mirror row.
 *
 * Perf grammar: the tick observer registers into LessonScene's additive tap
 * ref and mutates pure state in place (advisor.ts observeGlancePingsTick —
 * zero per-frame allocations); React state updates ONLY on phase transitions.
 * The „Съветник" setting is re-read on a low-Hz interval (same-tab
 * localStorage writes fire no storage event). Grading is never touched here —
 * this file only CONSUMES the graded glance channel.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ADVISOR_STORAGE_KEY,
  createGlancePingsState,
  defaultAdvisorEnabled,
  glancePingsEligible,
  observeGlancePingsTick,
  parseStoredAdvisorSetting,
  resetGlancePings,
  type GlancePingPhase,
  type LessonSpec,
} from "@/modules/sim/lessons";
import type { SimTick } from "@/modules/sim/rules";
import type { CabinControls, MirrorGlanceKind } from "@/modules/sim/scene/cabin";

/** LessonScene's additive tick tap — read-only observer, runs before the shell. */
export type GlancePingTap = (tick: SimTick) => void;

/** Low-Hz „Съветник" setting re-read (ms) — transitions only, never per frame. */
const ADVISOR_POLL_MS = 500;

/** Same fallback chain as the shell's readStoredAdvisorOn (LessonPlayShell):
 *  persisted choice wins, else the lesson-level default. */
function readAdvisorOn(lesson: LessonSpec): boolean {
  try {
    return (
      parseStoredAdvisorSetting(window.localStorage.getItem(ADVISOR_STORAGE_KEY)) ??
      defaultAdvisorEnabled(lesson)
    );
  } catch {
    return defaultAdvisorEnabled(lesson);
  }
}

export function GlanceEdgePings({
  lesson,
  cabinRef,
  tapRef,
  hidden,
  showButtons,
}: {
  lesson: LessonSpec;
  cabinRef: RefObject<CabinControls | null>;
  /** LessonScene owns the ref; we install/remove our observer in it. */
  tapRef: RefObject<GlancePingTap | null>;
  /** True while paused (menu/quiz/teach/end) — nothing renders. */
  hidden: boolean;
  /** Non-touch devices: TouchControls is absent, so the subtle glance-button
   *  cluster (and the Q/E key hints on the pings) renders here. */
  showButtons: boolean;
}) {
  const eligible = useMemo(() => glancePingsEligible(lesson), [lesson]);
  const buttonsPossible = showButtons && lesson.examMode !== true;
  const [advisorOn, setAdvisorOn] = useState(() => readAdvisorOn(lesson));

  useEffect(() => {
    if (!eligible && !buttonsPossible) return; // nothing to ever toggle
    const id = window.setInterval(() => {
      const on = readAdvisorOn(lesson);
      setAdvisorOn((prev) => (prev === on ? prev : on));
    }, ADVISOR_POLL_MS);
    return () => window.clearInterval(id);
  }, [eligible, buttonsPossible, lesson]);

  // Pure ping state in a ref (tick rate); the snapshot below is React state
  // touched only when observeGlancePingsTick reports a phase transition.
  const stateRef = useRef(createGlancePingsState());
  const [pings, setPings] = useState<{ left: GlancePingPhase; right: GlancePingPhase }>({
    left: "off",
    right: "off",
  });

  const pingsActive = eligible && advisorOn;
  useEffect(() => {
    if (!pingsActive) return;
    const s = stateRef.current;
    tapRef.current = (tick) => {
      if (observeGlancePingsTick(s, tick)) setPings({ left: s.left, right: s.right });
    };
    return () => {
      tapRef.current = null;
      // Advisor toggled off mid-approach must not strand a ping on screen.
      resetGlancePings(s);
      setPings({ left: "off", right: "off" });
    };
  }, [pingsActive, tapRef]);

  if (hidden || (!pingsActive && !buttonsPossible)) return null;

  return (
    <>
      <style>{`
        @keyframes glance-ping-pulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.95; }
        }
        @keyframes glance-ping-done {
          0%   { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
        .glance-ping-pulse { animation: glance-ping-pulse 1.6s ease-in-out infinite; }
        .glance-ping-done  { animation: glance-ping-done 1.1s ease-out 0.35s both; }
        @media (prefers-reduced-motion: reduce) {
          .glance-ping-pulse { animation: none; opacity: 0.8; }
          .glance-ping-done  { animation: none; opacity: 0; visibility: hidden; }
        }
      `}</style>

      {pingsActive ? (
        <>
          <PingChip side="left" phase={pings.left} keyHint={showButtons ? "Q" : null} />
          <PingChip side="right" phase={pings.right} keyHint={showButtons ? "E" : null} />
        </>
      ) : null}

      {/* Desktop discoverability cluster — advisor ON only (a training aid,
          like the prompt card), hold-to-glance exactly like the keys. */}
      {buttonsPossible && advisorOn ? (
        <div
          className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5"
          role="group"
          aria-label="Поглед в огледалата"
        >
          <GlanceHoldButton
            cabinRef={cabinRef}
            mirror="left"
            labelBg="Поглед в лявото огледало — задръж"
            sideBg="Л"
            keyHint="Q"
          />
          <GlanceHoldButton
            cabinRef={cabinRef}
            mirror="rear"
            labelBg="Поглед в огледалото за задно виждане — задръж"
            sideBg="З"
            keyHint="F"
          />
          <GlanceHoldButton
            cabinRef={cabinRef}
            mirror="right"
            labelBg="Поглед в дясното огледало — задръж"
            sideBg="Д"
            keyHint="E"
          />
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** One edge cue: pulsing „огледай" while pending, a fading ✓ once satisfied. */
function PingChip({
  side,
  phase,
  keyHint,
}: {
  side: "left" | "right";
  phase: GlancePingPhase;
  keyHint: string | null;
}) {
  if (phase === "off") return null;
  const done = phase === "done";
  const arrow = side === "left" ? "◄" : "►";
  const label = done ? "✓" : "огледай";
  return (
    <div
      className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 select-none ${
        side === "left" ? "left-2" : "right-2"
      }`}
      role="status"
      aria-label={
        done
          ? `Погледна ${side === "left" ? "наляво" : "надясно"}`
          : `Погледни ${side === "left" ? "наляво" : "надясно"} преди кръстовището`
      }
    >
      <div
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur ${
          done
            ? "glance-ping-done border-success/60 bg-background/80 text-success"
            : "glance-ping-pulse border-accent-2/60 bg-background/70 text-accent-2"
        }`}
      >
        {side === "left" ? <span aria-hidden>{arrow}</span> : null}
        <span>{label}</span>
        {!done && keyHint !== null ? (
          <kbd className="rounded bg-surface px-1 py-px text-center font-mono text-[10px] font-bold text-accent">
            {keyHint}
          </kbd>
        ) : null}
        {side === "right" ? <span aria-hidden>{arrow}</span> : null}
      </div>
    </div>
  );
}

/**
 * Hold-to-glance button: pointer down starts the SAME graded hold the Q/E/F
 * keys drive (CabinControls.glanceStart — latches once per hold), any release
 * path ends it. Subtle by design — discoverability, not alarm.
 */
function GlanceHoldButton({
  cabinRef,
  mirror,
  labelBg,
  sideBg,
  keyHint,
}: {
  cabinRef: RefObject<CabinControls | null>;
  mirror: MirrorGlanceKind;
  labelBg: string;
  sideBg: string;
  keyHint: string;
}) {
  const heldRef = useRef(false);
  const start = () => {
    heldRef.current = true;
    cabinRef.current?.glanceStart(mirror);
  };
  const end = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    cabinRef.current?.glanceEnd(mirror);
  };
  // A pause/unmount mid-hold must never leave the head turned.
  useEffect(() => end, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto flex touch-none select-none flex-col items-center gap-0.5 rounded-xl border border-border bg-background/50 px-2 py-1.5 text-muted opacity-80 backdrop-blur transition hover:opacity-100 hover:text-foreground active:border-accent active:bg-accent/20 active:text-foreground motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className="flex h-5 w-7 items-center justify-center rounded-[4px] border border-current text-[11px] font-extrabold"
      >
        {sideBg}
      </span>
      <kbd aria-hidden className="font-mono text-[9px] font-bold text-accent">
        {keyHint}
      </kbd>
    </button>
  );
}
