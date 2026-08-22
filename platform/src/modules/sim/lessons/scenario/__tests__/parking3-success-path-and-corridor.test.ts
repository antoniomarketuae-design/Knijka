/**
 * PARKING DEPTH — THE SUCCESS PATH, THE CORRIDOR, AND THE ORDER OF THE FIRST
 * STEP. Written against the STEERED, R-CAPABLE re-drive of 2026-08-22
 * (`.audit-frames/rebase/frames/sc-park-*__*-right/`, commit 70bcd1b), which
 * is the first evidence in this programme that could complete a reverse.
 *
 * THREE CLAIMS, AND EACH ONE IS THE ANSWER TO A DIFFERENT WRONG FIX.
 *
 * §1 — THE SUCCESS PATH EXISTS, AND IT IS THE PRODUCT'S OWN.
 * Nine open criticals on this file say some version of „the lesson has no
 * drivable success path" / „passing is impossible" / „0/4 on its own scripted
 * correct drive". Taken at face value they invite one fix: loosen the terminal
 * `parkInBay` until a drive that never parked completes it. The refutation is
 * not an argument, it is a replay: each drill's COMMITTED
 * `shadow-correct.trace.json` — the blue ghost the L1 student is shown, the
 * one `templates-parking3.ts` names in `spec.shadow` — is pushed through the
 * PRODUCTION objective chain, sequentially, exactly as `engine.ts` runs it:
 * `compileScenario(spec, level)` → `parseObjectiveParams` → `createEvalState`
 * → `stepObjective`, advancing to objective n+1 only when n reports done.
 * Both objectives complete on all ten drills at all five rungs. The evidence
 * therefore measures the DRIVER, and this file says so in a form that fails if
 * it ever stops being true.
 *
 * §2 — THE CORRIDOR IS THE DEFECT, and it is measured with the product's own
 * collision geometry (`obbSeparationM`, ego `CHASSIS_HALF_EXTENTS`) against
 * the bodies `parkDepthObstacles` actually arms — never a formula invented
 * here. Four of the ten seat the occupied row 2.1–2.5 m INSIDE the lane the
 * car spawns in. That is overlap, not tightness: no line a student can hold
 * through those lots exists, which is why five of the nine steered drives came
 * back «Удар в друго превозно средство −10 изпитни т.». The world half is
 * `gen_parking_lot.mjs`'s and is reported, not patched.
 *
 * §3 — THE ORDER IS THE HALF THIS FILE OWNS. `parking3-claim-gates` §3 already
 * requires a blocked drill to NAME the aisle position somewhere in its
 * briefing. „Somewhere" is the weak form: two of the four said it in step 2,
 * and this template file's own fold measurement records that a step 1 past ~96
 * characters leaves ZERO characters of the rest above the fold on the deployed
 * build. So on a NEGATIVE-clearance drill the lane change must be step 1 — of
 * the authored steps AND of the compiled briefing the shell renders — and it
 * must read as an ACT with its reason attached, not as a state and not as a
 * trailing clause. The set is re-derived from the districts every build; a
 * generator that pushes a row into a parallel drill's lane turns that drill's
 * briefing red rather than turning a student into a collision.
 *
 * §4 — AND THE ONE PROMISE THAT IS NOT A TICK IS ACTUALLY KEPT.
 * `sc-park-night`'s `objectiveBg` tells the student the lamps are not one of
 * the two tasks but a duty enforced as основна грешка. `parking3-claim-gates`
 * checks the compiled ENVIRONMENT and the COPY; nothing checked that the rule
 * engine convicts. A sentence promising a fault nobody bills is the same false
 * certificate as a title promising a tick nobody reads, so the engine is run
 * here — in both directions.
 *
 * WHAT THIS FILE MAY NEVER BECOME. Every assertion below was watched RED
 * before it was trusted: §1 by pinning the shadow's terminal hold below
 * `holdSec`, §2 by moving a district row, §3 by restoring each shipped step 1
 * verbatim (they are quoted in the counter-proof and must stay non-compliant),
 * §4 by lighting the lamps on the drive that must convict.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { obbSeparationM } from "../../../collision";
import { createRuleEngine, reduceTick } from "../../../rules/engine";
import type { SimTick } from "../../../rules/types";
import {
  PARK_DEPTH_DRILLS,
  parkDepthObstacles,
  type ParkDepthDrillId,
} from "../../../traces/scParkDepth";
import { parseScenarioTrace } from "../../../traces/parse";
import { CHASSIS_HALF_EXTENTS } from "../../../vehicle/tuning";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_PARKING3 } from "../templates-parking3";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const byId = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES_PARKING3.find((p) => p.id === id);
  if (!s) throw new Error(`no parking3 template ${id}`);
  return s;
};

interface RawDistrict {
  meta: {
    scenario: {
      bays: Array<{
        id: string;
        x: number;
        y: number;
        headingDeg: number;
        widthM: number;
        lengthM: number;
        occupied: boolean;
      }>;
    };
  };
  spawnPoints: Array<{ id: string; x: number; y: number; heading: number }>;
}

const districtCache = new Map<string, RawDistrict>();
function district(id: string): RawDistrict {
  let d = districtCache.get(id);
  if (!d) {
    d = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
    ) as RawDistrict;
    districtCache.set(id, d);
  }
  return d;
}

/** The committed shadow of one drill, parsed by the production parser. */
const traceCache = new Map<string, ReturnType<typeof parseScenarioTrace>>();
function shadow(spec: ScenarioSpec) {
  const p = spec.shadow?.path;
  if (!p) throw new Error(`${spec.id} ships no shadow`);
  let t = traceCache.get(p);
  if (!t) {
    t = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, p), "utf-8")));
    traceCache.set(p, t);
  }
  // `parseScenarioTrace` returns null on a trace it cannot read. Silently
  // skipping that would make every §1/§2 sweep below pass over a drill whose
  // shadow is unparseable — a green tick for a replay that never ran — so it
  // is an error here, not a `continue`.
  if (!t) throw new Error(`${spec.id}: its committed shadow ${p} did not parse`);
  return t;
}

/**
 * One trace sample as the tick the objective evaluators actually read. Only
 * the fields `stepReachZone` / `stepParkInBay` consult carry trace data; the
 * rest are the inert defaults a hand-built tick uses everywhere else in this
 * suite (`SimTick.edgeId` stays undefined — a recorded trace is not a live
 * locator sample and must stay innocent of the off-network fold).
 */
function tickOf(s: {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  gear: number;
  indicator?: string;
}): SimTick {
  return {
    t: s.tSec,
    speedKmh: s.speedKmh,
    position: { x: s.x, y: s.y },
    headingDeg: s.headingDeg,
    laneOffsetM: 0,
    laneId: 0,
    indicator: (s.indicator ?? "off") as SimTick["indicator"],
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: s.gear,
    isNight: false,
    events: [],
  } as unknown as SimTick;
}

// ---------------------------------------------------------------------------
// §1 — the drill's own reference drive completes the drill
// ---------------------------------------------------------------------------

/**
 * Replay `spec`'s committed shadow through the compiled objective chain at
 * `level`. Returns the tSec each objective completed at, `null` where it never
 * did — the same shape the debrief's tick column reports.
 */
function shadowObjectiveTimes(spec: ScenarioSpec, level: ScenarioLevel): (number | null)[] {
  const lesson = compileScenario(spec, level);
  const objectives = lesson.objectives.map((o) => parseObjectiveParams(o));
  const doneAt: (number | null)[] = objectives.map(() => null);
  let idx = 0;
  let state = createEvalState(objectives[0]);
  for (const s of shadow(spec).samples) {
    if (idx >= objectives.length) break;
    const r = stepObjective(objectives[idx], state, tickOf(s));
    state = r.evalState;
    if (r.done) {
      doneAt[idx] = s.tSec;
      idx += 1;
      if (idx < objectives.length) state = createEvalState(objectives[idx]);
    }
  }
  return doneAt;
}

describe("§1 — every drill's own reference correct drive completes it, at every rung", () => {
  it("both objectives tick on all ten, L1..L5, through the production evaluator", () => {
    const unfinished: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      for (const rung of spec.levels) {
        const times = shadowObjectiveTimes(spec, rung.level);
        const lesson = compileScenario(spec, rung.level);
        times.forEach((t, i) => {
          if (t === null) unfinished.push(`${spec.id}@L${rung.level}/${lesson.objectives[i].id}`);
        });
      }
    }
    expect(
      unfinished,
      "the shadow the student is told to copy does not satisfy the lesson it demonstrates: " +
        unfinished.join(", "),
    ).toEqual([]);
  });

  it("and it finishes well inside the par time the rubric prints", () => {
    const overPar: string[] = [];
    let measured = 0;
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      const par = spec.rubric?.parTimeSec;
      if (par === undefined) continue;
      for (const rung of spec.levels) {
        measured += 1;
        const times = shadowObjectiveTimes(spec, rung.level);
        const last = times[times.length - 1];
        if (last === null || last > par) {
          overPar.push(last === null ? `${spec.id}@L${rung.level} never finished` : `${spec.id}@L${rung.level} ${last.toFixed(1)}s > ${par}s`);
        }
      }
    }
    // A `continue` on a missing `parTimeSec` is how this sweep quietly becomes
    // a sweep over nothing: delete the rubric line and every drill skips, and
    // an empty `overPar` reads exactly like ten clean drills. Ten drills × five
    // rungs is the corpus, and it is asserted rather than assumed.
    expect(measured, "the par-time sweep measured fewer rungs than the file authors").toBe(
      SCENARIO_TEMPLATES_PARKING3.reduce((n, s) => n + s.levels.length, 0),
    );
    expect(overPar, overPar.join(", ")).toEqual([]);
  });

  it("POSITIVE CONTROL: the replay is a real gate — a shadow one tick short of holdSec fails it", () => {
    // The evaluator's terminal condition is `heldFor >= holdSec` at rest INSIDE
    // the bay. Truncate the reference drive just before that clock is paid and
    // the same code path that passes above must refuse — otherwise §1 is
    // certifying arrival, which is precisely the class of defect this file's
    // template header calls „a green tick for a skill it never measured".
    const spec = byId("sc-park-van");
    const lesson = compileScenario(spec, 3);
    const objectives = lesson.objectives.map((o) => parseObjectiveParams(o));
    const terminal = objectives[objectives.length - 1];
    if (terminal.kind !== "completeManeuver" || terminal.maneuver !== "parkInBay") {
      throw new Error("sc-park-van no longer ends on a parkInBay");
    }
    const samples = shadow(spec).samples;
    const full = shadowObjectiveTimes(spec, 3);
    expect(full[full.length - 1]).not.toBeNull();

    // Same replay, stopped `holdSec` short of the end of the recording.
    const cutoff = samples[samples.length - 1].tSec - terminal.holdSec;
    let idx = 0;
    let state = createEvalState(objectives[0]);
    let completed = 0;
    for (const s of samples) {
      if (s.tSec > cutoff) break;
      if (idx >= objectives.length) break;
      const r = stepObjective(objectives[idx], state, tickOf(s));
      state = r.evalState;
      if (r.done) {
        completed += 1;
        idx += 1;
        if (idx < objectives.length) state = createEvalState(objectives[idx]);
      }
    }
    expect(completed, "the terminal park completed without paying its hold clock").toBe(
      objectives.length - 1,
    );
  });
});

// ---------------------------------------------------------------------------
// §2 — the corridor, in the product's own collision geometry
// ---------------------------------------------------------------------------

/**
 * Signed clearance, metres, between the student's car HOLDING THE LANE IT
 * SPAWNS IN and the nearest armed body anywhere in the lot. Negative = the
 * lane and a parked body overlap by that depth, i.e. the line cannot be driven
 * at all. Swept at 0.1 m over the whole aisle (the lots run y ∈ [−30, +41]).
 */
function spawnLaneClearanceM(spec: ScenarioSpec): { m: number; atY: number } {
  const drillId = spec.id as ParkDepthDrillId;
  const raw = district(spec.map.districtId);
  const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId);
  if (!spawn) throw new Error(`${spec.id}: spawn point ${spec.start.spawnPointId} is not in its own district`);
  const obstacles = parkDepthObstacles(raw, drillId);
  let best = Infinity;
  let atY = 0;
  for (let y = -30; y <= 41; y += 0.1) {
    const ego = {
      x: spawn.x,
      y,
      headingDeg: spawn.heading,
      halfWidthM: CHASSIS_HALF_EXTENTS.x,
      halfLengthM: CHASSIS_HALF_EXTENTS.z,
    };
    for (const o of obstacles) {
      const sep = obbSeparationM(ego, {
        x: o.x,
        y: o.y,
        headingDeg: o.headingDeg,
        halfWidthM: o.halfWidthM,
        halfLengthM: o.halfLengthM,
      });
      if (sep < best) {
        best = sep;
        atY = y;
      }
    }
  }
  return { m: best, atY };
}

/** The drills whose spawn lane a parked body of their own lot stands inside. */
function blockedDrillIds(): string[] {
  return SCENARIO_TEMPLATES_PARKING3.filter((s) => spawnLaneClearanceM(s).m < 0)
    .map((s) => s.id)
    .sort();
}

describe("§2 — the lane the car spawns in, measured against the bodies that are armed", () => {
  it("four of the ten OVERLAP their own parked row — the collision is unavoidable there", () => {
    expect(blockedDrillIds()).toEqual(
      ["sc-park-45-rev", "sc-park-double", "sc-park-van", "sc-park-wall"].sort(),
    );
    // Overlap depth, not proximity — the numbers the template header quotes,
    // swept at 0.1 m from the district's OWN committed spawn point (x = 4.06,
    // not the 4.0625 lane-centre ideal: the car is placed where the JSON says).
    const depth = (id: string) => spawnLaneClearanceM(byId(id)).m;
    expect(depth("sc-park-van")).toBeCloseTo(-2.53, 2); // the kargo_v, 2.65 m half-length
    expect(depth("sc-park-45-rev")).toBeCloseTo(-2.34, 2);
    expect(depth("sc-park-wall")).toBeCloseTo(-2.22, 2); // the garage wall; its ROW blocks by 2.13
    expect(depth("sc-park-double")).toBeCloseTo(-2.13, 2);
    // Every one of the four is deeper than two metres INSIDE a body — this is
    // not a tolerance that could be driven carefully, it is a wall.
    for (const id of blockedDrillIds()) expect(spawnLaneClearanceM(byId(id)).m, id).toBeLessThan(-2);
  });

  it("and the parallel rows leave 0.470 m, which is thin enough to be worth a number", () => {
    for (const id of [
      "sc-park-gap-short",
      "sc-park-gap-long",
      "sc-park-zebra",
      "sc-park-night",
      "sc-park-judge",
    ]) {
      expect(spawnLaneClearanceM(byId(id)).m, id).toBeCloseTo(0.47, 3);
    }
    // sc-park-left's row is on the WEST kerb: its spawn lane is genuinely free,
    // and that is why its steered leg is the one that billed no collision.
    expect(spawnLaneClearanceM(byId("sc-park-left")).m).toBeGreaterThan(5);
  });

  it("COUNTER-PROOF: the recorded shadow clears every armed body on all ten", () => {
    // §2 must not be a rule that says „this lot is undrivable". The reference
    // drive is the existence proof that a line through each lot exists — it
    // simply is not the spawn lane. Anything at or below zero here would mean
    // the ghost itself drives through a car, which is a different and worse
    // finding than the one this file reports.
    const touching: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      const drillId = spec.id as ParkDepthDrillId;
      const obstacles = parkDepthObstacles(district(spec.map.districtId), drillId);
      let worst = Infinity;
      for (const s of shadow(spec).samples) {
        const ego = {
          x: s.x,
          y: s.y,
          headingDeg: s.headingDeg,
          halfWidthM: CHASSIS_HALF_EXTENTS.x,
          halfLengthM: CHASSIS_HALF_EXTENTS.z,
        };
        for (const o of obstacles) {
          const sep = obbSeparationM(ego, {
            x: o.x,
            y: o.y,
            headingDeg: o.headingDeg,
            halfWidthM: o.halfWidthM,
            halfLengthM: o.halfLengthM,
          });
          if (sep < worst) worst = sep;
        }
      }
      if (worst <= 0) touching.push(`${spec.id} ${worst.toFixed(3)}m`);
    }
    expect(touching, `the demonstrated correct drive is inside a body: ${touching.join(", ")}`).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// §3 — on a blocked drill the lane change is the FIRST thing asked for
// ---------------------------------------------------------------------------

/** „Get into the middle of the aisle" — the act, in the wordings this family uses. */
const AISLE_POSITION_ACT = /средата на алеята|по средата на алеята/iu;
/** The imperative that makes it an ACT and not a state („дръж…", „около…"). */
const AISLE_MOVE_VERB = /^Излез[ ,]/u;
/** The reason it must carry: the row is in the lane you are on. */
const AISLE_REASON = /лента|лентите|стърчат|стои в|стоят в/iu;

describe("§3 — the act that prevents the collision is briefing step 1, not step 2", () => {
  it("every blocked drill leads with it, and states it as an act with a reason", () => {
    const wrong: string[] = [];
    for (const id of blockedDrillIds()) {
      const spec = byId(id);
      const first = spec.instructionsBg[0];
      if (!AISLE_POSITION_ACT.test(first.textBg)) {
        wrong.push(`${id}: step 1 does not name the aisle position — „${first.textBg}"`);
        continue;
      }
      if (!AISLE_MOVE_VERB.test(first.textBg)) {
        wrong.push(`${id}: step 1 names the aisle as a STATE, not as a move — „${first.textBg}"`);
      }
      if (!AISLE_REASON.test(first.textBg)) {
        wrong.push(`${id}: step 1 gives the act without its reason (THEO-4) — „${first.textBg}"`);
      }
    }
    expect(
      wrong,
      "a drill whose spawn lane is inside its own parked row asks for something else first:\n  " +
        wrong.join("\n  "),
    ).toEqual([]);
  });

  it("…and it survives compilation at every rung — the complication may precede it, nothing else may", () => {
    const wrong: string[] = [];
    for (const id of blockedDrillIds()) {
      const spec = byId(id);
      for (const rung of spec.levels) {
        const briefing = compileScenario(spec, rung.level).briefingBg ?? [];
        // `compileScenario` puts a rung's complication at briefingBg[0] and
        // renumbers the drill's own steps behind it. That one line is allowed
        // in front; the drill's FIRST OWN step must still be the lane change.
        const ownSteps = briefing.filter(
          (s) => !/^Ниво \d+ — /u.test(s.textBg),
        );
        if (ownSteps.length === 0 || !AISLE_POSITION_ACT.test(ownSteps[0].textBg)) {
          wrong.push(`${id}@L${rung.level}: „${ownSteps[0]?.textBg ?? "(no steps)"}"`);
        }
      }
    }
    expect(wrong, wrong.join("\n  ")).toEqual([]);
  });

  it("the briefing budget is kept: no step in this family exceeds 95 characters", () => {
    const over: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      spec.instructionsBg.forEach((s) => {
        if (s.textBg.length > 95) over.push(`${spec.id} step ${s.n} — ${s.textBg.length} ch`);
      });
      // …and the numbering stays contiguous 1..n, which reordering can break.
      expect(
        spec.instructionsBg.map((s) => s.n),
        `${spec.id} step numbering`,
      ).toEqual(spec.instructionsBg.map((_, i) => i + 1));
    }
    expect(over, over.join(", ")).toEqual([]);
  });

  it("COUNTER-PROOF: every step 1 that shipped before this wave fails the rule", () => {
    // Verbatim, from the four blocked drills as they stood at 70bcd1b. Two put
    // the aisle act in step 2 and two buried it as a trailing clause. If any of
    // these ever satisfies the rule above, the rule has been hollowed out.
    const SHIPPED_STEP_ONES: Record<string, string> = {
      "sc-park-van": "Подмини гнездото и спри — под 6 км/ч — щом задната ти броня подмине съседа.",
      "sc-park-45-rev": "Подмини мястото и спри успоредно на алеята — под 6 км/ч, в покой.",
      "sc-park-wall":
        "Спри РАНО — под 6 км/ч — щом бронята ти подмине последната кола, в средата на алеята.",
      "sc-park-double": "Подмини гнездото и спри — под 6 км/ч — точно по средата на алеята.",
    };
    for (const [id, shipped] of Object.entries(SHIPPED_STEP_ONES)) {
      const compliant =
        AISLE_POSITION_ACT.test(shipped) &&
        AISLE_MOVE_VERB.test(shipped) &&
        AISLE_REASON.test(shipped);
      expect(compliant, `${id}'s shipped step 1 would now pass — the rule has gone soft`).toBe(
        false,
      );
      // …and none of them is still the first step of its drill.
      expect(byId(id).instructionsBg[0].textBg, id).not.toBe(shipped);
    }
    // The two that buried it really did contain the phrase — which is exactly
    // why „names it somewhere" was not enough and this section exists.
    expect(AISLE_POSITION_ACT.test(SHIPPED_STEP_ONES["sc-park-wall"])).toBe(true);
    expect(AISLE_POSITION_ACT.test(SHIPPED_STEP_ONES["sc-park-double"])).toBe(true);
  });

  it("nothing else in the family lost its halt: „спри“ is still asked for, on every drill", () => {
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      const copy = spec.instructionsBg.map((s) => s.textBg).join(" ");
      expect(/спри|СПРИ/u.test(copy), `${spec.id} no longer asks for a stop`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — sc-park-night's lamp duty is billed, not just described
// ---------------------------------------------------------------------------

/**
 * A drive up the lot aisle, lamps as given — and `isNight` taken FROM THE
 * COMPILED LESSON, never asserted by this file.
 *
 * THIS IS THE HALF THAT WAS DECORATION AND WAS CAUGHT BEING IT. Written first
 * with a hard-coded `isNight: true`, the whole of §4 stayed green when
 * `sc-park-night`'s `conditions: { night: true }` was deleted from the
 * template — it was measuring a tick this file built, not a lesson the product
 * compiles. `LessonScene` seeds the runtime's night flag from
 * `lesson.environment.timeOfDay` (contracts.ts LessonSpec.environment), so
 * that is the only honest source, and a rung that stops being dark now takes
 * the conviction with it.
 */
function aisleTick(
  t: number,
  headlights: "off" | "low",
  environment: { timeOfDay?: "day" | "dusk" | "night" } | undefined,
): SimTick {
  return {
    t,
    speedKmh: 14,
    position: { x: 4.06, y: -20 + t },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights,
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: environment?.timeOfDay === "night",
    events: [],
  } as unknown as SimTick;
}

function nightCodes(spec: ScenarioSpec, level: ScenarioLevel, headlights: "off" | "low"): string[] {
  const lesson = compileScenario(spec, level);
  let engine = createRuleEngine(lesson.ruleConfig);
  const codes: string[] = [];
  for (let t = 0; t <= 12; t += 0.5) {
    const r = reduceTick(engine, aisleTick(t, headlights, lesson.environment));
    engine = r.state;
    for (const e of r.events) if (e.kind === "violation") codes.push(e.code);
  }
  return codes;
}

describe("§4 — the lamps sc-park-night says are a fault really are one", () => {
  it("the objectiveBg says the lamps are a duty and not a task, and names the code's class", () => {
    const spec = byId("sc-park-night");
    // The sentence the sweep filed against („първо включи късите светлини и
    // спри в изходната позиция") sold the lamps as half of Задача 1. No
    // ObjectiveParams variant reads a control state, so that half could never
    // tick. The replacement must still be an EXPLANATION, not a disclaimer.
    expect(spec.objectiveBg).toMatch(/светлините не са една от двете задачи/iu);
    expect(spec.objectiveBg).toMatch(/основна грешка/iu);
    expect(spec.objectiveBg).toMatch(/чл\. 70/u);
    // …and no success objective claims them.
    for (const o of spec.success) {
      expect(o.titleBg, `${o.id} title claims the lamps`).not.toMatch(/светлин|фаров/iu);
    }
  });

  it("and the engine convicts a lamps-off drive on this lesson, at every rung", () => {
    const spec = byId("sc-park-night");
    for (const rung of spec.levels) {
      // The drill's whole subject is the dark, so every rung must compile to it
      // — this is what makes the conviction below the LESSON's and not a night
      // this test supplied for itself.
      expect(
        compileScenario(spec, rung.level).environment?.timeOfDay,
        `L${rung.level} of a drill called „Нощно паркиране" is not dark`,
      ).toBe("night");
      expect(
        nightCodes(spec, rung.level, "off"),
        `L${rung.level}: the copy promises HEADLIGHTS_OFF_AT_NIGHT and the engine bills nothing`,
      ).toContain("HEADLIGHTS_OFF_AT_NIGHT");
    }
  });

  it("MIRROR: the same drive with the lamps ON is never billed for them", () => {
    const spec = byId("sc-park-night");
    for (const rung of spec.levels) {
      expect(nightCodes(spec, rung.level, "low"), `L${rung.level}`).not.toContain(
        "HEADLIGHTS_OFF_AT_NIGHT",
      );
    }
  });
});
