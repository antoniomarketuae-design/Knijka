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
 * Plain TS, no DOM, no React — key bindings live in sim/scene/cabin.ts
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
  | {
      kind: "transmissionChanged";
      transmission: TransmissionMode;
      /**
       * The selector position THE SWITCH ITSELF moved the lever to, when it
       * moved it — absent when the student's lever was left exactly where he
       * put it.
       *
       * The mechanics of that move were fixed in doc 87 A4 and the reasoning
       * is on `switchTransmission` below; what was never fixed is that the
       * move is INVISIBLE. Measured on the drive rig 2026-08-11: a click on
       * „Напреднал" with the car standing still moved the selector D → N and
       * produced zero toasts and zero events, and holding ↓ for the next 12.5
       * seconds produced zero more. A4's own note says it — „the student gets
       * the engine back but sits in neutral with nothing on screen saying so,
       * which is the same complaint wearing a different hat" — and then only
       * the round trip was closed. This field is what lets the shell close the
       * one-way trip: the cockpit says what the box did, in the same coached
       * kind „lesson" channel every other refusal in this product uses.
       */
      movedSelectorTo?: SelectorPosition;
    };

export type DrivelineListener = (event: DrivelineEvent) => void;

/** The rejection subset of DrivelineEvent. A refused control action must
 *  never fail silently (founder bug 2026-07-10: "pressed I again — doesn't
 *  start" / "] doesn't go up") — the scene forwards these to the HUD, which
 *  explains WHY the car refused. Additive alias; the event stream is
 *  unchanged. */
export type DrivelineRejection = Extract<
  DrivelineEvent,
  { kind: "startRejected" | "shiftRejected" }
>;

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

/**
 * Manual "rev-out" ceiling per gear (km/h): above it the gear pulls nothing.
 *
 * FR-50: 5th used to rev out at 150, which was invisible only because the
 * tractive curve had already died at 145 — the moment tuning.ts let the car
 * pull to ~178 km/h, this line became a THIRD hidden top-speed governor, and
 * it would have bitten manual drivers only (`forwardForceScale` applies it
 * when selector === "M"). Bulgarian category B is examined on a manual, so
 * that is the student who would have hit it. Top gear now revs out past the
 * drag-limited terminal speed, which is what a real top gear does: 5th ends
 * the car, drag ends the car — not the gearbox lookup table.
 * 1st–4th are unchanged; the shift points students learn do not move.
 */
export const MANUAL_GEAR_MAX_KMH: readonly number[] = [30, 55, 85, 115, 190];

// --- Engine braking (doc 82 §4.2 F3) ---------------------------------------
// Today lifting off applies only ROLLING_RESISTANCE_N (0.23 m/s²) + aero ≈
// 0.30–0.45 m/s² total, so COASTING IN N AND LIFTING OFF IN D DECELERATE
// IDENTICALLY. "Lift off and the car slows", gear choice on a descent and
// clutch-down coasting are theory-only in a product whose whole claim is that
// it teaches real driving.
//
// These constants live HERE, not in tuning.ts, for the same reason
// PARKING_BRAKE_FORCE_N does: engine braking is a property of how the car is
// OPERATED (which gear, clutch up or down), and keeping tuning.ts untouched
// is the visible proof that the harness envelope is unchanged.

/**
 * Coast deceleration (m/s²) available from the engine per gear, index =
 * gear − 1. Real lift-off-in-gear is 0–1 m/s²: strong in a low gear where the
 * engine spins fast for the road speed, tapering in the tall gears.
 *
 * The ceiling is DELIBERATELY ~9% of the service brake (BRAKE_FORCE_N /
 * CHASSIS_MASS ≈ 9.0 m/s²). Doc 82: "Keep it well below the service brake so
 * it never masks a graded braking mistake" — a student who fails to brake
 * must still fail to stop.
 */
export const ENGINE_BRAKE_DECEL_MS2: readonly number[] = [1.0, 0.75, 0.55, 0.42, 0.3];

/** Below this speed (km/h) there is no engine braking: a torque converter
 *  unlocks and a real clutch would be slipping toward the stall the driveline
 *  models above. Also keeps the effect entirely out of the S0 parking band. */
export const ENGINE_BRAKE_MIN_KMH = 8;
/** Speed (km/h) at which the per-gear figure is reached in full — a ramp, not
 *  a step, so nothing bites at the moment the car crosses a threshold. */
export const ENGINE_BRAKE_FULL_KMH = 16;

/**
 * Coast deceleration (m/s²) for the current driveline state and speed.
 * Zero — with no branch taken in the caller — whenever the drivetrain is not
 * transmitting: engine off, P, N, or the clutch pedal down. That is exactly
 * `hasDriveTraction`, so "clutch in and the car freewheels" is the SAME rule
 * that already gates tractive force; the two can never disagree.
 *
 * Gear source: an explicit manual gear in M, the speed-matched cosmetic gear
 * in D (there is no real automatic gearbox to ask), first gear in R.
 */
export function engineBrakeDecelMs2(
  d: DrivelinePhysicsInput,
  absSpeedKmh: number,
): number {
  if (!hasDriveTraction(d)) return 0;
  if (absSpeedKmh <= ENGINE_BRAKE_MIN_KMH) return 0;
  const gear =
    d.selector === "M"
      ? Math.min(Math.max(d.manualGear, 1), MANUAL_GEAR_COUNT)
      : d.selector === "R"
        ? 1
        : gearForSpeedKmh(absSpeedKmh);
  const base = ENGINE_BRAKE_DECEL_MS2[gear - 1] ?? 0;
  const ramp = Math.min(
    (absSpeedKmh - ENGINE_BRAKE_MIN_KMH) / (ENGINE_BRAKE_FULL_KMH - ENGINE_BRAKE_MIN_KMH),
    1,
  );
  return base * ramp;
}

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
  /**
   * Set when `switchTransmission` itself moved a STANDING car out of D into N
   * (doc 87 A4). It exists so the tier round trip Нормален → Напреднал →
   * Нормален is an exact no-op: without it the student gets the engine back
   * but sits in neutral with nothing on screen saying so, which is the same
   * complaint wearing a different hat. Any selector the STUDENT chooses clears
   * it, so a deliberate N in manual mode is never overwritten.
   */
  private tierNeutralFromD = false;
  private readonly listeners = new Set<DrivelineListener>();
  private readonly physics: DrivelinePhysicsInput = { ...READY_DRIVELINE };

  /**
   * @param start "cold": engine OFF, selector P, parking brake ON — the
   *   pre-drive reality the exams assess. "ready": engine running, brake
   *   released, ready to pull away.
   *
   *   MANUAL "ready" IS NEUTRAL, NOT FIRST GEAR. It used to be `M`, i.e. gear 1
   *   with the clutch up — which is a stall the instant the sim ticks, because
   *   that is exactly what a real car does. Spawning that way fired the
   *   engine-stall teaching moment before the student had touched anything.
   *   Neutral with the engine running is how you find a car you are about to
   *   drive, and it costs the driver one keystroke to select a gear — which is
   *   the clutch discipline the manual tier exists to teach anyway.
   */
  constructor(start: VehicleStartState = "cold", transmission: TransmissionMode = "automatic") {
    this.transmission = transmission;
    if (start === "ready") {
      this.engineOn = true;
      this.selector = transmission === "manual" ? "N" : "D";
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
    this.tierNeutralFromD = false;
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

  /**
   * A TIER PILL IS NOT A DRIVING MISTAKE (doc 87 A4, rendered 2026-08-02:
   * `scratchpad/ovg/frames/A4-t020.png`). The founder's row is „I tried to go
   * from Advanced to Normal, and the engine turned off, and when I went back
   * to Normal it did not turn on", and the whole sequence reproduced on a
   * PARKED car the student never touched:
   *
   *   Нормален → Напреднал  put a stationary car into M1 with the clutch up,
   *     which `update()` correctly reads as lugging and stalls 0.7 s later —
   *     and the „Загасване на двигателя" teaching card bills it (−1 т. on any
   *     repeat) as if the student had dumped the clutch;
   *   Напреднал → Нормален  handed the dead car back in D, and `toggleEngine`
   *     may only start an automatic in P/N — so I is rejected, silently, and
   *     the status chip shows „Угасна" WITHOUT the „I" key hint it shows for a
   *     merely-off engine. The car is unrecoverable without a restart.
   *
   * Both halves are fixed here, and neither is a new idea: the constructor
   * already made exactly this call for the „ready" manual spawn — „MANUAL
   * 'ready' IS NEUTRAL, NOT FIRST GEAR … that is a stall the instant the sim
   * ticks" — the tier switch simply never inherited the reasoning.
   */
  private switchTransmission(next: TransmissionMode): void {
    this.transmission = next;
    /** Where the SWITCH put the lever, if it moved it — carried out on the
     *  transmissionChanged event so the cockpit can say so (see the event). */
    let movedTo: SelectorPosition | null = null;
    if (next === "automatic") {
      if (this.clutchDown) {
        this.clutchDown = false;
        this.emit({ kind: "clutchChanged", down: false });
      }
      if (this.selector === "M") {
        // Engine running → D, exactly as before. Engine dead (a stall the
        // student is trying to escape) → N, so the starter interlock is
        // satisfied and I actually starts the car.
        const target: SelectorPosition = this.engineOn ? "D" : "N";
        this.selector = target;
        this.tierNeutralFromD = false;
        movedTo = target;
        this.emit({ kind: "selectorChanged", selector: target, manualGear: this.manualGear });
      } else if (this.selector === "N" && this.tierNeutralFromD) {
        // Undo our own D → N: the round trip must hand the car back exactly
        // as it was found. NOT announced — putting something back where it was
        // found is the one move that needs no explanation.
        this.selector = "D";
        this.tierNeutralFromD = false;
        this.emit({ kind: "selectorChanged", selector: "D", manualGear: this.manualGear });
      }
    } else if (this.selector === "D") {
      // Moving → the speed-matched gear, as before. Standing still → NEUTRAL:
      // first gear with the clutch up is a stall by definition, and stalling a
      // car because a UI pill was clicked teaches nothing about a clutch.
      const standing = Math.abs(this.speedKmh) < STALL_BELOW_KMH;
      if (standing) {
        this.selector = "N";
        this.tierNeutralFromD = true;
        movedTo = "N";
        this.emit({ kind: "selectorChanged", selector: "N", manualGear: this.manualGear });
      } else {
        this.selector = "M";
        this.manualGear = gearForSpeedKmh(this.speedKmh);
        this.tierNeutralFromD = false;
        movedTo = "M";
        this.emit({ kind: "selectorChanged", selector: "M", manualGear: this.manualGear });
      }
    }
    this.emit({
      kind: "transmissionChanged",
      transmission: next,
      ...(movedTo === null ? {} : { movedSelectorTo: movedTo }),
    });
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
    this.tierNeutralFromD = false; // the STUDENT chose this position — ours is spent
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
