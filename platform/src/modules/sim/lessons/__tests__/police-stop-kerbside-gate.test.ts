/**
 * «ПЛЪТНО ВДЯСНО» IS MEASURED NOW — sc-vp-police-stop:ab262758.
 *
 * THE DRIVE THIS CLOSES, from the audit's own log
 * (`.audit-frames/sweep161/sc-vp-police-stop/mobile-right/audit.log`):
 *
 *   VERDICT: ИЗДЪРЖАН · SCORE: 0 наказателни точки · 3 от 3 звезди
 *   OBJECTIVES (2):
 *      ✓ Приближи полицая с контролирана скорост 1:30
 *      ✓ Спри плътно вдясно при полицая 2:28
 *
 * The gate was a disc, and a disc has one radius: at L1 it accepted 97 % of the
 * lane's WIDTH, so a car at rest on the lane centre — the pose instruction 4
 * names as the mistake («не насред платното») — collected the certificate for
 * the opposite act. `ReachZoneParams.requireKerbwardM` gives the gate the
 * second axis; this file is the proof that it moved the product and not only
 * the type.
 *
 * WHAT IS ASSERTED, and both directions matter equally — a demand that refuses
 * the correct drive is the founder's worse failure:
 *   §1 the compiled rung really carries the term (the params whitelist is a
 *      whitelist, and `requireRailClear` once shipped inert past it);
 *   §2 the SHADOW still passes, at every rung, through the production pipeline;
 *   §3 the mid-lane panic rest cannot earn the tick at ANY rung, including L1;
 *   §4 the evaluator itself refuses a car parked dead centre AT the mark and
 *      credits the same car once it has pulled over — the arm is re-earnable;
 *   §5 an unknown lane fix (off-network, or a tick with no `edgeId` at all)
 *      never refuses;
 *   §6 the authoring bound matches the locator's own clamp.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules/types";
import { LANE_WIDTH_M } from "../../runtime/spatial";
import { recordScVpPoliceStopDrive } from "../../traces/scVpPoliceStop";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  createEvalState,
  MAX_LANE_OFFSET_M,
  parseObjectiveParams,
  reachZoneStateRefusal,
  stepObjective,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_VP_POLICE_STOP } from "../scenario/templates-cockpit";
import type { ObjectiveContext } from "../objectives";
import type { ScenarioLevel } from "../scenario/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

/** ln-v1, northbound right lane (meta.scenario, pinned by value). */
const LANE_CENTRE_X = 12.19;
const STOP = { x: 13.9, y: 206 };
const AUTHORED_KERBWARD_M = 1.0;

function district(): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"),
  ) as unknown;
}

function stopGateParams(level: ScenarioLevel) {
  const lesson = compileScenario(SC_VP_POLICE_STOP, level);
  const gate = lesson.objectives.find((o) => o.id === "sc-vpps-stop")!;
  return parseObjectiveParams(gate);
}

/** Drive one authored trace through the compiled rung, exactly as S4 does. */
function driveAtLevel(name: "shadow-correct" | "mistake-panic-stop", level: ScenarioLevel) {
  const lesson = compileScenario(SC_VP_POLICE_STOP, level);
  let session = createLessonSession(lesson);
  recordScVpPoliceStopDrive(district(), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return result.objectives.find((o) => o.id === "sc-vpps-stop")!;
}

/**
 * A tick standing still at the halt mark, `laneOffsetM` LEFT of the lane
 * centre. `edgeId` is passed as a one-element tuple so „omit the field
 * entirely" ([]) and „the locator reported no fix" (`[null]`) are two distinct
 * inputs — a default parameter cannot express the first, which is exactly the
 * mistake that made this file's own first run green in the wrong direction.
 */
function atMark(laneOffsetM: number, edge: readonly [string | null] | readonly [] = ["ln-e-road"]): SimTick {
  const edgeId = edge.length === 1 ? edge[0] : undefined;
  return {
    t: 30,
    speedKmh: 0,
    maxSpeedKmh: 50,
    position: { x: LANE_CENTRE_X - laneOffsetM, y: STOP.y },
    headingDeg: 0,
    laneOffsetM,
    laneId: 0,
    laneCount: 2,
    ...(edgeId !== undefined ? { edgeId } : {}),
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
  } as unknown as SimTick;
}

/**
 * The drive up the right lane that COMPLETES `sc-vpps-approach` (x 12.19,
 * y 120, cap 55) and leaves `sc-vpps-stop` the active objective — without it
 * the chain never advances and every card assertion below would be vacuously
 * green, which is the false pass this programme has shipped four times.
 */
function approachRun(laneOffsetM: number): SimTick[] {
  const out: SimTick[] = [];
  const x = LANE_CENTRE_X - laneOffsetM;
  for (let i = 0; i <= 20; i += 1) {
    out.push({
      ...atMark(laneOffsetM),
      t: i,
      position: { x, y: 100 + i * 5 },
      speedKmh: 20,
    });
  }
  return out;
}

const CTX: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0, qualifyingStopCurrent: false };

describe("§1 the term survives the compile — it is on the params whitelist", () => {
  for (const level of [1, 2, 3, 4, 5] as const) {
    it(`L${level} carries requireKerbwardM ${AUTHORED_KERBWARD_M}, unwidened by the ladder`, () => {
      const p = stopGateParams(level) as { kind: string; radiusM: number; requireKerbwardM?: number };
      expect(p.kind).toBe("reachZone");
      // The RADIUS is laddered — that is this template's whole rung ladder and
      // it must stay laddered, or L1 ≡ L2 ≡ L3 (level-seam.test.ts S4).
      expect(p.radiusM).toBeGreaterThanOrEqual(3);
      // The LATERAL demand is not. Same number at «Пълна помощ» as at L5.
      expect(p.requireKerbwardM).toBe(AUTHORED_KERBWARD_M);
    });
  }

  it("L1 really is the widened disc the finding was measured on", () => {
    const p = stopGateParams(1) as { radiusM: number };
    expect(p.radiusM).toBeCloseTo(4.5, 5);
  });
});

describe("§2 the correct drive still passes — at every rung", () => {
  for (const level of [1, 3, 5] as const) {
    it(`L${level}: the shadow's kerb-side rest keeps its certificate`, () => {
      expect(driveAtLevel("shadow-correct", level).done).toBe(true);
    });
  }

  it("and it does so with real slack, not by a hair", () => {
    // The rest pose the shadow actually reaches, measured through the
    // production locator rather than asserted from the script's waypoint.
    const ticks: SimTick[] = [];
    recordScVpPoliceStopDrive(district(), "shadow-correct", {
      onTick: (t) => ticks.push({ ...t }),
    });
    const last = ticks[ticks.length - 1];
    expect(last.edgeId).toBe("ln-e-road");
    expect(last.laneOffsetM).toBeLessThan(-1.7);
    // 0.7 m of room under the demand: an imperfect but honest pull-over passes.
    expect(-last.laneOffsetM - AUTHORED_KERBWARD_M).toBeGreaterThan(0.6);
  });
});

describe("§3 the mid-lane rest the briefing forbids cannot earn it", () => {
  for (const level of [1, 3, 5] as const) {
    it(`L${level}: „Паника в лентата" leaves the stop gate unmet`, () => {
      expect(driveAtLevel("mistake-panic-stop", level).done).toBe(false);
    });
  }

  it("…and its rest really is on the lane centre, which is what makes §3 about THIS defect", () => {
    const ticks: SimTick[] = [];
    recordScVpPoliceStopDrive(district(), "mistake-panic-stop", {
      onTick: (t) => ticks.push({ ...t }),
    });
    const last = ticks[ticks.length - 1];
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    expect(Math.abs(last.laneOffsetM)).toBeLessThan(0.1);
  });
});

describe("§4 the evaluator arm itself: refused dead centre, earned once pulled over", () => {
  const params = stopGateParams(1);

  it("a car standing ON the mark but on the lane centre is not credited", () => {
    // Position is the mark's own y and a lane-centre x — the pose the L1 disc
    // accepted and the briefing forbids.
    let state = createEvalState(params);
    for (let i = 0; i < 5; i += 1) {
      state = stepObjective(params, state, atMark(0), CTX).evalState;
    }
    expect(stepObjective(params, state, atMark(0), CTX).done).toBe(false);
  });

  it("the SAME car, once it has eased right, is credited — the arm is re-earnable", () => {
    let state = createEvalState(params);
    for (let i = 0; i < 5; i += 1) {
      state = stepObjective(params, state, atMark(0), CTX).evalState;
    }
    expect(stepObjective(params, state, atMark(-1.71), CTX).done).toBe(true);
  });

  it("exactly at the boundary counts; a centimetre inside it does not", () => {
    const fresh = () => createEvalState(params);
    expect(stepObjective(params, fresh(), atMark(-AUTHORED_KERBWARD_M), CTX).done).toBe(true);
    expect(stepObjective(params, fresh(), atMark(-AUTHORED_KERBWARD_M + 0.01), CTX).done).toBe(
      false,
    );
  });
});

describe("§5 an unknown lane fix never refuses", () => {
  const params = stopGateParams(1);

  it("off the network (edgeId null, offset zeroed by the locator) is not a refusal", () => {
    expect(stepObjective(params, createEvalState(params), atMark(0, [null]), CTX).done).toBe(true);
  });

  it("a tick that carries no edgeId at all (fixtures, replays) is not a refusal", () => {
    expect(stepObjective(params, createEvalState(params), atMark(0, []), CTX).done).toBe(
      true,
    );
  });
});

describe("§6 the authoring bound is the locator's own clamp", () => {
  it("MAX_LANE_OFFSET_M is half a lane, the largest magnitude computeLane can emit", () => {
    expect(MAX_LANE_OFFSET_M).toBeCloseTo(LANE_WIDTH_M / 2, 6);
  });

  it("a demand wider than that is refused at the parse, not discovered by a student", () => {
    expect(() =>
      parseObjectiveParams({
        id: "probe",
        titleBg: "Спри плътно вдясно",
        kind: "reachZone",
        params: { x: 0, y: 0, radiusM: 3, maxSpeedKmh: 4, requireKerbwardM: MAX_LANE_OFFSET_M + 1 },
      }),
    ).toThrow(/requireKerbwardM/);
  });
});

describe("§7 the refusal is never silent (THEO-4, and the founder's B4 sentence)", () => {
  const params = stopGateParams(1);

  /** Every lesson toast raised while stepping this objective over `ticks`. */
  function coachCards(ticks: readonly SimTick[]): string[] {
    const lesson = compileScenario(SC_VP_POLICE_STOP, 1);
    let session = createLessonSession(lesson);
    const out: string[] = [];
    for (const t of ticks) {
      const step = applyTick(session, t);
      session = step.state;
      for (const e of step.hudEvents) {
        if (e.kind === "lesson") out.push(`${e.titleBg} :: ${e.explanationBg}`);
      }
    }
    return out;
  }

  it("the state card exists at all: a mid-lane rest is REPORTED, not merely refused", () => {
    // The refusal read the composer consumes, checked directly — the card
    // itself is composed in lessons/engine.ts and asserted through applyTick
    // below.
    expect(reachZoneStateRefusal(params, atMark(0))).toEqual({
      kind: "kerbward",
      demandM: AUTHORED_KERBWARD_M,
    });
    // …and a car that IS against the kerb produces no card to report.
    expect(reachZoneStateRefusal(params, atMark(-1.71))).toBeNull();
  });

  it("a car that crawls onto the mark mid-lane gets the «не плътно вдясно» card", () => {
    // Approach down the lane, then creep onto the mark on the lane centre and
    // stand there. `reached` latches at ≤ the 4 км/ч cap, so the state branch
    // is the one that speaks.
    const ticks: SimTick[] = approachRun(0);
    for (let i = 0; i < 6; i += 1) ticks.push({ ...atMark(0), t: 40 + i, speedKmh: 3 });
    const cards = coachCards(ticks);
    expect(cards.some((c) => c.includes("не плътно вдясно"))).toBe(true);
  });

  it("…and a car that arrives OVER the halt cap is told BOTH things in one card", () => {
    // The gap this closes: the cap card promises the tick for slowing down, and
    // on this gate that promise is false while the car is mid-lane. Obeying a
    // card and seeing nothing happen is the founder's own B4 complaint.
    const ticks: SimTick[] = approachRun(0);
    ticks.push({ ...atMark(0), t: 40, speedKmh: 18 });
    const cards = coachCards(ticks);
    const cap = cards.find((c) => c.includes("твърде бързо"));
    expect(cap, cards.join("\n")).toBeDefined();
    expect(cap).toContain("десния ѝ край");
  });

  it("a correct kerb-side arrival is told nothing at all", () => {
    const ticks: SimTick[] = approachRun(-1.71);
    for (let i = 0; i < 6; i += 1) ticks.push({ ...atMark(-1.71), t: 40 + i, speedKmh: 0 });
    expect(coachCards(ticks).filter((c) => c.includes("плътно вдясно"))).toEqual([]);
  });
});
