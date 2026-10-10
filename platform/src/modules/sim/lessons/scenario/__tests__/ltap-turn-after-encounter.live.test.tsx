/**
 * «ИНТЕРВАЛ: ЗАВОЯТ НЕ БЕШЕ ЗАПОЧНАТ» UNDER A ✓ TURN — sc-turn-left-oncoming:
 * d079e687 (major), clause 5.
 *
 * THE DEFECT, as the rig-w2 wave photographed it at 43b4109: the same careful,
 * passed drive (both tasks ✓, «Правилно отстъпено предимство») printed under
 * «✓ Завърши левия завой на юг, след като пропуснеш насрещните»
 *
 *   pc    «Интервал: зави при 34.3 с — над нормата от 4 секунди…»
 *   phone «Интервал: завоят не беше започнат, затова няма какво да се премери…»
 *
 * on phone L1 and L3, 4 of 4 runs. The phone's sentence is false: the turn was
 * made, and ticked.
 *
 * THE CAUSE (orchestrator/runners.ts, OncomingLeftTurnRunner). The FOLLOW
 * car's encounter resolved «clear, committed: false» at t ≈ 31.7 s, when its
 * car was 40 m past the node — about twelve seconds BEFORE the student turned.
 * The runner held the encounter open for a later turn only when a `sawYield`
 * latch had caught the student at ≤ 8 km/h while that car was within 36 m of
 * the node: a window a few tenths of a second wide on this drive, which the
 * phone's ~10.6 Hz frames missed and a 60 Hz display caught (reproduced in
 * process at 43b4109 on these very tapes: at the tape's own phone cadence the
 * follow encounter resolves at 31.68 s; at 60 Hz it is held and measured).
 * objectives.ts reads `committed: false` as «he never turned», so the row
 * printed «не беше започнат». ADR-014's grid took the frame cadence out of the
 * latch, but not its knife edge: on the 60 Hz grid at c38086a THE SAME TAPE
 * BEGUN 0.1 s LATER prints the phone's false sentence again (§1 below).
 *
 * THE WORLD THESE TAPES WERE DRIVEN IN. Every rig-w2 phone load started in the
 * «raced» world: the rig's first sample was the pose (0, 0) — the junction
 * node, before the car existed — and the director, which read the frame's
 * pose at 43b4109, released the staged oncoming pair on it. At c38086a the
 * director reads the car after a physics step (ADR-014), so that race is gone;
 * this file reproduces the WORLD the tapes were driven in by handing the
 * director that one pre-spawn pose (until `preSpawnSampleSec`) — and nothing
 * else. The runtime, the traffic and the lesson see the tape.
 *
 * THE REPAIR: the encounter stays live while the student is still at the
 * junction and has not begun his turn — whatever his speed was when the car
 * went through. «At the junction» is within the larger of the hold's own 60 m
 * and the distance the encounter arms at (65 m here; round 2, see
 * ltap-early-stop-band.live.test.tsx). The turn he then makes is the commit
 * the runner measures at.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SessionEndScreen, objectiveDetailText } from "../../../hud/SessionEndScreen";
import type { ScenarioTrace, TraceSample } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_TURN_LEFT_ONCOMING } from "../templates-junctions";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

/** The start-race stand-in: before `untilSec` the director is handed the pose
 *  the rig-w2 shell gave it before the car existed. */
const RACE = vi.hoisted(() => ({ untilSec: -1 }));
vi.mock("../../../orchestrator/director", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../orchestrator/director")>();
  return {
    ...m,
    createScenarioDirector: (...args: Parameters<typeof m.createScenarioDirector>) => {
      const director = m.createScenarioDirector(...args);
      const step = director.step.bind(director);
      director.step = (input) =>
        input.tSec < RACE.untilSec ? step({ ...input, x: 0, y: 0, speedKmh: 0 }) : step(input);
      return director;
    },
  };
});

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
  preSpawnSampleSec: number;
  printed: string;
  rows: Row[];
}
const TAPES = JSON.parse(
  readFileSync(path.join(HERE, "ltap-rig-w2-phone-tapes.fixture.json"), "utf-8"),
) as { legs: Record<"phone-L1" | "phone-L3", Leg> };

const TURN_ID = "sc-ltap-turn";
const NOT_BEGUN = "завоят не беше започнат";
const IND = { "-1": "left", "0": "off", "1": "right" } as const;

/**
 * The tape as a trace. `delaySec` moves every row after the first by that much
 * — the same drive begun a little later, the one knob that decides the old
 * latch on the 60 Hz grid. `straightFromSec`, when given, replaces the turn by
 * a straight run west on the approach lane from that row on (a student who
 * never turns).
 */
function traceOf(leg: Leg, delaySec: number, straightFromSec?: number): ScenarioTrace {
  const sample = (t: number, r: Row): TraceSample => ({
    tSec: t,
    x: r[1],
    y: r[2],
    headingDeg: r[3],
    steerRad: 0,
    speedKmh: r[4],
    gear: r[5],
    indicator: IND[String(r[6]) as "-1" | "0" | "1"],
    brakeOn: false,
    throttleOn: false,
  });
  const out: TraceSample[] = [sample(0, leg.rows[0])];
  for (let i = 1; i < leg.rows.length; i++) {
    const r = leg.rows[i];
    if (straightFromSec !== undefined && r[0] >= straightFromSec) break;
    out.push(sample(r[0] + delaySec, r));
  }
  if (straightFromSec !== undefined) {
    // On west along the approach lane (y = 4.06) at 20 km/h, indicator off,
    // until 85 m past the node — well beyond the 65 m the hold waits within.
    const last = out[out.length - 1];
    const v = 20 / 3.6;
    let t = last.tSec;
    let x = last.x;
    while (x > -85) {
      t += 0.1;
      x -= v * 0.1;
      out.push({ ...last, tSec: t, x, y: 4.06, headingDeg: 270, speedKmh: 20, indicator: "off" });
    }
  }
  return {
    meta: {
      scenarioId: SC_TURN_LEFT_ONCOMING.id,
      kind: "attempt",
      version: 1,
      durationSec: out[out.length - 1].tSec,
    },
    samples: out,
    events: [],
  };
}

/** The phone's own frame lengths, as the tape's SimTick times record them. */
function phoneDeltas(leg: Leg): number[] {
  const d = [leg.rows[0][0]];
  for (let i = 1; i < leg.rows.length; i++) d.push(leg.rows[i][0] - leg.rows[i - 1][0]);
  return d.filter((x) => x > 0);
}

interface Drive {
  o: LiveReplayOutcome;
  turnDone: boolean;
  ending: string | null;
  gap: number | null;
  sentence: string | null;
}

function drive(
  name: "phone-L1" | "phone-L3",
  opts: { delaySec?: number; cadence?: "60" | "phone"; straightFromSec?: number } = {},
): Drive {
  const leg = TAPES.legs[name];
  RACE.untilSec = leg.preSpawnSampleSec + 1e-6;
  try {
    const o = liveChainReplay({
      lesson: compileScenario(SC_TURN_LEFT_ONCOMING, leg.level),
      districtRaw: RAW,
      trace: traceOf(leg, opts.delaySec ?? 0, opts.straightFromSec),
      applyOutcomes: true,
      holdAfterSec: 0,
      ...(opts.cadence === "phone" ? { frameDeltas: phoneDeltas(leg) } : {}),
    });
    const turn = o.result.objectives.find((x) => x.id === TURN_ID);
    const detail = turn?.detail;
    return {
      o,
      turnDone: turn?.done === true,
      ending: detail?.kind === "oncomingGap" ? detail.ending : null,
      gap: detail?.kind === "oncomingGap" ? detail.acceptedGapSec : null,
      sentence: objectiveDetailText(detail),
    };
  } finally {
    RACE.untilSec = -1;
  }
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

/** The «Задачи от маршрута» section of the REAL result screen, as text. */
function tasksSection(d: Drive, compact: boolean): string {
  const markup = renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg={d.o.lesson.titleBg}
      result={d.o.result}
      debriefText={d.o.debrief}
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

// 0 s is the tape as driven; +0.1 s is the first delay at which c38086a's
// 60 Hz grid prints «не беше започнат» again; +0.5 / +1.0 s stay inside the
// same green the controller turned on.
const DELAYS = [0, 0.1, 0.5, 1.0] as const;

describe("§0 the fixture is the photographed drive", () => {
  it("both phone legs printed the false sentence under the ✓ turn on the rig", () => {
    for (const name of ["phone-L1", "phone-L3"] as const) {
      expect(TAPES.legs[name].printed).toContain(NOT_BEGUN);
    }
  });
});

describe("§1 the phone's drive, in the world it was driven in: a completed turn prints the interval it was made at", () => {
  for (const name of ["phone-L1", "phone-L3"] as const) {
    for (const delaySec of DELAYS) {
      it(`${name} begun ${delaySec} s later: the turn is ✓ and the row is the measured interval, never «не беше започнат»`, () => {
        const d = drive(name, { delaySec });
        expect(d.o.session.phase).toBe("completed");
        expect(d.turnDone).toBe(true);
        expect(d.o.violationCodes).toEqual([]);
        expect(d.o.commendationCodes).toContain("YIELDED_TO_PRIORITY");
        expect(d.sentence).not.toContain(NOT_BEGUN);
        expect(d.ending).toBe("measured");
        expect(d.gap).not.toBeNull();
        expect(d.sentence).toBe(
          `Интервал: зави при ${d.gap!.toFixed(1)} с — над нормата от 4 секунди, точно така се преценява.`,
        );
        // The encounter that holds the figure is one he turned in.
        const measuredBy = d.o.outcomes.filter(
          (x) => x.kind === "oncomingLeftTurn" && x.acceptedGapSec === d.gap,
        );
        expect(measuredBy.length).toBeGreaterThan(0);
        expect(measuredBy.every((x) => x.committed === true)).toBe(true);
      });
    }
  }

  it("the phone's frame lengths and a 60 Hz display give the same row for the same tape", () => {
    for (const name of ["phone-L1", "phone-L3"] as const) {
      for (const delaySec of DELAYS) {
        const pc = drive(name, { delaySec, cadence: "60" });
        const phone = drive(name, { delaySec, cadence: "phone" });
        expect(phone.ending).toBe(pc.ending);
        expect(phone.gap).toBe(pc.gap);
        expect(phone.sentence).toBe(pc.sentence);
      }
    }
  });
});

describe("§2 a drive that never begins the turn still says so", () => {
  it("straight on west from the stop line: no ✓ turn, and «завоят не беше започнат»", () => {
    // 38.2 s is the phone-L1 tape's front bumper at the stop line, rolling at
    // 13 km/h on green; from there this student drives straight on.
    const d = drive("phone-L1", { straightFromSec: 38.2 });
    expect(d.turnDone).toBe(false);
    expect(d.ending).toBe("noTurn");
    expect(d.sentence).toContain(NOT_BEGUN);
    const encounters = d.o.outcomes.filter((x) => x.kind === "oncomingLeftTurn");
    // Every encounter that has resolved says he never turned (one car may
    // still be on its way back round when the tape ends — unresolved, silent).
    expect(encounters.length).toBeGreaterThan(0);
    expect(encounters.every((x) => x.committed === false)).toBe(true);
  });
});

describe("§3 the result screen prints the same true sentence on both layouts", () => {
  it("the completed turn (phone-L1 begun 0.1 s later): the interval on the phone layout and on the PC layout", () => {
    const d = drive("phone-L1", { delaySec: 0.1 });
    const phone = tasksSection(d, true);
    const pc = tasksSection(d, false);
    expect(phone).toBe(pc);
    expect(phone).toContain("✓ Завърши левия завой на юг, след като пропуснеш насрещните");
    expect(phone).toContain(d.sentence!);
    expect(phone).toContain("Интервал: зави при");
    expect(phone).not.toContain(NOT_BEGUN);
  });

  it("the never-begun turn: «не беше започнат» on both layouts, under an unticked task", () => {
    const d = drive("phone-L1", { straightFromSec: 38.2 });
    const phone = tasksSection(d, true);
    const pc = tasksSection(d, false);
    expect(phone).toBe(pc);
    expect(phone).toContain("– Завърши левия завой на юг, след като пропуснеш насрещните");
    expect(phone).toContain(NOT_BEGUN);
  });
});
