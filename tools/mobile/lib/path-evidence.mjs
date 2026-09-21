// -----------------------------------------------------------------------------
// path-evidence.mjs — WHAT A pc-path LEG DID, MEASURED BY SOMETHING THAT DID NOT
// DRIVE IT.
//
// DESIGN-v2 §8.1. Two kinds of number exist on a path leg and they are never
// mixed:
//
//   INDEPENDENT (of the controller and the pathref witnesses; SAME POSE PROBE) —
//   this file. It reads `guidance.samples[]` written by the UNCHANGED `guidePose`
//   at outer-tick cadence, the lesson's trace, the static policy table and the
//   debrief. It MAY NOT import `path-follow.mjs`, read any `path-refs/*.pathref.json`
//   or read `pathFollow` — pinned by `__tests__/path-evidence.test.mjs`. Its
//   numbers may gate.
//
//   SELF-REPORT — `pathFollow` / `_audit-path.json`, the runner's own books.
//   Diagnostic only. The ONE exception, one direction only: `attributeMistakes`
//   may take named self-report values and use them to move a code TOWARD
//   "harness", never away from it.
//
// WHAT "INDEPENDENT" DOES NOT MEAN (S-10). `guidance.samples` come from
// `guideWitnessRead` → `window.__camProbe`, the same probe the runner steers on.
// A probe that lies about position misleads both. Only the debrief, the
// product's own route hold and the frames on disk are independent of the probe
// too. Every pose-derived number here is published with that suffix.
// -----------------------------------------------------------------------------
import { routeDeviation } from "./guidance.mjs";
import { authoredStops, gearSegments, hx, hy, segmentPoints, traceSamples, wrapDeg } from "./path-plan/geom.mjs";
import { ARM_ROLL_ALLOW_M, CAVEATS, D_FLOOR_KMH, INSERTED_DWELL_S, PRODUCT, R_BAND_KMH, STAGED_ACTORS, acceptAlongOf, bandFor, corridorFor, reversePolicyFor, stopTargetOf } from "./path-plan/policy.mjs";

export const SAME_PROBE = "(independent of the controller; same pose probe)";
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const RAD = Math.PI / 180;

/** Slice 0 segmentation of the trace (§4.2). */
export function gearSegmentsOfTrace(trace) {
  const S = traceSamples(trace);
  return { S, segs: gearSegments(S) };
}

/** Probe-frame unit heading. */
const hp = (psi) => ({ x: Math.sin(psi * RAD), z: -Math.cos(psi * RAD) });
const rp = (psi) => ({ x: Math.cos(psi * RAD), z: Math.sin(psi * RAD) });

/**
 * Samples → runs, BY ORDER (§8.1): a `roll-path` run is the next forward
 * segment, a `reverse` run the next R segment, `stop` samples belong to the
 * preceding run. Consecutive runs of one gear collapse (an authored stop in the
 * middle of an approach does not start a new segment).
 */
export function sampleRuns(samples) {
  const runs = [];
  for (let i = 0; i < (samples ?? []).length; i++) {
    const s = samples[i];
    const gear = s.phase === "reverse" ? -1 : s.phase === "roll-path" ? 1 : s.phase === "stop" ? 0 : null;
    if (gear === null) continue;
    if (gear === 0) {
      if (runs.length) runs[runs.length - 1].idx.push(i);
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last.gear === gear) last.idx.push(i);
    else runs.push({ gear, idx: [i] });
  }
  return runs;
}

/**
 * Align runs with the plan's gear segments. A micro forward segment may leave
 * no run at all; anything else that does not line up is `UNMEASURED — sample
 * runs do not match the plan`, never a guess.
 */
export function alignRuns(samples, segs) {
  const runs = sampleRuns(samples);
  const out = new Map();
  let r = 0;
  for (const sg of segs) {
    const run = runs[r];
    if (!run) break;
    if (run.gear === sg.g) {
      out.set(sg.k, run);
      r += 1;
    } else if (sg.micro) {
      continue;
    } else {
      return { ok: false, why: `UNMEASURED — sample runs do not match the plan (run ${r} is ${run.gear === -1 ? "R" : "D"}, segment ${sg.k} is ${sg.gear})`, runs, byK: new Map() };
    }
  }
  if (r < runs.length) return { ok: false, why: `UNMEASURED — sample runs do not match the plan (${runs.length - r} run(s) beyond the plan)`, runs, byK: new Map() };
  return { ok: true, why: null, runs, byK: out };
}

/** The segment's authored polyline in the probe frame, R extended straight back 3 m, D forward 3 m (§8.1). */
export function segmentPolyline(S, sg, extendM = 3) {
  const pts = segmentPoints(S, sg).map(([x, y]) => [x, -y]);
  if (sg.g === -1) {
    const p0 = S[sg.p0];
    const h = hp(p0.psi);
    const lead = [];
    for (let i = Math.round(extendM / 0.25); i >= 1; i--) lead.push([pts[0][0] + h.x * 0.25 * i, pts[0][1] + h.z * 0.25 * i]);
    return [...lead, ...pts];
  }
  const e = S[sg.i1];
  const h = hp(e.psi);
  const tail = [];
  for (let i = 1; i <= Math.round(extendM / 0.25); i++) tail.push([pts[pts.length - 1][0] + h.x * 0.25 * i, pts[pts.length - 1][1] + h.z * 0.25 * i]);
  return [...pts, ...tail];
}

/**
 * ROUTE PER SEGMENT — the existing `routeDeviation` (guidance.mjs:2180-2239),
 * its own moving predicate (dial > 1), per segment against the authored
 * segment polyline. Corridors come from `policy.mjs`.
 */
export function routeBySegment(samples, trace, lesson) {
  const { S, segs } = gearSegmentsOfTrace(trace);
  const al = alignRuns(samples, segs);
  return segs.map((sg) => {
    const base = { k: sg.k, gear: sg.g, micro: sg.micro, corridorM: corridorFor(lesson, sg.k) };
    if (!al.ok) return { ...base, measured: false, why: al.why };
    const run = al.byK.get(sg.k);
    if (!run) return { ...base, measured: false, driven: false, why: sg.micro ? "micro segment — unmeasured by construction" : "not driven (no samples)" };
    const dev = routeDeviation(run.idx.map((i) => samples[i]), segmentPolyline(S, sg));
    if (!dev) return { ...base, measured: false, driven: true, why: sg.micro ? "micro segment — unmeasured by construction" : "too few moving samples" };
    const corridorOk = Number.isFinite(base.corridorM) ? dev.maxM <= base.corridorM : null;
    return { ...base, measured: true, driven: true, maxM: dev.maxM, medianM: dev.medianM, p90M: dev.p90M, n: dev.n, within: corridorOk };
  });
}

/* THE IN-BAY LATERAL CHECK IS GONE (2026-09-16). `bayLateralOfRun` measured every in-bay
 * sample's LATERAL OFFSET FROM THE BAY AXIS against `policy.mjs BAY_FLANKS` — a PROXY for
 * body clearance, built when nothing in this harness could measure body clearance. Both
 * sides now can (`path-plan/body-screen.mjs` for a plan, `lib/drive-clearance.mjs` for a
 * drive), and the proxy had started to contradict them: it refused the planner's own
 * clearance-maximising witnesses before any contact. It is retired rather than re-tuned —
 * its margin had already been widened twice for the same reason.
 *
 * The witness it used to supply (`routeBySegment[k].bay.within === false`, contact branch
 * 5.1 in `path-follow.mjs contactEvidence`) is now the INJECTED drive-clearance record,
 * which measures the real chassis box against the real mounted bodies at the real heading.
 * This file still may not compute it — its import allow-list is `guidance.mjs`,
 * `policy.mjs`, `geom.mjs` (DESIGN-v2 §8.1) — so it is handed in, exactly as before.
 *
 * `routeBySegment[].within` is therefore the CORRIDOR alone again, and says so. */

/** The arm frame against an authored pose, probe frame. */
function armFrameOf(ref, x, z) {
  const h = hp(ref.psi);
  const rg = rp(ref.psi);
  const dx = x - ref.x;
  const dz = z - ref.z;
  return { alongM: dx * h.x + dz * h.z, latM: dx * rg.x + dz * rg.z };
}

/**
 * THE ARM, BEFORE AND AFTER THE ROLL (N2). Per R run: the last `stop` sample
 * before it (at rest — no sampling error), the FIRST `reverse` sample of it
 * (written on the first tick after the arm, before the runner first acts), the
 * roll between them, and the approach chord yaw from the last two `roll-path`
 * samples ≥ 2 m apart.
 */
export function armPoseFromSamples(samples, trace, lesson) {
  const { S, segs } = gearSegmentsOfTrace(trace);
  const out = [];
  let searchFrom = 0;
  for (const sg of segs.filter((s) => s.g === -1)) {
    const p0 = S[sg.p0];
    const gc = { x: p0.x, z: -p0.y, psi: p0.psi };
    const pol = reversePolicyFor(lesson, sg.k);
    const band = bandFor(lesson, sg.k);
    let first = -1;
    for (let i = searchFrom; i < samples.length; i++) {
      if (samples[i].phase === "reverse" && Number.isFinite(samples[i].wx) && Number.isFinite(samples[i].wz)) { first = i; break; }
    }
    if (first < 0) {
      out.push({ k: sg.k, measured: false, why: "no reverse sample for this segment" });
      continue;
    }
    // The rest before the arm: the LAST at-rest sample before the first reverse one,
    // of whatever phase — when the reducer's dwell elapses inside one runner call the
    // arm gate opens on the very next tick and `continue`s before the stop branch
    // writes a sample (T9 bench, sc-park-judge), so the rest is a `roll-path` sample.
    // A moving sample in between means there was no rest at this gear change.
    let rest = null;
    for (let i = first - 1; i >= searchFrom && i >= 0; i--) {
      if (samples[i].phase === "reverse" || samples[i].kmh > 1) break;
      if (samples[i].kmh >= 0 && samples[i].kmh <= 1 && Number.isFinite(samples[i].wx)) { rest = samples[i]; break; }
    }
    let chordYawDeg = null;
    for (let i = (rest ? samples.indexOf(rest) : first) - 1, b = null; i >= 0; i--) {
      const s = samples[i];
      if (s.phase !== "roll-path" || !Number.isFinite(s.wx)) continue;
      if (!b) { b = s; continue; }
      if (Math.hypot(b.wx - s.wx, b.wz - s.wz) >= 2) {
        const psi = (Math.atan2(b.wx - s.wx, -(b.wz - s.wz)) * 180) / Math.PI;
        chordYawDeg = r2(wrapDeg(psi - gc.psi));
        break;
      }
    }
    const start = armFrameOf(gc, samples[first].wx, samples[first].wz);
    const restF = rest ? armFrameOf(gc, rest.wx, rest.wz) : null;
    const armRollM = restF && !pol?.designedNegative ? r3(restF.alongM - start.alongM) : null;
    const inside = (v, [lo, hi]) => v >= lo - 1e-9 && v <= hi + 1e-9;
    const startInBand = band ? inside(start.alongM, band.alongM) && inside(start.latM, band.latM) : null;
    out.push({
      k: sg.k,
      measured: true,
      restAlongM: restF ? r3(restF.alongM) : null,
      restLatM: restF ? r3(restF.latM) : null,
      startAlongM: r3(start.alongM),
      startLatM: r3(start.latM),
      armRollM,
      chordYawDeg,
      band: band ?? null,
      acceptAlongM: pol && !pol.designedNegative ? acceptAlongOf({ ...pol, band }) : null,
      armRollAllowM: ARM_ROLL_ALLOW_M,
      startInBand,
      rollWithinAllow: armRollM === null ? null : armRollM <= ARM_ROLL_ALLOW_M + 1e-9,
      chordYawOk: chordYawDeg === null ? null : Math.abs(chordYawDeg) <= 2.5,
      designedNegative: pol?.designedNegative === true,
      basis: SAME_PROBE,
    });
    // the next R segment starts after THIS reverse run, not at its second sample
    let end = first;
    while (end + 1 < samples.length && (samples[end + 1].phase === "reverse" || !Number.isFinite(samples[end + 1].wx))) end++;
    searchFrom = end + 1;
  }
  return out;
}

/** The stops the trace demands, with reference poses (probe frame) and tags — independent of the builder. */
export function plannedStops(trace, lesson) {
  const { S, segs } = gearSegmentsOfTrace(trace);
  const stops = [];
  for (const st of authoredStops(S, segs)) {
    if (st.tag === "spawn") continue;
    let ref = { x: st.pose.x, z: -st.pose.y, psi: st.pose.psi };
    let tag = st.tag === "gearChangeD" ? "segmentEnd" : st.tag;
    if (st.tag === "gearChange") {
      const next = segs.find((sg) => sg.k === st.segIndex + 1);
      const pol = next ? reversePolicyFor(lesson, next.k) : null;
      if (next && pol && !pol.designedNegative) {
        const p0 = S[next.p0];
        const target = stopTargetOf({ ...pol, band: bandFor(lesson, next.k) });
        ref = { x: p0.x + target * hx(p0.psi), z: -(p0.y + target * hy(p0.psi)), psi: p0.psi };
        tag = "gearChange";
      }
    }
    const sg = segs[st.segIndex];
    stops.push({ tag, seg: st.segIndex, gear: sg?.g ?? 1, arcM: r2(st.arcM), tSec: r2(st.tSec), dwellS: r2(Math.min(15, Math.max(1, st.dwellS))), ref });
  }
  for (const sg of segs) {
    const next = segs[sg.k + 1];
    if (sg.g === -1 && next && next.g === 1 && !stops.some((s) => s.seg === sg.k && s.tag === "segmentEnd")) {
      const e = S[sg.i1];
      stops.push({ tag: "inserted", seg: sg.k, gear: -1, arcM: r2(e.s), tSec: r2(e.t), dwellS: INSERTED_DWELL_S, ref: { x: e.x, z: -e.y, psi: e.psi } });
    }
  }
  return stops.sort((a, b) => a.arcM - b.arcM);
}

/**
 * THE STOPS, FROM THE OUTER-TICK SAMPLES (C-M10, S-11). Each planned stop is
 * matched to the `kmh === 0` span nearest its reference pose; rest times come
 * from Σ `dtMs`, never from `tSec` (`Math.round(ms/1000)`, lesson-audit.mjs:5753);
 * the signed error is along the direction of travel, + long.
 */
export function stopsFromSamples(samples, trace, lesson) {
  const spans = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].kmh !== 0 || !Number.isFinite(samples[i].wx)) continue;
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].kmh === 0) j++;
    spans.push({ k0: i, k1: j });
    i = j;
  }
  const dt = (k) => (Number.isFinite(samples[k]?.dtMs) ? samples[k].dtMs : 0);
  return plannedStops(trace, lesson).map((st) => {
    let best = null;
    for (const sp of spans) {
      const mid = samples[Math.floor((sp.k0 + sp.k1) / 2)];
      const d = Math.hypot(mid.wx - st.ref.x, mid.wz - st.ref.z);
      if (!best || d < best.d) best = { ...sp, d, mid };
    }
    if (!best || best.d > 6) return { tag: st.tag, seg: st.seg, dwellS: st.dwellS, measured: false, why: best ? `nearest rest span is ${r2(best.d)} m away` : "no kmh === 0 span in the drive" };
    let restLo = 0;
    for (let k = best.k0 + 1; k <= best.k1; k++) restLo += dt(k);
    let restHi = 0;
    for (let k = best.k0; k <= Math.min(samples.length - 1, best.k1 + 1); k++) restHi += dt(k);
    // THE BURSTS RESET THE TICK CLOCK. The arm and disarm branches set `lastTickAt`
    // after a 2–3 s selector burst and `continue`, so that wall time is in NO sample's
    // dtMs, and a gear-change rest reads 0.08 s (T9 bench). Only there, the rounded
    // tSec supplies a bound that can only under-state the rest (difference − 1 s)
    // and one that can only over-state it (difference + 1 s).
    const ts = (k) => (Number.isFinite(samples[k]?.tSec) ? samples[k].tSec : null);
    if (ts(best.k0) !== null && ts(best.k1) !== null) restLo = Math.max(restLo, (ts(best.k1) - ts(best.k0) - 1) * 1000);
    const hiA = ts(Math.max(0, best.k0 - 1));
    const hiB = ts(Math.min(samples.length - 1, best.k1 + 1));
    if (hiA !== null && hiB !== null) restHi = Math.max(restHi, (hiB - hiA + 1) * 1000);
    const motion = st.gear === -1 ? { x: -hp(st.ref.psi).x, z: -hp(st.ref.psi).z } : hp(st.ref.psi);
    const stopErrM = (best.mid.wx - st.ref.x) * motion.x + (best.mid.wz - st.ref.z) * motion.z;
    return { tag: st.tag, seg: st.seg, dwellS: st.dwellS, measured: true, restLoS: r2(restLo / 1000), restHiS: r2(restHi / 1000), stopErrM: r3(stopErrM), distToTargetM: r3(best.d), served: restLo / 1000 >= st.dwellS - 0.6, basis: SAME_PROBE };
  });
}

/** vAuthMove, recomputed HERE from the trace (a cross-check of the builder's, not an import). */
export function authoredMovingMedian(trace, sg) {
  const s = trace.samples;
  const bins = [];
  let arc = 0;
  for (let i = sg.i0; i <= sg.i1; i++) {
    if (i > sg.i0) arc += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    (bins[Math.floor(arc)] ||= []).push(Math.abs(s[i].speedKmh));
  }
  const med = bins.map((b) => {
    const m = (b || []).filter((x) => x > 1).sort((a, c) => a - c);
    return m.length ? m[Math.floor((m.length - 1) / 2)] : null;
  });
  return med.map((v, b) => {
    if (v !== null) return Math.round(v * 100) / 100;
    for (let d = 1; d < med.length; d++) {
      const lo = b - d >= 0 ? med[b - d] : null;
      const hi = b + d < med.length ? med[b + d] : null;
      if (lo !== null || hi !== null) return Math.round(Math.min(lo ?? Infinity, hi ?? Infinity) * 100) / 100;
    }
    return null;
  });
}

/** Projection arc on a polyline (windowed forward in time), for the overshoot and arrival reads. */
function arcAlong(poly, px, pz, fromIdx = 0, windowPts = 60) {
  let best = null;
  let acc = 0;
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  for (let i = Math.max(0, fromIdx - 4); i < Math.min(poly.length - 1, fromIdx + windowPts); i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const L2 = vx * vx + vz * vz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2)) : 0;
    const d = Math.hypot(ax + t * vx - px, az + t * vz - pz);
    if (!best || d < best.d) best = { d, idx: i, arc: cum[i] + t * Math.sqrt(L2) };
  }
  acc = cum[cum.length - 1];
  return best ? { ...best, total: acc } : null;
}

/**
 * THE HARNESS EXCEEDING ITS OWN DECLARED ENVELOPE (C-M10). D: max(vAuthMove, 3);
 * R: the band top (3.7). The dial is integer-rounded, which the 2 km/h
 * attribution tolerance covers.
 */
export function overshootFromSamples(samples, trace, lesson) {
  const { S, segs } = gearSegmentsOfTrace(trace);
  const al = alignRuns(samples, segs);
  if (!al.ok) return segs.map((sg) => ({ k: sg.k, gear: sg.g, micro: sg.micro, measured: false, why: al.why }));
  return segs.map((sg) => {
    const run = al.byK.get(sg.k);
    if (!run) return { k: sg.k, gear: sg.g, micro: sg.micro, measured: false, why: "no samples" };
    const envelopeKind = sg.g === -1 ? `bandHiR ${R_BAND_KMH.hi}` : `max(vAuthMove, ${D_FLOOR_KMH})`;
    const prof = authoredMovingMedian(trace, sg);
    const poly = segmentPoints(S, sg).map(([x, y]) => [x, -y]);
    let worst = 0;
    let atArcM = null;
    let from = 0;
    for (const i of run.idx) {
      const s = samples[i];
      if (!(s.kmh > 1) || !Number.isFinite(s.wx)) continue;
      const pr = arcAlong(poly, s.wx, s.wz, from);
      if (!pr) continue;
      from = pr.idx;
      const env = sg.g === -1 ? R_BAND_KMH.hi : Math.max(prof[Math.min(prof.length - 1, Math.floor(pr.arc))] ?? D_FLOOR_KMH, D_FLOOR_KMH);
      if (s.kmh - env > worst) {
        worst = s.kmh - env;
        atArcM = r2(S[sg.p0].s + pr.arc);
      }
    }
    return { k: sg.k, gear: sg.g, micro: sg.micro, measured: true, overshootKmh: r2(worst), atArcM, envelope: envelopeKind, basis: SAME_PROBE };
  });
}

/**
 * ARRIVAL LAG at a staged actor (C-M10). Wall Σ dtMs from the first sample of
 * the segment's run to the sample nearest the actor's authored arc, minus the
 * authored time between the same two points. Drained pauses are excluded
 * (`lastTickAt` resets at the drain). Over-states world time when frames are
 * slow, which fails closed — toward "harness".
 */
export function arrivalLagFromSamples(samples, trace, lesson) {
  const actors = STAGED_ACTORS[lesson] ?? [];
  if (!actors.length) return [];
  const { S, segs } = gearSegmentsOfTrace(trace);
  const al = alignRuns(samples, segs);
  return actors.map((a) => {
    const base = { actor: a.actor, arcM: a.arcM, lagBasis: "wall Σ dtMs since first roll-path sample; pause drains excluded" };
    if (!Number.isFinite(a.arcM) || a.seg === null) return { ...base, lagWallS: null, why: `no authored arc for this actor (${a.src})` };
    if (!al.ok) return { ...base, lagWallS: null, why: al.why };
    const sg = segs[a.seg];
    const run = al.byK.get(a.seg);
    if (!sg || !run) return { ...base, lagWallS: null, why: "the actor's segment was not driven" };
    const poly = segmentPoints(S, sg).map(([x, y]) => [x, -y]);
    const segArc0 = S[sg.p0].s;
    let nearest = null;
    let from = 0;
    for (const i of run.idx) {
      const s = samples[i];
      if (!Number.isFinite(s.wx)) continue;
      const pr = arcAlong(poly, s.wx, s.wz, from);
      if (!pr) continue;
      from = pr.idx;
      const d = Math.abs(segArc0 + pr.arc - a.arcM);
      if (!nearest || d < nearest.d) nearest = { d, i };
    }
    if (!nearest || nearest.d > 3) return { ...base, lagWallS: null, why: "no sample within 3 m of the actor's arc" };
    let wallMs = 0;
    for (const i of run.idx) {
      if (i > nearest.i) break;
      if (i === run.idx[0]) continue;
      wallMs += Number.isFinite(samples[i].dtMs) ? samples[i].dtMs : 0;
    }
    let iMove = sg.i0;
    while (iMove < sg.i1 && Math.abs(S[iMove].v) <= 1) iMove++;
    let iArc = sg.i0;
    while (iArc < sg.i1 && S[iArc].s < a.arcM) iArc++;
    const authoredS = S[iArc].t - S[iMove].t;
    return { ...base, lagWallS: r2(wallMs / 1000 - authoredS) };
  });
}

/** «подравняване» and «(отместване X м, ъгъл Y°)», comma decimals allowed; absent is null, never 0. */
export function parseParkDebrief(debrief) {
  if (!debrief || typeof debrief !== "object") return { credited: null, alignment: null, centerOffsetM: null, headingOffsetDeg: null, src: "debrief absent" };
  const objectives = Array.isArray(debrief.objectives) ? debrief.objectives : [];
  const park = objectives.find((o) => /подравняване|Паркир|паркир|мястото|гнездо/u.test(String(o?.titleBg ?? "")));
  const alignM = objectives.map((o) => String(o?.titleBg ?? "").match(/подравняване:\s*(центрирано|приемливо|неточно)/u)).find(Boolean);
  const sections = debrief.sections ?? {};
  const rubricText = sections['section[aria-label="Оценка на маневрата"]']?.text ?? null;
  const num = (s) => (s === undefined || s === null ? null : Number(String(s).replace(",", ".")));
  const m = rubricText ? rubricText.match(/отместване\s+([\d.,]+)\s*м,\s*ъгъл\s+([\d.,]+)\s*°/u) : null;
  return {
    credited: park ? park.done === true : null,
    parkObjective: park ? park.titleBg : null,
    alignment: alignM ? alignM[1] : null,
    centerOffsetM: m ? num(m[1]) : null,
    headingOffsetDeg: m ? num(m[2]) : null,
    headingMagnitudeOnly: true,
    src: "debrief",
  };
}

/** What the reference used, so an omission can be charged to the harness only where the reference did it (§8.2). */
export function proceduralChannels(trace) {
  const s = trace?.samples ?? [];
  const ev = trace?.events ?? [];
  const indicatorSamples = s.filter((x) => x.indicator && x.indicator !== "off").length;
  const kinds = {};
  for (const e of ev) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  return {
    indicatorSamples,
    events: kinds,
    usedIndicator: indicatorSamples > 0 || (kinds["signal-on"] ?? 0) > 0,
    usedGlances: Object.keys(kinds).some((k) => k.startsWith("glance")),
  };
}

const RE_COLLISION = /удар|притисн/iu;
const RE_PROCEDURAL = /мигач|огледал|без оглед|през рамо|поглед|светлин/iu;
const RE_TIMING = /стоп|спир|пропуск|предимств|пешеход|скорост|светофар|червен|сигнал/iu;

/**
 * ATTRIBUTION (C-M10, S-2). The TIMING/ACTUATION release is computed from
 * INDEPENDENT values FIRST AND ALONE; self-report can then only flip a released
 * code back to "harness", never release one. A missing or malformed
 * self-report object changes nothing.
 *
 * AN UNMEASURED VALUE IS A REASON NOT TO RELEASE, NEVER A PASS (CODE-REVIEW-2 M3).
 * `Math.abs(null) === 0`, so the v1 test released a pedestrian code on an arrival
 * nobody measured; and a `measured: false` speed or forward route was skipped. Every
 * value the release rests on must be a finite, measured number. The one exemption is
 * a MICRO square-up (≤ 1 m), which is unmeasured by construction.
 */
export function attributeMistakes(mistakes, rubric, trace, indep, selfReportMayOnlyBlame = null) {
  const list = Array.isArray(mistakes) ? mistakes.map(String) : [];
  const ch = proceduralChannels(trace);
  const out = { proceduralOmission: [], timingActuation: [], collisionCandidates: [], other: [], release: null };
  // ── the independent release ──
  const reasons = [];
  for (const st of indep?.stops ?? []) {
    if (st.measured === false) { reasons.push(`stop ${st.tag} was not measured`); continue; }
    if (!(Math.abs(st.stopErrM) <= 0.5)) reasons.push(`stop ${st.tag} ${r2(st.stopErrM)} m ${st.stopErrM > 0 ? "long" : "short"}`);
    if (!(st.restLoS >= st.dwellS - 0.6)) reasons.push(`stop ${st.tag} rested ${st.restLoS} s against a ${st.dwellS} s dwell`);
  }
  for (const sp of indep?.speed ?? []) {
    if (sp.micro === true && sp.measured !== true) continue;
    if (sp.measured !== true || !Number.isFinite(sp.overshootKmh)) { reasons.push(`speed on segment ${sp.k ?? "?"} was not measured${sp.why ? ` (${sp.why})` : ""}`); continue; }
    if (!(sp.overshootKmh <= 2)) reasons.push(`speed ${r2(sp.overshootKmh)} km/h over the envelope at ${sp.atArcM} m`);
  }
  const actors = indep?.arrivals ?? [];
  for (const a of actors) {
    if (!Number.isFinite(a?.lagWallS)) { reasons.push(`arrival at the ${a?.actor ?? "staged actor"} unmeasured${a?.why ? ` (${a.why})` : ""}`); continue; }
    if (!(Math.abs(a.lagWallS) <= 3)) reasons.push(`arrival at the ${a.actor} ${a.lagWallS} s late`);
  }
  for (const sg of indep?.routeBySegment ?? []) {
    if (sg.gear !== 1) continue;
    if (sg.micro === true && sg.measured !== true) continue;
    if (sg.measured !== true || !Number.isFinite(sg.maxM) || !Number.isFinite(sg.corridorM)) { reasons.push(`forward segment ${sg.k} route was not measured${sg.why ? ` (${sg.why})` : ""}`); continue; }
    if (sg.maxM > sg.corridorM) reasons.push(`forward segment ${sg.k} left its corridor (${sg.maxM} > ${sg.corridorM} m)`);
  }
  if (!indep || !Array.isArray(indep.stops)) reasons.push("no independent stop evidence");
  if (indep && !Array.isArray(indep.speed)) reasons.push("no independent speed evidence");
  let released = reasons.length === 0;
  let label = released ? "released (independent)" : `HARNESS — independent: ${reasons[0]}`;
  // ── self-report, one direction only ──
  if (released && selfReportMayOnlyBlame && typeof selfReportMayOnlyBlame === "object") {
    const sr = selfReportMayOnlyBlame;
    const blame = [];
    if (Array.isArray(sr.blindGapM)) for (const g of sr.blindGapM) if (g && Number.isFinite(g.m) && g.m > 0.3 && Number.isFinite(g.distToStopM) && g.distToStopM <= 20) blame.push(`blind gap ${r2(g.m)} m ${r2(g.distToStopM)} m before a stop`);
    if (Array.isArray(sr.stopErrM)) for (const e of sr.stopErrM) if (Number.isFinite(e) && Math.abs(e) > 0.5) blame.push(`runner stop error ${r2(e)} m`);
    if (Array.isArray(sr.arrivalLagWorldS)) for (const e of sr.arrivalLagWorldS) if (Number.isFinite(e) && Math.abs(e) > 3) blame.push(`world-time arrival lag ${r2(e)} s`);
    if (Array.isArray(sr.stopLate)) for (const e of sr.stopLate) if (e) blame.push(`a stop ended by coasting (${e})`);
    if (blame.length) {
      released = false;
      label = `HARNESS — self-report only: ${blame[0]}`;
    }
  }
  out.release = { released, label, independentReasons: reasons };
  for (const m of list) {
    if (RE_COLLISION.test(m)) {
      out.collisionCandidates.push({ code: m, label: "CANDIDATE — the authored line's clearance to walls/cones/parked cars was never screened (Slice 0 §11); needs the frame and an in-process replay check" });
    } else if (RE_PROCEDURAL.test(m)) {
      const channelUsed = /мигач/iu.test(m) ? ch.usedIndicator : /светлин/iu.test(m) ? true : ch.usedGlances;
      if (channelUsed) out.proceduralOmission.push({ code: m, label: "THE HARNESS's omission, not a conviction of a correct drive" });
      else out.other.push({ code: m, label: "judge normally — the reference never used this channel either" });
    } else if (RE_TIMING.test(m)) {
      out.timingActuation.push({ code: m, label: released ? "released (independent) — judge normally" : `HARNESS TIMING/ACTUATION — may be this instrument's (${label})` });
    } else {
      out.other.push({ code: m, label: "judge normally" });
    }
  }
  for (const item of Array.isArray(rubric) ? rubric.map(String) : []) {
    if (/Огледала и рамо|оглед|рамо/iu.test(item)) out.proceduralOmission.push({ code: item, label: "rubric observation moment — THE HARNESS does not look; not a conviction of a correct drive" });
  }
  if ((indep?.routeHold?.crashPinnedTicks ?? 0) > 0) out.collisionCandidates.push({ code: `crashPinnedTicks ${indep.routeHold.crashPinnedTicks}`, label: "CANDIDATE — the product held the car crash-pinned; needs the frame" });
  return out;
}

/**
 * THE DRIVE-CLEARANCE RECORD THIS FILE DID NOT COMPUTE.
 *
 * The safety question a corridor stopped answering on 2026-09-16 is "did the
 * car's BODY clear the bodies the lesson mounts?", and it needs three things the
 * corridor never touches: the poses the drive produced, the district's occupied
 * bays, and the swept OBB screen. This file may read NONE of them - its import
 * allow-list is `guidance.mjs`, `policy.mjs` and `geom.mjs`, pinned by
 * `__tests__/path-evidence.test.mjs`, precisely so that nothing it publishes can
 * be traced back to the runner's own books or to the witness it is judging.
 *
 * So the record is INJECTED. `lib/drive-clearance.mjs` computes it, the caller
 * (`lesson-audit.mjs`, `leg-evidence.mjs`, `path-canary.mjs`) hands it in, and
 * this object carries it so every reader of `pathEvidence` sees it. The
 * PREDICATE lives with the measurement, in `drive-clearance.mjs
 * driveClearanceGate`, so the canary's gate and this object can never disagree
 * about the same drive.
 *
 * AN ABSENT RECORD IS NOT A PASS. When nobody supplies one the value below is
 * carried instead, and `driveClearanceGate` fails on it by name.
 */
export const DRIVE_CLEARANCE_NOT_SUPPLIED = Object.freeze({
  screen: "drive-clearance/1",
  measured: false,
  verdict: "unmeasured",
  worstM: null,
  requiredM: null,
  why: "no pose record was handed to computePathEvidence - this file may not read the runner's own pose ledger (DESIGN-v2 8.1), so the caller supplies the measurement; an absent record is UNMEASURED, never clear",
});

/**
 * EVERYTHING INDEPENDENT, IN ONE OBJECT — what lesson-audit writes as
 * `pathEvidence` and what leg-evidence recomputes from raw sidecars.
 */
export function computePathEvidence({ samples = [], trace, lesson, debrief = null, mistakes = null, rubric = null, routeHold = null, routeHoldBySegment = null, selfReportMayOnlyBlame = null, driveClearance = null }) {
  const route = routeBySegment(samples, trace, lesson);
  const arms = armPoseFromSamples(samples, trace, lesson);
  const stops = stopsFromSamples(samples, trace, lesson);
  const speed = overshootFromSamples(samples, trace, lesson);
  const arrivals = arrivalLagFromSamples(samples, trace, lesson);
  const productPark = parseParkDebrief(debrief);
  const indep = { stops, speed, arrivals, routeBySegment: route, routeHold };
  return {
    kind: `INDEPENDENT ${SAME_PROBE}`,
    lesson,
    routeBySegment: route,
    arms,
    stops,
    speed,
    arrivals,
    routeHoldBySegment,
    productPark,
    driveClearance: driveClearance ?? DRIVE_CLEARANCE_NOT_SUPPLIED,
    attribution: attributeMistakes(mistakes, rubric, trace, indep, selfReportMayOnlyBlame),
    caveats: CAVEATS[lesson] ?? [],
    product: PRODUCT[lesson] ?? null,
  };
}
