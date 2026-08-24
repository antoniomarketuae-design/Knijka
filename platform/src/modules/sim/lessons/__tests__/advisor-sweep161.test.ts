/**
 * SWEEP161 — WHAT THE ADVISOR SAID, MEASURED OFF THE GLASS.
 *
 * Seven defects, every one photographed in `.audit-frames/sweep161`, every one
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
 *  6. THE SAME LEAK AS 1, WHERE NOTHING CLAMPED IT (part D). Where the street
 *     declares no limit and the author wrote no figure, `params.maxSpeedKmh`
 *     itself went on the glass: «— дръж под 41 км/ч» on sc-sp-eco-coast, «60»
 *     in sc-sp-curve's recommended-50 bend, «140» on sc-mw-min-speed, whose
 *     subject is a MINIMUM. 433 of 953 compiled cards; 95 of them printing a
 *     FRACTION of a km/h no speedometer can show.
 *
 *  7. AND THE WAIT CARD SENT HIM INTO THE PENALTY OF 3.
 *     sc-sig-controller-live/mobile-right/run.log lines 167/196/358: the live
 *     wait card outranks the objective card fixed in 3, so the harness read
 *     «Чакаш правилно … Тръгваш на зелено», held 20 s, went on green and was
 *     billed −10 «Неизпълнение на сигнала на регулировчика».
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
  advisorPromptForSession,
  controllerWaitAdvisorPrompt,
  createYieldVoice,
  stepYieldVoice,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { createLessonSession } from "../engine";
import { AUTHORED_MAX_SPEED_PARAM_KEY, compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import { LESSONS } from "../specs";
import { VIOLATIONS } from "../../rules";
import type { HudEvent } from "../../contracts";
import type {
  LessonSessionState,
  YieldReason,
  YieldVoiceState,
  YieldWaitState,
} from "../types";

const template = (id: string) => {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`no such template: ${id}`);
  return spec;
};

/**
 * The advisor card a compiled objective produces, exactly as the HUD builds it.
 *
 * „EXACTLY AS THE HUD BUILDS IT" IS THE WHOLE VALUE OF THIS HELPER, and it
 * stopped being true for one run of this suite. `advisorPromptForSession` grew
 * a fifth argument (the authored cap, AUTHORED_MAX_SPEED_PARAM_KEY) and this
 * helper kept calling with four — so every assertion below went on measuring a
 * card the product no longer shows, and the six part-D cases stayed green while
 * the real HUD had already changed. That is the reassuring-direction instrument
 * bug this project keeps finding, in the harness rather than the probe: the
 * fixture must take every input the caller takes, or it is testing a ghost.
 * `authoredCapReachesTheCard()` below fails if this drifts again.
 */
function cardFor(scenarioId: string, objectiveId: string, level: ScenarioLevel = 1) {
  const lesson = compileScenario(template(scenarioId), level);
  const o = lesson.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no such objective: ${scenarioId}/${objectiveId}`);
  const params = o.params as Record<string, unknown>;
  const authored = params[AUTHORED_MAX_SPEED_PARAM_KEY];
  return {
    lesson,
    objective: o,
    authoredCapKmh: typeof authored === "number" ? authored : undefined,
    prompt: advisorPromptForObjective(
      o.titleBg,
      { kind: o.kind, ...params } as never,
      undefined,
      lesson.postedLimitKmh,
      typeof authored === "number" ? authored : undefined,
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
  //
  // REPLACED, and the replacement is the point. This slot used to read „a title
  // that names no speed still gets the gate's cap — the card did not go silent"
  // and pinned «Стигни зоната — дръж под 52 км/ч». It was defending the
  // PRESENCE of a number, and part D of the same sweep photographed what that
  // number is when nothing clamps it: 41 on a drill that names no speed, 60
  // in a curve whose plate recommends 50, 140 on a MINIMUM-speed lesson (see
  // the block below). What must not go silent is the SENTENCE — the authored
  // title survives whole — and the number must still appear wherever it is
  // somebody's: the sign's, the author's, or the halt band's.
  it("the card does not go silent — the authored sentence survives whole", () => {
    const p = advisorPromptForObjective("Стигни зоната", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 9,
      maxSpeedKmh: 52,
    });
    expect(p.textBg).toBe("Стигни зоната");
    expect(p.keys).toEqual([]);
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
// 1b. PART D — THE SAME NUMBER WHERE NOTHING CLAMPED IT
//
// The clamps above bite only where a sign is declared or the author already
// wrote a figure. Part D of the sweep photographed the cards where neither is
// true, and there `params.maxSpeedKmh` — the author's gate plus the ladder's
// grace — went on the glass as the instruction itself:
//
//   sc-speed-transition  01-arrival.png  «…до знака за зоната — дръж под 57
//                        км/ч», beside instruction 1 «ограничението е все още
//                        50 км/ч»; and «Влез в зона 30 … — дръж под 38 км/ч»
//                        beside «около 26–28 км/ч» in a posted 30.
//   sc-sp-curve          04-t120s.png    «…с препоръчителната скорост — дръж
//                        под 60 км/ч», with the A1 plate reading 50.
//   sc-sp-eco-coast      01-arrival.png  «…вече намалил — дръж под 41 км/ч» —
//                        41 appears nowhere else in the drill.
//   sc-vu-cyclist-hook   01-arrival.png  «Приближи завоя с готовност да
//                        пропуснеш — дръж под 40 км/ч» on a yielding task.
//   sc-mw-min-speed      01-arrival.png  «…— дръж под 140 км/ч» on the lesson
//                        whose whole subject is a MINIMUM.
//
// A card may only speak a number that is somebody's: the sign's where it
// binds, the author's, or the halt band's. The census below is the guard that
// keeps the next generated figure from arriving quietly.
// ---------------------------------------------------------------------------

/** Every compiled reachZone card in the catalog, with what produced it. */
function everyCappedCard(): {
  id: string;
  objectiveId: string;
  cap: number;
  posted: number | undefined;
  authored: number | undefined;
  titleBg: string;
  textBg: string;
}[] {
  const out = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level as ScenarioLevel);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (cap === undefined) continue;
        const authoredRaw = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
        const authored = typeof authoredRaw === "number" ? authoredRaw : undefined;
        out.push({
          id: lesson.id,
          objectiveId: o.id,
          cap,
          posted: lesson.postedLimitKmh,
          authored,
          titleBg: o.titleBg,
          textBg: advisorPromptForObjective(
            o.titleBg,
            { kind: "reachZone", ...(o.params as object) } as never,
            undefined,
            lesson.postedLimitKmh,
            authored,
          ).textBg,
        });
      }
    }
  }
  return out;
}

describe("sweep161 part D — the card stops publishing the grader's tolerance as the target", () => {
  // RE-STATED 2026-08-19, and stated rather than quietly edited.
  //
  // Each row below was photographed printing a number that is the GRADER'S
  // TOLERANCE — the author's gate after `widenSpeedCap` folded the rung's grace
  // in. Part D answered that by printing nothing, and the answer was half
  // right: the tolerance stopped going on the glass, and the gate went on
  // grading in silence on 499 of the 953 capped cards (the authored-cap wave —
  // `advisor-authored-cap.test.ts`, and spokenCapKmh source 4).
  //
  // So the assertion moves from „says no number" to the stronger claim it was
  // always reaching for: THE CARD SAYS THE AUTHOR'S NUMBER AND NEVER THE
  // LADDER'S. `authored` here is the template's own `maxSpeedKmh` before any
  // grace — 52 where the photograph read 57, 36 where it read 41.
  //
  // sc-mwms-join is the row that corrects the original finding rather than
  // extending it. Its street is posted 140 and `widenSpeedCap` clamps to the
  // sign, so gate == authored == posted == 140: the photographed 140 was never
  // the tolerance, it was the author's own figure, and part D excluded it only
  // because its sign test was the strict `posted < cap`. What remains true of
  // that frame — a MINIMUM-speed drill coached with a ceiling — is a template
  // copy row (templates-merging2), not a number this module may invent or
  // suppress.
  // `spoken` is the fourth column and it is the author's cap on five of the
  // six. sc-trn-in-zone is the exception and the reason it exists: its title
  // says «зона 30», which is a В26 plate written the way Bulgarian writes one,
  // and until 2026-08-24 `titleCapKmh` could not read a ceiling without the
  // literal „км/ч" beside it. The author's own pre-grace figure there is 33 —
  // itself three above the zone he authored — so the card licensed 33 inside a
  // thirty, one panel away from a briefing that says «влез в зоната вече под 30
  // км/ч». The title now wins, as source 2 always said it should.
  const cases: [string, string, number, number, number][] = [
    // scenario, objective, photographed gate, the author's own cap, spoken
    ["sc-speed-transition", "sc-trn-approach", 57, 52, 52],
    ["sc-speed-transition", "sc-trn-in-zone", 38, 33, 30],
    ["sc-sp-curve", "sc-spcv-curve", 60, 55, 55],
    ["sc-sp-eco-coast", "sc-ecoc-coast", 41, 36, 36],
    ["sc-vu-cyclist-hook", "sc-vu-approach", 40, 35, 35],
    ["sc-mw-min-speed", "sc-mwms-join", 140, 140, 140],
  ];
  for (const [scenarioId, objectiveId, photographed, authored, spoken] of cases) {
    it(`${scenarioId}/${objectiveId}: the card says ${spoken}, never the ladder's ${photographed}`, () => {
      const { objective, prompt, authoredCapKmh } = cardFor(scenarioId, objectiveId);
      // The GATE is untouched — this is a copy fix, not a re-authored objective.
      expect((objective.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(photographed);
      expect(authoredCapKmh).toBe(authored);
      expect(prompt.textBg).toBe(`${objective.titleBg} — дръж под ${spoken} км/ч`);
      // The photographed figure is gone wherever it was ever the ladder's.
      if (photographed !== authored) {
        expect(prompt.textBg).not.toContain(String(photographed));
      }
      // And the number it does say can never fail the student who obeys it.
      expect(spoken).toBeLessThanOrEqual(authored);
      expect(authored).toBeLessThanOrEqual(photographed);
      expect(Number.isInteger(spoken)).toBe(true);
      expect(Number.isInteger(authored)).toBe(true);
    });
  }

  // ── THE ZONE PLATE, BOTH DIRECTIONS ────────────────────────────────────
  //
  // sweep161's own words on this lesson: „ЗАДАЧА 2/3 says дръж под 38 км/ч
  // inside a posted 30 zone while instruction 3 says около 26–28 км/ч. A
  // student reading the chip is told … 37 in a 30 is the goal."
  // (`.audit-frames/sweep161/sc-speed-transition/pc-right/01-arrival.png`.)
  describe("«зона N» is a ceiling the author wrote, and the card reads it", () => {
    it("the зона figure binds on every rung, not just the one the ladder happens to reach", () => {
      // L1 grades at 38, L3–L5 at 33. The card is 30 on all five, so the
      // sentence stops moving with the difficulty ladder — which is the whole
      // complaint: the ladder's grace was being read out as the instruction.
      for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        const { prompt } = cardFor("sc-speed-transition", "sc-trn-in-zone", level);
        expect(prompt.textBg, `L${level}`).toBe(
          "Влез в зона 30 вече под ограничението — дръж под 30 км/ч",
        );
      }
    });

    it("and the briefing on the same screen now agrees with it", () => {
      // The frame's other half. Both figures come off the compiled lesson, so
      // a re-authored briefing that moved the zone would fail here rather than
      // silently re-open the contradiction.
      const lesson = compileScenario(template("sc-speed-transition"), 1);
      const zoneSteps = (lesson.briefingBg ?? []).filter((b) => /зона/i.test(b.textBg));
      expect(zoneSteps.length).toBeGreaterThan(0);
      const briefed = zoneSteps.flatMap((b) =>
        [...b.textBg.matchAll(/под (\d+) км\/ч/g)].map((m) => Number(m[1])),
      );
      expect(briefed).toContain(30);
      const { prompt } = cardFor("sc-speed-transition", "sc-trn-in-zone");
      expect(KMH_NUMBERS(prompt.textBg).at(-1)).toBe(Math.min(...briefed));
    });

    it("«зона» followed by something that is not a speed is NOT read as one", () => {
      // The guard band. „зона 2" is a sector, not a limit, and a card demanding
      // 2 км/ч would be the dangerous direction of this same bug.
      const p = advisorPromptForObjective(
        "Спри в зона 2 на паркинга",
        { kind: "reachZone", x: 0, y: 0, radiusM: 10, maxSpeedKmh: 40 },
        undefined,
        undefined,
        35,
      );
      expect(p.textBg).toBe("Спри в зона 2 на паркинга — дръж под 35 км/ч");
    });

    it("a зона figure LOOSER than the gate never licenses more than the gate", () => {
      // The Math.min half, in the new source. An authored «зона 50» over a gate
      // of 30 must still say 30 — a card may never invite the student to fail
      // the task it is coaching.
      const p = advisorPromptForObjective(
        "Мини зона 50 спокойно",
        { kind: "reachZone", x: 0, y: 0, radiusM: 10, maxSpeedKmh: 30 },
        undefined,
        undefined,
        30,
      );
      expect(p.textBg).toBe("Мини зона 50 спокойно — дръж под 30 км/ч");
    });
  });

  it("no compiled card anywhere speaks a number that is neither the sign's, the author's, nor a halt", () => {
    const bad: string[] = [];
    for (const c of everyCappedCard()) {
      if (!c.textBg.includes("дръж под")) continue;
      const spoken = KMH_NUMBERS(c.textBg).at(-1);
      const authored = KMH_NUMBERS(c.titleBg);
      const isHalt = c.cap <= 8;
      const isSign = c.posted !== undefined && c.posted < c.cap && spoken === c.posted;
      // Source 2 has two spellings. «зона 30» is a В26 plate and is as much the
      // author's own ceiling as «под 30 км/ч» is — see `titleCapKmh`'s zone
      // clause and the block above.
      const zonePlate = [...c.titleBg.matchAll(/зона\s*(\d+)/gi)]
        .map((m) => Number(m[1]))
        .filter((n) => n >= 10 && n <= 130);
      const isAuthored =
        spoken !== undefined && (authored.includes(spoken) || zonePlate.includes(spoken));
      // SOURCE 4 (2026-08-19): the template's own `maxSpeedKmh` before the rung's
      // grace. Admitted as a source, NOT as an escape hatch — it counts only when
      // the compiled objective actually carries the key and the spoken figure IS
      // that value, so „the number came from somewhere" still has to name the
      // somewhere. `authored <= cap` is asserted for all 953 in
      // `advisor-authored-cap.test.ts`.
      const isOwnCap = c.authored !== undefined && spoken === c.authored;
      // The gate may still cap a LOOSER authored figure (see below) — that is
      // the one remaining case where the spoken number is the gate's own.
      const isGateUnderAuthor =
        spoken === c.cap && authored.some((n) => n > c.cap);
      if (!isHalt && !isSign && !isAuthored && !isOwnCap && !isGateUnderAuthor) {
        bad.push(`${c.id} ${c.objectiveId}: cap=${c.cap} posted=${c.posted} → ${c.textBg}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no compiled card speaks a FRACTION of a km/h — the tolerance's own signature", () => {
    // 95 of the 953 capped cards read «дръж под 54.5 км/ч» / «37.5» / «38.5»
    // before this fix. A speedometer cannot show it and no instructor says it;
    // it can only be `maxSpeedKmh` after widenSpeedCap's grace.
    const fractional = everyCappedCard()
      .filter((c) => /\d+[.,]\d+\s*км\/ч/.test(c.textBg))
      .map((c) => `${c.id} ${c.objectiveId}: ${c.textBg}`);
    expect(fractional).toEqual([]);
  });

  // --- the opposite direction --------------------------------------------
  it("a HALT demand keeps its number — «спри … под 6 км/ч» is the author's own", () => {
    // widenSpeedCap returns at or below the halt band untouched, so no grace
    // was ever added: the figure IS authored, and it means come to rest.
    const { prompt } = cardFor("sc-park-parallel", "sc-ppl-position");
    expect(prompt.textBg).toContain("дръж под 6 км/ч");
  });

  it("the number still appears wherever the STREET declares one under the gate", () => {
    const { prompt } = cardFor("sc-sp-curve", "sc-spcv-approach");
    expect(prompt.textBg).toBe("Измини подхода с разрешената скорост — дръж под 90 км/ч");
  });

  it("and wherever the AUTHOR wrote one (sc-sp-limit-end is unchanged by part D)", () => {
    const { prompt } = cardFor("sc-sp-limit-end", "sc-sple-hold-to-junction");
    expect(prompt.textBg).toContain("дръж под 40 км/ч");
  });

  it("the catalog keeps its numbers — this did not silence the coach", () => {
    // WAS `> 900` and `> 400`, and that is how the census in advisor.ts rotted:
    // the file's own comment claimed „494 without a number / 459 with" while the
    // truth at HEAD was 499 / 454, and no assertion anywhere could feel five
    // cards move between the halves. Exact now, in both halves, so the next
    // change to spokenCapKmh has to say what it did to the split.
    const all = everyCappedCard();
    const spoken = all.filter((c) => c.textBg.includes("дръж под"));
    expect(all.length).toBe(953);
    expect(spoken.length).toBe(953);
    expect(all.length - spoken.length).toBe(0);
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

// ---------------------------------------------------------------------------
// 6. AND THE WAIT CARD SENT HIM INTO THE SAME PENALTY — sweep161 part A,
//    sc-sig-controller-live/mobile-right/run.log, the RIGHT lane.
//
// Block 2 fixed the objective card. The live wait card OUTRANKS it
// (`advisorPromptForSession`, B15-VOICE) and it is the one the harness
// actually read:
//
//   167:  LAWFUL WAIT declared at t=52s («Чакаш правилно») — the sim says
//         standing still IS the manoeuvre; holding.
//   196:  LAWFUL WAIT declared at t=70s («Чакането Е маневрата»)
//   358:  ✗ Неизпълнение на сигнала на регулировчика −10 изпитни т. ОПАСНА
//         ГРЕШКА … Премина стоп-линията, докато регулировчикът спираше твоето
//         направление.
//
// The grader was right and the CARD was wrong: `yieldWaitAdvisorPrompt
// ("redLight")` is generic copy that ends „Тръгваш на зелено", and at a
// regulated junction the lamp decides nothing (ЗДвП чл. 6, т. 2 / чл. 7,
// ал. 1). The drive that followed the coaching failed the lesson the coaching
// was for.
// ---------------------------------------------------------------------------

/** A driving session parked on one objective with a live lawful wait. */
function waitingSession(
  scenarioId: string,
  objectiveId: string,
  reason: YieldReason,
): LessonSessionState {
  const lesson = compileScenario(template(scenarioId), 1);
  const base = createLessonSession(lesson);
  const idx = lesson.objectives.findIndex((o) => o.id === objectiveId);
  if (idx < 0) throw new Error(`no such objective: ${scenarioId}/${objectiveId}`);
  return {
    ...base,
    phase: "driving",
    currentObjectiveIndex: idx,
    yieldWait: heldWait(reason, 1),
  };
}

describe("sweep161 — the live wait card stops telling the officer's junction to watch the lamp", () => {
  // 2026-08-24 — THE DISPLACEMENT WAS SCOPED TO ONE BANNER AND THE OFFICER IS
  // NOT A PROPERTY OF ONE BANNER.
  //
  // The first cut asked `titleNamesController(active.spec.titleBg)` and fell
  // through to the OBJECTIVE card, and the test below said out loud what was
  // wrong with that: „`titleNamesController` is a substring test, so the
  // displacement is only ever as strong as the banner." Measured over the
  // compiled catalogue, two of the three officer drills carry an objective that
  // does not name him — `sc-sctl-exit` and, worse, `sc-sctp-cross`, the
  // CROSSING objective of sc-sig-controller-postures — and on both the generic
  // «Чакаш правилно на червено … Тръгваш на зелено» came straight back at the
  // junction where the lamp decides nothing.
  //
  // Two things changed. The officer is now read off the LESSON (its title, its
  // briefing, any of its objective titles — all authored copy the student has
  // been shown), and what replaces the lamp card is a WAIT card rather than the
  // waypoint: falling through to the objective would have answered a student
  // standing still at `sc-sctl-exit` with «Излез от кръстовището на север».
  const OFFICER_CARD = controllerWaitAdvisorPrompt().textBg;

  it("sc-sig-controller-live: the wait card is the officer's, not «Тръгваш на зелено»", () => {
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-cross", "redLight");
    const p = advisorPromptForSession(s);
    expect(p?.textBg).not.toContain("Тръгваш на зелено");
    expect(p?.textBg).toBe(OFFICER_CARD);
  });

  it("…and on its approach objective too", () => {
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-read", "redLight");
    const p = advisorPromptForSession(s);
    expect(p?.textBg).not.toContain("Тръгваш на зелено");
    expect(p?.textBg).toBe(OFFICER_CARD);
  });

  it("the OBJECTIVE card on the approach still keeps the officer in its own words", () => {
    // KEPT FROM THE FIRST CUT, which pinned this and is still right: the banner
    // was «Приближи бавно и прочети регулировчика, не лампата» until 2026-08-19
    // (doc 88 O21) — nothing in the cockpit contract can witness a look at a
    // world actor, so the gate certified a read it never measured and the claim
    // moved to `sc-sctl-cross`. The OFFICER stayed in the words, and this test
    // is why: the first cut of that retitle read «Приближи бавно до
    // стоп-линията», and `advisorPromptForObjective`'s own officer branch
    // (`titleNamesController`) is still a substring test on THIS banner. The cap
    // clause is the authored-cap wave: the zone grades at 20 and the template's
    // own figure IS 20, so the card names it rather than grading in silence.
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-read", "redLight");
    const notWaiting = { ...s, yieldWait: freeWait() };
    const p = advisorPromptForSession(notWaiting);
    expect(p?.textBg).toBe("Приближи бавно до регулировчика — дръж под 20 км/ч");
    expect(p?.textBg).toContain("регулировчика");
  });

  it("…and the CROSSING objective's card is still the authored officer sentence", () => {
    // The `requireRedMet` branch of `advisorPromptForObjective`, which the
    // generic «Спри на стоп-линията на светофара и изчакай зелено» used to
    // answer — the sentence sweep161 filed as defect 3.
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-cross", "redLight");
    const notWaiting = { ...s, yieldWait: freeWait() };
    const p = advisorPromptForSession(notWaiting);
    expect(p?.textBg).toBe(
      "Премини стоп-линията по разрешение на регулировчика — въпреки червената лампа",
    );
    expect(p?.textBg).not.toContain("изчакай зелено");
    expect(p?.keys).toEqual(["S"]);
  });

  it("…and on the objective that does NOT name him — the hole the first cut left", () => {
    // `sc-sctl-exit` is «Излез от кръстовището на север». Before 2026-08-24 a
    // red hold here read «Чакаш правилно на червено … Тръгваш на зелено», on
    // the drill whose −10 was for doing exactly that.
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-exit", "redLight");
    const p = advisorPromptForSession(s);
    expect(p?.textBg).not.toContain("Тръгваш на зелено");
    expect(p?.textBg).toBe(OFFICER_CARD);
  });

  it("…and on sc-sig-controller-postures' CROSSING objective, which never named him either", () => {
    const s = waitingSession("sc-sig-controller-postures", "sc-sctp-cross", "redLight");
    const p = advisorPromptForSession(s);
    expect(p?.textBg).not.toContain("Тръгваш на зелено");
    expect(p?.textBg).toBe(OFFICER_CARD);
  });

  it("…and after the last objective, where the route runs out past the same junction", () => {
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-exit", "redLight");
    const done = { ...s, currentObjectiveIndex: s.objectives.length };
    expect(advisorPromptForSession(done)?.textBg).toBe(OFFICER_CARD);
  });

  it("the officer's card praises nothing it cannot see, and orders nothing either", () => {
    // THE HALF THAT MATTERS MOST. On the convicting drive the officer was
    // SIDE-ON — the wait itself was the fault — so «Чакаш правилно» was false.
    // Nothing this module is handed carries his posture, so it may neither
    // approve the wait nor tell the student to go; it says where to look and
    // what each posture means, which is true on every frame of every officer's
    // junction.
    expect(OFFICER_CARD).not.toContain("Чакаш правилно");
    expect(OFFICER_CARD).not.toMatch(/Тръгвай|Потегли|Мини сега/);
    expect(OFFICER_CARD).toContain("регулировчик");
    // The teaching content: where to look, and both postures, so the student
    // can act on it rather than be told a verdict (THEO-4 requirement zero).
    expect(OFFICER_CARD).toContain("позата");
    expect(OFFICER_CARD).toContain("страничен профил");
    expect(OFFICER_CARD).toContain("гърди");
    // The raised arm is the third posture ППЗДвП чл. 65 names and the only one
    // that overrides a side-on release. A card that listed the other two alone
    // would send a student who is side-on straight through a phase change.
    expect(OFFICER_CARD).toContain("ръка горе");
    // …and no key chip, because the next action depends on a posture this
    // module cannot read (the advisor's own honesty rule).
    expect(controllerWaitAdvisorPrompt().keys).toEqual([]);
  });

  it("…and it fits the same 240 px column every other wait card is held to", () => {
    // `yield-voice.test.ts` holds all five reason cards to 40–150 characters.
    // This one is painted in the same slot, so it is held to the same band —
    // the first draft was 249 and would have clipped the clause that says GO.
    expect(OFFICER_CARD.length).toBeGreaterThan(40);
    expect(OFFICER_CARD.length).toBeLessThan(150);
  });

  // --- the opposite direction --------------------------------------------
  it("an ORDINARY red-light wait still gets the lawful-wait card", () => {
    const s = waitingSession("sc-signal-response", "sc-sig-pass", "redLight");
    const p = advisorPromptForSession(s);
    expect(p?.textBg).toBe(yieldWaitAdvisorPrompt("redLight").textBg);
    expect(p?.textBg).toContain("Тръгваш на зелено");
  });

  it("a PEDESTRIAN wait at the officer's own junction still gets the pedestrian card", () => {
    // Only the lamp copy is displaced. A человек on the zebra outranks
    // everything, officer included, and that card must survive verbatim.
    const s = waitingSession("sc-sig-controller-live", "sc-sctl-cross", "pedestrian");
    expect(advisorPromptForSession(s)?.textBg).toBe(
      yieldWaitAdvisorPrompt("pedestrian").textBg,
    );
  });

  it("a wait after the last objective is still answered (the run-out card)", () => {
    const s = waitingSession("sc-signal-response", "sc-sig-pass", "giveWayLine");
    const done = { ...s, currentObjectiveIndex: s.objectives.length };
    expect(advisorPromptForSession(done)?.textBg).toBe(
      yieldWaitAdvisorPrompt("giveWayLine").textBg,
    );
    // …and with no wait, an exhausted chain still advises nothing.
    expect(advisorPromptForSession({ ...done, yieldWait: freeWait() })).toBeNull();
  });

  it("the lesson scope is EVIDENCE, not a blanket — no officer anywhere means no displacement", () => {
    // The census this widening was measured against: three templates stage a
    // регулировчик and every other lesson in the catalogue keeps every card it
    // had. Driven over the whole catalogue so a future template that mentions
    // him in passing shows up here rather than on a student's glass.
    const displaced: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const lesson = compileScenario(spec, 1);
      const idx = lesson.objectives.length > 0 ? 0 : -1;
      if (idx < 0) continue;
      const s: LessonSessionState = {
        ...createLessonSession(lesson),
        phase: "driving",
        currentObjectiveIndex: idx,
        yieldWait: heldWait("redLight", 1),
      };
      if (advisorPromptForSession(s)?.textBg === OFFICER_CARD) displaced.push(spec.id);
    }
    expect(displaced.sort()).toEqual([
      "sc-sig-controller-live",
      "sc-sig-controller-postures",
      "sc-signal-controller",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. THE MIDDLE LINE OF THE RED-LIGHT LECTURE — the other channel on the same
//    convicting drive.
//
// run.log line 196, t = 70 s: «Чакането Е маневрата · 13 секунди на червено са
// просто цикълът на светофара, не грешка …», 34 s before line 358 billed −10
// «Неизпълнение на сигнала на регулировчика». The card is displaced at an
// officer's junction; this channel cannot be — `stepYieldVoice` is handed a
// reason and a speed and never the lesson — so the generic lecture has to carry
// ЗДвП чл. 6, т. 2's single exception in EVERY stage, not in three of four.
// ---------------------------------------------------------------------------

describe("sweep161 — every stage of the red-light lecture names the one exception", () => {
  const stages = () => {
    const said: HudEvent[] = [];
    let v: YieldVoiceState = createYieldVoice();
    for (let t = 0; t <= YIELD_VOICE_SETTLE_S + 2; t += 0.5) {
      const step = stepYieldVoice(v, {
        t,
        speedKmh: 0,
        wait: heldWait("redLight", 0),
        violations: [],
      });
      v = step.state;
      said.push(...step.notices);
    }
    return said;
  };

  it("the card, the naming line AND the settled line all say the officer outranks the lamp", () => {
    const spoken = [
      yieldWaitAdvisorPrompt("redLight").textBg,
      ...stages().map((e) => (e.kind === "lesson" ? `${e.titleBg} ${e.explanationBg}` : "")),
    ].filter((s) => s.length > 0);
    // Both staged lines actually fired — otherwise this test proves nothing.
    expect(spoken.length).toBe(3);
    for (const line of spoken) expect(line, line.slice(0, 40)).toMatch(/регулировчик/i);
  });

  it("the settled line still says the seconds are not a fault — nothing was traded away for it", () => {
    const settled = stages().find(
      (e) => e.kind === "lesson" && e.titleBg === "Чакането Е маневрата",
    );
    expect(settled).toBeDefined();
    const body = settled!.kind === "lesson" ? settled!.explanationBg : "";
    expect(body).toContain("не грешка");
    expect(body).toContain("изваждат от ориентировъчното време");
    expect(body).toMatch(/^\d+ секунди/);
  });

  it("and the exception is not smuggled into the other four reasons", () => {
    // A Б1 line that started lecturing about регулировчици would be the
    // opposite defect: copy that is true somewhere else, on a card that is
    // about a give-way sign.
    for (const reason of ["giveWayLine", "stopSign", "pedestrian", "roundaboutEntry"] as const) {
      expect(yieldWaitAdvisorPrompt(reason).textBg, reason).not.toMatch(/регулировчик/i);
    }
  });
});
