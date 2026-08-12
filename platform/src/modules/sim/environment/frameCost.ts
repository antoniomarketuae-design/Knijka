/**
 * THE FRAME — what a district actually costs to draw, and the only thing in
 * this repo allowed to say PASS about a draw budget.
 *
 * ── THE FAILURE THIS FILE EXISTS TO END ────────────────────────────────────
 * `perfBudget.ts` has always scored a metric labelled „draw calls / frame (all
 * passes)". Nothing ever fed it. What the project actually managed to for
 * months was `world.stats.drawCallEstimate` (now `staticDrawSlots`): a STATIC
 * count of merged world meshes, asserted `<= 150` in ~50 district tests and,
 * in `b65-street-furniture.test.ts`, asserted against `PERF_BUDGETS.low.drawCalls`
 * under the title „keeps every dressed street inside the tier-low draw budget".
 * All of them passed. All 105 districts scored 56–67.
 *
 * Then somebody counted the running product. At tier low, level 1, on
 * /dev/drive-rig at 1264×619, 37 of 37 districts measured were over the HARD
 * cap: 146 to 252 draw calls per frame, median 202. The static number was
 * 26–41 % of the frame and correlated with it at r = 0.37.
 *
 * A static count of world meshes cannot answer the frame question. It has no
 * term for the cockpit, the hero car, the level-1 aid stack, NPC traffic,
 * pedestrians, the sky, weather, the mirror render-to-texture or the composer,
 * and no amount of care in maintaining it would give it one.
 *
 * ── WHAT REPLACES IT ───────────────────────────────────────────────────────
 * Two things, and they check each other:
 *
 *  1. `frameDrawCeiling()` — a CEILING built by enumerating every subsystem
 *     that submits draws, with a per-tier maximum for each. It is allowed to
 *     be pessimistic; it is not allowed to omit a subsystem. It is the answer
 *     to „can this district possibly fit".
 *
 *  2. `MEASURED_FRAMES` — frames that were actually counted, with provenance,
 *     and the verdict each one currently earns. `frameCost.test.ts` asserts
 *     the ceiling dominates every one of them: if a new subsystem starts
 *     drawing and the ceiling has no term for it, a re-measurement breaks the
 *     test rather than quietly passing.
 *
 * And a type: `MeasuredFrame` is nominal, and `scoreFrameDrawBudget` takes
 * nothing else. `world.stats.staticDrawSlots` is a `number`; a number cannot
 * be widened into a `MeasuredFrame`, so the old mistake no longer compiles.
 *
 * ── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────
 * Not one millisecond. Every measurement below was taken in headless chromium
 * on ANGLE/D3D11 with SwiftShader available; draw and triangle counts are
 * properties of the scene graph and transfer, frame times do not. The Galaxy
 * A16 gate in doc 82 §2.4 is still open and nothing here closes it.
 */

import { PERF_BUDGETS, type PerfMetricVerdict, type PerfTier } from "./perfBudget";

// ---------------------------------------------------------------------------
// A frame you are allowed to score
// ---------------------------------------------------------------------------

declare const MEASURED_BRAND: unique symbol;

/** Where a frame count came from. All fields required — an unprovenanced
 *  number is indistinguishable from a guess, which is the whole problem. */
export interface FrameProvenance {
  /** Harness that produced it, e.g. "raw-gl-counter/playwright". */
  instrument: string;
  /** Page it was taken on, e.g. "/dev/drive-rig". */
  surface: string;
  /** Canvas size the frame was drawn at, "w×h" — a frame is meaningless without it. */
  canvas: string;
  /** ISO date. */
  measuredAt: string;
  /** How many whole frames the statistic was computed over. */
  frames: number;
}

/**
 * A per-frame count that came from a MEASUREMENT of a running renderer.
 * Construct with `measuredFrame`; there is no other way, and that is the point.
 */
export interface MeasuredFrame {
  readonly [MEASURED_BRAND]: true;
  district: string;
  scenario: string;
  tier: PerfTier;
  /** Lesson rung. Rung 1 mounts an aid stack that rungs 2+ do not. */
  level: number;
  /**
   * Draw calls per frame, all passes — the median over one-second windows of
   * each window's MEAN, which is the statistic `buildPerfReport` scores
   * (`median(windows.map(w => w.drawsPerFrame))`, and `drawsPerFrame` is a
   * mean). A per-frame median is a DIFFERENT number and must not be put here:
   * mirror cadence makes the per-frame distribution bimodal, so its median
   * lands on the no-mirror mode and reads ~7 % low.
   */
  drawsPerFrame: number;
  /** Triangles per frame, all passes, same statistic. */
  trisPerFrame: number;
  provenance: FrameProvenance;
}

/** Thrown when something that is not a measurement is offered as one. */
export class NotAMeasurementError extends Error {}

/**
 * Build a `MeasuredFrame`, refusing anything that cannot have come from a
 * running renderer. This is the „loudly refuse to answer" half of the fix: a
 * static estimate has no canvas, no frame count and no instrument, so it
 * cannot get through here even if someone hand-writes the object.
 */
export function measuredFrame(input: Omit<MeasuredFrame, typeof MEASURED_BRAND>): MeasuredFrame {
  const p = input.provenance;
  if (!p || !p.instrument || !p.surface || !p.canvas || !p.measuredAt) {
    throw new NotAMeasurementError(
      `frame for ${input.district} has no provenance — a draw budget may only be scored against a measurement`,
    );
  }
  if (!/^\d+×\d+$/.test(p.canvas)) {
    throw new NotAMeasurementError(`frame for ${input.district} has canvas "${p.canvas}", expected "w×h"`);
  }
  if (!(p.frames >= 60)) {
    throw new NotAMeasurementError(
      `frame for ${input.district} was computed over ${p.frames} frames — too few to be a median of one-second windows`,
    );
  }
  if (!(input.drawsPerFrame > 0) || !(input.trisPerFrame > 0)) {
    throw new NotAMeasurementError(`frame for ${input.district} has a non-positive count`);
  }
  return input as MeasuredFrame;
}

/**
 * Score a MEASURED frame against its tier's budget. There is deliberately no
 * overload taking a plain number: the type is the gate.
 */
export function scoreFrameDrawBudget(frame: MeasuredFrame): {
  draws: PerfMetricVerdict;
  tris: PerfMetricVerdict;
  verdict: PerfMetricVerdict;
} {
  const b = PERF_BUDGETS[frame.tier];
  const score = (v: number, soft: number, hard: number): PerfMetricVerdict =>
    v <= soft ? "pass" : v <= hard ? "warn" : "fail";
  const draws = score(frame.drawsPerFrame, b.drawCalls, b.drawCallsHardCap);
  const tris = score(frame.trisPerFrame, b.triangles, b.trianglesHardCap);
  const rank = { pass: 0, warn: 1, fail: 2 } as const;
  return { draws, tris, verdict: rank[draws] >= rank[tris] ? draws : tris };
}

// ---------------------------------------------------------------------------
// The ceiling — every subsystem that submits a draw
// ---------------------------------------------------------------------------

/** One enumerated contributor to the frame. */
export interface FrameCostTerm {
  id: string;
  draws: number;
  /** Where the number comes from. "measured" means I counted it. */
  basis: string;
}

export interface FrameCostInput {
  /** `world.stats.staticDrawSlots` — families the district mounts. */
  staticDrawSlots: number;
  /**
   * Extra submissions the spatial chunk grid can add when EVERY chunk is in
   * frustum (`three-helpers.chunkTransforms`). Worst case, so the ceiling
   * stays a ceiling; the measured frame is well under it because the point of
   * the grid is that most chunks are behind the car.
   */
  propChunkSlots?: number;
  tier: PerfTier;
  /** Lesson rung; 1 mounts the aid stack. */
  level: number;
  /** Cap on simultaneously instanced traffic + pedestrian meshes. */
  trafficMeshes?: number;
}

/**
 * The cockpit-and-hero-car constant, and the reason the low-tier draw budget
 * cannot stand as written.
 *
 * Measured at 56.0–56.2 draws per frame in every district counted (d2-v1,
 * pe-cane-v1, sp-creep-v1, ov-crest-v1) — it is the same car everywhere, so it
 * is a constant, not a district property. `PERF_BUDGETS.low.drawCalls` is 70.
 * The cockpit alone is 80 % of the entire tier-low frame budget before one
 * metre of road is drawn, and this product's whole thesis (ADR-005) is that
 * the cockpit is the thing you sit in.
 *
 * `docs/simulation/quality-gap/13_webgl_perf_budget.md` §2 — the allocation
 * table doc 82 §2.2 cites — budgets 30–50 draws for the hero car inside a
 * 150-draw LAPTOP frame. Doc 82 §2.2 then states 70 (hard cap 100) for the
 * phone with no arithmetic behind it, while §2.1's derivation (GFLOP per Mpx
 * from Mali-G57 / Adreno-619 / Iris-Xe) supports only the resolution and fill
 * lines. THE 70 IS NOT DERIVED, AND THIS CONSTANT IS THE PROOF. Re-deriving it
 * is a founder call, not a refactor, so nothing here edits PERF_BUDGETS — the
 * ceiling simply makes the arithmetic impossible to miss.
 */
export const COCKPIT_DRAWS = 56;

/**
 * The level-1 aid stack: the ShadowCar ghost plus the path ribbon, mounted
 * only at rung 1 (`lessons/scenario/compile.ts` — `shadowCar: true` at level 1).
 * Measured at 44 draws before this row and ~22 after `forceSinglePass` stopped
 * three drawing every ghost mesh twice; 26 is the ceiling with the ribbon.
 * An ablation to rung 3 measured −45 to −50 draws per frame across six
 * districts, which is why any corpus table taken at rung 1 overstates what
 * most of the product costs.
 */
export const LEVEL1_AID_DRAWS = 26;

/** Sky dome + weather sheets. Measured 1–2. */
export const SKY_WEATHER_DRAWS = 3;

/**
 * Ceiling for the mirror render-to-texture, amortised per frame.
 * `MirrorRig` runs AT MOST one pass per frame, at a cadence of one frame in
 * four at tier low, one in two at med, and rear-every-2 + one door every 4 at
 * high. The ceiling charges the world terms again at the cadence fraction.
 *
 * IT IS NOW A LOOSE CEILING, DELIBERATELY LEFT LOOSE. Until the per-instance
 * cull (`scene/vitok/mirrorInstanceCull.ts`) a pass really did re-render the
 * world; measured after it, one entry costs 12.0-42.9 draws across the six
 * low-tier districts (d2-v1 20.0, from 83.0), against the 52 this term charges
 * for d2-v1 at tier low. Tightening it to the measured value was tried and
 * reverted: the med ceiling then lands UNDER the measured d2-v1 med frame,
 * because `POST_DRAWS` is the term that is short, not this one. Fixing that is
 * a different row; a ceiling that overstates still bounds, and check #2 in
 * frameCost.test.ts ("a subsystem with no term shows up here") still holds —
 * it is simply less sensitive than it was.
 */
const MIRROR_CADENCE_FRACTION: Record<PerfTier, number> = { low: 0.25, med: 0.5, high: 1.0 };

/**
 * Composer + shadow map, med/high only (`QUALITY_PRESETS.low` has
 * `shadows: false, postprocessing: false`, so tier low has exactly two passes
 * and I measured exactly two). Measured at med: a 1024² shadow map at 22
 * draws, N8AO's transparency-aware mode re-rendering the transparent queue
 * twice more at full resolution (~87 draws), and bloom's mipmap chain at ~20
 * one-draw passes. High doubles the shadow map to 2048² at 35.
 */
const POST_DRAWS: Record<PerfTier, number> = { low: 0, med: 130, high: 145 };

/** Default traffic ceiling: instanced vehicle + pedestrian meshes. Measured
 *  10 draws in pe-cane-v1 and 40–41 in d2-v1 / ov-crest-v1. */
export const DEFAULT_TRAFFIC_MESHES = 48;

/** Enumerate the frame, term by term. */
export function frameCostTerms(input: FrameCostInput): FrameCostTerm[] {
  const world = input.staticDrawSlots + (input.propChunkSlots ?? 0);
  const traffic = input.trafficMeshes ?? DEFAULT_TRAFFIC_MESHES;
  const terms: FrameCostTerm[] = [
    { id: "static-world", draws: world, basis: "world.stats.staticDrawSlots + worst-case chunks" },
    { id: "hero-cockpit", draws: COCKPIT_DRAWS, basis: "measured, constant across districts" },
    {
      id: "level-1-aids",
      draws: input.level === 1 ? LEVEL1_AID_DRAWS : 0,
      basis: "measured by rung-1 → rung-3 ablation",
    },
    { id: "traffic", draws: traffic, basis: "measured 10–41, ceiling 48" },
    { id: "sky-weather", draws: SKY_WEATHER_DRAWS, basis: "measured 1–2" },
  ];
  const worldish = world + traffic + SKY_WEATHER_DRAWS + (input.level === 1 ? LEVEL1_AID_DRAWS : 0);
  terms.push({
    id: "mirror-rtt",
    draws: Math.ceil(worldish * MIRROR_CADENCE_FRACTION[input.tier]),
    basis: "MirrorRig cadence × the world — a ceiling; the pass per-instance-culls to 12–43 draws",
  });
  if (POST_DRAWS[input.tier] > 0) {
    terms.push({
      id: "composer-and-shadows",
      draws: POST_DRAWS[input.tier],
      basis: "measured: shadow map + N8AO transparency pass + bloom chain",
    });
  }
  return terms;
}

/** Ceiling on draw calls per frame for a district at a tier and rung. */
export function frameDrawCeiling(input: FrameCostInput): number {
  return frameCostTerms(input).reduce((sum, t) => sum + t.draws, 0);
}

// ---------------------------------------------------------------------------
// Frames that were actually counted
// ---------------------------------------------------------------------------

const PROV = {
  instrument: "raw-gl-counter/playwright (WebGL draw* wrapped in addInitScript, rAF-delimited frames)",
  surface: "/dev/drive-rig",
  canvas: "1264×619",
  measuredAt: "2026-08-10",
} as const;

/**
 * THIRD MEASUREMENT PASS: the hero shell LOD, on the SHIPPED `hero_car.glb`
 * with nothing intercepted — see „THIRD PASS: THE HERO SHELL". EVERY row now
 * carries this, so the table has one vintage rather than three.
 *
 * The second pass (the mirror per-instance cull, `scene/vitok/mirrorInstanceCull.ts`,
 * same rig, same date) had its own constant until this pass superseded every
 * row it stamped; its narrative and its A/B table are kept above, because a
 * measurement that is no longer the current number is still the evidence that
 * the fix worked.
 */
const PROV_HERO_LOD = { ...PROV, measuredAt: "2026-08-11" } as const;

/**
 * THE RECORD. Every row was counted on the running product at a steady 20 km/h
 * with the seatbelt buckled and the canvas pinned by a trusted fullscreen key,
 * over an 8-second window (285–471 whole frames per row).
 *
 * The AFTER column below is the FIRST pass's result (instanced-mesh frustum
 * culling + `forceSinglePass` + the prop chunk grid). The rows in
 * MEASURED_FRAMES have since been re-counted a second time — see „SECOND PASS:
 * THE MIRROR" at the end of this block — so they no longer equal this column.
 * The BEFORE column was taken on the same rig in the same session with the
 * three renderer changes backed out one file at a time, so the pair differs by
 * nothing except the fix:
 *
 *   config              draws before → after      triangles before → after
 *   pe-cane-v1 low L1     178.9 → 154.7 (−13.5%)     243,495 →   169,970 (−30.2%)
 *   d2-v1      low L1     249.2 → 232.9 ( −6.5%)   1,763,150 → 1,226,977 (−30.4%)
 *   ov-crest   low L1     214.0 → 192.8 ( −9.9%)     576,485 →   506,521 (−12.1%)
 *   hz-roadwo. low L1     219.2 → 174.9 (−20.2%)     292,882 →   178,653 (−39.0%)
 *   sp-creep   low L1     203.3 → 179.8 (−11.6%)     311,496 →   241,396 (−22.5%)
 *   mw-v1      low L1     145.5 → 122.8 (−15.6%)     229,242 →   161,486 (−29.6%)
 *   pe-cane    med L1     322.0 → 279.2 (−13.3%)     417,130 →   275,555 (−33.9%)
 *   d2-v1      med L1     500.0 → 454.7 ( −9.1%)   3,411,185 → 2,244,788 (−34.2%)
 *   pe-cane    high L1    360.0 → 303.4 (−15.7%)     513,841 →   359,690 (−30.0%)
 *   pe-cane    low L3     133.9 → 128.2 ( −4.3%)     109,602 →   108,581 ( −0.9%)
 *   d2-v1      low L3     203.2 → 206.5 ( +1.6%)   1,630,763 → 1,161,414 (−28.8%)
 *
 * The last row is the one honest cost: on the heaviest map at a rung with no
 * ShadowCar ghost to pay for it, the prop chunk grid adds ~3 draw calls. That
 * is inside run-to-run noise and it buys 469,349 triangles. At a 400 m grid it
 * was +7.8 %, which is why the constant is 600 (see PROP_CHUNK_M).
 *
 * Nothing was deleted from any district to get there: same trees, same signs,
 * same shelters, same placements, same counts. The renderer stopped submitting
 * the part of the district that is behind the car, and stopped drawing the
 * level-1 ghost twice. A pixel diff of the two pe-cane frames taken 0.3 m
 * apart shows edge shift and the animated guidance ribbon and no missing
 * object.
 *
 * EVERY ROW STILL FAILS ITS TIER-LOW BUDGET. That is the honest state of the
 * product and `frameCost.test.ts` states it row by row rather than rounding it
 * off. The remaining gap is not closable by culling: 56 of those draws are the
 * cockpit, against a 70-draw budget for the whole frame.
 *
 * ── SECOND PASS: THE MIRROR (2026-08-11) ───────────────────────────────────
 * Every row below was then re-counted after `scene/vitok/mirrorInstanceCull.ts`
 * gave the mirror passes a cull three cannot do — per INSTANCE instead of per
 * InstancedMesh (the world's instanced sets have 800–1100 m bounding spheres,
 * so the frustum could never reject one, and a 256×96 rear-view cone was being
 * sent the whole district; 97.3 % of the triangles it submitted could not
 * appear in it). The controlled number is the pass itself, A/B'd inside ONE
 * browser session by re-showing exactly the meshes the shipped cull had hidden
 * and rendering the same camera into the same target again:
 *
 *   district (low, L1)   mirror pass, PER ENTRY: draws            triangles
 *   d2-v1                 83.0 → 20.0  (−75.9 %)   492,716 → 128,996  (−73.8 %)
 *   hz-roadworks-v1       97.2 → 42.9  (−55.9 %)   172,994 →  76,950  (−55.5 %)
 *   sp-creep-v1           85.9 → 37.1  (−56.8 %)   176,991 →  88,883  (−49.8 %)
 *   ov-crest-v1           75.6 → 36.1  (−52.2 %)   329,412 → 250,081  (−24.1 %)
 *   mw-v1                 25.5 → 12.0  (−52.9 %)    53,566 →  30,068  (−43.9 %)
 *   pe-cane-v1            39.0 → 21.0  (−46.2 %)    49,074 →  38,658  (−21.2 %)
 *   d2-v1, CHASE view     85.0 → 23.7  (−72.1 %)   548,334 → 204,618  (−62.7 %)
 *
 * The heaviest map gains the most and the lightest the least, which is what a
 * granularity fix should do: pe-cane-v1 has few district-spanning sets to
 * reject, d2-v1 is built almost entirely from them.
 *
 * The last row is CameraRig's 384×160 chase rear-view window — the mirror the
 * founder actually drives with (item 44) — which had the identical defect.
 *
 * NOTHING VISIBLE WAS REMOVED, and that is checked rather than argued: reading
 * the 256×96 target back twice in the SAME frame at the SAME car pose, once as
 * the product renders it and once with the 112 meshes the cull hid put back,
 * gives a byte-identical image (0.00 % of channels differing by more than
 * 8/255, max 0). The positive control — hiding all 123 instanced meshes —
 * moves 4.27 % of channels, so the instrument is not blind to a change.
 *
 * WHOLE-FRAME NUMBERS BELOW MOVED LESS THAN THE PASS DID, because the pass only
 * enters 25 % of frames at tier low (50 % at med): d2-v1 low went 232.9 → 215.7
 * draws and 1,226,977 → 1,137,303 triangles, which is the −63 draws × 0.25
 * cadence the A/B predicts. Two rows are NOT comparable across the two passes
 * and say so here rather than being quietly rounded: `hz-roadworks-v1` reads
 * 183.0 after and 174.9 before, and `sp-creep-v1` 173.5 after and 179.8 before,
 * because an 8-second window starts wherever the drive script has got to and a
 * roadworks map is not uniform along its route. Both were re-measured in two
 * independent sessions and reproduced to ±0.3 draws, and the same-session A/B
 * above is what isolates the fix. A ratchet on a whole-frame number carries
 * that positional variance; the per-pass A/B does not.
 *
 * ONE ROW CHANGED ITS VERDICT: `pe-cane-v1|high|1` went 303.4 → 293.1 draws and
 * is now the first row in this table to score `pass` outright, against a
 * 300-draw soft budget. It clears it by 2.3 %, which is inside the drift
 * between sessions, so that row's number is the MEDIAN OF THREE independent
 * sessions (299.1 / 292.1 / 293.1) rather than one window. Every other row
 * keeps the verdict it had.
 *
 * ── THIRD PASS: THE HERO SHELL (2026-08-11) ────────────────────────────────
 * `platform/public/sim/vehicles/hero_car.glb` went from 65,434 scene triangles
 * to 11,220 (−82.9 %, 139 KB → 45 KB Draco) — `tools/glb/decimate_hero.mjs`,
 * which carries the whole derivation. EVERY ROW BELOW WAS RE-COUNTED AFTER IT,
 * in one session, on the SHIPPED file. The interior GLB was NOT touched, and
 * §„why the interior is not in this script" in that tool says why with numbers.
 *
 * WHAT THE ASSET TOTAL ACTUALLY WAS. „The hero car plus its interior is 89,422
 * triangles per frame" was true of the two GLBs added together (65,434 +
 * 25,771 = 91,205, less the proxies the runtime hides) and NOT true of a
 * cockpit frame. `HeroCarBody` renders inside `<group visible={!cockpitView}>`:
 * from the driving seat the player's own shell is never submitted. A scene
 * census run in the live frame reports it directly —
 *
 *   view · rung     exterior triangles VISIBLE      whose they are
 *   cockpit · 3     0                               —
 *   cockpit · 1     65,434                          the ShadowCar GHOST only
 *   chase   · 3     65,434                          the player's car
 *   chase   · 1     130,868                         player + ghost
 *
 * — so the shell's cost lands on CHASE frames and on rung-1 frames (where
 * `ShadowCar` loads the same GLB for the ghost), and the cockpit at rung 3
 * gains exactly nothing from this change. That row is in the table below as
 * 1,070,484 → 1,070,484 triangles on d2-v1: an unchanged number, kept because
 * a negative control that reproduces is evidence and a missing row is not.
 *
 * ONE LOD, NOT TWO, AND THE MEASUREMENT IS WHY. The chase camera
 * (CHASE_DISTANCE 6.0 m, CHASE_HEIGHT 2.3 m) is the CLOSEST any camera in the
 * product ever gets to that shell: the cockpit hides it, the marketing hero
 * orbits at 10.5–13.5 m, top-down sits at 110 m, and the clip renderer reuses
 * the chase pose. A second, finer LOD would have no camera to serve.
 *
 * NOTHING VISIBLE WAS LOST, CHECKED RATHER THAN ASSERTED. Same station, same
 * canvas, same tier, DOM hidden so the diff is the rendered frame and not the
 * lesson shell:
 *   · FROM THE SEAT (pe-cane-v1, low, rung 1, whole canvas): 1.387 % of pixels
 *     differ by more than 8/255, against a 2.468 % floor measured by
 *     photographing the SAME run twice. Mean channel delta 0.231 vs the floor's
 *     0.420. The change is BELOW the frame's own noise, and the tile map puts
 *     all of it in the middle band — the ghost seen through the windscreen —
 *     with zero movement in the rows holding the dash, wheel and A-pillar.
 *   · FROM THE CHASE CAMERA, cropped to the car itself: 2.674 % vs a 2.331 %
 *     floor, mean 0.609 vs 0.421. Visible at 2.5× zoom as a slightly broader
 *     specular band on the boot lid; silhouette, tail bar, mirrors and wheels
 *     unchanged.
 *   · THE LANDING PAGE (`HeroScene3D`, four frames of the hero loop): 0.055 –
 *     0.062 % of pixels.
 *   · POSITIVE CONTROLS: hiding the hero outright moves 33.2 % of the cockpit
 *     frame and 46.0 % of the chase crop, so the instrument is not blind.
 *
 * DRAW CALLS DID NOT MOVE, and were never going to: decimation removes
 * triangles from a submission, not submissions. Across the eleven A/B pairs the
 * largest draw difference is inside the session-to-session drift this file
 * already documents. The mirror passes behaved the same way — draws per entry
 * and the fraction of frames carrying a pass are unchanged, while the chase
 * rear-view window (384×160, founder item 44) fell from 103,891 to 51,273
 * triangles per entry because the own car is in that pass.
 *
 * WHAT THIS DOES NOT FIX. Every row still fails its tier-low draw budget, and
 * the cockpit is still the reason: standing still at the spawn, with the
 * decimated car, an ablation inside one frozen scene prices the INTERIOR at
 * 30.8–34.9 draws and the rung-1 ghost shell at 20.2–25.8 draws across six
 * districts — ~53 draws of a 70-draw budget before the road. The interior's
 * 47 primitives are ~1 draw each and 27 of them are the 13 named cabin controls
 * the hover/highlight layer addresses individually; collapsing them is a
 * behaviour change, not asset work.
 *
 * `pe-cane-v1|high|1` KEEPS ITS MEDIAN-OF-THREE DISCIPLINE. Its `pass` still
 * turns on a 2 % drift, so it was re-measured three times on the shipped file:
 * 288.0 / 296.1 / 296.1 draws, 241,077 / 241,165 / 241,249 triangles. The row
 * carries the medians (296.1 / 241,165) and the frame count of the session that
 * produced them, not one lucky window.
 */
export const MEASURED_FRAMES: readonly MeasuredFrame[] = [
  measuredFrame({
    district: "pe-cane-v1",
    scenario: "sc-crossing-white-cane",
    tier: "low",
    level: 1,
    drawsPerFrame: 150.0,
    trisPerFrame: 114_312,
    provenance: { ...PROV_HERO_LOD, frames: 485 },
  }),
  measuredFrame({
    district: "d2-v1",
    scenario: "sc-ed-d2-city-run",
    tier: "low",
    level: 1,
    drawsPerFrame: 214.9,
    trisPerFrame: 1_083_086,
    provenance: { ...PROV_HERO_LOD, frames: 489 },
  }),
  measuredFrame({
    district: "ov-crest-v1",
    scenario: "sc-ov-crest-curve",
    tier: "low",
    level: 1,
    drawsPerFrame: 182.4,
    trisPerFrame: 433_754,
    provenance: { ...PROV_HERO_LOD, frames: 489 },
  }),
  measuredFrame({
    district: "hz-roadworks-v1",
    scenario: "sc-merge-roadworks-shift",
    tier: "low",
    level: 1,
    drawsPerFrame: 167.0,
    trisPerFrame: 154_735,
    provenance: { ...PROV_HERO_LOD, frames: 483 },
  }),
  measuredFrame({
    district: "sp-creep-v1",
    scenario: "sc-sp-harsh-brake",
    tier: "low",
    level: 1,
    drawsPerFrame: 173.6,
    trisPerFrame: 175_464,
    provenance: { ...PROV_HERO_LOD, frames: 481 },
  }),
  measuredFrame({
    district: "mw-v1",
    scenario: "sc-ac-truck-spray",
    tier: "low",
    level: 1,
    drawsPerFrame: 120.0,
    trisPerFrame: 102_569,
    provenance: { ...PROV_HERO_LOD, frames: 485 },
  }),
  measuredFrame({
    district: "pe-cane-v1",
    scenario: "sc-crossing-white-cane",
    tier: "med",
    level: 1,
    drawsPerFrame: 261.9,
    trisPerFrame: 160_128,
    provenance: { ...PROV_HERO_LOD, frames: 496 },
  }),
  measuredFrame({
    district: "d2-v1",
    scenario: "sc-ed-d2-city-run",
    tier: "med",
    level: 1,
    drawsPerFrame: 422.0,
    trisPerFrame: 1_930_283,
    provenance: { ...PROV_HERO_LOD, frames: 487 },
  }),
  measuredFrame({
    district: "pe-cane-v1",
    scenario: "sc-crossing-white-cane",
    tier: "high",
    level: 1,
    drawsPerFrame: 296.1,
    trisPerFrame: 241_165,
    provenance: { ...PROV_HERO_LOD, frames: 480 },
  }),
  measuredFrame({
    district: "pe-cane-v1",
    scenario: "sc-crossing-white-cane",
    tier: "low",
    level: 3,
    drawsPerFrame: 126.4,
    trisPerFrame: 102_587,
    provenance: { ...PROV_HERO_LOD, frames: 493 },
  }),
  measuredFrame({
    district: "d2-v1",
    scenario: "sc-ed-d2-city-run",
    tier: "low",
    level: 3,
    drawsPerFrame: 190.8,
    trisPerFrame: 1_070_484,
    provenance: { ...PROV_HERO_LOD, frames: 493 },
  }),
];
