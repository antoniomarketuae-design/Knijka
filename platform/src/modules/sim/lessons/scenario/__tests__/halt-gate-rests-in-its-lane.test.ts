/**
 * sc-hz-brake-dont-swerve:cb563b2d [critical] — A HALT GATE WHOSE TITLE CLAIMS THE STUDENT'S OWN LANE TICKED A CAR
 * RESTING OUTSIDE IT (lane lanegate).
 *
 * THE FINDING (triage r3 «bouncetick», measured at 1f1536d and re-measured on this lane's base). «Спри преди
 * препятствието — с пълна спирачка, В своята лента» (sc-hzbds-stop) gave its ✓ to a car at rest OFF THE CARRIAGEWAY
 * (shift-x10-l140-b168: rest (9.945, 177.47), 5.9 m right of the lane centre, no contact, 0 points, «passed») and to
 * a car a lane over, in the escort's lane (shift-x-4.06-l160-b171: rest (−2.567, 179.05)). The façade bounce
 * (bounce-y170-s-0.7-b0.5-release) is one case of it.
 *
 * THE CAUSE. `objectives.ts reachZoneApproachAxis` latches the capsule's axis from wherever the car first enters the
 * radius + REACH_ZONE_GRACE_M ring (a later re-entry within 90° re-latches it), and `stepReachZone` measures the
 * capsule's lateral offset across THAT axis. A car that enters the ring from beside the lane and rests within ~2 m of
 * its entry reads 0 m sideways and is «stopped at the mark». Nothing compared the rest with the lane. The same pure
 * probe ticked 216 of 216 approach sides on the three gates whose titles claim the student's own lane.
 *
 * THE REPAIR. Those three gates author the lane they name (`ReachZoneParams.restInLane`: the lane's heading and half
 * its width, the lane's centre line running through the mark), and the tick is issued only on a frame on which the
 * car is HALTED with its WHOLE BODY inside that lane — every corner of the product's footprint, measured across the
 * AUTHORED lane heading, never across the latched axis — and only if the approach has not already spent its graded
 * rest outside the lane. The capsule itself, its axis and every other gate are untouched
 * (`halt-gate-own-lane.census.test.ts`).
 *
 * ROUND 2 (round 1 was refuted). Round 1 tested the car's CENTRE against half the lane pitch, so a car straddling
 * the lane line with 0.85 m of body in the escort's lane or past the carriageway edge kept «✓ … В своята лента» and
 * «passed» (six of the finding's own shift drives, shift-x0-*), and a car that stopped outside the lane and crept back
 * at 3 km/h was ticked while still moving, on the lane line. The oracles below are derived from the footprint
 * (`vehicle/tuning CHASSIS_HALF_EXTENTS`) and the built road (`runtime/spatial LANE_WIDTH_M`), never from the code
 * under test.
 *
 *  §0 the lane each gate authors IS the built road's lane at the mark (the locator, the lane pitch, the edge's
 *     direction), on every rung; and exactly the gates whose title claims the own lane author it.
 *  §1 the triage's pure grid: a straight approach 0 … 8.125 m to either side, resting 0.3 / 1 / 2 m after entering
 *     the ring — ticks ONLY with the whole body inside the lane (the struck twin ticks every cell: the defect); a rest
 *     exactly on the bound and either side of it; an askew rest judged by its corners.
 *  §2 a straight in-lane stop still ticks at every rung, anywhere in the disc and the capsule.
 *  §3 the triage's chassis drives on the product's chassis (with the six shift-x0 straddles): the tick is gone, the
 *     bill is unchanged, the student is told why on the frame it would have ticked, the row and the debrief say why.
 *  §4 one drive, one sheet on every display (ADR-014).
 *  §5 the reason survives the wire.
 *  §6 the committed correct demos still tick, through the LIVE chain, on every rung.
 *  §7 the first halted rest of an approach is the graded act: no tick on a moving frame; stopping outside the lane and
 *     creeping back does not tick; a fresh approach does; the card is spoken once, on a halted frame; the row's reason
 *     outlives the car moving on.
 *
 * ROUND 3 (round 2 was refuted: sc-lnom-wait ticked a halt 27 m past the parked row after a roll through the disc).
 *  §8a L4 — the tick is AT THE MARK: only on a frame inside the gate's own place (`inAcceptance || graceArmed`); a
 *      roll through the place within the cap, then a halt anywhere else, is not ticked — and the pass is said
 *      («Мина, без да спреш», the row's «passedUnhalted»), because an open row with no reason is a bare verdict.
 *  §8b L5 — the FIRST HALTED REST INSIDE THE APPROACH RING with the body out of the lane voids the approach, whether
 *      or not it honoured the arrival (a wide swerve inside the ring, then a creep back, is not ticked); an in-lane
 *      rest, and a rest outside the ring, void nothing.
 *  §8c the pass is said only for a pass: not over the cap, not backing out, not on a voided approach, not after a
 *      halt in the place; a fresh approach clears it; it survives the wire.
 *
 * ROUND 4 (integrator rulings L6–L10, 2026-10-18).
 *  §9 L11 (round 5, replacing round 4's L6 exemption) — A CRASH'S REST VOIDS THE APPROACH, SAYS NOTHING ABOUT THE
 *      LANE MID-DRIVE, AND THE ROW SAYS IT WAS THE CRASH: a halted out-of-lane rest inside the ring that the crash pin
 *      holds (`ObjectiveContext.restIsCrashPinned`, the fact `haltVoided` «impact» reads) raises the void like any
 *      first out-of-lane rest of the approach, with its provenance (`laneVoidedByCrash`); no lane card is spoken on
 *      it; the open task's row and debrief carry «crashRest». A later non-crash rest on that approach changes neither.
 *      So a crash's rest, a return into the lane and a halt at the mark on the same approach is NOT ticked (round 4's
 *      measured residual); the façade bounce (§3) and mistake-pull-out@L1 say why on the row.
 *  §10 (round 5, C1) — a voided approach driven out of the FAR side of the ring and back in keeps its void:
 *      `reachZoneApproachAxis` reports no `freshApproach` on a re-entry more than 90° from the latched approach.
 *  §9 L7 — sc-ln-obstacle-meeting mistake-squeeze, L1–L5: the demo's car stands wholly in the oncoming lane inside
 *      the ring; the lane card, the «outOfLane» row and the debrief line name its own error (accepted).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { LessonSpec } from "../../../contracts";
import { objectiveDetailText, sessionVerdict } from "../../../hud/SessionEndScreen";
import type { SimTick } from "../../../rules";
import { LANE_WIDTH_M } from "../../../runtime/spatial";
import { CHASSIS_HALF_EXTENTS } from "../../../vehicle/tuning";
import { createWorldRuntime } from "../../../runtime/worldRuntime";
import { parseScenarioTrace } from "../../../traces/parse";
import { makeTick } from "../../__tests__/fixtures";
import { buildDebrief } from "../../debrief";
import type { LessonStepResult } from "../../engine";
import {
  REACH_ZONE_GRACE_M,
  REACH_ZONE_HALT_CAP_KMH,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
} from "../../objectives";
import type { ReachZoneParams } from "../../types";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_HZ_BRAKE_DONT_SWERVE, SC_HZ_EMERGENCY_STOP } from "../templates-hazards2";
import { SC_LN_OBSTACLE_MEETING } from "../templates-lanes2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { driveIntoContact, initRapier, sheetDigest, type ContactDriveOutcome, type DriveState } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";

beforeAll(async () => {
  await initRapier();
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
/** The three halt gates whose title claims the student's OWN lane. */
const GATES: ReadonlyArray<{ spec: ScenarioSpec; id: string; title: string }> = [
  { spec: SC_HZ_BRAKE_DONT_SWERVE, id: "sc-hzbds-stop", title: "Спри преди препятствието — с пълна спирачка, В своята лента" },
  { spec: SC_HZ_EMERGENCY_STOP, id: "sc-hzes-stop", title: "Спри преди детето — с пълна спирачка, в лентата" },
  { spec: SC_LN_OBSTACLE_MEETING, id: "sc-lnom-wait", title: "Спри в своята лента пред препятствието" },
];
/**
 * A title that claims the student's OWN lane: «в своята лента», «в лентата си», «в лентата». A NAMED lane («в
 * аварийната лента») is a different claim and is not this one (reported to the integrator: sc-hzbp-stop).
 */
const OWN_LANE_CLAIM = /(^|[^\p{L}])в (своята лента|лентата си|лентата)(?![\p{L}])/iu;

/** The card the student is shown on the frame the stop would have counted (lessons/engine.ts objectiveNotice). */
const CARD_TITLE = "Спря, но не изцяло в своята лента";
const CARD_PEEK = "Спирай изцяло в лентата.";
/** The end card's row (hud/SessionEndScreen HALT_VOIDED_ROW_BG.outOfLane). */
const ROW = "Не се отчете: колата спря, без да е изцяло в своята лента — задачата е да спреш в нея.";
/** The debrief's line (lessons/debrief.ts HALT_VOIDED_DEBRIEF_BG.outOfLane). */
const debriefLine = (title: string) =>
  `Задачата «${title}» не се отчете: колата спря, без да е изцяло в своята лента — задачата е да спреш в нея. Спирай с прав волан.`;
/** Round 5 (L11): the row and the debrief line when the void's rest was the crash's (HALT_VOIDED_*_BG.crashRest). */
const CRASH_ROW = "Не се отчете: колата спря след удар, без да е изцяло в своята лента — задачата е да спреш в нея, без удар.";
const crashDebriefLine = (title: string) =>
  `Задачата «${title}» не се отчете: колата спря след удар, без да е изцяло в своята лента — задачата е да спреш в нея, без удар. Спирай по-рано, с прав волан.`;

/** The product's own footprint: the rapier chassis collider's half extents (width x, length z). */
const HALF_W = CHASSIS_HALF_EXTENTS.x;
const HALF_L = CHASSIS_HALF_EXTENTS.z;
/** The built road's lane: half its pitch either side of the centre line through the mark (§0). */
const HALF_LANE = LANE_WIDTH_M / 2;
/**
 * THE ORACLE, independent of the code under test: how far the body's outermost corner reaches across a lane that runs
 * along +y (heading 0 — every one of the three lanes, §0) from its centre line, for a car whose centre is `dx` off it
 * at heading `h` (district degrees). Closed form: |dx| + HALF_L·|sin h| + HALF_W·|cos h|.
 */
const bodyReachM = (dx: number, h = 0) =>
  Math.abs(dx) + HALF_L * Math.abs(Math.sin((h * Math.PI) / 180)) + HALF_W * Math.abs(Math.cos((h * Math.PI) / 180));

function gateParams(spec: ScenarioSpec, id: string, level: ScenarioLevel, struck = false): ReachZoneParams {
  const o = compileScenario(spec, level).objectives.find((x) => x.id === id)!;
  const raw = o.params as Record<string, unknown>;
  const { restInLane: _struck, ...rest } = raw;
  const p = parseObjectiveParams({ ...o, params: struck ? rest : raw });
  if (p.kind !== "reachZone") throw new Error(`${id} is not a reachZone`);
  return p;
}

/** The lesson as compiled, or with the ONE key this lane adds struck out — the lesson the base shipped. */
function lessonOf(spec: ScenarioSpec, level: ScenarioLevel, struck = false): LessonSpec {
  const lesson = compileScenario(spec, level);
  if (!struck) return lesson;
  return {
    ...lesson,
    objectives: lesson.objectives.map((o) => {
      const { restInLane: _struck, ...params } = o.params as Record<string, unknown>;
      return { ...o, params };
    }),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §0 · the lane is the built road's lane
// ───────────────────────────────────────────────────────────────────────────

describe("§0 the lane each own-lane gate authors is the lane the built road draws at its mark", () => {
  it("on every rung: the mark sits on a lane centre of the built road, the heading is the road's, the half-width is half the lane pitch", () => {
    for (const g of GATES) {
      const raw = loadDistrict(g.spec.map.districtId) as {
        roads: { edges: Array<{ id: string; geometry: Array<[number, number]> }> };
      };
      const rt = createWorldRuntime(raw);
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const lane = p.restInLane;
        expect(lane, `${g.id}@L${level}`).toBeDefined();
        if (lane === undefined) continue;
        expect(lane.halfWidthM, `${g.id}@L${level} half the lane pitch`).toBe(LANE_WIDTH_M / 2);
        const fix = rt.locate({ x: p.x, y: p.y });
        expect(typeof fix.edgeId, `${g.id}@L${level} the mark is on a road`).toBe("string");
        expect(Math.abs(fix.laneOffsetM), `${g.id}@L${level} the mark is on its lane's centre`).toBeLessThan(0.05);
        // The road's own direction at the mark: the edge segment the mark projects onto.
        const edge = raw.roads.edges.find((e) => e.id === fix.edgeId)!;
        let best = { d: Infinity, deg: 0 };
        for (let i = 0; i + 1 < edge.geometry.length; i++) {
          const [ax, ay] = edge.geometry[i];
          const [bx, by] = edge.geometry[i + 1];
          const vx = bx - ax;
          const vy = by - ay;
          const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / (vx * vx + vy * vy)));
          const d = Math.hypot(ax + t * vx - p.x, ay + t * vy - p.y);
          if (d < best.d) best = { d, deg: (Math.atan2(vx, vy) * 180) / Math.PI };
        }
        // A lane is a line: its heading is read modulo 180°.
        const diff = (((lane.headingDeg - best.deg) % 180) + 180) % 180;
        expect(Math.min(diff, 180 - diff), `${g.id}@L${level} heading`).toBeLessThan(0.5);
        expect(g.spec.success.find((o) => o.id === g.id)!.titleBg).toBe(g.title);
      }
    }
  });

  it("exactly the halt gates whose title claims the student's own lane author it — no more, no fewer", () => {
    const claim: string[] = [];
    const authors: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        if ((o.params as { restInLane?: unknown }).restInLane !== undefined) authors.push(`${spec.id}/${o.id}`);
      }
      for (const level of (spec.levels ?? []).map((l) => l.level as ScenarioLevel)) {
        for (const o of compileScenario(spec, level).objectives) {
          if (o.kind !== "reachZone") continue;
          const p = parseObjectiveParams(o);
          if (p.kind !== "reachZone" || p.maxSpeedKmh === undefined || p.maxSpeedKmh > REACH_ZONE_HALT_CAP_KMH) continue;
          if (OWN_LANE_CLAIM.test(o.titleBg)) claim.push(`${spec.id}/${o.id}`);
        }
      }
    }
    const expected = GATES.map((g) => `${g.spec.id}/${g.id}`).sort();
    expect([...new Set(claim)].sort()).toEqual(expected);
    expect(authors.sort()).toEqual(expected);
  });

  it("the template comments no longer say the radius keeps a car one lane over out", () => {
    for (const f of ["templates-hazards2.ts", "templates-lanes2.ts"]) {
      const src = readFileSync(path.join(HERE, "..", f), "utf-8");
      expect(src, f).not.toMatch(/\(x = −4\.06\) can never satisfy it/);
      expect(src, f).not.toMatch(/satisfiable ONLY from the own-lane/);
      expect(src, f).not.toMatch(/swerved is not on x = 4\.06 at all/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §1 · the triage's pure grid
// ───────────────────────────────────────────────────────────────────────────

/**
 * The triage probe's drive, verbatim: 30 km/h straight up +y at x from 60 m short of the mark, 6 m/s² to rest at
 * `stopY`, then standing 1.5 s; one tick per 1/60 s. Returns whether the gate ticked, and where the car stood.
 */
function pureDrive(params: ReachZoneParams, x: number, stopY: number, headingDeg = 0): { done: boolean; restY: number; v: number } {
  const dt = 1 / 60;
  let y = params.y - 60;
  let v = 30 / 3.6;
  const brakeFrom = stopY - (v * v) / (2 * 6);
  let t = 0;
  let ev = createEvalState(params);
  let standing = 0;
  while (standing < 90 && t < 60) {
    if (y >= brakeFrom) v = Math.max(0, v - 6 * dt);
    y += v * dt;
    t += dt;
    if (v === 0) standing++;
    const r = stepObjective(params, ev, makeTick({ t, position: { x, y }, speedKmh: v * 3.6, headingDeg }));
    ev = r.evalState;
    if (r.done) return { done: true, restY: y, v: v * 3.6 };
  }
  return { done: false, restY: y, v: v * 3.6 };
}

// 3.2 is in (body to 4.05 m); 3.25 — the lane-keeping rule's straddle band — and everything beyond is out; 4 and
// 4.06 are the cells round 1 ticked with the body over the line.
const DXS = [0, 1.5, 3, 3.2, 3.25, 3.5, 4, 4.06, 4.5, 6, 7, 8.125];
const AFTERS = [0.3, 1, 2];

describe("§1 the pure grid: 0 … 8.125 m either side, resting 0.3 / 1 / 2 m after entering the ring", () => {
  for (const g of GATES) {
    it(`${g.id}: ticks ONLY with the whole body inside the lane at every rung; the struck twin ticks every cell (the defect)`, () => {
      const rows: string[] = [];
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const base = gateParams(g.spec, g.id, level, true);
        // The oracle is the BUILT ROAD's lane (half its pitch either side of the mark's lane centre, §0) and the
        // product's footprint, never the gate's own key — so a gate that dropped the key, authored the wrong width or
        // measured the centre instead of the body, is red here on its ticks.
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        for (const dx of DXS) {
          const entryY = p.y - Math.sqrt(Math.max(0, ring * ring - dx * dx));
          for (const after of AFTERS) {
            for (const side of [1, -1]) {
              const x = p.x + side * dx;
              const tree = pureDrive(p, x, entryY + after);
              const struck = pureDrive(base, x, entryY + after);
              const inLane = bodyReachM(dx) <= HALF_LANE;
              if (tree.done !== inLane) rows.push(`L${level} dx ${side * dx} after ${after}: tree ${tree.done}, body in lane ${inLane}`);
              if (tree.done && Math.abs(tree.v) > 1) rows.push(`L${level} dx ${side * dx} after ${after}: ticked moving at ${tree.v}`);
              if (!struck.done) rows.push(`L${level} dx ${side * dx} after ${after}: the struck twin did not tick`);
            }
          }
        }
      }
      expect(rows).toEqual([]);
    });
  }
});

describe("§1b the bound itself, and a car standing askew", () => {
  it("a straight rest with the body's edge ON the lane line ticks; a millimetre over does not; a millimetre in does — every gate, every rung", () => {
    const rows: string[] = [];
    // 4.0625 − 0.85 = 3.2125 m: the centre offset at which the body's edge is on the line.
    const bound = HALF_LANE - HALF_W;
    expect(bound).toBeCloseTo(3.2125, 10);
    for (const g of GATES) {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        for (const side of [1, -1]) {
          for (const [dx, want] of [
            [bound - 0.001, true],
            [bound, true],
            [bound + 0.001, false],
          ] as const) {
            const entryY = p.y - Math.sqrt(ring * ring - dx * dx);
            const r = pureDrive(p, p.x + side * dx, entryY + 1);
            if (r.done !== want) rows.push(`${g.id}@L${level} centre ${side * dx}: ticked ${r.done}, want ${want}`);
          }
        }
      }
    }
    expect(rows).toEqual([]);
  });

  it("an askew rest is judged by its corners: the centre inside 3.2125 m with a corner over the line does NOT tick", () => {
    const rows: string[] = [];
    // [centre offset, heading]: the first four have a corner over (2.5 + 2.02·sin25° + 0.85·cos25° = 4.12 m; 2.9 at
    // 12° reaches 4.15 m); the rest are wholly in (2.5 at 10° reaches 3.69 m; the centre line at 40° reaches 1.95 m).
    const CASES: ReadonlyArray<[number, number]> = [
      [2.5, 25],
      [-2.5, -25],
      [2.5, -25],
      [2.9, 12],
      [2.5, 10],
      [0, 40],
      [-2, -15],
    ];
    for (const g of GATES) {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        for (const [dx, h] of CASES) {
          const want = bodyReachM(dx, h) <= HALF_LANE;
          const entryY = p.y - Math.sqrt(ring * ring - dx * dx);
          const r = pureDrive(p, p.x + dx, entryY + 1, h);
          if (r.done !== want) rows.push(`${g.id}@L${level} centre ${dx} heading ${h}: ticked ${r.done}, body reach ${bodyReachM(dx, h).toFixed(3)}`);
        }
      }
    }
    // The oracle really has both kinds: centres well inside 3.2125 m that are OUT, and askew rests that are IN.
    expect(CASES.filter(([dx, h]) => Math.abs(dx) < 3.2125 && bodyReachM(dx, h) > HALF_LANE).length).toBe(4);
    expect(CASES.filter(([dx, h]) => bodyReachM(dx, h) <= HALF_LANE).length).toBe(3);
    expect(rows).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 · a straight in-lane stop still ticks, everywhere it did
// ───────────────────────────────────────────────────────────────────────────

describe("§2 a straight stop in the lane still ticks at every rung", () => {
  for (const g of GATES) {
    it(`${g.id}: rests from the back of the capsule to the mark, on the lane centre and 3 m to either side of it`, () => {
      const missed: string[] = [];
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        for (const lat of [0, 3, -3]) {
          // The capsule's back at this offset: the grace plus the disc's half-chord (objectives.ts `backOfDisc`).
          const back = REACH_ZONE_GRACE_M + Math.sqrt(p.radiusM * p.radiusM - lat * lat) - 0.3;
          for (const along of [-back, -6, -4, -2, -0.5]) {
            const r = pureDrive(p, p.x + lat, p.y + along);
            if (!r.done) missed.push(`L${level} lateral ${lat} along ${along}`);
          }
        }
      }
      expect(missed).toEqual([]);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §3 · the triage's chassis drives
// ───────────────────────────────────────────────────────────────────────────

interface Ctx {
  billed: boolean;
}
type Control = (st: DriveState, ctx: Ctx) => { throttle?: number; brake?: number; steer?: number };

const HOLD = 47.45;
const cruise = (target: number, kmh: number) => {
  const err = target - kmh;
  return err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12;
};
const signed = (h: number) => ((((h + 180) % 360) + 360) % 360) - 180;
/** Steer toward lane x `xt`, heading 0 (steer > 0 = left = x decreasing) — the triage probe's. */
const laneSteer = (st: DriveState, xt: number, gain = 6, maxH = 20) => {
  const hDes = Math.max(-maxH, Math.min(maxH, gain * (xt - st.x)));
  return Math.max(-1, Math.min(1, (signed(st.headingDeg) - hDes) / 12));
};
/** The triage's lane shift: leave the lane for x `xt` from y `leaveY`, the whole pedal from `brakeY`. */
const shift = (leaveY: number, xt: number, brakeY: number): Control => (st, c) => {
  if (c.billed) return { brake: 1, steer: 0 };
  const brake = st.y >= brakeY ? 1 : 0;
  const steer = st.y >= leaveY ? laneSteer(st, xt, 8, 30) : 0;
  return brake > 0 ? { brake, steer } : { throttle: cruise(HOLD, st.speedKmh), steer };
};
/** The verifier's swerve: brake `b`, wheel `s` from `fromY`; every pedal released at the bill. */
const swerveRelease = (fromY: number, s: number, b: number): Control => (st, c) => {
  if (c.billed) return {};
  if (st.y >= fromY) return { throttle: 0, brake: b, steer: s };
  return { throttle: cruise(st.y >= 88 ? HOLD : HOLD, st.speedKmh), brake: 0, steer: 0 };
};

interface Driven extends ContactDriveOutcome {
  hud: Array<{ k: number; kind: string; titleBg: string; explanationBg: string; peekBg: string; x: number; y: number; v: number }>;
  taskDoneAt: Array<number | null>;
  last: SimTick | null;
  /** Every grid point the lesson was stepped on: its step, pose and speed (round 3 — where the first halted rest was). */
  trace: Array<{ k: number; x: number; y: number; h: number; v: number }>;
}

const PHONE = [1 / 60, 7 / 60, 2 / 60, 12 / 60, 1 / 60, 30 / 60];

function drive(lesson: LessonSpec, control: Control, deltas: readonly number[] = [1 / 60]): Driven {
  const ctx: Ctx = { billed: false };
  const hud: Driven["hud"] = [];
  const taskDoneAt: Array<number | null> = lesson.objectives.map(() => null);
  let last: SimTick | null = null;
  const trace: Driven["trace"] = [];
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId),
    start: { x: 4.06, y: 15, headingDeg: 0 },
    control: (st: DriveState) => control(st, ctx),
    deltas,
    maxSteps: 2400,
    onStep: (tick: SimTick, step: LessonStepResult) => {
      const k = Math.round(tick.t * 60);
      trace.push({ k, x: tick.position.x, y: tick.position.y, h: tick.headingDeg, v: tick.speedKmh });
      for (const h of step.hudEvents) {
        const e = h as { kind: string; titleBg?: string; explanationBg?: string; peekBg?: string };
        hud.push({
          k,
          kind: e.kind,
          titleBg: e.titleBg ?? "",
          explanationBg: e.explanationBg ?? "",
          peekBg: e.peekBg ?? "",
          x: tick.position.x,
          y: tick.position.y,
          v: tick.speedKmh,
        });
      }
      step.state.objectives.forEach((ob, i) => {
        if (taskDoneAt[i] === null && ob.completedAtSec != null) taskDoneAt[i] = k;
      });
      if (step.state.events.some((e) => e.kind === "violation" && e.code === "COLLISION")) ctx.billed = true;
      last = tick;
    },
  });
  return { ...o, hud, taskDoneAt, last, trace };
}

interface ChassisCell {
  name: string;
  level: ScenarioLevel;
  control: () => Control;
  /** MEASURED on this lane's base (= 1f1536d), the lesson as shipped: the grid point task 2 ticked at, and the rest. */
  baseTickStep: number;
  baseRest: { x: number; y: number };
  /** COLLISION points the drive is billed (unchanged by the repair). */
  collisionPoints: number[];
  /**
   * Round 4 (L6): the out-of-lane rest is the CRASH'S — the car stands where its own terminating collision left it
   * (`ObjectiveContext.restIsCrashPinned`), so it raises no lane void, no card and no «outOfLane» row; it is billed and
   * explained by the crash.
   */
  crashRest?: true;
}
const CHASSIS: ChassisCell[] = [
  {
    name: "shift-x10-l140-b168 (off the carriageway, no contact)",
    level: 3,
    control: () => shift(140, 10, 168),
    baseTickStep: 925,
    baseRest: { x: 9.945, y: 177.47 },
    collisionPoints: [],
  },
  {
    name: "shift-x10-l140-b168 at L1",
    level: 1,
    control: () => shift(140, 10, 168),
    baseTickStep: 925,
    baseRest: { x: 9.945, y: 177.47 },
    collisionPoints: [],
  },
  {
    name: "shift-x-4.06-l160-b171 (in the escort's lane, no contact)",
    level: 3,
    control: () => shift(160, -4.06, 171),
    baseTickStep: 926,
    baseRest: { x: -2.567, y: 179.05 },
    collisionPoints: [],
  },
  {
    name: "bounce-y170-s-0.7-b0.5-release (the façade, then rolled back)",
    level: 3,
    control: () => swerveRelease(170, -0.7, 0.5),
    baseTickStep: 1066,
    baseRest: { x: 12.563, y: 181.741 },
    collisionPoints: [10],
    crashRest: true,
  },
  // ROUND 2 — the six of the finding's own shift drives that round 1's centre test still ticked «passed»: the car
  // straddles the lane line into the escort's lane, centre 3.47 … 4.045 m off, 0.26 … 0.83 m of body over the line
  // (the verifier's shift-tree.jsonl; the rests are the base's, measured on the struck twin).
  ...(
    [
      ["shift-x0-l140-b168", 140, 168, 920, 0.035, 177.571],
      ["shift-x0-l140-b171", 140, 171, 933, 0.023, 180.463],
      ["shift-x0-l140-b174", 140, 174, 947, 0.015, 183.581],
      ["shift-x0-l160-b168", 160, 168, 915, 0.589, 177.598],
      ["shift-x0-l160-b171", 160, 171, 924, 0.43, 179.606],
      ["shift-x0-l160-b174", 160, 174, 939, 0.283, 182.67],
    ] as const
  ).map(
    ([name, leaveY, brakeY, step, x, y]): ChassisCell => ({
      name: `${name} (straddling the lane line, no contact)`,
      level: 3,
      control: () => shift(leaveY, 0, brakeY),
      baseTickStep: step,
      baseRest: { x, y },
      collisionPoints: [],
    }),
  ),
];

const STOP = GATES[0];
const debriefOf = (o: ContactDriveOutcome, lesson: LessonSpec) =>
  buildDebrief(lesson, o.result, { coachedMistakes: o.result.coachedMistakes }).text;

describe("§3 the triage's drives on the product's chassis", () => {
  for (const cell of CHASSIS) {
    it(`${cell.name}: the struck twin ticks where the base did; the tree does not, bills the same, and says why`, () => {
      const base = drive(lessonOf(SC_HZ_BRAKE_DONT_SWERVE, cell.level, true), cell.control());
      const tree = drive(lessonOf(SC_HZ_BRAKE_DONT_SWERVE, cell.level), cell.control());
      // The defect, reproduced on the struck twin: the tick at the base's grid point, the car off its lane.
      expect(base.taskDoneAt[1], "struck twin's tick").toBe(cell.baseTickStep);
      const bl = base.last!;
      expect(+bl.position.x.toFixed(3)).toBe(cell.baseRest.x);
      expect(+bl.position.y.toFixed(3)).toBe(cell.baseRest.y);
      // The repair: no tick, anywhere in the drive.
      expect(tree.taskDoneAt[1], "tree's tick").toBeNull();
      expect(tree.result.objectives[1].done).toBe(false);
      // The bill is not the repair's to move: the same contacts, up to where the base ended.
      expect(tree.collisions.filter((c) => c.t * 60 <= cell.baseTickStep + 0.5).map((c) => c.points)).toEqual(cell.collisionPoints);
      expect(base.collisions.map((c) => c.points)).toEqual(cell.collisionPoints);
      // THEO-4: the student is told, on the approach's FIRST HALTED REST INSIDE THE RING with the body out of the
      // lane (round 3, L5) — derived from the drive's own trace with the footprint oracle, never from the code under
      // test. On these drives that is the first standstill, 0.5 s before the base's tick (the base waited for the
      // arrival's other demands; the standstill the task grades was already made).
      const mark = gateParams(SC_HZ_BRAKE_DONT_SWERVE, STOP.id, cell.level);
      const firstOutRest = tree.trace.find(
        (p) =>
          Math.abs(p.v) <= 1 &&
          Math.hypot(p.x - mark.x, p.y - mark.y) <= mark.radiusM + REACH_ZONE_GRACE_M &&
          bodyReachM(p.x - mark.x, p.h) > HALF_LANE,
      );
      expect(firstOutRest, "a halted rest out of the lane inside the ring").toBeDefined();
      expect(firstOutRest!.k).toBeLessThanOrEqual(cell.baseTickStep);
      if (cell.crashRest) {
        // ROUND 5 (L11): A CRASH'S REST VOIDS THE APPROACH, SAYS NOTHING ABOUT THE LANE MID-DRIVE, AND THE ROW SAYS IT
        // WAS THE CRASH. The car came to rest inside the ring with its body out of the lane, within CRASH_PIN_RADIUS_M of
        // its own façade impact, motionless: the crash pin holds it. No lane card is spoken on it (the impact's COLLISION
        // card spoke); the void is raised with the crash's provenance, so the open task's row and debrief say the car
        // stopped after a crash (round 4 exempted the rest and left this row with NO reason — refuted).
        expect(tree.collisions.length, "the façade impact is billed").toBeGreaterThan(0);
        expect(tree.collisions[0].t * 60, "«след удар»: the impact precedes the graded rest").toBeLessThan(firstOutRest!.k);
        expect(tree.hud.filter((h) => h.titleBg === CARD_TITLE)).toEqual([]);
        expect(tree.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "crashRest" });
        expect(objectiveDetailText(tree.result.objectives[1].detail!)).toBe(CRASH_ROW);
        expect(tree.hud.filter((h) => h.titleBg === "Край на упражнението след удара").length).toBe(1);
        const text = debriefOf(tree, lessonOf(SC_HZ_BRAKE_DONT_SWERVE, cell.level));
        expect(text).toContain(crashDebriefLine(STOP.title));
        expect(text).not.toContain(debriefLine(STOP.title));
        expect(text).toContain("Удар в неподвижно препятствие");
        expect(sessionVerdict(tree.result)).toBe("failed");
        return;
      }
      const cards = tree.hud.filter((h) => h.titleBg === CARD_TITLE);
      expect(cards.map((h) => h.k)).toEqual([firstOutRest!.k]);
      const lateral = Math.abs(cards[0].x - 4.06);
      expect(cards[0].explanationBg).toContain(`на ${lateral.toFixed(1)} м встрани от средата на своята лента`);
      expect(cards[0].peekBg).toBe(CARD_PEEK);
      expect(Math.abs(cards[0].v)).toBeLessThanOrEqual(1);
      // The card's «не беше изцяло в нея» is true of the pose it is spoken on: the body reaches over the line.
      expect(bodyReachM(cards[0].x - 4.06)).toBeGreaterThan(HALF_LANE);
      // …and the row and the debrief say why the task is open.
      expect(tree.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
      expect(objectiveDetailText(tree.result.objectives[1].detail!)).toBe(ROW);
      const text = debriefOf(tree, lessonOf(SC_HZ_BRAKE_DONT_SWERVE, cell.level));
      expect(text).toContain(debriefLine(STOP.title));
      expect(text).not.toContain("Задачите от маршрута са изпълнени");
      // No sheet that names an open own-lane task is «passed».
      expect(sessionVerdict(tree.result)).not.toBe("passed");
    }, 120_000);
  }

  it("a straight full stop in the lane on the chassis keeps the tick, with no card and no reason", () => {
    const o = drive(lessonOf(SC_HZ_BRAKE_DONT_SWERVE, 3), (st) => (st.y >= 172 ? { brake: 1, steer: 0 } : { throttle: cruise(HOLD, st.speedKmh) }));
    expect(o.taskDoneAt[1]).not.toBeNull();
    expect(o.result.objectives[1].done).toBe(true);
    expect(o.result.objectives[1].detail).toBeUndefined();
    expect(o.hud.filter((h) => h.titleBg === CARD_TITLE)).toEqual([]);
  }, 120_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §4 · one drive, one sheet, on every display
// ───────────────────────────────────────────────────────────────────────────

describe("§4 one drive gets one sheet on every display (ADR-014)", () => {
  it("shift-x10-l140-b168 at L3: 60 Hz, 30 Hz and the phone cadence print the same sheet and the same card", () => {
    const lesson = lessonOf(SC_HZ_BRAKE_DONT_SWERVE, 3);
    const a = drive(lesson, shift(140, 10, 168));
    for (const deltas of [[1 / 30], PHONE]) {
      const b = drive(lesson, shift(140, 10, 168), deltas);
      expect(sheetDigest(b.result)).toBe(sheetDigest(a.result));
      expect(b.hud.filter((h) => h.titleBg === CARD_TITLE).map((h) => [h.k, h.explanationBg])).toEqual(
        a.hud.filter((h) => h.titleBg === CARD_TITLE).map((h) => [h.k, h.explanationBg]),
      );
    }
  }, 240_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §5 · the reason survives the wire
// ───────────────────────────────────────────────────────────────────────────

describe("§5 the server's sheet says the same thing", () => {
  it("shift-x10-l140-b168 at L3 through the finish wire: the task undone, the reason on the row and in the server's debrief; a forged reason drops", () => {
    const lesson = lessonOf(SC_HZ_BRAKE_DONT_SWERVE, 3);
    const o = drive(lesson, shift(140, 10, 168));
    const wire = (detail?: unknown) => ({
      lessonId: lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(o.result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(o.session.events),
      objectives: o.result.objectives.map((ob, i) => ({
        id: ob.id,
        done: ob.done,
        completedAtSec: ob.completedAtSec,
        ...(i === 1 && detail !== undefined ? { detail } : ob.detail !== undefined ? { detail: ob.detail } : {}),
      })),
    });
    const g = gradeFinishWire(wire());
    expect(g.status).toBe("ok");
    if (g.status !== "ok") return;
    expect(g.result.objectives[1].done).toBe(false);
    expect(g.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
    expect(buildDebrief(g.lesson, g.result, {}).text).toContain(debriefLine(STOP.title));
    const forged = gradeFinishWire(wire({ kind: "haltVoided", reason: "outOfTheLane" }));
    expect(forged.status).toBe("ok");
    if (forged.status !== "ok") return;
    expect(forged.result.objectives[1].detail).toBeUndefined();
  }, 120_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §6 · the committed correct demos still tick, through the live chain
// ───────────────────────────────────────────────────────────────────────────

describe("§6 every committed correct demo of the three lessons still ticks its own-lane gate, on every rung, live", () => {
  for (const g of GATES) {
    it(`${g.spec.id} shadow-correct, L1–L5`, () => {
      const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, g.spec.shadow!.path), "utf-8")))!;
      const raw = loadDistrict(g.spec.map.districtId);
      const rows: string[] = [];
      for (const level of LEVELS) {
        const lesson = lessonOf(g.spec, level);
        const out = liveChainReplay({ lesson, districtRaw: raw, trace });
        const i = lesson.objectives.findIndex((o) => o.id === g.id);
        const row = out.result.objectives[i];
        rows.push(`L${level} ${row.done ? "done" : "OPEN"}${row.detail !== undefined ? ` ${JSON.stringify(row.detail)}` : ""}`);
      }
      expect(rows).toEqual(LEVELS.map((l) => `L${l} done`));
    }, 300_000);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §7 · the first halted rest of an approach is the graded act
// ───────────────────────────────────────────────────────────────────────────

interface TapeSample {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  steerRad: number;
  speedKmh: number;
  gear: number;
  indicator: string;
  brakeOn: boolean;
  throttleOn: boolean;
}

/**
 * A synthetic tape for the live chain: the lesson's own committed correct drive up to `keepBelowY`, then legs. `go`
 * drives in a straight line to a point with the speed changing evenly in v² (constant acceleration) to `kmh`; `stand`
 * holds still. 20 samples a second, like the verifier's tapes (the live chain steps its 1/60 s grid off them).
 */
class Tape {
  readonly samples: TapeSample[];
  private readonly meta: unknown;
  private t: number;
  private x: number;
  private y: number;
  private h: number;
  private v: number; // m/s, unsigned
  /** `from` (round 4): start from another committed drive of the lesson (a mistake demo), cut at its sample `upto`. */
  constructor(spec: ScenarioSpec, keepBelowY: number, from?: { path: string; upto: number }) {
    const shadow = JSON.parse(readFileSync(path.join(REPO_ROOT, from?.path ?? spec.shadow!.path), "utf-8"));
    this.meta = shadow.meta;
    this.samples = from
      ? (shadow.samples as TapeSample[]).slice(0, from.upto + 1)
      : (shadow.samples as TapeSample[]).filter((s) => s.y < keepBelowY);
    const last = this.samples[this.samples.length - 1];
    this.t = last.tSec;
    this.x = last.x;
    this.y = last.y;
    this.h = last.headingDeg;
    this.v = Math.abs(last.speedKmh) / 3.6;
  }
  private push(speedKmh: number, gear: number, brakeOn: boolean): void {
    this.t = +(this.t + 0.05).toFixed(4);
    this.samples.push({ tSec: this.t, x: this.x, y: this.y, headingDeg: this.h, steerRad: 0, speedKmh, gear, indicator: "off", brakeOn, throttleOn: !brakeOn && speedKmh !== 0 });
  }
  go(to: { x: number; y: number }, kmh: number, reverse = false): this {
    const x0 = this.x;
    const y0 = this.y;
    const d = Math.hypot(to.x - x0, to.y - y0);
    const v0 = this.v;
    const v1 = kmh / 3.6;
    const fwd = (Math.atan2(to.x - x0, to.y - y0) * 180) / Math.PI;
    this.h = reverse ? fwd + 180 : fwd;
    if (Math.abs(this.h) > 180) this.h -= 360 * Math.sign(this.h);
    let s = 0;
    while (s < d - 1e-9) {
      const vNow = Math.sqrt(Math.max(0, v0 * v0 + ((v1 * v1 - v0 * v0) * s) / d));
      s = Math.min(d, s + Math.max(vNow, 0.3) * 0.05);
      const v = Math.sqrt(Math.max(0, v0 * v0 + ((v1 * v1 - v0 * v0) * s) / d));
      this.x = x0 + ((to.x - x0) * s) / d;
      this.y = y0 + ((to.y - y0) * s) / d;
      this.push(+((reverse ? -1 : 1) * v * 3.6).toFixed(4), reverse ? -1 : 1, v1 < v0);
    }
    this.v = v1;
    return this;
  }
  /** Stand still; a stand straightens the recorded heading to the lane's (0) — the car came to rest straight. */
  stand(sec: number): this {
    this.v = 0;
    this.h = 0;
    for (let i = 0; i < Math.round(sec / 0.05); i++) this.push(0, 1, true);
    return this;
  }
  trace() {
    const meta = { ...(this.meta as object), durationSec: this.t };
    return parseScenarioTrace({ meta, samples: this.samples, events: [] })!;
  }
}

interface Played {
  /** Every frame of the gate's card: grid point, pose, speed. */
  cards: Array<{ k: number; x: number; y: number; v: number; explanationBg: string; peekBg: string }>;
  /** The grid point the gate ticked at, with the pose and speed of that tick; null = never. */
  tick: { k: number; x: number; y: number; h: number; v: number } | null;
  /** The struck twin's tick (the base's gate), same shape. */
  struckTick: { k: number; x: number; y: number; h: number; v: number } | null;
  done: boolean;
  detail: unknown;
  rowText: string | null;
  debrief: string;
  verdict: string;
  /** Round 4: every HUD title the tree printed, «k:kind:title», and the COLLISION bills of both runs. */
  hud: string[];
  collisions: number;
  struckCollisions: number;
  struckDetail: unknown;
}

/**
 * `crashAt` (round 4, L6): a STATIC contact the live chain does not model (liveChainReplay: «static world geometry …
 * is NOT modelled; the witnesses that care inject their own static contact explicitly and say so») — an unnamed
 * `staticObject` collision, the façade's report, pushed into the first grid point whose pose is within 0.3 m of it.
 */
function play(spec: ScenarioSpec, gateId: string, level: ScenarioLevel, tape: Tape, crashAt?: { x: number; y: number }): Played {
  const raw = loadDistrict(spec.map.districtId);
  const once = (struck: boolean) => {
    const lesson = lessonOf(spec, level, struck);
    const i = lesson.objectives.findIndex((o) => o.id === gateId);
    const cards: Played["cards"] = [];
    const hud: string[] = [];
    let tick: Played["tick"] = null;
    let crashed = false;
    const out = liveChainReplay({
      lesson,
      districtRaw: raw,
      trace: tape.trace(),
      beforeApply: (ctx) => {
        if (crashAt === undefined || crashed) return;
        if (Math.hypot(ctx.tick.position.x - crashAt.x, ctx.tick.position.y - crashAt.y) > 0.3) return;
        crashed = true;
        ctx.tick.events.push({ kind: "collision", withWhat: "staticObject" });
      },
      afterApply: (ctx) => {
        const k = Math.round(ctx.tick.t * 60);
        for (const h of ctx.step.hudEvents as Array<{ kind: string; titleBg?: string }>) hud.push(`${k}:${h.kind}:${h.titleBg ?? ""}`);
        for (const h of ctx.step.hudEvents as Array<{ titleBg?: string; explanationBg?: string; peekBg?: string }>) {
          if (h.titleBg === CARD_TITLE) {
            cards.push({ k, x: ctx.tick.position.x, y: ctx.tick.position.y, v: ctx.tick.speedKmh, explanationBg: h.explanationBg ?? "", peekBg: h.peekBg ?? "" });
          }
        }
        if (tick === null && ctx.step.state.objectives[i].completedAtSec != null) {
          tick = { k, x: ctx.tick.position.x, y: ctx.tick.position.y, h: ctx.tick.headingDeg, v: ctx.tick.speedKmh };
        }
      },
    });
    const row = out.result.objectives[i];
    return { out, cards, hud, tick: tick as Played["tick"], row };
  };
  const tree = once(false);
  const struck = once(true);
  return {
    cards: tree.cards,
    tick: tree.tick,
    struckTick: struck.tick,
    done: tree.row.done,
    detail: tree.row.detail ?? null,
    rowText: objectiveDetailText(tree.row.detail),
    debrief: tree.out.debrief,
    verdict: sessionVerdict(tree.out.result),
    hud: tree.hud,
    collisions: tree.out.violationCodes.filter((c) => c === "COLLISION").length,
    struckCollisions: struck.out.violationCodes.filter((c) => c === "COLLISION").length,
    struckDetail: struck.row.detail ?? null,
  };
}

const HZ = SC_HZ_BRAKE_DONT_SWERVE;
const HZ_GATE = "sc-hzbds-stop";
const HZ_TITLE = GATES[0].title;
/** Out of the lane at `outX` (the left: the escort's side; the right: past the carriageway edge), at rest at y 177. */
const outStop = (outX: number) => new Tape(HZ, 150).go({ x: outX, y: 165 }, 47).go({ x: outX, y: 177 }, 0).stand(3);
/** …then out of the 9 m ring backwards and in again, straight down the lane: a fresh approach. */
const backOutAndRealign = (t: Tape, outX: number) =>
  t.go({ x: outX, y: 173 }, 5, true).go({ x: outX, y: 170 }, 0, true).stand(1).go({ x: 2, y: 171 }, 5).go({ x: 4.06, y: 173 }, 5);

describe("§7 the first halted rest of an approach is the graded act (round 2)", () => {
  for (const level of [1, 3, 5] as ScenarioLevel[]) {
    for (const outX of [-0.6, 8.7]) {
      it(`L${level} out at x ${outX}, then a 3 km/h creep into the lane and a stop there: never ticked, one card, the row says why`, () => {
        const o = play(HZ, HZ_GATE, level, outStop(outX).go({ x: 4.06, y: 181.5 }, 3).stand(4));
        // The base ticked this creep (the verifier's return probe: on the lane line, moving at 3 km/h).
        expect(o.struckTick, "the struck twin ticks").not.toBeNull();
        expect(o.tick, "tree tick").toBeNull();
        expect(o.done).toBe(false);
        expect(o.cards.length, "one card").toBe(1);
        expect(Math.abs(o.cards[0].v), "the card is spoken on a halted frame").toBeLessThanOrEqual(1);
        expect(o.cards[0].explanationBg).toContain(`на ${Math.abs(o.cards[0].x - 4.06).toFixed(1)} м встрани от средата на своята лента и не беше изцяло в нея`);
        expect(o.detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
        expect(o.rowText).toBe(ROW);
        expect(o.debrief).toContain(debriefLine(HZ_TITLE));
        expect(o.verdict).not.toBe("passed");
      }, 300_000);
    }

    it(`L${level} out, then a second stop still out of the lane in the same approach: the card is spoken ONCE`, () => {
      const o = play(HZ, HZ_GATE, level, outStop(-0.6).go({ x: -0.6, y: 179 }, 3).go({ x: -0.6, y: 179.3 }, 0).stand(3));
      expect(o.tick).toBeNull();
      expect(o.cards.map((c) => Math.abs(c.v) <= 1)).toEqual([true]);
      expect(o.detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
    }, 300_000);

    it(`L${level} out, then out of the ring and a FRESH approach down the lane to a straight stop: ticked, halted, wholly in the lane; done with no reason`, () => {
      const o = play(HZ, HZ_GATE, level, backOutAndRealign(outStop(-0.6), -0.6).go({ x: 4.06, y: 176 }, 8).go({ x: 4.06, y: 181 }, 0).stand(3));
      expect(o.cards.length, "the first approach's card").toBe(1);
      expect(o.tick, "the fresh approach ticks").not.toBeNull();
      expect(Math.abs(o.tick!.v)).toBeLessThanOrEqual(1);
      expect(bodyReachM(o.tick!.x - 4.06, o.tick!.h)).toBeLessThanOrEqual(HALF_LANE);
      expect(o.tick!.k).toBeGreaterThan(o.cards[0].k);
      expect(o.done).toBe(true);
      expect(o.detail).toBeNull();
      expect(o.rowText).toBeNull();
      expect(o.debrief).not.toContain(debriefLine(HZ_TITLE));
    }, 300_000);

    it(`L${level} out, then out of the ring and a fresh approach that drives on without stopping: open, and the reason outlives the move`, () => {
      const o = play(
        HZ,
        HZ_GATE,
        level,
        backOutAndRealign(outStop(-0.6), -0.6)
          .go({ x: 10, y: 178 }, 20)
          .go({ x: 10, y: 200 }, 30)
          .go({ x: 4.06, y: 214 }, 30)
          .go({ x: 4.06, y: 260 }, 30),
      );
      expect(o.tick).toBeNull();
      expect(o.cards.length).toBe(1);
      expect(o.done).toBe(false);
      expect(o.detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
      expect(o.rowText).toBe(ROW);
    }, 300_000);
  }

  // THE WIDE DISC: sc-lnom-wait at L1 / L2 widens to r = 6 / 5 m, so the cap (6 km/h) is honoured on a moving frame
  // inside it — the frame the base ticked on. The tick and the card both wait for the car to stand.
  const LN = SC_LN_OBSTACLE_MEETING;
  const LN_GATE = "sc-lnom-wait";
  for (const level of [1, 2] as ScenarioLevel[]) {
    it(`L${level} sc-lnom-wait: a 4 km/h crawl IN the lane through the wide disc is not ticked until the car stands`, () => {
      const o = play(LN, LN_GATE, level, new Tape(LN, 105).go({ x: 4.06, y: 118 }, 4).go({ x: 4.06, y: 129.5 }, 4).go({ x: 4.06, y: 129.9 }, 0).stand(3));
      expect(o.struckTick, "the base ticked moving").not.toBeNull();
      expect(Math.abs(o.struckTick!.v)).toBeGreaterThan(1);
      expect(o.tick).not.toBeNull();
      expect(Math.abs(o.tick!.v), "the tree ticks halted").toBeLessThanOrEqual(1);
      expect(o.tick!.k).toBeGreaterThan(o.struckTick!.k);
      expect(o.cards).toEqual([]);
      expect(o.done).toBe(true);
    }, 300_000);

    it(`L${level} sc-lnom-wait: a 4 km/h crawl through the out-of-lane part of the wide disc gives no card until the car stands`, () => {
      const o = play(LN, LN_GATE, level, new Tape(LN, 105).go({ x: 0.46, y: 118 }, 4).go({ x: 0.46, y: 128 }, 4).go({ x: 0.46, y: 128.4 }, 0).stand(3));
      expect(o.struckTick, "the base ticked it").not.toBeNull();
      expect(o.tick).toBeNull();
      expect(o.cards.length).toBe(1);
      expect(Math.abs(o.cards[0].v), "spoken halted").toBeLessThanOrEqual(1);
      expect(o.cards[0].k, "not before the car stood").toBeGreaterThan(o.struckTick!.k);
      expect(o.detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
    }, 300_000);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §8 · round 3: the tick is AT THE MARK (L4); the first halted rest inside the approach ring is the graded act (L5);
//      a pass through the place without a stop is said (THEO-4)
// ───────────────────────────────────────────────────────────────────────────

/** The card the student is shown on the frame a pass through the place without a stop is decided (engine.ts). */
const PASS_TITLE = "Мина, без да спреш";
const PASS_BODY =
  "Колата мина през мястото на задачата, без да спре в него. Задачата иска пълно спиране там, затова това минаване не я отчита. Спирай напълно, преди да продължиш.";
const PASS_PEEK = "Спри напълно на мястото.";
const PASS_ROW = "Не се отчете: колата мина през мястото, без да спре — задачата е да спреш там.";
const passDebriefLine = (title: string) =>
  `Задачата «${title}» не се отчете: колата мина през мястото, без да спре — задачата е да спреш там. Спирай напълно, преди да продължиш.`;

/**
 * `standCtx` (round 4): context facts that hold on this leg's frames at ≤ 1 km/h only — the crash pin's own standstill
 * conjunct (lessons/engine.ts `restIsCrashPinned`: the pin, AND |v| ≤ FINISH_STANDSTILL_KMH 1).
 */
type Leg = { x: number; y: number; kmh: number; halt?: boolean; stand?: number; reverse?: boolean; standCtx?: Partial<ObjectiveContext> };
interface LegsRun {
  /** The first grid point the gate ticked at, with its pose; null = never. */
  tick: { k: number; x: number; y: number; h: number; v: number } | null;
  /** Every grid point the void ROSE on (a new approach's void counts again). */
  voids: Array<{ k: number; x: number; y: number; v: number; h: number; byCrash: boolean }>;
  /** Every grid point `lanePass` rose to «passed» on. */
  passes: Array<{ k: number; x: number; y: number; v: number }>;
  laneRestOffsetM: number | undefined;
  /** Round 5 (L11): the provenance the fold reads (`laneRestByCrash`) and the current approach's (`laneVoidedByCrash`). */
  laneRestByCrash: boolean;
  laneVoidedByCrash: boolean;
  lanePassedUnhalted: boolean;
}

/**
 * The pure evaluator, one tick per 1/60 s, along straight legs from `start` (heading 0 = +y). A leg drives to its
 * point at `kmh`; `halt` brakes to rest at 5 m/s² along the leg's heading and stands `stand` s (default 2).
 */
function legs(params: ReachZoneParams, start: { x: number; y: number }, plan: Leg[], ctx: Partial<ObjectiveContext> = {}): LegsRun {
  const dt = 1 / 60;
  let x = start.x;
  let y = start.y;
  let h = 0;
  let t = 0;
  let ev = createEvalState(params);
  const out: LegsRun = { tick: null, voids: [], passes: [], laneRestOffsetM: undefined, laneRestByCrash: false, laneVoidedByCrash: false, lanePassedUnhalted: false };
  let legCtx: Partial<ObjectiveContext> = {};
  const step = (v: number): boolean => {
    t += dt;
    const before = ev;
    const r = stepObjective(params, ev, makeTick({ t, position: { x, y }, speedKmh: v, headingDeg: h }), { stagedOutcomes: [], redsMetInRun: 0, ...ctx, ...(Math.abs(v) <= 1 ? legCtx : {}) });
    ev = r.evalState;
    const k = Math.round(t * 60);
    if (ev.type === "reachZone" && before.type === "reachZone") {
      if (ev.laneVoidedOffsetM !== undefined && before.laneVoidedOffsetM === undefined) out.voids.push({ k, x, y, v, h, byCrash: ev.laneVoidedByCrash === true });
      if (ev.lanePass === "passed" && before.lanePass !== "passed") out.passes.push({ k, x, y, v });
      out.laneRestOffsetM = ev.laneRestOffsetM;
      out.laneRestByCrash = ev.laneRestByCrash === true;
      out.laneVoidedByCrash = ev.laneVoidedByCrash === true;
      out.lanePassedUnhalted = ev.lanePassedUnhalted === true;
    }
    if (r.done) out.tick = { k, x, y, h, v };
    return r.done;
  };
  for (const L of plan) {
    legCtx = L.standCtx ?? {};
    const dx = L.x - x;
    const dy = L.y - y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-9) {
      h = (Math.atan2(L.reverse ? -dx : dx, L.reverse ? -dy : dy) * 180) / Math.PI;
      const n = Math.max(1, Math.ceil(d / ((L.kmh / 3.6) * dt)));
      for (let i = 0; i < n; i++) {
        x += dx / n;
        y += dy / n;
        if (step(L.reverse ? -L.kmh : L.kmh)) return out;
      }
    }
    if (L.halt) {
      let v = L.kmh / 3.6;
      const hr = (h * Math.PI) / 180;
      const sgn = L.reverse ? -1 : 1;
      while (v > 0) {
        v = Math.max(0, v - 5 * dt);
        x += sgn * Math.sin(hr) * v * dt;
        y += sgn * Math.cos(hr) * v * dt;
        if (step(sgn * v * 3.6)) return out;
      }
      for (let i = 0; i < 60 * (L.stand ?? 2); i++) if (step(0)) return out;
    }
  }
  return out;
}

/** The place, from the gate's own geometry, as an oracle for a lane along +y approached from −y (§0). */
const inPlace = (p: ReachZoneParams, x: number, y: number) => {
  const dx = x - p.x;
  const dy = y - p.y;
  if (Math.hypot(dx, dy) <= p.radiusM) return true;
  return Math.abs(dx) <= p.radiusM && dy <= 0 && dy >= -REACH_ZONE_GRACE_M - Math.sqrt(Math.max(0, p.radiusM ** 2 - dx * dx));
};

const LNOM = SC_LN_OBSTACLE_MEETING;

/**
 * sc-ln-obstacle-meeting through the live chain (the round-2 verifier's drive, rebuilt here): the committed correct
 * drive to its sample 230, a halt at y ≈ 119.5 (outside the L3 ring), a stand to t = 28 s, a roll at `kmh` through
 * the disc to (4.06, 129.95), the correct drive's own pull-out line to its sample 660, then its own path round the
 * parked row — with, when it is back in the own lane at its sample 1000, a halt and a 4 s stand (y ≈ 188.85, 27 m past
 * the row), then on along its own path. `reverseBack`: instead, after the roll, reverse into the disc and stand there.
 */
function lnomRollTape(kmh: number, reverseBack = false) {
  const sh = JSON.parse(readFileSync(path.join(REPO_ROOT, LNOM.shadow!.path), "utf-8"));
  const s: TapeSample[] = sh.samples;
  const dt = 0.05;
  const out: TapeSample[] = [];
  const mk = (t: number, x: number, y: number, v: number, brake: boolean, h = 0): TapeSample => ({
    tSec: +t.toFixed(4),
    x,
    y,
    headingDeg: h,
    steerRad: 0,
    speedKmh: +v.toFixed(4),
    gear: v < 0 ? -1 : 1,
    indicator: "off",
    brakeOn: brake,
    throttleOn: !brake && v !== 0,
  });
  for (let i = 0; i <= 230; i++) out.push(s[i]);
  let t = s[230].tSec;
  let y = s[230].y;
  let v = s[230].speedKmh / 3.6;
  const a = (v * v) / (2 * (119.5 - y));
  while (v > 0) {
    v = Math.max(0, v - a * dt);
    y += v * dt;
    t += dt;
    out.push(mk(t, 4.06, y, v * 3.6, true));
  }
  const standTo = Math.max(t + 2, 28);
  while (t < standTo) {
    t += dt;
    out.push(mk(t, 4.06, y, 0, true));
  }
  const vr = kmh / 3.6;
  while (v < vr) {
    v = Math.min(vr, v + 1.5 * dt);
    y += v * dt;
    t += dt;
    out.push(mk(t, 4.06, y, v * 3.6, false));
  }
  while (y < 129.95) {
    y = Math.min(129.95, y + v * dt);
    t += dt;
    out.push(mk(t, 4.06, y, v * 3.6, false));
  }
  if (reverseBack) {
    while (y < 136) {
      y += v * dt;
      t += dt;
      out.push(mk(t, 4.06, y, v * 3.6, false));
    }
    while (y > 129) {
      y -= vr * dt;
      t += dt;
      out.push(mk(t, 4.06, y, -kmh, false));
    }
    for (let i = 0; i < 80; i++) {
      t += dt;
      out.push(mk(t, 4.06, y, 0, true));
    }
    return parseScenarioTrace({ meta: { ...sh.meta, durationSec: t }, samples: out, events: [] })!;
  }
  let x = 4.06;
  const gx = s[660].x;
  const gy = s[660].y;
  const hd = (Math.atan2(gx - x, gy - y) * 180) / Math.PI;
  const n = Math.ceil(Math.hypot(gx - x, gy - y) / (vr * dt));
  const x0 = x;
  const y0 = y;
  for (let i = 1; i <= n; i++) {
    t += dt;
    x = x0 + ((gx - x0) * i) / n;
    y = y0 + ((gy - y0) * i) / n;
    out.push(mk(t, x, y, kmh, false, hd));
  }
  const shift = t + dt - s[661].tSec;
  for (let i = 661; i < s.length; i++) {
    out.push({ ...s[i], tSec: +(s[i].tSec + shift).toFixed(4) });
    if (i === 1000) {
      let tt = s[i].tSec + shift;
      let yy = s[i].y;
      let vv = s[i].speedKmh / 3.6;
      while (vv > 0) {
        vv = Math.max(0, vv - 5 * dt);
        yy += vv * dt;
        tt += dt;
        out.push(mk(tt, 4.06, yy, vv * 3.6, true));
      }
      const st = tt + 4;
      while (tt < st) {
        tt += dt;
        out.push(mk(tt, 4.06, yy, 0, true));
      }
      const ny = s[i + 1].y;
      while (yy < ny - 1e-6) {
        vv = Math.min(vv + 2 * dt, 10);
        yy = Math.min(ny, yy + vv * dt);
        tt += dt;
        out.push(mk(tt, 4.06, yy, vv * 3.6, false));
      }
      const ext = tt + dt - s[i + 1].tSec;
      for (let j = i + 1; j < s.length; j++) out.push({ ...s[j], tSec: +(s[j].tSec + ext).toFixed(4) });
      break;
    }
  }
  return parseScenarioTrace({ meta: { ...sh.meta, durationSec: out[out.length - 1].tSec }, samples: out, events: [] })!;
}

function playLnomRoll(level: ScenarioLevel, kmh: number, reverseBack = false) {
  const raw = loadDistrict(LNOM.map.districtId);
  const once = (struck: boolean) => {
    const lesson = lessonOf(LNOM, level, struck);
    const passCards: Array<{ k: number; x: number; y: number; v: number; explanationBg: string; peekBg: string }> = [];
    const laneCards: number[] = [];
    let tick: { k: number; x: number; y: number; h: number; v: number } | null = null;
    const out = liveChainReplay({
      lesson,
      districtRaw: raw,
      trace: lnomRollTape(kmh, reverseBack),
      afterApply: (ctx) => {
        const k = Math.round(ctx.tick.t * 60);
        for (const h of ctx.step.hudEvents as Array<{ titleBg?: string; explanationBg?: string; peekBg?: string }>) {
          if (h.titleBg === PASS_TITLE)
            passCards.push({ k, x: ctx.tick.position.x, y: ctx.tick.position.y, v: ctx.tick.speedKmh, explanationBg: h.explanationBg ?? "", peekBg: h.peekBg ?? "" });
          if (h.titleBg === CARD_TITLE) laneCards.push(k);
        }
        if (tick === null && ctx.step.state.objectives[0].completedAtSec != null)
          tick = { k, x: ctx.tick.position.x, y: ctx.tick.position.y, h: ctx.tick.headingDeg, v: ctx.tick.speedKmh };
      },
    });
    return { out, passCards, laneCards, tick: tick as { k: number; x: number; y: number; h: number; v: number } | null };
  };
  const tree = once(false);
  const struck = once(true);
  const row = tree.out.result.objectives[0];
  return {
    tick: tree.tick,
    struckTick: struck.tick,
    passCards: tree.passCards,
    laneCards: tree.laneCards,
    done: row.done,
    detail: row.detail ?? null,
    rowText: objectiveDetailText(row.detail),
    debrief: tree.out.debrief,
    verdict: sessionVerdict(tree.out.result),
    result: tree.out.result,
    events: tree.out.session.events,
  };
}

describe("§8a L4 — the tick is at the mark: a roll through the place without a stop, then a halt anywhere else, is not ticked", () => {
  for (const g of GATES) {
    it(`${g.id}, every rung: a ≤ cap crawl through the disc, then a halt in the lane 15 … 120 m on — no tick, the pass is said once; a halt back INSIDE the disc does tick`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const crawl = Math.min(p.maxSpeedKmh! - 0.5, 4);
        for (const D of [15, 30, 60, 120]) {
          const plan: Leg[] = [
            { x: p.x, y: p.y - p.radiusM - 3, kmh: 30 },
            { x: p.x, y: p.y + p.radiusM + 2, kmh: crawl },
            { x: p.x, y: p.y + D - 3, kmh: 25, halt: true },
          ];
          const r = legs(p, { x: p.x, y: p.y - 60 }, plan);
          const struck = legs(gateParams(g.spec, g.id, level, true), { x: p.x, y: p.y - 60 }, plan);
          const tag = `${g.id}@L${level} D${D}`;
          // The base ticked it, on a moving frame inside the disc.
          expect(struck.tick, `${tag} struck`).not.toBeNull();
          expect(Math.abs(struck.tick!.v)).toBeGreaterThan(1);
          expect(r.tick, `${tag} tree`).toBeNull();
          // What latched on the roll-through (`reached`, `capMet`, `approachCap`) cannot carry a tick out of the place;
          // the pass is decided on the first frame OUT of the place, past the mark, still moving.
          expect(r.passes.length, `${tag} one pass`).toBe(1);
          expect(inPlace(p, r.passes[0].x, r.passes[0].y), `${tag} pass out of the place`).toBe(false);
          expect(r.passes[0].y).toBeGreaterThan(p.y);
          expect(Math.abs(r.passes[0].v)).toBeGreaterThan(1);
          expect(r.voids).toEqual([]);
          expect(r.lanePassedUnhalted).toBe(true);
        }
        // …and coming back INTO the place (reversing) and standing there, body in the lane: ticked, at the mark.
        const back = legs(p, { x: p.x, y: p.y - 60 }, [
          { x: p.x, y: p.y - p.radiusM - 3, kmh: 30 },
          { x: p.x, y: p.y + p.radiusM + 2, kmh: crawl },
          { x: p.x, y: p.y - 1, kmh: 3, reverse: true, halt: true },
        ]);
        expect(back.tick, `${g.id}@L${level} back`).not.toBeNull();
        expect(Math.abs(back.tick!.v)).toBeLessThanOrEqual(1);
        expect(inPlace(p, back.tick!.x, back.tick!.y)).toBe(true);
      }
    });
  }

  it("sc-ln-obstacle-meeting live, L1–L5 at 3 and 5 km/h: an early wait, a roll through the disc, round the row, a halt 27 m past it — never «Спри в своята лента пред препятствието» past the place; the pass is said once; the row and the debrief say why", () => {
    for (const kmh of [3, 5])
      for (const level of LEVELS) {
        const o = playLnomRoll(level, kmh);
        const tag = `L${level} ${kmh} km/h`;
        if (level === 1) {
          // L1's capsule (r 6 + 5) reaches the early wait at y ≈ 119.5: the car is ticked there, halted, as the base was.
          expect(o.tick, tag).not.toBeNull();
          expect(Math.abs(o.tick!.v)).toBeLessThanOrEqual(1);
          expect(o.tick!.y).toBeLessThan(121);
          expect(o.struckTick!.k).toBe(o.tick!.k);
          continue;
        }
        expect(o.struckTick, `${tag} struck`).not.toBeNull();
        expect(o.struckTick!.y, `${tag} the base ticked inside the disc, moving`).toBeLessThan(130 + 4);
        expect(o.tick, `${tag} tree`).toBeNull();
        expect(o.passCards.length, `${tag} one pass card`).toBe(1);
        const c = o.passCards[0];
        expect(c.explanationBg).toBe(PASS_BODY);
        expect(c.peekBg).toBe(PASS_PEEK);
        expect(Math.abs(c.v), `${tag} spoken on the pass, moving`).toBeGreaterThan(1);
        expect(Math.hypot(c.x - 4.06, c.y - 130)).toBeGreaterThan(4 - 1e-6);
        expect(c.y).toBeLessThan(140);
        expect(o.laneCards).toEqual([]);
        expect(o.detail).toEqual({ kind: "haltVoided", reason: "passedUnhalted" });
        expect(o.rowText).toBe(PASS_ROW);
        expect(o.debrief).toContain(passDebriefLine(GATES[2].title));
        expect(o.verdict).not.toBe("passed");
      }
  }, 900_000);
});

describe("§8b L5 — the first halted rest inside the approach ring is the graded act", () => {
  for (const g of GATES) {
    it(`${g.id}, every rung: a wide swerve inside the ring (4.5 / 6 m off) and a stand, then a creep back to the mark — never ticked, one void on the swerve's halted frame`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        for (const side of [1, -1])
          for (const w of [4.5, 6]) {
            const plan: Leg[] = [
              { x: p.x, y: p.y - p.radiusM - 6, kmh: 30 },
              { x: p.x + side * w, y: p.y - p.radiusM + 1, kmh: 12, halt: true, stand: 2 },
              { x: p.x, y: p.y - 2, kmh: 3, halt: true },
            ];
            const r = legs(p, { x: p.x, y: p.y - 60 }, plan);
            const struck = legs(gateParams(g.spec, g.id, level, true), { x: p.x, y: p.y - 60 }, plan);
            const tag = `${g.id}@L${level} ${side * w}`;
            expect(struck.tick, `${tag} struck ticks the creep-back`).not.toBeNull();
            expect(r.tick, tag).toBeNull();
            expect(r.voids.length, `${tag} one void`).toBe(1);
            const v = r.voids[0];
            expect(Math.abs(v.v)).toBeLessThanOrEqual(1);
            expect(Math.hypot(v.x - p.x, v.y - p.y), `${tag} inside the ring`).toBeLessThanOrEqual(p.radiusM + REACH_ZONE_GRACE_M);
            expect(bodyReachM(v.x - p.x, v.h), `${tag} body out`).toBeGreaterThan(HALF_LANE);
            // The 6 m swerve's rest is outside the disc and the capsule: round 2 (an arrival-honouring rest) missed it.
            if (w >= 6) expect(inPlace(p, v.x, v.y), `${tag} outside the place`).toBe(false);
            expect(r.laneRestOffsetM).toBeCloseTo(Math.abs(v.x - p.x), 6);
            // …and if, instead of stopping at the mark, the car then rolls THROUGH the place within the cap and on past
            // the mark: the approach's stop was the swerve, which its own card explains — no pass is said on top.
            const through = legs(p, { x: p.x, y: p.y - 60 }, [
              ...plan.slice(0, 2),
              { x: p.x, y: p.y - 3, kmh: 3 },
              { x: p.x, y: p.y + p.radiusM + 3, kmh: 3 },
            ]);
            expect(through.voids.length, `${tag} through: one void`).toBe(1);
            expect(through.tick).toBeNull();
            expect(through.passes, `${tag} through: no pass on a voided approach`).toEqual([]);
          }
      }
    });

    it(`${g.id}, every rung: a halted rest IN the lane inside the ring but past the place voids nothing — reversing into the disc and standing there ticks`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        const r = legs(p, { x: p.x, y: p.y - 60 }, [
          { x: p.x, y: p.y - ring - 2, kmh: 30 },
          { x: p.x, y: p.y - p.radiusM - 2, kmh: 12 },
          { x: p.x, y: p.y + p.radiusM + 1, kmh: 8, halt: true, stand: 2 },
          { x: p.x, y: p.y, kmh: 3, reverse: true, halt: true },
        ]);
        expect(r.voids, `${g.id}@L${level}`).toEqual([]);
        expect(r.tick, `${g.id}@L${level}`).not.toBeNull();
        expect(inPlace(p, r.tick!.x, r.tick!.y)).toBe(true);
      }
    });

    it(`${g.id}, every rung: a halted rest out of the lane OUTSIDE the ring voids nothing (it is no rest of this approach)`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        const r = legs(p, { x: p.x + 6, y: p.y - 60 }, [
          { x: p.x + 6, y: p.y - ring - 3, kmh: 20, halt: true, stand: 2 },
          { x: p.x, y: p.y - ring - 1.5, kmh: 5 },
          { x: p.x, y: p.y - 1, kmh: 5, halt: true },
        ]);
        expect(r.voids, `${g.id}@L${level}`).toEqual([]);
        expect(r.tick, `${g.id}@L${level}`).not.toBeNull();
      }
    });
  }

  it("live, sc-hz-brake-dont-swerve L1/L3/L5: a swerve to x 10 inside the ring (outside the capsule), a stand, then a creep back to the mark — the struck twin ticks the creep-back, the tree does not; one card on the swerve's halted frame; the row says why", () => {
    for (const level of [1, 3, 5] as ScenarioLevel[]) {
      const o = play(
        HZ,
        HZ_GATE,
        level,
        new Tape(HZ, 150).go({ x: 4.06, y: 176 }, 30).go({ x: 10, y: 180 }, 0).stand(3).go({ x: 4.06, y: 182 }, 3).go({ x: 4.06, y: 182.3 }, 0).stand(3),
      );
      expect(o.struckTick, `L${level} struck`).not.toBeNull();
      expect(o.tick, `L${level} tree`).toBeNull();
      expect(o.cards.length).toBe(1);
      expect(Math.abs(o.cards[0].v)).toBeLessThanOrEqual(1);
      expect(o.cards[0].x).toBeGreaterThan(9);
      expect(o.cards[0].explanationBg).toContain(`на ${Math.abs(o.cards[0].x - 4.06).toFixed(1)} м встрани от средата на своята лента и не беше изцяло в нея`);
      expect(o.detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
      expect(o.rowText).toBe(ROW);
    }
  }, 600_000);
});

describe("§8c the pass card is said only for a pass", () => {
  for (const g of GATES.filter((x) => x.id !== "sc-lnom-wait")) {
    it(`${g.id}, every rung: a halt IN the place that is not yet a qualifying full stop, then rolling on through — not ticked, and never told it went through without stopping`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        expect(p.requireFullStop, `${g.id}@L${level} demands a full stop`).toBe(true);
        // The engine's full-stop clock has not qualified this standstill (ObjectiveContext.qualifyingStopCurrent false).
        const r = legs(
          p,
          { x: p.x, y: p.y - 60 },
          [
            { x: p.x, y: p.y - p.radiusM - 3, kmh: 30 },
            { x: p.x, y: p.y - 1, kmh: 4, halt: true, stand: 0.2 },
            { x: p.x, y: p.y + p.radiusM + 3, kmh: 4 },
          ],
          { qualifyingStopCurrent: false },
        );
        expect(r.tick, `${g.id}@L${level}`).toBeNull();
        expect(r.voids).toEqual([]);
        expect(r.passes, `${g.id}@L${level} it did stop in the place`).toEqual([]);
        expect(r.lanePassedUnhalted).toBe(false);
      }
    });
  }

  for (const g of GATES) {
    it(`${g.id}, every rung: over the cap through the disc — no pass (the cap has its own card); into the place at ≤ cap and backing out — no pass`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const fast = legs(p, { x: p.x, y: p.y - 60 }, [
          { x: p.x, y: p.y - p.radiusM - 3, kmh: 30 },
          { x: p.x, y: p.y + 40, kmh: 15 },
        ]);
        expect(fast.tick).toBeNull();
        expect(fast.passes, `${g.id}@L${level} fast`).toEqual([]);
        const backOut = legs(p, { x: p.x, y: p.y - 60 }, [
          { x: p.x, y: p.y - p.radiusM - 3, kmh: 30 },
          { x: p.x, y: p.y - 1, kmh: 4 },
          { x: p.x, y: p.y - 30, kmh: 4, reverse: true },
        ]);
        expect(backOut.passes, `${g.id}@L${level} back out`).toEqual([]);
        expect(backOut.lanePassedUnhalted).toBe(false);
        // A stop out of the lane (the void), out of the ring backwards, and a FRESH approach that rolls through the place
        // without a stop: the fresh approach clears the first one's state, so its pass is said.
        const fresh = legs(p, { x: p.x - 4.06, y: p.y - 60 }, [
          { x: p.x - 4.06, y: p.y - p.radiusM - 2, kmh: 30, halt: true, stand: 2 },
          { x: p.x - 4.06, y: p.y - p.radiusM - REACH_ZONE_GRACE_M - 6, kmh: 6, reverse: true, halt: true },
          { x: p.x, y: p.y - p.radiusM - REACH_ZONE_GRACE_M - 3, kmh: 6 },
          { x: p.x, y: p.y + p.radiusM + 3, kmh: Math.min(p.maxSpeedKmh! - 0.5, 4) },
        ]);
        expect(fresh.voids.length, `${g.id}@L${level} fresh: the first approach's void`).toBe(1);
        expect(fresh.tick).toBeNull();
        expect(fresh.passes.length, `${g.id}@L${level} fresh: the second approach's pass`).toBe(1);
      }
    });
  }

  it("live, sc-ln-obstacle-meeting L3: a roll through the disc, then reversing back into it and standing in the lane — the pass card was said once, the gate then ticks at the mark, and the row carries no reason", () => {
    const o = playLnomRoll(3, 3, true);
    expect(o.passCards.length).toBe(1);
    expect(o.tick).not.toBeNull();
    expect(Math.abs(o.tick!.v)).toBeLessThanOrEqual(1);
    expect(o.tick!.k).toBeGreaterThan(o.passCards[0].k);
    expect(o.done).toBe(true);
    expect(o.detail).toBeNull();
    expect(o.debrief).not.toContain(passDebriefLine(GATES[2].title));
  }, 300_000);

  it("the server's sheet: «passedUnhalted» survives the finish wire and its debrief line is the client's; a forged reason drops", () => {
    const o = playLnomRoll(3, 3);
    expect(o.detail).toEqual({ kind: "haltVoided", reason: "passedUnhalted" });
    const lesson = lessonOf(LNOM, 3);
    const wire = (detail?: unknown) => ({
      lessonId: lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(o.result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(o.events),
      objectives: o.result.objectives.map((ob, i) => ({
        id: ob.id,
        done: ob.done,
        completedAtSec: ob.completedAtSec,
        ...(i === 0 && detail !== undefined ? { detail } : ob.detail !== undefined ? { detail: ob.detail } : {}),
      })),
    });
    const g = gradeFinishWire(wire());
    expect(g.status).toBe("ok");
    if (g.status !== "ok") return;
    expect(g.result.objectives[0].detail).toEqual({ kind: "haltVoided", reason: "passedUnhalted" });
    expect(buildDebrief(g.lesson, g.result, {}).text).toContain(passDebriefLine(GATES[2].title));
    const forged = gradeFinishWire(wire({ kind: "haltVoided", reason: "passedUnstopped" }));
    expect(forged.status).toBe("ok");
    if (forged.status !== "ok") return;
    expect(forged.result.objectives[0].detail).toBeUndefined();
  }, 300_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §9 · round 5: a crash's rest voids the approach and the row names it (L11); the squeeze demo's rest is the student's (L7)
// ───────────────────────────────────────────────────────────────────────────

/** A committed demo of the lesson, through the live chain, as compiled (tree) and with the lane key struck (base). */
function playCommitted(spec: ScenarioSpec, gateId: string, level: ScenarioLevel, tracePath: string) {
  const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, tracePath), "utf-8")))!;
  const once = (struck: boolean) => {
    const lesson = lessonOf(spec, level, struck);
    const i = lesson.objectives.findIndex((o) => o.id === gateId);
    const hud: string[] = [];
    const cards: Array<{ k: number; x: number; y: number; v: number; explanationBg: string }> = [];
    const out = liveChainReplay({
      lesson,
      districtRaw: loadDistrict(spec.map.districtId),
      trace,
      afterApply: (ctx) => {
        const k = Math.round(ctx.tick.t * 60);
        for (const h of ctx.step.hudEvents as Array<{ kind: string; titleBg?: string; explanationBg?: string }>) {
          hud.push(`${k}:${h.kind}:${h.titleBg ?? ""}`);
          if (h.titleBg === CARD_TITLE) cards.push({ k, x: ctx.tick.position.x, y: ctx.tick.position.y, v: ctx.tick.speedKmh, explanationBg: h.explanationBg ?? "" });
        }
      },
    });
    return { out, hud, cards, row: out.result.objectives[i] };
  };
  return { trace, tree: once(false), struck: once(true) };
}

const mistakePath = (spec: ScenarioSpec, name: string) => spec.mistakes!.find((m) => m.traceRef?.path?.endsWith(`/${name}.trace.json`))!.traceRef!.path;
const LNOM_TITLE = GATES[2].title;

describe("§9 L11 — a crash's rest voids the approach, says nothing about the lane mid-drive, and the row says it was the crash", () => {
  for (const g of GATES) {
    it(`${g.id}, every rung: a halted rest out of the lane inside the ring that the crash pin holds voids the approach with the crash's provenance; a later unpinned rest on that approach changes neither; a return to the mark is not ticked`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        for (const side of [1, -1])
          for (const w of [4.5, 6]) {
            const tag = `${g.id}@L${level} ${side * w}`;
            const rest = { x: p.x + side * w, y: p.y - p.radiusM + 1 };
            expect(Math.hypot(rest.x - p.x, rest.y - p.y), `${tag} the rest is inside the ring`).toBeLessThanOrEqual(p.radiusM + REACH_ZONE_GRACE_M);
            expect(bodyReachM(rest.x - p.x), `${tag} the body is out of the lane`).toBeGreaterThan(HALF_LANE);
            const run = (pinned: boolean, after: Leg[] = [], gate = p) =>
              legs(gate, { x: p.x, y: p.y - 60 }, [
                { x: p.x, y: p.y - p.radiusM - 6, kmh: 30 },
                { ...rest, kmh: 12, halt: true, stand: 2, ...(pinned ? { standCtx: { restIsCrashPinned: true } } : {}) },
                ...after,
              ]);
            // The crash's rest: ONE void, on the halted frame, named the crash's — and the fold's fact with it.
            const pinned = run(true);
            expect(pinned.voids.length, `${tag} the crash's rest voids`).toBe(1);
            expect(pinned.voids[0].byCrash, `${tag} the void is the crash's`).toBe(true);
            expect(Math.abs(pinned.voids[0].v)).toBeLessThanOrEqual(1);
            expect(pinned.laneRestOffsetM, `${tag} fold fact: the rest's centre offset`).toBeCloseTo(Math.abs(pinned.voids[0].x - p.x), 6);
            expect(bodyReachM(pinned.voids[0].x - p.x, pinned.voids[0].h), `${tag} the void's rest is out of the lane`).toBeGreaterThan(HALF_LANE);
            expect(pinned.laneRestByCrash, `${tag} fold provenance`).toBe(true);
            // The same rest, the student's: the same void, named out-of-lane.
            const control = run(false);
            expect(control.voids.length, `${tag} the same rest, the student's`).toBe(1);
            expect(control.voids[0].byCrash, `${tag} control provenance`).toBe(false);
            expect(control.laneRestByCrash).toBe(false);
            // Driven out of the crash and halted out of the lane again inside the ring: the FIRST rest is the graded
            // act — no second void, and the provenance stays the crash's.
            const later = run(true, [{ x: rest.x, y: rest.y + 1.5, kmh: 3, halt: true, stand: 2 }]);
            expect(later.voids.length, `${tag} a later unpinned rest: no second void`).toBe(1);
            expect(later.laneVoidedByCrash, `${tag} carried provenance`).toBe(true);
            expect(later.laneRestByCrash, `${tag} the fold still names the crash`).toBe(true);
            // ROUND 4's RESIDUAL: the crash's rest, then a return into the lane and a halt at the mark on the same
            // approach — the struck twin ticks it; the tree does not.
            const back: Leg[] = [{ x: p.x, y: p.y - 1, kmh: 3, halt: true, stand: 2 }];
            const ret = run(true, back);
            expect(ret.tick, `${tag} no tick after the crash's rest`).toBeNull();
            expect(ret.voids.length).toBe(1);
            expect(run(true, back, gateParams(g.spec, g.id, level, true)).tick, `${tag} the struck twin ticks the return`).not.toBeNull();
          }
      }
    });
  }

  it("sc-ln-obstacle-meeting · mistake-pull-out @L1 (live): the head-on crash's rest lies inside the 11 m ring with the body out of the lane — no lane card, the «crashRest» row and debrief line; ticks, bill and every other card are the struck twin's", () => {
    const r = playCommitted(LNOM, "sc-lnom-wait", 1, mistakePath(LNOM, "mistake-pull-out"));
    const p = gateParams(LNOM, "sc-lnom-wait", 1);
    // The precondition, from the tape and the oracles: the car is billed a collision, then stands inside the ring with
    // its body out of its lane.
    expect(r.tree.out.violationCodes).toContain("COLLISION");
    const rests = r.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) <= 1 && Math.hypot(s.x - p.x, s.y - p.y) <= p.radiusM + REACH_ZONE_GRACE_M && bodyReachM(s.x - p.x, s.headingDeg) > HALF_LANE,
    );
    expect(rests.length, "a halted out-of-lane rest inside the ring").toBeGreaterThan(0);
    expect(r.tree.cards).toEqual([]);
    expect(r.tree.hud).toEqual(r.struck.hud);
    expect(r.tree.row.done).toBe(false);
    expect(r.struck.row.done).toBe(false);
    expect(r.struck.row.detail ?? null).toBeNull();
    expect(r.tree.row.detail).toEqual({ kind: "haltVoided", reason: "crashRest" });
    expect(objectiveDetailText(r.tree.row.detail!)).toBe(CRASH_ROW);
    expect(r.tree.out.debrief).toContain(crashDebriefLine(LNOM_TITLE));
    expect(r.tree.out.debrief).not.toContain(debriefLine(LNOM_TITLE));
    expect(r.tree.out.violationCodes).toEqual(r.struck.out.violationCodes);
    expect(r.tree.out.result.score).toBe(r.struck.out.result.score);
  }, 300_000);

  it("sc-hz-brake-dont-swerve / sc-hz-emergency-stop L1/L3/L5 (live, an injected static contact): a crash that leaves the car standing out of the lane inside the ring gives no lane card and the «crashRest» row; the same rest without the crash gives the card and «outOfLane»; a crash's rest, a return and a halt at the mark is not ticked", () => {
    for (const g of GATES.filter((x) => x.id !== "sc-lnom-wait"))
      for (const level of [1, 3, 5] as ScenarioLevel[]) {
        const p = gateParams(g.spec, g.id, level);
        const tag = `${g.id}@L${level}`;
        const rest = { x: p.x + 5.5, y: p.y - 4 };
        const mk = () => new Tape(g.spec, p.y - 25).go({ x: p.x, y: p.y - 12 }, 30).go(rest, 0).stand(5);
        const crash = play(g.spec, g.id, level, mk(), rest);
        expect(crash.collisions, `${tag} billed`).toBe(1);
        expect(crash.cards, tag).toEqual([]);
        expect(crash.detail, tag).toEqual({ kind: "haltVoided", reason: "crashRest" });
        expect(crash.rowText, tag).toBe(CRASH_ROW);
        expect(crash.debrief, tag).toContain(crashDebriefLine(g.title));
        expect(crash.tick, tag).toBeNull();
        const own = play(g.spec, g.id, level, mk());
        expect(own.collisions, `${tag} control`).toBe(0);
        expect(own.cards.length, `${tag} control card`).toBe(1);
        expect(own.detail, `${tag} control`).toEqual({ kind: "haltVoided", reason: "outOfLane" });
        // ROUND 4's measured residual («near»: the crash rest (x + 4.5, y − 2), a 3 km/h return of under 6 m, so the pin
        // still holds at the mark): round 4 ticked it at the mark; the struck twin ticks it too.
        const near = { x: p.x + 4.5, y: p.y - 2 };
        const ret = () =>
          new Tape(g.spec, p.y - 25).go({ x: p.x, y: p.y - 12 }, 30).go(near, 0).stand(3).go({ x: p.x, y: p.y - 1 }, 3).go({ x: p.x, y: p.y - 0.7 }, 0).stand(4);
        const back = play(g.spec, g.id, level, ret(), near);
        expect(back.collisions, `${tag} return: billed`).toBe(1);
        expect(back.tick, `${tag} return: no tick after the crash's rest`).toBeNull();
        expect(back.struckTick, `${tag} return: the struck twin ticks`).not.toBeNull();
        expect(back.cards, `${tag} return`).toEqual([]);
        expect(back.detail, `${tag} return`).toEqual({ kind: "haltVoided", reason: "crashRest" });
      }
  }, 900_000);

  it("sc-ln-obstacle-meeting @L1 (live): mistake-pull-out's head-on rest, then back into the lane and a halt at the mark on the same approach — not ticked; the row names the crash", () => {
    const pull = mistakePath(LNOM, "mistake-pull-out");
    const tape = new Tape(LNOM, 0, { path: pull, upto: 334 })
      .stand(3)
      .go({ x: -4.06, y: 131.5 }, 3, true)
      .go({ x: -4.06, y: 131.3 }, 0, true)
      .stand(1)
      .go({ x: 4.06, y: 127.5 }, 3)
      .go({ x: 4.06, y: 128.3 }, 0)
      .stand(4);
    const o = play(LNOM, "sc-lnom-wait", 1, tape);
    expect(o.collisions).toBeGreaterThan(0);
    expect(o.tick).toBeNull();
    expect(o.struckTick, "the struck twin ticks the return").not.toBeNull();
    expect(o.cards).toEqual([]);
    expect(o.detail).toEqual({ kind: "haltVoided", reason: "crashRest" });
    expect(o.rowText).toBe(CRASH_ROW);
  }, 300_000);

  it("the server's sheet: «crashRest» survives the finish wire and its debrief line is the client's; a forged reason drops", () => {
    const r = playCommitted(LNOM, "sc-lnom-wait", 1, mistakePath(LNOM, "mistake-pull-out"));
    const lesson = lessonOf(LNOM, 1);
    const i = lesson.objectives.findIndex((o) => o.id === "sc-lnom-wait");
    const res = r.tree.out.result;
    expect(res.objectives[i].detail).toEqual({ kind: "haltVoided", reason: "crashRest" });
    const wire = (detail?: unknown) => ({
      lessonId: lesson.id,
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(res.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(r.tree.out.session.events),
      objectives: res.objectives.map((ob, k) => ({
        id: ob.id,
        done: ob.done,
        completedAtSec: ob.completedAtSec,
        ...(k === i && detail !== undefined ? { detail } : ob.detail !== undefined ? { detail: ob.detail } : {}),
      })),
    });
    const g = gradeFinishWire(wire());
    expect(g.status).toBe("ok");
    if (g.status !== "ok") return;
    expect(g.result.objectives[i].detail).toEqual({ kind: "haltVoided", reason: "crashRest" });
    expect(buildDebrief(g.lesson, g.result, {}).text).toContain(crashDebriefLine(LNOM_TITLE));
    const forged = gradeFinishWire(wire({ kind: "haltVoided", reason: "crashed" }));
    expect(forged.status).toBe("ok");
    if (forged.status !== "ok") return;
    expect(forged.result.objectives[i].detail).toBeUndefined();
  }, 300_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §10 · round 5 (C1): a far-side re-entry is not a fresh approach
// ───────────────────────────────────────────────────────────────────────────

describe("§10 a voided approach driven out of the FAR side of the ring and back in keeps its void", () => {
  for (const g of GATES) {
    it(`${g.id}, every rung: out of the lane and halted inside the ring, out past the mark beyond the ring, back in from the far side and halted at the mark in the lane — still voided, not ticked; without the void the same far-side halt ticks`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        for (const side of [1, -1]) {
          const tag = `${g.id}@L${level} ${side}`;
          // Out of the ring past the mark, round, and back in from beyond it: the re-entry point lies on the far side
          // of the mark (+y), more than 90° from the latched approach (from −y) — the oracle `reachZoneApproachAxis`
          // reads, restated: no fresh approach.
          const farSide: Leg[] = [
            { x: p.x + side * 6, y: p.y + ring + 2, kmh: 8 },
            { x: p.x, y: p.y + ring + 2, kmh: 5 },
            { x: p.x, y: p.y + 1, kmh: 5, halt: true, stand: 2 },
          ];
          const voided = legs(p, { x: p.x, y: p.y - 60 }, [
            { x: p.x, y: p.y - p.radiusM - 6, kmh: 30 },
            { x: p.x + side * 6, y: p.y - p.radiusM + 1, kmh: 12, halt: true, stand: 2 },
            ...farSide,
          ]);
          expect(voided.voids.length, `${tag} one void, kept`).toBe(1);
          expect(voided.tick, `${tag} not ticked`).toBeNull();
          // The control: the same far-side return and halt, on an approach that never stood out of the lane.
          const clean = legs(p, { x: p.x, y: p.y - 60 }, [
            { x: p.x, y: p.y - p.radiusM - 6, kmh: 30 },
            { x: p.x + side * 6, y: p.y - p.radiusM + 1, kmh: 5 },
            ...farSide,
          ]);
          expect(clean.voids, `${tag} control: no void`).toEqual([]);
          expect(clean.tick, `${tag} control: the far-side halt ticks`).not.toBeNull();
        }
      }
    });
  }
});

describe("§9 L7 — sc-ln-obstacle-meeting · mistake-squeeze: the demo's car stands wholly in the oncoming lane — «Спря, но не изцяло в своята лента» is its own error, on every rung", () => {
  for (const level of LEVELS) {
    it(`L${level}: one lane card on the tape-end rest, the «outOfLane» row and debrief line; no tick on either twin; the bill unchanged`, () => {
      const r = playCommitted(LNOM, "sc-lnom-wait", level, mistakePath(LNOM, "mistake-squeeze"));
      const p = gateParams(LNOM, "sc-lnom-wait", level);
      const last = r.trace.samples[r.trace.samples.length - 1];
      // The story's pose: standing, the whole body over the line (the NEAR side clear of the lane), inside the ring.
      expect(Math.abs(last.speedKmh)).toBeLessThanOrEqual(1);
      expect(Math.abs(last.x - p.x) - HALF_W).toBeGreaterThan(HALF_LANE);
      expect(Math.hypot(last.x - p.x, last.y - p.y)).toBeLessThanOrEqual(p.radiusM + REACH_ZONE_GRACE_M);
      expect(r.tree.out.violationCodes).not.toContain("COLLISION");
      expect(r.tree.cards.length).toBe(1);
      expect(Math.abs(r.tree.cards[0].v)).toBeLessThanOrEqual(1);
      expect(r.tree.cards[0].explanationBg).toContain(`на ${Math.abs(r.tree.cards[0].x - p.x).toFixed(1)} м встрани от средата на своята лента и не беше изцяло в нея`);
      expect(r.tree.row.done).toBe(false);
      expect(r.struck.row.done).toBe(false);
      expect(r.tree.row.detail).toEqual({ kind: "haltVoided", reason: "outOfLane" });
      expect(r.tree.out.debrief).toContain(debriefLine(LNOM_TITLE));
      expect(r.tree.out.violationCodes).toEqual(r.struck.out.violationCodes);
      expect(r.tree.out.result.score).toBe(r.struck.out.result.score);
    }, 300_000);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §11 · pinned at integration (lanegate C1/C2): the provenance follows the LATEST void, and a fresh approach clears it
// ───────────────────────────────────────────────────────────────────────────
//
// The round-5 verifier's S1 tape: a crash's rest out of the lane inside the ring (approach 1, the crash pin holds it),
// reversed out of the ring, a FRESH approach, and the student's own unpinned halt out of the lane (approach 2). The
// graded rest the row speaks of is approach 2's — the student's stop, not the crash's — so the row is «outOfLane» and
// the lane card is spoken on approach 2. Two mutants of `objectives.ts stepReachZone` survived every round-5 test:
//  · X1 (C1) — the fold's provenance falls back to the PREVIOUS void's when this void is not the crash's
//    (`laneVoidedByCrash ?? st.laneRestByCrash`): the row says «колата спря след удар» about the student's own stop;
//  · X4 (C2) — a void raised on a fresh approach keeps the previous approach's provenance (`: st.laneVoidedByCrash`):
//    the student's out-of-lane stop is named the crash's, its lane card is withheld and the row reads «crashRest».

describe("§11 lanegate C1/C2 — after a crash's void, a fresh approach and the student's own out-of-lane halt: the row is «outOfLane»", () => {
  for (const g of GATES) {
    it(`${g.id}, every rung, both sides (pure S1): two voids — the crash's, then the student's — and the fold names the student's`, () => {
      for (const level of LEVELS) {
        const p = gateParams(g.spec, g.id, level);
        const ring = p.radiusM + REACH_ZONE_GRACE_M;
        for (const side of [1, -1]) {
          const tag = `${g.id}@L${level} ${side}`;
          const into: Leg = { x: p.x, y: p.y - ring - 6, kmh: 30 };
          const rest = (w: number, pinned: boolean): Leg => ({
            x: p.x + side * w,
            y: p.y - p.radiusM + 1,
            kmh: 12,
            halt: true,
            stand: 2,
            ...(pinned ? { standCtx: { restIsCrashPinned: true } } : {}),
          });
          const backOut: Leg[] = [
            { x: p.x + side * 6, y: p.y - ring - 4, kmh: 5, reverse: true },
            { x: p.x, y: p.y - ring - 10, kmh: 8 },
          ];
          // The oracle: both rests lie inside the ring with the body out of the lane.
          for (const w of [6, 4.5]) {
            expect(Math.hypot(side * w, -p.radiusM + 1), `${tag} rest ${w} inside the ring`).toBeLessThanOrEqual(ring);
            expect(bodyReachM(side * w), `${tag} rest ${w} out of the lane`).toBeGreaterThan(HALF_LANE);
          }
          const s1 = legs(p, { x: p.x, y: p.y - 60 }, [into, rest(6, true), ...backOut, rest(4.5, false)]);
          expect(s1.tick, `${tag} S1 not ticked`).toBeNull();
          expect(s1.voids.map((v) => v.byCrash), `${tag} S1 voids: the crash's, then the student's own (C2: a fresh approach clears the provenance)`).toEqual([true, false]);
          expect(s1.laneVoidedByCrash, `${tag} S1 approach 2's void is the student's (C2)`).toBe(false);
          expect(s1.laneRestByCrash, `${tag} S1 the fold names the LATEST void, the student's — «outOfLane» (C1)`).toBe(false);
          expect(s1.laneRestOffsetM, `${tag} S1 the fold's offset is approach 2's rest`).toBeCloseTo(Math.abs(s1.voids[1].x - p.x), 6);
          // The reverse order (S2): the student's void first, the crash's on the fresh approach — the latest is the crash's.
          const s2 = legs(p, { x: p.x, y: p.y - 60 }, [into, rest(4.5, false), ...backOut, rest(6, true)]);
          expect(s2.voids.map((v) => v.byCrash), `${tag} S2 voids`).toEqual([false, true]);
          expect(s2.laneRestByCrash, `${tag} S2 the fold names the latest void, the crash's`).toBe(true);
        }
      }
    });
  }

  it("sc-hz-brake-dont-swerve / sc-hz-emergency-stop L1/L3/L5 (live S1, an injected static contact on approach 1): one lane card, on approach 2's halt; the «outOfLane» row and debrief line, never the crash's", () => {
    for (const g of GATES.filter((x) => x.id !== "sc-lnom-wait"))
      for (const level of [1, 3, 5] as ScenarioLevel[])
        for (const side of [1, -1]) {
          const p = gateParams(g.spec, g.id, level);
          const ring = p.radiusM + REACH_ZONE_GRACE_M;
          const tag = `${g.id}@L${level} ${side}`;
          const crashRest = { x: p.x + side * 6, y: p.y - p.radiusM + 1 };
          // Approach 2's halt is on the OTHER side, 10.5 m from the impact — beyond CRASH_PIN_RADIUS_M (6 m), so the
          // crash pin cannot hold it: it is the student's own stop.
          const ownRest = { x: p.x - side * 4.5, y: p.y - p.radiusM + 1 };
          expect(Math.hypot(ownRest.x - crashRest.x, ownRest.y - crashRest.y), `${tag} unpinned by distance`).toBeGreaterThan(6);
          expect(bodyReachM(ownRest.x - p.x), `${tag} approach 2's rest is out of the lane`).toBeGreaterThan(HALF_LANE);
          const tape = new Tape(g.spec, p.y - 25)
            .go({ x: p.x, y: p.y - 12 }, 30)
            .go(crashRest, 0)
            .stand(2)
            .go({ x: p.x + side * 6, y: p.y - ring - 4 }, 5, true)
            .go({ x: p.x + side * 6, y: p.y - ring - 5 }, 0, true)
            .stand(1)
            .go({ x: p.x, y: p.y - ring - 3 }, 5)
            .go(ownRest, 0)
            .stand(3);
          const o = play(g.spec, g.id, level, tape, crashRest);
          expect(o.collisions, `${tag} the injected crash is billed once`).toBe(1);
          expect(o.tick, `${tag} not ticked`).toBeNull();
          expect(o.cards.length, `${tag} one lane card — approach 2's (C2)`).toBe(1);
          expect(Math.abs(o.cards[0].x - ownRest.x), `${tag} the card is on approach 2's rest`).toBeLessThan(0.5);
          expect(Math.abs(o.cards[0].v), `${tag} on a halted frame`).toBeLessThanOrEqual(1);
          expect(o.detail, `${tag} the row names the student's stop (C1)`).toEqual({ kind: "haltVoided", reason: "outOfLane" });
          expect(o.rowText, tag).toBe(ROW);
          expect(o.debrief, tag).toContain(debriefLine(g.title));
          expect(o.debrief, tag).not.toContain(crashDebriefLine(g.title));
        }
  }, 1_800_000);
});
