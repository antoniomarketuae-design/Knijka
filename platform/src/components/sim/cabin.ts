// Cabin controls — the vehicle "electrics" the physics core deliberately does
// not know about: indicators, headlights, seatbelt, mirror-glance requests and
// the night-preview toggle — PLUS ownership of the A1 driveline state machine
// (ignition, selector, clutch, parking brake, hazards, wipers, fog, horn):
// CabinControls binds the keys, DrivelineState (modules/sim/vehicle) holds the
// truth. The R3F visual layer reads this state per frame, the HUD polls it,
// and the VehicleSample builder serializes it for the rule engine
// (contracts.ts); VehicleRig feeds `driveline.physicsInput` into VehicleSim.
//
// Key handling mirrors the SimInput pattern (engine/input.ts) but lives here
// because these are cabin/vehicle-operation concerns, not driving-axis inputs.
//
// A2: the cockpit hotspots (vitok/hotspots.ts) call the SAME public methods
// the key handlers use — clicking the starter and pressing I are literally
// one code path, so the procedure observer cannot tell them apart (doc 69).

import { DrivelineState, type VehicleStartState } from "@/modules/sim/vehicle";

export type IndicatorSetting = "off" | "left" | "right";
export type HeadlightSetting = "off" | "low" | "high";
export type MirrorGlanceKind = "left" | "right" | "rear";

/** Indicator blink period (s): 600 ms full cycle => 300 ms on / 300 ms off. */
export const BLINK_PERIOD_S = 0.6;
/** Mirror-glance camera excursion duration (s). */
export const GLANCE_DURATION_S = 0.35;

/**
 * Single place that defines the cabin key bindings (KeyboardEvent.code, so
 * they are keyboard-layout independent). Q/E/R was the design sketch for the
 * glances, but R is already "reset" (engine/input.ts) — rear glance sits on F.
 */
export const CABIN_KEYS = {
  indicatorLeft: "Comma",
  indicatorRight: "Period",
  headlights: "KeyL",
  seatbelt: "KeyB",
  glanceLeft: "KeyQ",
  glanceRight: "KeyE",
  glanceRear: "KeyF",
  nightPreview: "KeyN",
  muteAudio: "KeyM",
} as const;

/**
 * A1 driveline key bindings — chosen against the FULL existing map (WASD/
 * arrows drive, Space, C camera, R reset, Esc pause, X fullscreen, ,/. L B
 * Q/E/F N M cabin) so nothing collides:
 *
 *  - I  = ignition (E is the right-mirror glance; W/S are pedals),
 *  - Space = stateful parking-brake TOGGLE — it replaces the old momentary
 *    drift handbrake on the keyboard (that stays on gamepad A only),
 *  - [ / ] = selector gate one step toward P / toward D (and manual gear
 *    down/up). Shift/Ctrl were rejected: Ctrl+W closes the browser tab and
 *    five discrete Shift presses trip Windows Sticky Keys mid-lesson,
 *  - Z (HOLD) = clutch — left pinky, held while W throttles (manual mode),
 *  - J = hazards, T = wipers, V = fog lights (W and F are taken),
 *  - H (HOLD) = horn (the genre convention; B is the seatbelt).
 */
export const DRIVELINE_KEYS = {
  engine: "KeyI",
  parkingBrake: "Space",
  gearUp: "BracketRight",
  gearDown: "BracketLeft",
  clutch: "KeyZ",
  hazards: "KeyJ",
  wipers: "KeyT",
  fogLights: "KeyV",
  horn: "KeyH",
} as const;

export interface CabinCallbacks {
  /** B — seatbelt buckled/unbuckled (audio plays the click). */
  onSeatbeltToggle?: (on: boolean) => void;
  /** Q/E/F — a mirror glance started (camera + rule-engine sample react). */
  onGlance?: (mirror: MirrorGlanceKind) => void;
  /** M — mute toggle request (audio layer owns the actual state). */
  onToggleMute?: () => void;
  /** Space — parking brake engaged/released (audio plays the lever click). */
  onParkingBrakeToggle?: (on: boolean) => void;
}

/** Steer angle (rad) that arms the indicator auto-cancel... */
const AUTOCANCEL_ARM_RAD = 0.22;
/** ...and the return-to-centre angle that releases it (like a real stalk). */
const AUTOCANCEL_RELEASE_RAD = 0.05;

export class CabinControls {
  indicator: IndicatorSetting = "off";
  headlights: HeadlightSetting = "off";
  seatbeltOn = false;
  nightPreview = false;

  /** A1 vehicle state machine — ignition/selector/clutch/parking brake/
   *  hazards/wipers/fog/horn. ONE source: physics, HUD, cluster, sample
   *  builder and (A2) the procedure machine all read from here. */
  readonly driveline: DrivelineState;

  /** Mirror currently being glanced at (for camera + HUD), or null. */
  glanceMirror: MirrorGlanceKind | null = null;

  private clock = 0;
  private indicatorChangedAt = 0;
  private glanceStartedAt = -1;
  /** One-frame latch consumed by the VehicleSample builder. */
  private pendingGlanceSample: MirrorGlanceKind | null = null;
  private autocancelArmed = false;
  private disposed = false;

  constructor(
    private readonly callbacks: CabinCallbacks = {},
    /** Lesson spawn policy (LessonSpec.vehicleStart) — default cold start:
     *  engine OFF, selector P, parking brake ON (the pre-drive reality). */
    vehicleStart: VehicleStartState = "cold",
  ) {
    this.driveline = new DrivelineState(vehicleStart);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  /**
   * Advance the blink/glance clocks; call once per render frame.
   * `steerRad` (+ = left, from VehicleSim) drives the indicator auto-cancel:
   * once the wheel has clearly turned toward the signalled side and then
   * returned to centre, the stalk clicks off — like a real car.
   */
  update(dtSec: number, steerRad: number): void {
    this.clock += dtSec;

    if (this.glanceMirror && this.clock - this.glanceStartedAt >= GLANCE_DURATION_S) {
      this.glanceMirror = null;
      this.glanceStartedAt = -1;
    }

    if (this.indicator !== "off") {
      const toward = this.indicator === "left" ? steerRad : -steerRad;
      if (toward > AUTOCANCEL_ARM_RAD) this.autocancelArmed = true;
      else if (this.autocancelArmed && toward < AUTOCANCEL_RELEASE_RAD) {
        this.indicator = "off";
        this.autocancelArmed = false;
      }
    }
  }

  /** True during the "on" half of the 600 ms blink cycle (starts on). */
  get blinkOn(): boolean {
    if (this.indicator === "off") return false;
    return ((this.clock - this.indicatorChangedAt) % BLINK_PERIOD_S) < BLINK_PERIOD_S / 2;
  }

  /** Hazard-lamp blink (A1): free-running on the same 600 ms relay period —
   *  lights BOTH indicator lamps in the cluster/exterior while hazards are on. */
  get hazardBlinkOn(): boolean {
    if (!this.driveline.hazardsOn) return false;
    return (this.clock % BLINK_PERIOD_S) < BLINK_PERIOD_S / 2;
  }

  /** Glance progress 0..1 while a glance is active, else -1. */
  glanceProgress(): number {
    if (!this.glanceMirror) return -1;
    const p = (this.clock - this.glanceStartedAt) / GLANCE_DURATION_S;
    return p >= 0 && p <= 1 ? p : -1;
  }

  /**
   * The mirror glanced THIS frame, exactly once (VehicleSample.mirrorGlance
   * is a one-frame event for the rule engine's mirror-check detector).
   */
  consumeGlanceSample(): MirrorGlanceKind | null {
    const m = this.pendingGlanceSample;
    this.pendingGlanceSample = null;
    return m;
  }

  // -- public control actions (A2) ---------------------------------------------
  // ONE code path per control: the keyboard handlers below and the cockpit
  // hotspots both call these, so audio callbacks, blink phase and the A2
  // procedure observer see identical transitions regardless of input device.
  // (The old QW5 applyPreDriveStep checklist-forcing path is GONE — steps now
  // complete FROM these transitions, never the other way around.)

  /** Seatbelt buckle (key B / hotspot_belt). */
  toggleSeatbelt(): void {
    this.seatbeltOn = !this.seatbeltOn;
    this.callbacks.onSeatbeltToggle?.(this.seatbeltOn); // audio click
  }

  /** Headlight rotary: off → low → high → off (key L / hotspot_headlights). */
  cycleHeadlights(): void {
    this.headlights =
      this.headlights === "off" ? "low" : this.headlights === "low" ? "high" : "off";
  }

  /** Stalk single-click cycle for the hotspot: off → left → right → off.
   *  (Keys , and . keep their direct toggle-side semantics.) */
  cycleIndicator(): void {
    this.indicator =
      this.indicator === "off" ? "left" : this.indicator === "left" ? "right" : "off";
    this.indicatorChangedAt = this.clock; // first blink always starts "on"
    this.autocancelArmed = false;
  }

  /** Parking brake toggle (key Space / hotspot_parking_brake) — routes the
   *  audio callback exactly like the key path. */
  toggleParkingBrake(): void {
    this.driveline.toggleParkingBrake();
    this.callbacks.onParkingBrakeToggle?.(this.driveline.parkingBrakeOn);
  }

  /** Mirror glance (keys Q/E/F / hotspot_mirror_*) — the GRADED path: latches
   *  the one-frame sample for the rule engine and animates the head turn. */
  glance(mirror: MirrorGlanceKind): void {
    this.startGlance(mirror);
  }

  private setIndicator(side: Exclude<IndicatorSetting, "off">): void {
    this.indicator = this.indicator === side ? "off" : side;
    this.indicatorChangedAt = this.clock; // first blink always starts "on"
    this.autocancelArmed = false;
  }

  private startGlance(mirror: MirrorGlanceKind): void {
    this.glanceMirror = mirror;
    this.glanceStartedAt = this.clock;
    this.pendingGlanceSample = mirror;
    this.callbacks.onGlance?.(mirror);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed || e.repeat) return;
    // Don't fight text inputs (e.g. the HUD volume slider has focus).
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    switch (e.code) {
      case CABIN_KEYS.indicatorLeft:
        this.setIndicator("left");
        break;
      case CABIN_KEYS.indicatorRight:
        this.setIndicator("right");
        break;
      case CABIN_KEYS.headlights:
        this.cycleHeadlights();
        break;
      case CABIN_KEYS.seatbelt:
        this.toggleSeatbelt();
        break;
      case CABIN_KEYS.glanceLeft:
        this.startGlance("left");
        break;
      case CABIN_KEYS.glanceRight:
        this.startGlance("right");
        break;
      case CABIN_KEYS.glanceRear:
        this.startGlance("rear");
        break;
      case CABIN_KEYS.nightPreview:
        this.nightPreview = !this.nightPreview;
        break;
      case CABIN_KEYS.muteAudio:
        this.callbacks.onToggleMute?.();
        break;

      // --- A1 driveline controls (state lives in DrivelineState) ------------
      case DRIVELINE_KEYS.engine:
        this.driveline.toggleEngine();
        break;
      case DRIVELINE_KEYS.parkingBrake:
        this.toggleParkingBrake();
        break;
      case DRIVELINE_KEYS.gearUp:
        this.driveline.gearUp();
        break;
      case DRIVELINE_KEYS.gearDown:
        this.driveline.gearDown();
        break;
      case DRIVELINE_KEYS.clutch:
        this.driveline.setClutch(true);
        break;
      case DRIVELINE_KEYS.hazards:
        this.driveline.toggleHazards();
        break;
      case DRIVELINE_KEYS.wipers:
        this.driveline.toggleWipers();
        break;
      case DRIVELINE_KEYS.fogLights:
        this.driveline.toggleFogLights();
        break;
      case DRIVELINE_KEYS.horn:
        this.driveline.setHorn(true);
        break;
    }
  };

  /** Held controls (clutch, horn) release on keyup. */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    if (e.code === DRIVELINE_KEYS.clutch) this.driveline.setClutch(false);
    if (e.code === DRIVELINE_KEYS.horn) this.driveline.setHorn(false);
  };

  /** Focus loss must never leave a held control stuck down. */
  private readonly onBlur = (): void => {
    this.driveline.setClutch(false);
    this.driveline.setHorn(false);
  };
}
