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
import { BODY_FLOOR_M, BODY_WARN_M, clearanceFn, mountedBodies, screenPathrefSegments, verifiedFleetHalf, worstMountedClearance } from "./body-screen.mjs";
import {
  ACCEPT_MIN_WIDTH_M, ARM_ROLL_ALLOW_M, ARM_ROLL_EXP_M, CAVEATS, DWELL_CLAMP_S, ENDPOSE, FORWARD_EXPECT,
  INFEASIBLE, INSERTED_DWELL_S, PATH_LESSONS, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M, PRODUCT, REVERSE_POLICY,
  REST_BACK_M, REVERSE_LOCK_AUTHORITY, STAGED_ACTORS, TIGHT_LAT_M, TIGHT_YAW_DEG, TRACK,
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
  // THE REVERSE WHEEL EVERY REVERSE WITNESS WAS PLANNED WITH (2026-09-16): policy.mjs
  // REVERSE_LOCK_AUTHORITY, read by planReverseOnce from HERE so the value written into
  // the pathref's `generator` is the value the planner used — path-plan.test.mjs checks
  // the committed rows against it, and names a pathref that carries none.
  reverseAuthority: REVERSE_LOCK_AUTHORITY,
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

/**
 * PICK THE STOP ROW.
 *
 * WITHOUT a body screen (`opts.clearanceAt` absent) this is unchanged: the
 * smallest end-pose norm whose prefix worst deviation stays inside `corridor`.
 *
 * WITH one, the rule is the other way round (2026-09-16). The smallest end-pose
 * norm is the row NEAREST the authored end — and the authored ends of these six
 * lessons are the poses that graze the neighbour, so «tightest end» quietly
 * spends the clearance the planner just bought. So among rows that are inside
 * the corridor, inside the acceptance box AND inside the product park box, the
 * stop that MAXIMISES the running minimum clearance wins. The end is still
 * gated — it is just no longer the thing being minimised. Worth ≈ 0.10 m on the
 * probe. A row whose clearance cannot be read is REFUSED, never skipped.
 */
/**
 * THE ROW THE CAR WILL BE GRADED IN, for a candidate stop at row `k`: the row
 * `REST_BACK_M` of arc earlier (policy.mjs — the measured distance a reverse
 * gives up to its own brake). Row 0 when the segment is shorter than that, which
 * is honest rather than silent: a stop that cannot be backed off is graded where
 * the witness starts, and that pose will fail the park gate on its own merits.
 */
function restRowIndex(rows, k, backM = REST_BACK_M) {
  const target = rows[k][0] - backM;
  for (let j = k; j >= 0; j--) if (rows[j][0] <= target + 1e-9) return j;
  return 0;
}

export function pickStop(rows, end, box, corridor, opts = {}) {
  const clearanceAt = opts.clearanceAt ?? null;
  const endGate = opts.endGate ?? null;
  let prefix = 0;
  let minClear = Infinity;
  let best = null;
  for (let k = 0; k < rows.length; k++) {
    prefix = Math.max(prefix, rows[k][7]);
    if (prefix > corridor + 1e-9) break;
    if (clearanceAt) {
      const g = clearanceAt(rows[k][1], -rows[k][2], rows[k][5]);
      if (!Number.isFinite(g)) throw new Error(`pickStop: the body clearance of row ${k} came back ${g} — refusing to choose a stop nothing screened`);
      if (g < minClear) minClear = g;
      // THE FLOOR DECIDES HOW DEEP A STOP MAY BE (2026-09-16). `minClear` only ever
      // falls, so once the prefix is under BODY_FLOOR_M no deeper row can be chosen
      // either: stop looking. Before this, the floor was enforced only afterwards by
      // the body screen, which BLOCKS THE EMIT — and once the park gate started asking
      // for the pose REST_BACK_M further in (policy.mjs), sc-park-left's +0.5 witness
      // reached 0.0724 m of lotlf-bay-2 at the last row and the whole lesson went
      // unwritten. A park-box miss is a caveat; an unwritten lesson is no plan at all,
      // so the stop gives up the box here and the miss is REPORTED by name. The floor
      // itself is untouched — it is applied earlier, not lowered.
      if (minClear < BODY_FLOOR_M) break;
    }
    const posErr = Math.hypot(rows[k][1] - end.x, -rows[k][2] - end.y);
    const yawErr = Math.abs(wrapDeg(rows[k][5] - end.psi));
    const norm = Math.max(posErr / box.posM, yawErr / box.yawDeg);
    if (!clearanceAt) {
      if (!best || norm < best.norm - 1e-9) best = { k, norm, posErr, yawErr, prefix };
      continue;
    }
    if (norm > 1 + 1e-9) continue;
    // THE PARK GATE IS ASKED OF THE POSE THE CAR WILL REST IN, not of the row it
    // aims at (policy.mjs REST_BACK_M). `norm` above is deliberately still the
    // candidate row's: it is the ACCEPTANCE BOX against the authored end, the
    // measure the classes in policy.mjs FORWARD_EXPECT / REVERSE_POLICY were
    // pinned with, and moving it would re-classify witnesses that have not changed.
    const gk = restRowIndex(rows, k);
    if (endGate && !endGate(rows[gk][1], -rows[gk][2], rows[gk][5])) continue;
    // A TIE ON CLEARANCE IS BROKEN TOWARD ROOM IN THE PRODUCT BOX (2026-09-16), asked
    // of the row the car RESTS in, like the gate above. `minClear` only falls, so every
    // stop after the binding pose ties on it, and `>` alone kept the FIRST of them: the
    // stop on the gate's own edge (sc-park-left R1 +0.5 committed at a rest radius of
    // 0.481 m against 0.5 — 0.019 m of room where a drive spends 0.088).
    //
    // The SEARCH (`planner.mjs simulateTargets`) breaks the same tie with the same norm
    // but at the pose it integrates to, where it has always asked its gate. Moving the
    // search's gate to the rest pose as well was built and MEASURED on sc-park-left/-van,
    // and rejected, because in every combination some committed stop still lost the
    // follower's margin: alone, sc-park-left R1 0 at 0.070 m of room; with this tie-break,
    // sc-park-van R1 0 at 0.076 and sc-park-left +0.5 at 0.058 (and three of four
    // sc-park-left bench drives refused `body-clearance`); with the tie-break and the
    // reverse authority cap, sc-park-left R1 0 at 0.007 and sc-park-van R1 −0.5 at 0.062.
    // The tie-break and the cap WITHOUT it left all nine stops of the three re-planned
    // lessons with ≥ 0.143 m. The search keeps its profile running through the box; this
    // commit backs off REST_BACK_M and chooses among the tied rows by room.
    let room = null;
    if (opts.endRoom) {
      room = opts.endRoom(rows[gk][1], -rows[gk][2], rows[gk][5]);
      if (!Number.isFinite(room)) throw new Error(`pickStop: the park-box room of graded row ${gk} came back ${room} — refusing to rank a stop nothing measured`);
    }
    const better = !best || minClear > best.clearM + 1e-9 || (room !== null && Math.abs(minClear - best.clearM) <= 1e-9 && room < best.room - 1e-9);
    if (better) best = { k, norm, posErr, yawErr, prefix, clearM: minClear, room };
  }
  return best;
}

/**
 * THE PRODUCT PARK BOX, AS A CONSTRAINT ON THE STOP (2026-09-16).
 *
 * Mirrored from `platform/src/modules/sim/lessons/objectives.ts:5792-5795` —
 * the acceptance is the BAY's shape, not a disc: `lonTolM = max(centerTolM,
 * lengthM/2 − PARK_CAR_HALF_LENGTH_M)`, `latTolM = min(centerTolM, widthM/2 −
 * PARK_CAR_HALF_WIDTH_M)`, heading folded to 180°. The two half extents are
 * `policy.mjs` PLAYER_HALF_LENGTH_M / PLAYER_HALF_WIDTH_M (2.02 / 0.85), the
 * same numbers that file cites from the same source.
 *
 * TWO RULES READ THIS BOX AND THEY ARE NOT THE SAME RULE. The product credits a
 * park on the RECTANGLE above. The harness's own judgement uses a RADIUS: the
 * debrief's «отместване X м» against `centerTolM` (`path-follow.mjs`
 * `productParkWitness`), and a stop outside it books the segment UNJUDGED —
 * «THE HARNESS MISSED THE BOX» — which is the exact outcome the 19 blocked rows
 * cannot afford. A plan that satisfies one and not the other is worthless, so
 * the gate is the INTERSECTION: rectangle AND radius. Measured 2026-09-16 on a
 * first build that gated on the rectangle alone: three of nine committed stops
 * sat at a radius of 0.51–0.53 m against a 0.5 m tolerance.
 *
 * AND IT LEAVES THE FOLLOWER ITS OWN ERROR. The plan is not what stops the car;
 * a drive tracks it with error. The margin is the SAME measured 0.088 m that is
 * the first term of `BODY_FLOOR_M` — the worst following error any real browser
 * drive has shown against a committed witness — taken off every distance
 * tolerance, and the same fraction of the tolerance (0.088 / 0.5 = 17.6%) taken
 * off the heading, where no separate error measurement exists. Without it the
 * same build put stops 0.006–0.019 m inside a tolerance a 0.088 m drift crosses.
 *
 * AND IT ALWAYS BINDS, BECAUSE THE FLOOR IS THE DEMONSTRATION. Two lessons stop
 * short of their own painted bay — sc-park-gap-short at lon −0.624 m and
 * sc-park-judge at −0.744 m against a 0.5 m depth tolerance — so the product box
 * cannot be asked of a plan that must reach the authored goal. The first cut of
 * this gate therefore declared it «non-binding» there and left the stop with no
 * park constraint at all; measured on that build, sc-park-gap-short's stops came
 * back at 12.4–12.9° off the bay axis where the demonstration is 2.96°, and a
 * radius of 0.72 m where the demonstration is 0.62 m. Strictly worse, in the name
 * of not being stricter. So each tolerance is the LARGER of the tightened product
 * value and what the demonstration itself achieves: the plan is held to the
 * product where the product is reachable, and to the demonstration where it is
 * not, and can never be worse than both.
 */
/** The follower's worst measured tracking error (body-screen.mjs BODY_FLOOR_M, first term). */
const PARK_GATE_FOLLOW_M = 0.088;
/** The same allowance as a fraction, for the heading axis, which has no separate measurement. */
const PARK_GATE_FOLLOW_FRACTION = PARK_GATE_FOLLOW_M / 0.5;

function parkGateFor(lesson, segs, sgK, end) {
  const park = PRODUCT[lesson]?.park;
  if (!park) return { gate: null, why: `${lesson} has no product park box` };
  const lastR = [...segs].reverse().find((x) => x.g === -1);
  const mine = park.seg === sgK || (park.seg === "last" && lastR && lastR.k === sgK);
  if (!mine) return { gate: null, why: `the product park box grades segment ${park.seg}, not ${sgK}` };
  const b = park.bay;
  if (![b.x, b.y, b.headingDeg, b.widthM, b.lengthM, park.centerTolM, park.headingTolDeg].every(Number.isFinite)) {
    throw new Error(`parkGateFor: ${lesson} seg ${sgK} has an unreadable park box (${JSON.stringify(park)}) — refusing to gate a stop against a guess`);
  }
  const ah = Math.sin(b.headingDeg * RAD);
  const bh = Math.cos(b.headingDeg * RAD);
  // the product's own box (objectives.ts:5792-5795), and the harness's radius rule
  const lonTolM = Math.max(park.centerTolM, b.lengthM / 2 - PLAYER_HALF_LENGTH_M);
  const latTolM = Math.min(park.centerTolM, b.widthM / 2 - PLAYER_HALF_WIDTH_M);
  const at = (cx, cy, psi) => {
    const dx = cx - b.x;
    const dy = cy - b.y;
    const d = Math.abs(wrapDeg(psi - b.headingDeg));
    const lon = dx * ah + dy * bh;
    const lat = dx * bh - dy * ah;
    return { lon, lat, radiusM: Math.hypot(lon, lat), headingOffsetDeg: Math.min(d, 180 - d) };
  };
  // THE PRODUCT GATE IS THE INTERSECTION, AND IT WAS NOT (2026-09-16). The block
  // above says in as many words that a plan satisfying one rule and not the other
  // is worthless and that the gate is «rectangle AND radius» - but this predicate,
  // the one the stop ladder actually falls back to, tested the rectangle and the
  // heading and NOT the radius. A stop it admitted at lon 0.49 / lat 0.30 is inside
  // the product's rectangle and at a radius of 0.575 m, which books the segment
  // UNJUDGED - «THE HARNESS MISSED THE BOX».
  const productBox = (cx, cy, psi) => {
    const q = at(cx, cy, psi);
    return Math.abs(q.lon) <= lonTolM + 1e-9 && Math.abs(q.lat) <= latTolM + 1e-9
      && q.radiusM <= park.centerTolM + 1e-9 && q.headingOffsetDeg <= park.headingTolDeg + 1e-9;
  };
  const q0 = at(end.x, end.y, end.psi);
  // what the PLAN must hit: both rules, each with the follower's own error left in
  // it — or the demonstration's own offset where that is looser, never worse
  const planTol = {
    lonM: Math.max(lonTolM - PARK_GATE_FOLLOW_M, Math.abs(q0.lon)),
    latM: Math.max(latTolM - PARK_GATE_FOLLOW_M, Math.abs(q0.lat)),
    radiusM: Math.max(park.centerTolM - PARK_GATE_FOLLOW_M, q0.radiusM),
    headingDeg: Math.max(park.headingTolDeg * (1 - PARK_GATE_FOLLOW_FRACTION), q0.headingOffsetDeg),
  };
  if (!(planTol.lonM > 0 && planTol.latM > 0 && planTol.radiusM > 0 && planTol.headingDeg > 0)) {
    throw new Error(`parkGateFor: ${lesson} seg ${sgK}'s park box is smaller than the ${PARK_GATE_FOLLOW_M} m following error it must allow for (${JSON.stringify(planTol)}) — refusing to gate a stop against a negative tolerance`);
  }
  const gate = (cx, cy, psi) => {
    const q = at(cx, cy, psi);
    return Math.abs(q.lon) <= planTol.lonM + 1e-9 && Math.abs(q.lat) <= planTol.latM + 1e-9
      && q.radiusM <= planTol.radiusM + 1e-9 && q.headingOffsetDeg <= planTol.headingDeg + 1e-9;
  };
  const where = `lon ${r(q0.lon, 3)}/${r(lonTolM, 3)} m, lat ${r(q0.lat, 3)}/${r(latTolM, 3)} m, radius ${r(q0.radiusM, 3)}/${r(park.centerTolM, 3)} m, heading ${r(q0.headingOffsetDeg, 2)}/${park.headingTolDeg}°`;
  const planAt = `lon ${r(planTol.lonM, 3)} m, lat ${r(planTol.latM, 3)} m, radius ${r(planTol.radiusM, 3)} m, heading ${r(planTol.headingDeg, 2)}°`;
  const inProduct = productBox(end.x, end.y, end.psi);
  // THE TIGHTEST RUNG: the follower-margin gate INTERSECTED with the product box.
  // `gate` alone is not that. When the authored end is outside its own product box
  // the plan tolerances above fall back to the DEMONSTRATION's offsets, which are
  // LOOSER than the product box in the axis that missed - sc-park-gap-short's lon
  // tolerance becomes 0.624 m against the product's 0.500 - so the "strict" rung
  // silently became the loosest one and the stop ladder never reached the product
  // box at all. Intersecting makes the ladder MONOTONE by construction.
  const bothGate = (cx, cy, psi) => gate(cx, cy, psi) && productBox(cx, cy, psi);
  // HOW MUCH OF THE PRODUCT'S OWN BOX A POSE SPENDS: the largest fraction of any of
  // its four tolerances (≤ 1 exactly when `productBox` admits the pose, same four
  // terms). It gates nothing. It is the TIE-BREAK between stops of equal running
  // clearance — `planner.mjs simulateTargets` (`ctx.endRoom`) and `pickStop` above
  // (`opts.endRoom`) — which until 2026-09-16 kept the shallowest of the tied stops.
  const productNorm = (cx, cy, psi) => {
    const q = at(cx, cy, psi);
    return Math.max(Math.abs(q.lon) / lonTolM, Math.abs(q.lat) / latTolM, q.radiusM / park.centerTolM, q.headingOffsetDeg / park.headingTolDeg);
  };
  return {
    gate, productGate: productBox, productNorm, bothGate, at, lonTolM, latTolM, planTol, authoredAt: where, authoredInProductBox: inProduct,
    why: inProduct
      ? `the product park box binds the stop of seg ${sgK}: the plan must stop inside ${planAt} (the product's own ${r(lonTolM, 3)}/${r(latTolM, 3)}/${r(park.centerTolM, 3)} m / ${park.headingTolDeg}°, less the ${PARK_GATE_FOLLOW_M} m the follower spends); authored end at ${where}`
      : `the AUTHORED end of seg ${sgK} is OUTSIDE its own product park box (${where}), so the gate is the DEMONSTRATION's own offsets where they are looser: the plan must stop inside ${planAt}, and can never be worse than the drive it is planned from`,
  };
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

/**
 * How far a body-failing LAT band edge is pulled in per step (2026-09-16).
 *
 * 0.05 m because the hole is measured at the START POSE and the start pose's
 * clearance moves with lat at very nearly 1:1 (sc-park-wall along −1: lat −0.15
 * clears the garage wall by 0.325 m, lat 0 by 0.175 m, lat +0.15 by 0.025 m), so
 * a 0.05 m step is ≈ 0.05 m of clearance — fine enough not to throw away band
 * the lesson could have kept, coarse enough to converge in a few screens.
 */
const BODY_LAT_STEP_M = 0.05;
/** The same, for the yaw edge, once the lat edge on the failing side is spent. */
const BODY_YAW_STEP_DEG = 0.5;

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

/**
 * Plan one reverse witness from an arm-frame offset.
 *
 * `gate` (2026-09-16) is this lesson's body screen and product park box:
 * `{ clearanceAt, endGate, mounted }` from `clearanceGateFor`. When it carries a
 * `clearanceAt`, `planWitness` returns a third profile — the one that maximises
 * body clearance inside the class corridor — and it is the one committed.
 */
/**
 * THE SEARCH ASKS FOR THE BOX WHEN THE LOOSE GATE MISSED IT (2026-09-16).
 *
 * The stop LADDER below can only choose among the rows a profile already
 * produced. When the authored end is outside its own product park box the SEARCH
 * gate (`ctx.endGate`) is the demonstration's own offsets, so the clearance
 * maximiser is free to pick a profile whose every in-corridor row is outside the
 * box — and then no rung of the ladder can rescue it. That is what committed
 * sc-park-gap-short's +1 and +1.5 stops at lon −0.623 and −0.575 against a 0.500
 * rectangle and a 0.500 radius, while the SAME FAMILY's +0.5 witness stopped at
 * lon −0.405 / lat 0.182 / radius 0.444, inside both. "The plan could not have
 * fixed it" was refuted by its own sibling.
 *
 * So when the first plan's committed stop misses the box, the whole search is run
 * AGAIN with the product box as the search gate, and the second result is taken
 * ONLY if it is strictly better on the thing that was wrong and no worse on
 * anything else: it must land inside BOTH rules, keep the class, and keep its
 * mounted body clearance at or above `BODY_FLOOR_M`. Otherwise the first plan
 * stands and the miss is REPORTED. Nothing is relaxed either way — this spends
 * CPU, not tolerance.
 *
 * It is off by default. `screenCorners` plans thousands of corners to ask whether
 * a leg may ARM from them, which is not a question about where it stops.
 */
function planReverseFrom(S, sg, along, lat, yaw, opts = {}) {
  const first = planReverseOnce(S, sg, along, lat, yaw, opts);
  if (!opts.strictParkRetry || !opts.gate?.endGateProduct) return first;
  if (first.endInsideParkBox !== false || !first.rows?.length) return first;
  const strict = planReverseOnce(S, sg, along, lat, yaw, { ...opts, gate: { ...opts.gate, endGate: opts.gate.endGateProduct } });
  if (!strict.rows?.length || strict.endInsideParkBox !== true) return { ...first, strictParkRetry: { taken: false, why: strict.rows?.length ? `the strict search also stopped outside the box (${JSON.stringify(strict.endAt)})` : "the strict search found no witness at all" } };
  if (strict.cls !== first.cls) return { ...first, strictParkRetry: { taken: false, why: `the strict search reached the box but its class fell from ${first.cls} to ${strict.cls}` } };
  const bc = opts.gate.mounted ? worstMountedClearance(strict.rows, opts.gate.mounted) : null;
  if (bc && bc.worst < BODY_FLOOR_M) return { ...first, strictParkRetry: { taken: false, why: `the strict search reached the box but its body clearance fell to ${r(bc.worst, 4)} m against ${bc.body}/${bc.model}, under the ${BODY_FLOOR_M} m floor` } };
  return { ...strict, strictParkRetry: { taken: true, why: `the first search stopped outside the product park box (${JSON.stringify(first.endAt)}); re-planned with the box as the search gate`, wasEndAt: first.endAt, wasClearanceM: opts.gate.mounted ? r(worstMountedClearance(first.rows, opts.gate.mounted).worst, 4) : null, nowClearanceM: bc ? r(bc.worst, 4) : null } };
}

function planReverseOnce(S, sg, along, lat, yaw, { quick = false, box = BOX, gate = null } = {}) {
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
  const ctx = {
    ref, T, sigma: -1, start, end, box, vAtArc: () => 3, dsSim: GENERATOR.dsSimM, cur0, kappaScale: GENERATOR.kappaScale,
    clearanceAt: gate?.clearanceAt ?? null, endGate: gate?.endGate ?? null,
    // the clearance tie-break toward room in the product box (planner.mjs simulateTargets)
    endRoom: gate?.endRoom ?? null,
    // the reverse wheel the car really has (planner.mjs lockFor; policy.mjs REVERSE_LOCK_AUTHORITY via GENERATOR)
    reverseAuthority: GENERATOR.reverseAuthority,
  };
  const t0 = Date.now();
  const plan = planWitness(ctx, { quick });
  const prof = plan.clear ?? plan.tight ?? plan.best;
  if (!prof) return { ctx, plan, ms: Date.now() - t0, cls: INFEASIBLE, worstDevM: null, rows: null, stop: null };
  const rows = profileRows(ctx, prof, prof.nSteps);
  measureRows(rows, ref, cur0);
  const corridor = plan.clear ? plan.clear.corridorM : (plan.tight ? plan.tight.corridorM : plan.best.maxDev + 0.02) + 0.03;
  // The clearance stop rule needs a row that is in the box AND in the park box; if
  // no row is, the witness is still reported honestly by the deviation rule rather
  // than dropped, and the class it earns is what the build prints.
  // THE FALLBACK IS A LADDER, NOT A CLIFF — AND IT HAS TO BE MONOTONE (2026-09-16).
  // The first cut dropped straight from «inside the follower-margin gate» to
  // «tightest end pose», and sc-park-zebra's +0.5 witness took it: the planner
  // found a stop the gate admitted, the rounded re-integration moved it out, and
  // the fallback committed a stop at a radius of 0.542 m against the 0.5 m the
  // harness judges with — UNJUDGED by construction. Giving up the follower's
  // margin is a caveat; giving up the product box is a defect, so the margin goes
  // first and only then the box.
  //
  // THAT ORDER WAS AN ASSUMPTION AND IT WAS FALSE. Rung 1 was `park.gate`, the
  // product box less the follower's error — which is inside the product box ONLY
  // when the authored end is. When it is not, `parkGateFor` falls the tolerance
  // back to the DEMONSTRATION's own offsets, and for sc-park-gap-short that makes
  // rung 1's lon tolerance 0.624 m against the product's 0.500. Rung 1 then
  // succeeded at lon −0.623 and rung 2 — the product box — was never tried. Two of
  // that lesson's three committed stops missed the box because of it, while its own
  // +0.5 sibling stopped at lon −0.405 / lat 0.182 / radius 0.444, inside both
  // rules: the claim "the plan could not have fixed it" was refuted by the family.
  //
  // So the rungs are built strictest-first and each is a CONJUNCTION, which makes
  // the order true by construction rather than by assumption:
  //   1  the follower-margin gate AND the product box   (nothing given up)
  //   2  the product box alone                          (the follower's margin given up)
  //   3  the follower-margin/demonstration gate alone   (the PRODUCT BOX given up — reported)
  //   4  the tightest end pose                          (no box at all — reported)
  // When the authored end IS inside its product box, rung 1 is exactly the old
  // rung 1 and nothing about those lessons changes.
  let stopRule = plan.clear ? "max running clearance inside the box" : "min end-pose norm";
  let stopRung = plan.clear ? null : 0;
  let stop = null;
  if (!plan.clear) {
    stop = pickStop(rows, end, box, corridor);
  } else {
    const rungs = [
      [1, gate?.endGateProduct && ctx.endGate ? (cx, cy, psi) => ctx.endGate(cx, cy, psi) && gate.endGateProduct(cx, cy, psi) : ctx.endGate, "max running clearance inside the box, the follower's margin AND the PRODUCT's own park box"],
      [2, gate?.endGateProduct ?? null, "max running clearance inside the box and the PRODUCT's own park box (no row kept the follower's margin as well)"],
      [3, ctx.endGate ?? null, "max running clearance inside the box and the follower-margin gate ONLY — NO row was inside the PRODUCT's own park box, so this stop is outside the box the product credits on"],
    ];
    for (const [n, g, why] of rungs) {
      if (!g) continue;
      stop = pickStop(rows, end, box, corridor, { clearanceAt: ctx.clearanceAt, endGate: g, endRoom: ctx.endRoom });
      if (stop) { stopRule = why; stopRung = n; break; }
    }
    if (!stop) {
      stop = pickStop(rows, end, box, corridor);
      stopRule = "min end-pose norm (NO row was inside both the acceptance box and the product park box)";
      stopRung = 4;
    }
  }
  const kept = stop ? rows.slice(0, stop.k + 1) : rows;
  const worst = kept.reduce((m, row) => Math.max(m, row[7]), 0);
  const inBox = !!stop && stop.norm <= 1 + 1e-9;
  // WHERE THE STOP ACTUALLY LANDED, against BOTH rules that read the box. This is
  // the value that did not exist: every reader could see `endErr` (distance from
  // the AUTHORED end) and none could see whether the product would credit the park
  // or the harness would book the segment UNJUDGED. Consumed by `witnessRecord`
  // (stored on the witness), by the R-segment loop below (a rung-3 or rung-4 stop
  // becomes a build `problem`, which blocks nothing but is printed and stored) and
  // by `path-plan.test.mjs`, which asserts every committed stop is inside both.
  // WHERE THE CAR WILL BE GRADED: the row REST_BACK_M of arc before the witness
  // end, which is where the reverse's own brake leaves it (policy.mjs). Stored as
  // an INDEX as well as a measurement, so a reader — and path-plan.test.mjs — can
  // re-derive it from the rows instead of having to know the constant.
  const gradedRowIndex = kept?.length ? restRowIndex(kept, kept.length - 1) : null;
  const endAt = gate?.parkFrame && kept?.length
    ? (() => {
      const last = kept[gradedRowIndex];
      const q = gate.parkFrame(last[1], -last[2], last[5]);
      return {
        lonM: r(q.lon, 3), latM: r(q.lat, 3), radiusM: r(q.radiusM, 3), headingOffsetDeg: r(q.headingOffsetDeg, 2),
        insideRectangle: gate.endGateProduct ? gate.endGateProduct(last[1], -last[2], last[5]) : null,
        insideRadius: Number.isFinite(gate.parkRadiusTolM) ? q.radiusM <= gate.parkRadiusTolM + 1e-9 : null,
      };
    })()
    : null;
  const endInsideParkBox = endAt ? endAt.insideRectangle === true && endAt.insideRadius === true : null;
  return { ctx, plan, ms: Date.now() - t0, cls: classOf(worst, inBox), worstDevM: worst, rows: kept, stop, start, prof, stopRule, stopRung, endAt, endInsideParkBox, gradedRowIndex };
}

function witnessRecord(res, startAlongM) {
  return {
    startAlongM,
    startPose: { x: r(res.ctx.start.x, 3), z: r(-res.ctx.start.y, 3), psi: r(res.ctx.start.psi, 3) },
    class: res.cls,
    worstDevM: r(res.worstDevM, 3),
    plannerBestDevM: r(res.plan?.best?.maxDev ?? null, 3),
    endErr: res.stop ? { posM: r(res.stop.posErr, 3), yawDeg: r(res.stop.yawErr, 2) } : null,
    // WHERE THE STOP LANDED IN THE PRODUCT'S OWN BOX, by both rules that read it
    // (the product credits on a RECTANGLE, the harness judges on a RADIUS, and a
    // stop outside the radius books the segment UNJUDGED however well it parked).
    endInsideParkBox: res.endInsideParkBox ?? null,
    endParkBox: res.endAt ?? null,
    // THE ROW `endParkBox` MEASURES, and the arc it is back from the witness end.
    // The witness ends where the follower AIMS; the car rests here (policy.mjs
    // REST_BACK_M). Without the index a reader re-deriving the park box from the
    // rows would measure the aim and disagree with the pathref by a third of a metre.
    gradedRowIndex: res.gradedRowIndex ?? null,
    gradedBackM: REST_BACK_M,
    stopRung: res.stopRung ?? null,
    strictParkRetry: res.strictParkRetry ?? null,
    source: res.prof?.source ?? null,
    // WHICH START WON, and what the whole field scored. Without this a reader
    // cannot tell a reproducible multi-start result from a lucky single start.
    clearancePlan: res.plan?.clear
      ? {
        objective: "max min body clearance, deviation <= corridor",
        start: res.plan.clear.start,
        corridorM: r(res.plan.clear.corridorM, 3),
        searchCorridorM: r(res.plan.clear.searchCorridorM, 3),
        plannedClearanceM: r(res.plan.clear.clear, 4),
        starts: res.plan.clear.starts,
        rung: res.plan.clear.rung ?? null,
        lastResort: res.plan.clear.lastResort === true,
        stopRule: res.stopRule ?? null,
        stopClearanceM: r(res.stop?.clearM ?? null, 4),
      }
      : { objective: null, refused: res.plan?.clearRefusal ?? "no clearance objective was supplied for this lesson" },
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
 *
 * THE CORNERS ARE NOW SCREENED AGAINST BODIES TOO (2026-09-16). A leg is ARMED
 * from anywhere in this band — `path-follow.mjs:selectWitness` picks the witness
 * family member, but the CAR starts wherever it stopped — so a corner whose own
 * plan drives through a parked neighbour is a real hole in the committed band,
 * not a theoretical one: at the committed sc-park-left edge lat −0.25 the
 * measured clearance is 0.1394 m, under the 0.15 m floor. A corner that fails
 * the floor is `!ok` exactly as one outside its deviation corridor is, and it
 * takes the same two remedies in the same order — tighten lat/yaw, then pull the
 * along edge in.
 *
 * AND A BODY FAILURE MOVES THE ALONG EDGE EVEN ON A SLICE-0-SCREENED SEGMENT.
 * `screenedBySlice0` records that Slice 0 measured the DEVIATION at those cells;
 * Slice 0 had no body model at all (`planner.mjs` contains "obstacle" zero
 * times), so it is no evidence whatever about clearance and cannot be allowed to
 * freeze a band whose corner drives into a car.
 */
function screenCorners(S, sg, p, witnesses, gate = null) {
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
    const devOk = (x) => x.worstDevM !== null && x.worstDevM <= corridor && x.cls !== INFEASIBLE;
    const bodyOf = (x) => (gate?.mounted && x.rows && x.rows.length ? worstMountedClearance(x.rows, gate.mounted) : null);
    const plan = (q) => planReverseFrom(S, sg, along, lat, yaw, { quick: q, box: p.relaxedBox ?? BOX, gate });
    let res = plan(true);
    let bc = bodyOf(res);
    let mode = "quick";
    if (!(devOk(res) && (bc === null || bc.worst >= BODY_FLOOR_M))) {
      res = plan(false);
      bc = bodyOf(res);
      mode = "full";
    }
    const bodyOk = bc === null || bc.worst >= BODY_FLOOR_M;
    const ok = devOk(res) && bodyOk;
    const why = ok ? null : !devOk(res) ? "deviation" : "body";
    const out = {
      along, lat, yaw, class: res.cls, worstDevM: r(res.worstDevM, 3), corridorM: corridor, mode, ok, why,
      bodyClearanceM: bc ? r(bc.worst, 4) : null, bodyFloorM: bc ? BODY_FLOOR_M : null,
      body: bc?.body ?? null, bodyModel: bc?.model ?? null, bodyAtS: bc ? r(bc.atS, 2) : null,
    };
    say(`    corner along ${along} lat ${lat} yaw ${yaw}: ${res.cls} ${r(res.worstDevM, 3)}${bc ? ` body ${r(bc.worst, 4)} m vs ${bc.body}/${bc.model}` : ""} (${mode}, ${res.ms} ms)${ok ? "" : `  <-- OUTSIDE (${why})`}`);
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
  // ── A BODY HOLE IS ONE-SIDED (2026-09-16) ───────────────────────────────
  // The lat band is declared symmetric, but a neighbour stands on ONE side: at
  // sc-park-wall's along −1 edge the START POSE ITSELF clears the garage wall by
  // 0.325 m at lat −0.15, 0.175 m at lat 0 and 0.025 m at lat +0.15. No planner
  // can repair where the car already is, so the corridor tightening above cannot
  // close this — the band edge on the failing side has to come in, and only that
  // side: clamping both would throw away half a metre of armable band for a hole
  // that is nowhere near it. `clampSide` already moves each side independently;
  // this walks the failing one in until the corner clears or there is no edge
  // left to pull, and reports either way.
  //
  // WHAT THE PULL-IN IS AND IS NOT. A corner fails when the best witness FIVE
  // DETERMINISTIC STARTS CAN FIND from it clears less than the floor. That is a
  // bound on the search, not a proof that no safe plan exists — so a pulled band
  // is CONSERVATIVE, which is the direction to err, and every step records the
  // clearance that forced it so a later, better search can give the band back.
  const pulled = [];
  if (!p.designedNegative) {
    for (let guard = 0; guard < 16; guard++) {
      const bad = corners.filter((c) => !c.ok && c.why === "body");
      if (!bad.length) break;
      const b0 = bad[0];
      const why = `corner ${b0.along}/${b0.lat}/${b0.yaw} body ${b0.bodyClearanceM} m vs ${b0.body}/${b0.bodyModel} under the ${BODY_FLOOR_M} m floor`;
      const pull = (axis, edges, value, step, unit) => {
        const sd = value > 0 ? 1 : value < 0 ? -1 : 0;
        if (sd === 0) return null;
        const idx = sd > 0 ? 1 : 0;
        const from = edges[idx];
        const to = r(sd * Math.max(0, Math.abs(from) - step), 3);
        if (Math.abs(to) >= Math.abs(from) - 1e-9) return null;
        const next = [...edges];
        next[idx] = to;
        say(`    ${axis} edge pulled ${from} -> ${to}${unit} (a body hole on the ${sd > 0 ? "+" : "−"} side; the other edge is left alone)`);
        pulled.push({ axis, from, to, why });
        return next;
      };
      const lat = pull("lat", band.latM, b0.lat, BODY_LAT_STEP_M, " m");
      if (lat) { band = { ...band, latM: lat }; corners = run(band); continue; }
      const yaw = pull("yaw", band.yawDeg, b0.yaw, BODY_YAW_STEP_DEG, "°");
      if (yaw) { band = { ...band, yawDeg: yaw }; corners = run(band); continue; }
      say(`    body hole at lat ${b0.lat} yaw ${b0.yaw} (along ${b0.along}, ${b0.bodyClearanceM} m): no band edge left to pull`);
      break;
    }
  }
  // Slice 0 screened deviation, never a body, so it cannot vouch for a corner that
  // fails the FLOOR — a band whose edge drives into a car must move whatever the
  // §2.4 table says about it.
  const bodyHole = () => corners.some((c) => !c.ok && c.why === "body");
  if ((!p.screenedBySlice0 || bodyHole()) && !p.designedNegative) {
    for (let guard = 0; guard < 8 && corners.some((c) => !c.ok); guard++) {
      const bad = corners.filter((c) => !c.ok);
      const lowBad = bad.some((c) => c.along === band.alongM[0]);
      const next = lowBad ? [r(band.alongM[0] + 0.25, 3), band.alongM[1]] : [band.alongM[0], r(band.alongM[1] - 0.25, 3)];
      if (next[1] - (next[0] + ARM_ROLL_ALLOW_M) < ACCEPT_MIN_WIDTH_M - 1e-9) break;
      const b0 = bad[0];
      moved.push({ from: band.alongM, to: next, why: `corner ${b0.along}/${b0.lat}/${b0.yaw} ${b0.why === "body" ? `body ${b0.bodyClearanceM} m vs ${b0.body}/${b0.bodyModel} under the ${BODY_FLOOR_M} m floor` : `${b0.class} ${b0.worstDevM}`}` });
      say(`    along edge moved ${band.alongM.join("…")} -> ${next.join("…")} (${p.screenedBySlice0 ? "a body hole: Slice 0 screened deviation only" : "unscreened segment: the committed band is whatever survives"})`);
      band = { ...band, alongM: next };
      corners = run(band);
    }
  }
  return { band, corners, tightened, moved, pulled, failed: corners.filter((c) => !c.ok) };
}

/**
 * EVERY COMMITTED STOP THAT MISSES THE PRODUCT PARK BOX, AS A CAVEAT (2026-09-16).
 *
 * Read off the WITNESSES, not off the plan results, so a segment kept by
 * `--reuse-reverse` reports exactly what a freshly planned one does. Two rules read
 * that box and both must hold: the product credits a park on a RECTANGLE
 * (objectives.ts:5792-5795) and the harness judges it on a RADIUS
 * (path-follow.mjs `productParkWitness`), and a stop outside the radius books the
 * segment UNJUDGED — «THE HARNESS MISSED THE BOX» — however well the car parked.
 *
 * It is a CAVEAT and not a `problem`: `lesson-audit.mjs` prints the pathref's
 * caveats into every path drive's run.log, so the drive that will be judged on that
 * stop carries the warning; and a lesson whose own demonstration stops short of its
 * painted bay, whose strict re-plan was measured and could not reach the box, is a
 * permanent property of that lesson rather than a defect in this build.
 *
 * A witness with no `endInsideParkBox` at all is REPORTED as unreadable, never
 * skipped: it means a stop nobody measured against the box the product credits on.
 */
function parkBoxCaveats(outSegs, log, lesson) {
  const out = [];
  for (const sg of outSegs) {
    if (sg.gear !== -1 || !sg.productPark) continue;
    for (const w of sg.witnesses ?? []) {
      if (!w.clearancePlan?.objective) continue; // predates the objective; measured by path-plan.test.mjs
      if (w.endInsideParkBox === undefined || w.endInsideParkBox === null || !w.endParkBox) {
        const why = `park box: seg ${sg.k} R witness ${w.startAlongM}'s stop was NEVER MEASURED against the product park box (no endParkBox on the witness) — UNREADABLE, not clear`;
        out.push(why);
        log(`  !! ${lesson} ${why}`);
        continue;
      }
      if (w.endInsideParkBox !== false) continue;
      const e0 = w.endParkBox;
      const retry = w.strictParkRetry ? `The strict re-plan was tried and declined: ${w.strictParkRetry.why}` : "NO strict re-plan is recorded for this witness.";
      const why = `park box: seg ${sg.k} R witness ${w.startAlongM}'s committed stop is OUTSIDE the product park box — lon ${e0.lonM} lat ${e0.latM} radius ${e0.radiusM} heading ${e0.headingOffsetDeg}°: rectangle ${e0.insideRectangle ? "in" : "OUT"}, radius ${e0.insideRadius ? "in" : "OUT"} (stop rung ${w.stopRung}). The product may not credit the park and the harness may book the segment UNJUDGED — «THE HARNESS MISSED THE BOX». ${retry}`;
      out.push(why);
      log(`  !! ${lesson} ${why}`);
    }
  }
  return out;
}

/**
 * THE BODY SCREEN, RUN OVER WHAT THIS BUILD IS ABOUT TO COMMIT (2026-09-16).
 *
 * `screenCorners` above screens the DEVIATION CORRIDOR — how far a witness
 * strays from the authored line — and `planner.mjs` has no body model at all
 * (the string "obstacle" appears in it zero times). So a witness could be, and
 * seven of the eleven committed ones were, FEASIBLE-TRACK while driving through
 * a parked neighbour: the sc-park-left seg-1 witness the pc-path canary drove
 * crosses `lotlf-bay-4` by 0.16 m for the model that bay actually mounts, and
 * the real drive followed it to 0.014–0.088 m and hit that car.
 *
 * This is the missing constraint, applied at the last possible moment — after
 * the rows are integrated and rounded exactly as they will be stored, so what is
 * screened is what is driven. It writes `bodyClearance` onto every witness, and
 * anything under `BODY_FLOOR_M` BLOCKS THE EMIT: the file is not written at all.
 * Both halves matter; a problem that still ships the file is a report, not a gate.
 */
function runBodyScreen(lesson, outSegs, { bodyHalf, problems, emitBlocked, caveats, log }) {
  if (!bodyHalf) {
    const why = `body screen: ${lesson} was built without a verified fleet half-extent table — refusing to emit witnesses nothing screened against a body (pass bodyHalf from verifiedFleetHalf())`;
    problems.push(why);
    emitBlocked.push(why);
    log(`  !! ${why}`);
    return null;
  }
  let screen;
  try {
    screen = screenPathrefSegments(lesson, outSegs, { half: bodyHalf });
  } catch (err) {
    const why = `body screen REFUSED for ${lesson}: ${err.name === "Unreadable" ? err.message : `${err.name}: ${err.message}`}`;
    problems.push(why);
    emitBlocked.push(why);
    log(`  !! ${why}`);
    return null;
  }
  problems.push(...screen.problems);
  emitBlocked.push(...screen.problems);
  caveats.push(...screen.caveats);
  for (const p of screen.problems) log(`  !! ${p}`);
  for (const c of screen.caveats) log(`  ~  ${c}`);
  const worst = screen.records.reduce((m, x) => (Number.isFinite(x.worstBodyClearanceM) && x.worstBodyClearanceM < m.worstBodyClearanceM ? x : m), { worstBodyClearanceM: Infinity });
  log(`  ${lesson} body screen: ${screen.bodies.length} bodies in ${screen.districtId}, ${screen.records.length} witnesses, worst mounted clearance ${Number.isFinite(worst.worstBodyClearanceM) ? `${worst.worstBodyClearanceM} m against ${worst.mounted?.body}/${worst.mounted?.model}` : "n/a (no body)"} (floor ${BODY_FLOOR_M} m, warn ${BODY_WARN_M} m)`);
  // THE SAMPLING TERM, PRINTED. It was assumed at 0.010 m in BODY_FLOOR_M until
  // 2026-09-16; this is what the screen measures on the rows this build is committing.
  {
    const over = screen.records.map((rec) => rec.sweep?.pointSamplingM).filter(Number.isFinite);
    if (over.length) log(`  ${lesson} swept screen at ${screen.records[0]?.sweep?.spacingM ?? "?"} m: the point screen over-read the worst mounted clearance by up to ${r(Math.max(...over), 4)} m across ${over.length} witness(es) (BODY_FLOOR_M assumed 0.010 m for this until it was measured)`);
  }
  return {
    screen: "body-screen/1",
    districtId: screen.districtId,
    floorM: BODY_FLOOR_M,
    warnM: BODY_WARN_M,
    bodies: screen.bodies.map((b) => ({ id: b.id, kind: b.kind, mountedModel: b.mountedModel ?? null, pooled: b.pooled === true })),
    witnesses: screen.records.map((x) => ({ k: x.k, gear: x.gear, startAlongM: x.startAlongM, verdict: x.verdict, worstBodyClearanceM: x.worstBodyClearanceM, mounted: x.mounted, worstPoolClearanceM: x.worstPoolClearanceM, worstFleetBoxM: x.worstFleetBoxM })),
    worstBodyClearanceM: Number.isFinite(worst.worstBodyClearanceM) ? worst.worstBodyClearanceM : null,
  };
}

/**
 * WHETHER THIS PATHREF MAY BE WRITTEN AT ALL. The one place the decision is made,
 * so it can be unit-tested without running a 45-minute plan: a `problems` entry is
 * a REPORT (the file still ships and the exit code goes red), an `emitBlocked` entry
 * is a REFUSAL (nothing is written and the previous file is left alone).
 */
export function emitDecision(ref) {
  const blocked = ref?.emitBlocked ?? [];
  if (!Array.isArray(blocked)) return { write: false, why: "emitBlocked is not an array — refusing to write a pathref whose gate cannot be read" };
  if (blocked.length) return { write: false, why: `${blocked.length} witness(es) the body screen refuses: ${blocked.join(" | ")}` };
  return { write: true, why: "no emit-blocking problem" };
}

export function buildLesson(lesson, { log = say, reuse = null, bodyHalf = null } = {}) {
  const tracePath = `content/traces/${lesson}/shadow-correct.trace.json`;
  const text = readFileSync(resolve(REPO_ROOT, tracePath), "utf8");
  const doc = JSON.parse(text);
  const S = traceSamples(doc);
  const segs = gearSegments(S);
  const stops = authoredStops(S, segs);
  const problems = [];
  const notes = [];
  /** Park-box misses. They ride on the pathref's own `caveats`, which
   * `lesson-audit.mjs` prints into every path drive's run.log as «CAVEAT: …», so a
   * reader of the drive sees it without opening the pathref. They are NOT
   * `problems`: a lesson whose own demonstration stops short of its painted bay,
   * and whose strict re-plan was measured and could not reach the box, is a
   * permanent property of that lesson and not a defect in this build. The builder
   * failing to ASK for the box would be — and that is a `problem` below. */
  const parkCaveats = [];
  const outSegs = [];
  const emitBlocked = [];
  let prevEnd = null;
  /**
   * THE REVERSES ARE PLANNED FIRST (2026-09-16).
   *
   * A reverse depends only on the trace and its policy row; an APPROACH depends on
   * the reverse, because it is aimed at the band that reverse may be armed from.
   * In one k-ordered pass the approach was planned BEFORE the band existed, so
   * `committedBand` was null unless `--reuse-reverse` happened to supply the last
   * build's, and the aim fell back to the DECLARED band clamped to TIGHT_LAT_M /
   * TIGHT_YAW_DEG — which is neither the band the policy declares nor the one the
   * body screen leaves. Measured on sc-park-45-rev: aimed at that guess (lat
   * 0.112 / yaw −1.125°) the closed-loop bench refused `gear-change-missed` on 2
   * of 4 seeds at yaw +0.01…+0.05° against a 0° band edge and put 2 of 4 stops in
   * the product box; aimed at the committed band (0.188 / −1.875°) it refuses
   * none and puts 4 of 4 in the box, with no tolerance touched.
   *
   * So the loop runs twice, gear −1 first, and `outSegs` is re-sorted by k at the
   * end. `acquireFrom` carries what `prevEnd` used to: the end pose of a
   * designed-negative R segment, keyed by the D segment that acquires from it, so
   * the hand-over survives the re-ordering.
   */
  const committedRev = new Map();
  const acquireFrom = new Map();
  const t0 = Date.now();
  // ── THE CLEARANCE CONSTRAINT, BUILT ONCE PER LESSON (2026-09-16) ─────────
  // The bodies at the size they will MOUNT (the deterministic draw), turned into
  // the same clearance function the emit gate reads back. Reverse witnesses are
  // planned against it; the forward approaches are not (measured 2026-09-16: the
  // worst mounted clearance of every committed FORWARD witness is 0.28 m, above
  // the 0.15 m floor and above the 0.30 m warn band for all but two, while a
  // clearance search over a 100 m approach costs minutes per lesson). The body
  // screen still GATES the forward witnesses, so a future forward regression is
  // refused rather than silently passed — it is just not optimised for.
  let mounted = null;
  let clearAt = null;
  if (bodyHalf) {
    try {
      mounted = mountedBodies(lesson, { half: bodyHalf });
      clearAt = mounted.count ? clearanceFn(mounted) : null;
      log(`  ${lesson} reverse plans score body clearance against ${mounted.count} mounted bodies in ${mounted.districtId} (floor ${BODY_FLOOR_M} m)`);
      if (!mounted.count) notes.push(`${lesson}: its district mounts no body, so the reverse plans were scored on deviation alone`);
    } catch (err) {
      const why = `clearance objective REFUSED for ${lesson}: ${err.name === "Unreadable" ? err.message : `${err.name}: ${err.message}`}`;
      problems.push(why);
      emitBlocked.push(why);
      log(`  !! ${why}`);
    }
  } else {
    notes.push(`${lesson}: built without a verified fleet half-extent table, so the reverse plans were scored on DEVIATION ALONE (the body screen below blocks the emit)`);
  }
  for (const pass of [-1, 1]) for (const sg of segs) {
    const sigma = sg.g;
    if (sigma !== pass) continue;
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
      // ── FORWARD (pass 2) ──
      // Every R segment is already planned, so the band this approach is aimed at
      // is the COMMITTED one (`committedRev`), and the pose a designed-negative
      // predecessor hands over is read back from `acquireFrom`.
      prevEnd = acquireFrom.get(sg.k) ?? null;
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
        // THE BAND THIS BUILD COMMITTED, always — the reverses ran first. On the
        // `--reuse-reverse` path the kept segment IS what `committedRev` holds, so
        // the two can never disagree.
        const committedBand = pol ? committedRev.get(next.k)?.armBand ?? null : null;
        // A symmetric band is aimed at its centre (0).
        //
        // A ONE-SIDED band ([0, e] or [e, 0]) IS NOT ONE RULE, BECAUSE THE TWO AXES DO NOT
        // FAIL THE SAME WAY (measured 2026-09-16, both on the calibrated bench):
        //
        //  · YAW — biased 3/4 of the way to the far edge. The follower is a cross-track
        //    pursuit: a 1° heading difference over the last few metres is ~2 cm of lateral
        //    error, below anything the wheel is moved for, so the car flies straight through
        //    the witness's terminal turn and arrives at whatever heading it already had —
        //    which is the AUTHORED one, i.e. the 0 edge. Aimed at the centre, 3 of 12 stops
        //    read +0.01…+0.17° against a 0° edge; aimed at 3/4 of −2.5°, sc-park-45-rev
        //    reads −0.76…−1.06° on four seeds and refuses none.
        //
        //  · LATERAL — aimed at the band CENTRE, which for a one-sided band is half the far
        //    edge. There is no lag on this axis to bias against: the car tracks the line it
        //    is given to a few centimetres and its stop scatters about the aim in BOTH
        //    directions (sc-park-45-rev lands 0.035 m short of a 0.188 m aim, sc-park-wall
        //    0.039 m past a −0.112 m aim). The 3/4 bias was inherited from the yaw axis and
        //    spent three quarters of the half-width for nothing: on sc-park-wall's
        //    body-pulled [−0.15, 0] it left 0.037 m to the far edge, and the τ_eff × 2 case
        //    (T9.g) came to rest at −0.151 m and refused «arm-roll-out-of-band». Aimed at
        //    the centre the same case rests at −0.028 m, and the four clean seeds move from
        //    −0.101…−0.132 to −0.032…−0.083.
        const far = (edges, lim) => (edges[0] >= 0 ? Math.min(edges[1], committedBand ? Infinity : lim) : Math.max(edges[0], committedBand ? -Infinity : -lim));
        const mid = (edges, lim, bias) => (edges[0] < 0 && edges[1] > 0 ? (edges[0] + edges[1]) / 2 : bias * far(edges, lim));
        const latC = pol ? r(mid((committedBand ?? pol.band).latM, TIGHT_LAT_M, 0.5), 3) : 0;
        const yawC = pol ? r(mid((committedBand ?? pol.band).yawDeg, TIGHT_YAW_DEG, 0.75), 3) : 0;
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

    // ── REVERSE (pass 1) ──
    // `--reuse-reverse`: a reverse segment depends only on the trace and its policy
    // row, never on the approach, so a rebuild of the approaches may keep it —
    // provided the previous pathref was built from the SAME samples.
    const kept = reuse?.segments?.find((x) => x.k === sg.k && x.gear === -1) ?? null;
    if (kept) {
      outSegs.push(kept);
      committedRev.set(sg.k, kept);
      if (kept.designedNegative) {
        const wl = kept.witnesses?.[0]?.rows;
        if (wl?.length) { const last = wl[wl.length - 1]; acquireFrom.set(sg.k + 1, { x: last[1], y: -last[2], psi: last[5] }); }
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
    const park = parkGateFor(lesson, segs, sg.k, { x: e.x, y: e.y, psi: e.psi });
    const gate = clearAt ? { clearanceAt: clearAt, endGate: park.gate, endGateProduct: park.productGate, endRoom: park.productNorm ?? null, parkFrame: park.at ?? null, parkRadiusTolM: PRODUCT[lesson]?.park?.centerTolM ?? null, mounted } : null;
    if (clearAt) {
      log(`  ${lesson} seg${sg.k} R: ${park.why}`);
      if (park.gate && park.authoredInProductBox === false) notes.push(`seg ${sg.k} R: ${park.why}`);
    }
    const witnesses = [];
    for (const g of p.witnessGrid) {
      const res = planReverseFrom(S, sg, g, 0, 0, { box: p.relaxedBox ?? BOX, gate, strictParkRetry: true });
      const mismatch = p.designedNegative ? (res.rows ? null : "the re-planned witness was not found") : expectMatch(p.expect[String(g)], res.cls, res.worstDevM);
      if (mismatch) problems.push(`seg ${sg.k} R grid ${g}: ${mismatch}`);
      // the clearance of the rows AS THEY WILL BE STORED — the number the emit gate reads
      const bc = gate?.mounted && res.rows?.length ? worstMountedClearance(res.rows, gate.mounted) : null;
      // A WITNESS PLANNED WITHOUT THE OBJECTIVE MUST SAY SO. Falling back to the
      // deviation plan in silence is how sc-park-bay-exit-rev shipped a −0.20 m
      // witness through a build that believed clearance had been considered.
      if (res.stopRule && /no row|NO row/.test(res.stopRule)) {
        const why = `seg ${sg.k} R grid ${g}: the stop rule fell back — ${res.stopRule}`;
        notes.push(why);
        log(`  !! ${lesson} ${why}`);
      }
      // A COMMITTED STOP OUTSIDE THE PRODUCT PARK BOX IS REPORTED BY NAME. Both
      // rules must hold: the product credits on the rectangle, the harness judges
      // on the radius, and a stop outside EITHER wastes the drive. This does not
      // block the emit — a lesson whose demonstration itself stops short of its own
      // painted bay cannot be planned into the box — but it can never again be
      // silent, and the witness carries the measurement.
      if (res.strictParkRetry) {
        const why = `seg ${sg.k} R grid ${g}: strict park-box re-plan ${res.strictParkRetry.taken ? "TAKEN" : "declined"} — ${res.strictParkRetry.why}`;
        notes.push(why);
        log(`  ~  ${lesson} ${why}`);
      }
      // the park-box miss is reported from the witnesses (parkBoxCaveats, below), so
      // a reused segment and a freshly planned one say the same thing. What belongs
      // here is the one thing a reused segment cannot be blamed for: this build
      // failing to ASK for the box at all.
      if (res.endInsideParkBox === false && !res.strictParkRetry) {
        problems.push(`seg ${sg.k} R grid ${g}: the committed stop is outside the product park box and NO strict re-plan was attempted — the builder never asked for the box`);
      }
      if (res.plan?.clearRefusal) {
        const why = `seg ${sg.k} R grid ${g}: ${res.plan.clearRefusal}`;
        notes.push(why);
        log(`  !! ${lesson} ${why}`);
      }
      log(`  ${lesson} seg${sg.k} R grid ${g} -> ${res.cls} dev ${r(res.worstDevM, 3)} end ${res.stop ? `${r(res.stop.posErr, 3)} m / ${r(res.stop.yawErr, 2)}°` : "-"}${bc ? ` body ${r(bc.worst, 4)} m vs ${bc.body}/${bc.model}${res.plan?.clear ? ` [start ${res.plan.clear.start}]` : ""}` : ""} (${res.ms} ms)${mismatch ? `  <-- ${mismatch}` : ""}`);
      witnesses.push(witnessRecord(res, g));
      if (p.designedNegative && res.rows) {
        const last = res.rows[res.rows.length - 1];
        acquireFrom.set(sg.k + 1, { x: last[1], y: -last[2], psi: last[5] });
      }
    }
    const screen = screenCorners(S, sg, p, witnesses, gate);
    const cornerWhy = (c) => (c.why === "body"
      ? `body clearance ${c.bodyClearanceM} m against ${c.body}/${c.bodyModel} at s = ${c.bodyAtS} m, under the ${BODY_FLOOR_M} m floor`
      : `${c.class} ${c.worstDevM} outside its ${c.corridorM} m corridor`);
    if (p.designedNegative) for (const c of screen.failed) notes.push("seg " + sg.k + " R (designed negative) corner along " + c.along + " lat " + c.lat + " yaw " + c.yaw + ": " + cornerWhy(c) + " — recorded, not fatal: this segment is graded by Задача 1's zone, not a pose");
    else for (const c of screen.failed) problems.push(`seg ${sg.k} R corner along ${c.along} lat ${c.lat} yaw ${c.yaw}: ${cornerWhy(c)} after the tightened re-screen`);
    const bandRow = { ...screen.band, declared: p.band, corners: screen.corners, tightened: screen.tightened, alongMoved: screen.moved, bodyPulled: screen.pulled };
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
    committedRev.set(sg.k, out);
  }
  // the two passes emitted R before D; everything downstream reads `outSegs` in k order
  outSegs.sort((a, b) => a.k - b.k);
  parkCaveats.push(...parkBoxCaveats(outSegs, log, lesson));
  // THE BODY SCREEN RUNS LAST, over the rows exactly as they will be stored, and
  // writes `bodyClearance` onto each witness in `outSegs` in place.
  const bodyCaveats = [];
  const bodyScreen = runBodyScreen(lesson, outSegs, { bodyHalf, problems, emitBlocked, caveats: bodyCaveats, log });
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
    caveats: [...(CAVEATS[lesson] ?? []), ...bodyCaveats, ...parkCaveats],
    stagedActors: STAGED_ACTORS[lesson] ?? [],
    bodyScreen,
    segments: outSegs,
    buildMs: Date.now() - t0,
    problems,
    /** Non-empty ⇒ the CLI does not write the file. A refusal that still ships is a report, not a gate. */
    emitBlocked,
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
  // THE FLEET TABLE IS RE-MEASURED OFF THE SHIPPED GLBs ONCE, AND REFUSED RATHER
  // THAN DEFAULTED. A build that cannot size the bodies must not emit a witness
  // it screened against a guess, so this throws and the whole run stops.
  const bodyHalf = await verifiedFleetHalf();
  say(`  fleet half extents re-measured off the shipped GLBs (${Object.keys(bodyHalf).length} models)`);
  let failed = 0;
  let blocked = 0;
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
    const ref = buildLesson(lesson, { reuse, bodyHalf });
    if (ref.problems.length) {
      failed += 1;
      for (const pr of ref.problems) say(`  !! ${lesson}: ${pr}`);
    }
    const out = resolve(PATHREF_DIR, `${lesson}.pathref.json`);
    const decision = emitDecision(ref);
    if (!decision.write) {
      blocked += 1;
      say(`  NOT WRITTEN: ${out} — ${decision.why.split(":")[0]}:`);
      for (const b of ref.emitBlocked ?? []) say(`     ${b}`);
      say(`  the previous ${lesson}.pathref.json is left exactly as it was: a plan that drives through a parked car is not committed`);
      continue;
    }
    writeFileSync(out, `${JSON.stringify(ref)}\n`);
    say(`  wrote ${out} (${ref.buildMs} ms${ref.problems.length ? `, ${ref.problems.length} PROBLEM(S)` : ""}${ref.caveats.length ? `, ${ref.caveats.length} caveat(s)` : ""})`);
  }
  if (blocked) say(`\n${blocked} lesson(s) were NOT written: the body screen refused a witness. Re-plan them; do not lower the ${BODY_FLOOR_M} m floor to make them fit.`);
  process.exitCode = failed || blocked ? 1 : 0;
}
