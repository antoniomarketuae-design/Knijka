// -----------------------------------------------------------------------------
// path-follow.mjs — THE pc-path LEG'S CONTROL LAW, ITS REDUCER AND ITS WORDS.
//
// Same contract as guidance.mjs, reverse-plan.mjs and hazard.mjs: PURE, no
// browser. The page side — reading `window.__camProbe`, pressing the keys,
// yielding at every outer operation — lives in lesson-audit.mjs behind
// `STEER_BY === "authored-path"`, and nowhere else.
//
// ═══ WHAT THIS IS, AND THE ONE POLICY POINT ══════════════════════════════════
//
// An INSTRUMENT, not a repair (memory `harness-change-is-not-a-repair.md`). A
// pc-path leg drives a committed, bicycle-consistent WITNESS of the lesson's
// own authored parking/reverse manoeuvre (`tools/mobile/path-refs/*.pathref.json`,
// planned offline by `path-plan/build-pathrefs.mjs`) with a real car, so a
// judge can see how the product GRADES that drive.
//
// ON THIS LEG, AND ONLY ON THIS LEG, THE DEV-ONLY `window.__camProbe` IS A
// CONTROL INPUT. lesson-audit.mjs's rule that the probe is a witness and never a
// control input (the blocks headed «WHY THE PIXELS, WHEN A CHEAPER SIGNAL EXISTS»
// and «THE INDEX IS AN ODOMETER») is NOT rewritten: each carries a pointer here,
// and the exception was RATIFIED by the founder on 2026-09-22, for pc-path legs
// only (DESIGN-v2 §14.2; docs/simulation/93_INSTRUMENT_GAPS.md RULING-1). The price
// is `PATH_TESTIMONY.mayNotTestify`, printed first on every artefact.
//
// ═══ FRAMES ══════════════════════════════════════════════════════════════════
//
// Everything is in the PROBE frame (x, z), ψ 0 = north = −z, clockwise +:
//   heading h(ψ) = (sin ψ, −cos ψ), right r(ψ) = (cos ψ, sin ψ).
// `u` ∈ [−1, 1] is the wheel fraction, + = right = KeyD. Cross-track + = right.
// -----------------------------------------------------------------------------
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VEHICLE, maxSteerAtKmh, yawGainAtKmh } from "./guidance.mjs";
import { SIGN_CONVICT_AFTER_M, SIGN_CONVICT_MIN_DEG } from "./reverse-plan.mjs";
import { samplesDigest } from "./path-plan/geom.mjs";
import { ACQUISITION, ARM_ROLL_ALLOW_M, D_FLOOR_KMH, REST_BACK_M, R_BAND_KMH } from "./path-plan/policy.mjs";
import { DRIVE_CLEARANCE_FLOOR_M, bodyClearanceGuard, driveClearanceGate } from "./drive-clearance.mjs";
import { BODY_FLOOR_M, witnessBodyVerdict } from "./path-plan/body-screen.mjs";
export { movingMedianProfile } from "./path-plan/build-pathrefs.mjs";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const L = VEHICLE.WHEELBASE_M;
const A = VEHICLE.WHEELBASE_M / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v ?? null);
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v ?? null);

/* ═══════════════════════════════════════════════════════════════════════════
 * §0 WHAT A pc-path LEG MAY AND MAY NOT TESTIFY ABOUT
 * ═══════════════════════════════════════════════════════════════════════════ */

export const PATH_TESTIMONY = Object.freeze({
  mayTestify: Object.freeze([
    "whether the product CREDITS a reverse or forward park, a zone or a gear change reached along a witness of the lesson's authored line — objective ticks, «подравняване», «ъгъл»",
    "faults booked on that drive, NET OF ATTRIBUTION (procedural omissions and harness timing/actuation are the harness's)",
    "collisions on that drive, as CANDIDATES only — the authored line's clearance was never screened",
    "HUD, ReverseAssist flow, cards and debrief during a correct manoeuvre",
  ]),
  mayNotTestify: Object.freeze([
    "that the guidance ribbon, the chevron, the briefing or the glass would lead a student onto that line",
    "legibility, lane choice or route-keeping of any kind — the car is on the authored line BY CONSTRUCTION",
    "anything about a student in the spawn lane (corridor caveats)",
    "the clearance of the authored line itself",
    "pass rates, determinism or cross-platform parity",
    "a wrong drive, or any conviction that needs one",
    "production builds (the pose probe is DEV-ONLY), mobile or touch",
  ]),
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 TUNING — every number has a cite in DESIGN-v2 or DESIGN-v2-CHECK
 * ═══════════════════════════════════════════════════════════════════════════ */

export const PATH_TUNE = Object.freeze({
  // nearLockBudgetMs: the runner's budget while a reverse segment is lock-limited (§5.2 +
  // 2026-09-15). MEASURED on the calibrated bench, 20 seeds: 500 → 1000 ms moved the saturated
  // turning 0.888/0.893 → 0.905/0.907 (sc-park-left/-wall) and sc-park-wall's last-third p90
  // 0.267 → 0.226 m. 2000 ms is NOT rejected for tracking — re-measured 2026-09-16 on the
  // re-planned witnesses it tracks TIGHTER than 1000 ms (sc-park-wall seeds 1–8, last-third
  // p90 0.161 vs 0.178 m) — but for the reverse's INDEPENDENT route: through the canary's card
  // it leaves 4–6 moving outer-tick samples against routeDeviation's floor of 5 (sc-park-left
  // seeds 1–3), UNMEASURED on at least one, where 1000 ms leaves 8–9. path-follow.test.mjs
  // T13.4b asserts both halves. See pathRunnerBudgetMs.
  runner: Object.freeze({ pollMs: 50, statsEvery: 40, nearLockBudgetMs: 1000 }),
  // A reverse segment is NEAR LOCK where its witness asks for ≥ frac of the wheel's lock
  // within the next max(aheadM, aheadS·|v|) of arc, or the command is saturated.
  nearLock: Object.freeze({ frac: 0.9, aheadM: 1.0, aheadS: 1.0 }),
  delay: Object.freeze({ poseS: 0.033, ioS: 0.015, periodS: 0.05, rateS: 0.05 }),
  lookahead: Object.freeze({ fwdMinM: 3.0, fwdMaxM: 8.0, revMinM: 1.5, revMaxM: 3.0, factor: 3.6, pmFloorD: 0.28, cutMaxM: 0.25, rAheadWindowM: 10 }),
  // THE TERMINAL HEADING LAW (2026-09-21) — terminalHeadingGate / terminalHeadingCommand. On a reverse
  // whose unreached tail turns toward the segment's authored end heading, the command hands over from
  // rear pursuit to the curvature that closes the heading error by the end: none at `startM` from the
  // witness end, all of it from `fullM` on; `dMinM` floors the distance that curvature is spread over
  // (≈ the R stop trigger, 0.47 m — below it the car is braking). MEASURED on the calibrated bench,
  // 8 driven parking lessons × seeds 1–20: startM 1.5 / fullM 0.5 leaves sc-park-gap-short 13/20 in the
  // box (worst 11.1°); 2.0 / 1.0 puts it 20/20 (worst 9.5°) and costs no lesson a pass, a body
  // clearance or a corridor. What it spends: sc-park-45-rev's lengthwise box margin 0.129 → 0.114 m,
  // sc-pk-driveway's 0.119 → 0.116 m, and sc-park-gap-short's lateral 0.264 → 0.212 m (for 13.9° →
  // 9.5° of heading). `on: false` is the law as it stood before — kept only so the T9.h mutation can
  // measure what the hand-over buys. The figures above are the law ALONE. Shipped together with the micro
  // square-up (squareUpCommand), re-measured 2026-09-21 on the same bench and seeds: gap-short worst 5.48°
  // (20/20), lateral box margin 0.082 m, lengthwise 0.375 m; no other lesson loses a pass, a clearance or a
  // corridor (the SQD case pins gap-short's heading on seeds 7–10).
  terminal: Object.freeze({ on: true, startM: 2.0, fullM: 1.0, dMinM: 0.5 }),
  pedals: Object.freeze({
    landS: 0.1, aMaxMps2: 3, pressMarginKmh: 0.5,
    wOnBelowKmh: 0.8, trimOverKmh: 2.0, trimReleaseKmh: 0.5,
    brakeAttackDS: 0.25, brakeAttackRS: 0.35, wReleaseHalfS: 0.125, sReleaseHalfS: 0.1,
    aCoastMps2: 0.23, aPlanMps2: 1.0, envNearM: 3.0, envNearKmh: 5, capKmh: 18,
    restKmh: 0.3, restS: 0.5, measureBrakeRange: Object.freeze([2.0, 8.8]),
    // THE R HOLD PRESS (2026-09-15). The lowest |v| at which a FRESH functional-brake (W)
    // press is sent in R once the car must stop and stay stopped. ReverseAssist arms a
    // direction toggle only on a press whose rising edge meets a car that has ALREADY stood
    // below REVERSE_ASSIST_STANDSTILL_KMH 0.6 with the pedal lifted for
    // REVERSE_ASSIST_LIFT_S 0.25 s (reverseAssist.ts:143, :155, :231-262: `liftS` accrues only
    // while stopped, `armed` is decided once, at the rising edge); a press that starts while
    // moving is disarmed for as long as it is held. A press sent while the car moves at
    // ≥ 0.8 km/h (above 0.6, with the dial reading ≥ 1) reaches its rising edge within τ_land
    // 0.1 s + ≤ 35 ms of THROTTLE_ATTACK_S ramp to the 0.1 pedal threshold + ≤ 17 ms of frame
    // — under 0.25 s even if an impact stops the car the instant it is sent — so LAW 1 cannot
    // arm it, and holding it through rest is the Б2 hold the product protects. PRESS_MIN (2.58)
    // stays the TRIGGER model's branch point. 0.8, not higher: the product's crash pin let
    // canary-path-s2 sc-park-left creep at 0.5–1 km/h, and a car creeping under the gate is a
    // car rolling past its end unbraked.
    rHoldPressMinKmh: 0.8,
  }),
  // overrunM: a reverse that passes its witness end by more than this is refusal `end-overrun`
  // — half the product's 0.5 m lengthwise tolerance for these bays (policy.mjs PRODUCT
  // centerTolM; path-follow productBoxPrediction lonTol), and 2.5× the brake model's
  // worst stop error (+0.09 m, DESIGN-v2 §6.4).
  // yawCreep*: THE HEADING RE-APPROACH (yawReapproach, 2026-09-22). A gear-change rest whose along
  // and lat are accepted but whose yaw lies outside the arm band by at most yawCreepMaxDeg creeps
  // forward about yawCreepM (never within yawCreepEndMarginM of the acceptance's far edge, never
  // less than yawCreepMinM) steering toward the band's centre heading, and is judged again.
  stops: Object.freeze({ noRestReleaseMs: 11_000, acceptDwellMaxS: 1.0, creepAttempts: 2, creepKmh: 3.0, microSkipM: 0.2, captureKmh: 0.2, captureS: 0.5, captureHoldMinS: 1.5, settleKmh: 0.3, settleS: 0.2, settleMaxS: 1.5, overrunM: 0.25, yawCreepMaxDeg: 2.0, yawCreepM: 0.6, yawCreepMinM: 0.3, yawCreepEndMarginM: 0.25 }),
  // IMPACT: a deceleration no pedal the harness holds can produce. Coast measures
  // 0.20–0.25 m/s² and the band throttle cycle ±1.4 m/s² on the four canary drives
  // (pathFollow.aCoastMeas; _audit-path.json v); the product's crawl-capped brake is
  // 5.3 m/s² but only while W is down. canary-path-s2 sc-park-left read 2.7, 4.5, 5.3 m/s²
  // on three consecutive reads with no pedal down — the neighbour's door.
  // hardMps2: ONE read at the product's full 0.9 g brake with no brake down is an impact by itself
  // (a car pinned in one frame leaves a single read between moving and rest)
  impact: Object.freeze({ decelMps2: 2.5, reads: 2, hardMps2: 8.8, minKmh: 1.0, minDtMs: 20 }),
  // THE BODY-CLEARANCE REFUSAL (drive-clearance.mjs `bodyClearanceGuard`) — what replaced
  // `bay-lateral` on 2026-09-16. `refuse: false` only to measure tracking without it, and to
  // declare a fixture whose plan names no district (a synthetic bench plan has no bodies to
  // read, and this guard REFUSES what it cannot read rather than driving on unread).
  //
  // THERE IS NO FLOOR KNOB HERE ON PURPOSE. The floor is drive-clearance.mjs's
  // DRIVE_CLEARANCE_FLOOR_M and is not tunable from the follower, because the ONLY reason
  // this guard can be trusted is that it is the same number, the same bodies and the same
  // geometry canary gate G10 judges the finished drive by. A follower-side floor would be a
  // third opinion, which is how `bay-lateral`'s margin came to be swept in the first place.
  clearance: Object.freeze({ refuse: true }),
  // THE WITNESS'S OWN BODY CLEARANCE, read off the pathref before the car moves
  // (2026-09-16). The in-bay refusal above catches a car that is ALREADY going wide;
  // this refuses a PLAN that was never survivable — the sc-park-left seg-1 witness the
  // canary drove crosses `lotlf-bay-4` by 0.16 m for the model that bay mounts, and the
  // drive followed it to 0.014–0.088 m and hit that car. `floorM` is the builder's floor
  // (body-screen.mjs BODY_FLOOR_M), so a witness the builder would refuse to emit is
  // also refused if it is already on disk.
  //   refuseUnsafe     — a witness whose recorded clearance is under floorM.
  //   refuseUnscreened — a witness with NO recorded clearance. Default TRUE since the
  //     2026-09-16 re-plan. It was FALSE for one afternoon, on the reasoning that every
  //     pathref predated the screen so refusing the unscreened would refuse every leg.
  //     THE RE-PLAN INVERTED THAT ARGUMENT. `build-pathrefs` wrote 5 lessons and REFUSED
  //     6, and a refusal deliberately leaves the previous file untouched — so the only
  //     pathrefs still carrying no clearance record are precisely the six the screen
  //     threw out: sc-park-left, sc-park-gap-short, sc-park-van, sc-park-zebra,
  //     sc-park-wall, sc-park-bay-exit-rev. "Unscreened" and "known to cross a parked
  //     car" are now the SAME SET, so FALSE would let exactly the unsafe six drive.
  //     Fail closed: a plan nobody has screened is not evidence about the product, and
  //     a drive that follows one books a collision the harness itself caused.
  //     Re-planning those six with obstacle avoidance is what turns this back into a
  //     no-op; lowering the floor is not.
  witnessBody: Object.freeze({ refuseUnsafe: true, refuseUnscreened: true, floorM: BODY_FLOOR_M }),
  lost: Object.freeze({ fwdM: 1.5, fwdSlowM: 0.6, fwdSlowKmh: 5, revM: 1.0, consecutive: 2 }),
  stall: Object.freeze({ returnMs: 1000, refuseMs: 3000, entries: 2 }),
  frozen: Object.freeze({ ms: 1500, cm: 1 }),
  yaw: Object.freeze({ minLeverM: 0.2, suspectDeg: 3, suspectTravelM: 1.0, suspectMaxKappa: 0.1, suspectMaxU: 0.05, suspectMinKmh: 3, movingKmh: 0.5 }),
  shutter: Object.freeze({ straightRM: 50, ctM: 0.3, yawDeg: 3, minWindowM: 2, windowS: 0.6 }),
  modulator: Object.freeze({ gapQuanta: 2 }),
  // THE MICRO SQUARE-UP'S HEADING LAW (squareUpCommand, 2026-09-21). floorM: the least
  // distance-to-go the law divides the heading error by. Below it the law asks for the
  // curvature that would close the error in floorM, so an error of 2.3 deg or more is full
  // lock and 1 deg is about half, and a 0.1 deg residue at the very end does not whip the
  // wheel to lock.
  squareUp: Object.freeze({ floorM: 0.15 }),
  landing: Object.freeze({ maxSamples: 5, windowMs: 300, isolateMs: 300, minKmh: 3, departDeg: 0.24, maxReadLagMs: 100 }),
});

/**
 * PRESS_MIN (DESIGN-v2 §6.3): a press issued at ≥ PRESS_MIN lands at > 1 km/h even
 * after the PEDAL landing time τ_land at 3 m/s². ONE constant for the whole reducer —
 * the grammar, the refused step and the reverse settle all read it from the tune.
 * NOTHING MEASURED AT RUN TIME FEEDS IT (CODE-REVIEW-1 M1): the only landing figure
 * the runner measures is a STEERING yaw response (`foldSteerLanding`), which at a
 * crawl is 70–150 ms of low-pass and rate limit before any latency, and feeding it
 * here took PRESS_MIN to 4.2–4.7 km/h — above the whole R band — so every stop
 * latched the coast branch.
 */
export const pressMinFor = (p = PATH_TUNE.pedals) => 1 + 3.6 * p.aMaxMps2 * p.landS + p.pressMarginKmh;
export const PRESS_MIN_KMH = pressMinFor();

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 FRAMES AND YAW (DESIGN-v2 §3)
 * ═══════════════════════════════════════════════════════════════════════════ */

export const wrapDeg = (d) => {
  let r = ((((d + 180) % 360) + 360) % 360) - 180;
  if (r === -180) r = 180;
  return r;
};
export const wrap360 = (d) => ((d % 360) + 360) % 360;
/** Unit heading in the probe frame. */
export const headingUnit = (psi) => ({ x: Math.sin(psi * RAD), z: -Math.cos(psi * RAD) });
/** Unit right-of-heading in the probe frame. */
export const rightUnit = (psi) => ({ x: Math.cos(psi * RAD), z: Math.sin(psi * RAD) });
/** ψ of a probe-frame displacement. */
export const bearingDeg = (dx, dz) => wrap360(Math.atan2(dx, -dz) * DEG);
const cross = (ax, az, bx, bz) => ax * bz - az * bx;

/**
 * PRIMARY YAW. `probeLocal = (cam − pos)·quat⁻¹` (CameraRig.tsx:1231), so the
 * car-local offset L = (localX, localZ) and the world offset W = (camX −
 * chassisX, camZ − chassisZ) are ONE vector in two frames. For three.js Ry(θ):
 * Wx = Lx cos θ + Lz sin θ, Wz = −Lx sin θ + Lz cos θ, so θ is exact for any
 * camera position (sway, lerp and head yaw move L and W together), valid at
 * standstill, and chassis +Z forward gives ψ = 180° − θ.
 */
export function yawFromCamOffset({ lx, lz, wx, wz }, tune = PATH_TUNE.yaw) {
  if (![lx, lz, wx, wz].every(Number.isFinite)) return { valid: false, psi: null, why: "a component is not a number" };
  if (Math.hypot(lx, lz) < tune.minLeverM || Math.hypot(wx, wz) < tune.minLeverM) return { valid: false, psi: null, why: "the horizontal camera lever is under 0.2 m" };
  const theta = Math.atan2(lz * wx - lx * wz, lx * wx + lz * wz) * DEG;
  return { valid: true, psi: wrap360(180 - theta), thetaDeg: theta };
}

/**
 * CROSS-CHECK AND FALLBACK. For a mid-wheelbase bicycle the centre moves at
 * β = atan(tan δ / 2) off its heading, so a plain motion tangent is wrong by β
 * whenever the wheel is turned (8.8° at δ 0.3, 18.9° at lock). Three centre
 * poses ≥ d apart give the tangent at the newest and the signed curvature κ̂
 * (+ right); sin β = sign(v)·a·κ̂ holds in both gears.
 */
export function betaTangentYaw(p0, p1, p2, v, a = A) {
  const s01 = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const s12 = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  if (!(s01 > 1e-6 && s12 > 1e-6) || !Number.isFinite(v) || Math.abs(v) <= PATH_TUNE.yaw.movingKmh) return null;
  const b01 = bearingDeg(p1.x - p0.x, p1.z - p0.z);
  const b12 = bearingDeg(p2.x - p1.x, p2.z - p1.z);
  const dth = wrapDeg(b12 - b01);
  const bm = b12 + (dth * s12) / (s01 + s12);
  const kappa = (dth * RAD) / ((s01 + s12) / 2);
  const beta = Math.asin(clamp(Math.sign(v) * a * kappa, -0.5, 0.5)) * DEG;
  const psi = v > 0 ? bm - beta : bm - 180 - beta;
  return { psi: wrap360(psi), kappa, betaDeg: beta, plainTangent: wrap360(v > 0 ? bm : bm - 180) };
}

export function createYawState() {
  return {
    history: [], psi: null, source: "none", suspect: false,
    disagreeM: 0, lastPose: null,
    bins: [
      { lo: 0, hi: 0.02, n: 0, sumAbs: 0, max: 0 },
      { lo: 0.02, hi: 0.1, n: 0, sumAbs: 0, max: 0 },
      { lo: 0.1, hi: 0.26, n: 0, sumAbs: 0, max: 0 },
    ],
    rest: { n: 0, sum: 0, sumSq: 0, stds: [] },
  };
}

/** Reset at every segment start and gear change, so the first reverse bearing is never built from forward poses (C-M2). */
export function resetYawHistory(state) {
  return { ...state, history: [], disagreeM: 0, suspectWin: null, lastPose: null, rest: { ...state.rest, n: 0, sum: 0, sumSq: 0 } };
}

/**
 * FUSION. Cam yaw when valid; else the β-tangent while moving; else held. The
 * two sources are compared on straight moving travel, and a > 3° disagreement
 * over ≥ 1 m latches `suspect`: from then on END POSE yaw is UNMEASURED.
 */
export function foldYaw(state, { cam, pose, v, u = null }, tune = PATH_TUNE.yaw) {
  const s = { ...state, history: state.history.slice(-8) };
  let beta = null;
  let pushed = false;
  if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.z)) {
    const d = clamp(0.3 * (Math.abs(v ?? 0) / 3.6), 0.3, 1.5);
    const last = s.history[s.history.length - 1];
    if (!last || Math.hypot(pose.x - last.x, pose.z - last.z) >= d) {
      // The cam yaw AT this pose rides along: the β-tangent is the heading at p2, so
      // it is compared with the camera at p2 — never with a camera that has turned
      // on for up to `d` metres since (a 4° lag on a 4 m arc, measured on the T9 bench).
      s.history.push({ x: pose.x, z: pose.z, camPsi: cam && cam.valid ? cam.psi : null, u: Number.isFinite(u) ? Math.abs(u) : null });
      pushed = true;
    }
    if (s.history.length >= 3) {
      const [p0, p1, p2] = s.history.slice(-3);
      beta = betaTangentYaw(p0, p1, p2, v);
    }
  }
  let psi = s.psi;
  let source = s.source;
  if (cam && cam.valid) {
    psi = cam.psi;
    source = "cam";
  } else if (beta) {
    psi = beta.psi;
    source = "beta-tangent";
  } else if (psi !== null) {
    source = "held";
  }
  const p2 = s.history[s.history.length - 1];
  const p1 = s.history[s.history.length - 2];
  // "Straight" is also what was COMMANDED, and forward at ≥ 3 km/h: a keyboard wheel
  // is a sawtooth, so three poses on a 4 m arc can average to |κ̂| < 0.1 while β at p2
  // is 15°, and in R at a crawl the 0.3 m chords turn a u = 0.13 sawtooth into a 4.8°
  // mean (both measured on the T9 bench). The approaches give ≥ 100 m of evidence.
  const straightCmd = s.history.slice(-3).every((h) => h.u === null || h.u === undefined || h.u <= tune.suspectMaxU);
  if (pushed && beta && Number.isFinite(p2?.camPsi) && p1 && Math.abs(beta.kappa) < tune.suspectMaxKappa && straightCmd && (v ?? 0) >= tune.suspectMinKmh) {
    const step = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const signed = wrapDeg(p2.camPsi - beta.psi);
    const diff = Math.abs(signed);
    const bin = s.bins.find((b) => Math.abs(beta.kappa) >= b.lo && Math.abs(beta.kappa) < b.hi);
    if (bin) {
      bin.n += 1;
      bin.sumAbs += diff;
      bin.max = Math.max(bin.max, diff);
    }
    // A DISAGREEMENT, NOT A SPREAD. The β-tangent of a keyboard-steered centre is
    // noisy (a ±0.05 rad wheel sawtooth swings β by ±1.4° and κ̂ by more), so the
    // latch reads the travel-weighted MEAN signed difference over ≥ 1 m of straight
    // travel: a mirrored or offset camera yaw is systematic and survives the mean;
    // estimator noise does not.
    const w = s.suspectWin ?? { m: 0, sum: 0 };
    s.suspectWin = { m: w.m + step, sum: w.sum + signed * step };
    s.disagreeM = Math.abs(s.suspectWin.sum / Math.max(1e-9, s.suspectWin.m)) > tune.suspectDeg ? s.suspectWin.m : 0;
    if (s.suspectWin.m >= tune.suspectTravelM) {
      if (Math.abs(s.suspectWin.sum / s.suspectWin.m) > tune.suspectDeg) s.suspect = true;
      s.suspectWin = null;
    }
  } else if (pushed) {
    s.suspectWin = null;
  }
  if (cam && cam.valid && Math.abs(v ?? 0) <= 0.3) {
    s.rest = { ...s.rest, n: s.rest.n + 1, sum: s.rest.sum + cam.psi, sumSq: s.rest.sumSq + cam.psi * cam.psi };
  }
  s.lastPose = pose ?? s.lastPose;
  s.psi = psi;
  s.source = source;
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 THE REFERENCE: LOADING, POLYLINES, CURSOR (DESIGN-v2 §2, §3.4)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** An error that carries the refusal code lesson-audit prints (§1.2 refusal 4). */
export function pathRefError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Load and pin the committed witness. Throws `no-pathref` or `reference-stale`;
 * lesson-audit turns either into EXIT_USAGE before `mkdirSync(OUT)`.
 */
export function loadPathRef(scenario, repoRoot) {
  const refPath = resolve(repoRoot, "tools", "mobile", "path-refs", `${scenario}.pathref.json`);
  if (!existsSync(refPath)) throw pathRefError("no-pathref", `no-pathref: tools/mobile/path-refs/${scenario}.pathref.json does not exist`);
  let ref;
  try {
    ref = JSON.parse(readFileSync(refPath, "utf8"));
  } catch (error) {
    throw pathRefError("no-pathref", `no-pathref: tools/mobile/path-refs/${scenario}.pathref.json does not parse (${String(error?.message ?? error)})`);
  }
  if (ref?.schema !== "knijka.pathref/1" || !Array.isArray(ref.segments) || !ref.segments.length) {
    throw pathRefError("no-pathref", `no-pathref: tools/mobile/path-refs/${scenario}.pathref.json is not a knijka.pathref/1 with segments`);
  }
  const tracePath = resolve(repoRoot, "content", "traces", scenario, "shadow-correct.trace.json");
  if (!existsSync(tracePath)) throw pathRefError("reference-stale", `reference-stale: content/traces/${scenario}/shadow-correct.trace.json is missing`);
  const digest = samplesDigest(readFileSync(tracePath, "utf8"));
  if (digest !== ref.trace?.samplesDigest) {
    throw pathRefError("reference-stale", `reference-stale: the trace digest ${digest.slice(0, 19)}… differs from the pathref's ${String(ref.trace?.samplesDigest).slice(0, 19)}… — re-run build-pathrefs.mjs`);
  }
  return decoratePlan(ref, { digest, refPath: `tools/mobile/path-refs/${scenario}.pathref.json` });
}

/** Attach the controller's runtime view without copying rows. */
export function decoratePlan(ref, { digest = ref.trace?.samplesDigest ?? null, refPath = null } = {}) {
  const segments = ref.segments.map((sg) => ({ ...sg, witnesses: (sg.witnesses ?? []).filter((w) => Array.isArray(w.rows) && w.rows.length >= 2) }));
  return {
    ...ref,
    segments,
    digest,
    refPath,
    lastSegmentIsR: segments[segments.length - 1].gear === -1,
    reverseSegments: segments.filter((s) => s.gear === -1).length,
    /** gear, arc and band only — what the INDEPENDENT side is allowed to see (§8.1). */
    segmentsMeta: segments.map((s) => ({
      k: s.k, gear: s.gear, micro: s.micro, arcM: s.arcM, tSec: s.tSec, lengthM: s.lengthM,
      armBand: s.armBand ? { alongM: s.armBand.alongM, latM: s.armBand.latM, yawDeg: s.armBand.yawDeg } : null,
      stopTarget: s.stopTarget ?? null, designedNegative: s.designedNegative === true,
      stops: (s.stops ?? []).map((st) => ({ tag: st.tag, frac: st.frac, arcM: st.arcM, dwellS: st.dwellS })),
    })),
  };
}

/**
 * The witness as a dense probe-frame polyline in MOTION order:
 *  · forward: the CENTRE path (cols cx, cz);
 *  · reverse: the REAR-AXLE path (cols rx, rz), with a straight LEAD of `leadM`
 *    before its start (the car may begin up to 0.5 m past the grid point) and a
 *    3 m TERMINAL EXTENSION past its end along the end tangent (§4.2), so the
 *    lookahead never collapses and position and yaw converge together.
 */
export function witnessPolyline(witness, { gear, leadM = 0, extendM = 0 } = {}) {
  const rows = witness.rows;
  const rear = gear === -1;
  const pts = rows.map((row) => ({ x: rear ? row[3] : row[1], z: rear ? row[4] : row[2], psi: row[5], delta: row[6], v: row[8] }));
  const out = [];
  if (leadM > 0) {
    const h = headingUnit(pts[0].psi);
    const sign = rear ? 1 : -1; // before the start, against the motion
    const n = Math.max(1, Math.round(leadM / 0.1));
    for (let i = n; i >= 1; i--) out.push({ x: pts[0].x + sign * h.x * i * 0.1, z: pts[0].z + sign * h.z * i * 0.1, psi: pts[0].psi, delta: 0, v: pts[0].v, lead: true });
  }
  for (const p of pts) out.push(p);
  const startIdx = out.length - pts.length;
  const endIdx = out.length - 1;
  if (extendM > 0) {
    const last = pts[pts.length - 1];
    const prev = pts[Math.max(0, pts.length - 4)];
    let dx = last.x - prev.x;
    let dz = last.z - prev.z;
    const m = Math.hypot(dx, dz);
    if (m > 1e-6) { dx /= m; dz /= m; } else { const h = headingUnit(last.psi); dx = rear ? -h.x : h.x; dz = rear ? -h.z : h.z; }
    const n = Math.round(extendM / 0.1);
    for (let i = 1; i <= n; i++) out.push({ x: last.x + dx * i * 0.1, z: last.z + dz * i * 0.1, psi: last.psi, delta: 0, v: last.v, ext: true });
  }
  const S = new Float64Array(out.length);
  for (let i = 1; i < out.length; i++) S[i] = S[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
  return { pts: out, S, n: out.length, sStart: S[startIdx], sEnd: S[endIdx], startIdx, endIdx, gear, lengthM: S[endIdx] - S[startIdx] };
}

/** Point on the polyline at arc s (clamped). */
export function pointAt(poly, s) {
  const sc = clamp(s, 0, poly.S[poly.n - 1]);
  let lo = 0;
  let hi = poly.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (poly.S[mid] <= sc) lo = mid;
    else hi = mid;
  }
  const seg = poly.S[hi] - poly.S[lo];
  const f = seg > 1e-9 ? (sc - poly.S[lo]) / seg : 0;
  const a = poly.pts[lo];
  const b = poly.pts[hi];
  return { x: a.x + f * (b.x - a.x), z: a.z + f * (b.z - a.z), idx: lo, psi: a.psi, delta: a.delta };
}

/**
 * THE CURSOR, windowed: back ≤ 0.4 m, ahead ≤ travelled + 0.8 m (Slice 0's
 * `project` window). Never an unwindowed search — forward and reverse are
 * separate polylines, and inside one the window is what keeps a double-back
 * (sc-pk-driveway's 0.017 m self-proximity) from snapping. Acquisition at a
 * segment start searches only the first 3 m + lead.
 */
export function advanceCursor(cursor, poly, point, travelledM = 0, { acquire = false, leadM = 0 } = {}) {
  let lo;
  let hi;
  if (acquire || !cursor) {
    lo = 0;
    hi = poly.sStart + 3 + leadM;
  } else {
    lo = cursor.s - 0.4;
    hi = cursor.s + Math.max(0, travelledM) + 0.8;
  }
  let best = null;
  for (let i = 0; i < poly.n - 1; i++) {
    if (poly.S[i + 1] < lo || poly.S[i] > hi) continue;
    const a = poly.pts[i];
    const b = poly.pts[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 0 ? ((point.x - a.x) * vx + (point.z - a.z) * vz) / len2 : 0;
    t = clamp(t, 0, 1);
    const s = poly.S[i] + t * Math.sqrt(len2);
    if (s < lo - 1e-9 || s > hi + 1e-9) continue;
    const fx = a.x + t * vx;
    const fz = a.z + t * vz;
    const d = Math.hypot(point.x - fx, point.z - fz);
    if (!best || d < best.d) {
      const m = Math.sqrt(len2) || 1;
      best = { d, s, idx: i, ct: cross(vx / m, vz / m, point.x - fx, point.z - fz) };
    }
  }
  if (!best) return { s: cursor?.s ?? 0, ctM: Infinity, toEndM: poly.sEnd - (cursor?.s ?? 0), idx: cursor?.idx ?? 0, found: false };
  return { s: best.s, ctM: best.ct, toEndM: poly.sEnd - best.s, idx: best.idx, found: true };
}

/** Smallest witness radius (centre, m) over the next `windowM` of arc. */
export function radiusAhead(poly, s, windowM = PATH_TUNE.lookahead.rAheadWindowM, kappaScale = 0.95) {
  let rMin = Infinity;
  for (let i = 0; i < poly.n; i++) {
    if (poly.S[i] < s || poly.S[i] > s + windowM) continue;
    const d = poly.pts[i].delta ?? 0;
    if (Math.abs(d) < 1e-4) continue;
    const rr = L / (Math.abs(Math.tan(d)) * yawGainAtKmh(poly.pts[i].v ?? 3) * kappaScale);
    rMin = Math.min(rMin, Math.hypot(rr, A));
  }
  return rMin;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 THE CONTROL LAW (DESIGN-v2 §4)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Target (world) into the rear-axle body frame: x forward, y right. */
export function toBodyFrame(pose, psi, target, { rear = true, a = A } = {}) {
  const h = headingUnit(psi);
  const rgt = rightUnit(psi);
  const ox = rear ? pose.x - a * h.x : pose.x;
  const oz = rear ? pose.z - a * h.z : pose.z;
  const dx = target.x - ox;
  const dz = target.z - oz;
  return { x: dx * h.x + dz * h.z, y: dx * rgt.x + dz * rgt.z };
}

/**
 * FORWARD: centre-referenced pure pursuit. The car at wheel δ moves every body
 * point on a circle about the ICR (0, R_r); requiring the centre (a, 0) and the
 * target (xt, yt) on one circle gives R_r = (xt² + yt² − a²)/(2·yt), exact.
 * a = 0 reduces to the classic 2·yt/Ld².
 */
export function centrePursuit({ xt, yt, kmh, a = A, wheelbase = L }) {
  const den = xt * xt + yt * yt - a * a;
  const kappa = Math.abs(den) < 1e-9 ? 0 : (2 * yt) / den;
  const delta = Math.atan((wheelbase * kappa) / yawGainAtKmh(kmh));
  const u = clamp(delta / maxSteerAtKmh(kmh), -1, 1);
  return { kappa, delta, u, saturated: Math.abs(delta / maxSteerAtKmh(kmh)) >= 1 };
}

/**
 * REVERSE: rear-axle pure pursuit in the MOTION frame (m = −h). κm = 2·ym/Ld²
 * (+ right of motion) and tan δ = −L·κm (reverse-plan.mjs:54-63, signed v).
 * Pinned: facing north, target behind-right ⇒ u > 0.
 */
export function rearPursuit({ pose, psi, target, lookaheadM, kmh, wheelbase = L, a = A }) {
  const h = headingUnit(psi);
  const rx = pose.x - a * h.x;
  const rz = pose.z - a * h.z;
  const mx = -h.x;
  const mz = -h.z;
  const rgtm = { x: -rightUnit(psi).x, z: -rightUnit(psi).z };
  const dx = target.x - rx;
  const dz = target.z - rz;
  const xm = dx * mx + dz * mz;
  const ym = dx * rgtm.x + dz * rgtm.z;
  const Ld = Math.max(1e-6, Math.hypot(xm, ym), lookaheadM ?? 0);
  const kappaM = (2 * ym) / (Ld * Ld);
  const delta = -Math.atan((wheelbase * kappaM) / yawGainAtKmh(kmh));
  const u = clamp(delta / maxSteerAtKmh(kmh), -1, 1);
  return { kappaM, delta, u, xm, ym, saturated: Math.abs(delta / maxSteerAtKmh(kmh)) >= 1 };
}

/**
 * THE TERMINAL HEADING GATE (2026-09-21) — which reverses the terminal law may touch, decided once per
 * witness from the pathref alone.
 *
 * The planner grades a reverse witness at the row REST_BACK_M (0.3 m) of arc BEFORE its end, because the
 * follower comes to rest there (policy.mjs REST_BACK_M, measured on the browser and the bench); the
 * witness still ends at the row the follower aims at. So the car never drives the witness's last 0.3 m.
 * Where that unreached TAIL still turns toward the segment's authored end heading, the car rests mid-turn
 * with that rotation owed — sc-park-gap-short's committed witness rests at 9.74° against a 10° box and its
 * tail would have taken it to 6.37°. Where the tail turns AWAY from the authored end heading (sc-park-left
 * 84.2° → 82.8°, sc-park-van) or not at all (sc-park-wall), there is nothing owed: the witness keeps its
 * nose in against a rear axle it planned ~0.4 m off the bay line, and squaring it up would only swing the
 * centre out (measured with the gate removed: sc-park-left's lateral box margin 0.051 → 0.024 m and
 * sc-park-van's 0.087 → 0.055 m over seeds 1–20, for heading neither needed).
 *
 * ψT is the SEGMENT'S AUTHORED END heading (`seg.authoredEnd.psi`) — on every committed pathref the heading
 * the plan's next segment starts from (the micro square-up's first row and `authoredStart` equal it) —
 * and never on a segment whose authored end pose is declared infeasible (designedNegative, Slice 0 §8).
 */
export function terminalHeadingGate(seg, witness, backM = REST_BACK_M) {
  const rows = witness?.rows;
  const psiT = seg?.authoredEnd?.psi;
  if (seg?.designedNegative || !Number.isFinite(psiT) || !Array.isArray(rows) || rows.length < 2) return { engage: false, psiT: Number.isFinite(psiT) ? psiT : null, restPsi: null, endPsi: null, owedDeg: null };
  const end = rows[rows.length - 1];
  let i = rows.length - 1;
  while (i > 0 && rows[i][0] > end[0] - backM + 1e-9) i--;
  const restErr = Math.abs(wrapDeg(psiT - rows[i][5]));
  const endErr = Math.abs(wrapDeg(psiT - end[5]));
  return { engage: endErr < restErr, psiT, restPsi: rows[i][5], endPsi: end[5], owedDeg: r2(restErr - endErr) };
}

/**
 * THE TERMINAL HEADING LAW (2026-09-21). Rear pursuit aims at a POSITION `Ld` ahead; over the last metre
 * of a reverse that point lies on the straight terminal extension (§4.2), so pursuit asks for LESS
 * curvature than the witness exactly where the heading is graded — sc-park-gap-short seed 7: the command
 * falls from u −0.66 to −0.23 over the last metre while the witness asks −0.62…−0.88, and the car rests
 * 3.7° behind the witness heading at the same arc, 13.4° off the bay.
 *
 * This hands the command over, linearly in the distance to the end, to the curvature that closes the
 * heading error by the end. In R the heading turns at dψ/ds = κm (rearPursuit's sign: κm + right of motion
 * turns ψ clockwise), so κm = (ψT − ψ)/max(dMin, toEnd), converted to δ exactly as rearPursuit converts its
 * κm. It cannot ask for more than the product's lock at this speed (VehicleSim.ts:391-394, tuning.ts:410-417)
 * — the clamp — and the product's wheel rate (VehicleSim.ts:395-397, tuning.ts:419-421) applies downstream
 * of the key, in the chain the bench models. Returns the blended u, the weight, the pure terminal command
 * and the heading error (°).
 */
export function terminalHeadingCommand({ uPursuit, psi, psiT, toEndM, kmh, t = PATH_TUNE.terminal, wheelbase = L }) {
  const none = { u: uPursuit, w: 0, uT: null, eDeg: null };
  if (!t || t.on === false || !Number.isFinite(uPursuit) || !Number.isFinite(psi) || !Number.isFinite(psiT) || !Number.isFinite(toEndM)) return none;
  const eDeg = wrapDeg(psiT - psi);
  const w = ramp(t.startM - toEndM, 0, t.startM - t.fullM);
  if (!(w > 0)) return { ...none, eDeg };
  const kappaM = (eDeg * RAD) / Math.max(t.dMinM, toEndM);
  const delta = -Math.atan((wheelbase * kappaM) / yawGainAtKmh(kmh));
  const uT = clamp(delta / maxSteerAtKmh(kmh), -1, 1);
  return { u: clamp((1 - w) * uPursuit + w * uT, -1, 1), w, uT, eDeg };
}

/** τ_eff = pose + io + zoh + lpf(v) + rate (§4.3). All seconds. */
export function delayModel({ poseP90S, ioP90S, periodP50S, kmh = 0 } = {}, d = PATH_TUNE.delay) {
  const pose = Number.isFinite(poseP90S) ? poseP90S : d.poseS;
  const io = Number.isFinite(ioP90S) ? ioP90S : d.ioS;
  const zoh = (Number.isFinite(periodP50S) ? periodP50S : d.periodS) / 2;
  const lpf = Math.min(0.15, 0.08 + 0.07 * ramp(Math.abs(kmh), 12, 24));
  return pose + io + zoh + lpf + d.rateS;
}

/** Linearised pure pursuit crossover x: x⁴ = 4(1 + x²). */
export const PURSUIT_CROSSOVER_X = Math.sqrt(2 + 2 * Math.SQRT2);
export const PM0_DEG = Math.atan(PURSUIT_CROSSOVER_X) * DEG;
export const PM_SLOPE_DEG_PER_D = PURSUIT_CROSSOVER_X * DEG;
/** PM(D) = 65.5° − 125.9°·D, D = |v|·τ_eff / Ld. */
export const phaseMarginDeg = (D) => PM0_DEG - PM_SLOPE_DEG_PER_D * D;

/** Ld grows with delay and never shrinks with radius (C-M4). v in km/h. */
export function lookaheadFor(kmh, tauEffS, gear, t = PATH_TUNE.lookahead) {
  const v = Math.abs(kmh) / 3.6;
  return gear === -1 ? clamp(Math.max(t.revMinM, t.factor * v * tauEffS), t.revMinM, t.revMaxM) : clamp(Math.max(t.fwdMinM, t.factor * v * tauEffS), t.fwdMinM, t.fwdMaxM);
}

/** The stability-and-cut speed cap, km/h (§4.3). */
export function stabilityCapKmh(rAheadM, tauEffS, gear, t = PATH_TUNE.lookahead) {
  if (!Number.isFinite(rAheadM) || rAheadM <= 0) return Infinity;
  const ldMax = gear === -1 ? t.revMaxM : t.fwdMaxM;
  const v = (t.pmFloorD * Math.min(ldMax, Math.sqrt(8 * rAheadM * t.cutMaxM))) / Math.max(1e-3, tauEffS);
  return v * 3.6;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 ACTUATION: THE PRODUCT CHAIN AND THE MODULATOR (DESIGN-v2 §5.1)
 * ═══════════════════════════════════════════════════════════════════════════ */

const CHAIN = Object.freeze({ DT: 1 / 60, normal: { sens: 0.8, tau: 0.15 }, advanced: { sens: 1, tau: 0.06 }, beginner: { sens: 0.6, tau: 0.25 } });

/** One step of the keyboard steering chain (input.ts → difficulty.ts → VehicleSim.ts). */
export function chainStep(st, key, kmh, tier = "normal") {
  const p = CHAIN[tier] ?? CHAIN.normal;
  const sensRamp = ramp(Math.abs(kmh), 12, 24);
  const sens = 1 + (p.sens - 1) * sensRamp;
  const tau = Math.min(p.tau, 0.08 + (p.tau - 0.08) * sensRamp);
  const target = clamp(key * sens, -1, 1);
  const smoothed = st.smoothed + (target - st.smoothed) * (1 - Math.exp(-CHAIN.DT / tau));
  const maxSteer = maxSteerAtKmh(kmh);
  const tgt = smoothed * maxSteer;
  const rate = Math.abs(tgt) < Math.abs(st.wheel) ? VEHICLE.RETURN_SPEED : VEHICLE.STEER_SPEED;
  const step = rate * CHAIN.DT;
  const wheel = st.wheel < tgt ? Math.min(tgt, st.wheel + step) : Math.max(tgt, st.wheel - step);
  return { smoothed, wheel };
}

/**
 * ONE ISOLATED PRESS through the chain (a port of scratchpad actuator-model.mjs),
 * returning the heading change. Its anchors are input-channels.md §2: 1.58 /
 * 2.08 / 3.69 / 7.78 / 11.3° for 45 / 65 / 100 / 200 / 300 ms at 10 km/h.
 */
export function chainPulseHeading(holdMs, kmh, { tier = "normal", spanS = 2.5, frameMs = CHAIN.DT * 1000 } = {}) {
  const v = kmh / 3.6;
  let st = { smoothed: 0, wheel: 0 };
  let psi = 0;
  let peak = 0;
  const upAt = holdMs / 1000;
  for (let wall = 0; wall < spanS; wall += frameMs / 1000) {
    const held = wall < upAt;
    st = chainStep(st, held ? 1 : 0, kmh, tier);
    peak = Math.max(peak, st.wheel);
    psi += ((v * Math.tan(st.wheel)) / L) * CHAIN.DT;
  }
  return { headingDeg: psi * DEG, peakRad: peak };
}

/**
 * THE CHAIN TABLE: mean wheel fraction per duty per speed band, for a ternary
 * modulator at `quantumMs` (60 Hz step simulation of the product chain).
 */
export function chainTable({ quantumMs = PATH_TUNE.runner.pollMs, tier = "normal", bandsKmh = [2, 5, 10, 15, 20] } = {}) {
  const duties = [];
  for (let i = 0; i <= 20; i++) duties.push(i / 20);
  const bands = bandsKmh.map((kmh) => {
    const frac = duties.map((duty) => {
      let st = { smoothed: 0, wheel: 0 };
      let mod = createModulator();
      let acc = 0;
      let n = 0;
      const frames = Math.round(4 / CHAIN.DT);
      const framesPerQuantum = Math.max(1, Math.round(quantumMs / 1000 / CHAIN.DT));
      let k = 0;
      for (let f = 0; f < frames; f++) {
        if (f % framesPerQuantum === 0) {
          const m = modulate(mod, duty, quantumMs / 1000, quantumMs / 1000);
          mod = m.state;
          k = m.k;
        }
        st = chainStep(st, k, kmh, tier);
        if (f > frames / 4) {
          acc += st.wheel / maxSteerAtKmh(kmh);
          n += 1;
        }
      }
      return acc / n;
    });
    return { kmh, frac };
  });
  return { quantumMs, tier, duties, bands };
}

let CHAIN_CACHE = null;
/** Invert the table: the duty that yields mean wheel fraction `fraction` at `kmh`. */
export function dutyForWheelFraction(fraction, kmh, table = null) {
  const t = table ?? (CHAIN_CACHE ??= chainTable());
  const f = clamp(Math.abs(fraction), 0, 1);
  let band = t.bands[0];
  for (const b of t.bands) if (Math.abs(b.kmh - Math.abs(kmh)) < Math.abs(band.kmh - Math.abs(kmh))) band = b;
  for (let i = 1; i < t.duties.length; i++) {
    const f0 = band.frac[i - 1];
    const f1 = band.frac[i];
    if (f <= f1 + 1e-12) {
      const w = f1 - f0 > 1e-9 ? (f - f0) / (f1 - f0) : 0;
      return Math.sign(fraction) * clamp(t.duties[i - 1] + w * (t.duties[i] - t.duties[i - 1]), 0, 1);
    }
  }
  return Math.sign(fraction) * 1;
}

export function createModulator() {
  return { e: 0, kPrev: 0 };
}

/**
 * TERNARY SIGMA-DELTA. `e` accumulates what the PREVIOUS output owed over the
 * quantum it was actually held (`heldS`, capped at 2 quanta); the new output
 * quantises `e + u` (the error-feedback form), which keeps |e| ≤ 0.5 ≤ 1
 * without the clamp ever acting — a clamp inside the loop biased the mean
 * (−0.667 for u = −0.72, T5.2). After a gap longer than 2 quanta the error is
 * reset (C-M3): a blackout must not wind the modulator up into an opposite-lock
 * burst.
 */
export function modulate(state, uDuty, heldS, quantumS, tune = PATH_TUNE.modulator) {
  const u = clamp(Number.isFinite(uDuty) ? uDuty : 0, -1, 1);
  let e = state.e;
  if (!(heldS <= tune.gapQuanta * quantumS)) e = 0;
  else {
    const w = Math.min(Math.max(0, heldS), tune.gapQuanta * quantumS) / quantumS;
    e += (u - state.kPrev) * (Number.isFinite(w) ? w : 1);
  }
  e = clamp(e, -1, 1);
  const v = e + u;
  const k = v > 0.5 ? 1 : v < -0.5 ? -1 : 0;
  return { state: { e, kPrev: k }, k };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 SPEED, STOPS AND THE PEDAL GRAMMAR (DESIGN-v2 §6, S-5, S-6, S-14)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The crawl-cap brake ceiling (difficulty.ts:60-64, 91, 304-306, 476-481). */
export const brakeCeil = (kmh) => 0.6 + 0.4 * ramp(Math.abs(kmh), 6, 14);
export const brakeCapMps2 = (kmh) => 0.9 * 9.81 * brakeCeil(kmh);
/** Dead time of the pedal ramp up to the ceiling; the brake key is S in D, W in R. */
export const brakeAttackDeadS = (kmh, gear, p = PATH_TUNE.pedals) => ((gear === -1 ? p.brakeAttackRS : p.brakeAttackDS) * brakeCeil(kmh)) / 2;

/**
 * THE FINAL-STOP TRIGGER, BRANCHED ON WHETHER THE BRAKE CAN BE PRESSED (S-6).
 * `vGate = min(|v|, dial)`; below PRESS_MIN a fresh press is refused, so the
 * coast form (and its longer distance) applies. Returns { branch, distM }.
 */
export function stopTrigger({ gear, vAbs, vGate, aBrake = null, aCoast = PATH_TUNE.pedals.aCoastMps2, landS = PATH_TUNE.pedals.landS, pressMin = PRESS_MIN_KMH }, p = PATH_TUNE.pedals) {
  const v = vAbs / 3.6;
  const branch = vGate >= pressMin ? "brake" : "coast";
  const aB = Number.isFinite(aBrake) ? aBrake : brakeCapMps2(vAbs);
  if (gear === -1) {
    const v1 = 1 / 3.6;
    const distM = branch === "brake"
      ? v * (landS + brakeAttackDeadS(vAbs, -1, p)) + Math.max(0, v * v - v1 * v1) / (2 * aB) + (v1 * v1) / (2 * aCoast) + 0.05
      : v * (landS + p.sReleaseHalfS) + (v * v) / (2 * aCoast) + 0.05;
    return { branch, distM };
  }
  const distM = branch === "brake"
    ? v * (landS + brakeAttackDeadS(vAbs, 1, p)) + (v * v) / (2 * aB) + 0.05
    : v * (landS + p.wReleaseHalfS) + (v * v) / (2 * aCoast) + 0.05;
  return { branch, distM };
}

/**
 * THE PRODUCT'S THROTTLE CHAIN AT A CRAWL, as far as a lifted W still drives the car.
 *  - attackS / releaseS: input.ts THROTTLE_ATTACK_S 0.35 / THROTTLE_RELEASE_S 0.25: holding W
 *    ramps the pedal 0 to 1 in 0.35 s, lifting it lets it fall 1 to 0 in 0.25 s;
 *  - capFull / capFullKmh / capEndKmh: difficulty.ts `creepThrottleCap` 0.45 (normal) applied at
 *    or under CREEP_CAP_FULL_KMH 4 and faded out by CREEP_CAP_END_KMH 12 (applyDifficulty's S0
 *    creep control): a CEILING, so a pedal ramped to 1 is still driving at the ceiling for
 *    (1 - 0.45) x 0.25 s after the lift;
 *  - and VehicleSim.update reads the throttle first: while it is above zero the car is DRIVEN,
 *    the brake is not read and the rolling-resistance coast is not applied (VehicleSim.ts, the
 *    «Throttle / brake / reverse state machine» and «Brakes» blocks).
 * The drive magnitude per unit throttle is the follower's own `pedals.aMaxMps2` (3 m/s², the
 * PRESS_MIN derivation's figure). The product shapes the pedal by pow(p, 1.4) x 0.75 before that
 * ceiling (difficulty.ts `normal`), which reaches the ceiling LATER than this linear pedal, so
 * against the product this model over-states the run-out: it errs toward stopping short.
 * CORRECTION (2026-09-21, re-checked against source): that holds for the pedal SHAPING alone. The
 * product's crawl drive per unit of shaped throttle is ENGINE_FORCE_CURVE's 4800 N (tuning.ts:346-348)
 * over CHASSIS_MASS 1220 kg (tuning.ts:72), 3.93 m/s², not 3. Integrating both from source (resistances
 * under throttle ignored), the product's run-out is SHORTER than this model's below a pedal of about
 * 0.65 and up to 0.11 m LONGER at a pedal of 0.8–1 (0.5–3 km/h). The pedal bound from above and the
 * resistances the integration ignores both pull toward short, but whether a browser creep stops short of
 * its end pose is NOT established by source; SQ3/SQ3c hold it on the bench plant only.
 */
export const CREEP_THROTTLE = Object.freeze({ attackS: 0.35, releaseS: 0.25, capFull: 0.45, capFullKmh: 4, capEndKmh: 12 });

/**
 * HOW FAR A D CREEP RUNS IF W IS LIFTED NOW (2026-09-21), pure: the lift lands `landS` later
 * (the pedal still rising meanwhile), the pedal then falls over the release ramp DRIVING the car
 * the whole way down (it is a throttle above zero), and only then does the coast begin. Below
 * PRESS_MIN the D brake cannot be pressed (a fresh press at rest selects R), so this run-out IS
 * the stop. `stopTrigger`'s coast branch books the release as `v x wReleaseHalfS` at constant
 * speed, which is right for a pedal held under the ceiling and wrong for one ramped past it: on
 * the micro square-up's creep that model latched at 1.3 km/h and the car ran on to 2.1 km/h and
 * 0.61 m past the end pose (sc-park-gap-short seed 10). Integrated at the product's 60 Hz frame.
 */
export function creepLiftRunOutM({ vKmh, pedal, aCoast = PATH_TUNE.pedals.aCoastMps2, landS = PATH_TUNE.pedals.landS, aMax = PATH_TUNE.pedals.aMaxMps2 }, c = CREEP_THROTTLE) {
  const dt = 1 / 60;
  let v = Math.max(0, Number.isFinite(vKmh) ? vKmh : 0) / 3.6;
  let p = clamp(Number.isFinite(pedal) ? pedal : 0, 0, 1);
  let d = 0;
  const drive = () => {
    const cap = c.capFull + (1 - c.capFull) * ramp(v * 3.6, c.capFullKmh, c.capEndKmh);
    return aMax * Math.min(p, cap);
  };
  if (p > 0) {
    for (let t = 0; t < landS - 1e-9; t += dt) {
      p = Math.min(1, p + dt / c.attackS);
      v += drive() * dt;
      d += v * dt;
    }
    while (p > 0) {
      p = Math.max(0, p - dt / c.releaseS);
      v += drive() * dt;
      d += v * dt;
    }
  }
  return d + (v * v) / (2 * Math.max(0.05, Number.isFinite(aCoast) ? aCoast : PATH_TUNE.pedals.aCoastMps2));
}

/** The stop-phase press speed on a path leg (S-4): 0 below PRESS_MIN, so `brake()`'s own refusal blocks it. */
export function pathSafeKmh(pKmh, lastAbsKmh = null, pressMin = PRESS_MIN_KMH) {
  const g = Number.isFinite(lastAbsKmh) ? Math.min(pKmh, lastAbsKmh) : pKmh;
  return !(g >= pressMin) ? 0 : g;
}

/** The braking envelope toward a stop Δs ahead (§6.2) — the ONLY "preview". */
export function stopEnvelopeKmh(deltaS, p = PATH_TUNE.pedals) {
  if (deltaS <= p.envNearM) return p.envNearKmh;
  return Math.sqrt((p.envNearKmh / 3.6) ** 2 + 2 * p.aPlanMps2 * (deltaS - p.envNearM)) * 3.6;
}

/**
 * THE D PROFILE (N3). vBase = min(max(vAuthMove, 3), 18, v_cap); vT = min(vBase,
 * hazard cap, every UNCONSUMED stop's envelope). The floor applies to the
 * authored profile only: a hazard cap can still take vT below 3.
 */
export function speedTarget({ profileKmh, frac, stopsAhead = [], hzCapKmh = null, vCapKmh = Infinity, floorKmh = D_FLOOR_KMH }, p = PATH_TUNE.pedals) {
  let vAuth = null;
  if (Array.isArray(profileKmh) && profileKmh.length) {
    const b = clamp(Math.floor(clamp(frac, 0, 1) * profileKmh.length), 0, profileKmh.length - 1);
    vAuth = profileKmh[b];
  }
  const vBase = Math.min(Math.max(Number.isFinite(vAuth) ? vAuth : floorKmh, floorKmh), p.capKmh, vCapKmh);
  let vT = vBase;
  if (Number.isFinite(hzCapKmh)) vT = Math.min(vT, hzCapKmh);
  for (const st of stopsAhead) if (!st.consumed && Number.isFinite(st.deltaS)) vT = Math.min(vT, stopEnvelopeKmh(Math.max(0, st.deltaS), p));
  return { vT, vBase, vAuth, capped: vCapKmh < Math.max(Number.isFinite(vAuth) ? vAuth : floorKmh, floorKmh) };
}

/** The R band, re-derived from measurement (§6.2): bandLoR = min(4.5, max(3.2, PRESS_MIN + 3.6·a_coast·blind p90 + 0.1)). */
export function reverseBand({ aCoastMeas = null, blindP90S = null } = {}) {
  if (!Number.isFinite(aCoastMeas) || !Number.isFinite(blindP90S)) return { lo: R_BAND_KMH.lo, hi: R_BAND_KMH.hi, derivedFrom: "default" };
  const lo = Math.min(4.5, Math.max(R_BAND_KMH.lo, PRESS_MIN_KMH + 3.6 * aCoastMeas * blindP90S + 0.1));
  return { lo, hi: lo + 0.5, derivedFrom: "measured" };
}

/**
 * THE PEDAL GRAMMAR. Pure: from speeds, the target, the distance to the stop and
 * the latch, what the two keys should be. W is always the W key and S the S key;
 * in D, W accelerates and S brakes; in R, S accelerates and W brakes (rule b).
 *
 * INVARIANTS the property tests (T6.1–T6.3) hold it to:
 *  · D: no brake DOWN-EDGE is issued at vGate < PRESS_MIN (a fresh press there can land at rest and select R);
 *  · the D brake latched from the trigger is never released before rest + dwell + an explicit release;
 *  · R: no W DOWN-EDGE is issued below rHoldPressMinKmh or with the dial under 1, so none can
 *    be ARMED by ReverseAssist's LAW 1 (reverseAssist.ts:231-262); before a final latch W is
 *    never down at all, and after one it is HELD through rest (a press that began moving is
 *    never a toggle) — the pre-2026-09-15 release at vAbs ≤ 1 left a stopped car unbraked;
 *  · R: after any final latch (wBrake, coast, hold) the accelerator S is never pressed again;
 *  · in R the accelerator is never down while the brake is.
 */
export function pedalGrammar(latch, obs, p = PATH_TUNE.pedals) {
  const { gear, vAbs, dialKmh, vT = 0, toStopM = Infinity, aBrake = null, aCoast = p.aCoastMps2, keys = { W: false, S: false }, release = false, band = R_BAND_KMH, anticipateM = 0, noAccel = false } = obs;
  const vGate = Math.min(vAbs, Number.isFinite(dialKmh) && dialKmh >= 0 ? dialKmh : vAbs);
  // τ_land is the tune's PEDAL landing time, never an observation (CODE-REVIEW-1 M1):
  // an `obs.landS` is ignored, so PRESS_MIN and every trigger distance are constants.
  const landS = p.landS;
  const pressMin = pressMinFor(p);
  const next = { ...latch };
  let W = keys.W;
  let S = keys.S;
  let why = null;
  let trig = null;
  if (gear === -1) {
    // ── R: S accelerates, W brakes ──
    if (Number.isFinite(toStopM)) {
      trig = stopTrigger({ gear: -1, vAbs, vGate, aBrake, aCoast, landS, pressMin }, p);
      if (!next.wBrake && !next.coast && !next.hold && toStopM <= trig.distM + anticipateM) {
        if (trig.branch === "brake") { next.wBrake = true; why = "final stop (brake branch)"; }
        else { next.coast = true; next.coastKmh = vAbs; why = "final stop (coast branch — W not pressable at PRESS_MIN)"; }
      }
    }
    if (obs.holdNow === true && !next.hold) {
      next.hold = true;
      why = obs.holdWhy ?? "brake and hold";
    }
    // THE STOP IS A STATE, NOT AN EVENT (2026-09-15). Before this, the coast latch fell into
    // the accelerator branch below: S — the R throttle — was pressed again whenever the car
    // drooped under the band (path-follow.mjs HEAD 4209dad, the `else` of `if (next.wBrake)`),
    // and canary-path-s2 sc-park-left crept 4.0 m past its witness end at 0.5–3.7 km/h into
    // the bay's back kerb with `stopLate: "coast"` and state «followed». Once any final
    // latch is set: S is never pressed again; W is pressed the first read it is safely
    // pressable while MOVING (rHoldPressMinKmh, see PATH_TUNE.pedals) and HELD through rest.
    const stopping = next.wBrake || next.coast || next.hold;
    if (stopping) {
      S = false;
      const pressable = vAbs >= p.rHoldPressMinKmh && Number.isFinite(dialKmh) && dialKmh >= 1;
      if (!W && pressable) {
        if (next.wBrake || next.hold) W = true;
        else {
          // THE COAST LATCH COASTS ONLY WHILE COASTING IS THE SHORTER STOP. It presses W the
          // moment the brake model from HERE reaches the stop, or the car speeds up (a creep,
          // a slope, a pedal nobody owns): braking at the coast trigger would stop up to its
          // whole coast distance short (0.7–1.4 m at 2.6 km/h, stopTrigger), and not braking
          // at all is the 4.0 m run past the end this latch used to allow.
          const v = vAbs / 3.6;
          const brakeDistM = v * (landS + brakeAttackDeadS(vAbs, -1, p)) + (v * v) / (2 * (Number.isFinite(aBrake) ? aBrake : brakeCapMps2(vAbs))) + 0.05;
          const creeping = vAbs > (Number.isFinite(next.coastKmh) ? next.coastKmh : vAbs) + 0.3;
          next.coastKmh = Math.min(Number.isFinite(next.coastKmh) ? next.coastKmh : vAbs, vAbs + 0.3);
          if (!Number.isFinite(toStopM) || toStopM <= brakeDistM || creeping) {
            W = true;
            why = why ?? (creeping ? "coast latch: the car is speeding up — brake and hold" : "coast latch: at the brake distance — brake and hold");
          }
        }
      }
    } else {
      W = false;
      if (!noAccel) {
        if (vAbs < band.lo) S = true;
        else if (vAbs >= band.hi) S = false;
      } else S = false;
    }
    if (W) S = false;
    return { latch: next, W, S, vGate, trigger: trig, why, pressMin };
  }
  // ── D: W accelerates, S brakes ──
  if (release && next.brake) {
    next.brake = false;
    next.coast = false;
    why = "latched brake released at rest";
  }
  if (Number.isFinite(toStopM) && !next.brake && !next.coast) {
    trig = stopTrigger({ gear: 1, vAbs, vGate, aBrake, aCoast, landS, pressMin }, p);
    if (toStopM <= trig.distM + anticipateM) {
      if (trig.branch === "brake") { next.brake = true; why = "final stop (brake branch)"; }
      else { next.coast = true; why = "final stop (coast branch — S not pressable)"; }
    }
  }
  if (next.brake) {
    W = false;
    // a fresh press only while moving; a held latch stays down through rest
    if (!S) S = vGate >= pressMin;
  } else if (next.coast) {
    W = false;
    S = false;
  } else {
    // accelerator
    if (noAccel) W = false;
    else if (vAbs < vT - p.wOnBelowKmh) W = true;
    else if (vAbs >= vT) W = false;
    // trim brake, never latched
    if (!S && vAbs > vT + p.trimOverKmh && vGate >= pressMin) { S = true; W = false; why = "trim brake"; }
    else if (S && vAbs <= vT + p.trimReleaseKmh) S = false;
  }
  return { latch: next, W, S, vGate, trigger: trig, why, pressMin };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 THE SIGN AUDIT AND THE AUTHORITY FOLD (DESIGN-v2 §4.6, T10)
 * ═══════════════════════════════════════════════════════════════════════════ */

export function createPathSign() {
  return { verdict: "undetermined", why: "no window yet", window: null, windows: 0, agreed: 0 };
}

/**
 * Windows of ≥ 2.5 m in which the MEAN commanded u has |mean| ≥ 0.2; the
 * predicted Δψ sign is sign(u)·sign(v); `contradicts` when the measured camera
 * yaw moved ≥ 10° the other way. The mean makes ΣΔ key toggling irrelevant (C-M6).
 */
export function foldPathSign(state, { u, v, stepM, psi }, afterM = SIGN_CONVICT_AFTER_M, minDeg = SIGN_CONVICT_MIN_DEG) {
  if (state.verdict === "contradicts") return state;
  if (!Number.isFinite(u) || !Number.isFinite(stepM) || !Number.isFinite(psi) || !Number.isFinite(v) || Math.abs(v) < 0.5) return state;
  const gear = Math.sign(v);
  let w = state.window;
  if (!w || w.gear !== gear) w = { gear, travel: 0, uDist: 0, psi0: psi, psiLast: psi, turned: 0 };
  w = { ...w, travel: w.travel + stepM, uDist: w.uDist + u * stepM, turned: w.turned + wrapDeg(psi - w.psiLast), psiLast: psi };
  const s = { ...state, window: w };
  if (w.travel < afterM) return s;
  const mean = w.uDist / w.travel;
  s.window = null;
  s.windows += 1;
  if (Math.abs(mean) < 0.2) return { ...s, why: `window of ${w.travel.toFixed(1)} m had mean u ${mean.toFixed(2)} (< 0.2) — undetermined` };
  const predicted = Math.sign(mean) * gear;
  if (Math.abs(w.turned) < minDeg) return { ...s, why: `mean u ${mean.toFixed(2)} over ${w.travel.toFixed(1)} m turned ${w.turned.toFixed(1)}° (< ${minDeg}°) — undetermined` };
  if (Math.sign(w.turned) === predicted) return { ...s, verdict: "agrees", agreed: s.agreed + 1, why: `mean u ${mean.toFixed(2)} over ${w.travel.toFixed(1)} m turned the camera yaw ${w.turned.toFixed(1)}°, as predicted` };
  return { ...s, verdict: "contradicts", why: `mean u ${mean.toFixed(2)} (${gear < 0 ? "R" : "D"}) over ${w.travel.toFixed(1)} m predicted ${predicted > 0 ? "clockwise" : "anticlockwise"} and the camera yaw turned ${w.turned.toFixed(1)}° the other way` };
}

/**
 * THE STEER LANDING ESTIMATE — SELF-REPORT, AND IT FEEDS NOTHING (CODE-REVIEW-1 M1).
 *
 * What it measures: keydown resolve → the first read whose yaw has departed
 * `departDeg` from the yaw read just before the edge, in the commanded sense. At a
 * crawl that is dominated by the product's steering low-pass and rate limiter, so it
 * is published for diagnosis and never drives a pedal constant.
 *
 * One sample per NEW edge (`edgeSeq` must advance by exactly one since the last
 * sub-tick, and the previous edge must be ≥ `isolateMs` older), `psi0` is the yaw of
 * the read that issued the edge (≤ `maxReadLagMs` before it), a second edge inside
 * the window voids the sample, a departure the wrong way voids it, and a wait over
 * `windowMs` is discarded, never booked. A stale `edgeAtMs` whose sequence does not
 * advance can therefore never be sampled — the v1 estimator re-armed on it and
 * booked 4.7 s of straight drift as a landing delay.
 */
export function createSteerLanding() {
  return { lastSeq: 0, lastAtMs: null, pending: null, samples: [], rejected: { overlap: 0, notIsolated: 0, staleRead: 0, slow: 0, sign: 0 } };
}

export function foldSteerLanding(st, { edgeSeq, edgeAtMs, steerKey = 0, v, psi, prevPsi, prevReadMs, now }, t = PATH_TUNE.landing) {
  const s = { ...st, rejected: { ...st.rejected } };
  const seq = Number.isFinite(edgeSeq) ? edgeSeq : s.lastSeq;
  if (seq !== s.lastSeq) {
    const prevAt = s.lastAtMs;
    const single = seq === s.lastSeq + 1;
    if (s.pending) {
      s.pending = null;
      s.rejected.overlap += 1;
    }
    s.lastSeq = seq;
    s.lastAtMs = Number.isFinite(edgeAtMs) ? edgeAtMs : null;
    if (s.samples.length < t.maxSamples && steerKey !== 0 && Number.isFinite(v) && Math.abs(v) >= t.minKmh && Number.isFinite(prevPsi) && Number.isFinite(edgeAtMs)) {
      if (!single || (prevAt !== null && edgeAtMs - prevAt < t.isolateMs)) s.rejected.notIsolated += 1;
      else if (!Number.isFinite(prevReadMs) || edgeAtMs < prevReadMs || edgeAtMs - prevReadMs > t.maxReadLagMs) s.rejected.staleRead += 1;
      else s.pending = { seq, atMs: edgeAtMs, psi0: prevPsi, sense: Math.sign(steerKey) * Math.sign(v) };
    }
  }
  if (s.pending && Number.isFinite(psi) && Number.isFinite(now)) {
    const d = wrapDeg(psi - s.pending.psi0);
    if (now - s.pending.atMs > t.windowMs) {
      s.pending = null;
      s.rejected.slow += 1;
    } else if (Math.abs(d) >= t.departDeg) {
      if (Math.sign(d) === s.pending.sense) s.samples = [...s.samples, now - s.pending.atMs];
      else s.rejected.sign += 1;
      s.pending = null;
    }
  }
  return s;
}

/** Median of the booked samples (never a p90 of five, which is their maximum). */
export function steerLandingSummary(st) {
  const srt = [...(st?.samples ?? [])].sort((a, b) => a - b);
  return {
    selfReport: "SELF-REPORT — steering yaw response; feeds no pedal constant (PRESS_MIN uses PATH_TUNE.pedals.landS)",
    n: srt.length,
    medianMs: srt.length ? srt[Math.floor((srt.length - 1) / 2)] : null,
    maxMs: srt.length ? srt[srt.length - 1] : null,
    rejected: { ...(st?.rejected ?? {}) },
  };
}

export function createAuthority() {
  return { left: { predictedDeg: 0, measuredDeg: 0 }, right: { predictedDeg: 0, measuredDeg: 0 } };
}

/**
 * Fold one step: the yaw the COMMANDED wheel fraction `u` predicts at this speed
 * (kinematic, with the measured yaw gain), against the yaw the camera measured.
 * Per sign, because a channel that turns one way only is not a live channel.
 */
export function foldAuthority(state, { u, v, stepM, dPsi }) {
  if (!Number.isFinite(u) || Math.abs(u) < 0.1 || !Number.isFinite(stepM) || !Number.isFinite(dPsi) || !Number.isFinite(v) || Math.abs(v) < 1) return state;
  const side = u > 0 ? "right" : "left";
  const predicted = ((stepM * Math.tan(Math.abs(u) * maxSteerAtKmh(v)) * yawGainAtKmh(v)) / L) * DEG;
  const measured = dPsi * Math.sign(v) * Math.sign(u);
  const s = { left: { ...state.left }, right: { ...state.right } };
  s[side].predictedDeg += predicted;
  s[side].measuredDeg += measured;
  return s;
}

/** live / weak / dead / unexercised per sign; `dead` needs ≥ 30° predicted (T10.2). */
export function authorityVerdict(state) {
  const sideVerdict = (s) => {
    if (s.predictedDeg < 15) return "unexercised";
    const ratio = s.measuredDeg / s.predictedDeg;
    if (ratio < 0.1) return s.predictedDeg >= 30 ? "dead" : "unexercised";
    return ratio < 0.5 ? "weak" : "live";
  };
  const left = sideVerdict(state.left);
  const right = sideVerdict(state.right);
  const verdict = left === "dead" || right === "dead" ? "dead" : left === "weak" || right === "weak" ? "weak" : left === "live" && right === "live" ? "live" : left === "live" || right === "live" ? "live-one-sign" : "unexercised";
  return { left: { ...state.left, verdict: left }, right: { ...state.right, verdict: right }, verdict, liveBothAt15: left === "live" && right === "live" };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 END POSE, OUTCOME, TRACKING WORD, TEXT (DESIGN-v2 §7.4, §8)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Predicted product box, Slice 0 `productBoxCheck` convention (trace frame bay). A PREDICTION, never a gate. */
export function productBoxPrediction(park, pose, psi) {
  if (!park?.bay || !pose || !Number.isFinite(psi)) return null;
  const b = park.bay;
  const h = b.headingDeg * RAD;
  const ax = Math.sin(h);
  const ay = Math.cos(h);
  const x = pose.x;
  const y = -pose.z;
  const rx = x - b.x;
  const ry = y - b.y;
  const lon = rx * ax + ry * ay;
  const lat = rx * ay - ry * ax;
  const raw = Math.abs(((psi - b.headingDeg) % 360) + 360) % 360;
  const d = raw > 180 ? 360 - raw : raw;
  const heading = d > 90 ? 180 - d : d;
  const lonTol = Math.max(park.centerTolM, b.lengthM / 2 - 2.02);
  const latTol = Math.min(park.centerTolM, b.widthM / 2 - 0.85);
  const inBay = Math.abs(lon) <= b.lengthM / 2 && Math.abs(lat) <= b.widthM / 2;
  return { lonM: r3(lon), latM: r3(lat), headingOffsetDeg: r2(heading), inBox: inBay && Math.abs(lon) <= lonTol && Math.abs(lat) <= latTol && heading <= park.headingTolDeg };
}

/**
 * THE END POSE. Yaw is UNMEASURED when the source is not the camera or when
 * `camYawSuspect` latched — a 0.31 m end with a 60° yaw error must never read
 * «in the box» (the w45 d75fb969 trap).
 */
export function captureEndPose({ pose, camPsiMedian, betaPsi = null, yawSource, camYawSuspect, witnessEnd, authoredEnd, park = null }) {
  const measured = yawSource === "cam" && !camYawSuspect && Number.isFinite(camPsiMedian);
  const psi = measured ? camPsiMedian : null;
  const rel = (ref) => {
    if (!ref) return null;
    const h = headingUnit(ref.psi);
    const rg = rightUnit(ref.psi);
    const dx = pose.x - ref.x;
    const dz = pose.z - ref.z;
    return { toEndM: r3(dx * h.x + dz * h.z), latM: r3(dx * rg.x + dz * rg.z), distM: r3(Math.hypot(dx, dz)) };
  };
  const yawErrDeg = psi === null || !authoredEnd ? null : r2(Math.abs(wrapDeg(psi - authoredEnd.psi)));
  const box = psi === null ? null : productBoxPrediction(park, pose, psi);
  return {
    pose: { x: r3(pose.x), z: r3(pose.z) },
    camYawDeg: r2(camPsiMedian ?? null),
    betaTangentYawDeg: r2(betaPsi),
    yawSource: measured ? "cam" : camYawSuspect ? "UNMEASURED (camYawSuspect)" : "UNMEASURED",
    yawMeasured: measured,
    vsWitness: rel(witnessEnd),
    vsAuthored: rel(authoredEnd),
    yawErrDeg,
    inBoxPredicted: box ? box.inBox : psi === null ? "UNMEASURED" : null,
    productBoxPrediction: box,
  };
}

/**
 * CREDIT PER R SEGMENT, NEVER ONE LESSON FLAG FOR ALL OF THEM (CODE-REVIEW-2 M1b).
 * The debrief lists reverse objectives without saying which R segment each grades,
 * so a value is given to a segment only where that is unambiguous:
 *  · no reverse objective read → the park objective's tick, and only on a lesson with ONE R segment;
 *  · every reverse objective done → true on every R segment;
 *  · one R segment → false when any reverse objective is not done;
 *  · several R segments → false only when NONE is done and there is one objective per
 *    segment; mixed credit is null on EVERY segment (a partial credit cannot be
 *    placed, so it may blame none of them).
 * Returns Map k → { credited: true|false|null, why }.
 */
export function pathCreditBySegment({ segments = [], revObjectives = null, parkCredited = null }) {
  const rks = segments.filter((s) => s.gear === -1).map((s) => s.k);
  const out = new Map();
  const set = (credited, why) => { for (const k of rks) out.set(k, { credited, why }); };
  const objs = Array.isArray(revObjectives) ? revObjectives : [];
  if (!objs.length) {
    if (rks.length === 1 && (parkCredited === true || parkCredited === false)) set(parkCredited, `the park objective's tick (no reverse objective in the debrief)`);
    else set(null, rks.length > 1 ? `no reverse objective in the debrief and ${rks.length} R segments — the credit cannot be placed` : "no reverse or park objective was read from the debrief");
    return out;
  }
  const done = objs.filter((o) => o?.done === true).length;
  if (done === objs.length) set(true, `${done}/${objs.length} reverse objective(s) credited`);
  else if (rks.length === 1) set(false, `${done}/${objs.length} reverse objective(s) credited on the lesson's one R segment`);
  else if (done === 0 && objs.length === rks.length) set(false, `0/${objs.length} reverse objectives credited, one per R segment`);
  else set(null, `${done}/${objs.length} reverse objective(s) credited across ${rks.length} R segments — the debrief does not say which segment each grades`);
  return out;
}

/**
 * THE PROBE-INDEPENDENT IN-BOX WITNESS (CODE-REVIEW-1 M3). The product's OWN rubric
 * numbers «отместване X м, ъгъл Y°» (`path-evidence.mjs` parseParkDebrief) against
 * the tolerances of the park the plan attaches to THIS segment. Neither the
 * controller nor the pose probe wrote them. null = no witness.
 */
export function productParkWitness(productPark, park) {
  if (!park || !Number.isFinite(park.centerTolM) || !Number.isFinite(park.headingTolDeg)) return null;
  const c = productPark?.centerOffsetM;
  const h = productPark?.headingOffsetDeg;
  if (!Number.isFinite(c) || !Number.isFinite(h)) return null;
  return { centerOffsetM: c, headingOffsetDeg: h, centerTolM: park.centerTolM, headingTolDeg: park.headingTolDeg, inTolerance: c <= park.centerTolM + 1e-9 && h <= park.headingTolDeg + 1e-9 };
}

/** A debrief mistake that books a contact — path-evidence.mjs attributeMistakes' collision test. */
const COLLISION_MISTAKE_RE = /удар|притисн/iu;
const mistakeHead = (code) => {
  const s = String(code).replace(/\s+/g, " ").trim();
  const cut = s.search(/\s[−-]\s?\d|\sбез допълнителни|\sОПАСНА/u);
  return (cut > 0 ? s.slice(0, cut) : s).slice(0, 80);
};

/**
 * THE CONTACT WITNESSES THE CORRIDOR CANNOT SEE (2026-09-15, CODE-REVIEW-parkleft M1b). The
 * reverse corridor passed canary-path-s2 sc-park-left's car while its centre was 0.59 m wide in
 * the bay and its rear camera was inside the neighbour; the runner's own `collision` and
 * `body-clearance` refusals (branch 1) can miss a contact made under the final brake. Three
 * witnesses, none of them the controller's, each enough on its own:
 *   5.1 `evidence.driveClearance` fails `driveClearanceGate` — the chassis box swept along the
 *       poses the drive really produced, against the bodies the lesson really mounts. UNTIL
 *       2026-09-16 this branch read `routeBySegment[k].bay.within`, the LATERAL-OFFSET PROXY
 *       (`policy.mjs BAY_FLANKS`), which is now retired: it stood in for body clearance in a
 *       harness that could not measure it, and once both sides could, it contradicted them.
 *       This branch fires on a MEASURED failure only, exactly as the retired bay check fired
 *       only on a measured excursion (an unmeasured bay was never an excursion). An
 *       UNMEASURED record is not a pass anywhere — it fails `driveClearanceGate` and with it
 *       canary gate G10 — but it is G10's refusal to make, not a contact witness here.
 *   5.2 `evidence.routeHoldBySegment[k].crashPinned > 0` — the product's own «crash-pinned» route
 *       hold, tallied while the runner was on this segment (independent of the probe too);
 *   5.3 a collision booked in the debrief (`evidence.attribution.collisionCandidates`, the
 *       mistakes matching «удар|притисн») — the product's own words. The debrief does not say
 *       where; a leg that touched something is the harness's drive wherever it did, so every R
 *       segment of it reads harness, and the text says where the banner placed it, if anywhere.
 * Returns { branch, reasons } — branch of the FIRST witness present, every reason present — or null.
 */
export function contactEvidence(k, rt, evidence = {}) {
  const reasons = [];
  let branch = null;
  const dc = evidence.driveClearance ?? null;
  if (dc && dc.measured === true && !driveClearanceGate(dc).pass) {
    // WHERE IT LANDS. The failure is placed on the segment its worst pose was on (`atSeg`);
    // a record that carries no `atSeg` cannot place it, so it reads on every R segment — the
    // same rule 5.3 uses for a debrief that does not say where the contact was.
    const placed = Number.isFinite(dc.atSeg);
    if (!placed || dc.atSeg === k) {
      branch ??= 5.1;
      reasons.push(`the drive's own body clearance ${dc.verdict === "contact" ? "PENETRATED" : "came inside the floor of"} ${dc.body}/${dc.model}: worst ${dc.worstM} m against the ${dc.requiredM} m it had to keep, at ledger row ${dc.atRow}${placed ? ` on segment ${dc.atSeg}` : " (which the record cannot place on a segment)"} — ${dc.basis ?? "drive-clearance/1"}`);
    }
  }
  const holds = (Array.isArray(evidence.routeHoldBySegment) ? evidence.routeHoldBySegment : []).filter(Boolean);
  const pinnedHere = holds.find((b) => b.k === k)?.crashPinned;
  if (Number.isFinite(pinnedHere) && pinnedHere > 0) {
    branch ??= 5.2;
    reasons.push(`the product held the car crash-pinned on ${pinnedHere} outer tick(s) while this segment was being driven (its own route-hold banner)`);
  }
  const booked = (evidence.attribution?.collisionCandidates ?? []).map((c) => String(c?.code ?? "")).filter((c) => COLLISION_MISTAKE_RE.test(c));
  if (booked.length) {
    branch ??= 5.3;
    const elsewhere = holds.filter((b) => b.k !== k && Number.isFinite(b.crashPinned) && b.crashPinned > 0).map((b) => `${b.gear === -1 ? "R" : "F"}${b.k} (${b.crashPinned})`);
    const placed = Number.isFinite(pinnedHere) && pinnedHere > 0
      ? "the crash-pinned banner above places it on this segment"
      : elsewhere.length
        ? `the crash-pinned banner was read on ${elsewhere.join(", ")}, not on this segment — but the leg touched something, and nothing about its credit may be read as the product's`
        : "no crash-pinned tick places it on a segment, so it may have been this one";
    reasons.push(`the product's debrief books a collision on this leg («${mistakeHead(booked[0])}»${booked.length > 1 ? ` and ${booked.length - 1} more` : ""}) — ${placed}`);
  }
  return reasons.length ? { branch, reasons } : null;
}

/**
 * THE REVERSE OUTCOME, BRANCH ORDER IS THE WHOLE POINT (§8.3.8, T11.2). Every
 * harness fault is checked, per R segment, before any product blame; a designed
 * negative never blames the product; and product blame needs every one of its
 * witnesses MEASURED — an unmeasured value is UNJUDGED, never a pass
 * (CODE-REVIEW-2 M1, M2; CODE-REVIEW-1 M3). `evidence.arms[k]` and
 * `evidence.routeBySegment[k]` are the INDEPENDENT values (same pose probe);
 * `evidence.productPark` is the product's own debrief.
 *
 *   1 a harness refusal on this segment        harness
 *   2 the steering sign contradicted            harness
 *   3 the arm began outside its band            harness
 *   4 the arm is not measured                   UNJUDGED
 *   5 the reverse left its corridor             harness
 * 5.1 the reverse left the bay's lateral room   harness   (contactEvidence — the corridor passed a
 * 5.2 crash-pinned ticks on this segment        harness    car 0.59 m wide in the bay; a contact under
 * 5.3 a collision in the debrief                harness    the final brake can end «followed»)
 *   6 the reverse route is not measured         UNJUDGED
 *   7 END POSE yaw is unmeasured                UNJUDGED
 *   8 designed negative                         none
 *   9 the product credited this segment         none
 *  10 this segment's credit is unread or mixed  UNJUDGED
 *  11 no probe-independent in-box witness       UNJUDGED
 *  12 the product's own offsets are outside     UNJUDGED — the harness missed the box
 *  13 the product's own offsets are inside and
 *     it did not credit                         admissible
 *
 * `creditBySegment` (Map, from `pathCreditBySegment`) is preferred; a bare
 * `credited` is honoured only when the lesson has ONE R segment.
 */
export function pathReverseOutcome({ segments = [], refusals = [], evidence = {}, sign = null, endPoses = {}, credited = null, creditBySegment = null, disarmFailed = false }) {
  const out = [];
  const armsByK = new Map((evidence.arms ?? []).map((a) => [a.k, a]));
  const routeByK = new Map((evidence.routeBySegment ?? []).map((rt) => [rt.k, rt]));
  const rSegs = segments.filter((s) => s.gear === -1);
  const creditOf = (k) => {
    if (creditBySegment instanceof Map) return creditBySegment.get(k) ?? { credited: null, why: "no credit mapped to this segment" };
    if (rSegs.length === 1 && (credited === true || credited === false)) return { credited, why: "the lesson's credit, one R segment" };
    return { credited: null, why: credited === null || credited === undefined ? "the credit was not read" : `one lesson-wide flag cannot be placed on ${rSegs.length} R segments` };
  };
  const push = (k, blame, branch, text) => out.push({ k, blame, branch, text });
  for (const seg of rSegs) {
    const k = seg.k;
    const ref = refusals.find((rf) => (rf.k === k || rf.k === undefined) && ["reverse-not-armed", "arm-gate-stalled", "arm-roll-out-of-band", "disarm-failed", "lost-R", "end-overrun", "collision", "body-clearance", "body-clearance-unreadable", "witness-body-unsafe"].includes(rf.code));
    if (ref) { push(k, "harness", 1, `R${k}: THE HARNESS — ${ref.code}: ${ref.why}`); continue; }
    if (disarmFailed && k !== segments[segments.length - 1].k) { push(k, "harness", 1, `R${k}: THE HARNESS — disarm-failed: the disarm reported failure`); continue; }
    const sref = refusals.find((rf) => (rf.k === k || rf.k === undefined) && rf.code === "sign-contradicts");
    if (sref || sign?.verdict === "contradicts") { push(k, "harness", 2, `R${k}: THE HARNESS — the steering sign contradicted the measured yaw`); continue; }
    const arm = armsByK.get(k);
    if (!seg.designedNegative) {
      if (arm && arm.measured !== false && (arm.startInBand === false || arm.rollWithinAllow === false)) {
        push(k, "harness", 3, `R${k}: THE HARNESS — the reverse began outside its screened band (start ${arm.startAlongM} m, roll ${arm.armRollM} m; independent of the controller, same pose probe)`);
        continue;
      }
      if (!arm || arm.measured === false || arm.startInBand !== true || arm.rollWithinAllow !== true) {
        push(k, "unjudged", 4, `R${k}: UNJUDGED — the arm is UNMEASURED (${!arm ? "no arm evidence for this segment" : arm.measured === false ? arm.why ?? "not measured" : arm.startInBand !== true ? "start band not read" : "arm roll not read"}); no product blame rests on an arm nobody measured`);
        continue;
      }
    }
    const rt = routeByK.get(k);
    if (rt && rt.measured === true && Number.isFinite(rt.maxM) && Number.isFinite(rt.corridorM) && rt.maxM > rt.corridorM) {
      push(k, "harness", 5, `R${k}: THE HARNESS — the reverse left its corridor (max ${rt.maxM} m > ${rt.corridorM} m; independent of the controller, same pose probe)`);
      continue;
    }
    const contact = contactEvidence(k, rt, evidence);
    if (contact) {
      push(k, "harness", contact.branch, `R${k}: THE HARNESS — ${contact.reasons.join("; and ")}. No product blame may rest on a reverse the harness drove wide in the bay or into something`);
      continue;
    }
    if (!seg.designedNegative && !(rt && rt.measured === true && Number.isFinite(rt.maxM) && Number.isFinite(rt.corridorM))) {
      push(k, "unjudged", 6, `R${k}: UNJUDGED — the reverse route is UNMEASURED (${rt?.why ?? "no route evidence for this segment"}); a SELF-REPORT end pose may not stand in for it`);
      continue;
    }
    const ep = endPoses[k];
    if (!seg.designedNegative && (!ep || ep.yawMeasured !== true)) { push(k, "unjudged", 7, `R${k}: UNJUDGED — END POSE yaw is unmeasured${ep?.yawSource ? ` (${ep.yawSource})` : ""}`); continue; }
    if (seg.designedNegative) { push(k, "none", 8, `R${k}: authored R end pose infeasible (Slice 0 §8); graded only by Задача 1's zone`); continue; }
    const cr = creditOf(k);
    if (cr.credited === true) { push(k, "none", 9, `R${k}: the product CREDITED the manoeuvre (${cr.why}) — GRADING evidence; not legibility`); continue; }
    if (cr.credited !== false) { push(k, "unjudged", 10, `R${k}: UNJUDGED — this segment's credit is not known (${cr.why})`); continue; }
    const wit = productParkWitness(evidence.productPark, seg.productPark);
    if (!wit) {
      push(k, "unjudged", 11, `R${k}: UNJUDGED — the product did not credit it, and nothing independent of the controller shows the car was in the box (${seg.productPark ? "the debrief carries no «отместване / ъгъл»" : "no graded park is attached to this segment"}); the harness's own end pose may not decide product blame`);
      continue;
    }
    if (!wit.inTolerance) {
      push(k, "unjudged", 12, `R${k}: UNJUDGED — THE HARNESS MISSED THE BOX: the product's own «отместване ${wit.centerOffsetM} м, ъгъл ${wit.headingOffsetDeg}°» is outside ${wit.centerTolM} m / ${wit.headingTolDeg}°, so not crediting it is consistent`);
      continue;
    }
    push(k, "admissible", 13, `R${k}: THE HARNESS DROVE A WITNESS OF THE AUTHORED REVERSE INTO THE BOX — the product's own «отместване ${wit.centerOffsetM} м, ъгъл ${wit.headingOffsetDeg}°» is inside ${wit.centerTolM} m / ${wit.headingTolDeg}° — AND THE PRODUCT DID NOT CREDIT IT (${cr.why}) — admissible, subject to ATTRIBUTION`);
  }
  return out;
}

/**
 * THE TRACKING WORD, from INDEPENDENT numbers (§8.2). Never `tracked`, `blind`
 * or `not-invoked`: those are the ribbon's words and route-fidelity keys on them.
 */
export function pathTrackingWord(pathEvidence, refusals = [], { authoredArcM = null, arcAtRefusalM = null } = {}) {
  const early = refusals.find((rf) => Number.isFinite(rf.arcM) && Number.isFinite(authoredArcM) && rf.arcM < 0.5 * authoredArcM);
  if (early || (refusals.length && Number.isFinite(arcAtRefusalM) && Number.isFinite(authoredArcM) && arcAtRefusalM < 0.5 * authoredArcM)) {
    return { word: "path-refused", why: `a refusal (${(early ?? refusals[0]).code}) fired before half of the authored arc` };
  }
  const lostRef = refusals.find((rf) => ["lost", "acquisition", "gear-change-missed"].includes(rf.code));
  const segs = pathEvidence?.routeBySegment ?? [];
  const blown = segs.find((sg) => sg.measured !== false && Number.isFinite(sg.maxM) && Number.isFinite(sg.corridorM) && sg.maxM > 2 * sg.corridorM);
  if (lostRef || blown) return { word: "path-lost", why: lostRef ? `refusal ${lostRef.code}` : `segment ${blown.k} max ${blown.maxM} m > 2 × corridor ${blown.corridorM} m` };
  const over = segs.find((sg) => sg.measured !== false && Number.isFinite(sg.maxM) && Number.isFinite(sg.corridorM) && sg.maxM > sg.corridorM);
  const unmeasured = segs.find((sg) => sg.measured === false && !sg.micro && sg.driven !== false);
  if (over || unmeasured) return { word: "path-degraded", why: over ? `segment ${over.k} max ${over.maxM} m > corridor ${over.corridorM} m` : `segment ${unmeasured.k} was driven and not measured` };
  if (refusals.length) return { word: "path-degraded", why: `refusal ${refusals[0].code} after half of the authored arc` };
  return { word: "path-followed", why: "every measured segment stayed inside its corridor (independent of the controller; same pose probe)" };
}

/** The headline, printed first on every artefact (§8.3.2). */
export function steeredByLine({ lesson, digest, pathref }) {
  const d7 = String(digest ?? "").replace(/^sha256:/, "").slice(0, 7);
  return (
    `STEERED BY: THE LESSON'S AUTHORED LINE (content/traces/${lesson}/shadow-correct.trace.json @${d7}, via ${pathref ?? `tools/mobile/path-refs/${lesson}.pathref.json`}), ` +
    `closed on the DEV-ONLY pose probe — NOT the guidance ribbon. This leg can show how the product GRADES a drive along that line. ` +
    `It CANNOT show that the ribbon, the briefing or the glass would lead a student there; no guidance, legibility, lane-choice or ` +
    `route-keeping finding may be drawn from it.`
  );
}

export const PATH_SPAWN_DEAD_SENTENCE =
  "on this authored-path leg the DEAD line above STANDS unless AUTHORITY below reads live on BOTH signs at ≥ 15° of predicted turn.";

export const EMPTY_WORLD_CAVEAT =
  "the authored drive was recorded kinematically with ambient traffic 0/0 (recorder.ts:337-339); this browser lesson runs its default traffic (contracts.ts:160-164).";

export const PATH_PACE_LINE =
  "PACE: not the tape — authored-path leg; speed is indexed by POSE along the witness (pathFollow.segments[].stopErrM, SELF-REPORT).";

/**
 * The ROUTE qualifier — never null on a path leg (§8.3.4). «ON THE AUTHORED LINE BY
 * CONSTRUCTION» is printed only when EVERY non-micro segment was MEASURED inside its
 * corridor; an unmeasured driven segment prints UNMEASURED and says nothing along the
 * route may be judged from this leg (CODE-REVIEW-2 M2). A micro square-up (≤ 1 m) is
 * unmeasured by construction and is named, never counted as within.
 */
export function pathRouteLine(evidence, fallbackRefusal = null) {
  const segs = evidence?.routeBySegment ?? [];
  const per = segs.map((sg) => `${sg.gear === -1 ? "R" : "F"}${sg.k}: ${sg.measured === true ? `${sg.maxM}/${sg.corridorM}` : sg.micro ? "unmeasured (micro)" : "UNMEASURED"}`).join(" · ");
  const measuredOver = segs.filter((sg) => sg.measured === true && !(Number.isFinite(sg.maxM) && Number.isFinite(sg.corridorM) && sg.maxM <= sg.corridorM));
  const unmeasured = segs.filter((sg) => sg.measured !== true && !sg.micro);
  if (measuredOver.length) {
    return `${fallbackRefusal ?? "THE CAR LEFT ITS WITNESS CORRIDOR"} — per segment ${per} …and on an authored-path leg that is THE FOLLOWER's failure.`;
  }
  if (!segs.length || unmeasured.length) {
    return `ROUTE UNMEASURED ON THIS AUTHORED-PATH LEG — per segment ${per || "(no segment evidence)"}${unmeasured[0]?.why ? ` (${unmeasured[0].why})` : ""}. Nothing independent shows the car stayed on its witness, so no finding about what the product did ALONG the route may be drawn from this leg; and route fidelity here would measure THE HARNESS, never route-keeping.`;
  }
  return `ON THE AUTHORED LINE BY CONSTRUCTION — per segment ${per}. Route fidelity on this leg measures THE HARNESS; it is a precondition, never evidence that anything kept the car on route.`;
}

/** REVERSE AIM line for a path leg (§8.3.7). */
export function pathReverseLine(evidence, follow) {
  const arms = evidence?.arms ?? [];
  const parts = arms.map((a) => `R${a.k} start ${a.startAlongM ?? "?"} m along, roll ${a.armRollM ?? "?"} m${a.startInBand === false ? " OUT OF BAND" : ""}`);
  return `      REVERSE AIM: authored-path witnesses (${(follow?.segments ?? []).filter((s) => s.gear === -1).length} R segment(s)) — ${parts.join(" · ") || "no arm measured"} · sign ${follow?.sign?.verdict ?? "undetermined"} · SELF-REPORT key edges ${follow?.keyEdges ?? 0}. GRADING evidence only.`;
}

/** The uncredited line on a path leg that DID steer (§8.3.11). */
export function pathUncreditedLine(uncredited, evidence) {
  // "yes" only for what was MEASURED inside; anything unmeasured is UNMEASURED, and an
  // out-of-band or out-of-corridor value is "no" (CODE-REVIEW-2 M2).
  const arms = (evidence?.arms ?? []).filter((a) => a.designedNegative !== true);
  const armOut = arms.some((a) => a.measured !== false && (a.startInBand === false || a.rollWithinAllow === false));
  const armUnmeasured = arms.some((a) => a.measured === false || a.startInBand !== true || a.rollWithinAllow !== true);
  const armIn = arms.length === 0 ? "n/a" : armOut ? "no" : armUnmeasured ? "UNMEASURED" : "yes";
  const rev = (evidence?.routeBySegment ?? []).filter((s) => s.gear === -1);
  const revOut = rev.some((s) => s.measured === true && !(Number.isFinite(s.maxM) && Number.isFinite(s.corridorM) && s.maxM <= s.corridorM));
  const revUnmeasured = rev.some((s) => s.measured !== true);
  const revIn = rev.length === 0 ? "n/a" : revOut ? "no" : revUnmeasured ? "UNMEASURED" : "yes";
  const align = evidence?.productPark?.alignment ?? "not read";
  return (
    `${uncredited.length} objective(s) UNCREDITED on an authored-path leg that DID steer: ${uncredited.map((o) => `«${o.titleBg}»`).slice(0, 4).join(", ")}` +
    `${uncredited.length > 4 ? ` …and ${uncredited.length - 4} more` : ""}. Before filing: arm in band ${armIn}, reverse within corridor ${revIn}, product alignment «${align}», ATTRIBUTION below.`
  );
}

/** leg-evidence and run.log STEERING line (§8.3.10). */
export function pathSteeringLine(books) {
  return `  STEERING: authored-path — ${books.commands} key edges · ${books.heldMs.left} ms left / ${books.heldMs.right} ms right (path books) · ribbon loop NOT USED on this leg`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 THE REDUCER (DESIGN-v2 §7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `pathStep(state, obs) → { state, cmd, row }`. No I/O. A state handed to
 * pathStep is CONSUMED — the next one is the one returned — because the books
 * inside it are appended in place; a test that wants to branch clones first.
 *
 * MODES. follow → (latched stop at rest: wantStop) → hold-stop → hold-for-arm
 * → [outer arms R] → reverse-settle → reverse-follow ⇄ reverse-stop →
 * reverse-capture → hold-for-disarm → [outer disarms] → forward-settle →
 * follow | creep → … → route-end. Terminal: refused.
 *
 * WHO ADVANCES WHAT (§7.3). The reducer never assigns the outer phase. It
 * raises flags — wantStop, stopRelease, atGearChange, segmentDone, routeEnd,
 * shutterOk — which the outer tick reads, and it advances `segIndex` only after
 * it has SEEN the phase change the flag asked for.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const REFUSAL_CODES = Object.freeze([
  "no-pathref", "reference-stale", "platform", "acquisition", "lost", "pose-stale", "sign-contradicts", "gear-change-missed",
  "arm-gate-stalled", "arm-roll-out-of-band", "disarm-failed", "reverse-not-armed", "lost-R",
  // 2026-09-15 (canary-path-s2 sc-park-left): each brakes, holds and ends the leg loudly
  "end-overrun", "collision",
  // 2026-09-16: the PLAN, not the drive — the selected witness passes through a body
  "witness-body-unsafe",
  // 2026-09-16: the DRIVE, measured — the predicted braking ribbon comes inside the drive
  // floor of a body the lesson mounts (drive-clearance.mjs `bodyClearanceGuard`). It replaced
  // `bay-lateral`, the lateral-offset PROXY, which had begun to refuse the planner's own
  // clearance-maximising witnesses before any contact. `body-clearance-unreadable`: the
  // bodies could not be read at all, and a drive the safety screen cannot measure is
  // REFUSED, never driven unscreened.
  "body-clearance", "body-clearance-unreadable",
]);

const emptyFlags = () => ({ wantStop: false, stopRelease: false, atGearChange: false, segmentDone: false, routeEnd: false, shutterOk: false });

/**
 * THE FOLLOWER'S BODY GUARD, BUILT ONCE PER PLAN.
 *
 * A lesson whose bodies cannot be read is NOT an unguarded drive: the refusal is
 * kept on the state and fired at the first step, exactly as `body-screen.mjs`
 * refuses a plan it cannot screen. The one legitimate way to drive without it is
 * to say so — `tune.clearance.refuse === false` — which is what a synthetic bench
 * plan (no lesson, no district, no bodies) declares about itself.
 */
function buildBodyGuard(plan, tune) {
  if ((tune ?? PATH_TUNE).clearance?.refuse === false) return { ok: false, off: true, guard: null, why: "tune.clearance.refuse is false — the body guard is deliberately off for this run" };
  try {
    return { ok: true, off: false, guard: bodyClearanceGuard(plan?.lesson), why: null };
  } catch (err) {
    return { ok: false, off: false, guard: null, why: `${err?.name ?? "Error"}: ${String(err?.message ?? err)}` };
  }
}

export function createPathState(plan, tune = PATH_TUNE) {
  const first = plan.segments[0];
  return {
    plan,
    tune,
    bodyGuard: buildBodyGuard(plan, tune),
    mode: first.gear === -1 ? "hold-for-arm" : "follow",
    segIndex: 0,
    flags: emptyFlags(),
    refusals: [],
    done: false,
    witness: null,
    poly: null,
    cursor: null,
    leadM: 0,
    stops: [],
    currentStop: null,
    pendingMode: null,
    creeps: 0,
    creepTarget: null,
    creepFrame: null,
    creepYaw: null,
    latch: { brake: false, coast: false, wBrake: false, hold: false },
    mod: createModulator(),
    yaw: createYawState(),
    sign: createPathSign(),
    authority: createAuthority(),
    last: null,
    lastPhase: null,
    restSince: null,
    dwellFrom: null,
    lostCount: 0,
    stall: { lastFrame: undefined, frameAt: null, entries: 0, onset: null, drained: false, returns: 0, pauseLayerReturns: 0, maxStallMs: 0 },
    frozen: { since: null, pose: null, returns: 0 },
    settle: null,
    capture: null,
    armRestPose: null,
    endPoses: {},
    restAfterRefusal: null,
    brakeFit: null,
    coastFit: null,
    aBrakeMeas: null,
    aCoastMeas: null,
    landing: createSteerLanding(),
    restYaw: [],
    tauEffS: delayModel({}),
    band: reverseBand(),
    lastU: 0,
    nearLock: false,
    impact: { prev: null, reads: 0, peakMps2: 0 },
    books: {
      nearLockM: 0, nearLockBudgetEntries: 0, impacts: [], holds: [], clearance: [], witnessBody: [],
      segments: [], arms: [], disarms: [], saturatedM: 0, stabilityCappedM: 0, pm: [],
      stopHeldWithoutBrake: 0, creepAfterDrain: 0, microOvershootM: null, returns: { frozen: 0, stalled: 0, pause: 0 },
    },
  };
}

const segOf = (state) => state.plan.segments[state.segIndex];
const bookOf = (state) => state.books.segments[state.books.segments.length - 1] ?? null;
const lettersR = (g) => Array.isArray(g) && g.length === 1 && g[0] === "R";

/** Refuse: loud, final for the leg's remaining segments, never silent (§7.7). */
export function refusePathState(state, code, why, extra = {}) {
  const k = segOf(state)?.k ?? null;
  return {
    ...state,
    mode: "refused",
    refusals: [...state.refusals, { code, why, k, atMode: state.mode, arcM: state.cursor ? r2(state.cursor.s) : null, ...extra }],
    flags: { ...state.flags, atGearChange: false, wantStop: false, stopRelease: false },
  };
}

/** Median of headings (deg) about the first one, so a 359°/1° pair is 0°, not 180°. Null when empty. */
export function circularMedianDeg(list) {
  const xs = (list ?? []).filter(Number.isFinite);
  if (!xs.length) return null;
  const base = xs[0];
  const rel = xs.map((p) => wrapDeg(p - base)).sort((a, b) => a - b);
  return wrap360(base + rel[Math.floor(rel.length / 2)]);
}

/** The arm frame of a reverse segment's authored gear-change pose (probe frame). */
export function armFrame(gcPose, pose, psi) {
  const h = headingUnit(gcPose.psi);
  const rg = rightUnit(gcPose.psi);
  const dx = pose.x - gcPose.x;
  const dz = pose.z - gcPose.z;
  return { alongM: dx * h.x + dz * h.z, latM: dx * rg.x + dz * rg.z, yawErrDeg: Number.isFinite(psi) ? wrapDeg(psi - gcPose.psi) : null };
}

/**
 * THE PLAN'S OWN BODY CLEARANCE, BEFORE THE CAR MOVES (2026-09-16).
 *
 * `witnessBodyVerdict` reads only what the builder wrote onto the witness, so this
 * needs no district, no GLB and no I/O: a pathref that was screened says so, and one
 * that was not says THAT, which is why "unscreened" is a state of its own and never
 * folded into "clear". Returns a refusal object, or a book entry to record.
 */
export function witnessBodyGate(seg, witness, tune = PATH_TUNE) {
  const cfg = tune?.witnessBody ?? PATH_TUNE.witnessBody;
  const v = witnessBodyVerdict(witness, { floorM: cfg.floorM ?? BODY_FLOOR_M });
  const book = { k: seg.k, gear: seg.gear, startAlongM: witness?.startAlongM ?? null, state: v.state, why: v.why };
  if (v.state === "unsafe" && cfg.refuseUnsafe !== false) {
    return { book, refusal: "witness-body-unsafe", why: `${seg.gear === -1 ? "R" : "D"}${seg.k}: the committed witness ${witness?.startAlongM} is not drivable without contact — ${v.why}. Re-plan it (build-pathrefs.mjs refuses to emit it); do not drive it` };
  }
  if (v.state === "unscreened" && cfg.refuseUnscreened === true) {
    return { book, refusal: "witness-body-unsafe", why: `${seg.gear === -1 ? "R" : "D"}${seg.k}: witness ${witness?.startAlongM} is UNSCREENED against the lesson's bodies — ${v.why}` };
  }
  return { book, refusal: null };
}

/** Largest grid point ≤ the measured START along, lead ≤ 0.5 m; outside the screened band ⇒ refusal (§6.5). */
export function selectWitness(seg, start) {
  const band = seg.designedNegative ? seg.spawnBand ?? seg.armBand : seg.armBand;
  const inside = (v, [lo, hi], eps = 1e-9) => v >= lo - eps && v <= hi + eps;
  if (!band) return { refusal: "arm-roll-out-of-band", why: "the segment carries no band" };
  if (!inside(start.alongM, band.alongM) || !inside(start.latM, band.latM) || (Number.isFinite(start.yawErrDeg) && !inside(start.yawErrDeg, band.yawDeg))) {
    return {
      refusal: "arm-roll-out-of-band",
      why: `the reverse would start at along ${r2(start.alongM)} m, lat ${r2(start.latM)} m, yaw ${r2(start.yawErrDeg)}° — outside the screened band along ${band.alongM.join("…")}, lat ${band.latM.join("…")}, yaw ${band.yawDeg.join("…")}`,
    };
  }
  const ws = [...(seg.witnesses ?? [])].sort((a, b) => a.startAlongM - b.startAlongM);
  let pick = null;
  for (const w of ws) if (w.startAlongM <= start.alongM + 1e-9) pick = w;
  pick ??= ws[0];
  if (!pick) return { refusal: "arm-roll-out-of-band", why: "no witness in the pathref" };
  const leadM = start.alongM - pick.startAlongM;
  if (!seg.designedNegative && leadM > 0.5 + 1e-6) return { refusal: "arm-roll-out-of-band", why: `the nearest witness starts ${r2(leadM)} m behind the start (lead > 0.5 m)` };
  return { witness: pick, leadM: Math.max(0, leadM) };
}

/** Arc of the point nearest `point` on the polyline, searched only over s ≥ fromS. */
function arcOfNearest(poly, point, fromS = 0) {
  let best = null;
  for (let i = 0; i < poly.n - 1; i++) {
    if (poly.S[i + 1] < fromS) continue;
    const a = poly.pts[i];
    const b = poly.pts[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? clamp(((point.x - a.x) * vx + (point.z - a.z) * vz) / len2, 0, 1) : 0;
    const d = Math.hypot(point.x - (a.x + t * vx), point.z - (a.z + t * vz));
    if (!best || d < best.d) best = { d, s: poly.S[i] + t * Math.sqrt(len2) };
  }
  return best;
}

/**
 * WHERE A MID-SEGMENT STOP SITS ON THE WITNESS. The authored stop is a PLACE on the
 * authored line: `arcM` metres of AUTHORED arc from the segment start. The witness is
 * not the authored line's length — sc-park-judge F0's witness is 121.2 m against an
 * authored 119.16 m, because its tail is re-planned (aim «planned tail … from row 1042,
 * pre-aim 5 m») and all of the extra 2.04 m lies AFTER the stop. `frac × witness span`
 * spread that tail over the whole segment and put the authored stop (arc 100.95, frac
 * 0.8472) at witness 102.68 m, 1.68 m past the place the authored pose projects onto
 * (101.00 m, 0.05 m off the witness): every judge drive rested ~1.56 m long of the
 * authored pose and canary G7 (path-evidence.mjs stopsFromSamples, measured against the
 * trace's own stop pose) read NOT SERVED (canary-path-91e5a51: 1.563 m; bench seeds
 * 1–20: 19/20 beyond G7's 1.5 m). The witness follows the authored line from its start
 * up to where its tail was re-planned, so the authored arc offset (less the witness's
 * own startAlongM) is the stop's arc in the witness's own ROW arc (column `s`, which
 * the planner lays along the authored line: judge's stop pose projects onto row s
 * 101.00 for authored 100.95, gap-long's onto 96.60 for 96.6). That row arc is then
 * read on THIS polyline's arc S, which is not the row column (gap-long: polyline span
 * 105.78 m against a last row s of 105.6 m — the polyline sums every 0.1 m chord). The
 * segment-END stop (frac 1: routeEnd, inserted) stays the witness end, which is where
 * the witness was planned to stop; `frac` remains the fallback for a stop with no arc
 * or a witness with no rows.
 */
export function stopArcOnWitness(seg, st, poly, witness = null) {
  const span = poly.sEnd - poly.sStart;
  const byFrac = poly.sStart + clamp(st.frac, 0, 1) * span;
  if (!(st.frac < 1 - 1e-9)) return byFrac;
  const a0 = seg.arcM?.[0];
  const rows = witness?.rows;
  if (!Number.isFinite(st.arcM) || !Number.isFinite(a0) || !Array.isArray(rows) || rows.length < 2 || rows.length !== poly.endIdx - poly.startIdx + 1) return byFrac;
  const rowS = st.arcM - a0 - (witness.startAlongM ?? 0);
  if (rowS <= rows[0][0]) return poly.sStart;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] < rowS) continue;
    const f = (rowS - rows[i - 1][0]) / Math.max(1e-9, rows[i][0] - rows[i - 1][0]);
    const sA = poly.S[poly.startIdx + i - 1];
    return sA + f * (poly.S[poly.startIdx + i] - sA);
  }
  return poly.sEnd;
}

function buildStops(seg, poly, nextSeg = null, witness = null) {
  return (seg.stops ?? []).map((st) => {
    const gc = st.tag === "gearChange" && nextSeg?.gearChangePose ? nextSeg.gearChangePose : null;
    // Where the gear-change pose sits on THIS witness, searched over its tail only:
    // far from it the stop is measured along the arc, because an along-heading
    // distance in the arm frame is meaningless round a 90° turn (poligon F4 read
    // «4.6 m to the stop» 40 m of arc away, measured on the T9 bench).
    const near = gc ? arcOfNearest(poly, gc, Math.max(0, poly.sEnd - (seg.extensionM ?? 0) - 15)) : null;
    return {
      tag: st.tag,
      frac: st.frac,
      dwellS: st.dwellS,
      sM: st.tag === "gearChange" ? null : stopArcOnWitness(seg, st, poly, witness),
      gcPose: gc,
      gcArcM: near ? near.s : null,
      targetAlongM: st.tag === "gearChange" ? nextSeg?.stopTarget?.alongM ?? null : null,
      consumed: false,
    };
  });
}

function newSegmentBook(seg, extra = {}) {
  return { k: seg.k, gear: seg.gear, micro: seg.micro === true, ctMaxM: 0, saturatedM: 0, overshootKmh: 0, stopErrM: null, branch: null, vAtTriggerKmh: null, stopLate: null, stopEarlyM: 0, aBrakeMeas: null, aCoastMeas: null, stops: [], ...extra };
}

/** Enter a forward segment: witness, polyline, stops and the acquisition check. */
function enterForward(state, pose, psi, { acquire = true } = {}) {
  const seg = segOf(state);
  const w = seg.witnesses[0];
  const next = state.plan.segments[state.segIndex + 1] ?? null;
  const poly = witnessPolyline(w, { gear: 1, extendM: 3 });
  const cursor = advanceCursor(null, poly, pose, 0, { acquire: true });
  let s = {
    ...state,
    witness: w,
    poly,
    cursor,
    leadM: 0,
    stops: buildStops(seg, poly, next?.gear === -1 ? next : null, w),
    currentStop: null,
    yaw: resetYawHistory(state.yaw),
    lostCount: 0,
  };
  s.books.segments.push(newSegmentBook(seg, { witnessStartAlongM: 0 }));
  // The approach has a body model too: sc-park-45-rev's seg-0 witness passes 0.22 m
  // from `lot45r-bay-1` for the model that bay mounts, and −0.16 m for a `kargo_v`.
  {
    const gate = witnessBodyGate(seg, w, state.tune ?? PATH_TUNE);
    (s.books.witnessBody ??= []).push(gate.book);
    if (gate.refusal) return refusePathState(s, gate.refusal, gate.why);
  }
  if (acquire && !seg.micro) {
    const lim = seg.acquiredFrom ? { ct: ACQUISITION.replannedCtM, yaw: ACQUISITION.replannedYawDeg } : { ct: ACQUISITION.ctM, yaw: ACQUISITION.yawDeg };
    const yawErr = Number.isFinite(psi) ? Math.abs(wrapDeg(psi - poly.pts[poly.startIdx].psi)) : 0;
    if (!cursor.found || Math.abs(cursor.ctM) > lim.ct || yawErr > lim.yaw) {
      s = refusePathState(s, "acquisition", `F${seg.k} starts ${cursor.found ? `${r2(cursor.ctM)} m` : "nowhere"} off its witness with ${r2(yawErr)}° of yaw error (limit ${lim.ct} m / ${lim.yaw}°)`);
    }
  }
  return s;
}

/** The D stop being aimed at, and how far it is. Within 5 m of arc a gear-change stop is measured in the ARM FRAME; before that, along the witness. */
function nextStopD(state, pose, cursor) {
  for (const st of state.stops) {
    if (st.consumed) continue;
    if (st.tag === "gearChange" && st.gcPose && Number.isFinite(st.targetAlongM)) {
      const byArc = Number.isFinite(st.gcArcM) ? st.gcArcM + st.targetAlongM - cursor.s : null;
      if (byArc !== null && byArc > 5) return { stop: st, toStopM: byArc };
      return { stop: st, toStopM: st.targetAlongM - armFrame(st.gcPose, pose, null).alongM };
    }
    if (Number.isFinite(st.sM)) return { stop: st, toStopM: st.sM - cursor.s };
  }
  return { stop: null, toStopM: Infinity };
}

const out = (state, cmd, row) => ({ state, cmd: { ...cmd, flags: { ...state.flags } }, row });
// The wheel is released on these steps, so the modulator restarts from a released key:
// error AND last output zeroed. Keeping kPrev = 1 across a release cost a whole quantum at
// saturation (e += 1 − 1 = 0 ⇒ k = 0), measured on the T9 bench as a 117 ms gap per yield.
const release = (state) => ({ ...state, mod: { e: 0, kPrev: 0 } });

/**
 * ONE SUB-TICK.
 *
 * obs = { f, x, z, v, d, lx, lz, cx, cz, pz, wallMs, rttMs, phase, dialKmh, gearLetters,
 *         hz: { capKmh, brake }, untilMs, entry, disarmed, keys: { W, S, steer },
 *         heldS, blindP90S, edgeSeq, edgeAtMs }   — built by `pathObservation` (§10), on both sides
 * cmd = { steer: −1|0|+1, W, S, returnNow, why, flags }
 */
/**
 * THE BODY-CLEARANCE REFUSAL — what `bay-lateral` became on 2026-09-16.
 *
 * THE RULE, IN ONE SENTENCE: the follower refuses when it predicts that its own
 * drive would fail canary gate G10. Same chassis box, same mounted bodies, same
 * `obbSeparation`, same `DRIVE_CLEARANCE_FLOOR_M` — see
 * `drive-clearance.mjs bodyClearanceGuard` for why that is the only rule that
 * cannot disagree with either the planner or the gate.
 *
 * WHAT IT REPLACED, AND WHY. `bay-lateral` measured the CENTRE'S LATERAL OFFSET
 * FROM THE BAY AXIS against a hand-kept face per side minus a tuned margin, at a
 * fixed 10 deg worst-case yaw, inside a longitudinal window and a yaw window. It
 * was a stand-in for body clearance in a harness that could not measure body
 * clearance. Both now measure it — `body-screen.mjs` for a plan, this file's
 * `drive-clearance.mjs` for a drive — and the proxy had begun to CONTRADICT them:
 * the clearance-maximising witness for sc-park-wall ends about 0.16 m off the bay
 * axis on purpose, and the proxy refused it before any contact. A proxy that
 * disagrees with the measurement it stands in for has to be retired, not re-tuned;
 * re-tuning it is what produced the corridor widening and the margin cut before it.
 *
 * WHAT IS KEPT. It still fires on the PREDICTED STOP, because a guard that waits
 * for the contact is not a guard. The whole braking ribbon is measured, not just
 * its end, which the lateral proxy never did. The refusal is still named and still
 * attributed to THE HARNESS (`pathReverseOutcome` branch 1).
 *
 * TWO TESTS, BOTH WITH A DEFINITIONAL THRESHOLD AND NEITHER WITH A KNOB:
 *
 *   HELD      every segment, every speed. The pose the car is actually AT is
 *             inside `DRIVE_CLEARANCE_FLOOR_M`. That drive has ALREADY failed
 *             G10; there is nothing left to predict. No scope, no model, no
 *             assumption — it is the gate's own measurement, taken live.
 *   PREDICTED reverse segments. Braking from here, on the arc the car is on, the
 *             chassis would still reach CONTACT — separation at or under the
 *             scan's own resolution bound. That is the "would end resting against
 *             a flank" test stated exactly: resting against something is contact,
 *             not a margin.
 *
 * WHY THE PREDICTED TEST IS AT CONTACT AND NOT AT THE FLOOR. Because a legitimate
 * parking manoeuvre passes closer to a parked car than its own stopping distance,
 * and it does so while steering away. Measured on the clean bench: sc-park-van
 * holds 0.1405 m from the held van with 0.355 m of stopping distance in hand, so
 * "could I stop clear of the floor from here?" is FALSE all through an honest
 * park — requiring the floor at the predicted stop refused 21 of 200 clean bench
 * drives, the same mistake `bay-lateral` made, one layer down. What is never
 * legitimate is being unable to stop before TOUCHING, and that is the test.
 *
 * WHY THE PREDICTED TEST IS SCOPED TO REVERSE, AND WHAT THAT COSTS. The model
 * FREEZES THE STEERING, so it is a model of the car's future only where the
 * steering is not what saves it. On a forward approach it is not: measured, the
 * three clean-bench refusals it produced there were all a car driving PAST a
 * parked row at 1.4 m with a 2-3 deg/m arc and 1.5 m of stopping distance
 * (sc-park-gap-long F0, sc-park-zebra F0) — a car that steers past, as it did.
 * Reverse is where the proxy it replaced applied too, and for the same reason. So
 * the predicted test carries the reverse, and the HELD test — which assumes
 * nothing at all — carries every segment, which is more than `bay-lateral` ever
 * covered: it had no forward coverage whatsoever.
 *
 * MEASURED, 10 lessons x 20 seeds of clean bench drives + 8 card-drained ones:
 * zero clean refusals, tightest clean drive 0.0866 m against a 0.05 m floor; and
 * every card-drained sc-park-left run — each of which drove 0.31-0.78 m INTO
 * `lotlf-bay-2` with the guard off — refused, every refusal issued while the car
 * was still clear of the car it was heading for.
 *
 * WHAT IS DROPPED. The bay window, the yaw gate, the mouth inset and the margin.
 * They existed to make a position-only formula safe, and they were not free:
 * measured on the clean bench, the closest the car ever came to either AUTHORED
 * face was OUTSIDE both windows — the garage wall at 0.1874 m with the centre
 * 4.32 m down the bay axis and 104 deg off it, the alley wall at 0.8278 m at
 * 2.94 m and 150 deg. The proxy could not see either authored face at the pose
 * that mattered. This guard is armed for every segment and sees both.
 *
 * THE PREDICTION. Direction and yaw rate come from the same place the lateral
 * proxy's `latRate` came from — the last two entries of the yaw history, which
 * are 0.3-1.5 m apart and therefore not the sub-tick noise — normalised PER METRE
 * of travel and carried forward over the stopping distance. Before the history
 * has two entries (the first metre of a reverse, where the proxy simply predicted
 * nothing) it falls back to the segment's own heading direction, which is strictly
 * more than the proxy did.
 */
export function bodyClearanceRefusal(state, obs, seg, pose, psi, vAbs, tune = PATH_TUNE) {
  const bg = state.bodyGuard;
  if (!bg || bg.off === true) return null;
  if (bg.ok !== true || !bg.guard) {
    return refusePathState(state, "body-clearance-unreadable", `the bodies ${state.plan?.lesson ?? "(no lesson)"} mounts could not be read, so no pose of this drive can be screened against them — ${bg?.why ?? "no reason recorded"}. A drive the safety screen cannot measure is refused, never driven unscreened`);
  }
  if (!pose || !Number.isFinite(psi)) return null;
  const g = bg.guard;
  if (g.count === 0) return null;

  // the stopping distance from here: the same model the end-overrun and stop planner use
  const vm = vAbs / 3.6;
  const gear = seg?.gear === -1 ? -1 : 1;
  const stopM = vm * (tune.pedals.landS + brakeAttackDeadS(vAbs, gear) + (Number.isFinite(obs.blindP90S) ? obs.blindP90S : 0)) + (vm * vm) / (2 * brakeCapMps2(vAbs));

  // the heading change per metre of travel the car is CURRENTLY making, from the yaw
  // history (0.3-1.5 m chords — the same source the retired proxy's `latRate` came from,
  // and not the sub-tick noise). Before the history has two entries, the arc is a straight
  // line along the segment's own heading, which is still more than the proxy predicted.
  const hist = state.yaw.history;
  let kappaDegPerM = 0;
  if (hist.length >= 2) {
    const a = hist[hist.length - 2];
    const b = hist[hist.length - 1];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 1e-6 && Number.isFinite(a.camPsi) && Number.isFinite(b.camPsi)) kappaDegPerM = wrapDeg(b.camPsi - a.camPsi) / d;
  }
  const from = { x: pose.x, z: pose.z, psiDeg: psi };
  const w = g.brakingRibbon(from, { kappaDegPerM, gear, distanceM: stopM, screenAtM: g.floorM });
  const here = g.at(pose.x, pose.z, psi);

  const bb = state.books.clearance;
  let book = bb.find((x) => x.k === seg?.k);
  if (!book) { book = { k: seg?.k ?? null, gear, worstHeldM: Infinity, worstStopM: Infinity, body: null, stopBody: null, floorM: g.floorM, bodies: g.count }; bb.push(book); }
  if (here.m < book.worstHeldM) { book.worstHeldM = r3(here.m); book.body = here.body; }
  if (w.m < book.worstStopM) { book.worstStopM = r3(w.m); book.stopBody = w.body; }

  // HELD — already inside the floor this drive will be gated by
  if (here.m < g.floorM) {
    return refusePathState(state, "body-clearance", `${gear === -1 ? "R" : "F"}${seg?.k ?? "?"}: the chassis box is HOLDING a pose ${r3(here.m)} m from ${here.body ?? "?"} — inside the ${g.floorM} m floor drive-clearance.mjs gates this drive by, so this drive has already failed G10. ${g.why}`);
  }
  // PREDICTED — braking now, on the arc it is on, it would still reach contact.
  // Reverse only: the model freezes the steering, and on a forward approach the steering is
  // exactly what carries the car past a parked row (see the header for the three measured
  // false alarms it produced there).
  if (gear === -1 && w.m <= w.boundM) {
    return refusePathState(state, "body-clearance", `${gear === -1 ? "R" : "F"}${seg?.k ?? "?"}: the chassis box is ${r3(here.m)} m from ${here.body ?? "?"}, and braking from here over ${r2(stopM)} m on the ${r2(kappaDegPerM)}°/m arc it is turning it would reach ${r3(w.m)} m of ${w.body ?? "?"} at ${r2(w.atM)} m into the stop — CONTACT, within this scan's own ${r3(w.boundM)} m resolution bound. Worst held on this segment so far ${book.worstHeldM} m. ${g.why}`);
  }
  return null;
}

export function pathStep(state0, obs) {
  let state = { ...state0, flags: { ...state0.flags } };
  const tune = state.tune ?? PATH_TUNE;
  const now = Number.isFinite(obs.wallMs) ? obs.wallMs : 0;
  const v = Number.isFinite(obs.v) ? obs.v : 0;
  const vAbs = Math.abs(v);
  const keys = obs.keys ?? { W: false, S: false, steer: 0 };
  const seg = segOf(state);
  const row = { t: now, f: obs.f ?? null, x: r3(obs.x), z: r3(obs.z), v: r2(v), mode: state.mode, seg: seg?.k ?? null, rtt: obs.rttMs ?? null, d: obs.d ?? null };
  const cmd = { steer: 0, W: false, S: keys.S && (state.latch.brake || state.latch.wBrake) && vAbs > 0, returnNow: false, why: null };

  // ── THE STALL DETECTOR (§3.1, S-1) — one detector, ordered so a card can never refuse ──
  {
    const st = { ...state.stall };
    if (obs.entry) st.entries += 1;
    if (obs.f !== st.lastFrame || st.frameAt === null) {
      if (obs.f !== st.lastFrame) {
        st.lastFrame = obs.f;
        st.entries = obs.entry ? 1 : 0;
        st.onset = null;
      }
      st.frameAt = now;
    }
    const stallMs = now - st.frameAt;
    st.maxStallMs = Math.max(st.maxStallMs, stallMs);
    if (obs.pz === true) {
      st.returns += 1;
      st.pauseLayerReturns += 1;
      st.frameAt = now;
      st.entries = 0;
      st.onset = null;
      state.stall = st;
      state.books.returns.pause += 1;
      return out(release(state), { ...cmd, W: false, returnNow: true, why: "pause layer up — the outer probe drains it" }, { ...row, why: "pause-layer" });
    }
    if (stallMs >= tune.stall.returnMs) {
      st.onset ??= { v: Math.abs(state.last?.v ?? vAbs), accel: seg?.gear === -1 ? keys.S : keys.W };
      state.stall = st;
      if (stallMs >= tune.stall.refuseMs && st.entries >= tune.stall.entries && !st.drained && (st.onset.v > 1 || st.onset.accel)) {
        state = refusePathState(state, "pose-stale", `the pose probe's frame id has not advanced for ${Math.round(stallMs)} ms across ${st.entries} runner entries with no pause layer on the glass (camera mode changed, or the page stalled)`);
        return out(release(state), { ...cmd, W: false, S: false, returnNow: true, why: "pose-stale" }, { ...row, why: "pose-stale" });
      }
      st.returns += 1;
      state.books.returns.stalled += 1;
      return out(release(state), { ...cmd, W: false, returnNow: true, why: "frames stalled" }, { ...row, why: "stalled" });
    }
    state.stall = st;
  }

  const pose = Number.isFinite(obs.x) && Number.isFinite(obs.z) ? { x: obs.x, z: obs.z } : null;
  if (!pose) return out(release(state), { ...cmd, W: false, returnNow: true, why: "no pose" }, { ...row, why: "no-pose" });

  // ── YAW, MOTION, LANDING, COAST BOOKS ──
  const cam = yawFromCamOffset({ lx: obs.lx, lz: obs.lz, wx: obs.cx - obs.x, wz: obs.cz - obs.z });
  const stepM = state.last ? Math.hypot(pose.x - state.last.x, pose.z - state.last.z) : 0;
  const prevPsi = state.yaw.psi;
  state.yaw = foldYaw(state.yaw, { cam, pose, v, u: state.lastU });
  const psi = state.yaw.psi;
  row.psi = r2(psi);
  row.src = state.yaw.source;
  if (Number.isFinite(prevPsi) && Number.isFinite(psi)) {
    state.authority = foldAuthority(state.authority, { u: state.lastU, v, stepM, dPsi: wrapDeg(psi - prevPsi) });
  }
  // landing (§5.5, F-S1): SELF-REPORT only — isolated edges, one sample per edge, feeds nothing (CODE-REVIEW-1 M1)
  state.landing = foldSteerLanding(state.landing, { edgeSeq: obs.edgeSeq, edgeAtMs: obs.edgeAtMs, steerKey: keys.steer ?? 0, v, psi, prevPsi, prevReadMs: state.last?.t ?? null, now });
  // coast decel: moving between 1 and 6 km/h with no pedal down for ≥ 0.5 s
  if (!keys.W && !keys.S && vAbs > 1 && vAbs < 6) {
    state.coastFit ??= { v0: vAbs, t0: now };
    if (now - state.coastFit.t0 >= 500 && state.coastFit.v0 > vAbs) {
      const a = ((state.coastFit.v0 - vAbs) / 3.6) / ((now - state.coastFit.t0) / 1000);
      if (a > 0.05 && a < 2) state.aCoastMeas = state.aCoastMeas === null ? a : 0.7 * state.aCoastMeas + 0.3 * a;
      state.coastFit = null;
    }
  } else state.coastFit = null;
  state.restSince = vAbs <= tune.pedals.restKmh ? state.restSince ?? now : null;
  // the cam yaw over the CURRENT rest window, so the gear-change acceptance reads a
  // median and not one instantaneous read that a pitch leak or noise can move (CODE-REVIEW-1 M2)
  state.restYaw = state.restSince !== null && state.yaw.source === "cam" && Number.isFinite(psi) ? [...(state.restYaw ?? []).slice(-60), psi] : state.restSince === null ? [] : state.restYaw ?? [];
  state.last = { x: pose.x, z: pose.z, v, t: now, psi };

  const phase = obs.phase;
  state.lastPhase = phase;

  if (state.mode === "refused") return refusedStep(state, obs, cmd, row, vAbs, keys, now);

  // ── THE BODY THE LESSON MOUNTS, BEFORE CONTACT (drive-clearance.mjs) ──
  {
    const hit = bodyClearanceRefusal(state, obs, seg, pose, psi, vAbs, tune);
    if (hit) return refusedStep(hit, obs, cmd, row, vAbs, keys, now);
  }

  // A forward mode after a disarm with the cluster in «R», or a disarm that REPORTED failure (N4 fix 2), drives nothing.
  if (["forward-settle", "follow", "creep"].includes(state.mode) && seg?.gear === 1 && state.segIndex > 0 && state.plan.segments[state.segIndex - 1]?.gear === -1) {
    if (lettersR(obs.gearLetters) || obs.disarmed === false) {
      state = refusePathState(state, "disarm-failed", obs.disarmed === false ? "the disarm reported failure (reverse.disarmed === false) — whatever the cluster reads, no forward segment may be driven on it" : "the cluster reads «R» in a forward mode after a disarm");
      return refusedStep(state, obs, cmd, row, vAbs, keys, now);
    }
  }

  switch (state.mode) {
    case "follow":
    case "creep":
      if (phase === "reverse") return refusedStep(refusePathState(state, "lost-R", "the outer phase is reverse while a forward segment is being driven"), obs, cmd, row, vAbs, keys, now);
      if (phase !== "roll") {
        if (state.flags.wantStop) state.mode = "hold-stop";
        return out(release(state), { ...cmd, W: false, why: `phase ${phase} — the outer stop branch owns the pedals` }, { ...row, why: `phase ${phase}` });
      }
      return forwardStep(state, obs, cmd, row, pose, psi, v, vAbs, stepM, now, keys, { releaseLatch: false });
    case "hold-stop":
      return holdStopStep(state, obs, cmd, row, pose, psi, vAbs, now, keys);
    case "await-roll":
      if (phase === "roll") {
        state.flags.stopRelease = false;
        state.flags.wantStop = false;
        state.mode = state.pendingMode ?? "follow";
        state.pendingMode = null;
        return forwardStep(state, obs, cmd, row, pose, psi, v, vAbs, stepM, now, keys, { releaseLatch: true });
      }
      return out(release(state), { ...cmd, W: false, why: "waiting for the outer stop → roll" }, { ...row, why: "await-roll" });
    case "hold-for-arm":
      if (phase === "reverse") {
        state.segIndex = seg.gear === -1 ? state.segIndex : state.segIndex + 1;
        state.flags.atGearChange = false;
        // THE GEAR-CHANGE STOP'S REQUEST IS SERVED HERE, SO IT IS WITHDRAWN HERE (2026-09-21).
        // `wantStop` rose when the approach came to rest at its gear change (forwardStep); the
        // outer tick answered it with «stop», and has now answered `atGearChange` with «reverse».
        // Until today nothing lowered it on this path, so it was carried through the whole R
        // segment and the outer tick read it AGAIN on its first «roll» after the disarm
        // (lesson-audit.mjs `pathFollow.wantStop === true && phaseTicks >= 1`; path-bench the
        // same): the forward segment after every reverse began inside a stop nobody asked for.
        // On a micro square-up that stop ended the leg — the creep saw «stop», went hold-stop,
        // consumed its routeEnd and never drove (sc-park-gap-short: 0.11–0.36 m of the authored
        // square-up left undriven on every seed); on a full forward segment it cost a spurious
        // stop and dwell (sc-ed-poligon-chain F2, F4).
        state.flags.wantStop = false;
        state.mode = "reverse-settle";
        state.settle = { since: now, restFrom: null };
        state.latch = { brake: false, coast: false, wBrake: false };
        state.yaw = resetYawHistory(state.yaw);
        return reverseSettleStep(state, obs, cmd, row, pose, psi, vAbs, now, keys);
      }
      return out(release(state), { ...cmd, W: false, why: "at the gear change — waiting for the outer arm gate" }, { ...row, why: "hold-for-arm" });
    case "reverse-settle":
      if (phase !== "reverse") return refusedStep(refusePathState(state, "lost-R", `the outer phase left reverse (${phase}) before the reverse began`), obs, cmd, row, vAbs, keys, now);
      return reverseSettleStep(state, obs, cmd, row, pose, psi, vAbs, now, keys);
    case "reverse-follow":
    case "reverse-stop":
      if (phase !== "reverse") return refusedStep(refusePathState(state, "lost-R", `the outer phase left reverse (${phase}) mid-segment — the selector left R or the reverse budget ran out`), obs, cmd, row, vAbs, keys, now);
      return reverseStep(state, obs, cmd, row, pose, psi, v, vAbs, stepM, now, keys);
    case "reverse-capture":
      return captureStep(state, obs, cmd, row, pose, vAbs, now, keys);
    case "hold-for-disarm":
      {
        // before the phase test: the disarm burst runs between the probe that read the banner and
        // this runner call, so a banner that arrives with the disarm is still this R segment's
        const hit = collisionRefusal(state, obs, pose, vAbs, keys, now);
        if (hit) return refusedStep(hit, obs, cmd, row, vAbs, keys, now);
      }
      if (phase === "roll") {
        const from = state.endPoses[seg.k]?.pose ?? pose;
        state.segIndex += 1;
        state.flags.segmentDone = false;
        state.mode = "forward-settle";
        state.settle = { since: now, restFrom: null, from, fromPsi: psi };
        state.latch = { brake: false, coast: false, wBrake: false, hold: false };
        state.yaw = resetYawHistory(state.yaw);
        return forwardSettleStep(state, obs, cmd, row, pose, psi, vAbs, now, keys);
      }
      {
        const over = overrunRefusal(state, pose, vAbs);
        if (over) return refusedStep(over, obs, cmd, row, vAbs, keys, now);
        const hp = holdPedalsR(state, obs, vAbs, keys);
        return out(release(state), { ...cmd, W: hp.W, S: false, why: `segment done — waiting for the outer disarm (${hp.why})` }, { ...row, why: "hold-for-disarm" });
      }
    case "forward-settle":
      return forwardSettleStep(state, obs, cmd, row, pose, psi, vAbs, now, keys);
    case "route-end": {
      const inR = seg?.gear === -1;
      const hit = inR ? collisionRefusal(state, obs, pose, vAbs, keys, now) : null;
      if (hit) return refusedStep(hit, obs, cmd, row, vAbs, keys, now);
      const over = inR ? overrunRefusal(state, pose, vAbs) : null;
      if (over) return refusedStep(over, obs, cmd, row, vAbs, keys, now);
      const hp = inR ? holdPedalsR(state, obs, vAbs, keys) : null;
      // a forward route end reached without the hold-stop dwell (a skipped micro, or a dwell
      // shorter than the capture) is still the rest the product grades
      if (!inR) state = captureForwardRestEndPose(state, pose, vAbs, now, { tag: "routeEnd" });
      return out(release(state), { ...cmd, W: inR ? hp.W : false, S: inR ? false : keys.S, why: `route end — holding${inR ? ` (${hp.why})` : ""}` }, { ...row, why: "route-end" });
    }
    default:
      return out(release(state), { ...cmd, W: false, why: `unknown mode ${state.mode}` }, row);
  }
}

function refusedStep(state, obs, cmd, row, vAbs, keys, now) {
  const seg = segOf(state);
  const inR = lettersR(obs.gearLetters) || (obs.phase === "reverse" && seg?.gear === -1);
  const dial = obs.dialKmh;
  const vGate = Math.min(vAbs, Number.isFinite(dial) && dial >= 0 ? dial : vAbs);
  let W = false;
  let S = false;
  if (inR) {
    // brake and HOLD (PATH_TUNE.pedals.rHoldPressMinKmh): a W that went down while moving
    // stays down through rest; a fresh one only while moving; never the accelerator
    const held = holdPedalsR(state, obs, vAbs, keys);
    W = held.W;
    state.latch = { ...state.latch, hold: true };
  } else {
    S = keys.S ? true : vGate >= pressMinFor((state.tune ?? PATH_TUNE).pedals);
  }
  state.restAfterRefusal = vAbs <= 0.3 ? state.restAfterRefusal ?? now : null;
  state.done = state.restAfterRefusal !== null && now - state.restAfterRefusal >= 500;
  const last = state.refusals[state.refusals.length - 1];
  return out(release(state), { ...cmd, steer: 0, W, S, returnNow: state.done, why: `refused: ${last?.code}` }, { ...row, mode: "refused", why: last?.code });
}

/** The centre's signed distance to the current R witness's end along its end heading (+ = still before it); null without a witness. */
function witnessToEndM(state, pose) {
  const w = state.witness;
  if (!w || !pose) return null;
  const row = w.rows[w.rows.length - 1];
  const h = headingUnit(row[5]);
  return (pose.x - row[1]) * h.x + (pose.z - row[2]) * h.z;
}

/**
 * AN R SEGMENT'S END IS NOT PASSED AFTER IT WAS CAPTURED EITHER: in capture's hold, the disarm wait
 * and the route end, a car that has moved more than `stops.overrunM` past its witness end (a creep,
 * a drain that lifted the brake) is refusal `end-overrun`, never a quiet «followed».
 */
function overrunRefusal(state, pose, vAbs) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  if (seg?.gear !== -1) return null;
  const toEndM = witnessToEndM(state, pose);
  if (toEndM === null || !(toEndM < -tune.stops.overrunM)) return null;
  return refusePathState(state, "end-overrun", `R${seg.k}: after the end was captured the car moved on — its centre is ${r2(-toEndM)} m past the witness end (tolerance ${tune.stops.overrunM} m) at ${r2(vAbs)} km/h`);
}

/**
 * A COLLISION ENDS THE LEG IN EVERY R MODE (2026-09-15, CODE-REVIEW-parkleft M1): reverse-follow,
 * reverse-capture, the disarm wait and the route end. Brake, hold, never throttle (refusedStep).
 *
 * Two witnesses, either one enough:
 *  · the product's own «crash-pinned» banner as the OUTER probe last read it (`obs.crash`) — a tick
 *    old, so a contact made in the last metre reaches the runner only AFTER the car it pinned has
 *    been captured. It was read only in reverse-follow until 2026-09-15, and the bench's contact
 *    0.5 m before sc-park-left's end ended «followed» (probe-latecrash seed 2);
 *  · a deceleration no held pedal can make (`foldImpact`) — BLIND WHILE W IS DOWN, because in R W
 *    is the product's functional brake: its crawl-capped 5.3 m/s² read over wall-stamped reads
 *    (a 538 ms rtt stamps a read up to half a second late) is indistinguishable from a contact.
 *    So under the final brake the banner is the ONLY runner witness, and it must be read in every
 *    mode the car can be in when it arrives. The fold runs only in phase reverse (W is D's
 *    accelerator after a disarm).
 * What neither witness sees reaches the reverse outcome independently: the segment's crash-pinned
 * route-hold ticks and a collision in the debrief (pathReverseOutcome branches 5.2, 5.3).
 */
function collisionRefusal(state, obs, pose, vAbs, keys, now, toEndM = undefined) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  if (seg?.gear !== -1) return null;
  if (obs.phase === "reverse") state.impact = foldImpact(state.impact ?? { prev: null, reads: 0, peakMps2: 0 }, { vAbs, now, brakeHeld: keys.W === true }, tune.impact);
  const hit = obs.phase === "reverse" && state.impact?.hit === true;
  if (obs.crash !== true && !hit) return null;
  const toEnd = toEndM === undefined ? witnessToEndM(state, pose) : toEndM;
  const where = `${toEnd === null ? "at an unknown distance from" : `${r2(toEnd)} m ${toEnd >= 0 ? "before" : "past"}`} the witness end`;
  const late = state.mode === "reverse-follow" || state.mode === "reverse-stop" ? "" : ` in «${state.mode}» (after the end was captured — a contact during the final braking, where the impact fold is blind)`;
  const why = obs.crash === true
    ? `R${seg.k}: the product holds the car crash-pinned (the outer probe's route-hold banner)${late} at ${r2(vAbs)} km/h, ${where}`
    : `R${seg.k}: an impact — ${state.impact.reads} consecutive reads decelerating at up to ${r2(state.impact.peakMps2)} m/s² with no brake down${late}, ${where}`;
  state.books.impacts.push({ k: seg.k, toEndM: r3(toEnd), kmh: r2(vAbs), peakMps2: r2(state.impact?.peakMps2 ?? 0), crashPinned: obs.crash === true, atMode: state.mode });
  return refusePathState(state, "collision", why);
}

/** The cluster reads exactly «D»: W is D's accelerator now, so an R hold must let go of it. */
const lettersD = (g) => Array.isArray(g) && g.length === 1 && g[0] === "D";

/**
 * THE R HOLD (2026-09-15): S never; W kept if down; a fresh W only while MOVING at
 * ≥ rHoldPressMinKmh with the dial reading ≥ 1 (see PATH_TUNE.pedals for the LAW 1 proof);
 * and nothing at all once the cluster reads «D» (a toggle nobody asked for makes W the
 * accelerator). Used after any final latch, in capture, route end, the disarm wait and a
 * refused R leg.
 */
export function holdPedalsR(state, obs, vAbs, keys) {
  const p = (state.tune ?? PATH_TUNE).pedals;
  if (lettersD(obs.gearLetters)) return { W: false, S: false, why: "the cluster reads «D» — W is the accelerator there; released" };
  const dial = obs.dialKmh;
  const W = keys.W === true || (vAbs >= p.rHoldPressMinKmh && Number.isFinite(dial) && dial >= 1);
  return { W, S: false, why: W && !keys.W ? "hold: W pressed while moving" : W ? "hold: W held" : "hold: at rest, nothing to press" };
}

/**
 * THE RUNNER'S BUDGET (§5.2, 2026-09-15). TICK_MS everywhere, except while a reverse
 * segment is NEAR LOCK (state.nearLock, set by reverseStep), where it is
 * `runner.nearLockBudgetMs`. What it buys: each runner exit releases the wheel (the yield
 * contract, §5.3, unchanged — no key crosses a screenshot, because the outer tick only runs
 * between runner calls), and a lock-limited arc has no turning to spare for the dip and the
 * re-press. What it costs: `guidePose` writes the INDEPENDENT samples once per outer tick,
 * so the reverse's own samples thin out by the same factor; `routeDeviation` needs five
 * moving ones (guidance.mjs routeDeviation minSamples) and the in-bay check needs the bay.
 * The runner re-reads this every sub-tick, so a call extended for a lock-limited span ends
 * at TICK_MS once the span does.
 */
export function pathRunnerBudgetMs(state, baseMs) {
  const t = state?.tune ?? PATH_TUNE;
  if (state && state.mode === "reverse-follow" && state.nearLock === true && !state.done) return Math.max(baseMs, t.runner.nearLockBudgetMs);
  return baseMs;
}

/** The largest |witness δ| / lock over [s, s + windowM] of a polyline (planner rows carry δ). */
export function lockDemandAhead(poly, s, windowM, lockRad = VEHICLE.MAX_ANGLE_RAD) {
  if (!poly) return 0;
  let m = 0;
  for (let i = 0; i < poly.n; i++) {
    if (poly.S[i] < s || poly.S[i] > s + windowM) continue;
    if (poly.pts[i].ext || poly.pts[i].lead) continue;
    m = Math.max(m, Math.abs(poly.pts[i].delta ?? 0) / lockRad);
  }
  return m;
}

/**
 * IMPACT (PATH_TUNE.impact): consecutive reads decelerating harder than any pedal the harness
 * holds can make it, while the functional brake is not down. Pure fold.
 */
export function foldImpact(st, { vAbs, now, brakeHeld }, t = PATH_TUNE.impact) {
  const s = { ...st };
  const prev = s.prev;
  s.prev = { v: vAbs, t: now };
  if (!prev || !Number.isFinite(vAbs) || !(now - prev.t >= t.minDtMs)) return s;
  const decel = ((prev.v - vAbs) / 3.6) / ((now - prev.t) / 1000);
  if (!brakeHeld && prev.v > t.minKmh && decel >= t.decelMps2) {
    s.reads += 1;
    s.peakMps2 = Math.max(s.peakMps2, decel);
  } else s.reads = 0;
  s.hit = s.reads >= t.reads || (s.reads >= 1 && decel >= t.hardMps2);
  return s;
}

function steerCommand(state, u, obs, v) {
  const tune = state.tune ?? PATH_TUNE;
  const quantumS = tune.runner.pollMs / 1000;
  const heldS = Number.isFinite(obs.heldS) ? obs.heldS : quantumS;
  const duty = u === 0 ? 0 : dutyForWheelFraction(u, Math.max(1, Math.abs(v)));
  const m = modulate(state.mod, duty, heldS, quantumS);
  state.mod = m.state;
  state.lastU = u;
  return m.k;
}

function forwardStep(state, obs, cmd, row, pose, psi, v, vAbs, stepM, now, keys, { releaseLatch }) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  if (!state.poly) {
    state = enterForward(state, pose, psi);
    if (state.mode === "refused") return refusedStep(state, obs, cmd, row, vAbs, keys, now);
  }
  const creep = state.mode === "creep";
  const cursor = advanceCursor(state.cursor, state.poly, pose, stepM + 0.05);
  state.cursor = cursor;
  row.s = r2(cursor.s);
  row.ct = r3(cursor.ctM);
  if (!creep && (!cursor.found || Math.abs(cursor.ctM) > tune.lost.fwdM)) {
    state.lostCount += 1;
    if (state.lostCount >= tune.lost.consecutive) {
      return refusedStep(refusePathState(state, "lost", `F${seg.k}: ${cursor.found ? `${r2(cursor.ctM)} m` : "no projection"} off the witness for ${state.lostCount} sub-ticks (limit ${tune.lost.fwdM} m)`), obs, cmd, row, vAbs, keys, now);
    }
  } else state.lostCount = 0;
  const bk = bookOf(state);
  if (bk && cursor.found) bk.ctMaxM = r3(Math.max(bk.ctMaxM, Math.abs(cursor.ctM)));

  // ── speed and the stop being aimed at ──
  const rAhead = radiusAhead(state.poly, cursor.s);
  const vCap = stabilityCapKmh(rAhead, state.tauEffS, 1);
  let stop;
  let toStopM;
  if (creep) {
    stop = state.currentStop;
    toStopM = state.creepTarget - armFrame(state.creepFrame, pose, null).alongM;
  } else ({ stop, toStopM } = nextStopD(state, pose, cursor));
  if (obs.hz?.brake === true && !creep) {
    stop = state.currentStop ?? { tag: "hazard", dwellS: 1.0, consumed: false, hazard: true };
    toStopM = 0;
  }
  const frac = (cursor.s - state.poly.sStart) / Math.max(1e-6, state.poly.lengthM);
  const stopsAhead = state.stops.filter((st) => !st.consumed).map((st) => ({ deltaS: st === stop ? toStopM : Number.isFinite(st.sM) ? st.sM - cursor.s : Infinity }));
  const sp = speedTarget({ profileKmh: seg.speed?.movingMedianKmh, frac, stopsAhead, hzCapKmh: obs.hz?.capKmh ?? null, vCapKmh: vCap });
  let vT = sp.vT;
  if (!creep && Math.abs(cursor.ctM) > tune.lost.fwdSlowM) vT = Math.min(vT, tune.lost.fwdSlowKmh);
  if (creep) vT = tune.stops.creepKmh;
  if (sp.capped) state.books.stabilityCappedM += stepM;
  row.vT = r2(vT);
  row.toStop = r3(toStopM);

  // ── the wheel ──
  let u = 0;
  let k;
  if (!creep && !seg.micro && Number.isFinite(psi)) {
    const Ld = lookaheadFor(Math.max(vAbs, 3), state.tauEffS, 1);
    const T = pointAt(state.poly, cursor.s + Ld);
    const body = toBodyFrame(pose, psi, T, { rear: true });
    const law = centrePursuit({ xt: body.x, yt: body.y, kmh: Math.max(vAbs, 1) });
    u = law.u;
    if (law.saturated && bk) bk.saturatedM = r2(bk.saturatedM + stepM);
    state.books.pm.push(phaseMarginDeg(((Math.max(vAbs, 0.1) / 3.6) * state.tauEffS) / Ld));
    if (state.books.pm.length > 4000) state.books.pm.splice(0, 2000);
  }
  if (seg.micro && seg.gear === 1 && Number.isFinite(psi)) {
    // THE MICRO SQUARE-UP STEERS (2026-09-21): its creep closes the heading to the micro's
    // authored end heading over the distance left to that end pose (squareUpCommand). A pure
    // pursuit cannot do this job: the micro is shorter than any lookahead, so its target point
    // would sit on the 3 m straight extension past the end and command the car straight.
    const sq = squareUpSteer(state, obs, pose, psi, vAbs, creep ? "creep" : "follow");
    u = sq.u;
    k = sq.k;
  } else if (creep && state.creepYaw && Number.isFinite(psi)) {
    // THE HEADING RE-APPROACH STEERS (yawReapproach): the square-up law toward the arm band's
    // centre heading over the distance left to the creep's target along.
    const law = squareUpCommand({ psi, targetPsi: state.creepYaw.targetPsi, dGoM: Math.max(0, toStopM), kmh: vAbs }, tune.squareUp ?? PATH_TUNE.squareUp);
    u = law.u;
    k = steerCommand(state, u, obs, v);
    const yb = state.books.yawCreeps?.[state.books.yawCreeps.length - 1];
    if (yb) {
      yb.subTicks += 1;
      if (k !== 0) yb.keyTicks += 1;
      yb.errEndDeg = law.errDeg === null ? null : r2(law.errDeg);
    }
  } else k = steerCommand(state, u, obs, v);
  state.sign = foldPathSign(state.sign, { u, v, stepM, psi });
  if (state.sign.verdict === "contradicts") return refusedStep(refusePathState(state, "sign-contradicts", state.sign.why), obs, cmd, row, vAbs, keys, now);
  row.u = r3(u);
  row.k = k;

  // ── the pedals ──
  // THE MICRO CREEP LIFTS W WHERE ITS RUN-OUT ENDS AT THE END POSE (2026-09-21). Until the stale
  // gear-change `wantStop` was withdrawn this creep never drove, so its stop was never measured;
  // driven, the coast branch of `stopTrigger` let a W ramped past the crawl ceiling carry the car
  // up to 0.61 m past the end pose. THE PEDAL IS BOUNDED, NOT TRACKED: from rest it cannot have
  // risen faster than the attack ramp since W was FIRST commanded in this creep, so
  // min(1, elapsed / attackS) is never below the real pedal, whatever the runner yields did to
  // the key in between (each yield lifts W for the outer tick, and the first bench version that
  // reset the estimate on that lift read the pedal as 0 while it stood at 0.67 and let
  // sc-park-gap-short seed 16 run 0.52 m past its end). The run-out grows with the pedal, so a
  // bound from above can only lift early.
  const aCoastNow = state.aCoastMeas ?? tune.pedals.aCoastMps2;
  let anticipateM = 0;
  if (creep && (seg.micro === true || state.creepYaw) && Number.isFinite(toStopM) && !state.latch.brake && !state.latch.coast) {
    const pedal = Number.isFinite(state.creepWAt) ? clamp((now - state.creepWAt) / 1000 / CREEP_THROTTLE.attackS, 0, 1) : 0;
    const runOut = creepLiftRunOutM({ vKmh: vAbs, pedal, aCoast: aCoastNow, landS: tune.runner.pollMs / 1000, aMax: tune.pedals.aMaxMps2 });
    const trig = stopTrigger({ gear: 1, vAbs, vGate: Math.min(vAbs, Number.isFinite(obs.dialKmh) && obs.dialKmh >= 0 ? obs.dialKmh : vAbs), aBrake: state.aBrakeMeas, aCoast: aCoastNow, landS: tune.pedals.landS, pressMin: pressMinFor(tune.pedals) }, tune.pedals);
    anticipateM = Math.max(0, runOut - trig.distM);
    row.runOut = r3(runOut);
  }
  const g = pedalGrammar(state.latch, {
    gear: 1, vAbs, dialKmh: obs.dialKmh, vT, toStopM, aBrake: state.aBrakeMeas,
    aCoast: aCoastNow, keys, release: releaseLatch, anticipateM,
  }, tune.pedals);
  if (creep && (seg.micro === true || state.creepYaw) && g.W && !Number.isFinite(state.creepWAt)) state.creepWAt = now;
  if (g.latch.brake !== state.latch.brake || g.latch.coast !== state.latch.coast) {
    if ((g.latch.brake || g.latch.coast) && bk) {
      bk.branch = g.trigger?.branch ?? null;
      bk.vAtTriggerKmh = r2(vAbs);
      bk.triggerDistM = r3(g.trigger?.distM);
      if (g.latch.coast) bk.stopLate = "coast";
      state.currentStop = stop;
      state.brakeFit = g.latch.brake ? { v0: vAbs, s0: cursor.s, x0: pose.x, z0: pose.z } : null;
    }
  }
  state.latch = g.latch;
  if (bk && !g.S && !state.latch.brake && Number.isFinite(vT)) bk.overshootKmh = r2(Math.max(bk.overshootKmh, vAbs - vT));

  // ── frozen (§7.1): accelerator down, target above rest, frames advancing, no motion for 1.5 s ──
  {
    const fz = { ...state.frozen };
    if (g.W && vT > 1) {
      if (!fz.pose || Math.hypot(pose.x - fz.pose.x, pose.z - fz.pose.z) * 100 >= tune.frozen.cm) {
        fz.pose = pose;
        fz.since = now;
      } else if (now - fz.since >= tune.frozen.ms) {
        fz.returns += 1;
        fz.since = now;
        state.frozen = fz;
        state.books.returns.frozen += 1;
        return out(release(state), { ...cmd, W: false, returnNow: true, why: "frozen — the accelerator is down and the car has not moved for 1.5 s" }, { ...row, why: "frozen" });
      }
    } else {
      fz.pose = null;
      fz.since = null;
    }
    state.frozen = fz;
  }

  // ── at rest after a latched stop → ask the outer tick for the stop phase ──
  if ((state.latch.brake || state.latch.coast) && state.restSince !== null && now - state.restSince >= tune.pedals.restS * 1000) {
    state.flags.wantStop = true;
    state.currentStop ??= stop;
    if (state.brakeFit && bk) {
      const dist = Math.hypot(pose.x - state.brakeFit.x0, pose.z - state.brakeFit.z0);
      const v0 = state.brakeFit.v0 / 3.6;
      const eff = dist - v0 * (tune.pedals.landS + brakeAttackDeadS(state.brakeFit.v0, 1));
      const a = eff > 0.02 ? (v0 * v0) / (2 * eff) : null;
      const [lo, hi] = tune.pedals.measureBrakeRange;
      bk.aBrakeMeas = r2(a);
      if (Number.isFinite(a) && a >= lo && a <= hi) state.aBrakeMeas = a;
      else if (Number.isFinite(a)) bk.aBrakeSuspect = true;
      state.brakeFit = null;
    }
  }

  state.flags.shutterOk = vAbs <= 1 || (rAhead >= tune.shutter.straightRM && Math.abs(cursor.ctM) <= tune.shutter.ctM && Number.isFinite(psi) && Math.abs(wrapDeg(psi - pointAt(state.poly, cursor.s).psi)) <= tune.shutter.yawDeg);
  row.W = g.W;
  row.S = g.S;
  return out(state, { steer: k, W: g.W, S: g.S, returnNow: state.flags.wantStop, why: g.why }, row);
}

/**
 * THE FINAL FORWARD REST'S END POSE (2026-09-22, sc-park-gap-long), pure.
 *
 * WHY. `endPoses` — the camera yaw canary G6 validates against the product's «ъгъл» — was
 * written ONLY by `captureStep`, which only a REVERSE reaches («reverse-capture»). A plan whose
 * last rest is FORWARD never wrote one, so a forward-entry park (sc-park-gap-long, one forward
 * segment, credited 2/2 at «ъгъл 7.8°» on the 91e5a51 canary) could never have its end yaw
 * validated: G6 read «cam yaw UNMEASURED» with 505 rows of `src: "cam"` in the ledger, the
 * last 20 of them at rest in the route-end hold at 8.18–8.28°.
 *
 * WHEN. The product grades a park at a rest INSIDE the bay that it holds for `holdSec`
 * (platform/src/modules/sim/lessons/objectives.ts:5779-5797: `stopped`, `stoppedSinceT`,
 * `heldFor >= holdSec`, `headingOffsetDeg = axisAngleDiffDeg(tick.headingDeg, bay.headingDeg)`)
 * and then ends the lesson — the gap-long drive's rows stop mid-dwell, 1.0 s into a 2.23 s
 * authored route-end dwell, so a capture taken when the DWELL completes (holdStopStep's
 * route-end branch) would never have run. It is taken instead after the same
 * `PATH_TUNE.stops.captureS` of rest that `captureStep` waits (0.5 s, inside the product's
 * 1.5 s hold on sc-pgl-park, templates-parking3.ts:909), from the circular median of the cam
 * yaw over the SETTLED (later) half of the current rest window (`state.restYaw`, cam-sourced
 * reads only): the early half still carries the braking pitch leak (path-bench.mjs models
 * 1.7°/° of body pitch through a 0.15 s lag), which put the whole-window median +0.2…0.7° off
 * the plant on sc-park-gap-long seeds 1–6 and the settled half 0.04…0.17° — and the 91e5a51
 * ledger's own rest reads fall 8.28 → 8.18° the same way. Then it goes through the same
 * `captureEndPose` — so a latched `camYawSuspect` still reads UNMEASURED, never a number.
 *
 * WHICH REST. Only the LAST segment's, only a FORWARD one, and only the route's final stop:
 * an authored stop earlier on the same segment (gap-long's at arc 96.6) is not the pose the
 * product grades. Written once per segment; a reverse's capture is never overwritten.
 */
export function captureForwardRestEndPose(state, pose, vAbs, now, stop = state.currentStop) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  if (!seg || seg.gear !== 1 || state.segIndex !== state.plan.segments.length - 1) return state;
  if (state.endPoses?.[seg.k]) return state;
  const finalStop = stop?.tag === "routeEnd" || (stop && !stop.hazard && (state.stops ?? []).every((st) => st === stop || st.consumed || st.hazard));
  if (!finalStop) return state;
  if (!(vAbs <= tune.stops.captureKmh) || state.restSince === null || state.restSince === undefined) return state;
  if (now - state.restSince < tune.stops.captureS * 1000) return state;
  const med = circularMedianDeg((state.restYaw ?? []).slice(Math.floor((state.restYaw ?? []).length / 2)));
  const wEnd = state.witness?.rows?.[state.witness.rows.length - 1] ?? null;
  const ep = captureEndPose({
    pose, camPsiMedian: med, yawSource: med === null ? "none" : "cam", camYawSuspect: state.yaw?.suspect === true,
    witnessEnd: wEnd ? { x: wEnd[1], z: wEnd[2], psi: wEnd[5] } : null, authoredEnd: seg.authoredEnd ?? null, park: seg.productPark ?? null,
  });
  const next = { ...state, endPoses: { ...state.endPoses, [seg.k]: ep } };
  const bk = bookOf(next);
  if (bk && bk.k === seg.k) bk.endPose = ep;
  return next;
}

/**
 * THE HEADING RE-APPROACH (2026-09-22), pure: may a gear-change rest that missed ONLY on yaw be
 * corrected by a bounded forward creep that steers toward the arm band's centre heading?
 *
 * WHY THE APPROACH ENDS THERE. The product steers from a TERNARY key (engine/input.ts:248
 * `out.steer = (left ? 1 : 0) - (right ? 1 : 0)`) through a low-pass (vehicle/difficulty.ts:466-471)
 * and a rate-limited wheel (vehicle/VehicleSim.ts:394-397), so the follower reaches a small
 * curvature only through the sigma-delta modulator, which presses nothing until |e + u| > 0.5.
 * On canary-path-91e5a51 sc-park-45-rev's last 3 m of F0 the pursuit asked |u| ≤ 0.03–0.09 on
 * every sub-tick and not one steer key went down: ψ held flat at ≈ +0.5° while the witness's gentle
 * S swept from +1.0° to −1.1° (lat 0.17 → 0.12 m), so the car came to rest at yaw +0.43° against
 * a ONE-SIDED band (yaw −2.5…0, lat 0…0.25 — the builder's screen, not ours to widen). The same
 * shape, a symmetric band, refused sc-park-left in w55 at +1.55° against ±1.5°. Before this, the
 * only correction was the SHORT creep (along < accept min with lat AND yaw already in band), so a
 * yaw-only miss was refused with 0 creeps however small it was.
 *
 * WHAT STAYS A REFUSAL (fail closed): a lat miss; a rest past the acceptance's far edge; a yaw
 * miss larger than `yawCreepMaxDeg`; less than `yawCreepMinM` of room before the far edge (less
 * the `yawCreepEndMarginM` the creep's own stop needs); a heading change the square-up law could
 * only ask for at FULL lock over that room; and the attempts `creepAttempts` shares with the short
 * creep. The re-approach never accepts anything itself: the rest it ends in is judged by the same
 * band, and every pose it holds is screened by the live body guard (bodyClearanceRefusal runs
 * before every mode, creep included).
 */
export function yawReapproach({ fr, band, acceptAlongM, stopTargetAlongM, gcPsi, latOk, creeps }, tune = PATH_TUNE) {
  const t = tune?.stops ?? PATH_TUNE.stops;
  const no = (why) => ({ fire: false, why });
  if (!fr || !band || !Array.isArray(acceptAlongM)) return no("no acceptance band");
  if (!Number.isFinite(fr.yawErrDeg)) return no("no yaw read");
  const [lo, hi] = band.yawDeg;
  const excessDeg = fr.yawErrDeg < lo ? lo - fr.yawErrDeg : fr.yawErrDeg > hi ? fr.yawErrDeg - hi : 0;
  if (!(excessDeg > 1e-9)) return no(null);
  if (!(Number.isFinite(t.yawCreepMaxDeg) && Number.isFinite(t.yawCreepM))) return no("the heading re-approach is not tuned");
  if (!latOk) return no(`lat ${r3(fr.latM)} m is outside ${band.latM.join("…")} — a heading creep cannot correct a lateral miss`);
  if (excessDeg > t.yawCreepMaxDeg + 1e-9) return no(`yaw is ${r2(excessDeg)}° outside the band, more than the ${t.yawCreepMaxDeg}° a re-approach may correct`);
  if (creeps >= t.creepAttempts) return no(`${creeps} of ${t.creepAttempts} creeps spent`);
  const [accMin, accMax] = acceptAlongM;
  if (fr.alongM > accMax + 1e-9) return no(`along ${r2(fr.alongM)} m is past the acceptance's far edge`);
  // …AND SHORT OF ITS NEAR EDGE IS NOT A HEADING MISS EITHER (w-adversary, 2026-09-22): a rest metres
  // short with lat in band and yaw a little off would otherwise become a steered creep of any length.
  // This creep corrects YAW over a bounded distance inside an accepted rest; distance is the along-creep's job.
  if (fr.alongM < accMin - 1e-9) return no(`along ${r2(fr.alongM)} m is short of the acceptance's near edge — a heading creep corrects yaw, never distance`);
  const far = accMax - t.yawCreepEndMarginM;
  const targetAlongM = Math.min(far, Math.max(Number.isFinite(stopTargetAlongM) ? stopTargetAlongM : accMin, fr.alongM + t.yawCreepM));
  const dGoM = targetAlongM - fr.alongM;
  if (!(dGoM >= t.yawCreepMinM - 1e-9)) return no(`only ${r2(Math.max(0, far - fr.alongM))} m of room before the acceptance's far edge (${t.yawCreepMinM} m needed)`);
  const targetYawErrDeg = (lo + hi) / 2;
  const law = squareUpCommand({ psi: fr.yawErrDeg, targetPsi: targetYawErrDeg, dGoM, kmh: t.creepKmh }, tune?.squareUp ?? PATH_TUNE.squareUp);
  if (law.saturated) return no(`closing ${r2(law.errDeg)}° over ${r2(dGoM)} m needs full lock`);
  return { fire: true, why: null, excessDeg, targetAlongM, dGoM, targetYawErrDeg, targetPsi: wrap360(gcPsi + targetYawErrDeg) };
}

function holdStopStep(state, obs, cmd, row, pose, psi, vAbs, now, keys) {
  const tune = state.tune ?? PATH_TUNE;
  const hold = (why) => out(release(state), { ...cmd, W: false, S: keys.S, why }, { ...row, why });
  if (obs.phase === "roll") {
    if (!state.flags.stopRelease) {
      // the outer loop left the stop without our release (the car would not come to rest) — resume the approach
      state.mode = "follow";
      state.flags.wantStop = false;
      state.latch = { ...state.latch, brake: false, coast: false };
    }
    return hold("the outer tick left the stop phase");
  }
  if (state.restSince === null) {
    state.dwellFrom = null;
    // A car that will not come to rest is not held here for ever: the outer
    // stop exits need our release (pathStopExit), so after the outer loop's own
    // STOP_MS + 8 s the runner releases and resumes the approach it was on.
    state.notRestSince ??= now;
    if (now - state.notRestSince >= tune.stops.noRestReleaseMs) {
      state.notRestSince = null;
      state.flags.stopRelease = true;
      state.flags.wantStop = false;
      state.latch = { ...state.latch, brake: false, coast: false };
      state.mode = "await-roll";
      state.pendingMode = "follow";
      return hold("the car would not come to rest in the stop phase — releasing and resuming the approach");
    }
    return hold("stop phase — waiting for rest");
  }
  state.notRestSince = null;
  state.dwellFrom ??= state.restSince;
  const stop = state.currentStop ?? { tag: "authored", dwellS: 1.0 };
  // the final forward rest is captured DURING the dwell: the product ends the lesson inside it
  state = captureForwardRestEndPose(state, pose, vAbs, now, state.currentStop);
  if (now - state.dwellFrom < (stop.dwellS ?? 1) * 1000) return hold(`stop «${stop.tag}» — dwell`);
  state.dwellFrom = null;
  const bk = bookOf(state);
  if (stop.tag === "gearChange") {
    const next = state.plan.segments[state.segIndex + 1];
    // THE MEDIAN CAM YAW OVER THE REST WINDOW, not the one read this sub-tick: the arm
    // bands are ±1.5° on six R segments, and a braking pitch leak (≈ 1.7°/°) or read
    // noise must not decide acceptance (DESIGN-v2 §14.1 risk 2; CODE-REVIEW-1 M2).
    const fr = armFrame(next.gearChangePose, pose, circularMedianDeg(state.restYaw) ?? psi);
    const [accMin, accMax] = next.stopTarget.acceptAlongM;
    const band = next.armBand;
    // The arm roll runs along the car's own heading, so a yaw error turns it into lateral
    // drift (≤ 0.2 m · sin|yaw|): an acceptance lat edge ON the screened edge let a stop
    // on the corner start outside it by 2 mm (T9.b bench) — the lat check absorbs it.
    const drift = ARM_ROLL_ALLOW_M * Math.abs(Math.sin(((Number.isFinite(fr.yawErrDeg) ? fr.yawErrDeg : 0) * Math.PI) / 180)) + 1e-3;
    const latOk = fr.latM >= band.latM[0] + drift - 1e-9 && fr.latM <= band.latM[1] - drift + 1e-9;
    const yawOk = !Number.isFinite(fr.yawErrDeg) || (fr.yawErrDeg >= band.yawDeg[0] - 1e-9 && fr.yawErrDeg <= band.yawDeg[1] + 1e-9);
    const stopErrM = r3(fr.alongM - next.stopTarget.alongM);
    if (bk) {
      bk.stopErrM = stopErrM;
      bk.stops.push({ tag: "gearChange", alongM: r3(fr.alongM), latM: r3(fr.latM), yawErrDeg: r2(fr.yawErrDeg), stopErrM, creep: state.creeps });
    }
    if (fr.alongM >= accMin - 1e-9 && fr.alongM <= accMax + 1e-9 && latOk && yawOk) {
      stop.consumed = true;
      state.flags.atGearChange = true;
      state.armRestPose = { x: r3(pose.x), z: r3(pose.z), psi: r2(psi), alongM: r3(fr.alongM), latM: r3(fr.latM), yawErrDeg: r2(fr.yawErrDeg) };
      state.mode = "hold-for-arm";
      state.creepYaw = null;
      return hold(`at the gear change: along ${r2(fr.alongM)} m inside ${accMin}…${accMax}`);
    }
    if (fr.alongM < accMin && latOk && yawOk && state.creeps < tune.stops.creepAttempts) {
      state.creeps += 1;
      state.creepYaw = null;
      state.creepTarget = next.stopTarget.alongM;
      state.creepFrame = next.gearChangePose;
      state.flags.stopRelease = true;
      state.flags.wantStop = false;
      state.latch = { ...state.latch, coast: false };
      state.mode = "await-roll";
      state.pendingMode = "creep";
      return hold(`short of the acceptance band (${r2(fr.alongM)} < ${accMin}) — creep ${state.creeps}/${tune.stops.creepAttempts}`);
    }
    const ya = yawReapproach({ fr, band, acceptAlongM: next.stopTarget.acceptAlongM, stopTargetAlongM: next.stopTarget.alongM, gcPsi: next.gearChangePose.psi, latOk, creeps: state.creeps }, tune);
    if (ya.fire) {
      state.creeps += 1;
      state.creepTarget = ya.targetAlongM;
      state.creepFrame = next.gearChangePose;
      state.creepYaw = { targetPsi: ya.targetPsi };
      state.creepWAt = null;
      (state.books.yawCreeps ??= []).push({ k: segOf(state)?.k ?? null, attempt: state.creeps, fromAlongM: r3(fr.alongM), fromLatM: r3(fr.latM), fromYawErrDeg: r2(fr.yawErrDeg), excessDeg: r2(ya.excessDeg), targetAlongM: r3(ya.targetAlongM), targetYawErrDeg: r2(ya.targetYawErrDeg), subTicks: 0, keyTicks: 0, errEndDeg: null });
      state.flags.stopRelease = true;
      state.flags.wantStop = false;
      state.latch = { ...state.latch, coast: false };
      state.mode = "await-roll";
      state.pendingMode = "creep";
      return hold(`heading ${r2(fr.yawErrDeg)}° is ${r2(ya.excessDeg)}° outside ${band.yawDeg.join("…")} — heading re-approach ${state.creeps}/${tune.stops.creepAttempts} to along ${r2(ya.targetAlongM)} m`);
    }
    state = refusePathState(state, "gear-change-missed", `the approach came to rest at along ${r2(fr.alongM)} m / lat ${r2(fr.latM)} m / yaw ${r2(fr.yawErrDeg)}° after ${state.creeps} creep(s) — acceptance along ${accMin}…${accMax}, lat ${band.latM.join("…")}, yaw ${band.yawDeg.join("…")}${ya.why ? ` (no heading re-approach: ${ya.why})` : ""}`);
    return refusedStep(state, obs, cmd, row, vAbs, keys, now);
  }
  if (bk && Number.isFinite(stop.sM) && state.cursor) {
    const e = r3(state.cursor.s - stop.sM);
    bk.stops.push({ tag: stop.tag, stopErrM: e });
    if (!stop.hazard) bk.stopErrM = e;
  }
  if (!stop.hazard) stop.consumed = true;
  const lastSeg = state.segIndex === state.plan.segments.length - 1;
  if (stop.tag === "routeEnd" || (lastSeg && !stop.hazard && state.stops.every((st) => st.consumed))) {
    state.flags.routeEnd = true;
    state.mode = "route-end";
    return hold("route end reached");
  }
  state.flags.stopRelease = true;
  state.flags.wantStop = false;
  state.currentStop = null;
  state.latch = { ...state.latch, coast: false };
  state.mode = "await-roll";
  state.pendingMode = "follow";
  return hold(`stop «${stop.tag}» served — releasing`);
}

const rearPoint = (pose, psi) => {
  const h = headingUnit(Number.isFinite(psi) ? psi : 0);
  return { x: pose.x - A * h.x, z: pose.z - A * h.z };
};

function reverseSettleStep(state, obs, cmd, row, pose, psi, vAbs, now, keys) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  const dial = obs.dialKmh;
  const vGate = Math.min(vAbs, Number.isFinite(dial) && dial >= 0 ? dial : vAbs);
  // Steer 0 and S off. A MOVING press of the functional brake W is LAW 1-exempt; released at ≤ 1 km/h.
  let W = keys.W ? vAbs > 1 : vGate >= pressMinFor(tune.pedals) && Number.isFinite(dial) && dial > 1;
  if (vAbs <= 1) W = false;
  const st = { ...(state.settle ?? { since: now, restFrom: null }) };
  st.restFrom = vAbs <= tune.stops.settleKmh ? st.restFrom ?? now : null;
  state.settle = st;
  const settled = (st.restFrom !== null && now - st.restFrom >= tune.stops.settleS * 1000) || (now - st.since >= tune.stops.settleMaxS * 1000 && vAbs <= 1);
  if (!settled) {
    state.lastU = 0;
    return out(release(state), { ...cmd, steer: 0, W, S: false, why: "reverse-settle" }, { ...row, why: "reverse-settle" });
  }
  const refPose = seg.designedNegative ? seg.witnesses[0].startPose : seg.gearChangePose;
  const start = armFrame(refPose, pose, psi);
  const armRollM = state.armRestPose && !seg.designedNegative ? r3(state.armRestPose.alongM - start.alongM) : null;
  state.books.arms.push({
    k: seg.k,
    armRestPose: state.armRestPose,
    startPose: { x: r3(pose.x), z: r3(pose.z), psi: r2(psi), alongM: r3(start.alongM), latM: r3(start.latM), yawErrDeg: r2(start.yawErrDeg) },
    armRollM,
  });
  const sel = selectWitness(seg, start);
  if (sel.refusal) return refusedStep(refusePathState(state, sel.refusal, `${sel.why}${armRollM !== null ? ` (armRollM ${armRollM} m)` : ""}`), obs, cmd, row, vAbs, keys, now);
  // THE SELECTED FAMILY MEMBER'S BODY CLEARANCE. `selectWitness` picks the largest
  // startAlongM ≤ the measured start, so ANY member of the family may end up here —
  // which is why the builder screens every one of them, not just the nominal witness.
  {
    const gate = witnessBodyGate(seg, sel.witness, state.tune ?? PATH_TUNE);
    (state.books.witnessBody ??= []).push(gate.book);
    if (gate.refusal) return refusedStep(refusePathState(state, gate.refusal, gate.why), obs, cmd, row, vAbs, keys, now);
  }
  const poly = witnessPolyline(sel.witness, { gear: -1, leadM: Math.max(1.0, sel.leadM + 0.5), extendM: 3 });
  const cursor = advanceCursor(null, poly, rearPoint(pose, psi), 0, { acquire: true, leadM: 1.5 });
  const terminal = terminalHeadingGate(seg, sel.witness);
  state = { ...state, witness: sel.witness, poly, cursor, leadM: sel.leadM, mode: "reverse-follow", settle: null, latch: { brake: false, coast: false, wBrake: false, hold: false }, yaw: resetYawHistory(state.yaw), lostCount: 0, stops: buildStops(seg, poly), currentStop: null, impact: { prev: null, reads: 0, peakMps2: 0 }, nearLock: false, terminal };
  state.books.segments.push(newSegmentBook(seg, { witnessStartAlongM: sel.witness.startAlongM, leadM: r3(sel.leadM), terminal: { engage: terminal.engage, psiT: terminal.psiT, owedDeg: terminal.owedDeg, handedM: 0 } }));
  const yawErr = Number.isFinite(psi) ? Math.abs(wrapDeg(psi - sel.witness.startPose.psi)) : 0;
  const lim = seg.designedNegative ? { ct: ACQUISITION.replannedCtM, yaw: ACQUISITION.replannedYawDeg } : { ct: ACQUISITION.ctM, yaw: ACQUISITION.yawDeg };
  if (!cursor.found || Math.abs(cursor.ctM) > lim.ct || yawErr > lim.yaw) {
    return refusedStep(refusePathState(state, "acquisition", `R${seg.k} starts ${cursor.found ? `${r2(cursor.ctM)} m` : "nowhere"} off its witness with ${r2(yawErr)}° of yaw error (limit ${lim.ct} m / ${lim.yaw}°)`), obs, cmd, row, vAbs, keys, now);
  }
  return out(release(state), { ...cmd, steer: 0, W: false, S: false, why: `R${seg.k} begins on witness ${sel.witness.startAlongM} (lead ${r2(sel.leadM)} m, roll ${armRollM} m)` }, { ...row, why: "witness-selected" });
}

function reverseStep(state, obs, cmd, row, pose, psi, v, vAbs, stepM, now, keys) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  const cursor = advanceCursor(state.cursor, state.poly, rearPoint(pose, psi), stepM + 0.05);
  state.cursor = cursor;
  row.s = r2(cursor.s);
  row.ct = r3(cursor.ctM);
  row.toEnd = r3(cursor.toEndM);
  if (!cursor.found || Math.abs(cursor.ctM) > tune.lost.revM) {
    return refusedStep(refusePathState(state, "lost", `R${seg.k}: ${cursor.found ? `${r2(cursor.ctM)} m` : "no projection"} off the witness rear path (limit ${tune.lost.revM} m)`), obs, cmd, row, vAbs, keys, now);
  }
  const bk = bookOf(state);
  if (bk) bk.ctMaxM = r3(Math.max(bk.ctMaxM, Math.abs(cursor.ctM)));

  // ── A COLLISION ENDS THE LEG: brake, hold, never throttle (2026-09-15) — see collisionRefusal ──
  {
    const hit = collisionRefusal(state, obs, pose, vAbs, keys, now, cursor.toEndM);
    if (hit) return refusedStep(hit, obs, cmd, row, vAbs, keys, now);
  }
  // ── PAST THE END BY MORE THAN THE TOLERANCE: a named refusal, never «followed» ──
  if (cursor.toEndM < -tune.stops.overrunM) {
    return refusedStep(refusePathState(state, "end-overrun", `R${seg.k}: the rear axle is ${r2(-cursor.toEndM)} m past the witness end (tolerance ${tune.stops.overrunM} m) at ${r2(vAbs)} km/h`), obs, cmd, row, vAbs, keys, now);
  }
  // The body-clearance guard that replaced `bay-lateral` is no longer here: it is armed for
  // EVERY segment and runs in `pathStep` (see `bodyClearanceStep`), because a measurement of
  // the real body at the real heading needs neither the bay window nor the yaw gate that the
  // lateral proxy needed to be safe — and those windows hid both AUTHORED faces.

  if (state.mode === "reverse-stop") {
    const dwell = (state.currentStop?.dwellS ?? 1) * 1000;
    if (state.restSince !== null && now - state.restSince >= dwell) {
      if (state.currentStop) state.currentStop.consumed = true;
      state.currentStop = null;
      state.latch = { brake: false, coast: false, wBrake: false, hold: false };
      state.mode = "reverse-follow";
    } else {
      state.lastU = 0;
      return out(release(state), { ...cmd, steer: 0, W: keys.W && vAbs > 1, S: false, why: "reverse stop — dwell" }, { ...row, why: "reverse-stop" });
    }
  }
  let stop = null;
  let toStopM = cursor.toEndM;
  for (const st of state.stops) {
    if (st.consumed || !Number.isFinite(st.sM)) continue;
    stop = st;
    toStopM = st.sM - cursor.s;
    break;
  }
  const isFinal = !stop || stop.frac >= 1 - 1e-9;

  let u = 0;
  if (Number.isFinite(psi)) {
    const Ld = lookaheadFor(Math.max(vAbs, 2), state.tauEffS, -1);
    const T = pointAt(state.poly, cursor.s + Ld);
    const law = rearPursuit({ pose, psi, target: T, lookaheadM: Ld, kmh: Math.max(vAbs, 1) });
    u = law.u;
    // THE TERMINAL HEADING LAW (terminalHeadingGate / terminalHeadingCommand), over the witness's last startM.
    if (state.terminal?.engage) {
      const term = terminalHeadingCommand({ uPursuit: law.u, psi, psiT: state.terminal.psiT, toEndM: cursor.toEndM, kmh: Math.max(vAbs, 1), t: tune.terminal });
      if (term.w > 0) {
        u = term.u;
        row.uTerm = r3(term.uT);
        if (bk?.terminal) bk.terminal.handedM = r2(bk.terminal.handedM + stepM);
      }
    }
    if (law.saturated && bk) bk.saturatedM = r2(bk.saturatedM + stepM);
    state.books.pm.push(phaseMarginDeg(((Math.max(vAbs, 0.1) / 3.6) * state.tauEffS) / Ld));
    if (state.books.pm.length > 4000) state.books.pm.splice(0, 2000);
  }
  const k = steerCommand(state, u, obs, v);
  state.sign = foldPathSign(state.sign, { u, v, stepM, psi });
  if (state.sign.verdict === "contradicts") return refusedStep(refusePathState(state, "sign-contradicts", state.sign.why), obs, cmd, row, vAbs, keys, now);
  row.u = r3(u);
  row.k = k;

  // NEAR LOCK (PATH_TUNE.nearLock): the witness ahead asks for ≥ frac of lock, or the
  // command saturates. It lengthens the runner's budget (pathRunnerBudgetMs). A SLOWER R band
  // there was measured and REJECTED (2026-09-15, calibrated bench, sc-park-left/-wall × 20
  // seeds, the canary's card drain injected): 2.2/2.7 and 2.7/3.2 km/h moved the median
  // run-wide but not its p90 (left 0.52 → 0.69 / 0.76 m), and 2.2/2.7 stopped up to 1.08 m short.
  const aheadM = Math.max(tune.nearLock.aheadM, (vAbs / 3.6) * tune.nearLock.aheadS);
  state.nearLock = Math.abs(u) >= 0.999 || lockDemandAhead(state.poly, cursor.s, aheadM) >= tune.nearLock.frac;
  if (state.nearLock) state.books.nearLockM = r2(state.books.nearLockM + stepM);
  row.nearLock = state.nearLock;
  const band = state.band;

  // The last-sub-tick anticipation (§6.4): a stop whose trigger would fall inside the coming blind gap fires early.
  const nextSubMs = now + tune.runner.pollMs + (obs.rttMs ?? 0);
  const anticipateM = Number.isFinite(obs.untilMs) && nextSubMs > obs.untilMs ? (vAbs / 3.6) * (Number.isFinite(obs.blindP90S) ? obs.blindP90S : 0.3) : 0;
  const wasLatched = state.latch.wBrake || state.latch.coast || state.latch.hold;
  // THE END IS A HARD STOP: at (or past) the witness end the car brakes and holds whatever
  // the trigger model said (a blind gap, a droop or a collision can carry it past its trigger).
  const atEnd = isFinal && cursor.toEndM <= 0;
  const g = pedalGrammar(state.latch, {
    gear: -1, vAbs, dialKmh: obs.dialKmh, toStopM, aBrake: state.aBrakeMeas, aCoast: state.aCoastMeas ?? tune.pedals.aCoastMps2,
    keys, band, anticipateM, noAccel: obs.hz?.brake === true,
    holdNow: atEnd, holdWhy: atEnd ? `at the witness end (rear axle ${r2(-cursor.toEndM)} m past it) — brake and hold` : undefined,
  }, tune.pedals);
  if (g.latch.hold && !state.latch.hold) state.books.holds.push({ k: seg.k, why: g.why, toEndM: r3(cursor.toEndM), kmh: r2(vAbs) });
  if (!wasLatched && (g.latch.wBrake || g.latch.coast || g.latch.hold)) {
    state.currentStop = stop;
    if (bk && isFinal) {
      bk.branch = g.trigger?.branch ?? null;
      bk.vAtTriggerKmh = r2(vAbs);
      bk.triggerDistM = r3(g.trigger?.distM);
      if (g.latch.coast) bk.stopLate = "coast";
      if (anticipateM > 0 && g.trigger && toStopM > g.trigger.distM) bk.stopEarlyM = r3(toStopM - g.trigger.distM);
    }
  }
  state.latch = g.latch;
  if (bk && !state.latch.wBrake && !state.latch.coast && !state.latch.hold) bk.overshootKmh = r2(Math.max(bk.overshootKmh, vAbs - band.hi));
  if ((state.latch.wBrake || state.latch.coast || state.latch.hold) && vAbs <= tune.stops.captureKmh) {
    if (!isFinal && stop) {
      state.mode = "reverse-stop";
      state.currentStop = stop;
      if (bk) bk.stops.push({ tag: stop.tag, stopErrM: r3(cursor.s - stop.sM) });
    } else {
      state.mode = "reverse-capture";
      state.capture = { restFrom: now, camPsis: [], holdFrom: null };
    }
  }
  state.flags.shutterOk = vAbs <= 1 || (Math.abs(u) < 0.05 && Math.abs(cursor.ctM) <= tune.shutter.ctM);
  row.W = g.W;
  row.S = g.S;
  row.band = `${r2(band.lo)}/${r2(band.hi)}`;
  const W = lettersD(obs.gearLetters) ? false : g.W;
  return out(state, { steer: k, W, S: g.S, returnNow: false, why: g.why }, row);
}

function captureStep(state, obs, cmd, row, pose, vAbs, now, keys) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  // a contact the banner reports a tick late, under the final brake (collisionRefusal)
  const hit = collisionRefusal(state, obs, pose, vAbs, keys, now);
  if (hit) return refusedStep(hit, obs, cmd, row, vAbs, keys, now);
  // a stop that came to rest past its end, or a car that moves on while the end is being captured
  const over = overrunRefusal(state, pose, vAbs);
  if (over) return refusedStep(over, obs, cmd, row, vAbs, keys, now);
  const cap = { ...(state.capture ?? { restFrom: now, camPsis: [], holdFrom: null }) };
  if (vAbs > tune.stops.captureKmh && !cap.holdFrom) cap.restFrom = now;
  if (state.yaw.source === "cam" && Number.isFinite(state.yaw.psi)) cap.camPsis = [...cap.camPsis.slice(-40), state.yaw.psi];
  state.capture = cap;
  if (!cap.holdFrom && now - cap.restFrom >= tune.stops.captureS * 1000) {
    let med = null;
    if (cap.camPsis.length) {
      const base = cap.camPsis[0];
      const rel = cap.camPsis.map((p) => wrapDeg(p - base)).sort((a, b) => a - b);
      med = wrap360(base + rel[Math.floor(rel.length / 2)]);
    }
    const wEnd = state.witness.rows[state.witness.rows.length - 1];
    const ep = captureEndPose({
      pose, camPsiMedian: med, yawSource: med === null ? "none" : "cam", camYawSuspect: state.yaw.suspect,
      witnessEnd: { x: wEnd[1], z: wEnd[2], psi: wEnd[5] }, authoredEnd: seg.authoredEnd, park: seg.productPark ?? null,
    });
    state.endPoses = { ...state.endPoses, [seg.k]: ep };
    const bk = bookOf(state);
    if (bk) {
      bk.endPose = ep;
      bk.stopErrM = ep.vsWitness ? ep.vsWitness.toEndM : null;
    }
    cap.holdFrom = now;
  }
  const finalDwell = state.stops.find((st) => st.frac >= 1 - 1e-9)?.dwellS ?? 0;
  if (cap.holdFrom && now - cap.holdFrom >= Math.max(tune.stops.captureHoldMinS, finalDwell) * 1000) {
    if (state.segIndex === state.plan.segments.length - 1) {
      state.flags.routeEnd = true;
      state.mode = "route-end";
    } else {
      state.flags.segmentDone = true;
      state.mode = "hold-for-disarm";
    }
  }
  state.lastU = 0;
  state.latch = { ...state.latch, hold: true };
  const hp = holdPedalsR(state, obs, vAbs, keys);
  return out(release(state), { ...cmd, steer: 0, W: hp.W, S: false, why: `reverse-capture — ${hp.why}` }, { ...row, why: "reverse-capture" });
}

/**
 * THE MICRO SQUARE-UP'S HEADING LAW (2026-09-21), pure.
 *
 * WHAT IT IS FOR. A pathref's last forward micro segment (at most 1 m) is the plan's square-up:
 * its authored rows turn the car the last 2-3 deg onto the bay (sc-park-gap-short F2 357.04 deg
 * to 359.28 deg over 0.69 m, delta 34 deg falling to 12 deg). Until today the follower drove it
 * with the wheel HARD-ZEROED (`!seg.micro` in forwardStep), and the disarm roll that carries the
 * car into it was steered by nothing (forwardSettleStep `steer: 0`), so the heading the reverse
 * ended on was the heading the leg ended on: every degree the square-up exists to deliver was
 * dropped.
 *
 * THE TARGET IS THE PLAN'S, NEVER THE BOX'S. `targetPsi` is the micro witness's own END heading,
 * the same end pose whose position the micro creep already aims at (`creepFrame`). The bay
 * heading the product grades by is never read here: a follower follows its plan and does not
 * invent a target, and the grader's number fed back into the driver would make the box verdict a
 * statement about the harness grading itself. On the three lessons that carry a micro the two
 * differ by 0.60-0.83 deg, and the plan's is the one taken.
 *
 * THE LAW. Close the heading error over the distance that ACTUALLY remains to that end pose:
 * kappa = err / max(dGo, floorM), turned into a wheel fraction through the same yaw gain and
 * speed-dependent lock the pursuit laws use (centrePursuit). Forward only: u > 0 turns the heading
 * clockwise (+psi) in D, the convention `foldPathSign` convicts against. A car already past the
 * end pose (dGo at or under floorM) gets the floor, so an error of a few degrees is full lock for
 * whatever travel is left, which is the only travel there is.
 *
 * THE PHYSICS IT RELIES ON, from the product: the road wheel is rate-limited toward its target at
 * STEER_SPEED whatever the car's speed, with no standstill gate (VehicleSim.ts:390-398;
 * tuning.ts:411/419/421: 0.6 rad at or under 15 km/h, 3.2 rad/s out, 4.8 rad/s back), so the
 * wheel reaches lock in about 0.19 s even as the disarm roll starts from rest; and a forward arc
 * at that lock turns tan(0.6) x 1.02 / 2.56, about 0.27 rad/m (guidance.mjs YAW_GAIN_TABLE at or
 * under 8 km/h).
 */
export function squareUpCommand({ psi, targetPsi, dGoM, kmh }, t = PATH_TUNE.squareUp) {
  if (!Number.isFinite(psi) || !Number.isFinite(targetPsi)) return { u: 0, errDeg: null, kappa: 0, saturated: false, dGoM: null };
  const errDeg = wrapDeg(targetPsi - psi);
  const d = Math.max(Number.isFinite(dGoM) ? dGoM : 0, t.floorM);
  const kappa = (errDeg * RAD) / d;
  const k = Math.max(Math.abs(kmh ?? 0), 1);
  const delta = Math.atan((L * kappa) / yawGainAtKmh(k));
  const u = clamp(delta / maxSteerAtKmh(k), -1, 1);
  return { u, errDeg, kappa, saturated: Math.abs(delta / maxSteerAtKmh(k)) >= 1, dGoM: d };
}

/** The micro witness's authored end pose (probe frame): the pose the square-up and its creep both aim at. */
function microEndPose(seg) {
  const rows = seg?.witnesses?.[0]?.rows;
  if (!Array.isArray(rows) || !rows.length) return null;
  const e = rows[rows.length - 1];
  return { x: e[1], z: e[2], psi: e[5] };
}

/**
 * ONE SQUARE-UP STEERING DECISION: the law above toward the micro's end pose, through the same
 * modulator every other steering decision goes through, booked per segment and per phase
 * (`settle` = the disarm roll the harness does not drive longitudinally, `creep` = the micro's own
 * creep) so a test can see that the branch FIRED and not merely that it exists.
 */
function squareUpSteer(state, obs, pose, psi, vAbs, phaseTag) {
  const seg = segOf(state);
  const end = microEndPose(seg);
  const hEnd = end ? headingUnit(end.psi) : null;
  const dGoM = end ? (end.x - pose.x) * hEnd.x + (end.z - pose.z) * hEnd.z : null;
  const law = squareUpCommand({ psi, targetPsi: end?.psi, dGoM, kmh: vAbs }, (state.tune ?? PATH_TUNE).squareUp ?? PATH_TUNE.squareUp);
  const v = Number.isFinite(obs.v) ? obs.v : vAbs;
  const k = steerCommand(state, law.u, obs, v);
  const books = (state.books.squareUp ??= []);
  let b = books.find((x) => x.k === seg.k && x.phase === phaseTag);
  if (!b) {
    b = { k: seg.k, phase: phaseTag, subTicks: 0, keyTicks: 0, saturatedTicks: 0, keyM: 0, errStartDeg: law.errDeg === null ? null : r2(law.errDeg), errEndDeg: null, last: null };
    books.push(b);
  }
  const stepM = b.last ? Math.hypot(pose.x - b.last.x, pose.z - b.last.z) : 0;
  b.subTicks += 1;
  if (k !== 0) {
    b.keyTicks += 1;
    b.keyM = r3(b.keyM + stepM);
  }
  if (law.saturated) b.saturatedTicks += 1;
  b.errEndDeg = law.errDeg === null ? null : r2(law.errDeg);
  b.last = { x: pose.x, z: pose.z };
  return { k, u: law.u, law };
}

function forwardSettleStep(state, obs, cmd, row, pose, psi, vAbs, now, keys) {
  const tune = state.tune ?? PATH_TUNE;
  const seg = segOf(state);
  const st = { ...(state.settle ?? { since: now, restFrom: null, from: pose, fromPsi: psi }) };
  st.restFrom = vAbs <= tune.stops.settleKmh ? st.restFrom ?? now : null;
  state.settle = st;
  const settled = (st.restFrom !== null && now - st.restFrom >= tune.stops.settleS * 1000) || (now - st.since >= tune.stops.settleMaxS * 1000 && vAbs <= 1);
  if (!settled) {
    // THE DISARM ROLL INTO A MICRO SQUARE-UP IS STEERED (2026-09-21). The roll is motion the
    // harness does not drive: ReverseAssist's R to D flip hands the held W to D's accelerator
    // (section 10b/10c), and it carries the car 0.17-0.31 m into a micro that is 0.42-0.76 m
    // long. It happens whether or not the wheel is used, so it is travel the square-up gets for
    // free; leaving the wheel at zero through it dropped the largest share of the heading
    // (sc-park-gap-short: the whole micro ran straight at the reverse's -13.4 deg). The pedals
    // are untouched: this changes which way the roll points, never how far it goes.
    if (seg?.micro && seg.gear === 1 && Number.isFinite(psi)) {
      const sq = squareUpSteer(state, obs, pose, psi, vAbs, "settle");
      row.u = r3(sq.u);
      row.k = sq.k;
      return out(state, { ...cmd, steer: sq.k, W: false, S: keys.S && vAbs > 0.3, why: `forward-settle: square-up toward the micro's end heading (${r2(sq.law.errDeg)} deg to go)` }, { ...row, why: "forward-settle-squareup" });
    }
    state.lastU = 0;
    return out(release(state), { ...cmd, steer: 0, W: false, S: keys.S && vAbs > 0.3, why: "forward-settle" }, { ...row, why: "forward-settle" });
  }
  const h = headingUnit(Number.isFinite(st.fromPsi) ? st.fromPsi : Number.isFinite(psi) ? psi : 0);
  const disarmRollM = r3((pose.x - st.from.x) * h.x + (pose.z - st.from.z) * h.z);
  state.books.disarms.push({ k: seg.k, disarmRollM });
  state.settle = null;
  state.poly = null;
  state.cursor = null;
  state.creeps = 0;
  if (seg.micro) {
    state = enterForward(state, pose, psi, { acquire: false });
    const end = state.poly.pts[state.poly.endIdx];
    const hEnd = headingUnit(end.psi);
    const remaining = (end.x - pose.x) * hEnd.x + (end.z - pose.z) * hEnd.z;
    const routeEndStop = state.stops.find((sp) => sp.tag === "routeEnd") ?? state.stops[state.stops.length - 1] ?? null;
    if (remaining < -tune.stops.microSkipM) {
      state.books.microOvershootM = r3(-remaining);
      state.stops.forEach((sp) => { sp.consumed = true; });
      if (state.segIndex === state.plan.segments.length - 1) {
        state.flags.routeEnd = true;
        state.mode = "route-end";
      } else state.mode = "follow";
      return out(release(state), { ...cmd, steer: 0, W: false, S: false, why: `micro square-up skipped: the disarm roll already carried the car ${r2(-remaining)} m past it` }, { ...row, why: "micro-skipped" });
    }
    state.mode = "creep";
    state.creepTarget = 0;
    state.creepFrame = { x: end.x, z: end.z, psi: end.psi };
    state.creepYaw = null;
    state.currentStop = routeEndStop;
    state.creepWAt = null;
    // the square-up keeps the wheel it built up through the disarm roll: a released key here
    // would hand 50 ms of 4.8 rad/s return (0.24 rad) back before the creep's first step
    if (seg.gear === 1 && Number.isFinite(psi)) {
      const sq = squareUpSteer(state, obs, pose, psi, vAbs, "creep");
      row.u = r3(sq.u);
      row.k = sq.k;
      return out(state, { ...cmd, steer: sq.k, W: false, S: false, why: `micro square-up: ${r2(remaining)} m to its end pose, ${r2(sq.law.errDeg)} deg to its end heading` }, { ...row, why: "micro-creep" });
    }
    return out(release(state), { ...cmd, steer: 0, W: false, S: false, why: `micro square-up: ${r2(remaining)} m, no yaw read to steer it by` }, { ...row, why: "micro-creep" });
  }
  state = enterForward(state, pose, psi);
  if (state.mode === "refused") return refusedStep(state, obs, cmd, row, vAbs, keys, now);
  state.mode = "follow";
  return out(release(state), { ...cmd, steer: 0, W: false, S: false, why: `F${seg.k} acquired` }, { ...row, why: "forward-acquired" });
}

/** The yield's effect on the reducer (§5.3): the wheel was released, so the modulator restarts from zero. */
export function pathYieldState(state) {
  return { ...state, mod: { e: 0, kPrev: 0 }, lastU: 0 };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 THE PAGE CONTRACT — ONE OBSERVATION, ONE ACTUATION PLAN (CODE-REVIEW-1 M2, M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * lesson-audit.mjs and lib/path-bench.mjs BOTH build the reducer's observation with
 * `pathObservation` and BOTH turn a command (or a yield) into key actions with
 * `pathApplyActions` / `pathYieldActions`. Each side keeps only a thin executor
 * that maps an action onto its own helper (`steer` / `throttle` / `sChannel` /
 * `brake`). So the bench cannot certify a runner lesson-audit does not run: the
 * dial, the cluster, the edge sequence and every key decision come from here.
 *
 * THE READ carries the dial and the cluster letter read IN THE SAME page
 * evaluation as the pose (the HUD's own `[aria-label^="Скорост "]` and
 * `[aria-label^="Скоростен лост: "]`), never the outer probe's copy from the start
 * of the tick: that copy is up to a whole tick old, and a stale-low dial selects
 * the coast branch (CODE-REVIEW-1 M2); a stale «R» after a disarm refuses the next
 * forward segment as `disarm-failed`.
 *
 * THE HELPER MODEL the plan assumes, and each executor must honour exactly:
 * every helper is idempotent (`on === held` returns), and `brake(true, kmh)` is
 * REFUSED when `kmh !== null && kmh >= 0 && kmh <= 1` (lesson-audit.mjs `brake()`).
 */

/** The speed a fresh brake press is gated on: min(|v|, dial), the dial only when it was read. */
export function pathPressKmh(vAbs, dialKmh) {
  const v = Math.abs(Number.isFinite(vAbs) ? vAbs : 0);
  return Number.isFinite(dialKmh) && dialKmh >= 0 ? Math.min(v, dialKmh) : v;
}

/**
 * read = { f, x, z, v, d, lx, lz, cx, cz, pz, dial, gear } — ONE page evaluation.
 * ctx  = { wallMs, rttMs, phase, hz, untilMs, entry, disarmed, held: { W, S, steer }, heldS, blindP90S, edge: { seq, atMs } }.
 */
export function pathObservation(read, ctx) {
  const r = read ?? {};
  const held = ctx.held ?? {};
  return {
    f: r.f, x: r.x, z: r.z, v: r.v, d: r.d, lx: r.lx, lz: r.lz, cx: r.cx, cz: r.cz, pz: r.pz,
    dialKmh: Number.isFinite(r.dial) && r.dial >= 0 ? r.dial : null,
    gearLetters: Array.isArray(r.gear) ? r.gear : [],
    wallMs: ctx.wallMs,
    rttMs: ctx.rttMs,
    phase: ctx.phase,
    hz: ctx.hz ?? null,
    untilMs: ctx.untilMs,
    entry: ctx.entry === true,
    disarmed: ctx.disarmed === false ? false : undefined,
    keys: { W: held.W === true, S: held.S === true, steer: held.steer === "right" ? 1 : held.steer === "left" ? -1 : 0 },
    heldS: Number.isFinite(ctx.heldS) ? ctx.heldS : null,
    blindP90S: ctx.blindP90S,
    edgeSeq: Number.isFinite(ctx.edge?.seq) ? ctx.edge.seq : 0,
    edgeAtMs: Number.isFinite(ctx.edge?.atMs) ? ctx.edge.atMs : null,
    // the outer probe's product banner «crash-pinned» (a tick old; the impact fold is the fast witness)
    crash: ctx.crash === true,
  };
}

const heldOf = (held) => ({ W: held?.W === true, S: held?.S === true, steer: held?.steer === "left" || held?.steer === "right" ? held.steer : null });
const brakeRefused = (kmh) => kmh !== null && kmh >= 0 && kmh <= 1;

/**
 * THE COMMAND AS KEY ACTIONS, in order, against the held keys. Actions:
 * `{ ch: "steer", dir, kmh }`, `{ ch: "W", down }` (throttle), `{ ch: "S-accel", down }`
 * (sChannel — R's accelerator), `{ ch: "S-brake", down, kmh }` (brake — D's brake).
 *  · the wheel first, one direction at a time;
 *  · R: S lifted, W lifted, W pressed, and S pressed ONLY while W is not held;
 *  · D: W lifted, S lifted, S pressed at `pressKmh` (brake() refuses it at ≤ 1), and W
 *    pressed ONLY while S is not held;
 *  · THE BRAKE WINS: a command asking for both keys of a gear lifts that gear's
 *    accelerator, so no plan ever ends with both pedals down (the grammar never asks
 *    for both; this holds even if something else does).
 */
export function pathApplyActions(cmd, { phase, held, vAbs, dialKmh }) {
  const h = heldOf(held);
  const actions = [];
  const dir = cmd.steer > 0 ? "right" : cmd.steer < 0 ? "left" : null;
  const v = Math.abs(Number.isFinite(vAbs) ? vAbs : 0);
  const pressKmh = pathPressKmh(v, dialKmh);
  if (dir !== h.steer) {
    actions.push({ ch: "steer", dir, kmh: v });
    h.steer = dir;
  }
  if (phase === "reverse") {
    // In R the S key is the accelerator and W the functional brake (rule b).
    if ((!cmd.S || cmd.W) && h.S) { actions.push({ ch: "S-accel", down: false }); h.S = false; }
    if (!cmd.W && h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
    if (cmd.W && !h.W) { actions.push({ ch: "W", down: true }); h.W = true; }
    if (cmd.S && !cmd.W && !h.S && !h.W) { actions.push({ ch: "S-accel", down: true }); h.S = true; }
  } else {
    if ((!cmd.W || cmd.S) && h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
    if (!cmd.S && h.S) { actions.push({ ch: "S-brake", down: false }); h.S = false; }
    if (cmd.S && !h.S) {
      actions.push({ ch: "S-brake", down: true, kmh: pressKmh });
      if (!brakeRefused(pressKmh)) h.S = true;
    }
    if (cmd.W && !cmd.S && !h.W && !h.S) { actions.push({ ch: "W", down: true }); h.W = true; }
  }
  return { actions, held: h, pressKmh };
}

/**
 * THE YIELD AS KEY ACTIONS (§5.3): the wheel released; the accelerator lifted; only a
 * brake latched from motion stays — in D `latch.brake` or a stop the outer branch
 * holds (hold-stop, hold-for-arm, route-end); in R W only while `latch.wBrake && |v| > 1`.
 */
export function pathYieldActions({ phase, held, latch = {}, mode = null, vAbs = 0 }) {
  const h = heldOf(held);
  const actions = [];
  const v = Math.abs(Number.isFinite(vAbs) ? vAbs : 0);
  if (h.steer !== null) { actions.push({ ch: "steer", dir: null, kmh: null }); h.steer = null; }
  if (phase === "reverse") {
    if (h.S) { actions.push({ ch: "S-accel", down: false }); h.S = false; }
    // the functional brake latched from motion stays down through rest (LAW 1: a press that
    // began moving is never a toggle; PATH_TUNE.pedals.rHoldPressMinKmh) — lifting it here
    // left the car that had just stopped at its end unbraked for every screenshot
    if (h.W && !(latch.wBrake === true || latch.coast === true || latch.hold === true)) { actions.push({ ch: "W", down: false }); h.W = false; }
  } else {
    if (h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
    if (h.S && latch.brake !== true && mode !== "hold-stop" && mode !== "hold-for-arm" && mode !== "route-end") { actions.push({ ch: "S-brake", down: false }); h.S = false; }
  }
  return { actions, held: h };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10b THE DISARM'S LANDING — W ENCLOSES S (2026-09-17, second landing of the day)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT ROLLED THE CAR. The disarm is ReverseAssist's R → D gesture: W (R's brake) lifted at
 * rest, then pressed and HELD (reverseAssist.ts:244-279). The shift is an "assist" flip, so the
 * mapper does not disown the held channel (reverseAssist.ts:359-366, LessonScene.tsx:4948-4966):
 * the frame the selector reaches D, that same held W is D's ACCELERATOR. Until 2026-09-17 the
 * harness lifted it only when the cluster read «D» (StatusDashboard's 100 ms snapshot, read every
 * ARM_POLL_MS), so W drove the car for up to ~180 ms and its release ramp and a 0.23 m/s² coast
 * carried it on: 0.269–0.307 m of `disarmRollM` on sc-park-judge (T9.arm), set by the HUD phase.
 * The cure is a brake: S (D's brake) goes down the instant «D» is read, while W is still held.
 *
 * WHAT THE FIRST LANDING GOT WRONG (refuted by an adversary the same day). It lifted W as soon as
 * the page had RENDERED 3 frames spanning 40 ms after S landed, and held S on. Its safety claim was
 * that those frames prove the product's ReverseAssist READ S above REVERSE_ASSIST_PEDAL_ON while W
 * was still down — so the S press was vetoed at its rising edge (reverseAssist.ts:254-257,
 * :265-268) and could never shift the gear back. Two things break that claim:
 *  · A RENDERED FRAME IS NOT AN ASSIST UPDATE. `VehicleRig`'s useFrame calls `input.read()` every
 *    frame — the pedal ramps advance — while `RuntimeDriver` returns at `if (paused) return;`
 *    BEFORE `reverseAssist.update` (LessonScene.tsx, physicsPaused = paused || menuPaused: a
 *    teach card or the Esc menu). Under a pause the frames count, S ramps to 1, W is lifted and
 *    ramps to 0, and the first update after the pause sees S's rising edge with W at 0 — armed if
 *    S had been off ≥ REVERSE_ASSIST_LIFT_S since the flip — and shifts to R once that press has
 *    been held REVERSE_ASSIST_HOLD_S of assist time (one ≥ 0.35 s frame is enough).
 *  · ITS TIMEOUT RETURNED WALL TIME. `pathFramesSince` resolved a timeout with
 *    `ms: performance.now() − first`, so 3 frames followed by a 2.5 s render stall «proved» 1996 ms
 *    of reading; W came up, and the one ≥ 0.35 s frame after the stall read S 1 / W 0 together.
 * Both are properties of WHEN the product reads, which the harness cannot observe. No frame count,
 * no wait and no evidence the page can give closes them.
 *
 * THE MECHANISM NOW — AN ORDERING, NOT A TIMING. The S key is pressed and released entirely INSIDE
 * the W press: S down only while W is held (the landing), and at the end S up BEFORE W up, each key
 * call awaited, so the product processes the four key events in exactly that order whatever their
 * latencies.
 *
 * THE SAFETY PROPERTY — RESTATED 2026-09-17 (third pass), BECAUSE THE FIRST STATEMENT WAS REFUTED.
 * Until today this block said the S press «can never be an armed D → R gesture», because «while the S
 * key is held, the W key is held, and W's pedal has been above 0.1 since the flip». That holds only
 * when the landing runs on the W that FLIPPED the gear. An adversary showed, against the product's own
 * ReverseAssist, SimInput and ReversePedalMapper, that two harness paths land on a W pressed AGAIN in D
 * — the stop-first branch of `disarmReverse` whose own press already flipped the gear (the N4 shape),
 * and attempts 2–3 after «D» was missed — and there W's key-down and S's key-down can reach the page
 * with no input read between them: the first read credits both ramps the same time, S (1 per 0.25 s)
 * is above REVERSE_ASSIST_PEDAL_ON while W (1 per 0.35 s) is not, and ReverseAssist ARMS the press
 * until W crosses (path-follow.test.mjs T6.7b re-press: ~53 000 of 1.52 M disarms per path). So the
 * property is restated to the one that is required, and that one is proven:
 *  (a) THE GEAR NEVER GOES BACK TO R — unchanged, not softened: 0 shifts on every path, HUD phase,
 *      frame rate, independently swept latency, long frame, stall and pause T6.7b runs.
 *  (b) ANY PRESS THAT ARMS IS DISARMED BEFORE ITS HOLD REACHES PEDAL_ON × THROTTLE_ATTACK_S
 *      (0.1 × 0.35 s = 35 ms), a tenth of REVERSE_ASSIST_HOLD_S. Derivation, from the product's numbers:
 *      an armed press gains hold only at updates whose functional throttle W is at or below PEDAL_ON
 *      (reverseAssist.ts:265-276); at each of them W's KEY is held (S's key-down is handled after W's,
 *      S's key-up before W's); a held pedal climbs 1 / THROTTLE_ATTACK_S per second of read time from
 *      ≥ 0, and each read's ramp dt and each update's dt share one clamp, MAX_RAMP_DT_S = 0.5 s
 *      (input.ts:147-156, :224-227; sessionClock.ts) — so the updates at which the press is armed carry
 *      at most PEDAL_ON × THROTTLE_ATTACK_S of dt between them. Worst measured on T6.7b's grid: 33.3 ms
 *      (one 30 Hz frame). A pause stretches how long a press STAYS armed on the page clock (2.53 s
 *      measured, a 2.5 s pause) and adds no hold, because the assist is not stepped under it. The one
 *      slack the model cannot show: in the product the assist's dt is the R3F frame delta and the ramp's
 *      is the time since the previous read, which can differ by one frame's spread between its first
 *      and last pedal read — ms, against a ~10× margin.
 *  (b) is the real requirement because REVERSE_ASSIST_HOLD_S of hold is the ONLY thing that turns an
 *  armed press into a shift (reverseAssist.ts:275-279): an arm that W disarms inside it never emits.
 *
 * «NOTHING ARMS AT ALL» SURVIVES ONLY UNDER TWO NAMED DEPENDENCIES (T6.7b ARM_POLL_MS):
 *  · KEY-RESOLVE SEMANTICS: a `page.keyboard` call resolves only once the page has handled the key
 *    (Chromium's Input.dispatchKeyEvent; the pc leg runs Chromium). With a call that resolves BEFORE its
 *    key is handled (T6.7b keyLagX 3), the re-press paths DO arm, and only (b) holds.
 *  · ARM_POLL_MS ≥ PEDAL_ON × THROTTLE_ATTACK_S = 35 ms. `pathSelectorHold` waits ARM_POLL_MS after the
 *    re-press resolves and before the cluster read that lands, so S's key-down is handled at least that
 *    long after W's; every read that sees S then credits W more than 35 ms of ramp, W is above PEDAL_ON
 *    at S's rising edge, and the edge is vetoed (reverseAssist.ts:265-268). Measured on the re-press
 *    paths, undisturbed, over the whole latency grid, presses armed under resolve-after-handled keys:
 *    900 at 0 ms, 240 at 10, 100 at 20, 40 at 25, none from 30 ms (the HUD read's round trip adds to the
 *    wait; the asserted bound does not count on it). path-follow-wiring.test.mjs W-17c fails if
 *    ARM_POLL_MS drops below the bound or stops preceding the landing's cluster read, or if the bench's
 *    poll stops mirroring it.
 * The first path — the landing on the W that flipped — never arms under either semantics: that W has
 * been held since before the flip, so it is full when S's key goes down.
 * WHAT IT ALSO ASSUMES, named: the keys reach the product in the order they were awaited (each
 * `page.keyboard` call resolves before the next is sent — path-follow-wiring.test.mjs W-17 pins the
 * sequential executor); the pedals are the keyboard channel's (this harness drives nothing else,
 * lesson-audit.mjs `inputChannel`); and the R → D flip was the ASSIST's, so LAW 2 does not disown W
 * in D (reverseAssist.ts:359-366 — the harness has no hand-worked gear route,
 * reverseAssist-audit-harness.test.ts §1). If any of those stops being true, so does the argument.
 * path-follow.test.mjs T6.7a pins the ramp arithmetic to input.ts; T6.7b drives THE PRODUCT'S OWN
 * ReverseAssist (imported) and input.ts's ramps through these planners over independently swept
 * latencies, stalls and pauses on all four paths, and shows the first 2026-09-17 landing, the swapped
 * release order and lift-then-brake DO shift the gear.
 *
 * STATUS, 2026-09-17 (fifth pass) — READ THIS FIRST. THIS LANDING IS UNWIRED AND REPLACED BY §10c: lesson-audit.mjs
 * disarmReverse lands through `pathDisarmHold` → `pathDisarmLanding` (§10c, proven on a moving car in
 * path-disarm.test.mjs) and nothing calls `pathDisarmLand` (path-follow-wiring.test.mjs W-17 pins both, and that the
 * bench's default disarm is the harness's). Re-measured on a MOVING car in the product frame order (lib/disarm-sim.mjs,
 * the bench plant's full grid and the product's own VehicleSim): this landing arms nothing there either — the S press
 * meets W above PEDAL_ON or a moving car — but it drives the car tens to hundreds of metres (plant p50 53 m at a 2 ms HUD
 * read on the first path) because the hold waits for a rest the held W never allows; see §10c for the numbers.
 * The fourth pass's status follows, kept as it was measured.
 *  · THE PLANT NOW HAS VehicleSim's PEDAL PRIORITY (path-bench.mjs `pedalStep`; T6.7d green, T6.7e holds the branch
 *    to the product's own VehicleSim cell by cell). On it this landing does what T6.7d measured on the product: run
 *    as the bench's `disarmBrake: true`, every sc-park-judge / -zebra / -gap-short disarm (seeds 7–10) drives the
 *    chassis 0.97–1.12 m INTO the bay body ahead and is refused body-clearance at «hold-for-disarm».
 *  · (b) BELOW IS REFUTED FOR THE PRODUCT'S FRAME ORDER. Its «one slack … ms, against a ~10× margin» is not ms: the
 *    assist's dt is the frame delta, the ramp's credit the time since the previous frame's LAST read, and a long task
 *    before VehicleRig's read makes the next delta exceed that credit by up to the task (the clamp is 0.5 s). T6.7b's
 *    simulator now runs that order: on the re-press paths, with a key call resolving before its key is handled and
 *    a long task BEFORE VehicleRig's read (after the S press is sent, or over the re-pressed W's handling), the S
 *    press arms and reaches REVERSE_ASSIST_HOLD_S in ONE update and the gear goes back to R — 4,950–5,260 of
 *    2,165,760 disarms per path in T6.7b re-press, worst armed hold 277.8 ms against the 35 ms of (b). With every key
 *    call resolved after its key is handled nothing armed or shifted (3,416,064 runs of the same families, HUD phases
 *    0 and 0.04). Long tasks after the assist, stalls and pauses shifted nothing under either semantics.
 *
 * WHAT IT DOES NOT DO IN THE PRODUCT — REFUTED 2026-09-17 (third pass; path-follow.test.mjs T6.7d).
 * This landing exists to BRAKE the change: S down inside W, «so the creep is gone». It brakes nothing in
 * the product. VehicleSim.update (vehicle/VehicleSim.ts:411-447) reads the brake only in the branch where
 * the shaped throttle is 0 — in D `else if (input.throttle > 0)` drives and the brake is never read; in
 * R the same with the functional pedals — so while W's pedal is above 0 the held S does nothing, and the
 * hold, which releases on a dial reading rest, cannot see rest while W pushes: it runs to maxHoldS.
 * Measured on the product's own VehicleSim, rapier and applyDifficulty (T6.7d): from rest in D both
 * pedals full move the car exactly as W alone, in every difficulty; at the canary's timing («D» read
 * 0.1 s after the flip) this landing drives the car 4.79 m forward to 18.2 km/h by its release, where
 * HEAD's W lift on «D» rolled 0.54 m. Every creep number below, and T9.arm's «p90 0.011–0.012 m at every
 * HUD phase», was measured on the bench plant, whose step SUMS drive and brake (path-bench.mjs
 * stepFrame) — a property of the plant, not of the product. DO NOT DRIVE THIS LANDING IN A BROWSER.
 * T6.7d stays red until the plant's pedal priority is VehicleSim's; the landing must then be re-derived
 * under it, keeping (a) and (b) — and, being a braking landing, every «slow HUD» path that concludes
 * «D» (pathSelectorHold's final read included) must run it, which was NOT done here because running
 * this landing on more paths would drive the car further, not less.
 *
 * WHAT IT COSTS ON THE BENCH PLANT (kept as measured, and now known to be the plant's): S's ramp runs out
 * before W's, so for a few frames W pushes with nothing braking. On the plant (T6.7c, coast 0.23 m/s², both
 * pedals full at rest) the roll after the release is 0.005 m with the two key-ups 1–14 ms apart, 0.011 m at
 * 30 ms, 0.031 m at 60 ms, 0.103 m at 120 ms and 0.328 m at 250 ms; at the canary's key timing the whole
 * disarm rolls p90 0.011–0.012 m on T9.arm's grid at every HUD phase. The only orders that avoid the
 * residue lift W while S is held, and those are exactly the ones a pause or a stall turns into a shift
 * back to R.
 *
 * THE FRAME EVIDENCE decides only WHEN to release, never whether the release is safe: S's key comes
 * up only once the page has rendered frames spanning BRAKE_ATTACK_S (input.ts:111) with it down, so
 * S's pedal is FULL at its release and runs out under a W that is running out with it. Measured on
 * the bench before this rule, with the 40 ms «S crossed 0.1» span the first landing used: the dial
 * read «0» at 0.3 km/h (it rounds), S came up at 0.33 and W pushed the car 0.127–0.159 m. It is
 * decided in ONE place,
 * `brakeReadOf`, over the raw timestamps of the frames rendered after S landed; both executors hand
 * it those timestamps and neither computes a verdict. A timeout carries only the frames it saw — no
 * wall-clock span exists anywhere to stand in for a frame.
 *
 * CONSUMED BY (UNTIL 2026-09-17 — see STATUS above): `lesson-audit.mjs disarmReverse` → `pathSelectorHold("D", …,
 * pathDisarmLand)`, now unreferenced, and `lib/path-bench.mjs` disarmReverse → `selectorHold("D", disarmLand)`, now
 * reached only with `disarmBrake: true`. Both only execute
 * these two planners, gather the frame timestamps and poll (path-follow-wiring.test.mjs W-17/W-20; W-17b
 * runs the page's own rAF callback against `brakeReadOf`, so the two collectors stop on one rule).
 */
export const DISARM_BRAKE = Object.freeze({
  /** input.ts:111 BRAKE_ATTACK_S × 1000: the frames that read S down must span this long before S may come up, so its pedal is FULL at the release (T6.7a reads it off input.ts) */
  brakeFullMs: 250,
  /** …over at least this many rendered frames, so no single frame carries it. */
  brakeReadFrames: 3,
  /** no frame evidence, or no rest read, this long after the landing: release anyway — S up, then W up, the same order. */
  maxHoldS: 2.0,
});

/**
 * THE FRAME EVIDENCE, DECIDED IN ONE PLACE. `frameRead` is what an executor gathered after S
 * landed: `{ times, timedOut }`, `times` the timestamps (ms) of the frames the page rendered, in
 * order. The verdict is computed from `times` alone — a record that carries counts or spans but
 * no timestamps is UNREADABLE, never enough. Returns `{ frames, ms, timedOut, proven, unreadable }`
 * where `ms` is the FRAME span (last − first) and `unreadable` names what could not be read (null
 * when the timestamps were read). Consumed by `pathDisarmHoldActions` and, for the stop rule, by
 * path-bench.mjs `framesSince`.
 */
export function brakeReadOf(frameRead) {
  const times = frameRead?.times;
  const timedOut = frameRead?.timedOut === true;
  if (frameRead === null || frameRead === undefined) return { frames: null, ms: null, timedOut, proven: false, unreadable: "no frame record (the page could not be asked)" };
  if (!Array.isArray(times)) return { frames: null, ms: null, timedOut, proven: false, unreadable: `no frame timestamps in ${JSON.stringify(Object.keys(frameRead))}` };
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(times[i])) return { frames: null, ms: null, timedOut, proven: false, unreadable: `frame timestamp ${i} is ${JSON.stringify(times[i])}` };
    if (i > 0 && times[i] < times[i - 1]) return { frames: null, ms: null, timedOut, proven: false, unreadable: `frame timestamps run backwards at ${i} (${times[i - 1]} → ${times[i]})` };
  }
  const frames = times.length;
  const ms = frames ? times[frames - 1] - times[0] : 0;
  return { frames, ms, timedOut, proven: frames >= DISARM_BRAKE.brakeReadFrames && ms >= DISARM_BRAKE.brakeFullMs, unreadable: null };
}

/**
 * THE LANDING, as key actions: S (D's brake) down, W left HELD. Only while W is held — the S press
 * is safe only INSIDE the W press (see «W ENCLOSES S»), so a landing with W already up presses
 * nothing.
 */
export function pathDisarmLandActions(held) {
  const h = heldOf(held);
  const actions = [];
  if (!h.W) return { actions, held: h, why: "W is not held — an S press here would not be enclosed by W and could be armed; nothing pressed" };
  if (!h.S) { actions.push({ ch: "S-hold", down: true }); h.S = true; }
  return { actions, held: h, why: "«D» landed — S (D's brake) down inside the held W" };
}

/**
 * THE HOLD AFTER THE LANDING. Called with the frame record gathered after S landed (`brakeRead`:
 * `{ times, timedOut }` or null), the time since the landing and the dial. Returns the next key
 * actions and `done` when both pedals are handed back. W is NEVER lifted while S is held: the
 * release is always S up, then W up, in that order, in one action list. An unread dial (null / −1)
 * is never «at rest», so the hold then ends only at `maxHoldS`.
 */
export function pathDisarmHoldActions({ held, brakeRead = null, sinceLandS = 0, dialKmh = null }) {
  const h = heldOf(held);
  const actions = [];
  const t = Number.isFinite(sinceLandS) ? sinceLandS : 0;
  const ev = brakeReadOf(brakeRead);
  const evLine = ev.unreadable === null ? `${ev.frames} frames / ${Math.round(ev.ms)} ms${ev.timedOut ? " (timed out)" : ""}` : `UNREADABLE: ${ev.unreadable}`;
  if (h.W && !h.S) {
    actions.push({ ch: "W", down: false });
    h.W = false;
    return { actions, held: h, done: true, why: "W held with no disarm brake down — W lifted (a W lift in D is never a gesture, and no S key is down to meet it)" };
  }
  if (h.W && h.S) {
    const atRest = dialKmh === 0;
    if ((ev.proven && atRest) || t >= DISARM_BRAKE.maxHoldS) {
      actions.push({ ch: "S-hold", down: false }, { ch: "W", down: false });
      h.S = false;
      h.W = false;
      return { actions, held: h, done: true, why: ev.proven && atRest ? `the brake was read over ${evLine} and the dial reads rest — S up, THEN W up` : `no ${ev.proven ? "rest read" : "frame evidence"} in ${DISARM_BRAKE.maxHoldS} s (${evLine}, dial ${dialKmh}) — S up, THEN W up, the same order` };
    }
    return { actions, held: h, done: false, why: !ev.proven ? `holding W and S: no frame evidence yet (${evLine})` : "holding W and S: the dial does not read rest" };
  }
  if (h.S) {
    // Not a state these planners produce: something lifted W out of order. S up is only a lift.
    actions.push({ ch: "S-hold", down: false });
    h.S = false;
    return { actions, held: h, done: true, why: "OUT OF ORDER: S held with W already up (not this planner's doing) — S lifted; a lift is never a press" };
  }
  return { actions, held: h, done: true, why: "no disarm brake held" };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10c THE DISARM'S LANDING ON THE PRODUCT'S PEDALS — BRAKE ONLY A CAR THE ASSIST HAS SEEN MOVING (2026-09-17)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THE PRODUCT DOES, READ OFF ITS SOURCE BEFORE ANYTHING WAS DESIGNED (path-disarm.test.mjs T14.0 pins each):
 *  · VehicleSim.update: in D a shaped throttle above zero DRIVES and the brake is not read; the brake applies only at
 *    zero throttle (§10b's refutation, path-follow.test.mjs T6.7d/e). Under a throttle above zero the forward speed
 *    does not fall (measured on the product's own VehicleSim: ≤ 0.006 km/h of drag, path-disarm.test.mjs T14.3).
 *  · ReverseAssist.update (reverseAssist.ts:231-280) decides an S press ONCE, at its RISING EDGE — the first UPDATE
 *    whose last read has S above REVERSE_ASSIST_PEDAL_ON: `armed = stopped && liftS >= REVERSE_ASSIST_LIFT_S`, and the
 *    press is disarmed outright if the car moves or W is above PEDAL_ON. `liftS` is assist time with S up AND the car
 *    stopped; ANY update with S up that sees |v| ≥ REVERSE_ASSIST_STANDSTILL_KMH sets it to 0. An unarmed press gains
 *    no hold however long it is held; only an armed one shifts, after REVERSE_ASSIST_HOLD_S.
 * So the brief's rule («lift W, then brake with S only while the car is still moving faster than the standstill
 * threshold») is right about the pedals and needs two corrections. (i) What decides is whether the update BEFORE S's
 * rising edge saw the car moving: the rising-edge frame's own physics can stop a slow car inside one long frame, and
 * that is harmless because liftS was already reset. (ii) «W up, then S» is the order that CAN arm: with W up the car
 * coasts between the read that saw it moving and S's key, and nothing but latency bounds that coast (path-disarm.test.mjs
 * T14.6: on its mutation grid W up then S arms presses the shipped order never arms, and without the gate it shifts the
 * gear). S's key must reach the page BEFORE W's key-up.
 *
 * THE LANDING (pathLandingActions), on the read that saw «D» — the cluster and __camProbe.speedKmh (VehicleSim's signed
 * forward speed after a rendered frame's physics, the same number the assist reads) in ONE evaluate, so the gate costs
 * no round trip:
 *  · on the press that FLIPPED the gear (`firstPress`), W still held, speed ≥ brakeFirstKmh — S down and W up, in that
 *    order, DISPATCHED BACK TO BACK (`dispatch: "in-order"`): S's key-down is sent before W's key-up and W's key-up is
 *    not held back for S's round trip, so W comes up exactly when cde40a6's lift would have. Awaiting S first cost W one
 *    key round trip of drive and rolled the car further than the head disarm in 136 of T14.6's 40 032 plant conditions
 *    (up to +0.83 m, a 250 ms key call or a long task queueing S); dispatched, no condition of the whole grid rolls further
 *    (T14.4 (c)), because braking can only take travel away from a coast;
 *  · on any other landing (a W pressed AGAIN in D — attempts 2–3, attempt 1 after a stop-first press that did not land), speed ≥
 *    brakeCoastKmh: the same actions;
 *  · otherwise: W up and nothing else — cde40a6's landing, unchanged.
 * The hold (pathLandingHoldActions) lifts S once the car's own speed reads rest (restKmh), or after maxHoldS. A lift is
 * never a gesture (reverseAssist.ts:244-252).
 *
 * (a)/(b) — WHY THE FIRST-PRESS BRAKE NEVER ARMS, WITH NO TIMING IN THE ARGUMENT:
 *  1. «D» in the same read means the flip happened, so W's key was handled; W's pedal was above PEDAL_ON at the flip's
 *     update and, its key still down, does not fall until W's key-up is handled. The car was not moving forward when W
 *     went down (attempt 1 after the at-rest skip; the stop-first press in R), so a probe at brakeFirstKmh is W's drive.
 *  2. S's key-down is handled before W's key-up (dispatch order). input.ts ramps both pedals on ONE read clock with one
 *     clamp (MAX_RAMP_DT_S), so every read credits S at least the release time it credits W. At any read with
 *     S ≤ PEDAL_ON, S has had ≤ PEDAL_ON × BRAKE_ATTACK_S of credit, so W has lost ≤ PEDAL_ON × BRAKE_ATTACK_S /
 *     THROTTLE_RELEASE_S of pedal — PEDAL_ON on today's ramps (0.25 s / 0.25 s) — from a value above PEDAL_ON: above 0.
 *  3. So every physics substep from the probe's frame to the last update before S's rising edge read W above 0: it
 *     DROVE, the brake was never read, and the speed at that update is ≥ the probe's ≥ brakeFirstKmh > 0.6 km/h. That
 *     update reset liftS to 0.
 *  4. At the rising edge liftS < REVERSE_ASSIST_LIFT_S → `armed = false` → the press accrues no hold, ever.
 *  THE TWO CLOCKS: step 2 is on the read clock alone and step 3 on the physics clock alone; the assist clock decides
 *  only WHEN the rising edge is, never whether liftS was reset before it. The physics and the assist share the frame
 *  delta, its 0.5 s clamp and the pause gate (<Physics paused={physicsPaused}>, RuntimeDriver `if (paused) return;`), so
 *  the last update before the edge saw at least the speed the probe published. (b)'s bound is therefore 0 s of hold —
 *  no press the landing makes is ever armed — and it is MEASURED 0 over the grid (T14.4/T14.5).
 *
 * THE COAST BRAKE IS BOUNDED, AND THE BOUND IS A NAMED DEPENDENCY: without step 1 (a W pressed again in D and not yet
 * handled when the probe's frame rendered — a call that resolves before its key is handled — or no W at all) the car may
 * coast from the probe's frame to S's rising edge: rolling resistance ≤ coastMps2 until S is handled, then S at or below
 * PEDAL_ON brakes ≤ brakeOnMps2 for at most PEDAL_ON × BRAKE_ATTACK_S of read credit plus ONE clamped frame (0.5 s) of
 * the two clocks apart. brakeCoastKmh keeps the update before the edge above 0.6 km/h for up to `coastBoundS` of physics
 * between the probe's frame and S's key-down being handled:
 *     0.6 + 3.6 × (brakeOnMps2 × (PEDAL_ON × BRAKE_ATTACK_S + 0.5) + coastMps2 × coastBoundS) ≤ brakeCoastKmh.
 * T14.2 derives it from the product's measured decelerations and the grid's worst latency; T14.7 shows a coast gate below
 * it arming presses once keys are handled past the bound.
 *
 * AND ONE DEPENDENCY THAT NO LATENCY BOUND COVERS — THE CAR MUST BE FREE TO ROLL FORWARD (measured 2026-09-17): a body the
 * car is driven into during the landing stops it under W, so step 3 fails; liftS grows with S still up, and a read gap at
 * S's rising edge can then arm the press on a car at rest and shift the gear to R with S — R's accelerator — held.
 * T14.8: a body 0.05–0.6 m ahead shifts 363 of 13 344 plant runs, never undisturbed and never at a 2 ms HUD read; the head
 * disarm, which presses no S, never does. The hold lifts S at its first read of R or of backward motion (`alarm`), which
 * cuts the worst reverse from 54 m (a hold blind to the gear, 2 s HUD reads) to 15 m — a consequence bound, not safety.
 * A contact during the disarm is already a collision the body-clearance guard exists to prevent; this landing makes that
 * failure worse, and says so.
 */
export const DISARM_LANDING = Object.freeze({
  /** km/h — the probe speed from which the landing on the press that flipped brakes: above the 0.6 km/h standstill by more than the measured under-drive dip */
  brakeFirstKmh: 0.7,
  /** km/h — the probe speed from which any other landing brakes (the coast bound above: 4.71 km/h needed, T14.2) */
  brakeCoastKmh: 5,
  /** s — the physics time between the probe's frame and S's key-down that brakeCoastKmh is derived for */
  coastBoundS: 2.4,
  /** m/s² — the ceilings the bound is derived with, at every speed up to brakeCoastKmh + 1: the coast deceleration (the product's
   *  worst single step 0.264, beginner and normal alike — it grows with speed, from 0.240 at 2 km/h) and the deceleration at
   *  S = PEDAL_ON (worst 0.936). T14.2 measures both on the product and fails when either passes its ceiling. */
  coastMps2: 0.27,
  brakeOnMps2: 0.94,
  /** km/h — |probe speed| below which the held S comes up */
  restKmh: 0.1,
  /** s — no rest read this long after the landing: S comes up anyway (a lift is never a gesture) */
  maxHoldS: 6,
});

const probeKmhOf = (read) => (read && Number.isFinite(read.v) ? read.v : null);

/**
 * THE LANDING AS KEY ACTIONS. `read` is the evaluate that saw «D»: `{ gear, v }`, `v` the probe's signed forward speed
 * (km/h) or null when it could not be read — an unread speed never brakes. `firstPress`: the landing is on the W press
 * that flipped the gear. Returns `{ actions, held, brake, dispatch, done, why }`: when `brake`, `actions` is S down then
 * W up and `dispatch` is "in-order" — the executor sends them back to back in that order, not awaiting the first; `done`
 * is false only while S is held. S goes through the deliberate helper (`S-hold`): its safety is this gate, not brake()'s
 * ≤ 1 km/h refusal, which exists for presses nobody has proven moving.
 */
export function pathLandingActions({ held, read, firstPress = false, tune = DISARM_LANDING }) {
  const h = heldOf(held);
  const actions = [];
  const v = probeKmhOf(read);
  const onFlip = firstPress === true && h.W;
  const gate = onFlip ? tune.brakeFirstKmh : tune.brakeCoastKmh;
  const who = onFlip ? "the press that flipped" : "not the press that flipped";
  if (h.S) {
    // not a state the disarm reaches (every S press before it is lifted): a W lift is only a lift, S stays as found
    if (h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
    return { actions, held: h, brake: false, dispatch: "awaited", done: true, why: "S already held when «D» landed — W lifted, nothing pressed" };
  }
  if (v === null || !(v >= gate)) {
    if (h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
    return { actions, held: h, brake: false, dispatch: "awaited", done: true, why: `probe ${v === null ? "unread" : `${v.toFixed(2)} km/h`} < ${gate} km/h (${who}) — W lifted, no brake` };
  }
  actions.push({ ch: "S-hold", down: true });
  h.S = true;
  if (h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
  return { actions, held: h, brake: true, dispatch: "in-order", done: false, why: `probe ${v.toFixed(2)} km/h ≥ ${gate} km/h (${who}) — S down, THEN W up, dispatched in that order` };
}

/**
 * THE HOLD AFTER A BRAKING LANDING: S comes up once |probe| < restKmh, or at maxHoldS; nothing is ever pressed here.
 * AND AT ONCE IF THE GEAR IS NO LONGER D OR THE CAR MOVES BACKWARDS (`gear`: the cluster letters of the same read).
 * §10c's argument holds on a car FREE to roll: a body the car is driven into stops it under W, liftS then grows, and a
 * read gap can let S's rising edge meet W at or below PEDAL_ON on a car at rest — an armed press, and R
 * (path-disarm.test.mjs T14.8 measures it). In R the held S is the ACCELERATOR, so the hold must never keep it: this
 * bounds what that failure can do to one poll of reverse drive. It is a consequence bound, not the proof.
 */
export function pathLandingHoldActions({ held, v = null, gear = null, sinceLandS = 0, tune = DISARM_LANDING }) {
  const h = heldOf(held);
  const actions = [];
  const t = Number.isFinite(sinceLandS) ? sinceLandS : 0;
  if (h.W) { actions.push({ ch: "W", down: false }); h.W = false; }
  if (!h.S) return { actions, held: h, done: true, why: "no landing brake held" };
  const leftD = Array.isArray(gear) && gear.some((g) => g !== "D");
  const backwards = Number.isFinite(v) && v <= -tune.restKmh;
  const atRest = Number.isFinite(v) && Math.abs(v) < tune.restKmh;
  if (leftD || backwards || atRest || t >= tune.maxHoldS) {
    actions.push({ ch: "S-hold", down: false });
    h.S = false;
    const why = leftD
      ? `THE CLUSTER READS «${gear.join("/")}» WHILE S IS HELD — S up at once (in R it is the accelerator)`
      : backwards
        ? `THE CAR MOVES BACKWARDS (${v.toFixed(2)} km/h) WHILE S IS HELD — S up at once`
        : atRest
          ? `the car reads rest (${v.toFixed(3)} km/h) — S up`
          : `no rest read in ${tune.maxHoldS} s (probe ${v}) — S up anyway`;
    return { actions, held: h, done: true, alarm: leftD || backwards, why };
  }
  return { actions, held: h, done: false, why: `holding S: probe ${v === null ? "unread" : `${v.toFixed(2)} km/h`}` };
}

/** The pause drain's effect on the reducer (§6.7). */
export function pathOnPauseDrain(state) {
  const atRestLatched = state.latch.brake && state.restSince !== null;
  return {
    ...state,
    latch: { ...state.latch, brake: false },
    mod: { e: 0, kPrev: 0 },
    stall: { ...state.stall, frameAt: null, entries: 0, onset: null, drained: true },
    stopHeldWithoutBrake: atRestLatched,
    books: { ...state.books, stopHeldWithoutBrake: state.books.stopHeldWithoutBrake + (atRestLatched ? 1 : 0) },
  };
}

/** At every runner entry: measured delays in, derived τ_eff and R band out, the drain marker cleared; an extended budget booked. */
export function pathRunnerEntry(state, measured = {}, baseMs = null) {
  if (Number.isFinite(baseMs) && pathRunnerBudgetMs(state, baseMs) > baseMs) state.books.nearLockBudgetEntries += 1;
  return {
    ...state,
    tauEffS: delayModel({ poseP90S: measured.frameP90S, ioP90S: measured.ioP90S, periodP50S: measured.periodP50S, kmh: Math.abs(state.last?.v ?? 0) }),
    band: reverseBand({ aCoastMeas: state.aCoastMeas, blindP90S: measured.blindP90S }),
    stall: { ...state.stall, drained: false },
  };
}

/** The SELF-REPORT block published as `pathFollow` (§8.2) — never a gate. */
export function pathFollowBooks(state) {
  const pm = [...state.books.pm].sort((a, b) => a - b);
  const word = state.mode === "refused" ? "refused" : state.refusals.length ? "degraded" : state.books.segments.some((s) => s.ctMaxM > 1.0) ? "lost" : state.books.segments.some((s) => s.ctMaxM > 0.6) ? "degraded" : "followed";
  const rest = state.yaw.rest;
  return {
    selfReport: "SELF-REPORT — the controller's own books; they gate nothing",
    state: word,
    mode: state.mode,
    segIndex: state.segIndex,
    refusals: state.refusals,
    segments: state.books.segments,
    arms: state.books.arms,
    disarms: state.books.disarms,
    endPoses: state.endPoses,
    sign: { verdict: state.sign.verdict, why: state.sign.why, windows: state.sign.windows },
    stability: { tauEffP90S: r3(state.tauEffS), pmP10Deg: pm.length ? r2(pm[Math.floor(pm.length * 0.1)]) : null, stabilityCappedM: r2(state.books.stabilityCappedM) },
    landing: steerLandingSummary(state.landing),
    yaw: {
      camYawCheck: { bins: state.yaw.bins.map((b) => ({ kappaPerM: `[${b.lo}, ${b.hi})`, n: b.n, meanAbsDeg: b.n ? r2(b.sumAbs / b.n) : null, maxDeg: r2(b.max) })), standstillStdDeg: rest.n > 1 ? r3(Math.sqrt(Math.max(0, rest.sumSq / rest.n - (rest.sum / rest.n) ** 2))) : null },
      camYawSuspect: state.yaw.suspect,
      source: state.yaw.source,
    },
    stall: { returns: state.stall.returns, pauseLayerReturns: state.stall.pauseLayerReturns, maxStallMs: state.stall.maxStallMs },
    returns: state.books.returns,
    speedBand: { bandLoR: r2(state.band.lo), bandHiR: r2(state.band.hi), derivedFrom: state.band.derivedFrom },
    aBrakeMeas: r2(state.aBrakeMeas),
    aCoastMeas: r3(state.aCoastMeas),
    authority: authorityVerdict(state.authority),
    microOvershootM: state.books.microOvershootM,
    // the micro square-up's own books (squareUpSteer): per segment and phase, how many sub-ticks
    // it decided, how many held a steer key, over how many metres, and the heading error to the
    // micro's authored end heading when it started and when it last decided
    squareUp: (state.books.squareUp ?? []).map(({ last, ...b }) => b),
    // the heading re-approaches (yawReapproach): each attempt, the rest it started from, its target, and how the
    // square-up law ended — so a test can see the branch FIRED and steered, not merely that it exists
    yawCreeps: state.books.yawCreeps ?? [],
    stopHeldWithoutBrake: state.books.stopHeldWithoutBrake,
    nearLock: { metres: state.books.nearLockM, budgetEntries: state.books.nearLockBudgetEntries, budgetMs: (state.tune ?? PATH_TUNE).runner.nearLockBudgetMs },
    impacts: state.books.impacts,
    holds: state.books.holds,
    /**
     * WHAT THE DRIVE ACTUALLY CLEARED, per segment, as the follower measured it live: the
     * worst separation of the chassis box from a mounted body at a pose the car really
     * held, and the worst over the braking ribbon predicted from it. The SAME measurement
     * `drive-clearance.mjs` makes of the finished pose record, so the two are comparable.
     * Read by the refusal text and by the T13.5 benches.
     */
    bodyClearance: state.books.clearance,
    /**
     * WHAT THE PLAN SAID ABOUT ITS OWN BODY CLEARANCE, per witness actually entered.
     * `state: "unscreened"` is reported here, never omitted: a pathref built before the
     * body screen existed must not read the same as one that passed it.
     */
    witnessBody: state.books.witnessBody,
  };
}
