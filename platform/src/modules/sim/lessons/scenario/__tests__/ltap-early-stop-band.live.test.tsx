/**
 * THE STUDENT WHO STOPPED EARLY — sc-turn-left-oncoming:d079e687 (clause 5),
 * round 2.
 *
 * Round 1 kept the oncoming encounter open while an uncommitted student was
 * within 60 m of the junction, so the turn he then made was the commit the
 * outcome reported. Its verifier refuted it with a lawful drive: the student
 * brakes smoothly to a stop 60.2–64.5 m from the node (some 33–37 m short of
 * the stop line), waits 15 s or more, creeps up to the line at 10 km/h and
 * turns as on the rig tape. He started the encounter from out there — it arms
 * at `armDistM` = 65 m for a student at ≤ 8 km/h — but the 60 m hold did not
 * cover him, so it resolved «clear, committed: false» while he stood, and his
 * ✓ turn printed «Интервал: завоят не беше започнат…» on both layouts and every
 * cadence: 120 lawful cells of 420 (and 24 more on drives that ended in a
 * collision). The hold radius is now the larger of its 60 m floor and the
 * spec's arming distance (orchestrator/runners.ts `ltapHoldNearM`).
 *
 * §1 is that verifier's band probe made a test, cell for cell: the four
 * rig-w2 tapes (the two phone drives that printed the false row and the two PC
 * drives that printed the interval), each driven with the early stop at seven
 * distances straddling the band (66 m — outside the arming distance — down to
 * 55 m, inside the old hold) and five waits, on the 60 Hz grid, at the drive's
 * own frame lengths and with a 0.5 s first frame: 420 drives, all with the
 * turn ✓. Red on round 1 (every band stop of 60.2–64.5 m with a wait of 15 s
 * or more), green on round 2.
 *
 * §2 is the verifier's F6 condition — «the figure is distance ÷ current speed
 * of a car that came back round». The figure is the runner's own car's
 * distance to the node over its speed at the commit frame. In the world the
 * product runs at c38086a that car is the nearest moving vehicle bound for the
 * junction from the oncoming side — ambient traffic included — so the figure
 * is the true time to the junction of the car the student turned in front of:
 * the live grid writes the director's pose from the car after each rapier step
 * (scene/gradeGrid.ts `run` → `steps.stateAtStep(k)`, fed by LessonScene's
 * `gradeGrid.stepPhysics` from the records VehicleRig's `useAfterPhysicsStep`
 * makes through traffic/playerTrack.ts `recordPhysicsStep`), so the rig-w2 «start
 * race» — the staged pair released by a frame-end pose (0, 0) sampled before
 * the car existed — cannot happen. Measured in process: the four rig tapes
 * begun −1…+2 s later on the 60 Hz grid, 24 of 24 within 0.022 s; asserted
 * below within 0.1 s on 48 drives (four tapes × four delays × three cadences).
 * The false figures the verifier quoted (71.7 s and 14.0 s, with an ambient
 * car 7.3–9.5 s out) exist only in the stand-in of the raced world: there the
 * pair had run through and finished before the student arrived, the follow
 * car was pulling away from its hold again (−141 to −159 m, 1.9–10 m/s), and
 * its distance over that rising speed is not anyone's time to the junction.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionEndScreen, objectiveDetailText } from "../../../hud/SessionEndScreen";
import type { ScenarioTrace, TraceSample } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_LTAP_TIGHT_EVENT, SC_TURN_LEFT_ONCOMING } from "../templates-junctions";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, "content", "world", `${SC_TURN_LEFT_ONCOMING.map.districtId}.json`),
    "utf-8",
  ),
) as unknown;

type Row = [number, number, number, number, number, number, number];
interface Leg {
  level: 1 | 3;
  rows: Row[];
}
type LegName = "phone-L1" | "phone-L3" | "pc-L1" | "pc-L3";
const TAPES: Record<LegName, Leg> = {
  ...(JSON.parse(readFileSync(path.join(HERE, "ltap-rig-w2-phone-tapes.fixture.json"), "utf-8")) as {
    legs: Record<"phone-L1" | "phone-L3", Leg>;
  }).legs,
  ...(JSON.parse(readFileSync(path.join(HERE, "ltap-rig-w2-pc-tapes.fixture.json"), "utf-8")) as {
    legs: Record<"pc-L1" | "pc-L3", Leg>;
  }).legs,
};
const LEGS: readonly LegName[] = ["phone-L1", "phone-L3", "pc-L1", "pc-L3"];

const TURN_ID = "sc-ltap-turn";
const NOT_BEGUN = "завоят не беше започнат";
const J = SC_LTAP_TIGHT_EVENT.junction;
const IND = { "-1": "left", "0": "off", "1": "right" } as const;

function traceOf(rows: readonly Row[]): ScenarioTrace {
  const samples: TraceSample[] = rows.map((r) => ({
    tSec: r[0],
    x: r[1],
    y: r[2],
    headingDeg: r[3],
    steerRad: 0,
    speedKmh: r[4],
    gear: r[5],
    indicator: IND[String(r[6]) as "-1" | "0" | "1"],
    brakeOn: false,
    throttleOn: false,
  }));
  return {
    meta: {
      scenarioId: SC_TURN_LEFT_ONCOMING.id,
      kind: "attempt",
      version: 1,
      durationSec: samples[samples.length - 1].tSec,
    },
    samples,
    events: [],
  };
}

/** The tape with every row after the first moved `delaySec` later. */
function delayed(rows: readonly Row[], delaySec: number): Row[] {
  return rows.map((r, i) => (i === 0 ? r : ([r[0] + delaySec, ...r.slice(1)] as Row)));
}

/**
 * The verifier's early stop (D:/knijka-lanes/scratch/ltapnote-verify, mode
 * band): the tape until 12 m before `xStopM`, a constant deceleration to a
 * standstill at `xStopM`, `waitSec` standing, a 10 km/h creep to the tape's own
 * stop at the line, then the tape from that stop on, shifted in time.
 */
function earlyStop(rows: readonly Row[], xStopM: number, waitSec: number): Row[] {
  const iBrake = rows.findIndex((r) => r[1] <= xStopM + 12);
  const head = rows.slice(0, iBrake);
  const b = head[head.length - 1];
  const v0 = b[4] / 3.6;
  const a = (v0 * v0) / (2 * (b[1] - xStopM));
  const stopDur = v0 / a;
  const out: Row[] = [...head];
  let t = b[0];
  for (let tt = 0.05; tt <= stopDur; tt += 0.05) {
    const v = v0 - a * tt;
    out.push([t + tt, b[1] - (v0 * tt - 0.5 * a * tt * tt), b[2], b[3], v * 3.6, b[5], b[6]]);
  }
  t += stopDur;
  for (let tt = 0.1; tt <= waitSec; tt += 0.1) out.push([t + tt, xStopM, b[2], b[3], 0, b[5], b[6]]);
  t += waitSec;
  const line = rows.find((r) => r[0] > 20 && r[4] < 0.5)!;
  const iLine = rows.indexOf(line);
  const creep = 10 / 3.6;
  let x = xStopM;
  while (x > line[1] + 0.05) {
    t += 0.05;
    x = Math.max(line[1], x - creep * 0.05);
    out.push([t, x, b[2], b[3], x === line[1] ? 0 : 10, b[5], b[6]]);
  }
  const shift = t + 0.1 - line[0];
  for (let i = iLine; i < rows.length; i++) out.push([rows[i][0] + shift, ...rows[i].slice(1)] as Row);
  return out;
}

/** The drive's own frame lengths: the tape's own SimTick spacing (a phone's
 *  ~0.1–0.2 s frames on the phone tapes, the PC's ~60 Hz on the PC tapes). */
function ownDeltas(rows: readonly Row[]): number[] {
  const d = [rows[0][0]];
  for (let i = 1; i < rows.length; i++) d.push(rows[i][0] - rows[i - 1][0]);
  return d.filter((x) => x > 0);
}

type Cadence = "60" | "own" | "first0.5";
const CADENCES: readonly Cadence[] = ["60", "own", "first0.5"];
const CADENCE_NAME: Record<Cadence, string> = {
  "60": "60 Hz",
  own: "the drive's own frame lengths",
  "first0.5": "a 0.5 s first frame, then 60 Hz",
};
function deltasOf(rows: readonly Row[], cadence: Cadence): number[] | null {
  if (cadence === "own") return ownDeltas(rows);
  // A slow first frame (a cold tab), then the grid: the verifier's third cadence.
  if (cadence === "first0.5") return [0.5, ...Array<number>(30_000).fill(1 / 60)];
  return null;
}

interface Commit {
  /** Seconds the nearest MOVING vehicle bound for the junction from the
   *  oncoming side still needed to reach it, at the frame he began the turn. */
  nearestOncomingSec: number | null;
}

function drive(
  leg: Leg,
  rows: readonly Row[],
  cadence: Cadence,
): { o: LiveReplayOutcome; turnDone: boolean; ending: string | null; gap: number | null; sentence: string | null; commit: Commit | null } {
  let commit: Commit | null = null;
  const deltas = deltasOf(rows, cadence);
  const o = liveChainReplay({
    lesson: compileScenario(SC_TURN_LEFT_ONCOMING, leg.level),
    districtRaw: RAW,
    trace: traceOf(rows),
    applyOutcomes: true,
    holdAfterSec: 0,
    ...(deltas ? { frameDeltas: deltas } : {}),
    afterApply: ({ tick, traffic }) => {
      if (commit) return;
      if (!tick.events.some((e) => e.kind === "turnStarted" && e.direction === "left")) return;
      let nearest: number | null = null;
      for (const v of traffic.vehicles) {
        const dx = J.x - v.x;
        const dy = J.y - v.y;
        const dist = Math.hypot(dx, dy);
        // The oncoming arm is west of the node; «bound for the junction» = heading at it.
        if (v.x >= J.x || dist <= 0 || dist > 400) continue;
        if ((v.dirX * dx + v.dirY * dy) / dist < 0.7) continue;
        if (v.speedMps <= 0.3) continue;
        const sec = dist / v.speedMps;
        if (nearest === null || sec < nearest) nearest = sec;
      }
      commit = { nearestOncomingSec: nearest };
    },
  });
  const turn = o.result.objectives.find((x) => x.id === TURN_ID);
  const detail = turn?.detail;
  return {
    o,
    turnDone: turn?.done === true,
    ending: detail?.kind === "oncomingGap" ? detail.ending : null,
    gap: detail?.kind === "oncomingGap" ? detail.acceptedGapSec : null,
    sentence: objectiveDetailText(detail),
    commit,
  };
}

function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tasksSection(o: LiveReplayOutcome, compact: boolean): string {
  const markup = renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg={o.lesson.titleBg}
      result={o.result}
      debriefText={o.debrief}
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
      compact={compact}
    />,
  );
  const open = markup.indexOf('<section aria-label="Задачи от маршрута"');
  if (open < 0) throw new Error("no «Задачи от маршрута» section on the screen");
  return textOf(markup.slice(open, markup.indexOf("</section>", open)));
}

// 66 m is outside the arming distance; 64.5–60.2 m is the band round 1 missed;
// 59.5 and 55 m were inside its hold already.
const STOPS_M = [66, 64.5, 63, 61, 60.2, 59.5, 55] as const;
const WAITS_S = [10, 15, 20, 30, 45] as const;

describe("§1 a student who stops early, waits, rolls up and turns: never «не беше започнат» under his ✓ turn", () => {
  for (const name of LEGS) {
    for (const cadence of CADENCES) {
      it(`${name} at ${CADENCE_NAME[cadence]}: ${STOPS_M.length * WAITS_S.length} early stops`, () => {
        const leg = TAPES[name];
        const wrong: string[] = [];
        let bandStops = 0;
        for (const xStop of STOPS_M) {
          for (const wait of WAITS_S) {
            const d = drive(leg, earlyStop(leg.rows, xStop, wait), cadence);
            const cell = `stop ${xStop} m, wait ${wait} s`;
            // Every one of these drives makes the turn — that is what makes «не беше
            // започнат» false on it.
            expect(d.o.session.phase, cell).toBe("completed");
            expect(d.turnDone, cell).toBe(true);
            if (xStop > 60 && xStop <= SC_LTAP_TIGHT_EVENT.armDistM) bandStops++;
            if (d.ending === "noTurn" || (d.sentence ?? "").includes(NOT_BEGUN)) {
              wrong.push(`${cell}: ${d.sentence}`);
            }
            // An impact is claimed only on a drive the engine billed for one.
            if (d.ending === "collision") expect(d.o.violationCodes, cell).toContain("COLLISION");
            // The same row on both layouts.
            expect(tasksSection(d.o, true), cell).toBe(tasksSection(d.o, false));
          }
        }
        expect(bandStops).toBe(4 * WAITS_S.length);
        expect(wrong).toEqual([]);
      });
    }
  }
});

describe("§2 the printed interval is the nearest moving oncoming's time to the junction at the commit (F6)", () => {
  for (const name of LEGS) {
    it(`${name}: the photographed drive, begun up to 2 s later, at every cadence`, () => {
      const leg = TAPES[name];
      for (const delay of [0, 0.5, 1, 2]) {
        for (const cadence of CADENCES) {
          const cell = `${name} +${delay} s @${cadence}`;
          const d = drive(leg, delayed(leg.rows, delay), cadence);
          expect(d.turnDone, cell).toBe(true);
          expect(d.ending, cell).toBe("measured");
          expect(d.commit, cell).not.toBeNull();
          expect(d.commit!.nearestOncomingSec, cell).not.toBeNull();
          expect(Math.abs(d.gap! - d.commit!.nearestOncomingSec!), cell).toBeLessThan(0.1);
          expect(d.sentence, cell).toBe(
            `Интервал: зави при ${d.gap!.toFixed(1)} с — над нормата от 4 секунди, точно така се преценява.`,
          );
        }
      }
    });
  }
});
