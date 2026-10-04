/**
 * WITNESS — sc-mv-uturn-ban:e98407b1 (major): «The wrong drive is convicted for
 * a crash and a speed slip, not for the U-turn ban. The debrief lists 1 опасна
 * (сблъсък) + 1 второстепенна (превишена скорост) = 11 точки and never mentions
 * В23 or turning against a solid axis line. The lesson's own rule is never the
 * ground of the verdict on either the right or the wrong side.»
 *
 * A WITNESS FOR A JUDGE, NOT A CLOSURE. Every live wrong leg filed against the
 * row (w46/w47/w61) was pedals-only — «STEERING: 0 trace commands», guidance
 * loop NOT-RUN — so the 180° turn across the solid axis was never attempted and
 * its convictions were the harness's own careless rests. This file drives the
 * act the row is about — the textbook-executed U-turn at the TEMPTING spot
 * (y ≈ 124-131, inside the М1 span y ∈ [40, 220] of mv-uturn-v1's
 * mvu-e-ban, which runs (0,0) → (0,280), so sM is y) — through each rung the
 * student gets (witnessLiveRung.ts: the compiled rung's own stagedEvents —
 * L5 adds sc-mvu-stream-2 by stagedAdd — under the live seed, its ambient
 * baseline, createLessonSession → applyTick → buildLessonResult →
 * buildDebrief → gradeFinishWire) and asserts:
 *   1. the car really turned round across the axis inside the span (heading
 *      reversed, centre at x < 0 on the billing tick), with NO collision and
 *      NO speed code — the filed «сблъсък + превишена скорост = 11» is not
 *      what this act produces;
 *   2. CROSSED_SOLID_LINE fires for it, ONCE, inside the span — taught free the
 *      first time (ruling 16) and folded as THE LESSON'S OWN MISTAKE (Ruling A /
 *      ADR-009), carrying the target's demo title «Обръщане през плътната
 *      линия» that the result screen prints («Това е грешката от
 *      демонстрацията …», SessionEndScreen);
 *   3. the verdict's GROUND is that rule: the debrief opens «не е взет:
 *      допусна „Пресичане на непрекъсната осева линия“ — точно грешката, която
 *      този урок учи», and the «Грешката на този урок» block names the act with
 *      its reason and corrective; the server fold agrees;
 *   4. on the RIGHT side the same rule is the ground of the pass: the shadow
 *      clears the ban, turns at the lawful gap, 0 т., 3★, with no
 *      CROSSED_SOLID_LINE (the s-w6 block pins the details at L3; here at every
 *      rung through the live wiring).
 * On the exam rung (L4, ADR-009-exempt by ruling) the crossing is billed on the
 * изпитен лист as основна, 3 т.
 *
 * WHAT IT DOES NOT CLAIM: the debrief text cites the solid осева (М1) as the
 * ground; it does not name В23 (mv-uturn-v1 marks the В23 sign `graded:
 * false`, and the template teaches that the solid axis ALONE forbids the turn,
 * instruction 1). The «Правилното действие» line is the catalogue's generic
 * CROSSED_SOLID_LINE corrective («Изпреварвай или заобикаляй чак където линията
 * стане прекъсната…»), not a U-turn-specific one — reported to the judge, not
 * pinned either way here.
 *
 * KILL-CHECKS (each reddens this file; restored, sha-verified):
 *   · rules/engine.ts solidCrossCond → never true (`false && …`);
 *   · lessons/lessonMistake.ts foldLessonMistakes → returns [] (no fold).
 */

import { describe, expect, it } from "vitest";
import { scMvUturnBanMistakeCrossSolidScript, scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { lessonMistakeCopy } from "../../lessonMistake";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { scoreRubric } from "../rubric";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const BAN = { fromY: 40, toY: 220 };
const PRACTICE = [1, 2, 3, 5] as const;

function wrap180(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function firstBill(o: LiveRungOutcome, code: string): { t: number; x: number; y: number } | null {
  const coachedT = (o.result.coachedMistakes ?? []).find((c) => c.code === code)?.t;
  const scoredT = o.session.events.find((e) => e.kind === "violation" && e.code === code)?.t;
  const t = Math.min(coachedT ?? Infinity, scoredT ?? Infinity);
  if (!Number.isFinite(t)) return null;
  const tk = o.ticks.reduce((b, k) => (Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b));
  return { t, x: tk.position.x, y: tk.position.y };
}

function serverFold(o: LiveRungOutcome) {
  return gradeFinishWire({
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
  });
}

describe("WITNESS sc-mv-uturn-ban:e98407b1 — the U-turn across the solid axis is the ground of the verdict", () => {
  for (const level of PRACTICE) {
    it(`L${level}: the turn is real, CROSSED_SOLID_LINE fires inside the М1 span, is the lesson's mistake, and the debrief says so — НЕ Е ВЗЕТ`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, scMvUturnBanMistakeCrossSolidScript());
      // 1 — the act: the car turned round (heading reversed) and came away on the opposing bank…
      const first = o.ticks.find((k) => Math.abs(k.speedKmh) > 5)!;
      const last = o.ticks[o.ticks.length - 1];
      expect(Math.abs(wrap180(last.headingDeg - first.headingDeg))).toBeGreaterThan(150);
      expect(last.position.x).toBeLessThan(0);
      // …with nothing struck and no speed fault — not the filed «сблъсък + превишена скорост».
      for (const c of ["COLLISION", "SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS"]) {
        expect(o.scored, c).not.toContain(c);
        expect(o.coached, c).not.toContain(c);
      }
      // 2 — CROSSED_SOLID_LINE, once, billed with the centre across the axis inside the span.
      const bill = firstBill(o, "CROSSED_SOLID_LINE");
      expect(bill, "CROSSED_SOLID_LINE billed").not.toBeNull();
      expect(bill!.y).toBeGreaterThanOrEqual(BAN.fromY);
      expect(bill!.y).toBeLessThanOrEqual(BAN.toY);
      expect(bill!.x).toBeLessThan(0);
      expect([...o.taught, ...o.scored].filter((c) => c === "CROSSED_SOLID_LINE")).toHaveLength(1);
      expect(o.taught).toContain("CROSSED_SOLID_LINE");
      // Ruling A — the lesson's own target, folded with its demo title.
      const hit = (o.result.lessonMistakes ?? []).find((h) => h.code === "CROSSED_SOLID_LINE");
      expect(hit).toBeDefined();
      expect(hit!.charged).toBe(false);
      expect(hit!.demoTitleBg).toBe("Обръщане през плътната линия");
      expect(o.result.passed).toBe(false);
      expect(scoreRubric(o.result, SC_MV_UTURN_BAN.rubric!).stars).toBe(1);
      // 3 — the debrief's ground is that rule, named with its reason and corrective.
      const copy = lessonMistakeCopy(hit!)!;
      expect(o.debrief).toContain(`не е взет: допусна „${copy.titleBg}“ — точно грешката, която този урок учи`);
      expect(o.debrief).toContain(
        "Грешката на този урок (при първа поява не влиза в наказателните точки, но урокът не се зачита):",
      );
      expect(o.debrief).toContain(`• ${copy.titleBg}`);
      expect(o.debrief).toContain(`→ Защо: ${copy.explanationBg}`);
      expect(o.debrief).toMatch(/непрекъснат/);
      // …and the server's fold — the verdict that is stored — agrees.
      const graded = serverFold(o);
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") return;
      expect(graded.result.passed).toBe(false);
      expect((graded.result.lessonMistakes ?? []).map((h) => h.code)).toEqual(["CROSSED_SOLID_LINE"]);
    });
  }

  it("L4 (exam, ADR-009-exempt): the crossing is billed on the изпитен лист — основна, 3 т., inside the span", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 4, scMvUturnBanMistakeCrossSolidScript());
    const bill = firstBill(o, "CROSSED_SOLID_LINE");
    expect(bill).not.toBeNull();
    expect(bill!.y).toBeGreaterThanOrEqual(BAN.fromY);
    expect(bill!.y).toBeLessThanOrEqual(BAN.toY);
    const billed = o.result.summary.mistakes.filter((m) => m.code === "CROSSED_SOLID_LINE");
    expect(billed).toHaveLength(1);
    expect(billed[0].severityClass).toBe("osnovna");
    expect(billed[0].points).toBe(3);
    expect(o.result.lessonMistakes ?? []).toEqual([]);
    expect(o.result.passed).toBe(false);
  });

  for (const level of [1, 2, 3, 4, 5] as const) {
    it(`L${level}: the RIGHT side — the shadow passes the ban, turns at the lawful gap: 0 т., 3★, no crossing`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, scMvUturnBanShadowScript());
      expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": true });
      expect(o.result.passed).toBe(true);
      expect(o.result.score).toBe(0);
      expect(scoreRubric(o.result, SC_MV_UTURN_BAN.rubric!).stars).toBe(3);
      expect(firstBill(o, "CROSSED_SOLID_LINE")).toBeNull();
      expect(o.result.lessonMistakes ?? []).toEqual([]);
    });
  }
});
