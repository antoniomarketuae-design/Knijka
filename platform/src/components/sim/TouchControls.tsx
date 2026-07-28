"use client";

/**
 * TouchControls — the P1 touch input overlay (plan doc 68 row P1; audit E1:
 * ADR-005 was violated by the old refusal screen).
 *
 * Layout (landscape phone, thumbs at the screen edges):
 *   LEFT  — steer slider (drag = proportional steer via steerFromDrag's expo
 *           curve; springs back to centre on release) with the indicator and
 *           mirror-glance buttons in a row above it (glances are GRADED —
 *           phones must be able to earn them).
 *   RIGHT — vertical pedal strips (brake | throttle): position on the strip
 *           IS the pedal value (pedalFromPointerY), the analog counterpart of
 *           the QW8 keyboard ramps. Placed inboard of the minimap so the HUD
 *           corners stay untouched; horn + camera ride to their left.
 *   EDGE  — utility column (fullscreen / pause / „controls" sheet). The sheet
 *           is the reliable driveline fallback (engine, P↔D stepper, parking
 *           brake, lights, belt, hazards, wipers, fog, restart); the cockpit
 *           hotspots (doc 69, touch-sized) remain the primary in-world way.
 *
 * WHY A SLIDER AND NOT TILT (the P1 A/B question): iOS gates
 * DeviceOrientation behind a permission prompt (HTTPS-only) that would
 * interrupt the first drive; tilt misbehaves under landscape orientation
 * lock and on flat-propped tablets; and a slider is deterministic for the
 * rule engine. The seam stays open: TOUCH_STEER_MODE_STORAGE_KEY defaults to
 * "slider", and a future tilt source is just another setSteer() caller.
 *
 * Input path: every gesture writes into the shared TouchInputSource, which
 * SimInput.read() merges by priority (touch active → touch wins). Steering,
 * pedals, gate, difficulty shaping — all downstream code is unchanged.
 * Cabin buttons call the SAME CabinControls/DrivelineState methods the keys
 * and cockpit hotspots use — one code path, so the A2 procedure observer
 * cannot tell the devices apart.
 *
 * Perf: gesture handlers write into refs/DOM styles directly (no React state
 * at gesture rate, zero per-frame allocations); the only poll is a low-Hz
 * cabin snapshot that early-outs when nothing changed.
 *
 * Visibility: mounts only on touch-capable devices (hasTouchScreen), hides
 * while the sim is paused (menu/quiz/teach/end — the `hidden` prop) and
 * while the keyboard is in recent use (hybrid laptops); a screen touch
 * brings it back. Every hide releases all held axes.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  pedalFromPointerY,
  steerFromDrag,
  TOUCH_STEER_RANGE_FRACTION,
  type TouchInputSource,
} from "@/modules/sim/engine";
import type { CabinControls, HeadlightSetting, IndicatorSetting } from "@/modules/sim/scene/cabin";

// ---------------------------------------------------------------------------
// Steer-mode setting seam (A/B: slider vs tilt). Only "slider" is
// implemented; "tilt" intentionally falls back to the slider until a tilt
// source lands (see the header rationale) — the flag exists so an A/B test
// can flip cohorts without a schema change.
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
 * Right-edge clearance for the minimap disc, and the floor everything sits on.
 *
 * BOTH ARE NOW PUBLISHED BY THE PLAY SHELL, not decided here (see
 * lesson-ui/immersive.ts + LessonPlayShell's root `style`), and the fallbacks
 * below are exactly the old hard-coded values so a TouchControls mounted
 * outside a shell behaves as it always did.
 *
 * `--sim-minimap-clearance` — the minimap is 168 px and the pedal cluster sat
 * inboard of a fixed 180 px reservation. But the minimap has been DEFAULT-OFF
 * since the 2026-07-28 review, so on virtually every phone this was 180 px of
 * screen held for a widget that was not on it. It follows the toggle now.
 *
 * `--sim-hud-floor` — the height of the instrument band plus its gutter. The
 * pedals used to start 12 px off the bottom, which put their lower half behind
 * the (inert) status bar: measured 844×390, pedals y 242–370 against a bar at
 * y 304–374. Reading the band's real height means the two cannot overlap.
 */
const MINIMAP_CLEARANCE = "var(--sim-minimap-clearance, 180px)";
const HUD_FLOOR = "var(--sim-hud-floor, 0.75rem)";

/** Below this overlay width (px) the inboard pedal position would collide
 *  with the steer zone (portrait phones / small letterboxes). Narrow mode
 *  moves the pedals to the right edge instead — over the minimap, which is
 *  pointer-events-none (hud/Minimap.tsx), so the overlap is visual only and
 *  every interactive zone stays clear. Landscape (the recommended
 *  orientation, ≥ this width) keeps the clean inboard layout. */
const NARROW_LAYOUT_MAX_PX = 640;

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

  // Narrow-container fallback (see NARROW_LAYOUT_MAX_PX): measured on the
  // overlay ROOT (it may live in a letterboxed aspect-video box, so window
  // width alone would lie). The container only changes size with the window,
  // fullscreen or orientation — all of which fire these events; plain
  // listeners beat ResizeObserver here (embedded webviews deliver them more
  // reliably, and there is nothing container-query-ish to miss).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const measure = () => {
      const w = rootRef.current?.getBoundingClientRect().width ?? 0;
      setNarrow(w > 0 && w < NARROW_LAYOUT_MAX_PX);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [visible]);

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

  // ---- steer slider gesture (direct DOM writes, no state) -------------------
  const steerZoneRef = useRef<HTMLDivElement | null>(null);
  const steerKnobRef = useRef<HTMLDivElement | null>(null);
  const steerGesture = useRef<{
    pointerId: number;
    startX: number;
    rangePx: number;
    travelPx: number;
  } | null>(null);

  const steerApply = useCallback(
    (clientX: number) => {
      const g = steerGesture.current;
      if (!g) return;
      const dx = clientX - g.startX;
      touch.setSteer(steerFromDrag(dx, g.rangePx));
      const knob = steerKnobRef.current;
      if (knob) {
        const t = Math.min(g.travelPx, Math.max(-g.travelPx, dx));
        knob.style.transform = `translateX(${t}px)`;
      }
    },
    [touch],
  );

  const onSteerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerGesture.current !== null) return; // one finger owns the wheel
      const zone = steerZoneRef.current;
      if (!zone) return;
      const rect = zone.getBoundingClientRect();
      steerGesture.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        rangePx: rect.width * TOUCH_STEER_RANGE_FRACTION,
        travelPx: Math.max(24, rect.width / 2 - 36),
      };
      capturePointer(zone, e.pointerId);
      const knob = steerKnobRef.current;
      if (knob) knob.style.transition = "none";
      steerApply(e.clientX);
    },
    [steerApply],
  );

  const onSteerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerGesture.current?.pointerId === e.pointerId) steerApply(e.clientX);
    },
    [steerApply],
  );

  const onSteerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerGesture.current?.pointerId !== e.pointerId) return;
      steerGesture.current = null;
      touch.releaseSteer(); // springs back: keyboard/gamepad regain the axis
      const knob = steerKnobRef.current;
      if (knob) {
        knob.style.transition = "transform 140ms ease-out";
        knob.style.transform = "translateX(0px)";
      }
    },
    [touch],
  );

  const cabin = () => cabinRef.current;

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      data-hud="touch-controls"
      className="pointer-events-none absolute inset-0 z-10 select-none"
    >
      {/* -- LEFT: indicators + graded mirror glances, above the steer zone -- */}
      <div
        className="absolute flex items-center gap-2"
        style={{
          left: `calc(0.75rem + ${INSET_L})`,
          bottom: `calc(11.75rem + ${HUD_FLOOR} + ${INSET_B})`,
        }}
      >
        <RoundButton
          labelBg="Мигач наляво"
          active={snap?.indicator === "left"}
          onClick={() => cabin()?.indicateLeft()}
        >
          ⇦
        </RoundButton>
        <RoundButton labelBg="Поглед в лявото огледало" onClick={() => cabin()?.glance("left")}>
          <MirrorGlyph sideBg="Л" />
        </RoundButton>
        <RoundButton
          labelBg="Поглед в огледалото за задно виждане"
          onClick={() => cabin()?.glance("rear")}
        >
          <MirrorGlyph sideBg="З" />
        </RoundButton>
        <RoundButton labelBg="Поглед в дясното огледало" onClick={() => cabin()?.glance("right")}>
          <MirrorGlyph sideBg="Д" />
        </RoundButton>
        <RoundButton
          labelBg="Мигач надясно"
          active={snap?.indicator === "right"}
          onClick={() => cabin()?.indicateRight()}
        >
          ⇨
        </RoundButton>
      </div>

      {/* -- LEFT: steer slider (drag; springs back on release) -------------- */}
      <div
        ref={steerZoneRef}
        role="slider"
        aria-label="Волан — плъзни наляво или надясно"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerEnd}
        onPointerCancel={onSteerEnd}
        className="pointer-events-auto absolute touch-none rounded-2xl border border-border bg-background/40 backdrop-blur-sm"
        style={{
          left: `calc(0.75rem + ${INSET_L})`,
          bottom: `calc(6rem + ${HUD_FLOOR} + ${INSET_B})`,
          width: "clamp(11rem, 34vw, 20rem)",
          height: "5rem",
        }}
      >
        <div className="absolute bottom-2 left-1/2 top-2 w-px -translate-x-1/2 bg-border" aria-hidden />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={steerKnobRef}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent bg-background/85 text-2xl text-accent shadow-lg"
            aria-hidden
          >
            ⎈
          </div>
        </div>
      </div>

      {/* -- RIGHT: horn + camera + pedals. Landscape: inboard of the minimap
             (no HUD overlap at all); narrow/portrait: at the right edge, over
             the pointer-events-none minimap (interactive zones stay clear). */}
      <div
        className="absolute flex items-end gap-2"
        style={{
          right: narrow
            ? `calc(0.75rem + ${INSET_R})`
            : `calc(1.25rem + ${MINIMAP_CLEARANCE} + ${INSET_R})`,
          bottom: `calc(${HUD_FLOOR} + ${INSET_B})`,
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <RoundButton labelBg="Смяна на изглед (камера)" onClick={onToggleCamera}>
            <span aria-hidden className="text-base">🎥</span>
          </RoundButton>
          <HoldButton
            labelBg="Клаксон — задръж"
            onHold={(on) => cabin()?.driveline.setHorn(on)}
            className="h-14 w-14 text-base"
          >
            <span aria-hidden>📢</span>
          </HoldButton>
        </div>
        <PedalStrip
          labelBg="Спирачка"
          shortBg="СПИР"
          fillClassName="bg-red-500/45"
          set={(v) => touch.setBrake(v)}
          release={() => touch.releaseBrake()}
        />
        <PedalStrip
          labelBg="Газ"
          shortBg="ГАЗ"
          fillClassName="bg-emerald-500/45"
          set={(v) => touch.setThrottle(v)}
          release={() => touch.releaseThrottle()}
        />
      </div>

      {/* -- EDGE: utility column (fullscreen / pause / controls sheet) ------ */}
      <div
        className="absolute top-1/2 flex -translate-y-1/2 flex-col gap-2"
        style={{ right: `calc(0.5rem + ${INSET_R})` }}
        data-hud="touch-utility"
      >
        {onToggleFullscreen ? (
          <RoundButton labelBg="Цял екран" onClick={onToggleFullscreen}>
            ⛶
          </RoundButton>
        ) : null}
        <RoundButton labelBg="Пауза" onClick={onPause}>
          ⏸
        </RoundButton>
        <RoundButton
          labelBg="Контроли на автомобила"
          active={sheetOpen}
          onClick={() => setSheetOpen((o) => !o)}
        >
          ⚙
        </RoundButton>
      </div>

      {/* -- Driveline sheet: reliable fallback for every cabin control ------ */}
      {sheetOpen ? (
        <div
          className="pointer-events-auto absolute top-1/2 w-64 max-w-[70vw] -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background/90 p-3 backdrop-blur"
          style={{ right: `calc(3.75rem + ${INSET_R})`, maxHeight: "78%" }}
          role="dialog"
          aria-label="Контроли на автомобила"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Контроли
            </span>
            <button
              type="button"
              aria-label="Затвори"
              onClick={() => setSheetOpen(false)}
              className="rounded-full px-2 py-0.5 text-sm text-muted transition hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Selector stepper: [ ← към P | current | към D → ] */}
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface/70 p-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-background/70 px-3 py-2 text-xs font-bold text-foreground transition active:bg-surface"
              onClick={() => cabin()?.driveline.gearDown()}
            >
              ← към P
            </button>
            <span className="min-w-10 text-center text-xl font-extrabold text-accent">
              {snap?.gearLabel ?? "—"}
            </span>
            <button
              type="button"
              className="rounded-lg border border-border bg-background/70 px-3 py-2 text-xs font-bold text-foreground transition active:bg-surface"
              onClick={() => cabin()?.driveline.gearUp()}
            >
              към D →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SheetToggle
              labelBg="Двигател"
              active={snap?.engineOn ?? false}
              onClick={() => cabin()?.driveline.toggleEngine()}
            />
            <SheetToggle
              labelBg="Ръчна спирачка"
              active={snap?.parkingBrakeOn ?? false}
              onClick={() => cabin()?.toggleParkingBrake()}
            />
            <SheetToggle
              labelBg="Колан"
              active={snap?.seatbeltOn ?? false}
              onClick={() => cabin()?.toggleSeatbelt()}
            />
            <SheetToggle
              labelBg={
                snap?.headlights === "high"
                  ? "Светлини: дълги"
                  : snap?.headlights === "low"
                    ? "Светлини: къси"
                    : "Светлини: изкл."
              }
              active={(snap?.headlights ?? "off") !== "off"}
              onClick={() => cabin()?.cycleHeadlights()}
            />
            <SheetToggle
              labelBg="Аварийни"
              active={snap?.hazardsOn ?? false}
              onClick={() => cabin()?.driveline.toggleHazards()}
            />
            <SheetToggle
              labelBg="Чистачки"
              active={snap?.wipersOn ?? false}
              onClick={() => cabin()?.driveline.toggleWipers()}
            />
            <SheetToggle
              labelBg="Фарове за мъгла"
              active={snap?.fogLightsOn ?? false}
              onClick={() => cabin()?.driveline.toggleFogLights()}
            />
            <SheetToggle labelBg="Рестарт на колата" active={false} onClick={onReset} />
          </div>

          <p className="mt-2 text-[10px] leading-snug text-muted">
            Съвет: в изглед „кокпит“ можеш да докосваш контролите направо в
            кабината.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** Mirror glyph: a framed side letter (Л/З/Д) reading as a mirror check. */
function MirrorGlyph({ sideBg }: { sideBg: string }) {
  return (
    <span className="flex h-6 w-7 items-center justify-center rounded-[4px] border border-current text-[11px] font-extrabold">
      {sideBg}
    </span>
  );
}

function RoundButton({
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
      className={`pointer-events-auto flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full border text-sm font-bold backdrop-blur transition ${
        active
          ? "border-accent bg-accent/25 text-foreground"
          : "border-border bg-background/60 text-muted active:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

/** Momentary control (horn): down = on, any release path = off. */
function HoldButton({
  labelBg,
  onHold,
  className = "",
  children,
}: {
  labelBg: string;
  onHold: (on: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const downRef = useRef(false);
  const start = (e: ReactPointerEvent<HTMLButtonElement>) => {
    capturePointer(e.currentTarget, e.pointerId);
    downRef.current = true;
    onHold(true);
  };
  const end = () => {
    if (!downRef.current) return;
    downRef.current = false;
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
      className={`pointer-events-auto flex touch-none select-none items-center justify-center rounded-full border border-border bg-background/60 font-bold text-muted backdrop-blur transition active:border-accent active:bg-accent/25 active:text-foreground ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Vertical pedal strip: pointer position on the strip is the pedal value
 * (bottom 0 → top 1). The fill bar mirrors the value via a direct style
 * write — no React state at gesture rate.
 */
function PedalStrip({
  labelBg,
  shortBg,
  fillClassName,
  set,
  release,
}: {
  labelBg: string;
  shortBg: string;
  fillClassName: string;
  set: (v: number) => void;
  release: () => void;
}) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{ pointerId: number; top: number; height: number } | null>(null);

  const apply = (clientY: number) => {
    const g = gesture.current;
    if (!g) return;
    const v = pedalFromPointerY(clientY, g.top, g.height);
    set(v);
    const fill = fillRef.current;
    if (fill) fill.style.height = `${Math.round(v * 100)}%`;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current !== null) return; // one finger per pedal
    const zone = zoneRef.current;
    if (!zone) return;
    const rect = zone.getBoundingClientRect(); // cached per gesture
    gesture.current = { pointerId: e.pointerId, top: rect.top, height: rect.height };
    capturePointer(zone, e.pointerId);
    apply(e.clientY);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId === e.pointerId) apply(e.clientY);
  };
  const onEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== e.pointerId) return;
    gesture.current = null;
    release();
    const fill = fillRef.current;
    if (fill) fill.style.height = "0%";
  };
  // Unmount safety: the axis is also released by the overlay's releaseAll.
  useEffect(
    () => () => {
      gesture.current = null;
    },
    [],
  );

  return (
    <div
      ref={zoneRef}
      role="slider"
      aria-label={labelBg}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      className="pointer-events-auto relative flex touch-none select-none flex-col items-center justify-end overflow-hidden rounded-2xl border border-border bg-background/40 backdrop-blur-sm"
      style={{ width: "3.5rem", height: "clamp(8rem, 30vh, 11rem)" }}
    >
      <div
        ref={fillRef}
        className={`absolute bottom-0 left-0 right-0 ${fillClassName}`}
        style={{ height: "0%" }}
        aria-hidden
      />
      <span className="relative z-10 mb-2 text-[10px] font-extrabold tracking-wide text-foreground/80">
        {shortBg}
      </span>
    </div>
  );
}

function SheetToggle({
  labelBg,
  active,
  onClick,
}: {
  labelBg: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] font-bold transition ${
        active
          ? "border-accent bg-accent/20 text-foreground"
          : "border-border bg-surface/60 text-muted active:bg-surface"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-accent" : "bg-border"}`}
      />
      {labelBg}
    </button>
  );
}
