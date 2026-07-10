// Cabin controls — the vehicle "electrics" the physics core deliberately does
// not know about: indicators, headlights, seatbelt, mirror-glance requests and
// the night-preview toggle. Plain TS (no React): the R3F visual layer reads
// this state per frame, the HUD polls it, and the VehicleSample builder
// serializes it for the rule engine (contracts.ts).
//
// Key handling mirrors the SimInput pattern (engine/input.ts) but lives here
// because these are cabin/visual concerns, not driving physics inputs.

import {
  applyPreDriveStepToCabin,
  type PreDriveStepId,
} from "@/modules/sim/procedures";

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

export interface CabinCallbacks {
  /** B — seatbelt buckled/unbuckled (audio plays the click). */
  onSeatbeltToggle?: (on: boolean) => void;
  /** Q/E/F — a mirror glance started (camera + rule-engine sample react). */
  onGlance?: (mirror: MirrorGlanceKind) => void;
  /** M — mute toggle request (audio layer owns the actual state). */
  onToggleMute?: () => void;
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

  /** Mirror currently being glanced at (for camera + HUD), or null. */
  glanceMirror: MirrorGlanceKind | null = null;

  private clock = 0;
  private indicatorChangedAt = 0;
  private glanceStartedAt = -1;
  /** One-frame latch consumed by the VehicleSample builder. */
  private pendingGlanceSample: MirrorGlanceKind | null = null;
  private autocancelArmed = false;
  private disposed = false;

  constructor(private readonly callbacks: CabinCallbacks = {}) {
    window.addEventListener("keydown", this.onKeyDown);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
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

  /**
   * QW5 (doc 68 Phase 0): a completed pre-drive checklist step must set the
   * REAL cabin state it claims (belt / low beams / left indicator), so the
   * rule engine, HUD telltales and the sim agree with what the student was
   * just told they did. Idempotent — safe to re-apply the whole completed
   * list; steps without an underlying state are no-ops (see
   * procedures/cabinEffects.ts for the full 13-step map).
   */
  applyPreDriveStep(stepId: PreDriveStepId): void {
    const next = applyPreDriveStepToCabin(stepId, {
      seatbeltOn: this.seatbeltOn,
      headlights: this.headlights,
      indicator: this.indicator,
    });
    if (next.seatbeltOn !== this.seatbeltOn) {
      this.seatbeltOn = next.seatbeltOn;
      this.callbacks.onSeatbeltToggle?.(next.seatbeltOn); // audio click
    }
    if (next.headlights !== this.headlights) {
      this.headlights = next.headlights;
    }
    if (next.indicator !== this.indicator) {
      this.indicator = next.indicator;
      this.indicatorChangedAt = this.clock; // first blink starts "on"
      this.autocancelArmed = false;
    }
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
        this.headlights =
          this.headlights === "off" ? "low" : this.headlights === "low" ? "high" : "off";
        break;
      case CABIN_KEYS.seatbelt:
        this.seatbeltOn = !this.seatbeltOn;
        this.callbacks.onSeatbeltToggle?.(this.seatbeltOn);
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
    }
  };
}
