// -----------------------------------------------------------------------------
// path-bench.mjs — A KINEMATIC BENCH FOR THE pc-path LEG. NO WORLD.
//
// Same stance as steer-bench.mjs: this is a bench, not a drive. There are no
// kerbs, cones, walls, parked cars, pedestrians or tyres here, and a teach card, an
// obstacle or a creep exists only where a test injects one. A law that passes it has
// been shown CONSISTENT with the product's steering chain, pedal ramps and gear
// gesture as they are written down, with the outer tick's timing as the first pc-path
// browser drives measured it, and with the reverse turning those drives delivered —
// never that it parks a car in the browser.
// `__tests__/path-follow.test.mjs` T9, T12 and T13 drive the REAL reducer through it.
//
// WHAT IS MODELLED, each from a cite:
//  · the steering chain: `chainStep` from path-follow.mjs (input.ts → difficulty.ts
//    sens/τ → VehicleSim.ts lock and rate limiter), sampled once per 60 Hz frame;
//  · a rear-axle kinematic bicycle publishing the MID-WHEELBASE pose, with the
//    measured yaw gain (guidance.mjs) and κ × `kappaScale` — the same integration
//    as build-pathrefs.mjs `integrateRows` — and, in R, κ × `revKappaScale` 0.92: THE
//    CALIBRATION. On canary-path-s2 (4209dad) the product turned 0.896 (sc-park-left R1,
//    3.9 m) and 0.892 (sc-park-wall R1, 3.4 m) of the kinematic lock curvature over its
//    saturated reverse arcs under the 500 ms runner (_audit-path.json: centre arc against
//    camera yaw); this plant with the frame-true timing below turned 0.94, and 0.92 brings
//    it to 0.892–0.894 (T13.4 pins it). The cause is not isolated — it is not the yield
//    (below) and not the chain — so it is carried as a measured plant term, in R only,
//    where it was measured;
//  · pedal key ramps W 0.35/0.25 s, S 0.25/0.20 s (input.ts:107-113), the crawl
//    throttle ceiling 0.45 below 4 km/h, the crawl brake ceiling 0.6 → 1 over
//    6–14 km/h (difficulty.ts:60-64, 91, 304-306), full brake 0.9 g;
//  · THE PEDAL PRIORITY (2026-09-17, `pedalStep`): VehicleSim.update's state machine —
//    a throttle above zero drives and the brake is not read; the brake applies only at
//    zero throttle; the coast only with neither; stop-first against the gear's direction
//    above 0.5 m/s; R on the swapped pedals. Until 2026-09-17 this plant SUMMED drive and
//    brake, so both pedals down held the car where the product drives it — every disarm
//    creep measured on it with a brake inside a held throttle was the plant's (T6.7d/e);
//  · the ReverseAssist gear gesture: a FUNCTIONAL-BRAKE down-edge at a standstill
//    (|v| < 0.6 km/h) after a lift of ≥ 0.25 s toggles the gear 0.43 s later if the
//    key is still held, motion is held a further 0.08 s, and the held key is the
//    new gear's accelerator (reverseAssist.ts:80-81, 143, 159, 244-258, 359-366);
//  · coast 0.23 m/s² (tuning.ts:375 over :72, DESIGN-v2-CHECK S-14);
//  · the camera: a car-local offset (+X car-left, +Z forward) rotated by
//    Ry(180° − ψ) (CameraRig.tsx:1231-1252), so `yawFromCamOffset` reads it;
//  · the outer tick's timing, by default CANARY_PC_S2 — what the first pc-path browser
//    drives measured (run.log TICK COST, pathFollow.cadence: evaluate p50 2 / p90 6 ms,
//    probe med 3 ms, guide med 1 ms, reverse blind p50 4–7 / p90 8–14 ms, screenshots
//    225–260 ms). W47_PC (the ribbon leg's w47 timing) is kept for comparison;
//  · WALL TIME AND FRAME TIME APART (2026-09-15): an evaluate costs its milliseconds and a
//    key that lands mid-frame is seen from the next 60 Hz frame. Until then `advance()`
//    rounded every sub-frame wait up to a whole frame, which made each yield release the
//    wheel for 4 frames (67 ms) — the "15–20 % of turning lost to the yield" figure was
//    that rounding, not the product;
//  · INJECTED, where a test asks (T13): a page stall and a pause-layer drain
//    (`disturbances`, the teach card canary-path-s2 sc-park-left met mid-R1), an obstacle
//    that pins the car and may let it creep and later release (`crashAt`, the crash pin),
//    and a backward creep in R (`plantOpts.creepMps2`);
//  · THE HUD (CODE-REVIEW-1 M2): the dial and the cluster letter every reader sees
//    are StatusDashboard's snapshot, polled every DASHBOARD_POLL_MS = 100 ms
//    (StatusDashboard.tsx:908-916) and painted one frame later — so the dial is
//    `displaySpeedKmh` of a speed up to ~117 ms old, and «R»/«D» appear that late;
//  · THE CAMERA'S YAW ERROR: read noise σ 0.1° (the pc no-press noise floor, |Δψ|
//    p90 0.24°, control-law.md §7) plus the body-pitch leak of ≈ 1.7°/° (DESIGN-v2
//    §3.2), with pitch modelled as 0.3°/(m/s²) of longitudinal deceleration through a
//    0.15 s lag — an ASSUMED magnitude, stated so; `plantOpts.camNoise: false` removes it.
//
// THE OUTER LOOP is lesson-audit.mjs's, as far as a path leg reaches it: the arm
// gate (N1), `armReverse` with `pathSelectorHold` (N2), the stop branch with
// `pathSafeKmh` and `pathStopExit`, the reverse exit and `disarmReverse` with the
// N4 at-rest skip. THE RUNNER'S OBSERVATION AND EVERY KEY DECISION ARE NOT MIRRORED
// BUT SHARED: `pathObservation`, `pathApplyActions` and `pathYieldActions` from
// path-follow.mjs, exactly as lesson-audit.mjs calls them; this file keeps only the
// executor that maps an action onto its plant helpers.
// -----------------------------------------------------------------------------
import { VEHICLE, yawGainAtKmh } from "./guidance.mjs";
import { DISARM_BRAKE, brakeReadOf, chainStep, createPathState, headingUnit, pathApplyActions, pathDisarmHoldActions, pathDisarmLandActions, pathFollowBooks, pathLandingActions, pathLandingHoldActions, pathObservation, pathOnPauseDrain, pathRunnerBudgetMs, pathRunnerEntry, pathSafeKmh, pathStep, pathYieldActions, pathYieldState, PATH_TUNE } from "./path-follow.mjs";

const FRAME_S = 1 / 60;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const L = VEHICLE.WHEELBASE_M;
const A = L / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

export const BENCH = Object.freeze({
  standstillKmh: 0.6,
  liftS: 0.25,
  /** reverseAssist.ts:165 REVERSE_ASSIST_PEDAL_ON — a ramped pedal above this counts as held */
  pedalOn: 0.1,
  toggleS: 0.43,
  motionHoldS: 0.08,
  keyAttack: Object.freeze({ W: 0.35, S: 0.25 }),
  keyRelease: Object.freeze({ W: 0.25, S: 0.2 }),
  fullBrakeMps2: 0.9 * 9.81,
  aFwdFullMps2: 3.0,
  reverseLiftMs: 900,
  reverseHoldMs: 1100,
  armPollMs: 60,
  armAttempts: 3,
  armBudget: 9,
  tickMs: 500,
  stopMs: 3000,
  minPhaseTicks: 2,
  hudPollMs: 100,
  camNoiseDeg: 0.1,
  pitchLeakPerDeg: 1.7,
  pitchDegPerMps2: 0.3,
  pitchLagS: 0.15,
  /** R-gear curvature factor, CALIBRATED on the product (see the header). */
  revKappaScale: 0.92,
});

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════════ the plant ═══════════════════════════ */

/**
 * `x, z, psi` are the CENTRE pose (probe frame). `aRev` is the reverse creep
 * acceleration with the R accelerator held at the crawl ceiling (m/s²).
 */
export function createPlant({ x, z, psi, gear = "D", kappaScale = 1, revKappaScale = BENCH.revKappaScale, aRev = 1.2, aCoast = 0.23, camLocal = { x: -0.24, z: 0.35 }, steerSign = 1, hudPollMs = BENCH.hudPollMs, hudPhaseS = 0, camNoise = true, noiseSeed = 1, creepMps2 = 0, creepAfterX = null, assistThrottleVeto = true, pedalPriority = "product" } = {}) {
  const h = headingUnit(psi);
  return {
    // reverseAssist.ts:265-268 — see landKeys. `false` only to show what the clause changes (T9.arm)
    assistThrottleVeto,
    // path-bench.mjs pedalStep: "product" is VehicleSim's priority; "sum" the pre-2026-09-17 plant, a MUTATION only (T6.7e)
    pedalPriority,
    rx: x - A * h.x, rz: z - A * h.z, psi, v: 0, gear,
    chain: { smoothed: 0, wheel: 0 },
    keys: { W: false, S: false, steer: 0 },
    queue: [],
    pedal: { W: 0, S: 0 },
    liftAt: { W: -10, S: -10 },
    toggle: null, motionHoldUntil: -1,
    frame: 0, t: 0, ft: 0,
    kappaScale, revKappaScale, aRev, aCoast, camLocal, steerSign,
    // an injected reverse creep (a slope, or a pedal the harness does not own): a
    // constant backward push in R whenever no brake is down — the bench's model of
    // «the car keeps rolling after the end» (T13)
    creepMps2, creepAfterX,
    // an injected obstacle: a stop line along the plant's travel that pins the car
    // (T13's collision stop) — { axis: "x"|"z", at, dir: -1|1, hitAt: null }
    wall: null,
    gearLog: [], downEdges: [],
    // the HUD snapshot (dial + cluster letter): polled, then painted on the next frame
    hud: { pollAt: -hudPhaseS, pending: null, dial: 0, gear },
    hudPollS: hudPollMs / 1000,
    // the camera's yaw error: the pitch state and a seeded noise source
    pitchDeg: 0, lastSpeed: 0,
    camNoise, noise: rng(noiseSeed ^ 0x5bd1e995),
  };
}

export const plantCentre = (pl) => {
  const h = headingUnit(pl.psi);
  return { x: pl.rx + A * h.x, z: pl.rz + A * h.z };
};

/** Queue a key state change to land `landMs` from now. */
export function sendKeys(pl, keys, landMs) {
  const base = pl.queue.length ? pl.queue[pl.queue.length - 1].keys : pl.keys;
  pl.queue.push({ at: pl.t + landMs / 1000, keys: { ...base, ...keys } });
}

/** The key state the HARNESS believes (what it last sent). */
export const sentKeys = (pl) => (pl.queue.length ? pl.queue[pl.queue.length - 1].keys : pl.keys);

/**
 * THE GESTURE'S «BOTH PEDALS» CLAUSE (2026-09-17). reverseAssist.ts:265-268: while the
 * functional brake is down, a functional THROTTLE above REVERSE_ASSIST_PEDAL_ON (0.1) disarms
 * the press and zeroes its hold, and `armed` is set only at the press's rising edge
 * (:254-257) — so a press that begins while the other pedal is still up the ramp can never
 * shift, however long it is held. Until today this plant armed a press on the key edge alone,
 * which is stricter than the product in exactly one case: a brake pressed while the other
 * pedal is still down. The disarm brake (path-follow.mjs §10b) is that case by design, so a
 * plant without the clause would flip a gear the product does not. The clause is read off
 * the RAMPED pedal, as the product reads it; `assistThrottleVeto: false` removes it.
 */
const accelKeyOf = (gear) => (gear === "D" ? "W" : "S");
function landKeys(pl) {
  while (pl.queue.length && pl.queue[0].at <= pl.ft + 1e-9) {
    const nk = pl.queue.shift().keys;
    const vKmh = Math.abs(pl.v) * 3.6;
    const functionalBrake = pl.gear === "D" ? "S" : "W";
    for (const k of ["W", "S"]) {
      if (pl.keys[k] && !nk[k]) pl.liftAt[k] = pl.ft;
      if (!pl.keys[k] && nk[k]) {
        const wouldArm = k === functionalBrake && vKmh < BENCH.standstillKmh && pl.ft - pl.liftAt[k] >= BENCH.liftS && pl.toggle === null;
        // booked only where the clause DECIDES something: an edge that would have armed without it
        const vetoed = wouldArm && pl.assistThrottleVeto && pl.pedal[accelKeyOf(pl.gear)] > BENCH.pedalOn;
        pl.downEdges.push({ key: k, t: pl.ft, vKmh, gear: pl.gear, ...(vetoed ? { vetoed: true } : {}) });
        if (wouldArm && !vetoed) pl.toggle = { at: pl.ft + BENCH.toggleS, key: k, to: pl.gear === "D" ? "R" : "D" };
      }
    }
    if (pl.toggle && !nk[pl.toggle.key]) pl.toggle = null;
    pl.keys = nk;
  }
}

/**
 * THE PEDAL PRIORITY — VehicleSim.update's throttle / brake / reverse state machine, branch for branch
 * (platform/src/modules/sim/vehicle/VehicleSim.ts, the block under «Throttle / brake / reverse state machine»
 * and «Brakes»; 2026-09-17). Until today this plant ADDED the drive and the brake, so both pedals down at rest
 * held the car. The product does not: on the honest machine every cabin session runs (a driveline is passed),
 *  · D: `if (input.throttle > 0)` — rolling backwards faster than 0.5 m/s it brakes at
 *    throttle × STOP_FIRST_BRAKE (tuning.ts 0.55), otherwise it DRIVES — and the brake is NEVER READ;
 *    `else if (input.brake > 0)` brakes (and at rest holds); else it coasts;
 *  · R: the same with the FUNCTIONAL pedals (reverseAssist.ts rule b: S drives, W brakes — the assist's own flip
 *    is never disowned), stop-first when rolling FORWARDS faster than 0.5 m/s, and no drive at or past
 *    REVERSE_MAX_KMH (tuning.ts 25) backwards;
 *  · the coast (ROLLING_RESISTANCE_N, this plant's aCoast) is a per-wheel brake floor applied ONLY when
 *    `engineTotal === 0 && brakePedal === 0` — never under a drive, never added to a brake.
 * `input.throttle > 0` is tested on the SHAPED throttle, and applyDifficulty's shaping (pow × multiplier ×
 * governor, then the creep ceiling) is above zero exactly when the pedal is, below the governor band — so the
 * branch is decided by the ramped pedal here. The MAGNITUDES stay this plant's calibrated terms (aFwdFullMps2,
 * aRev, fullBrakeMps2, the crawl ceilings), and path-follow.test.mjs T6.7e runs the product's own VehicleSim
 * next to this function over pedals × difficulty × speed × gear and holds the BRANCH to it.
 *
 * PURE, and the one place a frame's pedal decision is made: stepFrame calls it and nothing else decides.
 * `accel` / `brake` are the functional ramped pedals, `v` the signed forward speed (m/s). `driveHeld`
 * suppresses the drive's MAGNITUDE only (the gesture's measured motion hold after a flip — the engine is
 * engaged, so the brake is still not read and there is no coast). `priority: "sum"` is the pre-2026-09-17
 * plant, kept ONLY as the mutation T6.7e must catch; nothing else may pass it.
 */
export const PEDAL_PRIORITY = Object.freeze({
  /** VehicleSim.ts: `speedMs < -0.5` (D) / `speedMs > 0.5` (R) — the stop-first threshold, m/s */
  stopFirstMps: 0.5,
  /** tuning.ts STOP_FIRST_BRAKE */
  stopFirstBrake: 0.55,
  /** tuning.ts REVERSE_MAX_KMH */
  reverseMaxKmh: 25,
});
export function pedalStep({ gear, accel, brake, v, aRev, aCoast, driveHeld = false, priority = "product" }) {
  const vKmh = Math.abs(v) * 3.6;
  const throttle = Math.min(accel, 0.45 + 0.55 * ramp(vKmh, 4, 12));
  const brakeIn = Math.min(brake, 0.6 + 0.4 * ramp(vKmh, 6, 14));
  const driveOf = (t) => (driveHeld ? 0 : gear === "D" ? t * BENCH.aFwdFullMps2 : (t / 0.45) * aRev);
  if (priority === "sum") {
    // THE OLD PLANT (mutation only): drive and brake summed, the coast off above a 0.02 throttle
    const t = driveHeld ? 0 : throttle;
    return { throttle: t, brake: brakeIn, branch: "sum", aDrive: driveOf(t), brakeDecel: brakeIn * BENCH.fullBrakeMps2, coastDecel: t > 0.02 ? 0 : aCoast };
  }
  if (priority !== "product") throw new Error(`pedalStep: unknown priority ${JSON.stringify(priority)}`);
  const dir = gear === "D" ? 1 : -1;
  if (throttle > 0) {
    if (v * dir < -PEDAL_PRIORITY.stopFirstMps) {
      const b = throttle * PEDAL_PRIORITY.stopFirstBrake;
      return { throttle, brake: b, branch: "stop-first", aDrive: 0, brakeDecel: b * BENCH.fullBrakeMps2, coastDecel: 0 };
    }
    if (gear === "R" && v * 3.6 <= -PEDAL_PRIORITY.reverseMaxKmh) return { throttle, brake: 0, branch: "coast", aDrive: 0, brakeDecel: 0, coastDecel: aCoast };
    return { throttle, brake: 0, branch: "drive", aDrive: driveOf(throttle), brakeDecel: 0, coastDecel: 0 };
  }
  if (brakeIn > 0) return { throttle: 0, brake: brakeIn, branch: "brake", aDrive: 0, brakeDecel: brakeIn * BENCH.fullBrakeMps2, coastDecel: 0 };
  return { throttle: 0, brake: 0, branch: "coast", aDrive: 0, brakeDecel: 0, coastDecel: aCoast };
}

function stepFrame(pl) {
  landKeys(pl);
  // …and while a toggle is in flight the same clause disarms it (reverseAssist.ts:265-268)
  if (pl.toggle && pl.assistThrottleVeto && pl.pedal[accelKeyOf(pl.gear)] > BENCH.pedalOn) {
    pl.vetoedToggles = (pl.vetoedToggles ?? 0) + 1;
    pl.toggle = null;
  }
  if (pl.toggle && pl.ft >= pl.toggle.at) {
    pl.gear = pl.toggle.to;
    pl.gearLog.push({ t: pl.ft, gear: pl.gear });
    pl.motionHoldUntil = pl.ft + BENCH.motionHoldS;
    pl.toggle = null;
  }
  for (const k of ["W", "S"]) {
    const target = pl.keys[k] ? 1 : 0;
    const rate = FRAME_S / (target > pl.pedal[k] ? BENCH.keyAttack[k] : BENCH.keyRelease[k]);
    pl.pedal[k] = pl.pedal[k] < target ? Math.min(target, pl.pedal[k] + rate) : Math.max(target, pl.pedal[k] - rate);
  }
  const vKmh = Math.abs(pl.v) * 3.6;
  const accelKey = pl.gear === "D" ? "W" : "S";
  const brakeKey = pl.gear === "D" ? "S" : "W";
  const sum = pl.pedalPriority === "sum";
  // THE OLD PLANT zeroed the accelerator while a toggle was in flight («the pressed key is still the OLD gear's
  // brake»). The product's selector does not change until the assist emits, so the old gear's throttle — whatever
  // its ramp holds, at most PEDAL_ON or the veto above has cancelled the toggle — is still read and still takes the
  // brake out. Only the measured motion hold after the flip remains, as a hold on the drive's magnitude.
  const accelPedal = sum && pl.toggle ? 0 : pl.pedal[accelKey];
  const ped = pedalStep({ gear: pl.gear, accel: accelPedal, brake: pl.pedal[brakeKey], v: pl.v, aRev: pl.aRev, aCoast: pl.aCoast, driveHeld: pl.ft < pl.motionHoldUntil, priority: sum ? "sum" : "product" });
  pl.lastPedalStep = ped;
  const dir = pl.gear === "D" ? 1 : -1;
  let aDrive = ped.aDrive;
  // the injected creep pushes whenever the machine applies no brake (a brake pedal held under a throttle is not one)
  const creeping = pl.creepMps2 > 0 && pl.gear === "R" && ped.brake < 0.02 && (pl.creepAfterX === null || plantCentre(pl).x <= pl.creepAfterX);
  if (creeping) aDrive = Math.max(aDrive, pl.creepMps2 + pl.aCoast);
  const resist = ped.brakeDecel + (creeping ? 0 : ped.coastDecel) + (pl.extraDecelMps2 ?? 0);
  if (Math.abs(pl.v) > 1e-9) {
    const sgn = Math.sign(pl.v);
    const push = dir === sgn ? aDrive : -aDrive;
    const mag = Math.abs(pl.v) + (push - resist) * FRAME_S;
    pl.v = mag <= 0 ? 0 : sgn * mag;
  } else if (aDrive > resist) {
    pl.v = dir * (aDrive - resist) * FRAME_S;
  }
  // an injected obstacle pins the car the frame its centre reaches it (a collision stop). softKmh:
  // the product's crash pin lets a pushed car creep (canary-path-s2 sc-park-left crept at 0.5–1 km/h
  // under the R throttle for 6 s of «crash-pinned» ticks); releaseAfterS: the pin lifts
  if (pl.wall && pl.wall.hitAt !== null && Number.isFinite(pl.wall.releaseAfterS) && pl.ft - pl.wall.hitAt >= pl.wall.releaseAfterS) pl.wall.released ??= pl.ft;
  if (pl.wall && !pl.wall.released && Math.abs(pl.v) > 0) {
    const c = plantCentre(pl);
    const past = pl.wall.axis === "x" ? (c.x - pl.wall.at) * pl.wall.dir : (c.z - pl.wall.at) * pl.wall.dir;
    const hh = headingUnit(pl.psi);
    const toward = (pl.wall.axis === "x" ? hh.x : hh.z) * Math.sign(pl.v) * pl.wall.dir > 0;
    if (past >= 0 && toward) {
      pl.wall.hitAt ??= pl.ft;
      const cap = Number.isFinite(pl.wall.softKmh) && pl.ft > pl.wall.hitAt ? pl.wall.softKmh / 3.6 : 0;
      pl.v = Math.sign(pl.v) * Math.min(Math.abs(pl.v), cap);
    }
  }
  pl.chain = chainStep(pl.chain, pl.keys.steer * pl.steerSign, vKmh, "normal");
  const kap = (yawGainAtKmh(vKmh) * pl.kappaScale * (pl.gear === "R" ? pl.revKappaScale : 1) * Math.tan(pl.chain.wheel)) / L;
  const dpsi = pl.v * kap * FRAME_S * DEG;
  const pm = (pl.psi + dpsi / 2) * RAD;
  pl.rx += pl.v * Math.sin(pm) * FRAME_S;
  pl.rz += -pl.v * Math.cos(pm) * FRAME_S;
  pl.psi += dpsi;
  pl.ft += FRAME_S;
  pl.frame += 1;
  // pitch: nose down under deceleration, through a first-order lag
  const aLong = (Math.abs(pl.v) - pl.lastSpeed) / FRAME_S;
  pl.lastSpeed = Math.abs(pl.v);
  const target = -BENCH.pitchDegPerMps2 * aLong;
  pl.pitchDeg += (target - pl.pitchDeg) * (1 - Math.exp(-FRAME_S / BENCH.pitchLagS));
  // the HUD: a snapshot every poll, painted on the next frame
  if (pl.hud.pending) pl.hud = { ...pl.hud, dial: pl.hud.pending.dial, gear: pl.hud.pending.gear, pending: null };
  if (pl.ft - pl.hud.pollAt >= pl.hudPollS - 1e-9) {
    pl.hud = { ...pl.hud, pollAt: pl.ft, pending: { dial: Math.max(0, Math.round(Math.abs(pl.v) * 3.6)), gear: pl.gear } };
  }
  if (pl.onFrame) pl.onFrame(pl);
}

export function advance(pl, ms) {
  // WALL time is continuous and FRAME time advances in whole 60 Hz frames: a 3 ms
  // evaluate costs 3 ms, and a key that lands mid-frame is seen from the NEXT frame
  // start (input.ts reads the pressed set once per render frame). Rounding every
  // sub-frame wait UP to a whole frame — this function until 2026-09-15 — made each
  // yield release the wheel for 4 frames (67 ms) where the browser measured 15–25 ms.
  pl.t += ms / 1000;
  while (pl.ft + FRAME_S <= pl.t + 1e-9) stepFrame(pl);
}

/** A standard normal from the plant's own noise source (Box–Muller). */
function gauss(pl) {
  const u = Math.max(1e-12, pl.noise());
  const w = pl.noise();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
}

/**
 * What `pathRead` returns — ONE page evaluation: the pose, the camera offset (with the
 * camera's yaw error rotated into the world offset), and the HUD's dial and cluster.
 */
export function readPlant(pl) {
  const c = plantCentre(pl);
  const errDeg = pl.camNoise ? BENCH.camNoiseDeg * gauss(pl) + BENCH.pitchLeakPerDeg * pl.pitchDeg : 0;
  const th = (180 - (pl.psi + errDeg)) * RAD;
  const wx = pl.camLocal.x * Math.cos(th) + pl.camLocal.z * Math.sin(th);
  const wz = -pl.camLocal.x * Math.sin(th) + pl.camLocal.z * Math.cos(th);
  return { f: pl.frame, x: c.x, z: c.z, v: pl.v * 3.6, d: FRAME_S, lx: pl.camLocal.x, lz: pl.camLocal.z, cx: c.x + wx, cz: c.z + wz, pz: false, dial: pl.hud.dial, gear: [pl.hud.gear] };
}

/** The TRUE rounded speed — for assertions only; no harness reader sees it. */
export const dialKmh = (pl) => Math.round(Math.abs(pl.v) * 3.6);
/** The dial every harness reader sees: the HUD snapshot. */
export const hudDialKmh = (pl) => pl.hud.dial;
/** The cluster letter every harness reader sees: the HUD snapshot. */
export const hudGear = (pl) => pl.hud.gear;

/* ═══════════════════════════ the harness ═══════════════════════════ */

// sc-park-wall__pc-right/run.log:447 (w47): probe ×94 med 6 ms max 297 · read ×15 med 9 ms ·
// screenshot ×20 med 322 ms max 536 ms · aim ×48 med 1 ms; key landing overhead med 8.8 ms p90 13.9.
export const W47_PC = Object.freeze({
  rttMs: [1, 12],
  landMs: [4, 14],
  probeMs: [4, 12],
  guideReadMs: [1, 9],
  probeTail: Object.freeze({ p: 0.05, ms: 297 }),
  beatEveryMs: 5000,
  beatMs: [322, 536],
});

/** The first pc-path browser drives (canary-path-s1/-s2, 4209dad): TICK COST and pathFollow.cadence. */
export const CANARY_PC_S2 = Object.freeze({
  rttMs: [1, 6],
  landMs: [1, 4],
  probeMs: [2, 6],
  guideReadMs: [0, 3],
  probeTail: Object.freeze({ p: 0.02, ms: 45 }),
  beatEveryMs: 5000,
  beatMs: [225, 260],
});

/**
 * Run a lesson's pathref through the real reducer and the mirrored outer loop.
 * `start` overrides the spawn pose (centre, probe frame). Returns the plant,
 * the reducer's final state, the outer-tick samples in guidePose's shape and the
 * bursts' books.
 */
export function runBench({
  plan, start = null, plantOpts = {}, seed = 7, maxMs = 240_000, timing = CANARY_PC_S2, blackoutScale = 1,
  holdMode = "poll", disarmSkipAtRest = true, onSubTick = null, onFrame = null, stopAfterRouteEndMs = 3000, measured = null, runnerMs = BENCH.tickMs,
  disturbances = [], crashAt = null, tune = null, liftBeforeDisarm = false, disarmBrake = null,
} = {}) {
  // THE DISARM THIS BENCH DRIVES (2026-09-17): `disarmBrake: null` (the default) is the harness's — lesson-audit.mjs
  // disarmReverse with path-follow.mjs §10c (the stop-first wait watching the cluster, the pre-press read, the landing
  // that brakes only a car the assist has seen moving). `false` is the disarm as it stood at 424bb1f1 (W lifted on «D»,
  // nothing braking, nothing watched) and `true` §10b «W ENCLOSES S» inside that same flow — each kept only so what it
  // does stays measurable (path-follow-wiring.test.mjs W-17 pins the default to the harness).
  const disarmFlow = disarmBrake === null ? "landing" : "head";
  const R = rng(seed);
  const pick = ([lo, hi]) => lo + (hi - lo) * R();
  const seg0 = plan.segments[0];
  const sp = start ?? seg0.witnesses[0].startPose;
  const plant = createPlant({ x: sp.x, z: sp.z, psi: sp.psi, gear: "D", hudPhaseS: ((seed * 37) % 100) / 1000, noiseSeed: seed, ...plantOpts });
  plant.onFrame = onFrame;
  if (crashAt) plant.wall = { ...crashAt, hitAt: null };
  const dist = disturbances.map((d) => ({ ...d, stage: "armed" }));
  let state = createPathState(plan, tune ?? PATH_TUNE);
  if (seg0.gear === -1) state = { ...state, flags: { ...state.flags, atGearChange: true } };
  const now = () => plant.t * 1000;
  const t0 = now();
  const books = { samples: [], bursts: [], disarms: [], refusals: [], blindMs: [], steerAcrossYield: 0, subTicks: 0, phases: [], pressesAtRest: [], drains: [], runnerBudgets: [] };
  const flags = { ...state.flags };
  let phase = "roll";
  let phaseAt = now();
  let phaseTicks = 0;
  let lastTickAt = now();
  let lastBeatAt = now();
  let lastAbsKmh = null;
  let lastLeaveAt = null;
  let lastLeavePhase = null;
  const blindToEntry = [];
  const blindByPhase = {};
  // pathMeasured(): the p90 of the recent yield → entry gaps, as lesson-audit books them
  const measuredNow = () => {
    if (measured) return measured;
    const own = (blindByPhase[phase] ?? []).slice(-400);
    const recent = (own.length >= 5 ? own : blindToEntry.slice(-400)).slice().sort((a, b) => a - b);
    return { blindP90S: recent.length ? recent[Math.min(recent.length - 1, Math.floor(0.9 * (recent.length - 1)))] / 1000 : undefined };
  };
  const reverse = { armed: false, attempted: 0, disarmed: undefined, blocked: null };
  const call = () => advance(plant, pick(timing.rttMs));
  const press = (keys) => { sendKeys(plant, keys, pick(timing.landMs)); call(); };
  const sChannel = (down) => { if (sentKeys(plant).S !== down) press({ S: down }); };
  const throttle = (down) => { if (sentKeys(plant).W !== down) press({ W: down }); };
  const brake = (down, kmh = null) => {
    if (sentKeys(plant).S === down) return;
    if (down && kmh !== null && kmh >= 0 && kmh <= 1) return; // lesson-audit.mjs brake()'s refusal, verbatim
    press({ S: down });
  };
  const steer = (dir) => { const k = dir === "right" ? 1 : dir === "left" ? -1 : 0; if (sentKeys(plant).steer !== k) press({ steer: k }); };
  const gearRead = () => { call(); return [hudGear(plant)]; };
  const speedNow = () => { call(); return hudDialKmh(plant); };
  const heldNow = () => { const k = sentKeys(plant); return { W: k.W, S: k.S, steer: k.steer > 0 ? "right" : k.steer < 0 ? "left" : null }; };
  // the steer edge sequence lesson-audit.mjs's executor books: one per steer key change, stamped when it resolved
  const edge = { seq: 0, atMs: null };
  /** THE EXECUTOR — lesson-audit.mjs `pathActuate`'s counterpart; nothing is decided here. */
  const actuate = (actions) => {
    for (const a of actions) {
      if (a.ch === "steer") {
        steer(a.dir);
        edge.seq += 1;
        edge.atMs = now();
      } else if (a.ch === "W") throttle(a.down);
      else if (a.ch === "S-accel") sChannel(a.down);
      // the disarm brake (path-follow.mjs §10b): the S key through the deliberate standstill
      // helper, because brake() refuses every press at <= 1 km/h and this one lands at rest by design
      else if (a.ch === "S-hold") sChannel(a.down);
      else if (a.ch === "S-brake") {
        if (a.down) brake(true, a.kmh);
        else brake(false);
      } else throw new Error(`path-bench actuate: unknown action channel ${JSON.stringify(a.ch)} — refusing to drop a key decision it cannot execute`);
    }
  };
  const wait = (ms) => advance(plant, ms);
  let probeKmh = 0;
  let probeCrash = false;
  const sample = (ph) => {
    advance(plant, pick(timing.guideReadMs ?? [0, 0]));
    const c = plantCentre(plant);
    // guidePose writes the OUTER probe's p.kmh, read at the start of the tick
    books.samples.push({ tSec: Math.round((now() - t0) / 1000), kmh: probeKmh, dtMs: Math.round(now() - lastTickAt), wx: Number(c.x.toFixed(2)), wz: Number(c.z.toFixed(2)), loop: false, phase: ph });
  };
  const selectorHold = (want, onLand) => {
    const t = now();
    while (now() - t < BENCH.reverseHoldMs) {
      wait(BENCH.armPollMs);
      const g = gearRead();
      if (g[0] === want) {
        onLand(false);
        return g;
      }
    }
    return gearRead();
  };
  // lesson-audit.mjs pathFramesSince: the RAW timestamps (ms) of the frames the page rendered after
  // the brake key landed — every frame INCLUDED, the first one too — collected until `brakeReadOf`
  // (the one verdict both executors use) is proven or maxMs passes; a timeout returns only the frames
  // it saw. A browser frame collected there READ the key (keyboard.down resolved before the evaluate
  // was sent); here that is a plant frame that began with S landed.
  const framesSince = (maxMs) => {
    const t = now();
    const times = [];
    let seen = plant.frame;
    let timedOut = true;
    while (now() - t < maxMs) {
      advance(plant, 1);
      if (plant.frame === seen) continue;
      seen = plant.frame;
      if (!plant.keys.S) continue;
      times.push(plant.ft * 1000);
      // the stop rule only (lesson-audit's page stops on the same two numbers); the verdict is the planner's
      if (brakeReadOf({ times }).proven) { timedOut = false; break; }
    }
    call(); // the evaluate's round trip, as every other page read here pays it
    return { times, timedOut };
  };
  // lesson-audit.mjs pathDisarmLand — UNWIRED THERE 2026-09-17, so run here ONLY with `disarmBrake: true`. «D» landed;
  // the SAME two planners (path-follow.mjs §10b, «W ENCLOSES S») decide every key; this only executes them in order,
  // gathers the frame timestamps and polls. On VehicleSim's pedal priority (pedalStep) its S brakes nothing under the
  // held W, and the car is driven forward until the hold gives up — as the product does (T6.7d).
  const disarmLand = () => {
    actuate(pathDisarmLandActions(heldNow()).actions);
    const t = now();
    const brakeRead = framesSince(DISARM_BRAKE.maxHoldS * 1000);
    for (;;) {
      const hold = pathDisarmHoldActions({ held: heldNow(), brakeRead, sinceLandS: (now() - t) / 1000, dialKmh: speedNow() });
      actuate(hold.actions);
      if (hold.done) break;
      wait(BENCH.armPollMs);
    }
  };
  // lesson-audit.mjs pathGearProbe: the cluster letter (the HUD's) and the car's own speed (the probe's) in ONE page read
  const gearProbe = () => { call(); return { gear: [hudGear(plant)], v: plant.v * 3.6, dial: hudDialKmh(plant) }; };
  // lesson-audit.mjs pathDispatchInOrder: the landing's pair SENT back to back in order, one round trip for both
  const dispatchInOrder = (actions) => {
    const land = pick(timing.landMs);
    for (const a of actions) {
      const key = a.ch === "W" ? "W" : a.ch === "S-hold" ? "S" : null;
      if (key === null) throw new Error(`path-bench dispatchInOrder: channel ${JSON.stringify(a.ch)} is not the landing's`);
      if (sentKeys(plant)[key] !== a.down) sendKeys(plant, { [key]: a.down }, land);
    }
    call();
  };
  // lesson-audit.mjs pathDisarmLanding (path-follow.mjs §10c): the SAME two planners decide every key; this executes and polls
  const disarmLanding = (read, firstPress) => {
    const landed = pathLandingActions({ held: heldNow(), read, firstPress });
    if (landed.dispatch === "in-order") dispatchInOrder(landed.actions);
    else actuate(landed.actions);
    const t = now();
    let hold = landed;
    while (!hold.done) {
      wait(BENCH.armPollMs);
      const r = gearProbe();
      hold = pathLandingHoldActions({ held: heldNow(), v: r.v, gear: r.gear, sinceLandS: (now() - t) / 1000 });
      actuate(hold.actions);
    }
    books.disarms[books.disarms.length - 1]?.landings.push({ brake: landed.brake, firstPress, v: read.v, why: landed.why });
  };
  // lesson-audit.mjs pathDisarmHold: ARM_POLL_MS, then the cluster and the speed; land on «D» — the final read too
  const disarmHold = (firstPress) => {
    const t = now();
    while (now() - t < BENCH.reverseHoldMs) {
      wait(BENCH.armPollMs);
      const r = gearProbe();
      if (r.gear[0] === "D") {
        disarmLanding(r, firstPress);
        return r.gear;
      }
    }
    const r = gearProbe();
    if (r.gear[0] === "D") disarmLanding(r, firstPress);
    return r.gear;
  };
  const syncFlags = () => Object.assign(flags, state.flags);

  // lesson-audit.mjs pathApply / pathYield: the SAME planners, this plant's executor
  const pathApply = (cmd, obs) => actuate(pathApplyActions(cmd, { phase, held: heldNow(), vAbs: Math.abs(obs?.v ?? 0), dialKmh: obs?.dialKmh }).actions);
  const pathYield = () => {
    actuate(pathYieldActions({ phase, held: heldNow(), latch: state.latch, mode: state.mode, vAbs: Math.abs(state.last?.v ?? 0) }).actions);
    state = pathYieldState(state);
  };
  const pathRun = (baseMs) => {
    const enteredAt = now();
    if (lastLeaveAt !== null) {
      blindToEntry.push(now() - lastLeaveAt);
      if (lastLeavePhase === phase) (blindByPhase[phase] ??= []).push(now() - lastLeaveAt);
    }
    const m = measuredNow();
    state = pathRunnerEntry(state, m, baseMs);
    let entry = true;
    let lastSubAt = null;
    try {
      // THE BUDGET IS THE LIB'S (pathRunnerBudgetMs), re-read every sub-tick, exactly as lesson-audit's runner reads it
      while (now() - enteredAt < pathRunnerBudgetMs(state, baseMs) && !state.done) {
        const until = enteredAt + pathRunnerBudgetMs(state, baseMs);
        const t = now();
        call();
        // A PAGE STALL (DISTURBANCE): the evaluate blocks while the page renders a card,
        // and every key stays exactly as it was (canary-path-s2 sc-park-left, ledger rtt 538 ms).
        const stall = dist.find((d) => d.stage === "stall-next");
        if (stall) {
          // the page renders the card in slow frames: world time runs at worldRate of the wall
          // (canary-path-s2 sc-park-left: 0.28 m in 553 ms at 3.7 km/h ⇒ ≈ 0.5)
          const rate = Number.isFinite(stall.worldRate) ? stall.worldRate : 1;
          plant.extraDecelMps2 = Number.isFinite(stall.decelMps2) ? stall.decelMps2 : 0;
          advance(plant, stall.stallMs * rate);
          plant.extraDecelMps2 = 0;
          const frozen = (stall.stallMs * (1 - rate)) / 1000;
          plant.t += frozen;
          plant.ft += frozen;
          stall.stage = "drain-next";
        }
        const read = readPlant(plant);
        const rtt = now() - t;
        const obs = pathObservation(read, {
          wallMs: now(), rttMs: rtt, phase, hz: null, untilMs: until, entry, disarmed: reverse.disarmed,
          held: heldNow(), heldS: lastSubAt === null ? null : (t - lastSubAt) / 1000, blindP90S: m.blindP90S, edge,
          crash: probeCrash,
        });
        const step = pathStep(state, obs);
        entry = false;
        lastSubAt = t;
        books.subTicks += 1;
        if (step.state.refusals.length > state.refusals.length) books.refusals.push(step.state.refusals[step.state.refusals.length - 1]);
        state = step.state;
        syncFlags();
        lastAbsKmh = Math.abs(obs.v);
        pathApply(step.cmd, obs);
        if (onSubTick) onSubTick({ state, cmd: step.cmd, row: step.row, plant, phase });
        for (const d of dist) {
          const seg = state.plan.segments[state.segIndex];
          if (d.stage === "armed" && seg?.k === d.k && state.mode === "reverse-follow" && Number.isFinite(step.row.toEnd) && step.row.toEnd <= d.toEndM) d.stage = "stall-next";
        }
        if (step.cmd.returnNow) break;
        wait(Math.max(0, PATH_TUNE.runner.pollMs - (now() - t)));
      }
    } finally {
      pathYield();
      lastLeaveAt = now();
      lastLeavePhase = phase;
    }
  };

  const armReverse = () => {
    const burst = { segIndex: state.segIndex, presses: 0, ok: false };
    books.bursts.push(burst);
    if (gearRead()[0] === "R") { burst.ok = true; return true; }
    for (let attempt = 1; attempt <= BENCH.armAttempts; attempt++) {
      reverse.attempted += 1;
      throttle(false);
      sChannel(false);
      wait(BENCH.reverseLiftMs);
      const still = speedNow();
      let g;
      if (still !== 0) {
        g = gearRead();
        if (g[0] !== "R") continue;
      } else {
        books.pressesAtRest.push({ kmh: Math.abs(plant.v) * 3.6, gear: plant.gear, key: "S" });
        sChannel(true);
        burst.presses += 1;
        if (holdMode === "poll") g = selectorHold("R", sChannel);
        else { wait(BENCH.reverseHoldMs); g = gearRead(); }
      }
      if (g[0] === "R") { burst.ok = true; return true; }
      sChannel(false);
    }
    if (gearRead()[0] === "R") { burst.ok = true; return true; }
    return false;
  };
  const disarmReverse = () => {
    const entry = { segIndex: state.segIndex, ok: false, skippedStopPress: false, landings: [] };
    books.disarms.push(entry);
    const atRest = speedNow() === 0;
    const watch = holdMode === "poll" && disarmFlow === "landing";
    let stopFirstRan = false;
    let landedStopFirst = false;
    if (!(disarmSkipAtRest && atRest)) {
      stopFirstRan = true;
      // liftBeforeDisarm: HEAD 4209dad's end state — the functional brake lifted at rest (the R hold
      // of 2026-09-15 keeps it down, which on its own turns this press into a no-op)
      if (liftBeforeDisarm) {
        throttle(false);
        wait(BENCH.reverseLiftMs);
      }
      sChannel(false);
      throttle(true);
      for (let i = 0; i < 8; i++) {
        wait(600);
        // lesson-audit.mjs: on a pc-path leg the dial read that ends the wait is pathGearProbe (cluster, speed and dial in
        // one read), and «D» there lands the flipping press (§10c)
        if (watch) {
          const r = gearProbe();
          if (r.gear[0] === "D") {
            disarmLanding(r, true);
            landedStopFirst = true;
            break;
          }
          if (r.dial === 0) break;
        } else if (speedNow() === 0) break;
      }
    } else entry.skippedStopPress = true;
    if ((landedStopFirst ? 0 : speedNow()) !== 0) { reverse.disarmed = false; throttle(false); return false; }
    for (let attempt = 1; attempt <= BENCH.armAttempts; attempt++) {
      throttle(false);
      wait(BENCH.reverseLiftMs);
      // lesson-audit.mjs: after a stop-first landing the gear is D — attempt 1 presses nothing and reads the cluster
      const pressAgain = !(landedStopFirst && attempt === 1);
      if (pressAgain) {
        throttle(true);
        // THE HARNESS'S LANDING (lesson-audit.mjs pathDisarmHold, path-follow.mjs §10c) by default; `disarmBrake: false`
        // is cde40a6's W lift on «D» and `true` the unwired §10b landing, both in the flow as it stood at 424bb1f1
        // (path-follow-wiring.test.mjs W-17 pins this default to the harness)
        if (holdMode === "poll") {
          if (disarmFlow === "landing") disarmHold(attempt === 1 && !stopFirstRan);
          else selectorHold("D", disarmBrake ? disarmLand : throttle);
        } else wait(BENCH.reverseHoldMs);
      }
      throttle(false);
      if (gearRead()[0] === "D") {
        reverse.disarmed = true;
        entry.ok = true;
        return true;
      }
    }
    reverse.disarmed = false;
    return false;
  };

  let routeEndAt = null;
  while (now() - t0 < maxMs) {
    const tickStart = now();
    // ── the probe (a blind cost) ──
    advance(plant, pick(timing.probeMs) + (R() < timing.probeTail.p ? timing.probeTail.ms * blackoutScale : 0));
    const p = { kmh: hudDialKmh(plant), gear: [hudGear(plant)] };
    probeKmh = p.kmh;
    // the product's crash-pinned banner as the OUTER probe reads it (a tick old for the runner)
    probeCrash = plant.wall != null && plant.wall.hitAt !== null && !plant.wall.released;
    // ── a pause layer on the glass (DISTURBANCE): lesson-audit's drain, verbatim in effect —
    // throttle up, the card cleared (the world KEEPS RUNNING: canary-path-s2 sc-park-left
    // moved 0.5 m through its 1147 ms drain), both pedals and the wheel lifted, the
    // reducer told (pathOnPauseDrain), and the tick `continue`s ──
    const drain = dist.find((d) => d.stage === "drain-next");
    if (drain) {
      throttle(false);
      advance(plant, drain.drainMs);
      if (sentKeys(plant).W) press({ W: false });
      if (sentKeys(plant).S) press({ S: false });
      steer(null);
      state = pathOnPauseDrain(state);
      syncFlags();
      drain.stage = "done";
      books.drains.push({ t: now() - t0, ms: drain.drainMs, stallMs: drain.stallMs, k: drain.k });
      lastTickAt = now();
      phaseAt = now();
      continue;
    }
    const tNow = now();
    // ── the arm gate (§7.2) ──
    if (phase !== "reverse" && p.kmh >= 0 && p.kmh <= 1 && flags.atGearChange === true && !(p.gear.length === 1 && p.gear[0] === "R") && reverse.blocked === null && reverse.attempted < BENCH.armBudget) {
      if (p.kmh !== 0) {
        throttle(false);
      } else if (armReverse()) {
        sChannel(false);
        reverse.armed = true;
        wait(pick(timing.beatMs) * blackoutScale); // shot("05r-reverse-R")
        steer(null); // guideLeaveRoll
        phase = "reverse";
        books.phases.push({ t: now() - t0, phase });
        phaseAt = now();
        phaseTicks = 0;
        lastTickAt = now();
        continue;
      }
    }
    // ── the phase branch ──
    if (phase === "roll") {
      sample("roll-path");
      phaseTicks += 1;
      if (flags.wantStop === true && phaseTicks >= 1) {
        steer(null); // guideLeaveRoll
        phase = "stop";
        books.phases.push({ t: now() - t0, phase });
        phaseAt = tNow;
        phaseTicks = 0;
      }
    } else if (phase === "stop") {
      phaseTicks += 1;
      sample("stop");
      throttle(false);
      brake(true, pathSafeKmh(p.kmh, lastAbsKmh));
      const atRest = p.kmh >= 0 && p.kmh <= 1;
      const exit = flags.stopRelease === true && flags.routeEnd !== true;
      if (atRest && tNow - phaseAt >= Math.round((state.currentStop?.dwellS ?? 0) * 1000) && phaseTicks >= BENCH.minPhaseTicks && exit) {
        phase = "roll";
        books.phases.push({ t: now() - t0, phase });
        phaseAt = tNow;
        phaseTicks = 0;
      } else if (!atRest && tNow - phaseAt >= BENCH.stopMs + 8000 && exit) {
        phase = "roll";
        books.phases.push({ t: now() - t0, phase: "roll (no rest)" });
        phaseAt = tNow;
        phaseTicks = 0;
      }
    } else if (phase === "reverse") {
      phaseTicks += 1;
      sample("reverse");
      if (!p.gear.includes("R")) {
        reverse.armed = false;
        sChannel(false);
        throttle(false);
        phase = "roll";
        books.phases.push({ t: now() - t0, phase: "roll (lost R)" });
        phaseAt = tNow;
        phaseTicks = 0;
      } else if (flags.segmentDone === true && flags.routeEnd !== true) {
        wait(pick(timing.beatMs) * blackoutScale); // shot("05r-reverse-end")
        disarmReverse();
        phase = "roll";
        books.phases.push({ t: now() - t0, phase });
        phaseAt = now();
        phaseTicks = 0;
        lastTickAt = now();
      }
    }
    // ── the beat, deferred to a steer-neutral instant (§5.4) ──
    if (now() - lastBeatAt >= timing.beatEveryMs && (flags.shutterOk === true || now() - lastBeatAt >= 3 * timing.beatEveryMs)) {
      lastBeatAt = now();
      if (sentKeys(plant).steer !== 0) books.steerAcrossYield += 1;
      advance(plant, pick(timing.beatMs) * blackoutScale);
    }
    books.blindMs.push(now() - tickStart);
    lastTickAt = now();
    if (state.done) break;
    // ── the idle: the runner ──
    if (sentKeys(plant).steer !== 0) books.steerAcrossYield += 1;
    pathRun(runnerMs);
    if (flags.routeEnd === true) {
      routeEndAt ??= now();
      if (now() - routeEndAt >= stopAfterRouteEndMs) break;
    }
  }
  books.blindToEntryMs = blindToEntry;
  return { plant, state, books: { ...books, follow: pathFollowBooks(state) }, reverse, phase, elapsedMs: now() - t0 };
}
