"use client";

/**
 * TouchControls — the phone driving controls.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUNDER REVIEW 2026-07-28, iPhone 16, LANDSCAPE. HIS WORDS.
 *
 *   „approximately half of the screen is occupied by controls, information
 *    panels, popups"
 *   „the gas forward this slider must also allow backwards … very hard to
 *    switch to reverse"
 *   „there can be only 1 slider — up is forward middle is stop down is
 *    backwards … same goes for left and right"
 *   „it must be absolutely invisible and small"
 *   „the mobile interface needs a complete redesign rather than only reducing
 *    the size of the existing elements"
 *
 * AND THE NUMBER BEHIND IT, read straight out of the file this one replaces:
 * the steer zone sat at `bottom: calc(11.75rem + …)` = 188 px and was
 * `clamp(11rem, 34vw, 20rem)` wide; the pedal strips were 2 × 56 × 152. On an
 * 852 × 393 landscape iPhone that control band was 188 of 393 px — 48 % of the
 * screen. And because the width was 34vw, A PROPORTION OF THE SCREEN, a bigger
 * phone bought a bigger obstruction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOW. Gran Turismo's screen budget, not its art: instruments and
 * furniture are tiny and hard against the edges, and THE CENTRE OF THE SCREEN
 * IS ROAD. Two thumb pads in the two bottom corners, where thumbs already rest:
 *
 *   BOTTOM-LEFT   ONE STEERING AXIS. Drag left / right anywhere in the corner;
 *                 springs back to centre on release.
 *   BOTTOM-RIGHT  ONE DRIVETRAIN AXIS. Up = forward, centre = neutral, down =
 *                 brake and then REVERSE (see below). Springs back too.
 *
 * THE TRICK THAT MAKES A CONTROL BOTH TINY AND EASY TO HIT: the thing you touch
 * and the thing you see are different sizes. Every pad and every button here is
 * a transparent hit area of at least 44 × 44 px — the pads are 176–208 px wide
 * — that paints NOTHING, with a small mark drawn in the middle of it. The
 * project's own measuring rule ("any pixel a control paints on is NOT road,
 * translucent or not") is what makes this the honest way to buy back the
 * screen: an element with no background, no border, no shadow and no
 * backdrop-filter costs zero road, so the hit area can be generous while the
 * ink stays under half a percent of the viewport.
 *
 * REVERSE, WITH NO GEAR CHANGE IN IT. „Very hard to switch to reverse" was
 * true: it took a pedal AND a selector — two hands of input for one intention.
 * Down on this axis is the brake; ReverseAssist (engine/reverseAssist.ts, which
 * has existed and been unit-tested since 2026-07-17) watches for a brake held
 * at a standstill and steps the REAL selector D→N→R through the same
 * DrivelineState API the [ / ] keys use, after which `applyReversePedalRemap`
 * swaps the two channels — so down keeps meaning "backwards" and up becomes the
 * brake. One axis, one thumb, and the rule engine, the A2 procedure observer
 * and the trace recorder see the identical canonical events they always did.
 * Nothing about grading, scenario timing or recording was touched to get here.
 *
 * WHY A THUMB PAD AND NOT A WHEEL, A TILT SENSOR OR THE OLD LONG SLIDER:
 *  - a wheel wants two thumbs and a fixed pivot the hand has to find; the
 *    corner a thumb already rests in has neither;
 *  - iOS gates DeviceOrientation behind a permission prompt (HTTPS only) that
 *    would interrupt the first drive, tilt misbehaves under a landscape
 *    orientation lock and on a flat-propped tablet, and it is not deterministic
 *    for the rule engine — same three reasons the previous author rejected it,
 *    still true. TOUCH_STEER_MODE_STORAGE_KEY keeps the A/B seam open;
 *  - the old slider's travel was a FRACTION OF THE ZONE, so the same thumb
 *    movement steered differently on different phones. Full lock is now a fixed
 *    TOUCH_STEER_RANGE_PX (engine/touch.ts), which is the only version of this
 *    control that feels the same on a 360 px Android and a 430 px iPhone.
 *
 * Everything else — the graded mirror glances, the indicators, the horn, the
 * camera, pause, fullscreen and the driveline sheet — became glyph-only buttons
 * in two small rows hard against the corners, directly above the pads, so
 * nothing at all sits in the middle of the picture.
 *
 * Input path is unchanged: every gesture writes into the shared
 * TouchInputSource, which SimInput.read() merges by priority (touch active →
 * touch wins). Cabin buttons call the SAME CabinControls/DrivelineState methods
 * the keys and the cockpit hotspots use — one code path, so the A2 observer
 * cannot tell the devices apart.
 *
 * Perf: gesture handlers write into refs and DOM styles directly (no React
 * state at gesture rate, zero per-frame allocations); the only poll is a low-Hz
 * cabin snapshot that early-outs when nothing changed.
 *
 * Visibility: mounts only on touch-capable devices (hasTouchScreen), hides
 * while the sim is paused (menu/quiz/teach/end — the `hidden` prop) and while
 * the keyboard is in recent use (hybrid laptops); a screen touch brings it
 * back. Every hide releases all held axes.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  driveAxisFromDrag,
  steerFromDrag,
  TOUCH_DRIVE_RANGE_PX,
  TOUCH_STEER_RANGE_PX,
  type TouchInputSource,
} from "@/modules/sim/engine";
import type { CabinControls, HeadlightSetting, IndicatorSetting } from "@/modules/sim/scene/cabin";

// ---------------------------------------------------------------------------
// Steer-mode setting seam (A/B: slider vs tilt). Only the thumb pad is
// implemented; "tilt" intentionally falls back to it until a tilt source lands
// (see the header rationale) — the flag exists so an A/B test can flip cohorts
// without a schema change.
// ---------------------------------------------------------------------------

export type TouchSteerMode = "slider" | "tilt";
export const TOUCH_STEER_MODE_STORAGE_KEY = "sim.touchSteerMode";

export function readTouchSteerMode(): TouchSteerMode {
  try {
    return window.localStorage.getItem(TOUCH_STEER_MODE_STORAGE_KEY) === "tilt"
      ? "tilt"
      : "slider";
  } catch {
    return "slider";
  }
}

/** setPointerCapture that survives an already-released pointer (races on
 *  fast taps; some webviews) — losing capture only degrades edge-tracking,
 *  it must never abort the gesture. */
function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // NotFoundError: the pointer ended before capture — gesture continues.
  }
}

/** Driving keys whose use hides the overlay on hybrid (touch+keyboard)
 *  devices — a laptop student driving on WASD keeps a clean screen. */
const KEYBOARD_DRIVE_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

/** Cabin poll cadence (ms) — button active-states only, far below frame rate. */
const CABIN_POLL_MS = 250;

/** Safe-area insets (notches, home bars) — every calc() position includes
 *  the matching env(); falls back to 0px on browsers without the API. */
const INSET_L = "env(safe-area-inset-left, 0px)";
const INSET_R = "env(safe-area-inset-right, 0px)";
const INSET_B = "env(safe-area-inset-bottom, 0px)";

/**
 * THE PAD BOXES — the hit areas, which paint nothing.
 *
 * Each is `min(percentage, ceiling)`: the percentage keeps a thumb's reach
 * proportional on a small phone, the ceiling stops a tablet from handing a
 * quarter of the screen to a control that only ever needs a thumb's worth of
 * travel. They are also what the two glyph rows above them measure from, so the
 * rows can never land on top of a pad on any device in the ladder (checked at
 * 852×393, 780×360, 393×852 and 360×780).
 *
 * These are HIT sizes, not ink: the steering pad is 208 px wide and paints
 * roughly 900 px² — 0.27 % of a landscape iPhone.
 */
const STEER_PAD_W = "min(42%, 13rem)"; // ≤ 208 px
const STEER_PAD_H = "min(46%, 9rem)"; //  ≤ 144 px
const DRIVE_PAD_W = "min(36%, 11rem)"; // ≤ 176 px
const DRIVE_PAD_H = "min(52%, 11rem)"; // ≤ 176 px

/** Glyph-row height (px) — one 44 px touch row plus nothing else. */
const ROW_H = "2.75rem";

/**
 * THE TOP OF THE WHOLE CONTROL BAND, as a CSS length, for anything that has to
 * sit ABOVE the thumbs.
 *
 * `--sim-hud-floor` is not this number and cannot be: that one is where the
 * INSTRUMENT band ends (40px of dash + 8, i.e. 48px on every phone in the
 * ladder), and this band reaches 224px higher. A widget that clears the dash
 * can still land squarely on the steering pad.
 *
 * Measured, WebKit, iPhone 16 PORTRAIT 393x852, in two passes — the second one
 * is why this is the band and not just the pads:
 *
 *   at 108px (bottom-[6.75rem], the roomy floor)  wheel 981px², throttle 363px²
 *   at 184px (drive pad + inset + gap)            wheel 0, throttle 0, but a
 *                                                 6px-wide sliver of the mirror
 *                                                 glance (24px²) and the horn
 *                                                 (164px²) — the glyph ROWS,
 *                                                 which stack above the pads
 *   at this value                                 0
 *
 * The band is the tallest stack in this file: the drive pad, plus the two glyph
 * rows that measure from it (see the `bottom:` calcs below), plus the home
 * indicator, plus a small gap so nothing is flush. The steering side is
 * shorter, so the drive side decides.
 *
 * EXPORTED RATHER THAN RESTATED. These pads are the one thing on this screen
 * whose geometry is actively being reshaped; anything that reads this follows
 * the band wherever it goes instead of pinning a copy of today's number.
 */
export const TOUCH_CONTROLS_FLOOR =
  `calc(${DRIVE_PAD_H} + ${ROW_H} + ${ROW_H} + ${INSET_B} + 0.5rem)`;

interface CabinSnap {
  gearLabel: string;
  engineOn: boolean;
  parkingBrakeOn: boolean;
  hazardsOn: boolean;
  wipersOn: boolean;
  fogLightsOn: boolean;
  headlights: HeadlightSetting;
  seatbeltOn: boolean;
  indicator: IndicatorSetting;
}

function readCabinSnap(cabin: CabinControls): CabinSnap {
  const d = cabin.driveline;
  return {
    gearLabel: d.gearLabel,
    engineOn: d.engineOn,
    parkingBrakeOn: d.parkingBrakeOn,
    hazardsOn: d.hazardsOn,
    wipersOn: d.wipersOn,
    fogLightsOn: d.fogLightsOn,
    headlights: cabin.headlights,
    seatbeltOn: cabin.seatbeltOn,
    indicator: cabin.indicator,
  };
}

function sameSnap(a: CabinSnap | null, b: CabinSnap): boolean {
  return (
    a !== null &&
    a.gearLabel === b.gearLabel &&
    a.engineOn === b.engineOn &&
    a.parkingBrakeOn === b.parkingBrakeOn &&
    a.hazardsOn === b.hazardsOn &&
    a.wipersOn === b.wipersOn &&
    a.fogLightsOn === b.fogLightsOn &&
    a.headlights === b.headlights &&
    a.seatbeltOn === b.seatbeltOn &&
    a.indicator === b.indicator
  );
}

export interface TouchControlsProps {
  /** Shared axis source, already attached to the scene's SimInput. */
  touch: TouchInputSource;
  cabinRef: RefObject<CabinControls | null>;
  /** True while paused / quiz / teach / end overlays are up — overlay hides
   *  and releases every held axis. */
  hidden: boolean;
  onToggleCamera: () => void;
  onPause: () => void;
  onReset: () => void;
  /** Fullscreen toggle from the shell (QW1 owns the fullscreen element). */
  onToggleFullscreen: (() => void) | null;
}

export function TouchControls({
  touch,
  cabinRef,
  hidden,
  onToggleCamera,
  onPause,
  onReset,
  onToggleFullscreen,
}: TouchControlsProps) {
  // Hybrid devices: recent keyboard use hides the overlay; a screen touch
  // brings it back. Touch-only devices simply never see driving keys.
  const [keyboardActive, setKeyboardActive] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (KEYBOARD_DRIVE_CODES.has(e.code)) setKeyboardActive(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") setKeyboardActive(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const visible = !hidden && !keyboardActive;

  // Any hide (pause/quiz/teach/keyboard/unmount) releases held axes — a
  // finger resting on the throttle must never keep driving a frozen scene.
  useEffect(() => {
    if (!visible) touch.releaseAll();
  }, [visible, touch]);
  useEffect(() => () => touch.releaseAll(), [touch]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [snap, setSnap] = useState<CabinSnap | null>(null);

  // Low-Hz cabin poll for button active-states (skips setState when equal —
  // steady-state renders are zero).
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      const cabin = cabinRef.current;
      if (!cabin) return;
      const next = readCabinSnap(cabin);
      setSnap((prev) => (sameSnap(prev, next) ? prev : next));
    }, CABIN_POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, cabinRef]);

  // ---- steering pad (direct DOM writes, no state) ---------------------------
  const steerKnobRef = useRef<HTMLDivElement | null>(null);
  const steerPointer = useRef<number | null>(null);
  const steerStartX = useRef(0);

  /** Knob travel, px — the mark's own half-width, NOT the drag range: the
   *  ink is a state indicator for an 84 px gesture, not a scale model of it. */
  const STEER_KNOB_TRAVEL = 27;

  const steerApply = useCallback(
    (clientX: number) => {
      const dx = clientX - steerStartX.current;
      touch.setSteer(steerFromDrag(dx, TOUCH_STEER_RANGE_PX));
      const knob = steerKnobRef.current;
      if (knob) {
        const t = Math.max(
          -STEER_KNOB_TRAVEL,
          Math.min(STEER_KNOB_TRAVEL, (dx / TOUCH_STEER_RANGE_PX) * STEER_KNOB_TRAVEL),
        );
        knob.style.transform = `translateX(${t.toFixed(1)}px)`;
      }
    },
    [touch],
  );

  const onSteerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerPointer.current !== null) return; // one finger owns the wheel
      steerPointer.current = e.pointerId;
      // RELATIVE, not absolute: the gesture starts wherever the thumb landed,
      // so the student never has to find a 26 px dot before they can steer.
      steerStartX.current = e.clientX;
      capturePointer(e.currentTarget, e.pointerId);
      const knob = steerKnobRef.current;
      if (knob) knob.style.transition = "none";
      steerApply(e.clientX);
    },
    [steerApply],
  );

  const onSteerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerPointer.current === e.pointerId) steerApply(e.clientX);
    },
    [steerApply],
  );

  const onSteerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerPointer.current !== e.pointerId) return;
      steerPointer.current = null;
      touch.releaseSteer(); // springs back: keyboard/gamepad regain the axis
      const knob = steerKnobRef.current;
      if (knob) {
        knob.style.transition = "transform 140ms ease-out";
        knob.style.transform = "translateX(0px)";
      }
    },
    [touch],
  );

  // ---- drivetrain pad: ONE axis, throttle above centre, brake below --------
  const driveKnobRef = useRef<HTMLDivElement | null>(null);
  const drivePointer = useRef<number | null>(null);
  const driveStartY = useRef(0);

  const DRIVE_KNOB_TRAVEL = 30;

  const driveApply = useCallback(
    (clientY: number) => {
      const dy = clientY - driveStartY.current;
      const axis = driveAxisFromDrag(dy, TOUCH_DRIVE_RANGE_PX);
      // Exactly one channel is ever held: both pedals down is ambiguous input
      // and would also veto ReverseAssist's standstill hold.
      if (axis > 0) {
        touch.releaseBrake();
        touch.setThrottle(axis);
      } else if (axis < 0) {
        touch.releaseThrottle();
        touch.setBrake(-axis);
      } else {
        touch.releaseThrottle();
        touch.releaseBrake();
      }
      const knob = driveKnobRef.current;
      if (knob) {
        const t = Math.max(
          -DRIVE_KNOB_TRAVEL,
          Math.min(DRIVE_KNOB_TRAVEL, (dy / TOUCH_DRIVE_RANGE_PX) * DRIVE_KNOB_TRAVEL),
        );
        knob.style.transform = `translateY(${t.toFixed(1)}px)`;
        knob.style.borderColor =
          axis > 0 ? "var(--success)" : axis < 0 ? "var(--danger)" : "var(--accent)";
      }
    },
    [touch],
  );

  const onDriveDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (drivePointer.current !== null) return;
      drivePointer.current = e.pointerId;
      driveStartY.current = e.clientY;
      capturePointer(e.currentTarget, e.pointerId);
      const knob = driveKnobRef.current;
      if (knob) knob.style.transition = "none";
      driveApply(e.clientY);
    },
    [driveApply],
  );

  const onDriveMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (drivePointer.current === e.pointerId) driveApply(e.clientY);
    },
    [driveApply],
  );

  const onDriveEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (drivePointer.current !== e.pointerId) return;
      drivePointer.current = null;
      touch.releaseThrottle();
      touch.releaseBrake();
      const knob = driveKnobRef.current;
      if (knob) {
        knob.style.transition = "transform 140ms ease-out, border-color 140ms linear";
        knob.style.transform = "translateY(0px)";
        knob.style.borderColor = "var(--accent)";
      }
    },
    [touch],
  );

  const cabin = () => cabinRef.current;

  if (!visible) return null;

  const gearLabel = snap?.gearLabel ?? "—";
  const inReverse = gearLabel === "R";

  return (
    <div
      data-hud="touch-controls"
      className="pointer-events-none absolute inset-0 z-10 select-none"
    >
      {/* ══ BOTTOM-LEFT ═ steering ═══════════════════════════════════════════
          The box is the hit area and paints nothing at all; the mark inside is
          a 62 px rule and a 22 px knob. */}
      <div
        role="slider"
        aria-label="Волан — плъзни наляво или надясно"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerEnd}
        onPointerCancel={onSteerEnd}
        className="pointer-events-auto absolute touch-none"
        style={{
          left: 0,
          bottom: 0,
          width: `calc(${STEER_PAD_W} + ${INSET_L})`,
          height: `calc(${STEER_PAD_H} + ${INSET_B})`,
        }}
      >
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: `calc(1.25rem + ${INSET_L})`,
            bottom: `calc(1.1rem + ${INSET_B})`,
            width: "3.875rem",
            height: "1.5rem",
          }}
          aria-hidden
        >
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent/45" />
          <span className="absolute left-0 top-1/2 h-2 w-px -translate-y-1/2 bg-accent/45" />
          <span className="absolute right-0 top-1/2 h-2 w-px -translate-y-1/2 bg-accent/45" />
          <div
            ref={steerKnobRef}
            className="h-[22px] w-[22px] rounded-full border-2 border-accent bg-background/70"
          />
        </div>
      </div>

      {/* ══ BOTTOM-RIGHT ═ ONE drivetrain axis ═══════════════════════════════
          Up = forward · centre = neutral · down = brake, then reverse (the
          standstill hold hands over to ReverseAssist — see the header). */}
      <div
        role="slider"
        aria-label={
          inReverse
            ? "Ход — назад: надолу назад, нагоре спирачка"
            : "Ход — нагоре напред, в средата спиране, задръж надолу за назад"
        }
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={onDriveDown}
        onPointerMove={onDriveMove}
        onPointerUp={onDriveEnd}
        onPointerCancel={onDriveEnd}
        className="pointer-events-auto absolute touch-none"
        style={{
          right: 0,
          bottom: 0,
          width: `calc(${DRIVE_PAD_W} + ${INSET_R})`,
          height: `calc(${DRIVE_PAD_H} + ${INSET_B})`,
        }}
      >
        <div
          className="absolute flex flex-col items-center justify-center"
          style={{
            right: `calc(1.25rem + ${INSET_R})`,
            bottom: `calc(1.1rem + ${INSET_B})`,
            width: "1.5rem",
            height: "4.25rem",
          }}
          aria-hidden
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent/45" />
          <span className="absolute left-1/2 top-0 h-px w-2 -translate-x-1/2 bg-accent/45" />
          <span className="absolute bottom-0 left-1/2 h-px w-2 -translate-x-1/2 bg-accent/45" />
          <div
            ref={driveKnobRef}
            className="h-[22px] w-[22px] rounded-full border-2 bg-background/70"
            style={{ borderColor: "var(--accent)" }}
          />
        </div>
        {/* The selector letter, 11 px, directly ABOVE the axis mark — not in
            the corner beside it, which is precisely where the thumb sits. Shown
            only when it is NOT the everyday D: „am I in reverse?" is a real
            question, „am I in drive?" is not. */}
        {gearLabel !== "D" ? (
          <span
            className="absolute text-[11px] font-black leading-none"
            style={{
              right: `calc(1.6rem + ${INSET_R})`,
              bottom: `calc(5.6rem + ${INSET_B})`,
              color: inReverse ? "var(--warning)" : "var(--muted)",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)",
            }}
            aria-hidden
          >
            {gearLabel}
          </span>
        ) : null}
      </div>

      {/* ══ LEFT ROW ═ signal + the two graded glances on that side ══════════
          Sits directly on top of the steering pad, hard against the edge, so
          it can never cover the middle of the picture and never steal a
          thumb-down from the pad. */}
      <div
        className="absolute flex items-center"
        style={{
          left: `calc(0.125rem + ${INSET_L})`,
          bottom: `calc(${STEER_PAD_H} + ${INSET_B})`,
          height: ROW_H,
        }}
      >
        <GlyphButton
          labelBg="Мигач наляво"
          active={snap?.indicator === "left"}
          onClick={() => cabin()?.indicateLeft()}
        >
          ⇦
        </GlyphButton>
        <GlyphButton labelBg="Поглед в лявото огледало" onClick={() => cabin()?.glance("left")}>
          Л
        </GlyphButton>
        <GlyphButton
          labelBg="Поглед в огледалото за задно виждане"
          onClick={() => cabin()?.glance("rear")}
        >
          З
        </GlyphButton>
      </div>

      {/* ══ RIGHT ROWS ═ glance + signal + horn, and the utility row above ══ */}
      <div
        className="absolute flex items-center"
        style={{
          right: `calc(0.125rem + ${INSET_R})`,
          bottom: `calc(${DRIVE_PAD_H} + ${INSET_B})`,
          height: ROW_H,
        }}
      >
        <HoldGlyphButton labelBg="Клаксон — задръж" onHold={(on) => cabin()?.driveline.setHorn(on)}>
          📢
        </HoldGlyphButton>
        <GlyphButton labelBg="Поглед в дясното огледало" onClick={() => cabin()?.glance("right")}>
          Д
        </GlyphButton>
        <GlyphButton
          labelBg="Мигач надясно"
          active={snap?.indicator === "right"}
          onClick={() => cabin()?.indicateRight()}
        >
          ⇨
        </GlyphButton>
      </div>

      <div
        className="absolute flex items-center"
        style={{
          right: `calc(0.125rem + ${INSET_R})`,
          bottom: `calc(${DRIVE_PAD_H} + ${ROW_H} + ${INSET_B})`,
          height: ROW_H,
        }}
      >
        {onToggleFullscreen ? (
          <GlyphButton labelBg="Цял екран" onClick={onToggleFullscreen}>
            ⛶
          </GlyphButton>
        ) : null}
        <GlyphButton labelBg="Пауза" onClick={onPause}>
          ‖
        </GlyphButton>
        <GlyphButton labelBg="Смяна на изглед (камера)" onClick={onToggleCamera}>
          🎥
        </GlyphButton>
        <GlyphButton
          labelBg="Контроли на автомобила"
          active={sheetOpen}
          onClick={() => setSheetOpen((o) => !o)}
        >
          ⚙
        </GlyphButton>
      </div>

      {/* ══ DRIVELINE SHEET ══════════════════════════════════════════════════
          „the popups continue to eat almost the full screen and must be
          completely redesigned". The old one was a 256 px column up to 78 % of
          the height — 23 % of a landscape iPhone, straight down the middle of
          the road, on a screen the founder is measuring in percentages.

          This is a wrapping strip of 44 px transparent cells that starts at the
          left edge, stops 176 px short of the right one (so it can never share
          a pixel with the right-hand rails) and floats above the drivetrain pad
          and both of its rows. One row on a landscape phone, three on a
          portrait one, and its whole ink is twelve short words — about 2 % of
          the screen while it is open, against 23 %.

          Same controls, same CabinControls / DrivelineState calls, same single
          code path as the keys and the cockpit hotspots. */}
      {sheetOpen ? (
        <div
          role="toolbar"
          aria-label="Контроли на автомобила"
          className="pointer-events-auto absolute flex flex-wrap items-end justify-start gap-x-0.5 gap-y-0.5"
          style={{
            // Stops short of the right rail's 176 px column so the two can
            // never share a pixel on any device in the ladder, and sits above
            // the drivetrain pad and both of its glyph rows.
            left: `calc(0.125rem + ${INSET_L})`,
            right: `calc(11rem + ${INSET_R})`,
            bottom: `calc(${DRIVE_PAD_H} + ${ROW_H} + ${ROW_H} + ${INSET_B})`,
          }}
        >
          <SheetCell
            textBg="ДВИГ"
            labelBg="Двигател"
            active={snap?.engineOn ?? false}
            onClick={() => cabin()?.driveline.toggleEngine()}
          />
          <SheetCell
            textBg="РЪЧНА"
            labelBg="Ръчна спирачка"
            tone="danger"
            active={snap?.parkingBrakeOn ?? false}
            onClick={() => cabin()?.toggleParkingBrake()}
          />
          <SheetCell
            textBg="КОЛАН"
            labelBg="Предпазен колан"
            tone="danger"
            active={snap?.seatbeltOn ?? false}
            onClick={() => cabin()?.toggleSeatbelt()}
          />
          <SheetCell
            textBg={
              snap?.headlights === "high"
                ? "ДЪЛГИ"
                : snap?.headlights === "low"
                  ? "КЪСИ"
                  : "СВЕТЛ"
            }
            labelBg={
              snap?.headlights === "high"
                ? "Светлини: дълги"
                : snap?.headlights === "low"
                  ? "Светлини: къси"
                  : "Светлини: изключени"
            }
            active={(snap?.headlights ?? "off") !== "off"}
            onClick={() => cabin()?.cycleHeadlights()}
          />
          <SheetCell
            textBg="АВАР"
            labelBg="Аварийни светлини"
            tone="warning"
            active={snap?.hazardsOn ?? false}
            onClick={() => cabin()?.driveline.toggleHazards()}
          />
          <SheetCell
            textBg="ЧИСТ"
            labelBg="Чистачки"
            active={snap?.wipersOn ?? false}
            onClick={() => cabin()?.driveline.toggleWipers()}
          />
          <SheetCell
            textBg="МЪГЛА"
            labelBg="Фарове за мъгла"
            active={snap?.fogLightsOn ?? false}
            onClick={() => cabin()?.driveline.toggleFogLights()}
          />
          {/* Selector stepper. The drivetrain axis handles D↔R on its own (the
              standstill hold), so this is the explicit lever for P and N and
              for the manual box — kept because a student must always be able
              to reach the real control, not only the assist. */}
          <SheetCell
            textBg="◄P"
            labelBg="Скоростен лост — стъпка към P"
            active={false}
            onClick={() => cabin()?.driveline.gearDown()}
          />
          <SheetCell textBg={gearLabel} labelBg={`Скоростен лост: ${gearLabel}`} readOnly />
          <SheetCell
            textBg="D►"
            labelBg="Скоростен лост — стъпка към D"
            active={false}
            onClick={() => cabin()?.driveline.gearUp()}
          />
          <SheetCell
            textBg="РЕСТ"
            labelBg="Рестарт на колата"
            active={false}
            onClick={onReset}
          />
          <SheetCell
            textBg="✕"
            labelBg="Затвори контролите"
            active={false}
            onClick={() => setSheetOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
//
// EVERY ONE OF THESE IS A 44 × 44 TRANSPARENT HIT AREA WITH A SMALL GLYPH IN
// IT. No background, no border, no shadow, no backdrop-filter — so the button
// costs the screen exactly its glyph and nothing else, while a thumb still has
// the full 44 px target the WCAG/HIG floor asks for. The `text-shadow` is what
// keeps a 15 px glyph legible over bright tarmac; it is drawn on the glyph, not
// on a box, so it buys contrast without buying pixels.
// ---------------------------------------------------------------------------

const GLYPH_SHADOW = "0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6)";

function glyphStyle(active: boolean, tone?: "danger" | "warning"): CSSProperties {
  return {
    color: active
      ? tone === "danger"
        ? "var(--danger)"
        : tone === "warning"
          ? "var(--warning)"
          : "var(--accent)"
      : "var(--foreground)",
    opacity: active ? 1 : 0.82,
    textShadow: GLYPH_SHADOW,
  };
}

function GlyphButton({
  labelBg,
  active = false,
  onClick,
  children,
}: {
  labelBg: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      aria-pressed={active}
      onClick={onClick}
      className="pointer-events-auto flex h-11 w-11 touch-manipulation select-none items-center justify-center text-[15px] font-black leading-none"
      style={glyphStyle(active)}
    >
      {children}
    </button>
  );
}

/** Momentary control (horn): down = on, any release path = off. */
function HoldGlyphButton({
  labelBg,
  onHold,
  children,
}: {
  labelBg: string;
  onHold: (on: boolean) => void;
  children: ReactNode;
}) {
  const downRef = useRef(false);
  const [held, setHeld] = useState(false);
  const start = (e: ReactPointerEvent<HTMLButtonElement>) => {
    capturePointer(e.currentTarget, e.pointerId);
    downRef.current = true;
    setHeld(true);
    onHold(true);
  };
  const end = () => {
    if (!downRef.current) return;
    downRef.current = false;
    setHeld(false);
    onHold(false);
  };
  // Release on unmount too — a quiz pause mid-honk must not latch the horn.
  useEffect(() => end, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto flex h-11 w-11 touch-none select-none items-center justify-center text-[17px] font-black leading-none"
      style={glyphStyle(held)}
    >
      {children}
    </button>
  );
}

/**
 * Driveline-sheet cell: the same 44 × 44 transparent target, lit when the
 * control is engaged.
 *
 * A WORD, NOT A PICTOGRAM. These are the controls a learner is least likely to
 * recognise — „ЧИСТ" is unambiguous where a wiper glyph at 11 px is a smudge,
 * and this product's whole reason to exist is that the student understands what
 * they just did. A five-letter 10 px word costs about 370 px² — less than the
 * emoji it replaces, and it teaches. `readOnly` is the selector letter: a
 * readout sitting in the row, not a button.
 */
function SheetCell({
  labelBg,
  textBg,
  active = false,
  tone,
  onClick,
  readOnly = false,
}: {
  labelBg: string;
  textBg: string;
  active?: boolean;
  tone?: "danger" | "warning";
  onClick?: () => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <span
        aria-label={labelBg}
        title={labelBg}
        className="flex h-11 w-11 items-center justify-center text-[15px] font-black leading-none"
        style={glyphStyle(true)}
      >
        {textBg}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      aria-pressed={active}
      onClick={onClick}
      className="pointer-events-auto flex h-11 w-11 touch-manipulation select-none items-center justify-center text-[10px] font-black uppercase leading-none tracking-tight"
      style={glyphStyle(active, tone)}
    >
      {textBg}
    </button>
  );
}
