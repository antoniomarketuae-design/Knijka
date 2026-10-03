/**
 * THE TASK CEILING, ROUND 13 — the lesson (what the student sees: the card's sentence, the coached rows, the charged
 * mistakes, the score), on hand-built witnesses through a real lesson session. The generated lesson census is
 * `task-cap-generated-lesson-census.test.ts`; the census of every COMMITTED capped objective is
 * `components/sim/lesson-ui/__tests__/task-cap-lesson-census.test.ts`.
 *
 * A · THE CARD OF A STAMP-BILLED ARRIVAL (the round-12 verifier's C3-STRETCH-CARD, V35). Round 12's stamp rule made one
 *     shape in which the card of a sign-bound arrival is shown on a frame whose sign is NOT the sign the mark was blown
 *     under: blown at 67,6 through «≤60» on a posted 60, billed one frame later with the sign already 65. The card
 *     quotes its BLOW — «…и над ограничението от знака 60 км/ч» — and under V35 it read «65», a sentence false of the
 *     moment it describes (THEO-4). Pinned with the glass at the gate and with the glass under it (V16's class: the
 *     figure after «при таван на задачата» is the one the student READ).
 * B · THE WEATHER CARD'S SECOND NUMBER (the verifier's V34). «…и над тавана на задачата N км/ч» is said exactly when
 *     the car is over the figure the student read — the GLASS figure, not the compiled gate — and N is that figure.
 * C · ORDER INSIDE ONE M-16 ACT, on the glass (the integrator's ruling for round 13, C2; the verifier's ORDER probe
 *     through a real lesson). One weather or bend first bill moved across the stamp frame: the same score and the same
 *     topics of the cards in every order. Round 12 scored 3 with the bend's bill 0.2 s after the stamp and 0 with it on
 *     the stamp frame. Also: THE REPEAT (the topic already spent — one point in every order, never two: the act's
 *     re-grade answers to the bill the student was shown), and THE OTHER PIVOT (a new mark blown while the first
 *     arrival waits takes the act's one bill, round 7 — a kin bill either side of its blow).
 * D · ONE BILL OF THE LAW PER ACT, on the glass: the weather and the bend in all eight orders around the stamp, the
 *     verifier's MARK2 rows (a second mark either side of the stamp), a second weather act inside the same M-16 act,
 *     two long weather windows (the act's ONE re-grade) — one card on the topic and the same points in every order;
 *     and WHAT IT CANNOT MAKE EQUAL, stated: on a topic spent before the act, the price of the act's one charged bill
 *     is the class of the card that was shown.
 *
 * Cases marked RED-ON-R12 were run RED on round 12's tree; cases marked RED-ON-V<n> on round 12's tree WITH the
 * verifier's mutant they name (`scratchpad/cap/r13/red-on-r12*.txt`).
 *
 * ROUND 14 — RETIRED HERE: 12 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { describe, expect, it } from "vitest";
import { makeViolation, type SimTick, type ViolationCode } from "../../rules";
import { prog } from "../../rules/__tests__/taskCapProgrammes";
import { shiftProgramme, topicSpentPrefix } from "../../rules/__tests__/taskCapOrderProgrammes";
import {
  ORDER_PLACEMENTS,
  ORDER_STAMP_AT,
  TWO_KIN_PLACEMENTS,
  longTwice,
  newMarkWhileWaiting,
  orderKin,
  orderShape,
  repeatThenWeather,
  secondWeatherAct,
  stampCard,
  stampPair,
  twoKin,
} from "../../rules/__tests__/taskCapWitnesses13";
import { scenarioForCode } from "../../scenarios";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState } from "../types";
import { COND, CURVE, TASK } from "./taskCapStudent";

/** The uncapped practice lesson every task-cap round has driven (non-exam, no capped objective, no speed target). */
const UNCAPPED = "sc-follow-brake";
const explain = (code: string) => makeViolation(code as ViolationCode, 0).explanationBg;

interface Card {
  code: string;
  t: number;
  charged: boolean;
  text: string;
}
interface Seen {
  score: number;
  mistakes: string[];
  coached: string[];
  /** Every teach card and toast that states a violation, in order. */
  cards: Card[];
}
function session(f: readonly SimTick[]): Seen {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED);
  if (spec === undefined) throw new Error(`no template ${UNCAPPED}`);
  let s: LessonSessionState = createLessonSession(compileScenario(spec, 1));
  const cards: Card[] = [];
  for (const x of f) {
    const r = applyTick(s, x);
    s = r.state;
    for (const m of r.teachMoments ?? []) cards.push({ code: m.code, t: m.t, charged: m.charged === true, text: m.explanationBg });
  }
  const ended = s.phase === "driving" || s.phase === "preDrive" ? finishSession(s, f[f.length - 1].t) : s;
  const res = buildLessonResult(ended);
  return {
    score: res.score,
    mistakes: res.summary.mistakes.map((m) => `${m.code}@${m.t.toFixed(2)}|${m.points}`),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    cards,
  };
}
/** The topic of every bill the student was shown (a coached row or a charged mistake), sorted: «the cards' topics». */
const topics = (s: Seen) => [...s.coached, ...s.mistakes].map((x) => scenarioForCode(x.slice(0, x.indexOf("@")) as ViolationCode) ?? x).sort();

describe("A · the card of a stamp-billed arrival quotes its BLOW — the speed, the figure on the glass, the sign the mark was blown under", () => {
  for (const [name, gate, glass] of [
    ["glass == gate (60 / 60)", 60, 60],
    ["glass under the gate (60 on the glass, gate 62,5)", 62.5, 60],
  ] as const) {
    it(`RED-ON-V35 · RED-ON-V16 · ${name}: shown at 1.1 with the sign already 65 — «Мина точката на задачата с 67,6 км/ч при таван на задачата 60 км/ч — и над ограничението от знака 60 км/ч»`, () => {
      const s = session(stampCard(gate, glass));
      const card = s.cards.find((c) => c.code === TASK);
      expect(card?.t).toBe(1.1);
      expect(card?.text).toBe(`Мина точката на задачата с 67,6 км/ч при таван на задачата 60 км/ч — и над ограничението от знака 60 км/ч. ${explain(TASK)}`);
      // …and the act's one re-grade, 9 s into the stretch: the sustained copy, the same figure the student read.
      expect(s.mistakes).toEqual([`${TASK}@10.20|1`]);
    });
  }
});

describe("B · the weather card names the task's ceiling exactly when the car is over the figure the student READ", () => {
  /** A ≤60 figure on the glass over a gate of 62,5, stamped on a posted 70 in the rain (which leaves 59,5 of the sign). */
  const wet = (v: number): SimTick[] =>
    prog(
      [
        { from: 0, to: 1.0, v: 50, o: { ...stampPair(62.5, 60, 0.5) } },
        { from: 1.0, to: 6.0, v, o: { rain: true, ...stampPair(62.5, 60, 0.5) } },
        { from: 6.0, to: 16, v: 50 },
      ],
      { maxSpeedKmh: 70 },
    );
  it("59,8 км/ч — over what the rain leaves, NOT over the «≤60»: the task's ceiling is not named («и над тавана на задачата» would be false)", () => {
    const card = session(wet(59.8)).cards.find((c) => c.code === COND);
    expect(card?.text).toBe(explain(COND));
  });
});

// ROUND 14: «C · ORDER INSIDE ONE M-16 ACT, on the glass — one weather or bend first bill moved across the stamp frame: the same score, the same topics o» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

describe("D · ONE BILL OF THE LAW PER ACT, on the glass — every order of the weather, the bend, a second mark and the stamp inside one sign-bound act: one card on the topic, the same points", () => {
  // ROUND 14 (founder ruling 2026-10-03, which supersedes round 13's «one continuous act, one bill»): round 12's MARK2
  // rows again — the second mark blown before the stamp waits with the first arrival (one card), blown after the stamp
  // it is its own blow, «a point on repeat» (ruling 4).
  it("the round-12 verifier's MARK2 rows, len=4: before the stamp one card, no point; after it a second, charged card — «a point on repeat»", () => {
    const before = session(orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 4, mark2: 3.5 }));
    const after = session(orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 4, mark2: 5.0 }));
    expect([before.coached, before.mistakes, before.score]).toEqual([[`${TASK}@4.00`], [], 0]);
    expect([after.coached, after.mistakes, after.score]).toEqual([[`${TASK}@4.00`], [`${TASK}@5.00|1`], 1]);
  });
});
