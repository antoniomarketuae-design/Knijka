/**
 * sc-sig-controller-postures:f7e046c4 [major], clause (a) — THE PRAISE FOR READING THE OFFICER MAY NOT DEPEND ON
 * WHEN THE CAR CROSSES.
 *
 * WHAT THE RIG SAW (rig-w3a, 2026-10-09, at a30c833 — five careful drives through /dev/drive-rig, the real
 * LessonPlayShell: belt on, at rest 3.5 m short of the line through chest-on and the raised arm, GO only after the
 * side-on flip, ≤ 24.7 км/ч). pc-L1, pc-L3 and phone-L1-optin carried «Похвали ✓ Правилно изпълнен сигнал на
 * регулировчика»; phone-L1 and phone-L3 carried no «Похвали» at all. Same drill, same driving, opposite sheets.
 *
 * THE CAUSE (read in code, reproduced below): `rules/engine.ts`, the `stopLineCrossed` arm, credits
 * CONTROLLER_SIGNAL_OBEYED only when the event's `lightState` is red / redYellow — the «forbidding lamp» gate written
 * for the two lessons where a LIVE, PINNED lamp competes with the officer. This lesson AUTHORS its lamps as out
 * («светофарът на кръстовището е ЗАГАСНАЛ … Тук важи само неговата поза», «Няма лампа за четене — четеш човека»)
 * and pins no lamp phase, yet the runtime stamped `lightStateOf(line)` — the cluster's natural 50 s cycle, counted on
 * the session clock — onto every crossing. So the praise was a function of the session time of the crossing: pc-L3
 * crossed 8.97 s after the flip at t 45.15 (credited), phone-L3 8.13 s after the flip at t 49.32 (not).
 *
 * WHAT THIS FILE HOLDS:
 *   §1 THE RIG'S OWN DRIVES, REPLAYED THROUGH THE LIVE CHAIN (`liveChainReplay`: the stack LessonScene builds, graded
 *      on the fixed 1/60 s session grid, ADR-014), each drive shifted by a pre-drive rest of 0…45 s so its crossing
 *      lands on every part of one full 50 s hidden lamp cycle, at L1 and L3, at 60 Hz and at the phone's recorded
 *      frame cadence: ONE sheet for every cell, and the praise and the route task agree on every cell.
 *   §2 THE REDUCER, ONE EVENT AT A TIME: the live-lamp gate unchanged (OBEYED on red / redYellow, nothing on green or
 *      yellow), CONTROLLER_SIGNAL_VIOLATED unchanged, and a dark-lamp proceed credited.
 *   §3 THE CENSUS: which lessons post an officer and which of them author the lamps dark.
 *   §4 THE LIVE-LAMP DRILLS THROUGH THE LIVE CHAIN: their crossings still carry the lamp, and praise follows red.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createRuleEngine, reduceTick } from "../../../rules/engine";
import type { SimTickEvent } from "../../../rules/types";
import { tick } from "../../../rules/__tests__/fixtures";
import type { ScenarioTrace, TraceIndicator, TraceSample } from "../../../traces/types";
import type { TrafficControllerSpec } from "../../../contracts";
import { compileScenario } from "../compile";
import { SC_SIGNAL_CONTROLLER_EVENT } from "../templates-signals";
import {
  SC_SIG_CONTROLLER_LIVE_EVENT,
  SC_SIG_CONTROLLER_POSTURES,
  SC_SIG_CONTROLLER_POSTURES_EVENT,
} from "../templates-signals2";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { parseScenarioTrace } from "../../../traces/parse";

const REPO_ROOT = path.join(process.cwd(), "..");
const SX = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8")) as unknown;
const RIG = JSON.parse(
  readFileSync(path.join(__dirname, "controller-dark-lamp-rig-w3a.fixture.json"), "utf-8"),
) as {
  drives: Record<
    string,
    {
      level: number;
      startedAtSec: number;
      flipAtSec: number;
      ruleEventsAtRig: Array<{ t: number; code: string }>;
      rows: Array<[number, number, number, number, number, number, TraceIndicator]>;
    }
  >;
  phoneFrameDeltasSec: number[];
};

const OBEYED = "CONTROLLER_SIGNAL_OBEYED";
const PRAISE_TITLE = "Правилно изпълнен сигнал на регулировчика";
/** sx-v1's south stop line (battery sx-district), m. */
const LINE_Y = -27.725;
/** The sx-v1 NS lamp cycle (SIGNAL_TIMING.cycleSec), s — the span the pre-drive rests must cover. */
const CYCLE_SEC = 50;
const DEAD_TIMES_SEC = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45] as const;
const LEVELS: ScenarioLevel[] = [1, 3];
const TIMEOUT = 900_000;

/** One rig drive as a pose tape, preceded by `deadSec` at rest on the spawn — a student who read longer. */
function rigTape(cell: string, deadSec: number): ScenarioTrace {
  const rows = RIG.drives[cell].rows;
  const samples: TraceSample[] = [];
  const first = rows[0];
  const at = (t: number, r: (typeof rows)[number], v: number): TraceSample => ({
    tSec: t,
    x: r[1],
    y: r[2],
    headingDeg: r[3],
    steerRad: 0,
    speedKmh: v,
    gear: r[5],
    indicator: r[6],
    brakeOn: v < 0.5,
    throttleOn: v >= 0.5,
  });
  samples.push(at(0, first, 0));
  for (const r of rows) {
    const t = r[0] + deadSec;
    if (t <= samples[samples.length - 1].tSec + 1e-9) continue;
    samples.push(at(t, r, r[4]));
  }
  return {
    meta: {
      scenarioId: SC_SIG_CONTROLLER_POSTURES.id,
      kind: "attempt",
      version: 1,
      durationSec: samples[samples.length - 1].tSec,
    },
    samples,
    events: [],
  };
}

/** The lamp phase the hidden cycle shows the NS approach at session time `t` (nothing pins it on this lesson). */
function hiddenNsPhase(t: number): string {
  const rt = createWorldRuntime(SX);
  rt.update(t);
  return rt.signalPhaseInfo("sx-n-c", 0).phase;
}

interface Cell {
  cell: string;
  dead: number;
  level: ScenarioLevel;
  cadence: "60Hz" | "phone";
  crossT: number | null;
  afterFlipSec: number | null;
  hidden: string | null;
  lamp: string | undefined;
  controller: string | undefined;
  violations: string[];
  commendations: string[];
  crossTaskDone: boolean;
  passed: boolean;
  score: number;
  debriefPraise: boolean;
}

/**
 * `ambient` false empties the ambient fleet. THE MATRIX NEEDS IT AND SAYS WHY: these are open-loop pose tapes, and a
 * rig drive that yielded to the cross stream closed-loop meets that stream at a different moment once its start is
 * shifted — measured on base, 14 of 130 shifted cells drove into a cross car (COLLISION), a sheet difference that is
 * the tape's and not the lamp's. The officer is a staged actor, not ambient, and stays.
 */
function replay(
  cell: string,
  dead: number,
  level: ScenarioLevel,
  cadence: Cell["cadence"],
  ambient = true,
): Cell {
  const compiled = compileScenario(SC_SIG_CONTROLLER_POSTURES, level);
  const lesson = ambient
    ? compiled
    : { ...compiled, traffic: { ...(compiled.traffic ?? {}), vehicleCount: 0, pedestrianCount: 0 } };
  let crossT: number | null = null;
  let lamp: string | undefined;
  let controller: string | undefined;
  const out = liveChainReplay({
    lesson,
    districtRaw: SX,
    trace: rigTape(cell, dead),
    holdAfterSec: 2,
    ...(cadence === "phone" ? { frameDeltas: RIG.phoneFrameDeltasSec } : {}),
    afterApply: ({ t, tick }) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight" && crossT === null) {
          crossT = t;
          lamp = e.lightState;
          controller = e.controller;
        }
      }
    },
  });
  const flip = RIG.drives[cell].flipAtSec - RIG.drives[cell].startedAtSec;
  // The runner latches the flip off the replay's own first moving point, so measure it the same way.
  const started = rigTape(cell, dead).samples.find((s) => Math.abs(s.speedKmh) >= 5)?.tSec ?? null;
  const cross = out.result.objectives.find((o) => o.id === "sc-sctp-cross");
  return {
    cell,
    dead,
    level,
    cadence,
    crossT,
    afterFlipSec: crossT !== null && started !== null ? +(crossT - (started + flip)).toFixed(2) : null,
    hidden: crossT !== null ? hiddenNsPhase(crossT) : null,
    lamp,
    controller,
    violations: out.violationCodes,
    commendations: out.commendationCodes,
    crossTaskDone: cross?.done === true,
    passed: out.result.passed,
    score: out.result.score,
    debriefPraise: out.debrief.includes(PRAISE_TITLE),
  };
}

/** What the student is shown: the codes on the sheet, the points, the verdict and the route tasks. */
function sheetOf(c: Cell): string {
  return JSON.stringify({
    violations: c.violations,
    commendations: c.commendations,
    score: c.score,
    passed: c.passed,
    crossTaskDone: c.crossTaskDone,
    debriefPraise: c.debriefPraise,
  });
}

describe("§1 the rig-w3a careful drives: one sheet, whenever the car crosses", () => {
  it("D=0 reproduces the rig: the live chain crosses where the rig crossed, the officer had released, and the praise now holds on every lens", () => {
    for (const cell of Object.keys(RIG.drives)) {
      const d = RIG.drives[cell];
      const c = replay(cell, 0, d.level as ScenarioLevel, cell.startsWith("phone") ? "phone" : "60Hz");
      // The rig's own crossing (the commendation stamp where there was one; else the log's line crossing).
      expect(c.crossT, cell).not.toBeNull();
      expect(c.controller, cell).toBe("proceed");
      expect(c.violations, cell).toEqual([]);
      expect(c.passed, cell).toBe(true);
      expect(c.commendations, cell).toContain(OBEYED);
      expect(c.debriefPraise, cell).toBe(true);
    }
  }, TIMEOUT);

  it(
    "every drive × a full lamp cycle of pre-drive rest × L1/L3 × 60 Hz/phone cadence: one sheet, praise ⇔ route task",
    () => {
      const cells: Cell[] = [];
      for (const cell of Object.keys(RIG.drives)) {
        for (const dead of DEAD_TIMES_SEC) {
          for (const level of LEVELS) {
            for (const cadence of ["60Hz", "phone"] as const) {
              // The phone cadence is the slow half of the matrix; run it on the drive's own lens only.
              if (cadence === "phone" && !cell.startsWith("phone")) continue;
              if (cadence === "60Hz" && cell.startsWith("phone") && dead % 10 !== 0) continue;
              cells.push(replay(cell, dead, level, cadence, false));
            }
          }
        }
      }
      // Measurement dump for the lane report (opt-in; nothing graded reads it).
      if (process.env.PRAISELAMP_DUMP) writeFileSync(process.env.PRAISELAMP_DUMP, JSON.stringify(cells, null, 1));
      // THE SPAN IS REAL: the crossings landed on both a forbidding and a permitting hidden phase — the input that
      // split the rig's sheets — and on every part of one cycle.
      const hidden = new Set(cells.map((c) => c.hidden));
      expect(hidden.has("red")).toBe(true);
      expect(hidden.has("green")).toBe(true);
      const crossMod = cells.map((c) => (c.crossT ?? 0) % CYCLE_SEC).sort((a, b) => a - b);
      expect(crossMod[crossMod.length - 1] - crossMod[0]).toBeGreaterThan(CYCLE_SEC * 0.8);
      // …and the crossings sit 6.9–17 s after the flip (the rig's own five), 8.0–9.0 s among them.
      const after = cells.map((c) => c.afterFlipSec ?? NaN);
      expect(Math.min(...after)).toBeLessThan(8.2);
      expect(Math.max(...after)).toBeGreaterThan(8.9);
      // ONE SHEET.
      const sheets = new Map<string, Cell[]>();
      for (const c of cells) sheets.set(sheetOf(c), [...(sheets.get(sheetOf(c)) ?? []), c]);
      const summary = [...sheets.entries()].map(([s, cs]) => ({
        sheet: s,
        n: cs.length,
        sample: cs.slice(0, 3).map((c) => `${c.cell}/D${c.dead}/L${c.level}/${c.cadence}@${c.crossT}(${c.hidden})`),
      }));
      expect(summary.length, JSON.stringify(summary, null, 1)).toBe(1);
      // …and it is the praised one, not a sheet that agrees by praising nobody.
      for (const c of cells) {
        expect(c.commendations, `${c.cell}/D${c.dead}`).toContain(OBEYED);
        expect(c.violations).toEqual([]);
        // THE PRAISE AND THE ROUTE TASK AGREE (the engine comment's own contract): the task that grades this
        // crossing is `requireControllerProceed`, and it completed on every cell the praise did.
        expect(c.crossTaskDone).toBe(c.commendations.includes(OBEYED));
        // No hidden phase reaches the graded event: the lamps are authored dark.
        expect(c.lamp).toBeUndefined();
      }
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// §2 the reducer, one event at a time
// ---------------------------------------------------------------------------

function codesFor(event: SimTickEvent): string[] {
  const r = reduceTick(createRuleEngine(), tick(10, { speedKmh: 20, events: [event] }));
  return r.events.map((e) => `${e.kind}:${e.code}`);
}

describe("§2 the reducer: live-lamp gate unchanged, dark-lamp proceed credited", () => {
  const base = { kind: "stopLineCrossed", control: "trafficLight" } as const;

  it("LIVE lamp + proceed: credited on red and redYellow, silent on green and yellow (the authored hierarchy teach)", () => {
    expect(codesFor({ ...base, lightState: "red", controller: "proceed" })).toEqual([`commendation:${OBEYED}`]);
    expect(codesFor({ ...base, lightState: "redYellow", controller: "proceed" })).toEqual([`commendation:${OBEYED}`]);
    expect(codesFor({ ...base, lightState: "green", controller: "proceed" })).toEqual([]);
    expect(codesFor({ ...base, lightState: "yellow", controller: "proceed" })).toEqual([]);
  });

  it("DARK lamps + proceed: credited, with no lamp phase on the event", () => {
    expect(codesFor({ ...base, lampsDark: true, controller: "proceed" })).toEqual([`commendation:${OBEYED}`]);
  });

  it("CONTROLLER_SIGNAL_VIOLATED unchanged: a halt convicts on every lamp, lit or dark, and is never praised", () => {
    for (const lightState of ["red", "redYellow", "green", "yellow"] as const) {
      expect(codesFor({ ...base, lightState, controller: "halt" })).toEqual(["violation:CONTROLLER_SIGNAL_VIOLATED"]);
    }
    expect(codesFor({ ...base, lampsDark: true, controller: "halt" })).toEqual(["violation:CONTROLLER_SIGNAL_VIOLATED"]);
  });

  it("no officer: the lamp grades exactly as before (a dark flag without a controller credits nothing)", () => {
    expect(codesFor({ ...base, lightState: "red" })).toEqual(["violation:RED_LIGHT_CROSSED"]);
    expect(codesFor({ ...base, lightState: "green" })).toEqual([]);
    expect(codesFor({ ...base, lampsDark: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §3 the census of posted officers
// ---------------------------------------------------------------------------

describe("§3 every lesson that posts a регулировчик, and which of them author the lamps dark", () => {
  const officers = SCENARIO_TEMPLATES.flatMap((s) =>
    (s.staged ?? [])
      .filter((e): e is TrafficControllerSpec => e.kind === "trafficController")
      .map((e) => ({ id: s.id, lamps: e.lamps ?? "live", pinned: e.signalOffsetSec !== undefined })),
  );

  it("three lessons post one; only sc-sig-controller-postures authors its lamps out — and it pins no lamp phase", () => {
    expect(officers).toEqual(
      expect.arrayContaining([
        { id: "sc-signal-controller", lamps: "live", pinned: true },
        { id: "sc-sig-controller-live", lamps: "live", pinned: true },
        { id: "sc-sig-controller-postures", lamps: "dark", pinned: false },
      ]),
    );
    expect(officers).toHaveLength(3);
    expect(SC_SIG_CONTROLLER_POSTURES_EVENT.lamps).toBe("dark");
    expect(SC_SIGNAL_CONTROLLER_EVENT.lamps).toBeUndefined();
    expect(SC_SIG_CONTROLLER_LIVE_EVENT.lamps).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §4 the live-lamp drills keep their lamp, through the live chain
// ---------------------------------------------------------------------------

describe("§4 the two live-lamp drills: every crossing still carries the lamp it was shown, never `lampsDark`", () => {
  const live = SCENARIO_TEMPLATES.filter((s) =>
    (s.staged ?? []).some((e) => e.kind === "trafficController" && (e as TrafficControllerSpec).lamps !== "dark"),
  );

  it(
    "sc-signal-controller and sc-sig-controller-live, every committed demo at L1: lamp on the event, praise only on red",
    () => {
      expect(live.map((s) => s.id).sort()).toEqual(["sc-sig-controller-live", "sc-signal-controller"]);
      for (const spec of live) {
        const demos = [spec.shadow!.path, ...(spec.mistakes ?? []).map((m) => m.traceRef.path)];
        for (const p of demos) {
          const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, p), "utf-8")))!;
          const crossings: Array<{ lightState?: string; lampsDark?: true; controller?: string }> = [];
          const out = liveChainReplay({
            lesson: compileScenario(spec, 1),
            districtRaw: SX,
            trace,
            holdAfterSec: 2,
            afterApply: ({ tick }) => {
              for (const e of tick.events)
                if (e.kind === "stopLineCrossed" && e.control === "trafficLight") crossings.push(e);
            },
          });
          expect(crossings.length, p).toBeGreaterThan(0);
          for (const c of crossings) {
            expect(c.lampsDark, p).toBeUndefined();
            expect(c.lightState, p).toBeDefined();
          }
          const praisedOnRed = crossings.some(
            (c) => c.controller === "proceed" && (c.lightState === "red" || c.lightState === "redYellow"),
          );
          expect(out.commendationCodes.includes(OBEYED), p).toBe(praisedOnRed);
        }
      }
    },
    TIMEOUT,
  );
});
