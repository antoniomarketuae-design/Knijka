/**
 * WITNESS (not a closure) — sc-roundabout-entry:4ab693eb [critical] (the route-hold
 * clause) and sc-roundabout-entry:7b747c15 [major] (platform parity).
 *
 * ── 4ab693eb — «the coach calmly says to leave the roundabout with the right
 * indicator» at a windscreen of island. Clause 1 (the car drives ON the island)
 * is refuted by bf4a516 (the 0.45 m wall is a solid, graded collider). What
 * survived the w69 verifier is the MOBILE timing: mobile-right sat nose-on to
 * the wall with the task banner up, the hold appearing ~7 s later than a 5 s
 * hold predicts, and no record of the SESSION clock to tell a product delay from
 * a slow sim clock (median tick 1279 ms, worst 7168 ms; a teach card was up
 * 44.4 → ~51 s). The triage's in-process check: compileScenario(SC_ROUNDABOUT_
 * ENTRY, 1) + applyTick, a scored impact at the island face, then assert the
 * advisor (and the shared banner predicate) switch EXACTLY ROUTE_HOLD_S of
 * session time later — including after a teach pause, and at the phone's own
 * frame cadence.
 *
 * THE ACT. The lesson's own approach (the authored shadow: slow to the yield
 * line, look left, wait the circulator past) and then the w69 mobile-right act:
 * it never turns, rolls straight on up the south arm's lane and stops nose-on to
 * the island wall. The wall's CONTACT is the one thing not in process (rapier):
 * it is reported here exactly as LessonScene's handleCollision reports an
 * untagged world body — one `{ kind: "collision", withWhat: "staticObject" }`
 * on the first frame whose pose has the nose at the wall face.
 * Everything after it — the bill, the crash pin, the hold, the coach card — is
 * the product's.
 *
 * ── 7b747c15 — «the two platforms convict different faults for the same careful
 * drive». The live pairs never drove the same drive. The only route by which a
 * PLATFORM can change a grade is the tick rate (the grading path takes the same
 * SimTick on both). So: the same authored drives replayed at the desktop cadence
 * and at the phone cadence actually recorded on w69 mobile-right (its frame
 * deltas, a 7.5 s stall included, through rapier's 0.5 s clamp), plus the
 * worst-case steady 0.5 s, must produce identical codes and an identical verdict.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { PLAYER_HALF_LENGTH_M } from "../../../collision";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  scRoundaboutEntryMistakeBargeScript,
  scRoundaboutEntryMistakeNoSignalScript,
  scRoundaboutEntryShadowScript,
} from "../../../traces/scRoundaboutEntry";
import {
  advisorPromptForSession,
  ROUTE_HOLD_S,
  routeHoldAdvisorPrompt,
  routeHoldForSession,
} from "../../advisor";
import { compileScenario } from "../compile";
import { SC_ROUNDABOUT_ENTRY } from "../templates-flow";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_ROUNDABOUT_ENTRY.map.districtId}.json`), "utf-8"),
);

/**
 * Frame deltas (ms) of w69-h1-mob sc-roundabout-entry__mobile-right, read off
 * its `_audit-road.json.gz` (`wallMs`, 87 rows, t 32.2 → 68.7 s; every row whose
 * wall delta exceeds 0.5 s advances the session clock by exactly 0.5 s, i.e. one
 * clamped frame per row). Includes the leg's 7.5 s stall.
 */
const W69_MOBILE_FRAME_MS = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
];
/** A 120-frame excerpt of w69-h1-pc pc-right's frame deltas (ms; p50 15, p90 28, max 983 over 7,327). */
const W69_PC_FRAME_MS = [
  11, 17, 12, 20, 14, 33, 10, 35, 10, 17, 12, 19, 13, 36, 31, 44, 33, 14, 12, 34, 13, 21, 12, 20, 14, 20, 29, 34,
  10, 13, 12, 21, 12, 19, 29, 14, 12, 15, 11, 30, 11, 13, 13, 32, 11, 13, 12, 20, 13, 20, 14, 31, 11, 33, 10, 20,
  12, 20, 14, 19, 27, 13, 29, 16, 12, 20, 15, 19, 27, 15, 11, 15, 12, 19, 30, 14, 11, 31, 11, 19, 13, 20, 14, 20,
  13, 33, 28, 12, 10, 20, 14, 161, 34, 34, 19, 11, 10, 17, 13, 20, 14, 32, 33, 13, 10, 15, 14, 20, 13, 30, 12, 13,
  11, 21, 29, 16, 11, 17, 15, 38, 983,
];
const CADENCES: Record<string, readonly number[]> = {
  "desktop 60 Hz": [1 / 60],
  "desktop as recorded (w69 pc-right)": W69_PC_FRAME_MS.map((ms) => ms / 1000),
  "phone as recorded (w69 mobile-right)": W69_MOBILE_FRAME_MS.map((ms) => ms / 1000),
  "phone worst case, every frame clamped": [0.5],
};

function record(level: ScenarioLevel, script: DriveScript) {
  const lesson = compileScenario(SC_ROUNDABOUT_ENTRY, level);
  const rec = recordScriptedDrive(RAW, script, {
    scenarioId: SC_ROUNDABOUT_ENTRY.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  return { lesson, trace: rec.trace };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4ab693eb — the route hold, in session time
// ─────────────────────────────────────────────────────────────────────────────

/** rb-mini-v1's island wall face, m from the ring centre (island-wall-is-a-collider.test.ts). */
const ISLAND_WALL_R = 13.75;
/** South-arm northbound lane centre (traces/scRoundaboutEntry.ts X_LANE). */
const X_LANE = 4.06;
/** Where the car's CENTRE stands when its nose is on the wall face, driving due north on X_LANE. */
const NOSE_ON_WALL_Y = -Math.sqrt(ISLAND_WALL_R ** 2 - X_LANE ** 2) - PLAYER_HALF_LENGTH_M;

/** The authored approach + yield wait, then w69 mobile-right's act: straight on into the island. */
function neverTurnsScript(): DriveScript {
  const shadow = scRoundaboutEntryShadowScript().steps;
  const waitIdx = shadow.findIndex((s) => s.kind === "pause" && s.sec === 9.0);
  if (waitIdx < 0) throw new Error("neverTurnsScript: the shadow's 9 s yield wait moved");
  return {
    steps: [
      ...shadow.slice(0, waitIdx + 1),
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [
          [X_LANE, -27.5],
          [X_LANE, NOSE_ON_WALL_Y],
        ],
        targetKmh: 14,
      },
      { kind: "pause", sec: 14, brake: true },
    ],
  };
}

interface HoldRun {
  out: LiveReplayOutcome;
  impact: { t: number; wall: number } | null;
  /** First frame on which the coach card is the route-hold card. */
  cardSwitch: { t: number; wall: number } | null;
  /** First frame on which the shared banner predicate reads "crashPinned". */
  bannerSwitch: { t: number; wall: number } | null;
  /** The coach card on the last frame BEFORE the switch. */
  cardBefore: unknown;
  maxFrameDt: number;
  teachPaused: boolean;
}

function driveIntoIsland(frameDeltas: readonly number[], teachPauseWallSec: number): HoldRun {
  const { lesson, trace } = record(1, neverTurnsScript());
  const holdCard = routeHoldAdvisorPrompt("crashPinned");
  let impact: HoldRun["impact"] = null;
  let cardSwitch: HoldRun["cardSwitch"] = null;
  let bannerSwitch: HoldRun["bannerSwitch"] = null;
  let cardBefore: unknown = undefined;
  let prevT = 0;
  let maxFrameDt = 0;
  let teachPaused = false;
  const out = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace,
    frameDeltas,
    teachPauseWallSec,
    beforeApply: ({ t, tick, wallSec }) => {
      // The wall contact, reported once, on the first frame whose pose has the
      // nose at the face — the frame whose interval contained the contact, which
      // is the frame rapier's report rides in (see the header; nothing more).
      if (impact === null && tick.position.y >= NOSE_ON_WALL_Y - 0.05) {
        tick.events.push({ kind: "collision", withWhat: "staticObject" });
        impact = { t, wall: wallSec };
      }
    },
    afterApply: ({ t, wallSec, step }) => {
      maxFrameDt = Math.max(maxFrameDt, t - prevT);
      prevT = t;
      if ((step.teachMoments?.length ?? 0) > 0 || step.mistakeMoment !== undefined) teachPaused = true;
      const card = advisorPromptForSession(step.state);
      if (cardSwitch === null) {
        if (card !== null && JSON.stringify(card) === JSON.stringify(holdCard)) cardSwitch = { t, wall: wallSec };
        else cardBefore = card;
      }
      if (bannerSwitch === null && routeHoldForSession(step.state) === "crashPinned") bannerSwitch = { t, wall: wallSec };
    },
  });
  return { out, impact, cardSwitch, bannerSwitch, cardBefore, maxFrameDt, teachPaused };
}

describe("sc-roundabout-entry:4ab693eb — the coach switches to the crash-pinned hold exactly ROUTE_HOLD_S of SESSION time after a scored island impact", () => {
  const RUNS: Array<{ name: string; deltas: readonly number[]; pause: number }> = [
    { name: "desktop 60 Hz, no teach pause", deltas: [1 / 60], pause: 0 },
    { name: "desktop 60 Hz, a 6.6 s teach pause (w69's 44.4 → ~51 s)", deltas: [1 / 60], pause: 6.6 },
    { name: "phone as recorded (w69 mobile-right), the same teach pause", deltas: CADENCES["phone as recorded (w69 mobile-right)"], pause: 6.6 },
    { name: "phone worst case (every frame 0.5 s), the same teach pause", deltas: [0.5], pause: 6.6 },
  ];
  const runs = RUNS.map((r) => ({ ...r, run: driveIntoIsland(r.deltas, r.pause) }));

  it("the impact is the product's to grade: COLLISION billed, опасна, and the crash pin is armed AT the impact's session time", () => {
    for (const { name, run } of runs) {
      expect(run.impact, name).not.toBeNull();
      expect(run.out.violationCodes, name).toContain("COLLISION");
      expect(run.out.result.passed, name).toBe(false);
      const collision = run.out.session.events.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
      expect(collision.t, name).toBeCloseTo(run.impact!.t, 6);
    }
  });

  it("before the hold, the coach is NOT the hold card; from ROUTE_HOLD_S of session time on, the coach card AND the banner predicate are the hold — on the same frame", () => {
    for (const { name, run } of runs) {
      expect(run.cardSwitch, name).not.toBeNull();
      expect(run.bannerSwitch, name).not.toBeNull();
      expect(JSON.stringify(run.cardBefore), name).not.toBe(JSON.stringify(routeHoldAdvisorPrompt("crashPinned")));
      const lag = run.cardSwitch!.t - run.impact!.t;
      // Exactly ROUTE_HOLD_S: never before it, and no later than the one frame
      // that crosses it (the frame length is the cadence's own, after rapier's clamp).
      expect(lag, name).toBeGreaterThanOrEqual(ROUTE_HOLD_S - 1e-9);
      expect(lag, name).toBeLessThanOrEqual(ROUTE_HOLD_S + run.maxFrameDt + 1e-9);
      expect(run.bannerSwitch!.t, name).toBeCloseTo(run.cardSwitch!.t, 9);
    }
    expect(ROUTE_HOLD_S).toBe(5);
  });

  it("a teach pause moves the WALL clock, never the session clock: the hold still lands at +ROUTE_HOLD_S of session time, and a wall-clock observer sees it later by the pause (plus, on a phone, every clamped second)", () => {
    const base = runs[0].run;
    for (const { name, run, pause, deltas } of runs.slice(1)) {
      // The pause really happened: the impact raised a card the shell pauses on.
      expect(run.teachPaused, name).toBe(true);
      // Session-time lag is the same as with no pause, to within one frame.
      expect(Math.abs(run.cardSwitch!.t - run.impact!.t - (base.cardSwitch!.t - base.impact!.t)), name).toBeLessThanOrEqual(
        run.maxFrameDt + 1e-9,
      );
      // Wall-time lag = the 5 s of session time + the pause (+ whatever the clamp threw away).
      const wallLag = run.cardSwitch!.wall - run.impact!.wall;
      expect(wallLag, name).toBeGreaterThanOrEqual(ROUTE_HOLD_S + pause - 1e-6);
      if (deltas.some((d) => d > 0.5)) expect(wallLag, name).toBeGreaterThan(ROUTE_HOLD_S + pause);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7b747c15 — the same drive at both platforms' cadences
// ─────────────────────────────────────────────────────────────────────────────

interface Sheet {
  violations: string[];
  objectivesDone: string[];
  passed: boolean;
  score: number;
  lessonMistakes: string[];
}
function sheet(out: LiveReplayOutcome): Sheet {
  return {
    violations: out.violationCodes,
    objectivesDone: out.result.objectives.filter((o) => o.done).map((o) => o.id),
    passed: out.result.passed,
    score: out.result.score,
    lessonMistakes: (out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged ? "charged" : "taught"}`),
  };
}

describe("sc-roundabout-entry:7b747c15 — one drive, every platform cadence, one sheet", () => {
  const DRIVES: Array<{ name: string; script: () => DriveScript }> = [
    { name: "shadow-correct (the careful drive)", script: scRoundaboutEntryShadowScript },
    { name: "mistake-barge-entry", script: scRoundaboutEntryMistakeBargeScript },
    { name: "mistake-exit-no-signal", script: scRoundaboutEntryMistakeNoSignalScript },
  ];
  const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4];
  const grid = DRIVES.flatMap((d) =>
    LEVELS.map((level) => {
      const { lesson, trace } = record(level, d.script());
      const sheets = Object.entries(CADENCES).map(([cadence, deltas]) => ({
        cadence,
        sheet: sheet(liveChainReplay({ lesson, districtRaw: RAW, trace, frameDeltas: deltas, holdAfterSec: 3 })),
      }));
      return { drive: d.name, level, sheets };
    }),
  );

  it("the careful drive is credited at every cadence: passed, 0 т., both tasks, no violation (L1–L4)", () => {
    for (const g of grid.filter((g) => g.drive.startsWith("shadow"))) {
      for (const { cadence, sheet: s } of g.sheets) {
        const label = `L${g.level} @ ${cadence}`;
        expect(s.passed, label).toBe(true);
        expect(s.score, label).toBe(0);
        expect(s.violations, label).toEqual([]);
        expect(s.objectivesDone, label).toEqual(["sc-rb-approach", "sc-rb-ring"]);
      }
    }
  });

  it("the wrong drives are convicted at every cadence (the parity is not two empty sheets)", () => {
    for (const g of grid.filter((g) => !g.drive.startsWith("shadow"))) {
      for (const { cadence, sheet: s } of g.sheets) {
        const label = `${g.drive} L${g.level} @ ${cadence}`;
        expect(s.passed, label).toBe(false);
        expect(s.violations.length + s.lessonMistakes.length, label).toBeGreaterThan(0);
      }
    }
  });

  it("IDENTICAL codes, tasks, score and verdict at the desktop and the phone cadences, for every drive and rung", () => {
    for (const g of grid) {
      const [ref, ...rest] = g.sheets;
      for (const { cadence, sheet: s } of rest) {
        expect(s, `${g.drive} L${g.level}: ${cadence} vs ${ref.cadence}`).toEqual(ref.sheet);
      }
    }
  });
});
