/**
 * WITNESS (not a closure) — sc-junction-rhr:83b4fd69 and sc-junction-gap:63e4e93e,
 * both critical, both «the CORRECT drive is convicted».
 *
 * WHY THESE ROWS STAY OPEN. Every convicted live leg left its authored line by
 * 13–45 m and was billed inside a harness off-road or recovery stretch: the live
 * harness has no gap acceptance, its hazard loop is blind to crossing traffic,
 * and it cannot hold a left turn out of a T-junction mouth on its line. So no
 * live leg has yet DRIVEN the correct act at L1 with the lesson's whole cast.
 *
 * WHAT THE EXISTING IN-PROCESS PROOF LEFT OUT (the triage's own words).
 * `s2-junction-bot-completion` and `s3-ju-bot-completion` drive the shadow at
 * L3 through the recorder's harness stack: `scJunctions.ts` records only
 * `SC_JUNCTION_RHR.staged`, so the SECOND right-hand car
 * (SC_JUNCTION_RHR_CONFLICT_2, `stagedAdd` on EVERY rung) and the ambient street
 * (the junction family baseline, 4/4/5/5/6 — L5 authors 8 for rhr) were never in
 * the drive the student is said to pass.
 *
 * WHAT THIS DRIVES. The lesson's own authored correct drive (the committed
 * shadow script — approach, left indicator, look left then right, stop outside
 * the 18 m conviction core, wait, turn) replayed through the LIVE stack at every
 * rung: compileScenario(spec, level) → the rung's whole cast (`staged` +
 * `stagedAdd`) under createScenarioDirector at the live seed, the rung's ambient
 * traffic built with LessonScene's own options, createLessonSession/applyTick,
 * buildLessonResult, buildDebrief (see ./liveChainReplay.ts — rapier's ambient
 * contacts are stood in for and asserted ABSENT).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive } from "../../../traces/recorder";
import { SC_JUNCTION_RECORDINGS } from "../../../traces/scJunctions";
import { SC_JUNCTION2_RECORDINGS } from "../../../traces/scJunctions2";
import { compileScenario } from "../compile";
import { scoreRubric } from "../rubric";
import { SC_JUNCTION_RHR, SC_JUNCTION_RHR_CONFLICT_2 } from "../templates-junctions";
import { SC_JUNCTION_GAP } from "../templates-junctions2";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const district = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

function driveRhr(level: ScenarioLevel): LiveReplayOutcome {
  const lesson = compileScenario(SC_JUNCTION_RHR, level);
  const raw = district(SC_JUNCTION_RHR.map.districtId);
  const rec = SC_JUNCTION_RECORDINGS["sc-junction-rhr"].drives["shadow-correct"]!;
  // The pose source: the authored correct drive, recorded against THIS rung's
  // whole cast (staged + stagedAdd) so the trace is the drive the rung grades.
  const drive = recordScriptedDrive(raw, rec.script(), {
    scenarioId: SC_JUNCTION_RHR.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  return liveChainReplay({ lesson, districtRaw: raw, trace: drive.trace, holdAfterSec: 3 });
}

function driveGap(level: ScenarioLevel): LiveReplayOutcome {
  const lesson = compileScenario(SC_JUNCTION_GAP, level);
  const raw = district(SC_JUNCTION_GAP.map.districtId);
  const rec = SC_JUNCTION2_RECORDINGS["sc-junction-gap"].drives["shadow-correct"]!;
  const drive = recordScriptedDrive(raw, rec.script(), {
    scenarioId: SC_JUNCTION_GAP.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  return liveChainReplay({ lesson, districtRaw: raw, trace: drive.trace, holdAfterSec: 3 });
}

describe("sc-junction-rhr:83b4fd69 — the correct drive yields to BOTH right-hand cars at every rung, with the street live", () => {
  const runs = LEVELS.map((level) => ({ level, out: driveRhr(level) }));

  it("the drive is the one the row is about: both staged right-hand cars and the rung's ambient street are in it", () => {
    for (const { level, out } of runs) {
      const ids = (out.lesson.stagedEvents ?? []).map((s: StagedEventSpec) => s.id);
      expect(ids, `L${level}`).toEqual(["sc-jrhr-conflict", SC_JUNCTION_RHR_CONFLICT_2.id]);
      expect(out.lesson.traffic?.vehicleCount ?? 0, `L${level} ambient`).toBeGreaterThanOrEqual(4);
      // Both conflicts were REAL and were yielded to — not cancelled, not
      // „notEncountered", not a clear junction the drive happened to find.
      const byId = new Map(out.outcomes.map((o) => [o.eventId, o]));
      expect(byId.get("sc-jrhr-conflict")?.detail, `L${level} first car`).toBe("yielded");
      expect(byId.get(SC_JUNCTION_RHR_CONFLICT_2.id)?.detail, `L${level} second car`).toBe("yielded");
      // No ambient car was driven through (the in-process stand-in for rapier).
      expect(out.ambientContacts, `L${level}`).toEqual([]);
    }
  });

  it("credited, not convicted: passed, 0 points, both tasks ticked, zero violations, the yield commended — at L1 and every rung", () => {
    for (const { level, out } of runs) {
      const label = `L${level}`;
      expect(out.session.phase, label).toBe("completed");
      expect(out.result.passed, label).toBe(true);
      expect(out.result.score, label).toBe(0);
      expect(out.result.completedAll, label).toBe(true);
      expect(out.result.objectives.map((o) => [o.id, o.done]), label).toEqual([
        ["sc-jrhr-approach", true],
        ["sc-jrhr-cross", true],
      ]);
      expect(out.violationCodes, label).toEqual([]);
      expect(out.result.lessonMistakes ?? [], label).toEqual([]);
      expect(out.commendationCodes, label).toContain("YIELDED_TO_PRIORITY");
      expect(scoreRubric(out.result, SC_JUNCTION_RHR.rubric!).stars, label).toBe(3);
    }
  });

  it("the debrief the student reads says ИЗДЪРЖАН with no penalty points (not «Не всички задачи…»)", () => {
    for (const { level, out } of runs) {
      expect(out.debrief, `L${level}`).not.toMatch(/Не всички задачи/);
      expect(out.debrief, `L${level}`).not.toMatch(/НЕИЗДЪРЖАН/);
      expect(out.debrief, `L${level}`).toMatch(/е издържан: 0 наказателни точки/);
      expect(out.result.summary.terminated, `L${level}`).toBe(false);
    }
  });
});

describe("sc-junction-gap:63e4e93e — the correct right turn is credited and no collision is billed, at L1 with ambient traffic", () => {
  const runs = LEVELS.map((level) => ({ level, out: driveGap(level) }));

  it("the cast and the street are the rung's own; the conflict was yielded; no ambient car was touched", () => {
    for (const { level, out } of runs) {
      expect((out.lesson.stagedEvents ?? []).map((s: StagedEventSpec) => s.id), `L${level}`).toEqual(["sc-jgap-conflict"]);
      expect(out.lesson.traffic?.vehicleCount ?? 0, `L${level} ambient`).toBeGreaterThanOrEqual(4);
      expect(out.outcomes.find((o) => o.eventId === "sc-jgap-conflict")?.detail, `L${level}`).toBe("yielded");
      expect(out.ambientContacts, `L${level}`).toEqual([]);
    }
  });

  it("passed at 0 points with all three tasks ticked — the right turn out east included — and no COLLISION anywhere", () => {
    for (const { level, out } of runs) {
      const label = `L${level}`;
      expect(out.result.passed, label).toBe(true);
      expect(out.result.score, label).toBe(0);
      expect(out.result.objectives.map((o) => [o.id, o.done]), label).toEqual([
        ["sc-jgap-approach", true],
        ["sc-jgap-line", true],
        ["sc-jgap-exit", true],
      ]);
      expect(out.violationCodes, label).not.toContain("COLLISION");
      expect(out.violationCodes, label).toEqual([]);
      expect(out.result.summary.terminated, label).toBe(false);
      // Both of the lesson's commendations, on a card that ALSO passes the drive
      // — the reward-and-fail contradiction the row photographed is absent.
      expect(out.commendationCodes, label).toEqual(
        expect.arrayContaining(["YIELDED_TO_PRIORITY", "FULL_STOP_AT_STOP_SIGN"]),
      );
      expect(out.debrief, label).not.toMatch(/НЕИЗДЪРЖАН/);
      expect(out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
    }
  });
});
