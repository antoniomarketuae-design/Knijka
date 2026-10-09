/**
 * sc-rb-lane-choice:ffdffd55 [critical], clause 1b — «the careful drive is never
 * credited» (rig-w2, 2026-10-08, at 43b4109).
 *
 * THE ROW. The rig's careful drive — inner lane past two exits, mirror, right
 * indicator, lane change out, third exit, at the lesson's own «около 12 км/ч»
 * (instruction 4) — ended «0 наказателни точки · НЕ Е ВЗЕТ» ★☆☆ on phone-L3,
 * pc-L1 and pc-L3, named for «Неустойчиво движение в лентата» and attributed to
 * the demo «Обикаляне по външната до далечния изход». The card came up with the
 * car inside the west arm's kerb lane. Only the variant that floored it to
 * 20 км/ч on leaving the ring passed — an acceleration the lesson never asks for.
 *
 * THE CAUSE is in `runtime/locator.ts` (see RING_RELEASE_OUTSIDE_M there, and
 * `runtime/__tests__/ring-exit-handover.test.ts` for the rule itself): the tick
 * stayed on the ring edge until r ≈ 42.2 with the lane offset saturated at
 * −4.06 m, 3.13 s at 11.6 км/ч, against laneKeepSustainSec = 3.
 *
 * WHAT THIS DRIVES — the capture's own drive (./rbExitDrives.ts), recorded with
 * each rung's cast and replayed through the LIVE chain (./liveChainReplay.ts)
 * at L1–L5, and asserts on what the product returned. Then the three things the
 * repair must NOT have bought: the lesson's own mistake still named, a real
 * straddle on the arm still billed, and nothing convicted on the arm that the
 * stale ring lock used to convict there.
 */

import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { LANE_WIDTH_M } from "../../../runtime";
import { recordScriptedDrive } from "../../../traces/recorder";
import {
  SC_RB_LANE_CHOICE_GEOMETRY as G,
  scRbLaneChoiceMistakeOuterLaneScript,
} from "../../../traces/scRbLaneChoice";
import { compileScenario } from "../compile";
import { scoreRubric } from "../rubric";
import { SC_RB_LANE_CHOICE } from "../templates-roundabout";
import type { ScenarioLevel } from "../types";
import { JUDGE_RING_KMH, judgeDriveScript, type JudgeDriveOptions } from "./rbExitDrives";
import { districtRaw, driveOnLiveChain, rungsOf } from "./rbFamilyCensus";

const LEVELS = rungsOf(SC_RB_LANE_CHOICE);
const BAND_M = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
const SUSTAIN_SEC = DEFAULT_RULE_CONFIG.laneKeepSustainSec;
/** Lane pitch (3.25 m × the perceptual road scale = 8.125 m). */
const LANE_M = LANE_WIDTH_M;
/** The west arm's kerb-lane centre in the locator's own arithmetic (1.5 pitches). */
const KERB_CENTRE_Y = 1.5 * LANE_M;

interface ArmTick {
  t: number;
  x: number;
  y: number;
  laneId: number;
  offsetM: number;
}

function judge(level: ScenarioLevel, opts: JudgeDriveOptions = {}) {
  const armTicks: ArmTick[] = [];
  const rhrConvictions: Array<{ t: number; x: number; y: number; edgeId: string | null }> = [];
  const r = driveOnLiveChain(SC_RB_LANE_CHOICE, level, "shadow", judgeDriveScript(opts), (c) => {
    const p = c.tick.position;
    if (c.tick.edgeId === "rb2-e-arm-w") {
      armTicks.push({ t: c.t, x: p.x, y: p.y, laneId: c.tick.laneId, offsetM: c.tick.laneOffsetM });
    }
    for (const e of c.tick.events) {
      if (e.kind === "prioritySituation" && e.situation === "right-hand-rule" && e.violated) {
        rhrConvictions.push({ t: c.t, x: p.x, y: p.y, edgeId: c.tick.edgeId ?? null });
      }
    }
  });
  return { ...r, armTicks, rhrConvictions };
}

const everyCode = (r: ReturnType<typeof judge>): string[] => [
  ...r.graded.recorder,
  ...r.graded.violations,
  ...r.graded.teach,
  ...r.graded.lessonMistakes.map((m) => m[0]),
  ...(r.out.result.coachedMistakes ?? []).map((m) => m.code),
];

describe("sc-rb-lane-choice:ffdffd55 1b — the judge's 12 км/ч exit, on the live chain, at every rung", () => {
  it("the lesson has all five rungs, and the capture's pace is the lesson's own «около 12 км/ч»", () => {
    expect(LEVELS).toEqual([1, 2, 3, 4, 5]);
    expect(JUDGE_RING_KMH).toBeGreaterThan(11);
    expect(JUDGE_RING_KMH).toBeLessThanOrEqual(12);
    const text = JSON.stringify(compileScenario(SC_RB_LANE_CHOICE, 1));
    expect(text).toContain("около 12 км/ч");
  });

  // Instruction 4 to the letter: the ring pace held all the way out (base:
  // 3.13 s on the ring edge past the band → the card, on every rung).
  const literal = LEVELS.map((level) => ({ level, r: judge(level, { accelAtR: null }) }));

  it("no «Неустойчиво движение в лентата» — not charged, not coached, not named, on any channel", () => {
    for (const { level, r } of literal) {
      expect(everyCode(r), `L${level}`).not.toContain("POOR_LANE_KEEPING");
      expect(r.graded.teach, `L${level}`).toEqual([]);
      expect(r.graded.lessonMistakes, `L${level}`).toEqual([]);
      expect(r.graded.violations, `L${level}`).toEqual([]);
      expect(r.graded.recorder, `L${level}`).toEqual([]);
      expect(r.out.debrief, `L${level}`).not.toMatch(/Неустойчиво движение в лентата/);
      expect(r.out.debrief, `L${level}`).not.toMatch(/встрани от средата на лентата/);
      expect(r.out.debrief, `L${level}`).not.toMatch(/Обикаляне по външната до далечния изход/);
    }
  });

  it("the lesson is TAKEN: three tasks, 0 т., 3★, ИЗДЪРЖАН, and both commendations the capture saw", () => {
    for (const { level, r } of literal) {
      const label = `L${level}`;
      expect(r.graded.objectives, label).toBe("111");
      expect(r.graded.score, label).toBe(0);
      expect(r.graded.passed, label).toBe(true);
      expect(scoreRubric(r.out.result, SC_RB_LANE_CHOICE.rubric!).stars, label).toBe(3);
      expect(r.out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
      expect(r.out.debrief, label).not.toMatch(/Грешката на този урок/);
      expect(r.graded.commendations, label).toEqual(["SAFE_LANE_CHANGE", "YIELDED_TO_PRIORITY"]);
      for (const o of r.out.outcomes) expect(o.detail, `${label} ${o.eventId}`).toBe("yielded");
      expect(r.out.ambientContacts, label).toEqual([]);
    }
  });

  it("the tick leaves the ring edge at the ring's kerb (base: 8.1 m beyond it, r ≈ 42.2) and had read past the band for under half a second (base: 3.13 s)", () => {
    for (const { level, r } of literal) {
      const label = `L${level}`;
      expect(r.handovers.map((h) => [h.from, h.to]), label).toEqual([["rb2-e-ring-nw", "rb2-e-arm-w"]]);
      const h = r.handovers[0];
      expect(h.outsideRingM, label).toBeGreaterThan(0.3);
      expect(h.outsideRingM, label).toBeLessThan(0.45);
      expect(h.offBandSec, label).toBeLessThan(0.5);
      // Nowhere on the ring — the lane change included — did it come near the sustain.
      expect(r.longestRingOffBandSec, label).toBeLessThan(SUSTAIN_SEC - 1.5);
    }
  });

  it("on the exit arm the lane offset is its real value: the car's distance from the kerb lane's centre, from the first arm tick", () => {
    for (const { level, r } of literal) {
      const label = `L${level}`;
      const first = r.armTicks[0];
      expect(Math.hypot(first.x, first.y), label).toBeLessThan(34.6); // base: 42.2
      expect(r.armTicks.length, label).toBeGreaterThan(100);
      for (const a of r.armTicks) {
        expect(a.laneId, label).toBe(0);
        // Driving west the kerb is to the north: left of travel = smaller y.
        expect(a.offsetM, `${label} t=${a.t.toFixed(2)}`).toBeCloseTo(KERB_CENTRE_Y - a.y, 6);
      }
      // The capture measured the car within ~0.2 m of the lane centre out here;
      // the arc joins the lane from 0.6 m out.
      expect(Math.max(...r.armTicks.map((a) => Math.abs(a.offsetM))), label).toBeLessThan(0.6);
      // Never the saturated half-pitch the stale lock read.
      expect(r.armTicks.some((a) => Math.abs(Math.abs(a.offsetM) - LANE_M / 2) < 0.01), label).toBe(false);
    }
  });

  it("pass or fail no longer turns on the exit pace: 10, 11.6 and 12 км/ч held, and the capture's two variants (20 км/ч asked at r > 40, at r > 34.5), all taken", () => {
    const variants: JudgeDriveOptions[] = [
      { ringKmh: 10, accelAtR: null }, // base: 3.65 s → the card
      { ringKmh: 12, accelAtR: null }, // base: 3.00 s, passed by one frame
      { accelAtR: 41 }, // base: 3.07 s → the card (the rig's own late ask)
      { accelAtR: 40 }, // the capture's primary drive as scripted (base in process: 2.98 s)
      { accelAtR: 34.5 }, // the capture's «x20», the only one the product passed
    ];
    for (const level of LEVELS) {
      for (const v of variants) {
        const r = judge(level, v);
        const label = `L${level} ${JSON.stringify(v)}`;
        expect(everyCode(r), label).toEqual([]);
        expect(r.graded.passed, label).toBe(true);
        expect(r.graded.objectives, label).toBe("111");
        expect(r.handovers[0].offBandSec, label).toBeLessThan(0.6);
      }
    }
  });
});

describe("what the repair must not have bought", () => {
  it("the two protected thresholds are where they were: off-centre past 3.25 m, sustained 3 s", () => {
    // Read as literals on purpose — a test that takes the threshold from the
    // config cannot notice the threshold being loosened.
    expect(DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM).toBe(3.25);
    expect(DEFAULT_RULE_CONFIG.laneKeepSustainSec).toBe(3);
  });

  it("the lesson's own mistake — the outer lane dragged to the far exit — is still named at every rung, and it is billed ON THE RING for the line it rode", () => {
    for (const level of LEVELS) {
      const label = `L${level}`;
      const billedAt: Array<{ r: number; edgeId: string | null; offsetM: number }> = [];
      const r = driveOnLiveChain(SC_RB_LANE_CHOICE, level, "mistake", scRbLaneChoiceMistakeOuterLaneScript(), (c) => {
        const named =
          (c.step.teachMoments ?? []).some((m) => m.code === "POOR_LANE_KEEPING") ||
          c.step.state.events
            .slice(c.session.events.length)
            .some((e) => e.kind === "violation" && e.code === "POOR_LANE_KEEPING");
        if (named) {
          billedAt.push({
            r: Math.hypot(c.tick.position.x, c.tick.position.y),
            edgeId: c.tick.edgeId ?? null,
            offsetM: c.tick.laneOffsetM,
          });
        }
      });
      expect(r.graded.passed, label).toBe(false);
      expect(r.graded.objectives, label).toBe("000");
      if (r.out.lesson.examMode === true) {
        expect(r.graded.violations, label).toEqual(["POOR_LANE_KEEPING"]);
      } else {
        expect(r.graded.lessonMistakes, label).toEqual([["POOR_LANE_KEEPING", false]]);
        expect(r.graded.teach, label).toEqual(["POOR_LANE_KEEPING"]);
        expect(r.out.debrief, label).toMatch(/Грешката на този урок/);
      }
      // Once, on a ring edge, at the drag radius (26.3 m: 3.76 m off the outer
      // lane's centre) — a measured offset, not the saturated half pitch.
      expect(billedAt.length, label).toBe(1);
      expect(billedAt[0].edgeId, label).toMatch(/^rb2-e-ring-/);
      expect(billedAt[0].r, label).toBeGreaterThan(G.DRAG_R - 0.5);
      expect(billedAt[0].r, label).toBeLessThan(G.DRAG_R + 0.5);
      expect(Math.abs(billedAt[0].offsetM), label).toBeGreaterThan(BAND_M);
      expect(Math.abs(billedAt[0].offsetM), label).toBeLessThan(LANE_M / 2 - 0.1);
      // The 15 s it spent on that line is all still read.
      expect(r.longestRingOffBandSec, label).toBeGreaterThan(15);
    }
  });

  it("a drive that really straddles the marking on the arm for more than 3 s is still billed — and the same drive on the lane's centre is not", () => {
    // The lesson ends at r > 46, so this one runs on the recorder's own grader
    // (the production runtime + rule engine, no objectives) out to x = −110.
    const stagedEvents = (compileScenario(SC_RB_LANE_CHOICE, 3).stagedEvents ?? []) as StagedEventSpec[];
    const drive = (armY: number) => {
      const ticks: Array<{ t: number; x: number; edgeId: string | null; off: number; painted: boolean }> = [];
      const rec = recordScriptedDrive(districtRaw("rb-2lane-v1"), judgeDriveScript({ accelAtR: null, armY, toX: -110 }), {
        scenarioId: SC_RB_LANE_CHOICE.id,
        kind: "mistake",
        seed: 7,
        stagedEvents,
        onTick: (tick) =>
          ticks.push({
            t: tick.t,
            x: tick.position.x,
            edgeId: tick.edgeId ?? null,
            off: tick.laneOffsetM,
            // The engine's own reading: only an explicit false stands the rule down.
            painted: tick.laneLinesPainted !== false,
          }),
      });
      return { rec, ticks };
    };
    // On the line between the arm's two westbound lanes: half a pitch off either.
    const straddle = drive(LANE_M);
    const billed = straddle.rec.ruleEvents.filter((e) => e.kind === "violation" && e.code === "POOR_LANE_KEEPING");
    expect(billed.length).toBe(1);
    const at = straddle.ticks.reduce((best, k) => (Math.abs(k.t - billed[0].t) < Math.abs(best.t - billed[0].t) ? k : best));
    expect(at.edgeId).toBe("rb2-e-arm-w");
    expect(at.painted).toBe(true);
    expect(Math.abs(at.off)).toBeGreaterThan(BAND_M);
    // Billed for the arm's painted stretch alone: 3 s after the paint began under it.
    const firstPaintedOff = straddle.ticks.find((k) => k.edgeId === "rb2-e-arm-w" && k.painted && Math.abs(k.off) > BAND_M)!;
    expect(billed[0].t - firstPaintedOff.t).toBeGreaterThanOrEqual(3 - 0.05);
    expect(billed[0].t - firstPaintedOff.t).toBeLessThan(3 + 0.1);
    // Control: the identical drive on the kerb lane's centre draws nothing.
    const centred = drive(G.WEST_CURB_Y);
    expect(centred.rec.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([]);
    expect(centred.ticks.filter((k) => k.edgeId === "rb2-e-arm-w" && k.painted).length).toBeGreaterThan(300);
  });

  it("a driver already out on the exit arm is not tried under the right-hand rule for a car still circulating behind him (base: «Непропускане», 10 т., at r = 39.3 on the arm)", () => {
    // The slow careful exit at L5, where an inner-lane circulator follows:
    // 8 км/ч held. Below laneChangeMinSpeedKmh, so no lane-change commendation —
    // and nothing else: both circulators were yielded to, nobody was touched.
    const runs = LEVELS.map((level) => ({ level, r: judge(level, { ringKmh: 8, accelAtR: null }) }));
    for (const { level, r } of runs) expect(r.rhrConvictions, `L${level}`).toEqual([]);
    for (const { level, r } of runs) expect(r.graded.violations, `L${level}`).not.toContain("FAILED_TO_YIELD");
    for (const { level, r } of runs) {
      const label = `L${level}`;
      expect(everyCode(r), label).toEqual([]);
      expect(r.graded.passed, label).toBe(true);
      expect(r.graded.score, label).toBe(0);
      for (const o of r.out.outcomes) expect(o.detail, `${label} ${o.eventId}`).toBe("yielded");
    }
  });
});
