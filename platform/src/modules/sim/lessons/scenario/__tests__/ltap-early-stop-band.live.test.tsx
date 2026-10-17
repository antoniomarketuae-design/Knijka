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
 *
 * ROUND 3 OF sc-sig-controller-postures:5ee4301e (2026-10-12) — §1 IS NOW A PINNED CENSUS, NOT «ALL 420 TURN ✓».
 *
 * §1 used to require the turn ✓ on every one of the 420 drives. That held only on a junction that did not work:
 * ambient cars on the oncoming (east-west) street obeyed the boulevard's lamp instead of their own, and an ambient
 * car turning at the node hopped into the box and froze there with the lesson's staged pair behind it. Once ambient
 * cars obey the lamp of their own approach and drive the box (traffic/vehicles.ts `laneEndSignal`, traffic/graph.ts
 * `laneConnector`), the lesson's own oncoming pair runs — and 21 of the 140 drives per cadence, all open-loop, turn
 * across one of those two cars while it is coming at 45 km/h less than 1.3 s away. The car has to brake for the
 * student and the engine bills FAILED_TO_YIELD, which is right, and the turn is then not ✓.
 *
 * WHY THOSE 21 PASSED AT BASE (2e9268f), cell class by cell class — the defect itself in both classes:
 *   · «wait 30 s», stops 64.5 / 63 / 61 / 60.2 / 59.5 m, all four tapes (20 cells): at base every one of them ENDED IN
 *     A COLLISION — the tape drove into a car that had been standing 22–30 s in a deadlocked box (staged 1000 and
 *     ambient 3 on the L1 tapes; staged 1001, 1000 and ambient 1, 0, 4 on the L3 tapes) — and this file tolerated a
 *     collision as long as the turn row was ✓. Evidence: r2/esbwhy-base.json (`restInBox`), r2b/esbwhy-tree-final.json.
 *   · «stop 55 m, wait 15 s» on phone-L1 (1 cell): at base the tape turned past an oncoming queue STANDING ON ITS OWN
 *     GREEN (an ambient car at the east-west line obeying the boulevard's red, the staged pair queued behind it).
 *     Evidence: r2/esbwhy-base.json (no inbound mover at the commit), r2/ltapwhy-base.json.
 * On this tree no vehicle stands in the box in any of the 420 drives (junction-box-clears.census.test.ts).
 *
 * WHAT §1 PINS NOW: the exact cells where the turn is not ✓ (`NOT_TURNED`, the same on all three cadences — one
 * drive, one sheet); for each of them that the only bill is FAILED_TO_YIELD, that it was written by the lesson's own
 * two oncoming encounters, and that at the frame the turn began one of the lesson's STAGED oncoming cars was on the
 * oncoming lane, had been running at its 45 km/h within the last 6 s, had already begun to shed speed for him, and
 * was less than the taught 4 s from him at that speed (measured: 0.4–1.3 s); the count; and the turn ✓ in every
 * other cell. THE PROPERTY THIS FILE EXISTS FOR — never «не беше започнат» on the row, and the same row on both
 * layouts — is still asserted on all 420.
 *
 * ROUND 4 (2026-10-13, the junction-box protocol) — THE CENSUS IS 31 CELLS PER CADENCE, RE-DERIVED CELL BY CELL.
 * The 21 of round 3 are all still in it, each with the same cause. TEN MORE joined, every one a «wait 10 s» cell
 * (phone-L1 61, 60.2, 59.5, 55 m; phone-L3 60.2, 59.5, 55 m; pc-L1 55 m; pc-L3 59.5, 55 m). In round 3 those ten were
 * ✓ for a reason that was itself the round-3 refutation: the ambient car at the head of the oncoming queue is a
 * left-turner, round 3 held it at its line for the patience bound after its green and then let it go on the clock
 * (measured there: 9.1–10.6 s standing on its own green at x = −31.8), and the lesson's staged pair, queued behind
 * it, reached the junction after the tape had turned. Now that car is not waiting for a student who is signalling a
 * left turn of his own (traffic/vehicles.ts `studentHoldsBox`: two opposing left turns pass each other), the pair
 * runs on time, and the open-loop tape that waited only 10 s rolls into the lead car's lane: at the frame the turn
 * begins the staged lead car is 8–16 m from him and has ALREADY braked to 0–25 km/h for him (it was doing 45 km/h
 * within the last 6 s). FAILED_TO_YIELD by the lesson's own two encounters, the row says «зави при 2.0–3.6 с — под
 * нормата от 4 секунди», and every assertion below holds on them unchanged. Evidence: r4/esb-all-e.json.
 *
 * AND ONE THING IT PINS BY NAME BECAUSE IT IS WRONG AND NOT THIS LANE'S TO REPAIR (`PRAISED_UNDER_THE_BILL`): on 6
 * of those 21 drives the row under the billed turn reads «Интервал: зави при 7.1 с — над нормата от 4 секунди,
 * точно така се преценява.» The figure is the braked car's distance over the speed it has LEFT (7.9 m at 1.5 m/s);
 * the car was 0.6 s away at the speed it was doing before the student rolled into its lane. Owed to the
 * sc-turn-left-oncoming lane (the F6 figure, on a car the student has already forced to brake). It is asserted
 * exactly as measured, so a repair and a regression both turn this file red.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionEndScreen, objectiveDetailText } from "../../../hud/SessionEndScreen";
import { LEFT_TURN_GAP_SAFE_SEC } from "../../../runtime";
import { STAGED_STATE_ID_BASE } from "../../../traffic/staged";
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
  /**
   * The lesson's STAGED cars on the oncoming carriageway at that frame — west of the student, heading east —
   * nearest first: how far from him, the speed each has now, and the fastest it went in the 6 s before
   * (what it was doing before he was in its way).
   */
  stagedOncoming: Array<{ id: number; distM: number; mps: number; cruiseMps: number }>;
}
/** How far back «the speed it was doing before he was in its way» is read, s. */
const CRUISE_LOOKBACK_SEC = 6;

function drive(
  leg: Leg,
  rows: readonly Row[],
  cadence: Cadence,
): { o: LiveReplayOutcome; turnDone: boolean; ending: string | null; gap: number | null; sentence: string | null; commit: Commit | null } {
  let commit: Commit | null = null;
  const stagedSpeeds = new Map<number, Array<[number, number]>>();
  const deltas = deltasOf(rows, cadence);
  const o = liveChainReplay({
    lesson: compileScenario(SC_TURN_LEFT_ONCOMING, leg.level),
    districtRaw: RAW,
    trace: traceOf(rows),
    applyOutcomes: true,
    holdAfterSec: 0,
    ...(deltas ? { frameDeltas: deltas } : {}),
    afterApply: ({ t, tick, traffic }) => {
      if (commit) return;
      for (const v of traffic.vehicles) {
        if (v.id < STAGED_STATE_ID_BASE) continue;
        let h = stagedSpeeds.get(v.id);
        if (!h) stagedSpeeds.set(v.id, (h = []));
        h.push([t, v.speedMps]);
        while (h[0][0] < t - CRUISE_LOOKBACK_SEC) h.shift();
      }
      if (!tick.events.some((e) => e.kind === "turnStarted" && e.direction === "left")) return;
      const stagedOncoming: Commit["stagedOncoming"] = [];
      for (const v of traffic.vehicles) {
        if (v.id < STAGED_STATE_ID_BASE || v.dirX < 0.7 || v.x >= tick.position.x || Math.abs(v.y - J.y) > 8) continue;
        stagedOncoming.push({
          id: v.id,
          distM: Math.hypot(v.x - tick.position.x, v.y - tick.position.y),
          mps: v.speedMps,
          cruiseMps: Math.max(...(stagedSpeeds.get(v.id) ?? [[0, 0]]).map((p) => p[1])),
        });
      }
      stagedOncoming.sort((a, b) => a.distM - b.distM);
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
      commit = { nearestOncomingSec: nearest, stagedOncoming };
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

/**
 * THE PINNED CENSUS (round 3 of sc-sig-controller-postures:5ee4301e — see the header): the cells, «stop m/wait s»,
 * where the open-loop drive turns across the lesson's own oncoming car and the turn is therefore not ✓. The same on
 * every cadence. 31 of 140 (round 4; 21 in round 3 — the ten «wait 10 s» cells joined, see the header).
 */
const WAIT_30 = ["64.5/30", "63/30", "61/30", "60.2/30", "59.5/30"] as const;
const NOT_TURNED: Record<LegName, readonly string[]> = {
  "phone-L1": [...WAIT_30, "55/15", "61/10", "60.2/10", "59.5/10", "55/10"],
  "phone-L3": [...WAIT_30, "60.2/10", "59.5/10", "55/10"],
  "pc-L1": [...WAIT_30, "55/10"],
  "pc-L3": [...WAIT_30, "59.5/10", "55/10"],
};
/** Of those, the drives whose row praises the interval under the bill — a false sentence, pinned by name (header). */
const PRAISED_UNDER_THE_BILL: Record<LegName, readonly string[]> = {
  "phone-L1": ["64.5/30", "63/30"],
  "phone-L3": ["64.5/30", "63/30"],
  "pc-L1": ["61/30"],
  "pc-L3": ["61/30"],
};
const ABOVE_THE_NORM = "над нормата от 4 секунди, точно така се преценява";
/** The lesson's two oncoming encounters — the only things that may have written the bill. */
const OWN_ONCOMING_EVENTS = (SC_TURN_LEFT_ONCOMING.staged ?? [])
  .filter((e) => (e as { kind?: string }).kind === "oncomingLeftTurn")
  .map((e) => e.id)
  .sort();

describe("§1 a student who stops early, waits, rolls up and turns: never «не беше започнат» on his row; the turn ✓ except in the pinned cells where he turns across the lesson's own oncoming car", () => {
  it("the census names 31 of the 140 drives, and the bill can only come from the lesson's two oncoming encounters", () => {
    expect(LEGS.reduce((n, name) => n + NOT_TURNED[name].length, 0)).toBe(31);
    expect(OWN_ONCOMING_EVENTS).toEqual(["sc-ltap-follow", "sc-ltap-tight"]);
    expect(LEFT_TURN_GAP_SAFE_SEC).toBe(4);
    for (const name of LEGS) {
      for (const k of NOT_TURNED[name]) {
        const [x, w] = k.split("/").map(Number);
        expect(STOPS_M as readonly number[], k).toContain(x);
        expect(WAITS_S as readonly number[], k).toContain(w);
      }
      for (const k of PRAISED_UNDER_THE_BILL[name]) expect(NOT_TURNED[name], k).toContain(k);
    }
  });

  for (const name of LEGS) {
    for (const cadence of CADENCES) {
      it(`${name} at ${CADENCE_NAME[cadence]}: ${STOPS_M.length * WAITS_S.length} early stops`, () => {
        const leg = TAPES[name];
        const wrong: string[] = [];
        const notTurned: string[] = [];
        const praised: string[] = [];
        let bandStops = 0;
        for (const xStop of STOPS_M) {
          for (const wait of WAITS_S) {
            const d = drive(leg, earlyStop(leg.rows, xStop, wait), cadence);
            const cell = `stop ${xStop} m, wait ${wait} s`;
            const key = `${xStop}/${wait}`;
            expect(d.o.session.phase, cell).toBe("completed");
            if (NOT_TURNED[name].includes(key)) {
              // A PINNED CELL: he turned across the lesson's own oncoming car and was billed for exactly that.
              notTurned.push(key);
              expect(d.turnDone, cell).toBe(false);
              expect(d.o.violationCodes, cell).toEqual(["FAILED_TO_YIELD"]);
              const billed = d.o.outcomes.filter((x) => x.kind === "oncomingLeftTurn" && !x.success) as Array<{
                eventId: string;
                detail?: string;
                committed?: boolean;
              }>;
              expect(billed.map((x) => x.eventId).sort(), cell).toEqual(OWN_ONCOMING_EVENTS);
              for (const b of billed) {
                expect(b.detail, cell).toBe("violation");
                expect(b.committed, cell).toBe(true);
              }
              // The car: one of the lesson's staged pair, on the oncoming lane, coming at its 45 km/h until he was
              // in its way, already shedding speed for him at the frame his turn began, and less than the taught
              // 4 s from him at the speed it had been doing.
              const car = d.commit?.stagedOncoming[0];
              expect(car, cell).toBeDefined();
              expect(car!.id, cell).toBeGreaterThanOrEqual(STAGED_STATE_ID_BASE);
              expect(car!.cruiseMps, cell).toBeCloseTo(45 / 3.6, 1);
              expect(car!.mps, cell).toBeLessThan(car!.cruiseMps);
              expect(car!.distM / car!.cruiseMps, cell).toBeLessThan(LEFT_TURN_GAP_SAFE_SEC);
              if ((d.sentence ?? "").includes(ABOVE_THE_NORM)) praised.push(key);
            } else {
              // Every other drive makes the turn — that is what makes «не беше започнат» false on it.
              expect(d.turnDone, cell).toBe(true);
              expect(d.o.violationCodes, cell).not.toContain("FAILED_TO_YIELD");
            }
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
        expect(notTurned).toEqual([...NOT_TURNED[name]].sort((a, b) => STOPS_M.indexOf(Number(a.split("/")[0]) as never) - STOPS_M.indexOf(Number(b.split("/")[0]) as never) || Number(a.split("/")[1]) - Number(b.split("/")[1])));
        expect(notTurned.length).toBe(NOT_TURNED[name].length);
        // The false praise under the bill, exactly as measured (owed to the sc-turn-left-oncoming lane — header).
        expect(praised.sort()).toEqual([...PRAISED_UNDER_THE_BILL[name]].sort());
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
