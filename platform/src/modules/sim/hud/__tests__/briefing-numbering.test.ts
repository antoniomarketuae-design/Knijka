import { describe, expect, it } from "vitest";

import { briefingBodyBg, briefingLineBg, briefingLineOrdinal } from "../overlayQueue";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";

/**
 * THE BRIEFING IS ONE LIST AND IT HAS TO BEGIN AT ONE — w10-4, 2026-08-24.
 *
 * THE FRAME. `.audit-frames/w10-4/frames/sc-rb-exit-signal__mobile-right/
 * 02-briefing.png`, the «ИНСТРУКЦИИ» sheet, 2556 × 1179, opened: an unnumbered
 * lead paragraph in the larger weight — «Тръгни от юг и намали преди входа — в
 * кръга има кола и тя е с предимство…» — and under it «2. Влез в реален
 * интервал…», «3. Подмини първия изход (изток) и втория (север)…», «4. Чак СЛЕД
 * като подминеш северния подход…», «5. Излез на третия изход (запад)…». The
 * filing («the numbered list starts at „2." … a student reads it as „step 1 is
 * missing"») reproduces word for word.
 *
 * IT WAS FILED AGAINST `templates-roundabout.ts` AND THAT FILE DOES NOT OWN IT.
 * The lesson authors five numbered `instructionsBg` steps and `compile.ts`
 * renumbers them 1..n; nothing in the template ever produces a list that starts
 * at two. The split happens one module out, in `hud/overlayQueue.ts`, where
 * `briefingLineBg` takes step 1 for the card's headline and `briefingBodyBg`
 * prints the remainder with their authored ordinals — so the defect belongs to
 * EVERY shipped rung of all 167 templates, and closing it on the roundabout
 * would have left the other 166 exactly as photographed.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS THE WHOLE CATALOGUE AND NOT THE ONE FRAME.
 * The rendered card is `briefingLineBg` followed by the lines of
 * `briefingBodyBg` (LessonPlayShell.tsx builds the `briefing` overlay item from
 * exactly those two calls, which is the only reason a pure test can stand in
 * for the glass). Read the ordinal off each rendered row and the sequence must
 * be 1, 2, 3 … with nothing skipped — the property a reader is checking when he
 * concludes a step is missing.
 *
 * THE BODY'S OWN CONTRACT IS UNTOUCHED, on purpose. `briefing-no-echo.test.ts`
 * pins that the body starts at the authored SECOND step and is never
 * renumbered from 1; that assertion still passes, because the row that changed
 * is the one that had no number at all.
 */

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

interface Rung {
  readonly id: string;
  readonly steps: readonly { n: number; textBg: string }[];
}

/** Every compiled rung that ships, with its authored briefing. */
const RUNGS: readonly Rung[] = SCENARIO_TEMPLATES.flatMap((spec) =>
  LEVELS.filter((level) => spec.levels.some((l) => l.level === level)).map((level) => ({
    id: `${spec.id}@L${level}`,
    steps: compileScenario(spec, level).briefingBg ?? [],
  })),
).filter((r) => r.steps.length > 0);

/** The rows the card paints, top to bottom — headline first, then the sheet. */
function renderedRows(steps: Rung["steps"]): string[] {
  const body = briefingBodyBg(steps);
  // THE ROW AS THE SHEET PAINTS IT — 2026-08-25.
  //
  // This was briefingLineBg(steps) alone, when the lane that wrote this file
  // put the ordinal INSIDE that string. It does not live there: three characters
  // come out of a 180 px peek window, and a verifier measured the cost over 663
  // rungs as 29 rungs to a worse band, 12 to ZERO body and 1,190 body characters
  // lost — the GRADED step among them, including the child-safety line on
  // sc-crossing-child-ball. The number is carried as DATA (briefingLineOrdinal)
  // and painted by SimOverlay in its own span, so the row a student reads is the
  // two composed — which is what this file asserts, unchanged in intent.
  //
  // ── ONE AUTHORITY, NOT TWO — 2026-08-26. This read `ord === null || !(ord > 0)`,
  //    i.e. this file carried its own idea of „usable" while the module handed
  //    back `steps[0].n` raw and the sheet admitted it on `typeof === "number"`.
  //    Three answers to one question, and the LOOSEST of them was the one on the
  //    glass — «NaN. » and «0. » would have painted. `briefingLineOrdinal` is now
  //    null-or-usable (`isUsableLineOrdinal`), so the model here is the plain
  //    null check, and a regression that lets a non-position through fails the
  //    two corpus rows below instead of being absorbed by a second guard.
  const ord = briefingLineOrdinal(steps);
  const head = ord === null ? briefingLineBg(steps) : ord + ". " + briefingLineBg(steps);
  return [head, ...(body === null ? [] : body.split(String.fromCharCode(10)))].filter(
    (s) => s.length > 0,
  );
}

/** The leading „N. " ordinal of a rendered row, or null if it carries none. */
function ordinalOf(row: string): number | null {
  const m = /^(\d+)\.\s/.exec(row);
  return m === null ? null : Number(m[1]);
}

describe("the briefing card reads as one list, and the list starts at 1", () => {
  it("has a corpus to assert against at all", () => {
    // A sweep over an empty list is the instrument that vouched for a screen it
    // never looked at. 167 templates × the rungs each of them authors.
    expect(RUNGS.length).toBeGreaterThan(600);
  });

  it("every rendered row carries its ordinal — the headline included", () => {
    const bare: string[] = [];
    for (const rung of RUNGS) {
      for (const row of renderedRows(rung.steps)) {
        if (ordinalOf(row) === null) bare.push(`${rung.id}: «${row.slice(0, 48)}…»`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("…and they run 1, 2, 3 … with nothing skipped, on every shipped rung", () => {
    // THE READER'S OWN TEST. „Step 1 is missing" is a conclusion drawn from the
    // sequence, so the sequence is what is asserted — not the presence of a
    // prefix on one row, which a later refactor could satisfy while still
    // opening at two.
    const broken: string[] = [];
    for (const rung of RUNGS) {
      const ordinals = renderedRows(rung.steps).map(ordinalOf);
      const expected = ordinals.map((_, i) => i + 1);
      if (JSON.stringify(ordinals) !== JSON.stringify(expected)) {
        broken.push(`${rung.id}: ${JSON.stringify(ordinals)}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("the roundabout frame's own card, top row for top row", () => {
    // SOURCE-PINNED to the lesson the finding was filed on, so a catalogue-wide
    // census can never go green by measuring a card this frame does not show.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-rb-exit-signal");
    expect(spec, "sc-rb-exit-signal left the registry").toBeDefined();
    const steps = compileScenario(spec!, 1).briefingBg ?? [];
    const rows = renderedRows(steps);
    expect(rows.length).toBe(5);
    expect(rows[0]!.startsWith("1. ")).toBe(true);
    expect(rows[1]!.startsWith("2. ")).toBe(true);
    expect(rows[4]!.startsWith("5. ")).toBe(true);
    // The words on the frame, still where the frame has them.
    expect(rows[0]).toContain("Тръгни от юг");
    expect(rows[1]).toContain("Влез в реален интервал");
  });

  it("…and the derivation the frame photographed still fails it, so this has teeth", () => {
    // The exact expression that shipped until 2026-08-24. A test that cannot be
    // shown to convict is the reassuring instrument this programme keeps
    // finding; this is the mutation, kept beside the assertion it proves.
    const unnumberedLine = (steps: Rung["steps"]) => (steps.length > 0 ? steps[0]!.textBg : "");
    const wouldOpenAtTwo = RUNGS.filter((r) => {
      const body = briefingBodyBg(r.steps);
      if (body === null) return false;
      const rows = [unnumberedLine(r.steps), ...body.split("\n")].filter((s) => s.length > 0);
      const ordinals = rows.map(ordinalOf);
      return JSON.stringify(ordinals) !== JSON.stringify(ordinals.map((_, i) => i + 1));
    });
    expect(wouldOpenAtTwo.length).toBe(RUNGS.length);
  });

  it("a hand-built LessonSpec with no usable ordinal is printed bare, not under an invented one", () => {
    // The `null`-body branch's twin: curriculum specs and test doubles are not
    // compiled by `scenario/compile.ts` and may carry anything. Inventing a „1."
    // over a step whose author never numbered it would be this file writing
    // copy, which is the one thing the HUD may not do (ADR-002).
    expect(briefingLineBg([{ n: 0, textBg: "Само това." }])).toBe("Само това.");
    expect(briefingLineBg([{ n: Number.NaN, textBg: "Само това." }])).toBe("Само това.");
    expect(briefingLineBg([])).toBe("");

    // ── …AND UNTIL 2026-08-26 THAT WAS THE WHOLE OF IT, WHICH IS TO SAY IT WAS
    //    VACUOUS. Every assertion above reads `briefingLineBg`, and that
    //    function has never carried an ordinal in any version of this file — the
    //    number lives in `briefingLineOrdinal` and is painted by `SimOverlay` in
    //    its own span. So the case NAMED „no usable ordinal is printed bare"
    //    could not fail whatever the ordinal did, and what the ordinal actually
    //    did was hand `steps[0].n` back raw to a surface guarding on
    //    `typeof === "number"` — a test that admits `NaN` is a number, and a
    //    sheet that would have painted «NaN. Само това.» in the headline face
    //    over a body still opening at «2.».
    //
    //    THE ASSERTIONS THE NAME WAS ALWAYS MAKING:
    expect(briefingLineOrdinal([{ n: 0, textBg: "Само това." }])).toBeNull();
    expect(briefingLineOrdinal([{ n: Number.NaN, textBg: "Само това." }])).toBeNull();
    expect(briefingLineOrdinal([{ n: -1, textBg: "Само това." }])).toBeNull();
    expect(briefingLineOrdinal([{ n: 1.5, textBg: "Само това." }])).toBeNull();
    expect(briefingLineOrdinal([{ n: Number.POSITIVE_INFINITY, textBg: "Само това." }])).toBeNull();
    expect(briefingLineOrdinal([])).toBeNull();
    // …and a REAL position still comes through, taken from the step and not
    // from a literal 1 — the contract `briefingLineOrdinal`'s docstring keeps.
    expect(briefingLineOrdinal([{ n: 1, textBg: "Първо." }])).toBe(1);
    expect(briefingLineOrdinal([{ n: 3, textBg: "Трето." }])).toBe(3);
  });

  it("the row a bare ordinal produces is the line itself, with no prefix at all", () => {
    // The composed row, not the pieces: this is what the sheet paints, and it
    // is the half a reader checks. `renderedRows` is the model of that
    // composition (see its own note), so this is the mutation for the branch —
    // if `briefingLineOrdinal` went back to returning `steps[0].n` raw, the
    // first row here would open «0. » and this fails.
    const bare = renderedRows([
      { n: 0, textBg: "Само това." },
      { n: 2, textBg: "И това." },
    ]);
    expect(bare[0]).toBe("Само това.");
    expect(bare[0]!.startsWith("0")).toBe(false);
    expect(bare[0]!.includes("NaN")).toBe(false);
    // The body is untouched by any of this — it keeps the authored numbering,
    // which is `briefing-no-echo.test.ts`'s contract and not this file's.
    expect(bare[1]).toBe("2. И това.");
  });
});
