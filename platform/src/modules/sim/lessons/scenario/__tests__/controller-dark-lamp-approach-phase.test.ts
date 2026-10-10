/**
 * sc-sig-controller-postures:f7e046c4 — the APPROACH half of `lamps: "dark"`, pinned through the live chain.
 *
 * The praiselamp lane made the junction whose lamps the lesson authors as OUT carry no hidden phase on the CROSSING
 * (`controller-dark-lamp-praise.test.ts`). The same lane also changed the APPROACH context the runtime publishes on
 * every tick (`tick.nextStopLineState`, worldRuntime.ts) — and its verifier found two mutants of that branch that no
 * committed test could see:
 *
 *   V1  the released approach reads "red" instead of nothing. Every signal cause the approach context feeds would come
 *       back at a dark junction, constant in time: the stopped car is a lawful «червен сигнал» wait
 *       (finish.ts `yieldReasonAt` → "redLight"), a needless stop / ban-zone stop / harsh brake is excused by a red
 *       nobody is shown, the overshoot window reads a red. Pinned below on the tick AND on the session's own wait.
 *   V9  the halted approach reads nothing instead of "red". Under a halt "red" is not a lamp, it is the EFFECTIVE
 *       signal (JU-18): it is what makes the car standing at the line for the officer a held wait, which is the hold
 *       the controller drills' wait card (advisor.ts `controllerWaitAdvisorPrompt`) stands on. Pinned below on the
 *       tick AND on the held wait. (Which REASON the voice gives for that wait — «червен сигнал» at a lamp the text
 *       calls ЗАГАСНАЛ — is the lane's reported, owed item (b), and is deliberately NOT pinned here.)
 *
 * THE ORACLE FOR «HALTED» / «RELEASED» IS THE PRODUCT'S OWN TIMETABLE, not the field under test: the officer's flip is
 * latched by `TrafficControllerRunner` on the first director input at ≥ 5 km/h (runners.ts CONTROLLER_DRIVE_START_KMH,
 * copied by value as `traffic-controller-clock.test.ts` does) plus the template's `flipAtSec`; ticks within
 * FLIP_MARGIN_SEC of that instant are not judged. The crossing event's own `controller: "proceed"` cross-checks it.
 *
 * The drives are the rig-w3a careful drives (the lane's fixture), each at its own level, 60 Hz, ambient fleet as the
 * live lesson has it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ScenarioTrace, TraceIndicator, TraceSample } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_SIG_CONTROLLER_POSTURES, SC_SIG_CONTROLLER_POSTURES_EVENT } from "../templates-signals2";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";

const REPO_ROOT = path.join(process.cwd(), "..");
const SX = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8")) as unknown;
const RIG = JSON.parse(
  readFileSync(path.join(__dirname, "controller-dark-lamp-rig-w3a.fixture.json"), "utf-8"),
) as {
  drives: Record<
    string,
    { level: number; rows: Array<[number, number, number, number, number, number, TraceIndicator]> }
  >;
};

/** runners.ts CONTROLLER_DRIVE_START_KMH (module-private; copied by value). */
const DRIVE_START_KMH = 5;
const FLIP_MARGIN_SEC = 0.25;
const TIMEOUT = 600_000;

function rigTape(cell: string): ScenarioTrace {
  const rows = RIG.drives[cell].rows;
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
  const samples: TraceSample[] = [at(0, rows[0], 0)];
  for (const r of rows) {
    if (r[0] <= samples[samples.length - 1].tSec + 1e-9) continue;
    samples.push(at(r[0], r, r[4]));
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

interface ApproachPoint {
  t: number;
  state: string | undefined;
  speedKmh: number;
  holding: boolean;
  reason: string | null;
}

function approach(cell: string) {
  const level = RIG.drives[cell].level as ScenarioLevel;
  let startedAt: number | null = null;
  let crossT: number | null = null;
  let crossController: string | undefined;
  const points: ApproachPoint[] = [];
  liveChainReplay({
    lesson: compileScenario(SC_SIG_CONTROLLER_POSTURES, level),
    districtRaw: SX,
    trace: rigTape(cell),
    holdAfterSec: 2,
    afterApply: ({ t, tick, step }) => {
      if (startedAt === null && Math.abs(tick.speedKmh) >= DRIVE_START_KMH) startedAt = t;
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight" && crossT === null) {
          crossT = t;
          crossController = e.controller;
        }
      }
      if (crossT === null && tick.nextStopLineControl === "trafficLight") {
        const w = step.state.yieldWait;
        points.push({
          t,
          state: tick.nextStopLineState,
          speedKmh: tick.speedKmh,
          holding: w?.holding === true,
          reason: w?.reason ?? null,
        });
      }
    },
  });
  expect(startedAt, cell).not.toBeNull();
  const flipAt = (startedAt as unknown as number) + SC_SIG_CONTROLLER_POSTURES_EVENT.flipAtSec!;
  expect(crossT, cell).not.toBeNull();
  expect(crossT as unknown as number, cell).toBeGreaterThan(flipAt);
  expect(crossController, cell).toBe("proceed");
  return {
    halted: points.filter((p) => p.t < flipAt - FLIP_MARGIN_SEC),
    released: points.filter((p) => p.t > flipAt + FLIP_MARGIN_SEC),
  };
}

describe("dark-lamp approach context (sc-sig-controller-postures:f7e046c4, praiselamp verifier V1 / V9)", () => {
  it(
    "V1 — after the officer releases, the dark-lamp approach carries NO phase, and the car standing at the line is not a «червен сигнал» wait",
    () => {
      for (const cell of Object.keys(RIG.drives)) {
        const { released } = approach(cell);
        // The window is real: the rig waited at the line through the flip and drove on after it.
        expect(released.length, cell).toBeGreaterThan(60);
        const standing = released.filter((p) => Math.abs(p.speedKmh) < 0.5);
        expect(standing.length, `${cell}: standing ticks after the release`).toBeGreaterThan(0);
        const phased = released.filter((p) => p.state !== undefined);
        expect(
          phased.map((p) => `${p.t.toFixed(3)}:${p.state}`).slice(0, 5),
          `${cell}: released dark-lamp approach ticks that carry a lamp phase`,
        ).toEqual([]);
        const redWait = released.filter((p) => p.reason === "redLight");
        expect(
          redWait.map((p) => p.t.toFixed(3)).slice(0, 5),
          `${cell}: released dark-lamp ticks the session calls a red-light wait`,
        ).toEqual([]);
      }
    },
    TIMEOUT,
  );

  it(
    "V9 — under the halt, the dark-lamp approach still reads 'red' (the effective signal), so the car standing at the line for the officer is a held wait",
    () => {
      for (const cell of Object.keys(RIG.drives)) {
        const { halted } = approach(cell);
        expect(halted.length, cell).toBeGreaterThan(60);
        const notRed = halted.filter((p) => p.state !== "red");
        expect(
          notRed.map((p) => `${p.t.toFixed(3)}:${p.state}`).slice(0, 5),
          `${cell}: halted dark-lamp approach ticks that do not read the effective red`,
        ).toEqual([]);
        // Standing at the line (the rig rests 3.5 m short of it through chest-on and the raised arm): held.
        const standingAtLine = halted.filter((p) => Math.abs(p.speedKmh) < 0.05);
        expect(standingAtLine.length, `${cell}: standing ticks under the halt`).toBeGreaterThan(60);
        const lateStanding = standingAtLine.slice(-30);
        expect(
          lateStanding.filter((p) => !p.holding).map((p) => p.t.toFixed(3)).slice(0, 5),
          `${cell}: standing under the halt but not a held wait`,
        ).toEqual([]);
      }
    },
    TIMEOUT,
  );
});
