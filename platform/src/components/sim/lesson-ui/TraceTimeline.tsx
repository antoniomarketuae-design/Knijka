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

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  activeAnnotationIndex,
  traceAnnotations,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import {
  DECK_ROOMY_CAPTION_HEIGHT_PX,
  DECK_TOUCH_CAPTION_HEIGHT_PX,
  DECK_TOUCH_CAPTION_MAX_VAR,
  DECK_TOUCH_CAPTION_VAR,
  useTapActivation,
} from "@/modules/sim/hud";

const POLL_MS = 100;
const SPEEDS = [0.25, 0.5, 1] as const;
/** Apple's minimum, and this project's law (row C6): nothing under it. */
const TOUCH_MIN_PX = 44;

/**
 * How close two annotations have to be before the TRANSPORT treats them as one
 * stop, seconds. It was already the literal in `step()` on both sides of the
 * playhead; it is named here because the ticks now have to agree with it.
 *
 * WHY THIS IS THE RIGHT NUMBER AND NOT A CHOSEN ONE. „Стъпка по стъпка"
 * forward looks for the first annotation with `tSec > t + ε` and backward for
 * the last with `tSec < t − ε`. Two annotations closer together than ε are
 * therefore ALREADY one stop as far as ⏮/⏭ are concerned: land on the first
 * and the second is unreachable in both directions. The deck has been making
 * that judgement since the day it was written — the ticks were just making a
 * different one, and drawing two buttons for it.
 */
const STEP_EPSILON_SEC = 0.05;

/** Painted width of one tick's hit slot, px — `w-5` compact, `w-6` roomy. */
const TICK_WIDTH_PX = { compact: 20, roomy: 24 } as const;

/**
 * THE ROOMY CAPTION CARD'S OWN BOX, px — the two numbers its classes resolve
 * to, named so the dead-air arithmetic below is checkable rather than asserted.
 *
 * `px-3.5 py-2` + a 1 px border on both edges = 18 px of chrome; `text-sm` is
 * Tailwind's 14 px on a 20 px line box. Nothing here is a preference: change a
 * class above and these change with it, which is why they sit next to it.
 */
const ROOMY_CAPTION_CARD_CHROME_PX = 18;
const ROOMY_CAPTION_LINE_PX = 20;

/**
 * How much EMPTY BOX stands between an `lines`-line caption and the deck panel
 * that owns it, on a roomy stage — i.e. how far the sentence floats free of the
 * only thing on the stage that says who is speaking it.
 *
 * `sc-follow-distance/pc-right/04-t180s.png` is 80 px of this at two lines, and
 * that gap is why a sweep judge filed the demonstration's narration as „the
 * advisor bubble" and routed it at `AdvisorCard.tsx`. The card is bottom-
 * aligned now, so this is 0 at every length the bank contains — but the
 * function stays because the box is FIXED, so the question „how much of it is
 * nothing?" is the one that has to keep being answerable.
 */
export function captionDeadAirPx(
  lines: number,
  boxPx: number = DECK_ROOMY_CAPTION_HEIGHT_PX,
): number {
  const card = ROOMY_CAPTION_CARD_CHROME_PX + Math.max(0, lines) * ROOMY_CAPTION_LINE_PX;
  return Math.max(0, boxPx - card);
}

/**
 * WHO IS SPEAKING THE CAPTION — the deck's own title, reused rather than
 * re-worded so a rename cannot leave the visible heading and the announced
 * attribution saying different things about the same trace.
 */
export function captionSpeakerBg(
  trace: Pick<ScenarioTrace, "meta">,
  titleBg?: string,
): string {
  return titleBg ?? KIND_TITLE_BG[trace.meta.kind];
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One tick on the scrub bar: which annotations it stands for, where it sits,
 * and how far its hit slot may spread before it would touch its neighbour's.
 */
export interface AnnotationTick {
  /** Where the tick sits, as a percentage of the bar. */
  pct: number;
  /** Where a click on it seeks to, seconds. */
  tSec: number;
  /** Index range into the annotation list this tick stands for (inclusive). */
  firstIndex: number;
  lastIndex: number;
  /**
   * Half the distance to the previous / next tick, in percent of the bar —
   * `null` at the two ends, where nothing is in the way.
   */
  halfGapLeftPct: number | null;
  halfGapRightPct: number | null;
}

/**
 * THE TICKS, AS SLOTS THAT CANNOT OVERLAP — 2026-08-10, desktop.
 *
 * THE DEFECT, MEASURED ON THE SHIPPED PRODUCT (WebKit, 1264 × 619, the real
 * lesson shell, `sc-zebra-approach@L1`): two annotation buttons at
 * **[1116, 388, 20 × 28] and [1116, 388, 20 × 28]** — the identical rect, 560
 * px² of exact overlap, because `shadow-correct.trace.json` carries two
 * annotations at the same `tSec` (21.1333). The later sibling wins every pixel
 * of the hit test, so one of the two controls could not be pressed at all.
 *
 * The touch deck closed this in its own way (the ticks stop being buttons
 * under a thumb, and ⏮/⏭ do the job at 44 px) and the comment that described
 * the defect shipped scoped to touch, leaving the mouse deck with the bug its
 * own code comment named.
 *
 * AND IT IS NOT ONE TRACE. Swept over all 503 shipped trace files, 1 870
 * annotations: **43 pairs sit at exactly the same timestamp**, and a further
 * **82 consecutive pairs are closer than one tick width** on a 300 px bar (the
 * narrowest measured gap is 3.39 px, i.e. 17 px of a 20 px tick overlapping).
 * So an answer that only merges exact duplicates would have left 82 partial
 * overlaps standing, and the reason nobody knew is that one screen was looked
 * at instead of the content.
 *
 * TWO RULES, BOTH DERIVED FROM BEHAVIOUR THAT ALREADY EXISTS HERE:
 *
 *   1. MERGE what the transport already merges — annotations within
 *      `STEP_EPSILON_SEC` become ONE tick (see the constant). Nothing becomes
 *      unreachable, because it was already unreachable: `activeAnnotationIndex`
 *      answers with the LAST annotation at a timestamp, so the first of a
 *      coincident pair can never be the caption on screen no matter what is
 *      clicked. The tick is therefore labelled with the one the student will
 *      actually see, which is what its `aria-label` promises.
 *
 *   2. CLAMP the rest at the midpoint. Each slot may spread its nominal half
 *      width to either side, or half the distance to its neighbour, whichever
 *      is smaller. Two neighbours therefore meet exactly at their midpoint and
 *      cannot overlap FOR ANY BAR WIDTH — it is arithmetic in percent, not a
 *      pixel threshold that would have to be measured and would drift.
 *
 * What it costs: a tick with a close neighbour is narrower on that side. Worst
 * case across every shipped trace is 5.83 px of slot (`sc-vp-handbrake`), and
 * the same annotation today has 3.39 px of un-occluded slot — so the narrow
 * case is not made worse, it is made non-overlapping. Every annotation is also
 * still reachable at full size from ⏮/⏭, and the bar underneath seeks to the
 * pointer anyway.
 */
export function annotationTicks(
  annotations: ReadonlyArray<{ tSec: number }>,
  durationSec: number,
): AnnotationTick[] {
  const duration = Math.max(durationSec, 0.001);
  const ticks: AnnotationTick[] = [];
  for (let i = 0; i < annotations.length; i += 1) {
    const tSec = annotations[i].tSec;
    const prev = ticks[ticks.length - 1];
    if (prev && tSec - prev.tSec <= STEP_EPSILON_SEC) {
      prev.lastIndex = i;
      continue;
    }
    ticks.push({
      pct: (tSec / duration) * 100,
      tSec,
      firstIndex: i,
      lastIndex: i,
      halfGapLeftPct: null,
      halfGapRightPct: null,
    });
  }
  for (let i = 0; i < ticks.length; i += 1) {
    const left = ticks[i - 1];
    const right = ticks[i + 1];
    ticks[i].halfGapLeftPct = left ? (ticks[i].pct - left.pct) / 2 : null;
    ticks[i].halfGapRightPct = right ? (right.pct - ticks[i].pct) / 2 : null;
  }
  return ticks;
}

/** `min(<nominal>px, <half gap>%)`, or the nominal alone at the two ends. */
function tickSpread(halfWidthPx: number, halfGapPct: number | null): string {
  return halfGapPct === null
    ? `${halfWidthPx}px`
    : `min(${halfWidthPx}px, ${Math.max(0, halfGapPct)}%)`;
}

export interface TraceTimelineProps {
  trace: ScenarioTrace;
  clockRef: React.RefObject<TraceClock>;
  /** Deck label, e.g. „Демонстрация — сянка" (default per trace kind). */
  titleBg?: string;
  /** Compact deck (~40 % smaller controls) — founder ruling 2026-07-17: the
   *  demo deck yields visual priority to the car status dashboard. That ruling
   *  is about a MOUSE deck on a roomy screen; on a phone `touch` overrides it. */
  compact?: boolean;
  /**
   * THE PHONE LAYOUT — every control ≥ 44 px, laid out as ONE wrapping row.
   *
   * The 2026-07-17 „40 % smaller" ruling was read as licence to ship 20 × 28 px
   * annotation ticks and 32 × 32 transport buttons to a thumb: 13 controls under
   * the minimum on three of the four device profiles, 7 on the fourth (measured
   * 2026-08-10). Row C6 closed on „0 controls under 44 px on any dashboard
   * route" and the founder rejected shrinking explicitly, so on a phone the
   * deck grows its targets and pays for them by FOLDING instead:
   *
   *   • the toggle joins the transport row (`leading`) rather than sitting on
   *     its own 48 px line above it — the difference between a caption fitting
   *     on a 393 px-tall landscape stage and not fitting;
   *   • the three speed buttons become one 44 px button that CYCLES
   *     0.25 → 0.5 → 1×, because three of them need 132 px and the portrait
   *     column is 129.6 px wide on the smallest phone in the ladder (the „1×"
   *     button was measured 4.4 px off the right edge of a 360 px screen);
   *   • «🔁 Участък» keeps its function and loses its word;
   *   • the annotation ticks stop being buttons. They were 20 × 28 and two of
   *     them at the same timestamp overlapped each other by 560 px² on every
   *     profile. What they DO — jump to an annotation — is exactly what ⏮/⏭
   *     do, at 44 px, so the function moved rather than went away, and the
   *     ticks stay on the bar as the marks they always looked like.
   *
   * THE 560 px² WAS NEVER TOUCH-ONLY, and this comment used to be the whole
   * fix for it: the mouse deck kept the two stacked buttons until 2026-08-10.
   * It keeps its ticks — a pointer can hit a 20 px target — but they are laid
   * out as slots that cannot overlap (`annotationTicks`).
   */
  touch?: boolean;
  /** Rendered as the first control of the transport row (the deck's own
   *  open/close toggle, on a phone). Roomy decks pass nothing. */
  leading?: ReactNode;
}

const KIND_TITLE_BG: Record<ScenarioTrace["meta"]["kind"], string> = {
  shadow: "Демонстрация — следвай сянката",
  mistake: "❌ Грешен подход — само гледай",
  attempt: "Твоят опит — повторение",
};

export function TraceTimeline({
  trace,
  clockRef,
  titleBg,
  compact = false,
  touch = false,
  leading = null,
}: TraceTimelineProps) {
  const duration = Math.max(trace.meta.durationSec, 0.001);
  // Size grammar: one place per control class, so compact stays consistent.
  // `touch` wins over `compact` — 44 px is a law, „40 % smaller" is a taste.
  const btnSize = touch ? "h-11 w-11 text-base" : compact ? "h-8 w-8 text-sm" : "h-11 w-11";
  const barH = touch ? "h-11" : compact ? "h-7" : "h-11";
  const tickH = touch ? "h-11" : compact ? "h-7" : "h-11";
  const annotations = useMemo(() => traceAnnotations(trace), [trace]);
  const ticks = useMemo(() => annotationTicks(annotations, duration), [annotations, duration]);
  // Only the MOUSE deck draws hit slots, so only its two sizes are asked for.
  const tickHalfPx = (compact ? TICK_WIDTH_PX.compact : TICK_WIDTH_PX.roomy) / 2;

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

  /** The touch deck's one speed control: 0.25 → 0.5 → 1 → 0.25. Every speed
   *  the roomy deck offers, reachable, at 44 px, in 129.6 px of column. */
  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(snap.speed as (typeof SPEEDS)[number]);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length] ?? 1);
  };

  /** „Стъпка по стъпка": jump to the prev/next annotation and hold there.
   *  Walks the TICKS and not the raw list, which changes nothing about where
   *  it lands (a coincident pair was always one stop — that is what the epsilon
   *  means) and keeps one definition of „the next annotation" in this file. */
  const step = (dir: -1 | 1) => {
    const clock = clockRef.current;
    if (!clock || ticks.length === 0) return;
    const t = clock.tSec;
    let target: number | null = null;
    if (dir > 0) {
      for (const a of ticks) {
        if (a.tSec > t + STEP_EPSILON_SEC) {
          target = a.tSec;
          break;
        }
      }
    } else {
      for (let i = ticks.length - 1; i >= 0; i--) {
        if (ticks[i].tSec < t - STEP_EPSILON_SEC) {
          target = ticks[i].tSec;
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

  /**
   * ══ DOC 91 · C2 — THE DECK IS A TWO-FINGER SURFACE AND ITS TRANSPORT WAS
   *    `onClick`-ONLY ═══════════════════════════════════════════════════════
   *
   * A `click` born of a touch is a COMPATIBILITY MOUSE EVENT and the Touch
   * Events spec dispatches it only for the PRIMARY touch point, so `onClick`
   * alone is unreachable whenever a second finger is on the glass. Wave 1
   * proved that and fixed four call sites; nobody came back for this panel.
   *
   * IT IS NOT A BORDERLINE CASE. This deck is anchored to the SAME
   * `TOUCH_CONTROLS_FLOOR` as the ⚙ sheet and stands above the drivetrain pad
   * — `TouchControls`' own header measures the two overlapping at 6 240 px²
   * with the deck merely collapsed — so "the student is watching the
   * demonstration with a thumb on the throttle" is the ordinary case, not the
   * exotic one. Measured on the production build, iPhone 16 portrait, with two
   * real CDP touch points: with one finger planted on the road, every control
   * on the driving screen receives `pointerdown` and `pointerup` and NOT ONE
   * of the 35 receives a `click`.
   *
   * `onClick` STAYS on every one of them — see `tapActivation.ts`: keyboard
   * Enter/Space, screen readers and `element.click()` all arrive as a click and
   * nothing else, and mouse pointers are deliberately left alone.
   *
   * THE DESKTOP SPEED PILLS BELOW ARE NOT GIVEN ONE, on purpose. They are the
   * `touch ? … : …` alternative branch, i.e. they never render on a phone, and
   * they are built in a `.map` where a hook cannot go. A mouse `click` fires
   * under any number of other buttons and always has.
   */
  const tapPlay = useTapActivation(togglePlay);
  const tapPrev = useTapActivation(() => step(-1));
  const tapNext = useTapActivation(() => step(1));
  const tapSpeed = useTapActivation(cycleSpeed);
  const tapLoop = useTapActivation(toggleLoop);

  const loop = clockRef.current?.loop ?? null;
  const pct = (snap.t / duration) * 100;

  // ── The pieces, built once and arranged twice: a column on a roomy screen,
  //    ONE wrapping row on a phone. Same controls, same handlers, same names —
  //    only the fold differs, which is what keeps the two layouts from drifting.
  const scrubBar = (
    <div
      ref={barRef}
      role="slider"
      aria-label="Позиция в демонстрацията"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(snap.t)}
      aria-valuetext={`${fmt(snap.t)} от ${fmt(duration)}`}
      className={`relative ${barH} ${
        touch ? "min-w-24 flex-1 basis-24" : "w-full"
      } cursor-pointer touch-none`}
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
      {/* ── `data-hud-ink` ON EVERY FILL IN THIS BAR — 2026-08-10, and it is a
          MEASUREMENT, not a precaution. The UNPANEL sweep in PlayAreaStyles
          clears `background-color` off everything inside a ghost surface, and
          `[data-hud="demo-deck"]` is on that register. Read back off the running
          product (WebKit, 1264 × 619, computed styles, not inferred): the track,
          the progress fill, all four annotation marks AND the playhead every one
          of them `rgba(0, 0, 0, 0)`. The scrub bar was painting NOTHING but the
          playhead's 2 px border ring — no position, no progress, no annotations
          — on the deck whose whole job is „time as an axis".
          The sweep's own header already names this exemption and this example:
          „a progress bar with no fill is not a progress bar". These five fills
          ARE the information, so they take the opt-out the layer provides.
          It changes paint only: not one rect moves, which is why the phone
          geometry measured this session is unaffected. */}
      <div
        data-hud-ink=""
        className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border"
      />
      {/* Loop-section highlight */}
      {loop ? (
        <div
          data-hud-ink=""
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/30"
          style={{
            left: `${(loop.startSec / duration) * 100}%`,
            width: `${((Math.min(loop.endSec, duration) - loop.startSec) / duration) * 100}%`,
          }}
        />
      ) : null}
      {/* Progress */}
      <div
        data-hud-ink=""
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
        style={{ width: `${pct}%` }}
      />
      {/* ── THE MARKS. One per tick, on both decks, from the same list — so the
          mouse bar and the thumb bar cannot draw a different set of marks. The
          mark is what it always looked like: a 6 × 14 pill at the annotation's
          own position, lit when that annotation is the one being narrated. */}
      {ticks.map((tick) => (
        <span
          key={`mark-${tick.firstIndex}`}
          aria-hidden
          data-hud-ink=""
          className={`pointer-events-none absolute top-1/2 block h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            activeIdx >= tick.firstIndex && activeIdx <= tick.lastIndex ? "bg-accent" : "bg-muted"
          }`}
          style={{ left: `${tick.pct}%` }}
        />
      ))}
      {/* ── THE HIT SLOTS — a mouse deck only, and NON-OVERLAPPING by
          construction (see `annotationTicks` for the measurement that forced
          this and for why the two rules are the ones already in this file).
          Under a thumb they do not exist at all: they were 20 × 28, and ⏮/⏭
          reach every annotation at 44 px. The slot paints nothing — the mark
          above is the only thing on the bar either way. */}
      {touch
        ? null
        : ticks.map((tick) => {
            const left = tickSpread(tickHalfPx, tick.halfGapLeftPct);
            const right = tickSpread(tickHalfPx, tick.halfGapRightPct);
            return (
              <button
                key={`tick-${tick.firstIndex}`}
                type="button"
                // The annotation the seek will actually SURFACE, which for a
                // merged tick is the last of the run: `activeAnnotationIndex`
                // answers with the last annotation at a timestamp, so that is
                // the sentence the student is about to read. A label naming the
                // other one would be a promise the deck cannot keep.
                aria-label={
                  annotations[tick.lastIndex]?.textBg ?? `Анотация ${tick.lastIndex + 1}`
                }
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  const clock = clockRef.current;
                  if (clock) clock.playing = false;
                  seek(tick.tSec);
                }}
                className={`absolute top-1/2 ${tickH} -translate-y-1/2`}
                style={{
                  left: `calc(${tick.pct}% - ${left})`,
                  width: `calc(${left} + ${right})`,
                }}
              />
            );
          })}
      {/* Playhead */}
      <div
        data-hud-ink=""
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-accent shadow"
        style={{ left: `${pct}%` }}
      />
    </div>
  );

  const playBtn = (
    <button
      type="button"
      {...tapPlay}
      aria-label={snap.playing ? "Пауза" : "Пусни"}
      className={`flex shrink-0 ${btnSize} items-center justify-center rounded-full bg-accent ${
        compact && !touch ? "" : "text-lg"
      } text-background`}
    >
      {snap.playing ? "⏸" : "▶"}
    </button>
  );

  const prevBtn = (
    <button
      type="button"
      {...tapPrev}
      aria-label="Предишна стъпка"
      title="Стъпка по стъпка — назад"
      className={`flex shrink-0 ${btnSize} items-center justify-center rounded-full border border-border text-muted transition hover:text-foreground`}
    >
      ⏮
    </button>
  );

  const nextBtn = (
    <button
      type="button"
      {...tapNext}
      aria-label="Следваща стъпка"
      title="Стъпка по стъпка — напред"
      className={`flex shrink-0 ${btnSize} items-center justify-center rounded-full border border-border text-muted transition hover:text-foreground`}
    >
      ⏭
    </button>
  );

  const speedControl = touch ? (
    <button
      type="button"
      {...tapSpeed}
      aria-label={`Скорост ${snap.speed}× — натисни за следващата`}
      title="Скорост на демонстрацията"
      style={{ minWidth: `${TOUCH_MIN_PX / 16}rem`, minHeight: `${TOUCH_MIN_PX / 16}rem` }}
      className="flex shrink-0 items-center justify-center rounded-full border border-border px-1 text-[12px] font-bold tabular-nums text-foreground transition hover:text-foreground"
    >
      {snap.speed}×
    </button>
  ) : (
    <div className="flex items-center gap-1 rounded-full border border-border p-1">
      {SPEEDS.map((sp) => (
        <button
          key={sp}
          type="button"
          onClick={() => setSpeed(sp)}
          aria-pressed={snap.speed === sp}
          className={`flex ${
            compact ? "h-6 min-w-9 text-[10px]" : "h-9 min-w-11 text-[11px]"
          } items-center justify-center rounded-full px-2 font-semibold transition ${
            snap.speed === sp ? "bg-accent text-background" : "text-muted hover:text-foreground"
          }`}
        >
          {sp}×
        </button>
      ))}
    </div>
  );

  const loopBtn = (
    <button
      type="button"
      {...tapLoop}
      aria-pressed={snap.looping}
      aria-label={touch ? "Повтаряй участъка" : undefined}
      title={touch ? "Повтаряй участъка" : undefined}
      className={`flex shrink-0 ${
        touch ? "h-11 w-11" : compact ? "h-8 px-2.5" : "h-11 px-3"
      } items-center justify-center gap-1.5 rounded-full border text-[11px] font-semibold transition ${
        snap.looping
          ? "border-accent bg-accent/15 text-accent"
          : "border-border text-muted hover:text-foreground"
      }`}
    >
      {touch ? "🔁" : "🔁 Участък"}
    </button>
  );

  return (
    <div
      className={`pointer-events-auto flex w-full min-h-0 flex-col select-none ${
        touch ? "gap-1" : "max-w-xl gap-1.5"
      }`}
    >
      {/* ── THE TEACH CARD — a FIXED box that scrolls, in BOTH grammars now.
          The deck's open height, and therefore the toggle inside it, must not
          move while the ghost drives (notifyColumn.ts,
          DECK_TOUCH_CAPTION_HEIGHT_PX / DECK_ROOMY_CAPTION_HEIGHT_PX).

          THE ROOMY BRANCH USED TO SAY „it appears when there is an annotation
          and the panel grows", and 2026-08-10 measured what that costs. Sampled
          at 10 Hz for 30 s on a live 1264 × 619 drive with the caption
          narrating (25 distinct texts in the window): the deck's height swung
          135 → 259 px and this panel's own «🎬 Демонстрация ▾» toggle jumped
          84 px between two consecutive samples, against a half-extent of 13.3.
          That is the founder's „elements moving", on the control that closes
          the panel. The touch branch had already been fixed for exactly this;
          the roomy one had not, because every probe until now measured static
          states. Nothing is lost — a longer annotation scrolls, as it already
          does on a phone. */}
      <div
        // `data-hud` because this box is now measured from outside — the deck
        // caption lint (tools/mobile/deck-captions.mjs) lays every authored
        // `textBg` in the trace bank out in THIS element, and finding it by
        // „the div whose overflow-y computes to auto" is how a probe silently
        // starts measuring the wrong node.
        data-hud="deck-caption"
        // NOT `shrink-0`, deliberately, and it is the smallest phone in the
        // ladder that says so: a 568 × 320 stage (iPhone SE held sideways)
        // leaves 87 px of corridor, and a 58 px transport row plus a 46 px
        // caption is 104. The caption is the piece that may give — it already
        // scrolls — so the row it is above never gets pushed onto the thumb
        // controls.
        //
        // ── AND ON A ROOMY STAGE IT SITS ON THE DECK INSTEAD OF FLOATING OVER
        //    THE ROAD ABOVE IT — sweep 161, and the evidence is a misrouting.
        //
        // `sc-follow-distance/pc-right/04-t180s.png` was filed as „THE ADVISOR
        // BUBBLE quotes a speed the car is not doing: it reasons about 26 km/h
        // while the speedometer reads 0 km/h and the car is stationary", and
        // routed at `AdvisorCard.tsx`. It is not the advisor. It is THIS box,
        // carrying `scFollowDistance.ts`'s annotation «На 26 км/ч тези
        // двайсетина метра са близо 3 секунди — има време за реакция» — the
        // demonstration narrating the SHADOW car. A judge reading the frame
        // took it for the instructor speaking about the student's own drive,
        // and there is nothing in the frame that could have told them
        // otherwise, because the card was standing alone on the carriageway.
        //
        // WHY IT STOOD ALONE, AS ARITHMETIC (`captionDeadAirPx` below, and the
        // constants are the shipped ones). The box is a FIXED
        // DECK_ROOMY_CAPTION_HEIGHT_PX = 138 and its content was start-aligned,
        // so a two-line caption — ROOMY_CAPTION_CARD_CHROME_PX 18 of chrome
        // plus 2 × ROOMY_CAPTION_LINE_PX 20 = 58 — left EIGHTY pixels of
        // transparent air between itself and the deck panel that owns it. Read
        // off that PNG: card 402…447, deck panel top 540, i.e. 93 px of nothing
        // (the box's own 6 px gap included). At that distance the two are not
        // one object, and the only thing on the whole stage that says whose
        // driving the sentence describes is the panel's own «ДЕМОНСТРАЦИЯ —
        // СЛЕДВАЙ СЯНКАТА» heading, which was on the far side of that gap.
        //
        // WHY IT MATTERS MORE THAN A LAYOUT NIT (THEO-4, and the north star):
        // following distance is the one lesson in the catalogue whose whole
        // subject is that the SAME twenty metres is a different amount of time
        // at a different speed. A seventeen-year-old who reads „на 26 км/ч …
        // близо 3 секунди" as a statement about the car they are sitting in has
        // been taught that twenty metres IS three seconds, and that is the
        // exact misconception the lesson exists to remove.
        //
        // THE FIX IS THE CARD'S `mt-auto` BELOW, and it costs nothing: no
        // height, no width, not one character of the 1 811-caption bank, so
        // `tools/mobile/deck-captions.mjs` still reports 0 / 1811 in a box that
        // is still exactly 138 px and a deck whose controls still never move.
        // A caption that grows now grows UPWARD into the empty half of the box
        // — the same direction the portrait phone already chose, and for the
        // same reason.
        //
        // AN AUTO MARGIN ON THE CARD, AND THE TWO THINGS IT IS NOT.
        //
        // NOT `justify-content: flex-end`: on a scroll container that aligns to
        // the end, content that overflows does so past the START edge and
        // cannot be scrolled back to. This box's overflow is a safety net (the
        // lint says the bank fits inside it), and a safety net that eats the
        // first line of the sentence is worse than the gap it replaced. An auto
        // margin cannot do that — auto margins absorb only POSITIVE free space
        // and resolve to 0 when there is none, so an overflowing caption lays
        // out exactly as it shipped and scrolls exactly as it shipped.
        //
        // NOT A SPACER SIBLING either, and this one was written, tested and
        // then binned: `tools/mobile/deck-captions.mjs` — the gate that says
        // 0 / 1811 — finds the card with `box.firstElementChild`, so an empty
        // growing div in front of it would have handed the lint a 0 px box to
        // measure and every caption in the bank would have „fitted". That is
        // this project's own signature failure (every „0 defects" report here
        // was an instrument bug, and all of them lied in the reassuring
        // direction), committed by the fix for a defect rather than by the
        // defect. `deckCaptionVoice.test.tsx` now pins the card as the box's
        // first element child so the seam cannot be taken away again.
        className={`w-full min-h-0 overflow-y-auto overscroll-contain ${
          touch ? "" : "flex flex-col"
        }`}
        // ── TWO PROPERTIES, NOT ONE — 2026-08-11, the caption row.
        //
        // A FIXED height is what keeps the deck's own toggle still while the
        // ghost drives, and on the two geometries where the toggle sits BELOW
        // the caption (roomy: the toggle is the deck's first child; landscape
        // phone: the deck hangs from the top) it is still exactly that. There
        // the two properties resolve to the same number and nothing changes.
        //
        // On a PORTRAIT phone they do not, and that is the fix: the deck is
        // bottom-anchored and the toggle rides the transport row at its foot,
        // so a caption that grows grows UPWARD into empty stage and no control
        // moves. `--deck-caption-h` is handed `auto` there and
        // `--deck-caption-max-h` becomes the ceiling. Both are published by
        // PlayAreaStyles, which is where the „short stage" question is already
        // answered — and they are read as custom properties rather than
        // branched here so an inline style can never out-rank the media query.
        style={{
          height: touch
            ? `var(${DECK_TOUCH_CAPTION_VAR}, ${DECK_TOUCH_CAPTION_HEIGHT_PX / 16}rem)`
            : `${DECK_ROOMY_CAPTION_HEIGHT_PX / 16}rem`,
          maxHeight: touch
            ? `var(${DECK_TOUCH_CAPTION_MAX_VAR}, ${DECK_TOUCH_CAPTION_HEIGHT_PX / 16}rem)`
            : `${DECK_ROOMY_CAPTION_HEIGHT_PX / 16}rem`,
        }}
      >
        {active?.textBg ? (
          touch ? (
            <div className="rounded-xl border border-border bg-background/85 px-2.5 py-1.5 text-center text-[12px] font-medium leading-4 backdrop-blur">
              <span className="sr-only">{captionSpeakerBg(trace, titleBg)}: </span>
              {active.textBg}
            </div>
          ) : (
            // `mt-auto` — the dead air, taken by the card's own margin rather
            // than by a sibling, so this stays the box's FIRST ELEMENT CHILD
            // and the caption lint goes on measuring the caption. See the block
            // above the `className` for the 80 px and the frame it was read off.
            <div className="mx-auto mt-auto max-w-md rounded-xl border border-border bg-background/85 px-3.5 py-2 text-center text-sm font-medium backdrop-blur">
              {/* WHOSE DRIVING THIS SENTENCE DESCRIBES, for anyone who cannot
                  see that the card is now sitting on the transport. Zero layout
                  cost by construction (`sr-only` is a 1 px absolute clip), so it
                  cannot cost the bank a line. The SIGHTED half of the
                  attribution is the adjacency itself — the heading two rows down
                  reads «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА». */}
              <span className="sr-only">{captionSpeakerBg(trace, titleBg)}: </span>
              {active.textBg}
            </div>
          )
        ) : null}
      </div>

      <div
        className={`flex shrink-0 flex-col rounded-2xl border border-border bg-background/80 shadow-glow-sm backdrop-blur-md ${
          touch ? "gap-1 px-1.5 py-1.5" : compact ? "gap-1.5 px-2.5 py-1.5" : "gap-2 px-3 py-2.5"
        }`}
      >
        {/* The deck's own name and clock. On a phone the toggle in the row
            below already says «🎬 Демонстрация», and 20 px of heading is a
            whole line of the caption — so the time rides the scrub bar's
            `aria-valuetext` instead of a row of its own. */}
        {touch ? null : (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-muted">
              {titleBg ?? KIND_TITLE_BG[trace.meta.kind]}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-muted">
              {fmt(snap.t)} / {fmt(duration)}
            </span>
          </div>
        )}

        {/* THE FOLD. Roomy: a full-width scrub bar with the transport under
            it. Touch: one wrapping row — toggle, transport, bar, speed, loop —
            which lays out on a single line in the 410 px landscape strip and
            folds to four lines in the 129.6 px portrait column, without a
            second component or a media query in this file. */}
        {touch ? (
          <div className="flex flex-wrap items-center gap-1">
            {leading}
            {playBtn}
            {prevBtn}
            {nextBtn}
            {scrubBar}
            {speedControl}
            {loopBtn}
          </div>
        ) : (
          <>
            {scrubBar}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {playBtn}
                {prevBtn}
                {nextBtn}
              </div>
              {speedControl}
              {loopBtn}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
