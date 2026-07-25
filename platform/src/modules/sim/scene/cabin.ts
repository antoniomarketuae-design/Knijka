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
/** Mirror-glance head-turn ease time (s): key-down ramps the view IN over
 *  this, key-up ramps it back OUT. Founder contract (2026-07-10): a glance
 *  HOLDS at full deflection while the key/pointer is held — it is no longer
 *  a momentary out-and-back flash. */
export const GLANCE_EASE_S = 0.18;
/** Tap fallback: sources without a release edge (the touch overlay's round
 *  buttons call glance() once) hold the view this long, then auto-release. */
export const GLANCE_TAP_HOLD_S = 0.9;
/** While a glance stays HELD, its graded freshness re-latches every this many
 *  seconds (founder R3 #13, doc 62 — QA-13: the founder pressed/held the look
 *  buttons at the second Б1 mouth and was still graded „no scan"). A driver
 *  whose head is ON the mirror is looking at it the whole hold, not only at
 *  the press instant — so the rule engine's lastGlanceAt must track the
 *  ongoing hold. Must sit well inside junctionScanLookbackSec (5 s) so a held
 *  look can never expire mid-hold; 1 s also keeps the attempt-trace glance
 *  events sparse. */
export const GLANCE_REFRESH_S = 1.0;

/**
 * Pure hold-to-glance state machine (extracted so it is unit-testable in
 * Node — CabinControls binds window listeners and cannot be constructed
 * headless). Semantics:
 *   - start(mirror)  → head turns toward the mirror over GLANCE_EASE_S and
 *     HOLDS there until end()/release(); returns true only when the press
 *     begins a NEW glance (the grading latch — once per hold, on press).
 *   - end(mirror)    → releases only when it matches the held mirror, so
 *     releasing Q never cancels an E-hold that replaced it mid-press.
 *   - start(mirror, tap=true) → same, but auto-releases after
 *     GLANCE_TAP_HOLD_S (touch buttons have no keyup).
 *   - update(dt)     → advances the 0..1 envelope; `mirror` clears only after
 *     the head has eased fully back (the camera reads mirror+strength).
 *     Returns the mirror to RE-LATCH for grading when the hold has lasted
 *     another GLANCE_REFRESH_S (founder R3 #13 — a held look stays fresh),
 *     null otherwise. Mashing the same button re-arms the hold (and the tap
 *     timer) without a second latch — the refresh stream carries freshness.
 */
export class GlanceHold {
  /** Mirror the head is turned toward (stays set through the ease-out). */
  mirror: MirrorGlanceKind | null = null;
  private held = false;
  private env = 0;
  private tapRemainingS = -1;
  private sinceLatchS = 0;

  /** Head-turn envelope 0..1 (0 = forward, 1 = full mirror deflection). */
  get strength(): number {
    return this.mirror ? this.env : 0;
  }

  start(mirror: MirrorGlanceKind, tap = false): boolean {
    // Already actively holding this mirror (e.g. key held + hotspot press):
    // one hold = one graded glance, so the second source does not re-latch.
    const isNewGlance = !(this.held && this.mirror === mirror);
    this.mirror = mirror;
    this.held = true;
    this.tapRemainingS = tap ? GLANCE_TAP_HOLD_S : -1;
    if (isNewGlance) this.sinceLatchS = 0; // refresh clock restarts per hold
    return isNewGlance;
  }

  end(mirror: MirrorGlanceKind): void {
    if (this.mirror !== mirror) return;
    this.held = false;
    this.tapRemainingS = -1;
  }

  /** Focus loss / dispose: nothing may stay held down. */
  release(): void {
    this.held = false;
    this.tapRemainingS = -1;
  }

  update(dtSec: number): MirrorGlanceKind | null {
    if (!this.mirror) return null;
    if (this.held && this.tapRemainingS >= 0) {
      this.tapRemainingS -= dtSec;
      if (this.tapRemainingS <= 0) this.release();
    }
    const step = dtSec / GLANCE_EASE_S;
    if (this.held) {
      this.env = Math.min(1, this.env + step);
      // Founder R3 #13: an ONGOING hold periodically re-latches the graded
      // sample so the rule engine's freshness tracks the look, not the press.
      this.sinceLatchS += dtSec;
      if (this.sinceLatchS >= GLANCE_REFRESH_S) {
        this.sinceLatchS -= GLANCE_REFRESH_S;
        return this.mirror;
      }
    } else {
      this.env = Math.max(0, this.env - step);
      if (this.env <= 0) this.mirror = null;
    }
    return null;
  }
}

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

  /** Hold-to-glance state (keys Q/E/F down/up, hotspot pointer down/up). */
  private readonly glances = new GlanceHold();

  private clock = 0;
  private indicatorChangedAt = 0;
  /** Latch QUEUE consumed by the VehicleSample builder, ONE per frame.
   *  A queue, not a single slot (founder R3 #13): left+right pressed inside
   *  one render frame (easy at low FPS on the 16 GB box) must BOTH reach the
   *  rule engine — the second drains one frame later instead of silently
   *  overwriting the first. Bounded (drop past 4) so a stalled consumer can
   *  never grow it. */
  private readonly pendingGlanceSamples: MirrorGlanceKind[] = [];
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
    // Held-glance refresh (founder R3 #13): sample-only — the driver's head is
    // still on the mirror, not a new act, so no onGlance callback re-fires
    // (the pre-drive observer and audio react to presses, not to holding).
    const refresh = this.glances.update(dtSec);
    if (refresh) this.enqueueGlanceSample(refresh);

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

  /** Mirror currently glanced at (camera + HUD read), or null. Stays set
   *  through the ease-out so the head turns BACK smoothly after release. */
  get glanceMirror(): MirrorGlanceKind | null {
    return this.glances.mirror;
  }

  /** Head-turn envelope 0..1 (0 = eyes forward, 1 = holding on the mirror). */
  glanceStrength(): number {
    return this.glances.strength;
  }

  /**
   * The next queued glance, exactly once (VehicleSample.mirrorGlance is a
   * one-frame event for the rule engine's mirror-check detector); glances
   * queued in the same frame drain over consecutive frames.
   */
  consumeGlanceSample(): MirrorGlanceKind | null {
    return this.pendingGlanceSamples.shift() ?? null;
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

  /** P1 touch buttons: direct side toggles with the EXACT semantics of keys
   *  , and . — same private setIndicator path, so blink phase, auto-cancel
   *  and the A2 observer cannot tell a touch tap from a keypress. */
  indicateLeft(): void {
    this.setIndicator("left");
  }

  indicateRight(): void {
    this.setIndicator("right");
  }

  /** Parking brake toggle (key Space / hotspot_parking_brake) — routes the
   *  audio callback exactly like the key path. */
  toggleParkingBrake(): void {
    this.driveline.toggleParkingBrake();
    this.callbacks.onParkingBrakeToggle?.(this.driveline.parkingBrakeOn);
  }

  /** Mirror glance HOLD begin (key down Q/E/F / hotspot pointer down) — the
   *  GRADED path: latches the one-frame sample for the rule engine ONCE per
   *  hold (on press) and turns the head toward the mirror until the matching
   *  glanceEnd(). */
  glanceStart(mirror: MirrorGlanceKind): void {
    if (this.glances.start(mirror)) this.latchGlance(mirror);
  }

  /** Mirror glance HOLD end (key up / hotspot pointer up or leave). */
  glanceEnd(mirror: MirrorGlanceKind): void {
    this.glances.end(mirror);
  }

  /** Tap glance (touch overlay buttons — no release edge): same graded path,
   *  holds the view for GLANCE_TAP_HOLD_S and then eases back on its own. */
  glance(mirror: MirrorGlanceKind): void {
    if (this.glances.start(mirror, true)) this.latchGlance(mirror);
  }

  private setIndicator(side: Exclude<IndicatorSetting, "off">): void {
    this.indicator = this.indicator === side ? "off" : side;
    this.indicatorChangedAt = this.clock; // first blink always starts "on"
    this.autocancelArmed = false;
  }

  /** The graded once-per-hold press: rule-engine sample + observer callback. */
  private latchGlance(mirror: MirrorGlanceKind): void {
    this.enqueueGlanceSample(mirror);
    this.callbacks.onGlance?.(mirror);
  }

  /** Bounded push into the sample queue (press latches and hold refreshes). */
  private enqueueGlanceSample(mirror: MirrorGlanceKind): void {
    if (this.pendingGlanceSamples.length < 4) this.pendingGlanceSamples.push(mirror);
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
        this.glanceStart("left");
        break;
      case CABIN_KEYS.glanceRight:
        this.glanceStart("right");
        break;
      case CABIN_KEYS.glanceRear:
        this.glanceStart("rear");
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

  /** Held controls (clutch, horn, mirror glances) release on keyup. */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    if (e.code === DRIVELINE_KEYS.clutch) this.driveline.setClutch(false);
    if (e.code === DRIVELINE_KEYS.horn) this.driveline.setHorn(false);
    if (e.code === CABIN_KEYS.glanceLeft) this.glanceEnd("left");
    if (e.code === CABIN_KEYS.glanceRight) this.glanceEnd("right");
    if (e.code === CABIN_KEYS.glanceRear) this.glanceEnd("rear");
  };

  /** Focus loss must never leave a held control stuck down. */
  private readonly onBlur = (): void => {
    this.driveline.setClutch(false);
    this.driveline.setHorn(false);
    this.glances.release();
  };
}
