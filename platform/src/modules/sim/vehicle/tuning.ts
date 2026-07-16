// ============================================================================
// tuning.ts — SINGLE SOURCE OF TRUTH for vehicle feel.
//
// Ported from spike/vehicle-feel (validated headless, see FEEL-NOTES.md there).
// Any change here MUST keep scripts/sim-harness.mjs green — the harness
// asserts the measured envelope (0–100, brake distance, curb strike, lane
// change). That is the regression gate that keeps "feel" alive.
//
// Target: a ~1.2-tonne front-wheel-drive compact hatchback (fictional, per
// ADR-001). Design goals: visible body lean in corners, nose dive under
// braking, survives a 12 cm curb at 50 km/h without flipping, controllable
// (understeer-biased) at 90 km/h.
//
// Everything here is plain data/functions — no three.js, no rapier imports —
// so the file is shared verbatim by the browser scene and the Node harness.
//
// RAPIER SEMANTICS CHEAT SHEET (DynamicRayCastVehicleController is a port of
// Bullet's btRaycastVehicle — these bite people, read before tuning):
//
// 1. Suspension forces are MASS-NORMALIZED: per-wheel spring force =
//    stiffness * compression * CHASSIS_MASS. So stiffness is in 1/s² per
//    metre, not N/m. Vertical natural frequency ≈ sqrt(4 * stiffness) rad/s
//    (4 wheels). Real cars sit at 1.0–1.6 Hz  →  stiffness 10–26.
// 2. Damping values are mass-normalized too. Per-wheel critical damping =
//    2 * sqrt(4 * stiffness) / 4. Aim for damping ratio ~0.3–0.4 in
//    compression, ~0.5–0.7 in rebound (relaxation).
// 3. setWheelBrake() takes an IMPULSE PER STEP (N·s), not a force. Convert:
//    impulse = desiredForceN * fixedDt. (setWheelEngineForce takes a force.)
// 4. A non-zero engine force on a wheel makes the solver IGNORE brake on
//    that same wheel (Bullet legacy). Never set both on one wheel.
// 5. frictionSlip is effectively tyre μ: side impulse is clamped to
//    suspensionForce * dt * frictionSlip. Bullet's default 10.5 is glue;
//    street tyres ≈ 0.9–1.1, use ~2 for grippy-but-breakable arcade feel.
// 6. maxSuspensionForce default (6000 N) is too low for a 1200 kg car — it
//    silently caps spring force and the car sags/bottoms. Raise it.
// ============================================================================

// ---------------------------------------------------------------------------
// Simulation stepping
// ---------------------------------------------------------------------------
/**
 * Fixed physics timestep (s). Vehicle tuning is dt-sensitive — never vary.
 * In the browser this is passed to `<Physics timeStep={FIXED_DT}>`
 * (@react-three/rapier runs a fixed-step accumulator loop and interpolates
 * rendering between steps — that is what kills 144 Hz micro-stutter).
 */
export const FIXED_DT = 1 / 60;
/**
 * Cap on frame delta (s) so a background tab doesn't explode the sim.
 * Used by the headless harness; @react-three/rapier clamps internally (0.5 s).
 */
export const MAX_FRAME_DT = 0.1;
/** Gravity (m/s², Y-up). */
export const GRAVITY = -9.81;

// ---------------------------------------------------------------------------
// Chassis — geometry & mass
// Car local axes: +Z forward, +Y up, +X left (right-handed).
// ---------------------------------------------------------------------------
/** Collider half-extents (m): 1.70 m wide, 0.70 m tall body box, 4.04 m long. */
export const CHASSIS_HALF_EXTENTS = { x: 0.85, y: 0.35, z: 2.02 } as const;
/** Total vehicle mass (kg). ~compact hatchback with driver. */
export const CHASSIS_MASS = 1220;
/**
 * Centre of mass offset from the collider centre (m). Lowering it is the
 * main anti-flip lever for raycast vehicles. -0.15 puts the COM ~0.48 m
 * above ground — realistic for a compact (measured: brake dive doubled vs
 * the initial -0.32 slam-it-to-the-floor value, with flip margin intact).
 * Slightly forward (+Z) because the engine sits over the front axle → mild
 * understeer + nose-heavy braking, correct for a FWD compact.
 */
export const COM_OFFSET = { x: 0, y: -0.15, z: 0.08 } as const;
/**
 * Multipliers on the analytic box inertia. Real cars carry mass in the
 * corners (wheels, engine) so inertia is higher than a uniform box —
 * raising yaw inertia calms twitchiness, raising roll inertia slows snap
 * roll. (pitch = about X, yaw = about Y, roll = about Z.)
 */
export const INERTIA_SCALE = { pitch: 1.1, yaw: 1.25, roll: 1.05 } as const;
/** Rapier angular damping. Small — too much fights steering at speed. */
export const CHASSIS_ANGULAR_DAMPING = 0.35;
/** Rapier linear damping. Near zero; real drag handled by AERO_DRAG below. */
export const CHASSIS_LINEAR_DAMPING = 0.02;
/** Chassis collider surface properties (world contacts, not tyres). */
export const CHASSIS_FRICTION = 0.5;
export const CHASSIS_RESTITUTION = 0.05;

// ---------------------------------------------------------------------------
// Wheels — geometry. Order: FL, FR, RL, RR. (+X is the LEFT side of the car.)
// ---------------------------------------------------------------------------
export const WHEEL_RADIUS = 0.32; // m — ~195/65 R15
export const WHEEL_WIDTH = 0.24; // m — visual only
/** Suspension attachment points in chassis-local space (m). Wheelbase 2.56 m, track 1.52 m. */
export const WHEEL_POSITIONS = [
  { x: 0.76, y: -0.1, z: 1.28 }, // FL
  { x: -0.76, y: -0.1, z: 1.28 }, // FR
  { x: 0.76, y: -0.1, z: -1.28 }, // RL
  { x: -0.76, y: -0.1, z: -1.28 }, // RR
] as const;
/** Indices of steered wheels (front axle). */
export const STEERED_WHEELS = [0, 1] as const;
/** Indices of driven wheels — FWD like most compacts. */
export const DRIVEN_WHEELS = [0, 1] as const;

// ---------------------------------------------------------------------------
// Suspension (see cheat-sheet points 1, 2, 6)
// ---------------------------------------------------------------------------
/** Spring rest length (m) along local -Y from the attachment point. */
export const SUSPENSION_REST_LENGTH = 0.3;
/**
 * Mass-normalized stiffness. 26 → ω = sqrt(4*26) ≈ 10.2 rad/s ≈ 1.62 Hz.
 * Static compression = g / (4k) ≈ 9.4 cm — visible squat, sporty-compact ride.
 */
export const SUSPENSION_STIFFNESS = 26;
/** Compression damping. 1.9 ≈ ζ 0.37 — lets the nose dive, then catches it. */
export const SUSPENSION_DAMPING_COMPRESSION = 1.9;
/** Rebound damping. 3.1 ≈ ζ 0.61 — body settles in ~1 oscillation. */
export const SUSPENSION_DAMPING_RELAXATION = 3.1;
/** Max travel (m) either side of rest length before the hard clamp. */
export const SUSPENSION_MAX_TRAVEL = 0.24;
/** Per-wheel force cap (N). Static load ≈ 3000 N/wheel; allow ~4 g spikes. */
export const SUSPENSION_MAX_FORCE = 26000;

// ---------------------------------------------------------------------------
// Tyres (see cheat-sheet point 5)
// ---------------------------------------------------------------------------
/**
 * Front tyre μ. Slightly LOWER than rear → terminal understeer, not spin.
 * Harness-checked: μ 1.4 caps lateral accel ≈ 13-14 m/s², BELOW the static
 * rollover threshold g·(track/2)/comHeight ≈ 15.5 m/s² — the tyres let go
 * before the car can trip over itself. Raising μ past ~1.8 removes that
 * safety margin (the harness curb/lane-change tests will catch it).
 */
export const FRICTION_SLIP_FRONT = 1.4;
/** Rear tyre μ. Keep ≥ front or the learner car oversteers. */
export const FRICTION_SLIP_REAR = 1.5;
/** Lateral stiffness multiplier at normal driving (rapier default 1.0). */
export const SIDE_FRICTION_STIFFNESS = 1.0;
/**
 * WET surface grip factor (ADR-006 stage 4a — the opt-in wet-grip slice;
 * doc 72 wet-road evidence, doc 65 Phase 4). Scales tyre μ (FRICTION_SLIP_*)
 * and the achievable service-brake force in VehicleSim when a lesson OPTS IN
 * via LessonSpec.physics.wetGrip — the default gripFactor is 1.0 and the dry
 * path stays bit-identical (the CI harness is the proof).
 *
 * Value: wet asphalt holds ~65–75% of dry grip (tyre literature; doc 72
 * FO-04: „braking distance ~1.5× wet"). 0.7 ⇒ braking distance × 1/0.7 ≈
 * 1.43 from any speed (measured 1.42 from 50 km/h in wet-grip.test.ts) and
 * lateral grip capped at ~0.7× — the honest, teachable middle of the band.
 * Aquaplane float / ice (doc 72 AC-08/12) are NOT this constant — they need
 * the full Phase-4 friction model and stay out of the slice.
 */
export const WET_GRIP_FACTOR = 0.7;
/**
 * SNOW surface grip factor (the SNOW unlock — doc 72 AC-08 winter grip;
 * composes the wet-grip seam above with the fog render seam). Same opt-in
 * contract as WET_GRIP_FACTOR: scales tyre μ and service-brake force in
 * VehicleSim ONLY when a lesson AUTHORS LessonSpec.physics.snowGrip — the
 * default gripFactor stays 1.0 and the dry path bit-identical.
 *
 * Value: PACKED SNOW holds ~0.35–0.45 of dry grip (tyre/winter-driving
 * literature; the content bank's c-winter-ice: „на сняг и лед спирачният път
 * се удължава многократно"). 0.4 ⇒ braking distance × 1/0.4 = ~2.5× dry from
 * any speed and lateral grip capped at ~0.4× — the honest, teachable middle
 * of the packed-snow band, and safely above VehicleSim's 0.3 clamp floor.
 * Black ice (~0.1–0.2) is NOT this constant — it needs the Phase-4 friction
 * model (doc 72 AC-08's invisible-hazard cue structure) and stays out.
 */
export const SNOW_GRIP_FACTOR = 0.4;
/**
 * CROSSWIND lateral force (N) of an exposed segment — bridge deck, gap
 * between buildings, the moment you clear an overtaken truck's bow wave
 * (doc 72 AC-12). Fed to VehicleSim.windLateralN ONLY when a lesson AUTHORS
 * LessonSpec.physics.crosswind (the wet-grip opt-in contract): the default
 * wind is 0 and the calm path stays bit-identical (CI harness + the
 * crosswind identity test are the proof).
 *
 * Value grounding, both channels documented honestly:
 *  - AERO: side area of the fictional compact ≈ 4.0 m × 1.4 m ≈ 5.7 m²;
 *    a strong gust of ~17 m/s (~60 km/h, the „силен вятър" warning band)
 *    gives q = ½ρv² ≈ 177 Pa → F ≈ Cs(≈1.1) · A · q ≈ 1100 N. We run 1200 N
 *    (a gust nearer 18 m/s) because the raycast tyre model bleeds part of
 *    any sub-clamp lateral force each step — the honest number must survive
 *    the model to stay teachable.
 *  - MEASURED (crosswind.test.ts, the wet-braking-distance discipline): at
 *    a hands-fixed ~70–80 km/h cruise, 1200 N drifts the car laterally
 *    ≈ 0.5 m in 3 s, ≈ 1.0 m in 5 s, ≈ 2.7 m in 10 s (the drift compounds —
 *    the heading itself slowly blows downwind); at a gust peak (1200 + 500)
 *    ≈ 3.8 m in 10 s. Crossing a ~200 m exposed segment uncorrected
 *    therefore drifts HALF A DRAWN LANE (8.125 m / 2) — exactly the AC-12
 *    story („a gust shoves the car half a lane"). Wind accel = 1200/1220 ≈
 *    0.98 m/s² ≈ 0.1 g vs the ≈ 13 m/s² tyre grip ceiling — the equilibrium
 *    counter-steer measures BELOW 0.01 of full input (steer −0.01 already
 *    out-pulls the wind ~4× at 80 km/h), so the duty the lesson teaches
 *    (firm grip, gentle steady correction, reduced speed) genuinely works
 *    and over-correction genuinely overshoots — the doc-72 second-swerve
 *    killer is reproducible in the live car.
 * Hurricane forces, tyre blowouts and the doc-65 Phase-4 wind-zone model
 * (per-segment exposure) are NOT this constant and stay out of the slice.
 */
export const CROSSWIND_BRIDGE_N = 1200;
/**
 * Gust envelope on top of CROSSWIND_BRIDGE_N — a PURE SINE (VehicleSim
 * windGust: no RNG, deterministic, reset() rewinds the clock), so the wind
 * breathes between ~0.6× and ~1.4× of the base instead of reading as a
 * constant lean. Amplitude stays below the base: the wind never reverses
 * direction mid-lesson (a real gust front slackens, it does not flip).
 */
export const CROSSWIND_GUST_AMPLITUDE_N = 500;
/** Gust sine period (s) — the slow breathing of a bridge-deck wind. */
export const CROSSWIND_GUST_PERIOD_SEC = 5;

// ---------------------------------------------------------------------------
// Drivetrain
// ---------------------------------------------------------------------------
/**
 * Available TOTAL tractive force (N) vs speed (km/h) — piecewise-linear,
 * split across the driven wheels. Stands in for engine torque × gearing;
 * tapers like a real power curve so top speed self-limits against AERO_DRAG
 * (~135 km/h). Peak 4800 N ≈ 0–100 in ~10 s for 1220 kg. [kmh, newtons]
 */
export const ENGINE_FORCE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 4800],
  [30, 4800],
  [60, 3600],
  [90, 2600],
  [120, 1300],
  [145, 0],
];
/** Total reverse force (N) — deliberately weak, like a real reverse gear. */
export const REVERSE_FORCE_N = 3000;
/** Reverse speed cap (km/h). */
export const REVERSE_MAX_KMH = 25;
/**
 * S0 parking envelope: brake-pedal fraction used when the driver holds the
 * throttle in the WRONG direction for the current motion (gas in R while
 * still rolling forward, gas in D while rolling backward) and the sim must
 * stop the car before driving the other way. 1.0 was a full 0.9 g slam at
 * the 0-crossing — a torque converter fighting the roll is firm, not violent.
 * Applies ONLY on the explicit-driveline path (cabin sessions); legacy
 * callers (the CI harness) keep the original full-brake behavior bit-for-bit.
 */
export const STOP_FIRST_BRAKE = 0.55;
/** Coast-down rolling resistance, total (N), applied as wheel brake impulses. */
export const ROLLING_RESISTANCE_N = 280;

/** Piecewise-linear lookup into ENGINE_FORCE_CURVE. */
export function engineForceAt(speedKmh: number): number {
  const pts = ENGINE_FORCE_CURVE;
  const first = pts[0];
  if (!first) return 0;
  if (speedKmh <= first[0]) return first[1];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (!prev || !cur) break;
    if (speedKmh <= cur[0]) {
      const t = (speedKmh - prev[0]) / (cur[0] - prev[0]);
      return prev[1] + (cur[1] - prev[1]) * t;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Brakes (see cheat-sheet points 3, 4)
// ---------------------------------------------------------------------------
/** Total service-brake force (N). 11000 / 1220 kg ≈ 0.92 g — modern ABS-ish. */
export const BRAKE_FORCE_N = 11000;
/** Fraction of brake force on the front axle (weight transfers forward). */
export const BRAKE_BIAS_FRONT = 0.62;
/** Handbrake force (N), rear axle only. */
export const HANDBRAKE_FORCE_N = 6500;
/** Rear lateral grip multiplier while the handbrake is pulled → slides. */
export const HANDBRAKE_REAR_GRIP = 0.4;

// ---------------------------------------------------------------------------
// Steering — speed-sensitive limits (the #1 controllability lever at 90 km/h)
// ---------------------------------------------------------------------------
/** Max road-wheel angle (rad) at/below STEER_FULL_SPEED_KMH. ~34°. */
export const STEER_MAX_ANGLE = 0.6;
/** Max road-wheel angle (rad) at/above STEER_MIN_SPEED_KMH. ~8°. */
export const STEER_MIN_ANGLE = 0.14;
/** Below this speed (km/h) full lock is available (parking). */
export const STEER_FULL_SPEED_KMH = 15;
/** Above this speed (km/h) only STEER_MIN_ANGLE is available. */
export const STEER_MIN_SPEED_KMH = 110;
/** How fast the wheel turns toward the target (rad/s). */
export const STEER_SPEED = 3.2;
/** How fast it self-centres (rad/s) — quicker than turn-in, like a caster. */
export const STEER_RETURN_SPEED = 4.8;
// (STEERING_WHEEL_VISUAL_RATIO removed — the visual wheel ratio is owned by
// VitokCockpit's WHEEL_VISUAL_RATIO; the old 13× export was an unused fork.)

// ---------------------------------------------------------------------------
// Anti-roll bars & aero — stability without killing body motion
// ---------------------------------------------------------------------------
/**
 * Software anti-roll bar stiffness (N per metre of left/right compression
 * difference). Front stiffer than rear → understeer balance. These work
 * WITH the roll coupling below: coupling creates the lean, springs + ARBs
 * decide how much of it survives.
 */
export const ANTI_ROLL_FRONT = 4500;
export const ANTI_ROLL_REAR = 3000;

// ---------------------------------------------------------------------------
// Body-roll coupling — the fix for "raycast cars corner totally flat"
// ---------------------------------------------------------------------------
// Rapier (like Bullet) applies tyre side impulses NEAR THE COM HEIGHT
// (Bullet's rollInfluence ≈ 0.1, not exposed in the JS API), so lateral
// force produces almost no roll torque: measured 0.3° at 0.66 g — a
// go-kart, not a hatchback. We restore the missing physics by applying an
// explicit torque about the forward axis: τ = mass · aLat · ROLL_ARM.
/** Effective lever arm (m) between COM and side-force line of action. */
export const ROLL_COUPLING_ARM = 0.35;
/** Clamp on the lateral accel (m/s²) fed to the coupling (curb spikes). */
export const ROLL_COUPLING_MAX_LAT = 12;
/** Low-pass rate (1/s) for measured lateral accel — kills raycast jitter. */
export const ROLL_COUPLING_LP = 10;
/** Quadratic air drag (N per (m/s)²). 0.42 ≈ Cd 0.32 × 2.2 m² frontal. */
export const AERO_DRAG = 0.42;
/**
 * Quadratic downforce (N per (m/s)²). Real compacts have ~0; a pinch keeps
 * the raycast car planted over crests at 90 km/h. Cheap stability lever.
 */
export const AERO_DOWNFORCE = 1.1;

// ---------------------------------------------------------------------------
// Gearing display (cosmetic auto box for the HUD; physics is gearless)
// ---------------------------------------------------------------------------
/** Upshift display thresholds (km/h): below 16 → 1st, … above 80 → 5th. */
export const GEAR_UPSHIFT_KMH = [16, 34, 55, 80] as const;

// ---------------------------------------------------------------------------
// Spawn & cameras
// ---------------------------------------------------------------------------
/** Spawn on the south straight, facing +X (east), slight drop to settle. */
export const SPAWN = { x: -20, y: 0.8, z: -40, yawRad: Math.PI / 2 } as const;
/** Auto-reset if the chassis somehow leaves the world. */
export const KILL_PLANE_Y = -5;

export const CHASE_DISTANCE = 6.0; // m behind the car
export const CHASE_HEIGHT = 2.3; // m above the car
export const CHASE_LOOK_AHEAD = 3.0; // m ahead of the car to aim at
export const CHASE_LOOK_HEIGHT = 1.1; // m above car origin to aim at
export const CHASE_STIFFNESS = 5.0; // 1/s exponential follow rate

// ---------------------------------------------------------------------------
// GFOV calibration (QW2 — plan doc 68 Phase 0, research R2 §3.3, audit B3)
// ---------------------------------------------------------------------------
// Perceived road width and speed depend on the ratio of the camera's
// GEOMETRIC field of view (GFOV, what the virtual camera renders) to the
// DISPLAY field of view (DFOV, the angle the physical screen subtends at the
// viewer's eye). Research optimum: GFOV ≈ 1.22 × DFOV. An over-wide GFOV
// minifies the scene → roads read too narrow, speed is underestimated ~10%,
// and the optic-flow mismatch feeds sim sickness.
//
// ASSUMED VIEWING GEOMETRY (documented here; tune in the founder session):
//   15.6" 16:9 laptop → screen height ≈ 19.4 cm, viewed at ≈ 45 cm
//   → vertical DFOV = 2·atan(9.7/45) ≈ 24.5°; a 24" desktop monitor at
//   ≈ 60 cm gives ≈ 28°. Calibrated vertical GFOV ≈ 1.22 × 24.5–28 ≈ 30–34°.
/** Research-optimum GFOV:DFOV ratio (R2 §3.3). */
export const GFOV_DISPLAY_RATIO = 1.22;
/** Vertical DFOV (deg) of the assumed 15.6" laptop viewed at ~45 cm. */
export const ASSUMED_DISPLAY_VFOV_DEG = 24.5;
/** Fully calibrated vertical GFOV (deg) for the assumed display — ≈30. */
export const CALIBRATED_GFOV_DEG = Math.round(
  ASSUMED_DISPLAY_VFOV_DEG * GFOV_DISPLAY_RATIO,
);

/** Chase vertical FOV. Was 60 (uncalibrated). 44 = the cockpit's 40 + 4°:
 *  the third-person frame needs the car plus margins in view, and it is not
 *  the perceptual reference view. All FOVs here are VERTICAL (three.js
 *  `fov`); R3F recomputes aspect on resize/fullscreen, so wider windows gain
 *  horizontal FOV (Hor+) and the calibration is aspect-independent. */
export const CHASE_FOV = 44;

// --- Cockpit camera contract (doc 71 §4.9 / lane 12, revised 2026-07-10) ----
// History: hood cam (eye 0.66/z 0.12, FOV 40, level) → founder rejected;
// REF 6 overshoot (eye 0.74/z −0.18, FOV 57, pitch −14°) → roof header
// letterboxed the windshield, rejected; interim (0.70/−0.10, 57, −8°);
// lane-12 final (up +0.01, pitch −8°) against the v1 interior → founder
// world-first directive: the v1 GLB's glazing was the fault (window capped
// at ~21% of frame height from the shipped camera), so the ASSET was rebuilt
// (hero_interior_v2.py) and the pose retuned to up +0.05 / pitch −5°.
// Lane-12 research ruling: the REF 2 (City Car Driving) look is a MODERATE
// lens pulled BEHIND the driver's eye — vFOV 47 at ~0.375 m aft — never a
// wide lens at the eyeball. The automated acceptance test
// (vehicle/__tests__/cockpit-camera-contract.test.ts) pins this pose; any
// future tune must keep it green or consciously change its bands.

/**
 * Driver DESIGN EYE POINT (DEP), chassis-local (LHD: +X = left/driver side):
 * the authored eye of the interior GLB — VitokCockpit's mount (yaw-π,
 * y −0.55) is calibrated to it and MUST NOT move (hotspot proxies are placed
 * in chassis space against that mount). 0.66 + 0.49 ≈ 1.15 m above road —
 * SAE sedan eye height (lane 12 §5). The CAMERA is defined relative to this.
 */
export const COCKPIT_DEP = { x: 0.34, y: 0.66, z: 0.12 } as const;
/**
 * Camera offsets from the DEP (m), per the lane-12 ruling (doc 71 §4.9):
 * aft −0.375 (tolerance −0.30…−0.45) brings dash + both mirror sightlines
 * into a ~75° hFOV frame; inboard +0.10 (+0.05…+0.15) centres the windshield;
 * up resolved to +0.05 (the ruled tolerance ceiling) with the v2 interior:
 * the founder's world-first directive (window ≥65% of frame height, cowl
 * ≤0.33) needs the eye at the top of the band — +0.05 puts the shaved GT-E
 * cowl line at frame 0.327; anything lower leaves it above the 0.33 cap.
 */
export const COCKPIT_CAM_OFFSET = { aft: 0.375, inboard: 0.1, up: 0.05 } as const;
/**
 * Cockpit camera position, chassis-local = DEP + offsets: a seating position
 * pulled behind and slightly inside the driver's eye — not a hood cam, not
 * an eyeball cam. ~0.78 m behind the wheel rim plane, 1.20 m above road.
 */
export const COCKPIT_EYE = {
  x: COCKPIT_DEP.x - COCKPIT_CAM_OFFSET.inboard, // inboard = toward car centre
  y: COCKPIT_DEP.y + COCKPIT_CAM_OFFSET.up,
  z: COCKPIT_DEP.z - COCKPIT_CAM_OFFSET.aft, // aft = behind the driver
} as const;
/**
 * Cockpit vertical FOV at the 16:9 REFERENCE aspect (three.js `fov` is
 * vertical degrees). History: 55 (doc 63) → 40 (QW2 GFOV calibration — cabin
 * amputated) → 57 (doc 70 overshoot) → 47 FINAL (lane 12): shipped cockpit
 * sims converge on 47–56 v on a single 16:9 screen (CCD ~50h/36v stock, ACC
 * players 50–56, BeamNG 55, Forza dash ~55); 47 ≈ 1.5–2× the true display
 * FOV — the comfort/accuracy sweet spot. With the v2 canopy glazing (glass
 * top above the frame-top ray), vFOV 47 + pitch 5° down + the aft offset
 * yields interior ≈ 33% / window ≈ 67% of frame height (founder contract:
 * world ≥65%, cowl ≤0.33). On resize the
 * HORIZONTAL FOV is held constant instead — see cockpitVFovForAspect().
 */
export const COCKPIT_FOV = 47;
/**
 * HARD CEILING on cockpit vertical FOV (lane 12 §4, research-backed): above
 * ~56° distance compression makes the 10–30 m judgments we grade (following
 * gaps, stop lines) systematically wrong, and wider GFOV further corrupts
 * speed perception (Hussain 2020). Applies to the aspect-derived vFOV AND
 * after any speed widen. Never raise this.
 */
export const COCKPIT_FOV_MAX = 56;
/** Reference aspect at which COCKPIT_FOV is authored. */
export const COCKPIT_ASPECT_REF = 16 / 9;
/**
 * Horizontal FOV (rad) implied by COCKPIT_FOV at the reference aspect —
 * ≈ 75.4°. This is the quantity held constant across window shapes.
 */
export const COCKPIT_HFOV_RAD =
  2 * Math.atan(Math.tan((COCKPIT_FOV * Math.PI) / 360) * COCKPIT_ASPECT_REF);
/**
 * hFOV-locked vertical FOV for an aspect ratio (deg) — the doc-71 §4.9 resize
 * ruling. Default three.js behaviour keeps vFOV fixed (Hor+): ultrawide
 * windows gain world, portrait windows zoom into a slit. Instead hold the
 * ~75.4° hFOV constant and derive vFOV = 2·atan(tan(hFOV/2)/aspect), so the
 * horizontal composition (mirrors, A-pillars, lane edges) is identical on
 * every monitor. Clamped to COCKPIT_FOV_MAX: windows squarer than ~1.45:1
 * pin at vFOV 56 and give up some hFOV — the distance-judgment hard rule
 * outranks the hFOV hold. At 16:9 this returns exactly COCKPIT_FOV (47).
 */
export function cockpitVFovForAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return COCKPIT_FOV;
  const vfovDeg = (2 * Math.atan(Math.tan(COCKPIT_HFOV_RAD / 2) / aspect) * 180) / Math.PI;
  return Math.min(vfovDeg, COCKPIT_FOV_MAX);
}
/**
 * Constant downward camera pitch (rad, negative = look down): 5° (founder
 * world-first directive, 2026-07-10, band −5…−7°; −5 keeps the horizon at
 * 0.60, mid-band). History: −8° was tuned against the v1 interior whose
 * headliner sat at chassis y 0.77 and whose visor/header line (y 0.71,
 * z 0.46) capped the windshield at ~21% of frame height from the shipped
 * camera — an ASSET fault, not a camera fault. The v2 interior
 * (tools/blender/hero_interior_v2.py) raised the glazing: headliner
 * y 0.857–0.885, glass-top/header edge (y 0.850, z 0.16) — above the
 * frame-top ray at rest — long slim A-pillars, shaved cowl/binnacle. With
 * the opening fixed, less down-pitch is needed and the window spans ≥65%.
 * Frame-fraction table at the shipped pose (COCKPIT_EYE (0.24, 0.71,
 * −0.255), vFOV 47, 16:9; fractions from bottom-left, computed through
 * three's projection in the acceptance test — landmarks chassis-local from
 * the v2 GLB/hotspots):
 *   wheel top      (0.34, 0.484, 0.431): fy 0.23        (rim in frame) ✓
 *   cluster centre (0.34, 0.399, 0.711): fy 0.24        (readable) ✓
 *   dash top/cowl  (y 0.48, z 0.70):     fy 0.327       → world = top ~67% ✓
 *     (the windshield GLASS base (0.436, 0.92) projects 0.009 above it —
 *      the shaved cowl still slopes away along the sightline)
 *   10 m road pt   (y −0.49, z 10):      fy 0.466       (10–100 m band clear) ✓
 *   horizon:                             fy 0.60 ✓
 *   int. mirror    (0.00, 0.803, 0.50): fx 0.71 fy 0.745 (upper-right, ABOVE
 *      the horizon and clear of the graded road band — RAISED from the old
 *      eye-level (0, 0.687, 0.575) in the 2026-07-11 black-mass fix: that
 *      block dropped into the sightline under the v2 camera, so the mirror
 *      was rebuilt small on a header-mounted stalk, hero_interior_v2.py)
 *   door mirror L  (0.905, 0.455, 0.592): fx 0.003 fy 0.26 (glass at the left
 *      frame edge — lane 12: "~37° left from the aft camera") ✓
 *   glass top/header (y 0.850, z 0.16):  fy 1.003 → header OUT of frame at
 *      rest (founder band: ≥0.97/out of frame); the old REF 6 letterbox and
 *      the v1 visor line are gone with the v1 low header ✓
 */
export const COCKPIT_PITCH_BASE = -(5 * Math.PI) / 180;
/** Cockpit eye-position smoothing rate (1/s) — damps suspension tick. */
export const COCKPIT_DAMPING = 25;

// --- Cockpit G-force head motion (immersion without nausea; doc 63 §2) -------
/** Lateral body sway (m) per 1 g lateral — head leans OUT of the corner. */
export const COCKPIT_LEAN_LATERAL = 0.045;
/** Longitudinal body sway (m) per 1 g — leans forward under braking. */
export const COCKPIT_LEAN_LONGITUDINAL = 0.03;
/** Head roll (rad) per 1 g lateral — rolls INTO the corner. */
export const COCKPIT_ROLL_GAIN = 0.052; // ≈ 3°
/** Head pitch (rad) per 1 g longitudinal — nose-dive on braking. */
export const COCKPIT_PITCH_GAIN = 0.035; // ≈ 2°
/** Max look-into-turn head yaw (rad) at full steering. */
export const COCKPIT_LOOK_INTO_TURN = 0.09; // ≈ 5°
/** G-lean smoothing rate (1/s). */
export const COCKPIT_LEAN_DAMPING = 6;
/** Kinematic wheelbase (m) for the lateral-G estimate. */
export const ESTIMATE_WHEELBASE = 2.5;
