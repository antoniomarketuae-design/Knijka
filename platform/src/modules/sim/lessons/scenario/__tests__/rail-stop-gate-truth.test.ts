/**
 * RAIL — THE STOP GATE, AND THE TWO CERTIFICATES ABOVE IT (sweep 161, part A;
 * `.audit-frames/sweep161/sc-rx-unguarded/mobile-right/04-t093s.png` and
 * `.audit-frames/sweep161/sc-rx-barrier-drop/pc-right/01-arrival.png`).
 *
 * Three shipped rows of `templates-rail.ts` said more than their disc could see,
 * and one of them said it against the rule engine's own verdict on the same
 * drive:
 *
 *   sc-rxu-stop   «Спри напълно … колелата неподвижни, не „почти спрях"» on a
 *                 gate that accepted 5 км/ч — a roll, which is what „почти
 *                 спрях" means. §1 replays a 4 км/ч line-roll through the
 *                 production stack and shows the ✓ and the disqualifying
 *                 RAIL_CROSSING_VIOLATION "no-stop" landing on ONE drive.
 *   sc-rxd-wait   «Изчакай зад стоп-линията пред СПУСКАЩАТА СЕ бариера» on a
 *                 map whose arm is world data, raised and motionless for the
 *                 first 20 s. §2 banks the rung at t ≈ 14.8 s and pins the
 *                 vocabulary that may never come back.
 *   sc-rxg-finish / sc-rxd-finish
 *                 «Премини прелеза СЛЕД ВДИГАНЕТО …» — §3 completes both discs
 *                 with the templates' OWN barrier-running ❌ recordings, while
 *                 the arm is still down.
 *
 * §4 is the other direction, and it is the half that keeps this from being a
 * tightening for its own sake: every one of the nine committed rail recordings
 * must reach the gate at a genuine standstill, at every authored rung, so the
 * cap move refuses nobody who actually stopped.
 *
 * WHY THE REMEDY IS „SAY LESS" FOR TWO OF THEM AND „MEASURE MORE" FOR THE
 * THIRD. A standstill is on the tick (`speedKmh`) and a place is on the tick
 * (`position`), so `sc-rxu-stop`'s claim can be MADE TRUE by the cap and is.
 * A barrier's phase and a crossing's occupancy are not: `stepReachZone(params,
 * prevState, tick)` never receives `railBarred`, so no value of any param can
 * redeem «след вдигането» — that claim is retired, exactly as cdb2f71 retired
 * sc-rxtl-turn's and sc-rxti-clear's in this same file, and the duty keeps its
 * grader in the rule engine's `entered-barred` arm (still cited by both demos,
 * asserted below).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import type { SimTick } from "../../../rules";
import type { ScenarioTrace } from "../../../traces/types";
import { applyTick, createLessonSession } from "../../engine";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { LessonSessionState, ObjectiveParams } from "../../types";
import { compileScenario } from "../compile";
import { SC_RX_BARRIER_DROP, SC_RX_GUARDED, SC_RX_UNGUARDED } from "../templates-rail";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { makeTick } from "../../__tests__/fixtures";

/** The single northbound lane centre shared by rx-unguarded/guarded/drop-v1. */
const X_LANE = 4.06;
/** meta.scenario.railCrossing: stop line, band span (all three rx-*-v1 maps). */
const STOP_LINE_Y = 145;
const BAND_FROM = 150;
const BAND_TO = 156;

const RAIL_SPECS: readonly ScenarioSpec[] = [SC_RX_UNGUARDED, SC_RX_GUARDED, SC_RX_BARRIER_DROP];

function readTrace(specId: string, basename: string): ScenarioTrace {
  return JSON.parse(
    readFileSync(join(process.cwd(), "..", "content", "traces", specId, basename), "utf8"),
  ) as ScenarioTrace;
}

function traceTicks(trace: ScenarioTrace): SimTick[] {
  return trace.samples.map((s) =>
    makeTick({
      t: s.tSec,
      speedKmh: s.speedKmh,
      position: { x: s.x, y: s.y },
      headingDeg: s.headingDeg,
      gear: s.gear,
      indicator: s.indicator,
    }),
  );
}

/** Replay through the SHIPPED evaluator; the session time the gate first ticks. */
function doneAtSec(params: ObjectiveParams, ticks: readonly SimTick[]): number | null {
  let state = createEvalState(params);
  for (const tk of ticks) {
    const r = stepObjective(params, state, tk);
    state = r.evalState;
    if (r.done) return tk.t;
  }
  return null;
}

function compiledParams(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  objectiveId: string,
): ObjectiveParams {
  const objective = compileScenario(spec, level).objectives.find((o) => o.id === objectiveId);
  if (!objective) throw new Error(`${spec.id} L${level} lost ${objectiveId}`);
  return parseObjectiveParams(objective);
}

function authoredTitle(spec: ScenarioSpec, objectiveId: string): string {
  const row = spec.success.find((o) => o.id === objectiveId);
  if (!row) throw new Error(`${spec.id} lost ${objectiveId}`);
  return row.titleBg;
}

// ---------------------------------------------------------------------------
// §1 THE GREEN TICK AND THE DISQUALIFICATION, ON ONE DRIVE
// ---------------------------------------------------------------------------

/**
 * The band phase the live runtime reports at a given y on an rx-*-v1 street
 * (worldRuntime zone reducer: "approach" inside the run-up, "on" over the
 * authored span, absent elsewhere). 25 m of approach is longer than the
 * `stopRecencySec = 6` window needs at these speeds and is not a tuned number —
 * §1's two drives differ only in the speed at the line.
 */
function railPhaseAt(y: number): "approach" | "on" | undefined {
  if (y >= BAND_FROM && y <= BAND_TO) return "on";
  if (y >= BAND_FROM - 25 && y < BAND_FROM) return "approach";
  return undefined;
}

/**
 * One northbound drive up rx-unguarded-v1: cruise 30, brake to `lineKmh` at the
 * СТОП-cross line, hold it for `holdSec`, then cross the band and run out the
 * section. `lineKmh = 4` is the rolling stop; `lineKmh = 0` is the drilled one.
 */
function lineStopDrive(lineKmh: number, holdSec: number): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  const push = (y: number, speedKmh: number) => {
    const phase = railPhaseAt(y);
    out.push(
      makeTick({
        t,
        speedKmh,
        position: { x: X_LANE, y },
        headingDeg: 0,
        gear: 1,
        ...(phase !== undefined ? { railCrossing: phase } : {}),
      }),
    );
    t += 0.2;
  };
  for (let y = 20; y < 120; y += 2) push(y, 30);
  for (let y = 120; y < STOP_LINE_Y; y += 1) {
    push(y, 30 - ((y - 120) / (STOP_LINE_Y - 120)) * (30 - lineKmh));
  }
  for (let k = 0; k < Math.round(holdSec / 0.2); k++) push(STOP_LINE_Y, lineKmh);
  for (let y = STOP_LINE_Y + 1; y <= 200; y += 1) push(y, Math.min(30, lineKmh + (y - STOP_LINE_Y) * 2));
  for (let y = 202; y <= 290; y += 2) push(y, 30);
  push(290, 0);
  return out;
}

function runSession(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  ticks: readonly SimTick[],
): LessonSessionState {
  let session = createLessonSession(compileScenario(spec, level));
  for (const tk of ticks) session = applyTick(session, tk).state;
  return session;
}

function railDetails(session: LessonSessionState): string[] {
  return session.events
    .filter(
      (e): e is Extract<typeof e, { kind: "violation" }> =>
        e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION",
    )
    .map((e) => String((e as { detail?: string }).detail));
}

function objectiveDone(session: LessonSessionState, id: string): boolean {
  return session.objectives.find((o) => o.spec.id === id)?.status === "done";
}

describe("§1 sc-rxu-stop grades the same standstill the rule engine does", () => {
  it("the 4 км/ч line-roll is convicted «no-stop» — so it may not also be ticked «Спри напълно»", () => {
    const session = runSession(SC_RX_UNGUARDED, 3, lineStopDrive(4, 3));

    // The rule engine's half, unchanged and unchallenged: чл. 51–53's full stop
    // is measured off the Б2 ledger at `fullStopMaxSpeedKmh`, and 4 км/ч is not
    // one. This is the ОПАСНА that fails the whole lesson.
    expect(railDetails(session)).toEqual(["no-stop"]);

    // …and therefore the drill's own stop gate must refuse it. At the shipped
    // cap of 5 this was `true`, and the student read «✓ Спри напълно на
    // стоп-линията преди релсите — колелата неподвижни» in the same protocol
    // that printed «Преминаване без спиране −10, НЕИЗДЪРЖАН».
    expect(objectiveDone(session, "sc-rxu-stop")).toBe(false);
  });

  it("the drilled full stop earns it, and is convicted of nothing", () => {
    const session = runSession(SC_RX_UNGUARDED, 3, lineStopDrive(0, 3));
    expect(railDetails(session)).toEqual([]);
    expect(objectiveDone(session, "sc-rxu-stop")).toBe(true);
    expect(objectiveDone(session, "sc-rxu-finish")).toBe(true);
  });

  it("every «спри/изчакай» gate of the family carries the rule engine's own stop number", () => {
    const rows: Array<[ScenarioSpec, string]> = [
      [SC_RX_UNGUARDED, "sc-rxu-stop"],
      [SC_RX_GUARDED, "sc-rxg-wait"],
      [SC_RX_BARRIER_DROP, "sc-rxd-wait"],
    ];
    for (const [spec, id] of rows) {
      for (const rung of spec.levels) {
        const params = compiledParams(spec, rung.level, id);
        expect(params.kind).toBe("reachZone");
        if (params.kind !== "reachZone") continue;
        // Not „≤ the halt band" (that is 8 km/h and still a roll): the SAME
        // threshold engine.ts reads a qualifying full stop at. One number.
        expect(
          params.maxSpeedKmh,
          `${spec.id} L${rung.level} ${id} may not credit a roll`,
        ).toBe(DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §2 THE BARRIER'S STATE IS NOT ON THE TICK THE DISC READS
// ---------------------------------------------------------------------------

/**
 * rx-drop-v1's timetable, mirrored from the committed map (meta.scenario
 * .railCrossing.barrier): the arm is RAISED for [0, 20) of every 90 s session
 * second and down for [20, 60). Anything the gate certifies before t = 20 was
 * certified in front of a motionless raised arm.
 */
const DROP_BARRIER_DOWN_FROM_SEC = 20;

/** A brisk but lawful approach on rx-drop-v1: spawn (4.06, 15) → the stop line
 *  130 m later on a 50 км/ч street, braking to `lineKmh` and holding. */
function briskDropApproach(lineKmh: number): SimTick[] {
  const out: SimTick[] = [];
  let y = 15;
  let v = 0; // m/s
  let t = 0;
  const dt = 0.1;
  for (let i = 0; i < 4000 && y < STOP_LINE_Y; i++) {
    const braking = STOP_LINE_Y - y <= (v * v) / (2 * 3.0) + 1;
    v = braking
      ? Math.max(Math.max(lineKmh / 3.6, 0.15), v - 3.0 * dt)
      : Math.min(50 / 3.6, v + 2.2 * dt);
    y += v * dt;
    t += dt;
    out.push(makeTick({ t, speedKmh: v * 3.6, position: { x: X_LANE, y }, headingDeg: 0, gear: 1 }));
  }
  for (let k = 0; k < 40; k++) {
    t += dt;
    out.push(makeTick({ t, speedKmh: lineKmh, position: { x: X_LANE, y }, headingDeg: 0, gear: 1 }));
  }
  return out;
}

/** Words that name what the ARM is doing. `stepReachZone` never sees
 *  `railBarred`, so no reachZone title of this family may use one. Substrings —
 *  JS `\b` is ASCII-only and misfires on Cyrillic. «бариера» itself is NOT
 *  here: naming the barrier as scenery is honest (sc-rxg-wait does), and the
 *  ban is on its PHASE. */
const BARRIER_PHASE_CLAIMS: ReadonlyArray<{ marker: string; claimBg: string }> = [
  { marker: "спускащ", claimBg: "че бариерата се е спускала" },
  { marker: "вдиган", claimBg: "че бариерата се е вдигнала" },
  { marker: "вдигнат", claimBg: "състоянието на бариерата" },
  { marker: "спусна", claimBg: "че бариерата е била спусната" },
];

const barrierPhaseClaimIn = (titleBg: string) =>
  BARRIER_PHASE_CLAIMS.find((c) => titleBg.toLowerCase().includes(c.marker));

describe("§2 the drop drill's wait gate is banked while the arm is still up", () => {
  it("a brisk lawful approach completes it before the barrier has moved at all", () => {
    for (const rung of SC_RX_BARRIER_DROP.levels) {
      const params = compiledParams(SC_RX_BARRIER_DROP, rung.level, "sc-rxd-wait");
      const at = doneAtSec(params, briskDropApproach(0));
      expect(at, `sc-rxd-wait L${rung.level} unreachable by a lawful full stop`).not.toBeNull();
      expect(
        at!,
        `sc-rxd-wait L${rung.level} banked at ${String(at)}s — the arm starts down at ` +
          `${DROP_BARRIER_DOWN_FROM_SEC}s, so nothing was descending`,
      ).toBeLessThan(DROP_BARRIER_DOWN_FROM_SEC);
    }
  });

  it("even the shipped shadow, scripted to MEET the descent, banks it before t=20", () => {
    const params = compiledParams(SC_RX_BARRIER_DROP, 3, "sc-rxd-wait");
    const at = doneAtSec(params, traceTicks(readTrace(SC_RX_BARRIER_DROP.id, "shadow-correct.trace.json")));
    expect(at).not.toBeNull();
    expect(at!).toBeLessThan(DROP_BARRIER_DOWN_FROM_SEC);
  });

  it("…and the rolling creep the old cap credited is refused outright", () => {
    const params = compiledParams(SC_RX_BARRIER_DROP, 3, "sc-rxd-wait");
    expect(doneAtSec(params, briskDropApproach(4))).toBeNull();
  });
});

describe("§2b no rail success title may name the barrier's phase", () => {
  // The receipts. A drift net is worth exactly the words it knows, so the two
  // strings this change removed are replayed through the matcher first.
  it("the matcher catches every phrase that was retired", () => {
    for (const was of [
      "Изчакай зад стоп-линията пред спускащата се бариера",
      "Премини прелеза след вдигането и стигни края",
    ]) {
      expect(barrierPhaseClaimIn(was), `«${was}» would slip past the net`).toBeDefined();
    }
    // …and does not fire on the honest scenery mention it must keep allowing.
    expect(barrierPhaseClaimIn("Изчакай зад стоп-линията пред бариерата")).toBeUndefined();
    expect(barrierPhaseClaimIn("Премини прелеза и стигни края на отсечката")).toBeUndefined();
  });

  it("no authored row, and no compiled rung, claims one", () => {
    const offenders: string[] = [];
    for (const spec of RAIL_SPECS) {
      for (const row of spec.success) {
        const claim = barrierPhaseClaimIn(row.titleBg);
        if (claim) offenders.push(`${spec.id}/${row.id} — «${row.titleBg}» certifies ${claim.claimBg}`);
      }
      for (const rung of spec.levels) {
        for (const obj of compileScenario(spec, rung.level).objectives) {
          const claim = barrierPhaseClaimIn(obj.titleBg);
          if (claim) {
            offenders.push(`${spec.id} L${rung.level} ${obj.id} — «${obj.titleBg}» certifies ${claim.claimBg}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §3 THE PROOF, ON THE TEMPLATES' OWN ❌ RECORDINGS
// ---------------------------------------------------------------------------

/** Each finish row with a drive that crossed while the arm was DOWN — the very
 *  recording the template ships as its counter-demo for that act. */
const LIFT_BLIND: ReadonlyArray<{
  spec: ScenarioSpec;
  objectiveId: string;
  mistakeTrace: string;
  wasBg: string;
}> = [
  {
    spec: SC_RX_GUARDED,
    objectiveId: "sc-rxg-finish",
    mistakeTrace: "mistake-run-barrier.trace.json",
    wasBg: "Премини прелеза след вдигането и стигни края",
  },
  {
    spec: SC_RX_GUARDED,
    objectiveId: "sc-rxg-finish",
    mistakeTrace: "mistake-creep-barred.trace.json",
    wasBg: "Премини прелеза след вдигането и стигни края",
  },
  {
    spec: SC_RX_BARRIER_DROP,
    objectiveId: "sc-rxd-finish",
    mistakeTrace: "mistake-dive-barrier.trace.json",
    wasBg: "Премини прелеза след вдигането и стигни края",
  },
];

describe("§3 the finish discs cannot see the lift, so their titles no longer claim it", () => {
  for (const row of LIFT_BLIND) {
    it(`${row.objectiveId}: ${row.mistakeTrace} crossed a BARRED crossing and still completes it`, () => {
      // The template still calls this drive the fatal one, and still bills it —
      // that is where the barrier is graded, and it must stay there for the
      // retitle to be honesty rather than a quiet amnesty.
      const demo = row.spec.mistakes.find((m) => m.traceRef.path.endsWith(row.mistakeTrace));
      expect(demo, `${row.spec.id} lost its ${row.mistakeTrace} demo`).toBeDefined();
      expect(demo!.codeRefs).toContain("RAIL_CROSSING_VIOLATION");

      const ticks = traceTicks(readTrace(row.spec.id, row.mistakeTrace));
      for (const level of [1, 3] as const) {
        expect(
          doneAtSec(compiledParams(row.spec, level, row.objectiveId), ticks),
          `${row.spec.id} L${level} ${row.objectiveId} on ${row.mistakeTrace}`,
        ).not.toBeNull();
      }
    });

    it(`${row.objectiveId}: therefore its title says nothing about the arm`, () => {
      const titleBg = authoredTitle(row.spec, row.objectiveId);
      const claim = barrierPhaseClaimIn(titleBg);
      expect(
        claim,
        `«${titleBg}» is back to certifying ${claim?.claimBg ?? ""} — the drive above ` +
          `completes this gate under a barrier that never lifted (was: «${row.wasBg}»)`,
      ).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// §4 THE OTHER DIRECTION — the cap refuses nobody who actually stopped
// ---------------------------------------------------------------------------

/** Every committed rail recording, with the gate it must reach (or not). */
const SHIPPED_DRIVES: ReadonlyArray<{
  spec: ScenarioSpec;
  gateId: string;
  trace: string;
  /** did this drive come to rest at the line? then the gate owes it a tick */
  stopsAtLine: boolean;
}> = [
  { spec: SC_RX_UNGUARDED, gateId: "sc-rxu-stop", trace: "shadow-correct", stopsAtLine: true },
  { spec: SC_RX_UNGUARDED, gateId: "sc-rxu-stop", trace: "mistake-stop-on-track", stopsAtLine: true },
  { spec: SC_RX_UNGUARDED, gateId: "sc-rxu-stop", trace: "mistake-roll-through", stopsAtLine: false },
  { spec: SC_RX_GUARDED, gateId: "sc-rxg-wait", trace: "shadow-correct", stopsAtLine: true },
  { spec: SC_RX_GUARDED, gateId: "sc-rxg-wait", trace: "mistake-creep-barred", stopsAtLine: true },
  { spec: SC_RX_GUARDED, gateId: "sc-rxg-wait", trace: "mistake-run-barrier", stopsAtLine: false },
  { spec: SC_RX_BARRIER_DROP, gateId: "sc-rxd-wait", trace: "shadow-correct", stopsAtLine: true },
  { spec: SC_RX_BARRIER_DROP, gateId: "sc-rxd-wait", trace: "mistake-dive-barrier", stopsAtLine: false },
  // Enters the band while the arm is still up and freezes ON the rails — it
  // never rests at the LINE, so this gate owes it nothing (the kill is the rule
  // engine's «stopped-on-track»).
  { spec: SC_RX_BARRIER_DROP, gateId: "sc-rxd-wait", trace: "mistake-stop-on-track", stopsAtLine: false },
];

describe("§4 the shipped recordings are untouched by the number", () => {
  for (const row of SHIPPED_DRIVES) {
    it(`${row.spec.id}/${row.trace} → ${row.gateId} ${row.stopsAtLine ? "still ticks" : "still refused"} at every rung`, () => {
      const ticks = traceTicks(readTrace(row.spec.id, `${row.trace}.trace.json`));
      for (const rung of row.spec.levels) {
        const at = doneAtSec(compiledParams(row.spec, rung.level, row.gateId), ticks);
        expect(at !== null, `${row.spec.id} L${rung.level} ${row.gateId} on ${row.trace}`).toBe(
          row.stopsAtLine,
        );
      }
    });
  }

  it("and the drives that DO earn it reach a genuine standstill inside the disc", () => {
    for (const row of SHIPPED_DRIVES) {
      if (!row.stopsAtLine) continue;
      const trace = readTrace(row.spec.id, `${row.trace}.trace.json`);
      const p = compiledParams(row.spec, 3, row.gateId);
      if (p.kind !== "reachZone") throw new Error("reachZone expected");
      let min = Number.POSITIVE_INFINITY;
      for (const s of trace.samples) {
        if (Math.hypot(s.x - p.x, s.y - p.y) <= p.radiusM) min = Math.min(min, s.speedKmh);
      }
      expect(min, `${row.spec.id}/${row.trace} never stops inside the disc`).toBeLessThanOrEqual(
        DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh,
      );
    }
  });
});
