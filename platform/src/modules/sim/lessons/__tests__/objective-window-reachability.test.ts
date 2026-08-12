/**
 * THE CLASS: an objective that samples a MOMENTARY input inside a geometric
 * window the car crosses in a second or two. Miss the overlap and a student who
 * did the right thing is told he did not — the single most corrosive thing a
 * driving-education product can do.
 *
 * `passSignal` is the extreme case in the catalogue, because its input is not
 * merely transient — it exists for exactly ONE FRAME. `stopLineCrossed` is
 * pushed by worldRuntime on the tick the car's arclength passes the painted
 * line, and stepPassSignal counts it ONLY while
 *
 *     dist(tick.position, {x, y}) <= radiusM
 *
 * holds on that same tick. So the radius is not "roughly the junction" — it is
 * the entire aperture through which a one-frame event has to be seen, and it
 * has to reach THE PAINT, not the node. The paint sits at the junction MOUTH,
 * a setback the world builder derives per node from the open radius of the
 * roads that meet there (runtime/stoplines.ts mouthSetbackM), and on a
 * perceptually-scaled boulevard (PERCEPTUAL_ROAD_SCALE 2.5) that setback is
 * 30+ m. A radius authored by eye at the node loses the race silently.
 *
 * IT ALREADY HAD. Measured 2026-08-11 against district-v1 through the real
 * runtime: `l2-signal-1` (and its exam twin `ex-signal-1`) carried radiusM 30
 * around n1805512602, whose only trafficLight line is crossed at 32.0 / 34.0 /
 * 37.7 m depending on lane. Every lane outside. The event fired at (436.4,
 * 203.9) — 32.05 m out — and was discarded on the only frame it will ever
 * exist. Objectives are SEQUENTIAL, so a perfect drive stalled the L2 chain at
 * objective 3 of 4 forever, and shipped the same wall into the exam.
 *
 * This file pins the invariant that makes that un-reintroducible, in the
 * evaluator's own terms:
 *
 *   1. REACHABLE — every authored passSignal objective has at least one line
 *      of its control whose DRIVABLE crossing point lies inside its radius.
 *      Without this, the objective is not hard, it is impossible.
 *   2. NOT A GIFT — the radius must not be so wide that it swallows a line
 *      belonging to a DIFFERENT junction, which would let the student buy the
 *      objective by crossing some other light. Widening everything is the
 *      opposite failure and just as bad.
 *
 * The crossing point is computed the way the car actually meets the paint: the
 * line's own travel direction, offset into each right-hand lane centre of that
 * carriageway (drawn lane = LANE_WIDTH_M), because that is where the vehicle
 * origin the runtime samples actually is.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../contracts";
import { createWorldRuntime, LANE_WIDTH_M } from "../../runtime";
import { DistrictIndex } from "../../runtime/spatial";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../specs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../../content/world");
const DEFAULT_DISTRICT = "district-v1";

interface Authored {
  where: string;
  district: string;
  x: number;
  y: number;
  radiusM: number;
  control: "trafficLight" | "stopSign";
}

function collectPassSignals(): Authored[] {
  const out: Authored[] = [];
  const take = (where: string, lesson: LessonSpec) => {
    for (const o of lesson.objectives as readonly LessonObjective[]) {
      if (o.kind !== "passSignal") continue;
      const p = o.params;
      out.push({
        where: `${where}/${o.id}`,
        district: lesson.world?.districtId ?? DEFAULT_DISTRICT,
        x: Number(p.x),
        y: Number(p.y),
        radiusM: Number(p.radiusM),
        control: p.control as "trafficLight" | "stopSign",
      });
    }
  };
  for (const l of [...LESSONS, EXAM_LESSON, ...POLIGON_LESSONS]) take(`spec:${l.id}`, l);
  for (const t of SCENARIO_TEMPLATES) {
    const level = t.levels[0]?.level;
    if (level === undefined) continue;
    take(t.id, compileScenario(t, level));
  }
  return out;
}

interface Crossing {
  junctionNodeId: string;
  control: string;
  /** Distance from the objective centre for each right-hand lane centre, m. */
  perLane: number[];
}

const worldCache = new Map<string, { rt: ReturnType<typeof createWorldRuntime>; index: DistrictIndex } | null>();

function world(districtId: string) {
  if (!worldCache.has(districtId)) {
    try {
      const json = JSON.parse(readFileSync(path.join(WORLD_DIR, `${districtId}.json`), "utf-8"));
      worldCache.set(districtId, { rt: createWorldRuntime(json), index: new DistrictIndex(json) });
    } catch {
      worldCache.set(districtId, null);
    }
  }
  return worldCache.get(districtId)!;
}

/** Where the CAR is when each of this line's lanes crosses it, vs (x, y). */
function crossings(a: Authored): Crossing[] {
  const w = world(a.district);
  if (w === null) return [];
  const out: Crossing[] = [];
  for (const line of w.rt.debugStopLines()) {
    const rtE = w.index.edgeRt(line.edgeIdx);
    const [lx, ly] = w.index.pointAt(line.edgeIdx, line.sM);
    const sAhead = Math.max(0, Math.min(rtE.totalLen, line.sM + line.dirSign));
    const [ax, ay] = w.index.pointAt(line.edgeIdx, sAhead);
    // Heading of travel across the line, then its right-hand normal.
    const hx = (ax - lx) * line.dirSign;
    const hy = (ay - ly) * line.dirSign;
    const m = Math.hypot(hx, hy) || 1;
    const rx = hy / m;
    const ry = -hx / m;
    const perLane: number[] = [];
    for (let i = 0; i < Math.max(1, rtE.lanesPerDir); i++) {
      const off = LANE_WIDTH_M / 2 + i * LANE_WIDTH_M;
      perLane.push(Math.hypot(lx + rx * off - a.x, ly + ry * off - a.y));
    }
    out.push({ junctionNodeId: line.junctionNodeId, control: line.control, perLane });
  }
  return out;
}

const AUTHORED = collectPassSignals();

describe("passSignal — the one-frame event must fall INSIDE the zone that grades it", () => {
  it("scans a non-trivial number of authored objectives (the scan itself must not silently empty)", () => {
    expect(AUTHORED.length).toBeGreaterThanOrEqual(15);
  });

  it("1. REACHABLE — every objective has a matching line the car crosses inside its radius", () => {
    const broken: string[] = [];
    for (const a of AUTHORED) {
      const mine = crossings(a).filter((c) => c.control === a.control);
      if (mine.length === 0) continue; // district not loadable here — not this test's subject
      const best = Math.min(...mine.flatMap((c) => c.perLane));
      if (best > a.radiusM) {
        broken.push(
          `${a.where}: nearest drivable ${a.control} crossing is ${best.toFixed(1)} m from the centre of a ${a.radiusM} m zone — the event can NEVER be seen`,
        );
      }
    }
    expect(broken).toEqual([]);
  });

  it("2. NOT A GIFT — no objective's radius swallows another junction's stop line", () => {
    const loose: string[] = [];
    for (const a of AUTHORED) {
      const mine = crossings(a).filter((c) => c.control === a.control);
      if (mine.length === 0) continue;
      // The junction this objective is actually about = the one whose line is
      // nearest. Any OTHER junction's line inside the radius is a free pass.
      let ownNode = "";
      let ownBest = Infinity;
      for (const c of mine) {
        const b = Math.min(...c.perLane);
        if (b < ownBest) {
          ownBest = b;
          ownNode = c.junctionNodeId;
        }
      }
      for (const c of mine) {
        if (c.junctionNodeId === ownNode) continue;
        const b = Math.min(...c.perLane);
        if (b <= a.radiusM) {
          loose.push(
            `${a.where}: radius ${a.radiusM} m also admits ${c.junctionNodeId}'s line at ${b.toFixed(1)} m — the objective could be bought at a DIFFERENT junction`,
          );
        }
      }
    }
    expect(loose).toEqual([]);
  });

  it("l2-signal-1 / ex-signal-1: the exact junction that shipped broken, both halves", () => {
    const l2 = AUTHORED.find((a) => a.where === "spec:l2-intersections/l2-signal-1");
    const ex = AUTHORED.find((a) => a.where === "spec:lex-exam-1/ex-signal-1");
    expect(l2).toBeDefined();
    expect(ex).toBeDefined();
    for (const a of [l2!, ex!]) {
      const mine = crossings(a).filter((c) => c.control === "trafficLight");
      const own = mine.reduce((b, c) => (Math.min(...c.perLane) < Math.min(...b.perLane) ? c : b));
      // Every lane of its OWN junction is inside — including the far lane at
      // 37.7 m, which radius 30 excluded along with the other two.
      expect(Math.max(...own.perLane)).toBeGreaterThan(30); // the defect was real
      expect(Math.max(...own.perLane)).toBeLessThan(a.radiusM);
      // …and the next signalized junction still is not.
      const others = mine.filter((c) => c.junctionNodeId !== own.junctionNodeId);
      expect(Math.min(...others.flatMap((c) => c.perLane))).toBeGreaterThan(a.radiusM);
    }
  });
});
