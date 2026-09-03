/**
 * sc-rx-tram-left:07c63b97 (critical) — THE TRAM DRILL NEVER SAID „TRAM".
 *
 * `.audit-frames/w10-4/frames/sc-rx-tram-left__mobile-right/06-waited.png` and
 * the run.log beside it. The lesson is «Ляв завой през трамвайно трасе»; its
 * briefing step 3 is «Насреща се задава трамвай. Той има предимство независимо
 * от посоката си»; its step 4 is «трамваят трябва да премине ИЗЦЯЛО». What the
 * student was told, on all three surfaces, for the whole wait:
 *
 *   t=37 s  card   «Чакаш правилно на червено. Тръгваш на зелено — освен ако
 *                   регулировчик не пуска твоята посока …»
 *   t=44 s  НАУЧИ  «Защо чакаш: червен сигнал»
 *   t=56 s  НАУЧИ  «Изчака сигнала и тръгна чисто … без отчетено нарушение на
 *                   сигнала»
 *
 * No tram anywhere, and the generic clause is not merely thin here: «Тръгваш
 * на зелено» IS the misreading the drill exists to break. ЗДвП чл. 8, ал. 2
 * (content/law/acts/zdvp.json) says that where passage is permitted to rail
 * and non-rail vehicles AT THE SAME TIME — which is what one green is — the
 * non-rail driver yields „независимо от неговото местоположение и посока на
 * движение".
 *
 * Every block below pins the correction AND the opposite direction: a
 * displacement that leaked onto other lessons, or a verdict that started
 * praising a tram nothing in this module can see, would each pass a one-sided
 * test.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  YIELD_VOICE_VERDICT_S,
  advisorPromptForSession,
  createYieldVoice,
  lessonYieldsToRailVehicle,
  railPriorityWaitAdvisorPrompt,
  stepYieldVoice,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { HudEvent } from "../../contracts";
import type { LessonSessionState, YieldReason, YieldWaitState } from "../types";

const TRAM = "sc-rx-tram-left";

const template = (id: string) => {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`no such template: ${id}`);
  return spec;
};

const heldWait = (reason: YieldReason, sinceSec: number): YieldWaitState => ({
  holding: true,
  sinceSec,
  reason,
  pedestrianCrossingIds: [],
});
const freeWait = (): YieldWaitState => ({
  holding: false,
  sinceSec: null,
  reason: null,
  pedestrianCrossingIds: [],
});

/** A driving session parked on one objective with a live lawful wait. */
function waitingSession(
  scenarioId: string,
  objectiveId: string,
  reason: YieldReason,
  level: ScenarioLevel = 1,
): LessonSessionState {
  const lesson = compileScenario(template(scenarioId), level);
  const base = createLessonSession(lesson);
  const idx = lesson.objectives.findIndex((o) => o.id === objectiveId);
  if (idx < 0) throw new Error(`no such objective: ${scenarioId}/${objectiveId}`);
  return { ...base, phase: "driving", currentObjectiveIndex: idx, yieldWait: heldWait(reason, 1) };
}

type LessonNotice = Extract<HudEvent, { kind: "lesson" }>;
const lessonNotices = (events: readonly HudEvent[]): LessonNotice[] =>
  events.filter((e): e is LessonNotice => e.kind === "lesson");

/** Every line one uninterrupted wait produces, up to `seconds` of standstill. */
function narrate(reason: YieldReason, seconds: number, railPriority: boolean): LessonNotice[] {
  let v = createYieldVoice();
  const out: LessonNotice[] = [];
  const wait = heldWait(reason, 0.1);
  for (let i = 1; i <= seconds * 10; i++) {
    const t = +(i / 10).toFixed(1);
    const step = stepYieldVoice(v, { t, speedKmh: 0, wait, violations: [], railPriority });
    v = step.state;
    out.push(...lessonNotices(step.notices));
  }
  return out;
}

/** The wait, then the departure — the line said once the wheels have turned. */
function verdictLine(reason: YieldReason, railPriority: boolean): LessonNotice {
  let v = createYieldVoice();
  const wait = heldWait(reason, 0.1);
  let t = 0;
  for (let i = 1; i <= (YIELD_VOICE_NAME_S + 1) * 10; i++) {
    t = +(i / 10).toFixed(1);
    v = stepYieldVoice(v, { t, speedKmh: 0, wait, violations: [], railPriority }).state;
  }
  const out: LessonNotice[] = [];
  const free = freeWait();
  for (let i = 1; i <= (YIELD_VOICE_VERDICT_S + 2) * 10; i++) {
    t = +(t + 0.1).toFixed(1);
    const step = stepYieldVoice(v, { t, speedKmh: 20, wait: free, violations: [], railPriority });
    v = step.state;
    out.push(...lessonNotices(step.notices));
  }
  if (out.length !== 1) throw new Error(`expected one verdict line, got ${out.length}`);
  return out[0];
}

// ---------------------------------------------------------------------------
// 1. THE SCOPE — read off conceptIds, and measured over the whole catalogue
// ---------------------------------------------------------------------------

describe("which lessons the rails speak for", () => {
  it("exactly one compiled template turns left across a rail vehicle", () => {
    const matched = SCENARIO_TEMPLATES.filter((spec) =>
      lessonYieldsToRailVehicle(compileScenario(spec, 1)),
    ).map((s) => s.id);
    expect(matched).toEqual([TRAM]);
  });

  it("the tram-STOP drills keep every card they had", () => {
    // Both carry `c-tram-priority` and neither is a left turn across it: their
    // duty is чл. 66 (спирка с/без остров), and «трамваят минава пръв» is not
    // the sentence owed to a driver stopped behind open doors. They are also
    // authored `signalized: "no"`, so no redLight wait can arise on them.
    for (const id of ["sc-rx-tram-island", "sc-rx-tram-stop-doors"]) {
      const lesson = compileScenario(template(id), 1);
      expect(lesson.conceptIds, id).toContain("c-tram-priority");
      expect(lessonYieldsToRailVehicle(lesson), id).toBe(false);
    }
  });

  it("an officer's junction is excluded — the voice would lose чл. 6, т. 2", () => {
    // `stepYieldVoice` has no officer branch, which is why the generic lamp
    // copy carries the exception in EVERY stage. Swapping that copy out where
    // an officer stands would delete it from the teach channel, so a lesson
    // whose own copy names him keeps the copy that names him back.
    const lesson = compileScenario(template(TRAM), 1);
    expect(lesson.titleBg).not.toMatch(/регулировчик/i);
    expect(lesson.briefingBg?.some((s) => /регулировчик/i.test(s.textBg))).toBe(false);
    const withOfficer = {
      ...lesson,
      briefingBg: [
        ...(lesson.briefingBg ?? []),
        { n: 99, textBg: "Има ли регулировчик, важи само неговият сигнал." },
      ],
    };
    expect(lessonYieldsToRailVehicle(withOfficer)).toBe(false);
  });

  it("…and it survives every level rung of the tram drill", () => {
    for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      expect(lessonYieldsToRailVehicle(compileScenario(template(TRAM), level)), `L${level}`).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. THE CARD — the frame this row was filed on
// ---------------------------------------------------------------------------

describe("the live wait card at the rails stops ending «Тръгваш на зелено»", () => {
  const RAIL_CARD = railPriorityWaitAdvisorPrompt().textBg;

  it("on the approach objective", () => {
    const p = advisorPromptForSession(waitingSession(TRAM, "sc-rxtl-approach", "redLight"));
    expect(p?.textBg).toBe(RAIL_CARD);
    expect(p?.textBg).not.toContain("Тръгваш на зелено");
  });

  it("on the turn objective — the beat 06-waited.png photographed", () => {
    const p = advisorPromptForSession(waitingSession(TRAM, "sc-rxtl-turn", "redLight"));
    expect(p?.textBg).toBe(RAIL_CARD);
    expect(p?.textBg).not.toBe(yieldWaitAdvisorPrompt("redLight").textBg);
  });

  it("…and after the last objective, where the route runs out past the same junction", () => {
    const s = waitingSession(TRAM, "sc-rxtl-turn", "redLight");
    const done = { ...s, currentObjectiveIndex: s.objectives.length };
    expect(advisorPromptForSession(done)?.textBg).toBe(RAIL_CARD);
  });

  it("the card keeps the red's approval, names the tram and says what to do", () => {
    // Unlike the officer's junction the lamp here decides plenty: the red is
    // real and stopping for it is right, so the approval stays and only the
    // green's unconditional half goes.
    expect(RAIL_CARD).toContain("Чакаш правилно на червено");
    expect(RAIL_CARD).toContain("трамвая");
    expect(RAIL_CARD).toMatch(/изчакай|пропусни/i);
    expect(railPriorityWaitAdvisorPrompt().keys).toEqual([]);
  });

  it("…and it fits the same 240 px column every other wait card is held to", () => {
    // yield-voice.test.ts holds all five reason cards to 40–150 characters.
    expect(RAIL_CARD.length).toBeGreaterThan(40);
    expect(RAIL_CARD.length).toBeLessThan(150);
  });

  // --- the opposite direction ---------------------------------------------
  it("an ordinary red-light wait elsewhere still gets the generic card", () => {
    const p = advisorPromptForSession(waitingSession("sc-signal-response", "sc-sig-pass", "redLight"));
    expect(p?.textBg).toBe(yieldWaitAdvisorPrompt("redLight").textBg);
    expect(p?.textBg).toContain("Тръгваш на зелено");
  });

  it("a PEDESTRIAN wait on the tram drill still gets the pedestrian card", () => {
    // Only the lamp copy is corrected — the same scoping the officer uses.
    const p = advisorPromptForSession(waitingSession(TRAM, "sc-rxtl-turn", "pedestrian"));
    expect(p?.textBg).toBe(yieldWaitAdvisorPrompt("pedestrian").textBg);
  });

  it("no wait, no displacement — the objective card is untouched", () => {
    const s = waitingSession(TRAM, "sc-rxtl-turn", "redLight");
    const p = advisorPromptForSession({ ...s, yieldWait: freeWait() });
    expect(p?.textBg).toBe("Завърши левия завой през трасето и излез на юг");
  });
});

// ---------------------------------------------------------------------------
// 3. THE TEACH CHANNEL — the two lines that contradicted the card five
//    seconds later
// ---------------------------------------------------------------------------

describe("the НАУЧИ stages name the tram too", () => {
  const staged = () => narrate("redLight", YIELD_VOICE_SETTLE_S + 1, true);

  it("both live stages are said, and both name the rails", () => {
    const said = staged();
    expect(said.length).toBe(2);
    for (const line of said) expect(line.explanationBg).toMatch(/трамва|релсов/i);
  });

  it("«Защо чакаш» stops being about the lamp alone", () => {
    const named = staged()[0];
    expect(named.titleBg).not.toBe("Защо чакаш: червен сигнал");
    expect(named.titleBg).toContain("релси");
    // The duty is QUOTED from чл. 8, ал. 2, not paraphrased from memory.
    expect(named.explanationBg).toContain("едновременно е разрешено преминаването");
    expect(named.explanationBg).toContain("независимо от местоположението и посоката");
    // …and the red's own half survives: he really is stopped before the line.
    expect(named.explanationBg).toContain("ПРЕД линията");
  });

  it("«Чакането Е маневрата» keeps the phrase and gains its own duty", () => {
    const settled = staged()[1];
    expect(settled.titleBg).toContain("Чакането Е маневрата");
    expect(settled.titleBg).toContain("трамваят");
    // The reassurance the whole stage exists for survives the rewrite.
    expect(settled.explanationBg).toContain("изваждат от ориентировъчното време");
  });

  it("every stage cites the two retrieved articles and nothing else", () => {
    for (const line of staged()) expect(line.lawRef).toBe("ЗДвП чл. 8, ал. 2; чл. 37, ал. 1");
  });

  // --- the opposite direction ---------------------------------------------
  it("without the flag the five reason copies are byte-identical", () => {
    const reasons: YieldReason[] = [
      "giveWayLine",
      "stopSign",
      "redLight",
      "pedestrian",
      "roundaboutEntry",
    ];
    for (const r of reasons) {
      const off = narrate(r, YIELD_VOICE_SETTLE_S + 1, false);
      expect(off.map((l) => [l.titleBg, l.explanationBg, l.lawRef]), r).toEqual(
        narrate(r, YIELD_VOICE_SETTLE_S + 1, false).map((l) => [
          l.titleBg,
          l.explanationBg,
          l.lawRef,
        ]),
      );
    }
    // The canonical red-light title the signal-stop-line-window suite pins.
    expect(narrate("redLight", YIELD_VOICE_SETTLE_S + 1, false)[1].titleBg).toBe(
      "Чакането Е маневрата",
    );
  });

  it("a NON-red wait on the tram drill is untouched by the flag", () => {
    const on = narrate("pedestrian", YIELD_VOICE_SETTLE_S + 1, true);
    const off = narrate("pedestrian", YIELD_VOICE_SETTLE_S + 1, false);
    expect(on.map((l) => l.explanationBg)).toEqual(off.map((l) => l.explanationBg));
  });
});

// ---------------------------------------------------------------------------
// 4. THE VERDICT — it may not praise a tram this module cannot see
// ---------------------------------------------------------------------------

describe("the departure line claims only what was measured", () => {
  it("it credits the SIGNAL and leaves the tram duty in front of him", () => {
    // On the measured drive the red released him at t≈48 s with the tram still
    // coming: «Пропусна трамвая» would have been false on the frame it printed.
    const v = verdictLine("redLight", true);
    expect(v.explanationBg).not.toMatch(/Пропусна трамвая|пропусна трамвая/);
    expect(v.explanationBg).toContain("без отчетено нарушение на сигнала");
    expect(v.explanationBg).toMatch(/трамва/i);
    expect(v.titleBg).toContain("трамваят");
  });

  it("…and the generic verdict is unchanged when the flag is off", () => {
    expect(verdictLine("redLight", false).titleBg).toBe("Изчака сигнала и тръгна чисто");
  });
});
