"use client";

/**
 * MousePedals — the two pedals, for a mouse.
 *
 * FOUNDER REVIEW 2026-07-30, verbatim: „we must re-work the whole engine,
 * first and upmost it must be with the mouse … we must make it user-friendly".
 * The measured hole this fills is exact: of the thirteen pre-drive steps, two
 * are pedals — „Натисни спирачката" (step 8) and „Потегли" (step 13) — and the
 * tutorial card said so out loud:
 *
 *   „Тази стъпка е с педал — няма контрола на таблото, която да щракнеш."
 *
 * That sentence was TRUE and that is the problem: on a desktop the only brake
 * was the S key, so a lesson advertised as mouse-first stopped dead at step 8.
 * A phone has had pedals since P1 (TouchControls' drivetrain pad). A mouse had
 * nothing.
 *
 * WHAT THIS IS. Two press-and-hold buttons in the bottom-right corner, held
 * with the left mouse button exactly as a foot holds a pedal — no click-to-
 * latch, because a latched pedal is not a pedal and a student who learns
 * „click once = braking" learns a lie. They write into the SAME
 * `TouchInputSource` the phone pads write into, which `SimInput.read()` merges
 * before the QW10 pre-drive gate and before the difficulty shaping. So:
 *
 *   · the A2 procedure observer sees the identical `rawBrake` / `rawThrottle`
 *     edges it sees from the keyboard (LessonScene captures raw values BEFORE
 *     zeroing them for the gate) — step 8 and step 13 complete unchanged;
 *   · the rule engine, the scenario director and the trace recorder see
 *     nothing new at all;
 *   · nothing about grading, interlocks or the reverse assist is touched.
 *
 * SCREEN BUDGET. The project's measuring rule is that any pixel a control
 * paints on is not road. These are 56 px wide, hard against the corner, with
 * no backdrop-blur and a translucent fill, and they hide themselves the moment
 * the student uses W/S — the same „keyboard in recent use" grammar
 * TouchControls has. Together they cost ~1.4 % of an 1100 × 619 scene box, and
 * an advanced student who drives on the keyboard never sees them at all.
 *
 * They mount on non-touch devices only: a phone already has the drivetrain pad
 * under its thumb, and two overlapping pedal controls would fight for the same
 * axis.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TouchInputSource } from "@/modules/sim/engine";

/** Keyboard-drive detection: W/S/arrows means this student is not using the
 *  mouse for the pedals, so the pads step out of the way. */
const DRIVE_KEYS = new Set([
  "w",
  "s",
  "W",
  "S",
  "ArrowUp",
  "ArrowDown",
  "ц",
  "ы",
  "Ц",
  "Ы",
]);

/** How long the pads stay hidden after a drive key (ms). A pointer press on a
 *  pad brings them back immediately. */
const KEYBOARD_HIDE_MS = 12_000;

/**
 * A MOUSE BUTTON IS BINARY AND A PEDAL IS NOT. Slamming the axis to 1.0 on
 * pointerdown would be a full-force stab every single time, which is both
 * unlike any real car and unfair: the rule engine grades HARSH_BRAKING and
 * Урок 1's own objective is „Спри плавно, без рязко спиране". So a held pad
 * RAMPS — these are the seconds from resting to fully depressed. The brake is
 * quicker than the throttle because an emergency stop has to stay possible.
 * Release is instant: a foot comes off a pedal far faster than it goes down.
 */
const BRAKE_RISE_SEC = 0.75;
const THROTTLE_RISE_SEC = 1.1;

export function MousePedals({
  touch,
  hidden,
  /** While the pre-drive checklist is running the pads are ALWAYS shown, even
   *  right after a key press: the two pedal steps are the lane's whole reason
   *  to exist and a student must never have to find them. */
  pinned = false,
}: {
  touch: TouchInputSource;
  hidden: boolean;
  pinned?: boolean;
}) {
  const [keyboardRecent, setKeyboardRecent] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!DRIVE_KEYS.has(e.key)) return;
      setKeyboardRecent(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setKeyboardRecent(false), KEYBOARD_HIDE_MS);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const visible = !hidden && (!keyboardRecent || pinned);

  // ANY path that takes the pads off screen must release both axes — pause,
  // a keyboard takeover, unmount. A pedal left held by a control that is no
  // longer rendered would keep driving a frozen scene, and the pads vanish
  // WITHOUT unmounting this component (the keyboard branch below returns
  // null), so the unmount cleanup alone is not enough.
  useEffect(() => {
    if (visible) return;
    touch.releaseThrottle();
    touch.releaseBrake();
  }, [visible, touch]);
  useEffect(
    () => () => {
      touch.releaseThrottle();
      touch.releaseBrake();
    },
    [touch],
  );

  const wake = useCallback(() => {
    setKeyboardRecent(false);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  if (!visible) return null;

  return (
    <div
      data-hud="mouse-pedals"
      className="absolute bottom-3 right-3 z-10 flex select-none items-end gap-1.5"
      role="group"
      aria-label="Педали — задръж с мишката"
    >
      <Pedal
        labelBg="СПИРАЧКА"
        ariaBg="Спирачка — задръж с мишката"
        keyHint="S"
        tone="var(--danger)"
        riseSec={BRAKE_RISE_SEC}
        onValue={(v) => {
          wake();
          if (v > 0) touch.setBrake(v);
          else touch.releaseBrake();
        }}
      />
      <Pedal
        labelBg="ГАЗ"
        ariaBg="Газ — задръж с мишката"
        keyHint="W"
        tone="var(--success)"
        riseSec={THROTTLE_RISE_SEC}
        onValue={(v) => {
          wake();
          if (v > 0) touch.setThrottle(v);
          else touch.releaseThrottle();
        }}
      />
    </div>
  );
}

/**
 * One pedal. Pointer capture is what makes it behave like a pedal instead of a
 * button: once pressed, the pedal keeps receiving the events even if the
 * cursor slides off it while braking, and it releases on pointerup wherever
 * that happens. `onPointerCancel` covers the browser stealing the gesture.
 */
function Pedal({
  labelBg,
  ariaBg,
  keyHint,
  tone,
  riseSec,
  onValue,
}: {
  labelBg: string;
  ariaBg: string;
  keyHint: string;
  tone: string;
  /** Seconds from resting to fully depressed while held (see the constants). */
  riseSec: number;
  /** 0..1 pedal travel, once per animation frame while held; 0 on release. */
  onValue: (value: number) => void;
}) {
  const [down, setDown] = useState(false);
  // The ramp lives in refs + rAF, never in React state: a 60 Hz setState for a
  // pedal position would re-render the HUD on every frame of every press.
  const rafRef = useRef<number | null>(null);
  const valueRef = useRef(0);
  const faceRef = useRef<HTMLSpanElement | null>(null);

  const paint = (v: number) => {
    const face = faceRef.current;
    if (face) face.style.transform = `translateY(${(v * 5).toFixed(2)}px)`;
  };

  const stopRamp = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => stopRamp, []);

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDown(true);
    stopRamp();
    let last = performance.now();
    // Start with a real, non-zero press so the step observer's edge fires on
    // the first frame — a pedal that reads 0.00 for 200 ms is not a press.
    valueRef.current = Math.max(valueRef.current, 0.25);
    // `onValue` is captured from THIS render, and the ramp below keeps that
    // capture for the length of the press. That is deliberate and safe: the
    // callback only writes into the shared TouchInputSource, which is a stable
    // object for the whole session, so a re-render mid-press cannot make the
    // captured one wrong.
    onValue(valueRef.current);
    paint(valueRef.current);
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      valueRef.current = Math.min(1, valueRef.current + dt / Math.max(0.05, riseSec));
      onValue(valueRef.current);
      paint(valueRef.current);
      if (valueRef.current < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const release = () => {
    stopRamp();
    setDown((was) => {
      if (was) {
        valueRef.current = 0;
        onValue(0);
        paint(0);
      }
      return false;
    });
  };
  return (
    <button
      type="button"
      aria-label={ariaBg}
      title={`${ariaBg} (клавиш ${keyHint})`}
      data-pedal={labelBg}
      data-pressed={down ? "1" : "0"}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto flex h-24 w-14 touch-none flex-col items-center justify-end gap-1 rounded-xl border pb-1.5 pt-2 text-[9px] font-black uppercase tracking-wide transition-[background-color,border-color] motion-reduce:transition-none"
      style={{
        // Readable, not loud. The first render of these pads was fully
        // transparent and they read as two empty outlines against a bright
        // road — a pedal a beginner cannot find is worse than one that costs
        // 0.7 % of the frame. A translucent surface fill and a coloured rim
        // buy legibility without a backdrop-filter.
        borderColor: down ? tone : "var(--border-strong)",
        background: down
          ? "color-mix(in srgb, var(--surface) 85%, transparent)"
          : "color-mix(in srgb, var(--background) 55%, transparent)",
        color: down ? tone : "var(--foreground)",
      }}
    >
      {/* The travelling face — it sinks WITH THE RAMP, so the student can see
          how far down the pedal actually is. Driven straight from the rAF loop
          (paint()), never from React state. */}
      <span
        ref={faceRef}
        aria-hidden
        className="flex w-full flex-1 items-end justify-center rounded-lg border-b-[3px]"
        style={{ borderColor: down ? tone : "var(--border-strong)" }}
      />
      <span>{labelBg}</span>
      <kbd aria-hidden className="font-mono text-[8px] font-bold text-accent">
        {keyHint}
      </kbd>
    </button>
  );
}
