/**
 * THE ARRIVAL CONTRACT'S STATE HALF — the lamps and the direction a reachZone
 * gate now witnesses (objectives.ts, `ReachZoneWitnessDemands`).
 *
 * WHAT THIS FILE EXISTS FOR. Five shipped gates promised a skill in the banner
 * and graded a place: «Мини контролната зона осветен» ticked with the СВЕТЛИНИ
 * telltale dim in every captured frame, «Следвай предната кола с къси светлини»
 * ticked on the mobile WRONG drive at 1:11, and «Дръж права линия по средата на
 * заден ход» ticked on a car driving FORWARD in D at 60 км/ч. A green tick for
 * a skill nobody measured is the product's core failure mode: the student is
 * told the thing he did wrong was right, and then he drives on a real road.
 *
 * THE OTHER DIRECTION IS TESTED JUST AS HARD, because a refusal handed to a
 * correct drive is the same crime pointing backwards — it is the founder's own
 * complaint. Every gate below is asserted twice: the drive that should be
 * refused IS refused, and the drive that should be credited IS credited, off
 * the same tick stream with one field changed. That single-field flip is the
 * mutation: comment out the demand and the „refused" halves go green, which is
 * the only thing that makes them assertions rather than decoration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import type { ScenarioTrace } from "../../traces/types";
import type { SimTick } from "../../rules";
import {
  createEvalState,
  deriveGearDemand,
  deriveLampDemand,
  parseObjectiveParams,
  stepObjective,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

function parsed(titleBg: string, params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

/** Run a tick stream through one objective; returns whether it EVER completed. */
function run(params: ObjectiveParams, ticks: SimTick[]): { done: boolean; atT: number | null } {
  let evalState: ObjectiveEvalState = createEvalState(params);
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick);
    evalState = r.evalState;
    if (r.done) return { done: true, atT: tick.t };
  }
  return { done: false, atT: null };
}

/**
 * A straight northbound approach to (0, 0) at a steady speed, one tick per
 * metre — the shape of every drive in this file. `at` lets a test change one
 * cockpit field at one point of the run and change nothing else.
 */
function approach(
  fromY: number,
  toY: number,
  speedKmh: number,
  at: (y: number) => Partial<SimTick>,
): SimTick[] {
  const out: SimTick[] = [];
  const step = fromY < toY ? 1 : -1;
  let t = 0;
  for (let y = fromY; step > 0 ? y <= toY : y >= toY; y += step) {
    out.push(makeTick({ t, speedKmh, position: { x: 0, y }, ...at(y) }));
    t += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1 · The matchers, both directions — the instrument before the measurement
// ---------------------------------------------------------------------------

describe("the banner's own words decide the demand, and only the right words", () => {
  it("a LIT CAR is demanded; an unlit PLACE is not (the four shipped strings)", () => {
    // The whole risk of reading the demand off the title is here: three shipped
    // rows describe the ROAD with the same six letters that describe the CAR,
    // and a disc is exactly the thing you can draw around a place.
    expect(deriveLampDemand("Мини контролната зона осветен")).toBe("lit");
    expect(deriveLampDemand("Мини контролната зона осветен и съобразен")).toBe("lit");
    expect(
      deriveLampDemand("Мини неосветения участък със съобразена за видимостта скорост"),
    ).toBeUndefined();
    expect(deriveLampDemand("Спри на позицията, в рамките на осветеното")).toBeUndefined();
    expect(
      deriveLampDemand("Приближи неосветената пътека със скорост за видимостта"),
    ).toBeUndefined();
  });

  it("the specific beams win over the generic lit, and the fog lamps over both", () => {
    expect(deriveLampDemand("Следвай предната кола с къси светлини")).toBe("low");
    expect(deriveLampDemand("Мини участъка с дълги светлини")).toBe("high");
    expect(deriveLampDemand("Мини зоната с фаровете за мъгла")).toBe("fog");
    // A title that names no lamp asks for none — sc-ac-fog's own banner, whose
    // briefing DOES demand both lamps. That row is an authored `requireLamps`
    // away and is named as such in the routing note below.
    expect(
      deriveLampDemand("Мини контролната зона със съобразена за мъглата скорост"),
    ).toBeUndefined();
    expect(deriveLampDemand("Приближи със зимна скорост")).toBeUndefined();
  });

  it("«НА заден ход» is the act; «ЗА заден ход» is the reason, and only the act binds", () => {
    // One letter apart, and the wrong reading refuses a correct drive: the
    // setup mark is reached FACING FORWARD, in order to start reversing.
    expect(deriveGearDemand("Дръж права линия по средата на заден ход")).toBe("reverse");
    expect(deriveGearDemand("Задача 1: излез от мястото на заден ход, с пешеходна скорост")).toBe(
      "reverse",
    );
    expect(deriveGearDemand("Заеми изходната позиция за заден ход по права")).toBeUndefined();
    expect(deriveGearDemand("Стигни края на отсечката")).toBeUndefined();
  });

  it("an authored param OVERRIDES the banner, and a malformed one is loud", () => {
    const p = parsed("Мини контролната зона осветен", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
      requireLamps: "low",
    });
    expect(p.requireLamps).toBe("low");
    // The routing this exists for: sc-ac-fog / sc-ac-snow name a speed in the
    // banner and the lamps in the briefing, so only an authored demand binds.
    const fog = parsed("Мини контролната зона със съобразена за мъглата скорост", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
      requireLamps: "fog",
    });
    expect(fog.requireLamps).toBe("fog");
    expect(() =>
      parsed("Тест", { kind: "reachZone", x: 0, y: 0, radiusM: 10, requireLamps: "dipped" }),
    ).toThrow(/requireLamps/);
    expect(() =>
      parsed("Тест", { kind: "reachZone", x: 0, y: 0, radiusM: 10, requireGear: "forward" }),
    ).toThrow(/requireGear/);
  });
});

// ---------------------------------------------------------------------------
// 2 · sc-ac-night-lights — the frame the whole class was read off
// ---------------------------------------------------------------------------

describe("«Мини контролната зона осветен» needs the lamps ON", () => {
  // The shipped gate, verbatim: ac-night-v1's control zone, radius 10, cap 50.
  const GATE = { kind: "reachZone", x: 0, y: 0, radiusM: 10, maxSpeedKmh: 50 } as const;
  const params = parsed("Мини контролната зона осветен", { ...GATE });

  it("derives the demand from the shipped title", () => {
    expect(params.requireLamps).toBe("lit");
  });

  it("REFUSES the drive the sweep photographed — through the zone, lamps off", () => {
    // `sc-ac-night-lights/pc-right/04-t116s.png`: ✓ at 1:56 with the СВЕТЛИНИ
    // telltale dim and no beam pool on the road, in the lesson whose entire
    // subject is reaching for that switch.
    const dark = approach(-40, 40, 44, () => ({ headlights: "off" }));
    expect(run(params, dark).done).toBe(false);
  });

  it("…and CREDITS the identical drive with one field changed", () => {
    // THE MUTATION. Same positions, same speed, same clock — `headlights`
    // alone decides, which is what makes the refusal above an assertion.
    const lit = approach(-40, 40, 44, () => ({ headlights: "low" }));
    expect(run(params, lit).done).toBe(true);
  });

  it("high beams are lit too — at night on an empty street that is lawful", () => {
    // A demand of „lit" may not become a demand for DIPPED by accident: чл. 70
    // asks for lights, and dipping them is чл. 71's separate duty with its own
    // grader. Refusing a high-beam drive here would be a false failure.
    expect(run(params, approach(-40, 40, 44, () => ({ headlights: "high" }))).done).toBe(true);
  });

  it("REFUSES the second shipped mistake demo — lit, then switched off at the mark", () => {
    // «Изгасени светлини по време на движение» (traces/scAcNightLights.ts).
    // The latch is spendable, so the drive that banks the lamps early and goes
    // dark on the mark is not credited for having driven it lit.
    const extinguished = approach(-40, 40, 44, (y) => ({
      headlights: y < -15 ? "low" : "off",
    }));
    expect(run(params, extinguished).done).toBe(false);
  });

  it("CANNOT TRAP: arriving dark and switching on at the mark is credited", () => {
    // The half that had to be checked before the half that refuses. The switch
    // is reachable on both platforms (KeyL / the СВЕТЛ cell of the touch flank
    // strip), and the latch re-earns exactly as the speed cap does.
    const lateSwitch = approach(-40, 40, 44, (y) => ({ headlights: y < -2 ? "off" : "low" }));
    const r = run(params, lateSwitch);
    expect(r.done).toBe(true);
    expect(r.atT).toBeGreaterThan(0);
  });

  it("the speed contract still holds on top of it — lit but 19 км/ч over is refused", () => {
    // The two halves compose; neither buys the other. (REACH_ZONE_CAP_SLACK_KMH
    // is 5, so 69 is over the 50 cap by more than the slack.)
    expect(run(params, approach(-40, 40, 69, () => ({ headlights: "low" }))).done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 · sc-ac-highbeam-lead — the demand is DIPPED, and high beams are the fault
// ---------------------------------------------------------------------------

describe("«Следвай предната кола с къси светлини» means DIPPED, not merely lit", () => {
  const params = parsed("Следвай предната кола с къси светлини", {
    kind: "reachZone",
    x: 0,
    y: 0,
    radiusM: 12,
    maxSpeedKmh: 50,
  });

  it("derives the DIPPED-beam demand, not the generic lit one", () => {
    expect(params.requireLamps).toBe("low");
  });

  it("REFUSES the dazzling drive — the whole subject of the lesson", () => {
    // sweep161 `sc-ac-highbeam-lead/mobile-wrong/08-debrief`: this objective
    // ticked at 1:11 on a run that also logged 18 collisions and 180 penalty
    // points. Beam discipline had no grader anywhere in the product.
    expect(run(params, approach(-40, 40, 44, () => ({ headlights: "high" }))).done).toBe(false);
  });

  it("…and credits the same drive on dipped beams", () => {
    expect(run(params, approach(-40, 40, 44, () => ({ headlights: "low" }))).done).toBe(true);
  });

  it("dipping late still counts — the student who corrects is not punished", () => {
    const dips = approach(-40, 40, 44, (y) => ({ headlights: y < -4 ? "high" : "low" }));
    expect(run(params, dips).done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · The fog pairing — чл. 74: fog lamps are an ADDITION, never a substitute
// ---------------------------------------------------------------------------

describe("a fog demand asks for both lamps", () => {
  const params = parsed("Мини зоната с фаровете за мъгла", {
    kind: "reachZone",
    x: 0,
    y: 0,
    radiusM: 10,
    maxSpeedKmh: 40,
  });

  const drive = (over: Partial<SimTick>) => run(params, approach(-30, 30, 35, () => over));

  it("fog lamps alone are not enough, and beams alone are not enough", () => {
    expect(drive({ headlights: "off", fogLightsOn: true }).done).toBe(false);
    expect(drive({ headlights: "low", fogLightsOn: false }).done).toBe(false);
  });

  it("both together complete it", () => {
    expect(drive({ headlights: "low", fogLightsOn: true }).done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5 · sc-ed-reverse-line — the direction the gate never looked at
// ---------------------------------------------------------------------------

describe("«…по средата на заден ход» needs the car to be going BACKWARDS", () => {
  // The shipped gate, verbatim (templates-exam.ts, sc-edrl-reverse-mid): a
  // radius-1.8 lateral band ~13 m into a 25 m reverse, and NO cap at all — so
  // before this change the only question it asked was „did a line cross this
  // disc", which a car doing 60 in D answers just as well as one reversing.
  const params = parsed("Дръж права линия по средата на заден ход", {
    kind: "reachZone",
    x: 0,
    y: 0,
    radiusM: 1.8,
  });

  it("derives the reverse demand", () => {
    expect(params.requireGear).toBe("reverse");
  });

  it("REFUSES the sweep's wrong drive — forward, in D, at 60 км/ч", () => {
    // `sc-ed-reverse-line/pc-wrong/08-debrief`: ticked at 0:59 while driving
    // FORWARD in D at up to 60 км/ч and collecting ten speeding faults, while
    // the careful run doing the same forward crawl never got it. Direction of
    // travel was simply not measured.
    const forward = approach(-20, 20, 60, () => ({ gear: 1 }));
    expect(run(params, forward).done).toBe(false);
  });

  it("…and CREDITS the reverse leg the lesson is about", () => {
    // THE MUTATION: the same line through the same disc, `gear` alone flipped
    // to R and the speed signed as the driveline signs it.
    const reverse = approach(20, -20, 8, () => ({ gear: -1, speedKmh: -8 }));
    expect(run(params, reverse).done).toBe(true);
  });

  it("a car standing in R has not reversed anywhere yet", () => {
    // „Went through backwards" is a MOTION, not a selector position: a car
    // parked on the mark with R engaged has performed nothing.
    const parkedInR = approach(-20, 20, 0, () => ({ gear: -1, speedKmh: 0 }));
    expect(run(params, parkedInR).done).toBe(false);
  });

  it("and a pause mid-manoeuvre does not withdraw the credit", () => {
    // Reversing legitimately stops — the drill's own copy says the two halts
    // ARE the manoeuvre. The latch is spent by TRAVELLING FORWARD through the
    // disc, never by standing still.
    const withPause = [
      ...approach(20, 1, 8, () => ({ gear: -1, speedKmh: -8 })),
      ...approach(0, 0, 0, () => ({ gear: -1, speedKmh: 0 })),
      ...approach(-1, -20, 8, () => ({ gear: -1, speedKmh: -8 })),
    ];
    expect(run(params, withPause).done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6 · A demandless zone is bit-identical to shipped
// ---------------------------------------------------------------------------

describe("nothing changes for a gate that promises nothing", () => {
  it("a bare waypoint completes on presence, at any speed, in any gear, unlit", () => {
    const params = parsed("Стигни края на отсечката", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 12,
    });
    expect(params.requireLamps).toBeUndefined();
    expect(params.requireGear).toBeUndefined();
    expect(
      run(params, approach(-40, 40, 130, () => ({ headlights: "off", gear: 4 }))).done,
    ).toBe(true);
  });

  it("a cap-only gate keeps the exact contract sweep 161 gave it", () => {
    const params = parsed("Приближи пътеката с готовност за спиране", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
      maxSpeedKmh: 40,
    });
    expect(run(params, approach(-40, 40, 59, () => ({ headlights: "off" }))).done).toBe(false);
    expect(run(params, approach(-40, 40, 35, () => ({ headlights: "off" }))).done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7 · THE CATALOGUE CENSUS — the whole shipped library, named row by row
// ---------------------------------------------------------------------------

interface Row {
  specId: string;
  objectiveId: string;
  titleBg: string;
  lamps?: string;
  gear?: string;
}

const CATALOGUE: Row[] = SCENARIO_TEMPLATES.flatMap((spec) =>
  spec.success
    .filter((o) => (o.params as { kind?: string }).kind === "reachZone")
    .map((o) => {
      const p = parseObjectiveParams({
        id: o.id,
        titleBg: o.titleBg,
        kind: "reachZone",
        // `ScenarioObjective.params` is the AUTHORED union; the parser takes
        // the CONTRACT shape, whose `params` is the untyped record a compiled
        // lesson carries (`LessonObjective.params: Record<string, unknown>`).
        params: o.params as unknown as Record<string, unknown>,
      }) as WitnessedReachZoneParams;
      const row: Row = { specId: spec.id, objectiveId: o.id, titleBg: o.titleBg };
      if (p.requireLamps !== undefined) row.lamps = p.requireLamps;
      if (p.requireGear !== undefined) row.gear = p.requireGear;
      return row;
    }),
);

/**
 * EVERY reachZone gate in the shipped catalogue that now witnesses a cockpit
 * state, pinned by value. This list is the census, not a summary of it: a row
 * that appears is a gate that started grading something, a row that disappears
 * is a gate that stopped, and either way somebody has to look. It is also the
 * instrument's own self-check — a matcher that quietly stopped matching empties
 * this list, and an empty list fails the build instead of passing silently.
 */
const WITNESSED: ReadonlyArray<{ id: string; lamps?: string; gear?: string }> = [
  { id: "sc-ac-highbeam-lead/sc-ahl-follow", lamps: "low" },
  { id: "sc-ac-night-lights/sc-acn-lit", lamps: "lit" },
  { id: "sc-ac-rain-lights/sc-acr-lit", lamps: "lit" },
  // FOUND BY THE CENSUS, NOT BY THE SWEEP — `sc-ed-poligon-chain/sc-pgc-rev-mid`
  // is `sc-edrl-reverse-mid` again, word for word and shape for shape (a bare
  // radius-2 lateral band, no cap, mid-reverse), on a template the 51 routed
  // findings never photographed. Reading the rule over the whole catalogue
  // instead of over the named rows is what turned one reported defect into two.
  { id: "sc-ed-poligon-chain/sc-pgc-rev-mid", gear: "reverse" },
  { id: "sc-ed-reverse-line/sc-edrl-reverse-mid", gear: "reverse" },
  { id: "sc-park-bay-exit-rev/sc-pbe-out", gear: "reverse" },
];

describe("the catalogue census — which gates gained an observation", () => {
  it("reads a real catalogue (a census over nothing is not a census)", () => {
    // 357 authored reachZone success rows across the 167 shipped templates at
    // the time of writing; the floor is well under it so a genuine authoring
    // change does not red the build, and well over zero so a matcher that
    // stopped matching cannot pass this vacuously.
    expect(CATALOGUE.length).toBeGreaterThan(300);
  });

  it("exactly these rows witness a cockpit state, and no others", () => {
    const live = CATALOGUE.filter((r) => r.lamps !== undefined || r.gear !== undefined)
      .map((r) => {
        const out: { id: string; lamps?: string; gear?: string } = {
          id: `${r.specId}/${r.objectiveId}`,
        };
        if (r.lamps !== undefined) out.lamps = r.lamps;
        if (r.gear !== undefined) out.gear = r.gear;
        return out;
      })
      // Sorted, so re-ordering a template file is not a spurious red — the
      // question this asks is WHICH rows, never in what order they compile.
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(live).toEqual(WITNESSED);
  });

  it("no gate in the catalogue promises a lamp that nothing asks for", () => {
    // The invariant this whole change exists to make structural: the gate
    // measures what the banner promises. It is stated as a rule over the
    // catalogue rather than over the five rows above, so the next authored
    // «…с къси светлини» is bound the moment it is written.
    const unbacked = CATALOGUE.filter(
      (r) => deriveLampDemand(r.titleBg) !== undefined && r.lamps === undefined,
    ).map((r) => `${r.specId}/${r.objectiveId} — "${r.titleBg}"`);
    expect(unbacked).toEqual([]);
  });

  it("…and none promises a reverse that nothing asks for", () => {
    const unbacked = CATALOGUE.filter(
      (r) => deriveGearDemand(r.titleBg) !== undefined && r.gear === undefined,
    ).map((r) => `${r.specId}/${r.objectiveId} — "${r.titleBg}"`);
    expect(unbacked).toEqual([]);
  });

  it("an authored demand never contradicts its own banner", () => {
    // The one hole the „authored wins" rule opens: a param that says one thing
    // while the banner says another is the same lie in the other direction.
    const lying = CATALOGUE.filter((r) => {
      const claimed = deriveLampDemand(r.titleBg);
      return claimed !== undefined && r.lamps !== undefined && r.lamps !== claimed;
    }).map((r) => `${r.specId}/${r.objectiveId} — banner "${r.titleBg}" vs param ${r.lamps}`);
    expect(lying).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8 · THE COMMITTED DRIVES — the false-refusal check, on real recorded paths
// ---------------------------------------------------------------------------

/**
 * A refusal handed to a correct drive is the failure this project ranks worst,
 * so the five witnessed gates are replayed against the DEMONSTRATIONS THE
 * PRODUCT SHIPS — the committed recordings the lessons play as their own
 * „this is how it is done" — at every authored rung, through the compiled
 * params rather than hand-written ones. If the shadow of a drill stops
 * completing the drill, the change is wrong no matter what the unit tests say.
 *
 * WHAT THE RECORDINGS DO AND DO NOT CARRY. `ScenarioTrace.samples` carry the
 * path, the speeds and the GEAR — so the three reverse gates below are proved
 * against the real recorded direction channel, nothing supplied. They carry no
 * lamp channel (the cockpit state is authored in the SCRIPT, `traces/
 * scAcNightLights.ts` et al., not decimated into the trace), so the three lamp
 * gates get the path from the recording and the lamp state from the script's
 * own declaration — and are then re-run with that one field flipped, which is
 * the same mutation the unit sections use, over 500-odd real frames.
 */
function readTrace(relPath: string): ScenarioTrace {
  return JSON.parse(readFileSync(join(process.cwd(), "..", relPath), "utf8")) as ScenarioTrace;
}

/** Replay a committed recording through the SHIPPED evaluator, one tick per
 *  sample, exactly as a session would — with `over` standing in for whatever
 *  channel the trace format does not decimate. */
function replay(
  params: ObjectiveParams,
  trace: ScenarioTrace,
  over: (s: ScenarioTrace["samples"][number]) => Partial<SimTick> = () => ({}),
): boolean {
  let state: ObjectiveEvalState = createEvalState(params);
  let done = false;
  for (const s of trace.samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: s.gear,
        indicator: s.indicator,
        ...over(s),
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

/** Every authored rung's compiled params for one objective of one template. */
function compiledRungs(specId: string, objectiveId: string): ObjectiveParams[] {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId);
  if (spec === undefined) throw new Error(`no template ${specId}`);
  return spec.levels.map((rung) => {
    const obj = compileScenario(spec, rung.level).objectives.find((o) => o.id === objectiveId);
    if (obj === undefined) throw new Error(`no objective ${objectiveId} at L${rung.level}`);
    return parseObjectiveParams(obj);
  });
}

describe("the shipped demonstrations still pass their own gates", () => {
  it("sc-ac-night-lights: the shadow completes lit, and the SAME path does not, dark", () => {
    const trace = readTrace("content/traces/sc-ac-night-lights/shadow-correct.trace.json");
    const rungs = compiledRungs("sc-ac-night-lights", "sc-acn-lit");
    expect(rungs.length).toBeGreaterThanOrEqual(3);
    for (const p of rungs) {
      // The script's own first instruction is `{ kind: "headlights", setting:
      // "low" }`, and the recorder's night default is "low" besides.
      expect(replay(p, trace, () => ({ headlights: "low", isNight: true }))).toBe(true);
      // «Никога не включени светлини» — the shipped mistake demo's cockpit
      // state on the shadow's own flawless path. Only the lamp differs.
      expect(replay(p, trace, () => ({ headlights: "off", isNight: true }))).toBe(false);
    }
  });

  it("sc-ac-rain-lights: same, at every rung", () => {
    const trace = readTrace("content/traces/sc-ac-rain-lights/shadow-correct.trace.json");
    for (const p of compiledRungs("sc-ac-rain-lights", "sc-acr-lit")) {
      expect(replay(p, trace, () => ({ headlights: "low", rain: true }))).toBe(true);
      expect(replay(p, trace, () => ({ headlights: "off", rain: true }))).toBe(false);
    }
  });

  it("sc-ac-highbeam-lead: the shadow dips, and the high-beam demo does not pass", () => {
    const trace = readTrace("content/traces/sc-ac-highbeam-lead/shadow-correct.trace.json");
    for (const p of compiledRungs("sc-ac-highbeam-lead", "sc-ahl-follow")) {
      expect(replay(p, trace, () => ({ headlights: "low", isNight: true }))).toBe(true);
      // «Дълги светлини през целия път зад предния» — the drive the sweep saw
      // credited on mobile at 1:11, with 18 collisions in the same protocol.
      expect(replay(p, trace, () => ({ headlights: "high", isNight: true }))).toBe(false);
    }
  });

  it("the three reverse gates pass on the recordings' OWN gear channel", () => {
    // Nothing supplied here: `gear` and the signed `speedKmh` come straight out
    // of the committed recording (sc-ed-reverse-line's shadow carries 396
    // frames of gear −1 with speeds down to −4.9 км/ч).
    const rows: ReadonlyArray<[string, string, string]> = [
      ["sc-ed-reverse-line", "sc-edrl-reverse-mid", "content/traces/sc-ed-reverse-line/shadow-correct.trace.json"],
      ["sc-ed-poligon-chain", "sc-pgc-rev-mid", "content/traces/sc-ed-poligon-chain/shadow-correct.trace.json"],
      ["sc-park-bay-exit-rev", "sc-pbe-out", "content/traces/sc-park-bay-exit-rev/shadow-correct.trace.json"],
    ];
    for (const [specId, objectiveId, path] of rows) {
      const trace = readTrace(path);
      for (const p of compiledRungs(specId, objectiveId)) {
        expect(replay(p, trace), `${specId}/${objectiveId} shadow`).toBe(true);
        // THE MUTATION on real data: the identical path and speeds driven
        // FORWARDS — the sweep's wrong drive, which used to earn the tick.
        expect(
          replay(p, trace, (s) => ({ gear: 1, speedKmh: Math.abs(s.speedKmh) })),
          `${specId}/${objectiveId} driven forwards`,
        ).toBe(false);
      }
    }
  });
});

/**
 * ROUTED, NOT CLOSED — two rows of the same class this file cannot reach, named
 * so the next wave can spend them in one line each. Both are `templates-
 * conditions.ts`, which this lane does not own:
 *
 *   · `sc-ac-fog/sc-acf-zone` — «Мини контролната зона със съобразена за
 *     мъглата скорост». Instruction 1 makes BOTH the dipped beams and the fog
 *     lamps a precondition of moving off («Включи късите светлини и фаровете за
 *     мъгла (клавиш V) преди да потеглиш»), and the sweep photographed both
 *     telltales dim from arrival through t101s with the gate ticked at 1:56 and
 *     3/3 stars. The banner names only a speed, so no derivation can bind it:
 *     add `requireLamps: "fog"` to that objective's params.
 *   · `sc-ac-snow/sc-acs-approach` — «Приближи със зимна скорост», same shape,
 *     СВЕТЛИНИ dim throughout: add `requireLamps: "low"`.
 *
 * Both are one key in one object, and the census above turns each into a green
 * row the moment it lands — `WITNESSED` is what has to be updated with it.
 */
