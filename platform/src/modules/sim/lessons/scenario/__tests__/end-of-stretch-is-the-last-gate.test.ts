import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioSpec } from "../types";

/**
 * «КРАЯ НА ОТСЕЧКАТА» IS A PLACE, AND IT IS THE LAST ONE.
 *
 * sc-fo-motorway-gap:d18105c7 (critical) — „«the reckless driver gets the route
 * credit the careful driver is denied» — the objective tracks something other
 * than driving well."
 *
 * THE FIRST HALF IS REFUTED BY THE ROW'S OWN LEGS and is recorded here so the
 * row is not re-opened on it: `.audit-frames/sweep161/sc-fo-motorway-gap/`
 * mobile-right topped **19 км/ч with 25 full stops** and its log ends „ended
 * naturally: false (forced via «Прекрати урока»)" at ~210 s, while mobile-wrong
 * ended naturally and ticked the gate at 2:11. The careful leg was cut off
 * short of the disc; it was not refused by it. Neither leg was rewarded —
 * mobile-wrong booked 94 наказателни точки and НЕИЗДЪРЖАН.
 *
 * THE SECOND HALF WAS TRUE AND IS WHAT THIS FILE PINS. `sc-fmg-gap` was titled
 * «Стигни края на отсечката по магистралата» on a disc at y = 400 — 385 m of a
 * carriageway that runs 15 → 2585, whose own spawn document names y = 2585
 * «Контролна точка — край на отсечката» — while the drill's LAST gate stands
 * 390 m further on at y = 790 and the staged brake at y = 720 is called
 * „mid-segment" in the same file. A student who reads «стигни края» and then
 * drives another 390 m of the same отсечка has been told the wrong thing about
 * his own route, which is the student's-eye version of the row's sentence.
 *
 * THE LAW, and why it is this one rather than a coordinate: an end-of-stretch
 * claim is a claim about ORDER, and order is the one thing a catalogue can
 * check without knowing any map's geometry. A gate that says the stretch is
 * over may not be followed by another gate of the same drill.
 *
 * SCOPE — corpus-wide on purpose. 46 shipped objectives carry the phrase (it is
 * the settled convention for a finish line), so this is a law over a real
 * population and not a pin on one row; §3 proves the population is there, and
 * §2 proves the matcher would have caught the row this file is named for.
 */

const ALL: readonly ScenarioSpec[] = SCENARIO_TEMPLATES;

/** The end-of-stretch claim, in the forms the corpus actually uses:
 *  «Стигни края на отсечката», «…, без да си влизал в пелената», and the
 *  motorway's «…по магистралата». Matched on the stem so a new case ending
 *  cannot slip past — «отсечката» / «отсечка» / «отсечки» all carry it. */
const END_OF_STRETCH = /края на отсечк/i;

interface Row {
  specId: string;
  objectiveId: string;
  titleBg: string;
  index: number;
  of: number;
}

function endClaims(spec: ScenarioSpec): Row[] {
  const rows: Row[] = [];
  spec.success.forEach((o, i) => {
    if (END_OF_STRETCH.test(o.titleBg)) {
      rows.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        index: i,
        of: spec.success.length,
      });
    }
  });
  return rows;
}

const CLAIMS: Row[] = ALL.flatMap(endClaims);

// ---------------------------------------------------------------------------
// §1 — the law
// ---------------------------------------------------------------------------

describe("§1 a gate that says the stretch is over is the drill's last gate", () => {
  it("no template routes a student past its own «края на отсечката»", () => {
    const offenders = CLAIMS.filter((r) => r.index !== r.of - 1).map(
      (r) =>
        `${r.specId} / ${r.objectiveId} is objective ${r.index + 1} of ${r.of} — ` +
        `«${r.titleBg}» and then ${r.of - r.index - 1} more`,
    );
    expect(
      offenders,
      `an objective claims the stretch ends and the drill keeps going:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("sc-fmg-gap — the row's own objective — claims a checkpoint and not an end", () => {
    const spec = ALL.find((s) => s.id === "sc-fo-motorway-gap");
    expect(spec, "sc-fo-motorway-gap is shipped").toBeDefined();
    const gate = spec!.success.find((o) => o.id === "sc-fmg-gap");
    expect(gate, "sc-fmg-gap is shipped").toBeDefined();
    // It is the FIRST of two, so under §1 it may not make the claim at all.
    expect(spec!.success[0]?.id).toBe("sc-fmg-gap");
    expect(spec!.success.length).toBeGreaterThan(1);
    expect(END_OF_STRETCH.test(gate!.titleBg)).toBe(false);
    // …and the params are untouched by that repair: an 8 m disc at y = 400
    // under the posted 140, exactly as it graded before the sentence moved.
    expect(gate!.params).toEqual({
      kind: "reachZone",
      x: 0,
      y: 400,
      radiusM: 8,
      maxSpeedKmh: 140,
    });
  });
});

// ---------------------------------------------------------------------------
// §2 — the matcher has teeth (without it, §1 passes by matching nothing)
// ---------------------------------------------------------------------------

describe("§2 negative controls", () => {
  it("catches the exact string this repair removed", () => {
    expect(END_OF_STRETCH.test("Стигни края на отсечката по магистралата")).toBe(true);
    expect(END_OF_STRETCH.test("Стигни края на отсечката")).toBe(true);
    expect(END_OF_STRETCH.test("Стигни края на отсечката, без да си влизал в пелената")).toBe(true);
  });

  it("would have failed §1 on the shipped spec as it stood", () => {
    const spec = ALL.find((s) => s.id === "sc-fo-motorway-gap")!;
    const asFiled: ScenarioSpec = {
      ...spec,
      success: spec.success.map((o, i) =>
        i === 0 ? { ...o, titleBg: "Стигни края на отсечката по магистралата" } : o,
      ),
    };
    const rows = endClaims(asFiled).filter((r) => r.index !== r.of - 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.objectiveId).toBe("sc-fmg-gap");
  });

  it("does not fire on the honest neighbours that mention a stretch", () => {
    // A warning ABOUT a stretch ahead, and a stretch used as a place to stop,
    // are not claims that the drill's route is over.
    for (const honest of [
      "Вдигни крака от газта ПРЕДИ хлъзгавата отсечка",
      "Мини отсечката със съобразена за вятъра скорост",
      "Спри на легалната отсечка до бордюра",
      "Стигни контролната точка по магистралата",
    ]) {
      expect(END_OF_STRETCH.test(honest), honest).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — the population is real
// ---------------------------------------------------------------------------

describe("§3 the law is over a corpus and not over nothing", () => {
  it("the convention is widely used, so §1 is a law and not a pin", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(160);
    expect(CLAIMS.length).toBeGreaterThanOrEqual(40);
  });

  it("every claim that IS last sits on a reachZone — an arrival, not a duty", () => {
    const odd = CLAIMS.filter((r) => {
      const spec = ALL.find((s) => s.id === r.specId)!;
      return spec.success[r.index]!.params.kind !== "reachZone";
    }).map((r) => `${r.specId} / ${r.objectiveId}`);
    expect(odd).toEqual([]);
  });
});
