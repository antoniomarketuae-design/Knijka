/**
 * WITNESS (not a closure) — sc-rb-lane-choice:ffdffd55 [critical].
 *
 *   «mobile-right — the careful drive — scores 33 т. with four convictions while
 *    the 58 км/ч wrong drive scores 20 т. The careful student is punished harder
 *    than the reckless one, and neither ever reaches the third exit.»
 *
 * WHY IT STAYS OPEN. The comparison is between two harness artefacts: the right
 * leg cannot hold the inner lane of the two-lane ring (R ≈ 22–30) past two
 * spokes, change out and signal right (no indicator input), and the wrong leg is
 * pedal-only, so it cannot commit the lesson's own mistake (the outer lane to
 * the far exit). In process the shadow was replayed through the full stack at
 * L3 only (s-w4-bot-completion), while every audit leg runs at L1.
 *
 * WHAT THIS DRIVES — the triage's «all-rung driveShadow», through the LIVE stack
 * (./liveChainReplay.ts: compileScenario(SC_RB_LANE_CHOICE, L) → staged +
 * stagedAdd — L5 adds the inner-lane circulator — under the director at the
 * live seed → the rung's traffic with LessonScene's options → applyTick →
 * buildLessonResult → buildDebrief):
 *
 *   · the authored correct drive (inner lane, two exits passed, lane change out,
 *     right indicator, third exit) at L1–L5: three tasks, zero violations, 3★;
 *   · the authored mistake «Обикаляне по външната до далечния изход» at L1–L5:
 *     BOTH lane gates missed, never passed, the lesson's own mistake named.
 *
 * Together they are the in-process answer to «the careful student is punished
 * harder»: on the same chain, at the audit rung, the careful drive is 0 т. and
 * ИЗДЪРЖАН and the outer-lane drive is not.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  scRbLaneChoiceMistakeOuterLaneScript,
  scRbLaneChoiceShadowScript,
} from "../../../traces/scRbLaneChoice";
import { compileScenario } from "../compile";
import { scoreRubric } from "../rubric";
import { SC_RB_LANE_CHOICE } from "../templates-roundabout";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_RB_LANE_CHOICE.map.districtId}.json`), "utf-8"),
);
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

function drive(level: ScenarioLevel, script: DriveScript): LiveReplayOutcome {
  const lesson = compileScenario(SC_RB_LANE_CHOICE, level);
  const rec = recordScriptedDrive(RAW, script, {
    scenarioId: SC_RB_LANE_CHOICE.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  return liveChainReplay({ lesson, districtRaw: RAW, trace: rec.trace, holdAfterSec: 3 });
}
const obj = (out: LiveReplayOutcome, id: string) => out.result.objectives.find((o) => o.id === id)!;

describe("sc-rb-lane-choice:ffdffd55 — the careful drive at every rung, on the live chain", () => {
  const runs = LEVELS.map((level) => ({ level, out: drive(level, scRbLaneChoiceShadowScript()) }));

  it("runs on rb-2lane-v1 with the rung's own cast (the inner circulator joins on L5), and every circulator is yielded to", () => {
    expect(SC_RB_LANE_CHOICE.map.districtId).toBe("rb-2lane-v1");
    for (const { level, out } of runs) {
      const ids = (out.lesson.stagedEvents ?? []).map((s: StagedEventSpec) => s.id);
      expect(ids, `L${level}`).toContain("sc-rb2-circulating");
      if (level === 5) expect(ids, "L5").toContain("sc-rb2-circulating-inner");
      for (const o of out.outcomes) expect(o.detail, `L${level} ${o.eventId}`).toBe("yielded");
      expect(out.ambientContacts, `L${level}`).toEqual([]);
    }
  });

  it("all three tasks in route order, zero violations, 0 т., 3★, ИЗДЪРЖАН — L1 included", () => {
    for (const { level, out } of runs) {
      const label = `L${level}`;
      expect(out.result.objectives.map((o) => [o.id, o.done]), label).toEqual([
        ["sc-rb2-inner-lane", true],
        ["sc-rb2-past-north", true],
        ["sc-rb2-exit", true],
      ]);
      expect(obj(out, "sc-rb2-inner-lane").completedAtSec!, label).toBeLessThan(obj(out, "sc-rb2-past-north").completedAtSec!);
      expect(obj(out, "sc-rb2-past-north").completedAtSec!, label).toBeLessThan(obj(out, "sc-rb2-exit").completedAtSec!);
      const exit = obj(out, "sc-rb2-exit");
      expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled, label).toBe(true);
      expect(out.violationCodes, label).toEqual([]);
      expect(out.result.score, label).toBe(0);
      expect(out.result.passed, label).toBe(true);
      expect(scoreRubric(out.result, SC_RB_LANE_CHOICE.rubric!).stars, label).toBe(3);
      expect(out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
    }
  });
});

describe("sc-rb-lane-choice:ffdffd55 — the lesson's own mistake (outer lane to the far exit) at every rung", () => {
  const runs = LEVELS.map((level) => ({ level, out: drive(level, scRbLaneChoiceMistakeOuterLaneScript()) }));

  it("misses BOTH lane gates and is never passed — at L1 as everywhere", () => {
    for (const { level, out } of runs) {
      const label = `L${level}`;
      expect(obj(out, "sc-rb2-inner-lane").done, label).toBe(false);
      expect(obj(out, "sc-rb2-past-north").done, label).toBe(false);
      expect(out.result.passed, label).toBe(false);
    }
  });

  it("the lesson's own mistake is named: on the practice rungs taught first (Ruling A — named, not charged, lesson not taken); on the exam rung charged", () => {
    for (const { level, out } of runs) {
      const label = `L${level}`;
      const graded = [...out.violationCodes, ...(out.result.coachedMistakes ?? []).map((m) => m.code)];
      expect(graded, label).toContain("POOR_LANE_KEEPING");
      if (out.lesson.examMode === true) {
        expect(out.violationCodes, label).toContain("POOR_LANE_KEEPING");
      } else {
        expect(out.result.lessonMistakes?.map((m) => [m.code, m.charged]), label).toEqual([["POOR_LANE_KEEPING", false]]);
        expect(out.debrief, label).toMatch(/Грешката на този урок/);
      }
    }
  });

  it("the careful drive is never scored worse than this one, on any rung", () => {
    for (const level of LEVELS) {
      const careful = drive(level, scRbLaneChoiceShadowScript());
      const reckless = runs.find((r) => r.level === level)!.out;
      expect(careful.result.score, `L${level}`).toBeLessThanOrEqual(reckless.result.score);
      expect(careful.result.passed && !reckless.result.passed, `L${level}`).toBe(true);
    }
  });
});
