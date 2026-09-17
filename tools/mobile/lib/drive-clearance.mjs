// -----------------------------------------------------------------------------
// drive-clearance.mjs — WHAT THE CAR ACTUALLY CLEARED, MEASURED FROM THE POSES
// IT ACTUALLY PRODUCED.
//
// WHY THIS FILE EXISTS
// --------------------
// Until 2026-09-16 the only independent gate on a pc-path drive's SAFETY was a
// corridor: `policy.mjs COMMITTED[lesson][seg].corridorM`, read by
// `path-evidence.mjs routeBySegment` and gated by `path-canary.mjs` G1/G3. It
// measures the drive's deviation from the AUTHORED DEMONSTRATION LINE, and it is
// deliberately blind to the pathref (DESIGN-v2-CHECK §D6: the gating side may not
// read the witness it is judging).
//
// That proxy has stopped being a safety check, and the reason is not fraud. The
// planner now scores body clearance, so a CLEARING witness deviates about 0.47 m
// from the authored line ON PURPOSE — the authored lines themselves graze the
// neighbours (sc-park-left passes a parked car at −0.0030 m, sc-park-gap-short at
// +0.0051), so hugging them is what drove a real car into `lotlf-bay-4`. The
// reverse corridors had to widen to 0.819–0.820 m from the ~0.5 m FEASIBLE-TRACK
// boundary or every good drive would fail. But 0.8 m of licence is nine times the
// 0.088 m of following error the clearance margin was budgeted for: a drive can
// now wander most of a metre off the line and still be inside its corridor.
//
// So the corridor stays as a PLAUSIBILITY check — it still catches a car that
// went somewhere else entirely — and this file is the SAFETY check: the body the
// lesson really mounts, against the poses the drive really produced.
//
// WHAT IT READS, AND HOW INDEPENDENT THAT IS (say it every time)
// -------------------------------------------------------------
//   · POSITION — `_audit-path.json` rows carry (x, z) read from
//     `window.__camProbe`, the same probe `guidance.samples[].wx/wz` come from.
//     Independent of the controller's books, NOT of the pose probe. Identical in
//     kind to every other number `path-evidence.mjs` publishes.
//   · HEADING — the probe publishes position AND NO YAW (guidance.mjs:2361). The
//     heading on a ledger row is the runner's own `camPsi` estimator. There is no
//     independent yaw anywhere in the artefacts, so this gate is NOT independent
//     of that estimator, and every record it returns says so in `basis`. What
//     makes it worth gating on anyway: (1) it is completely independent of the
//     WITNESS and of the CORRIDOR — it never reads a pathref and never reads
//     `corridorM`; (2) a runner that mis-estimated its own heading to look good
//     here would be steering on that same estimate and would hit the car, which
//     the product books as «Удар» and G5 reads; (3) the terminal yaw of that very
//     estimator is already validated against the product's own «ъгъл» to 1.5° by
//     canary gate G6.
//   · BODIES — `body-screen.mjs mountedBodies(lesson)`: the district's occupied
//     bays and the template's held scenery, each at the size the runtime mounts
//     it, with `assignCivilianModel(seed)` reproducing the deterministic draw.
//     Read from `content/world` and the scenario templates — the product's own
//     source, and nothing the harness wrote.
//
// WHY THE THRESHOLD IS NOT `BODY_FLOOR_M`
// ---------------------------------------
// `BODY_FLOOR_M` (0.15 m) is a floor on a PLAN, and its largest term is 0.088 m —
// the worst following error a real drive has ever shown against a committed
// witness. A plan must hold that back because the drive has yet to spend it. A
// DRIVE HAS ALREADY SPENT IT: the measured clearance of its own poses is what is
// left after the following error, so charging the drive for it again would be
// counting the same centimetres twice. Measured on the five archived pc-path
// drives, a 0.15 m rule would fail sc-park-gap-short at 0.1447 m and
// sc-park-wall at 0.0856 m — two drives that touched nothing and that the product
// credited — while the two that DID collide come in at −0.0233 and −0.1520 m.
//
// So the drive keeps only the term a drive cannot spend: `0.050 m`, the third
// term of `BODY_FLOOR_M`, the residual this screen cannot see AT ALL — it is 2-D
// (no kerb height, no mirrors) and buildings are hittable and are not among the
// bodies it reads. Nothing is relaxed and no tolerance is redefined:
// `BODY_FLOOR_M` is untouched and still gates every plan, and the two terms this
// gate drops are dropped because they are MEASURED on the drive itself rather
// than budgeted for it — the following error is in the poses, and the sampling
// error is `residualM` + `interpolationBoundM` below, both measured per drive and
// both added back on top of the floor.
//
// A drive between the drive floor and `BODY_FLOOR_M` is `tight`: it passes and it
// is REPORTED, because it means the drive ate more margin than its plan budgeted.
// -----------------------------------------------------------------------------
import {
  BODY_FLOOR_M,
  CHASSIS_HALF,
  CHASSIS_RADIUS_M,
  SWEEP_SPACING_M,
  Unreadable,
  clearanceAtPose,
  mountedBodies,
  obb,
  obbSeparation,
  sweptSeparation,
} from "./path-plan/body-screen.mjs";

export { Unreadable };

/**
 * THE DRIVE FLOOR — the third term of `BODY_FLOOR_M` and nothing else. See the
 * header: the other two terms are spent (following error) or measured per drive
 * (sampling), and are added back from the measurement rather than assumed.
 */
export const DRIVE_CLEARANCE_FLOOR_M = 0.05;

/**
 * The largest chord-to-arc error this gate will interpolate across. A ledger row
 * is written every runner sub-tick, but the runner YIELDS between bursts and the
 * page keeps running, so the record has gaps — up to 1.53 m on the archived
 * drives. Between two poses this file interpolates a straight chord, and a car on
 * an arc bulges off that chord by a sagitta of about `d · Δψ / 8`. Measured on
 * all five archived pc-path drives the worst is 0.0022 m, because the long gaps
 * happen at speed (where the car is going straight) and the hard turning happens
 * at a crawl (where the gaps are 2 cm). The bound is computed per drive and
 * ADDED to the floor; past this cap the record is REFUSED instead, because a pose
 * record too sparse to interpolate is a record this gate cannot measure.
 */
export const INTERP_BOUND_CAP_M = 0.02;

/** A drive with fewer usable poses than this is not a drive this gate can read. */
export const MIN_POSES = 20;

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);
const wrap180 = (d) => ((((d % 360) + 540) % 360) - 180);

export const DRIVE_CLEARANCE_BASIS =
  "position from window.__camProbe (independent of the controller and of the witness; SAME POSE PROBE) · heading from the runner's own camPsi estimator (the probe publishes no yaw; NOT independent of the controller, validated at the end pose by canary G6)";

/**
 * The pose ribbon of one drive, out of `_audit-path.json`.
 *
 * `ledger` is that file's `rows`; `dropped` is its `dropped`. Every way the
 * record can be unreadable is a NAMED REFUSAL, never a skipped row:
 *   · `dropped > 0` — the runner's ledger hit `PATH_LEDGER_MAX` and the TAIL of
 *     the drive was thrown away. The tail is where a reverse ends, which is where
 *     the clearance is worst, so a truncated record cannot gate.
 *   · a row with a finite (x, z) but no finite heading — the heading is
 *     interpolated from the bracketing rows that have one, and the travel that
 *     spans is counted; more than `headingGapCapM` of it and the record refuses.
 *   · a row that does not yield a finite (x, z) — REFUSED BY NAME.
 *
 * H1, FIXED 2026-09-16 — THE NON-FINITE POSE USED TO VANISH. This loop used to
 * read `if (!row || !Number.isFinite(row.x) || !Number.isFinite(row.z)) continue;`
 * — a `continue`, in a gate whose whole contract is that a pose it cannot read is
 * a refusal. The row it skipped is exactly where a drive might have been closest:
 * a NaN in the pose stream is most likely at the frame the physics went
 * non-finite, i.e. a contact. Dropping it left a hole that only widened
 * `worstGapM`, and a wide gap with no heading change has a chord-to-arc sagitta
 * of zero, so the hole could pass the `INTERP_BOUND_CAP_M` test and the gate
 * would then report the clearance of a ribbon that never included the closest
 * pose. Every other reader of a pose in this programme — `poseOfRow`,
 * `sweptSeparation`, `clearanceAtPose` — refuses a non-finite pose by name; this
 * one now does too. Measured on all five archived pc-path drives: 0 such rows, so
 * nothing that passed before fails now.
 */
export function posesFromDriveLedger(ledger, { dropped = 0, headingGapCapM = 1.0 } = {}) {
  if (!Array.isArray(ledger)) throw new Unreadable("posesFromDriveLedger: the pose ledger is not an array — refusing to gate a drive whose poses could not be read");
  if (!(dropped === 0)) {
    throw new Unreadable(`posesFromDriveLedger: the runner dropped ${dropped} pose row(s) at PATH_LEDGER_MAX — the record is truncated at the tail, which is exactly where a reverse is tightest, so this drive cannot be measured`);
  }
  const withPos = [];
  for (let i = 0; i < ledger.length; i++) {
    const row = ledger[i];
    if (!row || typeof row !== "object" || !Number.isFinite(row.x) || !Number.isFinite(row.z)) {
      throw new Unreadable(`posesFromDriveLedger: ledger row ${i} of ${ledger.length} carries no finite (x, z) — x ${JSON.stringify(row?.x)}, z ${JSON.stringify(row?.z)}. A pose this gate cannot read is a REFUSAL, never a skipped row: the row it could not read is exactly where the drive may have been closest to a body`);
    }
    withPos.push({ i, x: row.x, z: row.z, psiDeg: Number.isFinite(row.psi) ? row.psi : null, v: Number.isFinite(row.v) ? row.v : null, seg: row.seg ?? null, mode: row.mode ?? null, src: row.src ?? null, f: row.f ?? null });
  }
  if (withPos.length < MIN_POSES) {
    throw new Unreadable(`posesFromDriveLedger: only ${withPos.length} of ${ledger.length} ledger row(s) carry a finite (x, z) — under the ${MIN_POSES} this gate needs, so the drive is UNMEASURED rather than clear`);
  }
  // heading: carried from the bracketing rows that have one
  const firstHeading = withPos.findIndex((p) => p.psiDeg !== null);
  const lastHeading = withPos.length - 1 - [...withPos].reverse().findIndex((p) => p.psiDeg !== null);
  if (firstHeading < 0) throw new Unreadable("posesFromDriveLedger: not one ledger row carries a finite heading — the pose ribbon has no orientation and the chassis box cannot be placed");
  let interpolatedHeadings = 0;
  let worstHeadingGapM = 0;
  for (let k = 0; k < withPos.length; k++) {
    if (withPos[k].psiDeg !== null) continue;
    interpolatedHeadings += 1;
    let a = k - 1;
    while (a >= 0 && withPos[a].psiDeg === null) a -= 1;
    let b = k + 1;
    while (b < withPos.length && withPos[b].psiDeg === null) b += 1;
    if (a < 0 || b >= withPos.length) {
      // a heading gap at either END of the drive: carry the nearest known heading
      const src = a >= 0 ? withPos[a] : withPos[b];
      withPos[k].psiDeg = src.psiDeg;
      withPos[k].headingFrom = "carried from the nearest row with a heading (the gap runs to the end of the record)";
    } else {
      let span = 0;
      for (let j = a + 1; j <= b; j++) span += Math.hypot(withPos[j].x - withPos[j - 1].x, withPos[j].z - withPos[j - 1].z);
      if (span > worstHeadingGapM) worstHeadingGapM = span;
      const f = (k - a) / (b - a);
      withPos[k].psiDeg = withPos[a].psiDeg + wrap180(withPos[b].psiDeg - withPos[a].psiDeg) * f;
      withPos[k].headingFrom = "interpolated between the bracketing rows that carry one";
    }
  }
  if (worstHeadingGapM > headingGapCapM) {
    throw new Unreadable(`posesFromDriveLedger: ${interpolatedHeadings} ledger row(s) carry a position and no heading, and the worst such gap spans ${worstHeadingGapM.toFixed(3)} m of travel — over the ${headingGapCapM} m cap, so the chassis box over that stretch would be a guess`);
  }
  // the ribbon's own gaps, and the chord-to-arc bound they imply
  let worstGapM = 0;
  let interpolationBoundM = 0;
  for (let k = 1; k < withPos.length; k++) {
    const d = Math.hypot(withPos[k].x - withPos[k - 1].x, withPos[k].z - withPos[k - 1].z);
    const dPsiRad = (Math.abs(wrap180(withPos[k].psiDeg - withPos[k - 1].psiDeg)) * Math.PI) / 180;
    if (d > worstGapM) worstGapM = d;
    const sag = (d * dPsiRad) / 8;
    if (sag > interpolationBoundM) interpolationBoundM = sag;
  }
  return {
    poses: withPos.map((p, k) => ({ x: p.x, z: p.z, psiDeg: p.psiDeg, s: k, row: p.i, seg: p.seg, mode: p.mode, v: p.v })),
    ledgerRows: ledger.length,
    usedRows: withPos.length,
    skippedRows: ledger.length - withPos.length,
    interpolatedHeadings,
    worstHeadingGapM,
    worstGapM,
    interpolationBoundM,
    nonCamRows: withPos.filter((p) => p.src !== "cam").length,
  };
}

/**
 * THE GATE'S NUMBER. Returns a record, or throws `Unreadable` by name.
 *
 * `mounted` may be injected (the tests do); otherwise the lesson's bodies are
 * read fresh. A lesson whose district mounts nothing returns `no-bodies` with the
 * reason on it — a measured fact, never a silent pass.
 */
export function driveClearance(lesson, ledger, { dropped = 0, mounted = null, spacingM = SWEEP_SPACING_M, floorM = DRIVE_CLEARANCE_FLOOR_M } = {}) {
  if (!lesson) throw new Unreadable("driveClearance: no lesson id — refusing to screen a drive against a district nobody named");
  const ribbon = posesFromDriveLedger(ledger, { dropped });
  if (ribbon.interpolationBoundM > INTERP_BOUND_CAP_M) {
    throw new Unreadable(`driveClearance: the pose record's worst chord-to-arc bound is ${ribbon.interpolationBoundM.toFixed(4)} m (worst gap ${ribbon.worstGapM.toFixed(3)} m) — over the ${INTERP_BOUND_CAP_M} m cap, so the ribbon between the recorded poses is a guess and this drive is UNMEASURED`);
  }
  const m = mounted ?? mountedBodies(lesson);
  const bodies = Array.isArray(m) ? m : m.bodies;
  if (!Array.isArray(bodies)) throw new Unreadable(`driveClearance: ${lesson} produced no body list — refusing to report clearance against nothing`);
  const base = {
    screen: "drive-clearance/1",
    lesson,
    basis: DRIVE_CLEARANCE_BASIS,
    floorM,
    planFloorM: BODY_FLOOR_M,
    spacingM,
    districtId: Array.isArray(m) ? null : (m.districtId ?? null),
    bodies: bodies.length,
    ledgerRows: ribbon.ledgerRows,
    usedRows: ribbon.usedRows,
    skippedRows: ribbon.skippedRows,
    interpolatedHeadings: ribbon.interpolatedHeadings,
    worstGapM: r4(ribbon.worstGapM),
    interpolationBoundM: r6(ribbon.interpolationBoundM),
  };
  if (bodies.length === 0) {
    // H2: this is now reachable ONLY after `assertBodiesWereLookedFor` has passed, i.e.
    // the sources were read and they really declare nothing. The sources travel with the
    // verdict so a reader can see WHAT was read, not just that nothing came back.
    const src = Array.isArray(m) ? null : (m.sources ?? null);
    return { ...base, measured: false, verdict: "no-bodies", worstM: null, requiredM: null, body: null, model: null, sources: src, why: `${lesson}: its district mounts no hittable body, so there is nothing for the drive to clear${src ? ` (bays block ${src.bays.block}, ${src.bays.declared} declared / ${src.bays.occupied} occupied; held-scenery entry ${src.held.entry}, ${src.held.parsed} parsed)` : ""}` };
  }
  const s = sweptSeparation(ribbon.poses, bodies.map((b) => b.box), { spacingM });
  const who = bodies[s.boxIndex] ?? null;
  const requiredM = floorM + ribbon.interpolationBoundM + Math.max(0, s.residualM);
  const worstM = s.worst;
  const verdict = worstM < 0 ? "contact" : worstM < requiredM ? "unsafe" : worstM < BODY_FLOOR_M ? "tight" : "clear";
  const at = ribbon.poses[s.atIndex] ?? null;
  return {
    ...base,
    measured: true,
    verdict,
    worstM: r6(worstM),
    requiredM: r6(requiredM),
    residualM: r6(s.residualM),
    pointWorstM: r6(s.pointWorst),
    pointSamplingM: r6(s.pointSamplingM),
    body: who?.id ?? null,
    model: who?.model ?? null,
    pooled: who?.pooled ?? null,
    atRow: at?.row ?? null,
    atSeg: at?.seg ?? null,
    atMode: at?.mode ?? null,
    intervalsRefined: s.intervalsRefined,
    why:
      verdict === "contact"
        ? `the chassis box PENETRATED ${who?.id}/${who?.model} by ${Math.abs(worstM).toFixed(4)} m`
        : verdict === "unsafe"
          ? `the chassis box passed ${who?.id}/${who?.model} at ${worstM.toFixed(4)} m, under the ${r6(requiredM)} m this drive had to keep (${floorM} m the screen cannot see + ${r6(ribbon.interpolationBoundM)} m chord-to-arc + ${r6(Math.max(0, s.residualM))} m measured sampling)`
          : verdict === "tight"
            ? `the chassis box passed ${who?.id}/${who?.model} at ${worstM.toFixed(4)} m — clear of the ${r6(requiredM)} m this drive had to keep, but under the ${BODY_FLOOR_M} m floor its PLAN had to clear, so this drive spent more margin than the plan budgeted`
            : `the chassis box passed ${who?.id}/${who?.model} at ${worstM.toFixed(4)} m`,
  };
}

/**
 * THE PREDICATE — the one place "did this drive keep its body clear?" is decided.
 * `path-canary.mjs` G10 and `path-evidence.mjs` both read this, so a drive cannot
 * be clear to one and unsafe to the other.
 *
 * An absent or unmeasured record is NOT a pass. A gate that could not measure
 * must not wave a drive through.
 */
export function driveClearanceGate(record) {
  if (!record) return { pass: false, why: "NO DRIVE-CLEARANCE RECORD — the drive's own body clearance was never measured, so this leg is UNJUDGED on the only thing that makes a corridor safe" };
  if (record.verdict === "refused" || record.verdict === "unmeasured") return { pass: false, why: `UNMEASURED — ${record.why ?? "the drive-clearance screen refused"}` };
  if (record.verdict === "no-bodies") return { pass: true, why: record.why };
  if (record.measured !== true) return { pass: false, why: `UNMEASURED — ${record.why ?? "the record carries no measurement"}` };
  const pass = record.verdict === "clear" || record.verdict === "tight";
  return { pass, why: `${record.verdict} · ${record.why}` };
}

/** The `unmeasured` record a caller stores when the screen refused, so the refusal travels. */
export function refusedDriveClearance(lesson, err) {
  return {
    screen: "drive-clearance/1",
    lesson: lesson ?? null,
    basis: DRIVE_CLEARANCE_BASIS,
    measured: false,
    verdict: "refused",
    worstM: null,
    requiredM: null,
    floorM: DRIVE_CLEARANCE_FLOOR_M,
    planFloorM: BODY_FLOOR_M,
    why: String(err?.message ?? err),
    refusal: err?.name ?? "Error",
  };
}

/**
 * The whole job in one call, from a leg folder's two sidecars. `pathJson` is the
 * parsed `_audit-path.json` (or null when the file is missing — which is itself a
 * refusal, not an absence).
 */
export function driveClearanceFromSidecar(lesson, pathJson, opts = {}) {
  try {
    if (!pathJson) throw new Unreadable(`driveClearance: ${lesson ?? "(no lesson)"} has no _audit-path.json — the drive wrote no pose record, so its body clearance is UNMEASURED`);
    return driveClearance(lesson, pathJson.rows, { dropped: pathJson.dropped ?? 0, ...opts });
  } catch (err) {
    return refusedDriveClearance(lesson, err);
  }
}

// =============================================================================
// THE FOLLOWER'S COPY OF THIS GATE — the guard that replaced `bay-lateral`
// =============================================================================
//
// WHY A SECOND ENTRY POINT AND NOT A SECOND RULE. Until 2026-09-16 the follower
// refused a reverse going wide in a bay on `policy.mjs BAY_FLANKS`: the centre's
// LATERAL OFFSET FROM THE BAY AXIS, against a hand-kept scalar face per side,
// minus a tuned margin, evaluated at a fixed 10° worst-case yaw, and only where
// the centre was 0.5 m inside the paint and within 20° of the bay axis. It was a
// PROXY for body clearance, and it had been loosened twice for the only reason a
// proxy ever is: it disagreed with reality. The third disagreement is the one
// that retired it. Once the planner started MAXIMISING clearance, the witness it
// commits for sc-park-wall sits ~0.16 m off the bay axis on purpose, and the
// proxy refused that witness with `bay-lateral` BEFORE any contact: the planner
// was being rewarded for exactly what the follower punished.
//
// Nothing here is a new threshold. The guard measures the SAME chassis box
// against the SAME mounted bodies with the SAME `obbSeparation` as
// `driveClearance` above, and refuses under the SAME `DRIVE_CLEARANCE_FLOOR_M`.
// So the rule is one sentence, and it cannot disagree with either side:
//
//     THE FOLLOWER REFUSES WHEN IT PREDICTS THAT ITS OWN DRIVE WOULD FAIL G10.
//
//  · against the PLANNER: a committed witness clears `BODY_FLOOR_M` = 0.15 m,
//    and 0.15 = 0.088 (the worst following error ever measured) + 0.05 (this
//    floor) + 0.012 kept back. A drive that follows its plan no worse than the
//    worst real drive ever followed one therefore CANNOT trip this guard. It
//    trips only once the follower has spent more than any follower ever has —
//    which is the only moment a refusal is honest.
//  · against G10: the floor, the bodies and the geometry are identical, so a
//    drive this guard allows is a drive G10 measures; a drive it refuses is one
//    G10 would have failed. The two can differ only in WHEN they say so, which
//    is the entire point — this one says so before the contact.
//
// WHAT IT DOES NOT INHERIT. The bay window, the yaw gate, the mouth inset, the
// per-side face table and the margin are all GONE. They existed to make a
// position-only formula safe; a measurement of the real body at the real heading
// needs none of them, and the windows were actively harmful — measured on the
// clean bench, the closest either AUTHORED face ever came to the car was at
// |lon| 4.32 m and 104° off the bay axis (garage wall, 0.1874 m) and |lon|
// 2.94 m at 150° off it (alley wall, 0.8278 m), i.e. OUTSIDE the proxy's window
// on both axes. The proxy could not see either authored face at the pose that
// mattered. This guard is armed for every segment of the drive and sees both.
//
// THE PREDICTION, AND WHY IT IS STILL A PREDICTION. `bay-lateral` fired on an
// EXTRAPOLATED STOP POINT because a guard that waits for the contact is not a
// guard. That is kept exactly: the follower hands `worstOverBrake` the pose it is
// at and the pose it would come to rest at, and the guard measures the whole
// braking ribbon between them — not just its end, which the lateral proxy never
// did. A drive that would END resting against a flank is refused while it is
// still a stopping distance away from it.

/**
 * The spacing at which the braking ribbon is scanned. Its own chord bound is
 * added to the floor exactly as `interpolationBoundM` is above — a scan is an
 * approximation of a continuous sweep, and this file's rule is that an
 * approximation pays for itself rather than being trusted.
 */
export const BRAKE_SCAN_SPACING_M = 0.02;

/**
 * THE GUARD THE FOLLOWER HOLDS. Built once per plan, from the lesson's mounted
 * bodies; `mounted` may be injected (the bench and the tests do).
 *
 * `bodies.length === 0` is only reachable after `assertBodiesWereLookedFor`, so
 * an empty guard is a measured fact and says so in `why` — it is never the
 * silent answer of a reader that could not look (H2).
 */
export function bodyClearanceGuard(lesson, { mounted = null, floorM = DRIVE_CLEARANCE_FLOOR_M } = {}) {
  if (!Number.isFinite(floorM)) throw new Unreadable(`bodyClearanceGuard(${lesson}): floor ${floorM} is not a number`);
  const m = mounted ?? mountedBodies(lesson);
  const list = Array.isArray(m) ? m : m?.bodies;
  if (!Array.isArray(list)) throw new Unreadable(`bodyClearanceGuard(${lesson}): no body list — refusing to guard against nothing`);
  const boxes = list.map((b) => {
    if (!b?.box) throw new Unreadable(`bodyClearanceGuard(${lesson}): ${b?.id ?? "(no id)"} carries no OBB`);
    return b.box;
  });
  const idOf = (i) => (i >= 0 && list[i] ? `${list[i].id}/${list[i].model}` : null);
  const chassisAt = (x, z, psiDeg) => obb(x, z, psiDeg, CHASSIS_HALF.across, CHASSIS_HALF.along);

  /** The chassis at one pose, against the closest body. */
  const at = (x, z, psiDeg) => {
    const r = clearanceAtPose(list, x, z, psiDeg);
    return { m: r.m, index: r.index, body: idOf(r.index) };
  };

  /**
   * THE BRAKING RIBBON, INTEGRATED ON THE ARC THE CAR IS ACTUALLY ON.
   *
   * `from` is the pose the car holds, `kappaDegPerM` the heading change per metre
   * of travel it is currently making, `gear` +1/-1, `distanceM` how far it would
   * travel before it came to rest. A straight CHORD to the predicted stop point
   * is not good enough and was measured not to be: on the clean bench a chord
   * prediction read -0.0099 m where the arc read 0.1488 m and the car really held
   * 0.2792 m (sc-park-wall seed 13, turning 13.5 deg/m). A guard that pessimistic
   * refuses honest parking, which is the failure this whole change exists to end.
   *
   * The per-body Lipschitz screen is the same one `sweptSeparation` uses and is
   * exact, not a heuristic: translating the box by d moves any separation by at
   * most d and rotating it by dpsi moves a corner by at most CHASSIS_RADIUS_M *
   * dpsi, so a body further than `d + R*dpsi` above the threshold at `from`
   * cannot reach it anywhere on the ribbon and is not scanned. That is what makes
   * this affordable at every sub-tick of every drive.
   */
  const brakingRibbon = (from, { kappaDegPerM = 0, gear = 1, distanceM = 0, screenAtM = null } = {}) => {
    if (![from?.x, from?.z, from?.psiDeg].every(Number.isFinite)) {
      throw new Unreadable(`bodyClearanceGuard(${lesson}): the braking ribbon's start pose is not finite (${JSON.stringify(from)?.slice(0, 120)})`);
    }
    if (!Number.isFinite(kappaDegPerM) || !Number.isFinite(distanceM) || distanceM < 0) {
      throw new Unreadable(`bodyClearanceGuard(${lesson}): the braking ribbon needs a finite curvature and a non-negative distance, got ${kappaDegPerM} deg/m over ${distanceM} m`);
    }
    const sgn = gear === -1 ? -1 : 1;
    const k = (kappaDegPerM * Math.PI) / 180;      // rad of heading per metre of travel
    const p0 = (from.psiDeg * Math.PI) / 180;
    // probe frame: heading unit is (sin psi, -cos psi); travel is sgn * heading
    const poseAt = (s) => {
      if (Math.abs(k) < 1e-9) return [from.x + sgn * Math.sin(p0) * s, from.z - sgn * Math.cos(p0) * s, from.psiDeg + kappaDegPerM * s];
      return [
        from.x + (sgn * (Math.cos(p0) - Math.cos(p0 + k * s))) / k,
        from.z - (sgn * (Math.sin(p0 + k * s) - Math.sin(p0))) / k,
        from.psiDeg + kappaDegPerM * s,
      ];
    };
    const n = Math.max(1, Math.ceil(distanceM / BRAKE_SCAN_SPACING_M));
    const step = distanceM / n;
    const dPsiStepRad = (Math.abs(kappaDegPerM) * step * Math.PI) / 180;
    // what one scan interval can hide: half a step of travel plus half a step of swing
    const boundM = step / 2 + (CHASSIS_RADIUS_M * dPsiStepRad) / 2;
    const reach = distanceM + (CHASSIS_RADIUS_M * Math.abs(kappaDegPerM) * distanceM * Math.PI) / 180;
    const screen = Number.isFinite(screenAtM) ? screenAtM : floorM;
    const A = chassisAt(from.x, from.z, from.psiDeg);
    let best = Infinity;
    let bi = -1;
    let bs = 0;
    let scanned = 0;
    if (boxes.length === 0) return { m: Infinity, boundM: 0, index: -1, body: null, atM: 0, scanned: 0, n: 0 };
    for (let j = 0; j < boxes.length; j++) {
      const g0 = obbSeparation(A, boxes[j]);
      if (g0 < best) { best = g0; bi = j; bs = 0; }
      if (g0 - reach > screen + boundM) continue;  // cannot reach the threshold anywhere on this ribbon
      scanned += 1;
      for (let i = 1; i <= n; i++) {
        const [px, pz, pp] = poseAt(step * i);
        const g = obbSeparation(chassisAt(px, pz, pp), boxes[j]);
        if (g < best) { best = g; bi = j; bs = step * i; }
      }
    }
    return { m: best, boundM, index: bi, body: idOf(bi), atM: bs, scanned, n };
  };

  return {
    screen: "drive-clearance/1",
    lesson,
    districtId: Array.isArray(m) ? null : (m?.districtId ?? null),
    sources: Array.isArray(m) ? null : (m?.sources ?? null),
    floorM,
    planFloorM: BODY_FLOOR_M,
    bodies: list,
    count: list.length,
    basis: DRIVE_CLEARANCE_BASIS,
    why: list.length === 0
      ? `${lesson}: its district mounts no hittable body — measured, not assumed (body-screen.mjs assertBodiesWereLookedFor)`
      : `${list.length} mounted body/bodies in ${Array.isArray(m) ? "(injected)" : (m?.districtId ?? "?")}, each at its MOUNTED rig size; floor ${floorM} m — the same floor, bodies and geometry drive-clearance.mjs gates the finished drive by`,
    at,
    brakingRibbon,
  };
}
