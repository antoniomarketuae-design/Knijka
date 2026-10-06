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
 *      допусна „Обратен завой през непрекъсната осева линия“ — точно грешката,
 *      която този урок учи», and the «Грешката на този урок» block names the
 *      act with its reason and corrective; the server fold agrees;
 *   4. on the RIGHT side the same rule is the ground of the pass: the shadow
 *      clears the ban, turns at the lawful gap, 0 т., 3★, with no
 *      CROSSED_SOLID_LINE (the s-w6 block pins the details at L3; here at every
 *      rung through the live wiring).
 * On the exam rung (L4, ADR-009-exempt by ruling) the crossing is billed on the
 * изпитен лист as основна, 3 т.
 *
 * THE TWO THINGS THIS FILE USED TO BANK FOR A JUDGE ARE NOW PINNED
 * (sc-mv-uturn-ban:6d60c160 «the debrief explains overtaking after a U-turn»,
 * and the В23 clause of e98407b1):
 *   5. THE CORRECTIVE EXPLAINS THE U-TURN THAT WAS MADE. The «Правилното
 *      действие» line was the catalogue's pooled CROSSED_SOLID_LINE corrective
 *      («…дори предният да пълзи. Изпреварвай или заобикаляй чак където линията
 *      стане прекъсната…») on a drive with nobody in front and no overtake in
 *      it. The lesson now authors `solidCrossUTurnEnabled`, and the engine
 *      names the act when the car has really turned round ACROSS the line —
 *      it left one half of the road, crossed the solid axis, and travels with
 *      the other half (round 2: decided from the road, see
 *      mv-uturn-ban-road-referenced-act.test.ts) — so title, «Защо» and
 *      «Правилното действие» all speak of the обратен завой, at L1–L5, the
 *      exam rung included.
 *   6. THE NAMING IS EVIDENCE-GATED (A12). A crossing of the same line in the
 *      same lesson WITHOUT turning round (a shallow drift into the oncoming
 *      half and back) is still the lesson's own mistake and still «не е взет»
 *      — and is NOT called a U-turn: it keeps the pooled title and advice.
 *   7. В23 IS NAMED, because the world now posts it (world/__tests__/
 *      mv-uturn-districts.test.ts): the corrective names the sign as part of
 *      the rule, and «Правилото на този урок» repeats the briefing sentence
 *      that points at the plate at the 40th metre.
 *   8. THE SEVERITY SENTENCE IS TRUE. teach.examinerBg used to end «Обръщане
 *      през плътна осева е опасна грешка и се оценява като такава» while L4
 *      bills основна, 3 т. (n38.ts б. „а“). The sentence now states the class
 *      the изпитен лист prints, and this file compares the two.
 *
 * KILL-CHECKS (each reddens this file; restored, sha-verified):
 *   · rules/engine.ts solidCrossCond → never true (`false && …`);
 *   · lessons/lessonMistake.ts foldLessonMistakes → returns [] (no fold);
 *   · rules/engine.ts — the reversal ignored (every crossing named / none
 *     named); lessons/debrief.ts + lessonMistake.ts — corrective read by code.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../../../rules";
import type { DriveScript } from "../../../traces/recorder";
import { scMvUturnBanMistakeCrossSolidScript, scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { lessonMistakeCopy } from "../../lessonMistake";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { scoreRubric } from "../rubric";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const BAN = { fromY: 40, toY: 220 };
const PRACTICE = [1, 2, 3, 5] as const;

/** The act the engine names (rules/catalog SOLID_CROSS_ACT_UTURN) — a literal,
 *  so this file reddens on an assertion on a tree that has no such act. */
const UTURN_ACT = "u-turn";
const UTURN_TITLE = "Обратен завой през непрекъсната осева линия";
const POOLED_TITLE = "Пресичане на непрекъсната осева линия";
/** The pooled corrective's overtaking advice — right for an overtake, false
 *  after a U-turn (6d60c160). */
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй|дори предният да пълзи/u;

/** Every «→ Правилното действие:» line of the debrief block that opens with
 *  `• <title>` — the corrective the student reads under THAT act. */
function correctivesUnder(debrief: string, titleBg: string): string[] {
  const lines = debrief.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(`• ${titleBg}`)) continue;
    for (let j = i + 1; j < lines.length && lines[j].startsWith("  → "); j++) {
      if (lines[j].startsWith("  → Правилното действие:")) out.push(lines[j]);
    }
  }
  return out;
}

/**
 * THE A12 CONTROL — the same lesson, the same line, NO turn. The car changes to
 * the inner lane exactly as the demo does, then drifts on a shallow diagonal
 * into the oncoming half inside the М1 span (nose ~11° left of the road),
 * holds it for a few seconds and comes back. Authored to clear the staged
 * stream by a wide margin: the first oncoming car reaches y ≈ 280 at t ≈ 24 s
 * and this drive is back on its own bank well before that.
 */
function driftAcrossScript(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 82]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 82], [8, 96], [4.06, 110]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[4.06, 110], [-3, 145], [-3, 165]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[-3, 165], [4.06, 195], [4.06, 205]], targetKmh: 30 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

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
      // 5 — THE U-TURN IS WHAT IS EXPLAINED (6d60c160). The engine named the act…
      expect(hit!.detail).toBe(UTURN_ACT);
      expect(copy.titleBg).toBe(UTURN_TITLE);
      expect(o.debrief).toContain(`не е взет: допусна „${UTURN_TITLE}“`);
      // …the reason speaks of the turn that was made…
      expect(copy.explanationBg).toMatch(/обратен завой/u);
      // …and the corrective under it names the обратен завой and where it IS
      // done, and no longer advises an overtake nobody attempted.
      const correctives = correctivesUnder(o.debrief, UTURN_TITLE);
      expect(correctives).toHaveLength(1);
      expect(correctives[0]).toBe(`  → Правилното действие: ${copy.correctiveBg}`);
      expect(correctives[0]).toMatch(/[Оо]братен завой/u);
      expect(correctives[0]).toMatch(/прекъсната/u);
      expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
      // 7 — В23 is named: as part of the rule in the corrective, and by the
      // briefing sentence «Правилото на този урок» repeats, pointing at the
      // plate the world posts at the 40th metre.
      expect(correctives[0]).toContain("знак В23");
      expect(o.debrief).toMatch(/40-ия метър[^\n]*знак В23/u);
      // …and the server's fold — the verdict that is stored — agrees.
      const graded = serverFold(o);
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") return;
      expect(graded.result.passed).toBe(false);
      expect((graded.result.lessonMistakes ?? []).map((h) => h.code)).toEqual(["CROSSED_SOLID_LINE"]);
      // The ACT survives the wire: the stored row retitles to the U-turn too.
      expect((graded.result.lessonMistakes ?? []).map((h) => h.detail)).toEqual([UTURN_ACT]);
      expect((graded.result.lessonMistakes ?? []).map((h) => h.titleBg)).toEqual([UTURN_TITLE]);
    });
  }

  it("L3: a HESITANT U-turn (12 s stop half-way round, then across) is still explained as the U-turn", () => {
    // The banned arc of the demo, cut at 45°, a twelve-second stop to look, and
    // then the rest of it. The evidence is the reversal itself, not a window
    // of time: however long he stands half-way, the turn he then completes is
    // the turn.
    const r = (4.06 + 12.19) / 2;
    const cx = 4.06 - r;
    const arc = (fromDeg: number, toDeg: number): Array<[number, number]> => {
      const pts: Array<[number, number]> = [];
      for (let d = fromDeg; d <= toDeg + 1e-9; d += 15) {
        const th = (d * Math.PI) / 180;
        pts.push([Math.round((cx + r * Math.cos(th)) * 100) / 100, Math.round((124 + r * Math.sin(th)) * 100) / 100]);
      }
      return pts;
    };
    const script: DriveScript = {
      steps: [
        { kind: "glance", mirror: "rear" },
        { kind: "drive", points: [[12.19, 15], [12.19, 82]], targetKmh: 46, stopAtEnd: false },
        { kind: "glance", mirror: "left" },
        { kind: "indicator", setting: "left" },
        { kind: "drive", points: [[12.19, 82], [8, 96], [4.06, 110]], targetKmh: 30, stopAtEnd: false },
        { kind: "drive", points: [[4.06, 110], [4.06, 124]], targetKmh: 14 },
        { kind: "pause", sec: 0.8, brake: true },
        { kind: "drive", points: arc(0, 45), targetKmh: 9 },
        { kind: "pause", sec: 12, brake: true },
        { kind: "drive", points: arc(45, 180), targetKmh: 9, stopAtEnd: false },
        { kind: "indicator", setting: "off" },
        { kind: "drive", points: [[-12.19, 124], [-12.19, 100]], targetKmh: 28 },
        { kind: "pause", sec: 1, brake: true },
      ],
    };
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, script);
    const bill = firstBill(o, "CROSSED_SOLID_LINE");
    expect(bill, "CROSSED_SOLID_LINE billed").not.toBeNull();
    // The stop really happened on his own side, half round, BEFORE the bill…
    const stopped = o.ticks.filter((k) => k.t < bill!.t && k.speedKmh < 0.5 && k.position.x > 0 && k.position.y > 126);
    expect(stopped.length).toBeGreaterThan(0);
    expect(stopped[stopped.length - 1].t - stopped[0].t).toBeGreaterThan(10);
    // …and the act is still named, with its own corrective.
    const hit = (o.result.lessonMistakes ?? []).find((h) => h.code === "CROSSED_SOLID_LINE");
    expect(hit).toBeDefined();
    expect(hit!.detail).toBe(UTURN_ACT);
    expect(correctivesUnder(o.debrief, UTURN_TITLE)).toHaveLength(1);
    expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
  });

  it("A12 CONTROL (L3): the same line crossed WITHOUT turning round is the lesson's mistake — and is NOT called a U-turn", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, driftAcrossScript());
    // The act: across the axis inside the span, nose never far off the road, nothing struck.
    const bill = firstBill(o, "CROSSED_SOLID_LINE");
    expect(bill, "CROSSED_SOLID_LINE billed").not.toBeNull();
    expect(bill!.x).toBeLessThan(0);
    expect(bill!.y).toBeGreaterThanOrEqual(BAN.fromY);
    expect(bill!.y).toBeLessThanOrEqual(BAN.toY);
    const first = o.ticks.find((k) => Math.abs(k.speedKmh) > 5)!;
    const worstNose = Math.max(...o.ticks.map((k) => Math.abs(wrap180(k.headingDeg - first.headingDeg))));
    expect(worstNose).toBeLessThan(30);
    expect(o.scored).not.toContain("COLLISION");
    // Still the lesson's own mistake, still not taken (Ruling A)…
    const hit = (o.result.lessonMistakes ?? []).find((h) => h.code === "CROSSED_SOLID_LINE");
    expect(hit).toBeDefined();
    expect(o.result.passed).toBe(false);
    // …but no U-turn was made, so none is named: the crossing's title, the
    // crossing's advice. (Round 3: the row says HOW FAR across the car was when
    // the bill landed — on this drift the tail is still over the line, so it
    // carries the straddle's reason, not «Пресече изцяло».)
    expect(hit!.detail).not.toBe(UTURN_ACT);
    const at = o.ticks.reduce((b, k) => (Math.abs(k.t - bill!.t) < Math.abs(b.t - bill!.t) ? k : b));
    const yaw = (at.headingDeg * Math.PI) / 180;
    const whollyAcross = at.position.x + 0.85 * Math.abs(Math.cos(yaw)) + 2.02 * Math.abs(Math.sin(yaw)) <= 0;
    expect(whollyAcross).toBe(false);
    expect(hit!.detail).toBe("astride");
    expect(o.debrief).toContain("Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил");
    expect(o.debrief).not.toContain("изцяло");
    expect(hit!.titleBg).toBe(POOLED_TITLE);
    expect(o.debrief).toContain(`• ${POOLED_TITLE}`);
    expect(o.debrief).not.toContain(UTURN_TITLE);
    const correctives = correctivesUnder(o.debrief, POOLED_TITLE);
    expect(correctives).toEqual([`  → Правилното действие: ${VIOLATIONS.CROSSED_SOLID_LINE.correctiveBg}`]);
  });

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
    // 5 at the exam rung — the изпитен лист row names the U-turn, says what
    // happened, and its corrective is the U-turn's, not the overtake's.
    expect(billed[0].detail).toBe(UTURN_ACT);
    expect(billed[0].titleBg).toBe(UTURN_TITLE);
    expect(o.debrief).toContain(`• ${UTURN_TITLE} — основна, `);
    expect(o.debrief).toMatch(/→ Какво стана: [^\n]*обратен завой/u);
    const correctives = correctivesUnder(o.debrief, UTURN_TITLE);
    expect(correctives).toHaveLength(1);
    expect(correctives[0]).toMatch(/[Оо]братен завой/u);
    expect(correctives[0]).toContain("знак В23");
    expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
  });

  it("SEVERITY TRUTH: what the examiner sentence calls the crossing is the class the изпитен лист bills", () => {
    // The sentence used to read «Обръщане през плътна осева е опасна грешка и
    // се оценява като такава» over a ledger that bills основна, 3 т.
    const LABEL = { opasna: "опасна", osnovna: "основна", vtorostepenna: "второстепенна" } as const;
    const o = driveLiveRung(SC_MV_UTURN_BAN, 4, scMvUturnBanMistakeCrossSolidScript());
    const billed = o.result.summary.mistakes.find((m) => m.code === "CROSSED_SOLID_LINE")!;
    const sentence = SC_MV_UTURN_BAN.teach.examinerBg
      .split(/(?<=[.!?])\s+/u)
      .filter((x) => /плътна(та)? осева|непрекъсната(та)? осева/u.test(x) && /грешка/u.test(x));
    expect(sentence).toHaveLength(1);
    expect(sentence[0]).toContain(`${LABEL[billed.severityClass]} грешка`);
    expect(sentence[0]).toContain(`${billed.points} т.`);
    for (const [cls, word] of Object.entries(LABEL)) {
      if (cls !== billed.severityClass) expect(sentence[0], word).not.toContain(`${word} грешка`);
    }
    // …and the catalogue agrees with the ledger (the class was not moved to fit the copy).
    expect(VIOLATIONS.CROSSED_SOLID_LINE.severityClass).toBe("osnovna");
    expect(VIOLATIONS.CROSSED_SOLID_LINE.points).toBe(3);
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
