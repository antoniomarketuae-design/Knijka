/**
 * Test support — the roundabout family's demo census (sc-rb-lane-choice:ffdffd55,
 * clause 1b). Nothing in the product imports it.
 *
 * Every authored demo of every roundabout lesson (6 lessons × 3 demos), recorded
 * with the RUNG's own cast and replayed through the live chain
 * (./liveChainReplay.ts) at every rung the lesson authors. One row per drive
 * carries what the product returned (the grader's ledger, the lesson's verdict)
 * and what the tick said while the car left a ring: how far beyond the ring's
 * carriageway the car's centre was when the fix handed over to the exit road,
 * and how long the tick had by then read a ring edge with the lane offset past
 * the straddle band.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StagedEventSpec } from "../../../contracts";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { parseDistrict } from "../../../runtime";
import { DistrictIndex, makeEdgeHit } from "../../../runtime/spatial";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  scRbBusyGapMistakeBargeScript,
  scRbBusyGapMistakeShortGapScript,
  scRbBusyGapShadowScript,
} from "../../../traces/scRbBusyGap";
import {
  scRbCirculatePriorityMistakePanicBrakeScript,
  scRbCirculatePriorityMistakeWanderingScript,
  scRbCirculatePriorityShadowScript,
} from "../../../traces/scRbCirculatePriority";
import {
  scRbExitSignalMistakeBargeScript,
  scRbExitSignalMistakeNoSignalScript,
  scRbExitSignalShadowScript,
} from "../../../traces/scRbExitSignal";
import {
  scRbLaneChoiceMistakeExitAcrossScript,
  scRbLaneChoiceMistakeOuterLaneScript,
  scRbLaneChoiceShadowScript,
} from "../../../traces/scRbLaneChoice";
import {
  scRbPedExitMistakePanicBrakeScript,
  scRbPedExitMistakeThroughPedScript,
  scRbPedExitShadowScript,
} from "../../../traces/scRbPedExit";
import {
  scRoundaboutEntryMistakeBargeScript,
  scRoundaboutEntryMistakeNoSignalScript,
  scRoundaboutEntryShadowScript,
} from "../../../traces/scRoundaboutEntry";
import type { LessonStepResult } from "../../engine";
import { compileScenario } from "../compile";
import { SC_ROUNDABOUT_ENTRY } from "../templates-flow";
import {
  SC_RB_BUSY_GAP,
  SC_RB_CIRCULATE_PRIORITY,
  SC_RB_EXIT_SIGNAL,
  SC_RB_LANE_CHOICE,
} from "../templates-roundabout";
import { SC_RB_PED_EXIT } from "../templates-roundabout2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay, type LiveReplayFrameContext } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const rawCache = new Map<string, unknown>();
export function districtRaw(districtId: string): unknown {
  let raw = rawCache.get(districtId);
  if (raw === undefined) {
    raw = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${districtId}.json`), "utf-8"));
    rawCache.set(districtId, raw);
  }
  return raw;
}

export interface FamilyDemo {
  spec: ScenarioSpec;
  demo: string;
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

/** The roundabout family: every lesson staged on a ring, and all its demos. */
export const ROUNDABOUT_FAMILY: readonly FamilyDemo[] = [
  { spec: SC_ROUNDABOUT_ENTRY, demo: "shadow-correct", kind: "shadow", script: scRoundaboutEntryShadowScript },
  { spec: SC_ROUNDABOUT_ENTRY, demo: "mistake-barge-entry", kind: "mistake", script: scRoundaboutEntryMistakeBargeScript },
  { spec: SC_ROUNDABOUT_ENTRY, demo: "mistake-exit-no-signal", kind: "mistake", script: scRoundaboutEntryMistakeNoSignalScript },
  { spec: SC_RB_EXIT_SIGNAL, demo: "shadow-correct", kind: "shadow", script: scRbExitSignalShadowScript },
  { spec: SC_RB_EXIT_SIGNAL, demo: "mistake-exit-no-signal", kind: "mistake", script: scRbExitSignalMistakeNoSignalScript },
  { spec: SC_RB_EXIT_SIGNAL, demo: "mistake-barge-entry", kind: "mistake", script: scRbExitSignalMistakeBargeScript },
  { spec: SC_RB_CIRCULATE_PRIORITY, demo: "shadow-correct", kind: "shadow", script: scRbCirculatePriorityShadowScript },
  { spec: SC_RB_CIRCULATE_PRIORITY, demo: "mistake-panic-brake", kind: "mistake", script: scRbCirculatePriorityMistakePanicBrakeScript },
  { spec: SC_RB_CIRCULATE_PRIORITY, demo: "mistake-wandering-line", kind: "mistake", script: scRbCirculatePriorityMistakeWanderingScript },
  { spec: SC_RB_BUSY_GAP, demo: "shadow-correct", kind: "shadow", script: scRbBusyGapShadowScript },
  { spec: SC_RB_BUSY_GAP, demo: "mistake-barge-lead", kind: "mistake", script: scRbBusyGapMistakeBargeScript },
  { spec: SC_RB_BUSY_GAP, demo: "mistake-short-gap", kind: "mistake", script: scRbBusyGapMistakeShortGapScript },
  { spec: SC_RB_LANE_CHOICE, demo: "shadow-correct", kind: "shadow", script: scRbLaneChoiceShadowScript },
  { spec: SC_RB_LANE_CHOICE, demo: "mistake-outer-lane-far-exit", kind: "mistake", script: scRbLaneChoiceMistakeOuterLaneScript },
  { spec: SC_RB_LANE_CHOICE, demo: "mistake-exit-across-outer", kind: "mistake", script: scRbLaneChoiceMistakeExitAcrossScript },
  { spec: SC_RB_PED_EXIT, demo: "shadow-correct", kind: "shadow", script: scRbPedExitShadowScript },
  { spec: SC_RB_PED_EXIT, demo: "mistake-exit-through-ped", kind: "mistake", script: scRbPedExitMistakeThroughPedScript },
  { spec: SC_RB_PED_EXIT, demo: "mistake-panic-brake", kind: "mistake", script: scRbPedExitMistakePanicBrakeScript },
];

/** The rungs a template actually authors (not every lesson has all five). */
export const rungsOf = (spec: ScenarioSpec): ScenarioLevel[] => spec.levels.map((l) => l.level);

/** One ring → exit-road hand-over of the tick's edge. */
export interface RingHandover {
  from: string;
  to: string;
  /** How far beyond the RING's carriageway the car's centre was, m. */
  outsideRingM: number;
  /** How long the tick had read a ring edge with |laneOffsetM| past the
   *  straddle band when it handed over, s (0: it was inside the band). */
  offBandSec: number;
  speedKmh: number;
}

export interface DriveReading {
  /** What the product returned — the row the census compares. */
  graded: {
    recorder: string[];
    violations: string[];
    commendations: string[];
    teach: string[];
    lessonMistakes: Array<[string, boolean]>;
    passed: boolean;
    score: number;
    objectives: string;
  };
  handovers: RingHandover[];
  /** Longest stretch ANYWHERE the tick read a ring edge past the straddle band, s. */
  longestRingOffBandSec: number;
  ticks: number;
}

/** Watches a live-chain replay's ticks for ring → exit-road hand-overs. */
export function ringHandoverWatch(raw: unknown): {
  onTick: (c: LiveReplayFrameContext) => void;
  handovers: RingHandover[];
  longestRingOffBandSec: () => number;
} {
  const index = new DistrictIndex(parseDistrict(raw));
  const hit = makeEdgeHit();
  const band = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
  const handovers: RingHandover[] = [];
  let prevEdge: string | null = null;
  let offSince: number | null = null;
  let offRun = 0;
  let longest = 0;
  const isRing = (id: string | null): boolean => id !== null && (index.edgeRtById(id)?.edge.roundabout ?? false);
  return {
    handovers,
    longestRingOffBandSec: () => longest,
    onTick: (c) => {
      const id = c.tick.edgeId ?? null;
      if (isRing(prevEdge) && id !== null && !isRing(id)) {
        const ringIdx = index.edgeIdxById.get(prevEdge as string) as number;
        index.projectOnEdge(ringIdx, c.tick.position.x, c.tick.position.y, hit);
        handovers.push({
          from: prevEdge as string,
          to: id,
          outsideRingM: +hit.outsideM.toFixed(2),
          offBandSec: +offRun.toFixed(2),
          speedKmh: +Math.abs(c.tick.speedKmh).toFixed(1),
        });
      }
      if (isRing(id) && Math.abs(c.tick.laneOffsetM) > band) {
        if (offSince === null) offSince = c.t;
        offRun = c.t - offSince;
        if (offRun > longest) longest = offRun;
      } else {
        offSince = null;
        offRun = 0;
      }
      prevEdge = id;
    },
  };
}

/** One applied frame of the replay: the tick, the session before it, the step. */
export type AppliedFrame = LiveReplayFrameContext & { step: LessonStepResult };

/** Record `script` with the rung's own cast and replay it on the live chain. */
export function driveOnLiveChain(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  kind: "shadow" | "mistake",
  script: DriveScript,
  hook?: (c: AppliedFrame) => void,
): DriveReading & { out: ReturnType<typeof liveChainReplay> } {
  const raw = districtRaw(spec.map.districtId);
  const lesson = compileScenario(spec, level);
  const rec = recordScriptedDrive(raw, script, {
    scenarioId: spec.id,
    kind,
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
  });
  const watch = ringHandoverWatch(raw);
  let ticks = 0;
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace: rec.trace,
    holdAfterSec: 3,
    afterApply: (c) => {
      ticks++;
      watch.onTick(c);
      hook?.(c);
    },
  });
  return {
    out,
    graded: {
      recorder: rec.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code),
      violations: out.violationCodes,
      commendations: out.commendationCodes,
      teach: out.teachMomentCodes,
      lessonMistakes: (out.result.lessonMistakes ?? []).map((m) => [m.code, m.charged] as [string, boolean]),
      passed: out.result.passed,
      score: out.result.score,
      objectives: out.result.objectives.map((o) => (o.done ? "1" : "0")).join(""),
    },
    handovers: watch.handovers,
    longestRingOffBandSec: +watch.longestRingOffBandSec().toFixed(2),
    ticks,
  };
}

export const censusKey = (d: FamilyDemo, level: ScenarioLevel): string => `${d.spec.id}/${d.demo}/L${level}`;
