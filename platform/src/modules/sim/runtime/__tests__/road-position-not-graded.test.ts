/**
 * `SimTick.sM` AND `SimTick.distM` GRADE NOTHING — proved by EXECUTION.
 *
 * THE CONSTRAINT (founder RULING-2, 2026-09-22, docs/simulation/
 * 93_INSTRUMENT_GAPS.md; W59 steering spec §2.3 option A). The two numbers are
 * published so the audit harness's forward-steered leg knows WHERE ALONG the
 * edge the car is. They must not change what the product does to a student:
 * no rule, objective, card, score or teach moment may read them.
 *
 * THE METHOD mirrors `edge-alignment-not-graded.test.ts`, and for the reason
 * that file's header records: a grep refuses only the shape its author
 * imagined. So this drives the REAL runtime over the REAL district and folds
 * the tick stream through the REAL reducers —
 *
 *   · AS PUBLISHED
 *   · STRIPPED   — `sM` and `distM` deleted from every tick
 *   · CORRUPTED  — both lied about on every tick, THREE times: once BELOW and
 *                  once ABOVE the range the runtime can produce (so a threshold
 *                  anywhere inside that range is crossed by one of the two), and
 *                  once as NaN (every comparison false — which catches a reader
 *                  gated `x < X` with X above the real range, the one shape the
 *                  low lie cannot move by construction); an ABSENT field
 *                  (off-road) is ADDED in all three
 *
 * — and requires the results to be deep-equal. The rule engine is folded twice
 * per stream, at the shipped defaults and with EVERY opt-in detector armed
 * (`DETECTOR_OPT_IN_CODES`), because a reader inside a config-gated detector is
 * invisible to a fold that never arms it.
 *
 * THE MATERIAL IS THE PROOF — AND A COVERAGE CLAIM WITH NO ASSERTION IS HOW
 * THIS FILE WENT HOLLOW ONCE. Its first cut drove two-way / both banks /
 * off-road only, and an adversarial verifier then landed readers of these two
 * fields in CROSSED_SOLID_LINE, the seatbelt duty, STOPPED_WITHOUT_CAUSE, a
 * speeding re-grade and `stepParkInBay`, and every one stayed GREEN: no stream
 * crossed a solid осева, took the belt off, stood still, sped, or had a bay to
 * park in, so each sabotaged branch computed the same thing in all folds. The
 * streams below now drive each of those, and the `coverage` block ASSERTS, on
 * the published material, that every condition was really reached AND that the
 * detector really booked (or the objective really completed) — so the proof
 * cannot silently shrink back:
 *
 *   · a two-way road on BOTH banks, and against its geometry (sM falling);
 *   · a one-way ring driven against the flow — WRONG_WAY booked;
 *   · a car past the kerb (`edgeId: null`) and one off the network;
 *   · an authored М1 solid-осева span (`solidCenterLine: true`, district-v1
 *     `dv1-m1-ohridski`) crossed onto the oncoming half in forward gear —
 *     CROSSED_SOLID_LINE booked;
 *   · the same painted осева ridden from the own bank — CENTER_LINE_TOUCHED;
 *   · a painted lane divider straddled — POOR_LANE_KEEPING (and unpainted
 *     markings, `centreLinePainted/laneLinesPainted: false`, are in the
 *     material too, so both polarities of both paint flags occur);
 *   · 58 км/ч held in a 50 — SPEEDING_OVER_LIMIT and its re-grade;
 *   · the belt off while moving — SEATBELT_OFF_WHILE_MOVING;
 *   · a dead stop on an open through road — STOPPED_WITHOUT_CAUSE (armed
 *     config) and its re-grade;
 *   · a reverse into an authored bay and a hold — `parkInBay` evaluated inside
 *     the bay and COMPLETED;
 *   · and, through the lesson engine, real teach moments and a real THEO-3
 *     `mistakeMoment`.
 *
 * The precedent's material was checked for reuse first and arms none of the
 * new conditions: its five legs are wrong-way / past-the-kerb / off-network /
 * opposing-bank drives at a constant 25 км/ч with the belt on, no М1 span, no
 * stop and no bay. So the legs above are new, and each drives the REAL runtime.
 *
 * WHAT THIS DOES NOT COVER, said rather than implied: only detectors whose
 * condition one of the streams above reaches. A reader gated on a state no
 * stream enters (rain, night, a roundabout, a signal, a staged encounter, a
 * rail crossing, a motorway, a bus lane …) still produces identical folds.
 * The claim is „no reader on any of the paths listed above", not „no reader
 * anywhere".
 *
 * HOW THIS TEST FAILS. Make any rule, objective or teach path on those paths
 * read `tick.sM` or `tick.distM` in a way that changes an emitted event or one
 * byte of state, and at least one CORRUPTED fold (usually the STRIPPED one
 * too) diverges from the published fold.
 */
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { edgeById, edgeDrivePath, loadDistrict, mkVehicle, type PathPose } from "./helpers";
import { createRuleEngine, reduceTick, type RuleEngineState } from "../../rules/engine";
import { DETECTOR_OPT_IN_CODES } from "../../rules/detectorOptIns";
import type { RuleEngineConfig, SimTick } from "../../rules/types";
import { applyTick, createLessonSession } from "../../lessons/engine";
import type { LessonSpec, VehicleSample } from "../../contracts";

// ---------------------------------------------------------------------------
// the material
// ---------------------------------------------------------------------------

/** Two-way, used by edge-alignment.test.ts §4 for the opposing bank. */
const TWO_WAY = "e672186635.0";
/** Two-way, 4 lanes (2 a bank, 8.125 m each), limit 50, carrying district-v1's
 *  authored М1 span `dv1-m1-ohridski` over s ∈ [25, 102.1]. Lane centres of the
 *  own bank sit 4 m and 12 m right of the centreline, the divider at 8 m. */
const SOLID_M1 = "e718268829.0";
/** One-way, 2 painted lanes, limit 50, 388 m, no junction near s = 200 — the
 *  open through road the speed / belt / stop / park legs run on. */
const STREET = "e432951179.0";

interface Frame {
  pose: PathPose;
  v?: Partial<VehicleSample>;
}

/** Feed frames through a FRESH runtime, production call order, 20 Hz. */
function run(frames: readonly Frame[]): SimTick[] {
  const rt = createWorldRuntime(loadDistrict());
  const dt = 0.05;
  let t = 0;
  return frames.map((f) => {
    t += dt;
    rt.update(dt);
    return rt.sample(mkVehicle(f.pose, { speedKmh: 25, ...f.v }), t, false);
  });
}

function leg(edgeId: string, s0: number, s1: number, stepM: number, rightOffsetM: number, v?: Partial<VehicleSample>): Frame[] {
  return edgeDrivePath(edgeById(loadDistrict(), edgeId), s0, s1, stepM, rightOffsetM).map((pose) => ({ pose, v }));
}

function hold(at: Frame, n: number, v: Partial<VehicleSample>): Frame[] {
  return Array.from({ length: n }, () => ({ pose: at.pose, v }));
}

function offNetwork(frames: number): Frame[] {
  return Array.from({ length: frames }, (_, i) => ({ pose: { x: 2000 + i * 0.35, y: 2000, headingDeg: 45 } }));
}

/** The bay the park leg reverses into: STREET's own lane at s = 100, aligned
 *  with the flow. */
function bay(): { x: number; y: number; headingDeg: number; widthM: number; lengthM: number } {
  const [pose] = edgeDrivePath(edgeById(loadDistrict(), STREET), 100, 101, 1, 4);
  return { x: pose.x, y: pose.y, headingDeg: pose.headingDeg, widthM: 2.7, lengthM: 5 };
}

function parkFrames(): Frame[] {
  const approach = leg(STREET, 70, 110, 0.5, 4);
  const pause = hold(approach[approach.length - 1], 20, { speedKmh: 0 });
  // Backwards: the SAME poses as a forward 100 → 110 leg (heading still with
  // the flow), visited in reverse order, in R and moving.
  const back = leg(STREET, 100, 110, 0.1, 4, { gear: -1, speedKmh: -3 }).reverse();
  const settle = hold(back[back.length - 1], 80, { gear: -1, speedKmh: 0 });
  return [...approach, ...pause, ...back, ...settle];
}

function stopFrames(): Frame[] {
  const approach = leg(STREET, 150, 200, 0.5, 4);
  const stand = hold(approach[approach.length - 1], 300, { speedKmh: 0 });
  return [...approach, ...stand, ...leg(STREET, 200, 230, 0.5, 4)];
}

/** Separate streams, each folded from a fresh engine: concatenating drives
 *  restarts the session clock and a reducer handed time that runs backwards
 *  stops accruing (see the precedent file). The INDEX of each stream is used
 *  by the coverage block below, so append, never reorder. */
let streamCache: { name: string; ticks: SimTick[] }[] | null = null;
/** Built once per file: the folds never write to a tick (a reducer that did
 *  would already break the deep-equal below), so both describes share it. */
function streams(): { name: string; ticks: SimTick[] }[] {
  if (streamCache === null) streamCache = buildStreams();
  return streamCache;
}
function buildStreams(): { name: string; ticks: SimTick[] }[] {
  return [
    /* 0 */ { name: "two-way, own bank, with geometry", ticks: run(leg(TWO_WAY, 40, 160, 1, 1.6)) },
    /* 1 */ { name: "two-way, OPPOSING bank, with geometry", ticks: run(leg(TWO_WAY, 40, 160, 1, -1.6)) },
    /* 2 */ { name: "two-way, own bank, against geometry", ticks: run(leg(TWO_WAY, 160, 40, 1, 1.6)) },
    /* 3 */ { name: "ring, against the flow (wrongWay armed)", ticks: run(leg("e925166131.0", 29, 3, 0.25, 0)) },
    /* 4 */ { name: "street, past the kerb (edgeId null)", ticks: run(leg(STREET, 170, 340, 2, 25)) },
    /* 5 */ { name: "off the network", ticks: run(offNetwork(120)) },
    /* 6 */ { name: "М1 solid осева, CROSSED onto the oncoming half, forward gear", ticks: run(leg(SOLID_M1, 10, 115, 0.5, -3)) },
    /* 7 */ {
      name: "painted осева ridden from the own bank",
      ticks: run([...leg(SOLID_M1, 5, 20, 0.5, 4), ...leg(SOLID_M1, 20, 120, 0.4, 0.3)]),
    },
    /* 8 */ {
      name: "painted lane divider straddled",
      ticks: run([...leg(SOLID_M1, 5, 20, 0.5, 4), ...leg(SOLID_M1, 20, 120, 0.4, 8)]),
    },
    /* 9 */ { name: "58 км/ч held in a 50", ticks: run(leg(STREET, 20, 370, 1, 4, { speedKmh: 58 })) },
    /* 10 */ { name: "belt off while moving", ticks: run(leg(STREET, 20, 370, 1, 4, { seatbeltOn: false })) },
    /* 11 */ { name: "dead stop on an open through road", ticks: run(stopFrames()) },
    /* 12 */ { name: "reverse into the bay and hold", ticks: run(parkFrames()) },
  ];
}

function stripped(ticks: readonly SimTick[]): SimTick[] {
  return ticks.map((t) => {
    const copy = { ...t };
    delete copy.sM;
    delete copy.distM;
    return copy;
  });
}

/**
 * Every tick lies about both fields, THREE times — once BELOW and once ABOVE
 * any value a drive can produce (arclengths are ≥ 0 and edges are far shorter
 * than 1e5 m; a centreline distance is ≥ 0 and ≤ the 30 m lock ring), and once
 * as NaN. So a grader `x > X` or `x < X` with X anywhere inside the real range
 * flips on one of the first two, whichever side of X the true value sat; and a
 * grader whose comparison is TRUE on every real value — `x < 1e4`, `x >= 0` —
 * flips on NaN, which fails every comparison. The low lie cannot catch the
 * `x < X-above-the-range` shape by construction (−1e5 is below X too), and the
 * adversarial verifier's WRONG_WAY and lane-keeping readers were exactly that
 * shape: caught only by the high lie. NaN makes them red twice.
 *
 * A single one-sided lie is not enough: `distM > 1` survived a lie of
 * `1e4 + distM` in the first cut of this file (only STRIPPED caught it). An
 * ABSENT field (off-road) is ADDED on every side — the claim under test is that
 * no reader exists, and a reader of an impossible value diverges as loudly as
 * a reader of a true one.
 */
type Side = "low" | "high" | "nan";
const SIDES: Side[] = ["low", "high", "nan"];
function lie(v: number | undefined, side: Side): number {
  if (side === "nan") return Number.NaN;
  return side === "low" ? -1e5 - (v ?? 0) : 1e5 + (v ?? 0);
}
function corrupted(ticks: readonly SimTick[], side: Side): SimTick[] {
  return ticks.map((t) => ({ ...t, sM: lie(t.sM, side), distM: lie(t.distM, side) }));
}

// ---------------------------------------------------------------------------
// the rule engine
// ---------------------------------------------------------------------------

/** Every opt-in detector ON — the key set is read off the one table that says
 *  which keys arm a detector, so a new opt-in is armed here automatically. */
const ALL_ARMED: Partial<RuleEngineConfig> = Object.fromEntries(
  Object.keys(DETECTOR_OPT_IN_CODES).map((k) => [k, true]),
) as Partial<RuleEngineConfig>;
const CONFIGS: { name: string; config: Partial<RuleEngineConfig> | undefined }[] = [
  { name: "defaults", config: undefined },
  { name: "every opt-in armed", config: ALL_ARMED },
];

interface RuleFrame {
  events: unknown;
  state: RuleEngineState;
}

function foldRules(ticks: readonly SimTick[], config?: Partial<RuleEngineConfig>): RuleFrame[] {
  let state = createRuleEngine(config);
  const frames: RuleFrame[] = [];
  for (const tick of ticks) {
    const r = reduceTick(state, tick);
    state = r.state;
    frames.push({ events: r.events, state: r.state });
  }
  return frames;
}

function booked(frames: readonly RuleFrame[]): { code?: string; regrade?: boolean }[] {
  return frames
    .flatMap((f) => f.events as { kind: string; code?: string; regrade?: boolean }[])
    .filter((e) => e.kind === "violation");
}

function codesOf(ticks: readonly SimTick[], config?: Partial<RuleEngineConfig>): (string | undefined)[] {
  return booked(foldRules(ticks, config)).map((e) => e.code);
}

describe("nothing in the rule engine reads sM or distM", () => {
  const all = streams();
  const ticks = all.flatMap((s) => s.ticks);
  const twoWayOnRoad = ticks.filter((t) => t.oneway === false && t.edgeId != null);
  const LANE_MAX = 1.3 * 2.5; // DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM

  it("the material covers BOTH banks of a two-way road, and off-road, with the fields where they should be", () => {
    for (const s of all) expect(s.ticks.length, s.name).toBeGreaterThan(80);
    // Both banks, positively: `opposingBank` absent is NOT „own bank" on its
    // own, so the own-bank half is also required to be on a two-way edge.
    expect(twoWayOnRoad.some((t) => t.opposingBank === true && t.sM !== undefined)).toBe(true);
    expect(twoWayOnRoad.some((t) => t.opposingBank === undefined && t.sM !== undefined)).toBe(true);
    // One-way edges too.
    expect(ticks.some((t) => t.oneway === true && t.sM !== undefined)).toBe(true);
    // Off-road: both absent — past the kerb AND off the network.
    expect(ticks.some((t) => t.edgeId === null && t.sM === undefined && t.distM === undefined)).toBe(true);
    expect(all[4].ticks.some((t) => t.edgeId === null)).toBe(true);
    expect(all[5].ticks.every((t) => t.edgeId === null && !("sM" in t) && !("distM" in t))).toBe(true);
    // AGAINST ITS GEOMETRY, as the header claims: on stream 2 sM must FALL along the drive
    // (it runs the same edge from s 160 back to 40), and on stream 0 it must RISE — a
    // header condition with no assertion is how the first cut of this proof went hollow.
    const along = (i: number) => all[i].ticks.filter((t) => t.edgeId === TWO_WAY && t.sM !== undefined).map((t) => t.sM as number);
    const against = along(2);
    const withGeo = along(0);
    expect(against.length, "stream 2 never named the two-way edge").toBeGreaterThan(20);
    expect(against[against.length - 1], "sM did not fall on the against-geometry stream").toBeLessThan(against[0] - 50);
    expect(withGeo[withGeo.length - 1], "sM did not rise on the with-geometry stream").toBeGreaterThan(withGeo[0] + 50);
    // On-road: both present — and a real 0 would be carried, not dropped (the
    // runtime's own gate is `edgeId != null`, never truthiness of the value).
    expect(ticks.filter((t) => t.edgeId != null).every((t) => t.sM !== undefined && t.distM !== undefined)).toBe(
      true,
    );
  });

  // -- THE CONDITIONS THE VERIFIER'S SURVIVING READERS NEEDED ----------------
  // Each assertion names the published state a detector's condition requires
  // AND the booking that proves the fold reached it. Remove a stream, or let
  // the runtime stop producing its state, and the proof's reach shrinks — so
  // this block reds first.
  describe("coverage — every condition the proof claims is REACHED and BOOKED", () => {
    it("М1: solidCenterLine true on the oncoming half, forward gear, moving → CROSSED_SOLID_LINE", () => {
      expect(
        all[6].ticks.some(
          (t) =>
            t.solidCenterLine === true &&
            t.oneway === false &&
            t.opposingBank === true &&
            t.gear >= 0 &&
            t.speedKmh > 5 &&
            t.sM !== undefined,
        ),
      ).toBe(true);
      expect(codesOf(all[6].ticks)).toContain("CROSSED_SOLID_LINE");
    });

    it("painted осева (centreLinePainted not false) ridden from the own bank → CENTER_LINE_TOUCHED", () => {
      expect(
        all[7].ticks.some(
          (t) =>
            t.centreLinePainted !== false &&
            t.oneway === false &&
            t.opposingBank === undefined &&
            t.laneId === (t.laneCount ?? 1) - 1 &&
            t.laneOffsetM > LANE_MAX,
        ),
      ).toBe(true);
      expect(codesOf(all[7].ticks)).toContain("CENTER_LINE_TOUCHED");
    });

    it("painted lanes (laneLinesPainted not false) straddled → POOR_LANE_KEEPING; unpainted markings occur too", () => {
      expect(
        all[8].ticks.some((t) => t.edgeId != null && t.laneLinesPainted !== false && Math.abs(t.laneOffsetM) > LANE_MAX),
      ).toBe(true);
      expect(codesOf(all[8].ticks)).toContain("POOR_LANE_KEEPING");
      // Both polarities of both paint flags are in the material.
      expect(ticks.some((t) => t.centreLinePainted === false)).toBe(true);
      expect(ticks.some((t) => t.laneLinesPainted === false)).toBe(true);
      expect(ticks.some((t) => t.edgeId != null && t.centreLinePainted === undefined)).toBe(true);
      expect(ticks.some((t) => t.edgeId != null && t.laneLinesPainted === undefined)).toBe(true);
    });

    it("over the limit past the grace → SPEEDING_OVER_LIMIT, AND its re-grade", () => {
      expect(all[9].ticks.filter((t) => t.speedKmh > t.maxSpeedKmh + 5).length).toBeGreaterThan(200);
      const b = booked(foldRules(all[9].ticks)).filter((e) => e.code === "SPEEDING_OVER_LIMIT");
      expect(b.some((e) => e.regrade !== true)).toBe(true);
      expect(b.some((e) => e.regrade === true)).toBe(true);
    });

    it("seatbeltOn false while moving → SEATBELT_OFF_WHILE_MOVING", () => {
      expect(all[10].ticks.filter((t) => t.seatbeltOn === false && t.speedKmh > 5).length).toBeGreaterThan(200);
      expect(codesOf(all[10].ticks)).toContain("SEATBELT_OFF_WHILE_MOVING");
    });

    it("a stopped run of 15 s after moving off, forward gear, open road → STOPPED_WITHOUT_CAUSE (armed), AND its re-grade", () => {
      const s = all[11].ticks;
      const firstStop = s.findIndex((t) => t.speedKmh === 0);
      expect(firstStop).toBeGreaterThan(0);
      expect(s.slice(0, firstStop).some((t) => t.speedKmh > 5)).toBe(true);
      expect(s.slice(firstStop, firstStop + 300).every((t) => t.speedKmh === 0 && t.gear >= 0 && t.edgeId != null)).toBe(
        true,
      );
      const b = booked(foldRules(s, ALL_ARMED)).filter((e) => e.code === "STOPPED_WITHOUT_CAUSE");
      expect(b.some((e) => e.regrade !== true)).toBe(true);
      expect(b.some((e) => e.regrade === true)).toBe(true);
      // …and at the shipped defaults it is OFF — which is why the rules are
      // folded under both configs.
      expect(codesOf(s)).not.toContain("STOPPED_WITHOUT_CAUSE");
    });

    it("the armed ring books WRONG_WAY", () => {
      expect(codesOf(all[3].ticks)).toContain("WRONG_WAY");
    });
  });

  it("…and CORRUPTING really moves both fields on EVERY tick, on every side", () => {
    for (const s of all) {
      const low = corrupted(s.ticks, "low");
      const high = corrupted(s.ticks, "high");
      const nan = corrupted(s.ticks, "nan");
      // Every tick's lies sit strictly outside the range the runtime can
      // produce, on BOTH sides, plus NaN — asserted, not assumed.
      expect(
        s.ticks.every(
          (t, k) =>
            low[k].sM! < 0 &&
            low[k].distM! < 0 &&
            high[k].sM! > 1e4 &&
            high[k].distM! > 1e4 &&
            Number.isNaN(nan[k].sM) &&
            Number.isNaN(nan[k].distM),
        ),
        s.name,
      ).toBe(true);
      expect(s.ticks.every((t) => t.sM === undefined || (t.sM >= 0 && t.sM < 1e4)), s.name).toBe(true);
      expect(s.ticks.every((t) => t.distM === undefined || (t.distM >= 0 && t.distM <= 30)), s.name).toBe(true);
    }
  });

  for (const { name: cfgName, config } of CONFIGS) {
    it(`STRIPPING both fields changes not one event and not one byte of state (${cfgName})`, () => {
      for (const s of all) {
        expect({ run: s.name, frames: foldRules(stripped(s.ticks), config) }).toEqual({
          run: s.name,
          frames: foldRules(s.ticks, config),
        });
      }
    });

    for (const side of SIDES) {
      it(`CORRUPTING both fields (${side}) changes nothing either (${cfgName})`, () => {
        for (const s of all) {
          expect({ run: s.name, frames: foldRules(corrupted(s.ticks, side), config) }).toEqual({
            run: s.name,
            frames: foldRules(s.ticks, config),
          });
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// the lesson engine (objectives, teach moments, the advisor, the off-network
// clock — everything applyTick fans out to). NOT REACHED, named: the glance-ping
// hint (`observeGlancePingsTick`, lessons/advisor.ts) is driven by GlanceEdgePings.tsx,
// not by applyTick, so a reader there is outside both this proof and the not-in-hud
// proof — a student-facing hint, not a rule, objective, card, score or teach moment.
// ---------------------------------------------------------------------------

const BASE: Omit<LessonSpec, "id" | "objectives"> = {
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
};
const NEVER_REACHED = {
  id: "o-zone",
  titleBg: "Стигни зоната",
  kind: "reachZone",
  params: { x: 99999, y: 99999, radiusM: 10 },
} as const;

function lessons(): { name: string; spec: LessonSpec }[] {
  return [
    {
      // A graded session with every opt-in armed: first-encounter teach
      // moments, cards, the scorer.
      name: "graded, every opt-in armed",
      spec: {
        ...BASE,
        id: "t-road-position",
        ruleConfig: ALL_ARMED,
        objectives: [
          { id: "o-dist", titleBg: "Измини 20 метра", kind: "driveDistance", params: { meters: 20 } },
          NEVER_REACHED,
        ],
      },
    },
    {
      // The bay-locked objective — the evaluator a reader of `tick.sM` in
      // `stepParkInBay` would move.
      name: "parkInBay",
      spec: {
        ...BASE,
        id: "t-road-position-park",
        objectives: [
          {
            id: "o-park",
            titleBg: "Паркирай",
            kind: "completeManeuver",
            params: { maneuver: "parkInBay", holdSec: 1.5, bay: bay() },
          },
          NEVER_REACHED,
        ],
      },
    },
    {
      // THEO-3: the one-shot consequence moment.
      name: "mistakeExperience",
      spec: {
        ...BASE,
        id: "t-road-position-mistake",
        mistakeExperience: {
          mistakeIndex: 0,
          codes: ["SEATBELT_OFF_WHILE_MOVING", "CROSSED_SOLID_LINE", "SPEEDING_OVER_LIMIT", "WRONG_WAY"],
        },
        objectives: [
          { id: "o-dist", titleBg: "Измини 20 метра", kind: "driveDistance", params: { meters: 20 } },
          NEVER_REACHED,
        ],
      },
    },
  ];
}

interface LessonFrame {
  hudEvents: unknown[];
  teachMoments: unknown;
  mistakeMoment: unknown;
  state: ReturnType<typeof createLessonSession>;
}

function foldLesson(spec: LessonSpec, ticks: readonly SimTick[]): LessonFrame[] {
  let state = createLessonSession(spec);
  const frames: LessonFrame[] = [];
  for (const tick of ticks) {
    const r = applyTick(state, tick);
    state = r.state;
    frames.push({
      hudEvents: r.hudEvents,
      teachMoments: r.teachMoments,
      mistakeMoment: r.mistakeMoment,
      state: r.state,
    });
  }
  return frames;
}

describe("nothing in the lesson engine reads sM or distM", () => {
  const all = streams();
  const specs = lessons();

  describe("coverage — the lesson paths the proof claims are REACHED", () => {
    it("the folds produce HUD output and real teach moments", () => {
      const frames = all.flatMap((s) => foldLesson(specs[0].spec, s.ticks));
      expect(frames.flatMap((f) => f.hudEvents).length).toBeGreaterThan(0);
      expect(frames.some((f) => Array.isArray(f.teachMoments) && f.teachMoments.length > 0)).toBe(true);
    });

    it("the mistakeExperience session latches a real mistakeMoment", () => {
      const frames = all.flatMap((s) => foldLesson(specs[2].spec, s.ticks));
      expect(frames.some((f) => f.mistakeMoment !== undefined)).toBe(true);
    });

    it("parkInBay is evaluated INSIDE the bay and COMPLETES on the park leg", () => {
      const frames = foldLesson(specs[1].spec, all[12].ticks);
      const evalOf = (f: LessonFrame) => f.state.evalStates[0] as { type: string; inBay?: boolean };
      expect(frames.every((f) => evalOf(f).type === "parkInBay")).toBe(true);
      expect(frames.some((f) => evalOf(f).inBay === false)).toBe(true);
      expect(frames.some((f) => evalOf(f).inBay === true)).toBe(true);
      expect(frames[frames.length - 1].state.objectives[0].status).toBe("done");
      // …and the stream that carries it names an edge, so sM is on those ticks.
      expect(all[12].ticks.every((t) => t.sM !== undefined)).toBe(true);
    });
  });

  for (const { name: lessonName, spec } of specs) {
    it(`STRIPPING both fields changes not one card and not one byte of session state (${lessonName})`, () => {
      for (const s of all) {
        expect({ run: s.name, frames: foldLesson(spec, stripped(s.ticks)) }).toEqual({
          run: s.name,
          frames: foldLesson(spec, s.ticks),
        });
      }
    });

    for (const side of SIDES) {
      it(`CORRUPTING both fields (${side}) changes nothing either (${lessonName})`, () => {
        for (const s of all) {
          expect({ run: s.name, frames: foldLesson(spec, corrupted(s.ticks, side)) }).toEqual({
            run: s.name,
            frames: foldLesson(spec, s.ticks),
          });
        }
      });
    }
  }
});
