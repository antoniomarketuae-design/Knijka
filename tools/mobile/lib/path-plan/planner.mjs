// PORTED VERBATIM from the Slice 0 feasibility screen (scratchpad/steering/slice0/planner.mjs,
// 2026-09-15, DESIGN-v2 §2.2). The only edits: the import below points at ./geom.mjs, and
// `planWitness` is appended at the end so the builder can keep the chosen δ profile.
// Slice 0 — lock-limited planners over ONE authored gear segment. Pure, no browser.
//
// The car: kinematic bicycle. Rear axle is a unicycle with path curvature
// gain(v)·tan(δ)/L (|δ| ≤ lock(v), δ rate-limited at 3.2 rad/s at the authored
// speed), chassis origin 1.28 m ahead of it along the FACING (tuning.ts:109-114).
// The authored trace is a centre-point path whose heading is its own tangent
// (recorder.ts:470-511, REVIEW-feasibility M1), so the question asked of every
// segment is about the CHASSIS ORIGIN against the authored CENTRE polyline.
//
// Three independent witnesses; the best one wins; every FEASIBLE claim is a
// concrete δ-target sequence that `simulateTargets` re-integrates from scratch:
//   (1) beamPlan      — knot-lattice beam search over δ, frontier = union of the
//                       best by reachability (Dubins length-to-go) and the best by
//                       worst deviation, under a HARD centre-deviation corridor.
//   (2) dubinsPlan    — closed-form shortest bounded-curvature paths of the rear
//                       axle to poses sampled inside the end box.
//   (3) polishProfile — pattern search on a knotted δ profile seeded by (1)/(2).
// "Not found" means no witness from any of the three, and is reported as such.
import { CAR, DEG, ENDPOSE_CORRIDOR_M, RAD, R_REAR_MIN, TRACK_CORRIDOR_M, maxSteerAtKmh, yawGainAtKmh, wrapDeg } from "./geom.mjs";

const A = CAR.a;

export function project(ref, cx, cy, cur, back, ahead) {
  let best = Infinity, bi = cur;
  const lo = Math.max(0, cur - back), hi = Math.min(ref.n - 1, cur + ahead);
  for (let k = lo; k <= hi; k++) {
    const dx = ref.X[k] - cx, dy = ref.Y[k] - cy;
    const d = dx * dx + dy * dy;
    if (d < best) { best = d; bi = k; }
  }
  return [Math.sqrt(best), bi];
}

/* ── Dubins (math frame θ CCW from +x). The rear axle is a forward Dubins car along its MOTION direction. ── */
const mod2pi = (a) => { const t = 2 * Math.PI; return ((a % t) + t) % t; };
export function dubinsWords(alpha, beta, d) {
  const sa = Math.sin(alpha), sb = Math.sin(beta), ca = Math.cos(alpha), cb = Math.cos(beta), cab = Math.cos(alpha - beta);
  const out = [];
  { const tmp = 2 + d * d - 2 * cab + 2 * d * (sa - sb); if (tmp >= 0) { const th = Math.atan2(cb - ca, d + sa - sb); out.push(["LSL", mod2pi(-alpha + th), Math.sqrt(tmp), mod2pi(beta - th)]); } }
  { const tmp = 2 + d * d - 2 * cab + 2 * d * (sb - sa); if (tmp >= 0) { const th = Math.atan2(ca - cb, d - sa + sb); out.push(["RSR", mod2pi(alpha - th), Math.sqrt(tmp), mod2pi(-beta + th)]); } }
  { const tmp = -2 + d * d + 2 * cab + 2 * d * (sa + sb); if (tmp >= 0) { const p = Math.sqrt(tmp); const th = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p); out.push(["LSR", mod2pi(-alpha + th), p, mod2pi(-mod2pi(beta) + th)]); } }
  { const tmp = -2 + d * d + 2 * cab - 2 * d * (sa + sb); if (tmp >= 0) { const p = Math.sqrt(tmp); const th = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p); out.push(["RSL", mod2pi(alpha - th), p, mod2pi(beta - th)]); } }
  { const tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8; if (Math.abs(tmp) <= 1) { const p = mod2pi(2 * Math.PI - Math.acos(tmp)); const t = mod2pi(alpha - Math.atan2(ca - cb, d - sa + sb) + p / 2); out.push(["RLR", t, p, mod2pi(alpha - beta - t + p)]); } }
  { const tmp = (6 - d * d + 2 * cab + 2 * d * (-sa + sb)) / 8; if (Math.abs(tmp) <= 1) { const p = mod2pi(2 * Math.PI - Math.acos(tmp)); const t = mod2pi(-alpha - Math.atan2(ca - cb, d + sa - sb) + p / 2); out.push(["LRL", t, p, mod2pi(mod2pi(beta) - alpha - t + p)]); } }
  return out;
}
function dubinsShortest(x0, y0, th0, x1, y1, th1, rho) {
  const dx = x1 - x0, dy = y1 - y0, D = Math.hypot(dx, dy), phi = Math.atan2(dy, dx);
  let best = Infinity;
  for (const w of dubinsWords(mod2pi(th0 - phi), mod2pi(th1 - phi), D / rho)) { const L = (w[1] + w[2] + w[3]) * rho; if (L < best) best = L; }
  return best;
}
const motionTheta = (psiDeg, sigma) => (90 - psiDeg) * RAD + (sigma < 0 ? Math.PI : 0);

/**
 * THE WHEEL A WITNESS MAY ASK FOR (2026-09-16). Forward, and whenever the caller
 * supplies no `ctx.reverseAuthority`, this is the product's lock and nothing moves
 * — Slice 0's own cases in `path-plan.test.mjs` §1 never supply it.
 *
 * In REVERSE the car does not have that lock. Every witness is integrated at
 * κ × `ctx.kappaScale` (0.95, GENERATOR), and the product turned only 0.892–0.896
 * of the kinematic lock curvature over its saturated reverse arcs (canary-path-s2,
 * the calibration `path-bench.mjs` BENCH.revKappaScale carries). A witness planned
 * AT lock therefore asks the car for ~6 % more curvature than it has, for as long as
 * the arc lasts — and a follower that is already saturated has nothing left to
 * correct with. Measured on the calibrated bench (sc-park-left R1 −0.5, seeds 7–10):
 * the car ran 0.135–0.149 m off the witness through a 4.8 m lock arc and came to
 * rest 0.10–0.13 m wider than the row it was planned to rest in, and a witness
 * re-planned closer to the bay centre with the same full lock drove 0.20–0.27 m wide
 * and was refused `body-clearance` on 3 seeds of 4.
 *
 * So a reverse witness is capped at the wheel whose curvature, at the planning κ,
 * equals what the car delivers at full lock: tan δ ≤ (authority / κ) · tan(lock).
 * The authority is `policy.mjs REVERSE_LOCK_AUTHORITY`, and a value that cannot be
 * read is REFUSED by name rather than planned at an assumed lock.
 */
export function lockFor(ctx, vKmh) {
  const lock = maxSteerAtKmh(vKmh);
  const auth = ctx?.reverseAuthority;
  if (!(ctx?.sigma < 0) || auth === undefined || auth === null) return lock;
  if (!(Number.isFinite(auth) && auth > 0 && auth <= 1)) throw new Error(`lockFor: ctx.reverseAuthority is ${auth} — refusing to plan a reverse witness against an authority that is not a fraction in (0, 1]`);
  const ks = ctx.kappaScale ?? 1;
  if (!(Number.isFinite(ks) && ks > 0)) throw new Error(`lockFor: ctx.kappaScale is ${ks} — refusing to scale a reverse lock by it`);
  return Math.min(lock, Math.atan((auth / ks) * Math.tan(lock)));
}
/** The rear-axle radius at the wheel `lockFor` allows — R_REAR_MIN whenever no cap applies. */
function rearRadiusFor(ctx, vKmh) {
  const lock = lockFor(ctx, vKmh);
  return lock === maxSteerAtKmh(vKmh) ? R_REAR_MIN : CAR.L / Math.tan(lock);
}

/** One integration step of the bicycle. δ moves toward dTarget, rate-limited, clamped at `lock` (the product's, unless lockFor capped it). */
function stepCar(st, dTarget, sigma, h, vk, kappaScale, lock = maxSteerAtKmh(vk)) {
  const rate = (CAR.steerRate * h) / Math.max(vk / 3.6, 1 / 3.6);
  let d = st.d + Math.max(-rate, Math.min(rate, dTarget - st.d));
  if (d > lock) d = lock; else if (d < -lock) d = -lock;
  const kap = (yawGainAtKmh(vk) * kappaScale * Math.tan(d)) / CAR.L;
  const dpsi = sigma * kap * h * DEG;
  const pm = (st.psi + dpsi / 2) * RAD;
  const rx = st.rx + sigma * Math.sin(pm) * h, ry = st.ry + sigma * Math.cos(pm) * h, psi = st.psi + dpsi;
  return { rx, ry, psi, d, cx: rx + A * Math.sin(psi * RAD), cy: ry + A * Math.cos(psi * RAD) };
}

/* ═════════════ the one integrator every witness is judged by ═════════════ */

/**
 * Integrate δ targets (dAt(i) for step i = 1..nSteps, each `dsSim` m of rear travel) from the
 * authored start pose with initial wheel d0 (a stationary car may pre-steer), and pick the best
 * place to STOP inside the end box, scored by the worst centre deviation up to that stop.
 */
export function simulateTargets(ctx, d0, dAt, nSteps, { keepPath = false } = {}) {
  const { ref, sigma, start, end, box, vAtArc, kappaScale = 1, dsSim = 0.05, extraTargets = [] } = ctx;
  let st = { rx: start.x - A * Math.sin(start.psi * RAD), ry: start.y - A * Math.cos(start.psi * RAD), psi: start.psi, d: d0, cx: start.x, cy: start.y };
  let cur = ctx.cur0 ?? 0, prefMax = 0, best = null, closest = null, bestPose = null, saturatedM = 0, travelledM = 0;
  const poseCorridor = ctx.poseCorridor ?? Infinity;
  // ── THE BODY-CLEARANCE CHANNEL (2026-09-16) ─────────────────────────────
  // `ctx.clearanceAt(cx, cy, psi) -> metres` is body-screen.mjs `clearanceFn`:
  // ONE screen, so what is optimised here is what the emit gate reads back.
  // With it absent every line it guards is skipped and this integrator behaves
  // exactly as it did before. `bestClear` is the in-box stop that MAXIMISES the
  // running minimum clearance of the prefix reaching it, subject to that
  // prefix's deviation staying inside `ctx.clearCorridor` and to `ctx.endGate`
  // (the product park box) admitting the stop pose.
  const clearanceAt = ctx.clearanceAt ?? null;
  const clearCorridor = ctx.clearCorridor ?? poseCorridor;
  const endGate = ctx.endGate ?? null;
  // ── AMONG EQUALLY CLEAR STOPS, THE ONE WITH THE MOST ROOM (2026-09-16) ───
  // The running minimum clearance only ever falls, so once the binding pose is
  // behind the car every later stop TIES on it — and `minClear > b.clear` kept the
  // FIRST of the tied stops: the shallowest pose the gate admits, a stop parked on
  // the gate's own edge (sc-park-left R1 +0.5 at a rest radius of 0.481 m against
  // 0.5; sc-park-zebra R1 0 at 5.77° with the drive then resting at 11°).
  // `ctx.endRoom(cx, cy, psi)` is the PRODUCT park box norm (build-pathrefs.mjs
  // parkGateFor `productNorm`, ≤ 1 inside it); an EXACT tie on clearance is broken
  // toward the smaller one. It never outvotes clearance. Absent, the old
  // first-of-the-ties rule stands, and every Slice 0 case is unchanged. It is read
  // at the pose this integrator stops at, where `endGate` is asked; the builder's
  // `pickStop` asks both of the row the car rests in (build-pathrefs.mjs says why
  // the search was not moved to the rest pose as well: it was measured, and worse).
  const endRoom = ctx.endRoom ?? null;
  const clearLadder = ctx.clearEndLadder ?? [...CLEAR_END_LADDER, CLEAR_END_LAST_RESORT];
  const lastResortAt = clearLadder.length - 1;
  const clearTarget = ctx.clearTargetM ?? CLEAR_TARGET_M;
  let minClear = Infinity, bestClear = null, clearLive = !!clearanceAt;
  const clearByRung = clearanceAt ? new Array(clearLadder.length).fill(null) : null;
  const extra = Object.fromEntries(extraTargets.map((t) => [t.name, null]));
  const path = keepPath ? [[st.cx, st.cy, st.psi, st.d, 0]] : null;
  const back = Math.max(2, Math.round(0.4 / ref.ds)), ahead = Math.max(4, Math.round(0.8 / ref.ds));
  for (let i = 1; i <= nSteps; i++) {
    const vk = vAtArc(cur * ref.ds);
    const lockK = lockFor(ctx, vk);
    st = stepCar(st, dAt(i), sigma, dsSim, vk, kappaScale, lockK);
    travelledM += dsSim;
    if (Math.abs(st.d) >= lockK - 1e-6) saturatedM += dsSim;
    const [dev, c2] = project(ref, st.cx, st.cy, cur, back, ahead);
    cur = c2;
    if (dev > prefMax) prefMax = dev;
    // past the corridor no later stop can qualify, so the screen stops paying for itself
    if (clearLive && prefMax > clearCorridor + 1e-9) clearLive = false;
    if (clearLive) {
      const g = clearanceAt(st.cx, st.cy, st.psi);
      if (!Number.isFinite(g)) throw new Error(`simulateTargets: ctx.clearanceAt returned ${g} at step ${i} — refusing to score a pose whose body clearance could not be read`);
      if (g < minClear) minClear = g;
    }
    if (keepPath) path.push([st.cx, st.cy, st.psi, st.d, dev]);
    const posErr = Math.hypot(st.cx - end.x, st.cy - end.y);
    const yawErr = Math.abs(wrapDeg(st.psi - end.psi));
    const norm = Math.max(posErr / box.posM, yawErr / box.yawDeg);
    if (!closest || norm < closest.norm) closest = { norm, posErr, yawErr, maxDev: prefMax, travel: travelledM };
    if (prefMax <= poseCorridor && (!bestPose || norm < bestPose.norm)) bestPose = { norm, posErr, yawErr, maxDev: prefMax, travel: travelledM, stepIdx: i, pose: [st.cx, st.cy, st.psi] };
    if (norm <= 1 && (!best || prefMax < best.maxDev - 1e-9 || (Math.abs(prefMax - best.maxDev) < 1e-9 && posErr < best.posErr))) best = { maxDev: prefMax, posErr, yawErr, travel: travelledM, stepIdx: i, saturatedM };
    if (clearLive && norm <= clearLadder[lastResortAt] + 1e-9 && (!endGate || endGate(st.cx, st.cy, st.psi))) {
      let room = null;
      if (endRoom) {
        room = endRoom(st.cx, st.cy, st.psi);
        if (!Number.isFinite(room)) throw new Error(`simulateTargets: ctx.endRoom returned ${room} at step ${i} — refusing to rank a stop whose park-box room could not be read`);
      }
      for (let j = 0; j < clearLadder.length; j++) {
        if (norm > clearLadder[j] + 1e-9) continue;
        const b = clearByRung[j];
        const better = !b || minClear > b.clear + 1e-9 || (room !== null && Math.abs(minClear - b.clear) <= 1e-9 && room < b.room - 1e-9);
        if (better) clearByRung[j] = { clear: minClear, maxDev: prefMax, norm, posErr, yawErr, travel: travelledM, stepIdx: i, saturatedM, rung: clearLadder[j], pose: [st.cx, st.cy, st.psi], room };
      }
    }
    for (const tg of extraTargets) if (tg.test(st.cx, st.cy, st.psi)) { const b = extra[tg.name]; if (!b || prefMax < b.maxDev) extra[tg.name] = { maxDev: prefMax, posErr, yawErr, travel: travelledM, stepIdx: i }; }
  }
  if (clearByRung) {
    // THE LADDER RULE: the TIGHTEST rung that reaches the clearance target wins.
    // Only when no rung reaches it does the search take the loosest stop it can
    // find — so end-pose slack is spent to buy clearance the lesson needs, never
    // because it happened to be free.
    for (const b of clearByRung) if (b && b.clear >= clearTarget) { bestClear = b; break; }
    // the loosest rung THAT STILL LEAVES THE RE-INTEGRATION ROOM…
    if (!bestClear) for (let j = lastResortAt - 1; j >= 0; j--) if (clearByRung[j]) { bestClear = clearByRung[j]; break; }
    // …and only then the box edge itself
    if (!bestClear && clearByRung[lastResortAt]) bestClear = { ...clearByRung[lastResortAt], lastResort: true };
  }
  if (best && path) best.path = path.slice(0, best.stepIdx + 1);
  if (bestClear && path) bestClear.path = path.slice(0, bestClear.stepIdx + 1);
  return { best, closest, bestPose, bestClear, clearByRung, extra, path };
}

export function simulateProfile(ctx, knots, h, opts) {
  const ds = ctx.dsSim ?? 0.05;
  const nSteps = Math.floor(((knots.length - 1) * h) / ds);
  const dAt = (i) => { const u = ((i - 0.5) * ds) / h; const k0 = Math.min(knots.length - 2, Math.floor(u)), f = u - k0; return knots[k0] * (1 - f) + knots[k0 + 1] * f; };
  return simulateTargets(ctx, knots[0], dAt, nSteps, opts);
}

const J = (r) => (r.best ? r.best.maxDev : 10 + r.closest.norm);

/* ═════════════ the clearance objective (2026-09-16) ═════════════
 *
 * WHY. Everything above scores a candidate on ONE number: the worst deviation
 * of the chassis centre from the authored demonstration polyline. `planner.mjs`
 * has no body model, so nothing in it knows a parked car exists — and the
 * authored lines themselves graze their neighbours (sc-park-left passes
 * lotlf-bay-4 at −0.0030 m, sc-park-wall the garage wall at +0.0940 m). Scoring
 * deviation alone therefore steers every plan INTO the body it is closest to.
 * The objective below keeps the deviation corridor as a HARD constraint (the
 * class must not move) and maximises the clearance inside it.
 */

/**
 * Clearance above which more clearance buys nothing. At 0.45 m the follower's
 * worst measured error (0.088 m) and the floor its live guard refuses under
 * (drive-clearance.mjs DRIVE_CLEARANCE_FLOOR_M, 0.05 m — since 2026-09-16; it was
 * the retired in-bay proxy's 0.10 m margin when this cap was chosen, so the cap is
 * if anything more generous than it needs to be) both fit with room to spare, and
 * without a cap the maximiser spends deviation it does not need: clearance and
 * deviation trade about 1:1, so an uncapped search walks a clear witness out to
 * the corridor edge to buy centimetres nothing reads.
 */
export const CLEAR_CAP_M = 0.45;

/**
 * THE EFFORT PENALTY. Without it the maximiser pre-steers ~0.478 rad at
 * standstill and reverses the wheel four times in the last metre to buy
 * centimetres — a profile the follower cannot track, so the clearance it buys
 * is spent again as following error. Two terms, both in radians of δ:
 * `varRad` on the mean knot-to-knot variation (how much the wheel is worked),
 * `d0Rad` on the standing pre-steer (`knots[0]`, the wheel angle before the car
 * has moved, which no student and no follower reproduces). Measured on the
 * probe: both weights together cost ≈ 1 cm of clearance and produced far
 * cleaner profiles.
 */
export const EFFORT_W = Object.freeze({ varRad: 0.05, d0Rad: 0.15 });

/**
 * The deviation the search leaves unspent for the re-integration. The builder
 * re-integrates the chosen profile with δ ROUNDED AS STORED, which moves the
 * path a little; `build-pathrefs.mjs` already allows 0.03 m for that when it
 * admits a stop. Searching inside (corridor − this) keeps the ROUNDED rows
 * inside the class boundary, so a clearance-maximising witness cannot silently
 * demote FEASIBLE-TRACK to FEASIBLE-ENDPOSE by a millimetre.
 */
export const CLEAR_DEV_MARGIN_M = 0.03;

/**
 * THE END-POSE LADDER. A pc-path leg is graded on WHERE IT STOPS as well as on
 * the path it took, and the deviation-only planner's tight pass reaches the
 * authored end to millimetres. A clearance maximiser given the whole acceptance
 * box will spend all of it, because a stop 0.45 m from the authored pose is
 * worth exactly as much to it as one 0.002 m away. So the slack is BOUGHT: the
 * rungs below are fractions of the acceptance box `norm`, tightest first, and
 * `simulateTargets` takes the tightest rung that reaches CLEAR_TARGET_M of
 * clearance — dropping to a looser one only when the tighter one cannot.
 *
 * The last rung is 0.9, not 1.0, for the same reason CLEAR_DEV_MARGIN_M exists:
 * the builder re-integrates the chosen profile with δ rounded as stored, which
 * moves the end pose a little, and a stop planned ON the box edge lands outside
 * it and is graded INFEASIBLE. Measured on sc-park-wall before this rung was
 * added: grid 0 planned a stop inside the box and re-integrated to 0.502 m
 * against a 0.5 m box.
 */
export const CLEAR_END_LADDER = Object.freeze([0.2, 0.5, 0.9]);

/**
 * …AND A LAST RESORT AT THE BOX EDGE ITSELF, because a rung that leaves room is a
 * PREFERENCE and losing the only reachable stop is a defect. sc-park-bay-exit-rev's
 * authored R end is infeasible for this car (Slice 0 §8); its re-planned stop sits
 * at norm 0.949 of a relaxed 1.0 m / 15° box, so a ladder ending at 0.9 found no
 * stop at all, the clearance pass returned nothing, and the build fell back to the
 * deviation plan — which drives 0.20 m INTO lot-bay-4 — without saying a word. This
 * rung is used only when no rung above has a stop, and the profile records that it
 * was taken (`lastResort`).
 */
export const CLEAR_END_LAST_RESORT = 1.0;

/**
 * The clearance at which the search stops buying end-pose slack: BODY_WARN_M,
 * twice the floor — the point above which `body-screen.mjs` stops attaching a
 * caveat to the committed witness, because the follower's own in-bay refusal
 * margin is no longer the only thing left between the plan and the neighbour.
 * (Mirrored rather than imported: planner.mjs owns no world model and importing
 * the screen here would make the two files circular.)
 */
export const CLEAR_TARGET_M = 0.3;

/** Mean knot-to-knot variation of a δ profile — «how hard is this to track». */
export function effortOf(knots) {
  if (!knots || knots.length < 2) return 0;
  let v = 0;
  for (let i = 1; i < knots.length; i++) v += Math.abs(knots[i] - knots[i - 1]);
  return v / (knots.length - 1);
}

/**
 * J to MINIMISE. Feasible = there is a stop inside the acceptance box (and the
 * product park box, when `ctx.endGate` binds) whose prefix stays inside the
 * deviation corridor. Among those, more clearance wins, capped; ties are broken
 * toward a tighter end pose and a tighter corridor, both at a hundredth of the
 * clearance weight so neither can outvote it. Infeasible candidates are ranked
 * by how far the end still is, so the search has a gradient to follow.
 */
export function clearanceObjective({ cap = CLEAR_CAP_M, effort = EFFORT_W } = {}) {
  return (res, knots) => {
    if (!res.bestClear) return 100 + (res.closest ? res.closest.norm : 100);
    const b = res.bestClear;
    return -Math.min(b.clear, cap) + effort.varRad * effortOf(knots) + effort.d0Rad * Math.abs(knots ? knots[0] : 0) + 0.02 * b.posErr + 0.01 * b.maxDev;
  };
}

/**
 * THE DETERMINISTIC MULTI-START. Nothing in this pipeline draws a random
 * number; what the adversary called a «seed» is the START POINT the coordinate
 * pattern search descends from, and changing only that moved sc-park-left's
 * reported family minimum. A single start therefore reports a local optimum as
 * if it were the family's answer. So every start below is run, all are scored
 * by the SAME objective, and the best wins — with the tie broken by this fixed
 * order, so the emitted witness is reproducible rather than lucky. The winner's
 * name is written into the pathref (`witness.clearancePlan.start`) and printed
 * by the build, because «which start won» is a fact about the artefact.
 */
export const CLEAR_STARTS = Object.freeze(["dev-best", "dev-tight", "zero", "lock+", "lock-"]);
/** A quick pass (the band-corner screen) runs only the first three; a corner it fails is re-run full. */
export const CLEAR_STARTS_QUICK = Object.freeze(["dev-best", "dev-tight", "zero"]);
/** Pattern-search step ladder for the clearance pass (radians of δ). */
export const CLEAR_STEPS = Object.freeze([0.3, 0.25, 0.12, 0.06, 0.03, 0.015, 0.008]);

export function polishProfile(ctx, knots0, h, { stepSizes = [0.3, 0.15, 0.08, 0.04, 0.02, 0.01], budget = 5000, objective = J } = {}) {
  const Jx = objective;
  let x = Float64Array.from(knots0);
  let fx = Jx(simulateProfile(ctx, x, h), x);
  let evals = 1;
  const lock = lockFor(ctx, ctx.vAtArc(0));
  for (const s of stepSizes) {
    let improved = true;
    while (improved && evals < budget) {
      improved = false;
      for (let i = 0; i < x.length && evals < budget; i++) {
        for (const sg of [1, -1]) {
          const y = Float64Array.from(x);
          y[i] = Math.max(-lock, Math.min(lock, y[i] + sg * s));
          if (y[i] === x[i]) continue;
          const fy = Jx(simulateProfile(ctx, y, h), y); evals++;
          if (fy < fx - 1e-6) { x = y; fx = fy; improved = true; break; }
        }
      }
    }
  }
  return { knots: x, f: fx, evals };
}

/* ═════════════ (2) Dubins ═════════════ */

export function dubinsPlan(ctx, { gainKmh = 3, maxSeeds = 4 } = {}) {
  const { ref, sigma, start, end, box, kappaScale = 1 } = ctx;
  const rho = rearRadiusFor(ctx, gainKmh) / (yawGainAtKmh(gainKmh) * kappaScale);
  const rearOf = (p) => ({ x: p.x - A * Math.sin(p.psi * RAD), y: p.y - A * Math.cos(p.psi * RAD) });
  const s = rearOf(start), th0 = motionTheta(start.psi, sigma);
  const cands = [];
  const offs = [];
  for (let dx = -box.posM; dx <= box.posM + 1e-9; dx += box.posM / 4) for (let dy = -box.posM; dy <= box.posM + 1e-9; dy += box.posM / 4) if (Math.hypot(dx, dy) <= box.posM * 0.9 + 1e-9) offs.push([dx, dy]);
  for (const [ox, oy] of offs) for (const dyaw of [-0.9 * box.yawDeg, -0.45 * box.yawDeg, 0, 0.45 * box.yawDeg, 0.9 * box.yawDeg]) {
    const goal = { x: end.x + ox, y: end.y + oy, psi: end.psi + dyaw };
    const g = rearOf(goal), th1 = motionTheta(goal.psi, sigma);
    const dx = g.x - s.x, dy = g.y - s.y, D = Math.hypot(dx, dy), phi = Math.atan2(dy, dx);
    for (const w of dubinsWords(mod2pi(th0 - phi), mod2pi(th1 - phi), D / rho)) {
      const lens = [w[1] * rho, w[2] * rho, w[3] * rho];
      if (lens[0] + lens[1] + lens[2] > ref.L * 2 + 5) continue;
      let x = s.x, y = s.y, th = th0, cur = 0, maxDev = 0;
      for (let k = 0; k < 3; k++) {
        const kap = w[0][k] === "L" ? 1 / rho : w[0][k] === "R" ? -1 / rho : 0;
        const n = Math.max(1, Math.ceil(lens[k] / 0.05)), hh = lens[k] / n;
        for (let i = 0; i < n; i++) {
          const tm = th + (kap * hh) / 2; x += Math.cos(tm) * hh; y += Math.sin(tm) * hh; th += kap * hh;
          const face = th - (sigma < 0 ? Math.PI : 0);
          const [dev, c2] = project(ref, x + A * Math.cos(face), y + A * Math.sin(face), cur, 10, 60);
          cur = c2; if (dev > maxDev) maxDev = dev;
        }
      }
      cands.push({ word: w[0], lens, lengthM: lens[0] + lens[1] + lens[2], maxDevM: maxDev });
    }
  }
  cands.sort((a, b) => a.maxDevM - b.maxDevM);
  return { rhoRearM: rho, n: cands.length, best: cands[0] ?? null, seeds: cands.slice(0, maxSeeds) };
}

/** Dubins word -> δ knots (forward: δ>0 turns the facing clockwise = "R"; reverse: δ>0 turns the motion anticlockwise = "L"). */
export function knotsFromWord(seed, h, lock, sigma, totalTravel) {
  const n = Math.ceil(totalTravel / h) + 1;
  const knots = new Float64Array(n);
  const signL = sigma < 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const u = i * h;
    let acc = 0, kind = "S";
    for (let k = 0; k < 3; k++) { if (u < acc + seed.lens[k]) { kind = seed.word[k]; break; } acc += seed.lens[k]; kind = "S"; }
    knots[i] = kind === "L" ? signL * lock : kind === "R" ? -signL * lock : 0;
  }
  return knots;
}

/* ═════════════ (1) knot-lattice beam ═════════════ */

export function beamPlan(ctx, { corridor, knotM = 0.3, K = 8000, bins = { cur: 0.1, lat: 0.03, yaw: 1.0, d: 0.05 }, maxTravel = null } = {}) {
  const { ref, T, sigma, start, end, box, vAtArc, kappaScale = 1 } = ctx;
  const dsSim = ctx.dsSim ?? 0.05;
  const back = Math.max(2, Math.round(0.4 / ref.ds));
  const ahead = Math.max(4, Math.round(0.8 / ref.ds));
  const curBinPts = Math.max(1, Math.round(bins.cur / ref.ds));
  const endRear = { x: end.x - A * Math.sin(end.psi * RAD), y: end.y - A * Math.cos(end.psi * RAD) };
  const endTheta = motionTheta(end.psi, sigma);
  const rhoH = rearRadiusFor(ctx, vAtArc(ref.L)) / (yawGainAtKmh(vAtArc(ref.L)) * kappaScale);
  const travelCap = maxTravel ?? ref.L * 1.3 + 1.0;
  const nSub = Math.max(1, Math.round(knotM / dsSim));
  const lock0 = lockFor(ctx, vAtArc(0));
  const levels = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const root = (f) => ({ rx: start.x - A * Math.sin(start.psi * RAD), ry: start.y - A * Math.cos(start.psi * RAD), psi: start.psi, d: f * lock0, cx: start.x, cy: start.y, cur: ctx.cur0 ?? 0, maxDev: 0, excess: 0, par: null, dT: null });
  let frontier = levels.map(root);
  let best = null, closest = null, emptiedAt = null, knots = 0;
  for (let knot = 1; knot * knotM <= travelCap; knot++) {
    knots = knot;
    const next = new Map();
    for (const st0 of frontier) {
      const lock = lockFor(ctx, vAtArc(st0.cur * ref.ds));
      for (const f of levels) {
        const dT = f * lock;
        let st = st0, cur = st0.cur, maxDev = st0.maxDev, alive = true;
        for (let i = 0; i < nSub; i++) {
          const c = stepCar(st, dT, sigma, dsSim, vAtArc(cur * ref.ds), kappaScale, lockFor(ctx, vAtArc(cur * ref.ds)));
          const [dev, c2] = project(ref, c.cx, c.cy, cur, back, ahead);
          if (dev > corridor) { alive = false; break; }
          cur = c2; if (dev > maxDev) maxDev = dev;
          st = { rx: c.rx, ry: c.ry, psi: c.psi, d: c.d, cx: c.cx, cy: c.cy };
          const posErr = Math.hypot(c.cx - end.x, c.cy - end.y), yawErr = Math.abs(wrapDeg(c.psi - end.psi));
          const norm = Math.max(posErr / box.posM, yawErr / box.yawDeg);
          if (!closest || norm < closest.norm) closest = { norm, posErr, yawErr, maxDev };
          if (norm <= 1 && (!best || maxDev < best.maxDev)) best = { maxDev, posErr, yawErr, par: st0, dT, sub: i + 1 };
        }
        if (!alive) continue;
        const remaining = ref.L - cur * ref.ds;
        const t = T[cur] * RAD;
        const lat = (st.cx - ref.X[cur]) * Math.cos(t) - (st.cy - ref.Y[cur]) * Math.sin(t);
        const yawRel = wrapDeg(st.psi - T[cur] - (sigma < 0 ? 180 : 0));
        const excess = Math.max(0, dubinsShortest(st.rx, st.ry, motionTheta(st.psi, sigma), endRear.x, endRear.y, endTheta, rhoH) - (remaining + 0.5));
        const key = ((Math.round(cur / curBinPts) * 4000 + (Math.round(lat / bins.lat) + 2000)) * 2000 + (Math.round(yawRel / bins.yaw) + 1000)) * 100 + (Math.round(st.d / bins.d) + 50);
        const prev = next.get(key);
        if (!prev || maxDev + excess < prev.maxDev + prev.excess) next.set(key, { ...st, cur, maxDev, excess, par: st0, dT });
      }
    }
    if (!next.size) { emptiedAt = knot * knotM; break; }
    let all = [...next.values()];
    if (all.length > K) all = stratify(all, K, ref, T, sigma);
    frontier = all;
  }
  let witness = null;
  if (best) {
    const chain = [];
    for (let n = best.par; n && n.par; n = n.par) chain.push(n);
    chain.reverse();
    let r = best.par; while (r.par) r = r.par;
    const targets = [];
    for (const n of chain) for (let i = 0; i < nSub; i++) targets.push(n.dT);
    for (let i = 0; i < best.sub; i++) targets.push(best.dT);
    witness = { d0: r.d, targets };
  }
  return { corridor, best: best && { maxDev: best.maxDev, posErr: best.posErr, yawErr: best.yawErr }, closest, emptiedAt, knots, witness };
}

/** Diversity-preserving truncation: coarse cells over (arc, lateral, yaw-relative); round-robin the best of each cell. */
function stratify(all, K, ref, T, sigma) {
  const cells = new Map();
  for (const n of all) {
    const t = T[n.cur] * RAD;
    const lat = (n.cx - ref.X[n.cur]) * Math.cos(t) - (n.cy - ref.Y[n.cur]) * Math.sin(t);
    const yawRel = wrapDeg(n.psi - T[n.cur] - (sigma < 0 ? 180 : 0));
    const key = (Math.round((n.cur * ref.ds) / 0.5) * 1000 + Math.round(lat / 0.15) + 500) * 1000 + Math.round(yawRel / 5) + 500;
    let arr = cells.get(key); if (!arr) { arr = []; cells.set(key, arr); } arr.push(n);
  }
  const lists = [...cells.values()].map((a) => a.sort((p, q2) => p.maxDev + p.excess - (q2.maxDev + q2.excess)));
  const out = [];
  for (let r = 0; out.length < K; r++) { let any = false; for (const a of lists) { if (r < a.length) { out.push(a[r]); any = true; if (out.length >= K) break; } } if (!any) break; }
  return out;
}

export function knotsFromTargets(w, dsSim, h, totalTravel) {
  const n = Math.ceil(totalTravel / h) + 1;
  const knots = new Float64Array(n);
  for (let i = 0; i < n; i++) { const idx = Math.round((i * h) / dsSim); knots[i] = idx <= 0 ? w.d0 : w.targets[Math.min(w.targets.length - 1, idx - 1)]; }
  return knots;
}

/* ═════════════ orchestration ═════════════ */

export const CORRIDORS = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0];

/**
 * beams: the corridor ladder, stopping at the first corridor whose beam finds an in-box stop.
 * best:  the lowest worst-centre-deviation in-box stop from any method (beam replay, polished
 *        seeds), re-integrated by simulateTargets. FEASIBLE-TRACK iff best.maxDevM <= 0.5.
 */
export function planSegment(ctx, { long = false, quick = false, polishBudget = 5000, K = 8000, knotM = 0.3, h = 0.25 } = {}) {
  const t0 = Date.now();
  const L = ctx.ref.L, total = L * 1.3 + 1.0;
  const dsSim = ctx.dsSim ?? 0.05;
  const lock = maxSteerAtKmh(ctx.vAtArc(0));
  const beams = [];
  let minCorridor = null, firstWitness = null;
  const ladder = quick ? [0.5, 1.0, 1.5, 3.0] : [0.5, 1.0, 3.0];
  for (const c of ladder) {
    const b = beamPlan(ctx, { corridor: c, K: long ? 1500 : K, knotM: long ? 1.0 : knotM, maxTravel: total });
    beams.push({ corridor: c, found: !!b.best, maxDevM: b.best ? +b.best.maxDev.toFixed(3) : null, closest: b.closest && { normPoseErr: +b.closest.norm.toFixed(2), posErrM: +b.closest.posErr.toFixed(2), yawErrDeg: +b.closest.yawErr.toFixed(1), maxDevM: +b.closest.maxDev.toFixed(2) }, emptiedAtM: b.emptiedAt });
    if (b.best) { minCorridor = c; firstWitness = b.witness; break; }
  }
  const candidates = [];
  if (firstWitness) {
    const w = firstWitness;
    const r = simulateTargets(ctx, w.d0, (i) => w.targets[Math.min(w.targets.length - 1, i - 1)], w.targets.length, { keepPath: true });
    if (r.best) candidates.push({ source: `beam@${minCorridor}`, ...r.best, knots: knotsFromTargets(w, dsSim, h, total) });
  }
  const dub = long || quick ? null : dubinsPlan(ctx);
  const polished = [];
  if (!long) {
    const seeds = [];
    if (firstWitness) seeds.push([`beam@${minCorridor}`, knotsFromTargets(firstWitness, dsSim, h, total)]);
    if (dub) for (const [i, sd] of dub.seeds.slice(0, 3).entries()) seeds.push([`dubins#${i}:${sd.word}`, knotsFromWord(sd, h, lock, ctx.sigma, total)]);
    if (!quick) seeds.push(["zero", new Float64Array(Math.ceil(total / h) + 1)]);
    for (const [name, k] of seeds) {
      const p = polishProfile(ctx, k, h, { budget: quick ? 1500 : polishBudget });
      const r = simulateProfile(ctx, p.knots, h, { keepPath: true });
      polished.push({ seed: name, f: +p.f.toFixed(3), evals: p.evals });
      if (r.best) candidates.push({ source: `polish(${name})`, ...r.best, knots: p.knots });
    }
  }
  candidates.sort((a, b) => a.maxDev - b.maxDev);
  const best = candidates[0] ?? null;
  let tight = null;
  if (best && !long) {
    const C = Math.max(0.5, best.maxDev + 0.02);
    const ctxP = { ...ctx, poseCorridor: C };
    const JP = (r) => (r.bestPose ? r.bestPose.norm : 10 + r.closest.norm);
    const p = polishProfile(ctxP, best.knots, h, { budget: quick ? 1000 : 3000, objective: JP, stepSizes: [0.15, 0.08, 0.04, 0.02, 0.01] });
    const r = simulateProfile(ctxP, p.knots, h);
    const r0 = simulateProfile(ctxP, best.knots, h);
    const pick = r.bestPose && (!r0.bestPose || r.bestPose.norm <= r0.bestPose.norm) ? r : r0;
    if (pick.bestPose) tight = { corridorM: +C.toFixed(3), posErrM: +pick.bestPose.posErr.toFixed(3), yawErrDeg: +pick.bestPose.yawErr.toFixed(2), normPoseErr: +pick.bestPose.norm.toFixed(3), maxDevM: +pick.bestPose.maxDev.toFixed(3), stop: pick.bestPose.pose.map((v) => +v.toFixed(3)),
      extra: Object.fromEntries(Object.entries(pick.extra).map(([k, v]) => [k, v && { maxDevM: +v.maxDev.toFixed(3), posErrM: +v.posErr.toFixed(3), yawErrDeg: +v.yawErr.toFixed(2) }])) };
  }
  const thin = (path) => path && path.filter((_, i) => i % 4 === 0 || i === path.length - 1).map((p) => p.map((v) => Math.round(v * 1000) / 1000));
  return {
    ms: Date.now() - t0,
    beams, minCorridor,
    dubins: dub && { rhoRearM: +dub.rhoRearM.toFixed(3), candidates: dub.n, bestWord: dub.best?.word ?? null, bestLengthM: dub.best ? +dub.best.lengthM.toFixed(2) : null, bestMaxDevM: dub.best ? +dub.best.maxDevM.toFixed(3) : null },
    polished, tight,
    best: best && { source: best.source, maxDevM: +best.maxDev.toFixed(3), endPosErrM: +best.posErr.toFixed(3), endYawErrDeg: +best.yawErr.toFixed(2), travelM: +best.travel.toFixed(2), saturatedM: +best.saturatedM.toFixed(2), path: thin(best.path) },
  };
}

/* ═════════════ appended for the committed pathrefs (DESIGN-v2 §2.2) ═════════════ */

/**
 * The same orchestration as `planSegment`, returning the CHOSEN δ PROFILES rather
 * than a thinned summary, so the builder can re-integrate one witness at row
 * spacing and commit it.
 *
 *  · `best`  — the lowest worst-centre-deviation in-box stop (FEASIBLE-TRACK iff ≤ 0.5 m);
 *  · `tight` — the tightest end pose found inside a LADDER of corridors, narrow
 *              first. Slice 0's second pass polished the end pose inside
 *              max(0.5, best + 0.02), which buys the end pose with deviation it
 *              did not need (sc-park-left R1 +0.5: 0.18 m against a 0.07 m best).
 *              A pc-path leg is graded on BOTH, so the corridors best + 0.06,
 *              best + 0.15 and max(0.5, best + 0.02) are tried in turn and the
 *              first whose end is within 0.1 m / 2° (norm ≤ 0.2) is kept;
 *              otherwise the smallest norm found.
 *  · `clear` — 2026-09-16, and the one the builder commits when it exists: the
 *              profile that MAXIMISES the minimum body clearance inside the class
 *              corridor the two above already reached. Present only when the
 *              caller supplied `ctx.clearanceAt`; `null`/absent otherwise, and
 *              with it absent nothing in this file behaves differently. It
 *              carries `start` (which of CLEAR_STARTS won), `starts` (what the
 *              whole field scored), `rung` (which end-pose rung it stopped on)
 *              and `clear` (metres), because «the plan cleared 0.27 m» is only
 *              worth anything beside «and here is what the alternatives did».
 *
 * Each profile is `{ source, d0, dAt(i), nSteps, knots, stepIdx, maxDev, posErr, yawErr }`
 * where `stepIdx` is the in-box stop on the planner's own integration.
 */
export function planWitness(ctx, { long = false, quick = false, polishBudget = 5000, K = 8000, knotM = 0.3, h = 0.25, clearBudget = 3000, clearBudgetQuick = 1200, clearStarts = null } = {}) {
  const t0 = Date.now();
  const L = ctx.ref.L, total = L * 1.3 + 1.0;
  const dsSim = ctx.dsSim ?? 0.05;
  const lock = lockFor(ctx, ctx.vAtArc(0));
  const ladder = quick ? [0.5, 1.0, 1.5, 3.0] : [0.5, 1.0, 3.0];
  let firstWitness = null, minCorridor = null;
  for (const c of ladder) {
    const b = beamPlan(ctx, { corridor: c, K: long ? 1500 : K, knotM: long ? 1.0 : knotM, maxTravel: total });
    if (b.best) { minCorridor = c; firstWitness = b.witness; break; }
  }
  const profile = (source, knots) => {
    const nSteps = Math.floor(((knots.length - 1) * h) / dsSim);
    const dAt = (i) => { const u = ((i - 0.5) * dsSim) / h; const k0 = Math.min(knots.length - 2, Math.floor(u)), f = u - k0; return knots[k0] * (1 - f) + knots[k0 + 1] * f; };
    return { source, d0: knots[0], dAt, nSteps, knots };
  };
  const candidates = [];
  if (firstWitness) {
    const w = firstWitness;
    const dAt = (i) => w.targets[Math.min(w.targets.length - 1, i - 1)];
    const r = simulateTargets(ctx, w.d0, dAt, w.targets.length);
    if (r.best) candidates.push({ source: `beam@${minCorridor}`, d0: w.d0, dAt, nSteps: w.targets.length, knots: knotsFromTargets(w, dsSim, h, total), ...r.best });
  }
  if (!long) {
    const seeds = [];
    if (firstWitness) seeds.push([`beam@${minCorridor}`, knotsFromTargets(firstWitness, dsSim, h, total)]);
    const dub = quick ? null : dubinsPlan(ctx);
    if (dub) for (const [i, sd] of dub.seeds.slice(0, 3).entries()) seeds.push([`dubins#${i}:${sd.word}`, knotsFromWord(sd, h, lock, ctx.sigma, total)]);
    if (!quick) seeds.push(["zero", new Float64Array(Math.ceil(total / h) + 1)]);
    for (const [name, k] of seeds) {
      const p = polishProfile(ctx, k, h, { budget: quick ? 1500 : polishBudget });
      const r = simulateProfile(ctx, p.knots, h);
      if (r.best) candidates.push({ ...profile(`polish(${name})`, p.knots), ...r.best });
    }
  }
  candidates.sort((a, b) => a.maxDev - b.maxDev);
  const best = candidates[0] ?? null;
  let tight = null;
  if (best && !long) {
    const JP = (r) => (r.bestPose ? r.bestPose.norm : 10 + r.closest.norm);
    const tried = [];
    for (const C of [best.maxDev + 0.06, best.maxDev + 0.15, Math.max(0.5, best.maxDev + 0.02)]) {
      const ctxP = { ...ctx, poseCorridor: C };
      const p = polishProfile(ctxP, best.knots, h, { budget: quick ? 800 : 2000, objective: JP, stepSizes: [0.15, 0.08, 0.04, 0.02, 0.01] });
      const r = simulateProfile(ctxP, p.knots, h);
      const r0 = simulateProfile(ctxP, best.knots, h);
      const pickNew = r.bestPose && (!r0.bestPose || r.bestPose.norm <= r0.bestPose.norm);
      const pick = pickNew ? r : r0;
      if (!pick.bestPose) continue;
      tried.push({ ...profile(`tight@${C.toFixed(2)}(${best.source})`, pickNew ? p.knots : best.knots), corridorM: C, maxDev: pick.bestPose.maxDev, posErr: pick.bestPose.posErr, yawErr: pick.bestPose.yawErr, stepIdx: pick.bestPose.stepIdx, norm: pick.bestPose.norm });
      if (pick.bestPose.norm <= 0.2) break;
    }
    tight = tried.find((t) => t.norm <= 0.2) ?? [...tried].sort((a, b) => a.norm - b.norm)[0] ?? null;
  }
  /* ── THE CLEARANCE PASS (2026-09-16) ──────────────────────────────────────
   * Runs only when the caller supplied a body screen. The corridor is the class
   * boundary of the class the DEVIATION plan already achieved, so the clearance
   * witness can never be a worse class than the one it replaces; the search
   * itself stays `CLEAR_DEV_MARGIN_M` inside that, leaving the re-integration
   * its rounding. Every start in CLEAR_STARTS is tried and scored by one
   * objective; the winner is reported with the whole field beside it.
   */
  let clear = null;
  let clearRefusal = null;
  if (ctx.clearanceAt && best && best.knots) {
    const devProf = tight ?? best;
    const corridorM = devProf.maxDev <= TRACK_CORRIDOR_M + 1e-9 ? TRACK_CORRIDOR_M : ENDPOSE_CORRIDOR_M;
    const ctxC = { ...ctx, clearCorridor: Math.max(devProf.maxDev, corridorM - CLEAR_DEV_MARGIN_M) };
    const JC = clearanceObjective();
    const nK = best.knots.length;
    const seedOf = {
      "dev-best": () => Float64Array.from(best.knots),
      "dev-tight": () => (tight && tight.knots ? Float64Array.from(tight.knots) : null),
      zero: () => new Float64Array(nK),
      "lock+": () => Float64Array.from({ length: nK }, () => lock),
      "lock-": () => Float64Array.from({ length: nK }, () => -lock),
    };
    // `clearStarts` exists so the order-independence claim can be TESTED: a caller
    // permutes the list and must get the same winner, the same clearance and the
    // same rows back (__tests__/path-body-screen.test.mjs).
    const rungs = ctxC.clearEndLadder ?? [...CLEAR_END_LADDER, CLEAR_END_LAST_RESORT];
    const names = clearStarts ?? (quick ? CLEAR_STARTS_QUICK : CLEAR_STARTS);
    for (const n of names) if (!CLEAR_STARTS.includes(n)) throw new Error(`planWitness: unknown clearance start "${n}" — the start set is ${CLEAR_STARTS.join(", ")}`);
    const tried = [];
    for (const name of names) {
      const k0 = seedOf[name]();
      if (!k0) continue;
      const p = polishProfile(ctxC, k0, h, { budget: quick ? clearBudgetQuick : clearBudget, objective: JC, stepSizes: CLEAR_STEPS });
      const r = simulateProfile(ctxC, p.knots, h);
      tried.push({ start: name, f: p.f, evals: p.evals, clearM: r.bestClear ? r.bestClear.clear : null, knots: p.knots, res: r });
    }
    // The tie-break is the CANONICAL start order, not the order the caller ran them
    // in. Two starts landing on exactly the same optimum is not rare — the synthetic
    // straight-reverse case in __tests__/path-body-screen.test.mjs has `zero` and
    // `dev-tight` agreeing to the last bit — and with a first-past-the-post rule the
    // committed witness was identical but the RECORDED WINNER changed with the order.
    // A name that moves while the artefact does not is exactly the kind of fact this
    // pass exists to stop reporting.
    const rank = (n) => CLEAR_STARTS.indexOf(n);
    let win = null;
    for (const t of tried) {
      if (!t.res.bestClear) continue;
      if (!win || t.f < win.f - 1e-9 || (Math.abs(t.f - win.f) <= 1e-9 && rank(t.start) < rank(win.start))) win = t;
    }
    if (win) {
      clear = {
        ...profile(`clear@${corridorM}(${win.start})`, win.knots),
        ...win.res.bestClear,
        start: win.start,
        corridorM,
        searchCorridorM: ctxC.clearCorridor,
        lastResort: win.res.bestClear.lastResort === true,
        starts: tried.map((t) => ({ start: t.start, f: +t.f.toFixed(6), evals: t.evals, clearM: t.clearM === null ? null : +t.clearM.toFixed(4) })),
      };
    } else {
      // A SILENT FALL-BACK TO THE DEVIATION PLAN IS THE DEFECT, NOT THE REMEDY. If
      // every start failed to reach a stop the objective would accept, the witness
      // that ships is the body-blind one, and the caller has to be told so it can
      // refuse rather than commit it believing clearance had been considered.
      clearRefusal = `the clearance pass found no stop from any of ${tried.length} start(s) inside corridor ${ctxC.clearCorridor.toFixed(3)} m and end rungs ${rungs.join("/")}${ctx.endGate ? " under the park gate" : ""} — the witness that follows was chosen on DEVIATION ALONE`;
    }
  }
  let closest = null;
  if (!best) {
    const r = simulateTargets(ctx, 0, () => 0, Math.floor(total / dsSim));
    closest = r.closest;
  }
  return { ms: Date.now() - t0, minCorridor, best, tight, clear, clearRefusal, closest };
}
