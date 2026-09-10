#!/usr/bin/env node
/**
 * route-fidelity.mjs — DID THE CAR DRIVE THE LESSON?
 *
 * WHY THIS FILE EXISTS, MEASURED.
 *
 * `_audit-status.json` already publishes `guidance.tracking.verdict` —
 * tracked / intermittent / blind / wandered. That verdict is computed from
 * `errDeg`: the BEARING to a look-ahead point on the guidance ribbon, read by
 * the same pixel scan that drove the wheel. It is the control law grading its
 * own error signal, on a centreline that is locally straight, and it has never
 * once measured whether the car was where the lesson wanted it.
 *
 * The honest number was recomputed over w30–w33 — 398 lanes, 279 of them
 * carrying both a pose witness and a shadow trace:
 *
 *     tracked        77 lanes — 44 of them over 3 m off the correct line, 18 never reached 70%
 *     intermittent  125 lanes — 112 off, 40 short
 *     blind          56 lanes —  53 off, 29 short
 *     wandered       21 lanes —  21 off, 17 short
 *
 * Median max cross-track across all 279: 13.8 m. p90: 92.3 m.
 * `sc-junction-rhr/pc-right` was certified `tracked` at 37.5 m off the line.
 * `sc-rb-busy-gap` never exceeds 47% route coverage on ANY of its eight lanes.
 *
 * A verdict that says "tracked" for a car 37.5 m off the demonstrated correct
 * line is not a weak measurement, it is a measurement of something else. The
 * blind spot is in BOTH existing legs, and lesson-audit.mjs:7766 already NAMES
 * this metric — "cross-track distance IN METRES from the product's own
 * recorded correct drive … and it needs no rerun". Nobody computed it. This is
 * that computation.
 *
 * WHAT IT JOINS. Two artefacts that are already on disk:
 *
 *   · `_audit-status.json` → `guidance.samples[].wx/.wz` — the chassis pose,
 *     read from `window.__camProbe` every tick, INDEPENDENT of the pixel scan
 *     that steered the car (that independence is the whole point: an error in
 *     the ribbon test moves the car and the number grading it in the same
 *     direction, but it cannot move the chassis probe).
 *   · `content/traces/<lesson>/shadow-correct.trace.json` — 20 Hz `x,y` of a
 *     drive whose own validation rule is "must replay with ZERO violations".
 *
 * FRAME. The trace is in district coordinates, the probe in world coordinates,
 * and they differ by exactly one sign: `y = −z` (LessonScene.tsx:597, restated
 * verbatim in `guidance.witness.frame`). Everything below works in the TRACE
 * frame, so a pose `(wx, wz)` enters as `(x = wx, y = −wz)`.
 *
 * ── THREE SPEC CORRECTIONS, EACH FOUND BY SOMETHING BEING WRONG ────────────
 *
 * 1. COVERAGE IS A FRACTION OF ARC LENGTH, NOT OF SAMPLE INDEX. Trace samples
 *    are recorded at a fixed 20 Hz, which means they are dense where the car
 *    was slow and sparse where it was fast — they are NOT uniformly spaced in
 *    metres. The prototype divided the nearest sample's INDEX by the sample
 *    count and read 0.881 on a lane whose true distance fraction was ~0.97.
 *    An index fraction is a fraction of the shadow car's TIME, dressed up as a
 *    fraction of its route, and it under-reports exactly where the student car
 *    is fast — the end of a straight. `cum[]` below is metres, always.
 *
 * 2. A LANE WITH FEWER THAN `MIN_POSES` POSED SAMPLES RETURNS `no-witness`,
 *    NEVER A NUMBER. This is the same defect the witness itself was fixed for:
 *    a drive that travelled ~90 m once published "path 3 m net 3 m" because
 *    the loop stopped scanning after three ticks. A cross-track computed over
 *    two ticks is a measurement of two ticks, and it reads SMALL — the
 *    reassuring direction — because the car has not had time to leave the
 *    spawn. Publishing `null` costs a reader one branch; publishing 0.4 m
 *    costs them the finding.
 *
 * 3. COVERAGE MUST BE EARNED BY DRIVING, NOT BY PROJECTING. The poses may not
 *    span more arc than the witness shows the car travelling — beyond what a
 *    chord sum at that sampling density can legitimately understate, which was
 *    MEASURED on all 167 shadow routes rather than assumed. See
 *    `ARC_PER_DRIVEN_SLOPE`, which carries the table, the binding case, and the
 *    four cheaper rules that were tried first and refuted. Corpus cost of the
 *    guard: 2 lanes of the 3,435 the sweep could measure, and both of them are
 *    `sc-pk-driveway`.
 *
 *    IT IS NOT MERELY «THE HAIRPIN LESSON», AND THE DIFFERENCE MATTERS. Three
 *    routes come closer to themselves than this one does at ten metres of arc
 *    separation — `sc-ed-poligon-chain` (0.001 m), `sc-ed-reverse-line`
 *    (0.021 m), `sc-maneuver-3point` (0.115 m), against `sc-pk-driveway`'s
 *    0.859 m — and not one of their lanes is refused. The guard does not fire
 *    on routes that CAN saddle; it fires on lanes whose certification was
 *    actually built on the jump. That is the difference between a rule aimed at
 *    the mechanism and a rule fitted to a lane.
 *
 * ── TWO CONTROLS THAT SAY THE METRIC IS HONEST AND NOT FLATTERING ──────────
 *
 * Both are reproduced by the unit tests, because a metric that only ever
 * reports badness is as uninformative as one that only ever reports good.
 *
 *   · LANES READING EXACTLY 0.00 m EXIST AND ARE REAL. `sc-mw-emergency-lane/
 *     mobile-right` is one: the correct line is dead straight at x = 0 and the
 *     car held x = 0.00. Easy, not fake.
 *   · THE BEST LANES CLUSTER AT 0.00–0.5 m WITH HIGH COVERAGE. Counted on the
 *     2026-09-10 sweep: 219 on-line lanes hold inside half a metre, and their
 *     coverage runs 72–100% with a median of 91% and an interquartile range of
 *     86–96%. 161 lanes read EXACTLY 0.00 m. The loop demonstrably CAN do this
 *     where the road is straight, so a bad number is a statement about that
 *     lane and not about this file.
 *
 * If a reimplementation cannot reproduce both, it is measuring something else.
 *
 * ── WHAT «COVERAGE» MEANS HERE ─────────────────────────────────────────────
 *
 * The furthest point along the shadow polyline that any posed sample projects
 * onto, as a fraction of the polyline's total arc length. It answers "how far
 * down the lesson's route did this car get", which is why a drive can be
 * perfectly on-line and still fail: `sc-rb-busy-gap` sits on the line and
 * stops at 47%.
 *
 * It is deliberately NOT gated on a corridor. A gate would fold two
 * independent facts — "how far" and "how far off" — into one number, and the
 * threshold would then be arguable in both directions. They stay separate and
 * the VERDICT combines them, where the combination is legible.
 *
 * Ties in the projection resolve to the EARLIEST arc length (the scan keeps
 * the first strict minimum). On a closed loop the start point is at distance 0
 * from both the first metre and the last, and resolving that tie forward would
 * hand a car that never left the spawn a coverage of 1.00.
 *
 * THE ONE WAY COVERAGE CAN READ HIGH, NAMED SO NOBODY HAS TO REDISCOVER IT.
 * A car that has left the road entirely still projects SOMEWHERE, and on a
 * route that doubles back — a roundabout — that somewhere can be further along
 * than the car ever drove. Measured: `w32/sc-rb-busy-gap__mobile-right` crawls
 * east at y = 8.1 while 28 m off the line, and every one of its last thirty
 * poses pins to the same saddle point at 62.7%, against 47–48% on the other
 * seven lanes of that lesson.
 *
 * THIS PARAGRAPH USED TO END «The VERDICT is unaffected — 28 m is off-route by
 * cross-track and that clause wins». THAT WAS FALSE, and the counter-example is
 * `rebase/sc-pk-driveway__pc-right`, which read `on-line · maxCrossTrackM 2.95 ·
 * cov 86% · route 44 m · posesUsed 13`. The saddle does not need the car to be
 * far off the line. It needs the ROUTE to come back near itself, and this one
 * does: `sc-pk-driveway` runs north at x = 4.06 to y = 50.55 (s = 36 m), turns
 * around, and comes back south at x ≈ 3.9. Measured on the trace, that route
 * passes within 0.017 m of itself at two points 6.5 m apart in arc. The lane's
 * last pose sits at (0.97, 48.33): its nearest point on the OUTBOUND leg is
 * 3.0045 m away at s = 32.44, its nearest point on the RETURN leg 2.9517 m away
 * at s = 37.98, and those two feet are 0.193 m apart in space. Five centimetres
 * of distance decided 5.5 m of arc, and that one pose carried the lane from 64%
 * to 86% coverage — over the 70% census cut and, at 2.95 m, under the 3 m
 * on-line band. Both clauses were cleared by a projection, not by a drive.
 *
 * A comment that asserts a property the code does not have is worse than no
 * comment, so the property now exists: SPEC CORRECTION 3 below, the ceiling on
 * arc claimed per metre driven. What survives of the old paragraph is the part
 * that was true — the coverage FIELD is meaningless for a lane that is not near
 * the line, and quoting it alone would flatter that drive. Read the two numbers
 * together, which is what the verdict does.
 *
 * ── USE ───────────────────────────────────────────────────────────────────
 *
 *   node tools/audit/route-fidelity.mjs <path/to/_audit-status.json>
 *   node tools/audit/route-fidelity.mjs <path> --json
 *   node tools/audit/route-fidelity.mjs --corpus            # every stored wave, JSONL
 *   node tools/audit/route-fidelity.mjs --corpus --root .audit-frames/w33
 *   node tools/audit/route-fidelity.mjs --corpus --summary  # + a distribution to stderr
 *
 * IT IS A MODULE FIRST. `lesson-audit.mjs` is meant to import `routeFidelity`
 * and publish the same four numbers at the end of a drive. Duplicated geometry
 * is how two numbers that describe one fact drift apart, and this audit has
 * already paid for that once.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * THE FLOOR ON EVIDENCE. Ten posed samples at ~1 Hz is ten seconds of drive.
 * Below that the answer is "this lane did not leave a witness", not a number.
 */
export const MIN_POSES = 10;

/**
 * THE VERDICT BANDS. Named, exported and overridable, because they are a
 * POLICY and the geometry above them is not — a reader who disagrees with 3 m
 * should be able to move it without touching a projection.
 *
 *   onLineM     3.0 — the shadow trace is a drive IN ITS LANE, not a
 *                     centreline, so 3 m is about one lane width. A car more
 *                     than a lane off the demonstrated correct path is not on
 *                     that path by any reading.
 *   offRouteM  10.0 — three lane widths. At this distance the car is off the
 *                     carriageway the lesson routes it down, and no finding
 *                     about how it drove the lesson can be drawn from it.
 *   coverageMin 0.7 — the census cut. A car that saw 47% of its route did not
 *                     do the lesson, however neatly it sat on the first half.
 */
export const DEFAULT_BANDS = Object.freeze({
  onLineM: 3.0,
  offRouteM: 10.0,
  coverageMin: 0.7,
});

/**
 * THE CEILING ON ARC CLAIMED PER METRE DRIVEN — the saddle guard.
 *
 * Coverage is the furthest point the poses PROJECT onto. On a route that comes
 * back near itself, the foot can jump forward by metres of arc the car never
 * drove (see the saddle note in the header). So the claim is checked against
 * the drive: `arcPerDriven = (furthest foot − nearest foot) / metres travelled`.
 * A car that really drove the route reads ~1.00.
 *
 * IT CANNOT BE A FLAT 1.0, BECAUSE THE WITNESS PATH IS A CHORD SUM. Poses are
 * ~1 Hz and the route between two of them is a curve, so the chord is shorter
 * than the arc and an honest drive reads slightly over 1. HOW MUCH slightly is
 * not a guess — it was measured, by taking each of the 167 shadow traces,
 * resampling it every Δ metres of arc (a PERFECT student, driving exactly the
 * correct line), and projecting that student back onto its own route:
 *
 *     Δ (m/pose)    1      2      3      4      5      6      8     10     15     20
 *     worst of 167  1.039  1.071  1.113  1.152  1.235  1.072  1.092  1.114  1.201  1.237
 *     1 + 0.05·Δ    1.050  1.100  1.150  1.200  1.250  1.300  1.400  1.500  1.750  2.000
 *
 * (Δ ≥ 6 drops the short manoeuvre routes because they can no longer yield the
 * MIN_POSES samples this file requires; from there `sc-ed-poligon-chain`, 393 m,
 * sets the envelope. The binding case is Δ = 5 m on `sc-maneuver-3point`: it
 * demands a slope of at least 0.2352/5 = 0.0470, against 0.039 at Δ = 1 and
 * 0.038 at Δ = 3. 0.05 is therefore the SMALLEST two-decimal slope that covers
 * the measurement, not a round number picked for comfort.)
 *
 * WHY A SLOPE AND NOT A CONSTANT, MEASURED. The flat ceiling would have to be
 * 1.24 to clear `sc-maneuver-3point`, and `rebase/sc-pk-driveway__pc-right` —
 * the lane this guard exists for — reads 1.207. A constant lets it through. At
 * its OWN pose spacing of 2.19 m the ceiling is 1.110, and 1.207 clears it by
 * ten points. Sampling density is the variable the inflation actually depends
 * on, so it is the variable the ceiling is written in.
 *
 * WHAT WAS TRIED FIRST AND REFUTED, so nobody re-proposes it:
 *
 *   · A POSE-DENSITY FLOOR (poses per metre of route) — the first thing the
 *     defect report proposed. Measured over the 544 on-line lanes of the
 *     pre-guard sweep: p1 = 0.083 poses/m, median 0.298. The bad lane reads
 *     0.296. It is AT the population median; a floor that catches it demotes
 *     half the corpus.
 *   · POSES PER METRE OF WITNESS PATH. On-line p1 = 0.092, median 0.359. The
 *     bad lane reads 0.494 — ABOVE the median. Same refutation, harder.
 *   · A SPAN FLOOR (poses must span the covered arc). The bad lane spans 72.2%
 *     of its route; on-line p10 is 73.5%. A floor that catches it costs ~54
 *     honest lanes, and it is not the mechanism anyway.
 *   · A PER-STEP arc/chord cap. Refuted by the same perfect-student experiment:
 *     on `sc-pk-driveway` at 1–3 m per pose a PERFECT student produces single
 *     steps of up to 3.48, above the 2.37 the bad lane shows. Per-step is noise
 *     on a route that reverses; only the aggregate carries signal.
 *   · CAPPING each foot's advance by the metres driven in that step. Computed:
 *     it moves the bad lane's coverage from 86% to 73.6%, still above the 70%
 *     floor. It does not fix the lane it was proposed for.
 */
export const ARC_PER_DRIVEN_SLOPE = 0.05;

export const VERDICTS = Object.freeze(["on-line", "drifted", "off-route", "no-witness"]);

/* ────────────────────────────────────────────────────────────────────────────
 * GEOMETRY
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Build a polyline with CUMULATIVE ARC LENGTH IN METRES from an ordered list
 * of `{x, y}`.
 *
 * Zero-length steps are dropped. A shadow trace is 20 Hz and the car is
 * stationary at both ends of most lessons, so a raw trace carries long runs of
 * identical points; keeping them costs nothing in arc length but adds
 * degenerate segments whose projection is a point, and — critically — it is
 * exactly the sample-density skew that makes an INDEX fraction lie.
 */
export function polylineFrom(points) {
  const pts = [];
  const cum = [];
  let s = 0;
  for (const p of points) {
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (pts.length === 0) {
      pts.push({ x, y });
      cum.push(0);
      continue;
    }
    const prev = pts[pts.length - 1];
    const step = Math.hypot(x - prev.x, y - prev.y);
    if (step === 0) continue;
    s += step;
    pts.push({ x, y });
    cum.push(s);
  }
  return { pts, cum, lengthM: s };
}

/** The shadow trace's own samples, in its own frame. */
export function polylineFromTrace(trace) {
  const samples = Array.isArray(trace?.samples) ? trace.samples : [];
  return polylineFrom(samples);
}

/**
 * Nearest point on the polyline to `pt`, over SEGMENTS and not vertices.
 *
 * Projecting to vertices is the cheap version and it is wrong by up to half a
 * segment — which, on the sparse fast stretches of a 20 Hz trace, is metres.
 * It also fails the L-shaped case in the tests: a car driving straight down
 * the middle of a leg is nowhere near a vertex.
 *
 * Returns `{ distM, s, seg, t }`, where `s` is the arc length in metres of the
 * projected point from the start of the polyline. `null` for an empty line.
 */
export function projectToPolyline(pt, line) {
  const { pts, cum } = line;
  if (!pts || pts.length === 0) return null;
  if (pts.length === 1) {
    return { distM: Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y), s: 0, seg: 0, t: 0 };
  }
  let best = null;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // `Math.hypot`, the same call `polylineFrom` accumulates `cum` with — not
    // `Math.sqrt(dx*dx + dy*dy)`, which differs from it in the last ULP. The
    // two agreeing EXACTLY is what makes `s <= lengthM` an invariant instead of
    // something that needs a clamp bolted on afterwards.
    const segLen = Math.hypot(dx, dy);
    const segLen2 = segLen * segLen;
    let t = 0;
    if (segLen2 > 0) {
      t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / segLen2;
      // THE CLAMP IS THE DIFFERENCE BETWEEN A SEGMENT AND AN INFINITE LINE. A
      // car 60 m past the end of the route sits on the extension of the last
      // segment; unclamped it reads 0.00 m off and 100% covered.
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distM = Math.hypot(pt.x - px, pt.y - py);
    // STRICT `<`, SO A TIE KEEPS THE EARLIER ARC LENGTH. See the header: on a
    // closed loop the spawn is equidistant from metre 0 and metre L, and
    // resolving that tie forward certifies a parked car as having driven the
    // whole loop.
    if (best === null || distM < best.distM) {
      best = { distM, s: cum[i] + t * segLen, seg: i, t };
    }
  }
  return best;
}

/**
 * Nearest-rank percentile. No interpolation: every value this returns is a
 * value that was actually measured on this lane, so "p90 = 92.3 m" names a
 * real sample and not an average of two.
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE MEASUREMENT
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Cross-track and coverage for one lane.
 *
 * @param poses  `[{x, y, tSec?}]` in the TRACE frame (caller converts).
 * @param line   a `polylineFrom(...)` result.
 * @param bands  overrides for DEFAULT_BANDS.
 */
export function routeFidelity(poses, line, bands = {}) {
  const B = { ...DEFAULT_BANDS, ...bands };
  const used = (poses ?? []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));

  const blank = (why, extra = {}) => ({
    posesUsed: used.length,
    maxCrossTrackM: null,
    p90CrossTrackM: null,
    routeCoveredFrac: null,
    routeLengthM: line?.lengthM ?? null,
    witnessPathM: null,
    arcPerDriven: null,
    arcPerDrivenCap: null,
    worstAtSec: null,
    worstAtFrac: null,
    verdict: "no-witness",
    why,
    ...extra,
  });

  // SPEC CORRECTION 2. Fewer than MIN_POSES posed samples is not a small
  // measurement, it is no measurement — and it fails SMALL.
  if (used.length < MIN_POSES) {
    return blank(
      `only ${used.length} posed sample(s) (floor ${MIN_POSES}) — a cross-track computed over ` +
        "that many ticks is a measurement of those ticks, and it reads small because the car has " +
        "not yet had room to leave the spawn.",
    );
  }
  if (!line || !line.pts || line.pts.length < 2 || !(line.lengthM > 0)) {
    return blank("the shadow polyline is empty or has zero length — there is no correct line to be off.");
  }

  const dists = [];
  let maxCrossTrackM = -Infinity;
  let worst = null;
  let furthestS = 0;
  let nearestS = Infinity;
  // THE DRIVE ITSELF, in metres: a chord sum over consecutive posed samples.
  // The same construction the harness publishes as `guidance.witness.pathM` —
  // spot-checked identical on rebase/sc-pk-driveway__pc-right, both 26.30 —
  // rather than a second definition of a number that already exists.
  //
  // It joins ACROSS a tick where `__camProbe` failed, so on a lane with dropped
  // reads it is a chord where the car drove a curve, and it UNDERSTATES the
  // drive. That pushes `arcPerDriven` up, i.e. toward refusing the lane, never
  // toward certifying it. Measured over the full corpus the effect refuses
  // nothing: exactly two lanes fail the ceiling and both fail it by a saddle.
  let witnessPathM = 0;
  let prev = null;
  for (const p of used) {
    const proj = projectToPolyline(p, line);
    dists.push(proj.distM);
    if (proj.distM > maxCrossTrackM) {
      maxCrossTrackM = proj.distM;
      worst = { tSec: p.tSec ?? null, frac: proj.s / line.lengthM };
    }
    // SPEC CORRECTION 1. Arc length in METRES over total arc length in METRES.
    // Never an index over a count.
    if (proj.s > furthestS) furthestS = proj.s;
    if (proj.s < nearestS) nearestS = proj.s;
    if (prev) witnessPathM += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  const sorted = [...dists].sort((a, b) => a - b);
  // No clamp. `projectToPolyline` clamps `t` to [0,1] and measures the segment
  // with the same `Math.hypot` that built `cum`, so `furthestS <= lengthM`
  // holds exactly. A `Math.min(1, …)` here would be a guard whose presence no
  // test could distinguish from its absence — the shape of dead code.
  const routeCoveredFrac = furthestS / line.lengthM;
  const p90CrossTrackM = percentile(sorted, 0.9);

  // SPEC CORRECTION 3. IS THE COVERAGE EARNED? See ARC_PER_DRIVEN_SLOPE.
  // `pacePerPoseM` is the mean chord between consecutive poses — the sampling
  // density the ceiling is a function of. A single pose cannot span any arc, so
  // a lane that never moved (span 0) is trivially supported and reads 1.
  const arcSpanM = furthestS - nearestS;
  const pacePerPoseM = used.length > 1 ? witnessPathM / (used.length - 1) : 0;
  const arcPerDrivenCap = 1 + ARC_PER_DRIVEN_SLOPE * pacePerPoseM;
  const arcPerDriven =
    arcSpanM <= 0 ? 1 : witnessPathM > 0 ? arcSpanM / witnessPathM : Infinity;
  const unearned = arcPerDriven > arcPerDrivenCap;

  const off = maxCrossTrackM > B.offRouteM;
  const drifted = maxCrossTrackM > B.onLineM;
  const short = routeCoveredFrac < B.coverageMin;

  // THE ORDER MATTERS AND IT IS NOT ARBITRARY. `off` and `short` are decided
  // BEFORE the saddle guard because neither can be flattered by it: a saddle
  // only ever moves coverage UP, so a lane that is short despite the inflation
  // is short a fortiori, and cross-track does not use the arc at all. The guard
  // therefore bites in exactly one place — where an unearned coverage would
  // otherwise have bought a certification.
  if (!off && !short && unearned) {
    return blank(
      `the coverage is not earned: the poses span ${arcSpanM.toFixed(1)} m of the route's ` +
        `${line.lengthM.toFixed(0)} m while the witness shows the car travelling only ` +
        `${witnessPathM.toFixed(1)} m — ${arcPerDriven.toFixed(2)} m of route claimed per metre driven, ` +
        `against a ceiling of ${arcPerDrivenCap.toFixed(2)} for a PERFECT drive of any of this ` +
        `product's routes at ${pacePerPoseM.toFixed(2)} m per pose. The route comes back near itself ` +
        "and the projection has jumped a stretch this car never drove, so neither the coverage nor " +
        "the cross-track (measured to a foot that may be on the wrong leg) says what it appears to.",
      {
        witnessPathM: round2(witnessPathM),
        arcPerDriven: round4(arcPerDriven),
        arcPerDrivenCap: round4(arcPerDrivenCap),
      },
    );
  }

  let verdict;
  let why;
  if (off || short) {
    verdict = "off-route";
    const parts = [];
    if (off) parts.push(`it was ${maxCrossTrackM.toFixed(1)} m off the demonstrated correct line (band ${B.offRouteM} m)`);
    if (short) parts.push(`it reached only ${(routeCoveredFrac * 100).toFixed(0)}% of the route's ${line.lengthM.toFixed(0)} m (floor ${(B.coverageMin * 100).toFixed(0)}%)`);
    why = `this drive did not do the lesson: ${parts.join(", and ")}.`;
  } else if (drifted) {
    verdict = "drifted";
    why =
      `it covered ${(routeCoveredFrac * 100).toFixed(0)}% of the route but wandered to ` +
      `${maxCrossTrackM.toFixed(1)} m off the correct line (on-line band ${B.onLineM} m).`;
  } else {
    verdict = "on-line";
    why =
      `it held within ${maxCrossTrackM.toFixed(2)} m of the correct line (p90 ${p90CrossTrackM.toFixed(2)} m) ` +
      `across ${(routeCoveredFrac * 100).toFixed(0)}% of the route's ${line.lengthM.toFixed(0)} m.`;
  }

  return {
    posesUsed: used.length,
    maxCrossTrackM: round2(maxCrossTrackM),
    p90CrossTrackM: round2(p90CrossTrackM),
    routeCoveredFrac: round4(routeCoveredFrac),
    routeLengthM: round2(line.lengthM),
    witnessPathM: round2(witnessPathM),
    arcPerDriven: round4(arcPerDriven),
    arcPerDrivenCap: round4(arcPerDrivenCap),
    worstAtSec: worst?.tSec ?? null,
    worstAtFrac: worst ? round4(worst.frac) : null,
    verdict,
    why,
  };
}

function round2(v) {
  return v === null || !Number.isFinite(v) ? null : Number(v.toFixed(2));
}
function round4(v) {
  return v === null || !Number.isFinite(v) ? null : Number(v.toFixed(4));
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE JOIN — status file ↔ shadow trace
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Poses out of a status file, converted INTO THE TRACE FRAME.
 *
 * `wx`/`wz` are `null` on any tick where the `__camProbe` read failed (the
 * push in lesson-audit.mjs writes the sample anyway — a refusal is a
 * measurement). Those ticks are dropped here rather than coerced to 0, which
 * would place the car at the district origin and invent a cross-track.
 */
export function posesFromStatus(status) {
  const samples = status?.guidance?.samples;
  if (!Array.isArray(samples)) return [];
  const out = [];
  for (const s of samples) {
    if (!Number.isFinite(s?.wx) || !Number.isFinite(s?.wz)) continue;
    out.push({ x: s.wx, y: -s.wz, tSec: Number.isFinite(s.tSec) ? s.tSec : null });
  }
  return out;
}

const repoRootCache = new Map();

/**
 * Walk up for the repo root — the directory that has `content/traces`.
 *
 * MEMOISED, because `laneFidelity` defaults to calling it and `--corpus` calls
 * `laneFidelity` 5,444 times: measured at 0.76 s of pure `existsSync` on this
 * project's HDD, ~3% of a warm sweep, for an answer that cannot change while
 * the process runs. The cache is keyed on `from` so an explicit start directory
 * still gets its own answer.
 */
export function findRepoRoot(from = path.dirname(fileURLToPath(import.meta.url))) {
  const key = `${from} ${process.cwd()}`;
  if (repoRootCache.has(key)) return repoRootCache.get(key);
  let found = null;
  outer: for (const start of [from, process.cwd()]) {
    let d = start;
    for (;;) {
      if (fs.existsSync(path.join(d, "content", "traces"))) {
        found = d;
        break outer;
      }
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  repoRootCache.set(key, found);
  return found;
}

export function shadowTracePath(lessonId, repoRoot = findRepoRoot()) {
  if (!repoRoot || !lessonId) return null;
  return path.join(repoRoot, "content", "traces", lessonId, "shadow-correct.trace.json");
}

const traceCache = new Map();

/** Cached, because `--corpus` reads the same 168 traces about 1,500 times. */
export function loadShadowPolyline(lessonId, repoRoot = findRepoRoot()) {
  const p = shadowTracePath(lessonId, repoRoot);
  if (!p) return null;
  if (traceCache.has(p)) return traceCache.get(p);
  let line = null;
  try {
    line = polylineFromTrace(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch {
    line = null;
  }
  traceCache.set(p, line);
  return line;
}

/**
 * One lane, end to end: read the status file, find its lesson's shadow trace,
 * measure. Returns a record that is also the JSONL row `--corpus` emits.
 */
export function laneFidelity({ statusPath, status, lessonId, repoRoot, bands } = {}) {
  const root = repoRoot ?? findRepoRoot();
  let st = status;
  if (!st && statusPath) {
    try {
      st = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    } catch (err) {
      return {
        statusPath: statusPath ?? null,
        lesson: lessonId ?? null,
        platform: null,
        mode: null,
        trackingVerdict: null,
        posesUsed: 0,
        maxCrossTrackM: null,
        p90CrossTrackM: null,
        routeCoveredFrac: null,
        routeLengthM: null,
        witnessPathM: null,
        arcPerDriven: null,
        arcPerDrivenCap: null,
        worstAtSec: null,
        worstAtFrac: null,
        verdict: "no-witness",
        why: `status file unreadable: ${String(err?.message ?? err).slice(0, 120)}`,
      };
    }
  }
  const lesson = lessonId ?? st?.scenario ?? laneFromPath(statusPath).lesson;
  const line = loadShadowPolyline(lesson, root);
  const poses = posesFromStatus(st);

  const measured = line
    ? routeFidelity(poses, line, bands)
    : {
        posesUsed: poses.length,
        maxCrossTrackM: null,
        p90CrossTrackM: null,
        routeCoveredFrac: null,
        routeLengthM: null,
        witnessPathM: null,
        arcPerDriven: null,
        arcPerDrivenCap: null,
        worstAtSec: null,
        worstAtFrac: null,
        verdict: "no-witness",
        why: `no shadow trace at content/traces/${lesson ?? "?"}/shadow-correct.trace.json — nothing to be off.`,
      };

  return {
    statusPath: statusPath ?? null,
    wave: waveFromPath(statusPath),
    lane: laneFromPath(statusPath).lane,
    lesson: lesson ?? null,
    platform: st?.platform ?? null,
    mode: st?.mode ?? null,
    // The number this file exists to disagree with, carried alongside so the
    // disagreement is one `jq` away and nobody has to re-join two corpora.
    trackingVerdict: st?.guidance?.tracking?.verdict ?? null,
    trackingMedianAbsDeg: st?.guidance?.tracking?.medianAbsDeg ?? null,
    ...measured,
  };
}

function laneFromPath(statusPath) {
  if (!statusPath) return { lane: null, lesson: null };
  const dir = path.basename(path.dirname(statusPath));
  // Both layouts in the corpus: `<lesson>__<platform>-<mode>` (w10+) and
  // `<lesson>/<platform>-<mode>` (the sweep* dirs).
  const [lesson] = dir.split("__");
  return { lane: dir, lesson: dir.includes("__") ? lesson : path.basename(path.dirname(path.dirname(statusPath))) };
}

function waveFromPath(statusPath) {
  if (!statusPath) return null;
  const parts = statusPath.split(/[\\/]/);
  const i = parts.lastIndexOf(".audit-frames");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE CORPUS SWEEP
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Every `_audit-status.json` under `root`, found by PRESENCE and not by a
 * hardcoded depth. The corpus has at least three lane layouts across 30 waves
 * and a path pattern would silently miss whichever one it was not written for
 * — which is the shape of every counting bug this audit has already had.
 *
 * A directory that holds a status file is a lane and is not descended into;
 * that is what keeps the walk off ~45,000 PNGs on a 7200 rpm disk.
 */
export function* findStatusFiles(root, { maxDepth = 8 } = {}) {
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    const here = path.join(dir, "_audit-status.json");
    if (fs.existsSync(here)) {
      yield here;
      continue;
    }
    if (depth >= maxDepth) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    /* THIS TOOL DOES NOT READ THE FINDINGS CORPUS, AND MUST NOT LOOK AS IF IT
     * DOES. count-agreement.mjs classifies anything in tools/audit that names
     * that corpus as a counter and then demands it print an open-list stamp —
     * correctly, because four tools once printed four different totals. A skip
     * list naming it tripped that detector on this file's first run, and the
     * cure is not to teach the detector an exception: it is to stop naming it.
     * The directory holds 92 flat .jsonl files and no lane, so the walk enters
     * it once, finds no subdirectory, and leaves. */
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === "raw") continue;
      stack.push({ dir: path.join(dir, e.name), depth: depth + 1 });
    }
  }
}

/**
 * MEASURED COST, so nobody starts a sweep and concludes it has hung. The whole
 * `.audit-frames/` tree is 6,754 directories holding 5,444 lanes.
 *
 *     cold, first run of the day   walk ~410 s   full sweep 17 m 38 s
 *     warm (page cache holds it)   walk   0.8 s  full sweep      25 s
 *
 * THE COST IS THE DISK, AND THAT IS NOT A FIGURE OF SPEECH — it was profiled.
 * Warm, of the 25 s: 0.8 s is the walk, 4.9 s is reading and parsing 213 MB of
 * `_audit-status.json`, and the remaining ~19 s is 312,577 point-to-polyline
 * projections. Cold, the same work is 17 m 38 s because 213 MB and 6,754
 * directory seeks come off a 7200 rpm platter. Nothing structural in this file
 * changes how many bytes that is.
 *
 * TWO RESTRUCTURINGS WERE TIMED AND ONE WAS TAKEN.
 *   · REJECTED — replacing the `existsSync` probe below with a single
 *     `readdirSync` per directory (8,064 metadata calls become 6,754). Measured
 *     over four alternating runs: 0.75/0.71 s for the current shape against
 *     0.78/0.77 s for the rewrite. It is SLOWER, because a lane directory holds
 *     ~50 PNGs and enumerating them costs more than one stat.
 *   · TAKEN — `findRepoRoot` is memoised and the resolved root is threaded down
 *     from `sweepCorpusStream` instead of being re-derived inside every
 *     `laneFidelity`. Measured: 0.76 s of pure `existsSync` over 5,444 lanes.
 *   · MEASURED, AVAILABLE, NOT TAKEN — an axis-aligned-bounding-box prune in
 *     `projectToPolyline` (skip a segment whose Chebyshev distance to `pt`
 *     already exceeds the running best). It is a strict lower bound and the
 *     update is a strict `<`, so it cannot change an answer; verified
 *     bit-identical on all 312,577 corpus projections, at 1.85× (13.1 s → 7.1 s).
 *     It is not in the file because the win is CPU-only against a disk-bound
 *     cost, and because the prune compares a rounded axis gap with a rounded
 *     hypotenuse — a sub-ULP window that this file's stated exactness
 *     discipline should not open for 6 seconds a sweep. Take it if the corpus
 *     ever lives on an SSD.
 *
 * One wave is 95 lanes in 0.75 s, so `--root .audit-frames/w33` is what you
 * want unless you actually mean all thirty waves.
 *
 * WHAT THE FULL SWEEP SAID, 2026-09-10, with the SPEC CORRECTION 3 guard in:
 * 5,444 lanes, 3,433 of them measurable. on-line 543 · drifted 698 ·
 * off-route 2,192 · no-witness 2,011. Median max cross-track 9.2 m, p90 78.1 m,
 * max 412.8 m. And the headline: of the 1,095 lanes the harness certified
 * «tracked», 710 are not on-line here.
 *
 * The guard moved exactly two rows out of that census — `rebase/
 * sc-pk-driveway__pc-right` (was on-line) and `w33/sc-pk-driveway__mobile-right`
 * (was drifted). Every other one of the 5,444 rows is byte-identical to the
 * pre-guard sweep, which is the check that says a fix repaired a defect rather
 * than re-scored a corpus.
 *
 * IT IS A GENERATOR, AND THE CLI WRITES EACH ROW AS IT ARRIVES. The first
 * version collected the array first and printed at the end, which after ten
 * minutes had produced an empty file and no way to tell a slow disk from a
 * hang. A long job that shows nothing is indistinguishable from a broken one.
 */
export function* sweepCorpusStream({ root, repoRoot, bands } = {}) {
  // Resolved ONCE and threaded down, rather than re-derived per lane.
  const rr = repoRoot ?? findRepoRoot();
  const base = root ?? path.join(rr ?? ".", ".audit-frames");
  for (const statusPath of findStatusFiles(base)) {
    yield laneFidelity({ statusPath, repoRoot: rr, bands });
  }
}

export function sweepCorpus(opts = {}) {
  return [...sweepCorpusStream(opts)];
}

/* ────────────────────────────────────────────────────────────────────────────
 * CLI
 * ──────────────────────────────────────────────────────────────────────────*/

function summarise(rows, out = process.stderr) {
  const measured = rows.filter((r) => r.maxCrossTrackM !== null);
  const byVerdict = new Map();
  for (const r of rows) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);
  const xs = measured.map((r) => r.maxCrossTrackM).sort((a, b) => a - b);
  const cov = measured.map((r) => r.routeCoveredFrac).sort((a, b) => a - b);
  out.write(`lanes ${rows.length}, measured ${measured.length}\n`);
  for (const v of VERDICTS) out.write(`  ${v.padEnd(11)} ${byVerdict.get(v) ?? 0}\n`);
  if (xs.length) {
    out.write(
      `  cross-track m: median ${percentile(xs, 0.5).toFixed(1)}  p90 ${percentile(xs, 0.9).toFixed(1)}  max ${xs[xs.length - 1].toFixed(1)}\n`,
    );
    out.write(
      `  coverage:      median ${(percentile(cov, 0.5) * 100).toFixed(0)}%  p10 ${(percentile(cov, 0.1) * 100).toFixed(0)}%\n`,
    );
  }
  // THE DISAGREEMENT, PRINTED. This is the whole reason the file exists.
  const tracked = measured.filter((r) => r.trackingVerdict === "tracked");
  if (tracked.length) {
    const bad = tracked.filter((r) => r.verdict !== "on-line");
    out.write(`  of ${tracked.length} lanes the harness certified «tracked», ${bad.length} are not on-line here\n`);
  }
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (n) => args.includes(n);
  const value = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };

  if (flag("--help") || args.length === 0) {
    process.stdout.write(
      [
        "route-fidelity — cross-track (metres) and route coverage against the product's own shadow drive.",
        "",
        "  node tools/audit/route-fidelity.mjs <path/to/_audit-status.json> [--json] [--lesson <id>]",
        "  node tools/audit/route-fidelity.mjs --corpus [--root <dir>] [--summary]",
        "",
        "Verdicts: on-line | drifted | off-route | no-witness.",
        `Bands: on-line <= ${DEFAULT_BANDS.onLineM} m, off-route > ${DEFAULT_BANDS.offRouteM} m,`,
        `coverage floor ${DEFAULT_BANDS.coverageMin}, pose floor ${MIN_POSES},`,
        `arc claimed per metre driven <= 1 + ${ARC_PER_DRIVEN_SLOPE} x (metres per pose).`,
        "",
      ].join("\n"),
    );
    return 0;
  }

  if (flag("--corpus")) {
    const root = value("--root");
    const wantSummary = flag("--summary");
    const rows = [];
    let n = 0;
    for (const r of sweepCorpusStream({ root: root ? path.resolve(root) : undefined })) {
      process.stdout.write(`${JSON.stringify(r)}\n`);
      if (wantSummary) rows.push(r);
      n += 1;
      // Progress goes to stderr so the JSONL on stdout stays a clean pipe.
      if (n % 250 === 0) process.stderr.write(`… ${n} lanes\n`);
    }
    if (wantSummary) summarise(rows);
    return 0;
  }

  // Positional scan by INDEX, not by `args.indexOf(a)` — a value that happens
  // to equal an earlier argument would resolve to the wrong slot and the flag's
  // operand would be read as the path.
  const takesValue = new Set(["--lesson", "--root"]);
  let target = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) continue;
    if (i > 0 && takesValue.has(args[i - 1])) continue;
    target = args[i];
    break;
  }
  if (!target) {
    process.stderr.write("no _audit-status.json given\n");
    return 2;
  }
  const statusPath = fs.existsSync(target) && fs.statSync(target).isDirectory()
    ? path.join(target, "_audit-status.json")
    : target;
  const row = laneFidelity({ statusPath: path.resolve(statusPath), lessonId: value("--lesson") });
  if (flag("--json")) {
    process.stdout.write(`${JSON.stringify(row, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(
    [
      `${row.lesson ?? "?"}  ${row.platform ?? "?"}-${row.mode ?? "?"}`,
      `  harness tracking.verdict : ${row.trackingVerdict ?? "—"}${row.trackingMedianAbsDeg !== null ? ` (medianAbsDeg ${row.trackingMedianAbsDeg})` : ""}`,
      `  route fidelity verdict   : ${row.verdict}`,
      `  maxCrossTrackM           : ${row.maxCrossTrackM ?? "—"}`,
      `  p90CrossTrackM           : ${row.p90CrossTrackM ?? "—"}`,
      `  routeCoveredFrac         : ${row.routeCoveredFrac ?? "—"}${row.routeLengthM ? `  (route ${row.routeLengthM} m)` : ""}`,
      `  posesUsed                : ${row.posesUsed}${row.witnessPathM !== null && row.witnessPathM !== undefined ? `  (witness path ${row.witnessPathM} m)` : ""}`,
      `  arcPerDriven             : ${row.arcPerDriven ?? "—"}${row.arcPerDrivenCap !== null && row.arcPerDrivenCap !== undefined ? `  (ceiling ${row.arcPerDrivenCap})` : ""}`,
      `  ${row.why}`,
      "",
    ].join("\n"),
  );
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv);
}
