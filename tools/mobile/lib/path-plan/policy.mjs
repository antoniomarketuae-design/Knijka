// -----------------------------------------------------------------------------
// path-plan/policy.mjs — WHERE A pc-path LEG MAY ARM R, AND WHAT IT IS GRADED
// AGAINST. STATIC DATA WITH CITES, NOTHING COMPUTED FROM A DRIVE.
//
// DESIGN-v2 §2.4 turned into a table. Every number comes from the Slice 0
// feasibility screen (scratchpad/steering/slice0/FEASIBILITY.md §6, sweep.log)
// or from the product source it cites; nothing here was fitted to a drive.
//
// WHO MAY READ IT. The builder (`build-pathrefs.mjs`), the controller
// (`../path-follow.mjs`, via the committed pathref) AND the independent side
// (`../path-evidence.mjs`, `tools/audit/path-canary.mjs`). The last two may import
// this file because it holds no controller state and no witness — only the
// declared bands, stop targets and product targets (DESIGN-v2 §8.1).
//
// `along` is metres along the APPROACH heading from the authored gear-change
// pose, + past it. `lat` is + to the right of the approach heading. `yaw` is
// degrees, + clockwise.
// -----------------------------------------------------------------------------

/** p90 bound of the post-arm roll (check/v3-arith.cjs, check/v21-check.cjs at
 *  a_rev 1.06 / a_coast 0.23); replaced by measurement on the first canary. */
export const ARM_ROLL_ALLOW_M = 0.2;
/** The roll the stop target pre-compensates. */
export const ARM_ROLL_EXP_M = 0.1;
/** The builder refuses an acceptance band narrower than this (§2.2 step 3). */
export const ACCEPT_MIN_WIDTH_M = 1.0;
/**
 * WHERE THE CAR COMES TO REST, AGAINST WHERE IT AIMED (2026-09-16).
 *
 * A reverse aims its final stop at the WITNESS END (`path-follow.mjs`
 * reverseFollowStep: `toStopM = cursor.toEndM`) and comes to rest SHORT of it,
 * always, by about a third of a metre. Until now nothing in the plan knew that:
 * the park box was asked of the witness's LAST ROW, so a witness that stopped
 * 0.33 m inside the box put the car 0.03 m outside it, and the harness booked the
 * segment UNJUDGED — «THE HARNESS MISSED THE BOX» — on a drive that had tracked
 * its witness to 2 cm. This is the LONGITUDINAL half of the measurement whose
 * lateral half was already budgeted for (`build-pathrefs.mjs`
 * PARK_GATE_FOLLOW_M); only the lateral half existed, so half the error was
 * silently assumed to be zero.
 *
 * WHY THE CAR STOPS SHORT, FROM THE PINNED MODEL. `stopTrigger`'s R brake branch
 * (path-follow.mjs, its arithmetic pinned by path-follow.test.mjs T6.3) reserves
 * `v1²/(2·aCoast) + 0.05` m for a COAST-OUT below v1 = 1 km/h. The pedal grammar
 * has not coasted there since 2026-09-15: once any final latch is set W is
 * pressed the first read it is safely pressable while moving and HELD through
 * rest, so the car brakes at aB the whole way. The reserve the car never spends
 * is v1²/(2·aCoast) − v1²/(2·aB) + 0.05 = 0.0772/0.46 − 0.0772/10.594 + 0.05 =
 * 0.2105 m, and it is speed-independent. The model is NOT changed here: it is the
 * product's own stop arithmetic and T6.3 pins it. The PLAN is what moves.
 *
 * AND FROM MEASUREMENT, TWICE, INDEPENDENTLY OF THE MODEL.
 *   · THE BROWSER: canary-path-s2 sc-park-wall came to rest 0.195 m short of its
 *     witness end (`_audit-status.json` pathEvidence.stops routeEnd stopErrM
 *     −0.195, distToTargetM 0.224).
 *   · THE CALIBRATED BENCH: 78 clean drives, 9 lessons × 10 seeds, the rest centre
 *     matched to the nearest witness row — 0.197…0.365 m back along the witness
 *     arc, p90 0.300, and a median of exactly 0.300 on EVERY lesson. The residue
 *     the row does not explain is 0.004…0.233 m of offset and −5.19…+2.04° of
 *     heading, which is what PARK_GATE_FOLLOW_M covers.
 *
 * 0.300, not the model's 0.2105: the runner reads `toStopM` once per poll, so the
 * car also gives up whatever it covers between the sub-tick that crosses the
 * trigger and the next one. The bench p90 is the number a plan must survive; the
 * model and the browser are the two witnesses that it is not a bench artefact.
 *
 * CONSUMED BY `build-pathrefs.mjs` pickStop / planReverseOnce: the product park
 * gate and the committed `endParkBox` are evaluated at the row REST_BACK_M of arc
 * BEFORE the candidate stop — the pose the car will actually be graded in — and
 * the witness still ends at the row the follower aims at. A drive that does not
 * reach the box is still reported by name; nothing about the box itself moved.
 */
export const REST_BACK_M = 0.3;
/**
 * THE REVERSE WHEEL THE CAR REALLY HAS (2026-09-16). The fraction of the kinematic
 * lock curvature the PRODUCT delivered over its saturated reverse arcs: 0.892 on
 * sc-park-wall R1 (3.4 m) and 0.896 on sc-park-left R1 (3.9 m), canary-path-s2 at
 * 4209dad (_audit-path.json: true centre arc over camera yaw). It is the same
 * measurement `path-bench.mjs` BENCH.revKappaScale is calibrated to, and
 * `path-follow.test.mjs` T13.4 pins the bench to it; the LOWER of the two is taken,
 * because a witness the car can follow on one lesson and not the other is not a plan.
 *
 * NOT A TOLERANCE — A MODEL OF THE CAR. Witnesses are integrated at κ × 0.95
 * (build-pathrefs.mjs GENERATOR.kappaScale), so a reverse witness planned at full
 * lock asked the car for 0.95 / 0.892 − 1 ≈ 6.5 % more curvature than it has, over
 * every metre of the arc; the follower is saturated on such an arc and the error
 * only grows. CONSUMED BY `build-pathrefs.mjs` planReverseOnce (`ctx.reverseAuthority`)
 * → `planner.mjs lockFor`, which caps every REVERSE plan's wheel at
 * atan(0.892 / 0.95 · tan(lock)) = 0.5710 rad at 3 km/h against the product's 0.6.
 * `path-plan.test.mjs` asserts the committed re-planned rows respect it.
 */
export const REVERSE_LOCK_AUTHORITY = 0.892;
/** Band tightening on a failed corner screen (§2.2 step 3). */
export const TIGHT_LAT_M = 0.15;
export const TIGHT_YAW_DEG = 1.5;
/** The D profile never asks for rest (§6.2, N3). */
export const D_FLOOR_KMH = 3.0;
/** The constant R band (§6.2, N3). */
export const R_BAND_KMH = Object.freeze({ lo: 3.2, hi: 3.7 });
/** Refusal `acquisition` (§7.7). */
export const ACQUISITION = Object.freeze({ ctM: 1.0, yawDeg: 15, replannedCtM: 1.2, replannedYawDeg: 18 });
/** The actuation allowance added to every witness corridor (§2.4). */
export const CORRIDOR_ALLOWANCE_M = 0.35;
/** Dwell clamp (§2.7). */
export const DWELL_CLAMP_S = Object.freeze({ min: 1.0, max: 15 });
/** Inserted R→D stops dwell this long (§2.7). */
export const INSERTED_DWELL_S = 1.0;

export const TRACK = "FEASIBLE-TRACK";
export const ENDPOSE = "FEASIBLE-ENDPOSE";
export const INFEASIBLE = "INFEASIBLE";

const SLICE0 = "scratchpad/steering/slice0/FEASIBILITY.md §6 (full runs ±1.0/0/+0.5/+1.0/+2.0) and sweep.log (quick runs ±0.25/±0.5 along, ±0.25 lat, ±2.5°)";
const band = (alongM, lat, yaw) => ({
  alongM,
  latM: Array.isArray(lat) ? lat : [-lat, lat],
  yawDeg: Array.isArray(yaw) ? yaw : [-yaw, yaw],
});

/**
 * One reverse segment's arm policy. `expect[grid]` is what Slice 0 measured at
 * that start offset (class, worst centre deviation, κ scale it was measured
 * at); `null` means Slice 0 never screened that cell and the builder records
 * what it finds (it must not be INFEASIBLE).
 */
const rev = (o) => Object.freeze({ gear: "R", screenedBySlice0: true, oneSided: false, ...o });

export const REVERSE_POLICY = Object.freeze({
  "sc-park-wall": {
    1: rev({
      classAtAuthored: TRACK, devAtAuthoredM: 0.09, policyStartTargetM: -0.25,
      band: band([-1.0, 0.25], 0.25, 2.5), witnessGrid: [-1.0, -0.5, 0],
      expect: { "-1": [TRACK, 0.22, 1], "-0.5": [TRACK, 0.14, 1], "0": [TRACK, 0.09, 0.95] },
      why: "robust to −1.0 (0.22). The authored annotation at t = 31.88 s says «Спри РАНО … стената не оставя място»: the wall is ahead, so overshoot is not bought",
      src: SLICE0,
    }),
  },
  "sc-park-left": {
    1: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.1, policyStartTargetM: 0, band: band([-0.5, 1.0], 0.25, 2.5), witnessGrid: [-0.5, 0, 0.5], expect: { "-0.5": [TRACK, 0.14, 1], "0": [TRACK, 0.097, 0.95], "0.5": [TRACK, 0.07, 1] }, why: "robust", src: SLICE0 }),
  },
  "sc-park-van": {
    1: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.1, policyStartTargetM: 0, band: band([-0.5, 1.0], 0.25, 2.5), witnessGrid: [-0.5, 0, 0.5], expect: { "-0.5": [TRACK, 0.14, 1], "0": [TRACK, 0.09, 0.95], "0.5": [TRACK, 0.07, 1] }, why: "robust", src: SLICE0 }),
  },
  "sc-pk-driveway": {
    1: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.05, policyStartTargetM: 0, band: band([-0.5, 1.0], 0.25, 2.5), witnessGrid: [-0.5, 0, 0.5], expect: { "-0.5": [TRACK, 0.07, 1], "0": [TRACK, 0.041, 0.95], "0.5": [TRACK, 0.03, 1] }, why: "robust", src: SLICE0 }),
  },
  "sc-park-judge": {
    1: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.1, policyStartTargetM: 0, band: band([-0.5, 1.0], 0.25, 2.5), witnessGrid: [-0.5, 0, 0.5], expect: { "-0.5": [TRACK, 0.15, 1], "0": [TRACK, 0.099, 0.95], "0.5": [TRACK, 0.07, 1] }, why: "robust", src: SLICE0 }),
  },
  "sc-park-zebra": {
    1: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.2, policyStartTargetM: 0.5, band: band([0, 1.5], 0.25, 2.5), witnessGrid: [0, 0.5, 1.0], expect: { "0": [TRACK, 0.208, 0.95], "0.5": [TRACK, 0.13, 1], "1": [TRACK, 0.09, 1] }, why: "−1.0 is ENDPOSE; swing-out lat −0.25 gives 0.45", src: SLICE0 }),
  },
  "sc-park-gap-short": {
    1: rev({
      classAtAuthored: TRACK, devAtAuthoredM: 0.46, policyStartTargetM: 1.0,
      // ONE-SIDED, as Slice 0 §6 recommends in terms: «lateral and yaw error
      // allowed on one side only (+0.25 m, −2.5°)». The corners are screened by
      // the builder (they were not by Slice 0) and whatever survives is committed.
      band: band([0.5, 2.0], [0, 0.25], [-2.5, 0]), oneSided: true, screenedBySlice0: false,
      witnessGrid: [0.5, 1.0, 1.5], expect: { "0.5": [TRACK, 0.24, 1], "1": [TRACK, 0.15, 1], "1.5": null },
      why: "−0.25 is ENDPOSE; lat and yaw one-sided at 0", src: SLICE0,
    }),
  },
  "sc-park-45-rev": {
    1: rev({
      classAtAuthored: ENDPOSE, devAtAuthoredM: 0.64, policyStartTargetM: 1.0,
      band: band([0.5, 2.0], [0, 0.25], [-2.5, 0]), oneSided: true, screenedBySlice0: false,
      witnessGrid: [0.5, 1.0, 1.5], expect: { "0.5": [TRACK, 0.38, 1], "1": [TRACK, 0.21, 1], "1.5": null },
      why: "+0.5 gives TRACK 0.38; +1.0 gives 0.21. At the authored arm lat +0.25 is TRACK 0.43 and −0.25 ENDPOSE 0.84; yaw −5 helps (0.40), +2.5 does not",
      src: SLICE0,
    }),
  },
  "sc-ed-poligon-chain": {
    1: rev({
      classAtAuthored: ENDPOSE, devAtAuthoredM: 1.15, policyStartTargetM: 2.0,
      band: band([1.5, 3.0], 0.25, 2.5), screenedBySlice0: false,
      witnessGrid: [1.5, 2.0, 2.5], expect: { "1.5": null, "2": [TRACK, 0.18, 1], "2.5": null },
      why: "only +2.0 was screened (TRACK 0.18). Cone clearance unscreened (§10.5)", src: SLICE0,
    }),
    3: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.01, policyStartTargetM: 0, band: band([-0.5, 1.0], 0.25, 2.5), witnessGrid: [-0.5, 0, 0.5], expect: { "-0.5": [TRACK, 0.01, 1], "0": [TRACK, 0.013, 0.95], "0.5": [TRACK, 0.01, 1] }, why: "straight 15 m", src: SLICE0 }),
    5: rev({ classAtAuthored: TRACK, devAtAuthoredM: 0.22, policyStartTargetM: 0, band: band([-0.5, 1.0], 0.25, 2.5), witnessGrid: [-0.5, 0, 0.5], expect: { "-0.5": [TRACK, 0.26, 1], "0": [TRACK, 0.222, 0.95], "0.5": [TRACK, 0.16, 1] }, why: "−1.0 gives 0.31", src: SLICE0 }),
  },
  "sc-park-bay-exit-rev": {
    0: rev({
      classAtAuthored: INFEASIBLE, devAtAuthoredM: null, policyStartTargetM: 0,
      // From spawn. The roll runs along the witness's own first metre (straight
      // back out of the bay), so the start band is widened by 0.20 m on the
      // reverse side only.
      band: band([-0.5, 0.3], 0.3, 3), witnessGrid: [0], expect: { "0": null },
      designedNegative: true,
      relaxedBox: { posM: 1.0, yawDeg: 15 },
      replan: "reachZone sc-pbe-out r 2.5 m (templates-parking2.ts:887-888,994)",
      replannedTo: { x: 0.28, y: -2.4, psi: 14.97, devM: 0.77, src: "FEASIBILITY.md §8" },
      // ── OPEN, AND IT IS A POLICY QUESTION, NOT A PLANNER ONE (2026-09-16) ──
      // This is the one lesson of the six the body screen refused that the clearance
      // objective (planner.mjs clearanceObjective) could NOT repair. Measured with
      // five deterministic starts against the mounted bodies of lot-perp-v1:
      //   · against the authored end + this relaxedBox: −0.2001 m — the committed
      //     witness's own penetration, unmoved;
      //   · against replannedTo + this relaxedBox: −0.0845 m at corridor 1.469 m,
      //     and RAISING the deviation corridor to 2.0 / 2.5 / 3.0 / 4.0 m stops
      //     improving it at +0.0830 m. The binding constraint is this END BOX, not
      //     the corridor, and no corridor buys the 0.15 m floor;
      //   · against Задача 1's zone ALONE it reaches 0.45 m — by stopping 0.5 m out
      //     of the bay, 2.494 m from the zone centre against r 2.5. The zone is
      //     satisfied without performing the manoeuvre, so that witness is worthless
      //     and was not adopted.
      // So sc-park-bay-exit-rev stays REFUSED by the emit gate and its previous
      // pathref is left alone. Making it safe needs one of: a different re-planned
      // target, a wider relaxedBox, or a change to the bay layout — each of which
      // moves what the lesson teaches, and none of which a planner may decide.

      why: "Slice 0 §8: three planners found no stop inside 0.5 m / 10°; the closest was 0.72 m / ≈14°. Re-planned to the relaxed 1.0 m / 15° box",
      src: SLICE0,
    }),
  },
});

/** Forward-segment expectations (Slice 0 §2, κ = 1 on long segments). */
export const FORWARD_EXPECT = Object.freeze({
  "sc-park-wall": { 0: [TRACK, 0.05] },
  "sc-park-left": { 0: [TRACK, 0.05] },
  "sc-park-zebra": { 0: [TRACK, 0.06], 2: [TRACK, 0.01] },
  "sc-park-gap-short": { 0: [TRACK, 0.05], 2: [TRACK, 0.02] },
  "sc-park-gap-long": { 0: [TRACK, 0.06] },
  "sc-park-judge": { 0: [TRACK, 0.06], 2: [TRACK, 0.024] },
  "sc-park-45-rev": { 0: [TRACK, 0.05] },
  "sc-park-van": { 0: [TRACK, 0.05] },
  "sc-pk-driveway": { 0: [TRACK, 0.011] },
  "sc-park-bay-exit-rev": { 1: [TRACK, 0.021] },
  "sc-ed-poligon-chain": { 0: [TRACK, 0.0], 2: [TRACK, 0.083], 4: [TRACK, 0.183], 6: [TRACK, 0.15] },
});

/** The eleven lessons of Slice 1 (DESIGN-v2 §1.3). */
export const PATH_LESSONS = Object.freeze(Object.keys(FORWARD_EXPECT));

/** stopTarget = clamp(policyStartTarget + expected roll, accMin + 0.4, alongMax − 0.5) (§2.2 step 3, N2). */
export function stopTargetOf(p, allowM = ARM_ROLL_ALLOW_M, expM = ARM_ROLL_EXP_M) {
  const [alongMin, alongMax] = p.band.alongM;
  const accMin = alongMin + allowM;
  const want = p.policyStartTargetM + expM;
  return Math.round(Math.min(Math.max(want, accMin + 0.4), alongMax - 0.5) * 1000) / 1000;
}
/** [alongMin + armRollAllowM, alongMax] (§2.4). */
export function acceptAlongOf(p, allowM = ARM_ROLL_ALLOW_M) {
  const [alongMin, alongMax] = p.band.alongM;
  return [Math.round((alongMin + allowM) * 1000) / 1000, alongMax];
}

const bay = (x, y, headingDeg, widthM, lengthM) => ({ x, y, headingDeg, widthM, lengthM });

/**
 * The product's graded targets, copied from Slice 0 `feasibility.mjs` PRODUCT
 * with the same `src` cites. `park.seg` is the gear segment the product box
 * grades ("last" = the final segment).
 */
export const PRODUCT = Object.freeze({
  "sc-park-gap-short": { park: { seg: "last", bay: bay(6.28, 0, 0, 2.5, 4.5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:580-586,760-770" } },
  "sc-park-gap-long": { park: { seg: "last", bay: bay(6.28, 0, 0, 2.5, 6.5), centerTolM: 0.5, headingTolDeg: 10, entry: "forward", src: "templates-parking3.ts:589-595,904-915" } },
  "sc-park-van": { park: { seg: "last", bay: bay(5.03, 0, 90, 2.7, 5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:598-604,1050-1060" } },
  "sc-park-45-rev": { park: { seg: "last", bay: bay(4.8, 0, 135, 2.7, 5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:607-613,1206-1216" } },
  "sc-park-left": { park: { seg: "last", bay: bay(-5.03, 0, 270, 2.7, 5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:616-622,1333-1343" } },
  "sc-park-zebra": { park: { seg: "last", bay: bay(6.28, 11.75, 0, 2.5, 5.5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:627-633,1501-1511" } },
  "sc-park-wall": { park: { seg: "last", bay: bay(5.03, 5.4, 90, 2.7, 5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:636-642,1659-1669" } },
  "sc-park-judge": { park: { seg: "last", bay: bay(6.28, 7.4, 0, 2.5, 4.2), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-parking3.ts:663-669,2082-2092" } },
  "sc-pk-driveway": { park: { seg: "last", bay: bay(8.0, 45.0, 90, 2.7, 5), centerTolM: 0.5, headingTolDeg: 10, entry: "reverse", src: "templates-pk.ts:276-282,347-360" } },
  "sc-ed-poligon-chain": {
    park: { seg: 1, bay: bay(143, -127, 0, 2.6, 5.0), centerTolM: 0.6, headingTolDeg: 12, entry: "reverse", src: "templates-exam.ts:1213,1293-1305" },
    zones: [
      { name: "sc-pgc-rev-settle", x: -135, y: -136.4, r: 3, src: "templates-exam.ts:1310" },
      { name: "sc-pgc-rev-mid", x: -127.5, y: -136.4, r: 2, src: "templates-exam.ts:1316" },
      { name: "sc-pgc-rev-end", x: -120, y: -136.4, r: 2.5, src: "templates-exam.ts:1322" },
    ],
    turn: { corridor: { x: -150, y: -131.5, halfWidthM: 8, halfLengthM: 11 }, startHeadingDeg: 270, toleranceDeg: 20, src: "templates-exam.ts:1215,1326-1335" },
  },
  "sc-park-bay-exit-rev": {
    zones: [
      { name: "sc-pbe-out (Задача 1)", x: 1.0, y: -3.03, r: 2.5, src: "templates-parking2.ts:887-888,994" },
      { name: "sc-pbe-away (Задача 2)", x: 0, y: 20, r: 6, src: "templates-parking2.ts:1002" },
    ],
  },
});

/**
 * Per-lesson caveats a judge must read beside a credit (DESIGN-v2 §8.3.14, C-S4).
 */
export const CAVEATS = Object.freeze({
  "sc-park-van": ["corridor: a credit refutes \"no success path\" only for the authored lane change; the parked row stands 2.53 / 2.34 m inside the spawn lane (parking3-success-path-and-corridor.test.ts:24-31)"],
  "sc-park-45-rev": ["corridor: a credit refutes \"no success path\" only for the authored lane change; the parked row stands 2.53 / 2.34 m inside the spawn lane (parking3-success-path-and-corridor.test.ts:24-31)"],
  "sc-park-judge": ["dual wording: the \"guided line\" reading stays open for a -right leg"],
  "sc-pk-driveway": ["dual wording: the \"guided line\" reading stays open for a -right leg"],
  "sc-park-bay-exit-rev": ["authored R end pose infeasible for this car (Slice 0 §8); re-planned to (0.28, −2.40, 15°) — graded only by Задача 1's zone"],
});

/**
 * Staged actors whose timing a path leg can perturb (DESIGN-v2 §8.1
 * `arrivalLagFromSamples`). Only the one Slice 0 located on the authored line
 * carries an arc; sc-pk-driveway's walker has no authored stop on the trace and
 * so has no arc to lag against — it is listed so ATTRIBUTION says so rather than
 * silently releasing its codes.
 */
export const STAGED_ACTORS = Object.freeze({
  "sc-park-bay-exit-rev": [{ actor: "walker", seg: 1, arcM: 14.2, src: "FEASIBILITY.md §7.1 (authored 7.15 s wait at 14.2 m)" }],
  "sc-pk-driveway": [{ actor: "walker", seg: null, arcM: null, src: "failure-census.md (w47 pc struck a pedestrian); no authored wait on the trace" }],
});

/**
 * WHAT THE BUILDER COMMITTED — the band that SURVIVED the corner screen and the
 * witness corridor, per segment, copied out of the committed pathrefs so the
 * INDEPENDENT side (`path-evidence.mjs`, `path-canary.mjs`), which may not read
 * a pathref, gates against the same numbers the controller drove with
 * (DESIGN-v2-CHECK §D6). `__tests__/path-plan.test.mjs` pins this table equal to
 * the pathrefs, so a rebuild that moves a band goes red until it is copied here.
 */
export const COMMITTED = Object.freeze({
  "sc-park-wall": {
    0: { corridorM: 0.446 },
    1: { corridorM: 0.819, band: { alongM: [-1,0.25], latM: [-0.15,0], yawDeg: [-1.5,1.5] } },
  },
  "sc-park-left": {
    0: { corridorM: 0.431 },
    1: { corridorM: 0.82, band: { alongM: [-0.5,1], latM: [-0.05,0.15], yawDeg: [-1.5,1.5] } },
  },
  "sc-park-zebra": {
    0: { corridorM: 0.406 },
    1: { corridorM: 0.821, band: { alongM: [0,1.5], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    2: { corridorM: 0.389 },
  },
  "sc-park-gap-short": {
    0: { corridorM: 0.526 },
    1: { corridorM: 0.82, band: { alongM: [0.5,2], latM: [0,0.25], yawDeg: [-2.5,0] } },
    2: { corridorM: 0.386 },
  },
  "sc-park-gap-long": {
    0: { corridorM: 0.596 },
  },
  "sc-park-judge": {
    0: { corridorM: 0.402 },
    1: { corridorM: 0.774, band: { alongM: [-0.5,1], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    2: { corridorM: 0.379 },
  },
  "sc-park-45-rev": {
    0: { corridorM: 0.535 },
    1: { corridorM: 0.82, band: { alongM: [0.5,2], latM: [0,0.25], yawDeg: [-2.5,0] } },
  },
  "sc-park-van": {
    0: { corridorM: 0.46 },
    1: { corridorM: 0.82, band: { alongM: [-0.5,1], latM: [-0.15,0.05], yawDeg: [-1.5,1.5] } },
  },
  "sc-pk-driveway": {
    0: { corridorM: 0.437 },
    1: { corridorM: 0.771, band: { alongM: [-0.5,1], latM: [-0.25,0.25], yawDeg: [-2.5,2.5] } },
  },
  "sc-park-bay-exit-rev": {
    0: { corridorM: 1.412, band: { alongM: [-0.5,0.3], latM: [-0.3,0.3], yawDeg: [-3,3] } },
    1: { corridorM: 1.287 },
  },
  "sc-ed-poligon-chain": {
    0: { corridorM: 0.352 },
    1: { corridorM: 0.846, band: { alongM: [1.75,3], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    2: { corridorM: 0.486 },
    3: { corridorM: 0.714, band: { alongM: [-0.5,1], latM: [-0.25,0.25], yawDeg: [-2.5,2.5] } },
    4: { corridorM: 0.675 },
    5: { corridorM: 0.846, band: { alongM: [-0.5,1], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    6: { corridorM: 0.813 },
  },
});

/** The reverse policy row for a lesson segment, or null. */
export function reversePolicyFor(lesson, k) {
  return REVERSE_POLICY[lesson]?.[k] ?? null;
}
/** The band a reverse segment may START in: the committed (screened) one when present, else the declared one. */
export function bandFor(lesson, k) {
  const c = COMMITTED[lesson]?.[k]?.band;
  if (c) return c;
  return REVERSE_POLICY[lesson]?.[k]?.band ?? null;
}
/** The class corridor a segment's independent route is held to (§2.4): committed, else derived from Slice 0. */
export function corridorFor(lesson, k) {
  const c = COMMITTED[lesson]?.[k]?.corridorM;
  if (Number.isFinite(c)) return c;
  const p = REVERSE_POLICY[lesson]?.[k];
  if (p) {
    const devs = Object.values(p.expect ?? {}).filter(Boolean).map((e) => e[1]);
    const worst = Math.max(p.classAtAuthored === TRACK ? 0.5 : 0, ...devs);
    return Math.round(Math.min(1.5, worst + CORRIDOR_ALLOWANCE_M) * 1000) / 1000;
  }
  const f = FORWARD_EXPECT[lesson]?.[k];
  return f ? Math.round(Math.min(1.5, f[1] + CORRIDOR_ALLOWANCE_M) * 1000) / 1000 : null;
}

/** Every reverse segment's full policy row, flattened, for tables and tests. */
export function reversePolicyRows() {
  const rows = [];
  for (const [lesson, segs] of Object.entries(REVERSE_POLICY)) {
    for (const [k, p] of Object.entries(segs)) {
      rows.push({ lesson, k: Number(k), ...p, stopTargetM: p.designedNegative ? null : stopTargetOf(p), acceptAlongM: p.designedNegative ? null : acceptAlongOf(p) });
    }
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE IN-BAY LATERAL LIMIT IS RETIRED (2026-09-16) — IT WAS A PROXY, AND THE
 * THING IT STOOD IN FOR IS NOW MEASURED ON BOTH SIDES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT USED TO BE HERE. `BAY_FLANKS`, `BAY_CLEARANCE_MARGIN_M`,
 * `BAY_MOUTH_INSET_M`, `PLAYER_HALF_WIDTH_M`, `PLAYER_HALF_LENGTH_M`,
 * `bayLateralLimits` and `bayLateralExceeds`: a table of one scalar face per side
 * of each bay, and the rule
 *
 *     |lat from the bay axis|  ≤  faceM − 0.85·cos10° − 2.02·sin10° − margin
 *
 * applied where the centre was 0.5 m inside the painted length and the body
 * within 20° of the bay axis. `path-follow.mjs` refused `bay-lateral` on it and
 * `path-evidence.mjs bayLateralOfRun` published it as contact witness 5.1.
 *
 * WHY IT IS GONE AND NOT RE-TUNED. It was a stand-in for body clearance, written
 * when nothing in this harness could measure body clearance. Both sides can now:
 * `path-plan/body-screen.mjs` screens a PLAN with the swept chassis box against
 * the district's mounted bodies, and `lib/drive-clearance.mjs` screens a DRIVE
 * the same way. Every time the proxy met the truth it had to be loosened —
 *
 *   · the deviation corridor widened 0.5 → 0.82 m to admit clearing witnesses;
 *   · `BAY_CLEARANCE_MARGIN_M` was cut 0.10 → 0.03 m and had to be REVERTED
 *     (the sweep behind the cut did not reproduce, 16/100 claimed vs 31/100
 *     measured, and the cut also loosened two AUTHORED faces that never had a rig
 *     and so were never standing in for a fleet-box error);
 *   · and finally the proxy contradicted the PLANNER: the clearance-maximising
 *     witness for sc-park-wall ends ~0.16 m off the bay axis on purpose, and the
 *     proxy refused it with `bay-lateral` before any contact. The planner was
 *     being rewarded for exactly what the follower punished.
 *
 * A guard that has to be loosened every time it disagrees with the measurement it
 * approximates is not a guard, it is a knob. It is retired.
 *
 * AND IT WAS BLIND WHERE IT MATTERED MOST. Its two windows — |lon| ≤ 2 m and
 * ≤ 20° off the bay axis — were what made a position-only formula safe, and they
 * hid the two AUTHORED faces entirely. Measured over 100 clean bench drives, the
 * closest the car ever came to the sc-park-wall garage wall was 0.1874 m, with
 * the centre 4.32 m down the bay axis and 104° off it, and to the sc-pk-driveway
 * alley wall 0.8278 m at 2.94 m and 150°. BOTH are outside both windows: at the
 * pose that mattered, the proxy did not evaluate the authored faces at all. The
 * clearance guard that replaced it is armed for every segment of every drive and
 * measures those two walls at their authored dimensions like any other body.
 *
 * WHAT REPLACED IT, AND WHERE:
 *   · the follower's refusal → `path-follow.mjs bodyClearanceRefusal`, on
 *     `drive-clearance.mjs bodyClearanceGuard`, floor `DRIVE_CLEARANCE_FLOOR_M`;
 *   · contact witness 5.1 → the injected `driveClearance` record, read through
 *     the one predicate `drive-clearance.mjs driveClearanceGate`;
 *   · the faceM table's job (re-deriving each body from `content/world` and the
 *     platform sources, and failing when one moves or cannot be read) →
 *     `body-screen.mjs mountedBodies`, which derives all of it at run time rather
 *     than keeping a hand-maintained copy, and refuses by name what it cannot
 *     read. `__tests__/path-body-screen.test.mjs` pins that.
 *
 * `bayFrame` STAYS. It is pure geometry — the bay frame of a point — with no
 * threshold in it, and the canary, the product-box check and the tests use it to
 * SAY WHERE a car ended. Nothing gates on it.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE PLAYER CHASSIS HALF EXTENTS. These are NOT part of the retired proxy — they are the
 * rapier chassis collider itself (`vehicle/tuning.ts` CHASSIS_HALF_EXTENTS,
 * `collision/bodies.ts:41-43`), and `build-pathrefs.mjs` derives the PRODUCT BOX tolerances
 * from them. They must equal `body-screen.mjs CHASSIS_HALF`, which is the same collider read
 * for the same reason; `__tests__/path-body-screen.test.mjs` pins the two together rather
 * than this file importing that one, because `body-screen.mjs` reads the filesystem at call
 * time and `policy.mjs` is imported by everything.
 */
export const PLAYER_HALF_WIDTH_M = 0.85;
export const PLAYER_HALF_LENGTH_M = 2.02;

/** Bay frame of a PROBE-frame point (x, z = −y): lon along the bay heading, lat + right of it. */
export function bayFrame(bay, x, z) {
  const h = (bay.headingDeg * Math.PI) / 180;
  const ax = Math.sin(h);
  const ay = Math.cos(h);
  const rx = x - bay.x;
  const ry = -z - bay.y;
  return { lonM: rx * ax + ry * ay, latM: rx * ay - ry * ax };
}
