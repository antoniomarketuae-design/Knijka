/**
 * SWEEP161 — WHAT THE ADVISOR SAID, MEASURED OFF THE GLASS.
 *
 * Five defects, every one photographed in `.audit-frames/sweep161`, every one
 * a sentence this module SPOKE to a student:
 *
 *  1. TWO NUMBERS IN ONE SENTENCE. sc-sp-limit-end/pc/right 01-arrival.png:
 *     «Стигни кръстовището, още в зоната и под 40 км/ч — дръж под 48 км/ч», on
 *     the drill whose whole subject is a В26 „40" zone. The 40 is the author's;
 *     the 48 is the difficulty ladder's tolerance (`widenSpeedCap`, 43 + 5)
 *     leaking into the instructor's voice. 47 compiled objectives, 10 distinct
 *     titles, do this.
 *
 *  2. THE COACH TAUGHT THE OPPOSITE OF THE LESSON, IN THE SAME FRAME.
 *     sc-signal-controller/mobile/right 04-t053s.png: the in-world board reads
 *     «Предимството е ТВОЕ — дори на червено» and this card read «На червено се
 *     спира напълно ПРЕД линията — БЕЗ ИЗКЛЮЧЕНИЯ». There is one exception and
 *     ЗДвП чл. 6, т. 2 / чл. 7, ал. 1 is it.
 *
 *  3. AND THE CARD SENT HIM INTO THE PENALTY. sc-sig-controller-live/mobile/
 *     right run.log: the objective is «Премини стоп-линията по разрешение на
 *     регулировчика — въпреки червената лампа»; the advisor answered «Спри на
 *     стоп-линията на светофара и изчакай зелено»; the drive ended НЕИЗДЪРЖАН
 *     with −10 «Неизпълнение на сигнала на регулировчика».
 *
 *  4. PRAISE FOR A STOP THE MODULE CANNOT SEE. sc-crossing-dart/mobile/right
 *     06-waited.png: the car halted with its nose over the first zebra bars,
 *     the card reading «Спрял си правилно» — against that lesson's own briefing
 *     point 4, «Спри напълно преди зебрата».
 *
 *  5. TWO CLOCKS FOR ONE WAIT. Same drive: «10 секунди пред пътеката са
 *     правилни» from this module, «8 с чакане на предимство» from the debrief,
 *     because the voice counted the seconds he spent ROLLING between two holds
 *     at the same zebra and the engine's `yieldWaitSec` counts only standstill.
 *
 * Each block below pins the fix AND the opposite direction — a card that stops
 * printing numbers, a lamp rule that stops applying, or a reassurance that a
 * creep silently deletes would each pass a one-sided test.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  advisorPromptForObjective,
  createYieldVoice,
  stepYieldVoice,
} from "../advisor";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import { LESSONS } from "../specs";
import { VIOLATIONS } from "../../rules";
import type { HudEvent } from "../../contracts";
import type { YieldReason, YieldVoiceState, YieldWaitState } from "../types";

const template = (id: string) => {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`no such template: ${id}`);
  return spec;
};

/** The advisor card a compiled objective produces, exactly as the HUD builds it. */
function cardFor(scenarioId: string, objectiveId: string, level: ScenarioLevel = 1) {
  const lesson = compileScenario(template(scenarioId), level);
  const o = lesson.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no such objective: ${scenarioId}/${objectiveId}`);
  const params = o.params as Record<string, unknown>;
  return {
    lesson,
    objective: o,
    prompt: advisorPromptForObjective(
      o.titleBg,
      { kind: o.kind, ...params } as never,
      undefined,
      lesson.postedLimitKmh,
    ),
  };
}

// ---------------------------------------------------------------------------
// 1. ONE SENTENCE, ONE NUMBER — and it is the author's
// ---------------------------------------------------------------------------

const KMH_NUMBERS = (s: string) =>
  [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)].map((m) => Number(m[1].replace(",", ".")));

describe("sweep161 — the card no longer prints the grader's tolerance beside the author's limit", () => {
  it("sc-sp-limit-end: «под 40 км/ч» is not followed by «дръж под 48 км/ч»", () => {
    const { objective, prompt } = cardFor("sc-sp-limit-end", "sc-sple-hold-to-junction");
    // The GATE is untouched — this is a copy fix, not a re-authored objective.
    expect((objective.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(48);
    expect(prompt.textBg).not.toContain("48");
    expect(prompt.textBg).toBe("Стигни кръстовището, още в зоната и под 40 км/ч — дръж под 40 км/ч");
  });

  it("sc-speed-creep: the 30 zone stops being coached at 38", () => {
    const { prompt } = cardFor("sc-speed-creep", "sc-crp-zone");
    expect(KMH_NUMBERS(prompt.textBg)).toEqual([30, 30]);
  });

  it("no compiled advisor card anywhere states two different speeds", () => {
    const bad: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const text = advisorPromptForObjective(
            o.titleBg,
            { kind: "reachZone", ...(o.params as object) } as never,
            undefined,
            lesson.postedLimitKmh,
          ).textBg;
          if (new Set(KMH_NUMBERS(text)).size > 1) bad.push(`${lesson.id} ${o.id}: ${text}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // --- the opposite direction -------------------------------------------
  it("a title that names no speed still gets the gate's cap — the card did not go silent", () => {
    const p = advisorPromptForObjective("Стигни зоната", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 9,
      maxSpeedKmh: 52,
    });
    expect(p.textBg).toBe("Стигни зоната — дръж под 52 км/ч");
  });

  it("a title may only make the card STRICTER — it can never license more than the gate", () => {
    // A card printing 90 over a gate that refuses above 50 would invite the
    // student to fail the task he is being coached through.
    const p = advisorPromptForObjective("Мини участъка под 90 км/ч", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 9,
      maxSpeedKmh: 50,
    });
    expect(p.textBg).toBe("Мини участъка под 90 км/ч — дръж под 50 км/ч");
  });

  it("the sign still wins over the gate where the street declares one (B58 holds)", () => {
    const { prompt } = cardFor("sc-speed-dangerous", "sc-dng-hold");
    expect(prompt.textBg).toContain("дръж под 50 км/ч");
    expect(prompt.textBg).not.toContain("52");
  });
});

// ---------------------------------------------------------------------------
// 2. THE OFFICER OUTRANKS THE LAMP — on the card and in the voice
// ---------------------------------------------------------------------------

describe("sweep161 — the регулировчик drill is no longer coached to wait for green", () => {
  it("sc-sig-controller-live: the card says what the objective says, not «изчакай зелено»", () => {
    const { objective, prompt } = cardFor("sc-sig-controller-live", "sc-sctl-cross");
    expect((objective.params as { requireRedMet?: boolean }).requireRedMet).toBe(true);
    expect(prompt.textBg).not.toContain("изчакай зелено");
    expect(prompt.textBg).toBe(
      "Премини стоп-линията по разрешение на регулировчика — въпреки червената лампа",
    );
    // The brake chip survives: reading the officer is done stopped.
    expect(prompt.keys).toEqual(["S"]);
  });

  // --- the opposite direction -------------------------------------------
  it("an ordinary red-light objective STILL gets the stop-and-wait-for-green sentence", () => {
    const lesson = LESSONS.find((l) => l.id === "l2-intersections");
    const o = lesson?.objectives.find(
      (x) => x.kind === "passSignal" && (x.params as { requireRedMet?: boolean }).requireRedMet === true,
    );
    expect(o).toBeDefined();
    const p = advisorPromptForObjective(
      o!.titleBg,
      { kind: "passSignal", ...(o!.params as object) } as never,
    );
    expect(p.textBg).toBe("Спри на стоп-линията на светофара и изчакай зелено");
  });
});

// ---------------------------------------------------------------------------
// 3–5. THE VOICE
// ---------------------------------------------------------------------------

type LessonNotice = Extract<HudEvent, { kind: "lesson" }>;
const lessonNotices = (events: readonly HudEvent[]): LessonNotice[] =>
  events.filter((e): e is LessonNotice => e.kind === "lesson");

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

/** Every line one uninterrupted wait produces, up to `seconds` of standstill. */
function narrate(reason: YieldReason, seconds: number): LessonNotice[] {
  let v = createYieldVoice();
  const out: LessonNotice[] = [];
  const wait = heldWait(reason, 0.1);
  for (let i = 1; i <= seconds * 10; i++) {
    const t = +(i / 10).toFixed(1);
    const step = stepYieldVoice(v, { t, speedKmh: 0, wait, violations: [] });
    v = step.state;
    out.push(...lessonNotices(step.notices));
  }
  return out;
}

describe("sweep161 — the red-light line no longer says the lamp has no exceptions", () => {
  const named = () => narrate("redLight", YIELD_VOICE_NAME_S + 0.5)[0];

  it("the false absolute is gone and the officer is named", () => {
    const line = named();
    expect(line.explanationBg).not.toContain("без изключения");
    expect(line.explanationBg).toContain("регулировчик");
    expect(line.explanationBg).toContain("само неговия сигнал");
    // Cited from the row that grades the same duty, not recalled.
    expect(line.lawRef).toContain(VIOLATIONS.CONTROLLER_SIGNAL_VIOLATED.lawRef);
  });

  // --- the opposite direction -------------------------------------------
  it("the red itself is still taught — the exception did not become the rule", () => {
    const line = named();
    expect(line.explanationBg).toContain("ПРЕД линията");
    expect(line.explanationBg).toContain("напречното движение");
    expect(line.lawRef).toContain(VIOLATIONS.RED_LIGHT_CROSSED.lawRef);
    expect(line.lawRef).toContain("ЗДвП чл. 50а");
    // The exception is CONDITIONED on the officer, never granted on its own.
    const bare = line.explanationBg.replace(/има ли регулировчик[^.]*\./gi, "");
    expect(bare).not.toMatch(/дори на червено/i);
  });

  it("the added citation keeps the numberless-Наредба rule", () => {
    for (const ref of named().lawRef?.match(/Наредба[^;]*/g) ?? []) {
      expect(ref).not.toMatch(/чл\.\s*\d/);
    }
  });
});

describe("sweep161 — «Чакането Е маневрата» stops meaning five different things", () => {
  const REASONS: YieldReason[] = [
    "giveWayLine",
    "stopSign",
    "redLight",
    "pedestrian",
    "roundaboutEntry",
  ];
  const settled = (r: YieldReason) => narrate(r, YIELD_VOICE_SETTLE_S + 1)[1];

  it("each duty heads its own card", () => {
    const titles = REASONS.map((r) => settled(r).titleBg);
    expect(new Set(titles).size).toBe(REASONS.length);
  });

  // --- the opposite direction -------------------------------------------
  it("the sentence the stage exists to say is still in every heading", () => {
    for (const r of REASONS) expect(settled(r).titleBg, r).toContain("Чакането Е маневрата");
    // The red light keeps the bare canonical string — signal-stop-line-window
    // .test.ts asserts that exact title among a red wait's emitted lines.
    expect(settled("redLight").titleBg).toBe("Чакането Е маневрата");
  });
});

describe("sweep161 — the pedestrian line stops certifying a stop it cannot see", () => {
  const named = () => narrate("pedestrian", YIELD_VOICE_NAME_S + 0.5)[0];

  it("no «Спрял си правилно» for a car whose nose is on the zebra", () => {
    expect(named().explanationBg).not.toContain("Спрял си правилно");
    expect(named().explanationBg).toContain("ПРЕД зебрата");
  });

  // --- the opposite direction -------------------------------------------
  it("the duty and its citation are unchanged — the wait is still called correct", () => {
    const line = named();
    expect(line.explanationBg).toContain("Правилно е да чакаш тук");
    expect(line.explanationBg).toContain("длъжен да пропуснеш");
    expect(line.lawRef).toBe(VIOLATIONS.PEDESTRIAN_NOT_YIELDED.lawRef);
  });
});

// ---------------------------------------------------------------------------
// 5. ONE CLOCK. The seconds spoken are the seconds STOOD.
// ---------------------------------------------------------------------------

/**
 * Two holds at the same line with a roll between them — the sc-crossing-dart
 * shape. Returns every line said, tagged with the frame time it landed on.
 */
function twoHoldsWithARoll(
  firstHoldSec: number,
  rollSec: number,
  secondHoldSec: number,
): { t: number; line: LessonNotice }[] {
  let v: YieldVoiceState = createYieldVoice();
  const out: { t: number; line: LessonNotice }[] = [];
  let t = 0;
  const step = (speedKmh: number, wait: YieldWaitState) => {
    t = +(t + 0.1).toFixed(1);
    const s = stepYieldVoice(v, { t, speedKmh, wait, violations: [] });
    v = s.state;
    for (const line of lessonNotices(s.notices)) out.push({ t, line });
  };
  const first = heldWait("giveWayLine", 0.1);
  for (let i = 0; i < firstHoldSec * 10; i++) step(0, first);
  for (let i = 0; i < rollSec * 10; i++) step(20, freeWait());
  const resumeAt = +(t + 0.1).toFixed(1);
  const second = heldWait("giveWayLine", resumeAt);
  for (let i = 0; i < secondHoldSec * 10; i++) step(0, second);
  return out;
}

describe("sweep161 — the instructor and the debrief count the same seconds", () => {
  // 5.9 s stood, 9.9 s rolling, then standing again. The engine's yieldWaitSec
  // would credit ~5.9 + whatever comes after; the old voice credited all of it
  // from the first hold and said «16 секунди».
  const said = twoHoldsWithARoll(6, 10, 10);
  const settled = said.find((x) => x.line.titleBg.includes("Чакането Е маневрата"));

  it("the seconds the roll took are not counted as seconds he stood", () => {
    expect(settled).toBeDefined();
    expect(settled!.line.explanationBg).toMatch(/^10 секунди/);
    expect(settled!.line.explanationBg).not.toMatch(/^1[1-9] секунди/);
  });

  it("and it lands when he HAS stood that long, not the instant he stops again", () => {
    // Old behaviour fired on the resume frame itself (t = 16.1, heldSec 16.0).
    expect(settled!.t).toBeGreaterThan(19.5);
    expect(settled!.t).toBeLessThan(21);
  });

  // --- the opposite direction -------------------------------------------
  it("an unbroken wait is unchanged — 12 s standing still says 12", () => {
    const lines = narrate("giveWayLine", YIELD_VOICE_SETTLE_S + 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].explanationBg).toMatch(/^1[01] секунди/);
  });

  it("and the reassurance is NOT reset by the creep — it still arrives", () => {
    // The failure mode on the other side of this fix: re-anchoring to the live
    // hold alone would make a student who stood 6 s, crept, and stood 4 s more
    // wait a further 10 s for a line that is about the doubt he already has.
    expect(said.some((x) => x.line.titleBg.includes("Чакането Е маневрата"))).toBe(true);
  });
});
