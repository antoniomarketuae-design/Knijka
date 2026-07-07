// ============================================================================
// tuning.ts — SINGLE SOURCE OF TRUTH for vehicle feel.
//
// Target: a ~1.2-tonne front-wheel-drive compact hatchback (fictional, per
// ADR-001). Design goals: visible body lean in corners, nose dive under
// braking, survives a 12 cm curb at 50 km/h without flipping, controllable
// (understeer-biased) at 90 km/h.
//
// Everything here is plain data/functions — no three.js, no rapier imports —
// so the whole file can be lifted into the platform unchanged.
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
/** Fixed physics timestep (s). Vehicle tuning is dt-sensitive — never vary. */
export const FIXED_DT = 1 / 60;
/** Cap on frame delta (s) so a background tab doesn't explode the sim. */
export const MAX_FRAME_DT = 0.1;
/** Gravity (m/s², Y-up). */
export const GRAVITY = -9.81;

// ---------------------------------------------------------------------------
// Chassis — geometry & mass
// Car local axes: +Z forward, +Y up, +X left (right-handed).
// ---------------------------------------------------------------------------
/** Collider half-extents (m): 1.70 m wide, 0.70 m tall body box, 4.04 m long. */
export const CHASSIS_HALF_EXTENTS = { x: 0.85, y: 0.35, z: 2.02 };
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
export const COM_OFFSET = { x: 0, y: -0.15, z: 0.08 };
/**
 * Multipliers on the analytic box inertia. Real cars carry mass in the
 * corners (wheels, engine) so inertia is higher than a uniform box —
 * raising yaw inertia calms twitchiness, raising roll inertia slows snap
 * roll. (pitch = about X, yaw = about Y, roll = about Z.)
 */
export const INERTIA_SCALE = { pitch: 1.1, yaw: 1.25, roll: 1.05 };
/** Rapier angular damping. Small — too much fights steering at speed. */
export const CHASSIS_ANGULAR_DAMPING = 0.35;
/** Rapier linear damping. Near zero; real drag handled by AERO_DRAG below. */
export const CHASSIS_LINEAR_DAMPING = 0.02;

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
 * safety margin.
 */
export const FRICTION_SLIP_FRONT = 1.4;
/** Rear tyre μ. Keep ≥ front or the learner car oversteers. */
export const FRICTION_SLIP_REAR = 1.5;
/** Lateral stiffness multiplier at normal driving (rapier default 1.0). */
export const SIDE_FRICTION_STIFFNESS = 1.0;

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
/** Visual steering-wheel rotation per road-wheel radian (real ~15, readable 6). */
export const STEERING_WHEEL_VISUAL_RATIO = 6;

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
export const SPAWN = { x: -20, y: 0.8, z: -40, yawRad: Math.PI / 2 };
/** Auto-reset if the chassis somehow leaves the world. */
export const KILL_PLANE_Y = -5;

export const CHASE_DISTANCE = 6.0; // m behind the car
export const CHASE_HEIGHT = 2.3; // m above the car
export const CHASE_LOOK_AHEAD = 3.0; // m ahead of the car to aim at
export const CHASE_LOOK_HEIGHT = 1.1; // m above car origin to aim at
export const CHASE_STIFFNESS = 5.0; // 1/s exponential follow rate
export const CHASE_FOV = 60;

/** Driver eye point, chassis-local (LHD: +X is the left/driver side). */
export const COCKPIT_EYE = { x: 0.34, y: 0.62, z: 0.15 };
export const COCKPIT_FOV = 68;
