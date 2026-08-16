import { describe, expect, it } from "vitest";
import { briefingBodyBg, briefingLineBg } from "../../../hud/overlayQueue";
import { SCENARIO_TEMPLATES_FLOW } from "../templates-flow";
import { SCENARIO_TEMPLATES_FOLLOWING } from "../templates-following";
import { SCENARIO_TEMPLATES_CONDITIONS } from "../templates-conditions";
import { SCENARIO_TEMPLATES_CONDITIONS2 } from "../templates-conditions2";
import { SCENARIO_TEMPLATES_PARKING3 } from "../templates-parking3";
import type { ScenarioSpec } from "../types";

/**
 * =============================================================================
 * „MOST OF EVERY LESSON IS INVISIBLE ON A PHONE."
 *
 * THE DEFECT. `SimOverlay`'s compact card renders a compiled briefing as two
 * rows inside one 8 rem scroll window: step 1 is THE LINE (`briefingLineBg`),
 * steps 2..n are THE BODY (`briefingBodyBg`). The window was sized against the
 * thirteen PRE-DRIVE instructions, which are 55–95 characters. Nobody
 * re-checked it against the scenario briefings the same card renders: 883 steps
 * across 166 scenarios, median 109, p90 174, max 342 — 586 of them outside the
 * band. In the five files this gate owns, 112 of 165 steps were past 95 and the
 * mean step was 122 characters.
 *
 * WHAT IT COST, MEASURED ON THE DEPLOYED BUILD (WebKit, real insets, signed in,
 * `/simulator?scenario=sc-zebra-approach&level=1`, speedometer reading
 * «Скорост 0 километра в час» at rest — a probe that reads a moving speed on a
 * parked car is reading the limit sign, not the car). A per-character Range
 * walk of both rows against the scroll window's VISIBLE band (its box minus the
 * 10 px mask fade) puts the fold in authored characters:
 *
 *   iPhone 16 LANDSCAPE  window 180 × 127 px, band 117 px
 *   iPhone 16 PORTRAIT   window 141.5 × 128 px, band 118 px
 *
 *     LINE chars │ body chars still above the fold (landscape / portrait)
 *     ───────────┼───────────────────────────────────────────────────────
 *          34    │      122 / 110
 *          42    │      122 / 110
 *          52    │       96 / 110
 *          76    │       96 /  90
 *          96    │       68 /  68
 *         219    │        0 /   0     ← sc-zebra-approach as it shipped
 *
 * The 219-character step 1 did not merely clip itself (85 % survived in
 * landscape, 72 % in portrait) — IT DELETED THE WHOLE BODY. Steps 2–5 measured
 * ZERO visible characters on both profiles. `sc-za-approach` grades a ≤ 40 km/h
 * gate 12 m before the zebra; that instruction was step 2. The student was
 * graded on a sentence the phone never displayed.
 *
 * WHY A CHARACTER GATE AND NOT A PIXEL ONE. Pixels are the renderer's; the only
 * thing an author controls is the string. The table above is the conversion,
 * measured once on the real device, and everything below is arithmetic on it.
 * =============================================================================
 */

const OWNED: ReadonlyArray<{ file: string; specs: readonly ScenarioSpec[] }> = [
  { file: "templates-flow.ts", specs: SCENARIO_TEMPLATES_FLOW },
  { file: "templates-following.ts", specs: SCENARIO_TEMPLATES_FOLLOWING },
  { file: "templates-conditions.ts", specs: SCENARIO_TEMPLATES_CONDITIONS },
  { file: "templates-conditions2.ts", specs: SCENARIO_TEMPLATES_CONDITIONS2 },
  { file: "templates-parking3.ts", specs: SCENARIO_TEMPLATES_PARKING3 },
];

const ALL = OWNED.flatMap((g) => g.specs.map((spec) => ({ file: g.file, spec })));

/**
 * The band the compact card was built for. Named after the corpus it was sized
 * against (the pre-drive instructions), not invented here.
 */
const STEP_MAX_CHARS = 95;

/** The measured table above, as a function. */
const FOLD_TABLE: ReadonlyArray<readonly [lineChars: number, bodyVisible: number]> = [
  [34, 110],
  [42, 110],
  [52, 96],
  [76, 90],
  [96, 68],
];

/**
 * Characters of the BODY that survive above the fold, given a LINE of `n`
 * characters — the WORSE of the two measured profiles at each row, and the
 * first row whose line length is not exceeded (so a 60-character line is
 * charged the 76-character row's budget, never the 52-character row's).
 * Anything past the last measured row is 0: that is what 219 measured.
 */
function bodyCharsAboveFold(lineChars: number): number {
  for (const [len, visible] of FOLD_TABLE) if (lineChars <= len) return visible;
  return 0;
}

/**
 * The imperatives this catalogue teaches with. A step must OPEN with one:
 * whatever the card manages to paint, it paints the beginning of the string,
 * so the beginning is where the act belongs. „Не“ counts — a prohibition is an
 * instruction — and so do the four that introduce a fact the student must hold
 * (`Помни` / `Знай` / `Виж` / `Сметни`), because a rationale step is still
 * addressed to him.
 */
const ACT_FIRST =
  /^(Потегли|Приближи|Премини|Премести|Провери|Погледни|Гледай|Включи|Изключи|Вдигни|Намали|Спри|Спирай|Изчакай|Чакай|Огледай|Влез|Влизай|Излез|Подмини|Върни|Завърти|Изправи|Центрирай|Коригирай|Прави|Дръж|Задръж|Движи|Карай|Мини|Мери|Премери|Чети|Прочети|Търси|Хвани|Хвърли|Натисни|Отпусни|Реагирай|Очаквай|Наблюдавай|Не|Помни|Знай|Виж|Приеми|Сметни|Стабилизирай|Установи|Превключи|Следвай|Продължи|Започни|Пази|Брой|Измери|Смъкни|Стигнеш|Намалявай|Увеличи|Посрещни|Прибери|Пропусни)(?![\p{L}])/u;

describe("the briefing steps these five files author survive the compact card", () => {
  it("has a corpus at all (a sweep over nothing is the selectors.test.mjs lesson)", () => {
    expect(ALL.length).toBe(33);
    expect(ALL.reduce((n, t) => n + t.spec.instructionsBg.length, 0)).toBeGreaterThan(160);
  });

  it("no step is longer than the 95-character band the card was sized against", () => {
    const over: string[] = [];
    for (const { file, spec } of ALL) {
      for (const step of spec.instructionsBg) {
        if (step.textBg.length > STEP_MAX_CHARS) {
          over.push(`${file} ${spec.id} step ${step.n}: ${step.textBg.length} ch — ${step.textBg}`);
        }
      }
    }
    expect(over, `${over.length} step(s) past ${STEP_MAX_CHARS} characters:\n${over.join("\n")}`).toEqual([]);
  });

  it("every step OPENS with its act — no condition, citation or reason in front of the verb", () => {
    const buried: string[] = [];
    for (const { file, spec } of ALL) {
      for (const step of spec.instructionsBg) {
        if (!ACT_FIRST.test(step.textBg)) {
          buried.push(`${file} ${spec.id} step ${step.n}: «${step.textBg.slice(0, 60)}…»`);
        }
      }
    }
    expect(buried, buried.join("\n")).toEqual([]);
  });

  /**
   * THE ONE THAT ENCODES THE FOLD, and the one the shipped copy failed.
   *
   * A briefing is delivered as line + body. Step 2 is the first thing the body
   * prints, prefixed with „2. “ (three characters, `briefingBodyBg`), and on
   * most drills it is the step that carries the graded act — sc-za-approach's
   * ≤ 40 km/h approach was exactly this. So step 2 must fit in the body budget
   * the LINE leaves behind, whole, with no scrolling.
   */
  it("step 2 renders WHOLE above the fold at the line length each template authors", () => {
    const cut: string[] = [];
    for (const { file, spec } of ALL) {
      const steps = spec.instructionsBg;
      if (steps.length < 2) continue;
      const budget = bodyCharsAboveFold(steps[0]!.textBg.length);
      const needed = "2. ".length + steps[1]!.textBg.length;
      if (needed > budget) {
        cut.push(
          `${file} ${spec.id}: line ${steps[0]!.textBg.length} ch leaves ${budget} body ch, step 2 needs ${needed}`,
        );
      }
    }
    expect(cut, cut.join("\n")).toEqual([]);
  });

  /**
   * sc-za-approach caps the approach at 40 km/h and sc-zebra-approach's copy
   * has to say so on the row that is always painted. This is the founder's
   * defect stated as an assertion rather than as prose: the number he is graded
   * against, on the line he cannot scroll away from.
   */
  it("sc-zebra-approach names its graded 40 km/h cap ON THE LINE, not in the body", () => {
    const spec = SCENARIO_TEMPLATES_FLOW.find((s) => s.id === "sc-zebra-approach")!;
    const gate = spec.success[0]!.params;
    if (gate.kind !== "reachZone") return expect.unreachable("first objective kind");
    expect(gate.maxSpeedKmh).toBe(40);
    const line = briefingLineBg(spec.instructionsBg.map((s) => ({ n: s.n, textBg: s.textBg })));
    expect(line, "the graded cap is not on the row the card always paints").toContain("40 км/ч");
    expect(line.length).toBeLessThanOrEqual(STEP_MAX_CHARS);
  });

  /**
   * …AND THE SHIPPED COPY STILL FAILS ALL OF IT, so the gate has teeth.
   *
   * These are the exact strings that were in the repository on 2026-08-16,
   * kept here and nowhere else. If a future edit reverts the wave, the three
   * assertions above go red on their own; this one guarantees they were never
   * vacuous in the first place — the same shape as briefing-no-echo.test.ts's
   * „the OLD derivation still fails it".
   */
  it("the copy that shipped fails every rule above (the assertions are not vacuous)", () => {
    const SHIPPED: ReadonlyArray<readonly [id: string, n: number, textBg: string]> = [
      [
        "sc-zebra-approach",
        1,
        "Потегли по улицата и се движи спокойно в своята лента. По тъмно първо провери късите светлини (чл. 70): пред пешеходна пътека нощем те са и твоят поглед към тротоара, и знакът, по който пешеходецът решава дали да стъпи.",
      ],
      [
        "sc-ac-wind-truck-pass",
        1,
        "Магистрала, а вятърът бие силно отстрани. Пред теб в дясната лента пъпли бавен камион — хвани волана здраво с двете ръце още отсега. Вали ли, включи и късите светлини (чл. 70): изпреварването на камион в дъжд те прекарва през неговия воден облак, където той те вижда само по фаровете ти.",
      ],
      [
        "sc-park-gap-short",
        2,
        "Задача 1: спри успоредно на предната кола, на около половин метър странично, със задната си броня срещу нейната задна броня. Спри наистина — под 6 км/ч, практически в покой. Всичко следващо се мери от тази позиция.",
      ],
      [
        "sc-ac-night-lights",
        1,
        "Преди да потеглиш по тъмно: включи късите светлини още със запалването на двигателя.",
      ],
    ];
    // Three of the four are past the band…
    expect(SHIPPED.filter(([, , t]) => t.length > STEP_MAX_CHARS).length).toBe(3);
    // …the 219-character one zeroed the body outright…
    expect(bodyCharsAboveFold(SHIPPED[0]![2].length)).toBe(0);
    // …and the fourth is inside the band yet still buries its verb behind the
    // condition, which is the half of the defect a length rule cannot see.
    expect(SHIPPED[3]![2].length).toBeLessThanOrEqual(STEP_MAX_CHARS);
    expect(ACT_FIRST.test(SHIPPED[3]![2])).toBe(false);
    // None of the four is what the files hold today.
    for (const [id, n, textBg] of SHIPPED) {
      const spec = ALL.find((t) => t.spec.id === id)!.spec;
      expect(spec.instructionsBg.find((s) => s.n === n)?.textBg, `${id} step ${n}`).not.toBe(textBg);
    }
  });

  /**
   * THE HALF THIS LANE COULD NOT FIX, pinned so it cannot be forgotten.
   *
   * On a rung that adds a complication, `briefingBg[0]` is NOT authored in
   * these files — compile.ts puts `complicationBriefingText` there, and that
   * string runs 309–509 characters on 61 of the 165 rungs these templates
   * compile. By the table above, anything past ~96 leaves the body at zero, so
   * L4/L5 students still see the complication and nothing else. The fix belongs
   * in compile.ts / complications.ts, which this lane does not own.
   *
   * This asserts the SHAPE of the problem, not a number owned elsewhere: the
   * body a template authors must be reachable the moment the line is short
   * enough — i.e. the templates have done their half.
   */
  it("with the complication out of the way, every template's own body starts above the fold", () => {
    const dead: string[] = [];
    for (const { file, spec } of ALL) {
      const steps = spec.instructionsBg.map((s) => ({ n: s.n, textBg: s.textBg }));
      const body = briefingBodyBg(steps);
      expect(body, `${spec.id} has no body at all`).not.toBeNull();
      if (bodyCharsAboveFold(briefingLineBg(steps).length) === 0) {
        dead.push(`${file} ${spec.id}: its own step 1 still zeroes the body`);
      }
    }
    expect(dead, dead.join("\n")).toEqual([]);
  });
});
