#!/usr/bin/env node
// -----------------------------------------------------------------------------
// build-pathrefs.mjs — PLAN THE WITNESSES A pc-path LEG FOLLOWS, ONCE, OFFLINE.
//
//   node tools/mobile/lib/path-plan/build-pathrefs.mjs [lesson …]   (default: all eleven)
//
// DESIGN-v2 §2.2. Why offline: the witnesses must be drivable by this car, must
// pre-position during a straight lead and must stop in the box, and only the
// Slice 0 planners produce that — at 2–47 s of CPU per plan (slice0/run.log).
// That would starve the browser on the drive box, so every witness is planned
// here, committed to `tools/mobile/path-refs/<lesson>.pathref.json`, and pinned
// to the trace it was planned from by `trace.samplesDigest`.
//
// EXIT 1, loudly, when:
//   · a witness's class differs from what Slice 0 measured at that start (policy.mjs);
//   · a band corner leaves its class corridor after the tightened re-screen;
//   · a stop-acceptance band is narrower than 1.0 m.
// The build is re-run only when a staleness pin goes red (budget 45–60 min, S-13).
//
// ONE INTEGRATION PER WITNESS. The planner's chosen δ profile is re-integrated
// here at `rowEveryM` with the δ ROUNDED AS STORED, so the centre, the rear axle
// and ψ in every committed row are mutually consistent by construction and an
// independent integrator (`__tests__/path-plan.test.mjs`) reproduces them.
// -----------------------------------------------------------------------------
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOX, CAR, DEG, ENDPOSE_CORRIDOR_M, RAD, TRACK_CORRIDOR_M,
  authoredStops, extendStart, gearSegments, hx, hy, maxSteerAtKmh, projectWindow, resamplePoints,
  samplesDigest, segmentPoints, tangents, traceSamples, wrapDeg, yawGainAtKmh,
} from "./geom.mjs";
import { planWitness, project, simulateTargets } from "./planner.mjs";
import {
  ACCEPT_MIN_WIDTH_M, ARM_ROLL_ALLOW_M, ARM_ROLL_EXP_M, CAVEATS, DWELL_CLAMP_S, ENDPOSE, FORWARD_EXPECT,
  INFEASIBLE, INSERTED_DWELL_S, PATH_LESSONS, PRODUCT, REVERSE_POLICY, STAGED_ACTORS, TIGHT_LAT_M, TIGHT_YAW_DEG, TRACK,
  acceptAlongOf, stopTargetOf,
} from "./policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
export const PATHREF_DIR = resolve(REPO_ROOT, "tools", "mobile", "path-refs");

export const GENERATOR = Object.freeze({
  script: "tools/mobile/lib/path-plan/build-pathrefs.mjs",
  planner: "slice0 beam+dubins+polish (tools/mobile/lib/path-plan/planner.mjs)",
  kappaScale: 0.95,
  dsSimM: 0.05,
  rowEveryM: 0.1,
});
export const ROW_COLUMNS = Object.freeze(["s", "cx", "cz", "rx", "rz", "psi", "delta", "devM", "vKmh"]);

const r = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);
const classOf = (devM, inBox) => (!inBox || devM === null ? INFEASIBLE : devM <= TRACK_CORRIDOR_M ? TRACK : devM <= ENDPOSE_CORRIDOR_M ? ENDPOSE : INFEASIBLE);

/**
 * THE §6.2 SPEED PROFILE (N3). Median |speedKmh| of the samples with
 * |speedKmh| > 1 in each 1 m bin of the gear run's authored arc; an empty bin
 * takes the nearest non-empty bin of the SAME run (the lower value on ties).
 * Exported for `path-follow.mjs` (T7.1). `path-evidence.mjs` recomputes it with
 * its own code, and `path-plan.test.mjs` with a third — cross-checks, not imports.
 */
export function movingMedianProfile(samples, i0, i1) {
  const bins = [];
  let arc = 0;
  for (let i = i0; i <= i1; i++) {
    if (i > i0) arc += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    const b = Math.floor(arc);
    (bins[b] ||= []).push(Math.abs(samples[i].speedKmh ?? samples[i].v));
  }
  const n = bins.length;
  const med = [];
  for (let b = 0; b < n; b++) {
    const m = (bins[b] || []).filter((x) => x > 1).sort((a, c) => a - c);
    med[b] = m.length ? m[Math.floor((m.length - 1) / 2)] : null;
  }
  return med.map((v, b) => {
    if (v !== null) return r(v, 2);
    for (let d = 1; d < n; d++) {
      const lo = b - d >= 0 ? med[b - d] : null;
      const hi = b + d < n ? med[b + d] : null;
      if (lo !== null || hi !== null) return r(Math.min(lo ?? Infinity, hi ?? Infinity), 2);
    }
    return null;
  });
}

/**
 * THE ONE INTEGRATION (rear axle is a unicycle, chassis centre `a` ahead along
 * the facing), at `h` metres of rear travel per row. `deltas[k]` bends the step
 * that ENDS at row k; `deltas[0]` is the wheel at rest. The probe frame is
 * written out (z = −y). Returns full-precision rows; callers round for storage.
 */
export function integrateRows({ start, sigma, deltas, vKmh, h, kappaScale }) {
  let rx = start.x - CAR.a * Math.sin(start.psi * RAD);
  let ry = start.y - CAR.a * Math.cos(start.psi * RAD);
  let psi = start.psi;
  const rows = [[0, start.x, -start.y, rx, -ry, psi, deltas[0], 0, vKmh[0]]];
  for (let k = 1; k < deltas.length; k++) {
    const kap = (yawGainAtKmh(vKmh[k]) * kappaScale * Math.tan(deltas[k])) / CAR.L;
    const dpsi = sigma * kap * h * DEG;
    const pm = (psi + dpsi / 2) * RAD;
    rx += sigma * Math.sin(pm) * h;
    ry += sigma * Math.cos(pm) * h;
    psi += dpsi;
    const cx = rx + CAR.a * Math.sin(psi * RAD);
    const cy = ry + CAR.a * Math.cos(psi * RAD);
    rows.push([k * h, cx, -cy, rx, -ry, psi, deltas[k], 0, vKmh[k]]);
  }
  return rows;
}

/**
 * Re-integrate a planner profile into committed rows, rounded δ first. The δ
 * per row is the MEAN of the planner's own δ STATE over the row's steps, read
 * off its one integrator (`simulateTargets` with keepPath) — never a replay
 * with a second rate limiter, which drifted metres on poligon F2 (285 m).
 */
function profileRows(ctx, prof, nSteps) {
  const ds = ctx.dsSim;
  const every = Math.max(1, Math.round(GENERATOR.rowEveryM / ds));
  const sim = simulateTargets(ctx, prof.d0, prof.dAt, nSteps, { keepPath: true });
  const path = sim.path;
  // The planner's own speed per step: vAtArc(cur·ds) with cur from ITS windowed
  // projection, replayed with the same window. The yaw gain falls from 1.03 to
  // 0.75 between 12 and 22 km/h, so a speed read at the wrong arc bends a long
  // approach by metres (poligon F2, 285 m, measured at 6.8 m before this).
  const back = Math.max(2, Math.round(0.4 / ctx.ref.ds));
  const ahead = Math.max(4, Math.round(0.8 / ctx.ref.ds));
  let cur = ctx.cur0 ?? 0;
  const vStep = [ctx.vAtArc(cur * ctx.ref.ds)];
  for (let i = 1; i < path.length; i++) {
    vStep.push(ctx.vAtArc(cur * ctx.ref.ds));
    cur = project(ctx.ref, path[i][0], path[i][1], cur, back, ahead)[1];
  }
  const nRows = Math.floor((path.length - 1) / every);
  const deltas = [r(prof.d0, 4)];
  const vs = [r(vStep[0], 1)];
  const ks = ctx.kappaScale ?? 1;
  for (let k = 1; k <= nRows; k++) {
    let acc = 0;
    for (let j = (k - 1) * every + 1; j <= k * every; j++) acc += yawGainAtKmh(vStep[j]) * Math.tan(path[j][3]);
    const v = r(vStep[(k - 1) * every + 1], 1);
    const lock = maxSteerAtKmh(v);
    const d = Math.atan(acc / every / yawGainAtKmh(v));
    deltas.push(r(Math.max(-lock, Math.min(lock, d)), 4));
    vs.push(v);
  }
  return integrateRows({ start: ctx.start, sigma: ctx.sigma, deltas, vKmh: vs, h: GENERATOR.rowEveryM, kappaScale: ks });
}

/** Windowed deviation per row against the (extended) authored ref, trace frame. */
function measureRows(rows, ref, cur0 = 0) {
  const back = Math.max(2, Math.round(0.4 / ref.ds));
  const ahead = Math.max(4, Math.round(0.8 / ref.ds)) + Math.round(GENERATOR.rowEveryM / ref.ds);
  let cur = cur0;
  let worst = 0;
  for (const row of rows) {
    const [dev, c2] = projectWindow(ref, row[1], -row[2], cur, back, ahead);
    cur = c2;
    row[7] = dev;
    if (dev > worst) worst = dev;
  }
  return worst;
}

/** Pick the stop row: smallest end-pose norm whose prefix worst deviation stays inside `corridor`. */
function pickStop(rows, end, box, corridor) {
  let prefix = 0;
  let best = null;
  for (let k = 0; k < rows.length; k++) {
    prefix = Math.max(prefix, rows[k][7]);
    if (prefix > corridor + 1e-9) break;
    const posErr = Math.hypot(rows[k][1] - end.x, -rows[k][2] - end.y);
    const yawErr = Math.abs(wrapDeg(rows[k][5] - end.psi));
    const norm = Math.max(posErr / box.posM, yawErr / box.yawDeg);
    if (!best || norm < best.norm - 1e-9) best = { k, norm, posErr, yawErr, prefix };
  }
  return best;
}

/**
 * THE TERMINAL SQUARE-UP. The long-segment beam has no end-pose polish (Slice 0
 * skips the tight pass above 60 m), so a long approach reached its gear change
 * up to 2.1° off (van, judge, 45-rev) and gap-long its bay 9.3° off — outside a
 * tightened ±1.5° arm band before a single key was pressed (measured on the T9
 * bench: gear-change-missed with the car on its witness to 0.1°). So the last
 * `splitBackM` of every approach that ends in a graded pose is re-generated
 * from the witness's own state there by an offline rear-axle pure pursuit onto
 * the authored line, blended into the straight line through `aim` (the gear-
 * change pose shifted to the centre of a one-sided band, or the authored end),
 * rate-limited at CAR.steerRate and clamped at lock(v), and continued to
 * `extendM` past it. The δ it chooses are appended to the prefix and the whole
 * witness is integrated ONCE, so the rows stay mutually consistent.
 * Trace frame (x, y), ψ clockwise from +y.
 */
function squareUpDeltas(rows, aim, refPts, { splitBackM = 8, blendM = 2.5, extendM = 1.0, ldM = 2.5, kappaScale = GENERATOR.kappaScale } = {}) {
  const h = GENERATOR.rowEveryM;
  const ah = { x: Math.sin(aim.psi * RAD), y: Math.cos(aim.psi * RAD) };
  const along = (x, y) => (x - aim.x) * ah.x + (y - aim.y) * ah.y;
  let ks = 0;
  for (let k = rows.length - 1; k >= 0; k--) {
    if (along(rows[k][1], -rows[k][2]) < -splitBackM) { ks = k; break; }
  }
  // target path: the authored line up to the blend, then the aim line
  const target = [];
  for (let i = 0; i < refPts.n; i++) if (along(refPts.X[i], refPts.Y[i]) < -blendM) target.push([refPts.X[i], refPts.Y[i]]);
  for (let a = -blendM; a <= extendM + ldM + 0.5; a += 0.05) target.push([aim.x + a * ah.x, aim.y + a * ah.y]);
  const deltas = rows.slice(0, ks + 1).map((row) => row[6]);
  const vs = rows.slice(0, ks + 1).map((row) => row[8]);
  let rx = rows[ks][3];
  let ry = -rows[ks][4];
  let psi = rows[ks][5];
  let d = rows[ks][6];
  let cur = 0;
  let bestD = Infinity;
  for (let i = 0; i < target.length; i++) {
    const dd = Math.hypot(target[i][0] - rx, target[i][1] - ry);
    if (dd < bestD) { bestD = dd; cur = i; }
  }
  const v = Math.min(vs[vs.length - 1] ?? 5, 5);
  for (let step = 0; step < 4000; step++) {
    const cx = rx + CAR.a * Math.sin(psi * RAD);
    const cy = ry + CAR.a * Math.cos(psi * RAD);
    if (along(cx, cy) >= extendM) break;
    while (cur + 1 < target.length && Math.hypot(target[cur][0] - rx, target[cur][1] - ry) < ldM) cur++;
    const [tx, ty] = target[cur];
    const bearing = Math.atan2(tx - rx, ty - ry) * DEG;
    const alpha = wrapDeg(bearing - psi) * RAD;
    const ld = Math.max(1e-6, Math.hypot(tx - rx, ty - ry));
    const kappa = (2 * Math.sin(alpha)) / ld;
    const lock = maxSteerAtKmh(v);
    const want = Math.max(-lock, Math.min(lock, Math.atan((CAR.L * kappa) / (yawGainAtKmh(v) * kappaScale))));
    const rate = (CAR.steerRate * h) / Math.max(v / 3.6, 1 / 3.6);
    d = r(d + Math.max(-rate, Math.min(rate, want - d)), 4);
    const kap = (yawGainAtKmh(v) * kappaScale * Math.tan(d)) / CAR.L;
    const dpsi = kap * h * DEG;
    const pm = (psi + dpsi / 2) * RAD;
    rx += Math.sin(pm) * h;
    ry += Math.cos(pm) * h;
    psi += dpsi;
    deltas.push(d);
    vs.push(v);
  }
  return { deltas, vs, splitRow: ks };
}

/** How far short of the aim a before-reverse tail is planned to end (then settled by pursuit), longest first. */
const PRE_AIM_LADDER_M = Object.freeze([5, 3, 1.5]);

/** The tail's end box (§2.2): the tightened arm band's lat and yaw. */
const TAIL_BOX = Object.freeze({ posM: TIGHT_LAT_M, yawDeg: TIGHT_YAW_DEG });

/** End-pose error of the row nearest along 0 of `aim` (trace frame). */
function errAtAim(rows, aim) {
  const ah = { x: Math.sin(aim.psi * RAD), y: Math.cos(aim.psi * RAD) };
  let best = null;
  for (const row of rows) {
    const a = (row[1] - aim.x) * ah.x + (-row[2] - aim.y) * ah.y;
    if (!best || Math.abs(a) < Math.abs(best.a)) best = { a, row };
  }
  if (!best) return null;
  return { posM: Math.hypot(best.row[1] - aim.x, -best.row[2] - aim.y), yawDeg: Math.abs(wrapDeg(best.row[5] - aim.psi)) };
}

function storeRows(rows) {
  return rows.map((row) => [r(row[0], 2), r(row[1], 3), r(row[2], 3), r(row[3], 3), r(row[4], 3), r(row[5], 3), row[6], r(row[7], 3), row[8]]);
}

function vProfileFor(S, sg, ref, sigma) {
  const V = new Float64Array(ref.n);
  let j = sg.p0;
  for (let k = 0; k < ref.n; k++) {
    const u = k * ref.ds + S[sg.p0].s;
    while (j < sg.i1 && S[j + 1].s < u) j++;
    V[k] = sigma < 0 ? 3 : Math.max(5, Math.abs(S[j].v));
  }
  return (u) => V[Math.max(0, Math.min(ref.n - 1, Math.round(u / ref.ds)))];
}

const say = (s) => process.stdout.write(`${s}\n`);

/** The arm frame of the authored gear-change pose (trace frame). */
function armFrame(p0) {
  const h = p0.psi * RAD;
  return { hx: Math.sin(h), hy: Math.cos(h), rx: Math.cos(h), ry: -Math.sin(h) };
}
const offsetPose = (p0, along, lat, yaw) => {
  const f = armFrame(p0);
  return { x: p0.x + along * f.hx + lat * f.rx, y: p0.y + along * f.hy + lat * f.ry, psi: p0.psi + yaw };
};

/** Plan one reverse witness from an arm-frame offset. */
function planReverseFrom(S, sg, along, lat, yaw, { quick = false, box = BOX } = {}) {
  const p0 = S[sg.p0];
  const f = armFrame(p0);
  const base = resamplePoints(segmentPoints(S, sg), 0.05);
  const ref = extendStart(base, f.hx, f.hy, 3.0);
  const T = tangents(ref, 0.25);
  const start = offsetPose(p0, along, lat, yaw);
  let cur0 = 0;
  let bd = Infinity;
  for (let k = 0; k < ref.n; k++) {
    const d = Math.hypot(ref.X[k] - start.x, ref.Y[k] - start.y);
    if (d < bd) { bd = d; cur0 = k; }
  }
  const end = { x: S[sg.i1].x, y: S[sg.i1].y, psi: S[sg.i1].psi };
  const ctx = { ref, T, sigma: -1, start, end, box, vAtArc: () => 3, dsSim: GENERATOR.dsSimM, cur0, kappaScale: GENERATOR.kappaScale };
  const t0 = Date.now();
  const plan = planWitness(ctx, { quick });
  const prof = plan.tight ?? plan.best;
  if (!prof) return { ctx, plan, ms: Date.now() - t0, cls: INFEASIBLE, worstDevM: null, rows: null, stop: null };
  const rows = profileRows(ctx, prof, prof.nSteps);
  measureRows(rows, ref, cur0);
  const corridor = (plan.tight ? plan.tight.corridorM : plan.best.maxDev + 0.02) + 0.03;
  const stop = pickStop(rows, end, box, corridor);
  const kept = stop ? rows.slice(0, stop.k + 1) : rows;
  const worst = kept.reduce((m, row) => Math.max(m, row[7]), 0);
  const inBox = !!stop && stop.norm <= 1 + 1e-9;
  return { ctx, plan, ms: Date.now() - t0, cls: classOf(worst, inBox), worstDevM: worst, rows: kept, stop, start, prof };
}

function witnessRecord(res, startAlongM) {
  return {
    startAlongM,
    startPose: { x: r(res.ctx.start.x, 3), z: r(-res.ctx.start.y, 3), psi: r(res.ctx.start.psi, 3) },
    class: res.cls,
    worstDevM: r(res.worstDevM, 3),
    plannerBestDevM: r(res.plan?.best?.maxDev ?? null, 3),
    endErr: res.stop ? { posM: r(res.stop.posErr, 3), yawDeg: r(res.stop.yawErr, 2) } : null,
    source: res.prof?.source ?? null,
    planMs: res.ms,
    lengthM: res.rows ? r(res.rows[res.rows.length - 1][0], 2) : null,
    rows: res.rows ? storeRows(res.rows) : null,
  };
}

function expectMatch(exp, cls, dev) {
  if (exp === null || exp === undefined) return cls !== INFEASIBLE ? null : "INFEASIBLE where Slice 0 did not screen — refused";
  const [wantCls] = exp;
  return cls === wantCls ? null : `class ${cls} (dev ${r(dev, 3)}) differs from Slice 0's ${wantCls} ${exp[1]}`;
}

/**
 * Screen the band corners (§2.2 step 3): along min/max × lat × yaw. A failing
 * corner tightens lat to 0.15 m and yaw to 1.5° for a re-screen. On a segment
 * Slice 0 never screened (the `*` rows of §2.4) "the committed band is whatever
 * survives": a corner that still fails at an along edge moves that edge inward
 * in 0.25 m steps while the stop-acceptance band stays ≥ 1.0 m wide.
 */
function screenCorners(S, sg, p, witnesses) {
  const sortedW = [...witnesses].sort((a, b) => a.startAlongM - b.startAlongM);
  const gridClass = (along) => {
    let pick = null;
    for (const w of sortedW) if (w.startAlongM <= along + 1e-9) pick = w;
    return (pick ?? sortedW[0]).class;
  };
  const cache = new Map();
  const corner = (along, lat, yaw) => {
    const key = `${along}|${lat}|${yaw}`;
    if (cache.has(key)) return cache.get(key);
    const want = gridClass(along);
    const corridor = want === TRACK ? TRACK_CORRIDOR_M : ENDPOSE_CORRIDOR_M;
    let res = planReverseFrom(S, sg, along, lat, yaw, { quick: true, box: p.relaxedBox ?? BOX });
    let mode = "quick";
    if (!(res.worstDevM !== null && res.worstDevM <= corridor && res.cls !== INFEASIBLE)) {
      res = planReverseFrom(S, sg, along, lat, yaw, { quick: false, box: p.relaxedBox ?? BOX });
      mode = "full";
    }
    const ok = res.worstDevM !== null && res.worstDevM <= corridor && res.cls !== INFEASIBLE;
    const out = { along, lat, yaw, class: res.cls, worstDevM: r(res.worstDevM, 3), corridorM: corridor, mode, ok };
    say(`    corner along ${along} lat ${lat} yaw ${yaw}: ${res.cls} ${r(res.worstDevM, 3)} (${mode}, ${res.ms} ms)${ok ? "" : "  <-- OUTSIDE"}`);
    cache.set(key, out);
    return out;
  };
  const run = (b) => {
    const out = [];
    for (const along of b.alongM) for (const lat of [...new Set(b.latM)]) for (const yaw of [...new Set(b.yawDeg)]) out.push(corner(along, lat, yaw));
    return out;
  };
  let band = { alongM: [...p.band.alongM], latM: [...p.band.latM], yawDeg: [...p.band.yawDeg] };
  let corners = run(band);
  let tightened = false;
  const moved = [];
  if (corners.some((c) => !c.ok) && !p.designedNegative) {
    tightened = true;
    const clampSide = (arr, lim) => arr.map((v) => Math.sign(v) * Math.min(Math.abs(v), lim));
    band = { alongM: band.alongM, latM: clampSide(band.latM, TIGHT_LAT_M), yawDeg: clampSide(band.yawDeg, TIGHT_YAW_DEG) };
    say(`    re-screen at lat ${band.latM.join("/")} m, yaw ${band.yawDeg.join("/")}°`);
    corners = run(band);
  }
  if (!p.screenedBySlice0 && !p.designedNegative) {
    for (let guard = 0; guard < 8 && corners.some((c) => !c.ok); guard++) {
      const bad = corners.filter((c) => !c.ok);
      const lowBad = bad.some((c) => c.along === band.alongM[0]);
      const next = lowBad ? [r(band.alongM[0] + 0.25, 3), band.alongM[1]] : [band.alongM[0], r(band.alongM[1] - 0.25, 3)];
      if (next[1] - (next[0] + ARM_ROLL_ALLOW_M) < ACCEPT_MIN_WIDTH_M - 1e-9) break;
      moved.push({ from: band.alongM, to: next, why: `corner ${bad[0].along}/${bad[0].lat}/${bad[0].yaw} ${bad[0].class} ${bad[0].worstDevM}` });
      say(`    along edge moved ${band.alongM.join("…")} -> ${next.join("…")} (unscreened segment: the committed band is whatever survives)`);
      band = { ...band, alongM: next };
      corners = run(band);
    }
  }
  return { band, corners, tightened, moved, failed: corners.filter((c) => !c.ok) };
}

export function buildLesson(lesson, { log = say, reuse = null } = {}) {
  const tracePath = `content/traces/${lesson}/shadow-correct.trace.json`;
  const text = readFileSync(resolve(REPO_ROOT, tracePath), "utf8");
  const doc = JSON.parse(text);
  const S = traceSamples(doc);
  const segs = gearSegments(S);
  const stops = authoredStops(S, segs);
  const problems = [];
  const notes = [];
  const outSegs = [];
  let prevEnd = null;
  const t0 = Date.now();
  for (const sg of segs) {
    const sigma = sg.g;
    const p0 = S[sg.p0];
    const e = S[sg.i1];
    const base = {
      k: sg.k, gear: sigma, micro: sg.micro,
      arcM: [r(S[sg.p0].s, 2), r(e.s, 2)], tSec: [r(S[sg.p0].t, 2), r(e.t, 2)], samples: [sg.p0, sg.i1], teleportDropped: sg.skip,
      authoredStart: { x: r(p0.x, 3), z: r(-p0.y, 3), psi: r(p0.psi, 3) },
      authoredEnd: { x: r(e.x, 3), z: r(-e.y, 3), psi: r(e.psi, 3) },
      lengthM: r(sg.lengthM, 2),
      speed: { binM: 1, rule: "median |speedKmh| of samples with |speedKmh| > 1 over the gear run; empty bin = nearest non-empty (lower on ties)", movingMedianKmh: movingMedianProfile(doc.samples, sg.i0, sg.i1) },
    };
    // ── stops that belong to this segment ──
    const segStops = [];
    const arcSpan = Math.max(1e-6, e.s - S[sg.p0].s);
    for (const st of stops) {
      if (st.tag === "spawn") continue;
      const inSeg = st.sampleIndex >= sg.p0 && st.sampleIndex <= sg.i1 && (st.segIndex === sg.k || (st.tag === "gearChange" && st.segIndex === sg.k));
      if (!inSeg) continue;
      const dwellS = r(Math.min(DWELL_CLAMP_S.max, Math.max(DWELL_CLAMP_S.min, st.dwellS)), 2);
      const tag = st.tag === "gearChangeD" ? "segmentEnd" : st.tag;
      segStops.push({ tag, frac: r(Math.min(1, Math.max(0, (st.arcM - S[sg.p0].s) / arcSpan)), 4), arcM: r(st.arcM, 2), dwellS, authoredDwellS: r(st.dwellS, 2), tSec: r(st.tSec, 2) });
    }
    const next = segs[sg.k + 1];
    if (sigma === -1 && next && next.g === 1 && !segStops.some((s) => s.tag === "segmentEnd")) {
      segStops.push({ tag: "inserted", frac: 1, arcM: r(e.s, 2), dwellS: INSERTED_DWELL_S, authoredDwellS: 0, tSec: r(e.t, 2), why: "R→D with no authored stop (Slice 0 §4.2)" });
    }
    if (!next && !segStops.some((s) => s.tag === "routeEnd")) {
      segStops.push({ tag: "routeEnd", frac: 1, arcM: r(e.s, 2), dwellS: DWELL_CLAMP_S.min, authoredDwellS: 0, tSec: r(e.t, 2) });
    }
    base.stops = segStops.sort((a, b) => a.frac - b.frac);

    if (sigma === 1) {
      // ── FORWARD ──
      const ref = resamplePoints(segmentPoints(S, sg), 0.05);
      const T = tangents(ref, 0.25);
      const long = ref.L > 60;
      const start = prevEnd ?? { x: p0.x, y: p0.y, psi: p0.psi };
      let cur0 = 0;
      if (prevEnd) {
        let bd = Infinity;
        for (let k = 0; k < Math.min(ref.n, Math.round(3 / ref.ds)); k++) {
          const d = Math.hypot(ref.X[k] - start.x, ref.Y[k] - start.y);
          if (d < bd) { bd = d; cur0 = k; }
        }
      }
      const end = { x: e.x, y: e.y, psi: e.psi };
      const ctx = { ref, T, sigma: 1, start, end, box: BOX, vAtArc: vProfileFor(S, sg, ref, 1), dsSim: long ? 0.1 : GENERATOR.dsSimM, cur0, kappaScale: GENERATOR.kappaScale };
      const tp = Date.now();
      const plan = planWitness(ctx, { long });
      const prof = plan.tight ?? plan.best;
      const nextIsR = next && next.g === -1;
      const pol = nextIsR ? REVERSE_POLICY[lesson]?.[next.k] : null;
      if (!prof) {
        problems.push(`seg ${sg.k} D: no witness`);
        outSegs.push({ ...base, class: INFEASIBLE, witnesses: [] });
        continue;
      }
      let rows = profileRows(ctx, prof, prof.nSteps);
      // A long-segment beam stops on the box EDGE (poligon F2: 0.4999 m). The δ
      // rounding stored in the rows can push that a millimetre outside, so the
      // witness is continued 2 m straight and the stop is re-picked on it.
      {
        const deltas = rows.map((row) => row[6]);
        const vs = rows.map((row) => row[8]);
        for (let k = 0; k < Math.round(2.0 / GENERATOR.rowEveryM); k++) { deltas.push(0); vs.push(vs[vs.length - 1]); }
        rows = integrateRows({ start: ctx.start, sigma: 1, deltas, vKmh: vs, h: GENERATOR.rowEveryM, kappaScale: ctx.kappaScale });
        const f = armFrame(e);
        const refExt = extendStart({ X: Float64Array.from(ref.X).reverse(), Y: Float64Array.from(ref.Y).reverse(), n: ref.n, ds: ref.ds, L: ref.L }, f.hx, f.hy, 3);
        measureRows(rows, { X: Float64Array.from(refExt.X).reverse(), Y: Float64Array.from(refExt.Y).reverse(), n: refExt.n, ds: refExt.ds, L: refExt.L }, cur0);
      }
      const corridor = (plan.tight ? plan.tight.corridorM : prof.maxDev + 0.02) + 0.15 + (prevEnd ? 1.5 : 0);
      const stop = pickStop(rows, end, BOX, corridor);
      rows = stop ? rows.slice(0, stop.k + 1) : rows;
      const acquireRows = prevEnd ? Math.round(10 / GENERATOR.rowEveryM) : 0;
      const plannedEndErr = stop ? { posM: r(stop.posErr, 3), yawDeg: r(stop.yawErr, 2) } : null;
      let inBox = !!stop && stop.norm <= 1 + 1e-9;
      let extensionM = 0;
      let aimRec = null;
      let endErr = plannedEndErr;
      const lastForward = !next && !sg.micro;
      if ((pol || lastForward) && rows.length > 2) {
        // §2.4: aim at the CENTRE of the band the reverse may start in (0 for a
        // symmetric band; a one-sided band is aimed inside its tightened half), or
        // at the authored end on the last segment.
        // The committed (screened) band when a previous build has one, else the declared
        // band clamped to its tightened half — a one-sided band is aimed at its middle.
        const committedBand = pol ? reuse?.segments?.find((x) => x.k === next.k && x.gear === -1)?.armBand ?? null : null;
        // A symmetric band is aimed at its centre (0). A ONE-SIDED band ([0, e] or [e, 0])
        // is aimed 3/4 of the way to its far edge: the approach arrives from 0 and the car
        // lags its witness back toward 0 by ≈ 1° of yaw at the stop (T9 bench, gap-short
        // and 45-rev, aimed at the centre: 3 of 12 stops at +0.01…+0.17° against a 0° edge).
        const far = (edges, lim) => (edges[0] >= 0 ? Math.min(edges[1], committedBand ? Infinity : lim) : Math.max(edges[0], committedBand ? -Infinity : -lim));
        const mid = (edges, lim) => (edges[0] < 0 && edges[1] > 0 ? (edges[0] + edges[1]) / 2 : 0.75 * far(edges, lim));
        const latC = pol ? r(mid((committedBand ?? pol.band).latM, TIGHT_LAT_M), 3) : 0;
        const yawC = pol ? r(mid((committedBand ?? pol.band).yawDeg, TIGHT_YAW_DEG), 3) : 0;
        const aim = pol ? offsetPose(e, 0, latC, yawC) : { x: e.x, y: e.y, psi: e.psi };
        extensionM = pol ? r(pol.band.alongM[1] + 1.0, 2) : 0;
        const f = armFrame(e);
        const refExt = extendStart({ X: Float64Array.from(ref.X).reverse(), Y: Float64Array.from(ref.Y).reverse(), n: ref.n, ds: ref.ds, L: ref.L }, f.hx, f.hy, extensionM + 4);
        const fwd = { X: Float64Array.from(refExt.X).reverse(), Y: Float64Array.from(refExt.Y).reverse(), n: refExt.n, ds: refExt.ds, L: refExt.L };
        // THE TAIL IS PLANNED AGAIN, WITH A TIGHT END (§2.2). The last TAIL_M of the
        // witness is re-planned by the same planners from the witness's own state
        // there, against a 0.15 m / 1.5° box (tight pass to 0.03 m / 0.3°), and
        // spliced: the prefix δ are kept, the tail's appended, one integration.
        //
        // Before a reverse the tail ends at a PRE-AIM pose `pre` m short of the aim, on
        // the aim line, and a rate-limited pursuit settles it through the aim. A tail
        // planned to the aim itself met it with a last-row δ kick (45-rev: +0.7° → −1.23°
        // in 0.3 m) that no car reproduces (T9 bench: gear-change-missed). The pre-aim
        // is shortened, 5 → 3 → 1.5 m, when a turn ends too late for it (poligon F4:
        // 5 m made the approach ENDPOSE 1.04 m).
        const TAIL_M = 15;
        const i0 = Math.max(0, Math.floor((ref.L - TAIL_M) / ref.ds));
        let ks = 0;
        let bd = Infinity;
        for (let k = 0; k < rows.length; k++) {
          const dd = Math.hypot(rows[k][1] - ref.X[i0], -rows[k][2] - ref.Y[i0]);
          if (dd < bd) { bd = dd; ks = k; }
        }
        const tryPre = (pre) => {
          let how = "planned tail";
          let out = null;
          if (ks > 0 || ref.L <= TAIL_M + 3) {
            const j0 = Math.max(0, i0 - Math.round(3 / ref.ds));
            const ref2 = { X: ref.X.slice(j0), Y: ref.Y.slice(j0), n: ref.n - j0, ds: ref.ds, L: (ref.n - j0 - 1) * ref.ds };
            const start2 = { x: rows[ks][1], y: -rows[ks][2], psi: rows[ks][5] };
            let c0 = 0;
            let b0 = Infinity;
            for (let k = 0; k < ref2.n; k++) {
              const dd = Math.hypot(ref2.X[k] - start2.x, ref2.Y[k] - start2.y);
              if (dd < b0) { b0 = dd; c0 = k; }
            }
            const tailEnd = pol ? offsetPose(e, -pre, latC, yawC) : aim;
            const ctx2 = { ref: ref2, T: tangents(ref2, 0.25), sigma: 1, start: start2, end: tailEnd, box: TAIL_BOX, vAtArc: (u) => ctx.vAtArc(u + j0 * ref.ds), dsSim: GENERATOR.dsSimM, cur0: c0, kappaScale: ctx.kappaScale };
            const plan2 = planWitness(ctx2, { long: false });
            const prof2 = plan2.tight ?? plan2.best;
            if (prof2) {
              const rows2 = profileRows(ctx2, prof2, prof2.nSteps);
              const deltas = [...rows.slice(0, ks + 1).map((row) => row[6]), ...rows2.slice(1).map((row) => row[6])];
              const vs = [...rows.slice(0, ks + 1).map((row) => row[8]), ...rows2.slice(1).map((row) => row[8])];
              out = integrateRows({ start: ctx.start, sigma: 1, deltas, vKmh: vs, h: GENERATOR.rowEveryM, kappaScale: ctx.kappaScale });
              measureRows(out, fwd, cur0);
              // the stop: the tightest end pose on the tail (0.15 m / 1.5° norm), within its deviation guard
              let pick = null;
              for (let k = ks; k < out.length; k++) {
                if (out[k][7] > Math.max(0.6, (plan2.best?.maxDev ?? 0) + 0.2)) break;
                const posErr = Math.hypot(out[k][1] - tailEnd.x, -out[k][2] - tailEnd.y);
                const yawErr = Math.abs(wrapDeg(out[k][5] - tailEnd.psi));
                const norm = Math.max(posErr / TAIL_BOX.posM, yawErr / TAIL_BOX.yawDeg);
                if (!pick || norm < pick.norm - 1e-9) pick = { k, norm };
              }
              out = pick ? out.slice(0, pick.k + 1) : out;
              how = `planned tail ${prof2.source} from row ${ks}${pol ? `, pre-aim ${pre} m` : ""}`;
            }
          }
          if (!out) {
            // the planners found nothing: the offline pursuit square-up
            const sq = squareUpDeltas(rows, aim, ref, { extendM: 0 });
            out = integrateRows({ start: ctx.start, sigma: 1, deltas: sq.deltas, vKmh: sq.vs, h: GENERATOR.rowEveryM, kappaScale: ctx.kappaScale });
            measureRows(out, fwd, cur0);
            how = `pursuit square-up from row ${sq.splitRow} (the tail planners found no stop)`;
          }
          let ext = 0;
          if (pol) {
            // from the pre-aim, a rate-limited pursuit settles onto the aim line and runs past
            // the band (§2.2 step 2): at the aim the witness is SETTLED, not passing through
            ext = pol.band.alongM[1] + 1.0;
            const sq = squareUpDeltas(out, aim, ref, { splitBackM: Math.max(0.5, pre - 0.6), blendM: pre + 1, extendM: ext, ldM: 2.5 });
            out = integrateRows({ start: ctx.start, sigma: 1, deltas: sq.deltas, vKmh: sq.vs, h: GENERATOR.rowEveryM, kappaScale: ctx.kappaScale });
            measureRows(out, fwd, cur0);
          }
          const worstTail = out.reduce((m, row, i) => (i >= acquireRows ? Math.max(m, row[7]) : m), 0);
          return { rows: out, how, worstTail, extensionM: pol ? r(ext + pre, 2) : 0 };
        };
        let pickTail = null;
        for (const pre of pol ? PRE_AIM_LADDER_M : [0]) {
          const t = tryPre(pre);
          if (!pickTail || t.worstTail < pickTail.worstTail) pickTail = t;
          if (t.worstTail <= TRACK_CORRIDOR_M) break;
        }
        if (/square-up/.test(pickTail.how)) notes.push(`seg ${sg.k} D: ${pickTail.how}`);
        rows = pickTail.rows;
        const how = pickTail.how;
        extensionM = pickTail.extensionM;
        endErr = errAtAim(rows, aim);
        endErr = endErr && { posM: r(endErr.posM, 3), yawDeg: r(endErr.yawDeg, 2) };
        inBox = !!endErr && endErr.posM <= BOX.posM && endErr.yawDeg <= BOX.yawDeg;
        aimRec = { latM: latC, yawDeg: yawC, x: r(aim.x, 3), z: r(-aim.y, 3), psi: r(aim.psi, 3), how, plannedEndErr };
      }
      let worst = rows.reduce((m, row, i) => (i >= acquireRows ? Math.max(m, row[7]) : m), 0);
      let worstAll = rows.reduce((m, row) => Math.max(m, row[7]), 0);
      const cls = classOf(worst, inBox);
      const exp = FORWARD_EXPECT[lesson]?.[sg.k] ?? null;
      const mismatch = prevEnd ? (cls === INFEASIBLE ? "INFEASIBLE after acquisition" : null) : expectMatch(exp, cls, worst);
      if (mismatch) problems.push(`seg ${sg.k} D: ${mismatch}`);
      log(`  ${lesson} seg${sg.k} D ${r(ref.L, 1)} m -> ${cls} dev ${r(worst, 3)}${prevEnd ? ` (after 10 m acquisition; ${r(worstAll, 3)} incl.)` : ""} (${Date.now() - tp} ms)${mismatch ? `  <-- ${mismatch}` : ""}`);
      outSegs.push({
        ...base,
        class: cls,
        acquiredFrom: prevEnd ? { x: r(prevEnd.x, 3), z: r(-prevEnd.y, 3), psi: r(prevEnd.psi, 3), why: "planned from the previous (re-planned) segment's witness end pose, not the authored start (§2.5)" } : null,
        witnesses: [{
          startAlongM: 0,
          startPose: { x: r(start.x, 3), z: r(-start.y, 3), psi: r(start.psi, 3) },
          class: cls, worstDevM: r(worst, 3), plannerBestDevM: r(plan.best?.maxDev ?? null, 3), worstDevIncludingAcquisitionM: prevEnd ? r(worstAll, 3) : undefined,
          endErr,
          aim: aimRec,
          source: prof.source, planMs: plan.ms, lengthM: r(rows[rows.length - 1][0], 2),
          rows: storeRows(rows),
        }],
        extensionM,
      });
      prevEnd = null;
      continue;
    }

    // ── REVERSE ──
    // `--reuse-reverse`: a reverse segment depends only on the trace and its policy
    // row, never on the approach, so a rebuild of the approaches may keep it —
    // provided the previous pathref was built from the SAME samples.
    const kept = reuse?.segments?.find((x) => x.k === sg.k && x.gear === -1) ?? null;
    if (kept) {
      outSegs.push(kept);
      if (kept.designedNegative) {
        const wl = kept.witnesses?.[0]?.rows;
        if (wl?.length) { const last = wl[wl.length - 1]; prevEnd = { x: last[1], y: -last[2], psi: last[5] }; }
      }
      log(`  ${lesson} seg${sg.k} R reused from the previous build (samplesDigest equal)`);
      continue;
    }
    const p = REVERSE_POLICY[lesson]?.[sg.k];
    if (!p) {
      problems.push(`seg ${sg.k} R: no policy row`);
      continue;
    }
    const tp = Date.now();
    const witnesses = [];
    for (const g of p.witnessGrid) {
      const res = planReverseFrom(S, sg, g, 0, 0, { box: p.relaxedBox ?? BOX });
      const mismatch = p.designedNegative ? (res.rows ? null : "the re-planned witness was not found") : expectMatch(p.expect[String(g)], res.cls, res.worstDevM);
      if (mismatch) problems.push(`seg ${sg.k} R grid ${g}: ${mismatch}`);
      log(`  ${lesson} seg${sg.k} R grid ${g} -> ${res.cls} dev ${r(res.worstDevM, 3)} end ${res.stop ? `${r(res.stop.posErr, 3)} m / ${r(res.stop.yawErr, 2)}°` : "-"} (${res.ms} ms)${mismatch ? `  <-- ${mismatch}` : ""}`);
      witnesses.push(witnessRecord(res, g));
      if (p.designedNegative && res.rows) {
        const last = res.rows[res.rows.length - 1];
        prevEnd = { x: last[1], y: -last[2], psi: last[5] };
      }
    }
    const screen = screenCorners(S, sg, p, witnesses);
    if (p.designedNegative) for (const c of screen.failed) notes.push("seg " + sg.k + " R (designed negative) corner along " + c.along + " lat " + c.lat + " yaw " + c.yaw + ": " + c.class + " " + c.worstDevM + " — recorded, not fatal: this segment is graded by Задача 1's zone, not a pose");
    else for (const c of screen.failed) problems.push(`seg ${sg.k} R corner along ${c.along} lat ${c.lat} yaw ${c.yaw}: ${c.class} ${c.worstDevM} outside its ${c.corridorM} m corridor after the tightened re-screen`);
    const bandRow = { ...screen.band, declared: p.band, corners: screen.corners, tightened: screen.tightened, alongMoved: screen.moved };
    const out = {
      ...base,
      class: p.classAtAuthored,
      classSrc: p.src,
      gearChangePose: { x: r(p0.x, 3), z: r(-p0.y, 3), psi: r(p0.psi, 3) },
      armBand: bandRow,
      witnessGrid: p.witnessGrid,
      witnesses,
      productPark: (() => {
        const park = PRODUCT[lesson]?.park;
        if (!park) return null;
        const lastR = [...segs].reverse().find((x) => x.g === -1);
        return park.seg === sg.k || (park.seg === "last" && lastR && lastR.k === sg.k) ? park : null;
      })(),
      planMs: Date.now() - tp,
    };
    if (p.designedNegative) {
      out.designedNegative = true;
      out.replan = p.replan;
      out.relaxedBox = p.relaxedBox;
      out.spawnBand = { alongM: p.band.alongM, latM: p.band.latM, yawDeg: p.band.yawDeg };
    } else {
      const survived = { ...p, band: screen.band };
      const accept = acceptAlongOf(survived);
      if (accept[1] - accept[0] < ACCEPT_MIN_WIDTH_M - 1e-9) problems.push(`seg ${sg.k} R: acceptance band ${accept.join("…")} is narrower than ${ACCEPT_MIN_WIDTH_M} m`);
      out.stopTarget = { alongM: stopTargetOf(survived), acceptAlongM: accept, armRollAllowM: ARM_ROLL_ALLOW_M, armRollExpM: ARM_ROLL_EXP_M };
    }
    const worstCorner = screen.corners.reduce((m, c) => Math.max(m, c.worstDevM ?? 0), 0);
    for (const w of witnesses) w.corridorM = r(Math.min(1.5, Math.max(w.worstDevM ?? 0, worstCorner) + 0.35), 3);
    outSegs.push(out);
  }
  const pathref = {
    schema: "knijka.pathref/1",
    lesson,
    trace: { path: tracePath, samplesDigest: samplesDigest(doc) },
    generator: GENERATOR,
    car: { L: CAR.L, a: CAR.a, lock: CAR.lock, minLock: CAR.minLock, fullLockKmh: CAR.fullLockKmh, minLockKmh: CAR.minLockKmh, steerRate: CAR.steerRate },
    rowColumns: ROW_COLUMNS,
    frame: "probe: x, z = −y; ψ 0 = north = −z, clockwise positive",
    durationSec: doc.meta?.durationSec ?? null,
    product: PRODUCT[lesson] ?? null,
    caveats: CAVEATS[lesson] ?? [],
    stagedActors: STAGED_ACTORS[lesson] ?? [],
    segments: outSegs,
    buildMs: Date.now() - t0,
    problems,
    notes,
  };
  return pathref;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const reuseReverse = process.argv.includes("--reuse-reverse");
  const lessons = want.length ? want : [...PATH_LESSONS];
  mkdirSync(PATHREF_DIR, { recursive: true });
  let failed = 0;
  for (const lesson of lessons) {
    say(`== ${lesson}`);
    let reuse = null;
    if (reuseReverse) {
      try {
        const prev = JSON.parse(readFileSync(resolve(PATHREF_DIR, `${lesson}.pathref.json`), "utf8"));
        const digest = samplesDigest(JSON.parse(readFileSync(resolve(REPO_ROOT, "content", "traces", lesson, "shadow-correct.trace.json"), "utf8")));
        // a problem on an APPROACH does not taint the reverse segments, which never read it
        if (prev?.trace?.samplesDigest === digest && Array.isArray(prev.problems) && prev.problems.every((pr) => / D: /.test(pr))) reuse = prev;
        else say(`  (no reuse for ${lesson}: the previous pathref is stale or had problems)`);
      } catch {
        say(`  (no previous pathref for ${lesson})`);
      }
    }
    const ref = buildLesson(lesson, { reuse });
    if (ref.problems.length) {
      failed += 1;
      for (const pr of ref.problems) say(`  !! ${lesson}: ${pr}`);
    }
    const out = resolve(PATHREF_DIR, `${lesson}.pathref.json`);
    writeFileSync(out, `${JSON.stringify(ref)}\n`);
    say(`  wrote ${out} (${ref.buildMs} ms${ref.problems.length ? `, ${ref.problems.length} PROBLEM(S)` : ""})`);
  }
  process.exitCode = failed ? 1 : 0;
}
