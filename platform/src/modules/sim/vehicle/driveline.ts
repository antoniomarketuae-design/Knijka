/**
 * driveline.ts — Vehicle state machine v1 (A1, doc 68 Pillar 1; audit A1–A5/A8).
 *
 * THE single source of truth for how the car is *operated* (as opposed to how
 * it *moves* — that stays in VehicleSim/tuning.ts): ignition, gear selector,
 * manual gearbox + clutch + stall, stateful parking brake, hazards, wipers,
 * fog lights and horn. Everything else reads from here:
 *
 *   - VehicleSim.update() consumes `physicsInput` to gate tractive force
 *     (engine off / P / N pull nothing; R drives backward; parking brake
 *     drags the rear axle),
 *   - the HUD telltales + cockpit cluster read `snapshot()`,
 *   - the pre-drive procedure (Phase 1 A2) subscribes via `subscribe()` to
 *     observe real state transitions instead of checklist clicks.
 *
 * Plain TS, no DOM, no React — key bindings live in components/sim/cabin.ts
 * (CabinControls owns one DrivelineState); this class is fully unit-testable
 * in Node (driveline.test.ts).
 *
 * SELECTOR MODEL — one linear gate, stepped by gearUp()/gearDown():
 *
 *     P — R — N — D            (automatic)
 *     P — R — N — M1…M5        (manual — behind the difficulty toggle)
 *
 * gearUp() moves toward D / a higher manual gear, gearDown() toward P.
 * Engaging R or P requires (near) standstill; in manual mode, going INTO a
 * gear (N→M, N→R) or changing manual gears requires the clutch — slipping
 * OUT to N is always free, like a real unloaded gearbox.
 *
 * STALL MODEL (manual only, deliberately SIMPLE — doc 68 "clutch + stalling",
 * unit-tested):
 *   in gear (M or R), clutch up, engine running, and
 *     - speed below STALL_BELOW_KMH in M2+  (moving off in too high a gear), or
 *     - speed below STALL_BELOW_KMH in M1/R with throttle < STALL_MIN_THROTTLE
 *       (moving off without enough gas)
 *   sustained for STALL_GRACE_S → the engine cuts and `stalled` latches until
 *   a successful restart. Braking to a stop in gear without the clutch stalls
 *   you — exactly the habit a real instructor drills.
 */

import type { DifficultyMode } from "./difficulty";
import { GEAR_UPSHIFT_KMH } from "./tuning";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransmissionMode = "automatic" | "manual";
export type SelectorPosition = "P" | "R" | "N" | "D" | "M";
/** Lesson spawn policy (contracts.ts LessonSpec.vehicleStart). */
export type VehicleStartState = "cold" | "ready";

/** The slice VehicleSim.update() reads every physics step (zero-alloc). */
export interface DrivelinePhysicsInput {
  engineOn: boolean;
  selector: SelectorPosition;
  /** 1..MANUAL_GEAR_COUNT — meaningful while selector === "M". */
  manualGear: number;
  clutchDown: boolean;
  parkingBrakeOn: boolean;
}

/**
 * Default physics input = engine running, D, parking brake released — EXACTLY
 * the pre-A1 behavior, so `VehicleSim.update()` without a driveline argument
 * (the CI harness, legacy callers) is bit-identical to before.
 */
export const READY_DRIVELINE: Readonly<DrivelinePhysicsInput> = {
  engineOn: true,
  selector: "D",
  manualGear: 1,
  clutchDown: false,
  parkingBrakeOn: false,
};

/** State transitions + rejections — the seam A2's procedure machine and the
 *  HUD subscribe to. Every mutation of DrivelineState emits exactly one. */
export type DrivelineEvent =
  | { kind: "engineStarted" }
  | { kind: "engineStopped" }
  | { kind: "engineStalled" }
  /** Start interlock: "selector" = automatic needs P/N; "clutch" = manual
   *  needs P/N or the clutch pedal down. */
  | { kind: "startRejected"; reason: "selector" | "clutch" }
  | { kind: "selectorChanged"; selector: SelectorPosition; manualGear: number }
  | { kind: "shiftRejected"; reason: "speed" | "clutch" | "endOfGate" }
  | { kind: "clutchChanged"; down: boolean }
  | { kind: "parkingBrakeChanged"; on: boolean }
  | { kind: "hazardsChanged"; on: boolean }
  | { kind: "wipersChanged"; on: boolean }
  | { kind: "fogLightsChanged"; on: boolean }
  | { kind: "hornChanged"; on: boolean }
  | { kind: "transmissionChanged"; transmission: TransmissionMode };

export type DrivelineListener = (event: DrivelineEvent) => void;

/** HUD/cluster read model — allocated on demand (poll cadence, not per frame). */
export interface DrivelineSnapshot {
  transmission: TransmissionMode;
  engineOn: boolean;
  stalled: boolean;
  selector: SelectorPosition;
  manualGear: number;
  clutchDown: boolean;
  parkingBrakeOn: boolean;
  hazardsOn: boolean;
  wipersOn: boolean;
  fogLightsOn: boolean;
  hornOn: boolean;
  /** Display label: "P" "R" "N" "D" or "M2". */
  gearLabel: string;
}

// ---------------------------------------------------------------------------
// Constants (driveline-owned — tuning.ts stays untouched, harness stays valid)
// ---------------------------------------------------------------------------

export const MANUAL_GEAR_COUNT = 5;

/** Engaging R or P above this speed (km/h) is rejected (gate interlock). */
export const SELECTOR_ENGAGE_MAX_KMH = 3;

/**
 * Parking-brake rear drag (N, total across the rear axle). Stronger than the
 * momentary sport handbrake (tuning.HANDBRAKE_FORCE_N = 6500) and well above
 * peak engine force (4800 N): with it engaged the car creeps nowhere — the
 * "release the handbrake before moving off" step has real physics behind it.
 * Unlike the momentary handbrake it does NOT loosen rear lateral grip — it is
 * a locked parking pawl feel, not a drift assist.
 */
export const PARKING_BRAKE_FORCE_N = 13000;

/** Manual "rev-out" ceiling per gear (km/h): above it the gear pulls nothing. */
export const MANUAL_GEAR_MAX_KMH: readonly number[] = [30, 55, 85, 115, 150];

/** Below this speed (km/h) a clutch-up gear can stall (see header). */
export const STALL_BELOW_KMH = 6;
/** Minimum throttle that keeps M1/R alive when moving off. */
export const STALL_MIN_THROTTLE = 0.15;
/** Seconds the stall condition must hold before the engine cuts. */
export const STALL_GRACE_S = 0.7;

// ---------------------------------------------------------------------------
// Pure helpers (consumed by VehicleSim and the tests)
// ---------------------------------------------------------------------------

/** Manual mode is the "Напреднал" realism tier (doc 68: clutch + stall behind
 *  the existing difficulty toggle — assists off means the real gearbox). */
export function transmissionModeFor(mode: DifficultyMode): TransmissionMode {
  return mode === "advanced" ? "manual" : "automatic";
}

/** True when the drivetrain can transmit engine force to the road. */
export function hasDriveTraction(d: DrivelinePhysicsInput): boolean {
  if (!d.engineOn) return false;
  if (d.selector === "P" || d.selector === "N") return false;
  // Clutch pedal down decouples the manual box (M) and reverse (R).
  if (d.clutchDown && (d.selector === "M" || d.selector === "R")) return false;
  return true;
}

/** Forward tractive-force multiplier: manual gears rev out above their band. */
export function forwardForceScale(d: DrivelinePhysicsInput, absSpeedKmh: number): number {
  if (d.selector !== "M") return 1;
  const max = MANUAL_GEAR_MAX_KMH[d.manualGear - 1] ?? MANUAL_GEAR_MAX_KMH[MANUAL_GEAR_MAX_KMH.length - 1] ?? 150;
  return absSpeedKmh > max ? 0 : 1;
}

/** Speed-matched manual gear (mirrors the cosmetic HUD thresholds). */
export function gearForSpeedKmh(speedKmh: number): number {
  const v = Math.abs(speedKmh);
  let g = 1;
  for (const threshold of GEAR_UPSHIFT_KMH) {
    if (v > threshold) g++;
  }
  return Math.min(g, MANUAL_GEAR_COUNT);
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

export class DrivelineState {
  transmission: TransmissionMode;
  engineOn: boolean;
  /** Latched by a stall; cleared by the next successful engine start. */
  stalled = false;
  selector: SelectorPosition;
  manualGear = 1;
  clutchDown = false;
  parkingBrakeOn: boolean;
  hazardsOn = false;
  wipersOn = false;
  fogLightsOn = false;
  /** Momentary — true while the horn control is held. */
  hornOn = false;

  /** Last speed fed via update() — shift legality reads it. */
  private speedKmh = 0;
  private stallTimerS = 0;
  private readonly listeners = new Set<DrivelineListener>();
  private readonly physics: DrivelinePhysicsInput = { ...READY_DRIVELINE };

  /**
   * @param start "cold" (default): engine OFF, selector P, parking brake ON —
   *   the pre-drive reality every lesson should begin from. "ready": engine
   *   running in D with the brake released (L0 acclimatization free-drive).
   */
  constructor(start: VehicleStartState = "cold", transmission: TransmissionMode = "automatic") {
    this.transmission = transmission;
    if (start === "ready") {
      this.engineOn = true;
      this.selector = transmission === "manual" ? "M" : "D";
      this.parkingBrakeOn = false;
    } else {
      this.engineOn = false;
      this.selector = "P";
      this.parkingBrakeOn = true;
    }
  }

  // -- subscription (A2's seam) -----------------------------------------------

  /** Observe every state transition/rejection. Returns the unsubscriber. */
  subscribe(listener: DrivelineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // -- reads -------------------------------------------------------------------

  /** Display label: P R N D, or M+gear in manual mode. */
  get gearLabel(): string {
    return this.selector === "M" ? `M${this.manualGear}` : this.selector;
  }

  /**
   * The physics-facing view, kept on ONE reused object (zero per-step
   * allocation — VehicleRig reads this every fixed substep).
   */
  get physicsInput(): Readonly<DrivelinePhysicsInput> {
    const p = this.physics;
    p.engineOn = this.engineOn;
    p.selector = this.selector;
    p.manualGear = this.manualGear;
    p.clutchDown = this.clutchDown;
    p.parkingBrakeOn = this.parkingBrakeOn;
    return p;
  }

  /** Allocating read model for HUD/cluster polling (a few Hz, not per frame). */
  snapshot(): DrivelineSnapshot {
    return {
      transmission: this.transmission,
      engineOn: this.engineOn,
      stalled: this.stalled,
      selector: this.selector,
      manualGear: this.manualGear,
      clutchDown: this.clutchDown,
      parkingBrakeOn: this.parkingBrakeOn,
      hazardsOn: this.hazardsOn,
      wipersOn: this.wipersOn,
      fogLightsOn: this.fogLightsOn,
      hornOn: this.hornOn,
      gearLabel: this.gearLabel,
    };
  }

  // -- commands ------------------------------------------------------------------

  /**
   * Ignition. Stopping is always allowed; starting honors the interlocks
   * (automatic: selector in P/N; manual: P/N or clutch down — which is also
   * how you restart after a stall). Returns true when the state changed.
   */
  toggleEngine(): boolean {
    if (this.engineOn) {
      this.engineOn = false;
      this.stalled = false;
      this.stallTimerS = 0;
      this.emit({ kind: "engineStopped" });
      return true;
    }
    if (this.transmission === "manual") {
      if (!(this.selector === "P" || this.selector === "N" || this.clutchDown)) {
        this.emit({ kind: "startRejected", reason: "clutch" });
        return false;
      }
    } else if (!(this.selector === "P" || this.selector === "N")) {
      this.emit({ kind: "startRejected", reason: "selector" });
      return false;
    }
    this.engineOn = true;
    this.stalled = false;
    this.stallTimerS = 0;
    this.emit({ kind: "engineStarted" });
    return true;
  }

  /** One gate step toward D / a higher manual gear. */
  gearUp(): boolean {
    switch (this.selector) {
      case "P":
        return this.trySelect("R");
      case "R":
        return this.trySelect("N");
      case "N":
        return this.trySelect(this.transmission === "manual" ? "M" : "D");
      case "D":
        return this.rejectShift("endOfGate");
      case "M":
        if (this.manualGear >= MANUAL_GEAR_COUNT) return this.rejectShift("endOfGate");
        if (!this.canShiftManualGear()) return this.rejectShift("clutch");
        this.manualGear += 1;
        this.emit({ kind: "selectorChanged", selector: "M", manualGear: this.manualGear });
        return true;
    }
  }

  /** One gate step toward P / a lower manual gear. */
  gearDown(): boolean {
    switch (this.selector) {
      case "P":
        return this.rejectShift("endOfGate");
      case "R":
        return this.trySelect("P");
      case "N":
        return this.trySelect("R");
      case "D":
        return this.trySelect("N");
      case "M":
        if (this.manualGear > 1) {
          if (!this.canShiftManualGear()) return this.rejectShift("clutch");
          this.manualGear -= 1;
          this.emit({ kind: "selectorChanged", selector: "M", manualGear: this.manualGear });
          return true;
        }
        return this.trySelect("N");
    }
  }

  /** Clutch pedal (manual mode only — a no-op on the automatic). */
  setClutch(down: boolean): void {
    if (this.transmission !== "manual" || this.clutchDown === down) return;
    this.clutchDown = down;
    this.emit({ kind: "clutchChanged", down });
  }

  toggleParkingBrake(): void {
    this.parkingBrakeOn = !this.parkingBrakeOn;
    this.emit({ kind: "parkingBrakeChanged", on: this.parkingBrakeOn });
  }

  toggleHazards(): void {
    this.hazardsOn = !this.hazardsOn;
    this.emit({ kind: "hazardsChanged", on: this.hazardsOn });
  }

  toggleWipers(): void {
    this.wipersOn = !this.wipersOn;
    this.emit({ kind: "wipersChanged", on: this.wipersOn });
  }

  toggleFogLights(): void {
    this.fogLightsOn = !this.fogLightsOn;
    this.emit({ kind: "fogLightsChanged", on: this.fogLightsOn });
  }

  setHorn(on: boolean): void {
    if (this.hornOn === on) return;
    this.hornOn = on;
    this.emit({ kind: "hornChanged", on });
  }

  // -- external (checklist) setters ---------------------------------------------
  // QW5 honesty rule: a completed pre-drive checklist step must set the REAL
  // state it claims (procedures/cabinEffects.ts maps step → effect; cabin.ts
  // applies it here). These bypass the gate/interlocks — the checklist is the
  // interim "performed" path until A2 replaces it with cockpit controls.

  forceEngineOn(): void {
    if (this.engineOn) return;
    this.engineOn = true;
    this.stalled = false;
    this.stallTimerS = 0;
    this.emit({ kind: "engineStarted" });
  }

  /** Engage the forward drive position (D, or M+speed-matched gear). */
  forceSelectForward(): void {
    const target: SelectorPosition = this.transmission === "manual" ? "M" : "D";
    if (this.selector === target) return;
    this.selector = target;
    if (target === "M") this.manualGear = gearForSpeedKmh(this.speedKmh);
    this.emit({ kind: "selectorChanged", selector: target, manualGear: this.manualGear });
  }

  forceParkingBrake(on: boolean): void {
    if (this.parkingBrakeOn === on) return;
    this.parkingBrakeOn = on;
    this.emit({ kind: "parkingBrakeChanged", on });
  }

  // -- per-frame sync --------------------------------------------------------------

  /**
   * Advance the stall timer and sync the transmission mode with the difficulty
   * toggle. Call once per render frame (the 0.7 s stall grace does not need
   * physics-rate precision). `throttle` is the shaped 0..1 accelerator.
   */
  update(
    dtSec: number,
    ctx: { speedKmh: number; throttle: number; transmission?: TransmissionMode },
  ): void {
    this.speedKmh = ctx.speedKmh;
    if (ctx.transmission && ctx.transmission !== this.transmission) {
      this.switchTransmission(ctx.transmission);
    }

    const inGear = this.selector === "M" || this.selector === "R";
    if (this.engineOn && this.transmission === "manual" && inGear && !this.clutchDown) {
      const abs = Math.abs(ctx.speedKmh);
      const lowGear = this.selector === "R" || this.manualGear === 1;
      const lugging = abs < STALL_BELOW_KMH && (!lowGear || ctx.throttle < STALL_MIN_THROTTLE);
      if (lugging) {
        this.stallTimerS += dtSec;
        if (this.stallTimerS >= STALL_GRACE_S) {
          this.engineOn = false;
          this.stalled = true;
          this.stallTimerS = 0;
          this.emit({ kind: "engineStalled" });
        }
      } else {
        this.stallTimerS = 0;
      }
    } else {
      this.stallTimerS = 0;
    }
  }

  // ---------------------------------------------------------------------------

  private switchTransmission(next: TransmissionMode): void {
    this.transmission = next;
    if (next === "automatic") {
      if (this.clutchDown) {
        this.clutchDown = false;
        this.emit({ kind: "clutchChanged", down: false });
      }
      if (this.selector === "M") {
        this.selector = "D";
        this.emit({ kind: "selectorChanged", selector: "D", manualGear: this.manualGear });
      }
    } else if (this.selector === "D") {
      this.selector = "M";
      this.manualGear = gearForSpeedKmh(this.speedKmh);
      this.emit({ kind: "selectorChanged", selector: "M", manualGear: this.manualGear });
    }
    this.emit({ kind: "transmissionChanged", transmission: next });
  }

  private canShiftManualGear(): boolean {
    return !this.engineOn || this.clutchDown;
  }

  private trySelect(next: SelectorPosition): boolean {
    if (
      (next === "R" || next === "P") &&
      Math.abs(this.speedKmh) > SELECTOR_ENGAGE_MAX_KMH
    ) {
      return this.rejectShift("speed");
    }
    // Going INTO a gear on the manual box needs the clutch (slipping out to
    // N/P never does — an unloaded gearbox disengages freely).
    const intoGear = next === "R" || next === "M";
    if (intoGear && this.transmission === "manual" && this.engineOn && !this.clutchDown) {
      return this.rejectShift("clutch");
    }
    this.selector = next;
    if (next === "M") this.manualGear = gearForSpeedKmh(this.speedKmh);
    this.emit({ kind: "selectorChanged", selector: next, manualGear: this.manualGear });
    return true;
  }

  private rejectShift(reason: "speed" | "clutch" | "endOfGate"): boolean {
    this.emit({ kind: "shiftRejected", reason });
    return false;
  }

  private emit(event: DrivelineEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
