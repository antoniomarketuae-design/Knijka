/**
 * WITNESS — sc-fo-motorway-gap:d18105c7 (critical): «the reckless driver gets
 * the route credit the careful driver is denied».
 *
 * A WITNESS FOR A JUDGE, NOT A CLOSURE. The comparative half of the row is
 * already dead on four rounds (the careful leg passes ИЗДЪРЖАН with both
 * objectives; in process the shadow passes 3★, s-w8-bot-completion). The half
 * that survives is: does a driver who SUSTAINS a short gap at motorway speed —
 * and gets away with it, stopping behind the braking lead without touching it
 * — still have the lesson counted? No live leg has ever produced that
 * antecedent: the pedal-only wrong leg's lead-close profile was withdrawn as
 * unreachable after it rear-ended the lead (tools/mobile/lib/driveline.mjs),
 * and in process the two committed mistake demos either end BEFORE the staged
 * brake (mistake-one-second) or crash (mistake-bumper-crash). So no whole-drive
 * «short gap, no contact» tape existed. This file authors one.
 *
 * THE TAPE — «една секунда до спирането». Every number is the product's own:
 *  · it accelerates to 138 км/ч — UNDER the posted 140 and under the
 *    sc-fmg-gap arrival cap of 140, so no speed code can stand in for the gap
 *    fault and the checkpoint is honestly earned (the committed one-second demo
 *    crosses the checkpoint at 143.88 and is refused by the cap alone);
 *  · FMG_LEAD is capped at maxMatchSpeedMps 34 (122.4 км/ч), so 138 closes the
 *    76 m cushion at ~4.3 m/s until y = 650, then holds the lead's 122 —
 *    ~31-36 m, 0.9-1.06 s — all the way to the staged brake (the lead reaches
 *    cutAt y = 720 with the car ~33 m behind it);
 *  · it then brakes (≤ 8 m/s² authored, planned at 0.7× — the recorder's law)
 *    to rest at y ≈ 800, INSIDE sc-fmg-stop's 18 m disc at y = 790 and under
 *    its 8 км/ч cap, with no contact: every objective of the lesson is done.
 * The engine's own fire line (rules/engine.ts, FOLLOWING_TOO_CLOSE): gap <
 * followSafeSeconds 1.8 × v × followFireRatio 0.7 = 1.26 s, held
 * followSustainSec 2 s, gap not opening ≥ 0.5 m/s. The tape sits under that
 * line for many seconds — asserted below as an observation, not assumed.
 *
 * THE CHAIN: the committed mw-v1 district → createWorldRuntime +
 * createTrafficSystem + createScenarioDirector with the rung's OWN compiled
 * stagedEvents under the live seed lessonSeed(`sc-fo-motorway-gap@L<n>`) and
 * its ambient baseline (0) → createLessonSession / applyTick (the rung's
 * ruleConfig — followRainAwareEnabled — the teach-first coach, ADR-009) →
 * buildLessonResult → buildDebrief → gradeFinishWire (the server's fold).
 * See witnessLiveRung.ts for what that harness does NOT reproduce.
 *
 * WHAT IT SHOWS AT b8269ed6 (asserted below): at every practice rung
 * FOLLOWING_TOO_CLOSE is TAUGHT (first-fault grace, ruling 16), folded as the
 * lesson's own mistake (Ruling A / ADR-009), named in the debrief, and the
 * lesson is NOT taken — on a drive that completes every objective. At the exam
 * rung (L4, ADR-009-exempt by ruling) the gap is billed on the изпитен лист
 * as основна and the Наредба-38 verdict stands on the points.
 *
 * THE SCRIPT LIVES HERE (the solid-line-clean-gate.test.ts precedent): it is a
 * witness for a judge, not a demo a student is ever shown, so it is NOT added
 * to traces/scFoMotorwayGap.ts SCRIPTS and NOT committed under content/traces/
 * — where seven censuses (reviewed-text manifest, caption truth, spoiler,
 * wet-copy, claim gates, off-carriageway, annotation ticks) and the public
 * ghost-demo copy would treat it as a student-facing mistake demo that no
 * template references. Its recording is committed beside this file as a
 * `.fixture.json` (the __tests__ fixture convention), byte-gated below.
 * RE-RECORD: RECORD_TRACES=1 npx vitest run <this file>
 *
 * KILL-CHECKS (each reddens an assertion here, restored and sha-verified):
 *  · rules/engine.ts — `stepEpisode(s.following, tailgating, …)` → never fires;
 *  · lessons/lessonMistake.ts foldLessonMistakes → returns [] (no fold).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { parseScenarioTrace, serializeScenarioTrace } from "../../../traces/parse";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { lessonMistakeCopy } from "../../lessonMistake";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { scoreRubric } from "../rubric";
import { SC_FO_MOTORWAY_GAP } from "../templates-following2";
import { driveLiveRung, loadDistrict, type LiveRungOutcome } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "sc-fo-motorway-gap-one-second-to-stop.fixture.json");
const RECORD = process.env.RECORD_TRACES === "1";

/** mw-v1 northbound cruise-lane centre (MW_X_CRUISE). */
const X = 0;
/** The engine's fire line, s: followSafeSeconds × followFireRatio (DEFAULT_RULE_CONFIG). */
const FIRE_LINE_SEC = 1.8 * 0.7;

function oneSecondToStopScript(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      // Close the 76 m cushion at 138 — under the posted 140 and the checkpoint cap.
      { kind: "drive", points: [[X, 15], [X, 400], [X, 650]], targetKmh: 138, stopAtEnd: false },
      // Sit on the lead at its own 122 — about one second — up to its brake.
      { kind: "drive", points: [[X, 650], [X, 690]], targetKmh: 122, stopAtEnd: false },
      // The lead brakes at cutAt y = 720; stop behind it, inside the stop disc, no contact.
      { kind: "drive", points: [[X, 690], [X, 800]], targetKmh: 122, stopAtEnd: true, maxDecelMps2: 8 },
      { kind: "pause", sec: 2.5, brake: true },
    ],
  };
}

interface GapProfile {
  /** Longest unbroken stretch, s, with the car ≥ 60 км/ч and the gap under the fire line. */
  longestUnderFireLineSec: number;
  minGapSec: number;
  maxKmh: number;
  restY: number;
}

function gapProfile(o: LiveRungOutcome): GapProfile {
  let longest = 0;
  let since: number | null = null;
  let minGapSec = Infinity;
  let maxKmh = 0;
  for (const tk of o.ticks) {
    const kmh = Math.abs(tk.speedKmh);
    maxKmh = Math.max(maxKmh, kmh);
    const g = tk.leadGapM;
    const under = kmh >= 60 && g !== undefined && g !== null && g / (kmh / 3.6) < FIRE_LINE_SEC;
    if (g !== undefined && g !== null && kmh >= 60) minGapSec = Math.min(minGapSec, g / (kmh / 3.6));
    if (under) {
      if (since === null) since = tk.t;
      longest = Math.max(longest, tk.t - since);
    } else since = null;
  }
  const last = o.ticks[o.ticks.length - 1];
  return { longestUnderFireLineSec: longest, minGapSec, maxKmh, restY: last.position.y };
}

const RUNGS = [1, 2, 3, 4, 5] as const;
const outcomes = new Map<number, LiveRungOutcome>(
  RUNGS.map((l) => [l, driveLiveRung(SC_FO_MOTORWAY_GAP, l, oneSecondToStopScript())]),
);

describe("WITNESS sc-fo-motorway-gap:d18105c7 — the antecedent is really driven (observed, at every rung)", () => {
  for (const level of RUNGS) {
    it(`L${level}: a sustained sub-1.26 s gap under the limit, to the staged brake, then rest inside the stop disc with no contact`, () => {
      const o = outcomes.get(level)!;
      const p = gapProfile(o);
      // Short gap, sustained — measured 6.1-6.6 s unbroken at >= 60 km/h, three times the engine's 2 s sustain.
      expect(p.longestUnderFireLineSec).toBeGreaterThan(5);
      expect(p.minGapSec).toBeLessThan(1.0);
      // Never over the posted 140 / the checkpoint cap: no speed code can carry the verdict.
      expect(p.maxKmh).toBeLessThanOrEqual(140);
      expect(o.scored).not.toContain("SPEEDING_OVER_LIMIT");
      expect(o.coached).not.toContain("SPEEDING_OVER_LIMIT");
      // The lead really braked in front of it (the staged event resolved), and nothing was struck.
      expect(o.scored).not.toContain("COLLISION");
      expect(o.drive.outcomes.some((x) => x.detail === "collision")).toBe(false);
      // At rest inside sc-fmg-stop's disc (y = 790 ± 18).
      expect(Math.abs(p.restY - 790)).toBeLessThan(18);
      // …so every objective of the lesson is done: the verdict below cannot come from a gate.
      expect(o.done).toEqual({ "sc-fmg-gap": true, "sc-fmg-stop": true });
      expect(o.result.completedAll).toBe(true);
    });
  }
});

describe("WITNESS sc-fo-motorway-gap:d18105c7 — the gap is the lesson's own mistake, and the lesson is not taken (Ruling A)", () => {
  for (const level of [1, 2, 3, 5] as const) {
    it(`L${level}: FOLLOWING_TOO_CLOSE is taught on first encounter, folded as the lesson mistake, named in the debrief — НЕ Е ВЗЕТ`, () => {
      const o = outcomes.get(level)!;
      // Ruling 16 — the first occurrence is shown, not charged. At L5 (rain, the
      // rung opts into FOLLOWING_TOO_CLOSE_FOR_RAIN) the CARD goes to the rain
      // variant, which fires first in the closing band; the dry code's first
      // occurrence is then coached without a second card. Either way, never a fine.
      expect(o.taught).toContain(level === 5 ? "FOLLOWING_TOO_CLOSE_FOR_RAIN" : "FOLLOWING_TOO_CLOSE");
      expect(o.coached).toContain("FOLLOWING_TOO_CLOSE");
      // Ruling A / ADR-009 — the lesson's own target, folded on the client…
      expect(o.lesson.lessonMistakeTargets?.map((t) => t.code)).toContain("FOLLOWING_TOO_CLOSE");
      const hit = (o.result.lessonMistakes ?? []).find((h) => h.code === "FOLLOWING_TOO_CLOSE");
      expect(hit, "FOLLOWING_TOO_CLOSE folded as the lesson's mistake").toBeDefined();
      // …and that alone fails a drive that completed every objective.
      expect(o.result.completedAll).toBe(true);
      expect(o.result.passed).toBe(false);
      expect(scoreRubric(o.result, SC_FO_MOTORWAY_GAP.rubric!).stars).toBe(1);
      // THEO-4: the debrief names the act, why, and what to do instead.
      const copy = lessonMistakeCopy(hit!)!;
      expect(copy).not.toBeNull();
      expect(o.debrief).toContain(copy.titleBg);
      if (!hit!.charged) {
        expect(o.debrief).toMatch(/Грешк(ата|ите) на този урок \(при първа поява не влиза в наказателните точки, но урокът не се зачита\):/);
        expect(o.debrief).toContain(`→ Правилното действие: ${copy.correctiveBg}`);
      }
      // The server's own fold agrees (the stored verdict is not the client's opinion).
      const graded = gradeFinishWire({
        lessonId: o.lesson.id,
        startedAtMs: 1_000,
        finishedAtMs: 1_000 + Math.round(o.result.durationSec * 1000),
        aborted: false,
        ruleEvents: serializeRuleEvents(o.session.events),
        objectives: o.result.objectives.map((ob) => ({
          id: ob.id,
          done: ob.done,
          completedAtSec: ob.completedAtSec,
          ...(ob.detail !== undefined ? { detail: ob.detail } : {}),
        })),
        coachedMistakes: (o.result.coachedMistakes ?? []).map((c) => ({
          code: c.code,
          t: c.t,
          ...(c.detail !== undefined ? { detail: c.detail } : {}),
        })),
      } as Parameters<typeof gradeFinishWire>[0]);
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") return;
      expect(graded.result.passed).toBe(false);
      expect((graded.result.lessonMistakes ?? []).map((h) => h.code)).toContain("FOLLOWING_TOO_CLOSE");
    });
  }

  it("L4 (exam, ADR-009-exempt by ruling): the gap is BILLED on the изпитен лист as основна; no lesson fold", () => {
    const o = outcomes.get(4)!;
    expect(o.lesson.examMode).toBe(true);
    expect(o.taught).toEqual([]);
    expect(o.scored).toContain("FOLLOWING_TOO_CLOSE");
    const billed = o.result.summary.mistakes.filter((m) => m.code === "FOLLOWING_TOO_CLOSE");
    expect(billed.length).toBeGreaterThan(0);
    for (const m of billed) expect(m.points).toBe(3);
    expect(o.result.lessonMistakes ?? []).toEqual([]);
  });
});

describe("the committed tape — determinism law (demo convention: base staged, seed 7)", () => {
  const record = () =>
    recordScriptedDrive(loadDistrict("mw-v1"), oneSecondToStopScript(), {
      scenarioId: SC_FO_MOTORWAY_GAP.id,
      kind: "mistake",
      seed: 7,
      stagedEvents: [...(SC_FO_MOTORWAY_GAP.staged ?? [])] as StagedEventSpec[],
    });
  const drive = record();

  it("the recorder's own engine bills exactly FOLLOWING_TOO_CLOSE, and no contact", () => {
    const codes = [...new Set(drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code))];
    expect(codes).toEqual(["FOLLOWING_TOO_CLOSE"]);
    expect(drive.outcomes.some((x) => x.detail === "collision")).toBe(false);
  });

  it("the committed fixture is exactly this script's recording, and replays identically", () => {
    const serialized = serializeScenarioTrace(drive.trace) + "\n";
    if (RECORD) writeFileSync(FIXTURE, serialized);
    expect(existsSync(FIXTURE), `${FIXTURE} missing — RECORD_TRACES=1`).toBe(true);
    expect(readFileSync(FIXTURE, "utf-8")).toBe(serialized);
    expect(serializeScenarioTrace(record().trace) + "\n").toBe(serialized);
    const parsed = parseScenarioTrace(JSON.parse(readFileSync(FIXTURE, "utf-8")));
    expect(parsed?.meta.scenarioId).toBe("sc-fo-motorway-gap");
  });
});
