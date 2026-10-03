/**
 * THE SPAN CENSUS — where the task ceiling binds along every committed shadow
 * route (founder ruling 2026-09-25, round 3, verifier R1).
 *
 * The verifier's census (`zz-v2-span-path.test.ts`, run on round 2) walked each
 * template's committed `shadow-correct` trace past every capped mark and asked
 * whether the stamp would still hold after the car had left the NEXT GOAL's far
 * edge. Round 2's half-line stretch failed it on 60 of 521 capped rows:
 * `sc-rb-lane-choice` 64 m of the exit arm, `sc-junction-gap` 30 m of a posted-50
 * road under ≤30, `sc-mv-uturn-ban` 16 m, `sc-speed-rain` 15 m,
 * `sc-junction-scan` / `sc-junction-stop` 13 m each, `sc-junction-left` 10 m,
 * and a metre or so on 30-odd more.
 *
 * This file IS that census, kept: for every template with a committed shadow,
 * every practice rung, every capped flow reachZone the shadow passes, the car
 * is walked sample by sample through the stretch the PRODUCT fixes at the blow
 * (`taskCapStretch` + `stepTaskCapStretch`, the latch's own stepping) and every
 * sample stamped after the next goal's far edge is a LEAK. The far edge is
 * measured independently of the product, along the path: the first sample
 * after the closest approach to the goal that is outside the goal's own area.
 *
 * THE GOAL'S AREA — THE ONE CHANGE TO THE VERIFIER'S DEFINITION, stated so it
 * can be checked. The verifier's `pt()` collapsed a roundabout, a turn box and a
 * bay to a point with radius 0, and treated a cap with no later goal as ending
 * at its own mark; on those rows ANY stamp after the mark counted as a leak, so
 * the ring itself — where a ≤20 „past north" cap is written to bind — was a
 * leak by definition. Here the area is the one the finish gates already use
 * (`finish.ts finishAnchor`, pre-existing): a roundabout's ARMING circle
 * (`enterRadiusM`, which contains the ring — O23), a turn box's circumradius, a
 * bay's `FINISH_BAY_RADIUS_M`, and — with no later goal — the capped zone's own
 * disc. For waypoints and junctions (every row the verifier named except
 * `sc-rb-lane-choice`, `sc-mv-uturn-ban` and `sc-speed-rain`) the definition is
 * the verifier's, unchanged.
 *
 * ROUND 4 — ONLY THE NAMED STRETCH (founder ruling 2026-09-25). The product's
 * stretch now also ends where the feature the task names ends
 * (`taskCapFeatures.ts`; a task naming nothing beyond its mark names its own
 * zone). Each row now carries BOTH stretches — round 3's (the region alone,
 * `stampedR3M`) and round 4's (`stampedToFarEdgeM`) — the feature's kind and
 * where it ends along the path, and a second leak measured independently of the
 * product: stamped metres past the END OF THE NAMED FEATURE (`leakFeatureM`),
 * which must be 0, as must any metre round 4 stamps that round 3 did not.
 *
 * ROUND 5 — THE NAMED FEATURE GOVERNS, BOTH WAYS (round-4 verifier F2). Round
 * 4 kept round 3's region as the outer bound, so where the feature runs past
 * the next goal (the accident scene, the ice) the ceiling stopped EARLY, still
 * inside the feature — and this census only looked for leaks. It now measures
 * both directions, per row:
 *  · `earlyM` — graded metres after the first stamped sample and before the
 *    feature's end that the product did NOT stamp (0 allowed);
 *  · `leakFeatureM` — stamped metres past the feature's end (0 allowed);
 *  · `leakM` — stamped metres past the next goal's far edge: 0 allowed where
 *    the feature IS the next goal (the curtain, a lead, a section), and
 *    reported (`pastGoalM`) where the task names a span or ring that runs on.
 * The feature's end is read from the table (`taskCapFeatures.ts`), which
 * `task-cap-features.test.ts` pins to the committed world; the sample that
 * first passes it is found here, along the path, not by the product.
 *
 * Set `SPAN_CENSUS_OUT` to a directory to dump the full table.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { shownObjectiveCapKmh } from "../advisor";
import {
  FINISH_BAY_RADIUS_M,
  TASK_CAP_STRETCH_START,
  stepTaskCapStretch,
  taskCapStretch,
  type TaskCapFeatureEnd,
} from "../finish";
import { taskCapFeatureFor } from "../taskCapFeatures";
import { REACH_ZONE_HALT_CAP_KMH, parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { ObjectiveParams } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

type Edge = { maxspeed: number; geometry: number[][] };
const cache = new Map<string, Edge[]>();
function edges(id: string): Edge[] {
  if (!cache.has(id)) {
    const d = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
    cache.set(id, d.roads.edges);
  }
  return cache.get(id)!;
}
function segDist(px: number, py: number, a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2));
  return Math.hypot(px - (a[0] + u * dx), py - (a[1] + u * dy));
}
function postedAt(id: string, x: number, y: number): number | undefined {
  let best = Infinity;
  let sp: number | undefined;
  for (const e of edges(id))
    for (let i = 0; i + 1 < e.geometry.length; i++) {
      const d = segDist(x, y, e.geometry[i], e.geometry[i + 1]);
      if (d < best) {
        best = d;
        sp = e.maxspeed;
      }
    }
  return sp;
}

/** The goal's area as the finish gates define it (see the header). */
function area(p: ObjectiveParams): { x: number; y: number; r: number } | null {
  if (p.kind === "reachZone" || p.kind === "passSignal") return { x: p.x, y: p.y, r: p.radiusM };
  if (p.kind === "completeManeuver") {
    if (p.maneuver === "parkInBay") return { x: p.bay.x, y: p.bay.y, r: FINISH_BAY_RADIUS_M };
    if (p.maneuver === "roundabout") return { x: p.x, y: p.y, r: p.enterRadiusM };
    if (p.maneuver === "threePointTurn")
      return { x: p.corridor.x, y: p.corridor.y, r: Math.hypot(p.corridor.halfWidthM, p.corridor.halfLengthM) };
  }
  return null;
}
/** The verifier's original `pt()`, for the second column only. */
function verifierPt(p: ObjectiveParams): { x: number; y: number; r: number } | null {
  if (p.kind === "reachZone" || p.kind === "passSignal") return { x: p.x, y: p.y, r: p.radiusM };
  if (p.kind === "completeManeuver") {
    if (p.maneuver === "parkInBay") return { x: p.bay.x, y: p.bay.y, r: 0 };
    if (p.maneuver === "roundabout") return { x: p.x, y: p.y, r: 0 };
    if (p.maneuver === "threePointTurn") return { x: p.corridor.x, y: p.corridor.y, r: 0 };
  }
  return null;
}

type Sample = { x: number; y: number; speedKmh: number };
/** First sample index after the closest approach to `g` (from `from`) outside its area — the far edge. */
function farEdgeIndex(samples: Sample[], from: number, g: { x: number; y: number; r: number }): number {
  let dn = Infinity;
  let iClose = from;
  for (let i = from; i < samples.length; i++) {
    const d = Math.hypot(samples[i].x - g.x, samples[i].y - g.y);
    if (d < dn) {
      dn = d;
      iClose = i;
    }
  }
  if (dn > g.r) return iClose;
  for (let i = iClose; i < samples.length; i++) {
    if (Math.hypot(samples[i].x - g.x, samples[i].y - g.y) > g.r) return i;
  }
  return samples.length - 1;
}

interface Row {
  lesson: string;
  rung: string;
  obj: string;
  shown: number;
  /** What the task names (`taskCapFeatures.ts`), or `zone` — its own disc (the default). */
  feature: string;
  pathToFarEdgeM: number;
  /** ROUND 3's stretch — the region alone — stamped metres to the next goal's far edge. */
  stampedR3M: number;
  /** ROUND 4's stretch — the region AND the named feature, as the product fixes it — stamped metres. */
  stampedToFarEdgeM: number;
  gapM: number;
  leakM: number;
  leakVerifierDefM: number;
  /** Stamped metres past the END OF THE NAMED FEATURE, measured independently along the path. Must be 0. */
  leakFeatureM: number;
  /** Path metres from the mark to where the named feature ends (to the far edge when it ends later). */
  featureEndM: number;
  /** Graded → silent (cap not under the sign) → graded again while inside: a stamp that drops and returns within one stretch. */
  silentBreaks: number;
  /** ROUND 5: graded metres before the feature's end, after the first stamp, that were NOT stamped. Must be 0. */
  earlyM: number;
  /** ROUND 5: stamped metres past the next goal's far edge on a row whose feature runs on past it (a span, a ring). */
  pastGoalM: number;
  /** Where the feature ends: "gate" / "area" (a span or a ring the task names), "goal" (the next goal), "zone" (its own disc). */
  endKind: string;
  /** ROUND 5: path metres from the mark to the last stamped sample (−1: none). */
  lastStampM: number;
  /** ROUND 5: path metres from the mark to where the path first passes the feature's end, uncapped (−1: it never does). */
  featureEndPathM: number;
}

/** Is `p` past the end of the named feature? The census's own reading, not the product's. */
function pastEnd(end: TaskCapFeatureEnd, p: { x: number; y: number }): boolean {
  if (end.kind === "gate") return (p.x - end.x) * end.ux + (p.y - end.y) * end.uy > 0;
  if (end.kind === "area") return Math.hypot(p.x - end.x, p.y - end.y) > end.radiusM;
  return false;
}

function census(): { rows: Row[]; skipped: number } {
  const rows: Row[] = [];
  let skipped = 0;
  for (const spec of SCENARIO_TEMPLATES) {
    const sp = (spec as unknown as { shadow?: { path: string } }).shadow?.path;
    if (!sp || !existsSync(path.join(REPO_ROOT, sp))) continue;
    const samples = JSON.parse(readFileSync(path.join(REPO_ROOT, sp), "utf-8")).samples as Sample[];
    for (const lv of spec.levels.map((l) => l.level as ScenarioLevel)) {
      const lesson = compileScenario(spec, lv);
      if (lesson.examMode) continue;
      const params = lesson.objectives.map((o) => parseObjectiveParams(o));
      lesson.objectives.forEach((o, idx) => {
        const p = params[idx];
        if (p.kind !== "reachZone" || p.maxSpeedKmh === undefined || p.maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH) return;
        const shown = shownObjectiveCapKmh(o, p.maxSpeedKmh, lesson.postedLimitKmh);
        let iMark = -1;
        let dBest = Infinity;
        samples.forEach((s, i) => {
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (d < dBest) {
            dBest = d;
            iMark = i;
          }
        });
        if (iMark < 0 || dBest > p.radiusM + 3) {
          skipped++;
          return;
        }
        let iA = iMark;
        while (iA > 0 && Math.hypot(samples[iA].x - p.x, samples[iA].y - p.y) < 8) iA--;
        const from = { x: samples[iA].x, y: samples[iA].y };
        // The PRODUCT's stretch (round 4): the named feature, or its own zone.
        const named = taskCapFeatureFor(o.id);
        const st = taskCapStretch(params, idx, from, named?.end);
        // ROUND 3's stretch: the same region with no feature end inside it.
        const st3 = taskCapStretch(params, idx, from, { kind: "goal" });
        if (st === null || st3 === null) {
          skipped++;
          return;
        }
        let next: { x: number; y: number; r: number } | null = null;
        let nextV: { x: number; y: number; r: number } | null = null;
        for (let j = idx + 1; j < params.length && next === null; j++) {
          next = area(params[j]);
          nextV = verifierPt(params[j]);
        }
        const own = { x: p.x, y: p.y, r: p.radiusM };
        const iFar = farEdgeIndex(samples, iMark, next ?? own);
        const iFarV = next === null ? iMark : farEdgeIndex(samples, iMark, nextV!);
        let progress = TASK_CAP_STRETCH_START;
        let progress3 = TASK_CAP_STRETCH_START;
        let pathTo = 0;
        let stampedTo = 0;
        let stamped3 = 0;
        let gap = 0;
        let leak = 0;
        let leakV = 0;
        let leakFeature = 0;
        let featureEndM = -1;
        let pathSoFar = 0;
        let passedEnd = false;
        let silentBreaks = 0;
        let lastGradedInside: boolean | null = null;
        let early = 0;
        let pastGoal = 0;
        let firstStampSeen = false;
        let lastStampAt = -1;
        const endKind = named === undefined ? "zone" : named.end.kind;
        for (let i = iMark + 1; i < samples.length; i++) {
          const a = samples[i - 1];
          const b = samples[i];
          const ds = Math.hypot(b.x - a.x, b.y - a.y);
          pathSoFar += ds;
          const posted = postedAt(spec.map.districtId, b.x, b.y) ?? lesson.postedLimitKmh ?? 0;
          const stepped = stepTaskCapStretch(st, progress, b);
          progress = stepped.progress;
          const stepped3 = stepTaskCapStretch(st3, progress3, b);
          progress3 = stepped3.progress;
          const graded = shown < posted;
          const stamped = stepped.inside && graded;
          // The feature's end, read independently along the path: the first
          // sample past it latches (a gate is a line; an area is left once).
          if (!passedEnd && pastEnd(st.featureEnd, b)) {
            passedEnd = true;
            featureEndM = pathSoFar;
          }
          if (passedEnd && stamped) leakFeature += ds;
          // ROUND 5 — early stops: before the feature's end, after the first
          // stamp, graded here, and not stamped. A goal-kind feature ends at the
          // next goal's far edge: `iFar` is the first sample OUTSIDE the goal's
          // area, where the stretch is already spent, so it is not «before».
          const beforeEnd = st.featureEnd.kind === "goal" ? i < iFar : !passedEnd;
          if (stamped) {
            firstStampSeen = true;
            lastStampAt = pathSoFar;
          }
          else if (firstStampSeen && beforeEnd && graded) early += ds;
          if (i > iFar && stamped && st.featureEnd.kind !== "goal") pastGoal += ds;
          if (stepped.inside) {
            if (lastGradedInside === false && graded) silentBreaks++;
            lastGradedInside = lastGradedInside === null && !graded ? null : graded;
          }
          if (i <= iFar) {
            pathTo += ds;
            if (stamped) stampedTo += ds;
            else if (graded && stepped3.inside) gap += ds;
            if (stepped3.inside && graded) stamped3 += ds;
          } else if (stamped && st.featureEnd.kind === "goal") {
            leak += ds;
          }
          if (i > iFarV && stamped) leakV += ds;
        }
        rows.push({
          lesson: lesson.id,
          rung: `L${lv}`,
          obj: o.id,
          shown,
          feature: named?.named ?? "zone",
          pathToFarEdgeM: Math.round(pathTo),
          stampedR3M: Math.round(stamped3),
          stampedToFarEdgeM: Math.round(stampedTo),
          gapM: Math.round(gap * 10) / 10,
          leakM: Math.round(leak * 10) / 10,
          leakVerifierDefM: Math.round(leakV * 10) / 10,
          leakFeatureM: Math.round(leakFeature * 10) / 10,
          featureEndM: featureEndM < 0 ? Math.round(pathTo) : Math.round(Math.min(featureEndM, pathTo)),
          silentBreaks,
          earlyM: Math.round(early * 10) / 10,
          pastGoalM: Math.round(pastGoal * 10) / 10,
          endKind,
          lastStampM: Math.round(lastStampAt * 10) / 10,
          featureEndPathM: Math.round(featureEndM * 10) / 10,
        });
      });
    }
  }
  return { rows, skipped };
}

it("no capped row is stamped past the end of the feature its task names, nor stops short of it, on any committed shadow route (R1, rounds 4–5)", { timeout: 600_000 }, () => {
  const { rows, skipped } = census();
  const out = process.env.SPAN_CENSUS_OUT;
  if (out) {
    const cols = Object.keys(rows[0]) as Array<keyof Row>;
    writeFileSync(
      path.join(out, "span-census-r5.tsv"),
      [cols.join("\t"), ...rows.map((r) => cols.map((c) => String(r[c])).join("\t"))].join("\n") + `\n# skipped ${skipped}\n`,
    );
  }
  // Non-vacuity: the census still finds the verifier's rows.
  expect(rows.length).toBeGreaterThan(500);
  for (const id of [
    "sc-rb-lane-choice",
    "sc-junction-gap",
    "sc-mv-uturn-ban",
    "sc-speed-rain",
    "sc-junction-scan",
    "sc-junction-stop",
    "sc-junction-left",
    "sc-sp-curve",
    "sc-ac-truck-spray",
  ]) {
    expect(rows.some((r) => r.lesson.startsWith(`${id}@`)), id).toBe(true);
  }
  // And the stretch is not vacuously empty: the ceiling still binds after the
  // blow — across the ring, the zone, the way to the turning box, the bend and
  // the curtain.
  for (const id of ["sc-rb-lane-choice", "sc-junction-gap", "sc-mv-uturn-ban", "sc-junction-left", "sc-sp-curve", "sc-ac-truck-spray"]) {
    const r = rows.filter((x) => x.lesson.startsWith(`${id}@`));
    expect(r.some((x) => x.stampedToFarEdgeM > 0), id).toBe(true);
  }
  // R1 (round 3): never past the next goal's far edge — where the feature IS
  // the next goal (`leakM` counts only those rows since round 5).
  expect(rows.filter((r) => r.leakM > 0)).toEqual([]);
  // ROUND 4: never past the end of the feature the task names…
  expect(rows.filter((r) => r.leakFeatureM > 0)).toEqual([]);
  // …ROUND 5: and never short of it (verifier F2).
  expect(rows.filter((r) => r.earlyM > 0)).toEqual([]);
  // ROUND 5: the rows where a span the task names runs past the next goal DO
  // now bind past it — the scene and the parked row among them. (The ice,
  // sc-aci-before, too — but its committed shadow stops at the marked position
  // at y 280, short of the next goal's far edge, so this census cannot see it;
  // `task-cap-round5.test.ts` drives it across the ice.)
  for (const obj of ["sc-hzac-slow", "sc-prs-row"]) {
    const r = rows.filter((x) => x.obj === obj);
    expect(r.length, obj).toBeGreaterThan(0);
    for (const x of r) {
      expect(x.endKind, obj).toBe("gate");
      // The route reaches the feature's end, past the next goal's far edge…
      expect(x.featureEndPathM, `${obj} ${x.rung}`).toBeGreaterThan(x.pathToFarEdgeM);
      // …and the ceiling holds to within one frame of it, and no further.
      expect(x.lastStampM, `${obj} ${x.rung}`).toBeGreaterThan(x.featureEndPathM - 1.5);
      expect(x.lastStampM, `${obj} ${x.rung}`).toBeLessThanOrEqual(x.featureEndPathM);
      expect(x.earlyM, `${obj} ${x.rung}`).toBe(0);
    }
  }
  // The ruling's own case: sc-sp-curve's mid-curve cap stops at the bend's exit,
  // well short of the finish round 3 ran it to.
  const curve = rows.filter((r) => r.obj === "sc-spcv-curve");
  expect(curve.length).toBeGreaterThan(0);
  for (const r of curve) {
    expect(r.feature).toBe("bend");
    expect(r.featureEndM).toBeLessThan(r.pathToFarEdgeM - 100);
    expect(r.stampedToFarEdgeM).toBeLessThanOrEqual(r.featureEndM + 2);
  }
});
