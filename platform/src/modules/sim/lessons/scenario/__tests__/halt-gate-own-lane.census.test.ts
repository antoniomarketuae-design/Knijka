/**
 * CENSUS — sc-hz-brake-dont-swerve:cb563b2d (lane lanegate): every halt-capped reachZone gate in the catalogue ×
 * every committed demo of its lesson × every authored rung, replayed through the shipped evaluator.
 *
 * WHAT IT RECORDS. For each cell, the first sample at which `stepObjective` reports the gate done (stepped from the
 * tape's first sample with the empty context — the evaluator's own answer about where the car was and how fast),
 * where the car stood there, and the same for the gate with `restInLane` struck out — the gate the base shipped,
 * because every line of the repair sits behind that key (`objectives.ts reachZoneRestLaneOffsetM`).
 *
 * WHY IT EXISTS. The repair adds a term to the arrival conjunction of three gates. The claim it defends is the
 * narrow one: NO OTHER GATE MOVES BY ONE SAMPLE, no committed correct demo loses a tick on any rung, and every cell
 * that does change is a gate that authors `restInLane` and is one of exactly two kinds:
 *   · LOST — the struck twin ticked with the car's body not wholly inside the lane it names (a mistake demo only);
 *   · WAITED FOR THE HALT (round 2) — the struck twin ticked on a MOVING frame (the cap honoured at ≤ 6 km/h inside a
 *     disc the ladder widened), and the tree ticks later, on the first frame the car stands, wholly in its lane;
 *   · LOST: FIRST RING REST OUT OF LANE (round 3, L5) — the approach's first halted rest inside the radius + grace
 *     ring was made with the body not wholly in the lane (the void), so a later in-lane stop on that approach is not
 *     the graded one;
 *   · LOST: HALT OUTSIDE THE PLACE (round 3, L4) — the struck twin ticked on a MOVING frame and the car never stood,
 *     body in lane, inside the gate's own place (disc ∪ capsule) afterwards, so the tree has no frame to tick on.
 * ROUND 4: every cell with a void or a pass is an EXPECTED class of its own, named by demo and rung (L7: mistake-squeeze
 * L1–L5, «stopped out of the lane»; round 5, L11: mistake-pull-out L1, «crash rest out of the lane» — its story is the
 * head-on crash; the empty context cannot carry the crash pin, so here it reads as a plain void, and through the live
 * chain it is the same void with the crash's provenance, no lane card and the «crashRest» row).
 * Each cell also records, from the tree, the approach's lane void (`laneVoidedOffsetM`) and pass (`lanePass`
 * «passed») up to the tick, so a void or a pass on any committed demo is listed even where the tick does not move.
 * The base side of «no other gate moves» cannot be computed in the tree, so `HALT_LANE_CENSUS_OUT=<file>` writes
 * every cell and the lane diffs the base run against the tree run (its PROGRESS.md records both).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../../contracts";
import type { SimTick } from "../../../rules";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { makeTick } from "../../__tests__/fixtures";
import { REACH_ZONE_GRACE_M, REACH_ZONE_HALT_CAP_KMH, createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import { LANE_WIDTH_M } from "../../../runtime/spatial";
import { CHASSIS_HALF_EXTENTS } from "../../../vehicle/tuning";
import type { ObjectiveParams } from "../../types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const OUT = process.env.HALT_LANE_CENSUS_OUT;

interface Done {
  /** First sample index the gate is done at; -1 = never. */
  i: number;
  x: number | null;
  y: number | null;
  v: number | null;
  /** The heading at that sample (district degrees). */
  h: number | null;
  /** Round 3 — the first sample the tree raised the lane void at (up to the tick), and the pose there. */
  void?: { i: number; x: number; y: number; v: number; h: number; off: number };
  /** Round 3 — the first sample the tree marked the pass through the place without a stop. */
  pass?: { i: number; x: number; y: number; v: number };
}
export interface HaltLaneCell {
  key: string;
  lesson: string;
  gate: string;
  level: number;
  demo: string;
  /** The demo's kind: the shadow is the lesson's own correct drive. */
  kind: "shadow" | "mistake";
  authorsLane: boolean;
  tree: Done;
  struck: Done;
}

function ticksOf(trace: ScenarioTrace): SimTick[] {
  return trace.samples.map((s) =>
    makeTick({
      t: s.tSec,
      position: { x: s.x, y: s.y },
      speedKmh: s.speedKmh,
      headingDeg: s.headingDeg,
      gear: s.gear,
      indicator: s.indicator,
    }),
  );
}

function firstDone(params: ObjectiveParams, ticks: readonly SimTick[]): Done {
  let ev = createEvalState(params);
  let voidAt: Done["void"];
  let passAt: Done["pass"];
  const r3 = (n: number) => +n.toFixed(3);
  const extra = () => ({ ...(voidAt ? { void: voidAt } : {}), ...(passAt ? { pass: passAt } : {}) });
  for (let i = 0; i < ticks.length; i++) {
    const r = stepObjective(params, ev, ticks[i]);
    ev = r.evalState;
    const t = ticks[i];
    if (ev.type === "reachZone") {
      if (voidAt === undefined && ev.laneVoidedOffsetM !== undefined)
        voidAt = { i, x: r3(t.position.x), y: r3(t.position.y), v: r3(t.speedKmh), h: r3(t.headingDeg), off: r3(ev.laneVoidedOffsetM) };
      if (passAt === undefined && ev.lanePass === "passed") passAt = { i, x: r3(t.position.x), y: r3(t.position.y), v: r3(t.speedKmh) };
    }
    if (r.done) return { i, x: r3(t.position.x), y: r3(t.position.y), v: r3(t.speedKmh), h: r3(t.headingDeg), ...extra() };
  }
  return { i: -1, x: null, y: null, v: null, h: null, ...extra() };
}

function strike(o: LessonObjective): LessonObjective {
  const { restInLane: _struck, ...params } = o.params as Record<string, unknown>;
  return { ...o, params };
}

function demosOf(spec: ScenarioSpec): Array<{ name: string; kind: "shadow" | "mistake"; trace: ScenarioTrace }> {
  const refs: Array<{ path: string; kind: "shadow" | "mistake" }> = [];
  if (spec.shadow?.path) refs.push({ path: spec.shadow.path, kind: "shadow" });
  for (const m of spec.mistakes ?? []) if (m.traceRef?.path) refs.push({ path: m.traceRef.path, kind: "mistake" });
  return refs.map((r) => {
    const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, r.path), "utf-8")));
    if (trace === null) throw new Error(`unreadable committed trace ${r.path}`);
    return { name: path.basename(r.path, ".trace.json"), kind: r.kind, trace };
  });
}

export function haltLaneCensus(): HaltLaneCell[] {
  const cells: HaltLaneCell[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const levels = (spec.levels ?? []).map((l) => l.level as ScenarioLevel);
    let demos: ReturnType<typeof demosOf> | null = null;
    for (const level of levels) {
      const lesson = compileScenario(spec, level);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const params = parseObjectiveParams(o);
        if (params.kind !== "reachZone" || params.maxSpeedKmh === undefined || params.maxSpeedKmh > REACH_ZONE_HALT_CAP_KMH) continue;
        const struckParams = parseObjectiveParams(strike(o));
        demos ??= demosOf(spec);
        for (const d of demos) {
          const ticks = ticksOf(d.trace);
          cells.push({
            key: `${spec.id}/${o.id}@L${level}/${d.name}`,
            lesson: spec.id,
            gate: o.id,
            level,
            demo: d.name,
            kind: d.kind,
            authorsLane: (o.params as { restInLane?: unknown }).restInLane !== undefined,
            tree: firstDone(params, ticks),
            struck: firstDone(struckParams, ticks),
          });
        }
      }
    }
  }
  return cells;
}

describe("census: every halt-capped reachZone gate × every committed demo × every rung", () => {
  it("only the gates that author restInLane can differ from their struck twin; no correct demo loses a tick; every lost tick was a rest outside the lane", { timeout: 600_000 }, () => {
    const cells = haltLaneCensus();
    if (OUT) writeFileSync(OUT, cells.map((c) => JSON.stringify(c)).join("\n") + "\n");
    const gates = new Set(cells.map((c) => `${c.lesson}/${c.gate}`));
    // The population the finding names: 63 halt-capped gates (cap ≤ REACH_ZONE_HALT_CAP_KMH).
    expect(gates.size).toBe(63);
    // The tick only: `void`/`pass` are tree-side records (the struck twin can raise neither).
    const tickOf = (d: Done) => JSON.stringify([d.i, d.x, d.y, d.v, d.h]);
    const changed = cells.filter((c) => tickOf(c.tree) !== tickOf(c.struck));
    // The oracle, from the footprint and the built road (every lane gate's lane runs along +y through its mark at
    // half the 8.125 m pitch — halt-gate-rests-in-its-lane.test.ts §0), never from the code under test.
    const reach = (d: Done, markX: number) =>
      Math.abs(d.x! - markX) +
      CHASSIS_HALF_EXTENTS.z * Math.abs(Math.sin((d.h! * Math.PI) / 180)) +
      CHASSIS_HALF_EXTENTS.x * Math.abs(Math.cos((d.h! * Math.PI) / 180));
    const markX = (c: HaltLaneCell) => {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === c.lesson)!;
      return (spec.success.find((o) => o.id === c.gate)!.params as { x: number }).x;
    };
    // The gate's geometry on this rung (compiled — the ladder widens radii), and the demo's samples.
    const geo = (c: HaltLaneCell) => {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === c.lesson)!;
      return compileScenario(spec, c.level as ScenarioLevel).objectives.find((o) => o.id === c.gate)!.params as {
        x: number;
        y: number;
        radiusM: number;
      };
    };
    const samplesOf = (c: HaltLaneCell) =>
      demosOf(SCENARIO_TEMPLATES.find((s) => s.id === c.lesson)!).find((d) => d.name === c.demo)!.trace.samples;
    // The place, as an INDEPENDENT oracle for a lane along +y approached from −y (every lane gate's lane runs along +y
    // — halt-gate-rests-in-its-lane.test.ts §0 — and its demos come up it): the disc, plus the capsule stretched
    // REACH_ZONE_GRACE_M back down the approach with the disc's half-chord (objectives.ts «IT IS THE CAPSULE, NOT ITS
    // BOUNDING BOX»).
    const inPlaceOracle = (p: { x: number; y: number; radiusM: number }, x: number, y: number) => {
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.hypot(dx, dy) <= p.radiusM) return true;
      return Math.abs(dx) <= p.radiusM && dy <= 0 && dy >= -REACH_ZONE_GRACE_M - Math.sqrt(Math.max(0, p.radiusM ** 2 - dx * dx));
    };
    const unexplained: string[] = [];
    for (const c of changed) {
      expect(c.authorsLane, `${c.key} changed without the key`).toBe(true);
      // The repair can only withhold — never credit, never move a tick earlier.
      expect(c.struck.i, c.key).toBeGreaterThanOrEqual(0);
      expect(c.tree.i === -1 || c.tree.i > c.struck.i, c.key).toBe(true);
      const lost = c.tree.i === -1 && reach(c.struck, markX(c)) > LANE_WIDTH_M / 2;
      const waited =
        c.tree.i > c.struck.i &&
        Math.abs(c.struck.v!) > 1 &&
        Math.abs(c.tree.v!) <= 1 &&
        reach(c.tree, markX(c)) <= LANE_WIDTH_M / 2;
      // L5: the tree voided this approach on a halted rest inside the ring, body out of the lane (oracle-checked).
      const vd = c.tree.void;
      const g = geo(c);
      const lostFirstRingRest =
        c.tree.i === -1 &&
        vd !== undefined &&
        Math.abs(vd.v) <= 1 &&
        Math.hypot(vd.x - g.x, vd.y - g.y) <= g.radiusM + REACH_ZONE_GRACE_M &&
        reach({ i: vd.i, x: vd.x, y: vd.y, v: vd.v, h: vd.h }, markX(c)) > LANE_WIDTH_M / 2;
      // L4: the struck twin ticked on a moving frame and no later halted, body-in-lane sample stands in the place.
      const lostOutsidePlace =
        c.tree.i === -1 &&
        Math.abs(c.struck.v!) > 1 &&
        !samplesOf(c)
          .slice(c.struck.i)
          .some(
            (s) =>
              Math.abs(s.speedKmh) <= 1 &&
              inPlaceOracle(g, s.x, s.y) &&
              reach({ i: 0, x: s.x, y: s.y, v: s.speedKmh, h: s.headingDeg }, markX(c)) <= LANE_WIDTH_M / 2,
          );
      if (!lost && !waited && !lostFirstRingRest && !lostOutsidePlace) unexplained.push(c.key);
    }
    expect(unexplained).toEqual([]);
    // No correct demo LOSES its tick; a correct demo may only wait for its own halt.
    const shadowLost = changed.filter((c) => c.kind === "shadow" && c.tree.i === -1);
    expect(shadowLost.map((c) => c.key)).toEqual([]);
    // Every correct demo of a lane-claiming gate is credited on every rung, as it was.
    const laneShadows = cells.filter((c) => c.authorsLane && c.kind === "shadow");
    expect(laneShadows.length).toBeGreaterThan(0);
    for (const c of laneShadows) expect(c.tree.i, c.key).toBeGreaterThanOrEqual(0);
    // L5 STOP: no committed correct demo has an approach voided, and none is told it went through without stopping.
    expect(laneShadows.filter((c) => c.tree.void !== undefined || c.tree.pass !== undefined).map((c) => c.key)).toEqual([]);
    // ROUND 4 — EVERY VOID OR PASS ON A COMMITTED DEMO IS AN EXPECTED CLASS OF ITS OWN, by name and rung; any other is
    // a demo the integrator has not read against its story, and fails here.
    //   · ACCEPTED (L7) «stopped out of the lane»: sc-ln-obstacle-meeting · mistake-squeeze, L1–L5 — the tape ends at
    //     rest wholly in the oncoming lane (corners 5.21 / 6.91 m off the lane's centre line), 6.37 m from the mark,
    //     inside the ring on every rung: «Спря, но не изцяло в своята лента» names the demo's own error (it did not wait
    //     in its lane).
    //   · ACCEPTED (round 5, L11) «crash rest out of the lane»: sc-ln-obstacle-meeting · mistake-pull-out, L1 — its rest
    //     is the head-on crash's (−4.06, 137.378), inside L1's 11 m ring; the story is the crash. This census steps the
    //     evaluator with the EMPTY context, which cannot carry the crash pin («unknown», never «pinned»), so it records
    //     the void without its provenance; through the live chain the pin holds it: the same void, no lane card, the
    //     «crashRest» row (halt-gate-rests-in-its-lane.test.ts §9 L11). At L2–L5 the rest lies outside the ring.
    const expectedEvents: Record<string, string> = {
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].map((l) => [`sc-ln-obstacle-meeting/sc-lnom-wait@L${l}/mistake-squeeze`, "accepted L7: stopped out of the lane"]),
      ),
      "sc-ln-obstacle-meeting/sc-lnom-wait@L1/mistake-pull-out": "accepted L11: crash rest out of the lane (live: crashRest row, no lane card)",
    };
    const events = cells.filter((c) => c.tree.void !== undefined || c.tree.pass !== undefined);
    expect(events.map((c) => c.key).sort()).toEqual(Object.keys(expectedEvents).sort());
    // Each is a VOID (a halted out-of-lane rest inside the ring), never a pass, and its tick is the struck twin's.
    for (const c of events) {
      expect(c.tree.pass, c.key).toBeUndefined();
      expect(Math.abs(c.tree.void!.v), c.key).toBeLessThanOrEqual(1);
      expect(Math.abs(c.tree.void!.x - markX(c)) - CHASSIS_HALF_EXTENTS.x, `${c.key} the whole body out of the lane`).toBeGreaterThan(LANE_WIDTH_M / 2);
      expect(tickOf(c.tree), c.key).toBe(tickOf(c.struck));
    }
    // Every void or pass on a mistake demo is written out (the integrator reads each demo's story against it).
    if (OUT)
      writeFileSync(
        OUT.replace(/\.jsonl$/, "") + ".events.jsonl",
        cells
          .filter((c) => c.tree.void !== undefined || c.tree.pass !== undefined)
          .map((c) => JSON.stringify({ key: c.key, kind: c.kind, tree: c.tree, struck: c.struck }))
          .join("\n") + "\n",
      );
  });
});
