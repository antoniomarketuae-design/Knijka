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
import { CAR, DEG, RAD, R_REAR_MIN, maxSteerAtKmh, yawGainAtKmh, wrapDeg } from "./geom.mjs";

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

/** One integration step of the bicycle. δ moves toward dTarget, rate-limited, lock-clamped. */
function stepCar(st, dTarget, sigma, h, vk, kappaScale) {
  const lock = maxSteerAtKmh(vk);
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
  const extra = Object.fromEntries(extraTargets.map((t) => [t.name, null]));
  const path = keepPath ? [[st.cx, st.cy, st.psi, st.d, 0]] : null;
  const back = Math.max(2, Math.round(0.4 / ref.ds)), ahead = Math.max(4, Math.round(0.8 / ref.ds));
  for (let i = 1; i <= nSteps; i++) {
    const vk = vAtArc(cur * ref.ds);
    st = stepCar(st, dAt(i), sigma, dsSim, vk, kappaScale);
    travelledM += dsSim;
    if (Math.abs(st.d) >= maxSteerAtKmh(vk) - 1e-6) saturatedM += dsSim;
    const [dev, c2] = project(ref, st.cx, st.cy, cur, back, ahead);
    cur = c2;
    if (dev > prefMax) prefMax = dev;
    if (keepPath) path.push([st.cx, st.cy, st.psi, st.d, dev]);
    const posErr = Math.hypot(st.cx - end.x, st.cy - end.y);
    const yawErr = Math.abs(wrapDeg(st.psi - end.psi));
    const norm = Math.max(posErr / box.posM, yawErr / box.yawDeg);
    if (!closest || norm < closest.norm) closest = { norm, posErr, yawErr, maxDev: prefMax, travel: travelledM };
    if (prefMax <= poseCorridor && (!bestPose || norm < bestPose.norm)) bestPose = { norm, posErr, yawErr, maxDev: prefMax, travel: travelledM, stepIdx: i, pose: [st.cx, st.cy, st.psi] };
    if (norm <= 1 && (!best || prefMax < best.maxDev - 1e-9 || (Math.abs(prefMax - best.maxDev) < 1e-9 && posErr < best.posErr))) best = { maxDev: prefMax, posErr, yawErr, travel: travelledM, stepIdx: i, saturatedM };
    for (const tg of extraTargets) if (tg.test(st.cx, st.cy, st.psi)) { const b = extra[tg.name]; if (!b || prefMax < b.maxDev) extra[tg.name] = { maxDev: prefMax, posErr, yawErr, travel: travelledM, stepIdx: i }; }
  }
  if (best && path) best.path = path.slice(0, best.stepIdx + 1);
  return { best, closest, bestPose, extra, path };
}

export function simulateProfile(ctx, knots, h, opts) {
  const ds = ctx.dsSim ?? 0.05;
  const nSteps = Math.floor(((knots.length - 1) * h) / ds);
  const dAt = (i) => { const u = ((i - 0.5) * ds) / h; const k0 = Math.min(knots.length - 2, Math.floor(u)), f = u - k0; return knots[k0] * (1 - f) + knots[k0 + 1] * f; };
  return simulateTargets(ctx, knots[0], dAt, nSteps, opts);
}

const J = (r) => (r.best ? r.best.maxDev : 10 + r.closest.norm);

export function polishProfile(ctx, knots0, h, { stepSizes = [0.3, 0.15, 0.08, 0.04, 0.02, 0.01], budget = 5000, objective = J } = {}) {
  const Jx = objective;
  let x = Float64Array.from(knots0);
  let fx = Jx(simulateProfile(ctx, x, h));
  let evals = 1;
  const lock = maxSteerAtKmh(ctx.vAtArc(0));
  for (const s of stepSizes) {
    let improved = true;
    while (improved && evals < budget) {
      improved = false;
      for (let i = 0; i < x.length && evals < budget; i++) {
        for (const sg of [1, -1]) {
          const y = Float64Array.from(x);
          y[i] = Math.max(-lock, Math.min(lock, y[i] + sg * s));
          if (y[i] === x[i]) continue;
          const fy = Jx(simulateProfile(ctx, y, h)); evals++;
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
  const rho = R_REAR_MIN / (yawGainAtKmh(gainKmh) * kappaScale);
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
  const rhoH = R_REAR_MIN / (yawGainAtKmh(vAtArc(ref.L)) * kappaScale);
  const travelCap = maxTravel ?? ref.L * 1.3 + 1.0;
  const nSub = Math.max(1, Math.round(knotM / dsSim));
  const lock0 = maxSteerAtKmh(vAtArc(0));
  const levels = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const root = (f) => ({ rx: start.x - A * Math.sin(start.psi * RAD), ry: start.y - A * Math.cos(start.psi * RAD), psi: start.psi, d: f * lock0, cx: start.x, cy: start.y, cur: ctx.cur0 ?? 0, maxDev: 0, excess: 0, par: null, dT: null });
  let frontier = levels.map(root);
  let best = null, closest = null, emptiedAt = null, knots = 0;
  for (let knot = 1; knot * knotM <= travelCap; knot++) {
    knots = knot;
    const next = new Map();
    for (const st0 of frontier) {
      const lock = maxSteerAtKmh(vAtArc(st0.cur * ref.ds));
      for (const f of levels) {
        const dT = f * lock;
        let st = st0, cur = st0.cur, maxDev = st0.maxDev, alive = true;
        for (let i = 0; i < nSub; i++) {
          const c = stepCar(st, dT, sigma, dsSim, vAtArc(cur * ref.ds), kappaScale);
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
 *
 * Each profile is `{ source, d0, dAt(i), nSteps, knots, stepIdx, maxDev, posErr, yawErr }`
 * where `stepIdx` is the in-box stop on the planner's own integration.
 */
export function planWitness(ctx, { long = false, quick = false, polishBudget = 5000, K = 8000, knotM = 0.3, h = 0.25 } = {}) {
  const t0 = Date.now();
  const L = ctx.ref.L, total = L * 1.3 + 1.0;
  const dsSim = ctx.dsSim ?? 0.05;
  const lock = maxSteerAtKmh(ctx.vAtArc(0));
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
  let closest = null;
  if (!best) {
    const r = simulateTargets(ctx, 0, () => 0, Math.floor(total / dsSim));
    closest = r.closest;
  }
  return { ms: Date.now() - t0, minCorridor, best, tight, closest };
}
