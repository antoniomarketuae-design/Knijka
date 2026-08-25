/**
 * THE CHIP AND THE BRIEFING ARE ON THE SAME SCREEN, SO THEY MAY NOT ASK FOR
 * DIFFERENT THINGS — w10-3/w10-4, 2026-08-24.
 *
 * Two findings, one shape, and both were filed against `lessons/advisor.ts`.
 * That file builds the sentence; it does not author either half of the
 * contradiction, and the contradictions are in the templates.
 *
 * ── sc-sp-harsh-brake:543539f6 ───────────────────────────────────────────────
 * `.audit-frames/w10-3/frames/sc-sp-harsh-brake__pc-right/01-arrival.png`,
 * 1440 × 900, one photograph:
 *
 *   right column   «ЗАДАЧА 1/2 · Мини контролната зона с планирано, плавно
 *                   спиране» · «дръж под 50 км/ч»
 *   ИНСТРУКЦИИ 3   «Вдигни газта първо и остави колата да губи скорост, после
 *                   спирай постепенно и равномерно ДО ПЪЛЕН ПОКОЙ В ЗОНАТА.»
 *
 * „Мини" is минавам — pass through. One card tells him to drive through the
 * twelve metres the other card tells him to stop dead in.
 *
 * ── sc-sp-curve:289575d7 ─────────────────────────────────────────────────────
 * `.audit-frames/w10-4/frames/sc-sp-curve__mobile-right/04-t113s.png`: the chip
 * «Мини средата на завоя с препоръчителната скорост» over a cockpit strip
 * reading «задачата иска ≤55», beside a briefing whose step 2 names the табела
 * „50" and whose step 3 says «около 45–50 км/ч». The title deferred to a number
 * and the product answered with a looser one.
 *
 * WHAT IS ASSERTED, AND WHY IT IS THE CATALOGUE. Both repairs are one-line
 * authored strings, and a rule with one enforced instance is a convention: the
 * frames find the next instance immediately. So each is stated as a property
 * every shipped template is measured against, and each census is spelt out
 * rather than left as `> 0`, because a survey that quietly shrinks is how a
 * measurement in this tree goes stale without failing.
 *
 * NEITHER RULE MOVES A GATE. Both offending drills keep their authored
 * `maxSpeedKmh` exactly — the repairs are to sentences, so no drive that was
 * credited stops being credited, which is the direction this programme may not
 * move in.
 */

import { describe, expect, it } from "vitest";

import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import { AUTHORED_MAX_SPEED_PARAM_KEY } from "../compile";
import { advisorPromptForObjective, advisorPromptForSession } from "../../advisor";
import { createLessonSession } from "../../engine";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import type { LessonSessionState } from "../../types";

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

/** Every rung a template actually authors (compileScenario throws on the rest). */
function rungsOf(spec: ScenarioSpec): ScenarioLevel[] {
  return LEVELS.filter((l) => spec.levels.some((r) => r.level === l));
}

/** The card the session builds for one compiled objective, as the shell builds it. */
function cardFor(spec: ScenarioSpec, level: ScenarioLevel, objectiveId: string): string {
  const lesson = compileScenario(spec, level);
  const o = lesson.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`${spec.id}@L${level}: no objective ${objectiveId}`);
  const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
  return advisorPromptForObjective(
    o.titleBg,
    { kind: o.kind, ...(o.params as object) } as never,
    undefined,
    lesson.postedLimitKmh,
    typeof authored === "number" ? authored : undefined,
  ).textBg;
}

// ---------------------------------------------------------------------------
// 1. A task may not send the student THROUGH a zone the briefing stops him in
// ---------------------------------------------------------------------------

/**
 * „Мини …" / „Премини …" — the traverse verbs, at the head of a task title.
 *
 * NOT `\b`. `\b` is an ASCII word boundary and Cyrillic letters are not `\w`,
 * so `/^Мини\b/u` matched NOTHING and this whole census would have swept an
 * empty list while reporting green — the exact instrument failure this round
 * was briefed on. The separator is asserted explicitly instead.
 */
const TRAVERSE_RX = /^(?:Мини|Премини|Измини)(?=\s|$)/u;
/** The briefing ordering a full stop inside the graded zone. */
const FULL_STOP_IN_ZONE_RX = /пълен покой[^.]{0,40}зон/iu;

describe("a task title never contradicts its own briefing about stopping", () => {
  it("no shipped template tells the student to pass through a zone it also tells him to stop in", () => {
    const clashes: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const level of rungsOf(spec)) {
        const lesson = compileScenario(spec, level);
        const briefing = (lesson.briefingBg ?? []).map((s) => s.textBg).join(" | ");
        if (!FULL_STOP_IN_ZONE_RX.test(briefing)) continue;
        for (const o of lesson.objectives) {
          if (!TRAVERSE_RX.test(o.titleBg)) continue;
          if (!/зон/iu.test(o.titleBg)) continue;
          clashes.push(`${spec.id}@L${level} ${o.id}: «${o.titleBg}» vs «до пълен покой в зоната»`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it("the sweep can convict — the frame's own title, run back through the rule", () => {
    // THE MUTATION, KEPT AS AN ASSERTION. A census that cannot be shown to fire
    // is the reassuring instrument this programme keeps finding; this is the
    // exact string the photograph carries, judged by the exact predicate above.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sp-harsh-brake");
    expect(spec, "sc-sp-harsh-brake left the registry").toBeDefined();
    const briefing = (compileScenario(spec!, 1).briefingBg ?? []).map((s) => s.textBg).join(" | ");
    expect(FULL_STOP_IN_ZONE_RX.test(briefing)).toBe(true);
    expect(TRAVERSE_RX.test("Мини контролната зона с планирано, плавно спиране")).toBe(true);
    // …and what actually ships is the corrected one.
    const o = compileScenario(spec!, 1).objectives.find((x) => x.id === "sc-shb-stop");
    expect(o!.titleBg).toBe("Стигни контролната зона с планирано, плавно спиране");
    expect(TRAVERSE_RX.test(o!.titleBg)).toBe(false);
  });

  it("the graded gate did not move — the repair is a sentence, not a verdict", () => {
    for (const level of rungsOf(SCENARIO_TEMPLATES.find((s) => s.id === "sc-sp-harsh-brake")!)) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sp-harsh-brake")!;
      const o = spec.success.find((x) => x.id === "sc-shb-stop")!;
      expect(o.params.kind).toBe("reachZone");
      expect((o.params as { maxSpeedKmh?: number }).maxSpeedKmh, `L${level}`).toBe(52);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. A title that invokes the recommended speed must name the табела's number
// ---------------------------------------------------------------------------

const ADVISORY_WORD_RX = /препоръчител/iu;
const KMH_RX = /(\d+(?:[.,]\d+)?)\s*км\/ч/gu;

/** Every „N км/ч" in a string, as numbers. */
function kmhIn(s: string): number[] {
  return [...s.matchAll(KMH_RX)].map((m) => Number(m[1]!.replace(",", ".")));
}

describe("a task that invokes the recommended speed says which number that is", () => {
  it("no objective title in the catalogue says «препоръчител…» without its number", () => {
    // THE DEFECT THE FRAME PHOTOGRAPHED, as a property. A title that defers to
    // „the recommended speed" and names no figure leaves the card free to fall
    // through to the grader's tolerance — which is what put 55 on the glass of a
    // curve the world recommends 50 for.
    const bare: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        if (!ADVISORY_WORD_RX.test(o.titleBg)) continue;
        if (kmhIn(o.titleBg).length === 0) bare.push(`${spec.id} ${o.id}: «${o.titleBg}»`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("…and the number it names is the one its own map recipe posts on the табела", () => {
    // The plate is `map.params.advisoryKmh` — the generator recipe, mirrored
    // byte-for-byte into the district's meta.scenario.params, which is what
    // builds the А1 + табела the student reads. Card and plate cannot drift.
    const wrong: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const advisory = spec.map.params["advisoryKmh"];
      if (typeof advisory !== "number") continue;
      for (const o of spec.success) {
        if (!ADVISORY_WORD_RX.test(o.titleBg)) continue;
        const named = kmhIn(o.titleBg);
        if (!named.includes(advisory)) {
          wrong.push(`${spec.id} ${o.id}: title says ${JSON.stringify(named)}, табела posts ${advisory}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("sc-sp-curve's card now publishes 50 on every rung — and never 55", () => {
    // SOURCE-PINNED to the finding's own lesson, so the catalogue census above
    // can never go green by measuring a card the frame does not show.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sp-curve");
    expect(spec, "sc-sp-curve left the registry").toBeDefined();
    for (const level of rungsOf(spec!)) {
      const text = cardFor(spec!, level, "sc-spcv-curve");
      expect(text, `L${level}`).toBe("Мини средата на завоя с препоръчителните 50 км/ч — дръж под 50 км/ч");
      expect(text, `L${level}`).not.toContain("55");
    }
  });

  it("a target or a floor in a title never becomes the card's ceiling", () => {
    // THE OTHER HALF OF THE SAME REPAIR — finding sc-mw-min-speed:2545554a.
    // `titleCapKmh` used to take every «N км/ч» in a title as a cap, so a drill
    // could not state its taught RHYTHM on the chip without the card turning it
    // into a speed limit. sc-mw-min-speed is the drill where that direction is
    // actively dangerous: its subject is not crawling on a motorway, and
    // «дръж под 110 км/ч» would have been the lesson coaching the fault it
    // exists to teach against. Asserted as a property so the next «около N»
    // anywhere in the catalogue is safe by construction.
    const TARGET_OR_FLOOR = /(?:около|поне|не под|минимум)\s+(\d+(?:[.,]\d+)?)\s*км\/ч/giu;
    const captured: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const level of rungsOf(spec)) {
        const lesson = compileScenario(spec, level);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const soft = [...o.titleBg.matchAll(TARGET_OR_FLOOR)].map((m) =>
            Number(m[1]!.replace(",", ".")),
          );
          if (soft.length === 0) continue;
          const text = cardFor(spec, level, o.id);
          const printed = /дръж под (\d+(?:[.,]\d+)?) км\/ч/u.exec(text);
          if (printed === null) continue;
          const n = Number(printed[1]!.replace(",", "."));
          if (soft.includes(n)) {
            captured.push(`${spec.id}@L${level} ${o.id}: card capped at the target ${n} — «${text}»`);
          }
        }
      }
    }
    expect(captured).toEqual([]);
  });

  it("sc-mw-min-speed's chip now carries the rhythm, and still publishes the gate", () => {
    // SOURCE-PINNED to `.audit-frames/w10-1/frames/sc-mw-min-speed__pc-right/
    // 01-arrival.png`, whose whole complaint is that the only number on the
    // glass was the ceiling. Both halves are asserted together on purpose: the
    // rhythm arrived AND the ceiling is still the gate's 140, so nothing about
    // the grade moved and no correct drive can be refused by this repair.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-mw-min-speed");
    expect(spec, "sc-mw-min-speed left the registry").toBeDefined();
    //
    // 2026-08-25, `sc-mw-min-speed:f3c26187`: the FIGURE moved and this pin
    // moved with it, which is the pin doing its job. mw-v1 is the one motorway
    // in the catalogue and both drills run on it back to back; the sibling
    // sc-mw-discipline briefs «около 120–130 км/ч» and the staged flow here is
    // authored at cruiseSpeedMps 33 → 36 (119 → 130 км/ч), so 110 was the one
    // number on this road that nothing backed. The gate is still 140 and the
    // suffix is still the gate's, so this repair still cannot refuse a drive.
    const briefing = (compileScenario(spec!, 1).briefingBg ?? []).map((s) => s.textBg).join(" | ");
    expect(briefing, "briefing step 2 is where the rhythm comes from").toContain(
      "около 120–130 км/ч",
    );
    // …and the old number is gone from the briefing, so „the chip quotes a
    // figure the lesson no longer sources" cannot come back on either side.
    expect(briefing, "the retired figure must not survive anywhere").not.toContain("110 км/ч");
    for (const objectiveId of ["sc-mwms-join", "sc-mwms-hold"]) {
      for (const level of rungsOf(spec!)) {
        const text = cardFor(spec!, level, objectiveId);
        expect(text, `${objectiveId}@L${level}`).toContain("около 120–130 км/ч");
        expect(text, `${objectiveId}@L${level}`).toContain("дръж под 140 км/ч");
        expect(text, `${objectiveId}@L${level}`).not.toContain("дръж под 130");
        expect(text, `${objectiveId}@L${level}`).not.toContain("110");
      }
    }
  });

  it("the gate stayed at 55, so no drive this rung credited is refused now", () => {
    // The false-refusal guard, stated where the repair is. The card got
    // STRICTER; the grader did not move, so a student who obeys the new sentence
    // clears the old gate with five km/h to spare and nobody who passed before
    // fails now.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sp-curve")!;
    const authored = spec.success.find((o) => o.id === "sc-spcv-curve")!;
    expect((authored.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(55);
    for (const level of rungsOf(spec)) {
      const o = compileScenario(spec, level).objectives.find((x) => x.id === "sc-spcv-curve")!;
      const gate = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh!;
      expect(gate, `L${level}: the gate must never fall below the number the card prints`).toBeGreaterThanOrEqual(50);
    }
  });

  it("and the LIVE session path prints both figures — not just the pure function", () => {
    /*
     * THE ADDRESS, CLOSED AT THE DOOR THE PRODUCT ACTUALLY USES. Raised by the
     * verifier of this lane: every assertion above calls
     * `advisorPromptForObjective`, and that function has NO non-test caller in
     * the tree — the shell calls `advisorPromptForSession`
     * (`LessonPlayShell.tsx:838`), which reaches it by one internal hop. So the
     * whole census above could stay green while a future lane deleted the hop
     * and stranded `titleCapKmh` on the glass. That is this programme's own
     * signature failure — a repair mutation-proved in a place nothing calls —
     * and one assertion is the whole cost of not repeating it.
     *
     * BOTH DIRECTIONS in one test, because they are the same repair: the CURVE
     * proves a ceiling narrowed to the табела's 50, the MOTORWAY proves a target
     * did NOT become a ceiling (the card must still publish the gate's 140 while
     * carrying the taught band). The session is built the way
     * `advisor-authored-cap.test.ts` builds its live check — driving phase, the
     * objective index pointed at the row under test — because
     * `advisorPromptForSession` digs the authored cap out of the RAW compiled
     * objective and a shortcut past that lookup would hide the very break this
     * asserts against.
     */
    for (const [scenarioId, objectiveId, expected] of [
      ["sc-sp-curve", "sc-spcv-curve", "Мини средата на завоя с препоръчителните 50 км/ч — дръж под 50 км/ч"],
      [
        "sc-mw-min-speed",
        "sc-mwms-join",
        "Влез в ритъма на потока (около 120–130 км/ч) в дясната лента за движение — дръж под 140 км/ч",
      ],
    ] as const) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === scenarioId)!;
      const lesson = compileScenario(spec, 1);
      const idx = lesson.objectives.findIndex((o) => o.id === objectiveId);
      expect(idx, `${scenarioId}: no objective ${objectiveId}`).toBeGreaterThanOrEqual(0);
      const session: LessonSessionState = {
        ...createLessonSession(lesson),
        phase: "driving",
        currentObjectiveIndex: idx,
      };
      expect(advisorPromptForSession(session)?.textBg, `${scenarioId}/${objectiveId}`).toBe(expected);
    }
  });
});
