/**
 * PE2 — the sweep161 COPY-TRUTH battery for `templates-pe2.ts`.
 *
 * Three BROKEN rows of `.audit-frames/sweep161` land on this file, and all
 * three are the same species: a sentence the product SHOWS the student that is
 * not true of the run he is in. None of them is a grading bug, which is
 * precisely why nothing in the suite caught them — every gate, detector and bot
 * drive was green while the glass said something else.
 *
 *   C1  RUNG LEAK      sc-pe-parked-row-scan/pc-right/01-arrival and
 *                      sc-pe-school-patrol — «(ниво 5)» inside a step of
 *                      `instructionsBg`, a field compileScenario copies BYTE FOR
 *                      BYTE onto all five rungs. False on four of them; on the
 *                      fifth the compiler has already printed the rung itself.
 *   C2  DAYLIGHT LIE   the same step graded «в здрач и нощем» on a Ниво 1 run
 *                      photographed under a blue sky — a condition the world
 *                      cannot exercise.
 *   C3  PRESENT FACT   sc-pe-zone-living/pc-right/04-t090s..t100s — ЗАДАЧА 2/5
 *                      «Спри пред ХОРАТА на платното» over three frames with
 *                      both walkers still behind the railing on the far
 *                      footway; they stepped onto the tarmac at t105s.
 *
 * EVERY RULE HERE HAS TEETH IN BOTH DIRECTIONS, because a matcher that quietly
 * stops matching turns a census vacuously green (the lesson `stop-claim-gates`
 * paid for). Each matcher is asserted against the exact string it retired AND
 * against the string that replaced it, and each rule is asserted to SPARE a
 * shipped row that legitimately uses the same words.
 *
 * SCOPE. `SCENARIO_TEMPLATES_PE2` only. `templates-vru2.ts` carries three more
 * «(ниво 5)» steps (sc-vu-blindspot-moto, sc-vu-door-zone, sc-vu-bikelane-turn)
 * and is another lane's file — reported, not touched, and deliberately outside
 * this census so this battery cannot turn that lane red.
 */

import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec } from "../../../contracts";
import { parseObjectiveParams } from "../../objectives";
import { compileScenario } from "../compile";
import { SC_PE_ZONE_LIVING, SCENARIO_TEMPLATES_PE2 } from "../templates-pe2";
import type { ScenarioLevel } from "../types";

const RUNGS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// C1 — the rung number is the COMPILER's to say, never a step's
// ---------------------------------------------------------------------------

/** «ниво 5», «Ниво 1 — …» — a rung named in words. */
const RUNG_LEAK = /ниво\s*\d/iu;

describe("C1 — no instruction step names a level rung", () => {
  it("the matcher has teeth: it catches the retired parentheticals and spares their replacements", () => {
    expect(RUNG_LEAK.test("в здрач и нощем (ниво 5) късите светлини се включват ПРЕДИ")).toBe(true);
    expect(RUNG_LEAK.test("Вали ли (ниво 5), включи късите светлини още преди да тръгнеш")).toBe(
      true,
    );
    expect(RUNG_LEAK.test("стъмни ли се, късите се включват ПРЕДИ да ти потрябват")).toBe(false);
    expect(RUNG_LEAK.test("Вали ли, включи късите светлини още преди да тръгнеш")).toBe(false);
  });

  it("THE REASON THE RULE EXISTS: instructionsBg is rung-invariant by construction", () => {
    // If the compiler swapped copy per rung, «(ниво 5)» would merely be
    // redundant on one rung instead of false on four — so this is the fact the
    // whole guard rests on, and it is asserted rather than assumed.
    for (const spec of SCENARIO_TEMPLATES_PE2) {
      const authored = spec.instructionsBg.map((s) => s.textBg);
      for (const level of RUNGS) {
        const shown = (compileScenario(spec, level).briefingBg ?? []).map((s) => s.textBg);
        // The only rung-varying line is the complication step the compiler
        // PREPENDS, so the authored steps are always the tail, unchanged.
        expect(shown.slice(shown.length - authored.length), `${spec.id}@L${level}`).toEqual(
          authored,
        );
      }
    }
  });

  it("…and the compiler already owns the job — some rung of this family says «Ниво N» itself", () => {
    // The load-bearing half of C1: the parenthetical was not just wrong on four
    // rungs, it was REDUNDANT on the fifth. If this ever goes false the
    // complication kit has stopped announcing the rung and the guard above
    // would be forbidding the only place the rung is ever named.
    const compilerSaysRung = SCENARIO_TEMPLATES_PE2.some((spec) =>
      RUNGS.some((level) =>
        (compileScenario(spec, level).briefingBg ?? []).some((s) => RUNG_LEAK.test(s.textBg)),
      ),
    );
    expect(compilerSaysRung).toBe(true);
  });

  it("the census: not one authored step in templates-pe2.ts names a rung", () => {
    const offenders = SCENARIO_TEMPLATES_PE2.flatMap((spec) =>
      spec.instructionsBg
        .filter((s) => RUNG_LEAK.test(s.textBg))
        .map((s) => `${spec.id} step ${s.n} — "${s.textBg}"`),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C2 — darkness may be ASSERTED only by a template that is dark on every rung
// ---------------------------------------------------------------------------

/**
 * Darkness stated as a fact about THIS run. The conditional forms («стъмни ли
 * се», «вали ли») are deliberately outside it: they are true whatever the rung
 * serves, which is exactly why they are the repair.
 */
const DARK_ASSERTION = /в здрач|нощем|по тъмно|нощ е|тъмно е/iu;

describe("C2 — a step asserts darkness only where the world is dark on every rung", () => {
  it("the matcher has teeth in both directions", () => {
    expect(DARK_ASSERTION.test("в здрач и нощем късите светлини се включват ПРЕДИ")).toBe(true);
    expect(DARK_ASSERTION.test("Нощ е и улицата е неосветена.")).toBe(true);
    expect(DARK_ASSERTION.test("стъмни ли се, късите се включват ПРЕДИ да ти потрябват")).toBe(
      false,
    );
    expect(DARK_ASSERTION.test("Вали ли, включи късите светлини още преди да тръгнеш")).toBe(false);
  });

  it("the census: a daylight L1 never carries a darkness assertion", () => {
    const offenders: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PE2) {
      const l1 = compileScenario(spec, 1);
      if (l1.environment?.timeOfDay === "night") continue;
      for (const s of spec.instructionsBg) {
        if (DARK_ASSERTION.test(s.textBg)) offenders.push(`${spec.id} step ${s.n} — "${s.textBg}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("…and the rule SPARES the drill that really is dark — it is not a word ban", () => {
    // sc-pe-night-unlit is `conditions.night` template-wide, so «Нощ е и улицата
    // е неосветена» is a true sentence on all five rungs and must survive.
    const night = SCENARIO_TEMPLATES_PE2.find((s) => s.id === "sc-pe-night-unlit")!;
    expect(compileScenario(night, 1).environment?.timeOfDay).toBe("night");
    expect(night.instructionsBg.some((s) => DARK_ASSERTION.test(s.textBg))).toBe(true);
  });

  it("the repair kept the duty — the beams step is still a step, not a deletion", () => {
    // The other way this row could be "fixed": drop the sentence. That would
    // also silence lane10's G5 (no dark rung without a lights step), so this
    // states the intent locally too.
    const row = SCENARIO_TEMPLATES_PE2.find((s) => s.id === "sc-pe-parked-row-scan")!;
    const lit = row.instructionsBg.filter(
      (s) => /светлин/u.test(s.textBg) && /включ|провери/u.test(s.textBg),
    );
    expect(lit.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// C3 — sc-pzl-halt: a STANDING duty, not a present fact
// ---------------------------------------------------------------------------

/**
 * People named as ALREADY BEING on the carriageway. The distinction is the
 * definite noun + the location, exactly the shape the frame caught: «хората на
 * платното» asserts they are there NOW. A conditional («всеки, стъпил на
 * платното») names the same duty without asserting the moment, and a title that
 * names a PLACE («мястото на изскачане») asserts nothing at all.
 */
const PRESENT_ACTOR =
  /(?:^|[^\p{L}])(?:хората|децата|детето|пешеходеца|пешеходците)\s+(?:на|върху)\s+(?:платното|пътеката|лентата)(?![\p{L}])/iu;

describe("C3 — the жилищна-зона halt chip is issued long before anyone is on the road", () => {
  const lesson = compileScenario(SC_PE_ZONE_LIVING, 1);
  const zone = lesson.objectives.find((o) => o.id === "sc-pzl-zone")!;
  const halt = lesson.objectives.find((o) => o.id === "sc-pzl-halt")!;
  const zoneP = parseObjectiveParams(zone);
  const haltP = parseObjectiveParams(halt);
  const walker = SC_PE_ZONE_LIVING.staged!.find(
    (s) => s.id === "sc-pzl-walker-w",
  ) as PedestrianDartOutSpec;
  /** orchestrator/runners.ts `stage()`: triggerDistM ± 3 m, seeded. */
  const TRIGGER_JITTER_M = 3;

  it("THE MEASUREMENT: ~46 m of road in which a definite «хората» names nobody", () => {
    if (zoneP.kind !== "reachZone" || haltP.kind !== "reachZone") throw new Error("shape");
    // Objectives are strictly sequential, so the halt chip goes live the instant
    // the zone gate ticks — at the EARLIEST that is the near edge of its disc.
    const chipLiveFromY = zoneP.y - zoneP.radiusM;
    // The walkers cannot be moving before the player is inside the trigger, and
    // the director's jitter can only make it EARLIER by 3 m.
    const walkersMoveFromY = walker.crossing.y - (walker.triggerDistM + TRIGGER_JITTER_M);
    expect(walkersMoveFromY - chipLiveFromY).toBeGreaterThan(40);
    // …and the halt mark itself sits BEYOND the release line, which is why the
    // objective's completion moment is honest even though its issue moment is
    // not: only the title can carry the gap.
    expect(haltP.y).toBeGreaterThan(walkersMoveFromY);
  });

  it("the matcher has teeth: it catches the retired title and spares the replacement", () => {
    expect(PRESENT_ACTOR.test("Спри пред хората на платното")).toBe(true);
    expect(PRESENT_ACTOR.test("Изчакай детето на пътеката")).toBe(true);
    expect(PRESENT_ACTOR.test("Спри пред всеки, стъпил на платното")).toBe(false);
    expect(PRESENT_ACTOR.test("Приближи мястото на изскачане с готовност за спиране")).toBe(false);
  });

  it("no PE2 gate asserts that another road user is ALREADY on the road", () => {
    const offenders = SCENARIO_TEMPLATES_PE2.flatMap((spec) =>
      spec.success
        .filter((o) => PRESENT_ACTOR.test(o.titleBg))
        .map((o) => `${spec.id}/${o.id} — "${o.titleBg}"`),
    );
    expect(offenders).toEqual([]);
  });

  it("…and the duty was rewritten, not dropped: it still DEMANDS a stop, with a halt cap", () => {
    // The failure mode of every title repair: soften the sentence until it
    // certifies nothing. `REACH_ZONE_HALT_CAP_KMH` is 8 (objectives.ts) — a cap
    // at or under it is what makes «спри» a demand rather than a description.
    if (haltP.kind !== "reachZone") throw new Error("shape");
    expect(/(?:^|[^\p{L}])[Сс]при(?![\p{L}])/u.test(halt.titleBg)).toBe(true);
    expect(haltP.maxSpeedKmh).toBeLessThanOrEqual(8);
  });
});
