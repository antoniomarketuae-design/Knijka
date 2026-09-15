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
    0: { corridorM: 0.405 },
    1: { corridorM: 0.783, band: { alongM: [-1,0.25], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
  },
  "sc-park-left": {
    0: { corridorM: 0.426 },
    1: { corridorM: 0.836, band: { alongM: [-0.5,1], latM: [-0.25,0.25], yawDeg: [-2.5,2.5] } },
  },
  "sc-park-zebra": {
    0: { corridorM: 0.406 },
    1: { corridorM: 0.792, band: { alongM: [0,1.5], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    2: { corridorM: 0.389 },
  },
  "sc-park-gap-short": {
    0: { corridorM: 0.587 },
    1: { corridorM: 0.677, band: { alongM: [0.5,2], latM: [0,0.25], yawDeg: [-2.5,0] } },
    2: { corridorM: 0.386 },
  },
  "sc-park-gap-long": {
    0: { corridorM: 0.596 },
  },
  "sc-park-judge": {
    0: { corridorM: 0.402 },
    1: { corridorM: 0.758, band: { alongM: [-0.5,1], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    2: { corridorM: 0.379 },
  },
  "sc-park-45-rev": {
    0: { corridorM: 0.779 },
    1: { corridorM: 0.813, band: { alongM: [0.5,2], latM: [0,0.25], yawDeg: [-2.5,0] } },
  },
  "sc-park-van": {
    0: { corridorM: 0.422 },
    1: { corridorM: 0.732, band: { alongM: [-0.5,1], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
  },
  "sc-pk-driveway": {
    0: { corridorM: 0.437 },
    1: { corridorM: 0.79, band: { alongM: [-0.5,1], latM: [-0.25,0.25], yawDeg: [-2.5,2.5] } },
  },
  "sc-park-bay-exit-rev": {
    0: { corridorM: 1.412, band: { alongM: [-0.5,0.3], latM: [-0.3,0.3], yawDeg: [-3,3] } },
    1: { corridorM: 1.287 },
  },
  "sc-ed-poligon-chain": {
    0: { corridorM: 0.352 },
    1: { corridorM: 0.85, band: { alongM: [1.75,3], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
    2: { corridorM: 0.486 },
    3: { corridorM: 0.724, band: { alongM: [-0.5,1], latM: [-0.25,0.25], yawDeg: [-2.5,2.5] } },
    4: { corridorM: 0.675 },
    5: { corridorM: 0.85, band: { alongM: [-0.5,1], latM: [-0.15,0.15], yawDeg: [-1.5,1.5] } },
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
 * THE IN-BAY LATERAL LIMIT — HOW FAR OFF THE BAY CENTRELINE THE CAR MAY BE
 * BEFORE ITS FLANK MEETS A NEIGHBOUR (2026-09-15, canary-path-s2 sc-park-left)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY. A reverse segment's witness corridor (COMMITTED[*].corridorM, 0.73–0.85 m)
 * is a whole-segment tolerance built from the swing-out of the manoeuvre. A 2.7 m
 * perpendicular bay has 0.93 m of air between a parked car's flank and a centred
 * player's — less once the player is yawed — so the corridor passed a car whose
 * centre was 0.59 m wide in the bay, and the product booked «Удар в друго превозно
 * средство» at 0.58 m. The last part of a reverse-into-bay segment is therefore held
 * to the room the PRODUCT'S OWN BODIES leave, derived here and nowhere else.
 *
 * THE BODIES, each from the geometry the browser mounts:
 *  · a parked occupant: every `occupied` bay of the district is mounted centred on the
 *    bay at its heading (platform/src/modules/sim/scene/lessonWorldRecipe.ts:261-271)
 *    and boxed with the fleet profile (collision/bodies.ts:133-141 actorObb →
 *    traffic/types.ts:215-267: car 4.1 × 1.84 m, van 5.2 × 1.98 m);
 *  · held scenery (scene/scenarioSceneryProps.ts): the sc-park-van panel van
 *    (`kargo_v`, y −2.7, :640-642), the sc-park-wall garage wall (y 8.6, 0.4 m thick,
 *    :648-650), the sc-pk-driveway north fence (y 47.3, 0.6 m thick, x 7–11, :742-746);
 *  · the player: the rapier chassis collider, 1.70 × 4.04 m (vehicle/tuning.ts:70
 *    CHASSIS_HALF_EXTENTS; collision/bodies.ts:41-43).
 *
 * THE LIMIT, per side of the bay axis (sign = `lat` of `bayFrame`, the Slice 0
 * productBoxCheck convention):
 *   limitM = faceM − PLAYER_HALF_WIDTH·cos θ − PLAYER_HALF_LENGTH·sin θ − margin
 * with θ = the park's own heading tolerance (10°: the most yaw a pose the product
 * CREDITS may carry) and margin = 0.10 m, because the browser sizes each occupant's
 * cuboid from its GLB rig, which the fleet box under-states «by a few centimetres»
 * (traffic/system.ts:1486-1496) — and on the one drive that touched, the fleet box
 * still read 0.13 m of air at the contact. faceM is the distance from the bay axis to
 * the nearest flanking face whose lengthwise span overlaps the bay. A side with no
 * flanking body has no limit (null).
 *
 * WHERE IT APPLIES: poses whose CENTRE lies at least BAY_MOUTH_INSET_M inside the bay's painted
 * length (|lon| ≤ lengthM/2 − 0.5; `lonHalfM`). Parallel kerb slots (gap-short, gap-long, zebra, judge) have
 * no entry: their occupants stand fore and aft (lat 0 in their bay frame), and the
 * kerb is not a body in the district. sc-ed-poligon-chain's cones stand ≥ 2.8 m off
 * its bay axis, beyond the segment corridor, so they bind nothing and have no entry.
 *
 * `__tests__/path-plan.test.mjs` re-derives every faceM from content/world/*.json and
 * the three platform sources above, and fails when any of them moves or cannot be read.
 */
export const PLAYER_HALF_WIDTH_M = 0.85;
export const PLAYER_HALF_LENGTH_M = 2.02;
export const BAY_CLEARANCE_MARGIN_M = 0.1;
/**
 * WHERE «THE LAST PART» BEGINS: the centre at least this far inside the bay's painted length,
 * |lon| ≤ lengthM/2 − 0.5. A parked occupant's bumper stands 0.45 m inside the paint (a 4.1 m
 * car centred in a 5 m bay), so at the mouth the swing is unfinished and the laterally extreme
 * corner is still out past it: canary-path-s2 sc-park-left at lon −2.48 m read lat 0.36 m at
 * yaw 21.7° with 0.60 m of air to the fleet box, and sc-park-wall −0.43 m at lon −2.44 m. On
 * the calibrated bench (20 seeds × 5 bay lessons) the limit applied from the mouth refused
 * 5/20 clean sc-park-left and 10/20 clean sc-park-van runs; from 0.5 m inside, none.
 */
export const BAY_MOUTH_INSET_M = 0.5;

export const BAY_FLANKS = Object.freeze({
  "sc-park-left": { k: 1, world: "lot-left-v1", neg: { faceM: 1.78, body: "lotlf-bay-2 (car, lat −2.70)" }, pos: { faceM: 1.78, body: "lotlf-bay-4 (car, lat +2.70)" } },
  "sc-park-wall": { k: 1, world: "lot-wall-v1", neg: { faceM: 3.0, body: "garage wall (y 8.6, 0.4 m, lat −3.20)" }, pos: { faceM: 1.78, body: "lotwl-bay-4 (car, lat +2.70)" } },
  "sc-park-van": { k: 1, world: "lot-van-v1", neg: { faceM: 1.78, body: "lotvn-bay-4 (car, lat −2.70)" }, pos: { faceM: 1.71, body: "kargo_v van (y −2.7, lat +2.70)" } },
  "sc-park-45-rev": { k: 1, world: "lot-45rev-v1", neg: { faceM: 1.78, body: "lot45r-bay-4 (car, lat −2.70, lon −2.70)" }, pos: { faceM: 1.78, body: "lot45r-bay-2 (car, lat +2.70, lon +2.70)" } },
  "sc-pk-driveway": { k: 1, world: "pk-drive-v1", neg: { faceM: 2.0, body: "north fence (y 47.3, 0.6 m, x 7–11, lat −2.30)" }, pos: null },
});

/** Bay frame of a PROBE-frame point (x, z = −y): lon along the bay heading, lat + right of it. */
export function bayFrame(bay, x, z) {
  const h = (bay.headingDeg * Math.PI) / 180;
  const ax = Math.sin(h);
  const ay = Math.cos(h);
  const rx = x - bay.x;
  const ry = -z - bay.y;
  return { lonM: rx * ax + ry * ay, latM: rx * ay - ry * ax };
}

/** The in-bay lateral limits of a reverse segment, or null where the product geometry gives none. */
export function bayLateralLimits(lesson, k) {
  const f = BAY_FLANKS[lesson];
  const park = PRODUCT[lesson]?.park;
  if (!f || f.k !== k || !park?.bay) return null;
  const th = (park.headingTolDeg * Math.PI) / 180;
  const body = PLAYER_HALF_WIDTH_M * Math.cos(th) + PLAYER_HALF_LENGTH_M * Math.sin(th);
  const lim = (side) => (side ? Math.round((side.faceM - body - BAY_CLEARANCE_MARGIN_M) * 1000) / 1000 : null);
  return {
    lesson, k, bay: park.bay, lonHalfM: park.bay.lengthM / 2 - BAY_MOUTH_INSET_M, insetM: BAY_MOUTH_INSET_M,
    negM: lim(f.neg), posM: lim(f.pos), yawAllowDeg: park.headingTolDeg, marginM: BAY_CLEARANCE_MARGIN_M,
    neg: f.neg, pos: f.pos,
    why: `in-bay lateral limit from the product's own bodies: face − ${PLAYER_HALF_WIDTH_M}·cos${park.headingTolDeg}° − ${PLAYER_HALF_LENGTH_M}·sin${park.headingTolDeg}° − ${BAY_CLEARANCE_MARGIN_M} m`,
  };
}

/** Is this signed lateral outside its side's limit? null when the limits are absent; false on a side with no flanking body. */
export function bayLateralExceeds(limits, latM) {
  if (!limits || !Number.isFinite(latM)) return null;
  const lim = latM < 0 ? limits.negM : limits.posM;
  return lim === null ? false : Math.abs(latM) > lim + 1e-9;
}
