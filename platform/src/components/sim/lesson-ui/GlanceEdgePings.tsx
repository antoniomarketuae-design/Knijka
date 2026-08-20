"use client";

/**
 * GlanceEdgePings — the look-left/right teaching affordances (founder ruling
 * 2026-07-20, the doc 62 S5 design law: a graded action must carry an
 * information payoff). Two soft pulsing „огледай" cues at the screen edges
 * appear when the player approaches a junction whose drill GRADES observation
 * (rungs up to GLANCE_PING_MAX_LEVEL, exam excluded — glancePingsEligible).
 * NOT gated on „Съветник": the glance is graded at every setting, so the cue
 * for it survives the advisor being switched off (A11 — see `pingsActive`);
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE 👀 IN THE SKY IS NOT ONE OF THESE — sweep 161, routed here, 2026-08-20.
 *
 *   sc-maneuver-3point/mobile-right/05-stopped.png
 *   „An unexplained cartoon pair of eyes hangs in mid-air over the middle of
 *    the carriageway, roughly two storeys up, with no label, no legend and no
 *    connection to any object. On mobile there is no legend surface at all to
 *    decode it."
 *
 * EVERYTHING THIS FILE DRAWS IS DOM, PINNED TO THE SCREEN. `PingChip` is a
 * `left-2` / `right-2` pill at the stage's vertical middle; the hold cluster is
 * `absolute bottom-3 left-3`. Neither can be „in mid-air over the carriageway",
 * because neither is in the 3D scene at all — and on the cited frame no ping
 * chip is on screen, at either edge.
 *
 * WHAT IS IN THE SKY is `ShadowCar.tsx`'s glance sprite: an `emojiTexture("👀")`
 * `<sprite>` inside the ghost's pose group, flashed for GLANCE_FLASH_S after a
 * `glance-*` event in the replayed trace. That file already carries the same
 * defect under its own header („THE GLANCE MARKER'S ANCHOR"), measured on
 * sc-pe-zone-living, and answers it by dropping the quad to GLANCE_ICON_Y 1.46
 * at GLANCE_ICON_SCALE 0.46 — 0.04 m of air above the ghost's 1.19 m roofline,
 * inside `GLANCE_ANCHOR_MAX_GAP_M`. The second half („no legend on mobile") is
 * answered in the same file by the footprint halo, whose comment cites the
 * phone's missing «синя — пътят на колата-сянка» legend. Both landed after the
 * sweep baseline, so the frame is pre-fix. Route: `components/sim/ShadowCar.tsx`.
 *
 * ── AND ONE FINDING FROM ANOTHER LANE THAT THIS FILE ANSWERS ───────────────
 * sc-vu-cyclist-hook/pc-right/01-arrival.png was filed against
 * `modules/sim/cockpit/index.ts` as „the lesson asks for a control the cockpit
 * does not show" (instruction 2: «провери дясното огледало»). The Д button
 * below — `mirror="right"`, the same graded `CabinControls.glanceStart` the E
 * key drives — is rendered at the bottom-left of that exact frame. The right
 * mirror is a head-turn pose by design (`scene/vitok/cabinLook.test.ts`: „the
 * right door mirror is off the RIGHT of the driving frame"), and this cluster
 * is the mouse route to it. See that file's header for the full decline.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  createGlancePingsState,
  glancePingsEligible,
  observeGlancePingsTick,
  resetGlancePings,
  type GlancePingPhase,
  type LessonSpec,
} from "@/modules/sim/lessons";
import type { SimTick } from "@/modules/sim/rules";
import type { CabinControls, MirrorGlanceKind } from "@/modules/sim/scene/cabin";

/** LessonScene's additive tick tap — read-only observer, runs before the shell. */
export type GlancePingTap = (tick: SimTick) => void;

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

  // The „Съветник" poll that used to live here is gone with the gate it fed
  // (A11, below) — nothing in this component reads the advisor setting now, so
  // the 2 Hz localStorage read per drive went with it.

  // Pure ping state in a ref (tick rate); the snapshot below is React state
  // touched only when observeGlancePingsTick reports a phase transition.
  const stateRef = useRef(createGlancePingsState());
  const [pings, setPings] = useState<{ left: GlancePingPhase; right: GlancePingPhase }>({
    left: "off",
    right: "off",
  });

  // A11 — THE CUE IS NO LONGER GATED ON THE ADVISOR, BECAUSE THE GRADING IS NOT.
  //
  // This used to be `eligible && advisorOn`. „Съветник" defaults OFF from
  // curriculum order 3 and scenario L3 up (defaultAdvisorEnabled), so from Урок
  // 3 «Кръговото движение» — the lesson whose entire subject is giving way —
  // both edge pings AND the Q/E/F cluster vanished, while the mirror glance
  // went on being graded exactly as before. The student was marked on an act
  // whose only on-screen prompt had been removed, on the lesson that exists to
  // teach it. That is an unfair assessment and it trains the opposite of the
  // north star: it makes not-looking the path of least resistance.
  //
  // The distinction that resolves it: „Съветник" governs ADVICE — the
  // instructor card that tells you what to do next. A ping is not advice, it is
  // the legend for a graded control, nearer the speedometer than the hint card.
  // It also cannot nag, because it is armed by the WORLD and not by the lesson:
  // observeGlancePingsTick raises it only inside 45 m of a Б1/Б2 line, where
  // ЗДвП чл. 50 requires giving way and therefore requires looking. Off the
  // approach it is not on screen at all, at any setting.
  const pingsActive = eligible;
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

      {/* Desktop hold-to-glance cluster. Also decoupled from „Съветник" (A11):
          on a non-touch device these three ARE the mouse route to a graded act
          — the founder's whole contract is that the cabin is worked with the
          mouse, and with the advisor off the only remaining way to glance was
          to already know the Q/E/F keys. Touch devices are unaffected: they
          never render this cluster, they use TouchControls' own mirror row. */}
      {buttonsPossible ? (
        <div
          // The handle PlayAreaStyles' UNPANEL layer needs. These three sit on
          // the road exactly where the reference frame puts its ghost „<" / „>"
          // arrows, so the shell's stylesheet strips their fill and blur there
          // rather than a fill being restated in every HUD file (same
          // data-hud grammar the mirror/toast rules already use).
          data-hud="glance-buttons"
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
      data-hud="glance-ping"
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
