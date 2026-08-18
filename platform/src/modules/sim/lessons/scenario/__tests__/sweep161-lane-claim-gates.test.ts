/**
 * SWEEP 161 — the overtake/lane claims of templates-lanes.ts, proved in BOTH
 * directions.
 *
 * The 2026-08-16 device sweep drove every lesson at L1 („Пълна помощ", the rung
 * beginners actually get) on a phone and on a desktop, twice each — once
 * carefully, once recklessly — and photographed the debrief. Four of its
 * findings against this file are the same crime under different names, and it
 * is the crime cdb2f71 was about: A GREEN TICK FOR A SKILL THE GATE NEVER
 * MEASURED. What made them survive cdb2f71's census is arithmetic rather than
 * vocabulary — every one of these titles names a LANE, which is the one claim a
 * `reachZone` really can prove, and every one of them was authored at a radius
 * the L1/L2 tolerance ladder then widened past the lane line.
 *
 *   · sc-ov-return-gap  «Изпревари бавната кола в насрещната лента» ticked at
 *     2:49 on a run whose top speed was 15 км/ч with 27 full stops and which
 *     never crossed the centre line. All four runs were credited.
 *   · sc-mw-emergency-lane «Подмини авариралата кола в лентата за движение»
 *     had an L1 disc of 9.00 m on a lane pitch of 8.125 — it reached the
 *     EMERGENCY lane centre, i.e. the one lane the lesson forbids — and no
 *     speed demand at all, so a 139 км/ч run collected it and three stars.
 *   · sc-ov-oncoming-gap «Изпревари в големия прозорец…» ticked at 2:31 for a
 *     drive with 14 collisions and 141 наказателни точки.
 *   · sc-ov-abort «Прекъсни маневрата и се прибери…» ticked for drives that
 *     never began a manoeuvre, and its finishing row was credited ONLY to the
 *     reckless run (46 т., 4 collisions, a 0.3 m near-miss).
 *
 * EVERY TEST BELOW CARRIES BOTH HALVES, because a radius change that only ever
 * passes proves nothing about what it fixed:
 *   §1 the drive the finding names is replayed through the OLD compiled params
 *      and shown to COMPLETE, then through the SHIPPED ones and shown refused;
 *   §2 the shipped shadow is shown to still complete, at EVERY rung, so the
 *      cure is not a false refusal wearing the cure's clothes;
 *   §3 the compiled disc of every lane-claiming row this wave touched is shown
 *      to stay inside the lane it names, on every rung (the ladder is what
 *      broke these in the first place, so the authored number proves nothing);
 *   §4 the two clauses this wave STRUCK are shown gone, with the reason each
 *      could not be gated instead.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { ObjectiveParams, ReachZoneParams } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import {
  SC_MW_EMERGENCY_LANE,
  SC_OV_ABORT,
  SC_OV_BAN_OVERTAKE,
  SC_OV_BUS_LANE,
  SC_OV_ONCOMING_GAP,
  SC_OV_RETURN_GAP,
} from "../templates-lanes";
import type { ScenarioLevel, ScenarioSpec } from "../types";

/** The catalogue's lane pitch on every district in this file; a disc centred on
 *  a lane centre leaves that lane at half of it. */
const LANE_HALF_PITCH_M = 8.125 / 2;

function readTrace(path: string): ScenarioTrace {
  return JSON.parse(readFileSync(join(process.cwd(), "..", path), "utf8")) as ScenarioTrace;
}

/** Replay a recorded drive through the SHIPPED evaluator exactly as a session
 *  would: fresh eval state, one tick per sample, monotonic latches. */
function replay(params: ObjectiveParams, trace: ScenarioTrace): boolean {
  let state = createEvalState(params);
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
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

/**
 * A drive that holds ONE lateral position all the way past a mark — the shape
 * of every drive the sweep caught being falsely credited (the crawler that
 * never left its lane, the 139 км/ч motorway run, the shoulder undertake).
 * 0.4 m of travel per tick keeps the samples denser than the disc, so nothing
 * here depends on `stepReachZone`'s segment sweep.
 */
function straightDrive(x: number, fromY: number, toY: number, speedKmh: number) {
  const samples: Array<{ t: number; x: number; y: number; speedKmh: number }> = [];
  for (let y = fromY, t = 0; y <= toY; y += 0.4, t += 0.05) {
    samples.push({ t, x, y, speedKmh });
  }
  return samples;
}

function completesOn(params: ReachZoneParams, drive: ReturnType<typeof straightDrive>): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of drive) {
    const r = stepObjective(
      params,
      state,
      makeTick({ t: s.t, speedKmh: s.speedKmh, position: { x: s.x, y: s.y } }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

/** The SHIPPED params of one objective at one rung, i.e. what the student is
 *  actually graded against — never the authored number. */
function compiledZone(spec: ScenarioSpec, objectiveId: string, level: ScenarioLevel): ReachZoneParams {
  const obj = compileScenario(spec, level).objectives.find((o) => o.id === objectiveId);
  expect(obj, `${spec.id}/${objectiveId} at L${level}`).toBeDefined();
  const p = parseObjectiveParams(obj!);
  expect(p.kind).toBe("reachZone");
  return p as ReachZoneParams;
}

const rungs = (spec: ScenarioSpec) => spec.levels.map((l) => l.level);

const shadowOf = (spec: ScenarioSpec) => readTrace(spec.shadow!.path);

const demoOf = (spec: ScenarioSpec, basename: string) => {
  const m = spec.mistakes.find((x) => x.traceRef.path.endsWith(`${basename}.trace.json`));
  expect(m, `${spec.id} lost its ${basename} demo`).toBeDefined();
  return m!;
};

// ---------------------------------------------------------------------------
// §1 THE DRIVES THE SWEEP CAUGHT — credited before, refused now
// ---------------------------------------------------------------------------

describe("§1 sc-ovr-pass — «Изпревари бавната кола в насрещната лента»", () => {
  // ov-oncoming-v1: own lane +4.06, oncoming −4.06 (meta.scenario).
  const OWN_LANE_CRAWL = straightDrive(4.06, 150, 350, 15);

  it("FAILS ON THE OLD BEHAVIOUR: the L1 disc credited a car that never left its own lane", () => {
    // As shipped before this wave: mark on the committed pass line x = −2.5,
    // authored r5, and the L1 ladder multiplies it to 7.50 — reaching x = +5.00
    // while the own-lane centre is +4.06. This is the sweep's pc-right run.
    const asShipped: ReachZoneParams = { kind: "reachZone", x: -2.5, y: 250, radiusM: 7.5 };
    expect(completesOn(asShipped, OWN_LANE_CRAWL)).toBe(true);
    // L2 (6.25) already refused it, which is why only the aided rung was wrong
    // and why the authored number looked innocent.
    expect(completesOn({ ...asShipped, radiusM: 6.25 }, OWN_LANE_CRAWL)).toBe(false);
  });

  it("and the shipped gate refuses that drive on every rung", () => {
    for (const level of rungs(SC_OV_RETURN_GAP)) {
      expect(
        completesOn(compiledZone(SC_OV_RETURN_GAP, "sc-ovr-pass", level), OWN_LANE_CRAWL),
        `L${level}`,
      ).toBe(false);
    }
  });

  it("THE OPPOSITE DIRECTION: the shadow's real pass still completes it on every rung", () => {
    const shadow = shadowOf(SC_OV_RETURN_GAP);
    for (const level of rungs(SC_OV_RETURN_GAP)) {
      expect(replay(compiledZone(SC_OV_RETURN_GAP, "sc-ovr-pass", level), shadow), `L${level}`).toBe(
        true,
      );
    }
  });

  it("…and so does a pass held anywhere across the oncoming lane, not just on the recorded line", () => {
    // The remedy must not trade a false certificate for a false refusal: the
    // claim is „in the oncoming lane", so the whole oncoming lane has to count
    // at the rung the ladder makes widest.
    for (const x of [-1.5, -2.5, -4.06, -5.5, -6.5]) {
      expect(
        completesOn(compiledZone(SC_OV_RETURN_GAP, "sc-ovr-pass", 1), straightDrive(x, 200, 300, 60)),
        `x=${x}`,
      ).toBe(true);
    }
  });
});

describe("§1 sc-mwe-pass — «Подмини авариралата кола в лентата за движение»", () => {
  // mw-v1: cruise 0, overtaking −8.12, EMERGENCY +8.13 (meta.scenario).
  const SHOULDER_UNDERTAKE = straightDrive(8.13, 750, 900, 100);
  const FLAT_OUT_CRUISE = straightDrive(0, 750, 900, 139);

  it("FAILS ON THE OLD BEHAVIOUR: the L1 disc credited the shoulder undertake it exists to forbid", () => {
    const asShipped: ReachZoneParams = { kind: "reachZone", x: 0, y: 830, radiusM: 9 };
    expect(completesOn(asShipped, SHOULDER_UNDERTAKE)).toBe(true);
    expect(completesOn({ ...asShipped, radiusM: 7.5 }, SHOULDER_UNDERTAKE)).toBe(false);
  });

  it("FAILS ON THE OLD BEHAVIOUR: with no cap, a 139 км/ч pass of the stalled car was a green tick", () => {
    // The sweep's reckless run: one lane, never lifted, both tasks in 58 s,
    // ИЗДЪРЖАН with three stars — past a broken-down car in the shoulder.
    expect(completesOn({ kind: "reachZone", x: 0, y: 830, radiusM: 9 }, FLAT_OUT_CRUISE)).toBe(true);
  });

  it("and the shipped gate refuses BOTH on every rung", () => {
    for (const level of rungs(SC_MW_EMERGENCY_LANE)) {
      const p = compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", level);
      expect(completesOn(p, SHOULDER_UNDERTAKE), `shoulder L${level}`).toBe(false);
      expect(completesOn(p, FLAT_OUT_CRUISE), `139 км/ч L${level}`).toBe(false);
    }
  });

  it("THE OPPOSITE DIRECTION: the shadow (95.0 км/ч on the cruise lane) still completes it", () => {
    const shadow = shadowOf(SC_MW_EMERGENCY_LANE);
    for (const level of rungs(SC_MW_EMERGENCY_LANE)) {
      expect(
        replay(compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", level), shadow),
        `L${level}`,
      ).toBe(true);
    }
    // …and so do both counter-demos, which return to the cruise lane before the
    // mark. Their EMERGENCY_LANE_DRIVING conviction is what bills them, and it
    // is untouched by this gate — the tick and the fault are separate channels.
    for (const demo of ["mistake-undertake", "mistake-shoulder-cruise"]) {
      const t = readTrace(demoOf(SC_MW_EMERGENCY_LANE, demo).traceRef.path);
      expect(replay(compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", 3), t), demo).toBe(true);
      expect(demoOf(SC_MW_EMERGENCY_LANE, demo).codeRefs).toContain("EMERGENCY_LANE_DRIVING");
    }
    // The cap is published where the student reads it, not only where the
    // evaluator reads it (the LEDGER T18 rule).
    expect(SC_MW_EMERGENCY_LANE.success.find((o) => o.id === "sc-mwe-pass")!.titleBg).toContain(
      "110 км/ч",
    );
  });
});

describe("§1 sc-ovbus-general — «Пътувай в общата лента през участъка»", () => {
  // ov-bus-v1: general (left) 4.06, BUS (right) 12.19; the paint between them
  // is at 8.125.
  const STRADDLING_THE_BUS_PAINT = straightDrive(9.5, 170, 250, 40);

  it("FAILS ON THE OLD BEHAVIOUR: the L1 disc reached 1.94 m into the bus lane", () => {
    expect(
      completesOn({ kind: "reachZone", x: 4.06, y: 210, radiusM: 6, maxSpeedKmh: 55 }, STRADDLING_THE_BUS_PAINT),
    ).toBe(true);
  });

  it("and the shipped gate refuses it on every rung, while the shadow still completes", () => {
    const shadow = shadowOf(SC_OV_BUS_LANE);
    for (const level of rungs(SC_OV_BUS_LANE)) {
      const p = compiledZone(SC_OV_BUS_LANE, "sc-ovbus-general", level);
      expect(completesOn(p, STRADDLING_THE_BUS_PAINT), `L${level}`).toBe(false);
      expect(replay(p, shadow), `shadow L${level}`).toBe(true);
    }
  });
});

describe("§1 sc-ova-abort — «Прекъсни маневрата и се прибери зад бавната кола»", () => {
  it("FAILS ON THE OLD BEHAVIOUR: at L1 a car still across the centre line was ticked for tucking back", () => {
    // The old r4 compiled to 6.00 at L1, whose edge is x = −1.94 — 1.94 m into
    // the ONCOMING half. So a driver who never came back, and was merely
    // drifting across the paint at the mark, satisfied «прибери се зад бавната
    // кола». x = −1.5 is where `mistake-push-on` actually is at its closest
    // approach (5.62 m, at (−1.51, 250.7)), so this is its pose and not a
    // convenient one: what saved that recording from the tick was its 55.8 км/ч
    // against the cap, i.e. its SPEED, not the lane it was in.
    const STILL_OUT_THERE = straightDrive(-1.5, 200, 300, 45);
    expect(
      completesOn({ kind: "reachZone", x: 4.06, y: 250, radiusM: 6, maxSpeedKmh: 55 }, STILL_OUT_THERE),
    ).toBe(true);
    for (const level of rungs(SC_OV_ABORT)) {
      expect(
        completesOn(compiledZone(SC_OV_ABORT, "sc-ova-abort", level), STILL_OUT_THERE),
        `L${level}`,
      ).toBe(false);
    }
    expect(demoOf(SC_OV_ABORT, "mistake-push-on").codeRefs).toContain("OVERTAKE_INSUFFICIENT_GAP");
  });

  it("and the shipped gate refuses both counter-demos on every rung, while the shadow completes", () => {
    const shadow = shadowOf(SC_OV_ABORT);
    for (const level of rungs(SC_OV_ABORT)) {
      const p = compiledZone(SC_OV_ABORT, "sc-ova-abort", level);
      for (const demo of ["mistake-push-on", "mistake-head-on"]) {
        expect(replay(p, readTrace(demoOf(SC_OV_ABORT, demo).traceRef.path)), `${demo} L${level}`).toBe(
          false,
        );
      }
      expect(replay(p, shadow), `shadow L${level}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 THE GATES THAT NOW CARRY THE WORD «ИЗПРЕВАРИ»
// ---------------------------------------------------------------------------

/**
 * Three lessons said „overtake" in a task title and measured a coordinate a
 * lane-holder reaches anyway. Each now has a gate in the lane the manoeuvre
 * uses, and the objective chain is strictly sequential (objectives.ts), so the
 * word is carried by a there-and-back rather than by a sentence.
 *
 * The counter-drive is the same one in all three: hold the starting lane from
 * the first mark to the last. It completed the old chain end to end.
 */
const LANE_HOLDERS: ReadonlyArray<{
  spec: ScenarioSpec;
  objectiveId: string;
  holdX: number;
  fromY: number;
  toY: number;
  speedKmh: number;
  /** A demo that legitimately used the lane and must therefore still complete. */
  passingDemo?: string;
  /** Demos that did NOT make this pass and must be refused. */
  refusedDemos?: readonly string[];
}> = [
  {
    spec: SC_OV_ONCOMING_GAP,
    objectiveId: "sc-ovg-pass",
    holdX: 4.06,
    fromY: 200,
    toY: 400,
    speedKmh: 40,
    passingDemo: "mistake-overstay",
    refusedDemos: ["mistake-tight-gap"],
  },
  {
    spec: SC_OV_ABORT,
    objectiveId: "sc-ova-pullout",
    holdX: 4.06,
    fromY: 120,
    toY: 300,
    speedKmh: 40,
    passingDemo: "mistake-push-on",
  },
  {
    spec: SC_OV_BAN_OVERTAKE,
    objectiveId: "sc-ovb-pass",
    holdX: 12.19,
    fromY: 210,
    toY: 340,
    speedKmh: 20,
    refusedDemos: ["mistake-overtake-in-zone", "mistake-early-jump"],
  },
];

describe("§2 the overtake is measured, not asserted", () => {
  for (const row of LANE_HOLDERS) {
    const hold = straightDrive(row.holdX, row.fromY, row.toY, row.speedKmh);

    it(`${row.spec.id}: a drive that never leaves its lane is refused ${row.objectiveId} at every rung`, () => {
      for (const level of rungs(row.spec)) {
        expect(completesOn(compiledZone(row.spec, row.objectiveId, level), hold), `L${level}`).toBe(
          false,
        );
      }
    });

    it(`${row.spec.id}: …and therefore cannot finish the lesson at all — the chain is sequential`, () => {
      // FAILS ON THE OLD BEHAVIOUR by construction: before this wave every mark
      // of these chains sat in the lane this drive holds, so the same drive
      // satisfied every one of them.
      const objectives = compileScenario(row.spec, 1).objectives;
      expect(objectives.some((o) => o.id === row.objectiveId)).toBe(true);
      const reachable = objectives.filter((o) => {
        const p = parseObjectiveParams(o);
        return p.kind === "reachZone" && completesOn(p, straightDrive(row.holdX, 0, 600, row.speedKmh));
      });
      expect(reachable.map((o) => o.id)).not.toContain(row.objectiveId);
    });

    it(`${row.spec.id}: THE OPPOSITE DIRECTION — the shadow completes ${row.objectiveId} at every rung`, () => {
      const shadow = shadowOf(row.spec);
      for (const level of rungs(row.spec)) {
        expect(replay(compiledZone(row.spec, row.objectiveId, level), shadow), `L${level}`).toBe(true);
      }
    });

    if (row.passingDemo) {
      it(`${row.spec.id}: the demo that DID use the lane still completes it (the fault is what follows)`, () => {
        const t = readTrace(demoOf(row.spec, row.passingDemo!).traceRef.path);
        expect(replay(compiledZone(row.spec, row.objectiveId, 3), t)).toBe(true);
      });
    }

    for (const demo of row.refusedDemos ?? []) {
      it(`${row.spec.id}: ${demo} never made this pass and is refused`, () => {
        const t = readTrace(demoOf(row.spec, demo).traceRef.path);
        expect(replay(compiledZone(row.spec, row.objectiveId, 3), t)).toBe(false);
      });
    }
  }

  it("sc-ovb-pass sits AFTER the В24 span, so the lesson cannot be passed by overtaking inside the ban", () => {
    const p = SC_OV_BAN_OVERTAKE.success.find((o) => o.id === "sc-ovb-pass")!.params;
    expect(p.kind).toBe("reachZone");
    if (p.kind !== "reachZone") return;
    // meta.scenario banZone of ov-ban-v1 is [90, 210]; the widest compiled disc
    // must clear its end, or the gate would invite the offence it teaches.
    const widest = Math.max(
      ...rungs(SC_OV_BAN_OVERTAKE).map((l) => compiledZone(SC_OV_BAN_OVERTAKE, "sc-ovb-pass", l).radiusM),
    );
    expect(p.y - widest).toBeGreaterThan(210);
  });
});

// ---------------------------------------------------------------------------
// §3 THE COMPILED DISC STAYS IN THE LANE ITS TITLE NAMES — at every rung
// ---------------------------------------------------------------------------

const LANE_TRUE_ROWS: ReadonlyArray<{ spec: ScenarioSpec; objectiveId: string; laneWord: string }> = [
  { spec: SC_MW_EMERGENCY_LANE, objectiveId: "sc-mwe-pass", laneWord: "лентата за движение" },
  { spec: SC_OV_BAN_OVERTAKE, objectiveId: "sc-ovb-pass", laneWord: "лявата лента" },
  { spec: SC_OV_BAN_OVERTAKE, objectiveId: "sc-ovb-finish", laneWord: "дясната лента" },
  { spec: SC_OV_BUS_LANE, objectiveId: "sc-ovbus-general", laneWord: "общата лента" },
  { spec: SC_OV_ONCOMING_GAP, objectiveId: "sc-ovg-pass", laneWord: "насрещната лента" },
  { spec: SC_OV_ONCOMING_GAP, objectiveId: "sc-ovg-finish", laneWord: "своята лента" },
  { spec: SC_OV_ABORT, objectiveId: "sc-ova-pullout", laneWord: "насрещната лента" },
  { spec: SC_OV_ABORT, objectiveId: "sc-ova-finish", laneWord: "своята лента" },
  { spec: SC_OV_RETURN_GAP, objectiveId: "sc-ovr-pass", laneWord: "насрещната лента" },
];

describe("§3 every row this wave touched keeps its lane claim on every rung", () => {
  for (const row of LANE_TRUE_ROWS) {
    it(`${row.spec.id}/${row.objectiveId} — «${row.laneWord}»`, () => {
      const title = row.spec.success.find((o) => o.id === row.objectiveId)!.titleBg;
      expect(
        title.toLowerCase(),
        `${row.objectiveId} stopped claiming a lane — this guard is then pinned to nothing`,
      ).toContain(row.laneWord);
      for (const level of rungs(row.spec)) {
        // FAILS ON THE OLD BEHAVIOUR: every one of these was authored at 4–6,
        // i.e. 6.00–9.00 at L1, all of them past this bound.
        expect(compiledZone(row.spec, row.objectiveId, level).radiusM, `L${level}`).toBeLessThanOrEqual(
          LANE_HALF_PITCH_M,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// §4 THE CLAUSES THAT WENT, AND WHY THEY COULD NOT BE GATED INSTEAD
// ---------------------------------------------------------------------------

describe("§4 the struck clauses stay struck", () => {
  it("«в големия прозорец» — an oncoming time gap; stepReachZone never sees another actor", () => {
    const title = SC_OV_ONCOMING_GAP.success.find((o) => o.id === "sc-ovg-finish")!.titleBg;
    expect(title).not.toContain("прозорец");
    // The duty is not amnestied: the counter-demos still cite the code, and the
    // runtime's corridor adjudicator convicts it on the live run.
    for (const m of SC_OV_ONCOMING_GAP.mistakes) {
      expect(m.codeRefs).toContain("OVERTAKE_INSUFFICIENT_GAP");
    }
  });

  it("«на чист път» — the state of the road at a moment the disc did not witness", () => {
    const title = SC_OV_ABORT.success.find((o) => o.id === "sc-ova-finish")!.titleBg;
    expect(title).not.toContain("чист път");
    expect(demoOf(SC_OV_ABORT, "mistake-push-on").codeRefs).toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(demoOf(SC_OV_ABORT, "mistake-head-on").codeRefs).toContain("COLLISION");
  });

  it("and neither lesson lost the manoeuvre from its task list — it moved to a gate", () => {
    expect(SC_OV_ONCOMING_GAP.success.map((o) => o.id)).toContain("sc-ovg-pass");
    expect(SC_OV_ABORT.success.map((o) => o.id)).toContain("sc-ova-pullout");
    expect(SC_OV_ONCOMING_GAP.success.find((o) => o.id === "sc-ovg-pass")!.titleBg).toContain(
      "насрещната лента",
    );
    expect(SC_OV_ABORT.success.find((o) => o.id === "sc-ova-pullout")!.titleBg).toContain(
      "насрещната лента",
    );
  });
});
